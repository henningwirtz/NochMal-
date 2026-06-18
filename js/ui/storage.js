// ============================================================================
// ui/storage.js
// Lokale Persistenz über localStorage: Bestenliste der Ergebnisse und die
// zuletzt verwendeten Setup-Einstellungen (Spielernamen, Anzahl, KI-Stärke,
// Zug-Timer). Alle Zugriffe sind gekapselt und gegen Fehler (z. B. blockiertes
// localStorage) abgesichert.
// ============================================================================

const SCORES_KEY = 'nochmal.scores.v1';
const SETTINGS_KEY = 'nochmal.settings.v1';
const PREFS_KEY = 'nochmal.prefs.v1';
const MAX_SCORES = 50;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Persistenz nicht verfügbar - still ignorieren. */
  }
}

// --- Bestenliste ------------------------------------------------------------
// Eintrag: { name, score, solo, difficulty, isHuman, date }
export function getScores() {
  const list = readJSON(SCORES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function recordResults(entries) {
  const list = getScores().concat(entries);
  list.sort((a, b) => b.score - a.score || b.date - a.date);
  writeJSON(SCORES_KEY, list.slice(0, MAX_SCORES));
}

export function clearScores() {
  writeJSON(SCORES_KEY, []);
}

// Entfernt einen einzelnen Eintrag anhand seiner Position in der sortierten Liste.
export function removeScoreAt(index) {
  const list = getScores();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    writeJSON(SCORES_KEY, list);
  }
}

// --- Setup-Einstellungen ----------------------------------------------------
export function loadSettings() {
  return readJSON(SETTINGS_KEY, null);
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
}

// --- Globale Präferenzen (Theme, Ton) - sofort beim Umschalten gespeichert ---
export function loadPrefs() {
  return readJSON(PREFS_KEY, {});
}

export function savePrefs(prefs) {
  writeJSON(PREFS_KEY, { ...loadPrefs(), ...prefs });
}
