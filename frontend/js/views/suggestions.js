const SUGGESTIONS_VIEW = (function () {
  function spellingCardHtml(s, index) {
    const artistDiffers = s.suggestedArtist && s.suggestedArtist !== s.currentArtist;
    const titleDiffers = s.suggestedTitle && s.suggestedTitle !== s.currentTitle;
    return (
      '<div class="suggestion-card">' +
      '<div class="suggestion-diff">' +
      (artistDiffers ? '<div><span class="from">' + BROWSE.escapeHtml(s.currentArtist) + '</span> → <span class="to">' + BROWSE.escapeHtml(s.suggestedArtist) + '</span></div>' : '') +
      (titleDiffers ? '<div><span class="from">' + BROWSE.escapeHtml(s.currentTitle) + '</span> → <span class="to">' + BROWSE.escapeHtml(s.suggestedTitle) + '</span></div>' : '') +
      '<div class="suggestion-confidence">confidence ' + s.confidence + '%, from MusicBrainz</div>' +
      '</div>' +
      '<div class="suggestion-actions">' +
      (artistDiffers ? '<button class="btn btn-approve" data-action="approve-spelling" data-index="' + index + '" data-field="artist">Fix artist</button>' : '') +
      (titleDiffers ? '<button class="btn btn-approve" data-action="approve-spelling" data-index="' + index + '" data-field="title">Fix title</button>' : '') +
      '<button class="btn btn-reject" data-action="reject-spelling" data-index="' + index + '">Dismiss</button>' +
      '</div></div>'
    );
  }

  function gapCardHtml(g, index) {
    return (
      '<div class="suggestion-card">' +
      '<div class="suggestion-diff">' +
      '<div><strong>' + BROWSE.escapeHtml(g.artist) + '</strong> — ' + BROWSE.escapeHtml(g.suggestedAlbumTitle) + '</div>' +
      '<div class="suggestion-confidence">' + (g.releaseDate ? g.releaseDate + ' · ' : '') + 'artist match ' + g.confidence + '%</div>' +
      '</div>' +
      '<div class="suggestion-actions">' +
      '<button class="btn btn-approve" data-action="approve-gap" data-index="' + index + '">Add to wishlist</button>' +
      '<button class="btn btn-reject" data-action="reject-gap" data-index="' + index + '">Not interested</button>' +
      '</div></div>'
    );
  }

  function render() {
    const spelling = STORE.suggestions.spelling || [];
    const gaps = STORE.suggestions.gaps || [];
    document.getElementById('spelling-suggestions').innerHTML =
      spelling.map(spellingCardHtml).join('') || '<p class="empty-note">No spelling suggestions right now — the enrichment job flags these as it works through the collection.</p>';
    document.getElementById('gap-suggestions').innerHTML =
      gaps.map(gapCardHtml).join('') || '<p class="empty-note">No gaps found yet — gap analysis runs nightly once the main enrichment backlog is clear.</p>';
  }

  async function refresh() {
    await loadSuggestions();
    render();
  }

  function init() {
    document.getElementById('suggestions-view').addEventListener('click', async function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      btn.disabled = true;
      try {
        if (btn.dataset.action === 'approve-spelling') {
          const s = STORE.suggestions.spelling[index];
          const field = btn.dataset.field;
          await API.applySpellingFix({ sheetName: s.sheetName, sourceRow: s.sourceRow, field: field, newValue: field === 'artist' ? s.suggestedArtist : s.suggestedTitle });
        } else if (btn.dataset.action === 'reject-spelling') {
          const s = STORE.suggestions.spelling[index];
          await API.rejectSpellingSuggestion({ sheetName: s.sheetName, sourceRow: s.sourceRow });
        } else if (btn.dataset.action === 'approve-gap') {
          await API.approveGapSuggestion({ rowNumber: STORE.suggestions.gaps[index].rowNumber });
        } else if (btn.dataset.action === 'reject-gap') {
          await API.rejectGapSuggestion({ rowNumber: STORE.suggestions.gaps[index].rowNumber });
        }
        await refresh();
      } catch (err) {
        alert('Could not update: ' + err.message);
        btn.disabled = false;
      }
    });
  }

  return { init, refresh };
})();
