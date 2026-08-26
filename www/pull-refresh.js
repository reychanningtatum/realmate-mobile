/* pull-refresh.js — Facebook-style pull-to-refresh.
 *
 *   rmPullRefresh({ scroller: '.main-content', onRefresh: fn })
 *
 * When the scroller is at the very top and the user drags DOWN, the content
 * itself follows the finger (rubber-band) with a spinner above it. Past the
 * threshold it snaps to a loading position and runs onRefresh (default: reload,
 * which re-fetches the latest posts). Only engages at scrollTop 0, so normal
 * scrolling is untouched. Touch-only, so it is inert on desktop.
 */
(function () {
  'use strict';

  function init(opts) {
    opts = opts || {};
    var scroller = typeof opts.scroller === 'string'
      ? document.querySelector(opts.scroller) : opts.scroller;
    if (!scroller || scroller.__rmPtr) return;
    scroller.__rmPtr = true;
    var onRefresh = opts.onRefresh || function () { location.reload(); };

    var THRESHOLD = 70, MAX = 110, DAMP = 0.55, REST = 48, IND_BASE = 46;

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

    function atTop() { return scroller.scrollTop <= 0; }
    function noEase() { scroller.style.transition = 'none'; ind.style.transition = 'none'; }
    function ease() {
      scroller.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
      ind.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s';
    }
    function drag(pull) {
      var y = Math.min(pull, MAX);
      scroller.style.transform = 'translateY(' + y + 'px)';   // content follows finger
      ind.style.opacity = y > 6 ? '1' : '0';
      ind.style.transform = 'translateY(' + (y - IND_BASE) + 'px)';
      if (arrow) arrow.style.transform = 'rotate(' + (pull >= THRESHOLD ? 180 : 0) + 'deg)';
    }
    function reset() {
      ease();
      scroller.style.transform = 'translateY(0)';
      ind.classList.remove('rm-spin');
      ind.style.opacity = '0';
      ind.style.transform = 'translateY(-52px)';
    }

    scroller.addEventListener('touchstart', function (e) {
      if (busy || !atTop()) { active = false; return; }
      startY = e.touches[0].clientY; active = true; dist = 0; noEase();
    }, { passive: true });

    scroller.addEventListener('touchmove', function (e) {
      if (!active) return;
      var raw = e.touches[0].clientY - startY;
      if (raw <= 0 || !atTop()) { active = false; reset(); return; }
      dist = raw * DAMP;
      drag(dist);
      if (raw > 6 && e.cancelable) e.preventDefault();   // suppress native overscroll while pulling
    }, { passive: false });

    scroller.addEventListener('touchend', function () {
      if (!active) return;
      active = false;
      if (dist >= THRESHOLD) {
        busy = true;
        ease();
        scroller.style.transform = 'translateY(' + REST + 'px)';   // hold while refreshing
        ind.style.transform = 'translateY(' + (REST - IND_BASE) + 'px)';
        ind.style.opacity = '1';
        ind.classList.add('rm-spin');
        setTimeout(onRefresh, 320);
      } else {
        reset();
      }
    }, { passive: true });
  }

  window.rmPullRefresh = init;
})();
