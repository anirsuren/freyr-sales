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

- **Sep 25 Market Intel post previews:** Company and person posts on a briefing now use their complete first line as the linked headline and the following lines as the body. The previous 160-character headline cap split words between the blue title and gray text, including after “Show the full post” was clicked. Search/list titles remain compact. Local only, not deployed.

- **Sep 25 Market Intel tracking faces:** The Tracking count refers to workspace members who put a company on their list, not the company's employees. Its table cells now show up to five of those members' real profile photos or initials beneath the status and a `+N` badge for any more; the status names them “watchers” so the count cannot be mistaken for company headcount. The existing details popup still lists them. Local only, not deployed.

- **Sep 25 Amplexor identity in Market Intel:** The collected Amplexor and ArisGlobal URLs had identical image hashes because Amplexor Life Sciences now uses its parent's ArisGlobal branding. Market Intel now shows an archived Amplexor Life Sciences mark for the Amplexor record, including table, tiles, briefing, management, confirmation, and watchlist surfaces, while ArisGlobal keeps its own logo. Local only, not deployed.

- **Sep 25 Customer Intel story position dots:** Inactive table-ticker dots used an undefined `bg-border-strong` utility, leaving only the blue active marker visible. They now have explicit theme-aware border color and a larger dot size, while the active position remains blue. Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 25 Review editor save footer:** The separate opportunity review editor now follows the deal overview's sticky save pattern: it appears only after an edit, identifies the unsaved review, and uses the same compact Cancel/Save sizing and spacing. Form errors remain beside the controls. Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 25 Customer Intel table and five-story rotation:** Saras's Customer Intel uses a fresh table-first saved view key so an older tile preference cannot replace the table she requested; she may still choose either view afterward. Table rows now cycle through up to five latest headlines every five seconds, matching the existing tile ticker, with previous/next controls, pause on hover/focus, and reduced-motion support. The visible story retains its own source and article links. Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 25 follow-up fixes after production promotion:** The Sep 24 release at `29074f0` reached development and production; both health checks served that revision. Locally, the Settings mode switch preserves the Workspace tab and changes the URL to match the chosen view, while the production promotion script keeps Real as the default and leaves the personal mode switch unlocked. Grouped opportunity rows ignore stale open branches from a previous grouping, avoid heavy fading, and use a theme-aware total cell. An empty deal accrual tab shows an intentional empty state and its Add accrual action rather than an empty table. Lead chart slices open their records, and lead owners without deals resolve to their teammate profile. Shared form sections, picker marks, and several hardcoded pale surfaces now follow dark-mode colors; Manage competitors help alignment is corrected. Local verification includes both directions of the mode switch, the empty accrual tab, Elena Rossi's lead-owner destination, dark opportunity-table computed colors, typecheck, focused rules, and the dark-mode sweep. These follow-up fixes are local only, not deployed.

- **Sep 25 Confirmation record visuals:** The shared confirmation dialog now uses the affected record's icon instead of a generic warning triangle, and a named company logo or person photo/initials when supplied. Market Intel company delete, tracking, star, and story confirmations carry the actual identity; customer-account, offering, opportunity/deal, and contract delete confirmations carry their record identity too. Other shared confirmations receive a contextual record-type icon from their action title. Verified the local Amplexor delete confirmation visually without confirming deletion; typecheck, focused lint (existing unused-symbol warnings only), and diff check pass. Local only, per the user's release instruction.

- **Sep 25 Market Intel manage-row selection:** Clicking a competitor or customer row now toggles its tracking checkbox; Enter and Space work when the row itself has focus. Company links and checkbox, status, star, and delete controls retain their own actions. Verified locally by toggling an Amplexor row off and back on without saving; typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 25 Market Intel details disclosures:** Signals, Sources, and People tracked in the Company details rail now open and close independently. Their compact headers always show the active signal names, chosen source, or tracked people, so selections remain visible when closed. Verified signal selection and collapse in the local CuraTeQ briefing; typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 25 Market Intel story header spacing:** Article and post cards now place their save/open/remove controls in the header layout beside the source chips instead of absolutely over the text. Long titles begin below that row and cannot run underneath the controls. Verified visually on the local CuraTeQ briefing at the narrower side-panel width; typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Teammate Goals table spacing:** The profile's Goals table now uses shared proportional column widths across goal families, with matching header/body padding and a clear inset before goal icons. Missing targets say “Not set”; rows without a target no longer show a meaningless progress bar or dot placeholders. Typecheck, focused lint (existing unused-import warnings only), and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Live teammate profile spacing:** The linked-record tabs on a teammate's profile now sit directly on the page rather than inside a second full-width card, with tighter spacing under the profile and compact left-aligned empty copy. The generic “charts fill in” note no longer appears below profiles that already have linked records. Existing stats and tabs remain. Typecheck, focused lint (existing unused-import warnings only), and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Lead week dropdown faces:** Each week option in the expanded intake chart now shows up to five lead avatars plus an overflow count, using the existing picker face-stack style. Week search also finds a week by a lead's name. Verified visually in local Mock mode with the dropdown open; typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Lead trend chart detail search and faces:** The expanded 12-week lead chart now has a search field above the right-hand list for filtering the selected week's leads. The week header shows up to five lead avatars, an overflow count, and the total; each listed lead links to its record. Verified in local Mock mode by searching a selected week, plus typecheck, focused lint, and diff check. Local only, per the user's release instruction.

- **Sep 24 Customer link access feedback:** A lead's linked customer record could send a user without Customers access to Offerings with no explanation. The customer detail route now shows a clear access-required state for that account, before reading customer data; authorized users still open the full record. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Lead analytics detail-link hierarchy:** The expanded lead row keeps the contact, email, phone, LinkedIn, company, and owner actionable, but presents them as ordinary dark or muted details until hover/focus. The full lead link remains the single blue action, removing the wall of blue text in the analytics popup. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review linked fields and save footer:** The separate review editor now uses searchable, identity-aware pickers for the next-step stakeholder, decision-circle contacts, confirmed competitors, external companies, and action owners. Existing Contact and Customer selections keep durable IDs; newly entered people and outside companies create or reuse records on save. The read view links those people, companies, competitors, and owners to their record pages. Contact reuse checks both account and name so stale mock IDs cannot silently attach the wrong person. Save/Cancel live in one sticky footer, with save errors beside the controls. Typecheck, focused lint, diff check, and local Mock-mode editor/picker/footer inspection pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review tab motion:** Switching between Decision brief, People & influence, and Next moves now uses the existing app tab-panel reveal and short content stagger, with the app's reduced-motion behavior. Verified local Mock-mode tab switching, typecheck, focused lint, and diff check. Local only, per the user's release instruction.

- **Sep 24 Lead analytics link hit areas:** In the status and Source performance popups, only the company or owner text opens its linked record. Their logo/avatar, cell spacing, and the rest of the lead row toggle the in-place details dropdown. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review subsection presentation:** Kept the three Decision brief, People & influence, and Next moves tabs after the user clarified they should remain. Their styling now matches the existing Opportunity, Solutioning, Offering, and Customer tab rows: compact text labels and counts, horizontal overflow, and a blue underline on the active tab. Removed the extra divider above this row. Verified visually in local Mock mode, plus typecheck, focused lint, and diff check. Local only, per the user's release instruction.

- **Sep 24 Solutioning linked record layout:** “What this is for” gives the opportunity column more room and renders each deal as a plain linked record with an icon and natural text wrapping. Contact links use the same restrained treatment, and the columns stack before they get cramped at narrower widths. The oversized opportunity pill shown in an older build is gone locally. Verified with typecheck, focused lint, diff check, and local Mock-mode visual inspection. Local only, per the user's release instruction.

- **Sep 24 Solutioning zoomed date alignment:** When Requested and Needed move off opposite sides of the visible timeline, their edge badges now share one row and use compact month/day labels, with full dates available as tooltips and accessible labels. Same-edge badges still stack. When the needed date is today and both sit beyond the window, one “Needed today” badge replaces the redundant floating Today pill. The extra blank space under zoomed rails is reduced. Verified on Mock request REQ-F0203 at 1.6× zoom; typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review read view:** Replaced the flat read-only field grid with a decision brief, people and influence, and next moves subtabs. The first view prioritizes why the customer must act, the agreed commitment, Freyr's approach, barriers, and confirmed competitors. The people view presents one compact decision-team roster with contact links, avatars, roles, areas, and sentiment, beside a smaller outside-influence panel with company marks; actions show accountable owners and deadlines. The separate edit page and persisted review fields remain intact. Typecheck, focused lint, diff check, and a read-only local Mock-mode inspection of all three subtabs pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review edit page and mock content:** The Opportunity review tab is a readable, plain view without the blue callout or disabled-looking fields. Edit review opens its own guarded page, like Edit offering; Save and Cancel return to the review tab. Seed-owned mock opportunities receive deterministic example reviews with a compelling event, next step, obstacles, strategy, linked stakeholders, third party, and owned actions; existing edited reviews remain intact. Typecheck, focused lint, mock review regression check, and local Mock-mode navigation/visual inspection pass. Local only, per the user's release instruction.

- **Sep 24 Claim-review progress:** Removed the expand arrow and its second progress-breakdown popup from the claim verification dialog. The goal bar, verified amount, target, claim amount/status, and supporting claim details remain in the review dialog where the decision is made. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Lead phone display:** Saved international numbers now keep the dialling code separate from the national number, so a stored `+1 7326105957` displays as `+1 732 610 5957` in the lead and analytics details. National numbers still group as before while typing. Typecheck, focused lint, and phone-format regression checks pass. Local only, per the user's release instruction.

- **Sep 24 Claim-review waiting contrast:** The verification dialog's waiting claim segment uses a deeper amber with a stronger hatch, and its amount label and legend use the same readable tone. This is scoped to the dialog so other performance charts keep their established status palette. Typecheck, focused lint, diff check, and local Mock-mode visual inspection pass. Local only, per the user's release instruction.

- **Sep 24 Performance verification dropdown hit area:** The entire “Waiting for your verification” header now opens and closes its claim queue, including the right-side group summary and empty space. When claims are selected, the bulk Verify and Clear buttons remain separate controls. Typecheck, focused lint, diff check, and a local Mock-mode right-edge click and selected-state layout inspection pass. Local only, per the user's release instruction.

- **Sep 24 Opportunity review:** Each Opportunity detail has an Opportunity review tab for the compelling event, agreed next step and highest stakeholder, two obstacles, confirmed competitors, Freyr's strategy, a seniority-by-function people-to-influence grid, external third parties, and owned actions with deadlines. Reviews persist on the Opportunity record. People added to the grid create or reuse Contact records on the linked Customer account, and their names open those contacts; changing a person's name resolves the correct contact rather than retaining the old name's link. Incomplete actions are rejected. Typecheck, focused lint, diff check, and local Mock-mode visual inspection pass. Local only, per the user's release instruction.

- **Sep 24 Linked record creation from pickers:** Saving a Lead now links its person to a real Contact on the linked Customer account, reusing an existing matching Contact. Clicking the name of an older text-only lead resolves that link on demand and opens the Contact. The Contact page links to its account's edit form so missing details can be completed. Meeting and Solutioning "create contact/deal" pickers now resolve a typed account before creating the linked record; Meeting's new deal choice creates an intentionally incomplete Opportunity that can be completed on its page. Lead-origin Solutioning requests carry the lead's Contact. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Company account linkage:** Saving a typed company on a Lead, Opportunity, Solutioning request, Meeting, or logged Performance result now creates or reuses a real Customer account and stores its ID. Selecting an existing company on a Lead stores its ID. Company links in Leads, analytics, Opportunities, Solutioning, Meetings, and Performance open Customer; older text-only company links resolve an account on click and attach matching Leads without changing their update timestamps. The lead form explains the account creation. Local only, per the user's release instruction.

