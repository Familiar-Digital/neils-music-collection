// Checks whether Cover Art Archive actually has a front cover, without downloading it.
//
// Two Apps Script gotchas are baked in here, both confirmed by testing:
//   1. UrlFetchApp rejects `method: 'head'` outright ("invalid value: method"),
//      so HEAD is not an option however tempting it looks.
//   2. Cover Art Archive answers a valid request with a 307 to archive.org. Using
//      followRedirects:false means we get that 307 back cheaply, without pulling
//      the image bytes — so a 3xx is the success signal, and 404 means no art.
function caaUrlExists(url) {
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false });
    const code = response.getResponseCode();
    return code === 200 || (code >= 300 && code < 400);
  } catch (err) {
    Logger.log('Cover art check failed for ' + url + ': ' + err.message);
    return false;
  }
}

// Prefer the release-GROUP cover: it's the album's canonical art and exists even when
// the specific release we picked for the tracklist has no image of its own.
// Falls back to the release-level cover.
function caaGetFrontCoverUrl(releaseGroupId, releaseId) {
  if (releaseGroupId) {
    const groupUrl = 'https://coverartarchive.org/release-group/' + releaseGroupId + '/front-500';
    if (caaUrlExists(groupUrl)) return groupUrl;
  }
  if (releaseId) {
    const releaseUrl = 'https://coverartarchive.org/release/' + releaseId + '/front-500';
    if (caaUrlExists(releaseUrl)) return releaseUrl;
  }
  return null;
}
