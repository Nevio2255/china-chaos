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
   GRUNDLAGEN
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

const systemFile = path.join(
  rootDir,
  '../data/system-state.json'
);

const CLIENT_DIR = path.join(
  rootDir,
  '../client'
);


/* =========================================================
   SYSTEM STATUS
========================================================= */

function loadSystem() {
  const defaults = {
    maintenance: false,
    version: '5.3.3',
    notes: '',
    updatedAt: Date.now()
  };

  try {
    return {
      ...defaults,
      ...JSON.parse(
        fs.readFileSync(systemFile, 'utf8')
      )
    };
  } catch {
    return defaults;
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
  } catch (error) {
    console.error(
      'System-State:',
      error.message
    );
  }
}


setSystemStateProvider(() => systemState);


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
    windowMs: 60_000,
    limit: 180
  })
);


/* =========================================================
   API CONFIG
========================================================= */

app.get('/api/config', (req, res) => {
  res.json({
    clientId:
      process.env.DISCORD_CLIENT_ID || '',

    discordRequired: true,

    version:
      systemState.version
  });
});


app.get('/api/system', (req, res) => {
  res.json({
    ...systemState,

    // Windows-Version wird über GitHub Releases bereitgestellt
    desktopAvailable: true
  });
});


/* =========================================================
   WINDOWS DOWNLOAD
   Lädt automatisch die neueste Setup-EXE herunter.
========================================================= */

let windowsDownloadCache = {
  url: null,
  expiresAt: 0
};


app.get(
  '/download/windows',
  async (req, res) => {

    try {

      /*
       * GitHub nicht bei jedem Klick neu abfragen.
       * Download-Link wird 5 Minuten gespeichert.
       */

      if (
        windowsDownloadCache.url &&
        windowsDownloadCache.expiresAt > Date.now()
      ) {
        return res.redirect(
          302,
          windowsDownloadCache.url
        );
      }


      const response = await fetch(
        'https://api.github.com/repos/Nevio2255/china-chaos/releases/latest',
        {
          headers: {
            Accept:
              'application/vnd.github+json',

            'User-Agent':
              'China-Chaos'
          }
        }
      );


      if (!response.ok) {
        throw new Error(
          `GitHub API Fehler: ${response.status}`
        );
      }


      const release =
        await response.json();


      const assets =
        Array.isArray(release.assets)
          ? release.assets
          : [];


      /*
       * Bevorzugt:
       *
       * ChinaChaos-Setup-5.3.3.exe
       * ChinaChaos-Setup-5.3.4.exe
       * usw.
       */

      let installer =
        assets.find(asset => {

          const name =
            String(
              asset?.name || ''
            );

          return /^ChinaChaos-Setup-.*\.exe$/i.test(
            name
          );

        });


      /*
       * Falls der Dateiname später leicht geändert wird,
       * nehmen wir als Fallback eine Setup-EXE.
       */

      if (!installer) {

        installer =
          assets.find(asset => {

            const name =
              String(
                asset?.name || ''
              ).toLowerCase();

            return (
              name.endsWith('.exe') &&
              name.includes('setup')
            );

          });

      }


      if (
        !installer ||
        !installer.browser_download_url
      ) {

        console.error(
          'Windows-Download: Keine Setup-EXE im neuesten Release gefunden.'
        );

        return res
          .status(404)
          .send(
            'Für die aktuelle China-Chaos-Version wurde kein Windows-Installer gefunden.'
          );
      }


      windowsDownloadCache = {
        url:
          installer.browser_download_url,

        expiresAt:
          Date.now() +
          5 * 60 * 1000
      };


      console.log(
        `🖥️ Windows Download: ${installer.name}`
      );


      /*
       * Browser wird direkt auf die GitHub-Datei geschickt.
       * Dadurch erscheint NICHT zuerst die Release-Seite.
       */

      return res.redirect(
        302,
        installer.browser_download_url
      );

    } catch (error) {

      console.error(
        'Windows-Download:',
        error
      );


      return res
        .status(503)
        .send(
          'Der Windows-Download ist momentan nicht verfügbar. Bitte versuche es später erneut.'
        );

    }

  }
);


/* =========================================================
   LEADERBOARD
========================================================= */

