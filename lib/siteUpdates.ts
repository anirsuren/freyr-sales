import { cleanSourceLabel, type FeedNews } from "./marketIntelFeed";
import type { CompanySource } from "./marketIntelSources";

/**
 * WHAT THE COMPANY SAYS ABOUT ITSELF.
 *
 * Anir, Aug 28: "in Market Intel > Customer Intel / Competitor Intel, can
 * you add updates from their respective official websites as well? The
 * sources currently being covered are news outlets and LinkedIn."
 *
 * The two existing sources are both second-hand: a reporter's account of an
 * event, or a marketing post. A company's own newsroom is the primary
 * record — the announcement before anybody wrote it up, plus the things
 * trade press never covers (a quiet leadership page change, a new plant, a
 * regulatory filing note). For a sales team walking into a meeting, "it is
 * on their site" is the strongest form of "this is real".
 *
 * SAME MACHINERY AS THE NEWS PASS, one hard difference: `search_domain_filter`
 * pins the search to the company's own domain, and every returned host is
 * checked against that domain again on the way in. Perplexity's filter is a
 * ranking instruction, not a guarantee, so the check is what actually keeps
 * a competitor's press release off a customer's card.
 *
 * TRUST SPLIT, one notch stricter than perplexityNews: the model decides
 * which pages are real updates (a newsroom is full of navigation stubs,
 * cookie pages and evergreen "about us" copy) and writes the one-line
 * summary. The HEADLINE, the URL and the date all come from the cited
 * search result.
 *
 * The headline moved to the result on evidence, not principle. Probing
 * rimsys.io by hand the model returned "Rimsys Announces Rimsys AI to
 * Eliminate Repetitive Tasks" pointed at a URL whose real title was "To
 * build or to buy: evaluating options for Regulatory Information
 * Management" — a headline and a link that describe different pages, which
 * is worse than no row at all. Taking the title from the same object as the
 * URL makes that class of mismatch impossible.
 */

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
/** $5/1k searches plus a few hundred tokens of sonar, when the response
 *  omits its own cost breakdown. */
const FALLBACK_COST_USD = 0.006;
/**
 * A newsroom is not a news wire: most companies post a handful of times a
 * month, so a month-wide window is what makes this column non-empty. Older
 * than that and it is not an update, it is the archive.
 */
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 6;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          summary: { type: "string" },
          sourceIndex: { type: "integer" },
        },
        required: ["sourceIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You read a company's OWN website and report what it has published about itself. From your search results pick only real updates the company posted: press releases, news items, product or service launches, partnerships, results, leadership appointments, event appearances, regulatory milestones. Never include navigation pages, contact or careers index pages, cookie or privacy notices, generic 'about us' copy, or product catalogue pages with no announcement in them. If nothing on the site is a real update, return an empty list; an empty list is a good answer. Plain text only, no markdown.";

/** "takeda.com" from anything a person might have typed into Website. */
export function normalizeSiteDomain(raw: string | undefined | null): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let host = text;
  try {
    host = new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./i, "").toLowerCase();
  // A bare word ("takeda") is not a domain, and searching one would return
  // the whole web under a filter that silently matches nothing.
  if (!host.includes(".")) return null;
  return host;
}

/** Does this URL actually live on the company's own domain? Subdomains count
 *  (news.roche.com, media.gsk.com); look-alikes do not (takeda.com.cn.evil). */
export function hostBelongsToSite(url: string, domain: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return false;
  }
  const site = domain.replace(/^www\./i, "").toLowerCase();
  return host === site || host.endsWith(`.${site}`);
}

export type SiteUpdatesResult = { updates: FeedNews[]; cost: number; failed: boolean };

