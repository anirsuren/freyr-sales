// TEMP test harness for the agent sweep. Delete when done.
// usage: node ask-agent.mjs batchfile.json
import fs from "node:fs";

const BASE = "http://localhost:3006";
const file = process.argv[2];
const qs = JSON.parse(fs.readFileSync(file, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const once = async ({ path, message, history = [] }) => {
  const res = await fetch(`${BASE}/api/agent/converse`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, path, history }),
  });
  const txt = await res.text();
  if (!res.ok) return { ok: false, out: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  try {
    const j = JSON.parse(txt);
    return { ok: true, out: j.reply || j.text || JSON.stringify(j).slice(0, 800) };
  } catch {
    return { ok: false, out: txt.slice(0, 200) };
  }
};

const ask = async (q) => {
  for (let i = 0; i < 4; i++) {
    const r = await once(q).catch((e) => ({ ok: false, out: String(e) }));
    if (r.ok) return r.out;
    await sleep(4000 * (i + 1));
  }
  return "FAILED after retries";
};

const out = [];
for (const q of qs) {
  const reply = await ask(q);
  const block = `\n========================================\nPATH: ${q.path}\nQ: ${q.message}\nA: ${reply}\n`;
  console.log(block);
  out.push(block);
}
fs.writeFileSync(file.replace(/\.json$/, ".out.txt"), out.join("\n"));
