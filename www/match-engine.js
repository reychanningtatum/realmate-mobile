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

    function extractPriceRange(text) {
        const lower = text.toLowerCase();
        const rangeM = lower.match(/(\d+\.?\d*)\s*m?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*m(?:illion)?/);
        if (rangeM) return { low: parseFloat(rangeM[1]), high: parseFloat(rangeM[2]), unit: 'M' };
        // K-denominated range e.g. "100 to 150K", "100K-150K" (typical for rent/lease budgets)
        const rangeK = lower.match(/(\d+\.?\d*)\s*k?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*k\b/);
        if (rangeK) return { low: parseFloat(rangeK[1]), high: parseFloat(rangeK[2]), unit: 'K' };
        return null;
    }

    function extractPrice(text) {
        const lower = text.toLowerCase();
        // Detect price range e.g. "30-40M", "30 to 40M", "30M-40M"
        const rangeM = lower.match(/(\d+\.?\d*)\s*m?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*m(?:illion)?/);
        if (rangeM) return parseFloat(rangeM[2]) * 1_000_000; // use upper bound for matching
        // Detect K-denominated range e.g. "100 to 150K", "100K-150K"
        const rangeK = lower.match(/(\d+\.?\d*)\s*k?\s*(?:-|to|or)\s*(\d+\.?\d*)\s*k\b/);
        if (rangeK) return parseFloat(rangeK[2]) * 1_000;
        const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
        // Try each line first (price alone on a line is unambiguous)
        for (const line of lines) {
            const lo = line.toLowerCase();
            let m = lo.match(/^(?:php|₱|p)?\s*(\d+\.?\d*)\s*m(?:illion)?(?:\b|$)/);
            if (m) return parseFloat(m[1]) * 1_000_000;
            m = lo.match(/^(?:php|₱|p)?\s*(\d+\.?\d*)\s*k\b/);
            if (m) return parseFloat(m[1]) * 1_000;
            m = line.replace(/,/g, '').match(/^(\d{7,9})$/);
            if (m) return parseFloat(m[1]);
        }
        // Fallback: scan full text
        let m = lower.match(/(\d+\.?\d*)\s*m(?:illion)?(?:\b|$)/);
        if (m) return parseFloat(m[1]) * 1_000_000;
        m = lower.match(/(\d+\.?\d*)\s*k\b/);
        if (m) return parseFloat(m[1]) * 1_000;
        m = text.replace(/,/g, '').match(/\b(\d{7,9})\b/);
        if (m) return parseFloat(m[1]);
        return null;
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

    function extractUnit(text) {
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
                if (!/[A-Z0-9]/.test(b) && !/[A-Z0-9]/.test(a)) { idx = hit; break; }
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

    function extractBudgetRange(text) {
        const lower = text.toLowerCase().replace(/,/g, '');
        const prices = [];
        const patterns = [
            /(\d+\.?\d*)\s*m(?:illion)?/gi,
            /(?:₱|php|p)\s*(\d+\.?\d*)\s*m/gi,
            /\b(\d{7,9})\b/g,
            /(\d+)\s*k/gi,
        ];
        for (const pat of patterns) {
            let m;
            while ((m = pat.exec(lower)) !== null) {
                let val = parseFloat(m[1]);
                if (pat.source.includes('k')) val *= 1000;
                else if (pat.source.includes('m')) val *= 1_000_000;
                if (val > 0) prices.push(val);
            }
        }
        if (!prices.length) return null;
        return { min: Math.min(...prices), max: Math.max(...prices) };
    }

    // Bedroom counts (1–5) mentioned in the post, digit ("2BR", "2 bedroom") or word
    // ("two-bedroom") form. Returns ALL counts so a range like "2BR or 3BR" keeps both.
    function _bedTokensForMatch(l) {
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
    function parseListing(listing) {
        const text = listing.content || '';
        const key = (listing.id != null) ? (listing.id + ' ' + text + '|s|' + [listing.price, listing.unit_type, listing.location_city, listing.location_area, listing.project].map(function(v){ return v == null ? '' : v; }).join('|')) : null;
        if (key !== null) {
            const hit = _parseListingCache.get(key);
            if (hit) {
                hit.raw = listing;
                hit.category = listing.category;
                hit.userId = listing.user_id;
                return hit;
            }
        }
        const parsed = {
            id: listing.id,
            category: listing.category,
            // Phase 1 structured-first: prefer the structured column when present,
            // else fall back to parsing content (identical when the column is NULL).
            locations: (listing.location_city || listing.location_area)
                ? extractLocations([listing.location_area, listing.location_city].filter(Boolean).join(' '))
                : extractLocations(text),
            unit: extractUnit(text),
            unitTypes: (listing.unit_type != null && String(listing.unit_type).trim() !== '')
                ? [String(listing.unit_type)]
                : unitTypesForMatch(text),
            project: (listing.project != null && String(listing.project).trim() !== '')
                ? String(listing.project)
                : extractProject(text),
            price: (listing.price != null && listing.price !== '')
                ? Number(listing.price)
                : extractPrice(text),
            budget: extractBudgetRange(text),
            features: extractFeatures(text),
            userId: listing.user_id,
            raw: listing
        };
        if (key !== null) _parseListingCache.set(key, parsed);
        return parsed;
    }

    function computeMatchScore(mine, other) {
        let score = 0;
        let reasons = [];
        let details = {};

        // Category must be complementary (required)
        const partnerCat = PARTNER_MAP[mine.category];
        if (!partnerCat || other.category !== partnerCat) return { score: 0, reasons: [], details: {} };
        details.category = { match: true, mine: mine.category, theirs: other.category };

        // ── 4 MAIN INDICATORS (each 25pts = 100pts total) ──

        // 1. Location — HARD REQUIREMENT, EXACT ONLY. Two listings match only when
        // they share the SAME location. Different specific locations are a
        // fundamental incompatibility and must NOT match — e.g. BGC and Makati are
        // both in Metro Manila but are different places, so "Willing to Rent → BGC"
        // vs "For Rent → Makati" is NOT a match. A missing/unknown location on
        // either side also can't establish a shared place, so it rejects too.
        // (Accuracy over quantity — the old "nearby" partial credit is removed.)
        const proximity = locationProximity(mine.locations, other.locations);
        if (proximity !== 'exact') return { score: 0, reasons: [], details: {} };
        const overlap = mine.locations.filter(l => other.locations.includes(l));
        score += 25;
        reasons.push(`Location: ${overlap.join(', ')}`);
        details.location = { match: 'exact', value: overlap.join(', '), points: 25 };

        // 2. Project match
        if (mine.project && other.project && mine.project.toLowerCase() === other.project.toLowerCase()) {
            score += 25;
            reasons.push(`Project: ${mine.project}`);
            details.project = { match: true, value: mine.project, points: 25 };
        } else if (mine.project || other.project) {
            details.project = { match: false, mine: mine.project, theirs: other.project };
        }

        // 3. Unit type match — MANDATORY, matched at the specific type level. A
        // listing is never a match if the Unit Type differs: 1BR ≠ 2BR ≠ 3BR, and
        // Office ≠ Commercial Space ≠ Residential Lot. Both sides must state a unit
        // type and the specific types must overlap ("2BR or 3BR" keeps both counts).
        const mineTypes = mine.unitTypes || [];
        const otherTypes = other.unitTypes || [];
        if (!mineTypes.length || !otherTypes.length) return { score: 0, reasons: [], details: {} };
        const typeOverlap = mineTypes.filter(u => otherTypes.includes(u));
        if (!typeOverlap.length) return { score: 0, reasons: [], details: {} };
        score += 25;
        reasons.push(`Unit: ${typeOverlap.join(' or ')}`);
        details.unit = { match: true, value: typeOverlap.join(' or '), points: 25 };

        // 4. Price/budget compatibility
        const sellerPrice = mine.category.includes('FOR') ? mine.price : other.price;
        const buyerBudget = mine.category.includes('WILLING') ? mine.budget : other.budget;
        if (sellerPrice && buyerBudget) {
            const pctInRange = sellerPrice >= buyerBudget.min * 0.8 && sellerPrice <= buyerBudget.max * 1.2;
            const pctClose = sellerPrice >= buyerBudget.min * 0.6 && sellerPrice <= buyerBudget.max * 1.5;
            if (pctInRange) {
                score += 25;
                reasons.push('Price in range');
                details.price = { match: 'exact', seller: sellerPrice, budget: buyerBudget, points: 25 };
            } else if (pctClose) {
                score += 12;
                reasons.push('Price close to range');
                details.price = { match: 'close', seller: sellerPrice, budget: buyerBudget, points: 12 };
            } else {
                details.price = { match: false, seller: sellerPrice, budget: buyerBudget };
            }
        }

        // Feature overlap
        const allMineFeatures = mine.features;
        const allOtherFeatures = other.features;
        if (allMineFeatures.length && allOtherFeatures.length) {
            const common = allMineFeatures.filter(f => allOtherFeatures.includes(f));
            if (common.length > 0) {
                score += common.length * 5;
                reasons.push(`Features: ${common.join(', ')}`);
                details.features = { match: true, common, points: common.length * 5 };
            }
        }

        // Size/sqm matching
        const sizeRegex = /(\d+)\s*(?:sqm|sq\.?\s*m)/i;
        const mineSize = (mine.raw?.content || '').match(sizeRegex);
        const otherSize = (other.raw?.content || '').match(sizeRegex);
        if (mineSize && otherSize) {
            const ms = parseInt(mineSize[1]), os = parseInt(otherSize[1]);
            if (Math.abs(ms - os) <= 10) {
                score += 10;
                reasons.push(`Size: ~${os} sqm`);
                details.size = { match: true, value: os, points: 10 };
            }
        }

        // Floor preference
        const floorRegex = /\b(high|mid|low)\s*floor\b/i;
        const mineFloor = (mine.raw?.content || '').match(floorRegex);
        const otherFloor = (other.raw?.content || '').match(floorRegex);
        if (mineFloor && otherFloor && mineFloor[1].toLowerCase() === otherFloor[1].toLowerCase()) {
            score += 5;
            reasons.push(`${otherFloor[1]} floor`);
        }

        return { score, reasons, details };
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
        extractLocations,
        getLocationZone,
        locationProximity,
        fuzzyMatchProject,
        extractProjectFull,
        extractProject,
        extractFeatures,
        extractBudgetRange,
        extractPriceRange,
        extractPrice,
        _unitToken,
        _unitRank,
        _smallerUnit,
        extractUnit,
        getLearnedProjects,
        parseListing,
        computeMatchScore,
    };
})(typeof window !== 'undefined' ? window : this);
