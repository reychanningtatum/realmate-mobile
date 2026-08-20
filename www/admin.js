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
}

function logout() {
    sessionStorage.setItem('rm_admin_signed_out', '1');
    sessionStorage.removeItem('rm_admin');
    document.getElementById('gateInput').value = '';
    document.getElementById('adminDash').style.display = 'none';
    document.getElementById('gateScreen').style.display = 'flex';
    stopRegistrationPolling();
}

// ── Auto-restore session on refresh ──────────────────
window.addEventListener('DOMContentLoaded', async () => {
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
    intelligence: 'Nexus',
    security: 'Change Password',
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
    if (name === 'intelligence') loadIntelligence();
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
async function changePassword() {
    const current  = document.getElementById('secCurrent').value;
    const newPass  = document.getElementById('secNew').value;
    const confirm  = document.getElementById('secConfirm').value;

    if (current !== _currentPassword) return showStatus('secStatus', 'Current password is incorrect.', 'error');
    if (!newPass)                      return showStatus('secStatus', 'New password cannot be empty.', 'error');
    if (newPass !== confirm)           return showStatus('secStatus', 'Passwords do not match.', 'error');

    const { error } = await _sbAdmin.from('site_settings').upsert({ key: 'admin_password', value: newPass }, { onConflict: 'key' });
    if (error) return showStatus('secStatus', 'Failed to update: ' + error.message, 'error');

    _currentPassword = newPass;
    ['secCurrent','secNew','secConfirm'].forEach(id => document.getElementById(id).value = '');
    showStatus('secStatus', 'Password updated successfully.', 'success');
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
    renderRegistrations();
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

function renderRegistrations() {
    const list = document.getElementById('registrationsList');
    if (!_regCache.length) {
        list.innerHTML = '<div class="empty-row">No registrations match these filters.</div>';
        return;
    }
    list.innerHTML = _regCache.map(r => {
        const badgeClass = r.status === 'Approved' ? 'reg-badge-approved' : r.status === 'Rejected' ? 'reg-badge-rejected' : 'reg-badge-pending';
        const dateStr = r.registrationDate ? new Date(r.registrationDate).toLocaleString() : '—';
        const extra = r.status === 'Pending Approval'
            ? `<button class="btn-save" onclick="openApproveModal('${r.id}')"><i class="fas fa-check"></i> Approve</button>
               <button class="btn-cancel-sm reg-reject-btn" onclick="openRejectModal('${r.id}')"><i class="fas fa-times"></i> Reject</button>`
            : (r.status === 'Rejected' && r.rejectionReason ? `<div class="reg-reason-note">Reason: ${escapeHtml(r.rejectionReason)}</div>` : '');

        // Thumbnail is a mobile-only affordance (hidden via CSS on
        // desktop, where "View Alveo ID" already does the job) — PDFs get
        // a static icon (no point fetching a signed URL just to show a
        // file-type icon); images lazy-load their real thumbnail once
        // scrolled into view, see setupThumbLazyLoad().
        const isPdf = /\.pdf(\?|$)/i.test(r.alveoIdFile || '');
        const thumbHtml = isPdf
            ? `<div class="reg-thumb reg-thumb-pdf" tabindex="0" role="button" aria-label="View uploaded PDF" onclick="viewAlveoId('${r.id}')"><i class="fas fa-file-pdf"></i></div>`
            : `<div class="reg-thumb reg-thumb-img" data-reg-id="${r.id}" tabindex="0" role="button" aria-label="View uploaded Alveo ID" onclick="viewAlveoId('${r.id}')"><i class="fas fa-spinner fa-spin"></i></div>`;

        return `
        <div class="reg-row">
            <div class="reg-row-top">
                ${thumbHtml}
                <div class="reg-row-main">
                    <div class="reg-name">${escapeHtml(r.fullName || '(no name on file)')} <span class="${badgeClass}">${escapeHtml(r.status)}</span></div>
                    <div class="reg-meta">@${escapeHtml(r.username || '—')} · ${escapeHtml(r.email)} · ${escapeHtml(r.phone || '—')}</div>
                    <div class="reg-meta">${escapeHtml(r.position || '—')}${r.division ? ' · ' + escapeHtml(r.division) : ''}${r.group ? ' · ' + escapeHtml(r.group) : ''}${r.team ? ' · ' + escapeHtml(r.team) : ''}</div>
                    <div class="reg-meta">Registered ${dateStr}</div>
                </div>
            </div>
            <div class="reg-row-actions">
                <button class="btn-cancel-sm" onclick="viewAlveoId('${r.id}')"><i class="fas fa-id-card"></i> View Alveo ID</button>
                ${extra}
            </div>
        </div>`;
    }).join('');

    setupThumbLazyLoad();
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

async function confirmReject() {
    if (!_rejectTargetId) return;
    const reason = document.getElementById('rejectReasonInput').value.trim();
    const targetId = _rejectTargetId;
    const { data, error } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'reject', profileId: targetId, reason }
    });
    closeRejectModal();
    if (error || data?.error) {
        showAdminAlert('Rejection Failed', (data && data.error) || error.message, 'error');
        return;
    }
    showAdminAlert('Registration Rejected', 'The registration has been rejected. A rejection email has been sent to the user.', 'success');
    loadRegistrations();
}

// ── Users ─────────────────────────────────────────────
// A read-only roster of every registered account. Career positions were
// removed from Realmate, so this no longer shows or edits any position.
let _usersCache = [];

async function loadUsers() {
    const list = document.getElementById('usersList');
    list.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    const { data: profiles, error: profErr } = await _sbAdmin
        .from('profiles')
        .select('id, full_name, username, email, avatar_url, division, business_group, created_at')
        .order('created_at', { ascending: false });

    if (profErr) {
        list.innerHTML = `<div class="empty-row">Failed to load users: ${escapeHtml(profErr.message)}</div>`;
        return;
    }

    // Account status lives in registration_reviews, which RLS locks down to
    // service_role only — reading it (for every user, not just "your own
    // row") has to go through the same edge function the Registrations tab
    // uses. Not every profile has a registration_reviews row, though (see
    // script.js's login-gate comment: accounts that predate the approval
    // feature never got one) — those are treated as Approved, same
    // fallback rule used everywhere else in this app.
    const { data: regData, error: regErr } = await _sbAdmin.functions.invoke('admin-registrations', {
        body: { adminPassword: _currentPassword, action: 'list', filters: { status: 'All' } }
    });
    const statusById = {};
    if (!regErr && !regData?.error) {
        (regData.data || []).forEach(r => { statusById[r.id] = r.status; });
    }

    _usersCache = (profiles || []).map(p => ({
        ...p,
        status: statusById[p.id] || 'Approved',
    }));
    renderUsers();
}

function filterUsers() {
    renderUsers();
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

    if (!rows.length) {
        list.innerHTML = `<div class="empty-row">${_usersCache.length ? 'No users match this search.' : 'No registered users yet.'}</div>`;
        return;
    }

    list.innerHTML = rows.map(u => {
        const badgeClass = u.status === 'Approved' ? 'reg-badge-approved' : u.status === 'Rejected' ? 'reg-badge-rejected' : 'reg-badge-pending';
        const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
        const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || '?')}&background=0f172a&color=32cd32`;

        return `
        <div class="reg-row" data-user-id="${u.id}">
            <div class="reg-row-top">
                <img class="user-avatar" src="${avatar}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || '?')}&background=0f172a&color=32cd32'">
                <div class="reg-row-main">
                    <div class="reg-name">${escapeHtml(u.full_name || '(no name on file)')} <span class="${badgeClass}">${escapeHtml(u.status)}</span></div>
                    <div class="reg-meta">@${escapeHtml(u.username || '—')} · ${escapeHtml(u.email || '—')}</div>
                    <div class="reg-meta">${escapeHtml(u.division || '—')}${u.business_group ? ' · ' + escapeHtml(u.business_group) : ''}</div>
                    <div class="reg-meta">Registered ${dateStr}</div>
                </div>
            </div>
        </div>`;
    }).join('');
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

    // Which sections to draw: the selected category, or all four — plus an
    // Uncategorized section only when a record's category doesn't map.
    let buckets = _soldCatFilter === 'all' ? SOLD_BUCKETS.slice() : [_soldCatFilter];
    if (_soldCatFilter === 'all' && filtered.some(r => soldBucket(r.category) === 'Uncategorized')) buckets.push('Uncategorized');

    const badgeFor = { Sold: 'reg-badge-rejected', Bought: 'reg-badge-approved', Rented: 'reg-badge-pending', Leased: 'sold-badge-leased', Uncategorized: 'reg-badge-pending' };
    const fmt = (d) => d ? new Date(d).toLocaleString() : '—';

    list.innerHTML = buckets.map(bucket => {
        const rows = filtered.filter(r => soldBucket(r.category) === bucket);
        if (!rows.length) return '';
        const sectionTotal = rows.reduce((s, r) => s + soldAmount(r), 0);
        const cards = rows.map(r => {
            const img = (Array.isArray(r.image_urls) && r.image_urls[0]) ? r.image_urls[0] : '';
            const thumb = img
                ? `<img class="user-avatar" src="${escapeHtml(img)}" alt="" onerror="this.style.display='none'">`
                : `<div class="reg-thumb reg-thumb-img" style="display:flex;align-items:center;justify-content:center;"><i class="fas fa-house"></i></div>`;
            const deletion = r.deleted_at
                ? `${fmt(r.deleted_at)} <span class="reg-badge-approved">Deleted</span>`
                : `${fmt(r.delete_at)} <span class="reg-badge-pending">Scheduled</span>`;
            const amt = soldAmount(r);
            const amtHtml = amt ? soldPeso(amt) : '<span class="sold-noamt">No amount detected</span>';
            return `
            <div class="reg-row" data-sold-id="${escapeHtml(String(r.id))}">
                <div class="reg-row-top">
                    ${thumb}
                    <div class="reg-row-main">
                        <div class="reg-name">${escapeHtml(r.seller || '(unknown seller)')} <span class="${badgeFor[bucket] || 'reg-badge-rejected'}">${escapeHtml(bucket.toUpperCase())}</span></div>
                        <div class="reg-meta sold-amt-line">Amount: <strong>${amtHtml}</strong></div>
                        <div class="reg-meta">Category: ${escapeHtml(r.category || '—')}</div>
                        <div class="reg-meta">Listing ID: ${escapeHtml(String(r.listing_id || '—'))}</div>
                        <div class="reg-meta">Date: ${fmt(r.sold_at)}</div>
                        <div class="reg-meta">Auto-deletion: ${deletion}</div>
                    </div>
                </div>
                <div class="reg-reason-note" style="white-space:pre-wrap;">${escapeHtml(r.content || '(no text)')}</div>
            </div>`;
        }).join('');
        return `
        <div class="admin-card sold-section">
            <div class="sold-section-head">
                <div class="card-section-title" style="margin:0;"><span class="sold-cat-dot sold-dot-${bucket.toLowerCase()}"></span>${bucket}<span class="sold-section-count">${rows.length}</span></div>
                <div class="sold-section-total">${soldPeso(sectionTotal)}</div>
            </div>
            ${cards}
        </div>`;
    }).join('');
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
    // Registered Users: total now (Today), plus new-in-window growth (7d/30d).
    const ru = d.registeredUsers || { total: 0, new: {} };
    const rows = [
        { label: 'Registered Users',  today: _nfmt(ru.total),                 d7: _plus(ru.new?.sevenDays), d30: _plus(ru.new?.thirtyDays) },
        { label: 'Active Users',      today: _nfmt(d.activeUsers?.today),      d7: _nfmt(d.activeUsers?.sevenDays),      d30: _nfmt(d.activeUsers?.thirtyDays) },
        { label: 'New Registrations', today: _nfmt(d.newRegistrations?.today), d7: _nfmt(d.newRegistrations?.sevenDays), d30: _nfmt(d.newRegistrations?.thirtyDays) },
        { label: 'Listings',          today: _nfmt(d.listings?.today),         d7: _nfmt(d.listings?.sevenDays),         d30: _nfmt(d.listings?.thirtyDays) },
        { label: 'Matches',           today: _nfmt(d.matches?.today),          d7: _nfmt(d.matches?.sevenDays),          d30: _nfmt(d.matches?.thirtyDays) },
    ];

    table.innerHTML = `
      <table class="analytics-table">
        <thead>
          <tr><th>Metric</th><th class="num">Today</th><th class="num">7 Days</th><th class="num">30 Days</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="metric-cell">${escapeHtml(r.label)}</td>
              <td class="num">${escapeHtml(String(r.today))}</td>
              <td class="num">${escapeHtml(String(r.d7))}</td>
              <td class="num">${escapeHtml(String(r.d30))}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    if (meta) {
        const gen = d.generated_at ? new Date(d.generated_at).toLocaleString() : '';
        meta.innerHTML = `<i class="fas fa-clock"></i> Updated ${escapeHtml(gen)} · Timezone ${escapeHtml(d.timezone || 'Asia/Manila')}. Registered Users shows the current total (Today) with new sign-ups for each period; all other rows count activity within the period.`;
    }
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

async function loadIntelligence() {
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
        dsBadge.className = 'intel-badge ' + (_dsRealuser ? 'intel-on' : 'intel-off');
    }
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

    // ── Status + stage controls ──
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

async function setIntelFlag(key, value) {
    const client = _nexusClient();
    if (!client) { alert('Selected environment is not configured.'); return; }

    const isProdActivation = (_nexusEnv === 'production' && value === true);
    let confirmationPhrase = null;

    if (isProdActivation) {
        // Production activation is NOT a normal toggle. It requires the exact
        // founder phrase — a password/click alone is never sufficient.
        const entered = prompt(
            '⚠️ PRODUCTION ACTIVATION\n\n' +
            'This will ACTIVATE Nexus in PRODUCTION (' + key + ' = true) and affects REAL realmate users.\n\n' +
            'To authorize, type the exact phrase:\n\n' + NEXUS_GO_LIVE_PHRASE
        );
        if (entered === null) return; // cancelled
        if (entered !== NEXUS_GO_LIVE_PHRASE) {
            alert('Production activation REJECTED — the phrase did not match exactly.\nProduction remains dormant.');
            return;
        }
        confirmationPhrase = entered;
    } else {
        // Testing controls, and turning production OFF, use a normal confirm.
        const stageMsg = value
            ? `Turn this ON in the ${_nexusEnv.toUpperCase()} environment?`
            : `Turn this OFF in the ${_nexusEnv.toUpperCase()} environment?`;
        if (!confirm(stageMsg + '\n\n(' + key + ' = ' + value + ')')) return;
    }

    try {
        const res = await client.functions.invoke('intel-admin', {
            body: { adminPassword: _currentPassword, action: 'set-flag', key, value, confirmationPhrase }
        });
        if (res.error || res.data?.error) { alert('Failed: ' + (res.error?.message || res.data?.error)); return; }
        loadIntelligence();
    } catch (e) { alert('Failed: ' + (e.message || e)); }
}

async function reviewEnrichment(id, status) {
    const client = _nexusClient();
    if (!client) { alert('Selected environment is not configured.'); return; }
    try {
        const res = await client.functions.invoke('intel-admin', {
            body: { adminPassword: _currentPassword, action: 'review-enrichment', id, status }
        });
        if (res.error || res.data?.error) { alert('Failed: ' + (res.error?.message || res.data?.error)); return; }
        loadIntelligence();
    } catch (e) { alert('Failed: ' + (e.message || e)); }
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
        <button class="intel-toggle-btn" onclick="syncRealUsers()"><i class="fas fa-rotate"></i> Sync Realmate Test Data</button>
        <button class="intel-toggle-btn" onclick="trainRealUsers()"><i class="fas fa-brain"></i> Train (realuser)</button>
        <button class="intel-toggle-btn intel-btn-ghost" onclick="resetRealUsers()"><i class="fas fa-trash"></i> Reset Realmate Test Users</button>
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
    const client = _nexusClient(); if (!client) { alert('Testing environment not configured.'); return; }
    const input = document.getElementById('ruAddInput');
    const val = (input && input.value || '').trim();
    if (!val) { alert('Enter a username or email.'); return; }
    try {
        const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'add-allowlist', user: val } });
        if (res.error || res.data?.error) { alert('Failed: ' + (res.error?.message || res.data?.error)); return; }
        if (input) input.value = '';
        loadIntelligence();
    } catch (e) { alert('Failed: ' + (e.message || e)); }
}

