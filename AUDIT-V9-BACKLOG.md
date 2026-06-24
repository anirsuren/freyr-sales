# Freyr Sales Intelligence — V9 Backlog (agentic: memory & transparency)

Theme: give the agent **durable memory** of what it has done, and make every run
**transparent** with step-by-step detail. Continues the AGENT-VISION north star
("Transparent — an agent activity / run log, always showing the why").
✅ = done · ☐ = todo. Honest — only mark ✅ what truly works.

## A. Agent run history (shipped)
1. ✅ Persisted agent run history — new `AgentRun` type + an `agentRuns` store in
   the mock DB (and a matching `agent_runs` adapter on the Supabase side, so it's
   key-ready). Runs survive navigation and reload. Seeded with two example runs
   so the log reads as living from the first visit.
2. ✅ Per-run step timeline — each run carries typed `AgentRunStep[]`
   (`done` / `gated` / `escalated` / `skipped`). The console renders an
   expandable timeline per run with status icons (✓ done, shield = compliance
   gate, ↗ escalated), reusing the design tokens (success / warning / blue).
3. ✅ Run history on the Agent console — the old flat "What the agent did" list is
   replaced by "Agent run history": every act (one-click handle), play, and
   autopilot pass is recorded with kind, target account, outcome badge, step
   count, and time. Empty-state preserved for a fresh agent.
