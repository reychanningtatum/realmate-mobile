// Global logout — available on every page via the mobile nav
function logout() {
    const SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
    try {
        const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        _sb.auth.signOut();
    } catch(e) {}
    localStorage.removeItem('user');
    localStorage.removeItem('posts');
    localStorage.removeItem('isGuest');
    location.href = 'index.html';
}

// Universal back navigation — available on every page's mobile header.
// Uses real browser history so it always lands on whatever page the user
// actually came from, falling back to the Feed only when there's no
// history to go back to (e.g. the page was opened directly/in a new tab).
function goBack() {
    // Inside the app shell, "back" should return to the previous TAB (e.g.
    // Portal → Profile → Back = Portal). Using the browser history here walks the
    // shared session history and can land on the marketing page, so defer to the
    // shell. Standalone / desktop keeps the normal history behaviour.
    try {
        if (window.self !== window.top && window.parent && typeof window.parent.rmBack === 'function') {
            window.parent.rmBack();
            return;
        }
    } catch (e) {}
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'home.html';
    }
}

// 🔐 AUTH GUARD — runs on every protected page
(async function () {
    // TEMP diagnostic: note in the reload log whenever THIS guard redirects, so we
    // can tell an auth/session bounce (app→index→app) from an iOS webview reload.
    function _rmDiagMark(m) {
        try {
            var k = 'rm_reload_log', l = JSON.parse(localStorage.getItem(k) || '[]');
            l.push({ t: Date.now(), mark: m + ' [' + (window.self !== window.top ? 'iframe' : 'top') + ']' });
            if (l.length > 60) l = l.slice(-60);
            localStorage.setItem(k, JSON.stringify(l));
        } catch (e) {}
    }
    const SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
    const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const isGuest = localStorage.getItem("isGuest") === "true";
    const { data: { session } } = await _sb.auth.getSession();

    // No session and not a guest → back to login
    if (!session && !isGuest) {
        _rmDiagMark('authguard: no-session → index');
        localStorage.clear();
        location.href = "index.html";
        return;
    }

    if (!session) return; // guest, allow through

    // Remember Me — if the user chose NOT to stay signed in, drop the session
    // on a FRESH app launch (no per-session marker yet). Existing sessions with
    // no preference recorded default to "remembered", so nobody already signed
    // in is logged out. The marker is per-browsing-session (cleared when the app
    // is fully closed), so in-app navigation between tabs never re-triggers it.
    if (localStorage.getItem('rm_remember') === '0' && !sessionStorage.getItem('rm_session')) {
        _rmDiagMark('authguard: remember-me signout → index');
        await _sb.auth.signOut();
        localStorage.clear();
        location.href = "index.html";
        return;
    }
    try { sessionStorage.setItem('rm_session', '1'); } catch (e) {}

    // Registration approval gate — covers the case where an admin
    // rejects/un-approves an account that already has a live session
    // (login() only checks this at sign-in time). No row means the
    // account predates this feature and is treated as approved.
    try {
        const { data: review } = await _sb
            .from('registration_reviews')
            .select('account_status')
            .eq('id', session.user.id)
            .maybeSingle();
        if (review && review.account_status !== 'Approved') {
            _rmDiagMark('authguard: reg-gate → index');
            await _sb.auth.signOut();
            localStorage.clear();
            location.href = "index.html";
            return;
        }
    } catch (e) {
        console.warn("[AuthGuard] Registration status check error:", e.message);
    }

    // Session exists — sync user profile into localStorage
    try {
        const storedUser = JSON.parse(localStorage.getItem("user")) || {};

        // Only refetch if the stored user doesn't match the session user
        if (storedUser.id !== session.user.id) {
            const { data: profile } = await _sb
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            const meta = session.user.user_metadata || {};
            const fullName = (profile && profile.full_name)
                || `${meta.first_name || ''} ${meta.last_name || ''}`.trim()
                || session.user.email;

            // A ui-avatars.com URL is an auto-generated initials placeholder,
            // not a real uploaded photo — it bakes in whatever name was
            // current when generated, so trusting a stored one as-is shows
            // stale initials forever after a rename. Regenerate fresh from
            // the current name whenever there's no real upload; a genuine
            // upload (Supabase Storage URL) is always used as-is.
            const _storedAvatar = profile && profile.avatar_url;
            const _hasRealPhoto = _storedAvatar && !_storedAvatar.includes('ui-avatars.com');

            const userObj = {
                id: session.user.id,
                email: session.user.email,
                name: fullName,
                nickname: (profile && profile.nickname) || '',
                image: _hasRealPhoto ? _storedAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&color=fff`,
                job: (profile && profile.job_title) || '',
                division: (profile && profile.division) || 'Alveo Land',
                group: (profile && profile.business_group) || '',
                team: (profile && profile.team_name) || '',
                bio: (profile && profile.bio) || ''
            };
            localStorage.setItem("user", JSON.stringify(userObj));

            // If profile doesn't exist in DB, create it
            if (!profile) {
                await _sb.from('profiles').insert({
                    id: session.user.id,
                    full_name: fullName,
                    avatar_url: userObj.image
                });
            }
        }
    } catch (e) {
        console.warn("[AuthGuard] Profile sync error:", e.message);
    }

    // Avatar self-heal — the profile-sync block above only refetches when the
    // cached user id changes, so a session whose cached image is still a
    // generated placeholder (e.g. right after login, which stored a ui-avatars
    // fallback) never gets the real photo. Fetch the real avatar and, if found,
    // update the cache and repaint the avatars that already rendered from it
    // (the nav "Me" tab and the create-post box). Only touches the image field.
    try {
        const u = JSON.parse(localStorage.getItem("user")) || {};
        const isPlaceholder = !u.image
            || /ui-avatars\.com|via\.placeholder\.com/.test(u.image);
        if (u.id === session.user.id && isPlaceholder) {
            const { data: prof } = await _sb
                .from('profiles')
                .select('avatar_url')
                .eq('id', session.user.id)
                .maybeSingle();
            if (prof && prof.avatar_url && prof.avatar_url !== u.image) {
                u.image = prof.avatar_url;
                localStorage.setItem("user", JSON.stringify(u));
                try { window.loadNavAvatar && window.loadNavAvatar(); } catch (e) {}
                try { window.initCreatePost && window.initCreatePost(); } catch (e) {}
            }
        }
    } catch (e) {
        console.warn("[AuthGuard] Avatar heal error:", e.message);
    }

    // ── Analytics: record app_open ────────────────────────────────────────
    // Marks this authenticated user active TODAY for the Admin › Analytics
    // "Active Users" metric. Reached only on the authenticated path (guests and
    // no-session already returned above), so it never fires for logged-out
    // visitors. Throttled to at most one row per Manila calendar day per device
    // — so navigating between tabs (Feed → Portal → Chat …) never re-inserts,
    // and ten opens in a day stay a single row. Active Users additionally counts
    // DISTINCT user_id server-side, so the figure can never be inflated even if
    // extra rows slip through. Every failure is swallowed: analytics can never
    // disrupt a real user action, and a missing table (migration not yet run)
    // is a silent no-op.
    try {
        const mnlDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
        const key = 'rm_app_open_day_' + session.user.id;
        if (localStorage.getItem(key) !== mnlDay) {
            const { error } = await _sb.from('app_events').insert({
                user_id: session.user.id,
                event_type: 'app_open'
            });
            // Only mark done on success, so a transient failure retries next load.
            if (!error) localStorage.setItem(key, mnlDay);
        }
    } catch (e) { /* tracking must never disrupt the app */ }
})();
