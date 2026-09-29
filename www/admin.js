const _sbAdmin = window.supabase.createClient(
    'https://wmegpgrfrtprhuzmgjma.supabase.co',
    'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4'
);

const DEFAULT_PASSWORD = 'ADMIN@realmate';
let _currentPassword = DEFAULT_PASSWORD;

// ── JWT admin session check (additive; password path unchanged) ──
async function _adminSessionIsAdmin() {
    try {
        const { data: { session } } = await _sbAdmin.auth.getSession();
        if (!session) return false;
        const { data, error } = await _sbAdmin.rpc('is_admin');
        return !error && data === true;
    } catch (e) { return false; }
}

// ── Auth ──────────────────────────────────────────────
function toggleEmpPassword() {
    const input = document.getElementById('empPass');
    const eye   = document.getElementById('empEye');
    if (!input || !eye) return;
    if (input.type === 'password') { input.type = 'text'; eye.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; eye.classList.replace('fa-eye-slash', 'fa-eye'); }
}
function toggleGatePassword() {
    const input = document.getElementById('gateInput');
    const eye   = document.getElementById('gateEye');
    if (input.type === 'password') {
        input.type = 'text';
        eye.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        eye.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

async function attemptLogin() {
    const input = document.getElementById('gateInput').value;
    const { data } = await _sbAdmin.from('site_settings').select('value').eq('key', 'admin_password').single();
    _currentPassword = data?.value || DEFAULT_PASSWORD;

    if (input === _currentPassword) {
        sessionStorage.removeItem('rm_admin_signed_out');
        sessionStorage.setItem('rm_admin', '1');
        showDash();
    } else {
        const err = document.getElementById('gateError');
        err.style.display = 'flex';
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

function showDash() {
    document.getElementById('gateScreen').style.display = 'none';
    document.getElementById('adminDash').style.display = 'flex';
    // Market Pulse Video / Market Report PDF / Top Producers are hidden (features
    // removed from the app) — their loaders (loadYoutubeUrl, loadMarketReportUrl,
    // loadProducers, loadCourtesyFields) are intentionally not called. Restore
    // them here alongside uncommenting those tabs in admin.html.
    loadRegistrations();
    startRegistrationPolling();
    loadSoldRecords();
    loadUsers();
    // Multi-employee: figure out who's signed in (employee vs Master), reveal the
    // Master-only Employees tab, show the username, and start live sync.
    resolveMyIdentity().then(applyIdentityUI).catch(() => {});
    startAdminRealtime();
}

function logout() {
    sessionStorage.setItem('rm_admin_signed_out', '1');
    sessionStorage.removeItem('rm_admin');
    document.getElementById('gateInput').value = '';
    document.getElementById('adminDash').style.display = 'none';
    document.getElementById('gateScreen').style.display = 'flex';
    stopRegistrationPolling();
    stopAdminRealtime();
    // End the employee's Supabase session too (harmless on the password path).
    try { _sbAdmin.auth.signOut(); } catch (e) {}
    _adminMe = { userId: null, username: null, isMaster: false, mode: 'password' };
}

// ── Auto-restore session on refresh ──────────────────
window.addEventListener('DOMContentLoaded', async () => {
    // Invite link (admin.html?invite=TOKEN) → show the employee registration screen.
    const _inviteToken = new URLSearchParams(location.search).get('invite');
    if (_inviteToken) { _pendingInviteToken = _inviteToken; showInviteScreen(); return; }
    // NEW: JWT path — a logged-in admin unlocks WITHOUT the password.
    if (sessionStorage.getItem('rm_admin_signed_out') !== '1' && await _adminSessionIsAdmin()) {
        sessionStorage.setItem('rm_admin', '1');
        showDash();
        return;
    }
    if (sessionStorage.getItem('rm_admin') === '1') {
        const { data } = await _sbAdmin.from('site_settings').select('value').eq('key', 'admin_password').single();
        _currentPassword = data?.value || DEFAULT_PASSWORD;
        showDash();
    }
});

window.addEventListener('beforeunload', stopRegistrationPolling);

// ── Tab switching ─────────────────────────────────────
// data-tab is present on both the desktop sidebar items and the mobile
// drawer's mirrored items, so a single switch keeps both in sync no
// matter which one was clicked (`el` itself is no longer needed for that,
// but kept for backwards compatibility with the onclick handlers).
const TAB_LABELS = {
    youtube: 'Market Pulse Video',
    report: 'Market Report PDF',
    producers: 'Top Producers',
    registrations: 'Registrations',
    sold: 'Sold Records',
    users: 'Users',
    analytics: 'Analytics',
    reports: 'Reports',
    support: 'Support',
    employees: 'Employees',
    intelligence: 'Nexus',
    security: 'Settings',
};

function switchTab(name, el) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    document.getElementById('tab-' + name)?.classList.add('active');
    document.querySelectorAll(`.sb-item[data-tab="${name}"]`).forEach(i => i.classList.add('active'));
    const titleEl = document.getElementById('mobileTopbarTitle');
    if (titleEl) titleEl.textContent = TAB_LABELS[name] || 'Admin Panel';
    if (name === 'registrations') loadRegistrations();
    if (name === 'sold') loadSoldRecords();
    if (name === 'analytics') loadAnalytics();
    if (name === 'reports') loadReports();
    if (name === 'support') loadSupport();
    if (name === 'employees') loadEmployees();
    if (name === 'intelligence') loadIntelligence();
    if (name === 'security') initSettings();
    closeMobileDrawer();
}

// ── Mobile nav drawer ─────────────────────────────────
function openMobileDrawer() {
    document.getElementById('mobileNavDrawer')?.classList.add('open');
    document.getElementById('mobileNavOverlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
    document.getElementById('mobileNavDrawer')?.classList.remove('open');
    document.getElementById('mobileNavOverlay')?.classList.remove('show');
    document.body.style.overflow = '';
}

// ── Keyboard accessibility ────────────────────────────
// Escape closes whatever's open; Enter/Space activates any focused
// role="button" element (the sidebar/drawer items and Alveo thumbnails
// are plain divs, not native buttons, so they need this explicitly).
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMobileDrawer();
        closeAlveoPreview();
        closeApproveConfirm();
        closeRejectModal();
        return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.getAttribute('role') === 'button') {
        e.preventDefault();
        document.activeElement.click();
    }
});

// ── YouTube URL ───────────────────────────────────────
// ── Market Report PDF ──────────────────────────────────
async function loadMarketReportUrl() {
    const { data } = await _sbAdmin.from('site_settings').select('value').eq('key', 'market_report_pdf').single();
    if (data?.value) showPdfCurrent(data.value);
}

function onPdfSelected(input) {
    const file = input.files[0];
    if (file) document.getElementById('pdfFileName').textContent = file.name;
}

async function uploadMarketReport() {
    const file = document.getElementById('pdfFileInput').files[0];
    if (!file) return showStatus('pdfStatus', 'Please select a PDF file first.', 'error');

    const progressWrap = document.getElementById('pdfProgressWrap');
    const progressBar  = document.getElementById('pdfProgressBar');
    progressWrap.style.display = 'block';
    progressBar.style.width = '20%';

    // Always overwrite the same key so there's only one report stored
    const fileName = 'market-report.pdf';

    // Remove old file first (ignore error if it doesn't exist)
    await _sbAdmin.storage.from('market-reports').remove([fileName]);

    progressBar.style.width = '40%';

    const { data: upData, error: upErr } = await _sbAdmin.storage
        .from('market-reports')
        .upload(fileName, file, { upsert: true, contentType: 'application/pdf' });

    progressBar.style.width = '70%';

    if (upErr) {
        progressWrap.style.display = 'none';
        const msg = upErr.message || upErr.error || JSON.stringify(upErr);
        alert('Upload failed: ' + msg);
        return showStatus('pdfStatus', 'Upload failed: ' + msg, 'error');
    }

    const { data: urlData } = _sbAdmin.storage.from('market-reports').getPublicUrl(fileName);
    const url = urlData.publicUrl; // clean URL — no cache-buster, PDF.js needs it for CORS

    progressBar.style.width = '90%';

    const { error: dbErr } = await _sbAdmin.from('site_settings')
        .upsert({ key: 'market_report_pdf', value: url }, { onConflict: 'key' });

    progressBar.style.width = '100%';
    setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%'; }, 600);

    if (dbErr) return showStatus('pdfStatus', 'File uploaded but failed to save URL: ' + dbErr.message, 'error');

    showStatus('pdfStatus', 'Market report uploaded successfully.', 'success');
    showPdfCurrent(url);
}

async function clearMarketReport() {
    if (!confirm('Remove the current market report PDF?')) return;
    await _sbAdmin.from('site_settings').delete().eq('key', 'market_report_pdf');
    document.getElementById('pdfCurrentWrap').style.display = 'none';
    document.getElementById('pdfFileName').textContent = 'No file selected';
    document.getElementById('pdfFileInput').value = '';
    showStatus('pdfStatus', 'Market report removed.', 'success');
}

function showPdfCurrent(url) {
    const wrap = document.getElementById('pdfCurrentWrap');
    const parts = url.split('/');
    document.getElementById('pdfCurrentName').textContent = decodeURIComponent(parts[parts.length - 1]);
    document.getElementById('pdfCurrentLink').href = url;
    wrap.style.display = 'block';
}

async function loadYoutubeUrl() {
    const { data } = await _sbAdmin.from('site_settings').select('value').eq('key', 'youtube_url').single();
    if (data?.value) {
        document.getElementById('ytUrlInput').value = data.value;
        showYtPreview(data.value);
    }
}

async function saveYoutubeUrl() {
    const url = document.getElementById('ytUrlInput').value.trim();
    if (!url) return showStatus('ytStatus', 'Please enter a YouTube URL.', 'error');

    const embedUrl = toEmbedUrl(url);
    if (!embedUrl) return showStatus('ytStatus', 'Invalid YouTube URL. Paste a standard youtube.com or youtu.be link.', 'error');

    const { error } = await _sbAdmin.from('site_settings').upsert({ key: 'youtube_url', value: url }, { onConflict: 'key' });
    if (error) return showStatus('ytStatus', 'Failed to save: ' + error.message, 'error');

    showStatus('ytStatus', 'YouTube URL saved successfully.', 'success');
    showYtPreview(url);
}

function showYtPreview(url) {
    const embedUrl = toEmbedUrl(url);
    if (!embedUrl) return;
    document.getElementById('ytPreviewIframe').src = embedUrl;
    document.getElementById('ytPreviewWrap').style.display = 'block';
}

function toEmbedUrl(url) {
    try {
        const u = new URL(url);
        let videoId = null;

        if (u.hostname.includes('youtu.be')) {
            videoId = u.pathname.slice(1);
        } else if (u.hostname.includes('youtube.com')) {
            if (u.pathname === '/watch') videoId = u.searchParams.get('v');
            else if (u.pathname.startsWith('/live/')) videoId = u.pathname.split('/live/')[1].split('?')[0];
            else if (u.pathname.startsWith('/embed/')) return url;
        }

        if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`;
        return null;
    } catch { return null; }
}

// ── Top Producers ─────────────────────────────────────
async function loadProducers() {
    const list = document.getElementById('producersList');
    const { data, error } = await _sbAdmin.from('top_producers').select('*').order('created_at', { ascending: true });
    if (error || !data?.length) {
        list.innerHTML = '<div class="empty-row">No producers yet. Add one above.</div>';
        return;
    }
    list.innerHTML = data.map(p => `
        <div class="producer-row">
            <div class="pr-info">
                <div class="pr-name">${p.name}</div>
                <div class="pr-meta">${p.position || ''}${p.team ? ' · ' + p.team : ''} · ₱${Number(p.value / 1000000).toFixed(0)}M · ${p.month || ''}</div>
            </div>
            <div class="pr-actions">
                <button class="btn-edit" onclick="editProducer(${p.id})"><i class="fas fa-pen"></i></button>
                <button class="btn-delete" onclick="deleteProducer(${p.id}, '${p.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
    window._producersCache = data;
}

function editProducer(id) {
    const p = window._producersCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('editingId').value = id;
    document.getElementById('pName').value     = p.name || '';
    document.getElementById('pPosition').value = p.position || '';
    document.getElementById('pTeam').value     = p.team || '';
    document.getElementById('pValue').value    = p.value || '';
    document.getElementById('pMonth').value    = p.month || '';
    document.getElementById('pPeriod').value   = p.period || '';
    document.getElementById('pSaveBtn').innerHTML = '<i class="fas fa-save"></i> Update Producer';
    document.getElementById('pCancelBtn').style.display = 'inline-flex';
    document.getElementById('pName').focus();
    document.getElementById('tab-producers').scrollTop = 0;
}

function cancelEdit() {
    document.getElementById('editingId').value = '';
    ['pName','pPosition','pTeam','pValue','pMonth','pPeriod'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pSaveBtn').innerHTML = '<i class="fas fa-save"></i> Save Producer';
    document.getElementById('pCancelBtn').style.display = 'none';
}

async function saveProducer() {
    const name  = document.getElementById('pName').value.trim();
    const value = parseFloat(document.getElementById('pValue').value);
    if (!name)       return showStatus('pStatus', 'Name is required.', 'error');
    if (isNaN(value)) return showStatus('pStatus', 'Sales value must be a number.', 'error');

    const payload = {
        name,
        position: document.getElementById('pPosition').value.trim() || null,
        team:     document.getElementById('pTeam').value.trim()     || null,
        value,
        month:    document.getElementById('pMonth').value.trim()    || null,
        period:   document.getElementById('pPeriod').value.trim()   || null,
    };

    const editingId = document.getElementById('editingId').value;
    let error;

    if (editingId) {
        ({ error } = await _sbAdmin.from('top_producers').update(payload).eq('id', editingId));
    } else {
        ({ error } = await _sbAdmin.from('top_producers').insert([payload]));
    }

    if (error) return showStatus('pStatus', 'Failed: ' + error.message, 'error');
    showStatus('pStatus', editingId ? 'Producer updated.' : 'Producer added.', 'success');
    cancelEdit();
    loadProducers();
}

async function deleteProducer(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await _sbAdmin.from('top_producers').delete().eq('id', id);
    if (error) return alert('Delete failed: ' + error.message);
    loadProducers();
}

// ── Change Password ───────────────────────────────────
// ── Settings page (sub-nav + Employee/Master password management) ─────────────
function settingsSub(section, el) {
    document.querySelectorAll('#tab-security .set-nav-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    document.querySelectorAll('#tab-security .set-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('set-panel-' + section);
    if (panel) panel.style.display = '';
}

// Show/enable password sections by role. Employee card = the signed-in employee's
// own Supabase account; Master card = the shared admin gate (master-only).
function initSettings() {
    const isMaster = !!(_adminMe && _adminMe.isMaster);
    const isEmployee = (_adminMe && _adminMe.mode === 'jwt');
    const empCard = document.getElementById('setEmpCard');
    if (empCard) empCard.style.display = isEmployee ? '' : 'none';
    ['masterCurrent', 'masterNew', 'masterConfirm'].forEach(id => { const e = document.getElementById(id); if (e) e.disabled = !isMaster; });
    const lock = document.getElementById('masterLockNote'); if (lock) lock.style.display = isMaster ? 'none' : '';
    const mBtn = document.getElementById('masterUpdateBtn'); if (mBtn) mBtn.style.display = isMaster ? '' : 'none';
    document.querySelectorAll('#tab-security .settings-master-only').forEach(e => e.style.display = isMaster ? '' : 'none');
    settingsSub('password', document.querySelector('#tab-security .set-nav-item[data-sec="password"]'));
}

const _PW_RULES = {
    len: p => p.length >= 8,
    case: p => /[a-z]/.test(p) && /[A-Z]/.test(p),
    num: p => /\d/.test(p),
    special: p => /[^A-Za-z0-9]/.test(p),
};
function _pwOk(p) { return Object.values(_PW_RULES).every(fn => fn(p)); }
function _pwReqUpdate(which) {
    const p = (document.getElementById(which + 'New') || {}).value || '';
    const box = document.getElementById(which + 'Reqs');
    if (!box) return;
    box.querySelectorAll('.rq').forEach(row => {
        const fn = _PW_RULES[row.dataset.rq];
        const ok = fn ? fn(p) : false;
        row.classList.toggle('ok', ok);
        const ic = row.querySelector('i');
        if (ic) ic.className = ok ? 'fas fa-circle-check' : 'fas fa-circle';
    });
}

// Change the signed-in EMPLOYEE's own Supabase auth password.
async function changeEmployeePassword() {
    const cur = document.getElementById('empCurrent').value;
    const nw = document.getElementById('empNew').value;
    const cf = document.getElementById('empConfirm').value;
    if (!cur) return showStatus('empStatus', 'Enter your current password.', 'error');
    if (!_pwOk(nw)) return showStatus('empStatus', 'New password does not meet the requirements below.', 'error');
    if (nw !== cf) return showStatus('empStatus', 'New passwords do not match.', 'error');
    try {
        const { data: u } = await _sbAdmin.auth.getUser();
        const email = u && u.user && u.user.email;
        if (!email) return showStatus('empStatus', 'No signed-in employee account found.', 'error');
        const { error: authErr } = await _sbAdmin.auth.signInWithPassword({ email, password: cur });
        if (authErr) return showStatus('empStatus', 'Current password is incorrect.', 'error');
        const { error } = await _sbAdmin.auth.updateUser({ password: nw });
        if (error) return showStatus('empStatus', 'Failed to update: ' + error.message, 'error');
        ['empCurrent', 'empNew', 'empConfirm'].forEach(id => document.getElementById(id).value = '');
        _pwReqUpdate('emp');
        showStatus('empStatus', 'Employee password updated successfully.', 'success');
    } catch (e) { showStatus('empStatus', 'Failed to update: ' + (e.message || e), 'error'); }
}

// Change the MASTER admin gate password (site_settings). Master-only.
async function changeMasterPassword() {
    if (!(_adminMe && _adminMe.isMaster)) return showStatus('masterStatus', 'Master admins only.', 'error');
    const cur = document.getElementById('masterCurrent').value;
    const nw = document.getElementById('masterNew').value;
    const cf = document.getElementById('masterConfirm').value;
    if (cur !== _currentPassword) return showStatus('masterStatus', 'Current password is incorrect.', 'error');
    if (!_pwOk(nw)) return showStatus('masterStatus', 'New password does not meet the requirements below.', 'error');
    if (nw !== cf) return showStatus('masterStatus', 'New passwords do not match.', 'error');
    const { error } = await _sbAdmin.from('site_settings').upsert({ key: 'admin_password', value: nw }, { onConflict: 'key' });
    if (error) return showStatus('masterStatus', 'Failed to update: ' + error.message, 'error');
    _currentPassword = nw;
    ['masterCurrent', 'masterNew', 'masterConfirm'].forEach(id => document.getElementById(id).value = '');
    _pwReqUpdate('master');
    showStatus('masterStatus', 'Master password updated successfully.', 'success');
}

// ── Courtesy Attribution ──────────────────────────────
async function loadCourtesyFields() {
    try {
        const { data: vc } = await _sbAdmin.from('site_settings').select('value').eq('key', 'video_courtesy').single();
        if (vc?.value) document.getElementById('videoCourtesyInput').value = vc.value;
    } catch {}
    try {
        const { data: pc } = await _sbAdmin.from('site_settings').select('value').eq('key', 'pdf_courtesy').single();
        if (pc?.value) document.getElementById('pdfCourtesyInput').value = pc.value;
    } catch {}
}

async function saveCourtesy(key, inputId, statusId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val) return showStatus(statusId, 'Please enter a name.', 'error');
    const { error } = await _sbAdmin.from('site_settings').upsert({ key, value: val }, { onConflict: 'key' });
    if (error) return showStatus(statusId, 'Failed: ' + error.message, 'error');
    showStatus(statusId, 'Saved!', 'success');
}

// ── Registrations ──────────────────────────────────────
// All privileged reads/writes go through the admin-registrations Edge
// Function, which re-checks _currentPassword server-side (with the
// service_role key) before touching registration_reviews or the private
// verification-docs bucket — the anon key this page otherwise uses can't
// do either on its own. See supabase/functions/admin-registrations/.
let _regCache = [];
let _rejectTargetId = null;
let _rejectBusy = false; // guards against double-submit while a reject/request-docs is in flight

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadRegistrations() {
    const list = document.getElementById('registrationsList');
    list.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    const filters = {
        status: document.getElementById('regFilterStatus').value,
        dateFrom: document.getElementById('regFilterFrom').value || undefined,
        dateTo: document.getElementById('regFilterTo').value || undefined,
        name: document.getElementById('regFilterName').value.trim() || undefined,
        username: document.getElementById('regFilterUsername').value.trim() || undefined,
        email: document.getElementById('regFilterEmail').value.trim() || undefined,
        division: document.getElementById('regFilterDivision').value.trim() || undefined,
        group: document.getElementById('regFilterGroup').value.trim() || undefined,
    };

    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'list', filters }
    });

    if (error || data?.error) {
        list.innerHTML = `<div class="empty-row">Failed to load registrations: ${escapeHtml((data && data.error) || error.message)}</div>`;
        return;
    }

    _regCache = data.data || [];
    _regPage = 1;
    renderRegistrations();
    loadRegStats(); // refresh the summary cards (own All-status fetch)
}

// Summary stat cards for the Registrations tab: real Total/Approved/Pending/
// Rejected counts + month-over-month trend (this calendar month vs last, by
// registration date). Read-only; fails silently (cards just hide) so it never
// blocks the main list. No change to how registrations are counted elsewhere.
let _regStatsBusy = false;
async function loadRegStats() {
    const grid = document.getElementById('regStatGrid');
    if (!grid || _regStatsBusy) return;
    _regStatsBusy = true;
    try {
        const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
            body: { adminPassword: _currentPassword, action: 'list', filters: { status: 'All' } }
        });
        if (error || data?.error || !Array.isArray(data?.data)) { grid.innerHTML = ''; return; }
        const rows = data.data;
        const now = new Date();
        const curM = now.getFullYear() * 12 + now.getMonth();
        const mkey = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
        const tr = (pred) => {
            let c = 0, p = 0;
            rows.forEach(r => {
                if (!pred(r) || !r.registrationDate) return;
                const k = mkey(r.registrationDate);
                if (k === curM) c++; else if (k === curM - 1) p++;
            });
            return { c, p };
        };
        const card = (tint, icClass, icon, label, num, t) => {
            let dir = 'flat', arrow = 'fa-minus', txt = '0%';
            if (t.p === 0 && t.c > 0) { dir = 'up'; arrow = 'fa-arrow-up'; txt = 'New'; }
            else if (t.p > 0) {
                const pct = Math.round((t.c - t.p) / t.p * 100);
                dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
                arrow = pct > 0 ? 'fa-arrow-up' : pct < 0 ? 'fa-arrow-down' : 'fa-minus';
                txt = (pct > 0 ? '+' : '') + pct + '%';
            }
            return `<div class="stat-card tint-${tint}">
                <div class="stat-ic ${icClass}"><i class="fas ${icon}"></i></div>
                <div class="stat-body">
                    <div class="stat-label">${label}</div>
                    <div class="stat-figure">
                        <div class="stat-num">${_nfmt(num)}</div>
                        <div class="stat-trend ${dir}"><span class="st-pct"><i class="fas ${arrow}"></i> ${txt}</span><span class="st-sub">vs last month</span></div>
                    </div>
                </div>
            </div>`;
        };
        const isApproved = r => r.status === 'Approved';
        const isPending = r => r.status === 'Pending Approval';
        const isRejected = r => r.status === 'Rejected';
        grid.innerHTML =
            card('blue', 'blue', 'fa-users', 'Total Registrations', rows.length, tr(() => true)) +
            card('green', 'green', 'fa-circle-check', 'Approved', rows.filter(isApproved).length, tr(isApproved)) +
            card('amber', 'amber', 'fa-clock', 'Pending', rows.filter(isPending).length, tr(isPending)) +
            card('red', 'red', 'fa-ban', 'Rejected', rows.filter(isRejected).length, tr(isRejected));
    } catch { grid.innerHTML = ''; }
    finally { _regStatsBusy = false; }
}

function resetRegistrationFilters() {
    document.getElementById('regFilterStatus').value = 'Pending Approval';
    document.getElementById('regFilterFrom').value = '';
    document.getElementById('regFilterTo').value = '';
    document.getElementById('regFilterName').value = '';
    document.getElementById('regFilterUsername').value = '';
    document.getElementById('regFilterEmail').value = '';
    document.getElementById('regFilterDivision').value = '';
    document.getElementById('regFilterGroup').value = '';
    setAdvancedFiltersVisible(false);
    loadRegistrations();
}

// Search filters are collapsed by default — reviewing pending sign-ups
// shouldn't require typing anything. They're there for digging through
// Approved/Rejected history when needed.
function setAdvancedFiltersVisible(show) {
    document.getElementById('regAdvancedFilters').style.display = show ? 'grid' : 'none';
    document.getElementById('regAdvancedActions').style.display = show ? 'flex' : 'none';
    document.getElementById('regAdvancedToggleBtn').innerHTML = show
        ? '<i class="fas fa-sliders-h"></i> Hide Search Filters'
        : '<i class="fas fa-sliders-h"></i> Search Filters';
}

function toggleAdvancedFilters() {
    const isOpen = document.getElementById('regAdvancedFilters').style.display !== 'none';
    setAdvancedFiltersVisible(!isOpen);
}

// Keeps the Pending list current without the admin having to hit refresh.
// Only polls while the tab is actually visible, and pauses while a modal
// (reject reason / Alveo preview) is open so it can't yank the list out
// from under an in-progress review.
let _regPollTimer = null;

function startRegistrationPolling() {
    stopRegistrationPolling();
    _regPollTimer = setInterval(() => {
        const tab = document.getElementById('tab-registrations');
        const rejectOpen = document.getElementById('rejectReasonOverlay').style.display === 'flex';
        const previewOpen = document.getElementById('alveoPreviewOverlay').style.display === 'flex';
        if (tab && tab.classList.contains('active') && !rejectOpen && !previewOpen) {
            loadRegistrations();
        }
    }, 20000);
}

function stopRegistrationPolling() {
    if (_regPollTimer) {
        clearInterval(_regPollTimer);
        _regPollTimer = null;
    }
}

// ── Registrations table (reference layout: columnar table + header + pagination)
let _regPage = 1;
let _regLastQuery = '';
const _REG_PAGE_SIZE = 8;

function _regFilteredRows() {
    const q = (document.getElementById('regQuickSearch')?.value || '').trim().toLowerCase();
    if (!q) return _regCache;
    return _regCache.filter(r =>
        (r.fullName || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q));
}

