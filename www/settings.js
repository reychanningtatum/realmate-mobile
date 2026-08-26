// 🔥 SUPABASE SETUP
const supabaseUrl = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const supabaseKey = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 🔥 GLOBAL DATA
let user = JSON.parse(localStorage.getItem("user")) || {};

/**
 * 🚀 IN-APP NOTIFICATION TOAST
 */
function showSettingsNotificationToast(message, type = "success") {
    const container = document.getElementById("settingsToastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `settings-toast ${type === "success" ? "toast-success" : "toast-error"}`;

    const icon = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add("toast-visible"), 10);
    setTimeout(() => {
        toast.classList.remove("toast-visible");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* ============================================================
   🔔 NOTIFICATIONS — Portal Notifications ON / OFF
   Stored in localStorage under `rm_portal_notifs` ('1' on / '0' off,
   default ON). match-alert.js reads this flag to decide whether to
   surface the global AI-match banner + nav badge.
   ============================================================ */
const PORTAL_NOTIFS_KEY = 'rm_portal_notifs';

function portalNotifsOn() {
    return localStorage.getItem(PORTAL_NOTIFS_KEY) !== '0'; // default ON
}

function initPortalNotifsToggle() {
    const toggle = document.getElementById('togglePortalNotifs');
    if (toggle) toggle.checked = portalNotifsOn();
}

function savePortalNotifsPref(isOn) {
    localStorage.setItem(PORTAL_NOTIFS_KEY, isOn ? '1' : '0');
    showSettingsNotificationToast(
        isOn ? 'Portal notifications turned on.' : 'Portal notifications turned off.',
        'success'
    );
}

/* ============================================================
   🔒 PRIVACY — Public Account + Public Following
   Persisted to profiles (other users read these to decide access),
   NOT localStorage. is_public / public_follow default false (Private +
   approval-required). See privacy-following-migration.sql + RMPriv.
   ============================================================ */
async function loadPrivacyToggles() {
    try {
        const { data: { user: authUser } } = await _supabase.auth.getUser();
        if (!authUser) return;
        const { data } = await _supabase.from('profiles')
            .select('is_public, public_follow').eq('id', authUser.id).maybeSingle();
        const pub = document.getElementById('togglePublicAccount');
        const pf  = document.getElementById('togglePublicFollow');
        if (pub) pub.checked = !!(data && data.is_public);
        if (pf)  pf.checked  = !!(data && data.public_follow);
    } catch (e) { console.warn('[Settings] loadPrivacyToggles:', e.message); }
}
async function _savePrivacyField(field, val, msg, toggleId) {
    try {
        const { data: { user: authUser } } = await _supabase.auth.getUser();
        if (!authUser) throw new Error('not authenticated');
        const upd = { id: authUser.id }; upd[field] = !!val;
        const { error } = await _supabase.from('profiles').upsert(upd, { onConflict: 'id' });
        if (error) throw error;
        showSettingsNotificationToast(msg, 'success');
    } catch (e) {
        // Roll the toggle back so it reflects the real (unsaved) state.
        const t = document.getElementById(toggleId); if (t) t.checked = !val;
        showSettingsNotificationToast('Could not save your privacy setting. Please try again.', 'error');
    }
}
function savePublicAccountPref(isOn) {
    _savePrivacyField('is_public', isOn,
        isOn ? 'Your account is now Public.' : 'Your account is now Private.', 'togglePublicAccount');
}
function savePublicFollowPref(isOn) {
    _savePrivacyField('public_follow', isOn,
        isOn ? 'Anyone can now follow you without approval.' : 'Follow requests now require your approval.', 'togglePublicFollow');
}

/* ============================================================
   👤 ACCOUNT — Email & Password
   Backed by Supabase Auth on the active session.
   ============================================================ */
async function loadAccountEmail() {
    const emailInput = document.getElementById('accountEmail');
    if (!emailInput) return;
    try {
        const { data: { user: authUser } } = await _supabase.auth.getUser();
        const email = (authUser && authUser.email) || user.email || '';
        emailInput.value = email;
        emailInput.dataset.current = email;
    } catch (e) {
        console.warn('[Settings] loadAccountEmail failed:', e.message);
        if (user.email) { emailInput.value = user.email; emailInput.dataset.current = user.email; }
    }
}

function _isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function updateAccountEmail() {
    const emailInput = document.getElementById('accountEmail');
    const btn = document.getElementById('updateEmailBtn');
    if (!emailInput) return;

    const newEmail = emailInput.value.trim();
    const current = emailInput.dataset.current || '';

    if (!_isValidEmail(newEmail)) {
        showSettingsNotificationToast('Please enter a valid email address.', 'error');
        return;
    }
    if (newEmail.toLowerCase() === current.toLowerCase()) {
        showSettingsNotificationToast('That is already your email.', 'error');
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    try {
        const { error } = await _supabase.auth.updateUser({ email: newEmail });
        if (error) throw error;

        // Keep the cached profile email in sync for the rest of the app.
        try {
            user.email = newEmail;
            localStorage.setItem('user', JSON.stringify(user));
        } catch (e) {}

        showSettingsNotificationToast(
            'Confirmation link sent. Check your new email to finish the change.',
            'success'
        );
    } catch (err) {
        console.error('[Settings] updateAccountEmail:', err);
        showSettingsNotificationToast(err.message || 'Could not update email.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Update Email'; }
    }
}

function _isStrongPassword(pw) {
    return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

async function updateAccountPassword() {
    const pwInput = document.getElementById('newAccountPassword');
    const confirmInput = document.getElementById('confirmAccountPassword');
    const btn = document.getElementById('updatePasswordBtn');
    if (!pwInput || !confirmInput) return;

    const pw = pwInput.value;
    const confirm = confirmInput.value;

    if (!_isStrongPassword(pw)) {
        showSettingsNotificationToast('Password needs 8+ characters, 1 uppercase letter and 1 number.', 'error');
        return;
    }
    if (pw !== confirm) {
        showSettingsNotificationToast('Passwords do not match.', 'error');
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    try {
        const { error } = await _supabase.auth.updateUser({ password: pw });
        if (error) throw error;

        pwInput.value = '';
        confirmInput.value = '';
        showSettingsNotificationToast('Password updated successfully.', 'success');
    } catch (err) {
        console.error('[Settings] updateAccountPassword:', err);
        showSettingsNotificationToast(err.message || 'Could not update password.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    }
}

function toggleSettingsPassword(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    iconEl.classList.toggle('fa-eye', !show);
    iconEl.classList.toggle('fa-eye-slash', show);
}

function logout() {
    try { _supabase.auth.signOut(); } catch (e) {}
    localStorage.clear();
    location.href = "index.html";
}

/**
 * 🚀 BOOTSTRAP
 */
window.onload = () => {
    initPortalNotifsToggle();
    loadAccountEmail();
    loadPrivacyToggles();
};


/* ── Account deletion (Apple Guideline 5.1.1v) ───────────────── */
function openDeleteAccountModal(){
  const ov=document.getElementById('deleteAccountOverlay'); if(!ov) return;
  const inp=document.getElementById('daConfirmInput'); if(inp) inp.value='';
  const st=document.getElementById('daStatus'); if(st) st.textContent='';
  const cb=document.getElementById('daConfirmBtn'); if(cb){ cb.disabled=true; cb.textContent='Delete permanently'; }
  ov.hidden=false;
}
function closeDeleteAccountModal(){ const ov=document.getElementById('deleteAccountOverlay'); if(ov) ov.hidden=true; }
function daSyncConfirm(){
  const v=(document.getElementById('daConfirmInput').value||'').trim().toUpperCase();
  const cb=document.getElementById('daConfirmBtn'); if(cb) cb.disabled=(v!=='DELETE');
}
async function confirmDeleteAccount(){
  const btn=document.getElementById('daConfirmBtn'); const status=document.getElementById('daStatus');
  if(!btn||btn.disabled) return;
  btn.disabled=true; btn.textContent='Deleting\u2026'; if(status) status.textContent='Deleting your account\u2026';
  try{
    const { data, error } = await _supabase.functions.invoke('delete-account', { body: { confirm: true } });
    if(error) throw error;
    if(data && data.ok===false) throw new Error('Deletion did not complete. Please try again or contact support.');
    if(status) status.textContent='Your account has been deleted.';
    try { await _supabase.auth.signOut(); } catch(e){}
    localStorage.clear();
    setTimeout(function(){ location.href='marketing.html'; }, 1200);
  }catch(err){
    console.error('[Settings] confirmDeleteAccount:', err);
    if(status) status.textContent=(err && err.message) ? err.message : 'Could not delete account. Please try again.';
    btn.disabled=false; btn.textContent='Delete permanently';
  }
}


/* ── Blocked users (App Store Guideline 1.2) ── */
function _rmbrEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
async function loadBlockedUsers(){
  const el=document.getElementById('blockedUsersList'); if(!el||!window.RMBR) return;
  const list=await RMBR.listBlocked();
  if(!list.length){ el.innerHTML='<div class="blocked-empty">You haven’t blocked anyone.</div>'; return; }
  el.innerHTML=list.map(function(b){ return '<div class="blocked-row"><span class="blocked-name">'+_rmbrEsc(b.blocked_name||b.blocked_id)+'</span><button class="settings-btn blocked-unblock" onclick="unblockBlockedUser(\''+b.blocked_id+'\')">Unblock</button></div>'; }).join('');
}
async function unblockBlockedUser(id){
  if(!window.RMBR) return;
  const ok=await RMBR.unblockUser(id);
  if(ok){ showSettingsNotificationToast('User unblocked.','success'); loadBlockedUsers(); }
  else { showSettingsNotificationToast('Could not unblock. Please try again.','error'); }
}
/* ── Blocked posts/listings (individually hidden items — undo lives ONLY here) ── */
async function loadBlockedPosts(){
  const el=document.getElementById('blockedPostsList'); if(!el||!window.RMBR||!RMBR.listBlockedPosts) return;
  const list=await RMBR.listBlockedPosts();
  if(!list.length){ el.innerHTML='<div class="blocked-empty">You haven’t hidden any posts.</div>'; return; }
  el.innerHTML=list.map(function(b){
    const kind=b.content_type==='listing'?'Listing':'Post';
    const label=b.content_label?_rmbrEsc(b.content_label):(kind+' '+_rmbrEsc(b.content_id));
    return '<div class="blocked-row"><span class="blocked-name"><strong>'+kind+'</strong> · '+label+'</span><button class="settings-btn blocked-unblock" onclick="unblockBlockedPost(\''+_rmbrEsc(b.content_type)+'\',\''+_rmbrEsc(b.content_id)+'\')">Unblock</button></div>';
  }).join('');
}
async function unblockBlockedPost(type, id){
  if(!window.RMBR||!RMBR.unblockPost) return;
  const ok=await RMBR.unblockPost(type, id);
  if(ok){ showSettingsNotificationToast((type==='listing'?'Listing':'Post')+' unblocked.','success'); loadBlockedPosts(); }
  else { showSettingsNotificationToast('Could not unblock. Please try again.','error'); }
}
document.addEventListener('rmbr:ready', loadBlockedUsers);
document.addEventListener('rmbr:ready', loadBlockedPosts);
document.addEventListener('DOMContentLoaded', function(){ setTimeout(loadBlockedUsers, 900); setTimeout(loadBlockedPosts, 900); });
