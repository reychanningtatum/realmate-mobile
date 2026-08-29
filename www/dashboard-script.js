function toggleProfileMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profileMenuDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
}
document.addEventListener('click', (e) => {
    const btn = document.getElementById('profileMenuBtn');
    const dropdown = document.getElementById('profileMenuDropdown');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function toggleProfileMoreMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('profileMoreMenu');
    if (menu) menu.classList.toggle('open');
}
document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.profile-more-menu-wrap');
    const menu = document.getElementById('profileMoreMenu');
    if (menu && wrap && !wrap.contains(e.target)) {
        menu.classList.remove('open');
    }
});

function shareProfileLink(e) {
    if (e) e.preventDefault();
    const link = `${location.origin}${location.pathname}?user_id=${effectivelyViewingOtherProfile() ? _viewUserId : user.id}`;
    const link_el = e && e.currentTarget;
    const label = link_el ? link_el.querySelector('span') : null;
    navigator.clipboard.writeText(link).then(() => {
        if (label) {
            const original = label.textContent;
            label.textContent = 'Link copied!';
            setTimeout(() => { label.textContent = original; }, 1500);
        }
    }).catch(() => {});
}

// Reused by goToChat/shareProfileLink to know whether we're looking at someone else's profile
function effectivelyViewingOtherProfile() {
    return _isViewingOther && window._isViewingOther_override !== false;
}

// ── Report / Block this profile's owner (App Store Guideline 1.2) ──
// Wired to the profile "More options" menu; only shown when viewing another
// member (see the effectivelyViewingOther branch in the profile loader).
function rmbrReportProfile() {
    if (!window.RMBR || !_viewUserId) return;
    RMBR.openReport({ type: 'user', userId: _viewUserId, userName: (typeof user !== 'undefined' && user && user.name) || null });
}
async function rmbrBlockProfile() {
    if (!window.RMBR || !_viewUserId) return;
    const nm = (typeof user !== 'undefined' && user && user.name) || null;
    const ok = await RMBR.blockUser(_viewUserId, nm);
    // On success their content must disappear — leave the now-hidden profile.
    if (ok) location.href = 'home.html';
}

