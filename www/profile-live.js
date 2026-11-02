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
  var SB_URL = window.RM_ENV.url;
  var SB_KEY = window.RM_ENV.anonKey;
  function client() {
    return window._sb || window.supabaseClient || window._supabase ||
      (window.supabase ? (window.__rmPLClient || (window.__rmPLClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }

  var cache = Object.create(null);   // id -> { full_name, avatar_url, sig, profile }

  // Every profile field any screen shows (2026-11-03: "any edit on the profile
  // appears in real time"). The event carries these (never contact / private
  // columns), and a change to ANY of them fires — while unrelated writes
  // (last_seen, show_active_status, push tokens…) never do.
  var FIELDS = ['full_name', 'nickname', 'username', 'avatar_url', 'cover_url', 'cover_transform',
    'bio', 'job_title', 'professional_type', 'brokerage', 'verified_as', 'is_verified', 'location',
    'relationship_status', 'division', 'business_group', 'team_name', 'years_experience', 'languages'];
  function pick(row) {
    var o = { id: row.id };
    FIELDS.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(row, f)) o[f] = row[f]; });
    return o;
  }
  function sigOf(row) {
    return JSON.stringify(FIELDS.map(function (f) { return row[f] == null ? '' : row[f]; }));
  }

  // Apply an incoming (or primed) value. Fires 'rm-profile-live' only when the
  // name or avatar actually changed vs. what we last knew, so a rerender or a
  // realtime reconnect echo never thrashes the DOM.
  // `row` (optional) is the full profile from realtime: then ANY shown field
  // changing fires, and the event's `profile` carries the fresh values.
  function _apply(id, full_name, avatar_url, silent, row) {
    if (!id) return;
    id = String(id);
    var prev = cache[id] || {};
    var next = {
      full_name:  (full_name  != null ? full_name  : prev.full_name),
      avatar_url: (avatar_url != null ? avatar_url : prev.avatar_url),
      sig: row ? sigOf(row) : prev.sig,
      profile: row ? pick(row) : prev.profile
    };
    var changed = (prev.full_name !== next.full_name) || (prev.avatar_url !== next.avatar_url)
      || (!!row && prev.sig !== next.sig);
    cache[id] = next;
    if (silent || !changed) return;
    try { window.dispatchEvent(new CustomEvent('rm-profile-live', { detail: { id: id, full_name: next.full_name, avatar_url: next.avatar_url, profile: next.profile || null } })); } catch (e) {}
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
          var before = cache[String(n.id)] && cache[String(n.id)].sig;
          _apply(n.id, n.full_name, n.avatar_url, false, n);
          if (before === sigOf(n)) return;     // nothing shown changed (e.g. last_seen)
          // Fan out to the OTHER same-origin documents on this device (the mobile
          // app-shell iframes: Home, Portal, Profile…) — only one of them may have
          // received the realtime event.
          try { localStorage.setItem('rm_profile_live', JSON.stringify({ id: String(n.id), full_name: n.full_name, avatar_url: n.avatar_url, profile: pick(n), t: Date.now() })); } catch (e) {}
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
    _apply(d.id, d.full_name, d.avatar_url, false, d.profile || null);
  });

  window.RMProfileLive = { prime: prime, get: get, cache: cache };
  if (document.readyState !== 'loading') _subscribe(); else document.addEventListener('DOMContentLoaded', _subscribe);
})();
