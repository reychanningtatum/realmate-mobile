// native-auth.js — Native session persistence + biometric login helpers for the
// Realmate Capacitor app. Pure no-op on the web (localStorage already persists
// there and there is no native bridge). MUST be the FIRST <script> on a page,
// before vendor/supabase-js, so the localStorage token mirror is installed
// before any Supabase client reads or writes the session.
//
// Why this exists: on iOS the Supabase session lives in WKWebView localStorage,
// which iOS can evict on app termination / storage pressure — that is why users
// were being logged out after a while. We mirror the session token to native
// Preferences (UserDefaults) and restore it on cold start. No password is ever
// stored; only Supabase's own refresh/access token, exactly as before, just in a
// durable place.
(function () {
  var TOKEN_KEY = 'sb-wmegpgrfrtprhuzmgjma-auth-token';
  var BIO_KEY = 'rm_biometric_enabled';
  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  function plugin(n) { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n]) || null; }

  // ── Session persistence ────────────────────────────────────────────────
  if (!isNative) {
    window.rmSessionReady = Promise.resolve();
  } else {
    var Pref = plugin('Preferences');
    var rawSet = localStorage.setItem.bind(localStorage);
    if (Pref) {
      var rawRem = localStorage.removeItem.bind(localStorage);
      var rawClr = localStorage.clear.bind(localStorage);
      // Mirror every write/removal of the Supabase token to native Preferences.
      // Removals/clear MUST propagate too, otherwise a signed-out token would be
      // resurrected on the next launch (the "can't log out" bug).
      localStorage.setItem = function (k, v) { rawSet(k, v); if (k === TOKEN_KEY) { try { Pref.set({ key: TOKEN_KEY, value: v }); } catch (e) {} } };
      localStorage.removeItem = function (k) { rawRem(k); if (k === TOKEN_KEY) { try { Pref.remove({ key: TOKEN_KEY }); } catch (e) {} } };
      localStorage.clear = function () { rawClr(); try { Pref.remove({ key: TOKEN_KEY }); } catch (e) {} };
    }
    // Cold-start restore: if native has the token but localStorage lost it, put
    // it back (via the RAW setter, to avoid a redundant mirror write) before any
    // client calls getSession(). auth-guard.js and attemptAutoLogin() await this.
    window.rmSessionReady = (async function () {
      if (!Pref) return;
      try {
        var cur = localStorage.getItem(TOKEN_KEY), nativeVal = null;
        try { nativeVal = (await Pref.get({ key: TOKEN_KEY })).value; } catch (e) {}
        if (!cur && nativeVal) rawSet(TOKEN_KEY, nativeVal);
        else if (cur && !nativeVal) { try { await Pref.set({ key: TOKEN_KEY, value: cur }); } catch (e) {} }
      } catch (e) {}
    })();
  }

  // ── Biometric login (Face ID / Touch ID) ───────────────────────────────
  // Biometrics is ONLY a sign-in convenience — never a gate when reopening an
  // already-authenticated session (the persistent session above handles that).
  // When enabled, the username+password are kept in the iOS KEYCHAIN via the
  // plugin (encrypted, device-secure — never plain text), so a Face ID sign-in
  // can restore a session that has genuinely expired. Everything is defensive:
  // a missing plugin / unavailable biometrics just falls back to password login.
  var BIO_SERVER = 'com.realmate.app';
  var BIO_HASCREDS_KEY = 'rm_bio_has_creds';
  function bioTypeName(t) { t = Number(t); if (t === 1) return 'Touch ID'; if (t === 2) return 'Face ID'; return 'biometrics'; }
  window.rmBio = {
    isNative: isNative,
    // True only when the native plugin exists AND the device has biometrics enrolled.
    available: async function () {
      var B = plugin('NativeBiometric');
      if (!isNative || !B) return false;
      try { var r = await B.isAvailable(); return !!(r && r.isAvailable); } catch (e) { return false; }
    },
    typeName: async function () {
      var B = plugin('NativeBiometric');
      if (!isNative || !B) return 'biometrics';
      try { var r = await B.isAvailable(); return bioTypeName(r && r.biometryType); } catch (e) { return 'biometrics'; }
    },
    // Prompts Face ID / Touch ID. Resolves true on success, false on cancel/fail.
    verify: async function (reason) {
      var B = plugin('NativeBiometric');
      if (!isNative || !B) return false;
      try { await B.verifyIdentity({ reason: reason || 'Sign in to realmate', title: 'realmate', subtitle: '', description: '' }); return true; }
      catch (e) { return false; }
    },
    isEnabled: async function () {
      var Pref = plugin('Preferences');
      if (!isNative || !Pref) return false;
      try { return (await Pref.get({ key: BIO_KEY })).value === '1'; } catch (e) { return false; }
    },
    setEnabled: async function (on) {
      var Pref = plugin('Preferences');
      if (!isNative || !Pref) return;
      try {
        if (on) { await Pref.set({ key: BIO_KEY, value: '1' }); }
        else { await Pref.remove({ key: BIO_KEY }); await this.clearCredentials(); }
      } catch (e) {}
    },
    // Store username+password in the iOS Keychain (used only for a future Face ID
    // sign-in). Records a flag so we can offer the button without prompting.
    saveCredentials: async function (username, password) {
      var B = plugin('NativeBiometric'), Pref = plugin('Preferences');
      if (!isNative || !B || !username || !password) return;
      try { await B.setCredentials({ username: username, password: password, server: BIO_SERVER });
            if (Pref) await Pref.set({ key: BIO_HASCREDS_KEY, value: '1' }); } catch (e) {}
    },
    hasCredentials: async function () {
      var Pref = plugin('Preferences');
      if (!isNative || !Pref) return false;
      try { return (await Pref.get({ key: BIO_HASCREDS_KEY })).value === '1'; } catch (e) { return false; }
    },
    // Read the stored credentials. Call verify() FIRST — this just reads Keychain.
    getCredentials: async function () {
      var B = plugin('NativeBiometric');
      if (!isNative || !B) return null;
      try { var c = await B.getCredentials({ server: BIO_SERVER }); return (c && c.username) ? c : null; } catch (e) { return null; }
    },
    clearCredentials: async function () {
      var B = plugin('NativeBiometric'), Pref = plugin('Preferences');
      if (!isNative) return;
      try { if (B) await B.deleteCredentials({ server: BIO_SERVER }); } catch (e) {}
      try { if (Pref) await Pref.remove({ key: BIO_HASCREDS_KEY }); } catch (e) {}
    }
  };

  // ── iOS push notifications (APNs) registration ──────────────────────────
  // Phase 1 of the central push system: after auth is confirmed, ask the OS for
  // notification permission, register with APNs, and hand the resulting device
  // token to the push-register Edge Function (which stores it against the signed-in
  // user via the caller's JWT — no PII, only the opaque token). Pure no-op on web,
  // when the plugin is missing, or when the user denies permission. It NEVER blocks
  // or affects auth or any existing feature — fully best-effort, all errors swallowed.
  var PUSH_REGISTER_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co/functions/v1/push-register';
  var PUSH_APIKEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
  var _pushWired = false;   // add the plugin listeners only once per app launch
  var _pushToken = null;    // last APNs token seen this launch
  var _pushAuth = null;     // last known access token, so a late 'registration' event can still post
  function _postPushToken(token) {
    if (!token || !_pushAuth) return;
    try {
      fetch(PUSH_REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': PUSH_APIKEY, 'Authorization': 'Bearer ' + _pushAuth },
        body: JSON.stringify({ token: token, platform: 'ios' })
      }).catch(function () {});
    } catch (e) {}
  }
  // Map a push payload → a shell destination and apply it when the shell is ready.
  // Deep-links to the SPECIFIC item where possible via the shell's rmOpen(tab, url):
  //   • message  → chat.html?conversation=<id>   (opens that conversation)
  //   • ai_match → listing-detail.html?id=<id>   (opens that listing, in the me frame)
  //   • follow / realmate / like / mention → the Notifications tab
  // Tabs: home / chat / portal / notifications / me.
  function _pushNavigate(data) {
    if (!data) return;
    // Capacitor hands us the notification's userInfo. Our routing fields are sent at
    // the top level now, but older payloads nested them under `data` — support both.
    var d = data;
    if (d.data && typeof d.data === 'object' && (d.data.route || d.data.tab || d.data.kind || d.data.conversation_id || d.data.listing_id)) d = d.data;

    var route = d.tab || d.route;
    var tab = (route === 'chat') ? 'chat'
      : (route === 'portal') ? 'portal'
      : (route === 'notifications') ? 'notifications'
      : (route === 'home' || route === 'feed') ? 'home'
      : (route === 'me' || route === 'profile') ? 'me' : null;

    // Specific-item deep link (opens the exact conversation / match in its frame).
    var openTab = null, openUrl = null;
    if (d.conversation_id) {
      openTab = 'chat'; openUrl = 'chat.html?conversation=' + encodeURIComponent(d.conversation_id);
    } else if (d.kind === 'ai_match' && d.listing_id) {
      // AI match: open the Portal's AI Matches view and green-flash the exact match.
      // livemarket.js consumes rm_push_match on load → openMatchForListing().
      try { localStorage.setItem('rm_push_match', String(d.listing_id)); } catch (e) {}
      openTab = 'portal'; openUrl = 'livemarket.html';
    } else if (d.listing_id) {
      openTab = 'me'; openUrl = 'listing-detail.html?id=' + encodeURIComponent(d.listing_id);
    }

    if (!tab && !openTab) return;
    try { localStorage.setItem('rm_push_nav', JSON.stringify({ tab: tab, openTab: openTab, openUrl: openUrl })); } catch (e) {}
    _applyPushNav(0);
  }
  function _applyPushNav(tries) {
    var nav = null;
    try { nav = JSON.parse(localStorage.getItem('rm_push_nav') || 'null'); } catch (e) {}
    if (!nav || (!nav.tab && !nav.openTab)) return;
    // rmTab / rmOpen live on the top-level shell (app.html / app-shell.js).
    var shell = (typeof window.rmTab === 'function') ? window
      : (function () { try { return (window.top && typeof window.top.rmTab === 'function') ? window.top : null; } catch (e) { return null; } })();
    if (shell) {
      try { localStorage.removeItem('rm_push_nav'); } catch (e) {}
      try {
        if (nav.openTab && nav.openUrl && typeof shell.rmOpen === 'function') shell.rmOpen(nav.openTab, nav.openUrl);
        else if (nav.tab) shell.rmTab(nav.tab);
        else if (nav.openTab) shell.rmTab(nav.openTab);
      } catch (e) {}
      return;
    }
    if ((tries || 0) < 30) setTimeout(function () { _applyPushNav((tries || 0) + 1); }, 200); // poll ~6s for the shell
  }
  window.rmPush = {
    isNative: isNative,
    // Call after auth: (userId used only as a presence guard; the token is bound
    // to the user server-side via accessToken). Safe to call on every shell load.
    register: async function (userId, accessToken) {
      var P = plugin('PushNotifications');
      if (!isNative || !P || !userId || !accessToken) return;
      _pushAuth = accessToken;
      try {
        var perm = null;
        try { perm = await P.checkPermissions(); } catch (e) {}
        if (!perm || perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          try { perm = await P.requestPermissions(); } catch (e) {}
        }
        if (!perm || perm.receive !== 'granted') return;   // respect the user's choice; try again next launch

        if (!_pushWired) {
          _pushWired = true;
          try {
            P.addListener('registration', function (t) {
              _pushToken = (t && t.value) || null;
              _postPushToken(_pushToken);
            });
          } catch (e) {}
          try { P.addListener('registrationError', function () {}); } catch (e) {}
          // Tap on a push (lock screen / banner / Notification Center) → deep-link
          // to the relevant tab. iOS delivers a cold-launch tap here once listeners
          // are attached, so a stored route is applied as soon as the shell is ready.
          try {
            P.addListener('pushNotificationActionPerformed', function (ev) {
              try { _pushNavigate(ev && ev.notification && ev.notification.data); } catch (e) {}
            });
          } catch (e) {}
          // Foreground receipt: iOS does NOT banner while the app is open, so there's
          // nothing to suppress; the app's own realtime already updates the UI.
          try { P.addListener('pushNotificationReceived', function () {}); } catch (e) {}
        }
        try { await P.register(); } catch (e) {}
        // If a token already arrived earlier this launch, (re)send with the fresh token.
        if (_pushToken) _postPushToken(_pushToken);
        // Apply any deep-link route stored by a cold-launch tap that fired before
        // the tab shell (window.rmTab) was ready.
        _applyPushNav(0);
      } catch (e) {}
    }
  };
})();
