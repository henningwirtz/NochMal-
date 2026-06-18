# CLAUDE.md

Hinweise für Claude Code beim Arbeiten in diesem Repository.

## Projekt

Browser-Nachbau des Würfelspiels **NOCH MAL!** (Schmidt Spiele) – reines Vanilla
JavaScript (ES-Module), **kein Build-Schritt**, keine Abhängigkeiten. Deutsche Oberfläche.
Unterstützt Pass-and-Play (1–6 Spieler), heuristische KI-Gegner und die Solo-Variante.

## Starten

ES-Module brauchen einen HTTP-Server (kein `file://`):

- **Windows:** `Spiel starten.bat` doppelklicken
- **macOS:** `Spiel starten.command` doppelklicken
- **Manuell:** `npm start` (= `python -m http.server 8000`), dann <http://localhost:8000/>

Beide Startskripte fahren den Server hoch und öffnen den Browser; sie bevorzugen Python
und fallen auf Node (`npx serve`) zurück.

## Tests

```
npm test                 # Regel-/Wertungstests (js/tests/node-runner.mjs)
node js/tests/sim.mjs     # Headless-Smoke-Test: komplette KI-Partien (2–6 + Solo)
```

Im Browser zusätzlich: <http://localhost:8000/tests.html>.
**Nach Änderungen an der Spiellogik immer beide Node-Tests laufen lassen.**

## Architektur

Die Engine ist **datengetrieben** – der Spielplan steckt komplett in Daten, nicht im Code.

- `js/data/board.js` – 15×7-Farbraster (`RAW_GRID`) + Sternpositionen (`STARS`), 1:1 vom
  Originalblock übertragen. `validateBoard()` prüft die Struktur beim Laden. Spielplan
  ändern = nur diese Datei anpassen.
- `js/core/` – reine Logik, DOM-frei: `constants.js` (Farben, Würfel, Wertungstabellen),
  `dice.js`, `rules.js` (legale Platzierungen), `sheet.js` (ein Spielblatt + Wertung),
  `game.js` (Rundenautomat), `ai.js` (Heuristik-KI, `chooseMove`).
- `js/ui/` – Rendering & Ablauf: `boardView.js` (`renderSheet` = ein Blatt),
  `flow.js` (`runGame`/`renderBoards` = alle Spieler-Blöcke gleichzeitig, KI-Züge,
  Log/Ansagen, inline Endwertung), `controls.js` (`humanTurn` = interaktiver Zug,
  nur eigener Block anklickbar).
- `js/main.js` – Setup-Bildschirm & Bootstrap; `backToSetup()` für „Neues Spiel".
  `index.html`, `css/styles.css`.

### Konventionen
- Farbcodes im Raster: `y`=gelb, `n`=grün, `b`=blau, `r`=rot/pink, `o`=orange.
- Jeder Spieler hat ein eigenes `Sheet`; alle Blöcke sind gleichzeitig sichtbar, der
  aktive ist hervorgehoben. KI-Spieler ziehen vollautomatisch über `aiTurn` in `flow.js`
  – bewusst mit Pausen, damit ihr Zug nachvollziehbar ist (Plan hervorheben → setzen).
- Sternfelder: kleines Eck-Kennzeichen (★) oben links; ein gesetztes Kreuz (✕) liegt
  groß in der Mitte, das Feld wird abgedunkelt (`.cell.marked`) – so ist „schon
  angekreuzt" immer eindeutig.
- Spielende: kein eigener Bildschirm; die Endwertung erscheint inline im `#end-panel`
  über den Blöcken (samt „Neues Spiel"-Button), die Blöcke bleiben sichtbar.
- Das Log (`#log`) trennt jeden Wurf mit einem `▶`-Marker (`announceRound`).
- Code-Kommentare und UI-Texte sind auf Deutsch.
