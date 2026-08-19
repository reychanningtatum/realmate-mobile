// 🔥 SUPABASE AND LOCAL AUTH CONTEXT PARSER
const supabaseUrl = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const supabaseKey = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let user = JSON.parse(localStorage.getItem("user")) || {
    name: "",
    division: "",
    image: "https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32"
};

let localNotificationsCache = [];

// Header "⋯" menu (Mark all as read moved here from the top-level header).
function toggleNotifHeaderMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('notifHeaderMenu');
    if (menu) menu.classList.toggle('open');
}
function closeNotifHeaderMenu() {
    document.getElementById('notifHeaderMenu')?.classList.remove('open');
}
document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.notif-menu-wrap');
    const menu = document.getElementById('notifHeaderMenu');
    if (menu && wrap && !wrap.contains(e.target)) closeNotifHeaderMenu();
});

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when generated, so
// trusting a stored one as-is after a rename shows stale initials forever.
function _notifAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;
}

// notifications.sender_profile_picture/sender_user_name are plain-text
// snapshots taken when the notification was created — there was originally
// no user_id reference at all to re-resolve them by later. sender_id/
// recipient_id (see notifications-sender-id-migration.sql) let NEW
// notifications be looked up live instead; rows written before that
// migration ran have no id to resolve by and keep showing their original
// snapshot — the same two-tier "id first, name fallback" pattern already
// used by _resolveLiveAuthors (home.js) and sendMateRequest (mates.js) for
// this exact class of problem. Mutates `rows` in place.
async function _resolveLiveSenders(rows) {
    const withId   = (rows || []).filter(r => r.sender_id);
    const withName = (rows || []).filter(r => !r.sender_id && r.sender_user_name);
    const ids   = [...new Set(withId.map(r => r.sender_id))];
    const names = [...new Set(withName.map(r => r.sender_user_name))];
    if (!ids.length && !names.length) return;

    const byId = {}, byName = {};
    if (ids.length) {
        const { data } = await _supabase.from('profiles').select('id,full_name,avatar_url').in('id', ids);
        (data || []).forEach(p => { byId[p.id] = p; });
    }
    if (names.length) {
        const { data } = await _supabase.from('profiles').select('id,full_name,avatar_url').in('full_name', names);
        (data || []).forEach(p => { byName[p.full_name] = p; });
    }
    (rows || []).forEach(r => {
        const p = r.sender_id ? byId[r.sender_id] : byName[r.sender_user_name];
        if (!p) return;
        const liveName = p.full_name || r.sender_user_name;
        r.sender_user_name = liveName;
        r.sender_profile_picture = _notifAvatarFor(liveName, p.avatar_url);
        // Rows written before notifications-sender-id-migration.sql (or by
        // dispatchNotificationTrigger in forum-script.js, which never set it)
        // have no sender_id at all — backfill it from the name-based profile
        // lookup above so every downstream consumer (mate-status checks,
        // click-through routing, the avatar/name links) can resolve by id
        // instead of re-matching on a name that may drift after a rename.
        if (!r.sender_id && p.id) r.sender_id = p.id;
    });
}

// Runs a notifications query/update with an id+name .or() filter. If
// recipient_id doesn't exist yet on this database (the additive
// notifications-sender-id-migration.sql hasn't been run there), Postgres
// rejects the whole request rather than just ignoring that clause — so this
// transparently retries with the name-only filter instead of taking down
// the entire notifications page. Once the migration runs, the first
// (id-based) attempt always succeeds and this fallback never triggers.
async function _notifQueryWithIdFallback(buildQuery, idFilter, nameFilter) {
    const withId = await buildQuery(idFilter);
    if (!withId.error) return withId;
    const isMissingColumn = withId.error.code === '42703' || /recipient_id/i.test(withId.error.message || '');
    if (!isMissingColumn) return withId;
    console.warn('[Notifications] recipient_id column not found — falling back to name-only matching. Run notifications-sender-id-migration.sql to enable id-based matching.');
    return buildQuery(nameFilter);
}

/**
 * 🚀 TIME DISTANCE FORMAT ENGINE (RELATIVE STRINGS)
 */
function formatRelativeTime(dateString) {
    if (!dateString) return "Recent";
    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return "Recent";

    const now = new Date();
    const diffSeconds = Math.floor((now - parsedDate) / 1000);

    if (diffSeconds < 60) return "Just now";
    
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
}

