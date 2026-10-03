import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { startBot, announceRecord } from './bot.js';
import { Game } from './game.js';
import { top, records, closeDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite erstellt das fertige Frontend in client/dist
const clientDir = path.join(__dirname, '../client/dist');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: false
  }
});

app.set('trust proxy', 1);

app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

app.get('/api/config', (req, res) => {
  res.json({
    allowGuest: process.env.ALLOW_GUEST !== 'false'
  });
});

// --------------------------------------------------
// LEADERBOARD
// --------------------------------------------------

app.get('/api/leaderboard', (req, res) => {
  try {
    res.json({
      top: top(10),
      records: records()
    });
  } catch (error) {
    console.error('Leaderboard Fehler:', error);

    res.status(500).json({
      error: 'Leaderboard konnte nicht geladen werden.'
    });
  }
});

// --------------------------------------------------
// DISCORD LOGIN TOKEN
// --------------------------------------------------

app.get('/api/token', (req, res) => {
  const payload = String(req.query.payload || '');
  const signature = String(req.query.signature || '');

  if (!payload || !signature) {
    return res.status(400).json({
      error: 'Token fehlt.'
    });
  }

  const secret = process.env.IP_HASH_SECRET;

  if (!secret) {
    return res.status(500).json({
      error: 'IP_HASH_SECRET fehlt.'
    });
  }

  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return res.status(401).json({
        error: 'Ungültige Signatur.'
      });
    }

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    if (!decoded.exp || Date.now() > decoded.exp) {
      return res.status(401).json({
        error: 'Login ist abgelaufen.'
      });
    }

    return res.json({
      ok: true,
      user: decoded
    });
  } catch (error) {
    console.error('Token Fehler:', error);

    return res.status(400).json({
      error: 'Ungültiger Login.'
    });
  }
});

// --------------------------------------------------
// STATIC FRONTEND
// --------------------------------------------------

app.use(express.static(clientDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// --------------------------------------------------
// GAME
// --------------------------------------------------

const game = new Game(io, {
  announceRecord
});

// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

io.on('connection', (socket) => {
  console.log('🔌 Spieler verbunden:', socket.id);

  const ip =
    socket.handshake.headers['x-forwarded-for']
      ?.split(',')[0]
      ?.trim() ||
    socket.handshake.address ||
    'unknown';

  socket.on('identify', (data = {}) => {
    try {
      const deviceId = String(data.deviceId || '').slice(0, 200);

      const secret =
        process.env.IP_HASH_SECRET ||
        'china-chaos-development';

      const guestId = crypto
        .createHmac('sha256', secret)
        .update(`${ip}:${deviceId}`)
        .digest('hex')
        .slice(0, 24);

      socket.data.guestId = guestId;

      socket.emit('identified', {
        guestId
      });
    } catch (error) {
      console.error('Identify Fehler:', error);
    }
  });

  socket.on('createRoom', (data) => {
    try {
      game.createRoom(socket, data);
    } catch (error) {
      console.error('createRoom Fehler:', error);

      socket.emit('gameError', {
        message: 'Lobby konnte nicht erstellt werden.'
      });
    }
  });

  socket.on('joinRoom', (data) => {
    try {
      game.joinRoom(socket, data);
    } catch (error) {
      console.error('joinRoom Fehler:', error);

      socket.emit('gameError', {
        message: 'Lobby konnte nicht betreten werden.'
      });
    }
  });

  socket.on('leaveRoom', () => {
    try {
      game.leaveRoom(socket);
    } catch (error) {
      console.error('leaveRoom Fehler:', error);
    }
  });

  socket.on('ready', (data) => {
    try {
      game.setReady(socket, data);
    } catch (error) {
      console.error('Ready Fehler:', error);
    }
  });

  socket.on('difficulty', (data) => {
    try {
      game.setDifficulty(socket, data);
    } catch (error) {
      console.error('Difficulty Fehler:', error);
    }
  });

  socket.on('mode', (data) => {
    try {
      game.setMode(socket, data);
    } catch (error) {
      console.error('Mode Fehler:', error);
    }
  });

  socket.on('teamMode', (data) => {
    try {
      game.setTeamMode(socket, data);
    } catch (error) {
      console.error('TeamMode Fehler:', error);
    }
  });

  socket.on('mapVote', (data) => {
    try {
      game.voteMap(socket, data);
    } catch (error) {
      console.error('MapVote Fehler:', error);
    }
  });

  socket.on('startGame', () => {
    try {
      game.start(socket);
    } catch (error) {
      console.error('StartGame Fehler:', error);

      socket.emit('gameError', {
        message: 'Spiel konnte nicht gestartet werden.'
      });
    }
  });

  socket.on('input', (data) => {
    try {
      game.input(socket, data);
    } catch (error) {
      console.error('Input Fehler:', error);
    }
  });

  socket.on('pickup', (data) => {
    try {
      game.pickup(socket, data);
    } catch (error) {
      console.error('Pickup Fehler:', error);
    }
  });

  socket.on('attack', (data) => {
    try {
      game.attack(socket, data);
    } catch (error) {
      console.error('Attack Fehler:', error);
    }
  });

  socket.on('rematch', () => {
    try {
      game.rematch(socket);
    } catch (error) {
      console.error('Rematch Fehler:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Spieler getrennt:', socket.id);

    try {
      game.disconnect(socket);
    } catch (error) {
      console.error('Disconnect Fehler:', error);
    }
  });
});

// --------------------------------------------------
// SERVER START
// --------------------------------------------------

const port = process.env.PORT || 3000;

server.listen(port, '0.0.0.0', () => {
  console.log(`🐉 China Chaos läuft auf Port ${port}`);
});

// --------------------------------------------------
// DISCORD BOT
// --------------------------------------------------

// Antagonix:
// RUN_DISCORD_BOT ist nicht "false"
// -> Bot startet normal.
//
// Render:
// RUN_DISCORD_BOT=false
// -> Discord-Bot wird NICHT gestartet.

if (process.env.RUN_DISCORD_BOT !== 'false') {
  startBot();
}

// --------------------------------------------------
// CLEAN SHUTDOWN
// --------------------------------------------------

function shutdown() {
  console.log('China Chaos wird beendet...');

  try {
    closeDb();
  } catch (error) {
    console.error('DB Close Fehler:', error);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
