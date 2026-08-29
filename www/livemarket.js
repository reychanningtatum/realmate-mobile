const supabaseUrl = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
const supabaseKey = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
const _sb = supabase.createClient(supabaseUrl, supabaseKey);

// ── AI Match Engine — shared core (see match-engine.js / window.RM_MATCH) ──
// The text-parse + scoring core was extracted VERBATIM into match-engine.js so
// the exact same scoring runs on every page (the global match-alert.js needs it
// too — matches must be detected from any page, not just the Portal). They're
// pulled back in here under their original names so every existing caller below
// is unchanged. match-engine.js MUST load before livemarket.js.
const {
    PARTNER_MAP, KNOWN_PROJECTS, COMPANY_NAMES, COMPANY_NAME_SET, FEATURE_KEYWORDS,
    LEARNED_KEY, LOCATION_KEYWORDS, LOCATION_ZONES, ADJACENT_ZONES, _UNIT_RANK,
    _hlUseMention, _hlSubject, _bedTokensForMatch, _bedTokensSubject, unitTypesForMatch,
    levenshtein, separatorInsensitivePattern, extractLocations, getLocationZone, locationProximity, fuzzyMatchProject,
    extractProjectFull, extractProject, extractFeatures, extractBudgetRange,
    extractPriceRange, extractPrice, _unitToken, _unitRank, _smallerUnit, extractUnit,
    getLearnedProjects, parseListing, computeMatchScore
} = window.RM_MATCH;

// Career positions were removed from Realmate. This resolver is kept as an
// inert seam (always returns no position) so the call sites that once showed a
// position render nothing, without having to touch each template.
function lmValidPosition(job) { return ''; }

async function logout() {
    await _sb.auth.signOut();
    localStorage.clear();
    location.href = "index.html";
}

// ── Live Market ⇄ Listing Detail: preserve the EXACT scroll on Back ──────────
// Opening a listing navigates THIS page to listing-detail.html. The Portal holds
// an open realtime WebSocket, which stops iOS WKWebView from bfcache-restoring
// this page — so "Back" (history.back) RELOADS Live Market and would otherwise
// dump the user at the very top. We stash the scroll on the way out and restore
// it once the grid has rendered tall enough to reach it, so Back returns to the
// exact same post/scroll — even for a post near the bottom of the list. Works
// whether the browser bfcaches (already restored) or reloads (we restore).
function _lmScrollNow() {
    var w = window.scrollY || window.pageYOffset || 0;
    var mc = document.querySelector('.main-content');
    return Math.max(w, mc ? mc.scrollTop : 0);
}
function _lmScrollTo(y) {
    try { window.scrollTo(0, y); } catch (e) {}
    var mc = document.querySelector('.main-content');
    if (mc) { try { mc.scrollTop = y; } catch (e) {} }
}
function _lmMaxScrollable() {
    var w = (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0);
    var mc = document.querySelector('.main-content');
    var m = mc ? (mc.scrollHeight - mc.clientHeight) : 0;
    return Math.max(w, m);
}
function lmOpenListing(id) {
    try { sessionStorage.setItem('lmReturnScroll', JSON.stringify({ y: _lmScrollNow(), t: Date.now() })); } catch (e) {}
    location.href = 'listing-detail.html?id=' + encodeURIComponent(id);
}
(function _lmRestoreScrollOnReturn() {
    var raw = null;
    try { raw = sessionStorage.getItem('lmReturnScroll'); sessionStorage.removeItem('lmReturnScroll'); } catch (e) { return; }
    if (!raw) return;
    var data; try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || !data.y || (Date.now() - (data.t || 0)) > 300000) return;  // only a recent round-trip
    var y = data.y, start = Date.now();
    // livemarket runs SEVERAL applyFilters() re-renders while it loads (data
    // arrives, realtime echoes, rmbr:ready…), any of which can reset the scroll
    // AFTER we first land on y. So don't stop at the first success — keep
    // re-asserting the saved position (only when we've drifted off it, so we
    // never fight the user) for a short window until it stays put.
    var timer = setInterval(function () {
        if (_lmMaxScrollable() >= y - 4 && Math.abs(_lmScrollNow() - y) > 4) _lmScrollTo(y);
        if (Date.now() - start > 2500) {
            if (_lmMaxScrollable() >= y - 4) _lmScrollTo(y);   // final landing
            clearInterval(timer);
        }
    }, 50);
})();
// If the page IS bfcache-restored (scroll already intact), drop the stash so it
// can't wrongly reposition a later fresh reload (e.g. a pull-to-refresh).
window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) { try { sessionStorage.removeItem('lmReturnScroll'); } catch (er) {} }
});

// ── Category helpers ──────────────────────────────
const CAT_CLASS = {
    "FOR SALE": "cat-sale", "FOR RENT": "cat-rent", "FOR LEASE": "cat-lease",
    "WILLING TO BUY": "cat-wbuy", "WILLING TO RENT": "cat-wrent", "WILLING TO LEASE": "cat-wlease"
};

function catTag(cat) {
    return `<span class="cat-tag ${CAT_CLASS[cat] || ''}"><span class="cat-dot"></span>${cat}</span>`;
}

// ── Status label helpers ──────────────────────────
// When a post is marked done, the completion word on the diagonal ribbon depends
// on what kind of post it was: a For Sale unit is "Sold", a For Rent unit
// "Rented", a For Lease unit "Leased", a Willing to Buy post "Bought", and
// Willing to Rent/Lease "Rented"/"Leased". Willing (demand-side) posts get a
// GREEN ribbon; supply-side For Sale/Rent/Lease posts get a RED ribbon.
const COMPLETION_LABELS = {
    "FOR SALE": "Sold", "FOR RENT": "Rented", "FOR LEASE": "Leased",
    "WILLING TO BUY": "Bought", "WILLING TO RENT": "Rented", "WILLING TO LEASE": "Leased"
};
function completionLabel(category) {
    return COMPLETION_LABELS[(category || '').toUpperCase().trim()] || 'Sold';
}
function isWillingCategory(category) {
    return (category || '').toUpperCase().trim().startsWith('WILLING');
}

function buildFMVBadge(fmvResult) {
    if (!fmvResult) return '';
    try {
        const { fmvFormatted, diffStr } = formatFMV(fmvResult);
        return `<div class="fmv-badge ${fmvResult.verdictClass}">
            <i class="fas fa-chart-bar"></i>
            FMV ~${fmvFormatted}
            <span class="fmv-diff">${diffStr}</span>
            <span class="fmv-verdict">${fmvResult.verdict}</span>
        </div>`;
    } catch(e) { return ''; }
}

function safeText(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

const _lbStore = {};
// A broken featured image falls back to the placeholder; a broken thumbnail
// removes itself so the strip never shows empty boxes.
function lcFeatErr(img) {
    const p = img.parentElement; img.style.display = 'none';
    if (p && !p.querySelector('.lc-featured-ph')) {
        p.classList.add('lc-featured-empty');
        const d = document.createElement('div');
        d.className = 'lc-featured-ph'; d.innerHTML = '<i class="fas fa-image"></i>';
        p.appendChild(d);
    }
}
function lcThumbErr(img) { const b = img.closest('.lc-thumb'); if (b) b.remove(); }

// ── Portal cover photo ────────────────────────────
// A Portal post shows exactly ONE image: the user's chosen Cover Photo. The cover
// designation lives in its own column (cover_image_url); for older posts saved
// before that column existed we fall back to the first uploaded image. All other
// photos are kept and only surface on the Listing Detail page.
function coverImageUrl(listing) {
    const cover = (listing.cover_image_url || '').trim();
    if (cover) return cover;
    const imgs = (listing.image_urls?.length ? listing.image_urls : (listing.image_url ? [listing.image_url] : []))
        .filter(u => u && typeof u === 'string' && u.trim());
    return imgs[0] || '';
}
// If the cover fails to load, drop the whole cover block so the post stays clean.
function lcCoverErr(img) { const w = img.closest('.lc-cover'); if (w) w.remove(); }

// Photos column: an ADAPTIVE two-part layout. The top is a vertical stack of
// one-or-more large images; the rest fall into a horizontally scrollable
// thumbnail strip below. How many images are shown large is decided at runtime
// by adaptPhotoLayout() so the photo column's height tracks the Property
// Information beside it (short info → 1 large photo, tall info → 2, 3, …).
// data-idx on every element is the ORIGINAL image index, so the lightbox
// (and thumbnail⇄large swaps) stay correct regardless of the split.
// (The category pill lives in the card's top section now, not over the image.)
function imagesHtml(listing) {
    const imgs = (listing.image_urls?.length ? listing.image_urls : (listing.image_url ? [listing.image_url] : []))
        .filter(u => u && typeof u === 'string' && u.trim());
    const key = listing.id || ('k' + Math.random().toString(36).slice(2));
    _lbStore[key] = imgs;
    if (!imgs.length) {
        return `<div class="lc-photos" data-lbkey="${key}">
            <div class="lc-featured-stack">
                <div class="lc-featured lc-featured-empty">
                    <div class="lc-featured-ph"><i class="fas fa-image"></i></div>
                </div>
            </div>
        </div>`;
    }
    // Start with a single large image; adaptPhotoLayout() grows the stack once
    // the card is laid out and the info height is known.
    return `<div class="lc-photos" data-lbkey="${key}" data-large="1">${photoInnerHtml(imgs, 1)}</div>`;
}

// Interior of .lc-photos for a given split: the first `largeCount` images as a
// stacked column of big photos, the remainder as a thumbnail strip.
function photoInnerHtml(imgs, largeCount) {
    largeCount = Math.max(1, Math.min(largeCount, imgs.length));
    const large = imgs.slice(0, largeCount).map((u, i) =>
        `<div class="lc-featured" data-idx="${i}">
            <img class="lc-featured-img" src="${u}" onerror="lcFeatErr(this)">
        </div>`).join('');
    const rest = imgs.slice(largeCount);
    const thumbs = rest.length
        ? `<div class="lc-thumbs">${rest.map((u, j) => {
            const idx = largeCount + j;
            return `<button class="lc-thumb" data-idx="${idx}" aria-label="Show photo ${idx + 1}"><img src="${u}" onerror="lcThumbErr(this)"></button>`;
          }).join('')}</div>`
        : '';
    return `<div class="lc-featured-stack" data-active="0">${large}</div>${thumbs}`;
}

// Wire the photo column: clicking a large image opens the lightbox at that
// photo (and marks its slot "active"); clicking a thumbnail swaps it into the
// currently-active large slot (the displaced large photo drops back into the
// strip). Re-called after every adaptive rebuild.
function attachPhotoHandlers(imgWrap, key) {
    const store = _lbStore[key] || [];
    const stack = imgWrap.querySelector('.lc-featured-stack');
    const larges = imgWrap.querySelectorAll('.lc-featured');
    larges.forEach((slot, pos) => {
        if (slot.classList.contains('lc-featured-empty')) return;
        slot.addEventListener('click', e => {
            e.stopPropagation();
            if (stack) stack.dataset.active = String(pos);
            openLightbox(key, parseInt(slot.dataset.idx || '0', 10));
        });
    });
    imgWrap.querySelectorAll('.lc-thumb').forEach(thumb => {
        thumb.addEventListener('click', e => {
            e.stopPropagation();
            const activePos = parseInt(stack?.dataset.active || '0', 10);
            const slot = larges[activePos] || larges[0];
            if (!slot) return;
            const slotImg = slot.querySelector('.lc-featured-img');
            const thumbImg = thumb.querySelector('img');
            const li = parseInt(slot.dataset.idx || '0', 10);
            const ti = parseInt(thumb.dataset.idx || '0', 10);
            if (!slotImg || !thumbImg || !store[ti] || !store[li]) return;
            slotImg.src = store[ti]; slot.dataset.idx = String(ti);
            thumbImg.src = store[li]; thumb.dataset.idx = String(li);
        });
    });
}

// Decide how many large images best fill the Property Information height, and
// rebuild the photo column if that count changed. Each large image is 4:3, so
// its height is known from the column width (no need to wait for image loads).
function adaptPhotoLayout(card) {
    const imgWrap = card.querySelector('.lc-photos');
    const info = card.querySelector('.lc-col-info');
    if (!imgWrap || !info) return;
    const key = imgWrap.dataset.lbkey;
    const imgs = _lbStore[key] || [];
    if (imgs.length <= 1) return; // nothing to redistribute
    const stack = imgWrap.querySelector('.lc-featured-stack');
    const w = stack ? stack.clientWidth : 0;
    if (!w) return;
    const imgH = w * 3 / 4;   // .lc-featured aspect-ratio is 4 / 3
    const GAP = 10;           // must match .lc-featured-stack gap
    const thumbEl = imgWrap.querySelector('.lc-thumbs');
    const THUMB = thumbEl ? thumbEl.offsetHeight + 12 : 74; // strip height reserve
    const target = info.offsetHeight;
    // Round to the nearest number of large images that fills the info height.
    let n = Math.max(1, Math.round((target + GAP) / (imgH + GAP)));
    // If some photos will remain as thumbnails, that strip eats into the height
    // budget — recompute leaving room for it.
    if (n < imgs.length) {
        n = Math.max(1, Math.round((target - THUMB + GAP) / (imgH + GAP)));
    }
    n = Math.max(1, Math.min(n, imgs.length));
    if (n === parseInt(imgWrap.dataset.large || '1', 10)) return;
    imgWrap.innerHTML = photoInnerHtml(imgs, n);
    imgWrap.dataset.large = String(n);
    attachPhotoHandlers(imgWrap, key);
}

let _lbImgs = [], _lbIdx = 0;
// Zoom / pan state for the current lightbox image.
let _lbScale = 1, _lbTx = 0, _lbTy = 0;

function _lbApplyTransform() {
    const img = document.getElementById('lmLbImg');
    if (!img) return;
    img.style.transform = `translate(${_lbTx}px, ${_lbTy}px) scale(${_lbScale})`;
    img.classList.toggle('is-zoomed', _lbScale > 1);
}
function _lbResetZoom() { _lbScale = 1; _lbTx = 0; _lbTy = 0; _lbApplyTransform(); }

function _lbShow(idx) {
    _lbIdx = (idx + _lbImgs.length) % _lbImgs.length;
    const img = document.getElementById('lmLbImg');
    _lbResetZoom();
    img.src = _lbImgs[_lbIdx];
    document.getElementById('lmLbCounter').textContent = `${_lbIdx + 1} / ${_lbImgs.length}`;
}

function openLightbox(key, idx) {
    _lbImgs = _lbStore[key] || [];
    if (!_lbImgs.length) return;
    const lb = document.getElementById('lmLightbox');
    document.getElementById('lmLbPrev').style.display = _lbImgs.length > 1 ? 'flex' : 'none';
    document.getElementById('lmLbNext').style.display = _lbImgs.length > 1 ? 'flex' : 'none';
    _lbShow(idx);
    lb.classList.add('open');
    _initLightboxGestures();
}
function closeLightbox() { _lbResetZoom(); document.getElementById('lmLightbox').classList.remove('open'); }
function lbNav(dir) { _lbShow(_lbIdx + dir); }

document.addEventListener('keydown', e => {
    if (!document.getElementById('lmLightbox')?.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') lbNav(-1);
    else if (e.key === 'ArrowRight') lbNav(1);
    else if (e.key === 'Escape') closeLightbox();
});

// Gesture support: pinch-zoom + double-tap zoom + pan on mobile, wheel + double
// -click zoom on desktop, and horizontal swipe to navigate when not zoomed.
// Wired once, lazily, the first time the lightbox opens.
let _lbGesturesReady = false;
function _initLightboxGestures() {
    if (_lbGesturesReady) return;
    const img = document.getElementById('lmLbImg');
    const stage = document.getElementById('lmLightbox');
    if (!img || !stage) return;
    _lbGesturesReady = true;

    const pts = new Map();
    let startDist = 0, startScale = 1, startTx = 0, startTy = 0;
    let panStartX = 0, panStartY = 0, swipeStartX = 0, moved = false;

    const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };

    img.addEventListener('pointerdown', e => {
        e.preventDefault();
        img.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        if (pts.size === 2) { startDist = dist(); startScale = _lbScale; }
        else { panStartX = e.clientX - _lbTx; panStartY = e.clientY - _lbTy; swipeStartX = e.clientX; }
    });

    img.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = true;
        if (pts.size === 2) {
            const s = Math.min(5, Math.max(1, startScale * (dist() / (startDist || 1))));
            _lbScale = s; if (s === 1) { _lbTx = 0; _lbTy = 0; } _lbApplyTransform();
        } else if (_lbScale > 1) {
            _lbTx = e.clientX - panStartX; _lbTy = e.clientY - panStartY; _lbApplyTransform();
        }
    });

    const up = e => {
        if (!pts.has(e.pointerId)) return;
        const wasZoomed = _lbScale > 1, only = pts.size === 1;
        const dx = e.clientX - swipeStartX;
        pts.delete(e.pointerId);
        if (pts.size < 2) startDist = 0;
        // Swipe to navigate only when not zoomed and it was a single-pointer drag
        if (only && !wasZoomed && moved && Math.abs(dx) > 60 && _lbImgs.length > 1) {
            lbNav(dx < 0 ? 1 : -1);
        }
    };
    img.addEventListener('pointerup', up);
    img.addEventListener('pointercancel', up);

    // Double-click / double-tap toggles zoom
    img.addEventListener('dblclick', e => {
        e.preventDefault();
        if (_lbScale > 1) _lbResetZoom();
        else { _lbScale = 2.5; _lbApplyTransform(); }
    });

    // Desktop wheel zoom
    stage.addEventListener('wheel', e => {
        if (!stage.classList.contains('open')) return;
        e.preventDefault();
        _lbScale = Math.min(5, Math.max(1, _lbScale - Math.sign(e.deltaY) * 0.25));
        if (_lbScale === 1) { _lbTx = 0; _lbTy = 0; }
        _lbApplyTransform();
    }, { passive: false });
}

function avatarFallback(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=32cd32&color=fff`;
}

// PARTNER_MAP moved to match-engine.js (window.RM_MATCH), aliased at top.

// ── Pinned listings ──────────────────────────────
function getPinnedIds() {
    try { return JSON.parse(localStorage.getItem('rm_pinned') || '[]'); } catch { return []; }
}
function togglePin(listingId, btn) {
    let pins = getPinnedIds();
    const id = String(listingId);
    const pinning = !pins.includes(id);
    if (pinning) pins.push(id); else pins = pins.filter(p => p !== id);
    localStorage.setItem('rm_pinned', JSON.stringify(pins));
    if (btn) {
        btn.innerHTML = `<i class="fas fa-thumbtack ${pinning ? 'pinned-icon' : ''}"></i><span>${pinning ? 'Unpin' : 'Pin'}</span>`;
    }
    // On either Pinned view (Live Market ▸ Pinned, or My Listings ▸ Pinned),
    // re-render immediately so the card appears/disappears without a refresh.
    if (typeof activeCategory !== 'undefined' &&
        (activeCategory === 'PINNED' ||
         (activeCategory === 'MY_LISTINGS' && myListingsSubCat === 'PINNED'))) applyFilters();
}

// ── Listing card kebab menu (pin / dismiss / delete) ──
// While a card menu is open, LOCK the page from scrolling so the menu (a fixed
// overlay pinned to the kebab button) stays anchored and the post underneath
// can't move out from under it. overflow:hidden stops wheel/programmatic scroll;
// the non-passive touchmove blocker stops iOS touch/momentum scroll (except
// inside the menu itself, in case it ever needs to scroll). Restored on close.
let _lcScrollLocked = false;
function _lcBlockTouch(ev) {
    if (ev.target && ev.target.closest && ev.target.closest('.lc-menu')) return;
    if (ev.cancelable) ev.preventDefault();
}
function _lcLockScroll() {
    if (_lcScrollLocked) return;
    _lcScrollLocked = true;
    document.addEventListener('touchmove', _lcBlockTouch, { passive: false });
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
}
function _lcUnlockScroll() {
    if (!_lcScrollLocked) return;
    _lcScrollLocked = false;
    document.removeEventListener('touchmove', _lcBlockTouch, { passive: false });
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
}

// ── Post 3-dot menu → Facebook-style BOTTOM SHEET ────────────────────────
// The kebab menu opens as a full-width sheet that slides up from the bottom over
// a dimmed backdrop (like the "Save post / Report" sheet on Facebook), instead of
// a small dropdown pinned to the button. The card's transform used to trap a
// fixed dropdown and it was easy to clip/misplace; a bottom sheet is always fully
// visible, has big tap targets, and freezes the page behind it. The menu's EXISTING
// items (with their onclick handlers) are moved into the sheet — options and
// behaviour are unchanged.
function _lcEnsureSheet() {
    let ov = document.getElementById('lcSheetOverlay');
    if (ov) return ov;
    const st = document.createElement('style');
    st.textContent =
        '#lcSheetOverlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0);display:none;align-items:flex-end;justify-content:center;transition:background .22s ease;}'
      + '#lcSheetOverlay.lc-sheet-open{background:rgba(0,0,0,.45);}'
      + '#lcSheet{background:var(--white,#fff);border-radius:22px 22px 0 0;width:100%;max-width:540px;padding:6px 12px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -8px 34px rgba(15,23,42,.22);transform:translateY(101%);transition:transform .26s cubic-bezier(.2,.8,.2,1);}'
      + '#lcSheetOverlay.lc-sheet-open #lcSheet{transform:translateY(0);}'
      + '#lcSheetGrip{width:40px;height:5px;background:#d7dde5;border-radius:5px;margin:10px auto 6px;}'
      + '#lcSheetBody .lc-menu{display:block !important;position:static !important;border:0;box-shadow:none;min-width:0;background:transparent;overflow:visible;padding:4px 0;}'
      + '#lcSheetBody .lc-menu-item{padding:17px 12px;font-size:16px;gap:16px;border-radius:12px;}'
      + '#lcSheetBody .lc-menu-item i{font-size:18px;width:22px;}'
      + '#lcSheetBody .lc-menu-item:active{background:#eef2f7;}'
      + 'html[data-theme="dark"] #lcSheet{background:#1e293b;}'
      + 'html[data-theme="dark"] #lcSheetBody .lc-menu-item:active{background:#0f172a;}';
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.id = 'lcSheetOverlay';
    ov.innerHTML = '<div id="lcSheet"><div id="lcSheetGrip"></div><div id="lcSheetBody"></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeLcMenu(); });
    document.body.appendChild(ov);
    return ov;
}

// Close the open sheet: slide it down, fade the backdrop, then return the menu to
// its card and restore scrolling. Idempotent (safe to call when nothing is open).
function _lcCloseMenu(menu) {
    const ov = document.getElementById('lcSheetOverlay');
    if (!ov || ov.style.display === 'none') { _lcUnlockScroll(); return; }
    const body = document.getElementById('lcSheetBody');
    const m = (menu && menu.parentNode === body) ? menu : (body ? body.querySelector('.lc-menu') : null);
    ov.classList.remove('lc-sheet-open');
    ov.__lcId = null;
    setTimeout(function () {
        if (m) {
            m.classList.remove('open');
            if (m.__lcHome && m.__lcHome.isConnected) m.__lcHome.appendChild(m);
            else if (m.parentNode === body) m.remove();   // card re-rendered → drop orphan
            m.__lcHome = null;
        }
        ov.style.display = 'none';
    }, 260);
    _lcUnlockScroll();
}

function toggleLcMenu(id, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('lcmenu-' + id);
    if (!menu) return;
    const ov = document.getElementById('lcSheetOverlay');
    // Tapping the same post's kebab while its sheet is open toggles it closed.
    if (ov && ov.style.display !== 'none' && String(ov.__lcId) === String(id)) { closeLcMenu(); return; }
    document.querySelectorAll('.lc-menu.open').forEach(_lcCloseMenu);   // close any other
    const sheet = _lcEnsureSheet();
    const box = document.getElementById('lcSheetBody');
    menu.__lcHome = menu.parentNode;
    menu.classList.add('open');
    box.appendChild(menu);                 // move the REAL menu (keeps its item handlers)
    sheet.__lcId = id;
    sheet.style.display = 'flex';
    _lcLockScroll();
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('lc-sheet-open'); }); });
}
function closeLcMenu(id) {
    _lcCloseMenu(id != null ? document.getElementById('lcmenu-' + id) : null);
}
function togglePinMenu(listingId, item) {
    togglePin(listingId, null);
    const pinned = getPinnedIds().includes(String(listingId));
    if (item) item.innerHTML = `<i class="fas fa-thumbtack"></i> <span>${pinned ? 'Unpin' : 'Pin'}</span>`;
    closeLcMenu(listingId);
}

// (Removed setListingStatus — the "In Negotiation" status toggle was taken off
//  Portal posts, so nothing sets the negotiation status anymore. Sold is handled
//  by the markListingSold flow below.)

// ── Sold workflow ───────────────────────────────────
// Marking a listing Sold is PERMANENT: a SOLD ribbon shows for 24 hours, then
// the listing is auto-deleted everywhere. Before it disappears a permanent Sold
// record is kept for the Admin panel. Shared by the Portal and the Dashboard
// (both render listing cards via buildListingCard), so the flow lives here.
const SOLD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Bottom-sheet confirmation before a sale is committed (matches deleteListing).
function confirmMarkSold(listingId, btn) {
    // Category-aware completion word — Sold / Rented / Leased / Bought — so the
    // sheet copy matches the post type (e.g. a Willing to Buy post reads "Bought").
    const _l = (typeof allListings !== 'undefined' ? allListings : []).find(l => String(l.id) === String(listingId));
    const word = completionLabel(_l ? _l.category : '');
    let overlay = document.getElementById('markSoldOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'markSoldOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;box-shadow:0 -4px 30px rgba(0,0,0,0.15);">
                <div style="width:40px;height:4px;background:#e2e8f0;border-radius:4px;margin:0 auto 20px;"></div>
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                        <i class="fas fa-check-circle" style="color:#16a34a;font-size:20px;"></i>
                    </div>
                    <div id="markSoldTitle" style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px;"></div>
                    <div id="markSoldDesc" style="font-size:13px;color:#64748b;line-height:1.55;"></div>
                </div>
                <button id="markSoldConfirmBtn" style="width:100%;height:44px;border-radius:12px;border:none;background:#16a34a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;"></button>
                <button id="markSoldCancelBtn" style="width:100%;height:44px;border-radius:12px;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        document.getElementById('markSoldCancelBtn').onclick = () => overlay.remove();
    }
    // The sheet is cached and reused, so refresh the category-aware copy each open.
    document.getElementById('markSoldTitle').textContent = `Mark this listing as ${word}?`;
    document.getElementById('markSoldDesc').innerHTML = `This action is <strong>permanent and cannot be undone.</strong><br>A <strong>${word}</strong> ribbon will appear on the listing for the next 24 hours. After 24 hours, the listing will be automatically deleted from realmate.`;
    const confirmBtn = document.getElementById('markSoldConfirmBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `Confirm ${word}`;
    confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Confirming…';
        const ok = await markListingSold(listingId);
        overlay.remove();
        if (!ok) { lmToast(`Failed to mark as ${word}`, 'fa-triangle-exclamation'); return; }
        lmToast(`Listing marked as ${word}`, 'fa-circle-check');
    };
}

// Commit the sale: save the permanent Admin record FIRST, then flip the listing
// to sold with a sold_at timestamp so the 24h countdown/auto-delete can run.
async function markListingSold(listingId) {
    const listing = allListings.find(l => String(l.id) === String(listingId));
    const soldAt = new Date().toISOString();

    // 1) Permanent Admin record — written before anything is destructive, so the
    //    history survives even if the delete happens on another device later.
    if (listing) await saveSoldRecord(listing, soldAt);

    // 2) Flip status. Include sold_at when the column exists; fall back to a
    //    status-only update so the ribbon still works before the migration runs.
    let { error } = await _sb.from('listings').update({ status: 'sold', sold_at: soldAt }).eq('id', listingId);
    if (error && /sold_at/i.test(error.message || '')) {
        ({ error } = await _sb.from('listings').update({ status: 'sold' }).eq('id', listingId));
    }
    if (error) return false;

    if (listing) { listing.status = 'sold'; listing.sold_at = soldAt; }

    if (document.getElementById('listingsGrid')) {
        applyFilters();
    } else {
        rerenderListingCardInPlace(listingId);
    }
    startSoldCountdowns();
    // The just-completed listing is now excluded from matching — re-record the
    // authoritative match set so this owner's Portal/Matches badges update at once.
    try { window.RMMatchAlert?.recordMatches([...buildMatchMap().keys()].map(String)); } catch (e) {}
    return true;
}

// Persist a permanent Sold record for the Admin panel. Idempotent per listing
// (upsert on listing_id), and never blocks the sale if the table isn't ready.
async function saveSoldRecord(listing, soldAt) {
    try {
        const del = new Date(new Date(soldAt).getTime() + SOLD_TTL_MS).toISOString();
        const { error } = await _sb.from('sold_records').upsert({
            listing_id: String(listing.id),
            seller:     listing.user_name || null,
            seller_id:  listing.user_id || null,
            category:   listing.category || null,
            content:    listing.content || null,
            image_urls: listing.image_urls || null,
            original:   listing,          // full snapshot of the original posting
            sold_at:    soldAt,
            delete_at:  del
        }, { onConflict: 'listing_id' });
        if (error) console.warn('[Sold] could not save admin record:', error.message);
    } catch (e) {
        console.warn('[Sold] could not save admin record:', e);
    }
}

// True once a sold listing has passed its 24h window and should be gone.
function isSoldExpired(listing) {
    if (listing.status !== 'sold' || !listing.sold_at) return false;
    return Date.now() - new Date(listing.sold_at).getTime() >= SOLD_TTL_MS;
}

// Sweep expired sold listings out of the current view for EVERY viewer, and —
// where the client has permission (owner / admin) — finalize the deletion in the
// DB. The permanent Sold record was already written at confirmation time.
async function sweepExpiredSoldListings() {
    const expired = (allListings || []).filter(isSoldExpired);
    if (!expired.length) return;
    // Hide from this viewer immediately, regardless of delete permission.
    allListings = allListings.filter(l => !isSoldExpired(l));
    for (const l of expired) {
        try {
            const delAt = new Date().toISOString();
            // Stamp the actual deletion time on the permanent record.
            await _sb.from('sold_records').update({ deleted_at: delAt }).eq('listing_id', String(l.id));
            // Remove the listing everywhere. Hard delete; fall back to archive if
            // RLS blocks it — whether it errors or silently affects zero rows (the
            // permanent Sold record preserves the history either way).
            const { data: del, error } = await _sb.from('listings').delete().eq('id', l.id).select('id');
            if (error || !del || !del.length) {
                await _sb.from('listings').update({ archived: true, status: 'sold' }).eq('id', l.id);
            }
        } catch (e) {
            console.warn('[Sold] sweep failed for', l.id, e);
        }
    }
}

// Live 24h countdown shown on every sold card (updates once a minute). When a
// card ticks past zero it triggers a sweep so it disappears without a reload.
function formatSoldRemaining(soldAt) {
    const ms = new Date(soldAt).getTime() + SOLD_TTL_MS - Date.now();
    if (ms <= 0) return '0h 0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}
function refreshSoldCountdowns() {
    const nodes = document.querySelectorAll('.sold-indicator[data-sold-at]');
    let anyExpired = false;
    nodes.forEach(node => {
        const soldAt = node.getAttribute('data-sold-at');
        const span = node.querySelector('.sold-countdown');
        if (!soldAt) { if (span) span.textContent = '24h 0m'; return; }
        if (new Date(soldAt).getTime() + SOLD_TTL_MS - Date.now() <= 0) anyExpired = true;
        if (span) span.textContent = formatSoldRemaining(soldAt);
    });
    if (anyExpired) {
        sweepExpiredSoldListings().then(() => {
            if (document.getElementById('listingsGrid')) applyFilters();
            else if (typeof reloadDashboardListings === 'function') reloadDashboardListings();
        });
    }
}
function startSoldCountdowns() {
    refreshSoldCountdowns();
    if (!window._soldCountdownTimer) {
        window._soldCountdownTimer = setInterval(refreshSoldCountdowns, 60000);
    }
}

// Replace a single already-rendered listing card with a fresh one built from
// the current in-memory listing (used off the Portal, e.g. the profile tab).
function rerenderListingCardInPlace(listingId) {
    const old = document.getElementById('lc-' + listingId);
    if (!old) return;
    const listing = allListings.find(l => String(l.id) === String(listingId));
    if (!listing) return;
    const count = (typeof matchCountMap !== 'undefined' && matchCountMap)
        ? (matchCountMap.get(String(listingId)) || 0) : 0;
    const fresh = buildListingCard(listing, null, null, count);
    old.replaceWith(fresh);
    requestAnimationFrame(() => fitCompletionSashes(fresh.parentElement || document));
}

// ── Swipe-to-reveal card actions ──────────────────
const SWIPE_BTN_WIDTH = 64;

function resetSwipe(el) {
    const content = el.closest('.listing-card')?.querySelector('.lc-swipe-content');
    if (content) { content.style.transition = 'transform 0.2s ease'; content.style.transform = 'translateX(0)'; }
}

function closeAllSwipes(except = null) {
    document.querySelectorAll('.lc-swipe-content').forEach(c => {
        if (c !== except) { c.style.transition = 'transform 0.2s ease'; c.style.transform = 'translateX(0)'; }
    });
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.lc-swipe-content') && !e.target.closest('.lc-swipe-actions')) closeAllSwipes();
    // The open menu now lives on <body> (portaled out of its card), so also treat
    // clicks inside .lc-menu as "inside" — otherwise this would close it before a
    // menu item's own handler runs.
    if (!e.target.closest('.lc-menu-wrap') && !e.target.closest('.lc-menu')) document.querySelectorAll('.lc-menu.open').forEach(_lcCloseMenu);
});

function attachSwipeHandlers(card) {
    const content = card.querySelector('.lc-swipe-content');
    const actions = card.querySelector('.lc-swipe-actions');
    if (!content || !actions) return;
    const maxSwipe = actions.querySelectorAll('.lc-swipe-btn').length * SWIPE_BTN_WIDTH;
    if (maxSwipe === 0) return;

    let startX = 0, startY = 0, currentX = 0, dragging = false, decided = false, isHorizontal = false;

    content.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a,button,input,textarea')) return;
        startX = e.clientX; startY = e.clientY;
        const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(content.style.transform || '');
        currentX = match ? parseFloat(match[1]) : 0;
        dragging = true; decided = false; isHorizontal = false;
        content.style.transition = 'none';
    });

    content.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!decided) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            decided = true;
            isHorizontal = Math.abs(dx) > Math.abs(dy);
            if (isHorizontal) content.setPointerCapture(e.pointerId);
        }
        if (!isHorizontal) return;
        e.preventDefault();
        let next = currentX + dx;
        next = Math.max(-maxSwipe, Math.min(0, next));
        content.style.transform = `translateX(${next}px)`;
    });

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        if (!isHorizontal) return;
        const dx = e.clientX - startX;
        const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(content.style.transform || '');
        const current = match ? parseFloat(match[1]) : 0;
        content.style.transition = 'transform 0.2s ease';
        const shouldOpen = current < -maxSwipe / 3 || dx < -40;
        content.style.transform = shouldOpen ? `translateX(${-maxSwipe}px)` : 'translateX(0)';
        if (shouldOpen) closeAllSwipes(content);
    }
    content.addEventListener('pointerup', endDrag);
    content.addEventListener('pointercancel', endDrag);
}

// Lightweight in-app toast (replaces browser alert()).
function lmToast(msg, icon) {
    let t = document.getElementById('lmToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'lmToast';
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(12px);display:inline-flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);background:#0f172a;color:#fff;font-family:Inter,sans-serif;font-size:13px;font-weight:600;padding:11px 18px;border-radius:999px;box-shadow:0 12px 30px -8px rgba(15,23,42,0.55);opacity:0;transition:opacity .25s ease,transform .25s ease;z-index:100000;pointer-events:none;';
        document.body.appendChild(t);
    }
    const iconColor = /exclamation|triangle|xmark|times/.test(icon || '') ? '#f87171' : '#4ade80';
    t.innerHTML = (icon ? `<i class="fas ${icon}" style="color:${iconColor};"></i>` : '') + `<span>${msg}</span>`;
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
    clearTimeout(window._lmToastT);
    window._lmToastT = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(12px)'; }, 2600);
}

// In-app delete confirmation (bottom sheet) — replaces browser confirm()/alert().
function deleteListing(listingId) {
    let overlay = document.getElementById('deleteListingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'deleteListingOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
        overlay.innerHTML = `
            <div id="deleteListingSheet" style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;box-shadow:0 -4px 30px rgba(0,0,0,0.15);">
                <div style="width:40px;height:4px;background:#e2e8f0;border-radius:4px;margin:0 auto 20px;"></div>
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#fff5f5;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                        <i class="fas fa-trash" style="color:#ef4444;font-size:18px;"></i>
                    </div>
                    <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:6px;">Delete this listing?</div>
                    <div style="font-size:13px;color:#64748b;line-height:1.5;">This listing will be removed from the market. <strong>This cannot be undone.</strong></div>
                </div>
                <button id="deleteListingConfirmBtn" style="width:100%;height:44px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;">Yes, Delete</button>
                <button id="deleteListingCancelBtn" style="width:100%;height:44px;border-radius:12px;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        document.getElementById('deleteListingCancelBtn').onclick = () => overlay.remove();
    }
    const confirmBtn = document.getElementById('deleteListingConfirmBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = 'Yes, Delete';
    confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…';
        const { error } = await _sb.from('listings').update({ archived: true }).eq('id', listingId);
        if (error) {
            overlay.remove();
            lmToast('Failed to delete listing', 'fa-triangle-exclamation');
            return;
        }
        allListings = allListings.filter(l => String(l.id) !== String(listingId));
        overlay.remove();
        applyFilters();
        lmToast('Listing deleted', 'fa-circle-check');
        // Broadcast so the SAME listing drops from the other view live (Portal ↔
        // Profile), no manual refresh. livemarket.js runs in both, and the
        // listener below removes it + re-renders whichever view is showing.
        try { localStorage.setItem('rm_listing_deleted', JSON.stringify({ id: String(listingId), t: Date.now() })); } catch (e) {}
    };
}

