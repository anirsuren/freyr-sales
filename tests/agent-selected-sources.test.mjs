import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedSourcePassages } from "../lib/agentSelectedSources.ts";
const corpus = [
  { id: "same#0", href: "/offerings/a?material=same" },
  { id: "same#0", href: "/offerings/b?material=same" },
  { id: "second#1", href: "/offerings/b?material=second" },
  { id: "a", href: "/offerings/a" },
  { id: "ab", href: "/offerings/ab" },
];
test("same material IDs in different offerings do not cross source boundaries", () =>
  assert.deepEqual(
    selectedSourcePassages(corpus, [{ kind: "material", id: "a:same" }]),
    [corpus[0]],
  ));
test("multiple documents are available for comparative questions", () =>
  assert.deepEqual(
    selectedSourcePassages(corpus, [
      { kind: "material", id: "a:same" },
      { kind: "material", id: "b:second" },
    ]),
    [corpus[0], corpus[2]],
  ));
test("missing extracted document never falls back to unrelated sources", () =>
  assert.deepEqual(
    selectedSourcePassages(corpus, [{ kind: "material", id: "a:missing" }]),
    [],
  ));
test("offering boundaries and permission-filtered corpus are preserved", () => {
  assert.deepEqual(
    selectedSourcePassages(corpus, [{ kind: "offering", id: "a" }]),
    [corpus[0], corpus[3]],
  );
  assert.deepEqual(
    selectedSourcePassages([], [{ kind: "material", id: "a:same" }]),
    [],
  );
});
test("non-document record selection does not hide otherwise authorized knowledge", () =>
  assert.deepEqual(
    selectedSourcePassages(corpus, [{ kind: "contact", id: "john-1" }]),
    corpus,
  ));
