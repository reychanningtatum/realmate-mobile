/* rm-sound.js — RMSound
 * ONE shared, subtle UI-sound utility for realmate, consistent with the existing
 * Web-Audio-synthesized design already used by pull-refresh.js (playRefreshSound)
 * and livemarket.js (playMatchSound) — no audio assets to ship.
 *
 * Design goals (per the sound-feedback spec):
 *   • Single shared AudioContext for ALL these new sounds — no duplicate audio
 *     instances. (The two pre-existing per-file sounds are left untouched.)
 *   • Best-effort: any failure is swallowed so audio never disrupts an action.
 *   • Respects mobile autoplay rules: the context is resumed lazily inside the
 *     play() call, which only ever runs from a real user tap.
 *   • Built-in rapid-repeat guard so one tap can't emit the same sound twice
 *     (double handlers / re-renders / trailing click), addressing the
 *     "avoid multiple sounds firing from one tap" requirement.
 *
 * Named sounds:
 *   tap     — subtle blip for the listing completion buttons (Sold/Leased/Rented/Bought)
 *   react   — soft pop when a Feed reaction is successfully registered
 *   confirm — gentle two-note ascending chime when a Realmate/Follow request is accepted
 */
(function () {
  'use strict';
  var _ctx = null;
  var _last = {};   // sound name -> last play time (ms), for the rapid-repeat guard

  function ctx() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!_ctx) _ctx = new AC();
      if (_ctx.state === 'suspended') _ctx.resume();
      return _ctx;
    } catch (e) { return null; }
  }

  // Each tone builder gets the live context + a start time. Gains stay low
  // (~0.05–0.06 peak, roughly the same level as the existing refresh/match blips)
  // so nothing is louder than what realmate already plays.
  var TONES = {
    // Completion-button tap: one very short soft blip.
    tap: function (c, t) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(520, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.13);
    },
    // Feed reaction: soft quick pop with a small upward lift.
    react: function (c, t) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(500, t);
      o.frequency.exponentialRampToValueAtTime(760, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.18);
    },
    // Accept confirmation: gentle two-note ascending "success" (D5 -> A5).
    confirm: function (c, t) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(587, t);        // D5
      o.frequency.setValueAtTime(880, t + 0.10);  // -> A5
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.32);
    }
  };

  function play(name) {
    try {
      var fn = TONES[name];
      if (!fn) return;
      var now = (window.performance && performance.now) ? performance.now() : (+new Date());
      // Rapid-repeat guard: same sound within 60ms of itself = a duplicate
      // trigger (double handler / trailing click) — swallow it.
      if (_last[name] && (now - _last[name]) < 60) return;
      _last[name] = now;
      var c = ctx();
      if (!c) return;
      fn(c, c.currentTime);
    } catch (e) { /* best-effort; never disrupt the action */ }
  }

  window.RMSound = { play: play };
})();
