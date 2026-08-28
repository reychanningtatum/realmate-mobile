// native-statusbar.js — Capacitor (native app) ONLY.
// Let the web content extend BEHIND the status bar so the app is edge-to-edge
// (Facebook-style: the Dashboard cover photo runs up under the time/Wi-Fi/battery).
// This turns on the env(safe-area-inset-*) handling already present in safe-area.css
// (inert while the WKWebView is boxed BELOW the status bar), which the app-shell
// then threads into each iframe as --rm-safe-top.
//
// IMPORTANT: this is a non-bundled Capacitor app (plain <script> tags, no import).
// In that setup `Capacitor.Plugins.StatusBar` is frequently UNDEFINED because the
// plugin's JS never runs to register it — the earlier builds silently no-op'd here.
// `Capacitor.registerPlugin('StatusBar')` returns a bridge proxy that routes calls
// to the NATIVE plugin (confirmed synced: @capacitor/status-bar@7.0.6) without any
// JS import. Fail-safe: a no-op on the web and if nothing resolves, so it can never
// regress the current layout.
(function () {
  function statusBar() {
    var C = window.Capacitor;
    if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
    // Prefer the registerPlugin proxy (works without the plugin JS); fall back to
    // Capacitor.Plugins.StatusBar if a bundler did register it.
    try {
      if (typeof C.registerPlugin === 'function') return C.registerPlugin('StatusBar');
    } catch (e) {}
    return (C.Plugins && C.Plugins.StatusBar) || null;
  }
  function enableOverlay() {
    try {
      var SB = statusBar();
      if (SB && SB.setOverlaysWebView) SB.setOverlaysWebView({ overlay: true });
    } catch (e) { /* never disrupt page load */ }
  }
  enableOverlay();
  document.addEventListener('DOMContentLoaded', enableOverlay);
  // The bridge can attach a moment after the document; try again shortly.
  setTimeout(enableOverlay, 300);
  setTimeout(enableOverlay, 1200);
})();
