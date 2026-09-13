# Market Intel handoff — September 11, 2026

Implemented locally on localhost:3006, on top of the existing Claude changes. No deployment or push performed.

## Completed

- Manage customers and competitors use dedicated pages. Track a company remains a popup.
- Manage selections are drafts until Save; Discard and a navigation warning protect unsaved changes. No select-all. Saved copy reports “Now tracking N companies.”
- Saves merge only changed companies into the latest account list, preserving other divisions, hidden results, and concurrent edits. Failed saves retain the draft.
- Active status and team tracking counts are hidden from non-admins.
- Collection intervals and refresh copy use 24 hours. Connections is absent from the refresh popup.
- Posts, news, from them, and signals stay in one horizontally scrollable line.
- Company logos and LinkedIn profile photos are mirrored to app-owned storage. New company ingestion and daily person refresh populate missing images.
- Avatar handles image failures that occur before hydration, showing initials for expired images. A final page reload showed zero broken image elements.
- Registry reads bypass Next's fetch cache so freshly saved logos and selections appear correctly.
- Pfizer website and LinkedIn inputs validated in the popup with Medicinal Products selected. Submission was enabled; Pfizer was **not added**.

## Image audit

The final read-only audit found 193 tracked companies: 189 had accessible logos, including all 34 customers. Four competitor identities still need an official website or full company name: **Integras, Cure Media, Lavida Consultancy, FDS Basics**. Do not attach a similarly named company's logo without confirming identity.

Of 133 tracked people, 90 have stored photos. The remaining 43 profiles did not return a usable image during backfill; the daily refresh path retries missing photos. Do not report these as completed.

Backfill snapshots and reports are kept in the ignored `.local-backups` folder; helper scripts are under ignored `scripts/qa`. The real database was used for authorized image enrichment. No test companies were created and the user's 34 customer / 159 competitor selections were preserved.

## Verification

- TypeScript check and five isolated tests cover selection merging, concurrent save retries, failure behavior, LinkedIn URL validation, and daily cadence.
- Browser inspection covered the non-admin dashboard, full Manage page, draft/Discard/navigation warning, refresh popup, company images, and Pfizer form validation without submission.
- The production-backed Playwright suite was not run; see AGENTS.md §1.

Key files: `components/market-intel/ManageCompaniesButton.tsx`, `lib/marketIntelBookmarks.ts`, `lib/marketIntelBookmarkChanges.ts`, `lib/companyLogos.ts`, `lib/marketIntelRefresh.ts`, `lib/miPhotos.ts`, `lib/marketIntelCadence.ts`, and `lib/marketIntelLinks.ts`.

### Sitero repair (Sep 11 evening)
- Confirmed `sitero` was added by Anir at 20:52 UTC (4:52 PM EDT). It had no LinkedIn company URL; the original 26 news results mixed clinical coverage with homonyms, shopping listings, jobs and company directories.
- Saved verified `linkedin.com/company/siterollc` in the development tracking row with a conditional write. One targeted collection returned 19 company posts.
- News classification now distinguishes company identity/editorial validity from industry relevance; explicitly rejected matches are removed before digest/card aggregation. Added job/directory screening and applied the same filter to paid-search results.
- Retained two clinical-AI news articles and restored the six official website updates after the targeted retry returned an empty site result. Targeted refresh now merges existing website items/posts rather than replacing them with an empty retry. Rebuilt Sitero's summary without polluted employment/directory claims.
- Before/after data and browser verification artifacts: `.local-backups/sitero-review/`. No other company data changed by this repair. No all-news/all-posts coverage guarantee; these are the collected results.
