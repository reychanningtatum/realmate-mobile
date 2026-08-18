/* nexus-env.js — client-side registry of the Nexus data environments.
 *
 * Lets the Founders/Admin Nexus panel observe EITHER the production or the
 * separate testing Supabase project, and lets rm-track optionally point at
 * testing. Production is the DEFAULT everywhere.
 *
 * Only the PUBLIC anon (publishable) key belongs here — never a service-role key.
 * The testing entry is a PLACEHOLDER: fill it in AFTER you create the separate
 * free testing project (URL + its anon/publishable key). Until then the admin
 * panel shows "Testing not configured".
 *
 * This file changes NOTHING about production behaviour on its own — the deployed
 * app keeps talking to production, and Nexus stays dormant there.
 */
(function (global) {
  'use strict';
  global.NEXUS_ENVIRONMENTS = {
    production: {
      label: 'Production',
      url: 'https://wmegpgrfrtprhuzmgjma.supabase.co',
      anonKey: 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4',
    },
    testing: {
      label: 'Testing',
      url: 'https://lyrzwglkvphlalbrotjw.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cnp3Z2xrdnBobGFsYnJvdGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjIyNTQsImV4cCI6MjEwMjI5ODI1NH0.-X18HjjZsGytAIIsiv830yfJVHk1HZMmRIamcK0MCV8',
    },
  };
  global.NEXUS_DEFAULT_ENV = 'production';
  global.nexusEnvConfigured = function (env) {
    var e = global.NEXUS_ENVIRONMENTS[env];
    return !!(e && e.url && e.anonKey);
  };
})(typeof window !== 'undefined' ? window : this);
