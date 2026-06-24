# Freyr Sales Intelligence — V4 Backlog

CEO 100/100 ✅ · V2 8/8 ✅ · V3 7/7 ✅. Continued enhancements shipped by the
autonomous loop. ✅ = done, ☐ = todo. Honest — only mark what truly works.

## A. Notifications & alerts
1. ✅ Real, data-driven notifications — `lib/notifications.ts` derives alerts from live state (pitches awaiting compliance review, deals going cold, fresh buying signals, follow-ups due) via `/api/notifications`.
2. ✅ Notifications center `/notifications` — read/unread (localStorage), All/Unread filter, "Mark all read", per-type icons; nav entry added.
3. ✅ Live bell — top-bar bell now fetches real notifications, shows a numeric unread badge, lists the latest with read-on-click, and links to the center.

## B. Mobile & lists
5. ✅ Mobile polish on the 3-pane views — session detail rails (Intelligence + Engagement) hide under `lg` so the pitch workspace goes full-width; recordings progressively reveal list (`md`) and Call Coach (`lg`).
6. ✅ Bulk actions on the contacts list — Select mode with per-card checkboxes, a bulk bar (N selected · Export selected CSV · clear).

## C. Email channel & customers bulk
4. ✅ Email send channel behind a key — `lib/email.ts` (`sendEmail`) POSTs to Resend when `RESEND_API_KEY` is set, else mock-logs; `hasEmail()` in env; the send route delivers through it and returns the channel; Settings → Integrations lists the Email channel with real connect status.
7. ✅ Bulk actions on the customers list — Select mode adds a checkbox column (table view), with a bulk bar to **assign an owner** (real PATCH per account) and **export selected** CSV.

---
**V4 backlog complete.** Suite at 84 Playwright tests, all green.
