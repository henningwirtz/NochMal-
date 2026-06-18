// ============================================================================
// main.js
// Bootstrap: Setup-Bildschirm, Spielerkonfiguration, Spielstart.
// ============================================================================

import { Game } from './core/game.js';
import { runGame } from './ui/flow.js';
import { validateBoard } from './data/board.js';
import { getScores, clearScores, removeScoreAt, loadSettings, saveSettings, loadPrefs, savePrefs, SCORES_KEY } from './ui/storage.js';
import { setMuted } from './ui/sound.js';

// Spielplan beim Laden validieren (wirft bei Inkonsistenzen).
validateBoard();

// Service Worker registrieren (PWA: installierbar + offline). Nur über http(s),
// nicht über file:// - sonst schlägt die Registrierung fehl.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Funktion optional */ });
  });
}

const $ = (id) => document.getElementById(id);

// Versionsanzeige - hilft zu erkennen, ob die aktuelle (ungecachte) Version laeuft.
const VERSION = '2026-06-19 · Querformat: größerer Block + 2×3-Würfel, KI-Block scrollbar, PvP: eine Farbe/Zug';
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

// Spielmodus: 'a' = Gegen die KI (ein Gerät), 'b' = Digitaler Notizblock (eigenes Handy).
let currentMode = 'a';

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
  if (saved.mode === 'b') currentMode = 'b';
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
  // Im Notizblock-Modus gibt es nur einen Spieler (eigenes Handy) - nur ein
  // Namensfeld, kein Mensch/KI-Umschalter.
  const count = currentMode === 'b' ? 1 : parseInt(playerCountSel.value, 10);
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
    row.append(name);

    if (currentMode === 'a') {
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
      row.append(toggle);
    }

    slotsContainer.append(row);
  }
}

// Modus umschalten: Karten-Hervorhebung, KI-Felder ein-/ausblenden, Slots neu.
function applyMode(mode) {
  currentMode = mode === 'b' ? 'b' : 'a';
  document.body.classList.toggle('mode-notepad', currentMode === 'b');
  document.querySelectorAll('.mode-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.mode === currentMode);
  });
  renderSlots();
}

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => applyMode(card.dataset.mode));
});

playerCountSel.addEventListener('change', renderSlots);
applyMode(currentMode);

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
    const mode = e.notepad ? 'Notizblock' : (e.solo ? 'Solo' : (DIFF_LABEL[e.difficulty] || '–'));
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

// Bestenliste immer aktuell halten: Updates aus anderen Tabs/Fenstern sofort
// uebernehmen und beim Zurueckkehren in die App (PWA aus dem Hintergrund) neu rendern.
window.addEventListener('storage', (e) => {
  if (e.key === SCORES_KEY) renderLeaderboard();
});
window.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('setup-screen').classList.contains('hidden')) renderLeaderboard();
});
window.addEventListener('focus', () => {
  if (!$('setup-screen').classList.contains('hidden')) renderLeaderboard();
});

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
  rollBtn: $('roll-btn'),
  actionBar: $('action-bar'),
  boardContainer: $('board-container'),
  message: $('message'),
  commentary: $('commentary'),
  scoreboard: $('scoreboard'),
  log: $('log'),
  gameScreen: $('game-screen'),
  endPanel: $('end-panel'),
  backToSetup,
};

// "Spiel beenden": laufendes Spiel verwerfen und zurueck ins Menue. runGame setzt
// dom.abortGame, das die Spielschleife sauber stoppt (kein Eintrag in der Bestenliste).
$('end-game-btn').addEventListener('click', () => {
  if (confirm('Spiel wirklich beenden? Der aktuelle Spielstand geht verloren.')) {
    if (dom.abortGame) dom.abortGame();
    backToSetup();
  }
});

startBtn.addEventListener('click', () => {
  const notepad = currentMode === 'b';
  const aiDifficulty = $('ai-difficulty').value;
  const aiSpeed = parseFloat($('ai-speed').value) || 1;
  const timerOn = $('timer-on').checked;
  const timerSeconds = Math.max(5, parseInt($('timer-seconds').value, 10) || 30);

  let configs, count, soloMode, moveTimer, relaxed;
  if (notepad) {
    // Notizblock: genau ein Spieler, keine KI, lockere Validierung, kein Timer.
    count = 1;
    configs = [{ name: (slots[0].name || '').trim() || 'Du', isHuman: true }];
    soloMode = false;
    moveTimer = 0;
    relaxed = true;
  } else {
    count = parseInt(playerCountSel.value, 10);
    configs = slots.slice(0, count).map((s, i) => ({
      name: (s.name || '').trim() || `Spieler ${i + 1}`,
      isHuman: s.isHuman,
    }));
    soloMode = count === 1;
    moveTimer = timerOn ? timerSeconds : 0;
    relaxed = false;
  }

  // Einstellungen für das nächste Mal merken.
  saveSettings({
    mode: currentMode,
    count: parseInt(playerCountSel.value, 10),
    difficulty: aiDifficulty,
    aiSpeed,
    timerOn,
    timerSeconds,
    slots: slots.map((s) => ({ name: s.name, isHuman: s.isHuman })),
  });

  const game = new Game(configs, { soloMode, aiDifficulty, moveTimer, aiSpeed, relaxed });

  $('setup-screen').classList.add('hidden');
  dom.endPanel.classList.add('hidden');
  dom.gameScreen.classList.remove('hidden');
  dom.log.replaceChildren();

  runGame(game, dom);
});
