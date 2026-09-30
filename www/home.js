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

const PRIVACY_LABELS = { public: 'Public', realmates: 'realmates Only', private: 'Private' };

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
        : { icon: 'fa-user-group', label: 'realmates' };
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
                <img loading="lazy" decoding="async" src="${img}" onerror="this.src='${avatarUrl(name)}'">
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
        <img loading="lazy" decoding="async" src="${avatarSrc}">
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
    if (window.RMEmojiSheet) RMEmojiSheet.close();   // close the mobile emoji sheet with the composer
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
    // @mentions — capture multi-word capitalized names (e.g. "@Mark Zuckerberg").
    // Clicking a mention opens that user's PROFILE directly (desktop + mobile).
    // stopPropagation so a parent card/click handler can't swallow the tap (that was
    // why desktop mentions appeared "not clickable").
    html = html.replace(/@(\p{L}[\p{L}0-9_]*(?:\s\p{Lu}[\p{L}0-9_]*){0,3})/gu,
        (m, name) => `<a class="hf-mention" onclick="event.stopPropagation(); openMentionProfile('${name.trim().replace(/'/g, "\\'")}')">@${name}</a>`);
    return html;
}

// Open an @mentioned user's profile directly (both desktop and mobile) instead of
// running a search. Resolves the typed display name to the account id — exact
// current name first, then a former name (renamed users) — then routes to the
// profile page via rmGoProfile (which the app shell handles on mobile).
async function openMentionProfile(name) {
    name = (name || '').trim();
    if (!name) return;
    let id = null;
    try {
        const r = await _supaHome.from('profiles').select('id').ilike('full_name', name).limit(1);
        id = (r.data && r.data[0]) ? r.data[0].id : null;
        if (!id) {
            const r2 = await _supaHome.from('profiles').select('id').ilike('former_names', '%' + name + '%').limit(1);
            id = (r2.data && r2.data[0]) ? r2.data[0].id : null;
        }
    } catch (e) {}
    if (id) rmGoProfile(String(id), name);
    else (window.showToast || function () {})('Couldn’t open that profile.', 'info');
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
    const out = [];
    const seen = new Set();
    // `former` = the FORMER name that matched, set only when a renamed user is
    // found by an old name — so the suggestion can show "· formerly <old name>"
    // while still carrying the CURRENT name (which is what actually gets
    // inserted). Dedupe by account id so a user never appears twice.
    const add = (id, name, img, former) => {
        if (!name) return;
        const key = id ? ('id:' + id) : ('nm:' + name.toLowerCase());
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ id: id || null, name: name, img: img || avatarUrl(name), former: former || null });
    };
    // Realmates first (prioritized) — then ANY other matching user, so a post can
    // tag anyone, not only accepted realmates. Previously, having realmates meant
    // ONLY realmates were searched, so a letter that matched no realmate showed no
    // suggestions and non-realmates could never be tagged.
    try {
        (await getMyRealmates()).forEach(m => {
            if (m.name && m.name.toLowerCase().includes(ql)) add(m.id, m.name, m.img, null);
        });
    } catch (e) {}
    // Match on the CURRENT name.
    if (out.length < 6) {
        try {
            const { data } = await _supaHome.from('profiles')
                .select('id, full_name, avatar_url').ilike('full_name', `%${q}%`).limit(12);
            (data || []).forEach(p => add(p.id, p.full_name, p.avatar_url, null));
        } catch (e) {}
    }
    // Also match on a FORMER name so a renamed user stays taggable by the name
    // others knew them by. former_names is a newline-joined list of past names;
    // the suggestion shows the current name and flags the matched former one.
    if (out.length < 6) {
        try {
            const { data } = await _supaHome.from('profiles')
                .select('id, full_name, avatar_url, former_names').ilike('former_names', `%${q}%`).limit(12);
            (data || []).forEach(p => {
                const matched = (p.former_names || '').split('\n').map(s => s.trim()).find(s => s.toLowerCase().includes(ql)) || null;
                add(p.id, p.full_name, p.avatar_url, matched);
            });
        } catch (e) {}
    }
    return out.slice(0, 6);
}

// Shared inner markup for a mention-suggestion row: the current name, plus a
// muted "· formerly <old name>" note when the user was matched by a former name.
function _mentionItemInner(c) {
    const former = c.former ? ` <span class="hf-mention-former">· formerly ${safeText(c.former)}</span>` : '';
    return `<img loading="lazy" decoding="async" src="${c.img}"><span>${safeText(c.name)}${former}</span>`;
}

