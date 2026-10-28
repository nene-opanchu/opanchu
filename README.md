# Opanchu

An offline table app for iPhone. You set up your own columns, then fill in each cell with text or a tick box. It has no server and no online database: everything is stored on the phone in the browser's IndexedDB. The internet is only needed once, to open the site and add it to the home screen.

## Using the table

- **Year picker** (next to the title) switches between years 2014–2030. Each year has its own table. A year you haven't used yet starts with the same column headers as the year you came from, with empty rows. The range is set by `FIRST_YEAR` / `LAST_YEAR` in `app.js`.
- **+ Row** / **+ Column** (bottom bar) add a row or column at the end.
- **Tap a column header** to rename it, set its type, move it left or right, or delete it. Types:
  - **Text** — free text.
  - **Tick box** — a plain tick box.
  - **Grey-out** — a tick box that, when ticked, greys out and locks every cell to its right in that row. Whatever was in those cells is kept and comes back when it's unticked.

  Switching between Text and either tick-box type clears that column's cells, after asking first. Switching between Tick box and Grey-out keeps the ticks.
- **Tap a row number** to move the row, insert a row below it, or delete it.
- Tap a cell to type. Text stays on one line and the column gets wider as you type. Press Enter (return) to start a new line. Tick-box cells toggle on tap.
- Changes save automatically.

Plain HTML/CSS/JS with no build step, so it can be hosted as-is on GitHub Pages or Netlify.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup and iPhone home-screen tags |
| `app.js` | Table editor, column/row dialogs, autosave, Back up / Restore |
| `db.js` | IndexedDB helpers: `get`, `put` |
| `sw.js` | Service worker that caches every file so the app opens offline |
| `manifest.webmanifest` | App name, icon and standalone display mode |
| `icons/` | Home-screen icons (iOS requires PNG) |

## Run locally

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. Service workers only run on `localhost` or HTTPS, so to test on the iPhone itself, use the deployed URL rather than your PC's LAN IP.

## Deploy

**GitHub Pages:** push this folder to a GitHub repo, then go to Settings → Pages → Deploy from branch → `main` / root. The site appears at `https://<user>.github.io/<repo>/`. All paths are relative, so serving from a sub-folder works.

**Netlify:** drag this folder onto <https://app.netlify.com/drop>, or connect the repo with no build command and publish directory `.`.

**After changing any file, bump `CACHE` in `sw.js`** (for example `opanchu-v1` to `opanchu-v2`). Otherwise phones keep serving the old cached copy. The update downloads in the background the next time the app opens with a connection, and appears on the launch after that.

## Install on iPhone

1. Open the site in **Safari**.
2. Tap Share → **Add to Home Screen**.
3. Open the app from the home screen once while online. After that it works in airplane mode.

## Things to know about iPhone storage

- **The home-screen app and the Safari tab have separate storage.** Data entered in the Safari tab does not appear in the installed app. Always use the home-screen icon.
- **Removing the app from the home screen deletes its data.** Use **Back up** (Share sheet → Save to Files) and **Restore** to keep copies or move to a new phone.
- **Pushing new code does not touch saved data.** Data is lost only by removing the app from the home screen, clearing website data in iOS Settings, or changing the site's address (renaming the repo or the GitHub account). An update appears after the app has been fully closed and reopened twice: the first launch downloads it in the background.
- The app asks iOS for persistent storage, so its data is not cleared automatically while you keep using it. Backups are still the only safety net.
- Data never leaves the phone unless you export a backup yourself.
