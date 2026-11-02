// The app's first tab after sign-in / reopening: the Home dashboard.
function _rmStartTab() {
    return 'home';
}

window.supabaseClient = window.supabase.createClient(
    window.RM_ENV.url,
    window.RM_ENV.anonKey
);

// One-time reset of the biometric-offer guard. The old "Enable Face ID?" offer
// used window.confirm(), which is a silent no-op inside the Capacitor WebView —
// so rm_bio_prompted got set on the very first sign-in without the user ever
// seeing a prompt, permanently blocking enrolment. Clear it once so the new
// in-app offer (_bioEnablePrompt) can appear for anyone who hasn't actually
// turned biometrics on. Runs everywhere but only matters in the native app.
try {
  if (!localStorage.getItem("rm_bio_prompt_reset_v2")) {
    localStorage.removeItem("rm_bio_prompted");
    localStorage.setItem("rm_bio_prompt_reset_v2", "1");
  }
} catch (e) {}

// ── Password recovery link handling ──────────────────
// Supabase's client processes the #access_token=...&type=recovery hash (or
// an #error=...&error_description=... hash for an expired/invalid link)
// asynchronously as soon as the client is created above — which is BEFORE
// this file's `load` listener ever runs, and it clears the hash from the
// URL once it's done. That race is why the reset link used to just land on
// the plain page with no modal: by the time `load` fired, location.hash was
// already empty. onAuthStateChange's PASSWORD_RECOVERY event is the
// reliable, non-racy signal Supabase actually recommends for this — it
// fires once the recovery token has been verified and a temporary session
// established, regardless of how the timing lines up with `load`.
let _resetModalShown = false;
function openResetPasswordModal() {
    if (_resetModalShown) return;
    _resetModalShown = true;
    document.getElementById("updatePasswordModal").style.display = "flex";
}

window.supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") openResetPasswordModal();
});

// ── Auto-login: skip the login screen when a valid session already exists ─────
// Supabase persists the session (its refresh token) in the app's sandboxed
// storage by default — no password is ever stored. But nothing was USING that
// on the login page, so every cold start showed the login form even though the
// session was still valid. iOS evicts a backgrounded app after a while, so
// reopening "several hours later" cold-starts here — which is exactly when the
// user hit the login screen again. This forwards a returning, still-signed-in
// user straight into the app. getSession() returns the stored session and
// transparently refreshes an expired access token, so a truthy result means the
// session is genuinely valid; a null result (real expiry / logout) falls through
// to the login form. Honors an explicit "Remember me = off" and never hijacks
// the password-recovery / magic-link flow.
(async function attemptAutoLogin() {
    if (!document.getElementById("loginBtn")) return;         // login page only
    var h = location.hash || "", q = location.search || "";
    if (h.includes("type=recovery") || h.includes("error=") || q.includes("token_hash") || q.includes("resubmit")) return;
    if (localStorage.getItem("rm_remember") === "0") return;  // user opted out
    function reveal() { document.documentElement.classList.remove("rm-autologin"); }
    // Show the login form AND, if the user turned Face ID ON, reveal the "Sign in
    // with Face ID" shortcut. We key this on isEnabled() alone (not also on cached
    // credentials): enabling in Settings sets the flag but can't capture the
    // password, so requiring saved creds meant the button never appeared until a
    // later password sign-in. If creds aren't stored yet, bioSignIn() falls back
    // to the password form with a clear message, and the first password sign-in
    // stores them. A forgotten/deleted account has isEnabled() false, so the
    // button stays hidden there. Biometrics is only ever a sign-in OPTION here —
    // never a gate when reopening a live session.
    async function revealWithBio() {
        try { if (window.rmBio && await window.rmBio.isEnabled()) _rmShowBioLogin(); } catch (e) {}
        reveal();
    }
    // Came from the marketing page (tapped Get Started / Sign In): show the login
    // form AND the Face ID option, and do NOT auto-forward into the app. Must run
    // revealWithBio() (not a bare return) or the "Sign in with Face ID" button never
    // appears on this path — that was the biometrics regression.
    try { if (sessionStorage.getItem("rm_from_marketing")) { sessionStorage.removeItem("rm_from_marketing"); await revealWithBio(); return; } } catch (e) {}
    // Just logged out this launch — show the login form, never hydrate back in.
    try { if (sessionStorage.getItem("rm_logged_out")) { sessionStorage.removeItem("rm_logged_out"); await revealWithBio(); return; } } catch (e) {}
    var _RM_TOKEN_KEY = window.RM_ENV.authTokenKey;
    try {
        // Native: wait for the persisted session to be restored into localStorage
        // before asking Supabase for it (see native-auth.js).
        if (window.rmSessionReady) { try { await window.rmSessionReady; } catch (e) {} }
        var res = await window.supabaseClient.auth.getSession();
        var session = res && res.data && res.data.session;
        // Fallback: a token is in storage but the client cached a null session
        // (construct-time race, or restored after the client initialised) — hydrate it.
        if (!session) { session = await _rmHydrateSession(_RM_TOKEN_KEY); }
        // An anonymous visitor (posted a listing before signing up — onboarding.js)
        // is not a member: stay on this page; onboarding.js takes them back to the
        // account step.
        if (session && session.user && session.user.is_anonymous) { await revealWithBio(); return; }
        if (session) {
            // Valid session → go STRAIGHT in. Reopening the app must never prompt
            // biometrics or log the user out.
            var dest = (window.Capacitor || window.matchMedia("(max-width: 900px)").matches)
                ? "app.html?tab=" + _rmStartTab() : "livemarket.html";
            location.replace(dest);
        } else {
            await revealWithBio(); // no valid session → login form + Face ID option
        }
    } catch (e) { reveal(); /* stay on the login form */ }
})();

// Show the "Sign in with Face ID/Touch ID" button on the login form.
async function _rmShowBioLogin() {
    var btn = document.getElementById("bioLoginBtn");
    if (!btn) return;
    try { var label = btn.querySelector("span"); if (label && window.rmBio) label.textContent = "Sign in with " + (await window.rmBio.typeName()); } catch (e) {}
    btn.style.display = "";
}

// "Sign in with Face ID" tap: verify → read saved Keychain credentials → sign in
// through the normal login() path. Falls back to the password form on any failure.
async function bioSignIn() {
    try {
        if (!window.rmBio) return;
        var ok = await window.rmBio.verify("Sign in to realmate");
        if (!ok) return; // user cancelled / failed → they can still type or retry
        var creds = await window.rmBio.getCredentials();
        if (!creds || !creds.username || !creds.password) { showLoginError("Saved sign-in not found. Please sign in with your password."); return; }
        var id = document.getElementById("loginIdentifier"), pw = document.getElementById("password");
        if (id) id.value = creds.username;
        if (pw) pw.value = creds.password;
        login({ fromBio: true });
    } catch (e) { /* stay on the form; password login remains available */ }
}

// Explicitly re-hydrate a Supabase session from the token stored in localStorage
// when getSession() returned null but a token is actually present. Returns the
// restored session or null. Shared by attemptAutoLogin and auth-guard.
async function _rmHydrateSession(tokenKey) {
    try {
        var raw = localStorage.getItem(tokenKey || window.RM_ENV.authTokenKey);
        if (!raw) return null;
        var tok = JSON.parse(raw);
        var s = tok && (tok.access_token ? tok : tok.currentSession); // v2 stores the session directly
        if (!s || !s.access_token || !s.refresh_token) return null;
        var r = await window.supabaseClient.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
        return (r && r.data && r.data.session) || null;
    } catch (e) { return null; }
}

