import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

import {
  startBot,
  announceRecord,
  setSystemStateProvider,
  announceUpdateStatus
} from './bot.js';

import { Game } from './game.js';

import {
  top,
  records,
  adminSetStat,
  adminDeleteStats,
  adminResetRecord,
  upsertProfile,
  closeDb
} from './db.js';

import {
  avatarUrl,
  cleanName,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  sessionFromCookie,
  verifySigned
} from './auth.js';


/* =========================================================
   PATHS / SYSTEM
========================================================= */

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const systemFile = path.join(
  rootDir,
  '../data/system-state.json'
);

function loadSystem() {
  try {
    return {
      maintenance: false,
      version: '5.3.3',
      notes: '',
      updatedAt: Date.now(),
      ...JSON.parse(
        fs.readFileSync(systemFile, 'utf8')
      )
    };
  } catch {
    return {
      maintenance: false,
      version: '5.3.3',
      notes: '',
      updatedAt: Date.now()
    };
  }
}

let systemState = loadSystem();

function saveSystem() {
  try {
    fs.mkdirSync(
      path.dirname(systemFile),
      { recursive: true }
    );

    fs.writeFileSync(
      systemFile,
      JSON.stringify(systemState, null, 2)
    );
  } catch (e) {
    console.error(
      'System-State:',
      e.message
    );
  }
}

setSystemStateProvider(() => systemState);


/* =========================================================
   CLIENT
========================================================= */

/*
  WICHTIG:
  index.html / main.js / style.css liegen direkt in /client
  und NICHT in /client/dist
*/

const dist = path.join(
  rootDir,
  '../client'
);


/* =========================================================
   EXPRESS
========================================================= */

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


/* =========================================================
   CONFIG / SYSTEM API
========================================================= */

app.get('/api/config', (_, res) => {
  res.json({
    clientId:
      process.env.DISCORD_CLIENT_ID || '',
    discordRequired: true,
    version: systemState.version
  });
});

app.get('/api/system', (_, res) => {
  res.json({
    ...systemState,
    desktopAvailable: true
  });
});


/* =========================================================
   WINDOWS DOWNLOAD
========================================================= */

/*
  Die alte V5.1 "Desktop-App ist vorbereitet"-Seite
  existiert nicht mehr.

  /download/windows führt jetzt zur neuesten
  GitHub-Release.
*/

app.get('/download/windows', (req, res) => {
  res.redirect(
    'https://github.com/Nevio2255/china-chaos/releases/latest'
  );
});


/* =========================================================
   LEADERBOARD
========================================================= */

app.get('/api/leaderboard', (_, res) => {
  res.json({
    top: top(10),
    records: records()
  });
});


/* =========================================================
   DISCORD USER
========================================================= */

app.get('/api/me', (req, res) => {
  const u = sessionFromCookie(
    req.headers.cookie
  );

  if (!u) {
    return res.status(401).json({
      error: 'login_required'
    });
  }

  res.json({
    id: u.id,
    name: u.name,
    avatar: u.avatar || ''
  });
});


/* =========================================================
   SIGNED /CHINA LOGIN
========================================================= */

app.get('/auth/link', (req, res) => {
  const u = verifySigned(
    req.query.ticket
  );

  if (!u) {
    return res
      .status(401)
      .send(
        'Discord-Link ist ungültig oder abgelaufen. Bitte /china erneut benutzen.'
      );
  }

  upsertProfile(u);

  res.setHeader(
    'Set-Cookie',
    sessionCookie(u)
  );

  res.redirect('/');
});


/* =========================================================
   DISCORD OAUTH LOGIN
========================================================= */

app.get('/login', (req, res) => {
  const base = (
    process.env.GAME_URL ||
    `${req.protocol}://${req.get('host')}`
  ).replace(/\/$/, '');

  const redirect =
    process.env.DISCORD_REDIRECT_URI ||
    `${base}/auth/discord/callback`;

  const state = crypto
    .randomBytes(24)
    .toString('hex');

  res.setHeader(
    'Set-Cookie',
    `cc_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  );

  const q = new URLSearchParams({
    client_id:
      process.env.DISCORD_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'identify',
    state
  });

  res.redirect(
    `https://discord.com/oauth2/authorize?${q}`
  );
});


