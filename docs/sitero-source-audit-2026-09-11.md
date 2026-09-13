# Sitero source audit — September 11, 2026

Status: saved Sitero repaired and verified in localhost. Fresh-add LinkedIn and website coverage passed the reference comparison. Automatic discovery of every independently found news publication did **not** pass; do not describe it as 100% complete.

## What ran

- Actual `addCompanyByLink` with name `Sitero` and website `https://sitero.com`; no LinkedIn input. Real source providers, isolated company persistence so the user's existing company was not deleted or duplicated.
- One live first page of 100 LinkedIn results. Later iterations replayed that captured provider response to avoid repeated scraper charges; search/classification calls were still real or served by the application's search cache.
- Google general and News results inspected in Chrome. Official website and LinkedIn posts inspected in Chrome. LinkedIn was sorted Recent and expanded beyond the 90-day boundary.
- 50 in-window post IDs visibly present in LinkedIn matched the fresh collector: 50/50. The provider returned 73 in-window activities including reposts. This is not a claim that every one of those 73 activities was individually opened.
- Official WordPress publication inventory independently returned 6 dated posts; all 6 matched collection.
- Every external article listed below was opened and read in Chrome, reusing one source tab after the user's two-tab limit.

## Saved result

73 company posts, 6 news URLs, 6 official website updates. Counts, logo load, article links and the regenerated briefing were verified in the actual localhost page. Six news URLs represent two story groups, with the other publisher links now accessible in table view.

| Publication | Verified article | Publication date |
|---|---|---|
| Scientist Live | [Clinical AI workflows](https://www.scientistlive.com/sitero-extends-a-clinical-ai-agent-across-full-clinical-data-lifecycle/) | Aug 20, 2026 |
| Yahoo Finance | [Ash announcement](https://finance.yahoo.com/technology/ai/articles/sitero-extends-ash-clinical-ai-120800332.html) | Aug 18, 2026 |
| PR Newswire | [Original Ash release](https://www.prnewswire.com/news-releases/sitero-extends-ash-a-clinical-ai-agent-across-the-full-clinical-data-lifecycle-302853590.html) | Aug 18, 2026 |
| EIN Presswire | [Ash release](https://www.einpresswire.com/article/935080207/sitero-extends-ash-a-clinical-ai-agent-across-the-full-clinical-data-lifecycle) | Aug 18, 2026 |
| Business Times Journal | [Syndicated AI-written coverage](https://www.businesstimesjournal.com/agp-article/935080966-sitero-expands-ash-clinical-ai-across-the-full-trial-data-lifecycle) | Aug 18, 2026 |
| PR Newswire / Xtalks | [Webinar featuring Sitero](https://www.prnewswire.com/news-releases/reduce-live-study-risk-with-ai-in-eclinical-workflows-upcoming-webinar-hosted-by-xtalks-302844005.html) | Aug 6, 2026 |

Historical repair: these six URLs were explicitly backfilled after independent verification. They were **not all discovered together by the fresh-add pipeline**. Across runs, Yahoo, Scientist Live, EIN and Xtalks appeared; the last run missed EIN, the original PR Newswire Ash release and Business Times Journal. Search results varied across runs. A Clival result was excluded from the repair because its visible publication date disagreed with the search date. June 2 partnership coverage was outside the 90-day window.

## Fixes

- LinkedIn page stride is 100 regardless of requested limit. Initial collection now reads full pages; a small daily probe without overlap refills the same page before advancing. This prevents skipped history.
- Distinct LinkedIn repost activities retain their own identity and canonical URL; activity timestamp is used for UTC dates.
- Website-only adds discover an unambiguous LinkedIn company link published by the official site and check duplicates again.
- News candidate searches include body-only company mentions; article extraction reads article/main content rather than navigation, retaining publisher headings and structured publication dates.
- Initial news search uses a 90-day window and supplements Google even when Google already returned results.
- Separate publisher URLs are preserved even when headlines match. Google/direct variants can be combined while retaining the complete headline and direct URL.
- Speaker biography paths are excluded; identity classification distinguishes company news from old employment references.
- Date-only publication values keep their calendar date instead of being converted to UTC midnight and displayed a day earlier.
- Table view displays actual clickable links to grouped additional sources instead of an inert count.

## Limits and remaining work

- Discovery of every publisher is unproven and failed this reference set. Adding Sitero again must not be promised to recreate all six independently verified news links automatically.
- No claim of complete coverage of the whole internet, private/deleted LinkedIn posts, or all companies.
- Yahoo's body loaded in Chrome but automated article retrieval was unavailable; its manually verified headline, URL and date were preserved without inventing an article summary.
- The existing user tracking record, membership, original added date and other companies were preserved. A guarded conditional update changed only the Sitero feed row in development Supabase `ebyoefeikqxxxxifgjxk`.
- HQ/industry were not newly enriched by this change. No tracked-person profile was added; the 73 activities are company posts/reposts.
- Tests: 26 focused checks passed; final typecheck passed. Chrome confirmed entering sitero.com shows “Sitero already exists. Use Manage customers to track it.” with Add company disabled.

Audit inputs, provider responses, comparisons and before/after backups are local under `.local-backups/sitero-audit/` (ignored by Git). Production was not changed.


## Subsequent company-independent replay (same day)

The new automatic discovery pipeline now reproduces five of the six manually
verified news URLs, including EIN and both PR Newswire releases. Its latest
Sitero fresh-add replay collected 73 LinkedIn activities, 12 publisher articles,
and all six official website items. Business Times Journal remains a known
automatic-discovery miss. Expected URLs were not supplied to the collector.
See [the cross-company audit](company-tracking-source-audit-2026-09-11.md) for
shared fixes, methodology and the exact limits of verification.
