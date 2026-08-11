// AI DIGEST BACKFILL: writes the page-top TLDR and per-article summaries for
// every company already in the feed (the refresh engine keeps them current
// from now on). Anthropic Haiku on the app's key; article text is fetched
// first so summaries are grounded in the actual story, never just the
// headline. Re-runnable: companies that already have a tldr are skipped.
//
//   node scripts/market-intel-digest-backfill.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FreyrSales/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function decodeGoogleNewsUrl(url) {
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
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "f.req=" + encodeURIComponent(JSON.stringify([[req]])),
      signal: AbortSignal.timeout(8000),
    });
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

async function articleText(url) {
  let target = url;
  if (url.includes("news.google.com")) {
    const decoded = await decodeGoogleNewsUrl(url);
    if (!decoded) return null;
    target = decoded;
  }
  const html = await fetchHtml(target);
  if (!html) return null;
  const description =
    html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i)?.[1] ?? "";
  const text = `${description} ${stripHtml(html)}`.trim().slice(0, 1400);
  return text.length > 250 ? text : null;
}

const { data } = await sb
  .from("offering_catalog_state")
  .select("catalog")
  .eq("id", "market-intel-feed")
  .maybeSingle();
const feed = data.catalog;

let done = 0;
for (const company of Object.values(feed.companies)) {
  const needs = company.news.some((n) => !n.summary) || !company.tldr;
  if (!needs) {
    log(`SKIP ${company.name} (already digested)`);
    continue;
  }
  const articles = [];
  for (let i = 0; i < Math.min(company.news.length, 12); i += 1) {
    articles.push({
      i,
      title: company.news[i].title,
      source: company.news[i].source,
      text: await articleText(company.news[i].url),
    });
  }
  const fetched = articles.filter((a) => a.text).length;
  const postLines = company.posts
    .slice(0, 8)
    .map((p) => `- ${p.text.split("\n")[0].slice(0, 140)}`)
    .join("\n");
  const prompt = `You are the briefing writer inside a sales intelligence tool used by Freyr Solutions (regulatory affairs services). Company being briefed: ${company.name}.

NEWS ITEMS (JSON): ${JSON.stringify(
    articles.map((a) => ({ i: a.i, title: a.title, source: a.source, article_text: a.text ?? undefined }))
  )}

RECENT LINKEDIN POST OPENERS:
${postLines || "(none)"}

Reply with ONLY valid JSON, no markdown fence:
{"tldr": "...", "summaries": [{"i": 0, "summary": "..."}]}

Rules:
- "tldr": at most 45 words, plain English, present tense. The quick rundown a sales rep reads before a call: what is happening at ${company.name} lately, from these items only. No hype words, no advice.
- "summaries": one entry PER ITEM THAT HAS article_text, 1-2 factual sentences each, drawn only from that item's text and title. SKIP items without article_text entirely. Never invent facts.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    let applied = 0;
    if (Array.isArray(parsed.summaries)) {
      for (const entry of parsed.summaries) {
        const index = Number(entry?.i);
        const summary = String(entry?.summary ?? "").trim();
        if (
          Number.isInteger(index) &&
          summary &&
          articles.find((a) => a.i === index)?.text &&
          company.news[index]
        ) {
          company.news[index].summary = summary.slice(0, 400);
          applied += 1;
        }
      }
    }
    company.tldr = String(parsed.tldr ?? "").trim().slice(0, 360) || null;
    feed.updatedAt = new Date().toISOString();
    await sb
      .from("offering_catalog_state")
      .upsert({ id: "market-intel-feed", catalog: feed, updated_at: new Date().toISOString() });
    done += 1;
    log(`${company.name}: tldr ok, ${applied}/${fetched} article summaries (of ${articles.length} items)`);
  } catch (err) {
    log(`${company.name}: FAILED ${String(err).slice(0, 120)}`);
  }
}
log(`DONE: ${done} companies digested`);
