/* ============================================================================
 * rm-bugs.js — automatic bug reports
 * ----------------------------------------------------------------------------
 * Catches errors the user runs into and sends them to the report_bugs RPC
 * (bug-reports-migration.sql), where they are GROUPED per distinct bug for
 * Admin › Bug Reports.
 *
 * Captured automatically:
 *   • uncaught errors and unhandled promise rejections
 *   • console.error (code that caught an error and logged it)
 *   • 5xx responses from our own Supabase backend
 * Each report carries the last ~20 breadcrumbs (page views, taps, failed
 * requests, warnings) so the root cause can be traced.
 *
 * Cost: each distinct bug is sent ONCE per page session (fingerprint dedup),
 * at most 15 per session, batched into ONE request (≤10 items) a few seconds
 * after the first error or on page hide. Known browser noise is dropped.
 * Uses plain fetch to PostgREST — no supabase-js dependency, so it also works
 * on pages where supabase-js fails to load.
 *
 * Privacy: ON by default; the user can switch it off in Settings (stored per
 * device in localStorage 'rm_bug_reports' = '0'). Never sends input values,
 * on-screen text, logged object contents, query strings or URL hashes; emails,
 * phones, ids, tokens and keys are redacted from everything that is sent.
 *
 * Public API (window.RMBugs):
 *   capture(errOrMessage, extra?)  — report a handled error explicitly
 *   report(note)                   — user-submitted "Report a problem" (always
 *                                    sent; returns a Promise<boolean>)
 *   watchTransition(vt)            — report a cancelled view transition
 *   isEnabled() / setEnabled(bool)
 * ==========================================================================*/
