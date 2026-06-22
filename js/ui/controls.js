// ============================================================================
// ui/controls.js
// Interaktiver Zug eines menschlichen Spielers: Wuerfelauswahl (inkl. Joker),
// gefuehrte Feldauswahl und Bestaetigen/Passen.
// ============================================================================

import { COLOR_ORDER, COLOR_HEX, COLOR_LABEL, JOKER, GRID_ROWS, GRID_COLS } from '../core/constants.js';
import { legalPlacements, isRelaxedPlacement } from '../core/rules.js';
import { GRID } from '../data/board.js';

const key = (r, c) => `${r},${c}`;
const sameSet = (cells, set) => cells.length === set.size && cells.every(([r, c]) => set.has(key(r, c)));

// Fuehrt den Zug eines Menschen aus. Loest auf, wenn bestaetigt/gepasst wurde.
// dom: { diceTray, actionBar, boardContainer, message }
// renderBoards(opts): zeichnet ALLE Spieler-Bloecke; nur der eigene ist interaktiv.
export function humanTurn(game, playerIndex, dom, renderBoards, control = {}) {
  return new Promise((resolve) => {
    const player = game.players[playerIndex];
    const sheet = player.sheet;
    const pool = game.availablePool(playerIndex);
    const poolColorIds = new Set(pool.colorDice.map((d) => d.id));
    const poolNumberIds = new Set(pool.numberDice.map((d) => d.id));
    // Notizblock-Obergrenze pro Zug: normal 5, mit Hausregel "Joker als 6" auch 6.
    const relaxedMax = game.jokerSix ? 6 : 5;

    const state = {
      colorId: null,
      numberId: null,
      selected: [], // [[r,c],...]
    };

    const colorDieById = (id) => game.dice.colorDice.find((d) => d.id === id);
    const numberDieById = (id) => game.dice.numberDice.find((d) => d.id === id);

    // Bei einem Joker gibt es KEINE Extra-Auswahl mehr: Farbe und Anzahl ergeben sich
    // direkt aus den angekreuzten Feldern (Farbe = Farbe des ersten Feldes,
    // Anzahl = Zahl der gewaehlten Felder).
    function effColor() {
      if (!state.colorId) return null;
      const die = colorDieById(state.colorId);
      if (die.face !== JOKER) return die.face;
      if (state.selected.length === 0) return null;
      const [r, c] = state.selected[0];
      return GRID[r][c];
    }
    function effCount() {
      if (!state.numberId) return null;
      const die = numberDieById(state.numberId);
      if (die.face !== JOKER) return die.face;
      return state.selected.length || null;
    }

    // Alle legalen Platzierungen fuer die aktuelle Wuerfelwahl. Bei einem Joker werden
    // alle moeglichen Farben bzw. Laengen (1..5) zusammengefasst - welche es konkret
    // wird, entscheidet sich erst durch die tatsaechlich angekreuzten Felder.
    function currentPlacements() {
      const colorDie = state.colorId ? colorDieById(state.colorId) : null;
      const numberDie = state.numberId ? numberDieById(state.numberId) : null;
      if (!colorDie || !numberDie) return [];
      const colors = colorDie.face === JOKER ? COLOR_ORDER : [colorDie.face];
      // Zahlenjoker: 1..5, mit Hausregel "Joker als 6" zusaetzlich 6.
      const jokerCounts = game.jokerSix ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      const counts = numberDie.face === JOKER ? jokerCounts : [numberDie.face];
      const all = [];
      for (const color of colors) {
        for (const count of counts) {
          for (const p of legalPlacements(sheet, color, count)) all.push(p);
        }
      }
      return all;
    }

    function consistentPlacements(placements) {
      return placements.filter((p) => {
        const set = new Set(p.map(([r, c]) => key(r, c)));
        return state.selected.every(([r, c]) => set.has(key(r, c)));
      });
    }

    // Systemhinweis setzen: erscheint nur noch im #message-Bereich (Hochformat).
    // Die Kommentar-Box (#commentary) ist absichtlich SPASS-ONLY und zeigt nur
    // Leopolds Sprüche - keine spieltechnischen Hinweise mehr.
    function setHint(text) {
      dom.message.textContent = text;
    }

    function finish(result) {
      stopTimer();
      control.cancel = null;
      dom.diceTray.replaceChildren();
      dom.actionBar.replaceChildren();
      setHint('');
      resolve(result);
    }

    // Erlaubt dem Flow, einen wartenden Mensch-Zug von aussen abzubrechen
    // (z. B. "Spiel beenden"). Der Flow prueft danach control.aborted.
    control.cancel = () => finish({ action: 'abort' });

    // --- Optionaler Zug-Timer ----------------------------------------------
    let timerId = null;
    let remaining = game.moveTimer || 0;
    function stopTimer() {
      if (timerId) { clearInterval(timerId); timerId = null; }
      if (dom.moveTimer) { dom.moveTimer.classList.add('hidden'); dom.moveTimer.textContent = ''; }
    }
    function updateTimerDisplay() {
      if (!dom.moveTimer) return;
      dom.moveTimer.textContent = `⏱ ${remaining}s`;
      dom.moveTimer.classList.toggle('low', remaining <= 5);
    }
    function startTimer() {
      if (!remaining || !dom.moveTimer) return;
      dom.moveTimer.classList.remove('hidden');
      updateTimerDisplay();
      timerId = setInterval(() => {
        remaining -= 1;
        updateTimerDisplay();
        if (remaining <= 0) finish({ action: 'pass', timedOut: true });
      }, 1000);
    }

    function onCellClick(r, c) {
      // Notizblock-Modus: Farbe/Anzahl egal - jedes erreichbare Feld frei ankreuzen.
      if (game.relaxed) {
        const k = key(r, c);
        const idx = state.selected.findIndex(([rr, cc]) => key(rr, cc) === k);
        if (idx >= 0) {
          state.selected.splice(idx, 1); // erneutes Antippen entfernt das Feld
          setHint('');
          redraw();
          return;
        }
        if (sheet.isMarked(r, c)) return;
        const tentative = [...state.selected, [r, c]];
        if (!isRelaxedPlacement(sheet, tentative, relaxedMax)) {
          setHint(`Nur Felder einer Farbe, erreichbar ab Startspalte H oder neben einem Kreuz (max. ${relaxedMax}).`);
          return;
        }
        state.selected.push([r, c]);
        setHint('');
        redraw();
        return;
      }

      if (!state.colorId || !state.numberId) {
        setHint('Bitte zuerst einen Farb- und einen Zahlenwürfel wählen.');
        return;
      }
      const k = key(r, c);
      const idx = state.selected.findIndex(([rr, cc]) => key(rr, cc) === k);
      if (idx >= 0) {
        state.selected.splice(idx, 1);
      } else {
        const tentative = [...state.selected, [r, c]];
        const ok = currentPlacements().some((p) => {
          const set = new Set(p.map(([rr, cc]) => key(rr, cc)));
          return tentative.every(([rr, cc]) => set.has(key(rr, cc)));
        });
        if (!ok) {
          setHint('Dieses Feld ergibt keine gültige Platzierung.');
          return;
        }
        state.selected.push([r, c]);
      }
      redraw();
    }

    // Notizblock-Modus: Würfel nur als Referenz, freies Ankreuzen erreichbarer Felder.
    function redrawRelaxed() {
      // --- Würfel read-only anzeigen (man würfelt real am Tisch) ------------
      dom.diceTray.replaceChildren();
      const colorGroup = document.createElement('div');
      colorGroup.className = 'dice-group';
      colorGroup.append(label('Farbwürfel'));
      for (const die of game.dice.colorDice) colorGroup.append(refDie(die, true));
      const numberGroup = document.createElement('div');
      numberGroup.className = 'dice-group';
      numberGroup.append(label('Zahlenwürfel'));
      for (const die of game.dice.numberDice) numberGroup.append(refDie(die, false));
      dom.diceTray.append(colorGroup, numberGroup);

      // --- Board: erreichbare Felder hervorheben ---------------------------
      const selectedSet = new Set(state.selected.map(([r, c]) => key(r, c)));
      const highlight = new Set();
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (sheet.isMarked(r, c) || selectedSet.has(key(r, c))) continue;
          if (isRelaxedPlacement(sheet, [...state.selected, [r, c]], relaxedMax)) highlight.add(key(r, c));
        }
      }
      renderBoards({
        chooserIdx: playerIndex,
        focusIdx: playerIndex,
        interactive: true,
        highlight,
        selected: selectedSet,
        onCellClick,
        // PvP: Buchstabe/Farbe antippen = "anderer Spieler war zuerst" -> nur reduziert.
        // Erneutes Antippen gibt den vollen Wert wieder frei (Umschalter).
        onColumnClick: (col) => { game.toggleColumnStrikeByOther(playerIndex, col); redraw(); },
        onColorClick: (color) => { game.toggleColorStrikeByOther(playerIndex, color); redraw(); },
        // PvP: Joker antippen = als verwendet markieren (kostet je +1) bzw. wieder freigeben.
        onJokerClick: (i) => { game.toggleJokerUsed(playerIndex, i); redraw(); },
      });

      // --- Aktionsleiste (Bestätigen, Passen, Rückgängig) ------------------
      dom.actionBar.replaceChildren();
      const confirm = button('Bestätigen', () => {
        finish({ action: 'choice', choice: { cells: state.selected } });
      });
      confirm.disabled = state.selected.length === 0;
      confirm.classList.add('primary');

      const pass = makePassButton();

      const undo = button('↶ Feld zurück', () => {
        if (state.selected.length) {
          state.selected.pop();
          setHint('');
          redraw();
        }
      });
      undo.title = 'Zuletzt gewähltes Feld wieder abwählen';
      undo.disabled = state.selected.length === 0;

      dom.actionBar.append(confirm, pass, undo);
    }

    // Nicht anklickbarer Würfel nur zur Anzeige des aktuellen Wurfs.
    function refDie(die, isColor) {
      const chip = document.createElement('span');
      chip.className = isColor ? 'die color-die' : 'die number-die';
      if (die.face === JOKER) {
        chip.classList.add('joker');
        chip.textContent = isColor ? '✻' : '?';
      } else if (isColor) {
        chip.style.background = COLOR_HEX[die.face];
        chip.title = COLOR_LABEL[die.face];
      } else {
        chip.textContent = die.face;
      }
      return chip;
    }

    function redraw() {
      if (game.relaxed) { redrawRelaxed(); return; }
      // --- Wuerfeltablett ---------------------------------------------------
      dom.diceTray.replaceChildren();

      const colorGroup = document.createElement('div');
      colorGroup.className = 'dice-group';
      colorGroup.append(label('Farbwürfel'));
      for (const die of game.dice.colorDice) {
        colorGroup.append(colorDieChip(die));
      }
      const numberGroup = document.createElement('div');
      numberGroup.className = 'dice-group';
      numberGroup.append(label('Zahlenwürfel'));
      for (const die of game.dice.numberDice) {
        numberGroup.append(numberDieChip(die));
      }
      dom.diceTray.append(colorGroup, numberGroup);

      // Joker gewaehlt? Keine Extra-Auswahl mehr - nur ein kurzer Hinweis. Farbe und
      // Anzahl ergeben sich aus den gleich angekreuzten Feldern.
      const colorDie = state.colorId ? colorDieById(state.colorId) : null;
      const numberDie = state.numberId ? numberDieById(state.numberId) : null;
      const jokerChosen = (colorDie && colorDie.face === JOKER) || (numberDie && numberDie.face === JOKER);
      if (jokerChosen && state.selected.length === 0) {
        setHint(`Joker: Farbe und Anzahl ergeben sich aus den angekreuzten Feldern (${sheet.jokersRemaining()} Joker übrig).`);
      }

      // --- Board mit Highlights --------------------------------------------
      const placements = currentPlacements();
      const consistent = consistentPlacements(placements);
      const selectedSet = new Set(state.selected.map(([r, c]) => key(r, c)));
      const highlight = new Set();
      for (const p of consistent) {
        for (const [r, c] of p) {
          const k = key(r, c);
          if (!selectedSet.has(k)) highlight.add(k);
        }
      }
      renderBoards({
        chooserIdx: playerIndex,
        focusIdx: playerIndex,
        interactive: true,
        highlight,
        selected: selectedSet,
        onCellClick,
      });

      // --- Aktionsleiste ----------------------------------------------------
      dom.actionBar.replaceChildren();
      // Bestaetigen, sobald die Auswahl GENAU einer legalen Platzierung entspricht
      // (gilt fuer feste Anzahl wie fuer Joker-Anzahl gleichermassen).
      const canConfirm = state.selected.length > 0
        && placements.some((p) => sameSet(state.selected, new Set(p.map(([rr, cc]) => key(rr, cc)))));

      const confirm = button('Bestätigen', () => {
        finish({
          action: 'choice',
          choice: {
            colorId: state.colorId,
            numberId: state.numberId,
            color: effColor(),
            count: effCount(),
            cells: state.selected,
          },
        });
      });
      confirm.disabled = !canConfirm;
      confirm.classList.add('primary');

      const undo = button('↶ Feld zurück', () => {
        if (state.selected.length) {
          state.selected.pop();
          setHint('');
          redraw();
        }
      });
      undo.title = 'Zuletzt gewähltes Feld wieder abwählen';
      undo.disabled = state.selected.length === 0;

      const pass = makePassButton();

      // Reihenfolge fuer die Daumen-Ergonomie: Bestaetigen, Passen, Rueckgaengig.
      dom.actionBar.append(confirm, pass, undo);

      // Hinweis, wenn Kombination unmoeglich.
      if (state.colorId && state.numberId && placements.length === 0) {
        setHint('Mit dieser Kombination ist keine gültige Platzierung möglich.');
      }
    }

    // --- DOM-Helfer ---------------------------------------------------------
    function label(text) {
      const el = document.createElement('span');
      el.className = 'dice-label';
      el.textContent = text;
      return el;
    }
    function button(text, onClick) {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
    // Passen-Knopf. Mit Hausregel "Minuspunkt pro Pass" zeigt er "Passen (−1)" und
    // erklaert per Tooltip, dass jedes Passen 1 Punkt kostet.
    function makePassButton() {
      const b = button(game.passPenalty ? 'Passen (−1)' : 'Passen', () => finish({ action: 'pass' }));
      b.classList.add('pass');
      if (game.passPenalty) b.title = 'Passen kostet 1 Minuspunkt (Sonderregel)';
      return b;
    }
    function colorDieChip(die) {
      const chip = document.createElement('button');
      chip.className = 'die color-die';
      const usable = poolColorIds.has(die.id);
      if (die.face === JOKER) {
        chip.classList.add('joker');
        chip.textContent = '✻';
      } else {
        chip.style.background = COLOR_HEX[die.face];
        chip.title = COLOR_LABEL[die.face];
      }
      if (!usable) chip.classList.add('disabled');
      if (state.colorId === die.id) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        if (!usable) return;
        state.colorId = state.colorId === die.id ? null : die.id;
        state.selected = [];
        setHint('');
        redraw();
      });
      return chip;
    }
    function numberDieChip(die) {
      const chip = document.createElement('button');
      chip.className = 'die number-die';
      const usable = poolNumberIds.has(die.id);
      chip.textContent = die.face === JOKER ? '?' : die.face;
      if (die.face === JOKER) chip.classList.add('joker');
      if (!usable) chip.classList.add('disabled');
      if (state.numberId === die.id) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        if (!usable) return;
        state.numberId = state.numberId === die.id ? null : die.id;
        state.selected = [];
        setHint('');
        redraw();
      });
      return chip;
    }
    redraw();
    startTimer();
  });
}
