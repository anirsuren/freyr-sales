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
