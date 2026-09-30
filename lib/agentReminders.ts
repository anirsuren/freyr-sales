import "server-only";
import { readMeetings } from "@/lib/meetings";
import { readSolutioning } from "@/lib/solutioning";
import { readContracts } from "@/lib/contracts";
import { readOpportunities } from "@/lib/opportunities";
import { getDb } from "@/lib/db";
import { localDay } from "@/lib/agentActionsShared";
import { readPersonalReminders } from "@/lib/agentPersonalReminders";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * WHAT IS COMING UP FOR THIS PERSON (Anir, Sep 30: "if a deadline is coming or
 * something tomorrow it should remind me").
 *
 * The bell in the live workspace deliberately shows only setup nudges, so
 * nothing anywhere told a rep that their meeting is tomorrow or that a
 * solutioning request they raised is due on Friday. This is the one place that
 * answers "what is coming up for me", and every agent surface reads it: the
 * chat grounding (so "what do I have tomorrow" is answered from records, not
 * from a guess), the reminders route the dock uses, and the WhatsApp push.
 *
 * ONLY THEIR OWN WORK. A record counts when the person is named on it: the
 * meeting's owner, attendee or presenter; the request's requester, owner or
 * attendee; the contract's or deal's owner; the follow-up's author. Records are
 * matched by display name because that is what the stores keep, so the match
 * ignores case and spacing and nothing looser. A module the person cannot open
 * contributes nothing, whatever it holds.
 *
 * Days are the PERSON's calendar days (their saved time zone), because
 * "tomorrow" in Hyderabad is not tomorrow in New Jersey.
 */

export type ReminderKind = "meeting" | "solutioning" | "contract" | "deal" | "followup" | "personal";
export type ReminderBucket = "overdue" | "today" | "tomorrow" | "attention" | "week" | "later";

export type AgentReminder = {
  /** Stable per record and day, so a push can be sent once and only once. */
  id: string;
  kind: ReminderKind;
  bucket: ReminderBucket;
  /** The calendar day it falls on, YYYY-MM-DD. */
  day: string;
  /** Days from today on the person's calendar (negative = overdue). */
  daysAway: number;
  /** "14:30" when the record carries a time. */
  time?: string;
  title: string;
  /** One plain sentence the agent can say as it is. */
  line: string;
  href: string;
};

export type ReminderAccess = {
  meetings: boolean;
  solutioning: boolean;
  contracts: boolean;
  opportunities: boolean;
  customers: boolean;
};

export const BUCKET_LABEL: Record<ReminderBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  attention: "Needs a nudge",
  week: "This week",
  later: "Coming up",
};

/** Three weeks without an update is when a deal is quietly slipping. */
export const QUIET_DAYS = 21;

const BUCKET_ORDER: ReminderBucket[] = ["overdue", "today", "tomorrow", "attention", "week", "later"];

const norm = (value: unknown): string => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function namedOn(person: string, ...values: unknown[]): boolean {
  const me = norm(person);
  if (!me) return false;
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.some((entry) => norm(entry) === me)) return true;
    } else if (norm(value) === me) {
      return true;
    }
  }
  return false;
}

/** The date part of a stored day or day-and-time ("2026-10-01T14:30" -> "2026-10-01"). */
function dayOf(value: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return m ? m[1] : null;
}

function timeOf(value: unknown): string | undefined {
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(String(value ?? "").trim());
  return m ? m[1] : undefined;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function bucketFor(daysAway: number): ReminderBucket {
  if (daysAway < 0) return "overdue";
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway <= 7) return "week";
  return "later";
}

