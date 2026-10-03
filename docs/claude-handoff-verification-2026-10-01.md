# Claude handoff verification — October 1, 2026

Reviewed the combined working tree at `ff960a09`, including all 14 unpushed commits and the uncommitted work. This was an independent readiness check, not completion of the separate every-role/every-button audit. No application code, permissions, existing customer records, or deployment was changed in this review.

## Results

- TypeScript passed.
- Quiet ESLint passed with zero errors across 265 changed/new JavaScript and TypeScript files. This is not a claim of zero warnings.
- `git diff --check` passed.
- Independently ran the plain Node unit tests on this tree and an isolated `origin/main` snapshot, with identical resolution hooks, no credentials and an outbound guard. Current: **345 passed, 35 failed, 380 total**. Origin: **320 passed, 35 failed, 355 total**. The failing test-name sets are identical; no new failing names. Counts differ from the earlier handoff because the current tree has additional tests. Existing failures remain unresolved.
- **71 focused tests passed** using a CommonJS TypeScript loader where the tests need their dependency mocks: workspace scope, tour access, membership revocation, selected sources, streaming, WhatsApp formatting/media handling and threading.
- Added an audit-only in-memory scenario with 74 mixed-currency open opportunities and two closed opportunities. Exact offering and overdue totals remained correct beyond the first 50 records; Won/Lost were excluded and currencies stayed separate. The existing workspace tests plus this scenario passed (28 tests; 27 overlap the focused run).
- Local `/api/health` reported healthy, reachable development database, configured authentication and live mode.
- **Full standalone production build passed**, including compilation, lint/type validation, static-page generation and standalone tracing. Ran in a copied tree without `.env` files or runtime credentials, preserving the running local server and shared source. Existing warnings remain. The first attempt used linked dependencies and failed during standalone tracing with an isolation-path permission error; copying dependencies into the snapshot resolved it. This was a local macOS/Node 24 build, not a Linux Docker deployment check.

## Confirmed problems

### Agent substitutes estimated TCV for an explicit recorded-value question

Actual authenticated Admin session against the development Agent, with `stream:true`; this was a real provider answer, not mock transport.

Question: “Across all open opportunities, what is the exact recorded contract value by offering, in original currencies? Exclude Won and Lost. Use the complete data before pagination, not just the first 50 deals. Do not change or send anything.”

The answer gave **103 open opportunities, $12,604,623 USD and €200 EUR**. The saved records contain **103 open opportunities, $11,604,623 USD and €0 EUR** in their `value` fields. `test opp` has recorded value 0 and Estimated TCV $1,000,000; the AbbVie EUR opportunity has recorded value 0 and Estimated TCV €200. These two estimates explain the entire difference. The GRI offering subtotal, $5,830,423, was correct.

Both metric families are supplied to the model. `lib/agentWorkspace.ts:605` and `:609` supply estimated open-pipeline totals and instructions to quote them; `:1175` supplies the recorded totals and `:1177` warns against substituting estimates. Correct arithmetic alone does not ensure the model chooses the requested measure. Impact: an answer labeled “exact recorded contract value” overstates that value. Reported without changing the Agent in this review.

Evidence: `.qa-backups/handoff-live-agent.json` and `.qa-backups/handoff-onboarding-source.json`; logged in the incremental Agent findings/coverage files.

### Cleared contract fields retain their old values

Reproduced against the actual contract-store functions with persistence replaced by an in-memory database, in both current code and `origin/main`. `components/contracts/ContractsModule.tsx:591`–`:603` converts cleared optional fields to `undefined`; JSON serialization drops them. `lib/contracts.ts:428` merges the resulting input into the existing record. Clearing note, owner or start date therefore retains the old value. Sending an explicit empty string clears the note, confirming the cause.

Impact: save appears successful but the old optional value remains. This predates the 14 commits.

### New/Edit meeting files are discarded

