// ============================================================================
// ui/flow.js
// Orchestriert den Spielablauf SCHRITTWEISE: Jeder Schritt (Würfeln, Zug eines
// Spielers - auch der KI) wird per Klick ausgelöst. Vor jedem Zug wird ein
// Schnappschuss gespeichert, sodass man mit der Zurück-Taste jederzeit Zug für
// Zug zurückspringen kann. Mensch-Züge laufen interaktiv (controls.js). KI-Züge
// werden als zusammenhängende "KI-Phase" gebündelt: EIN Klick ("▶ KI laufen
// lassen") startet alle direkt aufeinanderfolgenden KI-Aktionen (würfeln +
// wählen, auch über mehrere Runden) automatisch animiert, bis wieder ein Mensch
// dran ist. Mit dem Auto-Häkchen (game.aiAuto) entfällt auch dieser eine Klick.
// ============================================================================

import { renderSheet } from './boardView.js';
import { humanTurn } from './controls.js';
import { recordResults } from './storage.js';
import { escapeHtml } from './util.js';
import { playRoll, playMark, playEnd } from './sound.js';
import { chooseMove } from '../core/ai.js';
import {
  COLOR_LABEL,
  COLOR_HEX,
  COLUMN_LETTERS,
  JOKER,
  SOLO_MAX_ROLLS,
  COLOR_DIE_FACES,
  NUMBER_DIE_FACES,
} from '../core/constants.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Schrittweiser Ablauf (event-gesteuert, mit Zurück-Funktion)
// ---------------------------------------------------------------------------
export function runGame(game, dom) {
  const history = [];          // Schnappschüsse: Zustand VOR den bisherigen Zügen
  let pendingSnapshot = null;  // Zustand, zu dem die aktuelle Entscheidung zurückkehrt
  let currentControl = null;   // laufender Mensch-Zug (zum Abbrechen bei Zurück/Beenden)
  let busy = false;            // sperrt Buttons während Würfel-/KI-Animationen
  let pauseAuto = false;       // nach Zurück: KI-Phase NICHT automatisch starten (erst auf Klick)

  // "Spiel beenden": evtl. laufenden Mensch-Zug abbrechen; main.js geht ins Menü.
  dom.abortGame = () => {
    if (currentControl && currentControl.cancel) currentControl.cancel();
    currentControl = null;
  };

  // Zurück-Taste (liegt im HTML, ist während des ganzen Spiels sichtbar).
  if (dom.undoBtn) dom.undoBtn.onclick = onUndo;

  function updateUndoButton() {
    if (!dom.undoBtn) return;
    dom.undoBtn.classList.remove('hidden');
    dom.undoBtn.disabled = history.length === 0 || busy;
  }

  // Nimmt den zuletzt gemachten Zug zurück (nach kurzer Rückfrage) und stellt den
  // Zustand davor wieder her - egal ob es ein eigener oder ein KI-Zug war.
  function onUndo() {
    if (busy || history.length === 0) return;
    if (!confirm('Zum vorherigen Zug zurück? Der zuletzt gemachte Zug wird zurückgesetzt.')) return;
    if (currentControl && currentControl.cancel) currentControl.cancel();
    currentControl = null;
    // Nach Zurück die KI nicht sofort wieder selbst loslaufen lassen - sonst würde
    // der zurückgenommene Zug im Auto-Modus direkt wieder gemacht. Erst auf Klick.
    pauseAuto = true;
    game.restore(history.pop());
    announce(dom, '↩ Zurück: der letzte Zug wurde zurückgesetzt.');
    present();
  }

  // Zentrale Weiche: leitet aus dem Spielzustand ab, was als Nächstes zu tun ist.
  // Mensch-Schritte (Würfeln/Wählen) laufen interaktiv; KI-Schritte werden als
  // zusammenhängende "KI-Phase" gebündelt (presentAiPhase) und laufen automatisch
  // ab, bis wieder ein Mensch an der Reihe ist.
  function present() {
    currentControl = null;
    // Spielende: regulär (2 Farben / alle Spalten) oder im Solo nach 30 Würfen.
    if (game.finished ||
        (game.soloMode && game.rollCount >= SOLO_MAX_ROLLS && game.isRoundComplete())) {
      finishGame();
      return;
    }
    updateUndoButton();
    // PvP/Notizblock: eigener Ablauf - die Referenzwürfel bleiben stehen, bis man
    // über den Würfeln-Button selbst neu würfelt. Angekreuzt wird frei.
    if (game.relaxed) { presentRelaxed(); return; }
    if (game.isRoundComplete()) {
      // Es muss gewürfelt werden: aktiver Spieler ist dran.
      if (game.players[game.activeIndex].isHuman) presentRoll();
      else presentAiPhase();
    } else {
      // Ein Spieler wählt aus den Würfeln.
      if (game.players[game.currentChooserIndex()].isHuman) presentChooser();
      else presentAiPhase();
    }
  }

  // Rundenbeginn: der aktive (menschliche) Spieler würfelt auf Knopfdruck.
  function presentRoll() {
    pauseAuto = false;
    const active = game.players[game.activeIndex];
    setStatus(dom, `Wurf ${game.rollCount + 1} · Aktiv: ${active.name}`);
    setTurnInfo(dom, active);
    renderBoards(dom, game, { chooserIdx: game.activeIndex });
    renderScoreboard(dom, game);
    dom.actionBar.replaceChildren();
    dom.diceTray.replaceChildren();
    if (dom.commentary) dom.commentary.textContent = `${active.name} ist aktiv – zum Würfeln tippen.`;

    const btn = dom.rollBtn;
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.classList.add('ready');
    btn.disabled = false;
    btn.textContent = '🎲 Würfeln';
    btn.onclick = async () => {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      btn.classList.remove('ready');
      updateUndoButton();
      game.beginRound();
      announceRound(dom, `Wurf ${game.rollCount} · ${active.name} würfelt`);
      await animateRoll(dom, game, game.activeIndex);
      busy = false;
      present();
    };
  }

  // PvP/Notizblock: Markier-Turn vorbereiten (ohne neu zu würfeln) und ankreuzen
  // lassen. Der Würfeln-Button bleibt sichtbar (siehe presentChooser) und würfelt
  // die Referenzwürfel nur auf Knopfdruck neu - sie bleiben sonst stehen.
  function presentRelaxed() {
    if (game.isRoundComplete()) game.beginRelaxedTurn();
    presentChooser();
  }

  // PvP/Notizblock: Würfeln-Button verdrahten - würfelt NUR die Referenzwürfel neu
  // (animiert), ohne den laufenden Markier-Turn zu beenden.
  function setupRelaxedRoll(idx) {
    const btn = dom.rollBtn;
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.classList.add('ready');
    btn.disabled = false;
    btn.textContent = '🎲 Würfeln';
    btn.onclick = async () => {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      btn.classList.remove('ready');
      updateUndoButton();
      game.rollReference();
      announceRound(dom, `Wurf ${game.rollCount}`);
      await animateRoll(dom, game, idx);
      pendingSnapshot = game.snapshot();
      busy = false;
      btn.disabled = false;
      btn.classList.add('ready');
      updateUndoButton();
    };
  }

  // Ein menschlicher Spieler ist am Zug (interaktiv).
  function presentChooser() {
    pauseAuto = false;
    const idx = game.currentChooserIndex();
    const player = game.players[idx];
    setStatus(dom, `${player.name} ist am Zug`);
    setTurnInfo(dom, player, game.relaxed);
    renderBoards(dom, game, { chooserIdx: idx });
    renderScoreboard(dom, game);
    // PvP: Würfeln-Button anbieten (Referenzwürfel neu würfeln). Sonst ausblenden.
    if (game.relaxed) setupRelaxedRoll(idx);
    else if (dom.rollBtn) { dom.rollBtn.classList.add('hidden'); dom.rollBtn.onclick = null; }

    // Zustand merken, zu dem die Zurück-Taste diesen Zug zurücknimmt.
    pendingSnapshot = game.snapshot();
    updateUndoButton();

    renderDiceStatic(dom, game, idx);
    const control = {};
    currentControl = control;
    humanTurn(game, idx, dom, (o) => renderBoards(dom, game, o), control).then((res) => {
      if (res.action === 'abort') return; // durch Zurück/Beenden abgebrochen
      currentControl = null;
      applyHumanResult(idx, player, res);
    });
  }

  function applyHumanResult(idx, player, res) {
    if (res.action === 'pass') {
      game.submitPass(idx);
      announce(dom, res.timedOut ? `${player.name}: Zeit abgelaufen – gepasst.` : `${player.name} passt.`);
    } else if (game.relaxed) {
      game.submitMarks(idx, res.choice.cells);
      playMark();
      announce(dom, `${player.name}: ${res.choice.cells.length} Feld(er) angekreuzt.`);
    } else {
      game.submitChoice(idx, res.choice);
      playMark();
      announce(dom, `${player.name}: ${describeMove(res.choice)}`);
    }
    history.push(pendingSnapshot);
    advance();
  }

  // KI-Phase: alle DIREKT aufeinanderfolgenden KI-Schritte (Würfeln + Wählen,
  // auch über mehrere Runden) gehören zusammen. Statt jeden Schritt einzeln
  // anzustoßen, gibt es EINEN Knopf "▶ KI laufen lassen"; danach läuft die ganze
  // Phase automatisch (sichtbar animiert) ab, bis wieder ein Mensch dran ist.
  // Mit aktivem Auto-Häkchen (game.aiAuto) entfällt auch dieser eine Klick.
  function presentAiPhase() {
    const idx = game.isRoundComplete() ? game.activeIndex : game.currentChooserIndex();
    const player = game.players[idx];
    setStatus(dom, `${player.name} (KI) ist dran`);
    setTurnInfo(dom, player);
    renderBoards(dom, game, { chooserIdx: idx });
    renderScoreboard(dom, game);
    if (dom.rollBtn) { dom.rollBtn.classList.add('hidden'); dom.rollBtn.onclick = null; }
    // Würfel zeigen, sofern die Runde schon läuft (gewürfelt wurde).
    if (game.isRoundComplete()) dom.diceTray.replaceChildren();
    else renderDiceStatic(dom, game, idx);
    updateUndoButton();

    // Auto-Modus: ohne Bestätigen direkt loslaufen - außer direkt nach "Zurück".
    if (game.aiAuto && !pauseAuto) { runAiPhase(); return; }

    dom.actionBar.replaceChildren();
    if (dom.commentary) dom.commentary.textContent = `${player.name} (KI) ist dran – zum Starten tippen.`;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '▶ KI laufen lassen';
    btn.addEventListener('click', () => runAiPhase());
    dom.actionBar.append(btn);
  }

  // Führt die komplette KI-Phase animiert aus: würfeln und/oder wählen, so lange
  // eine KI an der Reihe ist. Sobald ein Mensch dran ist oder das Spiel endet,
  // wird angehalten und an present() zurückgegeben.
  async function runAiPhase() {
    if (busy) return;
    busy = true;
    pauseAuto = false;
    dom.actionBar.replaceChildren();
    if (dom.rollBtn) { dom.rollBtn.classList.add('hidden'); dom.rollBtn.onclick = null; }
    updateUndoButton();

    while (true) {
      // Spielende (regulär oder Solo nach 30 Würfen) -> Phase beenden.
      if (game.finished ||
          (game.soloMode && game.rollCount >= SOLO_MAX_ROLLS && game.isRoundComplete())) {
        break;
      }
      if (game.isRoundComplete()) {
        // Es muss gewürfelt werden. Ist der aktive Spieler ein Mensch -> anhalten.
        const active = game.players[game.activeIndex];
        if (active.isHuman) break;
        await aiRoll(active);
      } else {
        const idx = game.currentChooserIndex();
        const player = game.players[idx];
        if (player.isHuman) break;
        await aiChoose(idx, player);
        // Letzter Spieler der Runde war eine KI -> Runde auswerten.
        if (game.isRoundComplete()) {
          const log = game.resolveRound();
          showRoundLog(dom, log);
          renderScoreboard(dom, game);
        }
      }
    }

    busy = false;
    present();
  }

  // Ein KI-Wurf: würfeln (beginRound) + Animation.
  async function aiRoll(active) {
    const spd = game.aiSpeed || 1;
    game.beginRound();
    announceRound(dom, `Wurf ${game.rollCount} · ${active.name} (KI) würfelt`);
    setStatus(dom, `${active.name} (KI) würfelt …`);
    await animateRoll(dom, game, game.activeIndex);
    await delay(300 * spd);
  }

  // Eine KI-Auswahl: Felder einzeln auswählen (wie ein Mensch), dann gemeinsam
  // ankreuzen. Legt vorher einen Schnappschuss für die Zurück-Taste ab.
  async function aiChoose(idx, player) {
    const spd = game.aiSpeed || 1;
    pendingSnapshot = game.snapshot();
    renderBoards(dom, game, { chooserIdx: idx });
    renderDiceStatic(dom, game, idx);
    setStatus(dom, `${player.name} (KI) überlegt …`);
    if (dom.commentary) dom.commentary.textContent = `${player.name} (KI) überlegt …`;
    await delay(700 * spd);

    const move = chooseMove(player.sheet, game.availablePool(idx), game.aiDifficulty);
    if (!move) {
      game.submitPass(idx);
      announce(dom, `${player.name} (KI) passt.`);
      await delay(500 * spd);
      history.push(pendingSnapshot);
      renderScoreboard(dom, game);
      return;
    }

    setStatus(dom, `${player.name} (KI) kreuzt an: ${describeMove(move)}`);
    const selected = new Set();
    for (const [r, c] of move.cells) {
      selected.add(`${r},${c}`);
      renderBoards(dom, game, { chooserIdx: idx, focusIdx: idx, selected: new Set(selected) });
      await delay(450 * spd);
    }
    await delay(400 * spd);

    game.submitChoice(idx, {
      colorId: move.colorId,
      numberId: move.numberId,
      color: move.color,
      count: move.count,
      cells: move.cells,
    });
    playMark();
    announce(dom, `${player.name} (KI): ${describeMove(move)}`);
    const highlight = new Set(move.cells.map(([r, c]) => `${r},${c}`));
    renderBoards(dom, game, { chooserIdx: idx, focusIdx: idx, highlight });
    await delay(700 * spd);
    history.push(pendingSnapshot);
    renderScoreboard(dom, game);
  }

  // Nach einem Mensch-Zug weiterschalten: nächster Chooser oder Runde auswerten.
  function advance() {
    renderScoreboard(dom, game);
    if (!game.isRoundComplete()) { present(); return; }
    const log = game.resolveRound();
    showRoundLog(dom, log);
    renderScoreboard(dom, game);
    present();
  }

  function finishGame() {
    currentControl = null;
    if (dom.undoBtn) dom.undoBtn.classList.add('hidden');
    if (dom.rollBtn) { dom.rollBtn.classList.add('hidden'); dom.rollBtn.onclick = null; }
    showEnd(dom, game, game.soloMode);
  }

  present();
}

