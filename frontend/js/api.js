const API = (function () {
  const baseUrl = window.APP_CONFIG.WEB_APP_URL;

  async function get(action, params) {
    // Every read carries the password too, so the collection stays invisible
    // even though the site itself sits on a public URL.
    const query = new URLSearchParams(Object.assign({ action: action, token: getToken() }, params || {}));
    const response = await fetch(baseUrl + '?' + query.toString());
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /* One box, one password. Whether it also permits editing is decided by the
     server, not here — a browsing password and an editor password look
     identical, and only the backend knows which is which. */
  function getToken() {
    return localStorage.getItem('collectionToken') || '';
  }

  function setToken(token) {
    localStorage.setItem('collectionToken', token);
  }

  function clearToken() {
    localStorage.removeItem('collectionToken');
  }

  let canWrite = false;
  function setCanWrite(value) { canWrite = !!value; }
  function getWriteToken() { return canWrite ? getToken() : ''; }

  async function post(action, payload) {
    const body = Object.assign({ action: action, token: getToken() }, payload || {});
    const response = await fetch(baseUrl, { method: 'POST', body: JSON.stringify(body) });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    getAlbums: function () { return get('getAlbums'); },
    getSingles: function () { return get('getSingles'); },
    getCompilations: function () { return get('getCompilations'); },
    getDVDs: function () { return get('getDVDs'); },
    getAlbumDetail: function (rowNumber) { return get('getAlbumDetail', { rowNumber: rowNumber }); },
    getSingleDetail: function (rowNumber) { return get('getSingleDetail', { rowNumber: rowNumber }); },
    getSuggestions: function () { return get('getSuggestions'); },
    getWishlist: function () { return get('getWishlist'); },
    getGapStatus: function () { return get('getGapStatus'); },
    getCompilationAlbums: function () { return get('getCompilationAlbums'); },
    findMatchCandidates: function (p) { return get('findMatchCandidates', p); },
    getUnmatched: function (p) { return get('getUnmatched', p); },
    artworkUploadsAvailable: function () { return get('artworkUploadsAvailable'); },

    addAlbum: function (data) { return post('addAlbum', data); },
    addSingle: function (data) { return post('addSingle', data); },
    addDVD: function (data) { return post('addDVD', data); },
    applySpellingFix: function (data) { return post('applySpellingFix', data); },
    rejectSpellingSuggestion: function (data) { return post('rejectSpellingSuggestion', data); },
    approveGapSuggestion: function (data) { return post('approveGapSuggestion', data); },
    rejectGapSuggestion: function (data) { return post('rejectGapSuggestion', data); },
    applyFormatFix: function (data) { return post('applyFormatFix', data); },
    rejectFormatFix: function (data) { return post('rejectFormatFix', data); },
    updateField: function (data) { return post('updateField', data); },
    markPlayed: function (data) { return post('markPlayed', data); },
    reEnrich: function (data) { return post('reEnrich', data); },
    applyMatchCandidate: function (data) { return post('applyMatchCandidate', data); },
    uploadArtwork: function (data) { return post('uploadArtwork', data); },
    setGapThreshold: function (data) { return post('setGapThreshold', data); },
    runGapAnalysis: function () { return post('runGapAnalysis', {}); },

    checkAccess: function () { return get('checkAccess'); },
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    setCanWrite: setCanWrite,
    getWriteToken: getWriteToken,
    setWriteToken: setToken
  };
})();
