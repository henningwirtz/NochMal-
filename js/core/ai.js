// ============================================================================
// core/ai.js
// Heuristik-KI mit drei Staerken. Bewertet alle moeglichen Zuege aus dem
// verfuegbaren Wuerfel-Pool und waehlt den besten - oder passt.
//
// Die staerkste Stufe heisst im Menue "Leopold" (intern weiter 'schwer'). Sie
// verfolgt - nach Prioritaet - diese Taktiken:
//   1. Spalten/Farben abschliessen (als Erster, bevorzugt Aussenspalten A/O = 5/3).
//   2. Sterne mitnehmen (sonst -2 je offenem Stern am Ende).
//   3. Joker sparen: nur fuers Endspiel-Schliessen, als Notausweg, oder ganz frueh
//      1-2 Stueck, um schnell zu den wertvollen Raendern zu kommen. Die letzten
//      ~2 Joker werden bis zum Endspiel reserviert.
//   4. Sauber fuellen: kleine Farbgruppen (<=5) nicht so anschneiden, dass Reste
//      (v.a. Einzelfelder) liegen bleiben. Gruppen mit 6+ Feldern darf man
//      anschneiden (passt nie in einen Zug) - das ist normal.
//   5. Aussenspalten ansteuern (Fortschritt Richtung A/O).
//   6. Defensive: am eigenen Zug dem staerksten Gegner den Wuerfel wegnehmen.
//   7. Endspiel-Timing: vorn -> aufs Ende draengen, hinten -> beendenden Zug meiden.
// Leopold kommentiert seine Zuege zudem frech und abwechslungsreich (siehe unten).
// ============================================================================

import {
  COLOR_ORDER,
  COLUMN_TOP,
  COLUMN_BOTTOM,
  COLOR_BONUS_FIRST,
  COLOR_BONUS_LATER,
  STAR_PENALTY,
  JOKER,
  JOKER_BOXES,
  GRID_ROWS,
  GRID_COLS,
} from './constants.js';
import { legalPlacements } from './rules.js';
import { hasStar, GRID, COLOR_COUNTS } from '../data/board.js';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;

// Schwierigkeitsgrade: skalieren, wie stark die KI strategisch bewertet.
//   strat     - Gewicht der strategischen Terme (Spalten/Farben/Mobilitaet)
//   complete  - Extra-Bonus fuers Abschliessen einer Spalte/Farbe
//   joker     - Grund-Strafe je verbrauchtem Joker (knappe Ressource)
//   jitter    - Zufallsrauschen (macht die KI fehleranfaelliger)
//   frontier  - Gewicht des Mobilitaets-Bonus (neue Anschlussfelder)
// Nur fuer Leopold ('schwer') > 0:
//   strand    - Strafe je liegengelassenem Feld einer kleinen (<=5) Farbgruppe
//   outer     - Gewicht fuer Fortschritt in (wertvollen) Aussenspalten
//   defense   - Gewicht fuers Wegnehmen eines vom Gegner begehrten Wuerfels
//   endgame   - Gewicht fuers Timing des spielbeendenden Zugs
//   jokerPhase- true: Joker-Strafe phasenabhaengig (sparen) statt flach
//   jokerReserve - Aufschlag, wenn die letzten 2 Joker angetastet wuerden
export const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];
const CFG = {
  leicht: { strat: 0.40, complete: 1, joker: 0.7, jitter: 3.0, frontier: 1,
            strand: 0, outer: 0, defense: 0, endgame: 0, jokerPhase: false, jokerReserve: 0 },
  mittel: { strat: 0.85, complete: 1.5, joker: 1.2, jitter: 1.0, frontier: 1,
            strand: 0, outer: 0, defense: 0, endgame: 0, jokerPhase: false, jokerReserve: 0 },
  schwer: { strat: 2.40, complete: 6, joker: 5, jitter: 0, frontier: 0,
            strand: 3.0, outer: 0.6, defense: 2.0, endgame: 4.0, jokerPhase: true, jokerReserve: 4 },
};