window.addEventListener('load', () => {
    // Bounced here by the ban gate (auth-guard.js) while holding a live session —
    // tell the user why, then clear the one-shot flag.
    try {
        if (localStorage.getItem('rm_blocked') === 'banned') {
            localStorage.removeItem('rm_blocked');
            showAuthToast("Your account has been suspended. Contact information.realmate@gmail.com if you think this is a mistake.", "error", null, 10000);
        }
    } catch (e) {}

    const hash = window.location.hash || "";
    // An expired/invalid link redirects back with an error in the hash
    // instead of a recovery token — surface that instead of doing nothing.
    if (hash.includes("error=")) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const desc = (params.get("error_description") || "").toLowerCase();
        showAuthToast(
            desc.includes("expired")
                ? "This reset link has expired. Please request a new one."
                : "This reset link is invalid or has already been used. Please request a new one.",
            "error"
        );
        history.replaceState(null, "", window.location.pathname);
        return;
    }
    // Fast-path fallback alongside onAuthStateChange above — harmless if
    // both fire since openResetPasswordModal() is idempotent.
    if (hash.includes("type=recovery")) openResetPasswordModal();
});

// ── Prefetch-safe reset flow: ?token_hash=...&type=recovery ─────────────
// The default Supabase email template links straight to its own hosted
// /auth/v1/verify endpoint — a one-time-use URL. Many corporate email
// security systems (Trellix/FireEye, Microsoft Safe Links, etc.) pre-fetch
// every link's destination to scan it BEFORE a human ever clicks, which
// silently consumes that one-time token; the real click then finds it
// already spent, indistinguishable from "expired". Once the Reset Password
// email template is pointed at this page instead (see the Supabase
// dashboard's Auth → Email Templates), a scanner's plain HTTP GET just
// downloads inert static HTML — nothing is verified or consumed until this
// code actually runs inside a real browser, which is what makes this
// approach immune to that whole class of prefetcher. verifyOtp() is called
// explicitly here rather than relying on Supabase's implicit
// detectSessionInUrl handling of the old #access_token=... hash above.
(async function handleTokenHashRecovery() {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (!tokenHash || type !== "recovery") return;

    history.replaceState(null, "", window.location.pathname); // never leave the token sitting in the URL/history, reusable via back/refresh
    const { error } = await window.supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (error) {
        showAuthToast(_friendlyAuthError(error, "This reset link is invalid or has expired. Please request a new one."), "error");
        return;
    }
    openResetPasswordModal();
})();

// ── Prefetch-safe email change: ?token_hash=...&type=email_change ────────
// The Change Email confirmation email links to confirm-email.html (which, in the
// app, hands off to realmate://confirm-email and lands back here; on the web it
// forwards here directly) with the Supabase token_hash. Same rationale as the
// recovery flow above: nothing is verified until this real client code runs, so
// an email scanner's plain GET can't spend the one-time token. verifyOtp with
// type 'email_change' completes the secure change server-side and updates the
// account's login email — the existing Supabase mechanism, not a new one.
(async function handleTokenHashEmailChange() {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (!tokenHash || type !== "email_change") return;

    history.replaceState(null, "", window.location.pathname); // keep the one-time token out of the URL/history
    const { error } = await window.supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: "email_change" });
    if (error) {
        showAuthToast(_friendlyAuthError(error, "This email-change link is invalid or has expired. Please request a new one from Settings."), "error");
        return;
    }
    showAuthToast("Your email address has been confirmed and updated.", "success");
})();

// ── Resubmit verification docs: ?resubmit=<token> ───────────────────────
// A "documents requested" applicant (pre-approval, no session) taps the email
// button and lands here to re-upload their ID. The one-time token identifies
// their registration_reviews row; the file goes to the same verification-docs
// bucket, then the resubmit-documents Edge Function (service_role) flips the
// row back into the admin queue. See supabase/functions/resubmit-documents.
let _resubmitToken = null;
let _resubmitFile = null;

(async function handleResubmitFlow() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resubmit");
    if (!token) return;
    history.replaceState(null, "", window.location.pathname); // keep the token out of history
    _resubmitToken = token;
    try {
        const { data, error } = await window.supabaseClient.functions.invoke('resubmit-documents', { body: { action: 'validate', token } });
        if (error || !data || !data.ok) {
            showAuthToast((data && data.error) || "This link is invalid or has expired. Please contact support.", "error");
            return;
        }
        const forEl = document.getElementById('resubmitFor');
        if (forEl && data.email) forEl.textContent = 'For account ' + data.email;
        const modal = document.getElementById('resubmitDocsModal');
        if (modal) modal.style.display = 'flex';
    } catch (e) {
        showAuthToast("Couldn't open the upload form. Please try again.", "error");
    }
})();

function handleResubmitFileSelect(input) {
    const file = input.files && input.files[0];
    const nameEl = document.getElementById('resubmitFileName');
    const btn = document.getElementById('resubmitBtn');
    const err = document.getElementById('resubmitFileError');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (!file) { _resubmitFile = null; if (nameEl) nameEl.textContent = 'Choose file'; if (btn) btn.disabled = true; return; }
    const check = _validateAlveoFile(file);
    if (!check.ok) {
        _resubmitFile = null; input.value = '';
        if (nameEl) nameEl.textContent = 'Choose file';
        if (btn) btn.disabled = true;
        if (err) { err.textContent = check.message; err.style.display = 'block'; }
        return;
    }
    _resubmitFile = file;
    if (nameEl) nameEl.textContent = file.name;
    if (btn) btn.disabled = false;
}

async function submitResubmit() {
    if (!_resubmitFile || !_resubmitToken) return;
    const btn = document.getElementById('resubmitBtn');
    const btnText = document.getElementById('resubmitBtnText');
    const err = document.getElementById('resubmitFileError');
    if (err) err.style.display = 'none';
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Uploading…';
    try {
        const folder = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);
        const path = `${folder}/${Date.now()}_${_resubmitFile.name.replace(/\s/g, '_')}`;
        const { error: upErr } = await window.supabaseClient.storage
            .from('verification-docs').upload(path, _resubmitFile, { contentType: _resubmitFile.type });
        if (upErr) throw new Error('upload');
        const { data, error } = await window.supabaseClient.functions.invoke('resubmit-documents', { body: { action: 'submit', token: _resubmitToken, path } });
        if (error || !data || !data.ok) throw new Error((data && data.error) || 'submit');
        document.getElementById('resubmitForm').style.display = 'none';
        document.getElementById('resubmitDone').style.display = 'block';
    } catch (e) {
        const msg = (e && e.message && e.message !== 'upload' && e.message !== 'submit') ? e.message : "Something went wrong. Please try again.";
        if (err) { err.textContent = msg; err.style.display = 'block'; }
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Submit for Review';
    }
}

function closeResubmitModal() {
    const modal = document.getElementById('resubmitDocsModal');
    if (modal) modal.style.display = 'none';
    _resubmitToken = null; _resubmitFile = null;
}

