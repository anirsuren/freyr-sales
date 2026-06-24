# Freyr Sales Intelligence — V3 Backlog (execution depth)

CEO 100-item audit = 100/100 ✅. V2 backlog = 8/8 ✅. This file tracks the next
wave of genuinely valuable enhancements shipped by the autonomous loop.
✅ = done, ☐ = todo. Honest — only mark what truly works.

## A. Outbound email send loop (completes approval → CRM → sequence → send)
1. ✅ Compose & send the actual email from the pitch — prefilled from the approved subject/body, gated on compliance approval, logs a "Email sent" interaction (shows on Activity + timeline).
2. ✅ Email templates / snippets — pick a reusable template in the composer to drop in subject + body.
3. ✅ Schedule send — send now or schedule for a chosen date/time.

## B. Reporting & onboarding
4. ✅ Printable / exportable account report — chrome-free `/customers/[id]/report` (brief + facts + contacts + deals + recommended services + activity) with a Print / Save-as-PDF toolbar; "Report" button on the account header.
5. ✅ Dashboard onboarding / getting-started checklist — dismissible widget with checkable steps + progress bar, persisted to localStorage.

## C. Analytics & responsive
6. ✅ Per-rep analytics drill-down with date range — analytics leaderboard is now data-driven (grouped by deal owner); click a rep to drill into their stats + deals-by-stage; 7D/30D/90D/All range scopes via `?range=`.
7. ✅ Responsive / mobile pass — sidebar becomes an off-canvas drawer under `lg` with a top-bar hamburger + backdrop (closes on navigation); desktop layout unchanged.

---
**V3 backlog 7/7 complete.** Suite at 78 Playwright tests, all green.
