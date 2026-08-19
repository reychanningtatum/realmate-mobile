// 🔥 SUPABASE SETUP

const supabaseUrl = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const supabaseKey = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);


// 🔥 GLOBAL DATA

function getUser() {
    return JSON.parse(localStorage.getItem("user")) || {
        name: "Reychan Bernaldez",
        division: "Alveo Land",
        image: "https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32"
    };
}
let user = getUser();

let userSettings = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };
let forumPostToDeleteId = null;

// Keep track of which comment sections are open so they stay open on re-fetch
let openCommentSections = new Set();
// Cache posts globally so interactions can reference parent object authors dynamically
let globalPostsCache = [];
// Remember which comment threads have replies expanded (persists across re-renders)
const expandedForumReplies = new Set();


/**
 * 🚀 UTILITY: SOCIAL MEDIA STYLE RELATIVE TIME CONVERTER
 */
function getRelativeTimestampString(dateString) {
    if (!dateString) return "Recent";
    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return "Recent";
    const now = new Date();
    const differenceInSeconds = Math.floor((now - parsedDate) / 1000);
    if (differenceInSeconds < 60) return "Just now";
    const differenceInMinutes = Math.floor(differenceInSeconds / 60);
    if (differenceInMinutes < 60) return `${differenceInMinutes}m ago`;
    const differenceInHours = Math.floor(differenceInMinutes / 60);
    if (differenceInHours < 24) return `${differenceInHours}h ago`;
    const differenceInDays = Math.floor(differenceInHours / 24);
    if (differenceInDays === 1) return "Yesterday";
    if (differenceInDays < 7) return `${differenceInDays}d ago`;
    const differenceInWeeks = Math.floor(differenceInDays / 7);
    if (differenceInWeeks < 4) return `${differenceInWeeks}w ago`;
    return parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}


/**
 * 🚀 UTILITY: FORMAL METADATA RAW TOOLTIP GENERATOR
 */
function getAbsoluteTimestampTooltip(dateString) {
    if (!dateString) return "Date unavailable";
    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return "Date unavailable";
    return parsedDate.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', hour12: true
    });
}


/**
 * 🚀 SIDEBAR PRIVACY SWITCH SYNC LOGIC
 */
function handleGlobalAnonToggle() {
    const toggleEl = document.getElementById("globalAnonToggle");
    if (!toggleEl) return;
    const isEnabled = toggleEl.checked;
    const label = document.getElementById("anonStatusLabel");
    const badge = document.getElementById("globalAnonBadge");

    if (isEnabled) {
        if (!userSettings.anonName) {
            userSettings.anonName = generateAnonName();
            localStorage.setItem('userSettings', JSON.stringify(userSettings));
        }
        if (label) {
            label.innerText = "Incognito Mode Enabled";
            label.style.color = "var(--primary)";
        }
        if (badge) badge.style.display = "block";
        userSettings.useAnon = true;
    } else {
        if (label) {
            label.innerText = "Identity Visible";
            label.style.color = "var(--text-sub)";
        }
        if (badge) badge.style.display = "none";
        userSettings.useAnon = false;
    }
    localStorage.setItem("userSettings", JSON.stringify(userSettings));
    fetchForumPosts();
}


/**
 * 🚀 MEDIA PREVIEW RENDERS UTILITIES
 */
function previewMedia(event) {
    const file = event.target.files[0];
    const container = document.getElementById("mediaPreviewContainer");
    const img = document.getElementById("imagePreview");
    const video = document.getElementById("videoPreview");

    if (!file) return;

    container.style.display = "block";
    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
        img.src = url;
        img.style.display = "block";
        video.style.display = "none";
    } else if (file.type.startsWith('video/')) {
        video.src = url;
        video.style.display = "block";
        img.style.display = "none";
    }
}

function cleanTextFormatting(str) {
    if (!str) return "";
    return str.replace(/—/g, " ");
}

function clearMediaSelection() {
    const mediaInput = document.getElementById("forumMedia");
    if (mediaInput) mediaInput.value = "";
    const container = document.getElementById("mediaPreviewContainer");
    if (container) container.style.display = "none";
    document.getElementById("imagePreview").src = "";
    document.getElementById("videoPreview").src = "";
}

