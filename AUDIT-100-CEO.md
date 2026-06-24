# Freyr Sales Intelligence — CEO Walkthrough: 100 Action Items

I sat down and used the product like one of my reps. Here are the 100 things I'd send back to the team, grouped by area. Items marked ✅ are shipped in this pass; ☐ are queued.

## A. Call Recordings & AI Call Coach (my biggest focus)
1. ✅ The player progress bar isn't clickable — let me click anywhere on it to seek.
2. ✅ Let me drag the playhead to scrub through the call.
3. ✅ Add skip-back 10s / skip-forward 10s buttons.
4. ✅ Add a playback speed control (1x / 1.25x / 1.5x / 2x).
5. ✅ Add a full transcript, time-stamped, in the call view.
6. ✅ Make each transcript line clickable to jump the audio to that moment (time-locking).
7. ✅ Highlight the transcript line that's currently playing and auto-scroll to it.
8. ✅ Show who's speaking (Rep vs Prospect) in the transcript.
9. ✅ Let me search within the transcript.
10. ✅ Key Moments should be clickable and jump the audio to that timestamp.
11. ✅ Add a Transcript tab alongside Summary / Key Moments / Quality.
12. ✅ Download the recording and Share buttons on the call.
13. ✅ Sort the recordings list (by score, date, duration) and filter by rep/outcome.
14. ✅ Flagged-call indicator on low-scoring calls in the list.
15. ✅ Let me leave comments pinned to a timestamp for coaching (Comments tab, pin-at-playhead, click to seek, persisted).
16. ✅ "Upload a recording" / connect a dialer so calls land here automatically (Add-recording modal: file upload + Aircall/RingCentral/Dialpad).
17. ✅ Talk-to-listen ratio meter visualized on the timeline (rep vs prospect bands + Rep/Prospect % from the transcript).

## B. Dashboard & Analytics
18. ✅ Add a date-range selector so I can scope the whole dashboard (7D/30D/90D/All, server-scoped via ?range).
19. ✅ KPI cards should be clickable and drill into the underlying list.
20. ✅ "Export" on the dashboard should actually download a CSV.
21. ✅ Let me customize which KPIs show (Customize popover, per-metric toggle, persisted to localStorage).
22. ✅ Add a goal/quota line on the pipeline chart (dashed quota line + label + legend).
23. ✅ "Needs Attention" items should link to the actual record.
24. ✅ "View all" on Recent Activity should go somewhere.
25. ✅ Forecast (weighted pipeline) card with commit vs best-case.
26. ✅ Period-over-period comparison toggle (real prior-window deltas per KPI, toggle on/off).
27. ✅ Team vs individual view switch (pipeline Team / My-deals toggle; deals carry an owner, shown on cards).
28. ✅ Email me a weekly digest of this dashboard (preview modal + Monday-8am subscription + send via configured channel /api/digest).

## C. Pipeline
29. ✅ Click a deal card to open a deal detail (not just the session).
30. ✅ Filter the board (by stage owner, size, value).
31. ✅ Search the board.
32. ✅ Show weighted (probability-adjusted) value per column.
33. ✅ Add a deal manually from the board (modal: company/contact/value/size/stage → board-local card).
34. ✅ Inline-edit deal value (click value → edit in place, Enter/✓ to commit).
35. ✅ Persisted column order / WIP limits (per-column WIP limit + over-limit highlight; ◀▶ reorder, both persisted to localStorage).
36. ✅ Empty columns should read cleaner, with a subtle add affordance.
37. ✅ "Rotting" indicator for deals with no activity in N days.
38. ✅ Bulk move / multi-select cards (Select mode → checkboxes → bulk "Move to stage").

## D. Sessions & Session Detail (pitch workspace)
39. ✅ Regenerate works per-tab (calls the regenerate endpoint; live with ANTHROPIC key).
40. ✅ A tone selector that actually changes the framing label.
41. ✅ Save edits to the pitch (persists via PATCH /api/sessions/[id]/pitch).
42. ✅ "Send to CRM" / "Push to sequence" action (HubSpot/Salesforce/sequence menu; logs an interaction).
43. ✅ Version history of generated pitches (snapshots on regenerate + save; History modal with restore).
44. ✅ Word/character count + reading-time on each pitch.
45. ✅ Add an "Objection handling" and "Account brief" tab.
46. ✅ Export pitch (downloads the active format as .txt; email/PDF variants pending).
47. ✅ Sessions list: sortable columns + search.
48. ✅ Sessions list: filter by outcome + CSV export (pagination pending).
49. ✅ Duplicate a session for a similar prospect (copies pitch + services into a fresh session, navigates to it).
50. ✅ Show the KB version a pitch was generated against.

