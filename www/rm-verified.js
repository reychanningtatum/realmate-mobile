// rm-verified.js — the ONE place that draws professional-verification badges.
//
// Input is always profiles.verified_as ('salesperson' | 'broker' | null), which
// only an admin can set (admin-users `set-verification`, service role; the
// profile guard pins it for every client). Never pass a user-chosen or cached
// value. Unverified (null) draws nothing — there is no "Unverified" badge.
//
//   RMVerified.badge(as)  full badge (approved design) — Profile header
//   RMVerified.seal(as)   compact REB / RES tag — next to a name (Profile, Portal)
//   RMVerified.label(as)  "Verified Real Estate Salesperson" / "… Broker"
//   RMVerified.color(as)  the type's colour: green salesperson, blue broker
(function () {
  'use strict';
  var KINDS = {
    salesperson: { label: 'Verified Real Estate Salesperson', code: 'RES', color: '#0f9d4f', img: 'images/badge-verified-salesperson.png' },
    broker:      { label: 'Verified Real Estate Broker',      code: 'REB', color: '#1a6fe8', img: 'images/badge-verified-broker.png' }
  };
  function kind(as) { return Object.prototype.hasOwnProperty.call(KINDS, as) ? KINDS[as] : null; }

  function label(as) { var k = kind(as); return k ? k.label : ''; }
  function color(as) { var k = kind(as); return k ? k.color : ''; }

  // The short code (REB / RES) is drawn by CSS (::after content from data-code),
  // never as page text, so code that reads a name's textContent never picks up
  // the code. One shared rule, added once per page.
  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('rm-verified-style')) return;
    var st = document.createElement('style');
    st.id = 'rm-verified-style';
    st.textContent = '.rm-verified-seal.rm-code::after{content:attr(data-code)}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Compact tag beside a name: solid type colour, white check + REB / RES.
  // size = the name's icon size (14 Portal card, 24 Profile).
  function seal(as, size) {
    var k = kind(as); if (!k) return '';
    ensureStyle();
    var s = size || 16;
    var h = Math.max(15, Math.round(s * 0.8));       // tag height
    var f = Math.round(h * 0.6 * 10) / 10;           // code font size
    var c = Math.round(h * 0.72);                    // check size
    // Label lives in attributes (title/aria-label), never as text.
    return ' <span class="rm-verified-seal rm-code" role="img" data-code="' + k.code + '" aria-label="' + k.label + '" title="' + k.label + '"' +
      ' style="display:inline-flex;align-items:center;gap:' + Math.round(h * 0.12) + 'px;box-sizing:border-box;height:' + h + 'px;' +
      'padding:0 ' + Math.round(h * 0.32) + 'px 0 ' + Math.round(h * 0.22) + 'px;border-radius:' + Math.round(h * 0.28) + 'px;' +
      'background:' + k.color + ';color:#fff;font:700 ' + f + 'px/1 Inter,system-ui,-apple-system,sans-serif;letter-spacing:.05em;' +
      'white-space:nowrap;vertical-align:middle;flex-shrink:0;">' +
      '<svg width="' + c + '" height="' + c + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M5.5 12.5l4.2 4.2 8.8-9.4" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  }

  function badge(as, height) {
    var k = kind(as); if (!k) return '';
    var h = height || 44;
    return '<img class="rm-verified-badge" src="' + k.img + '" alt="' + k.label + '" title="' + k.label + '"' +
      ' height="' + h + '" style="height:' + h + 'px;width:auto;max-width:100%;display:block;" loading="lazy" decoding="async">';
  }

  window.RMVerified = { seal: seal, badge: badge, label: label, color: color };
})();
