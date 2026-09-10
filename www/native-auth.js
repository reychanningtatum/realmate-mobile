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

  // ── Biometric helpers (Face ID / Touch ID) ─────────────────────────────
  // A pure GATE: verifyIdentity() only — never stores credentials/passwords.
  // Every call is defensive: if the plugin is missing or biometrics are
  // unavailable, callers fall back to normal password login (never a lockout).
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
      try { await B.verifyIdentity({ reason: reason || 'Log in to realmate', title: 'realmate', subtitle: '', description: '' }); return true; }
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
      try { if (on) await Pref.set({ key: BIO_KEY, value: '1' }); else await Pref.remove({ key: BIO_KEY }); } catch (e) {}
    }
  };
})();
