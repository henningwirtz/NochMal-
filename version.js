// ============================================================================
// version.js - EINZIGE Quelle der App-Version.
// Wird zweifach geladen:
//   1) als klassisches <script> in index.html -> setzt window.APP_VERSION
//      (main.js zeigt sie im Setup-Kopf als "Version ...").
//   2) per importScripts in sw.js -> der Service-Worker-Cache-Name wird daraus
//      abgeleitet (siehe sw.js).
// So muss die Version nur HIER hochgezaehlt werden; der Offline-Cache
// invalidiert automatisch mit, weil sein Name aus dieser Zeichenkette entsteht.
// Kurzer, sprechender Name (z. B. '2.2 · Aufraeumen').
self.APP_VERSION = '2.3 · Eine Flaeche';
