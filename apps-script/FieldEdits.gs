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

// Column index is resolved per field so "catalogueNo" can live in a column that
// is created on demand. A fixed allowlist keyed by name means a request can
// never nominate an arbitrary column and reach the rest of his data.
function editableColumnIndex(sheetName, field) {
  if (sheetName === SHEET_ALBUMS) {
    if (field === 'condition') return ALBUMS_COLS.REFERENCE;   // "Noisy", "crackly", "Bootleg"
    if (field === 'notes') return ALBUMS_COLS.REACTIONS;
    if (field === 'format') return ALBUMS_COLS.FORMAT;
    if (field === 'catalogueNo') return appColumnIndex(SHEET_ALBUMS, 'catalogueNo');
    if (field === 'dateAcquired') return appColumnIndex(SHEET_ALBUMS, 'dateAcquired');
    if (field === 'lastPlayed') return appColumnIndex(SHEET_ALBUMS, 'lastPlayed');
    return undefined;
  }
  if (sheetName === SHEET_SINGLES) {
    if (field === 'format') return SINGLES_COLS.FORMAT;
    return undefined;
  }
  return undefined;
}

function updateField(sheetName, sourceRow, field, value) {
  if (sheetName !== SHEET_ALBUMS && sheetName !== SHEET_SINGLES) {
    throw new Error('Unsupported sheet: ' + sheetName);
  }
  const columnIndex = editableColumnIndex(sheetName, field);
  if (columnIndex === undefined) throw new Error('Field not editable: ' + field);

  const row = Number(sourceRow);
  const sheet = getSheet(sheetName);
  if (!row || row < 2 || row > sheet.getLastRow()) throw new Error('Row out of range: ' + sourceRow);

  sheet.getRange(row, columnIndex + 1).setValue(String(value === null || value === undefined ? '' : value).trim());
  return { ok: true, sheetName: sheetName, sourceRow: row, field: field };
}

/* Note on pressing numbers: the enrichment tabs do record a CatalogueNumber
   from Discogs, because it arrives in the same response as everything else and
   costs no extra request. It is deliberately NOT offered to Neil as a value to
   accept. A catalogue number describes one specific pressing rather than the
   album, so a plausible-looking suggestion would invite acceptance without
   checking the label, and a wrong pressing number is worse than a blank one:
   it reads as authoritative. The stored value is reference data only — useful
   if we ever want to flag "your pressing may differ from the common one" — and
   Neil's own Reference column is only ever written by his own typing. */


/* "Played today" — the thing Neil has been doing by hand for two years, given a
   button. Stamps today's date in the app's own Last Played column; his existing
   date columns are left alone because only he knows whether they mean acquired
   or played. */
function markPlayed(sheetName, sourceRow, dateValue) {
  if (sheetName !== SHEET_ALBUMS) throw new Error('Only albums can be marked as played for now.');
  const when = dateValue ? String(dateValue) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return updateField(sheetName, sourceRow, 'lastPlayed', when);
}
