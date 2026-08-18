/* ==========================================================================
 * Realmate — Shared Philippine Location Engine
 * --------------------------------------------------------------------------
 * ONE source of truth for location intelligence, used by the Portal
 * (livemarket.js) and the Listing Detail page so the two can never drift.
 *
 * Understands the real PH hierarchy:
 *     Region  →  Province  →  City / Municipality  →  District / Barangay / CBD
 *
 * Why this exists (the bug it fixes): a post that says "New Manila, Quezon
 * City" used to surface BOTH "Manila" (City of Manila) and "Quezon City",
 * because the old extractor did a plain substring match — the letters
 * "manila" inside "new manila" tripped the Manila-city keyword. New Manila
 * is actually a BARANGAY of Quezon City, so the only location is Quezon City.
 *
 * How it's intelligent:
 *   1. Aliases are scanned with WORD BOUNDARIES, longest-first, in a single
 *      left-to-right pass. Once "new manila" is consumed the scanner moves
 *      past it, so the inner "manila" can never re-match. This also lets
 *      "Quezon City" win over the province "Quezon", "Metro Manila" win over
 *      the city "Manila", etc. — no manual range bookkeeping needed.
 *   2. Every barangay / district / CBD resolves to its parent CITY, so
 *      "Salcedo Village" → Makati, "New Manila" → Quezon City, "BGC" → Taguig.
 *   3. Redundant parents collapse: a province is dropped when one of its
 *      cities is already present; a region is dropped when any city/province
 *      is present. So "Bacoor, Cavite" never also lists a bare "Cavite", and
 *      "Quezon City, Metro Manila" never lists the region separately.
 *   4. Ambiguity rule: if a post still resolves to two or more DIFFERENT
 *      cities (often just a confused writer, e.g. "Quezon City, Manila"), the
 *      display uses the FIRST city mentioned. Matching/filtering still see
 *      every city so a demand-side post can match in all its target areas.
 *
 * Public API (attached to window.RM_LOC):
 *   extract(text)          → [{display, sub, city, province, region, type}]  (mention order, resolved)
 *   extractCities(text)    → ["Quezon City", ...]   canonical tags for filter + Match Engine
 *   displayLocation(text)  → "New Manila, Quezon City"  best single string for a highlight
 *   aliasList()            → all raw alias strings (for text-stripping helpers)
 *
 * The dataset below is deep for Metro Manila (where most listings and the CBD
 * boom are) and broad for the rest of the country (all regions + provinces +
 * the major cities / growth-center CBDs). It is pure data — extending barangay
 * coverage for any city is just adding rows; no algorithm changes needed.
 * ========================================================================== */
