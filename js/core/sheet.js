// ============================================================================
// core/sheet.js
// Zustand eines einzelnen Spielblatts: angekreuzte Felder, Joker, gewertete
// Spalten/Farben und die Endwertung.
// ============================================================================

import {
  GRID_ROWS,
  GRID_COLS,
  COLOR_ORDER,
  COLUMN_TOP,
  COLUMN_BOTTOM,
  JOKER_BOXES,
  UNUSED_JOKER_BONUS,
  STAR_PENALTY,
} from './constants.js';
import { GRID, COLOR_COUNTS, hasStar, STARS } from '../data/board.js';

export class Sheet {
  constructor() {
    this.marks = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
    this.jokersUsed = 0;
    this.hasMarkedAny = false;

    // Wertung: pro Spalte der diesem Spieler gutgeschriebene Wert (oder null).
    this.columnAward = Array(GRID_COLS).fill(null);
    // Spalten, bei denen der obere Wert bereits von einem anderen vergeben ist.
    this.columnTopStruck = Array(GRID_COLS).fill(false);

    // Farb-Bonus: Farbe -> gutgeschriebener Wert.
    this.colorAward = {};
    // Farben, bei denen der erste (5er) Bonus bereits vergeben ist.
    this.colorFirstStruck = {};
  }

  isMarked(r, c) {
    return this.marks[r][c];
  }

  color(r, c) {
    return GRID[r][c];
  }

  // Kreuzt eine Liste von Feldern [[r,c], ...] an.
  mark(cells) {
    for (const [r, c] of cells) {
      this.marks[r][c] = true;
    }
    if (cells.length) this.hasMarkedAny = true;
  }

  jokersRemaining() {
    return JOKER_BOXES - this.jokersUsed;
  }

  useJokers(n) {
    this.jokersUsed += n;
  }

  // --- Spalten -------------------------------------------------------------
  isColumnComplete(col) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!this.marks[r][col]) return false;
    }
    return true;
  }

  // Liefert die Spalten, die mit dieser Markierung NEU komplett geworden sind.
  newlyCompletedColumns(cells) {
    const cols = new Set(cells.map(([, c]) => c));
    const result = [];
    for (const col of cols) {
      if (this.columnAward[col] === null && this.isColumnComplete(col)) {
        result.push(col);
      }
    }
    return result;
  }

  awardColumn(col, isTop) {
    this.columnAward[col] = isTop ? COLUMN_TOP[col] : COLUMN_BOTTOM[col];
  }

  strikeColumnTop(col) {
    this.columnTopStruck[col] = true;
  }

  // --- Farben --------------------------------------------------------------
  colorMarkedCount(color) {
    let n = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.marks[r][c] && GRID[r][c] === color) n++;
      }
    }
    return n;
  }

  isColorComplete(color) {
    return this.colorMarkedCount(color) === COLOR_COUNTS[color];
  }

  newlyCompletedColors(cells) {
    const colors = new Set(cells.map(([r, c]) => GRID[r][c]));
    const result = [];
    for (const color of colors) {
      if (this.colorAward[color] === undefined && this.isColorComplete(color)) {
        result.push(color);
      }
    }
    return result;
  }

  awardColor(color, value) {
    this.colorAward[color] = value;
  }

  strikeColorFirst(color) {
    this.colorFirstStruck[color] = true;
  }

  completedColorCount() {
    return Object.keys(this.colorAward).length;
  }

  // Anzahl der vollstaendig angekreuzten Farben (grid-basiert, unabhaengig von der Wertung).
  completedColorGridCount() {
    return COLOR_ORDER.filter((c) => this.isColorComplete(c)).length;
  }

  // Sind alle Spalten geschlossen?
  allColumnsComplete() {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!this.isColumnComplete(c)) return false;
    }
    return true;
  }

  // --- Sterne --------------------------------------------------------------
  uncrossedStars() {
    let n = 0;
    for (const [r, c] of STARS) {
      if (!this.marks[r][c]) n++;
    }
    return n;
  }

  // --- Endwertung ----------------------------------------------------------
  computeScore() {
    const bonus = Object.values(this.colorAward).reduce((a, b) => a + b, 0);
    const columns = this.columnAward.reduce((a, v) => a + (v || 0), 0);
    const jokerBonus = this.jokersRemaining() * UNUSED_JOKER_BONUS;
    const starPenalty = this.uncrossedStars() * STAR_PENALTY;
    const total = bonus + columns + jokerBonus - starPenalty;
    return {
      bonus,
      columns,
      jokerBonus,
      jokersRemaining: this.jokersRemaining(),
      starPenalty,
      uncrossedStars: this.uncrossedStars(),
      total,
    };
  }
}

export { hasStar, COLOR_ORDER };
