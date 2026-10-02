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

    // ── TEMP DIAGNOSTIC (build 307) — remove after we locate the mobile break ──
    // Shows the live AI-match pipeline state in a small corner pill so we can see
    // exactly where it stops on-device. Only in the TOP document (shell/desktop),
    // not inside content iframes, so there's one pill.
    var _DBG = false;   // diagnostic pill disabled (root cause found: Portal Notifications toggle)
    var _topDoc = (window.self === window.top);
    var _diag = { ctx: _topDoc ? 'TOP' : 'iframe', user: user && user.name ? 'y' : 'n',
                  notifs: localStorage.getItem('rm_portal_notifs') === '0' ? 'OFF' : 'on',
                  eng: '?', uid: '?', mine: '?', sub: '-', cur: '?', unseen: '?', lastEvt: '-', scan: '-', note: '-' };
    function _renderDiag() {
        if (!_DBG || !_topDoc) return;
        try {
            var el = document.getElementById('rmMaDiag');
            if (!el) { el = document.createElement('div'); el.id = 'rmMaDiag';
                el.style.cssText = 'position:fixed;left:6px;bottom:72px;z-index:2147483647;background:rgba(0,0,0,.84);color:#7CFC00;font:10px/1.35 monospace;padding:6px 8px;border-radius:8px;max-width:78vw;white-space:pre-wrap;';
                el.addEventListener('click', function () { el.remove(); });
                (document.body || document.documentElement).appendChild(el); }
            el.textContent = 'AImatch['+_diag.ctx+'] user='+_diag.user+' notifs='+_diag.notifs+' eng='+_diag.eng
                + '\nuid='+_diag.uid+' mine='+_diag.mine+' sub='+_diag.sub
                + '\ncur='+_diag.cur+' unseen='+_diag.unseen
                + '\nlastEvt='+_diag.lastEvt+' note='+_diag.note+' scan='+_diag.scan+'  (tap to hide)';
        } catch (e) {}
    }
    function _setDiag(k, v) { _diag[k] = v; _renderDiag(); }
    if (_DBG && _topDoc) { if (document.body) _renderDiag(); else document.addEventListener('DOMContentLoaded', _renderDiag); }

    if (!user || !user.name) return;                // logged-out: nothing to do
    // Portal Notifications toggle (Settings). '0' = user turned them OFF. This now
    // ONLY silences the "New AI Match Found" BANNER (see showBanner); detection and
    // the red UNREAD BADGES always run so the unread count is accurate regardless of
    // the toggle. (Previously this early-returned and suppressed badges too.)
    function _bannerSilenced() { try { return localStorage.getItem('rm_portal_notifs') === '0'; } catch (e) { return false; } }
    // The scoring engine (match-engine.js) is present on every CONTENT page, but NOT
    // on the mobile app-shell (app.html). Rather than go fully inert without it, this
    // file runs in two modes sharing ONE banner implementation:
    //   • engine present  → detect matches (realtime) + show/badge locally (desktop),
    //                        or BROADCAST the banner to the shell (mobile iframe).
    //   • engine absent   → display-only: the shell receives those broadcasts and
    //                        renders the single banner (see the no-engine block below).
    const _hasEngine = !!window.RM_MATCH;
    _setDiag('eng', _hasEngine ? '1' : '0');
    if (!_hasEngine) console.warn('[MatchAlert] RM_MATCH not loaded — running in display-only (shell) mode.');
    // Are we a content page embedded inside the mobile shell? (set by the page's
    // inline `if (window.self!==window.top) add('rm-embedded')`). If so, the banner
    // must be rendered by the SHELL, not here: position:fixed inside a scrolled
    // iframe is mis-placed on iOS WKWebView, so an in-iframe banner never shows.
    const _embedded = document.documentElement.classList.contains('rm-embedded');

    // Shell / top-level receiver: a content iframe that detected an arrival posts
    // rm-match-banner / rm-match-badge up to its parent. Register this in ANY
    // non-embedded document (the mobile shell, and harmlessly desktop where no
    // iframe posts) so it works whether or not this doc also has the engine. This
    // is the reliable iframe→shell channel on iOS (same one used for keyboard /
    // notif-badge). showBanner/refreshBadges are hoisted; the handler runs async
    // after the IIFE, so all state is initialized by then.
    if (!_embedded) {
        window.addEventListener('message', function (e) {
            const d = e && e.data; if (!d || typeof d !== 'object') return;
            if (e.origin && e.origin !== location.origin && e.origin !== 'null') return;
            if (d.type === 'rm-match-banner') {
                if (d.uid && _uid && String(d.uid) !== String(_uid)) return;
                try { showBanner(d.sub || 'A new listing matches your listing. Tap to view.', d.targetId); } catch (_) {}
            } else if (d.type === 'rm-match-badge') {
                try { refreshBadges(); } catch (_) {}
            }
        });
    }

    // Per-user localStorage identity. Falls back to name when id is absent so
    // the badge still works, but auth id (below) is preferred once resolved.
    let _uid = user.id || null;
    // v2: the badge now counts only NEW matches (arrivals after a one-time
    // baseline), not the whole historical backlog — bumping the key re-baselines
    // everyone the first time this version runs, so old counts don't linger.
    // v3: stop auto-marking existing matches as "seen" on baseline (they now badge
    // until the user opens Matches). Bumping the key resets devices that already
    // baselined under v2 with everything marked seen, so the badge appears for their
    // current unchecked matches.
    const stateKey = () => `rm_match_state_v3_${_uid || user.name}`;
    const dismissKey = () => `dismissed_matches_${_uid || 'anon'}`;

    // Matches that arrived via realtime THIS session — kept unseen even through
    // the first-run baseline (so a live arrival while the user hasn't opened the
    // Portal yet still counts as new rather than being swept into the baseline).
    const _sessionArrivals = new Set();

    function getState() {
        try {
            const s = JSON.parse(localStorage.getItem(stateKey()) || '{}');
            // Dedup current/seen — the shell and the active content iframe can both
            // detect the same arrival and write this shared key, so ids could double.
            return { current: Array.isArray(s.current) ? [...new Set(s.current.map(String))] : [],
                     seen:    Array.isArray(s.seen)    ? [...new Set(s.seen.map(String))]    : [],
                     baselined: !!s.baselined };
        } catch { return { current: [], seen: [], baselined: false }; }
    }
    function setState(s) {
        try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch {}
        // In the mobile shell, content pages run in an iframe whose match state the
        // shell must reflect on its VISIBLE navbar. localStorage `storage` events are
        // unreliable iframe→parent in iOS WKWebView, so ALSO nudge the shell over
        // postMessage (the proven channel this app already uses for keyboard events).
        // The shell re-reads the shared localStorage and repaints its badge.
        if (_embedded) { try { window.parent.postMessage({ type: 'rm-match-badge', uid: _uid }, '*'); } catch (e) {} }
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
                /* Inline, directly beside the nav label (sidebar Portal item) —
                   not floated to the far right edge of the row. */
                .nav-badge--inline{position:static;transform:none;margin-left:7px;flex:0 0 auto;}
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
                #rmMatchBanner{position:fixed;top:calc(14px + var(--rm-safe-top, env(safe-area-inset-top)));left:50%;transform:translateX(-50%) translateY(-160%);width:calc(100% - 24px);max-width:520px;z-index:100000;
                    display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;
                    background:linear-gradient(135deg,#0f172a,#1e3a5f);border:1px solid #32cd32;
                    box-shadow:0 12px 34px -8px rgba(0,0,0,0.55),0 0 0 1px rgba(50,205,50,0.15);
                    color:#fff;font-family:inherit;opacity:0;transition:transform .38s cubic-bezier(.2,.8,.2,1),opacity .38s;cursor:pointer;}
                #rmMatchBanner.show{transform:translateX(-50%) translateY(0);opacity:1;}
                /* Desktop: center over the content area (shift right by half the 240px
                   left sidebar) so it sits top-MIDDLE of the body, not left-of-centre.
                   Mobile (<769px, incl. the app shell) is unchanged. */
                @media (min-width:769px){#rmMatchBanner{left:calc(50% + 120px);}}
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
        try { _setDiag('cur', getState().current.length); _setDiag('unseen', count); } catch (e) {}
        if (count <= 0) return;
        const label = count > 99 ? '99+' : String(count);

        // Portal — desktop sidebar nav item (globe icon). Place the badge INLINE
        // right after the "Portal" label (not floated to the far-right edge of the
        // wide row, which read as detached).
        const sideGlobe = document.querySelector('.nav-item [class*="fa-globe"]');
        if (sideGlobe) {
            const item = sideGlobe.closest('.nav-item') || sideGlobe.parentElement;
            item.appendChild(makeBadge(label, 'global-match-badge', 'nav-badge--inline'));
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
        // Portal Notifications OFF (Settings) silences the banner ONLY — badges have
        // already been updated by the caller (refreshBadges runs before showBanner).
        if (_bannerSilenced()) return;
        // Entering via a tapped AI-match PUSH notification: native-auth.js sets
        // rm_push_match (+ rm_push_match_at timestamp) before routing to the Portal,
        // and livemarket.js opens the Match Engine and highlights these matches.
        // Suppress the in-app banner for this brief entry window so the push and
        // in-app systems never double-notify for the same match. Time-bounded (≤15s)
        // so a stale flag can NEVER permanently mute banners.
        try {
            if (localStorage.getItem('rm_push_match') &&
                (Date.now() - (parseInt(localStorage.getItem('rm_push_match_at'), 10) || 0)) < 15000) return;
        } catch (e) {}
        // Mobile content iframe: hand the banner to the SHELL (which renders the one
        // banner in the real top-level viewport). Same arrival, same text/target —
        // just a different, iOS-safe place to render. The shell listens for this key.
        if (_embedded) {
            const payload = { sub: sub || '', targetId: targetId != null ? String(targetId) : null, uid: _uid || null, ts: Date.now() };
            // postMessage is the reliable iframe→shell channel on iOS; localStorage is
            // a belt-and-suspenders fallback (desktop/other same-origin tabs).
            try { window.parent.postMessage(Object.assign({ type: 'rm-match-banner' }, payload), '*'); } catch (e) {}
            try { localStorage.setItem('rm_match_banner', JSON.stringify(payload)); } catch (e) {}
            return;
        }
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
        // Mobile shell: route through the shell's iframe router to the Portal tab on
        // the AI Engine sub-tab — NEVER a top-level location.href (that would tear
        // down the whole iframe shell). livemarket.js init reads rm_portal_tab +
        // rm_match_highlight → opens the Matches tab and highlights the match,
        // exactly like the desktop cross-page entry. rmOpen only exists in the shell
        // (app-shell.js), so desktop is unaffected.
        if (typeof window.rmOpen === 'function') {
            try { localStorage.setItem('rm_portal_tab', 'AI_ENGINE'); } catch {}
            window.rmOpen('portal', 'livemarket.html');
            return;
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

    // ── Display-only (mobile shell: app.html, no match-engine) ──────────────────
    // Detection runs inside the content iframes; they broadcast each genuine arrival
    // via localStorage 'rm_match_banner'. The shell (the real top-level viewport,
    // where position:fixed renders correctly on iOS) shows the single banner here,
    // reusing the same buildBanner/showBanner/openMatches used on desktop. Badges in
    // the shell are owned by notif-badge.js and are left untouched — we return before
    // any detection/realtime/badge wiring below.
    if (!_hasEngine) {
        // Content iframes (which run detection) notify the shell over postMessage —
        // the reliable iframe→parent channel on iOS WKWebView (the same one app.html
        // uses for keyboard events). `storage` events are kept as a fallback for
        // other same-origin tabs but are NOT relied on for the shell. The shell owns
        // the single visible banner (position:fixed only renders correctly here) and
        // the visible Portal nav badge, both read from the shared localStorage state.
        function _onBanner(d) {
            if (!d) return;
            if (d.uid && _uid && String(d.uid) !== String(_uid)) return;   // current user only
            showBanner(d.sub || 'A new listing matches your listing. Tap to view.', d.targetId);
        }
        window.addEventListener('message', function (e) {
            if (e.origin !== location.origin) return;
            const d = e.data; if (!d || typeof d !== 'object') return;
            if (d.type === 'rm-match-banner') _onBanner(d);
            else if (d.type === 'rm-match-badge') { try { refreshBadges(); } catch (_) {} }
        });
        // Fallbacks via storage (other tabs / non-iframe same-origin contexts).
        window.addEventListener('storage', function (e) {
            if (e.key === 'rm_match_banner' && e.newValue) { let d; try { d = JSON.parse(e.newValue); } catch (_) { return; } _onBanner(d); }
            else if (e.key && e.key.indexOf('rm_match_state_') === 0) { try { refreshBadges(); } catch (_) {} }
        });
        refreshBadges();
        document.addEventListener('DOMContentLoaded', refreshBadges);
        return;
    }

    // ── Match state cache (the user's own listings, for realtime scoring) ──
    let _myParsed = [];      // parsed own listings
    let _myUid = _uid;       // auth user id once resolved
    let _unlockedOwners = (typeof Set !== 'undefined') ? new Set() : null;  // owners who re-unlocked their posts to me

    // Visibility Controls: a listing whose owner hid it from me must NEVER be scored,
    // badged, or bannered for me — the same RMVisibility rule the Portal applies at
    // fetch time, now enforced in the realtime AI-match pipeline too. Fail-open: if
    // RMVisibility isn't loaded, nothing is hidden (prior behavior).
    function _visibleToMe(listing) {
        try {
            if (!window.RMVisibility) return true;
            return window.RMVisibility.visibleToViewer(listing, _myUid, _unlockedOwners);
        } catch (e) { return true; }
    }
    async function _loadUnlocked() {
        try {
            if (window.RMVisibility && window.RMVisibility.fetchUnlockedOwnerIds && _myUid) {
                _unlockedOwners = await window.RMVisibility.fetchUnlockedOwnerIds(_sb, _myUid);
            }
        } catch (e) { /* fail-open */ }
    }

    async function loadMine() {
        try {
            let authUid = null;
            try { authUid = (await _sb.auth.getUser()).data?.user?.id || null; } catch (e) {}
            if (authUid) { _myUid = authUid; _uid = _uid || authUid; }
            _setDiag('uid', _myUid ? (String(_myUid).slice(0, 6) + '…') : 'NULL');
            if (!_myUid) { _setDiag('note', 'loadMine:no-uid'); return; }
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
            _setDiag('mine', _myParsed.length);
        } catch (e) { _setDiag('note', 'loadMine:err ' + (e && e.message || e)); }
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

    // When MY OWN listing is posted/edited, the new matches are between MY listing
    // and OTHER people's EXISTING listings — which never arrive as a realtime event
    // here (they already exist). The realtime INSERT of my own post only re-primes
    // _myParsed; nothing scans the market for those new matches, so (off the Portal)
    // the user got no banner/badge for matches their own post created. This scans the
    // active market once (after _myParsed is refreshed) and surfaces any genuinely
    // unseen matches exactly like a realtime arrival — banner + badge, on any page.
    async function _scanMarketForMatches() {
        if (!_myParsed.length || !_myUid) return;
        let rows = [];
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/listings?select=*&archived=eq.false&order=created_at.desc&limit=500`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            rows = await res.json();
        } catch (e) { return; }
        if (!Array.isArray(rows)) return;
        const s = getState();
        const dismissed = getDismissed();
        const seenSet = new Set(s.seen);
        const curSet = new Set(s.current);
        const newly = [];
        rows.forEach(l => {
            if (!l || l.id == null) return;
            const id = String(l.id);
            if (l.user_id && l.user_id === _myUid) return;          // my own post, never a match for me
            if (l.is_anonymous || l.archived || _isCompleted(l)) return;
            if (!_visibleToMe(l)) return;                            // owner hid this post from me
            if (curSet.has(id) || seenSet.has(id) || dismissed.has(id)) return;
            if (!matchesMine(l)) return;
            newly.push({ id, listing: l });
        });
        if (!newly.length) return;
        newly.forEach(n => { s.current.push(n.id); _sessionArrivals.add(n.id); });
        _persistMatches(newly.map(n => n.id));
        setState(s);
        refreshBadges();
        _setDiag('scan', 'found ' + newly.length);
        showBanner(
            newly.length === 1 ? bannerSubFor(newly[0].listing)
                               : `${newly.length} new listings match your listing. Tap to view.`,
            newly[0].id
        );
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

    // ── Seen state: cross-device source of truth (match_seen table) ───────────
    // "Seen" (the user opened AI Matches while a match was surfaced) is persisted
    // per-user in the backend so it survives login, reload, and moving between
    // desktop and mobile. localStorage stays a fast cache; the backend is the
    // truth that prevents already-seen matches from re-badging as new. Fail-open:
    // if the table/migration isn't present, we silently keep localStorage-only
    // behavior (a load/insert error just leaves _seenLoaded true so badges still
    // paint from the local cache).
    let _seenLoaded = false;       // backend seen-set merged into state yet?
    let _pendingRecordIds = null;  // a recordMatches() that arrived before that

    async function _loadSeen() {
        const uid = _myUid || _uid;
        try {
            if (uid && _sb) {
                const { data, error } = await _sb.from('match_seen').select('listing_id').eq('user_id', uid);
                if (!error && Array.isArray(data) && data.length) {
                    const s = getState();
                    s.seen = [...new Set([...(s.seen || []), ...data.map(r => String(r.listing_id)).filter(Boolean)])];
                    setState(s);
                }
            }
        } catch (e) { /* fail-open → local cache only */ }
        _seenLoaded = true;
        refreshBadges();
        if (_pendingRecordIds != null) { const ids = _pendingRecordIds; _pendingRecordIds = null; recordMatches(ids); }
    }

    function _persistSeen(ids) {
        try {
            const uid = _myUid || _uid;
            if (!uid || !_sb || !ids || !ids.length) return;
            const rows = [...new Set(ids.map(String))].filter(Boolean).map(id => ({ user_id: uid, listing_id: id }));
            if (!rows.length) return;
            _sb.from('match_seen')
                .upsert(rows, { onConflict: 'user_id,listing_id', ignoreDuplicates: true })
                .then(function () {}).catch(function () {});   // fail-open
        } catch (e) { /* never disrupt the UI */ }
    }

    // ── Public API ──────────────────────────────────────────────────────────
    // recordMatches(ids): the Portal's authoritative full current match set.
    // Replaces `current`; new ids simply become unseen (badge). No banner here —
    // the banner is reserved for genuine realtime ARRIVALS (noteIncoming), so a
    // first-ever Portal load doesn't spam a banner for pre-existing matches.
    function recordMatches(ids) {
        // Wait until the backend seen-set has merged, so the very first recompute
        // after login/reload classifies already-seen matches correctly instead of
        // baselining them as unseen (the badge pile-up). Buffer the latest ids.
        if (!_seenLoaded) { _pendingRecordIds = ids; return; }
        const s = getState();
        const prevCurrent = new Set(s.current);
        const cur = [...new Set((ids || []).map(String))];
        s.current = cur;

        // Persist every currently-surfaced match (deduped inside) — covers the
        // baseline set on first load and any ids added on later recomputes.
        _persistMatches(cur);

        // First time we see this user's matches on this device: mark baselined so
        // later recomputes can banner for NEW arrivals — but do NOT mark the current
        // matches as "seen". They stay UNREAD so they BADGE (the red count) until the
        // user actually opens the Matches tab (markSeen). We only suppress the
        // first-load BANNER here so pre-existing matches don't banner-spam. (Fixes the
        // badge never appearing on a device that baselined before the user checked —
        // e.g. the mobile Portal nav while desktop already showed it.)
        if (!s.baselined) {
            s.baselined = true;
            // Keep the seen-set intact (incl. backend-loaded ids) — NEVER prune it to
            // the current recompute, or an already-seen match that is momentarily
            // absent from `cur` would re-count as new. Cap only for storage tidiness.
            s.seen = (s.seen || []).slice(-5000);
            setState(s);
            refreshBadges();
            return;
        }

        // Keep the seen-set as-is (bounded). getUnseen() already ignores seen ids
        // that aren't current, and noteRemoved() clears genuinely gone matches — so
        // we must not drop a valid 'seen' here (that was re-badging seen matches).
        s.seen = (s.seen || []).slice(-5000);
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
        if (listing.user_id && _myUid && listing.user_id === _myUid) { _setDiag('note', id+':own'); return; } // my own post
        if (!_visibleToMe(listing)) { _setDiag('note', id+':hidden'); return; }   // owner hid this post from me
        const dismissed = getDismissed();
        if (dismissed.has(id)) { _setDiag('note', id+':dismissed'); return; }
        const s = getState();
        if (s.seen.includes(id)) { _setDiag('note', id+':seen'); return; }      // already checked → no re-alert
        if (s.current.includes(id)) { _setDiag('note', id+':dup'); return; }   // already counted → no duplicate banner
        if (!matchesMine(listing)) { _setDiag('note', id+':nomatch(mine='+_myParsed.length+')'); return; }
        _sessionArrivals.add(id);   // a genuine live arrival — survives the baseline
        s.current.push(id);
        _persistMatches([id]);      // count this newly-arrived match
        setState(s);
        refreshBadges();
        _setDiag('note', id+':BANNER');
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
        _persistSeen(ids);   // cross-device truth → stays seen on reload / other device
    }

    window.RMMatchAlert = { recordMatches, noteIncoming, markSeen, getUnseen, refreshBadges };

    // Cross-document badge sync: match state lives in localStorage, so when it
    // changes in ANOTHER same-origin document (the Portal iframe detecting/clearing
    // a match, or another tab) re-render THIS document's badges. This is what makes
    // the mobile app-shell's VISIBLE Portal badge appear/update live — detection
    // runs in the Portal iframe (hidden navbar), the shell just reflects the state.
    window.addEventListener('storage', function (e) {
        if (e.key && e.key.indexOf('rm_match_state_') === 0) { try { refreshBadges(); } catch (_) {} }
    });

    // ── Boot ──────────────────────────────────────────────────────────────
    // Paint whatever the persisted state says right away, then resolve the auth
    // id + own listings and wire realtime.
    refreshBadges();
    document.addEventListener('DOMContentLoaded', refreshBadges);

    // Badge-only mode: the match engine isn't loaded here (e.g. the mobile shell
    // app.html). Skip detection/realtime — refreshBadges() + the storage listener
    // above keep the visible Portal badge in sync from the shared state.
    if (typeof window.RM_MATCH === 'undefined') return;

    const _sb = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

    (async function boot() {
        if (!_sb) { _seenLoaded = true; return; }
        await loadMine();
        await _loadUnlocked();   // owners who've re-unlocked their hidden posts to me
        // Seed the seen-set from the backend BEFORE any recordMatches is processed,
        // so already-seen matches are never counted as new on login/reload/new device.
        await _loadSeen();
        refreshBadges();

        // Realtime: any new/edited listing anywhere → score against mine. Broad
        // subscribe + client-side filter (RLS is disabled on these tables; same
        // pattern notif-badge.js uses). Debounced own-listing refresh so posting
        // a NEW own listing re-primes _myParsed (new matches can then be found).
        let _mineTimer = null;
        // Posting/editing MY OWN listing re-primes _myParsed AND then scans the market
        // for the new matches that own post created (against others' existing listings).
        const reloadMineDebounced = () => {
            clearTimeout(_mineTimer);
            _mineTimer = setTimeout(async () => { await loadMine(); await _scanMarketForMatches(); }, 800);
        };
        try {
            _sb.channel('match-alert-listings')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' },
                    (payload) => {
                        const row = payload.new;
                        _setDiag('lastEvt', 'INS#'+(row&&row.id));
                        if (row.user_id && _myUid && row.user_id === _myUid) { reloadMineDebounced(); return; }
                        noteIncoming(row);
                    })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' },
                    (payload) => {
                        const row = payload.new;
                        _setDiag('lastEvt', 'UPD#'+(row&&row.id));
                        // A listing that just became completed or archived can no
                        // longer be a match — drop it from the badge set live.
                        if (_isCompleted(row) || row.archived) { noteRemoved(row); }
                        // Owner just hid this post from me (hidden_user_ids changed) —
                        // drop any existing match/badge for it live, no refresh needed.
                        if (!_visibleToMe(row)) { noteRemoved(row); return; }
                        if (row.user_id && _myUid && row.user_id === _myUid) { reloadMineDebounced(); return; }
                        if (_isCompleted(row) || row.archived) return; // handled above
                        noteIncoming(row);
                    })
                .subscribe((status) => { _setDiag('sub', status); });
        } catch (e) { _setDiag('sub', 'EXC'); console.warn('[MatchAlert] realtime subscription failed:', e); }
    })();

    // Fallback repaint every 60s (a missed realtime event, tab wakeup, etc.).
    setInterval(refreshBadges, 60000);
})();
