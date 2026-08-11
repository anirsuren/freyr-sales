// COMPETITOR TAB SEED (Aug 11 call): first pull for the 10 seeded competitors
// - posts (10), news (10) each, group-stamped "competitor". The app's
// twice-daily refresh keeps them current afterwards.
//   node scripts/market-intel-competitors-seed.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const T = env.APIFY_API_TOKEN;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);
const COMPETITORS = [
  { id: "veeva", name: "Veeva", li: ["veeva-systems"], expect: "veeva", newsQ: "Veeva Systems" },
  { id: "iqvia", name: "IQVIA", li: ["iqvia"], expect: "iqvia" },
  { id: "parexel", name: "Parexel", li: ["parexel"], expect: "parexel" },
  { id: "intertek", name: "Intertek", li: ["intertek"], expect: "intertek" },
  { id: "emergo", name: "Emergo by UL", li: ["emergo", "emergo-by-ul"], expect: "emergo", newsQ: "Emergo by UL" },
  { id: "tcs", name: "TCS", li: ["tata-consultancy-services"], expect: "tata", newsQ: "TCS life sciences regulatory" },
  { id: "certara", name: "Certara", li: ["certara"], expect: "certara" },
  { id: "icon-plc", name: "ICON plc", li: ["iconplc"], expect: "icon", newsQ: "ICON plc clinical" },
  { id: "ul-solutions", name: "UL Solutions", li: ["ul-solutions"], expect: "ul", newsQ: "UL Solutions" },
  { id: "nsf-international", name: "NSF", li: ["nsf-international"], expect: "nsf", newsQ: "NSF International certification" },
];
const run = async (actor, input) => {
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${T}`, {
    method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(input), signal: AbortSignal.timeout(170000)});
  return r.json();
};
const clean = (raw) => {
  let s = String(raw||"News").trim();
  if (/\.[a-z]{2,6}$/i.test(s) || /\.(com|net|org|io|co)\b/i.test(s)) {
    s = s.replace(/^www\./i,"").split("/")[0].replace(/\.[a-z]{2,6}$/i,"").replace(/\.[a-z]{2,6}$/i,"").replace(/[-_.]+/g," ");
  }
  s = s.replace(/\s+/g," ").trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(" ");
  return s.slice(0,32) || "News";
};
const { data } = await sb.from("offering_catalog_state").select("catalog").eq("id","market-intel-feed").maybeSingle();
const feed = data.catalog;
let spent = 0;
for (const c of COMPETITORS) {
  if (feed.companies[c.id]?.group === "competitor" && feed.companies[c.id]?.posts?.length) { log("SKIP", c.name); continue; }
  let posts = [], author = null, slug = null;
  for (const s of c.li) {
    const items = await run("apimaestro~linkedin-company-posts", {company_name:`linkedin.com/company/${s}`, limit:10});
    if (!Array.isArray(items) || !items.length) continue;
    if (items.length === 1 && items[0]?.message) { spent += 0.005; continue; }
    spent += items.length * 0.005;
    const a = items.find(i=>i?.author?.name)?.author;
    if (c.expect && a?.name && !a.name.toLowerCase().includes(c.expect)) { log(" wrong company for", s, ":", a.name); continue; }
    posts = items.filter(i=>i?.text&&i?.post_url).map(i=>({
      url:i.post_url, text:String(i.text).slice(0,2000),
      date:i.posted_at?.timestamp?new Date(i.posted_at.timestamp).toISOString():null,
      reactions:i.stats?.total_reactions??null, comments:i.stats?.comments??null, reposts:i.stats?.reposts??null}));
    author = a ? {name:a.name, followerCount:a.follower_count??null, logoUrl:a.logo_url??null} : null;
    slug = s; break;
  }
  const newsItems = await run("s-r~google-news", {q: c.newsQ || c.name, maxItems: 10});
  let news = [];
  if (Array.isArray(newsItems)) {
    spent += 0.01 + newsItems.length * 0.004;
    const seen = new Set();
    news = newsItems.filter(i=>i?.title&&i?.url).map(i=>({
      title:String(i.title).replace(/\s+-\s+[^-]+$/,"").trim(),
      source: clean(typeof i.source==="string"?i.source:(i.source?.title||"News")),
      url:i.url, published:i.published?new Date(i.published).toISOString():null,
    })).filter(n=>{const k=n.title.toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;});
  }
  feed.companies[c.id] = { id:c.id, name:c.name, slug, author, posts, news, tldr:null, group:"competitor", fetchedAt:new Date().toISOString() };
  feed.updatedAt = new Date().toISOString();
  feed.spendUsd = Math.round((feed.spendUsd + spent)*1000)/1000; spent = 0;
  await sb.from("offering_catalog_state").upsert({id:"market-intel-feed", catalog:feed, updated_at:new Date().toISOString()});
  log(c.name, "->", posts.length, "posts,", news.length, "news");
}
log("DONE. feed spend total:", feed.spendUsd);
