// Derives real, in-app notifications from current state (V4) — replaces the
// static bell items. Pure function so the API route + page + bell all share it.
import { buildDeals, ROTTING_DAYS } from "./pipeline";
import { OUTCOME_META } from "./utils";
import type { Customer, Contact, PitchSession, Interaction } from "./types";
import type { StoredVoiceConversation } from "./voiceEvents";
import {
  entryStatus,
  fmtAmount,
  verificationQueue,
  type PerformanceState,
} from "./performanceShared";

export const NOTIF_READ_KEY = "freyr.notif.read.v1";

export type NotificationType =
  | "review"
  | "rotting"
  | "signal"
  | "followup"
  | "voice"
  /** Your own account, not an account you sell to — e.g. Touch ID not set up. */
  | "security"
  /** A goal result of yours needs attention: rejected, or waiting on your
   *  sign-off (Anir, Aug 20: "I didn't get a notification. There has to be
   *  something that gets notified because I sent it back"). */
  | "performance"
  /**
   * A ROADMAP MOVED (product owner, Aug 20: "people should get notified if
   * there are any changes to the roadmap"). Reps quote roadmaps to customers,
   * so a date sliding without anyone saying so is how a client gets told the
   * wrong thing.
   */
  | "roadmap";

/**
 * How pressing an alert is. Five rows that all say "Follow-up due" read as five
 * copies of the same thing (Suren, Jul 27: "they don't look good at all… it just
 * looks bad"), so urgency is a first-class field: it groups the list, it orders
 * it, and it's printed as a heading you can see instead of a sort you can't.
 */
export type NotificationUrgency = "overdue" | "today" | "week" | "later";

export const URGENCY_ORDER: NotificationUrgency[] = [
  "overdue",
  "today",
  "week",
  "later",
];

/** Plain English, no jargon — this is what the group heading says. */
export const URGENCY_LABEL: Record<NotificationUrgency, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
};

/** The account-setup rows each draw their own glyph. */
export type SetupMark = "tour" | "passkey" | "profile";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  ts: string;
  /**
   * Who this alert is about. Carried alongside the copy so the bell and the
   * notifications page can show the account's logo and the person's headshot
   * instead of a generic icon — the same entity imagery used everywhere else
   * (Anir, Jul 8: "everywhere there's a name of the company, you have the logo
   * of the entity"). Resolved by name via CompanyLogo / Avatar.
   */
  company?: string;
  person?: string;
  /**
   * The row's headline: the account or person this is about. The TYPE
   * ("Follow-up due") is not a headline — it's a chip. Leading with the subject
   * is what makes a stack of five alerts scannable.
   */
  subject?: string;
  /** One short line saying what's needed. Never repeats the subject or the time. */
  detail?: string;
  /**
   * The category chip's words. Without this the chip falls back to the title,
   * which on the setup rows printed the headline twice in a row, once in bold
   * and again inside a pill (Anir, Aug 13: "I don't like the way the
   * notifications look. It's really ugly"). A chip names the KIND of thing;
   * it is never the headline repeated.
   */
  chip?: string;
  /**
   * Which glyph to draw when there is no company or person to show. The three
   * account-setup rows share one type but are three different jobs, so keying
   * the icon off the type alone stamped a fingerprint on the walkthrough and on
   * the job title too (Anir: "I have no idea why your account has a Touch ID
   * icon"). Each row names its own.
   */
  mark?: SetupMark;
  urgency?: NotificationUrgency;
  /** The rejection note, printed as its own quoted line under the detail. */
  note?: string;
  /**
   * Compact relative time ("in 4d", "2d ago") for the right-hand stamp.
   * Computed here, on the server, so the bell and the page always agree and no
   * client clock can drift the markup between render and hydration.
   */
  stamp?: string;
}

export function urgencyRank(u?: NotificationUrgency): number {
  const i = URGENCY_ORDER.indexOf(u || "later");
  return i === -1 ? URGENCY_ORDER.length : i;
}

/**
 * Splits a list into the visible urgency groups, in order, dropping empties.
 * Shared by the bell panel and the notifications page so the two never diverge.
 */
export function groupByUrgency(
  items: AppNotification[]
): Array<{ urgency: NotificationUrgency; label: string; items: AppNotification[] }> {
  return URGENCY_ORDER.map((urgency) => ({
    urgency,
    label: URGENCY_LABEL[urgency],
    items: items.filter((n) => (n.urgency || "later") === urgency),
  })).filter((g) => g.items.length > 0);
}

/**
 * "in 4d" / "2d ago" — short enough to sit in a right-aligned stamp instead of
 * being buried mid-sentence, which is where the old copy hid it.
 */
