// ============================================================================
// core/ai.js
// Heuristik-KI (eine Staerke). Bewertet alle moeglichen Zuege aus dem
// verfuegbaren Wuerfel-Pool und waehlt den besten - oder passt.
// ============================================================================

import {
  COLOR_ORDER,
  COLUMN_TOP,
  COLUMN_BOTTOM,
  COLOR_BONUS_FIRST,
  COLOR_BONUS_LATER,
  STAR_PENALTY,
  JOKER,
  GRID_ROWS,
  GRID_COLS,
} from './constants.js';
import { legalPlacements } from './rules.js';
import { hasStar } from '../data/board.js';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Schwierigkeitsgrade: skalieren, wie stark die KI strategisch bewertet.
//   strat    - Gewicht der strategischen Terme (Spalten/Farben/Sterne/Mobilitaet)
//   complete - Extra-Bonus fuers Abschliessen einer Spalte/Farbe
//   joker    - Strafe je verbrauchtem Joker (knappe Ressource)
//   jitter   - Zufallsrauschen auf die Bewertung (macht die KI fehleranfaelliger)
export const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];
const CFG = {
  leicht: { strat: 0.40, complete: 1, joker: 0.7, jitter: 3.0 },
  mittel: { strat: 0.85, complete: 1.5, joker: 1.2, jitter: 1.0 },
  schwer: { strat: 2.40, complete: 6, joker: 2.5, jitter: 0 },
};

// Bewertet eine konkrete Platzierung. Markiert temporaer und macht rueckgaengig.
function evaluatePlacement(sheet, cells, color, jokersUsed, cfg) {
  for (const [r, c] of cells) sheet.marks[r][c] = true;

  const base = cells.length; // jedes angekreuzte Feld ist Fortschritt
  let strat = 0;

  const cols = new Set(cells.map(([, c]) => c));
  for (const col of cols) {
    if (sheet.isColumnComplete(col)) {
      strat += sheet.columnTopStruck[col] ? COLUMN_BOTTOM[col] : COLUMN_TOP[col];
      strat += cfg.complete; // Spaltenabschluss extra belohnen
    } else {
      let inCol = 0;
      for (let r = 0; r < GRID_ROWS; r++) if (sheet.marks[r][col]) inCol++;
      strat += inCol * 0.3; // Fortschritt Richtung Spaltenabschluss
    }
  }

  if (sheet.isColorComplete(color)) {
    strat += sheet.colorFirstStruck[color] ? COLOR_BONUS_LATER : COLOR_BONUS_FIRST;
    strat += cfg.complete;
  } else {
    strat += sheet.colorMarkedCount(color) * 0.05;
  }

  for (const [r, c] of cells) {
    if (hasStar(r, c)) strat += STAR_PENALTY; // vermeidet -2 bei Spielende
  }

  // Frontier: neue Anschlussmoeglichkeiten foerdern Beweglichkeit.
  let frontier = 0;
  for (const [r, c] of cells) {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && !sheet.marks[nr][nc]) {
        frontier++;
      }
    }
  }
  strat += frontier * 0.08;

  for (const [r, c] of cells) sheet.marks[r][c] = false;

  return base + cfg.strat * strat - cfg.joker * jokersUsed;
}

// Liefert die moeglichen (color, jokers) bzw. (count, jokers) Auswahlen eines Wuerfels.
function colorOptions(face, jokersRemaining) {
  if (face === JOKER) {
    return jokersRemaining > 0 ? COLOR_ORDER.map((c) => ({ color: c, jokers: 1 })) : [];
  }
  return [{ color: face, jokers: 0 }];
}
function countOptions(face, jokersRemaining) {
  if (face === JOKER) {
    return jokersRemaining > 0 ? [1, 2, 3, 4, 5].map((n) => ({ count: n, jokers: 1 })) : [];
  }
  return [{ count: face, jokers: 0 }];
}

// Waehlt den besten Zug. Rueckgabe: null (passen) oder
// { colorId, numberId, color, count, cells, jokersUsed }.
// difficulty: 'leicht' | 'mittel' | 'schwer' (Default: mittel).
export function chooseMove(sheet, pool, difficulty = 'mittel') {
  const cfg = CFG[difficulty] || CFG.mittel;
  let best = null;
  let bestScore = 0.0001; // nur echte (positive) Zuege spielen

  for (const cDie of pool.colorDice) {
    for (const nDie of pool.numberDice) {
      for (const co of colorOptions(cDie.face, sheet.jokersRemaining())) {
        for (const no of countOptions(nDie.face, sheet.jokersRemaining())) {
          const jokersUsed = co.jokers + no.jokers;
          if (jokersUsed > sheet.jokersRemaining()) continue;

          const placements = legalPlacements(sheet, co.color, no.count);
          for (const cells of placements) {
            let s = evaluatePlacement(sheet, cells, co.color, jokersUsed, cfg);
            if (cfg.jitter) s += Math.random() * cfg.jitter;
            if (s > bestScore) {
              bestScore = s;
              best = {
                colorId: cDie.id,
                numberId: nDie.id,
                color: co.color,
                count: no.count,
                cells,
                jokersUsed,
              };
            }
          }
        }
      }
    }
  }
  return best;
}