// ── Auth Toast — replaces alert()/confirm() across the password reset flow ──
function escAuth(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

let _authToastTimer = null;
function _ensureAuthToastContainer() {
    let c = document.getElementById('authToastContainer');
    if (!c) {
        c = document.createElement('div');
        c.id = 'authToastContainer';
        c.className = 'auth-toast-container';
        c.setAttribute('aria-live', 'polite');
        c.setAttribute('aria-atomic', 'true');
        document.body.appendChild(c);
    }
    return c;
}

function showAuthToast(message, type = 'success', sub, autoDismissMs = 7000) {
    const container = _ensureAuthToastContainer();
    container.innerHTML = '';
    clearTimeout(_authToastTimer);

    const toast = document.createElement('div');
    toast.className = `auth-toast auth-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.tabIndex = -1;
    toast.innerHTML = `
        <i class="fas ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'} auth-toast-icon"></i>
        <div class="auth-toast-body">${escAuth(message)}${sub ? `<span class="auth-toast-sub">${escAuth(sub)}</span>` : ''}</div>
        <button type="button" class="auth-toast-close" aria-label="Dismiss notification">&times;</button>
    `;
    toast.querySelector('.auth-toast-close').onclick = hideAuthToast;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    toast.focus();

    if (autoDismissMs) _authToastTimer = setTimeout(hideAuthToast, autoDismissMs);
}

function hideAuthToast() {
    clearTimeout(_authToastTimer);
    const container = document.getElementById('authToastContainer');
    const toast = container && container.querySelector('.auth-toast');
    if (!toast) return;
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideAuthToast(); });

// Maps raw Supabase/network errors to user-friendly text — never surfaces
// the technical message itself.
function _friendlyAuthError(error, fallback) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return 'You appear to be offline. Please check your connection and try again.';
    }
    const name = (error && error.name) || '';
    const msg = ((error && error.message) || '').toLowerCase();
    // No recovery session behind the reset form — the link was never verified,
    // has expired, or was already used. Supabase returns AuthSessionMissingError
    // ("Auth session missing!") here. Retrying the same form can NEVER succeed,
    // so never tell the user to "try again" — send them to request a fresh link.
    if (name === 'AuthSessionMissingError' || msg.includes('session missing') || msg.includes('auth session')) {
        return 'This reset link has expired or has already been used. Please request a new password reset link.';
    }
    if (!msg) return fallback || 'Something went wrong. Please try again.';
    if (msg.includes('rate limit') || msg.includes('too many requests')) return 'Too many attempts. Please wait a moment before trying again.';
    if (msg.includes('expired')) return 'This reset link has expired. Please request a new one.';
    if ((msg.includes('invalid') || msg.includes('token')) && (msg.includes('token') || msg.includes('otp') || msg.includes('code') || msg.includes('link'))) {
        return 'This reset link is invalid or has already been used. Please request a new one.';
    }
    if (msg.includes('not found')) return "We couldn't find an account with that email or username.";
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('failed to fetch')) return 'Network error. Please check your connection and try again.';
    if (msg.includes('weak') || (msg.includes('password') && msg.includes('should'))) return "That password doesn't meet the security requirements.";
    if (msg.includes('5') && msg.includes('server')) return 'A server error occurred. Please try again shortly.';
    return fallback || 'Something went wrong. Please try again.';
}

function togglePassword(id, icon){
  let input = document.getElementById(id)
  if(input.type==="password"){
    input.type="text"
    icon.classList.replace("fa-eye","fa-eye-slash")
  } else {
    input.type="password"
    icon.classList.replace("fa-eye-slash","fa-eye")
  }
}

// Whether the user has completed the legal review (scrolled to the bottom and
// pressed "I acknowledge and accept" in the full agreement). Drives the whole
// Create Account flow: before it's true the primary button reads "Review Legal
// Terms" and the acceptance checkbox is hidden; after it's true the checkbox
// appears and the button becomes "Create Account".
let _legalAccepted = false;

// Post-first onboarding: after posting a listing the card reads "Create an account
// to see your matches"; opened from Sign In / marketing it's a plain sign-up.
function openRegister(){
    const posted = !!(window.rmObHasListing && window.rmObHasListing());
    const t = document.getElementById("regTitle");
    if (t) t.textContent = posted ? "Create an account to see your matches" : "Create your account";
    const n = document.getElementById("regObNote");
    if (n) n.style.display = posted ? "" : "none";
    document.getElementById("registerModal").style.display="flex"; resetLegalFlow();
}
// Closing the Create Account modal (× , outside click, or after submit) resets the
// legal-review flow so the user must review + accept again next time. After a
// post-first listing, × goes to the marketing page (no forced sign-up); the
// listing stays saved with the visitor's session for when they come back.
function closeRegister(){
    document.getElementById("registerModal").style.display="none"; resetLegalFlow();
    if (window.rmObHasListing && window.rmObHasListing() && !window.__rmObSignedUp) {
        try { localStorage.setItem('rm_seen_marketing','1'); } catch (e) {}
        location.href = 'marketing.html';
    }
}

// The primary button is dual-purpose. Before acceptance it opens the legal review;
// after acceptance it submits the registration.
function handleRegPrimary(){
    if (!_legalAccepted){ openTerms(); return; }
    registerUser();
}
function setRegPrimaryLabel(text){
    const t = document.getElementById("btnText");
    if (t) t.textContent = text;
}

// ── Legal review gating ──────────────────────────────────────────────────────
// The "I acknowledge and accept" button inside the full agreement stays locked
// until the user has scrolled to the very bottom (legal-review.html posts
// 'rm-legal-reviewed' — never on a timer or merely on open).
function lockTermsAccept(){
    const b = document.getElementById("termsAcceptBtn");
    if (b){ b.disabled = true; b.style.opacity = ".5"; b.style.cursor = "not-allowed"; }
    const h = document.getElementById("termsScrollHint");
    if (h) h.style.display = "block";
}
function unlockTermsAccept(){
    const b = document.getElementById("termsAcceptBtn");
    if (b){ b.disabled = false; b.style.opacity = ""; b.style.cursor = "pointer"; }
    const h = document.getElementById("termsScrollHint");
    if (h) h.style.display = "none";
}
// Reset the entire legal-review + acceptance state: no acceptance, checkbox hidden
// and unchecked, review accept button re-locked, primary button back to "Review
// Legal Terms". Used on open, on Create Account close, and on the review's ×.
function resetLegalFlow(){
    _legalAccepted = false;
    const checkbox = document.getElementById("termsCheckbox");
    const checkboxArea = document.getElementById("checkboxArea");
    if (checkbox) checkbox.checked = false;
    if (checkboxArea) checkboxArea.style.display = "none";
    lockTermsAccept();
    setRegPrimaryLabel("Review Legal Terms");
    if (typeof toggleRegButton === "function") toggleRegButton();
}
// The × / outside click on the legal agreement resets EVERYTHING (requirement:
// the user must go through the agreement again; no scroll/acceptance carries over).
function dismissTerms(){ document.getElementById("termsModal").style.display = "none"; resetLegalFlow(); }
// legal-review.html tells us (same-origin postMessage) when the user has read to
// the bottom — or when the content is short enough to need no scrolling.
window.addEventListener("message", function(e){
    if (e && e.data === "rm-legal-reviewed") unlockTermsAccept();
});
function openPurpose() { document.getElementById("purposeModal").style.display = "flex"; }
function closePurpose() { document.getElementById("purposeModal").style.display = "none"; }

// 🔥 UPDATED: OPEN TERMS AND REFRESH IFRAME
function openTerms() {
    document.getElementById("termsModal").style.display = "flex";
    lockTermsAccept(); // fresh review — user must scroll to the bottom again
    const iframe = document.getElementById("termsFrame");
    if(iframe) iframe.src = iframe.src; // Reloads the frame (re-runs the scroll gate)
}

// Accept action — only reachable once the review accept button is unlocked (i.e.
// the user scrolled to the very bottom). Closes the agreement, reveals the now-
// enabled checkbox, and flips the primary button to "Create Account".
function closeTerms() {
    document.getElementById("termsModal").style.display = "none";
    _legalAccepted = true;
    const checkbox = document.getElementById("termsCheckbox");
    const checkboxArea = document.getElementById("checkboxArea");
    if (checkboxArea) checkboxArea.style.display = "";
    if (checkbox) { checkbox.disabled = false; checkbox.checked = true; }
    setRegPrimaryLabel("Create Account");
    toggleRegButton();
}

// Single gate for the primary button.
//  • Before legal acceptance: the button reads "Review Legal Terms" and is always
//    clickable (it opens the agreement).
//  • After acceptance: the button reads "Create Account" and is enabled only when
//    the acceptance checkbox is ticked AND the username is confirmed available.
// The Alveo ID is OPTIONAL (Guideline 5.1.1) so it is NOT part of this gate.
function toggleRegButton() {
    const checkbox = document.getElementById("termsCheckbox");
    const regBtn = document.getElementById("regBtn");
    if (!regBtn) return;
    if (!_legalAccepted) { regBtn.disabled = false; return; }
    regBtn.disabled = !(checkbox && checkbox.checked);
}

// ── Alveo ID upload ──────────────────────────────────────────
const ALVEO_MAX_BYTES = 5 * 1024 * 1024; // 5MB — matches the bucket's file_size_limit
const ALVEO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALVEO_ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];

let _selectedAlveoFile = null;

// Client-side check — a first line of defense for a fast/clear error
// message. The bucket itself (allowed_mime_types/file_size_limit, see
// alveo-id-storage-setup.sql) is the real enforcement layer a malicious
// client can't bypass just by skipping this function.
function _validateAlveoFile(file) {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALVEO_ALLOWED_TYPES.includes(file.type) && !ALVEO_ALLOWED_EXT.includes(ext)) {
        return { ok: false, message: "Please upload a JPG, JPEG, PNG, or PDF file." };
    }
    if (file.size > ALVEO_MAX_BYTES) {
        return { ok: false, message: "File is too large. Maximum size is 5MB." };
    }
    return { ok: true };
}

function showAlveoFileError(message) {
    const errEl = document.getElementById("alveoFileError");
    const wrap = document.getElementById("alveoUploadWrap");
    if (errEl) { errEl.textContent = message; errEl.style.display = message ? "block" : "none"; }
    if (wrap) wrap.classList.toggle("error", !!message);
}

function handleAlveoFileSelect(input) {
    const file = input.files && input.files[0];
    const nameEl = document.getElementById("alveoFileName");
    const wrap = document.getElementById("alveoUploadWrap");
    if (!file) {
        _selectedAlveoFile = null;
        if (nameEl) nameEl.textContent = "Upload Professional ID";
        if (wrap) wrap.classList.remove("has-file");
        toggleRegButton();
        return;
    }
    const check = _validateAlveoFile(file);
    if (!check.ok) {
        _selectedAlveoFile = null;
        input.value = ""; // clear the invalid selection so it can't be silently submitted
        if (nameEl) nameEl.textContent = "Upload Professional ID";
        if (wrap) wrap.classList.remove("has-file");
        showAlveoFileError(check.message);
        toggleRegButton();
        return;
    }
    _selectedAlveoFile = file;
    showAlveoFileError(""); // clears the error state
    if (nameEl) nameEl.textContent = file.name;
    if (wrap) wrap.classList.add("has-file");
    toggleRegButton();
}

function showError(input, show){
  let error=input.nextElementSibling
  if(show){
    input.classList.add("error")
    if(error && error.classList.contains('error-text')) error.style.display="block"
  } else {
    input.classList.remove("error")
    if(error && error.classList.contains('error-text')) error.style.display="none"
  }
}

function validateName(i){ showError(i,i.value.trim().length<2) }
function validatePhone(i){ const v=i.value.trim(); showError(i, v!=="" && !/^[0-9]{10,13}$/.test(v)) }
// Any valid email may register. Alveo business emails (exactly @alveoland.com,
// case-insensitive) make admin approval easier, but ALL registrations still
// upload an Alveo ID for verification (see registerUser + the NOT NULL
// alveo_id_file column in registration-approval-migration.sql). isAlveoEmail
// stays available for the "easier approval" signal; on-blur validation and the
// register gate use general email-format validation instead.
const ALVEO_EMAIL_RE = /^[^\s@]+@alveoland\.com$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isAlveoEmail(v){ return ALVEO_EMAIL_RE.test((v || '').trim()); }
function isValidEmail(v){ return EMAIL_RE.test((v || '').trim()); }
function validateEmail(i){ showError(i,!isValidEmail(i.value)) }
function validatePassword(i){ showError(i,!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(i.value)) }
function validateBirthday(){
  const input = document.getElementById("birthday");
  const wrapper = document.getElementById("birthdayPicker");
  if (!input || !wrapper) return;
  if (!input.value) { showError(wrapper, false); return; } // birthday optional — blank is valid
  let year = input.value.split("-")[0];
  let currentYear = new Date().getFullYear();
  showError(wrapper, year.length !== 4 || year > currentYear - 18 || year < currentYear - 100);
}

// ── Modern Birthday date picker — replaces the browser-native <input
// type="date">. #birthday stays a hidden input holding the same
// "YYYY-MM-DD" value registerUser() already reads, so nothing downstream
// needed to change; this only replaces how that value gets set. ──────────
(function () {
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const hiddenInput = document.getElementById('birthday');
  const wrapper = document.getElementById('birthdayPicker');
  const trigger = document.getElementById('birthdayTrigger');
  const displayText = document.getElementById('birthdayDisplayText');
  const popup = document.getElementById('birthdayPopup');
  const monthSelect = document.getElementById('birthdayMonthSelect');
  const yearSelect = document.getElementById('birthdayYearSelect');
  const grid = document.getElementById('birthdayGrid');
  const prevBtn = document.getElementById('birthdayPrevMonth');
  const nextBtn = document.getElementById('birthdayNextMonth');
  if (!hiddenInput || !wrapper || !trigger) return; // guard: only runs on pages with this markup

  const today = new Date();
  const MIN_YEAR = today.getFullYear() - 100;
  const MAX_YEAR = today.getFullYear() - 18; // matches validateBirthday()'s 18-100 range — the picker can't select an already-invalid date

  let viewYear = MAX_YEAR;
  let viewMonth = 0;
  let selected = null; // {y, m, d} once a date has been chosen

  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });
  for (let y = MAX_YEAR; y >= MIN_YEAR; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSelect.appendChild(opt);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isToday = (y, m, d) => y === today.getFullYear() && m === today.getMonth() && d === today.getDate();

  function renderGrid() {
    monthSelect.value = String(viewMonth);
    yearSelect.value = String(viewYear);
    grid.innerHTML = '';

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const filler = document.createElement('span');
      filler.className = 'rm-date-cell rm-date-cell-empty';
      grid.appendChild(filler);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'rm-date-cell';
      cell.textContent = String(d);
      cell.setAttribute('data-day', String(d));
      if (selected && selected.y === viewYear && selected.m === viewMonth && selected.d === d) cell.classList.add('selected');
      if (isToday(viewYear, viewMonth, d)) cell.classList.add('today');
      cell.addEventListener('click', () => selectDate(viewYear, viewMonth, d));
      grid.appendChild(cell);
    }
  }

  function selectDate(y, m, d) {
    selected = { y, m, d };
    hiddenInput.value = `${y}-${pad(m + 1)}-${pad(d)}`;
    displayText.textContent = `${MONTH_NAMES[m]} ${d}, ${y}`;
    displayText.classList.remove('rm-date-placeholder');
    closePopup();
    trigger.focus();
    validateBirthday();
  }

  function clampView() {
    if (viewYear > MAX_YEAR) { viewYear = MAX_YEAR; }
    if (viewYear < MIN_YEAR) { viewYear = MIN_YEAR; }
  }

  function openPopup() {
    popup.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    renderGrid();
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onPopupKeydown, true);
  }

  function closePopup() {
    popup.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onPopupKeydown, true);
    validateBirthday();
  }

  function togglePopup() {
    if (popup.classList.contains('open')) closePopup();
    else openPopup();
  }

  function onOutsideClick(e) {
    if (!wrapper.contains(e.target)) closePopup();
  }

  // Arrow keys move by day/week (crossing month boundaries when needed),
  // Home/End jump to the first/last day of the visible month, Escape closes.
  function onPopupKeydown(e) {
    if (e.key === 'Escape') { closePopup(); trigger.focus(); return; }
    const cell = e.target.closest && e.target.closest('.rm-date-cell:not(.rm-date-cell-empty)');
    if (!cell) return;

    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in deltas) {
      e.preventDefault();
      const current = new Date(viewYear, viewMonth, parseInt(cell.dataset.day, 10));
      current.setDate(current.getDate() + deltas[e.key]);
      focusDay(current.getFullYear(), current.getMonth(), current.getDate());
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusDay(viewYear, viewMonth, 1);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusDay(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());
    }
  }

  function focusDay(y, m, d) {
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    const viewChanged = y !== viewYear || m !== viewMonth;
    viewYear = y; viewMonth = m;
    if (viewChanged) renderGrid();
    const target = grid.querySelector(`.rm-date-cell[data-day="${d}"]`);
    if (target) target.focus();
  }

  trigger.addEventListener('click', togglePopup);

  monthSelect.addEventListener('change', () => { viewMonth = parseInt(monthSelect.value, 10); renderGrid(); });
  yearSelect.addEventListener('change', () => { viewYear = parseInt(yearSelect.value, 10); renderGrid(); });

  prevBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    clampView();
    renderGrid();
  });
  nextBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    clampView();
    renderGrid();
  });
})();

function showLoginError(msg, title) {
  const el = document.getElementById("loginError");
  if (!el) return;
  const span = el.querySelector("span");
  span.textContent = "";
  if (title) {
    const strong = document.createElement("strong");
    strong.textContent = title + ". ";
    span.appendChild(strong);
  }
  span.appendChild(document.createTextNode(msg));
  el.style.display = "flex";
  // shake the form card
  const container = document.querySelector(".container");
  container.style.animation = "none";
  container.offsetHeight;
  container.style.animation = "loginShake 0.35s ease";
}

function clearLoginError() {
  const el = document.getElementById("loginError");
  if (el) el.style.display = "none";
}

// Desktop-only Enter-to-submit for the login form (mirrors clicking Sign
// In exactly, since it just calls login() — same validation, auth,
// loading state, and error/success handling). Gated to the same
// >950px breakpoint where style.css switches out of the mobile layout.
// Guards against double-submit while a request is already in flight,
// since login() only disables loginBtn — it doesn't ignore a second
// programmatic call the way a disabled <button> ignores a second click.
function handleLoginEnterKey() {
  if (window.innerWidth <= 950) return;
  if (document.getElementById("loginBtn").disabled) return;
  login();
}

// The login <form>'s onsubmit handler — routes Enter/Go (mobile + desktop)
// through one guarded path so the form never GET-reloads the page and login()
// can't double-fire signInWithPassword.
function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  var b = document.getElementById("loginBtn");
  if (b && b.disabled) return false;
  login();
  return false;
}

// Forget the saved Face ID sign-in: the stored account is gone or its password
// is stale, so drop the Keychain credentials + the enabled flag and hide the
// button so it stops suggesting a deleted/invalid account.
async function _rmBioForget(){
  try { if (window.rmBio && window.rmBio.setEnabled) await window.rmBio.setEnabled(false); } catch (e) {}
  try { if (window.rmBio && window.rmBio.clearCredentials) await window.rmBio.clearCredentials(); } catch (e) {}
  // Re-allow the enable offer so the user can turn Face ID back on for a valid
  // account the next time they sign in with their password.
  try { localStorage.removeItem("rm_bio_prompted"); } catch (e) {}
  var btn = document.getElementById("bioLoginBtn"); if (btn) btn.style.display = "none";
  var id = document.getElementById("loginIdentifier"); if (id) id.value = "";
  var pw = document.getElementById("password"); if (pw) pw.value = "";
}

// In-app "Enable Face ID?" confirmation (returns a Promise<boolean>). Replaces
// window.confirm(), which silently returns false inside the Capacitor WebView.
function _bioEnablePrompt(typeName){
  return new Promise(function(resolve){
    var m = document.getElementById("bioEnableModal");
    if (!m) { resolve(false); return; }
    var t = typeName || "biometrics";
    var title = document.getElementById("bioEnableTitle");
    if (title) title.textContent = "Enable " + t + "?";
    var msg = document.getElementById("bioEnableMsg");
    if (msg) msg.textContent = "Sign in faster next time with " + t + ". Your password is never stored — it stays in your device's secure keychain.";
    var done = false;
    window.__bioEnableResolve = function(v){
      if (done) return; done = true;
      m.style.display = "none";
      window.__bioEnableResolve = null;
      resolve(!!v);
    };
    m.style.display = "flex";
  });
}

async function login(opts){
  const fromBio = !!(opts && opts.fromBio);
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn && loginBtn.disabled) return;   // guard against double-submit
  const loginBtnText = document.getElementById("loginBtnText");
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("password").value;

  clearLoginError();

  if(!identifier || !password) {
    showLoginError("Please enter your email or username and password.");
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.innerHTML = '<span class="spinner"></span> Signing in…';

  try {
    let emailToLogin = identifier;

    if (!identifier.includes("@")) {
      // Log in by USERNAME (case-insensitive) — resolve it to the account email.
      const foundEmail = await _emailForUsername(identifier);
      if (!foundEmail) {
        if (fromBio) {
          await _rmBioForget();
          showLoginError("That saved account no longer exists. Face ID sign-in has been reset — please sign in with your password.");
        } else {
          // Don't reveal whether a username exists (prevents account enumeration):
          // return the SAME generic error as a real credential failure.
          showLoginError("Incorrect email or password. Please try again.");
        }
        return;
      }
      emailToLogin = foundEmail;
    }

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (error) {
      const lower = error.message.toLowerCase();
      if (fromBio && lower.includes("invalid")) {
        // The saved account was deleted (or its password changed) — the stored
        // Keychain credentials are stale, so forget them instead of re-suggesting.
        await _rmBioForget();
        showLoginError("Your saved Face ID sign-in is no longer valid and has been reset. Please sign in with your password.");
        return;
      }
      const msg = lower.includes("invalid")
        ? "Incorrect email or password. Please try again."
        : error.message;
      showLoginError(msg);
      return;
    }

    const authUser = data.user;

    // Account-active check. Since 2026-11-02 every new account is active the
    // moment it's created (complete-signup / the registration trigger write
    // 'Approved' = active) — there is no admin approval step any more. A row
    // with any other status is a legacy rejected account, and no row means the
    // account was never set up; neither may sign in.
    const { data: review, error: reviewErr } = await window.supabaseClient
      .from('registration_reviews')
      .select('account_status')
      .eq('id', authUser.id)
      .maybeSingle();

    if (reviewErr) {
      await window.supabaseClient.auth.signOut({ scope: 'local' });
      showLoginError("We couldn't verify your account status. Please check your connection and try again.");
      return;
    }
    if (!review || review.account_status !== 'Approved') {
      await window.supabaseClient.auth.signOut({ scope: 'local' });
      showLoginError("This account isn't active. Please contact information.realmate@gmail.com for help.", "Account Not Active");
      return;
    }

    // Ban gate — a suspended member can never sign in (checked before the
    // deactivation auto-reactivation below, so a banned account is never revived).
    // A missing 'banned' column (migration not run) is treated as not banned.
    try {
      const { data: bprof, error: berr } = await window.supabaseClient
        .from('profiles').select('banned').eq('id', authUser.id).maybeSingle();
      if (!berr && bprof && bprof.banned === true) {
        await window.supabaseClient.auth.signOut({ scope: 'local' });
        showLoginError(
          "Your account has been suspended and can no longer sign in. If you believe this is a mistake, please contact information.realmate@gmail.com.",
          "Account Suspended"
        );
        return;
      }
    } catch (e) { /* banned column absent — treat as not banned */ }

    // Logging in AUTOMATICALLY reactivates a DEACTIVATED account (the user was
    // told this when they deactivated). Guarded in its own try/catch and a
    // separate query so a database without the deactivation columns (migration
    // not run yet) can never break sign-in.
    try {
      const { data: dprof, error: derr } = await window.supabaseClient
        .from('profiles').select('deactivated').eq('id', authUser.id).maybeSingle();
      if (!derr && dprof && dprof.deactivated) {
        await window.supabaseClient.from('profiles')
          .update({ deactivated: false, reactivate_at: null, deactivated_at: null })
          .eq('id', authUser.id);
      }
    } catch (e) { /* deactivation columns absent — nothing to reactivate */ }

    // Store basic info and redirect immediately. Fetch the real profile first
    // so the avatar (and name/nickname) are correct from the very first paint —
    // otherwise the nav "Me" tab and the create-post avatar fall back to a
    // generated placeholder until some later page happens to refresh the cache.
    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('full_name, nickname, avatar_url')
      .eq('id', authUser.id)
      .maybeSingle();

    const meta = authUser.user_metadata || {};
    const fullName = (profile && profile.full_name)
      || `${meta.first_name || ''} ${meta.last_name || ''}`.trim()
      || emailToLogin;
    // A ui-avatars.com URL is an auto-generated initials placeholder, not a
    // real uploaded photo — it bakes in whatever name was current when
    // generated, so trusting a stored one as-is shows stale initials forever
    // after a rename. Regenerate fresh from the current name whenever
    // there's no real upload; a genuine upload is always used as-is.
    const _storedAvatar = profile && profile.avatar_url;
    const _hasRealPhoto = _storedAvatar && !_storedAvatar.includes('ui-avatars.com');
    localStorage.setItem("user", JSON.stringify({
      id: authUser.id,
      email: authUser.email,
      name: fullName,
      nickname: (profile && profile.nickname) || '',
      image: _hasRealPhoto ? _storedAvatar
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0f172a&color=32cd32`,
      job: '', division: '', group: '', team: '', bio: ''
    }));
    localStorage.setItem("isGuest", "false");

    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<span class="spinner"></span> Redirecting…';

    // Shows the "Account Approved" framing once per approved account (a
    // one-time welcome-back notice), then falls back to the plain success
    // message on every login after that.
    const successEl = document.getElementById("loginSuccess");
    const successSpan = successEl.querySelector("span");
    successSpan.textContent = (opts && opts.fromSignup)
      ? "Welcome to realmate! Taking you to your listing…"
      : "Login successful. Redirecting you now…";
    successEl.style.display = "flex";
    // Remember Me — record the choice. Checked (default) keeps the Supabase
    // session persisted (the app stays signed in); unchecked drops it on the
    // next fresh app launch (see auth-guard.js). Only the session token is
    // stored — never the password.
    try {
      var _remember = !document.getElementById("rememberMe") || document.getElementById("rememberMe").checked;
      localStorage.setItem("rm_remember", _remember ? "1" : "0");
      sessionStorage.setItem("rm_session", "1");
    } catch (e) {}

    // Biometric login (native only). Auto-enable Face ID / Touch ID after a
    // successful password sign-in on a capable device, so the shortcut "just
    // works" next time instead of depending on a prompt the WebView may swallow.
    // The credential is stored ONLY in the iOS Keychain (never plain text), and
    // it's fully reversible in Settings — turning it off there sets rm_bio_optout
    // so we don't re-enable against the user's choice. When already enabled we
    // just refresh the stored credential (e.g. after a password change).
    try {
      if (window.rmBio && window.rmBio.isNative && (await window.rmBio.available())) {
        if (await window.rmBio.isEnabled()) {
          await window.rmBio.saveCredentials(identifier, password);
        } else if (localStorage.getItem("rm_bio_optout") !== "1") {
          await window.rmBio.setEnabled(true);
          await window.rmBio.saveCredentials(identifier, password);
          try { var _bt = await window.rmBio.typeName(); showAuthToast("Sign in with " + _bt + " is on — manage it anytime in Settings.", "success", null, 5000); } catch (e) {}
        }
      }
    } catch (e) {}

    // Mobile / native app lands in the persistent tab shell (app.html); desktop
    // web keeps its sidebar layout. Opens on Portal, matching the old target.
    // A brand-new account from post-first onboarding opens on the Portal, where
    // the listing they just posted is waiting with its matches.
    var _rmDest = (window.Capacitor || window.matchMedia("(max-width: 900px)").matches)
      ? "app.html?tab=" + ((opts && opts.fromSignup) ? "portal" : _rmStartTab()) : "livemarket.html";
    // Drop the dark curtain over the login and navigate — app.html starts under a
    // matching curtain (rm_enter_app) and lifts it once the app is ready, so login
    // -> app is the same smooth fade-through-dark. Falls back to a plain navigation.
    setTimeout(() => {
        try { if (window.rmCurtainLeaveTo) { window.rmCurtainLeaveTo(_rmDest, 'rm_enter_app'); return; } } catch (e) {}
        location.href = _rmDest;
    }, 1400);

  } catch(err) {
    showLoginError("Something went wrong. Please try again.");
  } finally {
    if (document.getElementById("loginBtn").disabled) {
      loginBtn.disabled = false;
      loginBtnText.innerHTML = "Sign In";
    }
  }
}

