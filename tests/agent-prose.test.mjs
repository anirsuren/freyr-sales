import test from "node:test";
import assert from "node:assert/strict";
import { withoutProseDashes } from "../lib/agentProse.ts";

test("the agent's own dashes become commas; record names keep theirs", () => {
  assert.equal(
    withoutProseDashes("1. **[AI Agents — GSK](/opportunities/seed-opp-21)** ($180,000 USD, Qualify stage) — Next steps are noted."),
    "1. **[AI Agents — GSK](/opportunities/seed-opp-21)** ($180,000 USD, Qualify stage), Next steps are noted.",
  );
  assert.equal(withoutProseDashes("Pages 10–20 cover it — mostly."), "Pages 10-20 cover it, mostly.");
  assert.equal(withoutProseDashes("The deal **GRI — Haleon** is open."), "The deal **GRI — Haleon** is open.");
  assert.equal(withoutProseDashes("No dashes here."), "No dashes here.");
  assert.equal(withoutProseDashes("```\na — b\n```"), "```\na — b\n```");
});

test("a 'thought' label written as text never opens the answer", async () => {
  const { visibleResponseText } = await import("../lib/vertex.ts");
  const response = (...texts) => ({ candidates: [{ content: { parts: texts.map((text) => ({ text })) } }] });
  assert.equal(visibleResponseText(response("thought\nYou have no upcoming meetings.")), "You have no upcoming meetings.");
  assert.equal(visibleResponseText(response("thought", "\n", "Nothing is due.")), "Nothing is due.");
  assert.equal(visibleResponseText(response("Thoughtful pricing wins deals.")), "Thoughtful pricing wins deals.");
  // A real thought part is dropped by its flag, not by its words.
  assert.equal(visibleResponseText({ candidates: [{ content: { parts: [{ text: "secret plan", thought: true }, { text: "Answer." }] } }] }), "Answer.");
});

test("a dash right after a link or bold name becomes a comma, never glue", () => {
  assert.equal(withoutProseDashes("owns [A](/opportunities/a) and [B](/opportunities/b) — while the rest are unassigned."), "owns [A](/opportunities/a) and [B](/opportunities/b), while the rest are unassigned.");
  assert.equal(withoutProseDashes("owns [B](/opportunities/b)—while the rest."), "owns [B](/opportunities/b), while the rest.");
  assert.equal(withoutProseDashes("**Bold** — then text"), "**Bold**, then text");
  assert.equal(withoutProseDashes("- **GRI — Haleon** — $500,000"), "- **GRI — Haleon**, $500,000");
  // A dash used as a bullet at a real line start still goes cleanly.
  assert.equal(withoutProseDashes("Two things:\n— first\n— second"), "Two things:\nfirst\nsecond");
});

test("a page path becomes a named link; other slashes stay", async () => {
  const { linkBarePaths } = await import("../lib/agentProse.ts");
  assert.equal(linkBarePaths("click the **People performance** tab at `/performance/people`."), "click the **People performance** tab at [People](/performance/people).");
  assert.equal(linkBarePaths("**Group performance** (`/performance/groups`)"), "**Group performance** ([Groups](/performance/groups))");
  assert.equal(linkBarePaths("open /settings?tab=integrations to connect"), "open [Integrations](/settings?tab=integrations) to connect");
  assert.equal(linkBarePaths("see [Team](/team) and 24/7 support, and/or `/usr/bin`"), "see [Team](/team) and 24/7 support, and/or `/usr/bin`");
  assert.equal(linkBarePaths("```\n/performance/people\n```"), "```\n/performance/people\n```");
});

test("a record page path is never turned into a link", async () => {
  const { linkBarePaths } = await import("../lib/agentProse.ts");
  assert.equal(linkBarePaths("a page that does not exist (/opportunities/does-not-exist)"), "a page that does not exist (/opportunities/does-not-exist)");
  assert.equal(linkBarePaths("see `/customers/40a7a3c3-5a32-493d-827f-1c88a0cf0ec6`"), "see `/customers/40a7a3c3-5a32-493d-827f-1c88a0cf0ec6`");
  assert.equal(linkBarePaths("open /agent/settings"), "open [Settings](/agent/settings)");
});

test("malformed internal citation host is repaired without rewriting external hosts", async () => {
 const { linkBarePaths } = await import("../lib/agentProse.ts");
 assert.equal(linkBarePaths("[[1](//offerings/of-001?tab=materials&material=m-qjuhtpe)]"), "[[1](/offerings/of-001?tab=materials&material=m-qjuhtpe)]");
 assert.equal(linkBarePaths("[Source](//example.com/news)"), "[Source](//example.com/news)");
});
