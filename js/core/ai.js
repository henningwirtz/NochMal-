// ============================================================================
// core/ai.js
// Heuristik-KI mit drei Staerken. Bewertet alle moeglichen Zuege aus dem
// verfuegbaren Wuerfel-Pool und waehlt den besten - oder passt.
//
// Die staerkste Stufe heisst im Menue "Leopold" (intern weiter 'schwer'). Sie
// bekommt zusaetzliche Taktik-Terme:
//   - keine "Waisen": vermeidet, einzelne schwer erreichbare Farbfelder uebrig
//     zu lassen (z.B. eine 6er-Farbgruppe nicht so anschneiden, dass Einzelfelder
//     liegen bleiben).
//   - Aussenspalten: treibt Fortschritt in den wertvollen Rand-Spalten (A/O = 5/3).
//   - Defensive (nur am eigenen Zug): verbraucht bevorzugt Wuerfel, die ein Gegner
//     dringend braucht - in diesem Spiel bekommen die passiven Mitspieler genau die
//     beiden Wuerfel NICHT, die der aktive Spieler benutzt.
//   - Endspiel-Timing: liegt Leopold vorn, draengt er aufs Spielende (2. Farbe),
//     liegt er hinten, vermeidet er den spielbeendenden Zug.
// Leopold kommentiert seine Zuege zudem mit frechen Spruechen (siehe unten).
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
import { hasStar, GRID, COLOR_COUNTS } from '../data/board.js';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Schwierigkeitsgrade: skalieren, wie stark die KI strategisch bewertet.
//   strat    - Gewicht der strategischen Terme (Spalten/Farben/Sterne/Mobilitaet)
//   complete - Extra-Bonus fuers Abschliessen einer Spalte/Farbe
//   joker    - Strafe je verbrauchtem Joker (knappe Ressource)
//   jitter   - Zufallsrauschen auf die Bewertung (macht die KI fehleranfaelliger)
// Nur fuer Leopold ('schwer') > 0:
//   orphan   - Strafe je NEU entstandenem isolierten Farbfeld ("Waise")
//   outer    - Gewicht fuer Fortschritt in (wertvollen) Aussenspalten
//   defense  - Gewicht fuers Wegnehmen eines vom Gegner begehrten Wuerfels
//   endgame  - Gewicht fuers Timing des spielbeendenden Zugs (vorn drängen / hinten meiden)
export const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];
const CFG = {
  leicht: { strat: 0.40, complete: 1, joker: 0.7, jitter: 3.0, orphan: 0, outer: 0, defense: 0, endgame: 0 },
  mittel: { strat: 0.85, complete: 1.5, joker: 1.2, jitter: 1.0, orphan: 0, outer: 0, defense: 0, endgame: 0 },
  schwer: { strat: 2.40, complete: 6, joker: 2.5, jitter: 0, orphan: 1.8, outer: 0.6, defense: 2.0, endgame: 4.0 },
};

// Zaehlt isolierte unmarkierte Felder EINER Farbe: ein Feld dieser Farbe, das
// keinen unmarkierten gleichfarbigen Nachbarn mehr hat. Solche "Waisen" lassen
// sich spaeter nur noch einzeln (mit genau passendem Wuerfel) fuellen.
function countColorOrphans(sheet, color) {
  let n = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (sheet.marks[r][c] || GRID[r][c] !== color) continue;
      let hasFriend = false;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS
            && !sheet.marks[nr][nc] && GRID[nr][nc] === color) {
          hasFriend = true;
          break;
        }
      }
      if (!hasFriend) n++;
    }
  }
  return n;
}

// Wie sehr "begehrt" ein Gegner diese Farbe? Naeher an komplett = will sie mehr.
function colorCraving(sheet, color) {
  if (sheet.isColorComplete(color)) return 0;
  const frac = sheet.colorMarkedCount(color) / COLOR_COUNTS[color];
  return Math.pow(frac, 1.5); // 0..1, betont fast-fertige Farben
}

// Defensiv-Bonus: nur am eigenen (aktiven) Zug. Verbraucht Leopold den EINZIGEN
// Wuerfel einer Farbe, die ein Gegner braucht, bekommen die passiven Mitspieler
// diese Farbe nicht mehr -> Bonus je nach Begehrlichkeit beim staerksten Gegner.
function denialBonus(colorFace, pool, ctx, cfg) {
  if (!cfg.defense || !ctx.isActive || !ctx.opponents || ctx.opponents.length === 0) return 0;
  if (colorFace === JOKER) return 0; // Joker nimmt keine konkrete Farbe weg
  let sameCount = 0;
  for (const d of pool.colorDice) if (d.face === colorFace) sameCount++;
  if (sameCount !== 1) return 0; // nicht knapp -> der zweite Wuerfel bleibt liegen
  let craving = 0;
  for (const opp of ctx.opponents) craving = Math.max(craving, colorCraving(opp, colorFace));
  return cfg.defense * craving;
}

