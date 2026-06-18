// ============================================================================
// main.js
// Bootstrap: Setup-Bildschirm, Spielerkonfiguration, Spielstart.
// ============================================================================

import { Game } from './core/game.js';
import { runGame } from './ui/flow.js';
import { validateBoard } from './data/board.js';
import { getScores, clearScores, removeScoreAt, loadSettings, saveSettings, loadPrefs, savePrefs } from './ui/storage.js';
import { setMuted } from './ui/sound.js';

// Spielplan beim Laden validieren (wirft bei Inkonsistenzen).
validateBoard();

const $ = (id) => document.getElementById(id);

// Versionsanzeige - hilft zu erkennen, ob die aktuelle (ungecachte) Version laeuft.
const VERSION = '2026-06-18 · Bestenliste bearbeitbar';
const buildBadge = $('build-badge');
if (buildBadge) buildBadge.textContent = `Stand: ${VERSION}`;

const playerCountSel = $('player-count');
const slotsContainer = $('player-slots');
const startBtn = $('start-btn');

// Slot-Zustand bleibt erhalten, wenn die Anzahl wechselt.
const slots = [];
function defaultSlot(i) {
  return { name: i === 0 ? 'Du' : `KI ${i}`, isHuman: i === 0 };
}
for (let i = 0; i < 6; i++) slots.push(defaultSlot(i));

// Zuletzt verwendete Einstellungen wiederherstellen (Namen, Anzahl, KI, Timer).
const saved = loadSettings();
if (saved) {
  if (Array.isArray(saved.slots)) {
    saved.slots.forEach((s, i) => {
      if (i < slots.length && s) slots[i] = { name: s.name ?? slots[i].name, isHuman: !!s.isHuman };
    });
  }
  if (saved.count) playerCountSel.value = String(saved.count);
  if (saved.difficulty) $('ai-difficulty').value = saved.difficulty;
  if (saved.aiSpeed) $('ai-speed').value = String(saved.aiSpeed);
  if (saved.timerOn) $('timer-on').checked = true;
  if (saved.timerSeconds) $('timer-seconds').value = String(saved.timerSeconds);
}

// --- Hell/Dunkel-Theme und Ton (global, sofort gespeichert) ----------------
const prefs = loadPrefs();
const themeBtn = $('theme-toggle');
const muteBtn = $('mute-toggle');
function applyTheme(light) {
  document.body.classList.toggle('light', light);
  themeBtn.textContent = light ? '☀️' : '🌙';
}
function applyMute(muted) {
  setMuted(muted);
  muteBtn.textContent = muted ? '🔇' : '🔊';
}
applyTheme(prefs.theme === 'light');
applyMute(!!prefs.muted);
themeBtn.addEventListener('click', () => {
  const light = !document.body.classList.contains('light');
  applyTheme(light);
  savePrefs({ theme: light ? 'light' : 'dark' });
});
muteBtn.addEventListener('click', () => {
  const muted = muteBtn.textContent === '🔊';
  applyMute(muted);
  savePrefs({ muted });
});

function renderSlots() {
  const count = parseInt(playerCountSel.value, 10);
  slotsContainer.replaceChildren();
  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    const row = document.createElement('div');
    row.className = 'slot-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.value = slot.name;
    name.className = 'slot-name';
    name.addEventListener('input', () => { slot.name = name.value; });

    const toggle = document.createElement('div');
    toggle.className = 'toggle';
    const human = document.createElement('button');
    human.textContent = 'Mensch';
    const ai = document.createElement('button');
    ai.textContent = 'KI';
    const refresh = () => {
      human.classList.toggle('active', slot.isHuman);
      ai.classList.toggle('active', !slot.isHuman);
    };
    human.addEventListener('click', () => { slot.isHuman = true; refresh(); });
    ai.addEventListener('click', () => { slot.isHuman = false; refresh(); });
    refresh();
    toggle.append(human, ai);

    row.append(name, toggle);
    slotsContainer.append(row);
  }
}

playerCountSel.addEventListener('change', renderSlots);
renderSlots();

// --- Bestenliste -----------------------------------------------------------
const DIFF_LABEL = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
let editScores = false;

