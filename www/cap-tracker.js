function switchMarketTab(tab) {
    const listings  = document.getElementById('listingsTabPane');
    const analytics = document.getElementById('analyticsTabPane');
    const btnL = document.getElementById('tabListings');
    const btnA = document.getElementById('tabAnalytics');

    if (tab === 'analytics') {
        listings.style.display  = 'none';
        analytics.style.display = 'block';
        btnL.classList.remove('active');
        btnA.classList.add('active');
        // Init chart when tab first opens (canvas must be visible for sizing)
        if (!_capChart) initCapTracker();
        else { _capChart.resize(); }
    } else {
        analytics.style.display = 'none';
        listings.style.display  = 'block';
        btnA.classList.remove('active');
        btnL.classList.add('active');
    }
}

const CAP_PROJECTS = [
    {
        id: 'sequoia',
        name: 'Sequoia',
        sub: 'Alveo Land · Two Serendra, BGC, Taguig',
        currentPrice: '₱295K – ₱315K',
        currentLabel: 'per sqm · 2026 (Current)',
        data: [
            { year: 2012, price: 112000, phase: 'Launch Phase' },
            { year: 2013, price: 125000, phase: 'Preselling' },
            { year: 2014, price: 138000, phase: 'Preselling' },
            { year: 2015, price: 152000, phase: 'Mid-Construction' },
            { year: 2016, price: 168000, phase: 'Structural Completion' },
            { year: 2017, price: 185000, phase: 'Pre-Turnover' },
            { year: 2018, price: 210000, phase: 'Turnover Year' },
            { year: 2019, price: 235000, phase: 'Peak RFO Market' },
            { year: 2020, price: 240000, phase: 'Pandemic Stagnation' },
            { year: 2021, price: 230000, phase: 'Pandemic Adjustment' },
            { year: 2022, price: 245000, phase: 'Recovery Phase' },
            { year: 2023, price: 265000, phase: 'Post-Pandemic Climb' },
            { year: 2024, price: 280000, phase: 'Mature Asset Phase' },
            { year: 2025, price: 290000, phase: 'Established RFO' },
            { year: 2026, price: 305000, phase: 'Stabilized Market', isCurrent: true },
        ],
        annotations: [
            { year: 2018, label: 'Turnover', color: '#f59e0b' },
            { year: 2020, label: 'Pandemic', color: '#ef4444' },
            { year: 2022, label: 'Recovery', color: '#32cd32' },
        ],
        takeaways: [
            { icon: 'fa-arrow-trend-up', title: 'Turnover Bump', body: 'Sharpest value jump between 2017–2019 as the project transitioned from paper to physical inventory.' },
            { icon: 'fa-shield-halved', title: 'Pandemic Resilience', body: 'Held ground during 2020–2021 downturn. Serendra\'s limited green space acted as a natural price floor.' },
            { icon: 'fa-building', title: 'Replacement Cost Edge', body: 'New Alveo BGC launches price significantly higher, making Sequoia competitive for immediate cash flow.' },
        ],
        totalGain: null,
        rentalYield: {
            unitSqm: 32,
            monthlyRent: 38000,
            propertyCost: 9760000,
            annualCost: 62000,
            costBreakdown: [
                { label: 'Purchase Price', value: '₱9,120,000' },
                { label: 'Taxes & Charges', value: '₱480,000' },
                { label: 'Furnishing & Renovation', value: '₱160,000' },
            ],
            annualCostBreakdown: [
                { label: 'RPT', value: '₱12,000' },
                { label: 'Association Dues', value: '₱36,000' },
                { label: 'Insurance', value: '₱8,000' },
                { label: "Broker's Commission", value: '₱6,000' },
            ],
        },
    },
    {
        id: 'verve1',
        name: 'Verve Tower 1',
        sub: 'Alveo Land · High Street South, BGC, Taguig',
        currentPrice: '₱280K – ₱305K',
        currentLabel: 'per sqm · 2026 (Current)',
        data: [
            { year: 2013, price: 135000, phase: 'Launch Phase' },
            { year: 2014, price: 145000, phase: 'Preselling' },
            { year: 2015, price: 158000, phase: 'Preselling' },
            { year: 2016, price: 172000, phase: 'Mid-Construction' },
            { year: 2017, price: 190000, phase: 'Topping Out' },
            { year: 2018, price: 215000, phase: 'Initial Turnover' },
            { year: 2019, price: 240000, phase: 'Full Operations' },
            { year: 2020, price: 245000, phase: 'Pandemic Flatline' },
            { year: 2021, price: 235000, phase: 'Pandemic Correction' },
            { year: 2022, price: 250000, phase: 'Recovery Window' },
            { year: 2023, price: 262000, phase: 'Post-Pandemic Resurgence' },
            { year: 2024, price: 270000, phase: 'Stabilized Yield Asset' },
            { year: 2025, price: 278000, phase: 'Established High-Street Footprint' },
            { year: 2026, price: 292500, phase: 'Mature Market Reality', isCurrent: true },
        ],
        annotations: [
            { year: 2018, label: 'Turnover', color: '#f59e0b' },
            { year: 2020, label: 'Pandemic', color: '#ef4444' },
            { year: 2022, label: 'Recovery', color: '#32cd32' },
        ],
        takeaways: [
            { icon: 'fa-building', title: 'Corporate Demand Driver', body: 'Rental demand anchored by multinational corporate tenants in High Street South, providing a strong price floor even during downturns.' },
            { icon: 'fa-shield-halved', title: 'Pandemic Resilience', body: 'High-density corporate area saw a temporary freeze in 2020 but recovered quickly as hybrid office setups revitalized demand by 2022.' },
            { icon: 'fa-arrow-trend-up', title: 'Low Inventory Advantage', body: 'Very few new inventory additions nearby keep valuations elevated and support steady appreciation into 2025–2026.' },
        ],
        totalGain: null,
        rentalYield: null,
    },
    {
        id: 'verve2',
        name: 'Verve Tower 2',
        sub: 'Alveo Land · High Street South, BGC, Taguig',
        currentPrice: '₱278K – ₱298K',
        currentLabel: 'per sqm · 2026 (Current)',
        data: [
            { year: 2015, price: 150000, phase: 'Launch Phase' },
            { year: 2016, price: 162000, phase: 'Preselling' },
            { year: 2017, price: 178000, phase: 'Mid-Construction' },
            { year: 2018, price: 198000, phase: 'Structural Completion' },
            { year: 2019, price: 225000, phase: 'Initial Turnover' },
            { year: 2020, price: 230000, phase: 'Pandemic Lockdown' },
            { year: 2021, price: 220000, phase: 'Pandemic Correction' },
            { year: 2022, price: 240000, phase: 'Rebound Phase' },
            { year: 2023, price: 258000, phase: 'Post-Pandemic Adjustment' },
            { year: 2024, price: 268000, phase: 'Stabilized Asset Phase' },
            { year: 2025, price: 275000, phase: 'Established RFO' },
            { year: 2026, price: 288000, phase: 'Mature Market Reality', isCurrent: true },
        ],
        annotations: [
            { year: 2019, label: 'Turnover', color: '#f59e0b' },
            { year: 2020, label: 'Pandemic', color: '#ef4444' },
            { year: 2022, label: 'Rebound', color: '#32cd32' },
        ],
        takeaways: [
            { icon: 'fa-triangle-exclamation', title: 'Pandemic Turnover Timing', body: 'Turnover crashed directly into the pandemic onset, stretching RFO timelines and temporarily depressing secondary market values in 2021.' },
            { icon: 'fa-building-columns', title: 'BGC Scarcity Premium', body: 'Absolute scarcity of raw land in the district protects value — replacement cost for new launches far exceeds current secondary market pricing.' },
            { icon: 'fa-arrow-trend-up', title: 'Rapid Post-Pandemic Recovery', body: 'Reopening of BGC corporate hubs drove rental demand sharply back, recovering all pandemic losses and pushing beyond pre-pandemic highs by 2022.' },
        ],
        totalGain: null,
        rentalYield: null,
    },
    {
        id: 'onemaridien',
        name: 'One Maridien',
        sub: 'Alveo Land · High Street South, BGC, Taguig',
        currentPrice: '₱285K – ₱310K',
        currentLabel: 'per sqm · 2026 (Current)',
        data: [
            { year: 2012, price: 122000, phase: 'Launch Phase' },
            { year: 2013, price: 132000, phase: 'Preselling' },
            { year: 2014, price: 144000, phase: 'Preselling' },
            { year: 2015, price: 158000, phase: 'Mid-Construction' },
            { year: 2016, price: 175000, phase: 'Initial Turnover' },
            { year: 2017, price: 195000, phase: 'Full Operations' },
            { year: 2018, price: 220000, phase: 'Peak RFO Growth' },
            { year: 2019, price: 245000, phase: 'Pre-Pandemic High' },
            { year: 2020, price: 240000, phase: 'Pandemic Flatline' },
            { year: 2021, price: 232000, phase: 'Pandemic Correction' },
            { year: 2022, price: 248000, phase: 'Rebound Phase' },
            { year: 2023, price: 265000, phase: 'Post-Pandemic Adjustment' },
            { year: 2024, price: 275000, phase: 'Premium Parkside Asset' },
            { year: 2025, price: 282000, phase: 'Matured Holding' },
            { year: 2026, price: 297500, phase: 'Stabilized Market', isCurrent: true },
        ],
        annotations: [
            { year: 2016, label: 'Turnover', color: '#f59e0b' },
            { year: 2020, label: 'Pandemic', color: '#ef4444' },
            { year: 2022, label: 'Rebound', color: '#32cd32' },
        ],
        takeaways: [
            { icon: 'fa-arrow-trend-up', title: 'Early Turnover Advantage', body: 'RFO status by late 2016–2017 let One Maridien fully ride the pre-pandemic corporate rental boom, locking in strong tenancy before the market freeze.' },
            { icon: 'fa-tree', title: 'Permanent Park Premium', body: 'Park-facing units command an explicit premium as the adjacent green space is a permanent, irreplaceable asset — a rare feature in BGC\'s dense urban fabric.' },
            { icon: 'fa-lock', title: 'High Retention Supply Lock', body: 'A high owner-retention rate limits active secondary market supply, keeping price floors firm and giving sellers strong negotiating leverage.' },
        ],
        totalGain: null,
        rentalYield: null,
    },
    {
        id: 'twomaridien',
        name: 'Two Maridien',
        sub: 'Alveo Land · High Street South, BGC, Taguig',
        currentPrice: '₱285K – ₱310K',
        currentLabel: 'per sqm · 2026 (Current)',
        launchLayouts: [
            { type: 'Studio', sqm: '36–38 sqm', range: '₱4.4M – ₱5.0M' },
            { type: '1-Bedroom', sqm: '64–69 sqm', range: '₱7.8M – ₱9.2M' },
            { type: '2-Bedroom', sqm: '93–97 sqm', range: '₱11.5M – ₱13.0M' },
            { type: '3-Bedroom', sqm: '~128 sqm', range: '₱16.0M – ₱18.5M' },
        ],
        data: [
            { year: 2012, price: 125000, phase: 'Launch Phase' },
            { year: 2013, price: 135000, phase: 'Preselling' },
            { year: 2014, price: 146000, phase: 'Preselling' },
            { year: 2015, price: 160000, phase: 'Mid-Construction' },
            { year: 2016, price: 178000, phase: 'Structural Completion' },
            { year: 2017, price: 200000, phase: 'Initial Turnover' },
            { year: 2018, price: 225000, phase: 'Full Operations' },
            { year: 2019, price: 248000, phase: 'Pre-Pandemic High' },
            { year: 2020, price: 242000, phase: 'Pandemic Flattening' },
            { year: 2021, price: 235000, phase: 'Pandemic Correction' },
            { year: 2022, price: 250000, phase: 'Rebound Phase' },
            { year: 2023, price: 268000, phase: 'Post-Pandemic Adjustment' },
            { year: 2024, price: 276000, phase: 'Matured High-Street Asset' },
            { year: 2025, price: 284000, phase: 'Stabilized RFO' },
            { year: 2026, price: 297500, phase: 'Mature Market Reality', isCurrent: true },
        ],
        annotations: [
            { year: 2017, label: 'Turnover', color: '#f59e0b' },
            { year: 2020, label: 'Pandemic', color: '#ef4444' },
            { year: 2022, label: 'Rebound', color: '#32cd32' },
        ],
        takeaways: [
            { icon: 'fa-arrow-trend-up', title: 'Peak Expat Absorption', body: 'Turnover aligned perfectly with the 2017–2019 expat and corporate relocation boom, driving immediate strong secondary market velocity.' },
            { icon: 'fa-shield-halved', title: 'Pandemic Resilience', body: 'Values dipped only 5.2% from peak to trough — one of the narrowest corrections among BGC RFO assets during 2020–2021.' },
            { icon: 'fa-city', title: 'Land Scarcity Floor', body: 'Complete absence of new land blocks nearby means no new supply can compete — supporting a permanent structural floor on valuations.' },
        ],
        totalGain: null,
        rentalYield: null,
    }
];


