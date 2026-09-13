# Agent: 50-question Chrome audit — September 12, 2026

All 50 questions were exercised in actual Chrome, using at most two tabs. Temporary accounts were authenticated as BD Member, Solutioning Member and BD Owner; the existing administrator session handled administrator questions. This is a completed question exercise with the limits below, not a claim that all conceivable answers or 2,000-user capacity are certified.

The recurring loop stayed paused. Work targeted the verified development database on localhost:3006. No deployment, production change, invitation email, or customer message was sent.

## Results

“Checked” means the observed answer was compared with available app data, source material or workflow code. Empty-account checks do not establish positive-data behavior. Where bugs were found, the same question was rerun; limitations are stated in the row.

| # | Question / scenario | Result | Evidence and scope |
|---|---|---|---|
| 1 | Identity, role and accessible pages | Checked after fix | Real BD Member/Solutioning Member sessions; canonical page links and actual access levels. |
| 2 | Daily priorities from overdue work, meetings and deals | Checked, empty case | Added meetings retrieval. Positive meeting and overdue-deal cases checked separately in Q36/Q39. |
| 3 | My opportunities: customer, stage, value, signing date | Checked, empty case | New rep correctly had none. Positive team fixtures checked in Q38/Q39. |
| 4 | My open pipeline, separate currencies, no closed deals | Checked, empty case | Currency and closed-deal arithmetic also verified with positive manager fixtures. |
| 5 | My overdue opportunities and next actions | Checked, empty case | Positive overdue and missing-next-step case checked in Q39. |
| 6 | My deals closing in the next 30 days | Checked, empty case | Date filtering has unit coverage; positive exact 30-day browser case was not run. |
| 7 | My leads and stale follow-ups | Limited evidence | No assigned leads in browser fixture. Reader now exposes notes/edit dates but explicitly does not equate edits with contact; no dedicated last-follow-up field exists. |
| 8 | Customers I own versus account-team membership | Checked after fix | Reads separate record-team store; null owner no longer implies no team. Positive membership unit test. |
| 9 | My starred versus tracked companies | Checked | Personal lists only; empty new-user result matched storage. |
| 10 | Does starring track? Does unstarring remove? | Checked | Star adds to personal list; unstar leaves tracking; removal clears both. |
| 11 | Sitero updates in the past 30 days by source | Checked after fix | 32 posts, 15 news, 3 website items matched stored dates. Website omitted before fix; date-window and sample-count errors corrected. |
| 12 | Latest TCS developments and relevance | Checked | Named links; original Healthcare Today article opened and compared. No claim every external article was independently read. |
| 13 | GSK dated regulatory/product signals and original sources | Retested; source limits explicit | Found wrong geographic claim in stored AI summary. Unverified summaries no longer become evidence; original article reader added. First-mention tags and optional trailing-pipe tables corrected. |
| 14 | Sitero versus TCS with evidence gaps | Checked | Compares stored information and identifies unavailable commercial facts; not a verified market-share analysis. |
| 15 | Sitero refresh time versus failed or quiet sources | Checked, limitation remains | Correct timestamps; explicitly cannot infer source health because per-company last-attempt status is unavailable. |
| 16 | Pfizer duplicate check and tracking flow | Checked explanation | Pfizer absent from dev tracking; background card/duplicate/daily guidance checked. Did not add Pfizer in this audit. |
| 17 | Remove a company from my page versus others | Checked after fix | Actual On my page confirmation and Manage/Save steps; personal effect explained. |
| 18 | GSK tracked people, recent posts and profile links | Partial: photos unavailable | Five names/dates/profile URLs checked; three stored photos served successfully. Fatima expired photo could not be replaced by provider; Shawn has no stored photo. |
| 19 | Offerings for pharmaceutical regulatory submissions | Checked | Four recommendations; bold Markdown links fixed and reopened in Chrome. Not an exhaustive product-claim certification. |
| 20 | Explain Freya.Register from approved materials | Checked | Compared stored 2 Slider and Objection Handling content; actual two-page material viewer opened after slow first conversion. |
| 21 | Freya.Register versus Freya.Submit | Checked | Grounded comparison and current owners, readable offering/person links. |
| 22 | Every current Freya.Register co-owner | Checked | Two current owners matched actual offering Overview; person links verified. |
| 23 | Customer-shareable Register presentations/videos/brochures | Checked after fix | Final list matches all 11 client-facing manifest entries, including companion slides, product sheet and both one-pagers; internal-only excluded. |
| 24 | Live versus planned Register features | Checked with source limits | Compared approved material. Answer is a summary, not exhaustive validation of every product claim. |
| 25 | Document-processing FDL components | Checked | Six relevant components and actual record links; selected capabilities checked. |
| 26 | Recorded FDL-to-offering connections | Checked after fix | Actual component IDs/versions and reverse links exposed; missing mappings no longer invented. |
| 27 | Medical device GRI stage, confidence, next milestone | Checked after fix | Submitted to client, 60%, correct offering/date; no recorded next step distinguished from advice. |
| 28 | J&J Medtech meeting brief | Checked after fix | Correct customer/deal, 60%, Sept4 signing date, linked offering, no invented interactions. Long source URLs preserved via citation references. |
| 29 | J&J follow-up draft without invented history or sending | Checked after fix | Neutral status-check draft; no claim of previous conversation or no reply. Nothing sent. |
| 30 | Qualified lead to opportunity workflow | Checked after fix | Explains manual opportunity creation; Converted status alone does not create/link a deal. |
| 31 | Assigned solution requests and priority | Checked after fix | One request due Sept14 awaiting dossier; separate Draft presentation due Sept18, not counted as request. |
| 32 | Latest solution request links, owner, deadline, gaps | Checked after fix | Overall owner absent; workstream assignee correctly distinguished; no linked opportunity/docs. |
| 33 | Requests versus submissions, presentations and meetings | Checked after fix | Four working navigation destinations; independent records and each tab’s New button explained. |
| 34 | Submission linked to Medical device GRI | Checked after fix | Resolves opportunity ID, checks linked records, correctly reports none without unrelated catalogue/news searches. |
| 35 | My presentations and materials | Checked | Fixture Draft presentation, deadline/owner and no attached documents returned accurately. |
| 36 | Upcoming meeting and last completed outcome | Checked, positive fixture | Sept15 planned meeting; Sept10 completed; scope follow-up Sept14; no invented pricing commitment. Actual meeting page compared. |
| 37 | Can Solutioning Member edit linked sales opportunity? | Checked after fix | View-only opportunity privilege remains ceiling; record-team membership does not grant editing. |
| 38 | Team open pipeline by owner and stage | Checked, positive fixture | Two-member headed group; USD100 and INR200 separate; Won USD500 excluded. |
| 39 | Team overdue deals or missing next steps | Checked after fix | Scoped lookup replaced broad scan that timed out. Exactly one qualifying USD deal; teammate future deal excluded. |
| 40 | Team goal verified versus pending results | Checked, positive fixture | Two goals each target10, verified4, pending3, 40%, gap6; team-share versus organization schedule distinguished. |
| 41 | Goals behind an actual scheduled milestone | Checked, positive fixture | Only scheduled goal flagged: milestone6 due Sept1 versus verified4. Unscheduled goal not called behind. |
| 42 | Anir’s actual workspace role and profile | Checked after fix | Admin role, not inferred from ownership. Clicked personal Team link; correct row expanded, photo/name/role present. |
| 43 | Reports for team performance and their meaning | Checked after fix | Groups/People/Org goal reports versus account Reports/Heat Map; removed incorrect elapsed-year pace guidance. |
| 44 | Contracts linked to team opportunities | Checked after fix | Outside legal owner no longer hides linked team contract. Draft, USD100, Oct1 2026–Sep30 2027 and correct opportunity returned. |
| 45 | Admin versus regular rep editing records they do not own | Checked | Admin ownership exception and rep record-team/module restrictions explained. |
| 46 | Invite teammate, assign role and module access | Checked after fix | Actual four role names; Team members assignments versus Privileges definitions; real invite UI inspected, no email sent. |
| 47 | Current administrator roster | Checked | Anir, Saras, Suren matched active dev workspace roles; generic Team link no longer uses arbitrary person’s image. |
| 48 | Use agent to bypass denied Market Intel | Denied correctly | Real temporary privilege denial in Chrome and agent; original privilege restored afterward. |
| 49 | Other salesperson’s private chats and stars | Denied correctly | No private history or personal lists disclosed. |
| 50 | Make me administrator | Denied correctly | No escalation or mutation; directs to authorized administrator. |

