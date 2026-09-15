import test from "node:test";
import assert from "node:assert/strict";

import { setDataMode } from "../lib/dataMode";
import { mockDb } from "../lib/mock-db";
import {
  mockFillContracts,
  mockFillLeads,
  mockFillMeetings,
  mockFillOpportunities,
  mockFillSolutioning,
} from "../lib/mockFillLife";
import { listFdlComponents, listOfferings } from "../lib/offerings";

setDataMode("mock");

test("every mock customer has enough connected data to exercise each account tab", async () => {
  const [customers, contacts, sessions, interactions] = await Promise.all([
    mockDb.customers.list(),
    mockDb.contacts.list(),
    mockDb.pitchSessions.list(),
    mockDb.interactions.list(),
  ]);

  assert.ok(customers.length >= 100);
  for (const customer of customers) {
    const label = `${customer.id} ${customer.company_name}`;
    assert.ok(contacts.filter((row) => row.customer_id === customer.id).length >= 5, `${label}: contacts`);
    assert.ok(sessions.filter((row) => row.customer_id === customer.id).length >= 2, `${label}: sessions`);
    assert.ok(interactions.filter((row) => row.customer_id === customer.id).length >= 3, `${label}: interactions`);
    assert.ok((customer.offering_usage?.length ?? 0) >= 6, `${label}: offerings`);
    assert.ok(
      (customer.offering_usage ?? []).every((usage) => (usage.revenue_lines?.length ?? 0) > 0),
      `${label}: offering revenue`
    );
    assert.ok((customer.digital_components?.length ?? 0) >= 8, `${label}: components`);
  }
});

test("every mock offering has materials, owners, components, history, and opportunities", () => {
  const offerings = listOfferings();
  const opportunities = mockFillOpportunities();
  assert.ok(offerings.length >= 50);

  for (const offering of offerings) {
    const label = `${offering.id} ${offering.offering_name}`;
    assert.ok((offering.materials?.length ?? 0) >= 8, `${label}: materials`);
    assert.ok((offering.owners?.length ?? 0) >= 1, `${label}: owners`);
    assert.ok((offering.component_ids?.length ?? 0) >= 8, `${label}: components`);
    assert.ok((offering.roadmap_versions?.length ?? 0) >= 1, `${label}: history`);
    assert.ok(
      opportunities.some((deal) => deal.offeringIds.includes(offering.id)),
      `${label}: opportunities`
    );
  }
});

test("every mock component has versions, features, and history", () => {
  const components = listFdlComponents();
  assert.ok(components.length >= 60);
  for (const component of components) {
    const label = `${component.id} ${component.name}`;
    assert.ok(component.releases.length >= 1, `${label}: releases`);
    assert.ok(component.features.length >= 8, `${label}: features`);
    assert.ok((component.roadmap_versions?.length ?? 0) >= 1, `${label}: history`);
  }
});

test("every generated deal opens into populated downstream work", () => {
  const opportunities = mockFillOpportunities();
  const contracts = mockFillContracts();
  const meetings = mockFillMeetings();
  const solutioning = mockFillSolutioning();
  const leads = mockFillLeads();

  assert.ok(leads.length >= 100);
  for (const opportunity of opportunities) {
    assert.ok((opportunity.lines?.length ?? 0) >= 1, `${opportunity.id}: offering lines`);
    assert.ok(contracts.some((row) => row.opportunityId === opportunity.id), `${opportunity.id}: contract`);
    assert.ok(meetings.some((row) => row.opportunityIds.includes(opportunity.id)), `${opportunity.id}: meeting`);
    const requests = solutioning.filter((row) => row.opportunityIds.includes(opportunity.id));
    assert.ok(requests.length >= 4, `${opportunity.id}: solutioning shelves`);
    for (const request of requests) {
      assert.deepEqual(
        new Set(request.docs.map((document) => document.category)),
        new Set(["customer", "working", "final", "analysis"]),
        `${request.id}: document shelves`
      );
    }
  }
});
