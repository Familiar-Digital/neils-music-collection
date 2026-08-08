// Cover Art Archive URLs are simple and stable — just confirm one actually exists before
// storing it, since not every release has art uploaded.
function caaGetFrontCoverUrl(releaseId) {
  const url = 'https://coverartarchive.org/release/' + releaseId + '/front-500';
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  return response.getResponseCode() === 200 ? url : null;
}
