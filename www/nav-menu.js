// Shared nav avatar menu
function toggleNavMenu(e) {
    // The account menu (#navMenu) is a CHILD of the avatar wrap that owns this
    // onclick. A tap on a menu item (Profile/Realmates/Settings/Logout) runs its
    // own handler — which closes the menu — but the same click then bubbles up
    // here and toggles it straight back OPEN, leaving the card stuck over the
    // next page until you tapped elsewhere. Ignore clicks that originate inside
    // the menu; only a tap on the avatar itself toggles it.
    if (e && e.target && e.target.closest && e.target.closest('#navMenu')) return;
    if (e) e.stopPropagation();
    const menu = document.getElementById('navMenu');
    if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', () => {
    const menu = document.getElementById('navMenu');
    if (menu) menu.classList.remove('open');
});

// Load user avatar into nav button (retries until user data is available)
function loadNavAvatar() {
    const avatar = document.getElementById('navAvatar');
    if (!avatar && !document.getElementById('navAvatarPill')) return;
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.id) return false;

    const target = avatar || document.getElementById('navAvatarPill');
    if (!target) return false;

    // Already rendered with the correct user AND image. The image check lets a
    // later avatar refresh (e.g. auth-guard's heal) re-render instead of being
    // skipped because the uid already matches.
    if (target.id === 'navAvatarPill'
        && target.dataset.uid === user.id
        && target.dataset.img === (user.image || '')) return true;

    const wrap = target.closest('.mob-nav-avatar-wrap');
    if (wrap) {
        wrap.style.cssText += 'display:flex;flex-direction:column;align-items:center;gap:2px;';
    }

    const imgStyle = user.image
        ? `background:url('${user.image}') center/cover no-repeat;`
        : `background:#32cd32;`;
    const initial = user.image ? '' : (user.name || 'U').charAt(0).toUpperCase();

    const existingSpan = target.parentElement?.querySelector(':scope > span');
    if (existingSpan && target.id === 'navAvatar') existingSpan.remove();

    target.outerHTML = `
        <div id="navAvatarPill" data-uid="${user.id}" data-img="${user.image || ''}" onclick="toggleNavMenu(event)" style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;">
            <div style="position:relative;display:inline-block;">
                <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;${imgStyle}display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">
                    ${initial}
                </div>
                <div style="position:absolute;bottom:-2px;right:-4px;width:14px;height:14px;border-radius:50%;background:#64748b;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1.5px;">
                    <div style="width:7px;height:1px;background:#fff;border-radius:1px;"></div>
                    <div style="width:7px;height:1px;background:#fff;border-radius:1px;"></div>
                    <div style="width:7px;height:1px;background:#fff;border-radius:1px;"></div>
                </div>
            </div>
            <span style="font-size:10px;color:#64748b;">Me</span>
        </div>`;
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!loadNavAvatar()) {
        let attempts = 0;
        const retry = setInterval(() => {
            if (loadNavAvatar() || ++attempts > 15) clearInterval(retry);
        }, 300);
    }
});

// The user changed their profile picture in another app-shell iframe/tab:
// localStorage.user.image was updated there, so re-render THIS page's nav avatar
// from it (loadNavAvatar's data-img guard forces a repaint when it differs).
window.addEventListener('storage', function (e) {
    if (e.key === 'rm_avatar_changed') { try { loadNavAvatar(); } catch (_) {} }
});
