# AGENTS.md — read this before touching anything

> **Environment correction verified Sep 11, 2026:** localhost:3006 and
> `freyrsales.dev.freyrapps.com` use Supabase project `ebyoefeikqxxxxifgjxk`
> (development). Production at `freyrsales.freyrapps.com` uses the separate
> project `kthwujrkgmpvrfcghqib`. Verified from all three running login pages'
> runtime configuration and the local database key's project claim. The older
> statements below that local/dev shares production are historical and stale.
> `.env.local` also contains `FREYR_PROD_*` migration credentials: these are
> not used by the running app and must not be used for dev tests. Dev is still
> shared data: use identified temporary fixtures and clean them up. The blanket
> Playwright-suite restriction remains until that suite has its own write guard.


**New session? Start here:** read §9 (current state + open queue), then run
`git log origin/main..HEAD --oneline` — the unpushed commits ARE the change
log, each message says what changed and why. §9 is the master tracker:
whoever finishes or starts work updates it in the same commit.

This is the agent handbook for **Freyr Sales Intelligence**. Codex, Claude
Code, and any other coding agent: everything you need that is NOT in the code
lives here. `CLAUDE.md` is the Claude-specific copy of the working rules — if
you change the rules, change both files.

**This is production software.** Freyr Solutions staff (Eeswar, Saras, Wajeed,
more coming) use the deployed app today. Suren, Freyr's CEO, reviews it
personally and judges pages at a glance. Anir owns the product and directs all
work; you build.

---

## 1. THE ONE WAY TO DESTROY PRODUCTION (it happened on Jul 30, 2026)

The local app uses the **development Supabase database**. `.env.local` also
contains explicitly prefixed production migration credentials and real
Freya.Docs credentials; never select those for development tests.

- A local server in **live mode** reads and writes the configured development
  database. Real is the default; Mock is an explicit browser session view.
- `PORT=3007` / `NEXT_DIST_DIR=.next-test` isolate the **build cache only** —
  NOT the database.
- On Jul 30 the Playwright suite, run the "safe" way, **overwrote the
  production offering catalogue** (25 real sales materials, owners, folders)
  and left rows literally named "Must not persist" and "Launch Biotech
  <epoch>" in prod. Recovery took hours.

**Therefore: DO NOT run the Playwright suite (`npx playwright test`) at all**
until someone builds a guard that points tests at a scratch database or stubs
persistence. No exceptions for "just one spec" — one spec caused the wipe.
Verify with `npx tsc --noEmit` + read-only page screenshots instead (§6).

Recovery artifacts from the incident live in `~/freyr-backups/`
(`prod-catalog-backup.json` = wiped state, `prod-catalog-RESTORED.json` =
what was written back, `deleted-test-customers.json`).

## 2. Deploying — a push to `main` IS a deploy

- `.github/workflows/deploy.yml` fires on every push to `main`: build → ECR →
  new ECS task definition (inherits live env verbatim) → roll ECS → verify the
  live SHA. ~5 minutes. It goes red and auto-rolls-back if `/api/health` fails.
- **Never push to `main` without Anir's explicit yes for that specific push.**
  One "deploy it" covers one push. Name what's in the push when asking.
- Working branch: `gh-push`. Remote `origin` = github.com/anirsuren/freyr-sales.
  (`azure` remote is legacy — not the deploy source.)
- Verify a deploy independently:
  `curl -s https://freyrsales.dev.freyrapps.com/api/health` →
  `version` must equal the pushed commit SHA; check `status`, `database`,
  `dataMode`.
- The git PAT **lacks workflow scope**: you cannot push edits to
  `.github/workflows/*` (GitHub rejects the push). Workflow edits happen via
  the GitHub web editor only.

## 3. Environment map

- **Production**: https://freyrsales.freyrapps.com (separate Supabase project).
- **Development**: https://freyrsales.dev.freyrapps.com (AWS ECS). Boots in real
  ("live") mode. Auth = Supabase; @freyrsolutions.com emails auto-join.
- **Anir's dev server**: `PORT=3001 npm run dev` (defaults to 3000 without
  PORT). This is his live view — treat it as shared. It usually runs in live
  mode, i.e. **writes real data**.
- Mode is **per browser session**: Real is always the default, and choosing
  Mock follows that browser through navigation/reload without changing the
  workspace or anybody else's view. Flip the current session:
  `curl -X POST localhost:3001/api/settings/data-mode -H 'Content-Type: application/json' -d '{"mode":"live"}'`
- Mock mode = seeded demo world (Helix Biologics etc.), safe sandbox.
  Live mode = the real catalogue from Supabase.
- **Gotcha:** `/api/offerings` GET serves the process's memoised store and
  never refreshes. To verify a data change, render a PAGE (e.g.
  `/offerings/of-001`) — pages call `initializeLiveOfferings()` which
  re-reads within ~5s. A wedged process may hold stale data; restarting the
  dev server is the standing remedy (then re-flip mode — see fresh-boot
  default above).
- Unstyled pages / 503s on `_next/static/*` = corrupted `.next`:
  `rm -rf .next` and restart.

## 4. Data model — the parts that bite

- `offering_catalog_state` (Supabase) is a **singleton-document store**, key
  rows:
  - `default` — the ENTIRE offering catalogue as one JSON document
    (offerings, materials, folders, owners, master lists). One bad write here
    nukes everything; back it up before writing.
  - `material-text` — extracted text of every uploaded file, keyed by
    `docsPath` (`of-001/<epoch>-<filename>`). **This is the only index of
    what's in file storage.**
  - `docs-storage-config`, legacy `workspace-data-mode` (ignored by current
    mode selection), `anthropic-config`,
    per-user rows (`profile-photo:*`, `user-timezone:*`).
- **Freya.Docs** (api.freyafusion.com/docs-storage, bucket/module
  `freyrsales`): upload via token → presign → PUT → complete; download via
  per-click presign. **No delete or list endpoints** — `docsPath` is the
  index; losing a docsPath orphans the file.
- Sales-material downloads stream through
  `/api/offerings/[id]/materials/download` (`?view=1` = inline, forwards
  Range headers so video seeking works).
- Relational tables: `customers`, `contacts` (cascade on customer delete),
  `pitch_sessions` and `interactions` (**NO cascade** — delete children
  first), `app_users` (column is `app_role`: admin | editor | sales).
- Live mode **strips demo materials** (ids `m-0xx`) at render;
  `restoreDemoMaterials()` deliberately heals them back into the stored row.
  Don't "clean" them from the row — mock mode uses them.
- Release gating: `lib/release.ts`. The deployment release flag applies equally
  to Mock and Real; role/module permissions still apply in both modes.


## 5. Working rules (non-negotiable, from Anir)

1. **Scope belongs to Anir.** "Audit/check/look at X" = investigate and
   REPORT, ranked, with file:line — then stop. Never bundle "found it" with
   "fixed and shipped it."
2. **Never change permissions, auth, visibility, or existing user-facing
   behaviour on your own judgement** — report instead, even when you're sure.
3. **A push to main needs a yes for that push** (§2).
4. **Honesty:** say whether something is verified-by-running or only
   compiled/read. Report test reds as they are. Never invent data about real
   people (no guessed phone numbers/emails/LinkedIn). If you broke something,
   say so in the first line.
5. **Mid-conversation messages fold into the queue** — acknowledge, keep
   going, drop nothing.
6. **Lead with the TLDR**, plain English, fix rather than present options.
   Anir is technical-adjacent; Suren is not — UI copy must be jargon-free.
7. Don't burn the Anthropic API key on bulk agent sweeps (it's Anir's paid
   key). Test agent features with 2–5 questions.

## 6. How to verify work (given §1's test ban)

- `npx tsc --noEmit` — must be clean.
- Read-only Playwright **scripts** (not the suite) against the already-running
  :3001 for screenshots: launch chromium, goto page, click, screenshot.
  Import from `@playwright/test`. Never write data; never start extra servers
  with the real env.
- Screenshot UI changes and show Anir BEFORE full verification/deploy — he
  signs off visually first (standing workflow).
- curl for APIs; check prod only via `/api/health` and real page loads.

## 7. Design system — Suren's non-negotiables

- **No gray** identity elements; every category/status chip and every
  dropdown option carries **color + icon**. Use `ColorSelect`
  (components/ui/ColorSelect.tsx) for categoricals and `PeopleSelect`
  (headshot per person, optional `sub` line) for people. Native `<select>` is
  banned (sweep in progress — see §9).
- Red/green/yellow are **reserved for status** — never identity/brand hues.
- **No fake data in real mode, ever.** Empty ≠ hidden: pages render their
  full real structure with honest zeros and a one-line explanation (see the
  offering Reports tab / empty Customers module for the pattern).
- Glance test: every page shows real stats/graphs without clicking;
  drill-downs must ADD information, not restate.
- Charts: fill the card width, units visible at rest, tooltips portal
  (never clipped), hover shows the who/what breakdown, no "…" truncation,
  donut legends beside the ring, hover popovers scale UP on the card. A chart
  popup may open only while the pointer is on the painted bar, point, slice or
  heat-map cell; empty plot space, labels, legend rows and the popup itself are
  never hover targets.
- Every company mention gets its logo, every person their headshot
  (CompanyLogo / Avatar resolve by name). Countries get flags.
- Charts architecture: server components must not pass functions to client
  charts — `format` is a string kind. Palette in components/charts/palette.ts.
- Dark mode exists (`.dark` class + `freyr.theme` localStorage): SVG text
  fills must use `fill-current` + text tokens, never hardcoded hex.

## 8. People

- **Anir Suren** — builds everything, directs agents. Admin
  (anir.s@freyrsolutions.com, app_users id 6d64db4f-…).
- **Eswar Subramanian** — Freyr, admin, uploads sales materials
  (eswar.subramanian@…, id 0657b916-…).
- **Saras Verma** — Freyr tech coordinator (sales role). Announced the
  Customers module as the next build.
- **Wajeed / Sudhir / Hemanth** — Freyr stakeholders (folders list, roadmap
  gating, offering-owner process).
- **Suren** — CEO. Vision: agentic platform; three releases he named on
  Jul 30: (1) AI answering from all offering content, (2) roadmap/version
  tab with sales-safe gating, (3) customer × offering heat map over ~100
  named accounts imported from KonnectCo without disrupting it.

