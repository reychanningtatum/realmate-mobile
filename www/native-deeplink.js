// native-deeplink.js — routes custom-scheme deep links into the app (NATIVE ONLY).
//
// The welcome email opens realmate://open (just launch the app — no handling
// needed). The password-reset email links to reset.html, which hands off to
// realmate://reset?token_hash=...&type=recovery. We catch that here and feed the
// recovery token to the existing web reset flow (script.js handleTokenHashRecovery)
// by loading index.html with the same query — so the "set a new password" screen
// appears INSIDE the app instead of Safari.
//
// Requires @capacitor/app (App.getLaunchUrl / appUrlOpen). Inert on the web.
(function () {
  try {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
  } catch (e) { return; }

  // Pull token_hash out of a realmate://reset?... (or any recovery) URL and load
  // index.html with it so the recovery modal opens. Returns true if it routed.
  function routeFromUrl(url) {
    if (!url) return false;
    url = String(url);
    var m = url.match(/[?&]token_hash=([^&]+)/);
    if (!m) return false;
    if (!/type=recovery/i.test(url) && !/realmate:\/\/reset/i.test(url)) return false;
    var th;
    try { th = decodeURIComponent(m[1]); } catch (e) { th = m[1]; }
    // Route each token exactly ONCE. getLaunchUrl() keeps returning the same
    // launch URL for the whole app session, and script.js STRIPS ?token_hash from
    // the URL right after reading it — so we cannot use location.search to tell
    // "already handled". Without this guard we'd navigate again after the strip,
    // reload index.html, and re-run verifyOtp on the now-spent one-time token,
    // wiping the reset modal. The flag makes the handoff fire only once.
    try {
      if (sessionStorage.getItem('rm_reset_routed') === th) return true;
      sessionStorage.setItem('rm_reset_routed', th);
    } catch (e) {}
    // Already sitting on a recovery URL (warm/reloaded) — let script.js handle it.
    if (location.search.indexOf('token_hash=') >= 0) return true;
    location.replace('index.html?token_hash=' + encodeURIComponent(th) + '&type=recovery');
    return true;
  }

  // The App plugin can attach a beat after this script runs on a cold start.
  function withApp(cb) {
    var A = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A) { cb(A); return; }
    var tries = 0;
    var iv = setInterval(function () {
      var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App || ++tries > 20) { clearInterval(iv); if (App) cb(App); }
    }, 100);
  }

  withApp(function (App) {
    // Cold start: the URL the app was launched with.
    try { App.getLaunchUrl().then(function (r) { if (r && r.url) routeFromUrl(r.url); }).catch(function () {}); } catch (e) {}
    // Warm: the app was already open when the link was tapped.
    try { App.addListener('appUrlOpen', function (ev) { if (ev && ev.url) routeFromUrl(ev.url); }); } catch (e) {}
  });
})();
