# KarinaIstChinesin👑 – China Chaos

Multiplayer-Spiel (2–8 Spieler) als **Discord Activity** + Bot mit Slash-Commands.
Stack: Node.js, discord.js, Socket.IO (server-authoritative), SQLite, Vite (Client).

> **Wichtig zu Discord:** Eine Activity ist kein normaler Bot. Der Bot startet sie über `/china`, die Spieloberfläche selbst ist eine
> Webseite, die Discord in einem iFrame lädt. Dafür braucht sie eine **öffentliche HTTPS-Adresse** (lokal: ein Tunnel, später: Hosting/Domain).
> Slash-Commands sind in Discord immer **kleingeschrieben**: Du tippst `/china`.

## 1. Voraussetzungen
- Node.js 20+ (LTS) von https://nodejs.org
- Discord-Account + eigener Discord-Server
- Zum lokalen Testen in Discord: `cloudflared` (kostenlos) https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## 2. Installation
Windows: Doppelklick auf `setup.bat`. Sonst im Projektordner:
```
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env)
```

## 3. Discord Bot erstellen (Developer Portal)
1. https://discord.com/developers/applications → **New Application** → Name `KarinaIstChinesin👑` → Create.
2. **General Information:** Hier steht die **Application ID** (= `DISCORD_CLIENT_ID`). Hier kannst du auch das Profilbild hochladen (App Icon).
3. Links **Bot:** Bot-Name setzen, Profilbild hochladen, **Reset Token** → Token kopieren (= `DISCORD_TOKEN`). Niemals teilen!
4. Links **OAuth2:** **Reset Secret** → kopieren (= `DISCORD_CLIENT_SECRET`). Unter **Redirects** `https://127.0.0.1` hinzufügen → Save.
5. Links **Activities → Settings:** **Enable Activities** einschalten.
6. Links **Activities → URL Mappings** (siehe Schritt 6 – die URL hast du erst nach dem Start).
7. **OAuth2 → URL Generator:** Haken bei `bot` und `applications.commands` → unten die URL öffnen → deinen Server wählen → Bot einladen.
8. Optional `DISCORD_GUILD_ID`: Discord → Einstellungen → Erweitert → Entwicklermodus an → Rechtsklick auf deinen Server → ID kopieren. Dann erscheinen Commands sofort.

## 4. Environment Variables (`.env`)
| Variable | Bedeutung |
|---|---|
| `DISCORD_TOKEN` | Bot-Token (Bot → Reset Token) |
| `DISCORD_CLIENT_ID` | Application ID (General Information) |
| `DISCORD_CLIENT_SECRET` | OAuth2 → Client Secret |
| `DISCORD_GUILD_ID` | optional, Server-ID für sofortige Commands |
| `PORT` | Standard 3000 (Hoster setzen das oft selbst) |
| `DATABASE_URL` | Pfad zur SQLite-Datei, Standard `./data/china-chaos.db` |
| `ALLOW_GUEST` | `true` nur zum Testen im normalen Browser, sonst `false` |

## 5. Lokal starten
```
npm start
```
(Windows: `start.bat`). Das baut den Client und startet Bot + Server auf http://localhost:3000.
**Schnelltest ohne Discord:** `ALLOW_GUEST=true` setzen, http://localhost:3000/?room=test in mehreren Tabs öffnen.

## 6. Activity in Discord testen
1. In einem zweiten Terminal: `cloudflared tunnel --url http://localhost:3000` → es erscheint eine Adresse wie `https://xyz.trycloudflare.com`.
2. Developer Portal → **Activities → URL Mappings** (ohne `https://` eintragen):
   - Prefix `/` → Target `xyz.trycloudflare.com`
   - Prefix `/cdn` → Target `cdn.discordapp.com` (für Avatare)
3. **Activities → Settings:** ggf. „Supported Platforms" Desktop/Mobile aktivieren.
4. In Discord: in einen **Sprachkanal** gehen, `/china` tippen → Activity startet. Freunde klicken „Teilnehmen".
Hinweis: Die Tunnel-Adresse ändert sich bei jedem Start – Mapping dann neu eintragen. Mit fester Domain (Schritt 8) entfällt das.

