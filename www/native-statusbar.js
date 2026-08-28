// native-statusbar.js — Capacitor (native app) ONLY.
// Let the web content extend BEHIND the status bar so the app is edge-to-edge
// (Facebook-style: the Dashboard cover photo runs up under the time/Wi-Fi/battery).
// This is what turns on the env(safe-area-inset-*) handling already present in
// safe-area.css — those rules are inert while the WKWebView is boxed BELOW the
// status bar (inset resolves to 0), which is why the cover previously stopped at
// a plain background strip.
//
// Fail-safe by design: a no-op on the web and whenever the StatusBar plugin is
// absent, so it can never regress the existing layout. Runs immediately and again
// once the bridge is definitely ready.
(function () {
  function enableOverlay() {
    try {
      var C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
      var SB = C.Plugins && C.Plugins.StatusBar;
      if (SB && SB.setOverlaysWebView) SB.setOverlaysWebView({ overlay: true });
    } catch (e) { /* never disrupt page load */ }
  }
  enableOverlay();
  document.addEventListener('DOMContentLoaded', enableOverlay);
})();