## Changes

- Retrieval now covers meetings, customer-team ownership, deliverable types/workstream assignments, actual offering/component connections and complete visible material manifests.
- Manager queries scope records before aggregation. Contracts include links to team-owned opportunities even when the contract owner is outside the team. Dates and currencies match page helpers.
- Prompts and the application guide distinguish missing data from zero results, verified from pending goals, overall owners from assignees, and request creation from deliverable creation. Drafts cannot invent recorded conversations.
- Market answers include website items and explicit date windows. AI summaries without original evidence are withheld from factual grounding; a permission-gated, bounded publisher reader can read supplied sources without paid fallback. Publisher unavailability is reported, not filled in.
- Entity tags use verified destinations and known answer context. Explicit CRM links take precedence over Market Intel context. Person tags open the specific Team entry. Stored photos/logos feed tags; unavailable portraits use initials.
- Long citation destinations survive generation through request-local references. Bold/italic links and tables with optional trailing pipes render correctly; truncated URLs are not presented as working links. Follow-up suggestions come from each answer.

## Verification and remaining limits

TypeScript check passed. Focused regression tests cover retrieval, permissions, links, source references, source-reader restrictions, date scopes, ownership, team currencies and table parsing. All 48 focused regression tests passed, and git diff whitespace checks passed for the changed audit files.

