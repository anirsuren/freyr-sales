# Full application development audit

User authorization: September 11, 2026. Recurring comprehensive testing of every feature in real mode on desktop in development; investigate suspected bugs and adjacent paths rather than assuming behavior. Heartbeat: freyr-full-development-audit, every two minutes in the current task.

## Execution contract

- App: /Users/anirudhsuren/Downloads/freyr sales/freyr-sales, localhost:3006, live data mode, desktop Chrome. Verify the runtime each pass; local listening port alone is not proof of environment.
- Development project: ebyoefeikqxxxxifgjxk. Production project: kthwujrkgmpvrfcghqib. Never use FREYR_PROD migration credentials or deploy/push.
- Use a persistent coverage matrix: docs/full-app-audit-inventory.json. Initial inventory contains 88 page files and 167 API route files. Discover individual controls and state transitions; these counts do not mean 255 complete features.
- Existing historical unguarded Playwright suite is prohibited until isolated. Authorized dev account/CRUD tests must instead use targeted guarded scripts with exact fixture IDs. Never clear shared singleton stores or delete non-audit data.
- Name fixture records with a unique audit prefix; journal IDs, relationships, and cleanup in .local-backups/full-app-audit/. Test real persistence and cross-account isolation. Existing fixtures from earlier agent tests were cleaned up.
- Email/messages, third-party file storage, paid scrapers and model APIs are distinct side effects. Do not send messages to real people. Verify storage boundaries and use controlled destinations. Capture model usage, limit repeat paid calls, and never regenerate all company intelligence just to test layout.
- Preserve all existing uncommitted user/Claude/Codex work. Reproduce and diagnose before changing behavior. Do not change intended access policy merely to make a test pass.

## Coverage dimensions for every applicable feature

Desktop layout at 1440px and 1920px; signed out and signed in; relevant roles and per-user privileges; owner versus non-owner; empty and populated; create/read/edit/archive/delete; cancel and unsaved changes; required fields and invalid/duplicate input; filtering/search/sort/pagination; bulk selection/actions; links and navigation; files/import/export; loading/failure/retry; refresh/new tab persistence; simultaneous tabs and isolation. Test through UI and confirm server/database results where relevant. A successful HTTP response is only a smoke check.

## Queue

1. Environment/startup and authenticated desktop smoke; inspect network/console failures.
2. Account creation, approval, login/logout, role changes, profile/photos, account isolation and direct endpoint denial.
3. Agent: all available module knowledge, entity links/citations, dynamic follow-ups, history, cost/latency, simultaneous chat-save conflicts.
4. Offerings, ownership, materials/folders/files, FDL components and links.
5. Market Intel customers/competitors/market, onboarding, duplicates, persistent loading, tracking/star management, logos/people, collection schedule, source correctness, filters/detail drawers.
6. Leads and opportunities, ownership, stages, amounts/currencies, linked records and bulk actions.
7. Solution requests, submissions, presentations, meetings and cross-module handovers.
8. Contracts and Customers, all tabs and activity/report relationships.
9. Goals/performance/verification and Reports, units/currency/permissions/exports. Investigate known potential mixed-currency heatmap display issue.
10. Team/Admin/privileges/settings, global search, notifications, onboarding, navigation and miscellaneous routes from inventory.
11. Cross-module regression, performance, concurrent requests and realistic workload tests; distinguish fixture isolation from infrastructure load results.

## Finding protocol

For each suspected bug, record reproducible steps, expected behavior with requirement/source basis, actual result, role/mode/data conditions, screenshot/network evidence, root cause, adjacent risks, fix, and retest evidence. Status: suspected / confirmed / intended / fixed and verified / blocked. Expand around shared components, corresponding API endpoints, alternate roles, and neighboring workflows. Do not report a synthetic fixture limitation as a product defect.

## Progress

- Initial route inventory created. All routes begin untested in this new audit; historical agent audits are evidence to consult, not blanket passes.
- Previous agent audit: 50 questions, role lifecycle and isolated checks, desktop UI checks. Known remaining concern: simultaneous conversation whole-history saves can overwrite each other. Do not silently mark this resolved.
- Initial health response: healthy, version dev, database reachable, authentication configured, dataMode live, service health check duration 511 ms. This is a smoke check, not feature validation.
- Fresh runtime verified development project ebyoefeikqxxxxifgjxk from rendered login configuration. Login, health, entity index and privileges returned 200. Desktop Chrome at 1440×1000 opened the agent, composer visible, no page errors. Evidence: .local-backups/full-app-audit/baseline.json and desktop-baseline.json/png. This first browser smoke blocked writes and does not count as persistence or workflow coverage.
- Next: execute queue item 2, actual development account lifecycle and permission variants; add individual scenarios and evidence to inventory.

