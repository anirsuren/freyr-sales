// 100 escalating multi-turn conversations (V12) — modeled on the real chats
// Suren has, easy → very hard. The KEY assertion: the agent must never "blank"
// (no "I don't have the details", "you'd need to check the app yourself", etc.)
// on a question the data can answer. It also checks specific content and that
// actions/pitches actually resolve.
//
//   node scripts/agent-hard.mjs            # deterministic brain (reproducible)
//   LIVE=1 node scripts/agent-hard.mjs     # real Claude on a representative subset
//
const BASE = process.env.BASE || "http://localhost:3001";
const LIVE = process.env.LIVE === "1";

// Phrases that mean the agent gave up instead of using its data.
const BLANK =
  /(i (don'?t|do not) have (the )?(details?|specifics?|that|it|info|data)|don'?t have (the )?(details?|specifics?) (on|for|about)|you'?d need to (check|look)|not in my (current )?(data|view)|i can'?t (see|access|find|pull up)|don'?t have access|no (information|data) on (that|it|which)|check the (approvals? )?(queue|inbox|app) (directly|yourself))/i;
const ERR = /something went wrong|couldn't answer|sorry —/i;

async function turn(message, history) {
  const res = await fetch(`${BASE}/api/agent/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, ...(LIVE ? {} : { mock: true }) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Fixed anchors from the seed (stable).
const PENDING = "Cortexa Biopharma"; // pitch in review
const COOLING = "Aether Medical Devices"; // quiet, cooling
const STALE = "BioNex Therapeutics"; // 214d at-risk

// expect: { noBlank(default true), contains, action }
const TEMPLATES = [
  // ---- EASY: orientation ----
  (A) => ({
    name: "Orientation",
    turns: [
      { msg: "hey" },
      { msg: "what can you do" },
      { msg: "what should I do" },
      { msg: "what's my pipeline worth", expect: { contains: "$" } },
      { msg: "how many open deals do I have", expect: { contains: "deal" } },
    ],
  }),
  // ---- the exact conversation Suren sent ----
  () => ({
    name: "Pasted convo — pending pitches",
    turns: [
      { msg: "hey" },
      { msg: "what canu do" },
      { msg: "what should i do" },
      { msg: "what are the 2 pending pitches", expect: { contains: PENDING } },
      { msg: `show me the pitch for ${PENDING}`, expect: { action: "show_pitch", contains: PENDING } },
      { msg: `draft a re-engagement email for ${COOLING}`, expect: { contains: ["Subject:", COOLING] } },
      { msg: "save it", expect: { action: "save_draft" } },
    ],
  }),
  // ---- MEDIUM: the lists ----
  () => ({
    name: "The lists",
    turns: [
      { msg: "which deals are cooling" },
      { msg: "who's at risk" },
      { msg: "who needs a follow-up" },
      { msg: "what are my biggest deals", expect: { contains: "$" } },
      { msg: "what's waiting for my approval", expect: { contains: PENDING } },
    ],
  }),
  // ---- MEDIUM-HARD: per-account specifics (the stuff it used to blank on) ----
  (A) => ({
    name: "Account specifics",
    turns: [
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `who's the contact at ${A}` },
      { msg: `what's the contact email for ${A}`, expect: { contains: "@" } },
      { msg: `what stage is the ${A} deal in` },
      { msg: `prep me for a call with ${A}`, expect: { contains: A } },
    ],
  }),
  // ---- HARD: pitch → refine → save → follow-up ----
  (A) => ({
    name: "Pitch → save → follow-up",
    turns: [
      { msg: `show me the pitch for ${A}`, expect: { action: "show_pitch", contains: A } },
      { msg: "make it shorter", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} next week`, expect: { action: "set_followup", contains: A } },
      { msg: "what did you do recently", expect: { contains: "draft" } },
    ],
  }),
  // ---- HARD: re-engage a cooling account end-to-end ----
  () => ({
    name: "Re-engage cooling",
    turns: [
      { msg: "which deals are cooling" },
      { msg: `re-engage ${COOLING}`, expect: { contains: ["Subject:", COOLING] } },
      { msg: "make it more formal", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: COOLING } },
      { msg: `set a follow-up with ${COOLING} in 3 days`, expect: { action: "set_followup" } },
    ],
  }),
  // ---- HARD: the stale account decision ----
  () => ({
    name: "Stale account",
    turns: [
      { msg: `tell me about ${STALE}`, expect: { contains: STALE } },
      { msg: `who's the contact at ${STALE}` },
      { msg: `when did I last touch ${STALE}` },
      { msg: `draft a re-engagement email for ${STALE}`, expect: { contains: ["Subject:", STALE] } },
      { msg: "save it", expect: { action: "save_draft", contains: STALE } },
    ],
  }),
  // ---- MEDIUM: counts then a specific ----
  (A) => ({
    name: "Counts + specific",
    turns: [
      { msg: "how many accounts do I have" },
      { msg: "how many contacts are mapped" },
      { msg: "how many open deals" },
      { msg: `show me the pitch for ${A}`, expect: { action: "show_pitch", contains: A } },
    ],
  }),
  // ---- VERY HARD: a full 7-turn morning ----
  (A) => ({
    name: "Full morning",
    turns: [
      { msg: "hey" },
      { msg: "what should I focus on today" },
      { msg: "what's waiting for my approval", expect: { contains: PENDING } },
      { msg: `show me the pitch for ${PENDING}`, expect: { action: "show_pitch", contains: PENDING } },
      { msg: "save it", expect: { action: "save_draft", contains: PENDING } },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
    ],
  }),
  // ---- HARD: log activity + schedule ----
  (A) => ({
    name: "Log + schedule",
    turns: [
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `log a call with ${A}`, expect: { action: "log_touch", contains: A } },
      { msg: `set a follow-up with ${A} friday`, expect: { action: "set_followup", contains: A } },
      { msg: `draft a follow-up to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
    ],
  }),
];

function check(idx, msg, data, expect, replies) {
  const reply = String(data.reply || "");
  const fails = [];
  if (!reply.trim()) fails.push("empty reply");
  if (ERR.test(reply)) fails.push("error reply");
  if (BLANK.test(reply)) fails.push(`BLANKED: "${reply.slice(0, 90)}…"`);
  if (expect?.action) {
    if (data.did !== expect.action) fails.push(`expected ${expect.action}, got did=${data.did} source=${data.source}`);
  }
  if (expect?.contains) {
    const lc = reply.toLowerCase();
    for (const raw of Array.isArray(expect.contains) ? expect.contains : [expect.contains]) {
      const n = String(raw).toLowerCase();
      const firstWord = n.split(/\s+/)[0];
      // For multi-word company names, accept the distinctive first word
      // (Claude naturally shortens "Solara Consumer Health" → "Solara").
      const ok = lc.includes(n) || (n.includes(" ") && firstWord.length >= 4 && lc.includes(firstWord));
      if (!ok) fails.push(`missing "${raw}"`);
    }
  }
  return fails.map((f) => `   ✗ turn ${idx + 1} "${msg}": ${f}`);
}

async function runScenario(turns) {
  const history = [];
  const replies = [];
  const fails = [];
  for (let i = 0; i < turns.length; i++) {
    let data;
    try {
      data = await turn(turns[i].msg, history);
    } catch (e) {
      fails.push(`   ✗ turn ${i + 1} "${turns[i].msg}": ${e.message}`);
      continue;
    }
    fails.push(...check(i, turns[i].msg, data, turns[i].expect, replies));
    replies.push(String(data.reply || ""));
    history.push({ role: "user", text: turns[i].msg });
    history.push({ role: "agent", text: String(data.reply || "") });
  }
  return fails;
}

async function main() {
  const r = await fetch(`${BASE}/api/customers`);
  // Only rotate over accounts that actually have a mapped contact + pitch, so
  // per-account "email"/"pitch" questions are genuinely answerable.
  const names = (await r.json()).customers
    .filter((c) => (c.contact_count || 0) > 0)
    .map((c) => c.company_name);

  const scenarios = [];
  const target = LIVE ? 12 : 100;
  let ai = 0;
  while (scenarios.length < target) {
    for (const tpl of TEMPLATES) {
      scenarios.push(tpl(names[ai % names.length], names[(ai + 1) % names.length]));
      ai++;
      if (scenarios.length >= target) break;
    }
  }

  let pass = 0;
  let turns = 0;
  const failures = [];
  for (let i = 0; i < scenarios.length; i++) {
    turns += scenarios[i].turns.length;
    const fails = await runScenario(scenarios[i].turns);
    if (fails.length === 0) pass++;
    else failures.push(`#${i + 1} ${scenarios[i].name}\n${fails.join("\n")}`);
    if (!LIVE && (i + 1) % 10 === 0) process.stdout.write(`  …${i + 1}/${target}\n`);
  }

  console.log("\n========================================");
  console.log(`Mode: ${LIVE ? "LIVE (real Claude)" : "deterministic brain"}`);
  console.log(`Scenarios: ${pass}/${scenarios.length} passed · ${turns} turns`);
  console.log("========================================");
  if (failures.length) {
    console.log("\nFAILURES:\n" + failures.join("\n\n"));
    process.exit(1);
  }
  console.log("All conversations passed — no blanking, every answer grounded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