// ── Desktop keyboard navigation for @mention suggestions ─────────────────────
// Arrow Up/Down move the highlight; Enter selects the highlighted user (by
// invoking its existing click handler, so the CURRENT name is inserted) and does
// NOT submit while a suggestion is open. DESKTOP ONLY — on touch devices
// _isTouchNoHover() short-circuits, so mobile keeps its current behavior (Enter
// submits, no highlight). Returns true when it handled the key (caller then
// skips submit). Mouse/click selection is untouched.
function _setMentionActive(items, idx) {
    items.forEach((el, i) => el.classList.toggle('hf-mention-active', i === idx));
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
}
function _mentionKeyNav(e, box) {
    if (_isTouchNoHover()) return false;                       // desktop only
    if (!box || box.style.display !== 'block') return false;
    const items = Array.from(box.querySelectorAll('.hf-mention-item'));
    if (!items.length) return false;
    const idx = items.findIndex(el => el.classList.contains('hf-mention-active'));
    if (e.key === 'ArrowDown') { e.preventDefault(); _setMentionActive(items, idx < 0 ? 0 : (idx + 1) % items.length); return true; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); _setMentionActive(items, idx <= 0 ? items.length - 1 : idx - 1); return true; }
    if (e.key === 'Enter')     { e.preventDefault(); e.stopPropagation(); items[idx >= 0 ? idx : 0].click(); return true; }
    if (e.key === 'Escape')    { e.preventDefault(); box.style.display = 'none'; box.innerHTML = ''; return true; }
    return false;
}
// Default-highlight the first suggestion (desktop) right after a box (re)renders,
// so Enter tags it immediately and the selection is visible.
function _afterMentionRender(box) {
    if (_isTouchNoHover() || !box) return;
    const first = box.querySelector('.hf-mention-item');
    if (first) first.classList.add('hf-mention-active');
}
// Per-input keydown: try mention nav first; only fall through to submit when no
// suggestion consumed the key. Composer is a textarea (Enter = newline), so it
// has no submit fallthrough.
function onHomePostKeydown(e) { _mentionKeyNav(e, document.getElementById('homePostMention')); }
function onCommentKeydown(e, postId) {
    if (_mentionKeyNav(e, document.getElementById(`hfmention-${postId}`))) return;
    if (e.key === 'Enter') submitHomeComment(postId);
}
function onReplyKeydown(e, postId, parentId) {
    if (_mentionKeyNav(e, document.getElementById(`hf-rmention-${parentId}`))) return;
    if (e.key === 'Enter') submitFeedReply(postId, parentId);
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
            `<div class="hf-mention-item" onclick="pickHomePostTag('${c.name.replace(/'/g, "\\'")}')">${_mentionItemInner(c)}</div>`).join('');
        box.style.display = 'block';
        _afterMentionRender(box);
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
                el.innerHTML = `<img loading="lazy" decoding="async" src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
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
// Monotonic load sequence: a loadHomeFeed() that finishes AFTER a newer one
// started (e.g. closing Saved before its slow query returned) must not render
// its stale result over the newer feed.
let _feedLoadSeq = 0;
let _sharedOriginals = {};
let _savedSet = new Set();
const FEED_COLS = 'id, user_id, user_name, user_img, subject, content, media_url, media_type, media_urls, post_type, privacy, poll, hashtags, shared_post_id, album_title, topic, created_at, is_anonymous';

async function loadHomeFeed(feedEl, filterArg, silent) {
    const feed = feedEl || document.getElementById('homeFeed');
    if (!feed) return;
    const mySeq = ++_feedLoadSeq;
    const stale = () => mySeq !== _feedLoadSeq;   // a newer load has superseded this one
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
                if (stale()) return;
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

        // Privacy: hide other members' Private *posts* (per-post setting) + blocked.
        const _viewer = user;
        _homePosts = (posts || []).filter(p =>
            p.privacy !== 'private' ||
            (_viewer && (p.user_name === _viewer.name || p.user_id === _viewer.supabaseId))
        ).filter(p => !(window.RMBR && (RMBR.isBlocked(p.user_id, p.user_name) || RMBR.isPostBlocked('post', p.id))));

        // Account privacy (#8): drop posts whose AUTHOR has a Private account that
        // this viewer isn't allowed into — not mine, not Public, and I don't
        // follow (accepted) or share a Realmate connection with them.
        if (window.RMPriv && typeof RMPriv.postAccessSet === 'function') {
            const _owners = _homePosts.map(p => p.user_id).filter(Boolean);
            const _access = await RMPriv.postAccessSet(_owners);
            _homePosts = _homePosts.filter(p => !p.user_id || _access.set.has(String(p.user_id)));
        }

        // Hide posts whose AUTHOR has DEACTIVATED their account (RMDeact). Fail-open.
        if (window.RMDeact && _homePosts.length) {
            try { _homePosts = await RMDeact.filterItemsByOwner(_homePosts, 'user_id'); } catch (e) {}
        }
        if (!_homePosts.length) {
            if (stale()) return;
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

        if (stale()) return;   // never let a superseded load overwrite the newer feed
        feed.innerHTML = '';
        _homePosts.forEach(post => {
            // Keep the reaction state ON the post object so applyReaction() can
            // adjust it locally and repaint the summary optimistically (no query).
            post.reactCounts  = reactMap[post.id] || {};
            post.userReaction = userReactMap[post.id] || null;
            const card = buildHomePostCard(post, {
                reactCounts:  post.reactCounts,
                userReaction: post.userReaction,
                commentCount: commentMap[post.id] || 0,
                shareCount:   shareMap[post.id] || 0,
                pollData:     pollVoteMap[post.id] || null
            });
            feed.appendChild(card);
        });
        // Wire autoplay + mute control for any videos in the freshly-rendered feed.
        try { if (window.RMFeedVideo) RMFeedVideo.scan(feed); } catch (e) {}

        // Deep link from a notification — scroll to + highlight the exact target.
        // Runs AFTER this render pass, but also polls (the post may not be in the
        // DOM yet on a cold first navigation), so the FIRST click always lands.
        rmConsumeFeedDeepLink();

    } catch (err) {
        console.error('Home feed error:', err);
        feed.innerHTML = `<div class="hf-empty">
            <i class="fas fa-circle-exclamation" style="color:#ef4444;"></i>
            <p>Could not load feed. Please refresh.</p>
        </div>`;
    }
}

// Fetch a single post by id and render its card at the top of the feed — used
// when a notification's target post isn't in the loaded feed page (it's older
// than the most-recent batch). Guarantees a notification can ALWAYS open the
// exact post it references, on the first click. Returns the card element (or
// null if the post no longer exists / isn't accessible). The referenced post is
// always the recipient's own ("reacted to YOUR post"), so no extra access gate.
async function _ensureFeedPostRendered(postId) {
    const feed = document.getElementById('homeFeed');
    if (!feed) return null;
    const existing = document.getElementById(`hfpost-${postId}`);
    if (existing) return existing;
    try {
        const { data: post } = await _supaHome.from('forum_posts').select(FEED_COLS).eq('id', postId).maybeSingle();
        if (!post) return null;
        try { await _resolveLiveAuthors([post]); } catch (e) {}
        // Pull the embedded original for a shared post so its card renders fully.
        if (post.shared_post_id && !_sharedOriginals[post.shared_post_id]) {
            const { data: orig } = await _supaHome.from('forum_posts').select(FEED_COLS).eq('id', post.shared_post_id).maybeSingle();
            if (orig) { try { await _resolveLiveAuthors([orig]); } catch (e) {} _sharedOriginals[orig.id] = orig; }
        }
        // Stats for just this post.
        const [likesRes, commentsRes, sharesRes] = await Promise.all([
            _supaHome.from('forum_likes').select('user_name, reaction').eq('post_id', postId),
            _supaHome.from('forum_comments').select('id').eq('post_id', postId),
            _supaHome.from('forum_posts').select('id').eq('shared_post_id', postId)
        ]);
        const user = getUser();
        const reactCounts = {}; let userReaction = null;
        (likesRes.data || []).forEach(r => {
            const rt = REACTIONS[r.reaction] ? r.reaction : 'like';
            reactCounts[rt] = (reactCounts[rt] || 0) + 1;
            if (user && r.user_name === user.name) userReaction = rt;
        });
        post.reactCounts = reactCounts;
        post.userReaction = userReaction;
        const card = buildHomePostCard(post, {
            reactCounts, userReaction,
            commentCount: (commentsRes.data || []).length,
            shareCount: (sharesRes.data || []).length,
            pollData: null
        });
        feed.insertBefore(card, feed.firstChild);
        if (!_homePosts.find(p => p.id == post.id)) _homePosts.unshift(post);
        try { if (window.RMFeedVideo) RMFeedVideo.scan(feed); } catch (e) {}
        return card;
    } catch (e) { return null; }
}

// Consume a notification deep-link: scroll to + green-highlight the EXACT post
// (and comment/reply, when targeted). Robust by design so the FIRST click always
// lands regardless of how cold the feed is:
//   • polls for the target card to actually exist in the DOM (the feed may still
//     be fetching/rendering right after navigation) — no fixed guess-timeout;
//   • opens the comments thread only when a comment/reply anchor is targeted;
//   • waits for layout to settle (2× rAF) before scrollIntoView so content-
//     visibility cards report their real height and the scroll lands dead-on;
//   • only clears the route keys once consumed, and self-guards against double
//     runs, so calling it from several places (render, pageshow) is safe.
let _deepLinkBusy = false;
async function rmConsumeFeedDeepLink() {
    if (_deepLinkBusy) return;
    let targetPostId = null, targetAnchorId = null;
    try {
        targetPostId = localStorage.getItem('route_target_post_id');
        targetAnchorId = localStorage.getItem('route_target_anchor_id');
    } catch (e) {}
    if (!targetPostId) return;
    _deepLinkBusy = true;
    try {
        // 1) Wait until the target post card is in the DOM (the feed may still be
        //    fetching/rendering right after navigation).
        const deadline = Date.now() + 4000;
        let postEl = document.getElementById(`hfpost-${targetPostId}`);
        while (!postEl && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 120));
            postEl = document.getElementById(`hfpost-${targetPostId}`);
        }
        // 1b) Still not there → the post is older than the loaded feed page. Fetch
        //     and render THAT exact post so the first click always lands on it,
        //     instead of leaving the user on the general Feed.
        if (!postEl) {
            postEl = await _ensureFeedPostRendered(targetPostId);
        }
        if (!postEl) return;   // post genuinely unavailable (deleted / no access)

        // Consumed — clear so a later feed reload doesn't re-trigger the jump.
        try { localStorage.removeItem('route_target_post_id'); localStorage.removeItem('route_target_anchor_id'); } catch (e) {}

        // 2) Only open the comments thread when a comment/reply is the target.
        const wantsComment = !!targetAnchorId && targetAnchorId.indexOf('hf-comment-') === 0;
        if (wantsComment) {
            const commSection = document.getElementById(`hfcomments-${targetPostId}`);
            if (commSection && commSection.style.display === 'none') {
                commSection.style.display = 'block';
                try { initCommentAvatar(parseInt(targetPostId)); } catch (e) {}
                try { await loadHomeComments(parseInt(targetPostId)); } catch (e) {}
            }
            // Wait for the specific comment node to render too.
            const cDeadline = Date.now() + 3000;
            while (!document.getElementById(targetAnchorId) && Date.now() < cDeadline) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // 3) Scroll + highlight the exact target, after layout settles. Prefer the
        //    comment/reply anchor when present; otherwise the post card itself.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const scrollTarget = (wantsComment && document.getElementById(targetAnchorId)) || postEl;
        if (scrollTarget) {
            try { scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            scrollTarget.classList.add('hf-notif-highlight');
            setTimeout(() => { scrollTarget.classList.remove('hf-notif-highlight'); }, 3000);
        }
    } finally {
        _deepLinkBusy = false;
    }
}
// Also run on show (e.g. bfcache restore) in case the feed was already rendered
// when the deep-link key was written.
window.addEventListener('pageshow', () => { try { rmConsumeFeedDeepLink(); } catch (e) {} });

function buildHomePostCard(post, stats) {
    stats = stats || {};
    const reactCounts  = stats.reactCounts || {};
    const userReaction = stats.userReaction || null;
    const commentCount = stats.commentCount || 0;
    const shareCount   = stats.shareCount || 0;

    const user    = getUser();
    const isAnon  = post.is_anonymous;
    const name    = isAnon ? 'Anonymous' : (post.user_name || 'realmate Member');
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
            <img loading="lazy" decoding="async" class="hf-post-avatar" src="${img}" onerror="this.src='${avatarUrl(name)}'"${!isAnon && post.user_id ? ` style="cursor:pointer;" onclick="rmGoProfile('${post.user_id}')"` : ''}>
            <div class="hf-post-meta">
                <div class="hf-post-name"${!isAnon && post.user_id ? ` style="cursor:pointer;" onclick="rmGoProfile('${post.user_id}')"` : ''}>${safeText(name)}${post.shared_post_id ? ' <span class="hf-shared-tag"><i class="fas fa-share"></i> shared a post</span>' : ''}</div>
                <div class="hf-post-time">${timeAgo(post.created_at)} ${privacyBadge(post.privacy)}</div>
            </div>
            <button class="hf-post-menu-btn" onclick="togglePostMenu('${post.id}')"><i class="fas fa-ellipsis-h"></i></button>
            <div class="hf-post-menu" id="hfmenu-${post.id}" style="display:none;">
                <div onclick="toggleSave('${post.id}')"><i class="fas fa-bookmark"></i> ${isSaved ? 'Unsave' : 'Save'} post</div>
                ${!isOwn ? `<div onclick="rmbrReportPost('${post.id}')"><i class="fas fa-flag"></i> Report post</div>` : ''}
                ${!isOwn ? `<div onclick="rmbrHidePost('${post.id}')"><i class="fas fa-eye-slash"></i> Block post</div>` : ''}
                ${!isOwn ? `<div class="hf-menu-danger" onclick="rmbrBlockUserFromPost('${post.id}')"><i class="fas fa-ban"></i> Block user</div>` : ''}
                ${isOwn ? `<div onclick="openEditPost('${post.id}')"><i class="fas fa-pen"></i> Edit post</div>` : ''}
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
                        ontouchstart="reactTouchStart(event,'${post.id}')">
                    <i class="${cur ? cur.icon : 'far fa-thumbs-up'}"></i>
                </button>
                <div class="hf-react-picker" id="hfpicker-${post.id}">
                    ${REACTION_ORDER.map(k => `<button type="button" class="hf-react-opt" data-k="${k}" aria-label="${REACTIONS[k].label}" onclick="setReaction('${post.id}','${k}')" style="--rc:${REACTIONS[k].color}"><span class="hf-react-optlabel">${REACTIONS[k].label}</span><i class="${REACTIONS[k].icon}"></i></button>`).join('')}
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
                        onkeydown="onCommentKeydown(event, '${post.id}')" oninput="onCommentInput('${post.id}', this)" onblur="closeEmojiPickerOnBlur('hfcinput-${post.id}')">
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

// Embedded original post inside a share. Tapping INSIDE this inner card routes to
// the ORIGINAL post (orig.id) in the main Feed — at its natural position, with the
// green highlight. event.stopPropagation() keeps this separate from the outer
// shared-post card (which keeps its own existing behavior). The original author's
// avatar/name still open that author's profile.
function buildSharedEmbed(orig) {
    const name = orig.is_anonymous ? 'Anonymous' : (orig.user_name || 'realmate Member');
    const img  = orig.is_anonymous ? avatarUrl('Anon') : (orig.user_img || avatarUrl(name));
    const profileClick = !orig.is_anonymous && orig.user_id
        ? ` style="cursor:pointer;" onclick="event.stopPropagation();rmGoProfile('${orig.user_id}')"` : '';
    return `<div class="hf-shared-embed" onclick="event.stopPropagation(); openFeedPost('${orig.id}')">
        <div class="hf-shared-head">
            <img loading="lazy" decoding="async" src="${img}" onerror="this.src='${avatarUrl(name)}'"${profileClick}>
            <div>
                <div class="hf-shared-name"${profileClick}>${safeText(name)}</div>
                <div class="hf-shared-time">${timeAgo(orig.created_at)}</div>
            </div>
        </div>
        ${orig.content ? `<div class="hf-shared-text">${linkifyContent(orig.content)}</div>` : ''}
        ${buildPostMedia(orig, { embed: true })}
    </div>`;
}

// Open an exact post (by its own id) in the main Feed — from the Feed, a Profile,
// or anywhere. If we're already on the Feed and the post is present, scroll +
// green-highlight in place; otherwise deep-link into the Feed (rmConsumeFeedDeepLink
// waits for it to render, scrolls to its natural position, and green-highlights).
function openFeedPost(postId) {
    if (postId == null || postId === '') return;
    const here = document.getElementById(`hfpost-${postId}`);
    const onFeed = !!document.getElementById('homeFeed');
    if (onFeed && here) {
        try { if (typeof clearHomeSearch === 'function') clearHomeSearch(); } catch (e) {}
        try { here.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        here.classList.add('hf-notif-highlight');
        setTimeout(() => here.classList.remove('hf-notif-highlight'), 3000);
        return;
    }
    // Not on the Feed (e.g. a Profile) — deep-link by the post's own id.
    try {
        localStorage.setItem('route_target_post_id', String(postId));
        localStorage.removeItem('route_target_anchor_id');
    } catch (e) {}
    location.href = 'home.html';
}

function buildPostMedia(post, opts) {
    // `embed: true` renders the media STATICALLY for a shared-post embed: no image
    // viewer, no video mute button. Those inner handlers would otherwise swallow a
    // tap on the (photo/video-dominated) embedded card, stopping it from routing to
    // the original post. With them removed, a tap anywhere on the embed's media
    // bubbles up to the embed's onclick → openFeedPost(original id).
    const embed = !!(opts && opts.embed);

    if (post.media_type === 'video' && post.media_url) {
        if (embed) {
            // pointer-events:none → clicks pass straight through to the embed card.
            return `<div class="hf-post-media">
                <video class="hf-feed-video" src="${post.media_url}" muted loop playsinline webkit-playsinline preload="metadata" style="width:100%;border-radius:12px;max-height:400px;pointer-events:none;"></video>
            </div>`;
        }
        // Autoplay (muted) + custom mute button — wired by feed-video.js (RMFeedVideo).
        return `<div class="hf-post-media hf-video-wrap">
            <video class="hf-feed-video" src="${post.media_url}" muted loop playsinline webkit-playsinline preload="metadata" style="width:100%;border-radius:12px;max-height:400px;"></video>
            <button class="hf-video-mute" type="button" aria-label="Unmute"><i class="fas fa-volume-xmark"></i></button>
        </div>`;
    }

    // Prefer the multi-photo array; fall back to the legacy single media_url
    let imgs = Array.isArray(post.media_urls) && post.media_urls.length
        ? post.media_urls
        : (post.media_url ? [post.media_url] : []);
    if (!imgs.length) return '';

    // Stash the FULL image list on the media container so a tap can open the
    // viewer at the right photo and swipe through EVERY one — including any hidden
    // behind the collage's "+N". Escaped for the HTML attribute.
    const imgsAttr = JSON.stringify(imgs).replace(/"/g, '&quot;');

    if (imgs.length === 1) {
        if (embed) {
            return `<div class="hf-post-media">
                <img loading="lazy" decoding="async" src="${imgs[0]}" style="width:100%;border-radius:12px;max-height:500px;object-fit:cover;">
            </div>`;
        }
        return `<div class="hf-post-media" data-imgs="${imgsAttr}">
            <img loading="lazy" decoding="async" src="${imgs[0]}" style="width:100%;border-radius:12px;max-height:500px;object-fit:cover;cursor:pointer;"
                onclick="openHomeImgViewer(this,0)">
        </div>`;
    }

    // Multiple photos (album OR a regular multi-picture post): keep the default
    // collage grid ON the post. Tapping any tile opens the image viewer, which is
    // where the user swipes sideways through ALL photos in the post.
    const gridCls = imgs.length === 2 ? 'grid-2' : imgs.length === 3 ? 'grid-3' : 'grid-4';
    const shown = imgs.slice(0, 4);
    if (embed) {
        return `<div class="hf-post-media hf-img-grid ${gridCls}">
            ${shown.map((u, i) => `<div class="hf-img-cell">
                <img loading="lazy" decoding="async" src="${u}">
                ${i === 3 && imgs.length > 4 ? `<span class="hf-img-more">+${imgs.length - 4}</span>` : ''}
            </div>`).join('')}
        </div>`;
    }
    return `<div class="hf-post-media hf-img-grid ${gridCls}" data-imgs="${imgsAttr}">
        ${shown.map((u, i) => `<div class="hf-img-cell" onclick="openHomeImgViewer(this,${i})">
            <img loading="lazy" decoding="async" src="${u}">
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
async function rmbrBlockUserFromPost(id){ const p=_rmbrFindPost(id); if(!p||!window.RMBR) return; const m=document.getElementById('hfmenu-'+id); if(m) m.style.display='none'; const ok=await RMBR.blockUser(p.user_id||null, p.user_name||null); if(ok){ if(typeof _homeApplyBlockFilter==='function') _homeApplyBlockFilter(); else location.reload(); } }
// Block-aware profile navigation from the Feed: never route into a blocked
// user's profile (dashboard.html would just bounce back to the Feed) — show a
// clear message instead (#5).
function _homeNameFor(userId) {
    try { const p = (_homePosts || []).find(p => String(p.user_id) === String(userId)); return p ? p.user_name : null; }
    catch (e) { return null; }
}
function rmGoProfile(userId, name) {
    if (!userId) return;
    // Always route to the profile page. If the viewer BLOCKED this account, the
    // dashboard renders a persistent full-page "You blocked this user" notice
    // (see loadProfile in dashboard-script.js) instead of bouncing to the feed.
    // Handling it there — real page content on a freshly-loaded page — is
    // bulletproof; a tap-triggered overlay on the feed kept getting torn down by
    // the navigation + the profile's old bounce-to-feed, so it only ever flashed.
    location.href = 'dashboard.html?user_id=' + userId;
}

// Re-hide blocked authors/posts whenever the block list finishes loading or
// changes. RMBR initialises asynchronously, so on a fresh load the feed can
// paint a blocked user's post before the block list arrives; and a block made
// here (or in another tab) must drop their posts with no manual refresh (#5).
function _homeApplyBlockFilter() {
    if (!window.RMBR || !Array.isArray(_homePosts)) return;
    _homePosts = _homePosts.filter(p => !(RMBR.isBlocked(p.user_id, p.user_name) || RMBR.isPostBlocked('post', p.id)));
    const keep = new Set(_homePosts.map(p => String(p.id)));
    document.querySelectorAll('[id^="hfpost-"]').forEach(el => {
        if (!keep.has(el.id.replace('hfpost-', ''))) el.remove();
    });
}
document.addEventListener('rmbr:ready', _homeApplyBlockFilter);
document.addEventListener('rmbr:changed', _homeOnBlockChange);

// A block just removes rows (fast, in place). An UNBLOCK must bring a post back
// AT ITS ORIGINAL SLOT (by post time) — filtering can't re-add rows, so re-fetch
// the feed silently (posts return sorted by created_at → the unblocked post
// lands exactly where it was), preserving the scroll position. The reload also
// re-applies the block filter at fetch time, so still-blocked posts stay hidden.
async function _homeOnBlockChange(e) {
    const action = e && e.detail && e.detail.action;
    const feed = document.getElementById('homeFeed');
    // Block (or no feed element / unknown on a non-feed page like the Profile):
    // just drop the affected rows — nothing to restore.
    if (action === 'block' || !feed || typeof loadHomeFeed !== 'function') { _homeApplyBlockFilter(); return; }
    const y = window.scrollY || window.pageYOffset || 0;
    try { await loadHomeFeed(feed, _feedFilter, true); } catch (_) {}
    try { window.scrollTo(0, y); } catch (_) {}
}

// ── Post 3-dot menu → Facebook-style BOTTOM SHEET (adapted from Portal) ───
// Mirrors the Portal kebab menu (toggleLcMenu in livemarket.js): the menu opens
// as a full-width sheet that slides up from the bottom over a dimmed backdrop,
// instead of a fixed dropdown pinned to the button (which clipped against card
// corners / could sit behind other cards, #4). The card's EXISTING
// .hf-post-menu — with its item onclick handlers — is moved into the sheet
// unchanged and returned to the card on close, so options + behaviour don't
// change. Self-contained (injects its own <style> + overlay on first use), so it
// also works on the Profile (dashboard.html), where home.js renders posts too.
let _hfScrollLocked = false;
function _hfBlockTouch(ev) {
    // Let the sheet itself scroll (long menus); block page/momentum scroll behind.
    if (ev.target && ev.target.closest && ev.target.closest('#hfSheet')) return;
    if (ev.cancelable) ev.preventDefault();
}
function _hfLockScroll() {
    if (_hfScrollLocked) return;
    _hfScrollLocked = true;
    document.addEventListener('touchmove', _hfBlockTouch, { passive: false });
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
}
function _hfUnlockScroll() {
    if (!_hfScrollLocked) return;
    _hfScrollLocked = false;
    document.removeEventListener('touchmove', _hfBlockTouch, { passive: false });
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
}
function _hfEnsureSheet() {
    let ov = document.getElementById('hfSheetOverlay');
    if (ov) return ov;
    const st = document.createElement('style');
    st.textContent =
        '#hfSheetOverlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0);display:none;align-items:flex-end;justify-content:center;transition:background .22s ease;}'
      + '#hfSheetOverlay.hf-sheet-open{background:rgba(0,0,0,.45);}'
      + '#hfSheet{background:var(--white,#fff);border-radius:22px 22px 0 0;width:100%;max-width:540px;padding:6px 12px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -8px 34px rgba(15,23,42,.22);transform:translateY(101%);transition:transform .26s cubic-bezier(.2,.8,.2,1);}'
      + '#hfSheetOverlay.hf-sheet-open #hfSheet{transform:translateY(0);}'
      + '#hfSheetGrip{width:40px;height:5px;background:#d7dde5;border-radius:5px;margin:10px auto 6px;}'
      + '#hfSheetBody .hf-post-menu{display:block !important;position:static !important;top:auto;right:auto;border:0;box-shadow:none;min-width:0;background:transparent;overflow:visible;z-index:auto;padding:4px 0;}'
      + '#hfSheetBody .hf-post-menu div{padding:17px 12px;font-size:16px;gap:16px;border-radius:12px;}'
      + '#hfSheetBody .hf-post-menu div i{font-size:18px;width:22px;text-align:center;}'
      + '#hfSheetBody .hf-post-menu div:active{background:#eef2f7;}'
      + 'html[data-theme="dark"] #hfSheet{background:#1e293b;}'
      + 'html[data-theme="dark"] #hfSheetBody .hf-post-menu div:active{background:#0f172a;}';
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.id = 'hfSheetOverlay';
    ov.innerHTML = '<div id="hfSheet"><div id="hfSheetGrip"></div><div id="hfSheetBody"></div></div>';
    ov.addEventListener('click', function (e) {
        // Backdrop tap closes. A menu-item tap runs its own onclick first (target
        // phase), then bubbles here and closes the sheet — so every action also
        // dismisses the menu, like a native bottom sheet.
        if (e.target === ov || e.target.closest('#hfSheetBody .hf-post-menu > div')) closeHfSheet();
    });
    document.body.appendChild(ov);
    return ov;
}
// Close the open sheet: slide it down, fade the backdrop, then return the menu to
// its card and restore scrolling. Idempotent (safe to call when nothing is open).
function closeHfSheet() {
    const ov = document.getElementById('hfSheetOverlay');
    if (!ov || ov.style.display === 'none') { _hfUnlockScroll(); return; }
    const body = document.getElementById('hfSheetBody');
    const m = body ? body.querySelector('.hf-post-menu') : null;
    ov.classList.remove('hf-sheet-open');
    ov.__hfId = null;
    setTimeout(function () {
        if (m) {
            m.style.display = 'none';
            if (m.__hfHome && m.__hfHome.isConnected) m.__hfHome.appendChild(m);
            else if (m.parentNode === body) m.remove();   // card re-rendered → drop orphan
            m.__hfHome = null;
        }
        ov.style.display = 'none';
    }, 260);
    _hfUnlockScroll();
}
function togglePostMenu(postId) {
    const menu = document.getElementById(`hfmenu-${postId}`);
    if (!menu) return;
    const ov = document.getElementById('hfSheetOverlay');
    // Tapping the same post's kebab while its sheet is open toggles it closed.
    if (ov && ov.style.display !== 'none' && String(ov.__hfId) === String(postId)) { closeHfSheet(); return; }
    if (ov && ov.style.display !== 'none') closeHfSheet();   // close any other first
    const sheet = _hfEnsureSheet();
    const box = document.getElementById('hfSheetBody');
    menu.__hfHome = menu.parentNode;
    menu.style.display = 'block';
    box.appendChild(menu);                 // move the REAL menu (keeps item onclick handlers)
    sheet.__hfId = postId;
    sheet.style.display = 'flex';
    _hfLockScroll();
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('hf-sheet-open'); }); });
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

// ── Edit a post (own posts only) ──────────────────────────────────────────
// forum_posts is the single shared source of truth. On save we UPDATE the DB,
// patch this view's card in place, and broadcast so the SAME post updates on the
// other view (Feed <-> Profile shell iframes) with no manual refresh.
let _editPostId = null;
// Media editing state for the post editor. _editExistingMedia = the post's kept
// existing media as {url,type:'image'|'video'} items; _editNewFiles = newly added
// File objects (images and/or a video); _editMediaEditable = whether THIS post
// supports media add/remove (any post except polls). Photos AND videos can be added
// or removed; on save the set is resolved to the same either-video-or-photos model
// the composer and feed renderer already use (see submitHomePost / buildPostMedia).
let _editExistingMedia = [];
let _editNewFiles = [];
let _editMediaEditable = false;
const HOME_EDIT_MAX_MEDIA = 10;
function _ensureHomeEditModal() {
    let m = document.getElementById('homeEditModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'homeEditModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
    m.innerHTML =
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;height:auto;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.2);overflow:hidden;">' +
          '<div style="padding:18px 20px;border-bottom:1px solid #eef2f7;font-weight:800;font-size:18px;color:#0f172a;flex:0 0 auto;">Edit post</div>' +
          '<div style="padding:18px 20px;flex:0 1 auto;overflow-y:auto;display:flex;flex-direction:column;">' +
            // Compact, readable box: fixed height that becomes scrollable for long text
            // (never grows the modal). Larger 17px text for easier reading/editing.
            '<textarea id="homeEditText" style="width:100%;height:150px;max-height:34vh;overflow-y:auto;flex:0 0 auto;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px;font-size:17px;line-height:1.5;font-family:inherit;color:#0f172a;resize:none;box-sizing:border-box;" placeholder="Edit your post"></textarea>' +
            '<div id="homeEditPhotos" style="margin-top:14px;display:none;flex:0 0 auto;">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
                '<span style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">Photos &amp; videos</span>' +
                '<label for="homeEditFile" style="font-size:14px;font-weight:700;color:#0ea5e9;cursor:pointer;"><i class="far fa-image"></i> Add photos/videos</label>' +
                '<input type="file" id="homeEditFile" accept="image/*,video/*" multiple hidden onchange="onEditPhotosPicked(this)">' +
              '</div>' +
              '<div id="homeEditPhotoGrid" style="display:flex;flex-wrap:wrap;gap:8px;"></div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;padding:14px 20px;border-top:1px solid #eef2f7;flex:0 0 auto;">' +
            '<button onclick="closeEditPost()" style="flex:1;padding:15px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;font-size:15px;font-weight:600;cursor:pointer;">Cancel</button>' +
            '<button id="homeEditSaveBtn" style="flex:1;padding:15px;border-radius:12px;border:none;background:#32cd32;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Save</button>' +
          '</div>' +
        '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) closeEditPost(); });
    document.body.appendChild(m);
    return m;
}
function openEditPost(postId) {
    const menu = document.getElementById('hfmenu-' + postId); if (menu) menu.style.display = 'none';
    const post = (typeof _homePosts !== 'undefined' ? _homePosts : []).find(p => String(p.id) === String(postId));
    _editPostId = String(postId);
    const m = _ensureHomeEditModal();
    document.getElementById('homeEditText').value = (post && post.content) || '';
    // Reset the (singleton) Save button every time the modal opens — otherwise a
    // previous save left it stuck on "Saving…"/disabled and the next edit couldn't save.
    const _sb = document.getElementById('homeEditSaveBtn');
    if (_sb) { _sb.disabled = false; _sb.textContent = 'Save'; _sb.onclick = saveEditPost; }

    // Media add/remove is offered for every post EXCEPT polls. It shows exactly the
    // media the post currently displays (a video post → its video; otherwise its
    // photos) as removable tiles, and lets the user add more photos/videos.
    const isPoll = !!(post && post.poll);
    _editMediaEditable = !!post && !isPoll;
    _editExistingMedia = [];
    _editNewFiles = [];
    if (_editMediaEditable) {
        if (post.media_type === 'video' && post.media_url) {
            _editExistingMedia = [{ url: post.media_url, type: 'video' }];
        } else {
            const urls = (Array.isArray(post.media_urls) && post.media_urls.length)
                ? post.media_urls.filter(Boolean)
                : (post.media_url ? [post.media_url] : []);
            _editExistingMedia = urls.map(u => ({ url: u, type: 'image' }));
        }
    }
    const photoSec = document.getElementById('homeEditPhotos');
    if (photoSec) photoSec.style.display = _editMediaEditable ? 'block' : 'none';
    _renderEditPhotoGrid();

    m.style.display = 'flex';
    setTimeout(function () { var t = document.getElementById('homeEditText'); if (t) t.focus(); }, 50);
}
// Render the editor's media thumbnails: kept existing media first, then new files.
// Each tile shows an image or a (muted, poster-like) video, with a remove button.
function _renderEditPhotoGrid() {
    const grid = document.getElementById('homeEditPhotoGrid');
    if (!grid) return;
    grid.innerHTML = '';
    // Build a tile for the given kind ('image'|'video'); returns the media element
    // (an <img> or <video>) so the caller can set its src.
    const tile = (kind, onRemove) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f1f5f9;';
        const mediaTag = kind === 'video'
            ? '<video muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>' +
              '<span style="position:absolute;left:3px;bottom:3px;color:#fff;font-size:11px;text-shadow:0 1px 2px rgba(0,0,0,.6);pointer-events:none;"><i class="fas fa-play"></i></span>'
            : '<img style="width:100%;height:100%;object-fit:cover;">';
        d.innerHTML = mediaTag +
            '<button type="button" aria-label="Remove media" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(15,23,42,.75);color:#fff;font-size:12px;line-height:1;cursor:pointer;">&times;</button>';
        d.querySelector('button').onclick = onRemove;
        grid.appendChild(d);
        return d.querySelector(kind === 'video' ? 'video' : 'img');
    };
    _editExistingMedia.forEach((item, i) => {
        const el = tile(item.type, () => { _editExistingMedia.splice(i, 1); _renderEditPhotoGrid(); });
        el.src = item.url;
    });
    _editNewFiles.forEach((file, j) => {
        const isVideo = (file.type || '').startsWith('video/');
        const el = tile(isVideo ? 'video' : 'image', () => { _editNewFiles.splice(j, 1); _renderEditPhotoGrid(); });
        if (isVideo) { el.src = URL.createObjectURL(file); }
        else { const r = new FileReader(); r.onload = e => { el.src = e.target.result; }; r.readAsDataURL(file); }
    });
}
// File-input handler: append newly chosen photos/videos (capped at the max total).
function onEditPhotosPicked(input) {
    const chosen = Array.from(input.files || []);
    const room = Math.max(0, HOME_EDIT_MAX_MEDIA - _editExistingMedia.length - _editNewFiles.length);
    if (chosen.length > room) (window.showToast || function(){})('Up to ' + HOME_EDIT_MAX_MEDIA + ' items — extras skipped.', 'info');
    _editNewFiles = _editNewFiles.concat(chosen.slice(0, room));
    input.value = '';
    _renderEditPhotoGrid();
}
function closeEditPost() {
    const m = document.getElementById('homeEditModal'); if (m) m.style.display = 'none';
    _editPostId = null;
}
async function saveEditPost() {
    if (!_editPostId) return;
    const id = _editPostId;
    const text = (document.getElementById('homeEditText').value || '').trim();
    const btn = document.getElementById('homeEditSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
    try {
        const patch = { content: text };
        try { if (typeof extractHashtags === 'function') patch.hashtags = extractHashtags(text); } catch (e) {}

        // Upload any newly added files, combine with the kept existing media, then
        // persist the set (additions AND removals, including clearing everything —
        // which turns the post back into a text post). The set is resolved to the
        // SAME either-video-or-photos model the composer uses (submitHomePost) and
        // the feed renders (buildPostMedia): if a video is present it becomes a video
        // post (single video), otherwise a photo post with the kept/added images.
        let mediaPatch = null;
        if (_editMediaEditable) {
            const uploaded = [];   // {url, type}
            for (let i = 0; i < _editNewFiles.length; i++) {
                const file = _editNewFiles[i];
                const isVideo = (file.type || '').startsWith('video/');
                const ext  = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg'));
                const path = `posts/${Date.now()}_${i}.${ext}`;
                const { error: upErr } = await _supaHome.storage.from('images').upload(path, file, { upsert: true });
                if (upErr) throw upErr;
                uploaded.push({ url: _supaHome.storage.from('images').getPublicUrl(path).data.publicUrl, type: isVideo ? 'video' : 'image' });
            }
            const finalItems = _editExistingMedia.concat(uploaded);
            const videoUrl   = (finalItems.find(it => it.type === 'video') || {}).url || null;
            const imageUrls  = finalItems.filter(it => it.type === 'image').map(it => it.url);
            patch.media_url  = videoUrl || imageUrls[0] || null;
            patch.media_type = videoUrl ? 'video' : (imageUrls[0] ? 'image' : null);
            patch.media_urls = videoUrl ? [] : imageUrls;   // renderer ignores media_urls for a video post
            patch.post_type  = videoUrl ? 'video' : (imageUrls.length ? 'photo' : 'text');
            mediaPatch = { media_urls: patch.media_urls, media_url: patch.media_url, media_type: patch.media_type, post_type: patch.post_type };
        }

        const { error } = await _supaHome.from('forum_posts').update(patch).eq('id', id);
        if (error) throw error;
        _applyPostEdit(id, text, mediaPatch);
        try { localStorage.setItem('rm_post_edited', JSON.stringify({ id: String(id), content: text, media: mediaPatch, t: Date.now() })); } catch (e) {}
        // Restore the button BEFORE closing so the reused modal is clean next time.
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        closeEditPost();
        (window.showToast || function () {})('Post updated.', 'success');
    } catch (e) {
        (window.showToast || alert)('Could not save changes: ' + (e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}
// Patch a rendered post card's text + photos + in-memory copy (editor + storage
// listener). mediaPatch is null for text-only edits, or {media_urls, media_url,
// media_type, post_type} when the photo set changed.
function _applyPostEdit(id, content, mediaPatch) {
    let post = null;
    try {
        if (typeof _homePosts !== 'undefined' && _homePosts) {
            post = _homePosts.find(x => String(x.id) === String(id));
            if (post) {
                post.content = content;
                if (mediaPatch) {
                    post.media_urls = mediaPatch.media_urls || [];
                    post.media_url  = mediaPatch.media_url || null;
                    post.media_type = mediaPatch.media_type || null;
                    post.post_type  = mediaPatch.post_type || post.post_type;
                }
            }
        }
    } catch (e) {}
    const card = document.getElementById('hfpost-' + id); if (!card) return;
    // Scope selectors to the post's OWN text/media, NOT the nested .hf-shared-embed
    // (a share card embeds the original, which has its own .hf-post-text/.hf-post-media).
    // Without this, editing/patching a share wiped the EMBEDDED original's content.
    const _own = sel => Array.from(card.querySelectorAll(sel)).find(x => !x.closest('.hf-shared-embed'));
    let el = _own('.hf-post-text');
    if (content && content.length) {
        if (!el) {
            el = document.createElement('div'); el.className = 'hf-post-text';
            const anchor = _own('.hf-album-title') || _own('.hf-post-header');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling); else card.appendChild(el);
        }
        el.innerHTML = (typeof linkifyContent === 'function') ? linkifyContent(content) : content;
    } else if (el) { el.remove(); }

    // Re-render the media block from the updated photo set.
    if (mediaPatch && typeof buildPostMedia === 'function') {
        const mp = post || { media_urls: mediaPatch.media_urls, media_url: mediaPatch.media_url, media_type: mediaPatch.media_type };
        const html = buildPostMedia(mp);
        let mediaEl = _own('.hf-post-media');
        if (html) {
            if (mediaEl) { mediaEl.outerHTML = html; }
            else {
                const tmp = document.createElement('div'); tmp.innerHTML = html;
                const node = tmp.firstElementChild;
                const anchor = _own('.hf-post-text') || _own('.hf-post-header');
                if (node) { if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling); else card.appendChild(node); }
            }
        } else if (mediaEl) { mediaEl.remove(); }
    }
    // Keep SHARES of this post in sync: a shared post embeds the original via
    // shared_post_id and renders it from _sharedOriginals[originalId]. Update that
    // cached original (text + media) and re-render every visible share's embed, so an
    // edit to the original reflects in existing shares instead of leaving them stale
    // or blank. Without this, shares kept old data / showed only the author header.
    _syncSharesOfOriginal(id, content, mediaPatch);
}

// Update the cached shared-original and re-render the embed inside every share card
// that references this original id. Safe no-op if there are no shares of it on screen.
function _syncSharesOfOriginal(originalId, content, mediaPatch) {
    try {
        if (typeof _sharedOriginals === 'undefined' || !_sharedOriginals) return;
        const so = _sharedOriginals[originalId];
        if (!so) return;               // no cached original with author info — don't fabricate one
        so.content = content;
        if (mediaPatch) {
            so.media_urls = mediaPatch.media_urls || [];
            so.media_url  = mediaPatch.media_url || null;
            so.media_type = mediaPatch.media_type || null;
            so.post_type  = mediaPatch.post_type || so.post_type;
        }
        if (!Array.isArray(_homePosts) || typeof buildSharedEmbed !== 'function') return;
        _homePosts.filter(p => p && String(p.shared_post_id) === String(originalId)).forEach(share => {
            const scard = document.getElementById('hfpost-' + share.id);
            const embed = scard && scard.querySelector('.hf-shared-embed');
            if (!embed) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = buildSharedEmbed(so);
            const node = tmp.firstElementChild;
            if (node) embed.replaceWith(node);
        });
    } catch (e) {}
}
// Remove a deleted comment/reply from THIS view and refresh the owning post's
// comment count. Shared by the cross-iframe storage bridge and the realtime
// channel. A top-level comment removes its whole thread node.
function _applyCommentDeleted(commentId, postId, isReply) {
    if (commentId == null) return;
    const node = document.getElementById(isReply ? `hf-comment-${commentId}` : `hf-thread-${commentId}`)
        || document.getElementById(`hf-comment-${commentId}`);
    if (node) node.remove();
    if (postId != null && document.getElementById(`hfstats-${postId}`)) {
        try { updateCommentCount(postId); } catch (_) {}
    }
}

window.addEventListener('storage', function (e) {
    if (e.key === 'rm_post_deleted' && e.newValue) {
        try { var d = JSON.parse(e.newValue); if (d && d.id) document.getElementById('hfpost-' + d.id)?.remove(); } catch (_) {}
    }
    if (e.key === 'rm_comment_deleted' && e.newValue) {
        try { var cd = JSON.parse(e.newValue); if (cd && cd.id) _applyCommentDeleted(cd.id, cd.postId, cd.isReply); } catch (_) {}
    }
    if (e.key === 'rm_post_edited' && e.newValue) {
        try { var ed = JSON.parse(e.newValue); if (ed && ed.id) _applyPostEdit(String(ed.id), ed.content || '', ed.media || null); } catch (_) {}
    }
    // #5: a Realmate was removed elsewhere — re-check post access and drop any
    // posts in this feed that are no longer visible (e.g. that ex-Realmate's, if
    // I don't otherwise follow them / they're not Public).
    if (e.key === 'rm_mate_removed' && e.newValue && window.RMPriv && Array.isArray(typeof _homePosts !== 'undefined' ? _homePosts : null)) {
        (async function () {
            try {
                var owners = _homePosts.map(function (p) { return p.user_id; }).filter(Boolean);
                var access = await RMPriv.postAccessSet(owners);
                _homePosts.forEach(function (p) {
                    if (p.user_id && !access.set.has(String(p.user_id))) document.getElementById('hfpost-' + p.id)?.remove();
                });
                _homePosts = _homePosts.filter(function (p) { return !p.user_id || access.set.has(String(p.user_id)); });
            } catch (_) {}
        })();
    }
});

// ── Reactions (Like / Love / Celebrate / Insightful / Helpful) ──
const _reactHideTimers = {};
// Posts where the user JUST removed their reaction: don't resurface the picker
// (the emoji "suggestions") while the pointer is still on the button — the intent
// was to remove, not to pick another. One-shot: cleared when the pointer leaves,
// so a later deliberate hover still opens it normally.
const _reactPickerSuppressed = {};

// True on touch phones/tablets (primary input can't hover). There a single tap
// synthesizes a mouseenter, so the hover-open must stand down — one tap should
// just Like the post, not pop the emoji "suggestions". The picker opens only via
// the long-press gesture (which calls showReactPicker with force=true).
function _isTouchNoHover() {
    try { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches); } catch (e) { return false; }
}

function showReactPicker(postId, force) {
    // A long-press (force) must ALWAYS open the picker — even right after an unlike.
    // It also CLEARS the one-shot unlike-suppression: on touch there is no mouseleave
    // to clear it, so without this the picker could never reopen after unliking (the
    // "after unliking, can only Like — no emoji" bug).
    if (force) {
        delete _reactPickerSuppressed[postId];
        clearTimeout(_reactHideTimers[postId]);
        const picker = document.getElementById(`hfpicker-${postId}`);
        if (picker) picker.classList.add('open');
        return;
    }
    if (_reactPickerSuppressed[postId]) return;   // just unreacted (hover) — keep suggestions hidden
    if (_isTouchNoHover()) return;                 // tap on a phone → plain Like, no picker
    clearTimeout(_reactHideTimers[postId]);
    const picker = document.getElementById(`hfpicker-${postId}`);
    if (picker) picker.classList.add('open');
}
function scheduleHideReactPicker(postId) {
    clearTimeout(_reactHideTimers[postId]);
    delete _reactPickerSuppressed[postId];        // pointer left → clear the one-shot suppression
    _reactHideTimers[postId] = setTimeout(() => {
        document.getElementById(`hfpicker-${postId}`)?.classList.remove('open');
    }, 260);
}

// ── Facebook-style press-and-drag reaction picker (touch) ────────────────
// Hold the Like button → after a short hold the picker pops up; keep the finger
// down and slide across the emojis: the one under the finger scales up and shows
// its name, updating live as you move. Release over an emoji to pick it (release
// off any emoji cancels). One continuous gesture — no release-and-tap-each.
// `_reactTouchTimer` stays as the "held" flag so the button's onclick
// (quickReact) is suppressed after a hold; a plain quick tap still toggles Like.
let _reactTouchTimer = null;
let _rg = null;   // active reaction-gesture state

function _rgTeardownListeners() {
    document.removeEventListener('touchmove', _reactTouchMove, { passive: false });
    document.removeEventListener('touchend', _reactTouchEnd, { passive: false });
    document.removeEventListener('touchcancel', _reactTouchEnd, { passive: false });
}

// Highlight the emoji currently under the finger (and only that one), so its
// scale-up + name bubble track the finger. Mirrors the desktop :hover state via
// the .rm-hover class. Records the hovered reaction key on the gesture.
function _rgHighlightAt(x, y) {
    if (!_rg || !_rg.opened) return;
    const picker = document.getElementById('hfpicker-' + _rg.postId);
    if (!picker) return;
    picker.querySelectorAll('.hf-react-opt.rm-hover').forEach(o => o.classList.remove('rm-hover'));
    const el = document.elementFromPoint(x, y);
    const opt = el && el.closest ? el.closest('.hf-react-opt') : null;
    if (opt && picker.contains(opt)) {
        opt.classList.add('rm-hover');
        _rg.current = opt.getAttribute('data-k');
    } else {
        _rg.current = null;
    }
}

function reactTouchStart(e, postId) {
    const t = (e.touches && e.touches[0]) || e;
    delete _reactPickerSuppressed[postId];   // a fresh press starts clean (touch has no mouseleave to clear it)
    _rg = { postId: postId, x0: t.clientX, y0: t.clientY, opened: false, moved: false, current: null, timer: null };
    // Suppress text selection / the iOS callout for the whole gesture so dragging
    // across the picker can never select the post body (#3). Cleared on release.
    document.body.classList.add('rm-reacting');
    // Pop the picker after a short hold. A quick tap never gets here → onclick
    // (quickReact) handles the plain Like toggle.
    _rg.timer = setTimeout(function () {
        if (!_rg) return;
        _rg.opened = true;
        _reactTouchTimer = 'held';          // tell quickReact to stand down
        showReactPicker(postId, true);      // long-press → force the picker open (bypasses the touch guard)
        _rgHighlightAt(_rg.x0, _rg.y0);
    }, 300);
    document.addEventListener('touchmove', _reactTouchMove, { passive: false });
    document.addEventListener('touchend', _reactTouchEnd, { passive: false });
    document.addEventListener('touchcancel', _reactTouchEnd, { passive: false });
}

function _reactTouchMove(e) {
    if (!_rg) return;
    const t = (e.touches && e.touches[0]) || e;
    if (Math.abs(t.clientX - _rg.x0) > 6 || Math.abs(t.clientY - _rg.y0) > 6) _rg.moved = true;
    if (_rg.opened) {
        // The picker is open — this gesture is now dedicated to choosing a
        // reaction: block page scroll and live-track the emoji under the finger.
        if (e.cancelable) e.preventDefault();
        _rgHighlightAt(t.clientX, t.clientY);
    } else if (_rg.moved) {
        // Finger moved before the hold completed → the user is scrolling, not
        // reacting. Abort so the feed scrolls normally.
        clearTimeout(_rg.timer);
        _rgTeardownListeners();
        document.body.classList.remove('rm-reacting');
        _rg = null;
    }
}

function _reactTouchEnd(e) {
    if (!_rg) return;
    const g = _rg;
    clearTimeout(g.timer);
    _rgTeardownListeners();
    if (g.opened) {
        if (e && e.cancelable) e.preventDefault();   // suppress the trailing click
        const picker = document.getElementById('hfpicker-' + g.postId);
        if (picker) picker.querySelectorAll('.rm-hover').forEach(o => o.classList.remove('rm-hover'));
        if (g.current) applyReaction(g.postId, _reactionToggleType(g.postId, g.current));   // release over an emoji → pick it (same one again = remove)
        if (picker) picker.classList.remove('open');
        // Reset the held flag shortly after (covers the case where the trailing
        // click never fires, so the next tap isn't swallowed by quickReact).
        setTimeout(function () { if (_reactTouchTimer === 'held') _reactTouchTimer = null; }, 350);
    }
    // Drop any stray selection, then re-enable normal text selection a tick later.
    try { const s = window.getSelection && window.getSelection(); if (s) s.removeAllRanges(); } catch (e2) {}
    setTimeout(function () { document.body.classList.remove('rm-reacting'); }, 60);
    _rg = null;
}

// Tapping the main button toggles the current reaction (default: Like)
function quickReact(postId) {
    if (_reactTouchTimer === 'held') { _reactTouchTimer = null; return; } // long-press already opened picker
    const btn = document.getElementById(`hfreact-${postId}`);
    const has = btn && btn.classList.contains('reacted');
    if (has) applyReaction(postId, null);      // remove
    else applyReaction(postId, 'like');        // default
}

// Toggle semantics: picking the reaction you ALREADY have removes it, so a user
// can clear their reaction by clicking the same emoji again — no need to open
// another menu or switch to a different one. Works for every reaction. Returns
// null (remove) when `type` matches the post's current reaction, else `type`.
function _reactionToggleType(postId, type) {
    const p = _homePosts.find(x => x.id == postId);
    return (p && p.userReaction === type) ? null : type;
}

function setReaction(postId, type) {
    document.getElementById(`hfpicker-${postId}`)?.classList.remove('open');
    applyReaction(postId, _reactionToggleType(postId, type));
}

async function applyReaction(postId, type) {
    const user = getUser();
    if (!user) { (window.showToast || alert)('Sign in to react.', 'error'); return; }

    // Removing a reaction (unlike): the user's intent is to clear it, so close the
    // reaction picker and suppress it from re-opening while the pointer is still on
    // the button — no "suggestions" should pop up after an unlike. The suppression
    // clears on the next pointer-leave (scheduleHideReactPicker), so a later
    // deliberate hover still shows the picker.
    if (!type) {
        _reactPickerSuppressed[postId] = true;
        document.getElementById(`hfpicker-${postId}`)?.classList.remove('open');
    }

    // Optimistic UI: show the picked reaction on the button IMMEDIATELY so the
    // selected emoji appears the instant the finger releases — the DB writes
    // below (delete old, insert new, owner notification) then run in the
    // background instead of holding the emoji back ~1s. updateReactionUI() at the
    // end reconciles the button + refreshes the accurate reaction counts.
    _setReactionButton(postId, type);

    // Optimistic SUMMARY: adjust the post's in-memory reaction counts locally
    // (drop my previous reaction, add the new one) and repaint the chips+total
    // immediately — so the reaction badge on the post updates the instant I
    // release, instead of waiting on the DB round-trips below. updateReactionUI()
    // reconciles against the true counts afterwards (no visible jump).
    {
        const _p = _homePosts.find(p => p.id == postId);
        if (_p) {
            const counts = Object.assign({}, _p.reactCounts || {});
            const prev = _p.userReaction || null;
            if (prev && counts[prev]) { counts[prev]--; if (counts[prev] <= 0) delete counts[prev]; }
            if (type) counts[type] = (counts[type] || 0) + 1;
            _p.reactCounts = counts;
            _p.userReaction = type || null;
            _renderReactionSummary(postId, counts);
        }
    }

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
        // Subtle sound — ONLY once a reaction is genuinely registered (insert
        // succeeded, type set). Never on removal (type null skips this block) and
        // never from re-renders (updateReactionUI/feed reloads don't run here).
        if (window.RMSound) RMSound.play('react');
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

// Synchronously set the reaction button's icon/color/label — no DB, no await.
// Called OPTIMISTICALLY the instant a reaction is picked so the selected emoji
// appears immediately; the DB write + accurate count refresh happen afterwards.
function _setReactionButton(postId, myType) {
    const btn = document.getElementById(`hfreact-${postId}`);
    if (!btn) return;
    const label = document.getElementById(`hfreactlabel-${postId}`);
    const cur = myType ? REACTIONS[myType] : null;
    btn.classList.toggle('reacted', !!cur);
    btn.style.color = cur ? cur.color : '';
    const icon = btn.querySelector('i');
    if (icon) icon.className = cur ? cur.icon : 'far fa-thumbs-up';
    if (label) label.textContent = cur ? cur.label : 'Like';
}

// Repaint just the reaction summary (chips + total) for a post from a counts
// map — no DB. Shared by the optimistic path and the reconcile below.
function _renderReactionSummary(postId, reactCounts) {
    const stats = document.getElementById(`hfstats-${postId}`);
    if (!stats) return;
    const existing = stats.querySelector('.hf-react-summary');
    const html = reactionSummaryHtml(reactCounts || {}, postId);
    if (existing) existing.remove();
    if (html) stats.insertAdjacentHTML('afterbegin', html);
}

// Reconcile the button + summary against the TRUE counts after a reaction write.
async function updateReactionUI(postId, myType) {
    _setReactionButton(postId, myType);

    const { data: rows } = await _supaHome.from('forum_likes')
        .select('reaction').eq('post_id', postId);
    const counts = {};
    (rows || []).forEach(r => {
        const rt = REACTIONS[r.reaction] ? r.reaction : 'like';
        counts[rt] = (counts[rt] || 0) + 1;
    });

    // Keep the in-memory post state authoritative for the next optimistic tap.
    const _p = _homePosts.find(p => p.id == postId);
    if (_p) { _p.reactCounts = counts; _p.userReaction = myType || null; }

    _renderReactionSummary(postId, counts);
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
        <div class="fp-avatar-wrap"><img loading="lazy" decoding="async" src="${img}" onerror="this.src='${avatarUrl(name)}'">${badge}</div>
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
                        onkeydown="onReplyKeydown(event, '${postId}', '${p.id}')">
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
    // Only the author of THIS comment/reply may delete it — same ownership rule
    // the post card uses (id first, name fallback). Others never see the control,
    // and the DB delete is additionally scoped to the row's own id.
    const _u = typeof getUser === 'function' ? getUser() : null;
    const isOwn = !!_u && ((c.user_id && _u.supabaseId && String(c.user_id) === String(_u.supabaseId)) || (c.user_name && c.user_name === _u.name));
    return `
    <div class="hf-comment${isReply ? ' hf-comment-reply' : ''}" id="hf-comment-${c.id}">
        <img loading="lazy" decoding="async" class="hf-c-avatar" src="${img}" onerror="this.src='${avatarUrl(c.user_name)}'">
        <div class="hf-c-main">
            <div class="hf-c-bubble">
                <div class="hf-c-name">${safeText(c.user_name || 'Member')}${isAuthor ? '<span class="hf-c-badge"><i class="fas fa-circle-check"></i> Author</span>' : ''}</div>
                ${c.content ? `<div class="hf-c-text">${linkifyContent(c.content)}</div>` : ''}
            </div>
            ${c.media_url ? `<img loading="lazy" decoding="async" class="hf-c-photo" src="${c.media_url}" onclick="openHomeImgLightbox('${c.media_url}')">` : ''}
            <div class="hf-c-actions">
                <span class="hf-c-time">${timeAgo(c.created_at)}</span>
                <span class="hf-c-reply" onclick="showFeedReplyInput('${postId}','${replyTarget}'${mentionArg})">Reply</span>
                ${isOwn ? `<span class="hf-c-delete" onclick="deleteFeedComment('${postId}','${c.id}',${isReply ? 'true' : 'false'})">Delete</span>` : ''}
            </div>
        </div>
    </div>`;
}

// Delete the current user's OWN comment or reply (confirmation required). Deleting
// a top-level comment also removes its replies (a thread can't exist without its
// root — Postgres cascades if FK ON DELETE CASCADE exists; we also delete them
// explicitly so it works regardless). The DB delete is scoped to the row id and,
// under RLS, to the owner — so this can never remove another user's content.
let _pendingDeleteComment = null;
function deleteFeedComment(postId, commentId, isReply) {
    _pendingDeleteComment = { postId: String(postId), commentId: String(commentId), isReply: !!isReply };
    const modal = _ensureCommentDeleteModal();
    modal.querySelector('.hf-cdel-title').textContent = isReply ? 'Delete this reply?' : 'Delete this comment?';
    modal.style.display = 'flex';
}
function closeCommentDeleteModal() {
    const m = document.getElementById('hfCommentDeleteModal');
    if (m) m.style.display = 'none';
    _pendingDeleteComment = null;
}
function _ensureCommentDeleteModal() {
    let modal = document.getElementById('hfCommentDeleteModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'hfCommentDeleteModal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:100001; background:rgba(0,0,0,0.45); align-items:center; justify-content:center;';
    modal.innerHTML =
        '<div style="background:#fff; border-radius:20px; padding:32px 28px; max-width:340px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.2);">' +
        '<i class="fas fa-exclamation-triangle" style="font-size:40px; color:#ef4444; margin-bottom:16px;"></i>' +
        '<h3 class="hf-cdel-title" style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px;">Delete this comment?</h3>' +
        '<p style="color:#64748b; font-size:13px; margin:0 0 24px;">This action cannot be undone.</p>' +
        '<div style="display:flex; gap:10px;">' +
        '<button onclick="closeCommentDeleteModal()" style="flex:1; padding:12px; border-radius:10px; border:1px solid #e2e8f0; background:#fff; font-size:14px; font-weight:600; cursor:pointer;">Cancel</button>' +
        '<button id="hfCommentDeleteConfirmBtn" style="flex:1; padding:12px; border-radius:10px; border:none; background:#ef4444; color:#fff; font-size:14px; font-weight:700; cursor:pointer;">Delete</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#hfCommentDeleteConfirmBtn').onclick = confirmCommentDelete;
    return modal;
}
async function confirmCommentDelete() {
    if (!_pendingDeleteComment) return;
    const { postId, commentId, isReply } = _pendingDeleteComment;
    closeCommentDeleteModal();
    try {
        // Cascade: remove this comment's replies first (only for a top-level comment).
        if (!isReply) await _supaHome.from('forum_comments').delete().eq('parent_id', commentId);
        const { error } = await _supaHome.from('forum_comments').delete().eq('id', commentId);
        if (error) throw error;
        // Remove from THIS view immediately (parent removes its whole thread).
        (document.getElementById(isReply ? `hf-comment-${commentId}` : `hf-thread-${commentId}`)
            || document.getElementById(`hf-comment-${commentId}`))?.remove();
        updateCommentCount(postId);
        // Broadcast so the same deletion reflects on the other shell view (Feed ↔
        // Profile iframes) and, via the realtime channel, on other devices.
        try { localStorage.setItem('rm_comment_deleted', JSON.stringify({ id: String(commentId), postId: String(postId), isReply: !!isReply, t: Date.now() })); } catch (e) {}
    } catch (e) {
        console.warn('comment delete failed:', e);
        alert('Sorry, that could not be deleted. Please try again.');
    }
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
    closeEmojiPickerOnBlur('hffreply-' + parentId);   // send closes the picker; no refocus (no keyboard)
    if (window.RMEmojiSheet) RMEmojiSheet.close();   // and the mobile bottom sheet

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
        prev.innerHTML = `<div class="hf-cphoto-thumb"><img loading="lazy" decoding="async" src="${url}"><button onclick="clearCommentPhoto('${postId}')"><i class="fas fa-times"></i></button></div>`;
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
    closeEmojiPickerOnBlur('hfcinput-' + postId);   // send closes the picker; no refocus (no keyboard)
    if (window.RMEmojiSheet) RMEmojiSheet.close();   // and the mobile bottom sheet

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
// Image viewer: a full-screen overlay that shows one photo at a time and lets the
// user swipe/scroll SIDEWAYS through every photo in the post (albums and regular
// multi-photo posts alike). Works on desktop (arrows / ← → / trackpad) and mobile
// (native horizontal swipe). On touch devices, a long-press on the photo offers
// "Save Image". `arg` may be an <img>/tile element (reads the post's data-imgs
// list) or a URL string / array (used for single images like comment photos).
function openHomeImgViewer(arg, index) {
    let imgs;
    if (typeof arg === 'string') imgs = [arg];
    else if (Array.isArray(arg)) imgs = arg.slice();
    else if (arg && arg.closest) {
        const wrap = arg.closest('[data-imgs]');
        try { imgs = wrap ? JSON.parse(wrap.getAttribute('data-imgs')) : null; } catch (e) { imgs = null; }
        if (!imgs || !imgs.length) { const im = arg.tagName === 'IMG' ? arg : arg.querySelector('img'); imgs = im ? [im.src] : []; }
    } else imgs = [];
    imgs = (imgs || []).filter(Boolean);
    if (!imgs.length) return;
    let cur = Math.max(0, Math.min(index | 0, imgs.length - 1));
    const multi = imgs.length > 1;

    const lb = document.createElement('div');
    lb.className = 'hf-viewer';
    lb.innerHTML =
        '<div class="hf-viewer-track">' +
            imgs.map(u => `<div class="hf-viewer-slide"><img decoding="async" src="${u}" draggable="false"></div>`).join('') +
        '</div>' +
        '<button class="hf-viewer-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
        (multi
            ? '<button class="hf-viewer-nav prev" aria-label="Previous photo"><i class="fas fa-chevron-left"></i></button>' +
              '<button class="hf-viewer-nav next" aria-label="Next photo"><i class="fas fa-chevron-right"></i></button>' +
              '<div class="hf-viewer-count"></div>'
            : '');
    document.body.appendChild(lb);

    const track = lb.querySelector('.hf-viewer-track');
    const slides = lb.querySelectorAll('.hf-viewer-slide');
    const countEl = lb.querySelector('.hf-viewer-count');
    const updateCount = () => { if (countEl) countEl.textContent = (cur + 1) + ' / ' + imgs.length; };

    // Move to photo i. scrollIntoView reads the REAL layout, so it lands on the
    // right photo whatever the viewport width is (a plain cur*clientWidth can land
    // between snap points if the width isn't final yet, then snap to the wrong
    // photo). The "settling" window stops the resulting programmatic scroll from
    // being read back as a user swipe (which would corrupt the index/counter).
    let settling = false, settleTimer = null;
    const snapTo = (i, smooth) => {
        cur = Math.max(0, Math.min(i, imgs.length - 1));
        settling = true;
        try { slides[cur].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' }); }
        catch (e) { track.scrollLeft = cur * track.clientWidth; }
        updateCount();
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { settling = false; }, smooth ? 450 : 220);
    };
    const go = (i) => snapTo(i, true);

    // Land on the tapped photo. Double rAF so layout is final before we measure.
    requestAnimationFrame(() => requestAnimationFrame(() => snapTo(cur, false)));

    // Keep the counter in sync as the user swipes/scrolls (ignored while a
    // programmatic move is still settling).
    let raf = null;
    track.addEventListener('scroll', () => {
        if (settling || raf) return;
        raf = requestAnimationFrame(() => { raf = null; const i = Math.round(track.scrollLeft / track.clientWidth); if (i !== cur) { cur = i; updateCount(); } });
    }, { passive: true });

    const close = () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); lb.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); else if (multi && e.key === 'ArrowLeft') go(cur - 1); else if (multi && e.key === 'ArrowRight') go(cur + 1); };
    const onResize = () => { if (!document.body.contains(lb)) { window.removeEventListener('resize', onResize); return; } snapTo(cur, false); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    lb.querySelector('.hf-viewer-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    // Tapping the dark letterbox (not the photo itself) closes — leaves the photo
    // free for a long-press without dismissing the viewer.
    track.addEventListener('click', (e) => { if (e.target === track || (e.target.classList && e.target.classList.contains('hf-viewer-slide'))) close(); });
    if (multi) {
        lb.querySelector('.hf-viewer-nav.prev').addEventListener('click', (e) => { e.stopPropagation(); go(cur - 1); });
        lb.querySelector('.hf-viewer-nav.next').addEventListener('click', (e) => { e.stopPropagation(); go(cur + 1); });
    }

    // Long-press the photo (touch only) → "Save Image".
    _hfAttachLongPressSave(track, () => imgs[cur]);
}
// Back-compat: single-image callers (e.g. comment photos) still open the viewer.
function openHomeImgLightbox(src) { openHomeImgViewer(src, 0); }

// Long-press-to-save on touch devices. A steady press (no scroll) on the photo
// opens a small sheet with "Save Image". We never hijack a swipe: any finger
// movement cancels the press so horizontal navigation stays smooth.
function _hfAttachLongPressSave(root, getUrl) {
    if (!('ontouchstart' in window)) return;   // desktop keeps the native right-click "Save image as"
    let timer = null, sx = 0, sy = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    root.addEventListener('touchstart', (e) => {
        const t = e.target;
        if (!t || t.tagName !== 'IMG') return;   // only over the actual photo
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        cancel();
        timer = setTimeout(() => { timer = null; _hfShowSaveSheet(getUrl()); }, 500);
    }, { passive: true });
    root.addEventListener('touchmove', (e) => {
        if (Math.abs(e.touches[0].clientX - sx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8) cancel();
    }, { passive: true });
    root.addEventListener('touchend', cancel, { passive: true });
    root.addEventListener('touchcancel', cancel, { passive: true });
}

function _hfShowSaveSheet(url) {
    if (!url) return;
    const sheet = document.createElement('div');
    sheet.className = 'hf-save-sheet';
    sheet.innerHTML =
        '<div class="hf-save-card">' +
            '<button class="hf-save-opt" data-act="save"><i class="fas fa-download"></i> Save Image</button>' +
            '<button class="hf-save-opt cancel" data-act="cancel">Cancel</button>' +
        '</div>';
    document.body.appendChild(sheet);
    const done = () => sheet.remove();
    sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) { if (e.target === sheet) done(); return; }
        if (b.dataset.act === 'save') _hfSaveImage(url);   // runs inside this tap = keeps user activation for share/download
        done();
    });
}

async function _hfSaveImage(url) {
    let blob = null;
    const name = (() => { let n = (url.split('/').pop() || 'realmate-photo').split('?')[0]; return /\.(jpe?g|png|webp|gif)$/i.test(n) ? n : n + '.jpg'; })();
    try { blob = await (await fetch(url, { mode: 'cors' })).blob(); } catch (e) { blob = null; }
    if (blob) {
        // Best path on the phone: the native share sheet (iOS shows "Save Image" →
        // Photos). Needs no plugin; falls back to a direct download on desktop/Android.
        try {
            const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                try { await navigator.share({ files: [file] }); } catch (err) { /* user cancelled — do nothing */ }
                return;
            }
            const u = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = u; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 4000);
            if (window.showToast) showToast('Image saved.', 'success');
            return;
        } catch (e) { /* fall through */ }
    }
    // Last resort (CORS-blocked fetch, or downloads unsupported): open the image so
    // the OS long-press "Save to Photos" is available.
    try { window.open(url, '_blank'); } catch (e) {}
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
// The share modal markup + styles live on the Feed page (home.html/home.css).
// Other pages that reuse the feed renderer — a user's Profile (dashboard.html)
// especially — load home.js but NOT that markup/CSS, so Share threw on a null
// element and silently did nothing. Build a self-contained modal on demand when
// it's missing (styles inlined so it looks right without home.css), and reuse
// the page's own modal on the Feed. Fixes Share on other users' profiles.
function _ensureShareModal() {
    if (document.getElementById('sharePostModal')) return;
    if (!document.getElementById('rm-share-modal-css')) {
        const st = document.createElement('style');
        st.id = 'rm-share-modal-css';
        st.textContent =
            '#sharePostModal.share-modal{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}' +
            '#sharePostModal .share-box{background:var(--white,#fff);border-radius:18px;width:92%;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,.25);overflow:hidden;}' +
            '#sharePostModal .share-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border,#e5e7eb);font-size:16px;font-weight:800;color:var(--text-main,#0f172a);}' +
            '#sharePostModal .share-close{border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-sub,#64748b);}' +
            '#sharePostModal .share-body{padding:16px 20px;}' +
            '#sharePostModal .share-body textarea{width:100%;box-sizing:border-box;border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:12px;font-family:inherit;font-size:14px;resize:vertical;outline:none;margin-bottom:12px;}' +
            '#sharePostModal .share-original{border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:12px;background:#fafbfc;}' +
            '#sharePostModal .share-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--border,#e5e7eb);}' +
            '#sharePostModal .share-btn-ghost{padding:10px 18px;border-radius:10px;border:1px solid var(--border,#e5e7eb);background:var(--white,#fff);font-weight:700;font-size:14px;cursor:pointer;color:var(--text-main,#0f172a);}' +
            '#sharePostModal .share-btn-primary{padding:10px 20px;border-radius:10px;border:none;background:var(--primary,#32cd32);color:#fff;font-weight:700;font-size:14px;cursor:pointer;}';
        document.head.appendChild(st);
    }
    const m = document.createElement('div');
    m.id = 'sharePostModal';
    m.className = 'share-modal';
    m.style.display = 'none';
    m.innerHTML =
        '<div class="share-box">' +
          '<div class="share-head">' +
            '<span><i class="fas fa-share" style="margin-right:8px;color:var(--primary,#32cd32);"></i> Share post</span>' +
            '<button class="share-close" onclick="closeShareModal()"><i class="fas fa-times"></i></button>' +
          '</div>' +
          '<div class="share-body">' +
            '<textarea id="shareComment" placeholder="Say something about this…" rows="2"></textarea>' +
            '<div id="shareOriginalPreview" class="share-original"></div>' +
          '</div>' +
          '<div class="share-foot">' +
            '<button class="share-btn-ghost" onclick="closeShareModal()">Cancel</button>' +
            '<button class="share-btn-primary" id="shareSubmitBtn" onclick="submitShare()"><i class="fas fa-share"></i> Share now</button>' +
          '</div>' +
        '</div>';
    document.body.appendChild(m);
}

function sharePost(postId) {
    _ensureShareModal();
    const orig = _homePosts.find(p => p.id == postId) || _sharedOriginals[postId];
    if (!orig) return;
    // Share the underlying original if this post is itself a share
    _sharePostId = orig.shared_post_id || orig.id;
    const target = _sharedOriginals[orig.shared_post_id] || orig;
    const name = target.is_anonymous ? 'Anonymous' : (target.user_name || 'Member');
    document.getElementById('shareComment').value = '';
    document.getElementById('shareOriginalPreview').innerHTML = `
        <div class="hf-shared-head">
            <img loading="lazy" decoding="async" src="${target.user_img || avatarUrl(name)}" onerror="this.src='${avatarUrl(name)}'">
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
    // Capture the NEW share row's id so the share notification (and its click
    // routing) references the SHARE the recipient will actually see — not the
    // original post. All interactions on this share (likes/comments/replies)
    // already key off this row's id via the post card.
    const { data: newShare, error } = await _supaHome.from('forum_posts').insert({
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
    }).select('id').single();
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
            // Route to the SHARE (so the author sees who shared + their words),
            // not the original — falls back to the original id if the row id
            // couldn't be read back for any reason.
            target_post_id: newShare?.id || parseInt(_sharePostId),
            message: 'shared your post.',
            is_read: false
        });
    }
    closeShareModal();
    try { (window.showToast || function () {})('Shared to your feed', 'success'); } catch (e) {}
    // Refresh the Feed only when we're actually on it (the share lands in the main
    // feed). On a Profile page there is no #homeFeed, so skip — the share still
    // succeeded; closing the modal + toast is the confirmation there.
    if (document.getElementById('homeFeed')) setFeedFilter('all');
}

