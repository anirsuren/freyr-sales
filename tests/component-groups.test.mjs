import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPONENT_GROUPS,
  COMPONENT_GROUP_VIEW_ORDER,
  componentGroupRank,
  componentNoun,
  isComponentGroup,
  normalizeComponentGroup,
} from "../lib/componentGroups.ts";
import {
  canMoveCard,
  groupOf,
  moveCardToGroup,
  shuffleCard,
} from "../lib/briefRows.ts";

/**
 * COMPONENT CARDS AND THEIR GROUPS.
 *
 * Saras, Aug 26, on Offering Overview > Offering Brief: four fixed groups, a
 * fixed order for the reader, an editor who can shuffle cards and shift them
 * between groups.
 *
 * The rules that matter are the ones that decide whether somebody's work
 * survives an edit, so most of what is tested here is what must NOT happen: a
 * card must not jump its heading, a custom heading must not be rewritten, and
 * moving one card must not disturb any other.
 *
 *   npm run test:groups
 */

const section = (text) => ({ kind: "section", text });
const card = (text) => ({ kind: "item", text });
const mkSection = (text) => section(text);
const shape = (rows) => rows.map((r) => `${r.kind[0]}:${r.text}`).join(" ");

/* ------------------------------------------------------------------ *
 * THE VOCABULARY
 * ------------------------------------------------------------------ */

test("the four groups are the four Saras named, in her order", () => {
  assert.deepEqual(
    [...COMPONENT_GROUPS],
    ["Modules", "Module Agents", "Add-on Agents", "Services"]
  );
});

test("the reader sees Services first, which is not the editor's order", () => {
  assert.deepEqual(
    [...COMPONENT_GROUP_VIEW_ORDER],
    ["Services", "Modules", "Module Agents", "Add-on Agents"]
  );
  assert.notDeepEqual([...COMPONENT_GROUP_VIEW_ORDER], [...COMPONENT_GROUPS]);
});

test("a heading matches its group through the ways people type it", () => {
  const same = [
    ["Modules", "Modules"],
    ["modules", "Modules"],
    ["MODULES", "Modules"],
    ["Module", "Modules"],
    ["Module Agents", "Module Agents"],
    ["module agents", "Module Agents"],
    ["Module Agent", "Module Agents"],
    ["Add-on Agents", "Add-on Agents"],
    ["Add on Agents", "Add-on Agents"],
    ["add-on agent", "Add-on Agents"],
    ["Services", "Services"],
    ["Services:", "Services"],
    ["Services include:", "Services"],
  ];
  for (const [typed, expected] of same)
    assert.equal(normalizeComponentGroup(typed), expected, typed);
});

test("a real business heading is left alone, not filed under one of the four", () => {
  // These are live in the catalogue on four offerings. Folding them into
  // Services would delete work somebody did.
  const theirs = [
    "Product & Portfolio Strategy",
    "Regulatory Transformation & Process Consulting",
    "Initial Registration & Submission Services",
    "Market Entry & Affiliate Support",
    "Lifecycle Submission Management",
    "Regulatory Operations & Compliance",
  ];
  for (const heading of theirs) {
    assert.equal(normalizeComponentGroup(heading), undefined, heading);
    assert.equal(isComponentGroup(heading), false, heading);
  }
});

test("an empty or missing heading is not a group", () => {
  assert.equal(normalizeComponentGroup(""), undefined);
  assert.equal(normalizeComponentGroup("   "), undefined);
  assert.equal(normalizeComponentGroup(undefined), undefined);
  assert.equal(normalizeComponentGroup(null), undefined);
});

test("group rank sorts the four into the reader's order and customs last", () => {
  const headings = [
    "Add-on Agents",
    "Product & Portfolio Strategy",
    "Modules",
    "Services",
    "Module Agents",
  ];
  const sorted = headings
    .map((title, index) => ({ title, index }))
    .sort((a, b) => componentGroupRank(a.title) - componentGroupRank(b.title) || a.index - b.index)
    .map((x) => x.title);
  assert.deepEqual(sorted, [
    "Services",
    "Modules",
    "Module Agents",
    "Add-on Agents",
    "Product & Portfolio Strategy",
  ]);
});

test("two custom headings keep the order their author wrote them in", () => {
  const headings = ["Lifecycle Submission Management", "Regulatory Operations & Compliance"];
  const sorted = headings
    .map((title, index) => ({ title, index }))
    .sort((a, b) => componentGroupRank(a.title) - componentGroupRank(b.title) || a.index - b.index)
    .map((x) => x.title);
  assert.deepEqual(sorted, headings);
});

test("cards with no heading lead, they are not a group someone named", () => {
  // Freya.Register opens with Products, Applications, Registrations and LCM,
  // then gets to its agents. Ranking the untitled opening run alongside the
  // custom headings buried the four things the offering actually is.
  const headings = ["", "Module Agents", "Add-on Agents"];
  const sorted = headings
    .map((title, index) => ({ title, index }))
    .sort((a, b) => componentGroupRank(a.title) - componentGroupRank(b.title) || a.index - b.index)
    .map((x) => x.title);
  assert.deepEqual(sorted, ["", "Module Agents", "Add-on Agents"]);
  assert.ok(componentGroupRank("") < componentGroupRank("Services"));
  assert.ok(componentGroupRank("   ") < componentGroupRank("Services"));
  assert.ok(componentGroupRank(undefined) < componentGroupRank("Services"));
});

test("an untitled run still leads when the brief also has a custom heading", () => {
  const headings = ["", "Lifecycle Submission Management", "Modules"];
  const sorted = headings
    .map((title, index) => ({ title, index }))
    .sort((a, b) => componentGroupRank(a.title) - componentGroupRank(b.title) || a.index - b.index)
    .map((x) => x.title);
  assert.deepEqual(sorted, ["", "Modules", "Lifecycle Submission Management"]);
});

