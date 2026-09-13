# Market Intel onboarding recovery — September 12, 2026

Environment: localhost:3006, development Supabase project ebyoefeikqxxxxifgjxk. No production changes or deployment.

## Confirmed failure and repairs

Veristat's original collection was interrupted by the development server restarting. A long lease and incomplete progress reporting made it appear to run indefinitely. Collection could also repeat a paid actor after losing the original response. The apex website fetch failed while the official www host worked.

Implemented:
- Durable Apify run IDs and datasets; interrupted requests resume the same paid run. Ambiguous POST responses reconcile against provider run inputs before any new run.
- Persisted identity, LinkedIn, website, news, briefing and save checkpoints; completed phases are reused.
- Three-minute leases with 30-second heartbeats, bounded database requests, an eight-minute attempt deadline and ownership checks before writes.
- Latest worker callback used after hot module replacement.
- No full-feed load for a single new company; refresh lock acquired before loading the shared feed; development HMR fetch cache disabled.
- Safe apex-to-www network fallback with TLS verification and company-domain redirect restrictions intact.
- Website failure is not reported as successful empty collection.
- Initial classification budget covers all collected items instead of a fixed number of batches.

## Live evidence

Veristat ID: veristat-4bd382c6.
Recovery started 22:34:06 UTC; briefing persisted 22:38:54; save checkpoint 22:38:55. Onboarding flag removed from the registry.
Saved: 34 LinkedIn posts, 26 news items, 12 website updates, zero pending news. Existing paid LinkedIn results were recovered and reused. This is not a claim of universal news completeness.

Manually inspected in Chrome:
- Official Veristat news listing and June 23 leadership announcement: https://www.veristat.com/news/veristat-expands-biostatistics-leadership
- Company LinkedIn page: https://www.linkedin.com/company/veristat-llc/
- Latest clinical-trial-enrollment forecasting post, activity 7504263346590998529, matched the persisted result.
- Google surfaced Yahoo's June leadership coverage; its exact URL is present in saved news: https://finance.yahoo.com/healthcare/articles/veristat-strengthens-biostatistics-drug-development-110500074.html
- Actual progress-card screenshot showed Company and Sources complete, Briefing active, four aligned steps and persistent-collection footer.

The Yahoo page grew to over 1 GB in Chrome. It was navigated away from. Browser automation subsequently reported an unattached debugger; native captures of reloaded pages were blank. Therefore the final ready-state visual verification, duplicate-form verification and a fresh company's complete Chrome submission are NOT passed. No additional paid company test was started to substitute for the requested browser test.

## Automated verification

Six targeted tests passed:
- Status request failure resumes original paid actor, with one POST.
- Accepted POST with lost response reconciles provider inputs, with one POST.
- Queue persistence, exclusive claim, stage persistence, completed-phase reuse and retry behavior.
- New and existing companies share the same daily refresh.
- Apex network failure falls back to www.
- Fallback rejects redirects outside the company domain.

Command: node /Users/anirudhsuren/.npm/_npx/67eb4586ca667318/node_modules/tsx/dist/cli.mjs --test tests/market-intel-durable-actor.test.mjs tests/market-intel-onboarding.test.mjs tests/market-intel-origin-fallback.test.mjs

TypeScript: npx tsc --noEmit passed after the final ownership-check fix.

## Remaining checks

Resume with the same two Chrome tabs when browser access works. Verify ready card, briefing and source links, duplicate prevention, then submit another verified company through the real tracking form and watch all four stages through completion and reload. Review source dates and relevance; current evidence does not justify a claim that all publishers or articles are covered. Historical feed entries visible in the list also warrant a separate relevance review (some legacy companies show unrelated news).

## Continued Chrome verification, after 23:00 UTC

Browser access recovered. Used only the existing app tab and one source tab (an external link briefly opened a third tab; it was read and closed immediately).