## Reporting

Save progress each pass. Notify only meaningful findings/fixes, blockers requiring user input, or coverage milestones. After first complete coverage pass, continue regression passes focused on changed/risky behavior. Never say every feature passed while any item is untested, blocked, or only source-reviewed.

### Pass 1 — account lifecycle, 2026-09-11

Actual development fixtures: bd_member and admin. Both completed real email/password desktop Chrome login and landed on /offerings. Wrong passwords were rejected. Application grant member ID/role/name checked; private conversation writes remained scoped despite forged body/query identity; timezone saved/reloaded, invalid timezone returned400 without overwriting prior setting; logout expired cookies. These fixtures were created pre-approved via the dev administration API, so invitation/email-confirmation/approval UI is NOT covered. No model calls or outgoing emails/messages. Browser background writes other than authentication were blocked.

Suspected issue triaged as intended: the initial test expected rep GET /api/privileges to return403. Source explicitly documents signed-in read access; actual200 is intended. Correct security assertion is POST, which returned403 for rep and400 for malformed admin input (no state written). The original failed assumption remains in account-pass-01.json; corrected actual results in account-pass-02.json. Do not classify this as a fixed product bug.

All three temporary auth users/member records across the preliminary and corrected passes were removed; conversation and timezone absence independently verified in account-cleanup-verified.json. Screenshots: account-bd_member.png and account-admin.png. No app code changes in this pass.

Next cursor: inactive accounts/role-change refresh, signed-out endpoint denial and controlled reset/approval pathways, then simultaneous chat persistence. Auth module remains partially covered.

### Pass 2 — revoked accounts and role refresh, 2026-09-11

Confirmed database defect: inactive-account refresh returned503. Actual dev access_requests constraint accepted rep/manager/admin but its default was sales; the checked-in original migration instead accepted sales/editor/admin. Both bd_member and sales probe writes failed23514. Read-only management SQL established the actual constraint/default, so the initial legacy-code workaround was discarded. Added and applied migration027 **only to verified dev project ebyoefeikqxxxxifgjxk**: accepts legacy and current role values, sets bd_member default, preserves all existing rows. Pending role display now normalizes legacy values. Production not touched; migration must accompany future deployment.

Confirmed adjacent stale-cookie defect: after schema correction, explicit403 access refresh and pending resolve redirect left freyr_access_v2 present. The protected-history probe returned503, not200, so this is NOT evidence of a successful unauthorized data read. Both authoritative denial routes now expire the stale grant; transient service failures preserve it. Actual Chrome cookie-context retest: inactive refresh403, cookie absent, protected history403; resolve307 to access-pending with cookie absent; signed-out history401. Admin-to-rep refresh returned200 and subsequent admin write403. Eight route regression cases passed (denied, signed-out, approved, outage across both routes), focused lint/typecheck passed.

Evidence: access-refresh-schema-failure.json (original503), access-refresh-before.json (stale cookies), access-refresh-after.json (fixed), tests/auth-access-refresh.test.mjs. All five real fixture users/member records and their approval requests from this pass were cleaned up and absence verified in each run. Two schema probes also cleaned up. No model calls or messages. Signed token TTL remains15minutes; this fix invalidates the current browser cookie after confirmed denial, not independently copied tokens.

Next: controlled password-reset and approval UI pathways without sending email, then simultaneous conversation persistence. Auth remains partially covered; full app audit still in progress.

### Pass 3 — password recovery, 2026-09-11

Verified runtime dev identity and live health. Created two unique auth-only fixtures across reproduction/retest; admin generateLink produced actual recovery OTP without sending email. Desktop Chrome completed actual OTP verification and password update; short-code and mismatched-password validation worked; old password rejected/new accepted. All non-read browser calls blocked except dev auth verify/user/token. Both auth fixtures deleted and absence verified. No messages or paid model calls.