- **Sep 24 Multiple Solutioning contributors:** Add a contributor now supports checking multiple eligible people, searching while selections persist, and adding the selected people in one `set-workstream` update. The dialog stays open if saving fails and clears its selections when dismissed or saved. The server already accepts contributor arrays and deduplicates them. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Change owner alignment:** The transfer arrow in the Solutioning Change owner dialog is aligned with the owner avatar/name row rather than centered against the two-line header plus avatar block. Local only, per the user's release instruction.

- **Sep 24 Solutioning timeline Today marker:** Zooming or panning the Needed By timeline no longer hides Today when its date leaves the visible range. A pinned Today pill stays at the nearest edge with a directional arrow; the rail line is shown only when Today is actually within the viewport. Typecheck, focused lint, and diff check pass. Local only, per the user's release instruction.

- **Sep 24 Lead analytics row details:** Lead rows in the Source performance and status popups now expand in place by clicking the row or name chevron. Expanded content shows the full request, contact links, background, notes, and timeline, plus a link to the full lead. The lead ID remains only in the navigation URL, not the visible row. Typecheck and focused lint pass. Local only, per the user's release instruction.

- **Sep 24 Lead intake popup copy:** Removed the redundant “Weekly lead intake ending on the newest lead in this workspace” subtitle from the expanded chart. Local only, per the user's release instruction.

- **Sep 24 Filter menu viewport placement:** The shared Filter menu now opens above its button when there is too little room below, and limits its two scrollable panes to the available viewport height. This keeps the full Status/Source/Owner option list reachable near the bottom of the Leads page and on other pages using the same menu. Local only, per the user's release instruction.

- **Sep 24 Solutioning attendee and lead LinkedIn feedback:** Meeting requests now show a larger centered “No one added yet” attendee area, which becomes a centered set of removable people chips after selection. New leads with a LinkedIn URL open their detail row while the background profile lookup runs; the lead row shows an animated “Getting LinkedIn details…” status until it finishes, without a persistent “LinkedIn saved” label. The profile card also describes its loading and retry states. Local only, per the user's release instruction.

- **Sep 24 Lead-origin Solutioning requests:** The request chooser and form show the lead person's name and company, never the lead ID. A linked Customer is preselected when present; if an older lead has only company text, creating its request now links that name to a Customer account. The lead person appears as the contact when no Customer POC is selected. Any recorded lead interest is visible beside the required Solutioning brief, which still must be written. New requests persist `leadRef`/`leadName` separately from the brief, and their detail page shows the person's name while using the ID only in its link back to the filtered, expanded lead. Local only, not deployed, per the user's current release instruction.

- **Sep 24 Lead LinkedIn parsing and layout:** The public-profile parser now keeps the provider's professional details (roles, education fields, honors, organizations, audience counts, post type/engagement) and correctly reads numeric post timestamps, which previously became null. The lead row shows a compact LinkedIn summary; a wide, scrollable profile popup organizes the full facts and posts, with the long biography collapsed by default. The redundant Ask AI action was removed from the LinkedIn card; the bottom-right assistant remains available. Previously saved post snapshots without dates stay undated until refreshed after this code is deployed. Checked the local Albert Bourla lead UI, 4 focused parser tests, typecheck, focused lint (one existing unused-prop warning), and diff check. Local only; the user's current release instruction is to keep it local.

- **Sep 24 Lead form Company field alignment:** When entering a company name that is not in the account list, the Company text box fills its entire form column like Person and the other fields. “Pick from list” sits inside the right end of that box. The help hint now explains that saving creates a linked Customer account. Local only, not deployed.

- **Sep 24 Lead company entry carries picker search:** In the Lead form, choosing “Add a company not on the list” now fills the free-text Company field with the search already typed into the account picker (for example, `pfizer`) and focuses it for editing. The shared single-select creation callback can receive its trimmed query; other pickers may ignore it. Typecheck and focused lint pass (two existing warnings), diff check passes. Local only, not deployed.

- **Sep 24 Market Intel stale-check repair and selection preview:** Production's daily collection claim ran, but its slow news, website, authority, and rundown passes consumed the run's 18-minute Apify window before company posts were reached; recent runs refreshed zero companies and some Last checked ages reached 7–14 days. The company and people pass now goes first, daily news scans up to six companies at once with an eight-minute budget, and the dedicated website pass scans six at once instead of repeating the website pass in the same daily run. Website failures record a failed attempt without advancing the successful-check timestamp. Daily logs now include news checked, failed, and remaining counts. Manage customers and competitors show up to five selected company logos/names in the sticky save bar plus an overflow count. Typecheck, focused lint, and diff check pass. Local only; a production deployment and catch-up run are still required to change live freshness values.

- **Sep 24 release lockfile repair:** The AWS dev build exposed two missing optional `@emnapi` package entries in `package-lock.json`. Restored those entries and verified a clean npm 10 dependency check before rerunning the dev deployment. Production promotion remains tied to the verified dev image.

- **Sep 24 Manage tracking, publisher links, and M&A filters:** Admins can click an Active status on the Manage customers or competitors table to open the same wide, searchable people-tracking popup used on the Intel list. The publisher name in Latest intelligence now links to the publisher homepage when its identity is known; the headline still links to the article, and an uncertain publisher stays plain text rather than linking to an aggregator. M&A status, division, time, deal size, and source options now live in one Filter menu beside search and the icon-only view switch. Verified in the local Mock browser with a Manage competitor popup, M&A menu categories, and separate Reuters homepage/article links; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 Market Intel follow-ups:** Expanded the frozen Mock competitor list from eight to twenty companies using collected source records, and migrated existing Mock tracking/bookmarks so all twenty appear while retaining prior user choices. Customer and competitor empty-list guidance sits closer to the top; the Thought Leadership explanatory paragraph is gone; the Manage customers help icon aligns with its heading; and the people-tracking popup is wider with a name/email search. M&A and Thought Leadership now persist Table/Tile choices independently, preventing a switch on one board from changing the other. Browser checks confirmed 20/20 Mock competitors and that the M&A Table view remains selected after switching trackers. Local only, not deployed.

- **Sep 24 Last checked header:** Removed the question-mark hint from the Customer and Competitor Intel list header, leaving the column label and freshness values intact. Local only, not deployed.

- **Sep 24 colored filter choices and quiet view switch:** Shared filter menus now show colored icon chips and matching selected checks for options with semantic colors. Customer and Competitor Intel and materials division choices display MPR, MDV, and CON chips that match their table badges. Icon-only view switches no longer show a hover tooltip while retaining their accessible label and labeled dropdown choices. The local Mock company list was visually inspected; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 compact briefing view selector:** Individual Customer and Competitor briefing toolbars now show only the selected List/Tile/Table icon in the view dropdown; the open menu retains all three labeled choices. Verified visually and by opening the choices on a local Mock ArisGlobal briefing; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 Freyr AI launcher position:** Removed the Market Intel detail-rail rule that shifted the launcher 356px inward whenever the rail was on the right. It now stays in the viewport's bottom-right corner with either rail layout. Both left and right ArisGlobal Mock briefing layouts were visually inspected; diff check passes. Local only, not deployed.

- **Sep 24 company details and source clarity:** The company-details rail now has compact icon buttons to move it left or right directly on the briefing and to hide it. The separate Settings control was removed; right remains the default, and the chosen side is remembered. LinkedIn source rows and post chips use the LinkedIn mark and identify company versus people posts, while website and news cards retain their actual provenance. Goal rows show the creation date without time; the stored timestamp remains intact. A local Mock ArisGlobal briefing confirmed the side switch and a source filter that shows its five LinkedIn posts out of 22 items. Typecheck and diff check pass; focused lint has only existing warnings. Local only, not deployed.

- **Sep 24 compact Market Intel filters and tracked-post preview:** Customer and Competitor Intel now put starred companies, bookmarked items, division, and time period behind the shared Filter menu, leaving search, sort, and the icon-only view switch on one row. The tracked-people popup opens a person's recent collected posts on demand, with source links, engagement counts, empty states, and repeated URL captures shown once. Local Mock customer and competitor toolbars, bookmark selection, and a Roche post preview were inspected; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 Solutioning and Goals corrections:** Zoomed Solutioning deadlines keep Requested and Needed dates visible as directional edge indicators when their markers move outside the window; horizontal wheel panning now matches the Goals timeline. The BD member's empty Goals message now accurately says an admin assigns goals from Goal Master. Requests started from a lead require a real Solutioning brief instead of accepting only an automatic lead reference. The unexplained question-mark help icon beside lead follow-up age was removed. Local Mock zoomed timeline inspected; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 Market Intel source links:** The publisher/source name above each Latest intelligence headline in the Customer and Competitor tables now opens the same article URL as the headline. Names without a valid URL remain plain text. Typecheck, focused lint, diff check, and local Mock customer-table accessibility inspection pass; source and headline links resolve to matching URLs. Local only, not deployed.

- **Sep 24 Market Intel activity mix:** Customer and competitor table rows now stack Posts, News, and Website vertically in one Activity mix column, including pending-row placeholders. The narrower column gives the headline more room. Typecheck, focused lint, diff check, and local Mock customer-table visual inspection pass. Local only, not deployed.

- **Sep 24 compact Intel view switch:** Customer and competitor lists again offer Table and Tile views through an icon-only dropdown on the search/filter row; Table remains their default and each choice is remembered per member and section. Market Intel's Thought Leadership and M&A trackers also offer the same compact dropdown and now have actual table layouts alongside their existing tiles; Market Intel keeps Tile as its default. The misleading Signals count stays absent from company tiles. Typecheck and diff check pass, focused lint has only an existing ColorSelect hook-dependency warning, and all three sections and both Market tracker tables were inspected in local Mock mode. Local only, not deployed.

- **Sep 24 Market Intel card source headers:** Briefing cards put the signal first, item type second, and the named article source third. Signal and provenance chips are smaller; the Financial/Operational label now reads “Financial or operational updates.” Repeated-story sources open from a compact control in the same header row rather than consuming space below the summary. Typecheck, focused lint, diff check, and a Mock briefing check of the visible row and expanded source menu pass. Local only, not deployed.

- **Sep 24 Market Intel Freyr competitor meaning and feed summaries:** Customer briefings now count and filter Competitor Mentions only when a company on Freyr's competitor catalogue is actually named. Older classifier labels based on a customer's pharmaceutical rivals are corrected on read, and future classification receives the same rule. The sidebar names the Freyr scope explicitly. Saved items now sort newest first like the main feed, and article AI summaries display at most two lines. Summaries remain absent where no readable article text was collected or generation failed; posts and website items still use their existing content and signal context. Focused regression check, typecheck, lint (one pre-existing unused import warning), and diff check pass. Local only, not deployed.

- **Sep 24 Market Intel people for BD members:** BD members with Market Intel access can add people from a customer briefing and stop following existing people. The add and remove endpoints use the same dedicated permission as the visible controls. A member's people choices now persist in their own Market Intel list: stopping hides that person's posts for that member without deleting the team's collected record, and Add person offers a one-click way to re-follow them or accepts a new LinkedIn profile. The main customer list's people display follows the same selection. Typecheck, focused lint, diff check, and a Mock-mode stop/re-follow round trip pass; the authenticated local session was admin, so a live BD-role session has not yet been exercised. Local only, not deployed.

- **Sep 24 Complete Market Intel rundowns:** Company briefings now show the rundown directly on the white page in smaller type. Legacy or overlong rundowns that ended with an ellipsis display only complete sentences; new digests no longer append an ellipsis at a word limit. Missing-rundown backfill recognizes cutoffs with no complete sentence as missing. Typecheck and targeted rundown tests pass. Local only, not deployed.

- **Sep 24 Market Intel company lists:** Customer and competitor Intel tables show Division in its own column; the Manage lists do too. The main tables no longer have Intelligence Pulse, and Tracking appears only for admins. Table and Tile choice was restored later the same day (see the compact view switch entry). Typecheck, focused lint, and local Mock customer, competitor, and Manage-list inspection pass. Local only, not deployed.

