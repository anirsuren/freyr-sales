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

export const CONTRIBUTIONS = ["dollar", "count", "none"] as const;
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
    hint: "Each one adds one — a pilot done is 1, the next pilot is 2.",
  },
  none: {
    label: "Not counted",
    hint: "Logged for the record; it feeds no goal.",
  },
};

export type MasterActivity = {
  /** Built-ins use the engagement vocabulary key (lead, pilot…). */
  id: string;
  label: string;
  /** Chip colour. Built-ins keep the heat-map colours the app already uses. */
  color: string;
  contribution: ActivityContribution;
  /** The goals this activity feeds. Several means the logger picks one. */
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
  return (Object.keys(meta) as CustomerOfferingActivity[]).map((key) => ({
    id: key,
    label: meta[key].label,
    color: meta[key].color,
    contribution: contribution[key],
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
