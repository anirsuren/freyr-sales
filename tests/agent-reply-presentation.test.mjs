import test from "node:test";
import assert from "node:assert/strict";
import { hideActionIds } from "../lib/agentReplyPresentation.ts";

test("an action ID in an explanation becomes the deal's name", () => {
  const proposal = {
    id: "act-muo3v33j2mh59",
    action: "create_opportunity",
    summary: 'Open a new deal "GRI — Galderma" at Galderma: estimated TCV $100,000, 10% confidence, signing by 2026-11-15.',
  };
  assert.equal(
    hideActionIds("I pulled that date from the pending proposal `act-muo3v33j2mh59` that was waiting.", [proposal]),
    'I pulled that date from the proposal for the "GRI — Galderma" deal that was waiting.'
  );
  assert.equal(hideActionIds("Proposal act-muo3v33j2mh59 is pending.", [proposal]), 'the proposal for the "GRI — Galderma" deal is pending.');
});

test("unknown internal action IDs are hidden too", () => {
  assert.equal(hideActionIds("It came from act-abc123.", []), "It came from the proposed change.");
});