// compute total gain, CAGR, and rental yields
CAP_PROJECTS.forEach(p => {
    const first = p.data[0];
    const last  = p.data[p.data.length - 1];
    p.totalGain = (((last.price - first.price) / first.price) * 100).toFixed(0);
    const n = last.year - first.year;
    p.cagr = n > 0 ? (((last.price / first.price) ** (1 / n) - 1) * 100).toFixed(1) : null;
    if (p.rentalYield) {
        const ry = p.rentalYield;
        const annualRent = ry.monthlyRent * 12;
        ry.annualRent = annualRent;
        ry.grossYield = ((annualRent / ry.propertyCost) * 100).toFixed(2);
        ry.netYield   = (((annualRent - ry.annualCost) / ry.propertyCost) * 100).toFixed(2);
    }
});

let _capChart = null;
let _activeProject = CAP_PROJECTS[0];

function initCapTracker() {
    renderProjectTabs();
    renderCapProject(_activeProject);
}

function renderProjectTabs() {
    const wrap = document.getElementById('capProjectTabs');
    if (!wrap) return;
    wrap.innerHTML = CAP_PROJECTS.map(p => `
        <button onclick="switchCapProject('${p.id}')" id="capTab-${p.id}"
            style="padding:7px 16px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer;
                   border:1.5px solid ${p.id === _activeProject.id ? '#32cd32' : '#e2e8f0'};
                   background:${p.id === _activeProject.id ? '#32cd32' : '#fff'};
                   color:${p.id === _activeProject.id ? '#fff' : '#64748b'};
                   transition:all 0.2s;">
            ${p.name}
        </button>
    `).join('');
}