// "Schlechtigkeit" der aktuell FREIEN Fragmente einer Farbe: je kleiner ein
// zusammenhaengendes freies Stueck dieser Farbe, desto schlechter (winzige Reste
// brauchen exakt die passende Augenzahl, ein Einzelfeld die exakte 1). Grosse
// Gruppen (6+) sind normal -> straffrei. Wird in evaluatePlacement VOR und NACH
// dem Zug aufgerufen; die Differenz misst, wie viel kleinen Rest der Zug NEU
// erzeugt (positiv = schlecht) bzw. sauber wegfuellt (negativ = gut).
const FRAGMENT_WEIGHT = [0, 4.0, 2.2, 1.0, 0.4, 0.15]; // Index = Fragmentgroesse
function fragmentBadness(sheet, color) {
  const seen = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  let bad = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (seen[r][c] || sheet.marks[r][c] || GRID[r][c] !== color) continue;
      let size = 0;
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        size++;
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS
              && !seen[nr][nc] && !sheet.marks[nr][nc] && GRID[nr][nc] === color) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      bad += FRAGMENT_WEIGHT[size] || 0; // ab Groesse 6 straffrei
    }
  }
  return bad;
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

// Joker-Strafe fuer Leopold: jeder bereits verbrauchte Joker macht den naechsten
// teurer (Knappheit) - so werden insgesamt nur wenige ausgegeben. Spaet (volles
// Blatt) wieder billig, damit Joker Spalten schliessen koennen. Die letzten 2
// werden bis zum Endspiel reserviert; nur die ERSTEN ein, zwei Joker sind frueh
// guenstig, wenn sie nach aussen bauen (schnell zu den Raendern).
function jokerPenalty(jokersUsed, jokersLeft, filled, advancesOuter, cfg) {
  if (!jokersUsed) return 0;
  if (!cfg.jokerPhase) return cfg.joker * jokersUsed; // leicht/mittel: flach
  const usedSoFar = JOKER_BOXES - jokersLeft;          // 0..8
  let perJoker = cfg.joker * (1 + 0.5 * usedSoFar);     // jeder weitere Joker teurer
  if (filled >= 0.7) {
    perJoker *= 0.4;                                    // Endspiel: Joker fuers Schliessen freigeben
  } else if (jokersLeft - jokersUsed < 2) {
    perJoker += cfg.jokerReserve;                       // Reserve der letzten 2 schuetzen
  }
  if (advancesOuter && filled < 0.4 && usedSoFar < 2) perJoker *= 0.5; // frueher Weg nach aussen
  return perJoker * jokersUsed;
}

