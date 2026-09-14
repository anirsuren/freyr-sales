# Market Intel fixes, Sep 13 (for review)

Written by Claude after a test pass on localhost:3006 (dev database, real mode, desktop).

**State of the code**
- None of this is committed or pushed. It sits as uncommitted changes on top of `b49e97d`, which is what dev and prod both run.
- `npx tsc --noEmit -p .` passes.
- Market Intel unit tests: 118 of 119 pass. The one failure, "unread articles cannot qualify through a neighbouring-story search snippet" in `tests/market-intel-origin-fallback.test.mjs`, fails the same way on a clean `b49e97d`. It asserts an `onUnread` callback that no production caller passes, so I left it alone.

Each item below gives what was wrong, what changed, and where.

---

## 1. Card counts now match the company page

**Wrong.** A card counted every item ever stored. Its page lists the past 3 months with each address once. The two disagreed on 58 of 204 companies:
- Moderna: card 27 website items, page 4.
- Novartis: card 40 posts, page 26.
- Pfizer: card 203 news, page 201.

**Changed.**
- `lib/marketIntelFeed.ts`: `summarizeCompany` now also stores `shown`, the date (epoch minutes, `null` when undated) of each item the page would list, by kind, plus the items that hit a named signal.
  - It follows the page's own order: one item per URL (website copy first, then posts, then news), then the Freyr-industries filter for competitors.
  - `cardFromSummary` counts `shown` over a 90-day window when the card is drawn. That feeds `counts`, `signalTotal` and `itemsInWindow`.
  - Old summaries without `shown` fall back to the stored `counts`.
- `app/customers/[id]/page.tsx`: the Market Intel block uses the same windowed counts. It already said "past 3 months".
- Verified against every stored company: 204 of 204 cards equal their page's Sources chips (the stored counts matched on 146).

## 2. People post counts match the "People posts" chip

**Wrong.** Each person's badge in the Company details rail counted every kept post (up to 120 days), next to a chip that counts 3 months:
- GSK's rail added up to 36; its chip said 15.
- Bayer's Daljit showed "30 posts" with none of them on the page.

**Changed.**
- `components/market-intel/LiveCompanyBriefing.tsx`: the rail and the person pop-up get posts filtered to 90 days (`railPosts`).
- `lib/marketIntelFeed.ts`: `PersonSummary` gains `postMinutes`. The new `personPostsInPageWindow()` feeds the card face counts in `components/market-intel/LiveDashboard.tsx`.

## 3. Removed stories stay removed under every address

**Wrong.** An admin's removal stored only the URL the story was shown under and compared it letter for letter. The same article is also stored as a Google News link (`alternateUrls`) or with tracking tags, so a later collection could bring it back.

**Changed.** In `lib/marketIntelFeed.ts`:
- `storyKey()` normalises a URL: drops the hash, `utm_*`, `fbclid`, `gclid`, an empty `?`, and a trailing slash.
- `withoutRemovedStories()` matches on `url` plus `alternateUrls`. It is used by `saveFeedCompany`, `saveFeedPerson` and `removeFeedStoryItems`.
- `removeFeedStoryItems` records every stored address of the matched story.
- `publisherUrl` is deliberately not matched. It is often the outlet's home page, and matching it would hide every story from that outlet.

**Tested for real** on Galderma: the DELETE returned 200, the story was gone after a reload, and both addresses were recorded. The row was then restored from a snapshot and checked to match exactly.

## 4. Follow someone: the button waits for a profile link

**Wrong.** "Follow their posts" was always clickable. An empty box or a company-page link was refused only after the click, which breaks the "button off until the form is valid" rule.

**Changed.** `components/market-intel/TrackPersonControls.tsx`:
- Uses `linkedInIdentifier(url, "in")` from `lib/marketIntelLinks.ts`.
- The button is off until the link is a profile.
- A one-line hint says what's wrong. The pop-up height never changes.

## 5. Names read as names (display only)

