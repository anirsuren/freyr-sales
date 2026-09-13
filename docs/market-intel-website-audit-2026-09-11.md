# Website-only tracking and spending audit — September 11, 2026

Implemented locally on localhost:3006. Not deployed. No real test companies were added; Pfizer remains absent and the catalogue remains at 193 companies.

## Results

The only supplied company input was its website. The same identity, news, and official-site collection functions used by Track a company were exercised. These are bounded search/crawl results, not a claim to have retrieved every article on the internet. A zero in the recent-news column can be correct (Rimsys had no verified news in the recent window).

| Website | Resolved company | Outside news (90-day search) | Recent news (3-day search) | Official updates |
|---|---|---:|---:|---:|
| pfizer.com | Pfizer | 55 | 38 | 12 |
| gsk.com | GSK | 42 | 37 | 8 |
| novartis.com | Novartis | 69 | 59 | 10 |
| merck.com | Merck | 57 | 28 | 11 |
| lilly.com | Eli Lilly | 57 | 29 | 7 |
| roche.com | Roche | 36 | 36 | 9 |
| astrazeneca.com | AstraZeneca | 62 | 47 | 4 |
| rimsys.io | Rimsys | 1 | 0 | 4 |
| iqvia.com | IQVIA | 22 | 34 | 2 |
| bayer.com | Bayer | 50 | 48 | 5 |

## Browser checks

Chrome was used to inspect all ten homepages/news entry points and to open one actual collected article per company. The article pages matched the returned subject/headline. Some publisher page titles and search-result titles are abbreviated; they are preserved rather than replaced with invented titles. Dates come from publisher metadata, published feeds, or a cited search-result date. Missing dates remain unknown.

