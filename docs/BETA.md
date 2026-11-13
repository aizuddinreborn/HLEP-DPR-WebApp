# HLEP DPR Beta (2.0): try upgrades without touching the live app

The beta is a second copy of the web-app with its own backend and its own copy of the data.
The team keeps using the live app; nothing you do in the beta reaches the real Sheet, the real photos or the Telegram bot.

| | Live app | Beta |
|---|---|---|
| Web pages | `app/` | `beta/` |
| Backend (Apps Script project) | the existing one (w1.4.1) | a **new** project (w2.0-b1) |
| Google Sheet | the bot's real Sheet | a private copy in Drive folder `HLEP DPR Beta (sandbox)` |
| Photos | real Photos folder | new photos go to the sandbox folder; real photos are shown, never changed |
| Jana PDF | via the bot | off (the bot only reads the real Sheet) |
| Storage on the phone | `hlep.*` | `hlepb.*` (separate login, outbox and cache) |

## What is new in the beta

- **Tanya DPR**: ask in plain words ("bila bahan terakhir tiba?", "apa yang belum siap?"). The answer cites the records it used; tap a number to open the record. It only reads; it cannot change anything.
- **Papan**: average progress, activities per day, what needs attention, progress history per system, team activity, arrivals.
- **Cari**: search every record in Malay or English, filter by unit, status, period, photos.
- **Activity detail**: photos, original note, who/when, the system's history, and Ubah / Sambung / Kongsi / Tanya.
- **Calendar** date picker that shows how many activities each day has.
- **Faster entry**: "Sambung kerja sebelum ini" cards, voice note to report line, system suggested from a photo, paste or drop photos, share photos into the app from the phone's gallery.
- **Dark mode**, a short tour, swipe left/right between days, pull down to refresh, home-screen shortcuts.

## Set up the beta backend (once, about 10 minutes)

1. Open <https://script.google.com> → **New project**. Name it `HLEP DPR Web Beta`.
2. Delete the sample code, paste the whole of `WebApp-beta.gs`, save.
3. **Project Settings → Script properties**, add:
   - `SHEET_URL` = the address of the real Google Sheet (it is only read, to make the copy)
   - `GEMINI_API_KEY` = the same key the bot uses
4. In the editor choose the function **`setupBeta`** → **Run**, and allow the permissions.
   The log must say `Mode: BETA sandbox – a private copy of the data`. If it says `STOP`, you are in the live project: do not continue there.
5. **Services (+)** → add **Google Sheets API** (faster loading, as in the live app).
6. **Deploy → New deployment → Web app**: Execute as **Me**, access **Anyone**. Copy the address ending in `/exec`.
7. Open the copy of the Sheet (the log prints its link) → tab **WebUsers** → type a PIN for each person in column `new_pin`. Beta PINs are separate from the live ones.

## Open the beta

Open the beta page once with the backend address added:

`<beta page address>?api=<the /exec address>`

The phone remembers it. To avoid typing it, put the address in `beta/config.js` (`api: '…'`).

## Refresh the copy

Saya → **Versi ujian (beta)** → **Salin semula data sebenar** (engineer). Or run `refreshBetaData` in the beta project.
What was added in the beta is not carried over; the old copy is kept in the sandbox folder with "(lama)" in its name.

## Later: Claude for Tanya DPR

Add `ANTHROPIC_API_KEY` to the beta project's Script properties. Tanya DPR then uses Claude; remove the key (or set `CHAT_PROVIDER` = `gemini`) to go back. `CLAUDE_CHAT_MODEL` changes the model. Limits: 30 questions an hour and 150 a day per person (`CHAT_LIMIT_DAY`).

## Promote the beta to the live app (when you are happy)

1. Paste `WebApp-beta.gs` into the **live** Apps Script project, run `setup`, then **Deploy → Manage deployments → Edit → New version** (same address).
2. Replace the files in `app/` with those in `beta/`, and in `app/config.js` remove `channel: 'beta'` and keep the live `api` address.
3. In `app/sw.js` rename the cache prefix to `hlep-dpr-` so phones pick up the new version.

Until then the live app and its backend stay exactly as they are.

## Try it on a computer without Google

```bash
npm install
node backend/build.js
node tools/beta-server.js 8090
```

Open <http://localhost:8090>, PIN 1234. It runs the real backend code against a simulated Sheet with three weeks of demo records; the assistant is a scripted stand-in that makes real lookups.
`node tools/beta-walk.js` walks through every screen in a browser (phone light, phone dark, laptop) and fails on any error.
