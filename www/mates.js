// mates.js — Realmate connection system
// Requires a `mates` table in Supabase. Run this SQL once:
//
// create table mates (
//   id uuid default gen_random_uuid() primary key,
//   requester_id   uuid,
//   requester_name text,
//   requester_img  text,
//   recipient_id   uuid,
//   recipient_name text,
//   status         text default 'pending',   -- 'pending' | 'accepted' | 'declined'
//   created_at     timestamptz default now()
// );
// create index on mates(requester_id);
// create index on mates(recipient_id);

const MATES_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const MATES_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _matesDb  = (typeof _sb !== 'undefined') ? _sb
                : (typeof _supabase !== 'undefined') ? _supabase
                : supabase.createClient(MATES_URL, MATES_KEY);

// Cache: recipientName → status ('none'|'pending_sent'|'pending_received'|'accepted')
let _matesCache = {};
// Same cache keyed by the other party's account id instead of their display
// name. A rename leaves _matesCache's key stale (it was written under
// whatever name was current at load time), so any caller that has the
// other party's live id — e.g. notifications, which resolve sender_id
// separately from sender_user_name — should prefer this one. getMateStatus()
// checks it first and only falls back to the name-keyed cache.
let _matesCacheById = {};
let _matesLoaded = false;

// The four Admin-assigned positions are the only valid position values —
// anything else (legacy free text, empty) is treated as no position.
function _matesValidPosition(job) { return ''; }

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when generated, so
// trusting a stored one as-is after a rename shows stale initials forever.
// Regenerate fresh from the current name whenever there's no real upload.
function _matesAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;
}

// Inserts a notification, tolerating a database that hasn't run
// notifications-sender-id-migration.sql yet (adds sender_id/recipient_id).
// Postgres rejects an insert that references a column that doesn't exist
// outright — not just that field — so without this, every mate-request/
// accept/decline notification silently fails to be created at all on an
// unmigrated database. Retries once without those two columns instead of
// losing the notification entirely.
async function _matesInsertNotification(payload) {
    const { error } = await _matesDb.from('notifications').insert(payload);
    if (!error) return;
    const isMissingColumn = error.code === '42703' || /recipient_id|sender_id/i.test(error.message || '');
    if (!isMissingColumn) { console.warn('[mates] notification insert failed:', error.message); return; }
    const { sender_id, recipient_id, ...fallback } = payload;
    const { error: fallbackError } = await _matesDb.from('notifications').insert(fallback);
    if (fallbackError) console.warn('[mates] notification fallback insert failed:', fallbackError.message);
}

// Deletes the stale 'mate_accepted' ("You are now Realmates!") notification
// between two users, in BOTH directions. Called when a fresh mate_request is
// created between a pair that was previously connected: if they accepted, then
// removed each other, then re-requested, the old "You are now Realmates!" line
// is now false — a request is pending, they are NOT realmates — and would sit
// confusingly right next to the new "sent you a mate request" card. Removing it
// keeps the pending request the single source of truth. The recipient's
// notifications page listens for this DELETE and drops it in real time (see
// notifications.js). Id-based matching (rename-proof) with a name-pair
// fallback, and a further fallback for a DB missing the sender_id column,
// mirroring cancelMateRequest.
async function _matesClearStaleAccepted(myId, myName, otherId, otherName) {
    const attempt = async (useIds) => {
        let q = _matesDb.from('notifications').delete().eq('type', 'mate_accepted');
        if (useIds) {
            // (sender=me, recipient=them) OR (sender=them, recipient=me)
            q = q.or(
                `and(sender_id.eq.${myId},recipient_id.eq.${otherId}),` +
                `and(sender_id.eq.${otherId},recipient_id.eq.${myId})`
            );
        } else {
            q = q.or(
                `and(sender_user_name.eq.${myName},recipient_user_name.eq.${otherName}),` +
                `and(sender_user_name.eq.${otherName},recipient_user_name.eq.${myName})`
            );
        }
        return q;
    };
    let err = null;
    if (myId && otherId) {
        const { error } = await attempt(true);
        if (error) {
            const missingCol = error.code === '42703' || /sender_id|recipient_id/i.test(error.message || '');
            if (missingCol) { const { error: e2 } = await attempt(false); err = e2; }
            else err = error;
        }
    } else {
        const { error } = await attempt(false);
        err = error;
    }
    if (err) console.warn('[mates] stale mate_accepted delete failed:', err.message);
}

function _localUser() {
    return JSON.parse(localStorage.getItem('user')) || null;
}

