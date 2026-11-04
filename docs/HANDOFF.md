# HLEP DPR Web-app – session handoff (as of w1.1, 05/11/2026)

Build session: https://claude.ai/code/session_013Z1t4uvdrdQSVrZNFCMGRj
Repo: https://github.com/aizuddinreborn/hlep-dpr-webapp (public) · App: https://aizuddinreborn.github.io/HLEP-DPR-WebApp/ (Pages publishes the `main` branch root; the root `index.html` redirects to `app/`, so the app's real address is …/HLEP-DPR-WebApp/app/. Do not add a GitHub Actions Pages workflow: two deployments race and the one that finishes last wins, which caused a 404 on /app/.)

## Prompt to start the next session

```
Continue building my "HLEP DPR Web-app" (pastel mobile PWA on GitHub Pages + its own Apps Script backend), which works alongside my Telegram "HLEP DPR Bot". The web-app is w1.1; the bot is v1.4 and must never be changed by web-app work.

Before anything else:
1. Attach the repo aizuddinreborn/hlep-dpr-webapp and read docs/HANDOFF.md and README.md.
2. Read these Project docs: "claude/HLEP DPR Bot v1.4 - Code.gs" (save it to /home/claude/hlep-dpr-bot/Code.gs) and "claude/HLEP DPR Bot - dev harness bundle.txt" (unpack it as the bot handoff explains).
3. Run `npm install && npm test` in the repo. It should end with "All 100 web checks passed".

How I work with you:
- Interview me first. Ask about the goal, any missing context and the output format before building.
- The app's screens are in Bahasa Malaysia. Report lines, WhatsApp text and PDF stay in English.
- Never edit the bot's Code.gs for web-app work. Never store my passwords or PINs anywhere.

My next request: <write it here>
```

## Where things stand

- **Delivered:** the app (`app/`), the backend source (`backend/src/web.gs`), the build script, 93 tests, and a 9:16 BM how-to video.
  - `WebApp.gs` is built from web.gs plus the bot's v1.4 functions. It is not in the repo; it was sent to the user as a file.
- **The user still needs to:**
  - create and deploy the backend (README "One-time setup"),
  - put the `/exec` URL in `app/config.js`,
  - type PINs in the `WebUsers` tab.
- **Not tested by Claude:** real Google Apps Script, Sheets, Drive and Telegram. Everything was checked in the simulator: the bot's harness mocks plus a second context for the web backend.

## Decisions (keep them)

- **Data:** use the bot's own Sheet and Drive. The backend is a separate Apps Script project, and the bot's code is never edited.
- **Shared logic:** `backend/build.js` copies 92 bot names unchanged into `WebApp.gs`, starting from `ROOTS` and following their dependencies.
  - The Telegram functions are stubbed in web.gs (`send_`, `edit_`, `tg_`).
  - Rebuild `WebApp.gs` whenever the bot changes, then run the tests.
- **The bot's code stays private:** it is never committed to the public repo, and `backend/dist/` is git-ignored.
- **Entries:**
  - Saved with `source = web`.
  - `media_group = web:<client id>` makes saves idempotent, so an offline re-send is never saved twice.
  - `backdated = Y` when the date is in the past.
  - Photo file names follow the bot's pattern, saved in `Photos/yyyy-mm/yyyy-mm-dd`.
- **Permissions match the bot:**
  - Technicians edit and delete their own lines; engineers edit all.
  - Anyone can create a new system, set the weather or update manpower.
  - Engineer only: %, plans, materials, WhatsApp text, weekly PDF, headline and settings.
- **PDF:**
  - The backend posts `/report dd/mm/yyyy` (or `/weekly`) to the bot's webhook. It uses `BOT_WEBAPP_URL` + `BOT_WEBHOOK_SECRET`, and the `update_id` is the string `web…`.
  - The bot builds the PDF and sends it to that person's Telegram. The app then polls `ReportLog` and downloads the file through the backend.
  - The AI headline is decided in the web-app first (Headlines tab), so the bot does not ask again.
- **WhatsApp text:** the bot's `buildWA_`, run in the backend. Tests prove it is identical to the bot's `/today` output.
- **Login:**
  - Tab `WebUsers` (`user_id, name, role, new_pin, pin_set, active, last_login, added_at, note`).
  - Approved Telegram users are copied in automatically with the same user_id. People without Telegram get `W12345`-style ids.
  - A PIN typed in `new_pin` is hashed (SHA-256 with the salt `WEB_SALT`) into the web project's Script property `wp_<uid>`, and the cell is cleared.
  - Sessions are `wt_<token>` properties: 30 days, sliding. They end when the PIN changes or `active = N`.
  - 5 wrong PINs lock that person out for 15 minutes.
- **Photos:**
  - Shrunk on the phone to a 1600 px longest side, JPEG at 0.82 quality.
  - An activity may hold up to 20 photos (the bot's MAX_PHOTOS), and the app shows them all (w1.1).
  - Only the PDF is limited: the bot's `PHOTOS_PER_ACTIVITY` setting (0–9). Engineers change it in Saya → Tetapan laporan → 📷 Had gambar dalam PDF. The bot picks up the change within 5 minutes (settings cache).
  - Thumbnails only for files inside the bot's Photos folder.
- **Offline:** IndexedDB outbox. Each photo is uploaded on its own, then the entry is saved. Duplicate questions are shown when the sync finishes.

## Rebuild the workspace

1. Clone the repo, then `npm install`.
2. Put the bot's Code.gs at `/home/claude/hlep-dpr-bot/Code.gs`, or set `BOT_CODE`.
3. Unpack the bot's harness bundle and set `HARNESS=<root>/harness`. The default path in `backend/test/world.js` is the build session's scratchpad.
   - The bot's own `run.js` needs three old-version files (`Code_v0.1.gs`, `Code_v0.4.gs`, `Code_v0.6.1.gs`) that are not in the bundle. Wrap those three upgrade tests in an `fs.existsSync` skip; the other 531 checks pass.
4. `npm test` runs 100 web checks.
5. `npm run dev` starts a preview on :8080 with a demo day. Every demo user's PIN is 1234.
   - `node tools/shots.js` walks the whole UI (phone) and reports console errors.
   - `node tools/laptop.js` takes laptop screenshots.
6. **Video:**
   1. Start the preview.
   2. `node tools/video-shots.js` captures the 2× app screens and the tap targets.
   3. `node tools/video/render.js --stills 8,38` checks single frames.
   4. `node tools/video/render.js` renders the frames.
   5. `python3 tools/video/music.py music.wav 80 "<tap times>"` makes the music.
   6. ffmpeg muxes the frames and the music.
   - Fonts come from `tools/.cache/fonts`: `npm i @fontsource/plus-jakarta-sans` there.

## Code map

- **app/app.js:**
  - API client `api()`, outbox `queueEntry`/`syncOutbox`
  - views `viewHome`/`viewData`/`viewReport`/`viewMe`
  - sheets `addSheet`, `editSheet`, `weatherSheet`, `manpowerSheet`, `pctSheet`, `planSheet`, `matSheet`, `pdfFlow`, `waGen`, `settingsList`, `pinSheet`
- **backend/src/web.gs:**
  - `WEB_ACTIONS` table: name → [login?, engineer only?, handler]
  - `setup()`, `webUsersSync_`, `webAuth_`
  - `apiSave_` and `webDup_` (the bot's dupCheck_ rule, returning instead of messaging)
  - `apiReport_` (the bot webhook call)
