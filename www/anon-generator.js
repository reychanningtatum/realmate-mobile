const _ANON_ADJECTIVES = [
  'Shadow','Silent','Stealth','Hidden','Ghost','Mystic','Cipher','Phantom',
  'Rogue','Covert','Veiled','Masked','Cloaked','Nebula','Onyx','Obsidian',
  'Crimson','Frost','Iron','Steel','Cobalt','Amber','Swift','Bold',
  'Noble','Vivid','Lunar','Solar','Storm','Blaze','Apex','Echo'
];
const _ANON_NOUNS = [
  'Agent','Fox','Falcon','Wolf','Panther','Hawk','Viper','Lynx',
  'Raven','Owl','Tiger','Bear','Eagle','Cobra','Shark','Phoenix',
  'Knight','Nomad','Ranger','Scout','Pilot','Rebel','Wanderer','Voyager',
  'Sentinel','Oracle','Spartan','Hunter','Drifter','Maverick','Striker','Ace'
];

function generateAnonName() {
  const adj  = _ANON_ADJECTIVES[Math.floor(Math.random() * _ANON_ADJECTIVES.length)];
  const noun = _ANON_NOUNS[Math.floor(Math.random() * _ANON_NOUNS.length)];
  const num  = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
}

function ensureAnonName() {
  const settings = JSON.parse(localStorage.getItem('userSettings')) || { useAnon: false, anonName: '' };
  if (!settings.anonName) {
    settings.anonName = generateAnonName();
    localStorage.setItem('userSettings', JSON.stringify(settings));
  }
  return settings.anonName;
}