function relativeStamp(ts: string, nowMs: number): string {
  const at = new Date(ts).getTime();
  if (!Number.isFinite(at)) return "";
  const diff = at - nowMs;
  const ahead = diff >= 0;
  const mins = Math.round(Math.abs(diff) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return ahead ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return ahead ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return ahead ? `in ${days}d` : `${days}d ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return ahead ? `in ${weeks}w` : `${weeks}w ago`;
  }
  const months = Math.round(days / 30);
  return ahead ? `in ${months}mo` : `${months}mo ago`;
}

/**
 * The same stamp from a whole-day count, for dates that only ever mean a day
 * (a follow-up is "due Thursday", not "due at 00:00"). Without this, a
 * follow-up due today stamps as "14h ago" because its date lands at midnight.
 */
function dayStamp(days: number, ahead: boolean): string {
  if (days <= 0) return "Today";
  if (days < 14) return ahead ? `in ${days}d` : `${days}d ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return ahead ? `in ${weeks}w` : `${weeks}w ago`;
  }
  const months = Math.round(days / 30);
  return ahead ? `in ${months}mo` : `${months}mo ago`;
}

/** One offering's roadmap history, as much of it as the reader may see. */
export type RoadmapChangeInput = {
  offeringId: string;
  offeringName: string;
  versions: {
    version: number;
    savedAt: string;
    savedBy: string;
    changes: string[];
  }[];
};

/** How long a roadmap change stays worth a bell. */
const ROADMAP_NOTICE_DAYS = 21;

