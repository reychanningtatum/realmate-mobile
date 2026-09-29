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
  function write(scope, arr, immediate) {
    var capped = arr.slice(0, CAP);
    try { localStorage.setItem(storeKey(scope), JSON.stringify(capped)); } catch (e) {}
    // Mirror the write up to the account so other devices see it. `immediate` skips the
    // debounce — used for deletes/clear so the account row is updated at once and a
    // quick reload can't pull the pre-delete list back.
    _mutatedAt[scope] = Date.now();
    try { if (window.RMSearchSync) window.RMSearchSync.push(bucketOf(scope), capped, immediate); } catch (e) {}
  }

  // ── TOMBSTONES (feed only) ─────────────────────────────────────────────────
  // Deletions are recorded as { key: ts } so a NON-destructive union merge can still
  // honour them: an entry is dropped if a tombstone for its key is at least as new as
  // the entry. This is what lets Feed sync MERGE (never replace/shrink) the account
  // row — so a refresh, an empty account, or a stale device can NEVER wipe a saved
  // search — while a real delete/Clear-All still sticks and propagates.
  var TOMB_CAP = 60;
  function tombKey(scope) { return 'rm_shtomb_' + scope + '_' + currentUid(); }
  function tombBucket(scope) { return 'rm_shtomb_' + scope; }
  function readTomb(scope) {
    try { var o = JSON.parse(localStorage.getItem(tombKey(scope)) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  }
  // The account stores the tombstone map as an array [{k,ts}] (search_history.entries
  // is a jsonb array). Convert both ways.
  function tombToArr(map) { var a = []; for (var k in map) { if (map.hasOwnProperty(k)) a.push({ k: k, ts: map[k] }); } return a; }
  function arrToTomb(arr) { var m = {}; (arr || []).forEach(function (x) { if (x && x.k != null) m[x.k] = Math.max(m[x.k] || 0, x.ts || 0); }); return m; }
  function mergeTomb(a, b) {
    var m = {}, k;
    for (k in a) if (a.hasOwnProperty(k)) m[k] = a[k];
    for (k in b) if (b.hasOwnProperty(k)) m[k] = Math.max(m[k] || 0, b[k] || 0);
    // Bound growth: keep the most recent TOMB_CAP tombstones.
    var keys = Object.keys(m);
    if (keys.length > TOMB_CAP) {
      keys.sort(function (x, y) { return m[y] - m[x]; }).slice(TOMB_CAP).forEach(function (x) { delete m[x]; });
    }
    return m;
  }
  function writeTomb(scope, map, immediate) {
    try { localStorage.setItem(tombKey(scope), JSON.stringify(map)); } catch (e) {}
    try { if (window.RMSearchSync) window.RMSearchSync.push(tombBucket(scope), tombToArr(map), immediate); } catch (e) {}
  }
  // Drop entries that a tombstone (>= the entry's ts) says were deleted.
  function applyTomb(list, map) {
    return (list || []).filter(function (e) {
      var t = map[keyOf(e)];
      return !(t && t >= (e.ts || 0));
    });
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

  // ── One-time FEED migration: fold the legacy overlay bucket 'so_feed' (older app
  // builds wrote Feed searches there) into the authoritative 'rm_shist_feed', then
  // CLEAR so_feed so it can never resurrect a deleted entry again. After this runs,
  // Feed reads only rm_shist_feed (account-authoritative), so deletes stick. Runs once
  // per user; merges the account row (not just local) so no device wipes another's adds.
  function migrateFeed(done) {
    done = done || function () {};
    var sync = window.RMSearchSync;
    var flag = 'rm_feed_migrated_' + currentUid();
    if (!sync || !sync.enabled() || currentUid() === 'anon') { done(); return; }
    try { if (localStorage.getItem(flag) === '1') { done(); return; } } catch (e) {}
    Promise.all([
      sync.pull('rm_shist_feed').then(function (r) { return r || []; }, function () { return []; }),
      sync.pull('so_feed').then(function (r) {
        return (r || []).map(function (e) { return _normLegacy(e, 'so_feed'); }).filter(Boolean);
      }, function () { return []; })
    ]).then(function (res) {
      var merged = sync.merge(sync.merge(res[0], res[1], keyOf), read('feed'), keyOf).slice(0, CAP);
      try { localStorage.setItem(storeKey('feed'), JSON.stringify(merged)); } catch (e) {}
      // AWAIT the account write so the account-authoritative pull that follows sees the
      // migrated data (rather than racing an empty row). Then retire so_feed.
      Promise.resolve(sync.push('rm_shist_feed', merged, true)).then(function () {
        sync.push('so_feed', [], true);           // retire the legacy bucket → no more resurrection
        try { localStorage.setItem(flag, '1'); } catch (e) {}
        done();
      }, function () { try { localStorage.setItem(flag, '1'); } catch (e) {} done(); });
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
      // Feed: re-adding un-deletes — drop any tombstone for this key so the merge
      // won't filter the freshly-added entry back out.
      if (scope === 'feed') {
        var tomb = readTomb('feed');
        if (tomb[k] != null) { delete tomb[k]; writeTomb('feed', tomb, true); }
      }
      // The account row is a non-destructive UNION (see _syncFeed / onRemote), so a
      // plain local write + push can never wipe entries already on the account. Local
      // is durable (localStorage), so the entry also survives a refresh regardless of
      // whether the push completes before navigation.
      write(scope, arr, true);
    },
    // Remove one entry by its keyOf() value. For Feed, record a tombstone so the delete
    // sticks through the non-destructive merge (and propagates to other devices).
    remove: function (scope, key) {
      if (scope === 'feed') {
        var tomb = readTomb('feed'); tomb[key] = Date.now(); writeTomb('feed', tomb, true);
      }
      write(scope, read(scope).filter(function (e) { return keyOf(e) !== key; }), true);
    },
    clear: function (scope) {
      if (scope === 'feed') {
        var tomb = readTomb('feed');
        read('feed').forEach(function (e) { tomb[keyOf(e)] = Date.now(); });
        writeTomb('feed', tomb, true);
      }
      write(scope, [], true);
    },
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
      // Feed pulls BOTH its current bucket (rm_shist_feed) AND the legacy overlay
      // bucket (so_feed) that older app builds still write to, so a Feed search
      // made on a not-yet-updated device still shows up (and syncs to desktop).
      if (scope === 'feed') { this._syncFeed(cb); return; }
      this._syncCore(scope, cb);
    },
    // Feed sync — NON-DESTRUCTIVE union + tombstones. We UNION the account list with
    // the durable local cache (so a refresh, an empty account, or a stale device can
    // never wipe a saved search), then drop anything a tombstone marks as deleted (so
    // real deletes / Clear-All still stick and propagate). The merged result is written
    // back to the account, healing it. This replaces the account-authoritative model,
    // which kept wiping saved searches whenever the account row was momentarily empty.
    _syncFeed: function (cb) {
      cb = cb || function () {};
      // One-time: fold legacy so_feed into rm_shist_feed + retire so_feed, THEN sync.
      migrateFeed(function () { RMSearchHistory._syncFeedCore(cb); });
    },
    _syncFeedCore: function (cb) {
      cb = cb || function () {};
      var sync = window.RMSearchSync;
      if (!sync || !sync.enabled()) { cb(read('feed')); return; }
      var now = Date.now();
      if (_syncedAt['feed'] && (now - _syncedAt['feed']) < SYNC_TTL) { cb(read('feed')); return; }
      _syncedAt['feed'] = now;
      Promise.all([
        sync.pull('rm_shist_feed').then(function (r) { return Array.isArray(r) ? r : []; }, function () { return []; }),
        sync.pull('rm_shtomb_feed').then(function (r) { return arrToTomb(r); }, function () { return {}; })
      ]).then(function (res) {
        var remoteList = res[0], remoteTomb = res[1];
        var tomb = mergeTomb(readTomb('feed'), remoteTomb);
        var union = sync.merge(read('feed'), remoteList, keyOf);   // local + account, newest ts
        var next = applyTomb(union, tomb).slice(0, CAP);
        try { localStorage.setItem(storeKey('feed'), JSON.stringify(next)); } catch (e) {}
        try { localStorage.setItem(tombKey('feed'), JSON.stringify(tomb)); } catch (e) {}
        // Heal the account with the reconciled result (and the merged tombstones).
        sync.push('rm_shist_feed', next);
        sync.push('rm_shtomb_feed', tombToArr(tomb));
        cb(next);
      }, function () { cb(read('feed')); });
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
        if (!bucket) return;
        // FEED tombstone changed on another device (a delete / Clear-All): merge the
        // tombstones and re-filter the local feed list so the deletion appears live.
        if (bucket === 'rm_shtomb_feed') {
          var tomb = mergeTomb(readTomb('feed'), arrToTomb(entries));
          try { localStorage.setItem(tombKey('feed'), JSON.stringify(tomb)); } catch (e) {}
          try { localStorage.setItem(storeKey('feed'), JSON.stringify(applyTomb(read('feed'), tomb).slice(0, CAP))); } catch (e) {}
          try { window.dispatchEvent(new CustomEvent('rmsh-remote', { detail: { scope: 'feed' } })); } catch (e) {}
          return;
        }
        if (bucket.indexOf('rm_shist_') !== 0) return;
        var scope = bucket.slice('rm_shist_'.length);
        if (scope === 'feed') {
          // FEED is NON-DESTRUCTIVE. Deletions travel as TOMBSTONES (rm_shtomb_feed),
          // never as an empty list — so an EMPTY remote list carries no authority and is
          // IGNORED. This is what stops an old account-authoritative build (or any stale
          // device) from wiping saved searches by pushing []. A non-empty remote list is
          // UNION-merged in (so a remote add appears live), then tombstoned entries drop.
          var incoming = entries || [];
          if (!incoming.length) return;   // empty push = no info → never shrink local
          var merged = applyTomb(window.RMSearchSync.merge(read('feed'), incoming, keyOf), readTomb('feed')).slice(0, CAP);
          try { localStorage.setItem(storeKey('feed'), JSON.stringify(merged)); } catch (e) {}
          try { window.dispatchEvent(new CustomEvent('rmsh-remote', { detail: { scope: 'feed' } })); } catch (e) {}
          return;
        }
        // Other scopes (Portal 'recent', forum, notifications): unchanged — the account
        // row replaces the local cache so their deletes propagate as before.
        try { localStorage.setItem(storeKey(scope), JSON.stringify((entries || []).slice(0, CAP))); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('rmsh-remote', { detail: { scope: scope } })); } catch (e) {}
      });
    }
  } catch (e) {}
})();