function scrollToPost(postId) {
    const element = document.getElementById(`post-${postId}`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function goToProfile(userName) {
    window.location.href = `profile.html?user=${encodeURIComponent(userName)}`;
}


/**
 * 🚀 RE-INDEX & RENDER ENGINE DISCUSSIONS
 */
async function fetchForumPosts() {
    const forumFeed = document.getElementById("forumFeed");
    const trendingList = document.getElementById("trendingTopicsList");
    if (!forumFeed) return;

    const { data: posts, error } = await _supabase
        .from('forum_posts')
        .select('*')
        .or('source.eq.forum,source.is.null')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch Error:", error.message);
        if (trendingList) trendingList.innerHTML = `<p style="color: var(--text-sub); font-size: 13px; padding: 10px;">Connection issue. Retrying...</p>`;
        return;
    }

    // Fetch likes and comments separately to avoid needing FK relationships
    const postIds = (posts || []).map(p => p.id);
    let likesMap = {}, commentsMap = {};
    if (postIds.length) {
        const [{ data: likes }, { data: comments }, { data: commentLikes }] = await Promise.all([
            _supabase.from('forum_likes').select('id, post_id, user_name').in('post_id', postIds),
            _supabase.from('forum_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
            _supabase.from('comment_likes').select('id, comment_id, user_name')
        ]);
        (likes || []).forEach(l => { (likesMap[l.post_id] = likesMap[l.post_id] || []).push(l); });
        const clMap = {};
        (commentLikes || []).forEach(cl => { (clMap[cl.comment_id] = clMap[cl.comment_id] || []).push(cl); });
        (comments || []).forEach(c => {
            c.comment_likes = clMap[c.id] || [];
            (commentsMap[c.post_id] = commentsMap[c.post_id] || []).push(c);
        });
    }
    (posts || []).forEach(post => {
        post.forum_likes    = likesMap[post.id]    || [];
        post.forum_comments = commentsMap[post.id] || [];
    });

    // Batch-fetch latest profiles so post author names/avatars are always current
    const nonAnonPosts = (posts || []).filter(p => !p.is_anonymous);
    const uniqueUserIds = [...new Set(nonAnonPosts.filter(p => p.user_id).map(p => p.user_id))];
    const uniqueNames   = [...new Set(nonAnonPosts.filter(p => !p.user_id && p.user_name).map(p => p.user_name))];

    let profileMapById   = {};
    let profileMapByName = {};

    if (uniqueUserIds.length) {
        const { data: byId } = await _supabase
            .from('profiles').select('id, full_name, avatar_url').in('id', uniqueUserIds);
        (byId || []).forEach(p => { profileMapById[p.id] = p; });
    }
    if (uniqueNames.length) {
        const { data: byName } = await _supabase
            .from('profiles').select('id, full_name, avatar_url').in('full_name', uniqueNames);
        (byName || []).forEach(p => { profileMapByName[p.full_name] = p; });
    }

    // Overlay live profile data onto each post
    (posts || []).forEach(post => {
        if (post.is_anonymous) return;
        const p = post.user_id ? profileMapById[post.user_id] : profileMapByName[post.user_name];
        if (p) {
            if (p.full_name)  post.user_name = p.full_name;
            if (p.avatar_url) post.user_img  = p.avatar_url;
        }
    });

    // Save records to memory cache so mutation handlers can read author strings
    globalPostsCache = posts || [];

    if (!posts || posts.length === 0) {
        forumFeed.innerHTML = `<p style="text-align:center; color:var(--text-sub); margin-top:50px;">No discussions yet. Start the conversation!</p>`;
        if (trendingList) trendingList.innerHTML = `<p style="color: var(--text-sub); font-size: 13px; padding: 10px;">Awaiting group activity...</p>`;
        return;
    }

    let rankedPosts = posts.map(post => {
        const likes = post.forum_likes || [];
        const comments = post.forum_comments || [];
        const uniqueLikingUsers = new Set(likes.map(l => l.user_name)).size;
        const uniqueCommentingUsers = new Set(comments.map(c => c.user_name)).size;
        const postDate = new Date(post.created_at);
        const now = new Date();
        const hoursSincePost = Math.max(0, (now - postDate) / (1000 * 60 * 60));

        const score = ((uniqueLikingUsers * 2) + (uniqueCommentingUsers * 5)) / (hoursSincePost + 2);
        const userHasLiked = likes.some(like => like.user_name === user.name);
        return {
            ...post,
            is_anonymous: post.is_anonymous || false,
            engagementScore: score,
            uniqueLikes: uniqueLikingUsers,
            uniqueComments: uniqueCommentingUsers,
            totalLikes: likes.length,
            totalComments: comments.length,
            userHasLiked: userHasLiked
        };
    });

    // Sort by engagement score; fall back to most recent for posts with no activity yet
    const topTrends = [...rankedPosts]
        .sort((a, b) => b.engagementScore - a.engagementScore || new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);

    if (trendingList) {
        trendingList.innerHTML = topTrends.map((t, index) => {
            const currentSettings = JSON.parse(localStorage.getItem("userSettings")) || { anonName: "" };
            const isMine = t.user_name === user.name || (t.is_anonymous && t.user_name === currentSettings.anonName);
            const title = (t.subject && t.subject.trim()) || (t.content || '').slice(0, 60) + ((t.content || '').length > 60 ? '…' : '');
            return `
            <div class="trending-topic-item ${isMine ? 'my-post-trending' : ''}" onclick="scrollToPost(${t.id})"
                 style="cursor: pointer;">
                <div class="trend-rank">${index + 1}</div>
                <div class="trend-info">
                    ${isMine ? '<span class="my-post-badge">MY POST</span>' : ''}
                    <p class="trend-subject">${cleanTextFormatting(title)}</p>
                    <p class="trend-stats">${t.totalLikes} likes • ${t.totalComments} comments</p>
                </div>
            </div>`;
        }).join('');
    }

    const trendingIds = topTrends.map(t => t.id);

    forumFeed.innerHTML = rankedPosts.map(post => {
        const currentSettings = JSON.parse(localStorage.getItem("userSettings")) || { anonName: "" };
        const isMyPost = post.user_name === user.name || (post.is_anonymous && post.user_name === currentSettings.anonName);
        const profileClickAttr = !post.is_anonymous ? `onclick="goToProfile('${post.user_name}')" style="cursor:pointer;"` : "";

        let mediaHTML = post.media_url ? (post.media_type === 'image' ? `<img src="${post.media_url}" class="post-img-display" loading="lazy">` : `<video src="${post.media_url}" controls class="post-img-display"></video>`) : "";

        const relativeTimeDisplay = getRelativeTimestampString(post.created_at);
        const absoluteTimeTooltip = getAbsoluteTimestampTooltip(post.created_at);
        const isOpened = openCommentSections.has(post.id);

        return `
            <div class="post-card" id="post-${post.id}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <img src="${post.user_img || 'https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32'}" class="avatar" ${profileClickAttr}>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <strong class="user-name-text" ${profileClickAttr}>${post.user_name || "Agent"}</strong>
                                ${trendingIds.includes(post.id) ? '<span class="trending-fire">🔥 Trending</span>' : ''}
                            </div>
                            <small class="meta-text">
                                ${post.user_division || 'Alveo Land'} •
                                <span class="timestamp-interactive-badge" title="${absoluteTimeTooltip}">${relativeTimeDisplay}</span>
                            </small>
                        </div>
                    </div>
                    ${isMyPost ? `<i class="fas fa-trash-alt delete-icon" onclick="openForumDeleteModal(${post.id})"></i>` : ''}
                </div>

                ${post.subject ? `<h3 class="post-subject-heading">${cleanTextFormatting(post.subject)}</h3>` : ''}
                <div class="post-content-text">${cleanTextFormatting(post.content)}</div>
                ${mediaHTML}

                <div class="interaction-bar">
                    <div class="interaction-item" onclick="window.toggleLike(${post.id}, ${post.userHasLiked ? 1 : 0})">
                        <i class="fas fa-award ${post.userHasLiked ? 'liked-active' : ''}"></i> <strong>${post.totalLikes}</strong>
                    </div>
                    <div class="interaction-item" onclick="window.toggleCommentSection(${post.id})">
                        <i class="fa-regular fa-comment"></i> <strong>${post.totalComments}</strong>
                    </div>
                </div>

                <div id="comment-section-${post.id}" class="comment-container" style="display: ${isOpened ? 'block' : 'none'};">
                    <div id="comments-list-${post.id}"></div>
                    <div class="comment-composer" style="flex-direction: column; gap: 10px;">
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="comment-input-${post.id}" placeholder="Write a reply..." style="flex: 1;">
                            <button class="neon-btn-sm" onclick="window.addComment(${post.id})">Post</button>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Re-populate comments inside threads that were left open
    for (let id of openCommentSections) {
        await buildCommentsUI(id);
    }

    // --- NOTIFICATION DEEP LINK ROUTING ---
    const targetAnchorId = localStorage.getItem("route_target_anchor_id");
    const targetPostId = localStorage.getItem("route_target_post_id");

    if (targetAnchorId && targetPostId) {
        localStorage.removeItem("route_target_anchor_id");
        localStorage.removeItem("route_target_post_id");

        const postIdNum = parseInt(targetPostId);

        // Open the comment section so comment/reply elements exist in DOM
        const section = document.getElementById("comment-section-" + postIdNum);
        if (section && section.style.display === "none") {
            section.style.display = "block";
            openCommentSections.add(postIdNum);
            await buildCommentsUI(postIdNum);
        }

        // Scroll and highlight
        setTimeout(() => {
            const el = document.getElementById(targetAnchorId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = "all 0.5s ease-in-out";
                el.style.boxShadow = "0 0 0 4px #32cd32";
                el.style.backgroundColor = "rgba(50, 205, 50, 0.05)";
                setTimeout(() => {
                    el.style.boxShadow = "";
                    el.style.backgroundColor = "";
                }, 3000);
            }
        }, 200);
    }
}


/**
 * 🚀 COMMENT COMPOSER MATRIX HANDLING
 */
async function buildCommentsUI(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;

    const { data: comments, error } = await _supabase
        .from('forum_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (error) return console.error(error);

    // Attach comment likes separately
    if (comments && comments.length) {
        const cIds = comments.map(c => c.id);
        const { data: clikes } = await _supabase.from('comment_likes').select('id, comment_id, user_name').in('comment_id', cIds);
        const clMap = {};
        (clikes || []).forEach(cl => { (clMap[cl.comment_id] = clMap[cl.comment_id] || []).push(cl); });
        comments.forEach(c => { c.comment_likes = clMap[c.id] || []; });
    }

    if (comments) {
        // Overlay live profile data on comments and replies
        const nonAnonComments = comments.filter(c => !c.is_anonymous);
        const cUids  = [...new Set(nonAnonComments.filter(c => c.user_id).map(c => c.user_id))];
        const cNames = [...new Set(nonAnonComments.filter(c => !c.user_id && c.user_name).map(c => c.user_name))];
        const cById = {}, cByName = {};
        if (cUids.length) {
            const { data: p } = await _supabase.from('profiles').select('id,full_name,avatar_url').in('id', cUids);
            (p || []).forEach(r => { cById[r.id] = r; });
        }
        if (cNames.length) {
            const { data: p } = await _supabase.from('profiles').select('id,full_name,avatar_url').in('full_name', cNames);
            (p || []).forEach(r => { cByName[r.full_name] = r; });
        }
        comments.forEach(c => {
            if (c.is_anonymous) return;
            const p = c.user_id ? cById[c.user_id] : cByName[c.user_name];
            if (p) { if (p.full_name) c.user_name = p.full_name; if (p.avatar_url) c.user_img = p.avatar_url; }
        });

        const parents = comments.filter(c => !c.parent_id);
        const replies = comments.filter(c => c.parent_id);
        const postAuthor = (globalPostsCache.find(p => p.id === postId) || {}).user_name;

        list.innerHTML = parents.map(p => {
            const childReplies = replies.filter(r => r.parent_id === p.id);
            const n = childReplies.length;
            const authorReplied = childReplies.some(r => !r.is_anonymous && r.user_name === postAuthor);
            const open = expandedForumReplies.has(p.id);
            const toggleText = open
                ? `Hide ${n === 1 ? 'reply' : 'replies'}`
                : `${authorReplied ? '<b>Author replied</b> · ' : ''}View ${n} ${n === 1 ? 'reply' : 'replies'}`;
            return `
            <div class="comment-wrapper" id="comment-element-${p.id}">
                ${renderCommentBubble(p, false, postId, postAuthor)}
                ${n ? `<button class="freplies-toggle" id="freplies-toggle-${p.id}" data-count="${n}" data-author-replied="${authorReplied ? 1 : 0}" onclick="toggleForumReplies(${p.id})">
                    <i class="fas ${open ? 'fa-chevron-up' : 'fa-reply'}"></i> <span class="freplies-toggle-text">${toggleText}</span>
                </button>` : ''}
                <div class="replies-container freplies${open ? ' open' : ''}" id="replies-container-${p.id}"${open ? ' style="max-height:none;overflow:visible;"' : ''}>
                    ${childReplies.map(r => renderCommentBubble(r, true, postId, postAuthor)).join('')}
                </div>
                <div id="reply-input-area-${p.id}" class="reply-input-wrapper-box" style="display:none;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="reply-field-${p.id}" placeholder="Write a reply..." style="flex:1; padding: 10px 16px; border-radius: 12px; border: 1px solid var(--border); font-size: 14px; font-family: inherit;">
                        <button class="neon-btn-sm" onclick="window.addComment(${postId}, ${p.id})">Send</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

window.toggleCommentSection = async function(postId) {
    const section = document.getElementById("comment-section-" + postId);
    if (!section) return;

    if (section.style.display === "none") {
        section.style.display = "block";
        openCommentSections.add(postId);
        await buildCommentsUI(postId);
    } else {
        section.style.display = "none";
        openCommentSections.delete(postId);
    }
};

// Smooth expand / collapse of a comment's replies
window.toggleForumReplies = function(parentId) {
    const box = document.getElementById("replies-container-" + parentId);
    const toggle = document.getElementById("freplies-toggle-" + parentId);
    if (!box) return;
    const isOpen = box.classList.contains('open');
    if (!isOpen) {
        expandedForumReplies.add(parentId);
        box.style.overflow = 'hidden';
        box.classList.add('open');
        box.style.maxHeight = box.scrollHeight + 'px';
        box.addEventListener('transitionend', function te() { box.style.maxHeight = 'none'; box.style.overflow = 'visible'; box.removeEventListener('transitionend', te); });
    } else {
        expandedForumReplies.delete(parentId);
        box.style.overflow = 'hidden';
        box.style.maxHeight = box.scrollHeight + 'px';
        requestAnimationFrame(() => { box.classList.remove('open'); box.style.maxHeight = '0px'; });
    }
    if (toggle) {
        const n = parseInt(toggle.dataset.count) || 0;
        const textEl = toggle.querySelector('.freplies-toggle-text');
        const icon = toggle.querySelector('i');
        const authorPrefix = toggle.dataset.authorReplied === '1' ? '<b>Author replied</b> · ' : '';
        if (textEl) textEl.innerHTML = !isOpen ? `Hide ${n === 1 ? 'reply' : 'replies'}` : `${authorPrefix}View ${n} ${n === 1 ? 'reply' : 'replies'}`;
        if (icon) icon.className = !isOpen ? 'fas fa-chevron-up' : 'fas fa-reply';
    }
};

window.showReplyInput = function(id, targetUser = null) {
    const area = document.getElementById("reply-input-area-" + id);
    if (!area) return;

    if (area.style.display === "none") {
        area.style.display = "block";
    } else if (!targetUser) {
        area.style.display = "none";
    }

    if (targetUser) {
        const field = document.getElementById("reply-field-" + id);
        if (field) {
            field.value = `@${targetUser} ` + field.value.replace(/^@.*?\s{1}/, '');
            field.dataset.mentionedUser = targetUser;
            field.focus();
        }
    }
};


/**
 * 🚀 DISPATCH SUBMISSIONS CREATION
 */
async function createForumPost() {
    user = getUser();
    const textInput = document.getElementById("forumText");
    const subjectInput = document.getElementById("forumSubject");
    const mediaInput = document.getElementById("forumMedia");
    const postBtn = document.getElementById("postBtn");
    const isAnon = userSettings.useAnon;
    const anonNickname = userSettings.anonName;

    const content = textInput.value.trim();
    if (!content) return;

    if (isAnon && !anonNickname) {
        userSettings.anonName = generateAnonName();
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
    }

    postBtn.disabled = true;
    postBtn.innerHTML = `Posting...`;

    try {
        let mediaUrl = null;
        let mediaType = null;

        if (mediaInput && mediaInput.files[0]) {
            const file = await compressImage(mediaInput.files[0]);
            const filePath = `posts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            await _supabase.storage.from('forum-media').upload(filePath, file);
            const { data } = _supabase.storage.from('forum-media').getPublicUrl(filePath);
            mediaUrl = data.publicUrl;
            mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        }

        // ✅ FIXED: was supabase.from('forumposts')
        const { error: insertErr } = await _supabase.from('forum_posts').insert([{
            user_id: isAnon ? null : user.id,
            user_name: isAnon ? anonNickname : user.name,
            user_img: isAnon ? `https://ui-avatars.com/api/?name=${encodeURIComponent(anonNickname)}&background=0f172a&color=fff` : (user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`),
            subject: subjectInput.value.trim() || null,
            content: content,
            media_url: mediaUrl,
            media_type: mediaType,
            is_anonymous: isAnon,
            source: 'forum',
            created_at: new Date()
        }]);

        if (insertErr) throw new Error(insertErr.message);

        textInput.value = "";
        subjectInput.value = "";
        clearMediaSelection();
        await fetchForumPosts();

    } catch (err) {
        alert("Failed to post: " + err.message);
    } finally {
        postBtn.disabled = false;
        postBtn.innerText = "Post Now";
    }
}


/**
 * 🚀 HELPER: COMMENT COMPONENT ELEMENT RENDER HOOKS
 */
function renderCommentBubble(c, isReply = false, postId, postAuthor = null) {
    const isAnon = c.is_anonymous;
    const avatarUrl = isAnon
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user_name)}&background=0f172a&color=fff`
        : (c.user_img && c.user_img.startsWith('http') ? c.user_img : `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user_name)}&background=random`);
    const profileClick = !isAnon ? `onclick="goToProfile('${c.user_name}')" style="cursor:pointer;"` : "";
    const nameClass = !isAnon ? "comment-username clickable-name" : "comment-username";
    const likes = c.comment_likes || [];
    const hasLiked = likes.some(l => l.user_name === user.name);
    const relativeTimeComment = getRelativeTimestampString(c.created_at);
    const absoluteTimeCommentTooltip = getAbsoluteTimestampTooltip(c.created_at);
    const replyTriggerMarkup = isReply
        ? `<span class="reply-trigger" onclick="window.showReplyInput(${c.parent_id}, '${c.user_name}')">Reply</span>`
        : `<span class="reply-trigger" onclick="window.showReplyInput(${c.id})">Reply</span>`;
    return `
        <div class="comment-bubble ${isReply ? 'reply-comment' : ''}" id="reply-element-${c.id}">
            <img src="${avatarUrl}" class="comment-avatar" ${profileClick}>
            <div class="comment-content-wrap">
                <div class="comment-user-header">
                    <span class="header-name-group">
                        <span class="${nameClass}" ${profileClick}>${c.user_name || "Agent"}</span>
                        ${(!isAnon && postAuthor && c.user_name === postAuthor) ? '<span class="comment-author-badge"><i class="fas fa-circle-check"></i> Author</span>' : ''}
                    </span>
                    <span class="comment-timestamp-label" title="${absoluteTimeCommentTooltip}">${relativeTimeComment}</span>
                </div>
                <p class="comment-text">${cleanTextFormatting(c.content)}</p>
                <div class="comment-actions">
                    <div class="comment-interaction ${hasLiked ? 'liked-active' : ''}" onclick="window.toggleCommentLike(${c.id}, ${hasLiked ? 1 : 0}, ${postId})">
                        <i class="fas fa-award"></i> <span>${likes.length}</span>
                    </div>
                    ${replyTriggerMarkup}
                </div>
            </div>
        </div>
    `;
}

window.addComment = async function(postId, parentId = null) {
    user = getUser();
    const inputId = parentId ? "reply-field-" + parentId : "comment-input-" + postId;
    const input = document.getElementById(inputId);
    const content = input ? input.value.trim() : "";
    if (!content) return;

    const isAnonymous = userSettings.useAnon;

    let finalName = user.name;
    let finalImg = (user.image && user.image.startsWith('http')) ? user.image : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;

    if (isAnonymous) {
        if (!userSettings.anonName) {
            userSettings.anonName = generateAnonName();
            localStorage.setItem('userSettings', JSON.stringify(userSettings));
        }
        finalName = userSettings.anonName;
        finalImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(userSettings.anonName)}&background=0f172a&color=fff`;
    }

    const { data: insertedComment, error } = await _supabase
        .from('forum_comments')
        .insert({
            post_id: postId,
            parent_id: parentId,
            user_id: isAnonymous ? null : user.id,
            user_name: finalName,
            user_img: finalImg,
            content: content,
            is_anonymous: isAnonymous,
            created_at: new Date()
        })
        .select()
        .single();

    if (error) {
        alert(error.message);
    } else {
        if (input) input.value = "";
        openCommentSections.add(postId);
        if (parentId) expandedForumReplies.add(parentId); // keep the thread open to show the new reply

        // --- NOTIFICATION ROUTING SYSTEM ---
        try {
            const currentPost = globalPostsCache.find(p => p.id === postId);
            console.log("[Notif] currentPost found:", !!currentPost, "| postId:", postId, "| parentId:", parentId);

            if (currentPost) {
                const truncatedText = content.substring(0, 30) + (content.length > 30 ? "..." : "");
                if (!parentId) {
                    // Someone commented on a post → notify post author
                    console.log("[Notif] Dispatching comment_reply to:", currentPost.user_name);
                    await dispatchNotificationTrigger({
                        recipientName: currentPost.user_name,
                        type: 'comment_reply',
                        postId: postId,
                        commentId: insertedComment.id,
                        previewText: truncatedText
                    });
                } else {
                    // Reply to a comment — fetch parent comment author directly from DB
                    const { data: parentComment } = await _supabase
                        .from('forum_comments')
                        .select('id, user_name, parent_id')
                        .eq('id', parentId)
                        .single();

                    console.log("[Notif] parentComment:", parentComment);

                    if (parentComment) {
                        // Check if a specific user was @mentioned (stored in data attribute)
                        const mentionedUser = input ? input.dataset.mentionedUser : null;
                        if (input) delete input.dataset.mentionedUser;

                        console.log("[Notif] mentionedUser:", mentionedUser, "| parentComment.user_name:", parentComment.user_name);

                        if (mentionedUser && mentionedUser !== parentComment.user_name) {
                            // Replying to a reply: notify the @mentioned reply author
                            await dispatchNotificationTrigger({
                                recipientName: mentionedUser,
                                type: 'mention',
                                postId: postId,
                                commentId: parentId,
                                replyId: insertedComment.id,
                                previewText: truncatedText
                            });
                        }
                        // Always notify the parent comment author
                        await dispatchNotificationTrigger({
                            recipientName: parentComment.user_name,
                            type: 'reply_reply',
                            postId: postId,
                            commentId: parentId,
                            replyId: insertedComment.id,
                            previewText: truncatedText
                        });
                    }
                }
            } else {
                console.warn("[Notif] Post not found in globalPostsCache for postId:", postId);
            }
        } catch (notifErr) {
            console.error("[Notif] Notification routing error:", notifErr);
        }

        await fetchForumPosts();
    }
};

