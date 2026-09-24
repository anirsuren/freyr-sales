import { mockFillContact } from "./mockFillCast";
import type { Opportunity, OpportunityReview } from "./opportunitiesShared";

/** Deterministic example review for seed-owned Mock opportunities only. */
export function mockOpportunityReview(deal: Opportunity, ordinal: number): OpportunityReview {
  const offering = deal.offeringLabels[0] || deal.name.split(".")[0] || "the proposed service";
  const account = deal.customer;
  const fillAccount = /^fill\d+-opp-(\d+)-/.exec(deal.id);
  const accountNo = fillAccount ? Number(fillAccount[1]) : (ordinal % 36) + 1;
  const contact = (slot: number) => mockFillContact(accountNo, slot);
  const sponsor = contact(0);
  const evaluator = contact(1);
  const budgetHolder = contact(2);
  const contactId = (slot: number) => fillAccount ? contact(slot).id : undefined;
  const nextDate = `2026-10-${String(5 + (ordinal % 20)).padStart(2, "0")}`;
  const actionDate = `2026-10-${String(11 + (ordinal % 17)).padStart(2, "0")}`;

  return {
    compellingEvent: `${account} is preparing its next regulatory milestone. The team needs an agreed ${offering} approach before the scope and budget are locked; delay would push the planned start into the next review cycle.`,
    nextStep: {
      date: nextDate,
      objective: `Confirm the ${offering} scope, success measures, and decision path with the customer.`,
      stakeholderName: sponsor.name,
      stakeholderTitle: "VP, Regulatory Affairs",
    },
    obstacles: [
      "The customer has not yet agreed which work stays with its internal regulatory team.",
      "Procurement needs a phased price and a clear handoff plan before it will approve the work.",
    ],
    competitors: [["Veeva"], ["IQVIA"], ["ArisGlobal"]][ordinal % 3]!,
    strategy: `Lead with a short, measurable ${offering} pilot. Show the customer how Freyr will reduce review cycles, assign one accountable delivery lead, and make the handoff to its internal team predictable.`,
    people: [
      { id: `${deal.id}-review-sponsor`, contactId: contactId(0), seniority: "senior", function: "business", name: sponsor.name, title: "VP, Regulatory Affairs", role: "Executive Sponsor", linkedin: "", sentiment: "Positive" },
      { id: `${deal.id}-review-budget`, contactId: contactId(2), seniority: "senior", function: "other", name: budgetHolder.name, title: "Director, Procurement", role: "Budget Holder", linkedin: "", sentiment: "Neutral" },
      { id: `${deal.id}-review-evaluator`, contactId: contactId(1), seniority: "manager", function: "it", name: evaluator.name, title: "Director, Regulatory Systems", role: "Evaluation Lead", linkedin: "", sentiment: "Positive" },
    ],
    thirdParties: [{ id: `${deal.id}-review-advisor`, company: "Aster Regulatory Advisors", role: "Reviews the proposed delivery approach with the customer team", sentiment: "Neutral" }],
    actions: [
      { id: `${deal.id}-review-action-1`, action: `Send a phased ${offering} scope and pilot success criteria.`, owner: deal.owner || "Audrey Kingsley", deadline: nextDate },
      { id: `${deal.id}-review-action-2`, action: "Arrange a joint review with Regulatory Affairs and Procurement.", owner: deal.owner || "Audrey Kingsley", deadline: actionDate },
    ],
  };
}
