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
  getWishlist: getWishlist
};

function doGet(e) {
  try {
    ensureHelperTabsExist();
    const action = e.parameter.action;
    const handler = READ_ACTIONS[action];
    if (!handler) return jsonError('Unknown action: ' + action);
    return jsonOutput(handler(e.parameter));
  } catch (err) {
    return jsonError(err.message);
  }
}

// Write actions all require a `token` field matching WRITE_TOKEN (see Auth.gs).
const WRITE_ACTIONS = {
  addAlbum: function (data) { return { rowNumber: appendAlbum(data) }; },
  addSingle: function (data) { return { rowNumber: appendSingle(data) }; },
  addDVD: function (data) { return { rowNumber: appendDVD(data) }; },
  applySpellingFix: function (data) { applySpellingFix(data.sheetName, Number(data.sourceRow), data.field, data.newValue); return { ok: true }; },
  rejectSpellingSuggestion: function (data) { rejectSpellingSuggestion(data.sheetName, Number(data.sourceRow)); return { ok: true }; },
  approveGapSuggestion: function (data) { approveGapSuggestion(Number(data.rowNumber)); return { ok: true }; },
  rejectGapSuggestion: function (data) { rejectGapSuggestion(Number(data.rowNumber)); return { ok: true }; }
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
