# China Chaos V5.1 – Update Center + Desktop

## Neu
- Admin Update Center: Wartungsmodus an/aus, Versionsnummer, Update-Ankündigung.
- `/china` zeigt während Wartung automatisch eine Geduld-Meldung.
- Beim Wieder-Online-Schalten wird im Discord-Kanal ein Update angekündigt.
- Browser erkennt neue Version und zeigt zuerst einen Update-Download-Bildschirm.
- Windows Desktop-App als Electron-Wrapper vorbereitet.
- GitHub Action `.github/workflows/build-windows.yml` baut `ChinaChaos-Setup.exe`.
- Lege die fertige EXE unter `downloads/ChinaChaos-Setup.exe` ins Repo, dann ist `/download/windows` aktiv.

## Update-Ablauf
1. `/admin` öffnen und `Offline / Update` drücken.
2. Version/Notiz setzen.
3. Code deployen.
4. Im Adminpanel `Spiel wieder online` drücken. Discord erhält automatisch die Update-Meldung.
5. Spieler sehen beim nächsten Start den Versions-Downloader.
