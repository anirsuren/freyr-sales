# Account Planning implementation plan

Status: product and engineering plan, not implemented and not deployed  
Source: Suren's September 14, 2026 account-planning direction, plus a code review of the current Customers module

## Product definition

Account Planning is the working plan assigned to the sales team for one account. It lives inside that account's customer page. It is not a new item in the main navigation.

Every plan must answer these questions without making the rep assemble the answer from several screens:

1. How much revenue should Freyr win from this account, and by when?
2. Which offerings should the team sell?
3. What is the strategy and pitch for each offering?
4. Which exact approved materials should the team use?
5. Which people matter, what role does each person play, and who reports to whom?
6. Which senior decision-maker must the team reach?
7. Who at Freyr can introduce or strengthen the relationship?
8. What must happen next, who owns it, and when is it due?
9. What progress, evidence, risks, and open gaps exist today?

The first production version should be a clean transactional planning tool. AI recommendations and automatic content generation belong on top of that clean data after rollout and feedback.

## Where it belongs

Add **Account plan** as a first-class tab on `customers/[id]`, immediately after Overview. It must be included in `REAL_MODE_TABS`, because this is a production feature. Mock mode uses the same component and API shapes with seeded stress-test data.

Recommended tab order for the production customer page:

1. Overview
2. Account plan
3. Connected-record bands such as Opportunities, Solution requests, Contracts, Meetings, Team, and Offerings
4. Digital components
5. Contacts
6. Activity

The account plan should edit in place within the tab. Entering edit mode replaces the read view with editable tables and a sticky Save changes / Cancel bar. This avoids a large multi-step modal and keeps the account context visible. A nested route can be added later for deep-linking, but there should be no separate Account Planning module or navigation item.

The first viewport should read like this:

```text
ACCOUNT PLAN   Active     Owner: Elena Rossi     Review: 30 Sep
$4.2M target by 31 Dec 2027                     [Edit plan]

Objective                         Current position
Expand Freya.Label across...      2 live offerings · 3 open deals · $1.1M booked

OFFERING PLAYS (6)                DECISION PATH
Priority  Offering  Target ...    Sponsor → Champion → Decision-maker
High      Label     $1.8M  ...    next missing connection called out by name

NEXT ACTIONS (8)                  OPEN GAPS (3)
Owner  Due  Action  Linked work   Exact issue and the action that resolves it
```

The signature interaction is the **Decision path**: a compact, named route from Freyr's introducer through the account's champion to the senior decision-maker. It is built from the stakeholder records and reporting lines, so it conveys real account strategy rather than acting as decoration. The complete stakeholder table remains the authoritative editable view.

## Account scope: existing customers and target companies

The current system keeps target accounts in a separate JSON document and hides the Targets tab in Real mode. That cannot support Suren's requirement that the same planning workflow cover the top 50 existing customers and companies Freyr wants to win.

Promote target companies into the same account entity used by Customers:

- Add `relationship_stage` to `customers`: `target`, `prospect`, `customer`, or `former_customer`.
- Default every existing customer row to `customer`.
- Create target companies as customer/account rows with `relationship_stage = target`.
- Keep the user-facing navigation label **Customers** for now; show the stage as a clear chip and add stage filtering to the customer list.
- Migrate the existing target list by normalized domain first and normalized name second. Produce a dry-run report for collisions before writing anything. Preserve target owner, tier, potential, quarter, connection level, headquarters, and notes.
- After migration, the old target JSON store becomes read-only for one release and is then removed. It must not remain a second source of truth.

This makes every target clickable, gives it a customer page, contacts, an account team, and an account plan, while preserving existing customer IDs and relationships.

## Information architecture and UI

The page should be dense, table-based, and readable with a large amount of data. It should not become a grid of tall summary cards.

### 1. Plan header

A compact header band contains:

- Plan status: Draft, Active, Needs review, or Archived
- Plan owner, using the real workspace member ID and correct profile picture
- Revenue target and currency
- Target date
- Last reviewed date and next review date
- Edit plan action

Use labels that state the business fact. Avoid unexplained terms, unlabeled color, or decorative progress rings.

### 2. Objective and account position

A short, two-column section:

