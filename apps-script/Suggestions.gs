function setHelperCell(sheetName, rowNumber, header, value) {
  const colIndex = HELPER_SHEET_HEADERS[sheetName].indexOf(header);
  if (colIndex === -1) throw new Error('Unknown column "' + header + '" on ' + sheetName);
  getSheet(sheetName).getRange(rowNumber, colIndex + 1).setValue(value);
}

// field is 'artist' or 'title' — sheetName is the ORIGINAL tab (Albums/Singles), sourceRow its row number.
function applySpellingFix(sheetName, sourceRow, field, newValue) {
  if (sheetName === SHEET_ALBUMS) {
    const colIndex = field === 'artist' ? ALBUMS_COLS.ARTIST : ALBUMS_COLS.TITLE;
    getSheet(SHEET_ALBUMS).getRange(sourceRow, colIndex + 1).setValue(newValue);
    const enrichmentRow = getEnrichmentRow(SHEET_ALBUMS, sourceRow);
    if (enrichmentRow) {
      setHelperCell(SHEET_ENRICHMENT_ALBUMS, enrichmentRow.rowNumber, field === 'artist' ? 'Artist' : 'Title', newValue);
      setHelperCell(SHEET_ENRICHMENT_ALBUMS, enrichmentRow.rowNumber, 'SuggestionStatus', 'Approved');
    }
  } else if (sheetName === SHEET_SINGLES) {
    const colIndex = field === 'artist' ? SINGLES_COLS.ARTIST : SINGLES_COLS.TITLES;
    getSheet(SHEET_SINGLES).getRange(sourceRow, colIndex + 1).setValue(newValue);
    const enrichmentRow = getEnrichmentRow(SHEET_SINGLES, sourceRow);
    if (enrichmentRow) {
      setHelperCell(SHEET_ENRICHMENT_SINGLES, enrichmentRow.rowNumber, field === 'artist' ? 'Artist' : 'Titles', newValue);
      setHelperCell(SHEET_ENRICHMENT_SINGLES, enrichmentRow.rowNumber, 'SuggestionStatus', 'Approved');
    }
  } else {
    throw new Error('Unsupported sheetName for spelling fix: ' + sheetName);
  }
}

function rejectSpellingSuggestion(sheetName, sourceRow) {
  const helperSheet = sheetName === SHEET_ALBUMS ? SHEET_ENRICHMENT_ALBUMS : SHEET_ENRICHMENT_SINGLES;
  const enrichmentRow = getEnrichmentRow(sheetName, sourceRow);
  if (enrichmentRow) setHelperCell(helperSheet, enrichmentRow.rowNumber, 'SuggestionStatus', 'Rejected');
}

// rowNumber here is the row within Gap_Suggestions itself.
function approveGapSuggestion(rowNumber) {
  const headers = HELPER_SHEET_HEADERS[SHEET_GAP_SUGGESTIONS];
  const values = getSheet(SHEET_GAP_SUGGESTIONS).getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const row = {};
  headers.forEach(function (h, i) { row[h] = values[i]; });
  appendRow(SHEET_WISHLIST, [row.Artist, row.SuggestedAlbumTitle, 'Gap analysis', new Date()]);
  setHelperCell(SHEET_GAP_SUGGESTIONS, rowNumber, 'Status', 'Approved');
  setHelperCell(SHEET_GAP_SUGGESTIONS, rowNumber, 'ReviewedAt', new Date());
}

function rejectGapSuggestion(rowNumber) {
  setHelperCell(SHEET_GAP_SUGGESTIONS, rowNumber, 'Status', 'Rejected');
  setHelperCell(SHEET_GAP_SUGGESTIONS, rowNumber, 'ReviewedAt', new Date());
}
