// search-sync.js — Account-backed sync for Recent Searches (window.RMSearchSync).
//
// Search history used to live ONLY in each device's localStorage, so a search
// made on mobile never showed up on desktop (and vice-versa). This module mirrors
// every history "bucket" to a per-user row in Supabase (public.search_history),
// so the list follows the user's ACCOUNT across devices.
//
// It is purely ADDITIVE and best-effort: localStorage stays the instant cache and
// the source of truth for rendering; this layer pushes local writes up (debounced)
// and lets callers pull+merge the account copy down when the search UI opens.
// Everything no-ops for guests/anon and on any network/table/permission error, so
// the existing behavior is never broken — it only gains cross-device sync.
//
// Buckets are stable, per-SYSTEM+context strings WITHOUT the user id (the row's
// user_id column scopes them per account):
//   overlay (search-overlay.js): 'so_feed' | 'so_forum' | 'so_notifications'
//   RMSearchHistory (search-history.js): 'rm_shist_portal' | 'rm_shist_feed'
(function () {
  var URL_ = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
  var KEY_ = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
  var CAP = 20;                 // stored per bucket; UI caps lower on its own
  var _sb = null, _readyP = null, _timers = {};
  // Real-time fan-out: instant same-device propagation (BroadcastChannel, across
  // tabs AND app-shell iframes) + cross-device via Supabase Realtime. _handlers get
  // (bucket, entries) whenever a change arrives from ANOTHER context/device.
  var _handlers = [], _bc = null, _rtInited = false;
  try { _bc = ('BroadcastChannel' in window) ? new BroadcastChannel('rm-search-sync') : null; } catch (e) { _bc = null; }

  function uid() {
    try { var u = JSON.parse(localStorage.getItem('user') || 'null'); return (u && u.id) ? String(u.id) : null; }
    catch (e) { return null; }
  }
  // The access token the app's MAIN Supabase client keeps fresh in localStorage
  // (sb-<ref>-auth-token, flat or under { currentSession }). We authenticate every
  // request with THIS token rather than letting our own client manage a session.
  function _storedToken() {
    try {
      var raw = localStorage.getItem('sb-wmegpgrfrtprhuzmgjma-auth-token');
      if (!raw) return null;
      var j = JSON.parse(raw);
      var s = (j && j.currentSession) ? j.currentSession : j;
      return (s && s.access_token) ? s.access_token : null;
    } catch (e) { return null; }
  }
  // Push the current token to the realtime socket so postgres_changes pass RLS.
  // Safe to call repeatedly (e.g. after the main client refreshes the token).
  function _reauthRealtime() {
    try { if (_sb && _sb.realtime && _storedToken()) _sb.realtime.setAuth(_storedToken()); } catch (e) {}
  }
  function client() {
    if (_sb) return _sb;
    if (!window.supabase || !window.supabase.createClient) return null;
    // CRITICAL: authenticate via the `accessToken` callback — it returns the MAIN
    // client's already-refreshed token for every PostgREST/realtime call. The old
    // code let THIS client manage its own GoTrue session (getSession), which, with
    // multiple GoTrueClient instances under one storage key, could lose a cold-start
    // race and stay anonymous forever — so pull() returned [] for EVERY bucket and
    // realtime got no events (RLS rejects anon). accessToken has no session to race
    // and never contends on refresh-token rotation (it only READS the token).
    try {
      _sb = window.supabase.createClient(URL_, KEY_, {
        accessToken: function () { return Promise.resolve(_storedToken()); }
      });
      _reauthRealtime();
    } catch (e) { _sb = null; }
    return _sb;
  }
  // accessToken authenticates per-request, so the client is usable as soon as it
  // exists — no getSession/setSession handshake to await.
  // CRITICAL: never CACHE a null client. This module is loaded BEFORE
  // vendor/supabase-js on several pages, so the first ready()/initRealtime() (fired
  // synchronously when search-history.js registers its onRemote handler) runs while
  // window.supabase is still undefined → client() returns null. Caching that null
  // (the old bug) made pull() return [] for every bucket forever, with no request.
  // We only cache _readyP once a real client exists; otherwise we retry next call.
  function ready() {
    var sb = client();
    if (!sb) return Promise.resolve(null);
    if (!_readyP) _readyP = Promise.resolve(sb);
    return _readyP;
  }

  // Union two entry lists newest-first, by identity (keyFn), keeping the copy with
  // the larger `ts`. Entries without `ts` (legacy) sort after those that have one.
  function merge(a, b, keyFn) {
    var idx = {}, out = [];
    (a || []).concat(b || []).forEach(function (e) {
      if (!e) return;
      var k;
      try { k = keyFn(e); } catch (_) { return; }
      if (idx[k] != null) {
        if ((e.ts || 0) > (out[idx[k]].ts || 0)) out[idx[k]] = e;
        return;
      }
      idx[k] = out.length; out.push(e);
    });
    out.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return out;
  }

  // Dispatch a remote change to every registered handler.
  function emit(bucket, entries) {
    if (!bucket) return;
    var e = Array.isArray(entries) ? entries : [];
    _handlers.forEach(function (h) { try { h(bucket, e); } catch (_) {} });
  }
  // BroadcastChannel: another tab/iframe (same device, same user) changed a bucket.
  if (_bc) _bc.onmessage = function (ev) {
    var d = ev && ev.data;
    if (d && d.bucket && String(d.uid) === String(uid())) emit(d.bucket, d.entries || []);
  };
  // localStorage 'storage' events are a fallback for browsers without BroadcastChannel
  // (they fire in OTHER same-origin tabs/iframes when a search-history key changes).
  try {
    window.addEventListener('storage', function (ev) {
      if (!ev || !ev.key) return;
      var m = ev.key.match(/^rm_shist_([a-z]+)_(.+)$/) || ev.key.match(/^so_([a-z]+)_search_history_(.+)$/);
      if (!m) return;
      var isOverlay = ev.key.indexOf('_search_history_') !== -1;
      var bucket = (isOverlay ? 'so_' : 'rm_shist_') + m[1];
      if (String(m[2]) !== String(uid())) return;
      var entries = []; try { entries = JSON.parse(ev.newValue || '[]') || []; } catch (_) {}
      emit(bucket, entries);
    });
  } catch (e) {}
  // Cross-device: subscribe to this user's search_history rows (best-effort; needs the
  // table in the supabase_realtime publication). Idempotent, lazy, once.
  function initRealtime() {
    if (_rtInited) return; var id = uid(); if (!id) return;
    var sb = client();
    // supabase-js not loaded yet (this file runs before it on some pages) → bail
    // WITHOUT marking done, so a later pull()/push() retries the subscription.
    if (!sb || !sb.channel) return;
    _rtInited = true;
    try {
      _reauthRealtime();   // make sure the socket carries the JWT before subscribing
      sb.channel('search_history_' + id)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'search_history', filter: 'user_id=eq.' + id },
          function (payload) {
            var row = (payload && payload.new) || (payload && payload.old) || {};
            var entries = (payload && payload.new && payload.new.entries) || [];
            if (row.bucket) emit(row.bucket, Array.isArray(entries) ? entries : []);
          })
        .subscribe();
      // Keep the realtime socket's JWT current after the main client refreshes it
      // (the token in localStorage rotates ~hourly); cheap and safe to re-assert.
      try {
        document.addEventListener('visibilitychange', function () { if (!document.hidden) _reauthRealtime(); });
        window.addEventListener('focus', _reauthRealtime);
        setInterval(_reauthRealtime, 240000);
      } catch (e) {}
    } catch (e) {}
  }

  window.RMSearchSync = {
    merge: merge,
    enabled: function () { return !!uid() && !!client(); },
    // Register a handler h(bucket, entries) fired on real-time remote changes.
    onRemote: function (h) { if (typeof h === 'function') { _handlers.push(h); initRealtime(); } },
    // Fetch the account's stored entries for a bucket. Resolves [] on any miss.
    pull: function (bucket) {
      var id = uid();
      if (!id) return Promise.resolve([]);
      initRealtime();   // retry the realtime subscribe now that supabase-js is surely loaded
      return ready().then(function (sb) {
        if (!sb) return [];
        return sb.from('search_history').select('entries')
          .eq('user_id', id).eq('bucket', bucket).maybeSingle()
          .then(function (r) { var e = r && r.data && r.data.entries; return Array.isArray(e) ? e : []; },
                function () { return []; });
      });
    },
    // Upsert the bucket's entries for this user. Debounced per bucket, unless
    // `immediate` (deletes/clear) — those fire the upsert right away so the account
    // row reflects the removal before any reload can pull the pre-delete list back.
    push: function (bucket, entries, immediate) {
      var id = uid();
      if (!id) return;
      initRealtime();   // retry the realtime subscribe now that supabase-js is surely loaded
      // Instant same-device fan-out to other tabs/iframes (no wait for the DB round-trip).
      if (_bc) { try { _bc.postMessage({ uid: id, bucket: bucket, entries: (entries || []).slice(0, CAP) }); } catch (e) {} }
      var doUpsert = function () {
        return ready().then(function (sb) {
          if (!sb) return;
          try {
            return sb.from('search_history').upsert(
              { user_id: id, bucket: bucket, entries: (entries || []).slice(0, CAP), updated_at: new Date().toISOString() },
              { onConflict: 'user_id,bucket' }
            ).then(function () {}, function () {});
          } catch (e) {}
        });
      };
      clearTimeout(_timers[bucket]);
      if (immediate) {
        // Immediate writes (a search just SELECTED, or a delete/clear) must survive the
        // page navigation that selecting a result triggers — a normal fetch would be
        // cancelled mid-flight and the save would be lost. Fire a raw PostgREST upsert
        // with keepalive:true (browsers let it complete after the page unloads), and
        // also do the SDK upsert as a belt-and-suspenders fallback.
        try {
          var tok = _storedToken();
          if (tok) {
            fetch(URL_ + '/rest/v1/search_history?on_conflict=user_id,bucket', {
              method: 'POST', keepalive: true,
              headers: {
                'apikey': KEY_, 'Authorization': 'Bearer ' + tok,
                'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
              },
              body: JSON.stringify([{ user_id: id, bucket: bucket, entries: (entries || []).slice(0, CAP), updated_at: new Date().toISOString() }])
            }).catch(function () {});
          }
        } catch (e) {}
        return doUpsert();
      }
      _timers[bucket] = setTimeout(doUpsert, 400);
    }
  };
})();