Confirmed minor navigation defect: successful recovery button says Continue to sign in but default logout lands on /?signedOut=1. Normal logout landing is intentional (prior user requirement). Fixed only recovery button to /api/auth/logout?next=/login; real retest reached/login. Pending approval and configuration-error screens render; error retry preserves/agent destination. Four focused tests with delivery mocked verify invalid address rejection before delivery, neutral known/unknown success responses, provider failure, and signed-in reset uses verified email despite forged body. This does not test actual email delivery, mail templates, expiry/reuse, or admin approval workflow.

Evidence: password-recovery-before.json, password-recovery.json/png, tests/password-recovery.test.mjs. Focused lint passes. Next: simultaneous conversation persistence and agent history controls; revisit remaining account cases after broader coverage.

### Pass 4 — simultaneous conversation history, 2026-09-11

Verified runtime development identity and live health; actual confirmed preapproved fixture, session exchange and two separate desktop Chrome cookie contexts. No model calls needed: seeded own harmless conversation through actual API. Both contexts read same history. A saved a new chat, then B saved its own new chat from the original snapshot; API returned200 both times but durable history lost A. Next A deleted the history, B saved another change from its stale snapshot; deleted chats reappeared. BOTH confirmed, not inferred from source. Evidence: conversation-concurrency-before.json; guarded fixture runner conversation-concurrency.mjs. Auth/member/own conversation row deleted and absence verified.

Root cause: PUT blindly upserts entire history. AgentChat and AgentDock serialize saves within one component only; separate browsers/tabs remain uncoordinated. Both also merge browser cache on hydration, so deletion resurrection needs attention there, not only PUT. No fix applied this pass. Do not mark resolved based on single-tab serialization or timestamp-only merge, which cannot distinguish explicit deletion from unseen chats.

Priority next: atomic conditional database writes plus per-client baseline/delta for both agent surfaces. Preserve unrelated remote conversations; explicit deletion must not delete an unseen remote edit; same-chat conflicting edits must retain local draft and report conflict rather than silently choose a winner. Use a safe migration/compatible rollout if needed; no global history rewrite. Retest actual two-context cases, same-chat conflicts, first-row creation race, large-history keepalive, loading failure, deletion and account switching. Only then resume broad coverage.

### Pass 5 — conversation concurrency fix, 2026-09-11 local / Sep12 UTC

Implemented per-client baseline with three-way changes in both AgentChat and AgentDock. Durable writes compare exact catalog JSON in an atomic conditional update, retry disjoint changes, and insert first rows without blind upsert. Same-chat divergent edits return409 rather than overwrite. Missing baseline returns428 (old already-open clients must reload); failed history loads cannot upload an unverified snapshot. Saves check active identity before/after queued requests. Dock now exposes sync failure instead of swallowing it. Payload allowance includes baseline; size-aware keepalive remains.

Hydration uses acknowledged browser baseline to distinguish unchanged stale chats from edits. Unversioned browser cache is retained under scoped :recovery key when remote history is initialized, not blindly uploaded over it. This prevents migration/reload resurrection but recovery-copy UI is still missing; do not imply a complete offline-conflict recovery experience. Actual history is preserved, no shared history rewrite. Baselines persist after acknowledged saves. Existing mock/non-durable agentPrefs fallback is not yet concurrency hardened; current dev durable path is verified.

Actual dev fixture retests: independent tabs retain both new chats; stale saves do not resurrect deletions; same-chat conflict409; real Agent page reload with stale local cache leaves remotely deleted history empty. Two retest fixtures and exact conversation rows cleaned and absence verified. Evidence conversation-concurrency-after.json and conversation-history-fixed.png. Seven pure merge regressions passed via node --experimental-strip-types (tsx ESM named-import runner did not support this test format). Typecheck/focused lint passed after dependency fixes. No paid model calls or emails. No migration needed: existing JSONB conditional update worked on actual dev.

Next: first-row simultaneous insert race, offline/conflict recovery UI, browser dock regression, and recovery-copy discoverability. Then broaden offerings/FDL coverage. These are remaining adjacent cases; primary loss reproductions are fixed.

### Pass 6 — first-save race and large history, 2026-09-11 local

Verified dev/live runtime; initial pre-fixture attempt hit dev server restart, retried only after health recovered. Eight overlapping first writes returned200 or explicit409; retrying conflicted writes retained all eight. Old client without baseline428 left history intact. 120KB history initially saved/read, but subsequent real dock saves failed503: JSON equality filter serialized the entire old history into a URL. This adjacent bug was introduced by the previous conditional-save approach and caught by the size test.

