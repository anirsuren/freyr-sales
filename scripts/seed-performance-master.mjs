// PERFORMANCE GOAL MASTER SEED — Suren's goals.xlsx, entered verbatim
// (Aug 11: "I need a master list of all the goals to be entered in one
// place"). Every goal type and primary goal from the sheet, Booked Revenue's
// three subgoals with Rukmini owning Growth Accounts, and the three goals his
// sheet marks Org Goal = Y. NO invented numbers: targets stay 0 ("not set
// yet"), no people are assigned, no actuals are logged — the team fills real
// intel in the app. Goals already in the live row are never touched;
// re-running never dupes.
//
//   node scripts/seed-performance-master.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ROW_ID = "performance-management";
const BY = "Suren's goal sheet";
const now = () => new Date().toISOString();
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const TYPES = [
  "Financial and Revenue Performance",
  "Lead Generation and Outreach",
  "Sales Activity & Engagement",
  "Proposal & Deal Execution",
];

// [type, name, unit, measure, pickedForOrg, subgoals?]
// unit: currency | count | percent · measure: total (running sum) | level (latest value)
const GOALS = [
  // Owners deliberately empty: only real registered accounts belong in the
  // live workspace (Anir, Aug 11: "you can't put fake accounts on real mode").
  [0, "Booked Revenue (Contract Value Signed)", "currency", "total", true, [
    { name: "Growth Accounts", owners: [] },
    { name: "Focused Account AMR", owners: [] },
    { name: "Focused Account EUA", owners: [] },
  ]],
  [0, "Billed Revenue", "currency", "total", false],
  [0, "Billed / Collected Revenue", "currency", "total", true],
  [0, "Pipeline Value Created ($)", "currency", "total", false],
  [0, "Sales Quota Attainment (% of Target Met)", "percent", "level", false],
  [0, "Win / Loss Ratio (%)", "percent", "level", true],
  [1, "Email Prospecting Campaigns Launched", "count", "total", false],
  [1, "Marketing Qualified Leads (MQLs) Generated", "count", "total", false],
  [1, "Website Organic & Paid Visitors", "count", "total", false],
  [1, "Content Assets Published (Blogs, Case Studies, Whitepapers)", "count", "total", false],
  [1, "Webinars / Online Events Hosted", "count", "total", false],
  [1, "Onsite Events Hosted", "count", "total", false],
  [1, "Linkedin Reachouts", "count", "total", false],
  [1, "Cold Reachouts", "count", "total", false],
  [1, "Social Media Posts Published", "count", "total", false],
  [2, "Sales Meetings Held (Virtual)", "count", "total", false],
  [2, "Sales Meetings Held (In-Person)", "count", "total", false],
  [2, "Discovery / Qualification Calls", "count", "total", false],
  [2, "Follow-up Touches / Call-Backs", "count", "total", false],
  [2, "Sales Accepted Leads (SALs)", "count", "total", false],
  [2, "Product Demos", "count", "total", false],
  [2, "Client Visits to Freyr Offices", "count", "total", false],
  [2, "Trade Shows / Industry Conferences Attended", "count", "total", false],
  [2, "Trade Shows / Industry Conferences Attended as Exhibitor", "count", "total", false],
  [2, "Trade Shows / Industry Conferences Attended as Speaker", "count", "total", false],
  [3, "RFPs / Bids Submitted", "count", "total", false],
  [3, "Proposals / Quotes Sent", "count", "total", false],
  [3, "RFPs Received & Reviewed", "count", "total", false],
  [3, "New Accounts / Logos Signed", "count", "total", false],
  [3, "Deals Moved to Late-Stage Negotiation", "count", "total", false],
  [3, "Average Deal Size / Contract Value", "currency", "level", false],
];

const { data, error } = await sb
  .from("offering_catalog_state")
  .select("catalog")
  .eq("id", ROW_ID)
  .maybeSingle();
if (error) throw new Error(error.message);

const state = data?.catalog && typeof data.catalog === "object"
  ? data.catalog
  : { types: [], goals: [], groups: [], actuals: [] };
state.types = Array.isArray(state.types) ? state.types : [];
state.goals = Array.isArray(state.goals) ? state.goals : [];
state.groups = Array.isArray(state.groups) ? state.groups : [];
state.actuals = Array.isArray(state.actuals) ? state.actuals : [];

let addedTypes = 0;
for (const t of TYPES) {
  if (!state.types.some((x) => String(x).toLowerCase() === t.toLowerCase())) {
    state.types.push(t);
    addedTypes++;
  }
}

const YEAR = new Date().getFullYear();
let addedGoals = 0;
let skipped = 0;
for (const [typeIdx, name, unit, measure, picked, subs] of GOALS) {
  if (state.goals.some((g) => String(g.name).toLowerCase() === name.toLowerCase())) {
    skipped++;
    continue;
  }
  state.goals.push({
    id: uid("pg"),
    name,
    type: TYPES[typeIdx],
    unit,
    measure,
    year: YEAR,
    target: 0,
    pickedForOrg: picked,
    verified: false,
    subgoals: (subs ?? []).map((s) => ({
      id: uid("sg"),
      name: s.name,
      target: 0,
      owners: s.owners,
      verified: false,
      people: [],
    })),
    createdBy: BY,
    createdAt: now(),
  });
  addedGoals++;
}

const { error: upErr } = await sb
  .from("offering_catalog_state")
  .upsert({ id: ROW_ID, catalog: state, updated_at: now() });
if (upErr) throw new Error(upErr.message);

console.log(
  `Goal master seeded: +${addedGoals} goals (${skipped} already present), +${addedTypes} types. ` +
    `Row now holds ${state.goals.length} goals, ${state.types.length} types, ` +
    `${state.groups.length} groups, ${state.actuals.length} actuals.`
);
