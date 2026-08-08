const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const MUSICBRAINZ_MIN_INTERVAL_MS = 1100; // MusicBrainz asks for ~1 request/second, be conservative

function mbFetchJson(path, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = 3;
  const url = MUSICBRAINZ_BASE + path + (path.indexOf('?') === -1 ? '?' : '&') + 'fmt=json';
  const response = UrlFetchApp.fetch(url, {
    headers: { 'User-Agent': getMusicBrainzUserAgent() },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  Utilities.sleep(MUSICBRAINZ_MIN_INTERVAL_MS);
  if (code === 503 && retriesLeft > 0) {
    Utilities.sleep(2000);
    return mbFetchJson(path, retriesLeft - 1);
  }
  if (code !== 200) {
    throw new Error('MusicBrainz request failed (' + code + '): ' + path);
  }
  return JSON.parse(response.getContentText());
}

// Secondary types that mean "not the original album" — a plain LP in the collection
// should never match a remix/live/compilation edition of the same name.
const NON_ORIGINAL_SECONDARY_TYPES = ['Remix', 'Live', 'Compilation', 'Soundtrack', 'DJ-mix', 'Mixtape/Street', 'Demo'];

function isOriginalStudioAlbum(group) {
  if (group['primary-type'] !== 'Album') return false;
  const secondary = group['secondary-types'] || [];
  return !secondary.some(function (t) { return NON_ORIGINAL_SECONDARY_TYPES.indexOf(t) !== -1; });
}

// MusicBrainz routinely returns several equally-scoring release-groups for the same
// title (e.g. "Paranoid" matches the album, the single, the live single AND a remix
// album, all at score 100). Taking the first hit picks essentially at random, so
// fetch a page of candidates and prefer a genuine studio album.
function mbSearchReleaseGroup(artist, title) {
  const query = 'artist:"' + artist.replace(/"/g, '') + '" AND releasegroup:"' + title.replace(/"/g, '') + '"';
  const data = mbFetchJson('/release-group/?query=' + encodeURIComponent(query) + '&limit=10');
  const groups = data['release-groups'] || [];
  if (!groups.length) return null;

  const topScore = groups[0].score;
  const contenders = groups.filter(function (g) { return g.score >= topScore - 2; });
  const originals = contenders.filter(isOriginalStudioAlbum);
  const hit = originals.length ? originals[0] : groups[0];

  return {
    id: hit.id,
    score: hit.score,
    title: hit.title,
    artist: hit['artist-credit'] && hit['artist-credit'][0] ? hit['artist-credit'][0].name : artist,
    primaryType: hit['primary-type'] || null,
    secondaryTypes: hit['secondary-types'] || [],
    firstReleaseDate: hit['first-release-date'] || null
  };
}

function mbSearchRecording(artist, title) {
  const query = 'artist:"' + artist.replace(/"/g, '') + '" AND recording:"' + title.replace(/"/g, '') + '"';
  const data = mbFetchJson('/recording/?query=' + encodeURIComponent(query) + '&limit=1');
  const hit = data.recordings && data.recordings[0];
  if (!hit) return null;
  return {
    id: hit.id,
    score: hit.score,
    title: hit.title,
    artist: hit['artist-credit'] && hit['artist-credit'][0] ? hit['artist-credit'][0].name : artist,
    releaseId: hit.releases && hit.releases[0] ? hit.releases[0].id : null
  };
}

// Given a release-group, pick a representative release to pull cover art + tracklist from —
// prefer an official release, earliest date.
function mbPickReleaseForGroup(releaseGroupId) {
  const data = mbFetchJson('/release?release-group=' + releaseGroupId + '&inc=release-groups&limit=25');
  const releases = data.releases || [];
  if (!releases.length) return null;
  const official = releases.filter(function (r) { return r.status === 'Official'; });
  const pool = official.length ? official : releases;
  pool.sort(function (a, b) { return (a.date || '9999').localeCompare(b.date || '9999'); });
  return pool[0].id;
}

function secondsFromLengthMs(ms) {
  return ms ? Math.round(ms / 1000) : null;
}

function mbGetReleaseWithTracklist(releaseId) {
  const data = mbFetchJson('/release/' + releaseId + '?inc=recordings+media');
  const tracks = [];
  (data.media || []).forEach(function (medium, mediumIndex) {
    const sideLabel = (data.media.length > 1)
      ? (medium.title || ('Disc ' + (mediumIndex + 1)))
      : 'Side One';
    (medium.tracks || []).forEach(function (track) {
      tracks.push({
        side: sideLabel,
        trackNumber: track.position,
        title: track.title,
        lengthSeconds: secondsFromLengthMs(track.length)
      });
    });
  });
  return { releaseId: releaseId, tracks: tracks };
}

// Genres for a release-group, most-voted first. MusicBrainz genres are community
// tags, so they're uneven — we take the top one and treat it as a hint, not gospel.
function mbGetGenre(releaseGroupId) {
  try {
    const data = mbFetchJson('/release-group/' + releaseGroupId + '?inc=genres');
    const genres = (data.genres || []).slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
    if (!genres.length) return null;
    return genres[0].name.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  } catch (err) {
    Logger.log('Genre lookup failed for release-group ' + releaseGroupId + ': ' + err.message);
    return null;
  }
}

function yearFromDate(dateString) {
  if (!dateString) return null;
  const match = String(dateString).match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function mbGetArtist(name) {
  const query = 'artist:"' + name.replace(/"/g, '') + '"';
  const data = mbFetchJson('/artist/?query=' + encodeURIComponent(query) + '&limit=1');
  const hit = data.artists && data.artists[0];
  if (!hit) return null;
  return { id: hit.id, score: hit.score, name: hit.name };
}

// Studio albums only — excludes compilations/live/soundtrack/etc secondary types.
function mbBrowseStudioAlbums(artistId) {
  const results = [];
  let offset = 0;
  const pageSize = 100;
  while (true) {
    const data = mbFetchJson('/release-group?artist=' + artistId + '&type=album&limit=' + pageSize + '&offset=' + offset);
    const groups = data['release-groups'] || [];
    groups.forEach(function (g) {
      const secondaryTypes = g['secondary-types'] || [];
      const isExcluded = secondaryTypes.some(function (t) {
        return ['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street'].indexOf(t) !== -1;
      });
      if (!isExcluded) {
        results.push({ id: g.id, title: g.title, releaseDate: g['first-release-date'] || null });
      }
    });
    offset += pageSize;
    if (groups.length < pageSize) break;
  }
  return results;
}