**Wrong.** "Stephane COUSIN", "Shawn. Stragier", "Krishna Vamsi Kandimalla, PharmD, MSRA, RAC".

**Changed.**
- `lib/personName.ts` gains `displayPersonName()`. It cuts at the first comma or bracket, drops trailing credentials, removes a stray period after a word, and title-cases ALL-CAPS words. The existing `shortPersonName` is untouched.
- Applied where tracked people enter the page: `app/market-intel/[id]/page.tsx` (both people lists) and `LiveDashboard.tsx`. Stored names are unchanged.

## 6. One name per outlet, on cards and pages

**Wrong.**
- Stored outlet names were cut at 32 characters mid-word ("Court of Appeals for the Federal").
- 34 stories carried a bare address ("pharma.economictimes.indiatimes.com") next to the same outlet's cleaned name.
- Some stories said "Not specified in search results".
- Cards showed raw addresses ("clinicaltrialvanguard.com:").
- A company's own site read "TCS.COM" on one story and "TCS" on the next.

**Changed.**
- New `lib/marketIntelText.ts`:
  - Now holds `cleanSourceLabel`, re-exported from `marketIntelFeed.ts` so every import still works.
  - It treats placeholders as "News" and cuts on a whole word at 48 characters.
  - Adds `outletName()`, the display rule: tidy bare addresses and placeholders, keep the name up to the first separator (`|`, `/`, `via`, `-`, `:`), end on a whole word with an ellipsis past 40 characters.
- `LiveCompanyBriefing.tsx` uses `outletName()` for article chips, the other-sources list and the table view. The full source is kept in the chip's `title`.
- Own-site chips always show the hostname (`siteSourceLabel`).
- `LiveCompanyCard.tsx` uses `outletName()` in the story ticker and top stories.
- **Addresses to names.** The old address rule dropped the last two parts of a host, so `finance.yahoo.com` became "Finance". One outlet showed as "Yahoo Finance" (532 stories), "finance.yahoo.com" (101) and "Finance" (34).
  - `cleanSourceLabel` now maps the 25 most common outlet hosts to the name most of their stored items already carry (`OUTLET_BY_HOST`). Any other address becomes its site label; `co.uk`-style suffixes are handled.
  - `outletName(label, url)` takes the story URL, and repairs a one-word name that is only a subdomain of that URL.
  - Tests: `scripts/qa/outlet-name.test.mts`.

## 7. M&A deals listed once

**Wrong.** The same deal appeared 2 to 3 times under paraphrased headlines (Precera x3). The old check deleted punctuation instead of spacing it and needed both target names to contain each other.

**Changed.**
- New `lib/marketIntelMnaDedupe.ts` exports `dedupeMnaDeals` and `isSameDeal`. Two reports are the same deal when the acquirers match, and either the targets match, or both reports are from the same day and their targets share a word of 4 or more letters.
- Used in `refreshMna` (`lib/marketIntelRefresh.ts`), replacing the inline filter, and on read in `MnaTracker.tsx`, so boards saved earlier are also clean. 21 rows became 19.
- `MnaTracker.tsx`: the "N deals" and "N publications" pills count the deduplicated deals and the English-titled publications, so they match the rows. The "All time" filter was the only grey chip in its row; the time options now use the same colours as the company page's range picker.

## 8. Rundowns never say "nothing available"

**Wrong.** Qserve's rundown read "No recent news items or LinkedIn posts available... unable to provide", above four of its own press releases.

**Changed.**
- New `lib/marketIntelRundown.ts` exports `usableRundown()`, which returns `null` for filler lines. It is applied in `summarizeCompany`, `buildBriefing`, both digest paths in `lib/marketIntelSummarize.ts`, and `applyDigest`, where an unusable stored rundown counts as missing.
- The digest prompt now includes the company's own website items ("THE COMPANY'S OWN WEBSITE, WHAT THEY PUBLISHED") and a rule that `tldr` is empty when there is nothing to say.
- `applyDigest` sets `tldr = null` and makes no model call when a company has no news, posts or site items.

