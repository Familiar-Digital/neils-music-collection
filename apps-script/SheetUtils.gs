function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function isBlankRow(row) {
  return row.every(function (cell) { return cell === null || cell === undefined || String(cell).trim() === ''; });
}

// Returns raw row values below the header, 1 row per array entry, each padded to `width`.
// `rowNumberOffset` is the sheet row number of the first data row (2 if there's a header, 1 if not).
function readDataRows(sheetName, width, rowNumberOffset) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < rowNumberOffset) return [];
  const range = sheet.getRange(rowNumberOffset, 1, lastRow - rowNumberOffset + 1, width);
  const values = range.getValues();
  const result = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (isBlankRow(row)) continue;
    result.push({ rowNumber: rowNumberOffset + i, values: row });
  }
  return result;
}

function formatDateCell(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value); // some rows have hand-typed strings like "20/10/25" — pass through as-is
}

function ensureHelperTabsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HELPER_SHEET_HEADERS).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const headers = HELPER_SHEET_HEADERS[name];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const alreadyHasHeaders = headers.every(function (h, i) { return firstRow[i] === h; });
    if (!alreadyHasHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

// THE one function to run from the Apps Script editor after deploying.
// Creates the helper tabs, generates a write token if there isn't one yet,
// and prints the token to the log so you can paste it into the web app.
// Safe to re-run — it won't regenerate an existing token.
function runInitialSetup() {
  ensureHelperTabsExist();

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('WRITE_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    props.setProperty('WRITE_TOKEN', token);
    Logger.log('Generated a new WRITE_TOKEN.');
  } else {
    Logger.log('WRITE_TOKEN already set — reusing it.');
  }

  Logger.log('=================================================');
  Logger.log('WRITE TOKEN (paste into the app\'s "Add New" tab):');
  Logger.log(token);
  Logger.log('=================================================');
  Logger.log('Helper tabs ready: ' + Object.keys(HELPER_SHEET_HEADERS).join(', '));
  return token;
}

// One-time setup entry point — run manually from the Apps Script editor once,
// or it runs automatically on first Web App request. Safe to re-run any time (idempotent).
function runSetup() {
  ensureHelperTabsExist();
  Logger.log('Helper tabs verified/created: ' + Object.keys(HELPER_SHEET_HEADERS).join(', '));
}

function appendRow(sheetName, rowValues) {
  const sheet = getSheet(sheetName);
  sheet.appendRow(rowValues);
  return sheet.getLastRow();
}

function findRowByColumnValue(sheetName, columnIndex, value) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) return i + 2;
  }
  return -1;
}