// A pending-sent request button is now clickable to withdraw the request.
// The base .mate-status-pending rules (in listing-card/dashboard/livemarket
// CSS) still force cursor:default/reduced opacity from when it was disabled,
// so re-enable interaction here and swap the "Pending" label to "Cancel
// Request" on hover — injected once so every page that loads mates.js gets
// it without touching each CSS file.
(function _injectMateCancelStyles() {
    if (typeof document === 'undefined') return;
    const add = () => {
        if (document.getElementById('mate-cancelable-styles')) return;
        const style = document.createElement('style');
        style.id = 'mate-cancelable-styles';
        style.textContent = `
            .mate-cancelable { cursor: pointer !important; opacity: 1 !important; }
            .mate-cancelable .mate-cancel-label { display: none; }
            .mate-cancelable:hover { border-color: #ef4444 !important; color: #ef4444 !important; }
            .mate-cancelable:hover .mate-pending-label { display: none; }
            .mate-cancelable:hover .mate-cancel-label { display: inline; }
        `;
        (document.head || document.documentElement).appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
})();

// ── Shared in-app confirmation dialog (replaces browser confirm()) ──
// Used by handleRemoveMate below and by follows.js's handleUnfollow. Builds
// itself lazily on first use so any page that loads mates.js gets it for
// free without extra markup in every HTML file.
function _ensureConfirmDialogEl() {
    let overlay = document.getElementById('rmConfirmOverlay');
    if (overlay) return overlay;

    const style = document.createElement('style');
    style.textContent = `
        #rmConfirmOverlay {
            position: fixed; inset: 0; background: rgba(15,23,42,0.55);
            z-index: 999998; display: none; align-items: center; justify-content: center;
            padding: 20px; opacity: 0; transition: opacity 0.2s ease;
        }
        #rmConfirmOverlay.open { display: flex; }
        #rmConfirmOverlay.show { opacity: 1; }
        #rmConfirmBox {
            background: #fff; border-radius: 20px; width: 100%; max-width: 360px;
            padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.25);
            font-family: 'Inter', sans-serif;
            transform: scale(0.92) translateY(8px); opacity: 0;
            transition: transform 0.2s ease, opacity 0.2s ease;
        }
        #rmConfirmOverlay.show #rmConfirmBox { transform: scale(1) translateY(0); opacity: 1; }
        #rmConfirmTitle { font-size: 17px; font-weight: 800; color: #0f172a; margin: 0 0 8px; }
        #rmConfirmMsg { font-size: 13.5px; color: #64748b; line-height: 1.5; margin: 0 0 22px; }
        #rmConfirmActions { display: flex; gap: 10px; }
        .rm-confirm-btn {
            flex: 1; padding: 11px; border-radius: 12px; border: none;
            font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit;
            transition: all 0.15s;
        }
        #rmConfirmCancel { background: #f1f5f9; color: #334155; }
        #rmConfirmCancel:hover { background: #e2e8f0; }
        #rmConfirmOk { background: #ef4444; color: #fff; }
        #rmConfirmOk:hover { background: #dc2626; }
        html[data-theme="dark"] #rmConfirmBox { background: #1e293b; }
        html[data-theme="dark"] #rmConfirmTitle { color: #f1f5f9; }
        html[data-theme="dark"] #rmConfirmMsg { color: #94a3b8; }
        html[data-theme="dark"] #rmConfirmCancel { background: #334155; color: #f1f5f9; }
        html[data-theme="dark"] #rmConfirmCancel:hover { background: #475569; }
        @media (max-width: 480px) {
            #rmConfirmOverlay { align-items: flex-end; }
            #rmConfirmBox { max-width: 100%; border-radius: 24px 24px 0 0; }
        }
    `;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'rmConfirmOverlay';
    overlay.innerHTML = `
        <div id="rmConfirmBox">
            <h3 id="rmConfirmTitle"></h3>
            <p id="rmConfirmMsg"></p>
            <div id="rmConfirmActions">
                <button type="button" id="rmConfirmCancel" class="rm-confirm-btn">Cancel</button>
                <button type="button" id="rmConfirmOk" class="rm-confirm-btn">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

// Returns a Promise<boolean> — resolves true if the user confirmed.
function showConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
    return new Promise(resolve => {
        const overlay = _ensureConfirmDialogEl();
        overlay.querySelector('#rmConfirmTitle').textContent = title || 'Are you sure?';
        overlay.querySelector('#rmConfirmMsg').textContent = message || '';
        const okBtn = overlay.querySelector('#rmConfirmOk');
        const cancelBtn = overlay.querySelector('#rmConfirmCancel');
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.classList.remove('open'), 200);
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => close(true);
        const onCancel = () => close(false);
        const onOverlay = (e) => { if (e.target === overlay) close(false); };
        const onKey = (e) => { if (e.key === 'Escape') close(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
        document.addEventListener('keydown', onKey);

        overlay.classList.add('open');
        requestAnimationFrame(() => overlay.classList.add('show'));
    });
}

async function loadMatesCache() {
    const me = _localUser();
    if (!me) return;
    try {
        const { data } = await _matesDb.auth.getUser();
        const myId = data?.user?.id;
        if (!myId) return;

        const { data: rows } = await _matesDb
            .from('mates')
            .select('*')
            .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`);

        _matesCache = {};
        _matesCacheById = {};
        (rows || []).forEach(r => {
            const otherName = r.requester_id === myId ? r.recipient_name : r.requester_name;
            const otherId = r.requester_id === myId ? r.recipient_id : r.requester_id;
            const status = r.status === 'accepted'
                ? 'accepted'
                : (r.requester_id === myId ? 'pending_sent' : 'pending_received');
            _matesCache[otherName] = status;
            if (otherId) _matesCacheById[otherId] = status;
        });
        _matesLoaded = true;
    } catch (e) { console.warn('mates cache load:', e); }
}