// Bewertet eine konkrete Platzierung. Markiert temporaer und macht rueckgaengig.
// info = { filled } (einmal je Zug vorberechnet).
function evaluatePlacement(sheet, cells, color, jokersUsed, cfg, ctx, info) {
  const strandBefore = cfg.strand ? fragmentBadness(sheet, color) : 0;

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

  // Frontier: neue Anschlussmoeglichkeiten foerdern Beweglichkeit. Bei Leopold
  // (cfg.frontier 0) abgeschaltet, weil es sonst Luecken belohnt.
  if (cfg.frontier) {
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
    strat += cfg.frontier * frontier * 0.08;
  }

  // --- Leopold-Zusatzterme (bei leicht/mittel sind die Gewichte 0) -----------
  // (4) Sauber fuellen: bestrafe NEU erzeugte kleine freie Fragmente (Differenz
  // nachher - vorher). Negativ, wenn der Zug einen kleinen Rest sauber wegfuellt.
  const strand = cfg.strand ? fragmentBadness(sheet, color) - strandBefore : 0;

  // (5) Aussenspalten: Fortschritt in noch offenen Spalten, gewichtet mit dem
  // Spaltenwert (Rand = 5, Mitte = 1) und quadratisch (fast-fertige zuerst);
  // frueh zusaetzlich verstaerkt (schnell nach aussen).
  let outer = 0;
  if (cfg.outer) {
    for (const col of cols) {
      if (sheet.isColumnComplete(col)) continue;
      let filledCol = 0;
      for (let r = 0; r < GRID_ROWS; r++) if (sheet.marks[r][col]) filledCol++;
      outer += (filledCol * filledCol / GRID_ROWS) * (COLUMN_TOP[col] / 5);
    }
    if (info.filled < 0.4) outer *= 1.4;
  }

  // (7) Endspiel-Timing: schliesst dieser Zug das Spiel ab (2. Farbe / alle Spalten)?
  let endgame = 0;
  if (cfg.endgame
      && (sheet.completedColorGridCount() >= 2 || sheet.allColumnsComplete())) {
    endgame = ctx.scoreDiff >= 0 ? cfg.endgame : -cfg.endgame * 1.5;
  }

  for (const [r, c] of cells) sheet.marks[r][c] = false;

  const advancesOuter = cfg.outer && [...cols].some((c) => c <= 2 || c >= GRID_COLS - 3);
  const jp = jokerPenalty(jokersUsed, sheet.jokersRemaining(), info.filled, advancesOuter, cfg);

  return base + cfg.strat * strat - jp - cfg.strand * strand + cfg.outer * outer + endgame;
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

// Anteil bereits angekreuzter Felder (Spielphase: 0 = leer, ~1 = voll).
function filledFraction(sheet) {
  let n = 0;
  for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) if (sheet.marks[r][c]) n++;
  return n / TOTAL_CELLS;
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

  const filled = filledFraction(sheet);

  // Gueltige Platzierungen haengen nur von (Farbe[,Anzahl]) und dem - waehrend der
  // Bewertung unveraenderten - Blatt ab -> einmal merken.
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

          const info = { filled };
          const placements = placementsFor(co.color, no.count);
          for (const cells of placements) {
            let s = evaluatePlacement(sheet, cells, co.color, jokersUsed, cfg, ctx, info) + denial;
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
    'Mal kurz bei {name} spicken … aha.',
    'Was würde {name} wohl wollen? Genau das nehm ich.',
  ],
  thinkGeneric: [
    'Lass mich kurz nachdenken … fertig.',
    'Hmmm. Interessant. Für mich.',
    'Moment, ich rechne das kurz durch.',
    'Einen Augenblick, ich plane drei Züge voraus.',
    'Kurz überlegen … ach was, ich weiß es längst.',
  ],
  denial: [
    'Den Würfel? Tut mir ja leid, {name} – nehm ich mit.',
    '{name} hätte das gut gebrauchen können. Schade. Wirklich.',
    'Sharing is caring. Aber heute nicht.',
    'Ich spiel ja nicht gemein. Nur … vorausschauend.',
    'Sorry {name}, der war schon reserviert. Für mich.',
    'Genau den wolltest du, {name}? Dachte ich mir.',
  ],
  fastEnd: [
    'Machen wir mal eine schnelle Runde, ja?',
    'Zweite Farbe und Feierabend – ich hab Hunger.',
    'Packt schon mal zusammen, das wird nichts mehr.',
    'Noch ein Kreuzchen und das Licht geht aus.',
    'Ich beende das jetzt mal gnädig.',
    'Kurzes Spiel, kurzes Leid – für euch.',
  ],
  ahead: [
    'Ich will ja nicht angeben, aber … doch, will ich.',
    "Wer hat's erfunden? Na?",
    'Entspannt euch, das ist gleich vorbei.',
    'Der Abstand wird … gemütlich, oder?',
    'Holt schon mal die Taschentücher.',
    'Ich führe? Was für eine Überraschung. Nicht.',
  ],
  behind: [
    'Noch ist nichts entschieden. NOCH nicht.',
    'Ich lass euch mal kurz vorne. Genießt es.',
    'Comeback-Modus aktiviert.',
    'Aufwärmphase beendet. Jetzt komm ich.',
    'Ihr habt Vorsprung? Wie niedlich.',
    'Das war Absicht. Spannung muss sein.',
  ],
  outer: [
    'Außen, fünf Punkte, danke der Nachfrage.',
    'Die Ränder gehören mir.',
    'Spalte am Rand? Mein Revier.',
    'Ab nach außen – da liegt das Geld.',
    'Rand gesichert. Reingewinn.',
    'Die fetten Spalten nehm natürlich ich.',
  ],
  color: [
    'Eine Farbe weniger für euch.',
    'Komplett. So macht man das.',
    'Farbe fertig – Bonus eingesackt.',
    'Diese Farbe ist jetzt offiziell meine.',
    'Voll. Sauber. Meins.',
    'Regenbogen-Fortschritt, würde ich sagen.',
  ],
  joker: [
    'Na gut, EINEN Joker. Aber nur diesen einen.',
    'Das tat jetzt weh.',
    "Joker raus – ausnahmsweise, weil's sich lohnt.",
    'Teuer, aber stilvoll.',
    'Den Joker investier ich mal clever.',
  ],
  star: [
    'Stern gesichert – kein Minus für mich.',
    'Sternchen mitgenommen, sieht hübsch aus.',
    'Ein Stern für mich, ein Minus weniger.',
    'Sterne sammeln können auch andere – ich aber besser.',
    'Den Stern lass ich mir nicht entgehen.',
    'Funkel, funkel – Punkt gerettet.',
  ],
  big: [
    'Fünf auf einen Streich!',
    'Das nenn ich Ausbeute.',
    'Großzügig mit mir selbst.',
    'Schön viel auf einmal – effizient.',
    'Volle Kelle, warum auch nicht.',
  ],
  lean: [
    'Ein Feld. Auch gut. Kleinvieh macht auch Mist.',
    'Klein, aber meins.',
    'Ein Kreuzchen Schadensbegrenzung.',
    'Reicht für den Moment.',
    'Mini-Zug, Maxi-Plan.',
  ],
  pass: [
    'Diese Runde lass ich aus. Strategisch, versteht sich.',
    'Nichts Gescheites dabei. Eure Schuld vermutlich.',
    'Ich warte auf was Besseres. Das kann ich mir leisten.',
    'Passen ist auch eine Kunst.',
    'Lieber nichts als Murks.',
  ],
  // Allgemeiner Pool (themenfrei) - wird "immer mal wieder" eingestreut.
  general: [
    'Ich und verlieren? Kenn ich nicht.',
    'Läuft bei mir.',
    'Das hier ist Kunst. Würfel-Kunst.',
    'Ihr dürft ruhig zugucken und lernen.',
    'Profi am Werk, bitte nicht stören.',
    'Tick, tack – die Uhr läuft für euch.',
    'Ich mach das jetzt mal eben richtig.',
    'Notiert euch das, kommt in der Prüfung dran.',
    'So sieht Souveränität aus.',
    'Ihr spielt auch mit? Süß.',
    'Vertrau mir, ich bin quasi Experte.',
    'Locker aus dem Handgelenk.',
    'Wer braucht schon Glück, wenn er mich hat.',
    'Wenn ich hier durch bin, gibt es erst mal ein Belohnungssteak.',
  ],

  // --- Spott auf den MENSCHLICHEN Zug. {name} = Name des Menschen. ----------
  // Erzeugt ein winziges, kaum füllbares Restfeld (1er/2er-Lücke) - haertester Spott.
  humanStrand: [
    'Stark, {name}! Da fehlt jetzt genau EIN Feld – viel Glück mit dem exakten Würfel.',
    '{name}, hast du gesehen, was du da liegen lässt? Den Rest füllst du nie.',
    'Mutig, {name}. Diese Lücke braucht punktgenau die richtige Zahl. Toi, toi, toi.',
    'Aua. {name}, dieses einsame Restfeld weint schon.',
    'Klasse Plan, {name}: lauter winzige Löcher, die keiner mehr stopft.',
    'Genau so macht man es NICHT, {name}. Aber bitte, weiter so.',
    'Oh, {name} sägt sich die Farbe selbst kaputt. Sehr großzügig.',
  ],
  // Joker fuer einen Mini-Zug verbraucht.
  humanJokerWaste: [
    'Einen Joker für DAS, {name}? Mutige Verschwendung.',
    '{name} ballert den Joker raus – für ein, zwei Feldchen. Respekt? Nein.',
    'Joker für so wenig, {name}? Den spart man sich eigentlich.',
    'Teurer Spaß, {name}. Der Joker wäre später Gold wert gewesen.',
    'Joker verbrannt, {name}. Ich notier das als Geschenk an mich.',
  ],
  // Nur ein Feld angekreuzt.
  humanLean: [
    'Ein Feld, {name}? Wow. Ganze Arbeit.',
    'Mini-Zug, {name}. Nur nicht überanstrengen.',
    '{name} kreuzt EIN Kästchen an. Atemberaubend.',
    'Ein Kreuzchen, {name}? Geht auch mutiger.',
    'So gewinnt man keine Rennen, {name}. Aber niedlich.',
  ],
  // Spalte/Farbe abgeschlossen - zaehneknirschendes Lob.
  humanGood: [
    'Na sieh an, {name} kann es doch. Einmalig, schätze ich.',
    'Nicht schlecht, {name}. Glück muss man haben.',
    'Ordentlich, {name}. Hast du gespickt?',
    'Okay okay, {name}, der saß. Zufall natürlich.',
    'Respekt, {name} – das hätte ich auch gemacht. Nur früher.',
  ],
  // Grosser Zug (>=4 Felder), sauber.
  humanBig: [
    'Viele Felder, {name}. Quantität vor Qualität, was?',
    'Schön großzügig, {name}. Hoffentlich passt das noch zusammen.',
    'Voll reingehauen, {name}. Mutig.',
    'Fünf auf einmal, {name}? Angeber. Das ist MEIN Job.',
  ],
  // Gepasst.
  humanPass: [
    '{name} passt. Kapituliert man heute schon so früh?',
    'Nichts gefunden, {name}? Tja, Denken ist eben schwer.',
    '{name} setzt aus. Sehr … entspannt.',
    'Passen, {name}? Kreative Form des Mitspielens.',
    'Du lässt aus, {name}? Mehr Würfel für mich, danke.',
  ],
  // Fader Standardzug - allgemeiner Spott ("fast jeder Zug").
  humanGeneral: [
    'Solide langweilig, {name}.',
    'Okay, {name}. Ich tu mal so, als wäre das ein Plan.',
    'Hübsch, {name}. Ändert am Ergebnis nichts.',
    'Weiter so, {name} – ich gewinne trotzdem.',
    'Notiert, {name}. Beeindruckt? Eher nicht.',
    'Du spielst, ich gewinne, {name}. Eingespieltes Team.',
    'Mhm, {name}. Mach du nur.',
    'Ich schau dir gern beim Verlieren zu, {name}.',
    'Brav, {name}. Setzen, drei.',
  ],
};

