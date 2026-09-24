import assert from "node:assert/strict";
import test from "node:test";

import { mockOpportunityReview } from "../lib/mockOpportunityReview";
import type { Opportunity } from "../lib/opportunitiesShared";

test("generated mock reviews connect their stakeholders and actions to the deal", () => {
  const deal = {
    id: "fill10-opp-020-2",
    customer: "Tessera Bio",
    name: "Freya.Register + Mia + Cia. Tessera Bio",
    offeringLabels: ["Freya.Register + Mia + Cia"],
    owner: "Hannah Schmidt",
  } as Opportunity;
  const review = mockOpportunityReview(deal, 55);

  assert.match(review.compellingEvent, /Tessera Bio/);
  assert.match(review.nextStep.objective, /Freya.Register \+ Mia \+ Cia/);
  assert.equal(review.people[0]?.contactId, "cont-fill-020-1");
  assert.equal(review.people[0]?.name, review.nextStep.stakeholderName);
  assert.ok(review.actions.every((action) => action.owner === deal.owner && action.deadline));
  assert.deepEqual(mockOpportunityReview(deal, 55), review);
});