## 9. Current state — Jul 31, 2026

- **Sep 19 collapsed sidebar brand spacing:** The collapsed 72px sidebar now
  centers the Freyr mark with real side padding and stacks the DEV environment
  badge beneath it. The badge no longer forces the logo against the viewport
  edge. Normal desktop pages also gain a 24px workspace gutter beside the
  compact rail while retaining the established 16px gutter beside the full
  sidebar. Local only, not deployed.

- **Sep 19 Lead source and status icons:** Lead source and status pickers now
  use channel-specific and workflow-specific icons instead of generic colour
  dots. The same icon language carries through the Leads filters, grouped
  sections, table badges, and expanded lead details. Local only, not deployed.

- **Sep 18 Offering availability follow-up:** The Offering Overview availability
  section again shows the optional owner-authored Availability comments for
  every offering. The editor uses a short multiline field for the same stored
  value. Current version is omitted when the offering type is Freyr Services
  or Freyr AI Native Services, where a product version does not apply. Local
  only, not deployed.

- **Sep 17 interaction and Solutioning consistency pass:** Solutioning detail
  timelines keep a usable minimum viewport without crushing Owner or Where it
  stands, place comment creation in the header, normalize impossible legacy
  pickup dates, and make request previews count the same customer/analysis
  documents exposed by the full record. Shared and custom column charts lift
  each value label with its painted bar while retaining bar-only hover targets.
  Market Intel management gives its four scopes distinct semantic colours and
  keeps the sticky save strip full-width. The top Freyr AI button now closes the
  open dock as well as opening it. Performance goal rows are compact again.
  TypeScript and focused lint pass; browser screenshots verified the timeline,
  customer filters/save strip, and AI toggle. Local only, not deployed.

- **Sep 17 chart hit targets:** Shared bar, area, line, donut, sparkline and
  movement charts now open their popup only from the painted data mark. Bar
  columns no longer use their full-height empty track as a hit target, chart
  popups are display-only, and donut legend rows no longer open the slice
  popup. Custom funnel, forecast, risk, accrual, lead-source and roster graphs
  follow the same rule. TypeScript passes. Local only, not deployed.

- **Sep 17 Solutioning stakeholder transcript:** Opportunity-level Solutioning
  now uses the compact request-only table with search and All / Submissions /
  Meetings / Presentations filtering; its redundant link back to the main room
  is gone. Request creation shows request date, customer POC and document
  upload alongside the existing request fields. Request editing now includes
  the title, brief, subtype, priority and relevant dates/attendees. Only BD
  Members, BD Owners and Admin may create or edit requests. The main queue has
  a visible assigned/unassigned filter. Solutioning Owners and Admin can assign
  or transfer a request from the list or detail page; an existing assignment
  cannot be cleared without choosing a replacement. Solutioning Members see
  only records assigned to them. TypeScript, focused permission/tour tests and
  changed-file lint pass (pre-existing warnings remain). Local only, not
  deployed.

- **Sep 17 Market Intel mock charts:** Replaced the shared modulo-based sample
  schedule that gave every company the same sawtooth and final spike. Mock
  posts, news, website items and people posts now use stable company-specific
  timing, varied momentum and occasional event clusters. The company-details
  rail now pins its always-visible Hide control, places competitor mentions
  directly under Signals and gives its independently scrolling body enough
  bottom clearance to reveal the last card. Company and people posts now keep
  bookmark, admin delete and LinkedIn/open actions together in a permanent
  top-right control group, and post bookmarks persist and render in Saved.
  The New FDL component dialog now follows the Solutioning request visual
  structure with a purpose panel, descriptive type cards, explicit selected
  state and a separate action footer. Focused tests, TypeScript, lint and the
  production build pass. Local only, not deployed.

- **Sep 16 Solutioning requirements follow-up:** Owner-only workstream assignment
  now bypasses the unrelated request-edit gate, while admin bypasses shared
  module read/create/edit/delete restrictions. Request create/edit enforces BD
  roles (admin exempt). New-request due date and brief validation runs before
  persistence; inherited deliverables retain historical dates. Solutioning adds
  BD member/preparer/opportunity/due filters and customer/owner/status grouping
  in table and split views. Meetings adds customer/owner/type/date filters.
  TypeScript and 14 isolated permission/validation/tour checks pass. No browser
  verification (user prohibited computer use). Local only, not deployed.

- **Sep 15 Solutioning request drill-down:** Expanded request rows keep Latest
  Activity as the capped right-hand timeline. The left side now leads with the
  request brief, shows customer/opportunity/contact context in one compact
  strip, and renders documents as a full-width, internally scrolling table with
  stage, version, owner, added date, hover preview and open action. Build and
  typecheck pass; approved for development and production deployment.

- **Sep 15 Lead journey side rail:** Expanded lead rows now place Lead Journey
  in a dedicated right-hand column using the same compact vertical activity
  anatomy as Solutioning: small event marks, a thin spine, concise metadata and
  a capped internal scroll. It no longer consumes a full-width row. Build and
  typecheck pass; approved for development and production deployment.

- **Sep 15 People Performance folding:** Waiting for verification, sent back
  to the selected person, sent back by the manager, and Logged results now use
  full-heading dropdown targets rather than tiny chevron-only controls. Each
  section remembers its open/closed state in the browser. Local only; not
  deployed.

- **Sep 15 Lead journey timeline:** Replaced the three status-card layout with
  the same vertical spine, milestone marks and compact event anatomy used by
  Solution Requests. Removed the duplicate current-status pill and enclosing
  timeline box; unresolved outcomes use a dashed continuation. Local only;
  not deployed.

- **Sep 15 Leads analytics date chip:** Removed the redundant "Through [date]"
  chip from the shared Leads analytics header. The chart axis and its
  "last 12 weeks" label already communicate the reporting window. Local only;
  not deployed.

- **Sep 15 Mock/Real parity:** Market Intel list/detail/manage routes now read
  sample records through the real feed schema and shared UI: tabs, search,
  filters, tracking, bookmarks and moderation. Mock provider actions stay local.
  Removed mode-only navigation/action gates and redundant preview notices;
  enabled isolated persisted mock edits for opportunities, activity master and
  offering competition. Analytics/Forecast/Recordings retain their workspace
  shells in Real mode with empty data; forecasts no longer invent Real rep deals.
  Verification: isolated data/config tests + TypeScript, no browser verification,
  provider calls or production writes. Details: `docs/mock-real-parity-audit.md`.
  Deployment remains on hold.

- **Sep 15 shared Real Market Intel (authorized both ways):** Dedicated server-only
  Market Intel connection settings now route tracking, feeds, bookmarks, refresh
  locks/checkpoints and accounting to a shared database. Mock tracking stays local;
  auth/CRM connections are unchanged. Cross-database bookmark members match by
  active workspace membership and email. Production remains the sole automatic
  daily collector. Setup is documented in `docs/shared-market-intel.md`; settings
  have NOT been activated and nothing deployed. Four isolated configuration tests
  pass and typecheck is clean; no provider or production writes used for testing.

- **Sep 15 Market Intel header fit:** The three Intelligence tabs remain one
  unbroken strip; header actions move together below when space is limited.
  Refresh chips show time for today, yesterday for the previous calendar day,
  and date only for older updates. Exact timestamps remain in the panel.
  Local only; not deployed.

- **Sep 15 briefing sidebar top signals:** A shared Top signals card below
  competitors ranks the five most frequent specific signals from existing
  briefing counts. Rows toggle the signal filter and select all sources so
  their updates are visible. Mock and Real use the same card; no new API work.
  Local only; not deployed.

- **Sep 15 Signals scroll direction:** The shared Market Intel Signals row
  uses native horizontal scrolling and no longer converts vertical wheel
  input into sideways chip movement. Vertical gestures scroll the page in
  both Mock and Real briefings. Local only; not deployed.

- **Sep 15 lead source drill-down:** Every Source performance row on Leads is
  now a full clickable target. Its source and volume bar share one column, while
  Total leads and Became opportunities are separate, consistently left-aligned
  facts with the conversion rate shown beside the latter. It opens a large searchable dialog with source totals plus each
  person, company, status, owner, request, intake time, last movement, and links
  to matched customers, owners, and converted opportunities. The dialog uses
  the same underlying records in Mock and Real mode. Local only; not deployed.

- **Sep 15 immediate hover dismissal:** Rich hover cards and chart record tips
  no longer linger for 350ms after the pointer leaves. The shared close delay
  is zero; closure uses one browser-task handoff so moving directly onto an
  interactive popup can still keep it open, while moving elsewhere dismisses
  it visually immediately. Local only; not deployed.

- **Sep 15 meeting picker creation and deduplication:** The meeting editor's
  customer picker collapses duplicate account records by normalized name while
  preserving the selected id and combining linked deal/contact context. An
  always-visible Add customer action opens the complete customer form in the
  current data mode. Customer contacts and deal shells may still be created in
  context. Internal presenters and attendees remain directory-only because a
  team member must be invited with an email and workspace access; the meeting
  form never invents one as a free-text name. The same editor serves Mock and
  Real. Local only; not deployed.

- **Sep 15 customer opportunity table:** The Customer 360 Opportunities band
  gives the opportunity name less width and up to two lines, reserving enough
  room for one-line Stage and Expected to sign values. Stage and Status now
  use their lifecycle color plus distinct icons; status may wrap inside its
  controlled column. Local only; not deployed.

- **Sep 15 FDL company overflow dialog:** The overlapping customer marks used
  on component versions and feature rows keep their quick hover previews, but
  clicking `+N` now opens a fixed, searchable dialog with every company in a
  tidy two-column list. Every logo and dialog row links to that customer's
  Digital components tab. Local only; not deployed.

- **Sep 15 Market Intel daily spending gate:** Automatic production collection
  now has one coordinated 06:00 UTC window per day. News and website work run
  inside that window, a unique database claim prevents another ECS instance or
  restart from opening a second window that UTC day, and page views no longer
  schedule paid refreshes. The former 20-minute and 30-minute polling timers
  are removed. Focused scheduler tests and TypeScript pass. Authorized for
  immediate development and production deployment.