`components/meetings/NewMeetingDialog.tsx:805` sends successfully uploaded files as `docs`. The create route does not forward them; `lib/meetings.ts:446` initializes `docs: []`, and `updateMeeting` at `:454` does not apply a `docs` patch. Both actual store functions discarded a supplied document in the isolated reproduction, on both this tree and `origin/main`.

Impact: uploaded meeting briefs/files are absent from the saved meeting. This predates the 14 commits. No real upload or shared meeting write was used to reproduce it.

### Onboarding browser spec is stale

`tests/onboarding.spec.ts:36` and `:38` look up `to-agent` and `to-offerings`, which no longer appear in the current tour catalog. The spec also assumes the older flow. It needs updating before it can validate the new onboarding. The banned Playwright suite was not run.

## Handoff corrections and qualifications

- **Phone order confirmed:** an isolated browser check used the actual components over Offerings, an authenticated disposable development account, and browser-only onboarding/phone state fixtures. Welcome appeared before any phone check. “Not now” skipped the tour and opened phone setup; “Skip for now” dismissed it and called the expected skip transport. This verifies presentation/order for the skip path, not real WhatsApp delivery or completion of every tour step. The first attempts failed because the audit guard blocked auth refresh and then used the old phone heading; those harness errors were corrected before the passing run.
- **Mentions already exist:** `@` and `/` record/material selection is implemented in our uncommitted code. See `docs/agent-mentions-2026-10-01.md` for browser, authorization, persistence and real sales-material evidence. Claude's “still open” description predates that implementation.
- **Tie handling passed one explicit live question:** asking for every open opportunity tied at the largest recorded USD value correctly returned BMS and J&J Medtech, each $1,000,000, and excluded `test opp` because its recorded value is zero. This does not prove that a shorter, ambiguous “biggest deal” question always preserves ties.
- **Connection interruption remains unresolved:** both live questions completed with terminal NDJSON `done` events. Stream-client tests passed. The intermittent failure reported by Claude was not reproduced in these two calls, so it is neither fixed nor dismissed.
- **Middleware concern is accurate:** `middleware.ts:424` checks current membership for protected page/API requests through `lib/liveAccessGrant.ts`. The uncached request has a five-second timeout and denies access on failure. This closes stale-role/disabled-member access; it also adds database latency and makes database outages visible as denied requests. No cache was added that would extend revoked access.
- **Cost reduction is not independently certified:** the parallel-lookup instruction and deterministic summaries are present. The two new live calls used two and four model calls respectively. This pass did not reproduce Claude's earlier before/after workload or independently audit cloud billing, the restored usage counter, or every remaining test chat.
- **Historical QA residue:** a read-only development check found no customer named `Reserved QA Lead 1790883382919`; the handoff's customer claim is stale. A meeting named `Reserved QA Lead 1790883382919 UI edited` still exists (`mtg-mupxq84l-97frv`) and retains the removed customer's ID. It was preserved during this read-only review; earlier cleanup semantics still require reconciliation.
- **Permissions remain a separate open task:** this review does not certify the reported module/record permission mismatches or every-role interaction coverage. It does not broaden access.
- **Uncommitted source must accompany the commits:** the combined result depends on untracked files such as `lib/liveAccessGrant.ts`, `lib/agentEntityIndex.ts`, `lib/agentSelectedSources.ts`, `components/agent/EntityComposer.tsx` and `components/ui/outsideInteraction.ts`. Pushing only the 14 commits is not the same tested artifact.

## Cleanup and limits

All accounts created by this review were reserved test accounts, journaled before creation, on Supabase `ebyoefeikqxxxxifgjxk`. Account/Auth/onboarding and exact scoped profile/conversation rows were removed and their absence verified after each attempt. No invitations, WhatsApp/email sends, or existing business-record writes were performed. The form reproductions and the pagination scenario used memory-only persistence.

The UI sweeps for every named confirmation, avatar hover, empty card and remove chip were not repeated here. Prior dropdown coverage remains documented separately in `docs/popup-dropdown-audit-2026-10-01.md`. No exhaustive coverage or live WhatsApp end-to-end claim is made. No push or deployment occurred.
