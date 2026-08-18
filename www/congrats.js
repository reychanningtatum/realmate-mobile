// ══════════════════════════════════════════════════
//  CONGRATULATE — build a celebratory feed post
//  (Canvas card is drawn 100% in-browser — no API, no cost)
// ══════════════════════════════════════════════════
(function () {
    const style = document.createElement('style');
    style.textContent = `
    #congratsModal {
        position: fixed; inset: 0; z-index: 2000;
        background: rgba(15,23,42,0.6); backdrop-filter: blur(4px);
        display: none; align-items: flex-start; justify-content: center;
        padding: 40px 16px; overflow-y: auto;
    }
    .cg-box {
        width: 100%; max-width: 520px; background: #fff;
        border-radius: 18px; overflow: hidden;
        box-shadow: 0 24px 64px rgba(0,0,0,0.25);
        display: flex; flex-direction: column;
    }
    .cg-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 18px; border-bottom: 1px solid #f1f5f9;
        font-size: 15px; font-weight: 800; color: #0f172a;
    }
    .cg-close { border: none; background: #f1f5f9; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; color: #64748b; }
    .cg-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .cg-error {
        display: flex; align-items: center; gap: 8px;
        background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
        border-radius: 10px; padding: 10px 12px; font-size: 13px; font-weight: 600;
        margin-bottom: 4px;
    }
    .cg-error i { flex-shrink: 0; }
    .cg-input.cg-invalid { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.12); }
    .cg-label { font-size: 12px; font-weight: 700; color: #64748b; margin: 8px 0 4px; }
    .cg-input {
        width: 100%; border: 1px solid #e2e8f0; border-radius: 10px;
        padding: 10px 12px; font-size: 14px; font-family: inherit; color: #0f172a;
        outline: none; box-sizing: border-box;
    }
    .cg-input:focus { border-color: #32cd32; }
    .cg-caption { resize: vertical; line-height: 1.5; }
    .cg-row { display: flex; gap: 12px; }
    .cg-proj-card {
        border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px;
        margin-bottom: 10px; background: #f8fafc;
    }
    .cg-proj-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .cg-proj-num { font-size: 12px; font-weight: 800; color: #16a34a; text-transform: uppercase; letter-spacing: 0.03em; }
    .cg-proj-del {
        border: none; background: none; color: #94a3b8; cursor: pointer;
        width: 26px; height: 26px; border-radius: 7px; font-size: 13px;
    }
    .cg-proj-del:hover { background: #fee2e2; color: #dc2626; }
    .cg-addproj {
        border: 1px dashed #bbf7d0; background: #fff; color: #16a34a; font-weight: 700; font-size: 13px;
        cursor: pointer; padding: 9px 12px; border-radius: 10px; width: 100%;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; margin-bottom: 4px;
    }
    .cg-addproj:hover { background: #f0fdf4; }
    input[type=number].cg-input::-webkit-outer-spin-button,
    input[type=number].cg-input::-webkit-inner-spin-button { opacity: 1; }
    .cg-results { border: 1px solid #f1f5f9; border-radius: 10px; margin-top: 6px; overflow: hidden; }
    .cg-results:empty { display: none; }
    .cg-uitem { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; }
    .cg-uitem:hover { background: #f8fafc; }
    .cg-uitem img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .cg-uname { font-size: 13px; font-weight: 700; color: #0f172a; }
    .cg-ujob { font-size: 11px; color: #94a3b8; }
    .cg-nores { padding: 12px; text-align: center; color: #94a3b8; font-size: 13px; }
    .cg-selected {
        display: none; align-items: center; gap: 10px;
        border: 1px solid #dcfce7; background: #f0fdf4; border-radius: 10px; padding: 9px 12px;
    }
    .cg-selected img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .cg-change { margin-left: auto; border: none; background: #fff; color: #16a34a; font-weight: 700; font-size: 12px; padding: 5px 10px; border-radius: 8px; cursor: pointer; border: 1px solid #bbf7d0; }
    .cg-canvas { width: 100%; border-radius: 14px; display: block; background: #0b1220; }
    .cg-caption-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .cg-chip {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 20px;
        background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; cursor: pointer; font-family: inherit;
    }
    .cg-chip-ghost { background: #fff; color: #64748b; border-color: #e2e8f0; }
    .cg-foot { display: flex; gap: 10px; padding: 14px 18px; border-top: 1px solid #f1f5f9; }
    .cg-btn-ghost { flex: 0 0 auto; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-weight: 700; padding: 10px 16px; border-radius: 10px; cursor: pointer; font-family: inherit; }
    .cg-btn-primary { flex: 1; border: none; background: #32cd32; color: #fff; font-weight: 800; padding: 10px 16px; border-radius: 10px; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .cg-btn-primary:disabled { opacity: 0.6; cursor: default; }
    `;
    document.head.appendChild(style);

    let cgUser = null;          // { id, name, job, img }
    let cgResults = [];         // latest search results, selected by index
    let cgSearchTimer = null;
    let cgLastCaptionIdx = -1;
    let cgDecor = null;         // stable confetti/sparkle layout for this session
    let cgForceInitials = false;

    // ---------- Inline error banner (no native alerts) ----------
    function cgShowError(msg) {
        const el = document.getElementById('cgError');
        if (!el) return;
        el.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${msg}`;
        el.style.display = 'flex';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function cgClearError() {
        const el = document.getElementById('cgError');
        if (el) { el.style.display = 'none'; el.innerHTML = ''; }
        document.getElementById('cgUserSearch')?.classList.remove('cg-invalid');
    }

    // ---------- Modal open/close ----------
    window.openCongratsBuilder = function () {
        cgUser = null;
        cgForceInitials = false;
        cgClearError();
        cgDecor = genDecor();
        const g = id => document.getElementById(id);
        g('cgSelected').style.display = 'none';
        g('cgSearchWrap').style.display = '';
        g('cgUserSearch').value = '';
        g('cgUserResults').innerHTML = '';
        resetProjects();
        g('cgCaption').value = '';
        g('cgPreviewWrap').style.display = 'none';
        g('cgGenerateBtn').style.display = '';
        g('cgPostBtn').style.display = 'none';
        g('congratsModal').style.display = 'flex';
        // collapse the normal composer if it was open
        if (typeof collapseCreatePost === 'function') collapseCreatePost();
    };
    window.closeCongratsBuilder = function () {
        document.getElementById('congratsModal').style.display = 'none';
    };

    // ---------- Who: user search ----------
    window.cgSearchUsers = function (q) {
        clearTimeout(cgSearchTimer);
        const box = document.getElementById('cgUserResults');
        q = (q || '').trim();
        if (!q) { box.innerHTML = ''; return; }
        cgSearchTimer = setTimeout(async () => {
            const { data } = await _supaHome.from('profiles')
                .select('id, full_name, avatar_url, job_title')
                .ilike('full_name', `%${q}%`).limit(6);
            cgResults = (data || []).filter(p => p.full_name).map(p => ({
                id: p.id, name: p.full_name, job: _homeValidPosition(p.job_title), img: _homeAvatarFor(p.full_name, p.avatar_url)
            }));
            box.innerHTML = cgResults.length ? cgResults.map((u, i) => `
                <div class="cg-uitem" onclick="cgSelectUser(${i})">
                    <img src="${u.img}" onerror="this.src='${avatarUrl(u.name)}'">
                    <div><div class="cg-uname">${safeText(u.name)}</div><div class="cg-ujob">${safeText(u.job)}</div></div>
                </div>`).join('') : `<div class="cg-nores">No people found</div>`;
        }, 250);
    };

    window.cgSelectUser = function (i) {
        const u = cgResults[i];
        if (!u) return;
        cgUser = u;
        cgClearError();
        document.getElementById('cgSearchWrap').style.display = 'none';
        const sel = document.getElementById('cgSelected');
        sel.style.display = 'flex';
        sel.innerHTML = `<img src="${u.img}" onerror="this.src='${avatarUrl(u.name)}'">
            <div style="flex:1;min-width:0;"><div class="cg-uname">${safeText(u.name)}</div><div class="cg-ujob">${safeText(u.job || '')}</div></div>
            <button class="cg-change" onclick="cgClearUser()">Change</button>`;
    };
    window.cgClearUser = function () {
        cgUser = null;
        document.getElementById('cgSelected').style.display = 'none';
        document.getElementById('cgSearchWrap').style.display = '';
        document.getElementById('cgUserSearch').focus();
    };

    // ---------- Caption generation ----------
    function firstName(n) { return (n || '').trim().split(/\s+/)[0] || (n || ''); }
    const CAP_TEMPLATES = [
        c => `Huge congratulations to ${c.name} on closing ${c.what}${c.amount ? ` for ${c.amount}` : ''}! 👏 Another well-earned win — wishing you many more. 🥂`,
        c => `So proud to see ${c.first} close ${c.what}${c.amount ? ` at ${c.amount}` : ''} 🙌 Consistency pays off — onto the next milestone! 🚀`,
        c => `Big win for ${c.name}! ${c.what}${c.amount ? ` sold at ${c.amount}` : ' — sold'} 🎉 This is what dedication looks like. 👏`,
        c => `Cheers to ${c.first} 🥂 Another deal closed — ${c.what}${c.amount ? ` for ${c.amount}` : ''}. Keep the momentum going! 🔥`,
        c => `Congratulations ${c.name}! 🎊 Closing ${c.what}${c.amount ? ` for ${c.amount}` : ''} is no small feat. Truly inspiring work. 💪`,
        c => `Well done ${c.first}! 👏 ${c.what}${c.amount ? ` at ${c.amount}` : ''} in the books. Your hard work is paying off — congratulations! 🎉`
    ];
    // ---------- Projects (each with its own details) ----------
    function projCardHtml() {
        return `<div class="cg-proj-card">
            <div class="cg-proj-head">
                <span class="cg-proj-num"></span>
                <button type="button" class="cg-proj-del" onclick="cgRemoveProject(this)" title="Remove project"><i class="fas fa-times"></i></button>
            </div>
            <input class="cg-input cgp-name" placeholder="Project / what was sold — e.g. Two Maridien 1BR" oninput="cgMaybeRefresh()">
            <div class="cg-row" style="margin-top:8px;">
                <div style="flex:1;"><label class="cg-label">Unit type</label>
                    <input class="cg-input cgp-type" placeholder="e.g. 2BR" oninput="cgMaybeRefresh()"></div>
                <div style="flex:1;"><label class="cg-label">No. of units</label>
                    <input class="cg-input cgp-units" type="number" min="1" step="1" placeholder="1" oninput="cgMaybeRefresh()"></div>
            </div>
            <div class="cg-row">
                <div style="flex:1;"><label class="cg-label">Amount</label>
                    <input class="cg-input cgp-amount" placeholder="₱17.5M" oninput="cgMaybeRefresh()"></div>
                <div style="flex:1;"><label class="cg-label">Parking slots <span style="color:#94a3b8;font-weight:600;">(optional)</span></label>
                    <input class="cg-input cgp-parking" type="number" min="0" step="1" placeholder="0" oninput="cgMaybeRefresh()"></div>
            </div>
        </div>`;
    }
    function renumberProjects() {
        const cards = document.querySelectorAll('#cgProjects .cg-proj-card');
        cards.forEach((c, i) => {
            c.querySelector('.cg-proj-num').textContent = `Project ${i + 1}`;
            c.querySelector('.cg-proj-del').style.visibility = cards.length > 1 ? 'visible' : 'hidden';
        });
    }
    function resetProjects() {
        document.getElementById('cgProjects').innerHTML = projCardHtml();
        renumberProjects();
    }
    window.cgAddProject = function () {
        document.getElementById('cgProjects').insertAdjacentHTML('beforeend', projCardHtml());
        renumberProjects();
        const cards = document.querySelectorAll('#cgProjects .cg-proj-card');
        cards[cards.length - 1].querySelector('.cgp-name').focus();
    };
    window.cgRemoveProject = function (btn) {
        const cards = document.querySelectorAll('#cgProjects .cg-proj-card');
        if (cards.length <= 1) return;
        btn.closest('.cg-proj-card').remove();
        renumberProjects();
        cgMaybeRefresh();
    };

    // Read every project card into structured data (only cards with a name)
    function cgProjectsData() {
        return Array.from(document.querySelectorAll('#cgProjects .cg-proj-card')).map(c => ({
            name:    c.querySelector('.cgp-name').value.trim(),
            type:    c.querySelector('.cgp-type').value.trim(),
            units:   Math.max(1, parseInt(c.querySelector('.cgp-units').value) || 1),
            amount:  c.querySelector('.cgp-amount').value.trim(),
            parking: Math.max(0, parseInt(c.querySelector('.cgp-parking').value) || 0)
        })).filter(p => p.name);
    }
    function cgProjectLabel(list) {
        const p = (list || cgProjectsData()).map(x => x.name);
        if (p.length <= 1) return p[0] || '';
        if (p.length === 2) return `${p[0]} & ${p[1]}`;
        return `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}`;
    }

    // ---------- Amount parsing / totals ----------
    function parseAmount(s) {
        if (!s) return 0;
        const m = String(s).replace(/[₱,\s]/gi, '').match(/([\d.]+)\s*([kmbt]?)/i);
        if (!m) return 0;
        let n = parseFloat(m[1]) || 0;
        const suf = (m[2] || '').toLowerCase();
        if (suf === 'k') n *= 1e3; else if (suf === 'm') n *= 1e6;
        else if (suf === 'b') n *= 1e9; else if (suf === 't') n *= 1e12;
        return n;
    }
    function fmtAmount(n) {
        if (!n) return '';
        const strip = v => v.toFixed(2).replace(/\.?0+$/, '');
        if (n >= 1e9) return '₱' + strip(n / 1e9) + 'B';
        if (n >= 1e6) return '₱' + strip(n / 1e6) + 'M';
        if (n >= 1e3) return '₱' + Math.round(n / 1e3) + 'K';
        return '₱' + Math.round(n);
    }
    function cgTotalAmount(list) {
        const items = list || cgProjectsData();
        const sum = items.reduce((t, p) => t + parseAmount(p.amount), 0);
        return sum > 0 ? fmtAmount(sum) : (items.find(p => p.amount)?.amount || '');
    }

    window.cgAutoCaption = function () {
        if (!cgUser) return;
        const projects = cgProjectsData();
        const total = cgTotalAmount(projects);
        const ctx = {
            name: cgUser.name,
            first: firstName(cgUser.name),
            what: cgProjectLabel(projects) || 'a new deal',
            amount: total
        };
        let idx;
        do { idx = Math.floor(Math.random() * CAP_TEMPLATES.length); }
        while (CAP_TEMPLATES.length > 1 && idx === cgLastCaptionIdx);
        cgLastCaptionIdx = idx;

        let text = CAP_TEMPLATES[idx](ctx);

        // Build the per-project detail string
        const detailBits = p => {
            const bits = [];
            if (p.units > 1 && p.type) bits.push(`${p.units}× ${p.type}`);
            else if (p.units > 1) bits.push(`${p.units} units`);
            else if (p.type) bits.push(p.type);
            if (p.parking) bits.push(`${p.parking} parking ${p.parking > 1 ? 'slots' : 'slot'}`);
            if (p.amount) bits.push(p.amount);
            return bits.join(', ');
        };

        if (projects.length > 1) {
            text += '\n' + projects.map(p => {
                const d = detailBits(p);
                return `• ${p.name}${d ? ` — ${d}` : ''}`;
            }).join('\n');
        } else if (projects.length === 1) {
            const p = projects[0];
            const bits = [];
            if (p.units > 1 && p.type) bits.push(`${p.units}× ${p.type}`);
            else if (p.units > 1) bits.push(`${p.units} units`);
            else if (p.type) bits.push(p.type);
            if (p.parking) bits.push(`${p.parking} parking ${p.parking > 1 ? 'slots' : 'slot'} included`);
            if (bits.length) text += ` (${bits.join(', ')})${p.parking ? ' 🅿️' : ''}`;
        }
        document.getElementById('cgCaption').value = text;
    };

    // ---------- Generate / refresh preview ----------
    window.cgGenerate = async function () {
        if (!cgUser) {
            cgShowError('Pick who you want to congratulate first.');
            document.getElementById('cgUserSearch')?.classList.add('cg-invalid');
            document.getElementById('cgUserSearch')?.focus();
            return;
        }
        cgClearError();
        const btn = document.getElementById('cgGenerateBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';
        try {
            await drawCongratsCard();
            document.getElementById('cgPreviewWrap').style.display = '';
            if (!document.getElementById('cgCaption').value.trim()) cgAutoCaption();
            btn.style.display = 'none';
            document.getElementById('cgPostBtn').style.display = '';
            playChime();
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Generate preview';
        }
    };
    window.cgMaybeRefresh = function () {
        if (document.getElementById('cgPreviewWrap').style.display !== 'none') drawCongratsCard();
    };

    // ---------- Submit ----------
    window.cgSubmit = async function () {
        if (!cgUser) return;
        const btn = document.getElementById('cgPostBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';
        try {
            const user = getUser();
            if (!user) throw new Error('You need to be signed in.');
            const { data: authData } = await _supaHome.auth.getUser();
            const canvas = document.getElementById('cgCanvas');

            let blob = await canvasToBlob(canvas);
            if (!blob) { // likely a cross-origin taint — redraw with initials and retry
                cgForceInitials = true;
                await drawCongratsCard();
                blob = await canvasToBlob(canvas);
                cgForceInitials = false;
            }
            if (!blob) throw new Error('Could not render the card image.');

            const path = `posts/congrats_${Date.now()}.png`;
            const { error: upErr } = await _supaHome.storage.from('images')
                .upload(path, blob, { upsert: true, contentType: 'image/png' });
            if (upErr) throw upErr;
            const url = _supaHome.storage.from('images').getPublicUrl(path).data.publicUrl;

            const caption = document.getElementById('cgCaption').value.trim();
            const { error: insErr } = await _supaHome.from('forum_posts').insert({
                user_id: authData?.user?.id,
                user_name: user.name,
                user_img: user.image || '',
                subject: 'Congratulations',
                content: caption,
                media_url: url,
                media_type: 'image',
                is_anonymous: false,
                source: 'home'
            });
            if (insErr) throw insErr;

            closeCongratsBuilder();
            if (typeof loadHomeFeed === 'function') loadHomeFeed();
        } catch (e) {
            cgShowError('Failed to post: ' + (e.message || e));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post to feed';
        }
    };

    function canvasToBlob(canvas) {
        return new Promise(res => { try { canvas.toBlob(res, 'image/png'); } catch (e) { res(null); } });
    }

    // ══════════════════════════════════════════════════
    //  CANVAS CARD
    // ══════════════════════════════════════════════════
    const COLORS = ['#32cd32', '#f59e0b', '#e24b4a', '#378add', '#d4537e', '#7f77dd', '#facc15'];

    function genDecor() {
        const conf = [], sp = [];
        for (let i = 0; i < 78; i++) {
            const x = Math.random() * 1080, y = Math.random() * 1080;
            // keep the central name/pill band sparse for legibility
            if (y > 560 && y < 880 && x > 220 && x < 860 && Math.random() < 0.82) continue;
            conf.push({
                x, y, rot: Math.random() * Math.PI,
                s: 6 + Math.random() * 9,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                shape: ['rect', 'circle', 'triangle'][Math.floor(Math.random() * 3)]
            });
        }
        for (let i = 0; i < 16; i++) {
            sp.push({ x: Math.random() * 1080, y: Math.random() * 1080, s: 6 + Math.random() * 11, color: Math.random() < 0.5 ? '#facc15' : '#ffffff' });
        }
        return { conf, sp };
    }

    function loadImage(url) {
        return new Promise(res => {
            if (!url) return res(null);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = url;
        });
    }

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function initials(name) {
        return ((name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();
    }

    function drawSunburst(ctx, cx, cy, R) {
        const n = 40;
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, a0, a1);
            ctx.closePath();
            ctx.fillStyle = i % 2 ? 'rgba(50,205,50,0.05)' : 'rgba(212,175,55,0.055)';
            ctx.fill();
        }
    }

    function drawConfetti(ctx, pieces) {
        pieces.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') ctx.fillRect(-p.s / 2, -p.s, p.s, p.s * 2.2);
            else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.s * 0.7, 0, 7); ctx.fill(); }
            else { ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(p.s, p.s); ctx.lineTo(-p.s, p.s); ctx.closePath(); ctx.fill(); }
            ctx.restore();
        });
    }

    function star4(ctx, x, y, s, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(0, 0, s, 0);
        ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function balloon(ctx, x, y, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, 34, 42, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 6, y + 40); ctx.lineTo(x + 6, y + 40); ctx.lineTo(x, y + 51); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y + 51); ctx.quadraticCurveTo(x + 18, y + 95, x, y + 140); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.ellipse(x - 12, y - 14, 8, 12, -0.4, 0, 7); ctx.fill();
        ctx.restore();
    }

    function drawRibbon(ctx, W) {
        const y = 132, h = 74, w = 600, x = (W - w) / 2;
        ctx.fillStyle = '#a9821a';
        ctx.beginPath(); ctx.moveTo(x - 46, y - 8); ctx.lineTo(x + 4, y); ctx.lineTo(x + 4, y + h); ctx.lineTo(x - 46, y + h + 8); ctx.lineTo(x - 24, y + h / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w + 46, y - 8); ctx.lineTo(x + w - 4, y); ctx.lineTo(x + w - 4, y + h); ctx.lineTo(x + w + 46, y + h + 8); ctx.lineTo(x + w + 24, y + h / 2); ctx.closePath(); ctx.fill();
        rr(ctx, x, y, w, h, 12); ctx.fillStyle = '#d4af37'; ctx.fill();
        rr(ctx, x + 7, y + 7, w - 14, h - 14, 8); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#3b2f0b'; ctx.font = '800 42px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('C O N G R A T U L A T I O N S', W / 2, y + h / 2 + 2);
    }

    function drawGoldFrame(ctx, W, H) {
        ctx.strokeStyle = 'rgba(212,175,55,0.75)'; ctx.lineWidth = 4;
        rr(ctx, 26, 26, W - 52, H - 52, 28); ctx.stroke();
        ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 2;
        rr(ctx, 40, 40, W - 80, H - 80, 22); ctx.stroke();
    }

    function drawBadge(ctx, x, y, emoji) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, 32, 0, 7); ctx.fillStyle = '#f59e0b'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        ctx.font = '32px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x, y + 2);
        ctx.restore();
    }

    // SOLD status chip with a checkmark. Returns the y just below the chip.
    function drawSoldChip(ctx, cx, topY) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 26px Inter, Arial, sans-serif';
        const label = 'SOLD', lw = ctx.measureText(label).width;
        const chipH = 50, chipW = lw + 96, chipY = topY;
        rr(ctx, cx - chipW / 2, chipY, chipW, chipH, chipH / 2);
        ctx.fillStyle = '#16a34a'; ctx.fill();
        const ck = cx - lw / 2 - 20, cm = chipY + chipH / 2;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ck - 9, cm + 1); ctx.lineTo(ck - 2, cm + 8); ctx.lineTo(ck + 10, cm - 8); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillText(label, cx + 14, cm + 1);
        return chipY + chipH;
    }

    // Hero gold price with flanking rules + diamond accents
    function drawHeroPrice(ctx, cx, y, amount, size) {
        ctx.fillStyle = '#f5c542'; ctx.font = `800 ${size || 84}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(amount, cx, y);
        const pw = ctx.measureText(amount).width, gap = pw / 2 + 40, len = 74;
        ctx.strokeStyle = 'rgba(245,197,66,0.5)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - gap, y); ctx.lineTo(cx - gap - len, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + gap, y); ctx.lineTo(cx + gap + len, y); ctx.stroke();
        ctx.fillStyle = 'rgba(245,197,66,0.7)';
        [cx - gap - len, cx + gap + len].forEach(dx => {
            ctx.save(); ctx.translate(dx, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
        });
    }

    // A premium "deal closed" block — single project or a per-project breakdown.
    function drawDealBlock(ctx, cx, topY, projects) {
        const chipBottom = drawSoldChip(ctx, cx, topY);

        // ── Single project: unit label → hero price → details line
        if (projects.length <= 1) {
            const p = projects[0] || { name: '', type: '', units: 1, amount: '', parking: 0 };
            let y = chipBottom + 50;
            if (p.name) {
                ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const unit = p.name.length > 30 ? p.name : spacedCaps(p.name);
                let fs = 32; ctx.font = `600 ${fs}px Inter, Arial, sans-serif`;
                while (ctx.measureText(unit).width > 960 && fs > 20) { fs -= 2; ctx.font = `600 ${fs}px Inter, Arial, sans-serif`; }
                ctx.fillText(unit, cx, y); y += 84;
            } else { y += 30; }
            if (p.amount) drawHeroPrice(ctx, cx, y, p.amount, 84);
            const details = [];
            if (p.type) details.push(p.type.toUpperCase());
            if (p.units > 1) details.push(`${p.units} UNITS`);
            if (p.parking > 0) details.push(`${p.parking} PARKING`);
            if (details.length) {
                ctx.fillStyle = '#f5c542'; ctx.font = '700 30px Inter, Arial, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(details.join('    •    '), cx, y + (p.amount ? 64 : 26));
            }
            return;
        }

        // ── Multiple projects: TOTAL hero + one line per project
        const total = cgTotalAmount(projects);
        let y = chipBottom + 34;
        ctx.fillStyle = '#a9a293'; ctx.font = '700 22px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('T O T A L   S A L E S', cx, y);
        y += 50;
        if (total) drawHeroPrice(ctx, cx, y, total, 76);

        const linesTop = y + 52;
        const avail = 1006 - linesTop;
        const lineH = Math.min(42, avail / projects.length);
        const baseFs = Math.max(15, Math.min(28, lineH - 8));
        let ly = linesTop + lineH / 2;
        projects.forEach(p => {
            const bits = [];
            if (p.type) bits.push(p.type);
            if (p.units > 1) bits.push(`${p.units} units`);
            if (p.parking > 0) bits.push(`${p.parking} pkg`);
            if (p.amount) bits.push(p.amount);
            const line = p.name + (bits.length ? `  —  ${bits.join(' · ')}` : '');
            let f = baseFs; ctx.font = `600 ${f}px Inter, Arial, sans-serif`;
            while (ctx.measureText(line).width > 1000 && f > 12) { f -= 1; ctx.font = `600 ${f}px Inter, Arial, sans-serif`; }
            ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(line, cx, ly);
            ly += lineH;
        });
    }

    function spacedCaps(s) {
        return s.toUpperCase().split('').join(' '); // hair-space between letters
    }

    async function drawCongratsCard() {
        const canvas = document.getElementById('cgCanvas');
        const ctx = canvas.getContext('2d');
        const W = 1080, H = 1080;
        const decor = cgDecor || (cgDecor = genDecor());

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H);

        const cx = W / 2, cy = 460, r = 118;

        drawSunburst(ctx, cx, cy, 760);
        drawConfetti(ctx, decor.conf);
        decor.sp.forEach(s => star4(ctx, s.x, s.y, s.s, s.color));
        drawGoldFrame(ctx, W, H);
        drawRibbon(ctx, W);
        balloon(ctx, 150, 300, '#e24b4a');
        balloon(ctx, 930, 300, '#378add');

        // avatar — dashed ring
        ctx.save();
        ctx.strokeStyle = 'rgba(50,205,50,0.45)'; ctx.setLineDash([12, 12]); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r + 20, 0, 7); ctx.stroke();
        ctx.restore();

        // avatar image / initials
        const img = cgForceInitials ? null : await loadImage(cgUser.img);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.closePath(); ctx.clip();
        if (img) {
            const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
            const iw = img.width * s, ih = img.height * s;
            ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
        } else {
            ctx.fillStyle = '#1e293b'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
            ctx.fillStyle = '#fff'; ctx.font = '600 76px Inter, Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(initials(cgUser.name), cx, cy + 2);
        }
        ctx.restore();

        // green ring + trophy badge
        ctx.strokeStyle = '#32cd32'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
        drawBadge(ctx, cx + r - 16, cy + r - 16, '🏆');

        // tagline
        ctx.fillStyle = '#facc15'; ctx.font = '700 26px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★  A  W E L L - E A R N E D  W I N  ★', cx, cy + r + 66);

        // name
        ctx.fillStyle = '#ffffff'; ctx.font = '600 66px Inter, Arial, sans-serif';
        ctx.fillText(cgUser.name, cx, cy + r + 132);

        // SOLD status + per-project deal breakdown
        drawDealBlock(ctx, cx, cy + r + 166, cgProjectsData());

        // wordmark
        ctx.fillStyle = '#64748b'; ctx.font = '600 34px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('realmate.', cx, H - 50);
    }

    // ---------- Celebration chime (Web Audio, no assets) ----------
    function playChime() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ac = new AC();
            const now = ac.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
            notes.forEach((f, i) => {
                const o = ac.createOscillator(), g = ac.createGain();
                o.type = 'triangle'; o.frequency.value = f;
                const t = now + i * 0.11;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.18, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                o.connect(g); g.connect(ac.destination);
                o.start(t); o.stop(t + 0.55);
            });
            setTimeout(() => ac.close(), 1600);
        } catch (e) { /* no-op */ }
    }
})();
