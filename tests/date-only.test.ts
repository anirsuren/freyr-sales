import test from "node:test";
import assert from "node:assert/strict";
import { dateOnlyDaysFromToday } from "../lib/dateOnly";

test("date-only follow-ups use calendar days rather than UTC-midnight offsets", () => {
  const today = new Date(2026, 8, 25, 11, 40);
  assert.equal(dateOnlyDaysFromToday("2026-09-24", today), -1);
  assert.equal(dateOnlyDaysFromToday("2026-09-25", today), 0);
  assert.equal(dateOnlyDaysFromToday("2026-09-26", today), 1);
  assert.equal(dateOnlyDaysFromToday("2026-10-02", today), 7);
  assert.equal(dateOnlyDaysFromToday("2026-09-25T10:00:00Z", today), null);
});
