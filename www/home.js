// ── Supabase ──────────────────────────────────────
const SUPABASE_URL = "https://wmegpgrfrtprhuzmgjma.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4";
const _supaHome = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// The four Admin-assigned positions are the only valid position values —
// anything else (legacy free text, empty) is treated as no position.
function _homeValidPosition(job) { return ''; }

// ── Current user ──────────────────────────────────
const isGuest = localStorage.getItem("isGuest") === "true";
function getUser() {
    return JSON.parse(localStorage.getItem("user")) || null;
}

// A ui-avatars.com URL is an auto-generated initials placeholder, not a real
// uploaded photo — it bakes in whatever name was current when it was
// generated, so trusting a stored one as-is after a rename shows stale
// initials forever. Regenerate fresh from the CURRENT name whenever there's
// no real upload; a genuine upload is always used as-is.
function _homeAvatarFor(name, storedUrl) {
    return (storedUrl && !storedUrl.includes('ui-avatars.com'))
        ? storedUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=0f172a&color=32cd32`;
}

// Inserts a notification, tolerating a database that hasn't run
// notifications-sender-id-migration.sql yet (adds sender_id/recipient_id) —
// an insert referencing a column that doesn't exist is rejected outright,
// not just that field, so without this every like/comment/reply/mention
// notification on the Feed silently fails to be created at all on an
// unmigrated database.
async function _homeInsertNotification(payload) {
    const { error } = await _supaHome.from('notifications').insert(payload);
    if (!error) return;
    const isMissingColumn = error.code === '42703' || /recipient_id|sender_id/i.test(error.message || '');
    if (!isMissingColumn) { console.warn('[home] notification insert failed:', error.message); return; }
    const { sender_id, recipient_id, ...fallback } = payload;
    const { error: fallbackError } = await _supaHome.from('notifications').insert(fallback);
    if (fallbackError) console.warn('[home] notification fallback insert failed:', fallbackError.message);
}

// Removes the 'post_like' notification this user previously created for a
// post — called whenever they remove OR switch their reaction, so the
// recipient's Notifications never keep a stale "reacted to your post" alert
// after the like it announced is gone. Prefers sender_id (rename-proof and
// unique per account) and falls back to the sender_user_name snapshot if
// that column doesn't exist on this DB yet (unmigrated) or no id is known —
// same id-first/name-fallback pattern used elsewhere for these rows.
async function _homeDeleteLikeNotification(postId, user) {
    const base = () => _supaHome.from('notifications').delete()
        .eq('type', 'post_like').eq('target_post_id', postId);
    if (user.id) {
        const { error } = await base().eq('sender_id', user.id);
        if (!error) return;
        const missingCol = error.code === '42703' || /sender_id/i.test(error.message || '');
        if (!missingCol) { console.warn('[home] like-notif delete failed:', error.message); return; }
    }
    const { error } = await base().eq('sender_user_name', user.name);
    if (error) console.warn('[home] like-notif delete (name) failed:', error.message);
}

// Overlays each row's user_name/user_img with that user's LIVE profile data
// (looked up by user_id), so a rename or avatar change shows up immediately
// instead of whatever was stored on the row when it was written. Rows that
// predate user_id being captured fall back to a name-based lookup — the
// same two-tier pattern forum-script.js already established for the forum
// page's posts/comments; this reuses it for the home feed, its comments,
// and stories. Mutates `rows` in place.
async function _resolveLiveAuthors(rows) {
    const live = (rows || []).filter(r => !r.is_anonymous);
    const uids  = [...new Set(live.filter(r => r.user_id).map(r => r.user_id))];
    const names = [...new Set(live.filter(r => !r.user_id && r.user_name).map(r => r.user_name))];
    if (!uids.length && !names.length) return;

    const byId = {}, byName = {};
    if (uids.length) {
        const { data } = await _supaHome.from('profiles').select('id,full_name,avatar_url').in('id', uids);
        (data || []).forEach(p => { byId[p.id] = p; });
    }
    if (names.length) {
        const { data } = await _supaHome.from('profiles').select('id,full_name,avatar_url').in('full_name', names);
        (data || []).forEach(p => { byName[p.full_name] = p; });
    }
    live.forEach(r => {
        const p = r.user_id ? byId[r.user_id] : byName[r.user_name];
        if (p) {
            const liveName = p.full_name || r.user_name;
            r.user_name = liveName;
            r.user_img  = _homeAvatarFor(liveName, p.avatar_url);
        }
    });
}

// ── Helpers ───────────────────────────────────────
function safeText(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function avatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=0f172a&color=32cd32`;
}

// ── Feed reactions (Phase 1) ──────────────────────
const REACTIONS = {
    like:       { emoji: '👍', label: 'Like',       color: '#2563eb', icon: 'fas fa-thumbs-up' },
    love:       { emoji: '❤️', label: 'Love',       color: '#e11d48', icon: 'fas fa-heart' },
    celebrate:  { emoji: '🎉', label: 'Celebrate',  color: '#16a34a', icon: 'fas fa-champagne-glasses' },
    insightful: { emoji: '💡', label: 'Insightful', color: '#f59e0b', icon: 'fas fa-lightbulb' },
    helpful:    { emoji: '🙌', label: 'Helpful',    color: '#8b5cf6', icon: 'fas fa-hands-clapping' },
    sad:        { emoji: '😢', label: 'Sad',        color: '#64748b', icon: 'fas fa-face-sad-tear' }
};
const REACTION_ORDER = ['like', 'love', 'celebrate', 'insightful', 'helpful', 'sad'];

const PRIVACY_LABELS = { public: 'Public', realmates: 'Realmates Only', private: 'Private' };

function updatePrivacyIcon() {
    const val = document.getElementById('homePostPrivacy')?.value || 'public';
    const icon = document.getElementById('privacyIcon');
    const label = document.getElementById('privacyLabel');
    if (icon) {
        icon.className = val === 'private' ? 'fas fa-lock'
                      : val === 'realmates' ? 'fas fa-user-group'
                      : 'fas fa-globe';
    }
    if (label) label.textContent = PRIVACY_LABELS[val] || 'Public';
}

function togglePrivacyMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('privacyMenu');
    const dd = document.getElementById('privacyDropdown');
    if (!menu) return;
    const opening = !menu.classList.contains('open');
    menu.classList.toggle('open', opening);
    if (opening) {
        const close = ev => {
            if (!dd.contains(ev.target)) { menu.classList.remove('open'); document.removeEventListener('click', close); }
        };
        setTimeout(() => document.addEventListener('click', close), 10);
    }
}

function selectPrivacy(val) {
    const input = document.getElementById('homePostPrivacy');
    if (input) input.value = val;
    updatePrivacyIcon();
    document.getElementById('privacyMenu')?.classList.remove('open');
}

function privacyBadge(privacy) {
    if (!privacy || privacy === 'public') return '';
    const cfg = privacy === 'private'
        ? { icon: 'fa-lock', label: 'Private' }
        : { icon: 'fa-user-group', label: 'Realmates' };
    return `<span class="hf-privacy-tag" title="${cfg.label}"><i class="fas ${cfg.icon}"></i></span>`;
}

function handleAuth() {
    localStorage.clear();
    localStorage.setItem("isGuest", "false");
    location.href = "index.html";
}

function initGuestUI() {
    if (!isGuest) return;
    const navPortfolio = document.getElementById("navPortfolio");
    const navMatches   = document.getElementById("navMatches");
    const authText     = document.getElementById("authText");
    if (navPortfolio) navPortfolio.style.display = "none";
    if (navMatches)   navMatches.style.display   = "none";
    if (authText)     authText.innerText          = "Login / Sign Up";
}

// ── Init user avatar in create post ──────────────
function initCreatePost() {
    const user = getUser();
    if (!user) return;
    // Personalized greeting, e.g. "What's on your mind, Chan?" (mockup style)
    const ph = document.getElementById('createPostPlaceholder');
    if (ph) {
        const first = (user.nickname || (user.name || '').split(' ')[0] || '').trim();
        ph.textContent = first ? `What's on your mind, ${first}?` : "What's on your mind?";
    }
    const el = document.getElementById('createPostAvatar');
    if (!el) return;
    // Don't just trust localStorage.user.image as-is: it's only refreshed on
    // a fresh login (auth-guard.js) or a dashboard.html visit, so an already
    // logged-in session with a stale cached placeholder wouldn't otherwise
    // self-correct here without one of those. Regenerating from the current
    // name at render time (always returns a real URL — a real upload as-is,
    // or a fresh ui-avatars.com placeholder) makes this heal immediately.
    el.style.background = `url('${_homeAvatarFor(user.name, user.image)}') center/cover no-repeat`;
    el.innerHTML = '';
}

// ══════════════════════════════════════════════════
//  STORIES
// ══════════════════════════════════════════════════

let _allStories = [];
let _storyViewerIdx = 0;
let _storyViewerTimer = null;

async function loadStories() {
    const strip = document.getElementById('storiesStrip');
    if (!strip) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stories, error } = await _supaHome
        .from('stories')
        .select('id, user_id, image_url, created_at, user_name, user_img')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false });

    if (error) {
        // stories table may not exist yet — hide the section silently
        document.getElementById('storiesWrap')?.style.setProperty('display', 'none');
        return;
    }

    _allStories = stories || [];
    await _resolveLiveAuthors(_allStories);

    // Group by user
    const byUser = new Map();
    _allStories.forEach(s => {
        if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
        byUser.get(s.user_id).push(s);
    });

    // Keep add-story button, rebuild the rest
    const addBtn = strip.querySelector('.story-add-btn');
    strip.innerHTML = '';
    if (addBtn) strip.appendChild(addBtn);

    const user = getUser();
    let storyIndex = 0;
    byUser.forEach((userStories, uid) => {
        const first = userStories[0];
        const name  = first.user_name || 'Member';
        const img   = first.user_img  || avatarUrl(name);
        const isMine = user && first.user_id === (user.supabaseId || uid);
        const card = document.createElement('div');
        card.className = 'story-card' + (isMine ? ' my-story' : '');
        card.dataset.storyIndex = storyIndex;
        card.innerHTML = `
            <div class="story-img-wrap">
                <img src="${first.image_url}" loading="lazy">
                <div class="story-ring"></div>
            </div>
            <div class="story-avatar-wrap">
                <img src="${img}" onerror="this.src='${avatarUrl(name)}'">
            </div>
            <span class="story-name">${safeText(name.split(' ')[0])}</span>
        `;
        card.addEventListener('click', () => openStoryViewer(storyIndex));
        strip.appendChild(card);
        storyIndex++;
    });
}

function openAddStory() {
    document.getElementById('storyModalOverlay').classList.add('open');
}

function closeAddStory(e) {
    if (e && e.target !== document.getElementById('storyModalOverlay')) return;
    document.getElementById('storyModalOverlay').classList.remove('open');
    document.getElementById('storyImageInput').value = '';
    document.getElementById('storyPreview').style.display = 'none';
    document.getElementById('storyPreview').src = '';
    document.getElementById('storyStatus').textContent = '';
    document.getElementById('storySubmitBtn').disabled = true;
    const area = document.getElementById('storyUploadArea');
    if (area) area.style.display = 'flex';
}

function previewStoryImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('storyPreview');
        preview.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById('storyUploadArea').style.display = 'none';
        document.getElementById('storySubmitBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function submitStory() {
    const btn    = document.getElementById('storySubmitBtn');
    const status = document.getElementById('storyStatus');
    const input  = document.getElementById('storyImageInput');
    const user   = getUser();

    if (!user || !input.files[0]) return;
    btn.disabled = true;
    status.textContent = 'Uploading…';

    try {
        const { data: authData } = await _supaHome.auth.getUser();
        const uid = authData?.user?.id;

        const file = input.files[0];
        const path = `stories/${uid || 'anon'}_${Date.now()}.${file.name.split('.').pop()}`;
        const { error: uploadErr } = await _supaHome.storage.from('images').upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const imageUrl = _supaHome.storage.from('images').getPublicUrl(path).data.publicUrl;

        const { error: insertErr } = await _supaHome.from('stories').insert({
            user_id:   uid,
            user_name: user.name,
            user_img:  user.image || '',
            image_url: imageUrl
        });
        if (insertErr) throw insertErr;

        status.textContent = '✅ Story shared!';
        setTimeout(() => { closeAddStory(); loadStories(); }, 800);
    } catch (err) {
        status.textContent = '❌ ' + (err.message || 'Upload failed');
        btn.disabled = false;
    }
}

function openStoryViewer(groupIndex) {
    const groups = [...document.querySelectorAll('.story-card')];
    if (!groups.length) return;
    _storyViewerIdx = groupIndex;
    renderStoryViewer();
    document.getElementById('storyViewerOverlay').classList.add('open');
    startStoryTimer();
}

function renderStoryViewer() {
    const cards = [...document.querySelectorAll('.story-card')];
    const card  = cards[_storyViewerIdx];
    if (!card) return;
    const idx   = parseInt(card.dataset.storyIndex);
    const img   = card.querySelector('.story-img-wrap img')?.src || '';
    const name  = card.querySelector('.story-name')?.textContent || '';
    const avatarSrc = card.querySelector('.story-avatar-wrap img')?.src || '';

    document.getElementById('storyViewerImg').src = img;
    document.getElementById('storyViewerUser').innerHTML = `
        <img src="${avatarSrc}">
        <div>
            <strong>${safeText(name)}</strong>
            <small>${timeAgo((_allStories[idx] || {}).created_at)}</small>
        </div>
    `;

    const total = cards.length;
    document.getElementById('storyViewerProgress').innerHTML = Array.from({ length: total }, (_, i) =>
        `<div class="sv-prog-bar${i === _storyViewerIdx ? ' active' : (i < _storyViewerIdx ? ' done' : '')}"></div>`
    ).join('');

    document.getElementById('storyNavPrev').style.display = _storyViewerIdx > 0 ? 'flex' : 'none';
    document.getElementById('storyNavNext').style.display = _storyViewerIdx < total - 1 ? 'flex' : 'none';
}

