import assert from "node:assert/strict";
import test from "node:test";

import {
  entitiesForAnswer,
  entityLink,
  injectEntities,
  unambiguousEntities,
  type Entity,
} from "../components/agent/EntityPills";

test("a company keeps its customer identity when it also exists in Market Intel", () => {
  const entities: Entity[] = [
    {
      name: "NovaGene Therapeutics",
      id: "cust-006",
      kind: "company",
    },
    {
      name: "NovaGene Therapeutics",
      id: "novagene-therapeutics",
      kind: "marketCompany",
      logoUrl: "/logos/novagene-therapeutics.png",
    },
  ];

  assert.deepEqual(unambiguousEntities(entities), [entities[0]]);
});

test("an actual name collision between non-company records stays unlinked", () => {
  const entities: Entity[] = [
    { name: "Jordan Lee", id: "contact-1", kind: "contact" },
    { name: "Jordan Lee", id: "person-2", kind: "person" },
  ];

  assert.deepEqual(unambiguousEntities(entities), []);
});

test("a company named in a lead answer keeps its company link and logo", () => {
  const entities: Entity[] = [
    { name: "Calyx Diagnostics", id: "cust-fill-003", kind: "company" },
    { name: "Calyx Diagnostics", id: "lead-12", kind: "lead" },
  ];

  const scoped = entitiesForAnswer(
    "[Calyx Diagnostics](/leads)",
    entities,
  );
  const pill = entityLink("/leads", "Calyx Diagnostics", scoped, "pill");
  assert.ok(pill && typeof pill === "object" && "props" in pill);
  assert.equal((pill as { props: { href: string } }).props.href, "/customers/cust-fill-003");
});

test("explicit offering and teammate links keep identity marks while the index loads", () => {
  const offering = entityLink("/offerings/agent-fia", "Agent.Fia", [], "offering");
  const teammate = entityLink("/team?member=member-1", "Neha Sharma", [], "teammate");
  assert.ok(offering && typeof offering === "object" && "props" in offering);
  assert.ok(teammate && typeof teammate === "object" && "props" in teammate);
  const offeringProps = offering.props as { href: string; children: unknown[] };
  const teammateProps = teammate.props as { href: string; children: Array<{ props: { name: string } }> };
  assert.equal(offeringProps.href, "/offerings/agent-fia");
  assert.equal(teammateProps.href, "/analytics/reps/neha-sharma");
  assert.ok(offeringProps.children[0]);
  assert.equal(teammateProps.children[0].props.name, "Neha Sharma");
  assert.equal(entityLink("/team", "Team", [], "navigation"), null);
});


test("repeated streamed fragments retain exact pills and name-boundary rules", () => {
  const entities: Entity[] = [
    { name: "Acme", id: "short", kind: "company" },
    { name: "Acme Biotech", id: "long", kind: "company" },
    { name: "Jordan Lee", id: "contact-a", kind: "contact" },
    { name: "Jordan Lee", id: "contact-b", kind: "contact" },
  ];
  const links = (nodes: ReturnType<typeof injectEntities>) => nodes
    .filter((node): node is import("react").ReactElement<{ href: string }> => Boolean(node && typeof node === "object" && "props" in node))
    .map(node => node.props.href);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(links(injectEntities("Acme Biotech and Acme. Jordan Lee; Acme-extra.", entities, `fragment-${i}`)),
      ["/customers/long", "/customers/short"]);
  }
  // A newly loaded index and an exact selected identity must not reuse the
  // earlier ambiguous candidate list or another record's link.
  assert.deepEqual(links(injectEntities("Jordan Lee", [entities[3]], "selected")), ["/contacts/contact-b"]);
  assert.deepEqual(links(injectEntities("Acme Biotech", [{...entities[1],id:"new-record"}], "fresh")), ["/customers/new-record"]);
});

 test("teammate mentions and saved Team member links open the individual profile", () => {
  const entities: Entity[] = [{ kind: "person", id: "member-anant", name: "Anant Puranik" }];
  const nodes = injectEntities("Ask Anant Puranik.", entities, "person");
  const pill = nodes.find(node => node && typeof node === "object" && "props" in node) as import("react").ReactElement<{ href: string }>;
  assert.equal(pill.props.href, "/analytics/reps/anant-puranik");
  for (const href of ["/team?member=member-anant", "/analytics/reps/anant-puranik"]) {
    const link = entityLink(href, "Anant Puranik", entities, "saved") as import("react").ReactElement<{ href: string }>;
    assert.equal(link.props.href, "/analytics/reps/anant-puranik");
  }
});

test("record links render their identity icons before the name index arrives", () => {
  for (const [href, label] of [["/opportunities/opp-1", "Medical device GRI"], ["/solutioning/sr-1", "Test RFP"], ["/market-intel/gsk", "GSK"]]) {
    const link = entityLink(href, label, [], "initial") as import("react").ReactElement<{ href: string; children: unknown[] }>;
    assert.equal(link.props.href, href);
    assert.ok(link.props.children[0]);
  }
});
