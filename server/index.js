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

// Vite Production Build
const dist = path.join(__dirname, '../client/dist');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  express.json({
    limit: '10kb'
  })
);

app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: 180
  })
);

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

app.get('/api/config', (_, res) => {
  res.json({
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guest: process.env.ALLOW_GUEST === 'true'
  });
});

// --------------------------------------------------
// LEADERBOARD
// --------------------------------------------------

app.get('/api/leaderboard', (_, res) => {
  res.json({
    top: top(10),
    records: records()
  });
});

// --------------------------------------------------
// DISCORD OAUTH TOKEN
// --------------------------------------------------

app.post('/api/token', async (req, res) => {
  const code = req.body?.code;

  if (typeof code !== 'string' || code.length > 200) {
    return res.status(400).json({
      error: 'bad code'
    });
  }

  try {
    const r = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },

        body: new URLSearchParams({
          client_id:
            process.env.DISCORD_CLIENT_ID || '',

          client_secret:
            process.env.DISCORD_CLIENT_SECRET || '',

          grant_type:
            'authorization_code',

          code
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      return res.status(400).json({
        error: 'discord rejected'
      });
    }

    res.json({
      access_token: d.access_token
    });
  } catch {
    res.status(500).json({
      error: 'token error'
    });
  }
});

// --------------------------------------------------
// FRONTEND
// --------------------------------------------------

app.use(express.static(dist));

// --------------------------------------------------
// SERVER + SOCKET.IO
// --------------------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 4096,

  cors: {
    origin: false
  }
});

// --------------------------------------------------
// ROOMS
// --------------------------------------------------

const rooms = new Map();

const alphabet =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code() {
  let c = '';

  do {
    c = '';

    for (let i = 0; i < 6; i++) {
      c +=
        alphabet[
          Math.floor(
            Math.random() * alphabet.length
          )
        ];
    }
  } while (rooms.has(c));

  return c;
}

