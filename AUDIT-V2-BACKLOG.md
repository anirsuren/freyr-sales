# Freyr Sales Intelligence — V2 Backlog (post-100 enhancements)

The original CEO 100-item audit (`AUDIT-100-CEO.md`) is 100/100 ✅. This file
tracks genuinely valuable enhancements beyond that scope, shipped by the
autonomous loop. ✅ = done, ☐ = todo. Honest — only mark what truly works.

## A. Activity, tasks & discoverability
1. ✅ Global Activity feed (`/activity`) — unified interaction timeline across all accounts, filterable by outcome + search, links to records; "Recent Activity → View all" now points here; nav entry added.
2. ✅ Keyboard-shortcuts help modal — press `?` anywhere to see ⌘K + navigation shortcuts.
3. ✅ Tasks / follow-ups surface — `/tasks` inbox: pitches awaiting compliance review + upcoming follow-ups (from interaction follow_up_date), with empty state; nav entry added.
4. ✅ Saved views / filters — pipeline "Views" dropdown: built-in presets (All / My / Large / Mid-market) + "Save current view" (captures search + size + Team/My toggle, persisted to localStorage).

## B. Strategic gaps (from the original CEO report)
5. ✅ CRM two-way sync surface — Settings → Integrations "CRM sync — HubSpot" card: connection status, last-synced time, mirrored record counts (companies/contacts/deals), working "Sync now".
6. ✅ Send / sequence execution loop — `/sequences` cadence library (3 multi-touch templates with day/channel step timelines) + live enrollment view (engaged/qualified accounts mapped to their current step with progress bars); nav entry added.
7. ✅ Compliance approval workflow — pitch review status (draft → in_review → approved / changes_requested) with reviewer + timestamp via `/api/sessions/[id]/review`, status badge + Submit/Approve/Request-changes in the pitch header, and **Send to CRM is gated on approval**. Fits Freyr's regulatory domain.
8. ✅ Roles / SSO / team permissions — Settings → Access tab: role switcher (Admin/Manager/Rep, persisted), role-permissions matrix, SSO provider connect + Enforce-SSO + Require-2FA toggles; enforcement live (Rep can't invite; non-admin can't switch plan).

---
**V2 backlog 8/8 complete.** Suite at 73 Playwright tests, all green.