let _forgotInFlight = false;
let _forgotCooldownUntil = 0;

async function forgotPassword() {
  if (_forgotInFlight || Date.now() < _forgotCooldownUntil) return; // in-flight or cooling down — link is disabled either way, but never trust that alone
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const forgotLink = document.getElementById("forgotLink");
  if (!identifier) {
    showAuthToast("Please enter your email or username first.", "error");
    return;
  }

  _forgotInFlight = true;
  const originalText = forgotLink.innerText;
  forgotLink.innerHTML = '<span class="spinner" style="width:11px;height:11px;border-color:rgba(50,205,50,0.3);border-bottom-color:var(--primary);"></span> Sending…';
  forgotLink.style.pointerEvents = "none";
  forgotLink.style.opacity = "0.6";

  try {
    let emailToReset = identifier;
    if (!identifier.includes("@")) {
        const foundEmail = await _emailForUsername(identifier);
        if (foundEmail) emailToReset = foundEmail;
        else {
            showAuthToast("We couldn't find an account with that email or username.", "error");
            return;
        }
    } else {
        // Email entered directly. Reject an invalid format, and — crucially — only
        // send a reset link when an account is actually REGISTERED with this email.
        // Supabase's resetPasswordForEmail reports success for ANY address (to
        // avoid enumeration), so without this a link is "sent" to unregistered /
        // fake emails (e.g. the tite@puke.com report).
        if (!isValidEmail(emailToReset)) {
            showAuthToast("Please enter a valid email address.", "error");
            return;
        }
        const exists = await _accountExistsForEmail(emailToReset);
        if (!exists) {
            showAuthToast("We couldn't find an account registered with that email.", "error");
            return;
        }
    }
    // Hardcoded to the real production URL, never window.location.origin —
    // this value gets embedded in an actual email that may be opened from
    // any device, not necessarily whatever machine triggered the request.
    // Using the request's own origin meant a reset tested from a local dev
    // server baked a redirect_to=http://127.0.0.1:.../index.html into the
    // real email, which is exactly the kind of link corporate email
    // scanners (Trellix/FireEye, etc.) flag as suspicious — a redirect
    // through a loopback address is never legitimate for a real recipient.
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(emailToReset, {
      redirectTo: "https://realmate.ph/index.html",
    });
    if (error) {
      showAuthToast(_friendlyAuthError(error, "Could not send the reset link. Please try again."), "error");
    } else {
      showAuthToast(
        `Password reset link sent to ${emailToReset}.`,
        "success",
        "Didn't see it? Check your Spam or Junk folder."
      );
      _startForgotCooldown(60);
    }
  } catch (err) {
    showAuthToast(_friendlyAuthError(err, "Something went wrong. Please try again."), "error");
  } finally {
    _forgotInFlight = false;
    if (Date.now() >= _forgotCooldownUntil) {
      forgotLink.innerText = originalText;
      forgotLink.style.pointerEvents = "auto";
      forgotLink.style.opacity = "1";
    }
  }
}

