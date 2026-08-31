// follows.js — one-way follow system (like Instagram/Twitter)
// Run this SQL in Supabase once:
//
// create table follows (
//   id uuid default gen_random_uuid() primary key,
//   follower_id   uuid,
//   follower_name text,
//   following_id  uuid,
//   following_name text,
//   created_at timestamptz default now(),
//   unique (follower_id, following_id)
// );
// create index on follows(follower_id);
// create index on follows(following_id);

const _followsDb = (typeof _supabase !== 'undefined') ? _supabase
                 : supabase.createClient(
                     'https://wmegpgrfrtprhuzmgjma.supabase.co',
                     'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4'
                   );

function _followLocalUser() {
    return JSON.parse(localStorage.getItem('user')) || null;
}

// The four Admin-assigned positions are the only valid position values —
// anything else (legacy free text, empty) is treated as no position.
function _followsValidPosition(job) { return ''; }

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when generated, so
// trusting a stored one as-is after a rename shows stale initials forever.
// Regenerate fresh from the current name whenever there's no real upload.
function _followsAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;
}

// Inserts a notification, tolerating a database that hasn't run
// notifications-sender-id-migration.sql yet (adds sender_id/recipient_id) —
// an insert referencing a column that doesn't exist is rejected outright,
// not just that field, so without this a follow notification silently fails
// to be created at all on an unmigrated database.
async function _followsInsertNotification(payload) {
    const { error } = await _followsDb.from('notifications').insert(payload);
    if (!error) return;
    const isMissingColumn = error.code === '42703' || /recipient_id|sender_id/i.test(error.message || '');
    if (!isMissingColumn) { console.warn('[follows] notification insert failed:', error.message); return; }
    const { sender_id, recipient_id, ...fallback } = payload;
    const { error: fallbackError } = await _followsDb.from('notifications').insert(fallback);
    if (fallbackError) console.warn('[follows] notification fallback insert failed:', fallbackError.message);
}

// Returns { followers: N, following: N }
async function getFollowCounts(userId) {
    try {
        // Count only ACCEPTED relationships — a pending outgoing request is not a
        // "following", and a pending incoming request is not a "follower" yet.
        const [{ count: followers }, { count: following }] = await Promise.all([
            _followsDb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'accepted'),
            _followsDb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted')
        ]);
        return { followers: followers || 0, following: following || 0 };
    } catch { return { followers: 0, following: 0 }; }
}

// Returns [{id, name, img, job, division, group}] — direction: 'followers' (people who
// follow userId) or 'following' (people userId follows). Two-step fetch (relation rows,
// then a batch profiles lookup) mirrors the pattern already used in mates.js getMatesList().
async function _getFollowRelationList(userId, direction) {
    try {
        const col = direction === 'followers' ? 'following_id' : 'follower_id';
        const otherCol = direction === 'followers' ? 'follower_id' : 'following_id';
        const otherNameCol = direction === 'followers' ? 'follower_name' : 'following_name';

        const { data: rows, error } = await _followsDb
            .from('follows')
            .select(`${otherCol}, ${otherNameCol}`)
            .eq(col, userId)
            .eq('status', 'accepted');   // pending requests aren't followers/following yet
        if (error) throw error;
        if (!rows || rows.length === 0) return [];

        const ids = rows.map(r => r[otherCol]).filter(Boolean);
        if (ids.length === 0) return [];

        const { data: profiles, error: profErr } = await _followsDb
            .from('profiles')
            .select('id, full_name, avatar_url, job_title, division, business_group')
            .in('id', ids);
        if (profErr) throw profErr;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        return rows.map(r => {
            const id = r[otherCol];
            const p = profileMap[id] || {};
            return {
                id,
                name: p.full_name || r[otherNameCol] || 'realmate Member',
                img: _followsAvatarFor(p.full_name || r[otherNameCol], p.avatar_url),
                job: _followsValidPosition(p.job_title),
                division: p.division || '',
                group: p.business_group || ''
            };
        });
    } catch (e) {
        console.warn(`_getFollowRelationList(${direction}):`, e.message);
        return [];
    }
}

async function getFollowersList(userId) { return _getFollowRelationList(userId, 'followers'); }
async function getFollowingList(userId)  { return _getFollowRelationList(userId, 'following'); }