function renderLeaderboard() {
  const box = $('leaderboard');
  const scores = getScores();
  box.replaceChildren();
  $('edit-scores').classList.toggle('active', editScores);

  if (!scores.length) {
    editScores = false;
    $('edit-scores').classList.remove('active');
    const p = document.createElement('p');
    p.className = 'lb-empty';
    p.textContent = 'Noch keine Ergebnisse – spiel eine Partie!';
    box.append(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'lb-table';
  const head = '<th>#</th><th>Spieler</th><th>Punkte</th><th>Modus</th><th>Datum</th>' +
    (editScores ? '<th></th>' : '');
  table.innerHTML = `<thead><tr>${head}</tr></thead>`;
  const tbody = document.createElement('tbody');
  scores.slice(0, 10).forEach((e, i) => {
    const tr = document.createElement('tr');
    const mode = e.solo ? 'Solo' : (DIFF_LABEL[e.difficulty] || '–');
    const date = new Date(e.date).toLocaleDateString('de-DE');
    tr.innerHTML =
      `<td>${i + 1}</td>` +
      `<td>${escapeHtml(e.name)}${e.isHuman ? '' : ' (KI)'}</td>` +
      `<td><strong>${e.score}</strong></td>` +
      `<td>${mode}</td><td>${date}</td>`;
    if (editScores) {
      const td = document.createElement('td');
      const del = document.createElement('button');
      del.className = 'lb-del';
      del.textContent = '✕';
      del.title = 'Diesen Eintrag entfernen';
      del.addEventListener('click', () => { removeScoreAt(i); renderLeaderboard(); });
      td.append(del);
      tr.append(td);
    }
    tbody.append(tr);
  });
  table.append(tbody);
  box.append(table);

  if (editScores) {
    const tools = document.createElement('div');
    tools.className = 'lb-tools';
    const clearAll = document.createElement('button');
    clearAll.className = 'link-btn';
    clearAll.textContent = 'Alle löschen';
    clearAll.addEventListener('click', () => { clearScores(); renderLeaderboard(); });
    tools.append(clearAll);
    box.append(tools);
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
$('edit-scores').addEventListener('click', () => { editScores = !editScores; renderLeaderboard(); });
renderLeaderboard();

function backToSetup() {
  $('end-panel').classList.add('hidden');
  $('game-screen').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
  renderLeaderboard();
}

const dom = {
  statusBar: $('status-bar'),
  turnInfo: $('turn-info'),
  moveTimer: $('move-timer'),
  diceTray: $('dice-tray'),
  actionBar: $('action-bar'),
  boardContainer: $('board-container'),
  message: $('message'),
  scoreboard: $('scoreboard'),
  log: $('log'),
  gameScreen: $('game-screen'),
  endPanel: $('end-panel'),
  backToSetup,
};

startBtn.addEventListener('click', () => {
  const count = parseInt(playerCountSel.value, 10);
  const configs = slots.slice(0, count).map((s, i) => ({
    name: (s.name || '').trim() || `Spieler ${i + 1}`,
    isHuman: s.isHuman,
  }));
  const soloMode = count === 1;
  const aiDifficulty = $('ai-difficulty').value;
  const aiSpeed = parseFloat($('ai-speed').value) || 1;
  const timerOn = $('timer-on').checked;
  const timerSeconds = Math.max(5, parseInt($('timer-seconds').value, 10) || 30);
  const moveTimer = timerOn ? timerSeconds : 0;

  // Einstellungen für das nächste Mal merken.
  saveSettings({
    count,
    difficulty: aiDifficulty,
    aiSpeed,
    timerOn,
    timerSeconds,
    slots: slots.slice(0, count).map((s) => ({ name: s.name, isHuman: s.isHuman })),
  });

  const game = new Game(configs, { soloMode, aiDifficulty, moveTimer, aiSpeed });

  $('setup-screen').classList.add('hidden');
  dom.endPanel.classList.add('hidden');
  dom.gameScreen.classList.remove('hidden');
  dom.log.replaceChildren();

  runGame(game, dom);
});