- **Sep 24 Manage companies tab label:** The first Manage customers/competitors scope chip reads “All” instead of “Everything.” Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 24 Market Intel addition limit and check times:** The BD member's remaining new-company allowance now appears at the top of Track a customer/competitor, explaining the shared 20-company cap and that selecting existing records is unrestricted. At zero, the dialog still opens to explain the limit but its form cannot submit. The list's “Freshness” column is now “Last checked,” with a hint that it reflects the latest successful source check and that daily company checks can finish at different times. Typecheck, focused lint, and diff check pass; the local Mock customer dialog and banner were inspected (admin role hides the BD-only allowance). Local only, not deployed.

- **Sep 24 Market Intel labels:** The sidebar, three section tabs and headings, company and management back links, tracking copy, and in-app guide now use Customer Intel, Competitor Intel, and Market Intel. Verified in the local Mock workspace with its banner visible; typecheck and focused lint pass (one existing unused-import warning). Local only, not deployed.

- **Sep 23 Lead chart week picker:** Replaced the browser-native week selector in the expanded lead intake chart with the app's bounded, searchable styled menu. Its rows keep week and lead count together; selection closes the menu and updates the records, and outside clicks dismiss it. Verified in local Mock mode after the preview process was restarted; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Lead intake chart records:** The expanded 12-week lead intake chart now keeps the selected week's complete lead list in its right panel instead of saying records are unavailable. Clicking a plotted point or choosing a week updates the list, with an explicit empty state for weeks without leads. Verified the Jul 27 point displays all nine Mock leads and the Mock banner remains visible; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Person contact details:** Customer contact add/edit now uses a searchable flag and dialing-code picker beside a formatted, length-limited phone number; choosing a code synchronizes the person's country, and invalid short numbers cannot be saved. The form shows the LinkedIn mark and offers a Google Maps action for a selected location. Contact profiles and both contact-list views show country-aware phone numbers, with location links where recorded; the lead form's LinkedIn field carries the same mark. Verified the contact dialog and code/country synchronization in local Mock mode with its banner visible; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Hover cursor cleanup:** Relative timestamps still reveal their exact local time on hover, but no longer force the question-mark help cursor. The shared timestamp component was the only `cursor-help` use in the app; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Goal progress tooltip status colors:** The People and Org performance bar-chart hover now splits unverified progress into red sent-back and yellow waiting segments, matching the counts and status legend in the same tooltip. Shared chart rendering retains its existing fallback for other callers. Typecheck, focused lint, and diff check pass; the local Mock-mode chart and banner were inspected. Local only, not deployed.

- **Sep 23 Claim verification progress zoom:** The progress bar in “Verify this claim” now has an expand control. Its larger, read-only view shows verified progress against the target and every result behind the goal; clicking the status segments or side filters narrows the list, and the claim under review remains highlighted. Closing returns to the verification decision without changing it. Verified in local Mock mode, including Waiting filtering and return focus; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Result correction popup:** The Goals “Fix and resubmit result” dialog is narrower and organized around the correction: original result and status in a compact header, reviewer feedback beside the editable amount/date/account fields, and supporting evidence in a small secondary panel. The same update/resubmission behavior is preserved. Verified visually in local Mock mode with its banner visible; typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Rich customer contacts:** The add/edit contact dialog now has a wider, organized layout for professional details, reachability, location, and relationship context. It saves department, city/country, buying role, team relationship notes, and professional background, and displays the new context on the contact profile. Adding from Key contacts now starts starred and persists that choice; the edit form preserves existing key status. Development migrations `030_key_contacts.sql` and `031_contact_context.sql` were applied to the development Supabase project (not production). Verified the Mock-mode dialog and banner visually, and typecheck and focused lint pass. Local code only, not deployed; both migrations are required on production before deploying this change.

- **Sep 23 Request origin company logo:** The persistent “For this opportunity/customer” header in the Solutioning request dialog now displays the customer’s `CompanyLogo` instead of a generic briefcase/building icon. Existing real logo assets and fallback marks remain consistent with the rest of the app. Verified the header in the Mock-mode chooser; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Solutioning request origin in dialog header:** When launched from an opportunity or customer, both the request-kind chooser and every request form now keep a clear “For this opportunity/customer” label and record name in the modal header. This replaces the opportunity-only note in the scrolling form body, so the origin stays visible while selecting the kind and filling the form. Verified in the opportunity flow in Mock-mode; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Opportunity request type display:** Solutioning requests in the opportunity/customer connected-record table now show their selected request kind as the same colored icon chip used in Solutioning, with the subtype beneath it. The type remains plain data for search and filtering, but no longer looks like an editable field in the record table. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Connected-record rows are complete:** The shared customer/opportunity connected-record view no longer caps non-table bands at eight items or prints an “and N more” footer beneath tables that already show every row. Month-by-month accrual schedules and other connected sections render their complete item lists on the page. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Lead status donut selection:** In the enlarged Leads status workspace, clicking a donut slice selects that status and immediately filters the lead table on the right; clicking the selected slice again returns to all leads. The selected slice stays emphasized and the enlarged chart no longer opens hover tooltips. The existing status list remains an equivalent filter. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 graph pop-up explorer:** Graph pop-ups now use a consistent, larger chart workspace, including the Lead analytics workspaces. Shared charts have a category explorer beside the plot; selecting a segment isolates it, and zero-value categories show a clear empty state. The organization Goals pace chart lists the goals behind each pace category. Legacy analytics and voice chart pop-ups use the same layout, with searchable records where available. Verified Target met, Ahead, and No schedule in local Mock mode; focused lint, typecheck, and production build pass. The build briefly interrupted the local dev server; it was restarted and the opportunity page and Mock banner were verified afterward. Do not run another production build against the active dev server. Local only, not deployed.

- **Sep 23 Agent lead-status follow-ups:** A follow-up such as “Who are the new ones?” after a lead breakdown now retains the lead topic and reads exact status matches from the complete permitted lead store. It uses the short streamed answer path, rather than the broad tool loop, and gives names and companies with a total; large matches state when only the first 50 are shown. In local Mock mode, the same two-question exchange returned the 68-lead breakdown and all 14 New people instead of an unreachable-assistant message. Typecheck, focused lint, and diff check pass. This fixes the reproduced routing weakness; it does not rule out unrelated provider outages. Local only, not deployed.

- **Sep 23 Contract group dropdowns:** Customer and status groups on the Contracts page now have full-width expand/collapse headers with a chevron, count, and value. A compact Open all / Close all control sits next to the grouping selector; changing grouping resets the folded state. Verified in local Mock mode that one customer folds independently, all groups close and reopen, status grouping works, and the Mock banner stays visible. Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Solutioning status pills:** The Solutioning table now uses the same status colors and icons as the record detail and grouping views. Request initiated is blue with a dashed circle, Assigned is cyan with a person check, Work in progress is violet with a progress mark, Completed is green with a check, and Delayed is orange with a clock. Verified in the local Mock table that all five render distinct computed colors and icons; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Mock-mode people names:** The 240 generated customer and showroom contacts now have distinct given names and surnames, while the familiar first thirty showroom identities stay stable. Existing generated Leads, Meetings, Solutioning, and Contracts rows replace only old synthetic names and email slugs in place, preserving status, notes, manual edits, and hand-created rows. The shared cast keeps links consistent across those modules and customer contacts. Verified with a focused uniqueness/migration test, typecheck, lint, and the local Mock Leads page; the Mock banner remained visible. Local only, not deployed.

- **Sep 23 Solutioning row actions are explicit:** Empty cells in request, submission, and presentation rows no longer toggle the inline breakdown or show a pointer cursor. The title and document-count links open the full record; only the Actions chevron expands or collapses the inline breakdown. Verified in local Mock mode by clicking an empty cell and the chevron on the same request; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Deviations summary stays on one line:** The Needs attention and Most deviations chip groups use one non-wrapping strip. At narrower widths, that strip scrolls horizontally instead of moving owner chips onto a second line. Verified visually in local Mock mode; typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Optional first-column pin in opportunity summaries:** The first column of the booked/accrual/customer summary table now scrolls away by default. A quiet pin inside its header toggles sticky behavior without adding table space, and the choice persists separately for each summary. Pinned cells have opaque backgrounds so horizontal scrolling cannot show figures through them. Verified in the Mock accrual table by scrolling with the pin on and off and reloading with it off; typecheck and focused lint pass (four existing warnings). Local only, not deployed.

- **Sep 23 Solutioning attendee picker and popup dismissal:** The meeting request now has a dedicated attendee card with an Add people control and visible, removable selected teammates. The shared selectors and other click-away menus use capture-phase pointer events so clicks elsewhere inside a popup dismiss an open menu reliably; nested selector buttons in the request form are no longer wrapped in labels. Verified in the Belmara Pharma Mock request: attendee, customer, and Customer POC menus close on outside click; the attendee trigger toggles and Escape closes it; selecting a teammate preserves the choice. Typecheck, focused lint, and production build pass. Local only, not deployed.

- **Sep 23 Opportunity-to-Solutioning context:** Request Solutioning from an opportunity now names that opportunity and account in both the type chooser and the selected request form. The form shows the originating account and opportunity as fixed context, so a request raised there cannot silently lose its deal link. Imported pipeline opportunities without a linked Customer record use their account name for the request without inventing a Customer ID; existing account records still resolve by ID or name. Typecheck, focused lint, and diff check pass. Local only, not deployed.

- **Sep 23 Currency flags in conversion rows:** The deal Revenue Accrual table now shows the US flag in its converted USD row instead of a dollar-sign avatar. The matching opportunity line-value comparison table now flags both its recorded currency and converted USD row. The shared currency picker already showed flags. Typecheck and focused lint pass (pre-existing unused-symbol warnings only). Local only, not deployed.

- **Sep 23 Deal team workload preview:** The “Who else is on this deal?” picker is wider and each teammate name expands independently of its add checkbox. It shows the person’s other active opportunities and assigned Solutioning work, roles, statuses, dates, and Mock-aware record links. It excludes the current deal, finished work, and Solutioning records the viewer cannot open; it makes clear that assignment counts are not hours or availability. Verified on the Kimberly Clark Mock deal: Daniel Foster’s recorded 20 active deals and 17 Solutioning items load, and selecting him leaves details visible without saving. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 23 Lead LinkedIn enrichment:** New and edited leads accept a validated personal LinkedIn URL. The lead saves immediately, then the existing configured profile provider and a bounded recent-public-post lookup store source-labelled, dated facts on that lead; failures keep the URL with a retry action and never substitute mock profile data. The row and expanded lead show lookup status, profile content, a profile link, and an Ask AI action; the permitted agent workspace now reads the saved snapshot and must distinguish missing/stale facts. Refreshing the snapshot does not change the lead's “Last moved” date. LinkedIn URLs are included in lead CSV export. Focused normalizer tests, typecheck, lint (one pre-existing unused-prop warning), and production build pass. The signed-in Mock-mode browser confirms the new form layout; no paid live-profile lookup was run. Local only, not deployed.

- **Sep 22 Solutioning timeline audit:** New timeline events identify the people added or removed from each division, old and new lead/assignee/owner/priority/status values, exact edited request fields, document names and versions, copied files, linked record names, and lifecycle outcomes. No-op saves no longer create empty activity. The timeline retains distinct same-minute actions instead of collapsing them, and reading a record no longer discards events after the first 200 or truncates detailed changes to 240 characters. Historic count-only entries remain as originally recorded because the missing names cannot be reconstructed reliably. Focused audit tests, typecheck, and lint pass. Local only, not deployed.

- **Sep 22 Open record from entity popups:** Shared single/multi selectors, people pickers, and person hover cards now show a quiet open-in-new-tab arrow on linked record rows while hovered or focused; the arrow leaves the selection and form in place. Customer, contact, opportunity, offering, teammate, and goal options across the main forms now supply their record destination where one exists. The shared arrow keeps `/mock-mode` in links opened from Mock mode. Verified on the Belmara Pharma meeting-request popup: opening Marcello Bianchi launched his Mock contact page in a separate tab while the form stayed open. Local only, not deployed.