// Zuletzt gesagte Sprueche merken, damit sich unter ~10 Spruechen hoechstens
// einer wiederholt (gleicher Spruch erst nach 9 anderen wieder moeglich).
let recentLines = [];
const RECENT_MAX = 9;

function draw(pools, leaderName) {
  const flat = [];
  for (const p of pools) if (p) for (const l of p) flat.push(l);
  if (!flat.length) return '';
  let choices = flat.filter((l) => !recentLines.includes(l));
  if (!choices.length) choices = flat; // Pool zu klein -> Wiederholung zulassen
  const raw = choices[Math.floor(Math.random() * choices.length)];
  recentLines.push(raw);
  if (recentLines.length > RECENT_MAX) recentLines.shift();
  return raw.replace('{name}', leaderName || 'ihr');
}

// Spruch waehrend des Ueberlegens (vor der Zug-Wahl). Am eigenen Zug mit Gegnern
// "scannt" Leopold den Fuehrenden, sonst ein neutraler Denk-Spruch - ab und zu
// auch ein allgemeiner.
export function leopoldThinking(ctx = {}) {
  const scanning = ctx.isActive && ctx.opponents && ctx.opponents.length && ctx.leaderName;
  const sit = scanning ? LINES.thinkScan : LINES.thinkGeneric;
  return draw([Math.random() < 0.33 ? LINES.general : sit], ctx.leaderName);
}