(function (global) {
  'use strict';
  if (global.RMBugs) return;   // loaded twice on a page → keep the first

  var SUPABASE_URL = window.RM_ENV.url;
  var SUPABASE_KEY = window.RM_ENV.anonKey;
  // admin.html keeps its own sign-in (RM_BUGS_AUTH_KEY) so its reports are credited to the admin.
  var AUTH_KEY = window.RM_BUGS_AUTH_KEY || window.RM_ENV.authTokenKey;
  var RPC_URL = SUPABASE_URL + '/rest/v1/rpc/report_bugs';
  var PREF_KEY = 'rm_bug_reports';
  var APP_VERSION = '20261014c';

  var MAX_PER_SESSION = 15, MAX_BATCH = 10, FLUSH_MS = 4000, MAX_CRUMBS = 20;

  var _queue = [], _seen = {}, _sent = 0, _timer = null, _crumbs = [];

  // Errors we never want to pay for: browser/extension noise, offline blips.
  // MSG_NOISE is matched against the message alone (exact browser wording, so an
  // app log like "[Feed] load failed:" is still reported); SRC_NOISE anywhere.
  var MSG_NOISE = [
    /^Script error\.?$/i,                     // cross-origin, no detail available
    /^(\w+: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)$/i,
    /^(\w+: )?(The operation was aborted\.?|The user aborted a request\.?|signal is aborted without reason)$/i,
    /^ResizeObserver loop/i,
    /^Non-Error promise rejection captured/i
  ];
  var SRC_NOISE = /chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:|webkit-masked-url:/i;

  function enabled() {
    try { return localStorage.getItem(PREF_KEY) !== '0'; } catch (e) { return true; }   // default ON
  }

  function platform() {
    try {
      var cap = global.Capacitor;
      if (cap && cap.isNativePlatform && cap.isNativePlatform()) return cap.getPlatform ? cap.getPlatform() : 'native';
    } catch (e) {}
    return 'web';
  }

  // Path only — never the query string or hash.
  function page() {
    try { return (location.pathname || '/').slice(0, 200); } catch (e) { return ''; }
  }

  function clip(s, n) { s = s == null ? '' : String(s); return s.length > n ? s.slice(0, n) : s; }

  // Redact personal data / secrets before anything leaves the device: emails,
  // JWTs and bearer tokens, API keys, long opaque tokens, phone numbers.
  function scrub(s) {
    if (s == null) return s;
    return String(s)
      .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '<jwt>')
      .replace(/(bearer\s+|access_token["':=\s]+|refresh_token["':=\s]+|apikey["':=\s]+|password["':=\s]+)[^\s"',}]+/gi, '$1<redacted>')
      .replace(/\b(sb_(publishable|secret)_|sbp_|sk-)[\w-]{8,}/g, '<key>')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
      .replace(/(\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '<phone>')
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '<token>');
  }

  // Strip URLs' query/hash and cache-bust (?v=) so the same bug groups across deploys.
  function cleanUrl(u) { return String(u || '').replace(/[?#][^\s)]*/g, ''); }

  function crumb(type, msg) {
    try {
      _crumbs.push({ t: Date.now(), type: type, msg: clip(scrub(msg), 160) });
      if (_crumbs.length > MAX_CRUMBS) _crumbs.shift();
    } catch (e) {}
  }

  // Normalise a message for grouping: numbers, ids and urls vary per occurrence.
  function norm(msg) {
    return String(msg || '')
      .replace(/https?:\/\/\S+/g, '<url>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
      .replace(/\d+/g, '#')
      .slice(0, 200);
  }

  function topFrame(stack) {
    var lines = String(stack || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/:\d+/.test(l) && l.indexOf('rm-bugs.js') === -1) return cleanUrl(l).replace(/:\d+(:\d+)?/g, '').trim().slice(0, 160);
    }
    return '';
  }

  // FNV-1a 32-bit → hex. Tiny, fast, good enough to group.
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function context(extra) {
    var c = {
      ua: clip(navigator.userAgent, 300),
      lang: navigator.language,
      online: navigator.onLine,
      vw: global.innerWidth, vh: global.innerHeight,
      embedded: (function () { try { return global.self !== global.top; } catch (e) { return true; } })(),
      at: new Date().toISOString(),
      crumbs: _crumbs.slice()
    };
    if (extra && typeof extra === 'object') {
      try { var ex = {}; Object.keys(extra).slice(0, 12).forEach(function (k) { var v = extra[k]; if (v == null || typeof v !== 'object') ex[k] = typeof v === 'string' ? clip(scrub(v), 200) : v; }); c.extra = ex; } catch (e) {}
    }
    return c;
  }

  function enqueue(kind, message, stack, extra, note) {
    message = clip(scrub(message), 500);
    stack = scrub(stack);
    var fpSrc = kind + '|' + norm(message) + '|' + topFrame(stack) + '|' + (kind === 'http' ? '' : page());
    var fp = kind === 'manual' ? 'manual-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
                               : kind + '-' + hash(fpSrc) + hash(fpSrc.split('').reverse().join(''));
    if (_seen[fp]) return;           // once per page session
    if (kind !== 'manual' && _sent + _queue.length >= MAX_PER_SESSION) return;
    _seen[fp] = 1;
    _queue.push({
      fingerprint: fp, kind: kind, message: message || '(no message)',
      stack: clip(cleanUrl(stack), 4000) || null,
      page: page(), platform: platform(), app_version: APP_VERSION,
      context: context(extra), note: note ? clip(scrub(note), 2000) : null
    });
    if (!_timer) _timer = setTimeout(flush, FLUSH_MS);
  }

  function token() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      var s = raw && JSON.parse(raw);
      var t = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
      var exp = s && (s.expires_at || (s.currentSession && s.currentSession.expires_at));
      if (t && (!exp || exp * 1000 > Date.now() + 5000)) return t;
    } catch (e) {}
    return null;
  }

  function post(items, keepalive) {
    var t = token();
    var send = function (auth) {
      return _origFetch(RPC_URL, {
        method: 'POST', keepalive: !!keepalive,
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + (auth || SUPABASE_KEY), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      });
    };
    return send(t).then(function (r) {
      // Expired/invalid session → still deliver, just without a user.
      if (r.status === 401 && t) return send(null);
      return r;
    }).then(function (r) { return r.ok; }, function () { return false; });
  }

  function flush(keepalive) {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (!_queue.length) return Promise.resolve(true);
    var batch = (enabled() ? _queue : _queue.filter(function (q) { return q.kind === 'manual'; })).slice(0, MAX_BATCH);
    // keepalive requests (page hide) are capped at 64 KB by the browser — send
    // only what fits; the rest stays queued for the next flush.
    if (keepalive === true) {
      var size = 20, fit = [];
      for (var i = 0; i < batch.length; i++) {
        var len = JSON.stringify(batch[i]).length + 1;
        if (size + len > 60000) break;
        size += len; fit.push(batch[i]);
      }
      batch = fit;
    }
    _queue = _queue.filter(function (q) { return batch.indexOf(q) === -1 && (enabled() || q.kind === 'manual'); });
    if (!batch.length) return Promise.resolve(true);
    _sent += batch.filter(function (q) { return q.kind !== 'manual'; }).length;
    var p = post(batch, keepalive === true);
    if (_queue.length) _timer = setTimeout(flush, FLUSH_MS);
    return p;
  }

  function isNoise(msg, src) {
    var m = String(msg || '').trim();
    for (var i = 0; i < MSG_NOISE.length; i++) if (MSG_NOISE[i].test(m)) return true;
    return SRC_NOISE.test(m + ' ' + String(src || ''));
  }

  // Summarise a non-Error object WITHOUT its data (it may be a listing, a chat
  // message or a profile): keep only error-shaped fields, else just its keys.
  function describe(o) {
    try {
      var f = ['code', 'status', 'name', 'message', 'details', 'hint', 'error', 'error_description'];
      var out = [];
      for (var i = 0; i < f.length; i++) {
        var v = o[f[i]];
        if (v != null && typeof v !== 'object') out.push(f[i] + '=' + clip(String(v), 160));
      }
      if (out.length) return '{' + out.join(', ') + '}';
      return '{keys: ' + Object.keys(o).slice(0, 12).join(',') + '}';
    } catch (e) { return '{object}'; }
  }

  function fromError(kind, err, extra) {
    if (!enabled()) return;
    var msg, stack;
    if (err && typeof err === 'object') {
      msg = (err.name && err.message) ? err.name + ': ' + err.message : (err.message || err.error_description || err.msg || '');
      if (!msg) msg = describe(err);
      stack = err.stack || '';
    } else { msg = String(err); stack = ''; }
    if (isNoise(msg, stack)) return;
    enqueue(kind, msg, stack, extra);
  }

  // ── Automatic capture ─────────────────────────────────────────────────────
  global.addEventListener('error', function (ev) {
    try {
      if (!ev) return;
      // Resource load failures (img/script) bubble here without .error — record, don't report.
      if (ev.target && ev.target !== global && ev.target.tagName) {
        crumb('resource', ev.target.tagName.toLowerCase() + ' failed ' + cleanUrl(ev.target.src || ev.target.href || ''));
        return;
      }
      var err = ev.error || { message: ev.message, stack: (ev.filename ? cleanUrl(ev.filename) + ':' + ev.lineno + ':' + ev.colno : '') };
      if (isNoise(ev.message, ev.filename)) return;
      fromError('error', err);
    } catch (e) {}
  }, true);

  global.addEventListener('unhandledrejection', function (ev) {
    try { fromError('rejection', ev && ev.reason); } catch (e) {}
  });

  // View transitions (safe-area.css @view-transition between pages, and the app
  // shell's startViewTransition between tabs) are cosmetic: when the browser
  // cancels one (next page doesn't opt in, tab hidden, viewport resized) the
  // page still loads, but the transition's `ready` promise rejects with nobody
  // listening ("AbortError: Transition was skipped"). Handle it here and report
  // it as a labelled "View transition skipped" entry: still reported, grouped
  // per page and reason, instead of arriving as an unhandled rejection.
  // A cancelled transition can reject up to three promises — ready, and (when its
  // update is aborted, e.g. a cross-page swap) updateCallbackDone and finished.
  // Each is handled the same way; identical reports group into one entry.
  function watchTransition(vt) {
    try {
      if (!vt) return;
      var report = function (r) {
        try {
          if (!enabled()) return;
          // A genuine error thrown by the page's own update (e.g. a TypeError in
          // the app shell's tab switch) is a real crash — report it as one, not
          // under the "skipped" label.
          var name = r && typeof r === 'object' ? r.name : '';
          if (name !== 'AbortError' && name !== 'InvalidStateError') { fromError('rejection', r); return; }
          var why = name + ': ' + (r.message || '');
          enqueue('console', 'View transition skipped (' + why + ')', r.stack || '');
        } catch (e) {}
      };
      ['ready', 'updateCallbackDone', 'finished'].forEach(function (k) {
        var p = vt[k];
        if (p && typeof p.catch === 'function') p.catch(report);
      });
    } catch (e) {}
  }
  global.addEventListener('pagereveal', function (ev) { watchTransition(ev && ev.viewTransition); });
  global.addEventListener('pageswap', function (ev) { watchTransition(ev && ev.viewTransition); });

  // console.error → report; console.warn → breadcrumb only.
  try {
    var _cErr = console.error, _cWarn = console.warn;
    console.error = function () {
      try {
        if (enabled()) {
          var args = Array.prototype.slice.call(arguments);
          var errObj = null, parts = [];
          args.forEach(function (a) {
            if (a instanceof Error) { errObj = errObj || a; parts.push(a.name + ': ' + a.message); }
            else if (a && typeof a === 'object') parts.push(describe(a));
            else parts.push(String(a));
          });
          var msg = parts.join(' ');
          if (!isNoise(msg, errObj && errObj.stack)) {
            enqueue('console', msg, errObj ? errObj.stack : (new Error().stack || '').split('\n').slice(2).join('\n'));
          }
        }
      } catch (e) {}
      return _cErr.apply(console, arguments);
    };
    console.warn = function () {
      try { crumb('warn', Array.prototype.slice.call(arguments).map(String).join(' ')); } catch (e) {}
      return _cWarn.apply(console, arguments);
    };
  } catch (e) {}

  // fetch: 5xx from OUR backend = internal error; 4xx/failed = breadcrumb.
  var _origFetch = global.fetch ? global.fetch.bind(global) : null;
  if (_origFetch) {
    global.fetch = function (input, init) {
      var url = '', method = 'GET';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; method = (init && init.method) || (input && input.method) || 'GET'; } catch (e) {}
      var p = _origFetch(input, init);
      if (url.indexOf('/rpc/report_bugs') !== -1) return p;
      var label = method.toUpperCase() + ' ' + cleanUrl(url).replace(SUPABASE_URL, '');
      p.then(function (r) {
        try {
          if (r.status >= 400) crumb('http', label + ' → ' + r.status);
          if (r.status >= 500 && url.indexOf(SUPABASE_URL) === 0 && enabled()) {
            enqueue('http', 'HTTP ' + r.status + ' ' + label, '', { status: r.status });
          }
        } catch (e) {}
      }, function (err) { crumb('http', label + ' failed: ' + (err && err.message)); });
      return p;
    };
  } else {
    _origFetch = function () { return Promise.reject(new Error('fetch unavailable')); };
  }

  // Breadcrumbs: what the user did just before the error.
  crumb('nav', page());
  try {
    document.addEventListener('click', function (ev) {
      try {
        var el = ev.target && ev.target.closest ? ev.target.closest('button,a,[onclick],[role="button"],.mob-nav-item') : null;
        if (!el) return;
        // Never the element's visible text (it can be a person's name or message);
        // only developer-set identifiers: id, aria-label, onclick handler name, icon.
        var aria = (el.getAttribute('aria-label') || '').slice(0, 40);
        var oc = ((el.getAttribute('onclick') || '').match(/^[\w.$]+/) || [''])[0].slice(0, 40);
        var ic = el.querySelector && el.querySelector('i[class*="fa-"]');
        var icon = ic ? ((ic.className.match(/fa-(?!solid|regular|brands|fw)[\w-]+/) || [''])[0]) : '';
        var href = el.tagName === 'A' ? cleanUrl(el.getAttribute('href') || '').slice(0, 60) : '';
        crumb('tap', el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (oc ? ' ' + oc + '()' : '') +
              (icon ? ' [' + icon + ']' : '') + (href ? ' ' + href : '') + (aria ? ' "' + aria + '"' : ''));
      } catch (e) {}
    }, true);
  } catch (e) {}
  global.addEventListener('hashchange', function () { crumb('nav', page()); });
  global.addEventListener('pagehide', function () { flush(true); });
  try {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  } catch (e) {}

  global.RMBugs = {
    capture: function (err, extra) { try { fromError('error', err, extra); } catch (e) {} },
    report: function (note) {
      var n = clip(String(note || '').trim(), 2000);
      if (!n) return Promise.resolve(false);
      enqueue('manual', 'User report: ' + clip(n.replace(/\s+/g, ' '), 120), '', null, n);
      return flush();
    },
    watchTransition: watchTransition,
    isEnabled: enabled,
    setEnabled: function (on) {
      try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (e) {}
      if (!on) _queue = _queue.filter(function (q) { return q.kind === 'manual'; });
    },
    _debug: function () { return { queued: _queue.length, sent: _sent, crumbs: _crumbs.length }; }
  };
})(window);