// Shown in place of Posts/Listings on a non-Realmate's profile, and (via
// listing-detail.html, which loads this same file) in place of a listing's
// full content. Reuses the existing handleAddMate button (mates.js) rather
// than a separate request flow.
function _realmateGateHtml(userName, kind) {
    const safeName = (userName || 'this user').replace(/'/g, "\\'");
    const state = _viewMateState?.status || 'none';
    const dir   = _viewMateState?.dir || null;

    // A request the current user already sent → a clear pending state, NOT another
    // "Add as Realmate" button. Matches the top button's "Request Sent".
    if (state === 'pending' && dir === 'sent') {
        return `
        <div class="profile-gate-card" data-gate-kind="${kind}">
            <div class="profile-gate-icon"><i class="fas fa-clock"></i></div>
            <div class="profile-gate-title">Request already sent</div>
            <div class="profile-gate-sub">You've already sent a realmate request to this user. You'll be notified once they accept.</div>
            <button class="btn-mate-profile mate-status-pending" disabled>
                <i class="fas fa-clock"></i> Request Sent
            </button>
        </div>`;
    }

    // A request THEY sent to us → offer to accept it, so the profile reflects the
    // real (incoming) status rather than a plain "add" prompt.
    if (state === 'pending' && dir === 'incoming') {
        return `
        <div class="profile-gate-card" data-gate-kind="${kind}">
            <div class="profile-gate-icon"><i class="fas fa-user-clock"></i></div>
            <div class="profile-gate-title">${safeName} wants to be your realmate</div>
            <div class="profile-gate-sub">Accept their request to connect and unlock their posts and listings.</div>
            <button class="btn-mate-profile mate-status-received" onclick="handleGateAcceptMate(this, '${safeName}')">
                <i class="fas fa-check"></i> Accept Request
            </button>
        </div>`;
    }

    // No request yet (or unresolved) → the standard Add action, wired so a
    // successful send flips every gate on the page into the pending state.
    const copy = kind === 'listing'
        ? { title: 'Become realmates to view this listing.', sub: 'Add this user as a realmate to access their property listings.' }
        : { title: 'Become realmates to view post, listings and about.', sub: 'Add this user as a realmate to access their posts, listings and about.' };
    return `
        <div class="profile-gate-card" data-gate-kind="${kind}">
            <div class="profile-gate-icon"><i class="fas fa-lock"></i></div>
            <div class="profile-gate-title">${copy.title}</div>
            <div class="profile-gate-sub">${copy.sub}</div>
            <button class="btn-mate-profile" onclick="handleGateAddMate(this, '${safeName}')">
                <i class="fas fa-user-plus"></i> Add as realmate
            </button>
        </div>`;
}

// Re-render every gate card on the page from the current _viewMateState. Called
// after a request is sent/accepted so the whole profile stays consistent without
// a full reload. Each card carries its kind in data-gate-kind.
function _refreshRealmateGates() {
    document.querySelectorAll('.profile-gate-card').forEach(card => {
        const kind = card.getAttribute('data-gate-kind') || 'posts-listings';
        card.outerHTML = _realmateGateHtml(user.name, kind);
    });
}

// Gate "Add as Realmate": send the request, then flip _viewMateState and every
// gate + the top mate button so the entire profile reflects the new status.
async function handleGateAddMate(btn, userName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const card = btn.closest('.profile-gate-card');
    const userImg = document.getElementById('profileImage')?.src || '';
    const result = (typeof sendMateRequest === 'function')
        ? await sendMateRequest(userName, userImg)
        : { success: false, error: 'unavailable' };

    if (result.success && result.accepted) {
        // They had already requested us → this became an accept. Now Realmates:
        // reload so the unlocked posts/listings render for real.
        _viewMateState = { status: 'accepted', dir: null };
        location.reload();
        return;
    }
    if (result.success) {
        _viewMateState = { status: 'pending', dir: 'sent' };
        _syncTopMateButton();
        _refreshRealmateGates();
        return;
    }
    // Failed — restore the Add button so the user can retry.
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Add as realmate';
    console.error('Realmate request failed:', result.error);
    if (card) (window.showToast || alert)('Could not send realmate request: ' + (result.error || 'Unknown error'), 'error');
}

// Gate "Accept Request": accept the incoming request, then reload so the now-
// unlocked profile renders in its connected state.
async function handleGateAcceptMate(btn, userName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = (typeof acceptMateRequest === 'function')
        ? await acceptMateRequest(userName)
        : { success: false };
    if (result.success) {
        _viewMateState = { status: 'accepted', dir: null };
        location.reload();
        return;
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Accept Request';
}

// Keep the top-of-profile mate button in sync with _viewMateState after an in-page
// status change (e.g. sending a request from a gate).
function _syncTopMateButton() {
    const el = document.getElementById('profileMateBtn');
    if (!el) return;
    const safeName = (user.name || 'this user').replace(/'/g, "\\'");
    const s = _viewMateState?.status, d = _viewMateState?.dir;
    if (s === 'accepted') {
        el.innerHTML = `<button class="btn-mate-profile mate-status-mates" onclick="handleRemoveMate(this,'${safeName}')"><i class="fas fa-user-group"></i> realmates</button>`;
    } else if (s === 'pending' && d === 'sent') {
        el.innerHTML = `<button class="btn-mate-profile mate-status-pending" disabled><i class="fas fa-clock"></i> Request Sent</button>`;
    } else if (s === 'pending' && d === 'incoming') {
        el.innerHTML = `<button class="btn-mate-profile mate-status-received" onclick="handleGateAcceptMate(this, '${safeName}')"><i class="fas fa-check"></i> Accept Request</button>`;
    } else {
        el.innerHTML = `<button class="btn-mate-profile" onclick="handleGateAddMate(this, '${safeName}')"><i class="fas fa-user-plus"></i> Add as realmate</button>`;
    }
}

async function goToChat(targetUserId, targetName) {
    sessionStorage.setItem('openChatWith', JSON.stringify({ userId: targetUserId, name: targetName }));
    location.href = 'chat.html';
}

// 🔥 SUPABASE SETUP
// supabaseUrl / supabaseKey are declared in livemarket.js, which dashboard.html
// now loads *before* this script (to reuse its Live Market post component in the
// Listings section). Re-declaring the same top-level `const`s here would be a
// fatal duplicate-declaration across the two classic scripts, so we rely on
// livemarket.js's identical values instead.
let _supabase = null;

try {
    _supabase = supabase.createClient(supabaseUrl, supabaseKey);
} catch(e) { console.log("Init Supabase Error", e); }

// 🔥 GLOBAL DATA
let user = JSON.parse(localStorage.getItem("user")) || {
    name: "Reychan Bernaldez",
    image: "https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32",
    job: "Real Estate Manager",
    division: "Alveo Land",
    group: "Echelon",
    team: "Sales Force",
    bio: "Full-stack developer and business entrepreneur."
};


// 🔥 DIVISION / GROUP DATA — single source of truth for the Edit Profile
// dependent dropdowns. DIVISIONS_LIST drives the Division dropdown (in this
// exact order); DIVISION_GROUPS maps each division to its valid groups.
// Divisions intentionally absent from DIVISION_GROUPS (ALISI, Kingsmen,
// Shared North Star, Shared One South, Team Bacolod, Highrisers,
// Groundbreakers) have no defined groups — the Group field hides for them.
const DIVISIONS_LIST = [
    "Apex", "Champions", "Dominators", "One Legacy", "Phoenix",
    "Premium BNG - Team Abby", "Premium BNG - Team Alvea", "Premium BNG - Team Carla", "Premium BNG - Team Mark",
    "Stratos", "The Elite", "The Luminaries", "The Royals", "Titans",
    "ALISI", "Kingsmen", "Shared North Star", "Shared One South", "Team Bacolod", "Highrisers", "Groundbreakers"
];

const DIVISION_GROUPS = {
    "Apex": ["Acme Supreme", "Avantis", "Imperium", "Infinitus", "Paramount", "Spire Dynasty", "Summit", "Vertex", "Zion", "Zenith", "All groups"],
    "Champions": ["Aureus", "Bravens", "Champions", "Conquistadors", "Excaliburs", "Jaegers", "Kings", "Maximus", "Primos", "All groups"],
    "Dominators": ["1Samurai", "Dominators", "Galaxians", "Maestros", "Magnates", "Olympians", "Pioneers", "Supremos", "Templars", "Southern Victors", "Ultimate Alliance", "All groups"],
    "One Legacy": ["One Echelon", "Altiora", "Ascendant", "All groups"],
    "Phoenix": ["Digital and Corporate Sales Group"],
    "Premium BNG - Team Abby": ["BNG - Team Abigail Fonte"],
    "Premium BNG - Team Alvea": ["BNG - Premium Office Sales"],
    "Premium BNG - Team Carla": ["BNG - Team Carla Dipasupil"],
    "Premium BNG - Team Mark": ["BNG - Team Mark Lapada"],
    "Stratos": ["Everest", "Falcons", "Fighter Typhoons", "Mavericks", "Nighthawk", "Raptors", "Sky Raiders", "Vipers", "All groups"],
    "The Elite": ["Avant Garde", "Generals", "Grand Sultans", "Grandeur", "Khalifa", "Rockefeller", "Vanderbilt Supreme", "All groups"],
    "The Luminaries": ["Alpha Blaze", "Borealis", "Celestial", "Fortis", "Ignis", "Lumos", "Polaris", "The Luminaries", "Valos", "All groups"],
    "The Royals": ["Archons", "Black Knights", "Excelsior", "Highborns", "Imperials Cebu", "Kingsguard", "Shogun", "Spartans", "The Royals", "Valors", "All groups"],
    "Titans": ["Atlas", "Juggernauts", "Leviathans", "Sentinels", "Vanguards", "All groups"]
};

// Back-compat: an earlier Edit Profile build stored the shortened "Luminaries"
// / "Royals" values (and an ambiguous shared "Premium BNG" value for all four
// Premium BNG teams). Normalize the two unambiguous ones so existing saved
// profiles still resolve to a valid division with defined groups.
const _DIVISION_ALIASES = { "Luminaries": "The Luminaries", "Royals": "The Royals" };
function normalizeDivision(div) { return _DIVISION_ALIASES[div] || div || ''; }

// 🔥 EDIT PROFILE FIELD OPTIONS (Address / Years / Languages)
// This is the full, explicitly user-verified list of official Philippine
// cities (142 entries) — it replaces an earlier, independently-researched
// version entirely, per an explicit "replace the list, don't merge" request.
// Checked programmatically before landing: zero duplicate entries, and
// sorted alphabetically (two adjacent pairs — Canlaon/Candon and Samal's
// placement — were swapped in the order as supplied; corrected here since
// alphabetical was the explicit intent, not a data change).
// Cities that share a bare name with another city or a province keep a
// disambiguating suffix: San Carlos, San Fernando, Naga, and Talisay each
// have two entries (different provinces). "San Jose" does NOT get the same
// treatment even though there are two (San Jose City, Nueva Ecija and San
// Jose, Occidental Mindoro) — left as supplied rather than guessing which
// one, or both, was intended; flagging this for a follow-up decision.
// This field is a strict combobox (see initSearchableSelect below): only an
// exact match from this list can be saved. A profile's previously-saved
// city that ISN'T on this list still displays exactly as saved when the
// modal opens (openEditModal shows a "reselect" hint instead of silently
// clearing it) — only an actual attempt to Save with that stale value
// still in the field is blocked, prompting a valid reselect.
const PH_CITIES = [
    'Alaminos', 'Angeles', 'Antipolo',
    'Bacolod', 'Bacoor', 'Bago', 'Baguio', 'Bais', 'Balanga', 'Batac', 'Batangas City', 'Bayawan', 'Baybay', 'Bayugan', 'Biñan', 'Bislig', 'Bogo', 'Borongan', 'Butuan',
    'Cabadbaran', 'Cabanatuan', 'Cabuyao', 'Cadiz', 'Cagayan de Oro', 'Calamba', 'Calapan', 'Calbayog', 'Caloocan', 'Candon', 'Canlaon', 'Carcar', 'Catbalogan', 'Cauayan City', 'Cavite City', 'Cebu City', 'Cotabato City',
    'Dagupan', 'Danao', 'Dapitan', 'Dasmariñas', 'Davao City', 'Digos', 'Dipolog', 'Dumaguete',
    'El Salvador', 'Escalante',
    'General Santos', 'General Trias', 'Gingoog', 'Guihulngan',
    'Himamaylan',
    'Ilagan', 'Iligan', 'Iloilo City', 'Imus', 'Iriga', 'Isabela City',
    'Kabankalan', 'Kidapawan', 'Koronadal',
    'La Carlota', 'Lamitan', 'Laoag', 'Lapu-Lapu', 'Las Piñas', 'Legazpi', 'Ligao', 'Lipa', 'Lucena',
    'Maasin', 'Mabalacat', 'Makati', 'Malabon', 'Malaybalay', 'Malolos', 'Mandaluyong', 'Mandaue', 'Manila', 'Marawi', 'Marikina', 'Masbate City', 'Mati', 'Meycauayan', 'Muntinlupa',
    'Naga (Camarines Sur)', 'Naga (Cebu)', 'Navotas',
    'Olongapo', 'Ormoc', 'Oroquieta', 'Ozamiz',
    'Pagadian', 'Palayan', 'Panabo', 'Parañaque', 'Pasay', 'Pasig', 'Passi City', 'Puerto Princesa',
    'Quezon City',
    'Roxas',
    'Sagay', 'Samal (Island Garden City of Samal)', 'San Carlos (Negros Occidental)', 'San Carlos (Pangasinan)', 'San Fernando (La Union)', 'San Fernando (Pampanga)', 'San Jose', 'San Jose del Monte', 'San Juan', 'San Pablo', 'Santa Rosa', 'Santiago City', 'Science City of Muñoz', 'Silay', 'Sipalay', 'Sorsogon', 'Surigao',
    'Tabaco', 'Tabuk', 'Tacloban', 'Tacurong', 'Tagaytay', 'Tagbilaran', 'Taguig', 'Tagum', 'Talisay (Cebu)', 'Talisay (Negros Occidental)', 'Tanauan', 'Tandag', 'Tangub', 'Tanjay', 'Tarlac City', 'Tayabas', 'Toledo', 'Tuguegarao',
    'Urdaneta City',
    'Valencia', 'Valenzuela', 'Victorias', 'Vigan',
    'Zamboanga City'
];

function showAddressLegacyHint() {
    const el = document.getElementById('addressLegacyHint');
    if (el) el.style.display = 'flex';
}
function hideAddressLegacyHint() {
    const el = document.getElementById('addressLegacyHint');
    if (el) el.style.display = 'none';
}

const LANGUAGES_LIST = [
    'English', 'Filipino', 'Tagalog', 'Cebuano', 'Ilocano', 'Hiligaynon', 'Bicolano', 'Kapampangan',
    'Pangasinan', 'Waray', 'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Spanish', 'French', 'German',
    'Italian', 'Portuguese', 'Arabic', 'Hindi', 'Thai', 'Vietnamese', 'Bahasa Indonesia', 'Malay',
    'Russian', 'Dutch', 'Turkish'
];

function populateYearsExperienceOptions() {
    const sel = document.getElementById('editYearsExperience');
    if (!sel) return;
    let html = '<option value="">Select years of experience</option>';
    for (let i = 0; i <= 50; i++) {
        html += `<option value="${i}">${i} ${i === 1 ? 'Year' : 'Years'}</option>`;
    }
    sel.innerHTML = html;
}

// Generic searchable single-select combobox (used for Address, Division,
// Group). Keeps the underlying <input>'s .value as the single source of
// truth, so saveProfile() / openEditModal() need zero changes for this field.
// `options` may be a static array, or a function returning the current array —
// the latter is for fields like Group whose valid list changes at runtime
// (based on the selected Division) without re-initializing the combobox.
// opts.onSelect(value) fires whenever the value is committed (item picked, or
// on blur once resolved). opts.strict, when true, clears any typed text on
// blur that doesn't exactly match one of the current options (used for
// Division and Group, since Group's value must always belong to the division).
function initSearchableSelect(inputId, dropdownId, options, opts) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    const { onSelect, strict, clearable } = opts || {};
    const getOptions = typeof options === 'function' ? options : () => options;
    let highlighted = -1;
    // The list actually on screen right now — click/Enter read from this
    // directly rather than recomputing filtered(), since open() and
    // openFull() don't necessarily render the same list the current input
    // text would filter to (see openFull below).
    let shownList = [];

    function filtered() {
        const q = input.value.trim().toLowerCase();
        const list = getOptions();
        return q ? list.filter(o => o.toLowerCase().includes(q)) : list;
    }
    function render(list) {
        shownList = list;
        // Optional "Clear selection" row (Division/Group are optional and must be
        // returnable to an empty state, #13). Shown only when a value is set.
        const clearRow = (clearable && input.value.trim())
            ? '<div class="searchable-dropdown-clear" data-clear="1"><i class="fas fa-xmark"></i> Clear selection</div>' : '';
        dropdown.innerHTML = clearRow + (list.length
            ? list.map((item, i) => `<div class="searchable-dropdown-item" data-idx="${i}">${item}</div>`).join('')
            : '<div class="searchable-dropdown-empty">No matches found</div>');
        highlighted = -1;
    }
    function open() { render(filtered()); dropdown.classList.add('open'); }
    // Used by focus/click (not by typing): shows every option rather than
    // filtering by whatever text a previous selection left behind, so
    // reopening after a value is already chosen still lets the user pick a
    // different one directly — standard combobox behavior. Also selects the
    // existing text so the very next keystroke replaces it instead of
    // appending to it.
    function openFull() { render(getOptions()); dropdown.classList.add('open'); input.select(); }
    function close() { dropdown.classList.remove('open'); }
    function highlight(items, idx) {
        items.forEach((el, i) => el.classList.toggle('highlighted', i === idx));
        items[idx]?.scrollIntoView({ block: 'nearest' });
    }
    function commit(value) {
        input.value = value;
        close();
        onSelect && onSelect(value);
    }

    input.addEventListener('focus', openFull);
    // 'focus' only fires on focus *gain* — once a value is committed the
    // input stays focused, so a second click (without blurring elsewhere
    // first) fired no event at all and the dropdown stayed shut, forcing
    // users to clear the text to get an 'input' event instead. A combobox
    // must reopen on every click regardless of prior focus state.
    input.addEventListener('click', openFull);
    input.addEventListener('input', open);
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.searchable-dropdown-item');
        if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, items.length - 1); highlight(items, highlighted); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0); highlight(items, highlighted); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted >= 0 && shownList[highlighted]) commit(shownList[highlighted]);
        } else if (e.key === 'Escape') { close(); }
    });
    dropdown.addEventListener('mousedown', (e) => {
        if (e.target.closest('.searchable-dropdown-clear')) { e.preventDefault(); commit(''); return; }
        const item = e.target.closest('.searchable-dropdown-item');
        if (!item) return;
        commit(shownList[parseInt(item.dataset.idx, 10)]);
    });
    if (strict) {
        input.addEventListener('blur', () => {
            if (!getOptions().includes(input.value.trim())) commit('');
        });
    }
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) close();
    });
}

// Multi-select tag input (Languages). Selected values live in _selectedLanguages;
// saveProfile() reads that array directly, openEditModal() re-parses user.languages
// (a comma-separated string) into it each time the modal opens.
let _selectedLanguages = [];

function renderLanguageChips() {
    const wrap = document.getElementById('languagesChips');
    if (!wrap) return;
    wrap.innerHTML = _selectedLanguages.map(lang => `
        <span class="lang-chip">${lang}<button type="button" onclick="removeLanguageChip('${lang.replace(/'/g, "\\'")}')" aria-label="Remove ${lang}">&times;</button></span>
    `).join('');
}

function addLanguageChip(lang) {
    if (!lang || _selectedLanguages.includes(lang)) return;
    _selectedLanguages.push(lang);
    renderLanguageChips();
    const input = document.getElementById('editLanguages');
    if (input) { input.value = ''; input.focus(); }
}

function removeLanguageChip(lang) {
    _selectedLanguages = _selectedLanguages.filter(l => l !== lang);
    renderLanguageChips();
}

