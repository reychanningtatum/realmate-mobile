// ═══════════════════════════════════════════════════════════════════════════
// RM_DEVELOPERS — centralized developer + project reference dataset
// ───────────────────────────────────────────────────────────────────────────
// The single, APPEND-ONLY reference dataset for the projects of the top ~50 PH
// real-estate developers. This is the authoritative source Realmate uses for:
//   • Project-name identification + highlights in Listing Detail
//   • Property / project recognition
//   • AI Match Engine knowledge & matching (+25 pts on an exact project hit)
//   • Picking the correct project out of a user's original post
//   • Distinguishing PROJECTS from locations, towers, unit types & other details
//
// ── HOW IT PLUGS INTO THE ENGINE ──────────────────────────────────────────
// This file loads AFTER match-engine.js. On load it walks every project and
// PUSHES safe, specific project names into the LIVE `RM_MATCH.KNOWN_PROJECTS`
// array (the matcher reads that array fresh on every call), so new projects are
// recognized everywhere the engine runs — with NO edits to match-engine.js.
// Because it only mutates the existing array, livemarket.js's destructured
// reference sees the additions too.
//
// ── APPEND-ONLY CONTRACT ──────────────────────────────────────────────────
// Every new batch of developer data is ADDED to DEVELOPERS below. Never delete
// or overwrite previously stored developers/projects. The dataset grows until it
// covers all 50 developers.
//
// ── THREE ENTITY TYPES ────────────────────────────────────────────────────
//   PROJECT  — something users buy/lease/list (One Rockwell). In `projects[]`,
//              fed to the matcher.
//   ESTATE   — a master development / township (Rockwell Center). In `estates[]`,
//              location-like, never a project match; feeds context evidence.
//   LANDMARK — a mall / retail / transit reference (Power Plant Mall). In
//              `landmarks[]`, `matchable:false` — context only, so
//              "condo near Power Plant Mall" never resolves to the mall itself.
//
// ── PROJECT SHAPE ─────────────────────────────────────────────────────────
//   { name, aliases?, location?, category, subtype?, units?, towers?,
//     projectType?, parentProjectId?, developer?, owner?, jv?, subsidiaryOf?,
//     estate?, residential?, match?, source?, status?, note? }
//   • category — 'House and Lot' | 'Residential Lot' | 'Town House' |
//                'Condominium' | 'Commercial Lot' | 'Office' | 'Building'
//   • subtype  — free text refinement (e.g. 'Mid-rise', 'High-rise')
//   • units    — canonical unit tokens: 'Studio','1BR','2BR','3BR','4BR'
//                (loft / junior-1BR / balcony variants go in `note`)
//   • towers   — building/tower LABELS within a project (metadata only, never
//                matched). A tower that is its own development is instead a
//                separate record with projectType:'tower' + parentProjectId.
//   • projectType   — 'residential' | 'residential_office' | 'office' |
//                'commercial' | 'parent_development' | 'tower' | 'village' | 'lot'
//   • parentProjectId — canonical name of the parent development (for tower/child)
//   • developer — the actual DEVELOPMENT entity (a subsidiary stays here, e.g.
//                'Global-Estate Resorts (GERI)'); defaults to the DEVELOPERS key.
//   • owner / jv / subsidiaryOf — populate ONLY when relevant to THIS project and
//                supported by a source (e.g. jv:'Palanca / CP Group (land)').
//                Preserve ALL true facts — current developer, current parent
//                (subsidiaryOf), AND past structure — rather than collapsing them.
//   • historical — true when `developer` is a historical/prior development entity
//                (e.g. Meridien Group of Companies), not a current corporation.
//   • historicalJV / historicalJVShareholding / historicalJVEnd — a JV that USED to
//                exist but is no longer current (e.g. PHirst was a 60/40 Century–
//                Mitsubishi JV until Century bought out Mitsubishi in 2023). Never
//                encode a historical JV as the current `jv`.
//   • residential — false only for office/commercial. It CATEGORIZES; it does NOT
//                unmatch. Offices still feed the matcher; filter by category after.
//   • match    — matching strictness (default = word-boundary exact + fuzzy):
//                'exact'   = word-boundary exact only, no fuzzy;
//                'context' = real project whose name is also a generic phrase —
//                            engine requires a developer/location/tower signal
//                            (registered into RM_MATCH.CONTEXT_GATED_PROJECTS).
//   • source   — attribution provenance (DEFAULT when omitted = 'user'):
//                'authoritative' (developer/corporate source verified) |
//                'user' (from supplied dataset, not independently verified) |
//                'inferred' (derived from a relationship, e.g. estate→developer) |
//                'unverified' (not yet established from any source).
//                Never silently upgrade user/inferred → authoritative.
// ═══════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    const DEVELOPERS = {

        // ═══════════════════════════════════════════════════════════════════
        // AVIDA LAND  (Ayala Land group — mid-market)
        // Formerly Laguna Properties Holdings Inc. (LPHI), est. 1990; renamed
        // Avida Land Corp. 2006. 106 developments across 36 locations.
        // ═══════════════════════════════════════════════════════════════════
        'Avida Land': {
            aliases: ['Avida', 'Avida Land Corp', 'Laguna Properties Holdings', 'LPHI'],
            group: 'Ayala Land',
            projects: [
                // ── Early / LPHI-era horizontal (1990s–early 2000s) ──
                { name: 'Santarosa Estates', location: 'Sta. Rosa, Laguna', category: 'House and Lot' },
                { name: 'Villa Sta. Monica', aliases: ['Hacienda Sta. Monica'], location: 'Lipa, Batangas', category: 'House and Lot' },
                { name: 'Sta. Rosa Village', location: 'Sta. Rosa, Laguna', category: 'House and Lot' },
                { name: 'San Jose Village', location: 'Batangas', category: 'House and Lot' },
                { name: 'San Isidro Village', location: 'Batangas City, Batangas', category: 'House and Lot' },
                { name: 'San Antonio Heights', location: 'Sto. Tomas, Batangas', category: 'House and Lot', jv: 'Avida Land + Greenfield Development Corporation', source: 'authoritative', confidence: 'High', note: 'Avida × Greenfield JV (1998). Avida = developer of record; Greenfield co-developer (Greenfield JV page). No dedicated JV entity named.' },
                { name: 'San Rafael Estates', location: 'Sto. Tomas, Batangas', category: 'House and Lot', jv: 'Avida Land + Greenfield Development Corporation', source: 'authoritative', confidence: 'High', note: 'Avida × Greenfield JV (1998). Avida = developer of record; Greenfield co-developer (Greenfield JV page).' },
                { name: 'Sta. Isabel Village', location: 'Lucena, Quezon', category: 'House and Lot' },
                { name: 'San Francisco Village', location: 'Pacol, Naga', category: 'House and Lot' },
                { name: 'St. Gabriel Heights', location: 'Antipolo, Rizal', category: 'House and Lot' },
                { name: 'St. Alexandra Estates', location: 'Antipolo, Rizal', category: 'House and Lot' },
                { name: 'Sta. Catalina Village', location: 'Dasmariñas, Cavite', category: 'House and Lot' },
                { name: 'Avida Village Sta. Cecilia', aliases: ['Sta. Cecilia Village'], location: 'Dasmariñas, Cavite', category: 'House and Lot' },
                { name: 'Sta. Arcadia Estates', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot' },

                // ── Horizontal / house-and-lot / lot / townhouse (ongoing) ──
                { name: 'Cerise Nuvali', aliases: ['Avida Village Nuvali'], location: 'Nuvali, Laguna', category: 'House and Lot' },
                { name: 'Ridgeview Estates Nuvali', aliases: ['Avida Estates Nuvali'], location: 'Canlubang, Laguna', category: 'House and Lot' },
                { name: 'Woodhill Settings Nuvali', aliases: ['Avida Woodhill Settings Nuvali'], location: 'Canlubang, Laguna', category: 'House and Lot' },
                { name: 'Hillcrest Estates Nuvali', location: 'Canlubang, Laguna', category: 'House and Lot' },
                { name: 'Abrio at Nuvali', location: 'Canlubang, Laguna', category: 'House and Lot', note: 'Bare "Abrio" already matched by the engine.' },
                { name: 'Southdale Settings Nuvali', location: 'Nuvali, Laguna', category: 'House and Lot' },
                { name: 'Crescela Nuvali', location: 'Nuvali, Laguna', category: 'House and Lot' },
                { name: 'Averdeen Estates Nuvali', location: 'Calamba, Laguna', category: 'Residential Lot' },
                { name: 'Avida Parkway Settings Nuvali', location: 'Nuvali, Laguna', category: 'House and Lot' },
                { name: 'Solara Park Storeys Nuvali', location: 'Nuvali, Laguna', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '4BR'] },
                { name: 'Southgrove Estates', location: 'Imus, Cavite', category: 'House and Lot' },
                { name: 'Parklane Settings Vermosa', location: 'Imus, Cavite', category: 'House and Lot' },
                { name: 'Verra Settings Vermosa', aliases: ['Avida Verra Settings Vermosa'], location: 'Imus, Cavite', category: 'House and Lot' },
                { name: 'Sentria Storeys Vermosa', location: 'Vermosa, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Serin Terraces Tagaytay', location: 'Tagaytay, Cavite', category: 'Town House' },
                { name: 'Serin East Tagaytay', location: 'Tagaytay, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Serin West Tagaytay', location: 'Tagaytay, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Settings Greendale Alviera', location: 'Porac, Pampanga', category: 'Residential Lot' },
                { name: 'Avida Northdale Settings Alviera', location: 'Porac, Pampanga', category: 'Residential Lot' },
                { name: 'Vermont Settings Alviera', location: 'Porac, Pampanga', category: 'Residential Lot' },
                { name: 'Aldea Grove Estates', location: 'Angeles, Pampanga', category: 'House and Lot' },
                { name: 'Avida Settings Altaraza', location: 'San Jose del Monte, Bulacan', category: 'House and Lot' },
                { name: 'Avida Settings Cabanatuan', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot' },
                { name: 'Greenlane Settings', location: 'Ilagan, Isabela', category: 'House and Lot' },
                { name: 'Avida Village Iloilo', location: 'Pavia, Iloilo', category: 'House and Lot' },
                { name: 'Madera Grove Estates', location: 'Malolos, Bulacan', category: 'House and Lot' },

                // ── Vertical / condominium (Avida Towers & named towers) ──
                { name: 'Avida Towers Sucat', aliases: ['One Aeropolis'], location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers New Manila', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers San Lazaro', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Alabang', location: 'Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Altura', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Ardane', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR'] },
                { name: 'Avida Towers Centera', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Verge', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Avida Towers Cloverleaf', location: 'Balintawak, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Vita', location: 'Vertis North, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Sola', location: 'Vertis North, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Astrea', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR'] },
                { name: 'The Heights Katipunan', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Makati Southpoint', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR'], note: 'Also junior-1BR units.' },
                { name: 'Avida Towers Asten', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Makati West', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'One Antonio', location: 'Makati', category: 'Condominium' },
                { name: 'Avida Towers Prime Taft', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Centralis Towers', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], note: 'Also junior-1BR units.' },
                { name: 'Patio Madrigal', location: 'Roxas Boulevard, Pasay', category: 'Condominium', units: ['Studio', '1BR'], note: 'Junior-1BR and 1BR-with-balcony variants.' },
                { name: 'Avida Towers Verte', aliases: ['Avida Towers Verte BGC'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers 34th Street', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Cityflex Towers BGC', aliases: ['Avida Towers BGC 9th Avenue'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Turf BGC', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'The Montane', location: 'BGC, Taguig', category: 'Condominium', note: 'Confirmed Avida (user, 2026-08-13).' },
                { name: 'Avida Towers Vireo', location: 'Arca South, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers One Union Place', location: 'Arca South, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Riala', location: 'Cebu IT Park, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Atria', aliases: ['Avida Storeys Atria'], location: 'Iloilo', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Atria Park District' },
                { name: 'Avida Towers Aspira', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Avida Towers Davao', aliases: ['Avida Towers Abreeza'], location: 'Davao', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                // Marquee Residences was MOVED to Alveo Land on 2026-08-14 dual-source
                // reconciliation: the user's new ALP/Alveo data + web both attribute it to
                // Alveo (Angeles, Pampanga), overriding the earlier 2026-08-13 Avida note.
                // See the 'Alveo Land' entry for the live record.

                // NOTE: South Park District was reclassified from a project to an
                // ESTATE (2026-08-13) — it is Avida's master-planned mixed-use
                // estate in Alabang/Muntinlupa. It now lives in the estates layer
                // under 'Ayala Land' (developer: Avida) and is no longer fed to the
                // project matcher.

                // ── Office / commercial ──
                { name: 'One Park Drive', location: 'BGC, Taguig', category: 'Office' },
                { name: 'Capital House', location: 'BGC, Taguig', category: 'Office', note: 'Confirmed Avida (user, 2026-08-13); developed by BG North Properties, a JV of Avida Land & Evergreen Holdings.' },

                // NOTE: Orean Place & Ametta Place (→ Alveo) and Arbor Lanes,
                // 1016 Residences, Park Point Residences (→ Ayala Land Premier)
                // were removed from Avida per user confirmation 2026-08-13 — they
                // belong to those developers and are already matched by the engine;
                // they get proper attribution when Alveo/ALP are ingested. Marquee
                // Residences was reassigned to Avida (live project above).
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // AMAIA LAND  (Ayala Land group — economic / affordable)
        // ═══════════════════════════════════════════════════════════════════
        'Amaia Land': {
            aliases: ['Amaia'],
            group: 'Ayala Land',
            projects: [
                // ── Amaia Scapes (house and lot) ──
                { name: 'Amaia Scapes Laguna', location: 'Calamba, Laguna', category: 'House and Lot' },
                { name: 'Amaia Scapes San Pablo', location: 'San Pablo, Laguna', category: 'House and Lot' },
                { name: 'Amaia Scapes Cabuyao', location: 'Cabuyao, Laguna', category: 'House and Lot' },
                { name: 'Amaia Scapes Bauan', location: 'Bauan, Batangas', category: 'House and Lot' },
                { name: 'Amaia Scapes Batangas', location: 'Batangas', category: 'House and Lot' },
                { name: 'Amaia Scapes Lipa', location: 'Lipa, Batangas', category: 'House and Lot' },
                { name: 'Amaia Scapes Lucena', location: 'Lucena, Quezon', category: 'House and Lot' },
                { name: 'Amaia Scapes General Trias', location: 'General Trias, Cavite', category: 'House and Lot' },
                { name: 'Amaia Scapes Trece Martires', aliases: ['Amaia Scapes Trece Martires 2'], location: 'Trece Martires, Cavite', category: 'House and Lot' },
                { name: 'Amaia Scapes Bulacan', location: 'Santa Maria, Bulacan', category: 'House and Lot' },
                { name: 'Amaia Scapes San Fernando', location: 'San Fernando, Pampanga', category: 'House and Lot' },
                { name: 'Amaia Scapes Pampanga', location: 'Mexico, Pampanga', category: 'House and Lot' },
                { name: 'Amaia Scapes Capas', location: 'Capas, Tarlac', category: 'House and Lot' },
                { name: 'Amaia Scapes Cabanatuan', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot' },
                { name: 'Amaia Scapes Urdaneta', location: 'Urdaneta, Pangasinan', category: 'House and Lot' },
                { name: 'Amaia Scapes North Point', location: 'Talisay, Negros Occidental', category: 'House and Lot' },
                { name: 'Amaia Scapes Iloilo', location: 'Iloilo', category: 'House and Lot' },
                { name: 'Amaia Scapes Cagayan de Oro', location: 'Cagayan de Oro, Misamis Oriental', category: 'House and Lot' },
                { name: 'Amaia Scapes Rizal', location: 'Rizal', category: 'House and Lot' },

                // ── Amaia Series (town house) ──
                { name: 'Amaia Series Nuvali', location: 'Nuvali, Laguna', category: 'Town House' },
                { name: 'Amaia Series Nova', aliases: ['Amaia Series Novaliches'], location: 'Novaliches, Quezon City', category: 'Town House' },
                { name: 'Amaia Series Vermosa', location: 'Imus, Cavite', category: 'Town House' },

                // ── Amaia Steps (mid-rise condominium) ──
                { name: 'Amaia Steps Nova', aliases: ['Amaia Steps Novaliches'], location: 'Novaliches, Quezon City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Sucat', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Bicutan', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Pasig', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], towers: ['Aria', 'Blanca', 'Esperanza', 'Clara'] },
                { name: 'Amaia Steps Alabang', location: 'Las Piñas', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Nuvali', location: 'Nuvali, Laguna', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Parkway Nuvali', location: 'Nuvali, Laguna', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Altaraza', location: 'San Jose del Monte, Bulacan', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps The Junction Place', location: 'Novaliches, Quezon City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Mandaue', location: 'Mandaue, Cebu', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Steps Capitol Central', location: 'Bacolod', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'] },

                // ── Amaia Skies (high-rise condominium) ──
                { name: 'Amaia Skies Cubao', location: 'Cubao, Quezon City', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR'] },
                { name: 'Amaia Skies Shaw', location: 'Mandaluyong', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR'], towers: ['North Tower'] },
                { name: 'Amaia Skies Avenida', location: 'Sta. Cruz, Manila', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR'], towers: ['North Tower'] },
                { name: 'Amaia Skies Sta. Mesa', location: 'Sta. Mesa, Manila', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR'], towers: ['South Tower'] },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // BELLAVITA  (Ayala Land group — socialized / economic housing)
        // ═══════════════════════════════════════════════════════════════════
        'BellaVita': {
            aliases: ['Bellavita', 'BellaVita Land'],
            group: 'Ayala Land',
            projects: [
                { name: 'BellaVita General Trias', location: 'General Trias, Cavite', category: 'House and Lot', note: 'Maiden project (~12–13.7 ha, multiple phases).' },
                { name: 'BellaVita Alaminos', aliases: ['BellaVita Alaminos 2'], location: 'Alaminos, Laguna', category: 'House and Lot' },
                { name: 'BellaVita Lipa', location: 'Lipa, Batangas', category: 'House and Lot' },
                { name: 'BellaVita Porac', location: 'Porac, Pampanga', category: 'House and Lot' },
                { name: 'BellaVita Cabanatuan', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot' },
                { name: 'BellaVita Capas', location: 'Capas, Tarlac', category: 'House and Lot' },
                { name: 'BellaVita San Pablo', location: 'San Pablo, Laguna', category: 'House and Lot' },
                { name: 'BellaVita Tayabas', location: 'Tayabas, Quezon', category: 'House and Lot' },
                { name: 'BellaVita Pililla', location: 'Pililla, Rizal', category: 'House and Lot' },
                { name: 'BellaVita Cagayan de Oro', location: 'Cagayan de Oro', category: 'House and Lot' },
                { name: 'BellaVita Pila', location: 'Pila, Laguna', category: 'House and Lot' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // ESTATE / CBD / TOWNSHIP LAYER
        // ───────────────────────────────────────────────────────────────────
        // Parent containers (developer → estate → project → tower). Estates are
        // townships / CBDs / master-planned communities, NOT projects — they are
        // location-like, so they are NEVER fed to the project matcher. Projects
        // link up via a project `estate:` field; getProjectsInEstate() also
        // resolves projects whose name/location references the estate.
        // Estate shape: { name, aliases?, location, type, developer?, note? }
        //   type ∈ 'CBD' | 'Township' | 'Mixed-use estate' | 'Industrial estate'
        //          | 'Residential estate' | 'Leisure estate'
        // ═══════════════════════════════════════════════════════════════════

        // ── Ayala Land, Inc. (ALI + Ayala Land Premier; parent of Alveo, Avida,
        //    Amaia, BellaVita). ALI reports ~52–54 estates. ──
        'Ayala Land': {
            aliases: ['Ayala Land Inc', 'ALI', 'Ayala Land Premier', 'ALP'],
            group: 'Ayala Land',
            estates: [
                { name: 'Makati Central Business District', aliases: ['Makati CBD'], location: 'Makati', type: 'CBD' },
                { name: 'Bonifacio Global City', aliases: ['BGC', 'Fort Bonifacio'], location: 'Taguig', type: 'CBD' },
                { name: 'Nuvali', location: 'Sta. Rosa / Calamba / Cabuyao, Laguna', type: 'Township' },
                { name: 'Arca South', location: 'Taguig', type: 'Township' },
                { name: 'Vermosa', location: 'Imus / Dasmariñas, Cavite', type: 'Township' },
                { name: 'Alviera', location: 'Porac, Pampanga', type: 'Township' },
                { name: 'Altaraza', location: 'San Jose del Monte, Bulacan', type: 'Township' },
                { name: 'Vertis North', location: 'Quezon City', type: 'CBD' },
                { name: 'Circuit Makati', location: 'Makati', type: 'Mixed-use estate' },
                { name: 'Cebu Business Park', aliases: ['Cebu Park District'], location: 'Cebu City', type: 'CBD' },
                { name: 'Broadfield', location: 'Biñan, Laguna', type: 'Township' },
                { name: 'Aéra', aliases: ['Aera'], location: 'Carmona, Cavite', type: 'Township' },
                { name: 'Southmont', location: 'Silang / Dasmariñas, Cavite', type: 'Township', jv: 'Ayala Land + Cathay Land', source: 'authoritative', note: '800-ha mixed-use estate; Ayala Land × Cathay Land JV (unveiled Sept 2023). Holds Verdea & Hillside Ridge (Alveo × Cathay) and Lanewood Hills (ALP × Cathay).' },
                { name: 'Azuela Cove', location: 'Davao City', type: 'Mixed-use estate' },
                { name: 'Lio', aliases: ['Lio Estate'], location: 'El Nido, Palawan', type: 'Leisure estate' },
                { name: 'Atria Park District', location: 'Iloilo City', type: 'Mixed-use estate' },
                { name: 'Capitol Central', location: 'Bacolod', type: 'Mixed-use estate' },
                { name: 'Crossroads', location: 'Bulacan', type: 'Township' },
                { name: 'Areza', location: 'Lipa, Batangas', type: 'Township' },
                { name: 'Evo City', location: 'Kawit, Cavite', type: 'Township' },
                { name: 'Cloverleaf', location: 'Balintawak, Quezon City', type: 'Mixed-use estate' },
                { name: 'Parklinks', location: 'Quezon City / Pasig', type: 'Township', note: 'JV with Eton Properties.' },
                { name: 'South Park District', location: 'Alabang, Muntinlupa', type: 'Mixed-use estate', developer: 'Avida Land', note: 'Reclassified from project 2026-08-13.' },
                { name: 'Laguna Technopark', location: 'Sta. Rosa / Biñan, Laguna', type: 'Industrial estate' },
            ],
            projects: [],
        },

        // ═══════════════════════════════════════════════════════════════════
        // AYALA LAND PREMIER (ALP) — Ayala Land's luxury brand.
        // DUAL-SOURCE ingest (2026-08-14): user-supplied list + web research +
        // the 135 names already live in match-engine.js's KNOWN_PROJECTS. Names
        // are confirmed by BOTH the user's data and the prior matcher list;
        // developer-entity/JV/category attributions marked source:'authoritative'
        // are the ones independently web-verified this session, the rest are
        // source:'user' (user split, not independently confirmed). Horizontal
        // developments carry the CURRENT product type (House and Lot vs
        // Residential Lot), verified where possible — not auto-forced to lot.
        // ═══════════════════════════════════════════════════════════════════
        'Ayala Land Premier': {
            aliases: ['ALP', 'Ayala Land Premier Homes'],
            group: 'Ayala Land',
            estates: [],
            projects: [
                // ── Established prestige villages (built-out; lots & houses both trade) ──
                { name: 'Forbes Park', location: 'Makati', category: 'House and Lot', estate: 'Makati Central Business District', source: 'user', note: 'Ayala-developed prestige village (est. 1940s–50s); ALP is the group’s luxury brand. Both lots and completed houses trade on resale.' },
                { name: 'Bel-Air Village', location: 'Makati', category: 'House and Lot', source: 'user', note: 'Built-out Ayala village; lots + houses. Distinct from ALP’s Bel-Air at Rockwell Bacolod.' },
                { name: 'Dasmariñas Village', aliases: ['Dasmarinas Village'], location: 'Makati', category: 'House and Lot', source: 'user', note: 'Built-out Ayala prestige village.' },
                { name: 'Urdaneta Village', location: 'Makati', category: 'House and Lot', source: 'user' },
                { name: 'Magallanes Village', location: 'Makati', category: 'House and Lot', source: 'user' },
                { name: 'Ayala Alabang Village', location: 'Muntinlupa', category: 'House and Lot', source: 'user', note: 'Ayala-developed prestige village; lots + houses.' },

                // ── ALP horizontal / residential-lot developments ──
                { name: 'Ayala Heights', location: 'Quezon City', category: 'Residential Lot', source: 'user' },
                { name: 'Ayala North Point', location: 'Talisay, Negros Occidental', category: 'Residential Lot', source: 'user' },
                { name: 'Ayala Westgrove Heights', location: 'Silang, Cavite', category: 'Residential Lot', source: 'authoritative', confidence: 'High', note: '~400 ha lot-only community (400–1,100 sqm cuts); buyer builds. Verified lot-only. The base community is ALP-developed (not a JV); Phase 2C (~20 ha) is a distinct ALP × Cathay Land JV — see "Ayala Westgrove Heights Phase 2C".' },
                { name: 'Ayala Westgrove Heights Phase 2C', aliases: ['Westgrove Heights Phase 2C'], location: 'Silang, Cavite', category: 'Residential Lot', jv: 'Ayala Land Premier + Cathay Land', source: 'authoritative', confidence: 'High', note: 'Distinct ~20 ha ALP × Cathay Land JV phase within Ayala Westgrove Heights. Developer of record = ALP; Cathay is JV partner. Confirmed on Cathay’s official /developments/ Joint Ventures section.' },
                { name: 'Ayala Southvale Village', aliases: ['Ayala Southvale'], location: 'Bacoor / Las Piñas', category: 'Residential Lot', source: 'user' },
                { name: 'Ayala Greenfield Estates', location: 'Calamba, Laguna', category: 'Residential Lot', developer: 'Ayala Greenfield Development Corporation', jv: 'Ayala Land Premier + Greenfield Development Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Golf/mountain estate (~550 ha, launched 2000). Dedicated JV entity = Ayala Greenfield Development Corp. (AGDC), an Ayala Land × Greenfield JV. Confirmed on Greenfield’s Joint Ventures page + Ayala/SMC releases.' },
                { name: 'Montgomery Place', location: null, category: 'Residential Lot', source: 'user', confidence: 'Low', note: 'ALP per user; location/details not independently verified — FLAGGED.' },
                { name: 'Ayala Hillside Estates', location: 'Quezon City', category: 'Residential Lot', source: 'user' },
                { name: 'Anvaya Cove', location: 'Morong, Bataan', category: 'Residential Lot', projectType: 'lot', source: 'authoritative', confidence: 'High', note: 'ALP’s first leisure development. Mixed property types: leisure lots, The Verandas (condo), townhouses, and Beach & Nature Club shares.' },
                { name: 'Amara', location: 'Liloan, Cebu', category: 'Residential Lot', source: 'user', note: 'Seaside residential-lot community. Engine keeps full name (fuzzy-guarded vs "Amaia" brand).' },
                { name: 'Abrio', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High', note: 'ALP’s first Nuvali subdivision (2007, ~70 ha lots).' },
                { name: 'Alegria Hills', location: 'Cagayan de Oro', category: 'House and Lot', source: 'user', note: 'User: lots + house-and-lot.' },
                { name: 'Montecito', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High', note: '270-lot Nuvali community.' },
                { name: 'Santierra', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High' },
                { name: 'Elaro', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High' },
                { name: 'Soliento', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High' },
                { name: 'Riomonte', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'High', note: '~844 lots, 480–890 sqm cuts.' },
                { name: 'Cerilo', aliases: ['Cerilo Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Andacillo', aliases: ['Andacillo Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Arcilo', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Luscara', location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'authoritative', confidence: 'Medium', note: 'CONFLICT: user listed under condo units; ALP/web place Luscara among Nuvali residential-lot communities. Classified as Residential Lot per web.' },
                { name: 'The Courtyards at Vermosa', aliases: ['The Courtyards by Ayala Land Premier'], location: 'Imus / Dasmariñas, Cavite', category: 'House and Lot', estate: 'Vermosa', source: 'user', note: 'Lots + house-and-lot.' },
                { name: 'Crescent Grove at Vermosa', location: 'Imus / Dasmariñas, Cavite', category: 'Residential Lot', estate: 'Vermosa', source: 'user' },
                { name: 'Park Estates at Alviera', location: 'Porac, Pampanga', category: 'Residential Lot', estate: 'Alviera', source: 'user' },
                { name: 'Lanewood Hills', location: 'Southmont, Silang, Cavite', category: 'Residential Lot', estate: 'Southmont', jv: 'Ayala Land Premier + Cathay Land', source: 'authoritative', confidence: 'High', note: 'ALP × Cathay Land JV within the Ayala×Cathay Southmont estate (57 ha, 362 lots; greenways emphasis). Developer of record = ALP; Cathay is JV partner. Confirmed on Cathay JV page.' },
                { name: 'Ciela at Aera Heights', location: 'Carmona, Cavite', category: 'Residential Lot', estate: 'Aéra', source: 'user' },
                { name: 'Virendo', location: null, category: 'House and Lot', source: 'user', confidence: 'Low', note: 'User: lots + house-and-lot; location not verified — FLAGGED.' },
                { name: 'The Enclaves at North Point', location: 'Talisay, Negros Occidental', category: 'Residential Lot', source: 'user' },
                { name: 'Miravera', location: 'Imus / Dasmariñas, Cavite', category: 'Residential Lot', estate: 'Vermosa', source: 'user', confidence: 'Low', note: 'Vermosa per inference; not independently verified.' },

                // ── ALP condominiums (individual residential units) ──
                { name: 'One Salcedo', aliases: ['One Salcedo Place'], location: 'Salcedo Village, Makati', category: 'Condominium', source: 'user' },
                { name: 'One Roxas Triangle', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user', note: 'Penthouse units.' },
                { name: 'Two Roxas Triangle', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user', note: 'Penthouse units.' },
                { name: 'One Legazpi Park', location: 'Legazpi Village, Makati', category: 'Condominium', source: 'user' },
                { name: 'The Residences at Greenbelt', aliases: ['Residences at Greenbelt'], location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user', towers: ['Laguna Tower', 'San Lorenzo Tower', 'Manila Tower'] },
                { name: 'One Serendra', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'user', note: 'Serendra development (Ayala Land); user attributes One Serendra to ALP.' },
                { name: 'Park Terraces', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user', note: 'Ayala Center; Point/Tower 1–3.' },
                { name: '1016 Residences', location: null, category: 'Condominium', source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'The Suites at One Bonifacio High Street', aliases: ['The Suites at One Bonifacio'], location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'user' },
                { name: 'Garden Towers', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user', note: 'Ayala Triangle; twin towers.' },
                { name: 'Park Point Residences', location: 'Cebu Business Park, Cebu', category: 'Condominium', estate: 'Cebu Business Park', source: 'user' },
                { name: 'East Gallery Place', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', developer: 'BG West Properties, Inc.', subsidiaryOf: 'Ayala Land', jv: null, units: ['1BR', '2BR', '3BR', '4BR'], source: 'authoritative', confidence: 'High', note: 'High Street South, BGC; ALP brand. Also Flex-2/Flex-3/Skysuite/Skycove Aqua/Skyrise/Villa variants. Developer entity: BG West Properties, Inc.' },
                { name: 'West Gallery Place', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', developer: 'Ayala Land Premier', source: 'authoritative', confidence: 'Medium', note: '49-storey sibling of East Gallery Place, High Street South. Development vehicle likely BG West (inferred).' },
                { name: 'Park Central Towers', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'authoritative', confidence: 'Medium', note: 'ALP, Ayala Center Makati; penthouse units. ALP brand confirmed via web.' },
                { name: 'Arbor Lanes', location: 'Arca South, Taguig', category: 'Condominium', estate: 'Arca South', units: ['1BR', '2BR', '3BR'], source: 'user', note: 'Also Duo (1BR + studio).' },
                { name: 'Gardencourt Residences', location: 'Arca South, Taguig', category: 'Condominium', estate: 'Arca South', units: ['1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Parklinks North Tower', location: 'Quezon City / Pasig', category: 'Condominium', estate: 'Parklinks', developer: 'ALI Eton Property Development Corp.', jv: 'Ayala Land + Eton Properties (LT Group)', subsidiaryOf: null, units: ['1BR', '2BR', '3BR', '4BR'], source: 'authoritative', confidence: 'High', note: '50/50 Ayala Land × Eton JV entity is the developer; marketed under ALP. 280 units, 55 floors.' },
                { name: 'Parklinks South Tower', location: 'Quezon City / Pasig', category: 'Condominium', estate: 'Parklinks', developer: 'ALI Eton Property Development Corp.', jv: 'Ayala Land + Eton Properties (LT Group)', subsidiaryOf: null, units: ['1BR', '2BR', '3BR', '4BR'], source: 'authoritative', confidence: 'High', note: 'Same Ayala × Eton JV entity; 313 units.' },
                { name: 'The Alcoves', location: 'Cebu Business Park, Cebu', category: 'Condominium', estate: 'Cebu Business Park', source: 'user' },
                { name: 'Twin Towers', location: null, category: 'Condominium', match: 'context', source: 'user', confidence: 'Low', note: 'Real ALP product per user, but "Twin Towers" is too generic to feed bare — context-gated (engine previously excluded it).' },
                { name: 'Enara', location: null, category: 'Condominium', source: 'user', confidence: 'Low', note: 'ALP per user; location/details not verified — FLAGGED.' },
                { name: 'The Residences at Azuela Cove', location: 'Davao City', category: 'Condominium', estate: 'Azuela Cove', source: 'user' },
                { name: 'Laurean Residences', location: 'Davao City', category: 'Condominium', estate: 'Azuela Cove', source: 'user', note: 'Suites to 4BR (per user).' },
                { name: 'Park Villas', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', match: 'context', source: 'user', confidence: 'Low', note: '4BR full-floor residences (per user). "Park Villas" too generic to feed bare — context-gated (engine previously excluded it).' },
                { name: 'Greenbelt Townhouse', location: 'Makati', category: 'Town House', match: 'context', source: 'user', confidence: 'Low', note: 'Generic / location-like ("Greenbelt") — context-gated.' },

                // ── Office ──
                { name: 'One Vertis Plaza', location: 'Vertis North, Quezon City', category: 'Office', projectType: 'office', residential: false, estate: 'Vertis North', source: 'user' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // ALVEO LAND — Ayala Land's upper-mid brand (subsidiary of ALI).
        // DUAL-SOURCE ingest (2026-08-14) — see the Ayala Land Premier header.
        // ═══════════════════════════════════════════════════════════════════
        'Alveo Land': {
            aliases: ['Alveo', 'Alveo Land Corp', 'Alveo Land Corporation'],
            group: 'Ayala Land',
            estates: [
                { name: 'Cerca', location: 'Las Piñas / Muntinlupa', type: 'Mixed-use estate', developer: 'Alveo Land', source: 'user', note: 'Alveo estate; holds Nuveo & Viento.' },
            ],
            projects: [
                // ── Alveo horizontal / residential-lot & house-and-lot ──
                { name: 'Verdana Homes Bacoor', location: 'Bacoor, Cavite', category: 'House and Lot', source: 'user', note: 'Built-out house-and-lot community.' },
                { name: 'Verdana Homes Mamplasan', location: 'Biñan, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Treveia', aliases: ['Treveia Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Venare', aliases: ['Venare Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Lumira', aliases: ['Lumira Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Mirala', aliases: ['Mirala Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Mondia', aliases: ['Mondia Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Sereneo', aliases: ['Sereneo Nuvali'], location: 'Nuvali, Laguna', category: 'Residential Lot', estate: 'Nuvali', source: 'user' },
                { name: 'Aveia', aliases: ['Aveia Broadfield'], location: 'Biñan, Laguna', category: 'Residential Lot', estate: 'Broadfield', source: 'user' },
                { name: 'Venido', aliases: ['Venido Broadfield'], location: 'Biñan, Laguna', category: 'Residential Lot', estate: 'Broadfield', source: 'user' },
                { name: 'Hillside Ridge', aliases: ['Hillside Ridge Southmont'], location: 'Southmont, Silang, Cavite', category: 'House and Lot', estate: 'Southmont', jv: 'Alveo Land + Cathay Land', source: 'authoritative', confidence: 'High', note: 'Alveo × Cathay Land JV within Southmont (50 ha mixed-use: 471 residential + 30 commercial lots + civic). Developer of record = Alveo; Cathay is JV partner. Confirmed on Cathay JV page.' },
                { name: 'Ardia at Vermosa', location: 'Imus / Dasmariñas, Cavite', category: 'Residential Lot', estate: 'Vermosa', source: 'user' },
                { name: 'Caleia', aliases: ['Caleia at Vermosa'], location: 'Imus / Dasmariñas, Cavite', category: 'Residential Lot', estate: 'Vermosa', source: 'user' },
                { name: 'The Residences at Evo City', location: 'Kawit, Cavite', category: 'House and Lot', estate: 'Evo City', source: 'user' },
                { name: 'Verdea', aliases: ['Verdea Southmont'], location: 'Southmont, Silang, Cavite', category: 'Residential Lot', estate: 'Southmont', jv: 'Alveo Land + Cathay Land', source: 'authoritative', confidence: 'High', note: 'Alveo × Cathay Land JV within the Ayala×Cathay Southmont estate (25 ha, 372 lots). Developer of record = Alveo; Cathay is JV partner/landowner. Confirmed on Cathay JV page.' },
                { name: 'South Palmgrove', location: null, category: 'Residential Lot', source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'Bayview Heights', location: null, category: 'Residential Lot', source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'The Greenways at Alviera', location: 'Porac, Pampanga', category: 'Residential Lot', estate: 'Alviera', source: 'user' },
                { name: 'Corvia', aliases: ['Corvia Alviera'], location: 'Porac, Pampanga', category: 'Residential Lot', estate: 'Alviera', source: 'user' },
                { name: 'Versala', aliases: ['Versala Alviera'], location: 'Porac, Pampanga', category: 'Residential Lot', estate: 'Alviera', source: 'user' },
                { name: 'Montala', aliases: ['Montala Alviera'], location: 'Porac, Pampanga', category: 'Residential Lot', estate: 'Alviera', source: 'user' },
                { name: 'Ferndale Villas', location: 'Quezon City', category: 'House and Lot', source: 'user' },
                { name: 'Asyana', location: 'Las Piñas', category: 'Residential Lot', source: 'user', confidence: 'Low', note: 'Location per inference; not independently verified.' },

                // ── Alveo condominiums ──
                { name: 'Two Serendra', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'user', towers: ['Almond', 'Belize', 'Callery', 'Dolce', 'Encino', 'Aston', 'Red Oak', 'Meranti', 'Sequoia'], note: 'Alveo; tower names kept as metadata (place/tree names — never fed).' },
                { name: 'The Columns Ayala Avenue', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'user' },
                { name: 'The Columns Legazpi Village', location: 'Legazpi Village, Makati', category: 'Condominium', source: 'user' },
                { name: 'Celadon Residences', location: 'Sta. Cruz, Manila', category: 'Condominium', source: 'user' },
                { name: 'Celadon Park', location: 'Sta. Cruz, Manila', category: 'Condominium', source: 'user' },
                { name: 'Senta', location: 'Legazpi Village, Makati', category: 'Condominium', source: 'user' },
                { name: 'The Lerato', aliases: ['Lerato'], location: 'Makati', category: 'Condominium', source: 'user' },
                { name: 'Solstice', location: 'Makati', category: 'Condominium', estate: 'Circuit Makati', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'High Park Vertis', aliases: ['High Park'], location: 'Vertis North, Quezon City', category: 'Condominium', estate: 'Vertis North', source: 'user' },
                { name: 'Park Triangle Residences', aliases: ['Park Triangle'], location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'user' },
                { name: 'Ametta Place', location: 'Pasig', category: 'Condominium', source: 'user' },
                { name: 'Verve Residences', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', towers: ['Tower 1', 'Tower 2'], source: 'authoritative', confidence: 'High', note: 'Alveo, High Street South BGC. "Verve One"/"Verve Two" = Towers 1 & 2 (kept matchable).' },
                { name: 'The Sandstone at Portico', location: 'Pasig', category: 'Condominium', parentProjectId: 'Portico', source: 'user' },
                { name: 'The Ametrine at Portico', location: 'Pasig', category: 'Condominium', parentProjectId: 'Portico', source: 'user' },
                { name: 'Portico', location: 'Pasig', category: 'Condominium', projectType: 'parent_development', match: 'context', source: 'user', note: 'Parent development (Kapitolyo, Pasig); bare "Portico" too generic to feed — context-gated. Sandstone/Ametrine are its towers.' },
                { name: 'The Veranda', location: 'Arca South, Taguig', category: 'Condominium', estate: 'Arca South', match: 'context', source: 'user', note: 'Bare "The Veranda" too generic — context-gated.' },
                { name: 'Two Maridien', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'user', note: 'High Street South; pairs with One Maridien.' },
                { name: 'One Maridien', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', source: 'authoritative', confidence: 'High', note: 'Alveo, High Street South BGC. (Matcher-only in your list — web-confirmed Alveo.)' },
                { name: 'Kroma Tower', aliases: ['Kroma'], location: 'Legazpi Village, Makati', category: 'Condominium', source: 'authoritative', confidence: 'High', note: 'Alveo, Dela Rosa Access Rd, Legazpi Village; 40F, completed 2016. Base matcher name "Kroma" aliased here. (Matcher-only in your list — web-confirmed Alveo.)' },
                { name: 'Gentry Residences', location: 'Makati', category: 'Condominium', estate: 'Makati Central Business District', source: 'authoritative', confidence: 'High', note: 'Alveo, Makati CBD. (Matcher-only in your list — web-confirmed Alveo.)' },
                { name: 'Sedona Parc', location: null, category: 'Condominium', source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'Solinea', location: 'Cebu Business Park, Cebu', category: 'Condominium', estate: 'Cebu Business Park', developer: 'Solinea, Inc.', jv: 'Alveo Land / Cebu Holdings', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Master-planned resort-themed community; developer entity Solinea, Inc., project-managed by Alveo Land.' },
                { name: 'Cerule at Solinea', location: 'Cebu Business Park, Cebu', category: 'Condominium', estate: 'Cebu Business Park', developer: 'Solinea, Inc.', jv: 'Alveo Land / Cebu Holdings', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: '5th and final Solinea tower.' },
                { name: 'Marquee Residences', location: 'Angeles, Pampanga', category: 'Condominium', developer: 'Alveo Land', source: 'authoritative', confidence: 'High', note: 'CORRECTED from Avida → Alveo on dual-source reconciliation (2026-08-14): user’s new ALP/Alveo data + web both attribute it to Alveo. Distinct from Marquee Place.' },
                { name: 'Marquee Place', location: 'Angeles, Pampanga', category: 'House and Lot', developer: 'Alveo Land', source: 'authoritative', confidence: 'High', note: 'Alveo master-planned residential community by MarQuee Mall.' },
                { name: 'Abreeza Residences', location: 'Davao City', category: 'Condominium', source: 'user', note: 'Abreeza mixed-use, Davao.' },
                { name: 'Abreeza Place', location: 'Davao City', category: 'Condominium', source: 'user' },
                { name: 'Patio Suites', location: 'Davao City', category: 'Condominium', towers: ['Tower 1', 'Tower 2'], source: 'user', note: 'Abreeza, Davao; "Patio Suites Tower 2" folded in as tower metadata.' },
                { name: 'Kasa Luntian', location: 'Tagaytay', category: 'Condominium', source: 'user', note: 'Leisure/nature-themed.' },
                { name: 'Astela at Circuit Makati', aliases: ['Astela'], location: 'Circuit Makati', category: 'Condominium', estate: 'Circuit Makati', units: ['Studio', '1BR', '2BR', '3BR'], match: 'exact', source: 'user', note: 'Exact-only (fuzzy-off): edit-distance-1 near-twin of Primary Homes’ "Astele" (Mactan).' },
                { name: 'Callisto at Circuit Makati', location: 'Circuit Makati', category: 'Condominium', estate: 'Circuit Makati', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Park East Place', location: 'BGC, Taguig', category: 'Condominium', estate: 'Bonifacio Global City', units: ['1BR', '2BR', '3BR'], source: 'user', note: '1BR Suite variant.' },
                { name: 'The Lattice at Parklinks', location: 'Quezon City / Pasig', category: 'Condominium', estate: 'Parklinks', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Orean Place', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Full name kept so "Korean" can’t fuzzy-hit.' },
                { name: 'Nuveo at Cerca', location: 'Las Piñas / Muntinlupa', category: 'Condominium', estate: 'Cerca', source: 'user' },
                { name: 'Viento at Cerca', location: 'Las Piñas / Muntinlupa', category: 'Condominium', estate: 'Cerca', source: 'user' },
                { name: 'Sentrove at Cloverleaf', location: 'Balintawak, Quezon City', category: 'Condominium', estate: 'Cloverleaf', source: 'user' },
                { name: 'Park Cascades', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'Mergent Residences', location: null, category: 'Condominium', source: 'user', confidence: 'Low', note: 'Location not independently verified — FLAGGED.' },
                { name: 'Parkford Suites Legazpi', aliases: ['Parkford Suites'], location: 'Legazpi Village, Makati', category: 'Condominium', source: 'user' },

                // ── Commercial lots (residential:false) ──
                { name: 'Westborough', aliases: ['Westborough Town Center'], location: 'Silang, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, jv: 'Alveo Land + Cathay Land', source: 'authoritative', confidence: 'High', note: 'Westborough Town Center — Alveo × Cathay Land JV commercial district (15 ha). Confirmed on Cathay’s official /developments/ Joint Ventures section. Developer of record = Alveo; Cathay is JV partner.' },
                { name: 'Westborough Park Square', location: 'Silang, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, jv: 'Alveo Land + Cathay Land', source: 'authoritative', confidence: 'High', note: 'Alveo × Cathay Land JV commercial district (8 ha). Confirmed on Cathay’s official /developments/ Joint Ventures section. Developer of record = Alveo; Cathay is JV partner.' },
                { name: 'Evo City Commercial', aliases: ['Evo Commercial Lot'], location: 'Kawit, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, estate: 'Evo City', source: 'user' },
                { name: 'Centrala', location: null, category: 'Commercial Lot', projectType: 'commercial', residential: false, source: 'user', confidence: 'Low', note: 'Commercial lot; location not verified.' },

                // ── Office (residential:false) ──
                { name: 'BPI Cebu Corporate Centre', location: 'Cebu Business Park, Cebu', category: 'Office', projectType: 'office', residential: false, estate: 'Cebu Business Park', source: 'user' },
                { name: 'High Street South Corporate Plaza', aliases: ['High Street South Block'], location: 'BGC, Taguig', category: 'Office', projectType: 'office', residential: false, estate: 'Bonifacio Global City', source: 'user' },
                { name: 'Stiles Enterprise Plaza', location: 'Circuit Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Circuit Makati', source: 'user' },
                { name: 'Gentry Corporate Plaza', location: 'Makati', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Alveo Financial Tower', location: 'Ayala Avenue, Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Makati Central Business District', source: 'user' },
                { name: 'Tryne Enterprise Plaza', aliases: ['Tryne Enterprise Plaza at Arca South'], location: 'Arca South, Taguig', category: 'Office', projectType: 'office', residential: false, estate: 'Arca South', source: 'user' },
            ],
        },

        // ── Megaworld Corporation (incl. Suntrust, Empire East). ~35–37 townships ──
        'Megaworld': {
            aliases: ['Megaworld Corporation', 'Megaworld Corp'],
            group: 'Megaworld',
            estates: [
                { name: 'Eastwood City', location: 'Quezon City', type: 'Township' },
                { name: 'McKinley Hill', location: 'Taguig', type: 'Township' },
                { name: 'McKinley West', location: 'Taguig', type: 'Township' },
                { name: 'Uptown Bonifacio', aliases: ['Uptown BGC'], location: 'Taguig', type: 'Township' },
                { name: 'Forbes Town', aliases: ['Forbes Town Center'], location: 'BGC, Taguig', type: 'Mixed-use estate' },
                { name: 'Newport City', aliases: ['Resorts World / Newport'], location: 'Pasay', type: 'Township' },
                { name: 'ArcoVia City', location: 'Pasig', type: 'Township' },
                { name: 'Alabang West', location: 'Las Piñas', type: 'Township', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
                { name: 'Iloilo Business Park', location: 'Iloilo City', type: 'Township' },
                { name: 'The Mactan Newtown', location: 'Lapu-Lapu, Cebu', type: 'Township' },
                { name: 'Davao Park District', location: 'Davao City', type: 'Township' },
                { name: 'The Upper East', location: 'Bacolod', type: 'Township' },
                { name: 'Capital Town', location: 'San Fernando, Pampanga', type: 'Township' },
                { name: 'Northwin Global City', location: 'Marilao / Bocaue, Bulacan', type: 'Township' },
                { name: 'Twin Lakes', location: 'Laurel, Batangas', type: 'Leisure estate', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
                { name: 'Southwoods City', location: 'Carmona / Biñan', type: 'Township', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
                { name: 'Maple Grove', location: 'General Trias, Cavite', type: 'Township', developer: 'Megaworld Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Megaworld International + Megaworld township pages explicitly name Megaworld Corporation as developer — NOT GERI (subsidiary relationship not used to infer the entity).' },
                { name: 'Paragua Coastown', location: 'San Vicente, Palawan', type: 'Leisure estate' },
                { name: 'Boracay Newcoast', location: 'Boracay', type: 'Leisure estate', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
                { name: 'Highland City', location: 'Cainta / Pasig', type: 'Township', developer: 'Empire East Land Holdings, Inc.', subsidiaryOf: 'Megaworld', source: 'authoritative', note: 'Development entity = Empire East Land Holdings, Inc. (81.7%-Megaworld-owned subsidiary) — NOT Megaworld directly. PH’s first "elevated city" (~22 ha, Felix Ave). See Empire East → Empire East Highland City.' },
                { name: 'Suntrust Ecotown', location: 'Tanza, Cavite', type: 'Industrial estate', developer: 'Suntrust Properties', subsidiaryOf: 'Megaworld', source: 'authoritative', note: 'Industrial-led mixed-use (200 ha).' },
                { name: 'Arden Botanical Estate', location: 'Tanza / Trece Martires, Cavite', type: 'Township', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
                { name: 'The Hamptons Caliraya', location: 'Laguna', type: 'Leisure estate' },
                { name: 'Ilocandia Coastown', location: 'Laoag, Ilocos Norte', type: 'Leisure estate' },
                { name: 'San Benito Private Estate', location: 'Lipa, Batangas', type: 'Residential estate' },
                { name: 'The Upper Central', location: 'Cagayan de Oro', type: 'Township' },
                { name: 'The Sugartown', location: 'Talisay, Negros Occidental', type: 'Township', note: 'Newer.' },
                // Estates first appearing in the 2026-08 project batch:
                { name: 'Westside City', aliases: ['Entertainment City'], location: 'Parañaque', type: 'Leisure estate' },
                { name: 'Woodside City', location: 'Pasig', type: 'Township' },
                { name: 'Sta. Barbara Heights', location: 'Sta. Barbara, Iloilo', type: 'Residential estate' },
                { name: 'Northill Gateway', location: 'Talisay, Bacolod', type: 'Township' },
                { name: 'Sherwood Hills', location: 'Cavite', type: 'Residential estate', developer: 'Suntrust Properties', subsidiaryOf: 'Megaworld', source: 'authoritative', note: 'Developed by Suntrust Properties (Megaworld subsidiary) — associated with Sherwood Hills Golf; holds Riva Bella. Attribution corrected from parent Megaworld to the actual subsidiary.' },
                { name: 'Nascala Coast', location: 'Nasugbu, Batangas', type: 'Leisure estate', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'authoritative' },
            ],
            projects: [
                // ── Eastwood City ──
                { name: 'Eastwood Le Grand', aliases: ['Eastwood Le Grand 1', 'Eastwood Le Grand 2', 'Eastwood Le Grand 3'], location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Eastwood City' },
                { name: 'One Eastwood Avenue', location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Eastwood City' },
                { name: 'Eastwood Park Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Eastwood City' },
                { name: 'Eastwood Parkview', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Eastwood City' },
                { name: 'Grand Eastwood Palazzo', location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Eastwood City' },
                { name: 'One Central Park', location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Eastwood City', match: 'context', note: 'Generic ("central park") — context-gated.' },

                // ── Forbes Town ──
                { name: 'Bellagio', aliases: ['Bellagio 1', 'Bellagio 2', 'Bellagio 3'], location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Forbes Town' },
                { name: 'Forbeswood Heights', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Forbes Town' },
                { name: '8 Forbestown Road', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Forbes Town' },

                // ── McKinley Hill ──
                { name: 'McKinley Hill Village', location: 'Taguig', category: 'House and Lot', estate: 'McKinley Hill' },
                { name: 'Venice Luxury Residences', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'McKinley Hill', projectType: 'parent_development', source: 'user' },
                { name: 'Fiorenzo Tower', location: 'Taguig', category: 'Condominium', estate: 'McKinley Hill', projectType: 'tower', parentProjectId: 'Venice Luxury Residences', source: 'user' },
                { name: 'Emanuele Tower', location: 'Taguig', category: 'Condominium', estate: 'McKinley Hill', projectType: 'tower', parentProjectId: 'Venice Luxury Residences', source: 'user' },
                { name: 'The Florence', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'McKinley Hill' },
                { name: 'St. Mark Residences', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'McKinley Hill' },

                // ── McKinley West ──
                { name: 'Park McKinley West', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'McKinley West', note: 'Penthouse variants.' },
                { name: 'One Westpark Residences', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'McKinley West' },

                // ── Uptown Bonifacio ──
                { name: 'Uptown Modern', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Uptown Bonifacio', note: 'Loft variants.' },
                { name: 'Uptown Arts Residence', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Uptown Bonifacio' },
                { name: 'Uptown Ritz', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Uptown Bonifacio' },
                { name: 'One Uptown Residence', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Uptown Bonifacio' },

                // ── Newport City ──
                { name: 'Palm Tree Villas', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Newport City' },

                // ── Westside City / Entertainment City ──
                { name: 'Sunny Coast Residential Resort', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Westside City' },
                { name: 'Bayshore Residential Resort', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Westside City' },
                { name: 'Gentry Manor', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Westside City' },

                // ── ArcoVia City ──
                { name: 'Arcovia Palazzo', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'ArcoVia City' },

                // ── Maple Grove ──
                { name: 'Maple Grove Park Village', location: 'General Trias, Cavite', category: 'Residential Lot', estate: 'Maple Grove', developer: 'Megaworld Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Megaworld ₱6.5B luxury village (377 lots); verified individually, not inherited.' },
                { name: 'Maple Park Residences', location: 'General Trias, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Maple Grove', developer: 'Megaworld Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: '14-storey Megaworld condo inside Maple Grove; verified individually.' },
                { name: 'La Cassia Residences', location: 'General Trias, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Maple Grove', developer: 'Megaworld Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Megaworld International page states "Developer: Megaworld Corporation".' },

                // ── Arden Botanical Estate ──
                { name: 'Arden Botanical Village', location: 'Tanza / Trece Martires, Cavite', category: 'Residential Lot', estate: 'Arden Botanical Estate', projectType: 'village', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'inferred' },
                { name: 'Arden Westpark Village', location: 'Tanza / Trece Martires, Cavite', category: 'Residential Lot', estate: 'Arden Botanical Estate', projectType: 'village', developer: 'Global-Estate Resorts (GERI)', subsidiaryOf: 'Megaworld', source: 'inferred', note: 'Separate village from Arden Botanical Village within the same estate.' },

                // ── Capital Town ──
                { name: 'Montrose Parkview', location: 'San Fernando, Pampanga', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Capital Town' },
                { name: 'Saint-Marcel Residences', location: 'San Fernando, Pampanga', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Capital Town' },
                { name: 'Chelsea Parkplace', location: 'San Fernando, Pampanga', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Capital Town' },
                { name: 'Bryant Parklane', location: 'San Fernando, Pampanga', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Capital Town' },

                // ── Northwin Global City ──
                { name: '9 Central Park', location: 'Marilao / Bocaue, Bulacan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Northwin Global City', match: 'context', note: 'Generic ("central park") — context-gated.' },

                // ── Iloilo Business Park ──
                { name: 'One Madison Place', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Iloilo Business Park' },
                { name: 'Lafayette Park Square', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Iloilo Business Park' },
                { name: 'The Palladium', location: 'Iloilo City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Iloilo Business Park' },
                { name: 'Saint Dominique', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Iloilo Business Park' },
                { name: 'Saint Honore', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Iloilo Business Park' },
                { name: 'Firenze Residences', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Iloilo Business Park' },
                { name: 'The Pinnacle', location: 'Iloilo City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Iloilo Business Park', match: 'context', source: 'user' },

                // ── The Upper East ──
                { name: 'Kensington Sky Garden', location: 'Bacolod', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'The Upper East' },
                { name: 'Herald Parksuites', location: 'Bacolod', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'The Upper East' },

                // ── Northill Gateway ──
                { name: 'Forbes Hill', location: 'Talisay, Bacolod', category: 'Residential Lot', estate: 'Northill Gateway' },

                // ── The Mactan Newtown ──
                { name: 'One Pacific Residences', location: 'Lapu-Lapu, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'The Mactan Newtown' },

                // ── Paragua Coastown ──
                { name: 'Paragua Beach Village', location: 'San Vicente, Palawan', category: 'Residential Lot', estate: 'Paragua Coastown' },
                { name: 'Oceanfront Premier Residences', location: 'San Vicente, Palawan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Paragua Coastown' },
                { name: 'The Bellagio Palawan', location: 'San Vicente, Palawan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Paragua Coastown', note: 'Distinct from Forbes Town Bellagio.' },

                // ── Standalone / early Makati & other (no township) ──
                { name: 'Greenbelt Chancellor', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Greenbelt Excelsior', location: 'Legazpi Village, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], jv: 'Palanca / CP Group (land)', source: 'authoritative' },
                { name: 'Greenbelt Hamilton', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Greenbelt Madison', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Greenbelt Parkplace', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Greenbelt Radisson', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Salcedo Skysuites', location: 'Salcedo, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'San Antonio Residence', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Manhattan Gardens', aliases: ['Manhattan Garden City'], location: 'Araneta City, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Manhattan Plaza', location: 'Araneta City, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Laurent Park', location: 'Araneta City, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vion Tower', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Vion West', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Separate Megaworld project from Vion Tower; shared location context.' },
                { name: 'One Crown Suites', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Cityplace', aliases: ['Cityplace Square'], location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Petron Megaplaza', location: 'Makati', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Lafayette Square', location: 'Salcedo, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'One Central', location: 'Salcedo Village, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], match: 'context', source: 'authoritative', note: 'Twin towers; also 5BR loft.' },
                { name: 'Three Central', location: 'Salcedo, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], match: 'context', source: 'user' },
                { name: 'The World Centre', location: 'Makati', category: 'Office', projectType: 'office', residential: false, source: 'authoritative', note: 'Office building (1998), Sen. Gil Puyat Ave. Matched, but filtered out of the Residential category.' },
            ],
        },

        // ── Robinsons Land Corporation ──
        'Robinsons Land': {
            aliases: ['Robinsons Land Corporation', 'RLC'],
            group: 'Robinsons',
            estates: [
                { name: 'Bridgetowne', aliases: ['Bridgetowne Destination Estate'], location: 'Quezon City / Pasig', type: 'Township' },
                { name: 'Sierra Valley', location: 'Cainta / Taytay, Rizal', type: 'Township' },
                { name: 'Montclair', location: 'Porac / Angeles, Pampanga', type: 'Township' },
            ],
            projects: [
                // ── RLC Residences — vertical (condominium) ──
                { name: 'Amisa Private Residences', location: 'Lapu-Lapu, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], towers: ['Tower A', 'Tower B', 'Tower C', 'Tower D'] },
                { name: 'Galleria Residences', aliases: ['Galleria Residences Cebu', 'Galleria Regency'], location: 'Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Signa Designer Residences', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], towers: ['Tower 1', 'Tower 2'] },
                { name: 'The Trion Towers', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Tower 1', 'Tower 2', 'Tower 3'] },
                { name: 'The Radiance Manila Bay', location: 'Manila Bay, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'The Magnolia Residences', location: 'New Manila, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Axis Residences', location: 'Pioneer, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Sonata Private Residences', aliases: ['The Residences at The Westin Manila', 'Sonata Place'], location: 'Ortigas, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Le Pont Residences', location: 'Bridgetowne, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR', '4BR'], estate: 'Bridgetowne', towers: ['Tower 1', 'Tower 2'], note: 'Penthouse units.' },
                { name: 'Mira Towers', aliases: ['MIRA'], location: 'Cubao, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], towers: ['Tower 1', 'Tower 2'] },
                { name: 'Sierra Valley Gardens', location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Sierra Valley', note: 'Multiple buildings/phases (incl. Building 5).' },
                { name: 'Woodsville Residences', aliases: ['Woodsville Crest'], location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'SYNC Residences', location: 'C-5, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], note: 'Also referenced as S-Tower.' },
                { name: 'The Sapphire Bloc', location: 'Ortigas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Mantawi Residences', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Cirrus', location: 'Bridgetowne, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Bridgetowne', match: 'context', note: 'Single-word generic-sounding name — context-gated.' },
                { name: 'Velaris Residences', aliases: ['The Velaris Residences'], location: 'Bridgetowne, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Bridgetowne', developer: 'RHK Land Corporation', jv: 'Robinsons Land Corporation + Hongkong Land', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'RHK Land Corp is the development entity (RLC–Hongkong Land JV); Velaris is its pilot project.' },
                { name: 'Adriatico Place', aliases: ['One Adriatico Place', 'Two Adriatico Place', 'Three Adriatico Place'], location: 'Malate, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Otis 888 Residences', location: 'Paco, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'McKinley Park Residences', location: 'BGC / McKinley, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', confidence: 'Medium', note: 'Developer per user (RLC), from secondary refs only — NOT upgraded to authoritative. Developer question is separate from the "McKinley" estate name.' },
                { name: 'Gateway Garden Heights', aliases: ['Gateway Garden Ridge', 'Gateway Regency Studios'], location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Escalades', aliases: ['Acacia Escalades', 'Aurora Escalades'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], towers: ['East Tower', 'South Metro', 'North Tower'], note: 'Series; generic sub-tower labels kept as towers, not matched.' },
                { name: 'The Pearl Place', location: 'Ortigas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Azalea Place', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vimana Verde Residences', location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Fifth Avenue Place', aliases: ['The Fort Residences'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'East of Galleria', location: 'Ortigas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Chimes Greenhills', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },

                // ── Robinsons Homes — horizontal (house & lot / lots / townhouse) ──
                { name: 'Robinsons Homes East', location: 'Antipolo, Rizal', category: 'House and Lot' },
                { name: 'Centennial Place', location: 'Quezon City', category: 'House and Lot' },
                { name: 'Brighton Baliwag', location: 'Baliwag, Bulacan', category: 'House and Lot' },
                { name: 'Brighton Puerto Princesa', location: 'Puerto Princesa, Palawan', category: 'House and Lot' },
                { name: 'Springdale Baliwag', location: 'Baliwag, Bulacan', category: 'House and Lot' },
                { name: 'Springdale at Pueblo Angono', aliases: ['Springdale 2'], location: 'Angono, Rizal', category: 'House and Lot' },
                { name: 'Forbes Estates Lipa', location: 'Lipa, Batangas', category: 'Residential Lot' },
                { name: 'Woodsville Viverde Mansions', location: 'Parañaque', category: 'House and Lot' },

                // ── Office / commercial (residential:false — matched, category-filtered) ──
                { name: 'Cybergate Center', aliases: ['Cybergate Center 2', 'Cybergate Center 3'], location: 'Mandaluyong', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cybergate Cebu', location: 'Cebu', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cybergate Bacolod', location: 'Bacolod', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cybergate Iloilo', location: 'Iloilo', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cybergate Dumaguete', location: 'Dumaguete', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cybergate Davao', location: 'Davao', category: 'Office', projectType: 'office', residential: false },
                { name: 'Cyberscape Alpha', aliases: ['Cyberscape Beta', 'Cyberscape Gamma'], location: 'Ortigas, Pasig', category: 'Office', projectType: 'office', residential: false },
                { name: 'GBF Center', location: 'Bridgetowne, Pasig', category: 'Office', projectType: 'office', residential: false, estate: 'Bridgetowne' },
                { name: 'Robinsons Summit Center', location: 'Makati', category: 'Office', projectType: 'office', residential: false },
                { name: 'Robinsons Equitable Tower', location: 'Ortigas', category: 'Office', projectType: 'office', residential: false },
                { name: 'Tera Tower', location: 'Bridgetowne, Pasig', category: 'Office', projectType: 'office', residential: false, estate: 'Bridgetowne' },
                { name: 'Giga Tower', location: 'Bridgetowne, Pasig', category: 'Office', projectType: 'office', residential: false, estate: 'Bridgetowne' },
                { name: 'Exxa-Zeta Towers', location: 'Bridgetowne, Pasig', category: 'Office', projectType: 'office', residential: false, estate: 'Bridgetowne' },
                { name: 'Robinsons Cyber Sigma', location: 'BGC, Taguig', category: 'Office', projectType: 'office', residential: false },
            ],
        },

        // ── DMCI Homes (primarily vertical residential; no large township model) ──
        'DMCI Homes': {
            aliases: ['DMCI', 'DMCI Project Developers'],
            group: 'DMCI',
            estates: [
                { name: 'Acacia Estates', aliases: ['Acacia Estates Township'], location: 'Taguig', type: 'Township', developer: 'DMCI Homes', source: 'user' },
            ],
            projects: [
                // ── Acacia Estates Township (Taguig) ──
                { name: 'Royal Palm Residences', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'The Birchwood', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'Verawood Residences', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'Cedar Crest', location: 'Taguig', category: 'Condominium', units: ['2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'Rosewood Pointe', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'Mahogany Place', id: 'mahogany-place-taguig', aliases: ['Mahogany Place III'], location: 'Taguig', category: 'House and Lot', estate: 'Acacia Estates', match: 'context', developer: 'DMCI Homes', source: 'user', note: 'HOMONYM with Maria Luisa’s Mahogany Place (Cebu) — resolved by location; bare "Mahogany Place" → null.' },
                { name: 'Spring Lane Homes', location: 'Taguig', category: 'House and Lot', estate: 'Acacia Estates' },
                { name: 'Ivory Wood', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Acacia Estates' },
                { name: 'Maple Place', location: 'Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Acacia Estates', match: 'context', note: 'Generic-sounding ("maple place") — context-gated.' },
                { name: 'Alder Residences', location: 'Taguig', category: 'Condominium', units: ['2BR', '3BR', '4BR'], estate: 'Acacia Estates' },

                // ── High-rise condominiums ──
                { name: 'Brio Tower', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Sheridan Towers', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Viera Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Flair Towers', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Lumiere Residences', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Amaryllis', location: 'New Manila, Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Zinnia Towers', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Illumina Residences Manila', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'One Castilla Place', aliases: ['One Castillo Places'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Sorrel Residences', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Tivoli Garden Residences', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'La Verti Residences', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Rhapsody Residences', location: 'Muntinlupa', category: 'Condominium', units: ['2BR', '3BR'] },
                { name: 'Stellar Place', aliases: ['Steller Place'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Torre de Manila', location: 'Ermita, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Cypress Towers', aliases: ['Cypress Tower'], location: 'Taguig', category: 'Condominium', units: ['Studio', '2BR', '3BR'] },
                { name: 'Infina Towers', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Orabella', location: 'Metro Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Kai Garden Residences', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Cameron Residences', location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'The Crestmont', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Fairlane Residences', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Celandine', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Aston Residences', aliases: ['The Aston Place'], location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Prisma Residences', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Brixton Place', location: 'Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Fairway Terraces', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Valeron Tower', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'One Delta Terraces', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Oriana', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Erin Heights', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Sage Residences', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Calinea Tower', location: 'Caloocan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Anissa Heights', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Satori Residences', location: 'Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'Kalea Heights', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },

                // ── Mid-rise condominiums ──
                { name: 'Asteria Residences', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['2BR', '3BR'] },
                { name: 'Levina Place', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Mirea Residences', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Arista Place', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['2BR'] },
                { name: 'Maricielo Villas', location: 'Las Piñas', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Outlook Ridge Residences', location: 'Baguio', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Siena Park Residences', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Accolade Place', location: 'Quezon City', category: 'Condominium', subtype: 'Mid-rise', units: ['2BR', '3BR'] },
                { name: 'East Ortigas Mansions', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR', '4BR'] },
                { name: 'Magnolia Place', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Palm Grove Residences', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Riverfront Residences', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'The Redwoods', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Bonifacio Heights Condominiums', location: 'Taguig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '2BR', '3BR'] },
                { name: 'East Raya Gardens', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Mayfield Park Residences', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Rainbow Ridge Condominiums', location: 'Taguig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vista de Lago', location: 'Taguig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Lakeview Manors', aliases: ['Lake View Manors'], location: 'Taguig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Ohana Place', location: 'Las Piñas', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Raya Garden Condominiums', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '2BR', '3BR'] },
                { name: 'The Manors at Celebrity Place', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Bristle Ridge Residences', aliases: ['Bristle Ridge'], location: 'Baguio', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Calathea Place', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR'] },
                { name: 'Alea Residences', location: 'Bacoor, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['2BR', '3BR'] },
                { name: 'Mulberry Place', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Verdon Parc', location: 'Davao', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR', '3BR'] },
                { name: 'Sonora Garden Residences', aliases: ['Sonora Garden'], location: 'Alabang-Zapote Road, Las Piñas', category: 'Condominium', subtype: 'High-rise', units: ['1BR', '2BR', '3BR'], developer: 'RLC DMCI Property Ventures Inc.', jv: 'Robinsons Land Corporation + DMCI Homes', subsidiaryOf: null, source: 'authoritative', confidence: 'High', towers: ['Stellan', 'Cadence', 'Liran'], note: 'RLC–DMCI JV; dedicated JV entity is RLC DMCI Property Ventures Inc. (1.45 ha, launched 2019).' },
                { name: 'Allegra Garden Place', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },

                // ── Subdivisions / horizontal ──
                { name: 'Willow Park Homes', location: 'Cabuyao, Laguna', category: 'House and Lot' },
                { name: 'Villa Alegre Homes', aliases: ['Villa Alegre'], location: 'Carmona, Cavite', category: 'House and Lot' },
                { name: 'Woodland Hills', location: 'Carmona, Cavite', category: 'House and Lot' },
                { name: 'St. James Homes', location: 'Bicol', category: 'House and Lot', note: 'Split from "St. James Homes / St. Jude Orchard" — a distinct project from St. Jude Orchard.' },
                { name: 'St. Jude Orchard', location: 'Bicol', category: 'Residential Lot', note: 'Distinct project from St. James Homes.' },
                { name: 'Tamarind Ridge', location: 'Central Luzon', category: 'Residential Lot' },

                // ── Leisure / condotel / premium (Exclusive & Leisure Residences) ──
                { name: 'Alta Vista de Boracay', location: 'Malay, Aklan', category: 'Condominium', projectType: 'residential', units: ['Studio'], note: 'Condotel / leisure; loft units.' },
                { name: 'Solmera Coast', location: 'San Juan, Batangas', category: 'Condominium', units: ['Studio', '1BR', '2BR'], note: 'Condotel / residential mix.' },
                { name: 'Moncello Crest', location: 'Tuba, Benguet', category: 'Condominium', units: ['Studio', '1BR', '2BR'], note: 'Condotel / residential mix.' },
                { name: 'Oak Harbor Residences', location: 'Bay City, Parañaque', category: 'Condominium', units: ['1BR', '2BR', '3BR'], note: 'Exclusive line; penthouse units.' },
                { name: 'Fortis Residences', location: 'Chino Roces, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], note: 'Exclusive line; penthouse units.' },
            ],
            note: 'Mostly individual condominium communities; Acacia Estates (Taguig) is its flagship township.',
        },

        // ── SM Prime Holdings / SMDC (condo-led; MOA Complex flagship) ──
        'SM Prime': {
            aliases: ['SM Prime Holdings', 'SMDC', 'SM Development Corporation'],
            group: 'SM',
            estates: [
                { name: 'SM Mall of Asia Complex', aliases: ['MOA Complex', 'Mall of Asia Complex'], location: 'Pasay', type: 'Mixed-use estate' },
            ],
            projects: [
                // ── Early / foundational ──
                { name: 'Chateau Elysee', aliases: ['Chateau Residences'], location: 'Parañaque', category: 'Condominium', units: ['1BR', '2BR'] },
                { name: 'Mezza Residences', aliases: ['Mezza 2 Residences'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Light Residences', aliases: ['Light 2 Residences'], location: 'EDSA, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Berkeley Residences', location: 'Katipunan, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Grass Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Blue Residences', location: 'Katipunan, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Wind Residences', aliases: ['Cool Suites at Wind Residences'], location: 'Tagaytay', category: 'Condominium', units: ['Studio', '1BR'], note: 'Cool Suites offers suite units.' },

                // ── Mall of Asia / Pasay / Manila Bay ──
                { name: 'Sea Residences', location: 'MOA, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'Shore Residences', aliases: ['Shore 2 Residences', 'Shore 3 Residences'], location: 'MOA, Pasay', category: 'Condominium', units: ['1BR', '2BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'Shell Residences', location: 'MOA, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'Breeze Residences', location: 'Roxas Blvd, Pasay', category: 'Condominium', units: ['Studio', '1BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'Coast Residences', location: 'Roxas Blvd, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'Sail Residences', location: 'MOA, Pasay', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'SM Mall of Asia Complex' },
                { name: 'S Residences', location: 'MOA, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'SM Mall of Asia Complex', match: 'context', source: 'authoritative', note: 'SMDC Premier inaugural dev, 3 towers, Central Business Park 1-A.' },
                { name: 'Ice Tower', location: 'MOA, Pasay', category: 'Office', estate: 'SM Mall of Asia Complex', note: 'Residential-office; studio-style RO units.' },
                { name: 'Sands Residences', location: 'Roxas Blvd, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'SM Mall of Asia Complex' },

                // ── Makati / CBD ──
                { name: 'Air Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Jazz Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Red Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Jade Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Mint Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Lush Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },

                // ── Other Metro Manila high/mid-rise ──
                { name: 'Fame Residences', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Glam Residences', location: 'EDSA / Triangle Park, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Gem Residences', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Hill Residences', location: 'Novaliches, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vine Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Trees Residences', location: 'Fairview, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Green Residences', aliases: ['Green 2 Residences'], location: 'Taft, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', note: 'Taft Ave near DLSU (corrected from Fairview/QC grouping).' },
                { name: 'M Place South Triangle', aliases: ['My Place at South Triangle'], location: 'South Triangle, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'My Place at Ortigas', location: 'Ortigas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Princeton Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Lindenwood Residences', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'unverified', note: 'Location not established from an authoritative source.' },
                { name: 'Grace Residences', location: 'Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Park Residences', location: 'Sta. Rosa, Laguna', category: 'Condominium', units: ['Studio'], match: 'context', source: 'authoritative', note: 'SMDC Nature series, Brgy. Tagpo; Flexi Suite + Studio, 6 towers.' },

                // ── South Metro (Parañaque / Las Piñas / Muntinlupa) ──
                { name: 'Field Residences', location: 'Sucat, Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Bloom Residences', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Gold Residences', location: 'NAIA T1, Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'], projectType: 'residential', source: 'user' },
                { name: 'Gold Towers Residential-Offices', aliases: ['Gold Towers'], location: 'NAIA T1, Parañaque', category: 'Office', projectType: 'residential_office', residential: true, source: 'user', note: 'Separate residential-office dev in the Gold City area; NOT the Gold Residences condo. "Gold Towers office" must resolve here, not to Gold Residences.' },
                { name: 'Spring Residences', location: 'Bicutan, Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'South Residences', aliases: ['South 2 Residences'], location: 'Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Twin Residences', location: 'Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Leaf Residences', location: 'Susana Heights, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },

                // ── Provincial / growth corridor ──
                { name: 'Calm Residences', location: 'Sta. Rosa, Laguna', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Turf Residences', location: 'Biñan, Laguna', category: 'Condominium', units: ['Studio', '1BR'] },
                { name: 'Charm Residences', location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Hope Residences', location: 'Trece Martires, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Zeal Residences', location: 'General Trias, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Joy Residences', location: 'Baliwag, Bulacan', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Cheer Residences', location: 'Marilao, Bulacan', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Glade Residences', location: 'Iloilo', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Style Residences', location: 'Iloilo', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Smile Residences', location: 'Bacolod', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Lane Residences', location: 'Lanang, Davao', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vail Residences', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Sun Residences', location: 'España, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', note: 'España Blvd, Manila (corrected from Cebu).' },

                // ── Symphony Homes (house and lot) ──
                { name: 'Cheerful Homes', aliases: ['Cheerful Homes 2'], location: 'Mabalacat, Pampanga', category: 'House and Lot' },
                { name: 'Parkville by SMDC', location: 'Granada, Bacolod', category: 'Residential Lot', note: 'Large-lot residential estate; house-and-lot options.' },
            ],
            note: 'SMDC is condo-led; it does not run the large multi-component township model of Ayala/Megaworld.',
        },

        // ── Vista Land & Lifescapes (Camella, Brittany, Crown Asia, Vista Residences) ──
        'Vista Land': {
            aliases: ['Vista Land & Lifescapes', 'Camella', 'Brittany', 'Crown Asia', 'Vista Residences', 'Lumina', 'Lessandra'],
            group: 'Vista Land',
            estates: [
                { name: 'Villar City', aliases: ['Vista Alabang'], location: 'Las Piñas / Bacoor', type: 'Township', note: 'Large master-planned area.' },
                { name: 'Crosswinds', aliases: ['Crosswinds Tagaytay'], location: 'Tagaytay', type: 'Leisure estate', developer: 'Brittany' },
                { name: 'Portofino', location: 'Daang Hari, Alabang', type: 'Residential estate', developer: 'Brittany' },
            ],
            projects: [],
            note: 'Camella = hundreds of house-and-lot communities across 47+ provinces (largest-volume developer); individual communities ingested per batch.',
        },

        // ── Rockwell Land (Rockwell Center flagship; more vertical than township) ──
        'Rockwell Land': {
            aliases: ['Rockwell', 'Rockwell Land Corporation'],
            group: 'Rockwell',
            estates: [
                { name: 'Rockwell Center', location: 'Makati', type: 'Mixed-use estate' },
                { name: 'Rockwell Center Bacolod', location: 'Bacolod', type: 'Mixed-use estate', source: 'user' },
                { name: 'Rockwell Center Lipa', location: 'Lipa, Batangas', type: 'Mixed-use estate', source: 'user' },
            ],
            projects: [
                // ── Rockwell Center (Makati) — West Block cluster ──
                { name: 'West Block Residential Towers', location: 'Makati', category: 'Condominium', estate: 'Rockwell Center', projectType: 'parent_development', note: 'Completed ~1999–2000; parent of Luna Gardens / Rizal Tower / Hidalgo Place / Amorsolo Square.' },
                { name: 'Luna Gardens', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', projectType: 'tower', parentProjectId: 'West Block Residential Towers' },
                { name: 'Rizal Tower', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', projectType: 'tower', parentProjectId: 'West Block Residential Towers' },
                { name: 'Hidalgo Place', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', projectType: 'tower', parentProjectId: 'West Block Residential Towers' },
                { name: 'Amorsolo Square', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', projectType: 'tower', parentProjectId: 'West Block Residential Towers' },

                // ── Rockwell Center (Makati) — other residential ──
                { name: 'The Manansala', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', note: 'Penthouse units.' },
                { name: 'Joya Lofts and Towers', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Rockwell Center', note: 'Loft units.' },
                { name: 'One Rockwell', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', towers: ['East Tower', 'West Tower'], note: 'Penthouse units.' },
                { name: 'Edades Tower and Garden Villas', aliases: ['Edades Suites', 'Edades Tower'], location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', note: 'Penthouse units.' },
                { name: 'Edades West', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center' },
                { name: 'The Balmori Suites', location: 'Makati', category: 'Condominium', units: ['2BR', '3BR'], estate: 'Rockwell Center', note: 'Penthouse units.' },
                { name: 'Proscenium at Rockwell', aliases: ['Proscenium'], location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Rockwell Center', towers: ['Kirov', 'Sakura', 'Lincoln', 'Lorraine'], note: 'Penthouse units; tower names kept as metadata, not matched.' },
                { name: '8 Rockwell', location: 'Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Rockwell Center' },
                { name: '1 Proscenium', location: 'Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Rockwell Center' },

                // ── Other Metro Manila residential ──
                { name: 'The Grove by Rockwell', location: 'Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: '205 Santolan', location: 'San Juan', category: 'Condominium', units: ['1BR', '2BR', '3BR'] },
                { name: 'The Alvendia', location: 'San Juan', category: 'Town House', units: ['2BR', '3BR'] },
                { name: '53 Benitez', location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Rockwell Primaries', subsidiaryOf: 'Rockwell Land', source: 'user' },
                { name: '8 Benitez Suites', location: 'Quezon City', category: 'Condominium', units: ['2BR', '3BR'] },
                { name: 'The Vantage at Kapitolyo', location: 'Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Rockwell Primaries', subsidiaryOf: 'Rockwell Land', source: 'user' },
                { name: 'East Bay Residences', location: 'Muntinlupa', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Rockwell Primaries', subsidiaryOf: 'Rockwell Land', source: 'user', towers: ['Fordham', 'Larsen'], note: 'Penthouse units.' },
                { name: 'The Arton by Rockwell', aliases: ['The Arton'], location: 'Quezon City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], towers: ['North Tower', 'West Tower', 'East Tower'], note: 'Penthouse units.' },
                { name: 'Stonewell', aliases: ['Mahogany Homes'], location: 'Sto. Tomas, Batangas', category: 'House and Lot', developer: 'Stonewell Development Corporation', subsidiaryOf: 'Rockwell Land', source: 'authoritative', confidence: 'High', note: 'Socialized/economic housing (row houses + loft-ready duplex). Stonewell Development Corp = wholly-owned Rockwell Land subsidiary (inc. 2012). Phase 2 = Mahogany Homes. Not under an existing Rockwell estate.' },

                // ── Horizontal / lot ──
                { name: 'Rockwell South at Carmelray', location: 'Calamba, Laguna', category: 'Residential Lot' },
                { name: 'Terreno South', location: 'Lipa, Batangas', category: 'Residential Lot' },
                { name: 'Nara Residences', location: 'Bacolod', category: 'Residential Lot', estate: 'Rockwell Center Bacolod' },
                { name: 'Bel-Air at Rockwell Center Bacolod', location: 'Bacolod', category: 'Residential Lot', estate: 'Rockwell Center Bacolod', note: 'Distinct from Ayala Land Premier’s Bel-Air Village.' },
                { name: 'The Samanean at Paradise Farms', location: 'San Jose del Monte, Bulacan', category: 'Residential Lot' },
                { name: 'Molinillo at Rockwell Center Lipa', location: 'Lipa, Batangas', category: 'Residential Lot', estate: 'Rockwell Center Lipa' },
                { name: 'Lauan Ridges by Rockwell', location: 'Mataasnakahoy, Batangas', category: 'Residential Lot' },
                { name: 'Cabo San Diego', location: 'Lian, Batangas', category: 'Residential Lot', note: 'Large coastal/leisure estate; lot + leisure components.' },

                // ── Regional / mixed-use residential ──
                { name: '32 Sanson by Rockwell', location: 'Lahug, Cebu City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], note: 'Penthouse units.' },
                { name: 'Aruga Resort and Residences Mactan', location: 'Mactan, Cebu', category: 'Condominium', units: ['1BR', '2BR', '3BR'], note: 'Resort/leisure residences; penthouse units.' },
                { name: 'Rockwell at Nepo Center', location: 'Angeles, Pampanga', category: 'Condominium', units: ['1BR', '2BR', '3BR'], towers: ['The Manansala at Rockwell Nepo', 'The BenCab', 'The Aurelio'], note: 'Building names kept as metadata; "The Manansala at Rockwell Nepo" is distinct from Makati’s The Manansala.' },
                { name: 'Rockwell at IPI Center', aliases: ['Lincoln at IPI Center'], location: 'Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Mixed-use; includes office + retail components.' },

                // ── Office / commercial (residential:false — matched, category-filtered) ──
                { name: 'Rockwell Business Center Ortigas', location: 'Pasig', category: 'Office', projectType: 'office', residential: false },
                { name: 'Rockwell Business Center Sheridan', location: 'Mandaluyong', category: 'Office', projectType: 'office', residential: false },
                { name: '1 Rockwell at IPI Center', location: 'Cebu', category: 'Office', projectType: 'office', residential: false },
                { name: 'Santolan Town Plaza', location: 'San Juan', category: 'Office', projectType: 'office', residential: false, note: 'Office + retail.' },
            ],
            landmarks: [
                { name: 'Power Plant Mall', developer: 'Rockwell Land Corporation', estate: 'Rockwell Center', location: 'Makati', matchable: false, source: 'authoritative', note: 'Retail/leisure component of Rockwell Center — location context only, never a project match (so "condo near Power Plant Mall" does not resolve to the mall).' },
            ],
        },

        // ── Federal Land (less township emphasis) ──
        'Federal Land': {
            aliases: ['Federal Land Inc', 'Horizon Land'],
            group: 'Federal Land',
            estates: [
                { name: 'Riverpark', location: 'General Trias, Cavite', type: 'Township', note: 'Federal Land–Nomura JV area.' },
                { name: 'Grand Central Park', location: 'BGC, Taguig', type: 'Township', source: 'user', note: 'New York-inspired ~10.8 ha township.' },
                { name: 'Metropolitan Park', aliases: ['Met Park'], location: 'Pasay', type: 'Mixed-use estate', source: 'user', note: '~36 ha Bay Area master-planned community.' },
            ],
            projects: [
                // ── Grand Central Park (BGC) ──
                { name: 'Grand Hyatt Manila Residences', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Grand Central Park', note: 'Penthouse units.' },
                { name: 'The Seasons Residences', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Grand Central Park', towers: ['Haru Tower', 'Natsu Tower', 'Aki Tower', 'Fuyu Tower'] },
                { name: 'Park Avenue', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Grand Central Park', match: 'context', note: 'Generic NY-themed name — context-gated.' },
                { name: 'Times Square West', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Grand Central Park', match: 'context', note: 'Generic NY-themed name — context-gated.' },
                { name: 'Madison Park West', aliases: ['Madison Park'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Grand Central Park', match: 'context', note: 'Generic NY-themed name — context-gated.' },
                { name: 'Central Park West', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Grand Central Park', match: 'context', note: 'Generic NY-themed name — context-gated.' },

                // ── Metropolitan Park (Pasay) ──
                { name: 'Bay Garden Club and Residences', location: 'Pasay', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Metropolitan Park', towers: ['Banyan', 'Mandarin'] },
                { name: 'Six Senses Residences', location: 'Pasay', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Metropolitan Park' },
                { name: 'Palm Beach West', aliases: ['Palm Beach Villas'], location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Metropolitan Park', match: 'context', note: 'Generic place-name — context-gated.' },
                { name: 'Mi Casa Residences', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Metropolitan Park' },
                { name: 'iMet', location: 'Pasay', category: 'Office', projectType: 'office', residential: false, estate: 'Metropolitan Park', note: 'BPO/office within Met Park.' },

                // ── Other Metro Manila condominiums ──
                { name: 'The Grand Midori Makati', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Japanese-inspired (Tange Associates).' },
                { name: 'The Grand Midori Ortigas', location: 'Ortigas, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Distinct from The Grand Midori Makati.' },
                { name: 'The Capital Towers', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Athens', 'Beijing', 'Rio'] },
                { name: 'One Wilson Square', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Paseo de Roces', location: 'Chino Roces, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'One Lilac Place', location: 'Chino Roces, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], note: 'Grouped with Paseo de Roces by source; kept separate.' },
                { name: 'Four Season Riviera', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Oriental Garden Makati', aliases: ['The Oriental Place'], location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Veritown Fort', location: 'BGC / Fort, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Federal Land Fort-area development cluster.' },
                { name: 'Park West', location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], match: 'context', note: 'Very generic ("park west") — context-gated.' },
                { name: 'Quantum Residences', location: 'Taft Avenue, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'The Observatory', location: 'Pioneer St, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], developer: 'Federal Land NRE Global Inc. (FNG)', jv: 'Federal Land + Nomura Real Estate', subsidiaryOf: null, source: 'authoritative', confidence: 'High', towers: ['Sora Tower'], note: 'FNG is the JV development entity (Federal Land × Nomura Real Estate), confirmed by Nomura corporate release. 4.5 ha, 9-tower mixed-use; Sora is tower 1; penthouse units. FNG is a JV company, not a Federal Land subsidiary.' },
                { name: 'Valencia Hills', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Tower E'] },
                { name: 'Siena Towers', location: 'Marikina', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Peninsula Garden Midtown Homes', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], towers: ['Mango'] },
                { name: 'The Estate Makati', location: '6747 Ayala Avenue, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Makati Central Business District', developer: 'ST 6747 Resources Corp.', jv: 'Federal Land + SMDC', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Dedicated JV entity ST 6747 Resources Corp. (SMDC × Federal Land). 60-storey Foster + Partners tower; penthouse units.' },
                { name: 'Marquinton Residences', location: 'Marikina', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Alicante', 'Barcelona', 'Cordova'] },
                { name: 'Tropicana Garden City', location: 'Marikina', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Toledo'] },

                // ── Horizontal / subdivision ──
                { name: 'Hartwood Village', location: 'Biñan, Laguna', category: 'House and Lot', note: 'Within Meadowcrest.' },
                { name: 'Yume at Riverpark', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Riverpark', note: 'Japanese-inspired.' },

                // ── Cebu / regional ──
                { name: 'Marco Polo Residences', location: 'Nivel Hills, Cebu City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], towers: ['Parkview', 'Seaview', 'Parkplace'], note: 'Penthouse units. Distinct from Marco Polo Plaza hotel (landmark).' },

                // ── Office (residential:false — matched, category-filtered) ──
                { name: 'GT Tower International', location: 'Makati', category: 'Office', projectType: 'office', residential: false },
                { name: 'Metrobank Center', location: 'BGC, Taguig', category: 'Office', projectType: 'office', residential: false, note: 'Part of the Grand Hyatt Manila complex.' },
            ],
            landmarks: [
                { name: 'Mitsukoshi Mall', developer: 'Federal Land', estate: 'Grand Central Park', location: 'BGC, Taguig', matchable: false, source: 'user', note: 'Retail component of Grand Central Park — context only.' },
                { name: 'Blue Bay Walk', developer: 'Federal Land', estate: 'Metropolitan Park', location: 'Pasay', matchable: false, source: 'user', note: 'Retail strip in Met Park — context only.' },
                { name: 'Met Live', aliases: ['Met Live Arena'], developer: 'Federal Land', estate: 'Metropolitan Park', location: 'Pasay', matchable: false, source: 'user', note: 'Entertainment venue in Met Park — context only.' },
                { name: 'Marco Polo Plaza', developer: 'Federal Land', location: 'Nivel Hills, Cebu City', matchable: false, source: 'user', note: 'Hotel — context only, not the Marco Polo Residences condo.' },
            ],
            note: 'Standalone residential/mixed-use + two townships (Grand Central Park, Metropolitan Park); several Nomura (FNG) and SMDC JVs.',
        },

        // ── Filinvest Land ──
        'Filinvest Land': {
            aliases: ['Filinvest', 'Filinvest Development Corporation', 'FDC', 'Filigree', 'Aspire by Filinvest'],
            group: 'Filinvest',
            estates: [
                { name: 'Filinvest City', location: 'Alabang, Muntinlupa', type: 'CBD' },
                { name: 'Havila', location: 'Taytay / Antipolo / Angono, Rizal', type: 'Township' },
                { name: 'Timberland Heights', location: 'San Mateo, Rizal', type: 'Township' },
                { name: 'Ciudad de Calamba', location: 'Calamba, Laguna', type: 'Township' },
                { name: 'City di Mare', location: 'Cebu', type: 'Mixed-use estate' },
                { name: 'Palm Estates', location: 'Talisay, Negros Occidental', type: 'Residential estate' },
                { name: 'Filinvest New Clark City', location: 'Capas, Tarlac', type: 'Township' },
                { name: 'Filinvest Mimosa+', aliases: ['Mimosa Plus', 'Filinvest Mimosa+ Leisure City'], location: 'Clark, Pampanga', type: 'Leisure estate' },
                { name: 'Iloilo Centrale', location: 'Iloilo', type: 'Mixed-use estate' },
                { name: 'Brentville International Community', aliases: ['Brentville'], location: 'Biñan, Laguna', type: 'Township', source: 'user' },
            ],
            projects: [
                // ── Filinvest City (Alabang) ──
                { name: 'Studio City', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Filinvest City', match: 'context', note: 'Generic ("studio" + "city") — context-gated.' },
                { name: 'The Levels', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Filinvest City', match: 'context', note: 'Generic ("the levels") — context-gated.' },
                { name: 'Studio One', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Filinvest City', match: 'context', note: 'Collides with unit-type "studio one bedroom" — context-gated; residual risk flagged.' },
                { name: 'Studio Two', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Filinvest City', match: 'context', note: 'Collides with "studio two bedroom" — context-gated; residual risk flagged.' },
                { name: 'Vivant Flats', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Filinvest City' },
                { name: 'West Parc', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Filinvest City', match: 'context', note: 'Generic ("west parc") — context-gated.' },
                { name: 'Belize Oasis', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Filinvest City' },
                { name: 'The Enclave Alabang', aliases: ['The Enclave'], location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Filinvest City', match: 'context', note: 'Bare "The Enclave" is generic — context-gated.' },
                { name: 'Botanika Nature Residences', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Filinvest City' },
                { name: 'The Crib Alabang', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Filinvest City' },
                { name: 'Aspen Tower', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Filinvest City' },
                { name: 'Bristol at Parkway Place', location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Filinvest City' },

                // ── High-rise condominiums ──
                { name: '100 West', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Linear', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Activa', aliases: ['Activa Flex', 'Activa Flats'], location: 'Cubao, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Fortune Hill', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'The Beaufort', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], note: 'Penthouse units.' },
                { name: 'Studio 7', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', note: 'Collides with "studio, 7th floor" — context-gated.' },
                { name: 'Studio A', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', note: 'Generic ("studio a") — context-gated.' },
                { name: 'The Signature', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', note: 'Generic ("the signature") — context-gated.' },
                { name: 'The Prominence', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Filinvest Heights', location: 'Quezon City', category: 'Residential Lot' },
                { name: 'One Filinvest', location: 'Ortigas, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Mixed-use (residential + office).' },
                { name: 'Studio Zen', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], match: 'context', note: 'Generic ("studio zen") — context-gated.' },

                // ── Mid-rise condominiums (Oasis / Spatial / Flats brands) ──
                { name: 'Bali Oasis', aliases: ['Bali Oasis 2'], location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Capri Oasis', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Sorrento Oasis', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'One Oasis Ortigas', location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'One Spatial Pasig', aliases: ['One Spatial'], location: 'Pasig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Asiana Oasis', location: 'Parañaque', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'One Oasis', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Series — Cebu, Cagayan de Oro, Davao.' },
                { name: 'Amalfi Oasis', location: 'Cebu', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'City di Mare' },
                { name: 'San Remo Oasis', location: 'Cebu', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'City di Mare' },
                { name: '8 Spatial', location: 'Davao', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Centro Spatial', location: 'Davao', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Maldives Oasis', location: 'Dumaguete', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Marina Spatial', location: 'Dumaguete', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Maui Oasis', location: 'Manila', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Panglao Oasis', location: 'Taguig', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], note: 'Location per source (Taguig).' },
                { name: 'Alta Spatial', location: 'Valenzuela', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Verde Spatial', location: 'Quezon City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Vinia Residences', aliases: ['Vinia'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'Futura Monte', location: 'Naga', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },
                { name: 'Futura One Fora', location: 'Dagupan', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'] },

                // ── Horizontal / house & lot ──
                { name: 'Aria at Serra Monte', location: 'Cainta, Rizal', category: 'House and Lot' },
                { name: 'New Fields at Manna East', aliases: ['Futura Plains at Manna East'], location: 'Teresa, Rizal', category: 'House and Lot' },
                { name: 'Mira Valley at Havila', aliases: ['Mira Valley'], location: 'Antipolo, Rizal', category: 'House and Lot', estate: 'Havila' },
                { name: 'The Ranch', location: 'Rizal', category: 'House and Lot', match: 'context', note: 'Generic ("the ranch") — context-gated.' },
                { name: 'Highlands Pointe at Havila', aliases: ['Highlands Pointe'], location: 'Taytay, Rizal', category: 'House and Lot', estate: 'Havila' },
                { name: 'Amare Homes', location: 'Sto. Tomas, Batangas', category: 'House and Lot' },
                { name: 'Blue Grass County', location: 'Sto. Tomas, Batangas', category: 'House and Lot' },
                { name: 'Palmridge', location: 'Sto. Tomas, Batangas', category: 'House and Lot' },
                { name: 'Summerbreeze', location: 'Sto. Tomas, Batangas', category: 'House and Lot' },
                { name: 'Blue Isle', location: 'Sto. Tomas, Batangas', category: 'House and Lot' },
                { name: 'Laeuna de Taal', location: 'Talisay, Batangas', category: 'House and Lot', towers: ['Arista', 'Orilla', 'Bahia'], note: 'Enclaves Arista/Orilla/Bahia kept as metadata, not matched.' },
                { name: 'Sandia Homes', location: 'Tanauan, Batangas', category: 'House and Lot' },
                { name: 'Futura Primo', location: 'Tanauan, Batangas', category: 'House and Lot' },
                { name: 'Medallion Homes', location: 'Marilao, Bulacan', category: 'House and Lot' },
                { name: 'Melody Plains', location: 'San Jose del Monte, Bulacan', category: 'House and Lot' },
                { name: 'Melody Heights', location: 'San Jose del Monte, Bulacan', category: 'House and Lot' },
                { name: 'Citation Homes', location: 'Meycauayan, Bulacan', category: 'House and Lot' },
                { name: 'Bahay Bayanihan', location: 'Bulacan', category: 'House and Lot' },
                { name: 'Alta Vida', location: 'Bulacan', category: 'House and Lot' },
                { name: 'Aldea Del Sol', location: 'Cebu', category: 'House and Lot' },
                { name: 'Aldea Real', location: 'Laguna', category: 'House and Lot' },
                { name: 'Futura Homes', location: null, category: 'House and Lot', note: 'Series — Davao, Iloilo, Koronadal, Mactan, Bacolod, Zamboanga, etc.' },
                { name: 'Filinvest Homes', location: null, category: 'House and Lot', note: 'Series — Butuan, Tagum, and regional.' },
                { name: 'Anila Park Residences', location: 'Rizal', category: 'House and Lot' },
                { name: 'Amarilyo Crest', location: 'Taytay, Rizal', category: 'House and Lot' },
                { name: 'Princeton Heights', location: 'Cavite', category: 'House and Lot' },
                { name: 'Sydney Oasis', location: 'Cainta, Rizal', category: 'House and Lot' },
                { name: 'Montebello', id: 'montebello-filinvest', location: 'Cavite', category: 'House and Lot', match: 'context', developer: 'Filinvest Land', source: 'user', note: '⚠ HOMONYM / possible-same as Don Tim’s Montebello (Alfonso, Cavite) — Filinvest location is imprecise ("Cavite"); FLAGGED for verification. Resolved by location where possible; bare → null.' },
                { name: 'Southwind', location: 'Laguna', category: 'House and Lot' },
                { name: 'Pineview', location: 'Cavite', category: 'House and Lot' },
                { name: 'Savannah Place', location: 'Cavite', category: 'House and Lot' },
                { name: 'New Leaf', location: 'Cavite', category: 'House and Lot', match: 'context', note: 'Generic ("new leaf") — context-gated.' },
                { name: 'Meridian Place', location: 'Cavite', category: 'House and Lot' },
                { name: 'Claremont', location: 'Pampanga', category: 'House and Lot' },
                { name: 'Hampton Orchard', location: 'Pampanga', category: 'House and Lot' },
                { name: 'Tierra Vista', location: 'Bulacan', category: 'House and Lot' },
                { name: 'San Rafael Estate', location: 'Bulacan', category: 'House and Lot' },
                { name: 'Asenso Village', location: 'Laguna', category: 'House and Lot' },
                { name: 'Ashton Fields', location: 'Laguna', category: 'House and Lot' },

                // ── Office (residential:false — matched, category-filtered) ──
                { name: 'Northgate Cyberzone', location: 'Alabang, Muntinlupa', category: 'Office', projectType: 'office', residential: false, estate: 'Filinvest City', towers: ['Filinvest One', 'Filinvest Two', 'Filinvest Three', 'Vector One', 'Vector Two', 'Vector Three', 'Axis Tower One', 'Axis Tower Two', 'iHub'] },
                { name: 'PBCom Tower', location: 'Makati', category: 'Office', projectType: 'office', residential: false, jv: 'Filinvest joint interest', source: 'user', note: 'Joint interest per source.' },
                { name: 'Activa Office Tower', location: 'Quezon City', category: 'Office', projectType: 'office', residential: false },
                { name: 'Filinvest Cyberzone Cebu', location: 'Cebu', category: 'Office', projectType: 'office', residential: false },
                { name: 'Filinvest Cyberzone Bay City', location: 'Pasay', category: 'Office', projectType: 'office', residential: false },
            ],
            landmarks: [
                { name: 'Festival Mall', aliases: ['Festival Supermall'], developer: 'Filinvest Land', estate: 'Filinvest City', location: 'Alabang, Muntinlupa', matchable: false, source: 'user', note: 'Retail component of Filinvest City — context only.' },
                { name: 'Il Corso Mall', aliases: ['Il Corso'], developer: 'Filinvest Land', estate: 'City di Mare', location: 'Cebu', matchable: false, source: 'user', note: 'Retail in City di Mare — context only.' },
                { name: 'Fora Mall', aliases: ['Fora'], developer: 'Filinvest Land', location: 'Tagaytay', matchable: false, source: 'user', note: 'Retail — context only.' },
                { name: 'Main Square', developer: 'Filinvest Land', location: 'Bacoor, Cavite', matchable: false, source: 'user', note: 'Retail — context only.' },
            ],
        },

        // ── Sta. Lucia Land (subdivisions & golf communities) ──
        'Sta. Lucia Land': {
            aliases: ['Sta Lucia Land', 'Sta. Lucia Realty', 'Sta Lucia Realty', 'Sta. Lucia'],
            group: 'Sta. Lucia',
            estates: [],
            projects: [
                // ── Rizal / Eastern Metro Manila (horizontal) ──
                { name: 'Antipolo Greenland', location: 'Antipolo, Rizal', category: 'Residential Lot' },
                { name: 'Cainta Greenland', location: 'Cainta, Rizal', category: 'Residential Lot' },
                { name: 'Acropolis Loyola', location: 'Quezon City', category: 'Residential Lot' },
                { name: 'Blue Mountains', location: 'Antipolo, Rizal', category: 'Residential Lot', match: 'context', note: 'Generic geographic phrase — context-gated.' },
                { name: 'Oro Vista Grande', location: 'Antipolo, Rizal', category: 'Residential Lot' },
                { name: 'Verterra Highlands', location: 'Tanay, Rizal', category: 'Residential Lot' },
                { name: 'Green Peak Heights', location: 'Baras, Rizal', category: 'Residential Lot' },
                { name: 'Palo Alto Leisure and Residential Estates', location: 'Baras, Rizal', category: 'Residential Lot' },
                { name: 'Vista Verde', location: 'Rizal', category: 'Residential Lot' },
                { name: 'Greenwoods Executive Village', aliases: ['Greenwoods Executive'], location: 'Pasig / Cainta', category: 'Residential Lot' },

                // ── Cavite / Laguna / Batangas (horizontal + golf) ──
                { name: 'Eagle Ridge Golf & Residential Estates', aliases: ['Eagle Ridge', 'Eagle Ridge Golf & Country Club'], location: 'General Trias, Cavite', category: 'Residential Lot', note: 'Golf community.' },
                { name: 'The Orchard Golf & Country Club', aliases: ['Orchard Residential Estates'], location: 'Cavite', category: 'Residential Lot', note: 'Golf community; distinct from Orchard Towers (Pasig condo).' },
                { name: 'Metropolis South', location: 'Cavite', category: 'Residential Lot' },
                { name: 'Metropolis East', location: 'Rizal', category: 'Residential Lot' },
                { name: 'Metropolis Greens', location: 'Cavite', category: 'Residential Lot' },
                { name: 'Alta Vista Tagaytay', location: 'Tagaytay', category: 'Residential Lot' },
                { name: 'Aqua Mira at Saddle', location: 'Tanza, Cavite', category: 'Residential Lot' },
                { name: 'Nasacosta', location: 'Nasugbu, Batangas', category: 'Residential Lot', note: 'Resort-themed.' },
                { name: 'El Sitio Nativo', location: 'Nasugbu, Batangas', category: 'Residential Lot', note: 'Resort-themed.' },
                { name: 'Catalina Lake Residences', location: 'Bauan, Batangas', category: 'Residential Lot' },
                { name: 'Bauan Grand Villa Homes', location: 'Bauan, Batangas', category: 'Residential Lot' },
                { name: 'Golden Meadows', location: 'Biñan, Laguna', category: 'Residential Lot' },
                { name: 'South Springs', location: 'Laguna', category: 'Residential Lot' },
                { name: 'Lipa Royale Estates', location: 'Lipa, Batangas', category: 'Residential Lot' },
                { name: 'Summit Point', location: 'Lipa, Batangas', category: 'Residential Lot', note: 'Golf community.' },
                { name: 'Caliraya Springs', aliases: ['Caliraya Lake Ridge'], location: 'Cavinti, Laguna', category: 'Residential Lot' },
                { name: 'Royale Tagaytay', location: 'Tagaytay', category: 'Residential Lot', note: 'Golf estate.' },

                // ── Central Luzon ──
                { name: 'Beverly Place', location: 'Mexico, Pampanga', category: 'Residential Lot' },
                { name: 'Metropolis North', location: 'Bulacan', category: 'Residential Lot' },
                { name: 'Cyberville', id: 'cyberville-bulacan', aliases: ['Cyberville Subdivision'], location: 'Bulacan', category: 'Residential Lot', match: 'context', developer: 'Sta. Lucia Land', source: 'user', note: 'HOMONYM with Suntrust’s Cyberville (Cavite) — resolved by location; bare "Cyberville" → null. Canonical set to "Cyberville" (was "Cyberville Subdivision", kept as alias) for homonym resolution.' },
                { name: 'Colinas Verdes', location: 'San Jose del Monte, Bulacan', category: 'Residential Lot' },
                { name: 'Mira Verde', location: 'Bulacan', category: 'Residential Lot' },
                { name: 'Lakewood City', location: 'Cabanatuan, Nueva Ecija', category: 'Residential Lot', source: 'authoritative', note: 'Golf community. Sta. Lucia is the MAIN developer (attribution unchanged); Landco Pacific + Nueva Ecija Land Co. are landowner co-developers of the 155-ha JV community. Landco developed sub-projects within it (see Landco Pacific → The Courtyard at Lakewood City).' },
                { name: 'Club Morocco', location: 'Subic', category: 'Residential Lot' },

                // ── Visayas ──
                { name: 'Green Meadows East Iloilo', aliases: ['Green Meadows East'], location: 'Iloilo', category: 'Residential Lot' },
                { name: 'Hacienda Verde Iloilo', location: 'Iloilo', category: 'Residential Lot' },
                { name: 'Aldea at Monterosa', aliases: ['Aldea @ Monterosa'], location: 'Oton, Iloilo', category: 'Residential Lot' },
                { name: 'Blue Ridge at Monterosa', location: 'Oton, Iloilo', category: 'Residential Lot' },
                { name: 'Metropolis Iloilo', location: 'Iloilo', category: 'Residential Lot' },
                { name: 'Monte Rosa Iloilo', location: 'Iloilo', category: 'Residential Lot' },
                { name: 'Almeria Village', location: 'Sibulan, Negros Oriental', category: 'Residential Lot' },
                { name: 'Alta Vista Golf & Country Club', location: 'Cebu', category: 'Residential Lot', note: 'Golf community; distinct from Alta Vista Tagaytay.' },

                // ── Mindanao / other ──
                { name: 'Rancho Palos Verdes Golf and Residential Estates', aliases: ['Rancho Palos Verdes', 'Rancho Palos Verdes Golf & Country Club'], location: 'Davao', category: 'Residential Lot', note: 'Golf community.' },
                { name: 'Altea Ciudades Davao', location: 'Davao', category: 'Residential Lot' },
                { name: 'Tierra Verde Digos', location: 'Digos', category: 'Residential Lot' },
                { name: 'Monte Verde Digos', location: 'Digos', category: 'Residential Lot' },
                { name: 'Ponte Verde', location: 'Davao', category: 'Residential Lot' },
                // Homonym: Sta. Lucia's Valle Verde in Davao. The Pasig namesake is a
                // separate entity under Ortigas Land (its actual developer). Both share
                // canonical name "Valle Verde" and resolve by location; bare → null.
                { name: 'Valle Verde', id: 'valle-verde-davao', location: 'Panacan, Davao City', category: 'Residential Lot', match: 'context', developer: 'Sta. Lucia Land', source: 'authoritative', confidence: 'High', note: 'Sta. Lucia’s active residential-lot subdivision in Panacan, Davao (ready for occupancy). Homonym with Ortigas’ Valle Verde in Pasig — resolved by location.' },
                { name: 'Los Rayos Lake Residences', location: 'Davao', category: 'Residential Lot' },
                { name: 'Las Colinas', location: 'Davao', category: 'Residential Lot' },
                { name: 'South Pacific Golf Club', location: 'Davao', category: 'Residential Lot', note: 'Golf community.' },

                // ── Townhouses ──
                { name: 'Nottingham Villas', location: 'Taytay, Rizal', category: 'Town House', note: 'Also a Jaro, Iloilo phase.' },

                // ── Vertical: condominiums / condotels ──
                { name: 'East Bel-Air Residences', aliases: ['East Bel Air Towers'], location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Sta. Lucia Residenze', location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Monte Carlo', 'Santorini', 'Madrid'] },
                { name: 'Orchard Towers', aliases: ['The Orchard Pasig Tower'], location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Neopolitan Condominium', aliases: ['Neopolitan'], location: 'Fairview, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'La Mirada Tower', location: 'Lapu-Lapu, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Splendido Taal', aliases: ['Splendido Taal Tower 1'], location: 'Laurel, Batangas', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Golf/leisure + hotel components.' },
                { name: 'Greenmeadows Condominium', location: 'Jaro, Iloilo', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Arterra Residences at Discovery Bay', location: 'Lapu-Lapu, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Condotel.' },
                { name: 'Stradella', aliases: ['East Bel Air Tower 2'], location: 'Cainta, Rizal', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },
                { name: 'La Breza Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Sotogrande', aliases: ['SotoGrande'], location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Condotel series — Baguio, Iloilo, Katipunan QC, Palawan, Davao, Cebu (Residencia de Vistamar).' },
                { name: 'Crown Residence at Harbor Springs', location: 'Puerto Princesa, Palawan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], note: 'Condotel at Harbor Springs Resort.' },

                // ── Office / commercial ──
                { name: 'Sta. Lucia Business Center', location: 'Cainta, Rizal', category: 'Office', projectType: 'office', residential: false },
            ],
            landmarks: [
                { name: 'Sta. Lucia East Grand Mall', aliases: ['Sta Lucia East Grand Mall'], developer: 'Sta. Lucia Land', location: 'Cainta, Rizal', matchable: false, source: 'user', note: 'Retail — context only.' },
                { name: 'Sta. Lucia Mall Davao', developer: 'Sta. Lucia Land', location: 'Davao', matchable: false, source: 'user', note: 'Retail (under development) — context only.' },
            ],
            note: 'Residential-lot / golf-community focused; extensive horizontal portfolio nationwide plus Sotogrande condotels.',
        },

        // ── Ortigas Land / Ortigas & Company ──
        'Ortigas Land': {
            aliases: ['Ortigas & Company', 'Ortigas and Company'],
            group: 'Ortigas',
            estates: [
                { name: 'Ortigas Center', location: 'Pasig / Mandaluyong', type: 'CBD' },
                { name: 'Ortigas East', aliases: ['Frontera Verde'], location: 'Pasig', type: 'Mixed-use estate' },
                { name: 'Capitol Commons', location: 'Pasig', type: 'Mixed-use estate' },
                { name: 'Greenhills', aliases: ['Greenhills Center'], location: 'San Juan', type: 'Mixed-use estate', developer: 'Ortigas & Company', source: 'authoritative' },
                { name: 'Circulo Verde', location: 'Quezon City', type: 'Mixed-use estate', source: 'user' },
                // Historic Ortigas residential VILLAGES — areas, NOT sellable projects
                // (so they are never matched as a "project"; a listing "house in Wack
                // Wack" recognizes the location, not a developer's unit inventory).
                { name: 'Greenmeadows', location: 'Quezon City', type: 'Residential village', developer: 'Ortigas & Company', source: 'authoritative' },
                { name: 'Wack Wack', location: 'Mandaluyong', type: 'Residential village', developer: 'Ortigas & Company', source: 'authoritative' },
                { name: 'Barranca', location: 'Mandaluyong', type: 'Residential village', developer: 'Ortigas & Company', source: 'authoritative' },
            ],
            projects: [
                // ── Valle Verde (Pasig) — homonym with Sta. Lucia's Davao project ──
                { name: 'Valle Verde', id: 'valle-verde-pasig', location: 'Pasig', category: 'Residential Lot', match: 'context', developer: 'Ortigas & Company', source: 'authoritative', confidence: 'High', note: 'Ortigas & Company gated subdivision (Valle Verde 1–6), Pasig. Kept as a resolvable project entity (not an estate) so the homonym with Sta. Lucia’s Valle Verde Davao resolves by location; bare "Valle Verde" → null.' },

                // ── Ortigas Center ──
                { name: 'The Galleon', aliases: ['Residences at The Galleon'], location: 'Ortigas Center, Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Ortigas Center', note: 'Mixed-use (residential + office + retail); penthouse units.' },
                { name: 'Olin at Jade Drive', aliases: ['Olin'], location: 'Ortigas Center, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Ortigas Center' },

                // ── Capitol Commons ──
                { name: 'The Royalton at Capitol Commons', aliases: ['The Royalton'], location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Capitol Commons' },
                { name: 'Empress at Capitol Commons', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Capitol Commons' },
                { name: 'Maven at Capitol Commons', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Capitol Commons' },

                // ── Circulo Verde (Quezon City) ──
                { name: 'Lleida Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Circulo Verde' },
                { name: 'Avila Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Circulo Verde' },
                { name: 'Ibiza Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Circulo Verde' },
                { name: 'Majorca Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Circulo Verde' },
                { name: 'Seville Residences', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Circulo Verde' },
                { name: 'Circulo Verde Garden Homes', location: 'Quezon City', category: 'House and Lot', estate: 'Circulo Verde' },

                // ── Ortigas East ──
                { name: 'Verdant Towers', aliases: ['Maple at Verdant Towers'], location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Ortigas East' },

                // ── Greenhills (redevelopment) ──
                { name: 'Viridian in Greenhills', aliases: ['Viridian'], location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Greenhills' },
                { name: 'Connor at Greenhills', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Greenhills' },
                { name: 'GH Tower', location: 'San Juan', category: 'Office', projectType: 'office', residential: false, estate: 'Greenhills' },

                // ── Regional leisure ──
                { name: 'Costa Calatagan', location: 'Calatagan, Batangas', category: 'Residential Lot', note: 'Coastal leisure estate; lots + resort villas.' },
            ],
            landmarks: [
                { name: 'Estancia Mall', developer: 'Ortigas Land', estate: 'Capitol Commons', location: 'Pasig', matchable: false, source: 'user', note: 'Retail in Capitol Commons — context only.' },
                { name: 'Industria Mall', developer: 'Ortigas Land', location: 'Pasig', matchable: false, source: 'user', note: 'Retail — context only.' },
                { name: 'Tiendesitas', developer: 'Ortigas Land', estate: 'Ortigas East', location: 'Pasig', matchable: false, source: 'user', note: 'Retail in Ortigas East — context only.' },
                { name: 'Greenhills Shopping Center', aliases: ['Greenhills Mall'], developer: 'Ortigas Land', estate: 'Greenhills', location: 'San Juan', matchable: false, source: 'user', note: 'Retail — context only.' },
            ],
        },

        // ── AboitizLand (real-estate arm of Aboitiz Equity Ventures / Aboitiz Group) ──
        // DUAL-SOURCE ingest (2026-08-14): user list + web research. Mostly wholly-
        // owned horizontal residential (Cebu/Visayas + Luzon) + a few condos. Point
        // Blue microstudios are a 50/50 JV. Economic Estates (LIMA/West Cebu) are the
        // industrial platform; residential communities sit within/near them.
        'AboitizLand': {
            aliases: ['Aboitiz Land', 'AboitizLand Inc'],
            group: 'Aboitiz',
            subsidiaryOf: 'Aboitiz Equity Ventures',
            estates: [
                { name: 'LIMA Estate', aliases: ['Lima Technology Center'], location: 'Lipa / Malvar, Batangas', type: 'Industrial estate', note: 'Industrial-led township; holds The Villages at LIMA + The Strides at LIMA.' },
                { name: 'West Cebu Estate', location: 'Balamban, Cebu', type: 'Industrial estate', source: 'authoritative', note: '540-ha mixed industrial estate (Aboitiz Economic Estates); Foressa Mountain Town sits nearby.' },
            ],
            projects: [
                // ── Cebu / Visayas horizontal ──
                { name: 'North Town Homes', location: 'Mandaue / Cebu', category: 'House and Lot', source: 'user', note: 'Launched 1994 (Cabancalan/Talamban); lots + house-and-lot.' },
                { name: 'Mahogany Grove', location: 'Mandaue, Cebu', category: 'House and Lot', source: 'user', note: '~2001.' },
                { name: 'Pristina North Residences', aliases: ['Pristina North'], location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user', note: 'Lots + house-and-lot.' },
                { name: 'Molave Highlands', location: 'Consolacion, Cebu', category: 'Residential Lot', source: 'user' },
                { name: 'Priveya Hills', location: 'Bacayan / Talamban, Cebu City', category: 'Residential Lot', source: 'user' },
                { name: 'North Town Woods', location: 'Cebu', category: 'House and Lot', source: 'user' },
                { name: 'North Town Residences', location: 'Cebu', category: 'Town House', source: 'user' },
                { name: 'Briza', location: 'Cebu', category: 'House and Lot', source: 'user', note: 'Short name (<6 chars) — not fed to the matcher.' },
                { name: 'Kishanta', aliases: ['Kishanta Zen Residences'], location: 'Lagtang, Talisay City, Cebu', category: 'House and Lot', source: 'user', note: '~2006; lots + house-and-lot.' },
                { name: 'Ajoya Mactan', location: 'Cordova, Mactan, Cebu', category: 'House and Lot', source: 'user', note: 'Ajoya mid-market brand; lots/H&L/townhouse + shophouse (commercial ground + residential upper).' },
                { name: 'Almiya', location: 'Canduman, Mandaue City, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Amoa', location: 'Compostela, Cebu', category: 'House and Lot', source: 'user', note: '~2015. Short name (<6 chars) — not fed to the matcher.' },
                { name: 'The Persimmon', location: 'Mabolo, Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Urban village (~2008); condominium towers.' },
                { name: 'The Persimmon Studios', location: 'Cebu City', category: 'Condominium', units: ['Studio'], source: 'user' },
                { name: 'Foressa Mountain Town', location: 'Balamban, Cebu', category: 'Residential Lot', estate: 'West Cebu Estate', source: 'authoritative', confidence: 'High', note: 'AboitizLand mountain residential estate (2017), near West Cebu Estate; phased.' },

                // ── Luzon ──
                { name: 'Seafront Residences', location: 'San Juan, Batangas', category: 'House and Lot', source: 'user', note: '~43-ha beach community (2017, Laiya area); lots + house-and-lot.' },
                { name: 'Seafront Villas', location: 'San Juan, Batangas', category: 'Condominium', units: ['1BR', '2BR'], parentProjectId: 'Seafront Residences', source: 'user', note: 'Low-rise beach condos within Seafront Residences.' },
                { name: 'Ajoya Capas', location: 'Capas, Tarlac', category: 'House and Lot', source: 'user', note: '2018, ~13 ha; shophouse options.' },
                { name: 'Ajoya Cabanatuan', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot', source: 'user', note: '2018, ~19–20 ha; shophouse options.' },
                { name: 'Ajoya Pampanga', location: 'Mexico, Pampanga', category: 'House and Lot', source: 'user', note: '2019, ~21 ha; shophouse options.' },
                { name: 'Brook Village', location: 'Lipa / Malvar, Batangas', category: 'House and Lot', estate: 'LIMA Estate', match: 'context', source: 'user', note: 'Village within The Villages at LIMA Estate; generic name — context-gated.' },
                { name: 'Sierra Village', location: 'Lipa / Malvar, Batangas', category: 'House and Lot', estate: 'LIMA Estate', match: 'context', source: 'user', note: 'Village within The Villages at LIMA Estate; generic name — context-gated.' },
                { name: 'Meadow Village', aliases: ['Meadow at LIMA Estate'], location: 'Lipa / Malvar, Batangas', category: 'House and Lot', estate: 'LIMA Estate', match: 'context', source: 'user', note: 'Village within The Villages at LIMA Estate; generic name — context-gated.' },
                { name: 'The Strides at LIMA', location: 'Lipa / Malvar, Batangas', category: 'Condominium', units: ['Studio', '1BR'], estate: 'LIMA Estate', towers: ['Slate', 'Amber', 'Cider'], source: 'user', note: 'Mid-rise cluster; Slate (2023), Amber (2024), Cider (planned). Building names kept as metadata.' },
                { name: 'Point Blue', location: 'Metro Manila', category: 'Condominium', units: ['Studio'], developer: 'Point Blue, Inc.', subsidiaryOf: 'AboitizLand', historicalJV: 'AboitizLand + Point Blue', historicalJVShareholding: '50/50', match: 'context', source: 'authoritative', confidence: 'High', note: 'CURRENT: Point Blue, Inc. is a wholly-owned AboitizLand subsidiary (Aboitiz disclosure; confirmed a subsidiary as of 2025) — the development entity, NOT the parent auto-assigned. HISTORICAL: began as a 50/50 AboitizLand × Point Blue JV (2019). Microstudio-rental platform near Metro Manila CBDs. Generic name — context-gated.' },
            ],
        },

        // ── DoubleDragon Corporation ──
        // DUAL-SOURCE ingest (2026-08-14): user list + web research. DD is 35% Injap
        // Investments (Edgar Sia) + 35% Honeystar Holdings (Tan Caktiong / Jollibee
        // group). Portfolio is MOSTLY non-residential. Per user rule: residential:false
        // ≠ not-a-project — offices/industrial/condotels are real Realmate projects
        // (matched, filtered out of residential results); only true mall/hotel chains
        // are landmarks (context only). CityMall stays a single chain-level landmark.
        'DoubleDragon': {
            aliases: ['DoubleDragon Corporation', 'DoubleDragon Properties', 'DD'],
            group: 'DoubleDragon',
            note: 'Investment holding company. Principal SHAREHOLDERS: Injap Investments Inc. and Honeystar Holdings Corp. (~35% each). This is corporate ownership, NOT a project-level joint venture — kept separate from project jv attribution.',
            estates: [
                { name: 'DD Meridian Park', location: 'Bay Area, Pasay', type: 'Mixed-use estate', source: 'authoritative', note: '~4.8-ha flagship office/retail complex (DoubleDragon Plaza, DD Center East/West, DD Tower, Ascott-DD Meridian Park).' },
            ],
            projects: [
                // ── Residential (fed + residential) ──
                { name: 'People’s Condominium', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: 'DD’s first project (~2011); first condo in Iloilo City, 6-storey, 71 units.' },
                { name: 'FirstHomes Iloilo', location: 'Mandurriao, Iloilo City', category: 'Town House', source: 'user', note: 'Completed 2012; 1.30 ha, 112 units.' },
                { name: 'DD HappyHomes', location: null, category: 'House and Lot', source: 'user', note: 'Socialized/economic housing subsidiary; sites incl. Mandurriao/Iloilo, Tanauan/Leyte, Zarraga/Iloilo. Lots + house-and-lot.' },
                { name: 'The Uptown Place', location: 'Iloilo City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: '5-storey commercial-residential across UP Iloilo; ~236 units.' },
                { name: 'W.H. Taft Residences', location: 'Taft Avenue, Manila', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: '31-storey beside DLSU-Manila; DD’s first Metro Manila project.' },
                { name: 'The SkySuites Tower', aliases: ['SkySuites Tower'], location: 'EDSA-Quezon Avenue, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Acquired 2014; dual-structure commercial-office + residential (lofts). Office component retained for leasing.' },

                // ── Condotel (sellable HappyRoom/condotel units → project, residential:false) ──
                { name: 'Injap Tower', location: 'Iloilo City', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel of Asia, Inc.', subsidiaryOf: 'DoubleDragon', historicalJV: 'Injap Investments + Chan C. Bros (Oishi) + Staniel Realty — formed Hotel of Asia, Inc. (2011)', source: 'authoritative', confidence: 'High', note: '21-storey condotel (2014), 194 investor-owned rooms. Developer = Hotel of Asia, Inc. (DD hospitality subsidiary). The Injap/Oishi/Staniel JV formed Hotel of Asia in 2011 (corporate-formation JV, not a current project JV). Units sold under condotel model.' },
                // Hotel101 development entities are NOT flattened to DoubleDragon: the
                // earlier PH projects were developed by Hotel of Asia, Inc. (DD's hotel
                // subsidiary); Hotel101 Global Holdings Corp. (NASDAQ: HBNB) is the
                // broader/current development vehicle. DoubleDragon is the ultimate parent.
                { name: 'Hotel101-Manila', location: 'Pasay', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel of Asia, Inc.', subsidiaryOf: 'DoubleDragon', source: 'authoritative', confidence: 'High', note: 'Operating Hotel101 condotel — identical 21sqm "HappyRoom" units sold to investors (revenue-share). Developed by Hotel of Asia, Inc. (brand vehicle: Hotel101 Global Holdings Corp.).' },
                { name: 'Hotel101-Fort', location: 'BGC, Taguig', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel of Asia, Inc.', subsidiaryOf: 'DoubleDragon', source: 'authoritative', confidence: 'High', note: 'Operating Hotel101 condotel; HappyRoom units sold to investors. Developed by Hotel of Asia, Inc.' },
                { name: 'Hotel101-Cebu', location: 'Mactan, Cebu', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel of Asia, Inc.', jv: 'Hotel of Asia, Inc. + Cebu landowner (JV to develop Hotel101-Cebu)', subsidiaryOf: 'DoubleDragon', source: 'authoritative', confidence: 'Medium', note: 'DD disclosure: developed through Hotel of Asia, Inc. via a JV agreement for the Mactan site. Partner not fully named — FLAGGED.' },
                { name: 'Hotel101-Davao', location: 'Davao City', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel101 Global Holdings Corp.', subsidiaryOf: 'DoubleDragon', source: 'user', confidence: 'Medium', note: 'Hotel101 condotel (pipeline/pre-selling), current Hotel101 Global vehicle; HappyRoom investor units. Development entity not per-project verified — FLAGGED.' },
                { name: 'Hotel101-Resort Boracay', location: 'Boracay New Coast', category: 'Building', subtype: 'Condotel', projectType: 'commercial', residential: false, developer: 'Hotel101 Global Holdings Corp.', subsidiaryOf: 'DoubleDragon', source: 'user', confidence: 'Medium', note: 'Resort condotel (pipeline/pre-selling), current Hotel101 Global vehicle. Development entity not per-project verified — FLAGGED.' },

                // ── Office / commercial / industrial (fed, residential:false) ──
                { name: 'Jollibee Tower', location: 'Ortigas CBD, Pasig', category: 'Office', projectType: 'office', residential: false, developer: 'DoubleDragon + Jollibee Foods Corp (JV)', jv: 'DoubleDragon + Jollibee Foods Corporation', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: '41-storey Grade A office; anchor tenant JFC. JV project.' },
                { name: 'DoubleDragon Plaza', location: 'Bay Area, Pasay', category: 'Office', projectType: 'office', residential: false, estate: 'DD Meridian Park', source: 'user', note: 'Office towers within DD Meridian Park.' },
                { name: 'CentralHub', location: null, category: 'Commercial Lot', projectType: 'commercial', residential: false, developer: 'CentralHub Industrial Centers Inc.', subsidiaryOf: 'DoubleDragon', source: 'authoritative', confidence: 'High', note: 'Industrial warehouse complexes (logistics, cold storage, commissary, light manufacturing). Multi-site: Tarlac, Capiz, Calamba/Laguna, Santolan/Pasig, Danao/Cebu, Sta. Barbara/Iloilo, Davao, Silay/Negros, Surigao, etc.' },
            ],
            landmarks: [
                { name: 'CityMall', developer: 'CityMall Commercial Centers Inc.', jv: 'DoubleDragon (66%) + SM Investments (34%)', matchable: false, source: 'authoritative', note: 'Community-mall CHAIN (43+ locations) — single chain-level landmark, context only. Locations incl. Arnaldo-Roxas (Capiz, 1st), Consolacion & Danao (Cebu), Anabu (Imus), Tetuan (Zamboanga), Boracay, Parola & Mandalagan (Iloilo/Bacolod), Cotabato, Tagum, Dipolog, Surigao, Antique, etc.' },
                { name: 'JinJiang Inn', aliases: ['Jinjiang Inn'], developer: 'Hotel of Asia, Inc.', subsidiaryOf: 'DoubleDragon', matchable: false, source: 'authoritative', note: 'Operated economy-hotel chain (Makati, Ortigas, Boracay Station 1) — context only, not sold as units (unlike Hotel101).' },
                { name: 'Dragon8 Mall', aliases: ['Dragon8 Shopping Center'], developer: 'DoubleDragon', location: 'Divisoria, Manila', matchable: false, source: 'user', note: 'Multi-storey mall (C.M. Recto/Dagupan) — context only.' },
                { name: 'Umbria Mall', aliases: ['Umbria Commercial Center'], developer: 'DoubleDragon', jv: 'Piccadilly Circus Landing', location: 'Biñan, Laguna', matchable: false, source: 'user', note: 'Retail — context only.' },
                { name: 'Ascott DD Meridian Park', developer: 'DoubleDragon', estate: 'DD Meridian Park', location: 'Pasay', matchable: false, source: 'user', note: 'Ascott-operated luxury serviced residences in DD Meridian Park — context only.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // A BROWN COMPANY, INC. (ABCI) — listed CDO holding company (real estate +
        // agribusiness + energy + mining), founder Walter Brown. Real-estate arm is
        // a leading Northern Mindanao (CDO/Caraga/Bukidnon) developer + a few Rizal/
        // Luzon estates. DUAL-SOURCE ingest (2026-08-14): user list + web (ABCI site).
        // ═══════════════════════════════════════════════════════════════════
        'A Brown Company': {
            aliases: ['A Brown Company Inc', 'ABCI', 'A Brown', 'A Brown Co'],
            group: 'A Brown',
            estates: [
                { name: 'Xavier Estates', location: 'Upper Balulang, Cagayan de Oro', type: 'Residential estate', developer: 'A Brown Company', source: 'authoritative', confidence: 'High', note: 'Flagship masterplanned Class A community (~220–288+ ha, phased); parent of Ventura Residences, Ignatius Enclave, The Terraces. Xavier Sports & Country Club within.' },
            ],
            projects: [
                // ── Xavier Estates children ──
                { name: 'Ventura Residences', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Xavier Estates', source: 'authoritative', confidence: 'High', note: 'Xavier Estates Phase 5 (5A/5B); middle-market H&L + prime lots.' },
                { name: 'Ignatius Enclave', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Xavier Estates', source: 'authoritative', confidence: 'High', note: 'Xavier Estates Phase 6; house-and-lot + lots.' },
                { name: 'The Terraces', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Xavier Estates', match: 'context', source: 'authoritative', confidence: 'High', note: 'Ridge lots within Xavier Estates. Generic name — context-gated.' },

                // ── Other CDO / Mindanao residential ──
                { name: 'Teakwood Hills', aliases: ['Teakwood Crest'], location: 'Agusan, Cagayan de Oro', category: 'House and Lot', source: 'user', note: 'Multiple phases (incl. Belle del Mar refs).' },
                { name: 'Coral Resort Estates', aliases: ['Coral Resorts Estate'], location: 'Initao, Misamis Oriental', category: 'House and Lot', source: 'user', note: 'Residential resort-style; multiple phases.' },
                { name: 'West Highlands', location: 'Bonbon, Butuan City', category: 'House and Lot', match: 'context', source: 'user', note: 'Golf-adjacent residential estate; generic name — context-gated.' },
                { name: 'Xavierville Homes', location: 'Upper Balulang, Cagayan de Oro', category: 'House and Lot', source: 'authoritative', confidence: 'Medium', note: 'Economic housing; named on ABCI site.' },
                { name: 'Mountain View Homes', location: 'Upper Balulang, Cagayan de Oro', category: 'House and Lot', match: 'context', source: 'authoritative', confidence: 'Medium', note: 'Generic name — context-gated.' },
                { name: 'Adelaida Park Residences', location: 'Upper Balulang, Cagayan de Oro', category: 'House and Lot', source: 'user', note: 'Ridgeview linear-park concept.' },
                { name: 'Valencia Estates', location: 'Valencia City, Bukidnon', category: 'Residential Lot', source: 'authoritative', confidence: 'Medium', note: 'Named on ABCI site.' },
                { name: 'Mountain Pines Farm', aliases: ['Mountain Pines Farm 2'], location: 'Manolo Fortich, Bukidnon', category: 'Residential Lot', source: 'user', note: 'Farm-lot / gentleman’s-farm concept at elevation.' },
                { name: 'Mangoville', location: 'Agusan, Cagayan de Oro', category: 'House and Lot', source: 'user', note: 'Socialized housing (duplex).' },
                { name: 'St. Therese Subdivision', aliases: ['Therese Homes'], location: 'Balulang, Cagayan de Oro', category: 'Town House', source: 'user', note: 'Row houses / duplex / single-attached.' },
                { name: 'Adelaida Mountain Residences', aliases: ['Adelaida Homes'], location: 'Tanay, Rizal', category: 'House and Lot', source: 'user' },
                { name: 'Adelaida Meadow Residences', location: 'Bancasi, Butuan City', category: 'House and Lot', source: 'user' },
                { name: 'East Cove', location: 'Cainta, Rizal', category: 'Residential Lot', match: 'context', source: 'user', confidence: 'Low', note: 'Limited public detail; generic name — context-gated.' },

                // ── Pipeline / emerging (unverified) ──
                { name: 'The Shoppe Houses', location: 'Upper Balulang, Cagayan de Oro', category: 'Commercial Lot', projectType: 'commercial', residential: false, match: 'context', source: 'unverified', note: 'Shophouse-style; "coming soon" reference — not yet confirmed launched.' },
                { name: 'Skyline Residences', location: null, category: 'Condominium', match: 'context', source: 'unverified', note: 'Pipeline reference; details limited in public filings.' },
            ],
        },

        // ── Eton Properties ──

        // ── Eton Properties (real-estate arm of LT Group / Lucio Tan Group) ──
        // DUAL-SOURCE ingest (2026-08-14): user list + web. Sub-entities Eton City,
        // Inc. and Belton Communities, Inc. develop the Eton City horizontal. Parklinks
        // is the Ayala × Eton JV (dev entity ALI Eton Property Development Corp. — see
        // the Ayala Land Premier entry). residential:false ≠ not-a-project for offices.
        'Eton Properties': {
            aliases: ['Eton Properties Philippines', 'Eton', 'Eton Properties Philippines Inc'],
            group: 'Eton',
            subsidiaryOf: 'LT Group, Inc.',
            estates: [
                { name: 'Eton Centris', aliases: ['Centris'], location: 'EDSA cor Quezon Ave, Quezon City', type: 'Mixed-use estate', source: 'authoritative', note: '~12-ha mixed-use township.' },
                { name: 'Parklinks', location: 'Quezon City / Pasig', type: 'Township', note: 'JV with Ayala Land (also listed under Ayala Land). Dev entity: ALI Eton Property Development Corp.' },
                { name: 'Eton City', location: 'Sta. Rosa, Laguna', type: 'Township', developer: 'Eton City, Inc.', source: 'authoritative', confidence: 'High', note: '600+-ha township along SLEX; low-density villages + commercial district.' },
                { name: 'Eton WestEnd Square', location: 'Malugay / Yakal, Makati', type: 'Mixed-use estate', source: 'authoritative', confidence: 'High', note: 'West Makati mixed-use: eWestPod (BPO), eWestMall (retail), Belton Place + Blakes Tower (residential).' },
            ],
            projects: [
                // ── Residential condominiums / mixed-use towers ──
                { name: '8 Adriatico', location: 'Padre Faura cor Bocobo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: '42-storey residential + SOHO.' },
                { name: 'Eton Tower Makati', location: 'Legaspi Village, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Mixed-use: residences, SOHO, The Mini Suites serviced apartments.' },
                { name: 'Eton Baypark Manila', aliases: ['Eton Baypark'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The Eton Residences Greenbelt', location: 'Legaspi Village, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'user', note: '39-storey all-loft.' },
                { name: 'Eton Parkview Greenbelt', location: 'Makati', category: 'Condominium', units: ['1BR'], source: 'user', note: 'Loft/residential units near Legazpi Park.' },
                { name: 'Eton Emerald Lofts', location: 'Ortigas, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Loft units.' },
                { name: 'One Archers Place', location: 'Taft, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Near DLSU-Manila.' },
                { name: 'Belton Place', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Eton WestEnd Square', source: 'user', note: '39-storey within Eton WestEnd Square.' },
                { name: 'One Centris Place', location: 'Eton Centris, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Eton Centris', source: 'user', note: 'Also the Ascent residential building within Eton Centris.' },
                { name: 'Blakes Tower', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR'], estate: 'Eton WestEnd Square', source: 'user', note: '36-storey mixed-use: Blakes Residences + Blakes Offices + Co-Living. Residential + office.' },
                { name: '68 Roces', location: 'Quezon City', category: 'Town House', source: 'user', note: 'Gated community.' },

                // ── Eton City horizontal (Belton Communities, Inc.) ──
                { name: 'Riverbend', aliases: ['Riverbend at Eton City'], location: 'Sta. Rosa, Laguna', category: 'House and Lot', estate: 'Eton City', source: 'user' },
                { name: 'South Lake Village', aliases: ['South Lake Village at Eton City'], location: 'Sta. Rosa, Laguna', category: 'Residential Lot', estate: 'Eton City', match: 'context', source: 'user', note: 'Island-lot concept around a man-made lake. Generic name — context-gated.' },
                { name: 'West Wing Residences', location: 'Sta. Rosa, Laguna', category: 'Town House', estate: 'Eton City', developer: 'Belton Communities, Inc.', subsidiaryOf: 'Eton Properties', source: 'user', note: 'North Belton Communities.' },
                { name: 'West Wing Villas', location: 'Sta. Rosa, Laguna', category: 'House and Lot', estate: 'Eton City', developer: 'Belton Communities, Inc.', subsidiaryOf: 'Eton Properties', source: 'user' },
                { name: 'Tierrabela', aliases: ['Tierrabela at Eton City'], location: 'Sta. Rosa, Laguna', category: 'House and Lot', estate: 'Eton City', source: 'user' },

                // ── Office / BPO (residential:false — matched, category-filtered) ──
                { name: 'Cyberpod Centris', aliases: ['Cyberpod One', 'Cyberpod Two', 'Cyberpod Three', 'Cyberpod Four', 'Cyberpod Five'], location: 'Eton Centris, Quezon City', category: 'Office', projectType: 'office', residential: false, estate: 'Eton Centris', source: 'user', note: 'BPO office cluster (multiple Cyberpods).' },
                { name: 'eWestPod', location: 'Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Eton WestEnd Square', source: 'user', note: 'BPO building within Eton WestEnd Square.' },
                { name: 'Eton Cyberpod Corinthian', location: 'Ortigas Avenue / EDSA', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'NXTower', aliases: ['Eton Nexus Tower', 'Eton NXT Tower'], location: 'Ortigas Center, Pasig', category: 'Office', projectType: 'office', residential: false, source: 'user' },
            ],
            landmarks: [
                { name: 'Centris Walk', aliases: ['Centris Station', 'Centris Elements', 'Elements at Eton Centris'], developer: 'Eton Properties', estate: 'Eton Centris', location: 'Quezon City', matchable: false, source: 'user', note: 'Retail/events components of Eton Centris — context only.' },
                { name: 'eWestMall', developer: 'Eton Properties', estate: 'Eton WestEnd Square', location: 'Makati', matchable: false, source: 'user', note: 'Boutique mall in Eton WestEnd Square — context only.' },
                { name: 'Eton City Square', developer: 'Eton Properties', estate: 'Eton City', location: 'Sta. Rosa, Laguna', matchable: false, source: 'user', note: 'Retail complex within Eton City — context only.' },
                { name: 'Green Podium', developer: 'Eton Properties', location: 'Manila', matchable: false, source: 'user', note: 'Retail/commercial component — context only.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // PRIMARY HOMES, INC. (PHI) — Cebu/Bohol developer. Founded 1992 as
        // Commonwealth Estate, Inc. (JV of Primary Structures Corp. + MATIMCO, the
        // "Primary Group of Builders"); renamed Primary Homes 2009. DUAL-SOURCE
        // ingest (2026-08-14): user list + web. Many generic single-word names are
        // context-gated. Note the exact-only guard on "Astele" (≈ Alveo "Astela").
        // ═══════════════════════════════════════════════════════════════════
        'Primary Homes': {
            aliases: ['Primary Homes Inc', 'PrimaryHomes', 'PHI'],
            group: 'Primary Group',
            historicalJV: 'Primary Structures Corp. + MATIMCO (founding JV as Commonwealth Estate, Inc., 1992)',
            projects: [
                // ── Early / foundational ──
                { name: 'Villa del Rio', aliases: ['Villa del Rio I', 'Villa del Rio II', 'Villa del Rio 2'], location: 'Talamban / Pit-os, Cebu City', category: 'House and Lot', source: 'user', note: 'First project (1992), Mediterranean-inspired; ~400-unit flagship.' },
                { name: 'East Aurora Towers', location: 'Mabolo, Cebu City', category: 'Condominium', units: ['1BR', '2BR', '3BR', '4BR'], source: 'user', note: 'First vertical (1997).' },
                { name: 'Garden Bloom Villas', location: 'Liloan, Cebu', category: 'House and Lot', source: 'user', note: '~2007; multi-phase economic-scale.' },
                { name: 'Avalon', location: 'Cebu Business Park, Cebu City', category: 'Condominium', units: ['1BR', '3BR'], match: 'context', source: 'user', note: '~2010 high-rise. Generic name — context-gated.' },
                { name: 'Solare Subdivision', aliases: ['Solare'], location: 'Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },
                { name: 'Astele', location: 'Buyong Road, Mactan, Lapu-Lapu City', category: 'House and Lot', match: 'exact', source: 'user', note: 'Exact-only (fuzzy-off): edit-distance-1 near-twin of Alveo’s "Astela at Circuit Makati".' },
                { name: 'Collinwood', location: 'Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },
                { name: 'Pinecrest Residences', location: 'Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },

                // ── Condominiums / walk-ups / flats ──
                { name: 'Royal Oceancrest Mactan', location: 'Basak, Lapu-Lapu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Mixed-use/wellness.' },
                { name: 'Royal Oceancrest Mactan 2', location: 'Marigondon, Lapu-Lapu City', category: 'Condominium', units: ['1BR', '2BR'], source: 'user' },
                { name: 'Royal Oceancrest Panglao', location: 'Dauis, Bohol', category: 'Condominium', units: ['Studio', '1BR'], source: 'user' },
                { name: 'Royal Oceancrest Panglao 2', location: 'Dauis, Bohol', category: 'Condominium', units: ['1BR', '2BR'], source: 'user' },
                { name: 'Almond Drive', aliases: ['The Courtyards at Almond Drive'], location: 'Talisay City, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Brentwood', location: 'Basak, Lapu-Lapu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic name — context-gated.' },
                { name: 'Eagles’ Nest Condominium', aliases: ['Eagles Nest'], location: 'Canduman, Mandaue City', category: 'Condominium', units: ['Studio'], source: 'user', note: 'Loft units.' },
                { name: 'Woodcrest Residences', aliases: ['The Penthouses at Woodcrest'], location: 'Guadalupe, Cebu City', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Mabolo Garden Flats', location: 'Mabolo, Cebu City', category: 'Condominium', units: ['Studio'], source: 'user', note: 'Loft units.' },
                { name: 'The Courtyards at Brookridge', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Walk-up condo.' },
                { name: 'The Courtyards at Banawa', location: 'Banawa, Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Walk-up condo.' },
                { name: 'La Guardia Flats', aliases: ['La Guardia Flats 1', 'La Guardia Flats 2'], location: 'Lahug, Cebu City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user' },
                { name: '188 Sunflower Drive', location: 'V. Rama Ave, Cebu City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user' },
                { name: 'North Singson Flats', location: 'Guadalupe, Cebu City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user' },

                // ── Royal Palms series (house and lot) ──
                { name: 'Royal Palms Panglao', location: 'Dauis, Bohol', category: 'House and Lot', source: 'user', note: 'Series start ~2011–2012.' },
                { name: 'Royal Palms Tres', location: 'Bohol', category: 'House and Lot', source: 'user' },
                { name: 'Royal Palms Quatro', location: 'Dauis, Panglao, Bohol', category: 'House and Lot', source: 'user' },
                { name: 'Royal Palms Bohol', location: 'Dauis, Bohol', category: 'House and Lot', source: 'user' },
                { name: 'Royal Palms Toledo', location: 'Toledo City, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Argao Royal Palms', location: 'Argao, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Royal Palms Dos', location: 'Cebu / Bohol', category: 'House and Lot', source: 'user' },

                // ── Richwood Homes series (affordable) ──
                { name: 'Richwood Homes Compostela', location: 'Compostela, Cebu', category: 'Town House', source: 'user' },
                { name: 'Richwood Homes Bogo', location: 'Bogo City, Cebu', category: 'Town House', source: 'user' },
                { name: 'Richwood Homes Toledo', location: 'Toledo City, Cebu', category: 'Town House', source: 'user', note: 'Duplex options.' },
                { name: 'Richwood Homes Bohol Dos', location: 'Dauis, Bohol', category: 'Town House', source: 'user' },

                // ── Other / recent / pipeline ──
                { name: 'LaPrima Homes Tanjay', location: 'Tanjay City, Negros Oriental', category: 'Town House', source: 'user', note: 'Launched ~2025; townhouse/duplex/row house.' },
                { name: 'Colorado Homes', aliases: ['Colorado Dos', 'Colorado Bohol'], location: 'Liloan, Cebu / Baclayon, Bohol', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },
                { name: 'Brookfield', location: 'Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },
                { name: 'Alegria Palms', location: 'Cebu', category: 'House and Lot', source: 'user' },
                { name: 'South Glendale', location: 'Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic name — context-gated.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // MOLDEX REALTY, INC. — real-estate subsidiary of the Moldex Group of
        // Companies (founded 1987 by the Uy Family). DUAL-SOURCE ingest (2026-08-14):
        // user list + web. Manila high-rises (Grand Series) + MetroGate/Heritage
        // horizontal across Bulacan/Cavite/Pampanga/Laguna/Tagaytay.
        // ═══════════════════════════════════════════════════════════════════
        'Moldex Realty': {
            aliases: ['Moldex', 'Moldex Realty Inc'],
            group: 'Moldex',
            subsidiaryOf: 'Moldex Group of Companies',
            estates: [
                { name: 'Moldex New City', location: 'San Jose del Monte, Bulacan', type: 'Township', source: 'user', note: '~130-ha township (residential + commercial).' },
            ],
            projects: [
                // ── The Grand Series (high-rise condominiums) ──
                { name: '1322 Golden Empire Tower', aliases: ['1322 Roxas Boulevard', 'Golden Empire Tower'], location: 'Roxas Boulevard cor Padre Faura, Manila', category: 'Condominium', units: ['3BR', '4BR'], source: 'authoritative', confidence: 'High', note: '57-storey flagship, tallest on Roxas Blvd.' },
                { name: 'The Grand Towers Manila', aliases: ['Grand Towers Manila'], location: 'Pablo Ocampo Sr. St (Vito Cruz), Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Twin towers.' },
                { name: 'Grand Riviera Suites', location: 'Padre Faura, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: '55-storey.' },
                { name: 'Grand View Tower', location: 'Gil Puyat Ave / Leveriza, Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: '46-storey mixed-use.' },

                // ── Moldex Residences (mid-rise) ──
                { name: 'Moldex Residences Baguio', location: 'Marcos Highway, Baguio City', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR'], towers: ['Aspen', 'Bariloche', 'Carezza', 'Davos', 'Folgaria', 'Groden', 'Essen'], source: 'user', note: 'Building names kept as metadata.' },
                { name: 'Moldex Residences Valenzuela', location: 'Valenzuela', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR'], source: 'user' },
                { name: 'Moldex Residences Silang', location: 'Silang, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['1BR', '2BR'], towers: ['Claremont'], source: 'user' },

                // ── MetroGate subdivisions (horizontal) ──
                { name: 'MetroGate Complex', location: 'Meycauayan, Bulacan', category: 'House and Lot', source: 'user', note: 'First major project (~1988).' },
                { name: 'MetroGate San Jose', location: 'San Jose del Monte, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Meycauayan II', location: 'Meycauayan / Marilao, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate North Villas', location: 'Norzagaray, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Angeles', location: 'Angeles, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Spring Meadows', location: null, category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Silang Estates', location: 'Silang, Cavite', category: 'House and Lot', towers: ['Fern Parc'], source: 'user', note: '~250-ha township/ecopolis; phases incl. Fern Parc.' },
                { name: 'MetroGate Trece Martires', location: 'Trece Martires, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Tagaytay Estates', aliases: ['MetroGate Centara Tagaytay', 'MetroGate Tagaytay Manors'], location: 'Tagaytay, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Indang', location: 'Indang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Dasmariñas', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Primavera', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Sta. Rosa', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'MetroView Ridge Estates', location: null, category: 'House and Lot', source: 'user' },
                { name: 'MetroGate Villas', location: null, category: 'House and Lot', source: 'user' },

                // ── Heritage Homes / Villas (affordable horizontal) ──
                { name: 'Heritage Homes Marilao', location: 'Marilao, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'Heritage Homes Trece Martires', location: 'Trece Martires, Cavite', category: 'House and Lot', source: 'user', note: 'Incl. Phase 2A.' },
                { name: 'Heritage Spring Homes', location: 'Silang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Heritage Villas Angeles', location: 'Angeles, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Heritage Villas at San Jose', location: 'San Jose del Monte, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'Villa Caceres', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Alegria @ Dos Rios', aliases: ['Alegria at Dos Rios'], location: null, category: 'House and Lot', source: 'user' },
            ],
        },

        // ── Century Properties (Century City + PHirst) ──
        'Century Properties': {
            aliases: ['Century Properties Group', 'PHirst', 'PHirst Park Homes'],
            group: 'Century',
            estates: [
                { name: 'Century City', location: 'Makati', type: 'Mixed-use estate' },
            ],
            projects: [
                // ── Century City (Makati) ──
                { name: 'Gramercy Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Century City', note: 'Penthouse units.' },
                { name: 'Knightsbridge Residences', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Century City' },
                { name: 'Milano Residences', aliases: ['Milano Tower'], location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Century City', note: 'Penthouse units.' },
                { name: 'Trump Tower Philippines', aliases: ['Trump Tower at Century City'], location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Century City', note: 'Penthouse units.' },
                { name: 'Century Spire', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Century City', note: 'Residential + office.' },
                { name: 'Centuria Medical Makati', location: 'Makati', category: 'Office', projectType: 'office', residential: false, estate: 'Century City', note: 'Medical office building.' },

                // ── Azure Urban Resort Residences (Parañaque) — place-named towers
                //    kept as metadata; NEVER fed (Rio/Miami/Boracay would false-match). ──
                { name: 'Azure Urban Resort Residences', aliases: ['Azure Urban Resort'], location: 'Parañaque', category: 'Condominium', projectType: 'parent_development', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Rio', 'Santorini', 'St. Tropez', 'Positano', 'Miami', 'Maui', 'Maldives', 'Boracay', 'Bahamas'], note: 'Multi-building resort community (man-made beach).' },

                // ── Acqua Private Residences (Mandaluyong) — waterfall-named towers ──
                { name: 'Acqua Private Residences', location: 'Mandaluyong', category: 'Condominium', projectType: 'parent_development', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Niagara', 'Sutherland', 'Dettifoss', 'Yosemite', 'Victoria', 'Livingstone', 'Iguazu'], note: 'Also The Hotel Residences at Acqua, Acqua Town Villas / NuLiv Townvillas.' },

                // ── Azure North (San Fernando, Pampanga) ──
                { name: 'Azure North', aliases: ['The Resort Residences at Azure North'], location: 'San Fernando, Pampanga', category: 'Condominium', projectType: 'parent_development', units: ['Studio', '1BR', '2BR', '3BR'], towers: ['Monaco', 'Bali', 'Barbados'] },
                { name: 'Azure North Townvillas', location: 'San Fernando, Pampanga', category: 'Town House' },

                // ── Other vertical residential ──
                { name: 'The Residences at Commonwealth by Century', aliases: ['The Residences at Commonwealth'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'] },
                { name: 'Quirino East', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'] },

                // ── Horizontal / affordable (Century) ──
                { name: 'Canyon Ranch', location: 'Carmona, Cavite', category: 'House and Lot', note: 'Phases incl. Moderno.' },
                { name: 'Commune Village at Batulao', location: 'Nasugbu, Batangas', category: 'House and Lot' },
                { name: 'Cerulean Residences', location: 'General Trias, Cavite', category: 'House and Lot' },

                // ── PHirst Park Homes (Century × Mitsubishi JV — flagged, not yet verified) ──
                { name: 'PHirst Park Homes', location: null, category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation', historicalJVShareholding: '60% Century / 40% Mitsubishi', historicalJVEnd: 2023, note: 'Now a WHOLLY-OWNED Century subsidiary — CPG acquired Mitsubishi’s 40% stake in 2023 (est. 2018 as a 60/40 Century–Mitsubishi JV; the JV is historical, not current). Series across Tanza/Naic/General Trias, Lipa/Nasugbu, San Pablo/Calamba/Bay, Pandi/Baliwag, Magalang, Tayabas, Balanga/Hermosa, etc.' },
                { name: 'PHirst Editions Batulao', location: 'Nasugbu, Batangas', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)' },
                { name: 'PHirst Sights Bay', location: 'Bay, Laguna', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)' },
                { name: 'PHirst Sights Calauan', location: 'Calauan, Laguna', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)' },
                { name: 'PHirst Centrale Hermosa', location: 'Hermosa, Bataan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)' },
                { name: 'PHirst Impressions', location: 'Bataan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)' },
                { name: 'PHirst Fairgrounds', location: 'Bataan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', source: 'authoritative', confidence: 'High', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', note: 'Mixed-use w/ townhouses + commercial lots.' },

                // ── PHirst expansion (2026-08-14): ~19 additional sites appended to the
                //    SAME PHirst Park Homes Inc. entity (subsidiaryOf Century; historical
                //    Century×Mitsubishi JV ended 2023). Site existence = source:'user';
                //    developer attribution authoritative-by-brand. No duplicate key; the
                //    7 pre-existing PHirst records above are NOT re-created. ──
                { name: 'PHirst Park Homes Tanza', location: 'Tanza, Cavite', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user', note: 'Maiden project, along Governor’s Drive.' },
                { name: 'PHirst Park Homes Gen Tri', aliases: ['PHirst Park Homes Gentri'], location: 'General Trias, Cavite', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Impressions Gen Tri', location: 'Biclatan, General Trias, Cavite', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Batulao', location: 'Nasugbu, Batangas', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Impressions Batulao', aliases: ['PHirst Centrale Batulao'], location: 'Nasugbu, Batangas', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Lipa', location: 'San Lucas, Lipa, Batangas', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user', note: 'Near LIMA Techno Park.' },
                { name: 'PHirst Park Homes Sto. Tomas', location: 'Sto. Tomas, Batangas', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Calamba', location: 'Palo Alto, Calamba, Laguna', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes San Pablo', location: 'San Ignacio, San Pablo, Laguna', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes San Pablo East', location: 'San Pablo, Laguna', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Pandi', location: 'Poblacion, Pandi, Bulacan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Baliwag', location: 'Makinabang, Baliwag, Bulacan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Magalang', location: 'Magalang, Pampanga', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Magalang East', location: 'Magalang, Pampanga', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Gapan', location: 'Gapan, Nueva Ecija', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Balanga', location: 'Balanga, Bataan', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Sights Tayabas', location: 'Tayabas, Quezon', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes Bacolod', location: 'Vista Alegre, Bacolod, Negros Occidental', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user' },
                { name: 'PHirst Park Homes GenSan', aliases: ['PHirst Park Homes Gen San'], location: 'Baluan, General Santos City', category: 'House and Lot', developer: 'PHirst Park Homes Inc.', subsidiaryOf: 'Century Properties Group Inc.', historicalJV: 'Century Properties Group Inc. + Mitsubishi Corporation (ended 2023)', source: 'user', note: 'First Mindanao project.' },

                // ── Meridien Group — founding principals' PRIOR firm (NOT Century) ──
                { name: 'Essensa East Forbes', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', note: 'Founding principals’ prior firm; not Century Properties Group. Penthouse units.' },
                { name: 'South of Market', location: 'BGC, Taguig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', match: 'context', note: 'Meridien (pre-2010). Generic phrase ("south of market" / SoMa) — context-gated.' },
                { name: 'SOHO Central', location: 'Greenfield District, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Meridien Group of Companies', historical: true, jv: 'Century Properties Group + Meridien Group + Greenfield Development Corporation', source: 'authoritative', confidence: 'High', match: 'context', note: 'Meridien (pre-2010). 2004/2009 JV among Century Properties, Meridien, and Greenfield Development Corp (within Greenfield District). Historical Meridien role preserved; JV metadata added. "SoHo" is an area name — context-gated.' },
                { name: 'Pacific Place', location: 'Ortigas', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', match: 'context', note: 'Meridien (pre-2010). Generic ("pacific place") — context-gated.' },
                { name: 'Le Triomphe', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', note: 'Meridien (pre-2010).' },
                { name: 'Le Domaine', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', note: 'Meridien (pre-2010).' },
                { name: 'Le Metropole', location: 'Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], developer: 'Meridien Group of Companies', historical: true, source: 'authoritative', confidence: 'High', note: 'Meridien (pre-2010).' },

                // ── Office / commercial ──
                { name: 'Asian Century Center', location: 'BGC, Taguig', category: 'Office', projectType: 'office', residential: false },
                { name: 'Century Diamond Tower', location: 'Makati', category: 'Office', projectType: 'office', residential: false },
            ],
            landmarks: [
                { name: 'Century City Mall', developer: 'Century Properties', estate: 'Century City', location: 'Makati', matchable: false, source: 'user', note: 'Retail in Century City — context only.' },
                { name: 'Novotel Suites Manila', developer: 'Century Properties', location: 'Quezon City', matchable: false, source: 'user', note: 'Hotel/serviced-residences — context only.' },
            ],
            note: 'Mixed-use (Century City) + resort-style condo communities (Azure/Acqua) + PHirst affordable JV. Meridien projects are the founders’ prior firm, attributed to Meridien.',
        },

        // ── Shang Properties (premium vertical; no large township) ──
        // Kuok Group's PH property arm. Premium vertical developments concentrated
        // in the Shang Central estate (Ortigas/Mandaluyong), Makati villages, BGC,
        // QC and now Cebu. Two current projects (Aurelia, Haraya) are built by the
        // Shang × Robinsons Land JV entity, Shang Robinsons Properties, Inc. — the
        // actual development entity, so it stays as `developer` (partners in `jv`),
        // mirroring the RHK Land and RLC DMCI Property Ventures patterns.
        //
        // DUAL-SOURCE (2026-08-14): user-supplied + web-verified reconciled. Unit
        // mixes below are USER-supplied (medium confidence) unless a web source is
        // cited; developer/location/entity-type attributions are web-authoritative.
        'Shang Properties': {
            aliases: ['Shang Properties Inc', 'Shang'],
            group: 'Shang',
            estates: [
                // Shang Central — Shang's mixed-use master estate in Ortigas Center,
                // Mandaluyong (EDSA): anchors One Shangri-La Place, St. Francis,
                // Laya + Shangri-La Plaza mall + EDSA Shangri-La Hotel. Reclassified
                // project→estate on dual-source reconciliation (user + web agree).
                { name: 'Shang Central', location: 'Ortigas Center, Mandaluyong', type: 'Mixed-use estate', developer: 'Shang Properties', source: 'authoritative', confidence: 'High', note: 'Integrated luxury mixed-use cluster on EDSA; anchors One Shangri-La Place, The St. Francis Shangri-La Place, Laya, Shangri-La Plaza mall & EDSA Shangri-La Hotel. Confirmed by user + web.' },
                // Mixed-use complex at BGC (hotel + Horizon Homes residences +
                // retail). Container so the generic-named Horizon Homes gates on it.
                { name: 'Shangri-La at the Fort', location: 'BGC, Taguig', type: 'Mixed-use estate', developer: 'Shang Properties', source: 'authoritative', note: 'Hotel + residences (Horizon Homes) + retail; 30th St cor 5th Ave, BGC. SPI holds interest.' },
            ],
            projects: [
                // ── Shang Central (Ortigas Center, Mandaluyong) ──
                { name: 'One Shangri-La Place', location: 'Ortigas Center, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Shang Central', source: 'authoritative', confidence: 'High', note: 'Twin 64-storey towers (1,304 units) atop a 6-level mall podium; ₱11B, Shang’s biggest completed project; across EDSA Shangri-La Hotel. Penthouse units. Unit mix user-supplied.' },
                { name: 'The St. Francis Shangri-La Place', aliases: ['St. Francis Shangri-La Place'], location: 'Ortigas Center, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Shang Central', source: 'authoritative', confidence: 'High', note: 'Twin ~60-storey towers within the Shang Central estate. Penthouse units. Unit mix user-supplied.' },
                { name: 'Laya by Shang Properties', aliases: ['Laya Residences'], location: 'Ortigas Center, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Shang Central', source: 'authoritative', confidence: 'High', note: 'Ongoing; 1,283 units. Bare "Laya" (4 chars) is not fed — too short. Unit mix user-supplied.' },

                // ── Makati ──
                { name: 'The Shang Grand Tower', aliases: ['Shang Grand Tower'], location: 'Legaspi Village, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', note: 'Shang’s first residential condo (46-storey, completed 2002); Perea cor Dela Rosa St. Penthouse units. Unit mix user-supplied.' },
                { name: 'Shang Salcedo Place', aliases: ['Shang Salcedo'], location: 'Salcedo Village, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', note: '67-storey, 749 units; Gil Puyat cor H.V. dela Costa. Penthouse units. Unit mix confirmed by both.' },
                { name: 'The Rise Makati', location: 'Malugay, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', note: '59-storey. Canonical kept as "The Rise Makati" (bare "The Rise" too generic to feed). Unit mix user-supplied.' },

                // ── BGC / Taguig ──
                { name: 'Horizon Homes', location: 'BGC, Taguig', category: 'Condominium', units: ['2BR', '3BR'], estate: 'Shangri-La at the Fort', match: 'context', source: 'authoritative', confidence: 'High', note: '98 luxury dwellings at Shangri-La at the Fort. Penthouse units. Generic name ("horizon homes") — context-gated; distinct from Federal Land’s "Horizon Land" alias. Unit mix user-supplied.' },
                { name: 'Aurelia Residences', location: 'BGC, Taguig', category: 'Condominium', units: ['2BR', '3BR', '4BR'], estate: 'Bonifacio Global City', developer: 'Shang Robinsons Properties, Inc.', jv: 'Shang Properties + Robinsons Land', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: '285 bespoke units; McKinley Parkway cor 5th Ave & 21st Dr, BGC. Shang × RLC JV entity (Shang Robinsons Properties, Inc.) is the developer; first project of the JV. Penthouse units. Unit mix user-supplied.' },

                // ── Bridgetowne (Pasig/QC) — same Shang × RLC JV ──
                { name: 'Haraya Residences', location: 'Bridgetowne, Pasig', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Bridgetowne', developer: 'Shang Robinsons Properties, Inc.', jv: 'Shang Properties + Robinsons Land', subsidiaryOf: null, source: 'authoritative', confidence: 'High', towers: ['South Tower', 'North Tower'], note: 'Second Shang × RLC JV project; dual towers (South 533 units, North 362) within Bridgetowne Destination Estate. "Vertical gated village" concept. Unit mix user-supplied.' },

                // ── Quezon City ──
                { name: 'Shang Summit', location: 'South Triangle, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', note: 'Shang’s first QC residential; dual towers, billed as among the tallest PH residential. Unit mix user-supplied.' },

                // ── Mandaluyong (Wack Wack) ──
                { name: 'Shang Residences at Wack Wack', location: 'Mandaluyong', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', note: '50-storey, 404 units. Penthouse units. Full name kept (bare "Wack Wack" is an Ortigas residential-village estate, not this project). Unit mix user-supplied.' },

                // ── Cebu ──
                { name: 'Shang Bauhinia Residences', aliases: ['Shang Bauhinia'], location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'authoritative', confidence: 'High', towers: ['Shang Bauhinia Residences', 'Shang Bauhinia Signature'], note: 'Shang’s first Cebu development; 52-storey along Bauhinia Dr (Brgy. Kasambagan / Banilad area), near Cebu Business Park / Cebu IT Park. Dual-residence concept (Residences + Signature units); ~1,000+ units. Penthouse units. Unit mix user-supplied.' },

                // ── Office / commercial (residential:false — matched, category-filtered) ──
                // KSA Realty Corp (not Shang directly) is the owner/developer — a JV
                // where the Kuok Group (via Shang Properties, 70%) is majority, with
                // ING and A. Soriano Corp (ANSCOR). Attribution corrected on
                // reconciliation: user flagged "via KSA Realty"; web-confirmed.
                { name: 'The Enterprise Center', location: 'Ayala Avenue, Makati', category: 'Office', projectType: 'office', residential: false, developer: 'KSA Realty Corporation', jv: 'Kuok Group/Shang Properties (70%) + ING + A. Soriano Corp (ANSCOR)', subsidiaryOf: null, source: 'authoritative', confidence: 'High', note: 'Twin-tower Ayala Ave office (opened 1999). Owned/developed by KSA Realty Corp, NOT Shang directly; Shang holds 70% of KSA. Confirmed by user + web.' },
            ],
            landmarks: [
                { name: 'Shangri-La Plaza', aliases: ['Shangri-La Plaza Mall', 'Shang Plaza'], developer: 'Shangri-La Plaza Corporation', subsidiaryOf: 'Shang Properties', estate: 'Shang Central', location: 'Ortigas Center, Mandaluyong', matchable: false, source: 'authoritative', note: 'Retail anchor of the Shang Central estate — location context only, never a project match.' },
                // Assembly Grounds at The Rise — reclassified project→landmark on
                // dual-source reconciliation: user + Shang's own /malls/ page confirm
                // it is a two-storey RETAIL mall at The Rise, not a residence.
                { name: 'Assembly Grounds at The Rise', aliases: ['Assembly Grounds'], developer: 'Shang Properties', location: 'Malugay, Makati', matchable: false, source: 'authoritative', note: 'Two-storey retail/community mall serving The Rise Makati (opened 2019) — context only, never a project match. Was mis-ingested as a condo; corrected.' },
            ],
            note: 'Premium vertical developments (Shang Central estate in Ortigas, Makati villages, BGC, QC, Cebu) rather than large townships. Aurelia + Haraya are built by the Shang × RLC JV (Shang Robinsons Properties, Inc.). The Enterprise Center is owned via KSA Realty Corp (Shang 70%). Dual-source reconciled 2026-08-14.',
        },

        // ── Cebu Landmasters (Visayas/Mindanao focus) ──
        // ── Cebu Landmasters, Inc. (CLI) — listed Visayas-Mindanao developer ──
        // Chairman/CEO Jose Soberano III. DUAL-SOURCE ingest (2026-08-14). JV entities:
        // The Wave Towers = CLI NUD Ventures Inc. (CLI × NTT UD Asia); a Mandaue mid-
        // market condo = Aboitiz CLI Cebu Developers Inc. (CLI × AboitizLand) — the
        // specific named project isn’t resolved from sources, so that JV is FLAGGED
        // at the key level rather than assigned to a guessed project.
        'Cebu Landmasters': {
            aliases: ['Cebu Landmasters Inc', 'CLI'],
            group: 'Cebu Landmasters',
            note: 'Listed (PSE: CLI) Visayas-Mindanao developer; chairman/CEO Jose Soberano III. AboitizLand JV via Aboitiz CLI Cebu Developers Inc. (Mandaue mid-market condo) — specific project UNRESOLVED/FLAGGED, not assigned by guess.',
            estates: [
                { name: 'Davao Global Township', location: 'Davao City', type: 'Township', developer: 'Cebu Landmasters', source: 'authoritative', confidence: 'High', note: 'Multi-award mixed-use township (holds East/West Village Towers).' },
                { name: 'Manresa Town', location: 'Cagayan de Oro', type: 'Township', developer: 'Cebu Landmasters', source: 'user', note: 'Educationally-integrated township (holds One Manresa Place).' },
                { name: 'Pristina Town', location: 'Talamban, Cebu City', type: 'Township', developer: 'Cebu Landmasters', source: 'user', note: 'Micro-township. Distinct from AboitizLand’s Pristina North (also Talamban).' },
                { name: 'Liloan Estate', location: 'Liloan, Cebu', type: 'Township', developer: 'Cebu Landmasters', source: 'user', note: 'Planned mixed-use township.' },
                { name: 'Astra Centre', aliases: ['Astra Lifestyle Centre'], location: 'Mandaue, Cebu', type: 'Mixed-use estate', developer: 'Cebu Landmasters', source: 'user', note: 'Mixed-use (retail/hotel/office); holds One Astra Place + Radisson RED.' },
                { name: 'The Paragon Davao', location: 'Davao City', type: 'Mixed-use estate', developer: 'Cebu Landmasters', source: 'user', note: 'Mixed-use (residential/mall/hotel); holds One Paragon Place + Citadines.' },
            ],
            projects: [
                // ── Socialized / foundational ──
                { name: 'San Josemaria Village', aliases: ['San Jose Maria Villages'], location: 'Balamban / Talisay, Cebu', category: 'House and Lot', source: 'user', note: 'Inaugural project (~2003).' },
                { name: 'Villa Casita North', location: 'Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Villa Casita Balamban', location: 'Balamban, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Guadalupe Pinamalayan Socialized Housing', location: 'Pinamalayan, Oriental Mindoro', category: 'House and Lot', source: 'user' },
                { name: 'Walk-Up Sugbo 1 Residences', location: 'Cebu City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], source: 'user', note: 'Socialized medium-rise.' },
                { name: 'Tipolo Residences', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: 'Socialized. Distinct from 8990 Urban Deca Homes Tipolo.' },
                // ── Casa Mira (economic horizontal) ──
                { name: 'Casa Mira Linao', location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira South', location: 'Naga / San Fernando, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Coast', location: 'Negros Oriental', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Homes Dumaguete', location: 'Dumaguete', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Bacolod', location: 'Bacolod', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Iloilo', location: 'Iloilo', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Danao', location: 'Danao, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Davao', aliases: ['Casa Mira Homes Davao'], location: 'Davao City', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Homes Gensan', location: 'General Santos City', category: 'House and Lot', source: 'user' },
                { name: 'Casa Mira Homes Butuan', location: 'Butuan', category: 'House and Lot', source: 'user' },
                // ── Casa Mira Towers (economic vertical) ──
                { name: 'Casa Mira Towers Labangon', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Casa Mira Towers CDO', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Casa Mira Towers Mandaue', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Casa Mira Towers Guadalupe', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Casa Mira Towers LPU Davao', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Within LPU Town Center.' },
                { name: 'Casa Mira Towers Bacolod', location: 'Bacolod', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Casa Mira Towers Palawan', location: 'Palawan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Costa Mira Beachtown Mactan', aliases: ['Casamira Beach Town'], location: 'Mactan, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Beach series; multi-tower + house-and-lot.' },
                { name: 'Costa Mira Palawan', location: 'Palawan', category: 'House and Lot', source: 'user' },
                // ── Velmiro / Midori / Mirani (mid-market horizontal) ──
                { name: 'Midori Plains', location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Heights', location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Heights Consolacion', location: 'Consolacion, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Heights Davao', location: 'Davao City', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Uptown CDO', aliases: ['Velmiro Heights CDO'], location: 'Cagayan de Oro', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Plains Bacolod', location: 'Bacolod', category: 'House and Lot', source: 'user' },
                { name: 'Velmiro Homes', location: null, category: 'House and Lot', source: 'user', note: 'Series (Cebu/CDO/Bacolod/Bohol).' },
                { name: 'Mirani Steps Danao', location: 'Danao, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Mirani Homes', location: 'Bogo City, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Mirani Steps Butuan', location: 'Butuan', category: 'House and Lot', source: 'user' },
                // ── Condominiums (Garden series & premier) ──
                { name: 'Asia Premier Residences', location: 'Asiatown IT Park, Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'First vertical (~2010–2011).' },
                { name: 'Base Line Residences', aliases: ['Base Line Premier', 'Base Line Prestige'], location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Midori Residences', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'exact', source: 'user', note: 'Distinct from Federal Land’s Grand Midori. Exact-only (fuzzy-off): "modern residences" was fuzzy-colliding (edit-distance 3).' },
                { name: 'Mivesa Garden Residences', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Mivela Garden Residences', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'MesaVerte Garden Residences', aliases: ['MesaVerte Residences'], location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'MesaTierra Garden Residences', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'MesaVirre Garden Residences', location: 'Bacolod', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Towers A & B.' },
                { name: 'Mandtra Residences', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Mindara Residences', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The East Village Towers', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Davao Global Township', source: 'user' },
                { name: 'The West Village Towers', aliases: ['The West Village'], location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Davao Global Township', source: 'user' },
                { name: 'Calle 104', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Ramos/Ranudo Towers.' },
                { name: '38 Park Avenue', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Distinct from Federal Land’s Park Avenue (BGC).' },
                { name: 'One Astra Place', location: 'Mandaue, Cebu', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Astra Centre', source: 'user' },
                { name: 'One Paragon Place', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'The Paragon Davao', source: 'user' },
                { name: 'One Manresa Place', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Manresa Town', source: 'user' },
                { name: 'The Wave Towers', location: 'Cebu IT Park, Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'CLI NUD Ventures Inc.', jv: 'Cebu Landmasters + NTT Urban Development (Asia)', subsidiaryOf: null, source: 'authoritative', confidence: 'High', towers: ['Nagomi'], note: 'CLI × NTT UD Asia JV entity CLI NUD Ventures Inc.; Cebu’s first Japanese-inspired residential landmark (₱9.2B Ph1).' },
                { name: 'Alto Ranudo', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                // ── Office / commercial (residential:false) ──
                { name: 'Park Centrale Tower', location: 'Cebu IT Park, Cebu City', category: 'Office', projectType: 'office', residential: false, source: 'user', note: 'CLI headquarters.' },
                { name: 'Latitude Corporate Center', location: 'Cebu City', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Base Line Center', location: 'Cebu City', category: 'Office', projectType: 'office', residential: false, source: 'user', note: 'Mixed-use commercial elements.' },
            ],
            landmarks: [
                { name: 'Astra Mall', developer: 'Cebu Landmasters', estate: 'Astra Centre', location: 'Mandaue, Cebu', matchable: false, source: 'user', note: 'Retail — context only.' },
                { name: 'Radisson RED Cebu', developer: 'Cebu Landmasters', estate: 'Astra Centre', location: 'Mandaue, Cebu', matchable: false, source: 'user', note: 'Hotel (Astra Centre) — context only.' },
                { name: 'Citadines Cebu City', aliases: ['Citadines Bacolod City', 'Citadines Paragon Davao'], developer: 'Cebu Landmasters', location: 'Cebu / Bacolod / Davao', matchable: false, source: 'user', note: 'Ascott serviced residences (operated) — context only.' },
                { name: 'lyf Cebu City', developer: 'Cebu Landmasters', location: 'Cebu City', matchable: false, source: 'user', note: 'Ascott co-living (operated) — context only.' },
                { name: 'Abaca Resort Mactan', aliases: ['Mercure Cebu Downtown', 'Sofitel Cebu'], developer: 'Cebu Landmasters', location: 'Cebu', matchable: false, source: 'user', note: 'Hospitality components — context only.' },
            ],
        },

        // ── 8990 Holdings / Deca Homes (mass housing) ──
        // ── 8990 Holdings, Inc. (Deca Homes / Urban Deca) ──
        // DUAL-SOURCE ingest (2026-08-14): user list + web. Listed parent develops via
        // SPV subsidiaries (Fog Horn, Tondo Holdings, 8990 Luzon, 8990 Davao/Mindanao).
        // PER-PROJECT SPV attribution is provenance-audited: authoritative only where
        // web-confirmed at project level; otherwise source:'user'. The subsidiary
        // structure being verified does NOT upgrade project-level attribution. Generic
        // sites keep developer = '8990 Holdings' (group) — no inferred SPV.
        '8990 Holdings': {
            aliases: ['8990 Housing', '8990', 'Deca Homes', '8990 Housing Development Corporation'],
            group: '8990',
            estates: [],
            projects: [
                // ── Horizontal (Deca Homes) ──
                { name: 'Villa Candida', location: 'Cagayan de Oro', category: 'House and Lot', source: 'user', note: 'Early project.' },
                { name: 'Deca Homes Cabantian', location: 'Davao City', category: 'House and Lot', source: 'user' },
                { name: 'Deca Homes Bacayan', location: 'Cebu City', category: 'House and Lot', source: 'user', note: 'Early Cebu project.' },
                { name: 'Deca Homes Baywalk Talisay', aliases: ['Deca Homes Baywalk Talisay 1', 'Deca Homes Baywalk Talisay 2', 'Deca Homes Baywalk Talisay 3'], location: 'Talisay, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Savannah Greenplains Subdivision', aliases: ['Savannah Greenplains Subdivision 2', 'Savannah Greenplains Subdivision 3'], location: 'Iloilo', category: 'House and Lot', developer: 'Fog Horn, Inc.', subsidiaryOf: '8990 Holdings', source: 'user', note: 'SPV per user dataset (Fog Horn) — not individually web-confirmed.' },
                { name: 'Bella Vista Subdivision', location: null, category: 'House and Lot', developer: '8990 Luzon Housing Development Corporation', subsidiaryOf: '8990 Holdings', source: 'user', note: 'SPV per user dataset (8990 Luzon) — not individually web-confirmed.' },
                { name: 'Deca Homes Tanza', location: 'Tanza, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Deca Homes Marseilles', location: null, category: 'House and Lot', source: 'user' },
                { name: 'Deca Homes Marilao', aliases: ['Deca Homes Marilao Extension'], location: 'Marilao, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'Deca Clark Resort Residences', aliases: ['Deca Clark Resort Residences 12'], location: 'Clark / Angeles, Pampanga', category: 'House and Lot', source: 'user', note: 'Multi-phase.' },
                { name: 'Deca Homes Meycauayan', location: 'Meycauayan, Bulacan', category: 'House and Lot', developer: 'Primex Land, Inc.', subsidiaryOf: '8990 Holdings', source: 'user', confidence: 'Low', note: 'SPV "Primex Land, Inc." per user dataset — NOT found in the 8990 filings I checked; existence/attribution FLAGGED/unverified.' },
                { name: 'Deca Homes Pampanga', location: 'Pampanga', category: 'House and Lot', source: 'user', note: 'Incl. socialized components.' },
                { name: 'Deca Homes Pavia Resort Residences', aliases: ['Pavia Resort Residences 2'], location: 'Pavia, Iloilo', category: 'House and Lot', source: 'user' },
                { name: 'Deca Homes Leganes', location: 'Leganes, Iloilo', category: 'House and Lot', source: 'user', note: 'Multi-site (Sites 1–5).' },
                { name: 'Deca Homes Ormoc', aliases: ['Gregoria Residences'], location: 'Ormoc', category: 'House and Lot', source: 'user' },
                { name: 'Deca Homes Resort Residences', location: 'Davao', category: 'House and Lot', source: 'user', note: 'Phases incl. 2a.' },
                { name: 'Deca Homes Granada 4PH', location: 'Bacolod City', category: 'House and Lot', source: 'user', note: 'Under Pambansang Pabahay para sa Pilipino Program.' },
                { name: 'Deca Homes Cabanatuan', location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot', source: 'user' },
                { name: 'Monterrazas de Cebu', location: 'Cebu City', category: 'House and Lot', developer: '8990 Holdings', source: 'authoritative', confidence: 'Medium', note: 'Web-confirmed as a project under a wholly-owned 8990 subsidiary (specific SPV name unresolved). Higher-end mountain resort community.' },

                // ── Medium-rise (Urban Deca Homes MRB) ──
                { name: 'Urban Deca Homes Tipolo', location: 'Mandaue, Cebu', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], developer: 'Fog Horn, Inc.', subsidiaryOf: '8990 Holdings', source: 'user', note: 'SPV per user dataset (Fog Horn).' },
                { name: 'Urban Deca Homes Tisa', aliases: ['Urban Deca Homes Tisa 2'], location: 'Cebu City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes H. Cortes', location: 'Mandaue, Cebu', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Campville', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Mahogany', location: 'Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Hampton', location: null, category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Marilao', location: 'Marilao, Bulacan', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Batangas', location: 'Batangas', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Banilad', location: 'Cebu City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },

                // ── High-rise (Urban Deca Towers HRB) ──
                { name: 'Urban Deca Towers EDSA', aliases: ['Urban Deca Tower EDSA'], location: 'EDSA, Mandaluyong', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR', '2BR'], developer: 'Fog Horn, Inc.', subsidiaryOf: '8990 Holdings', source: 'authoritative', confidence: 'High', note: 'Web-confirmed developed by Fog Horn, Inc.' },
                { name: 'Urban Deca Homes Manila', location: 'Vitas St, Tondo, Manila', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR', '2BR'], developer: 'Tondo Holdings Corporation', subsidiaryOf: '8990 Housing Development Corporation', source: 'authoritative', confidence: 'High', note: 'Web-confirmed: 8990 Housing bought Tondo Holdings specifically to develop this project.' },
                { name: 'Urban Deca Homes Ortigas', location: 'Ortigas Ave Extension, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Large multi-tower mid/high-rise complex.' },
                { name: 'Urban Deca Tower Cubao', location: 'Cubao, Quezon City', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Urban Deca Homes Commonwealth', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'LGU partnership elements (employees/ISFs).' },
                { name: 'Urban Deca Tower Banilad', location: 'Cebu City', category: 'Condominium', subtype: 'High-rise', units: ['Studio', '1BR', '2BR'], source: 'user' },

                // ── Other / related ──
                { name: 'Azalea Residences', location: 'Baguio', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', confidence: 'Low', note: 'Early hotel/timeshare-related; 8990-affiliation per user, location not independently verified.' },
                { name: 'Nila Residences', location: null, category: 'House and Lot', developer: 'Mont Property Group', subsidiaryOf: '8990 Holdings', source: 'user', note: 'Higher-end courtyard-villa concept; SPV per user dataset (Mont Property Group).' },
                { name: 'The Rise at Monterrazas de Cebu', aliases: ['Monterrazas Skypod'], location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Higher-end element within Monterrazas de Cebu.' },
            ],
            note: 'Large volume of affordable/socialized Deca Homes + Urban Deca communities nationwide. Develops via SPV subsidiaries; per-project SPV attribution provenance-audited (see per-record source/notes). Megawide (Urban Deca Homes Tondo) is a construction contractor, not a co-developer.',
        },

        // ═══════════════════════════════════════════════════════════════════
        // NEW SAN JOSE BUILDERS, INC. (NSJBI) — wholly Filipino-owned; est. 1986,
        // chairman Jose L. Acuzar. Victoria condo series + Metro Manila Hills
        // horizontal. DUAL-SOURCE ingest (2026-08-14): user list + web.
        // ═══════════════════════════════════════════════════════════════════
        'New San Jose Builders': {
            aliases: ['New San Jose Builders Inc', 'NSJBI', 'New San Jose'],
            group: 'New San Jose Builders',
            estates: [
                { name: 'Metro Manila Hills', location: 'Rodriguez (Montalban), Rizal', type: 'Residential estate', source: 'user', note: 'Horizontal masterplan; villages Theresa Heights / Victoria Villas / Townhomes / Isabelle Terraces.' },
            ],
            projects: [
                // ── Victoria condominium series ──
                { name: 'Victoria Towers', aliases: ['Victoria Towers ABC&D', 'Victoria Towers ABCD'], location: 'Timog / Panay, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Multi-tower.' },
                { name: 'Victoria de Manila', aliases: ['Victoria de Manila 1'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Manila 2', location: 'Taft cor Malvar, Malate, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Malate', location: 'Malate, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Morato', location: 'Tomas Morato, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Makati', location: 'Washington, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Fort Victoria', aliases: ['The Fort Victoria'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Bonifacio Global City', source: 'user', note: 'Flagship; 5th Ave BGC, multi-tower; loft configs.' },
                { name: 'Victoria Sports Tower Station 2', location: 'South Triangle, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Sports-themed; near GMA-Kamuning MRT.' },
                { name: 'Victoria Sports Tower Monumento', location: 'Monumento, Caloocan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Hidalgo', location: 'Quiapo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria de Valenzuela', aliases: ['Isabelle de Valenzuela'], location: 'Valenzuela', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Victoria Arts and Theater Tower', location: 'Timog, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Mixed-use with theater/cultural component.' },

                // ── Metro Manila Hills horizontal (Rodriguez, Rizal) ──
                { name: 'Theresa Heights', aliases: ['Metro Manila Hills Theresa Heights'], location: 'Rodriguez, Rizal', category: 'House and Lot', estate: 'Metro Manila Hills', match: 'context', source: 'user', note: 'Village within Metro Manila Hills; generic name — context-gated.' },
                { name: 'Victoria Villas', aliases: ['Metro Manila Hills Victoria Villas'], location: 'Rodriguez, Rizal', category: 'House and Lot', estate: 'Metro Manila Hills', match: 'context', source: 'user', note: 'Village within Metro Manila Hills; generic — context-gated.' },
                { name: 'Isabelle Terraces', aliases: ['Metro Manila Hills Isabelle Terraces'], location: 'Rodriguez, Rizal', category: 'Town House', estate: 'Metro Manila Hills', match: 'context', source: 'user', note: 'Village within Metro Manila Hills; generic — context-gated.' },
                { name: 'Metro Manila Hills Townhomes', location: 'Rodriguez, Rizal', category: 'Town House', estate: 'Metro Manila Hills', match: 'context', source: 'user', note: 'Bare "Townhomes" too generic — full name context-gated.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // CITYLAND DEVELOPMENT CORPORATION (CDC) — subsidiary of Cityland, Inc.
        // (parent holding; sister City & Land Developers, Inc.). Inc. 1978; known
        // for affordable/mid-market condos. DUAL-SOURCE ingest (2026-08-14).
        // residential:false reserved for genuinely non-residential (offices).
        // ═══════════════════════════════════════════════════════════════════
        'Cityland Development Corporation': {
            aliases: ['Cityland Development', 'Cityland', 'CDC'],
            group: 'Cityland',
            subsidiaryOf: 'Cityland, Inc.',
            projects: [
                // ── Early / mixed office-residential ──
                { name: 'First Cityland Condominium', location: 'Rada St, Legaspi Village, Makati', category: 'Condominium', projectType: 'residential_office', units: ['Studio', '1BR'], source: 'user', note: '~1980; 4-storey office/residential (mixed). residential:true.' },
                { name: 'Cityland Condominium II', location: 'Makati', category: 'Condominium', projectType: 'residential_office', units: ['Studio', '1BR'], source: 'user', note: '~1982; office/residential.' },

                // ── Makati Executive & Makati high-rise ──
                { name: 'Makati Executive Tower', aliases: ['Makati Executive Tower I', 'Makati Executive Tower II', 'Makati Executive Tower III', 'Makati Executive Tower IV'], location: 'Sen. Gil Puyat Ave, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Towers I–IV; mixed residential-office-commercial.' },
                { name: 'Cityland Dela Rosa', location: 'Dela Rosa, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Rada Regency', location: 'Legaspi Village, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Cityland Shaw Tower', location: 'Shaw, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },

                // ── Manila Residences ──
                { name: 'The Manila Residences Tower I', aliases: ['Manila Residences Tower I'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The Manila Residences Tower II', aliases: ['Manila Residences Tower II'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The Manila Residences Bocobo', aliases: ['Manila Residences Bocobo'], location: 'Jorge Bocobo St, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Manila Executive Regency', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },

                // ── Mandaluyong / Pioneer ──
                { name: 'Mandaluyong Executive Mansion', aliases: ['Mandaluyong Executive Mansion III'], location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Pines Peak Tower', aliases: ['Pines Peak Tower I', 'Pines Peak Tower II'], location: 'Pines St, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Grand Central Residences', aliases: ['Grand Central Residences Tower I'], location: 'Highway Hills, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR'], match: 'context', source: 'user', note: 'EDSA/Sultan; generic ("grand central") — context-gated.' },
                { name: 'Pioneer Heights', aliases: ['Pioneer Heights 1'], location: 'Pioneer St, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Mixed residential-commercial.' },
                { name: 'Cityland Pioneer', location: 'Pioneer St, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Citynet Central', aliases: ['Citynet 1', 'CityNet Central'], location: 'Wack-Wack / Sultan, Mandaluyong', category: 'Office', projectType: 'office', residential: false, source: 'user', note: 'Primarily office/commercial.' },

                // ── Quezon City & other ──
                { name: 'North Residences', location: 'Veterans Village, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: '101 Xavierville', location: 'Loyola Heights, Quezon City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: '40-storey mixed residential-commercial. Distinct from A Brown’s Xavierville Homes (CDO).' },
                { name: 'City North Tower', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: '50-storey mixed-use (~2024).' },
                { name: 'Alfaro Place', location: 'Salcedo Village, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Brentwood Mansion', location: 'Evangelista, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Distinct from Primary Homes’ "Brentwood" (Mactan).' },
                { name: 'Windsor Mansion', location: 'Evangelista, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic ("Windsor") — context-gated.' },
                { name: 'Grand Emerald Tower', location: 'Garnet St, Ortigas, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Mixed-use near SM Megamall.' },
                { name: 'Tagaytay Prime Residences', location: 'Tagaytay', category: 'House and Lot', source: 'user' },
                { name: 'One Premier', location: 'Alabang / Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', confidence: 'Low', note: 'Attribution per listings only; generic ("One Premier") — context-gated. FLAGGED for verification.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // LANDCO PACIFIC CORPORATION — leisure/seaside developer; wholly-owned
        // subsidiary of Metro Pacific Investments Corp. (MPIC / MVP group) since
        // 2022. Master-planned estates → projects → resort-condo units. DUAL-SOURCE
        // ingest (2026-08-14). Condotel/resort condos are residential:true.
        // ═══════════════════════════════════════════════════════════════════
        'Landco Pacific': {
            aliases: ['Landco Pacific Corporation', 'Landco'],
            group: 'Metro Pacific',
            subsidiaryOf: 'Metro Pacific Investments Corporation',
            estates: [
                { name: 'Punta Fuego', location: 'Nasugbu, Batangas', type: 'Leisure estate', source: 'authoritative', note: 'Seaside residential resort area (Peninsula + Terrazas de Punta Fuego).' },
                { name: 'CaSoBe', aliases: ['CaSoBē', 'Calatagan South Beach'], location: 'Calatagan, Batangas', type: 'Leisure estate', source: 'authoritative', note: 'Master-planned seaside leisure-tourism estate.' },
                { name: 'Club Laiya', location: 'Laiya, San Juan, Batangas', type: 'Leisure estate', source: 'authoritative', note: 'Seaside District + Premier District.' },
            ],
            projects: [
                // ── Punta Fuego ──
                { name: 'Peninsula de Punta Fuego', location: 'Nasugbu, Batangas', category: 'House and Lot', estate: 'Punta Fuego', source: 'authoritative', confidence: 'High', note: 'First private seaside residential resort in PH (~1990s); marina/golf/beach clubs.' },
                { name: 'Terrazas de Punta Fuego', location: 'Nasugbu, Batangas', category: 'House and Lot', estate: 'Punta Fuego', source: 'authoritative', confidence: 'High' },
                { name: 'The Residences at Terrazas de Punta Fuego', location: 'Nasugbu, Batangas', category: 'Condominium', subtype: 'Resort Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Punta Fuego', parentProjectId: 'Terrazas de Punta Fuego', source: 'user', note: 'Beachfront low-density condo clusters.' },

                // ── CaSoBe (Calatagan South Beach) ──
                { name: 'The Nautilus at CaSoBe', aliases: ['The Nautilus at CaSoBē', 'The Nautilus'], location: 'Calatagan, Batangas', category: 'Condominium', subtype: 'Resort Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'CaSoBe', source: 'authoritative', confidence: 'High', note: 'Resort condominium / condotel-style investment; individually owned units with rental leaseback. residential:true.' },

                // ── Club Laiya ──
                { name: 'The Spinnaker at Club Laiya', aliases: ['The Spinnaker'], location: 'Laiya, San Juan, Batangas', category: 'Condominium', subtype: 'Resort Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Club Laiya', source: 'authoritative', confidence: 'High', note: 'PRA-identified residential condominium; condotel-style investment. residential:true.' },

                // ── Seaside residential communities ──
                { name: 'Playa Calatagan', location: 'Calatagan, Batangas', category: 'House and Lot', source: 'user', note: 'Exclusive seaside residential community.' },
                { name: 'Playa Laiya', location: 'Laiya, San Juan, Batangas', category: 'House and Lot', source: 'user', note: 'Master-planned seaside community adjacent to Club Laiya.' },
                { name: 'Costa Azalea', aliases: ['Playa Azalea'], location: 'Samal, Davao', category: 'House and Lot', source: 'user', note: 'Resort estate (Island Garden City of Samal).' },

                // ── Inland leisure / residential ──
                { name: 'Woodridge Garden Village', location: 'Zamboanga City', category: 'House and Lot', source: 'user', note: 'Southern-Californian-inspired luxury community.' },
                { name: 'Leisure Farms', location: 'Lemery, Batangas', category: 'Residential Lot', match: 'context', source: 'user', note: 'Residential + hobby-farming; generic — context-gated.' },
                { name: 'Ponderosa Leisure Farms', location: 'Silang, Cavite', category: 'Residential Lot', source: 'user', note: 'Nature/hobby-farm community.' },
                { name: 'Hacienda Escudero', location: 'Tiaong, Quezon', category: 'Residential Lot', source: 'user' },
                { name: 'WoodGrove Park', location: 'San Fernando, Pampanga', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Waterwood Park', location: 'Baliuag, Bulacan', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'MonteLago Nature Estates', location: 'San Pablo, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'The Courtyard at Lakewood City', aliases: ['Lakewood Golf Estates'], location: 'Cabanatuan, Nueva Ecija', category: 'House and Lot', source: 'authoritative', confidence: 'Medium', note: 'Landco sub-project WITHIN Sta. Lucia’s Lakewood City. Sta. Lucia = main developer; Landco Pacific + Nueva Ecija Land Co. = landowner co-developers of the 155-ha community.' },
                { name: 'Stonecrest', location: 'San Pedro, Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Ridgewood Park Nature Estates', location: 'Lucena, Quezon', category: 'House and Lot', source: 'user', note: 'Earlier first-homes subdivision.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // ARTHALAND CORPORATION (PSE: ALCO) — listed boutique SUSTAINABLE developer.
        // Inc. 1994 as EIB Realty Developers, Inc.; renamed ArthaLand 2009. DUAL-
        // SOURCE ingest (2026-08-14): user list + web. Principal SHAREHOLDERS (CPG
        // Holdings/Po family + AO Capital) are ownership, NOT a company-level project
        // JV. Century Pacific Tower is ArthaLand-developed (name = historic site,
        // not a JV). Sondris is a CURRENT ArthaLand × Mitsui Fudosan JV via Zileya.
        // ═══════════════════════════════════════════════════════════════════
        'ArthaLand': {
            aliases: ['ArthaLand Corporation', 'Arthaland', 'ALCO', 'EIB Realty Developers'],
            group: 'ArthaLand',
            note: 'Listed boutique sustainable developer (PSE: ALCO); inc. 1994 as EIB Realty Developers, Inc., renamed 2009. Principal SHAREHOLDERS: CPG Holdings, Inc. (Po family) + AO Capital — shareholder ownership, NOT a company-level project JV.',
            estates: [
                { name: 'Sevina Park', location: 'Biñan, Laguna', type: 'Township', source: 'authoritative', confidence: 'High', note: '8-ha LEED-Platinum green township (ArthaLand’s first master-planned estate); holds Sevina Park Villas + Una Apartments + 4–5 planned mid-rise towers.' },
            ],
            projects: [
                // ── Residential condominiums ──
                { name: 'Arya Residences', location: 'BGC, Taguig', category: 'Condominium', units: ['2BR', '3BR', '4BR'], estate: 'Bonifacio Global City', source: 'authoritative', confidence: 'High', note: 'McKinley Parkway; bi-level villas / penthouses; limited-edition annex bi-level units.' },
                { name: 'Lucima', location: 'Cebu Business Park, Cebu City', category: 'Condominium', units: ['1BR', '2BR', '3BR', '4BR', '5BR'], estate: 'Cebu Business Park', match: 'exact', source: 'authoritative', confidence: 'High', note: '37-storey; quadruple-certified (LEED Gold/WELL/EDGE/BERDE). Exact-only (fuzzy-off): edit-distance 1 from the common brand token "Lucia" (Sta. Lucia).' },
                { name: 'Eluria', location: 'Legazpi Village, Makati', category: 'Condominium', units: ['3BR', '5BR'], estate: 'Makati Central Business District', source: 'authoritative', confidence: 'High', note: '119 Rada St; ultra-luxury low-density (37 units); Garden Residences + Penthouse.' },
                { name: 'Sondris', aliases: ['Makati CBD Residential Project 1'], location: 'Arnaiz Avenue, Legazpi Village, Makati', category: 'Condominium', units: ['1BR', '2BR', '3BR'], estate: 'Makati Central Business District', developer: 'Zileya Land Development Corporation', jv: 'ArthaLand Corporation (60%) + Mitsui Fudosan (Asia) / SEAI Metro Manila One Inc. (40%)', subsidiaryOf: 'ArthaLand Corporation', source: 'authoritative', confidence: 'High', note: 'CURRENT development entity = Zileya Land Development Corp. (inc. 2015 as the Makati vehicle). ArthaLand consolidated Zileya to ~100% (mid-2025), then sold 40% to Mitsui Fudosan (Asia) via SEAI Metro Manila One Inc. (Dec 2025, ₱724.83M) → current 60/40 JV. Mitsui Fudosan (Asia) is a subsidiary of Mitsui Fudosan Co., Ltd. (TSE). Formerly codenamed "Makati CBD Residential Project 1" / "Project Rock". Also Garden units.' },
                { name: 'Una Apartments at Sevina Park', aliases: ['Una Apartments'], location: 'Biñan, Laguna', category: 'Condominium', units: ['Studio', '1BR'], estate: 'Sevina Park', match: 'context', towers: ['Tower 1', 'Tower 2', 'Tower 3'], source: 'authoritative', confidence: 'High', note: 'Within Sevina Park; furnished studio/1BR. Bare "Una Apartments" generic — context-gated.' },
                { name: 'Liv Katipunan', aliases: ['LIV Katipunan', 'Liv by Arthaland'], location: 'Loyola Heights, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', confidence: 'High', note: 'Two-tower (Liv North + planned second) on Katipunan Ave.' },

                // ── House and lot ──
                { name: 'Sevina Park Villas', location: 'Biñan, Laguna', category: 'House and Lot', estate: 'Sevina Park', source: 'authoritative', confidence: 'High', note: 'Limited-edition designer villas / townhouses.' },

                // ── Office (residential:false — matched, category-filtered) ──
                { name: 'Arthaland Century Pacific Tower', location: 'BGC, Taguig', category: 'Office', projectType: 'office', residential: false, estate: 'Bonifacio Global City', source: 'authoritative', confidence: 'High', note: '30-storey Grade A green office (2019). Developed SOLELY by ArthaLand — "Century Pacific" is the historic site name, NOT a JV.' },
                { name: 'Cebu Exchange', location: 'Salinas Drive, Lahug, Cebu City', category: 'Office', projectType: 'office', residential: false, source: 'authoritative', confidence: 'High', note: 'Grade A green office.' },
                { name: 'Savya Financial Center', location: 'Arca South, Taguig', category: 'Office', projectType: 'office', residential: false, estate: 'Arca South', towers: ['North Tower', 'South Tower'], source: 'authoritative', confidence: 'High', note: '18-storey Grade A green office (2021).' },

                // ── Pipeline codenames (canonical names not yet established → unverified, context-gated) ──
                { name: 'Project Teal', location: 'Quezon City', category: 'Condominium', match: 'context', source: 'unverified', note: 'Internal codename; canonical name not yet established. Planned residential (northern Metro Manila).' },
                { name: 'Project Olive', location: null, category: 'Condominium', match: 'context', source: 'unverified', note: 'Internal codename; planned multi-tower residential / mixed-use.' },
                { name: 'Project Vanilla', location: 'Banilad, Cebu', category: 'Condominium', match: 'context', source: 'unverified', note: 'Internal codename; planned mixed-use / residential estate.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // CATHAY LAND, INC. — Ng family (Jeffrey Ng); flagship South Forbes Golf
        // City (Silang, Cavite). JV partner with Ayala Land/Alveo/ALP in the 800-ha
        // Southmont estate — those JV projects (Verdea, Hillside Ridge, Lanewood
        // Hills) stay under Alveo/ALP as developer of record with Cathay in `jv`,
        // NOT duplicated here. Astoria Hotels & Resorts is a sister company.
        // ═══════════════════════════════════════════════════════════════════
        'Cathay Land': {
            aliases: ['Cathay Land Inc', 'Cathay Land International'],
            group: 'Cathay Land',
            note: 'Ng family (Jeffrey Ng). South Forbes Golf City flagship. Southmont JV projects (Verdea/Hillside Ridge = Alveo×Cathay, Lanewood Hills = ALP×Cathay) are recorded under Alveo/ALP with Cathay in jv — not duplicated here.',
            estates: [
                { name: 'South Forbes Golf City', aliases: ['South Forbes'], location: 'Silang, Cavite', type: 'Township', developer: 'Cathay Land', source: 'authoritative', confidence: 'High', note: '~250+ ha master-planned township of internationally themed boutique villages (The Mansions, The Horizons, The Elevations).' },
                { name: 'Crestkey Estates', location: 'Silang, Cavite', type: 'Mixed-use estate', developer: 'Cathay Land', source: 'user', note: 'College Business District concept (residences, commercial, education incl. Chiang Kai Shek College Southmont).' },
            ],
            projects: [
                // ── South Forbes — The Mansions (themed horizontal villages) ──
                { name: 'Bali Mansions', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Phuket Mansions', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Tokyo Mansions', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                { name: 'The Racha Mansions', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                // ── South Forbes — The Horizons ──
                { name: 'Chateaux de Paris', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Nirwana Bali', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Mediterranean Villas', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', match: 'context', source: 'user', note: 'Generic ("villas") — context-gated. The "Miami" and bare "Villas" Horizons villages are NOT fed (place-name/generic collision) — kept as village metadata only.' },
                // ── South Forbes — The Elevations (mid-rise condominiums) ──
                { name: 'Scandia Suites', aliases: ['Scandia Suites 1', 'Scandia Suites 2'], location: 'Silang, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Stanford Suites', aliases: ['Stanford Suites 1', 'Stanford Suites 2', 'Stanford Suites 3'], location: 'Silang, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Fullerton Suites', aliases: ['Fullerton Suites 1', 'Fullerton Suites 2'], location: 'Silang, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Berkeley Suites', location: 'Silang, Cavite', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], estate: 'South Forbes Golf City', source: 'user' },
                { name: 'Golf View Terraces', location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', match: 'context', source: 'user', note: 'Generic ("golf view") — context-gated.' },
                { name: 'Mallorca Villas', aliases: ['Mallorca Villas Phase 1', 'Mallorca Villas Phase 2A', 'Mallorca Villas Phase 2B', 'Mallorca Villas Phase 3'], location: 'Silang, Cavite', category: 'House and Lot', estate: 'South Forbes Golf City', source: 'user' },
                // ── Other residential ──
                { name: 'Regency Executive Town Homes', location: 'Dasmariñas, Cavite', category: 'Town House', source: 'user' },
                { name: 'Dynasty Towers', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Twin 25-storey.' },
                { name: 'Ananda Square', location: 'Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Multi-tower integrated condominium.' },
                // ── Industrial / commercial (residential:false projects) ──
                { name: 'Cavite Light Industrial Park', aliases: ['CLIP'], location: 'Silang, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, source: 'user', note: 'Industrial/commercial estate (Phases 1 & 2).' },
                { name: 'Mallorca City Commercial Boulevard', location: 'Silang, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, source: 'user' },
                { name: 'Carmona Technohub', location: 'Carmona, Cavite', category: 'Office', projectType: 'office', residential: false, source: 'user', note: 'Phase 1; commercial/office.' },
                // ── Astoria (sister hospitality brand — Jeffrey Ng) ──
                { name: 'Astoria Plaza', location: 'Ortigas, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user', note: '36-storey residential suites within a hotel concept. Astoria = Cathay sister company.' },
                { name: 'Minami Saki', aliases: ['Minami Saki by Astoria'], location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user' },
                { name: 'Chardonnay by Astoria', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user' },
                { name: 'Astoria Boracay', location: 'Station 1, Boracay, Malay, Aklan', category: 'Condominium', subtype: 'Resort Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user', note: 'Hotel / residential suites.' },
                { name: 'Astoria Current', location: 'Boracay, Malay, Aklan', category: 'Condominium', subtype: 'Resort Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user' },
                { name: 'Astoria Bohol', location: 'Baclayon, Bohol', category: 'Condominium', subtype: 'Resort Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', source: 'user' },
                { name: 'Astoria Greenbelt', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], developer: 'Astoria Hotels & Resorts', match: 'context', source: 'unverified', note: 'Greenbelt/Makati reference in some listings — not independently confirmed; generic ("greenbelt") — context-gated. FLAGGED.' },
            ],
            landmarks: [
                { name: 'Acienda Designer Outlet', developer: 'Cathay Land', location: 'Silang, Cavite', matchable: false, source: 'user', note: 'International outlet mall — context only, never a project match.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // PHINMA PROPERTY HOLDINGS CORPORATION — affordable medium/high-rise
        // developer; subsidiary of PHINMA Corporation (est. 1987). Saludad
        // (Bacolod) is a JV with JEPP Real Estate Co. Inc. DUAL-SOURCE 2026-08-14.
        // ═══════════════════════════════════════════════════════════════════
        'PHINMA Property Holdings': {
            aliases: ['PHINMA Properties', 'PHINMA Property Holdings Corporation', 'PHINMA Prism Property Development'],
            group: 'PHINMA',
            subsidiaryOf: 'PHINMA Corporation',
            estates: [
                { name: 'Saludad', aliases: ['Saludad Township', 'Saludad Bacolod'], location: 'Bacolod City', type: 'Township', jv: 'PHINMA Properties + JEPP Real Estate Co. Inc.', source: 'authoritative', confidence: 'High', note: '21-ha ₱12B master-planned township; JV with JEPP Real Estate. Holds Maayo Terraces + Likha Estates.' },
            ],
            projects: [
                { name: 'Mariposa Square', location: 'Quezon City', category: 'Town House', source: 'user' },
                { name: 'Mariposa Villas', location: 'Quezon City', category: 'Town House', source: 'user' },
                { name: 'Villa Elisa', location: 'Laguna / Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Villa Milagrosa', location: 'Laguna / Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Fountain Breeze', location: 'Sucat, Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Sofia Bellevue', location: 'Capitol Hills, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Flora Vista', location: 'Commonwealth, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'San Benissa Garden Villas', aliases: ['San Benissa Garden'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Also townhouse units.' },
                { name: 'Spazio Bernardo West Villas', aliases: ['Spazio Bernardo'], location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Asia Enclaves Alabang', aliases: ['ASiA Enclaves', 'Asia Enclaves'], location: 'Alabang, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Solano Hills', aliases: ['Solano Hillside Residences'], location: 'Sucat, Muntinlupa', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Arezzo Place Pasig', location: 'Sandoval Ave, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Arezzo Place Davao', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user' },
                { name: 'Hacienda Balai', location: 'Novaliches, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Smile Citihomes Annex', location: 'Caloocan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'L’Oasis', location: 'Malabon', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Metrotowne', location: 'Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Sunny Villas', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Bistekville', location: 'Novaliches, Quezon City', category: 'Town House', source: 'user' },
                { name: 'Grand Strikeville 4', aliases: ['Strikeville IV'], location: 'Bacoor, Cavite', category: 'Town House', source: 'user' },
                { name: 'PHINMA Maayo San Jose', location: 'San Jose, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'PHINMA Maayo Tugbok', location: 'Tugbok, Davao', category: 'House and Lot', source: 'user' },
                { name: 'Likha Residences Alabang', location: 'Alabang, Muntinlupa', category: 'Town House', source: 'user' },
                { name: 'Likha Residences Davao', location: 'Davao City', category: 'Town House', source: 'user' },
                { name: 'Aspire Homes', location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic ("aspire") — context-gated.' },
                { name: 'Uniplace at SWU Village', aliases: ['Uniplace @ SWU Village', 'Uniplace'], location: 'Cebu City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: 'Mixed residential/dormitory (SWU Village).' },
                { name: 'Arcaya Residences at SWU West', aliases: ['Arcaya Residences'], location: 'Cebu City', category: 'Town House', source: 'user' },
                { name: 'Maayo Terraces', location: 'Bacolod City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR'], estate: 'Saludad', source: 'authoritative', confidence: 'High', note: '11-tower medium-rise within Saludad; loft options.' },
                { name: 'Likha Estates Saludad', aliases: ['Likha Estates'], location: 'Bacolod City', category: 'Residential Lot', estate: 'Saludad', source: 'user' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // EMPIRE EAST LAND HOLDINGS, INC. — middle-income developer; 81.7%-owned
        // Megaworld subsidiary (spun off 1994; Andrew Tan group). Its projects are
        // Empire East's, NOT Megaworld's directly. The Megaworld 'Highland City'
        // estate's developer is corrected to Empire East. DUAL-SOURCE 2026-08-14.
        // ═══════════════════════════════════════════════════════════════════
        'Empire East': {
            aliases: ['Empire East Land Holdings', 'Empire East Land Holdings Inc'],
            group: 'Megaworld',
            subsidiaryOf: 'Megaworld',
            estates: [
                { name: 'Laguna BelAir', aliases: ['Laguna Bel Air'], location: 'Sta. Rosa, Laguna', type: 'Residential estate', developer: 'Empire East', source: 'user', note: '~69+ ha residential + commercial (Laguna BelAir I & II).' },
            ],
            projects: [
                { name: 'Empire East Highland City', aliases: ['Highland City Cainta'], location: 'Cainta / Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Highland City', source: 'authoritative', confidence: 'High', note: 'PH’s first "elevated city" (~22 ha, Felix Ave); residential towers + mall + club + residential/commercial lots. Empire East (Megaworld subsidiary) is the developer.' },
                { name: 'Little Baguio Gardens', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Xavier Hills', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Greenhills Garden Square', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'San Francisco Gardens', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Gilmore Heights', location: 'Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Governor’s Place', location: 'Shaw Boulevard, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic ("governor’s place") — context-gated.' },
                { name: 'Kingswood Makati', location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Twin-tower residential-commercial.' },
                { name: 'California Garden Square', location: 'Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Multi-tower community.' },
                { name: 'The Cambridge Village', location: 'Pasig / Cainta', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Large multi-tower mini-city (~37 towers) with commercial.' },
                { name: 'Little Baguio Terraces', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'San Lorenzo Place', location: 'EDSA cor Chino Roces, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', confidence: 'High', note: '4-tower transit-oriented community near Magallanes MRT; retail podium.' },
                { name: 'The Sonoma', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user', note: 'Also condominium components.' },
                { name: 'Mango Tree Residences', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Near Greenhills.' },
                { name: 'Covent Garden', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Pioneer Woodlands', location: 'EDSA cor Pioneer, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', confidence: 'High', note: 'Transit-oriented near MRT Boni; multi-tower + commercial.' },
                { name: 'The Rochester', aliases: ['The Rochester Garden'], location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Elisco Rd / San Joaquin.' },
                { name: 'Kasara Urban Resort Residences', aliases: ['Kasara'], location: 'Ugong, Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', confidence: 'High', note: 'Six-tower resort-themed enclave near C5.' },
                { name: 'The Paddington Place', location: 'Shaw Boulevard, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Transit-oriented near MRT Shaw; retail/office podium.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // AXEIA DEVELOPMENT CORPORATION — affordable housing (formerly Asiatic;
        // reorg. 1982). AXEIA Group (Basic Housing Solutions, Axeia Development Corp,
        // Asiatic Land, I-Asiatic). Cavite-rooted (Casa de Monteverde, GMA, 1987).
        // DUAL-SOURCE ingest (2026-08-14). Third "Valle Verde" homonym; Southwoods
        // Peak V is Axeia's own (NOT Megaworld's Southwoods City — no JV inferred).
        // ═══════════════════════════════════════════════════════════════════
        'Axeia Development': {
            aliases: ['Axeia Development Corporation', 'Axeia', 'Axeia Group', 'Asiatic'],
            group: 'Axeia',
            projects: [
                // ── Cavite ──
                { name: 'Casa De Monteverde', location: 'General Mariano Alvarez, Cavite', category: 'House and Lot', source: 'user', note: 'First project (1987), "A Community of a Thousand Homes".' },
                { name: 'Mandarin Homes', aliases: ['Mandarin Homes Phase I'], location: 'General Mariano Alvarez, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Alta Tierra', aliases: ['Alta Tierra Homes'], location: 'Cavite City, Cavite', category: 'House and Lot', source: 'user' },
                // THIRD "Valle Verde" homonym — Axeia, Dasmariñas Cavite (distinct id/location)
                { name: 'Valle Verde', id: 'valle-verde-dasmarinas', location: 'Dasmariñas, Cavite', category: 'House and Lot', match: 'context', developer: 'Axeia Development Corporation', source: 'user', confidence: 'Medium', note: 'THIRD "Valle Verde" homonym (Axeia, Dasmariñas Cavite) — distinct from Sta. Lucia’s Valle Verde Davao and Ortigas’ Valle Verde Pasig. Resolved by location; bare "Valle Verde" → null.' },
                { name: 'The Veraneo', location: 'Kawit, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Hillsview Royale', location: 'Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Kazari Residences', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Tierra Vista Ayana', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user', note: 'Distinct from Filinvest’s bare "Tierra Vista" (Bulacan).' },
                { name: 'Richdale West Residences', aliases: ['Richdale West Residences Phase 1', 'Richdale West Residences Phase 2'], location: 'General Trias, Cavite', category: 'House and Lot', jv: 'Axeia Development Corporation + Nishi-Nippon Railroad (Nishitetsu)', source: 'authoritative', confidence: 'High', note: '₱2.5B masterplanned JV with NNR / Nishitetsu (2023).' },
                { name: 'Naic Country Homes', location: 'Naic, Cavite', category: 'House and Lot', source: 'user', note: 'Socialized/affordable.' },
                { name: 'Southwoods Peak V', aliases: ['Manila Southwoods Peak V'], location: 'General Mariano Alvarez / Carmona, Cavite', category: 'House and Lot', match: 'context', developer: 'Axeia Development Corporation', source: 'user', confidence: 'Medium', note: 'Axeia project — 27-ha expansion of Axeia’s Southwoods G.M.A. Cavite community (per Axeia historical material; user-provided, not independently web-verified → FLAGGED). NOT Megaworld’s Manila Southwoods / Southwoods City — no Megaworld/GERI JV. Generic name — context-gated.' },
                // ── Laguna ──
                { name: 'Calamba Park Residences', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Calamba Park Place', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Arella Residences', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'The Cambria', location: 'Bay, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Bay Garden Homes', location: 'Bay, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Tierra Sueño', aliases: ['Tierra Sueno'], location: 'Laguna', category: 'House and Lot', source: 'user' },
                // ── Batangas ──
                { name: 'Le Moubreza', aliases: ['Le Moubréza'], location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user', note: 'Incl. South Phase 1.' },
                { name: 'Townsville Sto. Tomas', location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Tanauan Park Place', location: 'Tanauan, Batangas', category: 'House and Lot', source: 'user', note: 'Multi-phase (incl. Phase 4).' },
                { name: 'Greenmeadows Residences', aliases: ['Green Meadows Residences'], location: 'San Jose, Batangas', category: 'House and Lot', source: 'user', note: 'Distinct from Ortigas’ Greenmeadows village (QC).' },
                // ── Rizal & Metro Manila ──
                { name: 'Zuri Residences', location: 'Taytay, Rizal', category: 'House and Lot', source: 'user' },
                { name: 'Santorini Estates', location: 'Binangonan, Rizal', category: 'House and Lot', source: 'user', note: '"Santorini" tower labels elsewhere are metadata; this is a distinct subdivision.' },
                { name: 'Midori Terraces', location: 'Antipolo, Rizal', category: 'Condominium', subtype: 'Mid-rise', units: ['2BR'], source: 'user', note: 'Low-density mid-rise; distinct from Federal Land’s Grand Midori.' },
                { name: '55 Kalayaan Suites', location: 'Kalayaan Ave, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'One Seventy Place', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                // ── Pampanga ──
                { name: 'Tierra Vista Pampanga', location: 'Mexico, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'White Plains Porac', aliases: ['White Plains Porac Phase 1'], location: 'Porac, Pampanga', category: 'House and Lot', source: 'user', note: 'Distinct from White Plains village (QC).' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // RAEMULAN LANDS, INC. — socialized-housing developer (founded 2016 by
        // Jacinto Ng Jr.; Pag-IBIG Top-1). Pasinaya Homes brand; 4PH participation.
        // DUAL-SOURCE ingest (2026-08-14).
        // ═══════════════════════════════════════════════════════════════════
        'Raemulan Lands': {
            aliases: ['Raemulan Lands Inc', 'Pasinaya Homes'],
            group: 'Raemulan',
            note: 'Socialized-housing developer; founded 2016 by Jacinto Ng Jr. Pasinaya Homes brand (30,000+ homes); 4PH participation.',
            projects: [
                { name: 'Pasinaya Homes', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Flagship socialized brand; many sites/phases. Generic — context-gated.' },
                { name: 'Pasinaya Homes Prime Central', location: 'Cavite', category: 'House and Lot', source: 'user', note: 'Rooftop solar integration.' },
                { name: 'Pasinaya Homes Timog Naic', location: 'Naic, Cavite', category: 'House and Lot', source: 'user', note: 'Socialized.' },
                { name: 'Pasinaya Heights', location: 'Cabuyao, Laguna', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'authoritative', confidence: 'High', note: '8-storey condo under 4PH (Pambansang Pabahay para sa Pilipino), Brgy. Baclaran, Cabuyao. 4PH-verified.' },
                { name: 'Pagsibol Village', location: 'Morong, Rizal', category: 'House and Lot', match: 'context', source: 'user', note: 'Also Magalang, Pampanga sites. Generic — context-gated.' },
                { name: 'Pagsikat Place', location: 'Magalang, Pampanga', category: 'House and Lot', match: 'context', source: 'user', note: 'Also Timog Naic, Cavite. Generic — context-gated.' },
                { name: 'Jubilation Enclaves', aliases: ['Jubilation Enclave', 'Jubilation Enclave North'], location: 'Naic, Cavite', category: 'House and Lot', source: 'user', note: 'Also Biñan, Laguna (middle-income managed communities).' },
                { name: 'Agapeya', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Estanzia Enclave', location: 'Tanza, Cavite', category: 'House and Lot', source: 'user' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // FIESTA COMMUNITIES, INC. — Central Luzon low-cost housing; affiliate of
        // Hausland Development Corporation. DUAL-SOURCE ingest (2026-08-14).
        // ═══════════════════════════════════════════════════════════════════
        'Fiesta Communities': {
            aliases: ['Fiesta Communities Inc'],
            group: 'Hausland',
            note: 'Central Luzon low-cost housing; affiliate of Hausland Development Corporation. Pampanga/Tarlac/Bataan/Zambales.',
            projects: [
                { name: 'Fiesta Communities Porac', location: 'Porac, Pampanga', category: 'House and Lot', source: 'user', note: 'First project (2008); incl. Porac II.' },
                { name: 'Fiesta Communities Angeles', location: 'Angeles City, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities Dapdap', location: 'Mabalacat, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities San Fernando', aliases: ['Fiesta Communities Calulut'], location: 'San Fernando, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities Mexico', location: 'Sabanilla, Mexico, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Kaya Homes by Fiesta Communities', aliases: ['Kaya Homes'], location: 'Magalang, Pampanga', category: 'House and Lot', source: 'user', note: 'Affordable models.' },
                { name: 'Fiesta Communities San Rafael', location: 'Tarlac City, Tarlac', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities Aguso', location: 'Aguso, Tarlac City, Tarlac', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities Tarlac Extension', location: 'Tarlac', category: 'House and Lot', source: 'user', note: 'Socialized components.' },
                { name: 'Fiesta Communities Limay', location: 'Limay, Bataan', category: 'House and Lot', source: 'user' },
                { name: 'Fiesta Communities Hermosa', location: 'Hermosa, Bataan', category: 'House and Lot', source: 'user', note: 'Phases incl. 3.' },
                { name: 'Fiesta Communities Mariveles', location: 'Mariveles, Bataan', category: 'House and Lot', source: 'user', note: 'Phases incl. 1A.' },
                { name: 'Fiesta Communities Olongapo', aliases: ['Fiesta Communities Ologanpo'], location: 'Olongapo, Zambales', category: 'House and Lot', source: 'user', note: 'First low-cost housing in Olongapo.' },
                { name: 'Fiesta Communities Asinan', location: 'Central Luzon', category: 'House and Lot', source: 'user' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // ANTEL GROUP OF COMPANIES — landowner + developer since 1986; vertical +
        // large Cavite horizontal townships. Family ownership omitted (not
        // independently verified). DUAL-SOURCE ingest (2026-08-14). Anyana's "Bel
        // Air" villages are Antel's Tanza villages — context-gated so they never
        // cross-match ALP's Bel-Air Village (Makati).
        // ═══════════════════════════════════════════════════════════════════
        'Antel Group': {
            aliases: ['Antel', 'Antel Group of Companies', 'Antel Land'],
            group: 'Antel',
            note: 'Landowner + developer since 1986; vertical + large Cavite horizontal townships. (Commonly associated with the Antonio family — NOT independently verified, so omitted from attribution.)',
            estates: [
                { name: 'Antel Grand Village', location: 'General Trias, Cavite', type: 'Township', developer: 'Antel Group of Companies', source: 'authoritative', confidence: 'High', note: '~170-ha master-planned township (Palafox & Associates); gated villages + commercial district + clubhouse/water park.' },
                { name: 'Anyana', aliases: ['Anyana Bel Air'], location: 'Tanza, Cavite', type: 'Township', developer: 'Antel Group of Companies', source: 'authoritative', confidence: 'High', note: '~192-ha mixed-use township inspired by Bel-Air, Los Angeles; residential villages + town center.' },
            ],
            projects: [
                // ── Antel Grand Village villages ──
                { name: 'Grand Forbes', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', match: 'context', source: 'user', note: 'Village within Antel Grand Village; generic ("forbes") — context-gated.' },
                { name: 'Grand Oakridge', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Pasadena', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Catalina', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Cedarcrest', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Meadows', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Grand Broadmore', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Riverdale', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user' },
                { name: 'Grand Parklane', location: 'General Trias, Cavite', category: 'House and Lot', estate: 'Antel Grand Village', source: 'user', note: 'Commercial enclave + residential phases 1A/1B/1C.' },
                // ── Anyana "Bel Air" villages (Antel, Tanza — NOT ALP's Bel-Air Village) ──
                { name: 'Anyana Bel Air West', aliases: ['Bel Air West'], location: 'Tanza, Cavite', category: 'House and Lot', estate: 'Anyana', match: 'context', source: 'user', note: 'Anyana village; "Bel Air" here is Antel’s Tanza village — NOT ALP’s Bel-Air Village (Makati). Context-gated.' },
                { name: 'Anyana Bel Air East', aliases: ['Bel Air East'], location: 'Tanza, Cavite', category: 'House and Lot', estate: 'Anyana', match: 'context', source: 'user', note: 'Anyana village; context-gated.' },
                { name: 'Anyana Bel Air Central', aliases: ['Bel Air Central'], location: 'Tanza, Cavite', category: 'House and Lot', estate: 'Anyana', match: 'context', source: 'user', note: 'Anyana village; context-gated.' },
                // ── Early high-rise / corporate ──
                { name: 'Antel Platinum 1000', location: 'Greenhills, San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Early flagship 26-storey (~1992).' },
                { name: 'Antel Platinum 2000', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Annapolis Wilshire Plaza', location: 'San Juan', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Antel 1000 Corporate Center', location: 'Makati', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Antel 2000 Corporate Center', location: 'Salcedo Village, Makati', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Antel Seaview Towers', aliases: ['Antel Seaview'], location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Antel Platinum Towers', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Antel Global Corporate Center', location: 'Pasig', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                // ── Mid-period / lifestyle ──
                { name: 'Grand Centennial Homes', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'The A. Venue Residences', aliases: ['The A.Venue Suites', 'A. Venue Hall'], location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Self-contained community w/ residential + commercial.' },
                { name: 'Antel Spa Suites', aliases: ['Antel Spa Residences', 'Antel Spa Suites Makati'], location: 'Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The Serenity Suites', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Centropolis Communities', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'New Manila Townhomes', location: 'Quezon City', category: 'Town House', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Satori Garden Villas', location: null, category: 'House and Lot', source: 'user', note: 'Distinct from DMCI’s Satori Residences.' },
                { name: 'S. Laurel Townhomes', location: null, category: 'Town House', source: 'user' },
                { name: 'One Hemady Townhomes', location: 'Quezon City', category: 'Town House', source: 'user' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // ANCHOR LAND HOLDINGS, INC. — listed (PSE: ALHI) luxury developer; founded
        // 2004 (Stephen Lee Keng & Li Yi Chiang). Binondo/Chinatown + Bay Area.
        // DUAL-SOURCE ingest (2026-08-14). Admiral Hotel = landmark (MGallery is the
        // operator, NOT a dev JV); Admiral Baysuites = its sellable residential arm.
        // ═══════════════════════════════════════════════════════════════════
        'Anchor Land Holdings': {
            aliases: ['Anchor Land', 'Anchor Land Holdings Inc', 'ALHI'],
            group: 'Anchor Land',
            note: 'Listed (PSE: ALHI) luxury developer; founded 2004 (Stephen Lee Keng & Li Yi Chiang). Savea is its condotel/hospitality pipeline arm (Boracay/Coron/San Vicente, Palawan — unverified pipeline, not fed).',
            projects: [
                // ── Binondo flagship ──
                { name: 'Lee Tower', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Pioneer project (~2004).' },
                { name: 'Mayfair Tower', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Mandarin Square', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Distinct from Axeia’s Mandarin Homes.' },
                { name: 'Wharton Parksuites', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Oxford Parksuites', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Princeview Parksuites', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Anchor Skysuites', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Anchor Grandsuites', location: 'Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR', '4BR'], source: 'authoritative', confidence: 'High', note: 'Tallest building in Manila Chinatown.' },
                // ── Later Binondo / Manila ──
                { name: 'Clairemont Hills Parksuites', aliases: ['Clairemont Hills'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Solemare Parksuites', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Phases 1 & 2 (Bay Area).' },
                { name: 'Monarch Parksuites', location: 'Parañaque', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Cornell Parksuites', location: 'Masangkay St, Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR', '4BR'], source: 'user', note: '50-storey family-oriented.' },
                { name: '8 Alonzo Parksuites', aliases: ['Eight Alonzo Parksuites'], location: 'T. Alonzo St, Binondo, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: '~49-storey.' },
                { name: 'One Legacy Grandsuites', location: 'Benavidez St, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR', '4BR'], source: 'user', note: 'Smart residences.' },
                // ── Roxas Blvd / Bay Area / Pasay ──
                { name: 'Admiral Baysuites', location: 'Roxas Boulevard / M.H. del Pilar, Malate, Manila', category: 'Condominium', subtype: 'Hotel Residences', units: ['2BR', '3BR', '4BR', '5BR'], source: 'authoritative', confidence: 'High', note: '53-storey luxury residential condominium — the sellable residential component of Anchor Land’s adaptive redevelopment of the historic Admiral Hotel site (distinct from the MGallery boutique hotel). Individually sold suites/bi-levels/penthouses; West Wing 3–5BR.' },
                { name: 'Admiral Grandsuites', location: 'Roxas Boulevard, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'The Panorama Manila', location: 'Roxas Boulevard, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR', '4BR'], source: 'user', note: '53-storey luxury waterfront.' },
                { name: 'Copeton Baysuites', location: 'Macapagal, Bay City, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Rentvestment focus.' },
                { name: 'Cosmo Suites', location: 'Pasay', category: 'Condominium', units: ['Studio', '1BR'], match: 'context', source: 'user', note: 'Co-living / fully furnished; generic ("cosmo") — context-gated.' },
                // ── Davao ──
                { name: '202 Peaklane', location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'East & West Towers; rentvestment focus.' },
                // ── Office / commercial / logistics (residential:false) ──
                { name: 'One Financial Center', location: 'Quintin Paredes St, Binondo, Manila', category: 'Office', projectType: 'office', residential: false, source: 'user' },
                { name: 'Juan Luna Logistics Center', location: 'Binondo, Manila', category: 'Commercial Lot', projectType: 'commercial', residential: false, source: 'user', note: 'Logistics/warehouse building.' },
            ],
            landmarks: [
                { name: 'Admiral Hotel Manila', aliases: ['Admiral Hotel', 'Admiral Boutique Hotel'], developer: 'Anchor Land Holdings', location: 'Roxas Boulevard, Manila', matchable: false, source: 'authoritative', note: 'Historic hotel (orig. Admiral Apartments), redeveloped by Anchor Land; operated as a Boutique Hotel by MGallery (Accor) — operator/manager, NOT a development JV. Context only; the sellable residential arm is the separate Admiral Baysuites record.' },
                { name: 'Two Shopping Center', developer: 'Anchor Land Holdings', location: 'Binondo, Manila', matchable: false, source: 'user', note: 'Retail mall — context only.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // GREENFIELD DEVELOPMENT CORPORATION — Campos Group (Jose Yao Campos /
        // Unilab heritage). Greenfield City (Sta. Rosa) + Greenfield District (former
        // Unilab plant, Mandaluyong). DUAL-SOURCE ingest (2026-08-14). Signature JVs
        // (Ayala/Avida/Century-Meridien/Fil-Estate/Jardine) carry Greenfield in `jv`
        // on the committed partner records — NOT duplicated here.
        // ═══════════════════════════════════════════════════════════════════
        'Greenfield Development': {
            aliases: ['Greenfield Development Corporation', 'Greenfield', 'GDC'],
            group: 'Greenfield',
            note: 'Campos Group (Unilab heritage). JV projects committed under partner keys (Ayala Greenfield Estates→AGDC, San Antonio Heights/San Rafael Estates→Avida, SOHO Central→Century/Meridien) carry Greenfield in jv, not duplicated here.',
            estates: [
                { name: 'Greenfield City', location: 'Sta. Rosa, Laguna', type: 'Township', developer: 'Greenfield Development Corporation', source: 'authoritative', confidence: 'High', note: '~400-ha "City within a Park" mixed-use township.' },
                { name: 'Greenfield District', location: 'Highway Hills, Mandaluyong', type: 'Mixed-use estate', developer: 'Greenfield Development Corporation', source: 'authoritative', confidence: 'High', note: '~15–22-ha transit-oriented redevelopment of the former Unilab plant (EDSA-Shaw).' },
                { name: 'Greenfield City Biñan', location: 'Biñan, Laguna', type: 'Township', developer: 'Greenfield Development Corporation', source: 'user', note: '~110-ha, education-focused, near the Greenfield City–Unilab Interchange.' },
                { name: 'Equus City', aliases: ['Equus Hub'], location: 'Biñan / San Pedro, Laguna', type: 'Mixed-use estate', developer: 'Greenfield Development Corporation', source: 'user', note: '~50-ha mixed-use near SLEX-Silangan interchange.' },
                { name: 'Nava Hillsborough', aliases: ['Greenfield Hillsborough'], location: 'Muntinlupa', type: 'Residential estate', developer: 'Greenfield Development Corporation', source: 'user', note: '~20-ha near Alabang via SLEX; phase 1 ongoing.' },
            ],
            projects: [
                // ── Greenfield City (Sta. Rosa) ──
                { name: 'Pramana Residential Park', aliases: ['Pramana'], location: 'Sta. Rosa, Laguna', category: 'Residential Lot', estate: 'Greenfield City', source: 'user', note: 'First residential park in PH (~2007, ~30 ha).' },
                { name: 'Solen Residences', aliases: ['Solen'], location: 'Sta. Rosa, Laguna', category: 'Residential Lot', estate: 'Greenfield City', source: 'user', note: '~55 ha.' },
                { name: 'Trava', location: 'Sta. Rosa, Laguna', category: 'Residential Lot', estate: 'Greenfield City', match: 'context', source: 'user', note: '~33-ha tropical-themed lot-only; short generic name — context-gated (also <6 chars, not fed).' },
                { name: 'Zadia', location: 'Sta. Rosa, Laguna', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Greenfield City', match: 'context', source: 'user', note: 'Five-building condo; short name — context-gated (also <6 chars, not fed).' },
                { name: 'Sta. Rosa Business Park', aliases: ['Laguna Central'], location: 'Sta. Rosa, Laguna', category: 'Office', projectType: 'office', residential: false, estate: 'Greenfield City', source: 'user', note: 'Office/BPO/commercial (Arcadia/Laguna Central).' },
                { name: 'Greenfield Auto Park', location: 'Sta. Rosa, Laguna', category: 'Commercial Lot', projectType: 'commercial', residential: false, estate: 'Greenfield City', source: 'user', note: '~65-ha PEZA industrial zone.' },
                // ── Greenfield District (Mandaluyong) ──
                { name: 'Twin Oaks Place', location: 'Highway Hills, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Greenfield District', source: 'user', note: 'Twin towers (West ~2014, East ~2018); fiber-to-the-home.' },
                { name: 'Zitan', location: 'Highway Hills, Mandaluyong', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Greenfield District', match: 'context', source: 'user', note: 'Fiber-to-the-home, transit-oriented; short name — context-gated (also <6 chars, not fed).' },
                { name: 'Greenfield Tower', aliases: ['The Square at Greenfield District'], location: 'Highway Hills, Mandaluyong', category: 'Office', projectType: 'office', residential: false, estate: 'Greenfield District', source: 'user', note: 'BPO/corporate office.' },
                // ── JV projects (Greenfield co-developer; committed partner records hold primary attribution) ──
                { name: 'Hillsborough Subdivision', location: 'Muntinlupa', category: 'House and Lot', jv: 'Greenfield Development Corporation + Fil-Estate', source: 'authoritative', confidence: 'High', note: '1988 Greenfield × Fil-Estate JV (Greenfield JV page). No dedicated JV entity named.' },
                { name: 'Southwoods Residences', location: 'Carmona, Cavite', category: 'House and Lot', jv: 'Greenfield Development Corporation + Fil-Estate', source: 'authoritative', confidence: 'Medium', note: '1994 Greenfield × Fil-Estate JV — the Manila Southwoods Residential Estates (Fil-Estate). DISTINCT from Megaworld’s Southwoods City and Axeia’s Southwoods Peak V. Primary developer likely Fil-Estate; no dedicated JV entity named — FLAGGED.' },
                { name: 'Lexington Garden Village', aliases: ['Lexington'], location: 'San Joaquin, Pasig', category: 'House and Lot', developer: 'NorthPine Land', jv: 'NorthPine Land + Greenfield Development Corporation', source: 'authoritative', confidence: 'High', note: '8-ha garden village, Pasig (sold out 2008). CORRECTED: developer of record = NorthPine Land, jv NorthPine × Greenfield (NorthPine site + listings). ⚠ Greenfield’s own JV page lists the partner as "Jardine Land" — discrepancy FLAGGED; NorthPine attribution preferred per weight of evidence.' },
            ],
            landmarks: [
                { name: 'Paseo Outlets', aliases: ['Paseo de Sta. Rosa', 'Paseo Outlets of the South'], developer: 'Greenfield Development Corporation', estate: 'Greenfield City', location: 'Sta. Rosa, Laguna', matchable: false, source: 'user', note: 'Outlet retail park ("Outlet Mall of the South") — context only.' },
                { name: 'The Hub at Greenfield District', aliases: ['The Portal at Greenfield District', 'Pavilion at Greenfield District'], developer: 'Greenfield Development Corporation', estate: 'Greenfield District', location: 'Mandaluyong', matchable: false, source: 'user', note: 'Retail/lifestyle centers — context only.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // SUNTRUST PROPERTIES, INC. — Megaworld’s middle-income/affordable
        // subsidiary (fully owned since 2013). subsidiaryOf Megaworld — NOT flattened.
        // Estates Suntrust Ecotown (Tanza) + Sherwood Hills already under the Megaworld
        // entry with developer = Suntrust Properties. DUAL-SOURCE ingest (2026-08-14).
        // ═══════════════════════════════════════════════════════════════════
        'Suntrust Properties': {
            aliases: ['Suntrust Properties Inc', 'Suntrust'],
            group: 'Megaworld',
            subsidiaryOf: 'Megaworld',
            note: 'Megaworld middle-income/affordable subsidiary (fully owned 2013). Suntrust Ecotown + Sherwood Hills estates live under the Megaworld entry (developer = Suntrust Properties); not duplicated here.',
            projects: [
                // ── Horizontal ──
                { name: 'Suntrust Sentosa', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Suntrust Verona', location: 'Silang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Governor’s Hills', aliases: ['The Gentri Heights'], location: 'General Trias, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic ("governor’s hills") — context-gated.' },
                { name: 'Sta. Rosa Hills', aliases: ['Sta. Rosa Heights'], location: 'Silang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Siena Hills', aliases: ['Suntrust Sienna Hills'], location: 'Lipa, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Sunrise Hills', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Riva Bella', location: 'Cavite', category: 'House and Lot', estate: 'Sherwood Hills', source: 'user', note: 'Within Sherwood Hills (Suntrust); Sherwood Hills Golf.' },
                { name: 'Gran Avila', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user', confidence: 'Low', note: '⚠ CONFLICT: both Suntrust (suntrust.com.ph) AND State Land (stateland.ph) publish official pages for a Gran Avila in Calamba (~16.25 ha). Developer UNRESOLVED — kept under Suntrust pending review; NOT duplicated under State Land.' },
                { name: 'San Francisco Heights', location: 'Calamba, Laguna', category: 'House and Lot', source: 'user', confidence: 'Low', note: '⚠ CONFLICT: both Suntrust AND State Land (~23 ha, Calamba) publish this. Developer UNRESOLVED — kept under Suntrust pending review; NOT duplicated under State Land.' },
                { name: 'Cyberville', id: 'cyberville-cavite', aliases: ['Cybergreens'], location: 'General Trias, Cavite', category: 'House and Lot', match: 'context', developer: 'Suntrust Properties', source: 'user', confidence: 'Medium', note: 'HOMONYM with Sta. Lucia’s Cyberville (Bulacan) — resolved by location; bare "Cyberville" → null. Also marketed as Cybergreens.' },
                { name: 'The Mandara', location: 'Silang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Avila Heights', location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user', confidence: 'Low', note: '⚠ CONFLICT: both Suntrust AND State Land (~10 ha, Sto. Tomas) publish this. Developer UNRESOLVED — kept under Suntrust pending review; NOT duplicated under State Land.' },
                { name: 'The Arcadia', location: 'Porac, Pampanga', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                // ── Vertical / condominium ──
                { name: 'Suntrust Shanata', location: 'Novaliches, Quezon City', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Suntrust Capitol Plaza', aliases: ['Capitol Plaza'], location: 'Diliman, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Suntrust Asmara', location: 'New Manila, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Suntrust Ascentia', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Suntrust Solana', location: 'Ermita, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Suntrust Kirana', location: 'Pasig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Suntrust Treetop Villas', location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Suntrust Parkview', aliases: ['Adriatico Gardens'], location: 'Ermita, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'One Lakeshore Drive', aliases: ['Two Lakeshore Drive'], location: 'Davao City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'Suntrust Palm City', location: 'Tagum, Davao del Norte', category: 'House and Lot', source: 'user' },
                { name: 'Suntrust 88 Gibraltar', location: 'Baguio City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user' },
                { name: 'The Fountain Grove', location: 'Talisay, Negros Occidental', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user' },
                { name: 'The Sofia Terraces', aliases: ['La Sonrisa', 'Sonrisa Gardens'], location: null, category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', confidence: 'Low', note: 'Regional/pipeline; location unverified.' },
            ],
        },

        // ═══════════════════════════════════════════════════════════════════
        // BRITTANY CORPORATION — Vista Land’s luxury subsidiary. subsidiaryOf Vista
        // Land — NOT flattened. Crosswinds, Portofino, Villar City estates already
        // exist under the Vista Land entry; Brittany projects link to them (no
        // duplicate estates). DUAL-SOURCE ingest (2026-08-14).
        // ═══════════════════════════════════════════════════════════════════
        'Brittany Corporation': {
            aliases: ['Brittany', 'Brittany Corp'],
            group: 'Vista Land',
            subsidiaryOf: 'Vista Land',
            note: 'Vista Land luxury subsidiary. Crosswinds/Portofino/Villar City estates are under the Vista Land entry; Brittany projects link to them.',
            projects: [
                // ── Early / signature luxury ──
                { name: 'La Residencia de Bacoor', location: 'Bacoor, Cavite', category: 'House and Lot', source: 'user', note: 'First development (1993).' },
                { name: 'Belle Reve', location: 'Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Promenade', location: 'Sta. Rosa, Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'English-countryside-inspired; generic — context-gated.' },
                { name: 'Fontamara', location: 'Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Island Park', location: 'Dasmariñas, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'La Posada', aliases: ['La Posada at Brittany Bay'], location: 'Sucat, Muntinlupa', category: 'House and Lot', source: 'user' },
                { name: 'Georgia Club', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user', note: 'American-estate-inspired.' },
                { name: 'Augusta', location: 'Sta. Rosa, Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                // ── Portofino series (Las Piñas) — estate Portofino ──
                { name: 'Portofino Heights', location: 'Las Piñas', category: 'House and Lot', estate: 'Portofino', source: 'user' },
                { name: 'Portofino South', aliases: ['Veneto at Portofino South'], location: 'Las Piñas', category: 'House and Lot', estate: 'Portofino', source: 'user' },
                { name: 'Amore at Portofino', location: 'Las Piñas', category: 'House and Lot', estate: 'Portofino', source: 'user' },
                { name: 'Portofino Courtyards', location: 'Las Piñas', category: 'House and Lot', estate: 'Portofino', source: 'user' },
                // ── Crosswinds (Tagaytay) — estate Crosswinds ──
                { name: 'Lausanne at Crosswinds', location: 'Tagaytay', category: 'House and Lot', estate: 'Crosswinds', source: 'user' },
                { name: 'Alpine Villas', location: 'Tagaytay', category: 'Condominium', subtype: 'Mid-rise', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Crosswinds', source: 'user', note: 'Swiss chalet-style.' },
                { name: 'Deux Maison at Crosswinds', location: 'Tagaytay', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Crosswinds', source: 'user' },
                { name: 'The Grand Quartier', location: 'Tagaytay', category: 'House and Lot', estate: 'Crosswinds', source: 'user' },
                // ── Newer / ongoing (Villar City + regional) ──
                { name: 'Pievana', location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user', note: '~25-ha biophilic leisure/wellness estate (Makiling/Malarayat); also condo units.' },
                { name: 'Elara at Villar City', aliases: ['Elara'], location: 'Villar City, Las Piñas', category: 'Residential Lot', estate: 'Villar City', source: 'user' },
                { name: 'Forresta', location: 'Villar City, Las Piñas', category: 'House and Lot', estate: 'Villar City', match: 'context', source: 'user', note: 'Nature-inspired mixed-use; generic — context-gated.' },
                { name: 'Bern Baguio', aliases: ['Bern'], location: 'Baguio City', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Four-tower Alpine-inspired.' },
                { name: 'Escana Boracay', aliases: ['Escana'], location: 'Boracay, Malay, Aklan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Leisure enclave.' },
                { name: 'Praya Palawan', aliases: ['Praya'], location: 'Puerto Princesa, Palawan', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Resort-style.' },
                { name: 'Mansions at Pontevedra', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'One Crescent Tower', location: 'Villar City, Las Piñas', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Villar City', source: 'user' },
                { name: 'Ashbury Residences', location: 'Villar City, Las Piñas', category: 'Town House', estate: 'Villar City', source: 'user', note: 'Luxury townhouses (Lakefront).' },
            ],
        },

        // ── Haus Talk (economic/mid-market horizontal; Antipolo/Rizal + Laguna) ──
        'Haus Talk': {
            aliases: ['Haus Talk Inc'],
            group: 'Haus Talk',
            note: 'Economic/mid-market horizontal (Eastview/Southview brands). DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Eastview Homes 1', location: 'San Roque, Antipolo City', category: 'House and Lot', source: 'user', note: 'Economic (BP 220), ~2006–2009.' },
                { name: 'Eastview Homes 2', location: 'San Roque, Antipolo City', category: 'House and Lot', source: 'user', note: 'Economic (BP 220), ~2010–2013.' },
                { name: 'Eastview Homes Marikina', aliases: ['Eastview Town Homes Marikina'], location: 'Marikina Heights, Marikina', category: 'House and Lot', source: 'user' },
                { name: 'Eastview Homes 3', location: 'San Roque, Antipolo City', category: 'House and Lot', source: 'user', note: 'Mid-market (PD 957).' },
                { name: 'Eastview Residences Premiere', aliases: ['Eastview Residences Premier'], location: 'Antipolo, Rizal', category: 'House and Lot', source: 'user' },
                { name: 'Southview Homes 1', aliases: ['South Hills'], location: 'San Pedro, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Southview Homes 2', aliases: ['Southview Homes 2 Extension'], location: 'San Pedro, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Southview Homes Sta. Rosa', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user', note: 'Economic.' },
                { name: 'Southview Homes Calendola', location: 'Calendola, San Pedro, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Celestis', aliases: ['Celestis 1', 'Celestis 2'], location: 'Antipolo City', category: 'House and Lot', source: 'user', note: 'Bayugo/San Luis; Celestis 2 mid-market PD 957 (~2026).' },
                { name: 'Tradition Square Maceda', location: 'Sampaloc, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Vertical mid-market; also townhouse.' },
                { name: 'Tradition Square Cubao', location: 'Cubao, Quezon City', category: 'Town House', source: 'user' },
                { name: 'Winn Residences', location: 'Bagong Silangan, Quezon City', category: 'Condominium', units: ['Studio', '1BR'], source: 'user', note: 'Socialized vertical.' },
                { name: 'The Granary', location: 'San Antonio, Biñan, Laguna', category: 'House and Lot', source: 'user', note: 'Economic (BP 220); Annex + Phases 1–3.' },
                { name: 'The Hammond', location: 'San Jose, Antipolo City', category: 'House and Lot', source: 'user', note: 'Mid-market (PD 957); launched ~2025.' },
                { name: 'Molavera', location: 'San Luis, Antipolo City', category: 'House and Lot', source: 'user', note: 'Economic (BP 220); pipeline ~2026.' },
                { name: 'Amberwood', location: 'Soro-soro, Biñan, Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'PD 957; generic — context-gated.' },
                { name: 'Cornerstone', location: 'Soro-soro, Biñan, Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Ellery Homes', location: 'Antipolo, Rizal', category: 'House and Lot', source: 'user', note: 'Socialized (pipeline).' },
                { name: 'Whistlewood', location: 'Antipolo, Rizal', category: 'House and Lot', source: 'user' },
                { name: 'The Canvas', aliases: ['The Canvass'], location: 'Angono / Teresa, Rizal', category: 'House and Lot', match: 'context', source: 'user', note: '~37-ha integrated economic township (pipeline); generic — context-gated.' },
            ],
        },

        // ── DDC Land (affordable/low-cost horizontal; Sta. Rosa Garden Villas) ──
        'DDC Land': {
            aliases: ['DDC Land Inc'],
            group: 'DDC',
            note: 'Affordable/low-cost horizontal; Sta. Rosa Garden Villas flagship series. DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Crystal Ville Subdivision', aliases: ['Crystal Ville'], location: 'Cabuyao, Laguna', category: 'House and Lot', source: 'user', note: 'First major low-cost project.' },
                { name: 'Sta. Rosa Garden Villas I', aliases: ['Garden Villas I'], location: 'Ibaba, Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Sta. Rosa Garden Villas II', aliases: ['Garden Villas II'], location: 'Macabling, Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Sta. Rosa Garden Villas III', aliases: ['Garden Villas III'], location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user', note: 'Phases 1/2/3/5; clubhouse + amenities.' },
                { name: 'South Dasma Garden Villas', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Tanza Garden Heights', aliases: ['Tanza Garden Premier'], location: 'Tanza, Cavite', category: 'House and Lot', source: 'user', note: 'Includes condominium components.' },
            ],
            landmarks: [
                { name: 'Garden Plaza Mall', developer: 'DDC Land', location: 'Sta. Rosa, Laguna', matchable: false, source: 'user', note: 'Retail within Garden Villas — context only.' },
            ],
        },

        // ── Borland Development (high-volume affordable; NAMED projects only) ──
        'Borland Development': {
            aliases: ['Borland Development Corporation'],
            group: 'Borland',
            note: 'High-volume affordable subdivisions (Bulacan/Cavite/Laguna/Rizal/Central Luzon). Public sources give mostly UNNAMED aggregates — only named projects ingested. DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Berkeley Heights', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Celina Homes', aliases: ['Celina Plains'], location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Southpoint Villas', location: 'Laguna', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Ridgepoint Homes', location: 'Teresa, Rizal', category: 'House and Lot', source: 'user' },
                { name: 'Springtown Villas', location: 'San Jose del Monte, Bulacan', category: 'House and Lot', source: 'user' },
                { name: 'Plaincrest Subdivision 2', aliases: ['Plaincrest Subdivision'], location: 'Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Brightwood Villas', location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Estrella Homes', aliases: ['Estrella Homes 4'], location: 'Central Luzon', category: 'House and Lot', source: 'user' },
                { name: 'Alegra Heights', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Sendara Plains', location: 'Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'Georgia Plains', location: 'Mexico, Pampanga', category: 'House and Lot', source: 'user', note: 'Distinct from Brittany’s Georgia Club.' },
                { name: 'Olivia Townhomes 2', location: 'Pampanga', category: 'Town House', source: 'user' },
                { name: 'Madison Townhomes', location: 'Nueva Ecija', category: 'Town House', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Tierra Verde Townhomes', location: 'Tarlac', category: 'Town House', source: 'user', note: 'Distinct from Sta. Lucia’s Tierra Verde (Davao/Digos).' },
                { name: 'La Breeza Subdivision', location: 'Zambales', category: 'House and Lot', source: 'user' },
                { name: 'Cambria Homes', location: 'Zambales', category: 'House and Lot', source: 'user', note: 'Distinct from Axeia’s The Cambria (Bay, Laguna).' },
            ],
        },

        // ── NorthPine Land (horizontal; Greenwoods Village flagship) ──
        'NorthPine Land': {
            aliases: ['NorthPine Land Inc', 'NorthPine', 'North Pine Land'],
            group: 'NorthPine',
            note: 'Horizontal communities; flagship Greenwoods Village (Dasmariñas). Lexington Garden Village (NorthPine × Greenfield JV) is recorded under the Greenfield entry — not duplicated here. DUAL-SOURCE 2026-08-14.',
            estates: [
                { name: 'Greenwoods Village', location: 'Dasmariñas, Cavite', type: 'Residential estate', developer: 'NorthPine Land', source: 'authoritative', confidence: 'High', note: '>80-ha Mediterranean-themed; 7 communities (Greenwoods, Greenwood Heights, Parkview, Rosewood, Norfolk Ridge, Primrose Place, The Prime).' },
            ],
            projects: [
                { name: 'Wind Crest', location: 'Dasmariñas, Cavite', category: 'House and Lot', estate: 'Greenwoods Village', match: 'context', source: 'user', note: 'Modern American Country; near Greenwoods. Generic — context-gated.' },
                { name: 'Kahaya Place', location: 'Dasmariñas, Cavite', category: 'Town House', source: 'user', note: 'Modern-Asian townhouse.' },
                { name: 'Kohana Grove', location: 'Silang, Cavite', category: 'House and Lot', source: 'user', note: 'Modern Asian / Zen; near Tagaytay.' },
                { name: 'South Hampton', location: 'Sta. Rosa, Laguna', category: 'House and Lot', source: 'user', note: 'Victorian/English-inspired.' },
                { name: 'Forest Ridge', location: 'Antipolo City', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Montana Views', location: 'San Fernando / Mexico, Pampanga', category: 'House and Lot', source: 'user', note: 'Maiden Central Luzon project.' },
                { name: 'Montana Strands', location: 'San Fernando, Pampanga', category: 'House and Lot', source: 'user', note: 'Retro Modern.' },
            ],
        },

        // ── Major Homes (CALABARZON horizontal + "Space" condormitel line) ──
        'Major Homes': {
            aliases: ['Major Homes Inc'],
            group: 'Major Homes',
            note: 'Horizontal (CALABARZON) + "Space" condormitel line (Manila). DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Lipa Verde', aliases: ['Lipa Verde Residences'], location: 'Lipa, Batangas', category: 'House and Lot', source: 'user', note: 'Near Mt. Malarayat.' },
                { name: 'Lipa Verde East', location: 'Lipa, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Crescent Knoll Residences', aliases: ['Crescent Knoll'], location: 'Calamba, Laguna', category: 'House and Lot', source: 'user', note: 'Modern English; Mt. Makiling views.' },
                { name: 'Ravenna Residences', aliases: ['Ravenna'], location: 'Mabalacat, Pampanga', category: 'House and Lot', source: 'user', note: 'Italian-inspired.' },
                { name: 'Mondavi', location: 'Tagaytay', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Sienna', location: 'Calabarzon', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated; distinct from Suntrust Siena Hills.' },
                { name: 'La Finca', location: null, category: 'House and Lot', match: 'context', source: 'user', note: 'Farm/country resort-style; generic — context-gated.' },
                { name: 'Space Taft', location: 'Taft, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Compact/investment condo; generic ("space") — context-gated.' },
                { name: 'Space San Marcelino', aliases: ['Space San Marcellino'], location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Space Romualdez', location: 'Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Space U-Belt', location: 'University Belt, Manila', category: 'Condominium', units: ['Studio', '1BR', '2BR'], match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Juez Residences', location: 'Malabon', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Seven medium-rise buildings.' },
            ],
        },

        // ── State Land (Stateland; Cavite/Laguna horizontal + MM townhomes) ──
        'State Land': {
            aliases: ['State Land Inc', 'Stateland', 'Stateland Inc'],
            group: 'State Land',
            note: 'Horizontal (Cavite/Laguna) + Metro Manila townhomes. Gran Avila / Avila Heights / San Francisco Heights are CONFLICT-flagged under Suntrust (both developers publish them) — NOT duplicated here. DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Washington Place', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user', note: '~40-ha flagship (~1,700 units), Aguinaldo Highway.' },
                { name: 'Gran Seville', location: 'Cabuyao, Laguna', category: 'House and Lot', source: 'user', note: '~20 ha, Spanish-inspired.' },
                { name: 'Chester Place', location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user', note: '~9.6 ha, English-inspired.' },
                { name: 'Villa San Lorenzo', location: 'Imus, Cavite', category: 'House and Lot', source: 'user', note: '~4.34 ha, Mediterranean.' },
                { name: 'Casa Laguerta', aliases: ['Casa Laguaerta'], location: 'Calamba, Laguna', category: 'House and Lot', source: 'user' },
                { name: 'Summercrest Village', location: 'Tanza, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'North Olympus IV', location: 'Quezon City', category: 'House and Lot', source: 'user', note: '~57 ha.' },
                { name: 'Greenfields Heights', location: 'Dasmariñas, Cavite', category: 'Residential Lot', source: 'user', note: 'Early farm development (1978). Distinct from Greenfield Development Corp (Campos).' },
                { name: 'Summerville', location: 'Novaliches, Quezon City', category: 'House and Lot', source: 'user', note: 'Early subdivision (~1980).' },
                { name: 'Royal Circle Townhomes', location: 'Parañaque', category: 'Town House', source: 'user' },
                { name: 'Royal Garden Townhomes', location: 'Malate, Manila', category: 'Town House', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Hillcrest Townhomes', location: 'Quezon City', category: 'Town House', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Royal Chateau', location: 'Pasay', category: 'Town House', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'New Cavite Industrial City', location: 'General Trias, Cavite', category: 'Commercial Lot', projectType: 'commercial', residential: false, source: 'user', note: 'Early industrial estate (~1981).' },
            ],
        },

        // ── Pueblo de Oro Development Corporation (ICCP Group) ──
        'Pueblo de Oro': {
            aliases: ['Pueblo de Oro Development Corporation', 'PDO'],
            group: 'ICCP',
            subsidiaryOf: 'ICCP Group',
            note: 'Member of the ICCP Group (founder Guillermo Luchangco). Flagship Pueblo de Oro Township (CDO). "Park Place" appears in Batangas/Pampanga/Cebu — modeled as location-resolved homonyms. DUAL-SOURCE 2026-08-14.',
            estates: [
                { name: 'Pueblo de Oro Township', aliases: ['Uptown CDO'], location: 'Cagayan de Oro', type: 'Township', developer: 'Pueblo de Oro Development Corporation', source: 'authoritative', confidence: 'High', note: '~400-ha flagship township.' },
                { name: 'Pueblo de Oro Townscapes Malvar', location: 'Malvar, Batangas', type: 'Township', developer: 'Pueblo de Oro Development Corporation', source: 'user' },
                { name: 'Pueblo de Oro Townscapes Mactan', location: 'Lapu-Lapu, Cebu', type: 'Township', developer: 'Pueblo de Oro Development Corporation', source: 'user' },
            ],
            projects: [
                // ── CDO township ──
                { name: 'Morning Mist Village', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Philamlife Village', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Vista Verde Village', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Golden Glow Village', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Golden Glow North', aliases: ['Golden Glow North 2'], location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Golden Glow North Commercial', location: 'Cagayan de Oro', category: 'Commercial Lot', projectType: 'commercial', residential: false, estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Hillsborough Pointe', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', source: 'user', note: 'Distinct from NorthPine/Greenfield Hillsborough (Muntinlupa).' },
                { name: 'The Courtyards at Pueblo de Oro', location: 'Cagayan de Oro', category: 'Town House', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Forest View Homes', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'San Agustin Valley Homes', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Pueblo Golf Estates', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'The Enclave at Pueblo Golf', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'The Grove at Pueblo Golf', location: 'Cagayan de Oro', category: 'Condominium', units: ['3BR'], estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Familia Apartments', aliases: ['Familia Apartments at Bamboo Lane'], location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR'], estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Bamboo Lane', location: 'Cagayan de Oro', category: 'Town House', estate: 'Pueblo de Oro Township', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Westwoods', aliases: ['Westwoods Subdivision', 'Westwood'], location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Familia Verde', location: 'Cagayan de Oro', category: 'House and Lot', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'La Aldea del Rio', location: 'Cagayan de Oro', category: 'Town House', estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Westwoods Storeys', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '2BR'], estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Masterson Mile', location: 'Cagayan de Oro', category: 'Office', projectType: 'office', residential: false, estate: 'Pueblo de Oro Township', source: 'user', note: 'Office/commercial corridor.' },
                { name: 'Masterson Mile North', location: 'Cagayan de Oro', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], estate: 'Pueblo de Oro Township', source: 'user', note: 'Five towers (~32–177 sqm).' },
                { name: 'Southridge Residences', location: 'Cagayan de Oro', category: 'Residential Lot', estate: 'Pueblo de Oro Township', source: 'user', note: 'Within Southridge mixed-use.' },
                { name: 'Regatta Square', location: 'Cagayan de Oro', category: 'Commercial Lot', projectType: 'commercial', residential: false, estate: 'Pueblo de Oro Township', source: 'user' },
                { name: 'Pueblo Business Park', location: 'Cagayan de Oro', category: 'Commercial Lot', projectType: 'commercial', residential: false, estate: 'Pueblo de Oro Township', source: 'user' },
                // ── Batangas ──
                { name: 'Horizon Residences', location: 'Sto. Tomas, Batangas', category: 'House and Lot', source: 'user' },
                { name: 'Park Place', id: 'park-place-batangas', location: 'Sto. Tomas, Batangas', category: 'Town House', match: 'context', developer: 'Pueblo de Oro Development Corporation', source: 'user', note: 'HOMONYM (Pueblo de Oro has Park Place in Batangas/Pampanga/Cebu) — resolved by location; bare "Park Place" → null.' },
                { name: 'La Aldea del Monte', location: 'Sto. Tomas, Batangas', category: 'Town House', source: 'user' },
                { name: 'Pueblo de Oro Townscapes Malvar Residences', aliases: ['PDO Townscapes The Enclave'], location: 'Malvar, Batangas', category: 'House and Lot', estate: 'Pueblo de Oro Townscapes Malvar', source: 'user' },
                { name: 'Courtyards Lipa', aliases: ['Pueblo de Oro Courtyards Lipa'], location: 'Lipa, Batangas', category: 'Town House', source: 'user' },
                { name: 'Westwoods Heights', location: 'Batangas City', category: 'House and Lot', source: 'user' },
                { name: 'PDO Luxescapes Ibaan', location: 'Ibaan, Batangas', category: 'Residential Lot', source: 'user', confidence: 'Low', note: 'Pipeline/announced mixed-use.' },
                // ── Pampanga ──
                { name: 'La Aldea Fernandina', aliases: ['La Aldea Fernandina I', 'La Aldea Fernandina II'], location: 'San Fernando, Pampanga', category: 'House and Lot', source: 'user' },
                { name: 'LAF Unihomes', location: 'San Fernando, Pampanga', category: 'House and Lot', source: 'user', note: 'Greige/Unihomes within La Aldea Fernandina II.' },
                { name: 'Park Place', id: 'park-place-pampanga', location: 'San Fernando, Pampanga', category: 'Town House', match: 'context', developer: 'Pueblo de Oro Development Corporation', source: 'user', note: 'HOMONYM — Pampanga; resolved by location.' },
                // ── Cebu (Mactan / Carcar) ──
                { name: 'La Aldea del Mar', location: 'Lapu-Lapu, Cebu', category: 'Town House', estate: 'Pueblo de Oro Townscapes Mactan', source: 'user' },
                { name: 'Park Place', id: 'park-place-mactan', aliases: ['Park Place I'], location: 'Lapu-Lapu, Cebu', category: 'House and Lot', estate: 'Pueblo de Oro Townscapes Mactan', match: 'context', developer: 'Pueblo de Oro Development Corporation', source: 'user', note: 'HOMONYM — Mactan; resolved by location.' },
                { name: 'Park Place II', location: 'Lapu-Lapu, Cebu', category: 'House and Lot', estate: 'Pueblo de Oro Townscapes Mactan', match: 'context', source: 'user', note: 'Distinct phase within Townscapes Mactan.' },
                { name: 'PDO Townhomes Carcar', location: 'Carcar, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'PDO Storeys Lapu-Lapu', aliases: ['Pueblo de Oro Storeys'], location: 'Lapu-Lapu, Cebu', category: 'Condominium', units: ['Studio'], estate: 'Pueblo de Oro Townscapes Mactan', source: 'user' },
            ],
            landmarks: [
                { name: 'PDO Townsquare Cebu', aliases: ['Pueblo de Oro Townsquare'], developer: 'Pueblo de Oro Development Corporation', location: 'Lapu-Lapu, Cebu', matchable: false, source: 'user', note: 'Retail/commercial — context only.' },
            ],
        },

        // ── Maria Luisa Properties (Cebu; founded 1965 by Mary Renner Osmeña) ──
        'Maria Luisa Properties': {
            aliases: ['Maria Luisa Properties Group', 'Maria Luisa'],
            group: 'Maria Luisa',
            note: 'Cebu high-end/residential developer; founded 1965 by Mary Renner Osmeña. Flagship Maria Luisa Estate Park (Banilad). DUAL-SOURCE 2026-08-14.',
            estates: [
                { name: 'Maria Luisa Estate Park', location: 'Banilad, Cebu City', type: 'Residential estate', developer: 'Maria Luisa Properties', source: 'authoritative', confidence: 'High', note: 'Started ~10 ha (1965), expanded to ~200 ha; Phases 8–11 + sub-enclaves.' },
            ],
            projects: [
                { name: 'The Highlands', location: 'Banilad, Cebu City', category: 'House and Lot', estate: 'Maria Luisa Estate Park', match: 'context', source: 'user', note: 'Within Maria Luisa Estate Park (Phase 9); generic — context-gated.' },
                { name: 'Mahogany Place', id: 'mahogany-place-cebu', location: 'Banilad, Cebu City', category: 'House and Lot', estate: 'Maria Luisa Estate Park', match: 'context', developer: 'Maria Luisa Properties', source: 'user', note: 'HOMONYM with DMCI’s Mahogany Place (Taguig) — resolved by location; bare → null. Within Maria Luisa Estate Park (Phase 10).' },
                { name: 'Maria Luisa North - The Heritage', location: 'Jagobiao, Mandaue City', category: 'House and Lot', match: 'context', source: 'user', note: 'Also "The Heritage" — bare form too generic; context-gated.' },
                { name: 'Dancing Sun Subdivision', aliases: ['Dancing Sun'], location: 'Carcar City, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Maryville Subdivision', aliases: ['Maryville Place'], location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user' },
                { name: 'Maryville Heights', location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user' },
                { name: 'Redstone Village', location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user' },
                { name: 'Casili Hills Subdivision', aliases: ['Casili Hills', 'Casili Groove'], location: 'Casili, Mandaue City', category: 'House and Lot', source: 'user' },
                { name: 'Kahayahay 1', aliases: ['Kahayahay'], location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user' },
                { name: 'Kahayahay 2', location: 'Talamban, Cebu City', category: 'House and Lot', source: 'user' },
                { name: '8 Maria Luisa', location: 'Banilad, Cebu City', category: 'House and Lot', estate: 'Maria Luisa Estate Park', source: 'user' },
            ],
        },

        // ── Pro Friends (Property Company of Friends; owner Guillermo Choa) ──
        'Pro Friends': {
            aliases: ['Property Company of Friends', 'Profriends', 'Property Company of Friends Inc'],
            group: 'Pro Friends',
            note: 'Low-cost/mass housing; owner Guillermo Choa. Flagship Lancaster New City (Kawit/Imus/Gen Trias, Cavite; 60,000+ homes). No Villar/Golden MV ownership asserted (unverified). DUAL-SOURCE 2026-08-14.',
            estates: [
                { name: 'Lancaster New City', location: 'Kawit / Imus / General Trias, Cavite', type: 'Township', developer: 'Property Company of Friends', source: 'authoritative', confidence: 'High', note: 'Flagship township; districts Glenbrook, Manchester, Somerset, Kensington.' },
                { name: 'Micara Estates', location: 'Tanza, Cavite', type: 'Residential estate', developer: 'Property Company of Friends', source: 'user' },
            ],
            projects: [
                { name: 'Westwind at Lancaster New City', aliases: ['Westwind'], location: 'Kawit, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Lancaster New City', source: 'user' },
                { name: 'Lamore at Micara Estates', aliases: ['Lamore'], location: 'Tanza, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Micara Estates', source: 'user' },
                { name: 'Minami Residences', location: 'General Trias, Cavite', category: 'House and Lot', source: 'user', note: 'Distinct from Cathay’s Minami Saki.' },
                { name: 'Bellefort Estates', aliases: ['Bellefort Estate'], location: 'Bacoor, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Carmona Estates', location: 'Carmona, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Parc Regency Residences', location: 'Pavia, Iloilo', category: 'House and Lot', source: 'user' },
                { name: 'Parc Regency Greens', location: 'Pavia, Iloilo', category: 'House and Lot', source: 'user' },
                { name: 'Monticello Villas', aliases: ['Montecillo Villas'], location: 'Pavia, Iloilo', category: 'Town House', source: 'user' },
                { name: 'Monticello Intimo', location: 'Iloilo', category: 'Town House', source: 'user' },
                { name: 'Merrydale Homes St. Joseph', location: 'Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Merrydale Homes', location: 'Sta. Barbara, Iloilo', category: 'House and Lot', match: 'context', source: 'user', note: 'Homonym-ish across Cavite/Iloilo sites; context-gated.' },
                { name: 'Ilustrata Residences', aliases: ['Illustrata Residences'], location: 'Cubao, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '3BR'], source: 'user' },
                { name: 'Las Verandas Villas II', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Garden Grove Village', aliases: ['Garden Gove Village'], location: 'Dasmariñas, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Montefaro Village', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Cedar Residences', location: 'Carmona, Cavite', category: 'House and Lot', source: 'user', note: 'Distinct from DMCI Cedar Crest.' },
                { name: 'Greensborough Subdivision', aliases: ['Greensborough'], location: 'Dasmariñas, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Avignon Place', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'California West Hills', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Chateau Real', location: 'General Trias, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Chesapeake Village', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Gold Crest Villas', location: 'Trece Martires, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Jardin de Madrid Villas', location: 'Bacoor, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'North East Primarosa', location: 'Imus, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Palm Grove Village', location: 'Imus, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Distinct from DMCI Palm Grove Residences; generic — context-gated.' },
                { name: 'Mahogany Mansion', location: 'Mandaluyong', category: 'House and Lot', source: 'user', note: 'Distinct from the Mahogany Place homonyms.' },
                { name: 'One Primerose Place', aliases: ['One Primrose Place'], location: 'Mandaluyong', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
            ],
        },

        // ── ACM Homes / ACM Landholdings (Cavite affordable/mid) ──
        'ACM Homes': {
            aliases: ['ACM Landholdings', 'ACM'],
            group: 'ACM',
            note: 'Cavite affordable/mid (ACM Landholdings). Pacific Terraces is a partnership with Philippine Transmarine Carriers (PTC; crew management — marketing partner, possibly parent; FLAGGED). DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'ACM Homes', location: 'Imus, Cavite', category: 'House and Lot', source: 'user', note: 'First project.' },
                { name: 'ACM Sherwood Homes', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Pacific Terraces Community', aliases: ['Pacific Terraces', 'Pacific Terraces North', 'PTC'], location: 'Imus, Cavite', category: 'House and Lot', jv: 'ACM Homes + Philippine Transmarine Carriers (marketing partnership)', source: 'user', note: 'Seafarer-focused; PTC partnership (marketing; possibly parent — flagged).' },
                { name: 'Pacific Terraces Community South', aliases: ['PTC South', 'Pacific Terraces South'], location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'PTC Suncrest', aliases: ['Pacific Terraces Community Suncrest'], location: 'Carsadang Bago, Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Hana South', aliases: ['Hana Townhomes'], location: 'Cabuco, Trece Martires, Cavite', category: 'Town House', source: 'user' },
                { name: 'Salas Real', aliases: ['Salas Real Residences'], location: 'Tacas, Jaro, Iloilo', category: 'House and Lot', source: 'user' },
                { name: 'Richmond Park Townhomes', location: 'Navarro, General Trias, Cavite', category: 'Town House', source: 'user' },
                { name: 'Richwood Townhomes', aliases: ['Richwood'], location: 'General Trias, Cavite', category: 'Town House', source: 'user', note: 'Distinct from Primary Homes’ Richwood Homes.' },
                { name: 'Peninsula Homes', aliases: ['Peninsula'], location: 'General Trias, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Mahogany Place', id: 'mahogany-place-lipa', aliases: ['Mahogany Place Lipa'], location: 'Lipa, Batangas', category: 'House and Lot', match: 'context', developer: 'ACM Homes', source: 'user', note: 'THIRD "Mahogany Place" homonym (ACM, Lipa) — with DMCI Taguig + Maria Luisa Cebu. Resolved by location; bare → null.' },
                { name: 'Ventis Villas', location: 'Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Pacific Renaissance Villas', location: 'Anabu, Imus, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Pacific Woods West', location: 'Imus, Cavite', category: 'Town House', source: 'user' },
                { name: 'Woodcrest Homes', location: 'Trece Martires, Cavite', category: 'House and Lot', source: 'user', note: 'Distinct from Primary Homes’ Woodcrest Residences (Cebu).' },
            ],
        },

        // ── Don Tim Development Corporation (founded 1981 by Agustin Leong) ──
        'Don Tim Development': {
            aliases: ['Don Tim Development Corporation', 'DTDC', 'Don Tim'],
            group: 'Don Tim',
            note: 'Founded 1981 by Agustin Leong; ~70 ha across Cavite (Tagaytay/Alfonso/Silang). DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Monte Vista', location: 'Tagaytay City, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'First major Tagaytay community; generic — context-gated.' },
                { name: 'Alta Monte', aliases: ['Alta Monte Tagaytay'], location: 'Magallanes Drive, Tagaytay City, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Leisure Suites Condominiums', aliases: ['Alta Monte Leisure Suites', 'Leisure Suites'], location: 'Tagaytay City, Cavite', category: 'Condominium', units: ['Studio', '1BR', '2BR'], source: 'user', note: 'Within/adjacent Alta Monte.' },
                { name: 'Montebello', id: 'montebello-alfonso', aliases: ['Alta Montebello', 'Montebello Metro Tagaytay', 'Montebello Village'], location: 'Alfonso, Cavite', category: 'House and Lot', match: 'context', developer: 'Don Tim Development Corporation', source: 'user', note: 'HOMONYM / possible-same as Filinvest’s Montebello (Cavite) — FLAGGED. Resolved by location; bare → null.' },
                { name: 'South Midland', location: 'Silang, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'West Midland', aliases: ['The West Midland'], location: 'Silang, Cavite', category: 'House and Lot', source: 'user', note: 'Newest (groundbreaking ~2025).' },
            ],
        },

        // ── Paramount Property Ventures (Cebu / Minglanilla) ──
        'Paramount Property Ventures': {
            aliases: ['Paramount Property Ventures Inc', 'Paramount'],
            group: 'Paramount',
            note: 'Cebu (Minglanilla) residential developer. DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'Residences of Coral Bay', aliases: ['Coral Bay'], location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Zen Residences at Vizkaya', aliases: ['Vizkaya Zen Residences', 'Zen Residences'], location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Fonte di Versailles', aliases: ['Fonte Versailles'], location: 'Minglanilla, Cebu', category: 'House and Lot', source: 'user', note: 'Coastal.' },
                { name: 'The Mazari Cove', location: 'Inayagan, Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'The Wellington', aliases: ['Wellington Greens'], location: 'Compostela, Cebu', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Francesca Highlands', location: 'Cadulawan, Minglanilla, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'La Cresta Hills Subdivision', aliases: ['La Cresta Hills'], location: 'Carcar City, Cebu', category: 'House and Lot', source: 'user' },
                { name: 'Segovia South Villas Subdivision', aliases: ['Segovia South Villas'], location: 'Carcar City, Cebu', category: 'House and Lot', source: 'user' },
            ],
        },

        // ── GeoEstate Development (Metro Manila + Cavite; The Beacon flagship) ──
        'GeoEstate Development': {
            aliases: ['GeoEstate Development Corporation', 'GeoEstate'],
            group: 'GeoEstate',
            note: 'Metro Manila + Cavite; The Beacon flagship. DUAL-SOURCE 2026-08-14.',
            projects: [
                { name: 'The Beacon', location: 'Chino Roces / Arnaiz, Makati', category: 'Condominium', units: ['Studio', '1BR', '2BR', '3BR'], source: 'user', note: 'Three-tower; penthouse units.' },
                { name: 'Soluna', location: 'Bacoor, Cavite', category: 'House and Lot', match: 'context', source: 'user', note: 'Generic — context-gated.' },
                { name: 'Sonria', aliases: ['Sonria Condominium'], location: 'Madrigal Business Park, Alabang, Muntinlupa', category: 'Condominium', units: ['1BR', '2BR', '3BR'], source: 'user' },
                { name: 'Solviento', aliases: ['Solviento Villas'], location: 'Bacoor, Cavite', category: 'House and Lot', source: 'user' },
                { name: 'Exportbank Plaza', location: 'Makati', category: 'Office', projectType: 'office', residential: false, source: 'user' },
            ],
        },

        // ── Nuvoland Philippines (boutique QC; Jimenez/GMA + Belmonte/Phil. Star) ──
        'Nuvoland Philippines': {
            aliases: ['Nuvoland', 'Nuvoland Philippines Inc'],
            group: 'Nuvoland',
            note: 'Boutique QC/Metro Manila developer (est. 2006); led by Menardo Jimenez (GMA Network) + Kevin Belmonte (Philippine Star). DUAL-SOURCE 2026-08-14.',
            estates: [
                { name: 'Nuvo City', aliases: ['Nuvo District'], location: 'Bagumbayan, Quezon City', type: 'Mixed-use estate', developer: 'Nuvoland Philippines', source: 'authoritative', confidence: 'High', note: 'C-5 cor Calle Industria; master-planned (Aspire/Dream towers + Nuvo Plaza).' },
            ],
            projects: [
                { name: 'The Infinity Tower', aliases: ['Infinity at the Fort', 'The Infinity'], location: 'BGC, Taguig', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Bonifacio Global City', source: 'user', note: 'Mixed-use; residential turned over ~2011. Also office.' },
                { name: 'Aspire Tower', location: 'Bagumbayan, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Nuvo City', match: 'context', source: 'user', note: 'Within Nuvo City; generic — context-gated. Distinct from PHINMA Aspire Homes.' },
                { name: 'Dream Tower', location: 'Bagumbayan, Quezon City', category: 'Condominium', units: ['Studio', '1BR', '2BR'], estate: 'Nuvo City', match: 'context', source: 'user', note: 'Within Nuvo City; generic — context-gated.' },
                { name: 'Nuvo Plaza', location: 'Bagumbayan, Quezon City', category: 'Office', projectType: 'office', residential: false, estate: 'Nuvo City', source: 'user' },
            ],
        },

    };

    // ── Names too generic / short to feed the substring+fuzzy matcher safely.
    // A local guard on top of the engine's own PROJECT_STOP_WORDS.
    const MIN_NAME_LEN = 6;

    // Generic location segments that must never act as evidence or disambiguation
    // tokens on their own ("Quezon City" → keep "quezon", drop "city").
    const _GENERIC_LOC = new Set(['city', 'del', 'de', 'la', 'las', 'los', 'san',
        'santa', 'sta', 'norte', 'sur', 'east', 'west', 'north', 'south', 'metro',
        'new', 'the', 'village', 'park']);

    // Build a fast lookup of the names already known to the engine so we never
    // push a duplicate (case- and separator-insensitive).
    function _norm(s) {
        return (global.RM_MATCH && global.RM_MATCH.normalizeSeparators
            ? global.RM_MATCH.normalizeSeparators(s)
            : (s || '').replace(/\s+/g, ' ').trim()).toLowerCase();
    }

    // Flatten every project into a list, and index by normalized name/alias so
    // Listing Detail and other callers can look up highlights for a matched
    // project. Towers are indexed separately so they resolve to their parent
    // project rather than being treated as projects.
    const _byName = {};   // normalized name/alias -> first project record (single lookup)
    const _byNameList = {}; // normalized canonical name -> ALL records (homonyms)
    const _allProjects = [];
    const _byEstate = {};  // normalized estate name/alias -> estate record
    const _allEstates = [];
    const _byLandmark = {}; // normalized landmark name/alias -> landmark record
    const _allLandmarks = []; // malls/landmarks: location context, NEVER a project

    for (const [developer, info] of Object.entries(DEVELOPERS)) {
        for (const p of (info.projects || [])) {
            const rec = { developer, group: info.group, ...p };
            _allProjects.push(rec);
            const _nk = _norm(p.name);
            // Homonyms (same canonical name, different locations — e.g. two "Valle
            // Verde") all go in the list; _byName keeps the first for single lookups.
            (_byNameList[_nk] = _byNameList[_nk] || []).push(rec);
            if (!_byName[_nk]) _byName[_nk] = rec;
            (p.aliases || []).forEach(a => { if (!_byName[_norm(a)]) _byName[_norm(a)] = rec; });
            // Towers resolve to the parent project (so "Amaia Steps Pasig Aria"
            // or a bare tower mention maps back to the project, not a new one).
            (p.towers || []).forEach(t => {
                const composite = _norm(p.name + ' ' + t);
                if (!_byName[composite]) _byName[composite] = rec;
            });
        }
        for (const e of (info.estates || [])) {
            // An estate's owning developer defaults to the entry it's listed
            // under, but a per-estate `developer` (e.g. Avida's South Park
            // District under the Ayala Land entry) overrides it.
            const erec = { developer: e.developer || developer, group: info.group, ...e };
            _allEstates.push(erec);
            _byEstate[_norm(e.name)] = erec;
            (e.aliases || []).forEach(a => { if (!_byEstate[_norm(a)]) _byEstate[_norm(a)] = erec; });
        }
        // Landmarks (malls, retail centers, transit hubs): useful location context
        // but NOT sellable projects. Third entity type: Project / Estate / Landmark.
        for (const l of (info.landmarks || [])) {
            const lrec = { developer: l.developer || developer, group: info.group, matchable: false, type: 'landmark', ...l };
            _allLandmarks.push(lrec);
            _byLandmark[_norm(l.name)] = lrec;
            (l.aliases || []).forEach(a => { if (!_byLandmark[_norm(a)]) _byLandmark[_norm(a)] = lrec; });
        }
    }

    // Does a project belong to an estate? True if it carries an explicit
    // `estate:` link, or its name/location/aliases reference the estate's name
    // or any alias (case/separator-insensitive substring). This lets existing
    // projects resolve into estates without hand-linking every record.
    function _projectInEstate(p, estate) {
        if (p.estate && _norm(p.estate) === _norm(estate.name)) return true;
        const hay = _norm([p.name, p.location, ...(p.aliases || [])].filter(Boolean).join(' '));
        const needles = [estate.name, ...(estate.aliases || [])].map(_norm);
        return needles.some(n => n.length >= 4 && hay.includes(n));
    }

    // ── Feed safe, specific names into the live matcher array ──
    function registerWithMatcher() {
        const M = global.RM_MATCH;
        if (!M || !Array.isArray(M.KNOWN_PROJECTS)) return 0;
        const existing = new Set(M.KNOWN_PROJECTS.map(_norm));
        const stop = M.COMPANY_NAME_SET || new Set();
        let added = 0;
        const consider = (name) => {
            if (!name) return;
            const n = _norm(name);
            if (n.length < MIN_NAME_LEN) return;          // too short/generic
            if (existing.has(n)) return;                   // already known
            if (stop.has && stop.has(n)) return;           // is a brand/location
            M.KNOWN_PROJECTS.push(name);
            existing.add(n);
            added++;
        };
        const gate = M.CONTEXT_GATED_PROJECTS;
        // Feed estate/township names + developer names to the engine as context
        // "evidence" — so a context-gated project resolves when the post names its
        // estate (e.g. "The Pinnacle Iloilo Business Park") or developer.
        const ev = M.CONTEXT_EVIDENCE;
        if (ev && ev.add) {
            for (const e of _allEstates) {
                ev.add(_norm(e.name));
                (e.aliases || []).forEach(a => ev.add(_norm(a)));
            }
            for (const [devName, info] of Object.entries(DEVELOPERS)) {
                ev.add(_norm(devName));
                (info.aliases || []).forEach(a => ev.add(_norm(a)));
            }
            // Landmarks are location context (a post naming "Power Plant Mall" is a
            // real listing) — fed as evidence, NEVER as a matchable project.
            for (const l of _allLandmarks) {
                ev.add(_norm(l.name));
                (l.aliases || []).forEach(a => ev.add(_norm(a)));
            }
            // A context-gated project contributes its own location tokens as evidence,
            // so a qualified mention passes the gate even for cities absent from the
            // engine's base location table ("Valle Verde Davao" — davao). Generic
            // segments (city/de/san/…) are skipped so they can't weaken the gate.
            for (const p of _allProjects) {
                if (p.match === 'context' && p.location) {
                    _norm(p.location).split(/[ ,]+/).forEach(tok => {
                        if (tok.length >= 4 && !_GENERIC_LOC.has(tok)) ev.add(tok);
                    });
                }
            }
        }
        for (const p of _allProjects) {
            // Every real project is fed — including offices/commercial. Category
            // filtering (Residential/Office/Commercial/Lot) happens AFTER matching,
            // downstream; `residential:false` categorizes, it does NOT unmatch.
            consider(p.name);
            (p.aliases || []).forEach(consider);
            // Context-gated names (match:'context') are registered with the engine
            // so a bare generic mention won't resolve without a proper-noun signal.
            if (p.match === 'context' && gate && gate.add) {
                gate.add(_norm(p.name));
                (p.aliases || []).forEach(a => gate.add(_norm(a)));
            }
            // Exact-only names (near-twins of a different real project) never fuzzy.
            if (p.match === 'exact' && M.EXACT_ONLY_PROJECTS && M.EXACT_ONLY_PROJECTS.add) {
                M.EXACT_ONLY_PROJECTS.add(_norm(p.name));
                (p.aliases || []).forEach(a => M.EXACT_ONLY_PROJECTS.add(_norm(a)));
            }
            // NOTE: `towers` metadata stays non-matchable; real sub-towers are their
            // own project records with projectType:'tower' + parentProjectId.
        }
        return added;
    }

    const addedCount = registerWithMatcher();

    // ── Public API ──
    global.RM_DEVELOPERS = {
        DEVELOPERS,
        all: _allProjects,
        // Look up the full project record (with highlights fields) for a name,
        // alias, or "project + tower" string. Returns the FIRST record if the name
        // is a homonym; use getProjects()/resolveProject() to disambiguate.
        getProject(name) {
            if (!name) return null;
            return _byName[_norm(name)] || null;
        },
        // ALL project records sharing a canonical name — homonyms like the two
        // "Valle Verde" entities (Pasig village vs Sta. Lucia's Davao project).
        getProjects(name) {
            if (!name) return [];
            const list = _byNameList[_norm(name)];
            if (list && list.length) return list;
            const one = _byName[_norm(name)];
            return one ? [one] : [];
        },
        // Resolve a post to the correct project ENTITY, disambiguating homonyms by
        // the location mentioned in the text. Returns null when a (gated) name has
        // no context, or when a homonym stays ambiguous (bare "Valle Verde") — the
        // architecture resolves "Valle Verde Pasig"→Pasig, "Valle Verde Davao"→Davao,
        // but "Valle Verde" alone → null.
        resolveProject(text) {
            const M = global.RM_MATCH;
            const name = (M && M.extractProject) ? M.extractProject(text) : null;
            if (!name) return null;
            const list = this.getProjects(name);
            if (list.length <= 1) return list[0] || null;
            const t = ' ' + _norm(text) + ' ';
            const hits = list.filter(r => r.location &&
                _norm(r.location).split(/[ ,]+/).some(tok =>
                    tok.length >= 4 && !_GENERIC_LOC.has(tok) && t.includes(' ' + tok + ' ')));
            return hits.length === 1 ? hits[0] : null;
        },
        // Which developer owns a given project name? (null if unknown)
        getDeveloper(name) {
            const p = this.getProject(name);
            return p ? p.developer : null;
        },
        // A compact, human-readable highlight line for Listing Detail, composed
        // from the structured fields, e.g.:
        //   "Avida Land · Condominium · Parañaque · Studio / 1BR / 2BR"
        getHighlight(name) {
            const p = this.getProject(name);
            if (!p) return null;
            const parts = [p.developer];
            parts.push(p.subtype ? `${p.subtype} ${p.category}` : p.category);
            if (p.location) parts.push(p.location);
            if (p.units && p.units.length) parts.push(p.units.join(' / '));
            return parts.join(' · ');
        },
        // ── Estate / CBD / township layer ──
        estates: _allEstates,
        // Look up an estate record by name or alias (null if unknown).
        getEstate(name) {
            if (!name) return null;
            return _byEstate[_norm(name)] || null;
        },
        // Which developer/group owns an estate? (null if unknown)
        getEstateDeveloper(name) {
            const e = this.getEstate(name);
            return e ? e.developer : null;
        },
        // All projects that belong to an estate — by explicit `estate:` link or
        // by name/location reference. Returns [] for an unknown estate.
        getProjectsInEstate(name) {
            const e = this.getEstate(name);
            if (!e) return [];
            return _allProjects.filter(p => _projectInEstate(p, e));
        },
        // If a piece of text mentions a known estate, return that estate record
        // (earliest match). Useful as a location/developer disambiguation signal
        // when no project name is present. Estates are NOT project matches.
        detectEstate(text) {
            if (!text) return null;
            const hay = _norm(text);
            let best = null, at = Infinity;
            for (const e of _allEstates) {
                for (const key of [e.name, ...(e.aliases || [])]) {
                    const k = _norm(key);
                    if (k.length < 4) continue;
                    const i = hay.indexOf(k);
                    if (i !== -1 && i < at) { at = i; best = e; }
                }
            }
            return best;
        },
        // Names of every estate (canonical), for listings/filters.
        listEstates() { return _allEstates.map(e => e.name); },

        // ── Landmarks (malls / retail / transit) — context only, never projects ──
        landmarks: _allLandmarks,
        getLandmark(name) {
            if (!name) return null;
            return _byLandmark[_norm(name)] || null;
        },
        listLandmarks() { return _allLandmarks.map(l => l.name); },
        // Classify a name across the three entity types (or null if unknown).
        entityType(name) {
            if (this.getProject(name)) return 'project';
            if (this.getEstate(name)) return 'estate';
            if (this.getLandmark(name)) return 'landmark';
            return null;
        },

        // ── Project hierarchy (parent development ↔ tower / village / child) ──
        // Resolve a child (tower/village) to its parent development record.
        getParent(name) {
            const p = this.getProject(name);
            if (!p || !p.parentProjectId) return null;
            return this.getProject(p.parentProjectId);
        },
        // All child records (towers/villages) of a parent development.
        getChildren(name) {
            const p = this.getProject(name);
            const key = _norm(p ? p.name : name);
            return _allProjects.filter(c => c.parentProjectId && _norm(c.parentProjectId) === key);
        },

        // ── Category + provenance accessors ──
        // False only when a record is explicitly non-residential (office/commercial).
        // Matching still returns these; the caller filters by category afterward.
        isResidential(name) {
            const p = this.getProject(name);
            return p ? (p.residential !== false) : null;
        },
        // Attribution provenance: 'authoritative' | 'user' | 'inferred' | 'unverified'.
        // Defaults to 'user' (came from the supplied dataset, not independently verified).
        getSource(name) {
            const p = this.getProject(name);
            return p ? (p.source || 'user') : null;
        },

        // How many names this file contributed to the live matcher this load.
        _registeredCount: addedCount,
    };

})(typeof window !== 'undefined' ? window : this);