Fixed with migration028, applied only to verified dev: service-role-only save_agent_history_if_unchanged RPC compares JSON inside SQL, sent in request body; SECURITY INVOKER, no anon/authenticated grants, scoped key prefix validation. Existing history rows untouched. Anonymous RPC call verified42501. Fresh fixture retest passed eight first writes/retries, old-client rejection, large history, and desktop dock user message + stubbed model response actually persisted above keepalive threshold. No model calls. Both fixtures and exact own history rows cleaned and absence verified. Lint/typecheck/diff checks passed.

Evidence history-large-before.json (failure), conversation-history-stress.json (pass), dock-history.png, history-rpc-permissions.json. Production deployment must include028; production not modified. Next offline/conflict recovery UI and scoped legacy recovery-copy discoverability, then broader offerings/FDL coverage. Bounded eight-request test is not a 2,000-user load certification.

### Pass 7 — explicit local-chat recovery, 2026-09-11 local

Added shared ConversationRecovery control to full agent and dock. Archived scoped local cache is discoverable; failed sync offers preserving unsynced chats as separate copies. Reads current account history, assigns fresh IDs to recoverable drafts, writes additively with current baseline, and only clears archive/replaces cache after acknowledgement. Failure retains archive and displays error. Exact unchanged chats already remote are excluded. Existing server originals are never replaced.

Actual desktop fixture recovery test passed: injected own scoped conflicting local draft, blocked history GET with503, error visible and archive retained; retry after unblocking saved recovered chat with new ID and preserved remote original text. No model calls/email. Three fixture attempts cleaned and absence verified; preliminary waits were sensitive to asynchronous navigation/dock visibility. Latest passed evidence history-recovery.json/png. Shared component lint/typecheck passed.

Coverage correction: earlier tests that opened/agent can be redirected by fixture module access to/offerings with shared dock active. They do establish shared history persistence/reload but must not be treated as proof of every full-page Agent control. Investigate fixture navigation separately. Recovery runner now targets/offerings explicitly on subsequent runs to avoid this ambiguity. Do not repeat paid agent queries for this UI test.

Next broaden to offerings/FDL features and permissions. Remaining agent caveats recorded: mock fallback concurrency and complete conflict retry UX; current durable real-data loss cases and additive recovery are verified.

### Pass 8 — FDL component lifecycle and role boundary, 2026-09-11 local

Verified dev/live runtime. Reviewed shared catalogue persistence before writes; used only newly created exact component IDs through application API, never replaced catalogue/snapshots. Two actual temporary account/component fixtures across basic lifecycle and role variant. Invalid create400. Admin create/edit persisted; marking two releases current normalized to one; feature mapping to nonexistent version stripped. Desktop component detail displayed saved name. Member downgrade + refreshed grant denied create/PATCH/delete403 and preserved fixture. Restored admin only for own cleanup. Each component deleted through API; entire pre-existing component list exactly equals before snapshot. Auth/member rows and own history rows cleanup verified. No files uploaded or emails/model calls. No app code changes needed this pass.

Evidence fdl-lifecycle.json, fdl-role-boundary.json, fdl-detail.png; fdl-before.json is the read-only before snapshot (never restored wholesale). Coverage only basic API lifecycle plus rendered detail, NOT every FDL control/version/file workflow. Next Offerings browser filters/detail/material access and isolated lifecycle, followed by remaining FDL controls and file destination review.

### Pass 9 — Offering lifecycle/search/material metadata, 2026-09-11 local

Verified dev/live runtime. Actual uniquely labelled offering fixture created with two link-only materials (example.com, never fetched; no storage writes). Blank name400; caller-supplied id/owners ignored; edit persisted. Admin response contains both client-facing and agent-only material. Downgraded same fixture account to regular member and refreshed grant: detail API only exposes client-facing metadata, as required. Restored admin for browser and cleanup. Desktop search finds saved offering, actual detail heading renders. Deleted exact offering through API; all pre-existing offerings deeply equal original read-only snapshot; fixture auth/member cleanup verified. No product bug found in these covered scenarios, no code change needed. No email/model calls/uploads.

