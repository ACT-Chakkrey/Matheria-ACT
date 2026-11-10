# 🎮 Matheria: Number Heroes – Boss Rush Edition (v2.0 MVP)

A lightweight, high-performance, fully-responsive retro math RPG. Features single-player quest/boss progression, real-time cooperative multiplayer boss battles, social friends/messaging, global leaderboards, and persistent ACID storage powered by native **SQLite**.

---

## ⚡ Key Highlights & Architecture

- **Zero-Dependency SQLite Backend**: Uses Node 22+/26+ built-in `node:sqlite` (`DatabaseSync`) in Write-Ahead Logging (WAL) mode. Zero `node_modules` overhead, zero compilation, persistent and resilient against crashes.
- **True Real-Time Multiplayer (1–4 Players)**: WebSocket co-op engine with ping/pong heartbeats, room lobbies with 4-letter codes, synchronized boss health, damage multipliers, and real-time pearl dodging QTE.
- **Universal Mobile & Cross-Screen Responsiveness**: Fully responsive from small phones (375px/390px) to tablets and desktop screens. Includes an on-screen virtual numeric keypad for rapid math input on touch devices.
- **Decoupled & Vercel-Ready**: 
  - Frontend: 100% vanilla HTML5/CSS3/JavaScript. Can be deployed to Vercel instantly with `vercel.json`.
  - Backend: Production-ready Node server for REST and WebSockets.
  - Client auto-detects `location.origin` or reads `window.ENV_CONFIG.API_BASE` for remote backend connections.

---

## 🚀 Quick Start (Local Run)

```bash
# 1. Navigate to directory
cd Matheria.V2

# 2. Run the server (Requires Node.js >= 22.5.0)
npm start

# 3. Open in browser
http://localhost:3000
```

To run in development watch mode:
```bash
npm run dev
```

---

## 🧪 Running the Test Suite

We provide automated test suites covering the database, REST API, and real-time multiplayer:

```bash
# Test SQLite database & migrations
node test/test-db.js

# Test REST API endpoints & Cloud Saves
node -e '
const { spawn } = require("child_process");
const server = spawn("node", ["server.js"], { stdio: "inherit" });
setTimeout(() => {
  const test = spawn("node", ["test/test-api.js"], { stdio: "inherit" });
  test.on("exit", code => { server.kill(); process.exit(code); });
}, 1000);'

# Test WebSocket real-time multiplayer co-op room
node -e '
const { spawn } = require("child_process");
const server = spawn("node", ["server.js"], { stdio: "inherit" });
setTimeout(() => {
  const test = spawn("node", ["test/test-ws.js"], { stdio: "inherit" });
  test.on("exit", code => { server.kill(); process.exit(code); });
}, 1000);'
```

---

## ☁️ Vercel Deployment Guide

### Option 1: Static Frontend on Vercel + Backend on Node Host (Recommended)
1. Push the `public/` directory or project to Vercel (using the included `vercel.json`).
2. Deploy the Node server (`server.js`) to any Node host (Railway, Render, Fly.io, or VPS).
3. In `public/index.html` (or `window.ENV_CONFIG`), configure:
   ```html
   <script>
     window.ENV_CONFIG = { API_BASE: "https://your-backend.domain" };
   </script>
   ```

### Option 2: Full-Stack Container / VPS
Run `npm start` directly on any cloud VM or container. Both the static frontend and the SQLite backend are served on port `3000`.

---

## 📂 Project Structure

```
Matheria.V2/
├── db/
│   ├── database.js          # SQLite DAO, schema, prepared statements
│   └── migrate.js           # Automated JSON -> SQLite migration tool
├── data/
│   ├── matheria.db          # SQLite persistent database (WAL mode)
│   ├── users.json           # Legacy data source (auto-migrated)
│   └── secret.txt           # HMAC session secret
├── public/
│   ├── css/
│   │   └── responsive.css   # Universal responsive layouts & touch keypad styles
│   ├── js/
│   │   └── keypad.js        # Mobile on-screen numeric keypad component
│   └── index.html           # Main game application
├── test/
│   ├── test-db.js           # Database test suite
│   ├── test-api.js          # HTTP REST API test suite
│   └── test-ws.js           # WebSocket multiplayer test suite
├── package.json             # NPM package scripts & configuration
├── vercel.json              # Vercel deployment configuration
├── .env.example             # Example environment variables
└── README.md                # Documentation
```