function navigateStory(dir) {
    clearTimeout(_storyViewerTimer);
    const total = document.querySelectorAll('.story-card').length;
    _storyViewerIdx = Math.max(0, Math.min(total - 1, _storyViewerIdx + dir));
    renderStoryViewer();
    startStoryTimer();
}

function startStoryTimer() {
    clearTimeout(_storyViewerTimer);
    _storyViewerTimer = setTimeout(() => {
        const total = document.querySelectorAll('.story-card').length;
        if (_storyViewerIdx < total - 1) navigateStory(1);
        else closeStoryViewer();
    }, 5000);
}

function closeStoryViewer() {
    clearTimeout(_storyViewerTimer);
    document.getElementById('storyViewerOverlay').classList.remove('open');
}

// ══════════════════════════════════════════════════
//  CREATE POST
// ══════════════════════════════════════════════════

let _homePostFiles = [];

let _homePostType = '';

const _postTypeConfig = {
    achievement: {
        subject: 'Achievement',
        placeholder: 'Share your win — closed a deal, hit a target, earned recognition…',
        badge: '<i class="fas fa-trophy" style="color:#f59e0b;margin-right:6px;"></i> Achievement Post',
        badgeBg: '#fffbeb',
        badgeBorder: '#fde68a',
        badgeColor: '#92400e'
    },
    thought: {
        subject: 'Thought',
        placeholder: 'Share an insight, opinion, or industry observation…',
        badge: '<i class="fas fa-lightbulb" style="color:#6366f1;margin-right:6px;"></i> Thought Post',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        badgeColor: '#3730a3'
    },
    poll: {
        subject: 'Poll',
        placeholder: 'Ask a question for your poll…',
        badge: '<i class="fas fa-square-poll-vertical" style="color:#8b5cf6;margin-right:6px;"></i> Poll',
        badgeBg: '#f5f3ff',
        badgeBorder: '#ddd6fe',
        badgeColor: '#6d28d9'
    },
    question: {
        subject: 'Question',
        placeholder: 'Ask the community a question…',
        badge: '<i class="fas fa-circle-question" style="color:#0ea5e9;margin-right:6px;"></i> Question',
        badgeBg: '#ecfeff',
        badgeBorder: '#a5f3fc',
        badgeColor: '#0e7490'
    },
    album: {
        subject: 'Album',
        placeholder: 'Describe your album…',
        badge: '<i class="fas fa-images" style="color:#0ea5e9;margin-right:6px;"></i> Photo Album',
        badgeBg: '#eff6ff',
        badgeBorder: '#bfdbfe',
        badgeColor: '#1d4ed8'
    }
};

// ── Poll builder state ────────────────────────────
let _pollOptions = ['', ''];

function syncPollOptions() {
    document.querySelectorAll('#hpbOptions input').forEach((inp, i) => { _pollOptions[i] = inp.value; });
}

function renderPollOptions() {
    const wrap = document.getElementById('hpbOptions');
    if (!wrap) return;
    wrap.innerHTML = _pollOptions.map((v, i) => `
        <div class="hpb-option">
            <input type="text" maxlength="80" placeholder="Option ${i + 1}" value="${(v || '').replace(/"/g, '&quot;')}">
            ${_pollOptions.length > 2 ? `<button type="button" class="hpb-remove" onclick="removePollOption(${i})"><i class="fas fa-times"></i></button>` : ''}
        </div>`).join('');
}

function addPollOption() {
    syncPollOptions();
    if (_pollOptions.length >= 6) return;
    _pollOptions.push('');
    renderPollOptions();
}

function removePollOption(i) {
    syncPollOptions();
    if (_pollOptions.length <= 2) return;
    _pollOptions.splice(i, 1);
    renderPollOptions();
}

function expandCreatePost(type) {
    _homePostType = type || '';
    const textarea = document.getElementById('homePostText');
    const badge = document.getElementById('postTypeBadge');
    const cfg = _postTypeConfig[_homePostType];

    if (cfg) {
        textarea.placeholder = cfg.placeholder;
        badge.innerHTML = `<span style="display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:5px 12px;border-radius:50px;background:${cfg.badgeBg};border:1px solid ${cfg.badgeBorder};color:${cfg.badgeColor};">${cfg.badge}</span>`;
        badge.style.display = 'block';
    } else {
        textarea.placeholder = "What's on your mind?";
        badge.style.display = 'none';
    }

    if (type === 'photo') {
        document.getElementById('homePostMedia')?.click();
    }

    document.querySelector('.create-post-top').style.display = 'none';
    document.querySelector('.create-post-shortcuts').style.display = 'none';
    document.getElementById('createPostExpanded').style.display = 'block';
    syncTypeButtons();
    togglePollBuilder();
    textarea.focus();
}

function setPostType(type) {
    _homePostType = (_homePostType === type) ? '' : type;
    const textarea = document.getElementById('homePostText');
    const badge = document.getElementById('postTypeBadge');
    const cfg = _postTypeConfig[_homePostType];
    if (cfg) {
        textarea.placeholder = cfg.placeholder;
        badge.innerHTML = `<span style="display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:5px 12px;border-radius:50px;background:${cfg.badgeBg};border:1px solid ${cfg.badgeBorder};color:${cfg.badgeColor};">${cfg.badge} <i class="fas fa-times" style="margin-left:8px;font-size:10px;cursor:pointer;opacity:0.6;" onclick="setPostType('${_homePostType}')"></i></span>`;
        badge.style.display = 'block';
    } else {
        textarea.placeholder = "What's on your mind?";
        badge.style.display = 'none';
    }
    syncTypeButtons();
    togglePollBuilder();
    if (_homePostType === 'album' && !_homePostFiles.length) {
        document.getElementById('homePostMedia')?.click();
    }
    textarea.focus();
}

function syncTypeButtons() {
    document.getElementById('typeBtnPoll')?.classList.toggle('active', _homePostType === 'poll');
    document.getElementById('typeBtnQuestion')?.classList.toggle('active', _homePostType === 'question');
    document.getElementById('typeBtnAlbum')?.classList.toggle('active', _homePostType === 'album');
}

function togglePollBuilder() {
    const builder = document.getElementById('homePollBuilder');
    if (builder) {
        if (_homePostType === 'poll') {
            if (builder.style.display === 'none') {
                _pollOptions = ['', ''];
                renderPollOptions();
            }
            builder.style.display = 'block';
        } else {
            builder.style.display = 'none';
        }
    }
    // Album title field follows the same show/hide logic
    const albumTitle = document.getElementById('homeAlbumTitle');
    if (albumTitle) albumTitle.style.display = _homePostType === 'album' ? 'block' : 'none';
}

function collapseCreatePost() {
    _homePostType = '';
    document.getElementById('createPostExpanded').style.display = 'none';
    document.getElementById('postTypeBadge').style.display = 'none';
    document.querySelector('.create-post-top').style.display = '';
    document.querySelector('.create-post-shortcuts').style.display = '';
    document.getElementById('homePostText').value = '';
    document.getElementById('homePostMediaPreview').innerHTML = '';
    _homePostTags = new Set();
    hideHomePostMention();
    _homePostFiles = [];
    _pollOptions = ['', ''];
    const builder = document.getElementById('homePollBuilder');
    if (builder) builder.style.display = 'none';
    const albumTitle = document.getElementById('homeAlbumTitle');
    if (albumTitle) { albumTitle.value = ''; albumTitle.style.display = 'none'; }
    const priv = document.getElementById('homePostPrivacy');
    if (priv) priv.value = 'public';
    updatePrivacyIcon();
    syncTypeButtons();
}

// ── Hashtags ──────────────────────────────────────
// Extract unique lowercased #tags from post text
function extractHashtags(text) {
    const tags = [];
    (text.match(/#([\p{L}0-9_]{2,40})/gu) || []).forEach(m => {
        const t = m.slice(1).toLowerCase();
        if (!tags.includes(t)) tags.push(t);
    });
    return tags;
}

// Render text with clickable #hashtags and @mentions
function linkifyContent(text) {
    let html = safeText(text);
    html = html.replace(/#([\p{L}0-9_]{2,40})/gu,
        (m, tag) => `<a class="hf-hashtag" onclick="filterByHashtag('${tag.toLowerCase()}')">#${tag}</a>`);
    // @mentions — capture multi-word capitalized names (e.g. "@Mark Zuckerberg")
    html = html.replace(/@(\p{L}[\p{L}0-9_]*(?:\s\p{Lu}[\p{L}0-9_]*){0,3})/gu,
        (m, name) => `<a class="hf-mention" onclick="mentionSearch('${name.trim().replace(/'/g, "\\'")}')">@${name}</a>`);
    return html;
}