- **Account objective:** the outcome Freyr wants from this account
- **Current position:** generated from current customer facts, open opportunities, active contracts, current offerings, relationship coverage, and recent activity

The objective is entered by the account team. Current position is derived and cannot be edited inside the plan.

### 3. Offering plays table

One row per offering the team plans to sell. Columns:

| Column | Behavior |
| --- | --- |
| Priority | High, Medium, Low with icon and text |
| Offering | Clickable link to the offering record |
| Why this account | Concise rationale |
| Pitch strategy | The approach and intended message |
| Revenue target | Amount and currency for this play |
| Target date | Expected commercial outcome date |
| Key contacts | Linked contact avatars and names |
| Materials | Count plus expandable list of exact documents |
| Progress | Planned, Engaging, Solutioning, Proposed, Won, Paused |
| Linked work | Opportunity, solution request, meeting, or contract links |

Long strategy text stays at two lines in the row. Expanding a row reveals the full pitch, chosen materials, stakeholders, linked records, risks, and actions. The expanded height should be adjustable and remembered for the current user, using the same interaction pattern as the adjustable goal details.

Materials are references to real records. Each document shows its type, approval state, version, offering, and an Open action. Only sales-visible approved material should be selectable by default; expired or draft material must be clearly marked and require the existing material permissions.

### 4. Stakeholder map and contact strategy

Use a structured table as the default because it scales and supports search, sort, and filtering. Add an optional organization-map view for understanding reporting lines.

Default table columns:

| Column | Behavior |
| --- | --- |
| Person | Correct avatar, clickable name, title |
| Reports to | Clickable person; draws the hierarchy |
| Buying role | Decision-maker, Champion, Influencer, Evaluator, Procurement, Legal, Blocker, Other |
| Priority | High, Medium, Low |
| Relationship | No access, Introduced, Developing, Strong |
| Position | Supportive, Neutral, Unknown, Resistant |
| Freyr introducer | Actual workspace member who can make the connection |
| Approach | Concise next message or relationship strategy |
| Next action | Owner and due date |

The organization-map view should lay out leadership from senior to junior with connector lines. It must support horizontal pan/scroll and keyboard movement when the structure is wider than the viewport. Selecting a person opens a compact detail panel rather than covering the map.

Some people will be known targets before they are complete Contacts. The plan may hold a prospect stakeholder with name and title, but it must offer **Create contact** and replace the placeholder with the real contact ID once created. Known contacts always link to their Contact page.

Profile pictures follow the existing identity rule: resolve by stable contact or workspace-member ID. If no verified image exists, show initials. Never borrow another person's picture because the names happen to occupy the same list position.

### 5. Actions and milestones table

This is the execution layer. Columns:

- Status: Not started, In progress, Blocked, Done
- Action
- Related offering play
- Related contact
- Owner
- Due date
- Evidence or completion note
- Linked goal, opportunity, solution request, meeting, or document

Overdue dates are red and state the number of days overdue. Blocked rows explain the blocker. Completed rows retain their owner, date, and evidence.

Account-plan actions should also appear in the existing `/tasks` work queue as a third task type. The current Tasks page derives only review work and follow-ups, so it cannot be the storage layer for these actions. The account plan owns the action record; Tasks reads and links back to it.

### 6. Risks and open gaps

A small, filterable table shows gaps such as:

- No decision-maker identified
- No route to a priority contact
- No approved material selected for a play
- Revenue target has no opportunity
- Required action is overdue
- Contact map is incomplete
- Plan review is due

These are deterministic checks over the plan and connected records. Each row explains the condition and links to the exact place where it can be fixed. This replaces ambiguous scores with actionable information.

### 7. Activity and progress

Do not create another activity feed. Show a compact account-plan activity filter that reads the existing customer Activity data, meetings, opportunities, solutioning, contracts, notes, and plan actions. Each item links to its source.

Progress should be derived from connected records. A plan does not mark an offering Won unless the linked opportunity or contract says so. Revenue actuals come from verified revenue or goal records, not manual plan text.

## How every current Customers surface contributes

