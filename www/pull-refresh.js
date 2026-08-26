/* pull-refresh.js — Facebook-style pull-to-refresh.
 *
 *   rmPullRefresh({ scroller: '.main-content', onRefresh: fn })
 *
 * A spinner tracks the finger while the user pulls DOWN from the very top of
 * the scroller; past the threshold it runs onRefresh (default: reload the page,
 * which re-fetches the latest posts). It only engages when the scroller is
 * already at scrollTop 0, so normal scrolling anywhere else is untouched.
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

    var THRESHOLD = 66, MAX = 92, DAMP = 0.5;

    if (!document.getElementById('rm-ptr-style')) {
      var st = document.createElement('style');
      st.id = 'rm-ptr-style';
      st.textContent =
        '.rm-ptr{position:fixed;left:50%;top:0;margin-left:-19px;z-index:9000;width:38px;height:38px;' +
        'border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,.20);display:flex;' +
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

    var startY = 0, active = false, dist = 0, busy = false;
    var arrow = ind.querySelector('i');

    function atTop() { return scroller.scrollTop <= 0; }
    function draw(d) {
      var y = Math.min(d, MAX);
      ind.style.transition = 'none';
      ind.style.opacity = y > 4 ? '1' : '0';
      ind.style.transform = 'translateY(' + (y - 52) + 'px)';
      if (arrow) arrow.style.transform = 'rotate(' + (d >= THRESHOLD ? 180 : 0) + 'deg)';
    }
    function snapBack() {
      ind.classList.remove('rm-spin');
      ind.style.transition = 'transform .24s ease, opacity .24s ease';
      ind.style.opacity = '0';
      ind.style.transform = 'translateY(-52px)';
    }

    scroller.addEventListener('touchstart', function (e) {
      if (busy || !atTop()) { active = false; return; }
      startY = e.touches[0].clientY; active = true; dist = 0;
    }, { passive: true });

    scroller.addEventListener('touchmove', function (e) {
      if (!active) return;
      var raw = e.touches[0].clientY - startY;
      if (raw <= 0 || !atTop()) { active = false; draw(0); return; }
      dist = raw * DAMP;
      draw(dist);
      if (raw > 6 && e.cancelable) e.preventDefault(); // suppress native overscroll while pulling
    }, { passive: false });

    scroller.addEventListener('touchend', function () {
      if (!active) return;
      active = false;
      if (dist >= THRESHOLD) {
        busy = true;
        ind.style.transition = 'transform .18s ease';
        ind.style.transform = 'translateY(' + (THRESHOLD - 18) + 'px)';
        ind.classList.add('rm-spin');
        setTimeout(function () { onRefresh(); }, 200);
      } else {
        snapBack();
      }
    }, { passive: true });
  }

  window.rmPullRefresh = init;
})();