function initLanguagesSelect() {
    const input = document.getElementById('editLanguages');
    const dropdown = document.getElementById('languagesDropdown');
    const chipsWrap = document.getElementById('languagesChips');
    if (!input || !dropdown) return;
    let highlighted = -1;

    function available() { return LANGUAGES_LIST.filter(l => !_selectedLanguages.includes(l)); }
    function filtered() {
        const q = input.value.trim().toLowerCase();
        const avail = available();
        return q ? avail.filter(o => o.toLowerCase().includes(q)) : avail;
    }
    function render(list) {
        dropdown.innerHTML = list.length
            ? list.map((item, i) => `<div class="searchable-dropdown-item" data-idx="${i}">${item}</div>`).join('')
            : '<div class="searchable-dropdown-empty">No matches found</div>';
        highlighted = -1;
    }
    function open() { render(filtered()); dropdown.classList.add('open'); }
    function close() { dropdown.classList.remove('open'); }
    function highlight(items, idx) {
        items.forEach((el, i) => el.classList.toggle('highlighted', i === idx));
        items[idx]?.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', open);
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.searchable-dropdown-item');
        if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, items.length - 1); highlight(items, highlighted); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0); highlight(items, highlighted); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const list = filtered();
            if (highlighted >= 0 && list[highlighted]) { addLanguageChip(list[highlighted]); open(); }
        } else if (e.key === 'Backspace' && !input.value && _selectedLanguages.length) {
            removeLanguageChip(_selectedLanguages[_selectedLanguages.length - 1]);
        } else if (e.key === 'Escape') { close(); }
    });
    dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.searchable-dropdown-item');
        if (!item) return;
        const list = filtered();
        addLanguageChip(list[parseInt(item.dataset.idx, 10)]);
        open();
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target) && !(chipsWrap && chipsWrap.contains(e.target))) close();
    });
}

populateYearsExperienceOptions();
initSearchableSelect('editAddress', 'addressDropdown', PH_CITIES, { strict: true, onSelect: () => hideAddressLegacyHint() });
// Wrapped (not passed directly) so the newly-committed Division value isn't
// forwarded as syncGroupField's desiredValue argument — that was silently
// re-selecting any group whose name matched the division (e.g. Dominators).
initSearchableSelect('editDivision', 'divisionDropdown', DIVISIONS_LIST, { onSelect: () => syncGroupField(), strict: true, clearable: true });
// Group's valid list changes with the selected Division, so its options are
// read lazily from _currentGroupOptions (kept in sync by syncGroupField())
// rather than passed in once at init time.
let _currentGroupOptions = [];
initSearchableSelect('editGroup', 'groupDropdown', () => _currentGroupOptions, { strict: true, clearable: true });
initLanguagesSelect();

