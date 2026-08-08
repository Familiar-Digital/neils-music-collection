/* ---------------------------------------------------------------------------
   Format alignment
   ---------------------------------------------------------------------------
   Format is Neil's own vocabulary, so MusicBrainz can't validate it the way it
   validates artist and title. Instead we compare formats against each other:
   a value used once or twice that closely resembles one used dozens of times
   is almost certainly a slip of the keyboard.

   The frequency guard is essential, not decorative. "Vinyl Triple" and "Vinyl
   Double" are 83% similar, so similarity alone would happily rewrite all ten
   Triples into Doubles. Requiring the suspect value to be rare (<= 2 uses) and
   the proposed replacement to be well established (>= 5 uses) keeps real
   variants safe while still catching "Vnyl Double" and "Viny Triple".
--------------------------------------------------------------------------- */

const FORMAT_RARE_MAX = 2;        // a value used more than this is treated as deliberate
const FORMAT_COMMON_MIN = 5;      // only well-established values may be suggested
const FORMAT_SIMILARITY_MIN = 80; // percent

function tidyFormatValue(format) {
  return String(format || '').replace(/\s+/g, ' ').trim();
}

function formatCounts(items) {
  const counts = {};
  items.forEach(function (item) {
    const f = tidyFormatValue(item.format);
    if (!f) return;
    counts[f] = (counts[f] || 0) + 1;
  });
  return counts;
}

// The physical medium. Two formats naming different media are never typos for one
// another, however similar the strings look — "DVD Double" and "CD Double" differ
// by 20% and would otherwise be "corrected" into each other, silently turning a
// concert DVD into a CD.
const MEDIA_TOKENS = ['vinyl', 'cd', 'dvd', 'single', 'ep', 'cassette', 'lp', 'blu-ray'];

function mediaTokenOf(value) {
  const words = normalizeForCompare(value).split(' ');
  for (let i = 0; i < words.length; i++) {
    if (MEDIA_TOKENS.indexOf(words[i]) !== -1) return words[i];
  }
  return null; // e.g. "Vnyl Double" — the medium is itself misspelt, so nothing to protect
}

function mediaTypesConflict(a, b) {
  const ma = mediaTokenOf(a);
  const mb = mediaTokenOf(b);
  return ma !== null && mb !== null && ma !== mb;
}

// Returns the best established format for a rare one, or null if nothing is close enough.
function bestFormatMatch(rareValue, counts) {
  let best = null;
  Object.keys(counts).forEach(function (candidate) {
    if (candidate === rareValue) return;
    if (counts[candidate] < FORMAT_COMMON_MIN) return;
    if (mediaTypesConflict(rareValue, candidate)) return;
    const score = similarityRatio(rareValue, candidate);
    if (score < FORMAT_SIMILARITY_MIN) return;
    if (!best || score > best.score || (score === best.score && counts[candidate] > best.count)) {
      best = { value: candidate, score: score, count: counts[candidate] };
    }
  });
  return best;
}

function detectFormatTyposFor(items, sheetName) {
  const counts = formatCounts(items);
  const suggestions = [];
  items.forEach(function (item) {
    const current = tidyFormatValue(item.format);
    if (!current) return;
    if (counts[current] > FORMAT_RARE_MAX) return;
    const match = bestFormatMatch(current, counts);
    if (!match) return;
    suggestions.push({
      type: 'format',
      sheetName: sheetName,
      sourceRow: item.rowNumber,
      artist: item.artist || '',
      title: item.title || item.titles || '',
      currentFormat: item.format,          // raw, so the user sees exactly what's in the cell
      suggestedFormat: match.value,
      confidence: match.score,
      usedHere: counts[current],
      usedElsewhere: match.count
    });
  });
  return suggestions;
}

function detectFormatTypos() {
  return detectFormatTyposFor(getAlbums(), SHEET_ALBUMS)
    .concat(detectFormatTyposFor(getSingles(), SHEET_SINGLES));
}

// Writes an approved format correction into the original cell. Like the spelling
// fixes, this only ever runs after an explicit approval in the app.
function applyFormatFix(sheetName, sourceRow, newValue) {
  let columnIndex;
  if (sheetName === SHEET_ALBUMS) columnIndex = ALBUMS_COLS.FORMAT;
  else if (sheetName === SHEET_SINGLES) columnIndex = SINGLES_COLS.FORMAT;
  else throw new Error('Unsupported sheet for format fix: ' + sheetName);

  getSheet(sheetName).getRange(sourceRow, columnIndex + 1).setValue(newValue);
  recordFormatDecision(sheetName, sourceRow, newValue, 'Approved');
}

function rejectFormatFix(sheetName, sourceRow) {
  recordFormatDecision(sheetName, sourceRow, '', 'Rejected');
}

// Decisions are logged so a dismissed suggestion doesn't reappear on every load.
// Format suggestions are derived on the fly rather than stored, so this log is
// the only record that a human has already ruled on them.
function recordFormatDecision(sheetName, sourceRow, newValue, status) {
  const existing = readHelperTab(SHEET_FORMAT_DECISIONS).filter(function (r) {
    return r.SheetName === sheetName && Number(r.SourceRow) === Number(sourceRow);
  })[0];
  if (existing) {
    setHelperCell(SHEET_FORMAT_DECISIONS, existing.rowNumber, 'Status', status);
    setHelperCell(SHEET_FORMAT_DECISIONS, existing.rowNumber, 'DecidedAt', new Date());
    return;
  }
  appendRow(SHEET_FORMAT_DECISIONS, [sheetName, sourceRow, newValue, status, new Date()]);
}

function decidedFormatKeys() {
  const set = {};
  readHelperTab(SHEET_FORMAT_DECISIONS).forEach(function (r) {
    set[r.SheetName + ':' + r.SourceRow] = true;
  });
  return set;
}

function pendingFormatTypos() {
  const decided = decidedFormatKeys();
  return detectFormatTypos().filter(function (s) {
    return !decided[s.sheetName + ':' + s.sourceRow];
  });
}