- **Sep 22 Solutioning Customer POC picker:** The meeting/request form now has a visible Clear action beside a selected Customer POC and an explicit “Clear selected contacts” row in the picker. Clicking outside the multi-select uses pointer events to close it reliably. Verified locally on Belmara Pharma by selecting and clearing the mock “test” contact; typecheck passes and focused lint has no errors (one existing hook-dependency warning in the shared picker). Local only, not deployed.

- **Sep 22 Customer contacts shortcut:** “All N contacts” and the key-contact edit shortcut now select the account's Contacts tab, reveal that tab in the horizontal strip, and scroll the strip and contact list below the sticky header into view. Verified on Belmara Pharma in localhost Mock mode; typecheck and focused lint pass. Local only, not deployed.

- **Sep 22 Mock Solutioning document assignment:** The two Solutioning pages
  offered six retired mock teammate names while stored assignments normalized
  those names to the current roster, making a successful save display as
  “Nobody on it.” Both pages now share canonical Mock Solutioning choices;
  document and workstream controls also show a saved assignee who is no longer
  selectable. Verified SUB-F0342's analysis assignee displays as Margaret
  Whitfield after saving and a full reload; roster regression test, typecheck,
  and focused lint pass. Local only, not deployed.

- **Sep 22 Create submission from existing request:** The detail-page action
  now carries the request brief into its submission or presentation. Linked
  work no longer fails the fresh-request brief/date validator when a legacy
  request lacks details or its due date has passed; new standalone records
  still require both. The API verifies the linked parent and copies its
  canonical brief/date. Verified in localhost Mock mode by creating SUB-0005
  from REQ-F0211, seeing the inherited brief and documents, and running the
  focused validation test, typecheck, and lint. Local only, not deployed.

- **Sep 22 Solutioning owner confirmation:** Replaced the cramped generic
  dialog with a compact request summary and a clear current-owner-to-new-owner
  row with avatars. Verified its layout in a localhost Mock request without
  changing the owner; typecheck and focused lint pass. Local only, not deployed.

- **Sep 22 Solutioning deadline zoom:** The “Where it stands” rail now has the
  same zoom in, zoom out, Fit, scroll-to-zoom, and drag-to-pan controls as Goals.
  It starts with all three dates visible and shows the current date range when
  zoomed. Verified zoom and reset in a localhost Mock request; typecheck and
  focused lint pass. Local only, not deployed.

- **Sep 22 FDL Components loading header:** The route's loading screen now
  uses a title-sized skeleton instead of rendering the full page title above
  placeholder content. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 22 Verify button hover:** Actionable “Not verified” goal pills now turn
  green when their hover label changes to “Verify”; the resting status remains
  red, and hovering a signed-off pill still shows the red undo action. Typecheck
  and focused lint pass. Local only, not deployed.

- **Sep 22 Org goal subgoal folding:** Each subgoal header now folds its
  people list while keeping the name, owner, target, progress, and sign-off
  visible. A Collapse all / Expand all control handles the whole goal. Verified
  both controls in localhost Mock mode on Booked Revenue; typecheck and focused
  lint pass. Local only, not deployed.

- **Sep 22 Goal progress status colors:** The compact period, group, person,
  and table bars now split unchecked results into red sent-back and yellow
  awaiting-review segments, matching the expanded timeline. A small sent-back
  amount no longer recolors all pending progress red. Typecheck and focused
  lint pass. Local only, not deployed.

- **Sep 22 Agent latency, streaming, and totals follow-up:** Localhost Vertex now streams visible words into the full chat and dock for single-pass questions; the shared client parser also handles ordinary JSON tool replies and hides follow-up metadata. Exact lead counts, personal tracking, broad offering inventory, and Opportunities totals use small grounded one-call prompts. Chrome retests: leads 68 with all six statuses; offerings 57 with category counts and links; Opportunities 152 and USD24,368,623 Estimated TCV (635 input tokens, first text 3.27s); broad offerings first text 1.65s. Pipeline's 94 open pitch-session deals total USD36.0M and remain separate from the Opportunities page; cooling-deal answers now point to Pipeline. The Agent linked original GSK posts and declined to invent Hutchmed terms absent from this frozen Mock feed. Local Vertex verification, typecheck, focused lint, stream parser tests, Vertex response tests, Chrome answer checks, and production build pass. Harder tool questions still take roughly 5–6s, so a blanket under-three-second guarantee is not met. Production still defaults to Anthropic: ECS Google workload federation and live Vertex behavior have not been verified here, and no deployment was made.

- **Sep 22 Agent latency and Market Intel grounding:** Localhost is configured for Vertex AI; the deployed production build remains on the older Anthropic path. Named-company Market Intel retrieval now reads one company and its followed people directly, limits briefings to recent dated source excerpts, and preserves a full-feed fallback for legacy rows. Straightforward latest/news/post questions use a short single-pass Vertex prompt without the unrelated offerings corpus or extra tools; chat history is capped at 32,000 characters. In the localhost UI, a GSK post question returned linked original posts and used one Vertex model call with about 3,000 input tokens (down from about 6,900 on the prior broad path). Server-side work measured about 3.4 seconds and the request about 6.3 seconds; user-visible elapsed was still about 11 seconds, so the under-three-second goal is not met. The current Agent list answer correctly reports 20 tracked companies (12 customers, 8 competitors), matching the Market Intel UI; an older chat incorrectly said 90 and linked Pfizer. Pfizer's old linked briefing has no collected feed in this local real-data workspace. The agent must not invent updates or link to an empty briefing. Typecheck and focused lint pass. Local only, not deployed.

- **Sep 22 Market Intel competitor mention chips:** Selecting a named competitor filters to stories that actually mention that company, highlights the selected chip, and shows a result count and Clear filter action above the feed. Clicking the same chip again restores the full feed; manual signal/source changes clear the named chip state. Verified in localhost Mock mode on Takeda/Sanofi by toggling the chip on and off; typecheck and focused lint pass. Local only, not deployed.

- **Sep 22 Sales Materials group spacing:** Restored the original 24px gap
  between grouped offering rows. The actual issue was the fixed-width columns
  separating each header's offering name, category, and material count; those
  elements now sit together with content-sized spacing. Verified in localhost
  Mock mode; typecheck passes. Local only, not deployed.

- **Sep 22 mock Sales Materials dates:** The 700-day mock upload-date spread
  produced 2024–25 timestamps. All generated showroom materials and legacy
  demo assets now use stable Aug–Sep 2026 dates; existing persisted mock rows
  are upgraded on catalogue load without touching live uploads. Verified all
  710 visible Sales Materials in localhost Mock mode have dates from Aug 1 to
  Sep 21, 2026; typecheck passes. Local only, not deployed.

- **Sep 22 Agent popup chat history:** The bottom-right Agent popup now has a
  three-line history button. Its history is grouped by
  date and uses the same saved conversations as the full Agent page; selecting
  a chat opens it inside the popup. Verified in the localhost Mock UI by
  switching between saved chats and starting a blank chat. Typecheck and
  focused lint pass. Local only, not deployed.

- **Sep 22 Agent popup history flow:** Removed the standalone plus button from
  the compact chat header. The history control now switches to a back arrow,
  and both history and chat views slide/fade into place; reduced-motion users
  see an instant switch. "New chat" remains the single creation action at the
  top of past chats. Verified in localhost Mock mode by opening history and
  starting a fresh chat; typecheck and focused lint pass. Local only, not
  deployed.

- **Sep 22 Agent popup response rendering:** The compact Agent popup now
  renders fenced chart responses as charts and displays Markdown status bullets
  without stray asterisks. The full Agent page and popup share one chart
  parser/renderer. Verified on localhost using the saved lead-status reply;
  typecheck and focused inline-link tests pass. Local only, not deployed.

- **Sep 21 Vertex AI foundation:** Enabled Agent Platform/Vertex AI API in GCP
  project `sound-fastness-480519-a6`, added the current Google Gen AI SDK,
  Application Default Credentials support, a provider-switched Gemini tool
  loop, health diagnostics, a connection verifier, and the AWS Workload
  Identity Federation configuration. Local ADC and the live Vertex request are
  verified. The Google service account can be impersonated only by AWS account
  `602367507820` role `freyr-sales-ecs-task-role`. Anthropic remains the default
  until federation is verified inside ECS. The Vertex provider was exercised
  end-to-end through the localhost Mock UI for offering and customer retrieval,
  internal links, and Market Intel tool routing. UI testing found and fixed a
  Gemini thought-part leak, reduced ordinary warm tool requests from the first
  11-second run to roughly 3–6 seconds with minimal thinking, and repaired named
  customer links that collapsed to the Customers index. The same pass fixed the
  agent's Market Intel reader to use the committed frozen feed in Mock mode;
  the UI now returns real captured GSK posts with their exact LinkedIn links.
  Health reports the Vertex brain working; typecheck, focused agent tests, and
  production build pass. Local only, not deployed.

- **Sep 21 Market Intelligence row alignment:** Customer and Competitor list
  rows vertically center the company name/tag block against its logo, star,
  pulse, activity, and intelligence columns. Companies without a division tag
  no longer leave the name pinned to the logo's top edge. Verified in the
  localhost Competitor Intelligence list; typecheck and rule tests pass. Local
  only, not deployed.

- **Sep 21 Market Intelligence company-column spacing:** Customer and
  Competitor list views give the Company column more width, and division chips
  are now anchored immediately beneath the company name in the same vertical
  block. Long names can wrap without leaving the tag stranded near the bottom
  of the row. Verified on localhost in Customer and Competitor Intelligence
  list views; typecheck and rule tests pass. Local only, not deployed.
- **Sep 21 Market Intelligence supporting-source labels:** Expanded “other
  sources” entries now lead with the specific article or post headline, then
  show the publisher, content type, and date. A source name alone is not enough
  to explain what evidence supports the grouped story. Verified on localhost
  in the company-briefing table view; typecheck and rule tests pass. Local
  only, not deployed.

- **Sep 21 Market Intelligence page selector restored:** Customer and
  Competitor Intelligence once again show the shared three-option selector at
  the top of the page, matching the Market Intelligence view. People can move
  directly among Customer, Competitor, and Market Intelligence without using
  the sidebar, and the selector preserves `/mock-mode` while switching. Verified
  across all three destinations on localhost; typecheck and rule tests pass.
  Local only, not deployed.

- **Sep 21 frozen real Market Intelligence workspace:** Mock Customer,
  Competitor, and Market Intelligence now use a committed Sep 14 capture from
  the real public-data workspace: 20 companies, 36 tracked people, 457 company
  items, 19 M&A deals, and 40 thought-leadership publications. Company cards,
  briefings, supporting sources, people posts, M&A, and thought leadership keep
  their exact public destinations; four dead links found in the capture were
  excluded. Mock runtime never refreshes this material. The one-time migration
  removes retired `mockgen-*` companies, keeps reviewer-added companies in an
  honest collecting state, and puts the replacement snapshot on the reviewer's
  list. Regenerate only by explicitly running
  `scripts/freeze-market-intel-workspace.mjs`; normal app use never calls the
  real feed for this snapshot. Verified on localhost across all three Market
  Intelligence views and both market trackers; typecheck, rule tests, snapshot
  parity tests, and whitespace checks pass. Local only, not deployed.

- **Sep 21 Market Intelligence list revamp:** Customer and Competitor
  Intelligence list views now carry the same decision-useful information as
  their tiles: activity sparklines, momentum, posts/news/site/signal counts,
  newest intelligence, division context, freshness/watch state, and customer
  people facepiles. The shared comparison ledger fits every column at the
  normal desktop width, pending companies retain the same structure, and
  tile/list switches have directional staggered motion with reduced-motion
  support. Verified on localhost Mock for both customer and competitor views;
  browser console clean. Typecheck and rule tests pass. Local only, not
  deployed.

