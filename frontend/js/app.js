(function () {
  const VIEWS = ['browse', 'suggestions', 'add', 'wishlist', 'stats'];

  /* ---------------- routing ---------------- */
  /* Going home means going home from wherever you are, including out of an
     overlay — otherwise the menu or a record stays stacked on top and the tap
     looks like it did nothing. */
  function showHome() {
    closeMenu();
    closeSearch();
    if (typeof DETAIL !== 'undefined') DETAIL.close();
    document.getElementById('home-view').classList.remove('is-hidden');
    VIEWS.forEach(function (v) { document.getElementById(v + '-view').classList.remove('is-active'); });
    window.scrollTo(0, 0);
  }

  function showView(name) {
    document.getElementById('home-view').classList.add('is-hidden');
    VIEWS.forEach(function (v) {
      document.getElementById(v + '-view').classList.toggle('is-active', v === name);
    });
    window.scrollTo(0, 0);
    if (name === 'suggestions') SUGGESTIONS_VIEW.refresh();
    if (name === 'wishlist') SUGGESTIONS_VIEW.renderWishlist();
    if (name === 'add') ADD_FORM.refreshTokenNote();
    if (name === 'stats') STATS.render();
  }

  /* ---------------- overlays ---------------- */
  function openMenu() { document.getElementById('menu-overlay').hidden = false; }
  function closeMenu() { document.getElementById('menu-overlay').hidden = true; }
  function openSearch() {
    document.getElementById('search-overlay').hidden = false;
    document.getElementById('search-input').focus();
  }
  function closeSearch() { document.getElementById('search-overlay').hidden = true; }

  /* ---------------- home artwork rotation ---------------- */
  const homeArt = document.getElementById('home-art');
  const layers = [document.createElement('img'), document.createElement('img')];
  layers.forEach(function (l) { l.alt = ''; homeArt.appendChild(l); });
  let activeLayer = 0;
  let rotationTimer = null;
  let queue = [];

  function withArtwork() {
    return allAlbumSheetRows().concat(STORE.singles).filter(function (i) { return i.coverArtUrl; });
  }

  /* A shuffled queue rather than a random pick each time. Picking at random
     repeats covers often — with 40 images you see a repeat within a handful of
     turns — and merely excluding the previous one doesn't fix that. Working
     through a shuffled queue shows every cover once before any repeats, then
     reshuffles, which is what "random" is expected to feel like. */
  function refillQueue(pool) {
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    // Avoid the reshuffle landing on the cover already showing.
    if (queue.lastShown && shuffled.length > 1 && shuffled[0] === queue.lastShown) {
      shuffled.push(shuffled.shift());
    }
    return shuffled;
  }

  function nextItem() {
    const pool = withArtwork();          // re-read, so covers arriving mid-session join in
    if (!pool.length) return null;
    if (!queue.length) queue = refillQueue(pool);
    const item = queue.shift();
    queue.lastShown = item;
    return item;
  }

  function setCaption(item) {
    const caption = document.getElementById('home-caption');
    caption.querySelector('.t').textContent = item.title || item.titles || '';
    caption.querySelector('.a').textContent = [item.artist, item.releaseYear].filter(Boolean).join(' · ');
  }

  /* Load the image BEFORE showing its layer. Swapping first meant the incoming
     layer still held its previous picture while the new one downloaded, so an
     older cover flashed back for a second before being replaced — which looked
     like the rotation jumping backwards. */
  function showOnHome(item) {
    return new Promise(function (resolve) {
      const img = new Image();
      const done = function () {
        const next = 1 - activeLayer;
        layers[next].src = item.coverArtUrl;
        layers[next].classList.add('visible');
        layers[activeLayer].classList.remove('visible');
        activeLayer = next;
        setCaption(item);
        resolve();
      };
      img.onload = done;
      img.onerror = resolve;   // a missing cover shouldn't stall the rotation
      img.src = item.coverArtUrl;
    });
  }

  function startRotation() {
    const first = nextItem();
    if (!first) return;        // nothing enriched yet — leave the plain background
    showOnHome(first);
    if (rotationTimer) clearInterval(rotationTimer);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    rotationTimer = setInterval(function () {
      const item = nextItem();
      if (item) showOnHome(item);
    }, 6000);
  }

  /* ---------------- search ---------------- */
  let searchTimer = null;
  function runSearch() {
    const query = document.getElementById('search-input').value.trim();
    const results = document.getElementById('search-results');
    const hint = document.getElementById('search-hint');
    if (!query) {
      results.innerHTML = '';
      hint.textContent = 'Searches albums, singles, compilations and DVDs at once.';
      return;
    }
    const hits = SEARCH.searchEverything(query);
    hint.textContent = hits.length ? hits.length + ' match' + (hits.length === 1 ? '' : 'es') : 'Nothing found.';
    results.innerHTML = hits.map(function (h) { return BROWSE.cardHtml(h.item, h.collectionKey); }).join('');
  }

  /* ---------------- wiring ---------------- */
  document.querySelectorAll('[data-open-menu]').forEach(function (b) { b.addEventListener('click', openMenu); });
  document.querySelectorAll('[data-close-menu]').forEach(function (b) { b.addEventListener('click', closeMenu); });
  document.querySelectorAll('[data-open-search]').forEach(function (b) { b.addEventListener('click', openSearch); });
  document.querySelectorAll('[data-close-search]').forEach(function (b) { b.addEventListener('click', closeSearch); });
  document.querySelectorAll('[data-go-home]').forEach(function (b) { b.addEventListener('click', showHome); });

  document.getElementById('search-input').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); closeSearch(); }
  });

  // Home category buttons are rendered after data loads, so listen on the container.
  document.getElementById('home-view').addEventListener('click', function (e) {
    const btn = e.target.closest('.home-cat');
    if (!btn) return;
    BROWSE.setCollection(btn.dataset.parent);
    showView('browse');
  });

  document.getElementById('menu-overlay').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    closeMenu();
    if (btn.dataset.parent) BROWSE.setCollection(btn.dataset.parent);
    showView(btn.dataset.nav);
  });

  // Opening a record from the search overlay should close it first.
  document.getElementById('search-overlay').addEventListener('click', function (e) {
    if (e.target.closest('.card')) closeSearch();
  });

  /* ---------------- password gate ---------------- */
  /* The site is on a public URL, so the password guards the data rather than
     the page: every request carries it, and without it there is nothing to
     see. One box for both passwords — the server decides whether the one
     entered also permits editing, and the UI adapts. */
  function showGate(message) {
    const gate = document.getElementById('gate');
    gate.hidden = false;
    document.getElementById('gate-status').textContent = message || '';
    document.getElementById('gate-input').focus();
  }

  function hideGate() {
    document.getElementById('gate').hidden = true;
  }

  document.getElementById('gate-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('gate-input');
    const status = document.getElementById('gate-status');
    const value = input.value.trim();
    if (!value) return;

    status.textContent = 'Checking…';
    API.setToken(value);
    try {
      await loadEssentialData();          // the fetch is the check
      input.value = '';
      status.textContent = '';
      startApp();
      refreshPermissions();
      loadRemainingData().then(onRemainingLoaded).catch(function () {});
    } catch (err) {
      API.clearToken();
      status.textContent = /password/i.test(err.message)
        ? 'That password was not recognised.'
        : 'Could not reach the collection: ' + err.message;
      input.select();
    }
  });

  /* ---------------- boot ----------------
     Every Apps Script request costs about three seconds of fixed overhead — a
     51-byte reply is no faster than a 250KB one — so the number of round trips
     on the critical path is what determines how long the screen stays empty.

     Asking "is this password valid?" and then asking for the data meant two
     sequential trips, roughly seven seconds before any artwork. So permission
     is no longer checked up front: the data request is the permission check,
     and a refusal shows the gate. Combined with painting from cache first, the
     common case now needs no network at all before something appears. */
  (async function boot() {
    const hasToken = !!API.getToken();

    // No password stored: the gate needs nothing from the server.
    if (!hasToken) { showGate(); return; }

    // Anything cached paints straight away; the network copy replaces it after.
    if (hydrateFromCache()) {
      startApp({ silent: true });
      refreshInBackground();
      return;
    }

    try {
      await loadEssentialData();     // doubles as the password check
      API.setCanWrite(true);         // corrected below once we know
      startApp();
      refreshPermissions();
      loadRemainingData().then(onRemainingLoaded).catch(function () {});
    } catch (err) {
      if (/password/i.test(err.message)) {
        API.clearToken();
        showGate('That password is no longer valid.');
      } else {
        showGate('Could not reach the collection: ' + err.message);
      }
    }
  })();

  // What the stored password actually permits — needed for the editing controls,
  // but nothing on screen waits for it.
  function refreshPermissions() {
    API.checkAccess()
      .then(function (access) { API.setCanWrite(access.write); ADD_FORM.refreshTokenNote(); })
      .catch(function () {});
  }

  async function refreshInBackground() {
    try {
      await loadEssentialData();
      SEARCH.buildIndices();
      BROWSE.refresh();
      startRotation();
      refreshPermissions();
      loadRemainingData().then(onRemainingLoaded).catch(function () {});
    } catch (err) {
      if (/password/i.test(err.message)) { API.clearToken(); showGate('That password is no longer valid.'); }
    }
  }

  function onRemainingLoaded() {
    BROWSE.renderCategoryLists();
    SEARCH.buildIndices();
    BROWSE.refresh();
    document.getElementById('menu-stats').textContent =
      COLLECTIONS.map(function (c) { return STORE[c.key].length.toLocaleString() + ' ' + c.label.toLowerCase(); }).join(' · ');
  }

  function startApp(options) {
    DETAIL.init();
    ADD_FORM.init();
    SUGGESTIONS_VIEW.init();
    hideGate();

    BROWSE.init();
    startRotation();

    document.getElementById('menu-stats').textContent =
      COLLECTIONS.map(function (c) { return STORE[c.key].length.toLocaleString() + ' ' + c.label.toLowerCase(); }).join(' · ');

    if (window.APP_CONFIG.SPREADSHEET_URL) {
      document.getElementById('sheet-link').href = window.APP_CONFIG.SPREADSHEET_URL;
    } else {
      document.getElementById('sheet-link').closest('.menu-col').hidden = true;
    }

    if (!options || !options.silent) {
      loadSuggestions().then(SUGGESTIONS_VIEW.render).catch(function () {});
    }
  }
})();
