const SEARCH = (function () {
  const indices = {};
  let globalIndex = null;

  const KEYS = {
    albums:       ['artist', 'title'],
    singles:      ['artist', 'titles'],
    compilations: ['artist', 'title', 'albumTitle'],
    dvds:         ['title']
  };

  function buildIndices() {
    COLLECTIONS.forEach(function (c) {
      indices[c.key] = new Fuse(STORE[c.key], { keys: KEYS[c.key], threshold: 0.35, ignoreLocation: true });
    });

    // One index across everything, so the search overlay can answer
    // "where does this track appear?" without the user picking a tab first.
    const all = [];
    COLLECTIONS.forEach(function (c) {
      STORE[c.key].forEach(function (item) { all.push({ item: item, collectionKey: c.key }); });
    });
    globalIndex = new Fuse(all, {
      keys: ['item.artist', 'item.title', 'item.titles', 'item.albumTitle'],
      threshold: 0.35, ignoreLocation: true
    });
  }

  function searchCollection(collectionKey, query) {
    if (!query) return STORE[collectionKey];
    return indices[collectionKey].search(query).map(function (r) { return r.item; });
  }

  function searchEverything(query, limit) {
    if (!query || !globalIndex) return [];
    return globalIndex.search(query, { limit: limit || 40 }).map(function (r) { return r.item; });
  }

  function applyFilters(items, filters) {
    return items.filter(function (item) {
      if (filters.format && tidyFormat(item.format) !== filters.format) return false;
      if (filters.decade && releaseDecade(item) !== filters.decade) return false;
      if (filters.genre && item.genre !== filters.genre) return false;
      return true;
    });
  }

  function distinct(items, fn) {
    const set = new Set(items.map(fn).filter(Boolean));
    return Array.from(set).sort();
  }

  return { buildIndices, searchCollection, searchEverything, applyFilters, distinct };
})();
