# Market Intel retest — September 12, 2026

Status: **in progress; not production sign-off**. The user requires Sitero to pass before testing another company. No company/article URLs from the reference set are supplied to the fresh-add collector.

## Fresh-add sequence

The harness invokes the actual `addCompanyByLink` path with name Sitero and website sitero.com, hides the existing Sitero record, and intercepts company persistence. It uses live search/read/classification providers and the previously captured live LinkedIn response to avoid repeatedly paying for the same scrape. Shared search accounting and cache writes use the verified development database. Sitero was subsequently saved to the development feed as recorded below; Rimsys has not been replaced.

| Replay | News | Website | Result |
| --- | ---: | ---: | --- |
| Current-day baseline | 16 | 6 | Included job listings and stale/background stories |
| Google web discovery | 13 | 6 | Missing independently verified publishers |
| Rendered source discovery | 15 | 6 | Recovered AI-TechPark; incorrectly accepted RWS related-story text and a market-report advertisement |
| Article boundary fix | 13 | 6 | Recovered the actual AI Brief Sitero article; both false positives removed; Business Times Journal still missing |
| Second-index discovery | 14 | 6 | Discovered Business Times Journal, but its challenge/dateline still prevented ingestion |
| Dateline and article-boundary fixes | 16 | 6 | Recovered Business Times Journal and Third News |
| Explicit publication labels | 17 | 6 | Recovered National Law Review |
| Enhanced fallback reader | 18 | 6 | Recovered ADVFN; next replay confirmed its clean headline |
| Retained evidence and language editions | 17 | 6 | All 18 reference URLs covered; two Moomoo editions grouped as one article with both URLs retained. All 17 have source text and summaries. Saved to the development Sitero feed and verified in Chrome. |

All completed replays retained 73 company posts from the captured live provider response. A fresh browser read covered all 80 consecutive posts in Recent order, including revisiting virtualized gaps. Posts 1–73 match the collected activity IDs exactly. Post 73 is June 15; post 74 is June 12, outside the current 90-day window. Reposts retain their own activity identity. This checks inventory and visible post text; it is not a claim to have watched every video or read every attached document.

## Browser checks in this retest

Two task tabs only: the existing Sitero app and one reused research tab. Read the complete AI-TechPark, Business Times Journal, Golemworkers, EIN Presswire, AI Brief, Dealroom, Indianapolis Star and Des Moines Register stories. The simplified-Chinese Moomoo version contains the original English webinar release and Joby John/Sitero participation. The RWS AI Brief page mentions Sitero only in recommendations, and links to a separate genuine Sitero article; those must not be conflated.

Also read NEWSnet Fresno, both Moomoo language versions, Third News, National Law Review and ADVFN in Chrome. The reference JSON in `.local-backups/sitero-audit/manual-references-sep12.json` records 18 positive news URLs, six official URLs and five negative URLs. It is test evidence, not a collector input. The reference set grows when further sources are opened and verified.

## General fixes

- Added cached, budgeted Google web results alongside Google News and raw Perplexity discovery.
- Follow real company article links found on neighboring publisher pages; retain the link for discovery without treating related-card text as the parent article body.
- Added bounded Firecrawl rendering for blocked/plain-HTTP and JavaScript-shell pages. Challenge responses are failures even when the API itself returns HTTP 200.
- Extract semantic article bodies and prose containers before page-level content. Preserve existing semantic extraction when a body has no paragraph tags.
- Reject job ads, social-post mirrors, vendor rankings and market-report sales pages.
- Check transaction publication history so a rotating republisher date does not revive an old acquisition.
- Cache article reads to avoid repeated crawling within a collection.
- Added an OpenAI search-index adapter, parsing only tool-returned source URLs. It ignores model-written article URLs and retrieves publisher title/date/body independently. Per-query cache, atomic spend reservation, one tool call, and token bounds apply.
- Enhanced rendering recovers pages that return HTTP 200 challenges and therefore do not trigger automatic proxy escalation. Share widgets and their nested document titles are excluded from the headline.
- Daily RSS results no longer short-circuit the other news index. A failed provider does not discard successful RSS results or mark the overall news refresh complete. Daily articles are hydrated to support company mentions in the body.
- Per-article summaries run in batches beyond the old 12-item limit. The combined briefing includes distinct developments from all batches. Word-boundary truncation replaces mid-word cuts.
- Preserve the complete returned LinkedIn caption instead of silently cutting it at 2,000 characters. A regression checks content at the end of a long post.
- Retain actual publisher text separately from search snippets, so summarization can use already-read evidence even if the origin subsequently fails.

