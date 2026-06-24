# Freyr — Agentic Platform Vision (north star for all loops)

**Freyr is not a passive CRM. It is an AI sales agent** that researches accounts,
decides the next best actions, drafts the outreach, and executes multi-step
GTM workflows — with the human approving. The rep states goals; the agent plans
and acts. Every action is logged and gated by approval (especially regulated send).

## Principles every future loop should steer toward
- **Lead with agent surfaces.** Recommended next-best-actions belong everywhere —
  dashboard, accounts, deals — not buried behind forms.
- **Goal-driven.** There's always a place to tell the agent what to do; it turns
  a goal into a plan of steps.
- **Execute with guardrails.** Reuse the compliance-approval gate before anything
  leaves the building; nothing auto-sends unapproved.
- **Transparent.** An agent activity / run log, always showing the "why"
  (reuse health factors, buying signals, deal staleness).
- **Mock-first, key-ready.** The agent is deterministic today; the same surfaces
  wire to Claude when `ANTHROPIC_API_KEY` is set. Never break the fallback.

This is a direction, not a mandate that every single loop touch the agent — but
when choosing the next batch, prefer the work that makes the platform more agentic.

## Agentic backlog (V7) — ✅ done · ☐ todo
1. ✅ Agent console (`/agent`) — goal bar + a ranked "recommended next actions"
   feed derived from real state (approvals, stalled deals, at-risk health,
   follow-ups), each linking to where to act.
2. ✅ Next-best-action suggestions on the account detail — an "Agent suggestions"
   card in the rail (account-scoped `nextBestActions`), reusing the shared
   `AgentActions` component.
3. ✅ Agent runs — `AgentRunPanel` runs a full play (research → match → draft →
   compliance review GATE → send) as a live stepper that auto-advances, pauses
   for human approval at the gate, then sends and logs the run via
   `/api/agent/run`. Launched from "Run a play" on each account.
4. ✅ "Let the agent handle it" one-click — draftable actions (re-engage /
   stabilize / follow-up) run via `/api/agent/act`, which logs the agent's step
   to the account timeline + Activity (Telegram ping). On the console + account card.
5. ✅ Autopilot — `/api/agent/autopilot` works the whole queue in one pass:
   auto-handles every draftable action (logs to timeline) and ESCALATES
   human-gated approve/send actions. The Agent console's Autopilot panel runs it
   and shows a Handled / Escalated report; Telegram gets a summary.

---
**Agentic V7 backlog complete (5/5).** Suite at 98 Playwright tests, all green.
The platform now: recommends (console + per-record), acts one-click, runs
end-to-end plays with a human approval gate, and autopilots the queue —
mock-first, wired to Claude when ANTHROPIC_API_KEY is set.