// Single function driving the Group field's state — called whenever Division
// changes, and once on modal open. Three states:
//   1. No division selected            -> disabled, "Select a Division first"
//   2. Division selected, no groups     -> disabled, "No groups available."
//   3. Division selected, has groups    -> enabled, searchable against that
//      division's list; any previously selected group not in the new list is
//      cleared automatically.
function syncGroupField(desiredValue) {
    const groupField = document.getElementById('groupField');
    const groupInput = document.getElementById('editGroup');
    if (!groupField || !groupInput) return;

    groupField.style.display = '';

    const division = normalizeDivision(document.getElementById('editDivision')?.value.trim());
    const groups = division ? DIVISION_GROUPS[division] : null;

    if (!division) {
        _currentGroupOptions = [];
        groupInput.value = '';
        groupInput.disabled = true;
        groupInput.placeholder = 'Select a Division first';
        return;
    }
    if (!groups || !groups.length) {
        _currentGroupOptions = [];
        groupInput.value = '';
        groupInput.disabled = true;
        groupInput.placeholder = 'No groups available.';
        return;
    }

    // desiredValue is only supplied by openEditModal() to restore an already-
    // saved Group when the modal first opens. Any other call (the user
    // picking a Division interactively) omits it, and Group must always
    // reset to unselected — never inherit whatever text happens to still be
    // sitting in the box (e.g. an uncommitted search match left over from
    // before the Division changed).
    const previousValue = desiredValue !== undefined ? desiredValue : '';
    _currentGroupOptions = groups;
    groupInput.disabled = false;
    groupInput.placeholder = 'Select your group';
    // Keep the previous group only if it's still valid for the newly selected division.
    groupInput.value = groups.includes(previousValue) ? previousValue : '';
}

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current the moment it was
// generated, so storing it and reusing it verbatim after a rename shows the
// old initials forever (that's the exact bug: a profile whose name changed
// from "Jalen Brunson" to something else, but never uploaded a real photo,
// keeps a permanently-stored avatar_url requesting "JB" from ui-avatars).
// The fix is to never trust a stored placeholder as-is: detect it and
// regenerate fresh from the CURRENT name every time, at both load and save.
// A genuine upload (Supabase Storage URL) is always used as-is, untouched.
function _isGeneratedAvatarUrl(url) {
    return !url || url.includes('ui-avatars.com');
}
function _avatarUrlFor(name, storedUrl) {
    return _isGeneratedAvatarUrl(storedUrl)
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'R')}&background=0f172a&color=32cd32`
        : storedUrl;
}


function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// Mobile profile tabs (below the composer): show one of Posts / Recent Listings /
// Realmates at a time. Desktop ignores this — the tabs are hidden and all three
// panels always show in their own columns.
function switchProfileTab(tab) {
    document.querySelectorAll('.profile-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.profile-tab-panel').forEach(p =>
        p.classList.toggle('tab-active', p.dataset.tabPanel === tab));
    // The About panel's read-more button is measured via scrollHeight, which is
    // always 0 while the panel is display:none — re-measure now that it's visible.
    if (tab === 'about') updateBioReadMoreVisibility();
}

// Portal's "View Listings" opens this dashboard with ?view=listings so the
// visitor lands on the Listings section instead of the top of the profile.
// Both mobile and desktop are tabbed now (desktop tabs Posts / Listings in the
// main column), so activate the Listings tab first on either layout, then scroll.
function _deepLinkToListings() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'listings') return;

    const card = document.querySelector('.listings-card');
    // Realmates-only listings on another member's profile are hidden entirely —
    // nothing to scroll to, so leave the visitor at the top of the profile.
    if (!card || card.style.display === 'none') return;

    switchProfileTab('listings');

    // Land on the user's TOPMOST (latest) listing, not a generic position (#10).
    // Wait for the tab switch / listing cards to lay out before measuring, and
    // re-run once more after layout settles (images/cards can reflow late).
    const scrollToTop = () => {
        const target = card.querySelector('.listing-card') || card;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    requestAnimationFrame(scrollToTop);
    setTimeout(scrollToTop, 250);

    // Drop the flag so a later refresh or back-navigation stays put.
    params.delete('view');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function toggleBioExpand() {
    const bio = document.getElementById('bioDisplay');
    const btn = document.getElementById('bioReadMoreBtn');
    if (!bio || !btn) return;
    const isOpen = bio.classList.toggle('expanded');
    btn.classList.toggle('is-open', isOpen);
    btn.innerHTML = isOpen
        ? 'Show less <i class="fas fa-chevron-down"></i>'
        : 'Read more <i class="fas fa-chevron-down"></i>';
}

// Show the Read More toggle only if the bio actually overflows 4 lines
function updateBioReadMoreVisibility() {
    const bio = document.getElementById('bioDisplay');
    const btn = document.getElementById('bioReadMoreBtn');
    if (!bio || !btn) return;
    bio.classList.remove('expanded');
    btn.classList.remove('is-open');
    btn.innerHTML = 'Read more <i class="fas fa-chevron-down"></i>';
    requestAnimationFrame(() => {
        btn.style.display = bio.scrollHeight > bio.clientHeight + 2 ? 'inline-flex' : 'none';
    });
}

// Green online dot on the avatar — only for genuinely recent activity, and only
// if the user hasn't opted out via the existing show_active_status privacy toggle.
function renderOnlineStatus() {
    const dot = document.getElementById('onlineStatusDot');
    if (!dot) return;
    if (!user.showActiveStatus || !user.lastSeen) {
        dot.style.display = 'none';
        return;
    }
    const minutesAgo = (Date.now() - new Date(user.lastSeen)) / 60000;
    dot.style.display = minutesAgo <= 5 ? 'block' : 'none';
}

function _escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Shared mobile-viewport check — used everywhere the mobile Profile header
// needs to diverge structurally from desktop (not just via CSS), e.g.
// removing/relocating DOM nodes rather than hiding them.
function _isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

// Mobile: shrink the name's font-size just enough to keep it on one line,
// rather than relying on a single guessed px value in CSS (which can't
// account for every real name length or exact device width). Measures the
// *actual rendered element* (scrollWidth with white-space temporarily
// forced to nowrap, vs. the column's real clientWidth) rather than an
// off-DOM canvas context — canvas measurement was tried first but proved
// unreliable here because it can silently fall back to a substitute font
// if the real web font (Playfair Display) hasn't finished loading yet at
// the moment of measurement, under-shrinking the size. Reading the live
// element's own geometry uses whatever font is *actually* painted, so
// there's no separate font-loading state to get out of sync with.
// Desktop is untouched: this only runs under the mobile check, and never
// sets an inline style there.
const NAME_FONT_MAX = 21;   // CSS default / upper bound — matches the mobile stylesheet rule
const NAME_FONT_MIN = 15;   // floor — below this, wrapping (not truncation) takes over instead

function _autoFitNameFontSize() {
    const nameEl = document.getElementById('nameDisplay');
    const colEl = document.querySelector('.profile-name-line');
    if (!nameEl || !colEl || !_isMobileViewport()) return;
    if (!user.name) return;

    const originalWhiteSpace = nameEl.style.whiteSpace;
    nameEl.style.whiteSpace = 'nowrap'; // so scrollWidth reflects the natural one-line width, not a wrapped height

    let size = NAME_FONT_MAX;
    nameEl.style.setProperty('font-size', size + 'px', 'important');
    while (size > NAME_FONT_MIN && nameEl.scrollWidth > colEl.clientWidth) {
        size -= 0.5;
        nameEl.style.setProperty('font-size', size + 'px', 'important');
    }

    nameEl.style.whiteSpace = originalWhiteSpace; // restore CSS's white-space:normal so wrapping is still the last-resort fallback below NAME_FONT_MIN
}

// Mobile: keep the metadata row (Location / Years / Languages) on one
// line — same rationale and technique as _autoFitNameFontSize above: a
// single guessed font/icon/gap size in CSS can't account for every real
// combination of location name + years + language list length. Measures
// the row's natural (unwrapped) width against the actual available column
// width, and shrinks font-size, icon-size, and the gap between items
// together (in that priority) until it fits or hits a legibility floor —
// beyond which flex-wrap is restored, so wrapping remains the fallback for
// genuinely extreme combinations rather than truncating or clipping.
// Desktop is untouched: gated behind _isMobileViewport(), never touches
// inline styles there.
// Ceiling raised slightly (12.5→13.5 / 12→13) for readability — the floor
// values are intentionally left unchanged, since they were tuned to the
// minimum needed to keep the worst realistic content combination (a long
// location + "N Years in Real Estate" + a multi-language list) on one line
// at narrow mobile widths; raising the floor too would risk reintroducing
// wrapping for that same content.
const META_FONT_MAX = 13.5, META_FONT_MIN = 9;      // matches the mobile stylesheet rule
const META_ICON_MAX = 13,   META_ICON_MIN = 8.5;
const META_GAP_MAX   = 12,   META_GAP_MIN  = 4;      // gap *between* Location/Years/Languages
const META_ITEM_GAP_MAX = 6, META_ITEM_GAP_MIN = 3;  // gap *inside* each item, between its icon and text

function _autoFitMetadataRow() {
    const row = document.querySelector('.profile-subline-row');
    const gridEl = document.querySelector('.profile-header-row');
    if (!row || !gridEl || !_isMobileViewport()) return;

    const items = Array.from(row.querySelectorAll('.profile-subline-item'))
        .filter(el => getComputedStyle(el).display !== 'none');
    if (!items.length) return;
    const icons = items.map(el => el.querySelector('i')).filter(Boolean);

    // Measure the *grid container* (.profile-header-row), not the row
    // itself. Two bugs were found here, in order:
    // 1) Originally measured against .profile-name-line (grid-column: 1
    //    only) — narrower than this row's real grid-column: 1/-1 span,
    //    which under-measured and over-shrank the text unnecessarily.
    // 2) Switching to the row's *own* box seemed like the fix, but grid
    //    items default to min-width:auto — forcing flex-wrap:nowrap on a
    //    grid item can silently grow its own track to fit the content
    //    instead of overflowing it, making scrollWidth == clientWidth
    //    *even when it doesn't actually fit*, so no shrinking ever
    //    triggered. The grid *container* has no such self-inflation
    //    problem — it's sized by its own parent (.profile-card-body),
    //    independent of what a spanning child inside it does.
    const availableWidth = gridEl.getBoundingClientRect().width;

    // Two more measurement traps, found by tracing through why a fresh
    // ceiling raise had zero visible effect:
    // 3) The site-wide `* { transition: all 0.25s }` rule (dashboard-
    //    style.css) meant a style change followed by an immediate
    //    getComputedStyle/geometry read could still reflect the *pre*-
    //    change value — transitions are keyed off a style recalculation
    //    that hasn't necessarily happened yet at that point in the same
    //    synchronous task. Disabling transitions on these elements first
    //    (and forcing a reflow) makes every read-after-write in this
    //    function reflect the value that was actually just set.
    // 4) .profile-subline-item is a flex *item* of this row with the
    //    default flex-shrink:1 — under flex-wrap:nowrap, instead of the
    //    row overflowing (which scrollWidth would catch), the items
    //    themselves shrank and their text wrapped *inside* each item,
    //    so the row's scrollWidth never exceeded its own box and no
    //    shrinking was ever triggered even though it clearly didn't fit.
    //    flex-shrink:0 here forces genuine overflow instead.
    const allEls = [row, ...items, ...icons];
    const originalTransitions = allEls.map(el => el.style.transition);
    allEls.forEach(el => { el.style.transition = 'none'; });
    const originalShrinks = items.map(el => el.style.flexShrink);
    items.forEach(el => { el.style.flexShrink = '0'; });
    void row.offsetHeight; // force layout to flush before any measurement

    const originalWrap = row.style.flexWrap;
    row.style.flexWrap = 'nowrap'; // so scrollWidth reflects the natural one-line width

    let fontSize = META_FONT_MAX, iconSize = META_ICON_MAX, gap = META_GAP_MAX, itemGap = META_ITEM_GAP_MAX;

    const apply = () => {
        items.forEach(el => { el.style.fontSize = fontSize + 'px'; el.style.gap = itemGap + 'px'; });
        icons.forEach(el => el.style.fontSize = iconSize + 'px');
        row.style.columnGap = gap + 'px';
        void row.offsetHeight; // force reflow so the next scrollWidth read is accurate
    };
    apply();

    while (row.scrollWidth > availableWidth &&
           (fontSize > META_FONT_MIN || iconSize > META_ICON_MIN || gap > META_GAP_MIN || itemGap > META_ITEM_GAP_MIN)) {
        if (fontSize > META_FONT_MIN) fontSize -= 0.5;
        if (iconSize > META_ICON_MIN) iconSize -= 0.5;
        if (gap > META_GAP_MIN) gap -= 1;
        if (itemGap > META_ITEM_GAP_MIN) itemGap -= 0.5;
        apply();
    }

    items.forEach((el, i) => { el.style.flexShrink = originalShrinks[i]; });
    allEls.forEach((el, i) => { el.style.transition = originalTransitions[i]; });

    row.style.flexWrap = originalWrap; // restore CSS's flex-wrap:wrap so wrapping is still the last-resort fallback below the floor
}

function _autoFitHeaderText() {
    _autoFitNameFontSize();
    _autoFitMetadataRow();
}

// Mobile: Edit Profile is only reachable from the "···" menu — the
// standalone header button is removed from the DOM entirely (not just
// CSS-hidden), per explicit design request. Desktop keeps it as the
// original inline-flex pill button in .profile-action-col.
//
// This used to run once, inline, inside loadProfile() — decided at
// initial page load and never revisited. Since removing (rather than
// CSS-hiding) the node means there's nothing left to re-show on a later
// resize back to desktop, that one-time decision is exactly what caused
// switching viewport size in DevTools to leave the button stuck in a
// stale position/state until a full page reload re-ran loadProfile() at
// the new width. Pulled out into its own function so it can also run
// from the resize listener below — the detached node (not a rebuilt
// clone) is stashed and reinserted, so its onclick handler and any state
// survive round-tripping across the breakpoint either direction. Guarded
// by effectivelyViewingOtherProfile() so it never touches the button
// while viewing someone else's profile — this button doesn't exist in
// that view (profileMessageBtn takes its place there).
let _detachedEditProfileBtn = null;

function _applyEditProfileButtonVisibility() {
    if (effectivelyViewingOtherProfile()) return;
    const col = document.querySelector('.profile-action-col');
    if (!col) return;
    let editBtn = document.getElementById('editProfileActionBtn');

    if (_isMobileViewport()) {
        if (editBtn) {
            _detachedEditProfileBtn = editBtn;
            editBtn.remove();
        }
    } else {
        if (!editBtn && _detachedEditProfileBtn) {
            col.prepend(_detachedEditProfileBtn);
            _detachedEditProfileBtn = null;
            editBtn = document.getElementById('editProfileActionBtn');
        }
        if (editBtn) editBtn.style.display = 'inline-flex';
    }
}

// Re-fit on resize/rotation, debounced — the measured column width (and
// which breakpoint we're in) can change without a full page reload, e.g.
// rotating a phone or resizing the viewport in DevTools.
let _nameFitResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_nameFitResizeTimer);
    _nameFitResizeTimer = setTimeout(() => {
        _autoFitHeaderText();
        _applyEditProfileButtonVisibility();
    }, 150);
});

// Extra correction pass once web fonts finish loading — if the very first
// fit ran before Playfair Display/Inter was ready, the elements briefly
// rendered (and were measured) in a fallback font; once the real font
// swaps in (FOUT), the previously-fitted sizes can be stale. Re-fitting
// here catches that without needing to guess whether fonts were ready in
// time.
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(_autoFitHeaderText);
}

// UI ENGINE
function updateUI() {
    // Guard Clause: Stops the script if on a page without nameDisplay (like forum.html)
    if(!document.getElementById("nameDisplay")) return;

    document.getElementById("profileImage").src = user.image;

    // Cover photo
    const coverImg = document.getElementById('coverImage');
    const coverPlaceholder = document.getElementById('coverPlaceholder');
    if (coverImg && user.coverUrl) {
        coverImg.src = user.coverUrl;
        coverImg.style.display = 'block';
        if (coverPlaceholder) coverPlaceholder.style.display = 'none';
    } else if (coverImg) {
        coverImg.style.display = 'none';
        if (coverPlaceholder) coverPlaceholder.style.display = 'flex';
    }
    document.getElementById("nameDisplay").innerHTML = user.nickname
        ? `${_escapeHtml(user.name)} <span class="profile-nickname">(${_escapeHtml(user.nickname)})</span>`
        : _escapeHtml(user.name);
    _autoFitNameFontSize();

    // Mobile: nickname moves to its own line below the name, quoted (e.g.
    // "Eris") instead of the inline "(Nickname)" span above, which is
    // hidden via CSS on mobile so it doesn't render twice. Desktop is
    // untouched — this line stays hidden there and the inline
    // parenthesized version above remains the only one shown.
    // @handle line — derived from nickname, else first name (mockup shows "@chan").
    // This replaces the old quoted mobile nickname line, which is now kept hidden.
    const handleLine = document.getElementById('handleLine');
    const handleDisplay = document.getElementById('handleDisplay');
    if (handleLine && handleDisplay) {
        const rawHandle = (user.username || user.nickname || (user.name || '').split(' ')[0] || '').trim();
        const handle = rawHandle.toLowerCase().replace(/[^a-z0-9._]/g, '');
        if (handle) {
            handleDisplay.textContent = '@' + handle;
            handleLine.style.display = 'block';
        } else {
            handleLine.style.display = 'none';
        }
    }

    const nicknameLine = document.getElementById('nicknameLine');
    if (nicknameLine) nicknameLine.style.display = 'none';

    // Update menu avatar with profile photo or initial
    const menuAvatar = document.getElementById('profileMenuAvatar');
    if (menuAvatar) {
        if (user.image) {
            menuAvatar.innerHTML = '';
            menuAvatar.style.backgroundImage = `url('${user.image}')`;
            menuAvatar.style.backgroundSize = 'cover';
            menuAvatar.style.backgroundPosition = 'center';
            menuAvatar.style.background = `url('${user.image}') center/cover no-repeat`;
        } else {
            menuAvatar.style.background = '#32cd32';
            menuAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
        }
    }
    // Division / Group render as green pill badges — hide a pill when its value is empty.
    document.getElementById("divisionDisplay").innerText = user.division || '';
    document.getElementById("groupDisplay").innerText = user.group || '';
    const _divPill = document.getElementById('divisionPill');
    const _grpPill = document.getElementById('groupPill');
    if (_divPill) _divPill.style.display = user.division ? 'inline-flex' : 'none';
    if (_grpPill) _grpPill.style.display = user.group ? 'inline-flex' : 'none';
    document.getElementById("bioDisplay").innerText = user.bio;
    const _hasBio = !!(user.bio && user.bio.trim());
    const _aboutEmpty = document.getElementById('aboutEmptyState');
    if (_aboutEmpty) _aboutEmpty.style.display = _hasBio ? 'none' : 'block';

    // Verified badge
    const verifiedBadge = document.getElementById('verifiedBadge');
    if (verifiedBadge) verifiedBadge.style.display = user.isVerified ? 'inline-block' : 'none';

    // Location line
    const locationLine = document.getElementById('locationLine');
    const locationDisplay = document.getElementById('locationDisplay');
    if (locationLine && locationDisplay) {
        if (user.location) {
            locationDisplay.innerText = user.location;
            locationLine.style.display = 'inline-flex';
        } else {
            locationLine.style.display = 'none';
        }
    }

    // Years of experience line
    const yearsLine = document.getElementById('yearsLine');
    const yearsDisplay = document.getElementById('yearsDisplay');
    if (yearsLine && yearsDisplay) {
        if (user.yearsExperience) {
            yearsDisplay.innerText = `${user.yearsExperience} Years in Real Estate`;
            yearsLine.style.display = 'inline-flex';
        } else {
            yearsLine.style.display = 'none';
        }
    }

    // Languages line — shown in the header subline on both desktop and
    // mobile (mobile groups it with Location/Years on one metadata row).
    const languagesLine = document.getElementById('languagesLine');
    const languagesDisplay = document.getElementById('languagesDisplay');
    if (languagesLine && languagesDisplay) {
        if (user.languages) {
            languagesDisplay.innerText = user.languages;
            languagesLine.style.display = 'inline-flex';
        } else {
            languagesLine.style.display = 'none';
        }
    }

    // Relationship status line
    const relationshipLine = document.getElementById('relationshipLine');
    const relationshipDisplay = document.getElementById('relationshipDisplay');
    if (relationshipLine && relationshipDisplay) {
        if (user.relationship) {
            relationshipDisplay.innerText = user.relationship;
            relationshipLine.style.display = 'inline-flex';
        } else {
            relationshipLine.style.display = 'none';
        }
    }
    _autoFitMetadataRow();

    // Bio preview (truncated teaser — full bio still lives in the About card's #bioDisplay)
    const bioPreview = document.getElementById('bioPreview');
    if (bioPreview) {
        if (user.bio && user.bio.trim()) {
            bioPreview.innerText = user.bio;
            bioPreview.style.display = '-webkit-box';
        } else {
            bioPreview.style.display = 'none';
        }
    }

    updateBioReadMoreVisibility();
    renderOnlineStatus();

    // Keep the bottom-nav "Me" avatar in sync with profile changes (e.g. a new
    // photo) without a page reload. loadNavAvatar re-renders when the stored
    // image differs from what's currently painted.
    if (typeof loadNavAvatar === 'function') loadNavAvatar();
}

// Check if viewing another user's profile via ?user_id=
const _viewUserId = new URLSearchParams(window.location.search).get('user_id');
const _isViewingOther = !!_viewUserId;

// The current Realmate-request relationship with the profile being viewed, resolved
// once when the mate button renders and reused by every gated section so the whole
// profile reflects the SAME status. Shape: { status:'none'|'pending'|'accepted',
// dir:'sent'|'incoming'|null }. Null until resolved → treated as 'none' (fail-open
// to the Add action).
let _viewMateState = null;

// #5: when a Realmate is removed (here or in another shell tab), if we're viewing
// THAT ex-Realmate's profile, re-run loadProfile so posts/listings/About re-gate
// to the new non-Realmate access — no manual refresh.
function _onMateRemovedRegate(name) {
    try {
        if (name && _isViewingOther && typeof user !== 'undefined' && user && user.name === name
            && typeof loadProfile === 'function') {
            loadProfile();
        }
    } catch (e) {}
}
window.addEventListener('rm:mate_removed', function (e) { _onMateRemovedRegate(e.detail && e.detail.name); });
window.addEventListener('storage', function (e) {
    if (e.key === 'rm_mate_removed' && e.newValue) { try { _onMateRemovedRegate(JSON.parse(e.newValue).name); } catch (_) {} }
});

async function loadProfile() {
    if (_supabase) {
        try {
            const _authUser = (await _supabase.auth.getUser()).data.user;
            const myAuthId = _authUser?.id;

            // UGC safety (App Store Guideline 1.2): a blocked user's profile cannot
            // be viewed. Wait for RMBR's block list, then bounce back to the feed.
            // Undo is Settings-only, so we do NOT offer an unblock here.
            if (_viewUserId && _viewUserId !== myAuthId && window.RMBR) {
                if (!RMBR.ready) { await new Promise(r => { const f = () => r(); document.addEventListener('rmbr:ready', f, { once: true }); setTimeout(f, 1500); }); }
                if (RMBR.isBlocked(_viewUserId, null)) {
                    if (typeof showToast === 'function') showToast('You blocked this user. Unblock in Settings to view their profile.');
                    location.replace('home.html');
                    return;
                }
            }

            // If the URL param is the current user's own ID, strip it and load normally
            if (_isViewingOther && _viewUserId === myAuthId) {
                history.replaceState(null, '', 'dashboard.html');
                window._isViewingOther_override = false;
            }

            const effectivelyViewingOther = _isViewingOther && _viewUserId !== myAuthId;
            const targetId = effectivelyViewingOther ? _viewUserId : myAuthId;

            if (targetId) {
                const { data: profiles, error: profErr } = await _supabase.from('profiles').select('*').eq('id', targetId);
                if (profErr) console.error('[loadProfile] profiles query error:', profErr.message);

                if (profiles && profiles.length > 0) {
                    const profile = profiles[0];
                    if (effectivelyViewingOther) {
                        user = {
                            id: targetId,
                            name: profile.full_name || 'realmate Member',
                            username: profile.username || '',
                            nickname: profile.nickname || '',
                            image: _avatarUrlFor(profile.full_name, profile.avatar_url),
                            imageOriginal: profile.avatar_original_url || profile.avatar_url || '',
                            job: profile.job_title || '',
                            division: profile.division || '',
                            group: profile.business_group || '',
                            team: profile.team_name || '',
                            bio: profile.bio || '',
                            relationship: profile.relationship_status || '',
                            coverUrl: profile.cover_url || '',
                            location: profile.location || '',
                            isVerified: !!profile.is_verified,
                            lastSeen: profile.last_seen || '',
                            showActiveStatus: profile.show_active_status !== false,
                            yearsExperience: profile.years_experience || '',
                            languages: profile.languages || ''
                        };
                    } else {
                        user = {
                            id: targetId,
                            name: profile.full_name || user.name,
                            username: profile.username || _authUser?.user_metadata?.username || user.username || '',
                            nickname: profile.nickname || '',
                            image: _avatarUrlFor(profile.full_name || user.name, profile.avatar_url),
                            imageOriginal: profile.avatar_original_url || profile.avatar_url || user.image,
                            // Unlike the other fields here, this deliberately does NOT
                            // fall back to the previously-cached user.job: position is
                            // admin-managed now, and falling back to a stale in-memory/
                            // localStorage value would let an admin-cleared position
                            // reappear until the next full logout/login.
                            job: profile.job_title || '',
                            division: profile.division || user.division,
                            group: profile.business_group || user.group,
                            team: profile.team_name || user.team,
                            bio: profile.bio || user.bio,
                            relationship: profile.relationship_status || '',
                            coverUrl: profile.cover_url || '',
                            location: profile.location || user.location || '',
                            isVerified: !!profile.is_verified,
                            lastSeen: profile.last_seen || '',
                            showActiveStatus: profile.show_active_status !== false,
                            yearsExperience: profile.years_experience || user.yearsExperience || '',
                            languages: profile.languages || user.languages || ''
                        };
                        localStorage.setItem("user", JSON.stringify(user));
                    }
                } else if (effectivelyViewingOther) {
                    // Profile row missing — show blank rather than current user's data
                    user = {
                        id: targetId,
                        name: 'realmate Member',
                        nickname: '',
                        image: `https://ui-avatars.com/api/?name=R&background=0f172a&color=32cd32`,
                        job: '', division: '', group: '', team: '', bio: '', relationship: '',
                        location: '', isVerified: false,
                        lastSeen: '', showActiveStatus: true,
                        yearsExperience: '', languages: ''
                    };
                    console.warn('[loadProfile] No profile row found for user_id:', targetId);
                }
            }
        } catch (e) { console.log("Cloud sync error", e); }
    }

    const effectivelyViewingOther = _isViewingOther && window._isViewingOther_override !== false;

    // Hide edit/post controls when viewing someone else's profile
    if (effectivelyViewingOther) {
        document.querySelectorAll('.edit-only, .post-controls, #postForm, #editProfileBtn, .menu-dots')
            .forEach(el => el && (el.style.display = 'none'));
        const backBtn = document.getElementById('viewingOtherBanner');
        if (backBtn) backBtn.style.display = 'flex';
    }

    updateUI();

    // Recent Listings is Realmates-only when viewing someone else's profile;
    // defaults to false (hidden) for that case unless proven otherwise below,
    // so a failed/partial lookup fails closed rather than leaking listings.
    let viewerIsRealmate = !effectivelyViewingOther;

    // Render Add as Mate / Realmates button when viewing another user
    if (effectivelyViewingOther) {
        const mateBtnEl = document.getElementById('profileMateBtn');
        if (mateBtnEl && _supabase) {
            try {
                const { data: authData } = await _supabase.auth.getUser();
                const myId = authData?.user?.id;
                const myName = JSON.parse(localStorage.getItem('user'))?.name || '';
                // Check by user_id first, fall back to name-based lookup
                let { data: mateRows } = await _supabase
                    .from('mates')
                    .select('status, requester_id, recipient_id')
                    .or(`and(requester_id.eq.${myId},recipient_id.eq.${_viewUserId}),and(requester_id.eq.${_viewUserId},recipient_id.eq.${myId})`)
                    .limit(1);
                if (!mateRows?.length && user.name) {
                    const res = await _supabase
                        .from('mates')
                        .select('status, requester_id, recipient_id, requester_name, recipient_name')
                        .or(`and(requester_name.eq.${myName},recipient_name.eq.${user.name}),and(requester_name.eq.${user.name},recipient_name.eq.${myName})`)
                        .limit(1);
                    mateRows = res.data;
                }
                const mateRow = mateRows?.[0];
                viewerIsRealmate = mateRow?.status === 'accepted';
                // Resolve the shared request state so the gated bottom sections
                // (Posts wall, Recent Listings) match the top button exactly.
                if (mateRow?.status === 'accepted') {
                    _viewMateState = { status: 'accepted', dir: null };
                } else if (mateRow?.status === 'pending' && mateRow.requester_id === myId) {
                    _viewMateState = { status: 'pending', dir: 'sent' };
                } else if (mateRow?.status === 'pending' && mateRow.requester_id === _viewUserId) {
                    _viewMateState = { status: 'pending', dir: 'incoming' };
                } else {
                    _viewMateState = { status: 'none', dir: null };
                }
                // Single source of truth for the top button — same _viewMateState
                // the gated sections read, so the whole profile stays consistent.
                _syncTopMateButton();
            } catch(e) {
                console.warn('[mateBtn]', e.message);
            }
        }
        // Follow button
        if (typeof renderFollowButton === 'function') {
            await renderFollowButton('profileFollowBtn', _viewUserId, user.name);
        }
        const msgBtn = document.getElementById('profileMessageBtn');
        if (msgBtn) msgBtn.style.display = 'inline-flex';
        // Report / Block this user (App Store Guideline 1.2) — only on another
        // member's profile, and never your own.
        const reportLink = document.getElementById('profileMoreReportLink');
        if (reportLink) reportLink.style.display = 'flex';
        const blockLink = document.getElementById('profileMoreBlockLink');
        if (blockLink) blockLink.style.display = 'flex';
    } else {
        _applyEditProfileButtonVisibility();
        const settingsLink = document.getElementById('profileMoreSettingsLink');
        if (settingsLink) settingsLink.style.display = 'flex';
    }

    // Follower / following counts for the profile being viewed
    const targetId = effectivelyViewingOther ? _viewUserId : (await _supabase.auth.getUser()).data?.user?.id;
    if (targetId && typeof getFollowCounts === 'function') {
        const { followers, following } = await getFollowCounts(targetId);
        const fc = document.getElementById('followersCount');
        const fg = document.getElementById('followingCount');
        if (fc) fc.innerText = followers;
        if (fg) fg.innerText = following;
    }
    if (targetId && typeof getMatesCount === 'function') {
        const count = await getMatesCount(targetId);
        const el = document.getElementById('matesCountProfile');
        if (el) el.innerText = count;
    }

    await renderRealMatesCard();
    // Account-privacy + relationship access. A Public account shows everything;
    // otherwise listings need a Realmate and posts/About need a Follower OR
    // Realmate. Resolved once and reused for listings + posts + About below.
    // (Falls back to the old Realmate-only rule if privacy.js isn't present.)
    const _acc = (effectivelyViewingOther && window.RMPriv)
        ? await RMPriv.resolve(targetId)
        : { isSelf: true, ownerPublic: true, isFollower: true, isMate: true };
    const _canListings = window.RMPriv ? RMPriv.can('listings', _acc) : viewerIsRealmate;
    const _canPosts    = window.RMPriv ? RMPriv.can('posts', _acc)    : viewerIsRealmate;
    await renderRecentListings(targetId, _canListings);

    // Portal "View Listings" deep-link: land directly on the Listings section
    // (activate its tab on mobile, then scroll it to the top of the viewport).
    _deepLinkToListings();

    // Profile wall — this user's feed posts (rendered via the shared feed card from home.js).
    // Filter by user_id so it works regardless of display-name differences.
    // Realmates-only when viewing someone else's profile — same rule as Listings.
    const wallEl = document.getElementById('profileWall');
    if (wallEl && targetId) {
        if (effectivelyViewingOther && !_canPosts) {
            wallEl.innerHTML = _realmateGateHtml(user.name, 'posts-listings');
        } else if (typeof loadHomeFeed === 'function') {
            loadHomeFeed(wallEl, { type: 'userId', value: targetId });
        }
    }

    // About: show the SAME locked-state gate as Posts/Listings (not just a hidden
    // card) so a non-realmate consistently sees "Become realmates to view post,
    // listings and about" across all three sections (#12). The private sublines
    // are hidden regardless. Runs AFTER updateUI() populated them, so this is the
    // final word.
    if (effectivelyViewingOther && !_canPosts) {
        const _aboutCard = document.querySelector('.about-card');
        if (_aboutCard) _aboutCard.innerHTML = _realmateGateHtml(user.name, 'about');
        ['locationLine', 'relationshipLine', 'yearsLine', 'languagesLine'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.style.display = 'none';
        });
    }
}