function switchCapProject(id) {
    _activeProject = CAP_PROJECTS.find(p => p.id === id) || CAP_PROJECTS[0];
    renderProjectTabs();
    renderCapProject(_activeProject);
}

function renderCapProject(project) {
    document.getElementById('capProjectName').textContent  = project.name + ' — ' + project.sub.split('·')[1]?.trim();
    document.getElementById('capProjectSub').textContent   = project.sub;
    document.getElementById('capCurrentPrice').textContent = project.currentPrice;
    document.getElementById('capCurrentLabel').textContent = project.currentLabel;

    // Stat pills
    const first = project.data[0];
    const last  = project.data[project.data.length - 1];
    document.getElementById('capStatPills').innerHTML = `
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Launch Price</div>
            <div style="font-size:15px;font-weight:800;color:#fff;margin-top:2px;">₱${(first.price/1000).toFixed(0)}K<span style="font-size:10px;font-weight:500;color:#64748b;margin-left:3px;">/sqm</span></div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Capital Appreciation</div>
            <div style="font-size:15px;font-weight:800;color:#32cd32;margin-top:2px;">+${project.totalGain}%</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">CAGR</div>
            <div style="font-size:15px;font-weight:800;color:#32cd32;margin-top:2px;">${project.cagr ? '+' + project.cagr + '%' : '—'}<span style="font-size:10px;font-weight:500;color:#64748b;margin-left:3px;">/yr</span></div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Timeline</div>
            <div style="font-size:15px;font-weight:800;color:#fff;margin-top:2px;">${first.year} – ${last.year}</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Data Points</div>
            <div style="font-size:15px;font-weight:800;color:#fff;margin-top:2px;">${project.data.length} yrs</div>
        </div>
    `;

    // Annotations row
    document.getElementById('capAnnotations').innerHTML = project.annotations.map(a => `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8;font-weight:600;">
            <span style="width:10px;height:10px;border-radius:50%;background:${a.color};flex-shrink:0;display:inline-block;"></span>
            ${a.year} · ${a.label}
        </div>
    `).join('');

    // Takeaways
    document.getElementById('capTakeaways').innerHTML = project.takeaways.map(t => `
        <div style="background:#fff;border-radius:16px;padding:18px 20px;border:1px solid #e2e8f0;display:flex;gap:14px;align-items:flex-start;">
            <div style="width:36px;height:36px;border-radius:10px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fas ${t.icon}" style="color:#32cd32;font-size:15px;"></i>
            </div>
            <div>
                <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:4px;">${t.title}</div>
                <div style="font-size:12px;color:#64748b;line-height:1.5;">${t.body}</div>
            </div>
        </div>
    `).join('');

    renderRentalYield(project);
    buildChart(project);
}

