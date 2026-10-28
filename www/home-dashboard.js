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
  // An image URL that is safe inside CSS url("…"): http(s) only, and every
  // character that could close the string or the url() is percent-encoded.
  function cssUrl(u) {
    u = String(u || '').trim();
    if (!/^https?:\/\//i.test(u)) return '';
    return u.replace(/["'()\\\s<>]/g, function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); });
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

  // ── Navigation (inside the app shell → shell tabs; standalone → in place) ──
  function shell() { try { return window.parent !== window && window.parent.rmOpen ? window.parent : null; } catch (e) { return null; } }
  // seg: the Portal tab to show ('MARKET' / 'AI_ENGINE'). top: start at the top of it
  // (drop the Portal's remembered scroll position for this visit).
  window.hdOpenPortal = function (seg, top) {
    try { localStorage.setItem('rm_portal_tab', seg || 'MARKET'); } catch (e) {}
    if (top) { try { sessionStorage.removeItem('rm_portalScroll'); } catch (e) {} }
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
    showDate();
  }

  // Today's date and the time, upper right: "Wednesday · 1:41 PM" over "October 28, 2026".
  function showDate() {
    var d = new Date(), el = $('hdDate');
    var p2 = function (n) { return ('0' + n).slice(-2); };
    el.setAttribute('datetime', d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()));
    el.innerHTML = '<span class="hd-date-day">' + d.toLocaleDateString('en-US', { weekday: 'long' }) +
      ' · <span class="hd-date-time">' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span></span>' +
      '<span class="hd-date-full">' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '</span>';
  }
  // Keep the clock current: refresh at the start of each new minute.
  (function tick() {
    setTimeout(function () { showDate(); tick(); }, 60000 - (Date.now() % 60000) + 50);
  })();
  // The app can stay open past midnight: refresh the date (and greeting) on return.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) header(null); });

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

    hdData = { reqs: reqs, lsts: lsts };
    overview(reqs, lsts, rows, res[1].data || []);
    hotRequirements(reqs);
    aiMatches(res[1].data || [], rows);
  }

  // ── 1. Market overview ──
  function setStat(nId, dId, n, d) {
    $(nId).textContent = n;
    var e = $(dId);
    if (d) { e.textContent = '+' + d; e.hidden = false; } else e.hidden = true;
  }
  // The amount a post adds to "Active Opportunities": a requirement's budget
  // (its upper end), or a listing's asking price. Lease/rent amounts are monthly.
  function value(l) {
    var p = l._p; if (!p) return 0;
    var v = (p.budget && p.budget.max) || p.price;
    return v > 0 && isFinite(v) ? v : 0;
  }
  function isLease(l) { return REQ[cat(l)] === 'lease' || LST[cat(l)] === 'lease'; }
  var hdData = { reqs: [], lsts: [] };

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
      var l = x.l, p = l._p || {}, src = cssUrl(img(l));
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

  // ── Breakdown sheet (New Requirements / Active Opportunities) ──
  var sheetOpen = false;
  function postTitle(l) {
    var p = l._p || {};
    var place = (p.locations && p.locations[0]) || p.project || 'Location not stated';
    var unit = unitLabel(p);
    return place + (unit ? ' · ' + unit : '');
  }
  function row(l, right, rightSub) {
    var req = !!REQ[cat(l)], lease = isLease(l);
    var tag = req ? (lease ? 'Looking to lease' : 'Looking to buy') : (lease ? 'For lease' : 'For sale');
    return '<button class="hd-row" onclick="hdCloseSheet();hdOpenListing(' + JSON.stringify(String(l.id)).replace(/"/g, '&quot;') + ')">' +
      '<span class="hd-row-main"><span class="hd-tag ' + (req ? (lease ? 'hd-tag-lease' : 'hd-tag-buy') : 'hd-tag-list') + '">' + esc(tag) + '</span>' +
      '<b>' + esc(postTitle(l)) + '</b>' +
      '<small>' + esc(l.is_anonymous ? 'Anonymous' : (l.user_name || 'realmate member')) + ' · ' + esc(ago(l.created_at)) + '</small></span>' +
      '<span class="hd-row-side"><b>' + esc(right) + '</b>' + (rightSub ? '<small>' + esc(rightSub) + '</small>' : '') + '</span>' +
      '</button>';
  }
  function openSheet(title, sumHtml, bodyHtml) {
    $('hdSheetTitle').textContent = title;
    $('hdSheetSum').innerHTML = sumHtml;
    $('hdSheetBody').innerHTML = bodyHtml;
    $('hdSheet').hidden = false;
    document.documentElement.classList.add('hd-sheet-on');
    sheetOpen = true;
    vidSend();                      // nothing may sit over a playing YouTube player → pause
    $('hdSheetBody').scrollTop = 0;
  }
  window.hdCloseSheet = function () {
    if (!sheetOpen) return;
    $('hdSheet').hidden = true;
    document.documentElement.classList.remove('hd-sheet-on');
    sheetOpen = false;
    vidSend();
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.hdCloseSheet(); });

  // 1. New Requirements → every WILLING TO BUY / LEASE post from the last 7 days.
  window.hdShowRequirements = function () {
    var now = Date.now();
    var list = hdData.reqs.filter(function (l) { return now - new Date(l.created_at).getTime() < WEEK; });
    var today = list.filter(function (l) { return now - new Date(l.created_at).getTime() < DAY; }).length;
    var buy = list.filter(function (l) { return REQ[cat(l)] === 'buy'; }).length;
    var sum = '<p><b>' + list.length + '</b> new requirement' + (list.length === 1 ? '' : 's') + ' in the last 7 days' +
      (today ? ' · <b>' + today + '</b> today' : '') + '</p>' +
      '<p class="hd-sheet-split">' + buy + ' looking to buy · ' + (list.length - buy) + ' looking to lease</p>';
    var body = list.length ? list.map(function (l) {
      var lease = isLease(l), money = budgetLabel(l._p, lease);
      return row(l, money || 'No budget stated', '');
    }).join('') : empty('fa-user', 'No new requirements in the last 7 days.');
    openSheet('New Requirements', sum, body);
  };

  // 4. Active Opportunities → every open post behind the total, biggest first.
  window.hdShowOpportunities = function () {
    var all = hdData.reqs.concat(hdData.lsts);
    var counted = all.filter(function (l) { return value(l) > 0; })
      .sort(function (a, b) { return value(b) - value(a); });
    var uncounted = all.length - counted.length;
    var tot = function (arr) { return arr.reduce(function (s2, l) { return s2 + value(l); }, 0); };
    var cReq = counted.filter(function (l) { return REQ[cat(l)]; }), cLst = counted.filter(function (l) { return LST[cat(l)]; });
    var sale = counted.filter(function (l) { return !isLease(l); }), lease = counted.filter(isLease);
    var sum =
      '<p class="hd-sheet-total"><b>' + esc(peso(tot(counted)) || '₱0') + '</b> from ' + counted.length + ' open post' + (counted.length === 1 ? '' : 's') + '</p>' +
      '<div class="hd-sheet-parts">' +
        '<span><b>' + esc(peso(tot(cReq)) || '₱0') + '</b> requirements (' + cReq.length + ') — budgets</span>' +
        '<span><b>' + esc(peso(tot(cLst)) || '₱0') + '</b> listings (' + cLst.length + ') — asking prices</span>' +
        '<span><b>' + esc(peso(tot(sale)) || '₱0') + '</b> for sale / to buy · <b>' + esc(peso(tot(lease)) || '₱0') + '</b> monthly lease amounts</span>' +
      '</div>' +
      '<p class="hd-sheet-note">Each post counts once: a requirement at the top of its budget, a listing at its asking price; ' +
      'lease posts count one month\'s amount. ' + (uncounted ? uncounted + ' open post' + (uncounted === 1 ? ' has' : 's have') + ' no amount and ' + (uncounted === 1 ? "isn't" : "aren't") + ' counted.' : '') + '</p>';
    var body = counted.length ? counted.map(function (l) {
      var req = !!REQ[cat(l)], lease2 = isLease(l);
      return row(l, peso(value(l)) + (lease2 ? ' / mo' : ''), req ? 'budget (top)' : 'asking price');
    }).join('') : empty('fa-chart-simple', 'No open posts with an amount yet.');
    openSheet('Active Opportunities', sum, body);
  };

  function empty(icon, text) {
    return '<div class="hd-empty"><i class="fas ' + icon + '"></i><p>' + esc(text) + '</p></div>';
  }

  function fail(e) {
    ['hdReqRail', 'hdAiRail'].forEach(function (id) {
      $(id).innerHTML = empty('fa-circle-exclamation', 'Couldn\'t load right now. Pull down or reopen Home to try again.');
    });
    throw e; // reaches rm-bugs.js → Admin › Bug Reports
  }

  // ── Home video (Admin › Home Video → site_settings 'youtube_url') ──
  // The player page must load from a real website: in the iOS app this page runs
  // on the app's internal address (capacitor://), which YouTube won't play from.
  var WEB_ORIGIN = { staging: 'https://staging.realmate.ph', production: 'https://realmate.ph' };
  function webOrigin() {
    return /^https?:$/.test(location.protocol) ? location.origin : WEB_ORIGIN[window.RM_ENV.name];
  }
  // YouTube policy: play only while MORE THAN HALF of the player is on screen, and
  // never in the background (another tab, app in background, page hidden).
  var vidVisible = false, vidSent = null;
  // In the app shell each tab is an <iframe> the shell hides with display:none;
  // a hidden frame gets no visibility events, so check (and watch) the frame itself.
  function frameShown() {
    var fe = null;
    try { fe = window.frameElement; } catch (e) {}
    return !fe || getComputedStyle(fe).display !== 'none';
  }
  function vidSend(force) {
    if (!$('hdVideo').getAttribute('src')) return;     // no video on Home → nothing to control
    // Settings › Home Video (read each time, so a change applies the next time Home shows):
    // "Autoplay" off → on screen means 'idle' (ready, waits for a tap on YouTube's play);
    // off screen is always 'pause' (no background playback).
    var Y = window.RMYouTube;
    var onScreen = vidVisible && frameShown() && !document.hidden && !sheetOpen;
    var frame = $('hdVideo'), cmd = !onScreen ? 'pause' : (Y && !Y.autoPlay() ? 'idle' : 'play');
    if (!frame.contentWindow || (!force && cmd === vidSent)) return;
    vidSent = cmd;
    if (cmd === 'play') vidExpectPlay();
    var sound = !!(Y && !Y.autoMute());
    try { frame.contentWindow.postMessage({ rmVideo: cmd, sound: sound }, '*'); } catch (e) {}
  }
  function vidWatch() {
    if (vidWatch.on) return; vidWatch.on = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        vidVisible = es[es.length - 1].intersectionRatio > 0.5;
        vidSend();
      }, { threshold: [0, 0.5, 0.51, 1] }).observe($('hdVideo'));
    } else { vidVisible = true; }
    document.addEventListener('visibilitychange', function () { vidSend(); });
    try {
      if (window.frameElement && 'MutationObserver' in window)
        new MutationObserver(function () { vidSend(); })
          .observe(window.frameElement, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    } catch (e) {}
    window.addEventListener('pagehide', function () { vidVisible = false; vidSend(); });
    // Messages from the player: 'ready' → tell it the current state; 'state' → track it.
    window.addEventListener('message', function (e) {
      if (e.source !== $('hdVideo').contentWindow || !e.data) return;
      if (e.data.rmVideo === 'ready') vidReady = true;
      if (e.data.rmVideo === 'ready' || e.data.rmVideo === 'state') {
        vidState = e.data.state; vidMuted = !!e.data.muted;
        if (vidState === 1) vidPlayed = true;          // 1 = playing
      }
      if (e.data.rmVideo === 'ready') vidSend(true);
    });
  }

  // If a requested autoplay never starts, report it to Admin › Bug Reports (once per
  // visit) with what we know — so a failure on a phone we can't test is visible.
  var vidReady = false, vidState = null, vidMuted = null, vidPlayed = false, vidReported = false, vidCheck = null;
  function vidExpectPlay() {
    if (vidPlayed || vidReported || vidCheck) return;
    vidCheck = setTimeout(function () {
      vidCheck = null;
      if (vidPlayed || vidReported || vidSent !== 'play') return;
      // Not on screen now (page hidden / tab hidden / scrolled away) is not a failure.
      if (document.hidden || !frameShown() || !vidVisible) return;
      vidReported = true;
      var cap = window.Capacitor;
      var info = {
        playerReady: vidReady, playerState: vidState, muted: vidMuted,
        autoMuteSetting: !!(window.RMYouTube && RMYouTube.autoMute()),
        app: !!(cap && cap.isNativePlatform && cap.isNativePlatform()),
        pageVisible: !document.hidden, tabShown: frameShown()
      };
      if (window.RMBugs) RMBugs.capture(new Error('Home video did not autoplay (player ' +
        (vidReady ? 'state ' + vidState : 'never became ready') + ')'), info);
    }, 12000);
  }
  // Credit line under the player: YouTube as the source, the video and its channel.
  function vidCredit(i) {
    var el = $('hdVideoCredit');
    el.textContent = '';
    var link = function (href, text) {
      var a = document.createElement('a');
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = text;
      return a;
    };
    var yt = document.createElement('i'); yt.className = 'fab fa-youtube';
    el.appendChild(yt);
    el.appendChild(link(i.watchUrl, 'Watch on YouTube'));
    if (i.title) { el.appendChild(document.createTextNode(' · ' + i.title)); }
    if (i.channel) {
      el.appendChild(document.createTextNode(' — '));
      el.appendChild(i.channelUrl ? link(i.channelUrl, i.channel) : document.createTextNode(i.channel));
    }
    el.hidden = false;
  }
  async function video() {
    var r = await sb.from('site_settings').select('value').eq('key', 'youtube_url').maybeSingle();
    if (r.error) throw r.error;
    var url = r.data && r.data.value;
    var src = window.RMYouTube && RMYouTube.playerUrl(url, webOrigin());
    if (!src) { $('hdVideoSec').hidden = true; return; }   // none set (or not a YouTube link)
    // Only embed what YouTube says exists and its owner allows to be embedded.
    var info = await RMYouTube.info(url);
    if (!info.ok && info.reason !== 'unavailable') { $('hdVideoSec').hidden = true; return; }
    if (info.ok) vidCredit(info); else $('hdVideoCredit').hidden = true;
    if ($('hdVideo').getAttribute('src') !== src) { vidSent = null; $('hdVideo').setAttribute('src', src); }
    $('hdVideoSec').hidden = false;
    vidWatch();
  }

  function start() { header(null); load().catch(fail); video(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
