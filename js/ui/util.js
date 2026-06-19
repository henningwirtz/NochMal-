// ============================================================================
// ui/util.js
// Kleine, gemeinsam genutzte UI-Helfer (bewusst DOM-nah und winzig gehalten).
// ============================================================================

// Maskiert HTML-Sonderzeichen, damit vom Nutzer eingegebene Texte (z. B.
// Spielernamen) gefahrlos per innerHTML eingesetzt werden koennen - sonst
// koennte ein Name wie "<b>x" oder "A & B" das Layout zerschiessen.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
