# Neil's Music Database

A search/browse/enrichment web app for Neil's vinyl, CD, single, and DVD collection.
Google Sheets stays the one place the data actually lives — this app reads and writes
it via a Google Apps Script backend, and layers on search, filtering, auto-fetched
album art and track listings (MusicBrainz + Cover Art Archive), spelling-mistake
suggestions, and "missing opportunities" (studio albums by artists you already
collect that you don't own yet).

The short version of why it's built this way: no separate database, no service
account, no hosting bill. The backend is a script bound to the Spreadsheet itself,
running under your Google account.

## How it's laid out

```
apps-script/    Google Apps Script backend (clasp-managed), bound to the Sheet
frontend/       Static site — plain HTML/CSS/JS, no build step
.github/workflows/deploy-pages.yml   auto-publishes frontend/ to GitHub Pages on push
```

Neil's original tabs (`Albums`, `Singles`, `Various compilations`, `DVDs`, `Album
Details`, `Album Data`) are never restructured. Everything this app writes goes into
new tabs (`Enrichment_Albums`, `Enrichment_Singles`, `Tracklists`, `Gap_Suggestions`,
`Wishlist`, `Job_Log`), created automatically the first time the app runs. The one
exception is an *approved* spelling fix, which writes into the real cell it's
correcting — and only after someone clicks "Fix" in the Suggestions tab.

## One-time setup

Do this whole first pass against a **copy** of the spreadsheet, not the real one —
step 6 below is where you switch over once everything's checked.

### 1. Install `clasp` (Apps Script's CLI)

```bash
npm install -g @google/clasp
clasp login
```

This opens a Google OAuth screen in your browser — sign in with whichever account
should own the deployment (yours or Neil's; either works, both already have edit
access to the sheet).

### 2. Make a development copy of the spreadsheet

In Google Sheets, open Neil's spreadsheet → **File → Make a copy**. Work against
this copy until everything below is verified — nothing should touch the real
collection data until then.

### 3. Bind the Apps Script project to that copy

Open the **copy**, then **Extensions → Apps Script**. This creates an empty bound
script project. In the Apps Script editor: **Project Settings → Script ID** — copy
that ID, then locally:

```bash
cd apps-script
echo '{"scriptId":"PASTE_THE_SCRIPT_ID_HERE","rootDir":"."}' > .clasp.json
clasp push
```

This uploads all the `.gs` files in `apps-script/` into that project.

### 4. Set the write-access token

In the Apps Script editor: **Project Settings → Script Properties → Add script
property**. Key: `WRITE_TOKEN`, value: anything you like (a password, effectively) —
this is what gates the "Add New" form and the suggestion approve/reject buttons.
Convenience-level protection, not real per-user auth — fine for a low-stakes family
app, not something to reuse elsewhere.

### 5. Create the helper tabs and deploy the Web App

Still in the Apps Script editor: select the `runSetup` function from the dropdown
next to the Run button, and run it once (it'll ask you to authorize the script's
access to the spreadsheet and to make external requests — that's the Sheets access
and the MusicBrainz/Cover Art Archive calls). Check the copy's spreadsheet — you
should see the new tabs appear.

Then **Deploy → New deployment → Web app**:
- Execute as: **Me**
- Who has access: **Anyone with the link**

Copy the resulting Web App URL.

### 6. Point the frontend at it

Edit `frontend/config.js`:

```js
window.APP_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/.../exec' // the URL from step 5
};
```

Then serve the frontend locally to check it end-to-end:

```bash
cd frontend
python3 -m http.server 8080
```

Open `http://localhost:8080`, confirm Browse/search/filter work against the dev
copy, then try the Suggestions tab (empty until enrichment has run — see next) and
Add New (needs the write token from step 4, entered once in the "Write access
token" box — it's cached in the browser, not sent anywhere except this Web App).

### 7. Run the enrichment backlog

From the Apps Script editor, run `installEnrichmentTrigger` once (select it from the
function dropdown, click Run). This schedules `runEnrichmentBatch` every 15 minutes;
each run processes as much of the backlog as fits in Apps Script's ~6-minute
execution limit, checkpointed so nothing is lost between runs. Clearing the full
~950-album/single backlog takes roughly 7–9 runs — check the `Job_Log` tab to watch
progress (`ItemsProcessed`/`ErrorsCount` per run). Once it's caught up, new
albums/singles enrich immediately when added (no waiting for the next trigger).

Once the main backlog is clear, run `installGapAnalysisTrigger` once too — this
schedules the "missing opportunities" scan nightly at 3am.

Spot-check a few `Enrichment_Albums` rows against albums Neil already did by hand in
`Album Data` (the 10cc entries) to sanity-check the matching before trusting it more
broadly.

### 8. Cut over to the real spreadsheet

Once steps 3–7 look right on the copy:
1. Open the **real** spreadsheet → **Extensions → Apps Script** (creates a fresh
   bound project on the real file).
2. Repeat step 3 with the real project's Script ID (a separate `.clasp.json` — Apps
   Script projects are one-per-file, so this is a new deployment, not a move).
3. Repeat steps 4–7 against the real sheet.
4. Update `frontend/config.js` with the *real* deployment's Web App URL.

### 9. Publish the frontend

Push this repo to GitHub and enable Pages (**Settings → Pages → Source: GitHub
Actions**) — `.github/workflows/deploy-pages.yml` is already set up to publish
`frontend/` on every push to `main`. The Web App URL in `config.js` isn't a secret
(the same "anyone with the link" model already governs read access), so it's fine
committed — the actual access control (`WRITE_TOKEN`) never leaves the browser it's
typed into.

## Day-to-day use

- **Browse**: search/filter across Albums, Singles, Compilations, and DVDs. Click
  an album or single to see its art, metadata, and track listing.
- **Suggestions**: review spelling-fix candidates (from MusicBrainz match
  confidence) and "missing opportunities" (studio albums by artists you collect
  that you don't own) — nothing changes until you click Fix/Add, ever.
- **Add New**: adds straight into the real sheet, then enriches automatically.

Neil can keep editing the original sheet tabs by hand exactly as before — the app
just reads whatever's there.
