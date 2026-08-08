/* ---------------------------------------------------------------------------
   Access control
   ---------------------------------------------------------------------------
   Two shared secrets, both stored as Script Properties:

     READ_TOKEN   the family password. Needed to see anything at all, so the
                  site can sit on a public URL and still show nothing to a
                  passer-by. Shared freely with family.
     WRITE_TOKEN  needed to change anything. Held by Neil and Rich only.

   A write token implies read access, so nobody needs to carry both.

   This is deliberately a shared password rather than per-person accounts: it
   needs no Google account, nothing to administer, and suits a family record
   collection. The trade-off is real and worth stating — one leaked password
   means rotating it for everyone, and there is no way to revoke a single
   person. If that ever matters, the app would need to move behind Google
   sign-in with an email allowlist.
--------------------------------------------------------------------------- */

function getProperty(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/* Compares in constant time. At this scale a timing attack is far-fetched —
   the token is 20 hex characters over a rate-limited HTTPS endpoint — but a
   naive === leaks length and prefix, and this costs nothing. */
function secretsMatch(supplied, expected) {
  if (!expected) return false;
  const a = String(supplied || '');
  const b = String(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hasReadAccess(token) {
  const read = getProperty('READ_TOKEN');
  // No read token configured means the collection is open — the previous
  // behaviour, kept so an existing deployment doesn't lock everyone out on upgrade.
  if (!read) return true;
  return secretsMatch(token, read) || secretsMatch(token, getProperty('WRITE_TOKEN'));
}

function requireReadAccess(token) {
  if (!hasReadAccess(token)) throw new Error('Enter the collection password to continue.');
}

function checkWriteToken(token) {
  const expected = getProperty('WRITE_TOKEN');
  if (!expected) {
    throw new Error('No WRITE_TOKEN configured. Set one in Script Properties before allowing writes.');
  }
  if (!secretsMatch(token, expected)) {
    throw new Error('That password does not allow changes.');
  }
}

/* Lets the app tell "wrong password" from "right password, no edit rights"
   without handing back any collection data. */
function checkAccess(params) {
  const token = params.token;
  return {
    read: hasReadAccess(token),
    write: secretsMatch(token, getProperty('WRITE_TOKEN')),
    passwordRequired: !!getProperty('READ_TOKEN')
  };
}
