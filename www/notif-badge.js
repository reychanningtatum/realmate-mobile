// 🔔 GLOBAL NOTIFICATION BADGE — loads on every page
(async function () {
    const SUPABASE_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';

    const user = JSON.parse(localStorage.getItem("user")) || { name: "" };
    const userSettings = JSON.parse(localStorage.getItem("userSettings")) || { anonName: "" };
    if (!user.name) return;

    function _recipientFilters() {
        let nameFilter = `recipient_user_name.eq."${user.name}"`;
        if (userSettings.anonName) {
            nameFilter += `,recipient_user_name.eq."${userSettings.anonName}"`;
        }
        const idFilter = user.id ? `recipient_id.eq.${user.id},${nameFilter}` : nameFilter;
        return { idFilter, nameFilter };
    }

    // Unread notifications, EXCLUDING type=mate_request. A still-pending
    // request is counted once via fetchPendingRequestsCount() below instead
    // — counting it here too would double-count the exact same underlying
    // request the moment its notification is unread. An already-resolved
    // (accepted/declined) mate_request notification that's simply never been
    // opened correctly contributes nothing either way: it's excluded here,
    // and it's no longer 'pending' so fetchPendingRequestsCount() won't pick
    // it up — matching "no longer actionable, don't count it."
    async function fetchUnreadNonRequestCount() {
        try {
            const { idFilter, nameFilter } = _recipientFilters();

            const runQuery = (filter) => fetch(
                `${SUPABASE_URL}/rest/v1/notifications?select=id&is_read=eq.false&type=neq.mate_request&or=(${encodeURIComponent(filter)})`,
                {
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

            // If recipient_id doesn't exist yet on this database (the
            // additive notifications-sender-id-migration.sql hasn't run
            // there), PostgREST rejects the whole request with a non-2xx
            // status rather than just ignoring that clause — retry with the
            // name-only filter instead of silently returning 0 forever.
            let res = await runQuery(idFilter);
            if (!res.ok) res = await runQuery(nameFilter);

            const data = await res.json();
            return Array.isArray(data) ? data.length : 0;
        } catch {
            return 0;
        }
    }

    // Pending incoming Realmate requests, straight from the mates table —
    // this is the actual source of truth for "still actionable" (same one
    // the Notifications Hub's own Requests tab counter uses), not the
    // notification row's is_read flag. A request that's been read but not
    // yet accepted/declined still belongs in the badge; one that's been
    // accepted/declined/removed — even via a surface that never touches the
    // notification row at all, like realmates.html's Requests In tab — drops
    // out immediately since its mates row no longer has status=pending.
    async function fetchPendingRequestsCount() {
        try {
            // mates.recipient_id/recipient_name are native columns (unlike
            // notifications.recipient_id, they were never an additive
            // migration), so no "column might not exist" fallback is needed
            // here — just id-or-name, same rename-safety as elsewhere.
            const recipientFilter = user.id
                ? `recipient_id.eq.${user.id},recipient_name.eq."${user.name}"`
                : `recipient_name.eq."${user.name}"`;

            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/mates?select=id&status=eq.pending&or=(${encodeURIComponent(recipientFilter)})`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const data = await res.json();
            return Array.isArray(data) ? data.length : 0;
        } catch {
            return 0;
        }
    }

    // Single source of truth for every nav badge's appearance (Chat and
    // Notifications alike): one shared CSS class carries every visual
    // property, injected once. Only the two position variants below differ
    // between the desktop sidebar (badge centered on the row, to the right
    // of the label) and the mobile bottom nav (badge on the icon's corner,
    // since icon and label stack vertically there instead of sitting
    // side-by-side). Previously the bell and chat badges each built their
    // own inline cssText independently, and had quietly drifted apart
    // (18px/10px vs 16px/9px) — a single shared class makes that class of
    // drift structurally impossible going forward.
    if (!document.getElementById('nav-badge-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'nav-badge-styles';
        styleEl.textContent = `
            .nav-badge {
                position: absolute;
                background: #ef4444;
                color: #fff;
                font-size: 9px;
                font-weight: 800;
                min-width: 16px;
                height: 16px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 3px;
                pointer-events: none;
                line-height: 1;
                box-shadow: 0 2px 6px rgba(239,68,68,0.4);
                z-index: 10;
            }
            .nav-badge--row { top: 50%; right: 10px; transform: translateY(-50%); }
            .nav-badge--corner { top: 2px; right: 50%; transform: translateX(calc(50% + 8px)); }
            /* Mobile-only fix: the badge is a plain <span>, and the
               pre-existing ".mob-nav-item span" rule (home.css, styles the
               "Chat"/"Notifications" nav labels) unintentionally matches it
               too since it's nested inside .mob-nav-item. That rule's
               specificity (.mob-nav-item span) beats plain .nav-badge, so it
               was silently overriding font-size/line-height AND display
               (block instead of flex) — meaning align-items/justify-content
               centering was never actually applying. Scoping this override
               to .mob-nav-item keeps it mobile-only; the desktop sidebar
               badge (.nav-item .nav-badge) never had this collision and is
               untouched. */
            .mob-nav-item .nav-badge {
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                line-height: 1;
            }
        `;
        document.head.appendChild(styleEl);
    }

    function createNavBadge(label, typeClass, positionClass) {
        const badge = document.createElement('span');
        badge.className = `nav-badge ${positionClass} ${typeClass}`;
        badge.textContent = label;
        return badge;
    }

    function applyBadge(count) {
        // Remove existing badges first
        document.querySelectorAll('.global-notif-badge').forEach(el => el.remove());

        if (count <= 0) return;

        const label = count > 99 ? '99+' : String(count);

        // Desktop sidebar bell
        const sidebarBell = document.querySelector('.nav-item [class*="fa-bell"]');
        if (sidebarBell) {
            const wrapper = sidebarBell.parentElement;
            wrapper.style.position = 'relative';
            wrapper.appendChild(createNavBadge(label, 'global-notif-badge', 'nav-badge--row'));
        }

        // Mobile bottom nav bell
        const mobileBell = document.querySelector('.mob-nav-item [class*="fa-bell"]');
        if (mobileBell) {
            const wrapper = mobileBell.parentElement;
            wrapper.style.position = 'relative';
            wrapper.appendChild(createNavBadge(label, 'global-notif-badge', 'nav-badge--corner'));
        }
    }

    async function fetchUnreadChatCount() {
        try {
            const u = JSON.parse(localStorage.getItem('user') || 'null');
            if (!u?.id) return 0;

            // Which conversations this user is actually in, first — the
            // messages query below is scoped to just these, server-side,
            // rather than fetching every unread message on the platform
            // and trying to match them client-side. (The previous version
            // did the latter, but only ever selected `id` from messages —
            // never `conversation_id` — so the client-side match against
            // `m.conversation_id` was always comparing against `undefined`
            // and the function silently returned 0 every time, regardless
            // of how many unread messages genuinely belonged to the user.)
            const partRes = await fetch(
                `${SUPABASE_URL}/rest/v1/conversation_participants?select=conversation_id&user_id=eq.${u.id}`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const parts = await partRes.json();
            if (!Array.isArray(parts) || !parts.length) return 0;
            const convIds = [...new Set(parts.map(p => p.conversation_id))];

            const idList = convIds.map(id => `"${id}"`).join(',');
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/messages?select=conversation_id&is_read=eq.false&sender_id=neq.${u.id}&conversation_id=in.(${idList})`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            const data = await res.json();
            if (!Array.isArray(data)) return 0;
            // Badge counts unread CONVERSATIONS, not unread messages — 50
            // unread messages from one person is still just 1 conversation
            // to catch up on, so dedupe by conversation_id.
            const unreadConvIds = new Set(data.map(m => m.conversation_id));

            // Muted/manually-marked-unread state lives in chat.js's
            // localStorage flags (no DB column for either — see chat.js for
            // why) under the same origin, so it's readable here too. Muting
            // suppresses a conversation's contribution to the badge even if
            // it has real unread messages; manually marking one unread adds
            // it even though its messages are actually all read.
            try {
                const muted = new Set(JSON.parse(localStorage.getItem(`chat_muted_${u.id}`)) || []);
                muted.forEach(id => unreadConvIds.delete(id));
                const manualUnread = JSON.parse(localStorage.getItem(`chat_manualUnread_${u.id}`)) || [];
                manualUnread.forEach(id => { if (!muted.has(id)) unreadConvIds.add(id); });
            } catch {}

            return unreadConvIds.size;
        } catch { return 0; }
    }

    function applyChatBadge(count) {
        document.querySelectorAll('.global-chat-badge').forEach(el => el.remove());
        if (count <= 0) return;
        const label = count > 99 ? '99+' : String(count);

        const sidebarChat = document.querySelector('.nav-item [class*="fa-comment"]');
        if (sidebarChat) {
            const wrapper = sidebarChat.parentElement;
            wrapper.style.position = 'relative';
            wrapper.appendChild(createNavBadge(label, 'global-chat-badge', 'nav-badge--row'));
        }

        const mobileChat = document.querySelector('.mob-nav-item [class*="fa-comment"]');
        if (mobileChat) {
            const wrapper = mobileChat.parentElement;
            wrapper.style.position = 'relative';
            wrapper.appendChild(createNavBadge(label, 'global-chat-badge', 'nav-badge--corner'));
        }
    }

    // Both badge refreshers are generation-guarded: every call stamps a
    // ticket, and when its fetch resolves it only touches the DOM if it's
    // still the most recently *started* call for that badge. Without this,
    // two overlapping calls (e.g. a burst of realtime INSERTs, each kicking
    // off its own fetch-then-applyBadge) could interleave — call A clears
    // the old badge and awaits its fetch, call B also clears (finding
    // nothing, since A hasn't re-added yet) and awaits its own fetch, then
    // both resolve and both append, leaving two badges stuck in the DOM
    // side by side. Stamping + checking the ticket after the await means a
    // superseded call just no-ops instead of appending a stray badge.
    let _notifGen = 0;
    async function refreshNotifBadge() {
        const myGen = ++_notifGen;
        // The badge is unread-notifications-that-aren't-a-request PLUS
        // still-pending requests, not a single raw is_read count — see the
        // two fetch functions above for why each half is scoped the way it
        // is (this is what keeps a request from being counted twice).
        const [unreadCount, pendingRequestsCount] = await Promise.all([
            fetchUnreadNonRequestCount(),
            fetchPendingRequestsCount()
        ]);
        if (myGen !== _notifGen) return;
        applyBadge(unreadCount + pendingRequestsCount);
    }

    let _chatGen = 0;
    async function refreshChatBadge() {
        const myGen = ++_chatGen;
        const count = await fetchUnreadChatCount();
        if (myGen !== _chatGen) return;
        applyChatBadge(count);
    }

    async function refresh() {
        await Promise.all([refreshNotifBadge(), refreshChatBadge()]);
    }

    // Run on load then every 60 seconds as a fallback in case a realtime
    // event is ever missed (tab was backgrounded, socket hiccup, etc.).
    await refresh();
    setInterval(refresh, 60000);

    // Debounced re-check — used by the realtime subscriptions below so a
    // burst of several events arriving at once (several notifications in
    // quick succession, or an INSERT immediately followed by an UPDATE)
    // triggers one recount instead of one per event. The generation guard
    // inside refreshNotifBadge/refreshChatBadge (above) is what actually
    // keeps the DOM correct even if a burst outruns the debounce window;
    // this just cuts down on redundant network calls in the common case.
    let _notifRefreshTimer = null;
    function refreshNotifBadgeDebounced() {
        clearTimeout(_notifRefreshTimer);
        _notifRefreshTimer = setTimeout(refreshNotifBadge, 250);
    }
    let _chatRefreshTimer = null;
    function refreshChatBadgeDebounced() {
        clearTimeout(_chatRefreshTimer);
        _chatRefreshTimer = setTimeout(refreshChatBadge, 250);
    }

    // Realtime subscription for instant notifications
    try {
        const _notifSupa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const isMine = (row) => (user.id && row.recipient_id === user.id) ||
            row.recipient_user_name === user.name ||
            (userSettings.anonName && row.recipient_user_name === userSettings.anonName);
        _notifSupa
            .channel('notif-badge')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => { if (isMine(payload.new)) refreshNotifBadgeDebounced(); }
            )
            // Marking a notification read/unread (from the Notifications Hub,
            // "mark all as read", or another tab/device) only ever UPDATEs
            // the row — without listening here too, this nav badge stayed
            // stale until the 60s poll caught up, even though the Hub's own
            // unread count had already changed.
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'notifications' },
                (payload) => { if (isMine(payload.new)) refreshNotifBadgeDebounced(); }
            )
            // Reversing the action behind a notification DELETEs its row (an
            // unliked post's like-notification, a withdrawn Realmate request)
            // — recount so the bell badge drops in real time instead of
            // waiting for the 60s poll. A DELETE payload's "old" row may carry
            // only the primary key (unless replica identity is FULL), so when
            // neither recipient field is present there's no way to rule it
            // out — refresh anyway; refreshNotifBadge re-derives the correctly
            // scoped count regardless of what triggered it.
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'notifications' },
                (payload) => {
                    const row = payload.old;
                    const unknownRecipient = !row ||
                        (row.recipient_id === undefined && row.recipient_user_name === undefined);
                    if (unknownRecipient || isMine(row)) refreshNotifBadgeDebounced();
                }
            )
            .subscribe();
    } catch (e) {
        console.warn('Realtime notif subscription failed:', e);
    }

    // Realtime subscription for the mates table — accepting/declining a
    // request (e.g. from realmates.html's Requests In tab) only ever
    // UPDATEs (accept) or DELETEs (decline/remove) a mates row; neither
    // touches the notifications table at all for the person who just acted,
    // so without this the pending-requests half of the badge stayed stale
    // until the 60s poll. INSERT is deliberately not listened for here — a
    // brand-new pending request already arrives via its own `notifications`
    // INSERT above.
    try {
        const _matesSupa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        // A DELETE payload's "old" row can come back with only the primary
        // key populated, depending on the table's replica identity setting
        // — if neither recipient field is present at all, there's no way to
        // rule this delete out, so refresh anyway rather than silently
        // missing it (fetchPendingRequestsCount() re-derives the correct
        // scoped count regardless of what triggered the refresh).
        const isMineAsRecipient = (row) => {
            if (!row) return true;
            if (row.recipient_id === undefined && row.recipient_name === undefined) return true;
            return (user.id && row.recipient_id === user.id) || row.recipient_name === user.name;
        };
        _matesSupa
            .channel('notif-badge-mates')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'mates' },
                (payload) => { if (isMineAsRecipient(payload.new)) refreshNotifBadgeDebounced(); }
            )
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'mates' },
                (payload) => { if (isMineAsRecipient(payload.old)) refreshNotifBadgeDebounced(); }
            )
            .subscribe();
    } catch (e) {
        console.warn('Realtime mates-badge subscription failed:', e);
    }

    // Realtime subscription for the chat badge specifically. Sending a
    // message never creates a `notifications` row (only chat.js's own
    // per-conversation channels see it), so without this the global nav
    // badge on every *other* page only ever updated on the 60s poll —
    // not real-time. No server-side filter (same broad-subscribe /
    // filter-client-side pattern chat.js's own conv-list channel already
    // uses, since RLS is disabled on these tables): fetchUnreadChatCount()
    // re-fetches the user's current conversation membership fresh every
    // call, so this also naturally covers a brand-new conversation's
    // first message without any extra participant-tracking here.
    // Listening for UPDATE too (not just INSERT) is what makes this
    // cross-device: if the user reads a message on another device/tab,
    // that write's realtime UPDATE event reaches this page and clears
    // the badge here immediately as well.
    try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u?.id) {
            const _chatSupa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            _chatSupa
                .channel('notif-badge-chat')
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'messages' },
                    (payload) => {
                        if (payload.new.sender_id !== u.id) refreshChatBadgeDebounced();
                    }
                )
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'messages' },
                    () => refreshChatBadgeDebounced()
                )
                .subscribe();
        }
    } catch (e) {
        console.warn('Realtime chat-badge subscription failed:', e);
    }
})();
