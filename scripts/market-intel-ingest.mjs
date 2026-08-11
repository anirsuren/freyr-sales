// MARKET INTEL SCRAPE (Anir, Aug 11: "$10 limit... everything should be real").
// Pulls real LinkedIn company posts + real Google News for every tracked
// company and stores them in offering_catalog_state row "market-intel-feed".
// Re-runnable: each run refreshes whatever fits the budget, checkpointing
// after every company so a crash loses nothing.
//
//   node scripts/market-intel-ingest.mjs
//
// Costs (verified live Aug 11): company posts $0.005/post, news $0.01/query
// + $0.004/article. HARD_CAP_USD stops new spends before the limit.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const HARD_CAP_USD = 9.5;
const POST_LIMIT = 30;
const NEWS_LIMIT = 20;
const WORST_CASE_PER_COMPANY =
  POST_LIMIT * 0.005 + 0.01 + NEWS_LIMIT * 0.004 + 0.01; // + slug retries

// ---------------------------------------------------------------- env
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.APIFY_API_TOKEN;
if (!TOKEN) throw new Error("APIFY_API_TOKEN missing from .env.local");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------- companies
// `li` = LinkedIn slug candidates, tried in order; `expect` must appear in the
// returned author name or the result is DISCARDED (never store another
// company's posts under this name). null li = no company page to scrape
// (partnership entries), news only. Names stay exactly as they appear in the
// app's watchlist.
const COMPANIES = [
  { id: "takeda", name: "Takeda", li: ["takeda-pharmaceuticals"], expect: "takeda" },
  { id: "gsk", name: "GSK", li: ["gsk"], expect: "gsk" },
  { id: "novartis", name: "Novartis", li: ["novartis"], expect: "novartis" },
  { id: "incyte", name: "Incyte", li: ["incyte"], expect: "incyte" },
  { id: "gilead", name: "Gilead", li: ["gilead-sciences"], expect: "gilead" },
  { id: "jj-medtech", name: "J&J Medtech", li: ["johnson-johnson-medtech", "jnj-medtech"], expect: "johnson", newsQ: "Johnson & Johnson MedTech" },
  { id: "kenvue", name: "Kenvue", li: ["kenvue"], expect: "kenvue" },
  { id: "otsuka", name: "Otsuka", li: ["otsuka-pharmaceutical-companies", "otsuka-america-pharmaceutical"], expect: "otsuka", newsQ: "Otsuka Pharmaceutical" },
  { id: "opella", name: "Opella", li: ["opella"], expect: "opella", newsQ: "Opella healthcare" },
  { id: "zydus", name: "Zydus", li: ["zydus-group", "zyduslifesciences"], expect: "zydus", newsQ: "Zydus Lifesciences" },
  { id: "galderma", name: "Galderma", li: ["galderma"], expect: "galderma" },
  { id: "curateq", name: "CuraTeQ", li: ["curateq-biologics"], expect: "curateq", newsQ: "CuraTeQ Biologics" },
  { id: "pierre-fabre", name: "Pierre Fabre", li: ["pierre-fabre"], expect: "pierre fabre" },
  { id: "vertex", name: "Vertex", li: ["vertex-pharmaceuticals"], expect: "vertex", newsQ: "Vertex Pharmaceuticals" },
  // "Gideon" on the watchlist reads as Gedeon Richter (no pharma named
  // Gideon); if the author check disagrees the result is dropped, not stored.
  { id: "gideon", name: "Gideon", li: ["gedeonrichter", "gedeon-richter"], expect: "richter", newsQ: "Gedeon Richter" },
  { id: "novartis-cognizant", name: "Novartis + Cognizant", li: null, expect: "", newsQ: "Novartis Cognizant" },
  { id: "roche", name: "Roche", li: ["roche"], expect: "roche" },
  { id: "sanofi", name: "Sanofi", li: ["sanofi"], expect: "sanofi" },
  { id: "astrazeneca", name: "AstraZeneca", li: ["astrazeneca"], expect: "astrazeneca" },
  { id: "boehringer-ingelheim", name: "Boehringer Ingelheim", li: ["boehringer-ingelheim"], expect: "boehringer" },
  { id: "teva", name: "Teva", li: ["teva-pharmaceuticals"], expect: "teva", newsQ: "Teva Pharmaceuticals" },
  { id: "viatris", name: "Viatris", li: ["viatris"], expect: "viatris" },
  { id: "lupin", name: "Lupin", li: ["lupin"], expect: "lupin", newsQ: "Lupin pharmaceutical" },
  { id: "cipla", name: "Cipla", li: ["cipla"], expect: "cipla" },
  { id: "dr-reddy-s", name: "Dr. Reddy's", li: ["dr--reddys-laboratories", "dr-reddys-laboratories"], expect: "redd", newsQ: "Dr Reddy's Laboratories" },
  { id: "sun-pharma", name: "Sun Pharma", li: ["sun-pharmaceutical-industries-ltd", "sun-pharma"], expect: "sun pharma" },
  { id: "alkem", name: "Alkem", li: ["alkem-laboratories-ltd-", "alkem-laboratories"], expect: "alkem", newsQ: "Alkem Laboratories" },
  { id: "biocon", name: "Biocon", li: ["biocon"], expect: "biocon" },
  { id: "moderna", name: "Moderna", li: ["modernatx"], expect: "moderna" },
  { id: "amgen", name: "Amgen", li: ["amgen"], expect: "amgen" },
  { id: "bayer", name: "Bayer", li: ["bayer"], expect: "bayer" },
  { id: "merck-kgaa", name: "Merck KGaA", li: ["merck-group"], expect: "merck", newsQ: "Merck KGaA" },
  { id: "eisai", name: "Eisai", li: ["eisai"], expect: "eisai" },
  { id: "daiichi-sankyo", name: "Daiichi Sankyo", li: ["daiichi-sankyo-inc", "daiichisankyo"], expect: "daiichi" },
];

