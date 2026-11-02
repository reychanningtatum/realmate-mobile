// ═══════════════════════════════════════════════════════════════════════════
// Post-first onboarding (2026-11-02; own page 2026-11-03)
//
//   post.html (first open / marketing "Get Started" / "Post a Listing")
//     → Post a Listing → index.html opens "Create an account to see your
//     matches" → First / Last name, Email, Password, Salesperson / Broker →
//     legal review → complete-signup (server) → automatic sign-in → Portal
//
// The listing is posted as a Supabase ANONYMOUS user. The database keeps it
// private to that visitor (rm_listings_hide_anonymous) until complete-signup
// turns the same user into a real account — so the listing keeps its id and
// simply becomes theirs. The visitor's anonymous session persists on the
// device, so closing the app, tapping × or coming back later never loses it.
//
// Loaded by BOTH pages:
//   • post.html  (has #obPost) — the post form, Back, Sign in, Create account.
//   • index.html (no #obPost)  — a visitor with a waiting listing is taken
//     straight to the account step (script.js: openRegister / registerUser).
// Needs window.supabaseClient; post.html also loads compress.js.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var MAX_PHOTOS = 10;                 // same as the Portal composer (LM_MAX_IMAGES)
  var LISTING_KEY = 'rm_ob_listing';   // { id, at } of the listing posted before sign-up
  var sb = function () { return window.supabaseClient; };
  function $(id) { return document.getElementById(id); }
  function pendingListing() {
    try { return JSON.parse(localStorage.getItem(LISTING_KEY) || 'null'); } catch (e) { return null; }
  }
  // Is there a posted-but-not-yet-claimed listing waiting on this device?
  window.rmObHasListing = function () { return !!pendingListing(); };

  async function currentSession() {
    var c = sb(); if (!c) return null;
    try {
      if (window.rmSessionReady) { try { await window.rmSessionReady; } catch (e) {} }
      var got = await c.auth.getSession();
      return (got && got.data && got.data.session) || null;
    } catch (e) { return null; }
  }
  function mark() { try { localStorage.setItem('rm_seen_marketing', '1'); } catch (e) {} }

  // ── post.html ────────────────────────────────────────────────────────────
  var obCat = null, obFiles = [], obPosting = false;

  // ← Back: the marketing page.
  window.rmObBack = function () { mark(); location.href = 'marketing.html'; };
  // Sign in: the sign-in form (not the account step, not an auto-forward).
  window.rmObSignIn = function () {
    mark();
    try { sessionStorage.setItem('rm_from_marketing', '1'); sessionStorage.removeItem('rm_show_register'); } catch (e) {}
    location.href = 'index.html';
  };
  // "Your listing is saved — Create account": the account step on the sign-in page.
  window.rmObCreateAccount = function () {
    mark();
    try { sessionStorage.setItem('rm_show_register', '1'); } catch (e) {}
    location.href = 'index.html';
  };

  function setStatus(msg, kind) {
    var s = $('obStatus'); if (!s) return;
    s.textContent = msg || '';
    s.className = 'ob-status' + (kind ? ' ' + kind : '');
  }

  function renderPhotos() {
    var wrap = $('obPhotos'); if (!wrap) return;
    wrap.innerHTML = '';
    obFiles.forEach(function (f, i) {
      var d = document.createElement('div'); d.className = 'ob-thumb';
      var img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(f);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'ob-thumb-x';
      x.setAttribute('aria-label', 'Remove photo'); x.textContent = '×';
      x.onclick = function () { obFiles.splice(i, 1); renderPhotos(); };
      d.appendChild(img); d.appendChild(x); wrap.appendChild(d);
    });
    var c = $('obPhotoCount'); if (c) c.textContent = obFiles.length ? (obFiles.length + ' / ' + MAX_PHOTOS) : '';
  }

  function bindPostForm() {
    var grid = $('obCats');
    if (grid) grid.addEventListener('click', function (e) {
      var b = e.target.closest('.ob-cat'); if (!b) return;
      grid.querySelectorAll('.ob-cat').forEach(function (x) { x.classList.remove('selected'); });
      b.classList.add('selected'); obCat = b.dataset.cat; setStatus('');
    });
    var file = $('obFile');
    if (file) file.addEventListener('change', function () {
      var room = MAX_PHOTOS - obFiles.length;
      Array.prototype.slice.call(file.files || [], 0, Math.max(0, room)).forEach(function (f) {
        if (f.type && f.type.indexOf('image/') === 0) obFiles.push(f);
      });
      file.value = '';
      renderPhotos();
    });
  }

  // Post the listing as an anonymous visitor (private until sign-up), then go to
  // the account step on the sign-in page.
  window.rmObSubmitPost = async function () {
    if (obPosting) return;                       // double-tap guard
    var text = (($('obText') || {}).value || '').trim();
    if (!obCat) { setStatus('Please select a category.', 'error'); return; }
    if (!text)  { setStatus('Please write something about your listing.', 'error'); return; }
    var btn = $('obPostBtn');
    obPosting = true; if (btn) btn.disabled = true;
    setStatus('Posting…');
    var done = false;
    try {
      var c = sb();
      var session = await currentSession();
      if (session && !session.user.is_anonymous) { location.href = 'index.html'; return; }   // a member
      if (!session) {
        var r = await c.auth.signInAnonymously();
        if (r.error || !r.data || !r.data.session) throw new Error('Could not start your session. Please check your connection and try again.');
        session = r.data.session;
      }
      var uid = session.user.id;

      // Photos (optional) — same bucket and folder as the Portal composer.
      var urls = [];
      if (obFiles.length) {
        var files = (typeof compressImages === 'function') ? await compressImages(obFiles) : obFiles;
        urls = await Promise.all(files.map(async function (f, i) {
          var ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
          var path = 'listings/' + Date.now() + '_' + i + '.' + ext;
          var up = await c.storage.from('images').upload(path, f, { upsert: true });
          if (up.error) throw new Error('A photo could not be uploaded. Please try again or post without it.');
          return c.storage.from('images').getPublicUrl(path).data.publicUrl;
        }));
      }

      var ins = await c.from('listings').insert({
        user_id: uid,                              // RLS: must be the session's own id
        user_name: '', user_job: '', user_img: '',
        category: obCat, content: text,
        image_urls: urls.length ? urls : null,
        cover_image_url: urls[0] || null,
        archived: false, pinned: false, hidden_user_ids: []
      }).select('id').single();
      if (ins.error) {
        var m = (ins.error.message || '').toLowerCase();
        throw new Error(m.indexOf('row-level security') >= 0
          ? 'You already have listings waiting. Create an account to see them.'
          : 'Your listing could not be posted. Please try again.');
      }
      localStorage.setItem(LISTING_KEY, JSON.stringify({ id: ins.data.id, at: Date.now() }));
      setStatus('Posted! Next: create your account…');
      done = true;
      window.rmObCreateAccount();
    } catch (e) {
      setStatus((e && e.message) || 'Something went wrong. Please try again.', 'error');
    } finally {
      if (!done) { obPosting = false; if (btn) btn.disabled = false; }
    }
  };

  async function bootPostPage() {
    mark();
    bindPostForm();
    var session = await currentSession();
    var anon = !!(session && session.user && session.user.is_anonymous);
    if (session && !anon) { location.replace('index.html'); return; }   // members: the app
    var saved = $('obSaved'); if (saved) saved.hidden = !(anon && pendingListing());
  }

  // ── index.html: a visitor with a waiting listing → the account step ──────
  async function bootSignInPage() {
    var session = await currentSession();
    var anon = !!(session && session.user && session.user.is_anonymous);
    if (session && !anon) { localStorage.removeItem(LISTING_KEY); return; }   // a member
    // Posted earlier but didn't finish signing up — straight back to the account
    // step. (Not when they came to sign in: Sign In on marketing / post.html.)
    if (anon && pendingListing() && !window.__rmObSkipResume && typeof openRegister === 'function') openRegister();
  }

  function boot() { if ($('obPost')) bootPostPage(); else bootSignInPage(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
