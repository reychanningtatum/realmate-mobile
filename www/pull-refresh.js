/* pull-refresh.js — Facebook-style pull-to-refresh.
 *
 *   rmPullRefresh({ scroller: '.main-content', onRefresh: fn })                       // element scrolls
 *   rmPullRefresh({ content: '.main-content', windowScroll: true, onRefresh: fn,      // page scrolls
 *                   label: 'Loading Portal' })
 *
 * At the very top of the scroll, dragging DOWN makes the content follow the
 * finger (rubber-band) with an indicator above it. Past the threshold it holds a
 * loading position, shows a spinner (+ optional label text) and runs onRefresh;
 * when that resolves it snaps back with the fresh data. onRefresh should REFRESH
 * DATA IN PLACE (not reload the page) so there is no empty-state / re-render
 * flash. The gesture only arms when the scroll is genuinely at the top — pass
 * windowScroll:true for pages whose BODY scrolls (Feed, Portal) so a drag while
 * scrolled down never triggers it. Touch-only.
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
    // Rest the indicator just BELOW this element (the page's top bar) so it lands
    // in the clear space between the bar and the first post instead of tucking
    // under the status bar / navbar. Measured live at the start of each pull, so
    // it tracks the safe-area inset and the real bar height on any device.
    var anchorSel = opts.anchor || null;
    var indTop = 0;
    function computeIndTop() {
      var a = anchorSel ? el(anchorSel) : null;
      var b = a ? a.getBoundingClientRect().bottom : 0;
      indTop = b > 0 ? Math.round(b) + 6 : 0;
    }

    var THRESHOLD = 72, MAX = 110, DAMP = 0.55, REST = 52, IND_BASE = 50;

    function scrollTop() {
      return winScroll ? (window.pageYOffset || document.documentElement.scrollTop || 0)
                       : (scrollEl.scrollTop || 0);
    }

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
    function noEase() { content.style.transition = 'none'; ind.style.transition = 'none'; }
    function ease() {
      content.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
      ind.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s';
    }
    function moveInd(y) { ind.style.transform = 'translate(-50%,' + (indTop + y) + 'px)'; }
    function drag(pull) {
      var y = Math.min(pull, MAX);
      content.style.transform = 'translateY(' + y + 'px)';
      ind.style.opacity = y > 6 ? '1' : '0';
      moveInd(y - IND_BASE);
      if (arrow) arrow.style.transform = 'rotate(' + (pull >= THRESHOLD ? 180 : 0) + 'deg)';
    }
    function reset() {
      ease();
      content.style.transform = 'translateY(0)';
      ind.classList.remove('rm-busy', 'rm-has-label');
      ind.style.opacity = '0';
      moveInd(-52);
    }
    function done() { busy = false; reset(); }

    content.addEventListener('touchstart', function (e) {
      // Only arm the gesture when the scroll is genuinely at the very top.
      if (busy || !atTop()) { active = false; return; }
      computeIndTop(); // where the indicator should land, below the top bar
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
        // Enter the loading state: spinner (+ optional label like "Loading Portal").
        if (arrow) arrow.className = 'fas fa-spinner';
        if (label) { labelEl.textContent = label; ind.classList.add('rm-has-label'); }
        ind.classList.add('rm-busy');
        ease();
        content.style.transform = 'translateY(' + REST + 'px)';
        moveInd(REST - IND_BASE);
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

    function finish() {
      if (arrow) arrow.className = 'fas fa-arrow-down';
      done();
    }
  }

  window.rmPullRefresh = init;
})();