/**
 * 🚀 DATABASE FETCH ROUTINE: INTEGRATED MULTI-IDENTITY MATCHING WITH QUOTE SANITIZATION
 */
async function fetchNotificationsList() {
    try {
        const userSettings = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };

        // recipient_id first — a notification's recipient_user_name is a
        // snapshot taken at creation time, so after a rename it no longer
        // matches the current live user.name and the notification silently
        // stops appearing even though it's genuinely for this account.
        let nameFilter = `recipient_user_name.eq."${user.name}"`;
        if (userSettings.anonName) {
            nameFilter += `,recipient_user_name.eq."${userSettings.anonName}"`;
        }
        const idFilter = user.id ? `recipient_id.eq.${user.id},${nameFilter}` : nameFilter;

        const { data, error } = await _notifQueryWithIdFallback(
            (filter) => _supabase.from('notifications').select('*').or(filter).order('created_at', { ascending: false }),
            idFilter, nameFilter
        );

        if (error) throw error;

        localNotificationsCache = data || [];
        await _resolveLiveSenders(localNotificationsCache);
        renderNotificationsInterface();
    } catch (err) {
        console.error("Notifications Sync Failure:", err);
        const container = document.getElementById("notificationsContainer");
        if (container) {
            container.innerHTML = `
                <div class="hub-empty-state-card">
                    <i class="fas fa-exclamation-circle" style="color:#ef4444;"></i>
                    <p>Failed to synchronize notifications matrix layer: ${err.message}</p>
                </div>`;
        }
    }
}

