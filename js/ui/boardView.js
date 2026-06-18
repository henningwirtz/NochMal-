// ============================================================================
// ui/boardView.js
// Rendert ein Spielblatt: 15x7-Raster (Farben, Sterne, Kreuze), Spalten-
// wertung, Farb-Bonus, Joker-Felder, Sterne und laufende Punkte.
// ============================================================================

import {
  COLOR_ORDER,
  COLOR_HEX,
  COLOR_LABEL,
  COLUMN_LETTERS,
  COLUMN_TOP,
  COLUMN_BOTTOM,
  COLOR_BONUS_FIRST,
  COLOR_BONUS_LATER,
  JOKER_BOXES,
  GRID_ROWS,
  GRID_COLS,
  START_COL,
} from '../core/constants.js';
import { GRID, hasStar } from '../data/board.js';

const cellKey = (r, c) => `${r},${c}`;

// options: { interactive, highlight:Set, selected:Set, onCellClick(r,c),
//            onColumnClick(col), onColorClick(color) }
// onColumnClick/onColorClick werden nur im PvP/Notizblock gesetzt (Buchstaben/Boni
// anklickbar: "anderer Spieler war zuerst" -> nur reduzierte Punkte).
export function renderSheet(sheet, options = {}) {
  const {
    interactive = false, highlight = new Set(), selected = new Set(), onCellClick,
    onColumnClick = null, onColorClick = null,
  } = options;

  const root = document.createElement('div');
  root.className = 'sheet';

  // --- Rasterbereich (Buchstaben + Felder + Spaltenwertung) ---------------
  const gridArea = document.createElement('div');
  gridArea.className = 'grid-area';
  gridArea.style.setProperty('--cols', GRID_COLS);

  // Zeile 1: Spaltenbuchstaben (im PvP anklickbar zum Streichen des Oberwerts).
  for (let c = 0; c < GRID_COLS; c++) {
    const letter = document.createElement('div');
    letter.className = 'col-letter';
    if (c === START_COL) letter.classList.add('start-col');
    if (sheet.columnTopStruck[c]) letter.classList.add('struck');
    letter.textContent = COLUMN_LETTERS[c];
    if (onColumnClick) {
      letter.classList.add('clickable');
      const col = c;
      letter.addEventListener('click', () => onColumnClick(col));
    }
    gridArea.appendChild(letter);
  }

  // Zeilen 2..8: Felder.
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.background = COLOR_HEX[GRID[r][c]];
      if (c === START_COL) cell.classList.add('start-col');

      if (hasStar(r, c)) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        cell.appendChild(star);
      }

      const k = cellKey(r, c);
      if (sheet.isMarked(r, c)) {
        cell.classList.add('marked');
        const x = document.createElement('span');
        x.className = 'mark';
        x.textContent = '✕';
        cell.appendChild(x);
      }
      if (highlight.has(k)) cell.classList.add('highlight');
      if (selected.has(k)) cell.classList.add('selected');

      if (interactive && onCellClick) {
        cell.addEventListener('click', () => onCellClick(r, c));
      }
      gridArea.appendChild(cell);
    }
  }

  // Zeilen 9..10: Spaltenwertung (oben/unten).
  appendScoreRow(gridArea, COLUMN_TOP, sheet, 'top');
  appendScoreRow(gridArea, COLUMN_BOTTOM, sheet, 'bottom');

  root.appendChild(gridArea);

  // --- Seitliches Wertungspanel -------------------------------------------
  root.appendChild(renderSidePanel(sheet, onColorClick));

  return root;
}

function appendScoreRow(gridArea, values, sheet, which) {
  for (let c = 0; c < GRID_COLS; c++) {
    const box = document.createElement('div');
    box.className = `col-score ${which}`;
    box.textContent = values[c];

    const award = sheet.columnAward[c];
    if (which === 'top') {
      if (award === COLUMN_TOP[c]) box.classList.add('circled');
      else if (award !== null || sheet.columnTopStruck[c]) box.classList.add('struck');
    } else {
      if (award === COLUMN_BOTTOM[c]) box.classList.add('circled');
    }
    gridArea.appendChild(box);
  }
}

function renderSidePanel(sheet, onColorClick = null) {
  const panel = document.createElement('div');
  panel.className = 'side-panel';

  // Farb-Bonus (Titel + Reihe als kompakte Gruppe; im Querformat sitzen die
  // Gruppen nebeneinander unter dem Block).
  const bonusGroup = document.createElement('div');
  bonusGroup.className = 'panel-group';
  panel.appendChild(bonusGroup);

  const bonusTitle = document.createElement('div');
  bonusTitle.className = 'panel-title';
  bonusTitle.textContent = 'Farb-Bonus';
  bonusGroup.appendChild(bonusTitle);

  const bonusRow = document.createElement('div');
  bonusRow.className = 'bonus-row';
  for (const color of COLOR_ORDER) {
    const box = document.createElement('div');
    box.className = 'bonus-box';
    box.style.background = COLOR_HEX[color];
    box.title = COLOR_LABEL[color];

    const first = document.createElement('span');
    first.textContent = COLOR_BONUS_FIRST;
    first.className = 'bonus-first';
    const later = document.createElement('span');
    later.textContent = COLOR_BONUS_LATER;
    later.className = 'bonus-later';

    const award = sheet.colorAward[color];
    if (award === COLOR_BONUS_FIRST) first.classList.add('circled');
    else if (award === COLOR_BONUS_LATER) {
      later.classList.add('circled');
      first.classList.add('struck');
    } else if (sheet.colorFirstStruck[color]) {
      first.classList.add('struck');
    }
    box.appendChild(first);
    box.appendChild(later);
    if (onColorClick) {
      box.classList.add('clickable');
      box.addEventListener('click', () => onColorClick(color));
    }
    bonusRow.appendChild(box);
  }
  bonusGroup.appendChild(bonusRow);

  // Joker-Felder ("!") - eigene Gruppe (Titel + Reihe).
  const jokerGroup = document.createElement('div');
  jokerGroup.className = 'panel-group';
  panel.appendChild(jokerGroup);

  const jokerTitle = document.createElement('div');
  jokerTitle.className = 'panel-title';
  jokerTitle.textContent = `Joker (${sheet.jokersRemaining()} übrig)`;
  jokerGroup.appendChild(jokerTitle);

  const jokerRow = document.createElement('div');
  jokerRow.className = 'joker-row';
  for (let i = 0; i < JOKER_BOXES; i++) {
    const box = document.createElement('div');
    box.className = 'joker-box';
    box.textContent = '!';
    if (i < sheet.jokersUsed) box.classList.add('used');
    jokerRow.appendChild(box);
  }
  jokerGroup.appendChild(jokerRow);

  // Punkte-Uebersicht.
  const score = sheet.computeScore();
  const totals = document.createElement('div');
  totals.className = 'totals';
  totals.innerHTML = `
    <div><span>Bonus (Farben)</span><span>${score.bonus}</span></div>
    <div><span>Spalten A–O</span><span>${score.columns}</span></div>
    <div><span>Joker übrig (+1)</span><span>+${score.jokerBonus}</span></div>
    <div><span>Sterne offen (−2)</span><span>−${score.starPenalty}</span></div>
    <div class="total-line"><span>TOTAL</span><span>${score.total}</span></div>
  `;
  panel.appendChild(totals);

  return panel;
}
