// server.js
// Multiplayer Trivia Server + PostgreSQL user authentication
//
// Run: node server.js
// Requirements: express, ws, cors, pg, dotenv

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { pool, getUserByUsername } = require('./db'); // PostgreSQL helpers

const app = express();
app.use(express.json());
app.use(cors());

// Config
const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_ROOM_CREATION_ATTEMPTS = 5;
const DEFAULT_MAX_PLAYERS = 8;

// In-memory room storage
const rooms = new Map();

// --- USER AUTH ROUTES ---

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ ok: false, error: 'missing_fields' });

    // Simple password hash placeholder (replace with bcrypt in production)
    const password_hash = `hash_${password}`;

    // Try to insert new user
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username`,
      [username, password_hash]
    );

    if (!rows.length)
      return res.status(409).json({ ok: false, error: 'user_exists' });

    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ ok: false, error: 'missing_fields' });

    const user = await getUserByUsername(username);
    if (!user)
      return res.status(404).json({ ok: false, error: 'user_not_found' });

    // Compare passwords (replace with bcrypt compare in production)
    if (user.password_hash !== `hash_${password}`)
      return res.status(401).json({ ok: false, error: 'invalid_password' });

    res.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// --- ROOM API ROUTES ---

function random6Digit() {
  const n = Math.floor(Math.random() * 1000000);
  return n.toString().padStart(ROOM_CODE_LENGTH, '0');
}

function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < MAX_ROOM_CREATION_ATTEMPTS; ++attempt) {
    const code = random6Digit();
    if (!rooms.has(code)) return code;
  }
  for (let i = 0; i < 1000000; ++i) {
    const code = i.toString().padStart(ROOM_CODE_LENGTH, '0');
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to generate unique room code');
}

// Periodic cleanup of expired rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.expiresAt <= now) {
      if (room.players) {
        for (const p of room.players) {
          if (p.socket && p.socket.readyState === WebSocket.OPEN) {
            try {
              p.socket.send(JSON.stringify({ type: 'room_expired' }));
              p.socket.close();
            } catch (e) {}
          }
        }
      }
      rooms.delete(code);
      console.log(`Cleaned up expired room ${code}`);
    }
  }
}, 60 * 1000);

// Create room
app.post('/api/create-room', (req, res) => {
  try {
    const maxPlayers = Number(req.body?.maxPlayers) || DEFAULT_MAX_PLAYERS;
    const hostName = String(req.body?.hostName || 'Host');
    const targetPoints = Number(req.body?.targetPoints) || 1000;

    const code = generateUniqueRoomCode();
    const now = Date.now();
    const room = {
      id: `${code}-${now}`,
      code,
      hostName,
      players: [],
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      maxPlayers,
      targetPoints,
      isPublic: false,
    };
    rooms.set(code, room);

    console.log(`Created private room ${code}`);

    res.json({
      ok: true,
      code,
      roomId: room.id,
      expiresAt: room.expiresAt,
      maxPlayers: room.maxPlayers,
      targetPoints: room.targetPoints,
    });
  } catch (err) {
    console.error('create-room error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Join room
app.post('/api/join-room', (req, res) => {
  try {
    const code = String(req.body?.code || '').padStart(ROOM_CODE_LENGTH, '0');
    const playerName = String(req.body?.playerName || 'Guest');

    const room = rooms.get(code);
    if (!room) return res.status(404).json({ ok: false, error: 'room_not_found' });
    if (room.players.length >= room.maxPlayers)
      return res.status(400).json({ ok: false, error: 'room_full' });

    res.json({
      ok: true,
      code: room.code,
      roomId: room.id,
      maxPlayers: room.maxPlayers,
      currentPlayers: room.players.length,
    });
  } catch (err) {
    console.error('join-room error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Get room info
app.get('/api/room/:code', (req, res) => {
  const code = String(req.params.code || '').padStart(ROOM_CODE_LENGTH, '0');
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ ok: false, error: 'room_not_found' });
  res.json({
    ok: true,
    code: room.code,
    roomId: room.id,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.map(p => ({ id: p.id, name: p.name })),
    isPublic: room.isPublic,
    targetPoints: room.targetPoints,
  });
});

// --- WEBSOCKET SETUP ---

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
let nextPlayerId = 1;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.meta = { playerId: null, playerName: null, roomCode: null };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid_json' }));
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').padStart(ROOM_CODE_LENGTH, '0');
      const name = String(msg.name || `Player${nextPlayerId}`);
      const room = rooms.get(code);
      if (!room) return ws.send(JSON.stringify({ type: 'error', message: 'room_not_found' }));
      if (room.players.length >= room.maxPlayers)
        return ws.send(JSON.stringify({ type: 'room_full' }));

      const player = { id: nextPlayerId++, name, socket: ws, joinedAt: Date.now() };
      room.players.push(player);
      ws.meta = { playerId: player.id, playerName: name, roomCode: code };

      ws.send(JSON.stringify({
        type: 'joined',
        playerId: player.id,
        code: room.code,
        roomId: room.id,
        players: room.players.map(p => ({ id: p.id, name: p.name })),
        maxPlayers: room.maxPlayers,
        targetPoints: room.targetPoints
      }));

      broadcastToRoom(code, { type: 'player_joined', player: { id: player.id, name: player.name } }, ws);
      console.log(`Player ${player.name} joined room ${code}`);
      return;
    }

    const code = ws.meta.roomCode;
    if (!code) return ws.send(JSON.stringify({ type: 'error', message: 'not_in_room' }));

    switch (msg.type) {
      case 'chat':
        broadcastToRoom(code, {
          type: 'chat',
          from: { id: ws.meta.playerId, name: ws.meta.playerName },
          text: String(msg.text || '')
        });
        break;
      case 'start_game':
        broadcastToRoom(code, { type: 'start_game', initiatedBy: ws.meta.playerId });
        break;
      case 'submit_answer':
        broadcastToRoom(code, {
          type: 'submit_answer',
          from: ws.meta.playerId,
          choiceIndex: Number(msg.choiceIndex)
        });
        break;
      case 'pick_category':
        broadcastToRoom(code, {
          type: 'pick_category',
          by: ws.meta.playerId,
          category: String(msg.category)
        });
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'unknown_message_type' }));
    }
  });

  ws.on('close', () => {
    const code = ws.meta?.roomCode;
    const pid = ws.meta?.playerId;
    if (code && pid) removePlayerFromRoom(code, pid);
  });

  ws.on('error', (err) => console.warn('ws error', err));
});

function broadcastToRoom(code, payload, omitSocket = null) {
  const room = rooms.get(code);
  if (!room) return;
  const raw = JSON.stringify(payload);
  for (const p of room.players) {
    if (!p.socket || p.socket.readyState !== WebSocket.OPEN) continue;
    if (omitSocket && p.socket === omitSocket) continue;
    try { p.socket.send(raw); } catch {}
  }
}

function removePlayerFromRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room) return;
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx >= 0) {
    const [removed] = room.players.splice(idx, 1);
    if (removed.socket && removed.socket.readyState === WebSocket.OPEN) {
      try { removed.socket.send(JSON.stringify({ type: 'left' })); } catch {}
    }
    broadcastToRoom(code, { type: 'player_left', playerId });
    if (room.players.length === 0) {
      rooms.delete(code);
      console.log(`Deleted empty room ${code}`);
    }
  }
}

// Ping/pong heartbeat
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, async () => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    console.log('DB connected, time:', rows[0].now);
  } catch (err) {
    console.error('Database connection failed:', err);
  }
  console.log(`Server listening on port ${PORT}`);
});