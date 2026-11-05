# Stage 7 – Critic Review (round 1)

- **Target:** `docs/w1.4-before-after.md`, FeatureRange lines 1–95
- **Reviewers:**

  | Reviewer | Standard | Status |
  |---|---|---|
  | egm-design | feature-spec-standard | completed |
  | egm-structural | feature-spec-standard | completed |
  | egm-style | the persona's own rules (no standard) | completed |

  All three ran in fresh contexts.
- **Goldfish context:** `deliverables/WebApp.gs`
- **Not checked:** the phone app's code (`app/app.js`) was not given to the reviewers, so §2's claims about app 1.4.0 were not checked against it.

## Summary

| Severity | Count after merging duplicates |
|---|---|
| 🔴 Blocker | 1 |
| 🟡 Major | 12 |
| 🟢 Nit | 16 |

Two findings are **defects in the code** (WebApp.gs), not just in the document. The Elephant (main session) checked both against the source:

- **design-1-M1**: hand-typed values in Settings and Categories can leak into actions that write or build reports.
- **struct-1-M2**: the `setup` log tells the reader to do the wrong deploy.

The reviewers confirmed these claims in the document against WebApp.gs:

- the five `WEB_READS` actions;
- the `catch` fallback to reading tab by tab;
- the 5-minute cache for Categories and Settings;
- the 2–3 reads of Entries before this change;
- the setup log line, the version strings, and `DATE_COLS`;
- serial number 46304 = 9 Oct 2026.

---

## 🔴 Blocker

### design-1-B1 / struct-1-B1: no alternatives are evaluated

**Scope:** the whole of lines 1–95. Raised by design and structural.

The feature-spec standard fails any spec that proposes a single path without other designs that were considered and rejected for concrete reasons. The document has no Alternatives section.

Options the reviewers named:

- cache the finished day view on the server (CacheService, keyed by date, cleared on writes);
- extend the existing 5-minute cache to Entries;
- read only the recent block of Entries rather than the whole tab;
- archive or split the Entries tab;
- keep a precomputed per-day summary tab;
- one combined server action;
- make only the phone-side changes, without the Sheets API service.

**Ask:** add an Alternatives section. Give each option a concrete trade-off: complexity, how it handles Entries growth, risk of stale data, and setup cost.

---

## 🟡 Major

### design-1-M1 ⚠️ code defect: API-read values leak into the 5-minute shared cache

**Scope:** lines 42 and 68–75. Raised by design. **Verified by the Elephant:** `WEB_READS.day` and `.reports` include `Settings`, and `.day` and `.import` include `Categories`.

How the leak happens:

1. The bot's `settings_()` and `cats_()` save their rows in the script-wide cache for 300 s.
2. When a fast read fills that cache, actions outside `WEB_READS` reuse its values for up to 5 minutes. Those actions include `wa` (the WhatsApp text), `settings`, and saves.
3. Settings is the tab people most often edit by hand.

Example: someone types `8:00` into `TIME_START_U1`, and Sheets turns it into a time.

- `getValues` returns a Date, and the bot prints "8:00 AM".
- The API returns `0.333…`. `webCell_` leaves it as a number, because `value` is not a date column.
- The WhatsApp text then prints "Time Start: 0.3333333333".

This contradicts the document's claim that saves and other actions are unchanged. It is also more likely to happen than the §4.3 example (a date in a material name).

**Ask (code):** take Settings and Categories out of the API batch. They are cached anyway, so the speed cost is small. Or never fill the `settings`/`cats` cache from an API-built snapshot. Then correct line 42 and §4.3.

### struct-1-M2 / style-1-OOR ⚠️ code defect: the setup log contradicts the upgrade step

**Scope:** lines 52 and 83 (and step 7.5). Raised by structural and style. **Verified by the Elephant:** `web.gs` line 234 prints `NEXT: Deploy → New deployment → Web app …`, and the file header says the same.

§5 sends the reader to the setup log. That log tells them to make a **new deployment**, the one action the document warns against. A new deployment creates a new `/exec` address, and every phone stops reaching the backend.

**Ask (code):** say "first time: New deployment; upgrade: Manage deployments → Edit → New version" in the log and the header. Also add a warning in the document's step.

### struct-1-M1 / style-1-M1: "step 7.4" points at the wrong step

**Scope:** line 52. Raised by structural and style.

Step 4 is "Run `setup`". The deploy step is step 5. A reader who follows the reference lands on the wrong instruction at the most damaging point.

**Ask:** change it to step 7.5, or number the steps 7.1–7.7.

