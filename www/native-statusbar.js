// native-statusbar.js — DISABLED (2026-08-28).
//
// This tried to make the WKWebView extend behind the status bar (edge-to-edge
// Dashboard cover) via StatusBar.setOverlaysWebView({overlay:true}). With
// Capacitor.registerPlugin('StatusBar') the overlay DID take effect on the device
// — but because iOS doesn't propagate the safe-area inset into the app-shell's tab
// IFRAMES, the shell-threaded --rm-safe-top offset didn't apply reliably, so the
// Portal's top navigation got pushed up UNDER the status bar (a regression) while
// the cover still wasn't right. Getting the per-iframe inset offset correct needs
// to be verified on an actual device / in Xcode, which isn't possible here, so the
// overlay is turned OFF to keep the app stable. With no overlay, every
// var(--rm-safe-top, env(safe-area-inset-top)) rule simply falls back to env()
// (0 inside the iframes) — i.e. the original, pre-overlay behaviour.
//
// To re-enable later (with device testing): call
//   Capacitor.registerPlugin('StatusBar').setOverlaysWebView({ overlay: true })
// here, and make app-shell.js threadSafeArea() re-measure AFTER the overlay has
// actually applied (it applies async, a beat after iframe load).
(function () { /* intentionally a no-op — see comment above */ })();
