const _sbSearch = window.supabase.createClient(
    'https://wmegpgrfrtprhuzmgjma.supabase.co',
    'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4'
);

let _searchTimer = null;
let _lastQuery   = '';
let _activeTab   = 'all';
let _allPeople   = [];
let _allListings = [];

// The four Admin-assigned positions are the only valid position values —
// anything else (legacy free text, empty) is treated as no position. Never
// a placeholder like "Real Estate Professional" — no position means none.
function _searchValidPosition(job) { return ''; }

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when generated, so
// trusting a stored one as-is after a rename shows stale initials forever.
// Regenerate fresh from the current name whenever there's no real upload.
function _searchAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;
}

function switchTab(btn) {
    document.querySelectorAll('.s-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeTab = btn.dataset.tab;
    renderResults(_allPeople, _allListings);
}

function onSearchInput() {
    const q = document.getElementById('globalSearchInput').value.trim();
    document.getElementById('searchClearBtn').style.display = q ? 'flex' : 'none';
    clearTimeout(_searchTimer);
    if (!q) { clearSearch(); return; }
    document.getElementById('searchTabs').style.display = 'flex';
    showSearching();
    _searchTimer = setTimeout(() => runSearch(q), 300);
}

function clearSearch() {
    document.getElementById('globalSearchInput').value = '';
    document.getElementById('searchClearBtn').style.display = 'none';
    document.getElementById('searchTabs').style.display = 'none';
    _allPeople = []; _allListings = [];
    document.getElementById('searchResults').innerHTML = `
        <div class="search-empty-state">
            <i class="fas fa-magnifying-glass"></i>
            <p>Start typing to search across the entire Realmate network.</p>
        </div>`;
}

function showSearching() {
    document.getElementById('searchResults').innerHTML = `
        <div class="search-empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Searching…</p>
        </div>`;
}

async function runSearch(q) {
    if (q === _lastQuery) return;
    _lastQuery = q;

    const pattern = `%${q}%`;

    const [peopleRes, listingsRes] = await Promise.all([
        _sbSearch.from('profiles')
            .select('id, full_name, avatar_url, job_title, division, bio')
            .or(`full_name.ilike.${pattern},job_title.ilike.${pattern},division.ilike.${pattern}`)
            .limit(20),
        _sbSearch.from('listings')
            .select('id, content, category, user_name, user_id, created_at, hidden_user_ids')
            .or(`content.ilike.${pattern},category.ilike.${pattern},user_name.ilike.${pattern}`)
            .eq('archived', false)
            .order('created_at', { ascending: false })
            .limit(30)
    ]);

    _allPeople   = peopleRes.data   || [];
    _allListings = listingsRes.data || [];

    // Listings store the poster's name as a snapshot taken when the listing
    // was posted — overlay each one with the poster's LIVE profiles.full_name
    // (looked up by user_id) so a rename shows up immediately instead of the
    // stale name the listing was created under.
    const listingUserIds = [...new Set(_allListings.filter(l => l.user_id).map(l => l.user_id))];
    if (listingUserIds.length) {
        const { data: posters } = await _sbSearch.from('profiles')
            .select('id, full_name').in('id', listingUserIds);
        const nameById = {};
        (posters || []).forEach(p => { nameById[p.id] = p.full_name; });
        _allListings.forEach(l => {
            if (l.user_id && nameById[l.user_id]) l.user_name = nameById[l.user_id];
        });
    }

    // Visibility Controls: hide listings this viewer isn't allowed to discover
    // (same filter the Portal applies via visibility.js). Fails open — any error
    // or missing data leaves the listing visible, matching the prior behavior.
    if (window.RMVisibility) {
        try {
            const myId = (await _sbSearch.auth.getUser()).data?.user?.id || null;
            const unlockedOwners = await RMVisibility.fetchUnlockedOwnerIds(_sbSearch, myId);
            _allListings = _allListings.filter(l => RMVisibility.visibleToViewer(l, myId, unlockedOwners));
        } catch (e) {
            console.warn('[Visibility] search filter failed, showing all:', e);
        }
    }

    renderResults(_allPeople, _allListings);
}

function renderResults(people, listings) {
    const container = document.getElementById('searchResults');
    const showPeople   = _activeTab === 'all' || _activeTab === 'people';
    const showListings = _activeTab === 'all' || _activeTab === 'listings';

    const filteredPeople   = showPeople   ? people   : [];
    const filteredListings = showListings ? listings : [];

    if (!filteredPeople.length && !filteredListings.length) {
        container.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-circle-xmark"></i>
                <p>No results found. Try a different keyword.</p>
            </div>`;
        return;
    }

    let html = '';

    if (filteredPeople.length) {
        html += `<div class="search-section-label"><i class="fas fa-users"></i> People <span class="s-count">${filteredPeople.length}</span></div>`;
        html += `<div class="people-grid">`;
        filteredPeople.forEach(p => {
            const name   = esc(p.full_name || 'Realmate Member');
            const job    = esc(_searchValidPosition(p.job_title));
            const div    = esc(p.division  || '');
            const bio    = esc((p.bio || '').slice(0, 80));
            const avatar = _searchAvatarFor(p.full_name, p.avatar_url);
            html += `
            <a href="dashboard.html?user_id=${p.id}" class="people-card">
                <img src="${avatar}" class="people-avatar"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name||'?')}&background=0f172a&color=32cd32'">
                <div class="people-info">
                    <div class="people-name">${name}</div>
                    ${(job || div) ? `<div class="people-job">${[job, div].filter(Boolean).join(' · ')}</div>` : ''}
                    ${bio ? `<div class="people-bio">${bio}…</div>` : ''}
                </div>
                <i class="fas fa-chevron-right people-arrow"></i>
            </a>`;
        });
        html += `</div>`;
    }

    if (filteredListings.length) {
        html += `<div class="search-section-label" style="margin-top:${filteredPeople.length ? '32px' : '0'}"><i class="fas fa-tag"></i> Listings <span class="s-count">${filteredListings.length}</span></div>`;
        html += `<div class="listings-stack">`;
        filteredListings.forEach(l => {
            const cat     = esc(l.category || '');
            const content = esc((l.content || '').slice(0, 160));
            const poster  = esc(l.user_name || 'Unknown');
            const date    = new Date(l.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
            const catClass = cat.toLowerCase().replace(/\s+/g, '-');
            html += `
            <a href="livemarket.html" class="listing-result-card">
                <div class="lr-top">
                    ${cat ? `<span class="lr-badge lr-${catClass}">${cat}</span>` : ''}
                    <span class="lr-date">${date}</span>
                </div>
                <div class="lr-content">${content}${(l.content||'').length > 160 ? '…' : ''}</div>
                <div class="lr-poster"><i class="fas fa-user-circle"></i> ${poster}</div>
            </a>`;
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

function esc(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, ' ');
}

// Pre-fill from URL ?q=
window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) {
        document.getElementById('globalSearchInput').value = q;
        onSearchInput();
    }
});
