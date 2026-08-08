const DETAIL = (function () {
  function formatLength(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function tracklistHtml(tracks) {
    if (!tracks.length) return '';
    const bySide = {};
    tracks.forEach(function (t) {
      if (!bySide[t.side]) bySide[t.side] = [];
      bySide[t.side].push(t);
    });
    return Object.keys(bySide).map(function (side) {
      return '<div class="side-heading">' + BROWSE.escapeHtml(side) + '</div>' +
        bySide[side].map(function (t) {
          return '<div class="track-row"><span class="track-title">' + t.trackNumber + '. ' + BROWSE.escapeHtml(t.title) + '</span>' +
            '<span class="track-length">' + formatLength(t.lengthSeconds) + '</span></div>';
        }).join('');
    }).join('');
  }

  function renderSimple(item, collection) {
    const fields = { albums: ['artist', 'title', 'format', 'dateAcquired', 'reference', 'reactions'],
      singles: ['artist', 'titles', 'format', 'date'],
      compilations: ['artist', 'title', 'albumTitle', 'format'],
      dvds: ['title', 'format', 'date'] }[collection];
    const labels = { artist: 'Artist', title: 'Title', titles: 'Titles', format: 'Format',
      dateAcquired: 'Date acquired', date: 'Date', reference: 'Reference', reactions: 'Notes', albumTitle: 'From compilation' };
    document.getElementById('detail-body').innerHTML =
      '<h2 style="font-family: var(--font-display); margin-top:0;">' + BROWSE.escapeHtml(item.title || item.titles || '') + '</h2>' +
      fields.filter(function (f) { return item[f]; }).map(function (f) {
        return '<p class="meta-line"><strong>' + labels[f] + ':</strong> ' + BROWSE.escapeHtml(item[f]) + '</p>';
      }).join('');
  }

  async function renderEnriched(item, collection) {
    const isAlbum = collection === 'albums';
    const detail = isAlbum ? await API.getAlbumDetail(item.rowNumber) : await API.getSingleDetail(item.rowNumber);
    const artUrl = (detail.enrichment && detail.enrichment.CoverArtURL) || item.coverArtUrl;
    const titleText = isAlbum ? item.title : item.titles;

    document.getElementById('detail-body').innerHTML =
      '<div class="gatefold">' +
      '<div class="art-wrap">' + (artUrl ? '<img src="' + artUrl + '" alt="">' : '') + '</div>' +
      '<div class="gatefold-meta">' +
      '<h2>' + BROWSE.escapeHtml(item.artist || '') + '</h2>' +
      '<p class="meta-line" style="font-family:var(--font-display); font-size:1.05rem; color:var(--ink);">' + BROWSE.escapeHtml(titleText || '') + '</p>' +
      '<p class="meta-line">' + BROWSE.escapeHtml(item.format || '') + (item.dateAcquired || item.date ? ' · ' + BROWSE.escapeHtml(item.dateAcquired || item.date) : '') + '</p>' +
      (detail.enrichment && detail.enrichment.SourceURL ? '<p class="meta-line"><a href="' + detail.enrichment.SourceURL + '" target="_blank" rel="noopener">View on MusicBrainz</a></p>' : '') +
      tracklistHtml(detail.tracklist) +
      '</div></div>';
  }

  async function open(collection, rowNumber) {
    const item = STORE[collection].find(function (i) { return i.rowNumber === rowNumber; });
    if (!item) return;
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');

    if (collection === 'albums' || collection === 'singles') {
      document.getElementById('detail-body').innerHTML = '<p class="empty-note">Loading…</p>';
      try {
        await renderEnriched(item, collection);
      } catch (err) {
        renderSimple(item, collection);
      }
    } else {
      renderSimple(item, collection);
    }
  }

  function close() {
    document.getElementById('detail-modal').classList.add('hidden');
  }

  function init() {
    document.getElementById('close-modal-btn').addEventListener('click', close);
    document.getElementById('detail-modal').addEventListener('click', function (e) {
      if (e.target.id === 'detail-modal') close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  return { init, open, close };
})();
