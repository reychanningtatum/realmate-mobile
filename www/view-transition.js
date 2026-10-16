/* Page-to-page view transitions (safe-area.css: @view-transition { navigation: auto })
 * are cosmetic. The browser cancels one it cannot finish — e.g. the viewport is
 * resized mid-navigation ("InvalidStateError: Transition was aborted because of
 * invalid state. Viewport size changed") — and rejects that transition's
 * promises. The page itself is unaffected (it simply appears without the
 * animation), but nothing owned those promises, so every cancellation surfaced
 * as an unhandled rejection in Bug Reports.
 *
 * Own them here. A cancelled/skipped animation is expected and dropped; any
 * other transition failure (e.g. a duplicate view-transition-name) is a real
 * bug and is re-thrown so it is still reported.
 *
 * Must load in <head> (not defer/async): `pagereveal` fires before first render.
 */
(function (global) {
  'use strict';
  function cancelled(err) {
    if (!err) return true;
    if (err.name === 'AbortError') return true;                       // skipTransition()
    return /transition was (aborted|skipped)/i.test(String(err.message || ''));
  }
  function own(t) {
    if (!t) return;
    ['ready', 'finished', 'updateCallbackDone'].forEach(function (k) {
      try {
        if (t[k] && typeof t[k].catch === 'function') {
          t[k].catch(function (err) { if (!cancelled(err)) throw err; });
        }
      } catch (e) {}
    });
  }
  global.rmOwnViewTransition = own;
  global.addEventListener('pagereveal', function (e) { own(e && e.viewTransition); });
  global.addEventListener('pageswap', function (e) { own(e && e.viewTransition); });
})(window);
