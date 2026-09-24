import assert from "node:assert/strict";
import test from "node:test";
import { groupStories, storyCandidateComponents, type StoryInput } from "../lib/marketIntelStories";

const reports: StoryInput[] = [
  { key: "fierce", title: "Amgen says patient health data, IP stolen in cybersecurity breach", date: "2026-08-03T12:30:00Z" },
  { key: "hipaa", title: "AmGen Announces Cyberattack and Data Breach Involving Patient Data", date: "2026-08-03T12:30:00Z" },
  { key: "reuters", title: "Hackers steal patient information from Amgen in cyber attack", date: "2026-08-03T12:30:00Z" },
  { key: "security", title: "Patient records exposed after security breach at Amgen", date: "2026-08-04T08:00:00Z" },
  { key: "factory", title: "Amgen announces new manufacturing facility", date: "2026-08-03T12:30:00Z" },
];

test("candidate shortlist reaches differently worded coverage of one breach", () => {
  const groups = storyCandidateComponents(reports, "Amgen");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(item => item.key).sort(), ["fierce", "hipaa", "reuters", "security"]);
});

test("saved AI event identities merge coverage without hiding other events", () => {
  const clustered = reports.map((report, index) => ({ ...report, storyCluster: index < 4 ? "amgen-breach-aug3" : "amgen-factory" }));
  const groups = groupStories(clustered);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].others.length, 3);
  assert.equal(groups[1].lead.key, "factory");
});