// userId (when known) is checked first since it's immune to the
// display-name drift that stale caches/snapshots hit after a rename — see
// _matesCacheById above. Falls back to the name-keyed cache when no id is
// available, same as before.
function getMateStatus(userName, userId) {
    if (userId && _matesCacheById[userId]) return _matesCacheById[userId];
    return _matesCache[userName] || 'none';
}

async function getMatesCount(userId) {
    try {
        // A head:true row count can't dedupe, so it would double-count a pair
        // that has two rows (see getMatesList's dedupeById for why that can
        // happen). Fetch just the id columns instead and count unique "other
        // party" ids, the same way getMatesList does, so the count always
        // matches what's actually rendered.
        const { data: rows } = await _matesDb
            .from('mates')
            .select('requester_id, recipient_id')
            .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
            .eq('status', 'accepted');
        const otherIds = new Set((rows || []).map(r => r.requester_id === userId ? r.recipient_id : r.requester_id));
        return otherIds.size;
    } catch { return 0; }
}

// Returns { accepted: [], pendingReceived: [] }
async function getMatesList() {
    const me = _localUser();
    if (!me) return { accepted: [], pendingReceived: [] };
    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;
        if (!myId) return { accepted: [], pendingReceived: [] };

        const { data: rows } = await _matesDb
            .from('mates')
            .select('*')
            .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`)
            .order('created_at', { ascending: false });

        const _acceptedRaw = [];
        const _pendingReceivedRaw = [];
        const _pendingSentRaw = [];

        (rows || []).forEach(r => {
            const isMine = r.requester_id === myId;
            if (r.status === 'accepted') {
                _acceptedRaw.push({
                    name: isMine ? r.recipient_name : r.requester_name,
                    img:  isMine ? (r.recipient_img || null) : (r.requester_img || null),
                    id:   isMine ? r.recipient_id : r.requester_id,
                    rowId: r.id
                });
            } else if (r.status === 'pending' && !isMine) {
                _pendingReceivedRaw.push({
                    name: r.requester_name,
                    img:  r.requester_img,
                    id:   r.requester_id,
                    rowId: r.id
                });
            } else if (r.status === 'pending' && isMine) {
                _pendingSentRaw.push({
                    name: r.recipient_name,
                    id: r.recipient_id,
                    rowId: r.id
                });
            }
        });

        // Two `mates` rows can exist for the same actual pair of accounts (e.g.
        // a rename left an old row's stored name unmatched by a later
        // duplicate-check — see sendMateRequest). Rather than trust "one row =
        // one relationship", dedupe by the other party's unique account id
        // here, at the single place every consumer (the Realmates count, the
        // widget list, and the stats modal) reads from — not by display name,
        // and not by hiding it in the render layer.
        const dedupeById = (list) => {
            const seen = new Set();
            return list.filter(item => {
                const key = item.id || `name:${item.name}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };
        const accepted = dedupeById(_acceptedRaw);
        const pendingReceived = dedupeById(_pendingReceivedRaw);
        const pendingSent = dedupeById(_pendingSentRaw);

        // Fill missing images + enrich with job/division/group from profiles table
        // (broadened from "only entries missing an avatar" so the stats modal's
        // Realmates list can show job title/division/group per person)
        const idsToEnrich = accepted.filter(m => m.id).map(m => m.id);
        if (idsToEnrich.length > 0) {
            const { data: profiles } = await _matesDb
                .from('profiles')
                .select('id, full_name, avatar_url, job_title, division, business_group')
                .in('id', idsToEnrich);
            if (profiles) {
                const map = {};
                profiles.forEach(p => { map[p.id] = p; });
                accepted.forEach(m => {
                    const p = map[m.id];
                    if (!p) return;
                    // Unconditional (not `if (!m.img && ...)`) — the old
                    // "only fill in if missing" check meant a stale snapshot
                    // already sitting on the mates row was never replaced,
                    // even once the live profile was fetched right here.
                    // full_name must be refreshed BEFORE the avatar is
                    // regenerated — otherwise a fresh ui-avatars placeholder
                    // still bakes in the old name (e.g. "JB" surviving a
                    // rename to Kmell Erisdhun Dungug) even though the URL
                    // itself is brand new.
                    m.name = p.full_name || m.name;
                    m.img = _matesAvatarFor(m.name, p.avatar_url);
                    m.job = _matesValidPosition(p.job_title);
                    m.division = p.division || '';
                    m.group = p.business_group || '';
                });
            }
        }

        return { accepted, pendingReceived, pendingSent };
    } catch (e) { console.warn('getMatesList:', e); return { accepted: [], pendingReceived: [] }; }
}

