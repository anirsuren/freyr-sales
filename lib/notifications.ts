// Derives real, in-app notifications from current state (V4) — replaces the
// static bell items. Pure function so the API route + page + bell all share it.
import { buildDeals, ROTTING_DAYS } from "./pipeline";
import { OUTCOME_META } from "./utils";
import type { Customer, Contact, PitchSession, Interaction } from "./types";

export const NOTIF_READ_KEY = "freyr.notif.read.v1";

export type NotificationType = "review" | "rotting" | "signal" | "followup";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  ts: string;
}

export function buildNotifications(input: {
  sessions: PitchSession[];
  customers: Customer[];
  contacts: Contact[];
  interactions: Interaction[];
}): AppNotification[] {
  const { sessions, customers, contacts, interactions } = input;
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const out: AppNotification[] = [];

  // Pitches awaiting compliance review
  for (const s of sessions) {
    if (s.review_status === "in_review") {
      const company = custById[s.customer_id]?.company_name || "Account";
      out.push({
        id: `review-${s.id}`,
        type: "review",
        title: "Pitch awaiting your approval",
        body: `${company} — review the pitch before it's sent.`,
        href: `/sessions/${s.id}`,
        ts: s.created_at,
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
        body: `${d.company} — no activity in ${d.staleDays} days.`,
        href: `/deals/${d.sessionId}`,
        ts: d.lastActivity,
      });
    }
  }

  // Fresh buying signals + upcoming follow-ups
  for (const i of interactions) {
    const company = custById[i.customer_id]?.company_name || "Account";
    if (i.outcome === "interested" || i.outcome === "meeting_booked") {
      out.push({
        id: `signal-${i.id}`,
        type: "signal",
        title: "New buying signal",
        body: `${company} — ${OUTCOME_META[i.outcome]?.label || i.outcome}.`,
        href: `/customers/${i.customer_id}`,
        ts: i.created_at,
      });
    }
    if (i.follow_up_date) {
      out.push({
        id: `followup-${i.id}`,
        type: "followup",
        title: "Follow-up due",
        body: `${company} — scheduled for ${new Date(
          i.follow_up_date
        ).toLocaleDateString()}.`,
        href: "/tasks",
        ts: i.follow_up_date,
      });
    }
  }

  return out
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 30);
}