(function (global) {
  'use strict';

  // ---- 17 Regions: canonical -> aliases -------------------------------------
  const REGIONS = {
    'NCR':          ['ncr', 'metro manila', 'metropolitan manila', 'national capital region', 'kamaynilaan'],
    // NOTE: no bare 'car' alias — it collides with "2 car garage" / "car park".
    'CAR':          ['cordillera', 'cordillera administrative region'],
    'Ilocos Region':['ilocos region', 'region i', 'region 1'],
    'Cagayan Valley':['cagayan valley', 'region ii', 'region 2'],
    'Central Luzon':['central luzon', 'region iii', 'region 3'],
    'CALABARZON':   ['calabarzon', 'region iv-a', 'region 4a', 'southern tagalog'],
    'MIMAROPA':     ['mimaropa', 'region iv-b', 'region 4b'],
    'Bicol Region': ['bicol region', 'bicol', 'region v', 'region 5'],
    'Western Visayas':['western visayas', 'region vi', 'region 6'],
    'Central Visayas':['central visayas', 'region vii', 'region 7'],
    'Eastern Visayas':['eastern visayas', 'region viii', 'region 8'],
    'Zamboanga Peninsula':['zamboanga peninsula', 'region ix', 'region 9'],
    'Northern Mindanao':['northern mindanao', 'region x', 'region 10'],
    'Davao Region': ['davao region', 'region xi', 'region 11'],
    'SOCCSKSARGEN': ['soccsksargen', 'region xii', 'region 12'],
    'Caraga':       ['caraga', 'region xiii', 'region 13'],
    'BARMM':        ['barmm', 'bangsamoro', 'armm'],
  };

  // ---- Provinces: canonical -> {region, aliases} ----------------------------
  // "province" aliases are the plain name; the city that shares a name (e.g.
  // Cebu City, Iloilo City) is defined separately with a longer alias so it
  // wins the longest-first scan.
  const PROVINCES = {
    // NCR is a region, not a province; "Metro Manila" is handled as a region.
    // CAR
    'Abra': 'CAR', 'Apayao': 'CAR', 'Benguet': 'CAR', 'Ifugao': 'CAR', 'Kalinga': 'CAR', 'Mountain Province': 'CAR',
    // Ilocos
    'Ilocos Norte': 'Ilocos Region', 'Ilocos Sur': 'Ilocos Region', 'La Union': 'Ilocos Region', 'Pangasinan': 'Ilocos Region',
    // Cagayan Valley
    'Batanes': 'Cagayan Valley', 'Cagayan': 'Cagayan Valley', 'Isabela': 'Cagayan Valley', 'Nueva Vizcaya': 'Cagayan Valley', 'Quirino': 'Cagayan Valley',
    // Central Luzon
    'Aurora': 'Central Luzon', 'Bataan': 'Central Luzon', 'Bulacan': 'Central Luzon', 'Nueva Ecija': 'Central Luzon', 'Pampanga': 'Central Luzon', 'Tarlac': 'Central Luzon', 'Zambales': 'Central Luzon',
    // CALABARZON
    'Batangas': 'CALABARZON', 'Cavite': 'CALABARZON', 'Laguna': 'CALABARZON', 'Quezon': 'CALABARZON', 'Rizal': 'CALABARZON',
    // MIMAROPA
    'Marinduque': 'MIMAROPA', 'Occidental Mindoro': 'MIMAROPA', 'Oriental Mindoro': 'MIMAROPA', 'Palawan': 'MIMAROPA', 'Romblon': 'MIMAROPA',
    // Bicol
    'Albay': 'Bicol Region', 'Camarines Norte': 'Bicol Region', 'Camarines Sur': 'Bicol Region', 'Catanduanes': 'Bicol Region', 'Masbate': 'Bicol Region', 'Sorsogon': 'Bicol Region',
    // Western Visayas
    'Aklan': 'Western Visayas', 'Antique': 'Western Visayas', 'Capiz': 'Western Visayas', 'Guimaras': 'Western Visayas', 'Iloilo': 'Western Visayas', 'Negros Occidental': 'Western Visayas',
    // Central Visayas
    'Bohol': 'Central Visayas', 'Cebu': 'Central Visayas', 'Negros Oriental': 'Central Visayas', 'Siquijor': 'Central Visayas',
    // Eastern Visayas
    'Biliran': 'Eastern Visayas', 'Eastern Samar': 'Eastern Visayas', 'Leyte': 'Eastern Visayas', 'Northern Samar': 'Eastern Visayas', 'Samar': 'Eastern Visayas', 'Southern Leyte': 'Eastern Visayas',
    // Zamboanga Peninsula
    'Zamboanga del Norte': 'Zamboanga Peninsula', 'Zamboanga del Sur': 'Zamboanga Peninsula', 'Zamboanga Sibugay': 'Zamboanga Peninsula',
    // Northern Mindanao
    'Bukidnon': 'Northern Mindanao', 'Camiguin': 'Northern Mindanao', 'Lanao del Norte': 'Northern Mindanao', 'Misamis Occidental': 'Northern Mindanao', 'Misamis Oriental': 'Northern Mindanao',
    // Davao Region
    'Davao de Oro': 'Davao Region', 'Davao del Norte': 'Davao Region', 'Davao del Sur': 'Davao Region', 'Davao Occidental': 'Davao Region', 'Davao Oriental': 'Davao Region',
    // SOCCSKSARGEN
    'Cotabato': 'SOCCSKSARGEN', 'Sarangani': 'SOCCSKSARGEN', 'South Cotabato': 'SOCCSKSARGEN', 'Sultan Kudarat': 'SOCCSKSARGEN',
    // Caraga
    'Agusan del Norte': 'Caraga', 'Agusan del Sur': 'Caraga', 'Dinagat Islands': 'Caraga', 'Surigao del Norte': 'Caraga', 'Surigao del Sur': 'Caraga',
    // BARMM
    'Basilan': 'BARMM', 'Lanao del Sur': 'BARMM', 'Maguindanao del Norte': 'BARMM', 'Maguindanao del Sur': 'BARMM', 'Sulu': 'BARMM', 'Tawi-Tawi': 'BARMM',
  };
  // Extra province aliases where the plain name is ambiguous or commonly
  // abbreviated. An EMPTY array means "keep the province in the hierarchy for
  // city→region resolution, but never match it by bare name" — used for
  // provinces whose name is also a common street/word and would false-fire:
  //   Aurora   → "Aurora Blvd/Ave" (a major QC/Manila road)
  //   Quezon   → "Quezon Ave/City"  (would shadow Quezon City / a street name)
  //   Antique  → "antique furniture / fixtures"
  const PROVINCE_ALIASES = {
    'Davao del Sur': ['davao del sur'], 'Davao del Norte': ['davao del norte'],
    'Negros Occidental': ['negros occidental'], 'Negros Oriental': ['negros oriental'],
    'Camarines Sur': ['camarines sur', 'camsur'], 'Camarines Norte': ['camarines norte'],
    'South Cotabato': ['south cotabato'], 'La Union': ['la union'], 'Nueva Ecija': ['nueva ecija'],
    'Nueva Vizcaya': ['nueva vizcaya'], 'Mountain Province': ['mountain province'],
    'Aurora': [], 'Quezon': [], 'Antique': [], 'Quirino': [],
  };

  // ---- NCR cities: canonical bare name -> aliases ---------------------------
  const NCR_CITIES = {
    'Manila':        ['manila city', 'city of manila', 'manila'],
    'Quezon City':   ['quezon city', 'q.c.', 'qc'],
    'Makati':        ['makati city', 'makati'],
    'Taguig':        ['taguig city', 'taguig'],
    'Pasig':         ['pasig city', 'pasig'],
    'Mandaluyong':   ['mandaluyong city', 'mandaluyong'],
    'San Juan':      ['san juan city', 'san juan'],
    'Pasay':         ['pasay city', 'pasay'],
    'Parañaque':     ['parañaque city', 'paranaque city', 'parañaque', 'paranaque'],
    'Las Piñas':     ['las piñas city', 'las pinas city', 'las piñas', 'las pinas'],
    'Muntinlupa':    ['muntinlupa city', 'muntinlupa'],
    'Marikina':      ['marikina city', 'marikina'],
    'Valenzuela':    ['valenzuela city', 'valenzuela'],
    'Caloocan':      ['caloocan city', 'kalookan', 'caloocan'],
    'Malabon':       ['malabon city', 'malabon'],
    'Navotas':       ['navotas city', 'navotas'],
    'Pateros':       ['pateros'],
  };

  // ---- Provincial cities / municipalities: "City, Province" -> {prov, aliases}
  // The display keeps the province suffix (matches the existing convention),
  // so "Bacoor" shows as "Bacoor, Cavite". Focused on real-estate growth areas.
  const PROV_CITIES = {
    // Cavite
    'Bacoor, Cavite': ['bacoor'], 'Imus, Cavite': ['imus'], 'Dasmariñas, Cavite': ['dasmariñas', 'dasmarinas'],
    'General Trias, Cavite': ['general trias', 'gen. trias', 'gentri'], 'Tagaytay, Cavite': ['tagaytay'],
    'Silang, Cavite': ['silang'], 'Kawit, Cavite': ['kawit'], 'Trece Martires, Cavite': ['trece martires'],
    'Carmona, Cavite': ['carmona'],
    // Laguna
    'Sta. Rosa, Laguna': ['santa rosa', 'sta. rosa', 'sta rosa'], 'Calamba, Laguna': ['calamba'],
    'Biñan, Laguna': ['biñan', 'binan'], 'San Pedro, Laguna': ['san pedro'], 'Cabuyao, Laguna': ['cabuyao'],
    'Los Baños, Laguna': ['los baños', 'los banos'], 'Sta. Cruz, Laguna': ['sta. cruz, laguna', 'santa cruz, laguna'],
    // Rizal
    'Antipolo, Rizal': ['antipolo'], 'Cainta, Rizal': ['cainta'], 'Taytay, Rizal': ['taytay'],
    'San Mateo, Rizal': ['san mateo'], 'Rodriguez, Rizal': ['rodriguez, rizal', 'montalban'],
    // Bulacan
    'Meycauayan, Bulacan': ['meycauayan'], 'Marilao, Bulacan': ['marilao'], 'San Jose del Monte, Bulacan': ['san jose del monte', 'sjdm'],
    'Malolos, Bulacan': ['malolos'], 'Sta. Maria, Bulacan': ['sta. maria, bulacan', 'santa maria, bulacan'], 'Bocaue, Bulacan': ['bocaue'],
    // Pampanga
    'Angeles City, Pampanga': ['angeles city', 'angeles'], 'San Fernando, Pampanga': ['san fernando, pampanga'],
    'Mabalacat, Pampanga': ['mabalacat'],
    // Batangas
    'Batangas City, Batangas': ['batangas city'], 'Lipa, Batangas': ['lipa'], 'Sto. Tomas, Batangas': ['sto. tomas', 'santo tomas'],
    'Nasugbu, Batangas': ['nasugbu'], 'Lemery, Batangas': ['lemery'],
    // Pangasinan / La Union / Ilocos / CAR
    'Dagupan, Pangasinan': ['dagupan'], 'Urdaneta, Pangasinan': ['urdaneta, pangasinan'],
    'San Fernando, La Union': ['san fernando, la union'], 'Vigan, Ilocos Sur': ['vigan'], 'Laoag, Ilocos Norte': ['laoag'],
    'Baguio City, Benguet': ['baguio city', 'baguio'], 'La Trinidad, Benguet': ['la trinidad'],
    // Central Luzon extras
    'Olongapo, Zambales': ['olongapo'], 'Balanga, Bataan': ['balanga'], 'Cabanatuan, Nueva Ecija': ['cabanatuan'],
    'Tarlac City, Tarlac': ['tarlac city'],
    // Bicol
    'Naga City, Camarines Sur': ['naga city, camarines sur', 'naga, camarines sur'], 'Legazpi City, Albay': ['legazpi city', 'legaspi city'],
    // Western Visayas
    'Iloilo City, Iloilo': ['iloilo city'], 'Bacolod City, Negros Occidental': ['bacolod city', 'bacolod'], 'Roxas City, Capiz': ['roxas city'],
    // Central Visayas
    'Cebu City, Cebu': ['cebu city'], 'Mandaue City, Cebu': ['mandaue'], 'Lapu-Lapu City, Cebu': ['lapu-lapu', 'lapu lapu', 'mactan'],
    'Talisay City, Cebu': ['talisay city, cebu'], 'Tagbilaran City, Bohol': ['tagbilaran'], 'Dumaguete City, Negros Oriental': ['dumaguete'],
    // Eastern Visayas
    'Tacloban City, Leyte': ['tacloban'], 'Ormoc City, Leyte': ['ormoc'],
    // Mindanao
    'Davao City, Davao del Sur': ['davao city'], 'Tagum City, Davao del Norte': ['tagum'], 'Digos City, Davao del Sur': ['digos'],
    'Cagayan de Oro, Misamis Oriental': ['cagayan de oro', 'cdo'], 'Iligan City, Lanao del Norte': ['iligan'],
    'General Santos, South Cotabato': ['general santos', 'gensan'], 'Koronadal, South Cotabato': ['koronadal'],
    'Zamboanga City, Zamboanga del Sur': ['zamboanga city'], 'Butuan City, Agusan del Norte': ['butuan'],
    'Cotabato City, Maguindanao del Norte': ['cotabato city'], 'Puerto Princesa, Palawan': ['puerto princesa'],
  };

  // ---- Districts / Barangays / CBDs: display -> {city, type, aliases, mtag} --
  // Every area resolves to its parent CITY. An `mtag` (matching tag) marks a
  // locality iconic enough to stand as its OWN canonical tag for the location
  // filter + Match Engine — it MUST equal a value already present in
  // LOCATION_ZONES so proximity keeps working. The five below (BGC, Ortigas,
  // Eastwood, Alabang, Nuvali) preserve the pre-existing behaviour. Everything
  // else folds into its parent city's tag (which is itself already zoned), so
  // e.g. a Rockwell listing matches as Makati while still DISPLAYING "Rockwell,
  // Makati". Adding a new barangay is just one more row.
  const AREAS = {
    // ----- Quezon City -----
    'New Manila':        { city: 'Quezon City', type: 'brgy', a: ['new manila'] },
    'Diliman':           { city: 'Quezon City', type: 'brgy', a: ['diliman'] },
    'Cubao':             { city: 'Quezon City', type: 'brgy', a: ['cubao'] },
    'Kamuning':          { city: 'Quezon City', type: 'brgy', a: ['kamuning'] },
    'Katipunan':         { city: 'Quezon City', type: 'brgy', a: ['katipunan'] },
    'Loyola Heights':    { city: 'Quezon City', type: 'brgy', a: ['loyola heights'] },
    'UP Diliman':        { city: 'Quezon City', type: 'brgy', a: ['up diliman'] },
    'Fairview':          { city: 'Quezon City', type: 'brgy', a: ['fairview'] },
    'Novaliches':        { city: 'Quezon City', type: 'brgy', a: ['novaliches'] },
    'Commonwealth':      { city: 'Quezon City', type: 'brgy', a: ['commonwealth'] },
    'Eastwood':          { city: 'Quezon City', type: 'cbd',  a: ['eastwood city', 'eastwood'], mtag: 'Eastwood' },
    'Vertis North':      { city: 'Quezon City', type: 'cbd',  a: ['vertis north', 'vertis'] },
    'Bridgetown':        { city: 'Quezon City', type: 'cbd',  a: ['bridgetown'] },
    'Cloverleaf':        { city: 'Quezon City', type: 'cbd',  a: ['cloverleaf'] },
    // ----- Makati -----
    'Poblacion':         { city: 'Makati', type: 'brgy', a: ['poblacion, makati', 'poblacion makati'] },
    'Bel-Air':           { city: 'Makati', type: 'brgy', a: ['bel-air', 'bel air'] },
    'Salcedo Village':   { city: 'Makati', type: 'brgy', a: ['salcedo village', 'salcedo'] },
    'Legazpi Village':   { city: 'Makati', type: 'brgy', a: ['legazpi village', 'legaspi village', 'legazpi, makati'] },
    'Forbes Park':       { city: 'Makati', type: 'brgy', a: ['forbes park', 'forbes'] },
    'Dasmariñas Village':{ city: 'Makati', type: 'brgy', a: ['dasmariñas village', 'dasmarinas village'] },
    'San Lorenzo':       { city: 'Makati', type: 'brgy', a: ['san lorenzo, makati', 'san lorenzo village'] },
    'Urdaneta Village':  { city: 'Makati', type: 'brgy', a: ['urdaneta village'] },
    'Magallanes':        { city: 'Makati', type: 'brgy', a: ['magallanes village', 'magallanes'] },
    'Ayala Center':      { city: 'Makati', type: 'cbd',  a: ['makati cbd', 'ayala center', 'ayala avenue', 'ayala ave'] },
    'Rockwell':          { city: 'Makati', type: 'cbd',  a: ['rockwell center', 'rockwell'] },
    'Century City':      { city: 'Makati', type: 'cbd',  a: ['century city'] },
    // ----- Taguig -----
    'BGC':               { city: 'Taguig', type: 'cbd',  a: ['bonifacio global city', 'fort bonifacio', 'the fort', 'bgc', 'uptown bonifacio'], mtag: 'BGC' },
    'Arca South':        { city: 'Taguig', type: 'cbd',  a: ['arca south'] },
    'McKinley Hill':     { city: 'Taguig', type: 'cbd',  a: ['mckinley hill', 'mckinley west', 'mckinley'] },
    // ----- Pasig -----
    'Ortigas':           { city: 'Pasig', type: 'cbd',  a: ['ortigas center', 'ortigas cbd', 'ortigas'], mtag: 'Ortigas' },
    'Kapitolyo':         { city: 'Pasig', type: 'brgy', a: ['kapitolyo'] },
    'Ortigas East':      { city: 'Pasig', type: 'cbd',  a: ['ortigas east', 'frontera'] },
    // ----- Mandaluyong -----
    'Greenfield District':{ city: 'Mandaluyong', type: 'cbd', a: ['greenfield district'] },
    'Shaw Boulevard':    { city: 'Mandaluyong', type: 'brgy', a: ['shaw boulevard', 'shaw blvd'] },
    // ----- Muntinlupa / Alabang -----
    'Alabang':           { city: 'Muntinlupa', type: 'cbd',  a: ['filinvest city', 'alabang'], mtag: 'Alabang' },
    'Ayala Alabang':     { city: 'Muntinlupa', type: 'brgy', a: ['ayala alabang'] },
    // ----- Parañaque -----
    'BF Homes':          { city: 'Parañaque', type: 'brgy', a: ['bf homes'] },
    'Aseana City':       { city: 'Parañaque', type: 'cbd',  a: ['aseana city', 'aseana'] },
    // ----- Pasay -----
    'Bay Area':          { city: 'Pasay', type: 'cbd',  a: ['bay area', 'entertainment city', 'moa complex', 'mall of asia complex'] },
    // ----- Manila (City) districts -----
    'Ermita':            { city: 'Manila', type: 'brgy', a: ['ermita'] },
    'Malate':            { city: 'Manila', type: 'brgy', a: ['malate'] },
    'Binondo':           { city: 'Manila', type: 'brgy', a: ['binondo'] },
    'Intramuros':        { city: 'Manila', type: 'brgy', a: ['intramuros'] },
    'Sampaloc':          { city: 'Manila', type: 'brgy', a: ['sampaloc'] },
    'Tondo':             { city: 'Manila', type: 'brgy', a: ['tondo'] },
    'Sta. Mesa':         { city: 'Manila', type: 'brgy', a: ['sta. mesa', 'santa mesa'] },
    // ----- Provincial CBDs / master-planned estates -----
    'Nuvali':            { city: 'Sta. Rosa, Laguna', type: 'cbd', a: ['nuvali'], mtag: 'Nuvali, Laguna' },
    'Clark':             { city: 'Angeles City, Pampanga', type: 'cbd', a: ['clark global city', 'clark freeport', 'clark'], mtag: 'Clark, Pampanga' },
    'Cebu Business Park':{ city: 'Cebu City, Cebu', type: 'cbd', a: ['cebu business park'] },
    'Cebu IT Park':      { city: 'Cebu City, Cebu', type: 'cbd', a: ['cebu it park', 'it park'] },
    'Iloilo Business Park':{ city: 'Iloilo City, Iloilo', type: 'cbd', a: ['iloilo business park'] },
  };

  // --------------------------------------------------------------------------
  // Build a flat record table + one big longest-first alias regex.
  // --------------------------------------------------------------------------
  // record: { canon, display, sub, city, province, region, level }
  //   level: 'region' | 'province' | 'city' | 'area'
  const RECORDS = [];   // one per (record); aliases point into this by index
  const ALIAS = [];     // [{ alias, idx }]

  function addAliases(aliases, idx) {
    aliases.forEach(a => ALIAS.push({ alias: a.toLowerCase(), idx }));
  }

  // Regions
  Object.entries(REGIONS).forEach(([canon, aliases]) => {
    const idx = RECORDS.push({ canon, display: canon === 'NCR' ? 'Metro Manila' : canon, sub: null, city: null, province: null, region: canon, level: 'region' }) - 1;
    addAliases(aliases, idx);
  });
  // Provinces
  Object.entries(PROVINCES).forEach(([canon, region]) => {
    const aliases = (PROVINCE_ALIASES[canon] || [canon.toLowerCase()]);
    const idx = RECORDS.push({ canon, display: canon, sub: null, city: null, province: canon, region, level: 'province' }) - 1;
    addAliases(aliases, idx);
  });
  // NCR cities
  Object.entries(NCR_CITIES).forEach(([canon, aliases]) => {
    const idx = RECORDS.push({ canon, display: canon, sub: null, city: canon, province: 'Metro Manila', region: 'NCR', level: 'city' }) - 1;
    addAliases(aliases, idx);
  });
  // Provincial cities
  Object.entries(PROV_CITIES).forEach(([canon, aliases]) => {
    const prov = canon.split(',').pop().trim();
    const region = PROVINCES[prov] || null;
    const idx = RECORDS.push({ canon, display: canon, sub: null, city: canon, province: prov, region, level: 'city' }) - 1;
    addAliases(aliases, idx);
  });
  // Areas (barangay / district / CBD)
  Object.entries(AREAS).forEach(([display, info]) => {
    // Resolve the parent city's province/region from whichever table holds it.
    let province = 'Metro Manila', region = 'NCR';
    if (PROV_CITIES[info.city]) { province = info.city.split(',').pop().trim(); region = PROVINCES[province] || null; }
    const canon = info.mtag || info.city;   // matching tag: own tag, else parent city
    const idx = RECORDS.push({ canon, display, sub: display, city: info.city, province, region, level: 'area', mtag: info.mtag || null, atype: info.type || 'area' }) - 1;
    addAliases(info.a, idx);
  });

  // Longest alias first so "quezon city" beats "quezon", "new manila" beats
  // "manila", "metro manila" beats "manila", etc. Ties broken alphabetically
  // for a stable regex.
  ALIAS.sort((x, y) => (y.alias.length - x.alias.length) || (x.alias < y.alias ? -1 : 1));

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-ish boundaries that respect ñ, digits and letters. A match must not be
  // flanked by another letter/number so "makati" won't fire inside "makatizen".
  const B = '[a-z0-9ñ]';
  const ALIAS_BY_TEXT = new Map(ALIAS.map(x => [x.alias, x.idx]));
  const SCAN = new RegExp('(?:^|(?<!' + B + '))(' + ALIAS.map(x => esc(x.alias)).join('|') + ')(?!' + B + ')', 'gi');

  // --------------------------------------------------------------------------
  // extract(text) → resolved locality records in first-mention order.
  // --------------------------------------------------------------------------
  function extract(text) {
    const raw = (text || '');
    if (!raw) return [];
    SCAN.lastIndex = 0;
    const hits = [];
    let m;
    while ((m = SCAN.exec(raw)) !== null) {
      const idx = ALIAS_BY_TEXT.get(m[1].toLowerCase());
      if (idx == null) continue;
      hits.push(RECORDS[idx]);
      if (SCAN.lastIndex === m.index) SCAN.lastIndex++; // guard against zero-width
    }
    if (!hits.length) return [];

    // Which cities / provinces are explicitly present? Used to collapse parents.
    const citiesPresent = new Set();
    const provincesPresent = new Set();
    hits.forEach(r => {
      if (r.level === 'city' || r.level === 'area') citiesPresent.add(r.city);
      if (r.province) provincesPresent.add(r.province);
    });

    // Resolve + collapse, keeping first-mention order and de-duping by city.
    const out = [];
    const seenCity = new Set();
    const seenTag = new Set();
    for (const r of hits) {
      if (r.level === 'region') {
        // Drop a region if any city/province already anchors it.
        if (citiesPresent.size || provincesPresent.size) continue;
        if (seenTag.has(r.canon)) continue;
        seenTag.add(r.canon);
        out.push({ display: r.display, sub: null, city: null, province: null, region: r.region, type: 'region' });
        continue;
      }
      if (r.level === 'province') {
        // Drop a province if one of its cities is already present.
        let covered = false;
        citiesPresent.forEach(c => { const p = cityProvince(c); if (p === r.province) covered = true; });
        if (covered) continue;
        if (seenTag.has(r.canon)) continue;
        seenTag.add(r.canon);
        out.push({ display: r.display, sub: null, city: null, province: r.province, region: r.region, type: 'province' });
        continue;
      }
      // An iconic locality with its own matching tag (BGC, Ortigas, Alabang,
      // Eastwood, Nuvali, Clark) stands alone rather than folding into its city.
      if (r.level === 'area' && r.mtag) {
        if (seenTag.has(r.mtag)) continue;
        seenTag.add(r.mtag);
        out.push({ display: r.display, sub: r.sub, city: r.city, province: r.province, region: r.region, type: r.atype || 'cbd', tag: r.mtag });
        continue;
      }
      // A plain city, or a barangay/CBD that folds into its parent city.
      const cityLabel = r.city;
      if (seenCity.has(cityLabel)) {
        // Already have this city — enrich the folded entry with a sub-locality
        // (e.g. add "New Manila" to a bare "Quezon City") when it has none.
        if (r.level === 'area') {
          const ex = out.find(o => o.tag === cityLabel && !o.sub);
          if (ex) { ex.sub = r.sub; ex.display = r.sub + ', ' + cityShort(cityLabel); }
        }
        continue;
      }
      seenCity.add(cityLabel);
      const display = r.level === 'area' ? (r.sub + ', ' + cityShort(cityLabel)) : cityLabel;
      out.push({ display, sub: r.level === 'area' ? r.sub : null, city: cityLabel, province: r.province, region: r.region, type: r.level === 'area' ? (r.atype || 'area') : 'city', tag: cityLabel });
    }
    return out;
  }

  function cityProvince(city) {
    if (NCR_CITIES[city]) return 'Metro Manila';
    if (PROV_CITIES[city]) return city.split(',').pop().trim();
    return null;
  }
  // "Bacoor, Cavite" → "Bacoor" for use as a sub-locality prefix's city label.
  function cityShort(city) { return city.split(',')[0].trim(); }

  // --------------------------------------------------------------------------
  // extractCities(text) → canonical tags for the location filter + Match Engine.
  // Every city/area/kept-CBD contributes its matching tag; parents collapse.
  // Returns ALL distinct cities (so a multi-area demand post matches each one).
  // --------------------------------------------------------------------------
  function extractCities(text) {
    const res = extract(text);
    const tags = [];
    const seen = new Set();
    res.forEach(r => {
      let tag;
      if (r.type === 'region') tag = r.display;          // e.g. "Metro Manila"
      else if (r.type === 'province') tag = r.province;  // e.g. "Cavite"
      else tag = r.tag || r.city;                        // kept CBD tag or the city
      if (tag && !seen.has(tag)) { seen.add(tag); tags.push(tag); }
    });
    return tags;
  }

  // --------------------------------------------------------------------------
  // displayLocation(text) → the single best string for a highlight.
  //   • Uses the FIRST resolved city (the ambiguity rule) and shows its most
  //     specific label, e.g. "New Manila, Quezon City" or "BGC".
  //   • Falls back to a province, then a region, when no city is present.
  // --------------------------------------------------------------------------
  function displayLocation(text) {
    const res = extract(text);
    if (!res.length) return '';
    const firstCity = res.find(r => r.type !== 'region' && r.type !== 'province');
    if (firstCity) return firstCity.display;
    const firstProv = res.find(r => r.type === 'province');
    if (firstProv) return firstProv.display;
    return res[0].display;
  }

  function aliasList() { return ALIAS.map(x => x.alias); }

  // --------------------------------------------------------------------------
  // filterOptions() → the WHOLE Philippines, grouped by region, for a location
  // <select>. Each option carries a level-encoded value ("region:NCR",
  // "prov:Cavite", "city:Makati") so matchesFilter() can do hierarchy filtering
  // (pick a region/province → every listing in it matches). Regions come in the
  // official order (NCR first). Within a region: an "All <region>" entry, then
  // its provinces ("… — all"), then its cities/CBDs, alphabetically.
  // --------------------------------------------------------------------------
  function filterOptions() {
    const byRegion = {};
    Object.keys(REGIONS).forEach(r => { byRegion[r] = { provinces: [], cities: [] }; });
    Object.entries(PROVINCES).forEach(([prov, region]) => { if (byRegion[region]) byRegion[region].provinces.push(prov); });
    Object.keys(NCR_CITIES).forEach(c => byRegion['NCR'].cities.push(c));
    Object.keys(PROV_CITIES).forEach(c => {
      const region = PROVINCES[c.split(',').pop().trim()];
      if (byRegion[region]) byRegion[region].cities.push(c);
    });
    Object.values(AREAS).forEach(info => {
      if (!info.mtag) return;
      const region = PROV_CITIES[info.city] ? PROVINCES[info.city.split(',').pop().trim()] : 'NCR';
      if (byRegion[region] && byRegion[region].cities.indexOf(info.mtag) === -1) byRegion[region].cities.push(info.mtag);
    });
    const groups = [];
    Object.keys(REGIONS).forEach(region => {
      const g = byRegion[region];
      const regionLabel = region === 'NCR' ? 'Metro Manila (NCR)' : region;
      const opts = [{ value: 'region:' + region, label: 'All ' + regionLabel }];
      g.provinces.sort((a, b) => a.localeCompare(b)).forEach(p => opts.push({ value: 'prov:' + p, label: p + ' — all' }));
      g.cities.sort((a, b) => a.localeCompare(b)).forEach(c => opts.push({ value: 'city:' + c, label: c }));
      groups.push({ label: regionLabel, options: opts });
    });
    return groups;
  }

  // matchesFilter(text, encoded) → does this listing fall under the picked
  // location? Hierarchy-aware: a region matches any city in it, a province
  // matches any of its cities, a city (or CBD tag) matches exactly.
  function matchesFilter(text, encoded) {
    if (!encoded) return true;
    const i = encoded.indexOf(':');
    if (i === -1) { // legacy plain-city value → exact tag/city
      const res = extract(text || '');
      return res.some(r => (r.tag || r.city) === encoded || r.city === encoded);
    }
    const level = encoded.slice(0, i), name = encoded.slice(i + 1);
    const res = extract(text || '');
    if (!res.length) return false;
    if (level === 'region') return res.some(r => r.region === name);
    if (level === 'prov')   return res.some(r => r.province === name);
    return res.some(r => (r.tag || r.city) === name || r.city === name);
  }

  global.RM_LOC = { extract, extractCities, displayLocation, aliasList, filterOptions, matchesFilter };
})(typeof window !== 'undefined' ? window : this);