// ---------------------------------------------------------------- apify
let spent = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function runActor(actor, input, timeoutMs = 180000) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!res.ok) throw new Error(`${actor} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function scrapePosts(company) {
  if (!company.li) return { posts: [], author: null, slug: null };
  for (const slug of company.li) {
    let items;
    try {
      items = await runActor("apimaestro~linkedin-company-posts", {
        company_name: `linkedin.com/company/${slug}`,
        limit: POST_LIMIT,
      });
    } catch (err) {
      log(`  posts ${slug}: ${err.message.slice(0, 120)}`);
      continue;
    }
    if (!Array.isArray(items) || items.length === 0) continue;
    if (items.length === 1 && items[0]?.message) {
      spent += 0.005; // the error item still bills
      log(`  posts ${slug}: ${items[0].message}`);
      continue;
    }
    spent += items.length * 0.005;
    const author = items.find((i) => i?.author?.name)?.author ?? null;
    if (
      company.expect &&
      author?.name &&
      !author.name.toLowerCase().includes(company.expect)
    ) {
      log(`  posts ${slug}: WRONG COMPANY (${author.name}), discarding`);
      continue;
    }
    const posts = items
      .filter((i) => i?.text && i?.post_url)
      .map((i) => ({
        url: i.post_url,
        text: String(i.text).slice(0, 2000),
        date: i.posted_at?.timestamp
          ? new Date(i.posted_at.timestamp).toISOString()
          : null,
        reactions: i.stats?.total_reactions ?? null,
        comments: i.stats?.comments ?? null,
        reposts: i.stats?.reposts ?? null,
      }));
    return {
      posts,
      slug,
      author: author
        ? { name: author.name, followerCount: author.follower_count ?? null }
        : null,
    };
  }
  return { posts: [], author: null, slug: null };
}

async function scrapeNews(company) {
  let items;
  try {
    items = await runActor("s-r~google-news", {
      q: company.newsQ || company.name,
      maxItems: NEWS_LIMIT,
    });
  } catch (err) {
    log(`  news: ${err.message.slice(0, 120)}`);
    return [];
  }
  if (!Array.isArray(items)) return [];
  spent += 0.01 + items.length * 0.004;
  const seen = new Set();
  const news = [];
  for (const i of items) {
    if (!i?.title || !i?.url) continue;
    const title = String(i.title).replace(/\s+-\s+[^-]+$/, "").trim();
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    news.push({
      title,
      source:
        typeof i.source === "string" ? i.source : i.source?.title || "News",
      url: i.url,
      published: i.published ? new Date(i.published).toISOString() : null,
    });
  }
  return news;
}

// ---------------------------------------------------------------- store
async function loadFeed() {
  const { data, error } = await supabase
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", "market-intel-feed")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const feed = data?.catalog || {};
  return {
    version: 1,
    companies: feed.companies || {},
    spendUsd: feed.spendUsd || 0,
    updatedAt: feed.updatedAt || null,
  };
}

async function saveFeed(feed) {
  const { error } = await supabase.from("offering_catalog_state").upsert({
    id: "market-intel-feed",
    catalog: feed,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- main
const feed = await loadFeed();
const initialSpend = feed.spendUsd;
let done = 0;
let skipped = 0;
for (const company of COMPANIES) {
  if (spent + WORST_CASE_PER_COMPANY > HARD_CAP_USD) {
    skipped += 1;
    log(`SKIP ${company.name} (budget: $${spent.toFixed(2)} spent)`);
    continue;
  }
  log(`${company.name}...`);
  const { posts, author, slug } = await scrapePosts(company);
  const news = await scrapeNews(company);
  feed.companies[company.id] = {
    id: company.id,
    name: company.name,
    slug,
    author,
    posts,
    news,
    fetchedAt: new Date().toISOString(),
  };
  feed.updatedAt = new Date().toISOString();
  feed.spendUsd = Math.round((initialSpend + spent) * 1000) / 1000;
  await saveFeed(feed);
  done += 1;
  log(`  -> ${posts.length} posts, ${news.length} news ($${spent.toFixed(2)} so far)`);
}

log(`DONE: ${done} companies, ${skipped} skipped, run spend $${spent.toFixed(2)}`);