Evidence offering-lifecycle.json, offering-detail.png, offerings-before.json (never restored wholesale). This does not cover all Offering filters, actual form submission, file bytes, or owner-specific permissions. Next material download/preview boundaries and storage destination review before any upload; then remaining controls/FDL release UI.

### Pass 10 — material access boundaries and admin consistency

Verified dev/live; read-only bucket metadata confirms private offering-materials bucket in dev. Completion also mirrors into external Freya.Docs, so no completion/uploads performed before archive isolation. Own fixture metadata-only paths: private download/preview/archive404 for non-owner member; foreign offering paths403; upload grant403. All guards returned before storage reads. Three fixtures across boundary run, bug reproduction and retest cleaned; pre-existing offering lists unchanged each time.

Confirmed admin bug: POST exposed two fixture materials, PATCH returned only one because redactAgentOnlyMaterials omitted the verified admin flag. Corrected GET/PATCH, owner-assignment responses, and agent visible manifests to consistently pass verified role===admin. Actual PATCH retest count2; member refusals still pass. No paid agent rerun; manifest changes typechecked/source reviewed. Typecheck/lint/diff passed. Existing privilege suite initially failed because conversation fixtures still used pre-baseline request schema; updated fixtures to explicit baselines, new payload ceiling and conditional RPC mock without weakening privacy assertions. All22 checks passed (2,000 fixtures are isolation, not load).

Evidence material-storage-review.json, material-access.json, material-admin-save-before.json, material-admin-save.json. Next dev-only actual bytes and cleanup; isolate external archive leg before completion. Continue broad coverage afterward.

### Pass 11 — actual development file bytes

Verified runtime dev/live and storage project before grant and write. Small unique text file uploaded through real signed upload grant using desktop Chrome fetch (CORS exercised). Registered fixture metadata through API without invoking completion/archive/indexing. Authorized download302 points to verified dev storage and returns exact bytes; native text preview's inline URL returns same bytes. Anonymous storage download denied. Exact storage object removed and listing absence verified, own offering removed, prior offerings unchanged, auth/member cleanup verified. No Docs mirror or model calls.

First fixture attempt uploaded successfully but test supplied absolute uploaded-file metadata URL; API correctly rejected400 since stored upload URLs must be app-relative. Corrected test metadata, not product code. Native text preview intentionally returns a URL rather than embedding bytes in JSON; tested that URL. Both attempt objects and accounts cleaned. Evidence material-bytes.json. No application changes this pass.

Full upload dialog completion remains untested because it launches external Freya.Docs mirroring; other formats/large file/range/owner cases remain. Broaden next to Leads, keeping file coverage partial rather than claiming all uploads verified.


### Pass 12 — live Agent identity and admin ownership, September 12

Priority reset to Agent first per user. Runtime /api/health confirmed healthy/dev/live, database reachable; local configuration confirms ebyoefeikqxxxxifgjxk. Old research tab was gone. One new Chrome audit tab 953422766 opened /agent successfully; browser control recovered. Existing signed-in Anir Suren account used for two read-only questions (chat persistence only); no account switching or fixtures this pass.

Q1: “Who am I, what role do I have, and which parts of the app can I access? Use my actual account information.” Agent identified Anir Suren/Workspace Admin, linked /team and supplied relevant dynamic follow-ups. Its full privilege enumeration has NOT been independently checked against every cell. Confirmed wrong claim: records not owned were view-only “admin or not.” Source lib/recordAccess.ts explicitly permits workspace admins to edit Customers/Opportunities regardless of team; lib/appManual.ts contained an incorrect blanket ownership restriction.

Corrected shared guide with admin exception, non-admin team gates, unassigned-record fallback and workflow-specific caveat. Fresh Chrome chat Q2: “I'm a workspace admin. Can I edit a customer or opportunity that I don't own? Explain the actual access rule.” Retest correctly states admin can edit any Customers/Opportunities record irrespective of ownership and distinguishes non-admin team/module checks. Dynamic follow-ups changed. This verifies answer correction, not actual write permissions or all-role coverage. No paid scraper calls, two live agent answers; precise model usage not yet reconciled.

Manual tests initially could not load named TS export under the current tsx/CommonJS harness; switched test import to createRequire, consistent with other tests. Both manual tests pass. Typecheck and whitespace checks pass. Next: follow personal starred/owned queries, verify actual links and DB facts, then isolated rep/manager/restricted account variants. Retain one audit tab for continuation; do not touch user's unrelated tabs or sign them out globally.


