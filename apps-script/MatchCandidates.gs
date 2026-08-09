/* ---------------------------------------------------------------------------
   Manual match — "find a match" for records automatic enrichment couldn't place
   ---------------------------------------------------------------------------
   About one record in seven doesn't match automatically, and the cause is
   usually cataloguing rather than a gap in the databases: soundtracks filed
   under the film, artists filed surname-first, titles abbreviated. A person
   recognises the right answer instantly from a sleeve; an algorithm searching
   the wrong fields never will.

   So this searches loosely, offers what it finds, and writes nothing until
   Neil chooses. Chosen matches are marked so it stays visible which records
   were resolved by hand rather than by the matcher.
--------------------------------------------------------------------------- */

function sourceRowItem(sheetName, sourceRow) {
  const rows = sheetName === SHEET_ALBUMS ? getAlbums() : getSingles();
  const item = rows.filter(function (r) { return r.rowNumber === Number(sourceRow); })[0];
  if (!item) throw new Error('Row ' + sourceRow + ' not found in ' + sheetName);
  return item;
}

function findMatchCandidates(sheetName, sourceRow, overrideQuery) {
  const item = sourceRowItem(sheetName, sourceRow);
  const title = sheetName === SHEET_ALBUMS ? item.title : String(item.titles || '').split('/')[0].trim();
  // Everything as one phrase: the whole point is not to assume which part of
  // what Neil wrote is the artist and which is the title.
  const query = overrideQuery || [item.artist, title].filter(Boolean).join(' ');

  let candidates = [];
  let error = null;
  try {
    candidates = discogsSearchCandidates(query, item.format, 8);
  } catch (err) {
    error = err.message;
  }
  return { query: query, candidates: candidates, error: error };
}

/* Writes a chosen Discogs release as this record's enrichment. Everything the
   automatic path would have produced comes from the release itself, so a
   hand-picked match is as complete as a matched one. */
function applyMatchCandidate(sheetName, sourceRow, releaseId) {
  const item = sourceRowItem(sheetName, sourceRow);
  const detail = discogsReleaseDetail(releaseId);
  const helperSheet = sheetName === SHEET_ALBUMS ? SHEET_ENRICHMENT_ALBUMS : SHEET_ENRICHMENT_SINGLES;
  const now = new Date();

  const fields = {
    MB_ReleaseID: String(releaseId),
    MatchScore: 100,                 // a person confirmed it
    MatchStatus: 'Enriched',
    CoverArtURL: detail.coverArtUrl || '',
    SourceURL: detail.url ? 'https://www.discogs.com' + detail.url : '',
    ReleaseYear: detail.year || '',
    Genre: detail.genre || '',
    MatchSource: 'Discogs (chosen)',
    CatalogueNumber: detail.catalogueNumber || '',
    LastEnrichedAt: now,
    SuggestionStatus: ''             // a hand-picked match needs no review
  };
  if (sheetName === SHEET_ALBUMS) {
    fields.Artist = item.artist;
    fields.Title = item.title;
  } else {
    fields.Artist = item.artist;
    fields.Titles = item.titles;
  }

  upsertHelperRow(helperSheet, 'SourceRow', item.rowNumber, fields);

  if (detail.tracks.length) {
    replaceTracklist(enrichmentKeyFor(sheetName, item.rowNumber), detail.tracks);
  }

  return {
    ok: true,
    coverArtUrl: fields.CoverArtURL,
    releaseYear: fields.ReleaseYear,
    genre: fields.Genre,
    trackCount: detail.tracks.length
  };
}

// Records the matcher could not place, so they can be worked through in one go
// rather than stumbled upon while browsing.
function getUnmatched(sheetName) {
  const sheet = sheetName === SHEET_SINGLES ? SHEET_ENRICHMENT_SINGLES : SHEET_ENRICHMENT_ALBUMS;
  const source = sheetName === SHEET_SINGLES ? SHEET_SINGLES : SHEET_ALBUMS;
  const byRow = {};
  readHelperTab(sheet).forEach(function (r) { byRow[Number(r.SourceRow)] = r.MatchStatus; });

  const rows = source === SHEET_ALBUMS ? getAlbums() : getSingles();
  return rows.filter(function (r) {
    const status = byRow[r.rowNumber];
    return status === 'NotFound' || status === 'NeedsReview' || status === undefined;
  }).map(function (r) {
    return {
      sheetName: source,
      rowNumber: r.rowNumber,
      artist: r.artist,
      title: r.title || r.titles,
      format: r.format,
      status: byRow[r.rowNumber] || 'NotChecked'
    };
  });
}
