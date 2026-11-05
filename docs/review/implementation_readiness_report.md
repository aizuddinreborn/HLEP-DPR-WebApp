# Stage 9 – Implementation Readiness Test (round 1)

- **Target:** `docs/w1.4-before-after.md`, DetailedRange lines 96–135. Lines 1–95 were read only as background.
- **Reviewers:** all three ran in fresh contexts and completed.

  | Reviewer | Standard |
  |---|---|
  | egm-implementation-readiness | implementation-readiness-standard |
  | egm-codebase-details | implementation-readiness-standard |
  | egm-style | the persona's own rules |

- **Goldfish context:** `deliverables/WebApp.gs`. The readiness and codebase reviewers also read `backend/build.js`, `package.json`, `.gitignore`, `backend/test/web_test.js`, `app/app.js`, `app/sw.js`, `tools/check-w14.js` and `tools/dev-server.js`.

## Summary

| Severity | Count after merging duplicates |
|---|---|
| 🔴 Blocker | 1 |
| 🟡 Major | 7 |
| 🟢 Nit | 13 |

**Verdict: not ready.** The order of the steps is safe, because the live `/exec` address keeps serving the old version until step 5. But a reader cannot carry out step 2 without guessing, and the plan has three gaps:

- At step 4, the setup log contradicts step 5.
- There is no rule for what to do if the fast read stays `off`.
- The "before" timing that the plan asks for has no step that records it.

The reviewers checked these parts against the code and found them correct:

- Every name in §8: `webRoute_` with `finally`, `WEB_READS` (5 actions), `WEB_SNAP_TABS` without WebUsers or Users, `webSnapStart_` options and fallback, `rows_`, `RENAME`, `botRows_`, `webFastCheck_` reading `'Settings'!A1:A1`, the app.js names, and the sw.js cache name.
- The `Built` header and both setup log lines in step 4.
- The five read-only handlers really do not write.
- `web_test.js` has 181 `ok(` checks, 10 of them in the w1.4 section.

**Elephant checks:**

- `deliverables/WebApp.gs` and `backend/dist/WebApp.gs` are byte-identical (`cmp`).
- The reviewers disagree on one point. The readiness and codebase reviewers repeat the document's claim that a "New deployment" cuts the phones off. The style reviewer says the existing deployment keeps its address and its old version, so the app keeps working on w1.3.x and simply never gets w1.4. **The style reviewer is right**, and the document's wording (line 107) needs correcting. See irr-M1.

---

## 🔴 Blocker

### irr-B1 / code-M3: step 2 does not say which file to paste or how to get it

**Lines:** 101, 126

"Paste all of the new `WebApp.gs`" gives no path. Two copies exist:

- `deliverables/WebApp.gs`
- `backend/dist/WebApp.gs`

Both are git-ignored, so a fresh clone has neither.

Building one has requirements the plan does not mention:

- The bot's private Code.gs, passed as an argument, through `BOT_CODE`, or at the default `/home/claude/hlep-dpr-bot/Code.gs`.
- `npm install` first (acorn, acorn-walk).

The `Built …` date in the header is the build date. So step 2's check "Built 2026-11-05" fails on a copy rebuilt on another day.

**Fix:**

- Name the file to paste: the WebApp.gs sent by Claude, saved in `deliverables/`.
- Give the build command for a rebuild: `npm install`, then `BOT_CODE=/path/to/Code.gs npm test`, which writes `backend/dist/WebApp.gs`.
- Change the header check to "the line says `HLEP DPR Bot v1.4`". Do not check the date.

---

## 🟡 Major

### irr-M1 / code-M1 / style-M1 / style-M2: the setup log contradicts step 5, and step 5 states the wrong consequence

**Lines:** 103–107. ⚠️ This is also a code issue (WebApp.gs:244). It was already found in Stage 7, as struct-1-M2.

Step 4 asks the reader to read the setup log. That log ends with `NEXT: Deploy → New deployment → Web app …`, and step 5 forbids exactly that.

Line 107 also overstates the result. A new deployment adds a second address. The existing one keeps running the old version, so the app stays on w1.3.x and never gets w1.4.

**Fix:**

- Code: change the `NEXT:` line to "first time: New deployment · upgrade: Manage deployments → ✏️ → New version".
- Document: in step 4, say "the last `NEXT:` line is for first-time setup".
- Document: in step 5, say "the app would keep using the old version and not get w1.4".

### irr-M2 / code-M2 / style-M3: "fast read off" has more causes than the plan names, and no go/no-go rule

**Line:** 106

`webFastCheck_` returns `false` for any exception and swallows the error. Possible causes:

- the service is missing or has the wrong identifier;
- the permission was not granted;
- the API is disabled in a user-managed GCP project;
- the read quota is used up.

The plan names only the identifier. It never says whether to stop or to deploy anyway, even though the code's own header calls the service optional.

**Fix:**

- List the causes.
- Give the rule: "still `off` after one retry → continue to step 5. w1.4 works without the service (one read per tab). Note it."
- Code (optional): log the error message in `setup`, so the reader can tell the causes apart.

### irr-M3 / style-M4: the "before" timing has no step

**Line:** 108, referring to line 85

Step 6 runs the checks in §5, and check 3 needs a timing taken before pasting. No step before step 2 records that timing.

Under app 1.4.0, a date timed once is saved on the phone, so timing it again afterwards measures the phone, not the backend. The Stage 6 comprehension report (finding 3) and the Stage 8 report (finding 3) say the same.

**Fix:**

- Add a step 1a: "pick a date never opened on this phone, time until the list shows, write it down. Also note the recent `day` durations in Apps Script → Executions."
- Step 6 then uses a **different** never-opened date.

