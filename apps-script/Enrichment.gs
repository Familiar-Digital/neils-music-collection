const ENRICHMENT_RUN_BUDGET_MS = 5.5 * 60 * 1000; // stay under Apps Script's 6-minute execution cap

function upsertHelperRow(sheetName, keyColumnHeader, keyValue, fields) {
  const headers = HELPER_SHEET_HEADERS[sheetName];
  const keyColIndex = headers.indexOf(keyColumnHeader);
  const existingRowNumber = findRowByColumnValue(sheetName, keyColIndex, keyValue);
  const sheet = getSheet(sheetName);
  if (existingRowNumber === -1) {
    const row = headers.map(function (h) { return h === keyColumnHeader ? keyValue : (fields[h] !== undefined ? fields[h] : ''); });
    sheet.appendRow(row);
  } else {
    Object.keys(fields).forEach(function (h) {
      const colIndex = headers.indexOf(h);
      if (colIndex !== -1) sheet.getRange(existingRowNumber, colIndex + 1).setValue(fields[h]);
    });
  }
}

function replaceTracklist(enrichmentKey, tracks) {
  const sheet = getSheet(SHEET_TRACKLISTS);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i][0] === enrichmentKey) sheet.deleteRow(i + 2);
    }
  }
  tracks.forEach(function (t) {
    sheet.appendRow([enrichmentKey, t.side, t.trackNumber, t.title, t.lengthSeconds, '']);
  });
}

function enrichAlbumRow(album) {
  const helperSheet = SHEET_ENRICHMENT_ALBUMS;
  const now = new Date();
  let mbHit;
  try {
    mbHit = mbSearchReleaseGroup(album.artist, album.title);
  } catch (err) {
    Logger.log('MusicBrainz lookup failed for album row ' + album.rowNumber + ': ' + err.message);
    return;
  }
  if (!mbHit || mbHit.score < MATCH_REVIEW_THRESHOLD) {
    upsertHelperRow(helperSheet, 'SourceRow', album.rowNumber, {
      Artist: album.artist, Title: album.title, MatchStatus: 'NotFound', LastEnrichedAt: now
    });
    return;
  }

  let coverArtUrl = null, tracks = [], releaseId = null;
  try {
    releaseId = mbPickReleaseForGroup(mbHit.id);
    if (releaseId) {
      tracks = mbGetReleaseWithTracklist(releaseId).tracks;
      coverArtUrl = caaGetFrontCoverUrl(mbHit.id, releaseId);
    }
  } catch (err) {
    Logger.log('Tracklist/cover lookup failed for album row ' + album.rowNumber + ': ' + err.message);
  }

  const artistSuggestion = spellingSuggestionFrom(mbHit.score, album.artist, mbHit.artist);
  const titleSuggestion = spellingSuggestionFrom(mbHit.score, album.title, mbHit.title);

  upsertHelperRow(helperSheet, 'SourceRow', album.rowNumber, {
    Artist: album.artist,
    Title: album.title,
    MB_ReleaseGroupID: mbHit.id,
    MB_ReleaseID: releaseId || '',
    MatchScore: mbHit.score,
    MatchStatus: classifyMatch(mbHit.score),
    CoverArtURL: coverArtUrl || '',
    SourceURL: 'https://musicbrainz.org/release-group/' + mbHit.id,
    ReleaseYear: yearFromDate(mbHit.firstReleaseDate) || '',
    Genre: mbGetGenre(mbHit.id) || '',
    MatchSource: 'MusicBrainz',
    LastEnrichedAt: now,
    SpellingSuggestion_Artist: artistSuggestion || '',
    SpellingSuggestion_Title: titleSuggestion || '',
    SuggestionStatus: (artistSuggestion || titleSuggestion) ? 'Pending' : ''
  });

  if (tracks.length) {
    replaceTracklist(enrichmentKeyFor(SHEET_ALBUMS, album.rowNumber), tracks);
  }
}

function enrichSingleRow(single) {
  const helperSheet = SHEET_ENRICHMENT_SINGLES;
  const now = new Date();
  const primaryTitle = String(single.titles || '').split('/')[0].trim();
  let mbHit;
  try {
    mbHit = mbSearchRecording(single.artist, primaryTitle);
  } catch (err) {
    Logger.log('MusicBrainz lookup failed for single row ' + single.rowNumber + ': ' + err.message);
    return;
  }
  if (!mbHit || mbHit.score < MATCH_REVIEW_THRESHOLD) {
    upsertHelperRow(helperSheet, 'SourceRow', single.rowNumber, {
      Artist: single.artist, Titles: single.titles, MatchStatus: 'NotFound', LastEnrichedAt: now
    });
    return;
  }

  let coverArtUrl = null, tracks = [];
  try {
    if (mbHit.releaseId) {
      tracks = mbGetReleaseWithTracklist(mbHit.releaseId).tracks;
      coverArtUrl = caaGetFrontCoverUrl(null, mbHit.releaseId);
    }
  } catch (err) {
    Logger.log('Tracklist/cover lookup failed for single row ' + single.rowNumber + ': ' + err.message);
  }

  const artistSuggestion = spellingSuggestionFrom(mbHit.score, single.artist, mbHit.artist);
  const titleSuggestion = spellingSuggestionFrom(mbHit.score, primaryTitle, mbHit.title);

  upsertHelperRow(helperSheet, 'SourceRow', single.rowNumber, {
    Artist: single.artist,
    Titles: single.titles,
    MB_RecordingID: mbHit.id,
    MB_ReleaseID: mbHit.releaseId || '',
    MatchScore: mbHit.score,
    MatchStatus: classifyMatch(mbHit.score),
    CoverArtURL: coverArtUrl || '',
    SourceURL: 'https://musicbrainz.org/recording/' + mbHit.id,
    LastEnrichedAt: now,
    SpellingSuggestion_Artist: artistSuggestion || '',
    SpellingSuggestion_Titles: titleSuggestion || '',
    SuggestionStatus: (artistSuggestion || titleSuggestion) ? 'Pending' : ''
  });

  if (tracks.length) {
    replaceTracklist(enrichmentKeyFor(SHEET_SINGLES, single.rowNumber), tracks);
  }
}