## Spend and rendering limits

Paid searches and rendering use shared development ledgers and cached results. Replays reuse the captured LinkedIn response. During this audit only, selected diagnostic invocations used a 40-credit rendering ceiling after the normal 30-credit daily budget was exhausted; the production default remains 30. An earlier rendering ledger snapshot reached 32 credits; later bounded retries also ran, so that snapshot is not a final usage total. This includes repeated troubleshooting, not a per-company price. The renderer now reserves one credit per HTML scrape, matching the [provider's current documentation](https://docs.firecrawl.dev/features/enhanced-mode), rather than blocking the last four available credits with an obsolete five-credit reservation.

## Validation

58 focused tests pass together, covering collection, duplicate prevention, durable onboarding, source extraction, daily-source failures, retained article evidence, language-edition URLs, summary batching and search accounting. The source adapter test checks that invented URLs in model prose are ignored, tracking parameters are removed, cached repeats cost zero, and a capped budget prevents a provider request. Typecheck and diff whitespace checks pass. No broad browser suite, production writes, deploy or push.

The real daily Sitero search returned an unrelated bicycle-saddle candidate. The actual news identity classifier rejected it (`isCompanyNews: false`). Chrome Google News search for Sitero after September 9 returned no news results. This validates that a raw search candidate is not automatically published as company news.

## Remaining work

Sitero's verified replay was saved with a conditional development-only update, preserving its group, logo and other company metadata. Chrome shows 73 company posts, 17 news articles and six website items. News rows group related coverage and expose other publishers. The final reference comparison is `.local-backups/sitero-audit/comparison-final-sep12.json`; the before-write backup is `before-save-sep12.json`.

Rimsys is the current sequential test. Its fresh replay found 18 candidates; browser checks exposed two May articles incorrectly dated September by unrelated page widgets, plus a publisher tracking link redirecting to an official product page. Shared fixes now prefer the primary article dateline, exclude unrelated drawer/related-date widgets, and preserve the HTTP redirect destination before company-site filtering. The rerun contains 15 news items, two official-site items and 25 LinkedIn activities.

Read all 25 in-window LinkedIn positions in chronological order, including three image-only posts, the Philips document repost, and two separately dated posts with identical text. Read the older boundary posts as well. This was a visible-text/order comparison, not a downloaded-media or every-comment audit; DOM activity-ID export failed in this part of the browser session.

Browser-verified this pass: two official articles; Business Wire, Yahoo, AOL, Passport News, Bastille Post English, Morningstar, AP, New Castle News, Bluefield Daily Telegraph, Gens & Associates, the entire available Zencastr transcript, and RegQuality Review. The two old false-positive pages were opened and their actual May 5 dates verified. Joplin Globe shows the correct headline/date but its article body requires a paid subscription; full browser-body verification is blocked there. FinancialContent and the Chinese Bastille edition have also been read in Chrome. The latter explicitly confirms beta availability and pending ISO 42001 certification; unrelated content below the article was excluded.

The normal replay had three unavailable source bodies. A bounded diagnostic using the existing audit-only 40-credit ceiling recovered Yahoo and AP; Business Wire returned a renderer HTTP 500. Temporary renderer failures previously remained cached for 24 hours; they now retry after five minutes within the same spending cap. Challenge-page failures retain their longer cache. Briefing instructions now preserve beta/pilot/approval limitations. Rimsys is not marked passed or saved to the real feed yet. Artifacts: `.local-backups/rimsys-audit/replay-dates-sep12.log`, `replay-ready-sep12.json`, and `missing-readers-sep12.log`. Full multi-company daily operation still needs verification. No assertion of exhaustive internet coverage or enterprise readiness is warranted yet.

Browser-control restriction: use only the two audit tabs through tab-scoped APIs. Do not operate the desktop, activate Chrome globally, use global keyboard shortcuts, or switch the user’s unrelated tabs.

## Tab-only continuation

Chrome tab-scoped controls recovered successfully. Read Business Wire again without native desktop control, and completed FinancialContent and Chinese Bastille checks. The fresh replay then produced 20 candidates: three gated social-post mirrors and two Gens landing pages were additional false positives. Browser inspection confirmed the membership page only promotes the real podcast article and the social mirror exposes a clipped public post. Added content-based mirror exclusion, homepage exclusion (article-ID query URLs remain eligible), and member/login landing-title exclusion, preserving discovery of the genuine linked article. No company or expected article is hardcoded into these rules.

Found another evidence limitation: retained publisher bodies were cut at 3,000 characters and digest inputs at 1,400. Retention now preserves the reader output and the reader/digest limit is 60,000 characters per article. Digest batches are bounded to 120,000 article characters and 12 items. A regression verifies end-of-article qualifications reach the model and large inputs split into bounded batches. This remains a bounded text audit; it does not establish that image, video, or document-only information was extracted. The refreshed full-evidence Rimsys replay is still in progress; do not mark it passed based on the prior output.

The audit rendering ledger has now reached its 40-credit ceiling (36 recorded requests including earlier accounting adjustments). No further rendering budget increase was made. Business Wire is readable in the audit browser but still returns HTTP 403 to a plain fetch; the renderer has returned HTTP 500. Do not manually paste its browser text into the production collector to hide this failure.

A subsequent full replay returned 14 news / 2 site / 25 posts with zero pending decisions. The omitted RegQuality Review analysis was reproduced as a verification rejection: the model treated company-specific product analysis without an announcement as ineligible. Clarified the general eligibility rule and passed retained article text into verification instead of only a search excerpt (verification bounded to 8,000 characters per item). The same isolated live verification now accepts that analysis. Another full replay is running in `replay-analysis-fixed-sep12.log`. A prior replay had an intermittent batch verification failure; a separate 20-item live verification returned all 20 labels without errors. Added safe HTTP-status/parse-failure diagnostics; this intermittent failure is not yet proven resolved.

All three newly found social mirrors were opened in the same Chrome tab and confirmed to expose clipped public posts behind login. The Gens homepage and membership landing page were also opened; both promote the actual podcast rather than being articles themselves. Windsor Drake's short Rimsys product-launch coverage was read and is a further valid reference. Superkind's tool-landscape article was inspected around its Rimsys mentions; those are vendor-list examples, not substantive Rimsys reporting. These checks have not been inserted as discovery inputs.

Latest checkpoint: the 8,192-token/compact-verdict change did NOT resolve the full-replay verification failure. `comparison-latest-sep12.json` records one accepted news item and 20 pending in that replay, despite isolated verification of the same 20 candidates succeeding. This is an unresolved integration failure, not evidence of a working flow. No Rimsys feed replacement was made. A fully traced replay is running in `replay-traced-sep12.log`, recording only model response text/status (no keys or thinking blocks), and safe failure diagnostics now distinguish error classes. Do not move to the next company or claim completion. Kivo and Sakara Rimsys-specific analysis passages/dates were reviewed in the same audit tab; unrelated sections have not all been hand-read.


## Current checkpoint — publisher reconciliation (supersedes earlier running-replay notes)

The traced failure was an explicit provider refusal, caused by hidden encoded subscriber payloads entering article evidence. Removing `.encrypted-content`, hidden elements, and non-visible templates fixed this without bypassing publisher access controls. Visible excerpts remain marked partial. Verification now isolates a refused item instead of stranding the entire batch, preserves company-specific passages throughout long articles, and includes the real publication date. The completed `replay-dated-evidence-sep12.log` matched all then-known 18 publisher URLs, two official articles, and 25 unique posts with zero pending decisions. The combined digest was then regenerated from original source evidence after catching a jurisdiction count incorrectly attributed to a different product (`replay-ready-final-sep12.json`).

The old development feed was backed up to `before-save-sep12.json` before any potential write. Its 60 posts contain only five unique LinkedIn activity IDs; all five exist among the fresh 25. Most old news is unrelated-company pollution, but one real News-Press NOW release was missing from the fresh result. Opened it in the same Chrome research tab: September 1 dateline, Business Wire attribution, launch/beta introduction visible; remaining article text is not visible. Current Google News queries rotate between other copies and omit this publisher. This expands the reference set to 19 and means the earlier 18/18 match is not a full pass.

Added one bounded publisher-diversity Google web pass using dynamically discovered headlines and publisher domains. No reference URL or company-specific query is inserted into production code. It shares existing accounting/caching and does not raise a budget. The fresh replay is `replay-publisher-diversity-sep12.log`. A mocked end-to-end discovery regression demonstrates recovery of a second outlet when initial results repeat the first; all 25 source-reader tests pass. The previous combined suite passed 64 tests.

Browser search also found KnowledgeNile's release copy. Read its entire visible article; no visible publication dateline, so page metadata still needs checking before marking it a dated expected result. The reference JSON records it as a candidate, not an accepted timestamp. Browser operations remain confined to two audit tabs, reusing one research tab; no desktop/global keyboard control. No Rimsys replacement, production write, deployment or production-readiness claim.


## Latest status — live discovery blocked by existing budget

The short-keyword diversity replay completed with 18 news, 25 unique posts, two official items, zero pending, and zero verification errors. It still missed News-Press NOW and KnowledgeNile. A database cache/ledger read then established that the new paid web pass had **not run**: the shared ledger is $0.9640612 spent plus three $0.01 reservations against the default $1 daily cap, insufficient for its $0.10 reservation. Those reservations must not be deleted merely because they are old; timed-out calls can still bill. No spending cap was raised. This is not a successful live validation of the added search.

The revised pass uses full discovered headlines instead of two truncated keywords. Its isolated discovery test passes, and all 65 focused tests pass together; typecheck and diff checks pass. `replay-headline-diversity-sep12.log` is the follow-up replay, but it is subject to the same cap and cannot establish live discovery success while blocked.

KnowledgeNile's machine-readable publication date is `2026-09-01T12:43:29Z`; the full visible article was read. A browser full-headline search also found Rutland Herald's September 1 release, whose complete article was read through its copyright/publication line. The reference inventory now has 21 publisher URLs. None of these expected URLs were inserted into collector inputs. The real Rimsys feed remains untouched; reference comparison must be rerun once discovery can actually run. Latest known saved input backup is `before-save-sep12.json`, post-ID reconciliation is `old-feed-reconciliation.json`, and the web-cache snapshot is `web-cache-sep12.json`.

The headline replay has now finished: 18/21 reference URLs, 25 posts, two site items, zero pending/verification errors. Missing News-Press NOW, KnowledgeNile and Rutland Herald. `comparison-latest-sep12.json` records the failures and the budget block. No replay process remains running. No feed replacement occurred.


## Authorized budget continuation

User explicitly authorized removing the $1 cap within a $10 budget. Changed the paid-search default to $10; preserved atomic reservation checks, cache reuse, configured overrides and existing spend. Started `replay-budget10-sep12.log` with actual live discovery and captured LinkedIn response. Also reproduced a later-search publisher index being discarded (test failed before change): index expansion ran before the later queries. Moved expansion after all searches, deduplicated index URLs, and bounded it to eight pages with an incomplete flag when more remain. The regression now passes. No expected company URLs are supplied to discovery, no additional tabs, no feed replacement yet.


Continuation fixes: publisher diversity now excludes outlets already carrying the same discovered announcement, rather than unrelated high-frequency candidate domains. Late publisher index expansion follows adjacent archive pages (up to two further pages, 12 total index reads), marks truncation incomplete, and recognizes `/news/bpage/2/` as an index. Chrome confirmed KnowledgeNile's Rimsys link is on page 3 while search returned page 2. The old audit tabs had been closed; created one replacement research tab (953422745), leaving the user's other tabs untouched.

Google News redirect decoding also had an independent defect: valid signature/timestamp envelopes were rejected by the article reader's minimum prose length. The decoder now reads the bounded metadata envelope directly. A live decode of the previously captured News-Press NOW RSS entry returned the correct publisher URL; this diagnostic is not a fresh-discovery pass and was not fed into the collector. Two regressions cover the metadata envelope and paginated-index recognition. All 67 focused tests pass. `replay-index-pagination-sep12.log` is running; its start preceded the final decoder/index-recognition edits, so a final rerun is still necessary. The newly enabled web search cost $0.00685; the search ledger then showed $0.9709112 spent plus $0.03 reserved, limit $10.


## Latest continuation — source reasoning and resource handling

Supersedes earlier running checkpoints. Latest complete fresh-add replay (`replay-redirect-archive-sep12.log`) has 19 news, 25 posts and two official items, zero pending/errors. Browser inventory expanded to 22 with MidFlorida's fully read September 1 release. Subsequent discovery-only runs recover KnowledgeNile and Rutland, but still miss News-Press NOW and vary on MidFlorida; these are not full-flow passes. No Rimsys feed was replaced.

Made Google News actor a fallback when the initial primary search yields nothing, after its paid live test duplicated existing outlets. Primary-provider errors no longer abort complementary discovery. The secondary OpenAI source search now uses GPT-5-mini low reasoning, at most two built-in calls and 2,000 output tokens, driven by actual discovered headlines/publishers. It accepts tool-source URLs only, never model-prose URLs. Rates/accounting updated with cached-input usage, reservations and cache reuse tested. Official references: https://developers.openai.com/api/docs/guides/tools-web-search , https://developers.openai.com/api/docs/models/gpt-5-mini , https://developers.openai.com/api/docs/pricing .

Two live diagnostics were stopped after excessive CPU/memory. One database probe failed DNS, then resolved normally. Added 15-second search-accounting request timeouts. Found the generic article reader used unbounded response.text() and could parse a large PDF from search as HTML; now rejects binary types/PDF signatures and cancels streams over 3MB before DOM parsing. Regression checks binary and oversized-response cancellation. The precise CPU attribution was not profiled successfully; do not claim the entire resource issue resolved until rerun finishes.

68 focused tests passed before the added resource test; all 29 source-reader tests and typecheck pass after it. Current live diagnostic: `discovery-safe-reader-sep12.log`, inherited NODE_OPTIONS heap cap 512MB, one process. Chrome repeatedly returns `Debugger unattached` selecting existing tab 953422745, including after reset, so no new hand-verification is claimed. Search ledger read: $1.2041691 spent plus $0.03 outstanding reservations against $10; this excludes other-provider costs. No production mutation, feed replacement, or readiness claim.


Final checkpoint for this continuation: `discovery-safe-reader-sep12.log` completed successfully after the bounded reader change. 33 pre-verification candidates; incremental search cost zero because paid results were cached; incomplete flag true. Exact URL comparison misses three references: News-Press NOW, MidFlorida, and the original FinancialContent path. FinancialContent is represented by an alternate article path, so two publisher gaps remain. This is discovery-only, not full add/verification or browser acceptance. Saved comparison: `comparison-discovery-safe-reader.json`. All 69 focused tests, typecheck and diff checks pass. No audit process remains running. Browser control still fails after three attachment attempts and a session reset. No new hand-verification, Rimsys save, or readiness claim.
