import { expect, test } from "@playwright/test";
import {
  approvedPitchEmail,
  isDeliverableEmail,
  matchesApprovedPitchEmail,
} from "../lib/approvedPitchEmail";

const stored = JSON.stringify({
  subject_lines: ["Approved subject A", "Approved subject B"],
  body: "Approved body.\nSecond line.",
});

test("approved pitch content is resolved only from the stored payload", () => {
  expect(approvedPitchEmail(stored)).toEqual({
    subject: "Approved subject A",
    body: "Approved body.\nSecond line.",
  });
  expect(approvedPitchEmail(stored, "Approved subject B")).toEqual({
    subject: "Approved subject B",
    body: "Approved body.\nSecond line.",
  });
  expect(approvedPitchEmail(stored, "Unapproved subject")).toBeNull();
});

test("request content must match the approved stored copy", () => {
  const approved = approvedPitchEmail(stored);
  expect(approved).not.toBeNull();
  expect(
    matchesApprovedPitchEmail(
      approved!,
      "Approved subject A",
      "Approved body.\r\nSecond line."
    )
  ).toBeTruthy();
  expect(
    matchesApprovedPitchEmail(
      approved!,
      "Approved subject A",
      "Changed after approval."
    )
  ).toBeFalsy();
});

test("invalid pitch payloads and recipient addresses fail closed", () => {
  expect(approvedPitchEmail("not-json")).toBeNull();
  expect(
    approvedPitchEmail(JSON.stringify({ subject_lines: [], body: "Body" }))
  ).toBeNull();
  expect(isDeliverableEmail("prospect@example.com")).toBeTruthy();
  expect(isDeliverableEmail("not-an-email")).toBeFalsy();
});
