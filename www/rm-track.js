/* ============================================================================
 * rm-track.js — Nexus (realmate's intelligence engine): event-capture SDK
 * ----------------------------------------------------------------------------
 * DORMANT for the general production user base. TWO independent paths:
 *
 *  GLOBAL path (production-wide): gated by BEHAVIORAL_DATA_COLLECTION_ENABLED in
 *    this project's intelligence_config. In production that table doesn't exist,
 *    so this path is OFF — the general user base captures NOTHING.
 *
 *  TEST-USER path (Option B): ONLY for accounts on the Nexus test_user_allowlist.
 *    For a logged-in user, rm-track asks the TESTING project's `nexus-ingest`
 *    function once per session "am I allowlisted?" (the function verifies the
 *    production token server-side). If yes, that user's browsing events are sent
 *    to `nexus-ingest` (the nexus-testing project) — NEVER to production.
 *    If no, rm-track is completely inert for the session.
 *
 * Safety: rm-track never writes events directly to any DB. The ONLY writer is
 * `nexus-ingest`, which re-verifies the production token and re-checks the
 * allowlist server-side — so a non-allowlisted user (or a tampered rm-track)
 * cannot enter the Nexus dataset. See supabase/functions/nexus-ingest.
 *
 * All failures are swallowed: tracking never disrupts a user action.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co'; // production
  var SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';

  var HARD_DISABLE = false;   // emergency in-code kill switch; leave false
  var FLUSH_MS = 8000, MAX_BATCH = 25, TTL_MS = 10 * 60 * 1000;
  var MODE_CACHE_KEY = 'rm_track_mode_v2';   // 'test' | 'global' | 'off'

  var _mode = null;           // resolved capture mode
  var _resolving = null;
  var _sb = null;             // production client (auth/session + global insert)
  var _queue = [];
  var _timer = null;
  var _sessionId = null;
  var _prodToken = null;

  function _client() {
    if (_sb) return _sb;
    if (!global.supabase || !global.supabase.createClient) return null;
    try { _sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { _sb = null; }
    return _sb;
  }

  function _session() {
    if (_sessionId) return _sessionId;
    try {
      var s = sessionStorage.getItem('rm_session_id');
      if (!s) { s = 'sx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('rm_session_id', s); }
      _sessionId = s;
    } catch (e) { _sessionId = 'sx-' + Date.now().toString(36); }
    return _sessionId;
  }

  // The configured TESTING project (from nexus-env.js), or null if not set up.
  function _testingEnv() {
    try {
      var e = global.NEXUS_ENVIRONMENTS && global.NEXUS_ENVIRONMENTS.testing;
      return (e && e.url && e.anonKey) ? e : null;
    } catch (x) { return null; }
  }

  function _getProdToken() {
    if (_prodToken) return Promise.resolve(_prodToken);
    var sb = _client(); if (!sb) return Promise.resolve(null);
    return sb.auth.getSession()
      .then(function (r) { _prodToken = (r && r.data && r.data.session) ? r.data.session.access_token : null; return _prodToken; })
      .catch(function () { return null; });
  }

  // Decide the capture mode ONCE per session.
  function _resolveMode() {
    if (_mode) return Promise.resolve(_mode);
    if (_resolving) return _resolving;
    if (HARD_DISABLE) { _mode = 'off'; return Promise.resolve('off'); }

    try {
      var raw = sessionStorage.getItem(MODE_CACHE_KEY);
      if (raw) { var c = JSON.parse(raw); if (c && (Date.now() - c.t) < TTL_MS) { _mode = c.m; if (_mode !== 'off') _startFlush(); return Promise.resolve(_mode); } }
    } catch (e) {}

    _resolving = _resolveTestMode().then(function (isTest) {
      if (isTest) return 'test';
      return _resolveGlobalFlag().then(function (on) { return on ? 'global' : 'off'; });
    }).then(function (m) {
      _mode = m;
      try { sessionStorage.setItem(MODE_CACHE_KEY, JSON.stringify({ m: m, t: Date.now() })); } catch (e) {}
      if (m !== 'off') _startFlush();
      return m;
    }).catch(function () { _mode = 'off'; return 'off'; });

    return _resolving;
  }

  // TEST-USER: ask nexus-ingest (testing) whether the logged-in prod user is
  // allowlisted. The function verifies the token + allowlist server-side.
  function _resolveTestMode() {
    var env = _testingEnv(); if (!env) return Promise.resolve(false);
    return _getProdToken().then(function (token) {
      if (!token) return false;
      return fetch(env.url + '/functions/v1/nexus-ingest', {
        method: 'POST',
        headers: { apikey: env.anonKey, Authorization: 'Bearer ' + env.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-allowlist', prodToken: token })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return !!(j && j.allowlisted); })
        .catch(function () { return false; });
    });
  }

  // GLOBAL: production-wide collection flag (OFF/absent in production).
  function _resolveGlobalFlag() {
    var sb = _client(); if (!sb) return Promise.resolve(false);
    return sb.from('intelligence_config').select('value').eq('key', 'BEHAVIORAL_DATA_COLLECTION_ENABLED').single()
      .then(function (r) { var v = r && r.data ? r.data.value : false; return (v === true || v === 'true'); })
      .catch(function () { return false; });
  }

  function _startFlush() { if (_timer) return; try { _timer = setInterval(flush, FLUSH_MS); } catch (e) {} }

  function flush() {
    if (_mode === 'test') return _flushTest();
    if (_mode === 'global') return _flushGlobal();
  }

  // TEST path: POST to nexus-ingest (testing). The function attributes events to
  // the server-verified user id; anything the browser claims is ignored.
  function _flushTest() {
    if (!_queue.length) return;
    var env = _testingEnv(); if (!env) return;
    var batch = _queue.splice(0, MAX_BATCH);
    _getProdToken().then(function (token) {
      if (!token) return;
      fetch(env.url + '/functions/v1/nexus-ingest', {
        method: 'POST',
        headers: { apikey: env.anonKey, Authorization: 'Bearer ' + env.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ingest', prodToken: token, session_id: _session(), events: batch })
      }).catch(function () {});
    });
  }

  // GLOBAL path: direct insert to this project's behavioral_events (dormant in prod).
  function _flushGlobal() {
    if (!_queue.length) return;
    var sb = _client(); if (!sb) return;
    var rows = _queue.splice(0, MAX_BATCH).map(function (e) {
      return {
        user_id: null, session_id: _session(), event_type: e.event_type,
        listing_id: e.listing_id, post_id: e.post_id, developer: e.developer,
        project: e.project, target_user_id: e.target_user_id, duration_ms: e.duration_ms,
        query: e.query, filters: e.filters, metadata: e.metadata
      };
    });
    try { sb.from('behavioral_events').insert(rows).then(function () {}).catch(function () {}); } catch (e) {}
  }

  function _enqueue(eventType, payload) {
    if (_mode === 'off') return;
    _queue.push({
      event_type: String(eventType),
      listing_id: payload.listing_id != null ? String(payload.listing_id) : null,
      post_id: payload.post_id != null ? payload.post_id : null,
      developer: payload.developer || null,
      project: payload.project || null,
      target_user_id: payload.target_user_id || null,
      duration_ms: payload.duration_ms != null ? payload.duration_ms : null,
      query: payload.query || null,
      filters: payload.filters || null,
      metadata: payload.metadata || null,
      lf: payload.lf || null
    });
    if (_queue.length >= MAX_BATCH) flush();
  }

  /**
   * emit(eventType, payload) — record a behavioural event.
   * No-op for everyone except allowlisted test users (Option B) or if the
   * global flag is on. Safe to call anywhere: `window.RMTrack && RMTrack.emit(...)`.
   * payload (all optional): listing_id, post_id, developer, project,
   * target_user_id, duration_ms, query, filters, metadata, lf (listing features).
   */
  function emit(eventType, payload) {
    if (HARD_DISABLE) return;
    payload = payload || {};
    if (_mode) { _enqueue(eventType, payload); return; }
    _resolveMode().then(function () { _enqueue(eventType, payload); });
  }

  try {
    global.addEventListener('pagehide', function () { flush(); });
    if (global.document) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'hidden') flush();
      });
    }
  } catch (e) {}

  global.RMTrack = {
    emit: emit,
    flush: flush,
    isEnabled: function () { return _mode === 'test' || _mode === 'global'; },
    _debug: function () { return { mode: _mode, queued: _queue.length }; }
  };
})(typeof window !== 'undefined' ? window : this);