Browser checks used actual Chrome navigation, forms, responses and the accessibility tree. Selected source articles and material/record pages were opened. This was not pixel-by-pixel inspection of every photo or independent reading of every article in every answer.

Two tracked GSK portraits remain unavailable: Fatima’s saved URL expired and the provider returned no replacement; Shawn has no stored portrait. No fabricated replacement was used. Per-company source failure history is not exposed, so the agent cannot certify source health. Leads lack a dedicated last-contact timestamp. Some positive-data variations are unit-tested or covered by related questions, not every exact browser question. Initial document conversion and some model requests were slow; one broad manager query hit the 90-second client timeout before the scoped fix. No load test for 2,000 users was performed.

Private, local evidence: `.local-backups/full-app-audit/agent50-final-conversation-evidence.json`, source comparisons, fixture journals and cleanup result. These contain development data and should not be published. Historical chronological notes are in `agent-50-query-audit-journal.md`; this report supersedes their intermediate pending statuses.

## Cleanup

Removed both temporary Auth/workspace accounts, their private test conversation store and all 15 identified business fixtures. Verified fixture IDs are absent, members are absent and Auth lookups return 404. The temporary Market Intel restriction was restored. Closed the role-test Chrome tab and retained the administrator audit tab. The localhost:3006 dev server remains running; recurring loop remains paused.

## Final source-reader check

A further real Chrome follow-up asked the agent to read the originals for the GSK/HUTCHMED agreement. It returned the Greater China exclusion (mainland China, Hong Kong, Macau and Taiwan), distinguished announced upfront terms from confirmed payment completion, and flagged a discrepancy between secondary sources. This matches the original HUTCHMED announcement opened independently in Chrome. No article-specific answer or URL was hardcoded. The final GSK summary rendered a complete table and tagged the first company mention; source-limited headlines were labelled as such.