function renderRegistrations() {
    const list = document.getElementById('registrationsList');
    if (!list) return;
    const statusVal = document.getElementById('regFilterStatus')?.value || 'All';
    const q = (document.getElementById('regQuickSearch')?.value || '').trim().toLowerCase();
    if (q !== _regLastQuery) { _regPage = 1; _regLastQuery = q; } // new search → first page

    const rows = _regFilteredRows();
    const total = rows.length;
    const pageSize = _REG_PAGE_SIZE;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    _regPage = Math.min(Math.max(1, _regPage), pages);
    const start = (_regPage - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const pillMap = { 'Approved': 'reg-badge-approved', 'Rejected': 'reg-badge-rejected', 'Pending Approval': 'reg-badge-pending' };
    const statusPill = (statusVal && statusVal !== 'All')
        ? `<span class="${pillMap[statusVal] || 'reg-badge-pending'}">${escapeHtml(statusVal)}</span>` : '';

    const head = `
      <div class="rtbl-head">
        <div class="rtbl-title"><i class="fas fa-users"></i> Registrations (<span>${total}</span>) ${statusPill}</div>
        <button type="button" class="btn-ghost" onclick="exportRegistrations()"><i class="fas fa-download"></i> Export</button>
      </div>`;

    if (!total) {
        list.innerHTML = head + `<div class="empty-row"><i class="fas fa-inbox"></i> No registrations match these filters.</div>`;
        return;
    }

    const body = pageRows.map((r, i) => {
        const n = String(start + i + 1).padStart(2, '0');
        const badgeClass = r.status === 'Approved' ? 'reg-badge-approved' : r.status === 'Rejected' ? 'reg-badge-rejected' : 'reg-badge-pending';
        const statusIcon = r.status === 'Approved' ? 'fa-circle-check' : r.status === 'Rejected' ? 'fa-circle-xmark' : 'fa-clock';
        const dateStr = r.registrationDate ? new Date(r.registrationDate).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
        const name = escapeHtml(r.fullName || '(no name on file)');
        const av = _acInitials(r.fullName || r.username || '?');
        const reasonTitle = (r.status === 'Rejected' && r.rejectionReason) ? ` title="Reason: ${escapeHtml(r.rejectionReason)}"` : '';
        // Alveo ID is OPTIONAL — only offer a "View Alveo ID" button when a file
        // was actually uploaded. Otherwise show a muted "No Alveo ID" chip, which
        // avoids calling the file-url endpoint with a null path (the root cause of
        // the "Edge Function returned a non-2xx status code" error).
        const hasAlveo = !!r.alveoIdFile;
        const alveoCtl = hasAlveo
            ? `<button class="btn-outline-sm" onclick="viewAlveoId('${r.id}')"><i class="fas fa-id-card"></i> View Alveo ID</button>`
            : `<span class="reg-noid" title="No Alveo ID was uploaded by this applicant."><i class="fas fa-id-card"></i> No Alveo ID</span>`;
        // Approve / Reject are the primary actions for a pending sign-up, so they
        // are visible buttons in the row (not buried in a menu). They reuse the
        // existing openApproveModal / openRejectModal workflow + modals.
        const pendingCtls = r.status === 'Pending Approval'
            ? `<button class="btn-approve-sm" onclick="openApproveModal('${r.id}')"><i class="fas fa-check"></i> Approve</button>`
              + `<button class="btn-outline-sm rc-danger" onclick="openRejectModal('${r.id}')"><i class="fas fa-ban"></i> Reject</button>`
            : '';
        return `
        <tr>
          <td class="rc-num" data-label="#">${n}</td>
          <td class="rc-user" data-label="User">
            <div class="rc-user-cell">
              <div class="rc-avatar">${av}</div>
              <div class="rc-user-text"><div class="rc-name">${name}</div><div class="rc-handle">@${escapeHtml(r.username || '—')}</div></div>
            </div>
          </td>
          <td class="rc-contact" data-label="Contact">
            <div class="rc-line"><i class="fas fa-envelope"></i> ${escapeHtml(r.email || '—')}</div>
            <div class="rc-line rc-sub"><i class="fas fa-phone"></i> ${escapeHtml(r.phone || '—')}</div>
          </td>
          <td class="rc-status" data-label="Status"><span class="${badgeClass}"${reasonTitle}><i class="fas ${statusIcon}"></i> ${escapeHtml((r.status || '').toUpperCase())}</span></td>
          <td class="rc-date" data-label="Registered"><i class="fas fa-calendar-day"></i> ${dateStr}</td>
          <td class="rc-actions" data-label="Actions">
            <div class="rc-act-wrap">
              ${pendingCtls}
              ${alveoCtl}
            </div>
          </td>
        </tr>`;
    }).join('');

    const from = start + 1;
    const to = Math.min(start + pageSize, total);
    list.innerHTML = head + `
      <div class="rtbl-scroll">
        <table class="rtbl">
          <thead><tr>
            <th class="rc-num">#</th><th>User</th><th>Contact Details</th><th>Status</th><th>Date Registered <i class="fas fa-arrow-down-long"></i></th><th class="rc-actions">Actions</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="rtbl-foot">
        <div class="rtbl-count">Showing ${from} to ${to} of ${total} registration${total === 1 ? '' : 's'}</div>
        ${_regPager(pages)}
      </div>`;
}

function _regPager(pages) {
    let btns = '';
    for (let p = 1; p <= pages; p++) btns += `<button class="pg ${p === _regPage ? 'active' : ''}" onclick="gotoRegPage(${p})">${p}</button>`;
    return `<div class="pager">
        <button class="pg pg-arrow" ${_regPage <= 1 ? 'disabled' : ''} onclick="gotoRegPage(${_regPage - 1})" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
        ${btns}
        <button class="pg pg-arrow" ${_regPage >= pages ? 'disabled' : ''} onclick="gotoRegPage(${_regPage + 1})" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
      </div>`;
}
function gotoRegPage(p) { _regPage = p; renderRegistrations(); }

// Date Range preset → sets the (hidden) From/To inputs, then refetches.
function applyRegDateRange() {
    const v = document.getElementById('regDateRange')?.value || 'all';
    const from = document.getElementById('regFilterFrom');
    const to = document.getElementById('regFilterTo');
    if (!from || !to) return;
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    to.value = ''; from.value = '';
    if (v === 'today') from.value = fmt(now);
    else if (v === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); from.value = fmt(d); }
    else if (v === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); from.value = fmt(d); }
    else if (v === 'month') from.value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    loadRegistrations();
}

// Row kebab menu (More actions). Shared by the Sold / Support / Users tables.
// The menu is positioned FIXED to the viewport (not absolutely inside the
// row) so no ancestor's overflow — e.g. .rtbl-scroll's overflow-x:auto, which
// also clips vertically — can cut it off, and it flips ABOVE the button when
// there isn't enough room below. Root-cause fix, not an overflow hack.
function toggleRegMenu(e, btn) {
    e.stopPropagation();
    const rk = btn.closest('.rk');
    const wasOpen = rk.classList.contains('open');
    closeRegMenus();
    if (wasOpen) return;
    rk.classList.add('open');
    _positionRkMenu(btn, rk.querySelector('.rk-menu'));
}
function _positionRkMenu(btn, menu) {
    if (!menu) return;
    // Reset, then measure with the menu already displayed (.open added above).
    menu.style.position = 'fixed';
    menu.style.top = menu.style.bottom = menu.style.left = menu.style.right = 'auto';
    const br = btn.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    const gap = 6, pad = 8, vh = window.innerHeight, vw = window.innerWidth;
    const openUp = (vh - br.bottom) < (mh + gap) && br.top > (mh + gap);
    menu.style.top = openUp
        ? Math.max(pad, br.top - mh - gap) + 'px'
        : Math.min(vh - mh - pad, br.bottom + gap) + 'px';
    // Align the menu's right edge to the button's, clamped inside the viewport.
    const left = Math.max(pad, Math.min(br.right - mw, vw - mw - pad));
    menu.style.left = left + 'px';
}
function closeRegMenus() {
    document.querySelectorAll('.rk.open').forEach(x => {
        x.classList.remove('open');
        const m = x.querySelector('.rk-menu');
        if (m) { m.style.position = m.style.top = m.style.bottom = m.style.left = m.style.right = ''; }
    });
}
document.addEventListener('click', closeRegMenus);
// A fixed menu would otherwise float out of place on scroll/resize — close it.
window.addEventListener('scroll', closeRegMenus, true);
window.addEventListener('resize', closeRegMenus);

// Top-right profile dropdown.
function toggleProfileMenu(e) {
    e.stopPropagation();
    document.getElementById('adminUserChip')?.classList.toggle('open');
}
function closeProfileMenu() {
    document.getElementById('adminUserChip')?.classList.remove('open');
}
document.addEventListener('click', closeProfileMenu);

// Jump to a sidebar tab by name (used by the profile dropdown).
function goTab(name) {
    const el = document.querySelector('.admin-sidebar [data-tab="' + name + '"]');
    switchTab(name, el);
}

// Export the currently-filtered registrations to CSV (client-side; the admin's
// own data, user-initiated). Does not change any stored data.
function exportRegistrations() {
    const rows = _regFilteredRows();
    if (!rows.length) { showAdminAlert('Nothing to export', 'No registrations match the current filters.', 'error'); return; }
    const cols = ['Full Name', 'Username', 'Email', 'Phone', 'Status', 'Position', 'Division', 'Group', 'Registered'];
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(',')];
    rows.forEach(r => lines.push([r.fullName, r.username, r.email, r.phone, r.status, r.position, r.division, r.group,
        r.registrationDate ? new Date(r.registrationDate).toISOString() : ''].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'registrations-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Mobile Alveo thumbnails — lazy-loaded on scroll ───
// Desktop never triggers this: .reg-thumb is display:none there, so it
// never intersects the viewport and no signed-URL requests are wasted.
let _thumbObserver = null;

function setupThumbLazyLoad() {
    if (_thumbObserver) _thumbObserver.disconnect();
    _thumbObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            _thumbObserver.unobserve(entry.target);
            loadThumbnail(entry.target);
        });
    }, { rootMargin: '200px' });
    document.querySelectorAll('.reg-thumb-img[data-reg-id]').forEach((el) => _thumbObserver.observe(el));
}

async function loadThumbnail(el) {
    const id = el.dataset.regId;
    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'file-url', profileId: id }
    });
    const url = data?.data?.url;
    if (error || data?.error || !url) {
        el.innerHTML = '<i class="fas fa-id-card"></i>';
        return;
    }
    el.innerHTML = `<img src="${url}" alt="Uploaded Alveo ID thumbnail" loading="lazy">`;
}

let _alveoTargetId = null;

async function viewAlveoId(id) {
    _alveoTargetId = id;
    const overlay = document.getElementById('alveoPreviewOverlay');
    const body = document.getElementById('alveoPreviewBody');
    const link = document.getElementById('alveoPreviewOpenLink');
    const downloadBtn = document.getElementById('alveoPreviewDownloadBtn');
    body.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
    link.style.display = 'none';
    downloadBtn.style.display = 'none';
    overlay.style.display = 'flex';

    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'file-url', profileId: id }
    });

    // No Alveo ID on file (it is optional) — show a clear message rather than a
    // raw error. The row already hides the View button in this case; this is a
    // defensive fallback so the preview never surfaces the generic non-2xx error.
    if (data?.data?.noFile) {
        body.innerHTML = `<div class="empty-row"><i class="fas fa-id-card"></i> No Alveo ID was uploaded by this applicant.</div>`;
        return;
    }
    const url = data?.data?.url;
    if (error || data?.error || !url) {
        body.innerHTML = `<div class="empty-row">Failed to load file: ${escapeHtml((data && data.error) || (error && error.message) || 'Unknown error')}</div>`;
        return;
    }

    link.href = url;
    link.style.display = 'inline-flex';
    downloadBtn.style.display = 'inline-flex';
    if (/\.pdf(\?|$)/i.test(url)) {
        body.innerHTML = `<iframe src="${url}" class="reg-alveo-frame"></iframe>`;
    } else {
        // Click-to-zoom: toggles between "fit the modal" and true full size
        // (scrollable) — a lightweight zoom, not a full image viewer.
        body.innerHTML = `<img src="${url}" class="reg-alveo-img" alt="Uploaded Alveo ID" onclick="this.classList.toggle('zoomed')" title="Click to zoom">`;
    }
}

async function downloadAlveoId() {
    if (!_alveoTargetId) return;
    const downloadBtn = document.getElementById('alveoPreviewDownloadBtn');
    const originalHtml = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';

    // Requests a separate signed URL flagged for download — the storage
    // server responds with Content-Disposition: attachment on this one, so
    // the browser saves the file instead of navigating/previewing it.
    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'file-url', profileId: _alveoTargetId, download: true }
    });

    downloadBtn.innerHTML = originalHtml;
    const url = data?.data?.url;
    if (error || data?.error || !url) {
        showAdminAlert('Download Failed', (data && data.error) || (error && error.message) || 'Unknown error', 'error');
        return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function closeAlveoPreview() {
    document.getElementById('alveoPreviewOverlay').style.display = 'none';
    _alveoTargetId = null;
}

// ── Approve / Reject — custom confirm modals, no native confirm()/alert() ──
let _approveTargetId = null;

function openApproveModal(id) {
    _approveTargetId = id;
    document.getElementById('approveConfirmOverlay').style.display = 'flex';
}

function closeApproveConfirm() {
    _approveTargetId = null;
    document.getElementById('approveConfirmOverlay').style.display = 'none';
}

async function confirmApprove() {
    const id = _approveTargetId;
    closeApproveConfirm();
    if (!id) return;

    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'approve', profileId: id }
    });
    if (error || data?.error) {
        showAdminAlert('Approval Failed', (data && data.error) || error.message, 'error');
        return;
    }
    showAdminAlert('Registration Approved', 'The account has been approved successfully. An approval email has been sent to the user.', 'success');
    loadRegistrations();
}

function openRejectModal(id) {
    _rejectTargetId = id;
    document.getElementById('rejectReasonInput').value = '';
    document.getElementById('rejectReasonOverlay').style.display = 'flex';
}

function closeRejectModal() {
    _rejectTargetId = null;
    document.getElementById('rejectReasonOverlay').style.display = 'none';
}

function pickRejectReason(text) {
    document.getElementById('rejectReasonInput').value = text;
}

// kind='reject' → "not approved" email. kind='request-docs' → asks the applicant
// to resubmit a valid PRC / DHSUD / Alveo ID. Both mark the registration Rejected
// (so they can register again); only the email differs.
async function confirmReject(kind) {
    // Ignore repeat clicks while a request is already in flight — the invoke is
    // async and slow, so without this an impatient double/triple-tap fired
    // multiple requests (and multiple emails) before the modal closed.
    if (!_rejectTargetId || _rejectBusy) return;
    _rejectBusy = true;
    const isDocs = kind === 'request-docs';
    const reason = document.getElementById('rejectReasonInput').value.trim();
    const targetId = _rejectTargetId;

    // Immediate feedback: disable both action buttons and spin the clicked one.
    const foot = document.querySelector('#rejectReasonOverlay .rm-modal-foot');
    const btns = foot ? Array.from(foot.querySelectorAll('button')) : [];
    const clicked = foot ? foot.querySelector(isDocs ? 'button[onclick*="request-docs"]' : '.reg-confirm-reject') : null;
    const origHtml = clicked ? clicked.innerHTML : '';
    btns.forEach(b => b.disabled = true);
    if (clicked) clicked.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isDocs ? 'Requesting…' : 'Rejecting…'}`;

    try {
        const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
            body: { adminPassword: _currentPassword, action: 'reject', profileId: targetId, reason, kind: isDocs ? 'request-docs' : 'reject' }
        });
        closeRejectModal();
        if (error || data?.error) {
            showAdminAlert(isDocs ? 'Request Failed' : 'Rejection Failed', (data && data.error) || error.message, 'error');
            return;
        }
        showAdminAlert(
            isDocs ? 'Documents Requested' : 'Registration Rejected',
            isDocs ? 'The applicant has been emailed to resubmit a valid PRC, DHSUD, or Alveo ID.'
                   : 'The registration has been rejected. A notice email has been sent to the user.',
            'success'
        );
        loadRegistrations();
    } finally {
        // Restore the buttons (the modal is hidden on success, but this resets
        // them for the next open and for the error path where it stays visible).
        _rejectBusy = false;
        btns.forEach(b => b.disabled = false);
        if (clicked) clicked.innerHTML = origHtml;
    }
}

// ── Ban / suspend a member (Users tab) ────────────────
let _banTargetId = null;
function openBanModal(id) {
    _banTargetId = id;
    var i = document.getElementById('banReasonInput'); if (i) i.value = '';
    document.getElementById('banReasonOverlay').style.display = 'flex';
}
function closeBanModal() {
    _banTargetId = null;
    document.getElementById('banReasonOverlay').style.display = 'none';
}
function pickBanReason(text) {
    var i = document.getElementById('banReasonInput'); if (i) i.value = text;
}
async function confirmBan() {
    if (!_banTargetId) return;
    const reason = document.getElementById('banReasonInput').value.trim();
    const targetId = _banTargetId;
    const { data, error } = await _sbAdmin.functions.invoke('admin-users', {
        body: { adminPassword: _currentPassword, action: 'ban', profileId: targetId, reason }
    });
    closeBanModal();
    if (error || data?.error) {
        showAdminAlert('Ban Failed', (data && data.error) || error.message, 'error');
        return;
    }
    const sent = data?.data?.emailSent;
    showAdminAlert('Account Suspended', 'The account has been banned and can no longer sign in.' + (sent ? ' A notice email was sent.' : ''), 'success');
    loadUsers();
}
async function unbanUser(id) {
    const { data, error } = await _sbAdmin.functions.invoke('admin-users', {
        body: { adminPassword: _currentPassword, action: 'unban', profileId: id }
    });
    if (error || data?.error) {
        showAdminAlert('Unban Failed', (data && data.error) || error.message, 'error');
        return;
    }
    showAdminAlert('Access Restored', 'The account can sign in again.', 'success');
    loadUsers();
}

// ── Users (with Deactivated + Deleted sub-views) ──────────────
// The Users tab is a roster of every registered account, PLUS two record views
// folded in from the (removed) standalone tabs: accounts the user DEACTIVATED
// (account_deactivations) and permanently DELETED ones (deleted_accounts). One
// search box + one list container; a segmented control switches `_usersView`
// and renderUsersView() dispatches to the matching renderer.
let _usersView = 'all';       // 'all' | 'deactivated' | 'deleted'
let _usersCache = [];
let _deactCache = [];
let _delCache = [];
let _usersPage = 1;

// ── Shared record-table builder (same look as the Registrations table) ──────
// cols: [{label, cell(row,index), thClass?, tdClass?}]. Returns the scrollable
// table + pagination footer; collapses to stacked cards under 900px via CSS.
function _recordTable(rows, cols, opts) {
    opts = opts || {};
    const pageSize = opts.pageSize || 8;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const p = Math.min(Math.max(1, opts.page || 1), pages);
    const start = (p - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const thead = '<thead><tr>' + cols.map(c => `<th class="${c.thClass || ''}">${c.label}</th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + pageRows.map((r, i) =>
        '<tr>' + cols.map(c => `<td class="${c.tdClass || ''}" data-label="${String(c.label).replace(/"/g, '&quot;')}">${c.cell(r, start + i)}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    const from = start + 1, to = Math.min(start + pageSize, rows.length);
    const foot = `<div class="rtbl-foot"><div class="rtbl-count">Showing ${from} to ${to} of ${rows.length} ${opts.noun || 'records'}</div>${_pagerHtml(pages, p, opts.pageFn)}</div>`;
    return `<div class="rtbl-scroll"><table class="rtbl">${thead}${tbody}</table></div>${foot}`;
}
function _pagerHtml(pages, cur, fn) {
    let btns = '';
    for (let x = 1; x <= pages; x++) btns += `<button class="pg ${x === cur ? 'active' : ''}" onclick="${fn}(${x})">${x}</button>`;
    return `<div class="pager">
        <button class="pg pg-arrow" ${cur <= 1 ? 'disabled' : ''} onclick="${fn}(${cur - 1})" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
        ${btns}
        <button class="pg pg-arrow" ${cur >= pages ? 'disabled' : ''} onclick="${fn}(${cur + 1})" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
      </div>`;
}
// User identity cell (avatar image + name + @handle), shared by all 3 sub-views.
function _userNameCell(name, username, avatarUrl) {
    const fb = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || username || '?')}&background=2563eb&color=fff`;
    const av = avatarUrl || fb;
    return `<div class="rc-user-cell">
        <img class="rc-avatar-img" src="${av}" alt="" onerror="this.src='${fb}'">
        <div class="rc-user-text"><div class="rc-name">${escapeHtml(name || '(no name on file)')}</div><div class="rc-handle">@${escapeHtml(username || '—')}</div></div>
      </div>`;
}
function _emailCell(email) { return `<div class="rc-line"><i class="fas fa-envelope"></i> ${escapeHtml(email || '—')}</div>`; }
function _usersHeadHtml(count) {
    const label = _usersView === 'deactivated' ? '<i class="fas fa-user-slash"></i> Deactivated Accounts'
        : _usersView === 'deleted' ? '<i class="fas fa-user-xmark"></i> Deleted Accounts'
            : '<i class="fas fa-users"></i> All Users';
    return `<div class="rtbl-head">
        <div class="rtbl-title">${label} (<span>${count}</span>)</div>
        <div class="rtbl-head-actions">
          <button type="button" class="btn-ghost" onclick="exportUsers()"><i class="fas fa-download"></i> Export</button>
          <button type="button" class="btn-ghost" onclick="reloadUsersView()"><i class="fas fa-rotate-right"></i> Refresh</button>
        </div>
      </div>`;
}
function gotoUsersPage(p) { _usersPage = p; renderUsersView(); }

// Shared CSV download (client-side; the admin's own data, user-initiated).
function _downloadCsv(cols, rows, name) {
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.map(esc).join(',')].concat(rows.map(r => r.map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Export the current Users sub-view (All / Deactivated / Deleted) to CSV.
function exportUsers() {
    let rows, cols, mapper, name;
    const q = _usersSearchQuery();
    if (_usersView === 'deactivated') {
        rows = q ? _deactCache.filter(d => _matchAcct(d, q)) : _deactCache;
        cols = ['Full Name', 'Username', 'Email', 'Deactivated', 'Reactivated', 'Reason'];
        mapper = d => [d.full_name, d.username, d.email, d.deactivated_at ? new Date(d.deactivated_at).toISOString() : '', d.reactivated_at ? new Date(d.reactivated_at).toISOString() : '', d.reason];
        name = 'deactivated-accounts';
    } else if (_usersView === 'deleted') {
        rows = q ? _delCache.filter(d => _matchAcct(d, q)) : _delCache;
        cols = ['Full Name', 'Username', 'Email', 'Deleted'];
        mapper = d => [d.full_name, d.username, d.email, d.deleted_at ? new Date(d.deleted_at).toISOString() : ''];
        name = 'deleted-accounts';
    } else {
        const qq = (document.getElementById('usersSearchInput')?.value || '').trim().toLowerCase();
        rows = qq ? _usersCache.filter(u => (u.full_name || '').toLowerCase().includes(qq) || (u.username || '').toLowerCase().includes(qq) || (u.email || '').toLowerCase().includes(qq)) : _usersCache;
        cols = ['Full Name', 'Username', 'Email', 'Status', 'Division', 'Group', 'Suspended', 'Registered'];
        mapper = u => [u.full_name, u.username, u.email, u.status, u.division, u.business_group, u.banned ? 'Yes' : 'No', u.created_at ? new Date(u.created_at).toISOString() : ''];
        name = 'users';
    }
    if (!rows.length) { showAdminAlert('Nothing to export', 'No records match the current view.', 'error'); return; }
    _downloadCsv(cols, rows.map(mapper), name);
}

function setUsersView(view) {
    _usersView = view;
    _usersPage = 1;
    document.querySelectorAll('.uv-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    const search = document.getElementById('usersSearchInput');
    if (search) search.value = '';
    if (view === 'all')              { _usersCache.length ? renderUsersView() : loadUsers(); }
    else if (view === 'deactivated') { _deactCache.length ? renderUsersView() : loadDeactivations(); }
    else                             { _delCache.length ? renderUsersView() : loadDeletions(); }
}

function reloadUsersView() {
    if (_usersView === 'deactivated') loadDeactivations();
    else if (_usersView === 'deleted') loadDeletions();
    else loadUsers();
}

function filterUsersView() { _usersPage = 1; renderUsersView(); }

function renderUsersView() {
    if (_usersView === 'deactivated') return renderDeactivations();
    if (_usersView === 'deleted') return renderDeletions();
    return renderUsers();
}

async function loadUsers() {
    const list = document.getElementById('usersList');
    if (_usersView === 'all' && list) list.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    const { data: profiles, error: profErr } = await _sbAdmin
        .from('profiles')
        .select('id, full_name, username, email, avatar_url, division, business_group, created_at, banned, ban_reason')
        .order('created_at', { ascending: false });

    if (profErr) {
        if (_usersView === 'all' && list) list.innerHTML = `<div class="empty-row">Failed to load users: ${escapeHtml(profErr.message)}</div>`;
        return;
    }

    // Account status lives in registration_reviews (RLS: service_role only), so
    // it's read through the admin-registrations edge fn. Profiles with no
    // registration_reviews row predate the approval feature — treat as Approved.
    const { data: regData, error: regErr } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'list', filters: { status: 'All' } }
    });
    const statusById = {};
    if (!regErr && !regData?.error) {
        (regData.data || []).forEach(r => { statusById[r.id] = r.status; });
    }

    _usersCache = (profiles || []).map(p => ({ ...p, status: statusById[p.id] || 'Approved' }));
    if (_usersView === 'all') renderUsersView();
}

function renderUsers() {
    const list = document.getElementById('usersList');
    const q = document.getElementById('usersSearchInput').value.trim().toLowerCase();
    const rows = q
        ? _usersCache.filter(u =>
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q))
        : _usersCache;

    const head = _usersHeadHtml(rows.length);
    if (!rows.length) {
        list.innerHTML = head + `<div class="empty-row"><i class="fas fa-inbox"></i> ${_usersCache.length ? 'No users match this search.' : 'No registered users yet.'}</div>`;
        return;
    }

    const cols = [
        { label: '#', thClass: 'rc-num', tdClass: 'rc-num', cell: (u, i) => String(i + 1).padStart(2, '0') },
        { label: 'User', cell: u => _userNameCell(u.full_name, u.username, u.avatar_url) },
        { label: 'Contact', cell: u => _emailCell(u.email) },
        {
            label: 'Status', tdClass: 'rc-status', cell: u => {
                const badgeClass = u.status === 'Approved' ? 'reg-badge-approved' : u.status === 'Rejected' ? 'reg-badge-rejected' : 'reg-badge-pending';
                const icon = u.status === 'Approved' ? 'fa-circle-check' : u.status === 'Rejected' ? 'fa-circle-xmark' : 'fa-clock';
                const suspended = u.banned
                    ? ` <span class="reg-badge-rejected"${u.ban_reason ? ` title="Ban reason: ${escapeHtml(u.ban_reason)}"` : ''}><i class="fas fa-ban"></i> SUSPENDED</span>` : '';
                return `<span class="${badgeClass}"><i class="fas ${icon}"></i> ${escapeHtml((u.status || '').toUpperCase())}</span>${suspended}`;
            }
        },
        { label: 'Registered', tdClass: 'rc-date', cell: u => `<i class="fas fa-calendar-day"></i> ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}` },
        {
            label: 'Actions', thClass: 'rc-actions', tdClass: 'rc-actions', cell: u => {
                const wrap = u.banned
                    ? `<button class="btn-outline-sm" onclick="unbanUser('${u.id}')"><i class="fas fa-unlock"></i> Unban</button>`
                    : `<button class="btn-outline-sm rc-danger" onclick="openBanModal('${u.id}')"><i class="fas fa-ban"></i> Ban</button>`;
                return `<div class="rc-act-wrap">${wrap}</div>`;
            }
        },
    ];
    list.innerHTML = head + _recordTable(rows, cols, { page: _usersPage, noun: 'users', pageFn: 'gotoUsersPage' });
}

// ── Deactivated / Deleted account records (Users sub-views) ───
// Read-only, admin-only logs surfaced INSIDE the Users tab. account_deactivations
// and deleted_accounts are RLS-locked to service_role, so both come through the
// admin-deactivations Edge Function (password-gated). All three Users sub-views
// render into the SAME #usersList container, filtered by #usersSearchInput.
function _usersSearchQuery() { return (document.getElementById('usersSearchInput')?.value || '').trim().toLowerCase(); }
function _matchAcct(r, q) {
    return (r.full_name || '').toLowerCase().includes(q)
        || (r.username || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q);
}

async function loadDeactivations() {
    const list = document.getElementById('usersList');
    if (_usersView === 'deactivated' && list) list.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
    const { data, error } = await _sbAdmin.functions.invoke('admin-deactivations', {
        body: { adminPassword: _currentPassword, action: 'list' }
    });
    if (error || data?.error) {
        if (_usersView === 'deactivated' && list) list.innerHTML = `<div class="empty-row">Failed to load deactivations: ${escapeHtml((data && data.error) || error?.message || 'unknown error')}</div>`;
        return;
    }
    _deactCache = data.data || [];
    if (_usersView === 'deactivated') renderUsersView();
}

function renderDeactivations() {
    const list = document.getElementById('usersList');
    if (!list) return;
    const q = _usersSearchQuery();
    const rows = q ? _deactCache.filter(d => _matchAcct(d, q)) : _deactCache;
    const head = _usersHeadHtml(rows.length);
    if (!rows.length) {
        list.innerHTML = head + `<div class="empty-row"><i class="fas fa-inbox"></i> ${_deactCache.length ? 'No records match this search.' : 'No account deactivations yet.'}</div>`;
        return;
    }
    const cols = [
        { label: '#', thClass: 'rc-num', tdClass: 'rc-num', cell: (d, i) => String(i + 1).padStart(2, '0') },
        { label: 'User', cell: d => _userNameCell(d.full_name, d.username, null) },
        { label: 'Contact', cell: d => _emailCell(d.email) },
        {
            label: 'Status', tdClass: 'rc-status', cell: d => d.reactivated_at
                ? `<span class="reg-badge-approved"><i class="fas fa-circle-check"></i> REACTIVATED</span>`
                : `<span class="reg-badge-pending"><i class="fas fa-user-slash"></i> DEACTIVATED</span>`
        },
        {
            label: 'Deactivated', tdClass: 'rc-date', cell: d => {
                const when = d.deactivated_at ? new Date(d.deactivated_at).toLocaleString() : '—';
                let sub = '';
                if (d.reactivated_at) sub = `<div class="rc-line rc-sub"><i class="fas fa-rotate-left"></i> Reactivated ${escapeHtml(new Date(d.reactivated_at).toLocaleString())}</div>`;
                else if (d.reactivate_at) sub = `<div class="rc-line rc-sub">Auto-reactivates ${escapeHtml(new Date(d.reactivate_at).toLocaleDateString())}</div>`;
                if (d.reason) sub += `<div class="rc-line rc-sub"><i class="fas fa-circle-info"></i> ${escapeHtml(d.reason)}</div>`;
                return `<div class="rc-line"><i class="fas fa-calendar-xmark"></i> ${escapeHtml(when)}</div>${sub}`;
            }
        },
    ];
    list.innerHTML = head + _recordTable(rows, cols, { page: _usersPage, noun: 'records', pageFn: 'gotoUsersPage' });
}

async function loadDeletions() {
    const list = document.getElementById('usersList');
    if (_usersView === 'deleted' && list) list.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
    const { data, error } = await _sbAdmin.functions.invoke('admin-deactivations', {
        body: { adminPassword: _currentPassword, action: 'list-deleted' }
    });
    if (error || data?.error) {
        if (_usersView === 'deleted' && list) list.innerHTML = `<div class="empty-row">Failed to load deletions: ${escapeHtml((data && data.error) || error?.message || 'unknown error')}</div>`;
        return;
    }
    _delCache = data.data || [];
    if (_usersView === 'deleted') renderUsersView();
}