// Returns true if the current auth user follows targetUserId
async function isFollowing(targetUserId) {
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id;
        if (!myId) return false;
        const { count } = await _followsDb
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', myId)
            .eq('following_id', targetUserId);
        return (count || 0) > 0;
    } catch { return false; }
}

// The current viewer's follow relationship to targetUserId, distinguishing an
// ACCEPTED follow from a still-PENDING request awaiting the owner's approval:
//   'accepted' | 'pending' | 'none'
// This is what lets the follow button show "Requested" (not "Following") the
// instant you request to follow a Private account.
async function followState(targetUserId) {
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id;
        if (!myId) return 'none';
        const { data } = await _followsDb
            .from('follows')
            .select('status')
            .eq('follower_id', myId)
            .eq('following_id', targetUserId)
            .maybeSingle();
        if (!data) return 'none';
        return data.status === 'pending' ? 'pending' : 'accepted';
    } catch { return 'none'; }
}

// The FULL relationship between the current viewer and targetUserId, in BOTH
// directions, from a single query — required to choose the correct button:
//   outbound : my follow of them   -> 'accepted' | 'pending' | 'none'
//   inbound  : their follow of me  -> 'accepted' | 'pending' | 'none'
// "Follow Back" is outbound 'none' + inbound 'accepted' (they follow me but I
// don't follow them). Querying only one direction is what made Follow Back
// impossible — the button never knew the owner already follows the viewer.
async function followRelationship(targetUserId) {
    const out = { outbound: 'none', inbound: 'none', myId: null };
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id;
        out.myId = myId || null;
        if (!myId || String(myId) === String(targetUserId)) return out;
        const { data } = await _followsDb
            .from('follows')
            .select('follower_id, following_id, status')
            .or(`and(follower_id.eq.${myId},following_id.eq.${targetUserId}),` +
                `and(follower_id.eq.${targetUserId},following_id.eq.${myId})`);
        (data || []).forEach(r => {
            const st = r.status === 'pending' ? 'pending' : 'accepted';
            if (String(r.follower_id) === String(myId)) out.outbound = st;
            else out.inbound = st;
        });
    } catch (e) {}
    return out;
}

async function followUser(targetUserId, targetName) {
    try {
        const me = _followLocalUser();
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id;
        if (!myId) return { error: 'Not authenticated' };
        // Never follow yourself.
        if (String(myId) === String(targetUserId)) return { error: 'Cannot follow yourself' };

        // Approval is driven by the target's ACCOUNT privacy (the existing
        // Public/Private setting): a PUBLIC account (is_public) accepts a follow
        // immediately; a PRIVATE account (the default) requires the owner to
        // approve, so the follow stays PENDING and grants no access until then.
        // The separate "Public Following" toggle (public_follow) is also honored
        // as an explicit no-approval opt-in so that existing setting keeps working.
        let autoAccept = false;
        try {
            const { data: tp } = await _followsDb.from('profiles')
                .select('is_public, public_follow').eq('id', targetUserId).maybeSingle();
            autoAccept = !!(tp && (tp.is_public || tp.public_follow));
        } catch (e) {}
        let status = autoAccept ? 'accepted' : 'pending';
        const baseRow = {
            follower_id:    myId,
            follower_name:  me?.name || '',
            following_id:   targetUserId,
            following_name: targetName
        };

        let { error } = await _followsDb.from('follows').insert({ ...baseRow, status });
        // Graceful degradation: if follows.status hasn't been migrated yet
        // (privacy-following-migration.sql not run in Supabase), the insert fails
        // with "could not find the 'status' column ... in the schema cache". Retry
        // WITHOUT the column so following still works — treated as immediately
        // accepted until the migration enables the pending/approval flow.
        if (error && /status/i.test(error.message || '') &&
            /column|schema cache|does not exist|could not find/i.test(error.message || '')) {
            status = 'accepted';
            ({ error } = await _followsDb.from('follows').insert(baseRow));
        }
        if (error) throw error;

        const accepted = status === 'accepted';
        await _followsInsertNotification({
            type:                   accepted ? 'follow' : 'follow_request',
            sender_id:              myId,
            sender_user_name:       me?.name || '',
            sender_profile_picture: me?.image || '',
            recipient_id:           targetUserId,
            recipient_user_name:    targetName,
            message:                accepted ? 'started following you.' : 'requested to follow you.',
            is_read:                false,
            created_at:             new Date().toISOString()
        });

        return { success: true, status: status };
    } catch (e) {
        console.error('followUser:', e);
        return { error: e.message };
    }
}

