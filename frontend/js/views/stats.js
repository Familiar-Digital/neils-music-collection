/* ---------------------------------------------------------------------------
   Collection statistics
   ---------------------------------------------------------------------------
   Everything here is derived from data already in memory, so the page costs no
   requests and updates the moment anything changes. Bars are plain divs sized
   by percentage rather than a charting library: at this scale a dependency
   would weigh more than the feature.
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

  function barListHtml(entries, total, limit) {
    const shown = limit ? entries.slice(0, limit) : entries;
    if (!shown.length) return '<p class="empty-note">Nothing to show yet.</p>';
    const max = shown[0].count;
    return '<div class="stat-bars">' + shown.map(function (e) {
      const pct = Math.round((e.count / max) * 100);
      const share = total ? Math.round((e.count / total) * 100) : 0;
      return '<div class="stat-row">' +
        '<span class="stat-label">' + esc(e.key) + '</span>' +
        '<span class="stat-track"><span class="stat-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="stat-value">' + e.count + '<span class="stat-share">' + share + '%</span></span>' +
        '</div>';
    }).join('') + '</div>';
  }

  // Groups the long tail of one-off formats so the chart stays readable.
  function groupedFormats(items) {
    const counts = countBy(items, function (i) {
      const f = tidyFormat(i.format);
      if (!f) return 'Not recorded';
      if (/vinyl/i.test(f)) return 'Vinyl';
      if (/\bcd\b/i.test(f)) return 'CD';
      if (/dvd|blu-?ray/i.test(f)) return 'DVD';
      if (/single|ep\b/i.test(f)) return 'Single / EP';
      if (/cassette|tape/i.test(f)) return 'Cassette';
      return 'Other';
    });
    return sortedEntries(counts);
  }

  function decadeEntries(items) {
    const counts = countBy(items, releaseDecade);
    // Chronological reads better than by size for time.
    return Object.keys(counts).sort().map(function (k) { return { key: k, count: counts[k] }; });
  }

  function statCardsHtml() {
    const albums = STORE.albums;
    const discs = albums.reduce(function (sum, a) { return sum + (Number(a.vinylDiscs) || 0); }, 0);
    const enriched = albums.filter(function (a) { return a.coverArtUrl; }).length;
    const played = albums.filter(function (a) { return a.lastPlayed; }).length;
    const cards = [
      ['Albums', STORE.albums.length.toLocaleString()],
      ['Singles', STORE.singles.length.toLocaleString()],
      ['Compilation tracks', STORE.compilations.length.toLocaleString()],
      ['DVDs', STORE.dvds.length.toLocaleString()],
      ['Vinyl discs', discs.toLocaleString()],
      ['With artwork', enriched.toLocaleString()],
      ['Logged as played', played.toLocaleString()]
    ];
    return '<div class="stat-cards">' + cards.map(function (c) {
      return '<div class="stat-card"><span class="n">' + esc(c[1]) + '</span><span class="l">' + esc(c[0]) + '</span></div>';
    }).join('') + '</div>';
  }

  function render() {
    const albums = STORE.albums;
    const artists = sortedEntries(countBy(albums, function (a) {
      return a.artist ? a.artist.replace(/\s+/g, ' ').trim() : null;
    }));
    const genres = sortedEntries(countBy(albums, function (a) { return a.genre; }));
    const decades = decadeEntries(albums);
    const formats = groupedFormats(albums);

    const total = STORE.albums.length + STORE.singles.length + STORE.compilations.length + STORE.dvds.length;
    document.getElementById('stats-sub').textContent = total.toLocaleString() + ' entries in total.';

    document.getElementById('stats-body').innerHTML =
      statCardsHtml() +
      '<h3 class="stat-head">Most collected artists</h3>' + barListHtml(artists, albums.length, 12) +
      '<h3 class="stat-head">By format</h3>' + barListHtml(formats, albums.length) +
      '<h3 class="stat-head">By decade released</h3>' +
        (decades.length
          ? barListHtml(decades, albums.length)
          : '<p class="empty-note">Release years arrive with the artwork — run the enrichment to fill these in.</p>') +
      '<h3 class="stat-head">By genre</h3>' +
        (genres.length
          ? barListHtml(genres, albums.length, 12)
          : '<p class="empty-note">Genres arrive with the artwork — run the enrichment to fill these in.</p>');
  }

  return { render };
})();