// Live Portal ↔ Profile listing-deletion sync (same-origin storage event fires
// in the OTHER shell iframe/tab). Drops the listing from the in-memory pools,
// removes its card, and re-renders whichever listing view this page shows.
window.addEventListener('storage', function (e) {
    if (e.key !== 'rm_listing_deleted' || !e.newValue) return;
    try {
        var d = JSON.parse(e.newValue); if (!d || !d.id) return;
        var id = String(d.id);
        if (typeof allListings !== 'undefined' && Array.isArray(allListings)) allListings = allListings.filter(function (l) { return String(l.id) !== id; });
        if (typeof myListings !== 'undefined' && Array.isArray(myListings)) myListings = myListings.filter(function (l) { return String(l.id) !== id; });
        document.querySelectorAll('[id="lc-' + id + '"]').forEach(function (card) { card.remove(); });
        if (typeof applyFilters === 'function' && document.getElementById('listingsGrid')) applyFilters();
        if (typeof reloadDashboardListings === 'function') { try { reloadDashboardListings(); } catch (_) {} }
    } catch (_) {}
});

// (Removed buildStatusBadge / buildStatusButtons — the "In Negotiation" pill and
//  the old post-status button row are no longer shown on Portal posts. Completion
//  is handled by the bottom status button in buildActionBar.)

function buildOfferRow(listing) {
    const localUser = JSON.parse(localStorage.getItem('user'));
    if (!listing.user_id || listing.is_anonymous || (localUser && listing.user_name === localUser.name)) return '';
    const img   = (listing.image_urls || [])[0] || '';
    const safeN = (listing.user_name  || '').replace(/'/g, "\\'");
    const safeI = img.replace(/'/g, "\\'");
    const safeCat = (listing.category || '').replace(/'/g, "\\'");
    const safeId  = listing.id;
    const safeUid = listing.user_id;
    // Once a listing is sold it's off the market — no more offers. Show a
    // read-only Sold indicator in place of the Send Offer button.
    if (listing.status === 'sold') {
        return `<div class="listing-offer-row" onclick="event.stopPropagation()">
            <button class="listing-view-btn" onclick="lmOpenListing('${safeId}')">
                <i class="fas fa-arrow-up-right-from-square"></i> View Listing
            </button>
            <div class="sold-indicator sold-indicator-static">
                <i class="fas fa-check-circle"></i> <span>Sold</span>
            </div>
        </div>`;
    }
    return `<div class="listing-offer-row" onclick="event.stopPropagation()">
        <button class="listing-view-btn" onclick="lmOpenListing('${safeId}')">
            <i class="fas fa-arrow-up-right-from-square"></i> View Listing
        </button>
        <button class="listing-offer-btn" onclick="showOfferPopup('${safeId}','${safeUid}','${safeN}','${safeI}','${safeCat}',this)">
            <i class="fas fa-handshake"></i> Send Offer
        </button>
    </div>`;
}

// Preloaded offer counts — populated before cards render
window._offerCountMap = {};
// Every (listing_id|user_id) we've already counted. Offers are unique per user
// per listing (PK), so this set makes counting idempotent: a realtime INSERT and
// the sender's own local bump for the same offer are deduped instead of double-
// counted. Rebuilt from scratch on every preload.
window._offerRowKeys = new Set();
function _offerKey(listingId, userId) { return String(listingId) + '|' + String(userId); }

// Register one offer. Returns true only the FIRST time this exact offer is seen,
// bumping the per-listing count; subsequent calls for the same offer are no-ops.
function registerOffer(listingId, userId) {
    if (listingId == null || userId == null) return false;
    const key = _offerKey(listingId, userId);
    if (window._offerRowKeys.has(key)) return false;
    window._offerRowKeys.add(key);
    const k = String(listingId);
    window._offerCountMap[k] = (window._offerCountMap[k] || 0) + 1;
    return true;
}

async function preloadOfferCounts() {
    try {
        const resp = await fetch(
            `${supabaseUrl}/rest/v1/listing_offers?select=listing_id,user_id`,
            { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const rows = await resp.json();
        if (!Array.isArray(rows)) return;
        window._offerCountMap = {};
        window._offerRowKeys = new Set();
        rows.forEach(r => registerOffer(r.listing_id, r.user_id));
    } catch(e) { console.warn('preloadOfferCounts error', e); }
}

// Live-update every rendered instance of a listing's offer count (the Market
// Intelligence "Offers Received" stat, the action-bar "🔥 N Offers Received"
// label, and the compact offer badge) in place — no card rebuild, no page
// reload. A listing can appear more than once (Live Market grid, Matches deep
// view, "your listing" card), so update them all.
function updateOfferUIForListing(listingId) {
    const id = String(listingId);
    const count = window._offerCountMap[id] || 0;
    document.querySelectorAll(`[id="lc-${id}"]`).forEach(card => {
        const stat = card.querySelector('.lc-market-intel .lc-stat-interactive');
        if (stat) {
            const num = stat.querySelector('.lc-stat-num');
            if (num) num.textContent = count;
            const lbl = stat.querySelector('.lc-stat-label');
            if (lbl) lbl.innerHTML = `<i class="fas fa-handshake"></i>Offer${count !== 1 ? 's' : ''} Received`;
        }
        const fire = card.querySelector('.lc-offers-fire');
        if (fire) fire.innerHTML = `<i class="fas fa-fire"></i> ${count} Offer${count !== 1 ? 's' : ''} Received`;
        const badgeNum = card.querySelector('.listing-offer-badge .offer-count-num');
        if (badgeNum) badgeNum.textContent = count;
    });
}

// Portal realtime: a new row in listing_offers means someone just sent an offer.
// Update the count/badge everywhere and, if the Offers Received sheet is open on
// that listing, slide the new offer in — all without a page reload. Uses the same
// postgres_changes system as chat/listings; requires listing_offers to be in the
// supabase_realtime publication (see listing-offers-realtime-migration.sql).
let _offersChannel = null;
function subscribePortalOffers() {
    if (_offersChannel || typeof _sb === 'undefined' || !_sb.channel) return;
    try {
        _offersChannel = _sb.channel('portal-offers')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'listing_offers' },
                payload => {
                    const row = payload && payload.new;
                    if (!row) return;
                    // Idempotent: ignore if we already counted this exact offer
                    // (e.g. the sender's own client already bumped it locally).
                    const isNew = registerOffer(row.listing_id, row.user_id);
                    updateOfferUIForListing(row.listing_id);
                    if (isNew) appendOfferToModalIfOpen(row.listing_id, row.user_id, row.created_at);
                })
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.warn('[Portal] listing_offers realtime not available — run listing-offers-realtime-migration.sql');
                }
            });
    } catch (e) { console.warn('subscribePortalOffers failed', e); }
}

// Portal realtime: a listing was UPDATEd somewhere (most importantly, its owner
// marked it Sold/Bought/Rented/Leased). Merge the new server row into our
// in-memory pools and re-render so a now-completed listing drops out of AI
// Matches — and its match counts update — for EVERY viewer, with no page refresh.
// Requires listings in the supabase_realtime publication (listings-realtime-migration.sql).
let _listingsChannel = null;
function subscribePortalListings() {
    if (_listingsChannel || typeof _sb === 'undefined' || !_sb.channel) return;
    try {
        _listingsChannel = _sb.channel('portal-listings')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'listings' },
                payload => handleListingRealtimeUpdate(payload && payload.new))
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.warn('[Portal] listings realtime not available — run listings-realtime-migration.sql');
                }
            });
    } catch (e) { console.warn('subscribePortalListings failed', e); }
}

function handleListingRealtimeUpdate(row) {
    if (!row || row.id == null) return;
    // Merge the authoritative server fields (status, sold_at, archived, content,
    // pinned, …) onto our cached copy so matching + rendering see the change.
    let changed = false;
    const patch = (arr) => {
        if (!Array.isArray(arr)) return;
        const i = arr.findIndex(l => String(l.id) === String(row.id));
        if (i !== -1) { arr[i] = { ...arr[i], ...row }; changed = true; }
    };
    patch(allListings);
    patch(myListings);
    if (!changed) return; // a listing we aren't currently showing — nothing to do

    // #1 (Portal randomly refreshing): do NOT auto-re-render the Portal on a
    // realtime echo. A full applyFilters() (grid) or showAllMatches() (engine)
    // rebuild fired whenever ANY listing changed ANYWHERE — another user editing a
    // listing, or the 24h Sold sweep archiving one — which is exactly the "Portal
    // refreshing on its own while I'm just browsing/scrolling" the user hit. The
    // in-memory merge above already keeps the data correct for the next
    // pull-to-refresh, and the owner's OWN Sold action still updates locally via
    // markListingSold(). Only two NON-disruptive things happen here now:
    //   • a now-archived (deleted / expired-sold) card is surgically dropped so it
    //     doesn't linger, and
    //   • the red match-badge counts are re-recorded (no visible grid rebuild).
    if (row.archived) {
        const ledgerVisible = document.getElementById('listingsGrid') &&
                              document.getElementById('ledgerView')?.style.display !== 'none';
        if (ledgerVisible) document.getElementById('lc-' + row.id)?.remove();
    }
    try { window.RMMatchAlert?.recordMatches([...buildMatchMap().keys()].map(String)); } catch (e) {}
}

function buildOfferBadge(listing) {
    if (!listing.user_id || listing.is_anonymous) return '';
    const n = window._offerCountMap[String(listing.id)] || 0;
    if (n === 0) return '';
    return `<span class="listing-offer-badge" onclick="event.stopPropagation()">
        <i class="fas fa-handshake"></i> <span class="offer-count-num">${n}</span> Offer${n !== 1 ? 's' : ''}
    </span>`;
}

// Division 3 — Market Intelligence: premium stat cards for offers received and AI
// matches found. Same visibility rules as the old inline badges (a metric only
// shows when it's > 0) and the matches card keeps its click-through to
// showAllMatches(); no offer/match data logic changes.
function buildMarketIntel(listing, matchCount, isOwner) {
    if (!listing.user_id || listing.is_anonymous) return '';
    const offers  = window._offerCountMap[String(listing.id)] || 0;
    const matches = matchCount || 0;
    // Both cards are ALWAYS shown (even at 0) so every listing has a consistent
    // layout and users can see at a glance that there are no offers/matches yet.
    // Clickable for EVERYONE: opens the list of users who sent an offer for this
    // listing (empty state when there are none).
    const offerCard = `
        <div class="lc-stat lc-stat-interactive" onclick="event.stopPropagation(); showOffersReceived('${listing.id}')">
            <span class="lc-stat-num">${offers}</span>
            <span class="lc-stat-label"><i class="fas fa-handshake"></i>Offer${offers !== 1 ? 's' : ''} Received</span>
        </div>`;
    // The match count is visible to EVERYONE, but only the owner can open the
    // actual matches — so it's a clickable button only for the owner (and only
    // when there's something to show); everyone else sees a passive tile.
    // Use the SAME robot widget as everywhere else the AI Match Engine appears so
    // the whole Portal reads as one feature (see robotWidget() / .ai-robot).
    const matchLabel = `<span class="lc-stat-label">${robotWidget()}AI Match${matches !== 1 ? 'es' : ''} Found</span>`;
    const matchCard = (isOwner && matches > 0)
        ? `<button class="lc-stat lc-stat-match" onclick="event.stopPropagation(); showAllMatches('${listing.id}');">
            <span class="lc-stat-num">${matches}</span>
            ${matchLabel}
        </button>`
        : `<div class="lc-stat lc-stat-match-static" onclick="event.stopPropagation()">
            <span class="lc-stat-num">${matches}</span>
            ${matchLabel}
        </div>`;
    return `<div class="lc-market-intel">${offerCard}${matchCard}</div>`;
}

