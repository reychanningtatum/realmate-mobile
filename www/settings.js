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
};
