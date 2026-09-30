import test from "node:test";
import assert from "node:assert/strict";
import { whenWords, remindersGrounding, comingUpForAgent } from "../lib/agentReminders.ts";
import { reminderMessage } from "../lib/agentReminderPush.ts";
import { reminderHeadline, reminderGreeting, urgentReminders } from "../components/agent/useAgentReminders.ts";

const none = { meetings: false, solutioning: false, contracts: false, opportunities: false, customers: false };
const item = (bucket, line, extra = {}) => ({ id: line, kind: "solutioning", bucket, day: "2026-10-01", daysAway: bucket === "tomorrow" ? 1 : 0, title: "Test RFP", line, href: "/solutioning/sr-1", ...extra });

test("day words read the way a person says them", () => {
  assert.equal(whenWords("2026-09-30", 0), "today");
  assert.equal(whenWords("2026-10-01", 1), "tomorrow");
  assert.equal(whenWords("2026-09-29", -1), "yesterday");
  assert.equal(whenWords("2026-09-25", -5), "5 days ago");
  assert.equal(whenWords("2026-10-02", 2), "on Fri 2 Oct");
});

test("an empty list is an answer, not a gap", () => {
  const text = remindersGrounding([], "Manoj", "2026-09-30");
  assert.match(text, /nothing overdue, nothing today, nothing tomorrow, nothing this week/);
});

test("grounding groups by when, links each item and names the empty buckets", () => {
  const text = remindersGrounding([item("tomorrow", 'The request "Test RFP" you raised is needed tomorrow.')], "Manoj", "2026-09-30");
  assert.match(text, /Tomorrow:\n- The request "Test RFP" you raised is needed tomorrow\. \[Test RFP\]\(\/solutioning\/sr-1\)/);
  assert.match(text, /Nothing overdue, today, this week\./);
});

test("a one-word name several people answer to is a question", async () => {
  const members = [{ name: "Kranthi", active: true }, { name: "Kranthi Reddy", active: true }, { name: "Anir Suren", active: true }];
  const out = JSON.parse(await comingUpForAgent({ askerName: "Anir Suren", workspaceId: "w", person: "Kranthi", timeZone: "UTC", access: none, members }));
  assert.deepEqual(out.ambiguous, ["Kranthi", "Kranthi Reddy"]);
  const full = JSON.parse(await comingUpForAgent({ askerName: "Anir Suren", workspaceId: "w", person: "Kranthi Reddy", timeZone: "UTC", access: none, members }));
  assert.equal(full.person, "Kranthi Reddy");
  const nobody = JSON.parse(await comingUpForAgent({ askerName: "Anir Suren", workspaceId: "w", person: "Zed", timeZone: "UTC", access: none, members }));
  assert.match(nobody.error, /No active workspace member/);
  const me = JSON.parse(await comingUpForAgent({ askerName: "Anir Suren", workspaceId: "w", person: "me", timeZone: "UTC", access: none, members }));
  assert.equal(me.person, "Anir Suren");
});

test("the dock only interrupts for overdue, today and tomorrow", () => {
  const list = { today: "2026-09-30", reminders: [item("tomorrow", "a"), item("week", "b"), item("overdue", "c"), item("later", "d")] };
  const urgent = urgentReminders(list);
  assert.deepEqual(urgent.map((r) => r.line), ["a", "c"]);
  assert.equal(reminderHeadline(urgent), "1 overdue · 1 due tomorrow");
  assert.match(reminderGreeting([item("tomorrow", 'The request "Test RFP" you raised is needed tomorrow.')]), /\[Test RFP\]\(\/solutioning\/sr-1\)/);
});

test("the WhatsApp reminder reads like a person, with no app links", () => {
  const morning = reminderMessage("Manoj", "morning", [item("today", "Meeting \"Kickoff\" today at 14:30.")]);
  assert.match(morning, /^Good morning Manoj\. Here is what needs you today:/);
  assert.doesNotMatch(morning, /\]\(/);
  const evening = reminderMessage("Manoj", "evening", [item("tomorrow", "x")]);
  assert.match(evening, /^Evening Manoj\. A heads up for tomorrow:/);
});
