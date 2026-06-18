// ============================================================================
// core/game.js
// Zustandsautomat des Spiels: Spieler, Runden, aktiver/passive Auswahl,
// Erst-Komplettierung von Spalten/Farben, Spielende und Endwertung.
//
// Ablauf einer Runde:
//   beginRound() -> aktiver Spieler wuerfelt
//   nacheinander waehlen: aktiver Spieler, dann passive (im Uhrzeigersinn)
//     submitChoice(...) / submitPass(...)
//   resolveRound() -> Spalten/Farben werten, Spielende pruefen, aktiver wechselt
// ============================================================================

import {
  COLOR_ORDER,
  COLUMN_TOP,
  COLUMN_BOTTOM,
  COLOR_BONUS_FIRST,
  COLOR_BONUS_LATER,
  FREE_ROLLS,
  JOKER,
  GRID_COLS,
} from './constants.js';
import { rollAll } from './dice.js';
import { Sheet } from './sheet.js';
import { isValidPlacement } from './rules.js';

export class Game {
  constructor(playerConfigs, { soloMode = false, aiDifficulty = 'mittel' } = {}) {
    // playerConfigs: [{ name, isHuman }]
    this.players = playerConfigs.map((p, i) => ({
      id: i,
      name: p.name,
      isHuman: p.isHuman,
      sheet: new Sheet(),
    }));
    this.soloMode = soloMode;
    this.aiDifficulty = aiDifficulty;
    this.activeIndex = 0;
    this.rollCount = 0;

    // Globale Erst-Komplettierung.
    this.columnFirstClaimed = Array(GRID_COLS).fill(false);
    this.colorFirstClaimed = {};

    this.finished = false;
    this.endTriggered = false;

    // Rundenzustand.
    this.dice = null;
    this.removedColorId = null;
    this.removedNumberId = null;
    this.order = [];
    this.pointer = 0;
    this.roundLog = []; // pro Runde: Ereignisse fuer Ansagen/UI
  }

  // --- Runde starten -------------------------------------------------------
  beginRound() {
    this.dice = rollAll(this.soloMode);
    this.rollCount++;
    this.removedColorId = null;
    this.removedNumberId = null;
    this.roundLog = [];

    const n = this.players.length;
    this.order = [];
    for (let i = 0; i < n; i++) {
      this.order.push((this.activeIndex + i) % n);
    }
    this.pointer = 0;
    return this.dice;
  }

  get activePlayer() {
    return this.players[this.activeIndex];
  }

  currentChooserIndex() {
    if (this.pointer >= this.order.length) return null;
    return this.order[this.pointer];
  }

  currentChooser() {
    const idx = this.currentChooserIndex();
    return idx === null ? null : this.players[idx];
  }

  isRoundComplete() {
    return this.pointer >= this.order.length;
  }

  // Erste 3 Wuerfe ODER aktiver Spieler hat gepasst -> passive duerfen aus allen
  // 6 Wuerfeln waehlen.
  passivesUseAllDice() {
    return this.rollCount <= FREE_ROLLS || this.removedColorId === null;
  }

  // Wuerfel-Pool, aus dem ein bestimmter Spieler waehlen darf.
  availablePool(playerIndex) {
    const isActive = playerIndex === this.activeIndex;
    let colorDice = this.dice.colorDice;
    let numberDice = this.dice.numberDice;
    if (!isActive && !this.passivesUseAllDice()) {
      colorDice = colorDice.filter((d) => d.id !== this.removedColorId);
      numberDice = numberDice.filter((d) => d.id !== this.removedNumberId);
    }
    return { colorDice, numberDice };
  }

  // Prueft & berechnet die Joker-Nutzung fuer eine Auswahl. Wirft bei Fehlern.
  _resolveDice(player, pool, colorId, numberId, color, count) {
    const colorDie = pool.colorDice.find((d) => d.id === colorId);
    const numberDie = pool.numberDice.find((d) => d.id === numberId);
    if (!colorDie) throw new Error('Farbwuerfel nicht im verfuegbaren Pool');
    if (!numberDie) throw new Error('Zahlenwuerfel nicht im verfuegbaren Pool');

    let jokersUsed = 0;
    if (colorDie.face === JOKER) {
      jokersUsed++;
      if (!COLOR_ORDER.includes(color)) throw new Error('Joker-Farbe ungueltig');
    } else if (colorDie.face !== color) {
      throw new Error('Farbe passt nicht zum Wuerfel');
    }
    if (numberDie.face === JOKER) {
      jokersUsed++;
      if (count < 1 || count > 5) throw new Error('Joker-Zahl muss 1..5 sein');
    } else if (numberDie.face !== count) {
      throw new Error('Anzahl passt nicht zum Wuerfel');
    }
    if (jokersUsed > player.sheet.jokersRemaining()) {
      throw new Error('Nicht genug Joker-Felder uebrig');
    }
    return jokersUsed;
  }

