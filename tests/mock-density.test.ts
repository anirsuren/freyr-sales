import test from "node:test";
import assert from "node:assert/strict";

import { setDataMode } from "../lib/dataMode";
import { mockDb } from "../lib/mock-db";
import {
  FILL_GENERATION,
  isStaleFillRow,
  mockFillContracts,
  mockFillLeads,
  mockFillMeetings,
  mockFillOpportunities,
  mockFillSolutioning,
} from "../lib/mockFillLife";
import { listFdlComponents, listOfferings } from "../lib/offerings";
import { RECORDINGS } from "../lib/recordings";
import { listVoiceQueue } from "../lib/voice";
import { listCampaigns } from "../lib/campaigns";

setDataMode("mock");

test("every mock customer has enough connected data to exercise each account tab", async () => {
  const [customers, contacts, sessions, interactions] = await Promise.all([
    mockDb.customers.list(),
    mockDb.contacts.list(),
    mockDb.pitchSessions.list(),
    mockDb.interactions.list(),
  ]);

  assert.ok(customers.length >= 40 && customers.length <= 60, "realistic account book");
  assert.equal(
    new Set(customers.map((customer) => customer.company_name)).size,
    customers.length,
    "every mock company name is unique"
  );
  assert.equal(
    new Set(contacts.map((contact) => contact.full_name)).size,
    contacts.length,
    "every mock contact name is unique"
  );
  const givenNames = contacts.map((contact) =>
    contact.full_name.replace(/^(?:Dr\.|Prof\.)\s+/, "").split(/\s+/)[0]
  );
  assert.equal(
    new Set(givenNames).size,
    givenNames.length,
    "the mock directory does not cluster unrelated people under the same given name"
  );
  assert.equal(contacts.length, customers.length * 5, "five distinct contacts per account");
  assert.equal(sessions.length, customers.length * 2, "two pitch sessions per account");
  assert.equal(interactions.length, customers.length * 3, "three interactions per account");
  for (const customer of customers) {
    const label = `${customer.id} ${customer.company_name}`;
    assert.ok(contacts.filter((row) => row.customer_id === customer.id).length >= 5, `${label}: contacts`);
    assert.ok(sessions.filter((row) => row.customer_id === customer.id).length >= 2, `${label}: sessions`);
    assert.ok(interactions.filter((row) => row.customer_id === customer.id).length >= 3, `${label}: interactions`);
    assert.ok((customer.offering_usage?.length ?? 0) >= 4, `${label}: offerings`);
    if (customer.id.startsWith("cust-fill-")) {
      assert.ok((customer.offering_usage?.length ?? 0) <= 5, `${label}: realistic offering count`);
    }
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

  assert.ok(leads.length >= 40 && leads.length <= 90, "realistic generated lead count");
  assert.equal(
    new Set(leads.map((lead) => lead.name)).size,
    leads.length,
    "generated leads use distinct contact identities"
  );
  assert.ok(opportunities.length >= 45 && opportunities.length <= 90, "realistic generated deal count");
  assert.equal(contracts.length, opportunities.length, "one generated contract per deal");
  assert.equal(meetings.length, opportunities.length, "one generated meeting per deal");
  assert.equal(solutioning.length, opportunities.length * 2, "two solutioning records per deal");
  for (const opportunity of opportunities) {
    assert.ok((opportunity.lines?.length ?? 0) >= 1, `${opportunity.id}: offering lines`);
    assert.ok(contracts.some((row) => row.opportunityId === opportunity.id), `${opportunity.id}: contract`);
    assert.ok(meetings.some((row) => row.opportunityIds.includes(opportunity.id)), `${opportunity.id}: meeting`);
    const requests = solutioning.filter((row) => row.opportunityIds.includes(opportunity.id));
    assert.equal(requests.length, 2, `${opportunity.id}: solutioning records`);
    for (const request of requests) {
      assert.deepEqual(
        new Set(request.docs.map((document) => document.category)),
        new Set(["customer", "working", "final", "analysis"]),
        `${request.id}: document shelves`
      );
    }
  }
});

test("customer identities stay canonical everywhere they are reused", async () => {
  const [contacts, customers] = await Promise.all([
    mockDb.contacts.list(),
    mockDb.customers.list(),
  ]);
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const companyKey = new Map(customers.map((customer) => [customer.company_name, customer.id]));
  const companiesByName = new Map<string, Set<string>>();
  const remember = (name: string, company: string) => {
    const companies = companiesByName.get(name) ?? new Set<string>();
    companies.add(company);
    companiesByName.set(name, companies);
  };

  contacts.forEach((contact) => remember(contact.full_name, contact.customer_id));
  mockFillLeads().forEach((lead) =>
    remember(lead.name, lead.customerId ?? companyKey.get(lead.company) ?? lead.company)
  );
  mockFillMeetings().forEach((meeting) => {
    meeting.contactIds.forEach((contactId, index) => {
      const contact = byId.get(contactId);
      assert.ok(contact, `${meeting.id}: linked meeting contact exists`);
      assert.equal(meeting.contactNames[index], contact.full_name, `${meeting.id}: linked meeting name`);
      assert.equal(contact.customer_id, meeting.customerId, `${meeting.id}: linked meeting company`);
      remember(meeting.contactNames[index]!, meeting.customerId ?? meeting.customer);
    });
  });
  RECORDINGS.filter((row) => row.id.startsWith("rec-gen-")).forEach((row) =>
    remember(row.contact, companyKey.get(row.company) ?? row.company)
  );
  listVoiceQueue().filter((row) => row.id.startsWith("vc-tail-")).forEach((row) =>
    remember(row.contact_name, companyKey.get(row.company) ?? row.company)
  );

  for (const [name, companies] of companiesByName) {
    assert.equal(companies.size, 1, `${name} belongs to one mock company everywhere`);
  }
  assert.equal(isStaleFillRow(`fill${FILL_GENERATION - 1}-ld-001-1`), true);
  assert.equal(isStaleFillRow(`fill${FILL_GENERATION}-ld-001-1`), false);
});

test("secondary mock lists stay useful without implausible volumes or duplicate people", () => {
  const generatedRecordings = RECORDINGS.filter((recording) => recording.id.startsWith("rec-gen-"));
  const calls = listVoiceQueue();
  const generatedCalls = calls.filter((call) => call.id.startsWith("vc-tail-"));
  const campaigns = listCampaigns();

  assert.ok(RECORDINGS.length >= 30 && RECORDINGS.length <= 80, "realistic recording library");
  assert.equal(
    new Set(generatedRecordings.map((recording) => recording.contact)).size,
    generatedRecordings.length,
    "generated recordings use distinct contacts"
  );
  assert.ok(calls.length >= 50 && calls.length <= 150, "realistic voice history");
  assert.equal(
    new Set(generatedCalls.map((call) => call.contact_id)).size,
    generatedCalls.length,
    "generated voice calls use distinct contacts"
  );
  assert.ok(campaigns.length >= 10 && campaigns.length <= 40, "realistic campaign history");
  assert.ok(
    campaigns.every((campaign) => campaign.recipient_contact_ids.length <= 25),
    "campaign audiences stay plausible for the mock account book"
  );
});
