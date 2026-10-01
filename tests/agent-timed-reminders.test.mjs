import test from "node:test";
import assert from "node:assert/strict";

const { zonedInstant, localDayTime, relativeMoment } = await import("../lib/agentClock.ts");
const { ACTIONS } = await import("../lib/agentActions.ts");
const setReminder = ACTIONS.find((a) => a.key === "set_reminder");
const createMeeting = ACTIONS.find((a) => a.key === "create_meeting");
const ctx = { timeZone: "America/New_York", scope: { workspaceId: "w", userId: "u" }, actorName: "Test Person", channel: "web" };

test("a minute on a person's own calendar is the right instant, daylight saving included", () => {
  assert.equal(new Date(zonedInstant("2026-10-02", "09:00", "America/New_York")).toISOString(), "2026-10-02T13:00:00.000Z");
  assert.equal(new Date(zonedInstant("2026-12-02", "09:00", "America/New_York")).toISOString(), "2026-12-02T14:00:00.000Z");
  assert.equal(new Date(zonedInstant("2026-10-02", "09:00", "Asia/Kolkata")).toISOString(), "2026-10-02T03:30:00.000Z");
  assert.equal(new Date(zonedInstant("2026-10-02", "09:00", "Not/AZone")).toISOString(), "2026-10-02T09:00:00.000Z");
  assert.deepEqual(localDayTime(Date.parse("2026-10-02T03:30:00Z"), "Asia/Kolkata"), { day: "2026-10-02", time: "09:00" });
  assert.deepEqual(localDayTime(Date.parse("2026-10-02T03:30:00Z"), "America/New_York"), { day: "2026-10-01", time: "23:30" });
});

test("'in 2 hours' is a moment, rounded up to the minute; 'in 3 days' is a day, not a moment", () => {
  const now = Date.parse("2026-10-01T12:00:20Z");
  const at = (text) => {
    const m = relativeMoment(text, now);
    return m === null ? null : new Date(m).toISOString();
  };
  assert.equal(at("remind me in 2 hours"), "2026-10-01T14:01:00.000Z");
  assert.equal(at("in an hour"), "2026-10-01T13:01:00.000Z");
  assert.equal(at("in half an hour"), "2026-10-01T12:31:00.000Z");
  assert.equal(at("in 45 mins"), "2026-10-01T12:46:00.000Z");
  assert.equal(at("in 3 days"), null);
  assert.equal(at("tomorrow at 9"), null);
  assert.equal(at("in 9999 hours"), null);
});

test("a reminder needs a time: none is asked for, a passed one refused; 'in 2 hours' and noon both work", async () => {
  const noTime = await setReminder.prepare({ what: "Send Pfizer the deck", when: "Friday" }, ctx);
  assert.match(noTime.error, /^What time .+ should I remind you\? For example 9am or 14:30\.$/);
  const passed = await setReminder.prepare({ what: "Call Ben", when: "yesterday" }, ctx);
  assert.match(passed.error, /already passed/);
  const soon = await setReminder.prepare({ what: "Call Ben", when: "in 2 hours" }, ctx);
  assert.ok(!soon.error, soon.error);
  assert.match(soon.summary, /^Remind you .+ at \d{2}:\d{2}: Call Ben\.$/);
  assert.match(soon.params.time, /^\d{2}:\d{2}$/);
  const noon = await setReminder.prepare({ what: "Lunch with Mei", when: "tomorrow", time: "noon" }, ctx);
  assert.match(noon.summary, / at 12:00: Lunch with Mei\.$/);
  const both = await setReminder.prepare({ what: "Send the SOW", when: "monday at 9am" }, ctx);
  assert.match(both.summary, / at 09:00: Send the SOW\.$/);
});

test("a meeting still to come needs its time; one already held may be logged without one", async () => {
  const future = await createMeeting.prepare({ title: "Kestrel review", when: "tomorrow" }, ctx);
  assert.match(future.error, /^What time is the meeting .+\? For example 2pm\.$/);
  const timed = await createMeeting.prepare({ title: "Kestrel review", when: "tomorrow at 2pm" }, ctx);
  assert.match(timed.summary, / at 14:00\.$/);
  const lastWeek = localDayTime(Date.now() - 7 * 86_400_000, ctx.timeZone).day;
  const past = await createMeeting.prepare({ title: "Kestrel review", when: lastWeek }, ctx);
  assert.ok(!past.error, past.error);
  assert.match(past.summary, /no time set/);
});
