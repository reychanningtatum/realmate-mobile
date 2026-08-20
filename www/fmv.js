// ─────────────────────────────────────────────────────────────
//  REALMATE FMV ENGINE
//  Weighted Comparable Similarity + Time Decay
// ─────────────────────────────────────────────────────────────

// ── Known data ────────────────────────────────────────────────
// Top ~50 Philippine developers + their sub-brands. The parser does a
// case-insensitive substring match (text.includes(dev)), so entries are kept as
// full multi-word names wherever a bare token would false-match everyday words
// (e.g. 'ETON' inside "skeleton", 'A BROWN' inside "a brown ..."). Longer/more
// specific names are matched first (see devsSorted in parseListingText).
const FMV_DEVELOPERS = [
    // ── Ayala Land group ──
    'AYALA LAND', 'ALVEO LAND', 'ALVEO', 'AVIDA', 'AMAIA', 'BELLAVITA',
    // ── SM group ──
    'SM PRIME', 'SM DEVELOPMENT', 'SMDC',
    // ── Megaworld group ──
    'MEGAWORLD', 'EMPIRE EAST', 'SUNTRUST PROPERTIES',
    // ── Robinsons ──
    'ROBINSONS LAND', 'ROBINSONS RESIDENCES', 'ROBINSONS HOMES',
    // ── DMCI ──
    'DMCI HOMES', 'DMCI',
    // ── Vista Land group ──
    'VISTA LAND', 'VISTA RESIDENCES', 'CAMELLA HOMES', 'CAMELLA',
    'BRITTANY', 'CROWN ASIA',
    // ── Other Tier 1 ──
    'ROCKWELL LAND', 'ROCKWELL', 'FEDERAL LAND', 'FILINVEST',
    'STA. LUCIA LAND', 'STA LUCIA LAND', 'STA. LUCIA REALTY', 'STA LUCIA',
    // ── Strong mid-to-large ──
    'CENTURY PROPERTIES', 'SHANG PROPERTIES', 'ORTIGAS LAND',
    'ORTIGAS & COMPANY', 'ABOITIZLAND', 'DOUBLEDRAGON', 'A BROWN COMPANY',
    'ETON PROPERTIES', 'PRIMARY HOMES', 'MOLDEX REALTY', 'MOLDEX',
    'NEW SAN JOSE BUILDERS', 'CITYLAND', 'LANDCO PACIFIC', 'LANDCO',
    'CATHAY LAND', 'PHINMA PROPERTY', 'PHINMA',
    // ── Regional / affordable-housing focused ──
    '8990 HOUSING', 'CEBU LANDMASTERS', 'AXEIA DEVELOPMENT',
    'PHIRST PARK HOMES', 'PHIRST', 'RAEMULAN LANDS', 'FIESTA COMMUNITIES',
    'ANTEL GROUP', 'ANCHOR LAND', 'GREENFIELD DEVELOPMENT', 'HAUS TALK',
    'DDC LAND', 'BORLAND DEVELOPMENT', 'NORTHPINE LAND', 'MAJOR HOMES',
    'STATE LAND', 'PUEBLO DE ORO', 'MARIA LUISA PROPERTIES',
    'PRO FRIENDS', 'PROFRIENDS', 'ACM HOMES', 'DON TIM DEVELOPMENT',
    'PARAMOUNT PROPERTY VENTURES', 'GEOESTATE DEVELOPMENT',
    'NUVOLAND',
    // ── Legacy entries kept for continuity ──
    'LAGUNA PROPERTIES',
];

const FMV_LOCATIONS = {
    'BGC': { city: 'Taguig', area: 'BGC' },
    'BONIFACIO GLOBAL CITY': { city: 'Taguig', area: 'BGC' },
    'FORT BONIFACIO': { city: 'Taguig', area: 'BGC' },
    'MAKATI': { city: 'Makati', area: 'Makati' },
    'LEGAZPI': { city: 'Makati', area: 'Makati' },
    'SALCEDO': { city: 'Makati', area: 'Makati' },
    'ROCKWELL': { city: 'Makati', area: 'Rockwell' },
    'ORTIGAS': { city: 'Pasig', area: 'Ortigas' },
    'PASIG': { city: 'Pasig', area: 'Pasig' },
    'TAGUIG': { city: 'Taguig', area: 'Taguig' },
    'MANDALUYONG': { city: 'Mandaluyong', area: 'Mandaluyong' },
    'QUEZON CITY': { city: 'Quezon City', area: 'QC' },
    'QC': { city: 'Quezon City', area: 'QC' },
    'CEBU': { city: 'Cebu', area: 'Cebu' },
    'MANILA': { city: 'Manila', area: 'Manila' },
    'ALABANG': { city: 'Muntinlupa', area: 'Alabang' },
    'EASTWOOD': { city: 'Quezon City', area: 'Eastwood' },
    'MCKINLEY': { city: 'Taguig', area: 'BGC' },
    'WESTGATE': { city: 'Alabang', area: 'Alabang' },
};

