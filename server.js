const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms data
const rooms = {}; // { roomCode: { players: [{id, name}] } }

// Generate random 6-digit code
function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

// API to create a new room
app.post('/api/create-room', (req, res) => {
    let code = generateRoomCode();
    while (rooms[code]) {
        code = generateRoomCode(); // avoid duplicates
    }

    rooms[code] = { players: [] };
    res.json({ ok: true, code });
});

// API to join a room (optional for initial fetch)
app.post('/api/join-room', (req, res) => {
    const { code, playerName } = req.body;
    if (!rooms[code]) {
        return res.status(404).json({ ok: false, error: 'Room not found.' });
    }
    res.json({ ok: true, code });
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ code, playerName }) => {
        if (!rooms[code]) {
            rooms[code] = { players: [] };
        }

        // Avoid duplicates
        if (!rooms[code].players.find(p => p.id === socket.id)) {
            rooms[code].players.push({ id: socket.id, name: playerName });
        }

        socket.join(code);

        // Broadcast updated players list to all clients in the room
        io.to(code).emit('updatePlayers', rooms[code].players);
    });

    socket.on('disconnect', () => {
        // Remove player from any room they were in
        for (const code in rooms) {
            const room = rooms[code];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit('updatePlayers', room.players);
            }
        }
    });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