- **Sep 21 logged-result deletion dialog:** The trash icon on an unlocked
  result now opens an immediate centered confirmation showing the goal, date,
  person, and amount. It no longer hides the confirmation at the bottom of an
  expanded row below the viewport. Existing ownership and verified-lock rules
  remain enforced. Verified on localhost Mock and cancelled before deletion.
  Typecheck and rule tests pass. Local only, not deployed.

- **Sep 21 send-back reason enforcement:** The required “What needs fixing”
  note in the claim review dialog now keeps Send it back disabled for empty or
  whitespace-only input, shows an inline error after an empty blur, trims the
  saved note, and is enforced again at the API and data-store boundaries.
  Verified in the localhost Mock flow without submitting a claim. Typecheck and
  rule tests pass. Local only, not deployed.

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

- **Sep 21 Market Intel source badges:** Source identity and source-type chips
  use one neutral blue treatment across company briefings. Signal/category
  chips keep their semantic colors; publisher colors must not imply a signal.

- **Sep 21 mock-workspace banner:** Every signed-in mock workspace page must
  keep the full-width blue “In progress mode · Mock workspace” banner above
  the application chrome. The `/mock-mode/` URL is a second cue, not a
  replacement for the visible banner. Document workspaces keep the banner too.

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

The Solutioning overview rail now keeps the Owner and Where it stands cards at their natural height, so the Requested and Needed labels and dates stay inside the deadline card instead of being clipped at its bottom edge. Completed locally, not deployed.

The Solutioning activity Timeline now ends immediately after its final visible event on short histories instead of stretching to fill the overview rail. Longer histories are capped to a compact window and scroll inside the card, preserving access without leaving a large empty panel. Completed locally, not deployed.

Expanded Solutioning previews now place the document count directly in the section label, for example “Documents (2),” instead of separating the number at the far edge of the panel. Completed locally, not deployed.

Long pinned tables now coalesce scroll measurements into one animation frame and listen through one capture path. The Solutioning request list also mounts its 443 detailed rows in generous batches as the reader approaches them instead of creating more than 15,000 elements up front. Scrolling stays continuous, and the floating header and bottom horizontal rail keep their existing behavior. Completed locally, not deployed.

In expandable record tables, blank row space belongs to the inline breakdown. Only the visible record or entity label navigates to another page; links must not stretch across otherwise empty cells. Solutioning titles now hug their text, Opportunities rows toggle their breakdown instead of navigating, and linked customer labels in Opportunities and Leads use content-sized hit areas. Completed locally, not deployed.

Request details label the linked context explicitly. “What this is for” uses one restrained panel with Customer, Opportunities, and Contacts columns, preserving the existing links and showing “None linked” where a relationship is absent. Completed locally, not deployed.

### Sep 17: customer band tabs omit redundant actions
Customer connection tabs no longer repeat record-team editing controls or links such as “The team” and “All deals” beside the active band summary. The selected tab already identifies and opens that destination, so the duplicated action row is removed across all customer band tabs. Completed locally, not deployed.

### Sep 19: expanded chart record popups are inspectable
Expanded chart popups are wider, expose their complete record list, and remain open while the pointer moves from the chart into the popup so the list can be scrolled. Compact page-chart hovers retain their instant-close behavior. The lead Company picker now says “Choose a company” and uses one explicit blue “Add a company not on the list” action. The account creation behavior was updated on Sep 24; see §9. Completed locally, not deployed.

### Sep 20: mock identities, source dialogs, donut handoff, and country marks
Mock workload generation is versioned whenever its account or contact cast changes. Leads use one distinct contact identity per generated record, and every generated lead, opportunity, contract, meeting, and solutioning request has a unique ID and primary label; the density test enforces both. Lead source drill-down dialogs keep one fixed desktop footprint with zero, one, or many matches and show an explicit empty state without collapsing. Donut tooltips open beside the exact slice so the pointer can enter and scroll the card without crossing another slice. Country and phone-code options use their flag as the only leading mark; `noMark` always suppresses inferred control icons. Completed locally, not deployed.

### Sep 20: component pages can remove customer connections
Every customer card and table row in an FDL component's “Customers running this” section exposes a remove action to authorized editors. It asks for confirmation, removes only that component connection through the customer API, keeps the customer account intact, and refreshes the reverse relationship immediately. Completed locally, not deployed.

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

### Sep 19: solutioning request forms have an obvious way back
After choosing Submission, Presentation, or Meeting from All Solutioning Requests, the request form shows a back arrow beside its title. It returns to the type picker without clearing anything already entered, so choosing the wrong request type is easy to undo. Completed locally, not deployed.

### Sep 19: solutioning people filters show profile pictures
The BD member and Prepared by filter options use the same profile pictures as the request table. People remain recognizable while filtering instead of appearing as an undifferentiated text list. Completed locally, not deployed.

### Sep 19: customer relationship tables keep every column readable
Customer opportunity bands reserve enough width for Stage, Status, Confidence, Owner, Expected to sign, and Value, with consistent horizontal padding between each fact. Status badges wrap inside their own cell instead of overlapping the next column. Customer solutioning-request names may use two lines, so long request titles remain readable instead of ending in a premature ellipsis. Completed locally, not deployed.

Customer Submission, Presentation, and Meeting request bands switch to a true five-column layout when no Type value exists. The freed space goes to Owner and the dates, so names are not truncated beside an empty phantom column. Their lifecycle statuses use the same human-readable labels, colors, and icons as the Solutioning module. Completed locally, not deployed.

Customer Lead bands use person avatars for the lead and the same semantic Source and Status chips as the main Leads module. Conference, Referral, Qualifying, Nurturing, and every other lead channel or state retain their own icon and color instead of reverting to generic package marks and gray text. Completed locally, not deployed.

The expanded Account pipeline momentum view explains the movement instead of stretching a sparse step line across a large dialog. It leads with current open value, the 12-week change, and the latest change date, then shows a compact before/after story beside the live opportunities responsible for the value. Single-opportunity accounts no longer open into a mostly empty chart or a meaningless one-series visibility control. Completed locally, not deployed.

Customer activity charts use whole-number count scales, including the singular “1 touch.” Every area-chart gradient has a unique SVG id, so adjacent charts cannot borrow one another's fill color; Activity uses blue in both its card and expanded view. Completed locally, not deployed.

Pipeline ownership scope lives in Views. The duplicate Team / My deals toggle was removed from the right side of the toolbar; All deals and My deals remain available as built-in views, saved views still preserve their ownership scope, and the Views trigger names the active matching view. Completed locally, not deployed.

Solutioning-request rows on customer and person relationship pages open the named request's detail route instead of sending the reader to the unfiltered All Solutioning Requests list with an ignored `?open=` parameter. The detail page's SmartBack arrow returns through the app's navigation trail and names the originating section, so cross-module record links can return to the exact page they came from. Completed locally, not deployed.

Every graph popup uses the shared short pointer-transfer window when the pointer leaves its active chart mark, so the reader can move into the popup and scroll it. Entering the popup cancels the pending close; leaving the popup itself closes synchronously. Apply this through both the shared SVG chart layer and custom graph HoverCards so compact and expanded charts behave consistently. Completed locally, not deployed.

Bar charts always reserve a dedicated strip below their axis labels for an overlay scrollbar, including fixed-height charts such as the contract revenue schedule. The deal overview shows the company logo beside Customer and the relevant country or region flag beside every project currency. Completed locally, not deployed.

Sticky save and form-action bars coordinate with the shared Freyr AI launcher. They keep their normal alignment until their rendered bounds reach the launcher, then reserve exactly the launcher corner so the final action stays fully visible; the rule applies to customer and offering editors, opportunity editors, performance edits, roadmap forms, and other sticky action bars. Completed locally, not deployed.

Customer and address lookup locations use the app's blue information treatment. Map pins in company-office results, address suggestions, and add-customer address headings no longer use warning orange for neutral search results. Completed locally, not deployed.

Customer address cards use a consistent postal layout: country and both street lines span the card, followed by one City, State, ZIP row. The same structure is used when adding and editing a customer, and collapses to one column on narrow screens. Completed locally, not deployed.

Required fields and required grouped sections display a red star everywhere they appear. Customer HQ address is required in both the add and edit flows (line 1, city, and country); Other address remains optional and has no star. Completed locally, not deployed.

Exact money fields accept `K`, `M`, or `B` as typing shortcuts, then immediately replace the shortcut with the full comma-separated number (`337M` becomes `337,000,000`). Stored or pasted symbols and currency codes are normalized too. Descriptive text such as a customer-type range (“Under $500M”) stays free-form. Completed locally, not deployed.

Performance chart popups summarize repeated dated results by contributor and source. They show the eight largest contributors plus one combined remainder row; the full audit history stays in the goal drawer instead of dumping 80–130 records into a hover card. Completed locally, not deployed.

Dropdown triggers that share a form row or field grid stay one line and 40px tall, even when their menus include richer descriptions. The extra description belongs in the opened menu; it must not make one closed selector taller or move its chevron inward relative to adjacent fields. Applied to performance results, customer ownership, meetings, solutioning, contracts, campaigns, and accruals. Completed locally, not deployed.

Assigned-person progress rows on Org performance use the same full goal-family rollup for their displayed amount, percentage, progress segments, and expanded detail. Results logged on subgoals or component goals must not paint a progress bar while the parent row incorrectly says zero; a truly zero result has zero filled width. Completed locally, not deployed.

Performance pace timelines place the 0 and target endpoint labels in the lane immediately above the track by default. They measure the rendered schedule annotation and move only the endpoint that would actually collide into the upper lane, recalculating on resize; labels must not remain detached from the bar merely because a second lane exists. Completed locally, not deployed.

Goal progress rails use one consistent status palette across the entire Goals module. Verified progress is solid green; progress waiting for verification is striped yellow; sent-back progress is striped red. Waiting pills and labels use that same yellow treatment. Completed locally, not deployed.

Mixed-status goal bars preserve each status as its own proportional segment. A monthly total containing work waiting for verification and work sent back must show both yellow-striped and red-striped portions, and those visible portions must add up to the same total shown in the tooltip. Completed locally, not deployed.

Verification pills use one identical resting treatment at the goal, group, person, and expanded-detail levels. Permission to click a pill may change its hover action, but it must not change the state label's size, border, icon, or color. Person-detail progress rails use the same solid-green verified, striped-amber waiting, and striped-red sent-back segments as the rest of Goals. Completed locally, not deployed.

Goal-level verification uses green for Verified and red for Not verified everywhere, including read-only pills, actionable pills, group/person rows, and verification filters. Blue is reserved for neutral navigation and selection, while entry-level work waiting for review remains amber. Completed locally, not deployed.

The middle Groups column in the Goals drill-down has a compact search field directly beneath its header. It filters the selected period's groups by group name or owner as the user types, reports the visible/total count, provides a one-click clear action, and shows a clear empty result without changing group selection or the three-column layout. Completed locally, not deployed.

Expanded chart dialogs must preserve the source chart's visual meaning exactly. Goals progress bars remain solid green for verified work, striped yellow for waiting work, and striped red for sent-back work when expanded; goal-type colors remain only on identity dots. Never regenerate expanded bars from a simplified value/color projection that discards status segments. Completed locally, not deployed.

Expanded chart dialogs always show the complete chart. Do not add series/slice visibility filters, “show all” controls, visible counts, or empty-filter states to expanded charts. Completed locally, not deployed.

The standalone subgoal editor uses one quiet allocation workspace: parent context and the three key figures first, a single segmented allocation bar, then clearly numbered Details, Owner, Groups, and People sections. Use blue for the current subgoal, slate for prior allocations, and red only for a real over-target state; do not return to stacked gray cards or orange allocation bands. The modal title names the subgoal being edited. Completed locally, not deployed.

Solutioning result counts do not occupy the search/filter toolbar. Hide the count when the full room is visible; when search or filters narrow the list, show a compact matching-results line directly beneath the toolbar so the control row keeps its spacing. Completed locally, not deployed.

