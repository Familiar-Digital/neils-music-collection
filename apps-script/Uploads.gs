/* ---------------------------------------------------------------------------
   Uploading your own artwork
   ---------------------------------------------------------------------------
   Neil photographs a sleeve on his phone and it becomes the cover. He never
   signs in to anything: the phone compresses the image, posts it here, and this
   commits it to the GitHub repository using a token held server-side. The
   credentials are the app's, not his.

   Files are served from raw.githubusercontent.com rather than the published
   site. Committing to the repo triggers a Pages rebuild, which takes the better
   part of a minute — so an image served from the site would appear to fail for
   anyone who looked straight after uploading. The raw URL works the instant the
   commit lands.

   Compression happens on the phone, not here. A modern phone camera produces
   4MB photographs; sending that through Apps Script as base64 would be slow on
   mobile data and wasteful when 100KB shows a record sleeve perfectly well.
--------------------------------------------------------------------------- */

const GITHUB_OWNER = 'Familiar-Digital';
const GITHUB_REPO = 'neils-music-collection';
const GITHUB_BRANCH = 'main';
const UPLOAD_DIR = 'frontend/uploads';

// 3MB of base64 — generous for a compressed sleeve, and a guard against a
// phone that ignores the client-side resize.
const MAX_UPLOAD_BASE64 = 3 * 1024 * 1024;

function githubToken() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('No GitHub token configured — artwork uploads are not set up yet.');
  return token;
}

function githubApi(method, path, payload) {
  const response = UrlFetchApp.fetch('https://api.github.com' + path, {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + githubToken(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: payload ? JSON.stringify(payload) : null,
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code >= 200 && code < 300) return JSON.parse(body);
  if (code === 404) return null;                 // used to test whether a file exists
  throw new Error('GitHub ' + code + ': ' + body.slice(0, 200));
}

/* A stable filename per record, so re-uploading replaces rather than
   accumulating. Git keeps every version in history regardless, but the working
   tree stays one file per record instead of a pile of near-duplicates. */
function uploadPathFor(sheetName, sourceRow) {
  const folder = sheetName === SHEET_SINGLES ? 'singles' : 'albums';
  const safeRow = String(sourceRow).replace(/[^A-Za-z0-9_-]/g, '_');
  return UPLOAD_DIR + '/' + folder + '/' + safeRow + '.jpg';
}

function rawUrlFor(path) {
  return 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/' + GITHUB_BRANCH + '/' + path;
}

/* Commits the image and points the record's cover at it. `imageBase64` is the
   bare base64 payload — the caller strips any data: prefix. */
function uploadArtwork(data) {
  const sheetName = data.sheetName === SHEET_SINGLES ? SHEET_SINGLES : SHEET_ALBUMS;
  const sourceRow = Number(data.sourceRow);
  const base64 = String(data.imageBase64 || '').replace(/^data:image\/[a-z]+;base64,/, '');

  if (!sourceRow) throw new Error('Which record is this for?');
  if (!base64) throw new Error('No image received.');
  if (base64.length > MAX_UPLOAD_BASE64) {
    throw new Error('That image is too large even after compression. Try again.');
  }

  const path = uploadPathFor(sheetName, sourceRow);

  // A commit that replaces a file must reference the blob it replaces.
  const existing = githubApi('get', '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/contents/' + path + '?ref=' + GITHUB_BRANCH);

  const payload = {
    message: 'Add artwork for ' + sheetName + ' row ' + sourceRow,
    content: base64,
    branch: GITHUB_BRANCH
  };
  if (existing && existing.sha) payload.sha = existing.sha;

  githubApi('put', '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path, payload);

  const url = rawUrlFor(path);
  const helperSheet = sheetName === SHEET_ALBUMS ? SHEET_ENRICHMENT_ALBUMS : SHEET_ENRICHMENT_SINGLES;
  const item = (sheetName === SHEET_ALBUMS ? getAlbums() : getSingles())
    .filter(function (r) { return r.rowNumber === sourceRow; })[0];

  /* MatchStatus Enriched keeps the nightly job from overwriting his photograph
     with a fetched cover, and MatchSource records that this one is his. */
  const fields = {
    CoverArtURL: url,
    MatchStatus: 'Enriched',
    MatchSource: 'Uploaded',
    LastEnrichedAt: new Date()
  };
  if (item) {
    if (sheetName === SHEET_ALBUMS) { fields.Artist = item.artist; fields.Title = item.title; }
    else { fields.Artist = item.artist; fields.Titles = item.titles; }
  }
  upsertHelperRow(helperSheet, 'SourceRow', sourceRow, fields);

  return { ok: true, coverArtUrl: url };
}

function artworkUploadsAvailable() {
  return { available: !!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') };
}
