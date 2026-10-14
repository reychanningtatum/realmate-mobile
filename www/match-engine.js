// ═══════════════════════════════════════════════════════════════════════════
// RM_MATCH — shared AI Match Engine (window.RM_MATCH)
// ───────────────────────────────────────────────────────────────────────────
// The text-parsing + scoring core of the AI Match Engine, extracted verbatim
// from livemarket.js so it can be the SINGLE SOURCE OF TRUTH for matching on
// EVERY page — not just the Portal. livemarket.js destructures these back out
// of window.RM_MATCH (so all its existing bare-name callers keep working), and
// the global match-alert.js uses parseListing/computeMatchScore to detect new
// matches in real time from any page.
//
// Only dependency on the rest of the app is window.RM_LOC (location-engine.js),
// which must load before this script, and localStorage (learned projects).
// This file leaks NO globals — everything is exposed under window.RM_MATCH only,
// so it is safe to load on every page without colliding with page scripts.
// ═══════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    // ── Complementary category pairing (required for any match) ──
    const PARTNER_MAP = {
        "FOR SALE": "WILLING TO BUY", "WILLING TO BUY": "FOR SALE",
        "FOR RENT": "WILLING TO RENT",  "WILLING TO RENT": "FOR RENT",
        "FOR LEASE": "WILLING TO LEASE","WILLING TO LEASE": "FOR LEASE"
    };

    // ── "Possible use" detection — a type keyword describing a POSSIBLE USE
    // ("ideal for a 2-bedroom conversion") rather than the asset being offered.
    function _hlUseMention(text, s, e) {
        const before = text.slice(0, s);
        const sentStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'),
                                   before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
        const rel = text.slice(e).search(/[.!?\n]/);
        const sentEnd = rel === -1 ? text.length : e + rel;
        const pre  = text.slice(sentStart, s).toLowerCase();
        const post = text.slice(e, sentEnd).toLowerCase();
        if (/^\s*(?:development|redevelopment|project|subdivision|banking|conversion|business|venture|rental|opportunit(?:y|ies)|purposes?)\b/.test(post)) return true;
        if (/\b(?:suitable|ideal|perfect|great|good|best|fit|fitting|recommended|zoned|primed)\s+(?:for|as)\b/.test(pre)) return true;
        if (/\b(?:convert(?:ed|ible)?|use[d]?|turn(?:ed)?)\s+(?:in)?to\b/.test(pre)) return true;
        if (/\b(?:convert(?:ed|ible)?|use[d]?)\s+as\b/.test(pre)) return true;
        if (/\bpotential(?:ly)?\s+(?:for|as)\b/.test(pre)) return true;
        if (/\b(?:can|could|may|might|would)\s+be\s+(?:converted|used|turned|developed|transformed)\b/.test(pre)) return true;
        return false;
    }
    // A post offering a WHOLE property — a building, warehouse, compound, hotel —
    // describes what it contains ("30 units", "9 units at 25 sqm (Studio Type)",
    // "1 unit at 41 sqm 1 bedroom"). Those are its composition, not units for
    // sale, so the property type is the building and no unit type is derived.
    // Returns the type label, or '' when the post is about a unit / lot / house.
    function _wholeProperty(text) {
        const t = String(text || '').replace(/\r/g, '');
        const TYPES = [
            [/\boffice\s+building\b/, 'Office Building'],
            [/\bcommercial\s+building\b/, 'Commercial Building'],
            [/\bapartment\s+(?:building|complex)\b/, 'Apartment Building'],
            [/\b(?:residential|mixed[\s-]*use|\d+[\s-]*(?:store?y|stories|storeys|floors?|levels?))\s+building\b/, 'Building'],
            [/\bbuilding\s+for\s+(?:sale|lease|rent)\b/, 'Building'],
            [/\bwarehouse\b/, 'Warehouse'],
            [/\b(?:hotel|dormitory|boarding\s+house)\b/, 'Building'],
        ];
        for (const [re, label] of TYPES) if (_hlSubject(t, re)) return label;
        return '';
    }

    // Does `re` occur as a genuine SUBJECT anywhere (ignoring possible-use mentions)?
    function _hlSubject(text, re) {
        const g = new RegExp(re.source, 'gi');
        let m;
        while ((m = g.exec(text))) {
            if (!_hlUseMention(text, m.index, m.index + m[0].length)) return true;
        }
        return false;
    }

    // ── Known projects (official + notable) ──
    const KNOWN_PROJECTS = [
        // ── Official Alveo Land Projects ──────────────────────────
        'One Maridien','Two Maridien','Verve One','Verve Two',
        'Park Triangle Residences','Park Triangle','Gentry Residences','Park East Place',
        'Two Serendra','Kroma','Lerato',
        'The Columns Ayala Avenue','The Columns Legazpi Village',
        'Senta','Mondia','Treveia','Venare','Lumira','Mirala',
        'Venido','Aveia','Evo Commercial Lot','The Residences At Evo City',
        // ── Other known projects ──────────────────────────────────
        'TREC','The Residences At Greenbelt',

        // ── Ayala Land Premier — villages & estates (1950s–2020s) ──
        'Forbes Park','Bel-Air Village','Dasmarinas Village','Urdaneta Village',
        'Magallanes Village','Ayala Alabang Village','Ayala Heights',
        'Ayala North Point','Ayala Westgrove Heights','Ayala Southvale Village',
        'Ayala Greenfield Estates','Ayala Hillside Estates','Montgomery Place',
        'Anvaya Cove','Alegria Hills','Montecito','Santierra','Elaro','Abrio',
        'Soliento','Riomonte','Cerilo','Andacillo','Arcilo','Luscara',
        'Lanewood Hills','Crescent Grove at Vermosa','The Courtyards at Vermosa',
        'Park Estates at Alviera','Ciela at Aera Heights','Virendo','Miravera',
        'The Enclaves at North Point',

        // ── Ayala Land Premier — buildings / condominiums ──────────
        'One Salcedo','One Roxas Triangle','Two Roxas Triangle','One Legazpi Park',
        'One Serendra','Park Terraces','1016 Residences',
        'The Suites at One Bonifacio High Street','Garden Towers',
        'Park Point Residences','East Gallery Place','West Gallery Place',
        'Park Central Towers','Arbor Lanes','Gardencourt Residences',
        'Parklinks North Tower','Parklinks South Tower','The Alcoves',
        'One Vertis Plaza','Enara','The Residences at Azuela Cove',
        'Laurean Residences',
        // Confirmed real ALP projects (see note): 'Amara' is safe because the
        // fuzzy matcher now skips brand tokens, so it no longer collides with the
        // 'Amaia' brand. 'Twin Towers' and 'Park Villas' are intentionally NOT
        // added — too generic as substrings (would false-tag ordinary text).
        'Amara','Greenbelt Townhouse','The Suites at One Bonifacio',

        // ── Alveo Land — residential lots / house-and-lot ──────────
        'Verdana Homes Bacoor','Verdana Homes Mamplasan','Sereneo',
        'Hillside Ridge','Ardia at Vermosa','Caleia','Verdea','South Palmgrove',
        'Bayview Heights','The Greenways at Alviera','Corvia','Versala','Montala',
        'Ferndale Villas','Asyana',

        // ── Alveo Land — condominiums / residential units ─────────
        'Celadon Residences','Celadon Park','Solstice','High Park Vertis',
        'Ametta Place','Verve Residences','The Sandstone at Portico','Sedona Parc',
        'Solinea','Cerule at Solinea','Marquee Residences','Marquee Place',
        'Abreeza Residences','Abreeza Place','Patio Suites','The Ametrine at Portico',
        'Kasa Luntian','Astela','Callisto','The Lattice at Parklinks','Orean Place',
        'Nuveo','Viento','Sentrove','Park Cascades','Mergent Residences',
        'Parkford Suites',
        // Alveo — Arca South. 'Veranda' is an everyday word (a porch), so it is
        // gated by AMBIGUOUS_WORD_PROJECTS: accepted only as a proper-noun mention
        // ("North Veranda", "The Veranda", "Veranda Residences"), never as a feature.
        'Veranda',

        // ── Alveo Land — commercial lots & offices ────────────────
        'Westborough','Evo City Commercial','Centrala','BPI Cebu Corporate Centre',
        'High Street South Corporate Plaza','Stiles Enterprise Plaza',
        'Gentry Corporate Plaza','Alveo Financial Tower','Tryne Enterprise Plaza',
    ];

    // ── Price intelligence ──────────────────────────────────────────────────
    // Captions are free text, so a number is only a price when it READS like one.
    // Every amount in the caption becomes a candidate and is scored on the
    // evidence around it — peso sign, K/M unit, "price"/"rent" wording, "/month",
    // "negotiable" — while figures that are clearly something else ("1 month",
    // "2 months deposit", "80sqm", "2BR", unit/phone numbers) are skipped and
    // side amounts (dues, deposit, parking, per-sqm) rank below the asking price.
    // The best-scoring candidate wins; ties go to the one written first.
    const _PRICE_NUM = /(₱|\bphp\.?|\bpesos?|\bp(?=\s?\d))?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(million|mil|mn|m|thousand|k)\b)?/gi;
    const _PRICE_NOT_MONEY = /^\s*(?:sqm|sq\b|sq\.|square|br\b|bed|bath|t&b|months?\b|mos?\b|yrs?\b|years?\b|days?\b|mins?\b|minutes?\b|km|meters?\b|floors?\b|flr|(?:st|nd|rd|th)\b|%|pax|slots?|cars?\b|parking|units?\b|storey|hectares?|has?\b|x\s*\d|f\b)/;
    const _PRICE_LABEL_BEFORE = /(?:price|asking|selling|tcp|srp|rent|rental|lease|rate|budget|net|gross)\W*(?:is|of|at)?\W*$/;
    const _PRICE_SIDE_BEFORE = /(?:dues?|assoc\w*|hoa|cusa|deposit|advance|reserv\w*|down\s*payment|dp|equity|amort\w*|parking|fees?|penalt\w*|commission|comm|utilit\w*|bills?|discount|less|rebate|cash\s*out|cashout)\W*(?:is|of|at|slot)?\W*$/;
    const _PRICE_ID_BEFORE = /(?:unit|tower|bldg|building|lot|blk|block|phase|floor|room|no\.?|#|\+)\s*$/;
    const _PRICE_PER_MONTH = /^\s*(?:\/|per\b|a\b|an\b|every\b)?\s*(?:month|mo\b|mos\b|mth)/;
    const _PRICE_TERMS_AFTER = /^\s*\(?(?:net|gross|nego|inclusive|incl\b|all[- ]?in|firm|fixed|only|tcp|pesos?\b|php\b)/;
    const _PRICE_SIDE_AFTER = /^\s*(?:(?:\/|per\b)\s*(?:sqm|sq\b|sq\.)|w\/o|without|deposit|advance|dues|reserv|dp\b|down\b)/;

    // ── What is being transacted ──
    // A figure only means something relative to the post's PRIMARY transaction.
    // "Commercial building FOR SALE … GF-3F: lease at 250,000 per month … PRICE:
    // ₱250,000,000" is a sale: the 250M is the asking price and the monthly figure
    // is income the property produces. In a rental the roles are reversed: the
    // monthly figure is the price and a "selling price" mention is a reference.
    // Intent comes from the listing's category when known, else from the first
    // explicit statement in the post (its headline) — never from a stray word.
    const _PRICE_INCOME_BEFORE = /(?:leased?|rented|rental|rent|tenanted|occupied|earn(?:s|ing)?|generat\w+|income|yield\w*|revenue|collect\w+|roi)\W*(?:out\W*)?(?:is|of|at|for|to|around|about)?\W*$/;
    const _PRICE_SALE_REF_BEFORE = /(?:selling\s*price|sale\s*price|market\s*value|zonal(?:\s*value)?|apprais\w+|assessed\s*value|bought|acquired|purchased|worth|valued)\W*(?:is|of|at|for|around|about)?\W*$/;
    function _priceIntent(text, category) {
        const c = String(category || '').toUpperCase();
        if (/SALE|BUY/.test(c)) return 'sale';
        if (/RENT|LEASE/.test(c)) return 'rent';
        const m = String(text || '').toLowerCase().match(/\bfor\s+(sale|rent|lease)\b|\bwilling\s+to\s+(buy|rent|lease)\b|\b(wtb|wtr|wtl)\b/);
        if (!m) return null;
        const w = m[1] || m[2] || m[3];
        return (w === 'sale' || w === 'buy' || w === 'wtb') ? 'sale' : 'rent';
    }

    function _priceCandidates(text, category) {
        const raw = String(text || '');
        const lower = raw.toLowerCase();
        const intent = _priceIntent(raw, category);
        // No stated transaction → fall back to the wording of the post as a whole.
        const isRent = intent ? intent === 'rent' : /\b(?:rent|rental|lease|monthly)\b/.test(lower);
        const demand = category ? /WILLING|\bWT[BRL]\b/i.test(String(category)) : /\bwilling\s+to\b|\bwt[brl]\b|\blooking\s+(?:for|to)\b/.test(lower);
        const out = [];
        _PRICE_NUM.lastIndex = 0;
        let m;
        while ((m = _PRICE_NUM.exec(lower)) !== null) {
            const cur = m[1], num = m[2], unit = m[3];
            const start = m.index + m[0].search(/\d/);
            const end = m.index + m[0].length;
            // A digit run glued to a word or a longer number ("T2", "0917-…") isn't an amount.
            if (!cur && start > 0 && /[a-z0-9.,]/.test(lower[start - 1])) continue;
            const lineStart = lower.lastIndexOf('\n', start - 1) + 1;
            const before = lower.slice(Math.max(lineStart, start - 40), cur ? m.index : start);
            const after = lower.slice(end, end + 24);
            let value = parseFloat(num.replace(/,/g, ''));
            if (!(value > 0)) continue;
            // "₱14,000 / sqm" is a RATE, not the price of the property.
            if (/^\s*(?:\/|per\b)\s*(?:sqm|sq\b|sq\.|square)/.test(after)) continue;
            if (unit) {
                // "500 m from MRT" is metres, not millions.
                if (unit === 'm' && !cur && /^\s*(?:from|away|walk|radius)\b/.test(after)) continue;
                value *= (unit === 'k' || unit === 'thousand') ? 1e3 : 1e6;
            } else {
                if (_PRICE_NOT_MONEY.test(after) || /^[\d-]/.test(after)) continue;
                if (cur ? value < 1000 : value < 10000) continue;
                if (!cur) {
                    const digits = num.replace(/[,.]/g, '');
                    if (digits[0] === '0' || digits.length > 10 || _PRICE_ID_BEFORE.test(before)) continue;
                }
            }
            if (value > 2e10) continue;

            // The role this figure plays for the post's transaction.
            const monthly = _PRICE_PER_MONTH.test(after);
            // In a REQUIREMENT ("willing to…") every figure is what the poster will
            // pay — a budget — so the income / reference roles only exist for offers.
            let role = 'price';
            if (!demand) {
                if (intent === 'sale' && (monthly || _PRICE_INCOME_BEFORE.test(before))) role = 'income';
                else if (intent === 'rent' && !monthly && _PRICE_SALE_REF_BEFORE.test(before)) role = 'reference';
            }

            let score = 0;
            if (cur) score += 4;
            if (unit) score += 2;
            if (num.includes(',')) score += 1;
            if (_PRICE_LABEL_BEFORE.test(before)) score += 3;
            if (_PRICE_SIDE_BEFORE.test(before)) score -= 4;
            if (monthly || _PRICE_TERMS_AFTER.test(after)) score += 2;
            if (_PRICE_SIDE_AFTER.test(after)) score -= 3;
            if (isRent) score += (value >= 3e3 && value <= 3e6) ? 1 : (value >= 1e7 ? -2 : 0);
            else if (value >= 3e5) score += 1;
            out.push({ value, score, index: start, role, monthly });
        }
        return out;
    }

    // The asking price: the best-scoring figure whose role IS the price. Income
    // and reference figures never stand in for it — a post that states no asking
    // price has none.
    function _bestPrice(text, category) {
        let best = null;
        for (const c of _priceCandidates(text, category)) {
            if (c.role !== 'price') continue;
            if (!best || c.score > best.score) best = c;
        }
        return best;
    }

    // The single asking price of a caption (leading figure of a range), or 0.
    function extractAmount(text, category) {
        const best = _bestPrice(text, category);
        return best ? best.value : 0;
    }

    // Every figure with a role, for display: the asking price plus the secondary
    // ones, each with the line it was written on (the source text is the truth).
    //   -> { intent, price, income: [{ value, monthly, line }], reference: [...] }
    function extractFinancials(text, category) {
        const raw = String(text || '');
        const lineOf = i => {
            const a = raw.lastIndexOf('\n', i - 1) + 1, b = raw.indexOf('\n', i);
            return raw.slice(a, b === -1 ? raw.length : b).replace(/^[\s•·▪◦*\-–—>]+/, '').trim();
        };
        const best = _bestPrice(raw, category);
        const out = { intent: _priceIntent(raw, category), price: best ? best.value : null, income: [], reference: [] };
        _priceCandidates(raw, category).forEach(c => {
            if (c.role === 'income' || c.role === 'reference') out[c.role].push({ value: c.value, monthly: !!c.monthly, line: lineOf(c.index) });
        });
        return out;
    }

    // A real "30-40M" / "100 to 150K" range has two nearby bounds; "Tower 2 - 75k"
    // or "1 or 2 months" does not.
    function extractPriceRange(text) {
        const lower = String(text || '').toLowerCase();
        const ok = (lo, hi) => lo > 0 && hi > lo && hi <= lo * 20;
        const rangeM = lower.match(/(\d+\.?\d*)\s*m?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*m(?:illion|il|n)?\b/);
        if (rangeM && ok(parseFloat(rangeM[1]), parseFloat(rangeM[2])))
            return { low: parseFloat(rangeM[1]), high: parseFloat(rangeM[2]), unit: 'M' };
        // K-denominated range e.g. "100 to 150K", "100K-150K" (typical for rent/lease budgets)
        const rangeK = lower.match(/(\d+\.?\d*)\s*k?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*k\b/);
        if (rangeK && ok(parseFloat(rangeK[1]), parseFloat(rangeK[2])))
            return { low: parseFloat(rangeK[1]), high: parseFloat(rangeK[2]), unit: 'K' };
        return null;
    }

    function extractPrice(text, category) {
        // A range ("30-40M") is matched on its upper bound.
        const range = extractPriceRange(text);
        if (range) return range.high * (range.unit === 'K' ? 1_000 : 1_000_000);
        const best = _bestPrice(text, category);
        return best ? best.value : null;
    }

    function _unitToken(str) {
        const s = str.toLowerCase().trim();
        if (s.match(/^studio$/)) return 'Studio';
        const m = s.match(/^(\d)[\s-]*(?:br|bedroom)$/);
        if (m) return `${m[1]}BR`;
        return null;
    }

    // Smaller-is-first ranking for unit sizes. Used to resolve a unit range
    // (e.g. "1BR or Studio") down to the single unit the stated price most
    // accurately reflects — a budget quoted for a range fits the smaller unit.
    const _UNIT_RANK = { 'Studio': 0, '1BR': 1, '2BR': 2, '3BR': 3, '4BR': 4 };
    function _unitRank(u) { return _UNIT_RANK[u] != null ? _UNIT_RANK[u] : 99; }
    function _smallerUnit(a, b) {
        if (!a) return b;
        if (!b) return a;
        return _unitRank(a) <= _unitRank(b) ? a : b;
    }

    // Normalize misspelled / mis-spaced / truncated bedroom tokens to the canonical
    // "N Bedroom" so EVERY downstream reader (display + matching) understands them.
    // Handles: "1-Bed Room" (space inside the word), "1-Bedroo"/"1 bedro" (truncated),
    // "2 bedrm" / "3 bdr" (abbreviations). Anchored to a digit/number-word and a
    // trailing non-letter, so it never eats into real words like "brothers" or
    // "bed road". Idempotent: already-correct text ("1BR", "2 Bedrooms") passes through.
    function _normBeds(text) {
        try {
            return String(text == null ? '' : text)
                .replace(/\b([1-5])\s*-?\s*(?:br|bdrm?|bed\s*-?\s*rm|bed\s*-?\s*roo?m?s?)(?![a-z])/gi, '$1 Bedroom')
                .replace(/\b(one|two|three|four|five)\s*-?\s*(?:bdrm?|bed\s*-?\s*rm|bed\s*-?\s*roo?m?s?)(?![a-z])/gi, '$1 Bedroom');
        } catch (e) { return text; }
    }

    function extractUnit(text) {
        if (_wholeProperty(text)) return null;   // a building's unit mix is composition, not the unit offered
        text = _normBeds(text);
        const lower = text.toLowerCase();
        // Detect unit range across any combo: "Studio or 1BR", "2-BEDROOM OR 3-BEDROOM", "1BR or 2 Bedroom"
        const rangeRe = /(studio|\d[\s-]*(?:br|bedroom\w*))\s+or\s+(studio|\d[\s-]*(?:br|bedroom\w*))/i;
        const rangeMatch = text.match(rangeRe);
        if (rangeMatch) {
            const a = _unitToken(rangeMatch[1]);
            const b = _unitToken(rangeMatch[2]);
            // Resolve the range to the smaller unit — the stated price is a
            // closer fit for it, so the ticker/FMV bucket by a single unit.
            if (a || b) return _smallerUnit(a, b);
        }
        const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
        // Check each line — a line with just "1BR" or "1 BEDROOM" is definitive
        for (const line of lines) {
            const lo = line.toLowerCase().trim();
            if (lo.match(/^studio$/)) return 'Studio';
            if (lo.match(/^1[\s-]*br$|^1[\s-]*bedroom$|^one\s*bedroom$/)) return '1BR';
            if (lo.match(/^2[\s-]*br$|^2[\s-]*bedroom$|^two\s*bedroom$/)) return '2BR';
            if (lo.match(/^3[\s-]*br$|^3[\s-]*bedroom$|^three\s*bedroom$/)) return '3BR';
            if (lo.match(/^4[\s-]*br$|^4[\s-]*bedroom$|^four\s*bedroom$/)) return '4BR';
        }
        // Fallback: inline detection
        if (lower.match(/\bstudio\b/)) return 'Studio';
        if (lower.match(/\b1[\s-]*br\b|1[\s-]*bedroom|one\s*bedroom/)) return '1BR';
        if (lower.match(/\b2[\s-]*br\b|2[\s-]*bedroom|two\s*bedroom/)) return '2BR';
        if (lower.match(/\b3[\s-]*br\b|3[\s-]*bedroom|three\s*bedroom/)) return '3BR';
        if (lower.match(/\b4[\s-]*br\b|4[\s-]*bedroom|four\s*bedroom/)) return '4BR';
        return null;
    }

    // Developer/brand names that must never be learned as project names. Matched by
    // exact (lowercased) equality against an extracted candidate, so entries are
    // safe from substring false-positives — list every common spelling of a brand.
    const COMPANY_NAMES = [
        // ── Ayala Land group ──
        'alveo land corp', 'alveo land', 'alveo', 'ayala land', 'ayala',
        'avida', 'avida land', 'amaia', 'amaia land', 'bellavita',
        // ── SM group ──
        'sm prime', 'sm prime holdings', 'sm development corporation', 'smdc',
        // ── Megaworld group ──
        'megaworld', 'megaworld corporation', 'empire east',
        'empire east land holdings', 'suntrust', 'suntrust properties',
        // ── Robinsons ──
        'robinsons land', 'robinsons land corporation', 'robinsons residences',
        'robinsons homes',
        // ── DMCI ──
        'dmci', 'dmci homes', 'dmci project developers',
        // ── Vista Land group ──
        'vista land', 'vista land & lifescapes', 'vista residences', 'camella',
        'camella homes', 'brittany', 'brittany corporation', 'crown asia',
        // ── Other Tier 1 ──
        'rockwell', 'rockwell land', 'rockwell land corporation',
        'federal land', 'filinvest', 'filinvest land',
        'sta. lucia land', 'sta lucia land', 'sta. lucia realty',
        'sta lucia realty', 'sta lucia',
        // ── Strong mid-to-large ──
        'century properties', 'century properties group', 'shang properties',
        'ortigas & company', 'ortigas land', 'aboitizland', 'doubledragon',
        'doubledragon corporation', 'a brown company', 'eton properties',
        'primary homes', 'moldex realty', 'moldex', 'new san jose builders',
        'cityland', 'cityland development corporation', 'landco pacific',
        'landco', 'cathay land', 'phinma property holdings', 'phinma',
        // ── Regional / affordable-housing focused ──
        '8990 housing development corporation', '8990 housing', '8990',
        'cebu landmasters', 'axeia development', 'axeia', 'phirst park homes',
        'phirst', 'raemulan lands', 'raemulan', 'fiesta communities',
        'antel group of companies', 'antel group', 'antel', 'anchor land',
        'anchor land holdings', 'greenfield development corporation',
        'greenfield development', 'greenfield', 'haus talk', 'ddc land',
        'borland development', 'borland', 'northpine land', 'northpine',
        'major homes', 'state land', 'pueblo de oro', 'maria luisa properties',
        'maria luisa', 'pro friends', 'profriends', 'acm homes', 'acm',
        'don tim development', 'don tim', 'paramount property ventures',
        'paramount', 'geoestate development', 'geoestate', 'nuvoland',
        'nuvoland philippines',
        // ── Locations (kept: not projects either) ──
        'bgc', 'makati', 'pasig', 'taguig', 'mandaluyong',
        'quezon city', 'manila', 'alabang', 'ortigas',
    ];

    // Fast lookup of brand/developer/location tokens. The fuzzy project matcher
    // consults this so a word that IS a known brand (e.g. "amaia") is never
    // "corrected" into a similarly-spelled project (e.g. "amara", edit distance 1).
    const COMPANY_NAME_SET = new Set(COMPANY_NAMES.map(c => c.toLowerCase()));

    // Everyday English / real-estate words that must NEVER be treated as a
    // misspelled project by the fuzzy matcher. Without this, ordinary post words
    // collide with similarly-spelled project names at small edit distance — e.g.
    // "monthly" → "Montala", "santa" → "Senta" — making the engine invent a
    // project the user never named. Matched by exact (lowercased) equality against
    // a single-word candidate phrase, so it is safe from substring false-positives.
    const PROJECT_STOP_WORDS = new Set([
        // rent / price / terms
        'monthly','weekly','yearly','annual','annually','negotiable','nego','negob',
        'discount','promo','reserved','downpayment','installment','financing',
        'cashout','rebate','price','priced','budget','payment','terms','lease',
        'rent','rental','sale','resale','resell','preselling','presell',
        // directions / position
        'north','south','east','west','northeast','northwest','southeast','southwest',
        'front','back','rear','upper','lower','ground','corner','middle','center',
        'centre','central','side','high','mid','low','verde','verdes',
        // unit / structure
        'studio','bedroom','bedrooms','bathroom','bathrooms','kitchen','balcony',
        'veranda','parking','garage','storage','maids','maid','den','loft','floor',
        'tower','building','block','unit','units','room','rooms','suite','suites',
        'mansion','penthouse','basement','rooftop',
        // property types
        'condo','condominium','townhouse','townhomes','house','apartment','duplex',
        'bungalow','villa','villas','lot','land','office','commercial','residential',
        'industrial','warehouse','property','home','homes','estate','estates',
        // descriptors / condition
        'furnished','unfurnished','semifurnished','brandnew','ready','occupancy',
        'spacious','cozy','modern','luxury','premium','affordable','prime','clean',
        'renovated','fully','partially','bare','newly','brand','turnover','turnedover',
        // amenities / features
        'pool','gym','clubhouse','playground','garden','park','view','amenities',
        'security','elevator','furnishing','fitout','fitted','balconies',
        // generic english / contact
        'available','please','contact','viewing','schedule','message','direct',
        'owner','broker','agent','buyer','seller','offer','near','beside','along',
        'walking','distance','minutes','access','located','location','address',
        'details','details','inquire','inquiry','listing','photos','actual',
        // location generics not already covered by COMPANY_NAME_SET
        'city','avenue','boulevard','street','road','drive','highway','village',
        'subdivision','district','area','zone','metro','santa','sta','saint',
    ]);

    // Project names that are ALSO everyday words ("Veranda" the porch). These are
    // only accepted when the surrounding text marks them as a proper-noun property
    // reference — a tower/section qualifier ("North Veranda", "The Veranda") or a
    // trailing "Residences"/"Tower" — never when used as a plain feature ("unit
    // with a veranda"). Fuzzy matching for these is disabled via PROJECT_STOP_WORDS;
    // only an exact, context-supported mention counts. Keep this list tiny.
    const AMBIGUOUS_WORD_PROJECTS = new Set(['veranda']);

    // ── Context-gated project names (Layer 3) ──
    // Names that ARE real projects but are also generic-sounding phrases
    // ("Park Residences", "One Central", "S Residences", "The Pinnacle").
    // An exact, word-boundary-aligned mention is NOT enough on its own — the post
    // must also carry a proper-noun signal that it refers to the development: a
    // developer/brand token, a location keyword, or a tower/phase/unit qualifier.
    // So "SMDC Park Residences", "Park Residences Sta. Rosa", "Park Residences
    // tower 2" all resolve, while a bare generic "park residences" does not.
    // Populated (normalized, lower-cased) by developers.js from `match:'context'`.
    const CONTEXT_GATED_PROJECTS = new Set();

    // Names that must match by EXACT (word-boundary) spelling only — never fuzzy.
    // Used for real projects whose names are edit-distance-1 near-twins of a
    // DIFFERENT real project (e.g. Primary's "Astele" vs Alveo's "Astela"), so a
    // typo of one can never fuzzy-resolve to the other. Populated (normalized,
    // lower-cased) by developers.js from `match:'exact'`.
    const EXACT_ONLY_PROJECTS = new Set();

    // Extra evidence phrases — estate/township names and subsidiary developer
    // names registered by developers.js. An estate mention ("Iloilo Business
    // Park") is just as strong a signal as a developer or city, and the engine
    // does not otherwise know estate names. Entries are normalized lower-case.
    const CONTEXT_EVIDENCE = new Set();

    // Lazily-built regex of "evidence" tokens (developer/brand + location names)
    // that mark a post as a genuine property listing rather than generic prose.
    let _EVIDENCE_RE = null;
    function _contextEvidenceRe() {
        if (_EVIDENCE_RE) return _EVIDENCE_RE;
        const toks = [...COMPANY_NAMES, ...Object.keys(LOCATION_KEYWORDS)]
            .filter(t => t && t.length >= 3)
            .sort((a, b) => b.length - a.length)
            .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        _EVIDENCE_RE = new RegExp('\\b(?:' + toks.join('|') + ')\\b', 'i');
        return _EVIDENCE_RE;
    }
    // Is there a proper-noun signal in the text that a context-gated name is a real
    // development reference? A developer/brand token, a location keyword, an estate
    // name, or a tower/phase/building/unit + number qualifier. Punctuation is
    // stripped first so "Sta. Rosa" reads as the "sta rosa" location token.
    function _contextSignalPresent(normText) {
        const t = normText.replace(/[^A-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (/\b(?:tower|twr|phase|bldg|building|unit)\s*\d/i.test(t)) return true;
        // A concrete unit spec marks a real property listing: "2br", "3 bedroom",
        // "penthouse", "loft". (Bare "unit"/"studio" are NOT signals — too generic,
        // and "studio" is itself part of names like "Studio City".) The
        // number-word/unit collision guard still nulls "studio one bedroom".
        if (/\b\d\s*(?:br|bedrooms?)\b/i.test(t)) return true;
        if (/\b(?:penthouse|loft)\b/i.test(t)) return true;
        if (_contextEvidenceRe().test(t)) return true;
        const padded = ' ' + t.toLowerCase() + ' ';
        for (const tok of CONTEXT_EVIDENCE) {
            if (tok.length >= 4 && padded.includes(' ' + tok + ' ')) return true;
        }
        return false;
    }

    // Narrow unit-collision guard (context-gated names only). A gated project whose
    // canonical name ENDS in a cardinal number-word ("Studio One", "Studio Two") must
    // NOT match when that number-word is actually the bedroom count in the post —
    // i.e. immediately followed by a BARE unit token ("studio one bedroom" =
    // studio, 1-bedroom). It still matches when followed by anything else:
    // "Studio One 2BR" (2br has its own digit), "Studio One Alabang", "Studio One
    // Tower 2". Only cardinal-number tails collide, so "One Central"/"Two Serendra"
    // (number-word at the START) and non-gated names are unaffected.
    const _NUMBER_WORD_TAIL = new Set(['ONE', 'TWO', 'THREE', 'FOUR']);
    function _numberWordUnitCollision(projUpper, upperText, idx) {
        const toks = projUpper.split(' ');
        if (!_NUMBER_WORD_TAIL.has(toks[toks.length - 1])) return false;
        const after = upperText.slice(idx + projUpper.length);
        // A bare unit token right after the number-word (no leading digit) means the
        // number was the count, not part of the project name.
        return /^\s+(?:BEDROOMS?|BEDS?|BR)\b/.test(after);
    }

    // Does an ambiguous-word project name appear as a genuine PROPER-NOUN property
    // reference in the (separator-normalized, upper-cased) text? Scans every
    // occurrence: a tower/section word or "The" immediately before, or a
    // Residences/Tower/Place word immediately after, qualifies it; an article or
    // feature word before ("a", "with", "private", "no") disqualifies that mention.
    function _ambiguousProperNounContext(upperText, projUpper) {
        const QUALIFY_BEFORE    = /\b(?:NORTH|SOUTH|EAST|WEST|TOWER|THE|ONE|TWO|THREE|FOUR|GRAND)\s+$/;
        const DISQUALIFY_BEFORE = /\b(?:A|AN|WITH|WITHOUT|PRIVATE|OWN|SPACIOUS|SMALL|LARGE|BIG|NICE|HUGE|WIDE|HAS|OPEN|NO)\s+$/;
        const QUALIFY_AFTER     = /^\s+(?:RESIDENCES?|TOWER|PLACE|PARK)\b/;
        let from = 0, idx;
        while ((idx = upperText.indexOf(projUpper, from)) !== -1) {
            const before = upperText.slice(0, idx);
            const after  = upperText.slice(idx + projUpper.length);
            if (!DISQUALIFY_BEFORE.test(before) &&
                (QUALIFY_BEFORE.test(before) || QUALIFY_AFTER.test(after))) {
                return true;
            }
            from = idx + projUpper.length;
        }
        return false;
    }

    // ── Learned project names persisted in localStorage ──
    const LEARNED_KEY = 'realmate_detected_projects';

    function getLearnedProjects() {
        try { return JSON.parse(localStorage.getItem(LEARNED_KEY)) || []; }
        catch { return []; }
    }

    // ── Location proximity tables ──
    const LOCATION_KEYWORDS = {
        // Metro Manila
        'bgc': 'BGC', 'bonifacio global city': 'BGC', 'bonifacio': 'BGC', 'fort bonifacio': 'BGC',
        'taguig city': 'Taguig City', 'taguig': 'Taguig',
        'makati city': 'Makati City', 'makati': 'Makati', 'salcedo': 'Makati', 'legazpi village': 'Makati', 'rockwell': 'Makati',
        'pasig city': 'Pasig City', 'pasig': 'Pasig', 'ortigas': 'Ortigas', 'eastwood': 'Eastwood',
        'mandaluyong city': 'Mandaluyong City', 'mandaluyong': 'Mandaluyong',
        'quezon city': 'Quezon City', 'qc': 'Quezon City',
        'manila city': 'Manila City', 'manila': 'Manila',
        'alabang': 'Alabang', 'muntinlupa city': 'Muntinlupa City', 'muntinlupa': 'Muntinlupa',
        'pasay city': 'Pasay City', 'pasay': 'Pasay',
        'paranaque city': 'Parañaque City', 'paranaque': 'Parañaque', 'parañaque city': 'Parañaque City', 'parañaque': 'Parañaque',
        'las pinas city': 'Las Piñas City', 'las pinas': 'Las Piñas', 'las piñas city': 'Las Piñas City', 'las piñas': 'Las Piñas',
        'san juan city': 'San Juan City', 'san juan': 'San Juan',
        'marikina city': 'Marikina City', 'marikina': 'Marikina',
        'valenzuela city': 'Valenzuela City', 'valenzuela': 'Valenzuela',
        'caloocan city': 'Caloocan City', 'caloocan': 'Caloocan',
        'mckinley': 'BGC', 'mckinley hill': 'BGC', 'uptown': 'BGC',
        // Laguna
        'laguna': 'Laguna', 'nuvali': 'Nuvali, Laguna', 'calamba': 'Calamba, Laguna',
        'sta rosa': 'Sta. Rosa, Laguna', 'santa rosa': 'Sta. Rosa, Laguna',
        'binan': 'Biñan, Laguna', 'biñan': 'Biñan, Laguna',
        'san pedro': 'San Pedro, Laguna',
        'rosario': 'Rosario, Laguna',
        'los banos': 'Los Baños, Laguna', 'los baños': 'Los Baños, Laguna',
        // Cavite
        'cavite': 'Cavite', 'carmona': 'Carmona, Cavite',
        'bacoor': 'Bacoor, Cavite', 'imus': 'Imus, Cavite',
        'dasmarinas': 'Dasmariñas, Cavite', 'dasmariñas': 'Dasmariñas, Cavite',
        'general trias': 'General Trias, Cavite', 'tagaytay': 'Tagaytay, Cavite',
        'silang': 'Silang, Cavite',
        // Rizal
        'rizal': 'Rizal', 'antipolo': 'Antipolo, Rizal', 'cainta': 'Cainta, Rizal', 'taytay': 'Taytay, Rizal',
        // Bulacan & Pampanga
        'bulacan': 'Bulacan', 'meycauayan': 'Meycauayan, Bulacan', 'marilao': 'Marilao, Bulacan',
        'pampanga': 'Pampanga', 'clark': 'Clark, Pampanga', 'angeles city': 'Angeles City, Pampanga',
        // Batangas
        'batangas': 'Batangas', 'lipa': 'Lipa, Batangas',
        // Cebu
        'cebu city': 'Cebu City', 'cebu': 'Cebu', 'mandaue': 'Mandaue, Cebu', 'lapu-lapu': 'Lapu-Lapu, Cebu',
    };

    // Location proximity zones — locations in same zone are "nearby"
    const LOCATION_ZONES = {
        'Metro Manila Core': ['BGC', 'Makati', 'Makati City', 'Taguig', 'Taguig City', 'Pasay', 'Pasay City', 'Mandaluyong', 'Mandaluyong City', 'Manila', 'Manila City', 'San Juan', 'San Juan City', 'Pateros'],
        'Metro Manila East': ['Pasig', 'Pasig City', 'Quezon City', 'Marikina', 'Marikina City', 'Ortigas', 'Eastwood'],
        'Metro Manila North': ['Valenzuela', 'Valenzuela City', 'Caloocan', 'Caloocan City', 'Malabon', 'Navotas', 'Meycauayan, Bulacan', 'Marilao, Bulacan'],
        'Metro Manila South': ['Alabang', 'Muntinlupa', 'Muntinlupa City', 'Parañaque', 'Parañaque City', 'Las Piñas', 'Las Piñas City'],
        'Laguna': ['Laguna', 'Nuvali, Laguna', 'Calamba, Laguna', 'Sta. Rosa, Laguna', 'Biñan, Laguna', 'San Pedro, Laguna', 'Cabuyao, Laguna', 'Los Baños, Laguna'],
        'Cavite': ['Cavite', 'Carmona, Cavite', 'Bacoor, Cavite', 'Imus, Cavite', 'Dasmariñas, Cavite', 'General Trias, Cavite', 'Tagaytay, Cavite', 'Silang, Cavite', 'Kawit, Cavite', 'Trece Martires, Cavite'],
        'Rizal': ['Rizal', 'Antipolo, Rizal', 'Cainta, Rizal', 'Taytay, Rizal', 'San Mateo, Rizal', 'Rodriguez, Rizal'],
        'Central Luzon': ['Bulacan', 'Pampanga', 'Clark, Pampanga', 'Angeles City, Pampanga', 'San Fernando, Pampanga', 'Mabalacat, Pampanga', 'San Jose del Monte, Bulacan', 'Malolos, Bulacan'],
        'Batangas': ['Batangas', 'Lipa, Batangas', 'Batangas City, Batangas', 'Sto. Tomas, Batangas'],
        'Visayas': ['Cebu', 'Cebu City, Cebu', 'Mandaue City, Cebu', 'Lapu-Lapu City, Cebu', 'Talisay City, Cebu'],
    };

    // Adjacent zones that count as "nearby"
    const ADJACENT_ZONES = {
        'Metro Manila Core': ['Metro Manila East', 'Metro Manila South', 'Metro Manila North'],
        'Metro Manila East': ['Metro Manila Core', 'Rizal', 'Laguna'],
        'Metro Manila North': ['Metro Manila Core', 'Central Luzon'],
        'Metro Manila South': ['Metro Manila Core', 'Cavite', 'Laguna'],
        'Laguna': ['Metro Manila South', 'Metro Manila East', 'Cavite', 'Batangas'],
        'Cavite': ['Metro Manila South', 'Laguna', 'Batangas'],
        'Rizal': ['Metro Manila East', 'Laguna'],
        'Central Luzon': ['Metro Manila Core', 'Metro Manila North'],
        'Batangas': ['Laguna', 'Cavite'],
        'Visayas': [],
    };

    function getLocationZone(loc) {
        for (const [zone, cities] of Object.entries(LOCATION_ZONES)) {
            if (cities.includes(loc)) return zone;
        }
        return null;
    }

    function locationProximity(locsA, locsB) {
        // Returns: 'exact', 'nearby', 'far', or 'unknown'
        if (!locsA.length || !locsB.length) return 'unknown';
        for (const a of locsA) {
            for (const b of locsB) {
                if (a === b) return 'exact';
            }
        }
        for (const a of locsA) {
            const zoneA = getLocationZone(a);
            if (!zoneA) continue;
            for (const b of locsB) {
                const zoneB = getLocationZone(b);
                if (!zoneB) continue;
                if (zoneA === zoneB) return 'nearby';
                if (ADJACENT_ZONES[zoneA]?.includes(zoneB)) return 'nearby';
            }
        }
        return 'far';
    }

    const FEATURE_KEYWORDS = [
        'furnished', 'fully furnished', 'semi furnished', 'bare',
        'parking', 'with parking', 'no parking',
        'balcony', 'corner unit', 'penthouse', 'loft',
        'pool', 'gym', 'rfo', 'ready for occupancy', 'preselling', 'pre-selling',
        'high floor', 'low floor', 'mid floor',
        'pet friendly', 'smoking', 'non smoking',
    ];

    function extractLocations(text) {
        // Prefer the shared PH location engine (location-engine.js): hierarchy-aware,
        // word-boundary safe (so "New Manila" resolves to Quezon City instead of also
        // matching the City of Manila), with barangay/CBD → city resolution and
        // redundant-parent collapse. Falls back to the legacy substring matcher if the
        // engine script isn't loaded on this page.
        if (typeof window !== 'undefined' && window.RM_LOC) {
            return window.RM_LOC.extractCities(text || '');
        }
        const lower = (text || '').toLowerCase();
        const found = new Set();
        const keys = Object.keys(LOCATION_KEYWORDS).sort((a, b) => b.length - a.length);
        keys.forEach(key => {
            if (lower.includes(key)) {
                const val = LOCATION_KEYWORDS[key];
                let dominated = false;
                found.forEach(existing => { if (existing.includes(val) && existing !== val) dominated = true; });
                if (!dominated) {
                    found.forEach(existing => { if (val.includes(existing) && val !== existing) found.delete(existing); });
                    found.add(val);
                }
            }
        });
        return [...found];
    }

    // Levenshtein edit distance with an optional `max` cutoff. When the caller only
    // cares whether the distance is within a small threshold (fuzzy project match),
    // passing `max` lets us bail the moment a whole row's minimum exceeds it — and
    // skip entirely when the length gap alone already exceeds it. This turned a
    // ~20s dashboard freeze (buildMatchMap re-parsing every listing) into ~0.5s.
    // Uses two rolling rows instead of a full m×n matrix.
    function levenshtein(a, b, max = Infinity) {
        const m = a.length, n = b.length;
        if (Math.abs(m - n) > max) return max + 1;
        let prev = new Array(n + 1);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            const cur = new Array(n + 1);
            cur[0] = i;
            let rowMin = i;
            const ai = a.charCodeAt(i - 1);
            for (let j = 1; j <= n; j++) {
                const c = ai === b.charCodeAt(j - 1)
                    ? prev[j - 1]
                    : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
                cur[j] = c;
                if (c < rowMin) rowMin = c;
            }
            if (rowMin > max) return max + 1;
            prev = cur;
        }
        return prev[n];
    }

    // Users type all kinds of separators between the parts of a project name —
    // hyphens, en/em dashes, or extra spaces ("The Columns - Ayala Avenue",
    // "Bel–Air Village"). Collapse every separator run to a single space so name
    // matching is punctuation-insensitive. Applied to BOTH the post text and the
    // known project name, so genuinely hyphenated names (e.g. "Bel-Air Village")
    // still match themselves — both sides normalize to "bel air village".
    function normalizeSeparators(s) {
        return (s || '')
            .replace(/[‐-―−]/g, '-') // unicode dashes → hyphen
            .replace(/\s*-\s*/g, ' ')               // hyphen (any spacing) → space
            .replace(/\s+/g, ' ')                    // collapse whitespace runs
            .trim();
    }

    // A regex source that matches `name` inside raw text regardless of the
    // separators used between its parts — so a canonical "The Columns Ayala
    // Avenue" still strips "the columns - ayala avenue" out of a post body.
    const _SEP_CLASS = '[\\s\\-\\u2010-\\u2015\\u2212]+';
    function separatorInsensitivePattern(name) {
        return normalizeSeparators(name)
            .split(' ')
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join(_SEP_CLASS);
    }

    // Trailing generic property-type words that carry no distinguishing power for
    // fuzzy matching (they are shared across dozens of projects). Stripped only to
    // measure a name's DISTINCTIVE core length; the full name is still used for the
    // actual exact/distance comparison. One trailing token is removed.
    const GENERIC_TYPE_SUFFIX = /\s+(?:residences?|place|tower|towers|homes?|suites?|condominium|condo|park|plaza|village|estates?|heights|court|gardens?)$/i;

    // Words that only ever relate things to each other. They can sit next to a
    // project name but are never a corrupted part of one.
    const _FUZZY_FUNCTION_WORDS = new Set(['a', 'an', 'the', 'in', 'at', 'on', 'of', 'to', 'for', 'by', 'from', 'with',
        'and', 'or', 'near', 'within', 'around', 'along', 'beside', 'across', 'inside', 'outside', 'only', 'any', 'all',
        'is', 'are', 'be', 'no', 'not', 'my', 'our', 'your', 'this', 'that', 'area', 'vicinity']);

    // A project named only as a REFERENCE POINT — "near One Salcedo", "walking
    // distance to Greenbelt Residences", "across Park Terraces" — tells you where
    // the property is, not what it is. Such a mention is a location reference and
    // does not make that project the listing's project.
    const _PROJECT_AS_LANDMARK = /(?:\bnear(?:by)?|\bnearby\s+to|\bbeside|\bacross(?:\s+from)?|\bopposite|\bbehind|\bfacing|\balong|\bclose\s+to|\bnext\s+to|\bin\s+front\s+of|\bwalking\s+distance\s+(?:to|from)|\b(?:mins?|minutes?|steps?|meters?|km)\s+(?:away\s+)?(?:to|from)|\bview(?:s)?\s+of|\boverlooking|\bvicinity\s+of)\s+(?:the\s+)?$/i;

    function fuzzyMatchProject(text) {
        const allProjects = [...KNOWN_PROJECTS, ...getLearnedProjects()];
        // Strip edge punctuation from each token ("veranda," → "veranda", "60k."
        // → "60k") so the stop-word / brand guards and the distance compare see the
        // bare word — otherwise a trailing comma both defeats the guard and counts
        // as a phantom edit that lets a common word match a project.
        const words = normalizeSeparators(text).toLowerCase().split(/\s+/)
            .map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
            .filter(Boolean);
        let bestProj = null, bestPhrase = null, bestDist = Infinity;
        for (const proj of allProjects) {
            const projLower = normalizeSeparators(proj).toLowerCase();
            // Context-gated names never fuzzy-match — they are generic-sounding, so a
            // near-miss would invent a project. They resolve only via exact + context.
            if (CONTEXT_GATED_PROJECTS.has(projLower)) continue;
            // Exact-only names never fuzzy-match (protects near-twin real projects).
            if (EXACT_ONLY_PROJECTS.has(projLower)) continue;
            const npw = projLower.split(/\s+/).length;
            const projLen = projLower.length;
            // A short one-word name (an acronym like "TREC") is exact-only: one edit
            // is a quarter of the word, so "REC" in a broker's licence line ("REB,
            // REA, REC") or "the rec room" would otherwise become a project.
            if (npw === 1 && projLen <= 4) continue;
            // Digits in a name are DISTINCTIVE and must not be fuzzed away: "hotel"
            // must not become "Hotel101", "west" must not become "100 West", "peaklane"
            // must not become "202 Peaklane". A candidate phrase must contain every
            // digit-run the project name has, else it can't be a typo of it. (Exact
            // matching is unaffected — this only constrains the fuzzy fallback.)
            const projDigits = projLower.match(/\d+/g) || [];
            // A multi-word name whose ONLY distinctive part is one short word plus a
            // generic type suffix ("Air/Sea/Shore/Gold/Park Residences", "X Place",
            // "X Tower") is exact-only — never fuzzy. Otherwise the long shared suffix
            // ("Residences" = 10 chars) inflates the distance budget so that only the
            // tiny first word must be close, and any everyday "<word> residences"
            // phrase in a post ("these residences", "park residences") fuzzy-collides
            // with some project. Exact substring still matches when the user genuinely
            // names it, so the +25pt hit is preserved without inventing a project.
            const _core = projLower.replace(GENERIC_TYPE_SUFFIX, '').trim();
            const _coreTokens = _core ? _core.split(/\s+/) : [];
            if (npw > 1 && _coreTokens.length <= 1 &&
                (!_core || _core.length <= 5)) continue;
            // Threshold depends only on the project, so compute it once per project
            // rather than once per candidate phrase.
            const baseThreshold = Math.min(4, Math.max(2, Math.floor(projLen * 0.2)));
            // A single-word project collides with everyday words far too easily at
            // distance 2 ("monthly"→"Montala", "santa"→"Senta"). Require a near-exact
            // single typo (≤1) for one-word names; multi-word names keep the looser
            // budget because a 2–3 word phrase almost never equals a common phrase by
            // accident. Accuracy over filling — the exact spirit of the detection rules.
            const threshold = (npw === 1) ? Math.min(baseThreshold, 1) : baseThreshold;
            for (let i = 0; i <= words.length - npw; i++) {
                const phrase = words.slice(i, i + npw).join(' ');
                // A digit-bearing name can only be a typo of a phrase that has the
                // same digits ("hotel manila" is NOT a misspelling of "hotel101 manila").
                if (projDigits.length && !projDigits.every(d => phrase.includes(d))) continue;
                // Edit distance is at least the length difference, so a phrase whose
                // length is already more than `threshold` away can never match —
                // skip the expensive DP. `levenshtein`'s `threshold` cutoff prunes
                // the rest. Together these avoid the vast majority of the work.
                if (Math.abs(phrase.length - projLen) > threshold) continue;
                // Never treat a known brand/developer/location token OR an everyday
                // English / real-estate word as a misspelled project — e.g. "amaia"
                // (brand) must not become "amara" (project), and "monthly" must not
                // become "Montala". Only single-token phrases can collide this way.
                if (npw === 1 && (COMPANY_NAME_SET.has(phrase) || PROJECT_STOP_WORDS.has(phrase))) continue;
                // Same rule inside a multi-word phrase: a function word or everyday
                // word is itself, not a misspelt piece of a project name. Without
                // this, "in Salcedo" (a place the buyer wants to be IN) was two edits
                // from "One Salcedo" and a LOCATION became a PROJECT.
                if (npw > 1) {
                    const pt = phrase.split(' '), jt = projLower.split(/\s+/);
                    if (pt.some((w, k) => w !== jt[k] && (_FUZZY_FUNCTION_WORDS.has(w) || PROJECT_STOP_WORDS.has(w)))) continue;
                }
                const dist = levenshtein(phrase, projLower, threshold);
                if (dist > 0 && dist <= threshold && dist < bestDist) {
                    bestDist = dist;
                    bestProj = proj;
                    bestPhrase = phrase; // original misspelled text
                }
            }
        }
        return bestProj ? { project: bestProj, originalPhrase: bestPhrase } : null;
    }

    // Returns { project, originalPhrase } — originalPhrase is what appeared in the raw text
    function extractProjectFull(text) {
        // Separator-insensitive: normalize the post text once and compare against
        // each project's normalized form, so "the columns - ayala avenue" still
        // resolves to "The Columns Ayala Avenue".
        const normUpper = normalizeSeparators(text).toUpperCase();
        const upper = normUpper;
        let earliest = Infinity, found = null;
        // Phrases that exactly (word-boundary) name a context-gated project but lack
        // the required evidence. They are rejected as matches AND barred from the
        // fuzzy fallback, so an unevidenced gated phrase can never fall through to an
        // unrelated fuzzy hit ("grand central residences" → "Gentry Residences").
        const gatedRejected = [];
        for (const proj of [...KNOWN_PROJECTS, ...getLearnedProjects()]) {
            const projU = normalizeSeparators(proj).toUpperCase();
            const projKey = projU.toLowerCase();
            // Find the earliest occurrence that is WORD-BOUNDARY aligned (Layer 1).
            // Without this, "S Residences" matches the "s residences" inside
            // "variouS RESIDENCES", and "Air Residences" matches "fAIR RESIDENCES".
            let idx = -1, from = 0, hit;
            while ((hit = upper.indexOf(projU, from)) !== -1) {
                const b = hit > 0 ? upper[hit - 1] : ' ';
                const a = (hit + projU.length < upper.length) ? upper[hit + projU.length] : ' ';
                if (!/[A-Z0-9]/.test(b) && !/[A-Z0-9]/.test(a) &&
                    !_PROJECT_AS_LANDMARK.test(upper.slice(Math.max(0, hit - 40), hit))) { idx = hit; break; }
                from = hit + 1;
            }
            if (idx === -1 || idx >= earliest) continue;
            // A project name that is also an everyday word (e.g. "Veranda") only
            // counts when the text marks it as a proper-noun property reference,
            // not when it is a plain feature ("unit with a veranda"). This is the
            // "don't guess from a resembling word" rule applied to exact matches.
            if (AMBIGUOUS_WORD_PROJECTS.has(projKey) &&
                !_ambiguousProperNounContext(upper, projU)) continue;
            // Context-gated names (Layer 3): a real project whose name is also a
            // generic phrase needs a developer/location/tower signal in the post,
            // and must not be a number-word/unit collision ("studio one bedroom").
            if (CONTEXT_GATED_PROJECTS.has(projKey)) {
                if (!_contextSignalPresent(normUpper)) {
                    // Named by exact spelling but with no developer/location/estate/
                    // unit evidence → reject, and remember the phrase so the fuzzy
                    // fallback can't re-read those same words as another project.
                    gatedRejected.push(projKey);
                    continue;
                }
                if (_numberWordUnitCollision(projU, upper, idx)) continue;
            }
            earliest = idx;
            found = proj;
        }
        if (found) return { project: found, originalPhrase: null };
        // Fuzzy fallback — catch misspellings like "two maridiem" → "Two Maridien".
        const fuzzy = fuzzyMatchProject(text);
        if (fuzzy) {
            // A false attribution is worse than no match: never let fuzzy resolve a
            // phrase that overlaps one already claimed-and-rejected as an unevidenced
            // context-gated project. General guard, not a per-project exception.
            const fp = (fuzzy.originalPhrase || '').toLowerCase();
            if (fp && gatedRejected.some(g => g.includes(fp) || fp.includes(g))) return null;
        }
        return fuzzy || null;
    }

    function extractProject(text) {
        const r = extractProjectFull(text);
        return r ? r.project : null;
    }

    function extractFeatures(text) {
        const lower = text.toLowerCase();
        return FEATURE_KEYWORDS.filter(f => lower.includes(f));
    }

    function extractBudgetRange(text, category) {
        const cands = _priceCandidates(text, category).filter(c => c.role === 'price');
        const main = cands.filter(c => c.score > 0);
        const prices = (main.length ? main : cands).map(c => c.value);
        const range = extractPriceRange(text);
        if (range) {
            const mult = range.unit === 'K' ? 1_000 : 1_000_000;
            prices.push(range.low * mult, range.high * mult);
        }
        if (!prices.length) return null;
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }

    // Bedroom counts (1–5) mentioned in the post, digit ("2BR", "2 bedroom") or word
    // ("two-bedroom") form. Returns ALL counts so a range like "2BR or 3BR" keeps both.
    function _bedTokensForMatch(l) {
        l = _normBeds(l);
        const nums = new Set();
        const w = { one: 1, two: 2, three: 3, four: 4, five: 5 };
        let m;
        const re = /\b([1-5])\s*-?\s*(?:br|bedrooms?)\b/g;
        while ((m = re.exec(l))) nums.add(parseInt(m[1], 10));
        const re2 = /\b(one|two|three|four|five)[\s-]*bed\s*rooms?\b/g;
        while ((m = re2.exec(l))) nums.add(w[m[1]]);
        return [...nums].sort((a, b) => a - b);
    }

    // Like _bedTokensForMatch but skips bedroom counts stated as a possible use
    // ("ideal for a 2-bedroom conversion"), so matching mirrors the card display.
    function _bedTokensSubject(text) {
        text = _normBeds(text);
        const nums = new Set(), w = { one: 1, two: 2, three: 3, four: 4, five: 5 };
        for (const re of [/\b([1-5])\s*-?\s*(?:br|bedrooms?)\b/gi,
                          /\b(one|two|three|four|five)[\s-]*bed\s*rooms?\b/gi]) {
            let m;
            while ((m = re.exec(text))) {
                if (_hlUseMention(text, m.index, m.index + m[0].length)) continue;
                const v = m[1].toLowerCase();
                nums.add(/^\d$/.test(v) ? parseInt(v, 10) : w[v]);
            }
        }
        return [...nums].sort((a, b) => a - b);
    }

    // Canonical Unit Type(s) for the Match Engine. Returns an array of canonical
    // unit-type tokens — usually one, or several when the post lists a bedroom range
    // ("2BR or 3BR" → ['2 Bedrooms','3 Bedrooms']). Two listings match on Unit Type
    // iff their token sets intersect. Mirrors the card's displayed Unit Type
    // (_hlUnitType) so a match is explainable: same order, same vocabulary. Distinct
    // structure types (Office vs Commercial Space, Townhouse vs Condo) never collapse
    // together, and bedroom counts are matched at the specific level (1BR ≠ 2BR).
    function unitTypesForMatch(raw) {
        const text = (raw || '').replace(/\r/g, '');
        const whole = _wholeProperty(text);
        if (whole) return [whole === 'Commercial Building' || whole === 'Apartment Building' ? 'Building' : whole];
        if (_hlSubject(text, /\bpent[\s-]*house\b/))                 return ['Penthouse'];
        if (_hlSubject(text, /\btown[\s-]*house\b/))                 return ['Townhouse'];
        if (_hlSubject(text, /\bhouse\s*(?:and|&|\+)?\s*lot\b/))     return ['House and Lot'];
        if (_hlSubject(text, /\bresidential\s*lot\b/))               return ['Residential Lot'];
        if (_hlSubject(text, /\bcommercial\s*lot\b/))                return ['Commercial Lot'];
        if (_hlSubject(text, /\bindustrial\s*lot\b/))                return ['Industrial Lot'];
        if (_hlSubject(text, /\bcommercial\s*space\b/))              return ['Commercial Space'];
        if (_hlSubject(text, /\boffice\s*building\b/))               return ['Office Building'];
        if (_hlSubject(text, /\boffice\s*(?:space|unit|condo\w*)\b/)) return ['Office Space'];
        if (_hlSubject(text, /\bstudio\b/))                          return ['Studio'];
        const beds = _bedTokensSubject(text);
        if (beds.length) return beds.map(n => n === 1 ? '1 Bedroom' : `${n} Bedrooms`);
        if (_hlSubject(text, /\boffice\b/))                          return ['Office Space'];
        if (_hlSubject(text, /\bbuilding\b/))                        return ['Building'];
        return [];
    }

    // Parsing a listing (especially fuzzy project matching over long posts) is
    // expensive, and buildMatchMap re-parses the WHOLE pool on every call — on each
    // search keystroke via applyFilters, on every match refresh, and once per
    // dashboard/profile render. Memoize by listing id + content so a given listing
    // is parsed only once. Every text-derived field below depends solely on `text`
    // (which is part of the key), so it stays valid; only the cheap passthrough
    // fields (category/userId) and the `raw` reference are refreshed on a hit so a
    // status/flag change is still reflected.
    const _parseListingCache = new Map();
    // ── Multi-property posts ────────────────────────────────────────────────
    // A broker often lists several properties in ONE post. Mixing them makes a
    // nonsense listing (project A at project C's price, matching buyers in every
    // city mentioned), so a post is split into its property sections and the
    // FIRST one is the listing's canonical identity — location, project, price,
    // unit, size and features are read from that section only. Nothing is ever
    // borrowed from a later section; a field the first section doesn't state
    // stays empty. The stored post text is never altered.
    //
    // A new section starts at a line when the text so far already describes a
    // property and one of these holds:
    //   • the line is a repeated header marker ("🧧 PROJECT", "1. PROJECT") that
    //     owns the detail lines beneath it;
    //   • it follows a blank line and its paragraph has its own price and its
    //     own unit/size/project — or simply names a different project;
    //   • the line is a complete entry by itself ("Kroma 1BR 18M").
    const _PROP_IDENT = /\b\d\s*(?:br|bed(?:room)?s?)\b|\bstudio\b|\bpenthouse\b|\bloft\b|\btownhouse\b|\d\s*(?:sqm|sq\.?\s*m\b)/i;
    const _propSplitCache = new Map();
    const _PROP_MAX_CHARS = 12000, _PROP_MAX_LINES = 400;

    function _propMarker(line) {
        const m = line.match(/^\s*((?:[^\w\s₱("'“‘\[])+|\d{1,2}[.)])\s*\S/u);
        return m ? (/^\d/.test(m[1]) ? '#' : m[1]) : null;   // "1." / "2)" are one marker
    }
    function _propProject(text) {
        try { return extractProject(text) || null; } catch (e) { return null; }
    }

    // Captions pasted from social media are often typed in styled Unicode
    // "fonts" (𝗣𝗥𝗜𝗖𝗘: ₱𝟯𝟬,𝟰𝟯𝟲,𝟬𝟬𝟬) — different code points that only LOOK like
    // letters and digits, so no extractor could read them. NFKC folds them back to
    // plain characters. Extraction reads this folded text; the stored post and what
    // is displayed as the original are never changed.
    function _plainText(text) {
        const t = String(text == null ? '' : text);
        try { return /[^\u0000-\u024f\u20b1]/.test(t) ? t.normalize('NFKC') : t; } catch (e) { return t; }
    }

    function splitProperties(text) {
        const key = String(text == null ? '' : text);
        const cached = _propSplitCache.get(key);
        if (cached) return cached;
        const raw = _plainText(key);
        // Bounded work: a caption is user input parsed for every viewer (and
        // server-side), so an oversized post is simply treated as one property.
        if (raw.length > _PROP_MAX_CHARS) return { multi: false, sections: [raw], primary: raw };   // not cached: cheap
        const lines = raw.split('\n');
        const n = lines.length;
        if (n > _PROP_MAX_LINES) return { multi: false, sections: [raw], primary: raw };
        const blank = lines.map(l => !l.trim());
        // Whether a line carries an asking price is judged with the WHOLE post's
        // intent, so income lines in a sale ("lease at 250,000 per month") don't
        // read as separately priced properties.
        const _intentCat = { sale: 'FOR SALE', rent: 'FOR RENT' }[_priceIntent(raw)] || '';
        const hasPrice = lines.map((l, i) => !blank[i] && _priceCandidates(l, _intentCat).some(c => c.role === 'price' && c.score > 0));
        const hasIdent = lines.map((l, i) => !blank[i] && _PROP_IDENT.test(l));
        const marker = lines.map((l, i) => blank[i] ? null : _propMarker(l));
        const headerish = i => !!marker[i] && /[a-z]{2}/i.test(lines[i]) && !hasPrice[i];
        // A header marker titles a section; a bullet that prefixes nearly every
        // line ("- 2BR", "✅ furnished") is just list formatting, not a boundary.
        const markerUses = new Map(), markerLines = new Map();
        let textLines = 0;
        for (let i = 0; i < n; i++) {
            if (blank[i]) continue;
            textLines++;
            if (marker[i]) markerLines.set(marker[i], (markerLines.get(marker[i]) || 0) + 1);
            if (headerish(i)) markerUses.set(marker[i], (markerUses.get(marker[i]) || 0) + 1);
        }
        const isHeader = i => headerish(i) && markerUses.get(marker[i]) >= 2 && markerLines.get(marker[i]) <= textLines * 0.4;
        const any = (arr, a, b) => { for (let i = a; i < b; i++) if (arr[i]) return true; return false; };
        const count = (a, b) => { let c = 0; for (let i = a; i < b; i++) if (!blank[i]) c++; return c; };
        const join = (a, b) => lines.slice(a, b).join('\n');

        // Project lookup is the costly step: run it at most once per paragraph and
        // remember the current section's project instead of re-reading its text.
        const paraProject = new Map();
        const projectAt = (a, b) => { if (!paraProject.has(a)) paraProject.set(a, _propProject(join(a, b))); return paraProject.get(a); };
        const starts = [0];
        let cur = 0, curProject = null;
        for (let e = 0; e <= n; e++) { if (e === n || blank[e]) { curProject = projectAt(0, e); break; } }
        for (let i = 1; i < n; i++) {
            if (blank[i]) continue;
            const curPrice = any(hasPrice, cur, i), curIdent = any(hasIdent, cur, i);
            if (!curPrice && !curIdent) continue;
            let split = false;
            if (isHeader(i)) {
                let end = i + 1; while (end < n && !isHeader(end)) end++;
                split = count(i, end) >= 2 && (any(hasPrice, i, end) || any(hasIdent, i, end));
            } else if (blank[i - 1]) {
                let end = i + 1; while (end < n && !blank[end]) end++;
                const next = projectAt(i, end);
                if (curPrice && any(hasPrice, i, end) && (any(hasIdent, i, end) || next)) split = true;
                else split = !!(next && curProject && String(next).toLowerCase() !== String(curProject).toLowerCase());
                if (!split && !curProject) curProject = next;   // the section's project may be named in a later paragraph
            }
            if (!split && curPrice && hasPrice[i] && (hasIdent[i] || projectAt(i, i + 1))) split = true;
            if (split) {
                starts.push(i); cur = i;
                let end = i + 1; while (end < n && !blank[end]) end++;
                curProject = projectAt(i, end);
            }
        }
        const sections = starts.map((s, k) => join(s, k + 1 < starts.length ? starts[k + 1] : n).trim()).filter(Boolean);
        const out = (sections.length >= 2)
            ? { multi: true, sections, primary: sections[0] }
            : { multi: false, sections: [raw], primary: raw };
        if (_propSplitCache.size > 2000) _propSplitCache.clear();
        _propSplitCache.set(key, out);
        return out;
    }

    // The text that defines a listing's identity: its first property section
    // (the whole text for an ordinary single-property post).
    // ── Requirement posts (buyers / renters) ────────────────────────────────
    // A "willing to…" post is a REQUIREMENT, and one post often carries several:
    //
    //     WTL:
    //      2 bedroom at Sapphire Bloc/The Imperium/ Residences at the Galleon
    //      Budget: 120,000/month
    //      1 bedroom or 2 bedroom at Two Serendra
    //      Budget: 75,000/month
    //     WTB:
    //      1 bedroom and 2 bedroom at Two Serendra
    //      Budget: FMV
    //
    // That is two intents (lease, buy); the lease intent has two options; the
    // first option accepts any of three projects; "1 bedroom or 2 bedroom" accepts
    // either. Nothing here is one property, so the structure is read FIRST and
    // every project / unit / budget / term stays with the requirement it was
    // written under. Budgets are what the poster will pay — never income.
    //   -> null for a non-requirement post, else
    //      { multi, groups: [{ intent, options: [{ projects, units, furnishing,
    //                                              budget, terms, text }] }] }
    const _REQ_HEADER = /^\s*(wtl|wtb|wtr|willing\s+to\s+(?:lease|rent|buy)|looking\s+to\s+(?:lease|rent|buy))\s*[:\-–]?\s*$/i;
    const _REQ_UNIT = /\bstudio\b|\b(?:[1-5]|one|two|three|four|five)\s*-?\s*(?:br\b|bed\s*rooms?|bedrooms?)/i;
    const _REQ_BUDGET = /\bbudget\b|\bprice\s*range\b/i;
    const _REQ_TERM = /\b(?:lease|term|payment|advance|deposit|cash|buyer|move[\s-]*in|renewable|months?|years?|parking|pets?|floor|view|sqm|financing|loan|bank|occupancy|urgent|asap)\b/i;
    const _REQ_FURN = /\b(?:fully|full|semi)[\s-]*furnished\b|\bunfurnished\b|\bfurnished\b|\bbare(?:\s*shell)?\b/i;
    const _reqCache = new Map();

    function _reqIntent(token) {
        const t = String(token || '').toLowerCase();
        if (/wtb|buy/.test(t)) return 'WILLING TO BUY';
        if (/wtr|rent/.test(t)) return 'WILLING TO RENT';
        return 'WILLING TO LEASE';
    }
    function _reqUnits(text) {
        const w = { one: 1, two: 2, three: 3, four: 4, five: 5 }, out = [];
        const re = /\b(studio)\b|\b([1-5]|one|two|three|four|five)\s*-?\s*(?:br\b|bed\s*rooms?|bedrooms?)/gi;
        let m;
        while ((m = re.exec(text))) {
            const u = m[1] ? 'Studio' : ((/^\d$/.test(m[2]) ? m[2] : w[m[2].toLowerCase()]) + 'BR');
            if (!out.includes(u)) out.push(u);
        }
        return out.sort((a, b) => (a === 'Studio' ? 0 : parseInt(a, 10)) - (b === 'Studio' ? 0 : parseInt(b, 10)));
    }
    function _reqFurnishing(text) {
        const m = String(text).match(_REQ_FURN);
        if (!m) return '';
        const f = m[0].toLowerCase();
        if (/semi/.test(f)) return 'Semi-Furnished';
        if (/unfurnished|bare/.test(f)) return 'Unfurnished';
        return 'Fully Furnished';
    }
    // The projects a requirement line accepts, as alternatives. "… at A/B/ C" names
    // them after the unit; each is canonicalised when the engine knows it and kept
    // exactly as written when it doesn't — a name is never dropped or invented.
    function _reqProjects(line) {
        let rest = String(line).replace(/^[\s•·▪◦*\-–—>]+/, '');
        const unitRe = /\bstudio\b|\b(?:[1-5]|one|two|three|four|five)\s*-?\s*(?:br\b|bed\s*rooms?|bedrooms?)/gi;
        let last = -1, m;
        while ((m = unitRe.exec(rest))) last = m.index + m[0].length;
        if (last >= 0) rest = rest.slice(last);
        const at = rest.match(/^\s*(?:unit\s*)?(?:at|in|@)\s+(.+)$/i);
        if (!at) { const p = extractProject(line); return p ? [p] : []; }
        const names = at[1].replace(new RegExp(_REQ_FURN.source + '.*$', 'i'), '').replace(/[\s,.;:]+$/, '');
        const out = [];
        names.split(/\s*\/\s*|\s+or\s+|\s*;\s*/i).forEach(piece => {
            const p = piece.trim().replace(/^(?:the\s+)?(?=the\s)/i, '');
            if (!p || p.length < 3) return;
            const known = extractProject(p);
            const name = known || p.replace(/\s+/g, ' ');
            if (!out.some(x => x.toLowerCase() === name.toLowerCase())) out.push(name);
        });
        return out;
    }
    function _reqBudget(line) {
        const said = String(line).replace(/^.*?\b(?:budget|price\s*range)\b\s*[:\-–]?\s*/i, '').trim();
        const c = _priceCandidates(line, 'WILLING TO BUY').filter(x => x.role === 'price')[0];
        if (!c) return { amount: null, monthly: false, text: said };              // "FMV", "open", "negotiable" — kept as written
        const tail = line.slice(c.index).replace(/^[\d,.\s]*(?:k|m|million|mn|mil|thousand)?\b/i, '')
            .replace(/^\s*(?:\/|per|a)?\s*(?:month|mo\b|monthly)?\s*/i, '').replace(/^[\s,.;:\-–]+|[\s,.;:]+$/g, '');
        return { amount: c.value, monthly: !!c.monthly, text: said, note: tail };
    }

    function extractRequirements(text, category) {
        const key = String(text == null ? '' : text);
        const ck = String(category || '') + '\u0001' + key;
        if (_reqCache.has(ck)) return _reqCache.get(ck);
        const done = v => { if (_reqCache.size > 2000) _reqCache.clear(); _reqCache.set(ck, v); return v; };
        const raw = _plainText(key);
        if (!raw.trim() || raw.length > _PROP_MAX_CHARS) return done(null);
        const lines = raw.split('\n');
        if (lines.length > _PROP_MAX_LINES) return done(null);

        // 1) Intent groups: "WTL:" / "WTB:" header lines. No header → one group
        //    taking the listing's own category (requirement posts only).
        const heads = [];
        lines.forEach((l, i) => { const m = l.match(_REQ_HEADER); if (m) heads.push({ i, intent: _reqIntent(m[1]) }); });
        let spans;
        if (heads.length) spans = heads.map((h, k) => ({ intent: h.intent, a: h.i + 1, b: k + 1 < heads.length ? heads[k + 1].i : lines.length }));
        else if (/^WILLING/i.test(String(category || '').trim())) spans = [{ intent: String(category).toUpperCase().trim(), a: 0, b: lines.length }];
        else return done(null);

        const groups = spans.map(sp => {
            const options = [];
            let cur = null, ended = false;
            const open = () => { cur = { reqLines: [], budget: null, terms: [], lines: [] }; options.push(cur); };
            for (let i = sp.a; i < sp.b && !ended; i++) {
                const line = lines[i], t = line.trim();
                if (!t) continue;
                const isBudget = _REQ_BUDGET.test(t);
                const isReq = !isBudget && (_REQ_UNIT.test(t) || !!extractProject(t));
                if (isReq && (!cur || cur.budget)) open();                 // a new requirement after a budget = a new option
                if (!cur) { if (isBudget) open(); else continue; }          // text before the first requirement isn't one
                if (isReq) cur.reqLines.push(t);
                else if (isBudget && !cur.budget) cur.budget = _reqBudget(t);
                else if (_REQ_TERM.test(t)) cur.terms.push(t.replace(/^[\s•·▪◦*\-–—>]+/, ''));
                else if (cur.budget && !lines[i - 1].trim()) { ended = true; continue; }   // closing note after the last option
                else continue;
                cur.lines.push(t);
            }
            return {
                intent: sp.intent,
                options: options.filter(o => o.reqLines.length || o.budget).map(o => {
                    const reqText = o.reqLines.join('\n');
                    const projects = [];
                    o.reqLines.forEach(l => _reqProjects(l).forEach(p => { if (!projects.some(x => x.toLowerCase() === p.toLowerCase())) projects.push(p); }));
                    return { projects, units: _reqUnits(reqText), furnishing: _reqFurnishing(reqText),
                             budget: o.budget, terms: o.terms, text: o.lines.join('\n') };
                }),
            };
        }).filter(g => g.options.length);
        if (!groups.length) return done(null);
        const nOptions = groups.reduce((n, g) => n + g.options.length, 0);
        const multi = groups.length > 1 || nOptions > 1 || groups[0].options[0].projects.length > 1;
        return done({ multi, groups });
    }

    // The ONE requirement a multi-requirement post is matched on: the first
    // option of the group whose intent is the listing's category (a post filed
    // under WILLING TO BUY is matched on its WTB requirement, not on the lease
    // options written above it); otherwise the first requirement in the post.
    function _canonicalRequirement(text, category) {
        const req = extractRequirements(text, category);
        if (!req || !req.multi) return null;
        const c = String(category || '').toUpperCase();
        const want = /BUY/.test(c) ? /BUY/ : /RENT|LEASE/.test(c) ? /RENT|LEASE/ : null;
        const g = (want && req.groups.find(x => want.test(x.intent))) || req.groups[0];
        return g.options[0];
    }

    // A requirement post is read through its canonical requirement; any other
    // post through its first property section.
    function primaryText(text, category) {
        const opt = _canonicalRequirement(text, category);
        return opt ? opt.text : splitProperties(text).primary;
    }
    // Public extractors read the primary section, so every consumer — cards,
    // Listing Detail, search, FMV, the match engine — agrees on one identity.
    function _onPrimary(fn) { return function (text) { const a = Array.prototype.slice.call(arguments, 1); return fn.apply(null, [primaryText(text, typeof a[0] === 'string' ? a[0] : undefined)].concat(a)); }; }

    function parseListing(listing) {
        const fullText = listing.content || '';
        const text = primaryText(fullText, listing.category);
        const key = (listing.id != null) ? (listing.id + ' ' + fullText + '|s|' + [listing.category, listing.price, listing.unit_type, listing.location_city, listing.location_area, listing.project].map(function(v){ return v == null ? '' : v; }).join('|')) : null;
        if (key !== null) {
            const hit = _parseListingCache.get(key);
            if (hit) {
                hit.raw = listing;
                hit.category = listing.category;
                hit.userId = listing.user_id;
                return hit;
            }
        }
        const structured = v => v != null && String(v).trim() !== '';
        // When the post doesn't say where it is but names a project the developer
        // dataset knows, the project's own location is its location ("Two Serendra
        // 2BR 25M" is in BGC). Only fills a blank; the post always wins.
        const locationsFor = (txt, project) => {
            let locs = (listing.location_city || listing.location_area)
                ? extractLocations([listing.location_area, listing.location_city].filter(Boolean).join(' '))
                : extractLocations(txt);
            if (!locs.length && project) {
                try {
                    const rec = global.RM_DEVELOPERS && global.RM_DEVELOPERS.getProject && global.RM_DEVELOPERS.getProject(project);
                    if (rec && rec.location) locs = extractLocations(String(rec.location));
                } catch (e) { /* dataset optional */ }
            }
            return locs;
        };
        const build = (txt, category, useColumns, option) => {
            const project = (useColumns && structured(listing.project)) ? String(listing.project) : extractProject(txt);
            return {
                id: listing.id,
                category: category,
                // Phase 1 structured-first: prefer the structured column when present,
                // else fall back to parsing content (identical when the column is NULL).
                locations: locationsFor(txt, project),
                unit: extractUnit(txt),
                unitTypes: (useColumns && structured(listing.unit_type)) ? [String(listing.unit_type)] : unitTypesForMatch(txt),
                project: project,
                // Every project the requirement accepts, as written — so a project the
                // engine has no record of can still be matched by its name.
                projectNames: option ? option.projects.slice() : (project ? [project] : []),
                price: (useColumns && listing.price != null && listing.price !== '') ? Number(listing.price) : extractPrice(txt, category),
                budget: extractBudgetRange(txt, category),
                // A budget given as an instruction, not an amount ("FMV").
                budgetNote: (option && option.budget && option.budget.amount == null) ? (option.budget.text || '') : '',
                terms: option ? option.terms.slice() : [],
                features: extractFeatures(txt),
                userId: listing.user_id,
                raw: listing
            };
        };
        const req = extractRequirements(fullText, listing.category);
        let parsed;
        if (req && req.multi) {
            // One post, several requirements: each is matchable in its own right,
            // under its OWN transaction intent. The canonical one (for display and
            // for callers that read a single identity) is the requirement for the
            // listing's category.
            const variants = [], canon = _canonicalRequirement(fullText, listing.category);
            let canonIdx = 0;
            req.groups.forEach(g => g.options.forEach(o => {
                if (o === canon) canonIdx = variants.length;
                variants.push(build(o.text, g.intent, false, o));
            }));
            parsed = Object.assign({}, variants[canonIdx], { category: listing.category, variants: variants });
        } else {
            const opt = (req && req.groups[0] && req.groups[0].options[0]) || null;
            parsed = build(text, listing.category, true, opt);
        }
        if (key !== null) _parseListingCache.set(key, parsed);
        return parsed;
    }

    // A post with several requirements is matched requirement by requirement:
    // every requirement of one side is scored against every requirement of the
    // other, each under its OWN transaction intent, and the best pair is the
    // match. So a FOR SALE listing meets the WTB requirement of a "WTL / WTB"
    // post, a FOR LEASE listing meets its WTL options, and neither is confused
    // with the other.
    function computeMatchScore(mine, other) {
        const A = (mine && mine.variants) || [mine], B = (other && other.variants) || [other];
        if (A.length === 1 && B.length === 1) return _scorePair(A[0], B[0]);
        let best = { score: 0, reasons: [], details: {} };
        for (const a of A) for (const b of B) {
            const r = _scorePair(a, b);
            if (r.score > best.score) best = r;
        }
        return best;
    }

    // Normalised name for comparing project names as WRITTEN ("Residences at the
    // Galleon" vs "The Residences at The Galleon").
    function _projKey(name) {
        return normalizeSeparators(String(name || '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\bthe\b/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Do the two sides name the same project? Either their resolved projects are
    // equal, or one side accepts (by name, as written) a project the other names
    // or whose post text contains it.
    function _sameProject(a, b) {
        if (a.project && b.project && a.project.toLowerCase() === b.project.toLowerCase()) return a.project;
        const names = x => (x.projectNames && x.projectNames.length ? x.projectNames : (x.project ? [x.project] : []));
        const check = (x, y) => {
            const yKeys = names(y).map(_projKey);
            const yText = ' ' + _projKey(primaryText((y.raw && y.raw.content) || '', y.category)) + ' ';
            for (const n of names(x)) {
                const k = _projKey(n);
                if (k.length < 4) continue;
                if (yKeys.includes(k)) return n;
                // The other side must be a single-identity post that says the name.
                if (yText.includes(' ' + k + ' ') && !(y.project && _projKey(y.project) !== k)) return n;
            }
            return null;
        };
        return check(a, b) || check(b, a);
    }

    // ── Match scoring ───────────────────────────────────────────────────────
    // Whether two posts match at all is decided by three gates that have not
    // changed: complementary transaction, same place, overlapping unit type.
    //
    // HOW GOOD the match is comes from weighing each criterion by how much it
    // matters to a deal, and by what is actually known about it:
    //   • aligned     → full credit
    //   • partly so   → part credit (a price a little over budget)
    //   • unresolved  → half credit: a criterion that matters to this pair but
    //                   cannot be judged from the two posts (an "FMV" budget, a
    //                   missing price). Never a match, never a conflict.
    //   • conflict    → little or no credit, and a ceiling on the whole score
    //   • not stated by the side that would require it → left out entirely
    // So a perfect project + unit match with an unvalidated price is strong, not
    // perfect; and a criterion nobody asked for costs nothing.
    const MATCH_WEIGHTS = { location: 15, project: 25, unit: 25, price: 30, size: 8, features: 5, floor: 4 };
    const UNRESOLVED_CREDIT = 0.5;
    // Score ceilings. A match with nothing beyond the core criteria confirmed
    // stops short of the top; a real conflict caps the score outright.
    const CAP_CORE_ONLY = 95, CAP_ANY_CONFLICT = 89, CAP_MODERATE_CONFLICT = 69, CAP_PROJECT_CONFLICT = 65, CAP_MAJOR_CONFLICT = 55;

    // Labels are earned by the score: a high-sounding word needs a high number.
    function matchGrade(score) {
        const s = Number(score) || 0;
        return s >= 90 ? 'Excellent' : s >= 80 ? 'Strong' : s >= 70 ? 'Good' : s >= 60 ? 'Potential' : s >= 50 ? 'Possible' : 'Weak';
    }

    // Optional source of a fair-market-value estimate for a listing:
    // fn(rawListing) → { value, comparables } or null. Nothing is assumed when
    // no reliable estimate exists — an FMV budget then stays unresolved.
    let _fmvResolver = null;
    function setFmvResolver(fn) { _fmvResolver = (typeof fn === 'function') ? fn : null; }
    const _isFmvNote = note => /\b(fmv|fair\s+market(\s+value)?|market\s+(value|price))\b/i.test(String(note || ''));

    function _money(v, perMonth) {
        const n = Number(v);
        let s;
        if (n >= 1e6) s = '₱' + String(Math.round(n / 1e4) / 100) + 'M';
        else s = '₱' + Math.round(n).toLocaleString('en-US');
        return s + (perMonth ? '/month' : '');
    }
    const _pct = x => Math.round(x * 100) + '%';
    function _orList(items) {
        const a = items.filter(Boolean);
        return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
    }
    // "2 Bedrooms" → "2BR"; "Office" → "office".
    function _unitShort(t) {
        const m = /^(\d+)\s*Bedrooms?$/i.exec(String(t || ''));
        return m ? m[1] + 'BR' : String(t || '').toLowerCase();
    }
    const _article = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
    const _title = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bTo\b/g, 'to');

    function _scorePair(mine, other) {
        // Category must be complementary (required)
        const partnerCat = PARTNER_MAP[mine.category];
        if (!partnerCat || other.category !== partnerCat) return { score: 0, reasons: [], details: {} };

        const details = { category: { match: true, mine: mine.category, theirs: other.category } };
        const buyerSide = mine.category.includes('WILLING') ? mine : other;
        const sellerSide = buyerSide === mine ? other : mine;
        const criteria = [];   // { key, weight, credit, state }
        const caps = [];
        const add = (key, credit, state) => criteria.push({ key, weight: MATCH_WEIGHTS[key], credit, state });

        // 1. Location — HARD REQUIREMENT, EXACT ONLY. Two listings match only when
        // they share the SAME location. Different specific locations are a
        // fundamental incompatibility and must NOT match — e.g. BGC and Makati are
        // both in Metro Manila but are different places. A missing/unknown location
        // on either side also can't establish a shared place, so it rejects too.
        //
        // One exception, which is not a relaxation: the SAME PROJECT is the same
        // place by definition. When both sides name one project and at least one
        // of them simply doesn't state a location ("Two Serendra / 2BR / 25M"), the
        // shared project establishes the shared location. Two stated locations
        // that differ still reject, same project name or not.
        const sharedName = _sameProject(mine, other);
        const proximity = locationProximity(mine.locations, other.locations);
        // A requirement written as "studio in Makati" carries "Makati" as the name
        // it asked for. A place is not a project: it is judged as the location it
        // is, and earns nothing as a project.
        const placeKeys = (mine.locations || []).concat(other.locations || []).map(_projKey);
        const isPlace = name => {
            const k = _projKey(name).replace(/\b(only|area|vicinity|preferably)\b/g, ' ').replace(/\s+/g, ' ').trim();
            if (placeKeys.includes(k)) return true;
            // A short name the location engine recognises and no project list does
            // ("Salcedo Village") is a neighbourhood.
            return k.split(' ').length <= 2 && extractLocations(k).length > 0 && !extractProject(k);
        };
        const projectsOf = side => ((side.projectNames && side.projectNames.length) ? side.projectNames : (side.project ? [side.project] : [])).filter(n => !isPlace(n));
        const sameProject = (sharedName && !isPlace(sharedName)) ? sharedName : null;
        let overlap = [];
        if (proximity === 'exact') {
            overlap = mine.locations.filter(l => other.locations.includes(l));
            details.location = { match: 'exact', value: overlap.join(', ') };
        } else if (sharedName && !(mine.locations.length && other.locations.length)) {
            details.location = { match: 'project', value: sharedName };
        } else return { score: 0, reasons: [], details: {} };
        add('location', 1, 'match');

        // 2. Project. A criterion only when the BUYER names one — a buyer who asked
        // for an area accepts any project in it. Named and the same → aligned.
        // Named, and the listing is a different project → a conflict with what was
        // asked for. Named, and the listing doesn't say → unresolved.
        const wantedProjects = projectsOf(buyerSide), offeredProject = projectsOf(sellerSide)[0] || null;
        const buyerNamesProject = wantedProjects.length > 0;
        if (sameProject) {
            add('project', 1, 'match');
            details.project = { match: true, value: sameProject };
        } else if (buyerNamesProject && offeredProject) {
            add('project', 0, 'conflict');
            caps.push(CAP_PROJECT_CONFLICT);
            details.project = { match: false, mine: mine.project, theirs: other.project, wanted: wantedProjects.slice(), offered: offeredProject };
        } else if (buyerNamesProject) {
            add('project', UNRESOLVED_CREDIT, 'unresolved');
            details.project = { match: 'unresolved', wanted: wantedProjects.slice() };
        }

        // 3. Unit type — MANDATORY, matched at the specific type level. A listing is
        // never a match if the Unit Type differs: 1BR ≠ 2BR ≠ 3BR, and Office ≠
        // Commercial Space ≠ Residential Lot. Both sides must state a unit type and
        // the specific types must overlap ("2BR or 3BR" accepts either).
        const mineTypes = mine.unitTypes || [];
        const otherTypes = other.unitTypes || [];
        if (!mineTypes.length || !otherTypes.length) return { score: 0, reasons: [], details: {} };
        const typeOverlap = mineTypes.filter(u => otherTypes.includes(u));
        if (!typeOverlap.length) return { score: 0, reasons: [], details: {} };
        add('unit', 1, 'match');
        details.unit = { match: true, value: typeOverlap.join(' or '), accepted: (buyerSide.unitTypes || []).slice() };

        // 4. Price — always material, always RELATIONAL: the buyer's position
        // against the seller's asking price. Only these two figures are compared;
        // both come from the role-aware price reader, so rental income, per-sqm
        // rates and reference amounts never enter here.
        const sellerPrice = sellerSide.price || null;
        const buyerBudget = buyerSide.budget || null;
        const note = (!buyerBudget && buyerSide.budgetNote) ? buyerSide.budgetNote : '';
        if (sellerPrice && buyerBudget) {
            const cap = buyerBudget.max, floor = buyerBudget.min;
            if (sellerPrice <= cap) {
                if (sellerPrice >= floor * 0.6) {
                    add('price', 1, 'match');
                    details.price = { match: 'within', seller: sellerPrice, budget: buyerBudget };
                } else {
                    // Affordable, but far under what the buyer said they would spend —
                    // usually a sign the two are not describing the same thing.
                    add('price', 0.8, 'partial');
                    details.price = { match: 'below', seller: sellerPrice, budget: buyerBudget };
                }
            } else {
                // Above the cap — the larger the overage, the smaller the credit, and
                // past a point the price is a conflict that caps the whole match.
                const over = (sellerPrice - cap) / cap;
                if (over <= 0.05) add('price', 0.65, 'partial');
                else if (over <= 0.15) add('price', 0.3, 'conflict');
                else if (over <= 0.30) { add('price', 0.15, 'conflict'); caps.push(CAP_MODERATE_CONFLICT); }
                else { add('price', 0, 'conflict'); caps.push(CAP_MAJOR_CONFLICT); }
                details.price = { match: 'above', seller: sellerPrice, budget: buyerBudget, over: over };
            }
        } else if (sellerPrice && note && _isFmvNote(note)) {
            // "Budget: FMV" — the buyer will pay what the property is fairly worth.
            // That is not a cap, not an unlimited budget and not the asking price:
            // whether this price suits them depends on the fair market value.
            let fmv = null;
            try { fmv = _fmvResolver ? _fmvResolver(sellerSide.raw) : null; } catch (e) { fmv = null; }
            if (fmv && fmv.value > 0) {
                const ratio = sellerPrice / fmv.value;
                if (ratio <= 1.05) add('price', 1, 'match');
                else if (ratio <= 1.15) add('price', 0.5, 'partial');
                else if (ratio <= 1.30) { add('price', 0.15, 'conflict'); caps.push(CAP_MODERATE_CONFLICT); }
                else { add('price', 0, 'conflict'); caps.push(CAP_MAJOR_CONFLICT); }
                details.price = { match: 'fmv', seller: sellerPrice, note: note, fmv: fmv.value, ratio: ratio, comparables: fmv.comparables || null };
            } else {
                add('price', UNRESOLVED_CREDIT, 'unresolved');
                details.price = { match: 'fmv-unresolved', seller: sellerPrice, note: note };
            }
        } else {
            // One side — or both — gives no comparable amount. Unknown, not a match.
            add('price', UNRESOLVED_CREDIT, 'unresolved');
            details.price = { match: 'unresolved', seller: sellerPrice, budget: buyerBudget, note: note,
                              missing: (!sellerPrice && !buyerBudget) ? 'both' : !sellerPrice ? 'asking' : 'budget' };
        }
        const cashBuyer = /\bcash\s+buyer\b/i.test((buyerSide.terms || []).join(' '));

        // Secondary criteria. Each applies only when the buyer's side states it;
        // what only the seller mentions is extra information, not a requirement.
        const bf = buyerSide.features || [], sf = sellerSide.features || [];
        if (bf.length && sf.length) {
            const common = bf.filter(f => sf.includes(f));
            add('features', common.length ? Math.max(0.5, common.length / bf.length) : 0.2, common.length ? (common.length === bf.length ? 'match' : 'partial') : 'unresolved');
            details.features = { match: common.length > 0, common: common, wanted: bf.slice() };
        } else if (bf.length) {
            add('features', UNRESOLVED_CREDIT, 'unresolved');
            details.features = { match: false, common: [], wanted: bf.slice(), unstated: true };
        }

        // Size/sqm and floor band — applicable only when BOTH sides state one.
        const sizeRegex = /(\d+)\s*(?:sqm|sq\.?\s*m)/i;
        const bSize = ((buyerSide.raw && buyerSide.raw.content) || '').match(sizeRegex);
        const sSize = ((sellerSide.raw && sellerSide.raw.content) || '').match(sizeRegex);
        if (bSize && sSize) {
            const want = parseInt(bSize[1]), got = parseInt(sSize[1]);
            const gap = Math.abs(want - got), rel = want ? gap / want : 1;
            if (gap <= 10 || rel <= 0.10) add('size', 1, 'match');
            else if (rel <= 0.25) add('size', 0.5, 'partial');
            else add('size', 0, 'conflict');
            details.size = { match: gap <= 10 || rel <= 0.10, value: got, wanted: want };
        }
        const floorRegex = /\b(high|mid|low)\s*floor\b/i;
        const bFloor = ((buyerSide.raw && buyerSide.raw.content) || '').match(floorRegex);
        const sFloor = ((sellerSide.raw && sellerSide.raw.content) || '').match(floorRegex);
        if (bFloor && sFloor) {
            const same = bFloor[1].toLowerCase() === sFloor[1].toLowerCase();
            add('floor', same ? 1 : 0, same ? 'match' : 'conflict');
            details.floor = { match: same, value: sFloor[1].toLowerCase(), wanted: bFloor[1].toLowerCase() };
        }

        // Weighted compatibility over the criteria that apply to this pair.
        let earned = 0, possible = 0;
        criteria.forEach(c => { earned += c.weight * c.credit; possible += c.weight; });
        let score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
        // 99, never 100. And without anything beyond the core criteria confirmed
        // (a size, a floor, a requested feature) the top of the scale is not reached.
        const corroborated = criteria.some(c => (c.key === 'size' || c.key === 'floor' || c.key === 'features') && c.state === 'match');
        caps.push(corroborated ? 99 : CAP_CORE_ONLY);
        // Nothing with a real conflict in it is an Excellent match.
        if (criteria.some(c => c.state === 'conflict')) caps.push(CAP_ANY_CONFLICT);
        score = Math.max(1, Math.min(score, Math.min.apply(null, caps)));

        // Which requirement of a multi-requirement post produced this match.
        details.requirement = { intent: buyerSide.category, projects: buyerSide.projectNames || [], unitTypes: buyerSide.unitTypes || [] };
        details.criteria = criteria.map(c => ({ key: c.key, state: c.state, credit: c.credit, weight: c.weight }));
        details.grade = matchGrade(score);
        details.analysis = _analyseMatch({ buyerSide, sellerSide, details, sameProject, overlap, typeOverlap, cashBuyer, criteria, wantedProjects, offeredProject,
            wantedPlaces: ((buyerSide.projectNames && buyerSide.projectNames.length) ? buyerSide.projectNames : []).filter(isPlace) });
        const reasons = details.analysis.matches.concat(details.analysis.unresolved, details.analysis.conflicts);
        return { score, grade: details.grade, reasons, details, analysis: details.analysis };
    }

    // The explanation of a match, written from the comparison itself: why the two
    // posts match, what is aligned, what is still open, and what conflicts. It
    // states only what the posts (or a supplied FMV estimate) say.
    function _analyseMatch(c) {
        const d = c.details, buyer = c.buyerSide, seller = c.sellerSide;
        const rent = /RENT|LEASE/.test(buyer.category);
        const who = rent ? 'tenant' : 'buyer';
        const verb = /BUY/.test(buyer.category) ? 'buy' : /LEASE/.test(buyer.category) ? 'lease' : 'rent';
        const offer = /SALE/.test(seller.category) ? 'for sale' : /LEASE/.test(seller.category) ? 'for lease' : 'for rent';
        const money = v => _money(v, rent);
        const matches = [], unresolved = [], conflicts = [];

        matches.push(`Transaction: ${_title(buyer.category)} ↔ ${_title(seller.category)}`);
        const wantedProjects = c.wantedProjects;
        if (d.project && d.project.match === true) matches.push(`Project: ${d.project.value}`);
        else if (d.project && d.project.match === false) conflicts.push(`Project: the ${who} named ${_orList(d.project.wanted)}; this is ${d.project.offered}`);
        else if (d.project) unresolved.push(`Project: the listing does not name its project (${who} wants ${_orList(d.project.wanted)})`);
        matches.push(d.location.match === 'exact' ? `Location: ${d.location.value}` : `Location: same project (${d.location.value})`);
        const accepted = (buyer.unitTypes || []).map(_unitShort);
        const got = c.typeOverlap.map(_unitShort);
        matches.push(`Unit type: ${c.typeOverlap.join(' or ')}` + (accepted.length > got.length ? ` (${who} accepts ${_orList(accepted)})` : ''));
        if (c.cashBuyer) matches.push('Cash buyer');

        // Price — one line for the list, one sentence for the summary.
        const p = d.price;
        let priceSentence = '', priceIsCaveat = true;
        if (p.match === 'within') {
            matches.push(`Price: ${money(p.seller)} asking is within the ${money(p.budget.max)} budget`);
            priceSentence = `The ${money(p.seller)} asking price is within the ${who}'s ${money(p.budget.max)} budget.`;
            priceIsCaveat = false;
        } else if (p.match === 'below') {
            unresolved.push(`Price: ${money(p.seller)} asking is far below the ${who}'s ${money(p.budget.min)}–${money(p.budget.max)} range — confirm it is the same kind of unit`);
            priceSentence = `the ${money(p.seller)} asking price is well under the ${who}'s stated range, so it is worth confirming both describe the same kind of unit.`;
        } else if (p.match === 'above') {
            const gap = `${money(p.seller - p.budget.max)} (${_pct(p.over)}) over the ${money(p.budget.max)} budget`;
            (p.over <= 0.05 ? unresolved : conflicts).push(`Price: ${money(p.seller)} asking is ${gap}`);
            priceSentence = `the ${money(p.seller)} asking price is ${gap}` + (p.over <= 0.05 ? ', a gap that may be negotiable.' : '.');
        } else if (p.match === 'fmv') {
            const basis = `an estimated fair market value of ${money(p.fmv)}` + (p.comparables ? ` (${p.comparables} comparable listings)` : '');
            if (p.ratio <= 1.05) {
                matches.push(`Price: ${money(p.seller)} asking is ${p.ratio < 0.95 ? 'below' : 'in line with'} ${basis}`);
                priceSentence = `The ${who} will pay fair market value, and the ${money(p.seller)} asking price is ${p.ratio < 0.95 ? 'below' : 'in line with'} ${basis}.`;
                priceIsCaveat = false;
            } else {
                (p.ratio <= 1.15 ? unresolved : conflicts).push(`Price: ${money(p.seller)} asking is ${_pct(p.ratio - 1)} above ${basis}`);
                priceSentence = `the ${who} will pay fair market value, and the ${money(p.seller)} asking price is ${_pct(p.ratio - 1)} above ${basis}.`;
            }
        } else if (p.match === 'fmv-unresolved') {
            unresolved.push(`Price: the ${who}'s budget is ${p.note}, not an amount — ${money(p.seller)} asking needs FMV validation`);
            priceSentence = `the ${who} specified ${p.note} rather than a fixed budget, so the ${money(p.seller)} asking price still needs to be validated against fair market value.`;
        } else if (p.missing === 'budget') {
            unresolved.push(p.note ? `Price: the ${who}'s budget is "${p.note}", not an amount — ${money(p.seller)} asking is unconfirmed`
                                   : `Price: the ${who} states no budget — ${money(p.seller)} asking is unconfirmed`);
            priceSentence = `the ${who} did not give a budget amount, so whether the ${money(p.seller)} asking price suits them is unconfirmed.`;
        } else if (p.missing === 'asking') {
            unresolved.push(`Price: no asking price stated` + (p.budget ? ` — cannot be checked against the ${money(p.budget.max)} budget` : (p.note ? ` (${who}'s budget: ${p.note})` : '')));
            priceSentence = `the listing states no asking price, so it cannot be checked against the ${who}'s ` + (p.budget ? `${money(p.budget.max)} budget.` : 'budget.');
        } else {
            unresolved.push('Price: neither side states an amount');
            priceSentence = 'neither side states a price, so price compatibility is unknown.';
        }

        if (d.features) {
            const distinct = list => list.filter(f => !list.some(g => g !== f && g.includes(f)));
            if (d.features.common.length) matches.push(`Features: ${distinct(d.features.common).join(', ')}`);
            const open = distinct(d.features.wanted.filter(f => !d.features.common.includes(f)));
            if (open.length) unresolved.push(`Not confirmed by the listing: ${open.join(', ')}`);
        }
        if (d.size) (d.size.match ? matches : (Math.abs(d.size.value - d.size.wanted) / d.size.wanted <= 0.25 ? unresolved : conflicts))
            .push(d.size.match ? `Size: ~${d.size.value} sqm` : `Size: ${d.size.value} sqm against the ${d.size.wanted} sqm asked for`);
        if (d.floor) (d.floor.match ? matches : conflicts).push(d.floor.match ? `Floor: ${d.floor.value} floor` : `Floor: ${d.floor.value} floor; the ${who} asked for ${d.floor.wanted} floor`);

        // Summary.
        const priceConflict = c.criteria.some(x => x.key === 'price' && x.state === 'conflict');
        const projectConflict = !!(d.project && d.project.match === false);
        let head;
        if (projectConflict) head = `Same area and unit type, but not the project the ${who} named.`;
        else if (priceConflict) head = `The property fits the requirement, but the asking price is above ${d.price.match === 'fmv' ? 'fair market value' : `the ${who}'s budget`}.`;
        else if (c.sameProject) head = 'Strong compatibility on the core requirement.';
        else head = 'Compatible on location and unit type.';
        // A place is quoted as the buyer wrote it ("Salcedo Village only"), which can
        // be narrower than the city it resolves to.
        const where = wantedProjects.length ? `at ${_orList(wantedProjects)}` : c.wantedPlaces.length ? `in ${_orList(c.wantedPlaces)}`
            : (buyer.locations && buyer.locations.length ? `in ${_orList(buyer.locations)}` : '');
        const sellerWhere = c.sameProject ? `at ${c.sameProject}` : c.offeredProject ? `at ${c.offeredProject}` : (c.overlap.length ? `in ${c.overlap.join(', ')}` : '');
        const wantUnits = _orList(accepted);
        const core = `The ${who} is looking to ${verb} ${accepted.length ? _article(wantUnits) : 'a unit'}${where ? ' ' + where : ''}, and the listing ${offer} is ${_article(_orList(got))}${sellerWhere ? ' ' + sellerWhere : ''}.`;
        const cash = c.cashBuyer ? ` The ${who} is also a cash buyer.` : '';
        const price = priceIsCaveat ? ' However, ' + priceSentence : ' ' + priceSentence;
        const projectOpen = (d.project && d.project.match === 'unresolved')
            ? ` The listing does not name its project, so whether it is ${_orList(d.project.wanted)} is unconfirmed.` : '';
        // Any conflict the sentences above have not already covered is said plainly.
        const other = conflicts.filter(x => !/^(Price|Project):/.test(x)).map(x => x.charAt(0).toLowerCase() + x.slice(1));
        const extra = other.length ? ` One point conflicts — ${other.join('; ')}.` : '';
        return { summary: head + ' ' + core + cash + projectOpen + price + extra, matches: matches, unresolved: unresolved, conflicts: conflicts };
    }

    // Every transaction intent a listing can be matched under: its category, plus
    // the intents of any requirement groups inside it.
    function matchCategories(listing) {
        const out = [];
        const add = c => { if (c && !out.includes(c)) out.push(c); };
        add(listing && listing.category);
        try {
            const req = extractRequirements((listing && listing.content) || '', listing && listing.category);
            if (req && req.multi) req.groups.forEach(g => add(g.intent));
        } catch (e) {}
        return out;
    }
    // The categories whose listings could match this one — for callers that
    // pre-select candidates by category. An offer can also meet a requirement
    // group inside a post filed under a different "willing to…" category, so
    // every requirement category is a candidate for an offer.
    function candidateCategories(listing) {
        const out = [];
        const add = c => { if (c && !out.includes(c)) out.push(c); };
        matchCategories(listing).forEach(c => add(PARTNER_MAP[c]));
        if (/^FOR /.test(String((listing && listing.category) || ''))) Object.keys(PARTNER_MAP).filter(c => /^WILLING/.test(c)).forEach(add);
        return out;
    }

    // ── Public API ──
    global.RM_MATCH = {
        PARTNER_MAP,
        KNOWN_PROJECTS,
        COMPANY_NAMES,
        COMPANY_NAME_SET,
        CONTEXT_GATED_PROJECTS,
        EXACT_ONLY_PROJECTS,
        CONTEXT_EVIDENCE,
        FEATURE_KEYWORDS,
        LEARNED_KEY,
        LOCATION_KEYWORDS,
        LOCATION_ZONES,
        ADJACENT_ZONES,
        _UNIT_RANK,
        _hlUseMention,
        _hlSubject,
        _bedTokensForMatch,
        _bedTokensSubject,
        unitTypesForMatch,
        levenshtein,
        normalizeSeparators,
        separatorInsensitivePattern,
        extractLocations: _onPrimary(extractLocations),
        getLocationZone,
        locationProximity,
        fuzzyMatchProject,
        extractProjectFull: _onPrimary(extractProjectFull),
        extractProject: _onPrimary(extractProject),
        extractFeatures: _onPrimary(extractFeatures),
        extractBudgetRange: _onPrimary(extractBudgetRange),
        extractPriceRange: _onPrimary(extractPriceRange),
        extractPrice: _onPrimary(extractPrice),
        extractAmount: _onPrimary(extractAmount),
        extractFinancials: _onPrimary(extractFinancials),
        wholeProperty: function (text) { return _wholeProperty(primaryText(text)); },
        _unitToken,
        _unitRank,
        _smallerUnit,
        extractUnit: _onPrimary(extractUnit),
        getLearnedProjects,
        splitProperties,
        primaryText,
        extractRequirements,
        matchCategories,
        candidateCategories,
        parseListing,
        computeMatchScore,
        matchGrade,
        setFmvResolver,
        MATCH_WEIGHTS,
    };
})(typeof window !== 'undefined' ? window : this);
