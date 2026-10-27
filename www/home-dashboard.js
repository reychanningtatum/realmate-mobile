/* home-dashboard.js — DRAFT Home dashboard (staging only; replaces the Feed there).
 *
 * Read-only. Everything shown comes from the same data and the same rules the
 * Portal uses:
 *  - listings: archived=false, not sold, visible to this viewer (RMVisibility),
 *    owner not deactivated (RMDeact), not blocked (RMBR), owner not a hidden
 *    system account (profiles.is_hidden);
 *  - post details (place, unit, price, budget) are read by the shared engine
 *    (RM_MATCH.parseListing), never by a second parser here;
 *  - AI matches: this user's own ai_matches rows that are not dismissed.
 * Requirements = WILLING TO BUY / WILLING TO LEASE. Listings = FOR SALE / FOR LEASE / FOR RENT.
 */
(function () {
  'use strict';

  var sb = window.supabase.createClient(window.RM_ENV.url, window.RM_ENV.anonKey);
  var DAY = 864e5, WEEK = 7 * DAY;
  var REQ = { 'WILLING TO BUY': 'buy', 'WILLING TO LEASE': 'lease' };
  var LST = { 'FOR SALE': 'sale', 'FOR LEASE': 'lease', 'FOR RENT': 'lease' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cat(l) { return String(l.category || '').toUpperCase().trim(); }

  // ₱24M · ₱1.2B · ₱500K · ₱8,500
  function peso(n) {
    if (n == null || !isFinite(n) || n <= 0) return '';
    var f = function (v, s) { return '₱' + (Math.round(v * 10) / 10).toLocaleString('en-PH') + s; };
    if (n >= 1e9) return f(n / 1e9, 'B');
    if (n >= 1e6) return f(n / 1e6, 'M');
    if (n >= 1e4) return f(n / 1e3, 'K');
    return '₱' + Math.round(n).toLocaleString('en-PH');
  }
  function ago(ts) {
    var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    var d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function parse(l) {
    try { return window.RM_MATCH ? RM_MATCH.parseListing(l) : null; } catch (e) { return null; }
  }
  function img(l) {
    var a = l.image_urls;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = null; } }
    return l.cover_image_url || (Array.isArray(a) && a[0]) || l.image_url || '';
  }
  // Same simple floor-area read the Portal's card uses (livemarket.js _xSqm).
  function sqm(text) {
    var m = String(text || '').match(/(\d[\d,.]*)\s*(?:sqm|sq\.?\s*m)/i);
    var v = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
    return v > 0 ? v : null;
  }
  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
  }

  // ── Navigation (inside the app shell → shell tabs; standalone → in place) ──
  function shell() { try { return window.parent !== window && window.parent.rmOpen ? window.parent : null; } catch (e) { return null; } }
  window.hdOpenTab = function (tab, url) {
    var p = shell();
    if (p) p.rmOpen(tab, url); else location.href = url;
  };
  window.hdOpenPortal = function (seg) {
    try { localStorage.setItem('rm_portal_tab', seg || 'MARKET'); } catch (e) {}
    var p = shell();
    // A fresh load so the Portal reads the tab choice (same as a match notification).
    if (p) p.rmOpen('portal', 'livemarket.html?hd=' + Date.now()); else location.href = 'livemarket.html';
  };
  window.hdOpenListing = function (id) {
    var url = 'listing-detail.html?id=' + encodeURIComponent(id);
    var p = shell();
    if (p) p.rmOpen('me', url); else location.href = url;
  };

  // ── Header ──
  function header(me) {
    var u = {};
    try { u = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (e) {}
    var name = String(u.name || u.full_name || (me && me.full_name) || '').trim().split(/\s+/)[0] || '';
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('hdGreet').textContent = part + (name ? ', ' + name + '.' : '.');
    var av = (me && me.avatar_url) || u.image || '';
    var el = $('hdAvatar');
    if (av) el.style.backgroundImage = 'url("' + av.replace(/"/g, '%22') + '")';
    else el.textContent = (name[0] || 'R').toUpperCase();
  }

  // ── Data ──
  async function waitFor(test, ms) {
    var t0 = Date.now();
    while (!test() && Date.now() - t0 < ms) await new Promise(function (r) { setTimeout(r, 100); });
  }

  async function load() {
    var me = (await sb.auth.getUser()).data.user;
    if (!me) return;
    var myId = String(me.id);

    var res = await Promise.all([
      sb.from('listings').select('*').eq('archived', false).order('created_at', { ascending: false }).limit(1000),
      sb.from('ai_matches').select('matched_listing_id,score,first_shown_at,last_shown_at')
        .eq('user_id', me.id).is('dismissed_at', null).order('score', { ascending: false }).limit(50),
      sb.from('profiles').select('full_name,avatar_url').eq('id', me.id).maybeSingle()
    ]);
    if (res[0].error) throw res[0].error;
    header(res[2].data);

    var rows = (res[0].data || []).filter(function (l) { return String(l.status || '').toLowerCase() !== 'sold'; });

    // Visibility Controls (same rule as the Portal).
    if (window.RMVisibility) {
      var unlocked = await RMVisibility.fetchUnlockedOwnerIds(sb, me.id);
      rows = rows.filter(function (l) { return RMVisibility.visibleToViewer(l, me.id, unlocked); });
    }
    var owners = Array.from(new Set(rows.map(function (l) { return l.user_id; }).filter(Boolean)));
    // Deactivated owners.
    if (window.RMDeact && owners.length) {
      var gone = await RMDeact.deactivatedSet(owners);
      rows = rows.filter(function (l) { return !l.user_id || !gone.has(String(l.user_id)); });
    }
    // Hidden system accounts + live author names/avatars.
    var byId = {};
    if (owners.length) {
      var pr = await sb.from('profiles').select('id,full_name,avatar_url,is_hidden').in('id', owners);
      (pr.data || []).forEach(function (p) { byId[p.id] = p; });
      rows = rows.filter(function (l) { return !(byId[l.user_id] && byId[l.user_id].is_hidden); });
    }
    // Blocks (wait briefly for the shared block state to load).
    if (window.RMBR) {
      await waitFor(function () { return RMBR.ready; }, 2500);
      rows = rows.filter(function (l) { return !(RMBR.isBlocked(l.user_id) || RMBR.isPostBlocked('listing', l.id)); });
    }
    rows.forEach(function (l) {
      var p = byId[l.user_id];
      if (p && p.full_name) l.user_name = p.full_name;
      l._p = parse(l);
    });

    var others = rows.filter(function (l) { return String(l.user_id) !== myId; });
    var reqs = others.filter(function (l) { return REQ[cat(l)]; });
    var lsts = others.filter(function (l) { return LST[cat(l)]; });

    overview(reqs, lsts, rows, res[1].data || []);
    hotRequirements(reqs);
    aiMatches(res[1].data || [], rows);
    pulse(rows);
  }

  // ── 1. Market overview ──
  function setStat(nId, dId, n, d) {
    $(nId).textContent = n;
    var e = $(dId);
    if (d) { e.textContent = '+' + d; e.hidden = false; } else e.hidden = true;
  }
  function value(l) {
    var p = l._p; if (!p) return 0;
    var v = (p.budget && p.budget.max) || p.price;
    return v > 0 && isFinite(v) ? v : 0;
  }
  function overview(reqs, lsts, all, matches) {
    var now = Date.now();
    var inWeek = function (l) { return now - new Date(l.created_at).getTime() < WEEK; };
    var today = function (l) { return now - new Date(l.created_at).getTime() < DAY; };
    setStat('hdReqN', 'hdReqD', reqs.filter(inWeek).length, reqs.filter(today).length);
    setStat('hdLstN', 'hdLstD', lsts.filter(inWeek).length, lsts.filter(today).length);
    var visible = new Set(all.map(function (l) { return String(l.id); }));
    var live = matches.filter(function (m) { return visible.has(String(m.matched_listing_id)); });
    setStat('hdAiN', 'hdAiD', live.length, live.filter(function (m) { return m.first_shown_at && now - new Date(m.first_shown_at).getTime() < DAY; }).length);
    var open = reqs.concat(lsts);
    var total = open.reduce(function (s, l) { return s + value(l); }, 0);
    var added = open.filter(today).reduce(function (s, l) { return s + value(l); }, 0);
    $('hdOppN').textContent = peso(total) || '₱0';
    var e = $('hdOppD');
    if (added) { e.textContent = '+' + peso(added); e.hidden = false; } else e.hidden = true;
  }

  // ── 2. Hot requirements ──
  function unitLabel(p) {
    if (!p) return '';
    var t = (p.unitTypes && p.unitTypes[0]) || '';
    if (p.unit && /\d\s*BR|studio/i.test(p.unit)) return p.unit + (/bedroom/i.test(t) || !t ? '' : ' ' + t);
    return t || p.unit || '';
  }
  function budgetLabel(p, lease) {
    if (!p) return '';
    if (p.budgetOpen) return 'Open budget';
    var b = p.budget, s = '';
    if (b && b.min && b.max && b.max > b.min) s = peso(b.min) + ' – ' + peso(b.max);
    else s = peso((b && (b.max || b.min)) || p.price);
    return s ? s + (lease ? ' / month' : '') : '';
  }
  function hotRequirements(reqs) {
    var rail = $('hdReqRail');
    var list = reqs.slice(0, 10);
    if (!list.length) { rail.innerHTML = empty('fa-user', 'No requirements posted yet.'); return; }
    rail.innerHTML = list.map(function (l) {
      var lease = REQ[cat(l)] === 'lease', p = l._p || {};
      var place = (p.locations && p.locations[0]) || p.project || 'Location not stated';
      var unit = unitLabel(p), money = budgetLabel(p, lease);
      return '<article class="hd-req" onclick="hdOpenListing(' + JSON.stringify(String(l.id)).replace(/"/g, '&quot;') + ')">' +
        '<span class="hd-tag ' + (lease ? 'hd-tag-lease' : 'hd-tag-buy') + '"><i class="fas ' + (lease ? 'fa-key' : 'fa-tag') + '"></i> Looking to ' + (lease ? 'lease' : 'buy') + '</span>' +
        '<h3>' + esc(place) + '</h3>' +
        (unit ? '<p class="hd-req-unit">' + esc(unit) + '</p>' : '') +
        (money ? '<p class="hd-req-money">' + esc(money) + '</p>' : '') +
        '<p class="hd-req-by"><i class="far fa-user"></i> ' + esc(l.is_anonymous ? 'Anonymous' : (l.user_name || 'realmate member')) + '</p>' +
        '<p class="hd-req-time">Posted ' + esc(ago(l.created_at)) + '</p>' +
        '</article>';
    }).join('');
  }

  // ── 3. AI matches ──
  function aiMatches(matches, all) {
    var rail = $('hdAiRail');
    var byId = {};
    all.forEach(function (l) { byId[String(l.id)] = l; });
    var seen = {}, list = [];
    matches.forEach(function (m) {
      var l = byId[String(m.matched_listing_id)];
      if (l && !seen[l.id]) { seen[l.id] = 1; list.push({ m: m, l: l }); }
    });
    if (!list.length) {
      rail.innerHTML = empty('fa-wand-magic-sparkles', 'No AI matches yet. Post a listing or requirement in the Portal and Nexus will find matches for you.');
      return;
    }
    rail.innerHTML = list.slice(0, 10).map(function (x) {
      var l = x.l, p = l._p || {}, src = img(l);
      var lease = LST[cat(l)] === 'lease' || REQ[cat(l)] === 'lease';
      var title = p.project || unitLabel(p) || cat(l);
      var place = (p.locations && p.locations.join(', ')) || '';
      var money = REQ[cat(l)] ? budgetLabel(p, lease) : (peso(p.price) + (lease && p.price ? ' / month' : ''));
      var area = sqm(l.content);
      return '<article class="hd-match" onclick="hdOpenListing(' + JSON.stringify(String(l.id)).replace(/"/g, '&quot;') + ')">' +
        '<div class="hd-match-img"' + (src ? ' style="background-image:url(&quot;' + esc(src) + '&quot;)"' : '') + '>' +
        (src ? '' : '<i class="fas fa-building"></i>') +
        '<span class="hd-score">' + Math.round(Number(x.m.score) || 0) + '% Match</span></div>' +
        '<div class="hd-match-body"><h3>' + esc(title) + '</h3>' +
        (place ? '<p class="hd-match-place">' + esc(place) + '</p>' : '') +
        (money ? '<p class="hd-match-money">' + esc(money) + '</p>' : '') +
        '<p class="hd-match-meta">' + (p.unit ? '<span><i class="fas fa-bed"></i> ' + esc(p.unit) + '</span>' : '') +
        (area ? '<span><i class="fas fa-ruler-combined"></i> ' + area.toLocaleString('en-PH') + ' sqm</span>' : '') + '</p>' +
        '</div></article>';
    }).join('');
  }

  // ── 4. Market pulse (median asking price per area, FOR SALE posts) ──
  function spark(points) {
    if (points.length < 3) return '';
    var min = Math.min.apply(null, points), max = Math.max.apply(null, points), span = max - min || 1;
    var d = points.map(function (v, i) {
      return (i ? 'L' : 'M') + (i * 100 / (points.length - 1)).toFixed(1) + ',' + (26 - (v - min) / span * 22).toFixed(1);
    }).join(' ');
    return '<svg class="hd-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function pulse(all) {
    var rail = $('hdPulseRail');
    var groups = {};
    all.forEach(function (l) {
      if (cat(l) !== 'FOR SALE' || !l._p) return;
      var area = l._p.locations && l._p.locations[0], price = l._p.price;
      if (!area || !(price > 0)) return;
      var g = groups[area] || (groups[area] = { area: area, prices: [], perSqm: [], series: [] });
      g.prices.push(price);
      var a = sqm(l.content);
      if (a) g.perSqm.push(price / a);
      g.series.push({ t: new Date(l.created_at).getTime(), v: a ? price / a : price });
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.prices.length - a.prices.length; }).slice(0, 8);
    if (!list.length) { rail.innerHTML = empty('fa-chart-column', 'Not enough priced FOR SALE posts yet.'); return; }
    rail.innerHTML = list.map(function (g) {
      var perSqm = g.perSqm.length >= 1, val = perSqm ? median(g.perSqm) : median(g.prices);
      var series = g.series.sort(function (a, b) { return a.t - b.t; }).map(function (s) { return s.v; });
      return '<article class="hd-pulse">' +
        '<h3>' + esc(g.area) + '</h3>' +
        '<p class="hd-pulse-val"><b>' + esc(peso(val)) + '</b>' + (perSqm ? ' / sqm' : '') + '</p>' +
        '<p class="hd-pulse-n">' + g.prices.length + ' listing' + (g.prices.length === 1 ? '' : 's') + '</p>' +
        spark(series) + '</article>';
    }).join('');
  }

  function empty(icon, text) {
    return '<div class="hd-empty"><i class="fas ' + icon + '"></i><p>' + esc(text) + '</p></div>';
  }

  function fail(e) {
    ['hdReqRail', 'hdAiRail', 'hdPulseRail'].forEach(function (id) {
      $(id).innerHTML = empty('fa-circle-exclamation', 'Couldn\'t load right now. Pull down or reopen Home to try again.');
    });
    throw e; // reaches rm-bugs.js → Admin › Bug Reports
  }

  function start() { header(null); load().catch(fail); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
