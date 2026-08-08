(async function () {
  function switchView(viewName) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach(function (section) {
      section.classList.toggle('hidden', section.id !== viewName + '-view');
    });
    if (viewName === 'suggestions') SUGGESTIONS_VIEW.refresh();
  }

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchView(btn.dataset.view); });
  });

  DETAIL.init();
  ADD_FORM.init();
  SUGGESTIONS_VIEW.init();

  document.getElementById('results-grid').innerHTML = '<p class="empty-note">Loading the collection…</p>';
  try {
    await loadAllData();
    BROWSE.init();
  } catch (err) {
    document.getElementById('results-grid').innerHTML =
      '<p class="empty-note">Could not load the collection: ' + err.message + '. Check that config.js has the right Web App URL.</p>';
  }
})();
