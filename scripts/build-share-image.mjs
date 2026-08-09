#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Builds the link-preview image: a mosaic of real covers from the collection.
   ---------------------------------------------------------------------------
   Run again whenever the collection has grown enough to be worth refreshing:

     node scripts/build-share-image.mjs --token <READ_TOKEN>

   Why a static file rather than a random cover per share: a dynamic endpoint
   was tried and abandoned. Apps Script can return HTML or text but never an
   image or a real HTTP redirect, so crawlers asking for og:image received a
   web page and rendered no preview at all. Even had it worked, WhatsApp,
   iMessage and Slack cache previews per link, so "random" would have frozen on
   whichever cover was fetched first.

   Needs Python with Pillow, which does the image work:
     pip3 install Pillow
--------------------------------------------------------------------------- */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

const token = arg('token') || process.env.MUSIC_DB_TOKEN;
if (!token) {
  process.stderr.write('Missing --token (the collection password).\n');
  process.exit(1);
}

const url = (function () {
  const src = fs.readFileSync(path.join(ROOT, 'frontend', 'config.js'), 'utf8');
  const m = src.match(/WEB_APP_URL:\s*'([^']+)'/);
  if (!m) throw new Error('Could not read WEB_APP_URL from frontend/config.js');
  return m[1];
})();

const python = `
import json, urllib.request, random, io, sys
from PIL import Image

url, token, out = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request(f"{url}?action=getAlbums&token={token}",
                             headers={'User-Agent': 'NeilsMusicDatabase/1.0'})
covers = [a for a in json.load(urllib.request.urlopen(req, timeout=90)) if a.get('coverArtUrl')]
if not covers:
    sys.exit('No artwork in the collection yet.')

# 1200x630 is the size link previews expect. Cells are 150x158 so sleeves are
# cropped a few pixels vertically rather than squashed out of square.
W, H, COLS, ROWS = 1200, 630, 8, 4
cw, ch = W // COLS, H // ROWS + 1
random.seed(20260809)                      # same covers each run unless changed
picks = random.sample(covers, min(COLS * ROWS, len(covers)))

canvas = Image.new('RGB', (W, H), (10, 10, 10))
placed = 0
for i, a in enumerate(picks):
    try:
        r = urllib.request.Request(a['coverArtUrl'], headers={'User-Agent': 'NeilsMusicDatabase/1.0'})
        img = Image.open(io.BytesIO(urllib.request.urlopen(r, timeout=25).read())).convert('RGB')
        scale = max(cw / img.width, ch / img.height)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
        left, top = (img.width - cw) // 2, (img.height - ch) // 2
        canvas.paste(img.crop((left, top, left + cw, top + ch)), ((i % COLS) * cw, (i // COLS) * ch))
        placed += 1
    except Exception:
        pass                               # a cover that won't load just leaves its cell dark

canvas.save(out, 'JPEG', quality=82, optimize=True)
print(f"placed {placed} covers -> {out}")
`;

const out = path.join(ROOT, 'frontend', 'share-image.jpg');
const result = spawnSync('python3', ['-c', python, url, token, out], { stdio: 'inherit' });
process.exit(result.status ?? 1);