function renderDeletions() {
    const list = document.getElementById('usersList');
    if (!list) return;
    const q = _usersSearchQuery();
    const rows = q ? _delCache.filter(d => _matchAcct(d, q)) : _delCache;
    const head = _usersHeadHtml(rows.length);
    if (!rows.length) {
        list.innerHTML = head + `<div class="empty-row"><i class="fas fa-inbox"></i> ${_delCache.length ? 'No records match this search.' : 'No deleted accounts yet.'}</div>`;
        return;
    }
    const cols = [
        { label: '#', thClass: 'rc-num', tdClass: 'rc-num', cell: (d, i) => String(i + 1).padStart(2, '0') },
        { label: 'User', cell: d => _userNameCell(d.full_name, d.username, null) },
        { label: 'Contact', cell: d => _emailCell(d.email) },
        { label: 'Status', tdClass: 'rc-status', cell: () => `<span class="reg-badge-rejected"><i class="fas fa-trash-can"></i> DELETED</span>` },
        { label: 'Deleted', tdClass: 'rc-date', cell: d => `<i class="fas fa-calendar-day"></i> ${d.deleted_at ? new Date(d.deleted_at).toLocaleString() : '—'}` },
    ];
    list.innerHTML = head + _recordTable(rows, cols, { page: _usersPage, noun: 'records', pageFn: 'gotoUsersPage' });
}

// ── Sold Records ──────────────────────────────────────
// Permanent history of every completed transaction. Written client-side the
// instant a seller confirms the sale (see saveSoldRecord in livemarket.js), so
// these persist even after the listing itself is auto-deleted 24 hours later.
//
// Records are separated into four completion categories and totalled per
// category and per time period. Peso amounts come from price-parser.js — the
// SAME figure highlighted on Listing Detail — so totals reflect what the app
// actually shows. Double-counting is prevented two ways: the DB has
// UNIQUE(listing_id), and loadSoldRecords() also dedupes by listing_id below.

// Original listing category → completion bucket. Mirrors completionLabel() in
// livemarket.js: supply-side For Sale = Sold, demand-side Willing to Buy =
// Bought, and both rent/lease variants collapse to Rented / Leased.
const SOLD_BUCKETS = ['Sold', 'Bought', 'Rented', 'Leased'];
const SOLD_CATEGORY_MAP = {
    'FOR SALE': 'Sold',
    'WILLING TO BUY': 'Bought',
    'FOR RENT': 'Rented',
    'WILLING TO RENT': 'Rented',
    'FOR LEASE': 'Leased',
    'WILLING TO LEASE': 'Leased',
};
function soldBucket(category) {
    return SOLD_CATEGORY_MAP[String(category || '').toUpperCase().trim()] || 'Uncategorized';
}

// Exact listing category → a distinct, colour-coded badge. This is what
// distinguishes "For Rent" from "Willing to Rent" (both fall in the Rented
// bucket) and "For Lease" from "Willing to Lease", etc.
const SOLD_CAT_META = {
    'FOR SALE':         { label: 'For Sale',         cls: 'scb-sale' },
    'WILLING TO BUY':   { label: 'Willing to Buy',   cls: 'scb-buy' },
    'FOR RENT':         { label: 'For Rent',         cls: 'scb-rent' },
    'WILLING TO RENT':  { label: 'Willing to Rent',  cls: 'scb-wrent' },
    'FOR LEASE':        { label: 'For Lease',        cls: 'scb-lease' },
    'WILLING TO LEASE': { label: 'Willing to Lease', cls: 'scb-wlease' },
};
function soldCatBadge(category) {
    const m = SOLD_CAT_META[String(category || '').toUpperCase().trim()];
    return m
        ? `<span class="scb ${m.cls}">${m.label}</span>`
        : `<span class="scb scb-unc">${escapeHtml(category || 'Uncategorized')}</span>`;
}
function soldAmount(r) {
    return (window.RM_PRICE ? RM_PRICE.extractAmount(r && r.content || '') : 0) || 0;
}
function soldPeso(n) {
    return window.RM_PRICE ? RM_PRICE.formatPeso(n) : '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
}

const SOLD_PERIODS = [
    { key: 'today',   label: 'Today' },
    { key: 'week',    label: 'This Week' },
    { key: 'month',   label: 'This Month' },
    { key: 'quarter', label: 'This Quarter' },
    { key: 'half',    label: 'This Half-Year' },
    { key: 'annual',  label: 'Annual' },
];

// Local-time start of each period; 'all' → the epoch. Week starts Monday.
function soldPeriodStart(period) {
    const d = new Date();
    const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
    switch (period) {
        case 'today':   return new Date(y, mo, day);
        case 'week': {  const dow = (d.getDay() + 6) % 7; return new Date(y, mo, day - dow); }
        case 'month':   return new Date(y, mo, 1);
        case 'quarter': return new Date(y, Math.floor(mo / 3) * 3, 1);
        case 'half':    return new Date(y, mo < 6 ? 0 : 6, 1);
        case 'annual':  return new Date(y, 0, 1);
        default:        return new Date(0);
    }
}
function soldInPeriod(r, period) {
    if (period === 'all') return true;
    const t = r && r.sold_at ? new Date(r.sold_at).getTime() : 0;
    return t >= soldPeriodStart(period).getTime();
}

let _soldCache = [];
let _soldSort = 'newest';
let _soldCatFilter = 'all';
let _soldPeriodFilter = 'all';

async function loadSoldRecords() {
    const list = document.getElementById('soldRecordsList');
    if (!list) return;
    list.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    const { data, error } = await _sbAdmin
        .from('sold_records')
        .select('*')
        .order('sold_at', { ascending: false });
    if (error) {
        // Table missing → migration not run yet. Say so plainly instead of a raw error.
        const msg = /relation|does not exist|schema cache/i.test(error.message || '')
            ? 'No sold records yet. (Run sold-listings-migration.sql to enable this.)'
            : `Failed to load sold records: ${escapeHtml(error.message)}`;
        list.innerHTML = `<div class="empty-row">${msg}</div>`;
        const matrix = document.getElementById('soldTotalsMatrix');
        if (matrix) matrix.innerHTML = `<div class="empty-row">${msg}</div>`;
        return;
    }
    // Dedupe by listing_id — one transaction per listing, never counted twice,
    // even if the UNIQUE(listing_id) constraint were somehow bypassed. Keep the
    // most recent sale for a given listing.
    const byListing = new Map();
    (data || []).forEach(r => {
        const key = String(r.listing_id != null ? r.listing_id : r.id);
        const prev = byListing.get(key);
        if (!prev || new Date(r.sold_at || 0) > new Date(prev.sold_at || 0)) byListing.set(key, r);
    });
    _soldCache = Array.from(byListing.values());
    renderSoldStats();
    renderSoldTotalsMatrix();
    renderSoldRecords();
}

function setSoldCat(cat, el) {
    _soldCatFilter = cat;
    document.querySelectorAll('#soldCatChips .sold-chip').forEach(c => c.classList.toggle('active', c === el));
    renderSoldRecords();
}
function setSoldPeriod(period, el) {
    _soldPeriodFilter = period;
    document.querySelectorAll('#soldPeriodChips .sold-chip').forEach(c => c.classList.toggle('active', c === el));
    renderSoldRecords();
}
function filterSoldRecords() {
    renderSoldRecords();
}

// Category × time-period totals, computed from every (deduped) record. This is
// the summary dashboard and always reflects ALL records, independent of the
// record-list filters below.
function renderSoldTotalsMatrix() {
    const el = document.getElementById('soldTotalsMatrix');
    if (!el) return;
    if (!_soldCache.length) {
        el.innerHTML = `<div class="empty-row">No completed transactions yet.</div>`;
        return;
    }
    const totals = {};
    SOLD_BUCKETS.forEach(b => { totals[b] = { all: 0 }; SOLD_PERIODS.forEach(p => totals[b][p.key] = 0); });
    _soldCache.forEach(r => {
        const b = soldBucket(r.category);
        if (!totals[b]) return; // Uncategorized is excluded from the four-category matrix
        const amt = soldAmount(r);
        totals[b].all += amt;
        SOLD_PERIODS.forEach(p => { if (soldInPeriod(r, p.key)) totals[b][p.key] += amt; });
    });
    const colTotal = (key) => SOLD_BUCKETS.reduce((s, b) => s + totals[b][key], 0);

    const head = `<tr><th>Category</th>`
        + SOLD_PERIODS.map(p => `<th>${p.label}</th>`).join('')
        + `<th class="sold-col-total">Total</th></tr>`;
    const rows = SOLD_BUCKETS.map(b => `
        <tr>
            <td class="sold-cat-cell"><span class="sold-cat-dot sold-dot-${b.toLowerCase()}"></span>${b}</td>
            ${SOLD_PERIODS.map(p => `<td>${soldPeso(totals[b][p.key])}</td>`).join('')}
            <td class="sold-col-total">${soldPeso(totals[b].all)}</td>
        </tr>`).join('');
    const totalRow = `
        <tr class="sold-total-row">
            <td>All Categories</td>
            ${SOLD_PERIODS.map(p => `<td>${soldPeso(colTotal(p.key))}</td>`).join('')}
            <td class="sold-col-total">${soldPeso(colTotal('all'))}</td>
        </tr>`;
    el.innerHTML = `<table class="sold-matrix"><thead>${head}</thead><tbody>${rows}${totalRow}</tbody></table>`;
}

// The record list — never mixes categories: each completion bucket renders as
// its own section with a per-section total. Filtered by the category chip, the
// time-period chip, and the search box.
// Summary stat cards for Sold Records: all-time total per category + month-over-
// month trend (this calendar month vs last, by sold_at). Read-only.
function renderSoldStats() {
    const grid = document.getElementById('soldStatGrid');
    if (!grid) return;
    if (!_soldCache.length) { grid.innerHTML = ''; return; }
    const now = new Date();
    const curM = now.getFullYear() * 12 + now.getMonth();
    const mk = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
    const agg = {};
    SOLD_BUCKETS.forEach(b => agg[b] = { t: 0, c: 0, p: 0 });
    _soldCache.forEach(r => {
        const b = soldBucket(r.category);
        if (!agg[b]) return;
        const a = soldAmount(r);
        agg[b].t += a;
        const k = mk(r.sold_at);
        if (k === curM) agg[b].c += a; else if (k === curM - 1) agg[b].p += a;
    });
    const card = (tint, icClass, icon, label, o) => {
        let dir = 'flat', arrow = 'fa-minus', txt = '0%';
        if (o.p === 0 && o.c > 0) { dir = 'up'; arrow = 'fa-arrow-up'; txt = 'New'; }
        else if (o.p > 0) {
            const pct = Math.round((o.c - o.p) / o.p * 100);
            dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
            arrow = pct > 0 ? 'fa-arrow-up' : pct < 0 ? 'fa-arrow-down' : 'fa-minus';
            txt = (pct > 0 ? '+' : '') + pct + '%';
        }
        return `<div class="stat-card tint-${tint}">
            <div class="stat-ic ${icClass}"><i class="fas ${icon}"></i></div>
            <div class="stat-body">
                <div class="stat-label">${label}</div>
                <div class="stat-figure">
                    <div class="stat-num">${soldPeso(o.t)}</div>
                    <div class="stat-trend ${dir}"><span class="st-pct"><i class="fas ${arrow}"></i> ${txt}</span><span class="st-sub">vs last month</span></div>
                </div>
            </div>
        </div>`;
    };
    grid.innerHTML =
        card('blue', 'blue', 'fa-tag', 'Total Sold', agg.Sold) +
        card('green', 'green', 'fa-house', 'Total Bought', agg.Bought) +
        card('amber', 'amber', 'fa-key', 'Total Rented', agg.Rented) +
        card('purple', 'purple', 'fa-file-lines', 'Total Leased', agg.Leased);
}

function renderSoldRecords() {
    const list = document.getElementById('soldRecordsList');
    if (!list) return;
    const q = (document.getElementById('soldSearchInput')?.value || '').trim().toLowerCase();

    const filtered = _soldCache.filter(r => {
        if (!soldInPeriod(r, _soldPeriodFilter)) return false;
        if (_soldCatFilter !== 'all' && soldBucket(r.category) !== _soldCatFilter) return false;
        if (q && !(
            (r.seller || '').toLowerCase().includes(q) ||
            (r.category || '').toLowerCase().includes(q) ||
            String(r.listing_id || '').toLowerCase().includes(q))) return false;
        return true;
    });

    if (!filtered.length) {
        list.innerHTML = `<div class="admin-card"><div class="empty-row">${_soldCache.length ? 'No records match these filters.' : 'No sold records yet.'}</div></div>`;
        return;
    }

    // One flat, sortable table of all matching records (reference design).
    const sortFns = {
        newest: (a, b) => new Date(b.sold_at || 0) - new Date(a.sold_at || 0),
        oldest: (a, b) => new Date(a.sold_at || 0) - new Date(b.sold_at || 0),
        'amount-high': (a, b) => soldAmount(b) - soldAmount(a),
        'amount-low': (a, b) => soldAmount(a) - soldAmount(b),
    };
    const sorted = filtered.slice().sort(sortFns[_soldSort] || sortFns.newest);
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '—';
    const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '';

    const body = sorted.map((r, i) => {
        const img = (Array.isArray(r.image_urls) && r.image_urls[0]) ? r.image_urls[0] : '';
        const thumb = img
            ? `<div class="sold-thumb"><img src="${escapeHtml(img)}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-house\\'></i>'"></div>`
            : `<div class="sold-thumb"><i class="fas fa-house"></i></div>`;
        const o = r.original || {};
        const sub = [o.unit_type, o.project].filter(Boolean).join(' · ');
        const locParts = [o.location_area, o.location_city].filter(Boolean);
        const loc = locParts.length ? locParts.join(', ')
            : (((r.content || '').split('\n').map(s => s.trim()).filter(Boolean)[0]) || '—').slice(0, 32);
        const amt = soldAmount(r);
        const amtCell = amt ? `<div class="sold-amt-fig">${soldPeso(amt)}</div>` : `<div class="sold-amt-fig none">No amount</div>`;
        const status = r.deleted_at
            ? `<span class="reg-badge-approved"><i class="fas fa-trash-can"></i> DELETED</span>`
            : `<span class="reg-badge-pending"><i class="fas fa-clock"></i> SCHEDULED</span>`;
        return `
        <tr>
          <td class="rc-num" data-label="#">${String(i + 1).padStart(2, '0')}</td>
          <td data-label="Listing">
            <div class="sold-listing">${thumb}
              <div class="sold-listing-text">
                <div class="sold-listing-title">Listing #${escapeHtml(String(r.listing_id || '—'))}</div>
                <div class="sold-listing-sub">${soldCatBadge(r.category)}${sub ? ' <span class="sold-listing-type">' + escapeHtml(sub) + '</span>' : ''}</div>
              </div>
            </div>
          </td>
          <td data-label="Seller"><div class="sold-seller"><div class="rc-avatar">${_acInitials(r.seller || '?')}</div><span>${escapeHtml(r.seller || '(unknown)')}</span></div></td>
          <td data-label="Location"><div class="sold-loc-cell"><i class="fas fa-location-dot"></i> ${escapeHtml(loc)}</div></td>
          <td data-label="Sold Date">${_soldDateCell('fa-calendar', r.sold_at, fmtDate, fmtTime)}</td>
          <td data-label="Auto-deletion">${_soldDateCell('fa-clock', r.deleted_at || r.delete_at, fmtDate, fmtTime)}</td>
          <td class="rc-status" data-label="Status">${status}</td>
          <td class="num" data-label="Amount">${amtCell}</td>
          <td class="rc-actions" data-label="Actions">
            <div class="rk">
              <button class="rk-btn" aria-label="More" onclick="toggleRegMenu(event, this)"><i class="fas fa-ellipsis"></i></button>
              <div class="rk-menu"><button class="rk-item" onclick="soldDetails('${escapeHtml(String(r.id))}');closeRegMenus()"><i class="fas fa-circle-info"></i> View details</button></div>
            </div>
          </td>
        </tr>`;
    }).join('');

    const sortLabels = { newest: 'Newest First', oldest: 'Oldest First', 'amount-high': 'Highest Amount', 'amount-low': 'Lowest Amount' };
    // Title + dot reflect the selected category filter (not always "Sold").
    const catTitles = { all: 'All Deals', Sold: 'Sold', Bought: 'Bought', Rented: 'Rented', Leased: 'Leased', Uncategorized: 'Uncategorized' };
    const catDot = { all: 'var(--rm-primary)', Sold: '#dc2626', Bought: '#16a34a', Rented: '#d97706', Leased: '#7c3aed' };
    const catTitle = catTitles[_soldCatFilter] || 'All Deals';
    const dotColor = catDot[_soldCatFilter] || 'var(--rm-primary)';
    list.innerHTML = `
      <div class="admin-card reg-table-card">
        <div class="rtbl-head">
          <div class="rtbl-title"><span class="sold-hdr-dot" style="background:${dotColor}"></span> ${catTitle} (<span>${sorted.length}</span>)</div>
          <div class="rk sold-sort">
            <button class="btn-ghost" onclick="toggleRegMenu(event, this)"><i class="fas fa-arrow-down-short-wide"></i> ${sortLabels[_soldSort] || 'Newest First'} <i class="fas fa-chevron-down" style="font-size:10px;"></i></button>
            <div class="rk-menu">
              ${Object.entries(sortLabels).map(([k, v]) => `<button class="rk-item ${k === _soldSort ? 'rk-on' : ''}" onclick="setSoldSort('${k}')">${v}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="rtbl-scroll">
          <table class="rtbl sold-tbl">
            <thead><tr>
              <th class="rc-num">#</th><th>Property / Listing</th><th>Seller</th><th>Location</th><th>Sold Date</th><th>Auto-deletion</th><th>Status</th><th class="num">Amount</th><th class="rc-actions">Actions</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
}

function _soldDateCell(icon, d, fmtDate, fmtTime) {
    if (!d) return '<span class="sold-dt-none">—</span>';
    return `<div class="sold-dt"><i class="fas ${icon}"></i><div><div class="sold-dt-d">${fmtDate(d)}</div><div class="sold-dt-t">${fmtTime(d)}</div></div></div>`;
}
function setSoldSort(v) { _soldSort = v; closeRegMenus(); renderSoldRecords(); }

// Details modal for a sold record (opened from the row's kebab). Read-only.
function soldDetails(id) {
    const r = _soldCache.find(x => String(x.id) === String(id));
    if (!r) return;
    const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
    const amt = soldAmount(r);
    const rows = [
        ['Seller', escapeHtml(r.seller || '—')],
        ['Category', escapeHtml(r.category || '—')],
        ['Listing ID', '#' + escapeHtml(String(r.listing_id || '—'))],
        ['Amount', amt ? soldPeso(amt) : '—'],
        ['Sold', fmt(r.sold_at)],
        ['Auto-deletion', r.deleted_at ? fmt(r.deleted_at) + ' (deleted)' : fmt(r.delete_at) + ' (scheduled)'],
    ].map(([k, v]) => `<div class="sd-row"><span class="sd-k">${k}</span><span class="sd-v">${v}</span></div>`).join('');
    const content = (r.content || '').trim();
    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    el.innerHTML = `
      <div class="rm-modal-box rm-modal-box-sm">
        <div class="rm-modal-head"><span>Sold Record</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
        <div class="rm-modal-body">
          <div class="sd-grid">${rows}</div>
          ${content ? `<div class="sold-content" style="margin-top:14px;">${escapeHtml(content)}</div>` : ''}
        </div>
      </div>`;
    document.body.appendChild(el);
}

// In-app replacement for alert() — a dismissible, auto-fading toast with a
// title + message, matching the Realmate palette. Used everywhere the
// registration workflow used to call the browser's alert().
function showAdminAlert(title, message, type = 'success', autoDismissMs = 5000) {
    const existing = document.getElementById('adminAlertToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'adminAlertToast';
    toast.className = 'admin-alert-toast admin-alert-' + type;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
        <div class="admin-alert-icon"><i class="fas ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i></div>
        <div class="admin-alert-text">
            <div class="admin-alert-title">${escapeHtml(title)}</div>
            <div class="admin-alert-message">${escapeHtml(message)}</div>
        </div>
        <span class="admin-alert-close" role="button" tabindex="0" aria-label="Dismiss notification" onclick="this.parentElement.remove()">&times;</span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    attachSwipeToDismiss(toast);

    if (autoDismissMs) {
        setTimeout(() => {
            if (!toast.isConnected) return;
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, autoDismissMs);
    }
}

// Mobile swipe-to-dismiss — drag the toast left/right past a threshold to
// close it early; a small drag snaps back instead of dismissing.
function attachSwipeToDismiss(toast) {
    let startX = null;
    toast.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    toast.addEventListener('touchmove', (e) => {
        if (startX === null) return;
        const dx = e.touches[0].clientX - startX;
        toast.style.transition = 'none';
        toast.style.transform = `translateX(calc(-50% + ${dx}px))`;
        toast.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 150));
    }, { passive: true });
    toast.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        toast.style.transition = '';
        if (Math.abs(dx) > 80) {
            toast.style.transform = `translateX(${dx > 0 ? '120vw' : '-120vw'})`;
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        } else {
            toast.style.transform = '';
            toast.style.opacity = '';
        }
        startX = null;
    });
}

// ── Utility ───────────────────────────────────────────
function showStatus(elId, msg, type) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.className = 'status-msg ' + type;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

// ── Analytics ─────────────────────────────────────────
// Five core KPIs × three periods, computed live from Supabase by the
// password-gated admin-analytics Edge Function (service_role). The function
// re-checks _currentPassword server-side and does all counting/aggregation
// there (including COUNT(DISTINCT) for Active Users) — the browser only ever
// receives the finished numbers, never raw rows, and normal users (anon key)
// can't reach the data at all.
const _nfmt = (n) => Number(n || 0).toLocaleString('en-US');
const _plus = (n) => (Number(n) > 0 ? '+' : '') + _nfmt(n);

async function loadSupport() {
    const box = document.getElementById('supportDivisions');
    if (!box) return;
    if (!Object.keys(_supportRows).length) box.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    let res;
    try {
        res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'list' } });
    } catch (e) {
        box.innerHTML = `<div class="empty-row"><i class="fas fa-triangle-exclamation"></i> Could not reach support. Ensure the <code>admin-support</code> Edge Function is deployed.<br><small>${escapeHtml(e.message || String(e))}</small></div>`;
        return;
    }
    if (res.error || !res.data || !res.data.ok) {
        box.innerHTML = `<div class="empty-row"><i class="fas fa-triangle-exclamation"></i> Support unavailable: ${escapeHtml(res.error?.message || res.data?.error || 'Unknown error')}</div>`;
        return;
    }
    _supportRows = {}; (res.data.requests || []).forEach(r => { _supportRows[r.id] = r; });
    renderSupportDivisions();
}

// Render the Support tab from the local cache (so optimistic updates are instant).
// Two tabs — Live Chat and Support Chat — each showing only its own requests,
// split into New / Handling / Done (New always on top). A red badge on a tab
// counts its NEW (open) requests; it re-renders on every realtime refresh, so
// the badge updates live. Same on desktop and mobile.
// ── Support queue (reference design: summary cards + filterable request list) ─
let _supStatusFilter = 'all';   // all | open | being_handled (active queues only)
let _supDoneSrc = 'all';        // Done tab source filter: all | live | support
let _supSort = 'newest';
let _supQ = '';
let _supTime = 'all';
let _supPage = 1;
let _supPerPage = 10;

const _supIsLive = (r) => r.is_live_chat || r.category === 'live_chat';
const _supStatusOf = (r) => r.status || 'open';

function renderSupportSummary(division) {
    const grid = document.getElementById('supSummary');
    if (!grid) return;
    const now = Date.now();
    const subset = (st) => division.filter(r => _supStatusOf(r) === st);
    const trend = (list) => {
        let c = 0, p = 0;
        list.forEach(r => { const age = now - new Date(r.created_at).getTime(); if (age <= 7 * 864e5) c++; else if (age <= 14 * 864e5) p++; });
        return p > 0 ? Math.round((c - p) / p * 100) : (c > 0 ? 100 : 0);
    };
    const spark = (list, color) => {
        const arr = new Array(14).fill(0), start = now - 13 * 864e5;
        list.forEach(r => { const i = Math.floor((new Date(r.created_at).getTime() - start) / 864e5); if (i >= 0 && i < 14) arr[i]++; });
        return _sparkline(arr, color, 120, 46);
    };
    const trendHtml = (pct) => {
        const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
        const arr = pct > 0 ? 'fa-arrow-up' : pct < 0 ? 'fa-arrow-down' : 'fa-arrow-right';
        return `<span class="an-tr ${dir}"><i class="fas ${arr}"></i> ${(pct > 0 ? '+' : '') + pct}%</span> <span class="an-tr-sub">vs last 7 days</span>`;
    };
    const card = (tint, ic, icon, num, label, list, color) => `
      <div class="an-mini tint-${tint}">
        <div class="stat-ic ${ic}"><i class="fas ${icon}"></i></div>
        <div class="an-mini-text"><div class="an-mini-label">${label}</div><div class="an-mini-num">${_nfmt(num)}</div><div class="an-mini-trend">${trendHtml(trend(list))}</div></div>
        <div class="an-mini-spark">${spark(list, color)}</div>
      </div>`;
    grid.innerHTML =
        card('blue', 'blue', 'fa-comments', division.length, 'Total Requests', division, '#2563eb') +
        card('amber', 'amber', 'fa-clock', subset('open').length, 'New', subset('open'), '#d97706') +
        card('purple', 'purple', 'fa-hourglass-half', subset('being_handled').length, 'Handling', subset('being_handled'), '#7c3aed') +
        card('green', 'green', 'fa-circle-check', subset('resolved').length, 'Done', subset('resolved'), '#16a34a');
}

