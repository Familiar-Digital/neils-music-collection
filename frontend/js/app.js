(function () {
  const VIEWS = ['browse', 'suggestions', 'add', 'wishlist', 'stats'];

  /* ---------------- routing ---------------- */
  function showHome() {
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

  async function verifyAccess() {
    try {
      const access = await API.checkAccess();
      if (!access.passwordRequired) { API.setCanWrite(access.write); return true; }
      if (!access.read) return false;
      API.setCanWrite(access.write);
      return true;
    } catch (err) {
      return false;
    }
  }

  document.getElementById('gate-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('gate-input');
    const status = document.getElementById('gate-status');
    const value = input.value.trim();
    if (!value) return;

    status.textContent = 'Checking…';
    API.setToken(value);
    if (await verifyAccess()) {
      input.value = '';
      status.textContent = '';
      hideGate();
      startApp();
    } else {
      API.clearToken();
      status.textContent = 'That password was not recognised.';
      input.select();
    }
  });

  /* ---------------- boot ---------------- */
  (async function boot() {
    if (!(await verifyAccess())) {
      showGate(API.getToken() ? 'That password is no longer valid.' : '');
      API.clearToken();
      return;
    }
    startApp();
  })();

  async function startApp() {
    DETAIL.init();
    ADD_FORM.init();
    SUGGESTIONS_VIEW.init();

    const caption = document.getElementById('home-caption');
    caption.querySelector('.t').textContent = 'Loading the collection…';

    try {
      // Anything cached from last time paints immediately; the network copy
      // replaces it below without the user waiting on it.
      const hadCache = hydrateFromCache();
      if (hadCache) {
        BROWSE.init();
        startRotation();
      }

      await loadEssentialData();
      if (hadCache) { SEARCH.buildIndices(); BROWSE.refresh(); startRotation(); }
      else { BROWSE.init(); startRotation(); }

      // Second wave: compilations and films fill in behind the scenes. The
      // categories update in place once they land.
      loadRemainingData().then(function () {
        BROWSE.renderCategoryLists();
        SEARCH.buildIndices();
        BROWSE.refresh();
        document.getElementById('menu-stats').textContent =
          COLLECTIONS.map(function (c) { return STORE[c.key].length.toLocaleString() + ' ' + c.label.toLowerCase(); }).join(' · ');
      }).catch(function () {});

      document.getElementById('menu-stats').textContent =
        COLLECTIONS.map(function (c) { return STORE[c.key].length.toLocaleString() + ' ' + c.label.toLowerCase(); }).join(' · ');

      if (window.APP_CONFIG.SPREADSHEET_URL) {
        document.getElementById('sheet-link').href = window.APP_CONFIG.SPREADSHEET_URL;
      } else {
        document.getElementById('sheet-link').closest('.menu-col').hidden = true;
      }

      // Surfaces the pending-suggestion count in the menu without opening the page.
      loadSuggestions().then(SUGGESTIONS_VIEW.render).catch(function () {});
    } catch (err) {
      caption.querySelector('.t').textContent = 'Could not load the collection';
      caption.querySelector('.a').textContent = err.message;
    }
  }
})();
