/* app-shell.js — persistent app shell for the mobile bottom tabs.
 *
 * The bottom nav lives in app.html and is NEVER reloaded. Each tab is its own
 * existing page loaded in a cached <iframe>; switching tabs shows/hides frames
 * inside a SAME-document View Transition — no document swap, so there is no
 * whole-app blink and the nav bar stays continuously painted. Each page keeps
 * its own document + scripts, so all existing functionality is preserved.
 */
(function () {
  'use strict';

  var TABS = {
    home: 'home.html',
    chat: 'chat.html',
    portal: 'livemarket.html',
    notifications: 'notifications.html',
    me: 'dashboard.html'
  };

  var frames = {};      // tab -> iframe (kept alive after first load)
  var current = null;
  var host, loading;

  function setActive(tab) {
    document.querySelectorAll('.mob-nav-item[data-tab]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });
  }

  // Same-origin: hide the embedded page's OWN bottom nav (the shell provides
  // the persistent one) and drop its bottom padding. Injected before the frame
  // is revealed, so its nav never flashes.
  function injectEmbedCss(frame) {
    try {
      var d = frame.contentDocument;
      if (d && d.head && !d.getElementById('rm-embed-hide')) {
        d.head.insertAdjacentHTML('beforeend',
          '<style id="rm-embed-hide">.mobile-bottom-nav{display:none!important}' +
          'html,body{padding-bottom:0!important}</style>');
      }
    } catch (e) {}
  }

  function reveal(tab) {
    Object.keys(frames).forEach(function (k) {
      frames[k].classList.toggle('rm-active', k === tab);
    });
    current = tab;
    setActive(tab);
  }

  function withTransition(fn) {
    if (document.startViewTransition) document.startViewTransition(fn);
    else fn();
  }

  // tab: key in TABS. forceSrc: load a specific URL into that tab's frame
  // (used by the Me menu for Profile / Realmates / Settings).
  // Close the account/profile dropdown BEFORE the transition snapshot so it can
  // never linger over the newly selected tab.
  function closeNavMenu() {
    var m = document.getElementById('navMenu');
    if (m) m.classList.remove('open');
  }

  function go(tab, forceSrc) {
    if (!TABS[tab] && !forceSrc) return;
    closeNavMenu();
    if (tab === current && !forceSrc) return;

    var cached = frames[tab];
    if (cached && !forceSrc) { withTransition(function () { reveal(tab); }); return; }

    // (Re)create the frame and wait for first paint before revealing, so the
    // pan never animates in a blank/loading frame.
    if (cached) { try { host.removeChild(cached); } catch (e) {} delete frames[tab]; }
    if (loading) loading.classList.remove('rm-hide');

    var f = document.createElement('iframe');
    f.className = 'rm-frame';
    f.setAttribute('title', tab);
    f.addEventListener('load', function () {
      injectEmbedCss(f);
      if (loading) loading.classList.add('rm-hide');
      withTransition(function () { reveal(tab); });
    }, { once: true });
    f.src = forceSrc || TABS[tab];
    host.appendChild(f);
    frames[tab] = f;
  }

  // Public API used by the nav bar in app.html
  window.rmTab = function (tab) { if (TABS[tab]) go(tab); };
  window.rmMe = function (url) {
    var menu = document.getElementById('navMenu');
    if (menu) menu.classList.remove('open');
    go('me', url || TABS.me);
  };

  document.addEventListener('DOMContentLoaded', function () {
    host = document.getElementById('rmHost');
    loading = document.getElementById('rmLoading');
    var t = new URLSearchParams(location.search).get('tab');
    go(TABS[t] ? t : 'home');
  });
})();