- Veristat ready card and briefing inspected in Chrome. Duplicate form submitted as far as validation: the existing website produced an explicit duplicate message and disabled Add. No duplicate was created.
- Found a stale Veristat acquisition story dated August by its publisher metadata. Opened the actual STT article in Chrome: visible date was April 22, 2026. Added support for headline-adjacent European numeric dates, with validation and sidebar exclusion. Rechecked existing article URLs without a paid rescrape; Veristat now retains 23 news articles rather than 26. Backup retained locally.
- Entered Alira Health, its official website and the company LinkedIn linked from that website through the actual Chrome Add form. ID `alira-health-f15fbb7a`. The popup closed, the persistent four-step card appeared, and reload retained progress.
- First Alira attempt finished in roughly five minutes with 69 stored posts and 15 news URLs, but zero website updates. This was a failed coverage check, not a passing onboarding test.
- Diagnosed HTTP 403 for the old crawler user-agent versus HTTP 200 for the browser-compatible reader, plus an omitted Education Hub discovery path. Corrected the general reader/discovery logic. A free direct crawl then read 31 pages and found two dated official updates. Undated report pages are not assigned invented publication dates.
- Changed the card heading to reflect its actual stage. Failed empty website collection now leaves a resumable error instead of silently becoming ready.
- Retrying Alira through the Chrome card, with existing posts retained. The new website checkpoint contains both recovered updates; LinkedIn replay reported zero new cost. Final retry verification is still pending at this checkpoint.

Manually compared sources:
- LinkedIn: https://www.linkedin.com/company/alira-health/ — latest CPHI Milan and drug-delivery CDMO posts match saved activities `7504071311888105472` and `7503708876664512513`.
- Official newsroom: https://alirahealth.com/news-center/ — July 22 market report and June 18 infuse partnership both present in saved news.
- Partnership opened and read: https://infuselifescience.com/info/6805695
- Scholarship opened and read, July 29: https://alirahealth.com/education-hub/alira-health-establishes-annabel-de-maria-memorial-scholarship-to-inspire-the-next-generation-of-healthcare-leaders/

Eight focused tests passed (the original six plus publication-date and Education Hub discovery regressions). TypeScript passed after the reader, discovery, progress-heading and failed-website changes. These checks do not establish universal article coverage or enterprise readiness.


## Firecrawl single-company trial — Sep 12, 19:45 EDT
User explicitly authorized existing Firecrawl credits. Caidya only: Firecrawl Map returned 202 URLs; crawl job `01a097fa-0e1b-7362-beb4-f6fbebcc113e` finished 140/140 pages, 140 reported crawl credits, zero unreadable pages. Parsed 31 dated official updates within 90 days, eight more than the prior direct collector. Saved all 31 to development company `caidya-d2cda815`, preserving 38 LinkedIn posts and 47 news items. Raw provider evidence is in `.local-backups/tracking-check/caidya-firecrawl-complete.json`; backup before save is `caidya-before-firecrawl.json`.

Chrome verified the official newsroom (August MediLink and June Simbec-Orion stories), official resource listing (September 11 oncology timelines, September regulatory update), and app's selected Their website 31 table with readable titles, dates and source hyperlinks. Not all 140 pages were opened manually. App's industry filter hides five other feed items; stored post/news counts therefore differ from the filtered page.

Added general Firecrawl discovery to the daily website collector: listing pages refresh each daily cycle, discovered article URLs are parsed from actual HTML, parsed archive pages are cached for seven days, new listing links are followed even when absent from Map. Existing daily schedule invokes this collector; no separate company timer. Removed app-imposed render-credit cutoff while retaining usage ledger. Provider crawl was a one-company trial; no broad batch was launched. Sixteen focused tests pass, including new-link discovery, same-cycle paid-call reuse, nested listings and unreadable-page behavior. Daily discovery behavior is fixture-tested; tomorrow's real scheduled execution has not yet occurred.

The shared refresh lock was occupied, so Caidya's verified website results were merged with `saveFeedCompany` after a fresh company read; the existing news/posts were preserved. No global lock was cleared and no paid LinkedIn run was restarted.

## Caidya external coverage audit — Sep 12 evening
Checked all 47 existing external-news URLs using the actual article reader and Firecrawl fallback, three concurrent reads. Compared two pages of Chrome Google results with the saved list: the 14 relevant article results were already present (social links and directory profiles excluded). Manually opened Fierce Biotech and NCBiotech and confirmed their headlines/body; verified corresponding source links and rows in Chrome's app News view. This is a bounded comparison, not proof that every external publisher was discovered.

