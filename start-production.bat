@echo off
title China Chaos (Produktion)
call npm install
call npx vite build client
set NODE_ENV=production
:loop
node server/index.js
echo Server beendet - Neustart in 5 Sekunden...
timeout /t 5 >nul
goto loop