- **Pfizer** — [Inside Pfizer’s Fight Against Counterfeit Medicine](https://www.pfizer.com/news/articles/inside_pfizer_s_fight_against_counterfeit_medicine) (2026-09-08T14:37:31.000Z).
- **GSK** — [GSK’s Shingrix (Recombinant Zoster Vaccine) prefilled syringe presentation approved in Japan](https://www.gsk.com/en-gb/media/press-releases/gsk-s-shingrix-recombinant-zoster-vaccine-prefilled-syringe-presentation-approved-in-japan/) (2026-09-10T07:00:55.000Z).
- **Novartis** — [Novartis provides update on delpacibart etedesiran (del-desiran) Phase III HARBOR study for the treatment of myotonic dystrophy type 1 (DM1)](https://www.novartis.com/news/media-releases/novartis-provides-update-delpacibart-etedesiran-del-desiran-phase-iii-harbor-study-treatment-myotonic-dystrophy-type-1-dm1) (2026-09-08T05:00:00.000Z).
- **Merck** — [Merck to Participate in the Morgan Stanley 24th Annual Global Healthcare Conference](https://www.merck.com/news/merck-to-participate-in-the-morgan-stanley-24th-annual-global-healthcare-conference/) (2026-09-08T10:45:00.000Z).
- **Eli Lilly** — [FDA approves Lilly's Mounjaro (tirzepatide) to reduce ...](https://investor.lilly.com/news-releases/news-release-details/fda-approves-lillys-mounjaro-tirzepatide-reduce-cardiovascular) (2026-08-28T00:00:00.000Z).
- **Roche** — [Ad hoc announcement pursuant to Art. 53 LR Roche’s strong momentum continues in the first half of 2026, delivering +6% sales growth at constant exchange rates; -2% in CHF due to the significant a...](https://www.roche.com/investors/updates/inv-update-2026-07-23) (2026-07-23T08:00:00.000Z).
- **AstraZeneca** — [Tozorakimab demonstrated statistically significant and highly clinically meaningful reduction in COPD exacerbations in OBERON and TITANIA Phase III trials](https://www.astrazeneca.com/media-centre/press-releases/2026/tozorakimab-demonstrated-statistically-significant-highly-clinically-meaningful-reduction-copd-exacerbations-oberon-titania-phase-iii-trials.html) (2026-09-08T00:00:00.000Z).
- **Rimsys** — [Rimsys Announces AI-Native Market Access for Regulated Products](https://www.rimsys.io/blogs/rimsys-announces-ai-native-market-access-for-regulated-products) (2026-09-01T01:57:05.186Z).
- **IQVIA** — [IQVIA Announces Pricing of Senior Notes - Investor Relations](https://ir.iqvia.com/press-releases/press-release-details/2026/IQVIA-Announces-Pricing-of-Senior-Notes-d2252cc96/default.aspx) (2026-09-09T00:00:00.000Z).
- **Bayer** — [Bayer and Neste close commercial agreement to jointly scale newgold® winter canola for biofuels production](https://www.bayer.com/media/en-us/bayer-and-neste-close-commercial-agreement-to-jointly-scale-newgold-winter-canola-for-biofuels-production/) (2026-09-09T12:00:01.000Z).

## Flow and collection changes

- Duplicate website and LinkedIn checks run before submission. Start tracking stays disabled during validation and for existing companies. The server repeats the check and rejects duplicates. Use Manage to select an existing company.
- A new company requires a division. Website-only company identity is read from published page metadata, then supported indexed publisher evidence; unresolved identities fail rather than becoming guessed companies.
- Free Google News feeds are queried using the resolved company and, where available, its legal identity. Merck & Co. is disambiguated using its own Organization metadata. Social posts, job listings, unrelated names, obvious directory/status pages, duplicate headlines, and stale recent results are filtered.
- Official updates are discovered from actual links, newsroom pages, RSS/Atom feeds and sitemaps. Article titles and publication dates come from source metadata. Sparse or unreadable sites use Perplexity as a fallback. The browser-scraper experiment required broad account permissions and was removed; no such permissions were granted.
- News sources are collected before creating the new company. Complete source outages return an error without adding it. Partial failures are shown as warnings.
- Creation uses a conditional write to preserve concurrent catalogue changes. A duplicate found during saving is rejected.
- Ordinary and separate website refresh jobs now share an atomic database lock. Perplexity results are cached for 24 hours across app instances, and every new paid request reserves budget before contacting the provider.

## Spending findings

Observed directly in the Perplexity API billing console for the auctal project:

- Last 24 hours: **$3.64**, comprising **670 requests / $3.35** plus **$0.29** of tokens.
- Last seven days: **$20.55**, comprising **3,801 requests / $19.01** plus **$1.54** of tokens.
- Last 30 days: **$44.99** and **8,408 requests**.
- Credit balance when inspected after the top-up: **$9.75**. Auto-refill was disabled and was not changed.

The prior app made a paid latest-news request per company (193), a paid website request per website (184 currently), and ten research-firm requests. It had no Perplexity-specific cap or historical per-purpose ledger. A separate website runner lacked a shared lock. These are demonstrated spending mechanisms; the prior combined app total cannot retrospectively attribute every billed request to a particular job or agent.

The corrected local code defaults to **$1 per UTC day** for new paid fallbacks, overridable with `market-intel:config.perplexityDailyLimitUsd` or `MARKET_INTEL_PERPLEXITY_DAILY_LIMIT_USD`. The cap is enforced using shared reservations and actual billed cost, not a counter after spending. Unknown timeout costs retain reservations. It applies to the updated code; older deployed versions and other clients using the key do not inherit it until updated.

Successful paid audit requests recorded after the new ledger was introduced totaled **$0.03313**. Earlier failed 401 attempts returned no billed-cost response. Initial Google News actor probes used the separate Apify service; do not attribute those to Perplexity.

## Verification and limits

- Twelve isolated tests passed: selection persistence, concurrent updates, URL and duplicate validation, website-only creation with fake storage, date/title grounding, news filtering, request caching, and budget enforcement.
- TypeScript, focused lint, and whitespace checks passed. A client/server import error introduced during the work was fixed by extracting the research-firm constants into a browser-safe module; the live Manage page subsequently compiled and returned HTTP 200.
- Chrome confirmed the duplicate error and disabled Start tracking. No production-backed Playwright suite was run.
- Collection is bounded (24 candidate article pages, selected section/sitemap pages, provider result limits). Dynamic sites, indexing delays, unavailable providers, inaccessible pages, legal-name ambiguity, and sparse news prevent any honest promise of 100% exhaustive coverage forever.
- Machine-readable test outputs and the cost ledger snapshot are in ignored `.local-backups/website-news-audit/`.
