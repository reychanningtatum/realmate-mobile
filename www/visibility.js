// ═══════════════════════════════════════════════════════════════════════════
// Live Market — Visibility Controls (shared helpers)
//
// A listing can be hidden from specific user accounts (any Realmate member,
// whether or not they're already a connection). Hiding NEVER touches AI
// matching: the owner's own browser still sees every match, its confidence,
// analytics and offer counts. Visibility only filters what OTHER viewers can
// DISCOVER.
//
// Enforcement is client-side — every viewer fetches listings with the anon
// key and renders them in the browser, exactly like the rest of the Portal.
// The filter below runs right after the fetch, before anything is rendered or
// matched, so a hidden viewer's client never renders, matches against, or
// links to the listing.
// ═══════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    // Column values may arrive as a real array (jsonb/text[]) or a JSON string.
    function asArray(v) {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
        }
        return [];
    }

    // Can `viewer` discover this listing?
    //   viewerId         – current user's uuid. The owner ALWAYS sees own posts.
    //   unlockedOwnerIds – Set of owner ids the viewer already has a conversation
    //                      with. Once the owner intentionally starts contact
    //                      (e.g. sends an Offer), the hidden user regains access.
    function visibleToViewer(listing, viewerId, unlockedOwnerIds) {
        if (!listing) return false;
        // Owner's own dashboard is never affected by their own visibility rules.
        if (viewerId && listing.user_id && String(listing.user_id) === String(viewerId)) return true;

        const hiddenUsers = asArray(listing.hidden_user_ids).map(String);
        if (!hiddenUsers.length) return true; // nothing hidden

        // Owner explicitly reached out → don't block the conversation they started.
        if (unlockedOwnerIds && typeof unlockedOwnerIds.has === 'function'
            && unlockedOwnerIds.has(String(listing.user_id))) return true;

        if (viewerId && hiddenUsers.includes(String(viewerId))) return false;
        return true;
    }

    // The owners the current viewer already has a conversation with. A hidden
    // listing becomes visible to the viewer once its owner appears here, so an
    // Offer the owner sends (which creates a conversation) unlocks their posts.
    async function fetchUnlockedOwnerIds(sb, myId) {
        const set = new Set();
        if (!sb || !myId) return set;
        try {
            const { data: myParts } = await sb
                .from('conversation_participants').select('conversation_id').eq('user_id', myId);
            const convIds = (myParts || []).map(p => p.conversation_id).filter(Boolean);
            if (!convIds.length) return set;
            const { data: others } = await sb
                .from('conversation_participants').select('user_id')
                .in('conversation_id', convIds).neq('user_id', myId);
            (others || []).forEach(o => o.user_id && set.add(String(o.user_id)));
        } catch (e) { console.warn('[RMVisibility] unlock fetch failed', e); }
        return set;
    }

    global.RMVisibility = { asArray, visibleToViewer, fetchUnlockedOwnerIds };
})(typeof window !== 'undefined' ? window : this);
