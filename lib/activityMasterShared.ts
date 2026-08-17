import { CUSTOMER_OFFERING_ACTIVITIES } from "./customerOfferingHeatMap";
import type { CustomerOfferingActivity } from "./types";

/**
 * THE ACTIVITY MASTER — which goal an activity feeds, and how.
 *
 * Suren, Aug 17: "I think we should keep a master list of these activities,
 * what all activities that people can add. For an activity, for example, if
 * somebody says contract, then against that activity, you can have those
 * goals… when they actually make something current, whatever goal is connected
 * to that particular activity, that goal automatically gets connected. They
 * don't have to enter."
 *
 * And how it counts: "You will have to clearly say that the dollar value is
 * equal to the goal… sometimes just the number can be a goal. Number means I
 * am doing a pilot. That means 1. Another pilot, that's 2. Item value, dollar
 * value, that's all."
 *
 * Whose number: "against which person that particular goal will go… that is
 * based on who is actually adding that activity."
 *
 * Suren left 17 written questions unanswered, so the defaults here are the
 * transcript plus judgement, each one built to swing without surgery:
 *  - one activity can feed several goals; the person picks ONE when logging
 *    ("they can select that goal" — his New vs Existing booking example)
 *  - contribution is set on the master, never chosen at logging time
 *  - a count activity always counts exactly 1
 *  - the five built-in activities cannot be deleted — engagement history is
 *    written in them — but everything about them can be edited
 */

export const CONTRIBUTIONS = ["dollar", "count", "typed", "none"] as const;
export type ActivityContribution = (typeof CONTRIBUTIONS)[number];

export const CONTRIBUTION_META: Record<
  ActivityContribution,
  { label: string; hint: string }
> = {
  dollar: {
    label: "Dollar value",
    hint: "The activity's money is the number — a $500K contract adds $500K.",
  },
  count: {
    label: "Counts as 1",
    hint: "Each one adds one — a pilot done is 1, the next pilot is 2. Nobody types a number.",
  },
  typed: {
    // Suren, Aug 17 answers: "set it up in the master that something is a one,
    // something is the dollar value and something is user connected."
    label: "Person types the number",
    hint: "Whoever logs it types how much it adds, right when they log it.",
  },
  none: {
    label: "Not counted",
    hint: "Logged for the record; it feeds no goal.",
  },
};

/**
 * WHEN IT STARTS COUNTING (Suren, Aug 17 answers: "a contract value is
 * completed and then you do that, but a pilot in progress should count as
 * one — when you're setting the activity, the status is also added").
 * Each master activity says which status makes it count toward its goal.
 */
export const COUNTS_FROM = ["initiated", "under_progress", "completed"] as const;
export type ActivityCountsFrom = (typeof COUNTS_FROM)[number];

export const COUNTS_FROM_META: Record<ActivityCountsFrom, { label: string }> = {
  initiated: { label: "As soon as it's initiated" },
  under_progress: { label: "Once it's under progress" },
  completed: { label: "Only when completed" },
};

const STATUS_ORDER: Record<string, number> = {
  initiated: 0,
  under_progress: 1,
  completed: 2,
};

/** Has this engagement status reached the master's counting threshold? */
export function statusCounts(
  status: string,
  countsFrom: ActivityCountsFrom
): boolean {
  const s = STATUS_ORDER[status.trim().toLowerCase()];
  return s !== undefined && s >= STATUS_ORDER[countsFrom];
}

export type MasterActivity = {
  /** Built-ins use the engagement vocabulary key (lead, pilot…). */
  id: string;
  label: string;
  /** Chip colour. Built-ins keep the heat-map colours the app already uses. */
  color: string;
  contribution: ActivityContribution;
  /** The status at which this activity starts counting toward its goal. */
  countsFrom: ActivityCountsFrom;
  /** The goals this activity MAY feed — the allowed list. The logger always
   *  picks exactly one from it (Suren: "you'll pick it up only from that
   *  list that is there"). */
  goalIds: string[];
  builtIn: boolean;
};

export type ActivityMasterState = { activities: MasterActivity[] };

/**
 * The five built-ins, from Suren's own Activities sheet (Aug 8), wearing the
 * exact colours the heat map already gives them. His transcript examples set
 * pilot and contract; the rest start uncounted rather than guessed.
 */
export function builtInActivities(): MasterActivity[] {
  const meta = CUSTOMER_OFFERING_ACTIVITIES;
  const contribution: Record<CustomerOfferingActivity, ActivityContribution> = {
    lead: "none",
    opportunity: "none",
    pilot: "count",
    contract: "dollar",
    delivery: "none",
  };
  // Suren's own examples: a pilot counts while it's running, a contract's
  // money counts only once it's done.
  const countsFrom: Record<CustomerOfferingActivity, ActivityCountsFrom> = {
    lead: "completed",
    opportunity: "completed",
    pilot: "under_progress",
    contract: "completed",
    delivery: "completed",
  };
  return (Object.keys(meta) as CustomerOfferingActivity[]).map((key) => ({
    id: key,
    label: meta[key].label,
    color: meta[key].color,
    contribution: contribution[key],
    countsFrom: countsFrom[key],
    goalIds: [],
    builtIn: true,
  }));
}

export const EMPTY_ACTIVITY_MASTER: ActivityMasterState = {
  activities: builtInActivities(),
};

/** The master entry behind an engagement's activity value, if any. */
export function masterFor(
  state: ActivityMasterState,
  activityKey: string
): MasterActivity | null {
  const k = activityKey.trim().toLowerCase();
  return state.activities.find((a) => a.id.toLowerCase() === k) ?? null;
}
