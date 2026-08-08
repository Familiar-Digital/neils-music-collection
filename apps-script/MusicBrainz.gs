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

function mbSearchReleaseGroup(artist, title) {
  const query = 'artist:"' + artist.replace(/"/g, '') + '" AND releasegroup:"' + title.replace(/"/g, '') + '"';
  const data = mbFetchJson('/release-group/?query=' + encodeURIComponent(query) + '&limit=1');
  const hit = data['release-groups'] && data['release-groups'][0];
  if (!hit) return null;
  return {
    id: hit.id,
    score: hit.score,
    title: hit.title,
    artist: hit['artist-credit'] && hit['artist-credit'][0] ? hit['artist-credit'][0].name : artist
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
