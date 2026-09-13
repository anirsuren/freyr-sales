# Company tracking source audit — September 11, 2026

## Result and limits

The shared collector was exercised with Sitero, Veranex and Rimsys using their
names and official websites. No expected article URL was passed into discovery.
This is an audit against independently collected reference sets, not proof that
every article on the internet or every LinkedIn activity is available.

| Company | Official website references matched | Publisher references matched | LinkedIn activities collected |
| --- | --- | --- | --- |
| Sitero | 6 / 6 | 5 / 6 | 73 |
| Veranex | 18 / 18 | 1 / 1 | 45 |
| Rimsys | 2 / 2 | 5 / 5 | 25 |

**Known miss:** Sitero's Business Times Journal syndication copy was verified
manually but not found by automatic discovery. Google News, raw Perplexity search
and a separate Google web-search diagnostic did not reproduce that URL. It was
not inserted into the collector, and the company must not be described as having
proven complete coverage. The earlier manual Sitero feed repair remains distinct
from these automatic fresh-add results.

## How the checks were performed

- Used the existing app tab and one reusable Chrome research tab. Independently
  searched Google and read official archives, publication dates and publisher
  article bodies. All listed Rimsys and Veranex publisher references were opened.
- Read LinkedIn feeds visually, including Rimsys's captionless posts. Compared
  the scraper's activity inventory and date window. Not every activity was
  individually opened; the LinkedIn numbers above are collected counts, not a
  claim that all were independently hand-verified.
- Executed the actual `addCompanyByLink` flow with company persistence isolated
  in memory, so repeated tests did not create duplicate user companies. Used
  real discovery services and the development search cache/spend ledger.
- Captured a live LinkedIn provider response for each company and reused that
  response on regression replays to avoid paying repeatedly for the same scrape.
- Kept manually expected URLs in ignored audit artifacts only. Diagnostic reads
  of missing articles were comparison checks, not inputs to fresh-add discovery.

## Shared fixes

1. Initial discovery combines broad company searches, industry identity, actual
   official headlines and additional publisher searches. A narrower industry
   query no longer replaces the broad name query.
2. Official-site discovery follows real archive pagination and article links.
   Nearby dates avoid fetching old archives unnecessarily. Veranex's 18 current
   items were collected with 34 page reads. Crawl limits remain bounded.
3. Visible publication bylines take precedence over misleading CMS migration
   dates. Generic event dates cannot become article publication dates.
4. Article extraction reads the article body rather than unrelated appended
   stories or navigation. Actual body evidence replaces misleading snippets.
5. News eligibility is verified separately from sales-signal classification.
   Unanswered verification stays pending for retry rather than being accepted
   through a keyword fallback.
6. Resolved article URLs replace publisher homepages for verification and links.
   This prevents valid articles being classified as publisher indexes.
7. LinkedIn collection retains captionless media posts and full-page pagination;
   real repost activities retain their own identity. No captions are invented.
8. Separate publishers remain separate source URLs even when headlines match.
9. Raw search requests use the shared cache, budget cap and spend ledger.

## Validation

35 focused Node tests passed and `npm run typecheck` passed. Tests cover archive
pagination, dates, related-story false matches, news verification failures,
article links, captionless posts, duplicate checks and durable onboarding.
`git diff --check` passed. No production writes or deployment were performed.

Audit scripts, captured provider responses and URL comparisons are under
`.local-backups/{sitero,veranex,rimsys}-audit/` and are ignored by Git.