// ✅ FIXED: was supabase.from('forumlikes') — wrong client + wrong table name
window.toggleLike = async function(postId, hasLikedInt) {
    user = getUser();
    const hasLiked = hasLikedInt === 1;
    if (hasLiked) {
        await _supabase.from('forum_likes').delete().eq('post_id', postId).eq('user_name', user.name);

        // Unliking must also remove the like-notification it originally
        // created, otherwise the post owner keeps a stale "favorited your
        // post" alert after the like is gone. Match the same sender snapshot
        // dispatchNotificationTrigger wrote — the anon name when posting
        // anonymously, otherwise the real name.
        try {
            const s = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };
            const senderName = s.useAnon ? s.anonName : user.name;
            const { error: delErr } = await _supabase.from('notifications').delete()
                .eq('type', 'post_like')
                .eq('target_post_id', postId)
                .eq('sender_user_name', senderName);
            if (delErr) console.warn('[forum] like-notif delete failed:', delErr.message);
        } catch (e) {
            console.warn('[forum] like-notif delete error:', e);
        }
    } else {
        await _supabase.from('forum_likes').insert({ post_id: postId, user_name: user.name });

        // --- NOTIFICATION ROUTING SYSTEM ---
        try {
            const currentPost = globalPostsCache.find(p => p.id === postId);
            if (currentPost) {
                await dispatchNotificationTrigger({
                    recipientName: currentPost.user_name,
                    type: 'post_like',
                    postId: postId,
                    previewText: currentPost.content.substring(0, 30)
                });
            }
        } catch (notifErr) {
            console.error("Like notification trace dropped:", notifErr);
        }
    }
    await fetchForumPosts();
};

