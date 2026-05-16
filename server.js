// ============================================================
//  NIE-Vault — Phase 1
//  server.js  (Entry point)
//  Run: node server.js
// ============================================================

const express = require('express');
const session = require('express-session');
const path    = require('path');
const http    = require('http');
const db      = require('./db');
const { initWebSocket } = require('./ws');

const authRoutes  = require('./routes/auth');
const itemRoutes  = require('./routes/items');
const claimRoutes = require('./routes/claims');
const notificationRoutes = require('./routes/notifications');

const app = express();

// ── WebSocket Setup ──────────────────────────────────────────
const server = http.createServer(app);
const io = initWebSocket(server);

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'change-this-to-a-long-random-string',  // replace before submission
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }  // 1 day
}));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/items',  itemRoutes(io));
app.use('/api/claims', claimRoutes(io));
app.use('/api/notifications', notificationRoutes());

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Graceful error handling for common startup errors
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the process using it or set PORT to a different value.`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));