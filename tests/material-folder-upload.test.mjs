import test from "node:test";
import assert from "node:assert/strict";

import {
  allFolders,
  buildMaterialFolderUploadPlan,
  sanitizeMaterialFolderPath,
} from "../lib/offeringMaterials.ts";

test("native folder upload preserves the selected root, subfolders, and duplicate filenames", () => {
  const plan = buildMaterialFolderUploadPlan([
    {
      key: "Roadmap/Technical/Details.pdf\0first",
      relativePath: "Roadmap/Technical/Details.pdf",
    },
    {
      key: "Roadmap/Commercial/Details.pdf\0second",
      relativePath: "Roadmap/Commercial/Details.pdf",
    },
    {
      key: "Roadmap/Commercial/Archive/Notes.docx\0third",
      relativePath: "Roadmap/Commercial/Archive/Notes.docx",
    },
  ]);

  assert.equal(plan.commonRoot, "Roadmap");
  assert.deepEqual(plan.folders, [
    "Roadmap",
    "Roadmap/Technical",
    "Roadmap/Commercial",
    "Roadmap/Commercial/Archive",
  ]);
  assert.equal(
    plan.folderByKey["Roadmap/Technical/Details.pdf\0first"],
    "Roadmap/Technical"
  );
  assert.equal(
    plan.folderByKey["Roadmap/Commercial/Details.pdf\0second"],
    "Roadmap/Commercial"
  );
  assert.equal(
    plan.folderByKey["Roadmap/Commercial/Archive/Notes.docx\0third"],
    "Roadmap/Commercial/Archive"
  );
});

test("ordinary file selection does not invent a folder", () => {
  assert.deepEqual(
    buildMaterialFolderUploadPlan([
      { key: "deck.pdf\0one", relativePath: "" },
      { key: "brief.docx\0two", relativePath: "" },
    ]),
    { folders: [], commonRoot: "", folderByKey: {} }
  );
});

test("separate roots retain their own assignments without a misleading shared default", () => {
  const plan = buildMaterialFolderUploadPlan([
    { key: "A/deck.pdf", relativePath: "A/deck.pdf" },
    { key: "B/brief.pdf", relativePath: "B/brief.pdf" },
  ]);

  assert.equal(plan.commonRoot, "");
  assert.deepEqual(plan.folders, ["A", "B"]);
  assert.deepEqual(plan.folderByKey, {
    "A/deck.pdf": "A",
    "B/brief.pdf": "B",
  });
});

test("folder paths reject traversal while preserving legitimate deep hierarchy", () => {
  assert.equal(sanitizeMaterialFolderPath("Roadmap/../Secrets"), "");
  assert.equal(sanitizeMaterialFolderPath("Roadmap/./Current"), "");
  assert.equal(
    sanitizeMaterialFolderPath("A/B/C/D/E/F/G"),
    "A/B/C/D/E/F/G"
  );
});

test("persisted leaf folders still expose every ancestor in the folder browser", () => {
  const folders = allFolders([], ["Roadmap/Commercial/Archive"]);
  assert.ok(folders.includes("Roadmap"));
  assert.ok(folders.includes("Roadmap/Commercial"));
  assert.ok(folders.includes("Roadmap/Commercial/Archive"));
});
