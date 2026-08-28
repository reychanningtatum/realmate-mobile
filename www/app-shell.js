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
  var prevTab = null;   // the tab we came from, for in-shell "back" (see rmBack)
  var host, loading;

  // ── Safe-area threading ─────────────────────────────────────────────────
  // The status bar overlays the webview (see native-statusbar.js), so this
  // SHELL — the top-level document — sees the true env(safe-area-inset-top).
  // iOS does NOT propagate that inset into nested iframes, so each tab reads
  // var(--rm-safe-top, env(...)) and would otherwise fall back to 0 and tuck its
  // header under the status bar. Measure the real inset here and push it into
  // every frame. Entirely inert (0px) on devices/web without a top inset.
  var _insetProbe = null;
  function topInset() {
    try {
      if (!_insetProbe) {
        _insetProbe = document.createElement('div');
        _insetProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding-top:env(safe-area-inset-top);';
        document.body.appendChild(_insetProbe);
      }
      return _insetProbe.offsetHeight || 0;
    } catch (e) { return 0; }
  }
  function threadSafeArea(f) {
    try {
      var root = f && f.contentDocument && f.contentDocument.documentElement;
      if (root) root.style.setProperty('--rm-safe-top', topInset() + 'px');
    } catch (e) {}
  }
  window.addEventListener('resize', function () {
    _insetProbe = null;                       // remeasure after orientation change
    for (var t in frames) if (frames[t]) threadSafeArea(frames[t]);
  });

  function setActive(tab) {
    document.querySelectorAll('.mob-nav-item[data-tab]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });
  }

  // Same-origin: hide the embedded page's OWN bottom nav (the shell provides
  // the persistent one) and drop its bottom padding. Injected before the frame
  // is revealed, so its nav never flashes.
  function injectEmbedCss(frame) {
    var d;
    try { d = frame.contentDocument; } catch (e) { return; }
    if (!d) return;
    try {
      if (d.head && !d.getElementById('rm-embed-hide')) {
        d.head.insertAdjacentHTML('beforeend',
          '<style id="rm-embed-hide">.mobile-bottom-nav{display:none!important}' +
          'html,body{padding-bottom:0!important}</style>');
      }
    } catch (e) {}
    // A tap INSIDE the tab content can't reach the shell document, so the
    // account dropdown never closes on outside-tap. Wire it from here so any
    // interaction with the page also closes the shell menu. Re-armed on every
    // load (the doc is new after a pull-to-refresh reload).
    try {
      if (!d.__rmMenuClose) {
        d.__rmMenuClose = true;
        d.addEventListener('touchstart', closeNavMenu, { capture: true, passive: true });
        d.addEventListener('click', closeNavMenu, true);
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

  // Scroll a tab's already-loaded content back to the very top, without
  // reloading or changing anything. Covers both window-scrolled pages (Portal)
  // and inner-scroller pages (Feed's .main-content). For Portal this lands on
  // the topmost item of whatever sub-tab (Live Market / My Listings / AI
  // Matches) is currently active — the sub-tab is never changed.
  function scrollFrameTop(tab) {
    var f = frames[tab];
    if (!f) return;
    try {
      if (f.contentWindow) f.contentWindow.scrollTo({ top: 0, behavior: 'smooth' });
      var d = f.contentDocument;
      if (d) d.querySelectorAll('.main-content, .feed, .chat-messages').forEach(function (el) {
        if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (e) {}
  }

  // Is this frame's iframe currently on a SUB-PAGE (navigated away from the tab
  // root — e.g. Portal → a listing detail)? Read the LIVE pathname rather than
  // the cached f.__subpage flag: a bfcache "back" restores the root without
  // firing 'load', so the flag can go stale. Reading it fresh keeps both the
  // tab-reveal pop (#6) and rmBack from over-popping.
  function onSubpage(f) {
    if (!f) return false;
    try {
      var cur = f.contentWindow.location.pathname.split('/').pop();
      return !!(f.__root && cur && cur !== f.__root);
    } catch (e) { return !!(f && f.__subpage); }
  }

  function go(tab, forceSrc) {
    if (!TABS[tab] && !forceSrc) return;
    closeNavMenu();
    // Re-tapping the tab you're already on returns it to the top (Portal: the
    // top of the active sub-tab) rather than doing nothing. Listing Detail is
    // internal iframe navigation, so open-listing-then-back keeps its own scroll
    // position and is unaffected by this.
    if (tab === current && !forceSrc) { scrollFrameTop(tab); return; }
    // Remember where we came from so an in-shell "Back" (rmBack) can return
    // there — e.g. Portal → Profile → Back should land on Portal, not the
    // browser history (which can walk back to the marketing page).
    if (current && current !== tab) prevTab = current;

    var cached = frames[tab];
    if (cached && !forceSrc) {
      // Re-entering a tab whose iframe wandered onto a sub-page (e.g. Portal →
      // a listing detail, then off to Feed and back): pop it back to its root
      // view first so the tab never reappears showing a stale sub-page (#6).
      // The iframe's own history + bfcache restore the root at the exact
      // scroll/post the user left — no reload flash.
      if (onSubpage(cached)) { try { cached.contentWindow.history.back(); } catch (e) {} }
      withTransition(function () { reveal(tab); });
      return;
    }

    // Uncached (or forced reload): hide the CURRENT tab immediately so its
    // content (e.g. the profile view) can never linger over the loading state
    // or the newly selected tab. Then pan the new frame in once it has painted.
    if (cached) { try { host.removeChild(cached); } catch (e) {} delete frames[tab]; }
    if (current && frames[current]) frames[current].classList.remove('rm-active');
    current = null;
    setActive(tab);
    if (loading) loading.classList.remove('rm-hide');

    var f = document.createElement('iframe');
    f.className = 'rm-frame';
    f.setAttribute('title', tab);
    // The page the shell loaded as this tab's ROOT (filename only). When the
    // iframe later navigates internally (Portal → a listing detail or a user's
    // profile), its filename differs from this — that's how rmBack knows whether
    // "back" means "return within the iframe" vs "go to the previous tab".
    f.__root = (forceSrc || TABS[tab]).split('?')[0].split('/').pop();
    // Every load (incl. internal navigation + pull-to-refresh reloads): re-hide
    // the embedded nav, re-arm the menu-close listeners, and note whether the
    // iframe is now on a sub-page (navigated away from its root).
    f.addEventListener('load', function () {
      injectEmbedCss(f);
      threadSafeArea(f);   // pass the device's real top inset into the iframe
      try {
        var cur = f.contentWindow.location.pathname.split('/').pop();
        f.__subpage = !!(f.__root && cur && cur !== f.__root);
      } catch (e) {}
    });
    // Once: reveal the frame after its first paint.
    f.addEventListener('load', function () {
      if (loading) loading.classList.add('rm-hide');
      withTransition(function () { reveal(tab); });
    }, { once: true });
    f.src = forceSrc || TABS[tab];
    host.appendChild(f);
    frames[tab] = f;
  }

  // Public API used by the nav bar in app.html
  window.rmTab = function (tab) { if (TABS[tab]) go(tab); };
  // Open a tab AND switch the shell to it, loading a specific URL — used by
  // embedded pages to jump to another tab with context (e.g. Portal "Send
  // Message" → the real Chat tab). This keeps the bottom-nav highlight and the
  // shown page in sync (the requested tab is activated, not left underneath).
  window.rmOpen = function (tab, url) { if (TABS[tab]) go(tab, url || TABS[tab]); };
  // In-shell "Back": return to the tab we came from (Profile → Portal, etc.).
  // Called by goBack() in embedded pages instead of history.back(), which in the
  // shared session history could jump to the marketing page.
  window.rmBack = function () {
    // If the current tab's iframe navigated to a sub-page (Portal → listing
    // detail / a user's profile), "back" returns within that iframe to its
    // previous page. Only when it's on the tab ROOT do we fall back to the
    // previous TAB (Me → Profile → Portal) — never the shared browser history,
    // which can walk back to the marketing page.
    var f = frames[current];
    if (onSubpage(f)) { try { f.contentWindow.history.back(); return; } catch (e) {} }
    go(prevTab && TABS[prevTab] ? prevTab : 'home');
  };
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