/** "tomorrow", "today", "on Fri 3 Oct", "2 days ago": how a person would say it. */
export function whenWords(day: string, daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway === -1) return "yesterday";
  if (daysAway < 0) return `${-daysAway} days ago`;
  const date = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
  return `on ${date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
}

const at = (time?: string) => (time ? ` at ${time}` : "");

export async function remindersFor(input: {
  person: string;
  timeZone: string;
  access: ReminderAccess;
  now?: Date;
  /** How far ahead to look for ordinary items (contracts always look 30 days). */
  horizonDays?: number;
  /** The person's own scope, for the reminders they asked the agent to keep.
   *  Private: pass it only when the person asking IS this person. */
  scope?: WorkspaceMemberScope;
}): Promise<AgentReminder[]> {
  const { person, access } = input;
  const today = localDay(input.now ?? new Date(), input.timeZone).ymd;
  const horizon = Math.max(1, Math.min(input.horizonDays ?? 7, 30));
  const out: AgentReminder[] = [];

  const push = (reminder: Omit<AgentReminder, "bucket" | "daysAway"> & { daysAway?: number; bucket?: ReminderBucket }) => {
    const daysAway = reminder.daysAway ?? daysBetween(today, reminder.day);
    out.push({ ...reminder, daysAway, bucket: reminder.bucket ?? bucketFor(daysAway) });
  };

  const tasks: Promise<void>[] = [];

  if (access.meetings) {
    tasks.push(
      readMeetings()
        .then((state) => {
          for (const m of state.meetings ?? []) {
            if (m.status !== "planned") continue;
            if (!namedOn(person, m.owner, m.attendees, m.presenters)) continue;
            const day = dayOf(m.meetingAt);
            if (!day) continue;
            const away = daysBetween(today, day);
            const time = timeOf(m.meetingAt);
            const who = m.customer ? ` with ${m.customer}` : "";
            if (away < 0) {
              // A meeting that happened and still says "planned" needs its outcome.
              if (away < -7) continue;
              push({
                id: `meeting:${m.id}:outcome`,
                kind: "meeting",
                day,
                time,
                title: m.title,
                line: `The meeting "${m.title}"${who} was ${whenWords(day, away)} and still has no outcome logged.`,
                href: `/meetings/${encodeURIComponent(m.id)}`,
              });
              continue;
            }
            if (away > horizon) continue;
            push({
              id: `meeting:${m.id}:${day}`,
              kind: "meeting",
              day,
              time,
              title: m.title,
              line: `Meeting "${m.title}"${who} ${whenWords(day, away)}${at(time)}.`,
              href: `/meetings/${encodeURIComponent(m.id)}`,
            });
          }
        })
        .catch(() => undefined),
    );
  }

  if (access.solutioning) {
    tasks.push(
      readSolutioning()
        .then((state) => {
          for (const r of state.requests ?? []) {
            if (r.status === "completed" || r.status === "cancelled") continue;
            if (!namedOn(person, r.requestedBy, r.owner, r.attendees)) continue;
            const href = `/solutioning/${encodeURIComponent(r.id)}`;
            const needed = dayOf(r.neededBy);
            if (needed) {
              const away = daysBetween(today, needed);
              if (away >= -14 && away <= horizon) {
                const mine = namedOn(person, r.owner) ? "you are working on" : "you raised";
                push({
                  id: `solutioning:${r.id}:needed:${needed}`,
                  kind: "solutioning",
                  day: needed,
                  title: r.title,
                  line:
                    away < 0
                      ? `The ${r.type || "request"} "${r.title}" ${mine} was needed ${whenWords(needed, away)} and is still ${String(r.status).replace(/_/g, " ")}.`
                      : `The ${r.type || "request"} "${r.title}" ${mine} is needed ${whenWords(needed, away)}.`,
                  href,
                });
              }
            }
            const meetingDay = dayOf(r.meetingAt);
            if (meetingDay) {
              const away = daysBetween(today, meetingDay);
              if (away >= 0 && away <= horizon) {
                const time = timeOf(r.meetingAt);
                push({
                  id: `solutioning:${r.id}:meeting:${meetingDay}`,
                  kind: "solutioning",
                  day: meetingDay,
                  time,
                  title: r.title,
                  line: `The ${r.type || "session"} "${r.title}"${r.customer ? ` for ${r.customer}` : ""} is ${whenWords(meetingDay, away)}${at(time)}.`,
                  href,
                });
              }
            }
          }
        })
        .catch(() => undefined),
    );
  }

  if (access.contracts) {
    tasks.push(
      readContracts()
        .then((state) => {
          for (const c of state.contracts ?? []) {
            if (c.status === "Cancelled") continue;
            if (!namedOn(person, c.owner)) continue;
            const end = dayOf(c.endDate);
            if (!end) continue;
            const away = daysBetween(today, end);
            // Renewal heads-up: a month out, and a week past for one that lapsed.
            if (away < -7 || away > 30) continue;
            push({
              id: `contract:${c.id}:end:${end}`,
              kind: "contract",
              day: end,
              title: c.name,
              line:
                away < 0
                  ? `The contract "${c.name}"${c.customer ? ` with ${c.customer}` : ""} ended ${whenWords(end, away)}.`
                  : `The contract "${c.name}"${c.customer ? ` with ${c.customer}` : ""} ends ${whenWords(end, away)}. Time to talk renewal.`,
              href: `/contracts?contract=${encodeURIComponent(c.id)}`,
            });
          }
        })
        .catch(() => undefined),
    );
  }

  if (access.opportunities) {
    tasks.push(
      readOpportunities()
        .then((state) => {
          for (const o of state.opportunities ?? []) {
            if (o.status === "Won" || o.status === "Lost") continue;
            if (!namedOn(person, o.owner)) continue;
            /* GONE QUIET. An open deal of theirs nobody has touched in three
               weeks is the one that slips without anyone deciding it should.
               Not a deadline, so it never raises the launcher badge; it sits
               under "Needs a nudge" for briefings and "what needs me". */
            const touched = dayOf(o.updatedAt);
            if (touched) {
              const quietFor = daysBetween(touched, today);
              if (quietFor >= QUIET_DAYS) {
                push({
                  id: `deal:${o.id}:quiet`,
                  kind: "deal",
                  bucket: "attention",
                  day: touched,
                  daysAway: -quietFor,
                  title: o.name,
                  line: `The deal "${o.name}"${o.customer ? ` (${o.customer})` : ""} has had no update in ${quietFor} days.`,
                  href: `/opportunities/${encodeURIComponent(o.id)}`,
                });
              }
            }
            const sign = dayOf(o.estSignDate);
            if (!sign) continue;
            const away = daysBetween(today, sign);
            // A sign date a month gone is still worth a nudge: the pipeline is only as
            // honest as its dates.
            if (away < -30 || away > horizon) continue;
            push({
              id: `deal:${o.id}:sign:${sign}`,
              kind: "deal",
              day: sign,
              title: o.name,
              line:
                away < 0
                  ? `The deal "${o.name}"${o.customer ? ` (${o.customer})` : ""} was expected to sign ${whenWords(sign, away)} and is still ${o.status || "open"}. Update the date or the stage.`
                  : `The deal "${o.name}"${o.customer ? ` (${o.customer})` : ""} is expected to sign ${whenWords(sign, away)}.`,
              href: `/opportunities/${encodeURIComponent(o.id)}`,
            });
          }
        })
        .catch(() => undefined),
    );
  }

  if (access.customers) {
    tasks.push(
      (async () => {
        const db = getDb();
        const [interactions, customers] = await Promise.all([db.interactions.list(), db.customers.list()]);
        const names = new Map(customers.map((c) => [c.id, c.company_name]));
        for (const i of interactions) {
          if (!i.follow_up_date) continue;
          if (!namedOn(person, i.logged_by)) continue;
          const day = dayOf(i.follow_up_date);
          if (!day) continue;
          const away = daysBetween(today, day);
          if (away < -14 || away > horizon) continue;
          const company = names.get(i.customer_id) || "an account";
          push({
            id: `followup:${i.id}:${day}`,
            kind: "followup",
            day,
            title: `Follow up with ${company}`,
            line: away < 0 ? `Your follow-up with ${company} was due ${whenWords(day, away)}.` : `Follow up with ${company} ${whenWords(day, away)}.`,
            href: `/customers/${encodeURIComponent(i.customer_id)}`,
          });
        }
      })().catch(() => undefined),
    );
  }

  if (input.scope) {
    tasks.push(
      readPersonalReminders(input.scope)
        .then((list) => {
          for (const r of list) {
            if (r.doneAt) continue;
            const away = daysBetween(today, r.day);
            if (away < -14 || away > horizon) continue;
            push({
              id: `personal:${r.id}`,
              kind: "personal",
              day: r.day,
              time: r.time,
              title: r.text.length > 60 ? `${r.text.slice(0, 57)}...` : r.text,
              line: away < 0
                ? `You asked me to remind you ${whenWords(r.day, away)}: ${r.text}.`
                : `Your reminder ${whenWords(r.day, away)}${at(r.time)}: ${r.text}.`,
              href: r.account ? `/customers/${encodeURIComponent(r.account.id)}` : "/agent",
            });
          }
        })
        .catch(() => undefined),
    );
  }

  await Promise.all(tasks);

  return out.sort(
    (a, b) =>
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
      a.day.localeCompare(b.day) ||
      String(a.time ?? "").localeCompare(String(b.time ?? "")) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * The block the chat grounding carries. Empty buckets say so in one line, so
 * "nothing tomorrow" is an answer the agent can give with confidence instead
 * of a gap it fills with a guess.
 */
export function remindersGrounding(reminders: AgentReminder[], firstName: string, today: string): string {
  if (!reminders.length) {
    return `COMING UP FOR ${firstName.toUpperCase()} (checked ${today}, their own meetings, needed-by dates, contract end dates, deal sign dates and follow-ups): nothing overdue, nothing today, nothing tomorrow, nothing this week.`;
  }
  const lines: string[] = [];
  for (const bucket of BUCKET_ORDER) {
    const items = reminders.filter((r) => r.bucket === bucket);
    if (!items.length) continue;
    lines.push(`${BUCKET_LABEL[bucket]}:`);
    for (const r of items.slice(0, 12)) lines.push(`- ${r.line} [${r.title}](${r.href})`);
    if (items.length > 12) lines.push(`- and ${items.length - 12} more`);
  }
  const empty = (["overdue", "today", "tomorrow", "week"] as ReminderBucket[]).filter((bucket) => !reminders.some((r) => r.bucket === bucket));
  if (empty.length) lines.push(`Nothing ${empty.map((b) => BUCKET_LABEL[b].toLowerCase()).join(", ")}.`);
  return `COMING UP FOR ${firstName.toUpperCase()} (checked ${today}; only records they are named on; use these for "what's tomorrow", "remind me", "what's due", and to open a briefing):\n${lines.join("\n")}`;
}

/**
 * THE AGENT'S TOOL: what is coming up for a person, the asker by default.
 *
 * Asked "what does Manoj have due tomorrow?", the agent searched meetings,
 * tasks and deals, missed the two solutioning requests he raised, and said he
 * had nothing (found testing Sep 30). The same engine that answers for the
 * asker answers for a colleague, through the ASKER's own module access, so it
 * can only reveal what the asker could already open and filter by name.
 *
 * A partial name resolves against the active workspace directory: an exact
 * full name, then a unique first-name or prefix match. Several matches come
 * back as a question, never a guess.
 */
export async function comingUpForAgent(input: {
  askerName: string;
  workspaceId: string;
  person?: string;
  days?: number;
  timeZone: string;
  access: ReminderAccess;
  members: Array<{ name: string; active: boolean }>;
  scope?: WorkspaceMemberScope;
}): Promise<string> {
  const wanted = String(input.person ?? "").trim();
  let person = input.askerName;
  if (wanted && norm(wanted) !== norm(input.askerName) && !/^(me|myself|i)$/i.test(wanted)) {
    const active = input.members.filter((m) => m.active && m.name.trim());
    const exact = active.filter((m) => norm(m.name) === norm(wanted));
    const byStart = active.filter((m) => {
      const full = norm(m.name);
      return full.split(" ")[0] === norm(wanted) || full.startsWith(norm(wanted));
    });
    // "Kranthi" is both an exact name and the first name of "Kranthi Reddy":
    // a one-word name that several people answer to is a question.
    const oneWord = !norm(wanted).includes(" ");
    const loose = oneWord && byStart.length > 1 ? byStart : exact.length ? exact : byStart;
    if (!loose.length) return JSON.stringify({ person: wanted, error: `No active workspace member is called "${wanted}". Ask who they mean.` });
    if (loose.length > 1) return JSON.stringify({ person: wanted, ambiguous: loose.map((m) => m.name), note: "Several people match. Ask which one." });
    person = loose[0].name;
  }
  const reminders = await remindersFor({
    person,
    timeZone: input.timeZone,
    access: input.access,
    horizonDays: input.days ?? 7,
    // Their private reminders come back only when they are asking about themself.
    scope: norm(person) === norm(input.askerName) ? input.scope : undefined,
  });
  const today = localDay(new Date(), input.timeZone).ymd;
  return JSON.stringify({
    person,
    today,
    timeZone: input.timeZone,
    checked: ["meetings they own, attend or present", "solutioning they raised, own or attend", "contracts they own (end dates, 30 days)", "deals they own (sign dates)", "their follow-ups"].filter((_, i) =>
      [input.access.meetings, input.access.solutioning, input.access.contracts, input.access.opportunities, input.access.customers][i]),
    reminders: reminders.map((r) => ({ when: r.bucket, day: r.day, time: r.time, kind: r.kind, title: r.title, line: r.line, url: r.href })),
    note: reminders.length
      ? "Only records this person is named on. Day words are on the asker's calendar."
      : "Nothing overdue or coming up in the checked records for this person.",
  });
}
