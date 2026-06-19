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
import { isValidPlacement, isRelaxedPlacement } from './rules.js';

export class Game {
  constructor(playerConfigs, { soloMode = false, aiDifficulty = 'mittel', moveTimer = 0, aiSpeed = 1, relaxed = false, aiAuto = false } = {}) {
    // playerConfigs: [{ name, isHuman }]
    this.players = playerConfigs.map((p, i) => ({
      id: i,
      name: p.name,
      isHuman: p.isHuman,
      sheet: new Sheet(),
    }));
    this.soloMode = soloMode;
    this.relaxed = relaxed;     // Notizblock-Modus: lockere Validierung (Farbe/Anzahl egal)
    this.aiDifficulty = aiDifficulty;
    this.moveTimer = moveTimer; // Sekunden je Mensch-Zug (0 = aus)
    this.aiSpeed = aiSpeed;     // Faktor auf KI-Pausen (1 = normal, >1 langsamer)
    this.aiAuto = aiAuto;       // true = KI-Phasen ohne Bestätigungsklick automatisch starten
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

  // Notizblock-Modus: kreuzt frei gewaehlte, regelkonform erreichbare Felder an -
  // ohne Wuerfel-/Farb-/Anzahl-Pruefung (man wuerfelt real am Tisch). Wertung und
  // Spielende laufen anschliessend unveraendert ueber resolveRound.
  submitMarks(playerIndex, cells) {
    if (this.currentChooserIndex() !== playerIndex) {
      throw new Error('Dieser Spieler ist gerade nicht am Zug');
    }
    const player = this.players[playerIndex];
    if (!isRelaxedPlacement(player.sheet, cells)) {
      throw new Error('Ungueltige Platzierung');
    }
    player.sheet.mark(cells);
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

  // --- PvP-Wertung & Strikes (Notizblock) ----------------------------------
  // PvP: eigene fertige Spalten/Farben automatisch werten - voll, oder reduziert,
  // falls vorher als "anderer war zuerst" gestrichen.
  _awardCompletedRelaxed(sheet) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (sheet.columnAward[col] === null && sheet.isColumnComplete(col)) {
        sheet.awardColumn(col, !sheet.columnTopStruck[col]);
      }
    }
    for (const color of COLOR_ORDER) {
      if (sheet.colorAward[color] === undefined && sheet.isColorComplete(color)) {
        sheet.awardColor(color, sheet.colorFirstStruck[color] ? COLOR_BONUS_LATER : COLOR_BONUS_FIRST);
      }
    }
  }

  // PvP: Spalten-Oberwert per Antippen umschalten. 1. Tippen = "anderer Spieler war
  // zuerst" -> nur noch der reduzierte (untere) Wert moeglich. Erneutes Tippen gibt den
  // vollen Oberwert wieder frei. Ein bereits gewerteter Wert wird passend umgestuft.
  toggleColumnStrikeByOther(playerIndex, col) {
    const sheet = this.players[playerIndex].sheet;
    if (sheet.columnTopStruck[col]) {
      sheet.unstrikeColumnTop(col);
      if (sheet.columnAward[col] === COLUMN_BOTTOM[col]) sheet.awardColumn(col, true);
    } else {
      sheet.strikeColumnTop(col);
      if (sheet.columnAward[col] === COLUMN_TOP[col]) sheet.awardColumn(col, false);
    }
  }

  // PvP: Farb-Erstbonus (5 Punkte) analog per Antippen umschalten.
  toggleColorStrikeByOther(playerIndex, color) {
    const sheet = this.players[playerIndex].sheet;
    if (sheet.colorFirstStruck[color]) {
      sheet.unstrikeColorFirst(color);
      if (sheet.colorAward[color] === COLOR_BONUS_LATER) sheet.awardColor(color, COLOR_BONUS_FIRST);
    } else {
      sheet.strikeColorFirst(color);
      if (sheet.colorAward[color] === COLOR_BONUS_FIRST) sheet.awardColor(color, COLOR_BONUS_LATER);
    }
  }

