#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   One-time backlog enrichment
   ---------------------------------------------------------------------------
   Fetches artwork, release year, genre and track listings from MusicBrainz and
   the Cover Art Archive for every album and single, then posts the results to
   the Apps Script web app in batches.

   This runs locally rather than inside Apps Script for one reason: the work is
   ~950 records at MusicBrainz's ~1 request/second courtesy limit, which is
   about an hour. Apps Script caps a single execution at six minutes and a
   consumer account at roughly ninety minutes of runtime per day, so the same
   job there has to be chopped across two days. Here it just runs.

   Progress is checkpointed to disk after every batch, so stopping it (or
   closing the laptop) costs at most one batch of work.

   Usage:
     node scripts/enrich-backlog.mjs --token <WRITE_TOKEN> [options]

   Options:
     --token <t>     write token (required; or set MUSIC_DB_TOKEN)
     --url <u>       web app /exec URL (defaults to frontend/config.js)
     --contact <e>   contact for the MusicBrainz User-Agent (required by them)
     --limit <n>     stop after n records — useful for a trial run
     --only <kind>   'albums' or 'singles'
     --force         re-enrich records already done
     --dry-run       fetch and report, but write nothing
--------------------------------------------------------------------------- */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHECKPOINT = path.join(HERE, '.enrich-checkpoint.json');

const MB = 'https://musicbrainz.org/ws/2';
const CAA = 'https://coverartarchive.org';
const RATE_MS = 1100;          // MusicBrainz asks for ~1 req/sec; be slightly under
const BATCH_SIZE = 100;        // records per write request (endpoint caps at 250)
const MATCH_REVIEW = 70;
const MATCH_STRONG = 90;

const NON_ORIGINAL = ['Remix', 'Live', 'Compilation', 'Soundtrack', 'DJ-mix', 'Mixtape/Street', 'Demo'];