function cleanCode(c) {
  return String(c || '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

function cleanName(n) {
  return String(n || '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
}

// --------------------------------------------------
// GUEST ID
// --------------------------------------------------

function guestId(socket, device) {
  const raw =
    socket.handshake.address || 'unknown';

  const safeDevice = String(
    device || 'device'
  )
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);

  const secret =
    process.env.IP_HASH_SECRET ||
    process.env.DISCORD_CLIENT_SECRET ||
    'china-chaos-local-dev';

  return (
    'ip-' +
    crypto
      .createHmac('sha256', secret)
      .update(raw + '|' + safeDevice)
      .digest('hex')
      .slice(0, 24)
  );
}

// --------------------------------------------------
// DISCORD USER VERIFY
// --------------------------------------------------

async function verify(token, name) {
  const r = await fetch(
    'https://discord.com/api/users/@me',
    {
      headers: {
        Authorization:
          'Bearer ' + token
      }
    }
  );

  if (!r.ok) {
    return null;
  }

  const u = await r.json();

  return {
    id: u.id,

    name:
      cleanName(name) ||
      cleanName(
        u.global_name || u.username
      ) ||
      'Spieler',

    avatar: u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
      : ''
  };
}

// --------------------------------------------------
// SIGNED /CHINA LOGIN
// --------------------------------------------------

function verifyLinkAuth(ticket, name) {
  try {
    const [payload, sig] =
      String(ticket || '').split('.');

    if (!payload || !sig) {
      return null;
    }

    const secret =
      process.env.IP_HASH_SECRET ||
      process.env.DISCORD_CLIENT_SECRET;

    if (!secret) {
      return null;
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest();

    const got =
      Buffer.from(sig, 'base64url');

    if (
      got.length !== expected.length ||
      !crypto.timingSafeEqual(
        got,
        expected
      )
    ) {
      return null;
    }

    const d = JSON.parse(
      Buffer.from(
        payload,
        'base64url'
      ).toString('utf8')
    );

    if (
      !d.id ||
      !d.exp ||
      Date.now() > d.exp
    ) {
      return null;
    }

    return {
      id: String(d.id),

      name:
        cleanName(name) ||
        cleanName(d.name) ||
        'Spieler',

      avatar: String(
        d.avatar || ''
      ).slice(0, 500)
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------
// SOCKET CONNECTION
// --------------------------------------------------

io.on('connection', socket => {
  let game = null;
  let uid = null;
  let msgs = 0;

  const bucket = setInterval(
    () => {
      msgs = 0;
    },
    1000
  );

  const ok = () => ++msgs <= 120;

  // ------------------------------------------------
  // CREATE ROOM
  // ------------------------------------------------

  socket.on('create', async d => {
    if (game) return;

    let user = null;

    try {
      if (d?.auth) {
        user = verifyLinkAuth(
          d.auth,
          d.name
        );
      } else if (d?.token) {
        user = await verify(
          d.token,
          d.name
        );
      } else if (
        process.env.ALLOW_GUEST ===
        'true'
      ) {
        const name =
          cleanName(d?.name);

        if (name.length < 2) {
          return socket.emit(
            'err',
            'Name muss 2–16 Zeichen haben.'
          );
        }

        user = {
          id: guestId(
            socket,
            d?.device
          ),

          name,

          avatar: ''
        };
      }
    } catch {}

    if (!user) {
      return socket.emit(
        'err',
        'Login fehlgeschlagen'
      );
    }

    user.skin = [
      'discord',
      'flag',
      'letter'
    ].includes(d?.skin)
      ? d.skin
      : 'letter';

    if (
      user.skin === 'discord' &&
      !user.avatar
    ) {
      user.skin = 'letter';
    }

    const room = code();

    // WICHTIG:
    // Game erwartet:
    // new Game(roomID, socketIO, onRecord)
    game = new Game(
      room,
      io,
      announceRecord
    );

    rooms.set(room, game);

    game.join(
      user,
      socket.id
    );

    uid = user.id;

    socket.join(room);

    socket.emit('joined', {
      id: uid,
      room
    });
  });

  // ------------------------------------------------
  // JOIN ROOM
  // ------------------------------------------------

  socket.on('join', async d => {
    if (game) return;

    const room =
      cleanCode(d?.room);

    const g =
      rooms.get(room);

    if (!g) {
      return socket.emit(
        'err',
        'Gruppe nicht gefunden.'
      );
    }

    let user = null;

    try {
      if (d?.auth) {
        user = verifyLinkAuth(
          d.auth,
          d.name
        );
      } else if (d?.token) {
        user = await verify(
          d.token,
          d.name
        );
      } else if (
        process.env.ALLOW_GUEST ===
        'true'
      ) {
        const name =
          cleanName(d?.name);

        if (name.length < 2) {
          return socket.emit(
            'err',
            'Name muss 2–16 Zeichen haben.'
          );
        }

        user = {
          id: guestId(
            socket,
            d?.device
          ),

          name,

          avatar: ''
        };
      }
    } catch {}

    if (!user) {
      return socket.emit(
        'err',
        'Login fehlgeschlagen'
      );
    }

    user.skin = [
      'discord',
      'flag',
      'letter'
    ].includes(d?.skin)
      ? d.skin
      : 'letter';

    if (
      user.skin === 'discord' &&
      !user.avatar
    ) {
      user.skin = 'letter';
    }

    if (
      !g.join(
        user,
        socket.id
      )
    ) {
      return socket.emit(
        'err',
        'Gruppe ist voll.'
      );
    }

    game = g;
    uid = user.id;

    socket.join(room);

    socket.emit('joined', {
      id: uid,
      room
    });
  });

  // ------------------------------------------------
  // MOVEMENT
  // ------------------------------------------------

  socket.on('input', d => {
    if (
      game &&
      ok() &&
      d
    ) {
      game.setInput(
        uid,
        d.dx,
        d.dy
      );
    }
  });

  // ------------------------------------------------
  // PICKUP
  // ------------------------------------------------

  socket.on('pickup', d => {
    if (
      game &&
      ok() &&
      d
    ) {
      game.tryPickup(
        uid,
        d.id,
        d.x,
        d.y
      );
    }
  });

  // ------------------------------------------------
  // READY
  // ------------------------------------------------

  socket.on('ready', v => {
    if (
      game &&
      ok()
    ) {
      game.setReady(
        uid,
        v
      );
    }
  });

  // ------------------------------------------------
  // DIFFICULTY
  // ------------------------------------------------

  socket.on(
    'difficulty',
    v => {
      if (
        game &&
        ok()
      ) {
        game.setDifficulty(
          uid,
          v
        );
      }
    }
  );

  // ------------------------------------------------
  // MODE
  // ------------------------------------------------

  socket.on('mode', v => {
    if (
      game &&
      ok()
    ) {
      game.setMode(
        uid,
        v
      );
    }
  });

  // ------------------------------------------------
  // BATTLE TYPE
  // ------------------------------------------------

  socket.on(
    'battleType',
    v => {
      if (
        game &&
        ok()
      ) {
        game.setBattleType(
          uid,
          v
        );
      }
    }
  );

  // ------------------------------------------------
  // MAP
  // ------------------------------------------------

  socket.on('map', v => {
    if (
      game &&
      ok()
    ) {
      game.setMap(
        uid,
        v
      );
    }
  });

  // ------------------------------------------------
  // AIM
  // ------------------------------------------------

  socket.on('aim', d => {
    if (
      game &&
      ok() &&
      d
    ) {
      game.setAim(
        uid,
        d.x,
        d.y
      );
    }
  });

  // ------------------------------------------------
  // SHOOT
  // ------------------------------------------------

  socket.on('shoot', () => {
    if (
      game &&
      ok()
    ) {
      game.shoot(uid);
    }
  });

  // ------------------------------------------------
  // RELOAD
  // ------------------------------------------------

  socket.on('reload', () => {
    if (
      game &&
      ok()
    ) {
      game.reload(uid);
    }
  });

  // ------------------------------------------------
  // SWITCH WEAPON
  // ------------------------------------------------

  socket.on('switch', v => {
    if (
      game &&
      ok()
    ) {
      game.switchWeapon(
        uid,
        v
      );
    }
  });

  // ------------------------------------------------
  // START GAME
  // ------------------------------------------------

  socket.on('start', () => {
    if (
      game &&
      ok()
    ) {
      game.start(uid);
    }
  });

  // ------------------------------------------------
  // BACK TO LOBBY
  // ------------------------------------------------

  socket.on('lobby', () => {
    if (
      game &&
      ok()
    ) {
      game.backToLobby(uid);
    }
  });

  // ------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------

  socket.on(
    'disconnect',
    () => {
      clearInterval(bucket);

      game?.leave(
        uid,
        socket.id
      );
    }
  );
});

// --------------------------------------------------
// REMOVE EMPTY ROOMS
// --------------------------------------------------

setInterval(() => {
  for (
    const [room, game]
    of rooms
  ) {
    if (
      !game.online.length
    ) {
      game.destroy();
      rooms.delete(room);
    }
  }
}, 30000);

// --------------------------------------------------
// START WEB SERVER
// --------------------------------------------------

const port =
  process.env.PORT || 3000;

server.listen(
  port,
  '0.0.0.0',
  () => {
    console.log(
      `🐉 China Chaos läuft auf Port ${port}`
    );
  }
);

// --------------------------------------------------
// DISCORD BOT
// --------------------------------------------------

// Antagonix:
// RUN_DISCORD_BOT ist nicht false
// -> Bot läuft.
//
// Render:
// RUN_DISCORD_BOT=false
// -> nur Web/Game Server.

if (
  process.env.RUN_DISCORD_BOT !==
  'false'
) {
  startBot().catch(error => {
    console.error(
      'Bot:',
      error.message
    );
  });
} else {
  console.log(
    '🌐 Render-Modus: Discord Bot deaktiviert'
  );
}

// --------------------------------------------------
// SHUTDOWN
// --------------------------------------------------

const bye = () => {
  io.close();
  closeDb();
  process.exit(0);
};

process.on(
  'SIGINT',
  bye
);

process.on(
  'SIGTERM',
  bye
);
