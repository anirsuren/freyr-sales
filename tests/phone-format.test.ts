import assert from "node:assert/strict";
import test from "node:test";

import { formatPhoneNumber } from "../lib/phone";

test("keeps the international code separate from a saved lead number", () => {
  assert.equal(formatPhoneNumber("+1 7326105957"), "+1 732 610 5957");
  assert.equal(formatPhoneNumber("+44 20 7946 0958"), "+44 207 946 0958");
});

test("still groups the national portion while a lead number is being entered", () => {
  assert.equal(formatPhoneNumber("7326105957"), "732 610 5957");
});