// Bewertet eine konkrete Platzierung. Markiert temporaer und macht rueckgaengig.
function evaluatePlacement(sheet, cells, color, jokersUsed, cfg, ctx) {
  const before = cfg.orphan ? countColorOrphans(sheet, color) : 0;

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

  // --- Leopold-Zusatzterme (bei leicht/mittel sind die Gewichte 0) -----------
  // Aussenspalten: Fortschritt in noch offenen Spalten, gewichtet mit dem
  // Spaltenwert (Rand = 5, Mitte = 1) und quadratisch (fast-fertige zuerst).
  let outer = 0;
  if (cfg.outer) {
    for (const col of cols) {
      if (sheet.isColumnComplete(col)) continue;
      let filled = 0;
      for (let r = 0; r < GRID_ROWS; r++) if (sheet.marks[r][col]) filled++;
      outer += (filled * filled / GRID_ROWS) * (COLUMN_TOP[col] / 5);
    }
  }

  // Endspiel-Timing: schliesst dieser Zug das Spiel ab (2. Farbe / alle Spalten)?
  let endgame = 0;
  if (cfg.endgame
      && (sheet.completedColorGridCount() >= 2 || sheet.allColumnsComplete())) {
    endgame = ctx.scoreDiff >= 0 ? cfg.endgame : -cfg.endgame * 1.5;
  }

  const after = cfg.orphan ? countColorOrphans(sheet, color) : 0;

  for (const [r, c] of cells) sheet.marks[r][c] = false;

  const orphanPenalty = cfg.orphan * (after - before); // negativ, falls Waisen gefuellt
  return base + cfg.strat * strat - cfg.joker * jokersUsed
    - orphanPenalty + cfg.outer * outer + endgame;
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
// { colorId, numberId, color, count, cells, jokersUsed, situation? }.
// difficulty: 'leicht' | 'mittel' | 'schwer' (Default: mittel).
// ctx (optional, fuer Leopold): { opponents: Sheet[], isActive: bool, scoreDiff,
//   leaderName }. Ohne ctx spielt die KI rein auf das eigene Blatt.
export function chooseMove(sheet, pool, difficulty = 'mittel', ctx = {}) {
  const cfg = CFG[difficulty] || CFG.mittel;
  let best = null;
  let bestScore = 0.0001; // nur echte (positive) Zuege spielen

  // Die gueltigen Platzierungen haengen nur von (Farbe, Anzahl) und dem - waehrend
  // der Bewertung unveraenderten - Blatt ab. Bei zwei gleichfarbigen Wuerfeln oder
  // Jokern faellt dieselbe (teure) Aufzaehlung mehrfach an -> einmal merken.
  const placementCache = new Map(); // "color,count" -> Platzierungen
  const placementsFor = (color, count) => {
    const k = `${color},${count}`;
    let p = placementCache.get(k);
    if (!p) { p = legalPlacements(sheet, color, count); placementCache.set(k, p); }
    return p;
  };

  for (const cDie of pool.colorDice) {
    const denial = denialBonus(cDie.face, pool, ctx, cfg);
    for (const nDie of pool.numberDice) {
      for (const co of colorOptions(cDie.face, sheet.jokersRemaining())) {
        for (const no of countOptions(nDie.face, sheet.jokersRemaining())) {
          const jokersUsed = co.jokers + no.jokers;
          if (jokersUsed > sheet.jokersRemaining()) continue;

          const placements = placementsFor(co.color, no.count);
          for (const cells of placements) {
            let s = evaluatePlacement(sheet, cells, co.color, jokersUsed, cfg, ctx) + denial;
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

  // Fuer Leopold: einordnen, was der gewaehlte Zug bewirkt (fuer den Spruch).
  if (best && difficulty === 'schwer') {
    best.situation = classifyMove(sheet, best, pool, ctx);
  }
  return best;
}

// ----------------------------------------------------------------------------
// Leopold-Persoenlichkeit: Spielsituation erkennen + frecher Spruch dazu.
// ----------------------------------------------------------------------------

// Ordnet den gewaehlten Zug einer Situation zu (Prioritaet von oben nach unten).
function classifyMove(sheet, move, pool, ctx) {
  const { cells, count, jokersUsed } = move;
  for (const [r, c] of cells) sheet.marks[r][c] = true;
  const ends = sheet.completedColorGridCount() >= 2 || sheet.allColumnsComplete();
  const newCols = sheet.newlyCompletedColumns(cells);
  const newColors = sheet.newlyCompletedColors(cells);
  const outerFirst = newCols.some(
    (col) => (col === 0 || col === GRID_COLS - 1) && !sheet.columnTopStruck[col]
  );
  const star = cells.some(([r, c]) => hasStar(r, c));
  for (const [r, c] of cells) sheet.marks[r][c] = false;

  // Hat er einem Gegner mit diesem Zug eine begehrte Farbe weggenommen?
  let denial = false;
  if (ctx.isActive && ctx.opponents && ctx.opponents.length) {
    const cDie = pool.colorDice.find((d) => d.id === move.colorId);
    const face = cDie && cDie.face;
    if (face && face !== JOKER) {
      let same = 0;
      for (const d of pool.colorDice) if (d.face === face) same++;
      if (same === 1) {
        let craving = 0;
        for (const opp of ctx.opponents) craving = Math.max(craving, colorCraving(opp, face));
        denial = craving > 0.25;
      }
    }
  }

  const diff = ctx.scoreDiff || 0;
  if (ends && diff >= 0) return 'fastEnd';
  if (denial) return 'denial';
  if (outerFirst) return 'outer';
  if (newColors.length) return 'color';
  if (diff <= -6) return 'behind';
  if (diff >= 8) return 'ahead';
  if (star) return 'star';
  if (jokersUsed > 0) return 'joker';
  if (count >= 4) return 'big';
  if (count === 1) return 'lean';
  return 'standard';
}

// Spruch-Pool. {name} wird durch den Namen des fuehrenden Gegners ersetzt.
const LINES = {
  thinkScan: [
    'Mhm, gucken wir erst mal, was {name} so braucht …',
    'Was hat {name} denn da Schönes? Mal sehen …',
    'Erst schauen, was {name} fehlt – dann zuschlagen.',
  ],
  thinkGeneric: [
    'Lass mich kurz nachdenken … fertig.',
    'Hmmm. Interessant. Für mich.',
    'Moment, ich rechne das kurz durch.',
  ],
  denial: [
    'Den Würfel? Tut mir ja leid, {name} – nehm ich mit.',
    '{name} hätte das gut gebrauchen können. Schade. Wirklich.',
    'Sharing is caring. Aber heute nicht.',
    'Ich spiel ja nicht gemein. Nur … vorausschauend.',
  ],
  fastEnd: [
    'Machen wir mal eine schnelle Runde, ja?',
    'Zweite Farbe und Feierabend – ich hab Hunger.',
    'Packt schon mal zusammen, das wird nichts mehr.',
    'Noch ein Kreuzchen und das Licht geht aus.',
  ],
  ahead: [
    'Ich will ja nicht angeben, aber … doch, will ich.',
    "Wer hat's erfunden? Na?",
    'Entspannt euch, das ist gleich vorbei.',
  ],
  behind: [
    'Noch ist nichts entschieden. NOCH nicht.',
    'Ich lass euch mal kurz vorne. Genießt es.',
    'Comeback-Modus aktiviert.',
  ],
  outer: [
    'Außen, fünf Punkte, danke der Nachfrage.',
    'Die Ränder gehören mir.',
    'Spalte am Rand? Mein Revier.',
  ],
  color: [
    'Eine Farbe weniger für euch.',
    'Komplett. So macht man das.',
  ],
  joker: [
    'Na gut, EINEN Joker. Aber nur diesen einen.',
    'Das tat jetzt weh.',
  ],
  star: [
    'Stern gesichert – kein Minus für mich.',
  ],
  big: [
    'Fünf auf einen Streich!',
    'Das nenn ich Ausbeute.',
  ],
  lean: [
    'Ein Feld. Auch gut. Kleinvieh macht auch Mist.',
  ],
  pass: [
    'Diese Runde lass ich aus. Strategisch, versteht sich.',
    'Nichts Gescheites dabei. Eure Schuld vermutlich.',
  ],
  standard: [
    "So, weiter geht's.",
    'Routine.',
    'Passt schon.',
  ],
};

function pickLine(pool, leaderName) {
  if (!pool || !pool.length) return '';
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace('{name}', leaderName || 'ihr');
}

// Spruch waehrend des Ueberlegens (vor der Zug-Wahl). Am eigenen Zug mit Gegnern
// "scannt" Leopold den Fuehrenden, sonst ein neutraler Denk-Spruch.
export function leopoldThinking(ctx = {}) {
  const scanning = ctx.isActive && ctx.opponents && ctx.opponents.length && ctx.leaderName;
  return pickLine(scanning ? LINES.thinkScan : LINES.thinkGeneric, ctx.leaderName);
}

// Spruch zum gewaehlten Zug (oder 'pass'). situation kommt aus classifyMove.
export function leopoldComment(situation, leaderName) {
  return pickLine(LINES[situation] || LINES.standard, leaderName);
}
