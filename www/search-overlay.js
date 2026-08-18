(() => {
    const SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';

    // The four Admin-assigned positions are the only valid position values —
    // anything else (legacy free text, empty) is treated as no position.
    const soValidPosition = (job) => '';

    // A ui-avatars.com URL is an auto-generated initials placeholder, not a
    // real uploaded photo — it bakes in whatever name was current when
    // generated, so trusting a stored one as-is after a rename shows stale
    // initials forever. Regenerate fresh from the current name whenever
    // there's no real upload.
    const soAvatarFor = (name, storedUrl) => (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;

    // This same search overlay is shared across every page (Feed, Forum,
    // Portal, etc.) via one file. Forum search has a stricter listing
    // visibility rule than the rest of the app — a listing should only
    // surface there if the searcher and the poster are Realmates — so this
    // is checked at render time rather than splitting the widget in two.
    const IS_FORUM_PAGE = /forum\.html/i.test(location.pathname);
    // Feed (home.html) has its own inline search bar that opens this same
    // shared overlay (see wireUniversalInputs below) rather than the FAB.
    const IS_FEED_PAGE = location.pathname.endsWith('home.html') || location.pathname === '/';
    // Notifications Hub's header search button clicks the (hidden) FAB to
    // open this same overlay too — same interaction pattern as Feed, with
    // its own separate Recent Searches bucket.
    const IS_NOTIF_PAGE = /notifications\.html/i.test(location.pathname);
    // Realmates page: this overlay searches ONLY registered users/profiles —
    // never listings, forum posts, or any other Portal content. Selecting a
    // result opens that user's profile. Kept deliberately separate from the
    // Portal/global search, which spans people + listings + forum.
    const IS_REALMATES_PAGE = /realmates\.html/i.test(location.pathname);

    // Returns the set of account ids the current user is an accepted
    // Realmate with — by id, not display name, so a rename never affects
    // who counts as connected.
    async function getMyRealmateIds(sb, myId) {
        if (!myId) return new Set();
        try {
            const [a, b] = await Promise.all([
                sb.from('mates').select('recipient_id').eq('requester_id', myId).eq('status', 'accepted'),
                sb.from('mates').select('requester_id').eq('recipient_id', myId).eq('status', 'accepted')
            ]);
            const ids = new Set();
            (a.data || []).forEach(r => r.recipient_id && ids.add(String(r.recipient_id)));
            (b.data || []).forEach(r => r.requester_id && ids.add(String(r.requester_id)));
            return ids;
        } catch { return new Set(); }
    }

    // Search history — persisted per account (keyed by user id, so one
    // user's history never appears for another) AND per context (Feed vs
    // Forum use separate keys, so a search made on one never shows up on the
    // other), newest first, capped at 10. Only actually-submitted searches
    // (searchNow(), not every debounced keystroke) are saved. Any other page
    // that hosts this overlay (Portal, Settings, etc.) has no history —
    // _soHistoryContext() returns null there and the feature no-ops.
    const SO_HISTORY_MAX = 10;
    function _soHistoryContext() {
        if (IS_FORUM_PAGE) return 'forum';
        if (IS_FEED_PAGE) return 'feed';
        if (IS_NOTIF_PAGE) return 'notifications';
        return null;
    }
    function _soHistoryKey() {
        let me = {};
        try { me = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (e) {}
        return `so_${_soHistoryContext() || 'other'}_search_history_${me.id || 'anon'}`;
    }
    function getSearchHistory() {
        try { return JSON.parse(localStorage.getItem(_soHistoryKey())) || []; } catch (e) { return []; }
    }
    function saveSearchHistory(list) {
        try { localStorage.setItem(_soHistoryKey(), JSON.stringify(list.slice(0, SO_HISTORY_MAX))); } catch (e) {}
    }
    // A history entry remembers WHAT was actually selected — a profile
    // (type:'profile', id: user_id) or a specific listing (type:'listing',
    // id: listing_id) — not just the text that was typed, so reopening it
    // can navigate straight back to that exact result.
    function addToSearchHistory(item) {
        if (!item || item.id == null || !item.label) return;
        const list = getSearchHistory().filter(x => !(x.type === item.type && String(x.id) === String(item.id)));
        list.unshift(item);
        saveSearchHistory(list);
    }
    function renderSearchHistoryHtml() {
        const list = getSearchHistory();
        if (!list.length) {
            return '<div class="so-empty"><i class="fas fa-magnifying-glass"></i><span>Start typing to search.</span></div>';
        }
        return `
            <div class="so-history-header">
                <span class="so-section">Recent Searches</span>
                <span class="so-history-clear" onclick="window.__clearSearchHistory()">Clear All</span>
            </div>
            ${list.map((item, i) => `
                <div class="so-history-item" onclick="window.__openHistoryItem(${i})">
                    <span class="so-history-term"><i class="fas ${item.type === 'listing' ? 'fa-house' : 'fa-clock-rotate-left'}"></i>${esc(item.label)}</span>
                    <button type="button" class="so-history-remove" onclick="event.stopPropagation();window.__removeHistoryItem(${i})"><i class="fas fa-xmark"></i></button>
                </div>
            `).join('')}
        `;
    }
    // What #soResults shows when the input is empty — search history on
    // pages with a history context (Feed, Forum), the original placeholder
    // everywhere else.
    function renderEmptyState() {
        return _soHistoryContext() ? renderSearchHistoryHtml() : '<div class="so-empty"><i class="fas fa-magnifying-glass"></i><span>Start typing to search.</span></div>';
    }
    // Reopening a history entry navigates straight to that exact result —
    // the profile or the specific listing — rather than re-running a text
    // search.
    window.__openHistoryItem = function (i) {
        const item = getSearchHistory()[i];
        if (!item) return;
        closeOverlay();
        location.href = item.type === 'listing'
            ? 'listing-detail.html?id=' + item.id
            : 'dashboard.html?user_id=' + item.id;
    };
    window.__removeHistoryItem = function (i) {
        const list = getSearchHistory();
        list.splice(i, 1);
        saveSearchHistory(list);
        document.getElementById('soResults').innerHTML = renderEmptyState();
    };
    window.__clearSearchHistory = function () {
        saveSearchHistory([]);
        document.getElementById('soResults').innerHTML = renderEmptyState();
    };

    // inject styles
    const style = document.createElement('style');
    style.textContent = `
    /* FAB */
    #searchFab {
        position: fixed;
        top: 20px;
        right: 24px;
        z-index: 900;
        width: 42px; height: 42px;
        border-radius: 50%;
        background: #fff;
        border: 1.5px solid #e2e8f0;
        box-shadow: 0 4px 16px rgba(0,0,0,0.10);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #0f172a;
        font-size: 16px;
        transition: box-shadow 0.15s, transform 0.15s;
    }
    #searchFab:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.14); transform: scale(1.06); }

    /* Overlay backdrop */
    #searchOverlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(15,23,42,0.55);
        backdrop-filter: blur(4px);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 80px 16px 40px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
    }
    #searchOverlay.open {
        opacity: 1;
        pointer-events: all;
    }

    /* Search box */
    .so-box {
        width: 100%;
        max-width: 640px;
        background: #fff;
        border-radius: 20px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.20);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 140px);
    }
    .so-input-row {
        display: flex;
        align-items: center;
        padding: 0 18px;
        border-bottom: 1px solid #f1f5f9;
        gap: 12px;
        flex-shrink: 0;
    }
    .so-input-row i { color: #94a3b8; font-size: 16px; flex-shrink: 0; }
    #soInput {
        flex: 1;
        border: none;
        outline: none;
        font-size: 16px;
        font-weight: 500;
        font-family: 'Inter', sans-serif;
        color: #0f172a;
        padding: 18px 0;
        background: transparent;
    }
    #soInput::placeholder { color: #cbd5e1; }
    .so-esc {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        background: #f1f5f9;
        padding: 3px 8px;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
    }

    /* Results */
    #soResults {
        overflow-y: auto;
        padding: 8px 0 12px;
    }
    .so-empty, .so-loading {
        padding: 32px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }
    .so-empty i, .so-loading i { font-size: 28px; opacity: 0.35; }
    .so-section {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
        padding: 10px 18px 4px;
    }
    .so-person {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 18px;
        text-decoration: none;
        transition: background 0.1s;
        cursor: pointer;
    }
    .so-person:hover { background: #f8fafc; }
    .so-avatar {
        width: 36px; height: 36px;
        border-radius: 10px;
        object-fit: cover;
        flex-shrink: 0;
    }
    .so-pname { font-size: 13px; font-weight: 700; color: #0f172a; }
    .so-pjob  { font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 1px; }
    .so-listing {
        display: block;
        padding: 10px 18px;
        text-decoration: none;
        transition: background 0.1s;
        cursor: pointer;
    }
    .so-listing:hover { background: #f8fafc; }
    .so-lbadge {
        display: inline-block;
        font-size: 10px; font-weight: 700;
        padding: 2px 8px; border-radius: 20px;
        text-transform: uppercase; letter-spacing: 0.3px;
        margin-bottom: 4px;
    }
    .so-for-sale    { background:#dcfce7; color:#15803d; }
    .so-for-rent    { background:#dbeafe; color:#1d4ed8; }
    .so-for-lease   { background:#fef9c3; color:#92400e; }
    .so-willing-to-buy   { background:#f0fdf4; color:#166534; }
    .so-willing-to-rent  { background:#eff6ff; color:#1e40af; }
    .so-willing-to-lease { background:#fefce8; color:#854d0e; }
    .so-forum { background:#ede9fe; color:#6d28d9; }
    .so-enter {
        font-size: 11px;
        font-weight: 700;
        color: #16a34a;
        background: #f0fdf4;
        padding: 3px 8px;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
    }
    .so-enter:hover { background: #dcfce7; }
    .so-cat {
        display: inline-block;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #64748b;
        background: #f1f5f9;
        padding: 1px 8px;
        border-radius: 20px;
        margin-top: 4px;
    }
    .so-cat-people { color: #0369a1; background: #e0f2fe; }
    .so-lcontent { font-size: 12px; color: #334155; font-weight: 500; line-height: 1.4; }
    .so-fsubject { font-size: 13px; color: #0f172a; font-weight: 700; line-height: 1.35; margin-bottom: 2px; }
    .so-lposter  { font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 3px; }

    /* Forum search history */
    .so-history-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 18px 4px;
    }
    .so-history-header .so-section { padding: 0; }
    .so-history-clear {
        font-size: 11px; font-weight: 700; color: #16a34a; cursor: pointer;
        flex-shrink: 0;
    }
    .so-history-clear:hover { text-decoration: underline; }
    .so-history-item {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 18px;
        cursor: pointer;
        transition: background 0.1s;
    }
    .so-history-item:hover { background: #f8fafc; }
    .so-history-term {
        display: flex; align-items: center; gap: 10px;
        font-size: 13px; font-weight: 600; color: #334155;
        min-width: 0; flex: 1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .so-history-term i { color: #94a3b8; font-size: 12px; flex-shrink: 0; }
    .so-history-remove {
        flex-shrink: 0;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        border: none; background: none; color: #94a3b8;
        border-radius: 50%; cursor: pointer; font-size: 12px;
    }
    .so-history-remove:hover { background: #fee2e2; color: #ef4444; }

    @media (max-width: 768px) {
        #searchFab { top: 14px; right: 14px; width: 38px; height: 38px; font-size: 14px; }
        #searchOverlay { padding: 60px 12px 24px; }
        .so-box { max-height: calc(100vh - 96px); }
        .so-input-row { padding: 0 12px; gap: 8px; }
        .so-input-row i { font-size: 14px; }
        #soInput { font-size: 14px; padding: 14px 0; }
        #soInput::placeholder { font-size: 13px; }
        .so-enter, .so-esc { font-size: 10px; padding: 3px 6px; }
        .so-section { font-size: 9px; padding: 8px 14px 4px; }
        .so-person, .so-listing, .so-history-item { padding: 9px 14px; }
        .so-history-header { padding: 8px 14px 4px; }
    }
    `;
    document.head.appendChild(style);

    // inject HTML once the body exists (this script may be loaded in <head>)
    let overlay;
    function init() {
        if (overlay) return;
        // skip FAB on home page (has its own search bar)
        if (!IS_FEED_PAGE) {
            const fab = document.createElement('button');
            fab.id = 'searchFab';
            fab.setAttribute('aria-label', 'Search');
            fab.innerHTML = '<i class="fas fa-magnifying-glass"></i>';
            fab.onclick = openOverlay;
            document.body.appendChild(fab);
        }

        overlay = document.createElement('div');
        overlay.id = 'searchOverlay';
        // Feed (and Notifications, which follows the same pattern) already
        // searches live as you type (see onInput's debounce below) and saves
        // history on result selection, not on Enter — so neither the Enter
        // nor Escape chip describes a real requirement there and both are
        // dropped from the UI. Forum (and any other page hosting this
        // overlay) keeps them unchanged.
        const _hideChips = IS_FEED_PAGE || IS_NOTIF_PAGE;
        overlay.innerHTML = `
            <div class="so-box">
                <div class="so-input-row">
                    <i class="fas fa-magnifying-glass"></i>
                    <input id="soInput" type="text" enterkeyhint="search" placeholder="${IS_REALMATES_PAGE ? 'Search Realmates…' : 'Search people, listings, forum…'}" autocomplete="off">
                    ${_hideChips ? '' : `
                    <span class="so-enter" onclick="window.__searchEnter()">↵ Enter</span>
                    <span class="so-esc" onclick="window.__closeSearchOverlay()">ESC</span>
                    `}
                </div>
                <div id="soResults">${renderEmptyState()}</div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
        document.body.appendChild(overlay);

        // Delegated on #soResults itself (never replaced, only its children
        // are, on every re-render) so this keeps working across searches
        // without re-attaching. Reads the listing id/label from data-*
        // attributes rather than an inline onclick, since listing content
        // can contain raw newlines that would silently break an inline
        // onclick="'...'" JS string outright.
        document.getElementById('soResults').addEventListener('click', e => {
            const item = e.target.closest('.so-listing[data-listing-id]');
            if (!item) return;
            if (_soHistoryContext()) {
                addToSearchHistory({ type: 'listing', id: item.dataset.listingId, label: item.dataset.listingLabel || 'Listing' });
            }
            closeOverlay();
        });

        const soInput = document.getElementById('soInput');
        soInput.addEventListener('input', onInput);
        // Enter (or the mobile keyboard "search"/return key) runs the search immediately.
        soInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchNow(); } });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });

        wireUniversalInputs();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Any general-purpose page search bar opens the universal overlay when focused/clicked,
    // carrying over whatever the user already typed. Contextual bars (e.g. chat conversation
    // search) are intentionally left alone.
    const UNIVERSAL_INPUT_SELECTORS = '#homeSearchInput, #globalSearchInput';
    function wireUniversalInputs() {
        document.querySelectorAll(UNIVERSAL_INPUT_SELECTORS).forEach(inp => {
            if (inp.dataset.universalWired) return;
            inp.dataset.universalWired = '1';
            inp.setAttribute('readonly', 'readonly');
            inp.style.cursor = 'pointer';
            const open = (e) => {
                if (e) e.preventDefault();
                const val = (inp.value || '').trim();
                inp.blur();
                openOverlay();
                if (val) {
                    const so = document.getElementById('soInput');
                    if (so) { so.value = val; searchNow(); }
                }
            };
            inp.addEventListener('focus', open);
            inp.addEventListener('click', open);
        });
    }

    // Force an immediate search, bypassing the debounce (used by Enter / the Enter button).
    // History is no longer saved here — only when a result is actually
    // selected (see __soPersonClick / __onListingResultClick below), so
    // typing without picking a result never creates an entry.
    function searchNow() {
        const q = (document.getElementById('soInput')?.value || '').trim();
        clearTimeout(_timer);
        if (!q) return;
        _lastQ = '';
        document.getElementById('soResults').innerHTML =
            '<div class="so-loading"><i class="fas fa-spinner fa-spin"></i><span>Searching…</span></div>';
        runSearch(q);
    }

    window.__closeSearchOverlay = closeOverlay;
    window.__searchEnter = searchNow;

    // Clicking a person: if the page has the seller bottom-sheet (Portal), ask whether
    // to view their profile or listings first; otherwise go straight to the profile.
    window.__soPersonClick = function (i) {
        const p = (window.__soPeople || [])[i];
        if (!p) return;
        // p.name is the profile's current full_name straight from this
        // search's own query — always the live name, never a stale cache.
        if (_soHistoryContext()) addToSearchHistory({ type: 'profile', id: p.id, label: p.name });
        closeOverlay();
        if (typeof window.showSellerPopup === 'function') {
            window.showSellerPopup(p.id, p.name, p.img, p.job);
        } else {
            window.location.href = 'dashboard.html?user_id=' + p.id;
        }
    };

    function openOverlay() {
        overlay.classList.add('open');
        setTimeout(() => document.getElementById('soInput').focus(), 50);
    }
    function closeOverlay() {
        overlay.classList.remove('open');
    }

    let _timer = null, _lastQ = '';
    function onInput() {
        const q = document.getElementById('soInput').value.trim();
        clearTimeout(_timer);
        if (!q) {
            document.getElementById('soResults').innerHTML = renderEmptyState();
            return;
        }
        document.getElementById('soResults').innerHTML =
            '<div class="so-loading"><i class="fas fa-spinner fa-spin"></i><span>Searching…</span></div>';
        _timer = setTimeout(() => runSearch(q), 280);
    }

    // Drop listings the current viewer is hidden from (by position or by user).
    // Self-contained so it works on every page that hosts the search overlay,
    // whether or not visibility.js happens to be loaded there.
    function filterHiddenListings(rows) {
        let me = {};
        try { me = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (e) {}
        const myId = me.id ? String(me.id) : null;
        const toArr = v => Array.isArray(v) ? v
            : (typeof v === 'string' && v.trim() ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } })() : []);
        return (rows || []).filter(l => {
            if (myId && l.user_id && String(l.user_id) === myId) return true; // own posts
            const users = toArr(l.hidden_user_ids).map(String);
            if (myId && users.includes(myId)) return false;
            return true;
        });
    }

    async function runSearch(q) {
        if (q === _lastQ) return;
        _lastQ = q;
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const pat = `%${q}%`;
        // Realmates page: users only. Query profiles alone and render just the
        // People results — no listings, no forum, no other Portal content.
        if (IS_REALMATES_PAGE) {
            const pr = await sb.from('profiles').select('id,full_name,avatar_url,job_title,division')
                .or(`full_name.ilike.${pat},job_title.ilike.${pat},division.ilike.${pat}`).limit(12);
            renderResults(pr.data || [], []);
            return;
        }

        // Search results are limited to People and (permitted) Listings —
        // forum_posts is intentionally not queried here at all; posts never
        // belong in search results, on Feed or Forum.
        const [pr, lr] = await Promise.all([
            sb.from('profiles').select('id,full_name,avatar_url,job_title,division')
              .or(`full_name.ilike.${pat},job_title.ilike.${pat},division.ilike.${pat}`).limit(6),
            // select('*') (not an explicit column list) so this keeps working
            // whether or not the visibility-columns migration has been applied.
            sb.from('listings').select('*')
              .or(`content.ilike.${pat},category.ilike.${pat},user_name.ilike.${pat}`)
              .eq('archived', false).order('created_at', { ascending: false }).limit(30)
        ]);
        let listings = lr.data || [];

        // Visibility Controls — drop listings this viewer is hidden from, so a
        // hidden post never surfaces in search. (Owner-initiated unlocks aren't
        // checked here for speed; a hidden user can still reach an unlocked post
        // via chat or its direct link.)
        listings = filterHiddenListings(listings);

        // Listings only surface for accounts the searcher is actually
        // Realmates with (their own listings always included) — this applies
        // everywhere the search overlay is used, not just Forum. Profiles are
        // exempt — searching for a person should never require being
        // connected to them first.
        let me = {};
        try { me = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (e) {}
        const myId = me.id ? String(me.id) : null;
        const realmateIds = await getMyRealmateIds(sb, myId);
        listings = listings.filter(l => l.user_id && (String(l.user_id) === myId || realmateIds.has(String(l.user_id))));

        if (listings.length > 10) listings = listings.slice(0, 10);

        // Listings store the poster's name as a snapshot taken at write time
        // — overlay each with the poster's LIVE profiles.full_name (by
        // user_id) so a rename shows up immediately instead of the name it
        // was posted under.
        const posterIds = [...new Set(listings.filter(x => x.user_id).map(x => x.user_id))];
        if (posterIds.length) {
            const { data: posters } = await sb.from('profiles').select('id,full_name').in('id', posterIds);
            const nameById = {};
            (posters || []).forEach(p => { nameById[p.id] = p.full_name; });
            listings.forEach(x => {
                if (x.user_id && nameById[x.user_id]) x.user_name = nameById[x.user_id];
            });
        }

        renderResults(pr.data || [], listings);
    }

    function renderResults(people, listings) {
        const el = document.getElementById('soResults');
        if (!people.length && !listings.length) {
            el.innerHTML = '<div class="so-empty"><i class="fas fa-circle-xmark"></i><span>No results found.</span></div>';
            return;
        }
        let html = '';
        if (people.length) {
            // Cache people so the click handler can pass full details to the seller popup.
            window.__soPeople = people.map(p => ({
                id: p.id,
                name: p.full_name || 'Realmate Member',
                job: soValidPosition(p.job_title),
                img: soAvatarFor(p.full_name, p.avatar_url)
            }));
            html += `<div class="so-section">People</div>`;
            window.__soPeople.forEach((p, i) => {
                const name = esc(p.name);
                const job = esc(p.job);
                html += `<div class="so-person" onclick="window.__soPersonClick(${i})">
                    <img src="${p.img}" class="so-avatar" onerror="this.src='https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32'">
                    <div><div class="so-pname">${name}</div>${job ? `<div class="so-pjob">${job}</div>` : ''}<span class="so-cat so-cat-people">People</span></div>
                </div>`;
            });
        }
        if (listings.length) {
            html += `<div class="so-section" style="margin-top:${people.length?'8px':'0'}">Listings</div>`;
            listings.forEach(l => {
                const cat         = esc(l.category || '');
                const contentFull = (l.content || '').slice(0, 100);
                const content     = esc(contentFull);
                const poster      = esc(l.user_name || '');
                // History should remember the listing itself, not just its
                // poster — the content snippet already shown is the most
                // descriptive label available, falling back to the poster's
                // name if the listing has no content. Read via data-* +
                // event delegation (see the click listener below), not an
                // inline onclick — listing content routinely contains raw
                // newlines, which silently break an inline onclick="'...'"
                // JS string (the href still navigates natively even though
                // the handler throws, which is why this was failing).
                const label       = contentFull || l.user_name || 'Listing';
                const cls         = (l.category||'').toLowerCase().replace(/\s+/g,'-');
                html += `<a href="listing-detail.html?id=${l.id}" class="so-listing" data-listing-id="${l.id}" data-listing-label="${escAttr(label)}">
                    ${cat ? `<span class="so-lbadge so-${cls}">${cat}</span>` : ''}
                    <div class="so-lcontent">${content}${(l.content||'').length>100?'…':''}</div>
                    ${poster ? `<div class="so-lposter">${poster}</div>` : ''}
                </a>`;
            });
        }
        el.innerHTML = html;
    }

    function esc(s) {
        return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    // Same as esc(), plus quotes — for values embedded inside an HTML
    // attribute (e.g. data-listing-label) rather than as element text.
    // Listing content routinely contains raw newlines (multi-line posts),
    // which are harmless in an HTML attribute but would break an inline
    // onclick="...'...'" JS string outright — this is why listing clicks are
    // read via data-* attributes + a delegated listener instead of building
    // a JS call inline.
    function escAttr(s) {
        return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
})();
