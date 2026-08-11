// ABOUT + FOLLOWERS SWEEP (Anir, Aug 11: "ok deploy it" on the $0.67 offer).
// One apimaestro~linkedin-profile-detail run per tracked person ($0.005 each,
// ~$0.67 for the roster) to fill the two fields no stored run ever carried:
// the About paragraph and the follower count. Headline/location/photo are
// refreshed too when the pull has richer values.
//
// Spend safety: HARD_CAP with a spent counter that is NEVER reset (the July
// people-sync bug), and the tracking row checkpoints every 10 people so an
// interrupt loses nothing.
//
//   node scripts/market-intel-people-about.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const HARD_CAP_USD = 1.5;
const COST_PER_PROFILE = 0.005;

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

async function profileDetail(username) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    }
  );
  if (!res.ok) throw new Error(`actor ${res.status}`);
  const items = await res.json();
  return Array.isArray(items) ? items[0]?.basic_info : null;
}

const tracking = await readRow("market-intel:default");
if (!tracking?.people?.length) {
  log("no tracked people; nothing to do");
  process.exit(0);
}

let spent = 0; // never reset — this is the July lesson
let enriched = 0;
let failed = 0;
let sinceCheckpoint = 0;

for (const person of tracking.people) {
  if (person.about && person.followerCount != null) continue; // already rich
  if (spent + COST_PER_PROFILE > HARD_CAP_USD) {
    log(`HARD CAP ${HARD_CAP_USD} reached at $${spent.toFixed(3)}; stopping`);
    break;
  }
  const username = person.linkedinUrl?.match(/\/in\/([^/?#]+)/)?.[1];
  if (!username) continue;
  try {
    const info = await profileDetail(username);
    spent += COST_PER_PROFILE;
    if (!info) {
      failed += 1;
      continue;
    }
    const about = String(info.about ?? "").trim().slice(0, 800);
    if (about) person.about = about;
    if (typeof info.follower_count === "number")
      person.followerCount = info.follower_count;
    const headline = String(info.headline ?? "").trim();
    if (headline) person.headline = headline;
    const location = String(info.location?.full ?? "").trim();
    if (location) person.location = location;
    if (!person.photoUrl && info.profile_picture_url)
      person.photoUrl = String(info.profile_picture_url);
    enriched += 1;
    sinceCheckpoint += 1;
    if (sinceCheckpoint >= 10) {
      await writeRow("market-intel:default", tracking);
      sinceCheckpoint = 0;
      log(`checkpoint: ${enriched} enriched, $${spent.toFixed(3)} spent`);
    }
  } catch (err) {
    spent += COST_PER_PROFILE; // failed runs still bill
    failed += 1;
    log(`${person.name}: ${err.message}`);
  }
}

await writeRow("market-intel:default", tracking);
const withAbout = tracking.people.filter((p) => p.about).length;
const withFollowers = tracking.people.filter((p) => p.followerCount != null).length;
log(
  `DONE: ${enriched} enriched, ${failed} failed, $${spent.toFixed(3)} spent · ` +
    `${withAbout}/${tracking.people.length} have About, ${withFollowers}/${tracking.people.length} have followers`
);