test("an offering is made of components, whatever it came from", () => {
  assert.equal(componentNoun(1), "component");
  assert.equal(componentNoun(4), "components");
  assert.equal(componentNoun(0), "components");
});

/* ------------------------------------------------------------------ *
 * WHICH GROUP A CARD IS IN
 * ------------------------------------------------------------------ */

test("a card belongs to the nearest heading above it", () => {
  const rows = [section("Modules"), card("a"), card("b"), section("Services"), card("c")];
  assert.equal(groupOf(rows, 1), "Modules");
  assert.equal(groupOf(rows, 2), "Modules");
  assert.equal(groupOf(rows, 4), "Services");
});

test("a card above the first heading has no group", () => {
  const rows = [card("loose"), section("Modules"), card("a")];
  assert.equal(groupOf(rows, 0), "");
});

/* ------------------------------------------------------------------ *
 * SHUFFLING
 * ------------------------------------------------------------------ */

test("a card swaps with its neighbour", () => {
  const rows = [section("Modules"), card("a"), card("b"), card("c")];
  assert.equal(shape(shuffleCard(rows, 1, 1)), "s:Modules i:b i:a i:c");
  assert.equal(shape(shuffleCard(rows, 3, -1)), "s:Modules i:a i:c i:b");
});

test("a card never jumps its own heading", () => {
  const rows = [section("Modules"), card("a"), section("Services"), card("b")];
  // "a" is last in Modules, "b" is first in Services: neither may cross.
  assert.equal(shuffleCard(rows, 1, 1), rows, "down past the next heading");
  assert.equal(shuffleCard(rows, 3, -1), rows, "up past its own heading");
  assert.equal(canMoveCard(rows, 1, 1), false);
  assert.equal(canMoveCard(rows, 3, -1), false);
});

test("the edges of the list do not move", () => {
  const rows = [card("only")];
  assert.equal(shuffleCard(rows, 0, -1), rows);
  assert.equal(shuffleCard(rows, 0, 1), rows);
  assert.equal(canMoveCard(rows, 0, -1), false);
});

test("a heading row is not a card and does not shuffle", () => {
  const rows = [section("Modules"), card("a")];
  assert.equal(shuffleCard(rows, 0, 1), rows);
});

test("shuffling changes nothing but the two cards involved", () => {
  const rows = [section("Modules"), card("a"), card("b"), section("Services"), card("c"), card("d")];
  assert.equal(shape(shuffleCard(rows, 4, 1)), "s:Modules i:a i:b s:Services i:d i:c");
});

/* ------------------------------------------------------------------ *
 * SHIFTING BETWEEN GROUPS
 * ------------------------------------------------------------------ */

test("a card moves to the end of an existing group", () => {
  const rows = [section("Modules"), card("a"), card("b"), section("Services"), card("c")];
  const moved = moveCardToGroup(rows, 1, "Services", mkSection);
  assert.equal(shape(moved), "s:Modules i:b s:Services i:c i:a");
});

test("moving to a group the brief does not have yet creates it at the end", () => {
  const rows = [section("Modules"), card("a"), card("b")];
  const moved = moveCardToGroup(rows, 1, "Add-on Agents", mkSection);
  assert.equal(shape(moved), "s:Modules i:b s:Add-on Agents i:a");
});

test("creating a group does not pull other cards out from under their heading", () => {
  const rows = [section("Modules"), card("a"), card("b"), section("Services"), card("c")];
  const moved = moveCardToGroup(rows, 1, "Module Agents", mkSection);
  assert.equal(groupOf(moved, moved.findIndex((r) => r.text === "b")), "Modules");
  assert.equal(groupOf(moved, moved.findIndex((r) => r.text === "c")), "Services");
  assert.equal(groupOf(moved, moved.findIndex((r) => r.text === "a")), "Module Agents");
});

test("moving a card to the group it is already in changes nothing", () => {
  const rows = [section("Modules"), card("a"), card("b")];
  assert.equal(moveCardToGroup(rows, 1, "Modules", mkSection), rows);
});

test("a card can be moved back out of every group", () => {
  const rows = [section("Modules"), card("a"), card("b")];
  const moved = moveCardToGroup(rows, 2, "", mkSection);
  assert.equal(shape(moved), "i:b s:Modules i:a");
  assert.equal(groupOf(moved, 0), "");
});

test("an ungrouped card joins the ungrouped run, not a new heading", () => {
  const rows = [card("loose"), section("Modules"), card("a")];
  const moved = moveCardToGroup(rows, 2, "", mkSection);
  assert.equal(shape(moved), "i:loose i:a s:Modules");
});

test("every card survives a move, exactly once", () => {
  const rows = [
    section("Modules"),
    card("a"),
    card("b"),
    section("Services"),
    card("c"),
    card("d"),
  ];
  for (const target of [...COMPONENT_GROUPS, ""]) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind !== "item") continue;
      const moved = moveCardToGroup(rows, i, target, mkSection);
      const cards = moved.filter((r) => r.kind === "item").map((r) => r.text);
      assert.deepEqual(
        [...cards].sort(),
        ["a", "b", "c", "d"],
        `moving ${rows[i].text} to ${target || "no group"}`
      );
    }
  }
});

test("a heading row cannot be moved as if it were a card", () => {
  const rows = [section("Modules"), card("a")];
  assert.equal(moveCardToGroup(rows, 0, "Services", mkSection), rows);
});

test("an index that is not there is a no-op, not a crash", () => {
  const rows = [section("Modules"), card("a")];
  assert.equal(moveCardToGroup(rows, 99, "Services", mkSection), rows);
  assert.equal(shuffleCard(rows, 99, 1), rows);
});
