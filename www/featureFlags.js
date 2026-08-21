/**
 * featureFlags.js — Realmate hidden-feature registry & roadmap
 * ---------------------------------------------------------------------------
 * Single source of truth for features that are BUILT but intentionally hidden,
 * parked for a future version. Purpose: preserve the roadmap and give one place
 * to switch a feature back on.
 *
 * HOW TO RE-ENABLE A FEATURE
 *   Set its `enabled` to `true` below. That's it — the feature is revealed on
 *   every page that loads this script (and any JS that calls isFeatureEnabled()).
 *
 * HOW IT WORKS
 *   On DOM ready we walk the registry:
 *     - enabled:false  → force-hide every matching element (display:none)
 *     - enabled:true   → reveal it (clear the inline display)
 *   The pages also keep an inline `style="display:none"` on these elements as a
 *   no-JS fallback, so nothing flashes if this script is slow. This file is the
 *   authoritative control point.
 *
 * NOTE FOR JS-DRIVEN FEATURES
 *   Some features are also gated in page scripts (e.g. the market ticker in
 *   livemarket.js). Those call window.isFeatureEnabled('<name>'), so flipping
 *   the flag here is still all you need.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var FEATURES = {
    structuredComposer: {
      enabled: true,
      version: 'v2',
      label: 'Structured Listing Composer',
      notes: 'Phase 2a. Structured property fields in the Portal post modal (livemarket.html/js). Logic-gated in livemarket.js via isFeatureEnabled("structuredComposer").',
      selectors: ['#lmDetails']
    },
    forum: {
      enabled: false,
      version: 'v2',
      label: 'Community Forum',
      notes: 'Forum page + all nav entries. Files: forum.html, forum.css, forum-script.js.',
      selectors: [
        '#nav-forum',
        '.nav-item[onclick*="forum.html"]',
        '.mob-nav-item[href="forum.html"]',
        'button[onclick*="forum.html"]'
      ]
    },
    analytics: {
      enabled: false,
      version: 'v2',
      label: 'Analytics Dashboard',
      notes: 'analytics.html. Desktop sidebar + avatar-menu links.',
      selectors: [
        '.nav-item[onclick*="analytics.html"]',
        '#navMenu a[href="analytics.html"]'
      ]
    },
    pulse: {
      enabled: false,
      version: 'v3',
      label: 'Pulse Feed (Portal tab)',
      notes: 'Portal "Pulse" segment tab (data-seg="FEED"). Tab logic lives in livemarket.js.',
      selectors: ['.seg-tab[data-seg="FEED"]']
    },
    marketTicker: {
      enabled: false,
      version: 'v2',
      label: 'Market Price Ticker',
      notes: 'Scrolling ticker strip on the Portal page. Also gated in livemarket.js via isFeatureEnabled("marketTicker").',
      selectors: ['#tickerWrap']
    },
    questionPostType: {
      enabled: false,
      version: 'v2',
      label: 'Question Post Type',
      notes: 'Feed composer "Question" button. Handler still present in home.js: setPostType("question").',
      selectors: ['#typeBtnQuestion']
    },
    followTopics: {
      enabled: false,
      version: 'v2',
      label: 'Follow Topics (feed sidebar)',
      notes: 'Feed right-sidebar "Follow Topics" widget. List populated by home.js (#topicsList).',
      selectors: ['#topicsWidget']
    },
    communities: {
      enabled: false,
      version: 'v2',
      label: 'Communities (feed sidebar)',
      notes: 'Feed right-sidebar "Communities" widget (coming-soon placeholder).',
      selectors: ['#communitiesWidget']
    },
    monthlyTopProducers: {
      enabled: false,
      version: 'v2',
      label: 'Monthly Top Producers (feed)',
      notes: 'Feed "Monthly Top Producers" section. Populated by top-producers.js (#tpGrid).',
      selectors: ['#topProducersSection']
    }
  };

  function isEnabled(name) {
    return !!(FEATURES[name] && FEATURES[name].enabled);
  }

  function apply(root) {
    root = root || document;
    Object.keys(FEATURES).forEach(function (name) {
      var f = FEATURES[name];
      (f.selectors || []).forEach(function (sel) {
        var els;
        try { els = root.querySelectorAll(sel); } catch (e) { return; }
        Array.prototype.forEach.call(els, function (el) {
          if (f.enabled) el.style.removeProperty('display');
          else el.style.setProperty('display', 'none', 'important');
        });
      });
    });
  }

  // Public API
  window.FEATURE_FLAGS = FEATURES;
  window.isFeatureEnabled = isEnabled;
  window.applyFeatureFlags = apply;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); });
  } else {
    apply();
  }
})();