async function sendMateRequest(recipientName, recipientImg) {
    const me = _localUser();
    if (!me) return { error: 'Not logged in' };

    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;
        if (!myId) return { error: 'Not authenticated' };

        // Find recipient id from profiles first, fall back to listings
        let recipientId = null;
        const { data: profileRows } = await _matesDb
            .from('profiles')
            .select('id')
            .eq('full_name', recipientName)
            .limit(1);
        recipientId = profileRows?.[0]?.id || null;
        if (!recipientId) {
            const { data: listingRows } = await _matesDb
                .from('listings')
                .select('user_id')
                .eq('user_name', recipientName)
                .limit(1);
            recipientId = listingRows?.[0]?.user_id || null;
        }

        // A user can never Realmate themselves. This can only be reached by
        // resolving recipientId from a NAME (above) — e.g. a stale listing
        // snapshot still carrying this same account's old name — since the
        // button that calls sendMateRequest is already hidden for a listing
        // whose (live-resolved) author is the viewer. The real enforcement is
        // the DB check constraint (see mates_no_self_request.sql); this is
        // just a friendlier error than a raw constraint-violation message.
        if (recipientId && recipientId === myId) {
            return { error: "You can't add yourself as a realmate." };
        }

        // Check DB for an existing connection (cache may be stale). Matched by
        // account id, not display name — a name-based check here was the root
        // cause of duplicate rows: if either party renamed themselves after an
        // earlier request/acceptance, the old row's stored name no longer
        // matched their current name, so this check missed it and let a
        // second row for the same pair get inserted. Only fall back to a
        // name-based check when recipientId couldn't be resolved at all.
        const existingFilter = recipientId
            ? `and(requester_id.eq.${myId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${myId})`
            : `and(requester_name.eq.${me.name},recipient_name.eq.${recipientName}),and(requester_name.eq.${recipientName},recipient_name.eq.${me.name})`;
        const { data: existingRows } = await _matesDb
            .from('mates')
            .select('status, requester_id, requester_name')
            .or(existingFilter)
            .limit(1);
        if (existingRows?.length > 0) {
            const row = existingRows[0];
            if (row.status === 'accepted') return { error: 'Already realmates' };
            // A pending row already exists for this pair. Figure out its
            // direction: if THEY sent ME the request, don't dead-end with
            // "Request already pending" — both of us clearly want to connect,
            // so accept their request instead. Only a request I sent myself is
            // a genuine "already pending". Direction is decided by account id
            // (names are just a snapshot and drift after a rename — the very
            // reason the wrong button can show in the first place); fall back
            // to the stored name only when the id couldn't be resolved.
            const theySentMe = recipientId
                ? row.requester_id === recipientId
                : row.requester_name === recipientName;
            if (theySentMe) {
                const accepted = await acceptMateRequest(recipientName);
                return accepted.success ? { success: true, accepted: true } : accepted;
            }
            return { error: 'Request already pending' };
        }

        const { error } = await _matesDb.from('mates').insert({
            requester_id:   myId,
            requester_name: me.name,
            requester_img:  me.image || '',
            recipient_id:   recipientId,
            recipient_name: recipientName,
            recipient_img:  recipientImg || '',
            status: 'pending'
        });
        if (error) throw error;

        // Send notification to recipient. sender_id/recipient_id (in addition
        // to the existing name/picture snapshot) let this notification's
        // avatar resolve live later even after a rename — see
        // notifications-sender-id-migration.sql.
        await _matesInsertNotification({
            type:                  'mate_request',
            sender_id:              myId,
            sender_user_name:      me.name,
            sender_profile_picture: me.image || '',
            recipient_id:           recipientId,
            recipient_user_name:   recipientName,
            message:               'sent you a mate request.',
            is_read:               false,
            created_at:            new Date().toISOString()
        });

        // They were realmates, unmatched, and are now being re-requested: drop
        // the old "You are now Realmates!" notification so it doesn't linger
        // next to this fresh request (which is now the truth). See
        // _matesClearStaleAccepted.
        await _matesClearStaleAccepted(myId, me.name, recipientId, recipientName);

        _matesCache[recipientName] = 'pending_sent';
        if (recipientId) _matesCacheById[recipientId] = 'pending_sent';
        if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
        return { success: true };
    } catch (e) {
        console.error('sendMateRequest:', e);
        return { error: e.message };
    }
}