### Pass 13 — personal company lists, links and zero-count filters, September 12

Verified dev/live health and configured dev project. Continued existing Anir account in Chrome tab953422766; second audit tab953422767 compared Customer and Competitor Intelligence. No user records changed besides two audit chats. Read exact user's bookmark row and normalized tracking catalogue in dev: 76 tracked, 35 customers, 41 competitors, zero stars. Saved read-only ground truth in .local-backups/full-app-audit/personal-lists-pass13.json and tracking-pass13.json.

Confirmed model answer error: gave total76 but group breakdown34/42, despite UI35/41. Added full-list trackedByGroup counts before pagination in read_workspace personal data; regression covers split counts on both pages of76 results. Fresh Chrome question now correctly answers76/35/41/0 and renders corresponding chart. Eight workspace tests and typecheck pass. Actual Sitero answer link clicked, reached /market-intel/sitero with Sitero heading/logo and briefing. Clicked Market Expansion0: selected successfully, honest empty-filter message appears. No collection triggered manually.

Remaining confirmed explanation issue: agent says starring does not add to My list, but bookmark behavior automatically adds it. Added explicit listRules to tool data; initial retest still misstated this, so corrected shared appManual too. This last guide change still needs a fresh Chrome retest; do NOT call it verified. Personal company list counts and Sitero link are verified; entire emitted76-link list is not. No new role accounts yet. Two live answers, exact model charges still unreconciled; no paid scraper invocation. Next cursor: retest starring rule, then owned deals/leads and isolated role variants without signing existing user out.


### Pass 14 — starring rule, personal ownership and direct deal links, September 12

Dev/live health and exact development host verified. Single retained Chrome audit tab953422766, existing admin account; no fixture/account/business-record changes. Five live agent questions (starring reproduction, exact fresh retest, owned records, direct link, confidence), no manual scraper runs. Model charges not yet reconciled.

Starring retest initially still wrong. Found contradictory main prompt in app/api/agent/converse/route.ts saying actions independent. Corrected it to match bookmark actions. Exact question repeated in new chat now correctly explains star adds to My list, unstar leaves tracked, removing clears both. This supersedes Pass13 pending explanation status.

Read-only dev ground truth ownership-pass14.json: leads store has zero rows; one opportunity owned by Anir, Medical device GRI/opp-mt6d9mjl-urv8t, Submitted to client. Agent correctly identifies none/one. Confirmed navigation defect: read_workspace and EntityPills sent specific opportunities to list page. Both now emit encoded /opportunities/[id]. Fresh answer provided correct detail URL; clicked in Chrome, landed on Medical device GRI detail, customer J&J Medtech, status Submitted to client, Convert to contract button and Contracts0. No action submitted.

Following the link exposed confidence mismatch: agent100%, actual UI60%. read_workspace used raw confidence while UI uses opportunityConfidence (weighted line values). Switched agent to same helper. Regression fixture retains conflicting100 top-level/60 weighted line; passes with60. Fresh Chrome query now correctly answers60% and direct detail link. Nine workspace tests, typecheck and diff checks pass. Earlier combined bookmark/manual/workspace suite passed11; final workspace suite9 includes new direct-link/confidence regression. Initial regression failed because fixture line omitted its monetary value; corrected fixture, not helper.

Next: isolated rep/manager/restricted account browser tests and people/role answers; need verify cookie isolation before using second tab (127.0.0.1 hostname is a potential approach, not yet verified). Also observed Today history section below older months after navigation: suspected sorting bug, not yet reproduced under isolated fixture. Goal entity link /goals needs route verification (actual Goals route /performance). Do not claim all roles or all links covered. Retain one audit tab for next run.


### Pass 15 — actual Chrome rep login and personal isolation, September 12

Healthy dev/live runtime and exact dev host verified. Created one temporary confirmed dev auth/app_users BD Member account via admin API, no email. Exact IDs journalled in role-pass15-private.json (password removed after cleanup). Existing localhost admin tab953422766 remained signed in as Anir; second Chrome tab953422770 used 127.0.0.1:3006 and started signed out, proving separate hostname session behavior. Actual email/password UI sign-in succeeded. First landing was Offerings despite next=/agent; account menu shows Ready now selected. Agent sidebar navigation succeeded after dismissing first-user tour. Initial redirect remains unclassified pending release-mode investigation, not a claimed login failure.