4. ✅ `/api/agent/runs` GET endpoint — lists persisted runs newest-first with full
   step detail, so the history is queryable and Supabase-ready. The act / run /
   autopilot routes all now write an `AgentRun` as they work.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 102 passed (added #100 run-history UI + step expand + persistence, #102 runs
API; updated #98/#100 for the new surface).

## B. Agent everywhere + account memory (shipped)
5. ✅ Per-account run history — the account detail's Agent rail now shows a
   "Recent agent runs" log scoped to that account (the customer page filters
   `agentRuns` by `customer_id` and passes them to `CustomerTabs`). Each run is
   expandable with its full step timeline, exactly like the console.
7. ✅ Run replay — every play run in the run history has a "Run again" button
   (in the expanded panel) that re-runs the play for that account via
   `/api/agent/run` and records a fresh run, then refreshes in place. Available
   on both the console and the per-account log. (Undo deferred — see #9.)
8. ✅ Dashboard agent surface — the dashboard now *leads* with "Your agent
   recommends": the top 4 next-best-actions (one-click "Let agent handle it" +
   deep links) in a highlighted card above the forecast, with "Open Agent" →
   `/agent`. Realises the north star's "agent surfaces lead, everywhere."

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 104 passed (added #103 dashboard agent surface, #104 per-account run history +
replay; hardened #100 with `.first()` now that multiple plays can exist).

## C. Agent on the deal + guardrails (shipped)
9. ✅ Run undo — auto-handled runs (one-click `act` + `autopilot`) record the
   timeline entries they create (`interaction_ids`). The run history's "Undo"
   button deletes those entries via `/api/agent/undo` and marks the run
   `reverted` (struck-through badge + "Reverted" label), keeping the rep in
   control of anything done without approval. Human-approved sends aren't
   undoable (the play already went out). New `interactions.remove` +
   `agentRuns.update` on both the mock and Supabase adapters.
10. ✅ Deal detail agent surface — `/deals/[id]` now leads with "Agent — next
   best action for this deal": the account-scoped next-best-action(s) with
   one-click handle, plus "Run a play" for that account. The agent works the
   pipeline, not just the console.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 106 passed (added #105 deal agent surface, #106 undo reverts an auto-handled
run). Undo verified end-to-end: autopilot logged 11 entries → undo removed 11
and marked the run reverted.

## D. Agent on the pipeline + goal-driven (shipped)
11. ✅ Pipeline agent surfaces — two of them. (a) A **pipeline agent banner** at
   the top of `/pipeline` that counts cooling deals and offers "Re-engage
   cooling deals" (runs autopilot) with an Open-Agent link; shows a calm
   "Pipeline looks healthy" when nothing's stalled. (b) A **per-card "Agent:
   re-engage this deal"** one-click on every cooling Kanban card (drafts via
   `/api/agent/act`, then shows "Agent drafted re-engagement").
12. ✅ Goal templates — the console goal bar now offers four one-tap templates
   (save at-risk, re-engage stalled, draft meeting follow-ups, work the whole
   pipeline), each an icon + description that expands into a visible plan via
   `planGoal`. Free-text goal still works.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 108 passed (added #107 goal templates → plan, #108 pipeline agent surface +
per-card re-engage). Per-card hint depends on live staleness (earlier autopilot
tests reset it), so its click is exercised when a cooling deal is present and
verified directly on a fresh seed (2 cooling deals → 2 hints render).

## E. Plan execution + contacts agent (shipped)
13. ✅ Contacts agent surface — the contact detail now leads its right rail with
   an "Agent recommends" card: a next-best-action chosen for that specific
   contact (send a due follow-up / draft a first touch / multi-thread the
   account / value nudge) via `suggestForContact`, with one-click "Let agent
   handle it" → `/api/agent/act`.
14. ✅ Plan execution — the console goal bar closes the goal → plan → action
   loop: after drafting a plan, "Execute plan" runs a goal-scoped pass
   (`/api/agent/plan`) that handles the safe actions matching the goal's intent
   and escalates the rest, then records a transparent "plan" run (new
   `AgentRunKind` with its own icon/label in the run history). Shows an
   "Executed — N handled · M escalated" result inline.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 110 passed (added #109 goal plan executable end-to-end + recorded as a run,
#110 contact agent next-best-action). Plan API verified: goal "Re-engage
stalled accounts" → handled 2 reengage actions, recorded a `plan` run.

## F. Agent inbox (shipped)
16. ✅ Agent inbox — a dedicated `/agent/inbox` page that splits everything the
   agent has queued into **"Needs your approval"** (compliance approve +
   ready-to-send, the human gate) and **"Agent will handle"** (draftable
   re-engage / stabilize / follow-up, with the autopilot panel inline). Backed
   by `/api/agent/inbox` (counts + items). Surfaced three ways: a **sidebar
   "Agent Inbox" entry with a live badge** of pending approvals, a **console
   summary card**, and the page itself. Seeded two sessions into review states
   (Cortexa in_review, Quantum approved) so the approval queue is real.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 112 passed (added #111 inbox splits approval vs auto-handle, #112 console →
inbox). Inbox API verified: 2 awaiting approval · 10 the agent can handle.

## G. Inbox bulk actions (shipped)
17. ✅ Bulk approve — the inbox approval lane now has "Approve all (N)", which
   clears every pitch in compliance review in one pass via
   `/api/agent/approve-all` (mirrors the per-session approve: sets reviewer +
   reviewed_at, records a transparent agent run). Plus its natural completion,
   **"Send all approved (M)"** (`/api/agent/send-all`) — delivers every cleared
   pitch that hasn't gone out (logs an "Email sent" interaction + delivers via
   the configured channel, mock when no key). Only approved pitches are
   eligible, so the compliance gate still holds.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 114 passed (added #113 bulk approve clears compliance, #114 bulk send delivers).
End-to-end verified: approve-all (1) → 2 approved-unsent → send-all (2) → queue
empty.

## H. Sequences agent surface (shipped)
15. ✅ Sequences agent surface — the agent now genuinely enrolls accounts into a
   cadence. New **persisted** `sequenceEnrollments` store (mock + Supabase
   adapter + type), so enrollments survive navigation and render on Sequences.
   A banner on `/sequences` finds stalled accounts not yet in a cadence and
   "Enroll N" runs `/api/agent/enroll` (creates the enrollment, logs the account
   timeline, records a transparent agent run). The cadence list shows a live
   "N enrolled" badge and the Re-engagement cadence lists agent-enrolled
   accounts. Seeded one enrollment so it reads as live.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 115 passed (added #115 agent enrolls into a sequence; updated #70 with
`.first()` now that the cadence has live enrollments). Enroll verified
end-to-end: candidate → enrolled → agent run recorded → banner clears.

## I. Sequence execution (shipped)
19. ✅ Sequence step advance — the agent now *executes* a cadence, not just
   enrolls. Each managed (agent-enrolled) account gets an "Advance" control, and
   each cadence has "Advance all (N)"; both call `/api/agent/advance`, which
   increments the persisted `step_index`, logs the touch (channel + label) to
   the account timeline, records an agent run, and marks the cadence
   **Completed** at the last step. New `sequenceEnrollments.get/update` on both
   the mock and Supabase adapters.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 116 passed (added #116 agent advances an enrolled account). Advance verified
end-to-end: single + "advance all" both increment step + record a run.

## J. Cadence auto-run + keyboard triage (shipped)
18. ✅ Inbox keyboard triage — on the Agent Inbox, **A** approves all pending and
   **S** sends all approved, without leaving the page (ignores typing in
   inputs). A subtle `kbd` hint sits next to the bulk buttons.
20. ✅ Sequence auto-run — the Sequences banner now runs the whole cadence end to
   end in one click ("Run cadence"): `/api/agent/cadence-run` ADVANCES everyone
   already enrolled who's due a touch, then ENROLLS every cooling account not yet
   in the cadence, logging each step and recording a single "plan" run. The
   banner shows "{N} to enroll · {M} due to advance" and collapses to "up to
   date" when there's nothing pending.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 118 passed (added #117 cadence end-to-end run, #118 inbox keyboard triage).
cadence-run verified: enrolled 1 + advanced 1 in a single call.

## K. Global agent command palette (shipped)
21. ✅ Global agent command palette — the existing ⌘K palette now has an **Agent**
   section reachable from any page: type anything and "Ask the agent: …" deep-
   links to `/agent?goal=…` where the goal bar auto-runs the plan; plus one-tap
   commands "Open AI Agent console", "Open Agent Inbox", "Run autopilot", and
   "Run re-engagement cadence" (the Run commands fire the endpoint inline and
   toast the result). The goal bar reads `?goal=` on mount, runs it, and clears
   the param.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 120 passed (added #119 palette agent commands + nav, #120 goal deep-link
auto-runs a plan).

## L. Agent digest + palette keyboard nav (shipped)
22. ✅ Agent digest — the console now leads with the agent's daily briefing
   ("Agent digest"): a synthesized "what I did" line (plays / plans / autopilot /
   one-click counts from run history) + recent run titles, "What needs you"
   (approvals + can-handle, links to the inbox), and a "Watch list" (cooling +
   at-risk). `buildDigest` is deterministic; `/api/agent/digest` GETs it and POST
   sends it (Telegram/email, mock when no key) via a "Send to me" button. It
   subsumes the old standalone inbox card.
23. ✅ Palette keyboard nav — the ⌘K palette is now a single selectable list:
   ↑/↓ move the highlight, Enter runs the selected command (goal, agent command,
   record, or page), mouse hover syncs selection. Enter on an empty match falls
   through to full search.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 122 passed (added #121 digest briefing, #122 palette ↑/↓ + Enter).

## M. Agent memory / preferences (shipped)
25. ✅ Agent memory — the console has an "Agent preferences" card where the rep
   pins standing instructions the agent's **autopilot genuinely respects**:
   a **Focus industry** (autopilot only acts on that industry; everything else is
   escalated, not dropped) and two toggles — **may re-engage cooling deals** /
   **may stabilize at-risk accounts** (off → those are escalated for the rep).
   Persisted `agentPrefs` (one row) on both the mock and Supabase adapters, with
   `/api/agent/prefs` GET/PUT. Verified end-to-end: stabilize off moved 4 actions
   from handled→escalated (10/2 → 6/6); a no-match focus industry escalates all.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 124 passed (added #123 prefs card persists a toggle, #124 autopilot respects
focus-industry — handled=0 when nothing's in focus).

## N. Prefs everywhere (shipped)
26. ✅ Prefs everywhere — the pinned focus-industry is now a global lens, not just
   an autopilot rule. A shared `actionsInIndustry` helper filters the
   next-best-action queue by the rep's focus on the **console** (with a "Focused
   on X · N outside focus" chip + the digest derived from the filtered set), the
   **Agent Inbox** (page + the `/api/agent/inbox` count that drives the sidebar
   badge), the **dashboard** "Your agent recommends", and the **plan** route.
   Autopilot keeps escalating out-of-focus items (transparent), while the
   recommendation surfaces hide them behind the lens.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 126 passed (added #125 focus filters the whole queue — inbox empties for a
no-match industry, #126 console focus chip). Verified: Pharmaceutical focus took
the inbox from 2/10 → 0/3.

## O. Per-rep ownership lens (shipped)
27. ✅ Per-rep ownership lens — a new "Only act on my accounts" preference. The
   focus helper is now `focusActions` (industry **and** ownership), applied
   across the console, inbox (+ sidebar badge), dashboard, plan, and autopilot.
   Ownership is the deterministic `ownerFor` from pipeline (CURRENT_REP), so "my
   accounts" is honest without seeding owners. Lens chips now read "Focus:
   {industry · My accounts}". Verified: my-accounts lens took the inbox 2/10 →
   0/1; combines with focus-industry.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 128 passed (added #127 my-accounts lens narrows the queue, #128 the toggle
persists; updated #126 for the new "Focus:" chip label).

## P. Claude wiring for the account chat (shipped)
29. ✅ Real Claude wiring (key-ready) — the per-account "Ask the agent" chat now
   calls Claude when `ANTHROPIC_API_KEY` is set, and falls back to the
   deterministic `answerAccountQuestion` otherwise (or on any API error), so the
   chat never goes dark. New `agentAnswer(system, user)` in `lib/claude.ts`
   (reuses the existing Anthropic client) + a server `/api/agent/ask` route that
   grounds Claude in the account's facts. The chat is now async (Thinking… →
   answer) with a "via Claude" tag on LLM answers and a "Powered by Claude when a
   key is set" header. Honest: the mock fallback is what the suite exercises (no
   key in this env); the live path reuses the proven pitch-generation client.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 130 passed (added #129 ask route grounded + source flag, #130 chat is
Claude-ready; #101 still green with the async chat). Fallback verified: ask route
returns the grounded answer with source "mock" when no key.

## Q. Claude planner + lens presets (shipped)
28. ✅ Lens presets — one-tap focus combos on the Agent preferences card (Whole
   book / My accounts / Pharma / My pharma / My biotech) that set
   focus_industry + only_mine together; the active preset is highlighted, and
   saving now `router.refresh()`es so the queue + digest re-filter live.
30. ✅ Claude-back the goal planner — the goal bar now drafts its plan via the new
   `/api/agent/plan-steps` route (Claude when ANTHROPIC_API_KEY is set, grounded
   in the goal), falling back to deterministic `planGoal` on no-key/any-error.
   The plan shows a "via Claude" tag on LLM plans. (Digest narration still
   deterministic — carried to #31.)

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 132 passed (added #131 plan-steps route key-ready, #132 one-tap preset
re-filters the console; #99/#107/#120 still green with the async planner).

## R. Claude digest narration + agent-mode indicator (shipped)
31. ✅ Claude-back the digest narration — completes the Claude trilogy (chat →
   planner → digest). `narrateDigest` turns the digest facts into a one-line
   standup via Claude when `ANTHROPIC_API_KEY` is set (a "via Claude" tag shows
   on the card), falling back to the deterministic `didSummary` otherwise. The
   console and the "Send to me" digest both narrate.
32. ✅ Agent intelligence mode indicator — the console header shows a "Claude-
   powered" (key present) vs "Deterministic · key-ready" (no key) badge from
   `hasAnthropic()`, so the rep always knows which brain is driving — honest
   transparency, no fake claims.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 134 passed (added #133 agent-mode badge, #134 digest is sendable; #121 still
green with the narrated/fallback summary).

## S. Real drafted outreach at the gate (shipped)
34. ✅ Drafted email at the compliance gate — the "Run a play" stepper now shows
   the ACTUAL drafted email (subject + body) for the rep to review before
   "Approve & send", closing the loop on "the agent drafts the outreach". New
   `/api/agent/draft` route: Claude when `ANTHROPIC_API_KEY` is set (grounded in
   the account/contact/service, "via Claude" tag), a grounded deterministic
   template otherwise. The draft is capped + scrollable; also hardened the Modal
   to be height-constrained + internally scrollable so tall dialogs keep their
   actions reachable.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 136 passed (added #135 draft route reviewable, #136 the play shows the draft at
the gate; #97 still green after the Modal-scroll fix).

## T. Editable draft + app-wide mode badge (shipped)
33. ✅ App-wide agent intelligence badge — the top bar shows a compact
   "Claude" / "Deterministic" pill (from `/api/agent/mode` → `hasAnthropic()`),
   so the rep knows which brain is driving from any screen, not just the console.
35. ✅ Editable draft — the drafted email at the compliance gate is now editable
   (subject input + body textarea). Edits tag the draft "edited", and the
   approved (possibly rep-edited) subject flows into `/api/agent/run`, which
   records it on the account timeline + the agent run ("Sent '…' (rep-edited)").
   Human-in-the-loop refinement of agent output, mock-first.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 138 passed (added #137 rep edits the draft → recorded run reflects it,
#138 app-wide mode badge; #136 updated for the new "edit before it sends" copy).

## U. Regenerate draft (shipped)
36. ✅ Regenerate draft — a "Rewrite" button on the drafted email asks the agent
   for another take. The draft route takes a `variant`; the deterministic path
   cycles three grounded angles (timeline → credibility → soft close), and Claude
   varies naturally (the variant nudges "take a different angle"). Completes the
   draft loop: draft → edit → rewrite → approve.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 140 passed (added #139 rewrite yields a different draft, #140 variants are
distinct). Verified: variants 0/1/2 produce distinct subjects + bodies, 3 wraps.

## V. Draft tone control (shipped)
37. ✅ Tone control — Warm / Formal / Brief chips on the drafted email. The draft
   route composes the rep's chosen tone (greeting + CTA + sign-off) with the
   angle (subject + value), so tone and "Rewrite" are orthogonal controls that
   each visibly change the draft; Claude gets a tone hint when keyed. The full
   drafting loop is now: draft → pick tone → rewrite angle → edit → approve.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 142 passed (added #141 tone changes the email, #142 tone chips restyle the
draft live). Verified: warm/formal/brief produce distinct greetings, CTAs, and
sign-offs.

## W. Default draft tone preference (shipped)
38. ✅ Default draft tone — `draft_tone` added to agent prefs (mock + Supabase-
   ready) with a Warm/Formal/Brief selector on the Agent preferences card. The
   draft route uses it when no tone is passed and returns the tone it used, so
   the play opens drafts in the rep's voice (still switchable per email). Set it
   once; the agent remembers.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 144 passed (added #143 default-tone drives the draft, #144 it's settable in
prefs). Verified: setting default=formal makes a no-tone draft come back formal.

## X. Autopilot schedule (shipped — catch-up model)
6. ✅ Scheduled autopilot (catch-up model) — honest, not a fake toggle: a real
   persisted cadence (`autopilot_cadence` off/daily/weekly + `autopilot_last_run`)
   with real due-math (`autopilotDue`). When a run is due, the console surfaces a
   "Your {cadence} autopilot run is due" banner with one-click "Run now" (runs
   autopilot, stamps last_run). Set the cadence on the Agent preferences card.
   Clearly labeled: it catches up on the rep's next visit; a deployment cron
   would fire it on time (so the true-background piece, #6b, stays open).

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 146 passed (added #145 due banner + run-now stamps last_run, #146 schedule is
settable). Verified: off→none, daily+no-last-run→due, stamped→not due.

## Y. Digest scheduling (shipped — catch-up model)
24. ✅ Digest scheduling — reuses the autopilot cadence model (`cadenceDue`):
   `digest_cadence` (off/daily/weekly) + `digest_last_sent`. When the briefing is
   due, the console shows a "Your {cadence} digest is ready" banner with one-click
   "Send to me" (sends + stamps last-sent). Cadence is set on the Agent prefs
   card; same honest catch-up framing as the autopilot schedule. Schedule chips
   carry disambiguating aria-labels.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 148 passed (added #147 due digest banner + send stamps last-sent, #148 digest
schedule is settable).

## Z. Draft library (shipped)
39. ✅ Draft library — reusable outreach snippets the agent remembers. Persisted
   `draftSnippets` store (mock + Supabase-ready) + `/api/agent/snippets`
   (list/create/delete). In the play's draft gate: "Save as snippet" stores the
   current draft, and an "Insert snippet" picker drops a saved one into the
   draft. Seeded with one example so the library reads as live.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 150 passed (added #149 snippet API list+create, #150 save + insert in the
play). Verified: GET seeded, POST grows the library, insert swaps the body.

## AA. Snippet management (shipped)
41. ✅ Snippet management — a "Snippet library" section on the Agent console lists
   every saved snippet (title + subject) with one-click delete (DELETE
   /api/agent/snippets), plus an empty state. Completes the draft-library loop:
   save in a play → reuse via Insert → prune here.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 151 passed (added #151 library lists + deletes). Verified: delete removes the
snippet and toasts.

## AB. Weekly review (shipped)
40. ✅ Weekly review — a dedicated `/agent/review` page: a Claude-narrated (key-
   ready) header summarizing the week, four rollup stats (agent actions this
   week, deals cooling, at-risk accounts, open pipeline at stake), a "What's at
   stake" list of the top open deals by value, and "What the agent did this week"
   from the run history. `buildWeeklyReview` is deterministic; linked from the
   console under the digest. Distinct from the daily digest (period rollup vs.
   current state).

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 153 passed (added #152 review rollup renders, #153 console → review link).

## AC. Snippet rename (shipped)
42. ✅ Snippet rename — inline rename in the Snippet library (pencil → edit the
   title, Enter/blur to save) via PATCH `/api/agent/snippets` +
   `draftSnippets.update` (mock + Supabase). Completes snippet CRUD:
   save → insert → rename → delete.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 154 passed (added #154 rename persists). PATCH verified end-to-end.

## AD. Export the weekly review (shipped)
43. ✅ Export the weekly review — "Print / PDF" (browser print; global `@media
   print` CSS drops the app chrome so the page exports clean) + "Share" (POST
   `/api/agent/review/share` → sends the rollup via Telegram/email, mock when no
   key). Both on the review header, hidden from the printout.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 155 passed (added #155 review export — print button + share toast).

## AE. Persistent account chat (shipped)
45. ✅ Per-account agent chat history — the "Ask the agent" thread is now
   persisted per account (`agentChats` store, mock + Supabase-ready). New
   `/api/agent/chat` (GET history, POST answers via Claude/deterministic AND
   persists both the rep's message and the reply). The chat loads its history on
   open, so the conversation survives navigation/reload.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 157 passed (added #156 chat persists via API, #157 thread survives a reload).
Verified: GET empty → POST → GET returns the me+agent pair.

## AF. Chat clear + snippet usage (shipped)
44. ✅ Snippet usage count — `uses` on each snippet, bumped via
   `/api/agent/snippets/use` whenever one is inserted in a play; the library
   shows "N uses" and sorts most-used first, so the agent surfaces what works.
46. ✅ Clear account chat — a "Clear" control on the per-account thread + DELETE
   `/api/agent/chat` (clears that account's messages) resets the conversation.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 160 passed (added #158 clear API, #159 usage increments, #160 UI clear resets).
Verified: chat 2→0 on clear; snippet uses 4→5 on bump.

## AG. Snippet picker order + library search (shipped)
47. ✅ Most-used snippet first — the play's "Insert snippet" picker now sorts by
   usage (most-used first), matching the library, so the proven snippets surface.
49. ✅ Snippet library search — a search box (shown once >3 snippets) filters by
   title/subject, with a "no matches" state.
48. ✅ Account-filtered agent activity — already shipped (V9b): the account
   detail's Agent rail shows "Recent agent runs" scoped to that account. Marked
   honestly; no new work needed.

Verification: `npx tsc --noEmit` clean; `npx playwright test tests/verify.spec.ts`
→ 161 passed (added #161 library search filters; #150 still green with the
re-sorted picker).

## AH. Next agentic ideas
6b. ☐ True background firing for the schedules (needs a deployment cron / queue) — deferred (can't be done honestly in-app).
50. ☐ Snippet categories/tags for larger libraries.
51. ✅ Agent run detail page — `/agent/runs/[id]` deep-links a single run: header
    with kind + outcome badge, a 4-up metadata strip (kind / steps done / entries
    logged / timestamp), an account deep-link, and the full step timeline with
    per-step status labels. Run history's expanded panel gained an "Open run" link.
    notFound() on bad ids. Tests 162 (detail page) + 163 (deep-link from history).

## AI. Run transparency & navigation
50. ☐ Snippet categories/tags for larger libraries.
52. ✅ Run detail "What it logged" — the detail page now resolves each
    `interaction_id` the run wrote into a card (outcome badge + notes + author),
    each deep-linking to the account it touched. Reverted runs show the entries
    struck-through with a rollback note. Only fetches the activity log when the
    run actually wrote entries. Test 164.
53. ✅ Agent run history filter — the console's run history gained kind +
    outcome dropdowns (data-driven: only offers values present in the runs),
    a live "N of M" count, and a "no runs match" empty state. Shown only when
    there are >2 runs and >1 kind/outcome. Test 165.

## AJ. Agent accountability
50. ☐ Snippet categories/tags for larger libraries.
54. ✅ Run detail actions — a `RunDetailActions` client component puts "Run
    again" (plays) and "Undo" (auto-handled runs with logged entries) on the
    detail page itself, mirroring the history panel and refreshing on success.
    Test 167.
55. ✅ Agent activity by account — `buildActivityByAccount` rolls up this week's
    non-reverted runs per account (runs + handled/sent/escalated breakdown +
    last-touched), rendered as a new weekly-review section that deep-links each
    account; pipeline-wide passes (autopilot) are counted separately. Test 166.

## AK. Agent impact
50. ☐ Snippet categories/tags for larger libraries.
56. ✅ Per-account weekly summary — the account's Agent rail now shows a
    "This week: N runs · X handled · Y sent · Z escalated" chip above recent
    runs, via `weeklyOutcomeSummary` (account-scoped). Test 169.
57. ✅ Agent impact leaderboard — `/agent/impact` ranks accounts by how much the
    agent worked them this quarter (runs + outcome breakdown + last-touched),
    joined with current open pipeline at each, with medal-ranked rows and 4 stat
    cards (runs / accounts worked / entries logged / pipeline at those accounts).
    Honestly framed as an *effort* view, not a causation claim; pipeline-wide
    passes counted separately. Linked from the console ("See agent impact").
    `buildAgentImpact`. Test 168.

## AL. Impact analytics
50. ☐ Snippet categories/tags for larger libraries.
58. ✅ Impact time-window toggle — `/agent/impact?window=week|quarter|all` pills
    re-scope the whole page (stat cards, leaderboard, chart) via a server-side
    searchParam; `buildAgentImpact` now takes `windowDays` (null = all time),
    `IMPACT_WINDOW_DAYS` maps the windows, and the runs stat relabels per window.
    Test 170.
59. ✅ Runs-over-time chart — `buildRunSeries` buckets non-reverted runs (week →
    7 daily, quarter → 13 weekly, all → 12 monthly) into the existing `BarChart`,
    shown as "Agent runs over time" with an empty state. Test 171.

## AM. Goal plan preview
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
62. ✅ Goal plan dry-run preview — `/api/agent/plan` gained a non-mutating
    `preview` mode returning `willHandle` / `willEscalate` (title + company +
    account href + kind). The goal bar now shows, before you execute, exactly
    which accounts the agent will handle automatically vs. escalate for your
    approval — each deep-linking to the account — and the execute helper reflects
    the counts. Makes the approval gate real. Tests 172 (non-mutating) + 173 (UI).

## AN. Partial-plan execution
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
63. ✅ Partial-plan execution — the preview's "will handle automatically" items
    are now individually selectable (checkbox + select/deselect-all), defaulting
    to all-on. Execute sends only the kept `selectedIds`; the route handles those,
    skips the rest (tracked + surfaced in the run summary), and creates no run
    when nothing is acted on. The execute helper + button reflect the live
    selection. Tests 174 (API gating invariant) + 175 (deselection UI).
    Also hardened test 109 to a goal that always has work.

## AO. Complete the human approval gate
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
65. ✅ Inline approve / decline in the agent inbox — approval items (pitches in
    compliance review) now carry their `sessionId` and expose inline **Approve**
    and **Decline** buttons in `AgentActions`, so the rep can clear or send a
    pitch back for changes without leaving the inbox (reuses the existing
    `request_changes` review action). Completes the human gate (approve OR
    reject), not just approve. Test 176.

## AP. Close the decline feedback loop
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
66. ✅ Decline with a reason — clicking Decline in the inbox opens an inline
    reason editor (textarea + Send back / Cancel); the reason is saved as the
    pitch's `review_note`. Tests 176 (send back) + 177 (cancel).
67. ✅ "Sent back for changes" rework lane — declined pitches
    (`changes_requested`) now reappear in a dedicated inbox lane with the reason
    and reviewer + a "Revise" deep-link, so a decline is tracked rework, not a
    dead end. Closes the human-feedback loop. Test 176.

## AQ. Complete the compliance round-trip
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
68. ✅ Re-submit for review — the rework lane gained a one-click "Re-submit for
    review" (`ReworkActions`) that puts a revised pitch back in_review, closing
    the decline → revise → re-review loop. Test 178.
69. ✅ Reworks count toward the inbox badge — the inbox API now returns
    `reworks`, and the sidebar badge sums approvals + reworks so sent-back
    pitches needing the rep aren't invisible. Test 179.

## AR. Agent research pillar
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
70. ☐ Re-submit with a "what I changed" note for the reviewer.
71. ✅ Agent account briefing — the agent's proactive *research* read at the top
    of the account overview: `buildAccountBriefing` synthesizes a headline, key
    reads (health / pipeline / threading / momentum / competitive) and the
    recommended next move from the account's state. Renders deterministically,
    then swaps in a Claude-narrated headline when keyed (`narrateBriefing`,
    `/api/agent/briefing`), with a fallback that never blocks. Tests 180 (API)
    + 181 (overview card).

## AS. Briefings everywhere
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
72. ✅ Briefing actions — the account briefing gained a "Brief me again" refresh
    (re-narrates) + copy-to-clipboard (full briefing as text), with a copied
    check + toast. Test 183.
73. ✅ Pre-call deal briefing — `buildDealBriefing` synthesizes a deal-specific
    read (stage + win probability, value/weighted, momentum/rotting, next step)
    rendered via a presentational `BriefingCard` at the top of the deal detail.
    Extends the research pillar to the pipeline. Test 182.

## AT. Agent trust & guardrails
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
74. ☐ Briefing: surface it on the contact detail too (pre-call contact read).
75. ✅ High-value guardrail — a new `autopilot_max_value` preference ("always ask
    above $X"). Autopilot AND plan execution/preview escalate (never auto-handle)
    draftable actions on accounts whose open pipeline exceeds the ceiling, via
    `openValueByAccount`. The rep keeps big deals on their desk while the agent
    runs the long tail. Settable in preferences (Off / $100K–$1M). Tests 184
    (reclassification invariant) + 185 (settable + persists).

## AU. Guardrail transparency
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
74. ☐ Briefing: surface it on the contact detail too (pre-call contact read).
76. ✅ Guardrail transparency — autopilot, plan execution, and plan preview now
    report `heldForValue` + `ceiling`: how many would-be auto-handles the value
    ceiling held back, and at what threshold. Surfaced as a warning banner in the
    Autopilot report and the goal-plan preview ("N held for your sign-off — over
    your $X ceiling"), and recorded in the autopilot run summary. Tests 186
    (exact hold-count identity) + 187 (autopilot banner).

## AV. Agent UX cleanup (CEO-clarity pass — user-requested, not a loop cycle)
The `/agent` home had grown to 11 stacked sections and overlapped the inbox.
Decluttered to a clear cockpit; moved config out; de-duped the action queue.
- ✅ `/agent` home slimmed to a 3-beat narrative: **direct** (goal bar) →
  **status** (digest, with Open inbox / View pipeline) → **recent activity**
  (run history). Title "AI Agent" → "Agent"; links shortened to "Weekly review"
  / "Agent impact"; added a settings gear.
- ✅ Removed from the home: the giant `AgentPreferences` panel, the
  `SnippetLibrary`, the redundant "Recommended next actions" list (it *is* the
  inbox), and the duplicate `AutopilotPanel`.
- ✅ New `/agent/settings` page now holds `AgentPreferences` + `SnippetLibrary`.
- ✅ Autopilot now lives only in the **inbox** (the queue it works); the home
  keeps just the "a scheduled run is due" catch-up banner.
- Inbox left as-is (already clear: approvals · sent-back · agent-will-handle).
- ~15 Playwright tests repointed to the new locations; full suite 187 green.

## AW. Research pillar — contact briefing
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ☐ Goal preview: edit/override the draft for a handled action before it runs.
74. ✅ Pre-call contact briefing — `buildContactBriefing` synthesizes a read on
    an individual: role, buying style (persona + top engage tip), momentum
    (last touch / next step), and threading, plus the recommended next move.
    Rendered via the presentational `BriefingCard` at the top of the contact
    detail. Briefings now cover account, deal, AND contact. Test 188.

## AX. Steer the agent's drafts
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
64. ✅ Plan draft steer — the plan preview now has an optional "Steer the drafts"
    instruction; `/api/agent/plan` accepts it, weaves it into every logged
    entry's note ("— steer: …") and the run summary, and (with a Claude key) it
    would feed the draft prompt. Human steers the agent's batch before it runs.
    Tests 189 (steer recorded on the run) + 190 (steer input in the preview).

## AZ. CEO clarity pass (Suren) — human-led, plain-language, no clutter
Directed by the CEO (Suren, non-technical): agent must clearly *assist* the human;
plain English; no mock buttons; less nav; fix the agent page's dead right gap.
- ✅ Top-right "Sarah Chen" is now a real **account menu** (Settings · Agent
  settings · Knowledge base · Service catalog · Recordings · Keyboard shortcuts) —
  every item routes to a real page. Was a dead button. Test 138.
- ✅ Removed the "Deterministic / Claude-powered" jargon badge everywhere
  (topbar + agent home) — meaningless to the user. Test 133 repurposed.
- ✅ Sidebar decluttered to **one flat 11-item list, no section headers, no
  scroll** — "Sarah Chen" footer now always visible. Moved Knowledge base /
  Service catalog / Recordings into the account menu; Notifications is the bell;
  the agent's queue is a tab. Tests 03/28 updated.
- ✅ **Agent area unified** under one tab bar: **Agent · To-do · Settings**
  (`app/agent/layout.tsx` + `AgentTabs`). Removed the separate "Agent Inbox"
  sidebar entry; "Inbox" renamed **To-do** in plain terms.
- ✅ Agent home **re-centered** (no more dead right gap) and reframed as a
  human-led assistant ("you review and approve everything before anything goes
  out"). Dropped the redundant settings gear (now a tab).
- ✅ "Let agent handle it" → **"Draft it for me"**; toast → "Drafted — saved to
  the account's timeline for you to review." (clear what happened). Tests 95/110.
- Persona saved to memory (surendheen-persona) to keep designing for him.
- ✅ Mock-button audit (full sweep): no `href="#"`, no `alert()`, no no-op
  handlers, no "coming soon" dead controls anywhere. The only real offenders were
  the Dashboard "Recent Sessions" **two dead icon buttons** (filter + download) —
  replaced with a real "View all sessions →" link (CSV export already exists
  globally via `DashboardExport`). Softened one honest "coming soon" caption on
  the working URL-attachment feature. Test 191 (export downloads + link works).
- ✅ Plain-language pass on the agent's activity (CEO named "Executed plan" as
  confusing): "Executed plan: X" → "Worked on: X"; "handled" → "drafted for
  you"; "escalated" → "waiting for your approval"; run-kind labels Drafted /
  Outreach / Autopilot / Goal; goal-bar, autopilot panel, digest, schedule
  banner, and preference hints all reworded. No internal jargon left in the
  agent UI. 191 tests green.

## V10. The agent IS a chat (Suren's #1 ask: "make it like ChatGPT")
- ✅ `/agent` rebuilt as a **full-screen ChatGPT-style chat** — conversation
  history rail + message thread + composer + empty state with starter chips.
  Full-bleed (AppShell), so the dead gaps above/left/right are gone.
- ✅ Grounded chat brain (`lib/agentChat.ts` + `/api/agent/converse`) — answers
  14 intent families (focus, cooling, at-risk, follow-ups, pipeline, biggest,
  approvals, recent, account summary, draft outreach, call prep, counts,
  greeting, fallback) from live data; deterministic, Claude-layered when keyed.
  Conversations persist client-side; new chat / history / delete all work.
- ✅ Validated **94 Suren-style prompts (14 families × 12 accounts) → 94/94**
  grounded; multi-turn flows work. See AGENT-CHAT-SCENARIOS.md. Tests 192–193.
- ✅ The old goal/plan/digest cockpit preserved at **/agent/plan ("Goals")** —
  nothing lost; reachable from the chat rail + the agent tab bar
  (Chat · Goals · To-do · Settings). ~18 tests repointed; full suite 193 green.
- ✅ Chat is now **context-aware**: it sends recent turns to `/api/agent/converse`,
  so "Make it shorter" / "More formal" / "yes, do it" rewrite the draft for the
  account from the conversation (short / formal / warm variants via `makeDraft`).
  Fixed a real bug where each message spawned a new conversation (the id was
  reassigned inside the React state updater). Test 194. Suite 194 green.

## AY. Next agentic ideas (not yet started)
50. ☐ Snippet categories/tags for larger libraries.
60. ☐ Impact page: stacked bars by outcome (handled/sent/escalated) in the chart.
61. ☐ Export the impact view (print/share, like the weekly review).