// Spruch zum gewaehlten Zug (oder 'pass'). situation kommt aus classifyMove.
// Etwa ein Drittel der Zeit kommt stattdessen ein allgemeiner Spruch.
export function leopoldComment(situation, leaderName) {
  const sit = LINES[situation];
  const useGeneral = !sit || Math.random() < 0.33;
  return draw([useGeneral ? LINES.general : sit], leaderName);
}

// ----------------------------------------------------------------------------
// Leopold verspottet den MENSCHLICHEN Zug. Wird nur aufgerufen, wenn Leopold
// ('schwer') im Spiel ist (siehe flow.js). choice = { cells, color, count,
// jokersUsed } oder null (= gepasst).
// ----------------------------------------------------------------------------

// Ordnet einen menschlichen Zug einer Spott-Situation zu. Klassifiziert auf dem
// Vor-Zug-Blatt (temporaer markieren, danach zuruecksetzen) - veraendert es nicht.
function classifyHumanMove(sheet, choice) {
  if (!choice) return 'humanPass';
  const { cells, color, count, jokersUsed = 0 } = choice;
  const fragBefore = fragmentBadness(sheet, color);
  for (const [r, c] of cells) sheet.marks[r][c] = true;
  const fragAfter = fragmentBadness(sheet, color);
  const newCols = sheet.newlyCompletedColumns(cells);
  const newColors = sheet.newlyCompletedColors(cells);
  for (const [r, c] of cells) sheet.marks[r][c] = false;

  const strand = fragAfter - fragBefore;        // >0: kleiner Rest neu erzeugt
  if (strand >= 2) return 'humanStrand';        // 1er/2er-Luecke hinterlassen
  if (jokersUsed > 0 && count <= 2) return 'humanJokerWaste';
  if (newCols.length || newColors.length) return 'humanGood';
  if (count >= 4) return 'humanBig';
  if (count === 1) return 'humanLean';
  return 'humanMeh';
}

// Liefert Leopolds Spruch zum menschlichen Zug (oder '' = schweigt). Auffaellige
// Situationen werden immer kommentiert; beim faden Standardzug (humanMeh) kommt
// zu ~75 % ein allgemeiner Spott, sonst bleibt Leopold mal still.
export function leopoldReactToHuman(sheet, choice, humanName) {
  const sit = classifyHumanMove(sheet, choice);
  if (sit === 'humanMeh') {
    if (Math.random() >= 0.75) return '';
    return draw([LINES.humanGeneral], humanName);
  }
  return draw([LINES[sit]], humanName);
}