## E. Customers & Customer Detail
51. ✅ Customers list: table/grid toggle.
52. ✅ Customers list: sortable columns + Opportunity/size signal column.
53. ✅ CSV export on customers (bulk actions pending).
54. ✅ Pagination + total count on customers (8/page, "showing X–Y of N", Prev/Next).
55. ✅ Assign an owner per account (owner select on the account rail, persists via PATCH).
56. ✅ Deliverables buttons should give real feedback (progress, then "ready").
57. ✅ "Re-enrich" should show what changed (diff modal: field before→after + new signals).
58. ✅ Multiple deals per account (Deals tab: session-derived deals + manually-added deals, persisted via PATCH).
59. ✅ Competitor/incumbent field on the account (inline edit, persists via PATCH).
60. ✅ Notes & attachments on the account (Notes tab: note composer + link attachments, persisted).

## F. Contacts
61. ✅ Contacts list: search + role filter.
62. ✅ Contacts list: sortable + CSV export, with company.
63. ✅ Contact detail: buying-style/persona (DISC-like) read with how-to-engage.
64. ✅ Contact detail: email + dial + LinkedIn quick actions.
65. ✅ Multi-thread map (other contacts at the account).
66. ✅ Last-contacted + next-step on the contact.

## G. New Session / Intake
67. ✅ Validate the LinkedIn URL format before submit.
68. ✅ Validate email format with inline error.
69. ✅ Auto-detect company from website / contact from LinkedIn paste (domain→company, slug→name, edit-to-override).
70. ✅ Disable submit until required fields are valid; show why.
71. ✅ Recent / saved prospects to start from (rail card, persisted on submit, click to prefill).
72. ✅ Loading screen: make it feel like an analyst working (live step detail).
73. ✅ Bulk intake (paste a list) (parse Company/Contact/Email/LinkedIn lines → preview count → queue).

## H. Knowledge Base / Service Catalog
74. ✅ Service Catalog: searchable + shows who each is for (roles/industries).
75. ✅ Edit a service definition (inline, persists to the KB).
76. ✅ KB: crawled-pages list on Admin (last-crawl diff pending).
77. ✅ KB: status badge + "stale" warning is clear and actionable.
78. ✅ KB: manual add of a service/talk-track (Service Catalog "Add service").

## I. Settings / Team / Account
79. ✅ Team management (invite + roles: rep/manager/admin).
80. ✅ Notification preferences (per-event toggles, persisted).
81. ✅ Billing / plan section (Settings → Billing: plan switcher, usage meters, invoices).
82. ✅ Integration health: clearer connect CTAs per service.
83. ✅ API key management UI (masked status; keys stay server-side, not exposed).
84. ✅ Profile edit (name, title, email, signature; persisted locally).
85. ✅ Dark mode toggle (top-bar Sun/Moon; `.dark` re-skins surfaces/text/borders via CSS, persisted, no-flash on load; blue chrome preserved).

## J. Global shell, search, nav, system
86. ✅ Command palette (⌘K) should search records, not just nav — and it does; add keyboard hint in the bar.
87. ✅ Top-bar search should open the palette / actually search.
88. ✅ Notifications bell should open a real panel.
89. ✅ Breadcrumbs reflect the true page hierarchy.
90. ✅ Global "New" menu (session / customer / contact) in the top bar.
91. ✅ Active nav state correct on every deep route.
92. ✅ Persist sidebar collapsed/expanded (collapse toggle → icons-only 72px rail, persisted to localStorage).
93. ✅ Consistent toasts on every create/save/destructive action.
94. ✅ Confirm modal on destructive actions (reusable Modal + delete-service flow).

## K. Cross-cutting: aesthetics, a11y, performance, technical
95. ✅ More color/visual richness (charts, signal bars, colored stat accents) — in brand blue.
96. ✅ Skeleton loaders on every async route (loading.tsx).
97. ✅ Focus rings + keyboard operability on all controls.
98. ✅ Full WCAG pass (skip-to-content link + main landmark, ARIA tab roles on custom tab widgets, role=img + summaries on charts, AA contrast bump on tertiary text, audited icon-button labels).
99. ✅ Per-route page titles + metadata (title template, description, favicon).
100. ✅ No console errors; tests green on every page.
