// Shared nav avatar menu
function toggleNavMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('navMenu');
    if (menu) menu.classList.toggle('open');
}

// Ensure a "Saved Posts" entry exists in the avatar menu on every page
function ensureSavedNavLink() {
    document.querySelectorAll('#navMenu').forEach(menu => {
        // Skip if a Saved entry already exists (e.g. the Feed page wires its own)
        if (Array.from(menu.querySelectorAll('a')).some(a => /saved/i.test(a.textContent))) return;
        const link = document.createElement('a');
        link.href = 'home.html#saved';
        link.innerHTML = '<i class="fas fa-bookmark"></i> Saved Posts';
        const profile = menu.querySelector('a'); // first item is Profile
        if (profile && profile.nextSibling) menu.insertBefore(link, profile.nextSibling);
        else menu.appendChild(link);
    });
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
    ensureSavedNavLink();
    if (!loadNavAvatar()) {
        let attempts = 0;
        const retry = setInterval(() => {
            if (loadNavAvatar() || ++attempts > 15) clearInterval(retry);
        }, 300);
    }
});
