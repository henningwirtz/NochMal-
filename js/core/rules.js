// ============================================================================
// core/rules.js
// Regelkern fuer das Ankreuzen: Ermittelt alle gueltigen Platzierungen einer
// konkreten Farbe + Anzahl und validiert eine vom Spieler gewaehlte Auswahl.
//
// Joker werden VOR dem Aufruf aufgeloest (Farbe -> konkrete Farbe, ? -> 1..5).
// ============================================================================

import { GRID_ROWS, GRID_COLS, START_COL, MAX_PER_TURN } from './constants.js';
import { GRID } from '../data/board.js';

const key = (r, c) => `${r},${c}`;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function inBounds(r, c) {
  return r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS;
}

// Ist der Block (cells) korrekt verankert?
// -> Mind. ein Feld liegt in der Startspalte ODER ist orthogonal benachbart
//    zu einem bereits angekreuzten Feld.
// Da bei leerem Blatt nur die Startspalte verankern kann, erzwingt das
// automatisch die Regel "allererster Wurf in Startspalte H".
function isAnchored(sheet, cells) {
  for (const [r, c] of cells) {
    if (c === START_COL) return true;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && sheet.isMarked(nr, nc)) return true;
    }
  }
  return false;
}

// Ist die Zellmenge orthogonal zusammenhaengend?
function isConnected(cells) {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([r, c]) => key(r, c)));
  const seen = new Set([key(cells[0][0], cells[0][1])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of DIRS) {
      const k = key(r + dr, c + dc);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([r + dr, c + dc]);
      }
    }
  }
  return seen.size === cells.length;
}

// Alle gueltigen Platzierungen fuer (color, count).
// Rueckgabe: Array von Platzierungen, jede ein Array aus [r,c]-Feldern.
export function legalPlacements(sheet, color, count) {
  if (count < 1 || count > 5) return [];

  // Kandidaten: unmarkierte Felder der gewuenschten Farbe.
  const candidates = [];
  const candSet = new Set();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!sheet.isMarked(r, c) && GRID[r][c] === color) {
        candidates.push([r, c]);
        candSet.add(key(r, c));
      }
    }
  }

  const found = new Map(); // kanonischer Schluessel -> Felder

  function candNeighbors(r, c) {
    const out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (candSet.has(key(nr, nc))) out.push([nr, nc]);
    }
    return out;
  }

  // Erweitert eine zusammenhaengende Teilmenge bis zur Groesse `count`.
  function expand(subset, subsetKeys) {
    if (subset.length === count) {
      const canon = subset.map(([r, c]) => key(r, c)).sort().join('|');
      if (!found.has(canon)) found.set(canon, subset.map((cell) => cell.slice()));
      return;
    }
    const frontier = [];
    const seen = new Set();
    for (const [r, c] of subset) {
      for (const [nr, nc] of candNeighbors(r, c)) {
        const k = key(nr, nc);
        if (!subsetKeys.has(k) && !seen.has(k)) {
          seen.add(k);
          frontier.push([nr, nc]);
        }
      }
    }
    for (const [nr, nc] of frontier) {
      const k = key(nr, nc);
      subset.push([nr, nc]);
      subsetKeys.add(k);
      expand(subset, subsetKeys);
      subset.pop();
      subsetKeys.delete(k);
    }
  }

  for (const [r, c] of candidates) {
    expand([[r, c]], new Set([key(r, c)]));
  }

  const result = [];
  for (const cells of found.values()) {
    if (isAnchored(sheet, cells)) result.push(cells);
  }
  return result;
}

// Validiert eine konkret gewaehlte Platzierung.
export function isValidPlacement(sheet, color, count, cells) {
  if (!Array.isArray(cells) || cells.length !== count) return false;
  const keys = new Set(cells.map(([r, c]) => key(r, c)));
  if (keys.size !== cells.length) return false; // keine Duplikate
  for (const [r, c] of cells) {
    if (!inBounds(r, c)) return false;
    if (sheet.isMarked(r, c)) return false;
    if (GRID[r][c] !== color) return false;
  }
  if (!isConnected(cells)) return false;
  if (!isAnchored(sheet, cells)) return false;
  return true;
}

// Gibt es ueberhaupt einen gueltigen Zug fuer (color, count)?
export function hasLegalPlacement(sheet, color, count) {
  return legalPlacements(sheet, color, count).length > 0;
}

// Lockere Pruefung fuer den Notizblock-Modus: das Ankreuzen ist unabhaengig von den
// (real gewuerfelten) Wuerfeln, muss aber die NOCH-MAL!-Grundregeln einhalten:
// zusammenhaengend, an Startspalte/bestehendes Kreuz verankert, EINE Farbe und
// hoechstens 5 Felder (Zahlenwuerfel 1-5).
export function isRelaxedPlacement(sheet, cells) {
  if (!Array.isArray(cells) || cells.length < 1) return false;
  if (cells.length > MAX_PER_TURN) return false; // nie mehr als 5 in einem Zug
  const keys = new Set(cells.map(([r, c]) => key(r, c)));
  if (keys.size !== cells.length) return false; // keine Duplikate
  const color = GRID[cells[0][0]][cells[0][1]];
  for (const [r, c] of cells) {
    if (!inBounds(r, c)) return false;
    if (sheet.isMarked(r, c)) return false;
    if (GRID[r][c] !== color) return false; // nur eine Farbe pro Zug
  }
  return isConnected(cells) && isAnchored(sheet, cells);
}