// ══════════════════════════════════════════════════
//  FEED FILTERS (default / Saved / Hashtag / Topic)
// ══════════════════════════════════════════════════
// Called by the shell when the Feed nav tab is tapped while already on Feed:
// normal Feed navigation = the all-feed at the top. Resets any active filter
// (Saved/hashtag/topic) exactly once; if already on the plain feed it just scrolls
// to the top (a no-op when already there) — never a reload, so repeated taps are
// safe and don't break the navbar.
window.__feedNavHome = function () {
    if (_feedFilter.type !== 'all') {
        setFeedFilter('all');   // clears the filter, reloads content once, scrolls up
    } else {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    }
};

function setFeedFilter(type, value) {
    _feedFilter = { type, value: value || null };
    // Closing Saved (or any non-Saved filter): drop the deep-link marker so it can't
    // re-apply Saved on the next reload/return.
    if (type !== 'saved') {
        try {
            if (location.hash === '#saved' || new URLSearchParams(location.search).get('view') === 'saved') {
                history.replaceState(null, '', location.pathname);
            }
        } catch (e) {}
    }
    document.getElementById('rmSideSaved')?.classList.toggle('active', type === 'saved');
    // Close the avatar "Me" menu if the tap came from there
    document.getElementById('navMenu')?.classList.remove('open');
    renderActiveFilter();
    // Silent: keep the current posts on screen until the new filter's posts render.
    // A non-silent load collapsed the feed to a spinner first, which shifted the
    // layout and made the navbar/top bar blink when closing Saved.
    loadHomeFeed(null, null, true);
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
    // Both desktop AND mobile use the bottom-sheet emoji picker (emoji-picker.js) —
    // a proper sheet/card with a drag handle, search and category tabs. Toggle it if
    // it's already open. The old floating popover below is only a fallback if the
    // component failed to load.
    if (window.RMEmojiSheet) {
        if (RMEmojiSheet.isOpen()) RMEmojiSheet.close(); else RMEmojiSheet.open(targetId);
        return;
    }
    const picker = document.getElementById('emojiPicker');
    if (!picker) return;
    if (picker.style.display === 'block' && _emojiTargetId === targetId) { picker.style.display = 'none'; return; }
    _emojiTargetId = targetId;
    document.getElementById('emojiGrid').innerHTML = EMOJIS.map(e => `<button type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
    // Position FIXED to the viewport, not absolute. #emojiPicker lives inside
    // .main-content (overflow-y:auto + side padding, and a sidebar offset on
    // desktop), so absolute positioning was measured from the wrong origin and
    // clipped by that scroll container — hence the mobile overflow and the
    // desktop mis-placement. Fixed + viewport coords is immune to all of that.
    picker.style.position = 'fixed';
    picker.style.display = 'block'; // show first so offset dimensions are measurable
    const r = anchorEl.getBoundingClientRect();
    const margin = 8;
    // Viewport width is UNRELIABLE inside the app-shell iframe (WKWebView reports a
    // layout width wider than the visible screen for BOTH clientWidth AND
    // visualViewport), which is why every viewport-math attempt still overflowed on
    // device. Instead, anchor the picker's RIGHT edge to the emoji button's right
    // edge — the button is always fully on-screen, so getBoundingClientRect() gives
    // a trustworthy on-screen x. Right-aligning to it guarantees the picker can
    // never run past the right edge, regardless of any viewport misreport.
    const vv = window.visualViewport;
    const vw = Math.min(document.documentElement.clientWidth || 9999, vv ? vv.width : 9999);
    const vh = Math.min(window.innerHeight || 9999, vv ? vv.height : 9999);
    // Safety width cap (only bites on very narrow screens; anchor-right-align below
    // is what actually prevents right-edge overflow).
    picker.style.maxWidth = `${Math.max(240, Math.round(vw - margin * 2))}px`;
    const pw = picker.offsetWidth;   // measured AFTER the max-width cap
    const ph = picker.offsetHeight;
    // Horizontal: right-align to the anchor (safe on-screen bound), and also honor
    // the viewport clamp if it happens to be tighter; floor at the left margin.
    let left = Math.min(r.right - pw, vw - pw - margin);
    left = Math.max(margin, left);
    // Vertical: comment/reply emoji buttons sit at the BOTTOM of their card, so open
    // the picker ABOVE the button — it rises out of the comment box (like iMessage)
    // instead of dropping down over the next post's card. The composer's button is at
    // the top, so it opens below (flipping up only if there isn't room).
    const bottomAnchored = /^hfcinput-|^hffreply-/.test(_emojiTargetId || '');
    let top;
    if (bottomAnchored && r.top - ph - 6 >= margin) {
        top = r.top - ph - 6;
    } else {
        top = r.bottom + 6;
        if (top + ph > vh - margin && r.top - ph - 6 >= margin) top = r.top - ph - 6;
    }
    top = Math.max(margin, Math.min(top, vh - ph - margin));
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    const close = e => {
        if (!picker.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
            picker.style.display = 'none'; document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
}
// When the reply input loses focus — e.g. the keyboard's Check/Done button, or a
// tap outside — close the emoji picker for that input so it never floats in the
// wrong place after the keyboard collapses. Tapping inside the picker does NOT
// blur the input (the picker prevents default on mousedown), so this fires only
// on a genuine dismissal, not while the user is picking emojis.
function closeEmojiPickerOnBlur(inputId) {
    if (_emojiTargetId !== inputId) return;
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.style.display = 'none';
    _emojiTargetId = null;
}
function insertEmoji(e) {
    const el = document.getElementById(_emojiTargetId);
    if (!el) return;
    // Insert at the caret (or the end when the box isn't focused). We deliberately
    // DON'T call el.focus(): tapping an emoji must never open the mobile keyboard,
    // and the picker stays open so the user can keep adding emojis. The keyboard
    // only appears when the user taps the typebox itself. Fire an 'input' event so
    // any oninput logic (mention autocomplete, etc.) still runs.
    const focused = (document.activeElement === el);
    const start = focused ? (el.selectionStart ?? el.value.length) : el.value.length;
    const end   = focused ? (el.selectionEnd ?? start) : el.value.length;
    el.value = el.value.slice(0, start) + e + el.value.slice(end);
    const caret = start + e.length;
    // Desktop (has a physical keyboard): refocus so typing can continue. Mobile: never
    // focus — focusing pops the on-screen keyboard, which this flow must avoid.
    if (!_isTouchNoHover()) { el.focus(); try { el.selectionStart = el.selectionEnd = caret; } catch (_) {} }
    else if (focused) { try { el.selectionStart = el.selectionEnd = caret; } catch (_) {} }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
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
        box.innerHTML = cands.map(c => `<div class="hf-mention-item" onclick="pickMention('${postId}','${c.name.replace(/'/g,"\\'")}')">${_mentionItemInner(c)}</div>`).join('');
        box.style.display = 'block';
        _afterMentionRender(box);
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
        box.innerHTML = cands.map(c => `<div class="hf-mention-item" onclick="pickReplyMention('${parentId}','${c.name.replace(/'/g,"\\'")}')">${_mentionItemInner(c)}</div>`).join('');
        box.style.display = 'block';
        _afterMentionRender(box);
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
            <img loading="lazy" decoding="async" src="${p.avatar_url || avatarUrl(p.full_name)}" onerror="this.src='${avatarUrl(p.full_name)}'"
                 onclick="rmGoProfile('${p.id}')">
            <div class="suggested-info" onclick="rmGoProfile('${p.id}')">
                <div class="suggested-name">${safeText(p.full_name || 'realmate Member')}</div>
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
            <div class="active-member-row" onclick="rmGoProfile('${m.id}')">
                <div class="active-member-avatar-wrap">
                    <img loading="lazy" decoding="async" src="${avatar}" onerror="this.src='${avatarUrl(name)}'">
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
                    <img loading="lazy" decoding="async" src="${avatar}" onerror="this.src='${avatarUrl(name)}'">
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
// True only while the search box is focused. The Recent-searches panel is an
// in-flow dropdown that must appear ONLY while the user is actively in the search
// box — never docked in the feed body. This flag gates renderFeedRecent so a late
// account-sync callback (which resolves after the user has tapped away) can't
// resurrect the panel once it's been closed.
let _homeSearchActive = false;

function onHomeSearch(q) {
    document.getElementById('homeSearchClear').style.display = q ? 'flex' : 'none';
    clearTimeout(_homeSearchTimer);
    _hsResetKbd();   // typing invalidates any keyboard highlight/selection
    const resultsEl = document.getElementById('homeSearchResults');
    if (!q.trim()) { renderFeedRecent(); return; }   // empty → show Recent searches
    resultsEl.classList.add('visible');
    resultsEl.innerHTML = '<div class="hs-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
    _homeSearchTimer = setTimeout(() => runHomeSearch(q.trim()), 300);
}

// ── DESKTOP-ONLY keyboard navigation for Feed Search suggestions ───────────────
// Purely an interaction layer over the EXISTING suggestion UI — it does not change
// search logic, recent-search saving, persistence, real-time sync, or which entities
// are searched. ↑/↓ move a highlight; the first Enter SELECTS the highlighted
// suggestion into the input (no execute); a second Enter executes the search.
let _hsIdx = -1, _hsSelected = false;
function _hsIsDesktop() { try { return window.matchMedia('(min-width: 901px)').matches; } catch (e) { return false; } }
function _hsResetKbd() { _hsIdx = -1; _hsSelected = false; }
function _hsRows() {
    const box = document.getElementById('homeSearchResults');
    if (!box || !box.classList.contains('visible')) return [];
    return Array.prototype.slice.call(box.querySelectorAll('.hs-people-row, .hs-listing-row, .hs-recent-row'));
}
function _hsHighlight(i) {
    const rows = _hsRows();
    rows.forEach(function (r) { r.classList.remove('hs-active'); });
    if (i >= 0 && rows[i]) { rows[i].classList.add('hs-active'); try { rows[i].scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    _hsIdx = i;
}
function _hsValueOf(row) {
    const el = row.querySelector('.hs-name, .hs-listing-content, .hs-recent-term');
    return el ? (el.textContent || '').trim() : '';
}
function onHomeSearchKeydown(e) {
    const desktop = _hsIsDesktop();
    const rows = desktop ? _hsRows() : [];
    if (desktop && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) {
        e.preventDefault();
        let i = (_hsIdx < 0 || _hsIdx >= rows.length) ? (e.key === 'ArrowDown' ? -1 : 0) : _hsIdx;
        i = e.key === 'ArrowDown' ? (i + 1) % rows.length : (i <= 0 ? rows.length - 1 : i - 1);
        _hsSelected = false;
        _hsHighlight(i);
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        // FIRST Enter on a highlighted suggestion → place it in the input, don't execute.
        if (desktop && _hsIdx >= 0 && rows[_hsIdx] && !_hsSelected) {
            const v = _hsValueOf(rows[_hsIdx]);
            const inp = document.getElementById('homeSearchInput');
            if (inp && v) {
                inp.value = v;
                const clr = document.getElementById('homeSearchClear'); if (clr) clr.style.display = 'flex';
            }
            _hsSelected = true;                 // next Enter executes
            return;
        }
        // SECOND Enter (or plain Enter / mobile) → execute using the existing logic.
        _hsResetKbd();
        homeSearchCommit();
        return;
    }
    if (e.key === 'Escape') { _hsResetKbd(); }
}

// Focusing the empty search box shows the user's Recent searches.
function onHomeSearchFocus() {
    _homeSearchActive = true;
    if (!(document.getElementById('homeSearchInput').value || '').trim()) {
        renderFeedRecent();
        // Pull account-synced history (searches made on other devices), then re-render.
        if (window.RMSearchHistory && RMSearchHistory.sync) RMSearchHistory.sync('feed', renderFeedRecent);
    }
}
// Leaving the search box (blur / keyboard dismissed) closes the Recent-searches
// panel — same pattern as Portal's onPortalSearchBlur. Deferred so a tap on a
// recent row runs its own handler (navigate) before the panel is hidden.
function onHomeSearchBlur() {
    _homeSearchActive = false;
    setTimeout(function () {
        if (_homeSearchActive) return;   // refocused in the meantime
        const el = document.getElementById('homeSearchResults');
        const inp = document.getElementById('homeSearchInput');
        // Keep it open only if the user is mid-query (typed text still present).
        if (el && !((inp && inp.value) || '').trim()) el.classList.remove('visible');
    }, 180);
}

// Enter commits the term to the persistent Feed history, then searches.
function homeSearchCommit() {
    const q = (document.getElementById('homeSearchInput').value || '').trim();
    if (!q) { renderFeedRecent(); return; }
    if (window.RMSearchHistory) RMSearchHistory.add('feed', q);
    clearTimeout(_homeSearchTimer);
    runHomeSearch(q);
}

function clearHomeSearch() {
    document.getElementById('homeSearchInput').value = '';
    document.getElementById('homeSearchClear').style.display = 'none';
    renderFeedRecent();   // back to Recent searches rather than a blank panel
}

// ── Feed recent-searches (persistent, per-user) ────────────────────────────
function _feedJsEsc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Escape a string for safe use inside a double-quoted HTML attribute (URLs).
function _rsAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Real-time: another tab/iframe/device changed the Feed recent-search list — re-render
// live if the recent panel is currently showing (no refresh needed).
window.addEventListener('rmsh-remote', function (e) {
    if (e && e.detail && e.detail.scope === 'feed') {
        const res = document.getElementById('homeSearchResults');
        if (res && res.classList.contains('visible')) { try { renderFeedRecent(); } catch (_) {} }
    }
});
function renderFeedRecent() {
    const resultsEl = document.getElementById('homeSearchResults');
    if (!resultsEl) return;
    const hist = (window.RMSearchHistory ? RMSearchHistory.list('feed') : []);
    window.__feedRecent = hist;
    if (!hist.length) { resultsEl.classList.remove('visible'); resultsEl.innerHTML = ''; return; }
    let h = `<div class="hs-section-label hs-recent-head">Recent searches<button class="hs-clear-all" onclick="feedClearRecent()">Clear all</button></div>`;
    hist.forEach((e, idx) => {
        // CSS-background media (no <img>, no ui-avatars) → a person always shows a
        // picture or CSS-drawn initials, never a blank/broken slot on iOS.
        const media = RMSearchHistory.mediaHTML(e, { postIcon: 'fa-file-lines' });
        h += `<div class="hs-recent-row" onclick="feedRecentClick(${idx})">
            ${media}
            <div class="hs-recent-body"><div class="hs-recent-term">${safeText(e.label || (isPost ? 'Post' : ''))}</div>${e.sub ? `<div class="hs-recent-sub">${safeText(e.sub)}</div>` : ''}</div>
            <button class="hs-recent-del" aria-label="Remove" onclick="event.stopPropagation(); feedDelRecentKey('${_feedJsEsc(RMSearchHistory.keyOf(e))}')"><i class="fas fa-xmark"></i></button>
        </div>`;
    });
    resultsEl.innerHTML = h;
    // Show ONLY while the search box is focused — never docked in the feed body.
    if (_homeSearchActive) resultsEl.classList.add('visible');
    else resultsEl.classList.remove('visible');
}
// Tapping a recent entry re-opens the actual person/post the user clicked before.
function feedRecentClick(idx) {
    const e = (window.__feedRecent || [])[idx];
    if (!e) return;
    if (e.type === 'person' && e.id) { clearHomeSearch(); rmGoProfile(String(e.id), String(e.label || '')); }
    else if (e.type === 'post' && e.id != null) { scrollToPost(String(e.id)); }
    else {
        const inp = document.getElementById('homeSearchInput');
        if (inp) inp.value = e.label || '';
        document.getElementById('homeSearchClear').style.display = 'flex';
        runHomeSearch(String(e.label || '').trim());
    }
}
function feedDelRecentKey(key) {
    if (window.RMSearchHistory) RMSearchHistory.remove('feed', key);
    renderFeedRecent();
}
function feedClearRecent() {
    if (window.RMSearchHistory) RMSearchHistory.clear('feed');
    renderFeedRecent();
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
    window.__feedSearchResults = { people, posts };   // for the click→save-entity handlers

    if (!people.length && !posts.length) {
        resultsEl.innerHTML = '<div class="hs-empty">No results found.</div>';
        return;
    }

    let html = '';

    if (people.length) {
        html += `<div class="hs-section-label">People</div>`;
        people.forEach((p, idx) => {
            const name   = safeText(p.full_name || 'realmate Member');
            const job    = safeText(_homeValidPosition(p.job_title));
            const avatar = p.avatar_url || avatarUrl(p.full_name || '?');
            // feedPickPerson saves the clicked PERSON to Recent Searches (with their
            // avatar) then opens the profile via rmGoProfile (which handles blocks).
            html += `<a href="dashboard.html?user_id=${p.id}" class="hs-people-row" onclick="event.preventDefault(); feedPickPerson(${idx})">
                <img loading="lazy" decoding="async" src="${avatar}" class="hs-avatar" onerror="this.src='${avatarUrl('?')}'">
                <div><div class="hs-name">${name}</div>${job ? `<div class="hs-job">${job}</div>` : ''}</div>
            </a>`;
        });
    }

    if (posts.length) {
        html += `<div class="hs-section-label" style="margin-top:${people.length ? '12px' : '0'}">Posts</div>`;
        posts.forEach((p, idx) => {
            const content = safeText((p.content || '').slice(0, 100));
            const poster  = safeText(p.user_name || '');
            html += `<a href="#" class="hs-listing-row" onclick="event.preventDefault(); feedPickPost(${idx})">
                <div class="hs-listing-content">${content}${(p.content||'').length > 100 ? '…' : ''}</div>
                ${poster ? `<div class="hs-poster">${poster}</div>` : ''}
            </a>`;
        });
    }

    resultsEl.innerHTML = html;
}

// Clicking a Feed search result saves the actual PERSON/POST (not the typed text)
// to Recent Searches, then navigates.
function feedPickPerson(idx) {
    const p = (window.__feedSearchResults?.people || [])[idx];
    if (!p) return;
    if (window.RMSearchHistory) RMSearchHistory.add('feed', { type: 'person', id: p.id, label: p.full_name || 'realmate Member', sub: _homeValidPosition(p.job_title), img: p.avatar_url || '' });
    clearHomeSearch();
    rmGoProfile(String(p.id), String(p.full_name || ''));
}
function feedPickPost(idx) {
    const p = (window.__feedSearchResults?.posts || [])[idx];
    if (!p) return;
    if (window.RMSearchHistory) {
        const snippet = (p.content || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Post';
        RMSearchHistory.add('feed', { type: 'post', id: p.id, label: snippet, sub: p.user_name || '', img: '' });
    }
    scrollToPost(String(p.id));
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
        .on('postgres_changes',
            // Live edits: a post's text/media changed (here or on another device/user).
            // Re-render that card in place so edits — including newly added photos or
            // videos — show immediately for everyone, no manual refresh.
            { event: 'UPDATE', schema: 'public', table: 'forum_posts' },
            (payload) => { handleEditedPost(payload.new); })
        .on('postgres_changes',
            // A comment/reply was deleted (here or on another device). Remove it from
            // any open thread and refresh the post's comment count in real time.
            // post_id is only present when forum_comments has REPLICA IDENTITY FULL
            // (see content-comment-delete-migration.sql); without it we still remove
            // the node by id and the count self-corrects next time comments open.
            { event: 'DELETE', schema: 'public', table: 'forum_comments' },
            (payload) => {
                const o = payload.old || {};
                if (o.id == null) return;
                const isReply = o.parent_id != null;
                _applyCommentDeleted(o.id, o.post_id, isReply);
            })
        .subscribe();
}

// Remote (or same-user, another tab/device) edit — re-render the card's text +
// media from the fresh row. No-op if the post isn't on this feed. Postgres_changes
// delivers UPDATE to the editor's own client too, so this also guarantees the
// editor sees their change even if the optimistic in-place patch missed anything.
function handleEditedPost(row) {
    if (!row || row.id == null) return;
    if (!document.getElementById('hfpost-' + row.id)) return;   // not on this feed
    const media = {
        media_urls: Array.isArray(row.media_urls) ? row.media_urls : [],
        media_url:  row.media_url || null,
        media_type: row.media_type || null,
        post_type:  row.post_type
    };
    try { _applyPostEdit(String(row.id), row.content || '', media); } catch (e) {}
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
    try { if (window.RMFeedVideo) RMFeedVideo.scan(card); } catch (e) {}
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
        // Consume the marker immediately so it can NEVER re-apply Saved on a later
        // reload — a lingering #saved is what made the Feed navbar bounce back into
        // Saved and refresh repeatedly after the user had closed the filter.
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
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