// Owner-side: accept / reject a pending follow request (followerId → me).
async function acceptFollowRequest(followerId) {
    try {
        const me = _followLocalUser();
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id; if (!myId) return { error: 'Not authenticated' };
        const { error } = await _followsDb.from('follows')
            .update({ status: 'accepted' })
            .eq('follower_id', followerId).eq('following_id', myId);
        if (error) throw error;
        // Let the follower know they were accepted — they can now see my posts + About.
        await _followsInsertNotification({
            type:                   'follow_accepted',
            sender_id:              myId,
            sender_user_name:       me?.name || '',
            sender_profile_picture: me?.image || '',
            recipient_id:           followerId,
            recipient_user_name:    '',
            message:                'accepted your follow request — you can now see their posts & About.',
            is_read:                false,
            created_at:             new Date().toISOString()
        });
        return { success: true };
    } catch (e) { return { error: e.message }; }
}
async function rejectFollowRequest(followerId) {
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id; if (!myId) return { error: 'Not authenticated' };
        const { error } = await _followsDb.from('follows')
            .delete().eq('follower_id', followerId).eq('following_id', myId);
        if (error) throw error;
        return { success: true };
    } catch (e) { return { error: e.message }; }
}
// Pending follow requests addressed to me (for the requests inbox).
async function listFollowRequests() {
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id; if (!myId) return [];
        const { data } = await _followsDb.from('follows')
            .select('follower_id, follower_name, created_at')
            .eq('following_id', myId).eq('status', 'pending')
            .order('created_at', { ascending: false });
        return data || [];
    } catch (e) { return []; }
}

// Same as listFollowRequests() but enriched with each requester's avatar +
// display name, for the My Realmates "Requests In" cards. -> [{id,name,img,created_at}]
async function getIncomingFollowRequests() {
    try {
        const rows = await listFollowRequests();
        if (!rows.length) return [];
        const ids = rows.map(r => r.follower_id).filter(Boolean);
        const profMap = {};
        if (ids.length) {
            const { data: profs } = await _followsDb.from('profiles')
                .select('id, full_name, avatar_url').in('id', ids);
            (profs || []).forEach(p => { profMap[p.id] = p; });
        }
        return rows.map(r => {
            const p = profMap[r.follower_id] || {};
            const name = p.full_name || r.follower_name || 'realmate Member';
            return { id: r.follower_id, name, img: _followsAvatarFor(name, p.avatar_url), created_at: r.created_at };
        });
    } catch (e) { return []; }
}

async function unfollowUser(targetUserId) {
    try {
        const { data: auth } = await _followsDb.auth.getUser();
        const myId = auth?.user?.id;
        if (!myId) return { error: 'Not authenticated' };
        const { error } = await _followsDb.from('follows')
            .delete()
            .eq('follower_id', myId)
            .eq('following_id', targetUserId);
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('unfollowUser:', e);
        return { error: e.message };
    }
}

// ── Real-time relationship-button sync ──────────────────────────────────────
// Every follow button rendered on the page is registered here so ANY change to
// a relationship (my own action, another tab/iframe, or a live DB event from the
// other party) can re-render them all in place — no manual refresh. The
// 'rm:rel-changed' DOM event also lets dashboard-script re-gate the profile and
// re-sync the Realmate button.
var _rmFollowBtns = {};          // containerId -> { targetId, name }
var _rmRelArmed = false;

async function _rmRefreshFollowButtons() {
    for (const cid of Object.keys(_rmFollowBtns)) {
        if (!document.getElementById(cid)) { delete _rmFollowBtns[cid]; continue; }
        const info = _rmFollowBtns[cid];
        try { await renderFollowButton(cid, info.targetId, info.name); } catch (e) {}
    }
}