// ── Stats List Modal (Followers / Following / Realmates) ──
const _statsListTitles = { followers: 'Followers', following: 'Following', realmates: 'realmates' };
const _statsListEmptyTexts = {
    followers: 'No followers yet.',
    following: 'Not following anyone yet.',
    realmates: 'No realmates yet.'
};
let _statsListData = [];

function _statsListRowHtml(u) {
    const divGroup = [u.division, u.group].filter(Boolean).join(' · ');
    const btnId = `statsFollowBtn_${u.id}`;
    const searchBlob = `${u.name} ${u.job} ${u.division} ${u.group}`.toLowerCase().replace(/"/g, '');
    return `
    <div class="stats-list-row" data-search="${searchBlob}" onclick="_statsRowNavigate(event,'${u.id}')">
        <img class="stats-list-avatar" src="${u.img || 'images/realmate2.png'}">
        <div class="stats-list-info">
            <div class="stats-list-name">${u.name}</div>
            ${u.job ? `<div class="stats-list-job">${u.job}</div>` : ''}
            ${divGroup ? `<div class="stats-list-divgroup">${divGroup}</div>` : ''}
        </div>
        <div class="stats-list-follow-wrap" id="${btnId}" onclick="event.stopPropagation()"></div>
    </div>`;
}

function _statsRowNavigate(e, id) {
    if (e && e.target.closest('.stats-list-follow-wrap')) return;
    location.href = 'dashboard.html?user_id=' + id;
}

async function openStatsListModal(type) {
    const modal = document.getElementById('statsListModal');
    const body = document.getElementById('statsListBody');
    const titleEl = document.getElementById('statsListTitle');
    const emptyEl = document.getElementById('statsListEmpty');
    const searchInput = document.getElementById('statsListSearchInput');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    titleEl.innerText = _statsListTitles[type] || '';
    searchInput.value = '';
    body.innerHTML = `<div class="listings-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    emptyEl.style.display = 'none';

    const targetId = effectivelyViewingOtherProfile() ? _viewUserId : (await _supabase.auth.getUser()).data?.user?.id;
    if (!targetId) { body.innerHTML = ''; return; }

    let list = [];
    if (type === 'followers') list = await getFollowersList(targetId);
    else if (type === 'following') list = await getFollowingList(targetId);
    else if (type === 'realmates') {
        const { accepted } = await getMatesList();
        list = accepted || [];
    }

    _statsListData = list;
    document.getElementById('statsListEmptyText').innerText = _statsListEmptyTexts[type] || 'No results.';

    if (list.length === 0) {
        body.innerHTML = '';
        emptyEl.style.display = 'flex';
        return;
    }

    body.innerHTML = list.map(_statsListRowHtml).join('');
    list.forEach(u => {
        if (typeof renderFollowButton === 'function') {
            renderFollowButton(`statsFollowBtn_${u.id}`, u.id, u.name);
        }
    });
}

function closeStatsListModal() {
    const modal = document.getElementById('statsListModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function filterStatsList() {
    const q = document.getElementById('statsListSearchInput').value.trim().toLowerCase();
    const rows = document.querySelectorAll('#statsListBody .stats-list-row');
    let anyVisible = false;
    rows.forEach(row => {
        const match = row.dataset.search.includes(q);
        row.style.display = match ? 'flex' : 'none';
        if (match) anyVisible = true;
    });
    const emptyEl = document.getElementById('statsListEmpty');
    if (emptyEl) emptyEl.style.display = (anyVisible || _statsListData.length === 0) ? 'none' : 'flex';
}

async function renderRealMatesCard() {
    try {
        const { accepted, pendingSent } = await getMatesList();

        // Update count stat
        const countEl = document.getElementById('matesCount');
        if (countEl) countEl.innerText = accepted.length;
        const countBig = document.getElementById('matesCountBig');
        if (countBig) countBig.innerText = accepted.length;
        const countHero = document.getElementById('matesCountHero');
        if (countHero) countHero.innerText = accepted.length;

        // Incoming requests are handled from the Notifications Hub's
        // dedicated "ALL UNREAD REALMATE REQUESTS" section now, not here —
        // this widget only shows existing Realmates (and, unchanged, the
        // outgoing "Awaiting Reply" list below).

        // Pending sent requests
        const sentSection = document.getElementById('pendingSentSection');
        const sentList    = document.getElementById('pendingSentList');
        if (sentSection && sentList) {
            if (pendingSent.length > 0) {
                sentSection.style.display = 'block';
                sentList.innerHTML = pendingSent.map(m => `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--primary-soft); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas fa-user" style="color:var(--primary); font-size:14px;"></i>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.name}</div>
                            <div style="font-size:11px; color:#94a3b8;">Request sent · Pending</div>
                        </div>
                        <span style="background:#f1f5f9; color:#94a3b8; font-size:10px; font-weight:700; padding:3px 8px; border-radius:50px; white-space:nowrap;">
                            <i class="fas fa-clock"></i> Pending
                        </span>
                    </div>`).join('');
            } else {
                sentSection.style.display = 'none';
            }
        }

        // Accepted mates avatars
        const avatarHtml = accepted.length === 0 ? '' : accepted.map(m => `
            <div class="mate-avatar-item" onclick="location.href='dashboard.html?user_id=${m.id}'" title="${m.name}">
                <img src="${m.img || 'images/realmate2.png'}" class="mate-avatar-img">
                <span class="mate-avatar-name">${m.name.split(' ')[0]}</span>
            </div>`).join('');

        // Right-column avatar list (desktop)
        const avatarList = document.getElementById('matesAvatarList');
        const emptyMsg   = document.getElementById('matesEmptyMsg');
        if (avatarList && emptyMsg) {
            if (accepted.length === 0) {
                avatarList.style.display = 'none';
                emptyMsg.style.display = 'flex';
            } else {
                emptyMsg.style.display = 'none';
                avatarList.style.display = 'flex';
                avatarList.innerHTML = avatarHtml;
            }
        }

        // Middle-column avatar strip (always visible, incl. mobile)
        const avatarStrip = document.getElementById('matesAvatarStrip');
        const avatarEmpty = document.getElementById('matesAvatarEmpty');
        if (avatarStrip) {
            if (accepted.length > 0) {
                avatarStrip.style.display = 'flex';
                avatarStrip.innerHTML = avatarHtml;
                if (avatarEmpty) avatarEmpty.style.display = 'none';
            } else {
                avatarStrip.style.display = 'none';
                if (avatarEmpty) avatarEmpty.style.display = 'inline';
            }
        }
    } catch (e) { console.warn('renderRealMatesCard:', e); }
}

// On hover/focus, un-clamp a Recent Listings card's text and let the card
// grow to fit it exactly — no internal scrollbar. The 2-line preview is a
// fixed 39px max-height in CSS; here we measure the element's real full
// height (scrollHeight, which reflects the un-clamped content once
// display:block is active via the :hover/:focus-visible CSS rule) and
// transition to that exact value, so the animation finishes in sync with the
// content actually reaching full height regardless of how long a given
// listing's text is — a generic large fixed max-height would keep "counting
// up" after the visible text already stopped growing.
function _initListingHoverExpand(card) {
    const textEl = card.querySelector('.profile-listing-text');
    if (!textEl) return;
    function expand() { textEl.style.maxHeight = textEl.scrollHeight + 'px'; }
    function collapse() { textEl.style.maxHeight = ''; }
    card.addEventListener('mouseenter', expand);
    card.addEventListener('mouseleave', collapse);
    card.addEventListener('focusin', expand);
    card.addEventListener('focusout', collapse);
}

// Lets the shared Sold countdown (livemarket.js) refresh this section in place
// when a sold listing ticks past its 24h window and is swept away.
let _dashListingsCtx = null;
function reloadDashboardListings() {
    if (_dashListingsCtx) renderRecentListings(_dashListingsCtx.targetId, _dashListingsCtx.canView);
}

async function renderRecentListings(targetId, canView = true) {
    _dashListingsCtx = { targetId, canView };
    const card = document.querySelector('.listings-card');
    const wrap = document.getElementById('recentListingsBody');

    // Recent Listings is Realmates-only on other people's profiles — shown as
    // an explicit access-gate message with an Add as Realmate action, rather
    // than the owner's own view, which is always allowed.
    if (!canView) {
        if (card) card.style.display = '';
        if (wrap) wrap.innerHTML = _realmateGateHtml(user.name, 'posts-listings');
        return;
    }
    if (card) card.style.display = '';

    if (!wrap || !_supabase || !targetId) return;

    wrap.innerHTML = `<div class="listings-loading"><i class="fas fa-spinner fa-spin"></i> Loading listings…</div>`;

    try {
        // Fetch the complete set of the user's active listings (newest first) with
        // ALL columns, so the Live Market post component (buildListingCard) has the
        // full record to render — no preview slice, no "See All" hop to another page.
        const { data: listings, error } = await _supabase
            .from('listings')
            .select('*')
            .eq('user_id', targetId)
            .eq('archived', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Drop any sold listing past its 24h window from the owner's own view and
        // finalize its deletion in the DB (owner has permission here). The permanent
        // Sold record was already written when the sale was confirmed.
        let visible = listings || [];
        if (typeof sweepExpiredSoldListings === 'function' && typeof allListings !== 'undefined') {
            const before = allListings;
            allListings = visible;
            try { await sweepExpiredSoldListings(); visible = allListings; }
            finally { allListings = before; }
        }

        if (!visible || visible.length === 0) {
            wrap.innerHTML = `
                <div class="profile-empty-state">
                    <i class="fas fa-house-circle-check"></i>
                    <p>No listings posted yet.</p>
                </div>`;
            return;
        }

        // A listing's user_name/user_img/user_job/user_verified are a snapshot
        // taken at post time — if this account renamed or changed its photo
        // since, old listings would otherwise keep showing what it looked like
        // back then. Every listing here belongs to the same account (targetId),
        // so one profile fetch covers all of them. This also fixes two things
        // as a side effect, without touching buildListingCard/mateButtonHtml
        // (shared with Portal, deliberately left untouched): those functions
        // decide "is this my own post" by comparing listing.user_name to the
        // viewer's name, so once that name is guaranteed fresh, the owner-only
        // menu options and the self-facing "Add as Mate" button both resolve
        // correctly for this account's own listings — Portal's own listings
        // array is never touched by this, so its behavior is unaffected.
        try {
            const { data: liveProfile } = await _supabase
                .from('profiles')
                .select('full_name, avatar_url, job_title, is_verified')
                .eq('id', targetId)
                .maybeSingle();
            if (liveProfile) {
                const liveJob = typeof lmValidPosition === 'function'
                    ? lmValidPosition(liveProfile.job_title)
                    : (liveProfile.job_title || '');
                visible = visible.map(l => {
                    const name = liveProfile.full_name || l.user_name;
                    return {
                        ...l,
                        user_name: name,
                        user_img: _avatarUrlFor(name, liveProfile.avatar_url),
                        user_job: liveJob || l.user_job,
                        user_verified: !!liveProfile.is_verified,
                    };
                });
            }
        } catch (e) { console.warn('[renderRecentListings] live author overlay failed', e); }

        // Render every listing with the EXACT same post component Live Market /
        // Portal uses (buildListingCard, from livemarket.js). The container carries
        // .lm-post-embed, under which listing-card.css scopes the card styles so
        // they never leak into the rest of the dashboard. Because both pages call
        // the one component, any future change to the Portal post shows up here too.
        if (typeof buildListingCard !== 'function') {
            wrap.innerHTML = `<div class="profile-empty-state"><i class="fas fa-triangle-exclamation"></i><p>Couldn't load listings.</p></div>`;
            return;
        }
        // Compute the AI-match counts so each card shows the same animated
        // "N AI Matches Found" figure the Portal does. The engine needs the full
        // listing pool (all users) as match candidates, so load it and populate
        // the globals buildMatchMap() reads (allListings/myListings), then build
        // the shared matchCountMap. Best-effort: on any failure the cards still
        // render, just with a 0 count.
        let counts = null;
        try {
            if (typeof buildMatchMap === 'function') {
                const { data: pool } = await _supabase
                    .from('listings').select('*').eq('archived', false);
                if (Array.isArray(pool)) {
                    allListings = pool;
                    const me = JSON.parse(localStorage.getItem('user') || 'null');
                    myListings = me ? pool.filter(x => String(x.user_id) === String(me.id)) : [];
                    buildMatchMap();                 // refreshes the global matchCountMap
                    counts = (typeof matchCountMap !== 'undefined') ? matchCountMap : null;
                }
            }
        } catch (e) { console.warn('[renderRecentListings] match counts failed', e); }

        wrap.classList.add('lm-post-embed');
        wrap.innerHTML = '';
        // Render from `visible` directly. Do NOT round-trip through the original
        // `listings` array: when the sold-sweep finds nothing to remove it leaves
        // `visible` pointing at the very same array as `listings`, so emptying one
        // to refill it (the old `listings.length = 0`) wiped both and rendered
        // zero cards — the cause of the blank "Recent Listings" section.
        visible.forEach(l => {
            const n = counts ? (counts.get(String(l.id)) || 0) : 0;
            try { wrap.appendChild(buildListingCard(l, null, null, n)); }
            catch (e) { console.warn('[renderRecentListings] card render failed', e); }
        });
        // Kick off the shared 24h Sold countdown for any sold cards just rendered.
        if (typeof startSoldCountdowns === 'function') startSoldCountdowns();
    } catch (e) {
        console.warn('[renderRecentListings]', e.message);
        wrap.innerHTML = `<div class="profile-empty-state"><i class="fas fa-triangle-exclamation"></i><p>Couldn't load listings.</p></div>`;
    }
}