- **Sep 14 released-surface identity and navigation sweep:** The same entity
  treatment now applies across the pages available in Real mode. Contract
  owners, goal-credit recipients and actual update authors show their own
  Avatar and link to the rep profile; the footer no longer places an owner’s
  face beside a different updater’s name. Customer-list owner previews,
  opportunity meeting owners and child solutioning owners now carry the same
  avatar/profile treatment. Goal claims show the customer logo and link to the
  exact customer when an id exists. Missing portraits fall back to initials;
  another person’s face is never borrowed. The stale Aug 25 Future-level test
  now reflects Suren’s Sep 1 removal of Future as an opportunity level.
  Typecheck, 56 focused business-rule tests and the production build pass.
  Targeted lint has no errors (existing warnings remain). Per Anir’s request,
  no browser automation or screenshot pass was run. Local, not deployed.

- **Sep 14 Suren product sequence and account-planning definition:** Finish
  Customers, Opportunities, Offerings, and Solutioning (including the request
  flow and the connections among those records) for production first. Finalize
  Goal Tracking next. Build Account Planning after that. Leads is a lower
  priority and can come near the end. A production release is ready only when
  every item Anir explicitly requested for that release is complete. Account
  Planning is the plan assigned to a sales rep for an account: which offerings
  to sell, which strategies to pitch, which exact documents to use, how much
  revenue to win and by when, the key contacts, the leadership relationships
  to develop, and the people who can introduce those contacts. For the top 50
  accounts, including existing customers and target customers, it must show who
  to approach, the contact/reporting structure, and the senior decision-maker
  the rep needs to reach.

- **Sep 14 Suren roadmap continuation:** Account Planning is not a separate
  module or page in the main navigation. Every customer gets its account plan
  inside that customer's page. Ship the clean transactional foundation first
  so it can replace KonnectCo, then gather feedback and add sophistication,
  governance, and AI on top of trustworthy data. The longer-term product must
  become sales intelligence: recommend what to pitch to a specific contact;
  generate the presentation, proposal, and supporting materials for that
  person; and recommend the best customer accounts for an offering. Use Freyr
  Fusion's existing AI-native platform capabilities rather than rebuilding
  them in isolation. Add language capabilities later for teams such as Korea,
  while English remains the primary language. A later mobile experience should
  let a rep record a meeting, generate notes, extract outcomes, and create or
  update opportunities automatically from the transcript. Suren's sequence is
  base version production-ready → rollout → feedback from customers and Freyr
  users → governed iteration across the 1–2 year roadmap.

- **Sep 14 deviations attention layout:** The Mock-mode invalid/deviated
  records section now opens with a compact diagnostic heading and separates
  record problems from owner rankings into two quiet summary bands. “Deviating
  most” is now the clearer “Most deviations,” and the visible-result count has
  its own stable position. Local change, not deployed.

- **Sep 14 lead-dialog validation placement:** New/Edit lead validation now
  lives in the right-aligned footer action row, immediately left of Cancel,
  instead of occupying a separate line above the buttons. The message can wrap
  while both actions keep their size. Local change, not deployed.

- **Sep 14 durable company-logo repair:** LinkedIn company logos now use the
  same non-expiring Supabase mirror as profile photos, with browser-like image
  request headers. A failed mirror clears the temporary CDN address so the
  official website fallback can run instead of treating an expired 403 URL as
  a valid logo. Official-site discovery now tries `www` when the bare domain
  has no DNS record and accepts an explicitly labelled header brand logo.
  CompanyLogo falls back to initials if any stored image still fails at render
  time. Alkem production data was backed up and repaired with its official-site
  logo; the stored Supabase image returns 200 and its malformed LinkedIn slug
  was corrected. Code is local and not deployed.

- **Sep 13 Market Intel cadence and environment isolation:** Development keeps
  its full QA database but recurring news, website and LinkedIn collection is
  fail-closed on the dev/localhost hostnames. Manual company onboarding and
  authenticated admin refreshes remain available. The production promotion
  script explicitly enables recurring collection. Source freshness now uses a
  rolling 24-hour window instead of the shared 06:00 UTC boundary, and the
  dashboard refresh clock derives from its visible companies rather than
  unrelated M&A/feed metadata. Production was audited read-only: all 76 active
  companies (34 customers, 42 competitors) have renderable summaries; 21 are
  currently more than 24 hours stale, confirming the existing throughput lag.
  Typecheck, targeted cadence/environment tests and production build pass.

- **Sep12 Premier Research AI website test:** Generic Firecrawl URL inventory →
  AI ID selection → exact-page scrape/date check is wired into the shared website
  collector. Chrome submission completed; repaired feed has 147 posts, 4 external
  articles and 23 website updates. All seven current blog articles manually
  checked on the official page are visible in Chrome. 40 focused tests/typecheck
  pass. Initial run still took ~15 minutes; updated reader-pool latency and the
  daily scheduler remain unverified. Details and limitations in
  `docs/qa/market-intel-onboarding-2026-09-12.md`. No deployment.

- **Sep12 dashboard story links:** LiveCompanyCard now adds Read/external links
  to its ticker and all expanded top stories. HoverExpandCard has an opt-in
  sibling navigation link so article anchors are not nested inside a card
  anchor. Typecheck passes; browser audit tab was closed before retest.

- **Sep12 refresh popup layering:** NextRefresh now portals its opaque panel
  to document.body with shared floating-menu positioning, escaping the animated
  company header stacking context. Outside click/Escape/scroll/resize dismiss
  it. Opened in Chrome on Pfizer; typecheck passes. Audit tab953422837.

- **Sep12 Pfizer Chrome submission/retry:** Fixed company identity mistakenly
  taken from a reshared person's post; company slug now selects its own author.
  Fixed initial classification budget to cover the collected items. Saved
  Pfizer pfizer-8d31826f in dev: 8 posts, 210 news, 13 website items, zero pending
  after processing its existing backlog. Clearer shimmer and consistent summary
  cards; typecheck and four targeted tests pass. See
  docs/pfizer-tracking-check-2026-09-12.md for evidence and limits. Initial
  collection took about ten minutes; not exhaustive-source certification.
  Server 3006 session98908, audit Chrome tab953422825. Loop remains PAUSED.

- **Sep12 Chrome 50-question audit completed:** See docs/agent-50-query-audit.md
  for the 50 scenarios, fixes/retests and explicit limits. All 48 targeted
  regressions and typecheck pass. Two temporary accounts and all 15 business
  fixtures removed and verified; temporary module restriction restored.
  Only administrator Chrome audit tab 953422793 remains. Server on 3006 is
  running (session 47469); recurring loop PAUSED. Two GSK portraits unavailable
  upstream; legacy news without original source evidence remains unverified.
  This is not a 2,000-user load certification or blanket all-features pass.


- **Sep12 audit Pass18:** Prior Today-below-old-months observation reproduced
  from server insertion order. bucketByDay now sorts copy newest-first;
  failing regression passes, typecheck passes. Chrome retest pending locked
  Mac along with Team/goal links and restricted roles. No fixture mutations.

- **Sep12 audit Pass17:** Locked desktop persists. Goal pill discarded record
  id and opened general list; now exact encoded /performance/goal/[id]. Ten
  entity/rendering tests and typecheck pass. Chrome goal/Team link checks and
  restricted-role tests remain pending unlock; no active fixtures.

- **Sep12 audit Pass16:** Manager Agent could not read workspace people roles.
  Added permission-gated Team directory tool; fresh Chrome answer correctly
  identifies Anir as admin. Ten workspace tests/typecheck pass. Fixture cleaned.
  Mac locked during Team link check, so destination remains pending. Next
  restricted-role browser tests after unlock; max tabs953422766/953422772.

- **Sep12 audit Pass15:** Actual Chrome temporary BD Member login, role/list
  answer, private history, direct Admin-page denial and logout passed. Used
  127.0.0.1:3006 isolated from localhost admin cookies. Fixture account/history
  cleaned and absence verified. Next manager/restricted accounts and people
  queries. Keep only audit tab953422766; create second role tab as needed.

- **Sep12 audit Pass14:** Agent starring explanation now verified after fixing
  conflicting main prompt. Specific opportunity links fixed in tool/pills and
  clicked in Chrome. Agent confidence now uses same weighted helper as UI;
  Medical device GRI60% retested (was wrongly100%). Nine workspace tests and
  typecheck pass. Next isolated roles/people, cookie-isolation verification;
  suspected history ordering/goal-link issues queued. Single tab953422766.

- **Sep 12 full-app audit restarted every two minutes, Agent first:** Chrome
  control recovered in audit tab 953422766. Actual identity question exposed
  wrong admin ownership guidance. Corrected appManual; fresh Chrome answer now
  accurately allows admin Customer/Opportunity edits regardless of ownership.
  Pass13 fixed personal counts (35 customers/41 competitors), Chrome verified
  and Sitero link opened. Eight workspace tests/typecheck pass. Next fresh
  starring-rule retest after guide edit, owned queries, then isolated roles. See full-app-audit-loop Pass12.
  Earlier browser-disconnected notes below are superseded.

- **Sep 12 Market Intel retest in progress:** Sitero was saved and browser-checked
  against 18 publisher references (17 grouped articles), six official items,
  73 in-window LinkedIn activities. Rimsys is NOT passed or replaced: the latest
  full replay has 19 news, 25 unique posts, two site items, zero pending; the
  expanded browser reference inventory has 22 publisher URLs. Later discovery
  recovers KnowledgeNile and Rutland but still varies between other publishers.
  User authorized $10 instead of $1 paid-search default; atomic accounting and
  caching remain. Latest search ledger $1.2041691 spent + $0.03 reserved; this
  is not all-provider billing. Generic archive pagination, redirect metadata,
  source-body validation and provider-failure fallback are implemented.
  Secondary source search now uses bounded GPT-5-mini reasoning (two calls),
  actual tool URLs only. Google News actor is a primary-search failure fallback.
  Two diagnostic runs were stopped after high CPU/memory; found unbounded HTML
  buffering including PDFs, now reject binary and stream-limit HTML to 3MB.
  Regression passes. All 69 focused tests and typecheck pass. Safe-reader
  discovery completed: 33 pre-verification candidates, zero incremental search
  cost (cache), incomplete flag true. Two known publishers still missing:
  News-Press NOW and MidFlorida; FinancialContent has an alternate article URL.
  No audit process remains running.
  Chrome tab control repeatedly returns "Debugger unattached" even after session
  reset; no new browser verification can be claimed. One existing audit tab,
  no desktop control or unrelated tabs. See docs/market-intel-retest-2026-09-12.md.
  No production sign-off, no feed replacement or deployment.