const FMV_AMENITIES = [
    'POOL', 'SWIMMING POOL', 'GYM', 'FITNESS', 'PARKING',
    'BALCONY', 'GARDEN', 'ROOFTOP', 'CONCIERGE', 'CLUBHOUSE',
    'PLAYGROUND', 'SECURITY', '24/7', 'CCTV'
];

// ── Parser ─────────────────────────────────────────────────────
// Handles both free-form text and line-by-line format (one detail per line)
function parseListingText(text) {
    if (!text) return {};

    const result = {
        price: null,
        bedrooms: null,
        floorArea: null,
        developer: null,
        project: null,
        city: null,
        area: null,
        amenities: []
    };

    // Split into lines — users often type one detail per line
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    // Also keep the full text for fallback multi-word matching
    const fullText = text.toUpperCase();

    const parseChunk = (chunk) => {
        const t = chunk.toUpperCase().trim();

        // ── Price ──
        if (!result.price) {
            const priceMatch =
                t.match(/^(?:PHP|₱|P)?\s*(\d+(?:\.\d+)?)\s*(?:MILLION|M)\b/) ||
                t.match(/(?:PHP|₱|P)?\s*(\d+(?:\.\d+)?)\s*(?:MILLION|M)\b/) ||
                t.match(/(?:PHP|₱|P)\s*(\d{1,3}(?:,\d{3})+)/) ||
                t.match(/^(\d{7,9})$/);
            if (priceMatch) {
                const raw = priceMatch[1].replace(/,/g, '');
                const val = parseFloat(raw);
                result.price = (priceMatch[0].toUpperCase().includes('M') || priceMatch[0].toUpperCase().includes('MILLION'))
                    ? val * 1_000_000 : val;
            }
        }

        // ── Bedrooms ──
        if (result.bedrooms === null) {
            const brMatch =
                t.match(/^(\d)\s*(?:BR|BEDROOM|BED ROOM|BED)S?$/) ||
                t.match(/(\d)\s*(?:BR|BEDROOM|BED ROOM|BED)S?\b/) ||
                t.match(/^(STUDIO)$/);
            if (brMatch) result.bedrooms = brMatch[1] === 'STUDIO' ? 0 : parseInt(brMatch[1]);
        }

        // ── Floor area ──
        if (!result.floorArea) {
            const sqmMatch = t.match(/^(\d+(?:\.\d+)?)\s*(?:SQ\.?M\.?|SQM|SQUARE METER)/) ||
                             t.match(/(\d+(?:\.\d+)?)\s*(?:SQ\.?M\.?|SQM|SQUARE METER)/);
            if (sqmMatch) result.floorArea = parseFloat(sqmMatch[1]);
        }

        // ── Developer ──
        if (!result.developer) {
            const devsSorted = [...FMV_DEVELOPERS].sort((a, b) => b.length - a.length);
            for (const dev of devsSorted) {
                if (t.includes(dev)) { result.developer = dev; break; }
            }
        }

        // ── Location ──
        if (!result.city) {
            const locsSorted = Object.keys(FMV_LOCATIONS).sort((a, b) => b.length - a.length);
            for (const loc of locsSorted) {
                if (t.includes(loc)) {
                    result.city = FMV_LOCATIONS[loc].city;
                    result.area = FMV_LOCATIONS[loc].area;
                    break;
                }
            }
        }
    };

    // Parse each line first (most accurate — one detail per line)
    lines.forEach(line => parseChunk(line));

    // Fallback: parse full text for anything still missing
    parseChunk(fullText);

    // ── Amenities ── (scan full text)
    result.amenities = FMV_AMENITIES.filter(a => fullText.includes(a));

    return result;
}

// ── Recency factor ─────────────────────────────────────────────
function recencyFactor(createdAt) {
    if (!createdAt) return 0.70;
    const months = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60 * 24 * 30);
    if (months <= 3)  return 1.00;
    if (months <= 6)  return 0.95;
    if (months <= 12) return 0.90;
    if (months <= 24) return 0.80;
    return 0.70;
}

