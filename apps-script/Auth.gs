// Convenience-level protection for write actions, not real per-user auth.
// Set the token once: Apps Script editor → Project Settings → Script Properties → WRITE_TOKEN.
function checkWriteToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN');
  if (!expected) {
    throw new Error('No WRITE_TOKEN configured. Set one in Script Properties before allowing writes.');
  }
  if (token !== expected) {
    throw new Error('Invalid write token.');
  }
}
