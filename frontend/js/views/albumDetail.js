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

  /* Rows may carry their own markup (a link, a button), so a pair can opt out
     of escaping by passing {html: ...}. Everything else is escaped as before. */
  function metaRows(pairs) {
    const rows = pairs.filter(function (p) { return p[1]; })
      .map(function (p) {
        const value = (p[1] && p[1].html !== undefined) ? p[1].html : esc(p[1]);
        return '<dt>' + esc(p[0]) + '</dt><dd>' + value + '</dd>';
      }).join('');
    return rows ? '<div class="detail-meta"><dl>' + rows + '</dl></div>' : '';
  }

  // "Last played" reads as information with an action attached, rather than a
  // button competing with the record's own details.
  function lastPlayedCell(item) {
    const played = item.lastPlayed;
    return { html:
      '<span class="played-cell" data-row="' + item.rowNumber + '">' +
        '<span class="played-value">' + (played ? esc(played) : 'Never') + '</span> ' +
        '<button class="linkish played-edit">' + (played ? 'Change' : 'Log a play') + '</button>' +
        '<span class="played-actions" hidden>' +
          '<button class="btn btn-small played-today">Played today</button>' +
          '<input class="played-date" type="date" value="' + esc(played || '') + '">' +
          '<button class="btn btn-small btn-quiet played-save">Save</button>' +
        '</span>' +
      '</span>' };
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
  function loadingRecordHtml() {
    return '<div class="loading-record">' +
      '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4">' +
        '<circle cx="28" cy="28" r="26"/><circle cx="28" cy="28" r="18"/>' +
        '<circle cx="28" cy="28" r="10"/><circle cx="28" cy="28" r="3.2" fill="currentColor" stroke="none"/>' +
        '<path d="M28 2a26 26 0 0 1 26 26" stroke-width="2.4"/>' +
      '</svg><span>Loading</span></div>';
  }

  function isAlbumSheet(collectionKey) {
    return collectionKey === 'albums' || collectionKey === 'musicDvds';
  }

  function referenceEditorHtml(item, collectionKey) {
    // Music DVDs are Albums rows, so they get the same editable fields.
    if (!isAlbumSheet(collectionKey)) return '';
    // Artwork actions sit together, secondary to the record's own information.
    /* A record that already has artwork doesn't need "find" — it needs
       "change this if it's wrong". Re-fetch only makes sense where nothing was
       found, since it repeats the search that already failed to place it. */
    const matched = !!item.coverArtUrl;
    return '<div class="detail-actions">' +
        '<span class="detail-actions-label">Artwork</span>' +
        '<button class="btn btn-small btn-quiet findmatch-btn" data-row="' + item.rowNumber + '" data-sheet="Albums">' +
          (matched ? 'Change match' : 'Find a match') + '</button>' +
        (matched ? '' :
          '<button class="btn btn-small btn-quiet refetch-btn" data-row="' + item.rowNumber + '">Try again automatically</button>') +
        '<span class="played-note"></span>' +
      '</div>' +
      '<div class="match-panel" hidden></div>' +
      fieldEditorHtml(item, 'catalogueNo', 'Pressing / catalogue number', item.catalogueNo,
        'From your own copy — written straight into the spreadsheet.', 'Read it off the label or sleeve') +
      fieldEditorHtml(item, 'condition', 'Condition', item.condition,
        'Your own notes, e.g. "Noisy", "Side 2 crackly".', 'How does this copy play?') +
      fieldEditorHtml(item, 'dateAcquired', 'Date acquired', item.dateAcquired,
        'When this copy came into the collection.', 'yyyy-mm-dd', 'date') +
      fieldEditorHtml(item, 'lastPlayed', 'Last played', item.lastPlayed,
        'Separate from when you acquired it.', 'yyyy-mm-dd', 'date');
  }

  function buildMetaPairs(item, collectionKey, enrichment) {
    const pairs = [
      ['Format', tidyFormat(item.format)],
      ['Released', enrichment && enrichment.ReleaseYear],
      ['Genre', enrichment && enrichment.Genre],
      ['Date in your sheet', item.sheetDate || item.date],
      ['Discs', item.vinylDiscs],
      ['From', item.albumTitle]
    ];
    if (isAlbumSheet(collectionKey)) pairs.push(['Last played', lastPlayedCell(item)]);
    return pairs;
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
          metaRows(buildMetaPairs(item, collectionKey, enrichment)) +
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

  /* Compilations get the same artwork and metadata as anything else. They are
     keyed by title rather than a row number, since they are a grouping of
     tracks rather than a row in Neil's sheet — so the match buttons carry the
     title where an album carries its row. */
  function renderCompilation(album) {
    const art = (STORE.compilationArt[album.title] || {});
    const cover = art.coverArtUrl;
    const matched = !!cover;

    document.getElementById('detail-body').innerHTML =
      '<div class="detail-grid">' +
        '<div class="detail-art">' +
          (cover ? '<img src="' + esc(cover) + '" alt="">' : '<span class="no-art">No cover found</span>') +
        '</div>' +
        '<div>' +
          '<p class="detail-eyebrow">Compilation</p>' +
          '<h2 class="detail-title">' + esc(album.title) + '</h2>' +
          '<p class="detail-artist">' + album.tracks.length + ' tracks</p>' +
          metaRows([
            ['Format', tidyFormat(album.format)],
            ['Released', art.releaseYear],
            ['Genre', art.genre]
          ]) +
          '<div class="detail-actions">' +
            '<span class="detail-actions-label">Artwork</span>' +
            '<button class="btn btn-small btn-quiet findmatch-btn" data-row="' + esc(album.title) + '" data-sheet="Various compilations">' +
              (matched ? 'Change match' : 'Find a match') + '</button>' +
            '<span class="played-note"></span>' +
          '</div>' +
          '<div class="match-panel" hidden></div>' +
          (art.sourceUrl ? '<p style="margin-top:1rem"><a class="btn btn-small" href="' + esc(art.sourceUrl) + '" target="_blank" rel="noopener">View on Discogs</a></p>' : '') +
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
      const album = (t.albumTitle || 'Unfiled').replace(/\s+/g, ' ').trim();
      if (!albums[album]) albums[album] = [];
      albums[album].push(t.title);
    });
    const names = Object.keys(albums).sort();
    if (!names.length) return '';
    return '<div class="side-heading">Also appears on</div>' +
      names.map(function (n) {
        return '<div class="track-row linked" data-compilation="' + esc(n) + '">' +
          '<span class="t">' + esc(n) + '</span>' +
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
    document.getElementById('detail-body').innerHTML = loadingRecordHtml();

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

  /* Searches loosely and shows what it finds, rather than guessing. Automatic
     matching queries artist and title as separate fields, which cannot match a
     record catalogued differently — a soundtrack filed under the film, say. A
     person recognises the right sleeve instantly, so the app offers and Neil
     decides. */
  async function findMatch(button) {
    const panel = document.querySelector('.match-panel');
    const rowNumber = Number(button.dataset.row);
    panel.hidden = false;
    panel.innerHTML = '<p class="empty-note">Searching…</p>';
    button.disabled = true;
    try {
      const key = button.dataset.sheet === 'Various compilations' ? button.dataset.row : rowNumber;
      const result = await API.findMatchCandidates({ sheetName: button.dataset.sheet, sourceRow: key });
      if (result.error) { panel.innerHTML = '<p class="empty-note">Could not search: ' + esc(result.error) + '</p>'; button.disabled = false; return; }
      if (!result.candidates.length) {
        panel.innerHTML = '<p class="empty-note">Nothing found for “' + esc(result.query) + '”.</p>';
        button.disabled = false; return;
      }
      panel.innerHTML =
        '<p class="match-intro">Searched for “' + esc(result.query) + '”. Pick the one that matches your copy:</p>' +
        '<div class="match-list">' + result.candidates.map(function (c) {
          const meta = [c.year, c.country, c.format].filter(Boolean).join(' · ');
          return '<button class="match-option" data-id="' + esc(c.id) + '" data-row="' + esc(button.dataset.row) + '" data-sheet="' + esc(button.dataset.sheet) + '">' +
            '<span class="match-thumb">' + (c.thumbnail ? '<img src="' + esc(c.thumbnail) + '" alt="" loading="lazy">' : '') + '</span>' +
            '<span class="match-text">' +
              '<span class="match-title">' + esc([c.artist, c.title].filter(Boolean).join(' — ')) + '</span>' +
              '<span class="match-meta">' + esc(meta) + '</span>' +
            '</span></button>';
        }).join('') + '</div>';
    } catch (err) {
      panel.innerHTML = '<p class="empty-note">Could not search: ' + esc(err.message) + '</p>';
    }
    button.disabled = false;
  }

  async function chooseMatch(option) {
    const panel = option.closest('.match-panel');
    const rowNumber = Number(option.dataset.row);
    if (!API.getWriteToken()) { panel.innerHTML = '<p class="empty-note">Editor password needed to save a match.</p>'; return; }
    panel.innerHTML = '<p class="empty-note">Saving…</p>';
    try {
      const isCompilation = option.dataset.sheet === 'Various compilations';
      const key = isCompilation ? option.dataset.row : rowNumber;
      const result = await API.applyMatchCandidate({ sheetName: option.dataset.sheet, sourceRow: key, releaseId: option.dataset.id });
      if (isCompilation) {
        STORE.compilationArt[key] = {
          coverArtUrl: result.coverArtUrl, releaseYear: result.releaseYear,
          genre: result.genre, sourceUrl: STORE.compilationArt[key] && STORE.compilationArt[key].sourceUrl
        };
        panel.innerHTML = '<p class="match-intro">Matched. Reopen to see it.</p>';
        SEARCH.buildIndices();
        BROWSE.refresh();
        return;
      }
      const item = albumRow(rowNumber);
      if (item) {
        item.coverArtUrl = result.coverArtUrl || null;
        item.releaseYear = result.releaseYear || null;
        item.genre = result.genre || null;
      }
      panel.innerHTML = '<p class="match-intro">Matched — ' + (result.trackCount || 0) + ' tracks saved. Reopen to see it.</p>';
      SEARCH.buildIndices();
      BROWSE.refresh();
    } catch (err) {
      panel.innerHTML = '<p class="empty-note">Could not save: ' + esc(err.message) + '</p>';
    }
  }

  async function savePlayed(cell, dateValue) {
    const rowNumber = Number(cell.dataset.row);
    const value = cell.querySelector('.played-value');
    if (!API.getWriteToken()) { value.textContent = 'Editor password needed'; return; }
    const previous = value.textContent;
    value.textContent = 'Saving…';
    try {
      await API.markPlayed({ sheetName: 'Albums', sourceRow: rowNumber, date: dateValue });
      const saved = dateValue || new Date().toISOString().slice(0, 10);
      const item = albumRow(rowNumber);
      if (item) item.lastPlayed = saved;
      value.textContent = saved;
      cell.querySelector('.played-actions').hidden = true;
      cell.querySelector('.played-edit').textContent = 'Change';
      cell.querySelector('.played-edit').hidden = false;
    } catch (err) {
      value.textContent = previous;
      cell.querySelector('.played-edit').textContent = 'Could not save';
    }
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
      const editPlayed = e.target.closest('.played-edit');
      if (editPlayed) {
        const cell = editPlayed.closest('.played-cell');
        cell.querySelector('.played-actions').hidden = false;
        editPlayed.hidden = true;
        return;
      }
      const today = e.target.closest('.played-today');
      if (today) { savePlayed(today.closest('.played-cell'), null); return; }
      const savePlay = e.target.closest('.played-save');
      if (savePlay) {
        const cell = savePlay.closest('.played-cell');
        savePlayed(cell, cell.querySelector('.played-date').value);
        return;
      }
      const refetch = e.target.closest('.refetch-btn');
      if (refetch) { reFetch(refetch); return; }
      const findBtn = e.target.closest('.findmatch-btn');
      if (findBtn) { findMatch(findBtn); return; }
      const option = e.target.closest('.match-option');
      if (option) { chooseMatch(option); return; }
      const linked = e.target.closest('.track-row.linked');
      if (linked) open('compilations', 'comp:' + linked.dataset.compilation);
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
