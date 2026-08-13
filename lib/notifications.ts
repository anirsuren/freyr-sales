// Derives real, in-app notifications from current state (V4) — replaces the
// static bell items. Pure function so the API route + page + bell all share it.
import { buildDeals, ROTTING_DAYS } from "./pipeline";
import { OUTCOME_META } from "./utils";
import type { Customer, Contact, PitchSession, Interaction } from "./types";
import type { StoredVoiceConversation } from "./voiceEvents";

export const NOTIF_READ_KEY = "freyr.notif.read.v1";

export type NotificationType =
  | "review"
  | "rotting"
  | "signal"
  | "followup"
  | "voice"
  /** Your own account, not an account you sell to — e.g. Touch ID not set up. */
  | "security";

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
  urgency?: NotificationUrgency;
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
}): AppNotification[] {
  const {
    sessions,
    customers,
    contacts,
    interactions,
    voiceConversations = [],
    needsPasskey = false,
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
  if (needsPasskey) {
    securityRows.push({
      id: "security-passkey",
      type: "security",
      title: "Set up Touch ID",
      body: "Sign in with your fingerprint instead of typing a password.",
      subject: "Set up Touch ID",
      detail: "Use your fingerprint to sign in — takes about ten seconds.",
      urgency: "today",
      href: "/settings?tab=profile",
      ts: new Date(nowMs).toISOString(),
      stamp: "Not set up",
    });
  }

  return securityRows.concat(out)
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
