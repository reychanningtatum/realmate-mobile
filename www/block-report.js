/* block-report.js — RMBR: user block + content report (App Store Guideline 1.2)
 * Loaded on UGC pages. Exposes window.RMBR:
 *   RMBR.isBlocked(id)         -> hide blocked users' content (mutual, exact account id)
 *   RMBR.blockUser(id, name)   -> block + hide going forward (name only labels the row)
 *   RMBR.unblockUser(id)       -> remove a block
 *   RMBR.listBlocked()         -> [{blocked_id, blocked_name, created_at}]
 *   RMBR.openReport({type, contentId, userId, userName})  -> report modal
 * Fail-open: any load error leaves nothing blocked (never hides the whole feed).
 */
(function () {
  'use strict';
  var SB_URL = window.RM_ENV.url;
  var SB_KEY = window.RM_ENV.anonKey;
  function client() {
    return window.supabaseClient || window._sb || window._supabase ||
      (window.supabase ? (window.__rmbrClient || (window.__rmbrClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }
  // ── The one block state every screen reads ──────────────────────────────
  // Source of truth: user_blocks (account ↔ account) and blocked_posts (single
  // items), in the database. Each page holds a copy here and every screen asks
  // isBlocked()/isPostBlocked() — by exact account id only, never by name.
  //
  // Keeping the copies current, without polling:
  //   • this page's own block/unblock → applied here at once;
  //   • other pages/tabs in the same browser → the rmbr_sync localStorage ping;
  //   • other devices/sessions, and the person on the other side → a realtime
  //     PRIVATE broadcast on 'rmbr-<accountId>' (only that account can listen) that
  //     only says "re-read". The receiving
  //     window reads user_blocks itself (under its own RLS) and passes the result
  //     on through rmbr_sync. Nothing about who blocked whom travels over the
  //     channel (database change events would broadcast every unblock to every
  //     listener — RLS doesn't apply to deletes), and a forged ping only causes
  //     a harmless re-read. One channel per top-level window (the app shell on
  //     the phone, each tab on the desktop).
  var blockedIds = new Set();     // accounts I blocked + accounts that blocked me
  var blockedPosts = new Set();   // keys "type:id" — individually hidden posts/listings
  var myId = null, ready = false;

  function myName() { try { var u = JSON.parse(localStorage.getItem('user') || '{}'); return (u && u.name) || null; } catch (e) { return null; } }

  // Announce a change: rmbr:changed HERE, plus the localStorage ping that the
  // OTHER same-origin pages (iframes, tabs) apply. The ping carries the whole
  // state so receivers never need to query for it.
  function _fire(detail) {
    detail = Object.assign({ me: myId, ids: Array.from(blockedIds), posts: Array.from(blockedPosts) }, detail);
    try { document.dispatchEvent(new CustomEvent('rmbr:changed', { detail: detail })); } catch (e) {}
    try { localStorage.setItem('rmbr_sync', JSON.stringify(Object.assign({ t: Date.now() }, detail))); } catch (e) {}
  }
  function _key() { return Array.from(blockedIds).sort().join(',') + '|' + Array.from(blockedPosts).sort().join(','); }

  // Read both block lists from the backend. Null on any failure (keep what we have).
  async function _readBackend(sb) {
    var q = await sb.from('user_blocks').select('blocker_id,blocked_id');
    if (!q || q.error) return null;
    var ids = new Set();
    (q.data || []).forEach(function (row) {
      if (row.blocker_id === myId && row.blocked_id) ids.add(row.blocked_id);
      if (row.blocked_id === myId && row.blocker_id) ids.add(row.blocker_id);   // they blocked me
    });
    var posts = new Set();
    try {
      var bp = await sb.from('blocked_posts').select('content_type,content_id').eq('blocker_id', myId);
      if (bp && bp.error) posts = new Set(blockedPosts);                         // fail-open: keep current
      else (bp.data || []).forEach(function (r) { if (r.content_id) posts.add(r.content_type + ':' + r.content_id); });
    } catch (e) { posts = new Set(blockedPosts); }
    return { ids: ids, posts: posts };
  }

  // Re-read the backend and swap the state in; announce only a real change.
  // Overlapping requests collapse into one extra read.
  var _syncing = false, _syncAgain = false;
  async function resync() {
    var sb = client(); if (!sb || !myId) return;
    if (_syncing) { _syncAgain = true; return; }
    _syncing = true;
    try {
      do {
        _syncAgain = false;
        var r = null; try { r = await _readBackend(sb); } catch (e) {}
        if (!r) break;
        var before = _key();
        blockedIds = r.ids; blockedPosts = r.posts;
        if (_key() !== before) _fire({ scope: 'sync' });
      } while (_syncAgain);
    } finally { _syncing = false; }
  }

  // ── Realtime: "your block list changed" pings ────────────────────────────
  // The channels are PRIVATE (realtime-private-blocks-migration.sql): only this
  // account can listen on 'rmbr-<its id>', so nobody else can watch when it
  // blocks or unblocks. Joining a private channel needs the signed-in session.
  var _chan = null;
  async function _listen() {
    var sb = client();
    if (_chan || !sb || !myId || !sb.channel) return;
    try { if (window.top !== window) return; } catch (e) { return; }   // the shell window listens for its frames
    try {
      var s = await sb.auth.getSession();
      var tok = s && s.data && s.data.session && s.data.session.access_token;
      if (!tok || _chan) return;
      if (sb.realtime && sb.realtime.setAuth) { try { await sb.realtime.setAuth(tok); } catch (e) {} }
      _chan = sb.channel('rmbr-' + myId, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, function () { resync(); })
        .subscribe();
    } catch (e) { _chan = null; }
  }
  function _unlisten() { var sb = client(); try { if (_chan && sb) sb.removeChannel(_chan); } catch (e) {} _chan = null; }
  // Tell every open session of these accounts to re-read (fire-and-forget).
  async function _ping(ids) {
    try {
      var sb = client(); var tok = SB_KEY;
      try { var s = await sb.auth.getSession(); if (s && s.data && s.data.session) tok = s.data.session.access_token; } catch (e) {}
      if (tok === SB_KEY) return;                       // private channels: signed-in senders only
      var msgs = ids.filter(Boolean).map(function (id) { return { topic: 'rmbr-' + id, event: 'changed', payload: {}, private: true }; });
      if (!msgs.length) return;
      await fetch(SB_URL + '/realtime/v1/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ messages: msgs })
      });
    } catch (e) {}
  }

  async function init() {
    var sb = client(); if (!sb) return;
    try { var r = await sb.auth.getUser(); myId = r && r.data && r.data.user ? r.data.user.id : null; } catch (e) {}
    if (!myId) { ready = true; return; }
    try { var st = await _readBackend(sb); if (st) { blockedIds = st.ids; blockedPosts = st.posts; } } catch (e) {}
    ready = true;
    document.dispatchEvent(new CustomEvent('rmbr:ready'));
    _listen();
  }
  // Pings missed while the app was asleep/backgrounded: re-read once on return.
  document.addEventListener('visibilitychange', function () {
    try { if (document.visibilityState === 'visible' && myId && window.top === window) resync(); } catch (e) {}
  });
  window.addEventListener('pagehide', _unlisten);
  window.addEventListener('pageshow', function (e) { if (e && e.persisted && myId) { _listen(); resync(); } });

  // Exact account ids only. (The name argument is accepted for old callers and ignored.)
  function isBlocked(id) { return !!(id && blockedIds.has(String(id))); }

  // ── Shared confirmation dialog ───────────────────────────────────────────
  // A single in-app confirm modal (never window.confirm) reused for every
  // block/unblock action on every page that loads RMBR. Returns a Promise that
  // resolves true (confirmed) or false (cancelled / dismissed). Light-theme,
  // matches the Report modal pattern. Exposed as RMBR.confirm for Settings.
  function ensureConfirm() {
    if (document.getElementById('rmbrConfirmOverlay')) return;
    var el = document.createElement('div');
    el.id = 'rmbrConfirmOverlay'; el.className = 'rmbr-overlay rmbr-confirm-overlay'; el.hidden = true;
    el.innerHTML =
      '<div class="rmbr-modal rmbrc-modal" role="dialog" aria-modal="true" aria-labelledby="rmbrcTitle">' +
        '<div class="rmbrc-icon"><i class="fas fa-ban" id="rmbrcIcon"></i></div>' +
        '<div class="rmbrc-title" id="rmbrcTitle">Are you sure?</div>' +
        '<p class="rmbrc-body" id="rmbrcBody"></p>' +
        '<div class="rmbrc-actions">' +
          '<button type="button" class="rmbrc-confirm" id="rmbrcConfirm">Confirm</button>' +
          '<button type="button" class="rmbrc-cancel" id="rmbrcCancel">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
  }
  function rmbrConfirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensureConfirm();
      var el = document.getElementById('rmbrConfirmOverlay');
      var okBtn = el.querySelector('#rmbrcConfirm');
      var cancelBtn = el.querySelector('#rmbrcCancel');
      var icon = el.querySelector('#rmbrcIcon');
      el.querySelector('#rmbrcTitle').textContent = opts.title || 'Are you sure?';
      el.querySelector('#rmbrcBody').textContent = opts.body || '';
      okBtn.textContent = opts.confirmLabel || 'Confirm';
      okBtn.className = 'rmbrc-confirm' + (opts.danger ? ' danger' : '');
      icon.className = 'fas ' + (opts.icon || 'fa-circle-question');
      el.querySelector('.rmbrc-icon').classList.toggle('danger', !!opts.danger);
      function cleanup(v) {
        el.hidden = true;
        okBtn.onclick = null; cancelBtn.onclick = null; el.onclick = null;
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); cleanup(false); } }
      okBtn.onclick = function () { cleanup(true); };
      cancelBtn.onclick = function () { cleanup(false); };
      el.onclick = function (e) { if (e.target === el) cleanup(false); };   // backdrop = cancel
      document.addEventListener('keydown', onKey, true);
      el.hidden = false;
      try { okBtn.focus(); } catch (e) {}
    });
  }

  async function blockUser(userId, userName) {
    var sb = client(); if (!sb || !myId || !userId || userId === myId) return false;
    // Confirmation FIRST — at the action layer, so no UI entry point (Portal,
    // Profile, Chat; mobile or desktop) can block a user with a single tap.
    var ok = await rmbrConfirm({
      title: 'Block this user?',
      body: 'You won’t see ' + (userName ? '“' + userName + '”' : 'this user') + '’s listings or messages, and they won’t see yours. You can undo this in Settings.',
      confirmLabel: 'Block', icon: 'fa-ban', danger: true
    });
    if (!ok) return false;
    try {
      var w = await sb.from('user_blocks').upsert({ blocker_id: myId, blocked_id: userId, blocked_name: userName || null }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      if (w && w.error) throw w.error;
      blockedIds.add(String(userId));
      toast('User blocked. You won’t see their content.');
      _fire({ scope: 'user', action: 'block', userId: String(userId) });
      _ping([myId, userId]);                   // my other sessions + theirs
      return true;
    } catch (e) { toast('Could not block. Please try again.'); return false; }
  }
  async function unblockUser(userId) {
    var sb = client(); if (!sb || !myId || !userId) return false;
    try {
      var d = await sb.from('user_blocks').delete().eq('blocker_id', myId).eq('blocked_id', userId);
      if (d && d.error) return false;          // not unblocked — leave the state alone
      blockedIds.delete(String(userId));
      // Re-read the backend so this page holds exactly what's stored (if they
      // also blocked me, that block still applies) before anything re-filters.
      try { var r = await _readBackend(sb); if (r) { blockedIds = r.ids; blockedPosts = r.posts; } } catch (e) {}
      _fire({ scope: 'user', action: 'unblock', userId: String(userId) });
      _ping([myId, userId]);
      return true;
    } catch (e) { return false; }
  }
  async function listBlocked() {
    var sb = client(); if (!sb || !myId) return [];
    try { var q = await sb.from('user_blocks').select('blocked_id,blocked_name,created_at').eq('blocker_id', myId).order('created_at', { ascending: false }); return q.data || []; } catch (e) { return []; }
  }

  // ── Block a single post/listing (hides only that item; author stays visible) ──
  function _pkey(type, id) { return (type || 'post') + ':' + String(id); }
  function isPostBlocked(type, id) { return id != null && blockedPosts.has(_pkey(type, id)); }
  async function blockPost(type, id, label) {
    var sb = client(); if (!sb || !myId || id == null) return false;
    // Confirmation FIRST — at the action layer, covering every block-post entry
    // point (Portal; mobile or desktop) so a single tap never hides an item.
    var noun = (type === 'listing') ? 'listing' : 'post';
    var ok = await rmbrConfirm({
      title: 'Block this ' + noun + '?',
      body: 'This ' + noun + ' will be hidden from you. The author stays visible. You can undo this in Settings.',
      confirmLabel: 'Block', icon: 'fa-eye-slash', danger: true
    });
    if (!ok) return false;
    try {
      await sb.from('blocked_posts').upsert({ blocker_id: myId, content_type: type || 'post', content_id: String(id), content_label: label || null }, { onConflict: 'blocker_id,content_type,content_id', ignoreDuplicates: true });
      blockedPosts.add(_pkey(type, id));
      toast((type === 'listing' ? 'Listing' : 'Post') + ' hidden. Manage in Settings.');
      _fire({ scope: 'post', action: 'block', type: type || 'post', id: String(id) });
      _ping([myId]);
      return true;
    } catch (e) { toast('Could not hide. Please try again.'); return false; }
  }
  async function unblockPost(type, id) {
    var sb = client(); if (!sb || !myId || id == null) return false;
    try { await sb.from('blocked_posts').delete().eq('blocker_id', myId).eq('content_type', type || 'post').eq('content_id', String(id)); blockedPosts.delete(_pkey(type, id)); _fire({ scope: 'post', action: 'unblock', type: type || 'post', id: String(id) }); _ping([myId]); return true; } catch (e) { return false; }
  }
  async function listBlockedPosts() {
    var sb = client(); if (!sb || !myId) return [];
    try { var q = await sb.from('blocked_posts').select('content_type,content_id,content_label,created_at').eq('blocker_id', myId).order('created_at', { ascending: false }); return q.data || []; } catch (e) { return []; }
  }

  // ── Report modal ──
  var _ctx = null, _reason = null;
  function ensureModal() {
    if (document.getElementById('rmbrOverlay')) return;
    var el = document.createElement('div');
    el.id = 'rmbrOverlay'; el.className = 'rmbr-overlay'; el.hidden = true;
    el.innerHTML =
      '<div class="rmbr-modal" role="dialog" aria-modal="true">' +
        '<div class="rmbr-title"><i class="fas fa-flag"></i> Report</div>' +
        '<p class="rmbr-sub">Tell us what’s wrong. Our team reviews reports within 24 hours.</p>' +
        '<div class="rmbr-reasons" id="rmbrReasons">' +
          '<button type="button" data-r="spam">Spam</button>' +
          '<button type="button" data-r="harassment">Harassment</button>' +
          '<button type="button" data-r="inappropriate">Inappropriate</button>' +
          '<button type="button" data-r="scam">Scam / Fraud</button>' +
          '<button type="button" data-r="other">Other</button>' +
        '</div>' +
        '<textarea id="rmbrDetails" class="rmbr-details" rows="3" placeholder="Add details (optional)"></textarea>' +
        '<div class="rmbr-actions"><button type="button" class="rmbr-cancel" id="rmbrCancel">Cancel</button>' +
        '<button type="button" class="rmbr-submit" id="rmbrSubmit" disabled>Submit report</button></div>' +
        '<div class="rmbr-status" id="rmbrStatus" role="status"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#rmbrReasons').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-r]'); if (!b) return;
      el.querySelectorAll('#rmbrReasons button').forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel'); _reason = b.dataset.r; el.querySelector('#rmbrSubmit').disabled = false;
    });
    el.querySelector('#rmbrCancel').addEventListener('click', function () { el.hidden = true; });
    el.addEventListener('click', function (e) { if (e.target === el) el.hidden = true; });
    el.querySelector('#rmbrSubmit').addEventListener('click', async function () {
      if (!_reason || !_ctx) return;
      var btn = el.querySelector('#rmbrSubmit'), st = el.querySelector('#rmbrStatus');
      btn.disabled = true; st.textContent = 'Submitting…';
      var ok = await submitReport(_reason, el.querySelector('#rmbrDetails').value.trim());
      if (ok) { st.textContent = 'Report submitted. Thank you.'; setTimeout(function () { el.hidden = true; }, 1000); }
      else { st.textContent = 'Could not submit. Please try again.'; btn.disabled = false; }
    });
  }
  function openReport(ctx) {
    ensureModal(); _ctx = ctx || {}; _reason = null;
    var el = document.getElementById('rmbrOverlay');
    el.querySelectorAll('#rmbrReasons button').forEach(function (x) { x.classList.remove('sel'); });
    el.querySelector('#rmbrDetails').value = ''; el.querySelector('#rmbrSubmit').disabled = true; el.querySelector('#rmbrStatus').textContent = '';
    el.hidden = false;
  }
  async function submitReport(reason, details) {
    var sb = client(); if (!sb || !_ctx) return false;
    try {
      await sb.from('content_reports').insert({
        reporter_id: myId || null, reporter_name: myName(),
        content_type: _ctx.type || 'user', content_id: _ctx.contentId != null ? String(_ctx.contentId) : null,
        reported_user_id: _ctx.userId || null, reported_user_name: _ctx.userName || null,
        reason: reason, details: details || null
      });
      return true;
    } catch (e) { console.warn('[RMBR] report failed', e); return false; }
  }

  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m); }

  window.RMBR = { init: init, isBlocked: isBlocked, blockUser: blockUser, unblockUser: unblockUser, listBlocked: listBlocked, openReport: openReport,
    isPostBlocked: isPostBlocked, blockPost: blockPost, unblockPost: unblockPost, listBlockedPosts: listBlockedPosts, confirm: rmbrConfirm,
    resync: resync };
  Object.defineProperty(window.RMBR, 'ready', { get: function () { return ready; } });
  Object.defineProperty(window.RMBR, 'myId', { get: function () { return myId; } });

  // A change made in ANOTHER same-origin page (another iframe of the app, or
  // another tab) arrives as a storage event carrying the whole new state: adopt
  // it, then fire rmbr:changed here so this page's screens re-filter.
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'rmbr_sync' || !ev.newValue) return;
    var d; try { d = JSON.parse(ev.newValue); } catch (e) { return; }
    if (!d || !Array.isArray(d.ids) || !Array.isArray(d.posts)) return;
    if (myId && d.me && d.me !== myId) return;                 // another account's state
    var before = _key();
    blockedIds = new Set(d.ids.map(String)); blockedPosts = new Set(d.posts.map(String));
    if (_key() === before) return;
    try { document.dispatchEvent(new CustomEvent('rmbr:changed', { detail: d })); } catch (e) {}
  });

  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