// Withdraw a still-pending request THIS user sent. Deletes the pending
// mates row (requester = me → recipient = them) and, critically, the
// 'mate_request' notification it created on the recipient's side — so a
// cancelled request stops showing up as a pending Realmate request in their
// Notifications in real time (the recipient's notifications page listens for
// that DELETE). Id-based matching with a name fallback, same rename-safety
// as sendMateRequest/removeMate.
async function cancelMateRequest(recipientName) {
    const me = _localUser();
    if (!me) return { error: 'Not logged in' };
    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;

        let recipientId = null;
        if (myId) {
            const { data: profileRows } = await _matesDb
                .from('profiles')
                .select('id')
                .eq('full_name', recipientName)
                .limit(1);
            recipientId = profileRows?.[0]?.id || null;
            if (!recipientId) {
                const { data: listingRows } = await _matesDb
                    .from('listings')
                    .select('user_id')
                    .eq('user_name', recipientName)
                    .limit(1);
                recipientId = listingRows?.[0]?.user_id || null;
            }
        }

        // Only a request I actually sent (I'm the requester) and that's still
        // pending can be withdrawn — never an accepted connection.
        const cancelFilter = (myId && recipientId)
            ? `and(requester_id.eq.${myId},recipient_id.eq.${recipientId})`
            : `and(requester_name.eq.${me.name},recipient_name.eq.${recipientName})`;

        const { data: deletedRows, error: deleteErr } = await _matesDb.from('mates')
            .delete()
            .or(cancelFilter)
            .eq('status', 'pending')
            .select();
        if (deleteErr) throw deleteErr;

        // Clear cache regardless — the connection is no longer pending_sent.
        delete _matesCache[recipientName];
        if (recipientId) delete _matesCacheById[recipientId];

        if (!deletedRows || deletedRows.length === 0) {
            return { error: 'No pending request found to cancel.' };
        }

        // Remove the pending-request notification from the recipient's side so
        // it disappears from their Notifications immediately. Match by
        // sender_id when available (rename-proof), falling back to the name
        // snapshot if that column doesn't exist on this DB or no id is known.
        const baseDel = () => _matesDb.from('notifications').delete()
            .eq('type', 'mate_request')
            .eq('recipient_user_name', recipientName);
        let notifErr = null;
        if (myId) {
            const { error } = await baseDel().eq('sender_id', myId);
            if (error) {
                const missingCol = error.code === '42703' || /sender_id/i.test(error.message || '');
                if (missingCol) {
                    const { error: e2 } = await baseDel().eq('sender_user_name', me.name);
                    notifErr = e2;
                } else notifErr = error;
            }
        } else {
            const { error } = await baseDel().eq('sender_user_name', me.name);
            notifErr = error;
        }
        if (notifErr) console.warn('[mates] mate_request notif delete failed:', notifErr.message);

        if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
        return { success: true };
    } catch (e) {
        console.error('cancelMateRequest:', e);
        return { error: e.message };
    }
}

