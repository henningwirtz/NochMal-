// ============================================================================
// js/tests/testsuite.js
// DOM-freie Assertions fuer Regelkern und Wertung. Wird von tests.html (Browser)
// und vom Node-Runner genutzt.
// ============================================================================

import { validateBoard, GRID, COLOR_COUNTS, STARS } from '../data/board.js';
import { COLORS, COLOR_ORDER, COLUMN_TOP, COLUMN_BOTTOM, START_COL, GRID_ROWS, GRID_COLS } from '../core/constants.js';
import { Sheet } from '../core/sheet.js';
import { legalPlacements, isValidPlacement } from '../core/rules.js';
import { Game } from '../core/game.js';

const key = (r, c) => `${r},${c}`;
const toKeySet = (placement) => new Set(placement.map(([r, c]) => key(r, c)));

function markColumn(sheet, col) {
  for (let r = 0; r < GRID_ROWS; r++) sheet.marks[r][col] = true;
}
function markColor(sheet, color) {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (GRID[r][c] === color) sheet.marks[r][c] = true;
    }
  }
}
// Bringt eine Runde in den "abgeschlossen"-Zustand fuer resolveRound().
function forceRoundComplete(game) {
  game.order = [];
  game.pointer = 0;
}

export function runTests() {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion fehlgeschlagen'); };
  const eq = (a, b, msg) => assert(a === b, `${msg || ''} (erwartet ${b}, war ${a})`);

  // 1) Spielplan ist strukturell gueltig.
  test('Spielplan-Validierung', () => {
    assert(validateBoard() === true);
    eq(Object.keys(COLOR_COUNTS).length, 5, 'Anzahl Farben');
    const total = Object.values(COLOR_COUNTS).reduce((a, b) => a + b, 0);
    eq(total, GRID_ROWS * GRID_COLS, 'Gesamtzahl Felder');
  });

  // 2) Erster Zug nur in Startspalte H.
  test('Erster Zug muss in Startspalte H liegen', () => {
    const sheet = new Sheet();
    const startColor = GRID[0][START_COL]; // blau
    const places = legalPlacements(sheet, startColor, 1);
    // Nur Startspalten-Felder dieser Farbe sind verankert.
    for (const p of places) {
      assert(p.length === 1);
      assert(p[0][1] === START_COL, 'Platzierung ausserhalb Startspalte');
    }
    assert(places.length >= 1, 'mindestens eine Startplatzierung');
    // Ein Feld ausserhalb der Startspalte ist ungueltig.
    assert(!isValidPlacement(sheet, startColor, 1, [[0, 9]]));
  });

  // 3) Verbindung & Diagonale.
  test('Zusammenhang und Diagonal-Verbot', () => {
    const sheet = new Sheet();
    sheet.marks[0][START_COL] = true; // ein blaues Startfeld angekreuzt
    sheet.hasMarkedAny = true;
    // Zwei nicht benachbarte gleichfarbige Felder sind kein gueltiger Block.
    const blue = [];
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (GRID[r][c] === COLORS.BLAU && !sheet.marks[r][c]) blue.push([r, c]);
    // Suche zwei blaue Felder, die NICHT orthogonal benachbart sind.
    let pair = null;
    outer: for (const a of blue) for (const b of blue) {
      if (a === b) continue;
      const adj = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
      if (!adj) { pair = [a, b]; break outer; }
    }
    assert(pair, 'Testdaten: nicht-benachbartes Paar gefunden');
    assert(!isValidPlacement(sheet, COLORS.BLAU, 2, pair), 'unzusammenhaengender Block muss ungueltig sein');
  });

  // 4) Exakte Anzahl.
  test('Exakte Anzahl erforderlich', () => {
    const sheet = new Sheet();
    const startColor = GRID[0][START_COL];
    assert(!isValidPlacement(sheet, startColor, 2, [[0, START_COL]]), '1 Feld bei Anzahl 2');
  });

  // 5) Wertung: Bonus + Spalte + Joker - Sterne.
  test('Endwertung computeScore', () => {
    const sheet = new Sheet();
    sheet.awardColumn(0, true);        // +5 (oberer Wert Spalte A)
    sheet.awardColor(COLORS.GELB, 5);  // +5 Farb-Bonus
    sheet.useJokers(2);                // 6 Joker uebrig -> +6
    // Alle Sterne ankreuzen -> kein Malus.
    for (const [r, c] of STARS) sheet.marks[r][c] = true;
    const s = sheet.computeScore();
    eq(s.bonus, 5, 'Bonus');
    eq(s.columns, COLUMN_TOP[0], 'Spalten');
    eq(s.jokerBonus, 6, 'Joker-Bonus');
    eq(s.starPenalty, 0, 'Stern-Malus');
    eq(s.total, 5 + COLUMN_TOP[0] + 6, 'Total');
  });

  // 6) Spalte: mehrere Erste im selben Wurf -> beide oberer Wert.
  test('Spalte erster Wurf: beide oberer Wert', () => {
    const game = new Game([{ name: 'A', isHuman: true }, { name: 'B', isHuman: false }]);
    markColumn(game.players[0].sheet, 2);
    markColumn(game.players[1].sheet, 2);
    forceRoundComplete(game);
    game.resolveRound();
    eq(game.players[0].sheet.columnAward[2], COLUMN_TOP[2], 'A oberer Wert');
    eq(game.players[1].sheet.columnAward[2], COLUMN_TOP[2], 'B oberer Wert');
    assert(game.columnFirstClaimed[2], 'Spalte als beansprucht markiert');
  });

  // 7) Spalte spaeter -> unterer Wert.
  test('Spalte spaeter: unterer Wert', () => {
    const game = new Game([{ name: 'A', isHuman: true }, { name: 'B', isHuman: false }]);
    markColumn(game.players[0].sheet, 2);
    forceRoundComplete(game);
    game.resolveRound(); // A zuerst -> oberer Wert
    markColumn(game.players[1].sheet, 2);
    forceRoundComplete(game);
    game.resolveRound(); // B spaeter -> unterer Wert
    eq(game.players[0].sheet.columnAward[2], COLUMN_TOP[2], 'A oberer Wert');
    eq(game.players[1].sheet.columnAward[2], COLUMN_BOTTOM[2], 'B unterer Wert');
  });

  // 8) Farb-Bonus 5 / 3.
  test('Farb-Bonus 5 dann 3', () => {
    const game = new Game([{ name: 'A', isHuman: true }, { name: 'B', isHuman: false }]);
    markColor(game.players[0].sheet, COLORS.GELB);
    forceRoundComplete(game);
    game.resolveRound();
    eq(game.players[0].sheet.colorAward[COLORS.GELB], 5, 'A erste Farbe 5');
    markColor(game.players[1].sheet, COLORS.GELB);
    forceRoundComplete(game);
    game.resolveRound();
    eq(game.players[1].sheet.colorAward[COLORS.GELB], 3, 'B spaeter 3');
  });

  // 9) Spielende bei 2 kompletten Farben.
  test('Spielende bei 2 Farben', () => {
    const game = new Game([{ name: 'A', isHuman: true }, { name: 'B', isHuman: false }]);
    markColor(game.players[0].sheet, COLOR_ORDER[0]);
    markColor(game.players[0].sheet, COLOR_ORDER[1]);
    forceRoundComplete(game);
    game.resolveRound();
    assert(game.finished, 'Spiel muss beendet sein');
  });

  // 10) Auch im PvP/Notizblock-Modus (relaxed, ein Spieler) endet das Spiel bei
  // 2 kompletten Farben automatisch.
  test('PvP/Notizblock: Spielende bei 2 Farben', () => {
    const game = new Game([{ name: 'Du', isHuman: true }], { relaxed: true });
    markColor(game.players[0].sheet, COLOR_ORDER[0]);
    markColor(game.players[0].sheet, COLOR_ORDER[1]);
    forceRoundComplete(game);
    game.resolveRound();
    assert(game.finished, 'Spiel muss beendet sein');
  });

  // 11) PvP: Spalten-Oberwert per Antippen umschalten - 1. Tippen streicht, 2. Tippen
  // gibt den vollen Oberwert wieder frei (auch ein bereits gewerteter Wert wird zurück-
  // gestuft und wieder hochgestuft).
  test('PvP: Spalten-Strike umschaltbar (Toggle)', () => {
    const game = new Game([{ name: 'Du', isHuman: true }], { relaxed: true });
    const sheet = game.players[0].sheet;
    markColumn(sheet, 2);                       // Spalte C komplett
    game.toggleColumnStrikeByOther(0, 2);       // 1. Tippen: gestrichen
    assert(sheet.columnTopStruck[2], 'nach 1. Tippen gestrichen');
    game._awardCompletedRelaxed(sheet);
    eq(sheet.columnAward[2], COLUMN_BOTTOM[2], 'reduzierter Wert');
    game.toggleColumnStrikeByOther(0, 2);       // 2. Tippen: wieder frei
    assert(!sheet.columnTopStruck[2], 'nach 2. Tippen wieder frei');
    eq(sheet.columnAward[2], COLUMN_TOP[2], 'Oberwert wieder hergestellt');
  });

  // 12) PvP: Farb-Erstbonus per Antippen umschalten (5 <-> 3).
  test('PvP: Farb-Strike umschaltbar (Toggle)', () => {
    const game = new Game([{ name: 'Du', isHuman: true }], { relaxed: true });
    const sheet = game.players[0].sheet;
    markColor(sheet, COLORS.GELB);              // Farbe komplett
    game.toggleColorStrikeByOther(0, COLORS.GELB);
    game._awardCompletedRelaxed(sheet);
    eq(sheet.colorAward[COLORS.GELB], 3, 'reduzierter Farb-Bonus');
    game.toggleColorStrikeByOther(0, COLORS.GELB);
    eq(sheet.colorAward[COLORS.GELB], 5, 'voller Farb-Bonus wieder hergestellt');
  });

  return results;
}
