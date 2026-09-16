# Mock / Real presentation parity — September 15, 2026

## Implemented

Market Intel no longer has separate list and company-detail implementations for
Mock mode. Both consume the same feed schema and render the same dashboard,
briefing, tabs, search, filters, sorting, tracking and management controls.
Competitor URLs now select competitors in Mock mode as well. Sample bookmarks
initialize once and subsequent user changes persist. Sample story deletions
persist as mock-only tombstones. Sample refresh/tracking never starts paid jobs.

The route/component pass also corrected these mode differences:

- Release navigation uses the deployment flag equally in both modes.
- Customer Targets is removed in both modes.
- Offering commercial panels and competition controls are present in both modes.
- Opportunity, Activity Master and competition edits persist to separate mock rows.
- Performance and exchange-rate controls follow permissions rather than mode.
- Redundant inline Mock labels were removed from email, leads, contracts and accruals.
- Analytics, Forecast and Recordings preserve their workspace layouts when Real
  data is empty. Real forecasts cannot fall back to invented rep pipelines.

## Deliberate data and service boundaries

Mock uses sample records and isolated persistence. Real uses its configured data.
Role checks still apply. Email sending in Mock remains simulated. Recording
storage/transcription and dialer integration are not connected; Real mode states
that honestly rather than pretending an upload or import succeeded.

The shared Real dev/production Market Intel configuration is prepared separately
in `shared-market-intel.md` and has not been activated.

## Verification and limits

Inspected route and component mode branches across the application. Automated
isolated tests exercise sample customer/competitor feed builders, moderation,
route parity and shared-database selection. TypeScript compilation and diff
whitespace checks pass. No browser walkthrough was performed, so this is not a
claim that every screen and interaction has been visually verified. No provider
calls, production writes, or deployments were performed.

The previously reported LinkedIn stale-person feeds and duplicate stored posts
remain a separate unresolved collection audit; these UI changes do not fix them.