async function acceptMateRequest(requesterName) {
    const me = _localUser();
    if (!me) return { error: 'Not logged in' };
    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;
        if (!myId) return { error: 'Not authenticated' };

        // Resolve the requester's id (profiles first, then a listing snapshot)
        // so we can find the row by account id, not just by a display-name
        // snapshot that drifts after a rename.
        let requesterId = null;
        const { data: profileRows } = await _matesDb
            .from('profiles')
            .select('id')
            .eq('full_name', requesterName)
            .limit(1);
        requesterId = profileRows?.[0]?.id || null;
        if (!requesterId) {
            const { data: listingRows } = await _matesDb
                .from('listings')
                .select('user_id')
                .eq('user_name', requesterName)
                .limit(1);
            requesterId = listingRows?.[0]?.user_id || null;
        }

        // Find the actual relationship ROW between the two of us and update it by
        // primary key. The previous implementation updated with a strict
        // `recipient_id.eq.myId` filter and then reported success (and poisoned
        // the status cache to 'accepted') even when that matched ZERO rows — so a
        // request whose stored ids/names had drifted stayed 'pending' in the DB
        // while the UI claimed "You are now Realmates!". Matching by id-pair OR
        // name-pair (both directions) tolerates that drift and null ids; updating
        // by the row's own id is unambiguous; and we only claim success when a row
        // genuinely changed.
        const orParts = [];
        if (requesterId) {
            orParts.push(`and(requester_id.eq.${requesterId},recipient_id.eq.${myId})`);
            orParts.push(`and(requester_id.eq.${myId},recipient_id.eq.${requesterId})`);
        }
        orParts.push(`and(requester_name.eq.${requesterName},recipient_name.eq.${me.name})`);
        orParts.push(`and(requester_name.eq.${me.name},recipient_name.eq.${requesterName})`);

        const { data: relRows, error: relErr } = await _matesDb
            .from('mates')
            .select('id, status, requester_id, recipient_id, requester_name, recipient_name')
            .or(orParts.join(','));
        if (relErr) throw relErr;

        // Already connected (possibly accepted from another surface/tab). Sync the
        // cache and report success without inserting a duplicate notification.
        const acceptedRow = (relRows || []).find(r => r.status === 'accepted');
        if (acceptedRow) {
            _matesCache[requesterName] = 'accepted';
            if (requesterId) _matesCacheById[requesterId] = 'accepted';
            if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
            return { success: true, alreadyAccepted: true };
        }

        // The pending request we're accepting. Prefer the incoming one (they are
        // the requester); fall back to any pending row for this pair.
        const pendingRow = (relRows || []).find(r =>
            r.status === 'pending' && (
                (requesterId && r.requester_id === requesterId && r.recipient_id === myId) ||
                (r.requester_name === requesterName && r.recipient_name === me.name)
            )
        ) || (relRows || []).find(r => r.status === 'pending');

        if (!pendingRow) {
            // Nothing to accept — do NOT fake success or poison the cache.
            return { error: 'Request not found' };
        }

        // Update THIS row by primary key. Backfill ids that were stored null so the
        // rest of the app (which matches by id) recognizes the pair afterwards.
        const patch = { status: 'accepted' };
        if (!pendingRow.recipient_id) patch.recipient_id = myId;
        if (!pendingRow.requester_id && requesterId) patch.requester_id = requesterId;

        const { data: updatedRows, error: updateErr } = await _matesDb
            .from('mates')
            .update(patch)
            .eq('id', pendingRow.id)
            .eq('status', 'pending')   // idempotent: only the flipping call gets a row back
            .select();
        if (updateErr) throw updateErr;

        // Verified against the DB — only NOW is it safe to treat it as accepted.
        if (!updatedRows || updatedRows.length === 0) {
            // A concurrent call already flipped it. It IS accepted; sync cache,
            // skip the duplicate notification.
            _matesCache[requesterName] = 'accepted';
            if (requesterId) _matesCacheById[requesterId] = 'accepted';
            if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
            return { success: true, alreadyAccepted: true };
        }

        _matesCache[requesterName] = 'accepted';
        if (requesterId) _matesCacheById[requesterId] = 'accepted';

        // Notify requester they were accepted. sender_id/recipient_id let
        // this notification's avatar resolve live later — see
        // notifications-sender-id-migration.sql.
        await _matesInsertNotification({
            type:                  'mate_accepted',
            sender_id:              myId,
            sender_user_name:      me.name,
            sender_profile_picture: me.image || '',
            recipient_id:           requesterId,
            recipient_user_name:   requesterName,
            message:               'accepted your mate request. You are now realmates!',
            is_read:               false,
            created_at:            new Date().toISOString()
        });

        if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
        // Subtle confirmation — only on the genuine accept (the row we just
        // flipped). The alreadyAccepted early-returns above deliberately stay
        // silent so a concurrent surface can't double-play it.
        if (window.RMSound) RMSound.play('confirm');
        return { success: true };
    } catch (e) {
        console.error('acceptMateRequest:', e);
        return { error: e.message };
    }
}

async function removeMate(userName) {
    const me = _localUser();
    if (!me) return { error: 'Not logged in' };
    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;

        // Resolve the other user's id the same way sendMateRequest's
        // existing-connection check does, so this DELETE is matched by
        // account id instead of by name. requester_name/recipient_name are
        // just a snapshot taken when the row was written — never updated —
        // so matching by name alone silently broke as soon as either party
        // renamed themselves afterward: the WHERE clause no longer matched
        // the row, the delete affected zero rows, and since Supabase
        // doesn't error on that, the UI reported success and flipped to
        // "Add as Realmate" while the row stayed status='accepted' in the
        // DB. The very next sendMateRequest then correctly (per the DB's
        // actual state) reported "Already Realmates" — the removal just
        // never really happened. Falls back to name matching only if the
        // id can't be resolved, same as sendMateRequest.
        let otherId = null;
        if (myId) {
            const { data: profileRows } = await _matesDb
                .from('profiles')
                .select('id')
                .eq('full_name', userName)
                .limit(1);
            otherId = profileRows?.[0]?.id || null;
            if (!otherId) {
                const { data: listingRows } = await _matesDb
                    .from('listings')
                    .select('user_id')
                    .eq('user_name', userName)
                    .limit(1);
                otherId = listingRows?.[0]?.user_id || null;
            }
        }

        // Match the connection by id-pair OR name-pair, both directions. The old
        // filter used id-pair ONLY when ids resolved (no name fallback), so any
        // accepted row whose stored ids had drifted (or were null) was never
        // matched — the delete hit zero rows and, because that was treated as a
        // hard error, EVERY click reported "Could not find an active Realmate
        // connection to remove" and the removal could never go through.
        const orParts = [];
        if (myId && otherId) {
            orParts.push(`and(requester_id.eq.${myId},recipient_id.eq.${otherId})`);
            orParts.push(`and(requester_id.eq.${otherId},recipient_id.eq.${myId})`);
        }
        orParts.push(`and(requester_name.eq.${me.name},recipient_name.eq.${userName})`);
        orParts.push(`and(requester_name.eq.${userName},recipient_name.eq.${me.name})`);
        const orFilter = orParts.join(',');

        const { data: deletedRows, error } = await _matesDb.from('mates')
            .delete()
            .eq('status', 'accepted')
            .or(orFilter)
            .select();
        if (error) throw error;

        delete _matesCache[userName];
        if (otherId) delete _matesCacheById[otherId];

        // Verify against the DB: is there still an accepted connection between us?
        // If yes, the delete genuinely failed to reach it — surface a real error.
        // If none remains, we're done. That makes removal IDEMPOTENT: whether we
        // just deleted the row or it was already gone (a prior click, a stale
        // "Realmates" button), the end state is "not Realmates" = success, instead
        // of a scary "could not find an active connection" alert on every retry.
        const { data: remaining } = await _matesDb
            .from('mates')
            .select('id')
            .eq('status', 'accepted')
            .or(orFilter)
            .limit(1);
        if (remaining && remaining.length > 0) {
            return { error: 'Could not remove realmate. Please try again.' };
        }

        if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
        return { success: true, removed: !!(deletedRows && deletedRows.length) };
    } catch (e) {
        console.error('removeMate:', e);
        return { error: e.message };
    }
}