// ✅ FIXED: was supabase.from('commentlikes') — wrong client + wrong table name
window.toggleCommentLike = async function(commentId, hasLikedInt, postId) {
    user = getUser();
    const hasLiked = hasLikedInt === 1;
    if (hasLiked) {
        await _supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_name', user.name);
    } else {
        await _supabase.from('comment_likes').insert({ comment_id: commentId, user_name: user.name });

        // --- NOTIFICATION ROUTING SYSTEM ---
        try {
            const currentPost = globalPostsCache.find(p => p.id === postId);
            if (currentPost && currentPost.forum_comments) {
                const targetComment = currentPost.forum_comments.find(c => c.id === commentId);
                if (targetComment) {
                    const isTargetReply = targetComment.parent_id !== null;
                    await dispatchNotificationTrigger({
                        recipientName: targetComment.user_name,
                        type: isTargetReply ? 'reply_like' : 'comment_like',
                        postId: postId,
                        commentId: isTargetReply ? targetComment.parent_id : commentId,
                        replyId: isTargetReply ? commentId : null,
                        previewText: targetComment.content.substring(0, 30)
                    });
                }
            }
        } catch (notifErr) {
            console.error("Comment like notification trace dropped:", notifErr);
        }
    }
    await fetchForumPosts();
};