function renderSupportDivisions() {
    const box = document.getElementById('supportDivisions');
    if (!box) return;
    const reqs = Object.values(_supportRows);
    const live = reqs.filter(_supIsLive), support = reqs.filter(r => !_supIsLive(r));
    const resolvedAll = reqs.filter(r => _supStatusOf(r) === 'resolved');
    let tab = _supActiveTab;
    if (tab !== 'support' && tab !== 'done') tab = 'live';
    const isDone = tab === 'done';

    // Summary is a stable, global header (all requests, every status) so the KPIs
    // don't jump around when the rep switches queues.
    renderSupportSummary(reqs);

    const nOpen = (arr) => arr.filter(r => _supStatusOf(r) === 'open').length;
    const badge = (n) => n > 0 ? `<span class="sup-tab-badge">${n > 99 ? '99+' : n}</span>` : '';
    const doneBadge = (n) => n > 0 ? `<span class="sup-tab-badge sup-tab-badge-done">${n > 99 ? '99+' : n}</span>` : '';
    const tabsHtml = `
      <div class="sup-tabs" role="tablist">
        <button type="button" class="sup-tab ${tab === 'live' ? 'active' : ''}" role="tab" onclick="supSwitchDiv('live')"><i class="fas fa-comments"></i> Live Chat ${badge(nOpen(live))}</button>
        <button type="button" class="sup-tab ${tab === 'support' ? 'active' : ''}" role="tab" onclick="supSwitchDiv('support')"><i class="fas fa-headset"></i> Support Chat ${badge(nOpen(support))}</button>
        <button type="button" class="sup-tab sup-tab-done ${tab === 'done' ? 'active' : ''}" role="tab" onclick="supSwitchDiv('done')"><i class="fas fa-circle-check"></i> Done ${doneBadge(resolvedAll.length)}</button>
      </div>`;

    // The active queues (Live / Support) never list resolved chats — those move
    // to the Done tab, so a closed conversation can't be mistaken for a live one.
    const division = isDone
        ? resolvedAll
        : (tab === 'live' ? live : support).filter(r => _supStatusOf(r) !== 'resolved');

    const timeSel = `<select class="flt-ctl sup-timesel" onchange="_supTime=this.value;_supPage=1;renderSupportDivisions()">
        ${[['all', 'All Time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']].map(([v, l]) => `<option value="${v}"${v === _supTime ? ' selected' : ''}>${l}</option>`).join('')}
      </select>`;
    let chipsHtml, placeholder;
    if (isDone) {
        // Done archive: filter by source (Live vs Support) rather than status.
        const cAll = division.length,
            cLive = division.filter(_supIsLive).length,
            cSup = division.filter(r => !_supIsLive(r)).length;
        const chip = (key, label, count, dot) => `<button type="button" class="supchip ${_supDoneSrc === key ? 'active' : ''}" onclick="supSetDoneSrc('${key}')">${dot ? `<span class="supchip-dot ${dot}"></span>` : ''} ${label} (${count})</button>`;
        chipsHtml = chip('all', 'All', cAll, '') + chip('live', 'Live Chat', cLive, 'd-blue') + chip('support', 'Support', cSup, 'd-green');
        placeholder = 'Search closed chats by ticket ID, name, or message…';
    } else {
        const cAll = division.length, cNew = nOpen(division),
            cHandling = division.filter(r => _supStatusOf(r) === 'being_handled').length;
        const chip = (key, label, count, dot) => `<button type="button" class="supchip ${_supStatusFilter === key ? 'active' : ''}" onclick="supSetStatus('${key}')">${dot ? `<span class="supchip-dot ${dot}"></span>` : ''} ${label} (${count})</button>`;
        chipsHtml = chip('all', 'All', cAll, '') + chip('open', 'New', cNew, 'd-blue') + chip('being_handled', 'Handling', cHandling, 'd-amber');
        placeholder = 'Search by ticket ID, name, or message…';
    }
    const filterBar = `
      <div class="sup-filterbar">
        <div class="sup-chips">${chipsHtml}</div>
        <div class="flt-search sup-search"><i class="fas fa-magnifying-glass"></i><input type="search" class="flt-ctl" placeholder="${placeholder}" value="${escapeHtml(_supQ)}" oninput="_supQ=this.value;_supPage=1;renderSupportDivisions();this.focus();"></div>
        ${timeSel}
      </div>`;

    const now = Date.now();
    const timeCut = { today: 1, '7': 7, '30': 30 }[_supTime];
    const q = _supQ.trim().toLowerCase();
    let list = division.filter(r => {
        if (isDone) {
            if (_supDoneSrc === 'live' && !_supIsLive(r)) return false;
            if (_supDoneSrc === 'support' && _supIsLive(r)) return false;
        } else if (_supStatusFilter !== 'all' && _supStatusOf(r) !== _supStatusFilter) {
            return false;
        }
        if (timeCut && r.created_at && (now - new Date(r.created_at).getTime()) > timeCut * 864e5) return false;
        if (q && !(
            String(r.ticket_number || '').toLowerCase().includes(q) ||
            (r.name || '').toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.subject || r.message || '').toLowerCase().includes(q))) return false;
        return true;
    });
    list.sort(_supSort === 'oldest'
        ? (a, b) => new Date(a.created_at) - new Date(b.created_at)
        : (a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / _supPerPage));
    _supPage = Math.min(Math.max(1, _supPage), pages);
    const start = (_supPage - 1) * _supPerPage;
    const pageRows = list.slice(start, start + _supPerPage);

    const title = isDone ? 'Done Chats' : (tab === 'live' ? 'Live Chat Requests' : 'Support Requests');
    const icon = isDone ? 'fa-circle-check' : (tab === 'live' ? 'fa-comments' : 'fa-headset');
    const sortLabels = { newest: 'Newest First', oldest: 'Oldest First' };
    const sortDrop = `<div class="rk sup-sort">
        <button class="btn-ghost" onclick="toggleRegMenu(event,this)"><i class="fas fa-arrow-down-short-wide"></i> ${sortLabels[_supSort]} <i class="fas fa-chevron-down" style="font-size:10px;"></i></button>
        <div class="rk-menu">${Object.entries(sortLabels).map(([k, v]) => `<button class="rk-item ${k === _supSort ? 'rk-on' : ''}" onclick="supSetSort('${k}')">${v}</button>`).join('')}</div>
      </div>`;

    let pg = '';
    for (let p = 1; p <= pages; p++) pg += `<button class="pg ${p === _supPage ? 'active' : ''}" onclick="gotoSupPage(${p})">${p}</button>`;
    const from = total ? start + 1 : 0, to = Math.min(start + _supPerPage, total);
    const noun = isDone ? 'chat' : 'request';
    const foot = `<div class="rtbl-foot">
        <div class="rtbl-count">Showing ${from}–${to} of ${total} ${noun}${total === 1 ? '' : 's'}</div>
        <div class="rep-foot-right">
          <div class="pager"><button class="pg pg-arrow" ${_supPage <= 1 ? 'disabled' : ''} onclick="gotoSupPage(${_supPage - 1})"><i class="fas fa-chevron-left"></i></button>${pg}<button class="pg pg-arrow" ${_supPage >= pages ? 'disabled' : ''} onclick="gotoSupPage(${_supPage + 1})"><i class="fas fa-chevron-right"></i></button></div>
          <select class="flt-ctl rep-perpage" onchange="_supPerPage=parseInt(this.value,10)||10;_supPage=1;renderSupportDivisions()">${[10, 25, 50].map(n => `<option value="${n}"${n === _supPerPage ? ' selected' : ''}>${n} per page</option>`).join('')}</select>
        </div>
      </div>`;

    const emptyMsg = isDone
        ? (resolvedAll.length ? 'No closed chats match these filters.' : 'No chats have been marked Done yet.')
        : (division.length ? 'No requests match these filters.' : 'Nothing waiting here — you’re all caught up.');
    const listHtml = pageRows.length ? pageRows.map(r => _renderSuprCard(r, isDone)).join('')
        : `<div class="empty-row"><i class="fas fa-inbox"></i> ${emptyMsg}</div>`;

    box.innerHTML = tabsHtml + filterBar + `
      <div class="admin-card reg-table-card sup-listcard${isDone ? ' sup-done-list' : ''}">
        <div class="rtbl-head"><div class="rtbl-title"><i class="fas ${icon}"></i> ${title} (${total})</div>${sortDrop}</div>
        <div class="sup-list">${listHtml}</div>
        ${total ? foot : ''}
      </div>`;
}

function supSwitchDiv(tab) {
    _supActiveTab = (tab === 'support') ? 'support' : (tab === 'done') ? 'done' : 'live';
    _supPage = 1;
    _supStatusFilter = 'all';   // avoid a stale filter hiding everything on the next tab
    _supDoneSrc = 'all';
    renderSupportDivisions();
}
function supSetStatus(s) { _supStatusFilter = s; _supPage = 1; renderSupportDivisions(); }
function supSetDoneSrc(s) { _supDoneSrc = s; _supPage = 1; renderSupportDivisions(); }
function supSetSort(v) { _supSort = v; closeRegMenus(); renderSupportDivisions(); }
function gotoSupPage(p) { _supPage = p; renderSupportDivisions(); }

function _renderSuprCard(r, doneCtx) {
    const st = _supStatusOf(r);
    const isLive = _supIsLive(r);
    const mine = _adminMe.userId && String(r.assigned_to) === String(_adminMe.userId);
    const master = _adminMe.isMaster;
    const who = escapeHtml(r.name || r.email || 'A customer');
    const tno = r.ticket_number ? ('#' + r.ticket_number) : '—';
    const stBadge = st === 'resolved' ? '<span class="sup-badge sup-resolved">DONE</span>'
        : st === 'being_handled' ? '<span class="sup-badge sup-handling">HANDLING</span>'
            : '<span class="sup-badge sup-open">NEW</span>';
    // On the Done tab the conversation is closed, so tone the type tag down to a
    // neutral "· closed" pill — a muted card + green DONE must never read as live.
    const typeBadge = doneCtx
        ? `<span class="sup-cat sup-cat-done"><i class="fas ${isLive ? 'fa-comments' : 'fa-headset'}"></i> ${isLive ? 'Live chat' : escapeHtml(r.category || 'general')} · closed</span>`
        : (isLive ? '<span class="sup-livechat"><i class="fas fa-comments"></i> Live chat</span>' : `<span class="sup-cat">${escapeHtml(r.category || 'general')}</span>`);
    const when = r.created_at ? new Date(r.created_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '—';
    const preview = isLive ? 'Live chat request' : (r.subject || r.message || '—');
    const byLine = (st === 'being_handled') ? `<span class="supr-by"><i class="fas fa-user-shield"></i> @${escapeHtml(r.assigned_username || '?')}</span>`
        : (st === 'resolved' && r.resolved_by) ? `<span class="supr-by"><i class="fas fa-check"></i> by @${escapeHtml(r.resolved_by)}</span>` : '';

    const viewBtn = r.chat_conversation_id ? `<button class="supr-btn supr-dark" onclick="openSupportChat('${r.id}')"><i class="fas fa-eye"></i> ${doneCtx ? 'Read chat' : 'View'}</button>` : '';
    const delBtn = `<button class="btn-outline-sm rc-danger" onclick="supportDeleteTicket('${r.id}')"><i class="fas fa-trash-can"></i> Delete</button>`;
    const doneBtn = `<button class="btn-sm-green" onclick="supportResolve('${r.id}')"><i class="fas fa-check"></i> Done</button>`;
    let actions;
    if (st === 'resolved') {
        // Done archive: collapse read / reopen / delete into a 3-dot menu.
        const viewItem = r.chat_conversation_id ? `<button class="rk-item" onclick="openSupportChat('${r.id}');closeRegMenus()"><i class="fas fa-eye"></i> Read chat</button>` : '';
        actions = `<div class="rk">
            <button class="rk-btn" aria-label="More actions" onclick="toggleRegMenu(event,this)"><i class="fas fa-ellipsis-vertical"></i></button>
            <div class="rk-menu">${viewItem}<button class="rk-item" onclick="supportSetStatus('${r.id}','open');closeRegMenus()"><i class="fas fa-rotate-left"></i> Reopen</button><button class="rk-item rk-no" onclick="supportDeleteTicket('${r.id}');closeRegMenus()"><i class="fas fa-trash-can"></i> Delete</button></div>
          </div>`;
    } else if (master) {
        actions = viewBtn || '<span class="sc-muted">View only</span>';
    } else if (st === 'being_handled') {
        actions = mine
            ? `${r.chat_conversation_id ? `<button class="btn-sm-green" onclick="openSupportChat('${r.id}')"><i class="fas fa-comments"></i> Open chat</button>` : ''}<button class="btn-outline-sm" onclick="supportRelease('${r.id}')"><i class="fas fa-arrow-rotate-left"></i> Release</button>${doneBtn}`
            : `<span class="sup-locked"><i class="fas fa-lock"></i> @${escapeHtml(r.assigned_username || '?')}</span>`;
    } else {
        actions = isLive
            ? `<button class="btn-sm-green" onclick="supportClaim('${r.id}')"><i class="fas fa-comments"></i> Accept chat</button><button class="btn-outline-sm" onclick="supportResolve('${r.id}')"><i class="fas fa-check"></i> Done</button>`
            : `<button class="supr-btn supr-dark" onclick="supportClaim('${r.id}')"><i class="fas fa-hand-pointer"></i> Handle &amp; reply</button>${doneBtn}`;
    }

    return `
    <div class="supr-card supr-${st}${doneCtx ? ' supr-done-ctx' : ''}">
      <div class="supr-id">
        <div class="supr-badges">${stBadge}<span class="supr-tno">${tno}</span>${typeBadge}</div>
        <div class="supr-who"><div class="rc-avatar">${_acInitials(r.name || r.email || '?')}</div><div class="supr-wt"><div class="supr-name">${who}</div><div class="supr-prev">${escapeHtml(preview)}</div></div></div>
      </div>
      <div class="supr-meta">
        <div class="supr-mi"><i class="fas fa-clock"></i><div><div class="supr-val">${when}</div><div class="supr-lbl">When</div></div></div>
        <div class="supr-mi"><i class="fas fa-comment"></i><div><div class="supr-val">${escapeHtml(preview)}</div><div class="supr-lbl">Details</div></div></div>
      </div>
      <div class="supr-right">
        ${byLine}
        <div class="supr-actions">${actions}</div>
      </div>
    </div>`;
}

// Existing open/resolved toggle (kept for Reopen).
// Instant feedback: patch the local cache + re-render NOW, sync in the background.
function _supOptimistic(id, patch) {
    if (_supportRows[id]) { Object.assign(_supportRows[id], patch); renderSupportDivisions(); }
}
async function supportSetStatus(id, status) {
    _supOptimistic(id, status === 'open' ? { status: 'open', assigned_to: null, assigned_username: null, resolved_by: null } : { status });
    try {
        const res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'setStatus', id, status } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
    } catch (e) { showAdminAlert('Could not update', e.message || String(e), 'error'); }
    loadSupport();
}
// Claim a ticket. The Edge Function does the atomic take-ownership; if someone
// beat us to it we get a conflict message instead of silently double-handling.
async function supportClaim(id) {
    _supOptimistic(id, { status: 'being_handled', assigned_to: _adminMe.userId, assigned_username: _adminMe.username || 'me' });
    try {
        const res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'claim', id } });
        if (res.data?.conflict) { showAdminAlert('Already being handled', res.data.message || 'Another employee is on it.', 'error'); loadSupport(); return; }
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        const req = res.data.request || {};
        const convId = res.data.conversationId || req.chat_conversation_id || null;
        const repId = res.data.repId || req.chat_rep_id || _adminMe.userId;
        const tnum = res.data.ticketNumber || req.ticket_number;
        if (_supportRows[id]) { Object.assign(_supportRows[id], req, { chat_conversation_id: convId, chat_rep_id: repId }); renderSupportDivisions(); }
        if (convId) openSupportChatDirect(convId, req.name || 'Customer', repId, id, false, tnum);
        else showAdminAlert('Ticket claimed', 'You are now handling this ticket.', 'success');
        loadSupport();
    } catch (e) { showAdminAlert('Could not claim', e.message || String(e), 'error'); loadSupport(); }
}
// In-UI confirm (no browser confirm dialog) — a small centered modal.
function _adminConfirm(title, msg, confirmLabel, onConfirm) {
    let ov = document.getElementById('adminConfirm'); if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'adminConfirm'; ov.className = 'supconfirm'; ov.style.position = 'fixed'; ov.style.zIndex = '9999';
    ov.innerHTML =
        '<div class="supconfirm-box">' +
        '  <div class="supconfirm-ic"><i class="fas fa-triangle-exclamation"></i></div>' +
        '  <div class="supconfirm-title">' + escapeHtml(title) + '</div>' +
        '  <div class="supconfirm-msg">' + escapeHtml(msg) + '</div>' +
        '  <div class="supconfirm-actions">' +
        '    <button class="eb eb-neutral" id="adminConfirmNo">Cancel</button>' +
        '    <button class="eb eb-danger" id="adminConfirmYes"><i class="fas fa-trash-can"></i> ' + escapeHtml(confirmLabel) + '</button>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#adminConfirmNo').onclick = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#adminConfirmYes').onclick = () => { ov.remove(); onConfirm(); };
}

// Delete a DONE (resolved) ticket and its chat thread. Optimistic + reconcile.
async function supportDeleteTicket(id) {
    const r = _supportRows[id];
    const tno = (r && r.ticket_number) ? ('#' + r.ticket_number) : 'this ticket';
    _adminConfirm('Delete ticket?', `Permanently delete ${tno} and its chat. This can't be undone.`, 'Delete', async () => {
        const backup = _supportRows[id];
        delete _supportRows[id]; renderSupportDivisions(); // optimistic
        try {
            const res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'delete', id } });
            if (res.error || !res.data || !res.data.ok) throw new Error(res.error?.message || res.data?.error || 'Delete failed');
            showAdminAlert('Ticket deleted', `${tno} was removed.`, 'success', 3000);
        } catch (e) {
            if (backup) { _supportRows[id] = backup; renderSupportDivisions(); } // restore on failure
            showAdminAlert('Delete failed', e.message || String(e), 'error');
        }
        loadSupport();
    });
}

