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
            <label class="cs-label">Photo <span class="cs-opt-note">(optional)</span></label>
            <input type="file" id="csPhotoInput" accept="image/*" style="display:none;" onchange="csPickConcernPhoto(this)">
            <div id="csPhotoRow">
              <button type="button" class="cs-photo-btn" onclick="document.getElementById('csPhotoInput').click()"><i class="fas fa-image"></i> Add photo</button>
            </div>
            <div id="csPhotoPreview" class="cs-photo-preview" style="display:none;">
              <img id="csPhotoImg" alt="attachment preview">
              <button type="button" class="cs-photo-remove" onclick="csRemoveConcernPhoto()" aria-label="Remove photo"><i class="fas fa-times"></i></button>
            </div>
            <div id="csConcernMsg" class="cs-msg" style="display:none;"></div>
            <button id="csConcernSend" class="cs-primary" onclick="csSubmitConcern()"><i class="fas fa-paper-plane"></i> Submit concern</button>
            <div class="cs-foot">Sending as <b>${esc(u.name || u.email || 'you')}</b></div>
          </div>
        </div>
      </div>`);
    document.body.appendChild(ov);
    setTimeout(() => { const m = document.getElementById('csMessage'); if (m) m.focus(); }, 50);
  };
  window.closeCsConcern = function () { _concernPhoto = null; remove('csConcernOverlay'); };

  // Optional concern photo (preview + remove before submit).
  var _concernPhoto = null;
  window.csPickConcernPhoto = function (input) {
    const f = input && input.files && input.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { csToast('Please choose an image file.'); input.value = ''; return; }
    if (f.size > 15 * 1024 * 1024) { csToast('Image is too large (max 15MB).'); input.value = ''; return; }
    _concernPhoto = f;
    const img = document.getElementById('csPhotoImg');
    if (img) img.src = URL.createObjectURL(f);
    const prev = document.getElementById('csPhotoPreview'); if (prev) prev.style.display = 'flex';
    const row = document.getElementById('csPhotoRow'); if (row) row.style.display = 'none';
  };
  window.csRemoveConcernPhoto = function () {
    _concernPhoto = null;
    const inp = document.getElementById('csPhotoInput'); if (inp) inp.value = '';
    const prev = document.getElementById('csPhotoPreview'); if (prev) prev.style.display = 'none';
    const row = document.getElementById('csPhotoRow'); if (row) row.style.display = '';
  };

  async function _uploadConcernPhoto(uid) {
    if (!_concernPhoto) return null;
    // Reuse the EXISTING chat-files storage bucket (same as chat attachments).
    const ext = (_concernPhoto.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `support/${uid || 'anon'}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await SB().storage.from('chat-files').upload(path, _concernPhoto, { contentType: _concernPhoto.type, upsert: false });
    if (error) throw error;
    const { data } = SB().storage.from('chat-files').getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : null;
  }

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
      let photoUrl = null;
      try { photoUrl = await _uploadConcernPhoto(uid); } catch (e) { show('Could not upload the photo: ' + (e.message || e), false); btn.disabled = false; btn.innerHTML = old; return; }
      const payload = {
        name: u.name || null,
        email: u.email || null,
        category: (document.getElementById('csCat') || {}).value || 'general',
        subject: ((document.getElementById('csSubject') || {}).value || '').trim() || null,
        message: message,
        user_id: uid,
        photo_url: photoUrl,
      };
      const { error } = await SB().from('support_requests').insert(payload);
      if (error) throw error;
      _concernPhoto = null;
      remove('csConcernOverlay');
      csToast('Concern submitted — our team will review it. Thank you!');
    } catch (e) {
      btn.disabled = false; btn.innerHTML = old;
      show('Could not submit: ' + (e.message || e), false);
    }
  };

  // ── 2. Chat with a Customer Service Representative ──────────────────────────
  let _csWaitChannel = null, _csWaitPoll = null, _csWaitTimer = null, _csWaitTicketNo = null;

  const SEL = 'id,ticket_number,status,assigned_to,assigned_username,chat_conversation_id,chat_rep_id,is_live_chat';

  // ── Sounds (synthesized Web Audio; created inside the click gesture) ────────
  let _csAudioCtx = null, _csWaitSoundTimer = null;
  function _csAudio() {
    try {
      if (!_csAudioCtx) _csAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_csAudioCtx.state === 'suspended') _csAudioCtx.resume();
      return _csAudioCtx;
    } catch (e) { return null; }
  }
  function _csBeep(freq, dur, gain, type) {
    const ctx = _csAudio(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain || 0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.18));
    o.start(t); o.stop(t + (dur || 0.18) + 0.03);
  }
  function _csStartWaitSound() {
    _csStopWaitSound();
    const ping = () => { _csBeep(660, 0.12, 0.045); setTimeout(() => _csBeep(880, 0.12, 0.035), 130); };
    ping();
    _csWaitSoundTimer = setInterval(ping, 4500);
  }
  function _csStopWaitSound() { if (_csWaitSoundTimer) { clearInterval(_csWaitSoundTimer); _csWaitSoundTimer = null; } }
  function _csJoinSound() {
    _csBeep(523, 0.14, 0.06); setTimeout(() => _csBeep(659, 0.14, 0.06), 120); setTimeout(() => _csBeep(784, 0.22, 0.06), 250);
  }

  window.csStartLiveChat = async function () {
    const u = getUser() || {};
    if (!u.id) { csToast('Please sign in to start a live chat.'); return; }
    if (!SB()) { csToast('Not connected. Please try again.'); return; }
    remove('csOverlay');
    _showWaiting('Requesting a representative…');
    try {
      let uid = u.id;
      try { const r = await SB().auth.getUser(); uid = (r && r.data && r.data.user && r.data.user.id) || uid; } catch (e) {}
      // ALWAYS start a brand-new Customer Service chat (no reuse).
      const payload = {
        name: u.name || null, email: u.email || null, category: 'live_chat', is_live_chat: true,
        subject: 'Live chat request', message: 'Customer requested a live chat with a representative.', user_id: uid,
      };
      const { data: ticket, error } = await SB().from('support_requests').insert(payload).select(SEL).single();
      if (error) throw error;
      _csWaitTicketNo = ticket.ticket_number || null;
      _watchTicket(ticket.id);
      _showWaiting('Waiting for a representative to join…', true);
      _csStartWaitSound();
      // Frontend-only 30s timeout: stop the spinner and show a "busy" message so
      // the user is never stuck on an endless loader. The TICKET STAYS PENDING in
      // the queue and the watch keeps running — a rep can still accept later and
      // the user transitions in automatically.
      clearTimeout(_csWaitTimer);
      _csWaitTimer = setTimeout(() => {
        _csStopWaitSound(); // stop the loading sound once we drop to the passive "busy" state
        if (document.getElementById('csWaitOverlay')) {
          _showWaiting('All of our representatives are currently busy. Please wait — a representative will respond to your request shortly. You don’t need to submit it again.', false);
        }
      }, 30000);
    } catch (e) {
      _showWaiting('Could not start the chat: ' + (e.message || e), false, true);
    }
  };

  // Watch THIS specific request so the customer lands on the exact conversation
  // the rep opens for it (a fresh thread each time).
  function _watchTicket(ticketId) {
    _teardownWatch();
    const check = (row) => {
      if (row && row.status === 'being_handled' && row.chat_conversation_id) _openRepChat(row);
      else if (row && row.status === 'resolved') { _showWaiting('This request was closed. Please try again.', false, true); _teardownWatch(); }
    };
    try {
      _csWaitChannel = SB().channel('cs-ticket-' + ticketId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_requests', filter: 'id=eq.' + ticketId }, (p) => check(p.new))
        .subscribe();
    } catch (e) {}
    // Poll fallback (realtime needs the JWT-scoped SELECT-own policy; poll is the backstop).
    _csWaitPoll = setInterval(async () => {
      try {
        const { data } = await SB().from('support_requests').select(SEL).eq('id', ticketId).maybeSingle();
        if (data) check(data);
      } catch (e) {}
    }, 3500);
  }

  function _openRepChat(row) {
    const convId = row && row.chat_conversation_id;
    if (!convId) return;
    _csStopWaitSound(); _csJoinSound(); // Support accepted — play the join chime
    _teardownWatch();
    _showWaiting('Connected! A representative has joined. Opening chat…', true);
    setTimeout(() => {
      remove('csWaitOverlay');
      // Open the EXACT conversation for this session (fresh thread each time).
      window.location.href = 'chat.html?conversation=' + encodeURIComponent(convId);
    }, 900);
  }

  function _teardownWatch() {
    if (_csWaitChannel) { try { SB().removeChannel(_csWaitChannel); } catch (e) {} _csWaitChannel = null; }
    if (_csWaitPoll) { clearInterval(_csWaitPoll); _csWaitPoll = null; }
    if (_csWaitTimer) { clearTimeout(_csWaitTimer); _csWaitTimer = null; }
    _csStopWaitSound();
  }

  function _showWaiting(text, spinning, isError) {
    let ov = document.getElementById('csWaitOverlay');
    if (!ov) {
      ov = node(`
        <div class="cs-overlay open" id="csWaitOverlay">
          <div class="cs-card cs-wait" role="dialog" aria-label="Live chat">
            <div class="cs-wait-ic" id="csWaitIc"><i class="fas fa-comments"></i></div>
            <div class="cs-wait-title">realmate Support</div>
            <div class="cs-wait-sub" id="csWaitSub"></div>
            <div class="cs-wait-tx" id="csWaitTx"></div>
            <button class="cs-secondary" id="csWaitCancel" onclick="csCancelWait()">Cancel</button>
          </div>
        </div>`);
      document.body.appendChild(ov);
    }
    const ic = document.getElementById('csWaitIc');
    const tx = document.getElementById('csWaitTx');
    const sub = document.getElementById('csWaitSub');
    if (tx) tx.textContent = text;
    if (sub) sub.textContent = _csWaitTicketNo ? ('Ticket No. ' + _csWaitTicketNo) : '';
    if (ic) ic.innerHTML = isError ? '<i class="fas fa-circle-exclamation"></i>'
      : (spinning ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-headset"></i>');
    const cancel = document.getElementById('csWaitCancel');
    if (cancel) cancel.textContent = (isError || !spinning) ? 'Close' : 'Cancel';
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
