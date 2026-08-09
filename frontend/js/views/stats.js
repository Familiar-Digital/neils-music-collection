/* ---------------------------------------------------------------------------
   Collection statistics
   ---------------------------------------------------------------------------
   Everything is derived from data already in memory, so the page costs no
   requests. Bars are divs sized by percentage rather than a charting library:
   at this scale a dependency would weigh more than the feature, and its default
   look would fight the rest of the design.

   Every figure is a way in. A statistic you can't act on is trivia — tapping a
   bar takes you to those records, which is usually what the number made you
   want to do anyway.
--------------------------------------------------------------------------- */
const STATS = (function () {
  const esc = function (s) { return BROWSE.escapeHtml(s); };

  function countBy(items, fn) {
    const counts = {};
    items.forEach(function (item) {
      const key = fn(item);
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function sortedEntries(counts) {
    return Object.keys(counts).map(function (k) { return { key: k, count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /* `filterKey` names the browse filter a value maps to, so the row can be
     tapped. Rows with nowhere to go render inert rather than looking clickable
     and doing nothing. */
  function barsHtml(entries, filterKey, limit) {
    const shown = limit ? entries.slice(0, limit) : entries;
    if (!shown.length) return '<p class="empty-note">Nothing to show yet.</p>';
    const max = shown[0].count;
    const total = shown.reduce(function (sum, e) { return sum + e.count; }, 0);
    return '<div class="stat-bars">' + shown.map(function (e) {
      const width = Math.max(2, Math.round((e.count / max) * 100));
      const share = total ? Math.round((e.count / total) * 100) : 0;
      const attrs = filterKey
        ? ' data-filter="' + filterKey + '" data-value="' + esc(e.key) + '"'
        : ' disabled';
      return '<button class="stat-row"' + attrs + '>' +
        '<span class="stat-label">' + esc(e.key) + '</span>' +
        '<span class="stat-track"><span class="stat-fill" style="width:' + width + '%"></span></span>' +
        '<span class="stat-count">' + e.count.toLocaleString() + '</span>' +
        '<span class="stat-share">' + share + '%</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function groupedFormats(items) {
    return sortedEntries(countBy(items, function (i) { return formatGroup(i.format) || 'Not recorded'; }));
  }

  function decadeEntries(items) {
    const counts = countBy(items, releaseDecade);
    return Object.keys(counts).sort().map(function (k) { return { key: k, count: counts[k] }; });
  }

  /* Headline figures, each carrying where it leads, so tapping one opens those
     records rather than merely reporting how many there are. */
  function cardsHtml() {
    const all = allAlbumSheetRows();
    const discs = all.reduce(function (sum, a) { return sum + (Number(a.vinylDiscs) || 0); }, 0);
    const cards = [
      { n: STORE.albums.length,       l: 'Albums',             go: 'albums' },
      { n: STORE.singles.length,      l: 'Singles',            go: 'singles' },
      { n: STORE.compilations.length, l: 'Compilation tracks', go: 'compilations' },
      { n: STORE.musicDvds.length,    l: 'Music DVDs',         go: 'musicDvds' },
      { n: STORE.dvds.length,         l: 'Films',              go: 'dvds' },
      { n: discs,                     l: 'Vinyl discs' },
      { n: all.filter(function (a) { return a.coverArtUrl; }).length,  l: 'With artwork', go: 'albums', status: 'Has artwork' },
      { n: all.filter(function (a) { return !a.coverArtUrl; }).length, l: 'Need a match', go: 'albums', status: 'Needs a match' },
      { n: all.filter(function (a) { return a.datePlayed; }).length,   l: 'With a play date' }
    ];
    return '<div class="stat-cards">' + cards.map(function (c) {
      const attrs = c.go
        ? ' data-go="' + c.go + '"' + (c.status ? ' data-status="' + esc(c.status) + '"' : '')
        : ' disabled';
      return '<button class="stat-card"' + attrs + '>' +
        '<span class="stat-n">' + c.n.toLocaleString() + '</span>' +
        '<span class="stat-l">' + esc(c.l) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function render() {
    const albums = allAlbumSheetRows();
    const artists = sortedEntries(countBy(albums, function (a) {
      return a.artist ? a.artist.replace(/\s+/g, ' ').trim() : null;
    }));
    const decades = decadeEntries(albums);
    const genres = sortedEntries(countBy(albums, function (a) { return a.genre; }));
    const total = albums.length + STORE.singles.length + STORE.compilations.length + STORE.dvds.length;

    document.getElementById('stats-sub').textContent =
      total.toLocaleString() + ' entries · tap any figure to see those records';

    document.getElementById('stats-body').innerHTML =
      cardsHtml() +
      '<h3 class="stat-head">Most collected artists</h3>' +
        barsHtml(artists, null, 12) +
      '<h3 class="stat-head">By format</h3>' +
        barsHtml(groupedFormats(albums), 'format') +
      '<h3 class="stat-head">By decade released</h3>' +
        (decades.length ? barsHtml(decades, 'decade')
          : '<p class="empty-note">Release years arrive with the artwork.</p>') +
      '<h3 class="stat-head">By genre</h3>' +
        (genres.length ? barsHtml(genres, 'genre', 12)
          : '<p class="empty-note">Genres arrive with the artwork.</p>');
  }

  function init() {
    document.getElementById('stats-view').addEventListener('click', function (e) {
      const card = e.target.closest('.stat-card[data-go]');
      if (card) {
        BROWSE.setCollection(card.dataset.go);
        if (card.dataset.status) BROWSE.applyFilter('status', card.dataset.status);
        APP.showView('browse');
        return;
      }
      const row = e.target.closest('.stat-row[data-filter]');
      if (row) {
        BROWSE.setCollection('albums');
        BROWSE.applyFilter(row.dataset.filter, row.dataset.value);
        APP.showView('browse');
      }
    });
  }

  return { render, init };
})();
