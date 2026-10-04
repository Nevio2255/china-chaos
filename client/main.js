const $ = s => document.querySelector(s);

const W = 1600;
const H = 900;

const cv = $('#cv');
const ctx = cv.getContext('2d');

let socket;
let S;
let prevS;
let myId;
let room;
let screen = 'loading';

let sound = localStorage.getItem('ccSound') !== 'off';
let meProfile = null;
let skin = 'discord';

const DIFF = {
  easy: '🟢 EASY',
  normal: '🟡 NORMAL',
  hard: '🔴 HARD',
  chaos: '💀 CHAOS'
};

const esc = s =>
  String(s ?? '').replace(
    /[&<>\"]/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    })[c]
  );

function show(id) {
  screen = id;

  document
    .querySelectorAll('.screen')
    .forEach(e =>
      e.classList.toggle(
        'on',
        e.id === id
      )
    );
}

function toast(m) {
  const t = $('#toast');

  t.textContent = m;
  t.style.display = 'block';

  clearTimeout(toast.t);

  toast.t = setTimeout(
    () => t.style.display = 'none',
    2600
  );
}


/* =========================================================
   SOUND
========================================================= */

let AC;

function beep(
  f = 440,
  d = .08,
  type = 'sine',
  vol = .05,
  delay = 0
) {
  if (!sound) return;

  try {
    AC ??= new AudioContext();

    const o = AC.createOscillator();
    const g = AC.createGain();
    const at = AC.currentTime + delay;

    o.type = type;

    o.frequency.setValueAtTime(
      f,
      at
    );

    g.gain.setValueAtTime(
      vol,
      at
    );

    g.gain.exponentialRampToValueAtTime(
      .0001,
      at + d
    );

    o.connect(g).connect(
      AC.destination
    );

    o.start(at);
    o.stop(at + d);

  } catch {}
}

const sfx = {

  click: () =>
    beep(
      520,
      .05,
      'square',
      .035
    ),

  coin: () => {
    beep(
      900,
      .05,
      'sine',
      .04
    );

    beep(
      1250,
      .08,
      'sine',
      .035,
      .04
    );
  },

  bonus: () => {
    beep(
      520,
      .08,
      'triangle',
      .05
    );

    beep(
      760,
      .1,
      'triangle',
      .05,
      .06
    );
  },

  damage: () => {
    beep(
      145,
      .16,
      'sawtooth',
      .09
    );

    beep(
      90,
      .22,
      'square',
      .05,
      .04
    );
  },

  death: () => {
    beep(
      260,
      .18,
      'sawtooth',
      .08
    );

    beep(
      180,
      .22,
      'sawtooth',
      .07,
      .14
    );

    beep(
      95,
      .35,
      'sawtooth',
      .07,
      .3
    );
  },

  dragon: () => {
    beep(
      82,
      .55,
      'sawtooth',
      .07
    );

    beep(
      120,
      .35,
      'square',
      .04,
      .12
    );
  },

  fire: () =>
    beep(
      190,
      .1,
      'sawtooth',
      .035
    ),

  countdown: () =>
    beep(
      440,
      .12,
      'square',
      .05
    ),

  go: () => {
    beep(
      660,
      .1,
      'square',
      .06
    );

    beep(
      990,
      .2,
      'square',
      .06,
      .1
    );
  },

  combo: () => {
    beep(
      760,
      .06,
      'triangle',
      .05
    );

    beep(
      980,
      .08,
      'triangle',
      .05,
      .05
    );
  },

  power: () => {
    beep(
      600,
      .08,
      'sine',
      .05
    );

    beep(
      900,
      .1,
      'sine',
      .05,
      .07
    );

    beep(
      1200,
      .14,
      'sine',
      .04,
      .14
    );
  },

  shot: () =>
    beep(
      210,
      .045,
      'square',
      .025
    ),

  reload: () => {
    beep(
      330,
      .05,
      'square',
      .025
    );

    beep(
      440,
      .05,
      'square',
      .025,
      .12
    );
  },

  kill: () => {
    beep(
      700,
      .06,
      'triangle',
      .05
    );

    beep(
      1050,
      .1,
      'triangle',
      .05,
      .06
    );
  },

  win: () =>
    [523, 659, 784, 1047]
      .forEach(
        (f, i) =>
          beep(
            f,
            .18,
            'triangle',
            .06,
            i * .1
          )
      ),

  lose: () =>
    [320, 240, 160]
      .forEach(
        (f, i) =>
          beep(
            f,
            .2,
            'sawtooth',
            .05,
            i * .12
          )
      )
};



/* =========================================================
   STORY INTRO
========================================================= */

const STORY_SEEN_KEY = 'ccStoryIntroSeenV1';

const storyLines = [
  'Willkommen bei China Chaos!',
  'Doch bevor es losgeht, gibt es eine kleine Geschichte darüber, wie dieses Spiel überhaupt entstanden ist.',
  'Der Gründer von China Chaos ist Zyro – mit echtem Namen Nevio.',
  'Eines Tages war Nevio in einem Call und spielte Valorant.',
  'Karina war ebenfalls im Call, allerdings stummgeschaltet und am Schlafen.',
  'Wegen Nevio wurde Karina plötzlich wach und hat sich dabei ziemlich erschrocken.',
  'Dadurch kamen Nevio und Karina ein bisschen ins Gespräch.',
  'Irgendwann fand Nevio heraus, dass Karina aus der Nähe von China kommt.',
  'Und von diesem Moment an gab Nevio ihr einen neuen Spitznamen: Die Chinesin.',
  'Und genau daraus entstand irgendwann die Idee für dieses Spiel.',
  'Nevio hat sich die Mühe gemacht, China Chaos für Karina zu entwickeln und aus dieser kleinen Geschichte ein eigenes Game zu machen.',
  'Wir hoffen, dass ihr viel Spaß habt und euch das Spiel gefällt.',
  'Und natürlich dreht sich dieses Game um ein ganz bestimmtes Thema …',
  'CHINA!',
  'Willkommen bei China Chaos.',
  'Viel Spaß … und möge das Chaos beginnen!'
];

let storyRunning = false;
let storyReplay = false;

function stopStoryAudio() {
  const audio = $('#storyAudio');

  if (!audio) return;

  audio.pause();

  try {
    audio.currentTime = 0;
  } catch {}
}

function finishStory(markSeen = true) {
  if (markSeen) {
    localStorage.setItem(
      STORY_SEEN_KEY,
      '1'
    );
  }

  storyRunning = false;

  stopStoryAudio();

  $('#storyIntro')
    ?.classList
    .remove('waiting');

  $('#storyProgressFill').style.width =
    '0%';

  show('start');
}

function syncStorySubtitle() {
  const audio = $('#storyAudio');

  if (
    !audio ||
    !storyRunning
  ) {
    return;
  }

  const duration =
    Number.isFinite(audio.duration) &&
    audio.duration > 0
      ? audio.duration
      : 1;

  const progress =
    Math.max(
      0,
      Math.min(
        1,
        audio.currentTime / duration
      )
    );

  const index =
    Math.min(
      storyLines.length - 1,
      Math.floor(
        progress *
        storyLines.length
      )
    );

  $('#storySubtitle').textContent =
    storyLines[index];

  $('#storyProgressFill').style.width =
    `${progress * 100}%`;
}

async function startStoryAudio() {
  const intro = $('#storyIntro');
  const audio = $('#storyAudio');

  if (
    !intro ||
    !audio
  ) {
    show('start');
    return;
  }

  intro.classList.remove(
    'waiting'
  );

  audio.volume =
    sound
      ? 1
      : 0;

  try {
    audio.currentTime = 0;
  } catch {}

  try {
    await audio.play();
  } catch {
    /*
      Browser blockieren Audio teilweise,
      bis der Spieler einmal geklickt hat.
    */
    intro.classList.add(
      'waiting'
    );

    $('#storySubtitle').textContent =
      'Klicke auf „INTRO STARTEN“, um die Geschichte mit Ton abzuspielen.';
  }
}

async function playStory(
  replay = false
) {
  storyReplay = replay;
  storyRunning = true;

  show('storyIntro');

  $('#storySubtitle').textContent =
    storyLines[0];

  $('#storyProgressFill').style.width =
    '0%';

  await startStoryAudio();
}

$('#storyAudio')
  ?.addEventListener(
    'timeupdate',
    syncStorySubtitle
  );

$('#storyAudio')
  ?.addEventListener(
    'ended',
    () => {
      finishStory(true);
    }
  );

$('#storyAudio')
  ?.addEventListener(
    'error',
    () => {
      storyRunning = false;

      $('#storySubtitle').textContent =
        'Die Intro-Audiodatei konnte nicht geladen werden.';

      $('#storyIntro')
        ?.classList
        .add('waiting');
    }
  );

$('#storyStartBtn').onclick =
  async () => {
    sfx.click();
    await startStoryAudio();
  };

$('#storySkipBtn').onclick =
  () => {
    sfx.click();
    finishStory(true);
  };

$('#storyBtn').onclick =
  () => {
    sfx.click();
    playStory(true);
  };


/* =========================================================
   PRELOAD
========================================================= */

async function preload() {

  const steps = [
    'Discord-Account wird geprüft…',
    'Renderer wird vorbereitet…',
    'Map wird vorgeladen…',
    'Effekte werden vorbereitet…',
    'Netzwerk wird vorbereitet…',
    'Fast fertig…'
  ];

  for (
    let i = 0;
    i < steps.length;
    i++
  ) {

    $('#loadText').textContent =
      steps[i];

    const p =
      Math.round(
        (i + 1) /
        steps.length *
        100
      );

    $('#loadFill').style.width =
      p + '%';

    $('#loadPct').textContent =
      p + '%';

    if (i === 1) {
      ctx.drawImage(
        bg,
        0,
        0
      );

      ctx.clearRect(
        0,
        0,
        W,
        H
      );
    }

    await new Promise(
      r =>
        setTimeout(
          r,
          70
        )
    );
  }

  await boot();

  if (
    localStorage.getItem(
      STORY_SEEN_KEY
    ) !== '1'
  ) {
    await playStory(false);
  } else {
    show('start');
  }
}


/* =========================================================
   BOOT
========================================================= */

async function boot() {

  const r =
    await fetch(
      '/api/me',
      {
        credentials:
          'same-origin'
      }
    );

  if (
    r.status === 401
  ) {
    location.replace(
      '/login'
    );

    throw new Error(
      'login required'
    );
  }

  meProfile =
    await r.json();

  localStorage.setItem(
    'ccName',
    meProfile.name
  );

  skin =
    'discord';

  /*
    Socket.IO wird über
    /socket.io/socket.io.js
    in index.html geladen.
  */

  if (
    typeof io !==
    'function'
  ) {
    throw new Error(
      'Socket.IO wurde nicht geladen.'
    );
  }

  socket = io({
    transports: [
      'websocket'
    ]
  });

  socket.on(
    'joined',
    d => {
      myId = d.id;
      room = d.room;

      $('#roomCode').textContent =
        room;

      show('lobby');

      sfx.bonus();
    }
  );

  socket.on(
    'err',
    toast
  );

  socket.on(
    'state',
    s => {
      prevS = S;
      S = s;

      sync();
    }
  );
}


/* =========================================================
   MENU
========================================================= */

$('#playBtn').onclick =
  () => {
    sfx.click();
    show('groups');
  };

$('#joinOpenBtn').onclick =
  () => {
    sfx.click();

    $('#joinBox')
      .classList
      .toggle('on');
  };

$('#createBtn').onclick =
  () => {
    sfx.click();

    socket.emit(
      'create',
      {}
    );
  };

$('#joinBtn').onclick =
  () => {
    sfx.click();

    socket.emit(
      'join',
      {
        room:
          $('#codeInput').value
      }
    );
  };

$('#copyBtn').onclick =
  async () => {
    sfx.click();

    await navigator.clipboard
      .writeText(
        room || ''
      );

    toast(
      'Gruppencode kopiert!'
    );
  };


$('#soundBtn').textContent =
  sound
    ? '🔊 SOUND AN'
    : '🔇 SOUND AUS';

$('#soundBtn').onclick =
  () => {

    sound =
      !sound;

    localStorage.setItem(
      'ccSound',
      sound
        ? 'on'
        : 'off'
    );

    $('#soundBtn').textContent =
      sound
        ? '🔊 SOUND AN'
        : '🔇 SOUND AUS';

    const storyAudio =
      $('#storyAudio');

    if (storyAudio) {
      storyAudio.volume =
        sound
          ? 1
          : 0;
    }

    if (sound) {
      sfx.power();
    }
  };


document.addEventListener(
  'click',
  e => {

    const g =
      e.target
        .closest(
          '[data-go]'
        )
        ?.dataset.go;

    if (!g) return;

    sfx.click();

    show(g);

    if (
      g === 'lb'
    ) {
      loadLb();
    }
  }
);


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLb() {

  const d =
    await fetch(
      '/api/leaderboard'
    ).then(
      r => r.json()
    );

  $('#records').innerHTML =
    d.records
      .map(
        r =>
          `<div class="pl">
            <span>${DIFF[r.difficulty] || r.difficulty}</span>
            <span class="n">${esc(r.name)}</span>
            <b>${r.score}</b>
          </div>`
      )
      .join('');

  $('#lbList').innerHTML =
    d.top
      .map(
        (r, i) =>
          `<div class="pl">
            <span>${['🥇', '🥈', '🥉'][i] || i + 1 + '.'}</span>
            <span class="n">${esc(r.name)}</span>
            <b>${r.best}</b>
          </div>`
      )
      .join('');
}


/* =========================================================
   GAME STATE
========================================================= */

function sync() {

  if (!S) return;

  const me =
    S.players.find(
      p =>
        p.id === myId
    );

  const oldMe =
    prevS?.players?.find(
      p =>
        p.id === myId
    );

  const host =
    S.host === myId;

  const playing =
    [
      'playing',
      'countdown'
    ].includes(
      S.phase
    );

  const battle =
    S.mode === 'battle';


  document.body
    .classList
    .toggle(
      'playing',
      playing
    );

  document.body
    .classList
    .toggle(
      'battle',
      battle
    );


  if (
    playing &&
    screen !== 'hud'
  ) {
    show('hud');
  }

  if (
    S.phase === 'lobby' &&
    screen !== 'lobby'
  ) {
    show('lobby');
  }

  if (
    S.phase === 'over' &&
    screen !== 'over'
  ) {
    show('over');
  }


  /* -------------------------
     LOBBY
  ------------------------- */

  if (
    S.phase === 'lobby'
  ) {

    $('#roomCode').textContent =
      room || '------';

    $('#plist').innerHTML =
      S.players
        .map(
          p =>
            `<div class="pl">
              <div class="ph"></div>

              <span class="n ${
                battle
                  ? (
                    p.team === 'red'
                      ? 'teamRed'
                      : 'teamBlue'
                  )
                  : ''
              }">

                ${
                  battle &&
                  S.battleType === 'teams'
                    ? (
                      p.team === 'red'
                        ? '🔴 '
                        : '🔵 '
                    )
                    : ''
                }

                ${esc(p.name)}

                ${
                  p.id === S.host
                    ? '👑'
                    : ''
                }

                ${
                  p.id === myId
                    ? '(du)'
                    : ''
                }

              </span>

              <span class="ok">
                ${
                  p.id === S.host ||
                  p.ready
                    ? '✔ BEREIT'
                    : '…'
                }
              </span>
            </div>`
        )
        .join('');


    $('#readyBtn').style.display =
      host
        ? 'none'
        : '';

    $('#readyBtn').textContent =
      me?.ready
        ? 'NICHT BEREIT'
        : 'BEREIT';

    $('#startBtn').style.display =
      host
        ? ''
        : 'none';

    $('#startBtn').disabled =
      !S.players
        .filter(
          p =>
            p.on &&
            p.id !== S.host
        )
        .every(
          p =>
            p.ready
        );


    $('#mode').value =
      S.mode;

    $('#mode').disabled =
      !host;


    $('#battleOptions')
      .classList
      .toggle(
        'on',
        battle
      );


    $('#classicOptions')
      .style
      .display =
        battle
          ? 'none'
          : 'flex';


    $('#battleType').value =
      S.battleType;

    $('#battleType').disabled =
      !host;


    $('#mapSelect').value =
      S.map;

    $('#mapSelect').disabled =
      !host;


    $('#difficulty').value =
      S.difficulty;

    $('#difficulty').disabled =
      !host;


    const cfg =
      battle
        ? `⚔️ ${
            S.battleType === 'teams'
              ? 'TEAMS'
              : 'FFA'
          } · 7 MIN · ${
            ({
              temple:
                '🏯 DRAGON TEMPLE',

              harbor:
                '🎆 FIREWORK HARBOR',

              bamboo:
                '🎋 BAMBOO FORT'
            })[S.map]
          }`

        : DIFF[
            S.difficulty
          ];


    $('#lobbyMsg').textContent =
      `${
        S.players.filter(
          p => p.on
        ).length
      }/8 Spieler · ${cfg}${
        host &&
        S.players.filter(
          p => p.on
        ).length === 1
          ? ' · Solo-Test möglich!'
          : ''
      }`;
  }


  /* -------------------------
     PLAYING
  ------------------------- */

  if (playing) {

    $('#timer').textContent =
      Math.ceil(
        S.left / 1000
      );

    $('#difficultyHud').textContent =
      battle
        ? `⚔️ ${
            S.battleType ===
            'teams'
              ? 'TEAMS'
              : 'FFA'
          }`

        : (
          DIFF[
            S.difficulty
          ] ||
          S.difficulty
        );

    $('#count').textContent =
      S.cd || '';


    $('#board').innerHTML =
      [...S.players]
        .sort(
          (a, b) =>
            battle
              ? (
                b.kills -
                a.kills ||
                a.deaths -
                b.deaths
              )
              : (
                Number(a.dead) -
                Number(b.dead) ||
                b.score -
                a.score
              )
        )
        .map(
          p =>
            `<div class="${
              p.id === myId
                ? 'me'
                : ''
            }">

              <span>
                ${
                  battle &&
                  S.battleType === 'teams'
                    ? (
                      p.team === 'red'
                        ? '🔴'
                        : '🔵'
                    )
                    : ''
                }

                ${esc(p.name)}
              </span>

              <b>
                ${
                  battle
                    ? `${p.kills} K / ${p.deaths} D`
                    : p.score
                }
              </b>

            </div>`
        )
        .join('');


    $('#combo').textContent =
      !battle &&
      me?.combo > 1
        ? `🔥 x${me.combo} COMBO`
        : '';


    const pw =
      me?.powers || {};


    $('#powers').innerHTML =
      battle
        ? ''
        : [
            ['🧲', pw.magnet],
            ['🛡️', pw.shield],
            ['✨', pw.double],
            ['👻', pw.ghost]
          ]
            .filter(
              x =>
                x[1] > 0
            )
            .map(
              x =>
                `${x[0]} ${
                  Math.ceil(
                    x[1] / 1000
                  )
                }s`
            )
            .join('<br>');


    $('#banner').textContent =
      S.banner || '';


    const hp =
      me?.hp ?? 0;

    const max =
      me?.maxHp || 100;

    const pct =
      Math.max(
        0,
        Math.min(
          100,
          hp / max * 100
        )
      );


    $('#healthText').textContent =
      `${hp} / ${max}`;

    $('#healthFill').style.width =
      pct + '%';

    $('#healthFill').style.filter =
      pct <= 30
        ? 'brightness(1.5)'
        : '';


    if (battle) {

      const guns =
        me?.guns || [];

      const g =
        guns[
          me?.slot || 0
        ];


      $('#weaponHud').innerHTML =
        `⚔️ ${
          g
            ? `${
                esc(g.name)
              } <span class="modeTag">${
                g.rarity
              }</span><br>🔸 ${
                g.ammo
              }/${
                g.mag
              }${
                g.reload > 0
                  ? ' · NACHLADEN…'
                  : ''
              }`

            : 'Keine Waffe'
        }

        <br>

        🔥 Kills: ${
          me?.kills || 0
        } ·

        ☠️ Tode: ${
          me?.deaths || 0
        } ·

        👑 Streak: ${
          me?.streak || 0
        }

        <br>

        <small>
          Slot 1: ${
            esc(
              guns[0]?.name ||
              '-'
            )
          } ·

          Slot 2: ${
            esc(
              guns[1]?.name ||
              '-'
            )
          }
        </small>`;


      $('#spec').innerHTML =
        me?.dead
          ? `<span class="respawn">
              💀 RESPAWN IN ${
                Math.max(
                  1,
                  Math.ceil(
                    (me.respawn || 0) /
                    1000
                  )
                )
              }s
            </span>`
          : '';

    } else {

      $('#spec').textContent =
        me?.dead
          ? '💀 DU BIST TOT – DIE RUNDE IST FÜR DICH VERLOREN'

          : (
            me?.spec
              ? '👀 Du schaust zu'
              : ''
          );
    }
  }


  /* -------------------------
     GAME OVER
  ------------------------- */

  if (
    S.phase === 'over'
  ) {

    $('#overDifficulty').textContent =
      battle
        ? `⚔️ BATTLE · ${
            S.battleType ===
            'teams'
              ? 'TEAMS'
              : 'FFA'
          } · 7 MIN`

        : (
          DIFF[
            S.difficulty
          ] ||
          S.difficulty
        );


    $('#rank').innerHTML =
      S.ranking
        .map(
          (p, i) =>
            `<div class="pl">

              <span>
                ${
                  ['🥇', '🥈', '🥉'][i] ||
                  i + 1 + '.'
                }
              </span>

              <span class="n">

                ${
                  S.battleType === 'teams' &&
                  battle
                    ? (
                      p.team === 'red'
                        ? '🔴 '
                        : '🔵 '
                    )
                    : ''
                }

                ${esc(p.name)}

              </span>

              <b>
                ${
                  battle
                    ? `${p.kills} K · ${p.deaths} D · 🔥 ${p.bestStreak}`
                    : `${p.score} P · ❤️ ${p.hp}`
                }
              </b>

            </div>`
        )
        .join('');


    $('#awards').innerHTML =
      battle

        ? `💥 Kill Master: <b>${
            esc(
              S.awards?.killer ||
              '-'
            )
          }</b><br>

          🔥 Streak King: <b>${
            esc(
              S.awards?.streak ||
              '-'
            )
          }</b><br>

          🛡️ Survivor: <b>${
            esc(
              S.awards?.survivor ||
              '-'
            )
          }</b>`

        : `🪙 Coin Master: <b>${
            esc(
              S.awards?.coin ||
              '-'
            )
          }</b><br>

          🔥 Combo King: <b>${
            esc(
              S.awards?.combo ||
              '-'
            )
          }</b><br>

          🐉 Dragon Dodger: <b>${
            esc(
              S.awards?.dodger ||
              '-'
            )
          }</b>`;


    const mine =
      S.ranking.find(
        p =>
          p.id === myId
      );


    $('#resultTitle').textContent =
      battle
        ? (
          S.ranking[0]?.id === myId
            ? '👑 BATTLE CHAMPION'
            : '⚔️ BATTLE BEENDET'
        )

        : (
          mine?.dead
            ? '💀 AUSGESCHIEDEN'
            : '👑 DRAGON CHAMPION'
        );


    $('#againBtn').style.display =
      host
        ? ''
        : 'none';

    $('#lobbyBtn').style.display =
      host
        ? ''
        : 'none';

    $('#againMsg').textContent =
      host
        ? 'Neue Runde oder zurück zur Lobby.'
        : 'Warte auf den Host…';
  }


  /* -------------------------
     SOUNDS
  ------------------------- */

  if (
    prevS &&
    me &&
    oldMe
  ) {

    if (
      me.hp < oldMe.hp
    ) {
      sfx.damage();
    }

    if (
      !battle &&
      me.dead &&
      !oldMe.dead
    ) {
      sfx.death();
    }

    if (
      battle &&
      me.deaths >
      oldMe.deaths
    ) {
      sfx.death();
    }

    if (
      !battle &&
      me.score >
      oldMe.score &&
      localTaken.size === 0
    ) {
      sfx.coin();
    }

    if (
      !battle &&
      me.combo >
      oldMe.combo &&
      me.combo >= 5
    ) {
      sfx.combo();
    }

    if (
      battle &&
      me.kills >
      oldMe.kills
    ) {
      sfx.kill();
    }

    const op =
      oldMe.powers || {};

    const np =
      me.powers || {};

    if (
      !battle &&
      [
        'magnet',
        'shield',
        'double',
        'ghost'
      ].some(
        k =>
          (np[k] || 0) >
          (op[k] || 0) +
          1000
      )
    ) {
      sfx.power();
    }
  }


  if (
    prevS?.phase ===
    'countdown' &&
    S.phase ===
    'playing'
  ) {
    sfx.go();

  } else if (
    S.phase ===
    'countdown' &&
    prevS?.cd !== S.cd
  ) {
    sfx.countdown();
  }


  if (
    S.banner &&
    S.banner !==
    prevS?.banner
  ) {

    S.kind ===
    'dragon'
      ? sfx.dragon()
      : sfx.bonus();
  }


  if (
    prevS?.phase !==
    'over' &&
    S.phase ===
    'over'
  ) {

    S.ranking[0]?.id ===
    myId
      ? sfx.win()
      : sfx.lose();
  }
}


/* =========================================================
   LOBBY CONTROLS
========================================================= */

$('#readyBtn').onclick =
  () => {

    sfx.click();

    socket.emit(
      'ready',
      !S?.players.find(
        p =>
          p.id === myId
      )?.ready
    );
  };


$('#startBtn').onclick =
  () => {
    sfx.click();

    socket.emit(
      'start'
    );
  };


$('#againBtn').onclick =
  () => {
    sfx.click();

    socket.emit(
      'start'
    );
  };


$('#lobbyBtn').onclick =
  () => {
    sfx.click();

    socket.emit(
      'lobby'
    );
  };


$('#difficulty').onchange =
  e => {
    sfx.click();

    socket.emit(
      'difficulty',
      e.target.value
    );
  };


$('#mode').onchange =
  e => {
    sfx.click();

    socket.emit(
      'mode',
      e.target.value
    );
  };


$('#battleType').onchange =
  e => {
    sfx.click();

    socket.emit(
      'battleType',
      e.target.value
    );
  };


$('#mapSelect').onchange =
  e => {
    sfx.click();

    socket.emit(
      'map',
      e.target.value
    );
  };


/* =========================================================
   MOVEMENT
========================================================= */

const keys = {};

let jx = 0;
let jy = 0;
let last = '';


function inputVector() {

  const kx =
    (
      keys.d ||
      keys.arrowright
        ? 1
        : 0
    ) -
    (
      keys.a ||
      keys.arrowleft
        ? 1
        : 0
    );

  const ky =
    (
      keys.s ||
      keys.arrowdown
        ? 1
        : 0
    ) -
    (
      keys.w ||
      keys.arrowup
        ? 1
        : 0
    );


  if (
    kx ||
    ky
  ) {

    if (
      kx &&
      ky
    ) {

      const SIDE = .82;
      const FORWARD = .57;

      return {
        dx:
          kx * SIDE,

        dy:
          ky * FORWARD
      };
    }

    return {
      dx: kx,
      dy: ky
    };
  }


  let dx = jx;
  let dy = jy;

  const m =
    Math.hypot(
      dx,
      dy
    );

  if (
    m > 1
  ) {
    dx /= m;
    dy /= m;
  }

  return {
    dx,
    dy
  };
}


function sendInput(
  force = false
) {

  if (
    !socket ||
    S?.phase !==
    'playing'
  ) {
    return;
  }

  const me =
    S.players.find(
      p =>
        p.id === myId
    );

  if (
    me?.dead
  ) {
    return;
  }


  const {
    dx,
    dy
  } =
    inputVector();


  const k =
    dx.toFixed(3) +
    ':' +
    dy.toFixed(3);


  if (
    force ||
    k !== last
  ) {

    last = k;

    socket.emit(
      'input',
      {
        dx,
        dy
      }
    );
  }
}


addEventListener(
  'keydown',
  e => {

    keys[
      e.key.toLowerCase()
    ] = 1;


    if (
      e.key.startsWith(
        'Arrow'
      )
    ) {
      e.preventDefault();
    }


    sendInput(true);


    if (
      S?.mode ===
      'battle' &&
      S.phase ===
      'playing'
    ) {

      if (
        e.key === ' '
      ) {
        e.preventDefault();

        socket.emit(
          'shoot'
        );

        sfx.shot();
      }


      if (
        e.key
          .toLowerCase() ===
        'r'
      ) {

        socket.emit(
          'reload'
        );

        sfx.reload();
      }


      if (
        e.key === '1' ||
        e.key === '2'
      ) {

        socket.emit(
          'switch',
          Number(e.key) - 1
        );
      }
    }
  }
);


addEventListener(
  'keyup',
  e => {

    delete keys[
      e.key.toLowerCase()
    ];

    sendInput(true);
  }
);


addEventListener(
  'blur',
  () => {

    for (
      const k in keys
    ) {
      delete keys[k];
    }

    jx = 0;
    jy = 0;

    sendInput(true);
  }
);


/* =========================================================
   MOBILE JOYSTICK
========================================================= */

const joy =
  $('#joy');

const knob =
  $('#knob');


function jm(t) {

  const r =
    joy.getBoundingClientRect();

  const x =
    (
      t.clientX -
      r.left -
      65
    ) / 65;

  const y =
    (
      t.clientY -
      r.top -
      65
    ) / 65;

  const l =
    Math.hypot(
      x,
      y
    ) || 1;

  const a =
    Math.min(
      1,
      l
    );

  jx =
    x / l * a;

  jy =
    y / l * a;


  knob.style.transform =
    `translate(${
      jx * 40
    }px,${
      jy * 40
    }px)`;


  sendInput(true);
}


joy.addEventListener(
  'touchstart',
  e => {

    e.preventDefault();

    jm(
      e.touches[0]
    );

  },
  {
    passive: false
  }
);


joy.addEventListener(
  'touchmove',
  e => {

    e.preventDefault();

    jm(
      e.touches[0]
    );

  },
  {
    passive: false
  }
);


joy.addEventListener(
  'touchend',
  () => {

    jx = 0;
    jy = 0;

    knob.style.transform =
      '';

    sendInput(true);
  }
);


setInterval(
  () =>
    sendInput(false),
  100
);


/* =========================================================
   BATTLE MOUSE / SHOOT
========================================================= */

let mouseX =
  W / 2;

let mouseY =
  H / 2;


cv.addEventListener(
  'mousemove',
  e => {

    const r =
      cv.getBoundingClientRect();

    mouseX =
      (
        e.clientX -
        r.left
      ) *
      W /
      r.width;

    mouseY =
      (
        e.clientY -
        r.top
      ) *
      H /
      r.height;


    const me =
      S?.players?.find(
        p =>
          p.id === myId
      );


    if (
      me &&
      S?.mode ===
      'battle'
    ) {

      socket?.emit(
        'aim',
        {
          x:
            mouseX -
            me.x,

          y:
            mouseY -
            me.y
        }
      );
    }
  }
);


let firing = false;
let lastLocalShot = 0;


const fire = () => {

  if (
    S?.mode ===
    'battle' &&
    S.phase ===
    'playing'
  ) {

    socket?.emit(
      'shoot'
    );


    if (
      performance.now() -
      lastLocalShot >
      120
    ) {

      sfx.shot();

      lastLocalShot =
        performance.now();
    }
  }
};


cv.addEventListener(
  'mousedown',
  e => {

    if (
      e.button === 0
    ) {
      firing = true;
      fire();
    }
  }
);


addEventListener(
  'mouseup',
  () =>
    firing = false
);


setInterval(
  () => {
    if (firing) {
      fire();
    }
  },
  70
);


$('#fireBtn')
  .addEventListener(
    'touchstart',
    e => {

      e.preventDefault();

      firing = true;

      fire();

    },
    {
      passive: false
    }
  );


$('#fireBtn')
  .addEventListener(
    'touchend',
    e => {

      e.preventDefault();

      firing = false;

    },
    {
      passive: false
    }
  );


/* =========================================================
   AVATARS / ITEMS
========================================================= */

const avatarCache =
  new Map();


function avatarImg(url) {

  if (!url) {
    return null;
  }

  let im =
    avatarCache.get(url);

  if (!im) {

    im =
      new Image();

    im.crossOrigin =
      'anonymous';

    im.src =
      url;

    avatarCache.set(
      url,
      im
    );
  }

  return im;
}


const disp = {};


const EM = {
  coin: '🪙',
  lantern: '🏮',
  baozi: '🥟',
  mahjong: '🀄',
  panda: '🐼',
  envelope: '🧧',
  magnet: '🧲',
  shield: '🛡️',
  double: '✨',
  ghost: '👻'
};


const localTaken =
  new Map();


function predictPickups(
  x,
  y,
  t
) {

  if (
    S?.mode !==
    'classic' ||
    S?.phase !==
    'playing'
  ) {
    return;
  }


  for (
    const i of
    S.items || []
  ) {

    if (
      i.id == null ||
      localTaken.has(
        i.id
      )
    ) {
      continue;
    }

    const r =
      i.t === 'coin'
        ? 36
        : 50;


    if (
      Math.hypot(
        x - i.x,
        y - i.y
      ) < r
    ) {

      localTaken.set(
        i.id,
        t + 900
      );

      socket?.emit(
        'pickup',
        {
          id: i.id,
          x,
          y
        }
      );

      sfx.coin();
    }
  }


  for (
    const [
      id,
      until
    ] of localTaken
  ) {

    if (
      until < t &&
      !S.items?.some(
        i =>
          i.id === id
      )
    ) {
      localTaken.delete(
        id
      );
    }
  }
}


/* =========================================================
   BACKGROUND
========================================================= */

const bg =
  document.createElement(
    'canvas'
  );

bg.width = W;
bg.height = H;

const b =
  bg.getContext(
    '2d'
  );

const grad =
  b.createLinearGradient(
    0,
    0,
    0,
    H
  );

grad.addColorStop(
  0,
  '#21050b'
);

grad.addColorStop(
  1,
  '#0d0206'
);

b.fillStyle =
  grad;

b.fillRect(
  0,
  0,
  W,
  H
);

b.globalAlpha =
  .25;

b.font =
  '46px serif';

[
  ['🏯', 110, 120],
  ['🏯', 1490, 120],
  ['🌸', 300, 220],
  ['🏮', 500, 120],
  ['🌉', 1250, 680],
  ['💧', 1300, 760]
].forEach(
  x =>
    b.fillText(
      ...x
    )
);


/* =========================================================
   ITEMS
========================================================= */

function drawItem(
  i,
  t
) {

  const y =
    i.y +
    Math.sin(
      t / 220 +
      i.x
    ) * 4;

  const isCoin =
    i.t === 'coin';

  const r =
    isCoin
      ? 22
      : 38;


  ctx.save();

  ctx.beginPath();

  ctx.arc(
    i.x,
    y,
    r,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    isCoin
      ? 'rgba(45,28,0,.78)'
      : 'rgba(30,5,8,.85)';

  ctx.fill();

  ctx.lineWidth =
    isCoin
      ? 3
      : 4;

  ctx.strokeStyle =
    '#f4c542';

  ctx.stroke();

  ctx.font =
    (
      isCoin
        ? '32'
        : '52'
    ) +
    'px serif';

  ctx.textAlign =
    'center';

  ctx.textBaseline =
    'middle';

  ctx.fillText(
    EM[i.t] || '❓',
    i.x,
    y
  );

  ctx.restore();
}


/* =========================================================
   RENDER LOOP
========================================================= */

let lastFrame =
  performance.now();


function draw(t) {

  requestAnimationFrame(
    draw
  );

  const frameDt =
    Math.min(
      .05,
      Math.max(
        0,
        (
          t -
          lastFrame
        ) /
        1000
      )
    );

  lastFrame = t;


  ctx.drawImage(
    bg,
    0,
    0
  );


  if (
    !S ||
    ![
      'playing',
      'countdown'
    ].includes(
      S.phase
    )
  ) {
    return;
  }


  ctx.textAlign =
    'center';

  ctx.textBaseline =
    'middle';


  /* BATTLE MAP */

  if (
    S.mode ===
    'battle'
  ) {

    ctx.globalAlpha =
      .22;

    ctx.font =
      '54px serif';


    if (
      S.map ===
      'harbor'
    ) {

      ctx.fillText(
        '🎆',
        240,
        160
      );

      ctx.fillText(
        '🚢',
        1360,
        700
      );

      ctx.fillText(
        '🏮',
        800,
        120
      );

    } else if (
      S.map ===
      'bamboo'
    ) {

      ctx.fillText(
        '🎋',
        220,
        180
      );

      ctx.fillText(
        '🎋',
        1380,
        180
      );

      ctx.fillText(
        '🐼',
        800,
        760
      );

    } else {

      ctx.fillText(
        '🏯',
        800,
        120
      );

      ctx.fillText(
        '🐉',
        1350,
        720
      );

      ctx.fillText(
        '🏮',
        260,
        720
      );
    }

    ctx.globalAlpha =
      1;
  }


  /* BATTLE ITEMS */

  if (
    S.mode ===
    'battle'
  ) {

    for (
      const g of
      S.weaponDrops || []
    ) {

      ctx.save();

      ctx.beginPath();

      ctx.arc(
        g.x,
        g.y,
        27,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        '#160b12';

      ctx.fill();


      ctx.strokeStyle =
        g.rarity === 'MYTHIC'
          ? '#51ffd1'

          : g.rarity ===
            'LEGENDARY'
            ? '#ffd24d'

            : g.rarity ===
              'EPIC'
              ? '#c56cff'

              : g.rarity ===
                'RARE'
                ? '#65a8ff'

                : '#ddd';


      ctx.lineWidth =
        3;

      ctx.stroke();

      ctx.font =
        '25px serif';


      ctx.fillText(
        g.key ===
        'firecracker'
          ? '🧨'

          : g.key ===
            'panda'
            ? '🐼'
            : '🔫',

        g.x,
        g.y
      );

      ctx.restore();
    }


    for (
      const m of
      S.medkits || []
    ) {

      ctx.beginPath();

      ctx.arc(
        m.x,
        m.y,
        22,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        '#24080d';

      ctx.fill();

      ctx.strokeStyle =
        '#ff657c';

      ctx.lineWidth =
        3;

      ctx.stroke();

      ctx.font =
        '23px serif';

      ctx.fillText(
        '❤️',
        m.x,
        m.y
      );
    }


    for (
      const q of
      S.bullets || []
    ) {

      ctx.beginPath();

      ctx.arc(
        q.x,
        q.y,

        q.key ===
        'firecracker'
          ? 8
          : 5,

        0,
        Math.PI * 2
      );


      ctx.fillStyle =
        q.key ===
        'jade'
          ? '#51ffd1'

          : q.key ===
            'firecracker'
            ? '#ffd24d'
            : '#fff3b0';

      ctx.fill();
    }

  } else {

    /* CLASSIC */

    for (
      const h of
      S.hazards || []
    ) {

      ctx.beginPath();

      ctx.arc(
        h.x,
        h.y,
        90,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        h.boom
          ? 'rgba(255,80,0,.45)'
          : 'rgba(255,0,0,.12)';

      ctx.fill();

      ctx.strokeStyle =
        '#ff4b4b';

      ctx.lineWidth =
        4;

      ctx.stroke();

      ctx.font =
        '38px serif';

      ctx.fillText(
        h.boom
          ? '💥'
          : '⚠️',

        h.x,
        h.y
      );
    }


    ctx.font =
      '42px serif';


    for (
      const f of
      S.fires || []
    ) {
      ctx.fillText(
        '🔥',
        f.x,
        f.y
      );
    }


    for (
      const i of
      S.items || []
    ) {

      if (
        !localTaken.has(
          i.id
        )
      ) {
        drawItem(
          i,
          t
        );
      }
    }
  }


  /* PLAYERS */

  for (
    const p of
    S.players || []
  ) {

    const d =
      disp[p.id] ??= {
        x: p.x,
        y: p.y
      };


    if (
      p.id === myId &&
      S.phase ===
      'playing' &&
      !p.dead
    ) {

      const v =
        inputVector();

      const moving =
        Math.hypot(
          v.dx,
          v.dy
        ) > .01;

      const reverse =
        S.mode ===
        'classic' &&
        S.chaos;

      const sp =
        p.fast
          ? 440
          : 285;

      const dx =
        reverse
          ? -v.dx
          : v.dx;

      const dy =
        reverse
          ? -v.dy
          : v.dy;


      if (moving) {

        d.x =
          Math.max(
            30,
            Math.min(
              W - 30,
              d.x +
              dx *
              sp *
              frameDt
            )
          );

        d.y =
          Math.max(
            60,
            Math.min(
              H - 30,
              d.y +
              dy *
              sp *
              frameDt
            )
          );
      }


      const err =
        Math.hypot(
          p.x - d.x,
          p.y - d.y
        );


      if (
        err > 320
      ) {

        d.x = p.x;
        d.y = p.y;

      } else if (
        !moving
      ) {

        const settle =
          1 -
          Math.pow(
            .001,
            frameDt
          );

        d.x +=
          (
            p.x -
            d.x
          ) *
          settle;

        d.y +=
          (
            p.y -
            d.y
          ) *
          settle;
      }


      if (
        S.mode ===
        'classic'
      ) {

        predictPickups(
          d.x,
          d.y,
          t
        );
      }

    } else {

      const follow =
        1 -
        Math.pow(
          .00001,
          frameDt
        );

      d.x +=
        (
          p.x -
          d.x
        ) *
        follow;

      d.y +=
        (
          p.y -
          d.y
        ) *
        follow;
    }


    ctx.save();

    ctx.globalAlpha =
      p.dead
        ? .25
        : 1;

    ctx.beginPath();

    ctx.arc(
      d.x,
      d.y,
      29,
      0,
      Math.PI * 2
    );


    ctx.fillStyle =
      p.hurt
        ? '#ff3333'

        : (
          S.mode ===
          'battle' &&
          S.battleType ===
          'teams'

            ? (
              p.team ===
              'red'
                ? '#8b1730'
                : '#174a8b'
            )

            : '#650b18'
        );


    ctx.fill();

    ctx.lineWidth =
      p.id === myId
        ? 5
        : 3;

    ctx.strokeStyle =
      p.id === myId
        ? '#f4c542'
        : '#fff';

    ctx.stroke();

    ctx.fillStyle =
      '#fff';


    if (p.dead) {

      ctx.font =
        'bold 22px sans-serif';

      ctx.fillText(
        '💀',
        d.x,
        d.y
      );

    } else if (
      p.skin ===
      'flag'
    ) {

      ctx.font =
        '34px serif';

      ctx.fillText(
        '🇨🇳',
        d.x,
        d.y
      );

    } else if (
      p.skin ===
      'discord' &&
      p.avatar
    ) {

      const im =
        avatarImg(
          p.avatar
        );

      if (
        im?.complete &&
        im.naturalWidth
      ) {

        ctx.save();

        ctx.beginPath();

        ctx.arc(
          d.x,
          d.y,
          25,
          0,
          Math.PI * 2
        );

        ctx.clip();

        ctx.drawImage(
          im,
          d.x - 25,
          d.y - 25,
          50,
          50
        );

        ctx.restore();

      } else {

        ctx.font =
          'bold 22px sans-serif';

        ctx.fillText(
          (p.name || '?')[0],
          d.x,
          d.y
        );
      }

    } else {

      ctx.font =
        'bold 22px sans-serif';

      ctx.fillText(
        (p.name || '?')[0],
        d.x,
        d.y
      );
    }


    ctx.font =
      'bold 15px sans-serif';

    ctx.fillStyle =
      p.id === myId
        ? '#f4c542'
        : '#fff';

    ctx.fillText(
      p.name,
      d.x,
      d.y - 43
    );


    if (
      S.mode ===
      'battle' &&
      !p.dead
    ) {

      const g =
        p.guns?.[
          p.slot
        ];

      if (g) {

        const me =
          p.id === myId;

        const ax =
          me
            ? mouseX - d.x
            : 1;

        const ay =
          me
            ? mouseY - d.y
            : 0;

        const l =
          Math.hypot(
            ax,
            ay
          ) || 1;


        ctx.strokeStyle =
          '#f4c542';

        ctx.lineWidth =
          5;

        ctx.beginPath();

        ctx.moveTo(
          d.x,
          d.y
        );

        ctx.lineTo(
          d.x +
          ax / l * 40,

          d.y +
          ay / l * 40
        );

        ctx.stroke();
      }
    }

    ctx.restore();
  }


  if (
    S.dragon
  ) {

    ctx.font =
      '120px serif';

    ctx.fillText(
      '🐉',
      S.dragon.x,
      S.dragon.y
    );
  }
}


requestAnimationFrame(
  draw
);


/* =========================================================
   TOUCH DETECTION
========================================================= */

if (
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0
) {
  document.body
    .classList
    .add('touch');
}


/* =========================================================
   UPDATE / MAINTENANCE
========================================================= */

async function updateGate() {

  const sys =
    await fetch(
      '/api/system',
      {
        cache:
          'no-store'
      }
    ).then(
      r => r.json()
    );


  if (
    sys.maintenance
  ) {

    show(
      'maintenance'
    );


    const poll =
      setInterval(
        async () => {

          try {

            const n =
              await fetch(
                '/api/system',
                {
                  cache:
                    'no-store'
                }
              ).then(
                r => r.json()
              );


            if (
              !n.maintenance
            ) {

              clearInterval(
                poll
              );

              location.reload();
            }

          } catch {}

        },
        5000
      );


    return false;
  }


  const installed =
    localStorage.getItem(
      'ccVersion'
    );


  if (
    installed !==
    sys.version
  ) {

    show(
      'updating'
    );


    $('#updateVersion')
      .textContent =
        `Version ${
          sys.version
        }${
          sys.notes
            ? ' • ' +
              sys.notes
            : ''
        }`;


    const status =
      $('#updateStatus');

    const s2 =
      $('#updateStep2');

    const s3 =
      $('#updateStep3');


    for (
      let p = 0;
      p <= 100;
      p += 2
    ) {

      $('#updateFill')
        .style
        .width =
          p + '%';

      $('#updatePct')
        .textContent =
          p + '%';


      if (
        p < 18
      ) {

        status.textContent =
          'Update wird geprüft…';

      } else if (
        p < 72
      ) {

        s2?.classList.add(
          'active'
        );

        status.textContent =
          'Neue Spieldateien werden geladen…';

      } else if (
        p < 96
      ) {

        s3?.classList.add(
          'active'
        );

        status.textContent =
          'China Chaos wird für dich vorbereitet…';

      } else {

        status.textContent =
          'Fertig – Spiel wird gestartet…';
      }


      await new Promise(
        r =>
          setTimeout(
            r,
            32 +
            Math.random() *
            24
          )
      );
    }


    localStorage.setItem(
      'ccVersion',
      sys.version
    );


    await new Promise(
      r =>
        setTimeout(
          r,
          500
        )
    );
  }


  return true;
}


/* =========================================================
   START
========================================================= */

updateGate()
  .then(
    ok => {

      if (ok) {

        preload()
          .catch(
            e => {

              console.error(
                e
              );

              toast(
                'Startfehler: ' +
                e.message
              );
            }
          );
      }
    }
  )
  .catch(
    e => {

      console.error(
        e
      );

      preload()
        .catch(
          err => {

            console.error(
              err
            );

            toast(
              'Startfehler: ' +
              err.message
            );
          }
        );
    }
  );
