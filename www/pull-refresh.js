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

  // Subtle "refresh" blip, synthesized via Web Audio (no asset to ship). Played
  // ONCE at the moment the refresh actually triggers — never during scrolling or
  // while merely pulling. The pull gesture is a user interaction, so audio is
  // allowed to start here. Soft sine with a quick pitch drop + short envelope;
  // low gain so it stays non-intrusive. One shared AudioContext, resumed lazily.
  var _actx = null;
  function playRefreshSound() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!_actx) _actx = new AC();
      if (_actx.state === 'suspended') _actx.resume();
      var t = _actx.currentTime;
      var o = _actx.createOscillator(), g = _actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(660, t);
      o.frequency.exponentialRampToValueAtTime(430, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); // ~ -23 dB peak: audible but gentle
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(g); g.connect(_actx.destination);
      o.start(t); o.stop(t + 0.22);
    } catch (e) { /* audio is best-effort; never disrupt the refresh */ }
  }

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
        // position:ABSOLUTE (page-anchored), not fixed: the indicator must stay in
        // its refresh area between the top controls and the first post. If it were
        // fixed to the viewport, scrolling down mid-refresh would leave it floating
        // in the MIDDLE of the screen; absolute makes it scroll away with the page
        // (and reappear when you scroll back / when we snap to top on finish).
        '.rm-ptr{position:absolute;left:50%;top:0;z-index:9000;height:38px;min-width:38px;' +
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
    function finish() {
      if (arrow) arrow.className = 'fas fa-arrow-down';
      busy = false;
      reset();
      // Refresh complete → return to the TOPMOST item so the user always sees the
      // freshly-loaded content, even if they scrolled down while it was loading.
      try {
        if (winScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (scrollEl && scrollEl.scrollTo) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {}
    }

    content.addEventListener('touchstart', function (e) {
      // Only arm the gesture when the scroll is genuinely at the very top.
      if (busy || !atTop()) { active = false; return; }
      // Never hijack a tap that lands on an interactive control (a post's kebab
      // menu, an open menu, buttons, links, the swipe row, form fields). Arming
      // the pull there would preventDefault the move and swallow the tap — which
      // made the Portal/Feed post menus feel dead and could kick off a refresh.
      var t = e.target;
      if (t && t.closest && t.closest(
        'button, a, input, textarea, select,' +
        '.lc-menu-wrap, .lc-menu, .lc-swipe-actions, .hf-post-menu, .hf-post-menu-btn')) {
        active = false; return;
      }
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
        playRefreshSound();                 // subtle blip — only when refresh truly triggers
        if (arrow) arrow.className = 'fas fa-spinner';
        if (label) { labelEl.textContent = label; ind.classList.add('rm-has-label'); }
        ind.classList.add('rm-busy');
        ease();
        pullEl.style.transform = 'translateY(' + REST + 'px)';
        moveInd(REST);
        ind.style.opacity = '1';
        setTimeout(function () {
          // The spinner must NEVER hang. onRefresh (e.g. loadLedger) awaits
          // network calls that can occasionally stall with no timeout of their
          // own — if its promise never settles, the old code left the indicator
          // spinning forever and, because `busy` stayed true, disabled the whole
          // gesture. Settle on whichever comes first: onRefresh finishing, or a
          // hard safety cap. `done` is idempotent so it can only finish once.
          var settled = false;
          function done() { if (settled) return; settled = true; finish(); }
          var r;
          try { r = onRefresh(); } catch (e) { r = null; }
          if (r && typeof r.then === 'function') { r.then(done, done); }
          else { setTimeout(done, 500); }
          setTimeout(done, 7000); // safety cap: guarantees the spinner clears
        }, 260);
      } else {
        reset();
      }
    }, { passive: true });

    // iOS/WKWebView can fire touchcancel when the system takes over the gesture
    // (e.g. a fast tab re-tap then pull). Without handling it, the drag state was
    // left armed and the indicator hung showing only the arrow, never resetting
    // (#9). Treat a cancel like an under-threshold release: snap everything back.
    content.addEventListener('touchcancel', function () {
      if (!active) return;
      active = false;
      reset();
    }, { passive: true });
  }

  window.rmPullRefresh = init;
})();
