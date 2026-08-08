const API = (function () {
  const baseUrl = window.APP_CONFIG.WEB_APP_URL;

  async function get(action, params) {
    const query = new URLSearchParams(Object.assign({ action: action }, params || {}));
    const response = await fetch(baseUrl + '?' + query.toString());
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function getWriteToken() {
    return localStorage.getItem('writeToken') || '';
  }

  function setWriteToken(token) {
    localStorage.setItem('writeToken', token);
  }

  async function post(action, payload) {
    const body = Object.assign({ action: action, token: getWriteToken() }, payload || {});
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

    getWriteToken: getWriteToken,
    setWriteToken: setWriteToken
  };
})();
