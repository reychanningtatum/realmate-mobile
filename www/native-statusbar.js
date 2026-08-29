// native-statusbar.js — DISABLED.
// We are NOT trying to render behind the native status bar anymore (that needs
// on-device verification and kept regressing the Portal nav). Instead the
// Dashboard just sits flush below the status bar (see dashboard-style.css). With
// no overlay, every var(--rm-safe-top, env(safe-area-inset-top)) rule falls back
// to env() and the app keeps its normal, stable layout. Kept as a no-op so the
// <script> tag on app.html/index.html needs no change.
(function () { /* intentionally a no-op */ })();
