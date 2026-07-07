# Agent chat — Suren's test scenarios (V11)

The `/agent` screen is a full-screen, ChatGPT-style chat (conversation history +
thread + composer). It is backed by a brain (`lib/agentChat.ts` +
`/api/agent/converse`) that does two things:

1. **Answers** questions, grounded in live pipeline data (never invents numbers).
2. **Acts** — it carries out real work in the app when asked:
   - **Save a draft** onto an account's timeline ("save it", "save the draft").
   - **Set a follow-up** reminder ("set a follow-up with X next week", "remind
     me to follow up with X friday").
   - **Log a call / meeting / email** ("log a call with X").
   Each action is a real write (an `Interaction` + an `AgentRun`), so it shows up
   on the account and in "what did you do recently?". It is human-led — the agent
   **never sends anything outward**; a saved draft is explicitly marked "not sent,
   for your review."

## Real AI vs. the built-in brain
- When `ANTHROPIC_API_KEY` is set (in `freyr-sales/.env.local`), **Claude is the
  primary voice** for conversation: it receives the live pipeline facts in its
  system prompt plus the full conversation as real message turns
  (`agentConverse` in `lib/claude.ts`), so it reasons like an AI agent.
- Without a key, the built-in brain answers (varied, grounded) so the chat is
  never silent. **Actions run the same either way** — they're detected
  deterministically so "save it / set a follow-up / log a call" are always
  reliable and honest.
- To turn on real AI: put your key in `freyr-sales/.env.local` as
  `ANTHROPIC_API_KEY=sk-ant-...` and restart the dev server. Nothing else changes.
- Account names in Claude's free-form replies are post-processed into clickable
  deep-links (`linkifyAccounts` in the converse route), so the click-through UX
  matches the deterministic brain when real AI answers.

## Live-Claude validation (V13 — key is now set)
Pressure-tested real (`source=claude`) conversations as a rep; all correct:
- **Grounding:** "what's the latest with Globex Corporation?" → says it's not in
  the live data and offers to add it (no hallucination). Numeric: "how many open
  deals / total worth?" → "10 open deals, $3.1M, ~$1.4M weighted" (matches facts).
- **Human-led:** "email that to them right now" → "I can't send — that's your
  call; want me to save the draft?" (never sends).
- **Drafting:** uses the real contact ("Hi Marcus" for Cortexa), Subject line, no
  placeholders, signed "Suren Dheen · Freyr".
- **Multi-turn:** "make it shorter" rewrites the same draft, keeps the subject,
  re-offers to save (with a clickable account link).
- **Actions still bypass the LLM** (`source=action`) so save/follow-up/log stay
  reliable with the key on.

## How "100 in-depth scenarios" was validated (V11)
`scripts/agent-conversations.mjs` runs **100 distinct conversations, each 5–7
turns**, through `/api/agent/converse`, holding history exactly like the UI.
For action turns it asserts the agent actually DID the work (the route returns
`source:"action"` only after the DB write succeeds) and that the work then
appears in "what did you do recently?".

Latest run: **100/100 scenarios passed · 571 conversation turns · 162 action
writes verified.** UI/API coverage in `tests/verify.spec.ts` 192–198
(198/198 green).

## Scenario families (each cross-producted across the real accounts)
Morning triage → draft → save · account deep-dive → call-prep → follow-up ·
forecast review → draft → save · cooling sweep → formal draft → follow-up ·
greeting + smalltalk variety (no repeated canned lines) · log-a-call → follow-up
→ draft · approvals → thanks → cool → draft · at-risk → re-engage → save →
follow-up · counts → biggest → account · account-name → pronoun draft ("draft an
email to them") → save · refine chain (shorter/formal/warmer) → save → follow-up
tomorrow · multi-account switch · pipeline → cooling → draft → log · help → draft
→ save → follow-up in 2 weeks · neglect phrasing → re-engage → save → monday ·
quick draft + save + follow-up + thanks.

Run them anytime: `node scripts/agent-conversations.mjs`
