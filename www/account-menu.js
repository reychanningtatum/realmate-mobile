// account-menu.js — shared "account menu" modal engine.
//
// Renders the centered (desktop) / bottom-sheet (mobile) modal used when a
// user clicks a listing's author avatar/name — on Portal (livemarket.js's
// showSelfPopup/showSellerPopup) and on Profile (dashboard-script.js's
// seller-menu override). Callers decide *what* to show (header + options);
// this file only owns the modal chrome (create/open/close, backdrop, X,
// Escape) so both pages render an identical component instead of two
// hand-rolled copies.
//
// openAccountMenu({ header, options }):
//   header:  { type: 'title', text }                         — plain heading
//         or { type: 'identity', avatar, name, job }          — avatar + name/job
//   options: [{ icon, title, sub, onClick }, ...]              — rendered in order
(function () {
    let _amOptions = [];

    function _ensureAccountMenu() {
        if (document.getElementById('accountMenuOverlay')) return;

        const el = document.createElement('div');
        el.id = 'accountMenuOverlay';
        el.className = 'account-menu-overlay';
        el.innerHTML = `
            <div class="account-menu-backdrop"></div>
            <div class="account-menu-card" role="dialog" aria-modal="true">
                <div class="account-menu-header">
                    <div class="account-menu-header-content" id="accountMenuHeaderContent"></div>
                    <button type="button" class="account-menu-close" aria-label="Close">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>
                <div class="account-menu-options" id="accountMenuOptions"></div>
            </div>
        `;
        document.body.appendChild(el);

        el.querySelector('.account-menu-backdrop').addEventListener('click', closeAccountMenu);
        el.querySelector('.account-menu-close').addEventListener('click', closeAccountMenu);
        el.querySelector('#accountMenuOptions').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-idx]');
            if (!btn) return;
            const opt = _amOptions[Number(btn.dataset.idx)];
            closeAccountMenu();
            if (opt && typeof opt.onClick === 'function') opt.onClick();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && el.classList.contains('open')) closeAccountMenu();
        });
    }

    function _renderHeader(header) {
        const host = document.getElementById('accountMenuHeaderContent');
        host.innerHTML = '';

        if (header && header.type === 'identity') {
            const wrap = document.createElement('div');
            wrap.className = 'account-menu-identity';

            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(header.name || 'S')}&background=0f172a&color=32cd32`;
            const img = document.createElement('img');
            img.className = 'account-menu-identity-avatar';
            img.alt = '';
            img.src = header.avatar || fallback;
            img.onerror = () => { img.onerror = null; img.src = fallback; };
            wrap.appendChild(img);

            const textWrap = document.createElement('div');
            textWrap.className = 'account-menu-identity-text';
            const nameEl = document.createElement('div');
            nameEl.className = 'account-menu-identity-name';
            nameEl.textContent = header.name || 'Realmate Member';
            const jobEl = document.createElement('div');
            jobEl.className = 'account-menu-identity-job';
            jobEl.textContent = header.job || '';
            textWrap.appendChild(nameEl);
            textWrap.appendChild(jobEl);
            wrap.appendChild(textWrap);

            host.appendChild(wrap);
        } else {
            const h3 = document.createElement('h3');
            h3.textContent = (header && header.text) || 'Account Menu';
            host.appendChild(h3);
        }
    }

    function openAccountMenu(config) {
        _ensureAccountMenu();
        _amOptions = (config && config.options) || [];

        _renderHeader(config && config.header);
        document.getElementById('accountMenuOptions').innerHTML = _amOptions.map((opt, idx) => `
            <button type="button" class="account-menu-opt" data-idx="${idx}">
                <span class="account-menu-opt-icon"><i class="fas ${opt.icon}"></i></span>
                <span class="account-menu-opt-text">
                    <span class="account-menu-opt-title">${opt.title}</span>
                    <span class="account-menu-opt-sub">${opt.sub}</span>
                </span>
                <i class="fas fa-chevron-right account-menu-opt-arrow"></i>
            </button>
        `).join('');

        document.getElementById('accountMenuOverlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeAccountMenu() {
        const overlay = document.getElementById('accountMenuOverlay');
        if (!overlay) return;
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    window.openAccountMenu = openAccountMenu;
    window.closeAccountMenu = closeAccountMenu;
})();