Found and fixed: author archives accepted as articles; Drupal related-story snippets selected instead of the main article; HTTP-200 shells with no extracted article did not attempt rendered fallback. Unread headline-only candidates now carry articleTextPartial=true. Removed the researchuk author archive from Caidya. Saved 46 remaining records, 36 with readable article content and 10 without article text after retry. These ten remain discoverable source links, not fully verified articles. Some publication dates remain search-derived when the publisher exposes no machine-readable dateline. Caidya.cn is a regional own-site result still classified as external by the current single-domain ownership model; ownership aliases need separate handling.

Evidence/backups: `.local-backups/tracking-check/caidya-external-before.json`, `caidya-external-verification-final.json`, `caidya-before-external-save.json`. Forty focused source-reader/discovery tests pass. Updated older Apify test fixtures to support durable status polling and the authorized removal of the local Firecrawl credit cap. No LinkedIn rerun or new company added.

## Shared workflow wiring
New-company onboarding and existing-company daily site refresh both call the generic Firecrawl website collector. Daily external discovery now also passes the configured Apify token into Google web discovery, hydrates publisher articles and retains Google results/costs if Perplexity fails. Removed website-only failure as a blocker to onboarding when other sources succeeded; source warnings are retained with the initial feed. Server Node instrumentation arms both self-refresh timers, including on localhost without health-endpoint traffic. All companies retain the shared 06:00 UTC daily cycle; timers work through due companies in batches, not simultaneously.

Website collection yields after a two-minute budget plus its in-flight batch, reports remaining pages and preserves per-page caches for later refresh. This prevents a large/unresponsive domain keeping onboarding running indefinitely. It is not an assurance that every site's entire archive is read in one pass. Forty-seven focused tests pass (daily discovery, source readers, Firecrawl cache/new links, onboarding); typecheck passes. No new paid company sweep, deployment or production data changes were made in this wiring step.

### Emmes follow-up (Sep 12 evening, in progress)
Manage customer/competitor rows now receive persisted onboarding state, show a spinning collection label or failure state, suppress the admin Active badge until ready, and refresh pending rows every five seconds without replacing bookmark drafts. Verified Emmes in Chrome on Manage competitors; typecheck passed.
Emmes exposed an official HTTP redirect from emmes.com to theemmesgroup.com. Website collection now resolves and caches that origin and prioritizes newsroom-linked stories before the map archive backlog. The old crawl missed the Aug 24 CEO appointment; the corrected reader has parsed it. Onboarding hit its eight-minute attempt guard during external discovery; increased the overall bound to twenty minutes to accommodate the individually bounded source reads. Recovery and complete three-source verification remain in progress; do not describe this as a fully passed onboarding test yet.

Emmes recovery completed at Sep 13 00:36:39 UTC. Saved 25 LinkedIn posts, 34 news records after removing the duplicate official-site URL, and 1 website update. Chrome verified completed briefing and Their website filter with the Aug 24 CEO announcement and working destination URL. Classification removed unrelated Emmes real-estate matches from the saved news. Collection is usable, not a complete coverage audit: four external records lack readable body text, and website crawl reports 121 unvisited archive URLs. Seven targeted tests and final typecheck passed. Manage status uses the admin Status column; non-admin users see it beside the name. No deployment.

### Collection latency audit and corrections

Observed Emmes timings: initial LinkedIn checkpoint about 15 seconds after submission; recovery source stage 00:27:06–00:35:34 UTC (8m28s); briefing completed 00:36:38, saved 00:36:39. The old eight-minute wall-clock rejection could fail a job even while source requests were progressing. Raising it to twenty minutes masked that design issue; the overall rejection timer is now removed. Per-request network deadlines, worker heartbeats, leases and paid-result checkpoints remain.

Audit found website completion blocking external discovery, repeated hydration of discovery articles, serial publisher-index reads (up to 12), serial source-search calls (up to two), and serial history-search batches (up to four). External initial search now starts alongside the website and RSS; official-title expansion still correctly waits for website evidence. Already hydrated discovery results are merged without reading them again. Publisher indexes/date checks run three at a time, source searches two at a time, history batches two at a time. Pagination discovered by the final partial batch is retained (regression test caught and fixed a skipped-page bug). Query/coverage bounds have not been cut to manufacture a faster result.

Progress: LinkedIn/profile preview and completed website results persist before briefing completion; labeled news persists before the digest. Retrying retains previously saved preview news/site content. Pending companies can be opened; elapsed time includes seconds. Manage rows now have a continuous full-width blue shimmer and prominent collection status, without changing row height. Chrome screenshot checked with a temporary, leased dev-only fixture that does not run providers.

