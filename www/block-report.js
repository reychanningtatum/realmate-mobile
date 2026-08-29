/* block-report.js — RMBR: user block + content report (App Store Guideline 1.2)
 * Loaded on UGC pages. Exposes window.RMBR:
 *   RMBR.isBlocked(id, name)   -> hide blocked users' content (mutual)
 *   RMBR.blockUser(id, name)   -> block + hide going forward
 *   RMBR.unblockUser(id)       -> remove a block
 *   RMBR.listBlocked()         -> [{blocked_id, blocked_name, created_at}]
 *   RMBR.openReport({type, contentId, userId, userName})  -> report modal
 * Fail-open: any load error leaves nothing blocked (never hides the whole feed).
 */
(function () {
  'use strict';
  var SB_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
  var SB_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
  function client() {
    return window.supabaseClient || window._sb || window._supabase ||
      (window.supabase ? (window.__rmbrClient || (window.__rmbrClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }
  var blockedIds = new Set(), blockedNames = new Set();
  var blockedPosts = new Set();   // keys "type:id" — individually hidden posts/listings
  var myId = null, ready = false;

  function myName() { try { var u = JSON.parse(localStorage.getItem('user') || '{}'); return (u && u.name) || null; } catch (e) { return null; } }

  // Announce a block-list change. Fires rmbr:changed HERE (with what changed, so
  // listeners can tell block from unblock) AND writes a localStorage ping so the
  // OTHER same-origin iframes (Feed, Portal, Profile…) hear it — unblocking a
  // post in Settings must reach the Feed, which lives in a separate iframe.
  function _fire(detail) {
    try { document.dispatchEvent(new CustomEvent('rmbr:changed', { detail: detail })); } catch (e) {}
    try { localStorage.setItem('rmbr_sync', JSON.stringify(Object.assign({ t: Date.now() }, detail))); } catch (e) {}
  }

  async function init() {
    var sb = client(); if (!sb) return;
    try { var r = await sb.auth.getUser(); myId = r && r.data && r.data.user ? r.data.user.id : null; } catch (e) {}
    if (!myId) { ready = true; return; }
    try {
      var q = await sb.from('user_blocks').select('blocker_id,blocked_id,blocked_name');
      (q.data || []).forEach(function (row) {
        if (row.blocker_id === myId) { if (row.blocked_id) blockedIds.add(row.blocked_id); if (row.blocked_name) blockedNames.add(String(row.blocked_name).toLowerCase()); }
        if (row.blocked_id === myId) { blockedIds.add(row.blocker_id); }
      });
    } catch (e) {}
    // Individually hidden posts/listings (separate from whole-account blocks).
    // Fail-open: if the table isn't there yet, nothing is hidden.
    try {
      var bp = await sb.from('blocked_posts').select('content_type,content_id').eq('blocker_id', myId);
      (bp.data || []).forEach(function (r) { if (r.content_id) blockedPosts.add(r.content_type + ':' + r.content_id); });
    } catch (e) {}
    ready = true;
    document.dispatchEvent(new CustomEvent('rmbr:ready'));
  }

  function isBlocked(id, name) {
    if (id && blockedIds.has(id)) return true;
    if (name && blockedNames.has(String(name).toLowerCase())) return true;
    return false;
  }

  async function blockUser(userId, userName) {
    var sb = client(); if (!sb || !myId || !userId || userId === myId) return false;
    try {
      await sb.from('user_blocks').upsert({ blocker_id: myId, blocked_id: userId, blocked_name: userName || null }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      blockedIds.add(userId); if (userName) blockedNames.add(String(userName).toLowerCase());
      toast('User blocked. You won’t see their content.');
      _fire({ scope: 'user', action: 'block', userId: userId, userName: userName || null });
      return true;
    } catch (e) { toast('Could not block. Please try again.'); return false; }
  }
  async function unblockUser(userId) {
    var sb = client(); if (!sb || !myId || !userId) return false;
    try { await sb.from('user_blocks').delete().eq('blocker_id', myId).eq('blocked_id', userId); blockedIds.delete(userId); _fire({ scope: 'user', action: 'unblock', userId: userId }); return true; } catch (e) { return false; }
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
    try {
      await sb.from('blocked_posts').upsert({ blocker_id: myId, content_type: type || 'post', content_id: String(id), content_label: label || null }, { onConflict: 'blocker_id,content_type,content_id', ignoreDuplicates: true });
      blockedPosts.add(_pkey(type, id));
      toast((type === 'listing' ? 'Listing' : 'Post') + ' hidden. Manage in Settings.');
      _fire({ scope: 'post', action: 'block', type: type || 'post', id: String(id) });
      return true;
    } catch (e) { toast('Could not hide. Please try again.'); return false; }
  }
  async function unblockPost(type, id) {
    var sb = client(); if (!sb || !myId || id == null) return false;
    try { await sb.from('blocked_posts').delete().eq('blocker_id', myId).eq('content_type', type || 'post').eq('content_id', String(id)); blockedPosts.delete(_pkey(type, id)); _fire({ scope: 'post', action: 'unblock', type: type || 'post', id: String(id) }); return true; } catch (e) { return false; }
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
    isPostBlocked: isPostBlocked, blockPost: blockPost, unblockPost: unblockPost, listBlockedPosts: listBlockedPosts };
  Object.defineProperty(window.RMBR, 'ready', { get: function () { return ready; } });
  Object.defineProperty(window.RMBR, 'myId', { get: function () { return myId; } });

  // A block/unblock made in ANOTHER same-origin iframe (e.g. unblocking a post in
  // Settings) lands here as a storage event. Apply it to THIS document's sets so
  // isBlocked/isPostBlocked stay correct, then re-fire rmbr:changed locally so
  // this page (the Feed, Portal, Profile…) reacts — restoring an unblocked post.
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'rmbr_sync' || !ev.newValue) return;
    var d; try { d = JSON.parse(ev.newValue); } catch (e) { return; }
    if (!d) return;
    if (d.scope === 'user') {
      if (d.action === 'block') { if (d.userId) blockedIds.add(d.userId); if (d.userName) blockedNames.add(String(d.userName).toLowerCase()); }
      else if (d.action === 'unblock') { if (d.userId) blockedIds.delete(d.userId); }
    } else if (d.scope === 'post') {
      var k = _pkey(d.type || 'post', d.id);
      if (d.action === 'block') blockedPosts.add(k); else if (d.action === 'unblock') blockedPosts.delete(k);
    }
    try { document.dispatchEvent(new CustomEvent('rmbr:changed', { detail: d })); } catch (e) {}
  });

  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