  // --- Runde auswerten -----------------------------------------------------
  resolveRound() {
    if (!this.isRoundComplete()) throw new Error('Runde noch nicht abgeschlossen');

    // PvP/Notizblock: keine Mehrspieler-"Erst-Claim"-Logik, nur die eigenen fertigen
    // Spalten/Farben werten (voll oder reduziert je nach Strike).
    if (this.relaxed) {
      this._awardCompletedRelaxed(this.players[0].sheet);
      if (this.players[0].sheet.completedColorGridCount() >= 2
          || this.players[0].sheet.allColumnsComplete()) {
        this.endTriggered = true;
        this.finished = true;
      }
      this.activeIndex = (this.activeIndex + 1) % this.players.length;
      return this.roundLog;
    }

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

    // Spielende: ein Spieler hat seine 2. Farbe vollstaendig angekreuzt ODER alle Spalten
    // geschlossen (grid-basiert, damit es direkt nach dem Ankreuzen sicher greift).
    // (Im Solo-Spiel wird stattdessen ueber 30 Wuerfe gespielt - siehe flow.js.)
    if (!this.soloMode && this.players.some(
          (p) => p.sheet.completedColorGridCount() >= 2 || p.sheet.allColumnsComplete())) {
      this.endTriggered = true;
      this.finished = true;
    }

    // Naechster aktiver Spieler.
    this.activeIndex = (this.activeIndex + 1) % this.players.length;
    return this.roundLog;
  }

  // --- Zurück-Funktion: Schnappschuss & Wiederherstellung ------------------
  // Speichert den kompletten veränderlichen Spielzustand (inkl. aller Blätter),
  // damit ein Zug exakt zurückgenommen werden kann. structuredClone kopiert tief,
  // sodass der Schnappschuss unabhängig vom laufenden Zustand ist.
  snapshot() {
    return structuredClone({
      activeIndex: this.activeIndex,
      rollCount: this.rollCount,
      columnFirstClaimed: this.columnFirstClaimed,
      colorFirstClaimed: this.colorFirstClaimed,
      finished: this.finished,
      endTriggered: this.endTriggered,
      dice: this.dice,
      removedColorId: this.removedColorId,
      removedNumberId: this.removedNumberId,
      order: this.order,
      pointer: this.pointer,
      roundLog: this.roundLog,
      sheets: this.players.map((p) => ({
        marks: p.sheet.marks,
        jokersUsed: p.sheet.jokersUsed,
        hasMarkedAny: p.sheet.hasMarkedAny,
        columnAward: p.sheet.columnAward,
        columnTopStruck: p.sheet.columnTopStruck,
        colorAward: p.sheet.colorAward,
        colorFirstStruck: p.sheet.colorFirstStruck,
      })),
    });
  }

  restore(s) {
    this.activeIndex = s.activeIndex;
    this.rollCount = s.rollCount;
    this.columnFirstClaimed = s.columnFirstClaimed;
    this.colorFirstClaimed = s.colorFirstClaimed;
    this.finished = s.finished;
    this.endTriggered = s.endTriggered;
    this.dice = s.dice;
    this.removedColorId = s.removedColorId;
    this.removedNumberId = s.removedNumberId;
    this.order = s.order;
    this.pointer = s.pointer;
    this.roundLog = s.roundLog;
    this.players.forEach((p, i) => {
      const ss = s.sheets[i];
      p.sheet.marks = ss.marks;
      p.sheet.jokersUsed = ss.jokersUsed;
      p.sheet.hasMarkedAny = ss.hasMarkedAny;
      p.sheet.columnAward = ss.columnAward;
      p.sheet.columnTopStruck = ss.columnTopStruck;
      p.sheet.colorAward = ss.colorAward;
      p.sheet.colorFirstStruck = ss.colorFirstStruck;
    });
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