### design-1-M3 / style-1-M2 / style-1-M10: the cause is not measured and there is no target

**Scope:** lines 7–16, 79 and 85. Raised by design and style.

- "Takes 10 seconds or more" and "two things cause most of that wait" have no source.
- §5.3 expects only "a clear drop".
- The "before" timing in §5 comes after the steps, so the reader cannot take it.

The Apps Script Executions panel already shows live `day` durations under w1.3.1, so a baseline can be taken now.

**Ask:**

- Record a baseline before pasting.
- Split the wait into start-up, Sheet reads and the rest.
- Set a pass/fail target, for example "first-time date under N s".
- Move the "before" timing into §7, ahead of step 2.
- Use a fresh unopened date for each timing (see the Stage 6 comprehension report, finding 3).

### design-1-M4: the monthly growth is not fixed and not listed as a limit

**Scope:** line 10. Raised by design; it repeats Stage 5 finding 2.

Every `day`, `imports` and `import` still reads the whole Entries tab. With the service on, that read sits inside one batchGet that keeps getting bigger.

**Ask:** make it an explicit non-goal. State the row count at which it degrades again, or link it to an alternative from B1.

### design-1-M2: the "one call" claim leaves out the login check, which takes the script lock

**Scope:** lines 36–40 and §4.2. Raised by design.

`webAuth_` runs before the snapshot. When the 60-second `wu` cache has expired, `webUsersSync_` runs inside `withLock_`. It reads WebUsers and Users, and it can write to WebUsers.

So after about a minute without use, most date changes pay extra Sheet calls. They also wait for the same script lock that saves hold. This is worst at the 5 pm peak.

**Ask:** add this cost to the table and to §4.2. Consider a longer `wu` cache time, or a read-only login check that takes no lock.

### design-1-M5 / struct-1-M3 (part): quota and concurrent runs are not quantified

**Scope:** lines 61 and 65–66. Raised by design and structural.

"Each day view is one read request" leaves out several other requests:

- the pre-load, which doubles day requests;
- `reports`, `imports`, `import` and `pdfState`, which each make one batchGet;
- `pdfState`, which the app polls every 5 seconds while a PDF is read.

The document gives no team size or peak rate. The note on concurrent runs ends with "Not measured", with no mitigation and no switch.

**Ask:** estimate users × requests per minute, and compare it with the ~60/min read limit and the ~30 concurrent runs. Say what users see when the peak goes over, and how to respond.

### struct-1-M3: Risks & Limits are incomplete

**Scope:** §4, lines 55–79. Raised by structural.

- No security item covers the existing "Execute as: Me" plus anyone-can-call deployment, which now also uses the advanced service.
- §4.4 gives no plan for confirming results live and no rollback threshold.
- The heading promises "open questions", but none are listed.

**Ask:** add a security note, a live-check plan with a rollback trigger, and either open questions or a renamed heading.

### design-1-M6 / style-1-M9: identical results checked only in the simulator, for 3 of 5 actions

**Scope:** lines 40, 75 and 79. Raised by design and style.

The tests compared `day`, `reports` and `imports`, but not `import` or `pdfState`.

The fake API encodes the author's own assumptions about the real one: trailing empty rows and columns, serial numbers, and leading empty rows. So it cannot catch a wrong assumption. `webFastCheck_` only checks that the API can be reached.

**Ask:** state the coverage honestly. Also consider a setup-time self-check that compares `botRows_` with the API rows for each tab and logs any differences.

### style-1-M3: "tab" means both an app screen and a Sheet tab

**Scope:** lines 10, 14 and 38. Raised by style.

**Ask:** use "screen" for the app (Hari ini, Laporan) and "tab" only for the Sheet.

### style-1-M4 / struct-1-N3 / design-1-N2: "Read-only requests" is defined but never used

**Scope:** line 42. Raised by all three reviewers.

The table describes only "one date change (home tab)". The reader is never told that the other four actions use the same read.

**Ask:** define the term before the table and label the table with it.

### style-1-M5 / struct-1-N5 / design-1-N3: three time windows are unexplained

**Scope:** lines 25, 27 and 61. Raised by all three reviewers; it repeats Stage 5 finding 5 and Stage 6 finding 4.

The windows are 3 minutes (whether to pre-load), 1 minute (whether a date change asks the server again) and 20 seconds (reuse of the report list).

**Ask:** state each window once and say what it controls.

### style-1-M6 / style-1-M7: the stale-screen caveat overstates and leaves out a case

**Scope:** line 60. Raised by style.

