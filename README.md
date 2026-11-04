# HLEP DPR web-app

**App:** https://aizuddinreborn.github.io/HLEP-DPR-WebApp/ · **How-to video (BM):** [app/media/cara-guna.mp4](app/media/cara-guna.mp4)

A pastel, phone-first web-app for the HLEP – SJ Chenderoh electrical **Daily Progress Report**.
It works alongside the Telegram "HLEP DPR Bot" and writes into the same Google Sheet and Drive folders, so web-app entries appear in the bot's WhatsApp text and PDF automatically.

- **App** (`app/`): plain HTML/CSS/JS, no build step, hosted on GitHub Pages. It can be installed on the phone's home screen (PWA) and works without signal: entries wait on the phone and are sent when signal returns.
- **Backend** (`backend/`): a **separate** Apps Script project. It does not replace or edit the bot.
- **Language:** the screens are in Bahasa Malaysia. Report lines, the WhatsApp text and the PDF stay in English, written by the bot's own AI prompts.

## What each person can do

| | Technician | Engineer |
|---|---|---|
| Add an activity: up to 9 photos, unit, system, status, shift, short note. AI writes the English line | ✅ | ✅ |
| See the day's list. Edit any activity, add or delete its photos | ✅ | ✅ |
| Delete a whole activity | own lines | all lines |
| Duplicate warning after saving (same rule as the bot) | ✅ | ✅ |
| Create a new system, weather, manpower, add and edit Bahan tiba | ✅ | ✅ |
| Daily PDF (made by the bot, sent to their Telegram, also downloadable here) | ✅ if on Telegram | ✅ |
| Approve the AI headline, weekly PDF, WhatsApp text, % progress, tomorrow's plan, delete materials, PTW/PIC/time settings, PDF photo limit | – | ✅ |

## How it stays out of the bot's way

- The bot's `Code.gs` is never changed. `backend/build.js` copies the functions the web-app needs from the bot's `Code.gs` **unchanged**: Sheet rows, categories, `/semak` rules, the duplicate rule, AI prompts, the WhatsApp builder and headlines. They run inside the web backend's own project, with its own Script properties, cache and lock.
- Web entries are normal `Entries` rows with `source = web`. `media_group = web:<id>` stops an offline re-send from being saved twice.
- For **Jana PDF**, the backend posts `/report dd/mm/yyyy` (or `/weekly`) to the bot's own webhook, exactly as if that person had typed it in Telegram. The bot's report engine builds the PDF and sends it to their chat. The app then watches `ReportLog` and offers the download.
- Only one new tab is added: `WebUsers` (name, role, PIN status). PIN hashes are kept in the backend's Script properties, never in the Sheet.
- The bot's own code is **not** committed here, because this repo is public. `backend/dist/WebApp.gs` is built locally from the bot's `Code.gs` and is git-ignored.

## One-time setup (engineer, on a laptop)

1. **Build the backend file.** `node backend/build.js /path/to/Code.gs` writes `backend/dist/WebApp.gs`, or use the file Claude sent you.
2. **New Apps Script project.** Go to <https://script.google.com>, choose **New project** and name it "HLEP DPR Web-app". Paste all of `WebApp.gs` into `Code.gs`, then **Save**.
   Use the same Google account that owns the bot.
3. **Script properties.** In ⚙️ Project Settings → Script properties, add:
   | Property | Value |
   |---|---|
   | `SHEET_URL` | the bot's Google Sheet link |
   | `GEMINI_API_KEY` | same as the bot's (optional) |
   | `BOT_WEBAPP_URL` | the bot's Script property `WEBAPP_URL` |
   | `BOT_WEBHOOK_SECRET` | the bot's Script property `WEBHOOK_SECRET` |
4. **Run `setup`.** Select the function `setup` → **Run** → allow access. The log should say "✅ Web-app backend ready".
5. **Deploy.** Deploy → New deployment → Web app. Execute as: **Me** · Who has access: **Anyone**. Copy the `/exec` URL.
6. **Connect the app.** Put that URL in `app/config.js` (`api: '…/exec'`) and commit. GitHub Pages redeploys by itself.
   Or open the app once with `?api=<url>` added to its address.
7. **PINs.** In the Sheet, tab **WebUsers**, type a 4-digit PIN in `new_pin` for each person. Within a minute it disappears and `pin_set` shows `Y`.
   - Approved Telegram users are added automatically, with the same user_id, so `/semak` agrees on whose line it is.
   - For someone without Telegram, add a row with just their name and role (`tech` or `eng`).
   - To remove someone, set `active = N`.

**When the bot gets a new version:** rebuild `WebApp.gs` from the new `Code.gs`, run `npm test`, paste it into the web-app project, then Deploy → Manage deployments → Edit → New version.

## Develop

```bash
npm install
npm test           # builds WebApp.gs, then runs the web backend and the bot together (113 checks)
npm run dev        # local preview on http://localhost:8080 with a demo day (PIN 1234)
```

The tests and the preview need the bot's dev-harness mocks and the bot's `Code.gs`.
Set `HARNESS=/path/to/harness` and `BOT_CODE=/path/to/Code.gs`; see `backend/test/world.js`.