app.get(
  '/auth/discord/callback',
  async (req, res) => {
    try {
      const state =
        parseCookies(
          req.headers.cookie
        ).cc_oauth_state;

      if (
        !state ||
        state !== String(req.query.state || '')
      ) {
        return res
          .status(400)
          .send('Ungültige Anmeldung.');
      }

      const base = (
        process.env.GAME_URL ||
        `${req.protocol}://${req.get('host')}`
      ).replace(/\/$/, '');

      const redirect =
        process.env.DISCORD_REDIRECT_URI ||
        `${base}/auth/discord/callback`;

      const tr = await fetch(
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

            code:
              String(req.query.code || ''),

            redirect_uri:
              redirect
          })
        }
      );

      const td = await tr.json();

      if (
        !tr.ok ||
        !td.access_token
      ) {
        return res
          .status(401)
          .send(
            'Discord-Anmeldung fehlgeschlagen.'
          );
      }

      const ur = await fetch(
        'https://discord.com/api/users/@me',
        {
          headers: {
            Authorization:
              `Bearer ${td.access_token}`
          }
        }
      );

      const d = await ur.json();

      if (
        !ur.ok ||
        !d.id
      ) {
        return res
          .status(401)
          .send(
            'Discord-Profil konnte nicht geladen werden.'
          );
      }

      const u = {
        id: String(d.id),

        name: cleanName(
          d.global_name ||
          d.username
        ),

        avatar:
          avatarUrl(d)
      };

      upsertProfile(u);

      res.setHeader(
        'Set-Cookie',
        [
          sessionCookie(u),
          'cc_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        ]
      );

      res.redirect('/');

    } catch (e) {
      console.error(
        'OAuth:',
        e
      );

      res
        .status(500)
        .send(
          'Discord-Anmeldung fehlgeschlagen.'
        );
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.post('/api/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    clearSessionCookie()
  );

  res.json({
    ok: true
  });
});


/* =========================================================
   STATIC GAME
========================================================= */

app.use(
  express.static(dist)
);


/* =========================================================
   HTTP / SOCKET.IO
========================================================= */

const server =
  http.createServer(app);

const io =
  new Server(server, {
    maxHttpBufferSize: 4096,

    cors: {
      origin: false
    }
  });

const rooms = new Map();


/* =========================================================
   ADMIN
========================================================= */

const ADMIN_IP =
  process.env.ADMIN_ALLOWED_IP ||
  '178.39.54.112';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || '';

const adminSessions =
  new Map();


function requestIp(req) {
  const f = String(
    req.headers['x-forwarded-for'] || ''
  )
    .split(',')[0]
    .trim();

  return (
    f ||
    req.ip ||
    req.socket.remoteAddress ||
    ''
  ).replace(/^::ffff:/, '');
}


function ipAllowed(req) {
  return (
    requestIp(req) ===
    ADMIN_IP
  );
}


function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map(x =>
        x
          .trim()
          .split('=')
          .map(decodeURIComponent)
      )
      .filter(x => x.length === 2)
  );
}


function adminAuthed(req) {
  if (!ipAllowed(req)) {
    return false;
  }

  if (!ADMIN_PASSWORD) {
    return true;
  }

  const token =
    cookies(req).cc_admin;

  const exp =
    adminSessions.get(token);

  if (
    !token ||
    !exp ||
    exp < Date.now()
  ) {
    if (token) {
      adminSessions.delete(token);
    }

    return false;
  }

  return true;
}


function adminOnly(req, res, next) {
  if (!ipAllowed(req)) {
    return res
      .status(404)
      .send('Not found');
  }

  if (!adminAuthed(req)) {
    return res
      .status(401)
      .json({
        error:
          'Admin-Anmeldung erforderlich'
      });
  }

  next();
}


/* =========================================================
   ADMIN FILES
========================================================= */

app.get('/admin', (req, res) => {
  if (!ipAllowed(req)) {
    return res
      .status(404)
      .send('Not found');
  }

  res.sendFile(
    path.join(
      rootDir,
      '../client/admin.html'
    )
  );
});


app.get('/admin.css', (req, res) => {
  if (!ipAllowed(req)) {
    return res
      .status(404)
      .end();
  }

  res.sendFile(
    path.join(
      rootDir,
      '../client/admin.css'
    )
  );
});


app.get('/admin.js', (req, res) => {
  if (!ipAllowed(req)) {
    return res
      .status(404)
      .end();
  }

  res.sendFile(
    path.join(
      rootDir,
      '../client/admin.js'
    )
  );
});