async function declineMateRequest(requesterName) {
    const me = _localUser();
    if (!me) return;
    try {
        const { data: authData } = await _matesDb.auth.getUser();
        const myId = authData?.user?.id;

        // Same id-based matching as acceptMateRequest/removeMate — see
        // acceptMateRequest for why matching by name alone silently breaks
        // after a rename.
        let requesterId = null;
        if (myId) {
            const { data: profileRows } = await _matesDb
                .from('profiles')
                .select('id')
                .eq('full_name', requesterName)
                .limit(1);
            requesterId = profileRows?.[0]?.id || null;
            if (!requesterId) {
                const { data: listingRows } = await _matesDb
                    .from('listings')
                    .select('user_id')
                    .eq('user_name', requesterName)
                    .limit(1);
                requesterId = listingRows?.[0]?.user_id || null;
            }
        }
        const declineFilter = (myId && requesterId)
            ? `and(requester_id.eq.${requesterId},recipient_id.eq.${myId})`
            : `and(requester_name.eq.${requesterName},recipient_name.eq.${me.name})`;

        // Same idempotency guard as acceptMateRequest: only notify if this
        // call actually deleted the pending row (i.e. it's the first decline
        // to reach the DB), not on every repeat call from a second surface.
        const { data: deletedRows, error: deleteErr } = await _matesDb.from('mates')
            .delete()
            .or(declineFilter)
            .eq('status', 'pending')
            .select();
        if (deleteErr) throw deleteErr;

        delete _matesCache[requesterName];
        if (requesterId) delete _matesCacheById[requesterId];
        if (!deletedRows || deletedRows.length === 0) {
            // Already declined/handled by an earlier call.
            if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
            return { success: true };
        }

        // Notify the requester that their request was declined (mirrors
        // accept). sender_id/recipient_id let this notification's avatar
        // resolve live later — see notifications-sender-id-migration.sql.
        await _matesInsertNotification({
            type:                  'mate_declined',
            sender_id:              myId,
            sender_user_name:      me.name,
            sender_profile_picture: me.image || '',
            recipient_id:           requesterId,
            recipient_user_name:   requesterName,
            message:               'declined your mate request.',
            is_read:               false,
            created_at:            new Date().toISOString()
        });

        if (typeof _rmBroadcastRel === 'function') _rmBroadcastRel(null, 'mate');  // sync bus
        return { success: true };
    } catch (e) {
        console.error('declineMateRequest:', e);
        return { error: e.message };
    }
}

