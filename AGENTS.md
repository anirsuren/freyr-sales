# AGENTS.md — read this before touching anything

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

`.env.local` contains the **real production Supabase URL + service-role key**
and the real Freya.Docs credentials. There is no staging database.

- Any local server in **live mode** reads AND WRITES the production database.
  Real is the default; Mock is an explicit, per-browser session view.
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

- **Prod**: https://freyrsales.dev.freyrapps.com (AWS ECS). Boots in real
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
- Release gating: `lib/release.ts`. Real mode shows only
  `RELEASED_MODULE_PREFIXES` — currently `/offerings`, `/agent`,
  `/customers` — plus `NON_MODULE_PATHS` (login, settings, onboarding…).
  Everything else exists but is mock-mode-only until released.

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
  donut legends beside the ring, hover popovers scale UP on the card.
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