app.get(
  '/api/leaderboard',
  (req, res) => {

    res.json({
      top: top(10),
      records: records()
    });

  }
);


/* =========================================================
   ACCOUNT
========================================================= */

app.get(
  '/api/me',
  (req, res) => {

    const user =
      sessionFromCookie(
        req.headers.cookie
      );


    if (!user) {

      return res
        .status(401)
        .json({
          error: 'login_required'
        });

    }


    res.json({
      id: user.id,
      name: user.name,
      avatar: user.avatar || ''
    });

  }
);


/* =========================================================
   DISCORD SIGNED LINK
========================================================= */

app.get(
  '/auth/link',
  (req, res) => {

    const user =
      verifySigned(
        req.query.ticket
      );


    if (!user) {

      return res
        .status(401)
        .send(
          'Discord-Link ist ungültig oder abgelaufen. Bitte /china erneut benutzen.'
        );

    }


    upsertProfile(user);


    res.setHeader(
      'Set-Cookie',
      sessionCookie(user)
    );


    res.redirect('/');

  }
);


/* =========================================================
   DISCORD LOGIN
========================================================= */

app.get(
  '/login',
  (req, res) => {

    const base =
      (
        process.env.GAME_URL ||
        `${req.protocol}://${req.get('host')}`
      ).replace(/\/$/, '');


    const redirect =
      process.env.DISCORD_REDIRECT_URI ||
      `${base}/auth/discord/callback`;


    const state =
      crypto
        .randomBytes(24)
        .toString('hex');


    res.setHeader(
      'Set-Cookie',
      `cc_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
    );


    const query =
      new URLSearchParams({
        client_id:
          process.env.DISCORD_CLIENT_ID || '',

        response_type:
          'code',

        redirect_uri:
          redirect,

        scope:
          'identify',

        state
      });


    res.redirect(
      `https://discord.com/oauth2/authorize?${query}`
    );

  }
);


