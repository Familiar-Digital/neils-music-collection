const DETAIL = (function () {
  const esc = function (s) { return BROWSE.escapeHtml(s); };

  function formatLength(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function tracklistHtml(tracks) {
    if (!tracks.length) return '';
    const bySide = {};
    const order = [];
    tracks.forEach(function (t) {
      const side = t.side || 'Tracks';
      if (!bySide[side]) { bySide[side] = []; order.push(side); }
      bySide[side].push(t);
    });
    return order.map(function (side) {
      return '<div class="side-heading">' + esc(side) + '</div>' +
        bySide[side].map(function (t) {
          return '<div class="track-row"><span class="n">' + esc(t.trackNumber) + '</span>' +
            '<span class="t">' + esc(t.title) + '</span>' +
            '<span class="d">' + formatLength(t.lengthSeconds) + '</span></div>';
        }).join('');
    }).join('');
  }

  function metaRows(pairs) {
    const rows = pairs.filter(function (p) { return p[1]; })
      .map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('');
    return rows ? '<div class="detail-meta"><dl>' + rows + '</dl></div>' : '';
  }

  function fieldEditorHtml(item, field, label, value, hint, placeholder) {
    return '<div class="field-edit" data-row="' + item.rowNumber + '" data-field="' + field + '">' +
      '<label>' + esc(label) +
        '<input class="field-input" type="text" value="' + esc(value || '') + '" placeholder="' + esc(placeholder) + '">' +
      '</label>' +
      '<button class="btn field-save">Save</button>' +
      '<p class="field-hint">' + esc(hint) + '</p>' +
      '<p class="field-status"></p>' +
      '</div>';
  }

  /* Both of these are Neil's own observations about his copy, never guessed.
     A pressing number describes one specific pressing rather than the album
     (Dark Side of the Moon is SHVL 804 in the UK, SHVLJ(D) 804 in South
     Africa), so a plausible-looking suggestion would invite acceptance without
     checking the label — and a wrong pressing number reads as authoritative in
     a way a blank field does not. Condition is his existing annotation, kept in
     the column he already uses for it. */
  function referenceEditorHtml(item, collectionKey) {
    if (collectionKey !== 'albums') return '';
    return fieldEditorHtml(item, 'catalogueNo', 'Pressing / catalogue number', item.catalogueNo,
        'From your own copy — written straight into the spreadsheet.', 'Read it off the label or sleeve') +
      fieldEditorHtml(item, 'condition', 'Condition', item.condition,
        'Your own notes, e.g. "Noisy", "Side 2 crackly".', 'How does this copy play?');
  }

  function render(item, collectionKey, detail) {
    const meta = collectionMeta(collectionKey);
    const enrichment = detail && detail.enrichment;
    const tracks = (detail && detail.tracklist) || [];
    const art = (enrichment && enrichment.CoverArtURL) || item.coverArtUrl;

    document.getElementById('detail-body').innerHTML =
      '<div class="detail-grid">' +
        '<div class="detail-art">' +
          (art ? '<img src="' + esc(art) + '" alt="">' : '<span class="no-art">No cover found</span>') +
        '</div>' +
        '<div>' +
          '<p class="detail-eyebrow">' + esc(meta.label.replace(/s$/, '')) + '</p>' +
          '<h2 class="detail-title">' + esc(titleOf(item, collectionKey)) + '</h2>' +
          (meta.hasArtist && item.artist ? '<p class="detail-artist">' + esc(item.artist) + '</p>' : '') +
          metaRows([
            ['Format', tidyFormat(item.format)],
            ['Released', enrichment && enrichment.ReleaseYear],
            ['Genre', enrichment && enrichment.Genre],
            ['Date played', item.dateAcquired || item.date],
            ['Discs', item.vinylDiscs],
            ['Notes', item.reactions],
            ['From', item.albumTitle]
          ]) +
          referenceEditorHtml(item, collectionKey) +
          (tracks.length ? tracklistHtml(tracks)
            : '<p class="empty-note">No track listing yet.</p>') +
          (enrichment && enrichment.SourceURL
            ? '<p style="margin-top:1.8rem"><a class="btn" href="' + esc(enrichment.SourceURL) + '" target="_blank" rel="noopener">View on MusicBrainz</a></p>'
            : '') +
        '</div>' +
      '</div>';
  }

  async function open(collectionKey, rowNumber) {
    const item = STORE[collectionKey].filter(function (i) { return i.rowNumber === rowNumber; })[0];
    if (!item) return;

    recordView(collectionKey, rowNumber);
    BROWSE.renderRecent();

    const overlay = document.getElementById('detail-overlay');
    overlay.hidden = false;
    document.getElementById('detail-body').innerHTML = '<p class="empty-note">Loading…</p>';

    // Only albums and singles have enrichment records; the others render from the sheet alone.
    let detail = null;
    try {
      if (collectionKey === 'albums') detail = await API.getAlbumDetail(rowNumber);
      else if (collectionKey === 'singles') detail = await API.getSingleDetail(rowNumber);
    } catch (err) {
      detail = null; // fall back to sheet data rather than showing an error for a missing extra
    }
    render(item, collectionKey, detail);
  }

  function close() { document.getElementById('detail-overlay').hidden = true; }

  async function saveField(wrap) {
    const input = wrap.querySelector('.field-input');
    const status = wrap.querySelector('.field-status');
    const rowNumber = Number(wrap.dataset.row);
    const field = wrap.dataset.field;

    if (!API.getWriteToken()) {
      status.className = 'field-status err';
      status.textContent = 'Enter the write access token on the "Add new" page first.';
      return;
    }

    status.className = 'field-status';
    status.textContent = 'Saving…';
    try {
      await API.updateField({ sheetName: 'Albums', sourceRow: rowNumber, field: field, value: input.value });
      // Update the copy in memory so reopening the record shows the new value
      // without waiting for a full reload of the collection.
      const item = STORE.albums.filter(function (a) { return a.rowNumber === rowNumber; })[0];
      if (item) item[field] = input.value.trim();
      status.className = 'field-status ok';
      status.textContent = 'Saved to the spreadsheet.';
    } catch (err) {
      status.className = 'field-status err';
      status.textContent = 'Could not save: ' + err.message;
    }
  }

  function init() {
    document.querySelector('[data-close-detail]').addEventListener('click', close);

    document.getElementById('detail-overlay').addEventListener('click', function (e) {
      const save = e.target.closest('.field-save');
      if (save) saveField(save.closest('.field-edit'));
    });

    document.getElementById('detail-overlay').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('field-input')) {
        e.preventDefault();
        saveField(e.target.closest('.field-edit'));
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !document.getElementById('detail-overlay').hidden) close();
    });
    // Card clicks anywhere (browse grid, recently viewed, search results)
    document.body.addEventListener('click', function (e) {
      const card = e.target.closest('.card');
      if (!card) return;
      open(card.dataset.collection, Number(card.dataset.row));
    });
  }

  return { init, open, close };
})();
