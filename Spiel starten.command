#!/bin/bash
# NOCH MAL! auf macOS starten: lokalen HTTP-Server hochfahren und Browser oeffnen.
# Doppelklick im Finder startet dieses Skript im Terminal.
cd "$(dirname "$0")" || exit 1
PORT=8000

echo "NOCH MAL! startet auf http://localhost:$PORT/"
echo "Dieses Fenster offen lassen - Schliessen beendet den Server."

# Browser nach kurzer Verzoegerung oeffnen (Server laeuft danach im Vordergrund).
( sleep 1; open "http://localhost:$PORT/" ) &

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT"
else
  echo "Weder python3 noch Node gefunden - bitte eines davon installieren."
  echo "Taste druecken zum Schliessen..."
  read -n 1 -s
fi
