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
`Cache-Control: no-store`). Nach Änderungen die Version in **`version.js`**
(`self.APP_VERSION`) hochsetzen – ein **kurzer, sprechender Versionsname**
(z. B. `'2.0 · Querformat'`). Das ist die EINZIGE Versionsquelle: `index.html` lädt
`version.js` als klassisches Script (setzt `window.APP_VERSION`, `main.js` zeigt es im
Setup-Kopf als „Version …", `#build-badge`), und `sw.js` leitet den Service-Worker-
Cache-Namen per `importScripts('version.js')` daraus ab – der Offline-Cache invalidiert
also automatisch beim Hochzählen (keine separate `CACHE`-Pflege mehr).

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
  eigener Ablauf über `presentRelaxed` – die Referenzwürfel **bleiben stehen**, bis man
  über den **Würfeln-Button selbst neu würfelt** (`setupRelaxedRoll` → `game.rollReference()`,
  würfelt animiert nur die Würfel neu, ohne den Markier-Turn zu beenden). Jeder Markier-
  Turn wird mit `game.beginRelaxedTurn()` vorbereitet (setzt `order`/`pointer`, würfelt aber
  NICHT neu – nur beim allerersten Mal einmal); angekreuzt wird frei (relaxed). **KI-Phase:** alle direkt
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
  `playEnd`, `setMuted`/`isMuted` – keine externen Audiodateien),
  `util.js` (geteilte Mini-Helfer, aktuell `escapeHtml` – Spielernamen werden in
  `flow.js`/`main.js` damit maskiert, bevor sie per `innerHTML` gesetzt werden).
- `js/main.js` – Setup-Bildschirm & Bootstrap; `backToSetup()` für „Neues Spiel";
  rendert die Bestenliste, stellt zuletzt genutzte Einstellungen wieder her, steuert
  Hell/Dunkel-Theme + Ton (oben rechts) und registriert den Service Worker.
  `index.html`, `css/styles.css`.
