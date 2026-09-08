// =============================================================================
//  Customer Service — user-facing entry (Profile navbar → Customer Service)
// =============================================================================
//  Two options, both wired to the EXISTING systems:
//    1. Raise a Concern  -> inserts a row into support_requests (the same ticket
//                           table support.html uses). Shows in Admin > Support.
//    2. Chat with a Rep  -> inserts a support_requests row marked is_live_chat,
//                           shows a "waiting" screen, and subscribes to that row.
//                           When an employee CLAIMS it in the Admin Support tab
//                           (existing atomic claim), the admin side creates the
//                           chat conversation and the customer is dropped into
//                           the EXISTING chat (chat.html) with that employee.
//
//  Reads/inserts go through window.supabaseClient (the library client) so they
//  carry the signed-in user's JWT — that's what makes the SELECT-own policy +
//  realtime "claimed" event work. No new chat system; no duplicate ticket system.
// =============================================================================
(function () {
  'use strict';

  // Prefer the app's shared client (carries the signed-in session). If a page
  // doesn't create one (e.g. home.html/app.html don't load script.js), make our
  // own from the supabase library — it still loads the persisted session from
  // localStorage, so auth.getUser() and JWT-scoped reads work the same.
  var _csClient = null;
  function SB() {
    if (window.supabaseClient) return window.supabaseClient;
    if (_csClient) return _csClient;
    if (window.supabase && window.supabase.createClient) {
      _csClient = window.supabase.createClient(
        'https://wmegpgrfrtprhuzmgjma.supabase.co',
        'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4'
      );
      return _csClient;
    }
    return null;
  }
  function getUser() { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function node(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function remove(id) { const e = document.getElementById(id); if (e) e.remove(); }

  // ── Chooser ────────────────────────────────────────────────────────────────
  window.openCustomerService = function () {
    remove('csOverlay');
    const ov = node(`
      <div class="cs-overlay" id="csOverlay" onclick="if(event.target===this)closeCustomerService()">
        <div class="cs-card" role="dialog" aria-label="Customer Service">
          <div class="cs-head">
            <div class="cs-title"><i class="fas fa-headset"></i> Customer Service</div>
            <button class="cs-x" aria-label="Close" onclick="closeCustomerService()">&times;</button>
          </div>
          <div class="cs-body">
            <button class="cs-opt" onclick="csRaiseConcern()">
              <span class="cs-opt-ic cs-ic-amber"><i class="fas fa-triangle-exclamation"></i></span>
              <span class="cs-opt-tx"><span class="cs-opt-t">Raise a Concern</span><span class="cs-opt-s">Send us a message — no live chat. We'll follow up.</span></span>
              <i class="fas fa-chevron-right cs-opt-ch"></i>
            </button>
            <button class="cs-opt" onclick="csStartLiveChat()">
              <span class="cs-opt-ic cs-ic-blue"><i class="fas fa-comments"></i></span>
              <span class="cs-opt-tx"><span class="cs-opt-t">Chat with a Customer Service Representative</span><span class="cs-opt-s">Talk live with an available representative.</span></span>
              <i class="fas fa-chevron-right cs-opt-ch"></i>
            </button>
          </div>
        </div>
      </div>`);
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
  };
  window.closeCustomerService = function () { remove('csOverlay'); };

  // ── 1. Raise a Concern ───────────────────────────────────────────────────
  window.csRaiseConcern = function () {
    remove('csOverlay');
    const u = getUser() || {};
    const ov = node(`
      <div class="cs-overlay open" id="csConcernOverlay" onclick="if(event.target===this)closeCsConcern()">
        <div class="cs-card" role="dialog" aria-label="Raise a Concern">
          <div class="cs-head">
            <button class="cs-back" aria-label="Back" onclick="closeCsConcern();openCustomerService()"><i class="fas fa-chevron-left"></i></button>
            <div class="cs-title"><i class="fas fa-triangle-exclamation"></i> Raise a Concern</div>
            <button class="cs-x" aria-label="Close" onclick="closeCsConcern()">&times;</button>
          </div>
          <div class="cs-body">
            <label class="cs-label">Category</label>
            <select id="csCat" class="cs-input">
              <option value="general">General</option>
              <option value="account">Account</option>
              <option value="bug">Bug / Something's broken</option>
              <option value="billing">Billing</option>
              <option value="other">Other</option>
            </select>
            <label class="cs-label">Subject <span class="cs-opt-note">(optional)</span></label>
            <input id="csSubject" class="cs-input" type="text" maxlength="120" placeholder="Short summary">
            <label class="cs-label">Message</label>
            <textarea id="csMessage" class="cs-input cs-textarea" rows="5" maxlength="2000" placeholder="Tell us what's going on…"></textarea>
            <div id="csConcernMsg" class="cs-msg" style="display:none;"></div>
            <button id="csConcernSend" class="cs-primary" onclick="csSubmitConcern()"><i class="fas fa-paper-plane"></i> Submit concern</button>
            <div class="cs-foot">Sending as <b>${esc(u.name || u.email || 'you')}</b></div>
          </div>
        </div>
      </div>`);
    document.body.appendChild(ov);
    setTimeout(() => { const m = document.getElementById('csMessage'); if (m) m.focus(); }, 50);
  };
  window.closeCsConcern = function () { remove('csConcernOverlay'); };

  window.csSubmitConcern = async function () {
    const u = getUser() || {};
    const msgEl = document.getElementById('csMessage');
    const out = document.getElementById('csConcernMsg');
    const btn = document.getElementById('csConcernSend');
    const message = (msgEl && msgEl.value || '').trim();
    const show = (t, ok) => { if (!out) return; out.style.display = 'block'; out.className = 'cs-msg ' + (ok ? 'cs-ok' : 'cs-err'); out.textContent = t; };
    if (!message) { show('Please enter a message.', false); return; }
    if (!SB()) { show('Not connected. Please try again.', false); return; }
    btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
    try {
      let uid = u.id || null;
      try { const r = await SB().auth.getUser(); uid = (r && r.data && r.data.user && r.data.user.id) || uid; } catch (e) {}
      const payload = {
        name: u.name || null,
        email: u.email || null,
        category: (document.getElementById('csCat') || {}).value || 'general',
        subject: ((document.getElementById('csSubject') || {}).value || '').trim() || null,
        message: message,
        user_id: uid,
      };
      const { error } = await SB().from('support_requests').insert(payload);
      if (error) throw error;
      // Success screen
      remove('csConcernOverlay');
      csToast('Concern submitted — our team will review it. Thank you!');
    } catch (e) {
      btn.disabled = false; btn.innerHTML = old;
      show('Could not submit: ' + (e.message || e), false);
    }
  };

  // ── 2. Chat with a Customer Service Representative ──────────────────────────
  let _csWaitChannel = null, _csWaitPoll = null, _csWaitTicketId = null;

  window.csStartLiveChat = async function () {
    const u = getUser() || {};
    if (!u.id) { csToast('Please sign in to start a live chat.'); return; }
    if (!SB()) { csToast('Not connected. Please try again.'); return; }
    remove('csOverlay');
    _showWaiting('Requesting a representative…');
    try {
      let uid = u.id;
      try { const r = await SB().auth.getUser(); uid = (r && r.data && r.data.user && r.data.user.id) || uid; } catch (e) {}
      const payload = {
        name: u.name || null,
        email: u.email || null,
        category: 'live_chat',
        is_live_chat: true,
        subject: 'Live chat request',
        message: 'Customer requested a live chat with a representative.',
        user_id: uid,
      };
      const { data, error } = await SB().from('support_requests').insert(payload).select('id').single();
      if (error) throw error;
      _csWaitTicketId = data.id;
      _watchTicket(data.id);
      _showWaiting('Waiting for a representative to join…', true);
    } catch (e) {
      _showWaiting('Could not start the chat: ' + (e.message || e), false, true);
    }
  };

  function _watchTicket(ticketId) {
    _teardownWatch();
    const onRow = (row) => {
      if (!row) return;
      if (row.status === 'being_handled' && row.assigned_to) {
        _openRepChat(row);
      } else if (row.status === 'resolved') {
        _showWaiting('This request was closed. Please try again.', false, true);
        _teardownWatch();
      }
    };
    // Realtime (delivered under the SELECT-own policy since the client carries the JWT).
    try {
      _csWaitChannel = SB().channel('cs-ticket-' + ticketId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_requests', filter: 'id=eq.' + ticketId }, (p) => onRow(p.new))
        .subscribe();
    } catch (e) {}
    // Poll fallback every 4s in case realtime is unavailable.
    _csWaitPoll = setInterval(async () => {
      try {
        const { data } = await SB().from('support_requests').select('id,status,assigned_to,assigned_username,chat_conversation_id').eq('id', ticketId).single();
        onRow(data);
      } catch (e) {}
    }, 4000);
  }

  function _openRepChat(row) {
    _teardownWatch();
    const who = row.assigned_username ? ('@' + row.assigned_username) : 'a representative';
    _showWaiting('Connected! ' + who + ' has joined. Opening chat…', true);
    setTimeout(() => {
      remove('csWaitOverlay');
      // Reuse the existing chat: open (or find) the 1:1 conversation with the rep.
      // The admin claim already created the conversation; chat.html finds it.
      window.location.href = 'chat.html?user=' + encodeURIComponent(row.assigned_to);
    }, 900);
  }

  function _teardownWatch() {
    if (_csWaitChannel) { try { SB().removeChannel(_csWaitChannel); } catch (e) {} _csWaitChannel = null; }
    if (_csWaitPoll) { clearInterval(_csWaitPoll); _csWaitPoll = null; }
  }

  function _showWaiting(text, spinning, isError) {
    let ov = document.getElementById('csWaitOverlay');
    if (!ov) {
      ov = node(`
        <div class="cs-overlay open" id="csWaitOverlay">
          <div class="cs-card cs-wait" role="dialog" aria-label="Live chat">
            <div class="cs-wait-ic" id="csWaitIc"><i class="fas fa-comments"></i></div>
            <div class="cs-wait-tx" id="csWaitTx"></div>
            <button class="cs-secondary" id="csWaitCancel" onclick="csCancelWait()">Cancel</button>
          </div>
        </div>`);
      document.body.appendChild(ov);
    }
    const ic = document.getElementById('csWaitIc');
    const tx = document.getElementById('csWaitTx');
    if (tx) tx.textContent = text;
    if (ic) ic.innerHTML = isError ? '<i class="fas fa-circle-exclamation"></i>' : (spinning ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-comments"></i>');
    const cancel = document.getElementById('csWaitCancel');
    if (cancel) cancel.textContent = isError ? 'Close' : 'Cancel';
  }
  window.csCancelWait = function () { _teardownWatch(); remove('csWaitOverlay'); };

  // ── tiny toast ──────────────────────────────────────────────────────────────
  function csToast(text) {
    remove('csToast');
    const t = node('<div class="cs-toast" id="csToast"><i class="fas fa-circle-check"></i> <span></span></div>');
    t.querySelector('span').textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  window.csToast = csToast;
})();
