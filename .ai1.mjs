const B = "http://localhost:3006";
const H = { "Content-Type": "application/json", Origin: B };
const ask = async (message, path) => {
  const t0 = Date.now();
  const r = await fetch(`${B}/api/agent/converse`, { method: "POST", headers: H,
    body: JSON.stringify({ message, path, history: [] }) });
  const d = await r.json().catch(()=>({}));
  return { s: r.status, ms: Date.now()-t0, reply: String(d.reply||d.content||d.error||"").replace(/\s+/g," ") };
};
const Q = [
  ["/offerings",            "How do I add a person to an offering?"],
  ["/offerings/of-001",     "What sales materials do we have for Freya.Register?"],
  ["/performance/org",      "How do I log a result against a goal?"],
  ["/performance/org",      "How do I verify someone's number?"],
  ["/customers",            "How do I assign an owner to several accounts at once?"],
];
console.log("PAGE".padEnd(20), "Q".padEnd(46), "ms".padEnd(6), "ANSWER");
for (const [path, q] of Q) {
  const a = await ask(q, path);
  console.log("-".repeat(110));
  console.log(`${path.padEnd(20)} ${q.slice(0,46).padEnd(46)} ${String(a.ms).padEnd(6)} [${a.s}]`);
  console.log("   " + a.reply.slice(0, 300));
}