/* ---------------- args ---------------- */
function parseArgs(argv) {
  const out = { limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--token') out.token = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--contact') out.contact = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function webAppUrlFromConfig() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'frontend', 'config.js'), 'utf8');
    const m = src.match(/WEB_APP_URL:\s*'([^']+)'/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/* ---------------- http ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function rateLimited() {
  const wait = RATE_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function mbFetch(pathAndQuery, userAgent, attempt = 0) {
  await rateLimited();
  const url = `${MB}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}fmt=json`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent } });

  // 503 means we're being throttled; back off rather than hammering.
  if (res.status === 503 && attempt < 4) {
    await sleep(2000 * (attempt + 1));
    return mbFetch(pathAndQuery, userAgent, attempt + 1);
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${pathAndQuery}`);
  return res.json();
}

// Cover Art Archive answers a valid request with a 307 to archive.org. We only
// need to know whether art exists, so don't follow the redirect or pull bytes.
async function coverExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return res.status === 200 || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

/* ---------------- matching ---------------- */
const normalize = (s) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

function isOriginalAlbum(group) {
  if (group['primary-type'] !== 'Album') return false;
  return !(group['secondary-types'] || []).some((t) => NON_ORIGINAL.includes(t));
}

// MusicBrainz returns several equally-scoring groups for a title — "Paranoid"
// matches the album, the single, a live single and a remix album, all at 100.
// Prefer a genuine studio album rather than whichever came back first.
function pickReleaseGroup(groups) {
  if (!groups.length) return null;
  const top = groups[0].score;
  const contenders = groups.filter((g) => g.score >= top - 2);
  return contenders.find(isOriginalAlbum) || groups[0];
}

/* Neil catalogues solo artists surname-first — "Bowie    David", "Amos   Tori" —
   which is a deliberate convention (the sheet sorts by surname, and the column is
   headed "A A Artist"). It affects about 30% of the albums and matches nothing in
   MusicBrainz, so queries try the reversed form as well. His data is left alone:
   the reversal is for searching only. */
function artistVariants(artist) {
  const raw = String(artist || '').trim();
  const variants = [raw.replace(/\s+/g, ' ')];
  const surnameFirst = raw.match(/^(.+?)\s{2,}(.+)$/);
  if (surnameFirst) {
    const reversed = `${surnameFirst[2].trim()} ${surnameFirst[1].trim()}`.replace(/\s+/g, ' ');
    if (!variants.includes(reversed)) variants.push(reversed);
  }
  return variants;
}

// True when two names contain the same words in a different order or spacing,
// e.g. "Bowie    David" and "David Bowie". Such a difference is Neil's filing
// convention, not a spelling mistake, so it must never become a suggestion.
function sameWordsDifferentOrder(a, b) {
  const wordsOf = (s) => normalize(s).split(' ').filter(Boolean).sort().join(' ');
  return wordsOf(a) === wordsOf(b);
}

function spellingSuggestion(score, current, canonical) {
  if (score < MATCH_REVIEW) return '';
  if (normalize(current) === normalize(canonical)) return '';
  if (sameWordsDifferentOrder(current, canonical)) return '';
  return canonical;
}

const yearOf = (d) => (d && /^(\d{4})/.test(d) ? Number(d.slice(0, 4)) : '');
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------------- per-record enrichment ---------------- */
async function enrichAlbum(album, ua) {
  const title = String(album.title).replace(/"/g, '');
  let hit = null;
  for (const variant of artistVariants(album.artist)) {
    const q = `artist:"${variant.replace(/"/g, '')}" AND releasegroup:"${title}"`;
    const search = await mbFetch(`/release-group/?query=${encodeURIComponent(q)}&limit=10`, ua);
    const candidate = pickReleaseGroup(search['release-groups'] || []);
    if (candidate && (!hit || candidate.score > hit.score)) hit = candidate;
    if (hit && hit.score >= MATCH_STRONG) break; // good enough; don't spend another request
  }

  if (!hit || hit.score < MATCH_REVIEW) {
    return { record: { SourceRow: album.rowNumber, Artist: album.artist, Title: album.title,
      MatchStatus: 'NotFound', LastEnrichedAt: new Date().toISOString() }, tracks: null };
  }

  // One call for releases and genres together, rather than two.
  const detail = await mbFetch(`/release-group/${hit.id}?inc=releases+genres`, ua);
  const releases = detail.releases || [];
  const official = releases.filter((r) => r.status === 'Official');
  const pool = (official.length ? official : releases)
    .slice().sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const release = pool[0] || null;

  let tracks = [];
  if (release) {
    try {
      const full = await mbFetch(`/release/${release.id}?inc=recordings+media`, ua);
      (full.media || []).forEach((medium, mi) => {
        const side = full.media.length > 1 ? (medium.title || `Disc ${mi + 1}`) : 'Side One';
        (medium.tracks || []).forEach((t) => tracks.push({
          side, trackNumber: t.position, title: t.title,
          lengthSeconds: t.length ? Math.round(t.length / 1000) : '', recordingId: t.recording?.id || ''
        }));
      });
    } catch (err) {
      process.stderr.write(`  tracklist failed for ${album.artist} — ${album.title}: ${err.message}\n`);
    }
  }

  const genres = (detail.genres || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  const artistName = hit['artist-credit']?.[0]?.name || album.artist;

  let cover = '';
  if (await coverExists(`${CAA}/release-group/${hit.id}/front-500`)) {
    cover = `${CAA}/release-group/${hit.id}/front-500`;
  } else if (release && await coverExists(`${CAA}/release/${release.id}/front-500`)) {
    cover = `${CAA}/release/${release.id}/front-500`;
  }

  const artistFix = spellingSuggestion(hit.score, album.artist, artistName);
  const titleFix = spellingSuggestion(hit.score, album.title, hit.title);

  return {
    record: {
      SourceRow: album.rowNumber,
      Artist: album.artist,
      Title: album.title,
      MB_ReleaseGroupID: hit.id,
      MB_ReleaseID: release?.id || '',
      MatchScore: hit.score,
      MatchStatus: hit.score >= MATCH_STRONG ? 'Enriched' : 'NeedsReview',
      CoverArtURL: cover,
      SourceURL: `https://musicbrainz.org/release-group/${hit.id}`,
      ReleaseYear: yearOf(hit['first-release-date']),
      Genre: genres.length ? titleCase(genres[0].name) : '',
      LastEnrichedAt: new Date().toISOString(),
      SpellingSuggestion_Artist: artistFix,
      SpellingSuggestion_Title: titleFix,
      SuggestionStatus: artistFix || titleFix ? 'Pending' : ''
    },
    tracks: tracks.length ? { enrichmentKey: `Albums:${album.rowNumber}`, tracks } : null
  };
}

async function enrichSingle(single, ua) {
  const primary = String(single.titles || '').split('/')[0].trim();
  let hit = null;
  for (const variant of artistVariants(single.artist)) {
    const q = `artist:"${variant.replace(/"/g, '')}" AND recording:"${primary.replace(/"/g, '')}"`;
    const search = await mbFetch(`/recording/?query=${encodeURIComponent(q)}&limit=5`, ua);
    const candidate = (search.recordings || [])[0];
    if (candidate && (!hit || candidate.score > hit.score)) hit = candidate;
    if (hit && hit.score >= MATCH_STRONG) break;
  }

  if (!hit || hit.score < MATCH_REVIEW) {
    return { record: { SourceRow: single.rowNumber, Artist: single.artist, Titles: single.titles,
      MatchStatus: 'NotFound', LastEnrichedAt: new Date().toISOString() }, tracks: null };
  }

  const releaseId = hit.releases?.[0]?.id || '';
  const artistName = hit['artist-credit']?.[0]?.name || single.artist;
  const cover = releaseId && await coverExists(`${CAA}/release/${releaseId}/front-500`)
    ? `${CAA}/release/${releaseId}/front-500` : '';

  const artistFix = spellingSuggestion(hit.score, single.artist, artistName);
  const titleFix = spellingSuggestion(hit.score, primary, hit.title);

  return {
    record: {
      SourceRow: single.rowNumber,
      Artist: single.artist,
      Titles: single.titles,
      MB_RecordingID: hit.id,
      MB_ReleaseID: releaseId,
      MatchScore: hit.score,
      MatchStatus: hit.score >= MATCH_STRONG ? 'Enriched' : 'NeedsReview',
      CoverArtURL: cover,
      SourceURL: `https://musicbrainz.org/recording/${hit.id}`,
      ReleaseYear: yearOf(hit['first-release-date']),
      Genre: '',
      LastEnrichedAt: new Date().toISOString(),
      SpellingSuggestion_Artist: artistFix,
      SpellingSuggestion_Titles: titleFix,
      SuggestionStatus: artistFix || titleFix ? 'Pending' : ''
    },
    tracks: null
  };
}