// ---------------------------------------------------------------------------
// Rendering-Helfer
// ---------------------------------------------------------------------------
function setStatus(dom, text) {
  dom.statusBar.textContent = text;
}
// Header-Chip: kompakter Punktestand des aktuell Waehlenden (kein "am Zug"-Text
// mehr - wer dran ist, zeigt der hervorgehobene Block). Im PvP/Notizblock gibt es
// nur einen Block -> Name weglassen, nur die Punkte ("… P.") zeigen.
function setTurnInfo(dom, player, relaxed = false) {
  dom.turnInfo.textContent = relaxed
    ? `${player.sheet.computeScore().total} P.`
    : `${player.name}: ${player.sheet.computeScore().total} P.`;
}

// Rendert ALLE Spieler-Bloecke gleichzeitig, jeden in einer eigenen Karte.
// opts: { chooserIdx, focusIdx, interactive, highlight:Set, selected:Set, onCellClick }
//   chooserIdx  - Block des gerade Waehlenden hervorheben ("am Zug")
//   focusIdx    - Block, der highlight/selected/onCellClick erhaelt
//   interactive - ist der focus-Block anklickbar (nur Mensch am Zug)
function renderBoards(dom, game, opts = {}) {
  const {
    chooserIdx = null,
    focusIdx = null,
    interactive = false,
    highlight = new Set(),
    selected = new Set(),
    onCellClick = null,
    onColumnClick = null,
    onColorClick = null,
    onJokerClick = null,
  } = opts;

  dom.boardContainer.replaceChildren();
  for (const p of game.players) {
    const card = document.createElement('div');
    card.className = 'player-board';
    if (p.id === chooserIdx) card.classList.add('active');

    // Block-Kopf (Name + Punkte) - im Hoch-/Desktop-Format. "am Zug" entfaellt: wer
    // dran ist, zeigt jetzt die Rahmenfarbe (aktiv orange, inaktiv gelb). Im Querformat
    // ist der Kopf ausgeblendet; dort stehen Punkte + Name neben dem Joker (siehe CSS).
    const head = document.createElement('div');
    head.className = 'pb-head';
    const score = p.sheet.computeScore();
    head.innerHTML =
      `<span class="pb-name">${escapeHtml(p.name)}${p.isHuman ? '' : ' (KI)'}</span>` +
      `<span class="pb-score">${score.total} P.</span>`;
    card.appendChild(head);

    // Name nur im KI-/Solo-Modus ins Sheet durchreichen (Querformat: Name unter den
    // Punkten neben dem Joker). Im PvP/Notizblock gibt es nur EINEN Block -> kein Name.
    const ident = game.relaxed ? {} : { playerName: `${p.name}${p.isHuman ? '' : ' (KI)'}` };
    const sheetOptions = p.id === focusIdx
      ? { ...ident, interactive, highlight, selected, onCellClick, onColumnClick, onColorClick, onJokerClick }
      : ident;
    card.appendChild(renderSheet(p.sheet, sheetOptions));
    dom.boardContainer.appendChild(card);
  }
}

