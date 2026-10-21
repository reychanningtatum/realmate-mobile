/* rm-env.js — the ONE place the app's Supabase environment is defined.
 *
 * Every page loads this file FIRST. Code reads window.RM_ENV.url / .anonKey /
 * .authTokenKey instead of hard-coding a project. Only PUBLIC (publishable) keys
 * belong here — never a service-role key.
 *
 * RM_ENV_TARGET is 'production' in git on every branch. The Codemagic ios-staging
 * workflow rewrites that one line to 'staging' at build time (never committed), so
 * promoting staging → master can never point production at staging or vice versa.
 *
 * Fail-safe (no fallback): an unknown target leaves RM_ENV undefined, so no
 * Supabase client can start, and an error screen shows. In the native app, a
 * bundle id that does not match the environment (e.g. the staging app built with
 * the production target) blocks the app the same way.
 */
(function (g) {
  'use strict';

  var RM_ENV_TARGET = 'production';

  var ENVS = {
    production: {
      name: 'production',
      ref: 'wmegpgrfrtprhuzmgjma',
      url: 'https://wmegpgrfrtprhuzmgjma.supabase.co',
      anonKey: 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4',
      scheme: 'realmate',
      bundleId: 'com.realmate.app',
      // Shared admin password still offered on the Admin page (being retired;
      // production keeps it until it has a working Master account).
      adminSharedPassword: true,
    },
    staging: {
      name: 'staging',
      ref: 'lyrzwglkvphlalbrotjw',
      url: 'https://lyrzwglkvphlalbrotjw.supabase.co',
      anonKey: 'sb_publishable_IKVQ13nbBhnlmWj9Tj9Tog_rX8Xla8w',
      scheme: 'realmate-staging',
      bundleId: 'com.realmate.app.staging',
      adminSharedPassword: false,
    },
  };

  function block(reason) {
    g.RM_ENV_BLOCKED = reason;
    function show() {
      var d = document.createElement('div');
      d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#080f1a;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;' +
        'font:16px/1.5 -apple-system,system-ui,sans-serif';
      d.textContent = 'This build of realmate is misconfigured (' + reason + '). Please install the correct app.';
      document.body.appendChild(d);
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  var src = ENVS[RM_ENV_TARGET];
  if (!src) { block('unknown environment "' + RM_ENV_TARGET + '"'); return; }

  var env = {};
  for (var k in src) env[k] = src[k];
  env.authTokenKey = 'sb-' + env.ref + '-auth-token';
  g.RM_ENV = Object.freeze(env);

  // Native app: the installed bundle id must belong to this environment.
  try {
    var C = g.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App && C.Plugins.App.getInfo) {
      C.Plugins.App.getInfo().then(function (info) {
        if (info && info.id && info.id !== env.bundleId) block('app ' + info.id + ' is not ' + env.name);
      }).catch(function () {});
    }
  } catch (e) {}

  // Visible marker so a staging build is never mistaken for production. Drawn
  // by the top page only: the app shell's tab pages (iframes) load this file
  // too, and a second label floated over their content just above the nav.
  if (env.name !== 'production' && g.self === g.top) {
    var mark = function () {
      // iOS WebKit can fire DOMContentLoaded on a page cut short while still
      // in <head> (index.html's first-launch location.replace to the marketing
      // page) — there is no body then. Draw on the next page instead.
      if (!document.body) return;
      var b = document.createElement('div');
      b.textContent = 'REALMATE STAGING';
      b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 2px);' +
        'z-index:2147483646;pointer-events:none;background:#f28c28;color:#3a1d00;font:700 10px/1 system-ui,sans-serif;' +
        'letter-spacing:.08em;padding:3px 8px;border-radius:6px;opacity:.9';
      document.body.appendChild(b);
    };
    if (document.body) mark(); else document.addEventListener('DOMContentLoaded', mark);
  }
})(window);
