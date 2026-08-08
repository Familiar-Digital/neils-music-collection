/* ---------------------------------------------------------------------------
   In-app editing of Neil's own fields
   ---------------------------------------------------------------------------
   Pressing (catalogue) numbers are the obvious thing a vinyl collector wants to
   record, and his sheet already has a "Reference" column for exactly that — it
   is simply unused on most rows. So the app edits that column rather than
   inventing a parallel one, which keeps the spreadsheet the single source of
   truth and means anything typed here is visible to him in Sheets immediately.

   Only fields Neil owns are writable, and only by name from a fixed allowlist:
   a request cannot nominate an arbitrary column index and reach the rest of his
   data. Machine-derived values (artwork, genre, match scores) are not editable
   here — they live in the enrichment tabs and are rewritten by the job.
--------------------------------------------------------------------------- */

const EDITABLE_FIELDS = {
  Albums: {
    reference: ALBUMS_COLS.REFERENCE,   // catalogue / pressing number
    reactions: ALBUMS_COLS.REACTIONS,   // his listening notes
    format: ALBUMS_COLS.FORMAT
  },
  Singles: {
    reference: null,                    // Singles has no reference column in his layout
    format: SINGLES_COLS.FORMAT
  }
};

function updateField(sheetName, sourceRow, field, value) {
  const fields = EDITABLE_FIELDS[sheetName];
  if (!fields) throw new Error('Unsupported sheet: ' + sheetName);

  const columnIndex = fields[field];
  if (columnIndex === undefined) throw new Error('Field not editable: ' + field);
  if (columnIndex === null) throw new Error('"' + field + '" does not exist on ' + sheetName + '.');

  const row = Number(sourceRow);
  const sheet = getSheet(sheetName);
  if (!row || row < 2 || row > sheet.getLastRow()) throw new Error('Row out of range: ' + sourceRow);

  sheet.getRange(row, columnIndex + 1).setValue(String(value === null || value === undefined ? '' : value).trim());
  return { ok: true, sheetName: sheetName, sourceRow: row, field: field };
}

// The catalogue number Discogs proposed for a row, if any, so the app can offer
// it as a starting point. Deliberately never written automatically: a catalogue
// number identifies one specific pressing, and only Neil can see which pressing
// is actually on his shelf.
function getSuggestedReference(sourceRow) {
  const row = readHelperTab(SHEET_ENRICHMENT_ALBUMS).filter(function (r) {
    return Number(r.SourceRow) === Number(sourceRow);
  })[0];
  if (!row || !row.CatalogueNumber) return null;
  return { catalogueNumber: row.CatalogueNumber, source: row.MatchSource || '', sourceUrl: row.SourceURL || '' };
}
