import assert from "node:assert/strict";
import test from "node:test";
import {
  FILL_ACCOUNTS,
  mockFillContact,
  mockPersonName,
  refreshMockFillNames,
} from "../lib/mockFillCast";

test("the Mock contact book has distinct given names and surnames", () => {
  const names = Array.from({ length: FILL_ACCOUNTS * 5 + 60 }, (_, index) => mockPersonName(index));
  const first = names.map((name) => name.split(" ")[0]);
  const last = names.map((name) => name.split(" ").at(-1));
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(first).size, names.length);
  assert.equal(new Set(last).size, names.length);
  assert.equal(mockFillContact(2, 0).name, "Marcello Bianchi");
  assert.equal(mockFillContact(2, 1).name, "Ayumi Berg");
});

test("stored generated references update without replacing Mock edits", () => {
  const row = {
    id: "fill10-ld-005-1",
    name: "Louis Nakamura",
    email: "louis.nakamura@eryxlabs.example",
    note: "Met Louis Nakamura; status manually changed to Qualifying.",
    status: "Qualifying",
  };
  const manual = { id: "ld-user-1", name: "Louis Nakamura" };
  assert.equal(refreshMockFillNames([row, manual]), true);
  assert.equal(row.name, mockPersonName(111));
  assert.match(row.email, /^louis\.[^.]+@eryxlabs\.example$/);
  assert.match(row.note, /status manually changed to Qualifying/);
  assert.equal(row.status, "Qualifying");
  assert.equal(manual.name, "Louis Nakamura");
  assert.equal(refreshMockFillNames([row, manual]), false);
});
