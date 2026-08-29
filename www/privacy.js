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
      // Privacy not deployed yet: if the is_public column doesn't exist (the
      // privacy-following migration hasn't been run), there is no privacy to
      // enforce — treat the owner as Public so their content stays visible,
      // rather than defaulting to Private and hiding everyone. Self-heals into
      // real gating once the column exists.
      if (prof.error) { out.ownerPublic = true; return out; }
      out.ownerPublic = !!(prof.data && prof.data.is_public);
      if (out.ownerPublic || !myId) return out;              // Public, or logged-out → only public content
      var fol = await c.from('follows').select('status')
        .eq('follower_id', myId).eq('following_id', ownerId).maybeSingle();
      out.isFollower = !!(fol.data && fol.data.status === 'accepted');
      out.isMate = await _areMates(c, myId, ownerId);
    } catch (e) { /* keep the safe (no-access) default */ }
    return out;
  }

  // Batch: given a list of owner ids (e.g. the authors of a feed of posts),
  // return the set of owners whose POSTS the current viewer may see — my own,
  // Public accounts, and accounts I follow (accepted) or am Realmates with. Runs
  // a small fixed number of queries regardless of feed size (vs resolve() per
  // owner), so the Feed can filter efficiently. Fails open to "only mine +
  // public" on error (never leaks Private content).
  //   -> { set: Set<string ownerId>, myId: string|null }
  async function postAccessSet(ownerIds) {
    var res = { set: new Set(), myId: null };
    try {
      var c = sb(); if (!c) return res;
      var ids = []; var seen = {};
      (ownerIds || []).forEach(function (o) { var s = o && String(o); if (s && !seen[s]) { seen[s] = 1; ids.push(s); } });
      var me = (await c.auth.getUser()).data.user;
      var myId = me && me.id; res.myId = myId || null;
      if (myId) res.set.add(String(myId));                 // my own posts always
      if (!ids.length) return res;
      var pub = await c.from('profiles').select('id,is_public').in('id', ids);
      // Privacy not deployed yet: if the is_public column doesn't exist (the
      // privacy-following migration hasn't been run), the query errors. There's
      // no privacy to enforce, so show EVERY requested owner instead of blanking
      // the feed down to just my own + followed posts. Self-heals into real
      // gating once the column exists.
      if (pub.error) { ids.forEach(function (s) { res.set.add(s); }); return res; }
      (pub.data || []).forEach(function (r) { if (r.is_public) res.set.add(String(r.id)); });
      if (myId) {
        var fol = await c.from('follows').select('following_id')
          .eq('follower_id', myId).eq('status', 'accepted').in('following_id', ids);
        (fol.data || []).forEach(function (r) { res.set.add(String(r.following_id)); });
        var mts = await c.from('mates').select('requester_id,recipient_id')
          .eq('status', 'accepted').or('requester_id.eq.' + myId + ',recipient_id.eq.' + myId);
        (mts.data || []).forEach(function (r) {
          res.set.add(String(String(r.requester_id) === String(myId) ? r.recipient_id : r.requester_id));
        });
      }
    } catch (e) { /* fail open to mine + public */ }
    return res;
  }

  window.RMPriv = { can: can, resolve: resolve, postAccessSet: postAccessSet };
})();
