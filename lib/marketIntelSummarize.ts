import Anthropic from "@anthropic-ai/sdk";
import type { FeedCompany, FeedNews, MnaItem } from "./marketIntelFeed";

/**
 * THE AI LAYER OF MARKET INTEL (Anir, Aug 11: "All this shit should have an
 * AI-generated summary" + "at the top a quick rundown of everything that
 * happened... think of it like a TLDR").
 *
 * One Haiku call per company produces both the page-top TLDR and a 1-2
 * sentence summary per article. Summaries are grounded: an article is only
 * summarized when its actual text could be fetched; headlines alone never
 * masquerade as a summary. The TLDR is labeled AI on the page and draws only
 * on the collected items. Runs on the app's Anthropic key at Haiku prices —
 * fractions of a cent per company.
 */

const MODEL = "claude-haiku-4-5-20251001";
const FETCH_TIMEOUT_MS = 8000;
const MAX_ARTICLE_CHARS = 1400;

function haiku(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (process.env.AGENT_FORCE_MOCK === "1") return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google News URLs redirect to the publisher; sometimes via an HTML page
 *  whose first outbound link is the real article. */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FreyrSales/1.0)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Google News article links are encrypted redirects. The page carries a
 * signature + timestamp, and Google's own batchexecute endpoint trades them
 * for the publisher URL — the technique the open decoder libraries use.
 */