// ── Similarity score ───────────────────────────────────────────
function similarityScore(subject, comp) {
    // Location (40%)
    const locScore =
        subject.area && comp.area && subject.area === comp.area ? 1.0 :
        subject.city && comp.city && subject.city === comp.city ? 0.8 : 0.5;

    // Floor area (25%)
    let areaScore = 0.5; // default if unknown
    if (subject.floorArea && comp.floorArea) {
        const diff = Math.abs(subject.floorArea - comp.floorArea);
        areaScore = Math.max(0, 1 - diff / subject.floorArea);
    }

    // Bedrooms (10%)
    let brScore = 0.5;
    if (subject.bedrooms !== null && comp.bedrooms !== null) {
        brScore = subject.bedrooms === comp.bedrooms ? 1.0 : 0.8;
    }

    // Developer (15%)
    let devScore = 0.5;
    if (subject.developer && comp.developer) {
        devScore = subject.developer === comp.developer ? 1.0 : 0.7;
    }

    // Amenities (10%)
    let amenScore = 0.5;
    if (subject.amenities.length > 0 && comp.amenities.length > 0) {
        const matches = subject.amenities.filter(a => comp.amenities.includes(a)).length;
        amenScore = matches / subject.amenities.length;
    }

    return (
        locScore  * 0.40 +
        areaScore * 0.25 +
        brScore   * 0.10 +
        devScore  * 0.15 +
        amenScore * 0.10
    );
}

// ── Main FMV function ──────────────────────────────────────────
// subjectListing: the listing we're valuing
// allListings: array of all other listings with prices
// Returns: { fmv, confidence, comparablesUsed } or null
// Phase 1 structured-first: prefer structured listing columns when present, else
// fall back to parsing content. Output is identical when all columns are NULL.
function fmvFieldsFor(listing) {
    const p = parseListingText(listing && listing.content);
    if (!listing) return p;
    const has = v => v != null && String(v).trim() !== '';
    return {
        ...p,
        price:     (listing.price != null && listing.price !== '') ? Number(listing.price) : p.price,
        bedrooms:  (listing.bedrooms != null && listing.bedrooms !== '') ? Number(listing.bedrooms) : p.bedrooms,
        floorArea: (listing.floor_area_sqm != null && listing.floor_area_sqm !== '') ? Number(listing.floor_area_sqm) : p.floorArea,
        developer: has(listing.developer) ? String(listing.developer) : p.developer,
        project:   has(listing.project) ? String(listing.project) : p.project,
        city:      has(listing.location_city) ? String(listing.location_city) : p.city,
        area:      has(listing.location_area) ? String(listing.location_area) : p.area,
    };
}

function calculateFMV(subjectListing, allListings) {
    const subject = fmvFieldsFor(subjectListing);
    if (!subject.price) return null; // can't value without a price on subject

    const comparables = allListings.filter(l => {
        if (l.id === subjectListing.id) return false;
        const parsed = fmvFieldsFor(l);
        return parsed.price && parsed.price > 0;
    });

    if (comparables.length < 2) return null; // not enough data

    let numerator = 0;
    let denominator = 0;

    comparables.forEach(comp => {
        const parsed = fmvFieldsFor(comp);
        const sim = similarityScore(subject, parsed);
        const rec = recencyFactor(comp.created_at);
        numerator   += parsed.price * sim * rec;
        denominator += sim * rec;
    });

    if (denominator === 0) return null;

    const fmv = numerator / denominator;
    const priceDiff = ((subject.price - fmv) / fmv) * 100;

    let verdict, verdictClass;
    if (priceDiff < -10) {
        verdict = 'Below Market'; verdictClass = 'fmv-below';
    } else if (priceDiff > 10) {
        verdict = 'Above Market'; verdictClass = 'fmv-above';
    } else {
        verdict = 'Fair Value'; verdictClass = 'fmv-fair';
    }

    return {
        fmv,
        askingPrice: subject.price,
        priceDiff,
        verdict,
        verdictClass,
        comparablesUsed: comparables.length,
        confidence: Math.min(comparables.length / 5, 1) // 5+ comps = 100% confidence
    };
}

// ── Format FMV for display ─────────────────────────────────────
function formatFMV(result) {
    if (!result) return '';
    const fmvFormatted = result.fmv >= 1_000_000
        ? '₱' + (result.fmv / 1_000_000).toFixed(1) + 'M'
        : '₱' + result.fmv.toLocaleString('en-PH');
    const diffSign = result.priceDiff > 0 ? '+' : '';
    const diffStr = `${diffSign}${result.priceDiff.toFixed(0)}%`;
    return { fmvFormatted, diffStr };
}
