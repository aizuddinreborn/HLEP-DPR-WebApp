# HLEP DPR 2.0 beta – build plan (working notes)

Started 12/11/2026. This file is the plan a later session needs to continue the build. Status is in the task list and at the end of this file.

## What the user asked for (12/11/2026)

1. A place to try upgrades without touching the live app that the team uses.
2. A big upgrade: more user-friendly, current web technology, more impressive, "whatever an app should have".
3. A chat bot inside the app that answers questions about the work: progress, when an item arrived, when an activity was completed, and similar.

## Decisions from the interview (keep them)

| Question | Answer |
|---|---|
| Beta data | **A copy of the data (sandbox).** Own copy of the Sheet and own Drive folder; the real Sheet, photos and reports never change. Refresh the copy with one click. "Jana PDF" is off in beta. |
| Chat AI | **Gemini, with the existing key.** Built so Claude can be switched on later by adding `ANTHROPIC_API_KEY`. |
| Redesign | **Redesign freely** (beta only), with an in-app tour. |
| Priorities besides chat | Faster to add activities · progress at a glance (dashboard) · find old records fast (search). "End-of-day report checks" was not picked. |

Defaults I set (the user can change them): the chat only answers, it cannot change records; everyone may use it and engineers can restrict it to engineers; it replies in the language of the question.

## Architecture

- **One WebApp.gs for live and beta.** Mode comes from Script properties. New actions are additive, so the live app 1.4.0 keeps working with it.
- **Beta backend = a second Apps Script project** with `SHEET_URL` (the real Sheet, read only once to copy) and `GEMINI_API_KEY`. The engineer runs `setupBeta` instead of `setup`.
- **Beta app = `beta/` folder** in this repo → `https://aizuddinreborn.github.io/HLEP-DPR-WebApp/beta/`. `app/` is not modified by beta work.
  - Same origin as the live app, so storage is separated by channel: localStorage prefix `hlepb.`, IndexedDB `hlep-dpr-beta`, cache `hlep-beta-…`, its own service-worker scope and manifest id.
  - `beta/config.js`: `self.HLEP_CONFIG = { api: '<beta /exec>', channel: 'beta' }`.
- **Promotion to live** (`tools/promote.js`): copies `beta/` code into `app/` (keeps `app/config.js`, manifest and icons), and the engineer pastes the same WebApp.gs into the live project → Manage deployments → New version.

## Sandbox rules (backend, `SANDBOX=Y`)

- `setupBeta()` creates folder "HLEP DPR Beta (sandbox)" with `Photos`, `Reports`, `Contractor Reports`, creates a **new** spreadsheet and copies every tab into it with `sheet.copyTo` (so the bot's bound script is not copied). `Log` is copied as a header only. `WebUsers` keeps names/roles/ids but PIN flags are cleared (PIN hashes live in the other project).
- Properties set: `SANDBOX`, `SOURCE_SHEET_ID`, `SHEET_ID` (the copy), `ROOT_FOLDER_ID`, `PHOTO_FOLDER_ID`, `REPORT_FOLDER_ID`, `PHOTO_READ_FOLDER_ID` (the real Photos folder: thumbnails only), `SANDBOX_AT`.
- `setup()` in sandbox mode uses `SHEET_ID` and ignores `SHEET_URL`.
- Never changes real Drive files: photo delete and activity delete trash a file only when it is inside the sandbox `Photos` folder (`webPhotoFile_(id, true)`; `removeEntry_(…, false)` + own trash).
- `report` (bot PDF) is refused in sandbox. A request fails if `SHEET_ID === SOURCE_SHEET_ID`.
- `betaRefresh` action (engineer) and `refreshBetaData()` make a fresh copy, keep the `WebUsers` tab of the previous copy, and rename the old copy "(lama …)". Nothing is deleted.

## New backend actions (all read-only, in `WEB_READS`)

| Action | Purpose |
|---|---|
| `chat` | Tanya DPR. Context pack + tools, provider adapter (Gemini / Claude), per-request citation refs, rate limits, access pref. |
| `insights` | Dashboard: KPIs with previous-period deltas, per-day counts, progress history per system, team, attention list, materials, manpower. |
| `search` | Activities and materials by words (BM/EN glossary), unit, system, status, shift, dates, person, source, has photos; paging. |
| `cal` | Activity counts per day for a month (calendar dots). |
| `day.carry` | In the `day` reply: ongoing (IP) lines from the last working day of each system, for "Sambung". |
| `voice` | (write-free) audio → the bot's `transcribe_` → transcript + English line. |
| `guess` | (write-free) uploaded photo → the bot's `guess_` → suggested system + line. |
| `prefs`, `prefSet` | Web-only preferences in Script properties (`wpref_*`), e.g. `CHAT_ACCESS = all | eng`. |

### Chat design

- Neutral tools: `cari_aktiviti`, `status_semasa`, `ringkasan_hari`, `bahan_tiba`, `kemajuan`, `rancangan`, `tenaga_kerja`, `statistik`.
- Every record given to the model carries a short ref (`A12`, `M3`). The model cites `[A12]`; the reply returns the cited records so the app shows tappable source chips.
- Context pack in the system prompt: today, user, systems with %, latest lines per system, today's and yesterday's lines, tomorrow's plans, last arrivals, manpower, weather, PTW, PIC. Most questions need no tool call.
- Loop: at most 5 model calls and about 50 s. Tool errors go back to the model as `{error}`.
- Gemini: `generateContent` with `tools.functionDeclarations`; the model's `content` is echoed back unchanged (thought signatures). Model order: `GEMINI_CHAT_MODEL` or `gemini-flash-latest`, then the bot's default. Retry without `thinkingConfig` on a 400 that mentions thinking.
- Claude: Messages API with tools when `ANTHROPIC_API_KEY` is set and `CHAT_PROVIDER` is not `gemini`.
- Limits: per person 30 questions an hour and 150 a day (cache counters; `CHAT_LIMIT_DAY` overrides).

## Beta app (frontend)

- ES modules, no build step. `beta/js/`: `core` (utils, icons, state, storage, api, UI primitives), `sync` (outbox, day/meta loading), `shell` (boot, login, navigation, date bar, calendar), `day` (Aktiviti / Data / Laporan segments and their sheets), `contractor`, `chat`, `board`, `search`, `me`, `tour`, `charts`.
- `tools/lint-free.js` checks every module for undeclared names (acorn).
- Navigation: **Hari ini** (segments Aktiviti · Data · Laporan) · **Papan** · **+** · **Tanya** · **Saya**; search icon in the top bar.
- Design tokens with light and dark themes (auto + manual), View Transitions where supported, haptics, swipe between days, pull to refresh.
- Faster entry: "Sambung" cards from `day.carry`, voice note → AI line, "cadang dari gambar", Android share target, paste and drag-drop on laptop, Web Share for WhatsApp text and PDF.
- Service worker: precache, stale-while-revalidate for app files, "versi baru" prompt.

## Order of work

1. Backend: sandbox → search/insights/cal/carry → chat → voice/guess (tests in `backend/test/beta_test.js`).
2. `beta/` foundation (modules, shell, tokens, themes), then chat, dashboard, search/detail/calendar, faster entry, polish.
3. Preview server with a scripted fake AI, Playwright walk-through, docs (`docs/BETA.md`), `tools/promote.js`, deliver WebApp.gs.

## Status log

- 12/11/2026: plan written; interview answers recorded. Nothing built yet.