// Open the embedded chat for a ticket. Master is view-only (read-only transcript).
function openSupportChat(id) {
    const r = _supportRows[id];
    if (!r) { showAdminAlert('Unavailable', 'Reload the Support tab and try again.', 'error'); return; }
    if (!r.chat_conversation_id) { showAdminAlert('No chat yet', 'This request has no chat conversation. Accept it first.', 'error'); return; }
    const readOnly = (r.status === 'resolved') || _adminMe.isMaster;
    openSupportChatDirect(r.chat_conversation_id, r.name || 'Customer', r.chat_rep_id || r.assigned_to || _adminMe.userId, id, readOnly, r.ticket_number);
}
async function supportRelease(id) {
    _supOptimistic(id, { status: 'open', assigned_to: null, assigned_username: null });
    try {
        const res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'release', id } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
    } catch (e) { showAdminAlert('Could not release', e.message || String(e), 'error'); }
    loadSupport();
}
async function supportResolve(id) {
    _supOptimistic(id, { status: 'resolved', resolved_by: _adminMe.username || 'admin' });
    try {
        const res = await _sbAdmin.functions.invoke('admin-support', { body: { adminPassword: _currentPassword, action: 'resolve', id } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
    } catch (e) { showAdminAlert('Could not resolve', e.message || String(e), 'error'); }
    loadSupport();
}

// ── Embedded live-chat pane (Support tab) ────────────────────────────────────
// Reuses the EXISTING chat tables (conversations / messages). The rep sends as
// the ticket's assigned_to (the claimer); realtime keeps both sides in sync.
let _supportRows = {};
let _supActiveTab = 'live'; // which Customer Service tab is showing: 'live' | 'support'
let _supChat = { convId: null, senderId: null, ticketId: null, channel: null, review: false };

function _supChatEl() {
    let ov = document.getElementById('supChatOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'supChatOverlay';
    ov.className = 'supchat-overlay';
    ov.innerHTML =
        '<div class="supchat-card">' +
        '  <div class="supchat-head" onclick="if(this.parentElement.parentElement.classList.contains(\'minimized\'))minimizeSupportChat()">' +
        '    <div class="supchat-who"><i class="fas fa-comments"></i> <span id="supChatName">Customer</span>' +
        '      <span class="supchat-ticket" id="supChatTicket"></span><span class="supchat-live" id="supChatLiveTag">LIVE</span></div>' +
        '    <button class="supchat-end" id="supChatEndBtn" onclick="event.stopPropagation();endSupportChat()" title="End chat">End chat</button>' +
        '    <button class="supchat-min" aria-label="Minimize" onclick="event.stopPropagation();minimizeSupportChat()"><i class="fas fa-minus"></i></button>' +
        '    <button class="supchat-x" aria-label="Close" onclick="event.stopPropagation();closeSupportChat()">&times;</button>' +
        '  </div>' +
        '  <div class="supchat-msgs" id="supChatMsgs"></div>' +
        '  <div class="supchat-suggest" id="supChatSuggest"></div>' +
        '  <div class="supchat-input" id="supChatInputBar">' +
        '    <input type="text" id="supChatInput" placeholder="Type a message…" autocomplete="off" onkeydown="if(event.key===\'Enter\')supChatSend()">' +
        '    <button class="supchat-send" aria-label="Send" onclick="supChatSend()"><i class="fas fa-paper-plane"></i></button>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(ov);
    return ov;
}

// Clickable canned replies for employees (extend this list to add more).
const SUP_SUGGESTIONS = [
    'If we’ve fully resolved your concern, please click “I’m satisfied” to close this chat.',
    'Thank you for confirming! We’re glad we could assist you. Your concern has been resolved, and this chat is now closed. If you need anything else, you can always reach out to realmate Support again.',
    'Thanks for your patience — is there anything else I can help you with?',
    'Could you share a bit more detail so I can assist you better?',
];

async function openSupportChatDirect(convId, custName, senderId, ticketId, review, ticketNumber) {
    _supChat.convId = convId; _supChat.senderId = senderId; _supChat.ticketId = ticketId; _supChat.review = !!review;
    const ov = _supChatEl();
    document.getElementById('supChatName').textContent = custName || 'Customer';
    const tk = document.getElementById('supChatTicket');
    if (tk) tk.textContent = ticketNumber ? ('Ticket No. ' + ticketNumber) : '';
    // Resolved chat = read-only transcript review.
    const liveTag = document.getElementById('supChatLiveTag');
    const endBtn = document.getElementById('supChatEndBtn');
    const inputBar = document.getElementById('supChatInputBar');
    if (liveTag) { liveTag.textContent = review ? 'CLOSED' : 'LIVE'; liveTag.classList.toggle('ended', !!review); }
    if (endBtn) endBtn.style.display = review ? 'none' : '';
    if (inputBar) inputBar.style.display = review ? 'none' : 'flex';
    // Suggested messages (hidden while reviewing a closed ticket).
    const sug = document.getElementById('supChatSuggest');
    if (sug) {
        sug.style.display = review ? 'none' : '';
        sug.innerHTML = review ? '' : '<span class="supchat-suggest-lbl">Suggested</span>' +
            SUP_SUGGESTIONS.map((s, i) => `<button class="supchat-chip" onclick="supChatSuggest(${i})">${escapeHtml(s)}</button>`).join('');
    }
    ov.classList.remove('minimized');
    ov.classList.add('open');
    await supChatLoad();
    if (!review) supChatSubscribe(); else supChatUnsub();
    // Auto-focus the input on desktop for quick typing, but NOT on touch
    // devices — there it would pop the on-screen keyboard before the rep has
    // even chosen a suggested message.
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!review && !coarse) setTimeout(() => { const i = document.getElementById('supChatInput'); if (i) i.focus(); }, 60);
}

// Send a canned suggestion as the employee (no copy/paste, no typing).
function supChatSuggest(i) {
    // Send directly without activating the text input or on-screen keyboard.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const text = SUP_SUGGESTIONS[i];
    if (text) supChatSend(text);
}

// End the live chat: resolve the ticket (which removes the customer from the
// conversation so it leaves THEIR Chat) and close the pane. The transcript stays
// on the admin side (View chat on the resolved ticket).
// In-UI confirmation (no browser/system alert) shown inside the chat pane.
function endSupportChat() {
    const id = _supChat.ticketId;
    if (!id) { closeSupportChat(); return; }
    const host = document.querySelector('#supChatOverlay .supchat-card') || document.body;
    let ov = document.getElementById('supConfirm'); if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'supConfirm'; ov.className = 'supconfirm';
    ov.innerHTML =
        '<div class="supconfirm-box">' +
        '  <div class="supconfirm-ic"><i class="fas fa-circle-question"></i></div>' +
        '  <div class="supconfirm-title">End this conversation?</div>' +
        '  <div class="supconfirm-msg">It becomes read-only for the customer — they keep it in their Chat as a closed “Offline” ticket, and you can still review it here.</div>' +
        '  <div class="supconfirm-actions">' +
        '    <button class="eb eb-neutral" onclick="document.getElementById(\'supConfirm\').remove()">Cancel</button>' +
        '    <button class="eb eb-danger" onclick="_doEndSupportChat()"><i class="fas fa-check"></i> End chat</button>' +
        '  </div>' +
        '</div>';
    host.appendChild(ov);
}
async function _doEndSupportChat() {
    const id = _supChat.ticketId;
    const ov = document.getElementById('supConfirm'); if (ov) ov.remove();
    closeSupportChat();
    if (id) await supportResolve(id);
}

async function supChatLoad() {
    const box = document.getElementById('supChatMsgs');
    if (!box) return;
    try {
        const { data, error } = await _sbAdmin.from('messages').select('*').eq('conversation_id', _supChat.convId).order('created_at', { ascending: true });
        if (error) throw error;
        supChatRender(data || []);
    } catch (e) {
        box.innerHTML = `<div class="supchat-empty">Could not load messages: ${escapeHtml(e.message || String(e))}</div>`;
    }
}

function supChatRender(msgs) {
    const box = document.getElementById('supChatMsgs');
    if (!box) return;
    if (!msgs.length) { box.innerHTML = '<div class="supchat-empty">No messages yet — say hello 👋</div>'; return; }
    box.innerHTML = msgs.map(m => {
        const mine = String(m.sender_id) === String(_supChat.senderId);
        const txt = m.message_text || (m.file_url ? ('📎 ' + (m.file_name || 'attachment')) : '');
        const t = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="supchat-row ${mine ? 'me' : 'them'}"><div class="supchat-bubble">${escapeHtml(txt)}<span class="supchat-t">${t}</span></div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
    _supUpdateSatisfiedBanner(msgs);
}

// CS: when the customer sends "I'm satisfied", cue the admin (in the chat pane)
// that they can close the ticket. Shown only on an active (non-review) chat.
function _supUpdateSatisfiedBanner(msgs) {
    const card = document.querySelector('#supChatOverlay .supchat-card');
    const existing = document.getElementById('supChatSatBanner');
    const norm = s => (s || '').replace(/[’‘']/g, "'").trim().toLowerCase();
    const custSatisfied = !_supChat.review && (msgs || []).some(m =>
        String(m.sender_id) !== String(_supChat.senderId) && norm(m.message_text) === "i'm satisfied");
    if (custSatisfied && card) {
        if (!existing) {
            const banner = document.createElement('div');
            banner.id = 'supChatSatBanner';
            banner.className = 'supchat-sat';
            banner.innerHTML = '<i class="fas fa-circle-check"></i> <span>The customer is satisfied — you can close this ticket.</span>';
            const inputBar = document.getElementById('supChatInputBar') || card.querySelector('.supchat-input');
            card.insertBefore(banner, inputBar);
        }
    } else if (existing) {
        existing.remove();
    }
}

function supChatSubscribe() {
    supChatUnsub();
    try {
        _supChat.channel = _sbAdmin.channel('supchat-' + _supChat.convId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + _supChat.convId }, () => supChatLoad())
            .subscribe();
    } catch (e) {}
}
function supChatUnsub() {
    if (_supChat.channel) { try { _sbAdmin.removeChannel(_supChat.channel); } catch (e) {} _supChat.channel = null; }
}

async function supChatSend(presetText) {
    if (_supChat.review) return; // resolved transcript is read-only
    const inp = document.getElementById('supChatInput');
    const text = (typeof presetText === 'string' ? presetText : (inp && inp.value || '')).trim();
    if (!text) return;
    if (!_supChat.senderId) { showAdminAlert('Cannot send', 'No sender identity — reload and re-open the chat.', 'error'); return; }
    if (typeof presetText !== 'string' && inp) inp.value = '';
    try {
        const now = new Date().toISOString();
        const { error } = await _sbAdmin.from('messages').insert({ conversation_id: _supChat.convId, sender_id: _supChat.senderId, message_type: 'TEXT', message_text: text, is_read: false, created_at: now });
        if (error) throw error;
        await _sbAdmin.from('conversations').update({ updated_at: now }).eq('id', _supChat.convId);
        supChatLoad();
    } catch (e) { showAdminAlert('Send failed', e.message || String(e), 'error'); if (inp) inp.value = text; }
}

function closeSupportChat() {
    supChatUnsub();
    const ov = document.getElementById('supChatOverlay');
    if (ov) { ov.classList.remove('open'); ov.classList.remove('minimized'); }
}
function minimizeSupportChat() {
    const ov = document.getElementById('supChatOverlay');
    if (!ov) return;
    ov.classList.toggle('minimized');
    const icon = ov.querySelector('.supchat-min i');
    if (icon) icon.className = ov.classList.contains('minimized') ? 'fas fa-up-right-and-down-left-from-center' : 'fas fa-minus';
    if (!ov.classList.contains('minimized')) { const box = document.getElementById('supChatMsgs'); if (box) box.scrollTop = box.scrollHeight; }
}

// ── Reports queue (reference design: summary cards + filterable table) ───────
let _reportsCache = [];
let _reportsPage = 1;
let _reportsPerPage = 10;
const _repF = { q: '', status: 'all', type: 'all', reason: 'all', time: 'all' };
// Reports are grouped into three workflow sections (tabs), independent of the
// finer DB status. New = awaiting triage (open), Under Review = being handled
// (reviewed), Done = resolved and kept for the record (dismissed OR actioned/
// deleted). Nothing is ever deleted from the reports table on "Done".
let _repSection = 'new';
const _REP_SECTIONS = {
    new: { label: 'New', icon: 'fa-inbox', match: r => r.status === 'open' },
    review: { label: 'Under Review', icon: 'fa-clipboard-check', match: r => r.status === 'reviewed' },
    done: { label: 'Done', icon: 'fa-circle-check', match: r => r.status === 'actioned' || r.status === 'dismissed' },
};
function reportSetSection(s) { if (_REP_SECTIONS[s]) { _repSection = s; _reportsPage = 1; renderReports(); } }

async function loadReports() {
    const table = document.getElementById('reportsTable');
    if (!table) return;
    table.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    let res;
    try {
        res = await _sbAdmin.functions.invoke('admin-reports', { body: { adminPassword: _currentPassword, action: 'list' } });
    } catch (e) {
        table.innerHTML = `<div class="empty-row">Could not reach reports. Ensure the <code>admin-reports</code> Edge Function is deployed.<br><small>${escapeHtml(e.message || String(e))}</small></div>`;
        return;
    }
    if (res.error || !res.data || !res.data.ok) {
        table.innerHTML = `<div class="empty-row">Reports unavailable: ${escapeHtml(res.error?.message || res.data?.error || 'Unknown error')}</div>`;
        return;
    }
    _reportsCache = res.data.reports || [];
    _reportsPage = 1;
    renderReportsSummary();
    renderReports();
}

function renderReportsSummary() {
    const grid = document.getElementById('reportsSummary');
    if (!grid) return;
    const now = new Date(), curM = now.getFullYear() * 12 + now.getMonth();
    const thisMonth = (d) => d && (new Date(d).getFullYear() * 12 + new Date(d).getMonth()) === curM;
    const open = _reportsCache.filter(r => r.status === 'open').length;
    const reviewed = _reportsCache.filter(r => r.status === 'reviewed' && thisMonth(r.reviewed_at)).length;
    const dismissed = _reportsCache.filter(r => r.status === 'dismissed' && thisMonth(r.reviewed_at)).length;
    const deleted = _reportsCache.filter(r => r.status === 'actioned' && thisMonth(r.reviewed_at)).length;
    const card = (tint, icClass, icon, num, label, sub) => `
      <div class="stat-card tint-${tint}">
        <div class="stat-ic ${icClass}"><i class="fas ${icon}"></i></div>
        <div class="stat-body"><div class="stat-num">${_nfmt(num)}</div><div class="stat-label">${label}</div><div class="rep-sub">${sub}</div></div>
      </div>`;
    grid.innerHTML =
        card('red', 'red', 'fa-triangle-exclamation', open, 'Open Reports', 'Needs review') +
        card('green', 'green', 'fa-circle-check', reviewed, 'Reviewed', 'This month') +
        card('slate', 'slate', 'fa-circle-xmark', dismissed, 'Dismissed', 'This month') +
        card('amber', 'amber', 'fa-trash-can', deleted, 'Deleted', 'This month');
}

const _REP_TYPE = { listing: ['Listing', 'rt-blue'], post: ['Post', 'rt-purple'], comment: ['Comment', 'rt-indigo'], user: ['User', 'rt-green'], chat: ['Chat', 'rt-amber'] };
function _repTypeBadge(t) { const m = _REP_TYPE[t] || [t || '—', 'rt-slate']; return `<span class="rep-type ${m[1]}">${escapeHtml(m[0])}</span>`; }
function _repReasonBadge(reason) {
    const r = (reason || '').toLowerCase();
    const cls = /inappropri|nsfw|explicit/.test(r) ? 'rr-red' : /scam|fraud/.test(r) ? 'rr-orange' : /spam/.test(r) ? 'rr-amber' : /harass|abuse|hate/.test(r) ? 'rr-red' : 'rr-slate';
    return `<span class="rep-reason ${cls}">${escapeHtml(reason || '—')}</span>`;
}
function _repStatusBadge(s) {
    const m = { open: ['Open', 'rs-open'], reviewed: ['Reviewed', 'rs-reviewed'], dismissed: ['Dismissed', 'rs-dismissed'], actioned: ['Deleted', 'rs-deleted'] }[s] || [s || '—', 'rs-dismissed'];
    return `<span class="rep-status ${m[1]}"><span class="rs-dot"></span> ${escapeHtml(m[0])}</span>`;
}

function _reportsFiltered() {
    const now = Date.now();
    const timeCut = { today: 1, '7': 7, '30': 30 }[_repF.time];
    const q = _repF.q.trim().toLowerCase();
    const secMatch = (_REP_SECTIONS[_repSection] || _REP_SECTIONS.new).match;
    return _reportsCache.filter(r => {
        if (!secMatch(r)) return false;
        if (_repF.type !== 'all' && r.content_type !== _repF.type) return false;
        if (_repF.reason !== 'all' && r.reason !== _repF.reason) return false;
        if (timeCut && r.created_at && (now - new Date(r.created_at).getTime()) > timeCut * 864e5) return false;
        if (q && !(
            (r.reported_user_name || '').toLowerCase().includes(q) ||
            (r.reason || '').toLowerCase().includes(q) ||
            (r.details || '').toLowerCase().includes(q) ||
            (r.content_type || '').toLowerCase().includes(q))) return false;
        return true;
    });
}

function reportSetFilter(key, val) { _repF[key] = val; _reportsPage = 1; renderReports(); }
function gotoReportsPage(p) { _reportsPage = p; renderReports(); }
function setReportsPerPage(n) { _reportsPerPage = parseInt(n, 10) || 10; _reportsPage = 1; renderReports(); }

function renderReports() {
    const box = document.getElementById('reportsTable');
    if (!box) return;
    const openCount = _reportsCache.filter(r => r.status === 'open').length;
    const uniq = (k) => [...new Set(_reportsCache.map(r => r[k]).filter(Boolean))];
    const opt = (val, cur, label) => `<option value="${escapeHtml(val)}"${val === cur ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    const typeSel = `<select class="flt-ctl rep-flt" onchange="reportSetFilter('type',this.value)">${opt('all', _repF.type, 'All Types')}${uniq('content_type').map(t => opt(t, _repF.type, (_REP_TYPE[t] ? _REP_TYPE[t][0] : t))).join('')}</select>`;
    const reasonSel = `<select class="flt-ctl rep-flt" onchange="reportSetFilter('reason',this.value)">${opt('all', _repF.reason, 'All Reasons')}${uniq('reason').map(r => opt(r, _repF.reason, r)).join('')}</select>`;
    const timeSel = `<select class="flt-ctl rep-flt" onchange="reportSetFilter('time',this.value)">${opt('all', _repF.time, 'All Time')}${opt('today', _repF.time, 'Today')}${opt('7', _repF.time, 'Last 7 days')}${opt('30', _repF.time, 'Last 30 days')}</select>`;

    // Workflow section tabs (New / Under Review / Done) — the primary way to
    // navigate reports by status. Each carries a live count from the cache.
    const secCount = (key) => _reportsCache.filter(_REP_SECTIONS[key].match).length;
    const tabs = Object.keys(_REP_SECTIONS).map(key => {
        const s = _REP_SECTIONS[key];
        const n = secCount(key);
        return `<button type="button" class="rep-tab${key === _repSection ? ' active' : ''}" onclick="reportSetSection('${key}')">
            <i class="fas ${s.icon}"></i> ${s.label}<span class="rep-tab-count">${n}</span>
          </button>`;
    }).join('');

    const head = `
      <div class="rtbl-head rep-head">
        <div class="rtbl-title"><i class="fas fa-flag"></i> Reported Content <span class="rep-open-count">(${openCount} New)</span></div>
        <div class="rep-controls">
          <div class="flt-search rep-search"><i class="fas fa-magnifying-glass"></i><input type="search" class="flt-ctl" placeholder="Search by user, reason, or details…" value="${escapeHtml(_repF.q)}" oninput="_repF.q=this.value;_reportsPage=1;renderReports();this.focus();"></div>
          ${typeSel}${reasonSel}${timeSel}
          <button type="button" class="btn-ghost" onclick="loadReports()"><i class="fas fa-rotate-right"></i></button>
        </div>
      </div>
      <div class="rep-tabs" role="tablist">${tabs}</div>`;

    const rows = _reportsFiltered();
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / _reportsPerPage));
    _reportsPage = Math.min(Math.max(1, _reportsPage), pages);
    const start = (_reportsPage - 1) * _reportsPerPage;
    const pageRows = rows.slice(start, start + _reportsPerPage);

    if (!total) {
        const secLabel = (_REP_SECTIONS[_repSection] || _REP_SECTIONS.new).label;
        const emptyMsg = _reportsCache.length
            ? (_repF.q || _repF.type !== 'all' || _repF.reason !== 'all' || _repF.time !== 'all'
                ? 'No reports match these filters.'
                : `No reports in “${secLabel}”.`)
            : 'No reports yet.';
        box.innerHTML = head + `<div class="empty-row"><i class="fas fa-flag"></i> ${escapeHtml(emptyMsg)}</div>`;
        return;
    }

    const body = pageRows.map(r => {
        const when = r.created_at ? new Date(r.created_at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '—';
        const uname = r.reported_user_name || '(unknown)';
        const handle = r.reported_username ? '@' + r.reported_username : '';
        const canDelete = ['post', 'comment', 'listing'].includes(r.content_type);
        const suspendItem = r.reported_user_id ? `<button class="rk-item rk-no" onclick="openBanModal('${r.reported_user_id}');closeRegMenus()"><i class="fas fa-ban"></i> Suspend user</button>` : '';

        // Status-transition buttons, per the workflow section the row is in:
        //   New       → Under Review, → Done (Delete also lands in Done)
        //   Under Rev → Done            (Delete also lands in Done)
        //   Done      → (terminal) read-only
        let statusBtns = '';
        if (r.status === 'open') {
            statusBtns = `
              <button class="btn-sm-green" onclick="reportSetStatus('${r.id}','reviewed')"><i class="fas fa-clipboard-check"></i> Under Review</button>
              <button class="btn-outline-sm" onclick="reportSetStatus('${r.id}','dismissed')"><i class="fas fa-check"></i> Mark Done</button>`;
        } else if (r.status === 'reviewed') {
            statusBtns = `
              <button class="btn-outline-sm" onclick="reportSetStatus('${r.id}','dismissed')"><i class="fas fa-check"></i> Mark Done</button>`;
        }
        const deleteBtn = (r.status === 'actioned')
            ? '' // content already removed (Done) — nothing left to delete
            : `<button class="btn-outline-sm rc-danger" ${canDelete ? '' : 'disabled'} onclick="reportDeleteContent('${r.id}')"><i class="fas fa-trash"></i> Delete</button>`;

        return `
        <tr class="${r.status === 'open' ? 'rep-row-open' : ''}">
          <td data-label="When" class="rc-date">${when}</td>
          <td data-label="Type">${_repTypeBadge(r.content_type)}</td>
          <td data-label="Reason">${_repReasonBadge(r.reason)}</td>
          <td data-label="Reported User">
            <div class="rc-user-cell"><div class="rc-avatar">${_acInitials(uname)}</div><div class="rc-user-text"><div class="rc-name">${escapeHtml(uname)}</div>${handle ? `<div class="rc-handle">${escapeHtml(handle)}</div>` : ''}</div></div>
          </td>
          <td data-label="Details"><div class="rep-details" title="${escapeHtml(r.details || '')}">${escapeHtml(r.details || '—')}</div></td>
          <td data-label="Status">${_repStatusBadge(r.status)}</td>
          <td data-label="Actions" class="rc-actions">
            <div class="rep-actions">
              <button class="btn-outline-sm" onclick="reportView('${r.id}')"><i class="fas fa-eye"></i> View</button>
              ${statusBtns}
              ${deleteBtn}
              <div class="rk"><button class="rk-btn" onclick="toggleRegMenu(event,this)"><i class="fas fa-ellipsis-vertical"></i></button>
                <div class="rk-menu"><button class="rk-item" onclick="reportView('${r.id}');closeRegMenus()"><i class="fas fa-eye"></i> View content</button>${suspendItem}</div>
              </div>
            </div>
          </td>
        </tr>`;
    }).join('');

    const from = start + 1, to = Math.min(start + _reportsPerPage, total);
    let pg = '';
    for (let p = 1; p <= pages; p++) pg += `<button class="pg ${p === _reportsPage ? 'active' : ''}" onclick="gotoReportsPage(${p})">${p}</button>`;
    const foot = `
      <div class="rtbl-foot">
        <div class="rtbl-count">Showing ${from}–${to} of ${total} report${total === 1 ? '' : 's'}</div>
        <div class="rep-foot-right">
          <div class="pager">
            <button class="pg pg-arrow" ${_reportsPage <= 1 ? 'disabled' : ''} onclick="gotoReportsPage(${_reportsPage - 1})"><i class="fas fa-chevron-left"></i></button>
            ${pg}
            <button class="pg pg-arrow" ${_reportsPage >= pages ? 'disabled' : ''} onclick="gotoReportsPage(${_reportsPage + 1})"><i class="fas fa-chevron-right"></i></button>
          </div>
          <select class="flt-ctl rep-perpage" onchange="setReportsPerPage(this.value)">
            ${[10, 25, 50].map(n => `<option value="${n}"${n === _reportsPerPage ? ' selected' : ''}>${n} per page</option>`).join('')}
          </select>
        </div>
      </div>`;

    box.innerHTML = head + `
      <div class="rtbl-scroll"><table class="rtbl rep-tbl">
        <thead><tr><th>When</th><th>Type</th><th>Reason</th><th>Reported User</th><th>Details</th><th>Status</th><th class="rc-actions">Actions</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>` + foot;
}

async function reportSetStatus(id, status) {
    try {
        const res = await _sbAdmin.functions.invoke('admin-reports', { body: { adminPassword: _currentPassword, action: 'setStatus', id, status } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        const r = _reportsCache.find(x => String(x.id) === String(id));
        if (r) { r.status = status; r.reviewed_at = new Date().toISOString(); }
        renderReportsSummary(); renderReports();
    } catch (e) { showAdminAlert('Could not update', e.message || String(e), 'error'); }
}

// Predefined removal explanations the admin picks from before finalizing a
// takedown. The chosen message is sent verbatim to the affected user (with
// {type} filled in), so they always learn WHY their content was removed —
// without the admin retyping it each time. Keep these clear and neutral.
const CONTENT_REMOVAL_REASONS = [
    { id: 'guidelines', label: 'Violated Community Guidelines', msg: 'Your {type} was removed by realmate admin because it violated our Community Guidelines.' },
    { id: 'spam', label: 'Spam or misleading', msg: 'Your {type} was removed by realmate admin because it was spam or misleading content.' },
    { id: 'harassment', label: 'Harassment or hateful content', msg: 'Your {type} was removed by realmate admin because it contained harassment, bullying, or hateful content.' },
    { id: 'inappropriate', label: 'Inappropriate or explicit', msg: 'Your {type} was removed by realmate admin because it contained inappropriate or explicit content.' },
    { id: 'misinformation', label: 'False or misleading information', msg: 'Your {type} was removed by realmate admin because it contained false or misleading information.' },
    { id: 'scam', label: 'Fraud or scam', msg: 'Your {type} was removed by realmate admin because it appeared to be fraudulent or a scam.' },
    { id: 'ip', label: 'Intellectual property / copyright', msg: 'Your {type} was removed by realmate admin due to an intellectual property or copyright concern.' },
    { id: 'terms', label: 'Other violation of Terms', msg: 'Your {type} was removed by realmate admin for violating realmate’s Terms of Use.' },
];

async function reportDeleteContent(id) {
    const r = _reportsCache.find(x => String(x.id) === String(id));
    const typeLabel = (r && r.content_type) === 'listing' ? 'listing'
        : (r && r.content_type) === 'comment' ? 'comment' : 'post';

    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    const opts = CONTENT_REMOVAL_REASONS
        .map(o => `<option value="${o.id}">${escapeHtml(o.label)}</option>`).join('');
    el.innerHTML = `<div class="rm-modal-box rm-modal-box-sm">
        <div class="rm-modal-head"><span>Delete reported ${escapeHtml(typeLabel)}?</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
        <div class="rm-modal-body">
          <p class="reg-confirm-message">This permanently removes the reported ${escapeHtml(typeLabel)} from realmate. This cannot be undone. Choose the explanation the user will receive:</p>
          <label class="reg-field-label" for="rmDelReason" style="display:block;margin:10px 0 6px;font-weight:600;">Reason sent to the user</label>
          <select id="rmDelReason" class="flt-ctl" style="width:100%;">${opts}</select>
          <div id="rmDelPreview" class="reg-reason-note" style="max-width:none;margin-top:10px;"></div>
          <label class="reg-field-label" for="rmDelCustom" style="display:block;margin:14px 0 6px;font-weight:600;">Add a custom message <span style="font-weight:400;color:var(--rm-muted);">(optional)</span></label>
          <textarea id="rmDelCustom" class="flt-ctl" rows="3" maxlength="600" placeholder="Add a personal note to the user about this removal…" style="width:100%;resize:vertical;font-family:inherit;"></textarea>
        </div>
        <div class="rm-modal-foot"><button class="btn-cancel-sm" onclick="this.closest('.rm-modal-overlay').remove()">Cancel</button><button class="btn-save reg-confirm-reject" id="rmDelYes"><i class="fas fa-trash"></i> Delete & notify</button></div>
      </div>`;
    document.body.appendChild(el);

    const sel = el.querySelector('#rmDelReason');
    const prev = el.querySelector('#rmDelPreview');
    const resolveMsg = () => {
        const o = CONTENT_REMOVAL_REASONS.find(x => x.id === sel.value) || CONTENT_REMOVAL_REASONS[0];
        return o.msg.replace('{type}', typeLabel);
    };
    const refreshPreview = () => { prev.textContent = resolveMsg(); };
    sel.onchange = refreshPreview;
    refreshPreview();

    el.querySelector('#rmDelYes').onclick = async () => {
        const reason = sel.value;
        const explanation = resolveMsg();
        const customMessage = (el.querySelector('#rmDelCustom').value || '').trim();
        el.remove();
        try {
            const res = await _sbAdmin.functions.invoke('admin-reports', { body: { adminPassword: _currentPassword, action: 'deleteContent', id, reason, explanation, customMessage } });
            if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
            if (r) { r.status = 'actioned'; r.reviewed_at = new Date().toISOString(); }
            renderReportsSummary(); renderReports();
            const note = res.data.removed
                ? (res.data.notified ? 'The content was removed and the user was notified with your explanation.' : 'The content was removed (the user could not be notified automatically).')
                : 'Report marked actioned (content already gone).';
            showAdminAlert('Content deleted', note);
        } catch (e) { showAdminAlert('Could not delete', e.message || String(e), 'error'); }
    };
}

async function reportView(id) {
    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    el.innerHTML = `<div class="rm-modal-box"><div class="rm-modal-head"><span>Reported Content</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div><div class="rm-modal-body" id="repViewBody"><div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div></div></div>`;
    document.body.appendChild(el);
    let res;
    try { res = await _sbAdmin.functions.invoke('admin-reports', { body: { adminPassword: _currentPassword, action: 'viewContent', id } }); }
    catch (e) { el.querySelector('#repViewBody').innerHTML = `<div class="empty-row">${escapeHtml(e.message || String(e))}</div>`; return; }
    const body = el.querySelector('#repViewBody');
    if (res.error || !res.data?.ok) { body.innerHTML = `<div class="empty-row">${escapeHtml(res.data?.error || res.error?.message || 'Unavailable')}</div>`; return; }
    const rep = res.data.report || {}, c = res.data.content;
    const meta = `<div class="rep-view-meta">${_repTypeBadge(rep.content_type)} ${_repReasonBadge(rep.reason)} ${_repStatusBadge(rep.status)}</div>
      <div class="reg-meta" style="margin-bottom:10px;">Reported ${rep.created_at ? escapeHtml(new Date(rep.created_at).toLocaleString()) : '—'}${rep.reported_user_name ? ' · about <b>' + escapeHtml(rep.reported_user_name) + '</b>' : ''}</div>
      ${rep.details ? `<div class="reg-reason-note" style="max-width:none;">${escapeHtml(rep.details)}</div>` : ''}`;
    let contentHtml;
    if (!res.data.exists) {
        contentHtml = `<div class="empty-row"><i class="fas fa-ghost"></i> The reported ${escapeHtml(rep.content_type || 'content')} no longer exists (already deleted).</div>`;
    } else {
        const text = c.content || c.text || c.body || c.message || '';
        const imgs = (Array.isArray(c.image_urls) ? c.image_urls : (c.image_url ? [c.image_url] : (c.cover_image_url ? [c.cover_image_url] : [])));
        const author = c.user_name || c.seller || c.full_name || '';
        contentHtml = `<div class="rep-content-card">
          ${author ? `<div class="rep-content-author"><i class="fas fa-user"></i> ${escapeHtml(author)}</div>` : ''}
          ${text ? `<div class="rep-content-text">${escapeHtml(text)}</div>` : '<div class="sc-muted">(no text)</div>'}
          ${imgs.length ? `<div class="rep-content-imgs">${imgs.slice(0, 6).map(u => `<img src="${escapeHtml(u)}" alt="" onerror="this.style.display='none'">`).join('')}</div>` : ''}
        </div>`;
    }
    const actId = escapeHtml(String(rep.id));
    const canDelete = ['post', 'comment', 'listing'].includes(rep.content_type) && res.data.exists;
    body.innerHTML = meta + contentHtml + `
      <div class="rep-view-actions">
        ${['reviewed', 'actioned'].includes(rep.status) ? '' : `<button class="btn-sm-green" onclick="reportSetStatus('${actId}','reviewed');this.closest('.rm-modal-overlay').remove();"><i class="fas fa-check"></i> Mark Reviewed</button>`}
        <button class="btn-outline-sm" onclick="reportSetStatus('${actId}','dismissed');this.closest('.rm-modal-overlay').remove();"><i class="fas fa-xmark"></i> Dismiss</button>
        ${canDelete ? `<button class="btn-outline-sm rc-danger" onclick="this.closest('.rm-modal-overlay').remove();reportDeleteContent('${actId}');"><i class="fas fa-trash"></i> Delete content</button>` : ''}
        ${rep.reported_user_id ? `<button class="btn-outline-sm rc-danger" onclick="this.closest('.rm-modal-overlay').remove();openBanModal('${escapeHtml(String(rep.reported_user_id))}');"><i class="fas fa-ban"></i> Suspend user</button>` : ''}
      </div>`;
}

function _confirmModal(title, msg, yesLabel, onYes) {
    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    el.innerHTML = `<div class="rm-modal-box rm-modal-box-sm">
      <div class="rm-modal-head"><span>${escapeHtml(title)}</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
      <div class="rm-modal-body"><p class="reg-confirm-message">${escapeHtml(msg)}</p></div>
      <div class="rm-modal-foot"><button class="btn-cancel-sm" onclick="this.closest('.rm-modal-overlay').remove()">Cancel</button><button class="btn-save reg-confirm-reject" id="cmYes"><i class="fas fa-trash"></i> ${escapeHtml(yesLabel)}</button></div>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#cmYes').onclick = () => { el.remove(); onYes(); };
}
async function loadAnalytics() {
    const table = document.getElementById('analyticsTable');
    const meta = document.getElementById('analyticsMeta');
    if (!table) return;
    table.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    if (meta) meta.textContent = '';

    let res;
    try {
        res = await _sbAdmin.functions.invoke('admin-analytics', {
            body: { adminPassword: _currentPassword, action: 'summary' }
        });
    } catch (e) {
        table.innerHTML = `<div class="empty-row">Could not reach analytics. Ensure the <code>admin-analytics</code> Edge Function is deployed.<br><small>${escapeHtml(e.message || String(e))}</small></div>`;
        return;
    }
    if (res.error || !res.data || !res.data.ok) {
        const msg = res.error?.message || res.data?.error || 'Unknown error';
        let hint = '';
        if (/relation|does not exist|app_events/i.test(String(msg))) hint = ' — run analytics-migration.sql first.';
        else if (/send a request|Edge Function|not found|Failed to fetch|non-2xx/i.test(String(msg))) hint = ' — ensure the admin-analytics Edge Function is deployed.';
        table.innerHTML = `<div class="empty-row">Analytics unavailable: ${escapeHtml(msg)}${hint}</div>`;
        return;
    }

    const d = res.data.data;
    _analyticsDefs = d.definitions || {};
    renderAnalyticsSummary(d);
    // "stock" metrics (Registered/Deactivated/Deleted): Today = running total,
    // 7d/30d = new-in-window growth. "flow" metrics: window counts everywhere.
    const ru = d.registeredUsers  || { total: 0, new: {} };
    const de = d.deactivatedUsers || { total: 0, new: {} };
    const dl = d.deletedUsers     || { total: 0, new: {} };
    const P = ['today', 'sevenDays', 'thirtyDays'];

    // key = drill-down metric name; drill = has a user list; info = show the
    // Active basis inline. Each cell carries its own period so a click drills
    // into exactly what that number counts.
    const rows = [
        { key: 'registered', label: 'Registered Users', drill: true, ic: 'fa-users', tone: 'blue', desc: 'Total number of users who signed up.',
          cells: [_nfmt(ru.total), _plus(ru.new?.sevenDays), _plus(ru.new?.thirtyDays)] },
        { key: 'active', label: 'Active Users', drill: true, info: true, ic: 'fa-circle', tone: 'green', desc: 'Users who opened the app at least once during the period.',
          cells: [_nfmt(d.activeUsers?.today), _nfmt(d.activeUsers?.sevenDays), _nfmt(d.activeUsers?.thirtyDays)] },
        { key: 'newRegistrations', label: 'New Registrations', drill: true, ic: 'fa-user-plus', tone: 'blue', desc: 'New user sign-ups during the period.',
          cells: [_nfmt(d.newRegistrations?.today), _nfmt(d.newRegistrations?.sevenDays), _nfmt(d.newRegistrations?.thirtyDays)] },
        { key: 'deactivated', label: 'Deactivated Users', drill: true, ic: 'fa-user-xmark', tone: 'red', desc: 'Users who deactivated their account.',
          cells: [_nfmt(de.total), _plus(de.new?.sevenDays), _plus(de.new?.thirtyDays)] },
        { key: 'deleted', label: 'Deleted Users', drill: true, ic: 'fa-trash-can', tone: 'red', desc: 'Users permanently deleted from the system.',
          cells: [_nfmt(dl.total), _plus(dl.new?.sevenDays), _plus(dl.new?.thirtyDays)] },
        { key: 'listings', label: 'Listings', drill: false, ic: 'fa-building', tone: 'amber', desc: 'Total property listings created.',
          cells: [_nfmt(d.listings?.today), _nfmt(d.listings?.sevenDays), _nfmt(d.listings?.thirtyDays)] },
        { key: 'matches', label: 'Matches', drill: false, ic: 'fa-link', tone: 'purple', desc: 'Successful AI matches between users.',
          cells: [_nfmt(d.matches?.today), _nfmt(d.matches?.sevenDays), _nfmt(d.matches?.thirtyDays)] },
    ];

    const P_LBL = ['Today', '7 Days', '30 Days'];
    const renderCell = (row, i) => {
        const v = escapeHtml(String(row.cells[i]));
        if (!row.drill) return `<td class="num" data-label="${P_LBL[i]}"><span class="an-pill">${v}</span></td>`;
        return `<td class="num" data-label="${P_LBL[i]}"><button type="button" class="an-cell" onclick="openAnalyticsUsers('${row.key}','${P[i]}')" title="See these users">${v}</button></td>`;
    };
    const renderLabel = (row) => {
        const info = row.info
            ? ` <i class="fas fa-circle-info an-info" title="${escapeHtml(_analyticsDefs.active || '')}"></i>`
            : '';
        return `<td class="metric-cell" data-label="Metric">
            <div class="an-metric">
              <span class="an-metric-ic an-mi-${row.tone || 'blue'}"><i class="fas ${row.ic}"></i></span>
              <span class="an-metric-text"><span class="an-metric-name">${escapeHtml(row.label)}${info}</span><span class="an-metric-desc">${escapeHtml(row.desc || '')}</span></span>
            </div>
          </td>`;
    };

    table.innerHTML = `
      <table class="analytics-table">
        <thead>
          <tr><th>Metric</th><th class="num">Today</th><th class="num">7 Days</th><th class="num">30 Days</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>${renderLabel(r)}${[0, 1, 2].map(i => renderCell(r, i)).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    if (meta) {
        const gen = d.generated_at ? new Date(d.generated_at).toLocaleString() : '';
        meta.innerHTML = `
          <div><i class="fas fa-clock"></i> Updated ${escapeHtml(gen)} · Timezone ${escapeHtml(d.timezone || 'Asia/Manila')}. Registered / Deactivated / Deleted show the current total (Today) with new records for each period; other rows count activity within the period. Tap any underlined number to see exactly which users it counts.</div>
          <div class="an-active-def"><i class="fas fa-bolt"></i> <span><strong>What counts as “Active”:</strong> ${escapeHtml(_analyticsDefs.active || 'Opened the app at least once in the period.')}</span></div>`;
    }
}

// Tiny inline area sparkline (real 30-day series). Decorative-scale, honest data.
function _sparkline(values, color, w, h) {
    w = w || 120; h = h || 44;
    const v = (values && values.length) ? values : [0, 0];
    const max = Math.max(...v, 1), min = Math.min(...v, 0), range = (max - min) || 1;
    const n = v.length;
    const pts = v.map((val, i) => {
        const x = n > 1 ? (i / (n - 1)) * w : 0;
        const y = h - ((val - min) / range) * (h - 6) - 3;
        return [x, y];
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = `M0 ${h} ` + pts.map(p => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ` L${w} ${h} Z`;
    const gid = 'sg' + Math.random().toString(36).slice(2, 8);
    return `<svg class="an-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

// Summary cards: big Total Users hero + 4 metric cards, with real trends
// (current 30-day window vs the prior 30 days) and 30-day sparklines.
function renderAnalyticsSummary(d) {
    const box = document.getElementById('analyticsSummary');
    if (!box) return;
    const s = d.series || {}, prev = d.prev30 || {};
    const ru = d.registeredUsers || { total: 0, new: {} };
    const total = ru.total || 0, new30 = ru.new?.thirtyDays || 0;
    const listTotal = d.listingsTotal || 0, list30 = d.listings?.thirtyDays || 0;
    const active30 = d.activeUsers?.thirtyDays || 0;
    const deactTotal = d.deactivatedUsers?.total || 0, deact30 = d.deactivatedUsers?.new?.thirtyDays || 0;
    const newReg30 = d.newRegistrations?.thirtyDays || 0;

    const growth = (added, tot) => { const base = tot - added; return base > 0 ? Math.round(added / base * 100) : (added > 0 ? 100 : 0); };
    const change = (cur, p) => (p > 0 ? Math.round((cur - p) / p * 100) : (cur > 0 ? 100 : 0));
    const trend = (pct) => {
        const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
        const arr = pct > 0 ? 'fa-arrow-up' : pct < 0 ? 'fa-arrow-down' : 'fa-minus';
        return `<span class="an-tr ${dir}"><i class="fas ${arr}"></i> ${(pct > 0 ? '+' : '') + pct}%</span> <span class="an-tr-sub">vs last 30 days</span>`;
    };

    const wStart = d.windows?.thirtyDays ? new Date(d.windows.thirtyDays) : null;
    const wEnd = d.generated_at ? new Date(d.generated_at) : new Date();
    const fmtD = (x) => x ? x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const datePill = `<div class="an-datepill"><i class="fas fa-calendar-days"></i><div><div class="an-dp-range">${fmtD(wStart)} – ${fmtD(wEnd)}</div><div class="an-dp-tz">${escapeHtml(d.timezone || 'Asia/Manila')}</div></div></div>`;

    const hero = `
      <div class="an-hero an-clickable" role="button" tabindex="0" onclick="openAnalyticsChart('totalUsers','Total Users','#2563eb')">
        <span class="an-expand"><i class="fas fa-chart-line"></i></span>
        <div class="stat-ic blue an-hero-ic"><i class="fas fa-users"></i></div>
        <div class="an-hero-label">Total Users</div>
        <div class="an-hero-num">${_nfmt(total)}</div>
        <div class="an-hero-trend">${trend(growth(new30, total))}</div>
        <div class="an-hero-spark">${_sparkline(s.totalUsers, '#2563eb', 520, 96)}</div>
      </div>`;

    const mini = (tint, icClass, icon, label, num, pct, series, color, metric) => `
      <div class="an-mini tint-${tint} an-clickable" role="button" tabindex="0" onclick="openAnalyticsChart('${metric}','${label}','${color}')">
        <span class="an-expand"><i class="fas fa-chart-line"></i></span>
        <div class="stat-ic ${icClass}"><i class="fas ${icon}"></i></div>
        <div class="an-mini-text">
          <div class="an-mini-label">${label}</div>
          <div class="an-mini-num">${_nfmt(num)}</div>
          <div class="an-mini-trend">${trend(pct)}</div>
        </div>
        <div class="an-mini-spark">${_sparkline(series, color, 120, 46)}</div>
      </div>`;

    box.innerHTML = `
      <div class="an-daterow">${datePill}</div>
      <div class="an-summary">
        ${hero}
        <div class="an-mini-grid">
          ${mini('green', 'green', 'fa-user-plus', 'New Registrations', newReg30, change(newReg30, prev.newRegistrations || 0), s.newRegistrations, '#16a34a', 'newRegistrations')}
          ${mini('purple', 'purple', 'fa-user-check', 'Active Users', active30, change(active30, prev.activeUsers || 0), s.activeUsers, '#7c3aed', 'activeUsers')}
          ${mini('red', 'red', 'fa-user-xmark', 'Deactivated Users', deactTotal, change(deact30, prev.deactivatedUsers || 0), s.deactivatedUsers, '#dc2626', 'deactivatedUsers')}
          ${mini('amber', 'amber', 'fa-file-lines', 'Total Listings', listTotal, growth(list30, listTotal), s.listings, '#d97706', 'listings')}
        </div>
      </div>`;
}

// Larger monthly area/line chart (real data) for the card drill-down modal.
function _bigChart(points, color, mode) {
    if (!points || points.length < 2) return `<div class="empty-row"><i class="fas fa-chart-line"></i> Not enough history to chart yet.</div>`;
    const W = 660, H = 260, padL = 52, padR = 14, padT = 14, padB = 34;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxV = Math.max(...points.map(p => p.value), 1);
    const n = points.length;
    const x = (i) => padL + (n > 1 ? (i / (n - 1)) * iw : 0);
    const y = (v) => padT + ih - (v / maxV) * ih;
    const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
    const area = `M${padL} ${padT + ih} ` + points.map((p, i) => 'L' + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ') + ` L${padL + iw} ${padT + ih} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
        const v = maxV * f, yy = y(v);
        return `<line class="bc-grid" x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + iw}" y2="${yy.toFixed(1)}"/><text class="bc-ylbl" x="${padL - 8}" y="${(yy + 4).toFixed(1)}">${_nfmt(Math.round(v))}</text>`;
    }).join('');
    const step = Math.max(1, Math.ceil(n / 7));
    const xl = points.map((p, i) => {
        if (!(i % step === 0 || i === n - 1)) return '';
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        return `<text class="bc-xlbl" style="text-anchor:${anchor}" x="${x(i).toFixed(1)}" y="${H - 12}">${escapeHtml(p.label)}</text>`;
    }).join('');
    const dots = n <= 24 ? points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#fff" stroke="${color}" stroke-width="2"/>`).join('') : '';
    const gid = 'bc' + Math.random().toString(36).slice(2, 7);
    return `<svg class="bc" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.24"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${xl}
    </svg>`;
}

const _AN_GRANS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];
function openAnalyticsChart(metric, label, color) {
    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.dataset.metric = metric; el.dataset.color = color;
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    const toggle = _AN_GRANS.map(([g, t]) => `<button type="button" class="bc-gran-btn ${g === 'monthly' ? 'active' : ''}" onclick="chartSetGran(this,'${g}')">${t}</button>`).join('');
    el.innerHTML = `
      <div class="rm-modal-box bc-modal">
        <div class="rm-modal-head"><span><i class="fas fa-chart-line" style="color:${color};margin-right:8px;"></i>${escapeHtml(label)}</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
        <div class="rm-modal-body">
          <div class="bc-toolbar"><div class="bc-gran">${toggle}</div></div>
          <div class="bc-sub" id="bcSub">Since launch</div>
          <div id="bcChart"><div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    _renderChartInto(el, 'monthly');
}

function chartSetGran(btn, gran) {
    const overlay = btn.closest('.rm-modal-overlay');
    overlay.querySelectorAll('.bc-gran-btn').forEach(b => b.classList.toggle('active', b === btn));
    _renderChartInto(overlay, gran);
}

async function _renderChartInto(overlay, gran) {
    const metric = overlay.dataset.metric, color = overlay.dataset.color;
    const chart = overlay.querySelector('#bcChart'), sub = overlay.querySelector('#bcSub');
    chart.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    let res;
    try {
        res = await _sbAdmin.functions.invoke('admin-analytics', { body: { adminPassword: _currentPassword, action: 'chart', metric, granularity: gran } });
    } catch (e) {
        chart.innerHTML = `<div class="empty-row">Could not load chart.<br><small>${escapeHtml(e.message || String(e))}</small></div>`; return;
    }
    if (res.error || !res.data || !res.data.ok) {
        chart.innerHTML = `<div class="empty-row">${escapeHtml(res.data?.error || res.error?.message || 'Unavailable')}</div>`; return;
    }
    const pts = res.data.points || [];
    const per = { daily: 'per day', weekly: 'per week', monthly: 'per month', yearly: 'per year' }[gran] || 'per period';
    const kind = res.data.mode === 'cumulative' ? 'running total' : per;
    if (pts.length === 1) {
        chart.innerHTML = `<div class="bc-single"><div class="bc-single-num">${_nfmt(pts[0].value)}</div><div class="bc-single-lbl">${escapeHtml(pts[0].label)}</div><div class="empty-row" style="padding-top:8px;">Only one ${gran.replace('ly', '')} of data so far — switch granularity for more detail.</div></div>`;
    } else {
        chart.innerHTML = _bigChart(pts, color, res.data.mode);
    }
    if (sub) sub.textContent = pts.length ? `${pts[0].label} – ${pts[pts.length - 1].label} · ${kind} · latest ${_nfmt(pts[pts.length - 1].value)}` : 'No data yet.';
}

// ── Analytics drill-down: the actual users behind a metric+period cell ───────
let _analyticsDefs = {};
const _AN_LABELS = { registered: 'Registered Users', active: 'Active Users', newRegistrations: 'New Registrations', deactivated: 'Deactivated Users', deleted: 'Deleted Users' };
const _AN_PERIODS = { today: 'Today', sevenDays: 'Last 7 days', thirtyDays: 'Last 30 days' };

async function openAnalyticsUsers(metric, period) {
    const overlay = document.getElementById('analyticsUsersOverlay');
    const titleEl = document.getElementById('auTitle');
    const body = document.getElementById('auBody');
    if (!overlay) return;
    titleEl.textContent = `${_AN_LABELS[metric] || 'Users'} · ${_AN_PERIODS[period] || period}`;
    body.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    overlay.style.display = 'flex';

    let res;
    try {
        res = await _sbAdmin.functions.invoke('admin-analytics', {
            body: { adminPassword: _currentPassword, action: 'users', metric, period }
        });
    } catch (e) {
        body.innerHTML = `<div class="empty-row">Could not load users.<br><small>${escapeHtml(e.message || String(e))}</small></div>`;
        return;
    }
    if (res.error || !res.data || !res.data.ok) {
        body.innerHTML = `<div class="empty-row">${escapeHtml(res.data?.error || res.error?.message || 'Unavailable')}</div>`;
        return;
    }
    const data = res.data;
    const def = data.definition ? `<div class="au-def"><i class="fas fa-circle-info"></i> <span>${escapeHtml(data.definition)}</span></div>` : '';
    const countLine = `<div class="au-count">${_nfmt(data.count)} ${data.count === 1 ? 'user' : 'users'}</div>`;
    if (!data.users || !data.users.length) {
        body.innerHTML = def + countLine + `<div class="empty-row">No users for this metric in this period.</div>`;
        return;
    }
    const fallbackAv = (u) => `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || u.username || '?')}&background=0f172a&color=32cd32`;
    const list = data.users.map(u => {
        const av = u.avatar_url || fallbackAv(u);
        const ts = u.ts ? new Date(u.ts).toLocaleString() : '—';
        const note = u.note_ts
            ? `<div class="reg-meta"><i class="fas fa-rotate-left" style="color:#16a34a;"></i> ${escapeHtml(u.note_label || '')} ${escapeHtml(new Date(u.note_ts).toLocaleString())}</div>`
            : (u.note ? `<div class="reg-meta"><i class="fas fa-circle-info"></i> ${escapeHtml(u.note)}</div>` : '');
        return `
        <div class="reg-row">
          <div class="reg-row-top">
            <img class="user-avatar" src="${av}" alt="" onerror="this.src='${fallbackAv(u)}'">
            <div class="reg-row-main">
              <div class="reg-name">${escapeHtml(u.full_name || '(no name on file)')}</div>
              <div class="reg-meta">@${escapeHtml(u.username || '—')} · ${escapeHtml(u.email || '—')}</div>
              <div class="reg-meta"><i class="fas fa-clock"></i> ${escapeHtml(u.ts_label || '')} ${escapeHtml(ts)}</div>
              ${note}
            </div>
          </div>
        </div>`;
    }).join('');
    body.innerHTML = def + countLine + `<div class="au-list">${list}</div>`;
}

function closeAnalyticsUsers() {
    const overlay = document.getElementById('analyticsUsersOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ══════════════════════════════════════════════════════
//  NEXUS TAB  (realmate's behavioral intelligence engine)
//  Reads processed intelligence from Supabase via the intel-admin Edge
//  Function (service role). Purely observational — Supabase remains the
//  source of stored data; nothing is duplicated into the admin panel.
// ══════════════════════════════════════════════════════
function _intelEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function _intelBadge(on) {
    return on
        ? '<span class="intel-badge intel-on">ON</span>'
        : '<span class="intel-badge intel-off">OFF</span>';
}

// Which Nexus data environment the panel is viewing (production default).
let _nexusEnv = (window.NEXUS_DEFAULT_ENV || 'production');
let _nexusTestingClient = null;

// Returns the Supabase client for the selected environment, or null if the
// testing project hasn't been configured in nexus-env.js yet. Production uses
// the existing _sbAdmin client — the rest of the admin panel is untouched.
function _nexusClient() {
    if (_nexusEnv === 'production') return _sbAdmin;
    if (!window.nexusEnvConfigured || !window.nexusEnvConfigured('testing')) return null;
    const cfg = (window.NEXUS_ENVIRONMENTS || {}).testing;
    if (!_nexusTestingClient) _nexusTestingClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    return _nexusTestingClient;
}

function setNexusEnv(env) {
    _nexusEnv = (env === 'testing') ? 'testing' : 'production';
    loadIntelligence();
}

// Which dataset the panel is viewing: 'synthetic' benchmark | 'realuser'.
let _nexusDataset = 'synthetic';
function setNexusDataset(ds) {
    _nexusDataset = (ds === 'realuser') ? 'realuser' : 'synthetic';
    loadIntelligence();
}

// Render a simple "label — count" ranked list, or an empty-state note.
function _intelList(items, emptyMsg) {
    if (!items || !items.length) return `<div class="intel-empty">${_intelEsc(emptyMsg || 'No data yet.')}</div>`;
    const max = Math.max(...items.map(i => i.count || 0), 1);
    return '<div class="intel-bars">' + items.map(i => `
        <div class="intel-bar-row">
          <span class="intel-bar-label">${_intelEsc(i.label)}</span>
          <span class="intel-bar-track"><span class="intel-bar-fill" style="width:${Math.round((i.count || 0) / max * 100)}%"></span></span>
          <span class="intel-bar-count">${_intelEsc(i.count)}</span>
        </div>`).join('') + '</div>';
}

// ── Nexus presentation layer (reference redesign) ────────────────────────────
// Show/hide the founder "Benchmark Details" (engine controls + raw tables).
function toggleBenchmarkDetails() {
    const box = document.getElementById('nxDetails');
    const lbl = document.getElementById('nxBmBtnLabel');
    if (!box) return;
    const open = box.style.display === 'none' || !box.style.display;
    box.style.display = open ? 'block' : 'none';
    if (lbl) lbl.textContent = open ? 'Hide advanced controls' : 'Show advanced controls';
    if (open) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Engine KPIs built from REAL data (intel-admin `metrics`): request volume + avg
// processing time from behavioral_events, success/error rate from training_runs.
// A null metric renders "—" and the trend line degrades to "no prior data".
function _nxFmtMs(ms) {
    if (ms == null) return '—';
    return ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(1) + 's';
}
function _nxPct(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    return Math.round((cur - prev) / prev * 100);
}
function _nxTrend(pct, lowerIsBetter) {
    if (pct == null) return '<span class="nx-sub">no prior data</span>';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const good = pct === 0 ? true : (lowerIsBetter ? pct < 0 : pct > 0);
    return `<span class="${good ? 'nx-good' : 'nx-bad'}">${arrow} ${Math.abs(pct)}%</span> <span class="nx-sub">vs. prior period</span>`;
}
function _nxKpiCards(m) {
    const rateV = (r) => r == null ? '—' : (r * 100).toFixed(1) + '%';
    const cards = [
        { ic: 'fa-clock', label: 'Response Time', v: _nxFmtMs(m.avg_duration_ms),
          trend: _nxTrend(_nxPct(m.avg_duration_ms, m.avg_duration_ms_prev), true) },
        { ic: 'fa-file-lines', label: 'Requests Today', v: (m.requests_today == null ? '—' : Number(m.requests_today).toLocaleString()),
          trend: _nxTrend(_nxPct(m.requests_today, m.requests_prev), false) },
        { ic: 'fa-circle-check', label: 'Success Rate', v: rateV(m.success_rate),
          trend: _nxTrend(_nxPct(m.success_rate, m.success_rate_prev), false) },
        { ic: 'fa-triangle-exclamation', label: 'Error Rate', v: rateV(m.error_rate),
          trend: _nxTrend(_nxPct(m.error_rate, m.error_rate_prev), true) },
    ];
    return cards.map(k => `
      <div class="nx-kpi">
        <div class="nx-kpi-head"><i class="fas ${k.ic}"></i> ${k.label}</div>
        <div class="nx-kpi-v">${k.v}</div>
        <div class="nx-kpi-trend">${k.trend}</div>
      </div>`).join('');
}

function _nxRankBars(rows) {
    if (!rows || !rows.length) return '<div class="intel-empty">No observations yet.</div>';
    const max = Math.max(...rows.map(r => r[1] || 0), 1);
    return rows.slice(0, 6).map((r, i) => `
      <div class="nx-rank">
        <span class="nx-rank-n">${i + 1}</span>
        <span class="nx-rank-label">${_intelEsc(r[0])}</span>
        <span class="nx-rank-track"><span class="nx-rank-fill" style="width:${Math.round((r[1] || 0) / max * 100)}%"></span></span>
        <span class="nx-rank-pct">${_intelEsc(r[1])}%</span>
      </div>`).join('');
}

// Map a trends array [{label,count}] to ranked [label, pct] rows, or a benchmark
// fallback when empty (synthetic only). Percentages are shares of the total.
function _nxTrendRows(items, fallback, useFallback) {
    if (items && items.length) {
        const total = items.reduce((s, x) => s + (x.count || 0), 0) || 1;
        return items.slice(0, 6).map(x => [x.label, Math.round((x.count || 0) / total * 100)]);
    }
    return useFallback ? fallback : [];
}

function _renderNexusPresentation(d, st) {
    const realuser = (_nexusDataset === 'realuser');

    // Environment radio cards
    const prodSel = (_nexusEnv !== 'testing');
    const prodCard = document.getElementById('nxEnvProduction');
    const testCard = document.getElementById('nxEnvTesting');
    if (prodCard) prodCard.classList.toggle('selected', prodSel);
    if (testCard) testCard.classList.toggle('selected', !prodSel);
    const prodTag = document.getElementById('nxEnvProdTag');
    if (prodTag) { prodTag.textContent = prodSel ? 'Current environment' : 'Live data (real users)'; prodTag.classList.toggle('nx-muted', !prodSel); }
    const testTag = testCard && testCard.querySelector('.nx-env-tag');
    if (testTag) { testTag.textContent = !prodSel ? 'Current environment' : 'For development and evaluation'; testTag.classList.toggle('nx-muted', prodSel); }

    // Engine status box — reflects the REAL engine flag, not mere reachability.
    // Live only when INTELLIGENCE_ENGINE_ENABLED is on; otherwise it is in the
    // testing/dormant phase and must NOT read as "live".
    const live = !!st.engine;
    const box = document.getElementById('nxOnlineBox');
    const title = document.getElementById('nxOnlineTitle');
    const sub = document.getElementById('nxOnlineSub');
    if (box) {
        box.classList.toggle('nx-standby', !live);
        if (title) title.textContent = live ? 'Live' : 'Testing Phase';
        if (sub) sub.textContent = live
            ? 'Nexus is live and running normally'
            : (st.anyOn ? 'Nexus is in the testing phase — not live yet' : 'Nexus is dormant — not live yet');
    }

    // Activation control — admin can go live or return to the testing phase.
    // Production activation is still gated by the "Nexus, go live." phrase inside
    // setIntelFlag; this button just surfaces that control on the main view.
    const ctl = document.getElementById('nxEngineControl');
    if (ctl) {
        ctl.innerHTML = live
            ? `<span class="nx-phase-pill nx-phase-live"><span class="nx-phase-dot"></span> Live</span>
               <button class="nx-phase-btn nx-phase-stop" onclick="setIntelFlag('INTELLIGENCE_ENGINE_ENABLED', false)"><i class="fas fa-circle-stop"></i> Return to Testing</button>`
            : `<span class="nx-phase-pill nx-phase-test"><span class="nx-phase-dot"></span> Testing Phase</span>
               <button class="nx-phase-btn nx-phase-go" onclick="setIntelFlag('INTELLIGENCE_ENGINE_ENABLED', true)"><i class="fas fa-rocket"></i> Make Nexus Go Live</button>`;
    }

    // KPIs — pulled from real data (behavioral_events + training_runs) via the
    // intel-admin overview `metrics`. Null values render an honest "—".
    const m = d.metrics || {};
    const kEl = document.getElementById('nxKpis');
    if (kEl) kEl.innerHTML = _nxKpiCards(m);

    // Data volume — REAL counts only. No demo/placeholder values ever.
    const c = d.counts || {};
    const realRecords = (Number(c.behavioral_events) || 0) + (Number(c.match_scores) || 0) + (Number(c.recommendations) || 0);
    const days = 24;
    const totalRecords = realRecords;
    const per = Math.round(realRecords / days);
    const series = new Array(days).fill(per);   // even shape; flat when there is no data
    const maxV = Math.max(...series, 1);
    const hi = series.indexOf(maxV);
    const chartEl = document.getElementById('nxVolChart');
    if (chartEl) {
        chartEl.innerHTML = realRecords
            ? '<div class="nx-bars">' + series.map((v, i) => `<div class="nx-bar${i === hi ? ' nx-bar-hi' : ''}" style="height:${Math.max(3, Math.round(v / maxV * 100))}%"></div>`).join('') + '</div>' +
              `<div class="nx-bars-x"><span>Day 1</span><span>Day ${Math.round(days / 2)}</span><span>Day ${days}</span></div>`
            : '<div class="intel-empty">No data yet — Nexus hasn\'t processed any records. Behavioural collection is off / dormant.</div>';
    }
    const totEl = document.getElementById('nxVolTotal');
    if (totEl) totEl.textContent = Number(totalRecords).toLocaleString();
    const trEl = document.getElementById('nxVolTrend');
    if (trEl) trEl.innerHTML = `<span class="nx-sub">${realRecords ? 'records processed' : 'no data yet'}</span>`;
    const spEl = document.getElementById('nxVolSpark');
    if (spEl) spEl.innerHTML = realRecords ? _sparkline(series, '#2563eb', 220, 44) : '';

    // Date range pill — rolling window ending today.
    const rng = document.getElementById('nxDateRange');
    if (rng) {
        const end = new Date();
        const start = new Date(end.getTime() - (days - 1) * 864e5);
        const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        rng.textContent = `${fmt(start)} – ${fmt(end)}`;
    }

    // Market & preference trends — REAL observations only (no demo fallback).
    const t = d.trends || {};
    const locRows = _nxTrendRows(t.listing_locations || t.searched_locations, null, false);
    const unitRows = _nxTrendRows(t.listing_bedrooms, null, false);
    const prefRows = _nxTrendRows(t.listing_property_types || t.listing_developers, null, false);
    const setBars = (id, rows) => { const el = document.getElementById(id); if (el) el.innerHTML = _nxRankBars(rows); };
    setBars('nxTrendLoc', locRows);
    setBars('nxTrendUnit', unitRows);
    setBars('nxTrendPref', prefRows);
}


async function loadIntelligence() {
    // Unified control plane + FMV (spec §18-§20) — talk to the MAIN project,
    // independent of the legacy testing-env path below (load even if it bails).
    try { loadNexusUnified(); } catch (e) {}
    try { loadNexusMarket(); } catch (e) {}
    try { loadNexusFmv(); } catch (e) {}
    const statusEl = document.getElementById('intelStatus');
    const sel = document.getElementById('nexusEnvSelect'); if (sel) sel.value = _nexusEnv;
    const envBadge = document.getElementById('nexusEnvBadge');

    const client = _nexusClient();
    if (!client) {
        if (envBadge) { envBadge.textContent = 'TESTING — not configured'; envBadge.className = 'intel-badge intel-off'; }
        if (statusEl) statusEl.innerHTML = '<div class="intel-empty">Testing environment not configured yet. Create the separate free testing Supabase project, then paste its URL + anon key into <code>nexus-env.js</code>. Production is unaffected.</div>';
        return;
    }
    if (statusEl) statusEl.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    // Sync the dataset selector UI to current state.
    const dsSel = document.getElementById('nexusDatasetSelect'); if (dsSel) dsSel.value = _nexusDataset;
    const _dsRealuser = (_nexusDataset === 'realuser');
    const _dsLabel = _dsRealuser ? 'REALMATE TEST USERS' : 'SYNTHETIC BENCHMARK';
    const dsBadge = document.getElementById('nexusDatasetBadge');
    if (dsBadge) {
        dsBadge.textContent = _dsLabel;
        dsBadge.className = 'nx-tag' + (_dsRealuser ? ' nx-tag-real' : '');
    }
    // New presentation: benchmark banner + dataset caption reflect the dataset.
    const bmBanner = document.getElementById('nxBenchmarkBanner');
    const bmTitle = document.getElementById('nxBmTitle');
    const bmDesc = document.getElementById('nxBmDesc');
    const dsFoot = document.getElementById('nxDatasetFoot');
    if (bmBanner) bmBanner.classList.toggle('nx-bm-real', _dsRealuser);
    if (bmTitle) bmTitle.textContent = _dsLabel;
    if (bmDesc) bmDesc.textContent = _dsRealuser
        ? 'Real human behaviour from designated, allowlisted test accounts (isolated in nexus-testing).'
        : 'Simulated test scenarios (no real users). Controlled 28/28 benchmark dataset.';
    if (dsFoot) dsFoot.textContent = _dsRealuser
        ? 'Real behaviour from allowlisted realmate test users — separate from the synthetic benchmark.'
        : 'Controlled 28/28 benchmark dataset with diverse real estate scenarios.';
    const dsBanner = document.getElementById('intelDatasetBanner');
    if (dsBanner) {
        dsBanner.style.display = 'block';
        if (_dsRealuser) {
            dsBanner.style.background = '#fef3c7'; dsBanner.style.color = '#92400e'; dsBanner.style.border = '1px solid #f59e0b';
            dsBanner.innerHTML = '<i class="fas fa-user-shield"></i> REALMATE TEST USERS — real human behavioural data from designated, allowlisted test accounts (isolated in nexus-testing).';
        } else {
            dsBanner.style.background = '#f1f5f9'; dsBanner.style.color = '#475569'; dsBanner.style.border = '1px solid #cbd5e1';
            dsBanner.innerHTML = '<i class="fas fa-flask"></i> SYNTHETIC BENCHMARK — simulated test scenarios (no real users). Controlled 28/28 benchmark dataset.';
        }
    }

    let res;
    try {
        res = await client.functions.invoke('intel-admin', {
            body: { adminPassword: _currentPassword, action: 'overview', dataset: _nexusDataset }
        });
    } catch (e) {
        if (statusEl) statusEl.innerHTML = `<div class="intel-empty">Could not reach Nexus. Ensure the <code>intel-admin</code> Edge Function is deployed and the Nexus migration has been run.<br><small>${_intelEsc(e.message || e)}</small></div>`;
        return;
    }
    if (res.error || !res.data || !res.data.ok) {
        const msg = res.error?.message || res.data?.error || 'Unknown error';
        if (statusEl) statusEl.innerHTML = `<div class="intel-empty">Nexus unavailable: ${_intelEsc(msg)}</div>`;
        return;
    }

    const d = res.data.data;
    _renderRealUsers(d);
    const envName = (d.environment || 'production');
    if (envBadge) {
        envBadge.textContent = envName.toUpperCase();
        envBadge.className = 'intel-badge ' + (envName === 'testing' ? 'intel-on' : 'intel-off');
    }
    const flags = d.flags || {};
    const collection = flags.BEHAVIORAL_DATA_COLLECTION_ENABLED === true || flags.BEHAVIORAL_DATA_COLLECTION_ENABLED === 'true';
    const training = flags.MODEL_TRAINING_ENABLED === true || flags.MODEL_TRAINING_ENABLED === 'true';
    const engine = flags.INTELLIGENCE_ENGINE_ENABLED === true || flags.INTELLIGENCE_ENGINE_ENABLED === 'true';
    const anyOn = collection || training || engine;
    const prodModel = (d.models || []).find(m => m.status === 'production');
    const modelVer = prodModel?.version || flags.active_model_version || 'v1 (candidate)';

    // ── Polished presentation (hero KPIs, data volume, market trends) ──
    _renderNexusPresentation(d, { collection, training, engine, anyOn });

    // ── Status + stage controls (inside "Benchmark Details") ──
    if (statusEl) {
        statusEl.innerHTML = `
        <div class="intel-status-grid">
          <div class="intel-stat"><div class="intel-stat-k">Nexus Engine</div><div class="intel-stat-v">${_intelBadge(engine)}</div></div>
          <div class="intel-stat"><div class="intel-stat-k">Data Collection</div><div class="intel-stat-v">${_intelBadge(collection)}</div></div>
          <div class="intel-stat"><div class="intel-stat-k">Model Training</div><div class="intel-stat-v">${_intelBadge(training)}</div></div>
          <div class="intel-stat"><div class="intel-stat-k">Model Version</div><div class="intel-stat-v">${_intelEsc(modelVer)}</div></div>
        </div>
        ${!anyOn ? '<div class="intel-note"><i class="fas fa-moon"></i> Nexus is <strong>dormant</strong> (bug-testing stage). No behavioural data is being collected, analysed, or used. Activate stages below when ready.</div>' : ''}
        <div class="intel-toggles">
          <button class="intel-toggle-btn" onclick="setIntelFlag('BEHAVIORAL_DATA_COLLECTION_ENABLED', ${!collection})">${collection ? 'Disable' : 'Enable'} Data Collection</button>
          <button class="intel-toggle-btn" onclick="setIntelFlag('MODEL_TRAINING_ENABLED', ${!training})">${training ? 'Disable' : 'Enable'} Model Training</button>
          <button class="intel-toggle-btn" onclick="setIntelFlag('INTELLIGENCE_ENGINE_ENABLED', ${!engine})">${engine ? 'Disable' : 'Enable'} Nexus Engine</button>
        </div>`;
    }

    // ── Data volume ──
    const c = d.counts || {};
    const lastRun = d.last_training_run;
    const countCard = (k, v) => `<div class="intel-stat"><div class="intel-stat-k">${_intelEsc(k)}</div><div class="intel-stat-v">${v == null ? '—' : _intelEsc(v)}</div></div>`;
    const countsEl = document.getElementById('intelCounts');
    if (countsEl) countsEl.innerHTML = `<div class="intel-status-grid">
        ${countCard('Behavioural events', c.behavioral_events)}
        ${countCard('User profiles', c.user_behavior_profiles)}
        ${countCard('Listing features', c.listing_features)}
        ${countCard('Verified dev/projects', c.dev_projects)}
        ${countCard('Recommendations', c.recommendations)}
        ${countCard('Match scores', c.match_scores)}
      </div>
      <div class="intel-subnote">Last training run: ${lastRun ? `${_intelEsc(lastRun.status)} · ${_intelEsc(lastRun.events_used || 0)} events · ${_intelEsc((lastRun.finished_at || lastRun.started_at || '').slice(0, 16).replace('T', ' '))}` : 'never'}</div>`;

    // ── Trends ──
    const t = d.trends || {};
    const trendsEl = document.getElementById('intelTrends');
    if (trendsEl) trendsEl.innerHTML = `
      <div class="intel-two-col">
        <div><div class="intel-sub">Listing locations</div>${_intelList(t.listing_locations, 'No listing features yet — run enrich-listings.')}</div>
        <div><div class="intel-sub">Bedroom / unit types</div>${_intelList(t.listing_bedrooms, 'No data yet.')}</div>
        <div><div class="intel-sub">Property types</div>${_intelList(t.listing_property_types, 'No data yet.')}</div>
        <div><div class="intel-sub">Developers in catalog</div>${_intelList(t.listing_developers, 'No data yet.')}</div>
        <div><div class="intel-sub">Projects in catalog</div>${_intelList(t.listing_projects, 'No data yet.')}</div>
        <div><div class="intel-sub">Searched terms (learned)</div>${_intelList(t.searched_locations, collection ? 'No searches captured yet.' : 'Data collection is OFF.')}</div>
      </div>`;

    // ── Developer & project intelligence ──
    const devI = d.developer_intelligence || [];
    const projI = d.project_intelligence || [];
    const entitiesEl = document.getElementById('intelEntities');
    const rowsDev = devI.length ? devI.map(x => `<tr><td>${_intelEsc(x.developer)}</td><td>${_intelEsc(x.views || 0)}</td><td>${_intelEsc(x.saves || 0)}</td><td>${_intelEsc(x.offers || 0)}</td></tr>`).join('') : '';
    const rowsProj = projI.length ? projI.map(x => `<tr><td>${_intelEsc(x.project)}</td><td>${_intelEsc(x.developer || '—')}</td><td>${_intelEsc(x.views || 0)}</td><td>${_intelEsc(x.offers || 0)}</td></tr>`).join('') : '';
    if (entitiesEl) entitiesEl.innerHTML = `
      <div class="intel-two-col">
        <div>
          <div class="intel-sub">Top developers (by engagement)</div>
          ${devI.length ? `<table class="intel-table"><thead><tr><th>Developer</th><th>Views</th><th>Saves</th><th>Offers</th></tr></thead><tbody>${rowsDev}</tbody></table>` : '<div class="intel-empty">No developer engagement learned yet.</div>'}
        </div>
        <div>
          <div class="intel-sub">Top projects (by engagement)</div>
          ${projI.length ? `<table class="intel-table"><thead><tr><th>Project</th><th>Developer</th><th>Views</th><th>Offers</th></tr></thead><tbody>${rowsProj}</tbody></table>` : '<div class="intel-empty">No project engagement learned yet.</div>'}
        </div>
      </div>`;

    // ── Matching & recommendation performance ──
    const perfEl = document.getElementById('intelPerformance');
    if (perfEl) perfEl.innerHTML = `<div class="intel-status-grid">
        ${countCard('Recommendations generated', c.recommendations)}
        ${countCard('Match scores computed', c.match_scores)}
      </div>
      <div class="intel-subnote">Save / contact / offer / transaction conversion rates populate here once recommendation outcomes accumulate (Stage 3+).</div>`;

    // ── Dataset enrichment suggestions ──
    const sugg = d.enrichment_suggestions || [];
    const enrichEl = document.getElementById('intelEnrichment');
    if (enrichEl) {
        if (!sugg.length) {
            enrichEl.innerHTML = '<div class="intel-empty">No enrichment suggestions. The engine surfaces proposed additions/corrections to the verified dataset here for your review — verified facts are never changed automatically.</div>';
        } else {
            enrichEl.innerHTML = sugg.map(s => `
              <div class="intel-suggestion">
                <div class="intel-sugg-head">
                  <span class="intel-sugg-type">${_intelEsc(s.suggestion_type || 'suggestion')}</span>
                  <span class="intel-sugg-conf">confidence ${_intelEsc(Math.round((s.confidence || 0) * 100))}% · ${_intelEsc(s.observations || 0)} obs · ${_intelEsc((s.detected_at || '').slice(0, 10))}</span>
                </div>
                <div class="intel-sugg-body"><strong>${_intelEsc(s.developer || '')} ${_intelEsc(s.project || '')}</strong> — ${_intelEsc(s.reason || '')}</div>
                <div class="intel-sugg-actions">
                  <button class="intel-toggle-btn" onclick="reviewEnrichment(${_intelEsc(s.id)}, 'accepted')">Accept</button>
                  <button class="intel-toggle-btn intel-btn-ghost" onclick="reviewEnrichment(${_intelEsc(s.id)}, 'rejected')">Reject</button>
                </div>
              </div>`).join('');
        }
    }
}

// The sole founder authorization phrase for PRODUCTION Nexus activation.
const NEXUS_GO_LIVE_PHRASE = 'Nexus, go live.';

// In-UI confirmation modal for Nexus stage actions. Native prompt/confirm/alert
// are suppressed inside embedded webviews (why the Enable buttons looked dead),
// so Nexus never uses them. When requirePhrase is set, the confirm button stays
// disabled until the founder types the exact phrase.
function _nexusActionModal(opts) {
    const { title, message, confirmLabel, icon = 'fa-bolt', danger = false, requirePhrase = null, onConfirm } = opts;
    const el = document.createElement('div');
    el.className = 'rm-modal-overlay';
    el.style.display = 'flex';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    const phraseHtml = requirePhrase ? `
        <div class="nx-modal-phrase">
          <label class="field-label">Type <code>${escapeHtml(requirePhrase)}</code> to authorize</label>
          <input type="text" id="nxPhraseInput" class="nx-phrase-input" placeholder="${escapeHtml(requirePhrase)}" autocomplete="off" spellcheck="false">
        </div>` : '';
    el.innerHTML = `<div class="rm-modal-box rm-modal-box-sm">
      <div class="rm-modal-head"><span>${escapeHtml(title)}</span><span class="rm-modal-close" role="button" tabindex="0" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
      <div class="rm-modal-body"><p class="reg-confirm-message">${escapeHtml(message)}</p>${phraseHtml}</div>
      <div class="rm-modal-foot"><button class="btn-cancel-sm" onclick="this.closest('.rm-modal-overlay').remove()">Cancel</button>
        <button class="btn-save ${danger ? 'reg-confirm-reject' : ''}" id="nxYes"><i class="fas ${icon}"></i> ${escapeHtml(confirmLabel)}</button></div>
    </div>`;
    document.body.appendChild(el);
    const yes = el.querySelector('#nxYes');
    const input = el.querySelector('#nxPhraseInput');
    if (requirePhrase) {
        yes.disabled = true;
        input.addEventListener('input', () => { yes.disabled = input.value !== requirePhrase; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value === requirePhrase) yes.click(); });
        setTimeout(() => input.focus(), 60);
    }
    yes.onclick = () => {
        if (requirePhrase && input.value !== requirePhrase) return;
        el.remove();
        onConfirm();
    };
}

async function setIntelFlag(key, value) {
    const client = _nexusClient();
    if (!client) { showAdminAlert('Environment not configured', 'The selected environment is not configured yet.', 'error'); return; }

    const labels = {
        BEHAVIORAL_DATA_COLLECTION_ENABLED: 'Data Collection',
        MODEL_TRAINING_ENABLED: 'Model Training',
        INTELLIGENCE_ENGINE_ENABLED: 'Nexus Engine',
    };
    const label = labels[key] || key;
    const envName = _nexusEnv.toUpperCase();
    const isProdActivation = (_nexusEnv === 'production' && value === true);

    const run = async (confirmationPhrase) => {
        try {
            const res = await client.functions.invoke('intel-admin', {
                body: { adminPassword: _currentPassword, action: 'set-flag', key, value, confirmationPhrase }
            });
            if (res.error || res.data?.error) {
                showAdminAlert('Action failed', (res.error?.message || res.data?.error || 'Unknown error'), 'error', 7000);
                return;
            }
            showAdminAlert(value ? `${label} enabled` : `${label} disabled`,
                `${label} is now ${value ? 'ON' : 'OFF'} in the ${envName} environment.`, 'success');
            loadIntelligence();
        } catch (e) {
            showAdminAlert('Action failed', (e.message || String(e)), 'error', 7000);
        }
    };

    if (isProdActivation) {
        _nexusActionModal({
            title: 'Activate in Production?',
            message: `This ACTIVATES ${label} in PRODUCTION and affects real realmate users. Type the founder phrase below to authorize — a click alone is never enough.`,
            requirePhrase: NEXUS_GO_LIVE_PHRASE,
            confirmLabel: 'Go Live',
            icon: 'fa-rocket',
            onConfirm: () => run(NEXUS_GO_LIVE_PHRASE),
        });
    } else {
        _nexusActionModal({
            title: value ? `Enable ${label}?` : `Disable ${label}?`,
            message: `Turn ${label} ${value ? 'ON' : 'OFF'} in the ${envName} environment?`,
            confirmLabel: value ? `Enable ${label}` : `Disable ${label}`,
            icon: value ? 'fa-toggle-on' : 'fa-toggle-off',
            danger: !value,
            onConfirm: () => run(null),
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Nexus Unified Control Plane + FMV (spec §18-§20). Talks to the MAIN realmate
// project (_sbAdmin): Nexus runs on the main database with an admin Data Mode,
// not a separate project. Independent of the legacy env/dataset controls above.
// ═══════════════════════════════════════════════════════════════════════════
const NEXUS_UNIFIED_FLAG_META = [
    { key: 'NEXUS_ENGINE',        label: 'Nexus Engine',  desc: 'Master switch. OFF = the app + existing Match Engine behave exactly as before.' },
    { key: 'NEXUS_MATCH_RANKING', label: 'Match Ranking', desc: 'Personalize the ORDER of existing match results. Never overrides hard match rules.' },
    { key: 'NEXUS_FMV',           label: 'FMV Engine',    desc: 'Compute Fair Market Value (admin-only; never shown to normal users).' },
    { key: 'NEXUS_ADMIN',         label: 'Admin Intel',   desc: 'Surface Nexus intelligence inside this Admin panel.' },
];
let _nexusDataMode = 'testing';

async function loadNexusUnified() {
    const body = document.getElementById('nexusUnifiedBody');
    if (!body) return;
    try {
        const { data: cfg } = await _sbAdmin.from('intelligence_config')
            .select('key,value').in('key', ['nexus_data_mode', ...NEXUS_UNIFIED_FLAG_META.map(f => f.key)]);
        const flags = {}; (cfg || []).forEach(r => { flags[r.key] = r.value; });
        _nexusDataMode = String(flags.nexus_data_mode ?? 'testing').replace(/^"|"$/g, '');
        const on = (k) => flags[k] === true || flags[k] === 'true';
        const modeProd = _nexusDataMode === 'production';
        const toggles = NEXUS_UNIFIED_FLAG_META.map(f => {
            const isOn = on(f.key);
            return `<div class="intel-stat" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <div><div class="intel-stat-k">${f.label} ${_intelBadge(isOn)}</div>
              <div style="font-size:11px;color:#94a3b8;max-width:340px;">${_intelEsc(f.desc)}</div></div>
              <button class="intel-toggle-btn" onclick="setNexusFlag('${f.key}', ${!isOn})">${isOn ? 'Disable' : 'Enable'}</button>
            </div>`;
        }).join('');
        body.innerHTML = `
          <div class="intel-note" style="margin-bottom:12px;">
            <i class="fas fa-database"></i> <strong>Data Mode:</strong>
            <span class="intel-badge ${modeProd ? 'intel-off' : 'intel-on'}">${_nexusDataMode.toUpperCase()}</span>
            &nbsp;— ${modeProd ? 'Nexus treats data as REAL production data.' : 'Nexus treats the existing data as TEST data (safe validation).'}
            <button class="intel-toggle-btn" style="margin-left:10px;" onclick="setNexusDataMode('${modeProd ? 'testing' : 'production'}')">
              Switch to ${modeProd ? 'Testing' : 'Production (go live)'}
            </button>
          </div>
          <div class="intel-status-grid">${toggles}</div>
          <div class="intel-note" style="margin-top:10px;"><i class="fas fa-arrows-rotate"></i> <strong>Listing data:</strong> parse current listings into Nexus features (powers Market &amp; Preference Trends and FMV comparables). Re-run after new listings are posted.
            <button class="intel-toggle-btn" style="margin-left:8px;" onclick="reenrichListings()"><i class="fas fa-arrows-rotate"></i> Re-enrich listings</button>
            <span id="nxEnrichOut" style="margin-left:8px;color:#94a3b8;font-size:11px;"></span></div>
          <div class="intel-note" style="margin-top:10px;"><i class="fas fa-shield-halved"></i> With <strong>Nexus Engine OFF</strong>, realmate and the existing AI Match Engine work exactly as before — Nexus only enhances, it never blocks the app.</div>`;
    } catch (e) {
        body.innerHTML = `<div class="intel-empty">Nexus control plane unavailable. Ensure the Nexus migrations have been run on the main project.<br><small>${_intelEsc(e.message || e)}</small></div>`;
    }
}

async function setNexusFlag(key, value) {
    const meta = NEXUS_UNIFIED_FLAG_META.find(f => f.key === key) || { label: key };
    const prodActivation = (_nexusDataMode === 'production' && value === true);
    const run = async (confirmationPhrase) => {
        try {
            const res = await _sbAdmin.functions.invoke('intel-admin', {
                body: { adminPassword: _currentPassword, action: 'set-flag', key, value, confirmationPhrase }
            });
            if (res.error || res.data?.error) { showAdminAlert('Action failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
            showAdminAlert(value ? `${meta.label} enabled` : `${meta.label} disabled`, `${meta.label} is now ${value ? 'ON' : 'OFF'}.`, 'success');
            loadNexusUnified(); loadNexusFmv();
        } catch (e) { showAdminAlert('Action failed', (e.message || String(e)), 'error', 7000); }
    };
    if (prodActivation) {
        _nexusActionModal({ title: 'Enable in Production?', message: `Data Mode is PRODUCTION. Enabling ${meta.label} affects real users. Type the founder phrase to authorize.`, requirePhrase: NEXUS_GO_LIVE_PHRASE, confirmLabel: 'Authorize', icon: 'fa-rocket', onConfirm: () => run(NEXUS_GO_LIVE_PHRASE) });
    } else {
        _nexusActionModal({ title: value ? `Enable ${meta.label}?` : `Disable ${meta.label}?`, message: `Turn ${meta.label} ${value ? 'ON' : 'OFF'}?`, confirmLabel: value ? 'Enable' : 'Disable', icon: value ? 'fa-toggle-on' : 'fa-toggle-off', danger: !value, onConfirm: () => run(null) });
    }
}

async function setNexusDataMode(mode) {
    const toProd = mode === 'production';
    const run = async (confirmationPhrase) => {
        try {
            const res = await _sbAdmin.functions.invoke('intel-admin', {
                body: { adminPassword: _currentPassword, action: 'set-data-mode', mode, confirmationPhrase }
            });
            if (res.error || res.data?.error) { showAdminAlert('Action failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
            showAdminAlert('Data Mode updated', `Nexus Data Mode is now ${mode.toUpperCase()}. No data was changed.`, 'success');
            loadNexusUnified();
        } catch (e) { showAdminAlert('Action failed', (e.message || String(e)), 'error', 7000); }
    };
    if (toProd) {
        _nexusActionModal({ title: 'Switch to PRODUCTION Data Mode?', message: 'This tells Nexus to treat data as REAL production data (the "go live" step). It does NOT delete, reset, or duplicate any data. Type the founder phrase to authorize.', requirePhrase: NEXUS_GO_LIVE_PHRASE, confirmLabel: 'Go Live', icon: 'fa-rocket', onConfirm: () => run(NEXUS_GO_LIVE_PHRASE) });
    } else {
        _nexusActionModal({ title: 'Switch to Testing Data Mode?', message: 'Nexus will treat the existing data as test data (safe validation). No data is changed.', confirmLabel: 'Switch to Testing', icon: 'fa-flask', onConfirm: () => run(null) });
    }
}

// Re-parse public listings into listing_features (powers Market Trends + FMV
// comparables). Admin-gated server-side; never touches listings or user data.
async function reenrichListings() {
    const out = document.getElementById('nxEnrichOut');
    if (out) out.textContent = 'Enriching…';
    try {
        const res = await _sbAdmin.functions.invoke('nexus-enrich', { body: { adminPassword: _currentPassword, action: 'enrich' } });
        if (res.error || res.data?.error) { showAdminAlert('Enrichment failed', (res.error?.message || res.data?.error), 'error', 8000); if (out) out.textContent = ''; return; }
        const d = res.data, cov = d.coverage || {};
        showAdminAlert('Listings enriched', `${d.written}/${d.listings} listings parsed into Nexus features.`, 'success');
        if (out) out.textContent = `${d.written} listings · location ${cov.primary_location} · units ${cov.unit_types} · developer ${cov.developer} · project ${cov.project} · price ${cov.price} · sqm ${cov.sqm}`;
        loadIntelligence();   // refresh the trends with the new features
    } catch (e) { showAdminAlert('Enrichment failed', (e.message || String(e)), 'error', 8000); if (out) out.textContent = ''; }
}

// ── Market Intelligence (stock-market evaluation, spec §8) ────────────────────
function _mktSentColor(s) { return s.includes('Buy') ? '#16a34a' : (s.includes('Sell') ? '#dc2626' : '#64748b'); }
function _mktSeg(s) { return s === 'sale' ? 'Sale' : s === 'rent' ? 'Rent' : s === 'lease' ? 'Lease' : (s || ''); }
function _shortP(n) { n = Number(n) || 0; if (n >= 1e6) return '₱' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e3) return '₱' + Math.round(n / 1e3) + 'K'; return '₱' + n; }
// Per-segment mini bar chart: Supply asking · Demand budget · FMV (like market-summary).
function _mktMiniChart(i) {
  const ask = i.supply_avg || 0, bud = i.demand_avg || 0, fmv = i.fmv_unit || 0;
  const mx = Math.max(ask, bud, fmv, 1);
  const bar = (label, v, color) => `<div style="display:flex;align-items:center;gap:5px;font-size:9px;line-height:1.5;">
      <span style="width:38px;color:#94a3b8;text-align:right;">${label}</span>
      <span style="display:inline-block;height:7px;width:${Math.round((v / mx) * 80)}px;min-width:${v ? 2 : 0}px;background:${color};border-radius:2px;"></span>
      <span style="color:#64748b;">${v ? _shortP(v) : '—'}</span></div>`;
  return `<div style="min-width:130px;">${bar('Ask', ask, '#ef4444')}${bar('Budget', bud, '#16a34a')}${bar('FMV', fmv, '#2563eb')}</div>`;
}
async function loadNexusMarket() {
  const body = document.getElementById('nexusMarketBody'); if (!body) return;
  try {
    const res = await _sbAdmin.functions.invoke('nexus-fmv', { body: { adminPassword: _currentPassword, action: 'market' } });
    if (res.error || res.data?.error) { body.innerHTML = `<div class="intel-empty">Market intelligence unavailable. Run "Re-enrich listings" first.<br><small>${_intelEsc(res.error?.message || res.data?.error || '')}</small></div>`; return; }
    const items = res.data.items || [], s = res.data.summary || {};
    const rows = items.map(i => `<tr>
        <td style="text-align:left;">${_intelEsc(i.project || i.location || i.developer || '—')}${i.unit ? ' · ' + _intelEsc(i.unit) : ''} <span style="font-size:10px;color:#94a3b8;border:1px solid #e2e8f0;border-radius:4px;padding:1px 4px;">${_mktSeg(i.segment)}</span><br><small style="color:#94a3b8;">${_intelEsc(i.location || '')} · supply ${i.supply} / demand ${i.demand}${i.sold ? ' · ' + i.sold + ' sold' : ''}</small></td>
        <td style="text-align:center;"><span style="font-weight:700;color:${_mktSentColor(i.sentiment)};">${i.sentiment}</span><br><small style="color:#94a3b8;">${i.confidence}</small></td>
        <td style="text-align:right;font-weight:700;">${i.fmv_unit ? _peso(i.fmv_unit) : '—'}${i.fmv_sqm ? `<br><small style="color:#94a3b8;">${_peso(i.fmv_sqm)}/sqm</small>` : ''}</td>
        <td>${_mktMiniChart(i)}</td>
        <td style="text-align:center;font-size:11px;color:#64748b;">D${i.demand_score} · M${i.momentum_score} · L${i.liquidity_score} · V${i.volatility_score}</td>
        <td style="text-align:center;font-weight:800;font-size:14px;color:${_mktSentColor(i.sentiment)};">${i.composite_score}</td>
      </tr>`).join('');
    body.innerHTML = `
      <div style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="intel-toggle-btn" onclick="loadNexusMarket()"><i class="fas fa-rotate"></i> Refresh</button>
        <span><span style="color:#16a34a;font-weight:700;">▲ ${s.buy || 0} Buy</span> &nbsp; <span style="color:#dc2626;font-weight:700;">▼ ${s.sell || 0} Sell</span> &nbsp; <span style="color:#64748b;">● ${s.neutral || 0} Neutral</span></span>
        <span style="font-size:11px;color:#94a3b8;">${items.length} tracked segment(s)</span>
      </div>
      ${(s.insights || []).length ? `<ul style="font-size:12px;color:#475569;margin:0 0 12px 18px;padding:0;">${s.insights.map(x => `<li>${_intelEsc(x)}</li>`).join('')}</ul>` : ''}
      ${items.length ? `<div style="overflow-x:auto;"><table class="intel-table" style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Project / Location · Unit</th><th>Sentiment</th><th>FMV</th><th>Ask · Budget · FMV</th><th>Signals (D·M·L·V)</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <p style="font-size:10px;color:#94a3b8;margin-top:8px;">Composite 0–99 blends demand, momentum, liquidity and (inverse) volatility → Buy/Sell sentiment. Estimated market intelligence — not a formal appraisal.</p>`
        : '<div class="intel-empty">No market segments yet — run "Re-enrich listings".</div>'}`;
  } catch (e) { body.innerHTML = `<div class="intel-empty">Market intelligence unavailable: ${_intelEsc(e.message || e)}</div>`; }
}

// ── FMV (admin-only) ────────────────────────────────────────────────────────
function _peso(n) { return (n == null) ? '—' : '₱' + Math.round(Number(n)).toLocaleString('en-PH'); }

async function loadNexusFmv() {
    const body = document.getElementById('nexusFmvBody');
    if (!body) return;
    try {
        const res = await _sbAdmin.functions.invoke('nexus-fmv', { body: { adminPassword: _currentPassword, action: 'list', limit: 200 } });
        if (res.error || res.data?.error) {
            body.innerHTML = `<div class="intel-empty">FMV engine not reachable yet. Deploy <code>nexus-fmv</code> and run the migration.<br><small>${_intelEsc(res.error?.message || res.data?.error || '')}</small>
              <div style="margin-top:10px;"><button class="intel-toggle-btn" onclick="computeNexusFmv()"><i class="fas fa-calculator"></i> Compute FMV now</button></div></div>`;
            return;
        }
        const all = (res.data.results || []);
        // Only show groups that produced an ESTIMATE. Groups without enough
        // comparables are counted, not listed as empty "insufficient" rows.
        const rows = all.filter(r => r.estimated_unit_type_fmv != null)
                        .sort((a, b) => (b.estimated_unit_type_fmv || 0) - (a.estimated_unit_type_fmv || 0));
        const pending = all.length - rows.length;
        const psm = (n) => '₱' + Math.round(Number(n)).toLocaleString('en-PH') + '<small style="color:#94a3b8;">/sqm</small>';
        const dq = (r) => r.data_quality || {};
        const table = rows.length ? `<table class="intel-table" style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr><th style="text-align:left;">Project / Location · Unit</th><th>Average FMV</th><th>Median</th><th>Range (min–max)</th><th>FMV / sqm</th><th>Conf.</th><th>Obs.</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td style="text-align:left;">${_intelEsc(r.project || r.location_area || r.developer || '—')} · ${_intelEsc(r.unit_type || (r.bedrooms != null ? r.bedrooms + 'BR' : '—'))}<br><small style="color:#94a3b8;">${_intelEsc(r.location_area || r.location_city || '')}${r.project && r.developer ? ' · ' + _intelEsc(r.developer) : ''} · ${_intelEsc(r.signal_scope)}</small></td>
            <td style="text-align:right;font-weight:700;">${_peso(dq(r).average != null ? dq(r).average : r.estimated_unit_type_fmv)}</td>
            <td style="text-align:right;">${_peso(dq(r).median != null ? dq(r).median : r.estimated_unit_type_fmv)}</td>
            <td style="text-align:right;color:#64748b;">${r.unit_type_fmv_low != null ? _peso(r.unit_type_fmv_low) + '–' + _peso(r.unit_type_fmv_high) : '—'}</td>
            <td style="text-align:right;">${r.fmv_per_sqm != null ? psm(r.fmv_per_sqm) : '<span style="color:#94a3b8;">n/a (no sizes)</span>'}</td>
            <td style="text-align:center;">${_intelEsc((r.confidence || '—')).toUpperCase()}</td>
            <td style="text-align:center;">${r.observation_count}</td>
            <td style="text-align:center;"><button class="intel-toggle-btn" onclick="viewFmvDetail('${_intelEsc(r.comparable_key)}')">Audit</button></td>
          </tr>`).join('')}</tbody></table>`
          : `<div class="intel-empty">No comparable group has enough data (≥3 similar listings) for a confident FMV yet.${all.length ? ' ' + all.length + ' group(s) are being tracked and will produce estimates as more matching listings are posted.' : ' Click Recompute after listings are enriched.'}</div>`;
        body.innerHTML = `<div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="intel-toggle-btn" onclick="computeNexusFmv()"><i class="fas fa-calculator"></i> Recompute FMV</button>
            <span style="font-size:11px;color:#94a3b8;">${rows.length} estimate(s)${pending ? ` · ${pending} group(s) tracked, awaiting ≥3 comparables` : ''}. Estimated market intelligence — not a formal appraisal.</span>
          </div>${table}`;
    } catch (e) {
        body.innerHTML = `<div class="intel-empty">FMV unavailable: ${_intelEsc(e.message || e)}</div>`;
    }
}

async function computeNexusFmv() {
    showAdminAlert('Computing FMV…', 'Analyzing listings, willing-to-buy signals, and confirmed sales.', 'success', 3500);
    try {
        const res = await _sbAdmin.functions.invoke('nexus-fmv', { body: { adminPassword: _currentPassword, action: 'compute', force: true } });
        if (res.error || res.data?.error) { showAdminAlert('Compute failed', (res.error?.message || res.data?.error), 'error', 8000); return; }
        const d = res.data;
        showAdminAlert('FMV computed', `${d.estimated_groups} estimate(s) across ${d.groups} comparable group(s).`, 'success');
        loadNexusFmv();
    } catch (e) { showAdminAlert('Compute failed', (e.message || String(e)), 'error', 8000); }
}

async function viewFmvDetail(comparableKey) {
    try {
        const res = await _sbAdmin.functions.invoke('nexus-fmv', { body: { adminPassword: _currentPassword, action: 'detail', comparable_key: comparableKey } });
        if (res.error || res.data?.error) { showAdminAlert('Not found', (res.error?.message || res.data?.error), 'error'); return; }
        const { result, observations } = res.data;
        const psmFmt = (n) => n == null ? '—' : '₱' + Math.round(Number(n)).toLocaleString('en-PH') + '/sqm';
        const obsRows = (observations || []).map(o => `<tr style="${o.included ? '' : 'opacity:.55;'}">
            <td>${_intelEsc(o.source_type)}</td>
            <td style="text-align:right;">${_peso(o.raw_price)}</td>
            <td style="text-align:center;">${o.floor_area_sqm != null ? Math.round(o.floor_area_sqm) : '—'}</td>
            <td style="text-align:right;">${o.price_per_sqm != null ? psmFmt(o.price_per_sqm) : '—'}</td>
            <td style="text-align:center;">${o.size_similarity_weight != null ? o.size_similarity_weight : '—'}</td>
            <td style="text-align:center;">${o.effective_weight}</td>
            <td style="text-align:center;">${o.robust_z != null ? o.robust_z : '—'}</td>
            <td style="text-align:center;">${o.outlier_status === 'flagged' ? '<span style="color:#dc2626;">outlier</span>' : (o.included ? '✓' : '✗')}</td>
            <td style="font-size:10px;color:#94a3b8;">${_intelEsc(o.exclusion_reason || o.outlier_reason || '')}</td>
          </tr>`).join('');
        const rng = (lo, hi) => (lo == null) ? '—' : `${_peso(lo)}–${_peso(hi)}`;
        const el = document.createElement('div');
        el.className = 'rm-modal-overlay'; el.style.display = 'flex';
        el.onclick = (e) => { if (e.target === el) el.remove(); };
        el.innerHTML = `<div class="rm-modal-box" style="max-width:760px;">
          <div class="rm-modal-head"><span>FMV Audit — ${_intelEsc(result.project || result.developer || result.comparable_key)} · ${_intelEsc(result.unit_type || '')}</span><span class="rm-modal-close" role="button" onclick="this.closest('.rm-modal-overlay').remove()">&times;</span></div>
          <div class="rm-modal-body">
            <div class="intel-status-grid" style="margin-bottom:10px;">
              <div class="intel-stat"><div class="intel-stat-k">FMV / sqm (primary)</div><div class="intel-stat-v">${psmFmt(result.fmv_per_sqm)}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">FMV/sqm range (P25–P75)</div><div class="intel-stat-v">${result.per_sqm_low == null ? '—' : psmFmt(result.per_sqm_low) + ' – ' + psmFmt(result.per_sqm_high)}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Representative size</div><div class="intel-stat-v">${result.representative_size != null ? Math.round(result.representative_size) + ' sqm' : '—'}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Estimated unit-type FMV</div><div class="intel-stat-v">${result.estimated_unit_type_fmv == null ? '—' : _peso(result.estimated_unit_type_fmv)}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Unit-type FMV range</div><div class="intel-stat-v">${rng(result.unit_type_fmv_low, result.unit_type_fmv_high)}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Confidence</div><div class="intel-stat-v">${_intelEsc((result.confidence || '—')).toUpperCase()}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Secondary /sqm (trimmed mean)</div><div class="intel-stat-v">${psmFmt(result.secondary_per_sqm)}</div></div>
              <div class="intel-stat"><div class="intel-stat-k">Sources</div><div class="intel-stat-v">${result.unique_sellers || 0} sellers · ${result.unique_buyers || 0} buyers · ${result.confirmed_count || 0} confirmed</div></div>
            </div>
            ${result.fmv_per_sqm != null ? `<div class="intel-note" style="margin-bottom:10px;">
              <i class="fas fa-ruler-combined"></i> <strong>Specific unit:</strong>
              <input type="number" id="fmvSpecificSize" placeholder="size in sqm" style="width:120px;padding:4px 8px;margin:0 6px;" min="1">
              <button class="intel-toggle-btn" onclick="fmvSpecific('${_intelEsc(result.comparable_key)}')">Estimate</button>
              <span id="fmvSpecificOut" style="margin-left:8px;font-weight:700;"></span></div>` : ''}
            <p style="font-size:12px;color:#475569;">${_intelEsc(result.explanation || '')}</p>
            <table class="intel-table" style="width:100%;font-size:11px;margin-top:8px;border-collapse:collapse;">
              <thead><tr><th>Signal</th><th>Price</th><th>Size</th><th>₱/sqm</th><th>Size-sim</th><th>Eff.wt</th><th>z</th><th>Status</th><th>Note</th></tr></thead>
              <tbody>${obsRows}</tbody></table>
            <p style="font-size:10px;color:#94a3b8;margin-top:8px;">Estimated market intelligence derived from realmate data (price-per-sqm basis). Not a formal appraisal, licensed valuation, or guaranteed price.</p>
          </div></div>`;
        document.body.appendChild(el);
    } catch (e) { showAdminAlert('Error', (e.message || String(e)), 'error'); }
}

// Specific-unit FMV (§16): FMV/sqm of the group × the size the admin enters.
async function fmvSpecific(comparableKey) {
    const inp = document.getElementById('fmvSpecificSize');
    const out = document.getElementById('fmvSpecificOut');
    const size = Number(inp && inp.value);
    if (!(size > 0)) { if (out) out.textContent = 'enter a size'; return; }
    try {
        const res = await _sbAdmin.functions.invoke('nexus-fmv', { body: { adminPassword: _currentPassword, action: 'specific', comparable_key: comparableKey, size } });
        if (res.error || res.data?.error) { if (out) out.textContent = (res.error?.message || res.data?.error); return; }
        const d = res.data;
        if (out) out.innerHTML = `${_peso(d.specific_unit_fmv)} <small style="color:#94a3b8;">(${_peso(d.specific_unit_fmv_low)}–${_peso(d.specific_unit_fmv_high)}, at ₱${Math.round(d.fmv_per_sqm).toLocaleString('en-PH')}/sqm × ${size} sqm)</small>`;
    } catch (e) { if (out) out.textContent = (e.message || String(e)); }
}

async function reviewEnrichment(id, status) {
    const client = _nexusClient();
    if (!client) { showAdminAlert('Environment not configured', 'The selected environment is not configured yet.', 'error'); return; }
    try {
        const res = await client.functions.invoke('intel-admin', {
            body: { adminPassword: _currentPassword, action: 'review-enrichment', id, status }
        });
        if (res.error || res.data?.error) { showAdminAlert('Action failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
        showAdminAlert('Suggestion ' + status, `Enrichment suggestion ${status}.`, 'success');
        loadIntelligence();
    } catch (e) { showAdminAlert('Action failed', (e.message || String(e)), 'error', 7000); }
}

// ── Realmate Test Users (dataset='realuser') management ──────────────────────
function _topKey(obj) {
    if (!obj || typeof obj !== 'object') return '—';
    let best = null, bv = -Infinity;
    for (const k in obj) { const v = Number(obj[k]); if (v > bv) { bv = v; best = k; } }
    return best || '—';
}

function _renderRealUsers(d) {
    const card = document.getElementById('intelRealUsersCard');
    const el = document.getElementById('intelRealUsers');
    if (!card || !el) return;
    if (_nexusDataset !== 'realuser') { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const allow = d.allowlist || [];
    const sync = d.last_sync;
    const profiles = d.profiles || [];
    const c = d.counts || {};

    const allowRows = allow.length ? allow.map(a => `
        <tr><td>${_intelEsc(a.label || a.user_id)}</td>
            <td style="color:#94a3b8;font-size:11px;">${_intelEsc(String(a.user_id).slice(0, 8))}…</td>
            <td><button class="intel-toggle-btn intel-btn-ghost" onclick="removeTestUser('${_intelEsc(a.user_id)}')">Remove</button></td></tr>`).join('')
        : '<tr><td colspan="3" class="intel-empty">No designated test users yet. Add accounts by username or email above.</td></tr>';

    const _stateBadge = (s) => {
        const map = { cold_start: ['Cold Start', '#fee2e2', '#991b1b'], emerging: ['Emerging', '#fef3c7', '#92400e'], established: ['Established', '#dcfce7', '#166534'] };
        const m = map[s] || ['—', '#f1f5f9', '#64748b'];
        return `<span style="background:${m[1]};color:${m[2]};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">${m[0]}</span>`;
    };
    const _priceCell = (p) => {
        if (p.price_state === 'estimated' && p.price_center) {
            const r = Array.isArray(p.price_range) ? ` (₱${Number(p.price_range[0]).toLocaleString()}–₱${Number(p.price_range[1]).toLocaleString()})` : '';
            return '₱' + Number(p.price_center).toLocaleString() + `<span style="color:#94a3b8;font-size:11px;">${r}</span>`;
        }
        return '<span style="color:#b45309;">insufficient evidence</span>';
    };
    const _confCell = (p) => {
        const f = p.confidence_factors || {};
        return `${Math.round((p.confidence || 0) * 100)}%`
            + `<div style="color:#94a3b8;font-size:11px;">evidence ${f.property_evidence ?? '—'} · ${f.distinct_listings ?? 0} listings · ${_intelEsc(f.dominant_signal || '—')}${f.negative_events ? ' · ' + f.negative_events + ' neg' : ''}</div>`;
    };
    const profRows = profiles.length ? profiles.map(p => `
        <tr><td>${_intelEsc(String(p.user_id).slice(0, 8))}…</td>
            <td>${_stateBadge(p.profile_state)}</td>
            <td>${_intelEsc(_topKey(p.location_affinity))}</td>
            <td>${_intelEsc(_topKey(p.unit_affinity))}</td>
            <td>${_intelEsc(_topKey(p.property_type_affinity))}</td>
            <td>${_intelEsc(_topKey(p.developer_affinity))}</td>
            <td>${_priceCell(p)}</td>
            <td>${_confCell(p)}</td></tr>`).join('')
        : '<tr><td colspan="8" class="intel-empty">No learned profiles yet — Sync + Train after adding test users.</td></tr>';

    el.innerHTML = `
      <div class="intel-note"><i class="fas fa-shield-halved"></i> Only accounts on this allowlist can ever generate Nexus events, and their data is verified server-side. This is <strong>real behaviour</strong> from designated test users — separate from the synthetic benchmark.</div>

      <div class="intel-sub">Add a designated test user</div>
      <div class="url-input-row" style="margin-bottom:16px;">
        <input type="text" id="ruAddInput" placeholder="username or email of a realmate account">
        <button class="intel-toggle-btn" onclick="addTestUser()"><i class="fas fa-plus"></i> Add</button>
      </div>

      <div class="intel-sub">Designated test users (${allow.length})</div>
      <table class="intel-table"><thead><tr><th>Account</th><th>ID</th><th></th></tr></thead><tbody>${allowRows}</tbody></table>

      <div class="intel-toggles" style="margin-top:18px;">
        <button class="intel-toggle-btn" onclick="syncRealUsers()"><i class="fas fa-rotate"></i> Sync realmate Test Data</button>
        <button class="intel-toggle-btn" onclick="trainRealUsers()"><i class="fas fa-brain"></i> Train (realuser)</button>
        <button class="intel-toggle-btn intel-btn-ghost" onclick="resetRealUsers()"><i class="fas fa-trash"></i> Reset realmate Test Users</button>
      </div>
      <div class="intel-subnote">
        Imported: <strong>${c.behavioral_events == null ? '—' : c.behavioral_events}</strong> events ·
        <strong>${c.user_behavior_profiles == null ? '—' : c.user_behavior_profiles}</strong> profiles ·
        Last sync: ${sync ? `${_intelEsc(sync.kind)} · ${_intelEsc(sync.status)} · ${_intelEsc(sync.users_count || 0)} users / ${_intelEsc(sync.events_count || 0)} events · ${_intelEsc((sync.finished_at || sync.started_at || '').slice(0, 16).replace('T', ' '))}` : 'never'}
      </div>

      <div class="intel-sub" style="margin-top:20px;">What Nexus learned from these users (${profiles.length})</div>
      <table class="intel-table"><thead><tr><th>User</th><th>State</th><th>Location</th><th>Unit</th><th>Type</th><th>Developer</th><th>Price</th><th>Confidence (why)</th></tr></thead><tbody>${profRows}</tbody></table>`;
}

async function addTestUser() {
    const client = _nexusClient(); if (!client) { showAdminAlert('Testing not configured', 'The testing environment is not configured yet.', 'error'); return; }
    const input = document.getElementById('ruAddInput');
    const val = (input && input.value || '').trim();
    if (!val) { showAdminAlert('Missing input', 'Enter a username or email.', 'error'); return; }
    try {
        const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'add-allowlist', user: val } });
        if (res.error || res.data?.error) { showAdminAlert('Could not add user', (res.error?.message || res.data?.error), 'error', 7000); return; }
        if (input) input.value = '';
        showAdminAlert('Test user added', 'Added to the Nexus allowlist.', 'success');
        loadIntelligence();
    } catch (e) { showAdminAlert('Could not add user', (e.message || String(e)), 'error', 7000); }
}

function removeTestUser(uid) {
    const client = _nexusClient(); if (!client) return;
    _nexusActionModal({
        title: 'Remove test user?',
        message: 'Remove this test user from the Nexus allowlist? Their future activity will stop being captured.',
        confirmLabel: 'Remove', icon: 'fa-user-minus', danger: true,
        onConfirm: async () => {
            try {
                const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'remove-allowlist', user_id: uid } });
                if (res.error || res.data?.error) { showAdminAlert('Could not remove user', (res.error?.message || res.data?.error), 'error', 7000); return; }
                showAdminAlert('Test user removed', 'Removed from the Nexus allowlist.', 'success');
                loadIntelligence();
            } catch (e) { showAdminAlert('Could not remove user', (e.message || String(e)), 'error', 7000); }
        }
    });
}