async function uploadImage(file, path) {
    if(!_supabase) return null;
    try {
        const fileName = `${path}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
        const { data, error } = await _supabase.storage.from('images').upload(fileName, file);
        if (error) throw error;
        const { data: { publicUrl } } = _supabase.storage.from('images').getPublicUrl(fileName);
        return publicUrl;
    } catch (err) { (window.showToast || alert)("Upload Error: " + err.message, 'error'); return null; }
}


function _editAlert(msg, type = 'success') {
    const isSuccess = type === 'success';
    const toast = document.getElementById('profileToast');
    if (toast) {
        toast.style.background = isSuccess ? '#0f172a' : '#ef4444';
        toast.querySelector('i').className = `fas ${isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
        toast.querySelector('i').style.color = isSuccess ? '#32cd32' : '#fff';
        toast.childNodes[toast.childNodes.length - 1].textContent = ' ' + msg;
        toast.style.display = 'flex';
        toast.style.opacity = '1';
        clearTimeout(window._editToastTimer);
        window._editToastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 3000);
    }
}

async function saveProfile() {
    const btn = document.getElementById('saveProfileBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving...'; }

    user.name = document.getElementById("editName").value;
    // If there's no real uploaded photo, regenerate the initials placeholder
    // from the name just typed above — without this, saving right after a
    // rename would still write the OLD name's placeholder (computed back at
    // page load) into the DB, only self-correcting on the next full reload.
    user.image = _avatarUrlFor(user.name, user.image);

    // Account username (login handle). Kept unique; letters/numbers/dot/underscore only.
    const _newUsername = document.getElementById("editUsername").value.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(_newUsername)) {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
        _editAlert('Username must be 3–30 characters using only letters, numbers, dots or underscores.', 'error');
        return;
    }
    const _usernameChanged = _newUsername !== (user.username || '').toLowerCase();
    user.username = _newUsername;

    user.nickname = document.getElementById("editNickname").value.trim().slice(0, 30);
    user.bio = document.getElementById("editBio").value.trim().slice(0, 500);
    user.division = normalizeDivision(document.getElementById("editDivision").value);
    user.group = document.getElementById("editGroup").value;
    user.team = document.getElementById("editTeam").value;
    // A Group must always belong to its Division's list — clear it otherwise.
    // Defense-in-depth beyond what the dependent dropdowns already enforce.
    const _validGroups = user.division ? DIVISION_GROUPS[user.division] : null;
    if (!_validGroups || !_validGroups.includes(user.group)) {
        user.group = '';
    }
    user.relationship = document.getElementById("editRelationship").value;
    // Relationship Status is REQUIRED (Division and Group remain optional).
    if (!user.relationship || !user.relationship.trim()) {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
        _editAlert('Please select your Relationship Status.', 'error');
        return;
    }

    // City must be empty or an exact match from the verified list — the
    // strict combobox (see initSearchableSelect above) already clears any
    // unmatched text on blur, but that only fires if the user actually
    // leaves the field. This is the backstop for a legacy value that's
    // never been touched (see openEditModal's legacy-hint check) or any
    // other path that reaches Save without a blur in between.
    const _newLocation = document.getElementById("editAddress").value.trim();
    if (_newLocation && !PH_CITIES.includes(_newLocation)) {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
        _editAlert('Please select a valid city from the list.', 'error');
        showAddressLegacyHint();
        return;
    }
    user.location = _newLocation;
    const yearsVal = document.getElementById("editYearsExperience").value;
    user.yearsExperience = yearsVal ? parseInt(yearsVal, 10) : '';
    user.languages = _selectedLanguages.join(', ');

    if (_supabase) {
        try {
            const { data: { user: authUser } } = await _supabase.auth.getUser();
            if (authUser) {
                if (_usernameChanged) {
                    // Reject if another profile already owns this username
                    const { data: taken, error: chkErr } = await _supabase
                        .from('profiles').select('id').eq('username', _newUsername).neq('id', authUser.id).limit(1);
                    if (chkErr) throw chkErr;
                    if (taken && taken.length) {
                        if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
                        _editAlert('That username is already taken — please choose another.', 'error');
                        return;
                    }
                }
                const { error } = await _supabase.from('profiles').upsert({
                    id: authUser.id,
                    full_name: user.name,
                    username: user.username,
                    nickname: user.nickname || null,
                    // Positions were removed from Realmate — always clear any
                    // stored career position on save.
                    job_title: null,
                    division: user.division,
                    business_group: user.group,
                    team_name: user.team,
                    bio: user.bio,
                    avatar_url: user.image,
                    relationship_status: user.relationship || null,
                    location: user.location || null,
                    years_experience: user.yearsExperience || null,
                    languages: user.languages || null,
                    updated_at: new Date()
                });
                if (error) throw error;

                // Keep the login handle in sync: auth metadata + legacy Users lookup
                // table (used to resolve username → email at sign-in). Best-effort —
                // a failure here shouldn't block the profile save that already landed.
                if (_usernameChanged) {
                    try { await _supabase.auth.updateUser({ data: { username: user.username } }); } catch (_) {}
                    if (authUser.email) {
                        try { await _supabase.from('Users').update({ username: user.username }).eq('email', authUser.email); } catch (_) {}
                    }
                }
            }
        } catch(e) {
            if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
            closeEditModal();
            _editAlert('Failed to save: ' + e.message, 'error');
            return;
        }
    }

    localStorage.setItem("user", JSON.stringify(user));
    updateUI();
    if (btn) { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
    closeEditModal();
    showPhotoToast('Profile saved successfully!');
}