- **Sep 11 company-source replay:** shared discovery, archive pagination,
  publication-date extraction, article URLs, news eligibility and captionless
  LinkedIn handling improved. Reference matches: Veranex 18/18 official + 1/1
  publisher; Rimsys 2/2 official + 5/5 publishers; Sitero 6/6 official + 5/6
  publishers. Sitero's Business Times Journal copy remains an automatic-discovery
  miss; do not claim exhaustive coverage. No expected URLs were fed into the
  collector. 35 focused Node checks + typecheck passed. See
  `docs/company-tracking-source-audit-2026-09-11.md` for methodology and limits.

- **Sep 11 background onboarding replaces the modal progress flow:** user
  rejected keeping the modal open during collection. POST now reserves a
  company + durable onboarding state, follows it, returns 202 and closes the
  modal. PendingCompanyCard shows its name and skeleton on the dashboard;
  persisted failed jobs have Retry. Leases/heartbeats protect the worker and
  expired leases recover after process restarts. Refresh/reopening tabs reads
  persisted state; pending pages poll every 5s. Health and Market Intel pages
  arm the worker. No fixture companies were added to the real catalogue.
  All recurring sources now share a **06:00 UTC daily cycle**, including
  paid-search cache expiry; adding a company does not move that cycle.
  23 isolated checks passed, including concurrent add/claim, independent
  reads, expired-lease recovery, failure/retry and shared scheduling. Guarded
  browser fixture checks passed for Add dismissal, duplicates, pending/error
  cards and mobile layout; the temporary preview route was removed.
  Code remains local. Local server 3006 uses `.next-local-3006`; log is
  `/tmp/freyr-sales-3006.log` (restarted after its prior compiler stalled).

- **Sep 11 temporary removal requested by Anir:** Integras, Cure Media,
  Lavida Consultancy and FDS Basics removed from the live catalogue, feed
  rows and personal lists; verified absent. 189 companies remain. Preserved
  restoration data in `market-intel-archive:2026-09-11:four-unverified` and
  `.local-backups/four-unverified-removal/archive.json`. All four ids are in
  removedSeeds so they do not reappear. Do not restore until requested.

- **Sep 11 full Market Intel audit, local code; verified data repairs applied:**
  audited all 193 companies (34 customers/159 competitors), all 68 original
  LinkedIn links, replacements and 65 official-footer candidates in Chrome.
  Added 64 verified LinkedIn links, corrected 14 links, CuraTeQ's domain and
  Gedeon Richter's name with before/after backups and conditional writes.
  Tracking selections and people preserved. 132 companies now have LinkedIn
  links; 61 do not, with Amplexor/Sparta/DDi links additionally unavailable.
  Direct+fallback official updates found for 135 companies; zero results do
  not establish no news exists. Recorded Perplexity audit cost $0.68828;
  four real Apify pagination calls returned 69 items (estimated $0.345).
  Added actual streamed onboarding stages, partial/save-failure handling,
  paginated LinkedIn collection, per-source daily scheduling and bounded
  collection phases. 21 isolated tests, 193-entry duplicate replay, tsc and
  guarded mobile/desktop UI checks passed. No deployment. See
  `docs/market-intel-full-audit-2026-09-11.md` for limits and full results.
  User said to leave unresolved identities unverified, not request more
  information: Integras, Cure Media, Lavida Consultancy, FDS Basics remain
  unverified; possible matches are documented, not silently attached.

- **Sep 11 website-only tracking and spending follow-up, local only:**
  duplicate preflight disables Start tracking; server rejects duplicates.
  Direct website/RSS/sitemap collection and free Google News precede paid
  fallbacks. Ten website-only company tests returned outside news and
  official updates, with representative articles opened in Chrome. Added
  shared atomic refresh lock, 24-hour paid-query cache, per-purpose cost
  records, and a default $1/UTC-day Perplexity fallback cap. No companies
  added and no deployment. The cap applies to updated code, not old deployed
  clients. Details: `docs/market-intel-website-audit-2026-09-11.md`.

- **Sep 11 Market Intel local handoff:** full Manage pages with explicit
  Save/Discard, admin-only tracking status, daily collection, single-line
  source chips, company-logo and person-photo enrichment. Not deployed.
  Image audit: 189/193 company logos and 90/133 stored person photos; four
  company identities remain unverified and 43 photos remain unavailable.
  Pfizer was validated without adding it. Details and verification:
  `docs/market-intel-handoff-2026-09-11.md`.

- **Aug 5 evening: Anir ordered the deploy — 9f55d84 + 80375ac pushed to
  main.** 80375ac adds: the roadmap editor rebuilt as guided visual cards
  (editable version-timeline, modules, comparison table whose editable
  column headers ARE the comparison labels, history, owners-only next
  card) saving with the Edit Offering page's ONE Save button; the landing
  made actually public (the client access watchdog exempted every public
  page except "/", yanking logged-out visitors to /login) with the hero's
  Freyr AI mockup redrawn as the real light dock; and feedback alerts that
  fall back to Anir's Telegram when email has no working provider — the
  local Resend account 403s because freyrsolutions.com is unverified at
  resend.com/domains (prod's invitation email is a separate working
  setup). RESEND_API_KEY + FEEDBACK_RECIPIENT_EMAIL now exist in
  .env.local.

- **Aug 5 local closeout batch (9f55d84, deployed with the above):**
  sales-material view preferences persist per user (Folders vs All
  files + list/card layout, restored without the default-view flash; explicit
  URL options still win); Feedback blurs the page immediately with a
  "Preparing feedback" state, blocks repeat clicks, excludes its own overlay
  from the capture, and its notifications auto-dismiss (the persistent
  email-not-configured banner is gone — recipient anir@auctalai.com, deploy
  config expects RESEND_API_KEY and fails loudly without it); the complete
  roadmap editor now lives INLINE in the Edit Offering "Product roadmap"
  accordion (`OfferingRoadmapInlineEditor`, saves independently of the rest
  of the form) and the old Edit-roadmap button + `?edit=roadmap` new-tab hop
  is gone (the Roadmap tab keeps its own Edit button; Mock's sample roadmap
  stays read-only); the offering-overview availability card is now ONE
  compact strip — current release (version · date · status pill) → connector
  → next milestone, gated next version only for authorized viewers, and it
  hugs a single node when nothing is upcoming. Email delivery to
  anir@auctalai.com is NOT yet proven end-to-end: no RESEND_API_KEY exists
  locally, so that proof requires the key on the live task (deploy-time).
  Verified: tsc clean, targeted lint clean, landing public, logged-out
  /offerings redirects to /login, reset-password renders, offerings pages
  render live on :3000.

- **Aug 4 change-log closeout is ready to ship:** sales-material upload now
  requires an explicit file format, buyer-journey stage, and access level
  instead of silently assigning defaults. The catalogue now uses the exact
  `Freya Fusion (Agents)` type and `Freya Fusion Platform & Agents` category,
  includes Agent.Via and Agent.Ria, and safely heals persisted catalogues by
  exact legacy name without replacing owner-entered offering data. Later
  product decisions remain authoritative: folder assignment is optional,
  owners may create a folder inline, Folder/All-files layouts remain, the
  explicit Ask Freyr AI handoff carries offering context. A later Aug 4 pilot
  decision is authoritative for navigation: Real mode temporarily exposes
  only Offerings and Agent, while Mock continues to expose the full app.

- **Aug 4 pilot navigation is intentionally narrow:** Customers and Reports
  are hidden from Real-mode navigation and their direct page URLs redirect to
  Offerings. Both modules remain available in Mock for product review. The
  inactive Reports tab is also removed from every individual offering page
  (in both modes) until it has trustworthy live data; the useful commercial
  summary that already appears on Overview remains in place.

- **Aug 4 sales-material viewer batch is ready to ship:** ZIP materials can be
  reindexed and browsed member-by-member, and PDF members use Freyr's custom
  in-app viewer instead of the browser wrapper. Spreadsheet members now render
  as a true workbook grid with column letters, row numbers, wrapped cells,
  horizontal one-row sheet tabs, and readable light/dark hover states. Folder
  and All-files views animate between layouts. Add/Edit Material keep folder
  assignment optional and offer an inline draft-folder control beside the
  folder picker; the draft is auto-selected but is only created when the
  material is saved, so switching back to an existing folder leaves no empty
  folder behind. Archive loading now uses a compact manifest-preview card with
  a quiet progress line instead of the detached pinging file logo. Typecheck,
  focused lint, whitespace checks, an exact npm 10.8.2 lockfile validation,
  the production build, and read-only local browser verification pass. The
  Supabase login also previews Microsoft and passkey sign-in as disabled
  “Coming soon” options; neither unfinished authentication path is active.

- **Aug 3 production-hardening batch is ready to ship:** live Agent calls are
  now read-only with respect to customers, sequences, pipeline, and other
  shared workflow records (Mock keeps its interactive demos); offering-owner
  changes are admin-only and every target is verified as an active member of
  the same workspace. Real search includes released Customers, customer
  Add/Import controls match API permissions, bulk actions/export share one
  visible selection scope, CSV exports neutralize spreadsheet formulas,
  Contacts can be added after customer creation, and profile title/signature
  are stored per member and used by the Agent. The heat map uses exact
  customer/offering matches, so similarly named offerings cannot duplicate a
  deal, and empty/derived cells open an editable shared draft. Offering
  knowledge now safely expands ZIP members with member-level citations,
  continues output that hits the generation limit, and applies explicit
  recency windows using published/content dates before upload dates. The live
  deployment default is Real; Mock remains an explicit per-browser choice.

- **Change Request Log follow-up items 1–7 are implemented:** offering
  ownership is admin-assigned (the member self-claim/request path is gone),
  Supabase users can request and complete a password reset from Settings, both
  Medical Writing offerings are filed under Submissions and Document
  Operations, Offering Brief now opens in a Google-Docs-style formatted editor
  with heading/subheading, bold, italic, underline, strike, bullet/numbered
  list, indent/outdent, link, undo/redo, clear-formatting, and live preview
  controls; it stores safe Markdown and preserves existing brief content,
  contact
  rows no longer show the Service Delivery POC tag, Agent Training Only
  materials are owner-only at page/API/download/archive boundaries and expose
  no filename/title metadata through AI citations, and every uploaded offering
  file now contributes to assistant knowledge without a per-file opt-out.
  Typecheck, focused lint, and the production build pass. The remaining AI
  placement question is deliberately not part of this release.

