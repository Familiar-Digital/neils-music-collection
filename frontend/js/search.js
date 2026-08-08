const SEARCH = (function () {
  let albumFuse, singleFuse, compilationFuse, dvdFuse;

  function buildIndices() {
    albumFuse = new Fuse(STORE.albums, { keys: ['artist', 'title'], threshold: 0.35, ignoreLocation: true });
    singleFuse = new Fuse(STORE.singles, { keys: ['artist', 'titles'], threshold: 0.35, ignoreLocation: true });
    compilationFuse = new Fuse(STORE.compilations, { keys: ['artist', 'title', 'albumTitle'], threshold: 0.35, ignoreLocation: true });
    dvdFuse = new Fuse(STORE.dvds, { keys: ['title'], threshold: 0.35, ignoreLocation: true });
  }

  function searchCollection(collection, query) {
    const fuse = { albums: albumFuse, singles: singleFuse, compilations: compilationFuse, dvds: dvdFuse }[collection];
    if (!query) return STORE[collection];
    return fuse.search(query).map(function (r) { return r.item; });
  }

  function applyFilters(items, filters) {
    return items.filter(function (item) {
      if (filters.format && item.format !== filters.format) return false;
      if (filters.decade && decadeOf(item.dateAcquired || item.date) !== filters.decade) return false;
      return true;
    });
  }

  function distinctFormats(collection) {
    const set = new Set(STORE[collection].map(function (i) { return i.format; }).filter(Boolean));
    return Array.from(set).sort();
  }

  function distinctDecades(collection) {
    const set = new Set(STORE[collection].map(function (i) { return decadeOf(i.dateAcquired || i.date); }).filter(Boolean));
    return Array.from(set).sort();
  }

  return { buildIndices, searchCollection, applyFilters, distinctFormats, distinctDecades };
})();
