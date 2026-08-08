const BROWSE = (function () {
  let currentCollection = 'albums';
  let filters = { decade: null, genre: null, format: null };

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHtml(item, collectionKey) {
    const meta = collectionMeta(collectionKey);
    const title = titleOf(item, collectionKey);
    const artist = meta.hasArtist ? item.artist : '';
    const label = [tidyFormat(item.format), item.releaseYear].filter(Boolean).join(' · ');
    const art = item.coverArtUrl
      ? '<img src="' + escapeHtml(item.coverArtUrl) + '" alt="" loading="lazy">'
      : '<span class="no-art">No cover<br>found</span>';
    return '<button type="button" class="card" data-row="' + item.rowNumber + '" data-collection="' + collectionKey + '">' +
      '<span class="card-art">' + art + '</span>' +
      (label ? '<span class="card-label">' + escapeHtml(label) + '</span>' : '') +
      '<span class="card-title">' + escapeHtml(title) + '</span>' +
      (artist ? '<span class="card-artist">' + escapeHtml(artist) + '</span>' : '') +
      '</button>';
  }

  function itemsInCollection() { return STORE[currentCollection]; }

  function renderParents() {
    document.getElementById('parent-row').innerHTML =
      '<span class="label">Collection:</span>' +
      COLLECTIONS.map(function (c) {
        return '<button class="parent ' + (c.key === currentCollection ? 'active' : '') + '" data-parent="' + c.key + '">' +
          c.label + '</button>';
      }).join('');
  }

  // Child filters are derived from what's actually present in the selected
  // collection, so Singles never offers a decade only Albums has. Groups with
  // nothing to choose between are omitted entirely.
  function renderChildren() {
    const pool = itemsInCollection();
    const groups = [
      { key: 'decade', label: 'Decade', values: SEARCH.distinct(pool, releaseDecade) },
      { key: 'genre',  label: 'Genre',  values: SEARCH.distinct(pool, function (i) { return i.genre; }) },
      { key: 'format', label: 'Format', values: SEARCH.distinct(pool, function (i) { return tidyFormat(i.format); }) }
    ].filter(function (g) { return g.values.length > 1; });

    const row = document.getElementById('child-row');
    if (!groups.length) {
      row.innerHTML = '<span class="gl">No further filters yet — these appear once artwork and release data are fetched.</span>';
      return;
    }
    row.innerHTML = groups.map(function (g) {
      return '<span class="chip-group"><span class="gl">' + g.label + '</span>' +
        g.values.map(function (v) {
          return '<button class="chip ' + (filters[g.key] === v ? 'active' : '') + '" data-group="' + g.key + '" data-value="' + escapeHtml(v) + '">' +
            escapeHtml(v) + '</button>';
        }).join('') + '</span>';
    }).join('');
  }

  function renderGrid() {
    const all = itemsInCollection();
    const items = SEARCH.applyFilters(all, filters);
    const meta = collectionMeta(currentCollection);

    document.getElementById('grid-head').textContent = meta.label;
    document.getElementById('grid-sub').textContent =
      items.length === all.length
        ? all.length + ' in the collection'
        : items.length + ' of ' + all.length + ' — filtered';
    document.getElementById('results-grid').innerHTML =
      items.map(function (i) { return cardHtml(i, currentCollection); }).join('') ||
      '<p class="empty-note">Nothing matches these filters.</p>';
  }

  function renderRecent() {
    const entries = getRecentItems();
    const sub = document.getElementById('recent-sub');
    const grid = document.getElementById('recent-grid');
    if (!entries.length) {
      sub.textContent = 'Nothing yet — open a record and it will appear here.';
      grid.innerHTML = '';
      return;
    }
    sub.textContent = 'Most recent first.';
    grid.innerHTML = entries.map(function (e) { return cardHtml(e.item, e.collectionKey); }).join('');
  }

  function refresh() { renderParents(); renderChildren(); renderGrid(); renderRecent(); }

  function setCollection(key) {
    currentCollection = key;
    filters = { decade: null, genre: null, format: null };
    refresh();
  }

  function renderCategoryLists() {
    const html = COLLECTIONS.map(function (c) {
      return '<li><button class="home-cat" data-parent="' + c.key + '">' + c.label +
        ' <span class="count">' + STORE[c.key].length.toLocaleString() + '</span></button></li>';
    }).join('');
    document.getElementById('home-categories').innerHTML = html;
    document.getElementById('menu-categories').innerHTML = COLLECTIONS.map(function (c) {
      return '<li><button data-nav="browse" data-parent="' + c.key + '">' + c.label +
        ' <span class="count">' + STORE[c.key].length.toLocaleString() + '</span></button></li>';
    }).join('');
  }

  function init() {
    SEARCH.buildIndices();
    renderCategoryLists();
    refresh();

    document.getElementById('parent-row').addEventListener('click', function (e) {
      const btn = e.target.closest('.parent');
      if (btn) setCollection(btn.dataset.parent);
    });

    document.getElementById('child-row').addEventListener('click', function (e) {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const group = chip.dataset.group;
      filters[group] = filters[group] === chip.dataset.value ? null : chip.dataset.value; // click again to clear
      renderChildren();
      renderGrid();
    });
  }

  return { init, refresh, renderRecent, setCollection, cardHtml, escapeHtml,
    get currentCollection() { return currentCollection; } };
})();
