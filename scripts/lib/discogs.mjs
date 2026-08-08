/* ---------------------------------------------------------------------------
   Discogs — secondary source, used only where MusicBrainz comes up short.
   ---------------------------------------------------------------------------
   Discogs is built around physical releases rather than abstract works, which
   suits a vinyl collection: it carries catalogue numbers, pressing country and
   a format vocabulary ("2×LP", "Picture Disc", coloured variants) much closer
   to the one Neil already uses.

   It is a fallback rather than the primary source because MusicBrainz needs no
   authentication, publishes its data openly, and has better track listings.
   Throughput is not a reason to prefer either: Discogs allows 60 requests per
   minute authenticated, and MusicBrainz's 1-per-second is the same 60.
--------------------------------------------------------------------------- */

const API = 'https://api.discogs.com';
const RATE_MS = 1100; // 60/min authenticated — same effective ceiling as MusicBrainz

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function rateLimited() {
  const wait = RATE_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function discogsFetch(pathAndQuery, { token, userAgent }, attempt = 0) {
  await rateLimited();
  const url = `${API}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent } });

  // 429 is Discogs' throttle response; back off rather than hammering.
  if (res.status === 429 && attempt < 4) {
    await sleep(3000 * (attempt + 1));
    return discogsFetch(pathAndQuery, { token, userAgent }, attempt + 1);
  }
  if (!res.ok) throw new Error(`Discogs ${res.status} for ${pathAndQuery}`);
  return res.json();
}

/* Discogs has no relevance score, so confidence is derived from how closely the
   returned artist and title match what was asked for. Being explicit about this
   matters: a Discogs result must clear the same bar as a MusicBrainz one before
   it is trusted, and the two are not otherwise comparable. */
const normalize = (s) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na && !nb) return 100;
  const max = Math.max(na.length, nb.length);
  if (!max) return 100;
  return Math.round((1 - levenshtein(na, nb) / max) * 100);
}

// Discogs titles come back as "Artist - Title"; split so each half can be
// scored against what we actually asked for.
function splitDiscogsTitle(combined) {
  const idx = String(combined || '').indexOf(' - ');
  if (idx === -1) return { artist: '', title: combined || '' };
  return { artist: combined.slice(0, idx), title: combined.slice(idx + 3) };
}

/* A catalogue number identifies a specific pressing, so the country matters:
   Dark Side of the Moon is SHVL 804 in the UK but SHVLJ(D) 804 in South Africa.
   Neil's collection is British, so UK pressings are nudged ahead of foreign ones
   — enough to win a tie, not enough to beat a materially better title match.
   The country travels with the result so he can check it against the label. */
const HOME_COUNTRIES = ['UK', 'United Kingdom', 'Europe'];
const HOME_COUNTRY_BONUS = 6;

function scoreCandidate(candidate, wantedArtist, wantedTitle) {
  const parts = splitDiscogsTitle(candidate.title);
  const artistScore = similarity(parts.artist, wantedArtist);
  const titleScore = similarity(parts.title, wantedTitle);
  // Title carries more weight: a mis-parsed artist half is common, a wrong album is not.
  const base = Math.round(titleScore * 0.65 + artistScore * 0.35);
  const home = HOME_COUNTRIES.includes(candidate.country) ? HOME_COUNTRY_BONUS : 0;
  return Math.min(100, base + home);
}

/* Discogs indexes every pressing of everything, including bootlegs and unrelated
   media that happen to share a title. Searching unconstrained returned an
   educational DVD for "Dark Side of the Moon" (score 90) and a bootleg cassette
   for an Abba compilation (score 100) — both would have been trusted. So the
   medium Neil actually owns is passed to the search, and unofficial pressings
   are discarded outright. */
const MEDIUM_KEYWORDS = [
  [/vinyl|lp|single|ep|album/i, 'Vinyl'],
  [/\bcd\b/i, 'CD'],
  [/dvd|blu-?ray/i, 'DVD'],
  [/cassette|tape/i, 'Cassette']
];

export function discogsMediumFor(format) {
  const f = String(format || '');
  for (const [pattern, medium] of MEDIUM_KEYWORDS) {
    if (pattern.test(f)) return medium;
  }
  return null;
}

function isUnofficial(candidate) {
  return (candidate.format || []).some((f) => /unofficial|bootleg|promo|test pressing/i.test(f));
}

function matchesMedium(candidate, medium) {
  if (!medium) return true;
  return (candidate.format || []).some((f) => {
    if (medium === 'Vinyl') return /vinyl|lp\b/i.test(f);
    if (medium === 'CD') return /^cd$|\bcd\b/i.test(f);
    if (medium === 'DVD') return /dvd|blu-?ray/i.test(f);
    if (medium === 'Cassette') return /cassette/i.test(f);
    return true;
  });
}

/* Searches for a release and returns a normalised result, or null.
   artistVariants lets the caller pass both "Bowie    David" and "David Bowie".
   `medium` narrows the search to the format actually owned. */
export async function discogsFindRelease({ artistVariants, title, medium, auth }) {
  let best = null;
  const formatParam = medium ? `&format=${encodeURIComponent(medium)}` : '';

  for (const artist of artistVariants) {
    const query = `?type=release&artist=${encodeURIComponent(artist)}&release_title=${encodeURIComponent(title)}${formatParam}&per_page=10`;
    let data;
    try {
      data = await discogsFetch(`/database/search${query}`, auth);
    } catch (err) {
      if (/Discogs 4(01|03)/.test(err.message)) throw err; // bad token — fail loudly
      continue;                                            // transient — try the next variant
    }

    (data.results || []).forEach((candidate) => {
      if (isUnofficial(candidate)) return;
      if (!matchesMedium(candidate, medium)) return;
      const score = scoreCandidate(candidate, artist, title);
      if (!best || score > best.score) best = { score, candidate };
    });

    if (best && best.score >= 90) break; // strong enough; don't spend another request
  }

  if (!best) return null;

  const c = best.candidate;
  return {
    score: best.score,
    releaseId: c.id,
    title: splitDiscogsTitle(c.title).title,
    artist: splitDiscogsTitle(c.title).artist,
    year: c.year ? Number(String(c.year).slice(0, 4)) : '',
    // Discogs "style" is more specific than "genre" (Post-Punk vs Rock), so prefer it.
    genre: (c.style && c.style[0]) || (c.genre && c.genre[0]) || '',
    catalogueNumber: c.catno && c.catno !== 'none' ? c.catno : '',
    country: c.country || '',
    formats: c.format || [],
    coverArtUrl: c.cover_image && !/spacer\.gif$/.test(c.cover_image) ? c.cover_image : '',
    sourceUrl: c.uri ? `https://www.discogs.com${c.uri}` : ''
  };
}

// Track listing for a specific release. Discogs positions are strings ("A1",
// "B2"), which conveniently encode the vinyl side.
export async function discogsTracklist(releaseId, auth) {
  const data = await discogsFetch(`/releases/${releaseId}`, auth);
  const tracks = [];
  (data.tracklist || []).forEach((t, i) => {
    if (t.type_ && t.type_ !== 'track') return; // skip headings and index entries
    const position = String(t.position || '');
    const sideLetter = position.match(/^([A-Z])/);
    tracks.push({
      side: sideLetter ? `Side ${sideLetter[1]}` : 'Tracks',
      trackNumber: position || i + 1,
      title: t.title || '',
      lengthSeconds: durationToSeconds(t.duration),
      recordingId: ''
    });
  });
  return tracks;
}

function durationToSeconds(duration) {
  const m = String(duration || '').match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : '';
}
