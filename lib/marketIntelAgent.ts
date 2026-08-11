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
  peopleLines: string[]
): string {
  const signals = buildBriefing(
    company,
    Object.values(feed.companies).map((c) => ({ id: c.id, name: c.name }))
  ).signals;
  const posts = [...company.posts]
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .slice(0, 6);
  const news = [...company.news]
    .sort(
      (a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)
    )
    .slice(0, 8);
  return [
    `TRACKED COMPANY: ${company.name} (${company.group === "competitor" ? "competitor" : "customer"} bucket, /market-intel/${company.id})`,
    company.author?.followerCount != null &&
      `LinkedIn followers: ${company.author.followerCount.toLocaleString("en-US")}`,
    company.tldr && `AI rundown: ${company.tldr}`,
    "",
    `Latest LinkedIn posts (${company.posts.length} collected, newest ${posts.length} shown):`,
    ...posts.map((p) => `- [${fmtDate(p.date)}] ${trim(p.text, 280)}`),
    "",
    `Latest news (${company.news.length} collected, newest ${news.length} shown):`,
    ...news.map(
      (n) =>
        `- [${fmtDate(n.published)}] ${n.source}: ${n.title}${n.summary ? ` — ${trim(n.summary, 200)}` : ""}`
    ),
    "",
    signals.length &&
      `Signals detected: ${signals
        .slice(0, 8)
        .map((s) => `${s.title} (${s.kind}, ${fmtDate(s.date)})`)
        .join("; ")}`,
    peopleLines.length && `People followed here:\n${peopleLines.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function searchMarketIntel(query: string): Promise<string> {
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
      .map(
        (p) =>
          `- ${p.name}, ${p.role || "tracked person"} (${feed.people[p.id]?.posts.length ?? 0} posts collected)`
      );

  // Deals asked for by name get the whole board.
  if (/\bm\s*&\s*a\b|merger|acquisition|acquire|deal/.test(q)) {
    const deals = feed.mna?.items ?? [];
    if (deals.length) {
      return [
        `M&A TRACKER (${deals.length} deals, /market-intel?tab=market):`,
        ...deals.map(
          (d) =>
            `- ${d.acquirer} → ${d.target} (${d.status}, ${d.division}${d.valueLabel ? `, ${d.valueLabel}` : ""}, ${fmtDate(d.date)}): ${trim(d.summary, 180)} [source: ${d.sourceLabel}]`
        ),
      ].join("\n");
    }
  }

  // A named tracked company gets its complete record.
  const named = companies.find((c) => {
    const name = c.name.toLowerCase();
    return q.includes(name) || name.split(/\s+/).some((part) => part.length >= 4 && q.includes(part));
  });
  if (named) return companyBlock(feed, named, peopleLinesFor(named.id));

  // A tracked person's name resolves to their posts.
  const person = tracking.people.find((p) => q.includes(p.name.toLowerCase()));
  if (person) {
    const posts = feed.people[person.id]?.posts ?? [];
    const companyName = feed.companies[person.companyId]?.name ?? person.companyId;
    return [
      `TRACKED PERSON: ${person.name}, ${person.role || "role unknown"} at ${companyName} (${posts.length} posts collected)`,
      ...posts
        .slice(0, 5)
        .map((p) => `- [${fmtDate(p.date)}] ${trim(p.text, 280)}`),
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
          line: `- [${fmtDate(n.published)}] ${company.name} news, ${n.source}: ${n.title}`,
        });
    }
    for (const p of company.posts) {
      if (words.some((w) => p.text.toLowerCase().includes(w)))
        hits.push({
          when: Date.parse(p.date ?? "") || 0,
          line: `- [${fmtDate(p.date)}] ${company.name} LinkedIn post: ${trim(p.text, 200)}`,
        });
    }
    for (const s of companySignals) {
      if (words.some((w) => s.title.toLowerCase().includes(w)))
        hits.push({
          when: Date.parse(s.date ?? "") || 0,
          line: `- [${fmtDate(s.date)}] ${company.name} signal (${s.kind}): ${s.title}`,
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