Validation: 34 focused onboarding, tracking, source-reader and daily-news tests passed. Added delayed-website regression verifies initial external discovery starts before website completion; 31 focused tests passed afterward. Typecheck passed before the final retry-preservation adjustment; rerun recorded below. No new paid company collection was launched for this audit. Real-world completion-time improvement is not yet measured; do not claim a universal speed or coverage guarantee. Remaining latency sources include bounded article rendering, website archive backlog and model classification/digest calls.

## Premier Research / AI website selection (Sep 12 evening)

Added through Chrome's Track competitor form in development (website and LinkedIn,
MPR): `premier-research-4fec8478`. Only two controlled Chrome tabs were used.
Initial job: 01:04:38–01:19:28 UTC, about 14m50s. LinkedIn/profile completed in
14 seconds (147 posts). Initial website collection missed the blog section and
mistook the blog listing for an article. External collection plus verification
was slow; final initial feed had 4 external articles and no pending news.
This duration is not a latency pass.

Implemented generic AI selection with the configured Anthropic key: Firecrawl
maps URLs; Haiku selects supplied integer IDs as archives or articles; the reader
scrapes the exact selected URLs and checks real publication dates. Invalid or
invented IDs are rejected. Selections and parsed pages are cached. No company
names or expected article URLs are hardcoded in production logic.

The live AI inventory contained 955 URLs, classified in five batches in about
eight seconds. A subsequent corrected website pass returned 24 recent updates
from 88 parsed pages. All seven recent entries manually visible on the official
/blog page were present in those results (Sep 1, Aug 18, Aug 4, Jul 21, Jul 14,
Jul 7, Jun 16). June 2 and the Apr 7 newsroom announcement were outside retention.
449 archive URLs remained unread in that pass; one page was unreadable. This is
not exhaustive site coverage.

Additional fixes: retain meaningful article links outside traditional /news
paths; exclude navigation links and listing pages; interleave archive links so
one section cannot starve another; deduplicate external candidates before reading;
keep six external readers running independently instead of waiting for the slowest
reader in each batch. The initial live job preceded these reader changes, so its
15-minute timing does not validate their latency improvement.

40 focused Node tests and TypeScript passed. Chrome verified early logo/posts,
clickable pending company, whole-row collection styling, and source-specific
collecting text. Normal website refresh is waiting behind the existing shared
refresh lock; app persistence of the corrected 24-item result is not yet verified.

Follow-up: the shared refresh lock was still owned by another run. The waiting
refresh command was stopped without triggering another crawl. The already
collected website result was labeled with the normal classifier and saved with
an optimistic company-row update plus the normal summary builder, preserving
posts/news and backing up the previous row. This is a repair from actual collected
results, not a new end-to-end daily-refresh pass. Database verification: 23
website items after deduplication; all seven blog URLs retained with labels.

All four external URLs opened in Chrome: the two PR Newswire releases reference
Premier Research and display Aug 20 / Aug 6 publication dates; Clinical Trial
Vanguard displays July 11 and cites the company's analysis; Xtalks identifies
the company and its presenters, with Aug 4 as the event date. Its saved June 16
publication timestamp is metadata, not the event date visible in the body.

Final Chrome check after the one-minute server cache expired: Their website 23;
News 4; Company posts 139 with the existing industry filter hiding eight of the
147 saved posts. Selected the website tab and verified all seven manually checked
blog titles and exact article hrefs in the rendered table. Logo and 155K follower
count displayed. Screenshot at 1512px showed the table fitting alongside the
company drawer. No initial collection spinner remained. Universal source coverage,
new-company latency with the updated reader pool, and the scheduled daily run are
not certified by this test. No deployment was performed.

## Repeat test requested Sep 12, 9:26pm ET

Executed the real `refreshTrackedCompanyNow` path for the existing Premier
Research row, using configured development providers and their existing caches.
Started 01:27:05 UTC; saved 01:34:25: **440 seconds (7m20s)**. Website finished
at 130 seconds with 48 candidates; external discovery finished at 408 seconds
with 70 candidates and `failed: true` (partial unreadable sources). Normal
classification/save retained 4 external articles, 147 posts and **45 distinct
website updates**. No pending news; no prior website URLs lost; no duplicate
website URLs; all seven manually verified blog articles retained. The additional
22 website items are official event pages, not 22 newly discovered news articles.