function showOfferPopup(listingId, ownerId, ownerName, img, category, btn) {
    window._offerListingId = listingId;
    window._offerOwnerId   = ownerId;
    window._offerOwnerName = ownerName;
    window._offerImg       = img;
    window._offerCategory  = category;
    window._offerBtn       = btn;

    let overlay = document.getElementById('offerPopupOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'offerPopupOverlay';
        overlay.innerHTML = `
            <div id="offerPopupBackdrop" onclick="closeOfferPopup()"></div>
            <div id="offerPopupSheet">
                <div id="offerPopupHandle"></div>
                <div id="offerPopupIcon"><i class="fas fa-handshake"></i></div>
                <div id="offerPopupTitle">Send Offer</div>
                <div id="offerPopupSub">Send an offer to start a conversation with this seller about the listing.</div>
                <div id="offerPopupActions">
                    <button id="offerConfirmBtn" onclick="confirmOffer()">
                        <i class="fas fa-handshake"></i> Send Offer
                    </button>
                    <button id="offerCancelBtn" onclick="closeOfferPopup()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const sheet = document.getElementById('offerPopupSheet');
        let startY = 0, curY = 0, dragging = false;
        sheet.addEventListener('touchstart', e => {
            if (e.target.closest('button')) return;
            startY = e.touches[0].clientY; dragging = true; curY = 0;
            sheet.style.transition = 'none';
        }, { passive: true });
        sheet.addEventListener('touchmove', e => {
            if (!dragging) return;
            curY = e.touches[0].clientY - startY;
            if (curY > 0) sheet.style.transform = `translateY(${curY}px)`;
        }, { passive: true });
        sheet.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false; sheet.style.transition = ''; sheet.style.transform = '';
            if (curY > 80) closeOfferPopup();
        });
    }

    const confirmBtn = document.getElementById('offerConfirmBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fas fa-handshake"></i> Send Offer';
    confirmBtn.style.background = '';
    overlay.classList.add('op-open');
    document.body.style.overflow = 'hidden';
}

function closeOfferPopup() {
    document.getElementById('offerPopupOverlay')?.classList.remove('op-open');
    document.body.style.overflow = '';
}

// ── Offers Received modal ─────────────────────────
// Anyone can open this to see who has sent an offer on a listing. Each entry
// shows the offerer's photo, name, position, company and when they offered,
// plus View Profile / Open Chat. Newest offer first; empty state when none.
function _offersDateTime(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-PH',
            { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return ''; }
}
function closeOffersReceived() {
    document.getElementById('offersRxOverlay')?.classList.remove('orx-open');
    document.body.style.overflow = '';
    window._offersRxListingId = null;
}

// One offer row's markup — shared by the initial render and the realtime
// prepend so both look identical. `data-offer-uid` lets the realtime path skip
// an offer that's already on screen.
function _offerCardHtml(o, p) {
    p = p || {};
    const name = p.full_name || 'realmate User';
    const img = p.avatar_url || avatarFallback(name);
    const pos = lmValidPosition(p.job_title);
    const company = p.division || '';
    const when = _offersDateTime(o.created_at);
    const nameJs = String(name).replace(/'/g, "\\'");
    const uid = o.user_id || '';
    return `
            <div class="offers-rx-card" data-offer-uid="${uid}">
                <img class="offers-rx-avatar" src="${img}" onerror="this.src='${avatarFallback(name)}'">
                <div class="offers-rx-info">
                    <div class="offers-rx-name">${escapeHtmlSafe(name)}</div>
                    ${pos ? `<div class="offers-rx-pos">${escapeHtmlSafe(pos)}</div>` : ''}
                    ${company ? `<div class="offers-rx-meta"><i class="fas fa-building"></i>${escapeHtmlSafe(company)}</div>` : ''}
                    ${when ? `<div class="offers-rx-meta"><i class="fas fa-clock"></i>${when}</div>` : ''}
                    <div class="offers-rx-actions">
                        <button class="offers-rx-btn offers-rx-profile" onclick="offersViewProfile('${uid}')"><i class="fas fa-user"></i> View Profile</button>
                        <button class="offers-rx-btn offers-rx-chat" onclick="offersOpenChat('${uid}','${nameJs}')"><i class="fas fa-comment-dots"></i> Open Chat</button>
                    </div>
                </div>
            </div>`;
}

// Realtime: when an offer arrives for the listing whose sheet is currently open,
// slide it in at the top (newest first) instead of making the owner reopen it.
async function appendOfferToModalIfOpen(listingId, userId, createdAt) {
    const overlay = document.getElementById('offersRxOverlay');
    if (!overlay || !overlay.classList.contains('orx-open')) return;
    if (String(window._offersRxListingId) !== String(listingId)) return;
    const body = document.getElementById('offersRxBody');
    if (!body) return;
    // If the sheet is showing the empty state (or still loading), a full reload
    // is simplest and correct.
    if (body.querySelector('.offers-rx-empty') || body.querySelector('.offers-rx-msg')) {
        showOffersReceived(listingId);
        return;
    }
    // Skip if this offerer's card is already shown.
    if (body.querySelector(`.offers-rx-card[data-offer-uid="${userId}"]`)) return;
    let p = {};
    try {
        const h = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
        const r = await fetch(
            `${supabaseUrl}/rest/v1/profiles?select=id,full_name,avatar_url,job_title,division&id=eq.${encodeURIComponent(userId)}`,
            { headers: h });
        const arr = await r.json();
        if (Array.isArray(arr) && arr[0]) p = arr[0];
    } catch (e) {}
    // Re-check it wasn't added while we were fetching, then prepend.
    if (String(window._offersRxListingId) === String(listingId) &&
        !body.querySelector(`.offers-rx-card[data-offer-uid="${userId}"]`)) {
        body.insertAdjacentHTML('afterbegin', _offerCardHtml({ user_id: userId, created_at: createdAt }, p));
    }
}
function offersViewProfile(userId) {
    if (userId) location.href = `dashboard.html?user_id=${encodeURIComponent(userId)}`;
}
function offersOpenChat(userId, name) {
    // Reuse chat.html's handoff: opens the existing 1:1 conversation with this
    // user, or creates one if none exists yet.
    try { sessionStorage.setItem('openChatWith', JSON.stringify({ userId, name })); } catch (e) {}
    rmGoChat();
}
async function showOffersReceived(listingId) {
    let overlay = document.getElementById('offersRxOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'offersRxOverlay';
        overlay.innerHTML = `
            <div id="offersRxBackdrop" onclick="closeOffersReceived()"></div>
            <div id="offersRxSheet">
                <div id="offersRxHandle"></div>
                <div id="offersRxHead">
                    <div id="offersRxTitle"><i class="fas fa-handshake"></i> Offers Received</div>
                    <button id="offersRxClose" onclick="closeOffersReceived()" aria-label="Close"><i class="fas fa-xmark"></i></button>
                </div>
                <div id="offersRxBody"></div>
            </div>`;
        document.body.appendChild(overlay);
        // Swipe-down to dismiss on mobile (same feel as the offer sheet).
        const sheet = document.getElementById('offersRxSheet');
        let startY = 0, curY = 0, dragging = false;
        sheet.addEventListener('touchstart', e => {
            if (e.target.closest('button') || e.target.closest('#offersRxBody')) return;
            startY = e.touches[0].clientY; dragging = true; curY = 0; sheet.style.transition = 'none';
        }, { passive: true });
        sheet.addEventListener('touchmove', e => {
            if (!dragging) return;
            curY = e.touches[0].clientY - startY;
            if (curY > 0) sheet.style.transform = `translateX(-50%) translateY(${curY}px)`;
        }, { passive: true });
        sheet.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false; sheet.style.transition = ''; sheet.style.transform = '';
            if (curY > 90) closeOffersReceived();
        });
    }

    // Remember which listing the sheet is showing so realtime offer inserts can
    // decide whether to slide themselves in.
    window._offersRxListingId = String(listingId);

    const body = document.getElementById('offersRxBody');
    body.innerHTML = `<div class="offers-rx-msg"><i class="fas fa-circle-notch fa-spin"></i><p>Loading offers…</p></div>`;
    overlay.classList.add('orx-open');
    document.body.style.overflow = 'hidden';

    try {
        const h = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
        const offResp = await fetch(
            `${supabaseUrl}/rest/v1/listing_offers?select=user_id,created_at&listing_id=eq.${encodeURIComponent(listingId)}&order=created_at.desc`,
            { headers: h });
        const offers = await offResp.json();

        if (!Array.isArray(offers) || !offers.length) {
            body.innerHTML = `<div class="offers-rx-msg offers-rx-empty">
                <i class="fas fa-inbox"></i>
                <p>No offers have been received for this listing yet.</p>
            </div>`;
            return;
        }

        // Resolve each offerer's live profile (name, photo, position, company).
        const ids = [...new Set(offers.map(o => o.user_id).filter(Boolean))];
        const byId = {};
        if (ids.length) {
            const idList = ids.map(id => `"${id}"`).join(',');
            const profResp = await fetch(
                `${supabaseUrl}/rest/v1/profiles?select=id,full_name,avatar_url,job_title,division&id=in.(${idList})`,
                { headers: h });
            const profs = await profResp.json();
            (Array.isArray(profs) ? profs : []).forEach(p => { byId[p.id] = p; });
        }

        body.innerHTML = offers.map(o => _offerCardHtml(o, byId[o.user_id])).join('');
    } catch (e) {
        console.warn('showOffersReceived error', e);
        body.innerHTML = `<div class="offers-rx-msg offers-rx-empty">
            <i class="fas fa-triangle-exclamation"></i>
            <p>Couldn't load offers. Please try again.</p>
        </div>`;
    }
}

async function confirmOffer() {
    const btn = document.getElementById('offerConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending...';

    const listingId = window._offerListingId;
    const ownerId   = window._offerOwnerId;
    const ownerName = window._offerOwnerName;
    const img       = window._offerImg;
    const category  = window._offerCategory;

    try {
        const { data: authData } = await _sb.auth.getUser();
        const myId = authData?.user?.id;
        if (!myId) throw new Error('Not authenticated');

        // Defense in depth: the Send Offer button is already hidden on sold
        // listings, but re-check the live status so a stale card (marked sold
        // in another tab/session after this one loaded) can't still send one.
        const { data: statusRow } = await _sb.from('listings').select('status').eq('id', listingId).single();
        if (statusRow?.status === 'sold') {
            btn.innerHTML = '<i class="fas fa-check-circle"></i> This listing is sold';
            btn.style.background = '#64748b';
            setTimeout(closeOfferPopup, 1500);
            return;
        }

        // Record offer (unique per user per listing — 1 row per user enforced by PRIMARY KEY)
        try {
            await _sb.from('listing_offers').upsert(
                { listing_id: listingId, user_id: myId },
                { onConflict: 'listing_id,user_id', ignoreDuplicates: true }
            );
            // Bump the in-memory count (idempotent — the realtime INSERT for this
            // same offer will be deduped) and refresh the badge in place.
            registerOffer(listingId, myId);
            updateOfferUIForListing(listingId);
            // Behavioural intelligence (dormant unless enabled): offer sent.
            try { window.RMTrack && RMTrack.emit('offer', { listing_id: listingId, target_user_id: ownerId, metadata: { category } }); } catch(e){}
        } catch(offerErr) { console.warn('listing_offers table error (run migration?):', offerErr); }

        btn.innerHTML = '<i class="fas fa-check"></i> Offer Sent!';
        btn.style.background = '#16a34a';

        // Get listing data for reference card
        const { data: listingData } = await _sb.from('listings').select('*').eq('id', listingId).single();

        // Find or create the conversation and insert LISTING_REF message — await before navigating
        const SUPA_URL = supabaseUrl;
        const SUPA_KEY = supabaseKey;
        const h = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

        let convId = null;
        try {
            const myPartsResp = await fetch(`${SUPA_URL}/rest/v1/conversation_participants?select=conversation_id&user_id=eq.${myId}`, { headers: h });
            const myParts = await myPartsResp.json();
            const myConvIds = (Array.isArray(myParts) ? myParts : []).map(p => p.conversation_id);

            if (myConvIds.length) {
                const idStr = myConvIds.map(id => `"${id}"`).join(',');
                const otherPartsResp = await fetch(`${SUPA_URL}/rest/v1/conversation_participants?select=conversation_id&user_id=eq.${ownerId}&conversation_id=in.(${idStr})`, { headers: h });
                const otherParts = await otherPartsResp.json();
                if (Array.isArray(otherParts) && otherParts.length) convId = otherParts[0].conversation_id;
            }

            if (!convId) {
                const now = new Date().toISOString();
                const convResp = await fetch(`${SUPA_URL}/rest/v1/conversations`, { method: 'POST', headers: h, body: JSON.stringify({ created_at: now, updated_at: now }) });
                const convData = await convResp.json();
                convId = (Array.isArray(convData) ? convData[0] : convData)?.id;
                if (!convId) throw new Error('No conv id returned');
                await fetch(`${SUPA_URL}/rest/v1/conversation_participants`, { method: 'POST', headers: h, body: JSON.stringify({ conversation_id: convId, user_id: myId }) });
                await fetch(`${SUPA_URL}/rest/v1/conversation_participants`, { method: 'POST', headers: h, body: JSON.stringify({ conversation_id: convId, user_id: ownerId }) });
            }

            const refPayload = JSON.stringify({ id: listingId, img, category, content: listingData?.content || '', created_at: listingData?.created_at || '' });
            // Insert LISTING_REF card first
            await fetch(`${SUPA_URL}/rest/v1/messages`, {
                method: 'POST', headers: h,
                body: JSON.stringify({ conversation_id: convId, sender_id: myId, message_type: 'TEXT', message_text: `__LISTING_REF__${refPayload}`, is_read: false })
            });
            // Automated offer message from the offerer
            const localUser = JSON.parse(localStorage.getItem('user') || '{}');
            const senderName = localUser.name || 'Someone';
            const autoMsg = `Hi ${ownerName}! I'd like to make an offer on your ${category || 'property'} listing. Please let me know if you're open to discussing. 🤝`;
            await fetch(`${SUPA_URL}/rest/v1/messages`, {
                method: 'POST', headers: h,
                body: JSON.stringify({ conversation_id: convId, sender_id: myId, message_type: 'TEXT', message_text: autoMsg, is_read: false })
            });
            // Insert offer notification for the listing owner
            await fetch(`${SUPA_URL}/rest/v1/notifications`, {
                method: 'POST', headers: h,
                body: JSON.stringify({
                    recipient_user_name: ownerName,
                    sender_user_name: senderName,
                    sender_user_id: myId,
                    sender_profile_picture: localUser.image || localUser.img || localUser.avatar || '',
                    type: 'offer',
                    message: `${senderName} sent you an offer on your ${category || 'property'} listing.`,
                    is_read: false,
                    created_at: new Date().toISOString()
                })
            });
        } catch(refErr) {
            console.warn('LISTING_REF insert error', refErr);
        }

        // Show success briefly, then navigate
        await new Promise(r => setTimeout(r, 700));
        closeOfferPopup();
        sessionStorage.setItem('openChatWith', JSON.stringify({ userId: ownerId, name: ownerName }));
        rmGoChat();

    } catch(e) {
        console.warn('confirmOffer error', e);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-handshake"></i> Send Offer';
        btn.style.background = '';
    }
}

// ── AI text extraction helpers ──────────────────────
function _xSqm(t) { const m = t.match(/(\d[\d,.]*)\s*(?:sqm|sq\.?\s*m)/i); return m ? m[1].replace(/,/g, '') + ' sqm' : null; }
function _xLot(t) { const m = t.match(/lot\s*area[:\s]*(\d[\d,.]*)/i); return m ? m[1].replace(/,/g, '') + ' sqm' : null; }
function _xBed(t) { const u = extractUnit(t); if (u === 'Studio') return 'Studio'; if (u) return u.replace('BR', ' Bedroom'); return null; }
function _xBath(t) { const m = t.match(/(\d+)\s*(?:bath|bathroom|t&b|toilet)/i); return m ? m[1] : null; }
function _xPark(t) { if (/\bwith\s*parking\b/i.test(t)) return 'Yes'; if (/\bno\s*parking\b/i.test(t)) return 'No'; if (/\b(\d+)\s*parking/i.test(t)) return t.match(/(\d+)\s*parking/i)[1]; return null; }
function _xTower(t) { const m = t.match(/tower\s*(\w+)/i); return m ? 'Tower ' + m[1] : null; }
function _xFurn(t) { const l = t.toLowerCase(); if (/\bfull(?:y)?\s*furnished\b/.test(l)) return 'Fully Furnished'; if (/\bsemi[\s-]*furnished\b/.test(l)) return 'Semi-Furnished'; if (/\bunfurnished\b|\bbare\b/.test(l)) return 'Bare'; if (/\bfurnished\b/.test(l)) return 'Furnished'; return null; }
function _xDev(t) { const l = t.toLowerCase(); const d = [['alveo land','Alveo Land'],['ayala land','Ayala Land'],['smdc','SMDC'],['dmci','DMCI'],['megaworld','Megaworld'],['rockwell','Rockwell'],['federal land','Federal Land'],['filinvest','Filinvest'],['avida','Avida'],['amaia','Amaia']]; for (const [k,n] of d) { if (l.includes(k)) return n; } return null; }
function _xFloor(t) { const m = t.match(/(\d+)(?:th|st|nd|rd)\s*floor/i); return m ? m[0] : null; }
function _xType(t) { const l = t.toLowerCase(); if (/\bresidential\s*lot\b/.test(l)) return 'Residential Lot'; if (/\bcommercial\s*lot\b/.test(l)) return 'Commercial Lot'; if (/\bcondo(?:minium)?\b/.test(l)) return 'Condominium'; if (/\btownhouse\b/.test(l)) return 'Townhouse'; if (/\bhouse\s*(?:and|&)\s*lot\b/.test(l)) return 'House & Lot'; if (/\boffice\b/.test(l)) return 'Office'; return null; }
function _xTurnover(t) { if (/\brfo\b|\bready\s*for\s*occupancy\b/i.test(t)) return 'Ready for Occupancy'; if (/\bpre[\s-]*selling\b/i.test(t)) return 'Pre-Selling'; if (/\bturnover\b/i.test(t)) return 'Turnover Ready'; return null; }

// Strips every field we surface as structured data (location, project, developer,
// price, unit type/size, bedrooms, and the extra spec details) out of the raw post
// text, leaving only the free-form description. Shared by the compact card text
// (enhanceListingText) and the photo-card detail view (buildListingDetails) so the
// description never repeats data already shown above it. Returns the leftover body
// plus any word attached to the price (e.g. "negotiable") for the price display.
function stripListingFields(raw) {
    let body = raw || '';
    const locations = extractLocations(raw);
    const projectFull = extractProjectFull(raw);
    const project = projectFull ? projectFull.project : null;
    const projectOriginal = projectFull ? (projectFull.originalPhrase || project) : null;
    const price = extractPrice(raw);

    if (project) {
        // Separator-insensitive strip so a canonical "The Columns Ayala Avenue"
        // also removes a posted "the columns - ayala avenue" from the body.
        body = body.replace(new RegExp(separatorInsensitivePattern(project), 'gi'), '');
        // Also strip the original misspelled phrase if it differs from the corrected name
        if (projectOriginal && projectOriginal.toLowerCase() !== project.toLowerCase()) {
            body = body.replace(new RegExp(projectOriginal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        }
    }

    // Remove location keywords + "area" suffix from body
    if (locations.length) {
        const keys = Object.keys(LOCATION_KEYWORDS || {}).sort((a, b) => b.length - a.length);
        keys.forEach(k => {
            body = body.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*area', 'gi'), '');
            body = body.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        });
        body = body.replace(/\barea\b/gi, '');
    }

    // Remove price + attached words (e.g. "18M budget", "19M negotiable")
    let priceContext = '';
    if (price) {
        // Qualifier words that cling to a price ("only", "negotiable", "net"…).
        // We grab the first one so it rides along with the highlighted price, and
        // let the price match swallow the whole trailing phrase (incl. redundant
        // price keywords) so nothing like "only" is left dangling in the body.
        const QUAL = 'only|negotiable|neg|net|all[\\s-]?in|cash|flat|fixed|firm|and\\s*up|or\\s*(?:less|below)';
        const grabQual = (m) => {
            if (priceContext) return;
            const q = m.match(new RegExp('\\b(' + QUAL + ')\\b', 'i')) || m.match(/\(([^)]+)\)/);
            if (q) priceContext = q[1];
        };
        // Trailing bit a price can absorb: attached keyword/qualifier words AND a
        // parenthesised qualifier like "(negotiable)" or "(as is)".
        const TRAIL = '(?:[\\s(]+(?:budget|asking|price|' + QUAL + ')\\)?)*(?:\\s*\\([^)]*\\))?';
        // Remove range patterns first e.g. "BUDGET 30-40M", "35k to 40k (negotiable)"
        body = body.replace(new RegExp('\\b(?:budget|asking|price|php|₱)?\\s*\\d+\\.?\\d*\\s*m?\\s*(?:-|to|or)\\s*\\d+\\.?\\d*\\s*m(?:illion)?\\b' + TRAIL, 'gi'), m => (grabQual(m), ''));
        body = body.replace(new RegExp('\\b(?:budget|asking|price|php|₱)?\\s*\\d+\\.?\\d*\\s*k?\\s*(?:-|to|or)\\s*\\d+\\.?\\d*\\s*k\\b' + TRAIL, 'gi'), m => (grabQual(m), ''));
        // Remove leading price keywords left behind e.g. "BUDGET", "ASKING"
        body = body.replace(/\b(?:budget|asking price|asking)\b/gi, '');
        // Single amount + optional trailing qualifier and/or parenthesised
        // qualifier. Only absorb a *recognized* qualifier word — not any word —
        // so an unrelated next word (e.g. "40M\nFull furnished") is left in the
        // body instead of being glued onto the price.
        const TAIL = '(?:\\s+(?:budget|asking|price|' + QUAL + '))?(?:\\s*\\([^)]*\\))?';
        const pricePatterns = [
            new RegExp('₱?\\s*\\d{1,3}(,\\d{3})+(\\.\\d+)?' + TAIL, 'g'),
            new RegExp('(\\d+\\.?\\d*)\\s*[Mm](?:illion)?' + TAIL, 'gi'),
            new RegExp('(\\d+\\.?\\d*)\\s*[Kk]\\b' + TAIL, 'g'),
            new RegExp('\\b\\d{7,9}' + TAIL, 'g'),
        ];
        for (const pat of pricePatterns) {
            const match = body.match(pat);
            if (match) {
                match.forEach(m => {
                    const extra = m.replace(/₱?\s*\d[\d,.]*\s*[MmKk]?(?:illion)?/i, '').trim();
                    if (extra && !priceContext) priceContext = extra;
                    body = body.replace(m, '');
                });
            }
        }
    }

    // Clean up leftover artifacts
    body = body.replace(/\n\s*\n/g, '\n').replace(/^\s*[,\-–—·•:;\n]+/gm, '').replace(/[,\-–—·•:;]\s*$/gm, '').replace(/\n{2,}/g, '\n').trim();

    // Extract developer and remove from body
    const developer = _xDev(raw);
    if (developer) {
        const devPatterns = [['alveo land'],['ayala land'],['smdc'],['dmci'],['megaworld'],['rockwell'],['federal land'],['filinvest'],['avida'],['amaia']];
        devPatterns.forEach(([k]) => { body = body.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''); });
    }

    // Extract unit type and size, remove from body
    const unitType = _xType(raw);
    const bedrooms = _xBed(raw);
    const sqm = _xSqm(raw);
    if (unitType) body = body.replace(/\b(residential\s*lot|commercial\s*lot|condo(?:minium)?|townhouse|house\s*(?:and|&)\s*lot|office\s*space|office)\b/gi, '');
    if (bedrooms) {
        // Remove full range pattern first e.g. "Studio OR 1BR", "2-BEDROOM OR 3-BEDROOM"
        body = body.replace(/(?:studio|\d[\s-]*(?:br|bedroom\w*))\s+or\s+(?:studio|\d[\s-]*(?:br|bedroom\w*))/gi, '');
        // Then remove any remaining single bedroom mentions
        body = body.replace(/\b(studio|1[\s-]*br|2[\s-]*br|3[\s-]*br|4[\s-]*br|\d+[\s-]*bedroom\w*|one\s*bedroom|two\s*bedroom|three\s*bedroom|four\s*bedroom)\b/gi, '');
    }
    if (sqm) body = body.replace(/\d[\d,.]*\s*(?:sqm|sq\.?\s*m|square\s*met\w*)/gi, '');

    // Extract extra details and remove from body
    if (_xBath(raw)) body = body.replace(/\b\d+\s*(?:bath|bathroom|t&b|toilet)\w*/gi, '');
    if (_xPark(raw)) body = body.replace(/\b(with\s*parking|no\s*parking|\d+\s*parking)\b/gi, '');
    if (_xFurn(raw)) body = body.replace(/\b(full(?:y)?\s*furnished|semi[\s-]*furnished|unfurnished|bare|furnished)\b/gi, '');
    if (_xTower(raw)) body = body.replace(/\btower\s*\w+\b/gi, '');
    if (_xFloor(raw)) body = body.replace(/\b\d+(?:th|st|nd|rd)\s*floor\b/gi, '');
    if (_xTurnover(raw)) body = body.replace(/\b(rfo|ready\s*for\s*occupancy|pre[\s-]*selling|turnover\s*ready)\b/gi, '');

    // Final body cleanup. Also drops brackets left empty after a field inside
    // them was stripped (e.g. "(35k to 40k only)" → "()"), collapses doubled
    // separators/spaces, and trims stray leading/trailing punctuation.
    body = body
        .replace(/[([{][\s,;:·•\-–—]*[)\]}]/g, '')
        .replace(/([,;:·•])\s*(?=[,;:·•])/g, '')
        .replace(/\n\s*\n/g, '\n')
        .replace(/^\s*[,\-–—·•:;\n]+/gm, '')
        .replace(/[,\-–—·•:;]\s*$/gm, '')
        .replace(/\n{2,}/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .trim();

    return { body, priceContext };
}

function enhanceListingText(listing) {
    const raw = listing.content || '';

    const locations = extractLocations(raw);
    const projectFull = extractProjectFull(raw);
    const project = projectFull ? projectFull.project : null;
    const priceRange = extractPriceRange(raw);
    const price = extractPrice(raw);
    const developer = _xDev(raw);

    const { body, priceContext } = stripListingFields(raw);

    const unitType = _xType(raw);
    const bedrooms = _xBed(raw);
    const sqm = _xSqm(raw);
    const unitParts = [];
    if (bedrooms) unitParts.push(bedrooms);
    else if (unitType) unitParts.push(unitType);
    if (sqm) unitParts.push(sqm);

    // Extra detail lines
    const bath = _xBath(raw);
    const park = _xPark(raw);
    const furn = _xFurn(raw);
    const tower = _xTower(raw);
    const floor = _xFloor(raw);
    const turnover = _xTurnover(raw);
    const extras = [];
    if (bath) extras.push(bath + ' Bathroom' + (bath > 1 ? 's' : ''));
    if (park) extras.push(park === 'Yes' ? 'With Parking' : park === 'No' ? 'No Parking' : park + ' Parking');
    if (furn) extras.push(furn);
    if (tower) extras.push(tower);
    if (floor) extras.push(floor);
    if (turnover) extras.push(turnover);

    // Build compact text — no blank lines
    let result = '';
    if (locations.length) result += `<span class="lc-hl-location">${locations.join(', ')}</span>`;
    if (developer) result += `<span class="lc-hl-developer">${developer}</span>`;
    if (project) result += `<span class="lc-hl-project">${project}</span>`;
    if (unitParts.length) result += `<span class="lc-hl-unit">${unitParts.join(' — ')}</span>`;
    if (priceRange) result += `<span class="lc-hl-price">₱${priceRange.low}${priceRange.unit} – ₱${priceRange.high}${priceRange.unit}${priceContext ? ' ' + priceContext : ''}</span>`;
    else if (price) result += `<span class="lc-hl-price">₱${price.toLocaleString()}${priceContext ? ' ' + priceContext : ''}</span>`;
    if (extras.length) result += `<span class="lc-hl-extras">${extras.join('<br>')}</span>`;
    if (body) result += `<span class="lc-hl-body">${safeText(body)}</span>`;

    return result || safeText(raw);
}

// Full peso amount, never abbreviated (e.g. ₱18,500,000). Handles both a single
// price and a range, expanding M/K shorthand to the full number.
function formatFullPrice(price, priceRange) {
    if (priceRange) {
        const mult = priceRange.unit === 'M' ? 1_000_000 : priceRange.unit === 'K' ? 1_000 : 1;
        const lo = Math.round(priceRange.low * mult), hi = Math.round(priceRange.high * mult);
        return `₱${lo.toLocaleString('en-PH')} – ₱${hi.toLocaleString('en-PH')}`;
    }
    if (price) return `₱${Math.round(price).toLocaleString('en-PH')}`;
    return '';
}

// Right-column structured listing information + the full original caption.
// Reuses the same AI extractors as enhanceListingText() — no parsing logic is
// changed here; this only lays the extracted fields out for the two-column card.
function buildListingDetails(listing) {
    const raw = listing.content || '';
    const locations = extractLocations(raw);
    const projectFull = extractProjectFull(raw);
    const project = projectFull ? projectFull.project : null;
    const developer = _xDev(raw);
    const priceRange = extractPriceRange(raw);
    const price = extractPrice(raw);

    const unitType = _xType(raw);
    const bedrooms = _xBed(raw);
    const sqm = _xSqm(raw);
    const bath = _xBath(raw);
    const park = _xPark(raw);
    const furn = _xFurn(raw);
    const tower = _xTower(raw);
    const floor = _xFloor(raw);
    const turnover = _xTurnover(raw);

    let html = '';
    if (locations.length) html += `<div class="ld-location">${locations.join(', ')}</div>`;
    if (project) html += `<div class="ld-project">${project}</div>`;
    if (developer) html += `<div class="ld-developer">by ${developer}</div>`;
    // Strip once — reuse for the caption below and to append any price qualifier
    // (e.g. "(negotiable)") onto the highlighted price instead of leaving it in text.
    const { body: strippedBody, priceContext } = stripListingFields(raw);
    const priceStr = formatFullPrice(price, priceRange);
    if (priceStr) html += `<div class="ld-price">${priceStr}${priceContext ? ' ' + priceContext : ''}</div>`;

    // Specs as text lines (no icons/labels). Bedrooms (or unit type) sits beside
    // the size on one line — same grouping rule as the compact highlight view, so
    // photo posts read like the image-less ones. The rest go one per line.
    const chips = [];
    const unitLine = [(bedrooms || unitType), sqm].filter(Boolean).join(' — ');
    if (unitLine)  chips.push(unitLine);
    if (bath)      chips.push(bath + (bath > 1 ? ' Bathrooms' : ' Bathroom'));
    if (park)      chips.push(park === 'Yes' ? 'With Parking' : park === 'No' ? 'No Parking' : park + ' Parking');
    if (floor)     chips.push(floor);
    if (furn)      chips.push(furn);
    if (tower)     chips.push(tower);
    if (turnover)  chips.push(turnover);

    if (chips.length) {
        html += `<div class="ld-chips">${chips.map(v =>
            `<span class="ld-chip">${v}</span>`
        ).join('')}</div>`;
    }

    // Description below the specs uses the same field-stripping as the compact card
    // so it doesn't repeat the project name, unit type, price, etc. shown above.
    const caption = safeText(strippedBody);
    if (caption.trim()) {
        html += `<p class="ld-desc">${caption}</p>`;
    }
    return html || safeText(raw);
}

// ── Portal post highlights ────────────────────────
// Brand-agnostic highlights for a Portal post: only the three universally useful
// facts — Location, Unit Type, Price — each AI-extracted from the raw post no
// matter how it was written. Nothing here rewrites the seller's text; the
// original is shown verbatim by buildRawPost(). Reuses the existing extractors,
// so no parsing/matching logic changes.
// Property Highlights were removed from Portal cards to keep posts clean and
// simple; the full highlights still render on the Listing Detail page. The
// underlying extractors (_hlUnitType, _hlPrice, displayLocations) are kept below
// because the Match Engine and other callers still rely on them.

// ── Intelligent Unit Type detection (shared by the card + Match Engine) ──
// A type keyword only counts when it names the property ACTUALLY being sold —
// not a suggested use, investment angle, or future development ("suitable for a
// townhouse", "ideal for condominium development", "can be converted into an
// office"). This mirrors the Listing Detail engine so Portal + Dashboard label
// the same property, and so a residential lot is never matched as a townhouse.
//
// True when the type keyword at [s,e] describes a POSSIBLE USE (judged within
// its own sentence) rather than the asset being offered.
// _hlUseMention and _hlSubject moved to match-engine.js (window.RM_MATCH), aliased at top.
// Bedroom count for the highlight — first non-use mention (digit form preferred).
function _hlBedCountSubject(text) {
    const w = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    for (const re of [/\b([1-5])\s*-?\s*(?:br|bedrooms?)\b/gi,
                      /\b(one|two|three|four|five)[\s-]*bed\s*rooms?\b/gi]) {
        let m;
        while ((m = re.exec(text))) {
            if (_hlUseMention(text, m.index, m.index + m[0].length)) continue;
            const v = m[1].toLowerCase();
            return /^\d$/.test(v) ? parseInt(v, 10) : w[v];
        }
    }
    return null;
}

// Display-only Unit Type for the highlight — resolves the raw post to ONE value
// from the fixed vocabulary (Studio, N Bedroom(s), Penthouse, Townhouse,
// House and Lot, the Lots, Commercial/Office Space, Building, Office Building,
// Industrial Lot). Distinctive structure types win over a bedroom count; the
// generic "office"/"building" words are last so they don't hijack a residential
// unit that merely mentions "building amenities" or a "home office". Possible
// uses never win. Never touches the shared extractors used by the Match Engine.
function _hlUnitType(raw) {
    const text = (raw || '').replace(/\r/g, '');
    if (_hlSubject(text, /\bpent[\s-]*house\b/))                 return 'Penthouse';
    if (_hlSubject(text, /\btown[\s-]*house\b/))                 return 'Townhouse';
    if (_hlSubject(text, /\bhouse\s*(?:and|&|\+)?\s*lot\b/))     return 'House and Lot';
    if (_hlSubject(text, /\bresidential\s*lot\b/))               return 'Residential Lot';
    if (_hlSubject(text, /\bcommercial\s*lot\b/))                return 'Commercial Lot';
    if (_hlSubject(text, /\bindustrial\s*lot\b/))                return 'Industrial Lot';
    if (_hlSubject(text, /\bcommercial\s*space\b/))              return 'Commercial Space';
    if (_hlSubject(text, /\boffice\s*building\b/))               return 'Office Building';
    if (_hlSubject(text, /\boffice\s*(?:space|unit|condo\w*)\b/)) return 'Office Space';
    if (_hlSubject(text, /\bstudio\b/))                          return 'Studio';
    const bed = _hlBedCountSubject(text);
    if (bed) return bed === 1 ? '1 Bedroom' : `${bed} Bedrooms`;
    if (_hlSubject(text, /\boffice\b/))                          return 'Office Space';
    if (_hlSubject(text, /\bbuilding\b/))                        return 'Building';
    return '';
}

// Bedroom count 1–5 from digit ("2BR", "2 bedroom") or word ("two-bedroom") form.
function _hlBedCount(l) {
    let m = l.match(/\b([1-5])\s*-?\s*(?:br|bedrooms?)\b/);
    if (m) return parseInt(m[1], 10);
    const w = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    m = l.match(/\b(one|two|three|four|five)[\s-]*bed\s*rooms?\b/);
    if (m) return w[m[1]];
    return null;
}

// Full formatted price for the highlight. Prefers the existing (sale-oriented)
// extractors; falls back to rent/lease amounts they skip (e.g. "125,000/month")
// so the amount always shows. Display-only — no matching logic changes.
function _hlPrice(raw) {
    const priceRange = extractPriceRange(raw);
    const price = extractPrice(raw);
    // Only the amount — no trailing qualifiers like "negotiable" / "gross".
    const out = formatFullPrice(price, priceRange);
    if (out) return out;

    // Rent/lease: a plain thousands figure tied to a period (/month, per month…).
    const m = (raw || '').match(/(?:php|₱|p)?\s*(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(k)?\s*(?:\/|per\s+|a\s+)?\s*(month|mo|monthly|year|yr|annum)\b/i);
    if (m) {
        let amt = parseFloat(m[1].replace(/,/g, ''));
        if (m[2]) amt *= 1000;
        const per = /^(mo|month)/i.test(m[3]) ? '/ month' : '/ year';
        return `₱${Math.round(amt).toLocaleString('en-PH')} ${per}`;
    }
    return '';
}

// The seller's ORIGINAL raw post, shown exactly as entered — every word, line
// break, space and emoji preserved (escaped for safety; the container carries
// white-space: pre-wrap). Never rewritten or enhanced.
function buildRawPost(listing) {
    return `<div class="lc-raw-post">${escapeHtmlSafe(listing.content || '')}</div>`;
}

// ── Listing card ──────────────────────────────────
// matchLabel: { myCategory, myContent } when this card matches one of the user's own listings
// The AI Match Engine's robot face — the single animated widget used across the
// Portal wherever an AI match is indicated (the owner's header button, the
// "matches your listing" banner, the "AI Matches Found" stat, the AI Match
// Engine button, and the AI Analysis title). Sized purely by CSS (font-size on
// .ai-robot); its blink / antenna / visor-scan animations live in livemarket.css.
function robotWidget() {
    return `<span class="ai-robot" aria-hidden="true"><svg viewBox="12 12 76 76">`
        + `<line class="ant" x1="50" y1="9" x2="50" y2="22"/><circle class="tip" cx="50" cy="8" r="4"/>`
        + `<line class="ear" x1="22" y1="46" x2="15" y2="46"/><line class="ear" x1="78" y1="46" x2="85" y2="46"/>`
        + `<rect class="head" x="22" y="24" width="56" height="52" rx="13"/>`
        + `<rect class="visor" x="30" y="40" width="40" height="17" rx="6"/>`
        + `<rect class="scan" x="31" y="41" width="4" height="15" rx="2"/>`
        + `<circle class="eye" cx="42" cy="48.5" r="4.4"/><circle class="eye" cx="58" cy="48.5" r="4.4"/>`
        + `<rect class="mouth" x="41" y="65" width="18" height="3" rx="1.5"/></svg></span>`;
}

// The Engine Analysis brain widget — a pulsing brain with firing synapse sparks.
// Used for the "Engine Analysis" breakdown inside the AI Match Engine page.
function brainWidget() {
    return `<span class="ai-brain" aria-hidden="true"><i class="fas fa-brain"></i>`
        + `<span class="ai-brain-spark s1"></span><span class="ai-brain-spark s2"></span></span>`;
}

function buildListingCard(listing, matchLabel = null, fmvResult = null, matchCount = 0, opts = {}) {
    const localUser = JSON.parse(localStorage.getItem('user') || 'null');
    const card = document.createElement('div');
    card.className = 'listing-card' + (matchLabel ? ' is-match' : '');
    card.id = 'lc-' + listing.id;

    // Portal posts show a SINGLE cover photo (or none — demand-side posts like
    // Willing to Buy/Lease often carry no image). The remaining photos are kept on
    // the listing and only appear on the Listing Detail page.
    const coverUrl = coverImageUrl(listing);

    const matchScore = matchLabel?.matchScore || 0;
    const matchPct = Math.min(99, Math.round((matchScore / 100) * 100));
    const matchGrade = matchPct >= 70 ? 'Excellent' : matchPct >= 45 ? 'Strong' : matchPct >= 25 ? 'Good' : 'Possible';
    const matchReasons = matchLabel?.matchReasons || [];
    const isDismissedByMe = getDismissedMatches().has(String(listing.id));
    const matchBanner = (matchLabel && !isDismissedByMe) ? `
        <div class="match-banner" onclick="event.stopPropagation(); openMatchForListing('${listing.id}')" style="cursor:pointer;">
            <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;">
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#94a3b8;">Matches your listing · <span style="color:#fff;">${matchLabel.myCategory}</span></span>
            </div>
            <span class="match-pct-badge" style="color:#fff;">${matchPct}% ${matchGrade}</span>
            <i class="fas fa-chevron-right match-banner-arrow" style="color:#475569;"></i>
        </div>` : '';

    // Diagonal completion sash across the WHOLE card, running corner-to-corner
    // bottom-left → top-right. Its exact angle + length are set per-card by
    // fitCompletionSashes() (JS) from the card's real size, so it hits the true
    // corners at any card height — with or without a cover photo. The word follows
    // the post type (SOLD / RENTED / LEASED / BOUGHT); Willing (demand-side) posts
    // get a GREEN sash, supply-side For Sale/Rent/Lease a RED one.
    const statusRibbon = listing.status === 'sold'
        ? `<div class="sold-ribbon${isWillingCategory(listing.category) ? ' sold-ribbon-willing' : ''}"><span>${completionLabel(listing.category).toUpperCase()}</span></div>`
        : '';

    const isPinned = getPinnedIds().includes(String(listing.id));
    const isOwner = localUser && listing.user_name === localUser.name;
    // Dismiss = hide any other user's post from my feed (not just matches)
    const canDismiss = localUser && listing.user_name !== localUser.name;

    // Seller identity (preserved onclick behavior: self → showSelfPopup, other → showSellerPopup)
    const isSelf = localUser && String(listing.user_id) === String(localUser.id);
    const userClick = listing.is_anonymous || !listing.user_id ? '' :
        isSelf
            ? `onclick="event.stopPropagation();showSelfPopup();return false;" style="cursor:pointer;"`
            : `onclick="event.stopPropagation();showSellerPopup('${listing.user_id}','${(listing.user_name||'').replace(/'/g,"\\'")}','${(listing.user_img||'').replace(/'/g,"\\'")}','${(listing.user_job||'').replace(/'/g,"\\'")}');return false;" style="cursor:pointer;"`;

    // Verified badge only renders if the listing ever carries a verified flag —
    // pinned to the lower-right of the avatar (Facebook-style verified placement).
    const verifiedBadge = listing.user_verified
        ? '<span class="lc-profile-verified"><i class="fas fa-circle-check" title="Verified"></i></span>' : '';
    const kebabMenu = buildCardMenu(listing, { isOwner, canDismiss, isPinned });

    // Owner's own listing + at least one valid AI match → a beating "AI Matches
    // Found" button in the header, immediately LEFT of the three-dot menu. The
    // rotating orbital "physics" widget sits inside it; the button itself pulses
    // like a heartbeat. Count comes straight from matchCountMap (same hard-gated
    // computeMatchScore rules as the engine) — never hard-coded — and clicking it
    // opens the AI Match Engine for THIS listing. Hidden entirely when count is 0.
    const headerMatchBtn = (isOwner && matchCount > 0 && !opts.hideMatchBtn)
        ? `<button class="lc-aim-btn" onclick="event.stopPropagation(); showAllMatches('${listing.id}');"
                 aria-label="${matchCount} AI match${matchCount !== 1 ? 'es' : ''} found — open AI Match Engine">
             ${robotWidget()}
             <span class="lc-aim-count">${matchCount}</span>
             <span class="lc-aim-text">AI Match${matchCount !== 1 ? 'es' : ''}<span class="lc-aim-found"> Found</span></span>
           </button>`
        : '';
    // A genuine AI match for one of the current user's listings (same gate as the
    // match banner) turns the footer's primary button into "AI Match Engine".
    const isMatch = !!(matchLabel && !isDismissedByMe);
    const actionBar = buildActionBar(listing, isOwner, isMatch);

    // ── Profile header (Feed-style): avatar with lower-right badge, name with the
    //    timestamp directly below, and the three-dot menu. (The Realmates button
    //    was removed from the post to keep the action area clean.) ──
    const profileHeader = `
        <div class="lc-profile">
            <div class="lc-profile-av${userClick ? ' lc-profile-av-click' : ''}" ${userClick}>
                <img class="lc-profile-avatar" src="${listing.user_img || avatarFallback(listing.user_name)}"
                     onerror="this.src='${avatarFallback(listing.user_name)}'">
                ${verifiedBadge}
            </div>
            <div class="lc-profile-meta" ${userClick}>
                <div class="lc-profile-name"><span class="lc-seller-name-text">${listing.user_name || 'Unknown'}</span></div>
                <div class="lc-profile-time">${timeAgo(listing.created_at)}</div>
            </div>
            <div class="lc-profile-actions">
                ${headerMatchBtn}
                ${kebabMenu}
            </div>
        </div>`;

    // New Portal post structure: Header → category pill → Caption/Content → ONE
    // cover photo → Action buttons. The caption (the seller's own words, which
    // naturally include the property information) sits ABOVE the cover photo; there
    // is no separate "Property Information" box and no photo grid/carousel.
    const coverHtml = coverUrl
        ? `<div class="lc-cover"><img class="lc-cover-img" src="${coverUrl}" loading="lazy" onerror="lcCoverErr(this)"></div>`
        : '';
    card.innerHTML = `
        <div class="lc-swipe-content">
        ${statusRibbon}${matchBanner}
        <!-- Profile header, then category pill, then the caption, then a single
             cover photo, then the action buttons. -->
        ${profileHeader}
        <div class="lc-top">
            <div class="lc-top-head">
                <span class="lc-cat-pill lc-cat-pill-top">${catTag(listing.category)}</span>
            </div>
        </div>
        <div class="lc-caption">${buildRawPost(listing)}</div>
        ${coverHtml}
        ${actionBar}
        </div>
    `;

    // The card itself is not a click target — the "View Listing" button in the
    // action bar is the single, explicit way into the Listing Detail page.
    card.style.cursor = 'default';

    return card;
}

// ── Completion sash geometry ──────────────────────────────────────────────
// A fixed CSS angle can never touch the corners of a card whose height varies,
// so the completion sash (SOLD / RENTED / LEASED / BOUGHT) is sized here from each
// card's REAL dimensions: it's rotated to the exact angle of the card's diagonal
// and stretched to the diagonal's length, so it runs corner-to-corner (bottom-left
// → top-right) on any card — photo or not, short or tall. Re-run on every render
// and whenever a card resizes (grid reflow, window resize, font/layout settle).
function _fitSash(sash, host) {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const angle = Math.atan2(h, w) * 180 / Math.PI;   // diagonal angle from horizontal
    sash.style.width = Math.ceil(Math.hypot(w, h)) + 'px';
    sash.style.transform = `translate(-50%, -50%) rotate(${-angle}deg)`;
}
const _sashRO = (typeof ResizeObserver !== 'undefined')
    ? new ResizeObserver(entries => {
        for (const e of entries) {
            const sash = e.target.querySelector(':scope > .sold-ribbon');
            if (sash) _fitSash(sash, e.target);
        }
    })
    : null;
function fitCompletionSashes(root) {
    (root || document).querySelectorAll('.sold-ribbon').forEach(sash => {
        const host = sash.offsetParent || sash.parentElement;   // .lc-swipe-content (the card)
        if (!host) return;
        _fitSash(sash, host);
        if (_sashRO) { try { _sashRO.observe(host); } catch (e) {} }
    });
}
// Reflow all sashes on window resize (grid column count / card width changes).
let _sashResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_sashResizeTimer);
    _sashResizeTimer = setTimeout(() => fitCompletionSashes(), 120);
});

// ── Portal post three-dot menu ────────────────────
// Pin / Dismiss (and owner management) live behind the kebab so the post face
// stays clean. Reuses the existing lc-menu open/close + toggle helpers.
function buildCardMenu(listing, { isOwner, canDismiss, isPinned }) {
    const id = listing.id;
    let items = `<div class="lc-menu-item" onclick="event.stopPropagation(); togglePinMenu('${id}', this)"><i class="fas fa-thumbtack"></i> <span>${isPinned ? 'Unpin' : 'Pin'}</span></div>`;
    if (canDismiss) {
        items += `<div class="lc-menu-item" onclick="event.stopPropagation(); closeLcMenu('${id}'); confirmDismissMatch('${id}')"><i class="fas fa-circle-xmark"></i> <span>Dismiss</span></div>`;
    }
    // Owner listing-management. Completion ("Mark as Sold/Rented/Leased/Bought")
    // lives on the dedicated bottom status button (see buildActionBar); the old
    // "In Negotiation" toggle was removed to keep the post's actions clean. The
    // kebab now carries just Pin and (for the owner) Delete.
    if (isOwner) {
        // A completed (sold/rented/etc.) post is a closed record — only Delete
        // stays available; editing is offered while the post is still live.
        if (listing.status !== 'sold') {
            items += `<div class="lc-menu-item" onclick="event.stopPropagation(); closeLcMenu('${id}'); editListing('${id}')"><i class="fas fa-pen"></i> <span>Edit</span></div>`;
        }
        items += `<div class="lc-menu-item lc-menu-danger" onclick="event.stopPropagation(); closeLcMenu('${id}'); deleteListing('${id}')"><i class="fas fa-trash"></i> <span>Delete</span></div>`;
    } else {
        // UGC safety (App Store Guideline 1.2): Report + two separate blocks.
        // Report listing / Block post (hides only this listing) / Block user
        // (blocks the whole account across the app). Undo is Settings-only.
        const uid = listing.user_id || '';
        const uname = String(listing.user_name || '').replace(/'/g, "\\'");
        items += `<div class="lc-menu-item" onclick="event.stopPropagation(); closeLcMenu('${id}'); lcReportListing('${id}')"><i class="fas fa-flag"></i> <span>Report listing</span></div>`;
        items += `<div class="lc-menu-item" onclick="event.stopPropagation(); closeLcMenu('${id}'); lcHideListing('${id}')"><i class="fas fa-eye-slash"></i> <span>Block post</span></div>`;
        items += `<div class="lc-menu-item lc-menu-danger" onclick="event.stopPropagation(); closeLcMenu('${id}'); lcBlockUser('${uid}','${uname}')"><i class="fas fa-ban"></i> <span>Block user</span></div>`;
    }
    return `<div class="lc-menu-wrap">
        <button class="lc-menu-btn" aria-label="Post options" onclick="toggleLcMenu('${id}', event)"><i class="fas fa-ellipsis-vertical"></i></button>
        <div class="lc-menu" id="lcmenu-${id}">${items}</div>
    </div>`;
}

// ── Portal UGC actions (Report / Block post / Block user) ──
function _lcFindListing(id){ try { return (allListings||[]).find(l => String(l.id) === String(id)) || null; } catch(e){ return null; } }
function lcReportListing(id){ const l=_lcFindListing(id); if(window.RMBR) RMBR.openReport({ type:'listing', contentId:id, userId:(l&&l.user_id)||null, userName:(l&&l.user_name)||null }); }
async function lcHideListing(id){ const l=_lcFindListing(id); if(!window.RMBR) return; const label=(l&&l.user_name?l.user_name+' — ':'')+String((l&&(l.location_city||l.content))||'').slice(0,60); const ok=await RMBR.blockPost('listing', id, label||null); if(ok){ if(typeof applyFilters==='function') applyFilters(); else location.reload(); } }
async function lcBlockUser(uid, uname){ if(!window.RMBR||!uid) return; const ok=await RMBR.blockUser(uid, uname||null); if(ok) location.reload(); }
// RMBR loads asynchronously; re-filter once the block lists arrive or change so
// blocked content never lingers on the first paint.
document.addEventListener('rmbr:ready',  () => { if (typeof applyFilters === 'function') applyFilters(); });
document.addEventListener('rmbr:changed', () => { if (typeof applyFilters === 'function') applyFilters(); });

// ── Portal post action bar ────────────────────────
// A clean footer. For other people's posts: a non-clickable "🔥 N Offers
// Received" label (only when there are offers) and a "View Listing" button that
// opens the Listing Detail. For the owner's own (not-yet-completed) post: exactly
// two primary buttons on one row — a dynamic status button on the LEFT (Sold /
// Rented / Leased / Bought, per the post category) and View Listing on the RIGHT.
// The status button is now the primary way the owner marks a post completed, so
// the old "Mark as Sold" kebab item was removed (see buildCardMenu).
function buildActionBar(listing, isOwner, isMatch = false) {
    const isSold = listing.status === 'sold';
    const viewBtn = `<button class="lc-view-btn" onclick="lmOpenListing('${listing.id}')">
            <i class="fas fa-arrow-up-right-from-square"></i> View Listing
        </button>`;

    // Owner's own post, not yet completed → [ STATUS ] [ VIEW LISTING ].
    if (isOwner && !isSold) {
        const statusWord = completionLabel(listing.category); // Sold / Rented / Leased / Bought
        return `<div class="lc-actionbar lc-actionbar-owner" onclick="event.stopPropagation()">
            <button class="lc-status-btn" onclick="confirmMarkSold('${listing.id}', this)">
                <i class="fas fa-check-circle"></i> ${statusWord}
            </button>
            ${viewBtn}
        </div>`;
    }

    // When this post is a genuine AI match for one of the current user's listings,
    // the primary button opens the AI Match Engine instead of the Listing Detail.
    const primaryBtn = isMatch
        ? `<button class="lc-view-btn lc-match-btn" onclick="openMatchForListing('${listing.id}')">
            ${robotWidget()} AI Match Engine
        </button>`
        : viewBtn;

    // Everyone else — and the owner once completed (the diagonal ribbon already
    // marks that state): the offers label on the left, the primary button on the right.
    const showOffers = listing.user_id && !listing.is_anonymous;
    const offers = showOffers ? (window._offerCountMap[String(listing.id)] || 0) : 0;
    const offersLabel = (offers > 0 && !isSold)
        ? `<span class="lc-offers-fire" onclick="event.stopPropagation()"><i class="fas fa-fire"></i> ${offers} Offer${offers !== 1 ? 's' : ''} Received</span>`
        : '';
    return `<div class="lc-actionbar" onclick="event.stopPropagation()">
        <div class="lc-actionbar-info">${offersLabel}</div>
        ${primaryBtn}
    </div>`;
}

// ── Market Price Ticker Algorithm ─────────────────
// KNOWN_PROJECTS moved to match-engine.js (window.RM_MATCH), aliased at top.

// Tokens that are NOT project names (bedroom/unit indicators, common words)
const NON_PROJECT_TOKENS = new Set([
    // Unit/size
    'BR','BDRM','BEDROOM','BEDROOMS','STUDIO','SQM','SQMT','SQMTR',
    // Price/transaction
    'PHP','FOR','SALE','RENT','LEASE','RFO','PSF','PSM','NEGOTIABLE',
    'BUDGET','ASKING','PRICE','ONLY','AVAILABLE','RUSH','SELLING','BUYING',
    'WILLING','OPEN','VIEWING','OFFER','OFFERS','CASH','TERMS',
    // Unit descriptors
    'UNIT','FLOOR','TOWER','BUILDING','BLOCK','LOT','CBD',
    // Locations (should not be mistaken for project names)
    'BGC','MAKATI','TAGUIG','PASIG','MANDALUYONG','ORTIGAS','MANILA',
    'ALABANG','CEBU','QC','EASTWOOD','MCKINLEY','SALCEDO','LEGAZPI',
    'BONIFACIO','GLOBAL','CITY','METRO',
    // Developers
    'ALVEO','SMDC','DMCI','AYALA','MEGAWORLD','FILINVEST','ROCKWELL',
    'CAMELLA','AVIDA','AMAIA','FEDERAL',
]);

// extractPriceRange, extractPrice, _unitToken, _UNIT_RANK, _unitRank, _smallerUnit,
// extractUnit moved to match-engine.js (window.RM_MATCH), aliased at top.

function toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// COMPANY_NAMES, COMPANY_NAME_SET, LEARNED_KEY, getLearnedProjects moved to
// match-engine.js (window.RM_MATCH), aliased at top.

function saveLearnedProject(name) {
    const list = getLearnedProjects();
    const lower = name.toLowerCase();
    const alreadyKnown = KNOWN_PROJECTS.some(p => p.toLowerCase() === lower);
    const alreadyLearned = list.some(p => p.toLowerCase() === lower);
    const isCompany = COMPANY_NAMES.some(c => lower === c);
    if (!alreadyKnown && !alreadyLearned && !isCompany && name.length >= 3) {
        list.push(name);
        localStorage.setItem(LEARNED_KEY, JSON.stringify(list));
    }
}

function allKnownProjects() {
    // Merge official list + learned list, longest-first for correct matching priority
    return [...KNOWN_PROJECTS, ...getLearnedProjects()]
        .sort((a, b) => b.length - a.length);
}

// Patterns that often precede a project name in listing text
const PROJECT_CONTEXT = /(?:project|tower|residences|suites|place|at|near|in|inside|unit\s+at|condo\s+at|property\s+at)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)/g;

const MARKET_PAIRS = {
    'FOR SALE': 'WILLING TO BUY', 'WILLING TO BUY': 'FOR SALE',
    'FOR RENT': 'WILLING TO RENT', 'WILLING TO RENT': 'FOR RENT',
    'FOR LEASE': 'WILLING TO LEASE', 'WILLING TO LEASE': 'FOR LEASE'
};
const MARKET_SEGMENTS = {
    ownership: ['FOR SALE', 'WILLING TO BUY'],
    rental: ['FOR RENT', 'WILLING TO RENT'],
    lease: ['FOR LEASE', 'WILLING TO LEASE']
};

function getSegment(cat) {
    for (const [seg, cats] of Object.entries(MARKET_SEGMENTS)) {
        if (cats.includes(cat)) return seg;
    }
    return null;
}

function computeSentiment(supply, demand) {
    if (demand.length > supply.length * 1.5) return 'Strong Buy';
    if (demand.length > supply.length) return 'Buy';
    if (supply.length > demand.length * 1.5) return 'Strong Sell';
    if (supply.length > demand.length) return 'Sell';
    return 'Neutral';
}

function buildMarketPrices(listings) {
    const buckets = {};

    listings.forEach(l => {
        const text = l.content || '';
        // Phase 1 structured-first: prefer structured columns, else parse content.
        const price = (l.price != null && l.price !== '') ? Number(l.price) : extractPrice(text);
        const unit  = (l.unit_type != null && String(l.unit_type).trim() !== '') ? String(l.unit_type) : extractUnit(text);
        const proj  = (l.project != null && String(l.project).trim() !== '') ? String(l.project) : extractProject(text);
        if (!price || !unit || !proj) return;
        if (COMPANY_NAMES.some(c => proj.toLowerCase() === c)) return;

        const cat = l.category || '';
        const segment = getSegment(cat);
        if (!segment) return;

        const isSupply = cat.startsWith('FOR');
        const key = `${proj.toLowerCase()}||${unit.toLowerCase()}||${segment}`;
        if (!buckets[key]) buckets[key] = { proj, unit, segment, supplyPrices: [], demandPrices: [], allPrices: [] };
        buckets[key].allPrices.push(price);
        if (isSupply) buckets[key].supplyPrices.push(price);
        else buckets[key].demandPrices.push(price);
    });

    return Object.values(buckets)
        .map(b => {
            const avg = b.allPrices.reduce((s, p) => s + p, 0) / b.allPrices.length;
            const min = Math.min(...b.allPrices);
            const max = Math.max(...b.allPrices);
            const supplyAvg = b.supplyPrices.length ? b.supplyPrices.reduce((s, p) => s + p, 0) / b.supplyPrices.length : null;
            const demandAvg = b.demandPrices.length ? b.demandPrices.reduce((s, p) => s + p, 0) / b.demandPrices.length : null;
            const sentiment = computeSentiment(b.supplyPrices, b.demandPrices);
            const segLabel = b.segment === 'ownership' ? '' : b.segment === 'rental' ? ' Rent' : ' Lease';
            return { ...b, avg, min, max, supplyAvg, demandAvg, sentiment, segLabel, count: b.allPrices.length };
        })
        .sort((a, b) => a.proj.localeCompare(b.proj) || a.segment.localeCompare(b.segment));
}

window._marketPrices = [];

function formatPrice(n) {
    if (n >= 1_000_000) return '₱' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return '₱' + (n / 1_000).toFixed(0) + 'K';
    return '₱' + n.toFixed(0);
}

function buildTicker(listings) {
    const items = buildMarketPrices(listings);
    window._marketPrices = items;
    const el = document.getElementById('tickerContent');
    if (!el) return;

    if (!items.length) {
        el.innerHTML = `<span class="ticker-loading">No market data yet — post listings to build the price index</span>`;
        el.style.animation = 'none';
        return;
    }

    // Build ticker HTML (doubled for seamless loop)
    function renderItems() {
        return items.map(item => {
            const spread = item.count > 1 && item.max > item.min
                ? `<span class="count">${formatPrice(item.min)} – ${formatPrice(item.max)}</span>`
                : '';
            const key = encodeURIComponent(`${item.proj}||${item.unit}||${item.segment}`);
            return `
                <div class="ticker-item" onclick="location.href='market-summary.html?key=${key}'" style="cursor:pointer;">
                    <span class="proj">${item.proj.toUpperCase()}${item.segLabel ? `<span style="font-size:9px;color:#64748b;font-weight:600;margin-left:4px;">${item.segLabel.toUpperCase()}</span>` : ''}</span>
                    <span class="unit">${item.unit}</span>
                    <span class="price">${formatPrice(item.avg)}</span>
                    ${spread}
                </div>
                <span class="ticker-separator">·</span>
            `;
        }).join('');
    }

    // Duplicate content so the scroll loops seamlessly
    el.innerHTML = renderItems() + renderItems();

    // Adjust speed based on content length (more items = faster)
    const duration = Math.max(20, items.length * 8);
    el.style.animationDuration = duration + 's';
}

// ── State ─────────────────────────────────────────
let allListings = [];
// false until loadLedger() has actually fetched the listings. applyFilters()
// runs before that on a fresh load (returning from a listing detail RELOADS the
// page — the realtime socket blocks bfcache), so we must show "Loading…" then,
// NOT the "No listings found" empty state (which flashed for ~1s).
let _listingsLoaded = false;
let myListings = [];
let activeCategory = 'ALL';
let activeSegTab = 'MARKET';
let marketCat = 'ALL';
let myListingsSubCat = 'ALL';

function selectSegTab(btn) {
    document.querySelectorAll('.seg-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeSegTab = btn.dataset.seg;
    // Remember the chosen tab so a refresh / clicking "Portal" reopens it
    // (restorePortalTab reads this on load). Scroll always resets to the top.
    try { localStorage.setItem('rm_portal_tab', activeSegTab); } catch (e) {}

    const feedPane = document.getElementById('feedTabPane');
    const listPane = document.getElementById('listingsTabPane');
    const catFilters = document.getElementById('marketCatFilters');
    const portfolioFilters = document.getElementById('portfolioSubfilter');

    catFilters.style.display = activeSegTab === 'MARKET' ? 'flex' : 'none';
    portfolioFilters.style.display = activeSegTab === 'PORTFOLIO' ? 'flex' : 'none';

    const ticker = document.getElementById('tickerWrap');
    const showTicker = (activeSegTab === 'FEED' || activeSegTab === 'MARKET') && (typeof isFeatureEnabled === 'function' ? isFeatureEnabled('marketTicker') : false);
    if (ticker) ticker.style.display = showTicker ? '' : 'none';
    document.querySelector('.listings-grid')?.classList.toggle('no-ticker', !showTicker);

    if (activeSegTab === 'FEED') {
        feedPane.style.display = '';
        listPane.style.display = 'none';
    } else {
        feedPane.style.display = 'none';
        listPane.style.display = '';
        if (activeSegTab === 'PORTFOLIO') activeCategory = 'MY_LISTINGS';
        else if (activeSegTab === 'AI_ENGINE') activeCategory = 'MATCHES';
        else if (activeSegTab === 'MARKET') activeCategory = marketCat;
        applyFilters();
        // Opening the Matches tab IS "checking the matches" — mark every match
        // now on screen as seen so the Portal/Matches red badges clear. Only
        // here (and openMatchForListing/showAllMatches); never on Portal load or
        // the Market/Portfolio tabs, so those don't clear an unseen match.
        if (activeSegTab === 'AI_ENGINE') {
            try {
                // Clear both what's rendered now (buildMatchMap) AND anything the
                // global alert already counts as unseen (e.g. a match that arrived
                // via realtime before this client's allListings refreshed) — being
                // on the Matches surface counts as checking them.
                const ids = [...buildMatchMap().keys()].map(String)
                    .concat(window.RMMatchAlert?.getUnseen?.() || []);
                window.RMMatchAlert?.markSeen(ids);
            } catch (e) {}
        }
    }
    // Force reflow so ticker show/hide is measured correctly
    document.querySelector('.top-fixed-wrap')?.offsetHeight;

    const scrollToTop = () => {
        syncTopPadding();
        const mc = document.querySelector('.main-content');
        if (mc) mc.scrollTop = 0;
        window.scrollTo(0, 0);
    };
    syncTopPadding();
    requestAnimationFrame(scrollToTop);
    setTimeout(scrollToTop, 150);
    setTimeout(syncTopPadding, 400);
    setTimeout(syncTopPadding, 800);
}

// The committed search term the Portal is actually filtering by. Empty = no
// search. Only executeSearch() changes this; typing does not.
let activeSearchQuery = '';

// Fires on every keystroke (oninput). Typing must NOT navigate, filter, or change
// the current Portal view — it only refreshes the suggestion dropdown. The search
// runs solely on Enter or when a suggestion is clicked (executeSearch).
function onSearchInput() {
    const q = (document.getElementById('searchInput')?.value || '').trim();
    renderPortalSuggest(q);
}

// Commit the typed text as the active search and update the Portal to show the
// matching results. Called on Enter and on suggestion clicks — never while typing.
function executeSearch() {
    const raw = (document.getElementById('searchInput')?.value || '').trim();
    activeSearchQuery = raw.toLowerCase();
    closePortalSuggest();
    // Feed is a hidden/reserved tab; if somehow active, land the results in the
    // Live Market list. selectSegTab() re-runs applyFilters with the term already
    // committed above, so the switch alone shows the results.
    if (activeSearchQuery && activeSegTab === 'FEED') {
        const marketTab = document.querySelector('.seg-tab[data-seg="MARKET"]');
        if (marketTab) { selectSegTab(marketTab); return; }
    }
    // Behavioural intelligence (dormant unless enabled): search executed.
    if (activeSearchQuery) { try { window.RMTrack && RMTrack.emit('search', { query: activeSearchQuery }); } catch(e){} }
    applyFilters();
}

// Multi-term match across a listing's content, category, and (non-anon) agent.
// All whitespace-separated terms must appear, so "for sale bgc" matches a
// FOR SALE listing whose content mentions BGC.
function listingMatchesQuery(l, q) {
    const hay = ((l.content || '') + ' ' + (l.category || '') + ' ' +
        (l.is_anonymous ? '' : (l.user_name || ''))).toLowerCase();
    return (q || '').toLowerCase().trim().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

// ── Portal search suggestions (people + posts, Portal-scoped) ───────────────
function renderPortalSuggest(q) {
    const box = document.getElementById('portalSuggest');
    if (!box) return;
    q = (q || '').toLowerCase().trim();
    if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }

    const localUser = JSON.parse(localStorage.getItem('user') || 'null');

    const tokens = q.split(/\s+/).filter(Boolean);

    // People — unique non-anonymous agents who have listings, matched by name/job
    const peopleMap = new Map();
    allListings.forEach(l => {
        if (l.is_anonymous || !l.user_id) return;
        const name = l.user_name || '';
        const job = l.user_job || '';
        const hay = (name + ' ' + job).toLowerCase();
        if (!tokens.every(t => hay.includes(t))) return;
        if (!peopleMap.has(l.user_id)) {
            peopleMap.set(l.user_id, { id: l.user_id, name, job, img: l.user_img || '' });
        }
    });
    const people = [...peopleMap.values()].slice(0, 4);

    // Posts — listings matched across content + category + agent (all terms must match)
    const posts = allListings
        .filter(l => listingMatchesQuery(l, q))
        .slice(0, 6);

    window.__portalSuggest = { people, posts };

    if (!people.length && !posts.length) {
        box.innerHTML = `<div class="ps-empty">No people or posts match “${escapeHtmlSafe(q)}”.</div>`;
        box.classList.add('open');
        return;
    }

    let html = '';
    if (people.length) {
        html += `<div class="ps-section">People</div>`;
        people.forEach((p, i) => {
            const img = p.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || '?')}&background=0f172a&color=32cd32`;
            html += `<div class="ps-item" onclick="portalSuggestPerson(${i})">
                <img class="ps-avatar" src="${img}" onerror="this.src='https://ui-avatars.com/api/?name=?&background=0f172a&color=32cd32'">
                <div class="ps-info"><div class="ps-name">${escapeHtmlSafe(p.name || 'Member')}</div>${p.job ? `<div class="ps-sub">${escapeHtmlSafe(p.job)}</div>` : ''}</div>
                <span class="ps-tag">People</span>
            </div>`;
        });
    }
    if (posts.length) {
        html += `<div class="ps-section">Posts</div>`;
        posts.forEach((l, i) => {
            const cat = l.category || '';
            const snippet = (l.content || '').replace(/\s+/g, ' ').trim().slice(0, 64);
            html += `<div class="ps-item" onclick="portalSuggestPost(${i})">
                <span class="ps-post-icon"><i class="fas fa-store"></i></span>
                <div class="ps-info"><div class="ps-name">${escapeHtmlSafe(snippet)}${(l.content || '').length > 64 ? '…' : ''}</div><div class="ps-sub">${escapeHtmlSafe((l.user_name && !l.is_anonymous) ? l.user_name : 'Anonymous')}</div></div>
                <span class="ps-tag ps-tag-post">${escapeHtmlSafe(cat)}</span>
            </div>`;
        });
    }
    box.innerHTML = html;
    box.classList.add('open');
}

