/**
 * nexus-rank.js — Nexus personalization / match RE-RANK layer (Spec §6).
 * ---------------------------------------------------------------------------
 * The existing AI Match Engine (match-engine.js) decides ELIGIBILITY via hard
 * gates. Nexus never touches those (§7). This module only REORDERS an
 * already-eligible list by behavioural relevance to the current user, and only
 * when the founder has switched it on.
 *
 * SAFETY / FALLBACK (§21):
 *   - Fully gated by NEXUS_ENGINE && NEXUS_MATCH_RANKING (both OFF by default).
 *   - Needs a learned user_behavior_profiles row for the viewer; if absent,
 *     ranking is disabled and the app keeps its existing order.
 *   - reorder() never adds/removes items and returns the input unchanged on any
 *     error or when disabled. Nexus can fail or be off and the app is unaffected.
 *
 * No new user-facing UI (§22): this is invisible plumbing behind the existing
 * match feed. Reasons are stashed for the ADMIN panel only (explainability §26).
 */
(function () {
  'use strict';

  var STATE = { ready: false, enabled: false, profile: null, flags: {}, userId: null, lastReasons: {} };

  function truthy(v) { return v === true || v === 'true'; }
  function nz(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function getClient() {
    try {
      if (!window.supabase || !window.supabase.createClient) return null;
      // Reuse the page's config globals (same as livemarket.js). Read-only use.
      // eslint-disable-next-line no-undef
      return window.supabase.createClient(supabaseUrl, supabaseKey);
    } catch (e) { return null; }
  }

  async function init() {
    try {
      var sb = getClient();
      if (!sb) { STATE.ready = true; return; }

      // 1. flags (intelligence_config is publicly readable by design)
      var cfg = await sb.from('intelligence_config').select('key,value')
        .in('key', ['NEXUS_ENGINE', 'NEXUS_MATCH_RANKING']);
      var flags = {};
      (cfg && cfg.data ? cfg.data : []).forEach(function (r) { flags[r.key] = r.value; });
      STATE.flags = flags;
      if (!(truthy(flags.NEXUS_ENGINE) && truthy(flags.NEXUS_MATCH_RANKING))) {
        STATE.ready = true; STATE.enabled = false; return;
      }

      // 2. current user
      var auth = await sb.auth.getUser();
      var uid = auth && auth.data && auth.data.user && auth.data.user.id;
      if (!uid) { STATE.ready = true; return; }
      STATE.userId = uid;

      // 3. learned profile (own row; RLS permits). No profile → stay disabled.
      var prof = await sb.from('user_behavior_profiles').select('*').eq('user_id', uid).limit(1);
      var p = (prof && prof.data ? prof.data : [])[0] || null;
      STATE.profile = p;
      STATE.enabled = !!p && (p.confidence == null || Number(p.confidence) > 0);
      STATE.ready = true;
    } catch (e) {
      STATE.ready = true; STATE.enabled = false;
    }
  }

  function affinityMax(map, keys) {
    if (!map || typeof map !== 'object' || !keys || !keys.length) return 0;
    var m = 0;
    for (var i = 0; i < keys.length; i++) {
      var v = map[keys[i]];
      if (typeof v === 'number' && v > m) m = v;
    }
    return m;
  }

  function priceCloseness(price, center, range) {
    if (!(price > 0) || !(center > 0)) return null;
    var width = (range && range.length === 2 && range[1] > range[0]) ? (range[1] - range[0]) / 2 : center * 0.25;
    if (!(width > 0)) width = center * 0.25;
    var d = (price - center) / width;
    return Math.exp(-0.5 * d * d);
  }

  // Behavioural relevance in [0,1] for one candidate, scaled by profile confidence.
  function relevance(parsed) {
    var p = STATE.profile;
    if (!p || !parsed) return { score: 0, reasons: [] };
    var comps = [], reasons = [];
    if (parsed.locations && parsed.locations.length) {
      var loc = affinityMax(p.location_affinity, parsed.locations);
      comps.push([0.28, loc]); if (loc >= 0.5) reasons.push('location');
    }
    if (parsed.unitTypes && parsed.unitTypes.length) {
      var unit = affinityMax(p.unit_affinity, parsed.unitTypes);
      comps.push([0.22, unit]); if (unit >= 0.5) reasons.push('unit type');
    }
    if (parsed.project) {
      var proj = affinityMax(p.project_affinity, [parsed.project]);
      comps.push([0.20, proj]); if (proj >= 0.5) reasons.push('project');
    }
    if (parsed.developer) {
      var dev = affinityMax(p.developer_affinity, [parsed.developer]);
      comps.push([0.15, dev]); if (dev >= 0.5) reasons.push('developer');
    }
    var pc = priceCloseness(parsed.price, p.price_center, p.price_range);
    if (pc != null) { comps.push([0.15, pc]); if (pc >= 0.6) reasons.push('budget'); }

    if (!comps.length) return { score: 0, reasons: [] };
    var wsum = 0, vsum = 0;
    for (var i = 0; i < comps.length; i++) { wsum += comps[i][0]; vsum += comps[i][0] * comps[i][1]; }
    var rel = wsum > 0 ? vsum / wsum : 0;
    var conf = (typeof p.confidence === 'number') ? p.confidence : 1;
    return { score: rel * conf, reasons: reasons };
  }

  /**
   * reorder(listings, getScore, opts)
   *   listings : already-ELIGIBLE listing rows (membership is final)
   *   getScore : fn(listing) -> existing Match Engine score (0..100)
   * Returns a NEW array in personalized order, or the input unchanged when
   * disabled / on any error. Never adds or drops items.
   */
  function reorder(listings, getScore, opts) {
    if (!STATE.enabled || !Array.isArray(listings) || listings.length < 2) return listings;
    try {
      var RM = window.RM_MATCH;
      if (!RM || typeof RM.parseListing !== 'function') return listings;
      var BOOST = (opts && typeof opts.boost === 'number') ? opts.boost : 0.6;
      var meta = listings.map(function (l, i) {
        var parsed; try { parsed = RM.parseListing(l); } catch (e) { parsed = {}; }
        var rel = relevance(parsed);
        var base = Math.max(0, nz(getScore ? getScore(l) : 0));
        return { l: l, i: i, rel: rel.score, reasons: rel.reasons,
          adjusted: base * (1 + BOOST * rel.score),
          created: new Date(l.created_at || 0).getTime() };
      });
      meta.sort(function (a, b) {
        return (b.adjusted - a.adjusted) || (b.created - a.created) || (a.i - b.i);
      });
      var reasons = {};
      meta.forEach(function (m) { reasons[m.l.id] = { relevance: Math.round(m.rel * 100) / 100, reasons: m.reasons }; });
      STATE.lastReasons = reasons;
      return meta.map(function (m) { return m.l; });
    } catch (e) { return listings; }
  }

  window.NexusRank = {
    init: init,
    reorder: reorder,
    isEnabled: function () { return STATE.enabled === true; },
    isReady: function () { return STATE.ready === true; },
    reasonsFor: function (id) { return STATE.lastReasons[id] || null; },
    _state: STATE,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