export async function scrapeSiteUpdates(
  source: Pick<CompanySource, "name" | "site">,
  key: string | undefined
): Promise<SiteUpdatesResult> {
  const domain = normalizeSiteDomain(source.site);
  // No domain on file is not a failure: the company simply has no website
  // column, which is the honest answer and costs nothing.
  if (!key || !domain) return { updates: [], cost: 0, failed: false };

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Recent updates published by ${source.name} on their own website ${domain}: press releases, announcements, launches, partnerships, appointments. For each one give a one-sentence summary and sourceIndex = the 1-based position of the search result it comes from. Prefer English-language pages when the site offers both.`,
      },
    ],
    search_domain_filter: [domain],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "low" },
    response_format: { type: "json_schema", json_schema: { schema: RESPONSE_SCHEMA } },
    max_tokens: 700,
  };

  // One retry, same as the news pass: these APIs flake intermittently and a
  // single hiccup should not cost a company its website column for the day.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`perplexity HTTP ${res.status}`);
      const data = await res.json();
      const cost =
        typeof data?.usage?.cost?.total_cost === "number"
          ? data.usage.cost.total_cost
          : FALLBACK_COST_USD;
      const results: any[] = Array.isArray(data?.search_results)
        ? data.search_results
        : [];
      let parsed: any = null;
      try {
        parsed = JSON.parse(
          String(data?.choices?.[0]?.message?.content ?? "").replace(
            /^```(?:json)?|```$/g,
            ""
          )
        );
      } catch {
        throw new Error("perplexity returned unparseable JSON");
      }
      const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
      const seen = new Set<string>();
      const updates: FeedNews[] = [];
      for (const item of items) {
        const hit = results[Number(item?.sourceIndex) - 1];
        const url = typeof hit?.url === "string" ? hit.url : null;
        // The page's OWN title, so the words and the link always match.
        const title = String(hit?.title ?? "")
          .replace(/\s*\|.*$/, "")
          .replace(/\s*[–-]\s*[^–-]{0,40}$/, (tail) =>
            /\b(news|press|release|newsroom)\b/i.test(tail) ? "" : tail
          )
          .replace(/\*+/g, "")
          .trim();
        if (!url || !title) continue;
        // THE CHECK THAT MAKES THIS SOURCE MEAN ANYTHING. Without it the
        // column would quietly become "news again, sometimes".
        if (!hostBelongsToSite(url, domain)) continue;
        const dated =
          Date.parse(hit?.date ?? "") || Date.parse(hit?.last_updated ?? "");
        if (dated && Date.now() - dated > MAX_AGE_MS) continue;
        const dedupe = title.toLowerCase();
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        updates.push({
          title: title.slice(0, 200),
          // The label is the company's own domain, so the card can say where
          // this came from without pretending a publication wrote it.
          source: cleanSourceLabel(domain),
          url,
          published: dated ? new Date(dated).toISOString() : null,
          summary: String(item?.summary ?? "").trim().slice(0, 400) || undefined,
        });
        if (updates.length >= MAX_ITEMS) break;
      }
      return { updates, cost, failed: false };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  console.error(
    `[market-intel] site updates failed for "${source.name}": ${lastError instanceof Error ? lastError.message : lastError}`
  );
  return { updates: [], cost: 0, failed: true };
}


/**
 * WHERE A NEW COMPANY'S DOMAIN COMES FROM.
 *
 * The Track a company form asks for one thing, a LinkedIn page (Anir,
 * Aug 11: "it just asks me for the link, and you pull everything else"), so
 * a company added today has no website on file and would silently miss this
 * whole source (Anir, Aug 28: "if someone enters a new company it has to
 * work too"). One cheap search resolves it at add time.
 *
 * TWO GUARDS, because a wrong domain is far worse than no domain — it would
 * file another company's press releases under this name:
 *  1. The domain comes from a SEARCH RESULT's URL, never from the model's
 *     prose, so it cannot be invented.
 *  2. The domain's own label must share a real token with the company name,
 *     the same doctrine as the LinkedIn `expect` check. "Lonza" may resolve
 *     to lonza.com, never to lonza-fanpage.net or to some other firm.
 * Anything that fails either guard resolves to null, and null simply means
 * no website column.
 */
const DOMAIN_JUNK =
  /linkedin\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|wikipedia\.org|bloomberg\.com|crunchbase\.com|zoominfo\.com|glassdoor\.|indeed\.|reuters\.com|pitchbook\.com|dnb\.com/i;

/** "dr-reddys-laboratories" and "Dr. Reddy's" both reduce to "drreddys". */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Does this domain plausibly belong to a company with this name? */
export function domainMatchesName(domain: string, name: string): boolean {
  const label = squash(domain.split(".")[0]);
  if (!label) return false;
  const whole = squash(name);
  if (whole.startsWith(label) || label.startsWith(whole)) return true;
  // Or any single meaningful word of the name ("Boehringer Ingelheim" ->
  // boehringer-ingelheim.com, "Sun Pharma" -> sunpharma.com).
  return name
    .split(/[\s&,]+/)
    .map(squash)
    .filter((word) => word.length >= 4)
    .some((word) => label.includes(word) || word.includes(label));
}

export async function resolveOfficialDomain(
  name: string,
  key: string | undefined
): Promise<{ domain: string | null; cost: number }> {
  if (!key || !name.trim()) return { domain: null, cost: 0 };
  const body = {
    model: "sonar",
    messages: [
      {
        role: "system",
        content:
          "You identify a company's official website. Answer with the 1-based position of the search result that is the company's OWN site (not LinkedIn, Wikipedia, Crunchbase, a news article or a directory). If none of the results is the company's own site, answer 0.",
      },
      {
        role: "user",
        content: `Official company website of ${name}. Reply with only the number.`,
      },
    ],
    web_search_options: { search_context_size: "low" },
    max_tokens: 20,
  };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`perplexity HTTP ${res.status}`);
    const data = await res.json();
    const cost =
      typeof data?.usage?.cost?.total_cost === "number"
        ? data.usage.cost.total_cost
        : FALLBACK_COST_USD;
    const results: any[] = Array.isArray(data?.search_results) ? data.search_results : [];
    const index = Number(
      String(data?.choices?.[0]?.message?.content ?? "").match(/\d+/)?.[0] ?? 0
    );
    const hit = index > 0 ? results[index - 1] : null;
    const domain = normalizeSiteDomain(hit?.url);
    if (!domain || DOMAIN_JUNK.test(domain) || !domainMatchesName(domain, name)) {
      return { domain: null, cost };
    }
    return { domain, cost };
  } catch (error) {
    console.error(
      `[market-intel] domain lookup failed for "${name}": ${error instanceof Error ? error.message : error}`
    );
    return { domain: null, cost: 0 };
  }
}
