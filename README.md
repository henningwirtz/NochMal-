# NOCH MAL! – Browser-Nachbau

Ein regelgetreuer Nachbau des Würfel-/Kreuzelspiels **NOCH MAL!** (Schmidt Spiele,
Inka & Markus Brand) als reine Web-App – **Vanilla JavaScript, kein Build-Schritt**.

- Lokales **Pass-and-Play** (1–6 Spieler) **und** **KI-Gegner** (heuristisch)
- Vollständige Wertung: Spalten A–O, Farb-Bonus (5/3), 8 Joker-„!"-Felder, Stern-Malus (−2)
- **Solo-Variante** (2+2 Würfel, 30 Würfe, Level-Tabelle)
- Deutsche Oberfläche

## Starten

ES-Module benötigen einen HTTP-Server (kein `file://`). Im Projektordner:

```powershell
python -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000/>

Alternativen: `npx serve` oder die VS-Code-Erweiterung „Live Server".

Im Setup Spieleranzahl wählen, je Spieler Name und **Mensch/KI** festlegen,
dann **Spiel starten**. (1 Spieler = Solo-Variante.)

## Auf dem Handy spielen

Das Spiel ist eine **PWA** (installierbare Web-App) und für Touch/kleine Bildschirme
optimiert. Es braucht eine Adresse, die per **HTTPS** erreichbar ist – am einfachsten
kostenlos über **GitHub Pages**.

### Schritt 1 – Veröffentlichen (einmalig, ~3 Min.)
1. Auf GitHub das Repository öffnen → **Settings** → links **Pages**.
2. Unter „Build and deployment" bei **Source** „Deploy from a branch" wählen,
   **Branch** `main` und Ordner `/ (root)`, dann **Save**.
3. Nach ein, zwei Minuten erscheint oben die öffentliche Adresse, etwa:
   `https://<dein-name>.github.io/NochMal/`
4. Diese Adresse lässt sich sofort in jedem Browser öffnen – auch am Handy.

### Schritt 2 – Aufs Handy holen
- **Adresse teilen:** Den Link z. B. per Nachricht aufs Handy schicken und im
  Handy-Browser öffnen. Fertig – sofort spielbar.

### Schritt 3 – Als App installieren (optional, empfohlen)
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"** →
  **Hinzufügen**. Es erscheint ein App-Icon; die App startet im Vollbild.
- **Android (Chrome):** Seite öffnen → Menü (⋮) → **„App installieren"** bzw.
  **„Zum Startbildschirm hinzufügen"**.

Danach läuft das Spiel wie eine echte App – inklusive **Offline-Betrieb** (dank
Service Worker). Updates werden bei bestehender Internetverbindung automatisch
geladen; im Setup zeigt der kleine „Stand: …"-Hinweis die geladene Version.

> Hinweis: Reines Öffnen der `index.html` per Doppelklick (`file://`) funktioniert
> nicht – ES-Module und der Service Worker brauchen einen Server (lokal die
> Startskripte, fürs Handy GitHub Pages o. Ä.).

## Spielregeln (Kurzfassung)

Der aktive Spieler würfelt alle 6 Würfel und nimmt 1 Farb- + 1 Zahlenwürfel; die
anderen wählen aus den 4 übrigen (in den ersten 3 Würfen aus allen 6). Es werden so
viele zusammenhängende Felder der Farbe angekreuzt, wie die Zahl zeigt – benachbart
zu bereits Angekreuztem oder in der Startspalte H beginnend. Schwarzer Würfel =
beliebige Farbe, „?" = Zahl 1–5 (je Joker ein „!"-Feld). Volle Spalten und komplette
Farben geben Punkte; bei 2 kompletten Farben endet das Spiel.

## Tests

- **Im Browser:** <http://localhost:8000/tests.html> (Regel- und Wertungstests)
- **In Node:**

```powershell
npm test          # bzw. node js/tests/node-runner.mjs
node js/tests/sim.mjs   # Headless-Smoke-Test: komplette KI-Partien
```

## Projektstruktur

```
index.html / tests.html        Einstieg / Testseite
css/styles.css                 Layout
js/main.js                     Setup & Bootstrap
js/data/board.js               Spielplan (15x7-Farbraster, Sterne)
js/core/                       constants, dice, rules, sheet, game, ai
js/ui/                         boardView, controls, flow
js/tests/                      testsuite, node-runner, sim
```

## Hinweis zum Spielplan

Das 15×7-Farbraster ist eine **regelgetreue Rekonstruktion im Stil der offiziellen
Vorlage** und strukturell validiert (5 Farben, jede Zelle vom Start erreichbar). Da
die Engine vollständig datengetrieben ist, lässt sich das Layout in
[`js/data/board.js`](js/data/board.js) jederzeit gegen ein exaktes Original
austauschen, ohne Code zu ändern.