The compact Solutioning request preview presents documents as a restrained Sales Materials-style table with Document, Version, Assigned to, and Open columns. A document has one primary assignee in the current data model; show that person as a normal avatar-and-name cell, never as an oversized “Working on it” badge. Completed locally, not deployed.

Document names in the compact Solutioning request preview use the exact Sales Materials hover preview. Resting on a name renders the document through the shared MaterialPeek surface, while clicking opens the shared in-app document viewer; link-only documents retain the same Sales Materials link preview. Completed locally, not deployed.

Every generated Mock opportunity carries a connected revenue-accrual plan with a populated schedule history. The accrual seed version is coupled to the generated opportunity-floor generation, so advancing `fillN-opp-*` data automatically refreshes its seed-owned plans while preserving plans created manually in Mock mode. Mock-density checks cover contracts, meetings, solutioning records, and accrual schedules for every generated deal. Completed locally, not deployed.

Mock-density tests always run against a fresh in-memory showroom seed, never the developer's durable Mock edits. When the canonical generated customer/contact cast changes, bump the mock-store schema so persisted contacts refresh together with meetings, leads, and other linked records rather than retaining stale identities. Completed locally, not deployed.

Grouped Solutioning lists use the same section hierarchy as Goals. Each owner, customer, or status is a separate bordered, collapsible band with its identity mark, label, adjacent request count, and its own repeated table headings; owner bands include the person's avatar. One state-aware Open all/Close all button in the toolbar controls these group bands in both table and split views. Completed locally, not deployed.

Inline owner identities on Goals always read crown, profile picture, then name. The avatar and name stay adjacent as one person identity; the ownership crown precedes that identity instead of splitting the face from the name. Completed locally, not deployed.

The goal verification dialog places a full-width search field immediately above its logged-entry list. It filters the review log by person, customer, date, amount, status, notes, actors, currency, and evidence while preserving the complete entry count and showing the number of matches. Completed locally, not deployed.

Customer HQ address requirements are enforced at both UI and API boundaries for creation and editing. Line 1, city, and country are required; legacy or mock customers without them remain blocked from saving until completed, and the app never invents address data. Completed locally, not deployed.

Standalone subgoal editors open with an explicit Edit subgoal or Add subgoal title, then identify the subgoal, its parent goal, and the parent target before any controls. The form follows the numbered sequence Details, Owner, Groups, and People and targets, and keeps Cancel and Save changes visible in a sticky footer. Inline subgoal editing remains compact inside the goal drawer. Completed locally, not deployed.

The customer editor surfaces Save changes in the Account section header as soon as any field on the page is dirty. It shares the existing header row without displacing the title, hint, or disclosure control, follows the same validation state as the sticky footer action, and disappears again when there is nothing to save. Completed locally, not deployed.

Customer custom industries use an explicit draft-and-confirm flow. Custom industry opens a labelled text field with a check action and Cancel; Enter also confirms and Escape cancels. A confirmed value becomes a selected industry chip with its normal icon and a dedicated remove action, after which any standard or custom industry can be chosen. Typing alone does not silently replace the saved selection. Completed locally, not deployed.

The goal verification dialog is an action queue rather than a duplicate audit log. When approving, it lists only entries waiting for review; already counted and sent-back work appears once in the compact summary. Search sits directly above the actionable list, missing evidence is one aggregate count, and repeated status badges, attachment warnings, and duplicate timestamps are removed. Its progress rail marks zero, the current countable total, and the goal endpoint, with solid-green counted, striped-amber pending, and striped-red sent-back segments. Completed locally, not deployed.

People-performance verification queues fit within the available content width without a horizontal scrollbar. Keep amount, customer, date, evidence, and action columns compact; customer marks cap at three plus a remainder count, logged time sits under the claim date, evidence uses short labels, and dense rows may abbreviate a person's surname while preserving the full name as accessible context. Completed locally, not deployed.

Grouping and sorting controls use semantic icons rather than interchangeable colored dots. No grouping uses a rows/list mark, customer grouping uses a company mark and company logos in section headers, owner grouping uses a person mark and avatars, and status grouping uses workflow-specific icons and state colors. Date sorts such as Newest use calendar or clock icons, never decorative sparkle icons. Apply this vocabulary consistently across Solutioning, Leads, Contracts, Opportunities, Meetings, and component lists. Completed locally, not deployed.

Relationship and 360-degree rows for first-class records link to the record's canonical detail route using its stored id in both Mock and Real modes. Legacy name-only relationships must first resolve unambiguously against the active data-mode catalogue; when they cannot, keep the data visible without inventing an id or sending the click to a generic or broken route. Completed locally, not deployed.

Every app-level back control follows the exact in-app source, including the active tab or filtered view, and names that destination. Native query-only URL replacements must notify the shared navigation tracker before a record link can be opened; a customer Presentation must return to that customer's Presentations tab, never another remembered tab. Completed locally, not deployed.

Customer solutioning-artifact tables reserve enough width for long semantic status pills before the Owner column. Status and owner identities must never overlap or intersect at ordinary desktop widths. Completed locally, not deployed.

Expanded categorical charts keep the complete known metric set in their breakdown, even when only one category currently has data. Missing categories display honest zero values and zero-width bars; zero categories never paint fake donut slivers. Compact cards may continue to show only active categories. Completed locally, not deployed.

Customer filters live in the same toolbar row as search and the Summary/List controls. Use one compact layered Filter control for customer group, owner, industry, and deal activity, and apply its scope consistently to the headline totals, Summary pivot, list/card views, pagination, and CSV export. Completed locally, not deployed.

Customer overview websites are real external links in read mode: normalize bare domains to HTTPS, open them in a new tab, and keep unsafe schemes non-clickable. Mock customer account rails must show an assigned person with their profile image, preferring a connected deal owner when the account record has no owner; Real mode must preserve a genuinely unassigned account. Completed locally, not deployed.

The Log an interaction dialog uses the full working width of the customer workflow (860px on desktop) and a substantial note canvas rather than the generic narrow dialog. Customer account-detail rails end immediately after their final card and do not add a decorative empty tail beneath Account. Completed locally, not deployed.

Point-based graph popups have a live document-level exit guard in addition to the point's own pointer-leave handler. The active painted mark, the popup, and the narrow mark-to-popup bridge during the short transfer window are the only regions allowed to retain the card; the first pointer movement anywhere else dismisses it immediately. This guard must recover from stale browser `:hover` state and missed HTML/SVG/portal boundary events without breaking the ability to move into and scroll the popup. Completed locally, not deployed.

Lead source workspaces distinguish the selected source from the full lead database. “Showing X of Y leads” uses the filtered rows for X and every lead in the workspace for Y; a Conference selection with 29 records must not describe itself as 29 of 29 unless the entire workspace truly contains 29 leads. Completed locally, not deployed.

The Leads page Owner filter renders each assigned person with the same profile picture used in lead rows. Unassigned remains a neutral non-person option; assigned owners never fall back to decorative category dots when the filter system supports avatars. Completed locally, not deployed.

Graph hover previews are globally mutually exclusive. Entering any graph mark immediately transfers shared hover ownership and synchronously dismisses the previously open graph preview, including across adjacent bars and across different chart implementations. At most one graph tooltip may be visible anywhere in the app. Completed locally, not deployed.

Grouping and date-sort pickers must never fall back to decorative color dots. The shared ColorSelect supplies semantic fallback marks for flat lists, customers, owners, statuses, newest, and date-based ordering; domain call sites should still pass specific icons for offerings and other entities. Customer grouping consistently uses the company mark, owner grouping the person mark, status grouping the checklist mark, and no grouping the rows mark. Completed locally, not deployed.

Currency selectors use the issuing country or region flag as their only leading mark throughout the app. Keep the currency symbol and ISO code in the label, never add a colored coin, link, or generic money tile beside the flag. In Log a result, currency sits to the left of the amount, K/M/B shorthand expands immediately, and the opportunity picker can create and select a new opportunity for the chosen customer without leaving the workflow. Completed locally, not deployed.

The revenue-accrual USD/local currency switch controls the complete planner, not only the monthly digits. Contract value, split and total inputs, frozen and revised deviation figures, footer totals, mismatch messages, field labels, and table headings all show the selected currency together. Every monetary input carries its currency symbol. Local-currency views are converted read-only projections of the USD plan; switching back to USD restores editing. The screen never combines a local symbol with a USD heading or unconverted number. Completed locally, not deployed.

An accrual plan is permanently bound to the deal it was created for because its schedule, versions, and deviations share that identity. Existing or preselected plans show a fixed Deal row and cannot be reassigned from the planner. The searchable Which deal picker appears only when Plan a deal starts with no deal selected. Completed locally, not deployed.

The Goals Organization → group → person drill-down gives each of its three columns an expand control. Detailed pace rails are interactive in both inline and expanded views: wheel or pinch zooms around the cursor, horizontal wheel and pointer drag move across the numeric range, visible controls zoom or reset, and close values such as an actual at 16 and schedule marker at 24 can always be separated. Completed locally, not deployed.

Each populated Organization → group → person drill-down column has its own search field: periods in column 1, groups in column 2, and people or details in column 3. A column with no records hides the search field and centers its empty-state message both horizontally and vertically in the available panel. Completed locally, not deployed.

Goal pace verdicts are based only on verified work, matching the solid-green portion that counts now. Waiting or sent-back claims never produce a green “Ahead of schedule” verdict while verified progress remains behind the schedule marker. Mixed rails render verified, sent-back, and waiting amounts as distinct green, red-striped, and yellow-striped segments in the same order as their legend. Verdict rows such as “Behind schedule by” are conclusions, not another rail segment, and therefore never render a leading status dot. Completed locally, not deployed.

People performance verification tables keep the Goal column compact instead of letting it absorb all remaining width. The saved space belongs to customer, date, evidence, action, and manager-note fields that need room to stay readable. Completed locally, not deployed.

Subgoal Owner and Groups panels always expose a stable top-right plus action. Empty panels show a centered Choose owner or Choose group action; once assignments exist, they replace the empty prompt and the picker appears only when the user invokes an add action. Selecting an owner or group must actually add it and close the temporary picker. Completed locally, not deployed.

Subgoal allocation summaries use the same StatTile metric language as the rest of the app: icon, label, large value, and plain qualifier. Parent context is a compact heading, while the allocation rail is a quiet supporting card beneath the metrics; do not reintroduce the custom three-cell capsule or oversized repeated legend. Completed locally, not deployed.

Group roster dialogs use one compact toolbar row for search, result count, and the Tiles/Table view switch. The default roster is a two-column grid of compact identity tiles with profile image, owner treatment, and goal count; do not return to sparse full-width person cards or split the controls across separate rows. Completed locally, not deployed.

The Goals Organization → group → person drill-down expands as one large white modal containing the three normal bordered columns, regardless of which column's expand control is used. It has one shared title and close action; never present the columns as three separate floating popups with backdrop gutters between them. Render it at the document root so the fixed surface fills the viewport and cannot be trapped by a table row, transformed ancestor, or overflow boundary. Interactive pace rails keep inset space at both endpoints so the first and last marks, rings, and labels remain fully visible at every zoom level. Completed locally, not deployed.
### Sep 20: Required fields are one app-wide contract

Every create, add, edit, log, upload, and configuration dialog labels every editable data field as either required or optional. Required fields use the shared red `RequiredMark` star; optional fields use the shared `OptionalMark` text. The shared `Field` component defaults to optional, so a new field cannot silently omit its state; use `requirement="none"` only for read-only facts or action controls. Conditional requirements switch between the two states using the same predicate that governs native `required` attributes where applicable, disabled progression or submit actions, client-side save guards, and API validation. A field may never look optional and then block saving, or look mandatory while saving accepts it empty. Apply this rule to every asset and data type in Mock and live modes.

### Sep 21: Log-result opportunities remain editable