## 7. Commands
`/china` (Spiel starten) · `/help` · `/ping` · `/stats` · `/leaderboard`

## 8. 24/7 Hosting + Domain + HTTPS
Der Server braucht dauerhaft laufendes Node.js mit WebSocket-Support und **persistenter Platte** (SQLite).
**Einfachste Lösung: Railway / Render (Web Service)**
1. Projekt auf GitHub hochladen (ohne `.env`!).
2. Railway/Render → „New → Deploy from GitHub". Build Command: `npm install && npm run build` · Start Command: `npm run start:prod`.
3. Environment Variables aus Tabelle oben eintragen (`ALLOW_GUEST=false`).
4. Persistente Platte/Volume anlegen (z. B. Mount `/data`) und `DATABASE_URL=/data/china-chaos.db` setzen. (Free-Tarife ohne Platte verlieren Statistiken bei Neustart.)
5. HTTPS ist dort automatisch. Die Plattform-Adresse (oder deine Domain) im Developer Portal als URL-Mapping `/` eintragen.
6. Logs: im Dashboard des Hosters. Neustart bei Absturz: macht der Hoster automatisch.

**Eigener VPS (Ubuntu):**
```
sudo apt install -y nodejs npm caddy && sudo npm i -g pm2
git clone <dein-repo> china-chaos && cd china-chaos && npm install && npm run build
cp .env.example .env && nano .env
pm2 start server/index.js --name china-chaos && pm2 save && pm2 startup
pm2 logs china-chaos
```
Caddy (`/etc/caddy/Caddyfile`) mit automatischem HTTPS:
```
game.meinedomain.de {
    reverse_proxy localhost:3000
}
```
`sudo systemctl reload caddy`

**Domain/DNS:** Beim Domain-Anbieter einen **A-Record** `game` → IP deines VPS anlegen (bei Railway/Render stattdessen den angezeigten **CNAME**). 5–60 Minuten warten. Dann im Developer Portal Mapping `/` → `game.meinedomain.de`.

## 9. Troubleshooting
- **Commands erscheinen nicht:** `DISCORD_GUILD_ID` setzen, Bot mit `applications.commands` neu einladen, Discord neu starten (Strg+R).
- **/china zeigt Fehlermeldung:** „Enable Activities" und URL-Mapping prüfen.
- **Weißer Bildschirm in der Activity:** Mapping `/` falsch oder Tunnel nicht gestartet.
- **`npm install` Fehler bei better-sqlite3:** Node-LTS-Version nutzen (20/22); notfalls Visual Studio Build Tools installieren.
- **„Login fehlgeschlagen":** `DISCORD_CLIENT_SECRET` prüfen.

## Spielregeln / Sicherheit
Server berechnet Positionen, Punkte, Items, Events, Timer und Gewinner; Clients senden nur Richtungs-Eingaben (validiert, rate-limitiert).
Disconnect: Spiel läuft weiter, Host wechselt automatisch. Späte Beitritte sind Zuschauer bis zur nächsten Runde. Server-Neustart: Clients verbinden sich automatisch neu.

## V4 – Battle Mode
- Classic bleibt erhalten.
- Neuer 7-Minuten-Battle-Modus: Free For All oder Teams.
- 100 HP, 5 Sekunden Respawn, Kills/Deaths/Streaks.
- Zwei Waffen-Slots, Nachladen, Waffen-Drops und kleine Medkits.
- Waffen: Jade Pistol, Bamboo Repeater, Dragon Blaster, Firecracker Launcher, Jade Beam, Panda Cannon.
- Seltenheiten: Common, Rare, Epic, Legendary, Mythic.
- Drei Battle-Maps: Dragon Temple, Firework Harbor, Bamboo Fort.
- Steuerung Battle: Maus zielen, linke Maustaste halten oder SPACE schießen, R nachladen, 1/2 Waffe wechseln.
- Auf Touch-Geräten: Joystick + Feuerbutton; beim Bewegen wird automatisch in Bewegungsrichtung gezielt.

V4.4: Gameplay/Steuerung basiert exakt auf China-Chaos-V4-Battle. /china wurde lediglich auf privaten Browser-Link umgestellt.