function syncRealUsers() {
    const client = _nexusClient(); if (!client) return;
    _nexusActionModal({
        title: 'Sync realmate test data?',
        message: 'Import existing production behaviour (offers/sales/messages/saves/follows) for the allowlisted test users into the testing project?',
        confirmLabel: 'Sync', icon: 'fa-rotate',
        onConfirm: async () => {
            try {
                const res = await client.functions.invoke('nexus-sync', { body: { adminPassword: _currentPassword } });
                if (res.error || res.data?.error) { showAdminAlert('Sync failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
                const r = res.data || {};
                showAdminAlert('Sync complete', `${r.users || 0} users, ${r.events || 0} events imported.`, 'success');
                loadIntelligence();
            } catch (e) { showAdminAlert('Sync failed', (e.message || String(e)), 'error', 7000); }
        }
    });
}

function trainRealUsers() {
    const client = _nexusClient(); if (!client) return;
    _nexusActionModal({
        title: 'Train on realuser dataset?',
        message: 'Trigger Nexus training on the realuser dataset (runs in GitHub Actions, testing project only)? Results appear here in a few minutes.',
        confirmLabel: 'Train', icon: 'fa-brain',
        onConfirm: async () => {
            try {
                const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'train-realuser' } });
                if (res.error || res.data?.error) { showAdminAlert('Train trigger failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
                showAdminAlert('Training started', 'Running in GitHub Actions. Refresh in a few minutes to see results.', 'success');
            } catch (e) { showAdminAlert('Train trigger failed', (e.message || String(e)), 'error', 7000); }
        }
    });
}

function resetRealUsers() {
    const client = _nexusClient(); if (!client) return;
    _nexusActionModal({
        title: 'Reset realmate test users?',
        message: 'Delete ALL realuser Nexus data (events, profiles, matches, recommendations, intelligence) from the testing project? The synthetic benchmark and production are NOT affected.',
        confirmLabel: 'Delete realuser data', icon: 'fa-trash', danger: true,
        onConfirm: async () => {
            try {
                const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'reset-realusers' } });
                if (res.error || res.data?.error) { showAdminAlert('Reset failed', (res.error?.message || res.data?.error), 'error', 7000); return; }
                showAdminAlert('Realuser data reset', 'All realuser Nexus data was deleted from the testing project.', 'success');
                loadIntelligence();
            } catch (e) { showAdminAlert('Reset failed', (e.message || String(e)), 'error', 7000); }
        }
    });
}

