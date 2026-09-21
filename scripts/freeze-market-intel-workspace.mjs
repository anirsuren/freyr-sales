/**
 * One-time, read-only capture of a compact real Market Intelligence workspace.
 *
 * Run explicitly with:
 *   node --env-file=.env.local scripts/freeze-market-intel-workspace.mjs
 *
 * The generated JSON is committed and used only in Mock mode. Runtime pages
 * never call the live Market Intelligence store for this snapshot.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const COMPANY_IDS = [
  "takeda",
  "gsk",
  "novartis",
  "kenvue",
  "vertex",
  "roche",
  "sanofi",
  "astrazeneca",
  "moderna",
  "biocon",
  "cipla",
  "dr-reddy-s",
  "veeva",
  "iqvia",
  "parexel",
  "certara",
  "arisglobal",
  "rimsys",
  "emergo",
  "intertek",
];

// Known dead pages found during the snapshot's link audit. Bot-blocked pages
// are kept because they still open normally in a browser.
const DEAD_URLS = new Set([
  "https://www.thementorshipproject.in/news-details/B2VbYgZm/Sanofi-India-Ltd-v-Central-Bureau-of-Investigation-Supreme-Court-Clarifies-Corporate-Mens-Rea-and-Attribution-in-Criminal-Prosecution",
  "https://www.uoguelph.ca/arts/preliminary-2019-tri-university-history-conference-program?live-blog-32556252-2026-09-12-cipla-and-qilu-launch-keytruda-biosimilar-us-market-trust-remains-high-at-4-46",
  "https://www.digitaltoday.co.kr/news/articleView.html?idxno=697124",
  "https://www.cnbc.com/amp/2026/08/24/cnbc-daily-open-ai-iran-economic-d-day.html",
]);

const url = process.env.MARKET_INTEL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.MARKET_INTEL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Market Intelligence database settings are missing.");

const db = createClient(url, key, { auth: { persistSession: false } });
const readCatalog = async (id) => {
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.catalog ?? null;
};

const tracking = await readCatalog("market-intel:default");
const meta = await readCatalog("market-intel-feed");
if (!tracking) throw new Error("The live tracking catalogue is empty.");

const selected = new Set(COMPANY_IDS);
const companies = tracking.companies
  .filter((company) => selected.has(company.id))
  .map((company) => ({
    id: company.id,
    name: company.name,
    group: company.group === "competitor" ? "competitor" : "customer",
    industry: company.industry || "Life sciences",
    hq: company.hq || "",
    website: company.website || "",
    linkedinUrl: company.linkedinUrl || "",
    competitors: company.competitors || [],
    keywords: company.keywords || [],
    note: company.note || "",
    addedAt: company.addedAt,
    divisions: company.divisions || [],
    ...(company.logoUrl ? { logoUrl: company.logoUrl } : {}),
    seed: true,
    activeByDefault: true,
  }));
if (companies.length !== COMPANY_IDS.length) {
  const found = new Set(companies.map((company) => company.id));
  throw new Error(`Missing companies: ${COMPANY_IDS.filter((id) => !found.has(id)).join(", ")}`);
}

const people = [];
for (const company of companies.filter((entry) => entry.group === "customer")) {
  people.push(
    ...tracking.people
      .filter((person) => person.companyId === company.id)
      .slice(0, 3)
      .map((person) => ({
        id: person.id,
        companyId: person.companyId,
        name: person.name,
        role: person.role || person.headline || "",
        linkedinUrl: person.linkedinUrl || "",
        addedAt: person.addedAt,
        ...(person.photoUrl ? { photoUrl: person.photoUrl } : {}),
        ...(person.headline ? { headline: person.headline } : {}),
        ...(person.location ? { location: person.location } : {}),
        ...(Number.isFinite(person.followerCount) ? { followerCount: person.followerCount } : {}),
      })),
  );
}

const dateValue = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};
const newest = (items, field) => [...(items || [])].sort((a, b) => dateValue(b[field]) - dateValue(a[field]));
const workingLinks = (items, urlField = "url", dateField = "published") =>
  newest(items, dateField).filter((item) => item[urlField] && !DEAD_URLS.has(item[urlField]));
const post = (item) => ({
  url: item.url,
  text: item.text,
  date: item.date ?? null,
  reactions: item.reactions ?? null,
  comments: item.comments ?? null,
  reposts: item.reposts ?? null,
  ...(item.mediaType ? { mediaType: item.mediaType } : {}),
  ...(item.label ? { label: item.label } : {}),
});
const article = (item) => ({
  title: item.title,
  source: item.source,
  url: item.url,
  published: item.published ?? null,
  ...(item.summary ? { summary: item.summary } : {}),
  ...(item.publisherUrl ? { publisherUrl: item.publisherUrl } : {}),
  ...(item.label ? { label: item.label } : {}),
});

const companyFeeds = {};
for (const company of companies) {
  const row = await readCatalog(`market-intel-company:${company.id}`);
  const feed = row?.company;
  if (!feed) throw new Error(`No collected feed for ${company.name}.`);
  companyFeeds[company.id] = {
    id: company.id,
    name: company.name,
    slug: feed.slug ?? null,
    group: company.group,
    logoUrl: feed.logoUrl ?? company.logoUrl ?? null,
    author: feed.author ?? null,
    tldr: feed.tldr ?? null,
    fetchedAt: feed.fetchedAt,
    ...(feed.newsAt ? { newsAt: feed.newsAt } : {}),
    ...(feed.siteAt ? { siteAt: feed.siteAt } : {}),
    posts: newest(feed.posts, "date").slice(0, 6).map(post),
    news: workingLinks(feed.news).slice(0, 12).map(article),
    site: workingLinks(feed.site).slice(0, 6).map(article),
  };
}

const personFeeds = {};
for (const person of people) {
  const row = await readCatalog(`market-intel-person:${person.id}`);
  if (!row?.feed) continue;
  personFeeds[person.id] = {
    fetchedAt: row.feed.fetchedAt,
    posts: newest(row.feed.posts, "date").slice(0, 4).map(post),
  };
}

const capturedAt = meta?.updatedAt || new Date().toISOString();
const snapshot = {
  capturedAt,
  tracking: {
    demoVersion: 20260921,
    companies,
    people,
    divisions: Object.fromEntries(companies.filter((company) => company.divisions.length).map((company) => [company.id, company.divisions])),
    removedSeeds: [],
  },
  companies: companyFeeds,
  people: personFeeds,
  meta: {
    version: 1,
    updatedAt: capturedAt,
    ...(meta?.mna ? { mna: { ...meta.mna, items: workingLinks(meta.mna.items, "sourceUrl", "date").slice(0, 40) } } : {}),
    ...(meta?.thought ? { thought: { ...meta.thought, items: workingLinks(meta.thought.items, "url", "date").slice(0, 40) } } : {}),
  },
};

const output = resolve("lib/marketIntelFrozenWorkspace.json");
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
console.log(`Wrote ${output}: ${companies.length} companies, ${people.length} people, ${Object.values(companyFeeds).reduce((sum, feed) => sum + feed.posts.length + feed.news.length + feed.site.length, 0)} company items.`);
