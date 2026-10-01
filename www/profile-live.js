/* profile-live.js — RMProfileLive
 * ---------------------------------------------------------------------------
 * Real-time propagation of OTHER users' profile changes (full_name + avatar_url)
 * to anything currently showing them — specifically Search in Portal and Feed.
 *
 * auth-guard.js already subscribes to the CURRENT user's OWN profile row so their
 * avatar syncs across their devices. Search, however, renders OTHER members, and
 * nothing propagated their renames / new pictures to an already-open result list.
 * This module widens that exact same realtime architecture (a profiles
 * postgres_changes UPDATE subscription on the shared Supabase client) to any row
 * the viewer can SELECT, keeps a tiny {id -> {full_name, avatar_url}} cache as the
 * single current source of truth, and fires one 'rm-profile-live' event whenever a
 * shown member's profile actually changes. No polling, no setInterval, no reloads.
 *
 * Renderers (search.js, search-overlay.js, livemarket.js Portal) seed the cache
 * with prime(), read the freshest values with get(), and patch their visible rows
 * on 'rm-profile-live'. Fail-open: any load/realtime error simply means Search
 * keeps the (already fresh-at-fetch) snapshot it had.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';
  var SB_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
  var SB_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
  function client() {
    return window._sb || window.supabaseClient || window._supabase ||
      (window.supabase ? (window.__rmPLClient || (window.__rmPLClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }

  var cache = Object.create(null);   // id -> { full_name, avatar_url }

  // Apply an incoming (or primed) value. Fires 'rm-profile-live' only when the
  // name or avatar actually changed vs. what we last knew, so a rerender or a
  // realtime reconnect echo never thrashes the DOM.
  function _apply(id, full_name, avatar_url, silent) {
    if (!id) return;
    id = String(id);
    var prev = cache[id] || {};
    var next = {
      full_name:  (full_name  != null ? full_name  : prev.full_name),
      avatar_url: (avatar_url != null ? avatar_url : prev.avatar_url)
    };
    var changed = (prev.full_name !== next.full_name) || (prev.avatar_url !== next.avatar_url);
    cache[id] = next;
    if (silent || !changed) return;
    try { window.dispatchEvent(new CustomEvent('rm-profile-live', { detail: { id: id, full_name: next.full_name, avatar_url: next.avatar_url } })); } catch (e) {}
  }

  // Seed the cache from already-fetched results (silent — no event). Lets get()
  // return correct values immediately and makes the first realtime delta diff
  // against exactly what Search is showing.
  function prime(list) {
    (list || []).forEach(function (p) { if (p && p.id != null) _apply(p.id, p.full_name, p.avatar_url, true); });
  }
  function get(id) { return id != null ? cache[String(id)] : null; }

  var _subbed = false;
  async function _subscribe() {
    if (_subbed) return;
    var sb = client(); if (!sb || !sb.channel) return;
    _subbed = true;
    // Authenticate the realtime socket so RLS-gated postgres_changes are delivered
    // (same requirement as auth-guard's self subscription).
    try {
      var s = await sb.auth.getSession();
      var tok = s && s.data && s.data.session && s.data.session.access_token;
      if (tok && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(tok);
    } catch (e) {}
    try {
      sb.channel('profiles-live')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, function (payload) {
          var n = payload && payload.new; if (!n || n.id == null) return;
          _apply(n.id, n.full_name, n.avatar_url);
          // Fan out to the OTHER same-origin documents on this device (the mobile
          // app-shell iframes: Feed, Portal…), which may each render Search but
          // only one of them received the realtime event.
          try { localStorage.setItem('rm_profile_live', JSON.stringify({ id: String(n.id), full_name: n.full_name, avatar_url: n.avatar_url, t: Date.now() })); } catch (e) {}
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[ProfileLive] profiles realtime unavailable (' + status + ') — run profiles-realtime-migration.sql');
          }
        });
    } catch (e) { /* realtime optional */ }
  }

  // Cross-document (same device): an UPDATE received in ONE iframe reaches the
  // others — where Search may be rendered — via this storage ping. `storage` fires
  // only in OTHER documents, so there is no loop with the writer above.
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'rm_profile_live' || !ev.newValue) return;
    var d; try { d = JSON.parse(ev.newValue); } catch (e) { return; }
    if (!d || d.id == null) return;
    _apply(d.id, d.full_name, d.avatar_url);
  });

  window.RMProfileLive = { prime: prime, get: get, cache: cache };
  if (document.readyState !== 'loading') _subscribe(); else document.addEventListener('DOMContentLoaded', _subscribe);
})();