// ════════════════════════════════════════════════════════════════════════════
//  Multi-employee Admin — identity, employee login, invitations, live sync
//  (Phase 3). Additive: nothing above is removed; the password path still works.
// ════════════════════════════════════════════════════════════════════════════

// Who is signed in. Password path (shared password) is treated as the Master.
let _adminMe = { userId: null, username: null, isMaster: false, mode: 'password' };
let _pendingInviteToken = null;
let _adminChannels = [];

// Resolve the signed-in identity from the Supabase session (employee) or fall
// back to the Master on the shared-password path.
async function resolveMyIdentity() {
    try {
        const { data: { user } } = await _sbAdmin.auth.getUser();
        if (user) {
            const { data: m } = await _sbAdmin.from('admin_members')
                .select('username,role,status').eq('user_id', user.id).maybeSingle();
            if (m && m.status === 'approved') {
                _adminMe = {
                    userId: user.id,
                    username: m.username || (user.email || '').split('@')[0] || 'admin',
                    isMaster: m.role === 'master',
                    mode: 'jwt',
                };
                return _adminMe;
            }
        }
    } catch (e) {}
    _adminMe = { userId: null, username: 'master', isMaster: true, mode: 'password' };
    return _adminMe;
}

// Reflect identity in the UI: reveal Employees for the Master, and make the
// employee dashboard visually distinct from the Master's (blue accent + role pill
// + banner) so it's always clear which view you're in.
function _acInitials(s) {
    s = String(s || '').replace(/[@_.]/g, ' ').trim();
    const p = s.split(/\s+/).filter(Boolean);
    if (!p.length) return 'RM';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
}