## 9. "Why it matters" never stops mid-thought

**Changed.**
- `tidyLine` in `lib/marketIntelFeed.ts`: a line cut with an ellipsis ends on its last complete clause (`. `, `; ` or `: ` past 35% of the length).
- The classifier's `why` limit in `lib/marketIntelSummarize.ts` went from 170 to 240 characters, and the display trim from 170 to 240.

## 10. Competitors mentioned: whole words only

**Wrong.** "Thema" counted on GSK's page because a substring search found it inside other words.

**Changed.** `mentionMatcher()` in `lib/marketIntelFeed.ts`, used by `deriveSignals`:
- A match needs a letter or digit boundary on both sides.
- Multi-word names match in any case.
- One-word names need their own capitals, or the name in all caps.

## 11. Card ticker repeated one headline once per outlet

**Changed.** `summarizeCompany` keeps each normalised headline once (Lindus showed the same board appointment 4 times).

## 12. Dates

**Wrong.** Day-only dates stored as `YYYY-MM-DDT00:00:00.000Z` rendered as the day before at 8:00 PM for a New York reader. That hit every thought leadership item and most website items.

**Changed.**
- `lib/whenLabel.ts`: a midnight-UTC stamp is shown as a date with no time.
- `LiveCompanyBriefing.tsx`: the table view's When cell no longer wraps "Sep 13, 2026 ·" away from its time.

## 13. Thought Leadership: English titles only

**Changed.** `readableTitle()` in `lib/marketIntelText.ts` requires at least 60% Latin letters. It is applied in `scrapeFirmThoughtLeadership` and `mergeThoughtBoard` (`lib/marketIntelThought.ts`), and on read in `ThoughtLeadershipTracker.tsx` and `MnaTracker.tsx`. A PwC Thailand survey had shown in Thai.

## 14. Logos

**Wrong.** Some logos were a product banner (Cipla), an invisible white wordmark (Accenture), the stock WordPress icon (Pacific Bridge, ChemReach), or a customer's logo from a site's logo strip (Qualio would have shown GEFCO).

**Changed.** `lib/companyLogos.ts`:
- `logoLooksUsable()` rejects the stock WordPress icon (16x16 average hash), images wider than 1.8:1, and images that are under 4% visible.
- Applied to site candidates and the Google favicon fallback.
- `iconsDeclared()` only accepts a page `<img>` whose file name or alt text carries the company's own name, and never from carousel, client, customer, partner, award, badge, certification, trust or testimonial strips.

## 15. Refresh chip progress bar

**Changed.** `components/market-intel/NextRefresh.tsx`: the bar runs from the last refresh to the next one. It used to start at the day's batch time, so 8 minutes after a refresh it read 64%.

## 16. Top search shows Market Intel logos

**Changed.**
- `app/api/search/route.ts` adds `logoUrl` from the summaries.
- `components/layout/CommandPalette.tsx` renders `MiLogo` for Market Intel results.

## 17. Smaller fixes

- **`components/market-intel/ManageCompaniesButton.tsx`:** the sticky save bar stops before the chat bubble (`mr-[76px]`), and it says "1 company" instead of "1 companies".
- **`components/market-intel/DivisionChips.tsx`:** the division editor keeps the saved tags in local state. Before, the chips stayed stale until a reload, and editing again in that gap reopened the old tags and saved twice.
- **`LiveCompanyBriefing.tsx`:** removed the 600px minimum height on the Company details panel, which left a tall empty box for quiet companies. Layout menu tooltips read "List / Tiles / Table" instead of "rows / tiles / table".
- **`LiveCompanyCard.tsx`:** the "from them" chip always renders, so the four counts sit on one line on every card.
- **`CompanyAdminControls.tsx` and `ManageCompaniesButton.tsx`:** the "Delete for everyone?" detail repeated the body. It now says "This can't be undone."

## 18. Stored copies of the same story collapse on every website scan

