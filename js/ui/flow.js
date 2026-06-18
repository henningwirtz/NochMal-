// ============================================================================
// ui/flow.js
// Orchestriert den Spielablauf: Runden, Reihenfolge aktiv/passiv, Mensch-Zuege
// (interaktiv) vs. KI-Zuege (automatisch), Ansagen und Endbildschirm.
// ============================================================================

import { renderSheet } from './boardView.js';
import { humanTurn } from './controls.js';
import { recordResults } from './storage.js';
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

export async function runGame(game, dom) {
  if (game.soloMode) return runSolo(game, dom);

  while (!game.finished) {
    game.beginRound();
    setStatus(dom, `Wurf ${game.rollCount} · Aktiver Spieler: ${game.activePlayer.name}`);
    announceRound(dom, `Wurf ${game.rollCount} · ${game.activePlayer.name} würfelt`);
    renderBoards(dom, game, { chooserIdx: game.activeIndex });
    await animateRoll(dom, game, game.activeIndex);

    while (!game.isRoundComplete()) {
      const idx = game.currentChooserIndex();
      const player = game.players[idx];
      const isActive = idx === game.activeIndex;
      setTurnInfo(dom, player, isActive);
      renderBoards(dom, game, { chooserIdx: idx });
      renderScoreboard(dom, game);

      if (player.isHuman) {
        renderDiceStatic(dom, game, idx); // wird von humanTurn ersetzt
        const res = await humanTurn(game, idx, dom, (o) => renderBoards(dom, game, o));
        if (res.action === 'pass') {
          game.submitPass(idx);
          announce(dom, res.timedOut ? `${player.name}: Zeit abgelaufen – gepasst.` : `${player.name} passt.`);
        } else {
          game.submitChoice(idx, res.choice);
          announce(dom, `${player.name}: ${describeMove(res.choice)}`);
        }
      } else {
        await aiTurn(game, idx, dom);
      }
      renderScoreboard(dom, game);
    }

    const log = game.resolveRound();
    showRoundLog(dom, log);
    renderScoreboard(dom, game);
    await delay(300);
  }

  showEnd(dom, game);
}

async function aiTurn(game, idx, dom) {
  const player = game.players[idx];
  setStatus(dom, `${player.name} (KI) überlegt …`);
  renderDiceStatic(dom, game, idx);
  await delay(1100);

  const move = chooseMove(player.sheet, game.availablePool(idx), game.aiDifficulty);
  if (!move) {
    game.submitPass(idx);
    announce(dom, `${player.name} (KI) passt.`);
    await delay(900);
    return;
  }

  // 1) Felder nacheinander auswählen - so wie ein Mensch sie einzeln anklickt.
  setStatus(dom, `${player.name} (KI) kreuzt an: ${describeMove(move)}`);
  const selected = new Set();
  for (const [r, c] of move.cells) {
    selected.add(`${r},${c}`);
    renderBoards(dom, game, { chooserIdx: idx, focusIdx: idx, selected: new Set(selected) });
    await delay(550);
  }
  await delay(550);

  // 2) Auswahl gemeinsam ankreuzen und kurz markiert stehen lassen.
  game.submitChoice(idx, {
    colorId: move.colorId,
    numberId: move.numberId,
    color: move.color,
    count: move.count,
    cells: move.cells,
  });
  announce(dom, `${player.name} (KI): ${describeMove(move)}`);
  const highlight = new Set(move.cells.map(([r, c]) => `${r},${c}`));
  renderBoards(dom, game, { chooserIdx: idx, focusIdx: idx, highlight });
  await delay(950);
  renderBoards(dom, game, { chooserIdx: idx });
}

// ---------------------------------------------------------------------------
// Solo-Variante: 2+2 Wuerfel, 30 Wuerfe, danach Wertung mit Level-Tabelle.
// ---------------------------------------------------------------------------
async function runSolo(game, dom) {
  const player = game.players[0];
  let rolls = 0;

  while (rolls < SOLO_MAX_ROLLS) {
    game.beginRound();
    rolls++;
    setStatus(dom, `Solo · Wurf ${rolls}/${SOLO_MAX_ROLLS}`);
    setTurnInfo(dom, player, true);
    renderBoards(dom, game, { chooserIdx: 0 });
    renderScoreboard(dom, game);
    await animateRoll(dom, game, 0);

    if (player.isHuman) {
      renderDiceStatic(dom, game, 0);
      const res = await humanTurn(game, 0, dom, (o) => renderBoards(dom, game, o));
      if (res.action === 'pass') {
        game.submitPass(0);
        announce(dom, res.timedOut ? `Wurf ${rolls}: Zeit abgelaufen – gepasst.` : `Wurf ${rolls}: gepasst.`);
      } else {
        game.submitChoice(0, res.choice);
        announce(dom, `Wurf ${rolls}: ${describeMove(res.choice)}`);
      }
    } else {
      await aiTurn(game, 0, dom);
    }

    const log = game.resolveRound();
    showRoundLog(dom, log);
    renderScoreboard(dom, game);
  }

  showEnd(dom, game, true);
}

// ---------------------------------------------------------------------------
// Rendering-Helfer
// ---------------------------------------------------------------------------
function setStatus(dom, text) {
  dom.statusBar.textContent = text;
}
function setTurnInfo(dom, player, isActive) {
  dom.turnInfo.textContent = `${player.name} ist am Zug${isActive ? ' (aktiv)' : ''}`;
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
  } = opts;

  dom.boardContainer.replaceChildren();
  for (const p of game.players) {
    const card = document.createElement('div');
    card.className = 'player-board';
    if (p.id === chooserIdx) card.classList.add('active');

    const head = document.createElement('div');
    head.className = 'pb-head';
    const score = p.sheet.computeScore();
    head.innerHTML =
      `<span class="pb-name">${p.name}${p.isHuman ? '' : ' (KI)'}</span>` +
      `<span class="pb-score">${score.total} P.</span>` +
      (p.id === chooserIdx ? '<span class="pb-turn">am Zug</span>' : '');
    card.appendChild(head);

    const sheetOptions = p.id === focusIdx
      ? { interactive, highlight, selected, onCellClick }
      : {};
    card.appendChild(renderSheet(p.sheet, sheetOptions));
    dom.boardContainer.appendChild(card);
  }
}

// Kurze Wuerfelanimation: einige Frames mit zufaelligen Augen, dann die echten
// (bereits in beginRound gewuerfelten) Wuerfel.
async function animateRoll(dom, game, chooserIdx) {
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
    const colors = Object.keys(p.sheet.colorAward).length;
    row.innerHTML = `
      <span class="sr-name">${p.name}${p.isHuman ? '' : ' (KI)'}</span>
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
    difficulty: game.aiDifficulty,
    isHuman: r.player.isHuman,
    date: now,
  })));

  const panel = dom.endPanel;
  panel.replaceChildren();

  const head = document.createElement('p');
  head.className = 'winner-line';
  if (solo) {
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
      <td>${r.player.name}${r.player.isHuman ? '' : ' (KI)'}${r.isWinner ? ' 🏆' : ''}</td>
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
