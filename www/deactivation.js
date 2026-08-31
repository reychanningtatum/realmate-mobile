/* deactivation.js — RMDeact
 * Hide DEACTIVATED accounts everywhere (feed, portal, profile, search).
 * A profile is deactivated (hidden) when profiles.deactivated = true AND its
 * optional auto-reactivation time (reactivate_at) hasn't passed yet. Once
 * reactivate_at passes the account is active again by lazy expiry — even before
 * the owner logs back in (login also clears the flag, in script.js).
 *
 * Everything here FAILS OPEN: any query error, missing client, or DB without the
 * deactivation columns leaves every account visible, so this can never blank out
 * the app. Deactivation state is queried per-surface for the bounded set of
 * authors/owners on screen (same shape as RMPriv.postAccessSet).
 */
(function () {
  'use strict';
  var SB_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
  var SB_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';

  function sb() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window._sb) return window._sb;
    if (window._supabase) return window._supabase;
    if (window.supabase && window.supabase.createClient) {
      return window.__rmDeactClient || (window.__rmDeactClient = window.supabase.createClient(SB_URL, SB_KEY));
    }
    return null;
  }

  // True when this profile row represents an account that should be hidden.
  function _hidden(p) {
    if (!p || !p.deactivated) return false;
    if (!p.reactivate_at) return true;              // deactivated with no auto-return
    return new Date(p.reactivate_at).getTime() > Date.now(); // still within the window
  }

  // Given a list of user ids, resolve the Set of ids that are ACTIVE (safe to
  // show). Unknown / un-queried ids default to active (fail-open).
  async function filterActive(ids) {
    var out = new Set(), uniq = [], seen = {};
    (ids || []).forEach(function (i) {
      var s = i && String(i);
      if (s && !seen[s]) { seen[s] = 1; uniq.push(s); }
    });
    uniq.forEach(function (s) { out.add(s); });
    if (!uniq.length) return out;
    try {
      var c = sb(); if (!c) return out;
      var r = await c.from('profiles').select('id,deactivated,reactivate_at').in('id', uniq);
      if (r.error) return out;                        // e.g. columns not migrated → show all
      (r.data || []).forEach(function (p) { if (_hidden(p)) out.delete(String(p.id)); });
    } catch (e) { /* fail open */ }
    return out;
  }

  // The complementary set: which of these ids are DEACTIVATED (hidden). Handy
  // for synchronous surfaces that preload once then filter (e.g. the Portal).
  async function deactivatedSet(ids) {
    var hidden = new Set(), uniq = [], seen = {};
    (ids || []).forEach(function (i) {
      var s = i && String(i);
      if (s && !seen[s]) { seen[s] = 1; uniq.push(s); }
    });
    if (!uniq.length) return hidden;
    try {
      var c = sb(); if (!c) return hidden;
      var r = await c.from('profiles').select('id,deactivated,reactivate_at').in('id', uniq);
      if (r.error) return hidden;
      (r.data || []).forEach(function (p) { if (_hidden(p)) hidden.add(String(p.id)); });
    } catch (e) { /* fail open → empty hidden set */ }
    return hidden;
  }

  // Single-profile check (profile page).
  async function isDeactivated(id) {
    if (!id) return false;
    try {
      var c = sb(); if (!c) return false;
      var r = await c.from('profiles').select('deactivated,reactivate_at').eq('id', id).maybeSingle();
      if (r.error) return false;
      return _hidden(r.data);
    } catch (e) { return false; }
  }

  // Keep only items whose owner (item[idField], default 'user_id') is active.
  async function filterItemsByOwner(items, idField) {
    idField = idField || 'user_id';
    var list = items || [];
    var ids = list.map(function (x) { return x && x[idField]; }).filter(Boolean);
    if (!ids.length) return list;
    var active = await filterActive(ids);
    return list.filter(function (x) { return !x[idField] || active.has(String(x[idField])); });
  }

  window.RMDeact = {
    filterActive: filterActive,
    deactivatedSet: deactivatedSet,
    isDeactivated: isDeactivated,
    filterItemsByOwner: filterItemsByOwner
  };
})();
