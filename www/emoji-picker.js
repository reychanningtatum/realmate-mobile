// emoji-picker.js — Mobile emoji BOTTOM SHEET for the Feed (window.RMEmojiSheet).
//
// Replaces the floating popover on touch devices with a proper bottom-sheet: a
// rounded white container pinned to the bottom of the (iframe) viewport, above the
// app's bottom nav, with a drag handle, a search field, category tabs and a
// scrollable emoji grid. The Feed stays visible behind it. Desktop keeps the
// existing popover (see openEmojiPicker in home.js, which delegates here only when
// _isTouchNoHover()).
//
// Insertion never focuses the target input, so the on-screen keyboard never opens
// from the picker; the sheet stays open so the user can add several emojis. Sending
// (or tapping the scrim / drag handle) closes it.
(function () {
  // Categorized set. Each entry is "<emoji> <search keywords…>". Keywords power the
  // search field; the emoji is the first space-separated token.
  const CATS = [
    { key: 'smileys', label: 'Smileys', icon: '😀', items: (
      '😀 grin happy,😃 smile,😄 laugh,😁 beam,😆 haha,😅 sweat laugh,😂 lol tears joy,🤣 rofl,😊 blush,🙂 slight smile,🙃 upside,😉 wink,😍 love heart eyes,🥰 love,😘 kiss,😗 kiss,😚 kiss,😙 kiss,😋 yum tasty,😛 tongue,😜 wink tongue,🤪 zany,😝 tongue,🤑 money mouth,🤗 hug,🤭 giggle,🤫 shush quiet,🤔 think,🤐 zip,🤨 raised brow,😐 neutral,😑 expressionless,😶 no mouth,😏 smirk,😒 unamused,🙄 roll eyes,😬 grimace,😌 relieved,😔 pensive sad,😴 sleep,😪 sleepy,😷 mask sick,🤒 sick,🤕 hurt,🤢 nausea,🤮 vomit,🥵 hot,🥶 cold,😎 cool sunglasses,🤩 star struck,🥳 party face,😞 sad,😟 worried,😢 cry,😭 sob crying,😤 triumph,😠 angry,😡 rage mad,🤬 cursing,😳 flushed,🥺 pleading,😱 scream fear,😨 fearful,😰 anxious,🤯 mind blown,😇 angel,🤠 cowboy,🥱 yawn bored'
    ).split(',') },
    { key: 'people', label: 'People', icon: '👋', items: (
      '👍 thumbs up like yes,👎 thumbs down no,👏 clap applause,🙌 raise hands praise,🙏 pray thanks please,🤝 handshake deal,💪 muscle strong flex,👀 eyes look see,🫶 love hands,✌️ peace victory,🤞 fingers crossed luck,🤙 call shaka,👋 wave hi bye,🖐️ hand,✋ raised hand stop,👌 ok perfect,🤌 pinch,👐 open hands,🙋 raise hand question,🧑 person,👶 baby,🧒 child,👦 boy,👧 girl,👨 man,👩 woman,🧓 old,🧔 beard,👮 police,🕵️ detective,💼 briefcase work,🙇 bow sorry,🤦 facepalm,🤷 shrug,🏃 run,🚶 walk'
    ).split(',') },
    { key: 'animals', label: 'Animals', icon: '🐱', items: (
      '🐶 dog puppy,🐱 cat,🐭 mouse,🐹 hamster,🐰 rabbit bunny,🦊 fox,🐻 bear,🐼 panda,🐨 koala,🐯 tiger,🦁 lion,🐮 cow,🐷 pig,🐸 frog,🐵 monkey,🐔 chicken,🐧 penguin,🐦 bird,🦆 duck,🦅 eagle,🦉 owl,🐺 wolf,🐴 horse,🦄 unicorn,🐝 bee,🐛 bug,🦋 butterfly,🐌 snail,🐞 ladybug,🐢 turtle,🐍 snake,🐙 octopus,🦀 crab,🐠 fish,🐬 dolphin,🐳 whale,🦈 shark,🐊 croc,🐘 elephant,🦒 giraffe,🐫 camel,🦥 sloth,🐾 paw print'
    ).split(',') },
    { key: 'food', label: 'Food', icon: '🍔', items: (
      '🍏 apple green,🍎 apple red,🍐 pear,🍊 orange,🍋 lemon,🍌 banana,🍉 watermelon,🍇 grapes,🍓 strawberry,🫐 blueberry,🍈 melon,🍒 cherry,🍑 peach,🥭 mango,🍍 pineapple,🥥 coconut,🥝 kiwi,🍅 tomato,🥑 avocado,🌽 corn,🌶️ pepper chili,🥦 broccoli,🍞 bread,🧀 cheese,🍗 chicken leg,🍖 meat,🍔 burger,🍟 fries,🍕 pizza,🌭 hotdog,🌮 taco,🌯 burrito,🍜 noodles ramen,🍣 sushi,🍦 icecream,🍩 donut,🍪 cookie,🎂 cake,🍫 chocolate,🍿 popcorn,☕ coffee,🍺 beer,🍷 wine,🥂 cheers toast,🍾 champagne'
    ).split(',') },
    { key: 'travel', label: 'Travel', icon: '✈️', items: (
      '🏠 house home,🏡 house garden,🏢 office building,🏗️ construction,🏬 store mall,🏦 bank,🏨 hotel,🏫 school,⛪ church,🏰 castle,🗼 tower,🗽 statue liberty,⛲ fountain,🌃 night,🌆 city sunset,🌉 bridge,🏙️ skyline city,🚗 car,🚕 taxi,🚙 suv,🚌 bus,🏎️ race car,🚓 police car,🚑 ambulance,🚒 fire truck,🚚 truck,🚜 tractor,🏍️ motorcycle,🚲 bike bicycle,✈️ plane flight,🚀 rocket,🚁 helicopter,⛵ sailboat,🚤 speedboat,🛳️ ship cruise,⚓ anchor,🗺️ map,🧭 compass,🏝️ island beach,⛱️ beach umbrella,🏔️ mountain'
    ).split(',') },
    { key: 'activities', label: 'Activities', icon: '⚽', items: (
      '🎉 party celebrate,🎊 confetti,🎈 balloon,🎁 gift present,🎀 ribbon,🏆 trophy win,🥇 gold medal first,🥈 silver medal,🥉 bronze medal,🏅 medal,⚽ soccer football,🏀 basketball,🏈 american football,⚾ baseball,🎾 tennis,🏐 volleyball,🏉 rugby,🎱 pool billiards,🏓 pingpong,🏸 badminton,🥊 boxing,⛳ golf,🎯 dart target bullseye,🎮 game controller,🕹️ joystick,🎲 dice,🎸 guitar,🎹 piano,🎺 trumpet,🎻 violin,🥁 drum,🎤 mic sing karaoke,🎧 headphones,🎬 movie film,🎨 art paint,🎭 theater,♟️ chess,🎳 bowling,🏂 snowboard,🏄 surf,🏊 swim,🚴 cycling,🧗 climb,🎣 fishing'
    ).split(',') },
    { key: 'objects', label: 'Objects', icon: '💡', items: (
      '🔑 key,💰 money bag,💵 cash dollar,💳 card credit,💎 diamond,📈 chart up growth,📉 chart down,📊 bar chart,📌 pin,📎 paperclip,✂️ scissors,🖊️ pen,✏️ pencil,📝 memo note write,📁 folder,📅 calendar,⏰ alarm clock,⌚ watch,📱 phone mobile,💻 laptop,🖥️ computer,🖨️ printer,⌨️ keyboard,💡 idea light bulb,🔦 flashlight,🔒 lock,🔓 unlock,🔔 bell notification,📢 announce loud,📣 megaphone,📷 camera photo,📹 video,🔋 battery,🔌 plug,🧲 magnet,🧰 toolbox,🔧 wrench,🔨 hammer,🛠️ tools,⚙️ gear settings,🔬 microscope,🔭 telescope,📡 satellite'
    ).split(',') },
    { key: 'symbols', label: 'Symbols', icon: '❤️', items: (
      '❤️ red heart love,🧡 orange heart,💛 yellow heart,💚 green heart,💙 blue heart,💜 purple heart,🖤 black heart,🤍 white heart,💔 broken heart,💕 two hearts,💖 sparkle heart,💯 hundred perfect,✨ sparkles,⭐ star,🌟 glow star,💫 dizzy,🔥 fire hot lit,💥 boom collision,⚡ lightning,☀️ sun,🌈 rainbow,✅ check yes done,❌ cross no wrong,✔️ check mark,➕ plus add,➖ minus,❓ question,❗ exclamation,🎵 music note,🎶 notes,💤 sleep zzz,♻️ recycle,🆕 new,🔴 red circle,🟢 green circle,🔵 blue circle,🟣 purple circle,🟡 yellow circle,⚫ black circle,⚪ white circle'
    ).split(',') }
  ];

  // Parse "emoji keywords" once.
  CATS.forEach(c => {
    c.parsed = c.items.map(s => {
      const t = s.trim();
      const sp = t.indexOf(' ');
      return sp === -1 ? { e: t, kw: '' } : { e: t.slice(0, sp), kw: t.slice(sp + 1).toLowerCase() };
    });
  });

  let _target = null, _cat = 0, _built = false;

  function injectStyles() {
    if (document.getElementById('rm-emoji-sheet-css')) return;
    const st = document.createElement('style');
    st.id = 'rm-emoji-sheet-css';
    st.textContent = `
    #rmEmojiSheet{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#fff;
      border-radius:20px 20px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.16);
      display:flex;flex-direction:column;max-height:56vh;
      padding-bottom:env(safe-area-inset-bottom,0px);
      transform:translateY(110%);transition:transform .22s cubic-bezier(.32,.72,0,1);
      will-change:transform;touch-action:none;}
    #rmEmojiSheet.open{transform:translateY(0);}
    .rmes-handle{width:40px;height:5px;border-radius:3px;background:#d1d5db;margin:8px auto 4px;flex:0 0 auto;}
    .rmes-search{flex:0 0 auto;margin:6px 14px 10px;display:flex;align-items:center;gap:8px;
      background:#f1f5f9;border-radius:12px;padding:10px 14px;}
    .rmes-search i{color:#94a3b8;font-size:15px;}
    .rmes-search input{flex:1;border:none;background:none;outline:none;font-size:15px;color:#0f172a;}
    .rmes-tabs{flex:0 0 auto;display:flex;gap:4px;overflow-x:auto;padding:0 10px 8px;
      -webkit-overflow-scrolling:touch;scrollbar-width:none;}
    .rmes-tabs::-webkit-scrollbar{display:none;}
    .rmes-tab{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;
      padding:6px 10px;border:none;background:none;border-radius:10px;cursor:pointer;color:#64748b;
      font-size:10px;font-weight:700;}
    .rmes-tab .ico{font-size:18px;line-height:1;filter:grayscale(1);opacity:.7;}
    .rmes-tab.active{background:#eef2ff;color:#4f46e5;}
    .rmes-tab.active .ico{filter:none;opacity:1;}
    .rmes-grid{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;
      display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:4px 10px 12px;}
    .rmes-grid button{border:none;background:none;font-size:26px;line-height:1;padding:6px 0;cursor:pointer;
      border-radius:8px;}
    .rmes-grid button:active{background:#f1f5f9;}
    .rmes-empty{grid-column:1/-1;text-align:center;color:#94a3b8;font-size:13px;padding:24px 0;}`;
    document.head.appendChild(st);
  }

  function build() {
    if (_built) return;
    injectStyles();
    const sheet = document.createElement('div');
    sheet.id = 'rmEmojiSheet';
    sheet.innerHTML =
      '<div class="rmes-handle"></div>' +
      '<div class="rmes-search"><i class="fas fa-magnifying-glass"></i>' +
        '<input id="rmesSearch" type="text" placeholder="Search emojis…" autocomplete="off" ' +
        'autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text"></div>' +
      '<div class="rmes-tabs" id="rmesTabs"></div>' +
      '<div class="rmes-grid" id="rmesGrid"></div>';
    // Tapping anywhere on the sheet chrome must not blur/focus the comment box
    // (which would pop the keyboard); the search input is the one exception.
    sheet.addEventListener('mousedown', e => { if (e.target.id !== 'rmesSearch') e.preventDefault(); });

    document.body.appendChild(sheet);

    // Tabs
    const tabs = sheet.querySelector('#rmesTabs');
    CATS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rmes-tab' + (i === 0 ? ' active' : '');
      b.innerHTML = `<span class="ico">${c.icon}</span><span>${c.label}</span>`;
      b.addEventListener('click', () => { _cat = i; const s = sheet.querySelector('#rmesSearch'); if (s) s.value = ''; renderTabs(); renderGrid(); sheet.querySelector('#rmesGrid').scrollTop = 0; });
      tabs.appendChild(b);
    });

    // Search
    sheet.querySelector('#rmesSearch').addEventListener('input', renderGrid);

    // Swipe-down on the handle area closes.
    let startY = null;
    sheet.addEventListener('touchstart', e => { if (e.target.closest('.rmes-grid')) { startY = null; return; } startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 60) { startY = null; close(); }
    }, { passive: true });

    _built = true;
  }

  function renderTabs() {
    document.querySelectorAll('#rmesTabs .rmes-tab').forEach((el, i) => el.classList.toggle('active', i === _cat));
  }

  function currentList() {
    const q = (document.getElementById('rmesSearch')?.value || '').trim().toLowerCase();
    if (q) {
      const out = [];
      CATS.forEach(c => c.parsed.forEach(p => { if (p.kw.includes(q)) out.push(p); }));
      return out;
    }
    return CATS[_cat].parsed;
  }

  function renderGrid() {
    const grid = document.getElementById('rmesGrid');
    if (!grid) return;
    const list = currentList();
    if (!list.length) { grid.innerHTML = '<div class="rmes-empty">No emojis found</div>'; return; }
    grid.innerHTML = list.map(p => `<button type="button" data-e="${p.e}">${p.e}</button>`).join('');
    grid.querySelectorAll('button').forEach(b => b.addEventListener('click', () => insert(b.getAttribute('data-e'))));
  }

  // Append the emoji to the target WITHOUT focusing it (no keyboard) and keep the
  // sheet open. Fire 'input' so mention autocomplete etc. still run.
  function insert(emoji) {
    const el = _target && document.getElementById(_target);
    if (!el) return;
    el.value = (el.value || '') + emoji;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  }

  // Close when tapping outside the sheet (the feed, the comment box — which then
  // opens the keyboard — or the Send button, which sends first). It does NOT block
  // taps, so Send/typebox still work; we just also dismiss the sheet.
  function _outsideClose(e) {
    const sheet = document.getElementById('rmEmojiSheet');
    if (sheet && !sheet.contains(e.target)) close();
  }

  function open(targetId) {
    _target = targetId;
    build();
    // Dismiss the keyboard so the sheet isn't fighting it, and never focus the input.
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
    const sheet = document.getElementById('rmEmojiSheet');
    const search = document.getElementById('rmesSearch');
    if (search) search.value = '';
    renderTabs(); renderGrid();
    const grid = document.getElementById('rmesGrid'); if (grid) grid.scrollTop = 0;
    // Force a reflow so the closed transform is committed, then open — this animates
    // the slide-up WITHOUT relying on requestAnimationFrame (which can be throttled).
    void sheet.offsetHeight;
    sheet.classList.add('open');
    // Defer so the opening tap doesn't immediately trigger the outside-close.
    setTimeout(() => document.addEventListener('click', _outsideClose), 10);
  }

  function close() {
    const sheet = document.getElementById('rmEmojiSheet');
    if (sheet) sheet.classList.remove('open');
    document.removeEventListener('click', _outsideClose);
    _target = null;
  }

  function isOpen() {
    const sheet = document.getElementById('rmEmojiSheet');
    return !!(sheet && sheet.classList.contains('open'));
  }

  window.RMEmojiSheet = { open, close, isOpen };
})();