async function removeTestUser(uid) {
    const client = _nexusClient(); if (!client) return;
    if (!confirm('Remove this test user from the Nexus allowlist? Their future activity will stop being captured.')) return;
    try {
        const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'remove-allowlist', user_id: uid } });
        if (res.error || res.data?.error) { alert('Failed: ' + (res.error?.message || res.data?.error)); return; }
        loadIntelligence();
    } catch (e) { alert('Failed: ' + (e.message || e)); }
}

async function syncRealUsers() {
    const client = _nexusClient(); if (!client) return;
    if (!confirm('Import existing production behaviour (offers/sales/messages/saves/follows) for the allowlisted test users into the testing project?')) return;
    try {
        const res = await client.functions.invoke('nexus-sync', { body: { adminPassword: _currentPassword } });
        if (res.error || res.data?.error) { alert('Sync failed: ' + (res.error?.message || res.data?.error)); return; }
        const r = res.data || {};
        alert(`Sync complete: ${r.users || 0} users, ${r.events || 0} events imported.`);
        loadIntelligence();
    } catch (e) { alert('Sync failed: ' + (e.message || e)); }
}

async function trainRealUsers() {
    const client = _nexusClient(); if (!client) return;
    if (!confirm('Trigger Nexus training on the realuser dataset (runs in GitHub Actions, testing project only)? Results appear here in a few minutes.')) return;
    try {
        const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'train-realuser' } });
        if (res.error || res.data?.error) { alert('Train trigger failed: ' + (res.error?.message || res.data?.error)); return; }
        alert('Training started in GitHub Actions. Refresh in a few minutes to see results.');
    } catch (e) { alert('Train trigger failed: ' + (e.message || e)); }
}

async function resetRealUsers() {
    const client = _nexusClient(); if (!client) return;
    if (!confirm('Delete ALL realuser Nexus data (events, profiles, matches, recommendations, intelligence) from the testing project? The synthetic benchmark and production are NOT affected.')) return;
    try {
        const res = await client.functions.invoke('intel-admin', { body: { adminPassword: _currentPassword, action: 'reset-realusers' } });
        if (res.error || res.data?.error) { alert('Reset failed: ' + (res.error?.message || res.data?.error)); return; }
        loadIntelligence();
    } catch (e) { alert('Reset failed: ' + (e.message || e)); }
}