function openEditModal() {
    document.getElementById("editName").value = user.name;
    document.getElementById("editUsername").value = user.username || "";
    const _uStatus = document.getElementById("editUsernameStatus");
    if (_uStatus) { _uStatus.textContent = ""; _uStatus.style.color = ""; }
    document.getElementById("editNickname").value = user.nickname || "";
    document.getElementById("editBio").value = user.bio || "";
    document.getElementById("editDivision").value = normalizeDivision(user.division);
    document.getElementById("editRelationship").value = user.relationship || '';

    syncGroupField(user.group);

    document.getElementById("editTeam").value = user.team || "";
    document.getElementById("editAddress").value = user.location || "";
    // A profile saved before a city was added/renamed on the verified list
    // (or that predates this dropdown entirely) still displays exactly as
    // saved — this only adds a nudge to reselect, it never clears the value
    // itself. Only the strict combobox blur (see initSearchableSelect above)
    // or an actual save attempt enforces the verified list.
    if (user.location && !PH_CITIES.includes(user.location)) showAddressLegacyHint();
    else hideAddressLegacyHint();
    document.getElementById("editYearsExperience").value = user.yearsExperience || "";
    _selectedLanguages = (user.languages || '').split(',').map(s => s.trim()).filter(Boolean);
    renderLanguageChips();
    document.getElementById("editLanguages").value = "";
    document.getElementById("editModal").style.display = "flex";
}
function closeEditModal() {
    document.getElementById("editModal").style.display = "none";
    document.body.style.overflow = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function logout() { 
    if (_supabase) _supabase.auth.signOut();
    localStorage.removeItem("user");
    localStorage.removeItem("posts");
    location.href = "index.html"; 
}

// ── Photo Action Sheet ──
function openPhotoActionSheet() {
    const sheet = document.getElementById("photoActionSheet");
    const preview = document.getElementById("actionSheetPreview");
    const nameEl = document.getElementById("actionSheetName");
    preview.src = document.getElementById("profileImage").src;
    nameEl.textContent = user.name || "";
    sheet.style.display = "flex";
    document.body.style.overflow = "hidden";
}
function closePhotoActionSheet() {
    document.getElementById("photoActionSheet").style.display = "none";
    document.body.style.overflow = "";
}

function changeImage() {
    closePhotoActionSheet();
    document.getElementById("fileInput").click();
}

// ── Lightbox ──
function viewFullPhoto() {
    closePhotoActionSheet();
    const src = document.getElementById("profileImage").src;
    document.getElementById("lightboxImg").src = src;
    document.getElementById("profileLightbox").style.display = "flex";
    document.body.style.overflow = "hidden";
}
function closeProfileLightbox() {
    document.getElementById("profileLightbox").style.display = "none";
    document.body.style.overflow = "";
}

// ── Toast ──
function showPhotoToast(msg) {
    const toast = document.getElementById("profileToast");
    if (msg) toast.innerHTML = `<i class="fas fa-check-circle" style="color:#32cd32;"></i> ${msg}`;
    toast.style.display = "flex";
    toast.style.opacity = "1";
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => { toast.style.display = "none"; }, 300);
    }, 3000);
}