// Kurze Wuerfelanimation: einige Frames mit zufaelligen Augen, dann die echten
// (bereits in beginRound gewuerfelten) Wuerfel.
async function animateRoll(dom, game, chooserIdx) {
  playRoll();
  for (let i = 0; i < 7; i++) {
    renderDiceRolling(dom, game);
    await delay(80);
  }
  renderDiceStatic(dom, game, chooserIdx);
}
function randFace(faces) {
  return faces[Math.floor(Math.random() * faces.length)];
}
function renderDiceRolling(dom, game) {
  dom.diceTray.replaceChildren();
  const cg = document.createElement('div');
  cg.className = 'dice-group';
  cg.append(diceLabel('Farbwürfel'));
  for (const die of game.dice.colorDice) {
    const el = staticColorDie({ id: die.id, face: randFace(COLOR_DIE_FACES) }, true);
    el.classList.add('rolling');
    cg.append(el);
  }
  const ng = document.createElement('div');
  ng.className = 'dice-group';
  ng.append(diceLabel('Zahlenwürfel'));
  for (const die of game.dice.numberDice) {
    const el = staticNumberDie({ id: die.id, face: randFace(NUMBER_DIE_FACES) }, true);
    el.classList.add('rolling');
    ng.append(el);
  }
  dom.diceTray.append(cg, ng);
}