/* =========================================================
   DISCORD CALLBACK
========================================================= */

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
        state !== String(
          req.query.state || ''
        )
      ) {

        return res
          .status(400)
          .send(
            'Ungültige Anmeldung.'
          );

      }


      const base =
        (
          process.env.GAME_URL ||
          `${req.protocol}://${req.get('host')}`
        ).replace(/\/$/, '');


      const redirect =
        process.env.DISCORD_REDIRECT_URI ||
        `${base}/auth/discord/callback`;


      const tokenResponse =
        await fetch(
          'https://discord.com/api/oauth2/token',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },

            body:
              new URLSearchParams({
                client_id:
                  process.env.DISCORD_CLIENT_ID || '',

                client_secret:
                  process.env.DISCORD_CLIENT_SECRET || '',

                grant_type:
                  'authorization_code',

                code:
                  String(
                    req.query.code || ''
                  ),

                redirect_uri:
                  redirect
              })
          }
        );


      const tokenData =
        await tokenResponse.json();


      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {

        return res
          .status(401)
          .send(
            'Discord-Anmeldung fehlgeschlagen.'
          );

      }


      const userResponse =
        await fetch(
          'https://discord.com/api/users/@me',
          {
            headers: {
              Authorization:
                `Bearer ${tokenData.access_token}`
            }
          }
        );


      const discordUser =
        await userResponse.json();


      if (
        !userResponse.ok ||
        !discordUser.id
      ) {

        return res
          .status(401)
          .send(
            'Discord-Profil konnte nicht geladen werden.'
          );

      }


      const user = {
        id:
          String(discordUser.id),

        name:
          cleanName(
            discordUser.global_name ||
            discordUser.username
          ),

        avatar:
          avatarUrl(discordUser)
      };


      upsertProfile(user);


      res.setHeader(
        'Set-Cookie',
        [
          sessionCookie(user),

          'cc_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        ]
      );


      res.redirect('/');

    } catch (error) {

      console.error(
        'OAuth:',
        error
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

app.post(
  '/api/logout',
  (req, res) => {

    res.setHeader(
      'Set-Cookie',
      clearSessionCookie()
    );


    res.json({
      ok: true
    });

  }
);


/* =========================================================
   STATIC CLIENT
========================================================= */

app.use(
  express.static(
    CLIENT_DIR
  )
);


/* =========================================================
   HTTP + SOCKET.IO
========================================================= */

const server =
  http.createServer(app);


const io =
  new Server(
    server,
    {
      maxHttpBufferSize: 4096,

      cors: {
        origin: false
      }
    }
  );


const rooms =
  new Map();


/* =========================================================
   ADMIN PANEL
========================================================= */

const ADMIN_IP =
  process.env.ADMIN_ALLOWED_IP ||
  '178.39.54.112';


const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  '';


const adminSessions =
  new Map();


function requestIp(req) {

  const forwarded =
    String(
      req.headers['x-forwarded-for'] ||
      ''
    )
      .split(',')[0]
      .trim();


  return (
    forwarded ||
    req.ip ||
    req.socket.remoteAddress ||
    ''
  ).replace(
    /^::ffff:/,
    ''
  );

}


function ipAllowed(req) {

  return (
    requestIp(req) ===
    ADMIN_IP
  );

}


function cookies(req) {

  return Object.fromEntries(
    String(
      req.headers.cookie || ''
    )
      .split(';')
      .map(item =>
        item
          .trim()
          .split('=')
          .map(decodeURIComponent)
      )
      .filter(item =>
        item.length === 2
      )
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


  const expires =
    adminSessions.get(token);


  if (
    !token ||
    !expires ||
    expires < Date.now()
  ) {

    if (token) {
      adminSessions.delete(token);
    }

    return false;
  }


  return true;

}


function adminOnly(
  req,
  res,
  next
) {

  if (!ipAllowed(req)) {

    return res
      .status(404)
      .send(
        'Not found'
      );

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

app.get(
  '/admin',
  (req, res) => {

    if (!ipAllowed(req)) {

      return res
        .status(404)
        .send(
          'Not found'
        );

    }


    res.sendFile(
      path.join(
        CLIENT_DIR,
        'admin.html'
      )
    );

  }
);


app.get(
  '/admin.css',
  (req, res) => {

    if (!ipAllowed(req)) {

      return res
        .status(404)
        .end();

    }


    res.sendFile(
      path.join(
        CLIENT_DIR,
        'admin.css'
      )
    );

  }
);


app.get(
  '/admin.js',
  (req, res) => {

    if (!ipAllowed(req)) {

      return res
        .status(404)
        .end();

    }


    res.sendFile(
      path.join(
        CLIENT_DIR,
        'admin.js'
      )
    );

  }
);


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


    const token =
      crypto
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


/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post(
  '/api/admin/logout',
  (req, res) => {

    const token =
      cookies(req).cc_admin;


    if (token) {
      adminSessions.delete(token);
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

      ip:
        requestIp(req),

      uptime:
        process.uptime(),

      system:
        systemState,

      desktopAvailable:
        true,

      rooms:
        [...rooms.entries()]
          .map(
            ([id, game]) => ({
              id,

              phase:
                game.phase,

              mode:
                game.mode,

              difficulty:
                game.difficulty,

              battleType:
                game.battleType,

              map:
                game.map,

              players:
                [...game.players.values()]
                  .filter(
                    player =>
                      player.sockets.size
                  )
                  .map(
                    player => ({
                      id:
                        player.id,

                      name:
                        player.name,

                      score:
                        player.score,

                      coins:
                        player.coins,

                      hp:
                        Math.round(
                          player.hp
                        ),

                      kills:
                        player.kills,

                      deaths:
                        player.deaths,

                      host:
                        player.id ===
                        game.host
                    })
                  )
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

      const body =
        req.body || {};


      /* -------------------------
         STATS
      ------------------------- */

      if (
        body.type === 'stat'
      ) {

        adminSetStat(
          body.id,
          body.field,
          body.value
        );


        return res.json({
          ok: true
        });

      }


      if (
        body.type === 'deleteStat'
      ) {

        adminDeleteStats(
          body.id
        );


        return res.json({
          ok: true
        });

      }


      if (
        body.type === 'resetRecord'
      ) {

        adminResetRecord(
          body.difficulty
        );


        return res.json({
          ok: true
        });

      }


      /* -------------------------
         SYSTEM
      ------------------------- */

      if (
        body.type === 'system'
      ) {

        if (
          body.action ===
          'maintenance'
        ) {

          const next =
            !!body.value;


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
            system: systemState
          });

        }


        if (
          body.action ===
          'version'
        ) {

          const version =
            String(
              body.value || ''
            )
              .trim()
              .slice(0, 32);


          if (
            !/^[0-9A-Za-z._-]+$/.test(
              version
            )
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

            version,

            notes:
              String(
                body.notes || ''
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
            system: systemState
          });

        }


        if (
          body.action ===
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


      /* -------------------------
         ROOM
      ------------------------- */

      const game =
        rooms.get(
          cleanCode(
            body.room
          )
        );


      if (!game) {

        return res
          .status(404)
          .json({
            error:
              'Lobby nicht gefunden'
          });

      }


      if (
        body.type === 'room'
      ) {

        if (
          body.action === 'start'
        ) {

          game.start(
            game.host
          );

        } else if (
          body.action === 'lobby'
        ) {

          if (
            game.phase === 'over'
          ) {

            game.backToLobby(
              game.host
            );

          } else {

            game.reset();

            game.phase =
              'lobby';


            for (
              const player
              of game.players.values()
            ) {

              player.ready =
                false;

              player.spec =
                false;

              player.dead =
                false;

              player.hp =
                100;

              player.dx =
                0;

              player.dy =
                0;

            }


            game.emit(
              Date.now()
            );

          }

        } else if (
          body.action === 'end'
        ) {

          if (
            game.mode ===
            'battle'
          ) {

            game.finishBattle(
              'admin'
            );

          } else {

            game.finish(
              'admin'
            );

          }

        } else if (
          body.action ===
            'event' &&
          game.mode ===
            'classic' &&
          game.phase ===
            'playing'
        ) {

          game.event(
            Date.now()
          );

        } else {

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


      /* -------------------------
         PLAYER
      ------------------------- */

      if (
        body.type === 'player'
      ) {

        const player =
          game.players.get(
            String(
              body.id
            )
          );


        if (!player) {

          return res
            .status(404)
            .json({
              error:
                'Spieler nicht gefunden'
            });

        }


        const value =
          Math.trunc(
            Number(
              body.value
            ) || 0
          );


        if (
          body.action ===
          'score'
        ) {

          player.score =
            Math.max(
              0,
              value
            );

        } else if (
          body.action ===
          'coins'
        ) {

          player.coins =
            Math.max(
              0,
              value
            );

        } else if (
          body.action ===
          'kills'
        ) {

          player.kills =
            Math.max(
              0,
              value
            );


          if (
            game.mode ===
            'battle'
          ) {

            player.score =
              player.kills;

          }

        } else if (
          body.action ===
          'hp'
        ) {

          player.hp =
            Math.max(
              0,
              Math.min(
                player.maxHp || 100,
                value
              )
            );


          if (
            player.hp > 0
          ) {

            player.dead =
              false;

            player.spec =
              false;

          }

        } else if (
          body.action ===
          'heal'
        ) {

          player.hp =
            player.maxHp ||
            100;

          player.dead =
            false;

          player.spec =
            false;

        } else if (
          body.action ===
          'kill'
        ) {

          player.hp = 0;
          player.dead = true;
          player.spec = true;
          player.dx = 0;
          player.dy = 0;

        } else if (
          body.action ===
          'kick'
        ) {

          for (
            const socketId
            of [...player.sockets]
          ) {

            io.sockets.sockets
              .get(socketId)
              ?.disconnect(true);

          }


          game.players.delete(
            player.id
          );


          game.fixHost();
          game.assignTeams();

        } else {

          return res
            .status(400)
            .json({
              error:
                'Ungültige Spieler-Aktion'
            });

        }


        game.emit(
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

    } catch (error) {

      console.error(
        'Admin action:',
        error
      );


      res
        .status(500)
        .json({
          error:
            'Admin-Aktion fehlgeschlagen'
        });

    }

  }
);


/* =========================================================
   ROOM CODES
========================================================= */

const alphabet =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


function code() {

  let result = '';


  do {

    result = '';


    for (
      let i = 0;
      i < 6;
      i++
    ) {

      result +=
        alphabet[
          Math.floor(
            Math.random() *
            alphabet.length
          )
        ];

    }

  } while (
    rooms.has(result)
  );


  return result;

}


function cleanCode(value) {

  return String(
    value || ''
  )
    .toUpperCase()
    .replace(
      /[^A-Z2-9]/g,
      ''
    )
    .slice(
      0,
      6
    );

}


/* =========================================================
   SOCKET USER
========================================================= */

function socketUser(socket) {

  const user =
    sessionFromCookie(
      socket.handshake.headers.cookie
    );


  if (!user) {
    return null;
  }


  return {
    id:
      String(user.id),

    name:
      cleanName(
        user.name
      ),

    avatar:
      String(
        user.avatar || ''
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
    let messages = 0;


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
          messages = 0;
        },
        1000
      );


    const allowed = () =>
      ++messages <= 120;


    /* -------------------------
       CREATE ROOM
    ------------------------- */

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


    /* -------------------------
       JOIN ROOM
    ------------------------- */

    socket.on(
      'join',
      data => {

        if (game) {
          return;
        }


        const room =
          cleanCode(
            data?.room
          );


        const target =
          rooms.get(room);


        if (!target) {

          return socket.emit(
            'err',
            'Gruppe nicht gefunden.'
          );

        }


        if (
          !target.join(
            user,
            socket.id
          )
        ) {

          return socket.emit(
            'err',
            'Gruppe ist voll.'
          );

        }


        game =
          target;


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


    /* -------------------------
       INPUT
    ------------------------- */

    socket.on(
      'input',
      data => {

        if (
          game &&
          allowed() &&
          data
        ) {

          game.setInput(
            uid,
            data.dx,
            data.dy
          );

        }

      }
    );


    /* -------------------------
       PICKUP
    ------------------------- */

    socket.on(
      'pickup',
      data => {

        if (
          game &&
          allowed() &&
          data
        ) {

          game.tryPickup(
            uid,
            data.id,
            data.x,
            data.y
          );

        }

      }
    );


    /* -------------------------
       READY
    ------------------------- */

    socket.on(
      'ready',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.setReady(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       DIFFICULTY
    ------------------------- */

    socket.on(
      'difficulty',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.setDifficulty(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       MODE
    ------------------------- */

    socket.on(
      'mode',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.setMode(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       BATTLE TYPE
    ------------------------- */

    socket.on(
      'battleType',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.setBattleType(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       MAP
    ------------------------- */

    socket.on(
      'map',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.setMap(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       AIM
    ------------------------- */

    socket.on(
      'aim',
      data => {

        if (
          game &&
          allowed() &&
          data
        ) {

          game.setAim(
            uid,
            data.x,
            data.y
          );

        }

      }
    );


    /* -------------------------
       SHOOT
    ------------------------- */

    socket.on(
      'shoot',
      () => {

        if (
          game &&
          allowed()
        ) {

          game.shoot(
            uid
          );

        }

      }
    );


    /* -------------------------
       RELOAD
    ------------------------- */

    socket.on(
      'reload',
      () => {

        if (
          game &&
          allowed()
        ) {

          game.reload(
            uid
          );

        }

      }
    );


    /* -------------------------
       SWITCH WEAPON
    ------------------------- */

    socket.on(
      'switch',
      value => {

        if (
          game &&
          allowed()
        ) {

          game.switchWeapon(
            uid,
            value
          );

        }

      }
    );


    /* -------------------------
       START
    ------------------------- */

    socket.on(
      'start',
      () => {

        if (
          game &&
          allowed()
        ) {

          game.start(
            uid
          );

        }

      }
    );


    /* -------------------------
       BACK TO LOBBY
    ------------------------- */

    socket.on(
      'lobby',
      () => {

        if (
          game &&
          allowed()
        ) {

          game.backToLobby(
            uid
          );

        }

      }
    );


    /* -------------------------
       DISCONNECT
    ------------------------- */

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
   LEERE RÄUME ENTFERNEN
========================================================= */

setInterval(
  () => {

    for (
      const [room, game]
      of rooms
    ) {

      if (
        !game.online.length
      ) {

        game.destroy();

        rooms.delete(
          room
        );

      }

    }

  },
  30_000
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
    .catch(error => {

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


/* =========================================================
   CLEAN SHUTDOWN
========================================================= */

const shutdown = () => {

  io.close();

  closeDb();

  process.exit(0);

};


process.on(
  'SIGINT',
  shutdown
);


process.on(
  'SIGTERM',
  shutdown
);
