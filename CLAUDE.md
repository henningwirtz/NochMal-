# CLAUDE.md

Hinweise für Claude Code beim Arbeiten in diesem Repository.

## Projekt

Browser-Nachbau des Würfelspiels **NOCH MAL!** (Schmidt Spiele) – reines Vanilla
JavaScript (ES-Module), **kein Build-Schritt**, keine Abhängigkeiten. Deutsche Oberfläche.
Unterstützt Pass-and-Play (1–6 Spieler), heuristische KI-Gegner (3 Schwierigkeitsgrade)
und die Solo-Variante. Läuft als **PWA** (installierbar, offline, touch-optimiert) –
am Handy via GitHub Pages, siehe README („Auf dem Handy spielen").

## Roadmap / geplante Features

Geplante und erledigte Features stehen in **`ROADMAP.md`** (nach Kategorien:
KI/Bots, Spielregeln, UI, Ton, Später).

## Workflow / Git

**Nach jeder Änderung wird diese `CLAUDE.md` aktualisiert und der Fortschritt direkt
auf den `main`-Branch committet und gepusht – keine neuen Branches anlegen.**

**Pläne aus dem Plan Mode sollen verständlich und nachvollziehbar sein** – in klarer,
einfacher Sprache erklärt, sodass auch ohne tiefe Programmierkenntnisse erkennbar ist,
was passiert. Wenn Code im Plan steht, dann möglichst nur einfacher, leicht lesbarer
Code (keine komplizierten Konstrukte).

## Starten

Start-Anleitung siehe `README`. Kurz: ES-Module brauchen einen HTTP-Server (kein
`file://`) – `npm start` bzw. die `Spiel starten`-Skripte (nutzen `serve.py` mit
`Cache-Control: no-store`). Nach Änderungen die `VERSION` in `main.js` hochsetzen
(Anzeige im Setup via `#build-badge`).

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
  `dice.js`, `rules.js` (legale Platzierungen; `isRelaxedPlacement` für den Notizblock-
  Modus: unabhängig von den Würfeln, aber regelkonform – zusammenhängend, verankert,
  **nur eine Farbe pro Zug**, max. 5 Felder), `sheet.js` (ein Spielblatt + Wertung),
  `game.js` (Rundenautomat; Optionen `aiDifficulty`, `relaxed`; `submitMarks` kreuzt im
  Notizblock-Modus frei gewählte, regelkonform erreichbare Felder ohne Würfel-Prüfung an),
  `ai.js` (Heuristik-KI,
  `chooseMove(sheet, pool, difficulty)`; Stufen `leicht`/`mittel`/`schwer` über `CFG`,
  die die strategische Gewichtung skalieren).
- `js/ui/` – Rendering & Ablauf: `boardView.js` (`renderSheet` = ein Blatt),
  `flow.js` (`runGame` = **schrittweiser, event-gesteuerter Ablauf**: jeder Schritt –
  Würfeln, Zug eines Spielers, auch der KI – wird per Klick ausgelöst; `present()` ist die
  zentrale Weiche, die aus dem Spielzustand ableitet, was als Nächstes dran ist
  (`presentRoll`/`presentChooser`/`presentAi`/`runAi`/`advance`). Vor jedem Zug wird ein
  `game.snapshot()` in den `history`-Stack gelegt, die Zurück-Taste (`onUndo`) stellt den
  vorigen Zustand wieder her. `renderBoards` = alle Spieler-Blöcke gleichzeitig,
  Log/Ansagen, inline Endwertung), `controls.js` (`humanTurn` = interaktiver Zug,
  nur eigener Block anklickbar; „↶ Feld zurück" wählt einzelne gewählte Felder VOR dem
  Bestätigen wieder ab + optionaler Zug-Timer),
  `storage.js` (localStorage: Bestenliste `recordResults`/`getScores`/`removeScoreAt`/
  `clearScores`, Setup-Einstellungen `loadSettings`/`saveSettings`, globale Präferenzen
  `loadPrefs`/`savePrefs`), `sound.js` (WebAudio-Effekte: `playRoll`/`playMark`/
  `playEnd`, `setMuted`/`isMuted` – keine externen Audiodateien).
- `js/main.js` – Setup-Bildschirm & Bootstrap; `backToSetup()` für „Neues Spiel";
  rendert die Bestenliste, stellt zuletzt genutzte Einstellungen wieder her, steuert
  Hell/Dunkel-Theme + Ton (oben rechts) und registriert den Service Worker.
  `index.html`, `css/styles.css`.
- PWA: `manifest.json` (Metadaten/Icons), `sw.js` (Service Worker, **Network-first**:
  online frisch, offline aus Cache; `CACHE`-Version bei Releases hochzählen),
  `icons/` (192/512/maskable/apple). Touch/Responsive über Media Queries in
  `styles.css` (`touch-action: manipulation`; ab iPhone-Breite ≤430 px passt der
  15-spaltige Block per `--cell: clamp(…, calc((100vw − 80px)/15), 27px)` komplett
  ohne Horizontal-Scroll, Safe-Area-Insets via `env(safe-area-inset-*)` für Notch/
  Dynamic Island/Home-Indikator). Querformat (`orientation: landscape` & `max-height: 600px`):
  Grid mit Block links + schmaler Steuerspalte rechts; Steuerspalte von oben =
  KI-Aktionen/Kommentar (prominent), Würfeln-Button, Würfel + Joker-Auswahl
  (dehnbare, bei Bedarf scrollbare 1fr-Zone – Joker-Würfel sind hier kleiner, damit
  alle 5 Farben/Zahlen in EINE Reihe passen), Aktionen, „↩ Zug zurück", Zug-Timer.
  Die Aktionen sitzen fix UNTER der Würfel/Joker-Zone und können die Joker-Auswahl so
  nie verdecken. „Spiel beenden" sitzt fix oben rechts neben Theme/Ton.
  In jedem Block stehen Farb-Bonus + Joker per `column-reverse` ÜBER dem Raster;
  Sterne/Kreuze sind nur hier ~50 % größer (im Hochformat unverändert).

### Konventionen
- Farbcodes im Raster: `y`=gelb, `n`=grün, `b`=blau, `r`=rot/pink, `o`=orange.
- Jeder Spieler hat ein eigenes `Sheet`; alle Blöcke sind gleichzeitig sichtbar, der
  aktive ist hervorgehoben. **Jeder Schritt wird vom Menschen ausgelöst** – auch das
  Würfeln (Würfeln-Button, Beschriftung „Für … (KI) würfeln" bei aktiver KI) und der
  KI-Zug („🤖 … ziehen lassen"). Das ist Voraussetzung für die Zurück-Taste: der Ablauf
  rennt nicht von allein weiter. KI-Züge laufen dann über `runAi` in `flow.js` – bewusst
  langsam und nachvollziehbar: Felder werden einzeln ausgewählt (wie ein Mensch) und dann
  gemeinsam angekreuzt. Schwierigkeit kommt aus `game.aiDifficulty`.
- **Zurück-Taste „↩ Zug zurück" (`#undo-btn`):** während des ganzen Spiels sichtbar,
  nimmt nach kurzer Rückfrage den ZULETZT gemachten Zug zurück (egal ob eigener oder
  KI-Zug) und springt so Zug für Zug zurück. Technisch: `flow.js` legt vor jedem Zug
  `game.snapshot()` (kompletter Zustand inkl. aller Blätter, via `structuredClone`) auf
  `history`; `onUndo` holt den letzten Snapshot zurück (`game.restore`) und ruft `present()`
  erneut. Das Würfeln ist KEIN eigener Zurück-Schritt; springt man über einen Rundenanfang
  zurück, wird beim nächsten Vorlauf neu gewürfelt. Die Taste ist gesperrt, wenn `history`
  leer ist oder gerade eine Animation läuft (`busy`).
- Würfeln-Button (`#roll-btn`): in JEDEM Layout sichtbar (jeder Wurf per Klick); `flow.js`
  blendet ihn per `.hidden` aus, wenn gerade nicht gewürfelt werden kann.
- Jeder Wurf startet mit einer kurzen Würfelanimation (`animateRoll`/`.die.rolling`).
- Sternfelder: der Stern sitzt zentral im Feld (wie im Original); ein gesetztes Kreuz (✕)
  liegt groß und dick darüber, das Feld wird abgedunkelt (`.cell.marked`) – so ist „schon
  angekreuzt" auch auf Sternfeldern eindeutig.
- Spielende: kein eigener Bildschirm; die Endwertung erscheint inline im `#end-panel`
  über den Blöcken (samt „Neues Spiel"-Button), die Blöcke bleiben sichtbar. Beim
  Spielende werden alle Ergebnisse in die Bestenliste geschrieben.
- „Spiel beenden" (`#end-game-btn` im Spiel-Header): verwirft das laufende Spiel und
  geht zurück ins Menü. `runGame` setzt dazu `dom.abortGame`; weil der Ablauf
  event-gesteuert ist (keine durchlaufende Schleife), bricht es nur einen evtl. gerade
  laufenden Mensch-Zug ab (`currentControl.cancel`, liefert `{ action:'abort' }`). Danach
  geht `main.js` zurück ins Menü (kein Eintrag in der Bestenliste).
- Bestenliste „immer aktuell": `main.js` rendert sie neu bei Spielende/Menü-Rückkehr,
  zusätzlich über ein `storage`-Event (Updates aus anderen Tabs/Fenstern, `SCORES_KEY`
  aus `storage.js`) sowie bei `visibilitychange`/`focus` (PWA aus dem Hintergrund).
- Das Log (`#log`) trennt jeden Wurf mit einem `▶`-Marker (`announceRound`).
- Optionaler Zug-Timer: `game.moveTimer` (Sekunden, 0 = aus); läuft je Mensch-Zug in
  `controls.js`, bei Ablauf wird automatisch gepasst (`{ action:'pass', timedOut:true }`).
- KI-Tempo: `game.aiSpeed` (Faktor auf die Pausen in `runAi`; >1 langsamer, <1 schneller).
- Hell/Dunkel: `body.light` überschreibt die CSS-Variablen; Theme + Mute liegen in
  `prefs` (localStorage) und werden sofort beim Umschalten gespeichert.
- Setup merkt sich Spielernamen, Anzahl, KI-Stärke, KI-Tempo und Timer (localStorage).
- Bestenliste ist über das ⚙-Symbol bearbeitbar: schaltet einen Bearbeiten-Modus ein,
  in dem einzelne Einträge (`removeScoreAt`) oder alle (`clearScores`) entfernt werden.
- Code-Kommentare und UI-Texte sind auf Deutsch.
