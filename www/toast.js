/**
 * toast.js — Realmate shared toast/notification helper.
 * ---------------------------------------------------------------------------
 * Provides a global showToast(message, type) on every page that loads this
 * file. Self-contained: it injects its own CSS and lazily creates its own
 * container, so no page markup is required. The visual language mirrors the
 * chat page's existing toast (bottom-centre pill, success/error icon, 3s
 * auto-dismiss, one toast at a time).
 *
 * The chat page keeps its own showToast (chat.js) + #chatToastContainer, so
 * this file is intentionally NOT loaded there; the two look identical. The
 * guard below also makes this a no-op if any showToast already exists.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';
    if (typeof window.showToast === 'function') return; // never clobber chat.js's

    var STYLE_ID = 'rm-toast-style';
    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var css =
            '.rm-toast-container{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;max-width:calc(100vw - 32px);}' +
            '.rm-toast{display:inline-flex;align-items:center;gap:8px;background:#0f172a;color:#fff;font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;padding:11px 18px;border-radius:999px;box-shadow:0 12px 30px -8px rgba(15,23,42,0.55);max-width:100%;animation:rmToastIn .2s ease-out;pointer-events:auto;}' +
            '.rm-toast i{font-size:15px;flex-shrink:0;}' +
            '.rm-toast-success i{color:#4ade80;}' +
            '.rm-toast-error i{color:#f87171;}' +
            '.rm-toast.leaving{animation:rmToastOut .18s ease-in forwards;}' +
            '@keyframes rmToastIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}' +
            '@keyframes rmToastOut{to{opacity:0;transform:translateY(12px);}}' +
            'html[data-theme="dark"] .rm-toast{background:#1e293b;border:1px solid #334155;}' +
            '@media(max-width:768px){.rm-toast-container{bottom:76px;}}';
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }

    var _timer = null;
    function getContainer() {
        var c = document.getElementById('rmToastContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'rmToastContainer';
            c.className = 'rm-toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    window.showToast = function (message, type) {
        try {
            if (!document.body) { // called before <body> parsed — retry on DOM ready
                document.addEventListener('DOMContentLoaded', function () { window.showToast(message, type); });
                return;
            }
            injectStyle();
            var container = getContainer();
            var existing = container.querySelector('.rm-toast');
            if (existing) existing.remove();
            clearTimeout(_timer);
            var toast = document.createElement('div');
            toast.className = 'rm-toast rm-toast-' + (type === 'error' ? 'error' : 'success');
            var icon = document.createElement('i');
            icon.className = 'fas ' + (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check');
            var span = document.createElement('span');
            span.textContent = message; // textContent, never innerHTML — no interpolated markup
            toast.appendChild(icon);
            toast.appendChild(span);
            container.appendChild(toast);
            _timer = setTimeout(function () {
                toast.classList.add('leaving');
                setTimeout(function () { toast.remove(); }, 200);
            }, 3000);
        } catch (e) { /* a toast must never break the calling flow */ }
    };

    if (document.head) injectStyle();
})();
