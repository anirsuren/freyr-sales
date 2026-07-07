# Freyr Sales Intelligence — V8 Backlog (agentic, cont.)

V7 agentic backlog complete (5/5). Continuing the AGENT-VISION north star.
✅ = done · ☐ = todo. Honest — only mark ✅ what truly works.

## A. Agent transparency & planning
1. ✅ Agent activity log — the Agent console shows "What the agent did": every
   agent-logged step (handled actions, runs, autopilot passes) from real
   interactions where `logged_by = "Freyr Agent"`, newest first.
2. ✅ Goal → plan — the goal bar turns a typed goal into a visible step-by-step
   plan the agent would run (deterministic `planGoal`; LLM-backed with a key).

5. ✅ Per-account "Ask the agent" chat — an "Ask Agent" tab on each account; the
   agent answers questions (health, next step, deals, contacts, competitor,
   owner, last activity) grounded in that account's real context via
   `answerAccountQuestion`. Deterministic now; LLM-backed with a key.

## B. Future agentic ideas
3. ☐ Scheduled / recurring autopilot (needs a real scheduler — deferred so it's
   not a fake toggle).
4. ✅ Persisted agent run history with per-run step detail — shipped in V9 (see
   AUDIT-V9-BACKLOG.md). Every act / play / autopilot pass is saved as an
   `AgentRun` with a typed step timeline and surfaced on the console.
