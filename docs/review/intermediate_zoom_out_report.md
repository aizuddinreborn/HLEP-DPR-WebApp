# Stage 8 – Intermediate Zoom Out Review

- **Target:** `docs/w1.4-before-after.md`, full file (lines 1–135). The file has not changed since Stages 5–7.
- **Reviewer:** egm-zoom-out, running in a fresh context with the zoom-out standard.
- **Inputs:**
  - The Stage 5, 6 and 7 reports.
  - `deliverables/WebApp.gs` (lines 1–380 and 2320–2644, plus searches).
- **Not checked:**
  - Fit with the wider project, because no README or context file was supplied.
  - The time windows in `app/app.js`, because that file was not supplied.

## Verdict

**The document does not pass as written: 1 Blocker, 4 Major, 3 Nit.**

The earlier reports, taken together, would roughly double the length of the document and add new code. About half of what they ask for exists only because of the optional Sheets API path. Deferring that path is the simplest way to clear the Blocker and most of the Major findings.

---

## 1. 🔴 Blocker: §7 step 3 switches on a known defect. Defer step 3 rather than adding mitigations.

**Scope:** status line (line 3), §7 step 3, §5 check 1, §4.2 first bullet, all of §4.3, and the first bullet of §6.

The reviewer confirmed the Stage 7 defect design-1-M1. With the service on, during a `day` or `reports` request:

1. `settings_()` reads Settings from the API snapshot.
2. `webCell_` leaves a hand-typed time in `value` as a number.
3. `settings_()` then caches that number as text for 300 seconds, for every action.

Step 3 tells the engineer to switch the service on.

With the service **off**, w1.4 already does most of the work:

- one `getDataRange()` per tab;
- Entries read once;
- about 30 Sheet calls cut to about 10;
- the bot's own date decoding.

Going from about 10 calls to 1 has not been measured, yet the API path alone brings in all of the following:

- the code defect above;
- a permission prompt;
- a read limit shared by the whole team, with a fallback that is slower than having no service at all;
- §4.3 and its exceptions;
- a second date decoder;
- about 15 of the earlier asks (Stage 5 #1 and part of #5; Stage 6 #6 and #7; Stage 7 design-1-M1, -M5 quota part, -M6, -N4, -N6, struct-1-M3 security part, style-1-N11 to N16).

**Simplest resolution, in order of preference:**

- **(a) Ship w1.4 without step 3.**
  - Drop §4.3, the quota bullet and the first bullet of §6.
  - Let §5 check 1 accept "off".
  - Add the service later, only if the baseline (finding 3) shows the wait is still too long.
  - The API code can stay unused, because the header already calls the service optional.
- **(b) Whatever you decide on (a), take `'Categories'` and `'Settings'` out of the `WEB_READS` lists.**
  - This is a deletion, not new logic.
  - On a cache miss they are then read through the plain path, with real Dates, so they decode correctly.
  - They are cached for 5 minutes anyway.
  - Do **not** use the other option: a "never fill the cache from an API snapshot" flag would add a branch to the bot's cache functions.

## 2. 🟡 Major: add Alternatives, but as a short list, not a seven-option matrix

**Scope:** the whole feature range. This answers design-1-B1 / struct-1-B1.

Four lines are enough, and each option already has a concrete reason drawn from the system's own limits:

- **A server-side cache of the day view, or extending the 5-minute cache to Entries.** The bot is a separate project that writes to the Sheet directly, and the web-app cannot clear its cache when that happens. A CacheService value is also capped at 100 KB, and Entries keeps growing.
- **Splitting or archiving Entries, or adding a per-day summary tab.** This changes the bot's tabs, which breaks §3.3.
- **One combined server action.** This changes the request contract, which breaks the old-and-new compatibility promised in §2.
- **Service off only.** This is the alternative that matters. Under finding 1 it becomes the chosen design.

## 3. 🟡 Major: adopt a baseline measurement in full, kept to two numbers

**Scope:** §5 check 3, §7 (before step 2) and §1. This answers design-1-M3, style-1-M2/M10 and Stage 6 #3.

One measurement settles three questions:

- whether the API path is needed (finding 1);
- whether the login lock matters (finding 4);
- when Entries growth needs action (finding 6).

**Before step 2:**

- Note the recent `day` durations in the Apps Script Executions panel.
- Time one never-opened date on the phone.

**After step 5:**

- Do the same with a *different* never-opened date. The first date now has a saved copy, so it no longer measures the backend.

Comparing the server time with the phone time already separates Apps Script start-up from the Sheet work. Don't split it any further if that would need new timing code.

## 4. 🟡 Major: the login check is a cause missing from §1. Record it; don't redesign it in w1.4.

**Scope:** §1 "Smaller causes", the §3.1 table and §4.2. This answers design-1-M2.

The reviewer confirmed how this works:

- When the 60-second `wu` cache has expired, `webAuth_` calls `webUsersSync_` inside `withLock_`, which can wait up to 30 seconds.
- This runs before the snapshot, with per-tab reads, and can also write to WebUsers.

At the 5 pm peak, this wait for the lock that saves also hold may cost more than the API path saves.

Add one line to §1. Don't adopt the suggested fixes now:

- A longer `wu` cache time would delay PIN activation and the adding of new Telegram users.
- A lock-free login check would need new code.

Revisit both only if the Executions panel shows lock waits.

## 5. 🟡 Major: reject mitigations that add code, settings or sections for a path that may not ship

| Earlier ask | Response |
|---|---|
| design-1-M6: a setup-time self-check comparing `botRows_` with the API rows | Reject. It is new code that validates only the optional path, and it runs once, on data that changes afterwards. If the API path stays, write an honest coverage line instead: 3 of 5 actions, checked in the simulator only. |
| design-1-N4: a Script property switch for the fast read | Reject. Rollback already exists: remove the service and redeploy. |
| struct-1-M3, the security part | Reduce to one §3.3 bullet: "deployment access unchanged". "Execute as: Me" with access for anyone is unchanged, and the service uses the same spreadsheets access. |
| struct-1-N1/N2: Goals/Non-goals and data-flow sections | Reject as new sections. Retitle §3.3 "Non-goals / what does not change", and give the order `rows_` reads in one sentence (finding 7). |
| design-1-M5: a quota and concurrency model | If finding 1(a) is taken, only the concurrent-runs line is left. Reduce it to one sentence naming the symptom users see, or remove it. Don't add throttling. |
| style-1-M6/M7: the stale-screen caveat | Fix it with one sentence: "wait for 'Mengemas kini…' to clear before editing; saving over someone else's change replaces it." Don't add conflict detection, because app 1.4.0 has already shipped. |

## 6. 🟢 Nit: Entries growth needs one sentence, not a design

**Scope:** §1 second bullet. This answers Stage 5 #2 and design-1-M4.

The sentence should say three things:

- w1.4 removes a fixed cost but doesn't stop the growth;
- how many rows Entries has now;
- what triggers the next step (for example, a server `day` time over N seconds, taken from finding 3).

Don't evaluate archiving or reading only recent rows now: both touch the bot's data and would break §3.3.

## 7. 🟢 Nit: settle the tension over §8 by cutting it, not adding to it

Stage 6 wants §8 to say more; Stage 5 wants it to say less. The code comments in WebApp.gs (lines 134–141) already explain everything. Cut §8 to about five lines and point to the code for the rest:

- the build-time rename of `rows_`;
- the snapshot covers read-only actions only and is always cleared;
- the order `rows_` reads in: from the snapshot if it holds the tab, otherwise read the tab once and keep it;
- WebUsers and Users are never cached, because the login and PIN code reads and writes them;
- any API error falls back to reading tab by tab.

## 8. 🟢 Nit: cheap fixes to accept as they are

- Change "step 7.4" to step 7.5.
- Change the setup log line (line 244) to: "first time: New deployment; upgrade: Manage deployments → Edit → New version". That is one string. The header line under ONE-TIME SETUP is already right.
- Give where WebApp.gs comes from: `deliverables/WebApp.gs`.
- Add one sentence on how the backend relates to the bot: "built from web.gs plus the bot's code, copied unchanged".
- Explain the three time windows in one sentence, or use a single value in `app.js` if possible. This was not checked, because `app.js` was not supplied.
- Small wording fixes:
  - the "`_at`" rule;
  - define "Read-only requests" before the table;
  - "screen" for the app, "tab" for the Sheet;
  - one date format throughout.

## Checked and not flagged

- The `WEB_READS` list of five actions, the `finally` clear, and keeping WebUsers and Users out of the snapshot are minimal and correct.
- With the service off, the plain path reuses `sheet_`, `normVal_` and the bot's row layout, and adds no dependency.
- `sv_` stores digit-leading text as plain text, so the §4.3 risk is limited to cells edited by hand.
- Rollback through deployment versions uses what Apps Script already provides.

---

## Elephant note (main session)

Findings 1(b) and the setup-log string in finding 8 need **code changes** to WebApp.gs, not only edits to the document. The current WebApp.gs w1.4 should not be pasted until they are made and tested. The reviewer's preferred option (a), shipping without the service, also changes what §7 tells the engineer to do. That choice is the author's.
