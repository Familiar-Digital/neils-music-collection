/* ---------------------------------------------------------------------------
   Discogs — used for the manual "find a match" flow
   ---------------------------------------------------------------------------
   Automatic enrichment queries artist and title as separate fields, which is
   precise but brittle: it cannot match a record catalogued in a way that
   doesn't map onto those fields. Neil files soundtracks under the film —
   artist "A Clockwork Orange", title "Music From The Soundtrack" — where the
   actual release is credited to Various Artists and titled "Stanley Kubrick's
   A Clockwork Orange (Music From The Soundtrack)". No amount of fuzzy matching
   on the wrong fields finds that.

   Searching everything as one phrase does find it, but loosely enough that the
   result cannot be trusted blindly. So these results are shown to Neil with
   their artwork, year, country and format, and nothing is written until he
   picks one.
--------------------------------------------------------------------------- */

const DISCOGS_API = 'https://api.discogs.com';

function discogsToken() {
  const token = PropertiesService.getScriptProperties().getProperty('DISCOGS_TOKEN');
  if (!token) throw new Error('No Discogs token configured.');
  return token;
}

function discogsFetch(pathAndQuery) {
  const separator = pathAndQuery.indexOf('?') === -1 ? '?' : '&';
  const url = DISCOGS_API + pathAndQuery + separator + 'token=' + encodeURIComponent(discogsToken());
  const response = UrlFetchApp.fetch(url, {
    headers: { 'User-Agent': getMusicBrainzUserAgent() },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200) throw new Error('Discogs ' + code);
  return JSON.parse(response.getContentText());
}

function discogsMedium(format) {
  const f = String(format || '');
  if (/vinyl|\blp\b/i.test(f)) return 'Vinyl';
  if (/\bcd\b/i.test(f)) return 'CD';
  if (/dvd|blu-?ray/i.test(f)) return 'DVD';
  if (/cassette|tape/i.test(f)) return 'Cassette';
  return '';
}

// Free-text search across everything, narrowed to the medium actually owned so
// a vinyl LP doesn't come back as a cassette bootleg.
function discogsSearchCandidates(query, format, limit) {
  const medium = discogsMedium(format);
  const path = '/database/search?type=release&q=' + encodeURIComponent(query) +
    (medium ? '&format=' + encodeURIComponent(medium) : '') +
    '&per_page=' + (limit || 8);

  const data = discogsFetch(path);
  return (data.results || [])
    .filter(function (r) {
      return !(r.format || []).some(function (f) { return /unofficial|bootleg|test pressing/i.test(f); });
    })
    .map(function (r) {
      const parts = String(r.title || '').split(' - ');
      return {
        source: 'Discogs',
        id: String(r.id),
        artist: parts.length > 1 ? parts[0] : '',
        title: parts.length > 1 ? parts.slice(1).join(' - ') : String(r.title || ''),
        year: r.year ? Number(String(r.year).slice(0, 4)) : '',
        country: r.country || '',
        format: (r.format || []).slice(0, 4).join(', '),
        genre: (r.style && r.style[0]) || (r.genre && r.genre[0]) || '',
        catalogueNumber: r.catno && r.catno !== 'none' ? r.catno : '',
        thumbnail: r.thumb || '',
        coverArtUrl: r.cover_image && !/spacer\.gif$/.test(r.cover_image) ? r.cover_image : '',
        url: r.uri ? 'https://www.discogs.com' + r.uri : ''
      };
    });
}

function discogsReleaseDetail(releaseId) {
  const data = discogsFetch('/releases/' + releaseId);
  const tracks = [];
  (data.tracklist || []).forEach(function (t, i) {
    if (t.type_ && t.type_ !== 'track') return;   // skip headings and index entries
    const position = String(t.position || '');
    const side = position.match(/^([A-Z])/);
    tracks.push({
      side: side ? 'Side ' + side[1] : 'Tracks',
      trackNumber: position || (i + 1),
      title: t.title || '',
      lengthSeconds: durationToSeconds(t.duration)
    });
  });
  return {
    tracks: tracks,
    year: data.year || '',
    genre: (data.styles && data.styles[0]) || (data.genres && data.genres[0]) || '',
    catalogueNumber: (data.labels && data.labels[0] && data.labels[0].catno) || '',
    coverArtUrl: (data.images && data.images[0] && (data.images[0].uri || data.images[0].resource_url)) || '',
    url: data.uri || ''
  };
}

function durationToSeconds(duration) {
  const m = String(duration || '').match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : '';
}
