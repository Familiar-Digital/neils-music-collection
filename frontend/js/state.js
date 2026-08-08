const STORE = {
  albums: [],
  singles: [],
  compilations: [],
  dvds: [],
  suggestions: { spelling: [], gaps: [] },
  loaded: false
};

async function loadAllData() {
  const [albums, singles, compilations, dvds] = await Promise.all([
    API.getAlbums(), API.getSingles(), API.getCompilations(), API.getDVDs()
  ]);
  STORE.albums = albums;
  STORE.singles = singles;
  STORE.compilations = compilations;
  STORE.dvds = dvds;
  STORE.loaded = true;
}

async function loadSuggestions() {
  STORE.suggestions = await API.getSuggestions();
}

// Dates come from a hand-edited sheet: mostly ISO (yyyy-MM-dd) but some rows are
// typed as dd/mm/yy. Handle both rather than silently dropping the older format.
function decadeOf(dateString) {
  if (!dateString) return null;
  const isoMatch = String(dateString).match(/^(\d{4})-/);
  if (isoMatch) return Math.floor(Number(isoMatch[1]) / 10) * 10 + 's';
  const shortMatch = String(dateString).match(/\/(\d{2})$/);
  if (shortMatch) return Math.floor((2000 + Number(shortMatch[1])) / 10) * 10 + 's';
  return null;
}
