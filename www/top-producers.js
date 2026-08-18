(async function loadTopProducers() {
    const _sb = supabase.createClient(
        'https://wmegpgrfrtprhuzmgjma.supabase.co',
        'sb_publishable_Rm_fIBDUfu3DEyLj0_bWZw_qEqo8cd4'
    );

    const grid = document.getElementById('tpGrid');
    const monthLabel = document.getElementById('tpMonthLabel');
    if (!grid) return;

    // Fetch top producers and all profiles in parallel
    const [{ data, error }, { data: profiles }] = await Promise.all([
        _sb.from('top_producers').select('*').order('created_at', { ascending: true }),
        _sb.from('profiles').select('full_name, avatar_url')
    ]);

    if (error || !data || data.length === 0) {
        grid.innerHTML = '<div class="tp-empty">No top producers data yet.</div>';
        return;
    }

    // Build a name → avatar_url map from profiles (case-insensitive)
    const profileMap = {};
    (profiles || []).forEach(pr => {
        if (pr.full_name) profileMap[pr.full_name.toLowerCase().trim()] = pr.avatar_url;
    });

    if (data[0].month) monthLabel.textContent = data[0].month;

    grid.innerHTML = '';
    data.forEach((p) => {
        // Auto-match profile photo by name, fall back to stored photo_url, then initials
        const matchedAvatar = profileMap[p.name?.toLowerCase().trim()];
        const photoSrc = matchedAvatar || p.photo_url || null;

        const card = document.createElement('div');
        card.className = 'tp-card';
        card.innerHTML = `
            ${p.position ? `<div class="tp-position">${p.position}</div>` : ''}
            <div class="tp-photo-wrap">
                ${photoSrc
                    ? `<img src="${photoSrc}" class="tp-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : ''}
                <div class="tp-photo-fallback" style="${photoSrc ? 'display:none' : ''}">
                    ${(p.name || '?').charAt(0).toUpperCase()}
                </div>
            </div>
            <div class="tp-info">
                <div class="tp-name">${p.name}</div>
                <div class="tp-team">${p.team || ''}</div>
                <div class="tp-value">₱${Number(p.value / 1000000).toFixed(0)}M</div>
                <div class="tp-rank-label">${p.period ? p.period + ' • ' : ''}${p.month || ''}</div>
            </div>
        `;
        grid.appendChild(card);
    });
})();
