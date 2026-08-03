import test from "node:test";
import assert from "node:assert/strict";

import { safeArchiveMemberPath } from "../lib/archiveSafety.ts";
import { continuationDecision } from "../lib/agentContinuation.ts";
import {
  effectiveSourceDate,
  normalizeSourceDate,
  sourceDateInWindow,
  sourceDateWindowForQuestion,
} from "../lib/sourceDates.ts";

test("archive member paths reject zip-slip, absolutes, and excessive depth", () => {
  assert.equal(safeArchiveMemberPath("folder/deck.docx"), "folder/deck.docx");
  assert.equal(safeArchiveMemberPath("folder\\deck.docx"), "folder/deck.docx");
  assert.equal(safeArchiveMemberPath("../secret.txt"), null);
  assert.equal(safeArchiveMemberPath("folder/../../secret.txt"), null);
  assert.equal(safeArchiveMemberPath("/etc/passwd"), null);
  assert.equal(safeArchiveMemberPath("C:\\secret.txt"), null);
  assert.equal(safeArchiveMemberPath(`${"a/".repeat(12)}file.txt`), null);
});

test("output-limit continuation stops only at the configured boundary", () => {
  assert.equal(continuationDecision("end_turn", true, 0, 3), "complete");
  assert.equal(continuationDecision("max_tokens", true, 0, 3), "continue");
  assert.equal(continuationDecision("max_tokens", true, 2, 3), "continue");
  assert.equal(continuationDecision("max_tokens", true, 3, 3), "limit");
  assert.equal(continuationDecision("max_tokens", false, 0, 3), "empty");
});

test("content date wins over a newer upload date", () => {
  assert.deepEqual(
    effectiveSourceDate("2024-02-29", "2026-08-01T10:00:00Z"),
    { iso: "2024-02-29T00:00:00.000Z", kind: "content" }
  );
  assert.deepEqual(effectiveSourceDate(undefined, "2026-08-01T10:00:00Z"), {
    iso: "2026-08-01T10:00:00.000Z",
    kind: "upload",
  });
  assert.equal(normalizeSourceDate("2025-02-29"), undefined);
});

test("explicit recency windows include both exact boundaries", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const window = sourceDateWindowForQuestion("published in the last 7 days", now);
  assert.ok(window);
  assert.equal(window.start, "2026-07-27T12:00:00.000Z");
  assert.equal(window.end, "2026-08-03T12:00:00.000Z");
  assert.equal(sourceDateInWindow(window.start, window), true);
  assert.equal(sourceDateInWindow(window.end, window), true);
  assert.equal(sourceDateInWindow("2026-07-27T11:59:59.999Z", window), false);
  assert.equal(sourceDateInWindow("2026-08-03T12:00:00.001Z", window), false);
});

test("month subtraction clamps month-end instead of rolling into March", () => {
  const window = sourceDateWindowForQuestion(
    "most recent items from the past 1 month",
    new Date("2024-03-31T09:30:00.000Z")
  );
  assert.ok(window);
  assert.equal(window.start, "2024-02-29T09:30:00.000Z");
});

test("since date is inclusive and preserves the exact requested window", () => {
  const window = sourceDateWindowForQuestion(
    "show documents since 2026-01-15",
    new Date("2026-08-03T00:00:00.000Z")
  );
  assert.ok(window);
  assert.equal(window.start, "2026-01-15T00:00:00.000Z");
  assert.match(window.label, /2026-01-15T00:00:00\.000Z through 2026-08-03/);
});
