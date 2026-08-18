window.supabaseClient = window.supabase.createClient(
    "https://wmegpgrfrtprhuzmgjma.supabase.co",
    "sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4"
);

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

window.addEventListener('load', () => {
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

function openRegister(){ document.getElementById("registerModal").style.display="flex" }
function closeRegister(){ document.getElementById("registerModal").style.display="none" }
function closeRegistrationPending(){ document.getElementById("registrationPendingModal").style.display="none" }
function openPurpose() { document.getElementById("purposeModal").style.display = "flex"; }
function closePurpose() { document.getElementById("purposeModal").style.display = "none"; }

// 🔥 UPDATED: OPEN TERMS AND REFRESH IFRAME
function openTerms() { 
    document.getElementById("termsModal").style.display = "flex"; 
    const iframe = document.getElementById("termsFrame");
    if(iframe) iframe.src = iframe.src; // Reloads the frame
}

function closeTerms() { 
    document.getElementById("termsModal").style.display = "none"; 
    const checkbox = document.getElementById("termsCheckbox");
    const checkboxArea = document.getElementById("checkboxArea");
    const checkboxLabel = document.getElementById("checkboxLabel");
    if (checkbox) {
        checkbox.disabled = false;
        checkboxArea.classList.remove("locked");
        checkboxLabel.innerHTML = 'I have read and agree to the <b>Full Legal Terms & Conditions</b> and consent to the professional sharing of listing data within the Realmate AI network.';
    }
}

// Single gate for the Create Account button — it must stay disabled unless
// ALL of: terms accepted, username confirmed available (not taken, not still
// pending a check), and an Alveo ID file is attached.
function toggleRegButton() {
    const checkbox = document.getElementById("termsCheckbox");
    const regBtn = document.getElementById("regBtn");
    const usernameOk = _usernameAvailable === true;
    const fileOk = !!_selectedAlveoFile;
    regBtn.disabled = !(checkbox.checked && usernameOk && fileOk);
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
        if (nameEl) nameEl.textContent = "Upload Alveo ID";
        if (wrap) wrap.classList.remove("has-file");
        toggleRegButton();
        return;
    }
    const check = _validateAlveoFile(file);
    if (!check.ok) {
        _selectedAlveoFile = null;
        input.value = ""; // clear the invalid selection so it can't be silently submitted
        if (nameEl) nameEl.textContent = "Upload Alveo ID";
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
function validatePhone(i){ showError(i,!/^[0-9]{10,13}$/.test(i.value.trim())) }
// Registration is restricted to Alveo business emails only — the address
// must end in exactly @alveoland.com (case-insensitive). This rejects Gmail,
// Yahoo, and every other domain. Used by both the on-blur field validation
// and the final gate in registerUser().
const ALVEO_EMAIL_RE = /^[^\s@]+@alveoland\.com$/i;
function isAlveoEmail(v){ return ALVEO_EMAIL_RE.test((v || '').trim()); }
function validateEmail(i){ showError(i,!isAlveoEmail(i.value)) }
function validatePassword(i){ showError(i,!/^(?=.*[A-Z])(?=.*[0-9]).{8,}$/.test(i.value)) }
function validateBirthday(){
  const input = document.getElementById("birthday");
  const wrapper = document.getElementById("birthdayPicker");
  if (!input || !wrapper) return;
  if (!input.value) { showError(wrapper, true); return; }
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

async function login(){
  const loginBtn = document.getElementById("loginBtn");
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
      const { data: legacyUser } = await window.supabaseClient
        .from('Users')
        .select('email')
        .eq('username', identifier)
        .maybeSingle();
      if (!legacyUser) {
        showLoginError("No account found with that username.");
        return;
      }
      emailToLogin = legacyUser.email;
    }

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (error) {
      const msg = error.message.toLowerCase().includes("invalid")
        ? "Incorrect email or password. Please try again."
        : error.message;
      showLoginError(msg);
      return;
    }

    const authUser = data.user;

    // Registration approval gate — a row here with a status other than
    // 'Approved' means either the account is still awaiting admin review
    // or was rejected; either way, no session may be granted. Accounts
    // with no registration_reviews row predate this feature and are
    // treated as already approved.
    const { data: review } = await window.supabaseClient
      .from('registration_reviews')
      .select('account_status')
      .eq('id', authUser.id)
      .maybeSingle();

    if (review && review.account_status !== 'Approved') {
      await window.supabaseClient.auth.signOut();
      if (review.account_status === 'Rejected') {
        showLoginError(
          "Your registration was not approved. Please register again and upload a clear photo of your Alveo ID for verification. Please check your email for more details.",
          "Registration Not Approved"
        );
      } else {
        showLoginError("Your account is currently under review and has not yet been approved. You will receive an email once your account has been approved.");
      }
      return;
    }

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
      job: '', division: 'Alveo Land', group: '', team: '', bio: ''
    }));
    localStorage.setItem("isGuest", "false");

    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<span class="spinner"></span> Redirecting…';

    // Shows the "Account Approved" framing once per approved account (a
    // one-time welcome-back notice), then falls back to the plain success
    // message on every login after that.
    const successEl = document.getElementById("loginSuccess");
    const successSpan = successEl.querySelector("span");
    const approvedNoticeKey = `rm_approved_notice_${authUser.id}`;
    if (review && review.account_status === 'Approved' && !localStorage.getItem(approvedNoticeKey)) {
      successSpan.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = "Account Approved. ";
      successSpan.appendChild(strong);
      successSpan.appendChild(document.createTextNode("Your account has been approved. Please check your email for confirmation. You can now log in to Realmate."));
      localStorage.setItem(approvedNoticeKey, "1");
    } else {
      successSpan.textContent = "Login successful. Redirecting you now…";
    }
    successEl.style.display = "flex";
    setTimeout(() => location.href = "livemarket.html", 1400);

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
        const { data } = await window.supabaseClient
            .from('Users')
            .select('email')
            .eq('username', identifier)
            .maybeSingle();
        if (data && data.email) emailToReset = data.email;
        else {
            showAuthToast("We couldn't find an account with that email or username.", "error");
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
      redirectTo: "https://realmate.onrender.com/index.html",
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
    try { await window.supabaseClient.auth.signOut(); } catch (_) {}
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
  // Case-insensitive exact match via ILIKE (no % / _ left unescaped), so
  // "Eris", "eris", and "ERIS" are all treated as the same username.
  const { data } = await window.supabaseClient
    .from('Users')
    .select('username')
    .ilike('username', _escapeIlike(username))
    .maybeSingle();

  // If the user kept typing while this query was in flight, its result is
  // stale — bail out rather than show a status for text that's no longer there.
  if (input.value.trim().toLowerCase() !== usernameLower) return;

  _usernameAvailable = !data;
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

async function registerUser(){
  const regBtn = document.getElementById("regBtn");
  const btnText = document.getElementById("btnText");
  let username = document.getElementById("regUsername").value.trim();
  let firstName = document.getElementById("firstName").value.trim();
  let lastName = document.getElementById("lastName").value.trim();
  let email = document.getElementById("regEmail").value.trim();
  let password = document.getElementById("regPassword").value;
  let phone = document.getElementById("phone").value.trim();
  let birthday = document.getElementById("birthday").value;
  let gender = document.getElementById("gender").value;

  if (!username || !firstName || !email || !password || !birthday) {
    showRegToast("Please fill in all required fields.", "error");
    return;
  }
  // Domain gate — only Alveo business emails may register. Validate before
  // any upload or signUp call so no account or file is ever created for a
  // disallowed domain.
  if (!isAlveoEmail(email)) {
    validateEmail(document.getElementById("regEmail"));
    showRegToast("Registration is limited to Alveo business emails. Please use your @alveoland.com email address.", "error");
    return;
  }
  if (!_selectedAlveoFile) {
    showAlveoFileError("Please upload your Alveo ID before creating an account.");
    return;
  }
  const fileCheck = _validateAlveoFile(_selectedAlveoFile);
  if (!fileCheck.ok) {
    showAlveoFileError(fileCheck.message);
    return;
  }

  // Re-verify the username server-side right before submitting — the
  // button being enabled only means it was available a moment ago; someone
  // else could have registered it in the meantime.
  await checkUsernameAvailability();
  if (_usernameAvailable === false) {
    showRegToast("Username already taken — choose another.", "error");
    return;
  }

  regBtn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Creating account…';

  try {
    // Upload BEFORE creating the auth user, so a failed/invalid upload
    // never results in an account existing without its required ID on
    // file. There's no auth user id yet at this point (email confirmation
    // is required on this project, so signUp() below won't return a
    // session), so the file is uploaded under a random one-time folder
    // rather than a user id — ownership for read access is established
    // afterwards via the profiles.alveo_id_file row, not the storage path
    // itself (see the storage RLS policy in alveo-id-storage-setup.sql).
    const tempFolder = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const path = `${tempFolder}/${Date.now()}_${_selectedAlveoFile.name.replace(/\s/g, '_')}`;
    const { error: uploadError } = await window.supabaseClient.storage
      .from('verification-docs')
      .upload(path, _selectedAlveoFile, { contentType: _selectedAlveoFile.type });
    if (uploadError) {
      showAlveoFileError("Couldn't upload your Alveo ID. Please try again.");
      return;
    }

    const { data: signUpData, error } = await window.supabaseClient.auth.signUp({
      email, password,
      options: { data: { username, first_name: firstName, last_name: lastName, phone_number: phone, birthday, gender } }
    });
    if (error) {
      showRegToast("Registration failed: " + error.message, "error");
      await window.supabaseClient.storage.from('verification-docs').remove([path]);
      return;
    }

    const userId = signUpData?.user?.id;
    if (userId) {
      await window.supabaseClient.from('profiles').upsert({ id: userId, alveo_id_file: path });

      // Queues the account for admin review — account_status defaults to
      // 'Pending Approval' at the DB level (registration-approval-migration.sql).
      // Login stays blocked until an admin approves it (see login()).
      const { error: reviewError } = await window.supabaseClient.from('registration_reviews').upsert({
        id: userId,
        email,
        phone_number: phone || null,
        alveo_id_file: path,
      });
      if (reviewError) {
        showRegToast("Account created, but we couldn't queue it for admin review. Please contact support.", "error");
        return;
      }
    }

    closeRegister();
    document.getElementById("registrationPendingModal").style.display = "flex";
  } catch(err) {
    showRegToast("Unexpected error: " + err.message, "error");
  } finally {
    regBtn.disabled = false;
    btnText.innerHTML = "Create Account";
  }
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
    if (event.target == termsModal) closeTerms();
    if (event.target == registerModal) registerModal.style.display = "none";
}