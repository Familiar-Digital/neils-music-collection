const SUGGESTIONS_VIEW = (function () {
  const esc = function (s) { return BROWSE.escapeHtml(s); };

  function diffLine(from, to) {
    return '<span class="from">' + esc(from) + '</span> → <span class="to">' + esc(to) + '</span>';
  }

  function spellingHtml(s, index) {
    const artistDiffers = s.suggestedArtist && s.suggestedArtist !== s.currentArtist;
    const titleDiffers = s.suggestedTitle && s.suggestedTitle !== s.currentTitle;
    return '<div class="suggestion">' +
      '<div class="suggestion-body">' +
        (artistDiffers ? '<div class="suggestion-diff">' + diffLine(s.currentArtist, s.suggestedArtist) + '</div>' : '') +
        (titleDiffers ? '<div class="suggestion-diff">' + diffLine(s.currentTitle, s.suggestedTitle) + '</div>' : '') +
        '<p class="suggestion-note">' + esc(s.sheetName) + ' row ' + esc(s.sourceRow) +
          ' · MusicBrainz confidence ' + esc(s.confidence) + '%</p>' +
      '</div>' +
      '<div class="suggestion-actions">' +
        (artistDiffers ? '<button class="btn" data-act="fix" data-i="' + index + '" data-field="artist">Fix artist</button>' : '') +
        (titleDiffers ? '<button class="btn" data-act="fix" data-i="' + index + '" data-field="title">Fix title</button>' : '') +
        '<button class="btn btn-quiet" data-act="dismiss" data-i="' + index + '">Dismiss</button>' +
      '</div></div>';
  }

  function formatHtml(f, index) {
    const context = [f.artist, f.title].filter(Boolean).join(' — ');
    return '<div class="suggestion">' +
      '<div class="suggestion-body">' +
        '<div class="suggestion-diff">' + diffLine(f.currentFormat, f.suggestedFormat) + '</div>' +
        '<p class="suggestion-note">' + esc(context) + ' · ' + esc(f.sheetName) + ' row ' + esc(f.sourceRow) +
          ' · used ' + esc(f.usedHere) + '× here vs ' + esc(f.usedElsewhere) + '× elsewhere</p>' +
      '</div>' +
      '<div class="suggestion-actions">' +
        '<button class="btn" data-act="fmt" data-i="' + index + '">Align format</button>' +
        '<button class="btn btn-quiet" data-act="nofmt" data-i="' + index + '">Leave it</button>' +
      '</div></div>';
  }

  function gapHtml(g, index) {
    return '<div class="suggestion">' +
      '<div class="suggestion-body">' +
        '<div class="suggestion-diff">' + esc(g.artist) + ' — ' + esc(g.suggestedAlbumTitle) + '</div>' +
        '<p class="suggestion-note">' + (g.releaseDate ? esc(g.releaseDate) + ' · ' : '') +
          'artist match ' + esc(g.confidence) + '%</p>' +
      '</div>' +
      '<div class="suggestion-actions">' +
        '<button class="btn" data-act="wish" data-i="' + index + '">Add to wishlist</button>' +
        '<button class="btn btn-quiet" data-act="nogap" data-i="' + index + '">Not interested</button>' +
      '</div></div>';
  }

  function render() {
    const spelling = STORE.suggestions.spelling || [];
    const gaps = STORE.suggestions.gaps || [];
    const formats = STORE.suggestions.formats || [];

    document.getElementById('spelling-suggestions').innerHTML =
      spelling.map(spellingHtml).join('') ||
      '<p class="empty-note">None right now. These appear as the enrichment job works through the collection.</p>';

    document.getElementById('gap-suggestions').innerHTML =
      gaps.map(gapHtml).join('') ||
      '<p class="empty-note">None yet. Gap analysis runs once the main enrichment backlog is clear.</p>';

    document.getElementById('format-suggestions').innerHTML =
      formats.map(formatHtml).join('') ||
      '<p class="empty-note">No format inconsistencies found.</p>';

    const badge = document.getElementById('suggestion-badge');
    const total = spelling.length + gaps.length + formats.length;
    badge.hidden = total === 0;
    badge.textContent = total;
  }

  async function refresh() {
    try {
      await loadSuggestions();
      render();
      updateGapScope();
    } catch (err) {
      document.getElementById('spelling-suggestions').innerHTML =
        '<p class="empty-note">Could not load suggestions: ' + esc(err.message) + '</p>';
    }
  }

  async function renderWishlist() {
    const list = document.getElementById('wishlist-list');
    try {
      await loadWishlist();
      list.innerHTML = (STORE.wishlist || []).map(function (w) {
        return '<div class="wishlist-row"><span class="w-title">' + esc(w.Artist) + ' — ' + esc(w.Title) + '</span>' +
          '<span class="w-meta">' + esc(w.Source || '') + '</span></div>';
      }).join('') || '<p class="empty-note">Nothing on the wishlist yet.</p>';
    } catch (err) {
      list.innerHTML = '<p class="empty-note">Could not load the wishlist: ' + esc(err.message) + '</p>';
    }
  }

  /* The impact of the threshold is worked out locally from the collection
     already in memory, so moving the selector gives an instant answer instead
     of a round trip. "Various" is excluded here exactly as the backend does,
     otherwise the count shown would not match what actually gets checked. */
  const NOT_REAL_ARTISTS = ['various', 'various artists', 'soundtrack', 'original soundtrack', 'unknown'];

  function artistsAtThreshold(threshold) {
    const counts = {};
    allAlbumSheetRows().forEach(function (a) {
      if (!a.artist) return;
      const key = a.artist.replace(/\s+/g, ' ').trim();
      if (NOT_REAL_ARTISTS.indexOf(key.toLowerCase()) !== -1) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).filter(function (k) { return counts[k] >= threshold; }).length;
  }

  function updateGapScope() {
    const threshold = Number(document.getElementById('gap-threshold').value);
    const artists = artistsAtThreshold(threshold);
    // Two MusicBrainz calls per artist at ~1.1s each.
    const minutes = Math.max(1, Math.round((artists * 2 * 1.1) / 60));
    document.getElementById('gap-scope').textContent =
      artists + ' artist' + (artists === 1 ? '' : 's') + ' in scope — about ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ' to check.';
  }

  async function runGapAnalysis() {
    const status = document.getElementById('gap-status');
    const button = document.getElementById('gap-run');
    if (!API.getWriteToken()) {
      status.className = 'field-status err';
      status.textContent = 'Enter the write access token on the "Add new" page first.';
      return;
    }
    button.disabled = true;
    status.className = 'field-status';
    status.textContent = 'Checking…  this keeps going in the background if it takes a while.';
    try {
      await API.setGapThreshold({ threshold: Number(document.getElementById('gap-threshold').value) });
      const result = await API.runGapAnalysis();
      status.className = 'field-status ok';
      status.textContent = result.complete
        ? 'Finished — ' + result.pendingSuggestions + ' suggestions to review.'
        : 'Checked ' + result.processed + ' of ' + result.artistsInScope + ' artists so far. Run again to continue.';
      await refresh();
    } catch (err) {
      status.className = 'field-status err';
      status.textContent = 'Could not run: ' + err.message;
    }
    button.disabled = false;
  }

  function init() {
    document.getElementById('gap-threshold').addEventListener('change', updateGapScope);
    document.getElementById('gap-run').addEventListener('click', runGapAnalysis);

    document.getElementById('suggestions-view').addEventListener('click', async function (e) {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;

      if (!API.getWriteToken()) {
        alert('Enter the write access token on the "Add new" page before approving changes.');
        return;
      }

      const i = Number(btn.dataset.i);
      btn.disabled = true;
      try {
        const act = btn.dataset.act;
        if (act === 'fix') {
          const s = STORE.suggestions.spelling[i];
          const field = btn.dataset.field;
          await API.applySpellingFix({
            sheetName: s.sheetName, sourceRow: s.sourceRow, field: field,
            newValue: field === 'artist' ? s.suggestedArtist : s.suggestedTitle
          });
          // The sheet changed underneath us, so reload the affected collection.
          if (s.sheetName === 'Albums') await reloadAlbums();
          else STORE.singles = await API.getSingles();
          SEARCH.buildIndices();
          BROWSE.refresh();
        } else if (act === 'dismiss') {
          const s = STORE.suggestions.spelling[i];
          await API.rejectSpellingSuggestion({ sheetName: s.sheetName, sourceRow: s.sourceRow });
        } else if (act === 'wish') {
          await API.approveGapSuggestion({ rowNumber: STORE.suggestions.gaps[i].rowNumber });
        } else if (act === 'nogap') {
          await API.rejectGapSuggestion({ rowNumber: STORE.suggestions.gaps[i].rowNumber });
        } else if (act === 'fmt') {
          const f = STORE.suggestions.formats[i];
          await API.applyFormatFix({ sheetName: f.sheetName, sourceRow: f.sourceRow, newValue: f.suggestedFormat });
          // The format cell changed, so reload that collection and rebuild the filters.
          if (f.sheetName === 'Albums') await reloadAlbums();
          else STORE.singles = await API.getSingles();
          SEARCH.buildIndices();
          BROWSE.refresh();
        } else if (act === 'nofmt') {
          const f = STORE.suggestions.formats[i];
          await API.rejectFormatFix({ sheetName: f.sheetName, sourceRow: f.sourceRow });
        }
        await refresh();
      } catch (err) {
        alert('Could not apply that change: ' + err.message);
        btn.disabled = false;
      }
    });
  }

  return { init, refresh, render, renderWishlist };
})();
