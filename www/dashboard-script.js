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

// The "···" menu has two triggers that share ONE menu element: the in-header
// button (desktop — the menu is absolutely positioned under it by CSS) and the
// round button in the mobile cover top bar. The menu is not a child of that top
// bar, so on mobile it is position:fixed and must be placed from the button's
// real on-screen position each time it opens. It used to sit at a hard-coded
// top:58px, which on phones with a status-bar inset landed ON the button — and
// the top bar stacks above the menu, so the menu showed up behind the button.
function _placeProfileMoreMenu(menu, trigger) {
    menu.style.top = ''; menu.style.right = '';
    if (!trigger || !trigger.classList || !trigger.classList.contains('mobile-topbar-more')) return;
    const r = trigger.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
}
function _closeProfileMoreMenu() {
    const menu = document.getElementById('profileMoreMenu');
    if (menu) menu.classList.remove('open');
    window.removeEventListener('scroll', _closeProfileMoreMenu, true);
    window.removeEventListener('resize', _closeProfileMoreMenu);
}
function toggleProfileMoreMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('profileMoreMenu');
    if (!menu) return;
    if (menu.classList.contains('open')) { _closeProfileMoreMenu(); return; }
    // A menu item's own onclick also calls this to close; only a real trigger
    // button (re)positions and opens it.
    const trigger = e && e.currentTarget && e.currentTarget.tagName === 'BUTTON' ? e.currentTarget : null;
    _placeProfileMoreMenu(menu, trigger);
    menu.classList.add('open');
    // The mobile trigger scrolls with the cover while the menu is fixed, so close
    // the menu rather than leave it detached from its button.
    window.addEventListener('scroll', _closeProfileMoreMenu, true);
    window.addEventListener('resize', _closeProfileMoreMenu);
}
document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.profile-more-menu-wrap');
    const menu = document.getElementById('profileMoreMenu');
    if (menu && wrap && !wrap.contains(e.target)) {
        _closeProfileMoreMenu();
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
            <div class="profile-gate-sub">You've sent a realmate request to this user. You'll be notified once they accept — or tap below to withdraw it.</div>
            <button class="btn-mate-profile mate-status-pending mate-cancelable" onclick="handleGateCancelMate(this, '${safeName}')">
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
    // Pass the viewed profile's exact account id (namesake-proof) so the request
    // + its notification target this specific account, not a same-named one.
    const result = (typeof sendMateRequest === 'function')
        ? await sendMateRequest(userName, userImg, (typeof _viewUserId !== 'undefined' ? _viewUserId : undefined) || undefined)
        : { success: false, error: 'unavailable' };

    if (result.success && result.accepted) {
        // They had already requested us → this became an accept. Now Realmates:
        // re-run loadProfile (NOT a full page reload) so the unlocked posts/
        // listings/About render in place — no refresh. (sendMateRequest already
        // fired the sync bus, which is why other tabs/surfaces also update.)
        _viewMateState = { status: 'accepted', dir: null };
        if (typeof loadProfile === 'function') loadProfile();
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

// Gate "Accept Request": accept the incoming request, then re-run loadProfile
// (NOT a full page reload) so the now-unlocked posts/listings/About render in
// place — no refresh. acceptMateRequest already fired the sync bus for the rest
// of the app (other tabs, notifications, My Realmates).
async function handleGateAcceptMate(btn, userName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = (typeof acceptMateRequest === 'function')
        ? await acceptMateRequest(userName)
        : { success: false };
    if (result.success) {
        _viewMateState = { status: 'accepted', dir: null };
        if (typeof loadProfile === 'function') loadProfile();
        return;
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Accept Request';
}

// Gate "Request Sent" → withdraw the pending realmate request I sent. Confirms,
// then flips the whole profile back to "Add as realmate" in place. This is what
// makes a sent realmate request cancelable (so a pair can never be stuck with
// both sides showing "Request Sent" and no way out).
async function handleGateCancelMate(btn, userName) {
    const ok = (typeof showConfirmDialog === 'function')
        ? await showConfirmDialog({
            title: 'Cancel realmate request?',
            message: `Withdraw your pending realmate request to ${userName}? It will be removed from their notifications.`,
            confirmText: 'Withdraw',
            cancelText: 'Keep'
          })
        : confirm(`Withdraw your pending realmate request to ${userName}?`);
    if (!ok) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = (typeof cancelMateRequest === 'function')
        ? await cancelMateRequest(userName)
        : { success: false, error: 'unavailable' };
    if (result && result.success) {
        _viewMateState = { status: 'none', dir: null };
        _syncTopMateButton();
        _refreshRealmateGates();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-clock"></i> Request Sent';
        (window.showToast || alert)('Could not cancel request: ' + ((result && result.error) || 'Unknown error'), 'error');
    }
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
        el.innerHTML = `<button class="btn-mate-profile mate-status-pending mate-cancelable" onclick="handleGateCancelMate(this, '${safeName}')"><i class="fas fa-clock"></i> Request Sent</button>`;
    } else if (s === 'pending' && d === 'incoming') {
        el.innerHTML = `<button class="btn-mate-profile mate-status-received" onclick="handleGateAcceptMate(this, '${safeName}')"><i class="fas fa-check"></i> Accept Request</button>`;
    } else {
        el.innerHTML = `<button class="btn-mate-profile" onclick="handleGateAddMate(this, '${safeName}')"><i class="fas fa-user-plus"></i> Add as realmate</button>`;
    }
}

// Navigate into a user's chat. When embedded in the app shell (Feed → a user's
// profile → Message), go through the shell's rmOpen so it ALSO activates the Chat
// bottom-nav tab and shows the Chat frame — a bare location.href only navigates the
// current (Feed) frame and leaves the navbar highlighting Feed. chat.js reads
// `openChatWith` from sessionStorage on load and opens the conversation either way.
function _rmGoChat() {
    try {
        if (window.parent && window.parent !== window && typeof window.parent.rmOpen === 'function') {
            window.parent.rmOpen('chat', 'chat.html');
            return;
        }
    } catch (e) {}
    location.href = 'chat.html';
}

async function goToChat(targetUserId, targetName) {
    sessionStorage.setItem('openChatWith', JSON.stringify({ userId: targetUserId, name: targetName }));
    _rmGoChat();
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
    division: "",
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
    // Idempotent: selecting the tab that is already showing is a no-op, so repeated
    // taps (or the deep-link landing on a tab the user already picked) never
    // re-toggle classes or re-lay-out the panels.
    const _btn = document.querySelector('.profile-tab[data-tab="' + tab + '"]');
    const _panel = document.querySelector('.profile-tab-panel[data-tab-panel="' + tab + '"]');
    if (_btn && _panel && _btn.classList.contains('active') && _panel.classList.contains('tab-active')
        && document.querySelectorAll('.profile-tab.active').length === 1) return;
    document.querySelectorAll('.profile-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.profile-tab-panel').forEach(p =>
        p.classList.toggle('tab-active', p.dataset.tabPanel === tab));
    // The About panel's read-more button is measured via scrollHeight, which is
    // always 0 while the panel is display:none — re-measure now that it's visible.
    if (tab === 'about') updateBioReadMoreVisibility();
}

// Notification deep-link: a reaction/like/comment/reply on MY OWN post opens My
// Profile → Posts and lands on that EXACT post at its natural position (never the
// Feed, never the top). notifications.js sets route_profile_post_id then routes
// here. Data-ready (no timing hack): activate the Posts tab, then poll for the
// exact post card to render in the wall, scroll to its real position, and apply
// the same green highlight used on the Feed. Cleared once consumed so a later
// re-render doesn't re-trigger it.
async function _consumeProfilePostDeepLink() {
    let pid = null;
    try { pid = localStorage.getItem('route_profile_post_id'); } catch (e) {}
    if (!pid) return;
    try { switchProfileTab('posts'); } catch (e) {}   // land on Posts (mobile; desktop shows all)
    const deadline = Date.now() + 8000;
    let el = document.getElementById('hfpost-' + pid);
    while (!el && Date.now() < deadline) {
        await new Promise(function (r) { setTimeout(r, 120); });
        el = document.getElementById('hfpost-' + pid);
    }
    if (!el) return;   // post not in this wall (deleted / not accessible)
    try { localStorage.removeItem('route_profile_post_id'); } catch (e) {}
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    el.classList.add('hf-notif-highlight');
    setTimeout(function () { el.classList.remove('hf-notif-highlight'); }, 3000);
}

// Portal's "View Listings" opens this dashboard with ?view=listings. The visitor
// wants to land at the TOP of the profile (name/photo) with the LISTINGS tab
// active and the listings just below — NOT scrolled down onto a listing. So we
// only switch to the Listings tab; we do NOT scroll into the listings. Listings
// render newest-first, so the first one shown below is the latest.
function _deepLinkToListings() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'listings') return;

    const card = document.querySelector('.listings-card');
    // Realmates-only listings on another member's profile are hidden entirely —
    // just leave the visitor at the top of the profile.
    // The tab was already selected up front (see _initProfileTabState); this only
    // re-asserts it, and never overrides a different tab the visitor picked while
    // the profile was still loading.
    if (card && card.style.display !== 'none'
        && (!_profileTabUserPick || _profileTabUserPick === 'listings')) switchProfileTab('listings');

    // RETURNING from a listing detail opened off THIS profile's listings? Restore the
    // exact scroll instead of jumping to the top (see lmOpenListing + listing-detail
    // goBack). Otherwise keep the header at the top as before.
    let restore = null;
    try {
        const r = JSON.parse(sessionStorage.getItem('ldProfileScrollRestore') || 'null');
        const me = params.get('user_id') || (typeof _viewUserId !== 'undefined' ? _viewUserId : '') || '';
        if (r && String(r.userId) === String(me || '') && (Date.now() - (r.t || 0) < 300000) && r.y > 0) {
            restore = r; sessionStorage.removeItem('ldProfileScrollRestore');
        }
    } catch (e) {}

    if (restore) {
        _restoreProfileListingsScroll(restore.y);
    } else if (!_profileUserMoved) {
        // Only reset to the top if the visitor hasn't scrolled yet — never yank the
        // page back after they have started reading.
        try {
            window.scrollTo(0, 0);
            document.querySelectorAll('.main-content').forEach(el => { el.scrollTop = 0; });
        } catch (e) {}
    }

    // Drop the flag so a later refresh or back-navigation stays put.
    params.delete('view');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

// The destination tab is STATE established the moment the page starts, not a
// side effect applied once the profile finishes loading. With ?view=listings the
// Listings tab is selected immediately and shows its normal loading state, so a
// tap on "Listings" while the profile is still loading changes nothing (same
// destination → no-op) instead of exposing a half-built panel that the loader
// then rewrites step by step. Also records what the visitor does during the
// load, so the deep-link above can't fight their choice.
const _LISTINGS_LOADING_HTML = `<div class="listings-loading"><i class="fas fa-spinner fa-spin"></i> Loading listings…</div>`;
let _profileTabUserPick = null;    // tab the visitor tapped themselves (null = none yet)
let _profileUserMoved = false;     // visitor scrolled since the page started
(function _initProfileTabState() {
    try {
        document.querySelectorAll('.profile-tab').forEach(b =>
            b.addEventListener('click', () => { _profileTabUserPick = b.dataset.tab; }, true));
        const moved = () => { _profileUserMoved = true; };
        ['wheel', 'touchmove'].forEach(ev => window.addEventListener(ev, moved, { passive: true, once: true }));
        if (new URLSearchParams(window.location.search).get('view') !== 'listings') return;
        switchProfileTab('listings');
        const wrap = document.getElementById('recentListingsBody');
        if (wrap && !wrap.children.length) wrap.innerHTML = _LISTINGS_LOADING_HTML;
    } catch (e) {}
})();

// Re-assert the scroll for a short window because the profile + its listings render
// in batches after load; stops if the visitor scrolls themselves. Handles whichever
// element is the real scroller (window on mobile, .main-content on desktop). The
// "Loading Listings" cover (added synchronously in dashboard.html <head>) stays up
// until the content is tall enough AND the scroll has landed, so the profile top is
// never revealed first; then it fades out.
function _restoreProfileListingsScroll(y) {
    let cancelled = false, revealed = false;
    const apply = () => {
        try { window.scrollTo(0, y); } catch (e) {}
        document.querySelectorAll('.main-content').forEach(el => {
            if (el.scrollHeight > el.clientHeight) { try { el.scrollTop = y; } catch (e) {} }
        });
    };
    const canReach = () => {
        if (document.documentElement.scrollHeight >= y + window.innerHeight - 4) return true;
        return Array.from(document.querySelectorAll('.main-content')).some(el => el.scrollHeight >= y + el.clientHeight - 4);
    };
    const reveal = () => {
        if (revealed) return; revealed = true;
        apply();
        try { clearTimeout(window.__rmListingsLoaderTimer); } catch (e) {}
        const el = document.getElementById('rmListingsLoader');
        if (el) { el.style.opacity = '0'; setTimeout(() => { try { el.remove(); } catch (e) {} }, 220); }
    };
    const onUser = () => { cancelled = true; reveal(); };
    setTimeout(() => { window.addEventListener('wheel', onUser, { passive: true }); window.addEventListener('touchmove', onUser, { passive: true }); }, 250);
    apply();
    let n = 0;
    const iv = setInterval(() => {
        apply();
        if (canReach()) reveal();          // content tall enough + scrolled → drop the loader
        if (cancelled || ++n > 40) { reveal(); clearInterval(iv); }   // ~3s safety
    }, 75);
    // Belt-and-suspenders: never let the loader linger past 3s even if height never settles.
    setTimeout(() => { reveal(); clearInterval(iv); window.removeEventListener('wheel', onUser); window.removeEventListener('touchmove', onUser); }, 3000);
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

    // Cover photo. Rendered as a background layer (#coverImage is a div, not an
    // <img>) so a saved reposition/zoom is reproduced non-destructively: the
    // stored image is always the FULL original, and user.coverTransform only
    // *frames* it via CSS background-size/position. No transform → cover/center
    // (identical to the old object-fit behaviour). See applyCoverCrop().
    const coverImg = document.getElementById('coverImage');
    const coverPlaceholder = document.getElementById('coverPlaceholder');
    if (coverImg && user.coverUrl) {
        coverImg.style.backgroundImage = `url("${user.coverUrl}")`;
        // Show the frame BEFORE framing: the framing needs its real pixel size.
        coverImg.style.display = 'block';
        if (coverPlaceholder) coverPlaceholder.style.display = 'none';
        _applyCoverTransform(coverImg, user.coverTransform);
    } else if (coverImg) {
        coverImg.style.backgroundImage = '';
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
    // NULL-GUARD these: on another user's GATED profile the About card's innerHTML
    // is replaced by the realmate gate, so bioDisplay (and friends) no longer
    // exist. When loadProfile re-runs (a live relationship change), updateUI would
    // then throw on `null.innerText` and ABORT loadProfile before it re-rendered
    // the Realmate button — which is exactly why realmate state wasn't updating in
    // real time (follow buttons re-render independently, so they were unaffected).
    // Company badge: the member's own declared Brokerage / Company; an older stored
    // division only when they haven't entered one.
    const _company = (user.brokerage || '').trim() || user.division || '';
    var _divD = document.getElementById("divisionDisplay"); if (_divD) _divD.innerText = _company;
    var _grpD = document.getElementById("groupDisplay");    if (_grpD) _grpD.innerText = user.group || '';
    const _divPill = document.getElementById('divisionPill');
    const _grpPill = document.getElementById('groupPill');
    if (_divPill) _divPill.style.display = _company ? 'inline-flex' : 'none';
    if (_grpPill) _grpPill.style.display = user.group ? 'inline-flex' : 'none';
    var _bioD = document.getElementById("bioDisplay"); if (_bioD) _bioD.innerText = user.bio;
    const _hasBio = !!(user.bio && user.bio.trim());
    const _aboutEmpty = document.getElementById('aboutEmptyState');
    if (_aboutEmpty) _aboutEmpty.style.display = _hasBio ? 'none' : 'block';

    // Verified badge
    // Full Verified Salesperson / Broker badge under the name (admin-granted,
    // profiles.verified_as); the small legacy check only when verified without a type.
    const verifiedBadge = document.getElementById('verifiedBadge');
    const _verAs = user.verifiedAs || null;
    if (verifiedBadge) verifiedBadge.style.display = (user.isVerified && !_verAs) ? 'inline-block' : 'none';
    const _verFull = document.getElementById('verifiedBadgeFull');
    if (_verFull) {
        const html = (_verAs && window.RMVerified) ? RMVerified.badge(_verAs, 40) : '';
        _verFull.innerHTML = html;
        _verFull.style.display = html ? 'inline-flex' : 'none';
    }

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
    // A row with nothing showing (no company/group pills; no location / years /
    // languages / relationship) is hidden outright, so its top margin doesn't
    // leave a gap above the Message buttons.
    ['.profile-identity-line', '.profile-subline-row'].forEach(sel => {
        const row = document.querySelector(sel);
        if (!row) return;
        const any = Array.from(row.children).some(c => c.style.display !== 'none' && getComputedStyle(c).display !== 'none');
        row.style.display = any ? '' : 'none';
    });

    _rmRenderBioPreview();

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

// Pristine About-card markup, captured at load BEFORE any gating replaces it, so
// the card can be RESTORED (not left stuck on the gate) the instant access is
// granted — e.g. becoming realmates unlocks About in real time, no page refresh.
// dashboard-script.js loads after the About card in the body, so it exists here.
const _aboutCardTemplate = (function () {
    var c = document.querySelector('.about-card');
    return c ? c.innerHTML : null;
})();

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

// Profile picture changed elsewhere — this same document's realtime handler
// (rm-avatar-changed CustomEvent) or another app-shell iframe (rm_avatar_changed
// storage event). Sync THIS page's module `user` from the updated cache and
// repaint the profile avatar. Only relevant on the OWN profile view (not while
// viewing someone else's). No re-broadcast → no loop.
function _rmSyncOwnAvatarFromCache() {
    try {
        if (_viewUserId) return;   // viewing another user — don't touch their avatar
        const cached = JSON.parse(localStorage.getItem('user')) || {};
        if (!cached.image) return;
        if (typeof user !== 'undefined' && user && cached.image !== user.image) {
            user.image = cached.image;
            if (cached.imageOriginal) user.imageOriginal = cached.imageOriginal;
            if (typeof updateUI === 'function') updateUI();
        }
        _rmRepaintOwnProfileAvatars(cached.image);
    } catch (_) {}
}

// Repaint the two profile-page avatars that updateUI/nav don't cover: the
// "Write a post" composer avatar and the Posts-tab post-card avatars. On the OWN
// profile every wall post is this user's, so all outer .hf-post-avatar are theirs
// (the embedded shared-original avatar, .hf-shared-head img, belongs to another
// user and is intentionally left alone).
function _rmRepaintOwnProfileAvatars(url) {
    if (!url || _viewUserId) return;
    try {
        document.querySelectorAll('#createPostAvatar').forEach(el => {
            el.style.background = `url('${url}') center/cover no-repeat`;
            el.innerHTML = '';
        });
    } catch (_) {}
    try {
        document.querySelectorAll('.hf-post-avatar').forEach(img => { img.src = url; });
    } catch (_) {}
}
window.addEventListener('rm-avatar-changed', _rmSyncOwnAvatarFromCache);
window.addEventListener('storage', function (e) { if (e.key === 'rm_avatar_changed') _rmSyncOwnAvatarFromCache(); });

// Own profile edited elsewhere (another device, or another app-shell document) —
// auth-guard's realtime handler fires rm-profile-self-changed / the
// rm_profile_self_changed storage ping. Re-read MY row and repaint, so a new
// cover photo / reposition and Edit Profile changes appear live. The DB row is
// the source of truth here (no fallback to cached values), so a field CLEARED on
// the other device clears here too. Waits while an editor is open so it never
// rewrites what the user is in the middle of changing; our own save's echo
// refetches identical values and is a no-op.
let _rmProfileLiveTimer = null;
function _rmProfileEditorOpen() {
    return ['editModal', 'coverCropModal', 'cropModal'].some(function (id) {
        const el = document.getElementById(id);
        return el && el.style.display && el.style.display !== 'none';
    });
}
function _rmQueueOwnProfileSync(delay) {
    if (_viewUserId) return;   // viewing another user — not my profile
    clearTimeout(_rmProfileLiveTimer);
    _rmProfileLiveTimer = setTimeout(_rmSyncOwnProfileLive, delay || 250);
}
async function _rmSyncOwnProfileLive() {
    try {
        if (_viewUserId || !_supabase || typeof user === 'undefined' || !user || !user.id) return;
        if (_rmProfileEditorOpen()) return _rmQueueOwnProfileSync(1500);
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!p || _rmProfileEditorOpen()) { if (p) _rmQueueOwnProfileSync(1500); return; }
        const next = Object.assign({}, user, {
            name: p.full_name || user.name,
            username: p.username || user.username || '',
            nickname: p.nickname || '',
            job: p.job_title || '',
            division: p.division || '',
            group: p.business_group || '',
            team: p.team_name || '',
            bio: p.bio || '',
            relationship: p.relationship_status || '',
            professionalType: p.professional_type || '',
            brokerage: p.brokerage || '',
            verifiedAs: p.verified_as || null,   // admin-granted only (server-side)
            coverUrl: p.cover_url || '',
            coverTransform: p.cover_transform || null,
            location: p.location || '',
            yearsExperience: p.years_experience || '',
            languages: p.languages || ''
        });
        if (JSON.stringify(next) === JSON.stringify(user)) return;
        user = next;
        localStorage.setItem('user', JSON.stringify(user));
        if (typeof updateUI === 'function') updateUI();
    } catch (_) {}
}
window.addEventListener('rm-profile-self-changed', function () { _rmQueueOwnProfileSync(); });
window.addEventListener('storage', function (e) { if (e.key === 'rm_profile_self_changed') _rmQueueOwnProfileSync(); });

// Any follow/Realmate relationship change from OUTSIDE this tab (another tab or a
// live DB event — e.g. the other party accepting my follow request) → re-run
// loadProfile while viewing someone else's profile, so the Follow / Accept
// Follow / Follow Back / Following + Realmate buttons AND the content gate all
// reflect the new relationship without a manual refresh. My OWN action in this
// tab (detail.local) already updates its button in place and can't change my
// view of the other profile, so it's skipped here (no self-flicker). Debounced.
let _relRegateTimer = null;
function _onRelChangedRegate(e) {
    try {
        if (e && e.detail && e.detail.local) return;          // my own action — buttons already updated
        if (!_isViewingOther || typeof loadProfile !== 'function') return;
        if (_relRegateTimer) return;
        _relRegateTimer = setTimeout(function () { _relRegateTimer = null; try { loadProfile(); } catch (_) {} }, 250);
    } catch (_) {}
}
window.addEventListener('rm:rel-changed', _onRelChangedRegate);
window.addEventListener('storage', function (e) { if (e.key === 'rm_rel_changed') _onRelChangedRegate({ detail: { external: true } }); });

// A blocked user's profile can't be viewed (UGC safety). Instead of bouncing to
// the feed with a fleeting toast — which read as a broken half-second flash —
// replace the page with a PERSISTENT full-page notice. This is page content on a
// freshly-loaded page, NOT a tap-triggered overlay, so nothing (the opening tap,
// a navigation race) can tear it down: it stays until the user taps "Back to
// Feed". Covers every entry point (feed name-search, post avatar, mate list…).
// Which section opened this profile, decided by the navigation that brought us
// here: an explicit ?from= (set by the Portal when it opens the profile as a
// shell tab), else the page that navigated here. Unknown → Feed, as before.
function _profileOrigin() {
    var from = new URLSearchParams(location.search).get('from');
    if (from === 'portal' || from === 'feed') return from;
    try {
        var ref = document.referrer ? new URL(document.referrer) : null;
        if (ref && ref.origin === location.origin) {
            if (/\/livemarket\.html$/.test(ref.pathname)) return 'portal';
            if (/\/home\.html$/.test(ref.pathname)) return 'feed';
        }
    } catch (e) {}
    return 'feed';
}
function _renderBlockedProfileState() {
    var origin = _profileOrigin();
    var el = document.createElement('div');
    el.id = 'rmBlockedProfilePage';
    el.style.cssText = 'position:fixed; inset:0; background:#f4f7fa; display:flex; align-items:center; justify-content:center; padding:24px; z-index:2147483000;';
    el.innerHTML =
        '<div style="max-width:360px; width:100%; text-align:center;">' +
        '<div style="width:88px; height:88px; border-radius:50%; background:#fef2f2; display:flex; align-items:center; justify-content:center; margin:0 auto 22px;"><i class="fas fa-user-slash" style="font-size:38px; color:#ef4444;"></i></div>' +
        '<h2 style="font-size:22px; font-weight:800; color:#0f172a; margin:0 0 12px;">You blocked this user</h2>' +
        '<p style="color:#475569; font-size:15px; line-height:1.55; margin:0 0 28px;">You can no longer see their posts, listings, or profile. Unblock them in Settings to view again.</p>' +
        '<button id="rmBlockedBackBtn" style="width:100%; padding:15px; border-radius:12px; border:none; background:#32cd32; color:#fff; font-size:16px; font-weight:700; cursor:pointer; font-family:inherit;">' + (origin === 'portal' ? 'Back to Portal' : 'Back to Feed') + '</button>' +
        '</div>';
    document.body.appendChild(el);
    var btn = document.getElementById('rmBlockedBackBtn');
    if (btn) btn.addEventListener('click', function () {
        // In the mobile app-shell, rmBack returns to where this profile was opened
        // from — back within the Feed/Portal frame, or to the previous tab when the
        // Portal opened it in the Me tab (keeping that page's scroll). Otherwise
        // load the originating section.
        try { if (window.parent && window.parent !== window && window.parent.rmBack) { window.parent.rmBack(); return; } } catch (e) {}
        location.replace(origin === 'portal' ? 'livemarket.html' : 'home.html');
    });
}

// The open profile follows the shared block state: blocking this person from
// anywhere (another tab, the chat, another device) puts up the blocked notice
// at once; unblocking takes it down and loads their profile.
function _profileApplyBlockState() {
    try {
        if (!window.RMBR || !_viewUserId || String(_viewUserId) === String(RMBR.myId)) return;
        const page = document.getElementById('rmBlockedProfilePage');
        if (RMBR.isBlocked(_viewUserId)) { if (!page) _renderBlockedProfileState(); }
        else if (page) { page.remove(); loadProfile(); }
    } catch (e) {}
}
document.addEventListener('rmbr:changed', _profileApplyBlockState);

// Persistent full-page notice shown when the viewed account is DEACTIVATED.
// Mirrors _renderBlockedProfileState but is a neutral "unavailable" message —
// no blame, since the owner (not the viewer) chose to deactivate.
function _renderDeactivatedProfileState() {
    if (document.getElementById('rmDeactivatedProfilePage')) return;
    var el = document.createElement('div');
    el.id = 'rmDeactivatedProfilePage';
    el.style.cssText = 'position:fixed; inset:0; background:#f4f7fa; display:flex; align-items:center; justify-content:center; padding:24px; z-index:2147483000;';
    el.innerHTML =
        '<div style="max-width:360px; width:100%; text-align:center;">' +
        '<div style="width:88px; height:88px; border-radius:50%; background:#eef2f7; display:flex; align-items:center; justify-content:center; margin:0 auto 22px;"><i class="fas fa-user-clock" style="font-size:36px; color:#64748b;"></i></div>' +
        '<h2 style="font-size:22px; font-weight:800; color:#0f172a; margin:0 0 12px;">Account unavailable</h2>' +
        '<p style="color:#475569; font-size:15px; line-height:1.55; margin:0 0 28px;">This account is currently deactivated, so its profile, posts, and listings aren\'t available right now.</p>' +
        '<button id="rmDeactBackBtn" style="width:100%; padding:15px; border-radius:12px; border:none; background:#32cd32; color:#fff; font-size:16px; font-weight:700; cursor:pointer; font-family:inherit;">Back to Feed</button>' +
        '</div>';
    document.body.appendChild(el);
    var btn = document.getElementById('rmDeactBackBtn');
    if (btn) btn.addEventListener('click', function () {
        try { if (window.parent && window.parent !== window && window.parent.rmBack) { window.parent.rmBack(); return; } } catch (e) {}
        location.replace('home.html');
    });
}

// loadProfile() is a single-flight operation. While a load is running, another
// call never starts a competing one (two concurrent runs each rewrote the header,
// listings and wall — the visible "blinking"). It returns the SAME in-flight
// promise, and — because a caller usually means "something changed" — queues at
// most ONE follow-up run for when the current one finishes.
let _profileLoad = null;
let _profileLoadAgain = false;
let _profileLoadedAuthId = null;   // auth user the last completed load ran as
function loadProfile() {
    if (_profileLoad) { _profileLoadAgain = true; return _profileLoad; }
    _profileLoad = (async () => {
        try {
            do { _profileLoadAgain = false; await _loadProfileRun(); } while (_profileLoadAgain);
        } finally { _profileLoad = null; }
    })();
    return _profileLoad;
}
async function _loadProfileRun() {
    if (_supabase) {
        try {
            const _authUser = (await _supabase.auth.getUser()).data.user;
            const myAuthId = _authUser?.id;
            _profileLoadedAuthId = myAuthId || null;

            // UGC safety (App Store Guideline 1.2): a blocked user's profile cannot
            // be viewed. Wait for RMBR's block list, then bounce back to the feed.
            // Undo is Settings-only, so we do NOT offer an unblock here.
            if (_viewUserId && _viewUserId !== myAuthId && window.RMBR) {
                if (!RMBR.ready) { await new Promise(r => { const f = () => r(); document.addEventListener('rmbr:ready', f, { once: true }); setTimeout(f, 1500); }); }
                if (RMBR.isBlocked(_viewUserId, null)) {
                    // Don't bounce to the feed with a fleeting toast — that read as a
                    // broken half-second flash. Show a PERSISTENT full-page notice
                    // that stays until the user taps "Back to Feed".
                    _renderBlockedProfileState();
                    return;
                }
            }

            // Hide DEACTIVATED accounts: if the viewed user has deactivated their
            // account (and any auto-return window hasn't lapsed), show a persistent
            // "account unavailable" notice instead of their profile. Never applies
            // to yourself — a deactivated account is signed out. Fail-open.
            if (_viewUserId && _viewUserId !== myAuthId && window.RMDeact) {
                try {
                    if (await RMDeact.isDeactivated(_viewUserId)) {
                        _renderDeactivatedProfileState();
                        return;
                    }
                } catch (e) { /* show profile on error */ }
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
                            coverTransform: profile.cover_transform || null,
                            location: profile.location || '',
                            isVerified: !!profile.is_verified,
                            verifiedAs: profile.verified_as || null,   // admin-granted only, never from cache
                            professionalType: profile.professional_type || '',
                            brokerage: profile.brokerage || '',
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
                            // From the profile row only — never the phone's cached copy,
                            // which could still hold an old default (e.g. 'Alveo Land').
                            division: profile.division || '',
                            group: profile.business_group || '',
                            team: profile.team_name || '',
                            // From the profile row only — never the phone's cached copy, which
                            // could still hold text the member has since cleared.
                            bio: profile.bio || '',
                            relationship: profile.relationship_status || '',
                            coverUrl: profile.cover_url || '',
                            coverTransform: profile.cover_transform || null,
                            location: profile.location || user.location || '',
                            isVerified: !!profile.is_verified,
                            verifiedAs: profile.verified_as || null,   // admin-granted only, never from cache
                            professionalType: profile.professional_type || '',
                            brokerage: profile.brokerage || '',
                            lastSeen: profile.last_seen || '',
                            showActiveStatus: profile.show_active_status !== false,
                            yearsExperience: profile.years_experience || user.yearsExperience || '',
                            languages: profile.languages || user.languages || ''
                        };
                        localStorage.setItem("user", JSON.stringify(user));
                    }
                } else if (effectivelyViewingOther && profErr && user && user.id === targetId) {
                    // A re-run (live relationship change) whose fetch FAILED: keep the
                    // details already loaded for this same user rather than blanking them.
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
        const backBtn = document.getElementById('viewingOtherBack');
        if (backBtn) backBtn.style.display = 'inline-flex';
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
                    .or(`and(requester_id.eq.${myId},recipient_id.eq.${_viewUserId}),and(requester_id.eq.${_viewUserId},recipient_id.eq.${myId})`);
                if (!mateRows?.length && user.name) {
                    const res = await _supabase
                        .from('mates')
                        .select('status, requester_id, recipient_id, requester_name, recipient_name')
                        .or(`and(requester_name.eq.${myName},recipient_name.eq.${user.name}),and(requester_name.eq.${user.name},recipient_name.eq.${myName})`);
                    mateRows = res.data;
                }
                // Resolve the shared request state, preferring — in order —
                // already Realmates > an INCOMING request I can Accept > my own
                // SENT request. Fetching ALL rows (not .limit(1)) and putting the
                // incoming one first guarantees a mutual/received request is never
                // a dead-end "Request Sent" with no Accept option: whoever is the
                // recipient always gets an Accept path, so the pair can never both
                // be stuck on "Request Sent".
                const _mrows = mateRows || [];
                const _mAccepted = _mrows.some(r => r.status === 'accepted');
                const _mIncoming = _mrows.some(r => r.status === 'pending' && r.requester_id === _viewUserId);
                const _mSent     = _mrows.some(r => r.status === 'pending' && r.requester_id === myId);
                viewerIsRealmate = _mAccepted;
                if (_mAccepted)      _viewMateState = { status: 'accepted', dir: null };
                else if (_mIncoming) _viewMateState = { status: 'pending', dir: 'incoming' };
                else if (_mSent)     _viewMateState = { status: 'pending', dir: 'sent' };
                else                 _viewMateState = { status: 'none', dir: null };
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
        // A notification about MY OWN post lands here — scroll to + highlight that
        // exact post at its natural position in the Posts wall (polls for it to
        // render; no fixed delay). No-op when there's no pending deep-link.
        _consumeProfilePostDeepLink();
    }

    // About: show the SAME locked-state gate as Posts/Listings (not just a hidden
    // card) so a non-realmate consistently sees "Become realmates to view post,
    // listings and about" across all three sections (#12).
    // The header detail line (location / years / languages / relationship) is
    // part of the profile header, like the name and counts — it is rendered once
    // by updateUI() from the viewed user's own profile row and is NOT touched
    // here. This gate used to hide it after the access lookup resolved, which is
    // why the details appeared and then vanished.
    // About under the name: shown only to the owner and to people allowed in
    // (follower / realmate per RMPriv). Everyone else simply doesn't see it — no
    // gate message.
    window._rmAboutAllowed = !(effectivelyViewingOther && !_canPosts);
    _rmRenderBioPreview();
    const _aboutCard = document.querySelector('.about-card');
    if (effectivelyViewingOther && !_canPosts) {
        if (_aboutCard) _aboutCard.innerHTML = _realmateGateHtml(user.name, 'about');
    } else if (_aboutCard && _aboutCard.querySelector('[data-gate-kind]') && _aboutCardTemplate) {
        // Access is now granted (e.g. you just became realmates) but the card is
        // still showing the gate from a PRIOR render. There's no "un-gate" for it
        // otherwise — only a full page reload rebuilt the DOM — so RESTORE the real
        // About markup and re-populate it, unlocking About in real time. (updateUI
        // ran earlier while the card was still a gate, so bioDisplay didn't exist
        // then; repopulate it here.)
        _aboutCard.innerHTML = _aboutCardTemplate;
        var _bioEl = document.getElementById('bioDisplay');
        if (_bioEl) _bioEl.innerText = user.bio || '';
        var _aboutEmptyEl = document.getElementById('aboutEmptyState');
        if (_aboutEmptyEl) _aboutEmptyEl.style.display = (user.bio && user.bio.trim()) ? 'none' : 'block';
    }
}

// About text below the name (#bioPreview). Hidden — with no placeholder — for a
// viewer who isn't allowed in, and while that hasn't been decided yet (so it
// never flashes before the access check finishes).
function _rmRenderBioPreview() {
    const el = document.getElementById('bioPreview');
    if (!el) return;
    const allowed = !effectivelyViewingOtherProfile() || window._rmAboutAllowed === true;
    const bio = (typeof user !== 'undefined' && user && user.bio) ? String(user.bio).trim() : '';
    if (allowed && bio) { el.innerText = bio; el.style.display = 'block'; }
    else { el.innerText = ''; el.style.display = 'none'; }
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
    if (_dashListingsCtx) renderRecentListings(_dashListingsCtx.targetId, _dashListingsCtx.canView, true);
}

// Listings render is single-flight per destination (owner id + access). A second
// request for the SAME destination while one is running reuses that run instead
// of starting a duplicate fetch; a data-change refresh (changed=true) queues ONE
// follow-up. A request for a DIFFERENT destination supersedes the old run, whose
// late results are then discarded (see the `live()` checks) so only the intended
// owner's listings can ever be painted.
let _listingsRun = null;   // { key, token, promise, again }
let _listingsSeq = 0;
function renderRecentListings(targetId, canView = true, changed = false) {
    const key = String(targetId) + '|' + (canView ? 1 : 0);
    if (_listingsRun && _listingsRun.key === key) {
        if (changed) _listingsRun.again = true;
        return _listingsRun.promise;
    }
    const run = { key, token: ++_listingsSeq, again: false, promise: null };
    _listingsRun = run;
    run.promise = (async () => {
        try {
            do {
                run.again = false;
                await _renderRecentListingsRun(targetId, canView, () => _listingsRun === run);
            } while (run.again && _listingsRun === run);
        } finally { if (_listingsRun === run) _listingsRun = null; }
    })();
    return run.promise;
}

// Keep Profile → Listings in sync with Portal → My Listings (the SAME `listings`
// table). Subscribe to realtime INSERT/UPDATE/DELETE for THIS profile owner and
// re-render on any change — so a listing created / marked Sold/Bought/Rented/Leased
// / edited / deleted elsewhere reflects here live, in the same created_at order
// (renderRecentListings always re-fetches ORDER BY created_at DESC). Same-origin
// app-shell iframes also nudge it via the rm_listing_* storage keys below.
let _profileListingsChannel = null;
let _profileListingsSubbedFor = null;
function _subscribeProfileListings(targetId) {
    if (!_supabase || !_supabase.channel || !targetId) return;
    if (_profileListingsSubbedFor === targetId && _profileListingsChannel) return;  // already subscribed
    if (_profileListingsChannel) { try { _supabase.removeChannel(_profileListingsChannel); } catch (e) {} _profileListingsChannel = null; }
    _profileListingsSubbedFor = targetId;
    try {
        _profileListingsChannel = _supabase.channel('profile-listings-' + targetId)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'listings', filter: 'user_id=eq.' + targetId },
                function () { try { reloadDashboardListings(); } catch (e) {} })
            .subscribe();
    } catch (e) { /* realtime optional — needs listings-realtime-migration.sql */ }
}
// Same-device cross-iframe instant nudge (Portal iframe → Profile iframe).
window.addEventListener('storage', function (e) {
    if (e.key === 'rm_listing_changed' || e.key === 'rm_listing_edited') {
        try { reloadDashboardListings(); } catch (_) {}
    }
});