// All | Unread | Realmate Requests — which tab is currently selected.
let _notifFilter = 'all';
function setNotifFilter(filter) {
    _notifFilter = filter;
    document.querySelectorAll('.notif-filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    renderNotificationsInterface();
}

// Builds one notification row — the single source for what a notification
// card looks like, regardless of which filter tab is showing it.
function _buildNotificationCard(notif) {
    const row = document.createElement("div");
    row.className = `notification-hub-card ${!notif.is_read ? 'hub-card-unread' : ''}`;
    row.onclick = () => handleNotificationRowClick(notif.id);

    const type = notif.type || '';
    let typeIcon = "fa-bell";
    let contextClass = "badge-reply";

    if (type === 'offer') {
        typeIcon = "fa-handshake";
        contextClass = "badge-offer";
    } else if (type === 'mate_request') {
        typeIcon = "fa-user-plus";
        contextClass = "badge-mate";
    } else if (type === 'mate_accepted') {
        typeIcon = "fa-user-group";
        contextClass = "badge-mate";
    } else if (type === 'mate_declined') {
        typeIcon = "fa-user-xmark";
        contextClass = "badge-mate";
    } else if (type === 'follow') {
        typeIcon = "fa-user-check";
        contextClass = "badge-mate";
    } else if (type === 'match') {
        typeIcon = "fa-bolt";
        contextClass = "badge-offer";
    } else if (type === 'post_share') {
        typeIcon = "fa-share";
        contextClass = "badge-reply";
    } else if (type === 'broadcast') {
        typeIcon = "fa-bullhorn";
        contextClass = "badge-reply";
    } else if (type.includes("like")) {
        typeIcon = "fa-heart";
        contextClass = "badge-like";
    } else if (type.includes("mention")) {
        typeIcon = "fa-at";
        contextClass = "badge-mention";
    } else if (type.includes("reply") || type.includes("comment")) {
        typeIcon = "fa-comment-alt";
        contextClass = "badge-reply";
    }

    // The mates table (via getMateStatus) is the actual source of truth for
    // a request's outcome — 'pending_received' means it's still awaiting a
    // decision, 'accepted' means it was accepted, anything else means the
    // row is gone (declined, or removed after being accepted). is_read must
    // never stand in for this: viewing the notification (or "mark all as
    // read") only flips is_read, it doesn't touch the request itself, so
    // using is_read here was showing "Request declined." for requests that
    // were simply READ while still genuinely pending. Passing sender_id
    // alongside the name lets this resolve correctly even if the sender
    // renamed after the mates row was written (see _matesCacheById).
    const mateStatus = typeof getMateStatus === 'function' ? getMateStatus(notif.sender_user_name, notif.sender_id) : 'none';
    const isStillPending = mateStatus === 'pending_received';
    // event.stopPropagation() keeps Accept/Decline in-place: the card itself has a
    // row-level onclick that routes mate_request notifications to the sender's
    // profile, and without this the button click would bubble up and navigate away
    // instead of just accepting/declining right here.
    const mateActions = (type === 'mate_request' && isStillPending) ? `
        <div class="mate-request-actions">
            <button class="mate-accept-btn" onclick="event.stopPropagation(); handleNotifAcceptMate(this, '${notif.sender_user_name.replace(/'/g, "\\'")}', '${notif.id}')">
                <i class="fas fa-check"></i> Accept
            </button>
            <button class="mate-decline-btn" onclick="event.stopPropagation(); handleNotifDeclineMate(this, '${notif.sender_user_name.replace(/'/g, "\\'")}', '${notif.id}')">
                <i class="fas fa-times"></i> Decline
            </button>
        </div>` : (type === 'mate_request' && !isStillPending
            ? (mateStatus === 'accepted'
                ? `<p class="mate-confirmed-msg"><i class="fas fa-user-group"></i> You are now Realmates!</p>`
                : `<p class="mate-declined-msg">Request declined.</p>`)
            : '');

    row.innerHTML = `
        <div class="hub-avatar-block">
            <img src="${notif.sender_profile_picture || 'https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32'}" class="hub-avatar-img hub-avatar-clickable" alt="Sender Avatar" title="View profile" onclick="event.stopPropagation(); _notifGoToSenderProfileById('${notif.id}')">
            <div class="hub-type-badge-icon ${contextClass}">
                <i class="fas ${typeIcon}"></i>
            </div>
        </div>
        <div class="hub-message-content-box">
            <p class="hub-message-text">
                <strong class="hub-sender-name-clickable" title="View profile" onclick="event.stopPropagation(); _notifGoToSenderProfileById('${notif.id}')">${notif.sender_user_name}</strong> ${notif.message || 'interacted with your content.'}
            </p>
            <span class="hub-timestamp-label">
                <i class="far fa-clock"></i> ${formatRelativeTime(notif.created_at || notif.timestamp)}
            </span>
            ${mateActions}
        </div>
        ${!notif.is_read ? '<div class="hub-unread-marker-dot"></div>' : ''}
    `;
    return row;
}

/**
 * 🚀 INTERFACE RENDER ENGINE
 */
function renderNotificationsInterface() {
    const container = document.getElementById("notificationsContainer");
    if (!container) return;

    // The unread count now lives on the Unread tab itself instead of a
    // separate "Unread Alerts" card. The nav bell badge is owned entirely by
    // notif-badge.js (shared across every page) — unrelated to this.
    const unreadCount = localNotificationsCache.filter(n => !n.is_read).length;
    const tabCount = document.getElementById('notifUnreadTabCount');
    if (tabCount) {
        tabCount.textContent = unreadCount;
        tabCount.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    }

    // Requests badge counts requests that are STILL actionable (per the
    // mates table, not per is_read) — same "pending_received" source of
    // truth _buildNotificationCard uses, so this number never disagrees
    // with what the Requests tab's own cards show once opened.
    const pendingRequestsCount = localNotificationsCache.filter(n =>
        n.type === 'mate_request' &&
        typeof getMateStatus === 'function' &&
        getMateStatus(n.sender_user_name, n.sender_id) === 'pending_received'
    ).length;
    const requestsTabCount = document.getElementById('notifRequestsTabCount');
    if (requestsTabCount) {
        requestsTabCount.textContent = pendingRequestsCount;
        requestsTabCount.style.display = pendingRequestsCount > 0 ? 'inline-flex' : 'none';
    }

    let filtered = localNotificationsCache;
    if (_notifFilter === 'unread') {
        filtered = localNotificationsCache.filter(n => !n.is_read);
    } else if (_notifFilter === 'requests') {
        filtered = localNotificationsCache.filter(n => n.type === 'mate_request');
    }

    if (filtered.length === 0) {
        const emptyText = _notifFilter === 'unread'
            ? "You're all caught up — no unread notifications."
            : _notifFilter === 'requests'
                ? 'No Realmate requests yet.'
                : 'Your timeline is clean. No notification payloads logged.';
        container.innerHTML = `
            <div class="hub-empty-state-card">
                <i class="fas fa-bell-slash"></i>
                <p>${emptyText}</p>
            </div>`;
        return;
    }

    container.innerHTML = "";
    filtered.forEach(notif => container.appendChild(_buildNotificationCard(notif)));
}

/**
 * 🚀 ACTION TRIPPERS: BULK READ ASSIGNMENT MATRIX
 */
async function markAllNotificationsAsRead() {
    if (localNotificationsCache.length === 0) return;
    
    try {
        const userSettings = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };
        let nameFilter = `recipient_user_name.eq."${user.name}"`;
        if (userSettings.anonName) {
            nameFilter += `,recipient_user_name.eq."${userSettings.anonName}"`;
        }
        const idFilter = user.id ? `recipient_id.eq.${user.id},${nameFilter}` : nameFilter;

        // Optimistically clean user layout memory structures
        localNotificationsCache.forEach(n => n.is_read = true);
        renderNotificationsInterface();

        const { error } = await _notifQueryWithIdFallback(
            (filter) => _supabase.from('notifications').update({ is_read: true }).or(filter).eq('is_read', false),
            idFilter, nameFilter
        );

        if (error) throw error;
        await fetchNotificationsList();
    } catch (err) {
        console.error("Bulk update operations failure:", err);
    }
}

