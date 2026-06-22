// ============================================================================
// core/constants.js
// Zentrale Konstanten: Farben, Wuerfelseiten, Wertungstabellen.
// ============================================================================

// Interne Farbschluessel.
export const COLORS = {
  GELB: 'gelb',
  GRUEN: 'gruen',
  BLAU: 'blau',
  ROT: 'rot',
  ORANGE: 'orange',
};

// Reihenfolge der 5 "echten" Farben (z.B. fuer Farb-Bonus-Leiste).
export const COLOR_ORDER = [
  COLORS.GELB,
  COLORS.GRUEN,
  COLORS.BLAU,
  COLORS.ROT,
  COLORS.ORANGE,
];

// Anzeigenamen (deutsch) und Darstellungsfarben (Hex) fuer die UI.
export const COLOR_LABEL = {
  [COLORS.GELB]: 'Gelb',
  [COLORS.GRUEN]: 'Gruen',
  [COLORS.BLAU]: 'Blau',
  [COLORS.ROT]: 'Rot',
  [COLORS.ORANGE]: 'Orange',
};

export const COLOR_HEX = {
  [COLORS.GELB]: '#f5d11e',
  [COLORS.GRUEN]: '#7cc043',
  [COLORS.BLAU]: '#3cb4e6',
  [COLORS.ROT]: '#e6357f', // pink/magenta wie im Original
  [COLORS.ORANGE]: '#f08a1d',
};

// Joker-Marker (schwarzer Farbwuerfel / Fragezeichen-Zahlenwuerfel).
export const JOKER = 'joker';

// Seiten der Wuerfel.
export const COLOR_DIE_FACES = [...COLOR_ORDER, JOKER];
export const NUMBER_DIE_FACES = [1, 2, 3, 4, 5, JOKER];

// Spielfeld-Geometrie.
export const GRID_COLS = 15;
export const GRID_ROWS = 7;
export const START_COL = 7; // Spalte H (0-basiert)

export const COLUMN_LETTERS = 'ABCDEFGHIJKLMNO'.split('');

// Spalten-Wertung: oberer Wert (erster Spieler) / unterer Wert (alle weiteren).
export const COLUMN_TOP = [5, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 3, 3, 3, 5];
export const COLUMN_BOTTOM = [3, 2, 2, 2, 1, 1, 1, 0, 1, 1, 1, 2, 2, 2, 3];

// Farb-Bonus: erster Spieler / alle weiteren.
export const COLOR_BONUS_FIRST = 5;
export const COLOR_BONUS_LATER = 3;

// Joker-Felder ("!") und Wertungsfaktoren.
export const JOKER_BOXES = 8;
export const UNUSED_JOKER_BONUS = 1; // je uebrigem "!" bei Spielende
export const STAR_PENALTY = 2;       // je nicht angekreuztem Stern

// Optionale Hausregeln.
export const PASS_PENALTY = 1;       // Minuspunkt je Pass (nur wenn Regel aktiv)

// Sonderregeln.
export const FREE_ROLLS = 3; // erste 3 Wuerfe: alle duerfen aus allen 6 Wuerfeln waehlen
export const MAX_PER_TURN = 5;

// Solo-Variante.
export const SOLO_LETTER_STROKES = 2;  // Striche je Buchstabenfeld
export const SOLO_MAX_ROLLS = 30;
