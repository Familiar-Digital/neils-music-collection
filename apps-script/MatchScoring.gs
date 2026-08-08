function normalizeForCompare(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(new RegExp('[̀-ͯ]', 'g'), '') // strip accents (combining diacritics)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function classifyMatch(score) {
  if (score >= MATCH_STRONG_THRESHOLD) return 'Enriched';
  if (score >= MATCH_REVIEW_THRESHOLD) return 'NeedsReview';
  return 'NotFound';
}

// Neil files bands without a leading article — "Beatles", "Animals", "Rolling
// Stones" — so they sort under B, A and R rather than all under T. That is the
// same deliberate cataloguing choice as his surname-first artists, and there are
// dozens of them; proposing "The Beatles" on every one would bury the real
// suggestions. Compare with the article removed.
function withoutLeadingArticle(value) {
  return normalizeForCompare(value).replace(/^(the|a|an) /, '');
}

// A name differing only in word order or spacing is his filing convention too
// ("Bowie    David" vs "David Bowie"), not a misspelling.
function sameWordsRegardlessOfOrder(a, b) {
  const words = function (s) { return withoutLeadingArticle(s).split(' ').filter(Boolean).sort().join(' '); };
  return words(a) === words(b);
}

// Only suggest a spelling fix when we're confident in the match AND the strings
// genuinely differ in a way that isn't just how Neil chooses to file things.
function spellingSuggestionFrom(score, currentValue, canonicalValue) {
  if (score < MATCH_REVIEW_THRESHOLD) return null;
  if (normalizeForCompare(currentValue) === normalizeForCompare(canonicalValue)) return null;
  if (withoutLeadingArticle(currentValue) === withoutLeadingArticle(canonicalValue)) return null;
  if (sameWordsRegardlessOfOrder(currentValue, canonicalValue)) return null;
  return canonicalValue;
}

// Very small fuzzy-match helper for gap analysis (Levenshtein-based token-sort-ish ratio).
// Good enough at this scale — not trying to reimplement a full fuzzy-matching library.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function similarityRatio(a, b) {
  const na = normalizeForCompare(a), nb = normalizeForCompare(b);
  if (!na && !nb) return 100;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(na, nb) / maxLen) * 100);
}

// Strips common reissue/edition qualifiers so "Album (Deluxe Edition)" ~= "Album".
function baseAlbumTitle(title) {
  return normalizeForCompare(title)
    .replace(/\b(deluxe|remaster(ed)?|anniversary|live|reissue|edition|bonus tracks?|expanded)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyOwned(candidateTitle, ownedTitles) {
  const candidateBase = baseAlbumTitle(candidateTitle);
  return ownedTitles.some(function (owned) {
    return similarityRatio(candidateBase, baseAlbumTitle(owned)) >= GAP_MATCH_THRESHOLD;
  });
}
