/* ---------------------------------------------------------------------------
   App-owned columns on Neil's own tabs
   ---------------------------------------------------------------------------
   Some things the app needs a home for don't exist in his layout. Rather than
   reinterpret a column he already uses, each gets a new one, APPENDED after
   everything in use. Two rules make that safe:

   1. Append, never insert. Inserting shifts every column to the right, and his
      "Album Details" sheet pulls from fixed positions — it would silently start
      showing the wrong field.
   2. Resolve by header text at runtime, not by a hard-coded index, so if he
      moves or renames things by hand the code finds the column again instead of
      writing into whatever now sits there.

   Why not reuse what looks available:

   - "Reference" looked like a catalogue field. It is not: it holds condition
     notes ("Noisy", "crackly", "Bootleg"). Writing there would have overwritten
     his annotations about damaged records.
   - "Reactions" holds twelve dates, which looked like repeat plays. It isn't
     that either — Neil has been watching reaction videos, so it likely records
     those. Left strictly alone; the app neither reads nor writes it.
   - His three "Date" columns (one per format) are ambiguous between acquired
     and played, and only he can say which. So the app adds its own explicitly
     named columns rather than guessing, and leaves his untouched.
--------------------------------------------------------------------------- */

const APP_COLUMNS = {
  catalogueNo: 'Catalogue No',
  dateAcquired: 'Date Acquired',
  lastPlayed: 'Last Played'
};

// Returns the 0-based index of a header on a sheet, or -1.
function findHeaderIndex(sheetName, headerText) {
  const sheet = getSheet(sheetName);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return -1;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerText) return i;
  }
  return -1;
}

// Finds an app column, creating it at the far end of the sheet if absent.
function appColumnIndex(sheetName, key) {
  const headerText = APP_COLUMNS[key];
  if (!headerText) throw new Error('Unknown app column: ' + key);

  const cacheKey = 'APPCOL_' + sheetName + '_' + key;
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty(cacheKey);
  const sheet = getSheet(sheetName);

  if (cached !== null && cached !== '') {
    const index = Number(cached);
    // Trust the cache only while the header is still where it says it is.
    if (index < sheet.getLastColumn()) {
      if (String(sheet.getRange(1, index + 1).getValue()).trim() === headerText) return index;
    }
  }

  let index = findHeaderIndex(sheetName, headerText);
  if (index === -1) {
    index = sheet.getLastColumn();
    sheet.getRange(1, index + 1).setValue(headerText);
  }
  props.setProperty(cacheKey, String(index));
  return index;
}

// Creates every app column up front so the sheet's shape settles once, rather
// than growing the first time each feature happens to be used.
function ensureAppColumns() {
  Object.keys(APP_COLUMNS).forEach(function (key) { appColumnIndex(SHEET_ALBUMS, key); });
}

function albumCatalogueColumnIndex() { return appColumnIndex(SHEET_ALBUMS, 'catalogueNo'); }
