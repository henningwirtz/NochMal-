# CLAUDE.md

Hinweise für Claude Code beim Arbeiten in diesem Repository.

## Projekt

Browser-Nachbau des Würfelspiels **NOCH MAL!** (Schmidt Spiele) – reines Vanilla
JavaScript (ES-Module), **kein Build-Schritt**, keine Abhängigkeiten. Deutsche Oberfläche.
Unterstützt Pass-and-Play (1–6 Spieler), heuristische KI-Gegner (3 Schwierigkeitsgrade)
und die Solo-Variante. Läuft als **PWA** (installierbar, offline, touch-optimiert) –
am Handy via GitHub Pages, siehe README („Auf dem Handy spielen").

## Roadmap / geplante Features

Wird Stück für Stück abgearbeitet; einzelne Features werden bei Bedarf separat geplant.
Erledigte Punkte hier als `[x]` markieren bzw. nach unten/„Erledigt" verschieben.

### KI / Bots
- **Bots mit Namen & Charakteren** – Bots heißen z.B. „Leopold"; Schwierigkeit bleibt
  (`game.aiDifficulty`). Im Log/UI statt „denkt nach" charakterbezogene Sprüche/Aktionen
  („Gucken wir erstmal, was Henning hat"). Langfristig: eigene Bots im Setup anlegbar.
  → `flow.js` (aiTurn-Ausgabe), `main.js` (Setup/Namen), neue Sprüche-Daten z.B.
  `js/data/bots.js`.
- **Leopold-Bot** – eigener Spielstil (sabotiert/blockt Mitspieler), Fokus auf
  lustige/dumme Sprüche; „normale" KI bleibt parallel bestehen. → `ai.js`
  (Taktik-Variante), `js/data/bots.js` (Sprüche).
- **Bot-Rückmeldung fixen** – wenn ein Bot nichts nimmt/nehmen kann, klare Meldung
  statt Hängenbleiben auf „denkt nach". → `flow.js` (aiTurn).
- **KI-Spielzüge optimieren** – bessere Heuristik in `chooseMove`. → `ai.js`.

### Spielregeln / Varianten
- [x] **Modus-Auswahl beim Start** – auf der Startseite (oben im Setup) zwei Modus-Karten
  (`.mode-select`/`.mode-card`, `index.html`): **Gether** (`data-mode="a"`) = „Gegen die KI",
  zusammen an **einem** Gerät (KI-Gegner, alle Boards, strenge Validierung) und **PvP**
  (`data-mode="b"`) = „Digitaler Notizblock", jeder am **eigenen** Handy. PvP ist ein
  1-Spieler-Spiel (`relaxed:true`, **kein** `soloMode`): weiter würfeln + normale Wertung/
  Spielende/Bestenliste (Label „Notizblock"), aber jedes **erreichbare** Feld (Startspalte H
  oder neben einem Kreuz) frei ankreuzbar – Farbe und Anzahl egal. KI-/Mehrspieler-Setup-
  Felder tragen `mode-a-only` und werden via `body.mode-notepad` ausgeblendet; der Modus
  wird in `saveSettings({ mode })` gemerkt.
  → `main.js` (`applyMode`, Start-Verzweigung, `renderSlots`), `game.js`
  (`relaxed`-Flag + `submitMarks`), `rules.js` (`isRelaxedPlacement`), `controls.js`
  (`redrawRelaxed`/freies `onCellClick`), `flow.js` (`submitMarks`-Zweig, `notepad`-Flag).
- [x] **PvP-Boni + Spielende-Fix** – Im PvP sind **Spalten-Buchstaben** (über dem Block)
  und **Farb-Bonus-Boxen** (unter dem Block) anklickbar: ein Klick heißt „ein anderer
  Spieler hat das zuerst geschlossen" → Oberwert gestrichen (`strikeColumnByOther`/
  `strikeColorByOther` in `game.js`; idempotent, stuft einen bereits voll vergebenen Wert
  herab). Eigene **fertige** Spalten/Farben werden in `resolveRound` (`relaxed`-Zweig,
  `_awardCompletedRelaxed`) automatisch gewertet – voll, oder reduziert falls gestrichen.
  **Spielende grid-basiert** (beide Modi): 2 Farben vollständig (`completedColorGridCount`)
  **oder** alle Spalten zu (`allColumnsComplete`) → sofort nach „Bestätigen" Ende + Einfrieren
  (`sheet.js`-Helfer). → `boardView.js` (`onColumnClick`/`onColorClick`, `.clickable`/
  `.struck`), `flow.js`/`controls.js` (Handler durchreichen/verdrahten), `styles.css`.
- **Neue Blöcke (auswählbar)** – mehrere Spielpläne (offizielle Varianten + eigene),
  im Setup wählbar; Engine ist datengetrieben. → `board.js` (mehrere `RAW_GRID`/`STARS`),
  `main.js` (Auswahl im Setup), `storage.js` (Auswahl merken).
- **Joker als 6** – ein Zahl-Joker-Element darf als Wert 6 eingesetzt werden.
  → `constants.js`/`rules.js`, ggf. `sheet.js`.
- **Minuspunkte / Pass-Felder** – begrenzte Anzahl Pässe (z.B. 5); jedes Passen
  verbraucht ein Feld (−1/−2), am Ende verrechnet (im Kern Original-Passregel).
  → `sheet.js` (Pass-Zähler + Wertung), `rules.js`/`game.js` (Pass-Aktion),
  `boardView.js` (Pass-Felder anzeigen).

### UI / Darstellung
- [x] **Quer-Modus optimieren** – Landscape-Layout, Block ohne Horizontal-Scroll.
  *Erledigt:* Media Query `(orientation: landscape) and (max-height: 600px)` in
  `styles.css` – `#game-screen` wird zum Grid (Block links voller Höhe, Würfel +
  Aktionen + Sidebar als rechte Spalte via `display: contents` auf `.game-main`),
  `--cell` zusätzlich höhenbegrenzt (kein H-/V-Scroll des Blocks).
- **Handy-Spielmodus optimieren** – durchgängig bedienbares Layout am Smartphone:
  - [x] *Handy quer für bessere Übersicht* – Querformat als zweispaltiges Grid
    (Block | Steuerspalte), nutzt die Landscape-Breite. Aktiver Block ist
    vollständig & fixiert (sticky + `order:-1`), übrige Blöcke per Runterscrollen.
    Blöcke liegen **flach** auf der Seite (im Landscape `.player-board`
    `overflow:visible; width:auto`, kein scrollbares Block-Fenster mehr, das das
    Wertungs-Panel abschnitt). Neben dem Raster nur **Farb-Bonus + Joker** (kompakt,
    voll sichtbar); die Punkte-Aufschlüsselung (`.totals`) ist im Querformat
    ausgeblendet – Gesamtpunkte stehen im Block-Kopf und im Header-Chip.
    `--cell: clamp(13px, min((100vw−480px)/15, (100dvh−96px)/9), 26px)` so bemessen,
    dass Raster + Panel garantiert in die Board-Spalte und Höhe passen.
    (**Hochformat noch offen.**)
  - [x] *Aufgeräumte Steuerspalte rechts* – das Landscape-Grid hat rechts feste
    Zeilen `dice / roll / actions / comment`: Würfel-Anzeige → neuer **🎲 Würfeln**-
    Button (`#roll-btn`) → Aktionen als Stapel in Reihenfolge **Bestätigen, Passen,
    Rückgängig** (`.action-bar { flex-direction: column }`) → flache **Kommentar-Box**
    (`#commentary`, `.commentary-box`) für Systemhinweise/letzte Ansage. Die separate
    Punktestand/Log-Spalte (`.sidebar`) und `#message` sind im Querformat
    ausgeblendet; Würfeln-Button + Kommentar-Box sind global `display:none` und nur im
    Landscape sichtbar. (**Hochformat noch offen.**)
  - [x] *Würfeln-Button funktional* – beim Mensch-Aktivspieler deckt `waitForRoll`
    (in `flow.js`) das bereits in `beginRound()` gewürfelte Ergebnis erst nach Klick
    auf „Würfeln" per `animateRoll` auf; bei KI-Aktivspieler wird wie bisher direkt
    gewürfelt. `control.cancel` löst das Warten bei „Spiel beenden" sauber auf.
  - [x] *Textballast entfernt* – kein „… ist am Zug (aktiv)" mehr; `setTurnInfo`
    schreibt stattdessen einen kompakten Punktestand-Chip (`#turn-info`) in den
    schmalen Header oben rechts (Punktestand + Spiel beenden + Ton + Nachtmodus).
  - [x] *Alle wichtigen Buttons gleichzeitig sichtbar & bedienbar* – im Querformat
    bleiben Hell/Dunkel + Ton (`#top-controls`) fix oben rechts, der Header-Inhalt
    inkl. „Spiel beenden" rutscht via `padding-right` darunter weg → kollisionsfrei,
    gut tappbar. (**Hochformat noch zu prüfen.**)
  - [x] *Kein Scrollen für Aktionen* – Würfel, Würfeln-Button, Aktionsleiste und
    Block liegen im Landscape-Grid gleichzeitig sichtbar; nur die Kommentar-Box
    scrollt bei Bedarf. (**Hochformat noch offen.**)
  → `styles.css` (Media Query `orientation: landscape`, Grid-Areas
  `board/header/dice/roll/actions/comment`, `.roll-btn`, `.commentary-box`,
  `.turn-info`-Chip), `index.html` (`#roll-btn`, `#commentary`), `flow.js`
  (`waitForRoll`, `setTurnInfo`, `announce` → Kommentar-Box), `controls.js`
  (Aktions-Reihenfolge, `setHint` schreibt in `#message` + `#commentary`), `main.js`
  (DOM-Refs `rollBtn`/`commentary`).
- **Spieler-Stammliste mit Bildern/Emojis** – gespeicherte Liste bekannter Spieler
  (z.B. „Henning") mit fest zugewiesenem Bild/Emoji; im Setup auswählbar statt jedes Mal
  neu zu tippen, runden­übergreifend wiederverwendet. Avatar erscheint in Setup, Spiel
  und Bestenliste. → `storage.js` (Spieler-Stammliste persistieren), `main.js` (Setup:
  Auswahl/Anlegen/Zuweisen), `boardView.js`/`flow.js` (Anzeige).
- **Schnellauswahl per Wischen/Mehrfachklick** – wenn ein Wert gewählt ist (z.B. gelbe 5)
  und in ein Feld der passenden Farbgruppe geklickt wird, lassen sich mehrere zusammen-
  hängende Felder in einem Rutsch markieren: entweder durch Drüberwischen mit Maus/Finger
  (Drag bzw. `touchmove` über die gültigen Felder) oder durch direktes Auswählen der ganzen
  Gruppe. Nur die regelkonform erreichbaren Felder werden mitgenommen; ungültige Ziele
  werden übersprungen. → `controls.js` (Eingabe: `pointerdown`/`pointermove`/`pointerup`
  bzw. `touchmove`, Auswahl-Sammeln), `rules.js` (gültige Felder der aktuellen Auswahl),
  `boardView.js` (Hover-/Wisch-Hervorhebung der erfassten Felder).

### Ton / Sprache
- **Niederländische Ansage** – optionale Sprachausgabe (Web Speech API, `nl-NL`), sagt
  den Zug an, z.B. „drie geel" bei 3× Gelb. Toggle analog zum bestehenden Mute.
  → `sound.js` (TTS-Ansage), `main.js`/`prefs` (Toggle).

### Später (Backend nötig – zurückgestellt)
- **Scoreboard-Backend** – server-/cloudbasierte globale Bestenliste.
- **Online-Mehrspieler** – gemeinsam spielen, jeder kreuzt selbst an.

## Workflow / Git

**Nach jeder Änderung wird diese `CLAUDE.md` aktualisiert und der Fortschritt direkt
auf den `main`-Branch committet und gepusht – keine neuen Branches anlegen.**

**Pläne aus dem Plan Mode sollen verständlich und nachvollziehbar sein** – in klarer,
einfacher Sprache erklärt, sodass auch ohne tiefe Programmierkenntnisse erkennbar ist,
was passiert. Wenn Code im Plan steht, dann möglichst nur einfacher, leicht lesbarer
Code (keine komplizierten Konstrukte).

## Starten

ES-Module brauchen einen HTTP-Server (kein `file://`):

- **Windows:** `Spiel starten.bat` doppelklicken
- **macOS:** `Spiel starten.command` doppelklicken
- **Manuell:** `npm start` (= `python -m http.server 8000`), dann <http://localhost:8000/>

Beide Startskripte fahren den Server hoch und öffnen den Browser; sie bevorzugen Python
und fallen auf Node (`npx serve`) zurück.

**Wichtig (Caching):** Die Startskripte nutzen `serve.py` – einen kleinen HTTP-Server,
der `Cache-Control: no-store` sendet. So zeigt der Browser nach jedem Update sofort die
neue Version. Falls doch mal Altes erscheint: einmal hart neu laden (Strg/Cmd+Shift+R).
Im Setup zeigt ein kleiner „Stand: …"-Hinweis (`#build-badge`, `VERSION` in `main.js`),
welche Version geladen ist – nach Änderungen die `VERSION` hochsetzen.

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
  Modus), `sheet.js` (ein Spielblatt + Wertung),
  `game.js` (Rundenautomat; Optionen `aiDifficulty`, `relaxed`; `submitMarks` kreuzt im
  Notizblock-Modus frei erreichbare Felder ohne Würfel-Prüfung an), `ai.js` (Heuristik-KI,
  `chooseMove(sheet, pool, difficulty)`; Stufen `leicht`/`mittel`/`schwer` über `CFG`,
  die die strategische Gewichtung skalieren).
- `js/ui/` – Rendering & Ablauf: `boardView.js` (`renderSheet` = ein Blatt),
  `flow.js` (`runGame`/`renderBoards` = alle Spieler-Blöcke gleichzeitig, KI-Züge,
  Log/Ansagen, inline Endwertung), `controls.js` (`humanTurn` = interaktiver Zug,
  nur eigener Block anklickbar; Rückgängig-Button + optionaler Zug-Timer),
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
  Dynamic Island/Home-Indikator).

