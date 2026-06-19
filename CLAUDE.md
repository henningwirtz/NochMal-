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
  `game.js` (Rundenautomat; Optionen `aiDifficulty`, `relaxed`, `aiAuto`; `submitMarks`
  kreuzt im Notizblock-Modus frei gewählte, regelkonform erreichbare Felder ohne
  Würfel-Prüfung an),
  `ai.js` (Heuristik-KI,
  `chooseMove(sheet, pool, difficulty)`; Stufen `leicht`/`mittel`/`schwer` über `CFG`,
  die die strategische Gewichtung skalieren).
- `js/ui/` – Rendering & Ablauf: `boardView.js` (`renderSheet` = ein Blatt),
  `flow.js` (`runGame` = **event-gesteuerter Ablauf**: Mensch-Schritte (Würfeln, Zug)
  werden per Klick ausgelöst; `present()` ist die zentrale Weiche, die aus dem
  Spielzustand ableitet, wer als Nächstes dran ist und ob Mensch oder KI:
  `presentRoll`/`presentChooser` (Mensch, interaktiv), `presentAiPhase`/`runAiPhase`
  (KI), `advance` (nach Mensch-Zug weiterschalten). **PvP/Notizblock (`relaxed`):**
  KEIN separater Würfeln-Schritt – `present()` ruft hier ohne Klick `beginRound()`
  (Referenzwürfel) und geht direkt zu `presentChooser`; man würfelt real am Tisch und
  kreuzt sofort an. **KI-Phase:** alle direkt
  aufeinanderfolgenden KI-Schritte (würfeln + wählen, auch über mehrere Runden) sind
  EINE Phase – `presentAiPhase` zeigt EINEN Knopf „▶ KI laufen lassen", `runAiPhase`
  führt dann die ganze Phase animiert aus (`aiRoll`/`aiChoose`), bis wieder ein Mensch
  dran ist oder das Spiel endet. Mit dem Auto-Häkchen (`game.aiAuto`) entfällt der eine
  Klick und die Phase startet von selbst – außer direkt nach „Zurück" (`pauseAuto`),
  damit der zurückgenommene KI-Zug nicht sofort wieder gemacht wird. Vor jedem Zug wird
  ein `game.snapshot()` in den `history`-Stack gelegt, die Zurück-Taste (`onUndo`) stellt
  den vorigen Zustand wieder her. `renderBoards` = alle Spieler-Blöcke gleichzeitig,
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
  (dehnbare, bei Bedarf scrollbare 1fr-Zone – Joker-Würfel sind hier klein (22 px),
  damit alle 5 Farben/Zahlen in EINE Reihe passen und Farb- + Zahl-Joker zusammen
  wenig Höhe brauchen; Kommentar flach `max-height: 18dvh`, Aktionen kompakt – so
  überschneidet sich auch bei BEIDEN Joker-Auswahlen nichts mit „Bestätigen"),
  Aktionen, „↩ Zug zurück", Zug-Timer.
  Die Aktionen sitzen fix UNTER der Würfel/Joker-Zone und können die Joker-Auswahl so
  nie verdecken. „Spiel beenden" sitzt fix oben rechts neben Theme/Ton.
  In jedem Block stehen Farb-Bonus + Joker per `column-reverse` ÜBER dem Raster;
  Sterne/Kreuze sind nur hier ~50 % größer (im Hochformat unverändert).

### Konventionen
- Farbcodes im Raster: `y`=gelb, `n`=grün, `b`=blau, `r`=rot/pink, `o`=orange.
- Jeder Spieler hat ein eigenes `Sheet`; alle Blöcke sind gleichzeitig sichtbar, der
  aktive ist hervorgehoben. **Mensch-Schritte werden per Klick ausgelöst** (eigenes
  Würfeln, eigener Zug). **KI-Schritte sind zu einer KI-Phase gebündelt:** EIN Klick
  auf „▶ KI laufen lassen" (`presentAiPhase`) startet alle direkt aufeinanderfolgenden
  KI-Aktionen – würfeln UND wählen, auch über mehrere Runden – und sie laufen über
  `runAiPhase` automatisch ab, bis wieder ein Mensch dran ist oder das Spiel endet.
  Das **Auto-Häkchen** (`game.aiAuto`, Setup-Checkbox `#ai-auto`) lässt diesen einen
  Klick weg: die Phase startet von selbst (außer direkt nach „Zurück", siehe `pauseAuto`).
  KI-Züge bleiben bewusst langsam und nachvollziehbar (`aiSpeed`): Felder werden einzeln
  ausgewählt (wie ein Mensch, `aiChoose`) und dann gemeinsam angekreuzt. Schwierigkeit
  kommt aus `game.aiDifficulty`. Die Zurück-Taste bleibt erhalten, weil `runAiPhase` vor
  jedem KI-Zug weiterhin einen `snapshot()` ablegt (während die Phase läuft, ist sie
  über `busy` gesperrt).
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
  Spielende werden alle Ergebnisse in die Bestenliste geschrieben. Das Spiel endet
  automatisch, sobald ein Spieler **2 komplette Farben** (oder alle Spalten) hat –
  grid-basiert in `resolveRound`, auch im PvP/Notizblock-Modus (`relaxed`, ein Block);
  die Übersicht zeigt Bonus/Spalten/Joker/Sterne + TOTAL je Block. Bei nur EINEM Block
  (Solo oder PvP) steht „Endstand: X Punkte" statt „Sieger".
- PvP/Notizblock-Modus (`body.mode-notepad`, nur EIN Block, Würfel sind Referenz):
  **Würfel** ~50 % größer (90 px im Hochformat, im engen Querformat 52 px). **Block:**
  die frühere Sonder-Vergrößerung wurde zurückgenommen – `--cell` kommt wieder aus
  `:root`/den Mobile-Media-Queries und passt sich der Bildschirmbreite an, der eigene
  Block-Scrollbalken entfällt (`overflow: visible`); zusammen mit dem kompakten
  Wertungspanel (s. u.) soll nirgends gescrollt werden müssen. **Spaltenköpfe A–O**
  sind 1,6× so hoch wie die Felder (`.col-letter height: calc(var(--cell)*1.6)`, Breite
  = Zellenbreite) – nur die Köpfe, damit man sie als Umschalter leichter trifft; die
  Spielfelder bleiben quadratisch. **A–O / Farb-Bonus antippen = Umschalter:** 1. Tippen
  streicht den Spalten-Oberwert bzw. den 5er-Farb-Erstbonus („anderer war zuerst" → nur
  reduzierter Wert), erneutes Tippen gibt den vollen Wert wieder frei
  (`game.toggleColumnStrikeByOther`/`toggleColorStrikeByOther`, stuft auch einen bereits
  gewerteten Wert passend um; `sheet.unstrikeColumnTop`/`unstrikeColorFirst`).
  **Wertungspanel** (`.side-panel`): Farb-Bonus, Joker UND Punkte-Übersicht stehen in
  EINER kompakten Reihe nebeneinander (statt untereinander) → alles rückt nach oben, der
  Block bekommt mehr Platz. **Punkte:** ohne Spielername, nur `… P.` – im Hochformat oben
  im Header (`#turn-info`, `setTurnInfo(…, relaxed)`), der Block-Kopf (`.pb-head`) entfällt;
  im Querformat als kleines Badge am Block. Im engen Querformat ist die rechte
  Steuerspalte ~8 % schmaler (`minmax(138px, 176px)`).
- KI-Modus: gleiche Punkteanzeige-Idee – auf Handybreite (`@media max-width: 760px`) steht
  das Wertungspanel (`.side-panel`) ebenfalls als kompakte Reihe unter dem Raster (Farb-
  Bonus + Joker + Punkte nebeneinander), damit jeder Block weniger Höhe braucht.
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
- Setup merkt sich Spielernamen, Anzahl, KI-Stärke, KI-Tempo, KI-Auto-Häkchen und
  Timer (localStorage).
- Bestenliste ist über das ⚙-Symbol bearbeitbar: schaltet einen Bearbeiten-Modus ein,
  in dem einzelne Einträge (`removeScoreAt`) oder alle (`clearScores`) entfernt werden.
- Code-Kommentare und UI-Texte sind auf Deutsch.