Fixed another sequential wait in the existing-company refresh: posts, RSS,
website, and initial external search now start concurrently. Added preservation
of partial-source warnings to this refresh path (typechecked after this run).
40 focused tests and typecheck pass. This is a cached existing-company test,
not a cold onboarding timing test. External latency and unreadable pages remain
open; do not present this as a clean full-coverage pass.

Chrome verification after cache expiry: website 45, news 4, posts 139 visible
with eight hidden by the existing industry filter. Selected website tab and
inspected final layout; table fits beside the company drawer. Reused Chrome tab
953422919; no new browser tabs opened during this repeat.

### Worldwide Clinical Trials fresh test (Sep 13 UTC, still under verification)
- Submitted in Chrome at approximately 01:37:20 UTC, id `worldwide-clinical-trials-3f9e9f37`, official website `worldwide.com`, LinkedIn `worldwide-clinical-trials-inc-` (verified from the official footer and opened in Chrome).
- Logo and 67 LinkedIn posts reached the saved preview by 01:37:37. The actual detail page opens during collection, shows the correct logo/241K follower count, posts and the active source indicator; screenshot inspected in Chrome.
- Initial website phase saved only 3 updates. Manual Chrome traversal found 8 current blog posts and 3 newsroom announcements. Two generic ordering fixes (article reading gets its own budget after discovery, recent dated paths precede old archive paths) recovered 11/11 benchmark URLs in a 133.6-second cached website retest; 19 total official updates returned. This is NOT a whole-site coverage pass: the resource archive contains further dated items.
- Website public WordPress discovery trial returned 43 recent public entries in 2 seconds (8 posts, 3 newsroom, 22 resources, 10 events). Draft helper is not yet wired into the app. It is discovery, not fabricated content; article pages still require reading.
- External delay traced in cached provider timestamps: Google web actor steps took several minutes. Direct Firecrawl v2/search benchmark returned 20 tool links in 0.94 seconds, 4 credits. Search wrapper now prefers Firecrawl, caches credit usage/results and falls back to Apify only for failed queries. Focused mocked provider test passes.
- Verified article text now has durable 24-hour reuse; partial reads use 5 minutes, failed reads remain retryable. Cache read/write failures do not discard successful publisher evidence. Three focused tests pass.
- Development code reload interrupted the first run. Lease recovery resumed at 01:51:53 UTC from completed identity/LinkedIn/website/news-index checkpoints. Do not report the elapsed first attempt as a completed fresh run or claim clean latency.
- External articles opened manually: PharmaSource (Sep 4), Fierce Biotech (Sep 2), Applied Clinical Trials (Sep 2), all covering the Fortrea transaction. Final stored-feed comparison remains pending.
- Local evidence is in `.local-backups/tracking-check/worldwide-*`; the expected URL fixture is QA-only, not collector logic.

### Worldwide retest and Allucent fresh case (Sep 13 UTC)

The normal targeted Worldwide refresh finished in 394 seconds with 67 LinkedIn
posts, 73 external news items, 41 website items and no pending classification.
All 11 manually opened recent blog/newsroom articles and all three independently
opened external publisher articles were present in the persisted feed. The public
CMS inventory exposed another 22 recent resource pages and 10 event pages.
Two events were incorrectly rejected because their valid titles were under 18
characters. The general parser now accepts short titles when the page explicitly
identifies itself as an article; dated detail requirements still apply. A regression
test and typecheck pass. Repeating the website collector returned all 43 recent
CMS URLs. This last website-only result has not yet been saved by the scheduled
website pass, which currently holds its refresh lock.

This is a benchmark pass, not a claim of exhaustive internet coverage: one saved
external article has partial text and older website archive URLs remain queued.
The fresh external run's partial status needs better diagnostic specificity.

Allucent was submitted through Chrome at approximately 02:07:13 UTC, ID
`allucent-831bb545`, using its official website and `allucent-cro` LinkedIn page.
The form resolved identity and showed its logo and 62 posts by 02:07:30. The
in-progress detail page was clickable and rendered available posts while News
and Website displayed Collecting. LinkedIn manually matched 168,989 followers
and the first two posts. Official June 30 IGNITE announcement, Clinical Trials
Arena July 1 coverage and Tekton Research July 1 partner coverage were opened
in Chrome as independent comparison targets. Collection remains under observation.