/**
 * 🚀 ACTION TRIPPERS: SINGLE ELEMENT READ TRACKING
 */
async function markSingleNotificationAsRead(id) {
    const { error } = await _supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

    if (error) {
        console.error("[Notif] Mark-read FAILED (check Supabase RLS UPDATE policy):", error.message, error);
        return false;
    }
    return true;
}

// Shared by the row's own mate/follow redirect AND the independently
// clickable avatar/name (see _buildNotificationCard) — one place resolves
// "where is this sender's profile", so both surfaces always land on the
// same account. Prefers sender_id (now backfilled by _resolveLiveSenders
// even for legacy rows) over a fresh name lookup, which is both faster and
// immune to two profiles sharing the same display name.
async function _notifGoToSenderProfile(notif) {
    if (notif.sender_id) {
        location.href = `dashboard.html?user_id=${notif.sender_id}`;
        return;
    }
    try {
        const { data: profiles } = await _supabase
            .from('profiles')
            .select('id')
            .eq('full_name', notif.sender_user_name)
            .limit(1);
        const senderId = profiles?.[0]?.id;
        if (senderId) {
            location.href = `dashboard.html?user_id=${senderId}`;
            return;
        }
        const { data: listings } = await _supabase
            .from('listings')
            .select('user_id')
            .eq('user_name', notif.sender_user_name)
            .limit(1);
        const lid = listings?.[0]?.user_id;
        location.href = lid ? `dashboard.html?user_id=${lid}` : `dashboard.html`;
    } catch { location.href = `dashboard.html`; }
}

function _notifGoToSenderProfileById(id) {
    const notif = localNotificationsCache.find(n => n.id === id);
    if (notif) _notifGoToSenderProfile(notif);
}

/**
 * 🚀 NAVIGATION DEEP LINK PROCESSING FACTORY
 */
async function handleNotificationRowClick(id) {
    const notif = localNotificationsCache.find(n => n.id === id);
    if (!notif) return;

    if (!notif.is_read) {
        notif.is_read = true;
        await markSingleNotificationAsRead(id);
        renderNotificationsInterface();
    }

    let anchorFragmentTarget = "";
    if (notif.target_reply_id) {
        anchorFragmentTarget = `reply-element-${notif.target_reply_id}`;
    } else if (notif.target_comment_id) {
        anchorFragmentTarget = `comment-element-${notif.target_comment_id}`;
    } else if (notif.target_post_id) {
        anchorFragmentTarget = `post-${notif.target_post_id}`;
    }

    // Store both the anchor element ID and the post ID so forum page can open the comment section
    if (anchorFragmentTarget) {
        localStorage.setItem("route_target_anchor_id", anchorFragmentTarget);
    }
    if (notif.target_post_id) {
        localStorage.setItem("route_target_post_id", String(notif.target_post_id));
    }

    // Offer notifications → open chat with the sender
    if (notif.type === 'offer') {
        sessionStorage.setItem('openChatWith', JSON.stringify({ userId: notif.sender_user_id || null, name: notif.sender_user_name }));
        location.href = 'chat.html';
        return;
    }

    // Mate/follow notifications → go to sender's profile
    if (notif.type === 'mate_request' || notif.type === 'mate_accepted' || notif.type === 'mate_declined' || notif.type === 'follow') {
        await _notifGoToSenderProfile(notif);
        return;
    }

    if (notif.target_post_id) {
        try {
            const { data: postRows } = await _supabase
                .from('forum_posts')
                .select('source')
                .eq('id', notif.target_post_id)
                .limit(1);
            const source = postRows?.[0]?.source;
            if (source === 'home') {
                // Override anchor ID for home page comment format
                if (notif.target_comment_id) {
                    localStorage.setItem("route_target_anchor_id", `hf-comment-${notif.target_comment_id}`);
                }
                location.href = 'home.html';
            } else {
                location.href = 'forum.html';
            }
        } catch {
            location.href = 'forum.html';
        }
    } else {
        location.href = 'forum.html';
    }
}

