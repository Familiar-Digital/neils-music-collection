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

  function fieldEditorHtml(item, field, label, value, hint, placeholder, inputType) {
    return '<div class="field-edit" data-row="' + item.rowNumber + '" data-field="' + field + '">' +
      '<label>' + esc(label) +
        '<input class="field-input" type="' + (inputType || 'text') + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder) + '">' +
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
    // Music DVDs are Albums rows, so they get the same editable fields.
    if (collectionKey !== 'albums' && collectionKey !== 'musicDvds') return '';
    return '<div class="played-row">' +
        '<button class="btn played-btn" data-row="' + item.rowNumber + '">Played today</button>' +
        '<span class="played-note">' +
          (item.lastPlayed ? 'Last played ' + esc(item.lastPlayed) : 'Not logged as played yet') +
        '</span>' +
        '<button class="btn btn-quiet refetch-btn" data-row="' + item.rowNumber + '">Re-fetch details</button>' +
      '</div>' +
      fieldEditorHtml(item, 'catalogueNo', 'Pressing / catalogue number', item.catalogueNo,
        'From your own copy — written straight into the spreadsheet.', 'Read it off the label or sleeve') +
      fieldEditorHtml(item, 'condition', 'Condition', item.condition,
        'Your own notes, e.g. "Noisy", "Side 2 crackly".', 'How does this copy play?') +
      fieldEditorHtml(item, 'dateAcquired', 'Date acquired', item.dateAcquired,
        'When this copy came into the collection.', 'yyyy-mm-dd', 'date') +
      fieldEditorHtml(item, 'lastPlayed', 'Last played', item.lastPlayed,
        'Separate from when you acquired it.', 'yyyy-mm-dd', 'date');
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
            ['Date in your sheet', item.sheetDate || item.date],
            ['Discs', item.vinylDiscs],
            ['Notes', item.reactions],
            ['From', item.albumTitle]
          ]) +
          referenceEditorHtml(item, collectionKey) +
          (tracks.length ? tracklistHtml(tracks)
            : '<p class="empty-note">No track listing yet.</p>') +
          appearsOnHtml(item) +
          (enrichment && enrichment.SourceURL
            ? '<p style="margin-top:1.8rem"><a class="btn" href="' + esc(enrichment.SourceURL) + '" target="_blank" rel="noopener">View on MusicBrainz</a></p>'
            : '') +
        '</div>' +
      '</div>';
  }

  function renderCompilation(album) {
    document.getElementById('detail-body').innerHTML =
      '<div class="detail-grid">' +
        '<div class="detail-art"><span class="no-art">Compilation</span></div>' +
        '<div>' +
          '<p class="detail-eyebrow">Compilation · ' + esc(tidyFormat(album.format)) + '</p>' +
          '<h2 class="detail-title">' + esc(album.title) + '</h2>' +
          '<p class="detail-artist">' + album.tracks.length + ' tracks</p>' +
          '<div class="side-heading">Track listing</div>' +
          album.tracks.map(function (t, i) {
            return '<div class="track-row"><span class="n">' + (i + 1) + '</span>' +
              '<span class="t">' + esc(t.title) + '</span>' +
              '<span class="d">' + esc(t.artist) + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  // Which compilations feature this artist — the other half of what the
  // compilations data is actually for.
  function appearsOnHtml(item) {
    if (!item.artist) return '';
    const key = item.artist.replace(/\s+/g, ' ').trim().toLowerCase();
    const albums = {};
    STORE.compilations.forEach(function (t) {
      if ((t.artist || '').replace(/\s+/g, ' ').trim().toLowerCase() !== key) return;
      const album = (t.albumTitle || 'Unfiled').trim();
      if (!albums[album]) albums[album] = [];
      albums[album].push(t.title);
    });
    const names = Object.keys(albums).sort();
    if (!names.length) return '';
    return '<div class="side-heading">Also appears on</div>' +
      names.map(function (n) {
        return '<div class="track-row"><span class="t">' + esc(n) + '</span>' +
          '<span class="d">' + esc(albums[n].join(', ')) + '</span></div>';
      }).join('');
  }

  async function open(collectionKey, rowNumber) {
    // Compilation cards are synthesised groups, not sheet rows.
    if (collectionKey === 'compilations' && String(rowNumber).indexOf('comp:') === 0) {
      const title = String(rowNumber).slice(5);
      const tracks = STORE.compilations.filter(function (t) {
        return (t.albumTitle || 'Unfiled').replace(/\s+/g, ' ').trim() === title;
      });
      if (!tracks.length) return;
      document.getElementById('detail-overlay').hidden = false;
      renderCompilation({ title: title, format: tracks[0].format, tracks: tracks });
      return;
    }

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
      if (collectionKey === 'albums' || collectionKey === 'musicDvds') detail = await API.getAlbumDetail(rowNumber);
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
      const item = albumRow(rowNumber);
      if (item) item[field] = input.value.trim();
      status.className = 'field-status ok';
      status.textContent = 'Saved to the spreadsheet.';
    } catch (err) {
      status.className = 'field-status err';
      status.textContent = 'Could not save: ' + err.message;
    }
  }

  // A row from the Albums sheet, whichever category it is being browsed under.
  function albumRow(rowNumber) {
    return STORE.albums.concat(STORE.musicDvds)
      .filter(function (a) { return a.rowNumber === rowNumber; })[0];
  }

  async function markPlayed(button) {
    const rowNumber = Number(button.dataset.row);
    const note = button.parentElement.querySelector('.played-note');
    if (!API.getWriteToken()) { note.textContent = 'Editor password needed to log plays.'; return; }
    button.disabled = true;
    note.textContent = 'Logging…';
    try {
      await API.markPlayed({ sheetName: 'Albums', sourceRow: rowNumber });
      const today = new Date().toISOString().slice(0, 10);
      const item = albumRow(rowNumber);
      if (item) item.lastPlayed = today;
      note.textContent = 'Last played ' + today;
    } catch (err) {
      note.textContent = 'Could not log that: ' + err.message;
    }
    button.disabled = false;
  }

  /* Enrichment skips anything already resolved, so a wrong match would keep its
     artwork forever. This forces one record to be looked up again — needed after
     correcting a title, or when the match was simply wrong. */
  async function reFetch(button) {
    const rowNumber = Number(button.dataset.row);
    const note = button.parentElement.querySelector('.played-note');
    if (!API.getWriteToken()) { note.textContent = 'Editor password needed to re-fetch.'; return; }
    button.disabled = true;
    note.textContent = 'Looking it up again…';
    try {
      const result = await API.reEnrich({ sheetName: 'Albums', sourceRow: rowNumber });
      const item = albumRow(rowNumber);
      if (item) {
        item.coverArtUrl = result.coverArtUrl || null;
        item.releaseYear = result.releaseYear || null;
        item.genre = result.genre || null;
      }
      note.textContent = result.matchStatus === 'NotFound'
        ? 'Still no match found.'
        : 'Updated — reopen to see the new details.';
      BROWSE.refresh();
    } catch (err) {
      note.textContent = 'Could not re-fetch: ' + err.message;
    }
    button.disabled = false;
  }

  function init() {
    document.querySelector('[data-close-detail]').addEventListener('click', close);

    document.getElementById('detail-overlay').addEventListener('click', function (e) {
      const save = e.target.closest('.field-save');
      if (save) { saveField(save.closest('.field-edit')); return; }
      const played = e.target.closest('.played-btn');
      if (played) { markPlayed(played); return; }
      const refetch = e.target.closest('.refetch-btn');
      if (refetch) reFetch(refetch);
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
      const raw = card.dataset.row;
      open(card.dataset.collection, /^\d+$/.test(raw) ? Number(raw) : raw);
    });
  }

  return { init, open, close };
})();
