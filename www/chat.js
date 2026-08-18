// =========================================
// CHAT MODULE — Realmate (clean rewrite)
// =========================================

const CHAT_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const CHAT_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _chatSupa = supabase.createClient(CHAT_URL, CHAT_KEY);

const CHAT_READ_HEADERS = { 'apikey': CHAT_KEY, 'Authorization': `Bearer ${CHAT_KEY}` };
const CHAT_WRITE_HEADERS = { 'apikey': CHAT_KEY, 'Authorization': `Bearer ${CHAT_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

// The four Admin-assigned positions are the only valid position values —
// anything else (legacy free text, empty) is treated as no position.
function _chatValidPosition(job) { return ''; }

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when generated, so
// trusting a stored one as-is after a rename shows stale initials forever.
// Regenerate fresh from the current name whenever there's no real upload.
function _chatAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=random&color=fff`;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
const FILE_LIMITS = { 'image': 15728640, 'pdf': 20971520, 'doc': 10485760, 'docx': 10485760, 'xls': 10485760, 'xlsx': 10485760 };

let currentUser = null;
// True when this page load opened straight into a conversation from outside
// chat.html (e.g. the profile page's Message button, a ?user= deep link, or a
// notification) rather than via a click on the in-page conversation list.
// Used by handleChatBack() to decide whether "Back" should leave the Chat
// page entirely (real navigation) or just return to the in-page list.
let _chatOpenedExternally = false;
let activeConversationId = null;
let activeOtherUser = null;
let conversations = [];
let msgTextByConv = {}; // convId -> [{ text, created_at }] of visible TEXT messages, for search
let attachedFile = null;
let typingTimeout = null;
let typingChannel = null;
let messagesChannel = null;
let convChannel = null;
let _showingArchived = false;

// ===== CONVERSATION FLAGS (pin / mute / archive / manual-unread) =====
// `conversations` / `conversation_participants` have no columns for any of
// this (confirmed live: only id, conversation_id, user_id, deleted_at exist
// on conversation_participants) and there's no schema/migration access
// available here, so these are stored client-side in localStorage instead.
// That means they're per-device — they won't follow the same account to a
// different browser or phone — but it's the only persistence available
// without a DB migration. Keyed per-user so a shared browser doesn't leak
// one account's pins/mutes into another's.
function _convFlagKey(kind) { return `chat_${kind}_${currentUser.id}`; }
function _getConvFlagSet(kind) {
    try { return new Set(JSON.parse(localStorage.getItem(_convFlagKey(kind))) || []); }
    catch { return new Set(); }
}
function _setConvFlagSet(kind, set) {
    localStorage.setItem(_convFlagKey(kind), JSON.stringify([...set]));
}
function _toggleConvFlag(kind, convId) {
    const set = _getConvFlagSet(kind);
    const nowOn = !set.has(convId);
    if (nowOn) set.add(convId); else set.delete(convId);
    _setConvFlagSet(kind, set);
    return nowOn;
}
function _clearConvFlag(kind, convId) {
    const set = _getConvFlagSet(kind);
    if (set.delete(convId)) _setConvFlagSet(kind, set);
}

// ===== PRESENCE STATE =====
let presenceChannel = null;
let onlineUsers = {};
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

// ===== REST HELPERS =====
async function chatGet(table, query) {
    try {
        const r = await fetch(`${CHAT_URL}/rest/v1/${table}?${query}`, { headers: CHAT_READ_HEADERS });
        if (!r.ok) return [];
        return await r.json();
    } catch (e) { return []; }
}

async function chatInsert(table, body) {
    try {
        const r = await fetch(`${CHAT_URL}/rest/v1/${table}`, { method: 'POST', headers: CHAT_WRITE_HEADERS, body: JSON.stringify(body) });
        if (!r.ok) return null;
        const t = await r.text();
        if (!t) return null;
        const d = JSON.parse(t);
        return Array.isArray(d) ? d[0] : d;
    } catch (e) { return null; }
}

async function chatUpdate(table, query, body) {
    try {
        const r = await fetch(`${CHAT_URL}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: CHAT_WRITE_HEADERS, body: JSON.stringify(body) });
        if (!r.ok) {
            // Unlike chatGet/chatInsert, this used to swallow non-2xx
            // responses entirely — fetch() only rejects on network
            // failures, never on HTTP error status, so a PostgREST
            // validation error (e.g. a payload referencing a column that
            // doesn't exist yet) silently "succeeded" from every caller's
            // point of view while never actually writing anything.
            console.warn(`[chat] PATCH ${table}?${query} failed:`, r.status, await r.text().catch(() => ''));
            return false;
        }
        return true;
    } catch (e) {
        console.warn(`[chat] PATCH ${table} network error:`, e.message);
        return false;
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await waitForUser();
    if (!currentUser) return;

    setupPresence();
    setupLastSeenEvents();
    setupMobileKeyboard();
    loadChatActiveStatus();

    await loadConversations();
    setupRealtimeConversations();

    const openWith = new URLSearchParams(window.location.search).get('user');
    if (openWith) {
        _chatOpenedExternally = true;
        await openConversationWithUser(openWith);
    } else {
        const openChatWith = sessionStorage.getItem('openChatWith');
        if (openChatWith) {
            try {
                const { userId, name } = JSON.parse(openChatWith);
                sessionStorage.removeItem('openChatWith');
                _chatOpenedExternally = true;
                if (userId) {
                    await openConversationWithUser(userId);
                } else if (name) {
                    // Fallback: find existing conversation by other user's name
                    const byName = conversations.find(c => c.otherUser && c.otherUser.name === name);
                    if (byName) await openConversation(byName.id);
                    else {
                        // Look up user id by name from listings table
                        const res = await fetch(`${CHAT_URL}/rest/v1/listings?select=user_id&user_name=eq.${encodeURIComponent(name)}&limit=1`, { headers: { apikey: CHAT_KEY, Authorization: `Bearer ${CHAT_KEY}` } });
                        const rows = await res.json();
                        if (Array.isArray(rows) && rows[0]?.user_id) await openConversationWithUser(rows[0].user_id);
                    }
                }
            } catch {}
        }
        // No deep-link target (no ?user= param, no openChatWith handoff from
        // a profile/notification) — land on the plain conversation list.
        // This used to also restore whatever conversation was last open via
        // sessionStorage's chat_active_conv, which meant clicking the Chat
        // nav item or its badge silently reopened a thread instead of
        // showing the list, with no way to get back to the list without
        // first opening some conversation and hitting back.
    }
});

function waitForUser() {
    return new Promise(resolve => {
        let n = 0;
        const tick = () => {
            const u = JSON.parse(localStorage.getItem('user'));
            if (u && u.id) resolve(u);
            else if (n++ < 25) setTimeout(tick, 200);
            else resolve(null);
        };
        tick();
    });
}

// ===== PRESENCE (zero DB writes for online status) =====
function setupPresence() {
    presenceChannel = _chatSupa.channel('online-users', {
        config: { presence: { key: currentUser.id } }
    });

    presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        onlineUsers = {};
        Object.keys(state).forEach(userId => { onlineUsers[userId] = true; });
        refreshOnlineUI();
    });

    presenceChannel.on('presence', { event: 'join' }, ({ key }) => {
        onlineUsers[key] = true;
        refreshOnlineUI();
    });

    presenceChannel.on('presence', { event: 'leave' }, ({ key }) => {
        delete onlineUsers[key];
        refreshOnlineUI();
    });

    presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await presenceChannel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
        }
    });
}

function isUserOnline(userId) {
    return !!onlineUsers[userId];
}

function refreshOnlineUI() {
    renderConvList();
    if (activeOtherUser) updateHeaderStatus();
}

// ===== LAST SEEN (write only on disconnect/idle/background) =====
function writeLastSeen() {
    if (!currentUser) return;
    chatUpdate('profiles', `id=eq.${currentUser.id}`, { last_seen: new Date().toISOString() });
}

function setupLastSeenEvents() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            writeLastSeen();
        } else {
            resetInactivityTimer();
            if (presenceChannel) {
                presenceChannel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
            }
        }
    });

    window.addEventListener('beforeunload', writeLastSeen);

    window.addEventListener('pagehide', writeLastSeen);

    ['mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        writeLastSeen();
        if (presenceChannel) presenceChannel.untrack();
    }, INACTIVITY_TIMEOUT);
}

// ===== LOAD CONVERSATIONS =====
async function loadConversations() {
    let myParts = await chatGet('conversation_participants', `select=conversation_id,deleted_at&user_id=eq.${currentUser.id}`);
    if (myParts && myParts.code) {
        myParts = await chatGet('conversation_participants', `select=conversation_id&user_id=eq.${currentUser.id}`);
    }
    if (!myParts.length) { conversations = []; renderConvList(); return; }

    const deletedMap = {};
    myParts.forEach(p => { if (p.deleted_at) deletedMap[p.conversation_id] = p.deleted_at; });

    const ids = myParts.map(p => p.conversation_id);
    const idStr = ids.map(id => `"${id}"`).join(',');

    const [allParts, profiles_raw, msgs, unread] = await Promise.all([
        chatGet('conversation_participants', `select=conversation_id,user_id&conversation_id=in.(${idStr})`),
        (async () => {
            const otherIds = [];
            const tempParts = await chatGet('conversation_participants', `select=conversation_id,user_id&conversation_id=in.(${idStr})`);
            tempParts.forEach(p => { if (p.user_id !== currentUser.id && !otherIds.includes(p.user_id)) otherIds.push(p.user_id); });
            if (!otherIds.length) return [];
            return chatGet('profiles', `select=id,full_name,avatar_url,job_title,last_seen,show_active_status&id=in.(${otherIds.map(i => `"${i}"`).join(',')})`);
        })(),
        chatGet('messages', `select=*&conversation_id=in.(${idStr})&order=created_at.desc`),
        chatGet('messages', `select=conversation_id&conversation_id=in.(${idStr})&sender_id=neq.${currentUser.id}&is_read=eq.false`)
    ]);

    const profileMap = {};
    profiles_raw.forEach(p => profileMap[p.id] = p);

    const unreadMap = {};
    unread.forEach(m => { unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1; });

    const lastMsgMap = {};
    msgs.forEach(m => { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m; });

    // Index visible text messages per conversation so search can match message content.
    msgTextByConv = {};
    msgs.forEach(m => {
        if (m.is_unsent) return;
        if (m.message_type !== 'TEXT') return;
        const text = m.message_text || '';
        if (!text || text.startsWith('__LISTING_REF__')) return;
        const cutoff = deletedMap[m.conversation_id];
        if (cutoff && new Date(m.created_at) <= new Date(cutoff)) return;
        (msgTextByConv[m.conversation_id] = msgTextByConv[m.conversation_id] || []).push({ text, created_at: m.created_at });
    });

    conversations = ids.map(cid => {
        const other = allParts.find(p => p.conversation_id === cid && p.user_id !== currentUser.id);
        const prof = other ? profileMap[other.user_id] : null;
        if (!prof) return null;

        const lm = lastMsgMap[cid] || null;
        const deletedAt = deletedMap[cid];
        if (deletedAt && (!lm || new Date(lm.created_at) <= new Date(deletedAt))) return null;

        return {
            id: cid,
            otherUser: {
                id: prof.id,
                name: prof.full_name || 'Unknown',
                image: _chatAvatarFor(prof.full_name, prof.avatar_url),
                job: _chatValidPosition(prof.job_title),
                last_seen: prof.last_seen,
                show_active_status: prof.show_active_status !== false
            },
            lastMessage: lm,
            unreadCount: unreadMap[cid] || 0
        };
    }).filter(Boolean);

    conversations.sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return tb - ta;
    });

    renderConvList();
}

// ===== RENDER CONVERSATION LIST =====
// Builds one conversation row's markup — the swipe-actions panel underneath
// plus the visible item on top. Shared by the full-list render below and by
// _updateConvRow's single-row surgical update, so both stay in sync by
// construction instead of two copies of the same template drifting apart.
function _convRowHtml(c, matchMsg, lf) {
    const pinned = _getConvFlagSet('pinned');
    const muted = _getConvFlagSet('muted');
    const archived = _getConvFlagSet('archived');
    const manualUnread = _getConvFlagSet('manualUnread');

    const isMuted = muted.has(c.id);
    const isPinned = pinned.has(c.id);
    const isArchived = archived.has(c.id);
    // Muting suppresses the unread treatment entirely (no bold, no badge, no
    // dot) even if there are genuinely unread messages underneath.
    const isUnread = !isMuted && (c.unreadCount > 0 || manualUnread.has(c.id));

    const active = c.id === activeConversationId ? ' active' : '';
    const unreadCls = isUnread ? ' unread' : '';
    const online = (c.otherUser.show_active_status && isUserOnline(c.otherUser.id)) ? '<div class="online-dot"></div>' : '';
    const lm = c.lastMessage;
    let preview = '';
    let previewCls = 'chat-conv-last';
    if (matchMsg) {
        preview = matchSnippet(matchMsg.text, lf);
        previewCls += ' chat-conv-match';
    } else if (lm) {
        if (lm.is_unsent) {
            preview = lm.sender_id === currentUser.id ? 'You unsent a message' : 'Message unsent';
        } else {
            preview = lm.sender_id === currentUser.id ? 'You: ' : '';
            preview += lm.message_type === 'TEXT' ? (lm.message_text || '') : `📎 ${lm.file_name || lm.message_type}`;
        }
    }
    const time = lm ? fmtConvTime(lm.created_at) : '';
    const badge = (isUnread && c.unreadCount > 0) ? `<span class="chat-unread-badge">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : (isUnread ? '<span class="chat-unread-badge">•</span>' : '');
    const pinIcon = isPinned ? '<i class="fas fa-thumbtack chat-conv-pin-icon"></i>' : '';
    const muteIcon = isMuted ? '<i class="fas fa-bell-slash chat-conv-mute-icon"></i>' : '';
    const name = esc(c.otherUser.name);

    return `<div class="chat-conv-row" data-conv-id="${c.id}" role="listitem">
        <!-- Short swipe/drag reveal: a single ••• button opening the
             chat-conv-more-menu contextual menu below. Identical on desktop
             (mouse drag) and mobile (finger swipe) — same panel, same
             threshold, same menu; only the input method differs. -->
        <div class="chat-conv-swipe-reveal" aria-hidden="true">
            <button type="button" class="chat-conv-swipe-more-btn" data-conv-action="more-menu" tabindex="-1" aria-label="Conversation actions"><i class="fas fa-ellipsis-h"></i></button>
        </div>
        <div class="chat-conv-item${active}${unreadCls}" data-conv-id="${c.id}" tabindex="0" role="button" aria-label="Conversation with ${name}${isUnread ? ', unread' : ''}">
            <div class="chat-conv-avatar chat-clickable-avatar" data-conv-action="profile" title="View Profile"><img src="${c.otherUser.image}" alt="">${online}</div>
            <div class="chat-conv-info">
                <div class="chat-conv-name">${pinIcon}${muteIcon}${name}</div>
                <div class="${previewCls}">${esc(preview.length > 44 ? preview.slice(0, 44) + '…' : preview)}</div>
            </div>
            <div class="chat-conv-meta">
                <span class="chat-conv-time">${time}</span>
                ${badge}
            </div>
            <button type="button" class="chat-conv-kbd-trigger" data-conv-action="kbd-menu" aria-label="Conversation actions"><i class="fas fa-ellipsis"></i></button>
        </div>
    </div>`;
}

function renderConvList(filter) {
    const list = document.getElementById('chatConvList');
    const lf = (filter || '').toLowerCase().trim();
    const pinned = _getConvFlagSet('pinned');
    const archived = _getConvFlagSet('archived');

    // Archived view shows ONLY archived chats; the normal view hides them.
    const base = conversations.filter(c => _showingArchived ? archived.has(c.id) : !archived.has(c.id));

    // When searching, match on the person's name OR on any message content in the
    // conversation. If a message matched (but the name didn't), surface that message
    // as the preview so the user sees why the chat came up.
    let items = base;
    if (lf) {
        items = [];
        base.forEach(c => {
            const nameHit = c.otherUser.name.toLowerCase().includes(lf);
            let msgHit = null;
            const msgs = msgTextByConv[c.id] || [];
            for (const m of msgs) {
                if (m.text.toLowerCase().includes(lf)) { msgHit = m; break; }
            }
            if (nameHit || msgHit) items.push({ conv: c, matchMsg: (!nameHit && msgHit) ? msgHit : null });
        });
    } else {
        items = base.map(c => ({ conv: c, matchMsg: null }));
    }

    // Pinned conversations always float to the top, above unpinned ones;
    // recency order (from loadConversations' sort) is preserved within each group.
    items = [...items].sort((a, b) => (pinned.has(b.conv.id) ? 1 : 0) - (pinned.has(a.conv.id) ? 1 : 0));

    _openSwipeConvId = null; // the DOM is being fully rebuilt — nothing can stay "open"

    if (!items.length) {
        list.innerHTML = lf
            ? `<div class="chat-conv-empty"><i class="fas fa-search" style="font-size:28px;color:var(--chat-border);margin-bottom:8px;display:block;"></i>No results</div>`
            : _showingArchived
                ? `<div class="chat-conv-empty"><i class="fas fa-box-archive" style="font-size:32px;color:var(--chat-border);margin-bottom:8px;display:block;"></i>No archived chats</div>`
                : `<div class="chat-conv-empty"><i class="fas fa-comments" style="font-size:32px;color:var(--chat-border);margin-bottom:8px;display:block;"></i>No conversations yet</div>`;
        return;
    }

    list.innerHTML = items.map(({ conv: c, matchMsg }) => _convRowHtml(c, matchMsg, lf)).join('');
}

// Surgical single-row update — used after pin/mute/mark-unread so the rest
// of the (possibly long) conversation list never has to be re-parsed from
// HTML just because one row's icon or badge changed. Pin is the one flag
// that can also change ORDER; _resortConvRows handles that by moving the
// already-rendered DOM nodes (cheap — no HTML regeneration for any other
// row) rather than re-rendering the whole list.
function _updateConvRow(convId) {
    const conv = conversations.find(c => c.id === convId);
    const oldRow = document.querySelector(`.chat-conv-row[data-conv-id="${convId}"]`);
    if (!conv || !oldRow) return;

    const lf = (document.getElementById('chatConvSearch')?.value || '').toLowerCase().trim();
    let matchMsg = null;
    if (lf && !conv.otherUser.name.toLowerCase().includes(lf)) {
        const msgs = msgTextByConv[conv.id] || [];
        matchMsg = msgs.find(m => m.text.toLowerCase().includes(lf)) || null;
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = _convRowHtml(conv, matchMsg, lf);
    oldRow.replaceWith(tmp.firstElementChild);
    _resortConvRows();
}

function _resortConvRows() {
    const list = document.getElementById('chatConvList');
    const pinned = _getConvFlagSet('pinned');
    const rows = [...list.children].filter(el => el.classList.contains('chat-conv-row'));
    if (!rows.length) return;
    // Array.prototype.sort is stable (guaranteed since ES2019), so rows with
    // equal pinned-status keep their existing relative order.
    const sorted = [...rows].sort((a, b) => (pinned.has(b.dataset.convId) ? 1 : 0) - (pinned.has(a.dataset.convId) ? 1 : 0));
    sorted.forEach(el => list.appendChild(el)); // re-appending an already-attached node MOVES it, doesn't duplicate
}

// Return a snippet of text centered on the search hit, prefixed with a chat glyph.
function matchSnippet(text, q) {
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return '💬 ' + text;
    const start = Math.max(0, idx - 12);
    const prefix = start > 0 ? '…' : '';
    return '💬 ' + prefix + text.slice(start);
}

function searchConversations(v) {
    document.getElementById('chatConvSearchClear').style.display = v ? 'block' : 'none';
    renderConvList(v);
}
function clearConvSearch() {
    document.getElementById('chatConvSearch').value = '';
    document.getElementById('chatConvSearchClear').style.display = 'none';
    renderConvList();
}

// ===== OPEN CONVERSATION =====
async function openConversation(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    _closeSwipePanel();
    unsubMessages();

    // Clear typing indicator from previous conversation
    clearTimeout(typingTimeout);
    const typingEl = document.getElementById('chatTypingIndicator');
    if (typingEl) { typingEl.classList.remove('active'); typingEl.innerHTML = ''; }

    activeConversationId = convId;
    activeOtherUser = conv.otherUser;
    _clearConvFlag('manualUnread', convId); // opening it always clears a manual "mark as unread"

    document.getElementById('chatEmptyState').style.display = 'none';
    document.getElementById('chatActiveConv').style.display = 'flex';
    document.getElementById('chatHeaderAvatar').src = activeOtherUser.image;
    document.getElementById('chatHeaderName').textContent = activeOtherUser.name;
    updateHeaderStatus();

    if (window.innerWidth <= 768) {
        document.getElementById('chatSidebar').classList.add('hidden');
        document.getElementById('chatMain').classList.add('active');
    }

    renderConvList();

    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    const msgs = await chatGet('messages', `select=*&conversation_id=eq.${convId}&order=created_at.asc`);

    if (activeConversationId !== convId) return;

    if (!msgs.length) {
        container.insertAdjacentHTML('beforeend', '<div style="text-align:center;padding:40px;color:var(--chat-sub);font-size:13px;">No messages yet. Say hello! 👋</div>');
    } else {
        let lastDate = '';
        msgs.forEach(m => {
            const d = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            if (d !== lastDate) { lastDate = d; addDateSep(container, d); }
            addMsgBubble(container, m);
        });
        container.scrollTop = container.scrollHeight;
    }

    markRead(convId);
    subscribeMessages(convId);
    subscribeTyping(convId);
}

async function openConversationWithUser(userId) {
    const existing = conversations.find(c => c.otherUser && c.otherUser.id === userId);
    if (existing) { await openConversation(existing.id); return; }
    await startConversation(userId);
}

function backToConvList() {
    unsubMessages();
    activeConversationId = null;
    activeOtherUser = null;
    document.getElementById('chatSidebar').classList.remove('hidden');
    document.getElementById('chatMain').classList.remove('active');
    document.getElementById('chatActiveConv').style.display = 'none';
    document.getElementById('chatEmptyState').style.display = 'flex';
    document.getElementById('chatMessages').innerHTML = '';
    renderConvList();
}

// Header back arrow (mobile). If this conversation was opened directly from
// outside Chat (e.g. a profile's Message button), a real previous page
// exists in browser history, so Back should leave Chat and return there —
// matching native app behavior. Otherwise (opened by tapping a conversation
// in the in-page list), Back just returns to that list. If there's no real
// history to go back to, fall back to the conversation list rather than a
// hardcoded page.
function handleChatBack() {
    if (_chatOpenedExternally && window.history.length > 1) {
        window.history.back();
    } else {
        backToConvList();
    }
}

function updateHeaderStatus() {
    const el = document.getElementById('chatHeaderStatus');
    if (!activeOtherUser) return;

    if (!activeOtherUser.show_active_status) {
        el.textContent = '';
        return;
    }

    if (isUserOnline(activeOtherUser.id)) {
        el.innerHTML = '<span class="status-online">● Online</span>';
    } else if (activeOtherUser.last_seen) {
        el.textContent = `Last seen ${fmtLastSeen(activeOtherUser.last_seen)}`;
    } else {
        el.textContent = 'Offline';
    }
}

// ===== DOM HELPERS =====
function addDateSep(container, text) {
    const div = document.createElement('div');
    div.className = 'chat-date-sep';
    div.innerHTML = `<span>${text}</span>`;
    container.appendChild(div);
}

function renderListingRefCard(container, ref) {
    const { extractLocations } = window;
    const locs = typeof extractLocations === 'function' ? extractLocations(ref.content || '') : [];
    const locText = locs.length ? locs.join(', ') : '';
    const priceMatch = (ref.content || '').match(/(\d+\.?\d*)\s*[Mm](?:illion)?/);
    const price = priceMatch ? `₱${parseFloat(priceMatch[1])}M` : '';

    const catColors = {
        'FOR SALE': '#16a34a', 'FOR RENT': '#2563eb', 'FOR LEASE': '#7c3aed',
        'WILLING TO BUY': '#b45309', 'WILLING TO RENT': '#0e7490', 'WILLING TO LEASE': '#be185d'
    };
    const catColor = catColors[ref.category] || '#64748b';

    const card = document.createElement('div');
    card.className = 'chat-listing-ref';
    card.innerHTML = `
        <div class="clr-label"><i class="fas fa-handshake"></i> Offer Reference</div>
        <div class="clr-body">
            ${ref.img ? `<img class="clr-img" src="${ref.img}" onerror="this.style.display='none'">` : ''}
            <div class="clr-info">
                ${ref.category ? `<span class="clr-cat" style="color:${catColor};border-color:${catColor}20;background:${catColor}10">${ref.category}</span>` : ''}
                ${locText ? `<div class="clr-loc"><i class="fas fa-map-marker-alt"></i>${locText}</div>` : ''}
                ${price    ? `<div class="clr-price">${price}</div>` : ''}
            </div>
        </div>
        <a class="clr-view-btn" href="listing-detail.html?id=${ref.id}" onclick="event.stopPropagation()">
            View Listing <i class="fas fa-arrow-right"></i>
        </a>
    `;
    container.appendChild(card);
}

function addMsgBubble(container, m) {
    const isOwn = m.sender_id === currentUser.id;
    const side = isOwn ? 'own' : 'other';

    const dt = new Date(m.created_at);
    const now = new Date();
    const isToday = dt.toDateString() === now.toDateString();
    const isYesterday = new Date(now - 86400000).toDateString() === dt.toDateString();
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    let fullTimestamp;
    if (isToday) fullTimestamp = `Today at ${timeStr}`;
    else if (isYesterday) fullTimestamp = `Yesterday at ${timeStr}`;
    else fullTimestamp = `${dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • ${timeStr}`;

    // Unsent message
    if (m.is_unsent) {
        const label = isOwn ? 'You unsent a message' : 'This message was unsent';
        const html = `<div class="chat-msg-row ${side}" data-msg-id="${m.id}" onclick="toggleMsgTimestamp(this)"><div class="chat-msg-tap-ts">${fullTimestamp}</div><div><div class="chat-msg-unsent"><i class="fas fa-ban" style="margin-right:4px;font-size:11px;"></i>${label}</div></div></div>`;
        container.insertAdjacentHTML('beforeend', html);
        return;
    }

    let receipt = '';
    if (isOwn) {
        // Get HH:MM of this message
        const msgMinute = new Date(m.created_at).toISOString().slice(0, 16);
        // Hide receipts on previous own messages sharing the same minute
        container.querySelectorAll('.chat-msg-row.own').forEach(row => {
            const prev = row.querySelector('.chat-msg-receipt');
            if (prev && row.dataset.msgMinute === msgMinute) prev.style.display = 'none';
        });
        receipt = m.is_read
            ? '<span class="chat-msg-receipt"><span class="seen">✓✓</span></span>'
            : '<span class="chat-msg-receipt"><span class="delivered">✓✓</span></span>';
    }

    let bubble = '';
    const type = (m.message_type || 'TEXT').toUpperCase();
    if (type === 'LISTING_REF' || (type === 'TEXT' && (m.message_text || '').startsWith('__LISTING_REF__'))) {
        try {
            const rawText = (m.message_text || '').replace('__LISTING_REF__', '');
            const ref = JSON.parse(rawText || '{}');
            const priceMatch = (ref.content || '').match(/(\d+\.?\d*)\s*[Mm](?:illion)?/);
            const price = priceMatch ? `₱${parseFloat(priceMatch[1])}M` : '';
            const catColors = { 'FOR SALE': '#16a34a', 'FOR RENT': '#2563eb', 'PRE-SELLING': '#d97706', 'RESALE': '#7c3aed' };
            const catColor = catColors[ref.category] || '#64748b';
            const imgHtml = ref.img ? `<img class="clr-img" src="${ref.img}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : '';
            const catHtml = ref.category ? `<span class="clr-cat" style="background:${catColor}15;color:${catColor};font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;">${ref.category}</span>` : '';
            const priceHtml = price ? `<div class="clr-price" style="font-size:13px;font-weight:800;color:#0f172a;margin-top:4px;">${price}</div>` : '';
            bubble = `<div class="chat-listing-ref" style="cursor:default;"><div class="clr-label"><i class="fas fa-handshake"></i> Offer Reference</div><div class="clr-body" style="display:flex;gap:10px;align-items:flex-start;">${imgHtml}<div class="clr-info">${catHtml}${priceHtml}</div></div><a class="clr-view-btn" href="listing-detail.html?id=${ref.id}" onclick="event.stopPropagation();" style="display:block;margin-top:10px;text-align:center;padding:8px;background:#0f172a;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">View Listing</a></div>`;
        } catch { bubble = `<div class="chat-msg-bubble">📋 Offer Reference</div>`; }
        const html = `<div class="chat-msg-row ${side}" data-msg-id="${m.id}">${bubble}</div>`;
        container.insertAdjacentHTML('beforeend', html);
        return;
    } else if (type === 'TEXT') {
        bubble = `<div class="chat-msg-bubble">${esc(m.message_text || '')}</div>`;
    } else if (type === 'IMAGE') {
        bubble = `<div class="chat-msg-bubble chat-msg-image-bubble"><img class="chat-msg-image" src="${m.file_url}" alt="Image" onclick="event.stopPropagation();toggleMsgTimestamp(this.closest('.chat-msg-row'));openLightbox('${m.file_url}')" loading="lazy"></div>`;
    } else if (type === 'PDF') {
        bubble = fileBubble(m, '📄', true);
    } else if (type === 'DOC' || type === 'DOCX') {
        bubble = fileBubble(m, '📝', false);
    } else if (type === 'XLS' || type === 'XLSX') {
        bubble = fileBubble(m, '📊', false);
    }

    const ctxAttr = `oncontextmenu="event.preventDefault();showCtxMenu(event,this)" data-msg-text="${esc(m.message_text || '')}" data-msg-type="${type}" data-msg-sender="${m.sender_id}"`;

    const msgMinuteAttr = isOwn ? `data-msg-minute="${new Date(m.created_at).toISOString().slice(0,16)}"` : '';
    const html = `<div class="chat-msg-row ${side}" data-msg-id="${m.id}" ${msgMinuteAttr} onclick="toggleMsgTimestamp(this)" ${ctxAttr}><div class="chat-msg-tap-ts">${fullTimestamp}</div><div>${bubble}<div class="chat-msg-meta" style="justify-content:${isOwn ? 'flex-end' : 'flex-start'}">${receipt}</div></div></div>`;

    container.insertAdjacentHTML('beforeend', html);
}

function fileBubble(m, icon, preview) {
    const sz = fmtSize(m.file_size || 0);
    const url = m.file_url || '';
    const name = m.file_name || 'File';
    const prevBtn = preview ? `<button onclick="window.open('${url}','_blank')">Preview</button>` : '';
    return `<div class="chat-msg-bubble"><div class="chat-msg-file"><span class="chat-msg-file-icon">${icon}</span><div class="chat-msg-file-info"><div class="chat-msg-file-name">${esc(name)}</div><div class="chat-msg-file-size">${sz}</div><div class="chat-msg-file-actions">${prevBtn}<button onclick="downloadFile('${url}','${esc(name)}')">Download</button></div></div></div></div>`;
}

// ===== SEND MESSAGE =====
async function sendMessage() {
    const input = document.getElementById('chatComposerInput');
    const text = input.value.trim();
    const convId = activeConversationId;
    if (!convId || (!text && !attachedFile)) return;

    const btn = document.getElementById('chatSendBtn');
    btn.disabled = true;
    input.value = '';
    autoResizeComposer(input);

    try {
        if (attachedFile) {
            await doSendFile(attachedFile, convId);
            removeAttachedFile();
        }
        if (text) {
            await doSendText(text, convId);
        }
        chatUpdate('conversations', `id=eq.${convId}`, { updated_at: new Date().toISOString() });
    } catch (e) {
        console.error('Send error:', e);
    }

    btn.disabled = false;
    updateSendButton();
    input.focus();
}

async function doSendText(text, convId) {
    const msg = await chatInsert('messages', {
        conversation_id: convId,
        sender_id: currentUser.id,
        message_type: 'TEXT',
        message_text: text,
        is_read: false
    });
    if (msg && activeConversationId === convId) {
        const container = document.getElementById('chatMessages');
        if (container.querySelector('div[style*="text-align"]')) container.innerHTML = '';
        const d = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const lastSep = container.querySelectorAll('.chat-date-sep');
        const lastD = lastSep.length ? lastSep[lastSep.length - 1].textContent.trim() : '';
        if (d !== lastD) addDateSep(container, d);
        addMsgBubble(container, msg);
        container.scrollTop = container.scrollHeight;
    }
    const conv = conversations.find(c => c.id === convId);
    if (conv && msg) { conv.lastMessage = msg; sortAndRenderConvs(); }
}

async function doSendFile(file, convId) {
    const ext = file.name.split('.').pop().toLowerCase();
    let messageType = ext.toUpperCase();
    let fileToUpload = file;

    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
        messageType = 'IMAGE';
        fileToUpload = await compressImage(file, { maxPx: 1200, quality: 0.82 });
    }

    const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const fpath = `chat/${convId}/${fname}`;

    const upRes = await fetch(`${CHAT_URL}/storage/v1/object/chat-files/${fpath}`, {
        method: 'POST',
        headers: { 'apikey': CHAT_KEY, 'Authorization': `Bearer ${CHAT_KEY}`, 'Content-Type': file.type || 'application/octet-stream' },
        body: fileToUpload
    });
    if (!upRes.ok) throw new Error('Upload failed');

    const fileUrl = `${CHAT_URL}/storage/v1/object/public/chat-files/${fpath}`;
    const msg = await chatInsert('messages', {
        conversation_id: convId,
        sender_id: currentUser.id,
        message_type: messageType,
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        is_read: false
    });

    if (msg && activeConversationId === convId) {
        const container = document.getElementById('chatMessages');
        if (container.querySelector('div[style*="text-align"]')) container.innerHTML = '';
        if (!container.querySelector(`[data-msg-id="${msg.id}"]`)) {
            addMsgBubble(container, msg);
            container.scrollTop = container.scrollHeight;
        }
    }
    const conv = conversations.find(c => c.id === convId);
    if (conv && msg) { conv.lastMessage = msg; sortAndRenderConvs(); }
}

function sortAndRenderConvs() {
    conversations.sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return tb - ta;
    });
    // A new message arriving (possibly for a totally unrelated conversation)
    // rebuilds the whole list, which would otherwise silently snap shut
    // whatever swipe panel the user currently has open — carry that state
    // across the rebuild instead of dropping it.
    const reopenId = _openSwipeConvId;
    renderConvList(document.getElementById('chatConvSearch')?.value);
    if (reopenId && conversations.some(c => c.id === reopenId)) _openSwipePanel(reopenId);
}

// ===== FILE HANDLING =====
function handleFileAttach(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isDoc = ALLOWED_DOC_EXTENSIONS.includes(ext);
    if (!isImage && !isDoc) { showToast('Unsupported file type.', 'error'); return; }
    const max = isImage ? FILE_LIMITS['image'] : (FILE_LIMITS[ext] || 10485760);
    if (file.size > max) { showToast(`File too large. Maximum: ${fmtSize(max)}`, 'error'); return; }
    attachedFile = file;
    document.getElementById('chatFilePreviewName').textContent = `${file.name} (${fmtSize(file.size)})`;
    document.getElementById('chatFilePreview').classList.add('active');
    updateSendButton();
}

function removeAttachedFile() {
    attachedFile = null;
    document.getElementById('chatFilePreview').classList.remove('active');
    updateSendButton();
}

function downloadFile(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
}

// ===== COMPOSER =====
function handleComposerKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResizeComposer(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; updateSendButton(); }
function updateSendButton() {
    const inp = document.getElementById('chatComposerInput');
    document.getElementById('chatSendBtn').disabled = !inp.value.trim() && !attachedFile;
}

// ===== TYPING =====
function handleTyping() {
    if (!activeConversationId || !typingChannel) return;
    typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: currentUser.id, name: currentUser.name } });
}

function subscribeTyping(convId) {
    typingChannel = _chatSupa.channel(`typing:${convId}`);
    typingChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === currentUser.id || activeConversationId !== convId) return;
        const el = document.getElementById('chatTypingIndicator');
        el.innerHTML = `${esc(payload.name)} is typing<span class="typing-dots"><span></span><span></span><span></span></span>`;
        el.classList.add('active');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => el.classList.remove('active'), 3000);
    }).subscribe();
}

// ===== READ RECEIPTS =====
async function markRead(convId) {
    const filter = `conversation_id=eq.${convId}&sender_id=neq.${currentUser.id}&is_read=eq.false`;
    const ok = await chatUpdate('messages', filter, { is_read: true, read_at: new Date().toISOString() });
    if (!ok) {
        // read_at's migration is a manual step (chat-unread-read-at-
        // migration.sql) that may not have been run on this database yet.
        // Retry with just is_read so a missing read_at column can never
        // take the actual "message was read" write down with it — this
        // was the read-status-doesn't-persist bug: the combined update
        // failed outright, silently, every time, leaving is_read=false in
        // the database no matter what the UI showed, so the badge/count
        // reverted the moment anything re-fetched from the source of truth.
        await chatUpdate('messages', filter, { is_read: true });
    }
    const conv = conversations.find(c => c.id === convId);
    if (conv) { conv.unreadCount = 0; renderConvList(); }
}

// ===== REALTIME =====
function subscribeMessages(convId) {
    messagesChannel = _chatSupa.channel(`msgs:${convId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
            (payload) => {
                if (activeConversationId !== convId) return;
                const m = payload.new;
                if (document.querySelector(`[data-msg-id="${m.id}"]`)) return;
                const container = document.getElementById('chatMessages');
                if (container.querySelector('div[style*="text-align"]')) container.innerHTML = '';
                addMsgBubble(container, m);
                container.scrollTop = container.scrollHeight;
                if (m.sender_id !== currentUser.id) markRead(convId);
                const conv = conversations.find(c => c.id === convId);
                if (conv) { conv.lastMessage = m; sortAndRenderConvs(); }
            })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
            (payload) => {
                const m = payload.new;
                if (m.is_unsent) {
                    const row = document.querySelector(`[data-msg-id="${m.id}"]`);
                    if (row) {
                        const isOwn = m.sender_id === currentUser.id;
                        const label = isOwn ? 'You unsent a message' : 'This message was unsent';
                        const inner = row.querySelector('div:nth-child(2)');
                        if (inner) inner.innerHTML = `<div class="chat-msg-unsent"><i class="fas fa-ban" style="margin-right:4px;font-size:11px;"></i>${label}</div>`;
                        row.removeAttribute('oncontextmenu');
                    }
                    const conv = conversations.find(c => c.id === convId);
                    if (conv) { conv.lastMessage = m; sortAndRenderConvs(); }
                    return;
                }
                if (m.sender_id === currentUser.id && m.is_read) {
                    const el = document.querySelector(`[data-msg-id="${m.id}"] .chat-msg-receipt`);
                    if (el) el.innerHTML = '<span class="seen">✓✓</span>';
                }
            })
        .subscribe();
}

function unsubMessages() {
    if (messagesChannel) { _chatSupa.removeChannel(messagesChannel); messagesChannel = null; }
    if (typingChannel) { _chatSupa.removeChannel(typingChannel); typingChannel = null; }
}

function setupRealtimeConversations() {
    convChannel = _chatSupa.channel('conv-list')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${currentUser.id}` },
            () => loadConversations())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                const m = payload.new;
                if (m.sender_id === currentUser.id) return;
                if (m.conversation_id === activeConversationId) return;
                const conv = conversations.find(c => c.id === m.conversation_id);
                if (conv) {
                    conv.unreadCount = (conv.unreadCount || 0) + 1;
                    conv.lastMessage = m;
                    sortAndRenderConvs();
                }
            })
        // Cross-device sync: if messages get marked read elsewhere (another
        // tab/device, or this same conversation open there), that write's
        // UPDATE event reaches every subscribed client. Each row flipping
        // is_read fires its own event, so decrementing by 1 per event
        // (rather than re-fetching a fresh count) stays accurate even for
        // a bulk "mark all read" affecting many rows at once.
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
            (payload) => {
                const m = payload.new;
                if (m.sender_id === currentUser.id) return;
                if (!m.is_read) return;
                if (m.conversation_id === activeConversationId) return;
                const conv = conversations.find(c => c.id === m.conversation_id);
                if (conv && conv.unreadCount > 0) {
                    conv.unreadCount -= 1;
                    renderConvList();
                }
            })
        .subscribe();
}

// ===== NEW CHAT =====
function openNewChatModal() {
    document.getElementById('chatNewModal').classList.add('active');
    document.getElementById('chatNewModalSearch').value = '';
    document.getElementById('chatNewModalSearch').focus();
    loadAllUsers();
}

function closeNewChatModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('chatNewModal').classList.remove('active');
}

async function loadAllUsers(filter) {
    const list = document.getElementById('chatNewModalList');
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--chat-sub);"><i class="fas fa-spinner fa-spin"></i></div>';
    let q = `select=id,full_name,avatar_url,job_title&id=neq.${currentUser.id}&limit=50`;
    if (filter) q += `&full_name=ilike.*${encodeURIComponent(filter)}*`;
    const users = await chatGet('profiles', q);
    if (!users.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--chat-sub);font-size:13px;">No users found</div>'; return; }
    list.innerHTML = users.map(u => `
        <div class="chat-new-modal-user" onclick="startConversation('${u.id}')">
            <img src="${_chatAvatarFor(u.full_name, u.avatar_url)}" alt="">
            <div class="chat-new-modal-user-info"><h4>${esc(u.full_name || 'Unknown')}</h4></div>
        </div>`).join('');
}

function searchNewChatUsers(v) {
    clearTimeout(searchNewChatUsers._t);
    searchNewChatUsers._t = setTimeout(() => loadAllUsers(v), 300);
}

async function startConversation(userId) {
    const existing = conversations.find(c => c.otherUser && c.otherUser.id === userId);
    if (existing) { closeNewChatModal(); await openConversation(existing.id); return; }

    const conv = await chatInsert('conversations', { created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!conv) { showToast('Failed to create conversation. Please try again.', 'error'); return; }

    await chatInsert('conversation_participants', { conversation_id: conv.id, user_id: currentUser.id });
    await chatInsert('conversation_participants', { conversation_id: conv.id, user_id: userId });

    closeNewChatModal();
    await loadConversations();
    await openConversation(conv.id);
}

// ===== MESSAGE SEARCH =====
function toggleMsgSearch() {
    const bar = document.getElementById('chatMsgSearchBar');
    bar.classList.toggle('active');
    if (bar.classList.contains('active')) {
        document.getElementById('chatMsgSearchInput').value = '';
        document.getElementById('chatMsgSearchInput').focus();
    } else if (activeConversationId) {
        openConversation(activeConversationId);
    }
}

async function searchMessages(val) {
    if (!val || val.length < 2 || !activeConversationId) return;
    clearTimeout(searchMessages._t);
    searchMessages._t = setTimeout(async () => {
        const msgs = await chatGet('messages', `select=*&conversation_id=eq.${activeConversationId}&message_text=ilike.*${encodeURIComponent(val)}*&order=created_at.asc`);
        const container = document.getElementById('chatMessages');
        if (!msgs.length) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--chat-sub);font-size:13px;">No messages found</div>'; return; }
        container.innerHTML = '';
        msgs.forEach(m => addMsgBubble(container, m));
        container.querySelectorAll('.chat-msg-bubble').forEach(b => {
            if (b.querySelector('.chat-msg-file')) return;
            b.innerHTML = b.innerHTML.replace(new RegExp(`(${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="chat-search-highlight">$1</span>');
        });
    }, 300);
}

// ===== LIGHTBOX =====
function openLightbox(url) { document.getElementById('chatLightboxImg').src = url; document.getElementById('chatLightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('chatLightbox').classList.remove('active'); document.getElementById('chatLightboxImg').src = ''; }
async function downloadLightboxImage() {
    const url = document.getElementById('chatLightboxImg').src;
    if (!url) return;
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'image_' + Date.now() + '.' + (blob.type.split('/')[1] || 'jpg');
        a.click();
        URL.revokeObjectURL(a.href);
    } catch { window.open(url, '_blank'); }
}

// ===== UTILS =====
function fmtLastSeen(ls) {
    if (!ls) return 'a while ago';
    const s = Math.floor((Date.now() - new Date(ls).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min${Math.floor(s / 60) > 1 ? 's' : ''} ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr${Math.floor(s / 3600) > 1 ? 's' : ''} ago`;
    if (s < 172800) return 'yesterday';
    return new Date(ls).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtConvTime(ts) {
    const d = new Date(ts), now = new Date(), diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ===== CONTEXT MENU (long press / right click) =====
let ctxTargetRow = null;
let longPressTimer = null;

// Shared viewport-clamped positioning for any fixed-position ctx menu —
// keeps it fully on-screen regardless of where the row/button that opened
// it happens to sit.
function _positionCtxMenu(menu, x, y) {
    menu.classList.add('open');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
    if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function showCtxMenu(e, row) {
    e.preventDefault();
    e.stopPropagation();
    _closeSwipePanel(); // only one context menu/panel open at a time
    ctxTargetRow = row;

    const menu = document.getElementById('chatCtxMenu');
    const msgType = row.getAttribute('data-msg-type');
    const senderId = row.getAttribute('data-msg-sender');

    document.getElementById('ctxCopy').style.display = (msgType === 'TEXT') ? 'flex' : 'none';
    document.getElementById('ctxUnsend').style.display = (senderId === currentUser.id) ? 'flex' : 'none';

    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    _positionCtxMenu(menu, x, y);
}

function hideCtxMenu() {
    document.getElementById('chatCtxMenu').classList.remove('open');
    ctxTargetRow = null;
}

// ===== TOAST NOTIFICATIONS =====
// Single source of truth for every success/error message in this module —
// nothing in chat.js calls alert()/confirm()/prompt() anywhere.
let _toastTimer = null;
function showToast(message, type) {
    const container = document.getElementById('chatToastContainer');
    if (!container) return;
    // Only one toast at a time: a new one replaces whatever's showing
    // instead of stacking up indefinitely.
    const existing = container.querySelector('.chat-toast');
    if (existing) existing.remove();
    clearTimeout(_toastTimer);

    const toast = document.createElement('div');
    toast.className = `chat-toast chat-toast-${type === 'error' ? 'error' : 'success'}`;
    const icon = document.createElement('i');
    icon.className = `fas ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`;
    const span = document.createElement('span');
    span.textContent = message; // textContent, never innerHTML — no interpolated markup
    toast.append(icon, span);
    container.appendChild(toast);

    _toastTimer = setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

// ===== CONVERSATION SWIPE-TO-REVEAL ACTIONS =====
// One conversation may have its actions panel open at a time; everything
// else (closing on outside click, closing when another row starts a drag,
// closing when a conversation actually opens) routes through this.
let _openSwipeConvId = null;
let _convMoreMenuConvId = null; // which conv's ••• contextual menu is currently open

// Desktop (mouse drag) and mobile (finger swipe) share this exact same
// reveal panel — one lookup, one threshold, one menu, so there's nothing
// for the two input methods to drift apart on.
function _swipePanelOf(row) {
    return row.querySelector('.chat-conv-swipe-reveal');
}

function _closeSwipePanel(exceptConvId) {
    if (!_openSwipeConvId || _openSwipeConvId === exceptConvId) return;
    const row = document.querySelector(`.chat-conv-row[data-conv-id="${_openSwipeConvId}"]`);
    const item = row?.querySelector('.chat-conv-item');
    if (item) item.style.transform = '';
    _openSwipeConvId = null;
}

function _openSwipePanel(convId, viaKeyboard) {
    _closeSwipePanel();
    const row = document.querySelector(`.chat-conv-row[data-conv-id="${convId}"]`);
    if (!row) return;
    const panel = _swipePanelOf(row);
    const item = row.querySelector('.chat-conv-item');
    const w = panel.offsetWidth;
    item.style.transform = `translateX(-${w}px)`;
    _openSwipeConvId = convId;
    if (viaKeyboard) panel.querySelector('.chat-conv-swipe-more-btn')?.focus();
}

// ===== CONVERSATION "MORE" MENU (opened by clicking/tapping the revealed •••) =====
// Deliberately does NOT close the swipe panel when opening — the spec
// requires the card to stay in its peeked position, with the ••• button
// still visible, while the menu floats above it. Both close together
// afterward (action taken, outside tap, or Escape) via _closeConvMoreMenu.
function _positionMenuNearButton(menu, btn) {
    menu.classList.add('open');
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = r.right - mw;
    let y = r.bottom + 6;
    if (y + mh > window.innerHeight) y = r.top - mh - 6;
    if (x < 4) x = 4;
    if (x + mw > window.innerWidth) x = window.innerWidth - mw - 4;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function _openConvMoreMenu(convId, btn) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    const pinned = _getConvFlagSet('pinned').has(convId);
    const muted = _getConvFlagSet('muted').has(convId);
    const archived = _getConvFlagSet('archived').has(convId);
    const isUnread = !muted && (conv.unreadCount > 0 || _getConvFlagSet('manualUnread').has(convId));

    document.querySelector('#convMorePin span').textContent = pinned ? 'Unpin Chat' : 'Pin Chat';
    document.querySelector('#convMorePin i').className = `fas fa-thumbtack${pinned ? ' chat-conv-swipe-active' : ''}`;
    document.querySelector('#convMoreReadToggle span').textContent = isUnread ? 'Mark as Read' : 'Mark as Unread';
    document.querySelector('#convMoreMute span').textContent = muted ? 'Unmute Notifications' : 'Mute Notifications';
    document.querySelector('#convMoreMute i').className = `fas fa-bell-slash${muted ? ' chat-conv-swipe-active' : ''}`;
    document.querySelector('#convMoreArchive span').textContent = archived ? 'Unarchive Chat' : 'Archive Chat';

    _convMoreMenuConvId = convId;
    _positionMenuNearButton(document.getElementById('chatConvMoreMenu'), btn);
}

function _closeConvMoreMenu() {
    const menu = document.getElementById('chatConvMoreMenu');
    if (menu) menu.classList.remove('open');
    if (_convMoreMenuConvId) {
        _convMoreMenuConvId = null;
        _closeSwipePanel();
    }
}

// Click/tap on a conversation row. Swiping never opens a conversation (the
// drag engine below intercepts and handles real drags before this ever
// runs) — this only fires for an actual tap/click. Per spec: if a panel is
// already open anywhere, the first click just closes it; only a second,
// separate click on a row with nothing open actually opens the conversation.
function _handleConvActivate(convId) {
    if (_openSwipeConvId) { _closeSwipePanel(); return; }
    openConversation(convId);
}

function _convAction(action, convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    _closeSwipePanel();

    if (action === 'profile') {
        location.href = `dashboard.html?user_id=${conv.otherUser.id}`;
    } else if (action === 'pin') {
        const nowOn = _toggleConvFlag('pinned', convId);
        _updateConvRow(convId);
        showToast(nowOn ? 'Chat pinned.' : 'Chat unpinned.', 'success');
    } else if (action === 'mute') {
        const nowOn = _toggleConvFlag('muted', convId);
        _updateConvRow(convId);
        showToast(nowOn ? 'Notifications muted.' : 'Notifications unmuted.', 'success');
    } else if (action === 'archive') {
        const nowOn = _toggleConvFlag('archived', convId);
        // Archiving changes which conversations are even in the visible
        // set, so (unlike pin/mute/unread) this genuinely needs a list
        // rebuild — not "unnecessary", the item is actually
        // entering/leaving what's on screen.
        if (activeConversationId === convId) backToConvList();
        renderConvList(document.getElementById('chatConvSearch')?.value);
        showToast(nowOn ? 'Conversation archived successfully.' : 'Conversation unarchived.', 'success');
    } else if (action === 'delete') {
        promptDeleteChat(convId); // existing custom (non-browser) confirmation modal
    } else if (action === 'kbd-menu') {
        _openSwipePanel(convId, true);
    } else if (action === 'listings') {
        location.href = `dashboard.html?user_id=${conv.otherUser.id}`;
    } else if (action === 'toggleread') {
        // The ••• menu's single read-state item — its label AND behavior
        // flip with the conversation's current read state.
        const muted = _getConvFlagSet('muted').has(convId);
        const currentlyUnread = !muted && (conv.unreadCount > 0 || _getConvFlagSet('manualUnread').has(convId));
        if (currentlyUnread) {
            _clearConvFlag('manualUnread', convId);
            markRead(convId); // clears real unread messages too, not just the manual flag
            showToast('Conversation marked as read.', 'success');
        } else {
            _toggleConvFlag('manualUnread', convId);
            _updateConvRow(convId);
            showToast('Conversation marked as unread.', 'success');
        }
    }
}

function openArchivedView() {
    _showingArchived = true;
    document.getElementById('chatArchivedHeader').style.display = 'flex';
    document.getElementById('chatSearchWrap').style.display = 'none';
    clearConvSearch();
    renderConvList();
}

function closeArchivedView() {
    _showingArchived = false;
    document.getElementById('chatArchivedHeader').style.display = 'none';
    document.getElementById('chatSearchWrap').style.display = '';
    renderConvList();
}

// A single set of pointer listeners on the list container (event
// delegation) handles every row's drag — never one listener per row, so
// re-rendering/reordering rows can never leak listeners or attach
// duplicates. Pointer Events unify mouse, touch, pen, and trackpad-drag
// behind one code path (no separate mouse/touch branches to keep in sync).
(function () {
    const SLOP = 8;      // px of movement before a gesture commits to a direction
    const LONG_PRESS_MS = 500;
    let state = null;    // in-flight gesture, or null between gestures
    let longPressTimer = null;

    function rowOf(el) { return el.closest('.chat-conv-row'); }

    document.getElementById('chatConvList').addEventListener('pointerdown', (e) => {
        const actionBtn = e.target.closest('[data-conv-action]');
        // Buttons (swipe-panel actions, avatar, keyboard trigger) handle
        // their own click — don't start a drag/tap gesture from them.
        if (actionBtn) return;
        const item = e.target.closest('.chat-conv-item');
        if (!item) return;
        const row = rowOf(item);
        const convId = row.dataset.convId;
        const panel = _swipePanelOf(row);

        state = {
            pointerId: e.pointerId,
            convId,
            item,
            row,
            panelWidth: panel.offsetWidth,
            startX: e.clientX,
            startY: e.clientY,
            startTime: e.timeStamp,
            baseX: _openSwipeConvId === convId ? -panel.offsetWidth : 0,
            direction: null // 'horizontal' | 'vertical' once committed
        };

        if (e.pointerType === 'touch') {
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (state && state.direction === null) {
                    openMsgPreview(convId);
                    state = null; // a preview opened; the eventual pointerup shouldn't also act as a tap
                }
            }, LONG_PRESS_MS);
        }
    });

    document.addEventListener('pointermove', (e) => {
        if (!state || e.pointerId !== state.pointerId) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;

        if (state.direction === null) {
            if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
                // A vertical scroll — let the browser handle it natively
                // (touch-action:pan-y already keeps that path unblocked) and
                // stop tracking this gesture as a swipe entirely.
                clearTimeout(longPressTimer);
                state = null;
                return;
            }
            if (Math.abs(dx) > SLOP && Math.abs(dx) >= Math.abs(dy)) {
                state.direction = 'horizontal';
                clearTimeout(longPressTimer);
                try { state.item.setPointerCapture(state.pointerId); } catch {}
                state.row.classList.add('dragging');
                _closeSwipePanel(state.convId);
            } else {
                return; // still inside the slop zone, direction not decided yet
            }
        }

        if (state.direction === 'horizontal') {
            e.preventDefault();
            const x = Math.max(-state.panelWidth, Math.min(0, state.baseX + dx));
            state.item.style.transform = `translateX(${x}px)`;
        }
    }, { passive: false });

    function finishGesture(e) {
        if (!state || e.pointerId !== state.pointerId) return;
        clearTimeout(longPressTimer);
        const s = state;
        state = null;

        if (s.direction === 'horizontal') {
            s.row.classList.remove('dragging');
            try { s.item.releasePointerCapture(s.pointerId); } catch {}
            const dx = e.clientX - s.startX;
            const finalX = Math.max(-s.panelWidth, Math.min(0, s.baseX + dx));
            // Mobile only: a fast flick decides open/close by direction
            // regardless of distance, same as native messaging apps. Left
            // untouched on desktop so its (much wider) panel keeps its
            // original distance-only threshold exactly as before.
            // A fast flick (mouse or touch) decides open/close by direction
            // regardless of distance travelled, same as native messaging
            // apps; a slower drag falls back to the distance threshold.
            const dt = Math.max(1, (e.timeStamp || Date.now()) - s.startTime);
            const velocity = dx / dt;
            const openIt = Math.abs(velocity) > 0.35
                ? velocity < 0
                : finalX < -s.panelWidth * 0.4;
            s.item.style.transform = openIt ? `translateX(-${s.panelWidth}px)` : '';
            _openSwipeConvId = openIt ? s.convId : null;
        } else if (s.direction === null) {
            // A genuine tap/click — no drag ever happened.
            _handleConvActivate(s.convId);
        }
        // direction === 'vertical' already bailed out in pointermove; nothing to do here.
    }
    document.addEventListener('pointerup', finishGesture);
    document.addEventListener('pointercancel', finishGesture);

    // Delegated click for the swipe-panel action buttons, the clickable
    // avatar, and the keyboard-only actions trigger.
    document.getElementById('chatConvList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-conv-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const row = rowOf(btn);
        if (!row) return;
        // Opening the ••• menu must NOT run through _convAction — every
        // other action there starts with _closeSwipePanel(), which would
        // instantly hide the just-revealed ••• button instead of leaving
        // the card peeked while the menu floats above it.
        if (btn.dataset.convAction === 'more-menu') { _openConvMoreMenu(row.dataset.convId, btn); return; }
        _convAction(btn.dataset.convAction, row.dataset.convId);
    });

    // Keyboard: Enter/Space on a focused row opens it (or closes an open
    // panel first, same rule as a mouse click); Enter/Space on the
    // keyboard-actions trigger is handled by the click listener above,
    // since a button's Enter/Space already synthesizes a click event.
    document.getElementById('chatConvList').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.chat-conv-item');
        if (!item || e.target.closest('[data-conv-action]')) return;
        e.preventDefault();
        _handleConvActivate(item.dataset.convId);
    });
})();

// The "more" menu lives outside #chatConvList (a single fixed-position
// element reused across rows, same pattern as #chatCtxMenu) so it needs its
// own click listener rather than the delegated one above.
document.getElementById('chatConvMoreMenu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-conv-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const convId = _convMoreMenuConvId;
    _closeConvMoreMenu();
    if (convId) _convAction(btn.dataset.convAction, convId);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-ctx-menu')) hideCtxMenu();
    if (!e.target.closest('.chat-conv-more-menu')) _closeConvMoreMenu();
    if (!e.target.closest('.chat-conv-row')) _closeSwipePanel();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideCtxMenu(); _closeConvMoreMenu(); _closeSwipePanel(); closeMsgPreview(); }
});

// Long press for mobile
document.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.chat-msg-row[oncontextmenu]');
    if (!row) return;
    longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        showCtxMenu({ preventDefault() {}, stopPropagation() {}, clientX: touch.clientX, clientY: touch.clientY }, row);
    }, 500);
}, { passive: true });

document.addEventListener('touchend', () => { clearTimeout(longPressTimer); });
document.addEventListener('touchmove', () => { clearTimeout(longPressTimer); });

// ===== COPY TEXT =====
function ctxCopyText() {
    if (!ctxTargetRow) return;
    const text = ctxTargetRow.getAttribute('data-msg-text') || '';
    navigator.clipboard.writeText(text).catch(() => {});
    hideCtxMenu();
}

// ===== UNSEND MESSAGE =====
let unsendMsgId = null;

function ctxUnsendMsg() {
    if (!ctxTargetRow) return;
    unsendMsgId = ctxTargetRow.getAttribute('data-msg-id');
    hideCtxMenu();
    document.getElementById('unsendModal').classList.add('open');
}

function closeUnsendModal() {
    document.getElementById('unsendModal').classList.remove('open');
    unsendMsgId = null;
}

async function confirmUnsend() {
    if (!unsendMsgId) return;
    const msgId = unsendMsgId;
    closeUnsendModal();

    await chatUpdate('messages', `id=eq.${msgId}&sender_id=eq.${currentUser.id}`, {
        is_unsent: true,
        message_text: null,
        file_url: null,
        file_name: null,
        file_size: null
    });

    const row = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (row) {
        const inner = row.querySelector('div:nth-child(2)');
        if (inner) inner.innerHTML = '<div class="chat-msg-unsent"><i class="fas fa-ban" style="margin-right:4px;font-size:11px;"></i>You unsent a message</div>';
        row.removeAttribute('oncontextmenu');
    }

    if (activeConversationId) {
        const conv = conversations.find(c => c.id === activeConversationId);
        if (conv && conv.lastMessage && conv.lastMessage.id === msgId) {
            conv.lastMessage.is_unsent = true;
            conv.lastMessage.message_text = null;
            sortAndRenderConvs();
        }
    }
}

// ===== DELETE CHAT (for me only) =====
let deleteChatId = null;

function promptDeleteChat(convId) {
    deleteChatId = convId;
    document.getElementById('deleteChatModal').classList.add('open');
}

function closeDeleteChatModal() {
    document.getElementById('deleteChatModal').classList.remove('open');
    deleteChatId = null;
}

async function confirmDeleteChat() {
    if (!deleteChatId) return;
    const convId = deleteChatId;
    closeDeleteChatModal();

    const ok = await chatUpdate('conversation_participants',
        `conversation_id=eq.${convId}&user_id=eq.${currentUser.id}`,
        { deleted_at: new Date().toISOString() }
    );

    if (!ok) {
        showToast('Unable to delete conversation. Please try again.', 'error');
        return;
    }

    conversations = conversations.filter(c => c.id !== convId);
    _closeSwipePanel();

    if (activeConversationId === convId) {
        backToConvList();
    }

    renderConvList();
    showToast('Conversation deleted.', 'success');
}

// ===== MESSAGE TIMESTAMPS (tap to reveal) =====
function toggleMsgTimestamp(row) {
    const ts = row.querySelector('.chat-msg-tap-ts');
    if (!ts) return;
    const wasOpen = ts.classList.contains('visible');

    document.querySelectorAll('.chat-msg-tap-ts.visible').forEach(el => el.classList.remove('visible'));

    if (!wasOpen) ts.classList.add('visible');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-msg-row')) {
        document.querySelectorAll('.chat-msg-tap-ts.visible').forEach(el => el.classList.remove('visible'));
    }
});

// ===== CHAT SETTINGS (Active Status) =====
function toggleChatSettings() {
    const panel = document.getElementById('chatSettingsPanel');
    panel.classList.toggle('open');
}

async function loadChatActiveStatus() {
    const toggle = document.getElementById('chatActiveToggle');
    if (!toggle || !currentUser) return;
    try {
        const data = await chatGet('profiles', `select=show_active_status&id=eq.${currentUser.id}`);
        toggle.checked = (data && data[0] && data[0].show_active_status !== false);
    } catch (e) {
        toggle.checked = true;
    }
}

async function saveChatActiveStatus(enabled) {
    if (!currentUser) return;
    chatUpdate('profiles', `id=eq.${currentUser.id}`, { show_active_status: enabled });

    if (!enabled && presenceChannel) {
        presenceChannel.untrack();
    } else if (enabled && presenceChannel) {
        presenceChannel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
    }
}

// ===== MOBILE MESSAGE PREVIEW (long-press) =====
// Read-only: never marks the conversation read, never touches the unread
// badge/counters. Opening it for real ("Open Conversation" below) is the
// only thing that goes through the normal openConversation() -> markRead() path.
let _previewConvId = null;

async function openMsgPreview(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    _previewConvId = convId;
    document.getElementById('chatPreviewAvatar').src = conv.otherUser.image;
    document.getElementById('chatPreviewName').textContent = conv.otherUser.name;
    const box = document.getElementById('chatPreviewMessages');
    box.innerHTML = '<div class="chat-preview-empty"><i class="fas fa-spinner fa-spin"></i></div>';
    document.getElementById('chatPreviewModal').classList.add('open');

    const msgs = await chatGet('messages', `select=*&conversation_id=eq.${convId}&order=created_at.desc&limit=5`);
    if (_previewConvId !== convId) return; // closed, or a different preview opened, while this was in flight
    if (!msgs.length) {
        box.innerHTML = '<div class="chat-preview-empty">No messages yet.</div>';
        return;
    }
    box.innerHTML = msgs.reverse().map(m => {
        const own = m.sender_id === currentUser.id;
        const text = m.is_unsent
            ? (own ? 'You unsent a message' : 'Message unsent')
            : (m.message_type === 'TEXT' ? (m.message_text || '') : `📎 ${m.file_name || m.message_type}`);
        return `<div class="chat-preview-msg${own ? ' own' : ''}">${esc(text)}</div>`;
    }).join('');
}

function closeMsgPreview() {
    document.getElementById('chatPreviewModal').classList.remove('open');
    _previewConvId = null;
}

function chatPreviewOpenConversation() {
    const convId = _previewConvId;
    closeMsgPreview();
    if (convId) openConversation(convId);
}

function goToActiveOtherProfile() {
    if (activeOtherUser) location.href = `dashboard.html?user_id=${activeOtherUser.id}`;
}

// ===== MOBILE KEYBOARD HANDLING (iOS Safari) =====
function setupMobileKeyboard() {
    if (window.innerWidth > 768) return;

    const container = document.querySelector('.chat-container');
    const composer = document.getElementById('chatComposerInput');
    if (!container || !composer) return;

    const vv = window.visualViewport;
    if (!vv) return;

    let keyboardOpen = false;

    function onViewportResize() {
        const keyboardNow = vv.height < window.innerHeight * 0.75;

        if (keyboardNow && !keyboardOpen) {
            keyboardOpen = true;
            container.classList.add('keyboard-open');
            container.style.height = vv.height + 'px';
            scrollMessagesToBottom();
        } else if (keyboardNow && keyboardOpen) {
            container.style.height = vv.height + 'px';
        } else if (!keyboardNow && keyboardOpen) {
            keyboardOpen = false;
            container.classList.remove('keyboard-open');
            container.style.height = '';
        }
    }

    vv.addEventListener('resize', onViewportResize);

    composer.addEventListener('focus', () => {
        setTimeout(() => {
            onViewportResize();
            scrollMessagesToBottom();
        }, 300);
    });

    composer.addEventListener('blur', () => {
        setTimeout(() => {
            keyboardOpen = false;
            container.classList.remove('keyboard-open');
            container.style.height = '';
        }, 100);
    });
}

function scrollMessagesToBottom() {
    const msgs = document.getElementById('chatMessages');
    if (msgs) {
        requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    }
}
