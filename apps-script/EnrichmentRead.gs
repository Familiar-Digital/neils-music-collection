function enrichmentKeyFor(sheetName, rowNumber) {
  return sheetName + ':' + rowNumber;
}

// Reads a helper tab (one we fully own) into an array of {rowNumber, ...fields} objects,
// keyed by its declared header row — safe here because we control these headers exactly.
function readHelperTab(sheetName) {
  const headers = HELPER_SHEET_HEADERS[sheetName];
  const rows = readDataRows(sheetName, headers.length, 2);
  return rows.map(function (r) {
    const obj = { rowNumber: r.rowNumber };
    headers.forEach(function (h, i) { obj[h] = r.values[i]; });
    return obj;
  });
}

function getEnrichmentRow(sourceSheetName, sourceRowNumber) {
  const helperSheet = sourceSheetName === SHEET_ALBUMS ? SHEET_ENRICHMENT_ALBUMS : SHEET_ENRICHMENT_SINGLES;
  const rows = readHelperTab(helperSheet);
  for (let i = 0; i < rows.length; i++) {
    if (Number(rows[i].SourceRow) === Number(sourceRowNumber)) return rows[i];
  }
  return null;
}

function getTracklistFor(enrichmentKey) {
  const rows = readHelperTab(SHEET_TRACKLISTS);
  return rows
    .filter(function (r) { return r.EnrichmentKey === enrichmentKey; })
    .sort(function (a, b) {
      if (a.Side !== b.Side) return String(a.Side).localeCompare(String(b.Side));
      return Number(a.TrackNumber) - Number(b.TrackNumber);
    })
    .map(function (r) {
      return { side: r.Side, trackNumber: r.TrackNumber, title: r.Title, lengthSeconds: r.LengthSeconds };
    });
}

function getAlbumDetail(rowNumber) {
  const enrichment = getEnrichmentRow(SHEET_ALBUMS, rowNumber);
  const tracklist = enrichment ? getTracklistFor(enrichmentKeyFor(SHEET_ALBUMS, rowNumber)) : [];
  return { enrichment: enrichment, tracklist: tracklist };
}

function getSingleDetail(rowNumber) {
  const enrichment = getEnrichmentRow(SHEET_SINGLES, rowNumber);
  const tracklist = enrichment ? getTracklistFor(enrichmentKeyFor(SHEET_SINGLES, rowNumber)) : [];
  return { enrichment: enrichment, tracklist: tracklist };
}

function getSuggestions() {
  const albumSuggestions = readHelperTab(SHEET_ENRICHMENT_ALBUMS)
    .filter(function (r) { return r.SuggestionStatus === 'Pending' && (r.SpellingSuggestion_Artist || r.SpellingSuggestion_Title); })
    .map(function (r) {
      return {
        type: 'spelling', sheetName: SHEET_ALBUMS, sourceRow: r.SourceRow,
        currentArtist: r.Artist, currentTitle: r.Title,
        suggestedArtist: r.SpellingSuggestion_Artist, suggestedTitle: r.SpellingSuggestion_Title,
        confidence: r.MatchScore
      };
    });
  const singleSuggestions = readHelperTab(SHEET_ENRICHMENT_SINGLES)
    .filter(function (r) { return r.SuggestionStatus === 'Pending' && (r.SpellingSuggestion_Artist || r.SpellingSuggestion_Titles); })
    .map(function (r) {
      return {
        type: 'spelling', sheetName: SHEET_SINGLES, sourceRow: r.SourceRow,
        currentArtist: r.Artist, currentTitle: r.Titles,
        suggestedArtist: r.SpellingSuggestion_Artist, suggestedTitle: r.SpellingSuggestion_Titles,
        confidence: r.MatchScore
      };
    });
  const gapSuggestions = readHelperTab(SHEET_GAP_SUGGESTIONS)
    .filter(function (r) { return r.Status === 'Pending'; })
    .map(function (r) {
      return {
        type: 'gap', rowNumber: r.rowNumber, artist: r.Artist,
        suggestedAlbumTitle: r.SuggestedAlbumTitle, releaseDate: r.ReleaseDate, confidence: r.MatchConfidence
      };
    });
  return { spelling: albumSuggestions.concat(singleSuggestions), gaps: gapSuggestions };
}

function getWishlist() {
  return readHelperTab(SHEET_WISHLIST);
}
