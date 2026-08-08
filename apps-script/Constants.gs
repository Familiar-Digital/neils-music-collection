// Sheet names — the four tabs Neil already maintains by hand. Never restructure these.
const SHEET_ALBUMS = 'Albums';
const SHEET_SINGLES = 'Singles';
const SHEET_COMPILATIONS = 'Various compilations';
const SHEET_DVDS = 'DVDs';

// New, additive helper tabs this app owns.
const SHEET_ENRICHMENT_ALBUMS = 'Enrichment_Albums';
const SHEET_ENRICHMENT_SINGLES = 'Enrichment_Singles';
const SHEET_TRACKLISTS = 'Tracklists';
const SHEET_GAP_SUGGESTIONS = 'Gap_Suggestions';
const SHEET_WISHLIST = 'Wishlist';
const SHEET_JOB_LOG = 'Job_Log';
const SHEET_FORMAT_DECISIONS = 'Format_Decisions';

const HELPER_SHEET_HEADERS = {
  // ReleaseYear and Genre are sourced from MusicBrainz — they don't exist in Neil's
  // original tabs (his "Date" columns record when he played a record, not when it came out).
  // The app's year/genre filters depend on these.
  Enrichment_Albums: ['SourceRow', 'Artist', 'Title', 'MB_ReleaseGroupID', 'MB_ReleaseID', 'MatchScore', 'MatchStatus',
    'CoverArtURL', 'SourceURL', 'ReleaseYear', 'Genre', 'MatchSource', 'CatalogueNumber', 'LastEnrichedAt',
    'SpellingSuggestion_Artist', 'SpellingSuggestion_Title', 'SuggestionStatus'],
  Enrichment_Singles: ['SourceRow', 'Artist', 'Titles', 'MB_RecordingID', 'MB_ReleaseID', 'MatchScore', 'MatchStatus',
    'CoverArtURL', 'SourceURL', 'ReleaseYear', 'Genre', 'MatchSource', 'CatalogueNumber', 'LastEnrichedAt',
    'SpellingSuggestion_Artist', 'SpellingSuggestion_Titles', 'SuggestionStatus'],
  Tracklists: ['EnrichmentKey', 'Side', 'TrackNumber', 'Title', 'LengthSeconds', 'MB_RecordingID'],
  Gap_Suggestions: ['Artist', 'MB_ArtistID', 'SuggestedAlbumTitle', 'ReleaseDate', 'MB_ReleaseGroupID', 'MatchConfidence', 'Status', 'ReviewedAt'],
  Wishlist: ['Artist', 'Title', 'Source', 'AddedAt'],
  Job_Log: ['RunTimestamp', 'JobType', 'ItemsProcessed', 'CallsMade', 'ErrorsCount'],
  Format_Decisions: ['SheetName', 'SourceRow', 'AppliedValue', 'Status', 'DecidedAt']
};

// Fixed column layout for Neil's existing tabs (0-indexed), determined from the live sheet.
// We read/write by position, not by header name, because header rows are irregular
// (duplicate "Date" columns, blank spacer columns) and shouldn't be touched.
const ALBUMS_COLS = {
  ARTIST: 0, TITLE: 2, FORMAT: 3, REFERENCE: 4, DATE_VINYL: 5,
  VINYL_ALBUMS: 7, VINYL_DISCS: 8, DATE_CD: 9, CD: 10, DATE_DVD: 11, DVD: 12, REACTIONS: 13
};
const SINGLES_COLS = { ARTIST: 0, TITLES: 1, FORMAT: 2, DATE: 3 };
const COMPILATIONS_COLS = { ARTIST: 0, TITLE: 1, FORMAT: 3, ALBUM_TITLE: 4 };
const DVDS_COLS = { TITLE: 0, FORMAT: 1, DATE: 2 }; // no header row on this tab

const MATCH_STRONG_THRESHOLD = 90;
const MATCH_REVIEW_THRESHOLD = 70;
const GAP_MATCH_THRESHOLD = 80;

// MusicBrainz requires a descriptive User-Agent with a real contact, or it throttles
// and eventually blocks. Deliberately NOT built from Session.getEffectiveUser() —
// that needs a userinfo scope this script intentionally doesn't request, and it
// silently yields an empty contact, which MusicBrainz rejects.
// Set MUSICBRAINZ_CONTACT in Script Properties to your email; the fallback keeps
// requests valid (and keeps a personal address out of the repo) if it's unset.
function getMusicBrainzUserAgent() {
  const contact = PropertiesService.getScriptProperties().getProperty('MUSICBRAINZ_CONTACT')
    || 'https://github.com/FamiliarRich/neil-music-database';
  return 'NeilsMusicDatabase/1.0 ( ' + contact + ' )';
}
