# China Chaos V5.0 – Discord Accounts

- Discord login required; no guest/IP player accounts.
- `/china` creates a signed short-lived login link.
- Direct web visits use Discord OAuth2.
- Login session lasts 30 days in a secure HttpOnly cookie.
- Discord user ID is the permanent player ID; Discord name/avatar refresh on login.
- Existing stats table remains keyed by player ID.
- Admin panel remains IP/password protected.

Render env: keep your existing Discord variables and GAME_URL. Set RUN_DISCORD_BOT=true. Recommended: add SESSION_SECRET with a long random value (or the app falls back to IP_HASH_SECRET).

Discord Developer Portal -> OAuth2 -> Redirects must contain exactly:
https://china-chaos.onrender.com/auth/discord/callback

IMPORTANT: SQLite is still local. On Render without persistent storage, the database can be lost on redeploy/restart. The account/login system is persistent for 30 days in the browser, but truly permanent game stats require moving the DB to a persistent database service later.