async function _renderRecentListingsRun(targetId, canView, live) {
    _dashListingsCtx = { targetId, canView };
    if (canView && targetId) _subscribeProfileListings(targetId);   // live sync with Portal
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

    // Show the loading state only when there is nothing of THIS owner's on screen
    // yet. A refresh of already-rendered listings swaps the cards in one step at
    // the end instead of flashing back to the spinner.
    const _hasContent = wrap.dataset.listingsFor === String(targetId)
        && wrap.children.length > 0 && !wrap.querySelector('.listings-loading');
    if (!_hasContent) wrap.innerHTML = _LISTINGS_LOADING_HTML;

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
        if (!live()) return;   // superseded by a newer destination — discard

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

        if (!live()) return;
        if (!visible || visible.length === 0) {
            wrap.dataset.listingsFor = String(targetId);
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
                .select('full_name, avatar_url, job_title, is_verified, verified_as')
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
                        user_verified_as: liveProfile.verified_as || null,
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

        if (!live()) return;
        wrap.dataset.listingsFor = String(targetId);
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

// Shrink a picked profile/cover photo BEFORE it reaches the crop editor, so the
// editor, the saved framing and the stored file all refer to the same pixels.
// Re-encodes as JPEG (PNG photos stay multi-MB). Fail-open: returns the original.
async function _rmShrinkPhoto(file, maxPx) {
    try {
        return (typeof compressImage === 'function')
            ? await compressImage(file, { maxPx: maxPx, quality: 0.85, forceJpeg: true }) : file;
    } catch (e) { return file; }
}

async function uploadImage(file, path) {
    if(!_supabase) return null;
    try {
        const fileName = `${path}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
        // Unique (timestamped) name → safe to cache for a year.
        const { data, error } = await _supabase.storage.from('images').upload(fileName, file, { cacheControl: '31536000' });
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

    // Capture the CURRENT display name before overwriting it, so a rename can be
    // remembered in former_names (others can still @-tag this account by the name
    // they knew — see fetchTagCandidates in home.js).
    const _prevName = (user.name || '').trim();
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
    // Division / Group / Team are no longer edited here (removed from Edit
    // Profile); their stored values are left exactly as they are — see the
    // profiles update below, which no longer writes those columns.
    // Declared profession + brokerage. Changing the profession does NOT change a
    // verified badge — that is admin-granted only (Get verified box below).
    const _pt = (document.getElementById("editProfessionalType") || {}).value || '';
    user.professionalType = (_pt === 'salesperson' || _pt === 'broker') ? _pt : '';
    user.brokerage = ((document.getElementById("editBrokerage") || {}).value || '').trim().slice(0, 120);
    user.relationship = document.getElementById("editRelationship").value;
    // Relationship Status is optional — blank saves as null and hides the line.

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
                // If the display name changed, append the OLD name to former_names
                // (newline-joined) so the account stays discoverable/taggable by it.
                // undefined => leave the column untouched (upsert skips it).
                let _formerNamesUpdate;
                try {
                    const _newName = (user.name || '').trim();
                    if (_prevName && _newName && _prevName.toLowerCase() !== _newName.toLowerCase()) {
                        const { data: _prof } = await _supabase.from('profiles').select('former_names').eq('id', authUser.id).single();
                        const list = (_prof?.former_names || '').split('\n').map(s => s.trim()).filter(Boolean);
                        const lower = new Set(list.map(s => s.toLowerCase()));
                        if (!lower.has(_prevName.toLowerCase())) list.push(_prevName);
                        // The new current name is not a "former" name — drop it if present.
                        _formerNamesUpdate = list.filter(s => s.toLowerCase() !== _newName.toLowerCase()).join('\n');
                    }
                } catch (_) {}

                const { error } = await _supabase.from('profiles').upsert({
                    id: authUser.id,
                    full_name: user.name,
                    ...(_formerNamesUpdate !== undefined ? { former_names: _formerNamesUpdate } : {}),
                    username: user.username,
                    nickname: user.nickname || null,
                    // Positions were removed from Realmate — always clear any
                    // stored career position on save.
                    job_title: null,
                    bio: user.bio,
                    avatar_url: user.image,
                    relationship_status: user.relationship || null,
                    professional_type: user.professionalType || null,
                    brokerage: user.brokerage || null,
                    location: user.location || null,
                    years_experience: user.yearsExperience || null,
                    languages: user.languages || null,
                    updated_at: new Date()
                });
                if (error) throw error;

                // Keep the auth metadata's username in sync (profiles, saved above,
                // is what sign-in resolves username → email from). Best-effort —
                // a failure here shouldn't block the profile save that already landed.
                if (_usernameChanged) {
                    try { await _supabase.auth.updateUser({ data: { username: user.username } }); } catch (_) {}
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
    document.getElementById("editRelationship").value = user.relationship || '';
    if (document.getElementById("editProfessionalType")) document.getElementById("editProfessionalType").value = user.professionalType || '';
    if (document.getElementById("editBrokerage")) document.getElementById("editBrokerage").value = user.brokerage || '';

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
    gvRefresh();
}

// ── Get verified (Edit Profile) ──────────────────────────────────────────────
// The member uploads their Professional ID for an admin review. The badge itself
// is granted only by an admin (Admin › Verifications / User Details), so nothing
// here — and nothing about the Profession field — changes it.
const GV_MAX_BYTES = 5 * 1024 * 1024;
const GV_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
let _gvFile = null;

function _gvMsg(text, kind) {
    const m = document.getElementById('gvMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'gv-msg' + (kind ? ' gv-msg-' + kind : '');
}

function _gvTypeLabel(t) { return t === 'broker' ? 'Broker' : t === 'salesperson' ? 'Salesperson' : ''; }

function gvPickFile(input) {
    const f = input && input.files && input.files[0];
    const wrap = document.getElementById('gvUploadWrap');
    const name = document.getElementById('gvFileName');
    _gvFile = null;
    if (wrap) wrap.classList.remove('has-file', 'error');
    if (name) name.textContent = 'Upload Professional ID';
    _gvMsg('');
    if (!f) return;
    const okType = GV_TYPES.includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name || '');
    if (!okType) { if (wrap) wrap.classList.add('error'); _gvMsg('Use a JPG, PNG or PDF file.', 'error'); input.value = ''; return; }
    if (f.size > GV_MAX_BYTES) { if (wrap) wrap.classList.add('error'); _gvMsg('That file is over 5MB.', 'error'); input.value = ''; return; }
    _gvFile = f;
    if (wrap) wrap.classList.add('has-file');
    if (name) name.textContent = f.name;
}

async function gvRefresh() {
    const st = document.getElementById('gvStatus');
    if (!st) return;
    _gvFile = null;
    const fi = document.getElementById('gvFile'); if (fi) fi.value = '';
    const wrap = document.getElementById('gvUploadWrap'); if (wrap) wrap.classList.remove('has-file', 'error');
    const nm = document.getElementById('gvFileName'); if (nm) nm.textContent = 'Upload Professional ID';
    const prc = document.getElementById('gvPrc'); if (prc) prc.value = '';
    _gvMsg('');
    const verified = user.verifiedAs ? (window.RMVerified ? RMVerified.label(user.verifiedAs) : 'Verified') : '';
    st.className = 'gv-status' + (verified ? ' gv-status-ok' : '');
    st.textContent = verified || 'Not verified';
    if (!_supabase) return;
    try {
        const { data: { user: authUser } } = await _supabase.auth.getUser();
        if (!authUser) return;
        const { data, error } = await _supabase.from('verification_requests')
            .select('status, requested_type, note, created_at').eq('user_id', authUser.id)
            .order('created_at', { ascending: false }).limit(1);
        if (error) throw error;
        const last = data && data[0];
        if (!last) return;
        if (last.status === 'pending') {
            st.className = 'gv-status gv-status-pending';
            st.textContent = 'Pending review' + (last.requested_type ? ' (' + _gvTypeLabel(last.requested_type) + ')' : '') +
                (verified ? ' · currently ' + verified : '');
        } else if (last.status === 'rejected' && !verified) {
            st.className = 'gv-status gv-status-rejected';
            st.textContent = 'Not verified. Your last request was not approved' + (last.note ? ': ' + last.note : '.');
        }
    } catch (e) {
        console.error('[get-verified] status', e);
    }
}

async function gvSubmit() {
    const btn = document.getElementById('gvSubmitBtn');
    const type = (document.getElementById('editProfessionalType') || {}).value || '';
    if (type !== 'salesperson' && type !== 'broker') { _gvMsg('Choose your Profession above first.', 'error'); return; }
    if (!_gvFile) { const w = document.getElementById('gvUploadWrap'); if (w) w.classList.add('error'); _gvMsg('Upload your Professional ID first.', 'error'); return; }
    if (!_supabase) { _gvMsg('You are offline. Try again in a moment.', 'error'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
        const { data: { user: authUser } } = await _supabase.auth.getUser();
        if (!authUser) throw new Error('Please sign in again.');
        const safe = (_gvFile.name || 'id').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
        const path = `${authUser.id}/verify_${Date.now()}_${safe}`;
        const { error: upErr } = await _supabase.storage.from('verification-docs')
            .upload(path, _gvFile, { contentType: _gvFile.type || undefined, upsert: false });
        if (upErr) throw upErr;
        const prc = ((document.getElementById('gvPrc') || {}).value || '').trim().slice(0, 40);
        const brokerage = ((document.getElementById('editBrokerage') || {}).value || '').trim().slice(0, 120);
        const { error: insErr } = await _supabase.from('verification_requests').insert({
            user_id: authUser.id, requested_type: type, prc_license_no: prc || null,
            brokerage: brokerage || null, file_path: path,
        });
        if (insErr) throw insErr;
        await gvRefresh();
        _gvMsg('Sent. An admin will review your ID.', 'ok');
    } catch (e) {
        console.error('[get-verified] submit', e);
        _gvMsg('Could not submit: ' + (e && e.message ? e.message : 'please try again.'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Submit for verification'; }
    }
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
// The photo / cover menus (Reposition, Photo Library, Take Photo, Change Photo) are
// OWNER-ONLY. On someone else's profile a tap just opens the picture full-size, and
// every edit entry point below refuses to run as a second line of defence.
function openPhotoActionSheet() {
    if (effectivelyViewingOtherProfile()) { viewFullPhoto(); return; }
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

// Inline photo-options dropdown anchored UNDER the profile picture (replaces the
// floating/bottom-sheet chooser so the options read as part of the avatar). Does
// NOT open the keyboard and does NOT lock page scroll — it's a lightweight popover.
function togglePhotoInlineMenu(e) {
    if (e) e.stopPropagation();
    if (effectivelyViewingOtherProfile()) { closePhotoInlineMenu(); viewFullPhoto(); return; }
    const menu = document.getElementById("photoInlineMenu");
    if (!menu) return;
    if (menu.style.display === "none" || !menu.style.display) openPhotoInlineMenu();
    else closePhotoInlineMenu();
}
function openPhotoInlineMenu() {
    const menu = document.getElementById("photoInlineMenu");
    if (!menu) return;
    menu.style.display = "block";
    setTimeout(() => document.addEventListener("click", _photoMenuOutside, true), 0);
}
function closePhotoInlineMenu() {
    const menu = document.getElementById("photoInlineMenu");
    if (menu) menu.style.display = "none";
    document.removeEventListener("click", _photoMenuOutside, true);
}
function _photoMenuOutside(e) {
    const wrap = document.querySelector(".profile-avatar-wrap");
    if (wrap && !wrap.contains(e.target)) closePhotoInlineMenu();
}

// Open the picker for a chosen source directly, instead of a bare fileInput.click()
// (which makes iOS show its own dark "Photo Library / Take Photo / Choose File"
// menu). Each source configures the SAME input + change handler, so the upload/
// crop flow is unchanged:
//   library → accept image only          (photo library)
//   camera  → accept image + capture     (opens the camera directly)
//   file    → no accept                   (Files / document picker)
function changeImage(source) {
    closePhotoActionSheet();
    closePhotoInlineMenu();
    if (effectivelyViewingOtherProfile()) return;
    const fi = document.getElementById("fileInput");
    if (!fi) return;
    try {
        if (source === 'camera') {
            fi.setAttribute('accept', 'image/*');
            fi.setAttribute('capture', 'environment');
        } else if (source === 'file') {
            fi.removeAttribute('accept');
            fi.removeAttribute('capture');
        } else { // 'library' (default)
            fi.setAttribute('accept', 'image/*');
            fi.removeAttribute('capture');
        }
    } catch (e) {}
    fi.click();
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

    // Reset the Apply button every time the cropper opens. applyCrop() sets it to
    // "Saving…" + disabled and only closes the modal afterward (never restores it),
    // so without this a later open would still show the stale "Saving…" state.
    const applyBtn = document.getElementById("applyCropBtn");
    if (applyBtn) { applyBtn.disabled = false; applyBtn.innerHTML = '<i class="fas fa-check"></i> Apply & Save'; }

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
    if (effectivelyViewingOtherProfile()) return;
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
            // Also repaint THIS page's composer + Posts-tab post-card avatars.
            try { _rmRepaintOwnProfileAvatars(publicUrl); } catch (e) {}
            // Propagate the new avatar to every OTHER cached app-shell iframe
            // (feed composer, navbars, etc.) without a reload. localStorage is
            // shared same-origin; writing this key fires a `storage` event in the
            // other frames, which re-render their avatars from the updated user.
            // (updateUI already refreshed THIS page's profile + nav avatar.)
            try { localStorage.setItem('rm_avatar_changed', JSON.stringify({ url: publicUrl, ts: Date.now() })); } catch (e) {}
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
    // The "Choose File" source has no accept filter — never take a video/document.
    if (!(this.files[0].type || '').startsWith('image/')) {
        this.value = "";
        (window.showToast || function(){})('Please choose a photo.', 'error');
        return;
    }
    // Store the (compressed, max 1600px) original so applyCrop can upload it
    // separately — it is only ever used as the source for re-cropping.
    _rmShrinkPhoto(this.files[0], 1600).then((picked) => {
        window._pendingOriginalFile = new File(
            [picked],
            `original_${Date.now()}_${picked.name}`,
            { type: picked.type }
        );
        const reader = new FileReader();
        reader.onload = (e) => openCropModal(e.target.result);
        reader.readAsDataURL(picked);
    });
});


// Modified initialization:
window.onload = async () => {
    if (_supabase) {
        await loadProfile();
        _supabase.auth.onAuthStateChange((event, session) => {
            // supabase-js re-emits SIGNED_IN whenever the tab regains focus. Only a
            // DIFFERENT signed-in user needs the profile rebuilt; the same user is
            // already loaded (or loading), so re-running would only re-render.
            if (event !== 'SIGNED_IN') return;
            const uid = session && session.user && session.user.id;
            if (_profileLoad || (uid && uid === _profileLoadedAuthId)) return;
            loadProfile();
        });
    }
};

async function uploadCoverPhoto(input) {
    const raw = input.files?.[0];
    if (!raw || effectivelyViewingOtherProfile()) return;
    if (!(raw.type || '').startsWith('image/')) { (window.showToast || function(){})('Please choose a photo.', 'error'); return; }
    // Compressed (max 2000px) BEFORE the editor opens, so the saved framing's
    // natural-pixel coordinates match the stored image exactly.
    const file = await _rmShrinkPhoto(raw, 2000);
    _coverNewUploadFile = file;   // uploaded as-is on save (never a cropped canvas)
    const reader = new FileReader();
    reader.onload = e => openCoverCropModal(e.target.result, true);
    reader.readAsDataURL(file);
}

function openCoverActionSheet() {
    if (effectivelyViewingOtherProfile()) { viewFullCover(); return; }
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
    if (effectivelyViewingOtherProfile()) return;
    document.getElementById('coverPhotoInput').click();
}

async function repositionCover() {
    closeCoverActionSheet();
    if (effectivelyViewingOtherProfile()) return;
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

// Reproduce a saved cover reposition/zoom on the display layer. `t` is the crop
// rectangle Cropper reported in natural-image pixels at save time, plus the
// image's natural size: { x, y, width, height, nW, nH }. We map that rectangle
// to fill the cover box using the standard CSS background-size + background-
// position percentage formulas, so it scales with any container width and never
// touches the underlying full-resolution image. Missing/invalid transform →
// cover/center (the pre-existing default).
function _applyCoverTransform(el, t) {
    try { if (typeof t === 'string') t = JSON.parse(t); } catch { t = null; }
    const ok = t && [t.x, t.y, t.width, t.height, t.nW, t.nH].every(n => typeof n === 'number' && isFinite(n))
        && t.width > 0 && t.height > 0 && t.nW > 0 && t.nH > 0;
    el._coverT = ok ? t : null;
    // Re-frame whenever the cover frame changes size (window resize, the frame
    // first becoming visible) — the framing below depends on the frame's real
    // pixel size, not just its percentages.
    if (!el._coverRO && typeof ResizeObserver === 'function') {
        el._coverRO = new ResizeObserver(() => _layoutCover(el));
        el._coverRO.observe(el);
    }
    _layoutCover(el);
}
// Frame the saved crop rectangle inside the cover WITHOUT distorting the image.
// The rectangle is saved in the editor's 5:3 shape, but the frame is not always
// 5:3 (desktop is a wide strip). Sizing the background as independent width/height
// percentages forced that rectangle to fill the frame exactly, stretching the
// picture on desktop. Instead: scale the image uniformly so the rectangle COVERS
// the frame, centred on the rectangle's centre and clamped to the image edges —
// identical to the old result whenever the frame is 5:3, never stretched otherwise.
function _layoutCover(el) {
    const t = el._coverT;
    if (!t) {
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        return;
    }
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!(cw > 0 && ch > 0)) {
        // Not laid out yet (hidden) — aspect-safe placeholder; the ResizeObserver
        // re-frames it properly as soon as the frame has a size.
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        return;
    }
    const scale = Math.max(cw / t.width, ch / t.height);
    const bw = t.nW * scale, bh = t.nH * scale;
    const clamp = (v, lo) => Math.min(0, Math.max(lo, v));
    const left = clamp(cw / 2 - (t.x + t.width / 2) * scale, cw - bw);
    const top  = clamp(ch / 2 - (t.y + t.height / 2) * scale, ch - bh);
    el.style.backgroundSize = `${bw}px ${bh}px`;
    el.style.backgroundPosition = `${left}px ${top}px`;
}

let _coverCropper = null;

let _coverIsNewUpload = false;
// The ORIGINAL file for a brand-new cover upload. Saving uploads THIS full image
// (never a cropped canvas) so the source always stays fully re-editable.
let _coverNewUploadFile = null;

function openCoverCropModal(src, isNewUpload) {
    _coverIsNewUpload = !!isNewUpload;
    if (!_coverIsNewUpload) _coverNewUploadFile = null;   // repositioning: no new file
    // Repositioning restores the previously-saved framing as the STARTING state.
    // Because the editor always loads the full original image (src) and viewMode:1
    // only prevents zooming out past cover-fit of that original, the user can
    // always zoom/pan back to the base scale — the saved zoom is a starting
    // point, never a new minimum. New uploads start at the default framing.
    const restore = _coverIsNewUpload ? null : (user && user.coverTransform);
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
        ready() {
            let t = restore;
            try { if (typeof t === 'string') t = JSON.parse(t); } catch { t = null; }
            if (t && typeof t.width === 'number' && typeof t.height === 'number'
                && t.width > 0 && t.height > 0) {
                // Reproduce the saved crop rectangle (natural-image px). setData
                // pans/zooms the canvas to match; viewMode:1 keeps the full
                // zoom-out range available from here.
                try { _coverCropper.setData({ x: t.x, y: t.y, width: t.width, height: t.height }); } catch {}
            }
        },
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
        // Capture the framing as the crop rectangle in NATURAL image pixels plus
        // the image's natural size. This is the only thing saved for a reposition
        // — we never bake a cropped/zoomed copy, so repeated edits can never
        // progressively crop and the user can always zoom back to base scale.
        const d = _coverCropper.getData(true);              // {x,y,width,height,...} natural px
        const imgData = _coverCropper.getImageData();        // naturalWidth/naturalHeight
        const nW = Math.round(imgData.naturalWidth);
        const nH = Math.round(imgData.naturalHeight);
        const transform = {
            x: Math.max(0, Math.round(d.x)),
            y: Math.max(0, Math.round(d.y)),
            width: Math.round(d.width),
            height: Math.round(d.height),
            nW, nH,
        };
        if (!(transform.width > 0 && transform.height > 0 && nW > 0 && nH > 0)) {
            throw new Error('Could not read image dimensions.');
        }

        const { data: authData } = await _supabase.auth.getUser();
        const userId = authData?.user?.id;

        // Only a brand-new upload writes an image; it uploads the FULL original
        // (never a cropped canvas). Repositioning reuses the existing original
        // URL untouched, so the source image stays fully re-editable forever.
        let url = user.coverUrl;
        if (_coverIsNewUpload && _coverNewUploadFile) {
            const ext = (_coverNewUploadFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const path = `covers/${userId}_${Date.now()}.${ext}`;
            const { error } = await _supabase.storage.from('images').upload(
                path, _coverNewUploadFile, { upsert: true, cacheControl: '31536000', contentType: _coverNewUploadFile.type || undefined });
            if (error) throw error;
            url = _supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
        }
        if (!url) throw new Error('No cover image to save.');

        await _supabase.from('profiles').update({ cover_url: url, cover_transform: transform }).eq('id', userId);
        user.coverUrl = url;
        user.coverTransform = transform;
        localStorage.setItem('user', JSON.stringify(user));
        updateUI();
        const preview = document.getElementById('coverActionSheetPreview');
        if (preview) { preview.src = url; preview.style.display = 'block'; }
        _coverNewUploadFile = null;
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
                    _rmGoChat();   // shell-aware: also activates the Chat bottom-nav tab
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