function renderDiceStatic(dom, game, chooserIdx) {
  const pool = game.availablePool(chooserIdx);
  const poolColorIds = new Set(pool.colorDice.map((d) => d.id));
  const poolNumberIds = new Set(pool.numberDice.map((d) => d.id));
  dom.diceTray.replaceChildren();

  const cg = document.createElement('div');
  cg.className = 'dice-group';
  cg.append(diceLabel('Farbwürfel'));
  for (const die of game.dice.colorDice) cg.append(staticColorDie(die, poolColorIds.has(die.id)));
  const ng = document.createElement('div');
  ng.className = 'dice-group';
  ng.append(diceLabel('Zahlenwürfel'));
  for (const die of game.dice.numberDice) ng.append(staticNumberDie(die, poolNumberIds.has(die.id)));
  dom.diceTray.append(cg, ng);
}
function diceLabel(t) {
  const s = document.createElement('span');
  s.className = 'dice-label';
  s.textContent = t;
  return s;
}
function staticColorDie(die, usable) {
  const d = document.createElement('div');
  d.className = 'die color-die';
  if (die.face === JOKER) {
    d.classList.add('joker');
    d.textContent = '✻';
  } else {
    d.style.background = COLOR_HEX[die.face];
  }
  if (!usable) d.classList.add('disabled');
  return d;
}
function staticNumberDie(die, usable) {
  const d = document.createElement('div');
  d.className = 'die number-die';
  d.textContent = die.face === JOKER ? '?' : die.face;
  if (die.face === JOKER) d.classList.add('joker');
  if (!usable) d.classList.add('disabled');
  return d;
}