### irr-M4 / code-N9: the tests in §9 cannot be reproduced from the plan

**Lines:** 126–135

`npm test` needs `npm install` and the bot's private Code.gs. `tools/check-w14.js` needs Playwright and a preview started with `DELAY=3000 npm run dev`.

**Fix:** list the exact commands and what each one needs before it can run.

### code-M4: §8 lists files without marking them Create, Modify or Delete

**Lines:** 113–122

**Fix:** mark each file. All of them are Modify, and the changes are already made and committed.

### code-M5 / style-M6: on/off equality is tested for only 2 of the 5 fast-read actions

**Lines:** 127–133

The tests compare the service on and off for `day` (twice) and for `reports`. The contractor card is covered only indirectly, through `day`. These three never run with the fake API:

- `imports`
- `import`
- `pdfState`

Line 75 also says the comparison covered "the contractor list", which does not match the tests. Line 130's claim about hand-typed dates, written without qualification, conflicts with §4.3.

**Fix:**

- Add on/off tests for `imports`, `import` and `pdfState`, or state that they were not covered.
- Name the column in the hand-typed-date test: a date column in Entries.

### style-M5 / irr-N4: "10 are for this version" is followed by 7 bullets

**Lines:** 126–133

The codebase reviewer confirmed there really are 10 checks, and some bullets cover two of them. But a reader cannot reconcile 10 with 7.

**Fix:** list one bullet per check, or point to the test section name (`w1.4 · fast reads…`). State when the run happened, by commit or date.

---

## 🟢 Nit

| ID | Lines | Issue | Fix |
|---|---|---|---|
| code-N8 | 118 | Fast-read values reach save, edit and delete requests through the 5-minute `settings_`/`cats_` cache. This is the same defect as Stage 7 design-1-M1 and Stage 8 finding 1(b) | The code fix is tracked there; add one sentence to §8 |
| code-N6 / style-N8 | 118 | "Inside: one `getDataRange()` per tab" reads as if it happens every time | Add "if the tab is not already in the snapshot" |
| code-N7 | 117, 119 | Edge cases left out: a length mismatch leads to an empty snapshot without an error; `[]` when a tab has fewer than 2 rows; time-only values below serial 367 (untested); UTC formatting on purpose; `WEB_FAST` set but never read; `majorDimension: 'ROWS'` | Point to the code comments, or list them briefly. Consider removing `WEB_FAST` |
| code-N9 | 133 | The setup-state test checks only `off`. The `on` line that step 4 relies on is never tested | Add a test with the fake API |
| code-N10 / irr-N2 | 102 | Step 3 does not give the service version (v4). The project title "HLEP DPR Web-app" is not set anywhere in the code | Add "Version: v4 (default)". Describe the project as "the one whose deployment URL is in `app/config.js`" |
| irr-N1 | 107 | "Manage deployments → ✏️" assumes there is only one deployment | Say "the one whose `/exec` URL matches `app/config.js`" |
| irr-N3 / style-N6 | 109 | Step 7 (ask the team to reopen the app) has no reason, since app 1.4.0 is already live | Remove it, or give the reason |
| style-N1 | 96–98 | Heading levels: §1–6 are H2, §7–9 are H3 under an unnumbered H2 | Make §7–9 numbered H2s, or rename the wrapper heading |
| style-N2 | 100 | The label "Keep a copy" does not match the action, which is to note the version number | "Record the current version number" |
| style-N3 | 104–106 | The "If it says `off`" line will render inside the previous bullet | Add a blank line and indent it |
| style-N4 | 101 | "Select all, delete, paste all…, Save" repeats itself | "Replace the whole contents with WebApp.gs and save" |
| style-N5 / style-N7 | 102, 111 | "Left side" is vague. "For whoever maintains it" is informal | "In the editor's left sidebar"; "(maintainer reference)" |
| style-N9 | 134–135 | The test tools state no result | Point to the figures in §2, and say what `shots.js` checks |

## Traceability

| Consolidated item | Raw findings |
|---|---|
| File to paste and how to build it (Blocker) | irr-B1, code-M3 |
| Setup log vs step 5; wrong consequence | irr-M1, code-M1, style-M1, style-M2 (also Stage 7 struct-1-M2) |
| "Off" causes and go/no-go rule | irr-M2, code-M2, style-M3 |
| Missing "before" timing step | irr-M3, style-M4 (also Stage 6 #3, Stage 8 #3) |
| Test commands not reproducible | irr-M4, code-N9 (part) |
| Files not marked Create, Modify or Delete | code-M4 |
| On/off parity for 2 of 5 actions | code-M5, style-M6 (also Stage 7 design-1-M6) |
| 10 checks vs 7 bullets | style-M5, irr-N4 |
| Cache leak into writes | code-N8 (also Stage 7 design-1-M1, Stage 8 #1b) |

---

## What must change before WebApp.gs w1.4 is pasted (Elephant summary across Stages 5–9)

These are code changes, separate from the edits to the document:

1. **Take `Settings` and `Categories` out of `WEB_READS`.** This is Stage 7 design-1-M1, Stage 8 #1(b) and Stage 9 code-N8. Without it, hand-typed times or dates in those tabs reach the WhatsApp text and saves through the bot's 5-minute cache.
2. **Fix the setup log's `NEXT:` line** for upgrades. This is Stage 7 struct-1-M2 and Stage 9 irr-M1.
3. **Recommended:** log the error when the fast-read check fails (irr-M2). Add on/off tests for `imports`, `import` and `pdfState`, plus a test for the `on` setup line (code-M5, code-N9).

The reviewers also prefer shipping w1.4 first **without** the Sheets API service, measuring it, and adding the service only if loading is still slow (Stage 5 #1, Stage 8 #1(a)). That decision belongs to the author.
