@echo off
echo === China Chaos Ersteinrichtung ===
where node >nul 2>nul || (echo Node.js fehlt! Installiere es von https://nodejs.org (LTS) und starte dann erneut. & pause & exit /b)
call npm install
if not exist .env copy .env.example .env
echo.
echo FERTIG. Oeffne jetzt die Datei .env und trage deine Discord-Werte ein (siehe README).
pause