export function buildNotifications(input: {
  sessions: PitchSession[];
  customers: Customer[];
  contacts: Contact[];
  interactions: Interaction[];
  voiceConversations?: StoredVoiceConversation[];
  /** True when the signed-in person has no passkey yet — the Touch ID nudge
   *  (Anir, Aug 12: "if they don't have it, it should be in the notifications
   *  ... until they do it"). Computed server-side; false hides the row. */
  needsPasskey?: boolean;
  /** True when the signed-in person has never finished the guided walkthrough
   *  (Anir, Aug 13: "if anyone has not taken the tour, it has to show up in
   *  notifications"). Same shape as the Touch ID nudge: server-computed, a
   *  standing row while it is true, gone the moment they finish. */
  needsTour?: boolean;
  /** True when the signed-in person has left their job title blank (Anir,
   *  Aug 13: "their notification should be a third notification for putting
   *  their title instead of saying 'title not set'"). */
  needsTitle?: boolean;
  /**
   * GOAL RESULTS THAT NEED SOMEBODY (Anir, Aug 20: "It should say that this
   * guy's profile picture sent this thing back... This should show up at the
   * top right, especially if it's sent back, because it needs my action
   * item"). A rejection that only exists on a table the rep has to think to
   * open is a rejection nobody sees.
   */
  performance?: { state: PerformanceState; me: string } | null;
  /**
   * Offerings whose roadmap changed recently, newest version first. Derived
   * from the stored version history rather than any new event log — the
   * history IS the record of what changed and when.
   */
  roadmaps?: RoadmapChangeInput[];
}): AppNotification[] {
  const {
    sessions,
    customers,
    contacts,
    interactions,
    voiceConversations = [],
    needsPasskey = false,
    needsTour = false,
    needsTitle = false,
    performance = null,
  } = input;
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const out: AppNotification[] = [];
  const nowMs = Date.now();

  // Pitches awaiting compliance review
  for (const s of sessions) {
    if (s.review_status === "in_review") {
      const company = custById[s.customer_id]?.company_name || "Account";
      out.push({
        id: `review-${s.id}`,
        type: "review",
        title: "Pitch awaiting your approval",
        body: `${company}: review the pitch before it's sent.`,
        subject: company,
        detail: "Read the pitch and approve it before it goes out.",
        urgency: "today",
        href: `/sessions/${s.id}`,
        ts: s.created_at,
        company,
      });
    }
  }

  // Rotting deals (no activity in N days)
  const deals = buildDeals(sessions, customers, contacts, interactions);
  for (const d of deals) {
    if (d.staleDays > ROTTING_DAYS && d.stage !== "Closed Lost") {
      out.push({
        id: `rotting-${d.sessionId}`,
        type: "rotting",
        title: "Deal going cold",
        body: `${d.company}: no activity in ${d.staleDays} days.`,
        subject: d.company,
        // The stamp already says how long ago it last moved, so this line only
        // says what to do about it.
        detail: d.contactName
          ? `Nothing has moved here: get back to ${d.contactName}.`
          : "Nothing has moved here: reach out or move it on.",
        // It has already sat past the rotting line, so it is late by definition.
        urgency: "overdue",
        href: `/deals/${d.sessionId}`,
        ts: d.lastActivity,
        company: d.company,
        person: d.contactName,
      });
    }
  }

  // Fresh buying signals + upcoming follow-ups
  for (const i of interactions) {
    const company = custById[i.customer_id]?.company_name || "Account";
    if (i.outcome === "interested" || i.outcome === "meeting_booked") {
      const who = contactById[i.contact_id]?.full_name;
      const signal = OUTCOME_META[i.outcome]?.label || i.outcome;
      out.push({
        id: `signal-${i.id}`,
        type: "signal",
        title: "New buying signal",
        body: `${company} - ${signal}.`,
        subject: company,
        detail: who ? `${who} - ${signal}. Act while it's warm.` : `${signal}. Act while it's warm.`,
        urgency: "week",
        href: `/customers/${i.customer_id}`,
        ts: i.created_at,
        company,
        person: who,
      });
    }
    if (i.follow_up_date) {
      // A follow-up whose date has already passed is overdue, not "due" — say so
      // rather than "Follow-up due … scheduled for [last December]", which reads
      // as a contradiction. Compare by day so today's follow-up still counts as due.
      const due = new Date(i.follow_up_date);
      const dueDay = new Date(
        due.getFullYear(),
        due.getMonth(),
        due.getDate()
      ).getTime();
      const now = new Date();
      const todayDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
      const overdue = dueDay < todayDay;
      // Useful copy for a rep (Anir: the old "scheduled for [date]" told them
      // nothing): who, how late, and what the last outcome was — one tap to the
      // account to act on it.
      const dayMs = 86_400_000;
      const contactName = contactById[i.contact_id]?.full_name || "";
      const outcomeLabel = i.outcome ? OUTCOME_META[i.outcome]?.label || "" : "";
      let when: string;
      let urgency: NotificationUrgency;
      let stamp: string;
      if (overdue) {
        const n = Math.max(1, Math.round((todayDay - dueDay) / dayMs));
        when = `${n} day${n === 1 ? "" : "s"} overdue`;
        urgency = "overdue";
        stamp = dayStamp(n, false);
      } else if (dueDay === todayDay) {
        when = "due today";
        urgency = "today";
        stamp = "Today";
      } else {
        const n = Math.round((dueDay - todayDay) / dayMs);
        when = `due in ${n} day${n === 1 ? "" : "s"}`;
        urgency = n <= 7 ? "week" : "later";
        stamp = dayStamp(n, true);
      }
      out.push({
        id: `followup-${i.id}`,
        type: "followup",
        title: overdue ? "Follow-up overdue" : "Follow-up due",
        body: `${company}${contactName ? ` · ${contactName}` : ""} - ${when}${
          outcomeLabel ? `, last: ${outcomeLabel}` : ""
        }.`,
        subject: company,
        // The "when" lives in the right-hand stamp, so this line only has to
        // say what to DO and where you left off.
        detail: `${contactName ? `Check in with ${contactName}` : "Check back in"}${
          outcomeLabel ? ` · last time: ${outcomeLabel}` : ""
        }`,
        urgency,
        stamp,
        href: `/customers/${i.customer_id}`,
        ts: i.follow_up_date,
        company,
        person: contactName || undefined,
      });
    }
  }

  for (const call of voiceConversations) {
    if (call.status !== "completed" && call.status !== "failed") continue;
    const failed = call.status === "failed";
    out.push({
      id: `voice-${call.conversation_id || call.id}-${call.status}`,
      type: "voice",
      title: failed ? "Voice call needs attention" : "Call analysis is ready",
      body: failed
        ? `${call.contact_name || call.external_number || "A call"} - ${call.failure_reason || "the call did not complete"}.`
        : `${call.contact_name || "A contact"}${call.company ? ` at ${call.company}` : ""} - transcript and analysis are ready.`,
      subject:
        call.company || call.contact_name || call.external_number || "Voice call",
      detail: failed
        ? `${call.failure_reason || "The call did not complete"}${
            call.contact_name ? `, try ${call.contact_name} again` : ""
          }.`
        : `${call.contact_name ? `${call.contact_name}, t` : "T"}ranscript and analysis are ready to read.`,
      urgency: failed ? "today" : "week",
      href: `/voice/c/${call.conversation_id || call.id}`,
      ts: call.completed_at || call.updated_at,
      // A call is about a company and a person too — same logo + headshot rule
      // as every other row, instead of the generic phone tile it used to get.
      company: call.company || undefined,
      person: call.contact_name || undefined,
    });
  }

  // TOUCH ID, UNTIL IT'S DONE. Not a popup on every login (Anir changed his
  // mind mid-thought: "let's just throw it in notifications") — a standing row
  // that regenerates on every load while the account has no passkey, and
  // disappears by itself the moment one is enrolled.
  const securityRows: AppNotification[] = [];
  /**
   * THE WALKTHROUGH, UNTIL IT'S TAKEN (Anir, Aug 13: "if anyone has not taken
   * the tour, it has to show up in notifications… realistically, the only two
   * notifications should be if they have not taken the product tour and if they
   * have not set up Touch ID").
   *
   * Two setup nudges, both about YOUR OWN account, both self-clearing. Nothing
   * else belongs in this list during the pilot: an alert someone cannot act on
   * is worse than an empty bell.
   */
  if (needsTour) {
    securityRows.push({
      id: "setup-product-tour",
      type: "security",
      title: "Take the guided walkthrough",
      body: "A short tour of the app, one screen at a time.",
      subject: "Take the guided walkthrough",
      chip: "Getting started",
      mark: "tour",
      detail: "Five minutes, and you can stop at any point.",
      urgency: "today",
      href: "/onboarding",
      ts: new Date(nowMs).toISOString(),
      stamp: "Not taken",
    });
  }
  if (needsPasskey) {
    securityRows.push({
      id: "security-passkey",
      type: "security",
      title: "Set up Touch ID",
      body: "Sign in with your fingerprint instead of typing a password.",
      subject: "Set up Touch ID",
      chip: "Sign-in",
      mark: "passkey",
      detail: "Use your fingerprint instead of a password. Ten seconds.",
      urgency: "today",
      href: "/settings?tab=profile",
      ts: new Date(nowMs).toISOString(),
      stamp: "Not set up",
    });
  }
  if (needsTitle) {
    securityRows.push({
      id: "setup-job-title",
      type: "security",
      title: "Add your job title",
      body: "Your job title is blank on your profile.",
      subject: "Add your job title",
      chip: "Your profile",
      mark: "profile",
      // Says what it costs to ignore. "Title not set" is the literal string a
      // teammate sees on the team page and on this person's profile.
      detail: 'Your team sees "Title not set" next to your name until you do.',
      urgency: "today",
      href: "/settings?tab=profile",
      ts: new Date(nowMs).toISOString(),
      stamp: "Not set",
    });
  }

  /**
   * A REJECTED RESULT IS THE MOST URGENT THING A REP CAN HAVE (Anir, Aug 20).
   * It carries the rejector's face, because the first question a rep asks is
   * who, and the second is why. Overdue on purpose: it is already late — the
   * money stopped counting the moment it was sent back.
   */
  const perfRows: AppNotification[] = [];
  if (performance?.me) {
    const { state: perf, me } = performance;
    const mine = perf.actuals.filter(
      (a) =>
        a.person.trim().toLowerCase() === me.trim().toLowerCase() &&
        entryStatus(a) === "sent_back"
    );
    for (const a of mine) {
      const goal = perf.goals.find((g) => g.id === a.goalId);
      const amount = goal ? fmtAmount(goal.unit, a.amount, a.currency) : String(a.amount);
      /**
       * WHO, PLAINLY, THEN WHY (Anir, Aug 20, reading it on his own bell:
       * "You have to say clearly, 'Anir Suren sent it back,' and then
       * underneath you put the reason").
       *
       * The sentence had been split across the avatar line and a run-on
       * detail ('Anir Suren  sent it back: "test". It does not count…'),
       * which read as a fragment. The line beside the face now says the one
       * whole fact, and the note is its own quoted line via `note`.
       */
      perfRows.push({
        id: `perf-sent-back-${a.id}`,
        type: "performance",
        title: "A result of yours was sent back",
        body: a.managerNote || "Open it, fix what they asked for, and save.",
        subject: `${amount} on ${goal?.name ?? "a goal"} was sent back`,
        chip: "Needs your fix",
        person: a.sentBackBy || undefined,
        detail: a.sentBackBy
          ? "sent it back. It does not count until you fix it."
          : "Your group owner sent it back. It does not count until you fix it.",
        note: a.managerNote || undefined,
        urgency: "overdue",
        href: "/performance/people",
        ts: a.sentBackAt || a.addedAt || new Date(nowMs).toISOString(),
      });
    }
    // The other side of the same handshake: claims sitting on a group owner.
    const waiting = verificationQueue(perf, me);
    if (waiting.length > 0) {
      const total = waiting.reduce((sum, q) => sum + (q.amount || 0), 0);
      perfRows.push({
        id: "perf-verify-queue",
        type: "performance",
        title: "Claims waiting for you to verify",
        body: `${waiting.length} result${waiting.length === 1 ? "" : "s"} from your people need checking.`,
        subject: `${waiting.length} claim${waiting.length === 1 ? "" : "s"} waiting on you`,
        chip: "Your sign-off",
        detail: `${total.toLocaleString()} is on hold until you check the proof and lock it.`,
        urgency: "today",
        href: "/performance/people",
        ts: waiting[0]?.addedAt || new Date(nowMs).toISOString(),
      });
    }
  }

  /**
   * ROADMAP CHANGES (product owner, Aug 20: "people should get notified if
   * there are any changes to the roadmap").
   *
   * One row per offering, not per version: three edits in an afternoon are one
   * thing a rep needs to know, and three identical bells would be noise. The
   * row names the newest version and what changed in it, and says how many
   * other changes came with it.
   */
  const roadmapRows: AppNotification[] = [];
  for (const r of input.roadmaps ?? []) {
    const recent = (r.versions ?? [])
      .filter((v) => {
        const t = Date.parse(v.savedAt);
        return (
          Number.isFinite(t) && nowMs - t <= ROADMAP_NOTICE_DAYS * 24 * 60 * 60 * 1000
        );
      })
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    if (!recent.length) continue;
    const latest = recent[0];
    const alsoBefore = recent.length - 1;
    const headline = latest.changes[0] || "Roadmap updated";
    const more = latest.changes.length - 1;
    roadmapRows.push({
      id: `roadmap-${r.offeringId}-v${latest.version}`,
      type: "roadmap",
      title: `${r.offeringName} roadmap changed`,
      body: latest.changes.join(" · ") || "The roadmap for this offering was updated.",
      subject: `${r.offeringName} roadmap is now v${latest.version}`,
      chip: `v${latest.version}`,
      person: latest.savedBy || undefined,
      detail: more > 0
        ? `${headline}, and ${more} other change${more === 1 ? "" : "s"}.`
        : `${headline}.`,
      note: alsoBefore > 0
        ? `${alsoBefore} earlier change${alsoBefore === 1 ? "" : "s"} in the last three weeks.`
        : undefined,
      /* Something a rep may already have quoted to a customer, so it sits with
         the work of the day rather than in "later". */
      urgency: "week",
      href: `/offerings/${r.offeringId}`,
      ts: latest.savedAt,
    });
  }

  /**
   * A BULK UPDATE MUST NOT BECOME THE WHOLE BELL.
   *
   * One row per changed offering is right for two or three. It is wrong for
   * twenty-five: the list is capped at 30, so an owner working through the
   * catalogue in one sitting — or an import — would push every sent-back
   * claim and every follow-up off the bottom. The newest few keep their own
   * row and say what changed; the rest collapse into one line that still says
   * the number, so nothing is silently dropped.
   */
  const ROADMAP_ROWS_SHOWN = 3;
  const roadmapShown = roadmapRows
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, ROADMAP_ROWS_SHOWN);
  const roadmapRest = roadmapRows.length - roadmapShown.length;
  if (roadmapRest > 0) {
    roadmapShown.push({
      id: "roadmap-more",
      type: "roadmap",
      title: "More roadmaps changed",
      body: `${roadmapRest} other offering${roadmapRest === 1 ? "" : "s"} changed their roadmap recently.`,
      subject: `${roadmapRest} more roadmap${roadmapRest === 1 ? "" : "s"} changed`,
      chip: "Offerings",
      detail: "Open Offerings to see which ones.",
      urgency: "week",
      href: "/offerings",
      ts: roadmapRows[roadmapShown.length]?.ts ?? new Date(nowMs).toISOString(),
    });
  }

  return perfRows.concat(securityRows).concat(roadmapShown).concat(out)
    .map((n) => ({ ...n, stamp: n.stamp || relativeStamp(n.ts, nowMs) }))
    .sort((a, b) => {
      // Your own account first: a rep can't be nagged about a customer while
      // their own sign-in is still half-finished.
      const bySelf =
        Number(b.type === "security") - Number(a.type === "security");
      if (bySelf !== 0) return bySelf;
      // Urgency first — overdue work should never sit below a note from today
      // just because the note is newer. Within a bucket, most recent first.
      const byUrgency = urgencyRank(a.urgency) - urgencyRank(b.urgency);
      if (byUrgency !== 0) return byUrgency;
      return new Date(b.ts).getTime() - new Date(a.ts).getTime();
    })
    .slice(0, 30);
}