- PWA: `manifest.json` (Metadaten/Icons), `sw.js` (Service Worker, **Network-first**:
  online frisch, offline aus Cache; `CACHE`-Name wird aus `version.js`
  (`self.APP_VERSION`) abgeleitet, also nur dort die Version hochzählen),
  `icons/` (192/512/maskable/apple). Touch/Responsive über Media Queries in
  `styles.css` (`touch-action: manipulation`; ab iPhone-Breite ≤430 px passt der
  15-spaltige Block per `--cell: clamp(…, calc((100vw − 80px)/15), 27px)` komplett
  ohne Horizontal-Scroll, Safe-Area-Insets via `env(safe-area-inset-*)` für Notch/
  Dynamic Island/Home-Indikator). Damit unter dem Inhalt (untere Safe-Area /
  Home-Indikator) **kein weißer Balken** durchscheint, hat auch das `html`-Element den
  dunklen Hintergrund (`html { background: var(--bg) }`, im Hell-Theme via
  `html:has(body.light)`), und `body`/`html` füllen die volle Höhe (`min-height`).
  **Nur Querformat:** Auf Touch-Geräten
  (`@media (orientation: portrait) and (pointer: coarse)`) verdeckt im Hochformat ein
  Overlay (`#rotate-prompt`) das ganze UI und fordert zum Drehen auf (am Desktop mit
  Maus, `pointer: fine`, greift das nie). Die installierte PWA startet zudem im
  Querformat (`manifest.json` → `"orientation": "landscape"`).
  **Startbildschirm im Querformat** (`@media (orientation: landscape) and (pointer: coarse)`,
  `#setup-screen`): drei Spalten unterschiedlicher Breite – links Modus-Auswahl **mit dem
  „Spiel starten"-Knopf direkt darunter** (`#start-btn` als direktes Kind von
  `#setup-screen`, grid-area `start` in der linken Spalte unter `mode`), Mitte
  (am breitesten) Einstellungen, rechts Bestenliste oben + Kurzregeln
  darunter; passt ohne Scrollen (`height: 100dvh; overflow: hidden`, nur Liste scrollt).
  Im Standard-/Hochformat steht „Spiel starten" ebenfalls direkt unter den Modus-Karten
  (vor der Einstellungskarte), damit er **jederzeit erreichbar** ist.
  Kopfzeile (`.setup-head`) = Logo + kurzer Versionsname (`#build-badge`, gespeist aus
  `VERSION` in `main.js`, z. B. „Version 2.0 · Querformat"); der frühere Untertitel
  entfällt.
  Spiel-Querformat (`@media (orientation: landscape) and (pointer: coarse)` – greift nun
  auch auf Tablets, nicht mehr nur `max-height: 600px`):
  Grid mit Block links + schmaler Steuerspalte rechts; **alles gehört zu EINER Fläche** –
  nichts schwebt mehr über dem Block. **Oberste Zeile der Steuerspalte = EINE Reihe**
  (grid-area `ctl`): links der kleinere **„Spiel beenden"**-Knopf
  (`width: calc(100% − 72px)`, `height: 30px`, ganz oben), rechts daneben die beiden Icons
  Theme/Ton. Die Icons (`#top-controls`) werden beim Spielstart per JS in die `.game-header`
  **verschoben** (`main.js`; bei „Neues Spiel"/Beenden zurück in den Body) – dadurch sind
  sie im Querformat echte **Grid-Geschwister** und teilen sich mit „Spiel beenden" das Feld
  `ctl` (`justify-self: start` vs. `end`), sitzen also zuverlässig in DERSELBEN Reihe
  daneben statt als frei schwebendes `position: fixed`-Element nur ungefähr zu passen
  (`.game-header #top-controls { position: static; grid-area: ctl }`). Auf dem
  Startbildschirm/Desktop bleiben sie wie gehabt fixiert oben rechts.
  Darunter folgt im **KI-/Solo-Modus** derselbe Spalten-Aufbau wie im PvP (nur um die
  KI-Elemente ergänzt): GANZ OBEN die **Würfel** (groß, 42 px, `align-self: start` direkt
  unter „Spiel beenden"), dann die **Text-Anzeige** (KI-Kommentar), dann Würfeln-Button,
  Aktionen, „↩ Zug zurück", Zug-Timer, unten freier 1fr-Rest
  (`grid-template-areas: ctl/dice/comment/roll/actions/undo/timer/.`). **Joker ohne Extra-
  Auswahl:** Wählt der Mensch einen Joker-Würfel, erscheint KEIN Farb-/Zahl-Picker mehr –
  Farbe und Anzahl ergeben sich aus den danach angekreuzten Feldern (Farbe = Farbe des
  ersten Feldes, Anzahl = Zahl der Felder). Technisch fasst `currentPlacements` in
  `controls.js` bei einem Joker alle Farben bzw. Längen 1–5 zusammen; `effColor`/`effCount`
  leiten den Wert aus `state.selected` ab, `canConfirm` prüft, ob die Auswahl GENAU einer
  legalen Platzierung entspricht. Spart die platzraubende zweite Auswahl. Wird die Würfel-/
  Joker-Zone eng, scrollt **nur sie** intern (`.dice-tray { overflow-y: auto; max-height:
  46dvh }`), der Rest bleibt stehen. Bonus/Spalten/Joker sind im KI-Modus **nicht
  anklickbar** – die Klick-Handler (`onColumnClick`/`onColorClick`/`onJokerClick`) werden
  nur im PvP-Pfad (`redrawRelaxed`) verdrahtet, der normale KI-Zug (`redraw`) übergibt sie
  nicht; gewertet wird automatisch. **Block kompakter (wie PvP):** der **Block-Kopf**
  (`.pb-head`) ist im Querformat in BEIDEN Modi ausgeblendet; „am Zug" entfällt ganz –
  **wer dran ist, zeigt die Rahmenfarbe** (`.player-board.active` = orange, inaktiv =
  gelb `#ffd23f`). Die **Punkte** stehen wie im PvP neben dem Joker über dem Block (nur die
  TOTAL-Zeile aus `.totals`), im KI-Modus **darunter der Spielername** (`.sheet-name`, von
  `renderBoards` via `playerName` ins Sheet durchgereicht; im PvP nicht gesetzt). So bleibt
  der Block niedriger und die unteren Spaltensummen sind sichtbar. **PvP/Notizblock** hat
  einen **eigenen Spalten-Aufbau** (`body.mode-notepad #game-screen`): die Referenz-Würfel
  stehen GANZ OBEN direkt unter „Spiel beenden" und sind in natürlicher Größe **immer
  komplett sichtbar** (`align-self: start; overflow: visible`, kein interner Scroll), der
  dehnbare Rest (1fr) fällt ans untere Spaltenende.
  **Scrollen:** Im **KI-Modus** ist der aktive Block (Spieler 1) sofort sichtbar, weitere
  Spieler-Blöcke bleiben per Scrollen im Block-Bereich erreichbar
  (`.board-container { overflow-y: auto }`); die Punkte + der Name stehen pro Block neben
  dem Joker über dem Raster (`.totals .total-line` + `.sheet-name`). Im **PvP/Notizblock**
  gibt es nur EINEN Block – er scrollt **nie**
  (`body.mode-notepad .board-container { overflow: visible }`). **Block größer:** der
  Block-Kopf (`.pb-head`) entfällt hier ganz; die **Punkte** stehen NEBEN dem Joker über
  dem Block (nur die TOTAL-Zeile aus `.totals` wird im PvP wieder eingeblendet) – über dem
  Raster bleibt also die kompakte Farb-Bonus/Joker/Punkte-Reihe und der KI-Kommentar ist
  ausgeblendet. Dadurch reicht
  weniger Höhen-Reserve – `--cell: clamp(16px, min((100vw − 200px)/15, (100dvh − 116px)/9), 42px)`
  – und der Block füllt den Platz über/neben sich aus, passt aber weiter garantiert ohne
  Scrollen auf eine Bildschirmhöhe.
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
  **Joker antippen = verwenden:** im PvP sind auch die Joker-Felder („!") anklickbar
  (`onJokerClick` → `game.toggleJokerUsed` → `sheet.toggleJokerAt`). Die Boxen füllen sich
  von links; Antippen einer freien Box markiert alle bis dorthin als verwendet, Antippen
  einer schon verwendeten gibt ab dort wieder frei. Jeder verwendete Joker entfällt als
  +1-Bonus (kostet also einen Punkt). Nur im PvP/Notizblock verdrahtet – im KI-Modus werden
  Joker weiterhin nur übers Würfel-Setzen verbraucht.
  **Wertungspanel** (`.side-panel`): Farb-Bonus, Joker UND Punkte stehen in EINER kompakten
  Reihe nebeneinander (statt untereinander) → alles rückt nach oben, der Block bekommt mehr
  Platz. **Punkte:** im Hochformat ohne Spielername, nur `… P.` (`#turn-info`,
  `setTurnInfo(…, relaxed)`) oben im Header. Im **Querformat** ist `#turn-info` ausgeblendet;
  die Punkte stehen stattdessen NEBEN dem Joker über dem Block – aus dem Wertungs-Kasten
  `.totals` wird im PvP-Querformat nur die TOTAL-Zeile wieder eingeblendet (Rest `display:
  none`). Der Block-Kopf (`.pb-head`) ist im PvP-Querformat komplett ausgeblendet, damit der
  Block die volle Höhe bekommt. Im engen Querformat ist die rechte Steuerspalte ~8 %
  schmaler (`minmax(138px, 176px)`).
- KI-Modus: gleiche Punkteanzeige-Idee – auf Handybreite (`@media max-width: 760px`) steht
  das Wertungspanel (`.side-panel`) ebenfalls als kompakte Reihe unter dem Raster (Farb-
  Bonus + Joker + Punkte nebeneinander), damit jeder Block weniger Höhe braucht.
- „Spiel beenden" (`#end-game-btn` im Spiel-Header): verwirft das laufende Spiel und
  geht zurück ins Menü. Im Querformat (Touch) sitzt der (kleinere) Knopf via
  `grid-area: ctl` ganz oben links in der rechten Steuerspalte; die beiden Theme/Ton-Icons
  (`#top-controls`) werden beim Spielstart per JS in die `.game-header` verschoben und
  teilen sich dann als echte Grid-Geschwister dieselbe `ctl`-Reihe rechts daneben (s. o.).
  `runGame` setzt dazu `dom.abortGame`; weil der Ablauf
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
