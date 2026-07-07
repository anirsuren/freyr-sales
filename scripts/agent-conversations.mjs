// 100 multi-turn agent conversations (V11). Each scenario is a real 5–7 turn
// chat run through /api/agent/converse, holding the conversation history exactly
// like the UI does. We don't just check that it *answered* — for action turns we
// assert the agent actually DID the work (saved a draft, set a follow-up, logged
// a call) and that the work shows up afterwards in "what did you do recently?".
//
//   node scripts/agent-conversations.mjs
//
const BASE = process.env.BASE || "http://localhost:3001";

const ERR = /something went wrong|couldn't answer|sorry —/i;
const CONFIRM = /\b(done|saved|set|logged|scheduled)\b/i;

async function turn(message, history) {
  const res = await fetch(`${BASE}/api/agent/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Force the deterministic brain so this breadth+actions check is reproducible
    // whether or not an API key is set (real-AI quality is validated separately).
    body: JSON.stringify({ message, history, mock: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for "${message}"`);
  return res.json();
}

// ---- scenario templates: (A, B) -> { name, turns:[{msg, expect}] } ----------
// expect: { action, contains, variesFrom }  (all optional)
const TEMPLATES = [
  (A) => ({
    name: "Morning triage → draft → save",
    turns: [
      { msg: "what should I focus on today?" },
      { msg: "which deals are cooling?" },
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "make it shorter", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "Saved a draft" } },
    ],
  }),
  (A) => ({
    name: "Account deep-dive → call prep → follow-up",
    turns: [
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: "who should I call there?" },
      { msg: `prep me for a call with ${A}`, expect: { contains: A } },
      { msg: `draft a follow-up to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} next week`, expect: { action: "set_followup", contains: A } },
    ],
  }),
  (A) => ({
    name: "Forecast review → draft → save",
    turns: [
      { msg: "what's my open pipeline worth?" },
      { msg: "what are my biggest deals?" },
      { msg: "which accounts are at risk?" },
      { msg: "who needs a follow-up?" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
    ],
  }),
  (A) => ({
    name: "Cooling sweep → formal draft → follow-up",
    turns: [
      { msg: "which deals are cooling?" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "make it more formal", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} in 3 days`, expect: { action: "set_followup", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "Set a follow-up" } },
    ],
  }),
  (A) => ({
    name: "Greeting + smalltalk variety",
    turns: [
      { msg: "hi" },
      { msg: "whats up" },
      { msg: "whats up", expect: { variesFrom: 1 } }, // must differ from prior "whats up"
      { msg: "what can you do?" },
      { msg: "what should I focus on today?" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
    ],
  }),
  (A) => ({
    name: "Log a call → follow-up → draft",
    turns: [
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `log a call with ${A}`, expect: { action: "log_touch", contains: A } },
      { msg: `set a follow-up with ${A} friday`, expect: { action: "set_followup", contains: A } },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
    ],
  }),
  (A) => ({
    name: "Approvals → thanks → cool → draft",
    turns: [
      { msg: "what's waiting for my approval?" },
      { msg: "thanks" },
      { msg: "which deals are cooling?" },
      { msg: "cool" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
    ],
  }),
  (A) => ({
    name: "At-risk → re-engage draft → save → follow-up",
    turns: [
      { msg: "who's at risk?" },
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `draft re-engagement to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "make it shorter", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} next week`, expect: { action: "set_followup", contains: A } },
    ],
  }),
  (A) => ({
    name: "Counts → biggest → account",
    turns: [
      { msg: "how many open deals do I have?" },
      { msg: "how many accounts do I have?" },
      { msg: "how many contacts are mapped?" },
      { msg: "what are my biggest deals?" },
      { msg: `tell me about ${A}`, expect: { contains: A } },
    ],
  }),
  (A) => ({
    name: "Account name → pronoun draft → save",
    turns: [
      { msg: A, expect: { contains: A } },
      { msg: "draft an email to them", expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: "set a follow-up with them next week", expect: { action: "set_followup", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "draft" } },
    ],
  }),
  (A) => ({
    name: "Refine chain → save → follow-up tomorrow",
    turns: [
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "make it shorter", expect: { contains: "Subject:" } },
      { msg: "make it more formal", expect: { contains: "Subject:" } },
      { msg: "make it warmer", expect: { contains: "Subject:" } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} tomorrow`, expect: { action: "set_followup", contains: A } },
    ],
  }),
  (A, B) => ({
    name: "Multi-account switch",
    turns: [
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `now tell me about ${B}`, expect: { contains: B } },
      { msg: `draft an email to ${B}`, expect: { contains: ["Subject:", B] } },
      { msg: "save it", expect: { action: "save_draft", contains: B } },
      { msg: `set a follow-up with ${A} next week`, expect: { action: "set_followup", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "Saved a draft" } },
    ],
  }),
  (A) => ({
    name: "Pipeline → cooling → draft → log",
    turns: [
      { msg: "what's my open pipeline worth?" },
      { msg: "which of those are cooling?" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `log a call with ${A}`, expect: { action: "log_touch", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "Logged a touch" } },
    ],
  }),
  (A) => ({
    name: "Help → draft → save → follow-up 2 weeks",
    turns: [
      { msg: "how does this work?" },
      { msg: `draft an email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save the draft", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} in 2 weeks`, expect: { action: "set_followup", contains: A } },
      { msg: "who needs a follow-up?" },
    ],
  }),
  (A) => ({
    name: "Neglect phrasing → re-engage → save → monday",
    turns: [
      { msg: "who am I neglecting?" },
      { msg: `tell me about ${A}`, expect: { contains: A } },
      { msg: `draft re-engagement to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `remind me to follow up with ${A} on monday`, expect: { action: "set_followup", contains: A } },
    ],
  }),
  (A) => ({
    name: "Quick draft + save + follow-up + thanks",
    turns: [
      { msg: `draft a short email to ${A}`, expect: { contains: ["Subject:", A] } },
      { msg: "save it", expect: { action: "save_draft", contains: A } },
      { msg: `set a follow-up with ${A} next week`, expect: { action: "set_followup", contains: A } },
      { msg: "what did you do recently?", expect: { contains: "Saved a draft" } },
      { msg: "thanks" },
    ],
  }),
];

function checkTurn(scenarioName, idx, msg, data, expect, replies) {
  const reply = String(data.reply || "");
  const fails = [];
  if (!reply.trim()) fails.push("empty reply");
  if (ERR.test(reply)) fails.push("error reply");
  if (expect?.action) {
    if (data.source !== "action") fails.push(`expected an action (source=${data.source})`);
    if (data.did !== expect.action) fails.push(`expected did=${expect.action}, got ${data.did}`);
    if (!CONFIRM.test(reply)) fails.push("action reply not a confirmation");
  }
  if (expect?.contains) {
    const needles = Array.isArray(expect.contains) ? expect.contains : [expect.contains];
    for (const n of needles) {
      if (!reply.toLowerCase().includes(String(n).toLowerCase()))
        fails.push(`reply missing "${n}"`);
    }
  }
  if (typeof expect?.variesFrom === "number") {
    if (reply.trim() === (replies[expect.variesFrom] || "").trim())
      fails.push("repeated identical reply (canned)");
  }
  return fails.map((f) => `   ✗ turn ${idx + 1} "${msg}": ${f}`);
}

async function runScenario(name, turns) {
  const history = [];
  const replies = [];
  const fails = [];
  for (let i = 0; i < turns.length; i++) {
    const { msg, expect } = turns[i];
    let data;
    try {
      data = await turn(msg, history);
    } catch (e) {
      fails.push(`   ✗ turn ${i + 1} "${msg}": ${e.message}`);
      replies.push("");
      continue;
    }
    fails.push(...checkTurn(name, i, msg, data, expect, replies));
    replies.push(String(data.reply || ""));
    history.push({ role: "user", text: msg });
    history.push({ role: "agent", text: String(data.reply || "") });
  }
  return fails;
}

async function main() {
  const r = await fetch(`${BASE}/api/customers`);
  const { customers } = await r.json();
  const names = customers.map((c) => c.company_name);
  if (names.length < 2) throw new Error("need at least 2 accounts");

  // Build 100 scenarios: every template across rotating account pairs.
  const scenarios = [];
  let ai = 0;
  while (scenarios.length < 100) {
    for (const tpl of TEMPLATES) {
      const A = names[ai % names.length];
      const B = names[(ai + 1) % names.length];
      scenarios.push(tpl(A, B));
      ai++;
      if (scenarios.length >= 100) break;
    }
  }

  let pass = 0;
  let totalTurns = 0;
  let actionTurns = 0;
  const failures = [];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    totalTurns += s.turns.length;
    actionTurns += s.turns.filter((t) => t.expect?.action).length;
    const fails = await runScenario(s.name, s.turns);
    if (fails.length === 0) {
      pass++;
    } else {
      failures.push(`#${i + 1} ${s.name}\n${fails.join("\n")}`);
    }
    if ((i + 1) % 10 === 0) process.stdout.write(`  …${i + 1}/100\n`);
  }

  console.log("\n========================================");
  console.log(`Scenarios:    ${pass}/${scenarios.length} passed`);
  console.log(`Conversation turns exercised: ${totalTurns}`);
  console.log(`Action turns (real writes) verified: ${actionTurns}`);
  console.log("========================================");
  if (failures.length) {
    console.log("\nFAILURES:\n" + failures.join("\n\n"));
    process.exit(1);
  } else {
    console.log("All 100 multi-turn conversations passed — answers grounded and actions executed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
