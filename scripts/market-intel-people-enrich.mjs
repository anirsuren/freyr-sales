// PEOPLE PROFILE ENRICH — FREE (Anir, Aug 11: "Don't scrape it. You have
// everything. Just pull back the scrape and get all the data").
//
// Re-reads Apify runs we already paid for and backfills each tracked person:
//  - full LinkedIn headline  <- author block on their profile-posts runs
//  - location                <- harvestapi discovery search results
//  - position (title @ co)   <- harvestapi currentPositions, as role fallback
// No new actor runs are started; dataset reads cost nothing.
//
//   node scripts/market-intel-people-enrich.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.APIFY_API_TOKEN;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const PROFILE_POSTS_ACTOR = "LQQIXN9Othf8f7R5n"; // apimaestro~linkedin-profile-posts
const HARVEST_SEARCH_ACTOR = "M2FMdjRVeF1HPGFcc"; // harvestapi~linkedin-profile-search

async function api(path) {
  const res = await fetch(`https://api.apify.com/v2${path}${path.includes("?") ? "&" : "?"}token=${TOKEN}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function allRuns(actorId) {
  const runs = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api(`/acts/${actorId}/runs?limit=100&offset=${offset}&desc=1`);
    runs.push(...page.data.items.filter((r) => r.status === "SUCCEEDED"));
    if (page.data.items.length < 100) break;
  }
  return runs;
}

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

const tracking = await readRow("market-intel:default");
if (!tracking?.people?.length) {
  log("no tracked people found; nothing to enrich");
  process.exit(0);
}
log(`${tracking.people.length} tracked people`);

// --- 1) Full headlines from the author block of every profile-posts run.
//     The run INPUT tells us whose posts it was (the hashed /in/ id).
const headlineByUsername = new Map();
const postRuns = await allRuns(PROFILE_POSTS_ACTOR);
log(`${postRuns.length} profile-posts runs in storage`);
let inspected = 0;
for (const run of postRuns) {
  try {
    const input = await api(`/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`);
    const username = String(input?.username ?? "");
    if (!username || headlineByUsername.has(username)) continue;
    const items = await api(`/datasets/${run.defaultDatasetId}/items?limit=3&clean=1`);
    const author = (Array.isArray(items) ? items : []).find((i) => i?.author?.headline)?.author;
    if (author?.headline) {
      headlineByUsername.set(username, String(author.headline).trim());
      inspected += 1;
    }
  } catch {
    /* an expired or malformed run just contributes nothing */
  }
}
log(`headlines recovered for ${headlineByUsername.size} usernames (${inspected} runs read)`);

// --- 2) Locations + current positions from the discovery searches.
const harvestById = new Map();
const searchRuns = await allRuns(HARVEST_SEARCH_ACTOR);
log(`${searchRuns.length} discovery-search runs in storage`);
for (const run of searchRuns) {
  try {
    const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=1`);
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.id && !harvestById.has(item.id)) harvestById.set(item.id, item);
    }
  } catch {
    /* skip */
  }
}
log(`discovery profiles in storage: ${harvestById.size}`);

// --- 3) Merge into the tracked people.
let gotHeadline = 0;
let gotLocation = 0;
for (const person of tracking.people) {
  const username = person.linkedinUrl?.match(/\/in\/([^/?#]+)/)?.[1] ?? "";
  const headline = headlineByUsername.get(username);
  if (headline && person.headline !== headline) {
    person.headline = headline;
    gotHeadline += 1;
  }
  const harvest = harvestById.get(username);
  if (harvest) {
    const location = String(harvest.location?.linkedinText ?? "").trim();
    if (location && !person.location) {
      person.location = location;
      gotLocation += 1;
    }
    const position = harvest.currentPositions?.[0];
    if (!person.headline && position?.title) {
      person.headline = [position.title, position.companyName]
        .filter(Boolean)
        .join(" at ");
      gotHeadline += 1;
    }
  }
}

await writeRow("market-intel:default", tracking);
log(`WROTE: headlines on ${gotHeadline}, locations on ${gotLocation} of ${tracking.people.length} people`);

const missing = tracking.people.filter((p) => !p.headline);
if (missing.length) {
  log(`still no full headline (no stored data): ${missing.map((p) => p.name).join(", ")}`);
}
