/* ---------------------------------------------------------------------------
   Bulk enrichment import
   ---------------------------------------------------------------------------
   The one-time backlog (~950 records) is roughly an hour of work, almost all of
   it waiting on MusicBrainz's ~1 request/second courtesy limit. That does not
   fit comfortably inside Apps Script, which caps a single execution at six
   minutes and a consumer account at about ninety minutes of runtime per day.

   So the slow part runs elsewhere (see scripts/enrich-backlog.mjs) and posts
   finished results here. This endpoint does no network calls at all — it just
   writes what it is given, in bulk, using setValues rather than row-by-row
   appends so a few hundred records land in a couple of API calls.
--------------------------------------------------------------------------- */

const BULK_MAX_RECORDS = 250; // keeps a single request well inside the execution limit

function headerIndexMap(sheetName) {
  const headers = HELPER_SHEET_HEADERS[sheetName];
  const map = {};
  headers.forEach(function (h, i) { map[h] = i; });
  return map;
}

// Replaces existing rows for the same SourceRow rather than appending duplicates,
// so the import is safe to re-run after improving the matching logic.
function bulkUpsertEnrichment(sheetName, records) {
  if (!records.length) return 0;
  const headers = HELPER_SHEET_HEADERS[sheetName];
  const index = headerIndexMap(sheetName);
  const sheet = getSheet(sheetName);

  const existingByRow = {};
  readHelperTab(sheetName).forEach(function (r) { existingByRow[Number(r.SourceRow)] = r.rowNumber; });

  const newRows = [];
  records.forEach(function (rec) {
    const values = new Array(headers.length).fill('');
    Object.keys(rec).forEach(function (key) {
      if (index[key] !== undefined) values[index[key]] = rec[key] === null || rec[key] === undefined ? '' : rec[key];
    });
    const existingRowNumber = existingByRow[Number(rec.SourceRow)];
    if (existingRowNumber) {
      sheet.getRange(existingRowNumber, 1, 1, headers.length).setValues([values]);
    } else {
      newRows.push(values);
    }
  });

  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  }
  return records.length;
}

// Tracklists are keyed by EnrichmentKey; all rows for the supplied keys are
// cleared first so re-running never leaves a stale half of an old listing behind.
function bulkReplaceTracklists(entries) {
  if (!entries.length) return 0;
  const sheet = getSheet(SHEET_TRACKLISTS);
  const headers = HELPER_SHEET_HEADERS[SHEET_TRACKLISTS];

  const incomingKeys = {};
  entries.forEach(function (e) { incomingKeys[e.enrichmentKey] = true; });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    // Delete bottom-up so earlier row numbers stay valid as we go.
    for (let i = keys.length - 1; i >= 0; i--) {
      if (incomingKeys[keys[i][0]]) sheet.deleteRow(i + 2);
    }
  }

  const rows = [];
  entries.forEach(function (e) {
    (e.tracks || []).forEach(function (t) {
      rows.push([e.enrichmentKey, t.side || '', t.trackNumber || '', t.title || '', t.lengthSeconds || '', t.recordingId || '']);
    });
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
  return rows.length;
}

function bulkImportEnrichment(data) {
  const albums = data.albums || [];
  const singles = data.singles || [];
  const tracklists = data.tracklists || [];

  const total = albums.length + singles.length;
  if (total > BULK_MAX_RECORDS) {
    throw new Error('Too many records in one request (' + total + '). Send at most ' + BULK_MAX_RECORDS + '.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Another write is in progress — retry shortly.');
  try {
    const albumCount = bulkUpsertEnrichment(SHEET_ENRICHMENT_ALBUMS, albums);
    const singleCount = bulkUpsertEnrichment(SHEET_ENRICHMENT_SINGLES, singles);
    const trackCount = bulkReplaceTracklists(tracklists);
    logJobRun('bulkImport', albumCount + singleCount, 0, 0);
    return { albums: albumCount, singles: singleCount, trackRows: trackCount };
  } finally {
    lock.releaseLock();
  }
}
