# Freyr Sales Intelligence — V5 Backlog

CEO 100/100 ✅ · V2 8/8 ✅ · V3 7/7 ✅ · V4 ✅. Continued enhancements by the
autonomous loop. ✅ = done, ☐ = todo. Honest — only mark what truly works.

## A. Account health scoring
1. ✅ Account health score — `lib/health.ts` (`accountHealth`) computes a 0-100 score + band (Healthy / Watch / At risk) from activity recency, last-touch sentiment, deal progression, and contact coverage, with a per-factor breakdown.
2. ✅ Health on the customers list — a Health column (table view) + a "Health (at-risk first)" sort, plus a reusable `HealthBadge`.
3. ✅ Health on the account detail — health band + score in the "At a glance" rail, with a factor tooltip.

4. ✅ Dashboard "Needs Attention" is now health-driven — real at-risk/watch accounts (worst-first) with health badges + top risk factor, replacing the static placeholder.
7. ✅ Customers list health-band filter — All / Healthy / Watch / At risk.

5. ✅ Account health trend — `accountHealthSeries` recomputes the score at weekly cutoffs from real interaction history; account detail now shows a rich health card (big score, band, sparkline, ±pts vs 4 wk, and a "Why" factor breakdown). Honest derivation, not fabricated.

## B. Future ideas (not yet started)
6. ☐ Onboarding wizard (first-run, multi-step) — deferred; overlaps the existing dashboard getting-started checklist, will reframe before building.
