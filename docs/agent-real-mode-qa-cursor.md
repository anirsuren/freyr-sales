# Freyr Agent QA cursor — real development workspace

Scope: localhost:3006, real/live development data only. Reuse the existing Chrome tab, keep one Agent request in flight, and continue from the next unchecked case. Do not test Mock-only or Voice pages.

## 2026-09-25 — Offering ownership, materials, links, and chat handoff

- Runtime health: healthy, `dataMode: live`; local Supabase URL matched development project `ebyoefeikqxxxxifgjxk`.
- Source record: `/offerings/of-0kzte91` (Agent.Fia). The offering page showed Neha Sharma as its sole owner and **Sales Materials (2)**.
- Side-chat question: “Who owns Agent.Fia, how many sales materials are attached, and where can I open this exact offering?”
- Result: Correctly named Neha Sharma, said two materials, and linked the exact offering. The owner link opened `/team?member=253d19f7-501d-4bae-ac51-b593c30932fe`, filtered to and expanded Neha's team row. Side chat remained open with the answer. “Open full chat” selected the same conversation and preserved the question, answer and Agent.Fia page context. No fix needed.
- Observation to investigate only if repeatable: before sending this question, opening the side chat showed a saved “connection stopped before the answer finished” alert. The new request completed normally. No cause or current failure is established from this single alert.

## 2026-09-25 — Opportunity ownership, status, currency, date and link

- Runtime health remained healthy in `live` mode and the local Supabase URL still matched development project `ebyoefeikqxxxxifgjxk`.
- Source record: `/opportunities/opp-mt6d9mjl-urv8t` (OPP-0001, Medical device GRI for J&J Medtech). The page shows Anir Suren as owner, Submitted to client, 60% confidence, $1,000,000 USD estimated TCV, and expected sign date 4 Sept 2026.
- Full-chat question asked for those exact fields and a direct record link. The Agent answered “You own” (Anir is the signed-in user), Submitted to client, 60%, $1,000,000 USD and September 4, 2026. Its link opened the exact source record in the existing Chrome tab. No fix needed.

## 2026-09-25 — Customer Team and relationship health (verified fix)

- Source record: `/customers/3e3489c8-9833-4ca8-af44-cc61a94c5580` (J&J Medtech, CUS-0012). Its Team tab shows Anir Suren as the sole person because he owns one open deal there. Its Overview shows relationship health **30/100, At risk**. The exact customer link is that route.
- Side-chat question: “For this J&J Medtech account, who is on the account team, how many open deals does that person own here, and what is the current relationship health score and status? Link this exact customer record.”
- Initial failure: Agent correctly named Anir and one deal but claimed no recorded health score. The live `get_account_detail` and `read_workspace customers` tools lacked the page's computed health. A first fix supplied health; the first retest then invented **80, Good**. A stronger exact-account page grounding corrected the health but exposed a separate failure: Agent said the team was empty because it relied on the explicit account-team store. The Customers page also infers people from linked work.
- Fix: live customer tools now return the same computed health estimate, explicitly labelled as derived rather than stored. For named account questions, the Agent receives exact health and, when asked about the team, the same `buildCustomer360` Team band as the customer page. The customer workspace reader labels explicit assignments as such so an empty assignment list cannot be mistaken for an empty displayed team.
- Final browser retest in a fresh side conversation, same exact question: **Anir Suren**, **one open deal**, **30/100 At risk**, and the exact customer link. The answer's person link pointed to `/team?member=6d64db4f-77ad-4a38-a825-10b4fdbc4424`; the customer link matched the source URL. Focused `agent-workspace` tests (27), typecheck, and targeted lint passed.
- Separate observation: opening a fresh side chat sometimes displayed a saved “connection stopped before the answer finished” alert even though the preceding question had completed. This has occurred more than once, but did not stop the next question. Investigate the chat-state lifecycle in a later bounded run; do not call it a transport failure yet.

## 2026-09-25 — Organization goal progress visual and side-to-full continuity

- Runtime remained healthy in `live` mode, with the local app pointed at development Supabase project `ebyoefeikqxxxxifgjxk`. No business data was changed.
- Source record: `/performance/goal/pg-mspb1463-80fuu`, **Email Prospecting Campaigns Launched**, FY 2026/27. The goal page shows an annual target of **5,000 campaigns** and **400 verified**. Its August 2026 row shows 400 verified, no waiting or sent-back results, 8% of target, no schedule, and Marketing group as the only contributing group with 400.
- Asked one side-chat question for the August breakdown, the correct unit and progress visualization, contributing group, and exact goal link. The Agent returned 400 verified, 0 waiting, 0 sent back, Marketing group 400, a direct link to the exact goal, and the same horizontal zoomable goal-progress visual as the Goals page. No currency was applied to campaign counts.
- Opened the same conversation in full Agent chat. The question, answer, exact link and chart all carried over. The full-chat chart's Zoom in control changed its scale to 1.6×. No fix needed.
- The saved “connection stopped before the answer finished” alert appeared again when creating a new side chat before this question. The request itself completed normally. The state check compared two null IDs, so a brand-new chat falsely looked like a failed conversation.

## 2026-09-25 — False side-chat connection warning (verified fix)

- `AgentDock` now shows the warning only for an actual failed conversation ID and clears that ID when starting a new chat. This fixes the recurring false warning without hiding a real request failure.
- Typecheck and focused lint passed. In the existing Chrome tab, reopened the real goal page, opened the side chat, then chose New chat. The warning no longer appeared, and the composer was ready. No extra paid Agent request was needed.

Next: rotate to an uncovered real page such as Leads, Solutioning, Contracts, Market Intel, or Reports. Inspect source records before a new Agent question, and keep one request in flight. Do not repeat the Agent.Fia, OPP-0001, J&J Medtech, or Email Prospecting questions.