/**
 * 🚀 ADMINISTRATIVE MODAL PARSING
 */
function openForumDeleteModal(postId) {
    forumPostToDeleteId = postId;
    const modal = document.getElementById("forumDeleteModal");
    if (modal) modal.style.display = "flex";
}

function closeForumDeleteModal() {
    const modal = document.getElementById("forumDeleteModal");
    if (modal) modal.style.display = "none";
}

// ✅ FIXED: was supabase.from('forumposts') — wrong client + wrong table name
async function confirmDeleteForumPost() {
    if (!forumPostToDeleteId) return;
    const { error } = await _supabase.from('forum_posts').delete().eq('id', forumPostToDeleteId);
    if (error) {
        alert("Failed to delete post.");
    } else {
        closeForumDeleteModal();
        await fetchForumPosts();
    }
}

function logout() {
    localStorage.clear();
    location.href = "index.html";
}


/**
 * 🚀 INITIALIZATION CONSTRUCTOR
 */
window.onload = () => {
    if (userSettings.useAnon && userSettings.anonName) {
        const toggle = document.getElementById("globalAnonToggle");
        if (toggle) {
            toggle.checked = true;
        }
    }
    // Run initial sync layout
    handleGlobalAnonToggle();
    // Auto sync background fetch loop every 60 seconds
    setInterval(fetchForumPosts, 60000);
};