// Render the correct button label/state for a given user
function mateButtonHtml(userName, btnClass = 'btn-mate') {
    const me = _localUser();
    if (!me || me.name === userName) return ''; // don't show for self

    const status = getMateStatus(userName);
    if (status === 'accepted') {
        const safe = userName.replace(/'/g, "\\'");
        return `<button class="${btnClass} mate-status-mates" onclick="handleRemoveMate(this,'${safe}')">
                    <i class="fas fa-user-group"></i> realmates
                </button>`;
    }
    if (status === 'pending_sent') {
        const safe = userName.replace(/'/g, "\\'");
        // Clickable so a sent request can be withdrawn. The hover label swaps
        // to "Cancel Request" via the .mate-status-pending styles.
        return `<button class="${btnClass} mate-status-pending mate-cancelable" onclick="handleCancelMate(this,'${safe}')" title="Cancel request">
                    <i class="fas fa-clock"></i> <span class="mate-pending-label">Pending</span><span class="mate-cancel-label">Cancel Request</span>
                </button>`;
    }
    if (status === 'pending_received') {
        const safe = userName.replace(/'/g, "\\'");
        return `<div style="display:flex;flex-direction:column;gap:6px;">
                    <span style="font-size:12px;font-weight:700;color:#f59e0b;display:flex;align-items:center;gap:5px;">
                        <i class="fas fa-user-clock"></i> Sent you a mate request
                    </span>
                    <div style="display:flex;gap:6px;">
                        <button class="${btnClass} mate-status-received" onclick="handleAcceptMate(this,'${safe}')">
                            <i class="fas fa-check"></i> Accept
                        </button>
                        <button class="${btnClass}" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;" onclick="handleDeclineMate(this,'${safe}')">
                            <i class="fas fa-times"></i> Decline
                        </button>
                    </div>
                </div>`;
    }
    return `<button class="${btnClass}" onclick="handleAddMate(this, '${userName.replace(/'/g, "\\'")}')">
                <i class="fas fa-user-plus"></i> Add as Mate
            </button>`;
}

async function handleAddMate(btn, userName) {
    const originalClass = btn.className;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const userImg = btn.closest('.listing-card, .match-card, .profile-info-block')
        ?.querySelector('img')?.src || '';
    const result = await sendMateRequest(userName, userImg);
    if (result.success && result.accepted) {
        // They had already sent us a request, so this became an accept, not a
        // send — reflect the real end state (Realmates), not a pending one.
        btn.outerHTML = `<button class="${originalClass} mate-status-mates" onclick="handleRemoveMate(this,'${userName.replace(/'/g, "\\'")}')">
                              <i class="fas fa-user-group"></i> You are now realmates!
                         </button>`;
    } else if (result.success) {
        btn.className = originalClass.replace('btn-mate-profile', 'btn-mate-profile mate-status-pending')
                                     .replace(/(?<!\S)btn-mate(?!\S)(?!-profile)/, 'btn-mate mate-status-pending');
        btn.innerHTML = '<i class="fas fa-clock"></i> Request Sent';
        btn.disabled = true;
        btn.onclick = null;
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Add as Mate';
        console.error('Mate request failed:', result.error);
        (window.showToast || alert)('Could not send mate request: ' + (result.error || 'Unknown error'), 'error');
    }
}

async function handleRemoveMate(btn, userName) {
    const confirmed = await showConfirmDialog({
        title: 'Remove realmate?',
        message: 'Are you sure you want to remove this realmate connection?',
        confirmText: 'Remove',
        cancelText: 'Cancel'
    });
    if (!confirmed) return;

    const baseClass = btn.className.split(' ').filter(c => !c.startsWith('mate-status')).join(' ');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await removeMate(userName);
    if (result.success) {
        btn.outerHTML = `<button class="${baseClass}" onclick="handleAddMate(this,'${userName.replace(/'/g, "\\'")}')">
                              <i class="fas fa-user-plus"></i> Add as Mate
                         </button>`;
        // #5: hide this ex-Realmate's content in real time everywhere. A
        // same-origin storage event reaches the other shell iframes; the Feed
        // re-checks post access + drops now-hidden posts, and the Profile (if
        // you're on their page) re-gates posts/listings/About.
        try { localStorage.setItem('rm_mate_removed', JSON.stringify({ name: userName, t: Date.now() })); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('rm:mate_removed', { detail: { name: userName } })); } catch (e) {}
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-group"></i> realmates';
        (window.showToast || alert)('Could not remove realmate: ' + (result.error || 'Unknown error'), 'error');
    }
}

async function handleCancelMate(btn, userName) {
    const confirmed = await showConfirmDialog({
        title: 'Cancel realmate request?',
        message: `Withdraw your pending realmate request to ${userName}? It will be removed from their notifications.`,
        confirmText: 'Cancel Request',
        cancelText: 'Keep'
    });
    if (!confirmed) return;

    const baseClass = btn.className.split(' ').filter(c => !c.startsWith('mate-status') && c !== 'mate-cancelable').join(' ');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await cancelMateRequest(userName);
    if (result.success) {
        btn.outerHTML = `<button class="${baseClass}" onclick="handleAddMate(this,'${userName.replace(/'/g, "\\'")}')">
                              <i class="fas fa-user-plus"></i> Add as Mate
                         </button>`;
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-clock"></i> Pending';
        (window.showToast || alert)('Could not cancel request: ' + (result.error || 'Unknown error'), 'error');
    }
}

async function handleAcceptMate(btn, userName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await acceptMateRequest(userName);
    if (result.success) {
        const container = btn.closest('div[style]') || btn.parentElement;
        container.outerHTML = `<button class="btn-mate-profile mate-status-mates" onclick="handleRemoveMate(this,'${userName.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-user-group"></i> You are now realmates!
                               </button>`;
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Accept';
    }
}

async function handleDeclineMate(btn, userName) {
    btn.disabled = true;
    const result = await declineMateRequest(userName);
    if (result.success) {
        const container = btn.closest('div[style]') || btn.parentElement;
        container.outerHTML = `<button class="btn-mate" onclick="handleAddMate(this,'${userName.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-user-plus"></i> Add as Mate
                               </button>`;
    } else {
        btn.disabled = false;
    }
}

// Init: load cache on page load
document.addEventListener('DOMContentLoaded', () => loadMatesCache());