// Clicking a suggested PERSON routes straight to that person's Profile — never a
// general search. (Own name → own profile; anyone else → their profile page.)
function portalSuggestPerson(i) {
    const p = (window.__portalSuggest?.people || [])[i];
    if (!p || !p.id) return;
    closePortalSuggest();
    const me = JSON.parse(localStorage.getItem('user') || 'null');
    location.href = (me && String(me.id) === String(p.id))
        ? 'dashboard.html'
        : 'dashboard.html?user_id=' + encodeURIComponent(p.id);
}

// Clicking a suggested POST routes straight to that specific Listing's detail page
// — never a general search of the Portal grid.
function portalSuggestPost(i) {
    const l = (window.__portalSuggest?.posts || [])[i];
    if (!l || l.id == null) return;
    closePortalSuggest();
    lmOpenListing(l.id);
}

function closePortalSuggest() {
    const box = document.getElementById('portalSuggest');
    if (box) { box.classList.remove('open'); }
}

function escapeHtmlSafe(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) closePortalSuggest();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePortalSuggest(); });

function selectMarketCat(btn) {
    document.querySelectorAll('#marketCatFilters .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    marketCat = btn.dataset.cat;
    activeCategory = marketCat;
    applyFilters();
    setTimeout(syncTopPadding, 50);
}

function selectCat(btn) {
    selectSegTab(btn);
}

function selectSubCat(btn) {
    document.querySelectorAll('.chip-sub').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    myListingsSubCat = btn.dataset.sub;
    applyFilters();
}

// ── Smart AI Matching Engine ─────────────────────

// LOCATION_KEYWORDS, LOCATION_ZONES, ADJACENT_ZONES, getLocationZone,
// locationProximity, FEATURE_KEYWORDS, extractLocations moved to match-engine.js
// (window.RM_MATCH), aliased at top.

// Best single location string for a highlight — uses the shared engine's
// intelligence (most specific sub-locality + city, first city on ambiguity).
// Falls back to joining the raw extracted tags.
function displayLocations(text) {
    if (typeof window !== 'undefined' && window.RM_LOC) {
        return window.RM_LOC.displayLocation(text || '');
    }
    const locs = extractLocations(text || '');
    return locs.length ? locs.join(', ') : '';
}

// levenshtein moved to match-engine.js (window.RM_MATCH), aliased at top.

// fuzzyMatchProject, extractProjectFull, extractProject, extractFeatures,
// extractBudgetRange, _bedTokensForMatch, _bedTokensSubject, unitTypesForMatch,
// parseListing, computeMatchScore moved to match-engine.js (RM_MATCH), aliased at top.

// Build a map: other listing id → which of my listings it matches (used for the
// AI-match banner/label on cards that match one of the viewer's own listings).
// Objective per-listing match count (listing id → number of AI matches it has),
// computed for EVERY listing so the "N AI Matches Found" figure is shown to all
// users, not just the owner. Not filtered by the viewer's dismissed set — it's a
// consistent, listing-intrinsic number for everyone.
// A listing is "completed" once its owner marks it Sold / Bought / Rented /
// Leased. In the DB every one of those writes status='sold' (only the DISPLAYED
// word changes with the post category), but we accept all four plus a generic
// 'completed' so the rule holds no matter what value a future status writes. A
// completed listing stays VISIBLE with its ribbon for 24h, but it can NEVER be
// matched: it is excluded from the AI-match pool, from every match count, and
// from every match view — active listings only. (Core rule: Active → matchable,
// Sold/Bought/Rented/Leased → not matchable.)
const RM_COMPLETED_STATUSES = new Set(['sold', 'bought', 'rented', 'leased', 'completed']);
function isCompletedListing(l) {
    return !!l && RM_COMPLETED_STATUSES.has(String(l.status || '').toLowerCase());
}
function isMatchableListing(l) { return !isCompletedListing(l); }

let matchCountMap = new Map();
function buildMatchMap() {
    const map = new Map();
    matchCountMap = new Map();

    // Completed listings are filtered out of BOTH sides here, so they neither
    // generate matches (as one of mine) nor appear/count as a match (as another's).
    const parsedMine = myListings.filter(isMatchableListing).map(parseListing);
    const parsedAll = allListings.filter(isMatchableListing).map(parseListing);
    const dismissed = getDismissedMatches();

    // ── General match count for every listing ──
    // Bucket by category so each listing only compares against its partner set
    // (computeMatchScore also early-returns on non-complementary categories).
    const byCategory = new Map();
    parsedAll.forEach(p => {
        const arr = byCategory.get(p.category);
        if (arr) arr.push(p); else byCategory.set(p.category, [p]);
    });
    parsedAll.forEach(L => {
        let count = 0;
        const candidates = byCategory.get(PARTNER_MAP[L.category]) || [];
        candidates.forEach(O => {
            if (O.userId === L.userId) return;
            if (computeMatchScore(L, O).score >= 10) count++;
        });
        matchCountMap.set(String(L.raw.id), count);
    });

    parsedMine.forEach(mine => {
        parsedAll.forEach(other => {
            if (other.userId === mine.userId) return;
            if (dismissed.has(String(other.id))) return; // user dismissed this match
            const { score, reasons } = computeMatchScore(mine, other);
            if (score < 10) return;

            const existing = map.get(other.id);
            if (!existing || existing.matchScore < score) {
                map.set(other.id, {
                    myCategory: mine.raw.category,
                    myContent: mine.raw.content,
                    myListing: mine.raw,
                    matchScore: score,
                    matchReasons: reasons
                });
            }
        });
    });

    return map;
}

// Fill the location dropdown with the WHOLE Philippines, grouped by region
// (via the shared location engine), so a user can filter by any location — not
// only the ones a current listing happens to mention. The encoded option values
// ("region:NCR", "prov:Cavite", "city:Makati") drive hierarchy-aware filtering
// in applyFilters (pick a region/province → every listing in it matches).
// Preserves the user's current choice. Falls back to the legacy pool-derived
// list when the engine isn't loaded. Called once after listings load.
function populateLocationFilter() {
    const sel = document.getElementById('locationInput');
    if (!sel) return;
    const prev = sel.value;
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    if (window.RM_LOC && window.RM_LOC.filterOptions) {
        const groups = window.RM_LOC.filterOptions();
        sel.innerHTML = '<option value="">All Locations</option>' +
            groups.map(g => `<optgroup label="${esc(g.label)}">` +
                g.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('') +
                '</optgroup>').join('');
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
        return;
    }

    // Legacy fallback — distinct locations actually present in the pool.
    const set = new Set();
    (allListings || []).forEach(l => {
        extractLocations(l.content || '').forEach(loc => { if (loc && loc.trim()) set.add(loc.trim()); });
    });
    const locs = [...set].sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">All Locations</option>' +
        locs.map(l => `<option value="${esc(l.toLowerCase())}">${esc(l)}</option>`).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function applyLocationFilter() {
    const sel = document.getElementById('locationInput');
    const btn = document.getElementById('locationOkBtn');
    const wrap = sel?.closest('.location-wrap');
    const hasFilter = sel?.value !== '';
    if (btn)  btn.classList.toggle('applied', hasFilter);
    if (wrap) wrap.classList.toggle('active', hasFilter);
    // Behavioural intelligence (dormant unless enabled): location filter applied.
    if (hasFilter) { try { window.RMTrack && RMTrack.emit('filter', { filters: { location: sel.value } }); } catch(e){} }
    applyFilters();
}

function applyFilters() {
    // The Portal filters by the COMMITTED search term (set on Enter / suggestion
    // click), never the live input — so typing updates suggestions without
    // changing what the Portal shows. See onSearchInput / executeSearch.
    const q    = activeSearchQuery;
    const loc  = (document.getElementById('locationInput')?.value || '').trim();
    const grid = document.getElementById('listingsGrid');
    if (!grid) return;

    const matchMap = buildMatchMap();
    const localUser = JSON.parse(localStorage.getItem('user'));

    let pool;
    const myUserId = myListings[0]?.user_id;
    const othersOnly = l => !myUserId || l.user_id !== myUserId;

    if (activeCategory === 'MATCHES') {
        pool = allListings.filter(l => othersOnly(l) && matchMap.has(l.id));
    } else if (activeCategory === 'MY_LISTINGS') {
        pool = allListings.filter(l => localUser && l.user_name === localUser.name);
        if (myListingsSubCat === 'PINNED') {
            const pins = getPinnedIds();
            pool = pool.filter(l => pins.includes(String(l.id)));
        } else if (myListingsSubCat !== 'ALL') {
            pool = pool.filter(l => l.category === myListingsSubCat);
        }
    } else if (activeCategory === 'PINNED') {
        const pins = getPinnedIds();
        pool = allListings.filter(l => pins.includes(String(l.id)));
    } else if (activeCategory === 'ALL') {
        pool = [...allListings];
    } else {
        pool = allListings.filter(l => l.category === activeCategory);
    }

    // Hide posts the user has dismissed (except on My Listings — you can't dismiss your own)
    if (activeCategory !== 'MY_LISTINGS') {
        const dismissedSet = getDismissedMatches();
        if (dismissedSet.size) pool = pool.filter(l => !dismissedSet.has(String(l.id)));
    }

    // UGC safety (App Store Guideline 1.2): hide listings from whole-account
    // blocks (Block user) and individually blocked listings (Block post).
    if (window.RMBR) pool = pool.filter(l => !(RMBR.isBlocked(l.user_id, l.user_name) || RMBR.isPostBlocked('listing', l.id)));

    if (q)   pool = pool.filter(l => listingMatchesQuery(l, q));
    // Location filter. With the shared engine the dropdown value is level-encoded
    // ("region:NCR" / "prov:Cavite" / "city:Makati") and matching is hierarchy-
    // aware — a region/province matches every listing within it. Without the
    // engine, fall back to the legacy exact-tag (lowercased) comparison.
    if (loc) {
        if (window.RM_LOC && window.RM_LOC.matchesFilter) {
            pool = pool.filter(l => window.RM_LOC.matchesFilter(((l.location_city || l.location_area) ? [l.location_area, l.location_city].filter(Boolean).join(', ') : (l.content || '')), loc));
        } else {
            const locLower = loc.toLowerCase();
            pool = pool.filter(l => extractLocations((l.location_city || l.location_area) ? [l.location_area, l.location_city].filter(Boolean).join(' ') : (l.content || '')).some(x => x.toLowerCase() === locLower));
        }
    }

    grid.innerHTML = '';
    if (!pool.length) {
        // Still fetching (e.g. a fresh reload after returning from a listing
        // detail — the realtime socket blocks bfcache, so Back RELOADS this
        // page)? Show the loading spinner, never "No listings found": there's no
        // data to filter yet, so any empty result here just means "not loaded".
        // The empty state below is only truthful once the listings have loaded.
        if (!_listingsLoaded) {
            grid.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading listings…</p></div>`;
            return;
        }
        const msg = activeCategory === 'MATCHES'
            ? 'No matches for your listings yet.<br><small>Post a listing on your profile and the AI will find partner listings here.</small>'
            : 'No listings found.<br><small>Try a different filter or search term.</small>';
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-satellite-dish"></i><p>${msg}</p></div>`;
        return;
    }

    // Pre-compute FMV for all FOR SALE listings
    const fmvMap = new Map();
    try {
        const forSaleListings = allListings.filter(l => l.category === 'FOR SALE');
        pool.forEach(l => {
            if (l.category === 'FOR SALE') {
                const result = calculateFMV(l, forSaleListings);
                if (result) fmvMap.set(l.id, result);
            }
        });
    } catch(e) { console.warn('FMV error:', e); }

    // MATCHES tab: sort by score; all other tabs: newest first
    if (activeCategory === 'MATCHES') {
        pool.sort((a, b) => (matchMap.get(b.id)?.matchScore || 0) - (matchMap.get(a.id)?.matchScore || 0));
    } else {
        pool.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    pool.forEach(l => grid.appendChild(
        buildListingCard(l, matchMap.get(l.id) || null, fmvMap.get(l.id) || null, matchCountMap.get(String(l.id)) || 0)
    ));
    // Size any completion sashes to their cards' real diagonals (corner-to-corner).
    requestAnimationFrame(() => fitCompletionSashes(grid));
}

function selectCatByName(catName) {
    const chip = document.querySelector(`.chip[data-cat="${catName}"]`);
    if (chip) selectCat(chip);
}

// ── Your Listing collapse/expand ──────────────────
function toggleYourListing() {
    const body = document.getElementById('yourListingBody');
    const arrow = document.getElementById('yourListingArrow');
    if (!body || !arrow) return;
    body.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

function applyAutoMinimize() {
    const body = document.getElementById('yourListingBody');
    const arrow = document.getElementById('yourListingArrow');
    if (!body || !arrow) return;
    if (localStorage.getItem('rm_auto_open_listing') === '1') {
        body.classList.remove('collapsed');
        arrow.classList.remove('collapsed');
    } else {
        body.classList.add('collapsed');
        arrow.classList.add('collapsed');
    }
}

// ── Load ledger ───────────────────────────────────
// Overlays each listing's stored user_name/user_img/user_job (a snapshot
// taken when the listing was posted) with the poster's LIVE profile data,
// looked up by user_id — so when someone updates their name, profile
// picture, OR position (position is now admin-assigned only, from the
// Users page in admin.html) it shows on all their existing listings.
// Anonymous posts keep their alias. Accepts any number of listing arrays
// and mutates the rows in place with a single fetch.
async function _resolveLiveAuthors(...arrays) {
    const rows = arrays.flat().filter(Boolean);
    const live = rows.filter(r => r && !r.is_anonymous && r.user_id);
    const uids = [...new Set(live.map(r => r.user_id))];
    if (!uids.length) return;
    try {
        const { data } = await _sb.from('profiles').select('id,full_name,avatar_url,job_title').in('id', uids);
        const byId = {};
        (data || []).forEach(p => { byId[p.id] = p; });
        live.forEach(r => {
            const p = byId[r.user_id];
            if (!p) return;
            if (p.full_name)  r.user_name = p.full_name;
            if (p.avatar_url) r.user_img  = p.avatar_url;
            // Unconditional (not `if (p.job_title)`) — a live position that's
            // no longer valid (admin cleared it, or it's legacy free text)
            // must clear a listing's stale user_job snapshot too, not leave
            // the old value standing because the live value "wasn't truthy".
            r.user_job = lmValidPosition(p.job_title);
        });
    } catch (e) { console.warn('[LiveAuthors] resolve failed', e); }
}

async function loadLedger(silent) {
    const grid = document.getElementById('listingsGrid');
    if (!silent) grid.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading listings…</p></div>`;

    const localUser = JSON.parse(localStorage.getItem('user'));

    const [{ data, error }, { data: mine }] = await Promise.all([
        _sb.from('listings').select('*').eq('archived', false)
            .order('created_at', { ascending: false }),
        localUser
            ? _sb.from('listings').select('*').eq('archived', false).eq('user_id', (await _sb.auth.getUser()).data?.user?.id || '__none__')
            : Promise.resolve({ data: [] }),
        typeof loadMatesCache === 'function' ? loadMatesCache() : Promise.resolve(),
        preloadOfferCounts()
    ]);

    if (error || !data) {
        if (!silent) grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load listings</p></div>`;
        return;
    }

    // Overlay each listing's stored author snapshot with the poster's LIVE
    // profile (name + avatar), so renames / new profile pictures show up on
    // their existing posts immediately.
    await _resolveLiveAuthors(data, mine);

    // ── Visibility Controls: filter listings this viewer isn't allowed to
    // discover (hidden from their specific account). The owner always sees their
    // own posts, and matching runs on this same set — so a hidden viewer's client
    // never renders, matches against, or links to the listing, while the owner's
    // client (which never filters its own posts) keeps every match & analytic.
    if (window.RMVisibility) {
        try {
            const myId = (await _sb.auth.getUser()).data?.user?.id || null;
            const unlockedOwners = await RMVisibility.fetchUnlockedOwnerIds(_sb, myId);
            allListings = data.filter(l => RMVisibility.visibleToViewer(l, myId, unlockedOwners));
        } catch (e) {
            console.warn('[Visibility] filter failed, showing all:', e);
            allListings = data;
        }
    } else {
        allListings = data;
    }
    myListings = mine || [];
    _listingsLoaded = true;   // fetch done → applyFilters may now show empty state

    // Sold listings past their 24h window are removed everywhere (and finalized
    // in the DB where this client has permission) before anything renders.
    await sweepExpiredSoldListings();

    buildTicker(allListings);

    const learned = getLearnedProjects();
    if (learned.length) console.log('[Realmate] Auto-detected projects:', learned);

    populateLocationFilter();
    applyFilters();
    startSoldCountdowns();

    // Report the full current AI-match set to the global alert system so the
    // Portal/Matches red badges reflect it on EVERY page. This does NOT mark
    // anything seen (opening the Portal must not clear a badge) and does NOT
    // fire the banner (that's reserved for genuine realtime arrivals) — it just
    // records which listings currently match one of mine, keyed by listing id.
    try { window.RMMatchAlert?.recordMatches([...buildMatchMap().keys()].map(String)); } catch (e) {}
}

// ── AI Match view ─────────────────────────────────
function exitMatchView() {
    localStorage.removeItem('matchQuery');
    localStorage.removeItem('matchResults');
    sessionStorage.removeItem('rm_matchCtx');
    document.getElementById('matchView').style.display = 'none';
    document.getElementById('ledgerView').style.display = '';
    const fb = document.querySelector('.filter-bar');
    if (fb) fb.style.display = '';
    const topWrap = document.querySelector('.top-fixed-wrap');
    if (topWrap) topWrap.style.display = '';
    syncTopPadding();
    // The ledger's cards were only HIDDEN while the match view was up (not
    // destroyed), so return to the EXACT post the engine was opened from WITHOUT
    // re-fetching (a silent loadLedger re-rendered the grid and, on any data shift,
    // dropped the user on a different post). Scroll to the saved return card
    // (the opened post) directly — more reliable than the top-visible-card snapshot,
    // which returned "near" but not the actual post. Retry while layout settles.
    var _rid = window._matchReturnCardId;
    var _backOK = false;
    if (_rid) {
        var _back = function () {
            var el = document.getElementById(_rid);
            if (el) { el.scrollIntoView({ behavior: 'auto', block: 'center' }); return true; }
            return false;
        };
        _backOK = _back();
        requestAnimationFrame(_back);
        setTimeout(_back, 120); setTimeout(_back, 350); setTimeout(_back, 700);
    }
    if (!_backOK) { try { restorePortalScroll(); } catch (e) {} }
    else { try { sessionStorage.removeItem(RM_SCROLL_KEY); } catch (e) {} }
    window._matchReturnCardId = null;
}

// Subtle "AI Matches activated" chime — a short two-note ascending blip
// synthesized via Web Audio (no asset). Played when the user opens the AI
// Matches counter or the AI Match Engine (a genuine click/tap), giving quiet
// feedback that the interaction fired. Never during scrolling or mere display.
// One shared AudioContext, resumed lazily; entirely best-effort.
var _aimActx = null;
function playMatchSound() {
    try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!_aimActx) _aimActx = new AC();
        if (_aimActx.state === 'suspended') _aimActx.resume();
        var t = _aimActx.currentTime;
        var g = _aimActx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); // gentle
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        g.connect(_aimActx.destination);
        var o = _aimActx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(523, t);         // C5
        o.frequency.setValueAtTime(784, t + 0.09);  // → G5, a small ascending "activated" lift
        o.connect(g);
        o.start(t); o.stop(t + 0.3);
    } catch (e) { /* audio is best-effort; never disrupt the interaction */ }
}

function openMatchForListing(otherListingId) {
    const other = allListings.find(l => String(l.id) === String(otherListingId));
    if (!other) return;
    playMatchSound();   // AI Match Engine opened on a matching post
    if (isCompletedListing(other)) return;   // completed → not matchable
    const parsedOther = parseListing(other);
    // Find the specific (still-active) myListing that actually scores against this card
    const myMatch = (typeof myListings !== 'undefined' ? myListings : []).find(l => {
        if (isCompletedListing(l)) return false;
        const { score } = computeMatchScore(parseListing(l), parsedOther);
        return score > 0;
    });
    if (!myMatch) return;
    // Opening a specific match's detail view = checking it → clear its badge.
    try { window.RMMatchAlert?.markSeen(String(otherListingId)); } catch (e) {}
    showAllMatches(myMatch.id, otherListingId);
}

function _dismissKey() {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u?.id ? `dismissed_matches_${u.id}` : 'dismissed_matches_anon';
}

function getDismissedMatches() {
    try { return new Set(JSON.parse(localStorage.getItem(_dismissKey()) || '[]').map(String)); }
    catch { return new Set(); }
}

function confirmDismissMatch(listingId) {
    // Show bottom-sheet confirmation
    let overlay = document.getElementById('dismissMatchOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dismissMatchOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
        overlay.innerHTML = `
            <div id="dismissMatchSheet" style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;box-shadow:0 -4px 30px rgba(0,0,0,0.15);">
                <div style="width:40px;height:4px;background:#e2e8f0;border-radius:4px;margin:0 auto 20px;"></div>
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#fff5f5;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                        <i class="fas fa-times" style="color:#ef4444;font-size:20px;"></i>
                    </div>
                    <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:6px;">Dismiss this post?</div>
                    <div style="font-size:13px;color:#64748b;line-height:1.5;">This post will be hidden from your feed and Matches. <strong>This cannot be undone.</strong></div>
                </div>
                <button id="dismissMatchConfirmBtn" style="width:100%;height:44px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;">Yes, Dismiss</button>
                <button onclick="document.getElementById('dismissMatchOverlay').remove();" style="width:100%;height:44px;border-radius:12px;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }
    document.getElementById('dismissMatchConfirmBtn').onclick = () => {
        overlay.remove();
        dismissMatch(listingId);
    };
}

function dismissMatch(listingId) {
    const dismissed = getDismissedMatches();
    dismissed.add(String(listingId));
    localStorage.setItem(_dismissKey(), JSON.stringify([...dismissed]));
    // Slide the card out of the AI Match view (now a full Live Market card) and
    // refresh the match count / empty state.
    const mvCard = document.querySelector(`#matchesContainer #lc-${listingId}`)
                || document.querySelector(`.match-card[data-listing-id="${listingId}"]`);
    if (mvCard) {
        mvCard.style.transition = 'opacity 0.25s, transform 0.25s';
        mvCard.style.opacity = '0';
        mvCard.style.transform = 'translateX(40px)';
        setTimeout(() => {
            mvCard.remove();
            const container = document.getElementById('matchesContainer');
            const remaining = container ? container.querySelectorAll('.listing-card, .match-card').length : 0;
            const badge = document.getElementById('matchCountBadge');
            if (badge) badge.textContent = `${remaining} match${remaining !== 1 ? 'es' : ''}`;
            if (!remaining && container) {
                container.innerHTML = `
                    <div class="no-matches">
                        <i class="fas fa-satellite-dish"></i>
                        <h3>No Matches Yet</h3>
                        <p>The AI Engine will alert you when a partner listing enters the market.</p>
                    </div>`;
            }
        }, 260);
    }
    // Re-render the market grid so the dismissed post disappears from the feed too
    if (typeof applyFilters === 'function' && document.getElementById('listingsGrid')) applyFilters();
}

function showAllMatches(listingId, scrollToId) {
    const myListing = myListings.find(l => String(l.id) === String(listingId));
    // Stale/unresolvable context (listing gone or not one of mine): drop it so it
    // can't keep hijacking future loads, and just stay on the current view.
    if (!myListing) { sessionStorage.removeItem('rm_matchCtx'); return; }
    // A completed listing can no longer be matched — never open its match view.
    if (isCompletedListing(myListing)) { sessionStorage.removeItem('rm_matchCtx'); return; }
    playMatchSound();   // AI Matches counter opened on the user's own post
    // Remember the match context so returning to this page (e.g. after opening a
    // listing's detail and pressing Back) restores the match view, not the ledger.
    sessionStorage.setItem('rm_matchCtx', JSON.stringify({
        listingId: String(listingId),
        scrollToId: scrollToId != null ? String(scrollToId) : null
    }));
    const partnerCat = PARTNER_MAP[myListing.category];
    if (!partnerCat) { sessionStorage.removeItem('rm_matchCtx'); return; }
    const parsedMine = parseListing(myListing);
    const dismissed = getDismissedMatches();
    const matches = allListings.filter(other => {
        if (other.user_id === myListing.user_id) return false;
        if (isCompletedListing(other)) return false;   // completed → not matchable
        if (dismissed.has(String(other.id))) return false;
        const { score } = computeMatchScore(parsedMine, parseListing(other));
        return score > 0;
    }).sort((a, b) => {
        const sa = computeMatchScore(parsedMine, parseListing(a)).score;
        const sb = computeMatchScore(parsedMine, parseListing(b)).score;
        return sb - sa;
    });
    // Viewing a listing's AI Match Engine list = checking those matches → clear
    // their badges (this listing's matches, threshold-consistent with the badge).
    try {
        const seenIds = matches
            .filter(o => computeMatchScore(parsedMine, parseListing(o)).score >= 10)
            .map(o => String(o.id));
        if (seenIds.length) window.RMMatchAlert?.markSeen(seenIds);
    } catch (e) {}
    // Remember the EXACT ledger card to return to on Back: the post the engine was
    // opened from — the matched other-post (scrollToId), or the user's own listing
    // when opened from the "AI Matches Found" button. Snapshot scroll too, as a
    // fallback. Both consumed by exitMatchView() (#2).
    window._matchReturnCardId = 'lc-' + (scrollToId != null ? scrollToId : listingId);
    try { savePortalScroll(); } catch (e) {}
    showMatchView(myListing, matches);
    if (scrollToId != null) {
        // Scroll to + GREEN-FLASH the opened post INSIDE the engine. CRITICAL: the
        // SAME listing exists twice with id="lc-<id>" — once in the Portal ledger
        // (#listingsGrid, hidden while the engine is up) and once here in
        // #matchesContainer. document.getElementById() returns the FIRST (the
        // hidden ledger card), so the flash/scroll landed on the ledger and only
        // showed when the user went Back to the Portal. Scope the lookup to the
        // engine's container so it targets the match card the user is looking at.
        let _flashed = false;
        const _toMatch = () => {
            const box = document.getElementById('matchesContainer');
            const el = box && box.querySelector('[id="lc-' + scrollToId + '"]');
            if (!el) return false;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!_flashed) {
                el.classList.remove('match-flash');
                void el.offsetWidth;               // restart the animation if re-applied
                el.classList.add('match-flash');
                _flashed = true;
            }
            return true;
        };
        setTimeout(_toMatch, 60);
        setTimeout(_toMatch, 300);
        setTimeout(_toMatch, 700);
    }
}

// ── AI Match Engine — restored components ────────────────────────────────
// The Match Success bar and the AI Analysis breakdown were part of the
// original bespoke .match-card. The match view now renders the full Live
// Market post (buildListingCard); these helpers re-add the two components onto
// each match card using their ORIGINAL design/animation (.match-score-bar /
// .match-score-fill, .match-detail-row) and ORIGINAL computation. Nothing here
// changes the matching rules: computeMatchScore already enforces the mandatory
// Location + Unit Type gate, so only listings past BOTH gates ever reach this
// view. The score and analysis then reflect the remaining criteria (project,
// price, features, size, floor).
function _matchGrade(pct) {
    return pct >= 70 ? 'Excellent' : pct >= 45 ? 'Strong' : pct >= 25 ? 'Good' : 'Possible';
}
function _matchColor(pct) {
    return pct >= 70 ? '#16a34a' : pct >= 45 ? '#2563eb' : pct >= 25 ? '#f59e0b' : '#94a3b8';
}

// Match Success bar — percentage + grade + the original animated progress bar.
function buildMatchSuccessBar(pct, grade, color) {
    const el = document.createElement('div');
    el.className = 'match-success';
    el.innerHTML = `
        <div class="match-success-head">
            <span class="match-success-cap"><i class="fas fa-gauge-high"></i> Match Success</span>
            <span class="match-success-score" style="color:${color};"><strong>${pct}%</strong> ${grade} Match</span>
        </div>
        <div class="match-score-bar">
            <div class="match-score-fill" style="--gc:${color};width:${pct}%;"></div>
        </div>`;
    return el;
}

// AI Analysis — the original per-criterion detail rows (check / warn / cross).
function buildAiAnalysis(details, color) {
    const check = '<i class="fas fa-check-circle" style="color:#16a34a;font-size:12px;"></i>';
    const warn  = '<i class="fas fa-exclamation-circle" style="color:#f59e0b;font-size:12px;"></i>';
    const cross = '<i class="fas fa-times-circle" style="color:#cbd5e1;font-size:12px;"></i>';
    let rows = '';
    if (details.location) {
        if (details.location.match === 'exact') rows += `<div class="match-detail-row">${check} <span>Location match: <strong>${details.location.value}</strong></span></div>`;
        else if (details.location.match === 'nearby') rows += `<div class="match-detail-row">${warn} <span>Nearby area: ${details.location.theirs}</span></div>`;
    }
    if (details.project) {
        if (details.project.match) rows += `<div class="match-detail-row">${check} <span>Same project: <strong>${details.project.value}</strong></span></div>`;
        else if (details.project.theirs) rows += `<div class="match-detail-row">${cross} <span>Different project: ${details.project.theirs}</span></div>`;
    }
    if (details.unit) {
        if (details.unit.match) rows += `<div class="match-detail-row">${check} <span>Unit type: <strong>${details.unit.value}</strong></span></div>`;
        else rows += `<div class="match-detail-row">${cross} <span>Unit: ${details.unit.theirs || 'N/A'} (yours: ${details.unit.mine})</span></div>`;
    }
    if (details.price) {
        const fmtP = v => '₱' + (v / 1e6).toFixed(1) + 'M';
        if (details.price.match === 'exact') rows += `<div class="match-detail-row">${check} <span>Price in budget: <strong>${fmtP(details.price.seller)}</strong></span></div>`;
        else if (details.price.match === 'close') rows += `<div class="match-detail-row">${warn} <span>Price close: ${fmtP(details.price.seller)} (budget ${fmtP(details.price.budget.min)}–${fmtP(details.price.budget.max)})</span></div>`;
        else rows += `<div class="match-detail-row">${cross} <span>Price: ${fmtP(details.price.seller)} outside budget</span></div>`;
    }
    if (details.features?.match) rows += `<div class="match-detail-row">${check} <span>Features: <strong>${details.features.common.join(', ')}</strong></span></div>`;
    if (details.size?.match) rows += `<div class="match-detail-row">${check} <span>Size: <strong>~${details.size.value} sqm</strong></span></div>`;
    if (!rows) return null;
    const el = document.createElement('div');
    el.className = 'match-analysis';
    el.style.setProperty('--ac', color);
    el.innerHTML = `<div class="match-analysis-title">${brainWidget()} Engine Analysis</div>${rows}`;
    return el;
}

// The action row at the very bottom of every AI Match Engine card:
// [ SEND OFFER ] on the LEFT, [ VIEW LISTING ] on the RIGHT, one balanced row
// (the .lc-actionbar wrapper gives each button an equal 50% half). Send Offer
// opens the same offer flow used across the Portal (showOfferPopup); View Listing
// opens the matched listing's detail page. Send Offer is omitted for
// anonymous / own / sold listings — same rules as buildOfferRow — and View
// Listing then fills the row on its own.
function buildMatchActionRow(listing) {
    const viewBtn = `<button class="lc-view-btn" onclick="lmOpenListing('${listing.id}')">
            <i class="fas fa-arrow-up-right-from-square"></i> View Listing
        </button>`;
    const localUser = JSON.parse(localStorage.getItem('user') || 'null');
    const canOffer = listing.user_id && !listing.is_anonymous && listing.status !== 'sold'
        && !(localUser && listing.user_name === localUser.name);
    if (!canOffer) return viewBtn;
    const safeN   = (listing.user_name || '').replace(/'/g, "\\'");
    const img     = (listing.image_urls || [])[0] || '';
    const safeI   = img.replace(/'/g, "\\'");
    const safeCat = (listing.category || '').replace(/'/g, "\\'");
    const offerBtn = `<button class="lc-offer-btn" onclick="showOfferPopup('${listing.id}','${listing.user_id}','${safeN}','${safeI}','${safeCat}',this)">
            <i class="fas fa-handshake"></i> Send Offer
        </button>`;
    // Send Offer first (left), View Listing second (right).
    return `${offerBtn}${viewBtn}`;
}

function showMatchView(query, matches) {
    document.getElementById('ledgerView').style.display = 'none';
    const fb = document.querySelector('.filter-bar');
    if (fb) fb.style.display = 'none';
    const topWrap = document.querySelector('.top-fixed-wrap');
    if (topWrap) topWrap.style.display = 'none';
    document.documentElement.style.setProperty('--top-fixed-height', '0px');
    document.getElementById('matchView').style.display = 'block';
    applyAutoMinimize();

    // Reuse Live Market's exact per-card inputs — the AI-match label/score/reasons
    // and the objective "AI Matches Found" count — computed once and shared by the
    // "Your listing" card and every match card below. FMV is per FOR SALE listing.
    const matchMap = buildMatchMap();               // also refreshes matchCountMap
    const forSaleListings = allListings.filter(l => l.category === 'FOR SALE');
    const fmvFor = l => {
        try { return l.category === 'FOR SALE' ? calculateFMV(l, forSaleListings) : null; }
        catch (e) { return null; }
    };

    // Your listing — render with the SAME Live Market post component
    // (buildListingCard) so it matches the market feed and the match cards below.
    const yourWrap = document.getElementById('yourListingCard');
    yourWrap.innerHTML = '';
    // This IS the AI Match Engine, so the owner card's "AI Matches Found" button
    // (which just opens this same view) is redundant here — suppress it.
    yourWrap.appendChild(buildListingCard(query, null, fmvFor(query), matchCountMap.get(String(query.id)) || 0, { hideMatchBtn: true }));


    // Match count badge
    const badge = document.getElementById('matchCountBadge');
    badge.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;

    // Match cards — render each matched listing with the SAME component Live
    // Market uses (buildListingCard): Property Highlights, photo layout, Original
    // Property Information, Seller card, Offers Received, AI Matches Found, View
    // Listing, In Negotiation / Sold, etc. This keeps the two views pixel-identical
    // and means any future change to the Live Market post automatically appears
    // here too — the only difference is this view lists only matched listings.
    const container = document.getElementById('matchesContainer');
    container.innerHTML = '';

    if (!matches.length) {
        container.innerHTML = `
            <div class="no-matches">
                <i class="fas fa-satellite-dish"></i>
                <h3>No Matches Yet</h3>
                <p>The AI Engine will alert you when a partner listing enters the market.</p>
            </div>`;
        return;
    }

    const fmvMap = new Map();
    matches.forEach(l => { const r = fmvFor(l); if (r) fmvMap.set(l.id, r); });

    const parsedQuery = parseListing(query);

    matches.forEach(m => {
        const card = buildListingCard(m, matchMap.get(m.id) || null, fmvMap.get(m.id) || null, matchCountMap.get(String(m.id)) || 0);

        // Restore the Match Success bar (top) + AI Analysis (bottom) on each
        // match card, computed against the viewer's own listing. Placement
        // mirrors the original: score bar at the top of the card, AI Analysis
        // below the listing content.
        try {
            const { score, details } = computeMatchScore(parsedQuery, parseListing(m));
            const pct = Math.min(99, Math.round((score / 100) * 100));
            const color = _matchColor(pct);
            const content = card.querySelector('.lc-swipe-content') || card;

            // The compact Live-Market "AI Match" ribbon shows the same pct/grade
            // as the restored gauge — drop it here so the score isn't doubled.
            content.querySelector('.match-banner')?.remove();

            const anchor = content.querySelector('.lc-top');
            const bar = buildMatchSuccessBar(pct, _matchGrade(pct), color);
            if (anchor) content.insertBefore(bar, anchor); else content.prepend(bar);

            // Bottom of every match card, in order: (1) the card body / AI Match
            // Engine content, (2) Engine Analysis, (3) the Send Offer + View
            // Listing row. Append the analysis first so it sits directly under
            // the card body…
            const analysis = buildAiAnalysis(details, color);
            if (analysis) content.appendChild(analysis);

            // …then rebuild the footer as [ SEND OFFER ] [ VIEW LISTING ] and
            // re-append it so it lands BELOW the analysis as the card's last row.
            const foot = content.querySelector('.lc-actionbar');
            if (foot) {
                foot.className = 'lc-actionbar';   // drop any owner-variant modifier
                foot.innerHTML = buildMatchActionRow(m);
                content.appendChild(foot);
            }
        } catch (e) { console.warn('[showMatchView] match extras failed', e); }

        container.appendChild(card);
    });
    // Corner-to-corner completion sashes on the match cards + your-listing card.
    requestAnimationFrame(() => { fitCompletionSashes(container); fitCompletionSashes(document.getElementById('yourListingCard')); });
}

// ── Init ──────────────────────────────────────────
// Reopen the Portal tab the user last had selected (default: Live Market /
// MARKET). Called on load so a refresh or clicking "Portal" keeps the tab.
// selectSegTab() re-renders that tab and scrolls it to the top.
function restorePortalTab() {
    let saved = null;
    try { saved = localStorage.getItem('rm_portal_tab'); } catch (e) {}
    if (!saved || saved === activeSegTab) return; // MARKET default already shown
    const btn = document.querySelector(`.seg-tab[data-seg="${saved}"]`);
    if (btn && getComputedStyle(btn).display !== 'none') selectSegTab(btn);
}

function scrollPortalTop() {
    const mc = document.querySelector('.main-content');
    if (mc) mc.scrollTop = 0;
    window.scrollTo(0, 0);
}

// Clicking the global AI-match banner (match-alert.js) drops the matched listing
// id in localStorage('rm_match_highlight') and lands the user on the Matches tab.
// Here we scroll that exact post into view and flash a green ring around it so the
// user can instantly tell which listing is the match. Called from init() after the
// list has rendered (cross-page) and from openMatches() right after the tab switch
// (same-page). Retries because the Matches grid may still be rendering (loadLedger).
function consumeMatchHighlight() {
    let id = null;
    try { id = localStorage.getItem('rm_match_highlight'); } catch (e) {}
    if (!id) return;

    let attempts = 0;
    const run = () => {
        const el = document.getElementById('lc-' + id);
        if (!el) {
            if (++attempts <= 25) return setTimeout(run, 160); // ~4s: covers loadLedger
            try { localStorage.removeItem('rm_match_highlight'); } catch (e) {} // give up
            return;
        }
        try { localStorage.removeItem('rm_match_highlight'); } catch (e) {}
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('match-flash');
        void el.offsetWidth;               // restart the flash animation if re-applied
        el.classList.add('match-flash');
        setTimeout(() => el.classList.remove('match-flash'), 4200);
    };
    // Start after the tab's own scroll-to-top settles (rAF + 150ms) so our
    // scroll-to-card wins rather than being yanked back to the top.
    setTimeout(run, 260);
}
window.consumeMatchHighlight = consumeMatchHighlight;

// ── Scroll restoration: "View Listing → Back" returns to the same post ─────
// When the user leaves the Portal for a Listing Detail page, we remember the
// active section (tab), the scroll offset, and — most robustly — which post sat
// at the top of the viewport and exactly where. On the next load (Back), once
// the list has finished rendering, we restore that instead of jumping to the
// top. Covers Live Market, My Listings, and Matches (both the Matches tab list
// and the AI Match Engine deep view), on desktop (.main-content scrolls) and
// mobile (the window scrolls). When the browser uses its back/forward cache the
// page isn't re-parsed at all and the scroll is preserved natively — this path
// only kicks in on a real reload, where init() would otherwise force the top.
const RM_SCROLL_KEY = 'rm_portalScroll';

// The reference line just below the fixed header — the visual "top" of the list.
// Hidden in the deep match view, in which case the viewport top (0) is used.
function _portalRefTop() {
    const tf = document.querySelector('.top-fixed-wrap');
    if (tf && getComputedStyle(tf).display !== 'none') {
        const r = tf.getBoundingClientRect();
        if (r.height) return r.bottom;
    }
    return 0;
}

// The visible post-card nearest that reference line — our restore anchor.
function _topVisibleCard() {
    const refTop = _portalRefTop();
    let best = null, bestDelta = Infinity;
    document.querySelectorAll('.listing-card').forEach(c => {
        if (!c.id || !c.offsetParent) return;              // skip hidden cards
        const r = c.getBoundingClientRect();
        if (r.height <= 0 || r.bottom <= refTop) return;   // fully above the line
        const delta = Math.abs(r.top - refTop);
        if (delta < bestDelta) { bestDelta = delta; best = c; }
    });
    return best;
}

function savePortalScroll() {
    try {
        const mc = document.querySelector('.main-content');
        const anchor = _topVisibleCard();
        sessionStorage.setItem(RM_SCROLL_KEY, JSON.stringify({
            tab: activeSegTab,
            scrollTop: mc ? mc.scrollTop : 0,
            winTop: window.scrollY || window.pageYOffset || 0,
            cardId: anchor ? anchor.id : null,
            // Where the anchor's top sat in the viewport when we left, so it can be
            // put back at the same spot even if card heights above it changed.
            cardTop: anchor ? anchor.getBoundingClientRect().top : null,
            ts: Date.now()
        }));
    } catch (e) {}
}

// Whichever element actually scrolls: .main-content on desktop (it has its own
// overflow), or the window on mobile (there .main-content lays out at full
// height and the page itself scrolls). Returns the .main-content element, or
// null meaning "scroll the window". We scroll ONLY that one — nudging both would
// double-count on any layout where both happen to be scrollable.
function _activeScroller() {
    const mc = document.querySelector('.main-content');
    if (mc && mc.scrollHeight - mc.clientHeight > 1) return mc;
    return null;
}
function _nudgeScroll(delta) {
    if (!delta) return;
    const sc = _activeScroller();
    if (sc) sc.scrollTop += delta;
    else window.scrollBy(0, delta);
}

// Restore the saved position for the CURRENT section. One-shot: consumed on the
// first load after Back so a later fresh visit isn't affected. Returns true if a
// restore was applied. Re-applies across a few frames so late-loading images /
// reflow can't drift the final resting position.
function restorePortalScroll() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(RM_SCROLL_KEY) || 'null'); } catch (e) {}
    if (!s) return false;
    sessionStorage.removeItem(RM_SCROLL_KEY);
    if (s.tab && s.tab !== activeSegTab) return false;

    const apply = () => {
        if (s.cardId && s.cardTop != null) {
            const el = document.getElementById(s.cardId);
            if (el) { _nudgeScroll(el.getBoundingClientRect().top - s.cardTop); return; }
        }
        const sc = _activeScroller();
        if (sc) sc.scrollTop = s.scrollTop || 0;
        else window.scrollTo(0, s.winTop || 0);
    };
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 120);
    setTimeout(apply, 300);
    setTimeout(apply, 600);
    return true;
}

