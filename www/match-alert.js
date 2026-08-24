// 🎯 GLOBAL AI-MATCH ALERT — loads on every page (like notif-badge.js)
// ───────────────────────────────────────────────────────────────────────────
// New AI Match Alert & Match Notification System:
//   • A prominent GLOBAL BANNER whenever a new match arrives — on whatever page
//     the user is on (dismissible per-arrival).
//   • Red count badges on PORTAL (nav) and MATCHES (Portal seg-tab). NOT on
//     Notifications — Notifications is deliberately not the match indicator.
//   • Badges persist until the user actually CHECKS the match. Opening the
//     Portal alone doesn't clear them; opening Notifications doesn't clear them.
//     livemarket.js calls RMMatchAlert.markSeen(...) only when a match is really
//     viewed (the Matches tab, or a specific match), which drops that badge.
//
// Detection uses the SAME scoring as the Portal (window.RM_MATCH, from
// match-engine.js) so the badge/banner agree exactly with the Matches tab.
// State is per-user in localStorage (rm_match_state_<uid> = {current, seen}),
// mirroring the existing dismissed-match pattern — no backend, no migration.
// ───────────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    const SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
    const MATCH_THRESHOLD = 10; // identical to buildMatchMap's `score < 10` cutoff

    // A listing marked Sold/Bought/Rented/Leased (all stored as status='sold') is
    // completed and can no longer be matched — it must not generate, count toward,
    // or keep any AI match. Mirrors isCompletedListing() in livemarket.js.
    const COMPLETED_STATUSES = new Set(['sold', 'bought', 'rented', 'leased', 'completed']);
    const _isCompleted = l => !!l && COMPLETED_STATUSES.has(String(l.status || '').toLowerCase());

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !user.name) return;                // logged-out: nothing to do
    // Portal Notifications toggle (Settings). '0' = user turned them OFF; any
    // other value (or absent) = ON by default. When off, suppress the global
    // AI-match banner and nav badge entirely.
    if (localStorage.getItem('rm_portal_notifs') === '0') return;
    if (!window.RM_MATCH) {                          // engine must be present
        console.warn('[MatchAlert] RM_MATCH not loaded — match-engine.js missing on this page.');
        return;
    }

    // Per-user localStorage identity. Falls back to name when id is absent so
    // the badge still works, but auth id (below) is preferred once resolved.
    let _uid = user.id || null;
    // v2: the badge now counts only NEW matches (arrivals after a one-time
    // baseline), not the whole historical backlog — bumping the key re-baselines
    // everyone the first time this version runs, so old counts don't linger.
    const stateKey = () => `rm_match_state_v2_${_uid || user.name}`;
    const dismissKey = () => `dismissed_matches_${_uid || 'anon'}`;

    // Matches that arrived via realtime THIS session — kept unseen even through
    // the first-run baseline (so a live arrival while the user hasn't opened the
    // Portal yet still counts as new rather than being swept into the baseline).
    const _sessionArrivals = new Set();

    function getState() {
        try {
            const s = JSON.parse(localStorage.getItem(stateKey()) || '{}');
            return { current: Array.isArray(s.current) ? s.current.map(String) : [],
                     seen:    Array.isArray(s.seen)    ? s.seen.map(String)    : [],
                     baselined: !!s.baselined };
        } catch { return { current: [], seen: [], baselined: false }; }
    }
    function setState(s) {
        try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch {}
    }
    function getDismissed() {
        try { return new Set(JSON.parse(localStorage.getItem(dismissKey()) || '[]').map(String)); }
        catch { return new Set(); }
    }

    // Unseen = currently-known matches the user hasn't checked and hasn't dismissed.
    function getUnseen() {
        const { current, seen } = getState();
        const seenSet = new Set(seen);
        const dismissed = getDismissed();
        return current.filter(id => !seenSet.has(id) && !dismissed.has(id));
    }

    // ── Shared nav-badge CSS (same class notif-badge.js injects). Inject a copy
    // guarded by the same id so whichever global script runs first wins and the
    // other no-ops. Plus a small badge style for the Matches seg-tab. ──
    function ensureStyles() {
        if (!document.getElementById('nav-badge-styles')) {
            const el = document.createElement('style');
            el.id = 'nav-badge-styles';
            el.textContent = `
                .nav-badge{position:absolute;background:#ef4444;color:#fff;font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;pointer-events:none;line-height:1;box-shadow:0 2px 6px rgba(239,68,68,0.4);z-index:10;}
                .nav-badge--row{top:50%;right:10px;transform:translateY(-50%);}
                .nav-badge--corner{top:2px;right:50%;transform:translateX(calc(50% + 8px));}
                .mob-nav-item .nav-badge{display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;}
            `;
            document.head.appendChild(el);
        }
        if (!document.getElementById('match-alert-styles')) {
            const el = document.createElement('style');
            el.id = 'match-alert-styles';
            el.textContent = `
                .seg-tab{position:relative;}
                .seg-tab-match-badge{position:absolute;top:2px;right:6px;background:#ef4444;color:#fff;font-size:9px;font-weight:800;min-width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1;box-shadow:0 2px 6px rgba(239,68,68,0.45);pointer-events:none;z-index:5;}
                #rmMatchBanner{position:fixed;top:calc(14px + env(safe-area-inset-top));left:50%;transform:translateX(-50%) translateY(-160%);width:calc(100% - 24px);max-width:520px;z-index:100000;
                    display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;
                    background:linear-gradient(135deg,#0f172a,#1e3a5f);border:1px solid #32cd32;
                    box-shadow:0 12px 34px -8px rgba(0,0,0,0.55),0 0 0 1px rgba(50,205,50,0.15);
                    color:#fff;font-family:inherit;opacity:0;transition:transform .38s cubic-bezier(.2,.8,.2,1),opacity .38s;cursor:pointer;}
                #rmMatchBanner.show{transform:translateX(-50%) translateY(0);opacity:1;}
                #rmMatchBanner .rmb-icon{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:rgba(50,205,50,0.15);border:1px solid rgba(50,205,50,0.5);display:flex;align-items:center;justify-content:center;color:#32cd32;font-size:16px;}
                #rmMatchBanner .rmb-body{flex:1 1 auto;min-width:0;}
                #rmMatchBanner .rmb-title{font-size:13.5px;font-weight:800;letter-spacing:.2px;line-height:1.2;}
                #rmMatchBanner .rmb-sub{font-size:12px;color:#cbd5e1;margin-top:2px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                #rmMatchBanner .rmb-view{flex:0 0 auto;background:linear-gradient(135deg,#16a34a,#32cd32);color:#04220a;border:none;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;}
                #rmMatchBanner .rmb-x{flex:0 0 auto;background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:4px;line-height:1;}
                #rmMatchBanner .rmb-x:hover{color:#fff;}
                #rmMatchBanner .rmb-icon .ai-robot{font-size:26px;}
                .ai-robot{position:relative;display:inline-block;width:1em;height:1em;flex-shrink:0;vertical-align:-0.16em;}
                .ai-robot svg{width:100%;height:100%;display:block;overflow:visible;}
                .ai-robot .head{fill:#0b1a12;stroke:rgba(50,205,50,0.85);stroke-width:2.6;}
                .ai-robot .visor{fill:#06120c;stroke:rgba(50,205,50,0.28);stroke-width:1;}
                .ai-robot .eye{fill:#32cd32;filter:drop-shadow(0 0 2px #32cd32);animation:aiRobotBlink 3.2s steps(1,end) infinite;}
                @keyframes aiRobotBlink{0%,93%,100%{opacity:1}95%,98%{opacity:.12}}
                .ai-robot .ant,.ai-robot .ear{stroke:rgba(50,205,50,0.8);stroke-width:2.6;stroke-linecap:round;}
                .ai-robot .tip{fill:#32cd32;transform-box:fill-box;transform-origin:center;animation:aiRobotTip 1.4s ease-in-out infinite;}
                @keyframes aiRobotTip{0%,100%{opacity:.55}50%{opacity:1;filter:drop-shadow(0 0 3px #32cd32)}}
                .ai-robot .mouth{fill:rgba(50,205,50,0.5);}
                .ai-robot .scan{fill:rgba(125,211,252,0.9);animation:aiRobotVisor 2.6s ease-in-out infinite;}
                @keyframes aiRobotVisor{0%{transform:translateX(0)}50%{transform:translateX(34px)}100%{transform:translateX(0)}}
                @media (prefers-reduced-motion:reduce){.ai-robot .eye,.ai-robot .tip,.ai-robot .scan{animation:none !important}}
            `;
            document.head.appendChild(el);
        }
    }

    function makeBadge(text, cls, positionCls) {
        const b = document.createElement('span');
        b.className = `nav-badge ${positionCls} ${cls}`;
        b.textContent = text;
        return b;
    }

    function refreshBadges() {
        ensureStyles();
        document.querySelectorAll('.global-match-badge, .seg-tab-match-badge').forEach(el => el.remove());
        const count = getUnseen().length;
        if (count <= 0) return;
        const label = count > 99 ? '99+' : String(count);

        // Portal — desktop sidebar nav item (globe icon)
        const sideGlobe = document.querySelector('.nav-item [class*="fa-globe"]');
        if (sideGlobe) {
            const wrap = sideGlobe.parentElement;
            wrap.style.position = 'relative';
            wrap.appendChild(makeBadge(label, 'global-match-badge', 'nav-badge--row'));
        }
        // Portal — mobile bottom nav (globe icon)
        const mobGlobe = document.querySelector('.mob-nav-item [class*="fa-globe"]');
        if (mobGlobe) {
            const wrap = mobGlobe.parentElement;
            wrap.style.position = 'relative';
            wrap.appendChild(makeBadge(label, 'global-match-badge', 'nav-badge--corner'));
        }
        // Matches — the AI Engine seg-tab (present on the Portal page only)
        const matchesTab = document.querySelector('.seg-tab[data-seg="AI_ENGINE"]');
        if (matchesTab) {
            const b = document.createElement('span');
            b.className = 'seg-tab-match-badge';
            b.textContent = label;
            matchesTab.appendChild(b);
        }
    }

    // ── Global banner (dismissible per-arrival) ──
    // _bannerTargetId is the specific matched listing the current banner is about,
    // so clicking through can route to — and highlight — that exact post.
    let _banner = null, _hideTimer = null, _bannerTargetId = null;
    function buildBanner() {
        // Reuse the existing banner, but re-attach it if it was ever detached
        // from the DOM (defensive — the banner is normally only hidden, never
        // removed) so showBanner always renders a live element.
        if (_banner) {
            if (!_banner.isConnected) document.body.appendChild(_banner);
            return _banner;
        }
        ensureStyles();
        _banner = document.createElement('div');
        _banner.id = 'rmMatchBanner';
        _banner.setAttribute('role', 'alert');
        _banner.innerHTML = `
            <div class="rmb-icon"><span class="ai-robot" aria-hidden="true"><svg viewBox="12 12 76 76"><line class="ant" x1="50" y1="9" x2="50" y2="22"/><circle class="tip" cx="50" cy="8" r="4"/><line class="ear" x1="22" y1="46" x2="15" y2="46"/><line class="ear" x1="78" y1="46" x2="85" y2="46"/><rect class="head" x="22" y="24" width="56" height="52" rx="13"/><rect class="visor" x="30" y="40" width="40" height="17" rx="6"/><rect class="scan" x="31" y="41" width="4" height="15" rx="2"/><circle class="eye" cx="42" cy="48.5" r="4.4"/><circle class="eye" cx="58" cy="48.5" r="4.4"/><rect class="mouth" x="41" y="65" width="18" height="3" rx="1.5"/></svg></span></div>
            <div class="rmb-body">
                <div class="rmb-title">New AI Match Found</div>
                <div class="rmb-sub" id="rmbSub">A new listing matches yours.</div>
            </div>
            <button class="rmb-view" id="rmbView">View</button>
            <button class="rmb-x" id="rmbX" aria-label="Dismiss">&times;</button>`;
        document.body.appendChild(_banner);
        const go = (e) => { if (e) e.stopPropagation(); openMatches(); };
        _banner.querySelector('#rmbView').addEventListener('click', go);
        _banner.addEventListener('click', go);
        _banner.querySelector('#rmbX').addEventListener('click', (e) => { e.stopPropagation(); hideBanner(); });
        return _banner;
    }
    function showBanner(sub, targetId) {
        const b = buildBanner();
        _bannerTargetId = targetId != null ? String(targetId) : null;
        const subEl = b.querySelector('#rmbSub');
        if (subEl && sub) subEl.textContent = sub;
        requestAnimationFrame(() => b.classList.add('show'));
        clearTimeout(_hideTimer);
        _hideTimer = setTimeout(hideBanner, 12000); // auto-tuck after a while
    }
    function hideBanner() {
        if (_banner) _banner.classList.remove('show');
        clearTimeout(_hideTimer);
    }
    function openMatches() {
        hideBanner();
        // Remember which matched post to scroll to + outline once the Matches tab
        // is rendered. livemarket.js's consumeMatchHighlight() reads this key.
        if (_bannerTargetId) {
            try { localStorage.setItem('rm_match_highlight', _bannerTargetId); } catch {}
        }
        // Already on the Portal → just switch to the Matches tab, then highlight.
        const tab = document.querySelector('.seg-tab[data-seg="AI_ENGINE"]');
        if (tab && typeof window.selectSegTab === 'function') {
            window.selectSegTab(tab);
            if (typeof window.consumeMatchHighlight === 'function') window.consumeMatchHighlight();
            return;
        }
        // Any other page → open the Portal on the Matches tab (restorePortalTab reads
        // this; init() then calls consumeMatchHighlight once the list has rendered).
        try { localStorage.setItem('rm_portal_tab', 'AI_ENGINE'); } catch {}
        location.href = 'livemarket.html';
    }

    // A short human label for the banner subline from the incoming listing.
    function bannerSubFor(listing) {
        const cat = (listing.category || '').toString();
        const nice = cat ? cat.replace(/\b\w/g, c => c.toUpperCase()) : 'listing';
        return `A new “${nice}” listing matches your listing. Tap to view.`;
    }

    // ── Match state cache (the user's own listings, for realtime scoring) ──
    let _myParsed = [];      // parsed own listings
    let _myUid = _uid;       // auth user id once resolved

    async function loadMine() {
        try {
            const authUid = (await _sb.auth.getUser()).data?.user?.id || null;
            if (authUid) { _myUid = authUid; _uid = _uid || authUid; }
            if (!_myUid) return;
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/listings?select=*&archived=eq.false&user_id=eq.${_myUid}`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const mine = await res.json();
            // A completed own listing can't produce matches — exclude it so it
            // never surfaces or badges a partner.
            _myParsed = (Array.isArray(mine) ? mine : [])
                .filter(l => !_isCompleted(l))
                .map(l => window.RM_MATCH.parseListing(l));
        } catch (e) { /* keep whatever we had */ }
    }

    // Does `listing` match any of my own listings (>= threshold)?
    function matchesMine(listing) {
        if (!_myParsed.length) return false;
        if (_isCompleted(listing)) return false;   // completed → never a match
        const other = window.RM_MATCH.parseListing(listing);
        for (const mine of _myParsed) {
            if (window.RM_MATCH.computeMatchScore(mine, other).score >= MATCH_THRESHOLD) return true;
        }
        return false;
    }

    // ── Analytics: persist AI matches ────────────────────────────────────────
    // Records each listing the Match Engine surfaces to this user as a 'match'
    // event for the Admin › Analytics "Matches" metric. Deduped per (user,
    // listing) so a match is counted once, ever: locally via a persisted-id set
    // (so we don't even attempt a re-insert) and, as a backstop across devices,
    // by the app_events unique index (upsert ignoreDuplicates). All failures are
    // swallowed and a missing table (migration not yet run) is a silent no-op —
    // match badges/banners behave identically whether or not this succeeds.
    function _persistedKey() { return 'rm_match_persisted_v1_' + (_myUid || _uid || 'anon'); }
    function _getPersisted() {
        try { return new Set(JSON.parse(localStorage.getItem(_persistedKey()) || '[]')); }
        catch (e) { return new Set(); }
    }
    function _persistMatches(ids) {
        try {
            const uid = _myUid || _uid;
            if (!uid || !ids || !ids.length) return;
            const set = _getPersisted();
            const fresh = [...new Set(ids.map(String))].filter(id => id && !set.has(id));
            if (!fresh.length) return;
            const rows = fresh.map(id => ({ user_id: uid, event_type: 'match', ref_id: id }));
            _sb.from('app_events')
                .upsert(rows, { onConflict: 'user_id,event_type,ref_id', ignoreDuplicates: true })
                .then(function (r) {
                    if (r && r.error) return;                  // leave unpersisted → retried later
                    fresh.forEach(id => set.add(id));
                    try { localStorage.setItem(_persistedKey(), JSON.stringify([...set].slice(-3000))); } catch (e) {}
                })
                .catch(function () {});
        } catch (e) { /* analytics must never disrupt matching */ }
    }

    // ── Public API ──────────────────────────────────────────────────────────
    // recordMatches(ids): the Portal's authoritative full current match set.
    // Replaces `current`; new ids simply become unseen (badge). No banner here —
    // the banner is reserved for genuine realtime ARRIVALS (noteIncoming), so a
    // first-ever Portal load doesn't spam a banner for pre-existing matches.
    function recordMatches(ids) {
        const s = getState();
        const prevCurrent = new Set(s.current);
        const cur = [...new Set((ids || []).map(String))];
        s.current = cur;

        // Persist every currently-surfaced match (deduped inside) — covers the
        // baseline set on first load and any ids added on later recomputes.
        _persistMatches(cur);

        // First time we ever see this user's matches: BASELINE them as already
        // seen so the badge only ever reflects matches that arrive AFTER now.
        // (Any live arrival earlier this session is kept unseen via _sessionArrivals.)
        if (!s.baselined) {
            s.seen = cur.filter(id => !_sessionArrivals.has(id));
            s.baselined = true;
            setState(s);
            refreshBadges();
            return;
        }

        // Prune seen ids that are no longer matches at all (keeps storage tidy).
        const curSet = new Set(cur);
        s.seen = s.seen.filter(id => curSet.has(id));
        setState(s);
        refreshBadges();

        // Banner for matches this Portal recompute just surfaced (not previously
        // known and not already seen) — covers the poster whose brand-new listing
        // immediately has matches, and a receiver opening the Portal. Realtime
        // (noteIncoming) covers the same on every OTHER page.
        const dismissed = getDismissed();
        const seenSet = new Set(s.seen);
        const newly = cur.filter(id => !prevCurrent.has(id) && !seenSet.has(id) && !dismissed.has(id));
        if (newly.length) {
            // Highlight the top newly-surfaced match when the banner is clicked.
            showBanner(newly.length === 1
                ? 'A new listing matches your listing. Tap to view.'
                : `${newly.length} new listings match your listings. Tap to view.`,
                newly[0]);
        }
    }

    // noteIncoming(listing): a listing just arrived/changed via realtime. If it
    // matches one of mine and isn't already known/seen/dismissed → unseen + banner.
    function noteIncoming(listing) {
        if (!listing || !listing.id) return;
        if (listing.archived) return;
        const id = String(listing.id);
        if (listing.user_id && _myUid && listing.user_id === _myUid) return; // my own post
        const dismissed = getDismissed();
        if (dismissed.has(id)) return;
        const s = getState();
        if (s.seen.includes(id)) return;      // already checked → no re-alert
        if (s.current.includes(id)) return;   // already counted → no duplicate banner
        if (!matchesMine(listing)) return;
        _sessionArrivals.add(id);   // a genuine live arrival — survives the baseline
        s.current.push(id);
        _persistMatches([id]);      // count this newly-arrived match
        setState(s);
        refreshBadges();
        showBanner(bannerSubFor(listing), id);
    }

    // noteRemoved(listing): a listing just became completed (Sold/Bought/Rented/
    // Leased) or archived and can no longer be a match. Drop it from the tracked
    // set so the badge count updates live on whatever page the user is on.
    function noteRemoved(listing) {
        if (!listing || listing.id == null) return;
        const id = String(listing.id);
        const s = getState();
        if (!s.current.includes(id) && !s.seen.includes(id)) return;
        s.current = s.current.filter(x => x !== id);
        s.seen = s.seen.filter(x => x !== id);
        setState(s);
        refreshBadges();
    }

    // markSeen(idOrIds): the user actually checked these matches → drop badges.
    function markSeen(idOrIds) {
        const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(v => v != null).map(String);
        if (!ids.length) return;
        const s = getState();
        const seen = new Set(s.seen);
        ids.forEach(id => seen.add(id));
        s.seen = [...seen];
        setState(s);
        refreshBadges();
    }

    window.RMMatchAlert = { recordMatches, noteIncoming, markSeen, getUnseen, refreshBadges };

    // ── Boot ──────────────────────────────────────────────────────────────
    // Paint whatever the persisted state says right away, then resolve the auth
    // id + own listings and wire realtime.
    refreshBadges();
    document.addEventListener('DOMContentLoaded', refreshBadges);

    const _sb = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

    (async function boot() {
        if (!_sb) return;
        await loadMine();
        refreshBadges();

        // Realtime: any new/edited listing anywhere → score against mine. Broad
        // subscribe + client-side filter (RLS is disabled on these tables; same
        // pattern notif-badge.js uses). Debounced own-listing refresh so posting
        // a NEW own listing re-primes _myParsed (new matches can then be found).
        let _mineTimer = null;
        const reloadMineDebounced = () => { clearTimeout(_mineTimer); _mineTimer = setTimeout(loadMine, 800); };
        try {
            _sb.channel('match-alert-listings')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' },
                    (payload) => {
                        const row = payload.new;
                        if (row.user_id && _myUid && row.user_id === _myUid) { reloadMineDebounced(); return; }
                        noteIncoming(row);
                    })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' },
                    (payload) => {
                        const row = payload.new;
                        // A listing that just became completed or archived can no
                        // longer be a match — drop it from the badge set live.
                        if (_isCompleted(row) || row.archived) { noteRemoved(row); }
                        if (row.user_id && _myUid && row.user_id === _myUid) { reloadMineDebounced(); return; }
                        if (_isCompleted(row) || row.archived) return; // handled above
                        noteIncoming(row);
                    })
                .subscribe();
        } catch (e) { console.warn('[MatchAlert] realtime subscription failed:', e); }
    })();

    // Fallback repaint every 60s (a missed realtime event, tab wakeup, etc.).
    setInterval(refreshBadges, 60000);
})();
