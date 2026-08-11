// PEOPLE BASELINE + LOGO BACKFILL (Anir, Aug 11: "add the top five people for
// every single company... and pull the profile picture").
//
// 1) FREE: re-reads today's already-paid company-posts datasets and stores
//    each company's LinkedIn logo_url into the feed (it was in the data all
//    along, just not kept).
// 2) PAID (~$0.02/profile, hard-capped): for every company with a LinkedIn
//    page, finds 5 senior regulatory-affairs people via harvestapi's search,
//    with name, title, profile URL and photo, and adds them as tracked people
//    in the real-mode tracking row. Their posts are collected by the app's
//    auto-refresh, not here.
//
//   node scripts/market-intel-people-baseline.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const HARD_CAP_USD = 3.6;
const PEOPLE_PER_COMPANY = 5;
const COST_PER_PROFILE = 0.02; // measured live: $0.10 per 5-profile search

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.APIFY_API_TOKEN;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function readRow(id) {
  const { data, error } = await sb
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}
async function writeRow(id, catalog) {
  const { error } = await sb
    .from("offering_catalog_state")
    .upsert({ id, catalog, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ------------------------------------------------- 1) free logo backfill
const feed = await readRow("market-intel-feed");
if (!feed?.companies) throw new Error("no feed row - run the ingest first");

const slugToCompany = {};
for (const c of Object.values(feed.companies)) {
  if (c.slug) slugToCompany[c.slug.toLowerCase()] = c.id;
}

const runsRes = await fetch(
  `https://api.apify.com/v2/acts/apimaestro~linkedin-company-posts/runs?token=${TOKEN}&desc=true&limit=60`
);
const runs = (await runsRes.json()).data.items.filter((r) => r.status === "SUCCEEDED");
let logos = 0;
for (const run of runs) {
  try {
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&limit=1`
    );
    const items = await itemsRes.json();
    const first = Array.isArray(items) ? items[0] : null;
    const source = String(first?.source_company ?? "");
    const slug = source.match(/company\/([^/]+)/)?.[1]?.toLowerCase();
    const logoUrl = first?.author?.logo_url;
    const companyId = slug ? slugToCompany[slug] : null;
    if (companyId && logoUrl && feed.companies[companyId].author) {
      if (!feed.companies[companyId].author.logoUrl) {
        feed.companies[companyId].author.logoUrl = logoUrl;
        logos += 1;
      }
    }
  } catch {
    /* one dataset failing is fine */
  }
}
await writeRow("market-intel-feed", feed);
log(`logo backfill: ${logos} company logos stored (free)`);

// ------------------------------------------------- 2) discover 5 people each
const tracking = (await readRow("market-intel:default")) ?? { companies: [], people: [] };
tracking.people = Array.isArray(tracking.people) ? tracking.people : [];

let spent = 0;
let added = 0;
for (const company of Object.values(feed.companies)) {
  if (!company.slug) {
    log(`SKIP ${company.name}: no LinkedIn page`);
    continue;
  }
  const already = tracking.people.filter((p) => p.companyId === company.id).length;
  if (already >= PEOPLE_PER_COMPANY) {
    log(`SKIP ${company.name}: already has ${already} people`);
    continue;
  }
  if (spent + PEOPLE_PER_COMPANY * COST_PER_PROFILE > HARD_CAP_USD) {
    log(`STOP at ${company.name}: budget ($${spent.toFixed(2)} spent)`);
    break;
  }
  let items;
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items?token=${TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileScraperMode: "Short",
          searchQuery: "regulatory affairs",
          currentCompanies: [`https://www.linkedin.com/company/${company.slug}`],
          maxItems: PEOPLE_PER_COMPANY,
        }),
        signal: AbortSignal.timeout(170000),
      }
    );
    items = await res.json();
  } catch (err) {
    log(`  ${company.name}: ${String(err).slice(0, 100)}`);
    continue;
  }
  if (!Array.isArray(items)) {
    log(`  ${company.name}: ${JSON.stringify(items).slice(0, 120)}`);
    continue;
  }
  spent += items.length * COST_PER_PROFILE;
  let companyAdded = 0;
  for (const item of items) {
    const name = [item.firstName, item.lastName].filter(Boolean).join(" ").trim();
    if (!name || !item.linkedinUrl) continue;
    const duplicate = tracking.people.some(
      (p) => p.companyId === company.id && p.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) continue;
    const position = Array.isArray(item.currentPositions) ? item.currentPositions[0] : null;
    tracking.people.push({
      id: `${company.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${added}`,
      companyId: company.id,
      name,
      role: String(position?.title ?? position?.position ?? "").slice(0, 80),
      linkedinUrl: item.linkedinUrl,
      photoUrl: item.pictureUrl || "",
      addedAt: new Date().toISOString(),
      source: "auto-baseline",
    });
    added += 1;
    companyAdded += 1;
  }
  await writeRow("market-intel:default", tracking);
  log(`  ${company.name}: +${companyAdded} people ($${spent.toFixed(2)} so far)`);
}

log(`DONE: ${added} people added across the watch, search spend ~$${spent.toFixed(2)}`);