function applyIdentityUI() {
    const isMaster = !!_adminMe.isMaster;
    const uname = _adminMe.username || 'admin';
    document.querySelectorAll('.sb-employees').forEach(el => {
        el.style.display = isMaster ? '' : 'none';
    });
    // Role class on the dashboard drives all the employee-vs-master theming in CSS.
    const dash = document.getElementById('adminDash');
    if (dash) {
        dash.classList.toggle('role-master', isMaster);
        dash.classList.toggle('role-employee', !isMaster);
    }
    // Sidebar role badge (desktop + mobile labels share the .admin-whoami class).
    const badge = isMaster
        ? '<span class="sb-role sb-role-master"><i class="fas fa-crown"></i> Master Admin</span>'
        : '<span class="sb-role sb-role-emp"><i class="fas fa-shield-halved"></i> Employee View</span>';
    document.querySelectorAll('.admin-whoami').forEach(b => { b.innerHTML = badge; });

    // Top-right identity chip + profile dropdown.
    const chipName = document.getElementById('aucName');
    if (chipName) {
        const nm = isMaster ? 'Master Admin' : ('@' + uname);
        const rl = isMaster ? 'Master Access' : 'Employee Access';
        const ini = _acInitials(isMaster ? 'Master Admin' : uname);
        chipName.textContent = nm;
        document.getElementById('aucRole').textContent = rl;
        document.getElementById('aucAvatar').textContent = ini;
        const mn = document.getElementById('aucMenuName'); if (mn) mn.textContent = nm;
        const mr = document.getElementById('aucMenuRole'); if (mr) mr.textContent = rl;
        const ma = document.getElementById('aucMenuAvatar'); if (ma) ma.textContent = ini;
    }
    // Employee-only banner at the top of the content.
    const banner = document.getElementById('roleBanner');
    if (banner) {
        if (isMaster) { banner.style.display = 'none'; banner.innerHTML = ''; }
        else {
            banner.style.display = '';
            banner.innerHTML = '<i class="fas fa-user-shield"></i><span>Employee view — signed in as <b>@' + escapeHtml(uname) + '</b>. You have full team access; employee management is Master-only.</span>';
        }
    }
}

// ── Employee sign-in (own Supabase account) ─────────────────────────────────
async function employeeSignIn() {
    const email = (document.getElementById('empEmail').value || '').trim();
    const pass = document.getElementById('empPass').value || '';
    const err = document.getElementById('empError');
    const show = (m) => { err.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + m; err.style.display = 'flex'; };
    err.style.display = 'none';
    if (!email || !pass) { show('Enter your email and password.'); return; }
    try {
        const { error } = await _sbAdmin.auth.signInWithPassword({ email, password: pass });
        if (error) { show(error.message || 'Sign-in failed.'); return; }
        // Approved? (is_admin() = approved member OR legacy flag)
        if (await _adminSessionIsAdmin()) {
            sessionStorage.removeItem('rm_admin_signed_out');
            sessionStorage.setItem('rm_admin', '1');
            showDash();
        } else {
            // Signed in but not approved — read our own membership to say why.
            const { data: { user } } = await _sbAdmin.auth.getUser();
            const { data: m } = user ? await _sbAdmin.from('admin_members').select('status').eq('user_id', user.id).maybeSingle() : { data: null };
            await _sbAdmin.auth.signOut();
            if (m && m.status === 'pending') show('Your access is pending Master approval.');
            else if (m && m.status === 'revoked') show('Your admin access has been revoked.');
            else show('This account does not have admin access.');
        }
    } catch (e) { show(e.message || String(e)); }
}

// Pull the REAL error out of a functions.invoke() result. On a non-2xx, supabase-js
// sets res.error.message to the useless "Edge Function returned a non-2xx status
// code" and hides the server's JSON body in res.error.context (a Response). This
// reads that body so callers can show the actual reason.
async function _fnError(res, fallback) {
    if (res?.data?.error) return res.data.error;
    const ctx = res?.error?.context;
    if (ctx && typeof ctx.clone === 'function') {
        try { const b = await ctx.clone().json(); if (b?.error) return b.error; } catch {}
        try { const t = await ctx.clone().text(); if (t) { try { return JSON.parse(t).error || t; } catch { return t; } } } catch {}
    }
    return res?.error?.message || fallback || 'Something went wrong.';
}

// ── Invite acceptance ───────────────────────────────────────────────────────
function showInviteScreen() {
    document.getElementById('gateScreen').style.display = 'none';
    const dash = document.getElementById('adminDash'); if (dash) dash.style.display = 'none';
    const inv = document.getElementById('inviteScreen'); if (inv) inv.style.display = 'flex';
}
async function acceptInvite() {
    const email = (document.getElementById('invEmail').value || '').trim();
    const pass = document.getElementById('invPass').value || '';
    const msg = document.getElementById('invMsg');
    const show = (m, ok) => { msg.innerHTML = (ok ? '<i class="fas fa-circle-check"></i> ' : '<i class="fas fa-circle-exclamation"></i> ') + m; msg.style.display = 'flex'; msg.style.color = ok ? '#16a34a' : ''; };
    msg.style.display = 'none';
    if (!_pendingInviteToken) { show('Missing invite token. Reopen the link from your email.'); return; }
    if (!email || !pass) { show('Enter your email and a password.'); return; }
    try {
        // Sign in if the account exists; otherwise create it.
        let signedIn = false;
        const si = await _sbAdmin.auth.signInWithPassword({ email, password: pass });
        if (!si.error) signedIn = true;
        else {
            const su = await _sbAdmin.auth.signUp({ email, password: pass });
            if (su.error) { show(su.error.message || 'Could not create your account.'); return; }
            if (!su.data.session) { show('Account created. Confirm your email, then reopen this invite link to finish.', true); return; }
            signedIn = true;
        }
        if (!signedIn) { show('Could not sign you in.'); return; }
        // Register the pending membership via the invite token.
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { action: 'accept-invite', token: _pendingInviteToken } });
        if (res.error || !res.data?.ok) { const em = await _fnError(res, 'Could not accept the invite.'); await _sbAdmin.auth.signOut(); show(em); return; }
        if (res.data.status === 'approved') {
            sessionStorage.removeItem('rm_admin_signed_out');
            sessionStorage.setItem('rm_admin', '1');
            history.replaceState(null, '', location.pathname);
            showDash();
        } else {
            await _sbAdmin.auth.signOut();
            show('Registration submitted. You will get access once a Master Admin approves you.', true);
        }
    } catch (e) { show(e.message || String(e)); }
}

// ── Employees tab (Master only) ─────────────────────────────────────────────
async function loadEmployees() {
    const mt = document.getElementById('employeesTable');
    const it = document.getElementById('invitationsTable');
    if (mt) mt.innerHTML = `<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'list' } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        const members = res.data.members || [];
        mt.innerHTML = members.length ? `
          <table class="analytics-table">
            <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${members.map(m => {
              const isMaster = m.role === 'master';
              const st = m.status || 'pending';
              const badge = `<span class="sup-badge ${st === 'approved' ? 'sup-resolved' : st === 'pending' ? 'sup-open' : 'sup-handling'}">${escapeHtml(st)}</span>`;
              let act = '';
              const removeBtn = `<button class="eb eb-danger" onclick="empRemove('${m.user_id}','${escapeHtml(m.username || m.email || 'this member')}')" title="Remove from roster"><i class="fas fa-trash"></i> Remove</button>`;
              if (isMaster) act = '<span class="eb-locked"><i class="fas fa-crown"></i> Master</span>';
              else if (st === 'pending') act = `<button class="eb eb-primary" onclick="empSet('${m.user_id}','approve')"><i class="fas fa-check"></i> Approve</button><button class="eb eb-danger" onclick="empSet('${m.user_id}','reject')"><i class="fas fa-xmark"></i> Reject</button>`;
              else if (st === 'approved') act = `<button class="eb eb-neutral" onclick="empSet('${m.user_id}','revoke')"><i class="fas fa-ban"></i> Revoke</button>${removeBtn}`;
              else act = `<button class="eb eb-primary" onclick="empSet('${m.user_id}','approve')"><i class="fas fa-rotate-left"></i> Re-approve</button>${removeBtn}`;
              return `<tr><td data-label="Username">@${escapeHtml(m.username || '—')}${isMaster ? ' <i class="fas fa-crown" style="color:#d97706;"></i>' : ''}</td><td data-label="Email">${escapeHtml(m.email || '')}</td><td data-label="Role">${escapeHtml(m.role || 'employee')}</td><td data-label="Status">${badge}</td><td data-label="Action"><div class="eb-row">${act}</div></td></tr>`;
            }).join('')}</tbody>
          </table>` : `<div class="empty-row">No admin members yet.</div>`;
    } catch (e) {
        mt.innerHTML = `<div class="empty-row">Could not load employees: ${escapeHtml(e.message || String(e))}<br><small>Ensure the <code>admin-employees</code> Edge Function is deployed and Phase-1 SQL has run.</small></div>`;
    }
    // Invitations
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'list-invitations' } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        const invs = res.data.invitations || [];
        it.innerHTML = invs.length ? `
          <table class="analytics-table">
            <thead><tr><th>Email</th><th>Status</th><th>Sent</th><th>Expires</th><th>Action</th></tr></thead>
            <tbody>${invs.map(i => `<tr>
              <td data-label="Email">${escapeHtml(i.email)}</td>
              <td data-label="Status"><span class="sup-badge ${i.status === 'accepted' ? 'sup-resolved' : i.status === 'pending' ? 'sup-open' : 'sup-handling'}">${escapeHtml(i.status)}</span></td>
              <td data-label="Sent">${escapeHtml(new Date(i.created_at).toLocaleDateString())}</td>
              <td data-label="Expires">${escapeHtml(new Date(i.expires_at).toLocaleDateString())}</td>
              <td data-label="Action"><div class="eb-row">${i.status === 'pending' ? `${i.link ? `<button class="eb eb-dark" onclick="copyInviteLink(this,'${encodeURIComponent(i.link)}')"><i class="fas fa-link"></i> Copy link</button>` : ''}<button class="eb eb-neutral" onclick="revokeInvitation('${i.id}')"><i class="fas fa-xmark"></i> Cancel</button>` : ''}<button class="eb eb-danger" onclick="removeInvitation('${i.id}')" title="Delete this invitation"><i class="fas fa-trash"></i> Remove</button></div></td>
            </tr>`).join('')}</tbody>
          </table>` : `<div class="empty-row">No invitations yet.</div>`;
    } catch (e) {
        it.innerHTML = `<div class="empty-row">Could not load invitations: ${escapeHtml(e.message || String(e))}</div>`;
    }
}
async function sendInvite() {
    const email = (document.getElementById('inviteEmail').value || '').trim();
    const username = (document.getElementById('inviteUsername').value || '').trim();
    const out = document.getElementById('inviteResult');
    if (!email) { out.textContent = 'Enter an email.'; return; }
    out.textContent = 'Sending…';
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'invite', email, username: username || null } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        const link = res.data.link || '';
        if (res.data.emailed) {
            out.innerHTML = `Invite emailed to <b>${escapeHtml(email)}</b>.`;
        } else {
            // Free-tier / no email service: give the Master a copyable link to share.
            out.innerHTML = `Invite created for <b>${escapeHtml(email)}</b>. Email isn't configured, so send them this link:` +
                `<div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">` +
                `<input id="inviteLinkBox" readonly value="${escapeHtml(link)}" style="flex:1;min-width:220px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;" onclick="this.select()">` +
                `<button class="eb eb-dark" onclick="copyInviteLink(this,'${encodeURIComponent(link)}')"><i class="fas fa-link"></i> Copy</button></div>`;
        }
        document.getElementById('inviteEmail').value = '';
        document.getElementById('inviteUsername').value = '';
        loadEmployees();
    } catch (e) { out.textContent = 'Could not invite: ' + (e.message || String(e)); }
}
async function copyInviteLink(btn, encoded) {
    const link = decodeURIComponent(encoded);
    try { await navigator.clipboard.writeText(link); }
    catch { const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
    if (btn) { const o = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Copied'; setTimeout(() => { btn.innerHTML = o; }, 1500); }
}
async function empSet(userId, action) {
    if (action === 'revoke' && !confirm('Revoke this employee’s admin access?')) return;
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action, userId } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        showAdminAlert('Done', action === 'approve' ? 'Employee approved.' : action === 'reject' ? 'Request rejected.' : 'Access revoked.', 'success');
        loadEmployees();
    } catch (e) { showAdminAlert('Failed', e.message || String(e), 'error'); }
}
async function empRemove(userId, label) {
    if (!confirm(`Remove ${label} from the admin roster?\n\nThis deletes their admin membership only — their Realmate app account is not affected. They can be re-invited later.`)) return;
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'delete-member', userId } });
        if (res.error || !res.data?.ok) throw new Error(res.error?.message || res.data?.error || 'Failed');
        showAdminAlert('Removed', 'That member was removed from the roster.', 'success');
        loadEmployees();
    } catch (e) { showAdminAlert('Failed', e.message || String(e), 'error'); }
}
async function revokeInvitation(id) {
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'revoke-invitation', id } });
        if (res.error || !res.data?.ok) throw new Error(await _fnError(res, 'Failed'));
        loadEmployees();
    } catch (e) { showAdminAlert('Failed', e.message || String(e), 'error'); }
}
async function removeInvitation(id) {
    if (!confirm('Delete this invitation from the list?')) return;
    try {
        const res = await _sbAdmin.functions.invoke('admin-employees', { body: { adminPassword: _currentPassword, action: 'delete-invitation', id } });
        if (res.error || !res.data?.ok) throw new Error(await _fnError(res, 'Failed'));
        loadEmployees();
    } catch (e) { showAdminAlert('Failed', e.message || String(e), 'error'); }
}

// ── Realtime so admin sessions stay in sync (no polling) ────────────────────
function startAdminRealtime() {
    stopAdminRealtime();
    try {
        const sup = _sbAdmin.channel('admin-support-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests' }, (payload) => {
                // Refresh the Support tab if it's open.
                if (document.getElementById('tab-support')?.classList.contains('active')) loadSupport();
                // Toast when someone else claims a ticket.
                const n = payload.new || {};
                if (payload.eventType === 'UPDATE' && n.status === 'being_handled' && n.assigned_to && String(n.assigned_to) !== String(_adminMe.userId)) {
                    showAdminAlert('Ticket taken', `A ticket is now being handled by @${n.assigned_username || 'an employee'}.`, 'success', 4000);
                }
                // Alert on a NEW live-chat request so an employee can jump on it.
                if (payload.eventType === 'INSERT' && (n.is_live_chat || n.category === 'live_chat') && n.status === 'open') {
                    showAdminAlert('New live chat request', `${n.name || 'A customer'} is waiting for a representative. Open the Support tab to accept.`, 'success', 8000);
                }
            })
            .subscribe();
        const mem = _sbAdmin.channel('admin-members-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_members' }, () => {
                if (document.getElementById('tab-employees')?.classList.contains('active')) loadEmployees();
            })
            .subscribe();
        _adminChannels = [sup, mem];
    } catch (e) { /* realtime optional; tabs still refresh on open */ }
}
function stopAdminRealtime() {
    try { _adminChannels.forEach(ch => _sbAdmin.removeChannel(ch)); } catch (e) {}
    _adminChannels = [];
}
