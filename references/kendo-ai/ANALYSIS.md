# Kendo AI — reference teardown (screenshots captured 2026-07-06)

**What Kendo AI is:** an AI sales-call coaching platform. It ingests sales calls
(Live calls, AI roleplays, and manual uploads), **scores every call against
customizable scorecards**, surfaces coaching insights, and tracks rep + team
performance over time. It is Anir's #1 design/feature reference for the Freyr
platform's **voice-agent / call side** (calls → transcripts → scoring → coaching).

**Its look:** clean light mode, soft rounded cards, an **orange/amber brand
accent** (note: NOT blue — Freyr keeps blue), area charts with a soft orange
gradient fill, radar/spider charts, **red-tinted rows** for at-risk reps,
green/red pass-fail pills, mini sparklines on stat cards, a persistent
**left call-list rail** + a right **"AI Coach"** rail. Data-dense but readable.

Left nav: Overview · Performance · Agent · Calls · (Coaching) Roleplay ·
(Tools) Paths · Scorecards · Integrations · (Workspace) Billing · Context ·
Members. A "Live call minutes" usage meter pinned bottom-left.

## The screens

1. **kendo-01-overview-dashboard** — Team Overview. A big **Performance Overview
   area chart** with tabs (Live Call Score / AI Score / Close Rate / Calls) +
   hover tooltip. Row of **KPI stat cards** each with a WoW % delta (Avg Call
   Score, Team Win Rate, Avg Call Duration, Total Calls, Training Time, AI
   Roleplays). Right rail = **Live Feed** (who scored what, "Manager review
   recommended") + a **Decision Rail** ("726 calls analyzed", "4 reps need
   attention → Review Performance"). Below: Assigned roleplays, Team momentum
   (this week vs last), "Reps going quiet (6)".

2. **kendo-02-team-leaderboard** — every rep's scores across coaching skills in
   one table: **Objection · Pitch · Discovery · Closing · Training · Avg Score**,
   sortable, with **red-flagged counts** per rep and **rows tinted red** when
   they need a closer look. Three summary cards on top (Team Average, Strongest
   Area, Trend). Search + Performance/Skill filters. "Reps at risk" callouts
   ("19 days since last practice → Assign roleplay").

3. **kendo-03-member-radar-objections** — a single rep's page. Performance chart +
   a **radar/spider chart** of skills (Discovery, Pacing, Closing, Objection
   Handling, Presentation). Stat cards with **mini sparklines** (Cash Collected,
   Total Calls, Avg Live Score, Close Rate). Right rails: **Top Objections**
   (Price 25 calls · 51%, Features, Competitor (Gong), Authority — click to view
   calls) and **Key Strengths** (Feature-to-Benefit, Competitive Positioning,
   Assumptive Close…).

4. **kendo-04-member-missed-opps-allcalls** — same rep, lower. **Missed
   Opportunities**: AI coaching cards — "Prospect says X. Rep could have asked
   'Y'" + why it matters + **Estimated deal impact: 30–40% lower close
   probability**. Then **All Calls** table (Call, Type = Roleplay/Live pill,
   Score %, Revenue, View).

5. **kendo-05-call-scorecard-review-audit** — THE flagship (call detail →
   Scorecards tab). Header: overall **71/100**, "Assign training", "Add deal";
   tabs Summary · Scorecards · Feedback · Reviews. Scorecard chips (MEDDPICC,
   Cold Call, Discovery Call…). Three summary tiles: **Overall score 71/100**
   (team benchmark 40), **Criteria passed 9/11** (green bar), **Required misses
   1** (needs manager review). Then a **Review Audit**: criteria grouped into
   sections (1. Urgency & Relevance 68%, 2. Objection Handling 71%, …), each row
   = **Status pill (Passed/Missed)** · Criterion · **Score X/100** · **Evidence**
   (an actual transcript quote), + an AI narrative paragraph summarizing the
   section. "Required" tag on must-pass criteria.

6. **kendo-06-call-scorecard-sections** — more Review-Audit sections (Tie
   Features to Pain Points 72%, Pitch & Pricing 58%, Objection Handling) — same
   pass/miss + score + evidence-quote pattern, with AI narrative per section.

7. **kendo-07-zoom-fragment** — a zoomed crop (Anir's talking-head video overlay
   + a "Voice Profile Unlocked! Create report" card). Partial; least useful.

8. **kendo-08-call-player-reviews** — call detail top: a **video/audio player**
   (Fathom embed, scrubber, 1x speed, fullscreen), title + date, score chip,
   **Assign training / Add deal**, tabs Summary/Scorecards/Feedback/Reviews/
   Transcript. **Reviews** tab = "Leave feedback" box + Add Review. **Quick
   Actions**: Copy Share Link · Reassign Rep To · Download Audio · Copy
   Transcript · Re-analyze · Send to Slack. Tags.

9. **kendo-09-call-summary-analysis** — call detail → **Summary** tab: an
   AI-written **"Sales Call Analysis"** — Call Context · Strengths Observed ·
   Weaknesses Observed · Customer Response (bullets) · Overall Impression + "the
   next move is critical…". Reads like a coach's write-up.

## Takeaways for Freyr (what to borrow)

Freyr already has the voice side (6 ElevenLabs agents, real conversations,
`/voice/c/[id]` transcript pages). Kendo shows how to make it a real coaching
product:

- **Call detail = the crown jewel.** Adopt the **Scorecards "Review Audit"**
  pattern on the Freyr call/transcript page: score each call, break it into
  criteria sections with **pass/miss pill + score + the exact transcript-quote
  evidence + an AI narrative**. Freyr's regulatory-sales angle maps cleanly
  (discovery, objection handling, compliance framing, next-step commitment).
- **AI "Missed Opportunities"** with estimated deal impact — high-signal coaching
  cards ("you could have asked X").
- **Summary tab** = AI call write-up (context / strengths / weaknesses / next
  move) — we already have `transcript_summary`; expand it to this structure.
- **Overview dashboard shape**: hero area chart + KPI cards w/ WoW deltas +
  Live-Feed activity rail + a "reps/accounts needing attention" decision rail.
- **Visual vocabulary to steal (recolored to Freyr blue):** radar chart for
  skill/coverage, stat cards with mini sparklines, red-tinted at-risk rows,
  pass/miss pills, evidence quotes, left list-rail + right coach-rail layout.
- Keep it **BLUE**, not Kendo's orange. Light mode. Our existing SectionCard /
  chart components already cover most of this.

NOTE: these images are internal design references — **gitignored** (do not push
to the public repo; ~15MB). See [[freyr-sales-platform]].
