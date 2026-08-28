// native-statusbar.js — Capacitor (native app) ONLY.
// Extend the web content BEHIND the status bar (edge-to-edge Dashboard cover).
// In a non-bundled Capacitor app `Capacitor.Plugins.StatusBar` is often undefined,
// so we route through Capacitor.registerPlugin('StatusBar') (bridge proxy → native,
// no JS import). The overlay applies ASYNC, a beat after load — the app-shell then
// measures the real inset and threads it into each tab iframe; if it can't measure
// it, the shell calls __rmSetStatusBarOverlay(false) to self-heal (avoids pushing
// the tab headers under the status bar). No-op on the web / if the plugin's absent.
(function () {
  function sb() {
    var C = window.Capacitor;
    if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
    try { if (typeof C.registerPlugin === 'function') return C.registerPlugin('StatusBar'); } catch (e) {}
    return (C.Plugins && C.Plugins.StatusBar) || null;
  }
  // Exposed so app-shell.js can turn the overlay back OFF if it can't offset the
  // content correctly (self-heal against the nav-under-the-status-bar regression).
  window.__rmSetStatusBarOverlay = function (on) {
    try { var s = sb(); if (s && s.setOverlaysWebView) s.setOverlaysWebView({ overlay: !!on }); } catch (e) {}
  };
  function enable() { window.__rmSetStatusBarOverlay(true); }
  enable();
  document.addEventListener('DOMContentLoaded', enable);
  setTimeout(enable, 300);
  setTimeout(enable, 1200);
})();