**Wrong.** 97 extra copies of the same URL sat in 17 companies' stored lists (85 website, 12 news). Moderna had 27 website items for 4 pages. The page hid them, but they inflated `itemDates` (activity line, "busy this month") and each copy was labelled separately. `mergeNews` already dedupes, but both website scan paths only merged when the scan returned new items, so old copies never collapsed.

**Changed.** `lib/marketIntelRefresh.ts`: both website passes (the daily pass and `runSiteUpdatesRefreshLocked`) run `mergeNews` on the stored list even when a scan returns nothing new. Labels are still only requested for new items.

## 19. Website-only companies get a rundown

**Changed.** `lib/marketIntelRefresh.ts`: the rundown backfills (Pass 1c and the rundown-only run) skipped companies with no news or posts, so a company whose only items are its own website updates could never get a rundown. They now count `site` too, matching fix 8.

## 20. Titles are cut on whole characters (hydration error)

**Wrong.** `p.text.split("\n")[0].slice(0, 160)` could split an emoji's surrogate pair. The server serialised the lone half as U+FFFD and the browser kept it, so React logged "A tree hydrated but some attributes... didn't match" (seen on Science 37 and Worldwide Clinical Trials, in the remove-story `aria-label`).

**Changed.** New `clipText()` in `lib/marketIntelText.ts` cuts by code points. It is used for the post title in `LiveCompanyBriefing.tsx` and the signal title in `deriveSignals` (`lib/marketIntelFeed.ts`).

## 21. Untitled stories get a title from their address

**Wrong.** A news item stored with an empty title rendered as a blank link.

**Changed.** New `titleFromUrl()` in `lib/marketIntelText.ts` uses the last readable path segment. It is used for news and site items in `LiveCompanyBriefing.tsx` (the article card now renders `item.title`) and for `summarizeCompany` stories.

## 22. Dialogs name the right Manage page

**Wrong.** Three messages pointed to "Manage companies", a label that appears nowhere on screen.

**Changed.**
- **`MyListToggle.tsx`:** takes a `group` prop, passed from `LiveCompanyBriefing.tsx` and `app/market-intel/[id]/page.tsx`. "Stop tracking?" now says "add it again from Manage customers" (or competitors).
- **`TrackCompanyButton.tsx`:** the error says "Check Manage customers/competitors".
- **`WatchStatus.tsx`:** the hint says "Tick it on the Manage page".

## 23. A failing LinkedIn pull no longer blocks the daily queue (please review)

**Wrong.** In the rotation (`runMarketIntelRefresh`, oldest `fetchedAt` first), a company whose posts pull fails while its news succeeds keeps its old `fetchedAt` (set in `ec075e74`). It therefore stays first in the queue and is pulled again on every 30-minute tick. DDi and J&J MedTech have sat there since Sep 10, and each tick they take the run's time before the companies behind them. On dev, 124 companies with a LinkedIn page had not been collected in the current cycle when checked.

**Changed.**
- `FeedCompany` gains `postsFailedAt`. The rotation sets it when the posts pull fails, and skips a company whose `postsFailedAt` is in the current cycle, so it is tried once per daily cycle.
- `fetchedAt` semantics are unchanged: "Updated" still only moves when posts do.
- The both-failed path still retries on the next tick, as before.

---

## Changes made to the dev database (not code)

Done with scripts in `scripts/qa` (gitignored). No paid calls. Each script backs up rows first, writes conditionally on `updated_at`, and skips while a collection run holds `market-intel:refresh-lock`.

1. **Company summaries rebuilt, twice:**
   - First pass (118 rows): counts recomputed after the relevance filter, and 11 filler rundowns cleared. `scripts/qa/rebuild-mi-summaries.mts`.
   - Second pass (all 204 rows): adds `shown`. Stored counts, rundowns and signals were unchanged.
   - Backups: `mi-company-rows-before-summary-rebuild-*.json` in Claude's scratchpad.