/**
 * 🚀 LIVE STREAM SUBSCRIPTION ARCHITECTURE LISTENER
 */
function setupRealtimeNotificationListener() {
    const userSettings = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };
    
    _supabase
        .channel('public:notifications')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications'
        }, payload => {
            if (payload.new) {
                const targetMatch = (user.id && payload.new.recipient_id === user.id) ||
                                    payload.new.recipient_user_name === user.name ||
                                    (userSettings.anonName && payload.new.recipient_user_name === userSettings.anonName);

                if (targetMatch) {
                    _resolveLiveSenders([payload.new]).finally(() => {
                        localNotificationsCache.unshift(payload.new);
                        renderNotificationsInterface();
                    });
                }
            }
        })
        // When the action behind a notification is reversed, the notification
        // row itself is deleted (an unliked post's like-notification, or a
        // withdrawn Realmate request — see home.js applyReaction and mates.js
        // cancelMateRequest). Drop it from the cache and re-render in real
        // time so it disappears without a refresh, and the tab counts recompute.
        // A DELETE payload's "old" row typically carries only the primary key
        // (id) unless the table's replica identity is FULL — id is all we need
        // to locate and remove the cached row, so no recipient re-check here.
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications'
        }, payload => {
            const removedId = payload.old && payload.old.id;
            if (removedId == null) return;
            const idx = localNotificationsCache.findIndex(n => n.id === removedId);
            if (idx !== -1) {
                localNotificationsCache.splice(idx, 1);
                renderNotificationsInterface();
            }
        })
        .subscribe();
}

async function handleNotifAcceptMate(btn, senderName, notifId) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    // The DB relationship is the source of truth — only advance the UI when the
    // acceptance actually persisted. Previously the result was ignored, so a
    // failed accept (e.g. a request whose ids/names had drifted) still flipped
    // the card to "You are now Realmates!" while the row stayed pending.
    const result = await acceptMateRequest(senderName);
    if (!result || result.error) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Accept';
        console.error('[notif] accept failed:', result && result.error);
        (window.showToast || alert)(`Could not accept request: ${(result && result.error) || 'Unknown error'}`, 'error');
        return;
    }

    await markSingleNotificationAsRead(notifId);
    // Mark in local cache, then do a full re-render — this request now
    // belongs in neither its old spot in the dedicated pending-requests
    // section (it's no longer pending) nor needs manual DOM surgery there;
    // a fresh render recomputes both sections from the updated cache
    // (getMateStatus now reads 'accepted' straight from the mates cache that
    // acceptMateRequest refreshed on success).
    const cached = localNotificationsCache.find(n => n.id === notifId);
    if (cached) cached.is_read = true;
    renderNotificationsInterface();
}

async function handleNotifDeclineMate(btn, senderName, notifId) {
    btn.disabled = true;
    await declineMateRequest(senderName);
    await markSingleNotificationAsRead(notifId);
    const cached = localNotificationsCache.find(n => n.id === notifId);
    if (cached) cached.is_read = true;
    renderNotificationsInterface();
}

/**
 * 🚀 LIFECYCLE INITIALIZER CONSTRUCTOR
 */
window.onload = async () => {
    // Both are independent network round trips; run them together, then
    // render once both have landed. Rendering only off fetchNotificationsList
    // (the old behavior) could paint mate_request cards before mates.js's own
    // DOMContentLoaded-triggered loadMatesCache() had finished — every
    // request looked "declined" for that first paint since getMateStatus()
    // had nothing loaded yet to look up.
    await Promise.all([
        fetchNotificationsList(),
        typeof loadMatesCache === 'function' ? loadMatesCache() : Promise.resolve()
    ]);
    renderNotificationsInterface();
    setupRealtimeNotificationListener();
};