- **Folder and roadmap requirements are now resolved from Change Request Log
  item 20 plus Anir's Jul 31 override:** Sales Materials suggests 12 standard
  top-level folders plus the Product Demos and Sales Decks subfolders. Filing
  is optional, and an owner may create an offering-specific folder directly
  while assigning a material. The offering Roadmap separates current,
  past, and next customer versions, includes the verified key contacts supplied
  by Eswar, and hides unreleased versions from ordinary sales reps at both the
  page and API boundaries.

- **Aug 5 offering closeout is ready to ship:** uploaded materials open on a
  dedicated app-owned page in a new tab instead of downloading or reopening an
  offering dialog. The page shows the title, format, uploader, folder, buyer
  stage and access level; video never autoplays. Freyr AI stays closed until
  requested, can be docked on the right without changing the media dimensions,
  and fully releases the right rail when closed. Offering Owners can upload a
  native folder tree in bulk, preserving its folder paths, while table/list
  preference auto-saves locally. Freya.Register's structured roadmap now shows
  an explicit previous/current/next timeline and gives authorized owners a
  complete editor for release dates, module versions, feature comparison,
  history, next-version details and key contacts. Local logout clears the real
  session and returns to the one-screen login page; the obsolete environment
  note under the login button is gone. Verification for this batch is limited
  to TypeScript, focused pure-data tests and deployment health checks because
  the production-backed Playwright suite is prohibited by §1.

- **This release adds the Customer Offering Heat Map:** a Reports entry, the
  full customer × offering matrix, display/filter controls, and a versioned
  activity detail editor. It stores engagement history inside the
  existing customer `offering_usage` JSONB, so the AWS release needs no schema
  migration. Typecheck, focused lint, production build, and a read-only browser
  pass are clean. The visual follow-up
  replaced the alert-like Reports entry with a normal report card, fitted donut
  centre labels through the shared chart API, fixed type/category legend
  wrapping and hover wiring, aligned the five heat-map stats, kept every
  activity legend item on one line, adopted the shared animated search-priority
  toolbar, made offering headers navigable, collapses irrelevant rows and
  columns when filtering, and leaves unrecorded pairings neutral instead of
  inventing “To pitch” activity.
- **Live data observed read-only on Jul 30:** 29 offerings, 0 customers, and
  therefore 0 offering revenue. The real Reports page and heat map correctly
  render their honest empty states; populated screenshots can only come from
  the locked mock workspace until Freyr imports its customer list.
- **Heat-map activity workflow now matches Suren's Aug 1 notes:** each
  customer/offering pairing keeps multiple numbered activity attempts, but
  exactly one saved attempt can be the report row shown in the matrix. Opening
  an attempt only edits it; the separate Report control persists the matrix
  choice and cannot accidentally toggle itself off. The reported attempt has
  its red Remove action on the same row, new attempts use a clear Save activity
  flow, and the matrix can display activity, potential value, or potential
  closure date. The production build and focused type/lint checks pass.
- The full day already shipped before that local work: offering tabs +
  materials/viewer, custom video
  player with Range seeking, bare-bones Reports, Customers module released
  with Add customer / Import CSV and the pinned rightward-growing search,
  Analyze card removed, complete dropdown sweep (zero native selects),
  voice Declined→No answer, restored catalogue data, this handbook.
- Freya.Register's 21 restored materials: 8 files are **unfiled** (only
  unambiguous folder placements were made); ~4 of the original 25 were
  link-only materials whose names are unrecoverable — Eeswar re-adds them.
- In-progress mode now overlays a complete, read-only sample roadmap on every
  catalogue offering: past, current, next, and category-specific comparison features.
  Ready-now mode still shows only roadmap versions an owner actually saved.

### Open queue
1. Customer Offering Heat Map: Freyr still owes the final standard activity
   list. The current centralized list mirrors the supplied Excel reference:
   To pitch, Opportunity, Proposal, Under contract, Contract signed, Need to
   deliver, Implementation, Implemented, On hold.
2. Older queue: voice outcomes Declined→No answer; sessions-table company
   name wrapping; app-wide icon/logo audit.
3. **Test-suite DB guard** (§1) — proposed to Anir, not yet approved/built.

Completed locally, not deployed: offering pages now use a larger, explicit
**Ask Freyr AI about {offering}** action. It opens the existing bottom-right
assistant on the same page, starts a clean offering-scoped conversation
without spending credits on an automatic prompt, and shares the signed-in
member's account-backed conversation history with the full Agent page.
Ordinary Agent navigation remains generic.

Completed locally, not deployed: main-Agent conversations recover all legacy
browser keys, no longer truncate after 50 chats, and mirror the full ordered
list to a private per-member `offering_catalog_state` row. This uses the table
already present in production, so it does not depend on migration 017 having
been applied. The browser remains an offline cache and a visible warning says
when account sync fails.

Completed locally, not deployed: Real is the universal default and Mock is a
temporary per-browser session view; test/sample identities are hidden from
Real people pickers/directories but remain available in Mock. Legacy duplicate
folder names are normalized for display, while genuinely unfiled materials
stay unfiled until an owner chooses or creates a folder. ZIP uploads now index readable files inside the archive
and at least index member names for non-transcribable contents. System status
reports whether Supabase is configured independently of the selected data
view, eliminating the prior "database reachable / Supabase missing" conflict.

DONE since first drafted (all in the unpushed stack): the full dropdown
sweep (zero native selects; ColorSelect/PeopleSelect everywhere — commits
35e74be c12c8ab 6b2eb3e e09eb44), and the Customers page's pinned
rightward-growing search + Add customer / Import CSV doors through
/api/import/crm (642ea20).

### Blocked on Freyr
- The exact verified account emails/ids for any roadmap exceptions who remain
  on the sales role. Admins, managers and Offering Owners are already covered;
  deployment may add explicit verified emails through
  `ROADMAP_NEXT_VIEWER_EMAILS` without relying on mutable display names.
- Later: ~100-account list, KonnectCo export, offering taxonomy bucketing.

### Sep 12: shared workflow wiring
Daily Google/Apify discovery now uses the same publisher reader as onboarding; Firecrawl website collector is shared. Website-only failure no longer discards successful onboarding sources; per-pass website work is bounded and cached. Node boot arms the existing daily-cycle timers. 47 focused tests pass; no deployment.

### Sep 12: external Caidya audit
All 47 saved external URLs checked; one author archive removed, 36/46 have readable content, 10 remain unreadable/limited. Fixed archive filtering, Drupal body selection, and rendered fallback after empty extraction. Forty reader tests pass; see QA report for scope and ownership/date limitations.

### Sep 12: Firecrawl website trial
Caidya: 140 Firecrawl pages, 31 recent official updates now saved and visible in Chrome. General daily site collector uses Firecrawl discovery and parsed-page caching; see QA report for precise scope and limitations. Sixteen focused tests pass. No production changes.

### Sep 12: onboarding recovery evidence
See `docs/qa/market-intel-onboarding-2026-09-12.md`. Veristat completed after checkpoint/actor recovery (34 posts, 26 news, 12 website updates). Six focused tests and typecheck passed. Final ready-state and fresh-company Chrome verification remain unpassed because the browser connection failed; do not describe this as a completed enterprise audit.

### Sep 14: sales status colour consistency
Completed locally, not deployed: the Mock-mode deviations section has a compact diagnostic header with separate attention and owner-ranking bands. The sales status audit keeps `Deviated` violet because a changed accrual can still be valid; `Invalid`, `Lost`, `Cancelled`, and `Disqualified` retain red for actual failure states. Opportunities and revenue accruals now read opportunity colours from `lib/opportunitiesShared.ts`, and accrual states read one shared palette from `lib/revenueAccrualsShared.ts`, removing component-local copies that could drift. Typecheck passes; browser screenshot verification was unavailable because the existing Chrome CUA tab timed out.

### Sep 14: linked sales table rows
Completed locally, not deployed: in sales tables with standalone records, unused row space opens the row's primary record while linked entity names open that exact customer, opportunity, or contact. Nested buttons, links, status controls, and chevrons retain their own actions. Applied to Solutioning, Opportunities, and Revenue Accruals; Leads keeps inline expansion because it has no standalone lead route, but its recognized customer names now link to the customer. Customers and Sessions already followed the rule; Contracts remain expandable cards because there is no standalone contract route.

## 10. Meeting knowledge (Jul 30 stakeholder meeting, fully transcribed)