// Save on the way out — pagehide fires on navigation to Listing Detail (and is
// bfcache-safe, unlike beforeunload which we deliberately avoid so bfcache keeps
// working and preserves scroll on its own).
window.addEventListener('pagehide', savePortalScroll);

// How this page was reached. 'back_forward' means the browser Back/Forward
// button (or history.back() — how Listing Detail's Back works), which is our
// signal to RESTORE the previous scroll. Anything else — clicking the Portal nav
// link ('navigate') or a reload — means go to the TOP of the active tab.
function _navType() {
    try {
        const e = performance.getEntriesByType('navigation');
        if (e && e[0] && e[0].type) return e[0].type;
    } catch (e) {}
    try {
        const t = performance.navigation && performance.navigation.type;
        if (t === 2) return 'back_forward';
        if (t === 1) return 'reload';
    } catch (e) {}
    return 'navigate';
}

// Tapping the Portal nav while ALREADY on the Portal: smooth-scroll the active
// tab to the very top (no reload, tab preserved) and drop any saved scroll so it
// can't pull us back down. Cross-page Portal taps land here via init() instead.
function portalHome() {
    try { sessionStorage.removeItem(RM_SCROLL_KEY); } catch (e) {}
    const sc = _activeScroller();
    if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function init() {
    // We manage scroll position ourselves (savePortalScroll / restorePortalScroll)
    // so turn off the browser's own guess — otherwise it fights our restore.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // Reopen the last-selected tab BEFORE the async ledger load, so the correct
    // tab is active from the very first paint — no flash of Live Market (the
    // HTML's default active tab) while the listings are still loading.
    try { restorePortalTab(); }
    catch (e) { console.warn('[Portal] tab restore failed:', e); }

    // Load the ledger. Wrapped so a load/render error can't bubble out and leave
    // the tab half-applied; the tab was already restored above regardless.
    try { await loadLedger(); }
    catch (e) { console.warn('[Portal] loadLedger failed:', e); }

    // Live "Offers Received": push new offers to the count/badge (and any open
    // Offers sheet) in real time, no refresh. Counts were just preloaded by
    // loadLedger → preloadOfferCounts, so the registry is in sync before we
    // start listening for inserts.
    try { subscribePortalOffers(); }
    catch (e) { console.warn('[Portal] offers realtime failed:', e); }

    // Live "completed" removal: when any listing is marked Sold/Bought/Rented/
    // Leased, drop it from AI Matches + counts here with no page refresh.
    try { subscribePortalListings(); }
    catch (e) { console.warn('[Portal] listings realtime failed:', e); }

    // Then, if the user was inside a listing's match view before navigating away
    // (e.g. opened a listing's detail and pressed Back), re-open it on top.
    // loadLedger() has populated myListings/allListings so it can rebuild.
    let ctx = null;
    try { ctx = JSON.parse(sessionStorage.getItem('rm_matchCtx') || 'null'); } catch (e) {}
    if (ctx && ctx.listingId != null) {
        try { showAllMatches(ctx.listingId, ctx.scrollToId); } catch (e) {}
    }

    // Two intentionally-distinct behaviours now that the list has rendered:
    //  • Back from a Listing Detail (Back button → history.back() → 'back_forward')
    //    RESTORES the exact post + scroll position the user left, on the same tab.
    //  • Clicking the Portal nav link ('navigate') — or a reload — goes to the TOP
    //    of the active tab (tab is already preserved by restorePortalTab above; we
    //    never switch back to Live Market). Any stale saved scroll is discarded so
    //    it can't drag the user down.
    const goTop = () => {
        scrollPortalTop();
        requestAnimationFrame(scrollPortalTop);
        setTimeout(scrollPortalTop, 150);
    };
    if (_navType() === 'back_forward') {
        if (!restorePortalScroll()) goTop();
    } else {
        try { sessionStorage.removeItem(RM_SCROLL_KEY); } catch (e) {}
        goTop();
    }

    // Arrived here by clicking the AI-match banner? Scroll to + green-flash the
    // exact matched post. No-op when there's no pending highlight.
    try { consumeMatchHighlight(); } catch (e) {}
}

init();

// ── Post Listing Modal ────────────────────────────
let lmSelectedCat = null;

// ── Phase 2a: structured composer (feature-gated) ──────────────
let lmSelectedUnitType = null;
const lmIsSupply      = cat => cat === 'FOR SALE' || cat === 'FOR RENT' || cat === 'FOR LEASE';
const lmDefaultPeriod = cat => (cat === 'FOR RENT' || cat === 'FOR LEASE' || cat === 'WILLING TO RENT' || cat === 'WILLING TO LEASE') ? 'monthly' : 'total';
const lmStructuredOn  = () => (typeof window.isFeatureEnabled === 'function') ? window.isFeatureEnabled('structuredComposer') : true;
const _lmNum = id => { const v = parseFloat((document.getElementById(id)?.value||'').replace(/,/g,'')); return isNaN(v)?null:v; };
const _lmInt = id => { const v = parseInt((document.getElementById(id)?.value||'').replace(/,/g,''),10); return isNaN(v)?null:v; };
const _lmTxt = id => { const v = (document.getElementById(id)?.value||'').trim(); return v||null; };
const _lmPrune = o => { const r={}; Object.keys(o).forEach(k=>{ if(o[k]!=null && o[k]!=='') r[k]=o[k]; }); return r; };
function lmCanonProject(v){ const t=(v||'').trim(); if(!t) return null; const r=(window.RM_DEVELOPERS&&RM_DEVELOPERS.getProject)?RM_DEVELOPERS.getProject(t):null; return r?r.name:t; }
function lmCanonCity(v){ const t=(v||'').trim(); if(!t) return null; const cs=(window.RM_LOC&&RM_LOC.extractCities)?RM_LOC.extractCities(t):[]; return cs&&cs.length?cs[0]:t; }
function lmSetPeriod(p){ const s=document.getElementById('lmPricePeriod'); if(!s) return; s.dataset.period=p; s.querySelectorAll('.lm-seg-opt').forEach(o=>o.classList.toggle('active',o.dataset.period===p)); }
function lmSyncCategoryUI(){ const sup=lmIsSupply(lmSelectedCat); document.querySelectorAll('#lmDetails .lm-req').forEach(el=>el.style.display=sup?'':'none'); const s=document.getElementById('lmPricePeriod'); if(s&&!s.dataset.userSet) lmSetPeriod(lmDefaultPeriod(lmSelectedCat)); }
function lmCollectStructured(){
  if(!lmStructuredOn()) return {};
  const proj = lmCanonProject(document.getElementById('lmProject')?.value);
  return _lmPrune({
    price:_lmNum('lmPrice'),
    price_period:(document.getElementById('lmPricePeriod')?.dataset.period)||lmDefaultPeriod(lmSelectedCat),
    unit_type:lmSelectedUnitType,
    location_city:(document.getElementById('lmLocationCity')?.dataset.canon)||lmCanonCity(document.getElementById('lmLocationCity')?.value),
    location_area:_lmTxt('lmLocationArea'),
    project:proj,
    developer:_lmTxt('lmDeveloper')||((window.RM_DEVELOPERS&&proj)?RM_DEVELOPERS.getDeveloper(proj):null),
    bedrooms:_lmInt('lmBedrooms'), bathrooms:_lmInt('lmBathrooms'),
    floor_area_sqm:_lmNum('lmFloorArea'), parking:_lmInt('lmParking'),
    furnishing:_lmTxt('lmFurnishing'), turnover_status:_lmTxt('lmTurnover'), floor_level:_lmInt('lmFloorLevel'),
  });
}
function lmValidateStructured(s){
  if(!lmStructuredOn()) return null;
  if(lmIsSupply(lmSelectedCat)){
    const miss=[]; if(s.price==null||s.price<=0) miss.push('Price'); if(!s.location_city) miss.push('Location'); if(!s.unit_type) miss.push('Unit type');
    if(miss.length) return 'Please add: '+miss.join(', ')+'.';
  }
  const checks=[['price','Price'],['bedrooms','Beds'],['bathrooms','Baths'],['floor_area_sqm','Sqm'],['parking','Parking'],['floor_level','Floor']];
  for(const kv of checks){ const k=kv[0], l=kv[1]; if(s[k]!=null && (isNaN(s[k])||s[k]<0)) return l+' must be a valid number.'; }
  return null;
}
function lmDupFieldsFromStructured(s, content, category){
  const p = parseListing({ content:content||'', id:null, category, price:s.price, unit_type:s.unit_type,
                           location_city:s.location_city, location_area:s.location_area, project:s.project });
  return {
    category:String(category||'').trim().toUpperCase(),
    loc:(p.locations||[]).map(x=>String(x).toLowerCase().trim()).filter(Boolean).sort().join('|'),
    price:(s.price!=null)?s.price:lmDupPrice(content),
    project:p.project?p.project.toLowerCase().trim():'',
    unitType:(p.unitTypes||[]).map(x=>String(x).toLowerCase().trim()).filter(Boolean).sort().join('|'),
    unitNumber:extractUnitNumber(content)
  };
}

// When set, the modal is editing an existing listing (its id) instead of creating
// a new one — submitLMPost() runs an UPDATE and resetPostModal() clears it.
let lmEditId      = null;
let lmImageFiles  = [];
// Index (into lmImageFiles) of the photo the user picked as the Cover Photo — the
// single image shown on the Portal post. Defaults to the first photo.
let lmCoverIndex  = 0;
// True while a submit is in flight — a hard re-entrancy guard so mashing
// Post/Save can never fire a second save (which, in edit mode, could otherwise
// slip a duplicate INSERT alongside the intended UPDATE).
let _lmSubmitting = false;
// True while the composed listing is a known duplicate — Post Now stays disabled
// (and the Already-Posted alert stays up) until the user changes the post.
let _lmDupBlocked = false;

// Show / clear the "Already Posted" duplicate-warning alert. It's a single,
// self-contained component in the modal body; while it's up, Post Now is disabled
// so a duplicate can't be submitted. Editing the description or switching category
// clears it and re-enables the button.
function lmShowDupAlert() {
    _lmDupBlocked = true;
    const el = document.getElementById('lmDupAlert');
    if (el) el.hidden = false;
    const btn = document.getElementById('lmSubmitBtn');
    if (btn) btn.disabled = true;
}
function lmClearDupAlert() {
    _lmDupBlocked = false;
    const el = document.getElementById('lmDupAlert');
    if (el) el.hidden = true;
    const btn = document.getElementById('lmSubmitBtn');
    if (btn && !_lmSubmitting) btn.disabled = false;
}

// ── Visibility Controls state ──
// A post can be hidden from specific user accounts (any Realmate member, not
// just connections). Hiding never affects AI matching — see visibility.js.
let lmHiddenUsers     = new Map();       // id -> { id, name, img }
let lmUserDirectory   = null;            // cached [{id, full_name, avatar_url}]

function openPostModal() {
    document.getElementById('postModalOverlay').classList.add('open');
    document.getElementById('lmPostText').focus();
    prefetchVisUsers();
}

// ── Edit an existing Portal post ──────────────────
// Reuses the Post modal in "edit mode": pre-fills the category, caption text, and
// Visibility Controls from the live listing, then submitLMPost() runs an UPDATE
// (see lmEditId). Photos are intentionally left as-is unless the owner adds new
// ones — editing here is primarily for the wording and category of a post.
async function editListing(listingId) {
    const listing = (allListings || []).find(l => String(l.id) === String(listingId));
    if (!listing) { lmToast('Listing not found', 'fa-triangle-exclamation'); return; }

    resetPostModal();          // clean slate (also clears any prior edit state)
    lmEditId = String(listingId);

    // Caption + category
    document.getElementById('lmPostText').value = listing.content || '';
    lmSelectedCat = listing.category || null;
    document.querySelectorAll('.lm-cat-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.cat === lmSelectedCat));
    if (lmStructuredOn()) {
      const c = listing.content || '', setV=(id,v)=>{const el=document.getElementById(id); if(el&&v!=null&&v!=='') el.value=v;};
      setV('lmPrice', listing.price ?? (window.RM_MATCH?RM_MATCH.extractPrice(c):null));
      const ut = listing.unit_type ?? (window.RM_MATCH?RM_MATCH.unitTypesForMatch(c)[0]:null);
      if(ut){ const chip=document.querySelector('#lmUnitTypes .lm-unit-chip[data-unit="'+ut+'"]'); if(chip){chip.classList.add('selected'); lmSelectedUnitType=ut;} }
      const city = listing.location_city ?? (window.RM_LOC?RM_LOC.extractCities(c)[0]:null);
      const ce=document.getElementById('lmLocationCity'); if(ce&&city){ce.value=city;ce.dataset.canon=city;}
      setV('lmLocationArea', listing.location_area);
      const proj = listing.project ?? (window.RM_MATCH?RM_MATCH.extractProject(c):null);
      setV('lmProject', proj);
      setV('lmDeveloper', listing.developer ?? ((proj&&window.RM_DEVELOPERS)?RM_DEVELOPERS.getDeveloper(proj):null));
      setV('lmBedrooms', listing.bedrooms); setV('lmBathrooms', listing.bathrooms);
      setV('lmFloorArea', listing.floor_area_sqm); setV('lmParking', listing.parking); setV('lmFloorLevel', listing.floor_level);
      if(listing.furnishing){const el=document.getElementById('lmFurnishing'); if(el) el.value=listing.furnishing;}
      if(listing.turnover_status){const el=document.getElementById('lmTurnover'); if(el) el.value=listing.turnover_status;}
      if(listing.price_period){ lmSetPeriod(listing.price_period); const _pp=document.getElementById('lmPricePeriod'); if(_pp) _pp.dataset.userSet='1'; }
    }
    lmSyncCategoryUI();

    // Rehydrate Visibility Controls from the stored hidden_user_ids. Names/avatars
    // come from the user directory (fetched on demand); fall back to a bare chip
    // so a hidden user is never silently dropped when the directory lacks them.
    const hidden = Array.isArray(listing.hidden_user_ids) ? listing.hidden_user_ids : [];
    if (hidden.length) {
        await prefetchVisUsers();
        hidden.forEach(uid => {
            const u = (lmUserDirectory || []).find(x => String(x.id) === String(uid));
            lmHiddenUsers.set(String(uid), {
                id: String(uid),
                name: u ? u.full_name : 'Hidden user',
                img: u ? (u.avatar_url || '') : ''
            });
        });
        renderVisChips();
        updateVisSummary();
    }

    // Swap the modal's chrome into edit mode.
    const title = document.getElementById('lmModalTitle');
    if (title) title.textContent = 'Edit Listing';
    const btn = document.getElementById('lmSubmitBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-circle-check"></i> Save Changes';
    const note = document.getElementById('lmEditPhotoNote');
    if (note) note.hidden = false;

    openPostModal();
}

function toggleVisCard() {
    const card = document.getElementById('lmVisCard');
    const body = document.getElementById('lmVisBody');
    const head = document.getElementById('lmVisHead');
    const open = card.classList.toggle('open');
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
}

// Fetch the user directory once (id, name, avatar, job) for the search.
async function prefetchVisUsers() {
    if (lmUserDirectory) return;
    try {
        const me = (await _sb.auth.getUser()).data?.user?.id || null;
        let q = _sb.from('profiles').select('id,full_name,avatar_url');
        if (me) q = q.neq('id', me);
        const { data } = await q.limit(1000);
        lmUserDirectory = (data || []).filter(u => u.full_name);
    } catch (e) { console.warn('[Visibility] user directory fetch failed', e); lmUserDirectory = []; }
}

async function onVisUserSearch(term) {
    const box = document.getElementById('lmVisResults');
    if (!box) return;
    await prefetchVisUsers();
    const q = (term || '').trim().toLowerCase();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    const matches = lmUserDirectory
        .filter(u => !lmHiddenUsers.has(String(u.id)) && u.full_name.toLowerCase().includes(q))
        .slice(0, 8);
    if (!matches.length) {
        box.innerHTML = `<div class="lm-vis-result-empty">No users found</div>`;
    } else {
        box.innerHTML = matches.map(u => {
            const img = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=random&color=fff`;
            return `<div class="lm-vis-result" onclick="addVisUser('${u.id}')">
                <img src="${img}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=94a3b8&color=fff'">
                <span>
                    <span class="lm-vis-result-name">${escapeVis(u.full_name)}</span>
                </span>
            </div>`;
        }).join('');
    }
    box.hidden = false;
}

function addVisUser(id) {
    const u = (lmUserDirectory || []).find(x => String(x.id) === String(id));
    if (!u) return;
    lmHiddenUsers.set(String(id), {
        id: String(id), name: u.full_name, img: u.avatar_url || ''
    });
    const input = document.getElementById('lmVisUserSearch');
    if (input) input.value = '';
    const box = document.getElementById('lmVisResults');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    renderVisChips();
    updateVisSummary();
}

function removeVisUser(id) {
    lmHiddenUsers.delete(String(id));
    renderVisChips();
    updateVisSummary();
}

function renderVisChips() {
    const wrap = document.getElementById('lmVisChips');
    if (!wrap) return;
    wrap.innerHTML = Array.from(lmHiddenUsers.values()).map(u =>
        `<span class="lm-vis-chip">${escapeVis(u.name)}<button type="button" onclick="removeVisUser('${u.id}')" aria-label="Remove"><i class="fas fa-times"></i></button></span>`
    ).join('');
}

function updateVisSummary() {
    const card = document.getElementById('lmVisCard');
    const sum  = document.getElementById('lmVisSummary');
    const nUser = lmHiddenUsers.size;
    const hasHides = nUser > 0;
    if (card) card.classList.toggle('has-hides', hasHides);
    if (!sum) return;
    if (!hasHides) { sum.textContent = 'Visible to everyone · AI matching stays on'; return; }
    sum.textContent = `Hidden from ${nUser} user${nUser !== 1 ? 's' : ''} · AI matching stays on`;
}

function escapeVis(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Close the user-search dropdown when clicking elsewhere.
document.addEventListener('click', e => {
    const wrap = document.querySelector('.lm-vis-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const box = document.getElementById('lmVisResults');
        if (box) box.hidden = true;
    }
});

function closePostModal(e) {
    if (e && e.target !== document.getElementById('postModalOverlay')) return;
    document.getElementById('postModalOverlay').classList.remove('open');
    resetPostModal();
}

function resetPostModal() {
    lmSelectedCat = null;
    lmEditId      = null;
    lmImageFiles  = [];
    lmCoverIndex  = 0;
    // Restore the modal chrome to "create" mode (editListing() swaps it back).
    const title = document.getElementById('lmModalTitle');
    if (title) title.textContent = 'Post a Listing';
    const submitBtn = document.getElementById('lmSubmitBtn');
    if (submitBtn) { submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Now'; submitBtn.disabled = false; }
    const editNote = document.getElementById('lmEditPhotoNote');
    if (editNote) editNote.hidden = true;
    // Clear submit / duplicate state so the next open starts fresh.
    _lmSubmitting = false;
    _lmDupBlocked = false;
    const dupAlert = document.getElementById('lmDupAlert');
    if (dupAlert) dupAlert.hidden = true;
    document.querySelectorAll('.lm-cat-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('lmPostText').value = '';
    document.getElementById('lmImagePreview').innerHTML = '';
    document.getElementById('lmCoverHint')?.remove();
    document.querySelector('.lm-img-label .lm-img-count')?.remove();
    document.getElementById('lmPostStatus').textContent = '';
    document.getElementById('lmPostStatus').className = 'lm-post-status';
    const toggle = document.getElementById('lmAnonToggle');
    if (toggle) { toggle.checked = false; }
    const row = document.getElementById('lmAnonRow');
    if (row) { row.classList.remove('active'); }
    const sub = document.getElementById('lmAnonSub');
    if (sub) { sub.textContent = 'Using your real identity'; }
    // Reset Visibility Controls
    lmHiddenUsers = new Map();
    const visCard = document.getElementById('lmVisCard');
    const visBody = document.getElementById('lmVisBody');
    const visHead = document.getElementById('lmVisHead');
    if (visCard) visCard.classList.remove('open', 'has-hides');
    if (visBody) visBody.hidden = true;
    if (visHead) visHead.setAttribute('aria-expanded', 'false');
    const visSearch = document.getElementById('lmVisUserSearch');
    if (visSearch) visSearch.value = '';
    const visResults = document.getElementById('lmVisResults');
    if (visResults) { visResults.hidden = true; visResults.innerHTML = ''; }
    // Phase 2a structured fields
    lmSelectedUnitType = null;
    document.querySelectorAll('#lmUnitTypes .lm-unit-chip').forEach(c=>c.classList.remove('selected'));
    ['lmPrice','lmBedrooms','lmBathrooms','lmFloorArea','lmParking','lmLocationArea','lmProject','lmDeveloper','lmFloorLevel','lmFurnishing','lmTurnover'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
    const _ce=document.getElementById('lmLocationCity'); if(_ce){_ce.value='';_ce.dataset.canon='';}
    const _seg=document.getElementById('lmPricePeriod'); if(_seg){delete _seg.dataset.userSet; lmSetPeriod('total');}
    ['lmProjectMenu','lmLocCityMenu'].forEach(id=>{const m=document.getElementById(id); if(m){m.hidden=true;m.innerHTML='';}});
    lmSyncCategoryUI();
    renderVisChips();
    updateVisSummary();
}

document.getElementById('lmCatGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('.lm-cat-btn');
    if (!btn) return;
    document.querySelectorAll('.lm-cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    lmSelectedCat = btn.dataset.cat;
    lmSyncCategoryUI();
    // Changing the category means it may no longer be a duplicate — clear the
    // Already-Posted alert and re-enable Post Now.
    if (_lmDupBlocked) lmClearDupAlert();
});

document.getElementById('lmUnitTypes')?.addEventListener('click', e=>{
  const chip=e.target.closest('.lm-unit-chip'); if(!chip) return;
  const on=chip.classList.contains('selected');
  document.querySelectorAll('#lmUnitTypes .lm-unit-chip').forEach(c=>c.classList.remove('selected'));
  if(on){ lmSelectedUnitType=null; } else { chip.classList.add('selected'); lmSelectedUnitType=chip.dataset.unit; }
});
document.getElementById('lmPricePeriod')?.addEventListener('click', e=>{
  const o=e.target.closest('.lm-seg-opt'); if(!o) return;
  document.getElementById('lmPricePeriod').dataset.userSet='1'; lmSetPeriod(o.dataset.period);
});
function lmInitProjectAutocomplete(){
  const input=document.getElementById('lmProject'), menu=document.getElementById('lmProjectMenu'); if(!input||!menu) return; let t=null;
  const render=q=>{ const nq=(q||'').trim().toLowerCase(); const all=(window.RM_DEVELOPERS&&RM_DEVELOPERS.all)||[];
    if(!nq){menu.hidden=true;return;} const sc=[];
    for(const p of all){ const n=(p.name||'').toLowerCase(), al=(p.aliases||[]).map(a=>a.toLowerCase()); let s=-1;
      if(n.startsWith(nq))s=0; else if(n.includes(nq))s=1; else if(al.some(a=>a.startsWith(nq)))s=2; else if(al.some(a=>a.includes(nq)))s=3;
      if(s>=0) sc.push([s,p]); }
    sc.sort((a,b)=>a[0]-b[0]); const top=sc.slice(0,8); if(!top.length){menu.hidden=true;return;}
    menu.innerHTML=top.map(pair=>{ const p=pair[1]; const sub=[p.developer,p.category,p.location].filter(Boolean).join(' · ');
      return '<div class="lm-suggest-item" data-name="'+(p.name||'').replace(/"/g,'&quot;')+'"><div class="lm-suggest-name">'+p.name+'</div><div class="lm-suggest-sub">'+sub+'</div></div>'; }).join('');
    menu.hidden=false;
    menu.querySelectorAll('.lm-suggest-item').forEach(el=>el.addEventListener('mousedown',ev=>{ev.preventDefault(); lmPickProject(el.dataset.name); menu.hidden=true;})); };
  input.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>render(input.value),120);});
  input.addEventListener('focus',()=>{ if(input.value.trim()) render(input.value); });
  input.addEventListener('blur',()=>setTimeout(()=>menu.hidden=true,150));
}
function lmPickProject(name){
  const pe=document.getElementById('lmProject'); pe.value=name;
  const rec=(window.RM_DEVELOPERS&&RM_DEVELOPERS.getProject)?RM_DEVELOPERS.getProject(name):null; if(!rec) return;
  const de=document.getElementById('lmDeveloper'); if(rec.developer && !de.value.trim()) de.value=rec.developer;
  const ce=document.getElementById('lmLocationCity');
  if(rec.location && ce && !ce.dataset.canon){ const c=(window.RM_LOC&&RM_LOC.extractCities)?RM_LOC.extractCities(rec.location)[0]:null; if(c){ce.value=c;ce.dataset.canon=c;} }
}
function lmInitLocationPicker(){
  const input=document.getElementById('lmLocationCity'), menu=document.getElementById('lmLocCityMenu'); if(!input||!menu) return;
  const groups=(window.RM_LOC&&RM_LOC.filterOptions)?RM_LOC.filterOptions():[]; const cities=[];
  groups.forEach(g=>g.options.forEach(o=>{ if(o.value.indexOf('city:')===0) cities.push(o.label); })); let t=null;
  const render=q=>{ const nq=(q||'').trim().toLowerCase(); const list=(nq?cities.filter(c=>c.toLowerCase().indexOf(nq)>=0):cities).slice(0,12);
    menu.innerHTML=list.map(c=>'<div class="lm-suggest-item" data-city="'+c.replace(/"/g,'&quot;')+'">'+c+'</div>').join(''); menu.hidden=!list.length;
    menu.querySelectorAll('.lm-suggest-item').forEach(el=>el.addEventListener('mousedown',ev=>{ev.preventDefault(); input.value=el.dataset.city; input.dataset.canon=el.dataset.city; menu.hidden=true;})); };
  input.addEventListener('input',()=>{input.dataset.canon='';clearTimeout(t);t=setTimeout(()=>render(input.value),100);});
  input.addEventListener('focus',()=>render(input.value));
  input.addEventListener('blur',()=>setTimeout(()=>menu.hidden=true,150));
}
lmInitProjectAutocomplete(); lmInitLocationPicker();

const LM_MAX_IMAGES = 10;

function previewLMImages(input) {
    const selected = Array.from(input.files);
    if (selected.length > LM_MAX_IMAGES) {
        lmToast(`Up to ${LM_MAX_IMAGES} images — only the first ${LM_MAX_IMAGES} will be used`, 'fa-circle-info');
    }
    lmImageFiles = selected.slice(0, LM_MAX_IMAGES);
    // Keep the chosen cover valid; default to the first photo.
    if (lmCoverIndex >= lmImageFiles.length) lmCoverIndex = 0;

    const dt = new DataTransfer();
    lmImageFiles.forEach(f => dt.items.add(f));
    input.files = dt.files;

    const preview = document.getElementById('lmImagePreview');
    preview.innerHTML = '';

    const label = document.querySelector('.lm-img-label');
    const countBadge = label?.querySelector('.lm-img-count');
    if (countBadge) countBadge.remove();
    if (lmImageFiles.length > 0 && label) {
        const badge = document.createElement('span');
        badge.className = 'lm-img-count';
        badge.textContent = `${lmImageFiles.length}/${LM_MAX_IMAGES}`;
        label.appendChild(badge);
    }

    // A short helper line telling the user how the cover works — only when there
    // is more than one photo (a single photo is automatically the cover).
    const hint = document.getElementById('lmCoverHint');
    if (hint) hint.remove();
    if (lmImageFiles.length > 1) {
        const h = document.createElement('div');
        h.id = 'lmCoverHint';
        h.className = 'lm-cover-hint';
        h.innerHTML = '<i class="fas fa-star"></i> Tap a photo to set it as the <strong>cover</strong> — the one image shown on your Portal post.';
        preview.parentNode.insertBefore(h, preview);
    }

    // Build the tiles synchronously (in index order) so the cover highlight always
    // lands on the right photo, then fill each image in as its FileReader resolves.
    lmImageFiles.forEach((file, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'lm-thumb' + (i === lmCoverIndex ? ' is-cover' : '');
        thumb.dataset.idx = String(i);
        // Clicking the thumbnail (anywhere but the remove button) selects it as the
        // cover. The selected thumb shows a persistent "Cover" ribbon.
        thumb.onclick = ev => { if (ev.target.closest('.lm-thumb-remove')) return; setLMCover(i); };
        thumb.innerHTML = `
            <img alt="">
            <span class="lm-thumb-cover-badge"><i class="fas fa-star"></i> Cover</span>
            <button class="lm-thumb-remove" onclick="removeLMImage(${i})" aria-label="Remove photo"><i class="fas fa-times"></i></button>
        `;
        preview.appendChild(thumb);
        const reader = new FileReader();
        reader.onload = e => { const im = thumb.querySelector('img'); if (im) im.src = e.target.result; };
        reader.readAsDataURL(file);
    });
}

// Choose which uploaded photo becomes the single Portal cover. Updates the
// highlighted thumbnail without re-reading the files.
function setLMCover(index) {
    if (index < 0 || index >= lmImageFiles.length) return;
    lmCoverIndex = index;
    document.querySelectorAll('#lmImagePreview .lm-thumb').forEach(t => {
        t.classList.toggle('is-cover', parseInt(t.dataset.idx || '-1', 10) === index);
    });
}

function removeLMImage(index) {
    lmImageFiles.splice(index, 1);
    // Keep the cover pointing at the same photo: shift down if a photo before it
    // was removed, or reset to the first when the cover itself was removed.
    if (index === lmCoverIndex) lmCoverIndex = 0;
    else if (index < lmCoverIndex) lmCoverIndex -= 1;
    if (lmCoverIndex >= lmImageFiles.length) lmCoverIndex = 0;

    const dt = new DataTransfer();
    lmImageFiles.forEach(f => dt.items.add(f));
    document.getElementById('lmPostImages').files = dt.files;
    previewLMImages(document.getElementById('lmPostImages'));
}

function toggleLMAnonMode() {
    const toggle = document.getElementById('lmAnonToggle');
    const row    = document.getElementById('lmAnonRow');
    const sub    = document.getElementById('lmAnonSub');
    const settings = JSON.parse(localStorage.getItem('userSettings')) || {};
    if (toggle.checked) {
        if (!settings.anonName) {
            settings.anonName = generateAnonName();
            localStorage.setItem('userSettings', JSON.stringify(settings));
        }
        row.classList.add('active');
        sub.textContent = `Posting as "${settings.anonName}"`;
    } else {
        row.classList.remove('active');
        sub.textContent = 'Using your real identity';
    }
}

// ── Duplicate-post prevention ─────────────────────────────────────────────
// Blocks a new post when it is identical to one the SAME user already has live.
// Identity is decided on the STRUCTURED (AI-extracted) property fields, never on
// the caption wording — so rewording, trimming, or padding the description can't
// bypass it. The four main fields must all match: Location, Price, Project Name,
// Unit Type. The Unit Number then acts as a tie-breaker so genuinely different
// units in the same project can still both be posted (see lmIsDuplicateListing).

// Explicit unit/door number stated in a post, e.g. "Unit 1018", "Unit No. 3205",
// "Unit #12A", "#4508". Used only to DISTINGUISH two otherwise-identical listings —
// it is deliberately conservative: anything that looks like floor area or a price
// is rejected, so an ambiguous capture yields null (treated as "no unit number")
// rather than a wrong number that would let a true duplicate slip through.
function extractUnitNumber(text) {
    if (!text) return null;
    const norm = String(text).replace(/\r/g, '');
    // "Unit 1018", "Unit No. 3205", "Unit Number: 45B", "Unit #12A" (label optional)
    let m = norm.match(/\bunit\s*(?:no\.?|number|num|#)?\s*[:#]?\s*(\d{1,6}[a-z]?)\b/i);
    if (m) {
        const after = norm.slice(m.index + m[0].length, m.index + m[0].length + 8).toLowerCase();
        // Reject floor-area / price / rate captures ("unit 25 sqm", "unit 30M", "unit 120k/mo")
        if (!/^\s*(?:sq|sqm|square|m²|m\b|k\b|million|per|\/)/.test(after)) {
            return m[1].toUpperCase();
        }
    }
    // Bare hash number: "#1018"
    m = norm.match(/#\s*(\d{2,6}[a-z]?)\b/i);
    if (m) return m[1].toUpperCase();
    return null;
}

// Reduce a post's content to its comparable structured fields. Reuses the shared
// Match-Engine extractors (parseListing) so the duplicate check sees exactly the
// same Location / Price / Project / Unit Type the rest of the platform does.
// Price for the duplicate check. The shared engine (extractPrice) reads ₱/M/K and
// 7–9 digit amounts, but SKIPS comma-grouped rents with no M/K suffix — e.g.
// "₱50,000/month", "P150,000/mo" — returning null there. That's common on For
// Rent / For Lease posts, and it would make two DIFFERENT rents look identical
// (both null). So when the engine can't read a price, fall back to a permissive
// scan for clearly-monetary amounts (comma-grouped, or tagged as monthly rent).
function lmDupPrice(content) {
    const engine = parseListing({ content: content || '', id: null }).price;
    if (engine != null) return engine;
    const text = String(content || '');
    const patterns = [
        /\b(\d{1,3}(?:,\d{3})+)(?:\.\d+)?\b/g,                                   // 50,000  ·  1,500,000
        /\b(\d{4,9})\s*\/?\s*(?:month|months?|mo|mos|monthly|per\s*month)\b/gi   // 50000/month
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) !== null) {
            const v = parseFloat(m[1].replace(/,/g, ''));
            if (!isNaN(v) && v >= 1000) return v;   // first clearly-monetary amount
        }
    }
    return null;
}

function lmDupFields(content, category) {
    const p = parseListing({ content: content || '', id: null });
    return {
        category:   String(category || '').trim().toUpperCase(),
        loc:        (p.locations || []).map(s => String(s).toLowerCase().trim()).filter(Boolean).sort().join('|'),
        price:      lmDupPrice(content),
        project:    p.project ? p.project.toLowerCase().trim() : '',
        unitType:   (p.unitTypes || []).map(s => String(s).toLowerCase().trim()).filter(Boolean).sort().join('|'),
        unitNumber: extractUnitNumber(content)
    };
}

// Price is a hard distinguisher: two posts count as the same price ONLY when both
// prices are known AND equal. A different price — or a price we can't read on
// either side — is treated as "not the same", so the post is allowed. (Per the
// rule: if the price is different, allow the post.)
function lmPricesEqual(a, b) {
    return a != null && b != null && a === b;
}

// The structured fields that define an identical listing. Category is included so
// posts in DIFFERENT categories are never duplicates of each other — a "Willing to
// Buy · BGC · 3BR · 80M" is a distinct listing from a "For Sale · BGC · 3BR · 80M"
// even though their location/price/unit-type read the same. (Different category →
// allow the post.)
function lmMainFieldsMatch(a, b) {
    return a.category === b.category && a.loc === b.loc && lmPricesEqual(a.price, b.price) &&
           a.project === b.project && a.unitType === b.unitType;
}

// Is `neu` a duplicate of an `existing` listing by the same user?
//  • Main four differ            → not a duplicate (allow).
//  • Main four match, both unit#  → duplicate only if the unit numbers are equal.
//  • Main four match, only one    → allow (a bare listing ≠ a specific unit).
//    has a unit number
//  • Main four match, neither has → duplicate (block).
//    a unit number
function lmIsDuplicateListing(neu, existing) {
    if (!lmMainFieldsMatch(neu, existing)) return false;
    const a = neu.unitNumber, b = existing.unitNumber;
    if (a && b) return a === b;
    if (!a && !b) return true;
    return false;
}

async function submitLMPost() {
    // Re-entrancy guard: ignore any click while a save is already running, so
    // rapid Post/Save clicks only ever process the FIRST request.
    if (_lmSubmitting) return;

    const status  = document.getElementById('lmPostStatus');
    const content = document.getElementById('lmPostText').value.trim();

    if (!lmSelectedCat) { status.className = 'lm-post-status error'; status.textContent = 'Please select a category.'; return; }
    if (!content)        { status.className = 'lm-post-status error'; status.textContent = 'Please write something about your listing.'; return; }

    const localUser = JSON.parse(localStorage.getItem('user'));
    if (!localUser)      { status.className = 'lm-post-status error'; status.textContent = 'You must be logged in to post.'; return; }

    const structured = lmCollectStructured();
    const sErr = lmValidateStructured(structured);
    if (sErr) { status.className = 'lm-post-status error'; status.textContent = sErr; return; }

    const isAnon = false;

    const btn = document.getElementById('lmSubmitBtn');
    _lmSubmitting = true;
    btn.disabled = true;
    lmClearDupAlert();               // hide any stale duplicate alert for this attempt
    status.className = 'lm-post-status';
    status.textContent = lmEditId ? 'Saving…' : 'Posting…';

    try {
        // Duplicate-post prevention — run BEFORE uploading images so a blocked post
        // never leaves orphaned uploads. Compares this post's structured fields
        // against the user's own live listings only (never other users').
        const { data: dupAuth } = await _sb.auth.getUser();
        const dupUid = dupAuth?.user?.id;
        if (dupUid) {
            const { data: myListings, error: dupErr } = await _sb
                .from('listings').select('id, content, category')
                .eq('user_id', dupUid).eq('archived', false);
            if (!dupErr && myListings && myListings.length) {
                const neu = lmStructuredOn() ? lmDupFieldsFromStructured(structured, content, lmSelectedCat)
                                             : lmDupFields(content, lmSelectedCat);
                // When editing, the post being changed must not count as a duplicate
                // of itself.
                const others = lmEditId ? myListings.filter(l => String(l.id) !== String(lmEditId)) : myListings;
                const isDup = others.some(l => lmIsDuplicateListing(neu, lmDupFields(l.content || '', l.category)));
                if (isDup) {
                    // Surface it as the dedicated Already-Posted alert component and
                    // keep Post Now disabled (lmShowDupAlert). The footer status is
                    // cleared so the warning reads from one place only.
                    status.className = 'lm-post-status';
                    status.textContent = '';
                    lmShowDupAlert();
                    return; // stays disabled (duplicate) until the user edits the post
                }
            }
        }

        // Upload images (compressed before upload)
        let imageUrls = [];
        if (lmImageFiles.length > 0) {
            const compressed = await compressImages(lmImageFiles);
            const uploads = compressed.map(async (file, i) => {
                const ext  = file.name.split('.').pop();
                const path = `listings/${Date.now()}_${i}.${ext}`;
                const { error } = await _sb.storage.from('images').upload(path, file, { upsert: true });
                if (error) throw error;
                return _sb.storage.from('images').getPublicUrl(path).data.publicUrl;
            });
            imageUrls = await Promise.all(uploads);
        }

        const { data: authData } = await _sb.auth.getUser();
        const postName = isAnon ? settings.anonName : localUser.name;
        const postImg  = isAnon
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(settings.anonName)}&background=0f172a&color=fff`
            : (localUser.image || '');
        // Visibility Controls — only include the column when the user actually
        // set hides, so posting still works even before the DB migration is run.
        const hiddenUsers     = Array.from(lmHiddenUsers.keys());

        // Cover Photo — the single image shown on the Portal post. Stored SEPARATELY
        // from image_urls (which keeps every uploaded photo for the Listing Detail
        // gallery). The chosen cover is also one of the image_urls.
        const coverUrl = imageUrls.length
            ? imageUrls[Math.min(lmCoverIndex, imageUrls.length - 1)]
            : null;

        // ── Edit mode: UPDATE the existing post ──
        // Only the fields the owner can change are written: category, caption, and
        // the visibility set. Identity/anon flags are left untouched. Photos are
        // replaced only when new ones were added (otherwise the existing image set
        // and cover are preserved). hidden_user_ids is always written so removing
        // every hide actually clears it.
        if (lmEditId) {
            const editRow = {
                category: lmSelectedCat,
                content,
                hidden_user_ids: hiddenUsers.length ? hiddenUsers : null
            };
            Object.assign(editRow, _lmPrune(structured));
            if (imageUrls.length) {
                editRow.image_urls = imageUrls;
                editRow.cover_image_url = coverUrl;
            }

            let { error } = await _sb.from('listings').update(editRow).eq('id', lmEditId);
            // Graceful fallbacks when optional columns don't exist yet (migrations
            // not run): retry without them rather than failing the whole edit.
            if (error && /cover_image_url/i.test(error.message || '')) {
                const { cover_image_url, ...noCover } = editRow;
                ({ error } = await _sb.from('listings').update(noCover).eq('id', lmEditId));
            }
            if (error && /hidden_user_ids/i.test(error.message || '')) {
                const { hidden_user_ids, ...noHides } = editRow;
                ({ error } = await _sb.from('listings').update(noHides).eq('id', lmEditId));
            }
            if (error) throw error;

            // Reflect the change locally so the card updates without a full reload.
            const local = (allListings || []).find(l => String(l.id) === String(lmEditId));
            if (local) Object.assign(local, editRow);

            status.className = 'lm-post-status success';
            status.innerHTML = '<i class="fas fa-circle-check"></i> Changes saved';
            setTimeout(() => {
                closePostModal(null);
                resetPostModal();
                loadLedger();
            }, 1000);
            return;
        }

        const row = {
            user_id:      authData?.user?.id,
            user_name:    postName,
            user_job:     '',
            user_img:     postImg,
            category:     lmSelectedCat,
            content,
            image_urls:   imageUrls.length ? imageUrls : null,
            cover_image_url: coverUrl,
            is_anonymous: isAnon,
            archived:     false,
            pinned:       false,
            ..._lmPrune(structured),
            ...(hiddenUsers.length     ? { hidden_user_ids:  hiddenUsers }     : {})
        };

        let { error } = await _sb.from('listings').insert(row);
        // Graceful fallback if the cover-photo migration hasn't been run yet: retry
        // without the new column (the Portal still shows image_urls[0] as the cover).
        if (error && /cover_image_url/i.test(error.message || '')) {
            const { cover_image_url, ...rowNoCover } = row;
            ({ error } = await _sb.from('listings').insert(rowNoCover));
        }

        if (error) throw error;

        status.className = 'lm-post-status success';
        status.innerHTML = '<i class="fas fa-circle-check"></i> Listing posted';
        setTimeout(() => {
            closePostModal(null);
            resetPostModal();
            loadLedger();
        }, 1000);
    } catch (err) {
        status.className = 'lm-post-status error';
        status.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + escapeVis(err.message || 'Failed to post.');
        btn.disabled = false;   // a genuine failure — let the user retry
    } finally {
        _lmSubmitting = false;
        // On success the button stays disabled and the modal closes via the
        // 1s setTimeout (resetPostModal re-enables it) — this closes the window
        // where a second click could have fired. On a duplicate it also stays
        // disabled until the user edits. Only the catch path above re-enables.
    }
}

// ── Load YouTube embed with IFrame API for full volume ──
let _ytPlayer = null;

function onYouTubeIframeAPIReady() {
    // Called by YouTube API script — player created after video ID is known
}

function updateFilterBarTop() {
    const ticker  = document.querySelector('.ticker-wrap');
    const stickyBar = document.querySelector('.sticky-ticker-bar');
    const filterBar = document.querySelector('.filter-bar');
    if (!filterBar) return;
    const t = (ticker?.offsetHeight || 0) + (stickyBar?.offsetHeight || 0);
    filterBar.style.top = t + 'px';
}

async function renderMarketReportPdf() {
    const { data, error: dbErr } = await _sb.from('site_settings').select('value').eq('key', 'market_report_pdf').single();
    if (dbErr || !data?.value) {
        console.warn('No PDF URL in site_settings:', dbErr);
        return;
    }

    const wrap  = document.getElementById('pdfStripWrap');
    const strip = document.getElementById('pdfPageStrip');
    if (!wrap || !strip) return;

    const pdfUrl = data.value.split('?')[0];

    const lib = window.pdfjsLib;
    if (!lib) {
        console.error('PDF.js (pdfjsLib) not found on window — check CDN script');
        return;
    }

    lib.GlobalWorkerOptions.workerSrc =
        'vendor/pdfjs/pdf.worker.min.js?v=3.11.174';

    // Respect user preference
    if (localStorage.getItem('rm_hide_pdf') === '1') return;

    // Show a loading placeholder immediately
    wrap.style.display = 'flex';
    const loader = document.createElement('div');
    loader.id = 'pdfLoader';
    loader.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b;padding:4px 0;';
    loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading report…';
    strip.appendChild(loader);
    updateFilterBarTop();

    try {
        // Fetch as ArrayBuffer — avoids CORS issues with the PDF.js worker
        const resp = await fetch(pdfUrl);
        if (!resp.ok) throw new Error('Fetch failed: HTTP ' + resp.status);
        const arrayBuffer = await resp.arrayBuffer();

        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        _pdfDoc = pdf;
        const PAGE_H = 126;

        loader.remove();

        for (let i = 1; i <= pdf.numPages; i++) {
            const page   = await pdf.getPage(i);
            const baseVp = page.getViewport({ scale: 1 });
            const scale  = PAGE_H / baseVp.height;
            const vp     = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const ctx    = canvas.getContext('2d');
            const dpr    = window.devicePixelRatio || 1;
            canvas.width  = Math.floor(vp.width  * dpr);
            canvas.height = Math.floor(vp.height * dpr);
            canvas.style.width  = Math.floor(vp.width)  + 'px';
            canvas.style.height = Math.floor(vp.height) + 'px';
            canvas.style.borderRadius = '8px';
            canvas.style.flexShrink  = '0';
            canvas.style.border      = '1px solid #e2e8f0';
            canvas.style.boxShadow   = '0 2px 8px rgba(0,0,0,0.10)';
            canvas.title = 'Click to open full view';
            canvas.style.cursor = 'pointer';
            ctx.scale(dpr, dpr);

            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            canvas.addEventListener('click', openPdfViewer);
            strip.appendChild(canvas);
        }

        // Show courtesy
        const pdfCourtesy = document.getElementById('pdfCourtesy');
        if (pdfCourtesy) pdfCourtesy.style.display = 'flex';

        // Store URL for download
        window._pdfDownloadUrl = pdfUrl;

        wrap.style.display = 'flex';
        updateFilterBarTop();
    } catch (e) {
        console.error('PDF render error:', e);
        loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Could not load report';
    }
}

// ── PDF Viewer Modal ──────────────────────────────────
let _pdfDoc = null; // store reference for modal rendering

async function openPdfViewer() {
    const lb    = document.getElementById('pdfLightbox');
    const pages = document.getElementById('pdfLbPages');
    if (!lb || !pages || !_pdfDoc) return;

    pages.innerHTML = '<div style="color:#fff; display:flex; align-items:center; gap:10px; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading pages…</div>';
    lb.style.display = 'block';
    lb.scrollTop = 0;

    pages.innerHTML = '';
    const isMobile = window.innerWidth <= 640;
    const maxW = isMobile ? window.innerWidth : Math.min(window.innerWidth * 0.88, 860);
    const dpr  = window.devicePixelRatio || 1;

    for (let i = 1; i <= _pdfDoc.numPages; i++) {
        const page   = await _pdfDoc.getPage(i);
        const baseVp = page.getViewport({ scale: 1 });
        const scale  = maxW / baseVp.width;
        const vp     = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        canvas.width  = Math.floor(vp.width  * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width  = Math.floor(vp.width)  + 'px';
        canvas.style.height = Math.floor(vp.height) + 'px';
        canvas.style.cssText += '; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:block;';
        ctx.scale(dpr, dpr);

        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        pages.appendChild(canvas);
    }
}

function closePdfLightbox() {
    document.getElementById('pdfLightbox').style.display = 'none';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePdfLightbox(); });

async function downloadPdf() {
    const url = window._pdfDownloadUrl;
    if (!url) return;
    try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'market-report.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
        console.error('Download failed:', e);
    }
}

// PDF.js script is loaded before livemarket.js so pdfjsLib is already available
renderMarketReportPdf();

// (Market Pulse YouTube embed removed — no third-party content)

// Sync top padding on mobile for fixed header
function syncTopPadding() {
    const wrap = document.querySelector('.top-fixed-wrap');
    if (!wrap) return;
    // Use ResizeObserver result or direct measure with forced reflow
    void wrap.offsetHeight;
    const h = wrap.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--top-fixed-height', (h + 8) + 'px');
}

// Use ResizeObserver for reliable auto-sync
if (typeof ResizeObserver !== 'undefined') {
    const _topWrap = document.querySelector('.top-fixed-wrap');
    if (_topWrap) {
        new ResizeObserver(() => syncTopPadding()).observe(_topWrap);
    }
}
syncTopPadding();
window.addEventListener('resize', syncTopPadding);
setTimeout(syncTopPadding, 500);

// ── Load courtesy attributions from DB ──
(async function loadCourtesy() {
    try {
        const { data: vidC } = await _sb.from('site_settings').select('value').eq('key', 'video_courtesy').single();
        if (vidC?.value) {
            const el = document.getElementById('videoCourtesyText');
            if (el) el.textContent = vidC.value;
        }
    } catch {}
    try {
        const { data: pdfC } = await _sb.from('site_settings').select('value').eq('key', 'pdf_courtesy').single();
        if (pdfC?.value) {
            const el = document.getElementById('pdfCourtesyText');
            if (el) el.textContent = pdfC.value;
        }
    } catch {}
})();

// ── Video controls ──
let _ytMuted = false;
function toggleYtMute(btn) {
    if (!_ytPlayer) return;
    _ytMuted = !_ytMuted;
    if (_ytMuted) {
        _ytPlayer.mute();
    } else {
        _ytPlayer.unMute();
        _ytPlayer.setVolume(100);
    }
    btn.innerHTML = _ytMuted ? '<i class="fas fa-volume-xmark"></i>' : '<i class="fas fa-volume-high"></i>';
    if (!_ytMuted) {
        const hint = document.getElementById('ytMuteHint');
        if (hint) hint.style.display = 'none';
    }
}
function closeYtVideo() {
    document.getElementById('ytEmbedSection').style.display = 'none';
    if (_ytPlayer) try { _ytPlayer.stopVideo(); } catch {}

    updateFilterBarTop();
}

// ── Apply user preferences from settings ──
(function applyMarketPrefs() {
    const hideVideo  = localStorage.getItem('rm_hide_video')  === '1';
    const hidePdf    = localStorage.getItem('rm_hide_pdf')    === '1';
    const hideGraphs = localStorage.getItem('rm_show_graphs') === '0';

    if (hideVideo) {
        document.getElementById('ytEmbedSection').style.display = 'none';
    }
    if (localStorage.getItem('rm_hide_ticker') === '1') {
        const t = document.getElementById('tickerWrap');
        if (t) t.style.display = 'none';
    }

    // If video, PDF and graphs are all hidden, collapse the entire sticky bar
    if (hideVideo && hidePdf && hideGraphs) {
        const bar = document.querySelector('.sticky-ticker-bar');
        if (bar) bar.style.display = 'none';
        const tabs = document.querySelector('.market-main-tabs');
        if (tabs) tabs.style.top = '40px';
    }
    setTimeout(updateFilterBarTop, 100);
})();

// ── Seller Popup ───────────────────────────────────────────────────────────
function _ensureSellerPopup() {
    if (document.getElementById('sellerPopupOverlay')) return;
    const el = document.createElement('div');
    el.id = 'sellerPopupOverlay';
    el.innerHTML = `
        <div id="sellerPopupBackdrop" onclick="closeSellerPopup()"></div>
        <div id="sellerPopupSheet">
            <div id="sellerPopupHandle"></div>
            <div id="sellerPopupHeader">
                <div id="sellerPopupAvatar"></div>
                <div>
                    <div id="sellerPopupName"></div>
                    <div id="sellerPopupJob"></div>
                </div>
            </div>
            <div id="sellerPopupOptions">
                <button id="sellerOptListings" onclick="handleViewListings()">
                    <span class="sp-opt-icon"><i class="fas fa-store"></i></span>
                    <span class="sp-opt-text">
                        <span class="sp-opt-title">View Listings</span>
                        <span class="sp-opt-sub">Browse all active property listings</span>
                    </span>
                    <i class="fas fa-chevron-right sp-opt-arrow"></i>
                </button>
                <button id="sellerOptMessage" onclick="closeSellerPopup(); sessionStorage.setItem('openChatWith', JSON.stringify({userId:window._spUserId,name:window._spName})); rmGoChat()">
                    <span class="sp-opt-icon sp-opt-icon-msg"><i class="fas fa-comment-dots"></i></span>
                    <span class="sp-opt-text">
                        <span class="sp-opt-title">Message</span>
                        <span class="sp-opt-sub">Send a direct message</span>
                    </span>
                    <i class="fas fa-chevron-right sp-opt-arrow"></i>
                </button>
                <button id="sellerOptProfile" onclick="closeSellerPopup(); location.href=window._spUserId?'dashboard.html?user_id='+window._spUserId:''">
                    <span class="sp-opt-icon sp-opt-icon-profile"><i class="fas fa-user-tie"></i></span>
                    <span class="sp-opt-text">
                        <span class="sp-opt-title">View Profile</span>
                        <span class="sp-opt-sub">See full realmate profile</span>
                    </span>
                    <i class="fas fa-chevron-right sp-opt-arrow"></i>
                </button>
            </div>
            <button id="sellerPopupCancel" onclick="closeSellerPopup()">Cancel</button>
        </div>
    `;
    document.body.appendChild(el);
}

function _ensureLockedPopup() {
    if (document.getElementById('spLockedOverlay')) return;
    const el = document.createElement('div');
    el.id = 'spLockedOverlay';
    el.innerHTML = `
        <div id="spLockedBackdrop" onclick="closeLockedPopup()"></div>
        <div id="spLockedSheet">
            <div id="spLockedHandle"></div>
            <div id="spLockedIcon"><i class="fas fa-lock"></i></div>
            <div id="spLockedTitle">Seller Listings Locked</div>
            <div id="spLockedMsg">To view this seller's active listings, you must first become realmates. Connect with this user to unlock their Live Market listings and build your trusted real estate network.</div>
            <div id="spLockedActions">
                <button id="spLockedAddBtn" onclick="handleAddMateFromLocked()">
                    <i class="fas fa-user-plus"></i> Add as realmate
                </button>
                <button id="spLockedMsgBtn" onclick="closeLockedPopup(); sessionStorage.setItem('openChatWith', JSON.stringify({userId:window._spUserId,name:window._spName})); rmGoChat()">
                    <i class="fas fa-comment-dots"></i> Message Instead
                </button>
                <button id="spLockedCancelBtn" onclick="closeLockedPopup()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);

    const sheet = document.getElementById('spLockedSheet');
    let startY = 0, curY = 0, dragging = false;
    sheet.addEventListener('touchstart', e => {
        if (e.target.closest('button')) return;
        startY = e.touches[0].clientY; dragging = true; curY = 0;
        sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
        if (!dragging) return;
        curY = e.touches[0].clientY - startY;
        if (curY > 0) sheet.style.transform = `translateY(${curY}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        sheet.style.transition = '';
        sheet.style.transform = '';
        if (curY > 80) closeLockedPopup();
    });
}

// Self/seller identity menu — uses the shared account-menu.js modal engine
// (account-menu.js/account-menu.css) so Portal and Profile render the exact
// same modal component. Options differ per context: viewing your OWN listing
// shows My Account/My Profile/My Listings; viewing someone ELSE's shows
// My Account/View Profile/View Listings for THAT member (dashboard.html's
// own showSellerPopup override keeps its separate, already-shipped Profile
// wording — see dashboard-script.js).
function showSelfPopup() {
    if (typeof openAccountMenu !== 'function') return;
    openAccountMenu({
        header: { type: 'title', text: 'Account Menu' },
        options: [
            {
                icon: 'fa-gear',
                title: 'My Account',
                sub: 'Manage your account and settings.',
                onClick: () => { location.href = 'settings.html'; }
            },
            {
                icon: 'fa-user',
                title: 'My Profile',
                sub: 'View your profile and profile information.',
                onClick: () => { location.href = 'dashboard.html'; }
            },
            {
                icon: 'fa-briefcase',
                title: 'My Listings',
                sub: 'View your listings and activity.',
                onClick: () => { location.href = 'dashboard.html?view=listings'; }
            }
        ]
    });
}
function closeSelfPopup() {
    if (typeof closeAccountMenu === 'function') closeAccountMenu();
}

// Open the chat with a specific member. In the app shell this switches to the
// REAL Chat tab (bottom-nav highlight + shown page stay in sync — not Portal with
// chat merely opened underneath); standalone falls back to a full navigation.
// The conversation to open is passed via sessionStorage (chat.html reads it).
function rmGoChat() {
    try {
        if (window.self !== window.top && window.parent && typeof window.parent.rmOpen === 'function') {
            window.parent.rmOpen('chat', 'chat.html');
            return;
        }
    } catch (e) {}
    // Standalone (not in the app shell): fall back to a full navigation.
    location.href = 'chat.html';
}
function rmNavToChat(userId, name) {
    try { sessionStorage.setItem('openChatWith', JSON.stringify({ userId: userId, name: name })); } catch (e) {}
    rmGoChat();
}

function showSellerPopup(userId, name, img, job) {
    window._spUserId = userId;
    window._spName   = name;
    window._spImg    = img;
    if (typeof openAccountMenu !== 'function') return;
    openAccountMenu({
        header: { type: 'identity', avatar: img, name, job },
        options: [
            {
                icon: 'fa-user-tie',
                title: 'View Profile',
                sub: 'See this member’s realmate profile.',
                onClick: () => {
                    if (!userId) return;
                    // Blocked members' profiles can't be viewed (App Store 1.2) —
                    // say so plainly instead of silently bouncing to the feed.
                    if (window.RMBR && RMBR.isBlocked(userId, name)) {
                        if (typeof showToast === 'function') showToast('You blocked this user. Unblock in Settings to view their profile.');
                        return;
                    }
                    location.href = 'dashboard.html?user_id=' + userId;
                }
            },
            {
                icon: 'fa-store',
                title: 'View Listings',
                sub: 'Browse this member’s active listings.',
                onClick: () => { if (typeof handleViewListings === 'function') handleViewListings(); }
            },
            {
                icon: 'fa-comment-dots',
                title: 'Send Message',
                sub: 'Message this member directly.',
                onClick: () => { if (userId) rmNavToChat(userId, name); }
            }
        ]
    });
}

function closeSellerPopup() {
    if (typeof closeAccountMenu === 'function') closeAccountMenu();
}

function closeLockedPopup() {
    const overlay = document.getElementById('spLockedOverlay');
    if (!overlay) return;
    overlay.classList.remove('sp-open');
    document.body.style.overflow = '';
}

async function handleViewListings() {
    closeSellerPopup();
    const targetId = window._spUserId;
    if (!targetId) return;

    // Get current user id
    let myId = null;
    try {
        const { data: auth } = await _sb.auth.getUser();
        myId = auth?.user?.id;
    } catch {}

    // If viewing own profile, allow directly. view=listings deep-links straight
    // to the dashboard's Listings section (see dashboard-script.js).
    if (!myId || myId === targetId) {
        location.href = `dashboard.html?user_id=${targetId}&view=listings`;
        return;
    }

    // Check Realmate status by user IDs
    let areRealmates = false;
    try {
        const { data: rows } = await _sb
            .from('mates')
            .select('status')
            .or(`and(requester_id.eq.${myId},recipient_id.eq.${targetId}),and(requester_id.eq.${targetId},recipient_id.eq.${myId})`)
            .eq('status', 'accepted')
            .limit(1);
        areRealmates = !!(rows && rows.length > 0);
    } catch {}

    if (areRealmates) {
        location.href = `dashboard.html?user_id=${targetId}&view=listings`;
    } else {
        _ensureLockedPopup();
        document.getElementById('spLockedOverlay').classList.add('sp-open');
        document.body.style.overflow = 'hidden';
    }
}

async function handleAddMateFromLocked() {
    const btn = document.getElementById('spLockedAddBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending...';
    try {
        const result = await sendMateRequest(window._spName, window._spImg);
        if (result?.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Request Sent';
            btn.style.background = '#16a34a';
            setTimeout(closeLockedPopup, 1400);
        } else {
            const msg = result?.error || 'Could not send request';
            btn.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
            btn.style.background = '#dc2626';
            btn.disabled = false;
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Add as realmate';
                btn.style.background = '';
                btn.disabled = false;
            }, 2500);
        }
    } catch {
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Add as realmate';
        btn.disabled = false;
    }
}


// ── Portal: minimize the top bar on scroll-down into a floating Search FAB ──
// Scrolling down collapses the sticky top bar (tabs + filters + search) to give
// more room for listings and reveals a draggable, circular Search button. Tapping
// it instantly restores the bar in place (no scroll change — the bar is sticky, so
// it re-appears at the current viewport top). Scrolling down again minimizes it.
// The FAB's dragged position is kept in memory only (resets on refresh/reopen).
(function initPortalTopbar() {
    const topWrap = document.querySelector('.top-fixed-wrap');
    if (!topWrap) return;
    topWrap.classList.remove('nav-hidden'); // clear any legacy state

    // Floating Search button (hidden until the bar is minimized).
    const fab = document.createElement('button');
    fab.className = 'portal-search-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Search');
    fab.innerHTML = '<i class="fas fa-search"></i>';
    document.body.appendChild(fab);

    const mc = document.querySelector('.main-content');
    const getScrollY = () =>
        Math.max(window.pageYOffset || 0, document.documentElement.scrollTop || 0, mc ? mc.scrollTop : 0);

    let minimized = false;
    function setMinimized(next) {
        if (next === minimized) return;
        minimized = next;
        topWrap.classList.toggle('nav-min', next);
        fab.classList.toggle('show', next);
    }

    // ── Scroll: down past a threshold minimizes; returning to the top expands. ──
    const TOP_ZONE   = 8;   // within this many px of the top → always expanded
    const MIN_AFTER  = 80;  // only start minimizing past this scroll depth
    const DOWN_DELTA = 6;   // downward movement needed to minimize (ignore jitter)
    let lastY = getScrollY();
    let ticking = false;
    function evaluate() {
        const y = getScrollY();
        const dy = y - lastY;
        if (y <= TOP_ZONE) setMinimized(false);
        else if (dy >= DOWN_DELTA && y > MIN_AFTER) setMinimized(true);
        // Scrolling up leaves the bar minimized on purpose — only a FAB tap (or
        // reaching the top) brings it back.
        lastY = y;
        ticking = false;
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(evaluate); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    if (mc) mc.addEventListener('scroll', onScroll, { passive: true });

    // ── Drag + tap. A small movement counts as a tap (restore the bar); a larger
    // one drags the button and it stays where it's dropped (this session only). ──
    let dragging = false, moved = false;
    let startX = 0, startY = 0, baseX = 0, baseY = 0;
    let posX = null, posY = null; // in-memory only (no localStorage → resets on refresh)

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    fab.addEventListener('pointerdown', e => {
        dragging = true; moved = false;
        startX = e.clientX; startY = e.clientY;
        const r = fab.getBoundingClientRect();
        baseX = r.left; baseY = r.top;
        fab.classList.add('dragging');
        try { fab.setPointerCapture(e.pointerId); } catch (_) {}
    });
    fab.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
        if (!moved) return;
        const size = fab.offsetWidth || 48;
        posX = clamp(baseX + dx, 6, window.innerWidth  - size - 6);
        posY = clamp(baseY + dy, 6, window.innerHeight - size - 6);
        fab.style.left = posX + 'px';
        fab.style.top  = posY + 'px';
        fab.style.right = 'auto';
    });
    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        fab.classList.remove('dragging');
        try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
        if (!moved) setMinimized(false); // tap → restore the top bar (scroll unchanged)
    }
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);

    // Keep the dragged FAB on-screen if the viewport is resized/rotated.
    window.addEventListener('resize', () => {
        if (posX == null) return;
        const size = fab.offsetWidth || 48;
        posX = clamp(posX, 6, window.innerWidth  - size - 6);
        posY = clamp(posY, 6, window.innerHeight - size - 6);
        fab.style.left = posX + 'px';
        fab.style.top  = posY + 'px';
    }, { passive: true });
})();