async function decodeGoogleNewsUrl(url: string): Promise<string | null> {
  const id = url.match(/articles\/([^?]+)/)?.[1];
  if (!id) return null;
  const html = await fetchHtml(url);
  if (!html) return null;
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;
  try {
    const req = [
      "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`,
      null,
      "generic",
    ];
    const res = await fetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "f.req=" + encodeURIComponent(JSON.stringify([[req]])),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    const body = await res.text();
    return (
      body.match(/\[\\"garturlres\\",\\"(https?:[^\\"]+)\\"/)?.[1] ??
      body.match(/"garturlres","(https?:[^"]+)"/)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

export async function resolveArticleText(url: string): Promise<string | null> {
  let target = url;
  if (url.includes("news.google.com")) {
    const decoded = await decodeGoogleNewsUrl(url);
    if (!decoded) return null;
    target = decoded;
  }
  const html = await fetchHtml(target);
  if (!html) return null;
  const description =
    html.match(
      /<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i
    )?.[1] ?? "";
  const body = stripHtml(html);
  const text = `${description} ${body}`.trim().slice(0, MAX_ARTICLE_CHARS);
  // A cookie wall or bot block yields a stub; treat it as unfetchable rather
  // than summarizing boilerplate.
  return text.length > 250 ? text : null;
}

export type CompanyDigest = {
  tldr: string | null;
  /** Article summaries keyed by news index; only fetched articles appear. */
  summaries: Map<number, string>;
};

export async function digestCompany(
  company: Pick<FeedCompany, "name" | "news" | "posts">
): Promise<CompanyDigest> {
  const client = haiku();
  if (!client) return { tldr: null, summaries: new Map() };

  const articles: { i: number; title: string; source: string; text: string | null }[] = [];
  for (let i = 0; i < Math.min(company.news.length, 12); i += 1) {
    const item = company.news[i];
    articles.push({
      i,
      title: item.title,
      source: item.source,
      text: await resolveArticleText(item.url),
    });
  }
  const postLines = company.posts
    .slice(0, 8)
    .map((p) => `- ${p.text.split("\n")[0].slice(0, 140)}`)
    .join("\n");

  const prompt = `You are the briefing writer inside a sales intelligence tool used by Freyr Solutions (regulatory affairs services). Company being briefed: ${company.name}.

NEWS ITEMS (JSON): ${JSON.stringify(
    articles.map((a) => ({
      i: a.i,
      title: a.title,
      source: a.source,
      article_text: a.text ?? undefined,
    }))
  )}

RECENT LINKEDIN POST OPENERS:
${postLines || "(none)"}

Reply with ONLY valid JSON, no markdown fence:
{"tldr": "...", "summaries": [{"i": 0, "summary": "..."}]}

Rules:
- "tldr": at most 45 words, plain English, present tense. The quick rundown a sales rep reads before a call: what is happening at ${company.name} lately, from these items only. No hype words, no advice.
- "summaries": one entry PER ITEM THAT HAS article_text, 1-2 factual sentences each, drawn only from that item's text and title. SKIP items without article_text entirely. Never invent facts.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const summaries = new Map<number, string>();
    if (Array.isArray(parsed.summaries)) {
      for (const entry of parsed.summaries) {
        const index = Number(entry?.i);
        const summary = String(entry?.summary ?? "").trim();
        // Grounding guard: only attach a summary to an item whose article
        // text was actually provided to the model.
        if (
          Number.isInteger(index) &&
          summary &&
          articles.find((a) => a.i === index)?.text
        ) {
          summaries.set(index, summary.slice(0, 400));
        }
      }
    }
    const tldr = String(parsed.tldr ?? "").trim().slice(0, 360) || null;
    return { tldr, summaries };
  } catch {
    return { tldr: null, summaries: new Map() };
  }
}

/**
 * M&A TRACKER CLASSIFICATION (Aug 11 call): raw deal headlines in, structured
 * board out — acquirer, target, Announced or Completed, and which of Freyr's
 * three divisions it touches. Items the model can't place as a real M&A deal
 * are dropped, never guessed into the tracker.
 */
export async function classifyMna(
  articles: (FeedNews & { division: string })[]
): Promise<MnaItem[]> {
  const client = haiku();
  if (!client || articles.length === 0) return [];
  const prompt = `You classify merger & acquisition news for a regulatory-affairs services firm. Divisions: "Medicinal Products" (pharma, biotech, drugs), "Medical Devices" (devices, diagnostics, medtech), "Consumer" (consumer health, cosmetics, food, OTC).

ARTICLES (JSON): ${JSON.stringify(
    articles.map((a, i) => ({
      i,
      title: a.title,
      source: a.source,
      published: a.published,
      hint_division: a.division,
    }))
  )}

Reply with ONLY valid JSON, no markdown fence:
{"deals": [{"i": 0, "acquirer": "...", "target": "...", "status": "announced"|"completed", "division": "Medicinal Products"|"Medical Devices"|"Consumer", "valueLabel": "$1.2 Bn" or null, "summary": "one factual sentence from the headline"}]}

Rules:
- Include an article ONLY if its headline clearly describes a specific M&A deal (acquirer and target both named or unambiguous). Skip rumors, indexes, listicles and anything unclear.
- status: "completed" only if the headline says completed/closed/finalized; otherwise "announced".
- valueLabel only if a value appears in the headline; never estimate.
- Never invent companies or numbers.`;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const out: MnaItem[] = [];
    for (const deal of parsed.deals ?? []) {
      const src = articles[Number(deal?.i)];
      if (!src) continue;
      const acquirer = String(deal?.acquirer ?? "").trim();
      const target = String(deal?.target ?? "").trim();
      const division = String(deal?.division ?? "");
      if (!acquirer || !target) continue;
      if (!["Medicinal Products", "Medical Devices", "Consumer"].includes(division)) continue;
      out.push({
        acquirer: acquirer.slice(0, 60),
        target: target.slice(0, 60),
        status: deal?.status === "completed" ? "completed" : "announced",
        division: division as MnaItem["division"],
        valueLabel: deal?.valueLabel ? String(deal.valueLabel).slice(0, 20) : null,
        date: src.published,
        summary: String(deal?.summary ?? src.title).slice(0, 240),
        sourceLabel: src.source,
        sourceUrl: src.url,
      });
    }
    return out;
  } catch {
    return [];
  }
}