function renderScoreboard(dom, game) {
  dom.scoreboard.replaceChildren();
  for (const p of game.players) {
    const s = p.sheet.computeScore();
    const row = document.createElement('div');
    row.className = 'score-row';
    if (p.id === game.activeIndex) row.classList.add('active');
    const colors = p.sheet.completedColorCount();
    row.innerHTML = `
      <span class="sr-name">${escapeHtml(p.name)}${p.isHuman ? '' : ' (KI)'}</span>
      <span class="sr-total">${s.total} P.</span>
      <span class="sr-meta">${colors} Farbe(n) · ${s.jokersRemaining} Joker</span>
    `;
    dom.scoreboard.append(row);
  }
}

function describeMove(move) {
  return `${COLOR_LABEL[move.color]} ×${move.count}`;
}

function announce(dom, text) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = text;
  dom.log.prepend(line);
  // Letzte Ansage zusaetzlich in die Kommentar-Box (im Querformat sichtbar).
  if (dom.commentary) dom.commentary.textContent = text;
}

// Abschnitts-Trenner je Wurf - macht den Spielverlauf im Log nachvollziehbar.
function announceRound(dom, text) {
  const line = document.createElement('div');
  line.className = 'log-line log-round';
  line.textContent = `▶ ${text}`;
  dom.log.prepend(line);
}

