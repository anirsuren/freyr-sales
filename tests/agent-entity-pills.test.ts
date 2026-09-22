import assert from "node:assert/strict";
import test from "node:test";

import {
  entitiesForAnswer,
  entityLink,
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
