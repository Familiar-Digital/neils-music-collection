const ADD_FORM = (function () {
  function wireForm(formId, submitFn, reloadCollection) {
    const form = document.getElementById(formId);
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });
      status.textContent = 'Saving…';
      try {
        await submitFn(data);
        status.textContent = 'Added — enriching in the background.';
        form.reset();
        const fresh = await reloadCollection();
        STORE[formId.includes('album') ? 'albums' : formId.includes('single') ? 'singles' : 'dvds'] = fresh;
        SEARCH.buildIndices();
        BROWSE.refresh();
      } catch (err) {
        status.textContent = 'Could not save: ' + err.message;
      }
    });
  }

  function init() {
    wireForm('add-album-form', API.addAlbum, API.getAlbums);
    wireForm('add-single-form', API.addSingle, API.getSingles);
    wireForm('add-dvd-form', API.addDVD, API.getDVDs);

    const tokenInput = document.getElementById('write-token-input');
    tokenInput.value = API.getWriteToken();
    document.getElementById('save-token-btn').addEventListener('click', function () {
      API.setWriteToken(tokenInput.value.trim());
      tokenInput.value = '';
      tokenInput.placeholder = 'Saved ✓';
    });
  }

  return { init };
})();