An opportunity created or selected inside Log a result collapses into a compact summary showing its contract value, confidence, and expected signing date. Clicking that summary reopens the same inline editor with those values populated; Save changes updates the opportunity and folds the editor closed again, while Cancel folds it without changing anything. Compact one-line opportunities keep value, confidence, and signing date synchronized between the opportunity record and its offering line so reopening never shows a stale date or a zero contract value. Completed locally, not deployed.

### Sep 21: Customer Overview edits stay with their section

Admins and other people with record-level write access edit a customer from the Overview section that owns the data instead of leaving for one page-wide editor. About this account has a section pencil that exposes its independently saved facts; Key contacts has stable manage and add actions, and each contact reveals its remove action on hover or keyboard focus before the existing confirmation; Account details has its own pencil for owner and competitor/incumbent. Calculated health, intelligence, and chart outputs remain read-only. Every control continues to follow the existing record write and delete permissions. Completed locally, not deployed.

### Sep 21: Unassigned pipeline is not a teammate

The Team roster lists people only. Ownerless deals may continue to contribute to the complete Team pipeline and open-deal totals through an internal Unassigned ownership aggregate, but that aggregate must never render as a person, inflate the team-member count, receive generated contact details, or open a rep profile. Apply the same guard to live directory rows so a placeholder named Unassigned cannot leak into the roster. Completed locally, not deployed.

### Sep 21: Team filters keep their real visual identity

Team role filters use the same role icon and color as the role tag shown beside each person. Region filters use the actual country or region flag, with a globe only when no specific flag exists. Pipeline filters use a trend icon for people holding open pipeline and a neutral no-pipeline icon for people with nothing open. These semantic marks appear beside the option while the checkbox remains the selection control; never replace them with decorative color dots. Completed locally, not deployed.

### Sep 21: Starting roles appear in the member privilege matrix

The Team members privilege matrix shows both direct privilege grants and the privilege supplied by each active member's starting role. The role-derived cell is checked and locked because the access resolver always supplies it; an admin changes it through the member's starting role rather than pretending it can be removed as an extra grant. Empty cells now mean the person truly does not hold that privilege. Completed locally, not deployed.

### Sep 21: Goal allocation visuals and editor state stay honest

Donut charts reserve a consistent safe inset between their center labels and the painted ring, using the actual inner radius after hover-stroke protection; longer totals must shrink before they approach the ring. Goal Master target-allocation rails lead with the blue current-subgoal share, followed by slate prior allocations and then unallocated space, and their legends use the same order. Opening an owner or group picker is temporary interface state rather than a data change: an open group picker has an explicit cancel action, and an existing subgoal shows Save changes only after a field value actually changes. Completed locally, not deployed.

Goal and person assignment dialogs use the same current-first allocation rail: blue is the assignment being edited, slate is all prior commitments, and the remaining track is available. The rail pairs those segments with named amounts and a proportional scale while preserving exact typing and drag input. Group assignment includes search across group and member names and explicitly assigns one group per save; managers can repeat the action to assign additional distinct groups, while groups already carrying the goal remain unavailable. Completed locally, not deployed.

Sent-back claim panels keep red status styling to communicate that a result needs attention, while the Fix it or Open it control uses the standard blue primary action. Reserve solid red buttons for destructive or rejecting actions rather than corrective navigation. Completed locally, not deployed.

Performance-list sort controls reorder only the goal rows they sit above. Summary charts keep the stable Goal Master order for the currently filtered goal set, so changing from Worst pace first to Name or any other row sort never makes the overview bars jump around. Completed locally, not deployed.

Compact group-member avatar stacks keep avatar circles only. Hover or keyboard focus spreads the overlapping circles apart, and hovering an individual circle reveals that person's name in a small tooltip; never replace the fan with wide name pills. Missing portraits continue to use honest initials, and the app never invents or reuses another person's photograph merely to avoid an initials fallback. In the expanded Organization → group → person modal, clicking a logged result opens its facts, proof, and timeline inline inside the People column rather than launching a second modal behind the first. Completed locally, not deployed.

Logged results in the People drill-down render as individually separated cards rather than one continuous divided sheet. The open result owns one blue-outlined container with a highlighted header, rotated disclosure mark, facts, proof, and timeline; visible space before the next card makes the boundary between results unambiguous. Completed locally, not deployed.

Logged-result cards show a disclosure chevron only inside the expanded Organization → group → person surface, where the card truly opens inline. In the embedded three-column drill, clicking a result opens its separate detail dialog, so the row must not display a dropdown chevron. Completed locally, not deployed.

Inline result details belong to the expanded Organization → group → person surface. Closing that surface by its close action, backdrop, collapse control, or Escape clears the selected inline result before returning to the page, so the same result never reappears as a second standalone modal after the parent closes. Completed locally, not deployed.

Lead lists use the same focused expansion treatment as Goals. When one lead is open, every other lead row dims to 45% opacity and returns to full opacity on hover; the selected lead and its expanded details remain fully emphasized. Completed locally, not deployed.

The expanded Source performance lead table always includes a Source column between Company and Status. Every row shows the same channel icon, semantic color, and source label used by the main Leads table; source is also searchable and available as a sort option. Completed locally, not deployed.

Opportunity and Revenue Accrual timeline selectors use cadence-specific icons instead of identical purple dots: calendar days for Weekly, a calendar range for Monthly, a four-part grid for Quarterly, two columns for Semi-annual, and a full calendar for Yearly. Completed locally, not deployed.

Multi-select dropdown triggers close immediately on the second pointer press, including inside nested dialogs and labels. Surrounding click handlers must never reopen a picker during the same gesture; keyboard activation keeps the normal click toggle. Completed locally, not deployed.

Saved Market Intelligence stories use a filled yellow bookmark with a pale yellow hover/background treatment, and the Saved filter carries the same yellow bookmark cue whenever saved stories exist. Unsaved bookmarks remain neutral outlines. Completed locally, not deployed.

Market Intelligence bookmark clicks update the bookmark and Saved results immediately, then persist in the background. A pending request locks only that story's bookmark; failed saves restore the prior state and show an error instead of leaving the optimistic state behind. Completed locally, not deployed.

The FDL component offering picker keeps its scrolling card grid visually separated from the Save footer. Its lower edge uses an opaque white mask and scroll padding so a selected card's blue outline cannot bleed into the footer as a stray horizontal line. Completed locally, not deployed.

Market Intelligence company briefings place The Rundown directly beneath the company header, before the briefing search and filter controls. Completed locally, not deployed.

Market Intelligence list views give collection status its own Tracking column. Active-person counts stay on one line, while Freshness contains only the single-line update age. Completed locally, not deployed.

In Market Intelligence list views, the People avatar stack fans apart on hover and opens a popup listing every person whose activity is tracked for that company. The Tracking status is also clickable and opens a separate popup naming the workspace members who have the company on their personal list; active-by-default companies explain that state when no member is listed. Completed locally, not deployed.

Every person row in the Market Intelligence tracked-people popup includes a dedicated external arrow when that person has a valid LinkedIn profile URL. The arrow opens the exact saved LinkedIn profile in a new tab; rows without a profile URL do not invent or show a dead link. Completed locally, not deployed.

### Sep 21: review-workspace content reads like a finished product

Mock-mode screens never label records, publishers, people, summaries, charts, emails, calls, targets, or intelligence as sample, fake, fictional, illustrative, placeholder, or demo data. The global disclaimer banner is removed. Generated records use normal product language and credible source names, while protected write behavior remains enforced behind the interface. Completed locally, not deployed.

The Market Intelligence Saved control is an additive filter. Turning it on keeps search, relevance, time range, exact date, source, signal, and view controls visible and preserves their current values; those filters continue to narrow the saved set. Completed locally, not deployed.

The Market Intelligence tracked-person activity dialog uses the large review surface: up to 1380px/94vw wide and 78vh tall on desktop, with a wider profile rail and the remaining space dedicated to the post feed. Completed locally, not deployed.

In Market Intelligence list rows, hover arrows sit inline immediately after the linked company name or latest-intelligence headline, including after wrapped text. They never occupy the far edge of the column as a separate flex item. Completed locally, not deployed.

Market Intelligence list views keep the Company column compact at 250px for customers and 260px for competitors. Extra horizontal room belongs to Latest intelligence, where longer headlines benefit from it, while company names and division tags may wrap naturally within their smaller column. Completed locally, not deployed.

Every internal teammate link in Mock mode resolves through the shared sales roster. Rep profiles accept both durable Team identity slugs and readable name slugs used by record tables, and persisted Solutioning rows from the retired mock cast migrate every related owner, requester, preparer, document, workstream, attendee, and activity reference together. A valid mock teammate link must never land on Rep not found. Completed locally, not deployed.

An unavailable inline PDF preview is a handled viewer fallback rather than an application error. Show the download-original message without emitting a console error that makes the development overlay claim there is an Issue; valid real PDFs render normally, and failed previews retain the working original-download path. Completed locally, not deployed.

Internal links in the full Agent page carry the active conversation to the destination record. Clicking a company, contact, offering, teammate, report, or other in-app entity navigates normally, opens the bottom-right assistant on the destination, and resumes the same conversation there. External source links keep their normal behavior, and ordinary navigation never opens the assistant unexpectedly. Completed locally, not deployed.

Every company named by the Agent renders as an identity pill with the company logo and company name. When the same organization exists as a customer, Market Intelligence company, and lead, that overlap is one company identity rather than an ambiguous name: prefer the customer record and its full account destination, falling back to Market Intelligence when no customer exists. Completed locally, not deployed.

The compact bottom-right Agent renders model-provided Markdown links with the same rules as the full Agent page. Internal records and materials appear as clean clickable labels or identity pills, external citations show readable source labels, and raw `[label](/path)` syntax never appears in the conversation. Completed locally, not deployed.

Customer key-contact phone rows preserve international identity. Each number displays the contact's own country flag and explicit `+` dialing code separately from the readable national number; when a shared code such as +1 is enriched with the contact's location, that person's country selects the flag rather than the account's headquarters. Completed locally, not deployed.

The floating Agent uses one control surface at a time. While its 480px conversation panel is open, the launcher disappears instead of remaining as a second oversized close button; the header owns both Close and an explicit Open full chat button that carries the active conversation to the full Agent page. Message bubbles use the wider panel with more breathing room and readable line spacing. Completed locally, not deployed.

Lead status analytics are a drill-down workspace rather than a dead chart. Clicking a status or the expand control opens a near-full-width modal with the donut and selectable status categories in a stable left rail and the actual matching lead records in a wide table on the right. The table includes company, status, source, owner, request, and last movement, with working customer and converted-opportunity links. Completed locally, not deployed.

### Sep 22: Solutioning table scroll and mock-mode navigation

Solutioning's request, submission, and presentation tables keep the reference, title, and document count together in the first column; that column scrolls with the rest of the table rather than sticking over expanded rows. The horizontal rail remains visible on long tables and moves its thumb directly without a React render or a geometry measurement for each horizontal scroll event. Solutioning room switches and newly created records retain `/mock-mode` when the current workspace is in progress mode. A prefixed URL opened with a live cookie now reaches the mode-switch effect instead of being stripped first, so the blue workspace banner does not silently disappear or fail to return. Typecheck and focused lint pass; verified in the local Mock-mode browser. Completed locally, not deployed.

### Sep 22: Solutioning timeline zoom stays in sync

The Where it stands elapsed bar changes width in the same render as its date markers when zooming or resetting; it no longer animates its width for half a second after the markers move. The deadline caption's measured alignment updates before the browser paints, so it does not visibly lag behind the zoomed timeline. Verified by zooming and resetting a longer local Mock-mode submission timeline; typecheck and focused lint pass. Completed locally, not deployed.

### Sep 22: Company details and customer contract columns

Market Intelligence company details stick close to the top of their own scrolling workspace instead of remaining 60px lower than the article feed. The panel height now accounts for the app header and, in Mock mode, its workspace banner. Customer Contracts tables reserve readable widths for status, owner, and value; long contract names wrap in the first column rather than clipping or squeezing those facts. Typecheck and focused lint pass. Local visual verification is pending because localhost currently redirects to Access pending (configuration error). Completed locally, not deployed.