// Announce a follow/Realmate relationship change so every display updates live:
// this page's follow buttons re-render, same-document listeners (the profile
// gate + Realmate button) get a DOM event, and other tabs/iframes get a
// localStorage ping.
function _rmBroadcastRel(otherId) {
    // local:true — this is MY own action in THIS tab. My buttons already updated
    // in place and my view of the other profile can't change from my own follow,
    // so listeners can skip a full re-gate here (avoids self-flicker).
    try { window.dispatchEvent(new CustomEvent('rm:rel-changed', { detail: { userId: otherId || null, local: true } })); } catch (e) {}
    try { localStorage.setItem('rm_rel_changed', (otherId || '') + ':' + Date.now()); } catch (e) {}
    _rmRefreshFollowButtons();
}

// Arm cross-tab + live-DB listeners once. A change from another tab or another
// device (the other party accepting / removing) re-renders buttons and re-fires
// the DOM event so the profile can re-gate — without a refresh.
function _rmArmRel() {
    if (_rmRelArmed) return; _rmRelArmed = true;
    try {
        window.addEventListener('storage', function (e) {
            if (e.key !== 'rm_rel_changed') return;
            _rmRefreshFollowButtons();
            try { window.dispatchEvent(new CustomEvent('rm:rel-changed', { detail: { external: true } })); } catch (e2) {}
        });
    } catch (e) {}
    // Live DB: react to follows-table changes. Works when the table is in
    // Supabase's realtime publication; a harmless no-op otherwise (the in-app
    // broadcast above still covers same-session updates). Debounced.
    try {
        var t = null;
        _followsDb.channel('public:follows-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, function () {
                if (t) return;
                t = setTimeout(function () {
                    t = null; _rmRefreshFollowButtons();
                    try { window.dispatchEvent(new CustomEvent('rm:rel-changed', { detail: { external: true } })); } catch (e) {}
                }, 200);
            })
            .subscribe();
    } catch (e) {}
}

// The follow-button label from the two-direction relationship (rel = {outbound,
// inbound} from followRelationship):
//   outbound 'accepted'                  -> Following      (tap to unfollow)
//   outbound 'pending'                   -> Requested      (tap to withdraw)
//   outbound 'none' + inbound 'pending'  -> Accept Follow  (they requested me)
//   outbound 'none' + inbound 'accepted' -> Follow Back    (they already follow me)
//   otherwise                            -> Follow
// Follow and Follow Back run the SAME action (handleFollow); a Private target
// makes it a REQUEST ("Requested"), a Public target an immediate "Following"
// (decided in followUser). Only an ACCEPTED follow ever shows "Following".
function _followBtnHtml(rel, targetUserId, targetName, safeName) {
    if (rel.outbound === 'accepted') {
        return `<button class="btn-follow btn-follow-ing" data-target-name="${targetName}" onclick="handleUnfollow(this,'${targetUserId}')">
               <i class="fas fa-user-check"></i> Following
           </button>`;
    }
    if (rel.outbound === 'pending') {
        return `<button class="btn-follow btn-follow-requested" data-target-name="${targetName}" onclick="handleCancelRequest(this,'${targetUserId}')">
               <i class="fas fa-clock"></i> Requested
           </button>`;
    }
    // They have a PENDING request to follow ME → accept it right here (this is
    // what makes the button "Accept Follow" the instant they request to follow
    // you, instead of the wrong "Follow").
    if (rel.inbound === 'pending') {
        return `<button class="btn-follow btn-follow-accept" data-target-name="${targetName}" onclick="handleAcceptFollow(this,'${targetUserId}','${safeName}')">
               <i class="fas fa-user-check"></i> Accept Follow
           </button>`;
    }
    const label = (rel.inbound === 'accepted') ? 'Follow Back' : 'Follow';
    return `<button class="btn-follow" data-target-name="${targetName}" onclick="handleFollow(this,'${targetUserId}','${safeName}')">
               <i class="fas fa-user-plus"></i> ${label}
           </button>`;
}

// Renders a follow button for a given targetUserId + targetName. Reads BOTH
// follow directions so it can show Follow / Requested / Following / Follow Back.
async function renderFollowButton(containerId, targetUserId, targetName) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const { data: auth } = await _followsDb.auth.getUser();
    const myId = auth?.user?.id;
    if (!myId || myId === targetUserId) { el.innerHTML = ''; delete _rmFollowBtns[containerId]; return; }

    _rmFollowBtns[containerId] = { targetId: targetUserId, name: targetName };  // for live refresh
    _rmArmRel();
    const rel = await followRelationship(targetUserId);
    const safeName = targetName.replace(/'/g,"\\'");
    el.innerHTML = _followBtnHtml(rel, targetUserId, targetName, safeName);
}

