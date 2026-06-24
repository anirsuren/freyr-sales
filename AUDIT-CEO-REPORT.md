# Freyr Sales Intelligence — CEO Platform Audit

**Reviewer:** CEO, Freyr Solutions
**Method:** Walked every screen as a working member of the sales team — Dashboard, New Session intake, the generation/loading flow, the three-pane Session Detail, Sessions list, Pipeline, Customers (list + detail), Contacts (list + detail), Knowledge Base/Admin, Service Catalog, and Settings.
**Verdict:** The bones are genuinely strong. As a rep, I can research a prospect, get matched Freyr services, and walk away with three ready-to-use pitch assets in under a minute. That is real time saved. But "speeds up my pitch prep" is not the same as "runs my sales process." Below is what is missing to make this the system of record a Freyr seller — and I — would live in every day.

## What already works
The intelligence loop is the crown jewel: customer + contact enrichment, knowledge-base matching with confidence scoring, and three pitch formats (5-min script, intro email, cold-call script) with copy, regenerate, and editable workspaces. The three-pane Session Detail is exactly how a seller thinks — context on the left, the message in the middle, the next action on the right. The design is clean, consistent, fast, and on-brand. The mock-first architecture means it demos perfectly today and goes live the moment we add API keys. This is a credible v1.

## The gaps that matter (ranked by business impact)

**1. There is no measurement layer.** I cannot answer the three questions I ask every Monday: *What is in the pipeline, what will close this quarter, and who is performing?* The dashboard shows activity, not outcomes over time. There is no win-rate trend, no funnel conversion, no pipeline value by stage, no forecast. Without this, the platform helps individual reps but gives leadership nothing to steer with. This is the single biggest gap.

**2. The platform stops at the pitch — it does not close the loop.** A seller generates a brilliant email… and then leaves the tool to actually send it from Outlook. They draft a call script… then dial from their phone and come back to log it by hand. The schema even anticipates AI-assisted calls (`ai_call_completed`/`ai_call_failed` outcomes) but there is no calling, no sending, no sequencing. Every manual hop is a place deals leak and data goes uncaptured. We need send-from-platform, multi-touch sequences, and a real "next action" engine.

**3. It is a data island.** Freyr already runs on a CRM. If this does not sync bidirectionally with Salesforce/HubSpot, reps will double-enter or, worse, ignore it. Accounts, contacts, opportunities, and activities must flow both ways. Right now Settings shows four enrichment integrations (Anthropic, Firecrawl, Apify, Supabase) but no CRM, no email, no calendar.

**4. Pipeline was a placeholder.** For a "sales intelligence platform," the absence of a working deal board is conspicuous. A seller needs to see deals by stage, drag them forward, and see weighted value per column. This is table stakes and was not there.

**5. No team, no accountability.** Everything is "Sarah Chen." There are no roles (rep vs. manager vs. admin), no rep leaderboard, no manager roll-up, no territory/account ownership. I can't see my team; a manager can't coach. For a regulated B2B motion this also means no segregation of duties.

**6. Compliance and content governance are absent — and we are a regulatory company.** Our differentiator is rigor. Yet AI-generated outreach about FDA/EMA submissions has no approval workflow, no claims/disclaimer guardrails, no audit trail of who sent what to whom. If a rep emails an unsubstantiated efficacy claim to a VP of Regulatory, that's our brand on the line. We need content review states, locked compliance language, and an immutable activity log.

**7. Alerts are decorative.** The notification bell doesn't do anything, and "Needs Attention" is static. The highest-value thing this platform could do is tell a rep *"BioNex's NDA guidance changed today — re-engage Dr. Mehta."* Trigger-based, signal-driven alerts (regulatory events, no-response timers, buying signals) are how intelligence becomes proactive instead of a lookup tool.

**8. Search doesn't work.** There is a prominent global search bar and a ⌘K affordance, but they don't actually find anything. In a tool meant to be lived in, instant navigation to any account, contact, or session is non-negotiable.

**9. No reporting or export.** I can't pull a QBR deck, export pipeline to CSV, or hand the board a number. Knowledge work that can't be reported on doesn't get funded.

**10. Operational maturity.** No onboarding for new reps, no saved views/filters, no bulk actions, no keyboard-first power-user flows, no mobile, no SSO/permissions. These are what separate "a nice internal tool" from "software the whole org adopts."

## Where I'd invest first
If I'm allocating this quarter: (a) the **measurement layer** — analytics, forecast, pipeline value — so leadership gets ROI visibility; (b) a **working pipeline board** so deals are managed, not just researched; (c) **functional global search** so the tool is usable at speed; (d) **richer, realistic data** so what we demo to the board looks like a living business, not a sandbox; and (e) the start of the **execution loop** (send/sequence) so the platform earns its place in the daily workflow. The CRM sync, calling, compliance workflow, and team/permissions are fast-follows — strategically essential, but they depend on integration partners and security review.

## Bottom line
Today this is an excellent *pitch-preparation* tool. To be the *sales-intelligence platform* the name promises, it has to measure outcomes, manage deals, close the execution loop, and respect the compliance bar of a regulatory-affairs company. The gap is real but bridgeable — and the architecture is already set up to bridge it.

---

### Changes shipped in this pass (addressing #1, #2-preview, #4, #7-preview, #8, and data realism)
- **Working Pipeline** — drag-and-drop Kanban by stage with per-column deal counts and weighted value.
- **Analytics** — dashboard Overview/Analytics toggle now renders real charts: outcome mix, pipeline-by-stage, win rate, and a conversion funnel.
- **Functional global search (⌘K)** — searches across customers, contacts, and sessions and navigates instantly.
- **Realistic data** — expanded seed to a full book of business (12+ accounts, 15+ contacts, sessions and interactions across every stage) so every screen reflects a living pipeline.
- **Intake upgrade** — the 5-step pipeline is previewed on the form so reps know what's about to run.
- Notifications surfaced and "Needs Attention" wired to real signals where data allows; remaining strategic items (CRM sync, send/sequence, compliance workflow, roles/SSO) documented above as the roadmap.
