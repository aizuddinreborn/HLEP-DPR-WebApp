# Stage 5 – Initial Zoom Out Review

- **Target:** `docs/w1.4-before-after.md` (full file, lines 1–135; FeatureRange 1–95, DetailedRange 96–135)
- **Reviewer:** egm-zoom-out, run in a fresh context with the zoom-out standard
- **Goldfish context:** `deliverables/WebApp.gs`
- **Not checked:** the reviewer had no project README or context file, so it did not check how well the change fits the wider project.

## Verdict

**Passes with changes. No Blockers: 2 Major, 3 Nit.**

The reviewer checked these claims in the document against WebApp.gs and found them correct:

- The five read-only actions match `WEB_READS`: day, reports, imports, import and pdfState. All five only read.
- Login and the WebUsers tab stay outside the per-request snapshot.
- Any `batchGet` error, or the wrong number of returned ranges, falls back to reading tab by tab.
- `setup` logs whether the fast read is on.
- `botRows_` is the bot's `rows_` under a new name.

The change reuses the bot's `normVal_`, `headers_` and `sheet_` rather than copying them. Renaming `rows_` at build time is a reasonable hook, given the rule that the bot's code is copied unchanged.

## Findings

### 1. 🟡 Major: the Sheets API path is added without evidence it is needed

**Scope:** §3.1 ("service on" column), §4.2, §4.3, §7 step 3, §5 check 1

With the service **off**, the read is already one `getDataRange()` per tab, and Entries is read once. That cuts about 30 Sheet calls to about 10. It needs no date conversion, because `getValues()` still returns Date objects to the bot's `normVal_`.

The **on** path adds the following:

- a dependency on an advanced service
- a permission prompt
- a Sheets API read quota shared by the whole team (the backend runs as the owner)
- a second date decoder (`webCell_`), with the known differences listed in §4.3
- a `setup` check that the service is on

§4.4 admits the gain from about 10 calls to 1 has not been measured. At the busiest time (§4.2), a refused API call costs one failed round trip and then the tab-by-tab reads anyway. In that case the API path is slower than having no service.

**Suggested change (to the procedure, not the code):** make adding the service a second step that depends on a measurement:

1. Deploy w1.4 without the service.
2. Time it with §5 check 3.
3. Add the service only if the wait is still too long.

Otherwise, give a per-call latency figure that justifies the API path. Either way, §5 check 1 should not require "on".

### 2. 🟡 Major: Entries growth, the cause that keeps getting worse, is not removed

**Scope:** §1 second bullet, compared with §3.1

§1 says Entries "gets slower every month". Both read paths still read the whole Entries tab on every day view. The change cuts a fixed cost (2–3 reads down to 1; about 30 calls down to 1–10), but the read still grows with every new row. A reader will think the monthly slowdown is fixed.

**Suggested change:** add one or two sentences that cover three things:

- that this cuts a fixed cost and does not stop the growth
- how many rows Entries holds today
- what signal would trigger the next step (for example, a day view slower than N seconds)

The reviewer does not ask for an index or a date-split tab now.

### 3. 🟢 Nit: the rule for adding an action to `WEB_READS` is unwritten

**Scope:** §3.1 "Read-only requests" sentence; §8 rows for `webRoute_` and `rows_`

The snapshot is only correct if an action never writes and never re-reads after a write. Otherwise it would serve rows from before the write. All five actions meet this today: the reviewer checked `apiDay_`, `apiReports_`, `webImportsList_`, `apiImport_` and `webPdfState_`. The document lists the five actions but does not state the rule.

**Suggested change:** add one sentence for maintainers: "an action may be added to `WEB_READS` only if it never writes to the Sheet." Also, "Read-only requests" appears in quotes, but the table above it never uses the phrase. Attach the definition to the table it qualifies.

### 4. 🟢 Nit: §8 drops to code level and will go out of date

**Scope:** §8 code changes table, mainly the `webSnapStart_`, `webSnapRows_` / `webCell_` and `app/app.js` rows

The table repeats code detail that WebApp.gs's own comments already explain:

- render-option names
- "`_row` from 2"
- "header width = widest row"
- private function names and signatures

**Suggested change:** keep only what a maintainer must know, and point to the code for the rest:

- the build-time rename of `rows_`
- the snapshot covers `WEB_READS` actions only and is always cleared
- WebUsers and Users are never in the snapshot
- any API error falls back to tab-by-tab reads
- the service-worker cache name was bumped

### 5. 🟢 Nit: two time windows are not explained, and the quota estimate is incomplete

**Scope:** §2 row "Tapping ‹ to yesterday" (3 minutes), §4.1 "More requests" (1 minute), §4.2 quota

The document uses a 3-minute window and a 1-minute window for what reads like the same idea, without saying how they differ.

§4.2 says "each day view is one read request". It leaves out three things:

- the pre-load's extra day view per date change
- the Laporan tab's own `batchGet`
- the team size

Without them, a reader cannot tell whether the 60-per-minute limit is near or far.

**Suggested change:**

- Explain the two windows. The 3-minute window decides whether to pre-load; the 1-minute window decides whether a date change asks the server again.
- Add one line: team size × requests per date change. This also supports Finding 1.

## Checked and not flagged

- Showing the saved copy while fresh data loads is a standard pattern and targets the main symptom.
- The 20-second reuse of the report list removes a duplicate request; it does not add a new cache layer.
- Rollback through deployment versions uses Apps Script's built-in versions, and the `/exec` address stays the same.

## Wording mismatch with the code

§4.3 says "any column whose name ends in `at`". The code matches `/(^|_)at$/`: a column named `at`, or one ending in `_at`. A column such as `format` is not treated as a date. The examples in §4.3 are all correct.
