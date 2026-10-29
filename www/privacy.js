/* privacy.js — RMPriv: shared account-privacy + relationship access rules.
 *
 * The whole app decides "can viewer V see owner O's listings / About"
 * through this one module, so the rules can't drift between the Profile and
 * Portal. Enforcement is client-side (consistent with the current anon-key
 * architecture — see project_security_remediation); a Public account or a
 * granted relationship opens access, otherwise it's hidden.
 *
 * Access model (for a PRIVATE account; a Public one shows everything):
 *   • Realmate  (mutual, accepted mate) -> listings + About
 *   • Follower  (accepted follow)        -> About   (NOT listings)
 *   • neither                            -> nothing on the profile
 * A listing encountered in the Portal marketplace stays viewable to anyone; this
 * module gates the PROFILE view of a user's content.
 */
(function () {
  'use strict';
  var SB_URL = window.RM_ENV.url;
  var SB_KEY = window.RM_ENV.anonKey;
  function sb() {
    return window.supabaseClient || window._sb || window._supabase ||
      (window.supabase ? (window.__privClient || (window.__privClient = window.supabase.createClient(SB_URL, SB_KEY))) : null);
  }

  // Access hierarchy (kind: 'listings' | 'about'; f = resolve() flags):
  //   Self            -> everything
  //   Realmate        -> Listings + About
  //   Approved Follower-> About only  (NEVER Listings)
  //   Public account  -> About to anyone (Listings still Realmate-only)
  //   Pending / none  -> nothing on a Private profile
  // Following is a LIMITED social relationship; Listings are the Realmate tier.
  function can(kind, f) {
    if (!f) return false;
    if (f.isSelf) return true;                               // owner sees their own everything
    // Listings are the REALMATE tier — never exposed to followers or the public,
    // even on a Public account (only the Portal marketplace shows a listing to
    // anyone; this gates the PROFILE view).
    if (kind === 'listings') return !!f.isMate;
    // About: a Public account shows it to anyone; a Private account
    // only to an APPROVED follower or a Realmate (a pending request grants none).
    if (f.ownerPublic) return true;
    return !!(f.isFollower || f.isMate);
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
      // Do NOT treat an account as Public just because the is_public column isn't
      // deployed yet — that exposed every profile's listings to
      // non-Realmates (the "privacy was lost" bug). Leave ownerPublic FALSE on a
      // missing column / error so we fall through to the RELATIONSHIP gate below
      // (Realmate → listings+About, Follower → About, neither → nothing). This
      // profile gate is intentionally the private-by-default, safe direction.
      out.ownerPublic = !!(prof.data && prof.data.is_public);
      if (!myId) return out;                                 // logged-out → only public content
      // Resolve BOTH relationship levels even for a Public account: Listings stay
      // Realmate-only regardless of Public/Private, so a Realmate must still be
      // recognized to unlock them. isFollower counts ONLY an accepted follow — a
      // pending request grants no access.
      var fol = await c.from('follows').select('status')
        .eq('follower_id', myId).eq('following_id', ownerId).maybeSingle();
      out.isFollower = !!(fol.data && fol.data.status === 'accepted');
      out.isMate = await _areMates(c, myId, ownerId);
    } catch (e) { /* keep the safe (no-access) default */ }
    return out;
  }

  window.RMPriv = { can: can, resolve: resolve };
})();