### Konventionen
- Farbcodes im Raster: `y`=gelb, `n`=grün, `b`=blau, `r`=rot/pink, `o`=orange.
- Jeder Spieler hat ein eigenes `Sheet`; alle Blöcke sind gleichzeitig sichtbar, der
  aktive ist hervorgehoben. KI-Spieler ziehen vollautomatisch über `aiTurn` in `flow.js`
  – bewusst langsam und nachvollziehbar: Felder werden einzeln ausgewählt (wie ein
  Mensch) und dann gemeinsam angekreuzt. Schwierigkeit kommt aus `game.aiDifficulty`.
- Jeder Wurf startet mit einer kurzen Würfelanimation (`animateRoll`/`.die.rolling`).
- Sternfelder: der Stern sitzt zentral im Feld (wie im Original); ein gesetztes Kreuz (✕)
  liegt groß und dick darüber, das Feld wird abgedunkelt (`.cell.marked`) – so ist „schon
  angekreuzt" auch auf Sternfeldern eindeutig.
- Spielende: kein eigener Bildschirm; die Endwertung erscheint inline im `#end-panel`
  über den Blöcken (samt „Neues Spiel"-Button), die Blöcke bleiben sichtbar. Beim
  Spielende werden alle Ergebnisse in die Bestenliste geschrieben.
- „Spiel beenden" (`#end-game-btn` im Spiel-Header): verwirft das laufende Spiel und
  geht zurück ins Menü. `runGame` setzt dazu `dom.abortGame`, das ein
  `control`-Objekt (`{ aborted, cancel }`) markiert; die Schleife in `flow.js` und
  `aiTurn` prüfen `control.aborted` nach jedem `await` und brechen sauber ab (kein
  Eintrag in der Bestenliste). `humanTurn(…, control)` liefert per `control.cancel`
  ein `{ action:'abort' }`, falls gerade ein Mensch am Zug ist.
- Bestenliste „immer aktuell": `main.js` rendert sie neu bei Spielende/Menü-Rückkehr,
  zusätzlich über ein `storage`-Event (Updates aus anderen Tabs/Fenstern, `SCORES_KEY`
  aus `storage.js`) sowie bei `visibilitychange`/`focus` (PWA aus dem Hintergrund).
- Das Log (`#log`) trennt jeden Wurf mit einem `▶`-Marker (`announceRound`).
- Optionaler Zug-Timer: `game.moveTimer` (Sekunden, 0 = aus); läuft je Mensch-Zug in
  `controls.js`, bei Ablauf wird automatisch gepasst (`{ action:'pass', timedOut:true }`).
- KI-Tempo: `game.aiSpeed` (Faktor auf die Pausen in `aiTurn`; >1 langsamer, <1 schneller).
- Hell/Dunkel: `body.light` überschreibt die CSS-Variablen; Theme + Mute liegen in
  `prefs` (localStorage) und werden sofort beim Umschalten gespeichert.
- Setup merkt sich Spielernamen, Anzahl, KI-Stärke, KI-Tempo und Timer (localStorage).
- Bestenliste ist über das ⚙-Symbol bearbeitbar: schaltet einen Bearbeiten-Modus ein,
  in dem einzelne Einträge (`removeScoreAt`) oder alle (`clearScores`) entfernt werden.
- Code-Kommentare und UI-Texte sind auf Deutsch.