  // Spieler kreuzt an. choice: { colorId, numberId, color, count, cells }
  submitChoice(playerIndex, choice) {
    if (this.currentChooserIndex() !== playerIndex) {
      throw new Error('Dieser Spieler ist gerade nicht am Zug');
    }
    const player = this.players[playerIndex];
    const pool = this.availablePool(playerIndex);
    const { colorId, numberId, color, count, cells } = choice;

    const jokersUsed = this._resolveDice(player, pool, colorId, numberId, color, count);
    if (!isValidPlacement(player.sheet, color, count, cells)) {
      throw new Error('Ungueltige Platzierung');
    }

    player.sheet.mark(cells);
    player.sheet.useJokers(jokersUsed);

    if (playerIndex === this.activeIndex) {
      this.removedColorId = colorId;
      this.removedNumberId = numberId;
    }
    this._advance();
  }

  // Spieler passt (kreuzt nichts an).
  submitPass(playerIndex) {
    if (this.currentChooserIndex() !== playerIndex) {
      throw new Error('Dieser Spieler ist gerade nicht am Zug');
    }
    // Aktiver Spieler passt -> removedDice bleiben null -> passive duerfen alle 6.
    this._advance();
  }

  _advance() {
    this.pointer++;
  }

  // --- Runde auswerten -----------------------------------------------------
  resolveRound() {
    if (!this.isRoundComplete()) throw new Error('Runde noch nicht abgeschlossen');

    // Spalten: alle Spieler, die eine Spalte neu (noch ungewertet) komplettiert
    // haben, ermitteln; Erst-Komplettierung im selben Wurf -> alle oberer Wert.
    for (let col = 0; col < GRID_COLS; col++) {
      const completers = this.players.filter(
        (p) => p.sheet.columnAward[col] === null && p.sheet.isColumnComplete(col)
      );
      if (completers.length === 0) continue;

      const isFirstNow = !this.columnFirstClaimed[col];
      for (const p of completers) {
        p.sheet.awardColumn(col, isFirstNow);
      }
      if (isFirstNow) {
        this.columnFirstClaimed[col] = true;
        // Alle uebrigen Spieler streichen den oberen Wert.
        for (const p of this.players) {
          if (!completers.includes(p)) p.sheet.strikeColumnTop(col);
        }
        this.roundLog.push({
          type: 'column',
          col,
          players: completers.map((p) => p.name),
          value: COLUMN_TOP[col],
        });
      } else {
        this.roundLog.push({
          type: 'column-late',
          col,
          players: completers.map((p) => p.name),
          value: COLUMN_BOTTOM[col],
        });
      }
    }

    // Farben: analog.
    for (const color of COLOR_ORDER) {
      const completers = this.players.filter(
        (p) => p.sheet.colorAward[color] === undefined && p.sheet.isColorComplete(color)
      );
      if (completers.length === 0) continue;

      const isFirstNow = !this.colorFirstClaimed[color];
      const value = isFirstNow ? COLOR_BONUS_FIRST : COLOR_BONUS_LATER;
      for (const p of completers) {
        p.sheet.awardColor(color, value);
      }
      if (isFirstNow) {
        this.colorFirstClaimed[color] = true;
        for (const p of this.players) {
          if (!completers.includes(p)) p.sheet.strikeColorFirst(color);
        }
      }
      this.roundLog.push({
        type: 'color',
        color,
        players: completers.map((p) => p.name),
        value,
      });
    }

    // Spielende: ein Spieler hat seine 2. komplette Farbe erreicht.
    // (Im Solo-Spiel wird stattdessen ueber 30 Wuerfe gespielt - siehe flow.js.)
    if (!this.soloMode && this.players.some((p) => p.sheet.completedColorCount() >= 2)) {
      this.endTriggered = true;
      this.finished = true;
    }

    // Naechster aktiver Spieler.
    this.activeIndex = (this.activeIndex + 1) % this.players.length;
    return this.roundLog;
  }

  // --- Endwertung ----------------------------------------------------------
  finalScores() {
    const rows = this.players.map((p) => ({
      player: p,
      ...p.sheet.computeScore(),
    }));
    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.jokersRemaining - a.jokersRemaining; // Gleichstand: mehr "!" gewinnt
    });
    // Sieger (inkl. echtem Gleichstand).
    const best = rows[0];
    rows.forEach((r) => {
      r.isWinner =
        r.total === best.total && r.jokersRemaining === best.jokersRemaining;
    });
    return rows;
  }
}
