/* privacy.js — RMPriv: shared account-privacy + relationship access rules.
 *
 * The whole app decides "can viewer V see owner O's posts / listings / About"
 * through this one module, so the rules can't drift between the Profile, Feed and
 * Portal. Enforcement is client-side (consistent with the current anon-key
 * architecture — see project_security_remediation); a Public account or a
 * granted relationship opens access, otherwise it's hidden.
 *
 * Access model (for a PRIVATE account; a Public one shows everything):
 *   • Realmate  (mutual, accepted mate) -> listings + posts + About
 *   • Follower  (accepted follow)        -> posts + About   (NOT listings)
 *   • neither                            -> nothing on the profile
 * A listing encountered in the Portal marketplace stays viewable to anyone; this
 * module gates the PROFILE view of a user's content.
 */
(function () {
  'use strict';
  var SB_URL = 'https://wmegpgrfrtprhuzmgjma.supabase.co';
  var SB_KEY = 'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4';
  function sb() {
    return window.supabaseClient || window._sb || window._supabase ||
      (window.supabase ? (window.__privClient || (window.__privClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }

  // kind: 'posts' | 'listings' | 'about'. flags = the object from resolve().
  function can(kind, f) {
    if (!f) return false;
    if (f.isSelf || f.ownerPublic) return true;
    if (kind === 'listings') return !!f.isMate;              // Realmate gates listings
    return !!(f.isFollower || f.isMate);                     // Following (or Realmate) gates posts + About
  }

  async function _areMates(c, myId, ownerId) {
    try {
      var r = await c.from('mates').select('status')
        .or('and(requester_id.eq.' + myId + ',recipient_id.eq.' + ownerId + '),' +
            'and(requester_id.eq.' + ownerId + ',recipient_id.eq.' + myId + ')')
        .eq('status', 'accepted').limit(1);
      return !!(r.data && r.data.length);
    } catch (e) { return false; }
  }

  // Resolve the CURRENT viewer's relationship to ownerId. Fail-open to "no
  // access" (Private is the safe default) on any error.
  // -> { isSelf, ownerPublic, isFollower, isMate, myId }
  async function resolve(ownerId) {
    var out = { isSelf: false, ownerPublic: false, isFollower: false, isMate: false, myId: null };
    try {
      var c = sb(); if (!c || !ownerId) return out;
      var me = (await c.auth.getUser()).data.user;
      var myId = me && me.id; out.myId = myId || null;
      if (myId && String(myId) === String(ownerId)) { out.isSelf = true; out.ownerPublic = true; return out; }
      var prof = await c.from('profiles').select('is_public').eq('id', ownerId).maybeSingle();
      out.ownerPublic = !!(prof.data && prof.data.is_public);
      if (out.ownerPublic || !myId) return out;              // Public, or logged-out → only public content
      var fol = await c.from('follows').select('status')
        .eq('follower_id', myId).eq('following_id', ownerId).maybeSingle();
      out.isFollower = !!(fol.data && fol.data.status === 'accepted');
      out.isMate = await _areMates(c, myId, ownerId);
    } catch (e) { /* keep the safe (no-access) default */ }
    return out;
  }

  window.RMPriv = { can: can, resolve: resolve };
})();