// ── Cropper ──
let cropperInstance = null;

function openCropModal(src) {
    closePhotoActionSheet();
    closeProfileLightbox();

    const cropImg = document.getElementById("cropperImage");
    cropImg.crossOrigin = "anonymous";
    cropImg.src = src;

    document.getElementById("cropModal").style.display = "flex";
    document.body.style.overflow = "hidden";

    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }

    cropImg.onload = () => {
        cropperInstance = new Cropper(cropImg, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
            background: false,
            ready() {
                // Calculate the fitted zoom ratio and set slider around it
                const imageData = cropperInstance.getImageData();
                const canvasData = cropperInstance.getCanvasData();
                const fitRatio = canvasData.width / imageData.naturalWidth;
                const slider = document.getElementById("zoomSlider");
                slider.min = fitRatio;
                slider.max = fitRatio * 4;
                slider.step = fitRatio * 0.02;
                slider.value = fitRatio;
            },
            zoom(event) {
                // Keep slider in sync when zooming via scroll/pinch
                const slider = document.getElementById("zoomSlider");
                const ratio = event.detail.ratio;
                if (ratio < parseFloat(slider.min) || ratio > parseFloat(slider.max)) {
                    event.preventDefault();
                    return;
                }
                slider.value = ratio;
            }
        });
    };
}

async function repositionPhoto() {
    closePhotoActionSheet();
    const originalSrc = user.imageOriginal || document.getElementById("profileImage").src;

    // Fetch as blob → convert to data URL to avoid tainted canvas CORS error
    try {
        const res = await fetch(originalSrc);
        const blob = await res.blob();
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(blob);
        });
        openCropModal(dataUrl);
    } catch (e) {
        openCropModal(originalSrc); // fallback
    }
}

function closeCropModal() {
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    document.getElementById("cropModal").style.display = "none";
    document.getElementById("fileInput").value = "";
    document.body.style.overflow = "";
}

async function applyCrop() {
    if (!cropperInstance) return;
    const btn = document.getElementById("applyCropBtn");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    try {
        const ts = Date.now();

        // Upload original (full image) if this is a new upload — preserves it for future repositioning
        if (window._pendingOriginalFile) {
            const origUrl = await uploadImage(window._pendingOriginalFile, 'avatars');
            if (origUrl) {
                user.imageOriginal = origUrl;
            }
            window._pendingOriginalFile = null;
        }

        // Upload the cropped result as the display avatar
        const canvas = cropperInstance.getCroppedCanvas({ width: 400, height: 400 });
        if (!canvas) throw new Error("Could not read image. Please try uploading again.");
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) throw new Error("Failed to process image.");
        const croppedFile = new File([blob], `avatar_${ts}.jpg`, { type: 'image/jpeg' });
        const publicUrl = await uploadImage(croppedFile, 'avatars');

        if (publicUrl) {
            user.image = publicUrl;
            localStorage.setItem("user", JSON.stringify(user));
            if (_supabase) {
                const { data: { user: authUser } } = await _supabase.auth.getUser();
                if (authUser) {
                    await _supabase.from('profiles').update({
                        avatar_url: publicUrl,
                        avatar_original_url: user.imageOriginal || publicUrl
                    }).eq('id', authUser.id);
                }
            }
            updateUI();
            showPhotoToast();
        }
    } catch(e) {
        (window.showToast || alert)("Upload failed: " + e.message, 'error');
    } finally {
        closeCropModal();
    }
}

document.getElementById("fileInput").addEventListener("change", function () {
    if (!this.files[0]) return;
    // Store original file so applyCrop can upload it separately
    window._pendingOriginalFile = new File(
        [this.files[0]],
        `original_${Date.now()}_${this.files[0].name}`,
        { type: this.files[0].type }
    );
    const reader = new FileReader();
    reader.onload = (e) => openCropModal(e.target.result);
    reader.readAsDataURL(this.files[0]);
});


// Modified initialization:
window.onload = async () => {
    if (_supabase) {
        await loadProfile();
        _supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') loadProfile();
        });
    }
};

function uploadCoverPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => openCoverCropModal(e.target.result, true);
    reader.readAsDataURL(file);
}

function openCoverActionSheet() {
    const sheet = document.getElementById('coverActionSheet');
    const preview = document.getElementById('coverActionSheetPreview');
    if (user.coverUrl) {
        preview.src = user.coverUrl;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
    sheet.style.display = 'flex';
}

function closeCoverActionSheet() {
    document.getElementById('coverActionSheet').style.display = 'none';
}

function viewFullCover() {
    closeCoverActionSheet();
    if (!user.coverUrl) return;
    const lb = document.getElementById('profileLightbox');
    const img = document.getElementById('lightboxImg');
    img.src = user.coverUrl;
    lb.style.display = 'flex';
}

function changeCoverPhoto() {
    closeCoverActionSheet();
    document.getElementById('coverPhotoInput').click();
}

async function repositionCover() {
    closeCoverActionSheet();
    if (!user.coverUrl) { changeCoverPhoto(); return; }
    try {
        const res = await fetch(user.coverUrl);
        const blob = await res.blob();
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(blob);
        });
        openCoverCropModal(dataUrl);
    } catch {
        openCoverCropModal(user.coverUrl);
    }
}

let _coverCropper = null;

let _coverIsNewUpload = false;

function openCoverCropModal(src, isNewUpload) {
    _coverIsNewUpload = !!isNewUpload;
    const modal = document.getElementById('coverCropModal');
    const img = document.getElementById('coverCropImage');
    img.src = src;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (_coverCropper) _coverCropper.destroy();
    _coverCropper = new Cropper(img, {
        aspectRatio: 5 / 3,   /* match the dashboard cover display ratio (was 16/5, too wide) */
        viewMode: 1,
        dragMode: 'move',
        cropBoxResizable: false,
        cropBoxMovable: false,
        guides: false,
        center: true,
        background: false,
    });
}

function closeCoverCropModal() {
    if (_coverCropper) { _coverCropper.destroy(); _coverCropper = null; }
    document.getElementById('coverCropModal').style.display = 'none';
    document.body.style.overflow = '';
}

async function applyCoverCrop() {
    if (!_coverCropper) return;
    const btn = document.getElementById('applyCoverCropBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
    try {
        const canvas = _coverCropper.getCroppedCanvas({ width: 1200, height: 720 });
        if (!canvas) throw new Error('Could not process image.');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.90));
        const file = new File([blob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const { data: authData } = await _supabase.auth.getUser();
        const userId = authData?.user?.id;
        const path = `covers/${userId}_${Date.now()}.jpg`;
        const { error } = await _supabase.storage.from('images').upload(path, file, { upsert: true });
        if (error) throw error;
        const url = _supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
        await _supabase.from('profiles').update({ cover_url: url }).eq('id', userId);
        user.coverUrl = url;
        localStorage.setItem('user', JSON.stringify(user));
        updateUI();
        const preview = document.getElementById('coverActionSheetPreview');
        if (preview) { preview.src = url; preview.style.display = 'block'; }
        closeCoverCropModal();
        showPhotoToast(_coverIsNewUpload ? 'Cover photo updated!' : 'Cover photo repositioned!');
    } catch (e) {
        (window.showToast || alert)('Failed to save cover: ' + e.message, 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-check"></i> Save';
        btn.disabled = false;
    }
}

// ── Profile-only "seller menu" override (viewing someone ELSE's listing) ──
// livemarket.js's own showSelfPopup()/showSellerPopup() now render through
// the shared account-menu.js modal (see account-menu.js, loaded on both this
// page and livemarket.html). For the SELF case the content is identical
// either way, so livemarket.js's version is used as-is here too — no
// override needed. The SELLER case keeps Profile's existing, already-shipped
// wording (View Listings/Message/View Profile) distinct from Portal's newer
// My Account/View Profile/View Listings, so it's overridden here rather than
// changed in the shared livemarket.js function. handleViewListings()
// (livemarket.js) still owns the Realmate-gate business logic, keyed off
// window._spUserId/_spName/_spImg — reused as-is, not duplicated.
function _profileShowSellerMenu(userId, name, img, job) {
    window._spUserId = userId;
    window._spName = name;
    window._spImg = img;
    if (typeof openAccountMenu !== 'function') return;
    openAccountMenu({
        header: { type: 'identity', avatar: img, name, job },
        options: [
            {
                icon: 'fa-store',
                title: 'View Listings',
                sub: 'Browse all active property listings',
                onClick: () => { if (typeof handleViewListings === 'function') handleViewListings(); }
            },
            {
                icon: 'fa-comment-dots',
                title: 'Message',
                sub: 'Send a direct message',
                onClick: () => {
                    sessionStorage.setItem('openChatWith', JSON.stringify({ userId: window._spUserId, name: window._spName }));
                    location.href = 'chat.html';
                }
            },
            {
                icon: 'fa-user-tie',
                title: 'View Profile',
                sub: 'See full realmate profile',
                onClick: () => { if (window._spUserId) location.href = 'dashboard.html?user_id=' + window._spUserId; }
            }
        ]
    });
}

// Replaces livemarket.js's Portal-facing showSellerPopup() for Profile pages only.
window.showSellerPopup = _profileShowSellerMenu;