2. **Person summaries (133 rows):** `postMinutes` added (`scripts/qa/rebuild-person-summaries.mts`). Backup: `mi-person-rows-before-summary-rebuild-*.json`.
3. **Duplicates collapsed (17 company rows):** `scripts/qa/dedupe-stored-items.mts` ran the merge's own `dedupeCompanyNews` over stored `site` and `news`, then refreshed each summary. Backup: `mi-company-rows-before-dedupe-*.json`.
4. **Logos:** 16 company logos replaced or cleared, plus the matching tracking-row entries (`scripts/qa/recompute-mi-logos.mts`).
5. **Orphan row:** removed `market-intel-company:cure-media`, which a run had written back after the company was deleted.
6. **Test writes, all restored and checked:** a rep list save and undo, Qserve's divisions add and remove, Galderma's story removal, and a rep tracking, starring, unstarring and untracking GSK.

**Mixed-version effect.** Deployed dev (`b49e97d`) writes summaries without `shown`/`postMinutes`, so any row it rewrites falls back to old counts on localhost until this code is deployed.

## Found but not changed (need a decision)

- **The daily collection cannot finish, and people are never reached.** From the durable actor rows (`market-intel:actor:*`) and company `fetchedAt` values:
  - The rotation completes about 2 companies an hour. Sep 13: gideon 13:57, roche 14:01, sanofi 14:27, astrazeneca 14:53, boehringer 15:52, teva 16:00... Some take 25 to 30 minutes from posts request to `fetchedAt` (sun-pharma 18:54 to 19:24, moderna 19:56 to 20:22).
  - About 124 companies with LinkedIn pages are due each cycle.
  - The people pass runs after the company loop and stops on `overBudget()` (`runExpired` at 18 minutes). There is no `linkedin-profile-posts` run in the actor store since the new pipeline shipped, and all 133 followed people are stale: 22 last collected Aug 12, 39 Aug 30, 33 Sep 8, 38 Sep 10.
  - Likely fixes, each a product and spend decision: give people their own job or a reserved slice at the start of each run; move labelling and digest out of the per-company loop into a later pass; or process companies in parallel.
  - Separately, J&J MedTech's slug is stored as `johnson-%26-johnson-medtech` and the actor answers "No posts found or wrong input".
- **Lindus (`lindus-7607f9cf`):** website lindushealth.com, but LinkedIn `lindustx`, which is Lindus Therapeutics (its first stored post welcomes a director to "the Lindus Therapeutics board"). Posts, logo and 9 of 16 stories are about Lindus Therapeutics or a "Lindus Maintenance" home-repair radio show. Needs the right LinkedIn link.
- **Cactus:** slug `cactus-communications` resolves to the author "Paperpal", Cactus's AI writing app. 20 posts about students and AI, plus Paperpal's logo.
- **No division:** 33 competitors, mostly software vendors (Calyx, Certara, Cortellis, DDi, Ennov, EXTEDO...). They only appear under "Untagged" in division filters. Needs Saras's tags.
- **No real logo:** Cipla, Greenlight Guru, CIRS, Operon Strategist, Michor Consulting, REACH24H and ChemReach still show a generated mark. DDi's stored logo is an expired LinkedIn CDN link and it has no website on file.
- **No stored photo:** 43 tracked people. The daily paid retry covers them.
- **Wrong-company news:** possible for ambiguous names (Lindus Therapeutics vs Lindus Maintenance). Fixing it needs a verification prompt change plus a paid relabel.
- **Delete race:** a collection run already in progress can write a just-deleted company's row back. A guard in `saveFeedCompany` was tried and backed out, because onboarding writes the feed row before the tracking row and it broke `tests/market-intel-onboarding*` and track-flow tests.
- **Signal counts:** a card's "signals" counts items with a named signal. The page's "All signals" chip counts every item, including Others. Different definitions, so the numbers differ.
- **Local server:** it arms the same collection timers as dev (`instrumentation-node.ts`). It ran one website scan while testing ($0.011).