Frames + transcript were analyzed second-by-second in a prior session.
Durable takeaways: the meeting originally asked for system-defined folder and
document-type pick lists with one "Other" each. Anir's later Jul 31 product
decision overrides the folder restriction: the standard folder list remains,
but folder assignment is optional and owners can create a custom folder while
assigning a material. File formats inside folders stay unrestricted; roadmap tab =
current version, next version, feature comparison, contacts — with anything
beyond current release hidden from sales; the offering page's AI entry is
the bottom-right dock (Anir's call: keep the dock, no extra Ask button);
agent answers must come from the offering's own content; materials tab is
the "heavy traffic" front door.

### Sep 14: meeting form and record navigation
Completed locally, not deployed: New Meeting stores an optional local time beside the required date and shows it on meeting lists and details without changing existing date-only rows. The list view is labelled accurately; unused row space opens the meeting while the chevron expands it. Customer, opportunity, contact, owner, and Freyr attendee names link to their records on meeting surfaces. The attendee picker now exposes "Create new contact" before typing, and every shared MultiPicker closes on captured outside pointer input. Meeting footer validation sits immediately left of Cancel. Mock writes remain isolated by `getDataMode()`/`getDb()` and the `meetings:mock` store row. Typecheck and production build pass; no deployment.

### Sep 14: solution request relationship integrity
Switching the customer in New Solution Request now clears the prior account's selected opportunities immediately, and submission filters the final opportunity/contact pairs against the currently visible records. Request panels only link labels to records when their parallel name/id lists have the same length, so ambiguous legacy data stays readable without opening an unrelated record. Typecheck, rules tests, and the production build pass; verified through code and CLI only at the user's request.

### Sep 14: superseded high-volume mock floor
This older floor attached four Solutioning records and two meetings to every generated opportunity, producing 330 opportunities, 1,320 Solutioning records, and 660 meetings. The Sep 15 realistic-scale rule below replaces those volumes while retaining connected records and automatic stale-generation cleanup.

### Sep 14: deployment permission is per message
Never push or deploy to development or production unless Anir explicitly asks for that deployment in the current message. Earlier deployment permission does not carry forward. Keep completed changes local until that explicit instruction arrives.

### Sep 14: expanded-goal latest entries are a full-width table
The latest six entries in an expanded person or group goal use the same compact table pattern as Logged results, with stable Reported, Result, Details, and Status columns. The table fills the panel, uses deliberate column widths, and scrolls horizontally on narrow screens; do not turn these records into cards.

### Sep 14: month bars explain their stacked status sections
The Month by month chart in expanded person and group goals shows a Status breakdown on hover: Verified, Waiting to be verified, and Sent back, with the amount and share for each nonzero section. It does not show generic share-of-year or rank statistics for these bars.

### Sep 15: goal segments keep their measurement brackets
Progress tracks in the organization → group → person drill-down retain a coloured bracket under every nonzero section, showing exactly where that section starts and ends. Section values share one horizontal row whenever their rendered labels fit; only labels that would collide move to another lane. Do not replace the brackets with detached legend strokes. Completed locally, not deployed.

### Sep 15: People Performance action panels fold without disappearing
The sent-back, verification, and waiting-on-someone action panels each keep a persistent header and count while independently hiding or revealing their rows. The verification queue uses explicit table columns, reserves enough width for Goal, and wraps long goal badges instead of clipping their names. Completed locally, not deployed.

### Sep 15: sent-back claims use the action-queue table pattern
The People Performance panel for claims a manager sent back uses aligned Number, Result, Goal, Customer, Waiting on, Sent back, and Your note columns. People retain their avatars and a clear “Their move” state; manager notes use a compact highlighted field instead of a repeated run-on sentence beneath every claim. The panel remains independently collapsible. Completed locally, not deployed.

### Sep 15: offering customer picker stays above the page
“Add to a customer” keeps its plus icon while open and places the close action inside the customer picker. The offering header owns a higher stacking layer so the anchored picker renders cleanly above tabs and report cards instead of letting later animated sections cut through it. Completed locally, not deployed.

### Sep 15: Mock-mode is an address invariant
Every signed-in page viewed with the Mock-mode cookie keeps `/mock-mode` in its browser URL across links, smart-back navigation, refreshes, bookmarks, old history entries, and query/tab cleanup. All app-level history replacement uses the shared mode-aware helper and preserves Next's browser-history state instead of erasing it. Navigation trails compare canonical routes so the prefix cannot create duplicate or false back entries. Offering records name the actual back destination: an offering opened from an FDL component says “All FDL Components,” while an offering opened from the catalogue says “All offerings.” Completed locally, not deployed.

### Sep 15: customer offerings use customer language
The customer Offerings tab starts with a compact “Customer offerings” toolbar showing counts in use and available to add. “Segment” is labelled “Customer type,” and applicability copy uses plain catalogue language. Search and a single stateful Expand all / Collapse all control share the toolbar. Offering availability uses the shared soft green badge with dark green text, while the stronger filled green “In use” badge remains the adoption state. Completed locally, not deployed.

### Sep 19: interaction logging uses standard dialog proportions
The customer “Log an interaction” dialog uses the shared 640px wide modal, standard body padding, and a compact four-row interaction summary. The type selector remains full-width and responsive; follow-up fields and footer actions retain the existing workflow. Completed locally, not deployed.

### Sep 15: customer activity history is searchable and attributable
The customer Activity tab has one search field and one stateful Expand all / Collapse all control for its offering groups. Each group keeps a top-right fold control. Every activity row shows its original logged date, time, and workspace member; new writes derive that member from the authenticated request, while legacy records without attribution say so honestly. Mock histories carry varied deterministic authors and timestamps. The Coverage heat-map explanation lives behind the Current-column question mark instead of repeating beneath every offering table. Completed locally, not deployed.

### Sep 15: meeting rows and documents follow the established interaction
Clicking anywhere on a meeting list row expands or collapses it; clicking the meeting name opens its page. Meeting write-up and document guidance sits behind header info icons, freeing the cards for their records. Adding a meeting document now separates file selection from saving, prefills an editable display name, preserves the original filename, and shows upload progress only after Add document. Shared viewer errors are centered, and the meeting delete confirmation uses a short heading with the exact meeting identity in its body so no duplicate truncated-title bubble appears. Completed locally, not deployed.

### Sep 15: mock data uses unique identities at realistic scale
The oversized generated floor is superseded. Mock now contains 48 unique customer companies and 240 unique contact names, with five contacts, two pitch sessions, and three interactions per account. Its 273-name given-name pool also prevents same-first-name clusters in sorted lists. The generated cross-module workload is 60 leads, 64 opportunities, 64 contracts, 64 meetings, and 128 solutioning records; offerings and components retain their catalogue-sized 57 and 71 records. Related pages deliberately reuse the same linked identity, while unrelated customers never receive the same person or company name. Campaign recipients, voice calls, recordings, and meetings derive from the same shared contact book. Both persisted seed versions were advanced so existing Mock workspaces replace the stale Yuki-heavy rows automatically while hand-created rows survive. Density tests enforce realistic bounds, directory-wide given and full-name uniqueness, canonical cross-page identities, catalogue coverage, and connected deal records. Completed locally, not deployed.

### Sep 15: member privilege matrix reads stable assignments
The Team members matrix renders held privileges from each active member's stable account ID, including legacy name assignments only when they map to exactly one active member. Toggling a cell persists the stable binding alongside the compatibility name map. Explicit column widths keep all ten privilege headings visible on desktop and center each heading over its checkbox instead of allowing horizontally scrolled columns to hide behind the sticky Person column. Typecheck, focused lint, and the 22 enterprise privilege tests pass. Completed locally, not deployed.

### Sep 15: Fix result is a full correction workspace
The People Performance Fix action opens the 980px workflow dialog instead of the old compact form. It separates the result identity, reviewer feedback, corrected amount/date/customer, and supporting evidence into distinct sections. Customer has the full row, evidence has a roomy attachment surface, invalid amounts explain themselves inline, and the resubmission action stays visible in a sticky footer that states who gets notified. The same component retains ordinary Edit-result behavior. Typecheck and focused lint pass; the standalone goal-summary test remains unavailable under the current Node 24 ESM loader because its CommonJS `server-only` mock does not intercept the import. Completed locally, not deployed.

### Sep 15: verification tables explain their evidence column
People Performance verification tables call the column Evidence, reserve enough width for it, and render attachments as readable file names with their file type. Missing evidence says “No attachment” instead of rendering a stray period. Attachment controls retain their preview behavior and expose the complete original filename to assistive technology and on hover. Completed locally, not deployed.

### Sep 15: correction dialog gives customer selection room
The People Performance Fix-result dialog has an explicit 1100px desktop width. Customer account occupies its own full-width row with a 56px input, account icon, readable 16px text, and the complete “Search or enter the customer name” prompt, followed by a short explanation of what belongs there. Completed locally, not deployed.

### Sep 15: correction customer is an account picker
The People Performance correction dialog loads the permitted customer catalogue and uses the shared searchable company dropdown, with company marks and record links, in its full-width customer row. Selecting an account persists both its name and stable customer ID; a legacy customer remains visible if it is no longer in the catalogue. The date control no longer repeats the same formatted date underneath itself. Completed locally, not deployed.

### Sep 15: lead analytics use expandable workspaces
The Leads analytics band stacks intake and current status in one left column beside the denser Source Performance list, so the tall source list no longer stretches two short panels into large empty columns. The status donut places its legend beside the ring. All three graphs expose the standard top-right expand action. Source Performance opens a 1500px analysis workspace; clicking a source opens the same workspace prefiltered to it. The workspace includes full-text search, source/status/owner filters, clear filters, visible-result counts, and sorting by intake date, last movement, lead name, company, status, or owner. Its detailed table retains customer, owner, and converted-opportunity links. The shared Org Performance surface used by organization, group, and people views also exposes expansion for both goal-progress and goal-pace graphs, using the same chart workspace controls. Completed locally, not deployed.

### Sep 15: expanded lead rows use one clear hierarchy
Expanded lead rows keep the request summary and primary workflow action in the header, then place Contact & account beside Lead readiness. Missing data uses plain “Not added” labels and an Edit lead action instead of empty dashes and a decorative completeness donut. Follow-up timing and the recommended next step are compact cards inside readiness. The lead journey spans the full row as three equal, connected stages and does not require sideways scrolling on desktop. Completed locally, not deployed.

### Sep 15: lead source rows use one baseline
Source Performance uses the same four-column grid and horizontal inset for its heading and every row. The source name, total, converted count, percentage, and chevron occupy the first row; the volume bar has its own second row. Numeric cells no longer sit halfway between the source label and its bar. Completed locally, not deployed.

### Sep 15: deviation analysis is selectable and explicit
Opportunities → Deviations opens on the simple Deviated records table. A single compact dropdown switches between Deviated records, What each month says now, and Where the gap came from instead of using a wide tab strip or appending two long sections below the table. Gap cards name the opportunity and customer, state where slipped money moved, and show frozen-plan-to-today amounts for every changed month instead of unexplained positive and negative mini bars. Completed locally, not deployed.

### Sep 15: solution request folds and documents match sales materials
Clicking unused space on a Solution request row expands or collapses its inline details; its title remains the direct link to the full page. Submission subtype text such as Proposal sits below the title and cannot be squeezed into a clipped metadata fragment. In table and split details, document names use the shared Sales Materials hover preview and open in the shared document modal, with a separate open-on-own-page action. What it is for keeps its linked names without redundant arrow glyphs. Completed locally, not deployed.

### Sep 15: member matrix fits its privilege headings
The Team members matrix uses explicit fixed column widths instead of allowing long privilege names to enlarge the table past its visible desktop container. Multiword headings stack cleanly and remain centered over their checkboxes, so Delivery, Admin, and View all stay visible without a hidden horizontal offset. Completed locally, not deployed.

### Sep 15: automated-email cards need no view icon
Each scheduled automated-email card already opens its live preview when clicked. Do not add an eye or separate preview glyph to the row; the duplicate affordance adds noise without adding an action. Completed locally, not deployed.

Mock-mode Market Intel keeps the same link behavior as the live feed. Every company card opens its in-app briefing; its visible latest article opens the sample publisher destination. Inside the sample briefing, post, article, and signal cards are complete clickable targets with deterministic external fallbacks when the illustrative record has no source URL. Completed locally, not deployed.

Lead chart hover rows carry two separate identities: a prominent company logo beside the company name, then the person’s own avatar beside the person’s name. Lead status is a status chip rather than flat text attached to the person. This applies to both weekly-intake points and the current-status donut. Completed locally, not deployed.

### Sep 15: chart record popups use exact marks
Every chart type uses the shared portalled tooltip surface. Line and area popups open only from their visible data dots, compact sparklines open only from their visible endpoint dot, and bar/donut popups open from the painted mark itself; empty plot space never snaps to a nearby point or reopens a dismissed card. The card is constrained to the viewport and closes as soon as the pointer leaves its exact chart mark. Completed locally, not deployed.

### Sep 15: lead journey is one continuous timeline
Expanded leads show Received, Current status, and Outcome on one connected rail instead of three separate cards. Completed movement uses a solid connector, an undecided outcome uses a dashed continuation, the current state carries its canonical status colour, and every date and person stays attached to the milestone it describes. Completed locally, not deployed.

### Sep 15: expanded lead facts use direct labels and actions
Email, phone, country, source, and owner place their semantic icon beside the field label; identity marks such as a company logo, person avatar, country flag, and source colour stay with the value. Account match has no redundant label icon. The former Lead readiness score is replaced by a plain Next action summary, missing-detail count, follow-up timing, and recommended action. Completed locally, not deployed.

### Sep 15: form validation stays in the action row
Action-blocking validation belongs immediately to the left of the action it explains, in the same footer row. Do not reserve a separate validation row above form actions; the empty line wastes vertical space and separates the explanation from the disabled control. Applied to email sending, new Solution requests, offering roadmap edits, and Sales Material uploads. Completed locally, not deployed.

### Sep 15: the admin email composer sends complete messages
The rich-text toolbar supports undo, redo, emphasis, strikethrough, fonts, colours, highlighting, lists, indentation, alignment, hyperlinks, unlinking, and clearing formatting. Adding a hyperlink opens a focused text-and-address dialog and inserts a normal HTML anchor that survives the email payload. Admins can attach up to five common business files with an 8 MB combined limit; SES and the fallback provider both receive the bytes, while the sent log retains only filenames, sizes, and content types. Completed locally, not deployed.

### Sep 15: template placeholders are editable fields
Loading an admin email template with bracketed values opens a dedicated Template details panel between Subject and Message. Each unique placeholder becomes a labelled text, date, or full-link field, with the original token shown beside it and a live subject preview below. Send explains the first missing or invalid value and stays unavailable until all details are valid. “Apply to email” replaces every occurrence in both subject and HTML message, so the sender can review the final words before sending; Send also resolves completed values if they have not pressed Apply. Repeated material placeholders have distinct first and second document fields. Completed locally, not deployed.

### Sep 15: performance evidence scales and previews like sales materials
Collapsed People Performance rows show one compact document count instead of listing every attachment. Opening a row reveals a bounded, scrollable document table with sticky headings, file type, and action. Hovering a document uses the shared Sales Materials preview, while clicking opens the same full document renderer in a modal or dedicated page. Mock claims point to real shipped PDF and Word samples so every preview can be reviewed. Completed locally, not deployed.

### Sep 15: performance status colours remain identical
Performance progress bars, segment brackets, endpoint markers, monthly legends, and chart-tooltip legends all use the shared status colour without changing its opacity. Hatching alone communicates that a claim is still unverified, so the legend key and the bar remain visibly the same hue. Completed locally, not deployed.

### Sep 16: account planning starts inside the customer
Mock customer pages now place Account plan immediately after Overview. The review slice uses the existing Freyr visual language and dense expandable tables: a compact editable plan header, objective and current position, prioritized offering plays with targets and linked material, a vertical introducer-to-champion-to-decision-maker path, a bounded searchable stakeholder table, relationship gaps, and next actions. Mock edits persist per customer in local browser storage. The tab is intentionally excluded from Real mode until the normalized account-planning data model, permissions, APIs, and production rollout are implemented. Typecheck and focused lint pass. Completed locally, not deployed.

### Sep 16: first-use product tour stays anchored
The walkthrough now measures targets without repeatedly scrolling already-visible controls, ignores sub-pixel geometry noise, and updates only when the target or dialog size actually changes. The tour card no longer animates between its fallback and measured positions; its entrance and step changes use opacity only. An isolated fake-data browser reproduction held both the first-step dialog and spotlight at one position with zero automatic scroll calls. Typecheck and the whitespace check pass. Ready for production deployment.

### Sep 17: deviation filters never replace the workspace
Opportunities → Deviations keeps its heading, opportunity selector, search, filters, and table when a selected opportunity has no deviated records. The zero-result message appears inside the table, names the selected opportunity when available, and provides a direct clear-filter action. Clearing it also removes the opportunity query parameter, so a deep link can never strand the user on a blank, control-free page. Typecheck, focused lint, revenue rules, booked-revenue tests, production build, and whitespace checks pass. Completed locally, not deployed.

### Sep 17: phone country selection keeps its flag
The closed phone dialling-code selector shows the selected country flag beside its code, matching the option the user chose in the open menu. Shared dial codes use the lead's selected country when available, so a Canadian selection does not reopen looking like the United States. Completed locally, not deployed.

### Sep 17: expanded lead guidance names the missing information
Lead follow-up cards do not repeat the status already shown on the row. Their footer names each missing field directly instead of showing a detached detail count, and customer matching is not treated as missing lead data. Contact details show a Customer account row only when a linked account exists. Truncated email links do not open a persistent native browser title bubble. Completed locally, not deployed.

### Sep 17: customer presentation dates keep their column
Customer Submissions, Presentations, and Meeting requests tables use balanced fixed columns. The record title no longer consumes the space reserved for Requested and When, and both date columns stay on one line at desktop widths. Completed locally, not deployed.

### Sep 17: customer solutioning tables share one six-column layout
Customer Solutioning requests no longer uses the stale 1,540px ten-column table intended for a larger record shape. Solutioning requests, Submissions, Presentations, and Meeting requests share the same balanced six-column layout, keep both dates on one line, and fit the customer content area without opening at a hidden horizontal offset. The remaining customer tables retain only the minimum widths their visible columns require. Completed locally, not deployed.

### Sep 17: customer Overview has one Key contacts section
Customer Overview shows Key contacts once, directly after the account summary. Its four preview cards retain the richer email, phone, LinkedIn, and contact-page actions, while a persistent All contacts action opens the complete Contacts tab. The later duplicate section is removed. Completed locally, not deployed.

### Sep 17: chart popups end with the chart mark
Every chart tooltip is display-only and belongs to the exact painted mark that opened it. Line and area hit targets match the visible point's resting and active sizes instead of surrounding each point with an invisible 18px circle. Leaving a dot, bar, slice, or sparkline endpoint closes the popup synchronously; moving horizontally through empty plot space cannot retain the current point or select the next one. There is no delayed dismissal, invisible bridge, or popup hover area that can keep it stuck on screen. Completed locally, not deployed.

### Sep 17: stakeholder controls share one toolbar
Customer Account plan keeps the Stakeholder map heading clear and places search at the left of a dedicated toolbar. Buying-role and relationship filters, stakeholder sorting, the visible-result count, and a contextual Clear action occupy the same row. Empty filter results stay inside the table with an explicit message. Completed locally, not deployed.

### Sep 17: Market Intel cards share one hierarchy
Market Intel list and tile cards keep source and signal tags at the top-left, a permanent Save / Open-in-new-tab / Delete action cluster at the top-right for authorized actions, one linked title treatment, and the timestamp at the bottom-right. Company and people posts use the same title hierarchy as articles instead of mixing their date into the author line. Table view keeps the same tag order and the same three-action cluster in its Actions column. Completed locally, not deployed.

### Sep 17: Market Intel details rail stays reachable
The feed and Company details rail no longer overlap or borrow width through a negative page margin. The open rail has a stable desktop width and continuously measures the viewport room beneath its current sticky position, then confines Signals, Competitors mentioned, People tracked, and later cards to one internal scroll area. Its header and Hide action remain outside that scroll area. Completed locally, not deployed.

### Sep 17: mock Market Intel trends describe different histories
Mock company sparklines use deterministic but visibly different activity families, including climbs, recoveries, steps, and cycles. Their records are distributed across the same history used for the momentum percentage, with no shared sawtooth or manufactured final-day spike. Ranges longer than two weeks are grouped into a readable 12–15 points so a compact card never draws 90 noisy daily teeth. Completed locally, not deployed.

### Sep 17: Company details uses the full viewport
While a Market Intel briefing scrolls, its Company details rail sticks four pixels below the 56px global header instead of leaving a 24px dead band. The internal scroll limit is measured from that same position, exposing more of Signals, People tracked, competitors, and the remaining detail cards without covering the header. Completed locally, not deployed.

### Sep 17: Company details has one stable height
The open Market Intel Company details rail has a fixed viewport-relative height from its 60px sticky position to a 12px bottom gap. It does not listen to page or nested scroll events, recalculate geometry, or animate max-height; only its contents scroll. This prevents the panel from shrinking and eliminates the choppy feedback loop while the page moves. Completed locally, not deployed.

### Sep 17: Market Intel story actions share one control style
Save, Open-in-new-tab, and Delete use the same 28px control height, width, corner radius, neutral default colour, 14px icon box, and 2.2 stroke weight in cards and table rows. They always appear in that order, with Delete third. A saved bookmark alone uses the blue active state; Delete turns red only on hover. The action pill sizes itself to those three controls rather than stretching across the table column, so its outer padding and icon centres are symmetric. The table reserves the pill's full measured width, aligns source, tags, date, and actions to one 28px top row, and truncates long source names instead of letting one column's wrap shift the visual grid. LinkedIn remains source metadata and does not add a fourth icon or force Save outside the pill. Completed locally, not deployed.

### Sep 17: deviation view control belongs to its content
Opportunities → Deviations keeps its three-option view selector inside the active content card header. It sits beside the shown count for records and beside the contextual heading for month, source, and empty comparison views. The selector never occupies a detached row between the page actions and the content it controls. Completed locally, not deployed.

### Sep 17: solutioning request types are visible list controls
All solutioning requests uses the shared list toolbar with search, layered filters, sorting, table/split view, and its visible-result count. A permanent request-type selector beside search switches directly among All request types, Submissions, Meetings, and Presentations; type is not duplicated inside the layered filter menu. Clearing filters also clears the grouping choice. Completed locally, not deployed.

### Sep 17: opportunity solutioning shows requests without crowding
An opportunity's Solutioning requests tab contains request records only; submissions and presentations created from those requests remain in their own module rooms. The tab has an in-place search and an All / Submissions / Meetings / Presentations selector. Its compact table keeps request ID and title together, then shows type, BD member, solutioning owner, requested date, and status. The redundant All solutioning requests exit link is removed. Request details keep an Edit action for authorized users, and Edit covers the title, what was requested, subtype, priority, deadline, and meeting details rather than only priority and deadline. The brief also has a quiet inline Edit action beside “What they asked for”; it becomes an in-place editor only while being changed and saves without sending the user to a detached dialog. Completed locally, not deployed.

### Sep 17: solutioning owner picker clears its card
The request-detail Owner card lets its people picker render beyond the rounded card body and raises the open menu above the cards that follow. The assignment choices are fully visible instead of being clipped at the Owner card boundary. Completed locally, not deployed.

### Sep 17: dev admins can create role-review accounts
The dev login gate accepts plus-addressed test identities for every admin on the configured dev roster, including the transcript's `manojkumar.odela+2@freyrsolutions.com`. Every exact Freyr admin address in the default or deployment allowlist expands to that admin's plus aliases, while omitted admins and unrelated company aliases stay blocked. Production remains unaffected. This lets every admin create separate BD Member, BD Owner, Solutioning Member, and Solutioning Owner accounts, assign each role, and review the corresponding workspace. Completed locally, not deployed.

### Sep 17: all four Solutioning rooms use one compact toolbar row
All solutioning requests, Submissions, Presentations, and Meetings keep search, Filter, grouping, sort, result count, and one icon-only list/split dropdown on a single row. Request type, assignment, dates, status, owner, customer, and other record filters live inside the shared Filter menu instead of consuming permanent toolbar space. Empty rooms use the active room's icon, tighter vertical spacing, and the single create action already present in the page header. Completed locally, not deployed.

### Sep 17: division roles cannot duplicate contributors
A request owner, division lead, and primary assignee cannot also be added as a contributor for that division. Changing any of those roles cleans stale duplicates from the stored workstream. The contributor list is always labelled with a count and explicitly says when it is empty, and removing a contributor requires confirmation. Completed locally, not deployed.

### Sep 17: lookup menus are searchable without bloating basic controls
People, owner, assignee, customer, and other record lookup menus show a search field whenever they open. Keyboard typeahead and Enter-to-select remain available in the shared select controls even when a compact fixed-choice menu does not display a search field. Sort, view, status, and other short fixed-choice controls stay compact. Completed locally, not deployed.

### Sep 17: solutioning division assignments stay compact
Each division card keeps Solutioning lead and Primary assignee in two balanced columns. A compact blue Add contributor action sits in the card header and opens a large searchable roster with every eligible person already visible; it does not hide the roster behind another dropdown. The roster excludes the request owner, division lead, primary assignee, and existing contributors. Existing contributors remain in an explicit labelled row with confirmed removal. Completed locally, not deployed.

The contributor roster search uses the full modal-field scale: 52px tall with larger text, icon, and padding, plus one clean focus border instead of the compact toolbar field and doubled focus halo. Completed locally, not deployed.

### Sep 17: request timeline grows only with its content
The Solutioning request timeline treats the Documents endpoint as a maximum boundary, not a required height. The card grows naturally with its visible entries, caps its event list at 620px and scrolls internally after that. It never stretches merely to match the left column or viewport. Completed locally, not deployed.

An empty request timeline stays compact around its header and Add a comment action. It expands toward the Documents boundary only when activity exists to use and scroll within that space. Completed locally, not deployed.

Timeline sizing uses the final deduplicated entries that actually render, not the raw activity array. Hidden or collapsed activity can never make an apparently empty card stretch down the page. Completed locally, not deployed.

The list resets its scroll position when its entry count changes. Completed locally, not deployed.

An empty timeline explicitly says “No activity yet” and explains that changes and comments will appear there. The empty message and comment action form one compact card instead of leaving an unexplained blank panel. Completed locally, not deployed.

The request Owner menu uses its empty prompt only in the closed trigger. Its open list begins with real workspace people and does not repeat “Assign a Solutioning member” as a selectable first option. Completed locally, not deployed.

When a Solutioning request has already raised a submission or presentation, the primary action names the work item, such as “Open Test RFP,” instead of exposing its internal reference as “Open SUB-0001.” Completed locally, not deployed.

Solutioning request lists show the current owner as read-only identity text. Ownership is transferred from the request detail Owner card; an unassigned fulfiller can still use Pick it up from the list. Completed locally, not deployed.

Arrow-up-right and external-link actions open their destination in a new browser tab throughout the app, including internal record destinations. Plain names and ordinary navigation links keep their existing behavior; the arrow is the visual promise that the current page remains open. Completed locally, not deployed.

The Owner card can transfer ownership for requests, submissions, and presentations. Choosing a different person opens a confirmation dialog before anything is saved, and the timeline records the previous and new owner. Only a Solutioning Owner or Admin can complete the transfer. Completed locally, not deployed.

Expanded Solutioning list rows are compact previews rather than miniature detail pages. They keep the brief and linked context together, show at most three documents, and summarize only the three newest activity updates without a nested scrolling timeline. Empty document and activity states use one short row, while the full record remains the home for complete history. Completed locally, not deployed.

The expanded preview is sticky to the table's visible horizontal viewport. Scrolling the wide table to later columns cannot push the preview's brief and context off-screen or strand the activity summary by itself. Completed locally, not deployed.

In Solutioning list rows, only the visible solution title opens the request detail page. The request ID is plain text, and every linked person or opportunity uses a content-sized hit area. Clicking unused space in any cell stays on the list and expands or collapses the preview. Completed locally, not deployed.

Solutioning request details do not repeat an “Open [title]” header action for work already listed under Work raised off this. The child record remains reachable by its visible title there. On populated requests, the right rail stretches to the real left-column endpoint and the Timeline owns the remaining space, so its bottom border aligns exactly with the bottom of the final Documents count card and excess activity scrolls inside. Short and empty histories still remain compact. Completed locally, not deployed.

Expanded Solutioning previews render Recent activity as a true compact timeline. The three newest events use the same connected vertical spine and event-specific markers as the full record, followed by the earlier-update count. Completed locally, not deployed.

Expanded Solutioning previews now show document responsibility directly in every visible document row. An assigned document names the person under a clear “Working on it” label; an unassigned document says “No one assigned.” The compact preview therefore answers who is handling each customer document without requiring the full record. Completed locally, not deployed.

Request details label the linked context explicitly. “What this is for” uses one restrained panel with Customer, Opportunities, and Contacts columns, preserving the existing links and showing “None linked” where a relationship is absent. Completed locally, not deployed.

### Sep 17: customer band tabs omit redundant actions
Customer connection tabs no longer repeat record-team editing controls or links such as “The team” and “All deals” beside the active band summary. The selected tab already identifies and opens that destination, so the duplicated action row is removed across all customer band tabs. Completed locally, not deployed.

### Sep 19: expanded chart record popups are inspectable
Expanded chart popups are wider, expose their complete record list, and remain open while the pointer moves from the chart into the popup so the list can be scrolled. Compact page-chart hovers retain their instant-close behavior. The lead Company picker now says “Choose a company” and uses one explicit blue “Add a company not on the list” action; typing a name clearly states that it updates the lead only and does not create a customer account. Completed locally, not deployed.

### Sep 19: record-connection pickers use full-size searchable dialogs
Component connection pickers on customers and offerings use a 720px-wide, fixed-height selection dialog with a full search field, larger selection rows, a scrolling list, and a visible selected count. The matching offering picker on an FDL component uses the same dimensions so record-connection workflows no longer fall back to the cramped default modal. Completed locally, not deployed.

### Sep 19: saved views restore before paint
Browser-saved view and panel preferences now restore in a layout effect. Navigating to People performance no longer paints the three claims panels open first and then visibly snaps them to the user's saved closed state; the same fix applies to every screen using the shared stored-view helper. Completed locally, not deployed.

### Sep 19: sent-back claims table fits the performance workspace
The People performance sent-back table uses proportional columns with a smaller desktop minimum width, so the final Your note column remains fully visible without horizontal scrolling at standard desktop widths. Long notes wrap inside their cell instead of being clipped at the edge. Completed locally, not deployed.

### Sep 19: question-mark help is scannable across the app
All 137 InfoHint question marks now use one structured help renderer: each idea gets its own row, short labels before a colon become bold headings, and long single-paragraph explanations break into readable sentences. The goal editor's Counted in, How it adds up, and Schedule explanations were rewritten as short labelled choices and examples. Completed locally, not deployed.

### Sep 19: milestone removal uses the destructive treatment
The milestone-removal confirmation uses the app's red warning icon and red primary action so the destructive choice is unmistakable. The editor mounts one shared confirmation instead of one per milestone, preventing stacked backdrops from making the screen nearly black. Completed locally, not deployed.

### Sep 19: logged-result rows use clean table dividers
Collapsed Logged results rows are separated by one subtle border. Hidden expansion panels no longer retain surface-colored padding that appeared as thick gray bands between every row. Completed locally, not deployed.

Logged-result customer hovers separate the account name from its relationship note, show both in full in a wider preview, and never truncate the text into an unusable fragment. Expanded result details fill the table width while the spanning cell continues to constrain the table itself. Completed locally, not deployed.
