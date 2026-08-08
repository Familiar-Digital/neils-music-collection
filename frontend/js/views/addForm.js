const ADD_FORM = (function () {
  const RELOADERS = {
    albums: function () { return API.getAlbums(); },
    singles: function () { return API.getSingles(); },
    dvds: function () { return API.getDVDs(); }
  };

  function wire(formId, collectionKey, submitFn) {
    const form = document.getElementById(formId);
    const status = form.querySelector('.form-status');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (!API.getWriteToken()) {
        status.className = 'form-status err';
        status.textContent = 'Enter the write access token below first.';
        return;
      }

      const data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });

      status.className = 'form-status';
      status.textContent = 'Saving…';

      try {
        let result = await submitFn(data);

        // The backend refuses an exact artist+title+format match unless forced,
        // because owning the same album on two formats is normal here.
        if (result.duplicate) {
          const label = (data.artist ? data.artist + ' — ' : '') + (data.title || data.titles);
          const proceed = confirm(label + '\n\nThis already exists in the collection on the same format (row ' +
            result.existingRow + ').\n\nAdd it anyway?');
          if (!proceed) {
            status.className = 'form-status';
            status.textContent = 'Not added — already in the collection.';
            return;
          }
          result = await submitFn(Object.assign({}, data, { force: true }));
        }

        status.className = 'form-status ok';
        status.textContent = 'Added. Fetching artwork and track listing…';
        form.reset();

        STORE[collectionKey] = await RELOADERS[collectionKey]();
        SEARCH.buildIndices();
        BROWSE.refresh();
        status.textContent = 'Added to the collection.';
      } catch (err) {
        status.className = 'form-status err';
        status.textContent = 'Could not save: ' + err.message;
      }
    });
  }

  function refreshTokenNote() {
    const note = document.getElementById('token-note');
    note.textContent = API.getWriteToken()
      ? 'You can add records and approve suggestions.'
      : 'The password you signed in with allows browsing only. Enter the editor password here to make changes.';
  }

  function init() {
    wire('add-album-form', 'albums', API.addAlbum);
    wire('add-single-form', 'singles', API.addSingle);
    wire('add-dvd-form', 'dvds', API.addDVD);

    const input = document.getElementById('write-token-input');
    document.getElementById('save-token-btn').addEventListener('click', function () {
      const value = input.value.trim();
      if (!value) return;
      // Swap to the stronger password and re-check what it permits, so the
      // page reflects reality rather than assuming the entry worked.
      API.setToken(value);
      input.value = '';
      API.checkAccess().then(function (access) {
        API.setCanWrite(access.write);
        refreshTokenNote();
      }).catch(function () { refreshTokenNote(); });
    });
    refreshTokenNote();
  }

  return { init, refreshTokenNote };
})();
