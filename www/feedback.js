// =============================================================================
//  Feedback — Profile menu → Feedback (members) and the marketing page (visitors)
// =============================================================================
//  One path in: the submit_feedback RPC (feedback-migration.sql). The server
//  reads WHO is sending from the session (auth.uid()) — a signed-in member's
//  feedback carries their account, a visitor's is stored as anonymous. Nothing
//  about the sender is taken from this page.
//
//  One tap = one record: every opened form gets a fresh submission id
//  (client_id); the button locks while sending, and a retry or double tap of
//  the same submission returns the row it already made instead of a new one.
//
//  Reuses the Customer Service dialog styles (customer-service.css: cs-*).
//  Admins read it in Admin › Feedback.
// =============================================================================
(function () {
  'use strict';

  var SB_URL = window.RM_ENV.url;
  var SB_KEY = window.RM_ENV.anonKey;
  var _client = null;
  function SB() {
    if (window.supabaseClient) return window.supabaseClient;
    if (_client) return _client;
    if (window.supabase && window.supabase.createClient) { _client = window.supabase.createClient(SB_URL, SB_KEY); return _client; }
    return null;
  }
  function getUser() { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function node(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function platform() {
    try { var c = window.Capacitor; if (c && c.isNativePlatform && c.isNativePlatform()) return c.getPlatform ? c.getPlatform() : 'native'; } catch (e) {}
    return 'web';
  }
  var MAX = 4000;
  (function style() {
    if (document.getElementById('fb-style')) return;
    var st = document.createElement('style'); st.id = 'fb-style';
    st.textContent = '.fb-intro{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:#64748b}' +
      '.fb-count{text-align:right;font-size:11px;color:#94a3b8;margin:4px 2px 10px}' +
      'html[data-theme="dark"] .fb-intro{color:#94a3b8}';
    (document.head || document.documentElement).appendChild(st);
  })();

  // ── Shared submit (used by the dialog and by the marketing page form) ──────
  // Resolves to the feedback id; rejects with a user-readable message.
  async function submitFeedback(clientId, message, source) {
    var sb = SB();
    if (!sb) throw new Error('Not connected. Please check your connection and try again.');
    var text = String(message || '').trim();
    if (!text) throw new Error('Please write your feedback first.');
    if (text.length > MAX) throw new Error('Feedback is too long (' + MAX + ' characters max).');
    // From the app it must go out under the member's session — the server only
    // knows who sent it from that. The app can still look signed in after its
    // session lapsed (most screens keep working without one), so check for a
    // live session, refresh it once if needed, and never send app feedback
    // anonymously. Only the marketing page sends as a signed-out visitor.
    if (source !== 'marketing') {
      var s = null;
      try { s = (await sb.auth.getSession()).data.session; } catch (e) {}
      if (!s) { try { s = (await sb.auth.refreshSession()).data.session; } catch (e) {} }
      if (!s) throw new Error('Your session has expired. Please sign out and sign in again, then send your feedback.');
    }
    var r = await sb.rpc('submit_feedback', {
      p_client_id: clientId, p_message: text, p_source: source === 'marketing' ? 'marketing' : 'app',
      p_platform: platform(), p_page: (location.pathname || '').split('/').pop() || null
    });
    if (r.error) {
      var m = String(r.error.message || '');
      // Messages raised on purpose by submit_feedback are written for people.
      if (/feedback|try again|too long|empty/i.test(m) && m.length < 160) throw new Error(m);
      throw new Error('Could not send your feedback. Please try again.');
    }
    return r.data;
  }
  window.rmSubmitFeedback = submitFeedback;
  window.rmNewFeedbackId = newId;

  // ── Profile menu → Feedback ───────────────────────────────────────────────
  var _sending = false;
  window.openFeedback = function () {
    try { document.getElementById('navMenu') && document.getElementById('navMenu').classList.remove('open'); } catch (e) {}
    var old = document.getElementById('fbOverlay'); if (old) old.remove();
    var u = getUser() || {};
    var ov = node(
      '<div class="cs-overlay" id="fbOverlay" onclick="if(event.target===this)closeFeedback()">' +
        '<div class="cs-card" role="dialog" aria-label="Feedback">' +
          '<div class="cs-head">' +
            '<div class="cs-title"><i class="fas fa-comment-dots"></i> Feedback</div>' +
            '<button class="cs-x" aria-label="Close" onclick="closeFeedback()">&times;</button>' +
          '</div>' +
          '<div class="cs-body">' +
            '<p class="fb-intro">Tell us what you like, what\'s missing, or what we could do better. Every message is read by the realmate team.</p>' +
            '<label class="cs-label" for="fbMessage">Your feedback</label>' +
            '<textarea id="fbMessage" class="cs-input cs-textarea" rows="6" maxlength="' + MAX + '" placeholder="Share your thoughts about realmate…"></textarea>' +
            '<div class="fb-count"><span id="fbCount">0</span> / ' + MAX + '</div>' +
            '<div id="fbMsg" class="cs-msg" style="display:none;"></div>' +
            '<button id="fbSend" class="cs-primary" onclick="sendFeedback()"><i class="fas fa-paper-plane"></i> Submit Feedback</button>' +
            '<div class="cs-foot">' + (u.name || u.email ? 'Sending as <b>' + esc(u.name || u.email) + '</b>' : 'Sent from your realmate account') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>');
    ov.dataset.clientId = newId();             // one submission id per opened form
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('open'); });
    var ta = document.getElementById('fbMessage');
    if (ta) {
      ta.addEventListener('input', function () { var c = document.getElementById('fbCount'); if (c) c.textContent = ta.value.length; });
      setTimeout(function () { ta.focus(); }, 50);
    }
  };
  window.closeFeedback = function () { if (_sending) return; var o = document.getElementById('fbOverlay'); if (o) o.remove(); };

  window.sendFeedback = async function () {
    if (_sending) return;                       // rapid taps: one request
    var ov = document.getElementById('fbOverlay');
    var ta = document.getElementById('fbMessage');
    var out = document.getElementById('fbMsg');
    var btn = document.getElementById('fbSend');
    if (!ov || !ta || !btn) return;
    function show(t, ok) { out.style.display = 'block'; out.className = 'cs-msg ' + (ok ? 'cs-ok' : 'cs-err'); out.textContent = t; }
    out.style.display = 'none';
    _sending = true;
    var label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
    try {
      await submitFeedback(ov.dataset.clientId, ta.value, 'app');
      _sending = false;
      ov.remove();
      if (typeof window.csToast === 'function') window.csToast('Thank you! Your feedback was sent to the realmate team.');
      else if (typeof window.showToast === 'function') window.showToast('Thank you! Your feedback was sent to the realmate team.', 'success');
    } catch (e) {
      _sending = false;
      btn.disabled = false; btn.innerHTML = label;
      show((e && e.message) || 'Could not send your feedback. Please try again.', false);
    }
  };
})();
