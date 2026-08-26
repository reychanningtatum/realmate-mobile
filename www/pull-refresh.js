/* pull-refresh.js — Facebook-style pull-to-refresh.
 *
 *   rmPullRefresh({ content: '.main-content', windowScroll: true,
 *                   pullTarget: '#homeFeed', label: 'Loading Feed', onRefresh: fn })
 *
 * At the very top of the scroll, dragging DOWN slides `pullTarget` (the posts /
 * listings container) downward, opening a SPACE between whatever sits above it
 * (search bar / top nav / write-a-post) and its first item. The loading
 * indicator rides in the MIDDLE of that opening space. Past the threshold it
 * holds a loading position, shows a spinner (+ optional label) and runs
 * onRefresh; when that resolves it snaps back with the fresh data. onRefresh
 * should REFRESH DATA IN PLACE (not reload) so there is no empty-state flash.
 * The gesture only arms when the scroll is genuinely at the top — pass
 * windowScroll:true for pages whose BODY scrolls (Feed, Portal). Touch-only.
 *
 *   content     — element the touch listeners attach to (the visible area)
 *   pullTarget  — element that slides down to open the space (default: content)
 *   windowScroll— read window scroll instead of an element's scrollTop
 *   label       — text shown beside the spinner while refreshing
 *   onRefresh   — () => Promise | void ; refresh data in place
 */
(function () {
  'use strict';

  function el(x) { return typeof x === 'string' ? document.querySelector(x) : x; }

  function init(opts) {
    opts = opts || {};
    var content = el(opts.content || opts.scroller);
    if (!content || content.__rmPtr) return;
    content.__rmPtr = true;
    var winScroll = !!opts.windowScroll;
    var scrollEl = winScroll ? null : (el(opts.scroller) || content);
    var onRefresh = opts.onRefresh || function () { location.reload(); };
    var label = opts.label || '';
    var pullEl = el(opts.pullTarget) || content;

    var THRESHOLD = 72, MAX = 120, DAMP = 0.55, REST = 66, HALF_IND = 19;

    function scrollTop() {
      return winScroll ? (window.pageYOffset || document.documentElement.scrollTop || 0)
                       : (scrollEl.scrollTop || 0);
    }

    // gapTop = viewport y where the space opens (the pull element's resting top),
    // measured at the start of each pull so it tracks the safe-area inset and the
    // real header height. The indicator is centered in the gap [gapTop, gapTop+y].
    var gapTop = 0;
    function computeGapTop() { gapTop = Math.max(0, Math.round(pullEl.getBoundingClientRect().top)); }

    if (!document.getElementById('rm-ptr-style')) {
      var st = document.createElement('style');
      st.id = 'rm-ptr-style';
      st.textContent =
        '.rm-ptr{position:fixed;left:50%;top:0;z-index:9000;height:38px;min-width:38px;' +
        'box-sizing:border-box;border-radius:19px;background:#fff;box-shadow:0 5px 18px rgba(15,23,42,.22);' +
        'display:flex;align-items:center;justify-content:center;gap:0;padding:0;color:#32cd32;font-size:15px;' +
        'opacity:0;transform:translate(-50%,-52px);pointer-events:none;}' +
        '.rm-ptr i{transition:transform .18s ease;flex:0 0 auto;}' +
        '.rm-ptr .rm-ptr-label{display:none;font-size:12.5px;font-weight:600;color:#334155;white-space:nowrap;}' +
        '.rm-ptr.rm-busy{gap:8px;padding:0 15px;}' +
        '.rm-ptr.rm-busy.rm-has-label .rm-ptr-label{display:inline;}' +
        '.rm-ptr.rm-busy i{animation:rm-ptr-spin .7s linear infinite;}' +
        '@keyframes rm-ptr-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    var ind = document.createElement('div');
    ind.className = 'rm-ptr';
    ind.innerHTML = '<i class="fas fa-arrow-down"></i><span class="rm-ptr-label"></span>';
    document.body.appendChild(ind);
    var arrow = ind.querySelector('i');
    var labelEl = ind.querySelector('.rm-ptr-label');

    var startY = 0, active = false, dist = 0, busy = false;

    function atTop() { return scrollTop() <= 0; }
    function noEase() { pullEl.style.transition = 'none'; ind.style.transition = 'none'; }
    function ease() {
      pullEl.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
      ind.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s';
    }
    // Center the indicator vertically in the opening gap [gapTop, gapTop+y].
    function moveInd(y) { ind.style.transform = 'translate(-50%,' + (gapTop + y / 2 - HALF_IND) + 'px)'; }
    function drag(pull) {
      var y = Math.min(pull, MAX);
      pullEl.style.transform = 'translateY(' + y + 'px)';
      ind.style.opacity = y > 6 ? '1' : '0';
      moveInd(y);
      if (arrow) arrow.style.transform = 'rotate(' + (pull >= THRESHOLD ? 180 : 0) + 'deg)';
    }
    function reset() {
      ease();
      pullEl.style.transform = 'translateY(0)';
      ind.classList.remove('rm-busy', 'rm-has-label');
      ind.style.opacity = '0';
      moveInd(0);
    }
    function finish() { if (arrow) arrow.className = 'fas fa-arrow-down'; busy = false; reset(); }

    content.addEventListener('touchstart', function (e) {
      // Only arm the gesture when the scroll is genuinely at the very top.
      if (busy || !atTop()) { active = false; return; }
      computeGapTop();
      startY = e.touches[0].clientY; active = true; dist = 0; noEase();
    }, { passive: true });

    content.addEventListener('touchmove', function (e) {
      if (!active) return;
      var raw = e.touches[0].clientY - startY;
      if (raw <= 0 || !atTop()) { active = false; reset(); return; }
      dist = raw * DAMP;
      drag(dist);
      if (raw > 6 && e.cancelable) e.preventDefault(); // suppress native overscroll while pulling
    }, { passive: false });

    content.addEventListener('touchend', function () {
      if (!active) return;
      active = false;
      if (dist >= THRESHOLD) {
        busy = true;
        if (arrow) arrow.className = 'fas fa-spinner';
        if (label) { labelEl.textContent = label; ind.classList.add('rm-has-label'); }
        ind.classList.add('rm-busy');
        ease();
        pullEl.style.transform = 'translateY(' + REST + 'px)';
        moveInd(REST);
        ind.style.opacity = '1';
        setTimeout(function () {
          var r;
          try { r = onRefresh(); } catch (e) { r = null; }
          if (r && typeof r.then === 'function') { r.then(finish, finish); }
          else { setTimeout(finish, 500); }
        }, 260);
      } else {
        reset();
      }
    }, { passive: true });
  }

  window.rmPullRefresh = init;
})();
