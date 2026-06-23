// ============================================================================
// main.js
// Bootstrap: Setup-Bildschirm, Spielerkonfiguration, Spielstart.
// ============================================================================

import { Game } from './core/game.js';
import { runGame } from './ui/flow.js';
import { validateBoard, BOARDS, setActiveBoard } from './data/board.js';
import { getScores, clearScores, removeScoreAt, loadSettings, saveSettings, loadPrefs, savePrefs, SCORES_KEY } from './ui/storage.js';
import { setMuted, playRoll } from './ui/sound.js';
import { escapeHtml } from './ui/util.js';

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
// Quelle ist version.js (window.APP_VERSION), damit die Version nur an EINER
// Stelle gepflegt werden muss (auch der Service-Worker-Cache leitet sich daraus ab).
const VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const buildBadge = $('build-badge');
if (buildBadge) buildBadge.textContent = `Version ${VERSION}`;

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

// Gewaehlter Spielblock (Brett). Default = erster Block der Registry.
let currentBoardId = BOARDS[0].id;

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
  if (saved.aiAuto) $('ai-auto').checked = true;
  if (saved.timerOn) $('timer-on').checked = true;
  if (saved.timerSeconds) $('timer-seconds').value = String(saved.timerSeconds);
  if (saved.jokerSix) $('rule-joker-six').checked = true;
  if (saved.passPenalty) $('rule-pass-penalty').checked = true;
  if (saved.starPenaltyHigh) $('rule-star-penalty').checked = true;
  if (saved.mode === 'b') currentMode = 'b';
  // Block-Auswahl nur uebernehmen, wenn die id noch in der Registry existiert.
  if (saved.boardId && BOARDS.some((b) => b.id === saved.boardId)) currentBoardId = saved.boardId;
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
$('edit-scores').addEventListener('click', () => { editScores = !editScores; renderLeaderboard(); });
renderLeaderboard();

// Würfel-Splash beim Öffnen der App (über dem Startbildschirm).
let lastSplashAt = 0; // Zeitpunkt des letzten Splashs (gegen Mehrfach-Abspielen)
playStartSplash();

// Bestenliste immer aktuell halten: Updates aus anderen Tabs/Fenstern sofort
// uebernehmen und beim Zurueckkehren in die App (PWA aus dem Hintergrund) neu rendern.
window.addEventListener('storage', (e) => {
  if (e.key === SCORES_KEY) renderLeaderboard();
});
window.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('setup-screen').classList.contains('hidden')) renderLeaderboard();
});

// Würfel-Splash beim Drehen ins Querformat: Da die App nur im Querformat spielbar ist
// (im Hochformat verdeckt #rotate-prompt alles), ist das Drehen Hoch->Quer am Handy der
// eigentliche "App öffnen"-Moment. Beim Wechsel auf Querformat den Splash zeigen – nur
// auf dem Startbildschirm; die Zeit-Sperre in playStartSplash verhindert Doppeln.
const landscapeMq = window.matchMedia('(orientation: landscape)');
landscapeMq.addEventListener('change', (e) => {
  if (e.matches && !$('setup-screen').classList.contains('hidden')) playStartSplash();
});
window.addEventListener('focus', () => {
  if (!$('setup-screen').classList.contains('hidden')) renderLeaderboard();
});

function backToSetup() {
  // Theme/Ton-Icons aus der Spiel-Kopfzeile zurück in den Body holen (dort wieder
  // oben rechts fixiert für den Startbildschirm).
  document.body.appendChild($('top-controls'));
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
  undoBtn: $('undo-btn'),
  boardContainer: $('board-container'),
  message: $('message'),
  commentary: $('commentary'),
  scoreboard: $('scoreboard'),
  log: $('log'),
  gameScreen: $('game-screen'),
  endPanel: $('end-panel'),
  backToSetup,
};

// "Spiel beenden": kleine Auswahl einblenden - WERTEN & beenden (Punktestand kommt in
// die Bestenliste, Endwertung wird gezeigt; wichtig im PvP, wenn ein Mitspieler schon
// fertig ist) ODER ohne Wertung beenden (Spielstand verwerfen, zurueck ins Menue).
$('end-game-btn').addEventListener('click', () => {
  $('end-choice').classList.remove('hidden');
});
$('end-cancel-btn').addEventListener('click', () => {
  $('end-choice').classList.add('hidden');
});
// Werten & beenden: runGame liefert dom.scoreAndEnd -> Endwertung + Bestenliste.
$('end-score-btn').addEventListener('click', () => {
  $('end-choice').classList.add('hidden');
  if (dom.scoreAndEnd) dom.scoreAndEnd();
});
// Ohne Wertung beenden: laufenden Zug abbrechen und zurueck ins Menue (kein Eintrag).
$('end-discard-btn').addEventListener('click', () => {
  $('end-choice').classList.add('hidden');
  if (dom.abortGame) dom.abortGame();
  backToSetup();
});

// Zusätzliche Regeln: Overlay-Menü öffnen/schließen.
$('extra-rules-btn').addEventListener('click', () => {
  $('rules-modal').classList.remove('hidden');
});
$('rules-done-btn').addEventListener('click', () => {
  $('rules-modal').classList.add('hidden');
});
// Klick auf den dunklen Hintergrund schließt das Menü ebenfalls.
$('rules-modal').addEventListener('click', (e) => {
  if (e.target.id === 'rules-modal') $('rules-modal').classList.add('hidden');
});