### Sep 22: Customer offerings read as an account portfolio

The customer Offerings tab opens with account-specific usage, recorded revenue, available catalogue count, and customer type. In-use offerings show their description, revenue, activity count, and material count before expansion; the detail view keeps the full description, revenue lines, activities, and sales materials together, with the no-longer-in-use action below those facts. A revenue chart appears only when there are multiple commercial models to compare, and the empty available section disappears when the customer already uses every applicable offering. Typecheck and focused lint pass. Local visual verification is pending because localhost redirects to Access pending (configuration error). Completed locally, not deployed.

### Sep 22: About this account opens one complete editor

The pencil on About this account opens a single dialog with every fact shown in that section: company name, industry, size, locations, website, customer type, ownership, revenue, and account description. The read-only values no longer become a second set of edit buttons. One Save changes action submits the section together; the customer PATCH route now accepts the description with a length cap. Typecheck and focused lint pass. Local visual verification is pending because localhost redirects to Access pending (configuration error). Completed locally, not deployed.

The Locations field in that editor is now a city dropdown followed by a searchable country dropdown with flags. Known cities are offered for common countries; searching an unlisted city offers a direct “Use” choice, and changing country clears the previous city. Legacy values such as `Switzerland (Basel)` populate both selectors, while untouched geography strings and any additional-office suffix remain intact. The About section displays the city before the flagged country. Verified on Delphi Bio in localhost Mock mode, including the custom-city choice and save; typecheck and focused lint pass (one pre-existing ColorSelect hook warning). Completed locally, not deployed.

### Sep 22: Compact Agent reply identity parity

The floating Agent chat scopes each answer to its verified entity links and stores the answer's entity context just like the full chat. Explicit offering, component, customer, contact, and teammate links render with their identity mark even before the separate name index loads, so saved answers do not fall back to plain blue links. Markdown headings in compact replies render as headings rather than literal hash marks. Typecheck, focused lint, and agent identity tests pass. Completed locally, not deployed.

The compact conversation stays pinned to the latest exchange when a long answer grows during streaming or when the entity index turns names into pills. Opening a saved conversation or receiving a new message lands at the bottom immediately; manually scrolling upward pauses that follow behavior so earlier messages remain readable. Verified with the affected Agent.Fia conversation in the local browser; typecheck and focused lint pass. Completed locally, not deployed.

### Sep 22: Market Intel tracked people rail

Tracked-person rows reserve the right edge for LinkedIn and the hover/focus stop-following action, so names and roles can use the remaining width over two lines. Post counts sit below the role instead of squeezing names horizontally. On wide company briefings, the floating Agent launcher sits just left of an open company-details rail and returns to the normal right corner when the rail is hidden. Verified locally on AstraZeneca in Mock mode with the rail open and closed; typecheck and focused lint pass. Completed locally, not deployed.

### Sep 22: Customer key contacts and full-list controls

The Overview's Key contacts summary now shows explicitly starred people and no longer has the redundant edit button. All contacts opens the Contacts tab at the top of the account page with its selected tab visible. The Contacts tab has one search/filter/add toolbar, visible star toggles, and per-contact editing. Key status is persisted on contacts; migration `030_key_contacts.sql` preserves the first four previously shown contacts as initial keys. Verified on Belmara Pharma in local Mock mode: navigation lands at scroll position zero, search narrows the list, stars persist through reload, and edit saves without leaving the Contacts tab. Typecheck and focused lint pass. Completed locally, not deployed; migration must run before the live app uses this field.

### Sep 23: Mock-mode banner and lead profile lookup

An already-open tab now checks the shared data-mode cookie when it becomes active or returns from browser history. If another tab switched workspaces, it reloads into the matching URL and shell, keeping the existing blue Mock-mode banner in sync with the data shown. The banner itself is unchanged. Verified on localhost by reloading the affected Opportunities tab and navigating from Leads to Opportunities in Mock mode; both show the banner and `/mock-mode` URL. Completed locally, not deployed.

Lead LinkedIn enrichment now uses the public-profile actor already working in Market Intel. It maps that actor's nested profile facts and keeps only posts whose author matches the lead, so other people's posts are not presented as the lead's own. The Agent labels those facts as dated, unverified public-profile claims. Verified in a disposable Mock-mode lead with a real public profile: facts and authored posts saved, the Agent answered with source attribution and unknowns, and the test lead was deleted. Typecheck, focused lint, and lead normalization tests pass. Completed locally, not deployed.

The opportunity Revenue Accrual Project currency picker shows each currency's symbol alongside its flag, code, and name in both the selected value and options. CHF uses its code once rather than repeating it as a symbol. The amount inputs already follow the selected currency symbol. Typecheck and focused lint pass (one pre-existing unused import warning). Completed locally, not deployed.

### Sep 23: Filter accrual schedules whose months do not add up

The Est. Accrual Revenue toolbar's existing Filter → Show menu includes “Months don't add up” with a count of scheduled deals whose monthly total differs from their contract value. Selecting it narrows the table, chart, and export together; it persists in the URL and switches directly to other Show choices. Plans without any months stay under “Need a plan.” Verified in the local Mock-mode browser with seven matching schedules and direct filter switching; typecheck passes and focused lint has only existing warnings. Completed locally, not deployed.

### Sep 24: Optional Market Intel details placement

Profile settings now offer a right-side company details panel (the existing default) or a highlighted, sticky left-side panel on Market Intel company briefings. Hide and Show remain available in both layouts, and panel visibility remains remembered independently of its position. The floating Agent launcher shifts only for an open right-side panel. Verified both positions and Hide in the local Mock-mode browser; restored the original right-side choice and hidden state afterward. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

Sources now lives inside the company-details rail, directly after Signals and before Competitors mentioned. The former horizontal Sources strip is gone; article view sits in the main search toolbar so the feed starts immediately below it. The rail has a subtle blue tint and border in either position to mark it as the main filtering area while keeping Hide/Show. Verified the News source narrows the feed and restored All sources and the hidden rail afterward in local Mock mode. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

The source filters use explicit labels: “LinkedIn posts: company,” “LinkedIn posts: people,” “News,” and “Company website.” Filtering keys and counts are unchanged. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

Customer Intel now includes “Compliance & Enforcement” between RA/QA Team Changes and Technology Changes. Its initial implementation tagged records published at verified health-authority URLs. A bounded daily pass gathers official FDA drug, device, and food recall records plus MHRA drug/device alerts, with official-domain discovery for FDA, EMA, MHRA, TGA, Health Canada, HSA, and MDA notices. The company briefing separates these under a Health authorities source filter and marks each card with the issuing authority. Read-only checks found current FDA recall records for Amgen and an MHRA defect notice for B. Braun; classification/source tests, typecheck, and focused lint pass. Completed locally, not deployed.

The Sep 24 follow-up broadens Compliance & Enforcement to verified news of an actual customer cyberattack, privacy breach, patient-data exposure or theft, while keeping ordinary cybersecurity product news and non-authority recall reporting out. The briefing corrects older Corporate Structure labels for these breach articles on read. During collection, a bounded Haiku pass compares only plausible same-event articles, saves an event ID on each source, and uses those IDs to show differently worded reporting as one card with every other source. Existing articles are backfilled after the normal refresh passes; page views make no model calls. The full company refresh now preserves the authority freshness stamp. Focused signal and story tests, typecheck, and lint pass. Completed locally, not deployed.

The Amgen Advocacy Summit exposed an Events guide that was limited to regulatory or external events. Customer Events now explicitly include company-run summits, conferences, webinars and patient-advocacy gatherings. Existing company posts labeled only Others display as Events when their saved text explicitly describes participation in a named event; the rule does not make another AI call or reclassify general event commentary. The collection classifier gets the same clearer guide for future posts. Focused tests, typecheck and lint pass. Completed locally, not deployed.

### Sep 24: Stock-market news and cross-company bookmarks

Customer Intel now treats stock-price moves and analyst market commentary as Others, including older articles previously labeled Financial or operational updates. Actual reported earnings, revenue, guidance and operational changes keep the financial signal. The collection classifier gets the same instruction; page views use a deterministic correction with no extra AI call. On the Customer Intel main page, the former Starred filter reads “Starred companies,” and a separate “Bookmarked items” view shows the current user's saved posts and articles from all companies together, newest first, with search and removal. Saving a new item records its company name; older saves use the current company catalogue or a readable ID fallback. Health-authority notices can also be bookmarked. Focused signal tests, typecheck, lint, diff check and a local Mock-mode browser review pass. Completed locally, not deployed.

The Customer and Competitor Intel main-page Activity mix now shows only Posts, News and Website. The removed Signals number counted distinct named-signal items in the selected window, whereas briefing category totals count an item in every category it matches, so the two numbers could not be added or compared directly. The related “By most signals” sort is removed. Competitor Intel also gets its own account-wide Bookmarked items view, filtered to competitor records; new bookmarks store their customer/competitor group and older bookmarks use the tracked-company catalogue to recover it. Both main pages retain the shared Division column, list-only layout, admin-only Tracking column, and “Last checked” source-check timing. Verified in local Mock mode on both pages, including an existing competitor bookmark, plus typecheck, focused lint and diff check. Completed locally, not deployed.

### Sep 24: Mock Solutioning handoff documents

Mock submissions and presentations spawned from generated demo requests now receive a clearly labeled sample working document and final deliverable. Existing demo handoffs are filled once when read; a saved marker prevents removed sample files from reappearing. Live records and handoffs from manually created mock requests are unchanged. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

### Sep 24: Competitor-mention logos

The Customer Intel details rail now shows each mentioned competitor's existing Market Intel logo beside its name and count. It resolves the current tracked-company logo first and then the collected feed summary; where neither has a logo, it uses the standard company mark. Mention names still come from the built-in competitor watch plus companies added through Manage Competitors, while counts are derived from matches in collected posts and articles. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

### Sep 24: Thought Leadership filter and Market Intel view transition

Thought Leadership now groups Firm, Topic, and Type under the shared Filter menu, with multi-selection, a selected-count badge, and Clear all. Search, sort, and the table/tile switch stay in the toolbar. Switching table and tile on either Thought Leadership or M&A now has a brief entrance animation, disabled for reduced-motion users. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

### Sep 24: Lead LinkedIn sales-first presentation

The deployed Sep 24 screenshot still showed the older inline LinkedIn post list; the local lead row already opens a compact profile card and keeps full facts in a popup. The popup now leads with identity and current role, a short bio, and one recent public post. Career history, skills, audience counts, and the full post archive remain available behind collapsed sections, so long histories do not overwhelm the lead's request and follow-up. The inline card no longer lists counts of roles, schools, and posts. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

### Sep 24: Lead follow-up missing-detail placement

The missing qualification details and Edit lead action now appear directly below the recommended follow-up in the lead's expanded card. The old bottom footer was pushed below the long contact/LinkedIn column and often out of view. A completed-details message remains in a footer when nothing is missing. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.

### Sep 24: Opportunity currency and empty-state cleanup

The Revenue Accrual currency table aligns read-only USD amounts with the original-currency row instead of applying editable-field padding to only USD. A schedule with a usable FX rate now offers USD, local currency, and Both; Both shows adjacent columns for each amount and total while the stored accrual remains USD. When no conversion rate is available, the schedule stays in USD rather than labeling dollars as local money. Opportunity Solutioning requests hide the search/type toolbar when there are no requests. The revenue-accrual summary separates its count from the monetary "scheduled total" instead of saying "$110 in value." Typecheck and diff check pass; focused lint has three pre-existing unused-symbol warnings. Completed locally, not deployed.

### Sep 24: Source-performance owner menu width

The Leads Source performance popup gives its Owner dropdown a wider menu so a full owner name such as Abhinaya Veeramally stays on one line alongside the avatar and action icons. The toolbar columns remain unchanged. Typecheck, focused lint, and diff check pass. Completed locally, not deployed.
