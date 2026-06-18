// ============================================================================
// main.js
// Bootstrap: Setup-Bildschirm, Spielerkonfiguration, Spielstart.
// ============================================================================

import { Game } from './core/game.js';
import { runGame } from './ui/flow.js';
import { validateBoard } from './data/board.js';

// Spielplan beim Laden validieren (wirft bei Inkonsistenzen).
validateBoard();

const $ = (id) => document.getElementById(id);

const playerCountSel = $('player-count');
const slotsContainer = $('player-slots');
const startBtn = $('start-btn');

// Slot-Zustand bleibt erhalten, wenn die Anzahl wechselt.
const slots = [];
function defaultSlot(i) {
  return { name: i === 0 ? 'Du' : `KI ${i}`, isHuman: i === 0 };
}
for (let i = 0; i < 6; i++) slots.push(defaultSlot(i));

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

function backToSetup() {
  $('end-panel').classList.add('hidden');
  $('game-screen').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
}

const dom = {
  statusBar: $('status-bar'),
  turnInfo: $('turn-info'),
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

  const game = new Game(configs, { soloMode });

  $('setup-screen').classList.add('hidden');
  dom.endPanel.classList.add('hidden');
  dom.gameScreen.classList.remove('hidden');
  dom.log.replaceChildren();

  runGame(game, dom);
});