/* ---------------- checkpoint ---------------- */
const loadCheckpoint = () => {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')); } catch { return { done: [] }; }
};
const saveCheckpoint = (cp) => fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2));

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('---*/')[0]);
    return;
  }

  const token = args.token || process.env.MUSIC_DB_TOKEN;
  const url = args.url || webAppUrlFromConfig();
  const contact = args.contact || process.env.MUSIC_DB_CONTACT;

  if (!token && !args.dryRun) throw new Error('Missing --token (or MUSIC_DB_TOKEN).');
  if (!url) throw new Error('Missing --url and could not read frontend/config.js.');
  if (!contact) throw new Error('Missing --contact. MusicBrainz requires a contact in the User-Agent.');

  const ua = `NeilsMusicDatabase/1.0 ( ${contact} )`;
  const checkpoint = loadCheckpoint();
  const done = new Set(checkpoint.done);

  process.stdout.write(`Reading collection from the web app…\n`);
  const [albums, singles] = await Promise.all([
    fetch(`${url}?action=getAlbums`).then((r) => r.json()),
    fetch(`${url}?action=getSingles`).then((r) => r.json())
  ]);

  const queue = [];
  if (args.only !== 'singles') {
    albums.forEach((a) => queue.push({ kind: 'album', item: a, key: `Albums:${a.rowNumber}` }));
  }
  if (args.only !== 'albums') {
    singles.forEach((s) => queue.push({ kind: 'single', item: s, key: `Singles:${s.rowNumber}` }));
  }

  const pending = queue.filter((q) => {
    if (!args.force && done.has(q.key)) return false;
    if (!args.force && q.item.matchStatus === 'Enriched') return false;
    return true;
  }).slice(0, args.limit);

  // ~8s per album, measured: three rate-limited MusicBrainz calls plus network
  // latency and up to two cover-art checks. Singles need one call fewer.
  const estimate = Math.round((pending.length * 8000) / 60000);
  process.stdout.write(
    `${albums.length} albums, ${singles.length} singles. ${pending.length} to process` +
    ` (~${estimate} min at ${RATE_MS}ms/request).\n` +
    (args.dryRun ? 'DRY RUN — nothing will be written.\n' : '')
  );
  if (!pending.length) { process.stdout.write('Nothing to do.\n'); return; }

  let batchAlbums = [], batchSingles = [], batchTracks = [];
  let processed = 0, notFound = 0, withCover = 0, failed = 0;
  const startedAt = Date.now();

  async function flush() {
    if (!batchAlbums.length && !batchSingles.length) return;
    if (!args.dryRun) {
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ action: 'bulkImportEnrichment', token,
          albums: batchAlbums, singles: batchSingles, tracklists: batchTracks })
      });
      const body = await res.json();
      if (body.error) throw new Error(`Write failed: ${body.error}`);
    }
    saveCheckpoint({ done: [...done] });
    batchAlbums = []; batchSingles = []; batchTracks = [];
  }

  for (const entry of pending) {
    const label = entry.kind === 'album'
      ? `${entry.item.artist} — ${entry.item.title}`
      : `${entry.item.artist} — ${entry.item.titles}`;
    try {
      const result = entry.kind === 'album'
        ? await enrichAlbum(entry.item, ua)
        : await enrichSingle(entry.item, ua);

      if (entry.kind === 'album') batchAlbums.push(result.record); else batchSingles.push(result.record);
      if (result.tracks) batchTracks.push(result.tracks);
      if (result.record.MatchStatus === 'NotFound') notFound++;
      if (result.record.CoverArtURL) withCover++;
      done.add(entry.key);
    } catch (err) {
      failed++;
      process.stderr.write(`  FAILED ${label}: ${err.message}\n`);
    }

    processed++;
    if (processed % 10 === 0 || processed === pending.length) {
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      const pct = ((processed / pending.length) * 100).toFixed(0);
      process.stdout.write(`  ${processed}/${pending.length} (${pct}%) · ${withCover} covers · ${notFound} not found · ${failed} failed · ${mins} min\n`);
    }
    if (batchAlbums.length + batchSingles.length >= BATCH_SIZE) await flush();
  }

  await flush();
  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  process.stdout.write(
    `\nDone in ${mins} min.\n` +
    `  enriched : ${processed - notFound - failed}\n` +
    `  no match : ${notFound}\n` +
    `  failed   : ${failed}\n` +
    `  covers   : ${withCover}\n` +
    (args.dryRun ? '\n(dry run — nothing was written)\n' : '')
  );
}

main().catch((err) => {
  process.stderr.write(`\n${err.stack || err.message}\n`);
  process.exit(1);
});
