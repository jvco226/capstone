# Capstone Trivia Backend

Online trivia game (mix of Kahoot + Trivial Pursuit).

This repo currently includes:

- `server.js` — WebSocket + HTTP server for private rooms with full game flow
- **PostgreSQL setup** for user accounts and questions:
  - Dockerized Postgres (`docker-compose.yml`)
  - `sql/init.sql` creates:
    - `game_auth` database (via Docker env)
    - `users` table: (`id`, `username`, `password_hash`)
    - `questions` table: (`id`, `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_answer`, `category`, `difficulty`)
    - `game_app_user` with limited rights
  - `db.js` — shared Node helper for connecting to the DB
  - `verify-db.js` — script to verify read/write on `users` table
- **Game Features Implemented:**
  - ✅ User authentication (register/login)
  - ✅ Room creation and joining
  - ✅ Lobby with player list
  - ✅ Game flow (start game, questions, answers, results)
  - ✅ Scoring system
  - ✅ Question database with 15 sample questions
  - ✅ Real-time multiplayer gameplay via Socket.IO
  - ✅ Public lobbies

## Local setup

1. **Prerequisites:** Ensure you have the following installed:
   - Node.js
   - PostgreSQL (or Docker Desktop)
   - A terminal

2. **Node.js** - to check if it's installed, run:
    ```bash
    node -v
    ```
    If not installed, install the latest version from https://nodejs.org
   
3. **Install dependencies** - In the project folder, run the following command to install the required packages listed in package.json:
   ```bash
   npm install
   ```

4. Create a .env file in the root of the project:
   ```bash
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=game_auth
   DB_USER=game_app_user
   DB_PASSWORD=game_app_password
   DB_SSL=false
   PORT=3000
   ```  
   
5. **PostgreSQL** needs to be installed and a database setup must be done. Install from https://www.postgresql.org/download/
   Open your terminal and enter the PostgreSQL shell
   ```bash
   psql postgres
   ```
   Once inside the postgres=# shell, create a database:
   ```bash
   CREATE DATABASE game_auth;
   ```
   Then, create a user and password. These will match with your .env:
   ```bash
   CREATE USER game_app_user WITH PASSWORD 'game_app_password';
   GRANT ALL PRIVILEGES ON DATABASE game_auth TO game_app_user;
   ```
   **Exit the Shell** Type the following to leave the PostgreSQL interface:
   ```bash
   \q
   ```
   Run the SQL initialization script to create tables and sample questions:
   ```bash
   psql -U game_app_user -d game_auth -f sql/init.sql
   ```
   **Alternatively**: if using docker, simply run:
   ```bash
   docker-compose up -d
   # Then connect and run the SQL file
   ```
   **Verify Database Connection:** To ensure your .env file is correct and the database is reachable, run the verification script:
   ```bash
   npm run verify-db
   ```

8. **Run the server:**
   ```bash
   npm start
   ```
   Now, in any broswer, navigate to:
   ```bash
   http://localhost:3000
   ```
   