// Blocks repeated reset-email requests for `seconds`, showing a live
// countdown on the link itself so it's obvious another one isn't needed yet.
function _startForgotCooldown(seconds) {
  const forgotLink = document.getElementById("forgotLink");
  _forgotCooldownUntil = Date.now() + seconds * 1000;
  forgotLink.style.pointerEvents = "none";
  forgotLink.style.opacity = "0.6";
  (function tick() {
    const remaining = Math.ceil((_forgotCooldownUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      forgotLink.innerText = "Forgot password?";
      forgotLink.style.pointerEvents = "auto";
      forgotLink.style.opacity = "1";
      return;
    }
    forgotLink.innerText = `Resend available in ${remaining}s`;
    setTimeout(tick, 1000);
  })();
}

let _updatingPassword = false;

async function handleUpdatePassword() {
  if (_updatingPassword) return;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmNewPassword").value;
  const updateBtn = document.getElementById("updateBtn");
  const updateBtnText = document.getElementById("updateBtnText");

  if (!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(newPassword)) {
    showAuthToast("Password must be at least 8 characters, with 1 uppercase letter and 1 number.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    showAuthToast("Passwords do not match. Please re-enter them.", "error");
    return;
  }

  _updatingPassword = true;
  updateBtn.disabled = true;
  updateBtnText.innerHTML = '<span class="spinner"></span> Saving...';
  try {
    const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      showAuthToast(_friendlyAuthError(error, "Could not update your password. Please try again."), "error");
      // When the recovery session is gone (expired/used link), the form can
      // never succeed — close it so the user lands back on Sign In and can
      // request a fresh reset link instead of retrying a dead form.
      if (error.name === 'AuthSessionMissingError' || /session missing|auth session/i.test(error.message || '')) {
        history.replaceState(null, "", window.location.pathname);
        closeResetPasswordModal();
      }
      return;
    }
    // Ends the temporary recovery session and strips the token from the
    // URL/history so the same link can't be replayed to reopen this flow —
    // the recovery token itself is already single-use server-side, but this
    // closes the client-side door too (refresh, back button, etc.).
    try { await window.supabaseClient.auth.signOut({ scope: 'local' }); } catch (_) {}
    history.replaceState(null, "", window.location.pathname);
    _showResetSuccessState();
  } catch (err) {
    showAuthToast(_friendlyAuthError(err, "Something went wrong. Please try again."), "error");
  } finally {
    _updatingPassword = false;
    if (updateBtn.disabled) {
      updateBtn.disabled = false;
      updateBtnText.innerHTML = "Save New Password";
    }
  }
}

function _showResetSuccessState() {
  const content = document.querySelector("#updatePasswordModal .modal-content");
  if (!content) return;
  content.innerHTML = `
    <div style="text-align:center; padding: 10px 0;">
      <i class="fas fa-circle-check" style="font-size:44px;color:#22c55e;margin-bottom:14px;display:block;"></i>
      <h3 style="margin-bottom:8px;">Password Updated</h3>
      <p style="font-size:13px;color:#64748b;margin-bottom:24px;line-height:1.5;">Password reset successfully. You can now sign in with your new password.</p>
      <button class="btn" onclick="closeResetPasswordModal()">Back to Sign In</button>
    </div>`;
  showAuthToast("Password reset successfully.", "success");
}

function closeResetPasswordModal() {
  const modal = document.getElementById("updatePasswordModal");
  if (modal) modal.style.display = "none";
}

// Cache result of username check so submit doesn't need to re-query.
// _lastCheckedUsername is stored lowercased since the check itself is
// case-insensitive — "Eris"/"eris"/"ERIS" all resolve to the same lookup.
let _usernameAvailable = null;
let _lastCheckedUsername = '';
let _usernameCheckTimer = null;

// Escape ILIKE's own wildcard characters (% and _) so a username that
// happens to contain them is still matched literally rather than as a
// pattern — otherwise e.g. "eris_" could match unrelated usernames.
function _escapeIlike(s) { return s.replace(/[%_]/g, ch => '\\' + ch); }

// Resolve a username to its account email, CASE-INSENSITIVELY, from profiles
// (the source of truth). Returns the
// email or null. Used for login and password reset so "Sayr", "sayr", and
// "SAYR" all reach the same account. limit(1) (not maybeSingle) avoids a
// multi-row error if legacy data ever holds a case-variant duplicate.
async function _emailForUsername(username) {
  const u = _escapeIlike(String(username).trim());
  if (!u) return null;
  try {
    const { data } = await window.supabaseClient.from('profiles').select('email').ilike('username', u).limit(1);
    if (data && data[0] && data[0].email) return data[0].email;
  } catch (e) {}
  return null;
}

// Ask the validate-email edge function whether this address's domain can receive
// mail (MX/A lookup — impossible in the browser). Returns false ONLY when the
// server positively determines it's undeliverable; returns true on any error or
// if the function isn't reachable/deployed (FAIL-OPEN — never block a real signup
// on an outage). Registration stays fully functional even before the function is
// deployed; the gate simply activates once it is.
async function _isEmailDeliverable(email) {
  try {
    const { data, error } = await window.supabaseClient.functions.invoke('validate-email', { body: { email } });
    if (error) return true;                         // missing / errored → fail-open
    if (data && data.deliverable === false) return false;
    return true;
  } catch (e) { return true; }                      // network error → fail-open
}

// Does an account exist with this EMAIL (case-insensitively), in profiles?
// Mirrors _emailForUsername so password reset only fires for a
// real, registered account. (Supabase's resetPasswordForEmail otherwise reports
// success for any address — "sending" a link to unregistered / fake emails.)
async function _accountExistsForEmail(email) {
  const e = _escapeIlike(String(email).trim());
  if (!e) return false;
  try {
    const { data } = await window.supabaseClient.from('profiles').select('id').ilike('email', e).limit(1);
    if (data && data.length) return true;
  } catch (err) {}
  return false;
}

// Is a username already taken (case-insensitively), in profiles?
async function _usernameTaken(username) {
  const u = _escapeIlike(String(username).trim());
  if (!u) return false;
  try {
    const { data } = await window.supabaseClient.from('profiles').select('id').ilike('username', u).limit(1);
    if (data && data.length) return true;
  } catch (e) {}
  return false;
}

function setUsernameChecking() {
  const input = document.getElementById("regUsername");
  const status = document.getElementById("usernameStatus");
  _usernameAvailable = null; // pending — keeps Create Account disabled
  input.classList.remove("error");
  if (status) { status.textContent = "Checking…"; status.style.color = "#94a3b8"; }
  toggleRegButton();
}

// Debounced entry point for typing (oninput). Blur still calls
// checkUsernameAvailability() directly/immediately below.
function onUsernameInput() {
  const input = document.getElementById("regUsername");
  const username = input.value.trim();
  if (_usernameCheckTimer) clearTimeout(_usernameCheckTimer);
  if (!username) {
    _usernameAvailable = null;
    _lastCheckedUsername = '';
    input.classList.remove("error");
    const status = document.getElementById("usernameStatus");
    if (status) status.textContent = "";
    toggleRegButton();
    return;
  }
  setUsernameChecking();
  _usernameCheckTimer = setTimeout(checkUsernameAvailability, 400);
}

async function checkUsernameAvailability() {
  const input = document.getElementById("regUsername");
  const username = input.value.trim();
  const usernameLower = username.toLowerCase();
  if (!username) return;
  if (usernameLower === _lastCheckedUsername && _usernameAvailable !== null) {
    toggleRegButton();
    return;
  }
  _lastCheckedUsername = usernameLower;
  setUsernameChecking(); // safe to call even if already showing "Checking…"

  const status = document.getElementById("usernameStatus");
  // Case-insensitive check across BOTH the current (profiles) and legacy (Users)
  // tables, so "Eris", "eris", and "ERIS" are all treated as the same username
  // and a capitalization-only variant of an existing name is caught as taken.
  const taken = await _usernameTaken(username);

  // If the user kept typing while this query was in flight, its result is
  // stale — bail out rather than show a status for text that's no longer there.
  if (input.value.trim().toLowerCase() !== usernameLower) return;

  _usernameAvailable = !taken;
  input.classList.toggle("error", !_usernameAvailable);
  if (status) {
    if (_usernameAvailable) {
      status.textContent = "✓ Username is available.";
      status.style.color = "#16a34a";
    } else {
      status.textContent = "This username is already taken. Please choose another username.";
      status.style.color = "#ef4444";
    }
  }
  toggleRegButton();
}

function showRegToast(message, type = 'success') {
  const existing = document.getElementById('regToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'regToast';
  toast.style.cssText = `
    position:fixed; bottom:30px; left:50%; transform:translateX(-50%) translateY(20px);
    background:${type === 'error' ? '#ef4444' : '#0f172a'}; color:#fff;
    padding:14px 28px; border-radius:14px; font-size:14px; font-weight:700;
    box-shadow:0 20px 40px rgba(0,0,0,0.2); z-index:99999;
    border-left:4px solid ${type === 'error' ? '#fca5a5' : '#32cd32'};
    transition:all 0.3s ease; opacity:0;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Create Account — ONE server path (supabase/functions/complete-signup): the
// account is active at once (no admin approval), the legal acceptance is
// recorded, and a listing posted before sign-up (onboarding.js, anonymous
// session) becomes this account's — same listing id. Then the user is signed in
// automatically through the normal login() (no second sign-in system).
let _regSubmitting = false;
async function registerUser(){
  if (_regSubmitting) return;                       // double-tap guard
  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value;
  const professionalType = (document.getElementById("professionalType") || {}).value || "";

  if (firstName.length < 2) { validateName(document.getElementById("firstName")); showRegToast("Please enter your first name.", "error"); return; }
  if (!lastName) { showError(document.getElementById("lastName"), true); showRegToast("Please enter your last name.", "error"); return; }
  if (!isValidEmail(email)) { validateEmail(document.getElementById("regEmail")); showRegToast("Please enter a valid email address.", "error"); return; }
  if (!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(password)) { validatePassword(document.getElementById("regPassword")); showRegToast("Password must be at least 8 characters with an uppercase letter and a number.", "error"); return; }
  if (professionalType !== "salesperson" && professionalType !== "broker") {
    const pt = document.getElementById("professionalType");
    if (pt) showError(pt, true);
    showRegToast("Please select whether you are a Real Estate Salesperson or Broker.", "error");
    return;
  }
  const regBtn = document.getElementById("regBtn");
  const btnText = document.getElementById("btnText");
  _regSubmitting = true;                            // set BEFORE any await: a second tap stops here
  regBtn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Creating account…';
  try {
    // Deliverability check — reject fake / undeliverable domains. FAIL-OPEN: only
    // blocks when the server positively confirms the domain can't receive mail.
    const deliverable = await _isEmailDeliverable(email);
    if (deliverable === false) {
      validateEmail(document.getElementById("regEmail"));
      showRegToast("That email address doesn't appear to be a working, deliverable email. Please use a valid email you can access.", "error");
      return;
    }
    // The anonymous visitor's session (if they posted first) — the server takes
    // the account id from this verified token, never from the form.
    let token = null;
    try {
      const { data } = await window.supabaseClient.auth.getSession();
      const s = data && data.session;
      if (s && s.user && s.user.is_anonymous) token = s.access_token;
    } catch (e) {}
    const posted = !!(window.rmObHasListing && window.rmObHasListing());
    const res = await fetch(window.RM_ENV.url + "/functions/v1/complete-signup", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", apikey: window.RM_ENV.anonKey },
                             token ? { Authorization: "Bearer " + token } : {}),
      body: JSON.stringify({
        first_name: firstName, last_name: lastName, email, password,
        professional_type: professionalType, accepted_legal: true,
        source: posted ? "post-first" : "signup",
      }),
    });
    let out = {};
    try { out = await res.json(); } catch (e) {}
    if (!res.ok || !out.ok) {
      // A retry after the account was already made (lost connection on the first
      // try): the email now exists — just sign in with what they typed.
      if (out && out.code === "email_taken" && token) {
        const tryIn = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (!tryIn.error) { await window.supabaseClient.auth.signOut({ scope: "local" }); return _regFinish(email, password); }
      }
      showRegToast((out && out.error) || "We couldn't create your account. Please try again.", "error");
      return;
    }
    return _regFinish(email, password);
  } catch (err) {
    showRegToast("We couldn't reach realmate. Please check your connection and try again.", "error");
  } finally {
    _regSubmitting = false;
    regBtn.disabled = false;
    btnText.innerHTML = "Create Account";
  }
}

// Account ready → sign in automatically through the normal login() path.
function _regFinish(email, password){
  window.__rmObSignedUp = true;
  try { localStorage.removeItem("rm_ob_listing"); } catch (e) {}
  // The Portal shows this new account's match pop-up for the posted listing.
  try { localStorage.setItem("rm_ob_check_matches", String(Date.now())); } catch (e) {}
  document.getElementById("registerModal").style.display = "none";
  const id = document.getElementById("loginIdentifier"), pw = document.getElementById("password");
  if (id) id.value = email;
  if (pw) pw.value = password;
  return login({ fromSignup: true });
}

function checkPassword(){
  let val = document.getElementById("regPassword").value
  let bar = document.getElementById("passwordBar")
  let score = 0
  document.getElementById("rule1").classList.remove("valid")
  document.getElementById("rule2").classList.remove("valid")
  document.getElementById("rule3").classList.remove("valid")
  if(val.length >= 8){ document.getElementById("rule1").classList.add("valid"); score++ }
  if(/[A-Z]/.test(val)){ document.getElementById("rule2").classList.add("valid"); score++ }
  if(/[0-9]/.test(val)){ document.getElementById("rule3").classList.add("valid"); score++ }
  bar.style.width = (score / 3) * 100 + "%"
  if(score == 1) bar.style.background = "#ef4444"
  if(score == 2) bar.style.background = "#f97316"
  if(score == 3) bar.style.background = "#16a34a"
}

window.onclick = function(event) {
    let purposeModal = document.getElementById("purposeModal");
    let termsModal = document.getElementById("termsModal");
    let registerModal = document.getElementById("registerModal");
    if (event.target == purposeModal) purposeModal.style.display = "none";
    if (event.target == termsModal) dismissTerms();
    if (event.target == registerModal) closeRegister();
}