function mentionSearch(name) {
    const input = document.getElementById('homeSearchInput');
    if (input) { input.value = name; onHomeSearch(name); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

// ══════════════════════════════════════════════════
//  TAG REALMATES IN A POST (composer @-autocomplete)
// ══════════════════════════════════════════════════
let _myRealmates = null;        // cached accepted realmates [{name,img}]
let _homePostTags = new Set();  // names the user picked from the tag dropdown
let _homeTagTimer = null;

async function getMyRealmates() {
    if (_myRealmates) return _myRealmates;
    const me = getUser();
    if (!me) return [];
    try {
        const [a, b] = await Promise.all([
            _supaHome.from('mates').select('recipient_id, recipient_name, recipient_img').eq('requester_name', me.name).eq('status', 'accepted'),
            _supaHome.from('mates').select('requester_id, requester_name, requester_img').eq('recipient_name', me.name).eq('status', 'accepted')
        ]);
        const list = [];
        (a.data || []).forEach(r => r.recipient_name && list.push({ id: r.recipient_id, name: r.recipient_name, img: r.recipient_img || '' }));
        (b.data || []).forEach(r => r.requester_name && list.push({ id: r.requester_id, name: r.requester_name, img: r.requester_img || '' }));
        const seen = new Set();
        let unique = list.filter(x => x.name && !seen.has(x.id || x.name) && seen.add(x.id || x.name));

        // Refresh name/avatar from the live profile — otherwise a renamed
        // Realmate keeps showing up in mention suggestions under whatever
        // name was snapshotted when the connection was made (same class of
        // bug already fixed for the Realmates list itself in mates.js's
        // getMatesList()).
        const ids = unique.filter(x => x.id).map(x => x.id);
        if (ids.length) {
            const { data: profiles } = await _supaHome.from('profiles').select('id, full_name, avatar_url').in('id', ids);
            const map = {};
            (profiles || []).forEach(p => { map[p.id] = p; });
            unique = unique.map(x => {
                const p = x.id ? map[x.id] : null;
                if (!p) return x;
                const liveName = p.full_name || x.name;
                return { id: x.id, name: liveName, img: _homeAvatarFor(liveName, p.avatar_url) };
            });
        }
        _myRealmates = unique;
    } catch { _myRealmates = []; }
    return _myRealmates;
}

async function fetchTagCandidates(q) {
    const ql = q.toLowerCase();
    const mates = await getMyRealmates();
    if (mates.length) {
        return mates.filter(m => m.name.toLowerCase().includes(ql)).slice(0, 6)
                    .map(m => ({ name: m.name, img: m.img || avatarUrl(m.name) }));
    }
    // Fallback (no realmates available): search all profiles, like comment mentions
    const { data } = await _supaHome.from('profiles')
        .select('full_name, avatar_url').ilike('full_name', `%${q}%`).limit(6);
    return (data || []).map(p => ({ name: p.full_name, img: p.avatar_url || avatarUrl(p.full_name) }));
}

function onHomePostInput(ta) {
    const m = ta.value.slice(0, ta.selectionStart).match(/@([\p{L}0-9_. ]{0,30})$/u);
    if (!m) { hideHomePostMention(); return; }
    const q = m[1].trim();
    clearTimeout(_homeTagTimer);
    if (q.length < 1) { hideHomePostMention(); return; }
    _homeTagTimer = setTimeout(async () => {
        const cands = await fetchTagCandidates(q);
        const box = document.getElementById('homePostMention');
        if (!box || !cands.length) { hideHomePostMention(); return; }
        box.innerHTML = cands.map(c =>
            `<div class="hf-mention-item" onclick="pickHomePostTag('${c.name.replace(/'/g, "\\'")}')">
                <img src="${c.img}"><span>${safeText(c.name)}</span></div>`).join('');
        box.style.display = 'block';
    }, 200);
}

function pickHomePostTag(name) {
    const ta = document.getElementById('homePostText');
    if (ta) {
        const pos = ta.selectionStart;
        const before = ta.value.slice(0, pos).replace(/@([\p{L}0-9_. ]{0,30})$/u, `@${name} `);
        ta.value = before + ta.value.slice(pos);
        ta.selectionStart = ta.selectionEnd = before.length;
        _homePostTags.add(name);
    }
    hideHomePostMention();
    ta?.focus();
}

function hideHomePostMention() {
    const box = document.getElementById('homePostMention');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function previewHomeMedia(input) {
    _homePostFiles = Array.from(input.files);
    const preview = document.getElementById('homePostMediaPreview');
    preview.innerHTML = '';
    _homePostFiles.forEach((file, i) => {
        const isVideo = file.type.startsWith('video/');
        const el = document.createElement('div');
        el.className = 'home-post-thumb';
        if (isVideo) {
            const url = URL.createObjectURL(file);
            el.innerHTML = `<video src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"></video>
                <button class="home-thumb-remove" onclick="removeHomeMedia(${i})"><i class="fas fa-times"></i></button>`;
        } else {
            const reader = new FileReader();
            reader.onload = e => {
                el.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
                    <button class="home-thumb-remove" onclick="removeHomeMedia(${i})"><i class="fas fa-times"></i></button>`;
            };
            reader.readAsDataURL(file);
        }
        preview.appendChild(el);
    });
}

function removeHomeMedia(i) {
    _homePostFiles.splice(i, 1);
    const dt = new DataTransfer();
    _homePostFiles.forEach(f => dt.items.add(f));
    document.getElementById('homePostMedia').files = dt.files;
    previewHomeMedia(document.getElementById('homePostMedia'));
}

async function submitHomePost() {
    const text = document.getElementById('homePostText').value.trim();
    const isPoll = _homePostType === 'poll';

    // Validate polls before touching the network
    let poll = null;
    if (isPoll) {
        syncPollOptions();
        const opts = _pollOptions.map(s => (s || '').trim()).filter(Boolean);
        if (!text) { (window.showToast || alert)('Add a question for your poll.', 'error'); return; }
        if (opts.length < 2) { (window.showToast || alert)('A poll needs at least 2 options.', 'error'); return; }
        poll = { options: opts.map((t, i) => ({ id: 'o' + i, text: t })), allow_multiple: false };
    } else if (!text && !_homePostFiles.length) {
        return;
    }

    const user = getUser();
    if (!user) return;

    const submitBtn = document.querySelector('.create-post-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const { data: authData } = await _supaHome.auth.getUser();
        let imageUrls = [], videoUrl = null;

        for (const file of _homePostFiles) {
            const isVideo = file.type.startsWith('video/');
            const path = `posts/${Date.now()}_${file.name}`;
            const { error } = await _supaHome.storage.from('images').upload(path, file, { upsert: true });
            if (error) throw error;
            const url = _supaHome.storage.from('images').getPublicUrl(path).data.publicUrl;
            if (isVideo) videoUrl = url;
            else imageUrls.push(url);
        }

        const postSubject = _postTypeConfig[_homePostType]?.subject || '';
        const privacy = document.getElementById('homePostPrivacy')?.value || 'public';
        const isAlbum = _homePostType === 'album';
        const albumTitle = isAlbum ? (document.getElementById('homeAlbumTitle')?.value.trim() || 'Album') : null;

        // Resolve the structured post_type column
        let post_type = 'text';
        if (isPoll) post_type = 'poll';
        else if (_homePostType === 'question') post_type = 'question';
        else if (isAlbum) post_type = 'album';
        else if (videoUrl) post_type = 'video';
        else if (imageUrls.length) post_type = 'photo';

        const { data: newPost, error: insertErr } = await _supaHome.from('forum_posts').insert({
            user_id:   authData?.user?.id,
            user_name: user.name,
            user_img:  user.image || '',
            subject:   postSubject,
            content:   text,
            media_url: videoUrl || imageUrls[0] || null,
            media_type: videoUrl ? 'video' : (imageUrls[0] ? 'image' : null),
            media_urls: imageUrls,
            post_type,
            privacy,
            poll,
            hashtags:  extractHashtags(text),
            album_title: albumTitle,
            is_anonymous: false,
            source: 'home'
        }).select('id').single();
        if (insertErr) throw insertErr;

        // Notify tagged realmates (only those still present in the text)
        try {
            const recipients = [...new Set([..._homePostTags]
                .filter(n => n && n !== user.name && text.includes('@' + n)))];
            if (recipients.length && newPost?.id) {
                const { data: recipientProfiles } = await _supaHome.from('profiles').select('id,full_name').in('full_name', recipients);
                const recipientIdByName = {};
                (recipientProfiles || []).forEach(p => { recipientIdByName[p.full_name] = p.id; });
                await Promise.all(recipients.map(name => _homeInsertNotification({
                    recipient_id: recipientIdByName[name] || null,
                    recipient_user_name: name,
                    sender_id: user.id || null,
                    sender_user_name: user.name,
                    sender_profile_picture: user.image || '',
                    type: 'mention',
                    target_post_id: newPost.id,
                    message: 'tagged you in a post.',
                    is_read: false
                })));
            }
        } catch (e) { console.warn('tag notify failed:', e); }

        collapseCreatePost();
        loadHomeFeed();
        // Refresh the profile wall too (dashboard), if present
        const _pw = document.getElementById('profileWall');
        if (_pw && authData?.user?.id) loadHomeFeed(_pw, { type: 'userId', value: authData.user.id });
    } catch (err) {
        (window.showToast || alert)('Failed to post: ' + (err.message || 'Unknown error'), 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
    }
}

// ══════════════════════════════════════════════════
//  HOME FEED (from forum_posts)
// ══════════════════════════════════════════════════

let _homePosts = [];
let _feedFilter = { type: 'all', value: null };
let _sharedOriginals = {};
let _savedSet = new Set();
const FEED_COLS = 'id, user_id, user_name, user_img, subject, content, media_url, media_type, media_urls, post_type, privacy, poll, hashtags, shared_post_id, album_title, topic, created_at, is_anonymous';

async function loadHomeFeed(feedEl, filterArg, silent) {
    const feed = feedEl || document.getElementById('homeFeed');
    if (!feed) return;
    const filter = filterArg || _feedFilter;
    // Silent refresh (pull-to-refresh): keep the current posts on screen while
    // fetching, instead of collapsing the feed to a spinner. Collapsing shrank
    // the page so the Trending / Suggested Realmates sidebar scrolled up into
    // view for a moment before the new posts rendered — this avoids that flash.
    if (!silent) feed.innerHTML = `<div class="hf-loading"><i class="fas fa-spinner fa-spin"></i> Loading feed…</div>`;

    const user = getUser();

    try {
        let query = _supaHome.from('forum_posts').select(FEED_COLS).eq('source', 'home');

        // Apply the active feed filter
        let savedIds = null;
        if (filter.type === 'saved') {
            const { data: saved } = await _supaHome.from('saved_posts')
                .select('post_id').eq('user_name', user?.name || '');
            savedIds = (saved || []).map(s => s.post_id);
            if (!savedIds.length) {
                feed.innerHTML = `<div class="hf-empty"><i class="fas fa-bookmark"></i><p>No saved posts yet. Tap the bookmark on any post to save it.</p></div>`;
                return;
            }
            query = query.in('id', savedIds);
        } else if (filter.type === 'hashtag') {
            query = query.contains('hashtags', [filter.value]);
        } else if (filter.type === 'topic') {
            query = query.eq('topic', filter.value);
        } else if (filter.type === 'user') {
            query = query.eq('user_name', filter.value);
        } else if (filter.type === 'userId') {
            query = query.eq('user_id', filter.value);
        }

        const { data: posts, error } = await query
            .order('created_at', { ascending: false })
            .limit(40);

        if (error) throw error;

        // Privacy: hide other members' Private posts (full enforcement lands in Phase 3)
        const _viewer = user;
        _homePosts = (posts || []).filter(p =>
            p.privacy !== 'private' ||
            (_viewer && (p.user_name === _viewer.name || p.user_id === _viewer.supabaseId))
        ).filter(p => !(window.RMBR && (RMBR.isBlocked(p.user_id, p.user_name) || RMBR.isPostBlocked('post', p.id))));
        if (!_homePosts.length) {
            feed.innerHTML = `<div class="hf-empty">
                <i class="fas fa-newspaper"></i>
                <p>${filter.type === 'all' ? 'No posts yet. Be the first to share something!' : ((filter.type === 'user' || filter.type === 'userId') ? 'No posts yet.' : 'Nothing here yet.')}</p>
            </div>`;
            return;
        }

        await _resolveLiveAuthors(_homePosts);

        const postIds = _homePosts.map(p => p.id);

        // Fetch the originals for any shared posts
        _sharedOriginals = {};
        const sharedIds = _homePosts.map(p => p.shared_post_id).filter(Boolean);
        if (sharedIds.length) {
            const { data: originals } = await _supaHome.from('forum_posts').select(FEED_COLS).in('id', sharedIds);
            await _resolveLiveAuthors(originals);
            (originals || []).forEach(o => { _sharedOriginals[o.id] = o; });
        }

        // Count how many times each visible post has been shared
        const shareMap = {};
        const { data: shareRows } = await _supaHome.from('forum_posts')
            .select('shared_post_id').in('shared_post_id', postIds);
        (shareRows || []).forEach(r => { if (r.shared_post_id) shareMap[r.shared_post_id] = (shareMap[r.shared_post_id] || 0) + 1; });

        // Which posts has the current user saved?
        _savedSet = new Set();
        if (savedIds) {
            savedIds.forEach(id => _savedSet.add(id));
        } else if (user) {
            const { data: saved } = await _supaHome.from('saved_posts')
                .select('post_id').eq('user_name', user.name).in('post_id', postIds);
            (saved || []).forEach(s => _savedSet.add(s.post_id));
        }

        // Load reactions (grouped by type) & the current user's reaction per post

        const { data: reactions } = await _supaHome
            .from('forum_likes')
            .select('post_id, user_name, reaction')
            .in('post_id', postIds);

        const reactMap = {};     // postId -> { like: n, love: n, ... }
        const userReactMap = {}; // postId -> reaction type
        (reactions || []).forEach(r => {
            const rt = REACTIONS[r.reaction] ? r.reaction : 'like';
            reactMap[r.post_id] = reactMap[r.post_id] || {};
            reactMap[r.post_id][rt] = (reactMap[r.post_id][rt] || 0) + 1;
            if (user && r.user_name === user.name) userReactMap[r.post_id] = rt;
        });

        // Load comment counts
        const { data: comments } = await _supaHome
            .from('forum_comments')
            .select('post_id')
            .in('post_id', postIds);

        const commentMap = {};
        (comments || []).forEach(c => { commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1; });

        // Load poll votes for poll posts
        const pollVoteMap = {}; // postId -> { counts:{optId:n}, total, userVote }
        const pollIds = _homePosts.filter(p => p.poll).map(p => p.id);
        if (pollIds.length) {
            const { data: votes } = await _supaHome
                .from('forum_poll_votes')
                .select('post_id, option_id, user_name')
                .in('post_id', pollIds);
            (votes || []).forEach(v => {
                const m = pollVoteMap[v.post_id] || (pollVoteMap[v.post_id] = { counts: {}, total: 0, userVote: null });
                m.counts[v.option_id] = (m.counts[v.option_id] || 0) + 1;
                m.total++;
                if (user && v.user_name === user.name) m.userVote = v.option_id;
            });
        }

        feed.innerHTML = '';
        _homePosts.forEach(post => {
            const card = buildHomePostCard(post, {
                reactCounts:  reactMap[post.id] || {},
                userReaction: userReactMap[post.id] || null,
                commentCount: commentMap[post.id] || 0,
                shareCount:   shareMap[post.id] || 0,
                pollData:     pollVoteMap[post.id] || null
            });
            feed.appendChild(card);
        });

        // Deep link from notification
        const targetPostId = localStorage.getItem('route_target_post_id');
        const targetAnchorId = localStorage.getItem('route_target_anchor_id');
        if (targetPostId) {
            localStorage.removeItem('route_target_post_id');
            localStorage.removeItem('route_target_anchor_id');
            const postEl = document.getElementById(`hfpost-${targetPostId}`);
            if (postEl) {
                // Open comments section
                const commSection = document.getElementById(`hfcomments-${targetPostId}`);
                if (commSection && commSection.style.display === 'none') {
                    commSection.style.display = 'block';
                    initCommentAvatar(parseInt(targetPostId));
                    await loadHomeComments(parseInt(targetPostId));
                }
                setTimeout(() => {
                    const scrollTarget = targetAnchorId ? document.getElementById(targetAnchorId) : postEl;
                    if (scrollTarget) {
                        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        scrollTarget.style.transition = 'all 0.5s ease-in-out';
                        scrollTarget.style.boxShadow = '0 0 0 4px #32cd32';
                        scrollTarget.style.backgroundColor = 'rgba(50, 205, 50, 0.05)';
                        setTimeout(() => {
                            scrollTarget.style.boxShadow = '';
                            scrollTarget.style.backgroundColor = '';
                        }, 3000);
                    }
                }, 300);
            }
        }

    } catch (err) {
        console.error('Home feed error:', err);
        feed.innerHTML = `<div class="hf-empty">
            <i class="fas fa-circle-exclamation" style="color:#ef4444;"></i>
            <p>Could not load feed. Please refresh.</p>
        </div>`;
    }
}

function buildHomePostCard(post, stats) {
    stats = stats || {};
    const reactCounts  = stats.reactCounts || {};
    const userReaction = stats.userReaction || null;
    const commentCount = stats.commentCount || 0;
    const shareCount   = stats.shareCount || 0;

    const user    = getUser();
    const isAnon  = post.is_anonymous;
    const name    = isAnon ? 'Anonymous' : (post.user_name || 'Realmate Member');
    const img     = isAnon ? avatarUrl('Anon') : (post.user_img || avatarUrl(name));
    const isOwn   = user && (post.user_name === user.name || post.user_id === user.supabaseId);

    const mediaHtml = buildPostMedia(post);
    const pollHtml  = buildPollHtml(post, stats.pollData);
    const cur       = userReaction ? REACTIONS[userReaction] : null;
    const isSaved   = _savedSet.has(post.id);
    const sharedOrig = post.shared_post_id ? _sharedOriginals[post.shared_post_id] : null;
    const albumHtml = (post.post_type === 'album' && post.album_title)
        ? `<div class="hf-album-title"><i class="fas fa-images"></i> ${safeText(post.album_title)}</div>` : '';

    const card = document.createElement('div');
    card.className = 'hf-post-card';
    card.id = `hfpost-${post.id}`;
    card.innerHTML = `
        <div class="hf-post-header">
            <img class="hf-post-avatar" src="${img}" onerror="this.src='${avatarUrl(name)}'"${!isAnon && post.user_id ? ` style="cursor:pointer;" onclick="location.href='dashboard.html?user_id=${post.user_id}'"` : ''}>
            <div class="hf-post-meta">
                <div class="hf-post-name"${!isAnon && post.user_id ? ` style="cursor:pointer;" onclick="location.href='dashboard.html?user_id=${post.user_id}'"` : ''}>${safeText(name)}${post.shared_post_id ? ' <span class="hf-shared-tag"><i class="fas fa-share"></i> shared a post</span>' : ''}</div>
                <div class="hf-post-time">${timeAgo(post.created_at)} ${privacyBadge(post.privacy)}</div>
            </div>
            <button class="hf-post-menu-btn" onclick="togglePostMenu('${post.id}')"><i class="fas fa-ellipsis-h"></i></button>
            <div class="hf-post-menu" id="hfmenu-${post.id}" style="display:none;">
                <div onclick="toggleSave('${post.id}')"><i class="fas fa-bookmark"></i> ${isSaved ? 'Unsave' : 'Save'} post</div>
                ${!isOwn ? `<div onclick="rmbrReportPost('${post.id}')"><i class="fas fa-flag"></i> Report post</div>` : ''}
                ${!isOwn ? `<div onclick="rmbrHidePost('${post.id}')"><i class="fas fa-eye-slash"></i> Block post</div>` : ''}
                ${!isOwn ? `<div class="hf-menu-danger" onclick="rmbrBlockUserFromPost('${post.id}')"><i class="fas fa-ban"></i> Block user</div>` : ''}
                ${isOwn ? `<div onclick="pinPost('${post.id}')"><i class="fas fa-thumbtack"></i> Pin to profile</div>` : ''}
                ${isOwn ? `<div class="hf-menu-danger" onclick="deleteHomePost('${post.id}')"><i class="fas fa-trash"></i> Delete</div>` : ''}
            </div>
        </div>
        ${subjectBadge(post.subject)}
        ${albumHtml}
        ${post.content ? `<div class="hf-post-text">${linkifyContent(post.content)}</div>` : ''}
        ${pollHtml}
        ${mediaHtml}
        ${sharedOrig ? buildSharedEmbed(sharedOrig) : (post.shared_post_id ? `<div class="hf-shared-embed hf-shared-missing">Original post is no longer available.</div>` : '')}
        <div class="hf-post-stats" id="hfstats-${post.id}">
            ${reactionSummaryHtml(reactCounts, post.id)}
            <span class="hf-stats-meta">
                <span class="hf-comment-count hf-stat-link"${commentCount > 0 ? '' : ' style="display:none;"'} onclick="toggleHomeComments('${post.id}')">${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>
                <span class="hf-share-count hf-stat-link"${shareCount > 0 ? '' : ' style="display:none;"'} onclick="showSharers('${post.id}')">${shareCount} share${shareCount !== 1 ? 's' : ''}</span>
            </span>
        </div>
        <div class="hf-post-actions">
            <div class="hf-react-wrap"
                 onmouseenter="showReactPicker('${post.id}')" onmouseleave="scheduleHideReactPicker('${post.id}')">
                <button class="hf-action-btn hf-react-btn${cur ? ' reacted' : ''}" id="hfreact-${post.id}"
                        style="${cur ? `color:${cur.color};` : ''}"
                        aria-label="${cur ? cur.label : 'Like'}" title="${cur ? cur.label : 'Like'}"
                        onclick="quickReact('${post.id}')"
                        ontouchstart="reactTouchStart('${post.id}')" ontouchend="reactTouchEnd('${post.id}')">
                    <i class="${cur ? cur.icon : 'far fa-thumbs-up'}"></i>
                </button>
                <div class="hf-react-picker" id="hfpicker-${post.id}">
                    ${REACTION_ORDER.map(k => `<button type="button" class="hf-react-opt" aria-label="${REACTIONS[k].label}" onclick="setReaction('${post.id}','${k}')" style="--rc:${REACTIONS[k].color}"><span class="hf-react-optlabel">${REACTIONS[k].label}</span><i class="${REACTIONS[k].icon}"></i></button>`).join('')}
                </div>
            </div>
            <button class="hf-action-btn" onclick="toggleHomeComments('${post.id}')" aria-label="Comment" title="Comment">
                <i class="far fa-comment"></i>
            </button>
            <button class="hf-action-btn" onclick="sharePost('${post.id}')" aria-label="Share" title="Share">
                <i class="fas fa-share"></i>
            </button>
        </div>
        <div class="hf-comments-section" id="hfcomments-${post.id}" style="display:none;">
            <div class="hf-comment-input-wrap">
                <div class="hf-comment-avatar" id="hfcavatar-${post.id}"></div>
                <div class="hf-comment-box">
                    <input type="text" class="hf-comment-input" id="hfcinput-${post.id}" placeholder="Write a comment… @ to tag"
                        onkeydown="if(event.key==='Enter') submitHomeComment('${post.id}')" oninput="onCommentInput('${post.id}', this)">
                    <button type="button" class="hf-cinput-tool" title="Emoji" onclick="openEmojiPicker('hfcinput-${post.id}', this)"><i class="far fa-face-smile"></i></button>
                    <label class="hf-cinput-tool" title="Add photo" for="hfcphoto-${post.id}"><i class="far fa-image"></i></label>
                    <input type="file" id="hfcphoto-${post.id}" hidden accept="image/*" onchange="stageCommentPhoto('${post.id}', this)">
                </div>
                <button type="button" class="hf-comment-send" title="Send" onclick="submitHomeComment('${post.id}')"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div class="hf-comment-photo-preview" id="hfcphotoprev-${post.id}"></div>
            <div class="hf-mention-box" id="hfmention-${post.id}" style="display:none;"></div>
            <div class="hf-comments-list" id="hfclist-${post.id}">
                <div class="hf-comments-loading"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
        </div>
    `;
    return card;
}

// Subject → pill badge (shared by cards + shared embeds)
function subjectBadge(subject) {
    const map = {
        'Achievement':     ['#fffbeb', '#fde68a', '#92400e', 'fa-trophy', '#f59e0b'],
        'Thought':         ['#eef2ff', '#c7d2fe', '#3730a3', 'fa-lightbulb', '#6366f1'],
        'Poll':            ['#f5f3ff', '#ddd6fe', '#6d28d9', 'fa-square-poll-vertical', '#8b5cf6'],
        'Question':        ['#ecfeff', '#a5f3fc', '#0e7490', 'fa-circle-question', '#0ea5e9'],
        'Album':           ['#eff6ff', '#bfdbfe', '#1d4ed8', 'fa-images', '#0ea5e9'],
        'Congratulations': ['#f0fdf4', '#bbf7d0', '#15803d', 'fa-champagne-glasses', '#16a34a']
    };
    if (map[subject]) {
        const [bg, bd, col, ic, icCol] = map[subject];
        return `<div style="margin:6px 0 4px;"><span style="display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:4px 10px;border-radius:50px;background:${bg};border:1px solid ${bd};color:${col};"><i class="fas ${ic}" style="color:${icCol};margin-right:5px;"></i>${subject}</span></div>`;
    }
    return subject ? `<div class="hf-post-subject">${safeText(subject)}</div>` : '';
}

// Embedded original post inside a share
function buildSharedEmbed(orig) {
    const name = orig.is_anonymous ? 'Anonymous' : (orig.user_name || 'Realmate Member');
    const img  = orig.is_anonymous ? avatarUrl('Anon') : (orig.user_img || avatarUrl(name));
    const profileClick = !orig.is_anonymous && orig.user_id
        ? ` style="cursor:pointer;" onclick="event.stopPropagation();location.href='dashboard.html?user_id=${orig.user_id}'"` : '';
    return `<div class="hf-shared-embed" onclick="scrollToPost('${orig.id}')">
        <div class="hf-shared-head">
            <img src="${img}" onerror="this.src='${avatarUrl(name)}'"${profileClick}>
            <div>
                <div class="hf-shared-name"${profileClick}>${safeText(name)}</div>
                <div class="hf-shared-time">${timeAgo(orig.created_at)}</div>
            </div>
        </div>
        ${orig.content ? `<div class="hf-shared-text">${linkifyContent(orig.content)}</div>` : ''}
        ${buildPostMedia(orig)}
    </div>`;
}

function buildPostMedia(post) {
    if (post.media_type === 'video' && post.media_url) {
        return `<div class="hf-post-media">
            <video controls src="${post.media_url}" style="width:100%;border-radius:12px;max-height:400px;"></video>
        </div>`;
    }

    // Prefer the multi-photo array; fall back to the legacy single media_url
    let imgs = Array.isArray(post.media_urls) && post.media_urls.length
        ? post.media_urls
        : (post.media_url ? [post.media_url] : []);
    if (!imgs.length) return '';

    if (imgs.length === 1) {
        return `<div class="hf-post-media">
            <img src="${imgs[0]}" style="width:100%;border-radius:12px;max-height:500px;object-fit:cover;cursor:pointer;"
                onclick="openHomeImgLightbox('${imgs[0]}')">
        </div>`;
    }

    const gridCls = imgs.length === 2 ? 'grid-2' : imgs.length === 3 ? 'grid-3' : 'grid-4';
    const shown = imgs.slice(0, 4);
    return `<div class="hf-post-media hf-img-grid ${gridCls}">
        ${shown.map((u, i) => `<div class="hf-img-cell" onclick="openHomeImgLightbox('${u}')">
            <img src="${u}">
            ${i === 3 && imgs.length > 4 ? `<span class="hf-img-more">+${imgs.length - 4}</span>` : ''}
        </div>`).join('')}
    </div>`;
}

// ── Poll rendering & voting ───────────────────────
function buildPollHtml(post, pollData) {
    const poll = post.poll;
    if (!poll || !Array.isArray(poll.options)) return '';
    const counts   = (pollData && pollData.counts) || {};
    const total    = (pollData && pollData.total) || 0;
    const userVote = (pollData && pollData.userVote) || null;
    const showResults = !!userVote;

    return `<div class="hf-poll" id="hfpoll-${post.id}">
        ${poll.options.map(o => {
            const c = counts[o.id] || 0;
            const pct = total ? Math.round(c / total * 100) : 0;
            const mine = userVote === o.id;
            return `<button type="button" class="hf-poll-opt${showResults ? ' voted' : ''}${mine ? ' mine' : ''}"
                    ${showResults ? 'disabled' : ''} onclick="votePoll('${post.id}','${o.id}')">
                <span class="hf-poll-fill" style="width:${showResults ? pct : 0}%"></span>
                <span class="hf-poll-label">${mine ? '<i class="fas fa-check-circle" style="margin-right:5px;"></i>' : ''}${safeText(o.text)}</span>
                ${showResults ? `<span class="hf-poll-pct">${pct}%</span>` : ''}
            </button>`;
        }).join('')}
        <div class="hf-poll-total">${total} vote${total !== 1 ? 's' : ''}${showResults ? '' : ' · tap an option to vote'}</div>
    </div>`;
}

async function votePoll(postId, optionId) {
    const user = getUser();
    if (!user) { (window.showToast || alert)('Sign in to vote.', 'error'); return; }
    // Single-choice: clear any prior vote by this user on this poll, then record the new one
    await _supaHome.from('forum_poll_votes').delete().eq('post_id', postId).eq('user_name', user.name);
    const { error } = await _supaHome.from('forum_poll_votes').insert({ post_id: postId, option_id: optionId, user_name: user.name });
    if (error) { (window.showToast || alert)('Could not record vote: ' + error.message, 'error'); return; }

    const { data: votes } = await _supaHome.from('forum_poll_votes')
        .select('option_id, user_name').eq('post_id', postId);
    const counts = {}; let total = 0; let userVote = null;
    (votes || []).forEach(v => {
        counts[v.option_id] = (counts[v.option_id] || 0) + 1;
        total++;
        if (v.user_name === user.name) userVote = v.option_id;
    });

    const post = _homePosts.find(p => p.id == postId);
    const container = document.getElementById(`hfpoll-${postId}`);
    if (post && container) container.outerHTML = buildPollHtml(post, { counts, total, userVote });
}

// ── Reaction summary rendering ────────────────────
function reactionSummaryHtml(reactCounts, postId) {
    const total = Object.values(reactCounts || {}).reduce((a, b) => a + b, 0);
    if (!total) return '';
    const chips = Object.entries(reactCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => {
            const r = REACTIONS[k] || REACTIONS.like;
            return `<span class="hf-react-chip" style="background:${r.color}"><i class="${r.icon}"></i></span>`;
        })
        .join('');
    const click = postId != null ? ` onclick="showReactors('${postId}')"` : '';
    return `<span class="hf-react-summary hf-stat-link"${click}><span class="hf-react-chips">${chips}</span> ${total}</span>`;
}

function _rmbrFindPost(id){ try { return (_homePosts||[]).find(p=>String(p.id)===String(id)) || null; } catch(e){ return null; } }
function rmbrReportPost(id){ const p=_rmbrFindPost(id); if(window.RMBR) RMBR.openReport({type:'post',contentId:id,userId:(p&&p.user_id)||null,userName:(p&&p.user_name)||null}); const m=document.getElementById('hfmenu-'+id); if(m) m.style.display='none'; }
// Block POST — hides only this post; the author's other posts stay visible.
async function rmbrHidePost(id){ const p=_rmbrFindPost(id); if(!window.RMBR) return; const m=document.getElementById('hfmenu-'+id); if(m) m.style.display='none'; const label=(p&&p.user_name?p.user_name+' — ':'')+String((p&&p.content)||'').slice(0,60); const ok=await RMBR.blockPost('post', id, label||null); if(ok){ const el=document.getElementById('hfpost-'+id); if(el&&el.remove) el.remove(); else location.reload(); } }
// Block USER — blocks the whole account (all their content disappears everywhere).
async function rmbrBlockUserFromPost(id){ const p=_rmbrFindPost(id); if(!p||!window.RMBR) return; const ok=await RMBR.blockUser(p.user_id||null, p.user_name||null); if(ok) location.reload(); }
function togglePostMenu(postId) {
    const menu = document.getElementById(`hfmenu-${postId}`);
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    const close = e => { menu.style.display = 'none'; document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 10);
}

let _pendingDeletePostId = null;

// The confirm modal lives in home.html, but home.js also renders posts on the
// Profile (dashboard.html), which doesn't include it — so deleting a post there
// used to throw on a null modal and silently do nothing. Inject it on demand.
function _ensureHomeDeleteModal() {
    let modal = document.getElementById('homeDeleteModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'homeDeleteModal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.45); align-items:center; justify-content:center;';
    modal.innerHTML =
        '<div style="background:#fff; border-radius:20px; padding:32px 28px; max-width:340px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.2);">' +
        '<i class="fas fa-exclamation-triangle" style="font-size:40px; color:#ef4444; margin-bottom:16px;"></i>' +
        '<h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px;">Delete this post?</h3>' +
        '<p style="color:#64748b; font-size:13px; margin:0 0 24px;">This action cannot be undone.</p>' +
        '<div style="display:flex; gap:10px;">' +
        '<button onclick="closeHomeDeleteModal()" style="flex:1; padding:12px; border-radius:10px; border:1px solid #e2e8f0; background:#fff; font-size:14px; font-weight:600; cursor:pointer;">Cancel</button>' +
        '<button id="homeDeleteConfirmBtn" style="flex:1; padding:12px; border-radius:10px; border:none; background:#ef4444; color:#fff; font-size:14px; font-weight:700; cursor:pointer;">Delete</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    return modal;
}

function deleteHomePost(postId) {
    _pendingDeletePostId = postId;
    const modal = _ensureHomeDeleteModal();
    modal.style.display = 'flex';
    document.getElementById('homeDeleteConfirmBtn').onclick = confirmHomeDelete;
}

function closeHomeDeleteModal() {
    document.getElementById('homeDeleteModal').style.display = 'none';
    _pendingDeletePostId = null;
}

async function confirmHomeDelete() {
    if (!_pendingDeletePostId) return;
    const postId = _pendingDeletePostId;
    closeHomeDeleteModal();
    await _supaHome.from('forum_posts').delete().eq('id', postId);
    document.getElementById(`hfpost-${postId}`)?.remove();
    // Broadcast so the SAME post disappears from the other view too (Feed ↔
    // Profile) in real time, without a manual refresh. Same-origin storage
    // events fire in the other iframe/tab (the Feed and Profile run in separate
    // shell iframes), and the listener below removes the card there.
    try { localStorage.setItem('rm_post_deleted', JSON.stringify({ id: String(postId), t: Date.now() })); } catch (e) {}
}
window.addEventListener('storage', function (e) {
    if (e.key === 'rm_post_deleted' && e.newValue) {
        try { var d = JSON.parse(e.newValue); if (d && d.id) document.getElementById('hfpost-' + d.id)?.remove(); } catch (_) {}
    }
});

// ── Reactions (Like / Love / Celebrate / Insightful / Helpful) ──
const _reactHideTimers = {};

function showReactPicker(postId) {
    clearTimeout(_reactHideTimers[postId]);
    const picker = document.getElementById(`hfpicker-${postId}`);
    if (picker) picker.classList.add('open');
}
function scheduleHideReactPicker(postId) {
    clearTimeout(_reactHideTimers[postId]);
    _reactHideTimers[postId] = setTimeout(() => {
        document.getElementById(`hfpicker-${postId}`)?.classList.remove('open');
    }, 260);
}

// Long-press opens the picker on touch devices
let _reactTouchTimer = null;
function reactTouchStart(postId) {
    _reactTouchTimer = setTimeout(() => { _reactTouchTimer = 'held'; showReactPicker(postId); }, 380);
}
function reactTouchEnd(postId) {
    if (_reactTouchTimer && _reactTouchTimer !== 'held') clearTimeout(_reactTouchTimer);
    _reactTouchTimer = null;
}

// Tapping the main button toggles the current reaction (default: Like)
function quickReact(postId) {
    if (_reactTouchTimer === 'held') { _reactTouchTimer = null; return; } // long-press already opened picker
    const btn = document.getElementById(`hfreact-${postId}`);
    const has = btn && btn.classList.contains('reacted');
    if (has) applyReaction(postId, null);      // remove
    else applyReaction(postId, 'like');        // default
}

function setReaction(postId, type) {
    document.getElementById(`hfpicker-${postId}`)?.classList.remove('open');
    applyReaction(postId, type);
}

async function applyReaction(postId, type) {
    const user = getUser();
    if (!user) { (window.showToast || alert)('Sign in to react.', 'error'); return; }

    // One reaction per user: clear the old one first
    await _supaHome.from('forum_likes').delete().eq('post_id', postId).eq('user_name', user.name);

    const post = _homePosts.find(p => p.id == postId);
    const notifiesOwner = post && post.user_name && post.user_name !== user.name;

    // Whether the user is removing their reaction entirely (type === null) or
    // switching to a different one, the previous like-notification is now
    // stale — remove it first so the post owner's Notifications don't keep an
    // outdated alert. A fresh one is re-inserted just below only if a new
    // reaction is being applied.
    if (notifiesOwner) {
        await _homeDeleteLikeNotification(postId, user);
    }

    if (type) {
        const { error } = await _supaHome.from('forum_likes').insert({ post_id: postId, user_name: user.name, reaction: type });
        if (error) { console.error('React error:', error); return; }
        if (notifiesOwner) {
            await _homeInsertNotification({
                recipient_id: post.user_id || null,
                recipient_user_name: post.user_name,
                sender_id: user.id || null,
                sender_user_name: user.name,
                sender_profile_picture: user.image || '',
                type: 'post_like',
                target_post_id: postId,
                message: `reacted ${REACTIONS[type].emoji} to your post.`,
                is_read: false
            });
        }
    }
    updateReactionUI(postId, type);
}

// Update the button + summary without a full feed reload
async function updateReactionUI(postId, myType) {
    const btn = document.getElementById(`hfreact-${postId}`);
    const label = document.getElementById(`hfreactlabel-${postId}`);
    if (btn) {
        const cur = myType ? REACTIONS[myType] : null;
        btn.classList.toggle('reacted', !!cur);
        btn.style.color = cur ? cur.color : '';
        const icon = btn.querySelector('i');
        if (icon) icon.className = cur ? cur.icon : 'far fa-thumbs-up';
        if (label) label.textContent = cur ? cur.label : 'Like';
    }

    const { data: rows } = await _supaHome.from('forum_likes')
        .select('reaction').eq('post_id', postId);
    const counts = {};
    (rows || []).forEach(r => {
        const rt = REACTIONS[r.reaction] ? r.reaction : 'like';
        counts[rt] = (counts[rt] || 0) + 1;
    });

    const stats = document.getElementById(`hfstats-${postId}`);
    if (stats) {
        const existing = stats.querySelector('.hf-react-summary');
        const html = reactionSummaryHtml(counts, postId);
        if (existing) existing.remove();
        if (html) stats.insertAdjacentHTML('afterbegin', html);
    }
}

// ══════════════════════════════════════════════════
//  WHO REACTED / WHO SHARED  (clickable counters)
// ══════════════════════════════════════════════════
let _fpReactors = [];

function openFeedPeople(title) {
    document.getElementById('fpTitle').textContent = title;
    document.getElementById('fpTabs').innerHTML = '';
    document.getElementById('fpTabs').style.display = 'none';
    document.getElementById('fpList').innerHTML = '<div class="fp-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    document.getElementById('feedPeopleModal').style.display = 'flex';
}
function closeFeedPeople() {
    document.getElementById('feedPeopleModal').style.display = 'none';
}
function fpEmpty(msg) {
    document.getElementById('fpList').innerHTML = `<div class="fp-empty">${msg}</div>`;
}

// Look up real avatars for a set of member names
async function fpFetchAvatars(names) {
    const map = {};
    if (!names.length) return map;
    const { data } = await _supaHome.from('profiles').select('full_name, avatar_url').in('full_name', names);
    (data || []).forEach(p => { if (p.avatar_url) map[p.full_name] = p.avatar_url; });
    return map;
}

function fpPersonRow(name, img, meta, reactionType) {
    const r = reactionType ? REACTIONS[reactionType] : null;
    const badge = r ? `<span class="fp-react" style="background:${r.color}" title="${r.label}"><i class="${r.icon}"></i></span>` : '';
    return `<div class="fp-row">
        <div class="fp-avatar-wrap"><img src="${img}" onerror="this.src='${avatarUrl(name)}'">${badge}</div>
        <div class="fp-info"><div class="fp-name">${safeText(name)}</div>${meta ? `<div class="fp-meta">${safeText(meta)}</div>` : ''}</div>
    </div>`;
}

async function showReactors(postId) {
    openFeedPeople('Reactions');
    const { data } = await _supaHome.from('forum_likes').select('user_name, reaction').eq('post_id', postId);
    if (!data || !data.length) { fpEmpty('No reactions yet.'); return; }

    const rows = data.filter(r => r.user_name).map(r => ({
        name: r.user_name,
        reaction: REACTIONS[r.reaction] ? r.reaction : 'like'
    }));
    const avatars = await fpFetchAvatars([...new Set(rows.map(r => r.name))]);
    _fpReactors = rows.map(r => ({ ...r, img: avatars[r.name] || avatarUrl(r.name) }));

    const counts = {};
    _fpReactors.forEach(r => { counts[r.reaction] = (counts[r.reaction] || 0) + 1; });

    // Tabs: All + each reaction present
    const tabs = document.getElementById('fpTabs');
    tabs.style.display = 'flex';
    let tabsHtml = `<button class="fp-tab active" data-f="all" onclick="fpFilterReactors('all', this)">All ${_fpReactors.length}</button>`;
    REACTION_ORDER.filter(k => counts[k]).forEach(k => {
        tabsHtml += `<button class="fp-tab" data-f="${k}" onclick="fpFilterReactors('${k}', this)" title="${REACTIONS[k].label}"><i class="${REACTIONS[k].icon}" style="color:${REACTIONS[k].color}"></i> ${counts[k]}</button>`;
    });
    tabs.innerHTML = tabsHtml;
    fpRenderReactors('all');
}

function fpFilterReactors(filter, btn) {
    document.querySelectorAll('#fpTabs .fp-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    fpRenderReactors(filter);
}
function fpRenderReactors(filter) {
    const list = filter === 'all' ? _fpReactors : _fpReactors.filter(r => r.reaction === filter);
    document.getElementById('fpList').innerHTML =
        list.map(r => fpPersonRow(r.name, r.img, REACTIONS[r.reaction].label, r.reaction)).join('') || '<div class="fp-empty">Nobody yet.</div>';
}

async function showSharers(postId) {
    openFeedPeople('Shares');
    const { data } = await _supaHome.from('forum_posts')
        .select('user_name, user_img, created_at')
        .eq('shared_post_id', postId)
        .order('created_at', { ascending: false });
    if (!data || !data.length) { fpEmpty('No shares yet.'); return; }
    document.getElementById('fpList').innerHTML =
        data.filter(s => s.user_name).map(s => fpPersonRow(s.user_name, s.user_img || avatarUrl(s.user_name), timeAgo(s.created_at))).join('');
}

// ── Comments ──────────────────────────────────────
async function toggleHomeComments(postId) {
    const section = document.getElementById(`hfcomments-${postId}`);
    if (!section) return;
    const isOpen = section.style.display !== 'none';
    section.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        initCommentAvatar(postId);
        await loadHomeComments(postId);
    }
}

function initCommentAvatar(postId) {
    const user = getUser();
    const el   = document.getElementById(`hfcavatar-${postId}`);
    if (!el || !user) return;
    if (user.image) {
        el.style.background = `url('${user.image}') center/cover no-repeat`;
    } else {
        el.style.background = '#0f172a';
        el.textContent = (user.name || 'U').charAt(0).toUpperCase();
        el.style.color = '#32cd32';
    }
}

async function loadHomeComments(postId) {
    const list = document.getElementById(`hfclist-${postId}`);
    if (!list) return;

    // Fetch the whole thread (top-level + replies) in one go
    const { data: comments } = await _supaHome
        .from('forum_comments')
        .select('id, user_id, user_name, user_img, content, media_url, created_at, parent_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    const all = comments || [];
    await _resolveLiveAuthors(all);
    const parents = all.filter(c => !c.parent_id);
    if (!parents.length) {
        list.innerHTML = '<div class="hf-no-comments">No comments yet. Start the conversation!</div>';
        return;
    }
    const repliesByParent = {};
    all.filter(c => c.parent_id).forEach(r => {
        (repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push(r);
    });

    const post = _homePosts.find(p => p.id == postId);
    const postAuthor = post ? post.user_name : null;

    list.innerHTML = parents.map(p => {
        const replies = repliesByParent[p.id] || [];
        const n = replies.length;
        const authorReplied = replies.some(r => r.user_name === postAuthor);
        return `
        <div class="hf-thread" id="hf-thread-${p.id}">
            ${renderFeedComment(p, postId, false, postAuthor)}
            ${n ? `<button class="hf-replies-toggle" id="hf-rtoggle-${p.id}" data-author-replied="${authorReplied ? 1 : 0}" data-count="${n}" onclick="toggleReplies('${p.id}')">
                <i class="fas fa-reply"></i>
                <span class="hf-rtoggle-text">${authorReplied ? '<b>Author replied</b> · ' : ''}View ${n} ${n === 1 ? 'reply' : 'replies'}</span>
            </button>` : ''}
            <div class="hf-replies" id="hf-replies-${p.id}">
                ${replies.map(r => renderFeedComment(r, postId, true, postAuthor)).join('')}
            </div>
            <div class="hf-reply-input" id="hf-rinput-${p.id}" style="display:none;">
                <div class="hf-reply-avatar" id="hf-ravatar-${p.id}"></div>
                <div class="hf-reply-field-wrap">
                    <input type="text" class="hf-reply-field" id="hffreply-${p.id}" placeholder="Write a reply…"
                        oninput="onReplyInput('${p.id}', this)"
                        onkeydown="if(event.key==='Enter') submitFeedReply('${postId}','${p.id}')">
                    <button type="button" class="hf-reply-emoji" onclick="openEmojiPicker('hffreply-${p.id}', this)"><i class="far fa-face-smile"></i></button>
                </div>
                <button class="hf-reply-send" onclick="submitFeedReply('${postId}','${p.id}')"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div class="hf-mention-box hf-reply-mention-box" id="hf-rmention-${p.id}" style="display:none;"></div>
        </div>`;
    }).join('');
}

// A single Facebook-style comment/reply bubble
function renderFeedComment(c, postId, isReply, postAuthor) {
    const img = c.user_img || avatarUrl(c.user_name);
    const isAuthor = postAuthor && c.user_name === postAuthor;
    // Reply on a reply targets the SAME parent (2-level max) and mentions the reply author
    const replyTarget = isReply ? c.parent_id : c.id;
    const mentionArg = isReply ? `,'${(c.user_name || '').replace(/'/g, "\\'")}'` : '';
    return `
    <div class="hf-comment${isReply ? ' hf-comment-reply' : ''}" id="hf-comment-${c.id}">
        <img class="hf-c-avatar" src="${img}" onerror="this.src='${avatarUrl(c.user_name)}'">
        <div class="hf-c-main">
            <div class="hf-c-bubble">
                <div class="hf-c-name">${safeText(c.user_name || 'Member')}${isAuthor ? '<span class="hf-c-badge"><i class="fas fa-circle-check"></i> Author</span>' : ''}</div>
                ${c.content ? `<div class="hf-c-text">${linkifyContent(c.content)}</div>` : ''}
            </div>
            ${c.media_url ? `<img class="hf-c-photo" src="${c.media_url}" onclick="openHomeImgLightbox('${c.media_url}')">` : ''}
            <div class="hf-c-actions">
                <span class="hf-c-time">${timeAgo(c.created_at)}</span>
                <span class="hf-c-reply" onclick="showFeedReplyInput('${postId}','${replyTarget}'${mentionArg})">Reply</span>
            </div>
        </div>
    </div>`;
}

// Smooth expand / collapse of a replies group
function toggleReplies(parentId, forceOpen) {
    const box = document.getElementById(`hf-replies-${parentId}`);
    const toggle = document.getElementById(`hf-rtoggle-${parentId}`);
    if (!box) return;
    const isOpen = box.classList.contains('open');
    const open = forceOpen ? true : !isOpen;
    if (open === isOpen) return;

    if (open) {
        box.classList.add('open');
        box.style.maxHeight = box.scrollHeight + 'px';
        box.addEventListener('transitionend', function te() { box.style.maxHeight = 'none'; box.removeEventListener('transitionend', te); });
    } else {
        box.style.maxHeight = box.scrollHeight + 'px';
        requestAnimationFrame(() => { box.classList.remove('open'); box.style.maxHeight = '0px'; });
    }
    if (toggle) {
        const n = parseInt(toggle.dataset.count) || box.querySelectorAll(':scope > .hf-comment').length;
        const textEl = toggle.querySelector('.hf-rtoggle-text');
        const icon = toggle.querySelector('i');
        const authorPrefix = toggle.dataset.authorReplied === '1' ? '<b>Author replied</b> · ' : '';
        if (textEl) textEl.innerHTML = open ? `Hide ${n === 1 ? 'reply' : 'replies'}` : `${authorPrefix}View ${n} ${n === 1 ? 'reply' : 'replies'}`;
        if (icon) icon.className = open ? 'fas fa-chevron-up' : 'fas fa-reply';
    }
}

function initReplyAvatar(parentId) {
    const user = getUser();
    const el = document.getElementById(`hf-ravatar-${parentId}`);
    if (!el || !user) return;
    if (user.image) {
        el.style.background = `url('${user.image}') center/cover no-repeat`;
    } else {
        el.style.background = '#0f172a';
        el.textContent = (user.name || 'U').charAt(0).toUpperCase();
        el.style.color = '#32cd32';
    }
}

// Reveal the reply input under a parent comment, optionally pre-mentioning someone.
// Every open starts from a clean composer — an abandoned draft (e.g. a
// half-typed "@D" mention search that was never submitted) must not
// resurface the next time this reply box is opened.
function showFeedReplyInput(postId, parentId, mentionName) {
    const box = document.getElementById(`hf-replies-${parentId}`);
    if (box && box.children.length && !box.classList.contains('open')) toggleReplies(parentId, true);
    const wrap = document.getElementById(`hf-rinput-${parentId}`);
    if (!wrap) return;
    wrap.style.display = 'flex';
    initReplyAvatar(parentId);
    const field = document.getElementById(`hffreply-${parentId}`);
    if (field) {
        field.value = mentionName ? `@${mentionName} ` : '';
        hideReplyMentionBox(parentId);
        field.focus();
        field.selectionStart = field.selectionEnd = field.value.length;
    }
}

async function submitFeedReply(postId, parentId) {
    const field = document.getElementById(`hffreply-${parentId}`);
    const user = getUser();
    if (!field || !user) return;
    const text = field.value.trim();
    if (!text) return;
    field.value = '';
    hideReplyMentionBox(parentId);

    const { data: authData } = await _supaHome.auth.getUser();
    await _supaHome.from('forum_comments').insert({
        post_id: postId, user_id: authData?.user?.id, user_name: user.name,
        user_img: user.image || '', content: text, media_url: null, parent_id: parseInt(parentId)
    });

    // Notify the parent comment's author
    const { data: parent } = await _supaHome.from('forum_comments').select('user_id,user_name').eq('id', parentId).maybeSingle();
    if (parent && parent.user_name && parent.user_name !== user.name) {
        await _homeInsertNotification({
            recipient_id: parent.user_id || null, recipient_user_name: parent.user_name,
            sender_id: authData?.user?.id || null, sender_user_name: user.name,
            sender_profile_picture: user.image || '', type: 'comment_reply',
            target_post_id: postId, target_comment_id: parseInt(parentId),
            message: `replied to your comment: "${text.substring(0, 30)}"`, is_read: false
        });
    }
    // Notify @mentioned members (reply-to-a-reply case)
    (text.match(/@([\p{L}][\p{L}0-9_. ]{1,30}?)(?=[\s.,!?]|$)/gu) || []).forEach(async m => {
        const mentioned = m.slice(1).trim();
        if (mentioned && mentioned !== user.name && mentioned !== parent?.user_name) {
            const recipientId = await _resolveMentionRecipientId(mentioned);
            await _homeInsertNotification({
                recipient_id: recipientId, recipient_user_name: mentioned,
                sender_id: authData?.user?.id || null, sender_user_name: user.name,
                sender_profile_picture: user.image || '', type: 'mention',
                target_post_id: postId, message: 'mentioned you in a reply.', is_read: false
            });
        }
    });

    await loadHomeComments(postId);
    setTimeout(() => toggleReplies(parentId, true), 20); // keep this thread expanded
    updateCommentCount(postId);
}

async function updateCommentCount(postId) {
    const { data } = await _supaHome.from('forum_comments').select('id', { count: 'exact' }).eq('post_id', postId);
    const count = data?.length || 0;
    const countSpan = document.querySelector(`#hfstats-${postId} .hf-comment-count`);
    if (countSpan) {
        countSpan.textContent = `${count} comment${count !== 1 ? 's' : ''}`;
        countSpan.style.display = count > 0 ? '' : 'none';
    }
}

// Staged photo for a comment (postId -> File)
const _commentPhotos = {};
function stageCommentPhoto(postId, input) {
    const file = input.files[0];
    if (!file) return;
    _commentPhotos[postId] = file;
    const prev = document.getElementById(`hfcphotoprev-${postId}`);
    if (prev) {
        const url = URL.createObjectURL(file);
        prev.innerHTML = `<div class="hf-cphoto-thumb"><img src="${url}"><button onclick="clearCommentPhoto('${postId}')"><i class="fas fa-times"></i></button></div>`;
    }
}
function clearCommentPhoto(postId) {
    delete _commentPhotos[postId];
    const prev = document.getElementById(`hfcphotoprev-${postId}`);
    if (prev) prev.innerHTML = '';
    const inp = document.getElementById(`hfcphoto-${postId}`);
    if (inp) inp.value = '';
}

async function submitHomeComment(postId) {
    const input = document.getElementById(`hfcinput-${postId}`);
    const user  = getUser();
    if (!input || !user) return;
    const text = input.value.trim();
    const photo = _commentPhotos[postId];
    if (!text && !photo) return;
    input.value = '';
    hideMentionBox(postId);

    let mediaUrl = null;
    if (photo) {
        const path = `comments/${Date.now()}_${photo.name}`;
        const { error: upErr } = await _supaHome.storage.from('images').upload(path, photo, { upsert: true });
        if (!upErr) mediaUrl = _supaHome.storage.from('images').getPublicUrl(path).data.publicUrl;
        clearCommentPhoto(postId);
    }

    const { data: authData } = await _supaHome.auth.getUser();
    const { data: inserted } = await _supaHome.from('forum_comments').insert({
        post_id:   postId,
        user_id:   authData?.user?.id,
        user_name: user.name,
        user_img:  user.image || '',
        content:   text,
        media_url: mediaUrl,
        parent_id: null
    }).select('id').single();

    // Notify anyone @mentioned in the comment
    (text.match(/@([\p{L}][\p{L}0-9_. ]{1,30}?)(?=[\s.,!?]|$)/gu) || []).forEach(async m => {
        const mentioned = m.slice(1).trim();
        if (mentioned && mentioned !== user.name) {
            const recipientId = await _resolveMentionRecipientId(mentioned);
            await _homeInsertNotification({
                recipient_id: recipientId,
                recipient_user_name: mentioned,
                sender_id: authData?.user?.id || null,
                sender_user_name: user.name,
                sender_profile_picture: user.image || '',
                type: 'mention',
                target_post_id: postId,
                message: `mentioned you in a comment.`,
                is_read: false
            });
        }
    });
    const post = _homePosts.find(p => p.id == postId);
    if (post && post.user_name && post.user_name !== user.name) {
        await _homeInsertNotification({
            recipient_id: post.user_id || null,
            recipient_user_name: post.user_name,
            sender_id: authData?.user?.id || null,
            sender_user_name: user.name,
            sender_profile_picture: user.image || '',
            type: 'comment_reply',
            target_post_id: postId,
            target_comment_id: inserted?.id || null,
            message: `commented on your post: "${text.substring(0, 30)}"`,
            is_read: false
        });
    }
    await loadHomeComments(postId);
    updateCommentCount(postId);
}

// ── Simple image lightbox for home feed ──────────
function openHomeImgLightbox(src) {
    const lb = document.createElement('div');
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    lb.innerHTML = `<img src="${src}" style="max-width:92vw;max-height:90vh;object-fit:contain;border-radius:10px;">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
}

// ══════════════════════════════════════════════════
//  SAVE / SHARE / PIN
// ══════════════════════════════════════════════════
async function toggleSave(postId) {
    const user = getUser();
    if (!user) { (window.showToast || alert)('Sign in to save posts.', 'error'); return; }
    const pid = parseInt(postId);
    const isSaved = _savedSet.has(pid);
    if (isSaved) {
        await _supaHome.from('saved_posts').delete().eq('user_name', user.name).eq('post_id', pid);
        _savedSet.delete(pid);
        try { window.RMTrack && RMTrack.emit('unsave', { post_id: pid }); } catch(e){}
    } else {
        await _supaHome.from('saved_posts').insert({ user_name: user.name, post_id: pid });
        _savedSet.add(pid);
        try { window.RMTrack && RMTrack.emit('save', { post_id: pid }); } catch(e){}
    }
    // If viewing the Saved tab, unsaving should drop the card
    if (_feedFilter.type === 'saved' && isSaved) {
        document.getElementById(`hfpost-${postId}`)?.remove();
        if (!document.querySelector('#homeFeed .hf-post-card')) loadHomeFeed();
        return;
    }
    const btn = document.getElementById(`hfsave-${postId}`);
    if (btn) {
        const nowSaved = _savedSet.has(pid);
        btn.classList.toggle('saved', nowSaved);
        btn.innerHTML = `<i class="${nowSaved ? 'fas' : 'far'} fa-bookmark"></i>`;
        btn.setAttribute('aria-label', nowSaved ? 'Saved' : 'Save');
        btn.setAttribute('title', nowSaved ? 'Saved' : 'Save');
    }
    const menu = document.getElementById(`hfmenu-${postId}`);
    if (menu) menu.style.display = 'none';
}

async function pinPost(postId) {
    const user = getUser();
    if (!user) return;
    const { data: authData } = await _supaHome.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) { (window.showToast || alert)('Could not pin — please sign in again.', 'error'); return; }
    const { error } = await _supaHome.from('profiles').update({ pinned_post_id: parseInt(postId) }).eq('id', uid);
    if (error) (window.showToast || alert)('Could not pin: ' + error.message, 'error');
    else (window.showToast || alert)('📌 Pinned to your profile.', 'success');
    const menu = document.getElementById(`hfmenu-${postId}`);
    if (menu) menu.style.display = 'none';
}

let _sharePostId = null;
function sharePost(postId) {
    const orig = _homePosts.find(p => p.id == postId);
    if (!orig) return;
    // Share the underlying original if this post is itself a share
    _sharePostId = orig.shared_post_id || orig.id;
    const target = _sharedOriginals[orig.shared_post_id] || orig;
    const name = target.is_anonymous ? 'Anonymous' : (target.user_name || 'Member');
    document.getElementById('shareComment').value = '';
    document.getElementById('shareOriginalPreview').innerHTML = `
        <div class="hf-shared-head">
            <img src="${target.user_img || avatarUrl(name)}" onerror="this.src='${avatarUrl(name)}'">
            <div><div class="hf-shared-name">${safeText(name)}</div><div class="hf-shared-time">${timeAgo(target.created_at)}</div></div>
        </div>
        ${target.content ? `<div class="hf-shared-text">${linkifyContent(target.content)}</div>` : ''}`;
    document.getElementById('sharePostModal').style.display = 'flex';
}
function closeShareModal() {
    document.getElementById('sharePostModal').style.display = 'none';
    _sharePostId = null;
}
async function submitShare() {
    const user = getUser();
    if (!user || !_sharePostId) return;
    const btn = document.getElementById('shareSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const comment = document.getElementById('shareComment').value.trim();
    const { data: authData } = await _supaHome.auth.getUser();
    const { error } = await _supaHome.from('forum_posts').insert({
        user_id: authData?.user?.id,
        user_name: user.name,
        user_img: user.image || '',
        subject: '',
        content: comment,
        shared_post_id: parseInt(_sharePostId),
        post_type: 'text',
        privacy: 'public',
        hashtags: extractHashtags(comment),
        is_anonymous: false,
        source: 'home'
    });
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-share"></i> Share now';
    if (error) { (window.showToast || alert)('Could not share: ' + error.message, 'error'); return; }

    // Live-bump the original post's share counter if it's on screen
    const shareSpan = document.querySelector(`#hfstats-${_sharePostId} .hf-share-count`);
    if (shareSpan) {
        const n = (parseInt(shareSpan.textContent) || 0) + 1;
        shareSpan.textContent = `${n} share${n !== 1 ? 's' : ''}`;
        shareSpan.style.display = '';
    }

    // Notify the original author
    const orig = _homePosts.find(p => p.id == _sharePostId) || _sharedOriginals[_sharePostId];
    if (orig && orig.user_name && orig.user_name !== user.name) {
        await _homeInsertNotification({
            recipient_id: orig.user_id || null,
            recipient_user_name: orig.user_name,
            sender_id: user.id || null,
            sender_user_name: user.name,
            sender_profile_picture: user.image || '',
            type: 'post_share',
            target_post_id: parseInt(_sharePostId),
            message: 'shared your post.',
            is_read: false
        });
    }
    closeShareModal();
    setFeedFilter('all');
}

// ══════════════════════════════════════════════════
//  FEED FILTERS (default / Saved / Hashtag / Topic)
// ══════════════════════════════════════════════════
function setFeedFilter(type, value) {
    _feedFilter = { type, value: value || null };
    document.getElementById('navSaved')?.classList.toggle('active', type === 'saved');
    // Close the avatar "Me" menu if the tap came from there
    document.getElementById('navMenu')?.classList.remove('open');
    renderActiveFilter();
    loadHomeFeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function filterByHashtag(tag) {
    setFeedFilter('hashtag', tag);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderActiveFilter() {
    const el = document.getElementById('feedActiveFilter');
    const bar = document.getElementById('feedFilterBar');
    if (!el) return;
    let inner = '';
    if (_feedFilter.type === 'hashtag') {
        inner = `${safeText('#' + _feedFilter.value)}`;
    } else if (_feedFilter.type === 'topic') {
        inner = `${safeText(_feedFilter.value)}`;
    } else if (_feedFilter.type === 'saved') {
        inner = `<i class="fas fa-bookmark"></i> Saved posts`;
    }
    if (inner) {
        el.innerHTML = `<span class="feed-active-chip">${inner} <i class="fas fa-times" onclick="setFeedFilter('all')"></i></span>`;
        el.style.display = 'flex';
        if (bar) bar.style.display = 'flex';
    } else {
        el.style.display = 'none';
        el.innerHTML = '';
        if (bar) bar.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════
//  EMOJI PICKER (reusable)
// ══════════════════════════════════════════════════
const EMOJIS = ['😀','😂','😍','🥰','😎','🤩','😅','😭','😊','👍','👏','🙌','🙏','💪','🔥','✨','🎉','🎊','❤️','💚','💙','💜','🏠','🏡','🏢','🏗️','🔑','📈','💰','🤝','👀','💡','⭐','✅','🌟','🥂','🍾','📌','📷','🌆'];
let _emojiTargetId = null;
function openEmojiPicker(targetId, anchorEl) {
    const picker = document.getElementById('emojiPicker');
    if (!picker) return;
    if (picker.style.display === 'block' && _emojiTargetId === targetId) { picker.style.display = 'none'; return; }
    _emojiTargetId = targetId;
    document.getElementById('emojiGrid').innerHTML = EMOJIS.map(e => `<button type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
    const r = anchorEl.getBoundingClientRect();
    picker.style.top = `${window.scrollY + r.bottom + 6}px`;
    picker.style.left = `${Math.max(8, window.scrollX + r.left - 120)}px`;
    picker.style.display = 'block';
    const close = e => {
        if (!picker.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
            picker.style.display = 'none'; document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
}
function insertEmoji(e) {
    const el = document.getElementById(_emojiTargetId);
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, start) + e + el.value.slice(el.selectionEnd ?? start);
    el.focus();
    el.selectionStart = el.selectionEnd = start + e.length;
}

// ══════════════════════════════════════════════════
//  @MENTION AUTOCOMPLETE (comments)
// ══════════════════════════════════════════════════
let _mentionTimer = null;
function onCommentInput(postId, input) {
    const val = input.value;
    const m = val.slice(0, input.selectionStart).match(/@([\p{L}0-9_. ]{0,30})$/u);
    if (!m) { hideMentionBox(postId); return; }
    const q = m[1].trim();
    clearTimeout(_mentionTimer);
    if (q.length < 1) { hideMentionBox(postId); return; }
    _mentionTimer = setTimeout(async () => {
        // Same source as the post composer: realmates first, all profiles as fallback
        const cands = await fetchTagCandidates(q);
        const box = document.getElementById(`hfmention-${postId}`);
        if (!box || !cands.length) { hideMentionBox(postId); return; }
        box.innerHTML = cands.map(c => `<div class="hf-mention-item" onclick="pickMention('${postId}','${c.name.replace(/'/g,"\\'")}')">
            <img src="${c.img}"><span>${safeText(c.name)}</span></div>`).join('');
        box.style.display = 'block';
    }, 200);
}
function pickMention(postId, name) {
    const input = document.getElementById(`hfcinput-${postId}`);
    if (input) input.value = input.value.replace(/@([\p{L}0-9_. ]{0,30})$/u, `@${name} `);
    hideMentionBox(postId);
    input?.focus();
}
function hideMentionBox(postId) {
    const box = document.getElementById(`hfmention-${postId}`);
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

// Same autocomplete as the top-level comment box, scoped to a reply field —
// the reply input previously had no mention wiring at all.
function onReplyInput(parentId, input) {
    const val = input.value;
    const m = val.slice(0, input.selectionStart).match(/@([\p{L}0-9_. ]{0,30})$/u);
    if (!m) { hideReplyMentionBox(parentId); return; }
    const q = m[1].trim();
    clearTimeout(_mentionTimer);
    if (q.length < 1) { hideReplyMentionBox(parentId); return; }
    _mentionTimer = setTimeout(async () => {
        const cands = await fetchTagCandidates(q);
        const box = document.getElementById(`hf-rmention-${parentId}`);
        if (!box || !cands.length) { hideReplyMentionBox(parentId); return; }
        box.innerHTML = cands.map(c => `<div class="hf-mention-item" onclick="pickReplyMention('${parentId}','${c.name.replace(/'/g,"\\'")}')">
            <img src="${c.img}"><span>${safeText(c.name)}</span></div>`).join('');
        box.style.display = 'block';
    }, 200);
}
function pickReplyMention(parentId, name) {
    const input = document.getElementById(`hffreply-${parentId}`);
    if (input) input.value = input.value.replace(/@([\p{L}0-9_. ]{0,30})$/u, `@${name} `);
    hideReplyMentionBox(parentId);
    input?.focus();
}
function hideReplyMentionBox(parentId) {
    const box = document.getElementById(`hf-rmention-${parentId}`);
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

// Resolves an @mentioned display name to the current account id it belongs
// to, so mention notifications can be matched by id (not just the typed
// name text) — same "id first" principle as _resolveLiveAuthors above.
async function _resolveMentionRecipientId(name) {
    try {
        const { data } = await _supaHome.from('profiles').select('id').eq('full_name', name).maybeSingle();
        return data?.id || null;
    } catch { return null; }
}

// ══════════════════════════════════════════════════
//  SIDEBAR — TRENDING / TOPICS / SUGGESTED / MEMORIES
// ══════════════════════════════════════════════════
const FEED_TOPICS = ['Luxury Homes','Architecture','Interior Design','Investing','Construction','Landscaping','Commercial','Office Spaces'];

async function loadTrending() {
    const list = document.getElementById('trendingList');
    if (!list) return;
    // Aggregate hashtags from the most recent posts
    const { data } = await _supaHome.from('forum_posts')
        .select('hashtags').eq('source', 'home')
        .order('created_at', { ascending: false }).limit(150);
    const counts = {};
    (data || []).forEach(p => (p.hashtags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!top.length) return; // widget stays hidden
    list.innerHTML = top.map(([tag, n], i) => `
        <div class="trending-row" onclick="filterByHashtag('${tag}')">
            <div class="trending-rank">${i + 1}</div>
            <div class="trending-tag">
                <div class="trending-hash">#${safeText(tag)}</div>
                <div class="trending-count">${n} post${n !== 1 ? 's' : ''}</div>
            </div>
        </div>`).join('');
    document.getElementById('trendingWidget').style.display = 'block';
}

async function loadFollowTopics() {
    const list = document.getElementById('topicsList');
    if (!list) return;
    const user = getUser();
    let followed = new Set();
    if (user) {
        const { data } = await _supaHome.from('topic_follows').select('topic').eq('user_name', user.name);
        (data || []).forEach(t => followed.add(t.topic));
    }
    list.innerHTML = FEED_TOPICS.map(t => {
        const on = followed.has(t);
        return `<div class="topic-row">
            <span class="topic-name" onclick="setFeedFilter('topic','${t.replace(/'/g,"\\'")}')">${t}</span>
            <button class="topic-follow-btn${on ? ' following' : ''}" onclick="toggleTopicFollow('${t.replace(/'/g,"\\'")}', this)">
                <i class="fas ${on ? 'fa-check' : 'fa-plus'}"></i> ${on ? 'Following' : 'Follow'}
            </button>
        </div>`;
    }).join('');
}

async function toggleTopicFollow(topic, btn) {
    const user = getUser();
    if (!user) { (window.showToast || alert)('Sign in to follow topics.', 'error'); return; }
    const following = btn.classList.contains('following');
    if (following) {
        await _supaHome.from('topic_follows').delete().eq('user_name', user.name).eq('topic', topic);
        btn.classList.remove('following');
        btn.innerHTML = '<i class="fas fa-plus"></i> Follow';
    } else {
        await _supaHome.from('topic_follows').insert({ user_name: user.name, topic });
        btn.classList.add('following');
        btn.innerHTML = '<i class="fas fa-check"></i> Following';
    }
}

async function loadSuggestedRealmates() {
    const list = document.getElementById('suggestedList');
    if (!list) return;
    const user = getUser();
    const { data: profiles } = await _supaHome.from('profiles')
        .select('id, full_name, avatar_url, job_title')
        .order('created_at', { ascending: false }).limit(12);
    if (!profiles || !profiles.length) return;

    // Exclude self and people already followed
    let followingIds = new Set();
    if (typeof _followsDb !== 'undefined') {
        try {
            const { data: auth } = await _followsDb.auth.getUser();
            if (auth?.user?.id) {
                const { data: f } = await _followsDb.from('follows').select('following_id').eq('follower_id', auth.user.id);
                (f || []).forEach(x => followingIds.add(x.following_id));
            }
        } catch (e) {}
    }
    const suggestions = profiles
        .filter(p => p.full_name && p.full_name.trim() && (!user || p.full_name !== user.name) && !followingIds.has(p.id))
        .slice(0, 5);
    if (!suggestions.length) return;

    list.innerHTML = suggestions.map((p, i) => `
        <div class="suggested-row">
            <img src="${p.avatar_url || avatarUrl(p.full_name)}" onerror="this.src='${avatarUrl(p.full_name)}'"
                 onclick="location.href='dashboard.html?user_id=${p.id}'">
            <div class="suggested-info" onclick="location.href='dashboard.html?user_id=${p.id}'">
                <div class="suggested-name">${safeText(p.full_name || 'Realmate Member')}</div>
                ${_homeValidPosition(p.job_title) ? `<div class="suggested-job">${safeText(_homeValidPosition(p.job_title))}</div>` : ''}
            </div>
            <span id="suggFollow-${i}"></span>
        </div>`).join('');
    document.getElementById('suggestedWidget').style.display = 'block';
    // Wire follow buttons via follows.js
    if (typeof renderFollowButton === 'function') {
        suggestions.forEach((p, i) => renderFollowButton(`suggFollow-${i}`, p.id, p.full_name || ''));
    }
}

async function loadMemories() {
    const list = document.getElementById('memoriesList');
    const user = getUser();
    if (!list || !user) return;
    const now = new Date();
    const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
    const from = new Date(yearAgo); from.setDate(from.getDate() - 3);
    const to = new Date(yearAgo); to.setDate(to.getDate() + 3);
    const { data } = await _supaHome.from('forum_posts')
        .select('id, content, created_at, media_url')
        .eq('user_name', user.name)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .order('created_at', { ascending: false }).limit(3);
    if (!data || !data.length) return;
    list.innerHTML = data.map(p => `
        <div class="memory-row" onclick="scrollToPost('${p.id}')">
            <div class="memory-when">One year ago</div>
            <div class="memory-text">${safeText((p.content || 'You shared a photo').slice(0, 90))}</div>
        </div>`).join('');
    document.getElementById('memoriesWidget').style.display = 'block';
}

// ══════════════════════════════════════════════════
//  RIGHT SIDEBAR — ACTIVE MEMBERS
// ══════════════════════════════════════════════════

async function loadActiveMembers() {
    const list = document.getElementById('activeMembersList');
    if (!list) return;

    try {
        const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // last 15 min
        const { data, error } = await _supaHome
            .from('profiles')
            .select('id, full_name, avatar_url, job_title, last_seen')
            .gte('last_seen', cutoff)
            .order('last_seen', { ascending: false })
            .limit(5);

        if (error || !data?.length) {
            // Fallback: show most recent profiles if last_seen column doesn't exist
            const { data: fallback } = await _supaHome
                .from('profiles')
                .select('id, full_name, avatar_url, job_title')
                .limit(5);

            if (!fallback?.length) {
                list.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">No active members.</div>';
                return;
            }
            renderActiveMembers(fallback, list, false);
            return;
        }
        renderActiveMembers(data, list, true);
    } catch (e) {
        list.innerHTML = '<div style="font-size:12px;color:#94a3b8;">Could not load members.</div>';
    }
}

function renderActiveMembers(members, list, showOnline) {
    list.innerHTML = members.map(m => {
        const name   = m.full_name || 'Member';
        const avatar = m.avatar_url || avatarUrl(name);
        const job    = _homeValidPosition(m.job_title);
        return `
            <div class="active-member-row" onclick="location.href='dashboard.html?user_id=${m.id}'">
                <div class="active-member-avatar-wrap">
                    <img src="${avatar}" onerror="this.src='${avatarUrl(name)}'">
                    ${showOnline ? '<div class="online-dot"></div>' : ''}
                </div>
                <div class="active-member-info">
                    <div class="active-member-name">${safeText(name)}</div>
                    ${job ? `<div class="active-member-job">${safeText(job)}</div>` : ''}
                </div>
            </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════
//  RIGHT SIDEBAR — BIRTHDAYS
// ══════════════════════════════════════════════════

async function loadBirthdays() {
    const widget = document.getElementById('birthdaysWidget');
    const list   = document.getElementById('birthdaysList');
    if (!list || !widget) return;

    try {
        const today = new Date();
        const mm    = String(today.getMonth() + 1).padStart(2, '0');
        const dd    = String(today.getDate()).padStart(2, '0');

        // Query profiles where birthdate month+day matches today
        const { data, error } = await _supaHome
            .from('profiles')
            .select('id, full_name, avatar_url, birthdate')
            .not('birthdate', 'is', null);

        if (error || !data?.length) return;

        const bdays = data.filter(p => {
            if (!p.birthdate) return false;
            const d = new Date(p.birthdate);
            return String(d.getMonth() + 1).padStart(2, '0') === mm &&
                   String(d.getDate()).padStart(2, '0') === dd;
        });

        if (!bdays.length) return;

        widget.style.display = 'block';
        list.innerHTML = bdays.map(p => {
            const name   = p.full_name || 'Member';
            const avatar = p.avatar_url || avatarUrl(name);
            return `
                <div class="birthday-row">
                    <img src="${avatar}" onerror="this.src='${avatarUrl(name)}'">
                    <div class="birthday-info">
                        <div class="birthday-name">${safeText(name)}</div>
                        <div class="birthday-label">🎂 Birthday today!</div>
                    </div>
                    <button class="birthday-greet-btn" onclick="sendBirthdayGreeting('${safeText(name)}')">
                        Send Greeting
                    </button>
                </div>`;
        }).join('');
    } catch (e) {
        // silently skip if birthdate column doesn't exist
    }
}

async function sendBirthdayGreeting(name) {
    const user = getUser();
    if (!user) return;
    // Post a birthday greeting to forum_posts
    const { data: authData } = await _supaHome.auth.getUser();
    await _supaHome.from('forum_posts').insert({
        user_id:   authData?.user?.id,
        user_name: user.name,
        user_img:  user.image || '',
        subject:   '',
        content:   `🎂 Happy Birthday, ${name}! Wishing you an amazing day! 🎉`,
        is_anonymous: false
    });
    (window.showToast || alert)(`Birthday greeting sent to ${name}! 🎂`, 'success');
    loadHomeFeed();
}

// ══════════════════════════════════════════════════
//  HOME INLINE SEARCH (preserved)
// ══════════════════════════════════════════════════

let _homeSearchTimer = null;

function onHomeSearch(q) {
    document.getElementById('homeSearchClear').style.display = q ? 'flex' : 'none';
    clearTimeout(_homeSearchTimer);
    const resultsEl = document.getElementById('homeSearchResults');
    if (!q.trim()) { resultsEl.classList.remove('visible'); resultsEl.innerHTML = ''; return; }
    resultsEl.classList.add('visible');
    resultsEl.innerHTML = '<div class="hs-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
    _homeSearchTimer = setTimeout(() => runHomeSearch(q.trim()), 300);
}

function clearHomeSearch() {
    document.getElementById('homeSearchInput').value = '';
    document.getElementById('homeSearchClear').style.display = 'none';
    const resultsEl = document.getElementById('homeSearchResults');
    resultsEl.classList.remove('visible');
    resultsEl.innerHTML = '';
}

async function runHomeSearch(q) {
    const pattern = `%${q}%`;
    const [peopleRes, postsRes] = await Promise.all([
        _supaHome.from('profiles')
            .select('id, full_name, avatar_url, job_title, division')
            .or(`full_name.ilike.${pattern},job_title.ilike.${pattern},division.ilike.${pattern}`)
            .limit(6),
        _supaHome.from('forum_posts')
            .select('id, content, user_name, user_id, created_at')
            .or(`content.ilike.${pattern},user_name.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(8)
    ]);

    const people = peopleRes.data || [];
    const posts  = postsRes.data  || [];
    const resultsEl = document.getElementById('homeSearchResults');

    if (!people.length && !posts.length) {
        resultsEl.innerHTML = '<div class="hs-empty">No results found.</div>';
        return;
    }

    let html = '';

    if (people.length) {
        html += `<div class="hs-section-label">People</div>`;
        people.forEach(p => {
            const name   = safeText(p.full_name || 'Realmate Member');
            const job    = safeText(_homeValidPosition(p.job_title));
            const avatar = p.avatar_url || avatarUrl(p.full_name || '?');
            html += `<a href="dashboard.html?user_id=${p.id}" class="hs-people-row">
                <img src="${avatar}" class="hs-avatar" onerror="this.src='${avatarUrl('?')}'">
                <div><div class="hs-name">${name}</div>${job ? `<div class="hs-job">${job}</div>` : ''}</div>
            </a>`;
        });
    }

    if (posts.length) {
        html += `<div class="hs-section-label" style="margin-top:${people.length ? '12px' : '0'}">Posts</div>`;
        posts.forEach(p => {
            const content = safeText((p.content || '').slice(0, 100));
            const poster  = safeText(p.user_name || '');
            html += `<a href="#" class="hs-listing-row" onclick="event.preventDefault(); scrollToPost('${p.id}')">
                <div class="hs-listing-content">${content}${(p.content||'').length > 100 ? '…' : ''}</div>
                ${poster ? `<div class="hs-poster">${poster}</div>` : ''}
            </a>`;
        });
    }

    resultsEl.innerHTML = html;
}

function scrollToPost(id) {
    clearHomeSearch();
    const el = document.getElementById(`hfpost-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ══════════════════════════════════════════════════
//  REAL-TIME FEED — new posts appear at the top live
// ══════════════════════════════════════════════════
let _feedChannel = null;
function subscribeToFeed() {
    if (_feedChannel) return;
    _feedChannel = _supaHome
        .channel('home-feed-realtime')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'forum_posts', filter: 'source=eq.home' },
            (payload) => { handleNewPost(payload.new); })
        .on('postgres_changes',
            // DELETE payloads carry only the primary key (default replica identity),
            // so we cannot server-filter by source; the handler removes the card only
            // if it is actually on the home feed (a harmless no-op otherwise).
            { event: 'DELETE', schema: 'public', table: 'forum_posts' },
            (payload) => { handleDeletedPost(payload.old); })
        .subscribe();
}

// Remote deletion (another device/user removed a post) — drop its card and cache
// entry live, mirroring the local confirmHomeDelete() removal.
function handleDeletedPost(oldRow) {
    const id = oldRow && oldRow.id;
    if (id == null) return;
    document.getElementById(`hfpost-${id}`)?.remove();
    const idx = _homePosts.findIndex(p => p.id == id);
    if (idx !== -1) _homePosts.splice(idx, 1);
}

async function handleNewPost(post) {
    if (!post || post.source !== 'home') return;
    if (_feedFilter.type !== 'all') return;                 // only the default feed streams live
    if (document.getElementById(`hfpost-${post.id}`)) return; // already on screen (e.g. our own post)
    const viewer = getUser();
    if (post.privacy === 'private' && !(viewer && (post.user_name === viewer.name || post.user_id === viewer.supabaseId))) return;

    const feed = document.getElementById('homeFeed');
    if (!feed) return;
    const empty = feed.querySelector('.hf-empty');
    if (empty) feed.innerHTML = '';

    // fetch the shared original if this new post is a re-share
    if (post.shared_post_id && !_sharedOriginals[post.shared_post_id]) {
        const { data } = await _supaHome.from('forum_posts').select(FEED_COLS).eq('id', post.shared_post_id).maybeSingle();
        if (data) _sharedOriginals[data.id] = data;
    }

    _homePosts.unshift(post);
    const card = buildHomePostCard(post, {
        reactCounts: {}, userReaction: null, commentCount: 0, shareCount: 0,
        pollData: post.poll ? { counts: {}, total: 0, userVote: null } : null
    });
    feed.insertBefore(card, feed.firstChild);
    // brief highlight so the new post is noticed
    card.style.transition = 'background 0.7s ease';
    card.style.background = 'rgba(50,205,50,0.08)';
    setTimeout(() => { card.style.background = ''; }, 1600);
}

// ══════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initGuestUI();
    initCreatePost();
    // Deep-link: open the Saved view directly (e.g. from the avatar menu on another page)
    if (location.hash === '#saved' || new URLSearchParams(location.search).get('view') === 'saved') {
        setFeedFilter('saved');
    } else {
        loadHomeFeed();
    }
    loadBirthdays();
    loadTrending();
    loadFollowTopics();
    loadSuggestedRealmates();
    loadMemories();
    subscribeToFeed();
});

// ── Bug 3: Feed search bar — hide on scroll-down, reveal on ANY scroll-up ──
// Mirrors the Portal top-bar pattern (dual scroll-source, rAF-throttled) with an
// added upward-scroll reveal branch so the bar returns immediately without the
// user having to scroll back to the top. Design/markup unchanged — only the
// .search-hidden class toggles. The scroll container on Feed is .main-content
// (body is height:100vh; overflow:hidden), so we listen there and on window.
(function initFeedSearchReveal() {
    const wrap = document.querySelector('.home-search-wrap');
    if (!wrap) return;
    const mc = document.querySelector('.main-content');
    const input = document.getElementById('homeSearchInput');

    // Floating Search FAB — mirrors the Portal Search FAB. When the search bar
    // minimizes on scroll-down (and the write-a-post box has scrolled away), this
    // takes over so search stays one tap away. Tapping it restores the bar in
    // place; it can be dragged anywhere (position kept in memory this session).
    const fab = document.createElement('button');
    fab.className = 'feed-search-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Search');
    fab.innerHTML = '<i class="fas fa-search"></i>';
    document.body.appendChild(fab);

    const getY = () => Math.max(
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        mc ? mc.scrollTop : 0
    );
    const REVEAL_ZONE = 8;   // within this many px of the top → always shown
    const HIDE_AFTER  = 80;  // only start hiding past this scroll depth
    const DOWN_DELTA  = 6;   // downward movement needed to hide (ignore jitter)
    const UP_DELTA    = 6;   // upward movement needed to reveal (ignore jitter)

    // The write-a-post box is pinned into the SAME sticky top bar as the search
    // (CSS makes it sticky on mobile), so both show/hide together as one unit —
    // exactly like Portal's top bar. That's what lets a FAB tap display the
    // search bar AND write-a-post in place, without scrolling anywhere.
    const postCard = document.getElementById('createPostCard');
    let hidden = false;
    function setHidden(next) {
        if (next === hidden) return;
        hidden = next;
        wrap.classList.toggle('search-hidden', next);            // slide the sticky search bar up
        if (postCard) postCard.classList.toggle('post-hidden', next); // and the write-a-post box (same top bar)
        fab.classList.toggle('show', next);                     // FAB takes over while minimized
    }

    let lastY = getY();
    let ticking = false;
    // Mirror the Portal top-bar behaviour exactly: the top bar (search +
    // write-a-post) shows ONLY at the actual top of the feed; any scroll away
    // from the top — up OR down — minimizes it into the floating Search FAB. So
    // the FAB stays available while scrolling in either direction and at the
    // bottom-most post; tapping it peeks the bar back in place (see endDrag), and
    // the next scroll re-minimizes it. Reaching the true top shows it normally.
    function evaluate() {
        const y = getY();
        const dy = y - lastY;
        if (input && input.value)             setHidden(false); // never hide mid-search
        else if (y <= REVEAL_ZONE)            setHidden(false); // at the actual top → top bar shown normally
        else if (Math.abs(dy) >= DOWN_DELTA)  setHidden(true);  // any scroll away from top → minimize into the FAB
        lastY = y;
        ticking = false;
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(evaluate); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    if (mc) mc.addEventListener('scroll', onScroll, { passive: true });

    // ── Drag + tap — identical model to the Portal FAB. A small movement is a
    // tap (restore the search bar, scroll unchanged); a larger one drags the
    // button and it stays where it's dropped (in-memory only, resets on reload). ──
    let dragging = false, moved = false, dragStartX = 0, dragStartY = 0, baseX = 0, baseY = 0;
    let posX = null, posY = null;
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    fab.addEventListener('pointerdown', e => {
        dragging = true; moved = false; dragStartX = e.clientX; dragStartY = e.clientY;
        const r = fab.getBoundingClientRect(); baseX = r.left; baseY = r.top;
        fab.classList.add('dragging');
        try { fab.setPointerCapture(e.pointerId); } catch (_) {}
    });
    fab.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
        if (!moved) return;
        const size = fab.offsetWidth || 48;
        posX = clamp(baseX + dx, 6, window.innerWidth  - size - 6);
        posY = clamp(baseY + dy, 6, window.innerHeight - size - 6);
        fab.style.left = posX + 'px'; fab.style.top = posY + 'px'; fab.style.right = 'auto';
    });
    function endDrag(e) {
        if (!dragging) return; dragging = false;
        fab.classList.remove('dragging');
        try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
        if (!moved) {
            // Tap → show the top bar (search + write-a-post) IN PLACE, wherever
            // the user is (including the bottom-most post). No scrolling — both
            // are sticky, so they simply slide down into view. The next scroll
            // re-minimizes them into the FAB (see evaluate). This mirrors Portal
            // and is NOT a jump-to-top like tapping the Feed tab.
            setHidden(false);
            // The tap hides the FAB (pointer-events:none), so WebKit's follow-up
            // "ghost" click would fall THROUGH to whatever is now under it — e.g.
            // a post's Share button. Swallow that one click so tapping Search only
            // ever triggers Search, never something behind it.
            var swallow = function (ev) {
                ev.preventDefault(); ev.stopPropagation();
                document.removeEventListener('click', swallow, true);
            };
            document.addEventListener('click', swallow, true);
            setTimeout(function () { document.removeEventListener('click', swallow, true); }, 500);
        }
    }
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', () => {
        if (posX == null) return;
        const size = fab.offsetWidth || 48;
        posX = clamp(posX, 6, window.innerWidth  - size - 6);
        posY = clamp(posY, 6, window.innerHeight - size - 6);
        fab.style.left = posX + 'px'; fab.style.top = posY + 'px';
    }, { passive: true });
})();
