const BROWSE = (function () {
  let currentCollection = 'albums';

  const COLLECTION_FIELDS = {
    albums: { title: 'title', artist: 'artist', dateField: 'dateAcquired' },
    singles: { title: 'titles', artist: 'artist', dateField: 'date' },
    compilations: { title: 'title', artist: 'artist', dateField: null },
    dvds: { title: 'title', artist: null, dateField: 'date' }
  };

  function badgeInfo(format) {
    return String(format || '').trim().toUpperCase().replace(/\s{2,}/g, ' ');
  }

  function cardHtml(item, collection) {
    const fields = COLLECTION_FIELDS[collection];
    const title = item[fields.title] || '(untitled)';
    const artist = fields.artist ? item[fields.artist] : '';
    const badgeText = badgeInfo(item.format);
    const art = item.coverArtUrl
      ? '<img src="' + item.coverArtUrl + '" alt="" loading="lazy">'
      : '';
    return (
      '<button type="button" class="item-card" data-row="' + item.rowNumber + '" data-collection="' + collection + '">' +
      (badgeText ? '<span class="label-badge">' + escapeHtml(badgeText) + '</span>' : '') +
      '<div class="art-wrap">' + art + '</div>' +
      '<p class="item-title">' + escapeHtml(title) + '</p>' +
      (artist ? '<p class="item-artist">' + escapeHtml(artist) + '</p>' : '') +
      '</button>'
    );
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function populateFilters() {
    const formatSelect = document.getElementById('format-filter');
    const decadeSelect = document.getElementById('decade-filter');
    const prevFormat = formatSelect.value, prevDecade = decadeSelect.value;

    formatSelect.innerHTML = '<option value="">All formats</option>' +
      SEARCH.distinctFormats(currentCollection).map(function (f) { return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + '</option>'; }).join('');
    decadeSelect.innerHTML = '<option value="">All decades</option>' +
      SEARCH.distinctDecades(currentCollection).map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');

    if (Array.from(formatSelect.options).some(function (o) { return o.value === prevFormat; })) formatSelect.value = prevFormat;
    if (Array.from(decadeSelect.options).some(function (o) { return o.value === prevDecade; })) decadeSelect.value = prevDecade;
  }

  function render() {
    const query = document.getElementById('search-input').value.trim();
    const format = document.getElementById('format-filter').value;
    const decade = document.getElementById('decade-filter').value;

    let items = SEARCH.searchCollection(currentCollection, query);
    items = SEARCH.applyFilters(items, { format: format, decade: decade });

    document.getElementById('result-count').textContent = items.length + ' result' + (items.length === 1 ? '' : 's');
    document.getElementById('results-grid').innerHTML = items.map(function (item) { return cardHtml(item, currentCollection); }).join('')
      || '<p class="empty-note">Nothing matches — try a different search or clear the filters.</p>';
  }

  function switchCollection(collection) {
    currentCollection = collection;
    document.querySelectorAll('.collection-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.collection === collection);
    });
    document.getElementById('search-input').value = '';
    populateFilters();
    render();
  }

  function init() {
    SEARCH.buildIndices();
    populateFilters();
    render();

    document.querySelectorAll('.collection-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchCollection(btn.dataset.collection); });
    });
    document.getElementById('search-input').addEventListener('input', render);
    document.getElementById('format-filter').addEventListener('change', render);
    document.getElementById('decade-filter').addEventListener('change', render);
    document.getElementById('results-grid').addEventListener('click', function (e) {
      const card = e.target.closest('.item-card');
      if (!card) return;
      DETAIL.open(card.dataset.collection, Number(card.dataset.row));
    });
  }

  return { init, escapeHtml, badgeInfo, refresh: render };
})();
