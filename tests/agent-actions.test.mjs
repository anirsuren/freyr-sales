import test from "node:test";
import assert from "node:assert/strict";

const shared = await import("../lib/agentActionsShared.ts");

test("a bare yes or no is recognised; a sentence is not", () => {
  for (const yes of ["yes", "Yes.", "YES", "yep", "ok", "okay", "do it", "go ahead", "sure!", "confirm", "👍"]) {
    assert.equal(shared.isAffirmative(yes), true, yes);
    assert.equal(shared.isNegative(yes), false, yes);
  }
  for (const no of ["no", "No.", "nope", "cancel", "not now", "never mind", "stop"]) {
    assert.equal(shared.isNegative(no), true, no);
    assert.equal(shared.isAffirmative(no), false, no);
  }
  for (const other of ["yes but make it 50k", "no wait, use Priya", "yesterday's number", "Nobody McGhost", ""]) {
    assert.equal(shared.isAffirmative(other), false, other);
    assert.equal(shared.isNegative(other), false, other);
  }
});

test("names resolve exactly, then uniquely, then by first name; ambiguity asks", () => {
  const people = [
    { id: "u1", name: "Priya Sharma" },
    { id: "u2", name: "Priyanka Manchanda" },
    { id: "u3", name: "Abhishek Sharma" },
    { id: "u4", name: "Manoj Odela" },
  ];
  assert.deepEqual(shared.matchOne("priya sharma", people, "person"), { ok: true, value: people[0] });
  assert.deepEqual(shared.matchOne("u4", people, "person", (p) => [p.id]), { ok: true, value: people[3] });
  assert.deepEqual(shared.matchOne("Manoj", people, "person"), { ok: true, value: people[3] });
  assert.deepEqual(shared.matchOne("Priyanka", people, "person"), { ok: true, value: people[1] });
  const sharma = shared.matchOne("Sharma", people, "person");
  assert.equal(sharma.ok, false);
  assert.match(sharma.error, /Which person: Priya Sharma, Abhishek Sharma/);
  const nobody = shared.matchOne("Nobody McGhost", people, "person");
  assert.equal(nobody.ok, false);
  assert.match(nobody.error, /No person called "Nobody McGhost"/);
  assert.equal(shared.matchOne("", people, "person").ok, false);
});

test("money and days parse the way people type them", () => {
  assert.equal(shared.parseMoney("200k"), 200_000);
  assert.equal(shared.parseMoney("$1.5m"), 1_500_000);
  assert.equal(shared.parseMoney("1,250,000"), 1_250_000);
  assert.equal(shared.parseMoney("USD 50,000"), 50_000);
  assert.equal(shared.parseMoney(42), 42);
  assert.equal(shared.parseMoney("lots"), null);
  const now = new Date("2026-09-26T12:00:00Z");
  assert.equal(shared.parseDay("2026-12-31", now), "2026-12-31");
  assert.equal(shared.parseDay("today", now), "2026-09-26");
  assert.equal(shared.parseDay("tomorrow", now), "2026-09-27");
  assert.equal(shared.parseDay("in 3 days", now), "2026-09-29");
  assert.equal(shared.parseDay("next week", now), "2026-10-03");
  assert.equal(shared.parseDay("end of Q4", now), "2026-12-31");
  assert.equal(shared.parseDay("end of q1 2027", now), "2027-03-31");
  assert.equal(shared.parseDay("someday", now), null);
});

test("proposal ids are unique and short", () => {
  const a = shared.shortId();
  const b = shared.shortId();
  assert.notEqual(a, b);
  assert.match(a, /^act-[a-z0-9]+$/);
});