// Called right after a new album/single is added — a couple of calls, seconds, safe to run inline.
function enrichOnDemand(sheetName, rowNumber) {
  try {
    if (sheetName === SHEET_ALBUMS) {
      const album = getAlbums().filter(function (a) { return a.rowNumber === rowNumber; })[0];
      if (album) enrichAlbumRow(album);
    } else if (sheetName === SHEET_SINGLES) {
      const single = getSingles().filter(function (s) { return s.rowNumber === rowNumber; })[0];
      if (single) enrichSingleRow(single);
    }
  } catch (err) {
    Logger.log('enrichOnDemand failed for ' + sheetName + ' row ' + rowNumber + ': ' + err.message);
  }
}

// Resumable backlog job — processes albums then singles, skipping anything already
// Enriched/NotFound, checkpointed so a 6-minute execution limit doesn't lose progress.
function runEnrichmentBatch() {
  withJobLock('enrichmentBatch', function () {
    const startTime = Date.now();
    const checkpoint = getCheckpoint('enrichmentBatch');
    const items = getAlbums().map(function (a) { return { type: 'album', data: a }; })
      .concat(getSingles().map(function (s) { return { type: 'single', data: s }; }));

    // Read each helper tab's current status ONCE up front — calling getEnrichmentRow()
    // (a full-tab read) inside the loop would mean O(n^2) sheet reads as the tab grows
    // across a run. New rows written during this run are looked up in `justEnriched` instead.
    const albumStatus = {}, singleStatus = {};
    readHelperTab(SHEET_ENRICHMENT_ALBUMS).forEach(function (r) { albumStatus[Number(r.SourceRow)] = r.MatchStatus; });
    readHelperTab(SHEET_ENRICHMENT_SINGLES).forEach(function (r) { singleStatus[Number(r.SourceRow)] = r.MatchStatus; });
    const isDone = function (status) { return status === 'Enriched' || status === 'NotFound'; };

    let processed = 0, calls = 0, errors = 0;
    let i = checkpoint.cursor || 0;
    for (; i < items.length; i++) {
      if (Date.now() - startTime > ENRICHMENT_RUN_BUDGET_MS) break;
      const item = items[i];
      const statusMap = item.type === 'album' ? albumStatus : singleStatus;
      if (isDone(statusMap[item.data.rowNumber])) continue;
      try {
        if (item.type === 'album') enrichAlbumRow(item.data); else enrichSingleRow(item.data);
        processed++;
        calls += 3;
      } catch (err) {
        errors++;
        Logger.log('Batch enrichment error on item ' + i + ': ' + err.message);
      }
    }

    if (i >= items.length) {
      resetCheckpoint('enrichmentBatch');
    } else {
      setCheckpoint('enrichmentBatch', { cursor: i });
    }
    logJobRun('enrichmentBatch', processed, calls, errors);
  });
}

// Wipes all enrichment results so the batch job reprocesses everything from scratch.
// Needed whenever the matching logic changes — rows already marked Enriched are
// skipped by runEnrichmentBatch, so improved matching would never reach them.
// Only touches tabs this app owns; Neil's original tabs are untouched.
function resetEnrichment() {
  [SHEET_ENRICHMENT_ALBUMS, SHEET_ENRICHMENT_SINGLES, SHEET_TRACKLISTS].forEach(function (name) {
    const sheet = getSheet(name);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  });
  resetCheckpoint('enrichmentBatch');
  Logger.log('Enrichment cleared. The next runEnrichmentBatch will start from the beginning.');
}

function installEnrichmentTrigger() {
  ScriptApp.newTrigger('runEnrichmentBatch').timeBased().everyMinutes(15).create();
}

/* Re-fetches one record from scratch. Needed because enrichment is skipped for
   anything already Enriched or NotFound: without this, a wrong match or a
   title Neil later corrects would keep its stale artwork forever. */
function reEnrichRow(sheetName, sourceRow) {
  const helperSheet = sheetName === SHEET_ALBUMS ? SHEET_ENRICHMENT_ALBUMS : SHEET_ENRICHMENT_SINGLES;
  const existing = getEnrichmentRow(sheetName, sourceRow);
  if (existing) {
    setHelperCell(helperSheet, existing.rowNumber, 'MatchStatus', 'Pending');
  }
  enrichOnDemand(sheetName, sourceRow);
  const refreshed = getEnrichmentRow(sheetName, sourceRow);
  return {
    ok: true,
    matchStatus: refreshed ? refreshed.MatchStatus : 'NotFound',
    coverArtUrl: refreshed ? refreshed.CoverArtURL : '',
    releaseYear: refreshed ? refreshed.ReleaseYear : '',
    genre: refreshed ? refreshed.Genre : ''
  };
}