| Current surface | Role in Account Planning |
| --- | --- |
| Customer header and profile | Account identity, lifecycle, owner, parent, headquarters, industry, size |
| Overview | Concise snapshot; later show plan status, target, next action, and review date |
| Account plan | New source of planned intent, stakeholder strategy, chosen plays, materials, and actions |
| Contacts | Canonical people records; plan adds account-specific buying role, relationship, and approach |
| Digital components | Installed footprint and version context for expansion or upgrade plays |
| Activity | Evidence of what happened; informs current position and plan progress |
| Opportunities | Commercial execution and forecast links for each offering play |
| Solution requests | Delivery work needed to prepare proposals, submissions, presentations, or meetings |
| Submissions and presentations | Working and final documents linked to the plan and individual plays |
| Meetings | Relationship activity, outcomes, and later transcript-derived intelligence |
| Contracts and revenue accruals | Current business, renewals, recognized revenue, and expansion baseline |
| Offerings | Canonical offering definition, availability, owners, and approved sales materials |
| Team | One owner plus supporting internal members; source for action owners and introducers |
| Notes and attachments | Historical context; do not use as structured plan fields |
| Customer report | Add a printable plan summary after the plan tab is complete |
| Customer groups | Useful filter/cohort for top-50 views; does not own plan data |
| Targets | Migrate into customer/account records, then retire as a separate data source |
| Ask Agent | Read plan context in phase 1; propose changes only in later AI phases |

Mock-only tabs such as the current Analytics, Offerings, Deals, Sessions, and Notes views should not block this work. Account Planning uses the real underlying records and only exposes links the signed-in user may open.

## Data model

Account Planning is core, relational business data that must be queryable for reporting and AI. It should use normalized Supabase tables instead of adding more JSON fields to the `customers` row or another deployment-wide `offering_catalog_state` document.

### `account_plans`

- `id uuid primary key`
- `workspace_id uuid not null`
- `customer_id uuid not null references customers(id) on delete cascade`
- `status text`: `draft`, `active`, `needs_review`, `archived`
- `owner_user_id uuid references app_users(id)`
- `objective text`
- `target_revenue numeric(14,2)`
- `currency text`
- `target_date date`
- `review_cadence text`: `monthly`, `quarterly`, `custom`
- `next_review_date date`
- `revision integer not null default 1`
- `created_by_user_id`, `updated_by_user_id`
- `created_at`, `updated_at`, `activated_at`, `archived_at`

Allow one non-archived current plan per account. Audit every mutation through `audit_events`.

### `account_plan_offering_plays`

- `id`, `plan_id`, `offering_id`
- `priority`, `status`
- `rationale`, `pitch_strategy`
- `target_revenue`, `currency`, `target_date`
- optional `opportunity_id`, `solution_request_id`, `contract_id`, `goal_id`
- display order and timestamps

The foreign IDs for JSON-backed modules remain text and are validated through their module service until those modules are normalized.

### `account_plan_stakeholders`

- `id`, `plan_id`
- nullable `contact_id`
- temporary `prospect_name`, `prospect_title` for a person not yet created as a Contact
- nullable `reports_to_stakeholder_id` for the plan's organization structure
- `buying_role`, `priority`, `relationship_strength`, `position`
- `is_senior_decision_maker boolean`
- nullable `introducer_user_id`
- `approach`, `notes`
- timestamps

Require either a contact ID or a prospect name. A contact may appear only once per plan.

### `account_plan_play_contacts`

Many-to-many link between offering plays and stakeholders, with a `role_in_play` and optional play-specific message.

### `account_plan_materials`

- `id`, `plan_id`, nullable `offering_play_id`
- `source_type`: `offering_material`, `solutioning_document`, `external_document`
- `source_id` or `external_url`
- `label`, `usage_note`
- timestamps

Prefer source IDs. Store a label snapshot for audit history, but always open the current source record.

### `account_plan_actions`

- `id`, `plan_id`
- nullable `offering_play_id`, `stakeholder_id`
- `title`, `details`
- `status`, `priority`
- nullable `owner_user_id`
- `due_date`, `completed_at`, `completion_note`
- nullable linked `goal_id`, `opportunity_id`, `solution_request_id`, `meeting_id`, `document_id`
- timestamps

### `account_plan_comments`

