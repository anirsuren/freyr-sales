import { SIGNAL_META } from "./marketIntelSignals";
import {
  buildBriefing,
  readMarketIntelFeed,
  type FeedCompany,
  type MarketIntelFeed,
} from "@/lib/marketIntelFeed";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";

/**
 * THE ASSISTANT'S WINDOW INTO MARKET INTEL (Anir, Aug 11: "make sure the AI
 * works and that it knows everything, every single page"). The dock's brain
 * had no route into the live feed, so on a company briefing it swore the
 * workspace held nothing but offerings. This is the search_market_intel tool:
 * given a plain question it returns the matching slice of the live feed as
 * grounded text — a whole company record when one is named, keyword hits
 * across posts/news/signals otherwise, and the M&A board when deals are the
 * subject. Everything it returns carries dates and sources so the model can
 * cite instead of invent.
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "undated";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function trim(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function companyBlock(
  feed: MarketIntelFeed,
  company: FeedCompany,
  peopleLines: string[],
  since: number | null = null
): string {
  const signals = buildBriefing(
    company,
    Object.values(feed.companies).map((c) => ({ id: c.id, name: c.name }))
  ).signals;
  const inWindow = (date: string | null | undefined) => since === null || (Date.parse(date ?? "") >= since && Date.parse(date ?? "") <= Date.now());
  const windowPosts = company.posts.filter(p => inWindow(p.date));
  const windowNews = company.news.filter(n => inWindow(n.published));
  const windowSite = (company.site ?? []).filter(n => inWindow(n.published));
  const posts = [...windowPosts]
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .slice(0, 100);
  const news = [...windowNews]
    .sort(
      (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
    )
    .slice(0, 100);
  const site = [...windowSite]
    .sort((a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0))
    .slice(0, 100);
  let remainingEvidence = 60000;
  const sourceEvidence = (item: {articleText?: string; articleTextPartial?: boolean; excerpt?: string}) => {
    const body = item.articleText || item.excerpt;
    if (!body || remainingEvidence <= 0) return " [Original article text unavailable in this result; summary alone cannot establish detailed terms.]";
    const limit = Math.min(6000, remainingEvidence);
    const text = body.replace(/\s+/g, " ").trim();
    const excerpt = text.slice(0, limit);
    remainingEvidence -= excerpt.length;
    return `\n  Publisher evidence${item.articleTextPartial || text.length > limit || !item.articleText ? " (partial)" : ""}: ${excerpt}`;
  };
  return [
    since !== null && `DATE SCOPE: ${new Date(since).toISOString()} through ${new Date().toISOString()}. Matching stored counts: ${windowPosts.length} company posts, ${windowNews.length} outside news articles, ${windowSite.length} website updates. Only dated records in this window are included below.`,
    `Evidence limits: Stored AI summaries are secondary. Use publisher evidence when included, preserving its limitations over any conflicting summary. Partial evidence is not a complete article. Preserve qualifications and technical terminology exactly; do not infer territories, approval indications, transaction completion or mechanisms absent from the supplied text. Dates label publication, not necessarily the event date. If a term is missing, omit it or say it is not specified here.
Coverage: Counts describe matching stored records within DATE SCOPE when supplied; otherwise all stored dates. Filter by each item's date before answering. A displayed sample is never the total for a period. Undated items cannot establish a date-window count. Stored coverage does not establish that every published item was collected.`,
    `Last recorded collection timestamps: LinkedIn ${company.fetchedAt || "unknown"}; news ${company.newsAt || "unknown"}; website ${company.siteAt || "unknown"}. Per-company last-attempt status and error history are not included in this record. You cannot determine whether a later attempt failed. Recent stored posts do not rule out a later failure; an absence of newer articles does not prove none were published. If asked whether sources failed, state that status is unavailable, rather than diagnosing normal cadence or a healthy source.`,
    `TRACKED COMPANY: [${company.name}](/market-intel/${company.id}) (${company.group === "competitor" ? "competitor" : "customer"} bucket; use this briefing link for news/post answers)`,
    company.author?.followerCount != null &&
      `LinkedIn followers: ${company.author.followerCount.toLocaleString("en-US")}`,

    "",
    `Latest LinkedIn posts (${windowPosts.length} matching records, newest ${posts.length} shown):`,
    ...posts.map((p) => `- [${fmtDate(p.date)}] ${trim(p.text, 280)} [Source](${p.url})`),
    "",
    `Latest news (${windowNews.length} matching records, newest ${news.length} shown):`,
    ...news.map(
      (n) =>
        `- [${fmtDate(n.published)}] ${n.source}: ${n.title}${n.summary && n.articleText ? ` — Stored summary (secondary to publisher text): ${n.summary.replace(/\s+/g, " ").trim()}` : ""} [Source](${n.url})${sourceEvidence(n)}`
    ),
    "",
    `Company website updates (${windowSite.length} matching records, newest ${site.length} shown):`,
    ...site.map(n => `- [${fmtDate(n.published)}] ${n.title}${n.summary && n.articleText ? ` — Stored summary (secondary to publisher text): ${n.summary.replace(/\s+/g, " ").trim()}` : ""} [Source](${n.url})${sourceEvidence(n)}`),
    "",
    /* Every item carries a signal since Sep 11; "Others" is not worth naming here. */
    signals.some((s) => s.kinds[0] !== "others") &&
      `Signals detected: ${signals
        .filter((s) => s.kinds[0] !== "others" && inWindow(s.date))
        .slice(0, 8)
        .map((s) => `${s.title} (${s.kinds.map((kind) => SIGNAL_META[kind].label).join(", ")}, ${fmtDate(s.date)})`)
        .join("; ")}`,
    peopleLines.length && `People followed here (use each exact supplied profile URL and stored name for profile links; never derive or rewrite a profile URL from a post slug; recency refers only to stored posts, not proof of the person's actual activity):\n${peopleLines.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function searchMarketIntel(query: string, question = query): Promise<string> {
  const days = question.match(/\b(?:past|last)\s+(\d+)\s+days?\b/i);
  const since = days ? Date.now() - Math.min(3650, Number(days[1])) * 86400000 : null;
  const [feed, tracking] = await Promise.all([
    readMarketIntelFeed().catch(() => null),
    readMarketIntelTracking().catch(() => ({ companies: [], people: [] })),
  ]);
  if (!feed || Object.keys(feed.companies).length === 0) {
    return "The Market Intelligence feed has no data yet (first refresh pending).";
  }

  const q = query.toLowerCase();
  const words = q.split(/[^a-z0-9&]+/).filter((w) => w.length >= 3);
  const companies = Object.values(feed.companies);

  const peopleLinesFor = (companyId: string) =>
    tracking.people
      .filter((p) => p.companyId === companyId)
      .map(p => {
        const posts = [...(feed.people[p.id]?.posts ?? [])].sort((a,b)=>(Date.parse(b.date??"")||0)-(Date.parse(a.date??"")||0));
        const recent = posts.filter(post => since === null || Date.parse(post.date??"") >= since);
        return `- [${p.name}](${p.linkedinUrl}), ${p.role || "tracked person"}: ${posts.length} stored posts across all dates; latest ${posts[0]?.date || "unknown/no dated post"}.\n` + recent.slice(0,3).map(post=>`  [${fmtDate(post.date)}] ${trim(post.text,200)} [Post](${post.url})`).join("\n");
      });

  // Deals asked for by name get the whole board.
  if (/\bm\s*&\s*a\b|merger|acquisition|acquire|deal/.test(q)) {
    const deals = feed.mna?.items ?? [];
    if (deals.length) {
      return [
        `M&A records may include reported or rumored deals; preserve uncertainty from summaries rather than treating a status as independent verification. M&A TRACKER (${deals.length} deals, /market-intel?tab=market):`,
        ...deals.map(
          (d) =>
            `- ${d.acquirer} → ${d.target} (${d.status}, ${d.division}${d.valueLabel ? `, ${d.valueLabel}` : ""}, ${fmtDate(d.date)}): ${trim(d.summary, 180)} [${d.sourceLabel}](${d.sourceUrl})`
        ),
      ].join("\n");
    }
  }

  // A named tracked company gets its complete record.
  const normalized = ` ${q.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const exact = companies.filter(c => {
    const name = c.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return name && normalized.includes(` ${name} `);
  }).sort((a,b) => b.name.length-a.name.length);
  const partial = companies.filter(c => c.name.toLowerCase().split(/\s+/).some(part => part.length >= 4 && normalized.includes(` ${part} `)));
  const named = exact[0] ?? (partial.length === 1 ? partial[0] : undefined);
  if (named) return companyBlock(feed, named, peopleLinesFor(named.id), since);

  // A tracked person's name resolves to their posts.
  const person = tracking.people.find((p) => q.includes(p.name.toLowerCase()));
  if (person) {
    const posts = feed.people[person.id]?.posts ?? [];
    const companyName = feed.companies[person.companyId]?.name ?? person.companyId;
    return [
      `TRACKED PERSON: ${person.name}, ${person.role || "role unknown"} at ${companyName} (${posts.length} posts collected)`,
      ...posts
        .slice(0, 5)
        .map((p) => `- [${fmtDate(p.date)}] ${trim(p.text, 280)} [Source](${p.url})`),
    ].join("\n");
  }

  // Otherwise: keyword hits across every company's posts, news and signals.
  if (!words.length) {
    return [
      `MARKET INTEL OVERVIEW: ${companies.length} tracked companies (${companies.filter((c) => (c.group ?? "customer") === "customer").length} customers, ${companies.filter((c) => c.group === "competitor").length} competitors), ${feed.mna?.items.length ?? 0} M&A deals.`,
      `Companies: ${companies.map((c) => c.name).join(", ")}`,
    ].join("\n");
  }
  const hits: { when: number; line: string }[] = [];
  const allNames = companies.map((c) => ({ id: c.id, name: c.name }));
  for (const company of companies) {
    const companySignals = buildBriefing(company, allNames).signals;
    for (const n of company.news) {
      const hay = `${n.title} ${n.summary ?? ""} ${n.source}`.toLowerCase();
      if (words.some((w) => hay.includes(w)))
        hits.push({
          when: Date.parse(n.published ?? "") || 0,
          line: `- [${fmtDate(n.published)}] ${company.name} news, ${n.source}: ${n.title} [Source](${n.url})`,
        });
    }
    for (const p of company.posts) {
      if (words.some((w) => p.text.toLowerCase().includes(w)))
        hits.push({
          when: Date.parse(p.date ?? "") || 0,
          line: `- [${fmtDate(p.date)}] ${company.name} LinkedIn post: ${trim(p.text, 200)} [Source](${p.url})`,
        });
    }
    for (const s of companySignals.filter((signal) => signal.kinds[0] !== "others")) {
      if (words.some((w) => s.title.toLowerCase().includes(w)))
        hits.push({
          when: Date.parse(s.date ?? "") || 0,
          line: `- [${fmtDate(s.date)}] ${company.name} signal (${s.kinds.map((kind) => SIGNAL_META[kind].label).join(", ")}): ${s.title} [Company briefing](/market-intel/${company.id})`,
        });
    }
  }
  if (!hits.length) {
    return `Nothing in the Market Intel feed matches "${query}". Tracked companies: ${companies
      .map((c) => c.name)
      .join(", ")}.`;
  }
  return [
    `MARKET INTEL MATCHES for "${query}" (newest first):`,
    ...hits
      .sort((a, b) => b.when - a.when)
      .slice(0, 12)
      .map((h) => h.line),
  ].join("\n");
}
