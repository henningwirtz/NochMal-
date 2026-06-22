// ============================================================================
// data/board.js
// ----------------------------------------------------------------------------
// Die Spielplaene ("Bloecke") von "NOCH MAL!": je 15 Spalten (A-O) x 7 Zeilen =
// 105 farbige Kaestchen, plus Sternfelder und die Startspalte H.
//
// Die Engine ist vollstaendig datengetrieben: ein Brett steckt komplett in
// Daten (RAW_GRID + STARS), nicht im Code. Es gibt eine Registry mehrerer
// Bloecke (BOARDS); das gerade aktive Brett wird ueber setActiveBoard(id)
// umgeschaltet. Die Exporte GRID/COLOR_COUNTS/STARS sind absichtlich `let`
// (ES-Module-Live-Bindings): wird das aktive Brett gewechselt, sehen alle
// Verbraucher (sheet/ai/rules/controls/boardView) sofort die neuen Werte, weil
// sie diese erst zur Laufzeit (in Funktionen) lesen.
//
// Farbcodes im Raster:
//   y = gelb, n = gruen, b = blau, r = rot (pink/magenta), o = orange
// ============================================================================

import { COLORS } from '../core/constants.js';

// Kurzcode im Raster -> interner Farbschluessel
const CODE_TO_COLOR = {
  y: COLORS.GELB,
  n: COLORS.GRUEN,
  b: COLORS.BLAU,
  r: COLORS.ROT,
  o: COLORS.ORANGE,
};

export const ROWS = 7;
export const COLS = 15;

// 7 Zeilen, jeweils 15 Spalten (A..O). Startspalte H = Index 7.
//          ABCDEFGHIJKLMNO
const STANDARD_RAW = [
  'nnnyyyynbbboyyy',
  'onynyyoorbboonn',
  'bnrnnnnrrryyonn',
  'brrnoobbnnyyorb',
  'roooorbbooorrrr',
  'rbbrrrryyorbbbo',
  'yybbbbryyynnnoo',
];

// Sternpositionen [Zeile, Spalte] - vom Originalblock uebernommen (14 Sterne).
const STANDARD_STARS = [
  [0, 7], [0, 11],
  [1, 2], [1, 4], [1, 9],
  [2, 0], [2, 6],
  [3, 5], [3, 13],
  [5, 1], [5, 3], [5, 8], [5, 10],
  [6, 12],
];

// ----------------------------------------------------------------------------
// Registry der waehlbaren Bloecke.
//   id    - stabiler Schluessel (wird in den Einstellungen gemerkt)
//   name  - Anzeigename im Auswahl-Menue
//   raw   - 7 Zeilen a 15 Farbcodes (y/n/b/r/o)
//   stars - Sternpositionen [Zeile, Spalte]
//
// Aktuell gibt es genau EIN echtes Brett (Standard). Die Platzhalter nutzen
// vorerst dieselbe Vorlage (gueltiges Brett), bis scharfe Einzelbilder der
// weiteren Bloecke vorliegen - dann nur `raw`/`stars` des Eintrags ersetzen.
// ----------------------------------------------------------------------------
export const BOARDS = [
  { id: 'standard', name: 'Standard', raw: STANDARD_RAW, stars: STANDARD_STARS },
  { id: 'block2', name: 'Block 2 (Platzhalter)', raw: STANDARD_RAW, stars: STANDARD_STARS },
  { id: 'block3', name: 'Block 3 (Platzhalter)', raw: STANDARD_RAW, stars: STANDARD_STARS },
];

// ----------------------------------------------------------------------------
// Aktives Brett. Diese Exporte werden von setActiveBoard() neu gesetzt.
// ----------------------------------------------------------------------------
export let GRID = [];           // GRID[row][col] -> Farbschluessel (z.B. COLORS.GELB)
export let STARS = [];          // [[r, c], ...]
export let COLOR_COUNTS = {};   // Farbe -> Anzahl Felder (fuer Farb-Komplettierung)
export let activeBoardId = null;

let STAR_SET = new Set();       // Schnelle Pruefung "Feld hat Stern" (intern)

// RAW (7 Zeilen Codes) -> 2D-Farbraster; wirft bei unbekanntem Code.
function rawToGrid(raw) {
  return raw.map((row) =>
    row.split('').map((ch) => {
      const color = CODE_TO_COLOR[ch];
      if (!color) throw new Error(`Unbekannter Farbcode "${ch}" im Spielplan`);
      return color;
    })
  );
}

function countColors(grid) {
  const counts = {};
  for (const row of grid) {
    for (const color of row) counts[color] = (counts[color] || 0) + 1;
  }
  return counts;
}

// Aktives Brett umschalten: id muss in BOARDS existieren. Rechnet GRID,
// STARS, COLOR_COUNTS und das interne STAR_SET aus dem gewaehlten Block neu.
export function setActiveBoard(id) {
  const board = BOARDS.find((b) => b.id === id) || BOARDS[0];
  GRID = rawToGrid(board.raw);
  STARS = board.stars.map(([r, c]) => [r, c]);
  COLOR_COUNTS = countColors(GRID);
  STAR_SET = new Set(STARS.map(([r, c]) => `${r},${c}`));
  activeBoardId = board.id;
  return board.id;
}

// Schnelle Pruefung, ob ein Feld einen Stern traegt (liest das aktive Brett).
export function hasStar(row, col) {
  return STAR_SET.has(`${row},${col}`);
}

// Standardbrett als Default aktiv setzen (beim Modul-Laden).
setActiveBoard(BOARDS[0].id);

// ----------------------------------------------------------------------------
// Strukturvalidierung. Prueft jeden Block der Registry (wirft bei Problemen),
// damit ein fehlerhaft uebertragenes Brett sofort beim Laden auffaellt.
// ----------------------------------------------------------------------------
function validateOne(board) {
  const problems = [];
  const grid = rawToGrid(board.raw);
  const stars = board.stars;

  if (grid.length !== ROWS) problems.push(`Erwartet ${ROWS} Zeilen, gefunden ${grid.length}`);
  grid.forEach((row, r) => {
    if (row.length !== COLS) problems.push(`Zeile ${r} hat ${row.length} statt ${COLS} Spalten`);
  });

  const total = grid.reduce((sum, row) => sum + row.length, 0);
  if (total !== ROWS * COLS) problems.push(`Erwartet ${ROWS * COLS} Felder, gefunden ${total}`);

  const counts = countColors(grid);
  if (Object.keys(counts).length !== 5) {
    problems.push(`Erwartet 5 Farben, gefunden ${Object.keys(counts).length}`);
  }

  // Jede Zelle muss orthogonal vom Startspalten-Feld erreichbar sein (Brett zusammenhaengend).
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const stack = [[0, 7]];
  seen[0][7] = true;
  let reached = 1;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !seen[nr][nc]) {
        seen[nr][nc] = true;
        reached++;
        stack.push([nr, nc]);
      }
    }
  }
  if (reached !== ROWS * COLS) problems.push(`Nur ${reached}/${ROWS * COLS} Felder vom Start erreichbar`);

  // Sterne muessen innerhalb des Bretts liegen.
  for (const [r, c] of stars) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) problems.push(`Stern ausserhalb des Bretts: ${r},${c}`);
  }

  if (problems.length) {
    throw new Error(`Ungueltiger Spielplan "${board.name}":\n - ` + problems.join('\n - '));
  }
}

export function validateBoard() {
  for (const board of BOARDS) validateOne(board);
  return true;
}
