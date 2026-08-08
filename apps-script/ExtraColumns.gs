/* ---------------------------------------------------------------------------
   App-owned columns on Neil's own tabs
   ---------------------------------------------------------------------------
   Pressing numbers belong beside the record, not in a separate tab, so this
   adds a column to the Albums sheet. Two rules make that safe:

   1. The column is APPENDED after everything already in use. Inserting one
      would shift every column to its right, and his "Album Details" sheet
      pulls from fixed positions — it would silently start showing the wrong
      field.
   2. The position is resolved by looking up the header text at runtime rather
      than hard-coding an index, so if he moves or renames things by hand the
      code finds it again instead of writing into whatever now sits there.

   A note on where this nearly went wrong: his "Reference" column looked like a
   catalogue-number field and is not — it holds condition notes ("Noisy",
   "crackly", "Bootleg", "Condition poor"). Writing pressing numbers there
   would have overwritten annotations about damaged records.
--------------------------------------------------------------------------- */

const ALBUM_CATALOGUE_HEADER = 'Catalogue No';

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

// Finds the column, creating it at the far end of the sheet if absent.
function ensureAlbumCatalogueColumn() {
  const existing = findHeaderIndex(SHEET_ALBUMS, ALBUM_CATALOGUE_HEADER);
  if (existing !== -1) return existing;

  const sheet = getSheet(SHEET_ALBUMS);
  const newIndex = sheet.getLastColumn(); // 0-based index of the next free column
  sheet.getRange(1, newIndex + 1).setValue(ALBUM_CATALOGUE_HEADER);
  return newIndex;
}

function albumCatalogueColumnIndex() {
  const cached = PropertiesService.getScriptProperties().getProperty('ALBUM_CATALOGUE_COL');
  if (cached !== null && cached !== '') {
    const index = Number(cached);
    // Trust the cache only while the header is still where it says.
    const sheet = getSheet(SHEET_ALBUMS);
    if (index < sheet.getLastColumn()) {
      const header = String(sheet.getRange(1, index + 1).getValue()).trim();
      if (header === ALBUM_CATALOGUE_HEADER) return index;
    }
  }
  const index = ensureAlbumCatalogueColumn();
  PropertiesService.getScriptProperties().setProperty('ALBUM_CATALOGUE_COL', String(index));
  return index;
}
