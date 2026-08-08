function getDistinctArtistsWithTitles() {
  const albums = getAlbums();
  const byArtist = {};
  albums.forEach(function (a) {
    if (!a.artist) return;
    const key = a.artist.trim();
    if (!byArtist[key]) byArtist[key] = [];
    byArtist[key].push(a.title);
  });
  return Object.keys(byArtist).map(function (artist) { return { artist: artist, ownedTitles: byArtist[artist] }; });
}

function gapSuggestionKey(artist, suggestedTitle) {
  return artist + '::' + suggestedTitle;
}

// Reads existing suggestions ONCE per run — checking with a per-candidate full-tab
// read (as a naive gapSuggestionExists() would) turns into O(n^2) reads as this tab grows.
function loadExistingGapSuggestionKeys() {
  const set = new Set();
  readHelperTab(SHEET_GAP_SUGGESTIONS).forEach(function (r) { set.add(gapSuggestionKey(r.Artist, r.SuggestedAlbumTitle)); });
  return set;
}

function runGapAnalysisBatch() {
  withJobLock('gapAnalysisBatch', function () {
    const startTime = Date.now();
    const checkpoint = getCheckpoint('gapAnalysisBatch');
    const artists = getDistinctArtistsWithTitles();
    const existingKeys = loadExistingGapSuggestionKeys();

    let processed = 0, calls = 0, errors = 0, suggested = 0;
    let i = checkpoint.cursor || 0;
    for (; i < artists.length; i++) {
      if (Date.now() - startTime > ENRICHMENT_RUN_BUDGET_MS) break;
      const entry = artists[i];
      try {
        const artistHit = mbGetArtist(entry.artist);
        calls++;
        if (!artistHit || artistHit.score < MATCH_REVIEW_THRESHOLD) { processed++; continue; }

        const studioAlbums = mbBrowseStudioAlbums(artistHit.id);
        calls++;
        studioAlbums.forEach(function (candidate) {
          if (isLikelyOwned(candidate.title, entry.ownedTitles)) return;
          const key = gapSuggestionKey(entry.artist, candidate.title);
          if (existingKeys.has(key)) return;
          appendRow(SHEET_GAP_SUGGESTIONS, [
            entry.artist, artistHit.id, candidate.title, candidate.releaseDate || '', candidate.id, artistHit.score, 'Pending', ''
          ]);
          existingKeys.add(key);
          suggested++;
        });
        processed++;
      } catch (err) {
        errors++;
        Logger.log('Gap analysis error for artist "' + entry.artist + '": ' + err.message);
      }
    }

    if (i >= artists.length) {
      resetCheckpoint('gapAnalysisBatch');
    } else {
      setCheckpoint('gapAnalysisBatch', { cursor: i });
    }
    logJobRun('gapAnalysisBatch', processed, calls, errors);
    Logger.log('Gap analysis: ' + processed + ' artists processed, ' + suggested + ' new suggestions.');
  });
}

function installGapAnalysisTrigger() {
  ScriptApp.newTrigger('runGapAnalysisBatch').timeBased().everyDays(1).atHour(3).create();
}
