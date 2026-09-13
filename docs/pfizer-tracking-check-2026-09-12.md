# Pfizer tracking check — September 12, 2026

Tested in actual Chrome at localhost:3006 against the verified development
Supabase project ebyoefeikqxxxxifgjxk. One app tab; one temporary official-source
tab, subsequently closed. No production writes or deployment.

Submitted Pfizer, pfizer.com, linkedin.com/company/pfizer, MPR through the
Track Company form. The modal closed and the persisted loading card survived
a reload. First collection failed: the company feed started with a repost by
Albert Bourla, and the collector used the first post author as company identity.

Fixed generic company-author selection by matching the requested LinkedIn
company slug. Person and unrelated-company repost authors cannot establish
company identity. Reposts remain in the feed. Paid probe costs now persist
before identity validation can throw. Retried the same saved company,
pfizer-8d31826f, through Chrome; the card automatically became the company card.

The first briefing contained 109 accepted news items and 142 pending candidates.
The fixed eight-batch initial classification budget was too small. Initial
classification now sizes its budget to the collected items. Processed Pfizer's
saved backlog without another scrape: 163 items labeled, 39 model calls,
272,224 input / 19,272 output tokens, 58 seconds. Final persisted result:
8 LinkedIn posts, 210 accepted news items with source URLs, 13 website updates,
zero pending news. Logo is mirrored to dev storage. This does not establish
exhaustive coverage of every publication or human validation of all 210 items.
The initial scrape/briefing took about ten minutes; latency remains a limitation.

Opened Pfizer's XFG vaccine announcement in Chrome, verified its August 27,
2026 publication date and the official footer's company LinkedIn URL. Confirmed
Tracking selected, company logo, source filter controls, article links, and the
shared next daily refresh (~2 AM local) on the completed briefing.

UI follow-ups: stronger blue-tinted shimmer and explicit Collecting updates
label on pending cards; all four Market Intel summary tiles use a single-line
caption and matching structure. Typecheck, four targeted identity/onboarding
regressions and diff whitespace checks passed.

Decision-maker discovery was suggested by the user, but has not been implemented
or represented as part of this company collection test.
