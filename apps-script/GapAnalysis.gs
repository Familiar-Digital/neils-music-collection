/* "Various" is a placeholder for compilations, not a performer — checking its
   discography would produce nonsense. */
const NOT_REAL_ARTISTS = ['various', 'various artists', 'soundtrack', 'original soundtrack', 'unknown'];

const GAP_THRESHOLD_DEFAULT = 3;

function getGapThreshold() {
  const stored = PropertiesService.getScriptProperties().getProperty('GAP_MIN_ALBUMS');
  const n = Number(stored);
  return stored && n >= 1 ? n : GAP_THRESHOLD_DEFAULT;
}

function setGapThreshold(value) {
  const n = Number(value);
  if (!n || n < 1 || n > 50) throw new Error('Threshold must be between 1 and 50.');
  PropertiesService.getScriptProperties().setProperty('GAP_MIN_ALBUMS', String(n));
  resetCheckpoint('gapAnalysisBatch'); // the artist list changed, so start again
  return { threshold: n, artists: getDistinctArtistsWithTitles().length };
}

/* Only artists Neil is genuinely collecting are worth checking. Owning a single
   album by someone is usually a one-off purchase, and "you are missing the other
   seventeen" is a discography listing rather than an insight — across 251
   artists it would bury the useful suggestions entirely. The threshold is his to
   set in the app. */
function getDistinctArtistsWithTitles() {
  const threshold = getGapThreshold();
  const byArtist = {};
  getAlbums().forEach(function (a) {
    if (!a.artist) return;
    const key = a.artist.replace(/\s+/g, ' ').trim();
    if (NOT_REAL_ARTISTS.indexOf(key.toLowerCase()) !== -1) return;
    if (!byArtist[key]) byArtist[key] = [];
    byArtist[key].push(a.title);
  });
  return Object.keys(byArtist)
    .filter(function (artist) { return byArtist[artist].length >= threshold; })
    .map(function (artist) { return { artist: artist, ownedTitles: byArtist[artist] }; });
}

// Progress for the app: how far through the artist list the job has got.
function getGapStatus() {
  const artists = getDistinctArtistsWithTitles();
  const checkpoint = getCheckpoint('gapAnalysisBatch');
  const pending = readHelperTab(SHEET_GAP_SUGGESTIONS).filter(function (r) { return r.Status === 'Pending'; }).length;
  return {
    threshold: getGapThreshold(),
    artistsInScope: artists.length,
    processed: Math.min(checkpoint.cursor || 0, artists.length),
    complete: (checkpoint.cursor || 0) >= artists.length,
    pendingSuggestions: pending
  };
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