/**
 * 🔔 ISOLATED NOTIFICATION DISPATCHER PIPELINE
 */
async function dispatchNotificationTrigger({ recipientName, type, postId, commentId = null, replyId = null, previewText = "" }) {
    const currentSettings = JSON.parse(localStorage.getItem("userSettings")) || { useAnon: false, anonName: "" };
    const effectiveSenderName = currentSettings.useAnon ? currentSettings.anonName : user.name;
    const effectiveSenderImg = currentSettings.useAnon
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(currentSettings.anonName)}&background=0f172a&color=fff`
        : (user.image || "https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32");

    // Prevent self-notifications
    if (user.name === recipientName || currentSettings.anonName === recipientName) return;

    let actionMessage = "";
    switch(type) {
        case 'post_like':     actionMessage = `marked your post as a favorite.`; break;
        case 'comment_like':  actionMessage = `liked your comment: "${previewText}"`; break;
        case 'reply_like':    actionMessage = `liked your reply: "${previewText}"`; break;
        case 'comment_reply': actionMessage = `replied to your post: "${previewText}"`; break;
        case 'reply_reply':   actionMessage = `replied to your thread: "${previewText}"`; break;
        case 'mention':       actionMessage = `mentioned you in a thread reply: "${previewText}"`; break;
        default:              actionMessage = `interacted with your content.`;
    }

    try {
        const { error } = await _supabase
            .from('notifications')
            .insert([{
                recipient_user_name: recipientName,
                sender_user_name: effectiveSenderName,
                sender_profile_picture: effectiveSenderImg,
                type: type,
                target_post_id: postId,
                target_comment_id: commentId,
                target_reply_id: replyId,
                message: actionMessage,
                is_read: false
            }]);

        if (error) console.error("Notification dispatch failed:", error);
    } catch (err) {
        console.error("Notification system offline:", err);
    }
}
function toggleCircleInsights(btn) {
    if (window.innerWidth > 768) return;
    const body = document.getElementById("trendingTopicsList");
    const isOpen = body.classList.toggle("open");
    const chevron = btn.querySelector(".circle-insights-chevron");
    if (chevron) chevron.classList.toggle("open", isOpen);
    btn.classList.toggle("collapsed", !isOpen);
}
