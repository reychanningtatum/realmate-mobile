/* pull-refresh.js — Facebook-style pull-to-refresh.
 *
 *   rmPullRefresh({ scroller: '.main-content', onRefresh: fn })          // element scrolls
 *   rmPullRefresh({ content: '.main-content', windowScroll: true, onRefresh: fn })  // page scrolls
 *
 * At the very top of the scroll, dragging DOWN makes the content follow the
 * finger (rubber-band) with a spinner above it. Past the threshold it holds a
 * loading position and runs onRefresh; when that resolves it snaps back with the
 * fresh data. onRefresh should REFRESH DATA IN PLACE (not reload the page) so
 * there is no empty-state / re-render flash. Only engages when the scroll is
 * genuinely at the top, so scrolling elsewhere never triggers it. Touch-only.
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

    var THRESHOLD = 72, MAX = 110, DAMP = 0.55, REST = 48, IND_BASE = 46;

    function scrollTop() {
      return winScroll ? (window.pageYOffset || document.documentElement.scrollTop || 0)
                       : (scrollEl.scrollTop || 0);
    }

    if (!document.getElementById('rm-ptr-style')) {
      var st = document.createElement('style');
      st.id = 'rm-ptr-style';
      st.textContent =
        '.rm-ptr{position:fixed;left:50%;top:0;margin-left:-19px;z-index:9000;width:38px;height:38px;' +
        'border-radius:50%;background:#fff;box-shadow:0 5px 18px rgba(15,23,42,.22);display:flex;' +
        'align-items:center;justify-content:center;color:#32cd32;font-size:15px;opacity:0;' +
        'transform:translateY(-52px);pointer-events:none;}' +
        '.rm-ptr i{transition:transform .18s ease;}' +
        '.rm-ptr.rm-spin i{animation:rm-ptr-spin .7s linear infinite;}' +
        '@keyframes rm-ptr-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    var ind = document.createElement('div');
    ind.className = 'rm-ptr';
    ind.innerHTML = '<i class="fas fa-arrow-down"></i>';
    document.body.appendChild(ind);
    var arrow = ind.querySelector('i');

    var startY = 0, active = false, dist = 0, busy = false;

    function atTop() { return scrollTop() <= 0; }
    function noEase() { content.style.transition = 'none'; ind.style.transition = 'none'; }
    function ease() {
      content.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
      ind.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s';
    }
    function drag(pull) {
      var y = Math.min(pull, MAX);
      content.style.transform = 'translateY(' + y + 'px)';
      ind.style.opacity = y > 6 ? '1' : '0';
      ind.style.transform = 'translateY(' + (y - IND_BASE) + 'px)';
      if (arrow) arrow.style.transform = 'rotate(' + (pull >= THRESHOLD ? 180 : 0) + 'deg)';
    }
    function reset() {
      ease();
      content.style.transform = 'translateY(0)';
      ind.classList.remove('rm-spin');
      ind.style.opacity = '0';
      ind.style.transform = 'translateY(-52px)';
    }
    function done() { busy = false; reset(); }

    content.addEventListener('touchstart', function (e) {
      // Only arm the gesture when the scroll is genuinely at the very top.
      if (busy || !atTop()) { active = false; return; }
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
        ease();
        content.style.transform = 'translateY(' + REST + 'px)';
        ind.style.transform = 'translateY(' + (REST - IND_BASE) + 'px)';
        ind.style.opacity = '1';
        ind.classList.add('rm-spin');
        setTimeout(function () {
          var r;
          try { r = onRefresh(); } catch (e) { r = null; }
          if (r && typeof r.then === 'function') { r.then(done, done); }
          else { setTimeout(done, 500); }
        }, 260);
      } else {
        reset();
      }
    }, { passive: true });
  }

  window.rmPullRefresh = init;
})();
