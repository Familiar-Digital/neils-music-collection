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

    document.getElementById('spelling-suggestions').innerHTML =
      spelling.map(spellingHtml).join('') ||
      '<p class="empty-note">None right now. These appear as the enrichment job works through the collection.</p>';

    document.getElementById('gap-suggestions').innerHTML =
      gaps.map(gapHtml).join('') ||
      '<p class="empty-note">None yet. Gap analysis runs once the main enrichment backlog is clear.</p>';

    const badge = document.getElementById('suggestion-badge');
    const total = spelling.length + gaps.length;
    badge.hidden = total === 0;
    badge.textContent = total;
  }

  async function refresh() {
    try {
      await loadSuggestions();
      render();
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

  function init() {
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
          if (s.sheetName === 'Albums') STORE.albums = await API.getAlbums();
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