Use a small append-only table for discussion and review notes. Comments carry the real author ID, date, optional attachment reference, and optional entity reference such as a play, stakeholder, or action. Do not put working discussion into the plan's objective or strategy fields.

## API and server boundaries

Add dedicated routes:

- `GET /api/customers/[id]/account-plan`
- `POST /api/customers/[id]/account-plan` to create the first plan
- `PATCH /api/customers/[id]/account-plan` for plan metadata and status
- CRUD sub-routes or typed operations for plays, stakeholders, materials, actions, and comments

All writes should:

1. Verify the signed-in workspace member.
2. Require Customers module write access.
3. Apply the existing customer record-scope rule.
4. Verify that referenced offerings, contacts, members, and customer all belong to the same workspace.
5. Validate linked record ownership and type.
6. Write an audit event with before and after state.
7. Return the complete updated plan so the client does not reconstruct state optimistically from partial writes.

Every update sends the revision it was based on. If the stored revision has changed, return `409 Conflict` with the newer plan and ask the user to review the other person's changes. Never let the last request silently erase a teammate's work.

View permission follows the customer page. Editing is allowed to the customer owner, customer team, the person who created the account, managers, and admins. Activation/archiving should be limited to the account owner, managers, and admins. Being an introducer or action owner does not grant general edit rights.

Use stable user/contact IDs for permissions and identity. Names are display snapshots only.

## Goal Tracking integration

Goal Tracking remains the source of organization, group, and person targets. The account plan states how much this account is expected to contribute.

For the first version:

- Allow an offering play or plan action to link to a Primary Goal by ID.
- Show the linked goal and the account's planned contribution.
- Do not mutate the goal target or assignment from the account plan.
- Do not count plan targets as actuals.
- Calculate actual progress from verified goal entries, opportunities, contracts, and revenue accruals that carry the same customer ID.

After Goal Tracking is finalized, add a read-only account-contribution view on the goal page and enforce one agreed rule for how booked, accrued, and collected revenue satisfy the plan target.

## Intelligence roadmap

### Foundation release

- Structured plan, offering plays, stakeholders, hierarchy, materials, actions, links, permissions, audit history
- Deterministic gaps and current-position summary
- Account plan included in the agent's read-only account context

### Assisted planning

- Suggest offering plays from account type, installed components, market intelligence, open opportunities, and past activity
- Suggest contacts and missing buying roles
- Rank approved materials for the chosen contact and pitch strategy
- Suggest actions and review dates
- Every suggestion shows its supporting records and requires explicit acceptance

### Generative sales intelligence

- Generate a contact-specific pitch, presentation, proposal, or meeting brief through Freyr Fusion
- Save generated work into the existing Solutioning/document workflow
- Preserve source material, version, approval, author, and generated-for contact
- Never silently overwrite the active account plan

### Later platform work

- Korean and other language output while English remains the primary workspace language
- Mobile meeting recording, transcript, notes, outcomes, and suggested opportunity updates
- Governed automation that creates or changes opportunities only through explicit workspace rules

## Delivery sequence

### Phase 0: prerequisites and decisions

1. Finish and stabilize the production Customers, Opportunities, Offerings, Solutioning, and Goal Tracking behavior Suren prioritized.
2. Confirm the revenue definition used by an account plan: booked, signed, accrued, collected, or a clearly named combination.
3. Confirm who activates a plan and the expected review cadence.
4. Produce and review the target-account migration dry run.

### Phase 1: account foundation

1. Add `relationship_stage` to customers and migrate target accounts.
2. Add normalized account-plan tables, indexes, constraints, RLS/server access rules, and audit events.
3. Implement plan read/write services with separate Mock and Real data adapters.
4. Add Account plan to the Customer tab strip and Real mode.
5. Build the header, objective, offering plays table, and in-place edit mode.

### Phase 2: people, materials, and execution

1. Add stakeholder table and organization-map view.
2. Add exact material selection and document links.
3. Add actions and milestones; surface them in Tasks.
4. Add derived risks/open gaps.
5. Add customer report summary and read-only Agent context.

### Phase 3: integration and hardening

