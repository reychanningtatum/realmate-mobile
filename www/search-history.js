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

  function currentUid() {
    try { var u = JSON.parse(localStorage.getItem('user') || 'null'); return (u && u.id) ? String(u.id) : 'anon'; }
    catch (e) { return 'anon'; }
  }
  function storeKey(scope) { return 'rm_shist_' + scope + '_' + currentUid(); }

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
        .filter(function (e) { return e && (e.label || e.type === 'post'); });
    } catch (e) { return []; }
  }
  function write(scope, arr) {
    try { localStorage.setItem(storeKey(scope), JSON.stringify(arr.slice(0, CAP))); } catch (e) {}
  }

  window.RMSearchHistory = {
    keyOf: keyOf,
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
        img:   entry.img || undefined
      };
      if (!entry.label && entry.type !== 'post') return;   // nothing to show
      var k = keyOf(entry);
      var arr = read(scope).filter(function (e) { return keyOf(e) !== k; });
      arr.unshift(entry);
      write(scope, arr);
    },
    // Remove one entry by its keyOf() value.
    remove: function (scope, key) {
      write(scope, read(scope).filter(function (e) { return keyOf(e) !== key; }));
    },
    clear: function (scope) { write(scope, []); }
  };
})();