function showRoundLog(dom, log) {
  for (const ev of log) {
    if (ev.type === 'column') {
      announce(dom, `🏆 Spalte ${COLUMN_LETTERS[ev.col]} zuerst voll: ${ev.players.join(', ')} (+${ev.value})`);
    } else if (ev.type === 'column-late') {
      announce(dom, `Spalte ${COLUMN_LETTERS[ev.col]} voll: ${ev.players.join(', ')} (+${ev.value})`);
    } else if (ev.type === 'color') {
      announce(dom, `🎨 Farbe ${COLOR_LABEL[ev.color]} komplett: ${ev.players.join(', ')} (+${ev.value})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Endbildschirm
// ---------------------------------------------------------------------------
const SOLO_LEVELS = [
  [41, Infinity, 'Es gibt also doch Superhelden!'],
  [37, 40, 'Wirst du „Glückspilz" oder „The Brain" genannt?'],
  [33, 36, 'Du könntest auch professioneller „NOCH MAL!"-Spieler sein.'],
  [29, 32, 'Super! Welch grandioses Ergebnis!'],
  [25, 28, 'Hoffentlich ohne Schummeln geschafft!'],
  [21, 24, 'Klasse! Das lief ja gut.'],
  [17, 20, 'Das war wohl nicht dein erstes Mal…'],
  [13, 16, 'Gut, aber das geht noch besser.'],
  [9, 12, 'Na, wird doch langsam.'],
  [5, 8, 'Nicht ganz schlecht.'],
  [1, 4, 'Da muss wohl noch etwas geübt werden.'],
  [0, 0, 'Dabei sein ist alles.'],
  [-Infinity, -1, 'Das grenzt ja schon an Arbeitsverweigerung.'],
];
function soloLevel(score) {
  for (const [lo, hi, text] of SOLO_LEVELS) {
    if (score >= lo && score <= hi) return text;
  }
  return '';
}

function showEnd(dom, game, solo = false) {
  const rows = game.finalScores();

  // Spiel-Bildschirm bleibt sichtbar: Endwertung erscheint ueber den Bloecken,
  // die ihren Endstand weiter anzeigen.
  setStatus(dom, 'Spiel beendet');
  playEnd();
  dom.turnInfo.textContent = '';
  if (dom.moveTimer) { dom.moveTimer.classList.add('hidden'); dom.moveTimer.textContent = ''; }
  dom.diceTray.replaceChildren();
  dom.actionBar.replaceChildren();
  dom.message.textContent = '';
  renderBoards(dom, game, {});
  renderScoreboard(dom, game);

  // Ergebnisse in die Bestenliste schreiben.
  const now = Date.now();
  recordResults(rows.map((r) => ({
    name: r.player.name,
    score: r.total,
    solo,
    notepad: !!game.relaxed,
    difficulty: game.aiDifficulty,
    isHuman: r.player.isHuman,
    date: now,
  })));

  const panel = dom.endPanel;
  panel.replaceChildren();

  const head = document.createElement('p');
  head.className = 'winner-line';
  // Bei einem einzelnen Block (Solo oder PvP/Notizblock auf dem eigenen Handy) gibt
  // es keinen Sieger-Vergleich - nur den eigenen Endstand zeigen.
  if (solo || rows.length === 1) {
    head.textContent = `Endstand: ${rows[0].total} Punkte`;
  } else {
    const winners = rows.filter((r) => r.isWinner).map((r) => r.player.name);
    head.textContent = winners.length === 1 ? `🏆 Sieger: ${winners[0]}!` : `Gleichstand: ${winners.join(', ')}`;
  }
  panel.append(head);

  const table = document.createElement('table');
  table.className = 'end-table';
  table.innerHTML = `
    <thead><tr>
      <th>Spieler</th><th>Bonus</th><th>Spalten</th><th>+Joker</th><th>−Sterne</th><th>TOTAL</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.isWinner) tr.classList.add('winner');
    tr.innerHTML = `
      <td>${escapeHtml(r.player.name)}${r.player.isHuman ? '' : ' (KI)'}${r.isWinner ? ' 🏆' : ''}</td>
      <td>${r.bonus}</td>
      <td>${r.columns}</td>
      <td>+${r.jokerBonus}</td>
      <td>−${r.starPenalty}</td>
      <td><strong>${r.total}</strong></td>`;
    tbody.append(tr);
  }
  table.append(tbody);
  panel.append(table);

  if (solo) {
    const lvl = document.createElement('p');
    lvl.className = 'solo-level';
    lvl.textContent = `Dein Level: ${soloLevel(rows[0].total)}`;
    panel.append(lvl);
  }

  const btn = document.createElement('button');
  btn.className = 'primary big';
  btn.textContent = 'Neues Spiel';
  btn.addEventListener('click', () => dom.backToSetup());
  panel.append(btn);

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