// Blockauswahl: Overlay-Menü mit der Liste aller Blöcke (Optik wie die Regeln).
const blockSelectBtn = $('block-select-btn');
function updateBlockButton() {
  const board = BOARDS.find((b) => b.id === currentBoardId) || BOARDS[0];
  blockSelectBtn.textContent = `🧩 Blockauswahl: ${board.name}`;
}
function renderBlockOptions() {
  const box = $('block-options');
  box.replaceChildren();
  BOARDS.forEach((board) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'block-option';
    opt.textContent = board.name;
    opt.classList.toggle('active', board.id === currentBoardId);
    opt.addEventListener('click', () => {
      currentBoardId = board.id;
      renderBlockOptions();
      updateBlockButton();
    });
    box.append(opt);
  });
}
updateBlockButton();
blockSelectBtn.addEventListener('click', () => {
  renderBlockOptions();
  $('block-modal').classList.remove('hidden');
});
$('block-done-btn').addEventListener('click', () => {
  $('block-modal').classList.add('hidden');
});
$('block-modal').addEventListener('click', (e) => {
  if (e.target.id === 'block-modal') $('block-modal').classList.add('hidden');
});

// Tutorial / Spielregeln (i-Symbol oben rechts) - reines Anzeigen, kein State
$('help-toggle').addEventListener('click', () => {
  $('help-modal').classList.remove('hidden');
});
$('help-done-btn').addEventListener('click', () => {
  $('help-modal').classList.add('hidden');
});
$('help-modal').addEventListener('click', (e) => {
  if (e.target.id === 'help-modal') $('help-modal').classList.add('hidden');
});

startBtn.addEventListener('click', () => {
  const notepad = currentMode === 'b';
  const aiDifficulty = $('ai-difficulty').value;
  const aiSpeed = parseFloat($('ai-speed').value) || 1;
  const aiAuto = $('ai-auto').checked;
  const timerOn = $('timer-on').checked;
  const timerSeconds = Math.max(5, parseInt($('timer-seconds').value, 10) || 30);
  // Zusatzregeln (Hausregeln) - gelten in beiden Modi.
  const jokerSix = $('rule-joker-six').checked;
  const passPenalty = $('rule-pass-penalty').checked;
  const starPenaltyHigh = $('rule-star-penalty').checked;

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

  // Gewähltes Brett aktiv setzen, BEVOR die Spielblätter erzeugt werden.
  setActiveBoard(currentBoardId);

  // Einstellungen für das nächste Mal merken.
  saveSettings({
    mode: currentMode,
    count: parseInt(playerCountSel.value, 10),
    difficulty: aiDifficulty,
    aiSpeed,
    aiAuto,
    timerOn,
    timerSeconds,
    jokerSix,
    passPenalty,
    starPenaltyHigh,
    boardId: currentBoardId,
    slots: slots.map((s) => ({ name: s.name, isHuman: s.isHuman })),
  });

  const game = new Game(configs, { soloMode, aiDifficulty, moveTimer, aiSpeed, relaxed, aiAuto, jokerSix, passPenalty, starPenaltyHigh });

  $('setup-screen').classList.add('hidden');
  dom.endPanel.classList.add('hidden');
  dom.gameScreen.classList.remove('hidden');
  // Theme/Ton-Icons in die Spiel-Kopfzeile verschieben: dort werden sie zu echten
  // Grid-Geschwistern von "Spiel beenden" und sitzen so zuverlässig in DERSELBEN
  // Reihe daneben (statt als frei schwebendes fixed-Element nur ungefähr passend).
  dom.gameScreen.querySelector('.game-header').appendChild($('top-controls'));
  dom.log.replaceChildren();

  runGame(game, dom);
  playBoardsIntro(); // Spielblöcke fliegen gestaffelt herein
});

// Würfel-Splash beim ÖFFNEN der App (rein dekorativ). Liegt per position:fixed über
// dem Startbildschirm und blendet nach der Animation weg.
function playStartSplash() {
  // Bewegungsempfindliche Nutzer: gar nicht einblenden, der Startbildschirm ist sofort da.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Im Hochformat (Touch) verdeckt #rotate-prompt alles – der Splash wäre unsichtbar.
  // Dann gar nicht abspielen und die Zeit-Sperre NICHT verbrauchen, damit der Splash
  // beim anschließenden Drehen ins Querformat wirklich erscheint.
  if (window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches) return;
  // Kurze Sperre: ein schnelles Weg-und-zurück (Hintergrund/Vordergrund) soll den
  // Splash nicht doppelt auslösen; ein normales Öffnen (>3 s Abstand) schon.
  const now = Date.now();
  if (now - lastSplashAt < 3000) return;
  lastSplashAt = now;
  const splash = $('start-splash');
  if (!splash) return;
  splash.classList.remove('hidden');
  // Reflow erzwingen, damit die CSS-Animationen bei erneutem Start neu anlaufen.
  void splash.offsetWidth;
  playRoll(); // kurzer Würfel-Sound (respektiert den Mute-Schalter automatisch)
  // Nach dem Weg-Blenden (splashOut endet ~1,3 s) wieder verstecken.
  setTimeout(() => splash.classList.add('hidden'), 1400);
}

// Animation beim SPIELSTART: die schon aufgebauten Spielblöcke fliegen gestaffelt von
// unten herein (CSS-Klasse .board-intro mit pro-Block ansteigender Verzögerung). Die
// Klasse wird beim nächsten renderBoards ohnehin entfernt (neu erzeugte Karten).
function playBoardsIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = dom.boardContainer.querySelectorAll('.player-board');
  cards.forEach((card, i) => {
    card.style.setProperty('--intro-i', i);
    card.classList.add('board-intro');
  });
  if (cards.length) playRoll(); // kurzer Würfel-Sound (respektiert Mute)
}
