function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return jsonOutput({ error: String(message) });
}

const READ_ACTIONS = {
  getAlbums: getAlbums,
  getSingles: getSingles,
  getCompilations: getCompilations,
  getDVDs: getDVDs,
  getAlbumDetail: function (params) { return getAlbumDetail(Number(params.rowNumber)); },
  getSingleDetail: function (params) { return getSingleDetail(Number(params.rowNumber)); },
  getSuggestions: getSuggestions,
  getWishlist: getWishlist,
  getGapStatus: getGapStatus,
  getEverything: getEverything,
  getCompilationAlbums: getCompilationAlbums,
  listTriggers: listTriggers
};

function doGet(e) {
  try {
    ensureHelperTabsExist();
    const action = e.parameter.action;
    // The access check itself must answer without a valid token, otherwise the
    // password screen has no way to tell a wrong password from a broken link.
    if (action === 'checkAccess') return jsonOutput(checkAccess(e.parameter));

    const handler = READ_ACTIONS[action];
    if (!handler) return jsonError('Unknown action: ' + action);
    requireReadAccess(e.parameter.token);
    return jsonOutput(handler(e.parameter));
  } catch (err) {
    return jsonError(err.message);
  }
}

// Write actions all require a `token` field matching WRITE_TOKEN (see Auth.gs).
const WRITE_ACTIONS = {
  addAlbum: function (data) { return appendAlbum(data); },
  addSingle: function (data) { return appendSingle(data); },
  addDVD: function (data) { return { duplicate: false, rowNumber: appendDVD(data) }; },
  applySpellingFix: function (data) { applySpellingFix(data.sheetName, Number(data.sourceRow), data.field, data.newValue); return { ok: true }; },
  rejectSpellingSuggestion: function (data) { rejectSpellingSuggestion(data.sheetName, Number(data.sourceRow)); return { ok: true }; },
  approveGapSuggestion: function (data) { approveGapSuggestion(Number(data.rowNumber)); return { ok: true }; },
  rejectGapSuggestion: function (data) { rejectGapSuggestion(Number(data.rowNumber)); return { ok: true }; },
  applyFormatFix: function (data) { applyFormatFix(data.sheetName, Number(data.sourceRow), data.newValue); return { ok: true }; },
  rejectFormatFix: function (data) { rejectFormatFix(data.sheetName, Number(data.sourceRow)); return { ok: true }; },
  bulkImportEnrichment: function (data) { return bulkImportEnrichment(data); },
  updateField: function (data) { return updateField(data.sheetName, data.sourceRow, data.field, data.value); },
  setGapThreshold: function (data) { return setGapThreshold(data.threshold); },
  markPlayed: function (data) { return markPlayed(data.sheetName, Number(data.sourceRow), data.date); },
  reEnrich: function (data) { return reEnrichRow(data.sheetName, Number(data.sourceRow)); },
  installNightlyEnrichment: function () { return installNightlyEnrichment(); },
  runGapAnalysis: function () { runGapAnalysisBatch(); return getGapStatus(); }
};

function doPost(e) {
  try {
    ensureHelperTabsExist();
    const data = JSON.parse(e.postData.contents);
    const handler = WRITE_ACTIONS[data.action];
    if (!handler) return jsonError('Unknown action: ' + data.action);
    checkWriteToken(data.token);
    return jsonOutput(handler(data));
  } catch (err) {
    return jsonError(err.message);
  }
}