async function handleFollow(btn, targetUserId, targetName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await followUser(targetUserId, targetName);
    if (result.success && result.status === 'pending') {
        // Private account: this is a REQUEST awaiting their approval — not a
        // follow yet. Show "Requested" (tap to withdraw) and do NOT bump the
        // follower count; the owner sees it in Notifications + My Realmates.
        btn.className = 'btn-follow btn-follow-requested';
        btn.innerHTML = '<i class="fas fa-clock"></i> Requested';
        btn.onclick = () => handleCancelRequest(btn, targetUserId);
        btn.disabled = false;
        (window.showToast || function () {})('Follow request sent — waiting for their approval.', 'success');
        _rmBroadcastRel(targetUserId);
    } else if (result.success) {
        btn.className = 'btn-follow btn-follow-ing';
        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
        btn.onclick = () => handleUnfollow(btn, targetUserId);
        btn.disabled = false;
        // Bump follower count display (only for an immediate/accepted follow)
        ['followersCount', 'followersCountHero'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = (parseInt(el.innerText) || 0) + 1;
        });
        _rmBroadcastRel(targetUserId);
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
        (window.showToast || alert)('Could not follow: ' + (result.error || 'Unknown error'), 'error');
    }
}

// Accept an INBOUND follow request (they requested to follow me). Flips the
// button straight to "Follow Back" IN PLACE — no refresh — then broadcasts so
// every other display of this relationship updates too.
async function handleAcceptFollow(btn, ownerId, ownerName) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = (typeof acceptFollowRequest === 'function')
        ? await acceptFollowRequest(ownerId) : { error: 'unavailable' };
    if (result && result.success) {
        // They now follow me (accepted); I don't follow them yet -> Follow Back.
        btn.className = 'btn-follow';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow Back';
        const name = btn.dataset.targetName || ownerName || '';
        btn.onclick = () => handleFollow(btn, ownerId, name);
        btn.disabled = false;
        (window.showToast || function () {})('Follow request accepted.', 'success');
        _rmBroadcastRel(ownerId);
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-check"></i> Accept Follow';
        (window.showToast || alert)('Could not accept: ' + ((result && result.error) || 'error'), 'error');
    }
}

// Withdraw a still-pending follow request (before the owner has accepted).
async function handleCancelRequest(btn, targetUserId) {
    const confirmed = (typeof showConfirmDialog === 'function')
        ? await showConfirmDialog({
            title: 'Cancel follow request?',
            message: 'Withdraw your pending follow request to this user?',
            confirmText: 'Withdraw',
            cancelText: 'Keep'
          })
        : confirm('Withdraw your pending follow request to this user?');
    if (!confirmed) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await unfollowUser(targetUserId);   // deletes the pending row
    if (result.success) {
        btn.className = 'btn-follow';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
        const name = btn.dataset.targetName || '';
        btn.onclick = () => handleFollow(btn, targetUserId, name);
        btn.disabled = false;
        _rmBroadcastRel(targetUserId);
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-clock"></i> Requested';
    }
}

async function handleUnfollow(btn, targetUserId) {
    // showConfirmDialog is defined in mates.js, which every page that loads
    // follows.js also loads (see script order in dashboard.html);
    // falling back to the native confirm() keeps this safe if that ever changes.
    const confirmed = (typeof showConfirmDialog === 'function')
        ? await showConfirmDialog({
            title: 'Unfollow User?',
            message: 'Are you sure you want to unfollow this user?',
            confirmText: 'Unfollow',
            cancelText: 'Cancel'
          })
        : confirm('Are you sure you want to unfollow this user?');
    if (!confirmed) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const result = await unfollowUser(targetUserId);
    if (result.success) {
        btn.className = 'btn-follow';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
        const name = btn.dataset.targetName || '';
        btn.onclick = () => handleFollow(btn, targetUserId, name);
        btn.disabled = false;
        ['followersCount', 'followersCountHero'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = Math.max(0, (parseInt(el.innerText) || 0) - 1);
        });
        _rmBroadcastRel(targetUserId);
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
    }
}
