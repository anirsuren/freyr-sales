import test from "node:test";
import assert from "node:assert/strict";

import { hasOfferingEditChanges } from "../lib/offeringEditDirty.ts";

const initial = {
  offeringType: "Freya Fusion (Module)",
  offeringCategory: "Regulatory Information Management",
  offeringName: "Freya.Register",
  description: "Opening brief",
  serviceCardStyles: [{ icon: "book", color: "#0071E3" }],
  current: "Available now",
  future: "",
  poc: "Eswar Subramanian",
  ctIds: ["pharma-large"],
  mktIds: ["global"],
  materials: [{ label: "Product brief", url: "https://example.com" }],
  roadmapDraft: { currentVersion: "2.5", nextVersions: "2.6" },
};

test("an unchanged offering does not show a false unsaved state", () => {
  assert.equal(hasOfferingEditChanges(structuredClone(initial), initial), false);
});

test("every editable offering field independently triggers unsaved changes", () => {
  for (const key of Object.keys(initial)) {
    const changed = structuredClone(initial);
    const value = changed[key];
    changed[key] = Array.isArray(value)
      ? [...value, { changed: true }]
      : typeof value === "object" && value !== null
        ? { ...value, changed: true }
        : `${value} changed`;

    assert.equal(
      hasOfferingEditChanges(changed, initial),
      true,
      `${key} must trigger the unsaved-changes state`
    );
  }
});

test("roadmap-only edits trigger unsaved changes", () => {
  const changed = structuredClone(initial);
  changed.roadmapDraft.currentVersion = "2.6";
  assert.equal(hasOfferingEditChanges(changed, initial), true);
});