Actual rep question: “Who am I and what is my role? Can I access Admin? Which companies have I starred, and which opportunities do I personally own?” Answer correctly named fixture/BD Member, denied Admin, returned0 tracked/0 starred/0 owned opportunities. Fresh history initially empty; no Anir history leaked. Exact fixture has no bookmarks or owned records. Direct /admin/members navigation redirected to Offerings; initial navigate timed out but follow-up observed successful denial. This is a browser page gate test, not comprehensive API bypass coverage.

Actual menu logout redirected to configured localhost landing showing Anir's separate existing session; revisiting127.0.0.1/agent redirected to login, confirming test-host session cleared and Anir remained signed in. Removed exact fixture history/app_users/auth account and independently verified all absent, removed stored password. Evidence role-pass15-evidence.json and role-pass15-cleanup.json. One live agent response, exact model charge not reconciled. No app code edits or scraper calls this pass. Next manager/restricted role variants, permitted people-role answers and forbidden-data requests. Maintain max2 tabs, no global signout.


### Pass 16 — manager identity and workspace people, September 12

Verified healthy dev/live and exact dev host. Created temporary BD Owner account, actual Chrome password login on127.0.0.1 succeeded, skipped first-user tour, Agent initially empty history. First live query correctly identified own role and Admin restriction but could not answer Anir's role despite permitted Team directory access. Confirmed missing tool capability. Added permission-gated read_workspace team module backed by current workspace directory, active members only, exposing id/name/workspaceRole/Team link without private profiles/emails/invitations. Main prompt now directs directory role questions to this tool rather than inferring from ownership.

Exact question repeated in fresh Chrome chat correctly identified BD Owner and Anir's admin role with /team link, and changed follow-ups. Ten workspace regression tests pass, including active-only/workspace scoped/private-field omission and denied module causes no directory read; typecheck passed. These tests do not substitute for remaining restricted-role browser coverage.

Attempted Team link click, but no navigation observed before browser inventory reported Mac locked and automatic unlock failed. Destination click verification remains pending; do not mark passed. Temporary manager history/member/auth all cleaned and absence verified, password removed. Evidence role-pass16-evidence.json and role-pass16-cleanup.json. Two live Agent responses, no scraper calls; total model bill unreconciled. Audit tabs953422766 (Anir) and953422772 (now deleted fixture) may remain; reuse/close second when unlocked before opening anything else. Next: unlock-dependent Team link/profile verification and restricted-role forbidden-data questions. Loop remains scheduled, no desktop unlock attempts or unrelated tab control.


### Pass 17 — queued goal link source reproduction while desktop locked

Health healthy/dev/live and configured dev project verified. CUA inventory still reports Mac locked; no browser tests performed, no repeated unlock workarounds. Continued independent queued link investigation. /goals is a valid alias redirecting to /performance, so this was NOT a404. Confirmed actual defect: named goal entity pill discards goal id and sends user to general list, whereas read_workspace correctly links /performance/goal/[id] and the detail page exists. Changed pill to same encoded specific goal route. Extended existing rendering regression to goal and deal detail links (including slash-containing IDs). All10 entity tests/typecheck/diff checks pass. Actual Chrome goal click remains pending; no claims about destination UI yet. No fixtures, paid calls or business data mutations this pass. Next after unlock: Team link/profile, specific goal link, restricted-account forbidden data scenarios. Preserve max2 audit tabs and use saved cursor.


### Pass 18 — history ordering reproduction while desktop locked

Dev/live healthy runtime and dev project verified. Desktop remains locked; browser cursor unchanged. Investigated prior actual Chrome observation (Today beneath old months). Account merge returns server insertion order; bucketByDay assumed already sorted. Targeted reproduction merged older server records plus fresh local chat: first bucket was July2026 instead of Today, matching observed failure. Changed bucket presentation to sort a copy newest-first before grouping, preserving stored order and merge conflict behavior. Exact failing regression now passes, typecheck/diff checks pass. No history or business records mutated, no fixtures/model calls. Browser reload and concurrent-tab presentation retest still pending unlock. Next: saved Team/goal link checks, history UI retest, restricted-role queries; do not mark these browser cases passed.
