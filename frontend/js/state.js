const STORE = {
  albums: [],
  singles: [],
  compilations: [],
  musicDvds: [],
  dvds: [],
  suggestions: { spelling: [], gaps: [], formats: [] },
  wishlist: [],
  loaded: false
};

/* Two different things were both called "DVD". Neil files music in Albums
   whatever the format and films in the DVDs tab, so the tab held Carry On
   comedies while Albums held Pink Floyd concert films. Splitting them out means
   a concert DVD sits with the music it belongs to, not next to Carry On Cabby.

   Music DVDs are a VIEW over the Albums rows, not a separate tab — nothing
   moves in the spreadsheet, and Neil carries on filing exactly as he does. */
const COLLECTIONS = [
  { key: 'albums',       label: 'Albums',       titleField: 'title',  hasArtist: true  },
  { key: 'singles',      label: 'Singles',      titleField: 'titles', hasArtist: true  },
  { key: 'compilations', label: 'Compilations', titleField: 'title',  hasArtist: true  },
  { key: 'musicDvds',    label: 'Music DVDs',   titleField: 'title',  hasArtist: true, derivedFrom: 'albums' },
  { key: 'dvds',         label: 'Films',        titleField: 'title',  hasArtist: false }
];

function isVideoFormat(format) {
  return /dvd|blu-?ray|video/i.test(String(format || ''));
}

/* Concert DVDs live in the Albums tab but browse better on their own, so the
   rows are split into two categories. Every place that reloads the Albums sheet
   must go through here — assigning STORE.albums directly silently undoes the
   split and dumps concert films back among the records. */
function applyAlbumSplit(albumRows) {
  STORE.albums = albumRows.filter(function (a) { return !isVideoFormat(a.format); });
  STORE.musicDvds = albumRows.filter(function (a) { return isVideoFormat(a.format); });
}

// Every row from the Albums sheet, regardless of which category it browses under.
function allAlbumSheetRows() {
  return STORE.albums.concat(STORE.musicDvds);
}

async function reloadAlbums() {
  applyAlbumSplit(await API.getAlbums());
}

function collectionMeta(key) {
  return COLLECTIONS.filter(function (c) { return c.key === key; })[0];
}

function titleOf(item, collectionKey) {
  return item[collectionMeta(collectionKey).titleField] || '(untitled)';
}

async function loadAllData() {
  const [albums, singles, compilations, dvds] = await Promise.all([
    API.getAlbums(), API.getSingles(), API.getCompilations(), API.getDVDs()
  ]);
  applyAlbumSplit(albums);
  STORE.singles = singles;
  STORE.compilations = compilations;
  STORE.dvds = dvds;
  STORE.loaded = true;
}

async function loadSuggestions() {
  STORE.suggestions = await API.getSuggestions();
}

async function loadWishlist() {
  STORE.wishlist = await API.getWishlist();
}

/* ---------------------------------------------------------------
   Dates in the sheet are hand-entered and inconsistent: mostly ISO
   (yyyy-MM-dd) but plenty of dd/MM/yy. Both are handled; anything
   else returns null rather than guessing wrong.
----------------------------------------------------------------*/
function acquiredYear(item) {
  const raw = item.dateAcquired || item.date;
  if (!raw) return null;
  const iso = String(raw).match(/^(\d{4})-/);
  if (iso) return Number(iso[1]);
  const short = String(raw).match(/\/(\d{2})$/);
  if (short) return 2000 + Number(short[1]);
  return null;
}

// Release decade comes from enrichment (MusicBrainz), NOT from the sheet —
// Neil's date columns record when he played something, not when it came out.
function releaseDecade(item) {
  return item.releaseYear ? Math.floor(item.releaseYear / 10) * 10 + 's' : null;
}

// Formats are hand-typed and spacing is inconsistent — "CD Double", "CD  Double"
// and "CD      Double" all appear in the sheet and are the same thing. Collapse
// runs of whitespace for display and filtering, without touching the sheet itself.
function tidyFormat(format) {
  return String(format || '').replace(/\s+/g, ' ').trim();
}

/* ---------------------------------------------------------------
   Recently viewed — persisted locally, newest first, capped.
   Stored as "collection:rowNumber" so ids stay unique across tabs.
----------------------------------------------------------------*/
const RECENT_KEY = 'nw_recently_viewed';
const RECENT_MAX = 8;

function recentKeyFor(collectionKey, rowNumber) {
  return collectionKey + ':' + rowNumber;
}

function getRecentKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function recordView(collectionKey, rowNumber) {
  const key = recentKeyFor(collectionKey, rowNumber);
  const keys = getRecentKeys().filter(function (k) { return k !== key; }); // re-viewing moves it to the front
  keys.unshift(key);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(keys.slice(0, RECENT_MAX)));
  } catch (err) {
    // private browsing / storage full — recently-viewed is a nicety, never block on it
  }
}

// Resolves stored keys back to live records, dropping any that no longer exist
// (e.g. a row deleted from the sheet since it was viewed).
function getRecentItems() {
  return getRecentKeys().map(function (key) {
    const parts = key.split(':');
    const collectionKey = parts[0];
    const rowNumber = Number(parts[1]);
    const list = STORE[collectionKey];
    if (!list) return null;
    const item = list.filter(function (i) { return i.rowNumber === rowNumber; })[0];
    return item ? { item: item, collectionKey: collectionKey } : null;
  }).filter(Boolean);
}
