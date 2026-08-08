// Builds a SourceRow -> enrichment-summary map from a helper tab in one bulk read,
// so the browse grid can show artwork, release year and genre without one request
// per record. ReleaseYear/Genre drive the app's decade and genre filters.
function coverArtLookup(helperSheetName) {
  const map = {};
  readHelperTab(helperSheetName).forEach(function (r) {
    map[Number(r.SourceRow)] = {
      coverArtUrl: r.CoverArtURL || null,
      matchStatus: r.MatchStatus || null,
      releaseYear: r.ReleaseYear || null,
      genre: r.Genre || null,
      catalogueNumber: r.CatalogueNumber || null,
      matchSource: r.MatchSource || null
    };
  });
  return map;
}

function getAlbums() {
  const c = ALBUMS_COLS;
  const enrichment = coverArtLookup(SHEET_ENRICHMENT_ALBUMS);
  const cols = {
    catalogueNo: appColumnIndex(SHEET_ALBUMS, 'catalogueNo'),
    dateAcquired: appColumnIndex(SHEET_ALBUMS, 'dateAcquired'),
    lastPlayed: appColumnIndex(SHEET_ALBUMS, 'lastPlayed')
  };
  const width = Math.max(14, cols.catalogueNo + 1, cols.dateAcquired + 1, cols.lastPlayed + 1);
  return readDataRows(SHEET_ALBUMS, width, 2).map(function (r) {
    const v = r.values;
    const e = enrichment[r.rowNumber] || {};
    return {
      rowNumber: r.rowNumber,
      artist: String(v[c.ARTIST] || '').trim(),
      title: String(v[c.TITLE] || '').trim(),
      format: String(v[c.FORMAT] || '').trim(),
      condition: v[c.REFERENCE] ? String(v[c.REFERENCE]).trim() : null,
      catalogueNo: v[cols.catalogueNo] ? String(v[cols.catalogueNo]).trim() : null,
      dateAcquired: formatDateCell(v[cols.dateAcquired]),
      lastPlayed: formatDateCell(v[cols.lastPlayed]),
      sheetDate: formatDateCell(v[c.DATE_VINYL]) || formatDateCell(v[c.DATE_CD]) || formatDateCell(v[c.DATE_DVD]),
      vinylAlbums: v[c.VINYL_ALBUMS] || null,
      vinylDiscs: v[c.VINYL_DISCS] || null,
      cdCount: v[c.CD] || null,
      dvdCount: v[c.DVD] || null,
      reactions: v[c.REACTIONS] ? String(v[c.REACTIONS]).trim() : null,
      coverArtUrl: e.coverArtUrl || null,
      matchStatus: e.matchStatus || null,
      releaseYear: e.releaseYear || null,
      genre: e.genre || null,
      suggestedReference: e.catalogueNumber || null,
      matchSource: e.matchSource || null
    };
  }).filter(function (a) { return a.artist || a.title; });
}

function getSingles() {
  const c = SINGLES_COLS;
  const enrichment = coverArtLookup(SHEET_ENRICHMENT_SINGLES);
  return readDataRows(SHEET_SINGLES, 4, 2).map(function (r) {
    const v = r.values;
    const e = enrichment[r.rowNumber] || {};
    return {
      rowNumber: r.rowNumber,
      artist: String(v[c.ARTIST] || '').trim(),
      titles: String(v[c.TITLES] || '').trim(),
      format: String(v[c.FORMAT] || '').trim(),
      date: formatDateCell(v[c.DATE]),
      coverArtUrl: e.coverArtUrl || null,
      matchStatus: e.matchStatus || null,
      releaseYear: e.releaseYear || null,
      genre: e.genre || null
    };
  }).filter(function (s) { return s.artist || s.titles; });
}

function getCompilations() {
  const c = COMPILATIONS_COLS;
  return readDataRows(SHEET_COMPILATIONS, 5, 2).map(function (r) {
    const v = r.values;
    return {
      rowNumber: r.rowNumber,
      artist: String(v[c.ARTIST] || '').trim(),
      title: String(v[c.TITLE] || '').trim(),
      format: String(v[c.FORMAT] || '').trim(),
      albumTitle: String(v[c.ALBUM_TITLE] || '').trim()
    };
  }).filter(function (t) { return t.artist || t.title; });
}

function getDVDs() {
  const c = DVDS_COLS;
  return readDataRows(SHEET_DVDS, 3, 1).map(function (r) {
    const v = r.values;
    return {
      rowNumber: r.rowNumber,
      title: String(v[c.TITLE] || '').trim(),
      format: String(v[c.FORMAT] || '').trim(),
      date: formatDateCell(v[c.DATE])
    };
  }).filter(function (d) { return d.title; });
}

// Owning the same album on two formats is normal in this collection (The Wall is
// here on both vinyl and CD), so only an artist+title+FORMAT match counts as a
// duplicate. Returns the existing row number, or -1.
function findDuplicateAlbum(artist, title, format) {
  const key = function (a, t, f) { return normalizeForCompare(a) + '|' + normalizeForCompare(t) + '|' + normalizeForCompare(f); };
  const target = key(artist, title, format);
  const match = getAlbums().filter(function (a) { return key(a.artist, a.title, a.format) === target; })[0];
  return match ? match.rowNumber : -1;
}

// Appends a new album using the same column layout Neil already uses.
// Only fills the columns this app understands (artist/title/format/reference/date) —
// leaves the vinyl/CD/DVD count and reactions columns for him to fill in by hand if he wants.
// Refuses an exact duplicate unless the caller explicitly passes force:true.
function appendAlbum(data) {
  const duplicateRow = findDuplicateAlbum(data.artist, data.title, data.format);
  if (duplicateRow !== -1 && !data.force) {
    return { duplicate: true, existingRow: duplicateRow, rowNumber: null };
  }
  const row = new Array(14).fill('');
  const c = ALBUMS_COLS;
  row[c.ARTIST] = data.artist || '';
  row[c.TITLE] = data.title || '';
  row[c.FORMAT] = data.format || '';
  row[c.REFERENCE] = data.reference || '';
  row[c.DATE_VINYL] = data.sheetDate || '';
  const rowNumber = appendRow(SHEET_ALBUMS, row);
  enrichOnDemand(SHEET_ALBUMS, rowNumber);
  return { duplicate: false, rowNumber: rowNumber };
}

function appendSingle(data) {
  const row = [data.artist || '', data.titles || '', data.format || 'Single', data.dateAcquired || ''];
  const rowNumber = appendRow(SHEET_SINGLES, row);
  enrichOnDemand(SHEET_SINGLES, rowNumber);
  return { duplicate: false, rowNumber: rowNumber };
}

function appendDVD(data) {
  const row = [data.title || '', data.format || 'DVD', data.dateAcquired || ''];
  return appendRow(SHEET_DVDS, row);
}