1. Link plays and actions to opportunities, solution requests, meetings, contracts, and goals.
2. Add dense mock fixtures and migration fixtures.
3. Add search, filters, pagination/virtualization where lists exceed the visible area.
4. Test narrow screens, keyboard navigation, permissions, stale references, deleted contacts/materials, and concurrent edits.
5. Run production build and focused business-rule tests. Do not deploy without Anir's explicit instruction.

### Phase 4: AI after rollout feedback

Implement assisted planning and generation through Freyr Fusion using the active plan and connected account data as grounded context.

## Concrete code map

Keep account planning out of the already-large `CustomerTabs.tsx` implementation except for tab registration and rendering. Suggested files:

- `supabase/migrations/029_account_planning.sql`: lifecycle field, plan tables, constraints, indexes, and policies
- `lib/accountPlanningShared.ts`: types, enums, validation limits, deterministic gap rules
- `lib/accountPlanning.ts`: server-only reads, writes, reference validation, and audit events
- `lib/accountPlanningMock.ts`: dense sample plan using the same public types
- `app/api/customers/[id]/account-plan/route.ts`: plan-level GET/POST/PATCH
- `app/api/customers/[id]/account-plan/[collection]/route.ts`: typed child operations, or explicit sub-routes if clearer
- `components/customers/CustomerAccountPlanTab.tsx`: read view and section orchestration
- `components/customers/AccountPlanEditor.tsx`: in-place editor and conflict handling
- `components/customers/AccountPlanOfferingTable.tsx`: plays, materials, and linked work
- `components/customers/AccountPlanStakeholders.tsx`: stakeholder table and Decision path
- `components/customers/AccountPlanActions.tsx`: action table
- `components/customers/AccountPlanGaps.tsx`: derived gap list

Existing integration points:

- `app/customers/[id]/page.tsx`: fetch the plan and the permitted reference data in parallel
- `components/customers/CustomerTabs.tsx`: register `account-plan`, add it to the Real-mode allowlist, and render the dedicated component
- `lib/agentAccountContext.ts`: add a bounded read-only plan summary after permission filtering
- `components/tasks/TasksWorkspace.tsx` and its server page: merge due plan actions into the existing queue
- `app/customers/[id]/report/page.tsx`: add the approved plan summary after the interactive tab is stable
- `lib/customer360.ts`: keep connected record counts; do not add a second Account plan band beside the tab

The customer route currently performs several independent reads sequentially. Account-plan work should also group independent server reads with `Promise.all` so adding the tab does not make customer pages slower.

## Acceptance criteria

- Every Real-mode customer and migrated target account has an Account plan tab.
- A rep can understand the objective, revenue target, target date, top plays, decision-maker, next action, and biggest gap without leaving the first viewport.
- All offerings, people, materials, goals, opportunities, requests, meetings, and contracts shown in the plan are clickable when the user has permission.
- A dense plan with at least 12 offering plays, 25 stakeholders, 40 actions, and 30 materials remains readable and searchable without overlapping or premature fading.
- Long text truncates only in table rows and expands on demand; it never overlaps another control.
- Organization hierarchy can pan horizontally and vertically, with visible connector lines.
- Correct profile pictures appear only through stable IDs; missing photos fall back to initials.
- The plan never invents progress, revenue actuals, pacing, decision-makers, or relationships.
- Mock and Real use the same UI behavior, while writes remain isolated by data mode.
- Unauthorized users can view only what their module and record scope allow and cannot mutate the plan.
- Every write is auditable and handles concurrent updates without silently overwriting a newer revision.
- Target migration preserves source facts and reports duplicate matches before any write.
- No deployment occurs unless explicitly requested.

## Recommended first implementation slice

Build a vertical slice on one customer before adding AI:

1. Account plan tab in Real and Mock
2. Plan header and objective
3. Offering plays table with offering and approved-material links
4. Stakeholder table with contact links, reporting line, decision-maker, and introducer
5. Action table with owner and due date
6. Connected opportunity and solution-request links
7. Permissions, audit event, dense mock fixture, and focused tests

That slice proves the full data model and the core sales workflow. The organization-map visualization, Tasks aggregation, report export, target migration, and AI can then build on stable records instead of forcing another redesign.
