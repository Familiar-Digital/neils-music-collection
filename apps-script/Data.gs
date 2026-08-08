// Builds a SourceRow -> {coverArtUrl, matchStatus} map from a helper tab in one bulk read,
// so the browse grid can show art without one request per album/single.
function coverArtLookup(helperSheetName) {
  const map = {};
  readHelperTab(helperSheetName).forEach(function (r) {
    map[Number(r.SourceRow)] = { coverArtUrl: r.CoverArtURL || null, matchStatus: r.MatchStatus || null };
  });
  return map;
}

function getAlbums() {
  const c = ALBUMS_COLS;
  const enrichment = coverArtLookup(SHEET_ENRICHMENT_ALBUMS);
  return readDataRows(SHEET_ALBUMS, 14, 2).map(function (r) {
    const v = r.values;
    const e = enrichment[r.rowNumber] || {};
    return {
      rowNumber: r.rowNumber,
      artist: String(v[c.ARTIST] || '').trim(),
      title: String(v[c.TITLE] || '').trim(),
      format: String(v[c.FORMAT] || '').trim(),
      reference: v[c.REFERENCE] ? String(v[c.REFERENCE]).trim() : null,
      dateAcquired: formatDateCell(v[c.DATE_VINYL]) || formatDateCell(v[c.DATE_CD]) || formatDateCell(v[c.DATE_DVD]),
      vinylAlbums: v[c.VINYL_ALBUMS] || null,
      vinylDiscs: v[c.VINYL_DISCS] || null,
      cdCount: v[c.CD] || null,
      dvdCount: v[c.DVD] || null,
      reactions: v[c.REACTIONS] ? String(v[c.REACTIONS]).trim() : null,
      coverArtUrl: e.coverArtUrl || null,
      matchStatus: e.matchStatus || null
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
      matchStatus: e.matchStatus || null
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

// Appends a new album using the same column layout Neil already uses.
// Only fills the columns this app understands (artist/title/format/reference/date) —
// leaves the vinyl/CD/DVD count and reactions columns for him to fill in by hand if he wants.
function appendAlbum(data) {
  const row = new Array(14).fill('');
  const c = ALBUMS_COLS;
  row[c.ARTIST] = data.artist || '';
  row[c.TITLE] = data.title || '';
  row[c.FORMAT] = data.format || '';
  row[c.REFERENCE] = data.reference || '';
  row[c.DATE_VINYL] = data.dateAcquired || '';
  const rowNumber = appendRow(SHEET_ALBUMS, row);
  enrichOnDemand(SHEET_ALBUMS, rowNumber);
  return rowNumber;
}

function appendSingle(data) {
  const row = [data.artist || '', data.titles || '', data.format || 'Single', data.dateAcquired || ''];
  const rowNumber = appendRow(SHEET_SINGLES, row);
  enrichOnDemand(SHEET_SINGLES, rowNumber);
  return rowNumber;
}

function appendDVD(data) {
  const row = [data.title || '', data.format || 'DVD', data.dateAcquired || ''];
  return appendRow(SHEET_DVDS, row);
}
