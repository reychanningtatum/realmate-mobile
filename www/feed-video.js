/* feed-video.js — Feed video autoplay + global mute control (desktop + mobile).
 *
 * Behaviour (see the Feed video spec):
 *  • The most-visible Feed video autoplays; it pauses when it scrolls out of view
 *    and the next visible one takes over — only ONE video ever plays at a time.
 *  • Every video gets a Mute/Unmute button in the lower-right corner.
 *  • Mute is a single SESSION preference, not per-video: muting/unmuting any video
 *    applies to all of them, and only the ACTIVE video can carry audio (never two
 *    at once). The INITIAL state comes from Settings (localStorage
 *    rm_feed_video_sound: 'on' | 'muted', default muted); a manual tap overrides it
 *    for the rest of the session and is respected as you scroll.
 *
 * Video/player STATE is the source of truth here — the button only reflects it.
 * Exposes window.RMFeedVideo.{ scan, applyPref }.
 */
(function () {
  var PREF_KEY = 'rm_feed_video_sound';           // Settings default: 'on' | 'muted'
  var _override = null;                            // session choice: true=muted,false=unmuted,null=use Settings

  function settingWantsMuted() {
    try { return localStorage.getItem(PREF_KEY) !== 'on'; } catch (e) { return true; }
  }
  // The current desired MUTE preference for the Feed (Settings default unless the
  // user has tapped a mute button this session).
  function wantMuted() { return _override == null ? settingWantsMuted() : _override; }

  var _recs = [];        // [{ v, wrap, btn, ratio }]
  var _active = null;    // the <video> currently allowed to play
  var _io = null;

  function findRec(v) { for (var i = 0; i < _recs.length; i++) if (_recs[i].v === v) return _recs[i]; return null; }

  function paintBtn(rec) {
    if (!rec.btn) return;
    var m = wantMuted();                            // buttons reflect the GLOBAL preference
    rec.btn.innerHTML = '<i class="fas ' + (m ? 'fa-volume-xmark' : 'fa-volume-high') + '"></i>';
    rec.btn.classList.toggle('is-on', !m);
    rec.btn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  }

  // Enforce the invariant: only the ACTIVE video may carry audio, and only when the
  // preference is unmuted; every other video stays muted.
  function applyPref() {
    var muted = wantMuted();
    _recs.forEach(function (rec) {
      rec.v.muted = !(!muted && rec.v === _active);
      paintBtn(rec);
    });
  }

  function playActive() {
    if (!_active) return;
    _active.muted = wantMuted() ? true : false;
    var p;
    try { p = _active.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () {
      // Autoplay WITH sound was blocked (browser/iOS) — fall back to muted so the
      // video still plays; never force audio where it isn't permitted.
      try { _active.muted = true; _active.play(); } catch (e) {}
      applyPref();
    });
  }

  function setActive(v) {
    if (_active === v) { playActive(); return; }
    if (_active) { try { _active.pause(); } catch (e) {} }
    _active = v || null;
    playActive();
    applyPref();
  }

  function pickBestVisible() {
    var best = null, bestR = 0.55;                  // require ≥55% on screen to take over
    _recs.forEach(function (rec) { if ((rec.ratio || 0) >= bestR) { best = rec.v; bestR = rec.ratio; } });
    return best;
  }

  function io() {
    if (_io) return _io;
    _io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var rec = findRec(en.target); if (!rec) return;
        rec.ratio = en.intersectionRatio;
        // Meaningfully off screen → pause it (and drop active if it was the one).
        if (en.intersectionRatio < 0.25) {
          try { en.target.pause(); } catch (e) {}
          if (_active === en.target) _active = null;
        }
      });
      var best = pickBestVisible();
      if (best) setActive(best);
    }, { threshold: [0, 0.25, 0.55, 0.8, 1] });
    return _io;
  }

  function register(v) {
    if (!v || v.__rmfv) return; v.__rmfv = true;
    // Player defaults required for reliable muted autoplay on desktop AND iOS.
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.removeAttribute('controls');                  // custom mute button replaces native controls

    var wrap = (v.closest && v.closest('.hf-video-wrap')) || v.parentElement;
    if (wrap) wrap.classList.add('hf-video-wrap');
    var btn = wrap ? wrap.querySelector('.hf-video-mute') : null;
    if (wrap && !btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'hf-video-mute';
      wrap.appendChild(btn);
    }

    var rec = { v: v, wrap: wrap, btn: btn, ratio: 0 };
    _recs.push(rec);

    if (btn) {
      var onTap = function (e) {
        e.preventDefault(); e.stopPropagation();
        _override = !wantMuted();                   // flip the GLOBAL preference
        if (!_override) setActive(v);               // unmuting → this video becomes the one with sound
        applyPref();
      };
      btn.addEventListener('click', onTap);
    }
    // Tapping the video toggles play/pause without affecting sound state.
    v.addEventListener('click', function (e) {
      if (btn && (e.target === btn || (btn.contains && btn.contains(e.target)))) return;
      if (v.paused) { setActive(v); } else { try { v.pause(); } catch (er) {} if (_active === v) _active = null; }
    });

    paintBtn(rec);
    io().observe(v);
  }

  // Register any not-yet-wired Feed videos under `root` (call after each render).
  function scan(root) {
    root = root || document;
    var list = (root.querySelectorAll) ? root.querySelectorAll('video.hf-feed-video') : [];
    Array.prototype.forEach.call(list, register);
    // Kick an initial pick in case videos are already on screen.
    if (_io) requestAnimationFrame(function () { var b = pickBestVisible(); if (b) setActive(b); });
  }

  // Pause audio/playback when the tab or app goes to the background.
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && _active) { try { _active.pause(); } catch (e) {} }
    });
  } catch (e) {}

  window.RMFeedVideo = { scan: scan, applyPref: applyPref };
})();