/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post(
  '/api/admin/login',
  (req, res) => {
    if (!ipAllowed(req)) {
      return res
        .status(404)
        .json({
          error: 'Not found'
        });
    }

    if (
      ADMIN_PASSWORD &&
      String(
        req.body?.password || ''
      ) !== ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({
          error:
            'Falsches Passwort'
        });
    }

    const token = crypto
      .randomBytes(32)
      .toString('hex');

    adminSessions.set(
      token,
      Date.now() +
      12 * 60 * 60 * 1000
    );

    res.setHeader(
      'Set-Cookie',
      `cc_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`
    );

    res.json({
      ok: true
    });
  }
);


app.post(
  '/api/admin/logout',
  (req, res) => {
    const t =
      cookies(req).cc_admin;

    if (t) {
      adminSessions.delete(t);
    }

    res.setHeader(
      'Set-Cookie',
      'cc_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
    );

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   ADMIN STATE
========================================================= */

app.get(
  '/api/admin/state',
  adminOnly,
  (req, res) => {
    res.json({
      ip: requestIp(req),

      uptime:
        process.uptime(),

      system:
        systemState,

      desktopAvailable:
        true,

      rooms:
        [...rooms.entries()].map(
          ([id, g]) => ({
            id,

            phase:
              g.phase,

            mode:
              g.mode,

            difficulty:
              g.difficulty,

            battleType:
              g.battleType,

            map:
              g.map,

            players:
              [...g.players.values()]
                .filter(
                  p => p.sockets.size
                )
                .map(p => ({
                  id:
                    p.id,

                  name:
                    p.name,

                  score:
                    p.score,

                  coins:
                    p.coins,

                  hp:
                    Math.round(
                      p.hp
                    ),

                  kills:
                    p.kills,

                  deaths:
                    p.deaths,

                  host:
                    p.id ===
                    g.host
                }))
          })
        ),

      top:
        top(50),

      records:
        records()
    });
  }
);


/* =========================================================
   ADMIN ACTIONS
========================================================= */

app.post(
  '/api/admin/action',
  adminOnly,
  async (req, res) => {
    try {
      const b =
        req.body || {};


      /* -----------------------------
         STAT
      ----------------------------- */

      if (b.type === 'stat') {
        adminSetStat(
          b.id,
          b.field,
          b.value
        );

        return res.json({
          ok: true
        });
      }


      /* -----------------------------
         DELETE STAT
      ----------------------------- */

      if (
        b.type ===
        'deleteStat'
      ) {
        adminDeleteStats(
          b.id
        );

        return res.json({
          ok: true
        });
      }


      /* -----------------------------
         RESET RECORD
      ----------------------------- */

      if (
        b.type ===
        'resetRecord'
      ) {
        adminResetRecord(
          b.difficulty
        );

        return res.json({
          ok: true
        });
      }


      /* -----------------------------
         SYSTEM
      ----------------------------- */

      if (
        b.type ===
        'system'
      ) {

        if (
          b.action ===
          'maintenance'
        ) {
          const next =
            !!b.value;

          if (
            next !==
            systemState.maintenance
          ) {
            systemState = {
              ...systemState,

              maintenance:
                next,

              updatedAt:
                Date.now()
            };

            saveSystem();

            await announceUpdateStatus(
              next
                ? 'maintenance'
                : 'online',

              systemState.version
            );
          }

          return res.json({
            ok: true,
            system:
              systemState
          });
        }


        if (
          b.action ===
          'version'
        ) {
          const v =
            String(
              b.value || ''
            )
              .trim()
              .slice(0, 32);

          if (
            !/^[0-9A-Za-z._-]+$/.test(v)
          ) {
            return res
              .status(400)
              .json({
                error:
                  'Ungültige Version'
              });
          }

          systemState = {
            ...systemState,

            version: v,

            notes:
              String(
                b.notes || ''
              ).slice(
                0,
                500
              ),

            updatedAt:
              Date.now()
          };

          saveSystem();

          return res.json({
            ok: true,
            system:
              systemState
          });
        }


        if (
          b.action ===
          'announce'
        ) {
          await announceUpdateStatus(
            'online',
            systemState.version
          );

          return res.json({
            ok: true
          });
        }


        return res
          .status(400)
          .json({
            error:
              'Ungültige System-Aktion'
          });
      }


      /* -----------------------------
         ROOM
      ----------------------------- */

      const g =
        rooms.get(
          cleanCode(b.room)
        );

      if (!g) {
        return res
          .status(404)
          .json({
            error:
              'Lobby nicht gefunden'
          });
      }


      if (
        b.type ===
        'room'
      ) {

        if (
          b.action ===
          'start'
        ) {
          g.start(
            g.host
          );
        }

        else if (
          b.action ===
          'lobby'
        ) {

          if (
            g.phase ===
            'over'
          ) {
            g.backToLobby(
              g.host
            );
          }

          else {
            g.reset();

            g.phase =
              'lobby';

            for (
              const p of
              g.players.values()
            ) {
              p.ready = false;
              p.spec = false;
              p.dead = false;
              p.hp = 100;
              p.dx = 0;
              p.dy = 0;
            }

            g.emit(
              Date.now()
            );
          }
        }

        else if (
          b.action ===
          'end'
        ) {

          if (
            g.mode ===
            'battle'
          ) {
            g.finishBattle(
              'admin'
            );
          }

          else {
            g.finish(
              'admin'
            );
          }
        }

        else if (
          b.action ===
          'event' &&
          g.mode ===
          'classic' &&
          g.phase ===
          'playing'
        ) {
          g.event(
            Date.now()
          );
        }

        else {
          return res
            .status(400)
            .json({
              error:
                'Ungültige Raum-Aktion'
            });
        }

        return res.json({
          ok: true
        });
      }


      /* -----------------------------
         PLAYER
      ----------------------------- */

      if (
        b.type ===
        'player'
      ) {
        const p =
          g.players.get(
            String(b.id)
          );

        if (!p) {
          return res
            .status(404)
            .json({
              error:
                'Spieler nicht gefunden'
            });
        }

        const v =
          Math.trunc(
            Number(
              b.value
            ) || 0
          );


        if (
          b.action ===
          'score'
        ) {
          p.score =
            Math.max(0, v);
        }

        else if (
          b.action ===
          'coins'
        ) {
          p.coins =
            Math.max(0, v);
        }

        else if (
          b.action ===
          'kills'
        ) {
          p.kills =
            Math.max(0, v);

          p.score =
            g.mode ===
            'battle'
              ? p.kills
              : p.score;
        }

        else if (
          b.action ===
          'hp'
        ) {
          p.hp =
            Math.max(
              0,
              Math.min(
                p.maxHp ||
                100,
                v
              )
            );

          if (
            p.hp > 0
          ) {
            p.dead = false;
            p.spec = false;
          }
        }

        else if (
          b.action ===
          'heal'
        ) {
          p.hp =
            p.maxHp ||
            100;

          p.dead = false;
          p.spec = false;
        }

        else if (
          b.action ===
          'kill'
        ) {
          p.hp = 0;
          p.dead = true;
          p.spec = true;
          p.dx = 0;
          p.dy = 0;
        }

        else if (
          b.action ===
          'kick'
        ) {
          for (
            const sid of
            [...p.sockets]
          ) {
            io
              .sockets
              .sockets
              .get(sid)
              ?.disconnect(
                true
              );
          }

          g.players.delete(
            p.id
          );

          g.fixHost();
          g.assignTeams();
        }

        else {
          return res
            .status(400)
            .json({
              error:
                'Ungültige Spieler-Aktion'
            });
        }

        g.emit(
          Date.now()
        );

        return res.json({
          ok: true
        });
      }


      return res
        .status(400)
        .json({
          error:
            'Ungültige Aktion'
        });

    } catch (e) {
      console.error(
        'Admin action:',
        e
      );

      return res
        .status(500)
        .json({
          error:
            'Admin-Aktion fehlgeschlagen'
        });
    }
  }
);


/* =========================================================
   ROOM CODE
========================================================= */

const alphabet =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


function code() {
  let c = '';

  do {
    c = '';

    for (
      let i = 0;
      i < 6;
      i++
    ) {
      c +=
        alphabet[
          Math.floor(
            Math.random() *
            alphabet.length
          )
        ];
    }

  } while (
    rooms.has(c)
  );

  return c;
}


function cleanCode(c) {
  return String(c || '')
    .toUpperCase()
    .replace(
      /[^A-Z2-9]/g,
      ''
    )
    .slice(0, 6);
}


/* =========================================================
   SOCKET USER
========================================================= */

function socketUser(socket) {
  const u =
    sessionFromCookie(
      socket
        .handshake
        .headers
        .cookie
    );

  if (!u) {
    return null;
  }

  return {
    id:
      String(u.id),

    name:
      cleanName(u.name),

    avatar:
      String(
        u.avatar || ''
      ),

    skin:
      'discord'
  };
}


/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
  'connection',
  socket => {

    if (
      systemState.maintenance
    ) {
      socket.emit(
        'maintenance',
        systemState
      );

      socket.disconnect(
        true
      );

      return;
    }


    let game = null;
    let uid = null;
    let msgs = 0;

    const user =
      socketUser(socket);


    if (!user) {
      socket.emit(
        'err',
        'Discord-Anmeldung erforderlich.'
      );

      socket.disconnect(
        true
      );

      return;
    }


    upsertProfile(user);


    const bucket =
      setInterval(
        () => {
          msgs = 0;
        },
        1000
      );


    const ok = () => {
      msgs++;
      return msgs <= 120;
    };


    /* CREATE */

    socket.on(
      'create',
      () => {
        if (game) {
          return;
        }

        const room =
          code();

        game =
          new Game(
            room,
            io,
            announceRecord
          );

        rooms.set(
          room,
          game
        );

        game.join(
          user,
          socket.id
        );

        uid =
          user.id;

        socket.join(
          room
        );

        socket.emit(
          'joined',
          {
            id: uid,
            room
          }
        );
      }
    );


    /* JOIN */

    socket.on(
      'join',
      d => {
        if (game) {
          return;
        }

        const room =
          cleanCode(
            d?.room
          );

        const g =
          rooms.get(
            room
          );

        if (!g) {
          return socket.emit(
            'err',
            'Gruppe nicht gefunden.'
          );
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

        socket.join(
          room
        );

        socket.emit(
          'joined',
          {
            id: uid,
            room
          }
        );
      }
    );


    /* INPUT */

    socket.on(
      'input',
      d => {
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
      }
    );


    /* PICKUP */

    socket.on(
      'pickup',
      d => {
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
      }
    );


    socket.on(
      'ready',
      v => {
        if (
          game &&
          ok()
        ) {
          game.setReady(
            uid,
            v
          );
        }
      }
    );


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


    socket.on(
      'mode',
      v => {
        if (
          game &&
          ok()
        ) {
          game.setMode(
            uid,
            v
          );
        }
      }
    );


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


    socket.on(
      'map',
      v => {
        if (
          game &&
          ok()
        ) {
          game.setMap(
            uid,
            v
          );
        }
      }
    );


    socket.on(
      'aim',
      d => {
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
      }
    );


    socket.on(
      'shoot',
      () => {
        if (
          game &&
          ok()
        ) {
          game.shoot(
            uid
          );
        }
      }
    );


    socket.on(
      'reload',
      () => {
        if (
          game &&
          ok()
        ) {
          game.reload(
            uid
          );
        }
      }
    );


    socket.on(
      'switch',
      v => {
        if (
          game &&
          ok()
        ) {
          game.switchWeapon(
            uid,
            v
          );
        }
      }
    );


    socket.on(
      'start',
      () => {
        if (
          game &&
          ok()
        ) {
          game.start(
            uid
          );
        }
      }
    );


    socket.on(
      'lobby',
      () => {
        if (
          game &&
          ok()
        ) {
          game.backToLobby(
            uid
          );
        }
      }
    );


    socket.on(
      'disconnect',
      () => {
        clearInterval(
          bucket
        );

        game?.leave(
          uid,
          socket.id
        );
      }
    );
  }
);


/* =========================================================
   CLEAN EMPTY ROOMS
========================================================= */

setInterval(
  () => {
    for (
      const [k, g]
      of rooms
    ) {
      if (
        !g.online.length
      ) {
        g.destroy();
        rooms.delete(k);
      }
    }
  },
  30000
);


/* =========================================================
   SERVER START
========================================================= */

const port =
  process.env.PORT ||
  3000;

server.listen(
  port,
  () => {
    console.log(
      `🐉 China Chaos läuft auf http://localhost:${port}`
    );
  }
);


/* =========================================================
   DISCORD BOT
========================================================= */

if (
  process.env.RUN_DISCORD_BOT !==
  'false'
) {
  startBot()
    .catch(e => {
      console.error(
        'Bot:',
        e.message
      );
    });
} else {
  console.log(
    '🌐 Render-Modus: Discord Bot deaktiviert'
  );
}


/* =========================================================
   CLEAN SHUTDOWN
========================================================= */

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
