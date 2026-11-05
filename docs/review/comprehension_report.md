## What this proposes

The document tells an engineer to paste a new backend file, WebApp.gs w1.4, into the web-app's Apps Script project. They also add Google's "Google Sheets API" service and deploy it as a new version of the existing deployment, so the `/exec` address stays the same.

Five read-only actions then take a snapshot of the Sheet at the start of each request: the day view, the report list, the contractor list, one contractor tick list, and the PDF reading status.

- With the service on, the snapshot is one batched call for all the tabs the action needs.
- With the service off, or if the batched call fails, each tab is read once and kept for the rest of the request.
- Before this change, the same work took about 30 small calls, with Entries read 2 or 3 times.

Saves, edits and deletes do not change.

The phone app 1.4.0 already shipped separately and works with both the old and new backends. It:

- shows saved copies at once
- quietly pre-loads yesterday
- fetches the team list and the day together
- reuses the report list for 20 seconds
- keeps only 21 saved days

Rollback means picking the previous deployment version, or just removing the service.

## How the existing system works, per this document

There are two separate Apps Script projects that share one Google Sheet: a Telegram bot and a web-app backend. A phone app hosted on GitHub Pages calls the backend through an `/exec` URL.

The backend appears to include the bot's code. It reads the Sheet through the bot's `rows_` helper, one tab at a time: last row, width, header, values. One date change touches about 10 tabs, and Entries grows without limit. Categories and Settings have a 5-minute cache.

Before 1.4.0, the phone kept a copy of each day but used it only when offline. Apps Script adds 1–3 seconds per request (a redirect plus a cold start) that no code change can remove.

---

# Stage 6 – Comprehension Test

- **Target:** `docs/w1.4-before-after.md`. FeatureRange is lines 1–95; DetailedRange is lines 96–135.
- **Reviewer:** egm-comprehension. It read the document alone, with no other files and no document standard.
- **Result:** both sections could be paraphrased, so there are no Blockers. There are 5 Major and 7 Nit findings.

## Findings

### 1. 🟡 Major: how the web-app backend relates to the bot's code is never explained

**Lines:** 40, 42, 79, 84, 101, 104, 115

The feature section keeps referring to "the bot's `rows_` result", "the bot's own code", "bot code v1.4" and "the bot's simulator". It never says that the web-app backend is built from the bot's source plus a web layer (`web.gs`). A reader can only work this out from one line in §8, where `build.js` renames `rows_`.

That leaves these questions open:

- Why does the web-app contain bot code?
- Must the "bot v1.4" inside WebApp.gs match the live Telegram bot's version? §3.3 says the bot is untouched.
- What is "the bot's simulator" (line 79)?

Without this, the §3.1 row "Rows the rest of the code sees" and all of §4.3 are hard to follow.

### 2. 🟡 Major: step 2 assumes the reader already has WebApp.gs

**Lines:** 101, 115

"Paste all of the new `WebApp.gs`" never says where the file comes from. It gives no repo path, and does not say whether `backend/build.js` must be run first, with what command or to what output location. The main procedure is missing a setup step.

### 3. 🟡 Major: check 3 in §5 cannot give a valid "after" timing

**Line:** 85

The check says to time a date that was never opened "before pasting and again after". There are two problems:

- §5 comes after the steps, and §7 has no "time it now" step before step 2.
- Timing the date before pasting saves a copy of it on the phone. Under app 1.4.0 (line 24), the second visit then shows that saved copy at once. So the "after" timing measures the saved copy, not the backend.

To fix this, the check should either use two different dates that were never opened (or a second phone), or time until the "Mengemas kini…" pill clears.

### 4. 🟡 Major: two pre-load windows are not reconciled

**Lines:** 25, 61, 121

These are three different mechanisms with two different time windows (1 minute and 3 minutes):

- Line 25: yesterday shows at once "if fetched in the last 3 minutes".
- Line 61: "requests seen in the last minute are not repeated".
- Line 121: a request may share "a request already in flight".

The document does not explain how they combine. A reader cannot tell when yesterday is fetched again, or how many requests a typical browse sends. The risks in §4.1 and §4.2 depend on that count.

### 5. 🟡 Major: what `rows_` does inside a read-only action is ambiguous

**Lines:** 117–118

Line 117 says `webSnapStart_` does one `batchGet`. Line 118 then says that inside a read-only action, `rows_` does "one `getDataRange().getValues()` per tab", without mentioning the snapshot. As written, per-tab reads always happen, which contradicts the "one call" claim in §3.1.

Presumably `rows_` uses the batchGet snapshot when it holds the tab, and otherwise reads the tab once and keeps it. The document should say so.

It also does not state:

- that `WEB_READS` is the five actions on line 42
- what `WEB_SNAP_TABS` contains
- why WebUsers and Users are excluded (neither tab is mentioned anywhere else)

### 6. 🟢 Nit: the test claim seems to contradict the stated exception

**Lines:** 72 and 75 (also 130)

§4.3 says a date typed by hand into a non-date column reads differently with the service on. Line 75 then says a date and time typed by hand in Entries give identical results. Naming the column used in the test (presumably a date column or one ending in `_at`) would clear up the apparent contradiction.

### 7. 🟢 Nit: the "ends in `at`" rule is imprecise

**Line:** 70

All the examples end in `_at`, but the rule as written also matches names like `format` or `seat`. The document should say whether the suffix is `at` or `_at`.

### 8. 🟢 Nit: "Read-only requests" is defined but never used as a term

**Line:** 42

The phrase appears in quotes as if it were already in use, but nothing uses it. Its job seems to be to limit the §3.1 table to five actions, and the text does not say so. "Contractor tick list" and "PDF reading status" are project features named without a definition.

### 9. 🟢 Nit: Malay screen terms are not explained

These terms are not explained:

- "Mengemas kini…"
- the Laporan tab
- the "Laporan kontraktor" card
- Saya
- `/semak`

Most can be guessed from context. "Saya shows …" (line 84) cannot: a reader would not know Saya is a tab in the app.

### 10. 🟢 Nit: three version schemes are used without a key

The backend uses w1.x, the app 1.x and the bot v1.x. The "w" prefix is never explained. Backend w1.4 and bot v1.4 share a number, which looks meaningful but may not be. This ties into finding 1.

### 11. 🟢 Nit: the read-limit risk cannot be judged

**Line:** 65

The limit is about 60 reads per minute for the whole team, but the document never gives the team size. It also never says that pre-loading makes each date change two day-view reads, not one.

### 12. 🟢 Nit: smaller undefined items

- "Local preview" (line 30) is only partly explained, on line 134.
- The document does not say what `setup` does besides logging (line 59).
- "Newest 21 days" (line 28) could mean the 21 latest calendar dates or the 21 most recently opened.
- Step 7 asks the team to close and reopen the app, although app 1.4.0 is already live and the backend change does not affect it.
