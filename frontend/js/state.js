const STORE = {
  albums: [],
  singles: [],
  compilations: [],
  compilationArt: {},        // enrichment keyed by compilation title
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

/* Loaded in two waves. The home screen needs one cover to show something, but
   waiting for everything meant a ten-second stare at a black page — most of it
   spent on the 2,900-row compilations tab, which the home screen never touches.
   Albums arrive first and the artwork starts immediately; the rest follows
   while it is already rotating. */
/* A round trip to Apps Script for 1,000 rows takes about four seconds however
   little is asked of it, and Neil will open this often. So the last response is
   kept locally and shown at once, with a fresh copy fetched in the background
   and swapped in when it arrives. Opening the app then feels instant, and the
   only cost is that the first paint can be a few minutes stale — which for a
   record collection is no cost at all. */
const CACHE_KEY = 'nw_collection_cache_v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) return null;
    return cached.data;
  } catch (err) {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data: {
        albums: STORE.albums.concat(STORE.musicDvds),
        singles: STORE.singles,
        compilations: STORE.compilations,
        compilationArt: STORE.compilationArt,
        dvds: STORE.dvds
      }
    }));
  } catch (err) {
    // Quota exceeded or private browsing — the cache is an optimisation, not a
    // requirement, so a failure here must never break loading.
  }
}

function hydrateFromCache() {
  const data = readCache();
  if (!data || !data.albums) return false;
  applyAlbumSplit(data.albums);
  STORE.singles = data.singles || [];
  STORE.compilations = data.compilations || [];
  STORE.compilationArt = data.compilationArt || {};
  STORE.dvds = data.dvds || [];
  STORE.fromCache = true;
  return true;
}

async function loadEssentialData() {
  const [albums, singles] = await Promise.all([API.getAlbums(), API.getSingles()]);
  applyAlbumSplit(albums);
  STORE.singles = singles;
}

async function loadRemainingData() {
  const [compilations, dvds, compilationAlbums] = await Promise.all([
    API.getCompilations(), API.getDVDs(), API.getCompilationAlbums().catch(function () { return []; })
  ]);
  STORE.compilations = compilations;
  STORE.dvds = dvds;
  STORE.compilationArt = {};
  (compilationAlbums || []).forEach(function (c) {
    STORE.compilationArt[c.title] = { coverArtUrl: c.coverArtUrl, releaseYear: c.releaseYear, genre: c.genre, sourceUrl: c.sourceUrl };
  });
  STORE.loaded = true;
  STORE.fromCache = false;
  writeCache();
}

async function loadAllData() {
  await loadEssentialData();
  await loadRemainingData();
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
  const raw = item.datePlayed || item.date;
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

/* Filtering on the raw format gave thirty chips — every colour of vinyl, every
   box set variant — which overflowed the screen on a phone and was no easier to
   use on a desktop. Grouping to the handful of things anyone actually filters by
   leaves the exact format visible on the record itself, where it belongs. */
function formatGroup(format) {
  const f = tidyFormat(format);
  if (!f) return null;
  if (/vinyl|^lp\b/i.test(f)) return 'Vinyl';
  if (/\bcd\b/i.test(f)) return 'CD';
  if (/dvd|blu-?ray/i.test(f)) return 'DVD';
  if (/single|\bep\b/i.test(f)) return 'Single / EP';
  if (/cassette|tape/i.test(f)) return 'Cassette';
  return 'Other';
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
