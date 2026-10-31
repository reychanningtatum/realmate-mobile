// rm-verified.js — the ONE place that draws professional-verification badges.
//
// Input is always profiles.verified_as ('salesperson' | 'broker' | null), which
// only an admin can set (admin-users `set-verification`, service role; the
// profile guard pins it for every client). Never pass a user-chosen or cached
// value. Unverified (null) draws nothing — there is no "Unverified" badge.
//
//   RMVerified.badge(as)  full badge (approved design) — Profile header
//   RMVerified.seal(as)   compact seal — next to a name (Feed, comments, Portal)
//   RMVerified.label(as)  "Verified Real Estate Salesperson" / "… Broker"
//   RMVerified.color(as)  the type's colour: green salesperson, blue broker
(function () {
  'use strict';
  var KINDS = {
    salesperson: { label: 'Verified Real Estate Salesperson', color: '#0f9d4f', img: 'images/badge-verified-salesperson.png' },
    broker:      { label: 'Verified Real Estate Broker',      color: '#1a6fe8', img: 'images/badge-verified-broker.png' }
  };
  function kind(as) { return Object.prototype.hasOwnProperty.call(KINDS, as) ? KINDS[as] : null; }

  // Scalloped seal + check, matching the seal in the approved badge design.
  var SEAL_PATH = (function () {
    var pts = [], n = 24, cx = 12, cy = 12;
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n - Math.PI / 2, r = i % 2 ? 9.6 : 11.2;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return 'M' + pts.join(' L') + ' Z';
  })();

  function label(as) { var k = kind(as); return k ? k.label : ''; }
  function color(as) { var k = kind(as); return k ? k.color : ''; }

  function seal(as, size) {
    var k = kind(as); if (!k) return '';
    var s = size || 16;
    // Label lives in attributes (title/aria-label), never as text, so code that
    // reads a name's textContent never picks up "Verified Real Estate …".
    return ' <span class="rm-verified-seal" role="img" aria-label="' + k.label + '" title="' + k.label + '"' +
      ' style="display:inline-flex;vertical-align:-0.15em;flex-shrink:0;">' +
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="' + SEAL_PATH + '" fill="' + k.color + '" stroke="' + k.color + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  }

  function badge(as, height) {
    var k = kind(as); if (!k) return '';
    var h = height || 44;
    return '<img class="rm-verified-badge" src="' + k.img + '" alt="' + k.label + '" title="' + k.label + '"' +
      ' height="' + h + '" style="height:' + h + 'px;width:auto;max-width:100%;display:block;" loading="lazy" decoding="async">';
  }

  window.RMVerified = { seal: seal, badge: badge, label: label, color: color };
})();