function renderRentalYield(project) {
    const wrap = document.getElementById('capRentalYield');
    if (!wrap) return;
    const ry = project.rentalYield;
    if (!ry) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    wrap.innerHTML = `
        <div style="margin-top:24px; border-top:1px solid rgba(255,255,255,0.06); padding-top:20px;">
            <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px;">
                <i class="fas fa-house-chimney" style="color:#32cd32;margin-right:6px;"></i>Rental Yield
            </div>

            <!-- Yield result pills -->
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
                <div style="flex:1;min-width:130px;background:rgba(50,205,50,0.08);border:1px solid rgba(50,205,50,0.2);border-radius:12px;padding:12px 16px;text-align:center;">
                    <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Gross Rental Yield</div>
                    <div style="font-size:22px;font-weight:900;color:#32cd32;margin-top:4px;">${ry.grossYield}%</div>
                    <div style="font-size:10px;color:#64748b;margin-top:2px;">Annual Rent ÷ Property Cost</div>
                </div>
                <div style="flex:1;min-width:130px;background:rgba(50,205,50,0.05);border:1px solid rgba(50,205,50,0.15);border-radius:12px;padding:12px 16px;text-align:center;">
                    <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Net Rental Yield</div>
                    <div style="font-size:22px;font-weight:900;color:#32cd32;margin-top:4px;">${ry.netYield}%</div>
                    <div style="font-size:10px;color:#64748b;margin-top:2px;">(Rent − Costs) ÷ Property Cost</div>
                </div>
            </div>

            <!-- Breakdown tables side by side -->
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <div style="flex:1;min-width:140px;background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 14px;">
                    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Property Costs</div>
                    ${ry.costBreakdown.map(r => `
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                            <span>${r.label}</span><span style="font-weight:700;">${r.value}</span>
                        </div>`).join('')}
                    <div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 0 0;color:#fff;font-weight:800;">
                        <span>Total</span><span style="color:#32cd32;">₱${ry.propertyCost.toLocaleString()}</span>
                    </div>
                </div>
                <div style="flex:1;min-width:140px;background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 14px;">
                    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Annual Costs</div>
                    ${ry.annualCostBreakdown.map(r => `
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                            <span>${r.label}</span><span style="font-weight:700;">${r.value}</span>
                        </div>`).join('')}
                    <div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 0 0;color:#fff;font-weight:800;">
                        <span>Total</span><span style="color:#32cd32;">₱${ry.annualCost.toLocaleString()}</span>
                    </div>
                    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:2px 0;">
                            <span>Monthly Rent</span><span style="font-weight:700;">₱${ry.monthlyRent.toLocaleString()}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:2px 0;">
                            <span>Annual Rent</span><span style="font-weight:700;">₱${ry.annualRent.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function buildChart(project) {
    const ctx = document.getElementById('capChartCanvas');
    if (!ctx) return;

    if (_capChart) { _capChart.destroy(); _capChart = null; }

    const labels = project.data.map(d => d.year.toString());
    const prices = project.data.map(d => d.price);
    const isMobile = window.innerWidth < 600;

    // Gradient fill
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, isMobile ? 180 : 240);
    gradient.addColorStop(0,   'rgba(50,205,50,0.25)');
    gradient.addColorStop(0.6, 'rgba(50,205,50,0.06)');
    gradient.addColorStop(1,   'rgba(50,205,50,0)');

    // Annotation point colors
    const annMap = {};
    project.annotations.forEach(a => { annMap[a.year] = a.color; });
    const pointColors = project.data.map(d => annMap[d.year] || (d.isCurrent ? '#32cd32' : 'rgba(50,205,50,0.7)'));
    const pointRadius = project.data.map(d => annMap[d.year] || d.isCurrent ? 6 : 3);

    _capChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: prices,
                borderColor: '#32cd32',
                borderWidth: 2.5,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#0f172a',
                pointBorderWidth: 1.5,
                pointRadius: pointRadius,
                pointHoverRadius: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#94a3b8',
                    bodyColor: '#fff',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        title: items => items[0].label,
                        label: item => {
                            const d = project.data[item.dataIndex];
                            return [
                                ' ₱' + Number(item.raw).toLocaleString() + ' / sqm',
                                ' ' + d.phase
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: '#475569',
                        font: { size: isMobile ? 9 : 11, weight: '600' },
                        maxRotation: isMobile ? 45 : 0,
                    }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#475569',
                        font: { size: isMobile ? 9 : 11, weight: '600' },
                        callback: v => '₱' + (v / 1000).toFixed(0) + 'K'
                    }
                }
            }
        }
    });
}

// Chart initializes on first click of Analytics tab, not on page load

/* ── Mini chart in sticky bar ── */
let _miniChart = null;

const _miniCharts = {};

function buildMiniChartCard(project) {
    const id = project.id;
    const tooltipId = `miniTip_${id}`;

    // Create card element
    const card = document.createElement('div');
    card.id = `miniCard_${id}`;
    card.style.cssText = 'position:relative;flex-shrink:0;width:224px;height:126px;border-radius:10px;overflow:hidden;background:#0f172a;box-shadow:0 2px 10px rgba(0,0,0,0.18);cursor:pointer;';
    card.innerHTML = `
        <div style="position:absolute;top:6px;left:8px;right:8px;z-index:5;pointer-events:none;">
            <div style="font-size:9px;font-weight:800;color:#fff;letter-spacing:0.3px;line-height:1.2;">${project.name} · ${project.sub.split('·')[1]?.trim()}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <div style="font-size:11px;font-weight:800;color:#32cd32;letter-spacing:-0.3px;">${project.currentPrice} <span style="font-size:8px;color:#64748b;font-weight:600;">/sqm</span></div>
                <div id="miniGain_${id}" style="background:rgba(50,205,50,0.15);border:1px solid rgba(50,205,50,0.3);border-radius:6px;padding:2px 6px;font-size:9px;font-weight:800;color:#32cd32;">+${project.totalGain}%</div>
            </div>
        </div>
        <canvas id="miniCanvas_${id}" style="position:absolute;inset:0;width:100%!important;height:100%!important;"></canvas>
        <div onclick="miniChartOpenAnalytics()" style="position:absolute;inset:0;z-index:6;cursor:pointer;"></div>
        <div id="${tooltipId}" style="display:none;position:absolute;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.95);border:1px solid #334155;border-radius:8px;padding:5px 10px;pointer-events:none;z-index:20;white-space:nowrap;text-align:center;">
            <div class="mty_${id}" style="font-size:9px;color:#64748b;font-weight:700;"></div>
            <div class="mtp_${id}" style="font-size:12px;color:#32cd32;font-weight:800;"></div>
            <div class="mph_${id}" style="font-size:9px;color:#94a3b8;font-weight:600;"></div>
        </div>
        <div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);pointer-events:none;">
            <span style="font-size:8px;color:rgba(255,255,255,0.3);font-weight:600;white-space:nowrap;">Tap for full analytics</span>
        </div>
    `;
    return card;
}

function buildMiniChartCanvas(project) {
    const id = project.id;
    const ctx = document.getElementById(`miniCanvas_${id}`);
    if (!ctx || _miniCharts[id]) return;

    const prices = project.data.map(d => d.price);
    const labels = project.data.map(d => String(d.year));
    const firstYear = project.data[0].year;
    const lastYear  = project.data[project.data.length - 1].year;
    const midYear   = Math.round((firstYear + lastYear) / 2);

    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 126);
    gradient.addColorStop(0, 'rgba(50,205,50,0.35)');
    gradient.addColorStop(1, 'rgba(50,205,50,0)');

    const annMap = {};
    project.annotations.forEach(a => { annMap[a.year] = a.color; });

    const pointRadii  = project.data.map(d => annMap[d.year] ? 4 : (d.isCurrent ? 4 : 0));
    const pointColors = project.data.map(d => annMap[d.year] || (d.isCurrent ? '#32cd32' : 'transparent'));
    const pointBorder = project.data.map(d => annMap[d.year] ? '#0f172a' : (d.isCurrent ? '#0f172a' : 'transparent'));
    const tooltipId   = `miniTip_${id}`;

    _miniCharts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: prices,
                borderColor: '#32cd32',
                borderWidth: 2,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: pointRadii,
                pointBackgroundColor: pointColors,
                pointBorderColor: pointBorder,
                pointBorderWidth: 1.5,
                pointHoverRadius: pointRadii.map(r => Math.max(r, 5)),
                pointHoverBackgroundColor: pointColors,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 1.5,
            }]
        },
        options: {
            responsive: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: function(context) {
                        const tip = document.getElementById(tooltipId);
                        if (!tip) return;
                        if (context.tooltip.opacity === 0) { tip.style.display = 'none'; return; }
                        const idx = context.tooltip.dataPoints?.[0]?.dataIndex;
                        if (idx === undefined) return;
                        const d = project.data[idx];
                        tip.querySelector(`.mty_${id}`).textContent = d.year;
                        tip.querySelector(`.mtp_${id}`).textContent = '₱' + Number(d.price).toLocaleString() + ' /sqm';
                        tip.querySelector(`.mph_${id}`).textContent = d.phase;
                        tip.style.display = 'block';
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#475569',
                        font: { size: 8, weight: '700' },
                        maxRotation: 0,
                        callback: function(val) {
                            const year = parseInt(this.getLabelForValue(val));
                            return [firstYear, midYear, lastYear].includes(year) ? year : '';
                        }
                    }
                },
                y: { display: false }
            }
        }
    });
}

function initMiniChart() {
    const row = document.getElementById('miniChartsRow');
    if (!row) return;

    // Clear existing static card (Sequoia was hardcoded in HTML)
    const staticCard = document.getElementById('miniChartSection');
    if (staticCard) staticCard.remove();

    CAP_PROJECTS.forEach(project => {
        if (_miniCharts[project.id]) return;
        const card = buildMiniChartCard(project);
        row.appendChild(card);
        setTimeout(() => {
            buildMiniChartCanvas(project);
            if (project.cagr) {
                const badge = document.getElementById(`miniGain_${project.id}`);
                if (badge) badge.innerHTML = `+${project.totalGain}% <span style="font-size:8px;color:#a3e635;font-weight:600;">· ${project.cagr}%/yr</span>`;
            }
        }, 50);
    });

    // Duplicate cards for seamless scrolling loop (like ticker)
    setTimeout(() => {
        const cards = row.querySelectorAll('[id^="miniCard_"]');
        cards.forEach(card => {
            const clone = card.cloneNode(true);
            clone.id = clone.id + '_clone';
            clone.querySelectorAll('canvas').forEach(c => c.remove());
            row.appendChild(clone);
        });
    }, 200);
}

function miniChartOpenAnalytics() {
    location.href = 'analytics.html';
}

// Auto-init full chart on analytics page
if (location.pathname.endsWith('analytics.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        initCapTracker();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (location.pathname.endsWith('analytics.html')) return;
    if (localStorage.getItem('rm_show_graphs') === '0') {
        const row = document.getElementById('miniChartsRow');
        if (row) row.style.display = 'none';
        return;
    }
    setTimeout(() => initMiniChart(), 300);
});
