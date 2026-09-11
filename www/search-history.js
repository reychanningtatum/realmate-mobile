// search-history.js — Per-user, persistent search history for Portal and Feed.
// Stored in localStorage keyed by the current user's id, so it survives navigation,
// refresh, logout/login (same user → same history), and reopening the app, and each
// user on a device keeps their own. Portal ('portal') and Feed ('feed') are separate
// scopes. No DB/migration needed (free-tier friendly). Exposes window.RMSearchHistory.
(function () {
  var CAP = 12;   // most-recent N terms per scope

  function currentUid() {
    try {
      var u = JSON.parse(localStorage.getItem('user') || 'null');
      return (u && u.id) ? String(u.id) : 'anon';
    } catch (e) { return 'anon'; }
  }
  function storeKey(scope) { return 'rm_shist_' + scope + '_' + currentUid(); }
  function read(scope) {
    try { var a = JSON.parse(localStorage.getItem(storeKey(scope)) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function write(scope, arr) {
    try { localStorage.setItem(storeKey(scope), JSON.stringify(arr.slice(0, CAP))); } catch (e) {}
  }

  window.RMSearchHistory = {
    // Newest-first list of terms for a scope.
    list: function (scope) { return read(scope); },
    // Record a committed search term (case-insensitive dedupe, moved to front).
    add: function (scope, term) {
      term = (term || '').trim();
      if (!term) return;
      var arr = read(scope).filter(function (t) { return t.toLowerCase() !== term.toLowerCase(); });
      arr.unshift(term);
      write(scope, arr);
    },
    // Remove a single term.
    remove: function (scope, term) {
      var lc = String(term || '').toLowerCase();
      write(scope, read(scope).filter(function (t) { return t.toLowerCase() !== lc; }));
    },
    // Clear all terms for a scope.
    clear: function (scope) { write(scope, []); }
  };
})();