- "Usually a few seconds" is only true after w1.4. On w1.3.x the refresh takes as long as a date change, 10 s or more.
- "Nothing is lost" covers a deleted activity. It does not cover an activity someone else changed, where the edit screen opens with the old text.

**Ask:** tie the time to the backend's response time. Say what happens when you save over a change someone else made. Tell users to wait for "Mengemas kini…" to clear before editing.

### style-1-M8: the concurrent-runs caveat gives no decision

**Scope:** line 66. Raised by style. Merged with design-1-M5.

**Ask:** name the symptom and the response, or remove the caveat.

---

## 🟢 Nit

| ID | Lines | Issue | Ask |
|---|---|---|---|
| style-1-N1 / struct-1-N6 | 3 | Date "05/11/2026" can be read two ways; line 101 uses 2026-11-05 | Use one format throughout |
| style-1-N2 | 9 | Tense shift, and "every time" clashes with the offline exception | Rewrite: "It kept a copy… but showed it only when offline" |
| style-1-N3 | 10 | "Gets slower every month" has no figures | "Grows with every activity added" |
| style-1-N4 | 16 | "No code change removes this" is absolute | "This change does not remove it" |
| style-1-N5 | 25 | "Quietly" is filler | Remove it |
| style-1-N6 | 28 | "Newest 21 days" is ambiguous; it does not say whether pruning repeats | Say "the 21 dates most recently fetched"; say that pruning runs on every save |
| style-1-N7 | 30 | "‹, ‹ again, ›" is hard to read | Name each action |
| style-1-N8 | 38 | "One call per tab, each tab once" is redundant; "small" adds nothing | Tighten |
| style-1-N9 | 40 | "The bot's `rows_` result" uses an internal name | "The rows the bot's code reads" |
| style-1-N10 | 57, 63, 65 | "Things that will happen" covers a "can"; "could bite" is informal | Rename to "Expected effects" and "Limits" |
| style-1-N11 | 65 | "Google publishes it as about 60" hedges a published number | State the figure and its source |
| style-1-N12 / design-1-N1 / struct-1-N4 | 70 | "Ends in `at`" does not match the code's `/(^\|_)at$/`; the bare `at` column and times below serial 367 are not mentioned | State the rule exactly |
| style-1-N13 | 72 | "Neither is what the person meant" guesses at intent | Remove it |
| style-1-N14 | 73 | "No such case is known" does not say what was checked | State what was checked |
| style-1-N15 | 36–92 | One feature has five names: "Sheets API service", "the service", "fast read", "the single call"… | Define "fast read" once; write "the Saya tab" |
| style-1-N16 | 92–93 | "Fast read misbehaving" names no symptom; "the one before today's" is vague | Point to check 5.4; refer to the number written down in step 7.1 |
| style-1-N17 | 44 | The heading has no subject | "Also included if w1.3.1 is not live" |
| struct-1-N1 / design-1-N5 | whole | No Goals / Non-Goals section | Add one; §3.3 can become the non-goals |
| struct-1-N2 | 34–42 | The request path (data flow) is not described | Add a 3–4 line flow, or point to §8 |
| struct-1-N6 | 65, 75 | "The tests" gives no path | Link `backend/test/web_test.js` |
| design-1-N4 | 92 | Turning the fast read off needs a redeploy | Consider a Script property switch that `webSheetsApi_` checks |
| design-1-N6 | 59 | A user-managed GCP project also needs the Sheets API enabled in Cloud Console | Add a line |

## Traceability

| Consolidated item | Raw findings |
|---|---|
| Alternatives (Blocker) | design-1-B1, struct-1-B1 |
| Settings/Categories cache leak (code) | design-1-M1 |
| Setup log says "New deployment" (code) | struct-1-M2, style-1 out-of-range note |
| Step 7.4 reference | struct-1-M1, style-1-M1 |
| No baseline or target; timing order | design-1-M3, style-1-M2, style-1-M10 |
| Entries growth | design-1-M4 (also Stage 5 #2) |
| Login check and lock cost | design-1-M2 |
| Quota and concurrency estimate | design-1-M5, struct-1-M3 (part), style-1-M8 |
| Risks section gaps | struct-1-M3 |
| Simulator-only equality, 3 of 5 actions | design-1-M6, style-1-M9 |
| "Tab" has two meanings | style-1-M3 |
| "Read-only requests" term | style-1-M4, struct-1-N3, design-1-N2 |
| Time windows | style-1-M5, struct-1-N5, design-1-N3 (also Stage 5 #5, Stage 6 #4) |
| Stale-screen caveat | style-1-M6, style-1-M7 |
