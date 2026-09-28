// search-history.js — Per-user, persistent Recent Searches for Portal and Feed.
// Stored in localStorage keyed by the current user's id, so it survives navigation,
// refresh, logout/login (same user → same history) and app reopen; each user on a
// device keeps their own. Portal ('portal') and Feed ('feed') are separate scopes.
//
// Entries are ENTITY objects the user actually opened from search — not just the
// typed text — so Recent Searches can show the real person/account (with profile
// picture) or post/listing (with thumbnail) that was clicked:
//   { type:'person', id, label:<name>, sub:<job>,   img:<avatar url> }
//   { type:'post',   id, label:<snippet>, sub:<poster>, img:<thumbnail url|''> }
//   { type:'query',  label:<typed text> }                    // plain text search
// Legacy string entries (older builds saved raw terms) are tolerated and shown as
// 'query' rows. No DB/migration needed. Exposes window.RMSearchHistory.
(function () {
  var CAP = 12;
  // Cross-device sync bookkeeping (see search-sync.js). _syncedAt throttles the
  // account pull to once per open; _mutatedAt lets an in-flight pull skip its
  // merge-write if the user changed the list meanwhile (so a just-removed entry
  // can't be resurrected). Both keyed by scope.
  var _syncedAt = {}, _mutatedAt = {}, SYNC_TTL = 5000;

  function currentUid() {
    try { var u = JSON.parse(localStorage.getItem('user') || 'null'); return (u && u.id) ? String(u.id) : 'anon'; }
    catch (e) { return 'anon'; }
  }
  function storeKey(scope) { return 'rm_shist_' + scope + '_' + currentUid(); }
  function bucketOf(scope) { return 'rm_shist_' + scope; }   // account-store bucket (no uid)

  // Stable identity for dedupe/removal: type + id (entities) or type + label (queries).
  function keyOf(e) {
    if (!e) return '';
    var t = e.type || 'query';
    var id = (e.id != null && e.id !== '') ? e.id : (e.label || '');
    return t + ':' + String(id).toLowerCase();
  }

  function read(scope) {
    try {
      var a = JSON.parse(localStorage.getItem(storeKey(scope)) || '[]');
      if (!Array.isArray(a)) return [];
      return a
        .map(function (e) { return (typeof e === 'string') ? { type: 'query', label: e } : e; })
        .filter(function (e) { return e && (e.label || e.type === 'post' || e.type === 'listing'); });
    } catch (e) { return []; }
  }
  function write(scope, arr) {
    var capped = arr.slice(0, CAP);
    try { localStorage.setItem(storeKey(scope), JSON.stringify(capped)); } catch (e) {}
    // Mirror the write up to the account so other devices see it.
    _mutatedAt[scope] = Date.now();
    try { if (window.RMSearchSync) window.RMSearchSync.push(bucketOf(scope), capped); } catch (e) {}
  }

  // Initials for the CSS avatar fallback (no external service needed).
  function initials(label) {
    var parts = String(label || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Encode a URL so it is safe inside a single-quoted CSS url('...') in a style attr.
  function cssUrl(u) { return String(u || '').replace(/[\\'"()\s]/g, encodeURIComponent); }

  // ── One-time migration for the PORTAL only: fold Portal's legacy history bucket
  // ('rm_shist_portal') into its current 'recent' bucket, so existing Portal recents
  // appear (and sync) on a device whose local cache is empty (e.g. desktop). Normalizes
  // legacy types: 'profile'→'person', and Portal's listings (stored as 'post')→'listing'.
  // IMPORTANT: this must NEVER pull Feed buckets — Feed search history (scope 'feed') is
  // a completely separate system and folding it in here would leak Feed searches into the
  // Portal's recent list. Runs once per user.
  function _normLegacy(e, fromBucket) {
    if (!e) return null;
    var t = e.type || 'query';
    if (t === 'profile') t = 'person';
    if (fromBucket === 'rm_shist_portal' && t === 'post') t = 'listing';   // Portal 'post' == listing
    return { type: t, id: e.id, label: e.label, sub: e.sub, img: e.img, src: e.src, ts: e.ts || 0 };
  }
  function migrateRecent(done) {
    done = done || function () {};
    var sync = window.RMSearchSync;
    var flag = 'rm_recent_migrated_' + currentUid();
    if (!sync || !sync.enabled() || currentUid() === 'anon') { done(); return; }
    try { if (localStorage.getItem(flag) === '1') { done(); return; } } catch (e) {}
    // CRITICAL: pull the account 'recent' too and MERGE it in — otherwise this
    // device's one-time migration would OVERWRITE the account row and wipe items
    // other devices already added (the bug that broke cross-device sync).
    // Portal-only buckets: NEVER include Feed's ('so_feed' / 'rm_shist_feed') here —
    // Feed and Portal search histories are independent and must not cross-contaminate.
    var buckets = ['rm_shist_recent', 'rm_shist_portal'];
    Promise.all(buckets.map(function (b) {
      return sync.pull(b).then(function (r) { return { b: b, r: r || [] }; }, function () { return { b: b, r: [] }; });
    })).then(function (results) {
      var acc = read('recent');   // local
      results.forEach(function (x) {
        (x.r || []).forEach(function (e) {
          // 'rm_shist_recent' entries are already in the unified shape; only legacy
          // buckets need normalizing (profile→person, Portal 'post'→listing).
          var n = (x.b === 'rm_shist_recent') ? e : _normLegacy(e, x.b);
          if (n) acc.push(n);
        });
      });
      var merged = sync.merge(acc, [], keyOf).slice(0, CAP);
      try { localStorage.setItem(storeKey('recent'), JSON.stringify(merged)); } catch (e) {}
      sync.push('rm_shist_recent', merged);
      try { localStorage.setItem(flag, '1'); } catch (e) {}
      done();
    }, function () { done(); });
  }

  window.RMSearchHistory = {
    keyOf: keyOf,
    initials: initials,
    // Media chip for a recent entry, rendered with CSS background-image over a
    // CSS-drawn fallback (initials for people, an icon for posts). No <img> element
    // and no external avatar service, so a failed/missing image can NEVER show the
    // iOS broken-image glyph — it just reveals the fallback beneath. `opts.postIcon`
    // sets the FontAwesome class for post fallbacks (default fa-store).
    mediaHTML: function (e, opts) {
      opts = opts || {};
      if (e && e.type === 'person') {
        var layer = e.img ? '<span class="rs-av-img" style="background-image:url(\'' + cssUrl(e.img) + '\')"></span>' : '';
        return '<span class="rs-av"><span class="rs-av-ini">' + escHtml(initials(e.label)) + '</span>' + layer + '</span>';
      }
      if (e && (e.type === 'post' || e.type === 'listing')) {
        var picon = opts.postIcon || (e.type === 'listing' ? 'fa-house' : 'fa-file-lines');
        var tlayer = e.img ? '<span class="rs-thumb-img" style="background-image:url(\'' + cssUrl(e.img) + '\')"></span>' : '';
        return '<span class="rs-thumb"><span class="rs-thumb-ic"><i class="fas ' + picon + '"></i></span>' + tlayer + '</span>';
      }
      return '<span class="rs-query"><i class="fas fa-clock-rotate-left"></i></span>';
    },
    list: function (scope) { return read(scope); },
    // Record an opened entity (or a typed query). Accepts a string (→ query) or an
    // entry object. Dedupes by identity and moves it to the front.
    add: function (scope, entry) {
      if (!entry) return;
      if (typeof entry === 'string') entry = { type: 'query', label: entry };
      entry = {
        type:  entry.type || 'query',
        id:    (entry.id != null ? String(entry.id) : undefined),
        label: (entry.label || '').toString().trim(),
        sub:   (entry.sub || '').toString().trim() || undefined,
        img:   entry.img || undefined,
        src:   entry.src || undefined,   // feed-post source ('home'|'forum') so it re-opens correctly
        ts:    Date.now()        // recency, for cross-device merge ordering
      };
      if (!entry.label && entry.type !== 'post' && entry.type !== 'listing') return;   // nothing to show
      var k = keyOf(entry);
      var arr = read(scope).filter(function (e) { return keyOf(e) !== k; });
      arr.unshift(entry);
      write(scope, arr);
    },
    // Remove one entry by its keyOf() value.
    remove: function (scope, key) {
      write(scope, read(scope).filter(function (e) { return keyOf(e) !== key; }));
    },
    clear: function (scope) { write(scope, []); },
    // Pull the account copy, merge it into the local cache, and persist the merge
    // back up — so this device shows searches made on other devices. Throttled to
    // once per SYNC_TTL (i.e. once per "open"), and it never resurrects an entry the
    // user removed while the pull was in flight. cb(mergedList) runs when done (also
    // synchronously when sync is unavailable/throttled). Safe to call on focus.
    migrateRecent: migrateRecent,
    sync: function (scope, cb) {
      cb = cb || function () {};
      // First time syncing the unified list, fold in legacy Feed/Portal history.
      if (scope === 'recent') {
        migrateRecent(function () { RMSearchHistory._syncCore(scope, cb); });
        return;
      }
      this._syncCore(scope, cb);
    },
    _syncCore: function (scope, cb) {
      cb = cb || function () {};
      var sync = window.RMSearchSync;
      if (!sync || !sync.enabled()) { cb(read(scope)); return; }
      var now = Date.now();
      if (_syncedAt[scope] && (now - _syncedAt[scope]) < SYNC_TTL) { cb(read(scope)); return; }
      _syncedAt[scope] = now;
      var startedAt = now;
      sync.pull(bucketOf(scope)).then(function (remote) {
        // User changed the list during the pull → keep local, push it, don't merge.
        if (_mutatedAt[scope] && _mutatedAt[scope] > startedAt) {
          sync.push(bucketOf(scope), read(scope)); cb(read(scope)); return;
        }
        var merged = sync.merge(remote, read(scope), keyOf).slice(0, CAP);
        try { localStorage.setItem(storeKey(scope), JSON.stringify(merged)); } catch (e) {}
        sync.push(bucketOf(scope), merged);
        cb(merged);
      }, function () { cb(read(scope)); });
    }
  };

  // Real-time: when another tab/iframe/device changes an 'rm_shist_<scope>' bucket,
  // write it into this device's cache and let the UI (home.js / livemarket.js) re-render
  // live. Writes localStorage DIRECTLY (not via write()) so it doesn't loop back out.
  try {
    if (window.RMSearchSync && window.RMSearchSync.onRemote) {
      window.RMSearchSync.onRemote(function (bucket, entries) {
        if (!bucket || bucket.indexOf('rm_shist_') !== 0) return;
        var scope = bucket.slice('rm_shist_'.length);
        try { localStorage.setItem(storeKey(scope), JSON.stringify((entries || []).slice(0, CAP))); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('rmsh-remote', { detail: { scope: scope } })); } catch (e) {}
      });
    }
  } catch (e) {}
})();
