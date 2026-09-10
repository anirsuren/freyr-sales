import type { ThoughtBoard, ThoughtItem } from "./marketIntelFeed";

/**
 * THE THOUGHT-LEADERSHIP TRACKER (Anant via Saras, Sep 10: "another tracker
 * which would give us thought leadership content from just general large
 * consulting firms like Gartner, or even, say, Deloitte... when they release
 * any large thought leadership content, reports, or studies regarding the
 * healthcare industry, pharma industry, or regulatory industry").
 *
 * Same machinery as the website pass: one Perplexity search per firm, pinned
 * to the firm's own domain so a report is a report the firm published, and
 * every host checked against that domain again on the way in. The model
 * picks the real publications out of the search results and names the topic
 * and the type; the title, the link and the date come from the cited result,
 * so a headline can never point at a different page.
 *
 * Ten firms, once a day, about six cents a run.
 */
export type ThoughtFirm = { name: string; domain: string };

export const THOUGHT_FIRMS: ThoughtFirm[] = [
  { name: "Gartner", domain: "gartner.com" },
  { name: "Deloitte", domain: "deloitte.com" },
  { name: "McKinsey", domain: "mckinsey.com" },
  { name: "BCG", domain: "bcg.com" },
  { name: "Bain", domain: "bain.com" },
  { name: "EY", domain: "ey.com" },
  { name: "PwC", domain: "pwc.com" },
  { name: "KPMG", domain: "kpmg.com" },
  { name: "Accenture", domain: "accenture.com" },
  { name: "IQVIA Institute", domain: "iqvia.com" },
];

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const FALLBACK_COST_USD = 0.006;
/** Reports live for months; a quarter-wide window keeps the board full. */
const MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_ITEMS_PER_FIRM = 8;
export const THOUGHT_ROWS_KEPT = 80;

const TOPICS: ThoughtItem["topic"][] = [
  "Medicinal Products",
  "Medical Devices",
  "Consumer",
  "Regulatory",
  "Life sciences",
];
const TYPES: ThoughtItem["type"][] = [
  "report",
  "study",
  "survey",
  "outlook",
  "article",
  "webinar",
  "podcast",
];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          summary: { type: "string" },
          topic: { type: "string", enum: TOPICS },
          type: { type: "string", enum: TYPES },
          sourceIndex: { type: "integer" },
        },
        required: ["summary", "topic", "type", "sourceIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You read a consulting or analyst firm's own website and pick out the THOUGHT LEADERSHIP it has published about the life-sciences world: reports, studies, surveys, outlooks, white papers, long-form articles, webinars and podcasts about the pharmaceutical or biotech industry, medical devices and diagnostics, consumer health, or regulatory affairs, compliance and quality. Skip press releases about the firm itself, job pages, event registrations, service brochures, navigation pages and anything not about those industries. Name the topic: Medicinal Products (pharma, biotech, drugs), Medical Devices (devices, diagnostics, medtech), Consumer (consumer health, OTC, cosmetics, food), Regulatory (regulation, compliance, quality, market access), or Life sciences (the industry broadly). Name the type. If nothing qualifies, return an empty list; an empty list is a good answer. Plain text only, no markdown.";

function hostBelongs(url: string, domain: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

export type ThoughtScrapeResult = { items: ThoughtItem[]; cost: number; failed: boolean };

export async function scrapeFirmThoughtLeadership(
  firm: ThoughtFirm,
  key: string | undefined
): Promise<ThoughtScrapeResult> {
  if (!key) return { items: [], cost: 0, failed: false };
  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Recent thought leadership from ${firm.name} about the pharmaceutical, biotech, medical device, consumer health or regulatory industries: reports, studies, surveys, outlooks or white papers from the past few months. For each one give a one-sentence summary, the topic, the type, and sourceIndex = the 1-based position of the search result it comes from.`,
      },
    ],
    search_domain_filter: [firm.domain],
    search_recency_filter: "month",
    web_search_options: { search_context_size: "low" },
    response_format: { type: "json_schema", json_schema: { schema: RESPONSE_SCHEMA } },
    max_tokens: 900,
  };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`perplexity HTTP ${res.status}`);
      const data = await res.json();
      const cost =
        typeof data?.usage?.cost?.total_cost === "number"
          ? data.usage.cost.total_cost
          : FALLBACK_COST_USD;
      const results: any[] = Array.isArray(data?.search_results) ? data.search_results : [];
      let parsed: any = null;
      try {
        parsed = JSON.parse(
          String(data?.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?|```$/g, "")
        );
      } catch {
        throw new Error("perplexity returned unparseable JSON");
      }
      const seen = new Set<string>();
      const items: ThoughtItem[] = [];
      for (const entry of Array.isArray(parsed?.items) ? parsed.items : []) {
        const hit = results[Number(entry?.sourceIndex) - 1];
        const url = typeof hit?.url === "string" ? hit.url : null;
        const title = String(hit?.title ?? "").replace(/\*+/g, "").trim();
        if (!url || !title || !hostBelongs(url, firm.domain)) continue;
        const dated = Date.parse(hit?.date ?? "") || Date.parse(hit?.last_updated ?? "");
        if (dated && Date.now() - dated > MAX_AGE_MS) continue;
        const dedupe = title.toLowerCase();
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const topic = TOPICS.includes(entry?.topic) ? (entry.topic as ThoughtItem["topic"]) : "Life sciences";
        const type = TYPES.includes(entry?.type) ? (entry.type as ThoughtItem["type"]) : "article";
        items.push({
          firm: firm.name,
          title: title.slice(0, 200),
          url,
          date: dated ? new Date(dated).toISOString() : null,
          summary: String(entry?.summary ?? "").trim().slice(0, 400),
          topic,
          type,
        });
        if (items.length >= MAX_ITEMS_PER_FIRM) break;
      }
      return { items, cost, failed: false };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  console.error(
    `[market-intel] thought leadership failed for ${firm.name}: ${lastError instanceof Error ? lastError.message : lastError}`
  );
  return { items: [], cost: 0, failed: true };
}

/** Merge a fresh pull into the stored board: newest first, one row per link
 *  or title, capped with the total kept so the screen can say what it holds. */
export function mergeThoughtBoard(
  existing: ThoughtBoard | undefined,
  incoming: ThoughtItem[]
): ThoughtBoard {
  const seen = new Set<string>();
  const merged: ThoughtItem[] = [];
  for (const item of [...incoming, ...(existing?.items ?? [])]) {
    const keys = [item.url.toLowerCase(), `${item.firm}|${item.title.toLowerCase()}`];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    merged.push(item);
  }
  merged.sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
  return {
    items: merged.slice(0, THOUGHT_ROWS_KEPT),
    total: merged.length,
    fetchedAt: new Date().toISOString(),
  };
}
