// What a logged touch LOOKS like on the deal page.
//
// The shared <OutcomeBadge> reads lib/utils' OUTCOME_META, and that map still
// paints "In Progress" as yellow-on-brown (rgba(255,204,0,0.28) behind #705600,
// lib/utils.ts:107-112) and "No Response" as gray-on-gray (#4A4A4A). Both are
// banned: yellow is out app-wide, and a category chip is never gray. Rather than
// let a shared map decide how this page looks, the deal page carries its own —
// and it doesn't invent a fourth palette to do it.
//
// THE RULE: an activity is coloured by the STAGE it moves the deal to. The rail
// at the top of the page already taught the reader that Engaged is blue and
// Qualified is violet; a touch that pushes the deal to Engaged is therefore
// blue. The timeline and the stage tracker end up telling one story in one set
// of colours, and "In Progress" reads as forward motion instead of a warning.
// Outcomes with no stage mapping (a call that didn't connect, a decline) fall
// back to the app's caution/error tokens — never yellow.
import {
  CalendarCheck,
  CalendarClock,
  CircleSlash,
  MessageSquareText,
  PhoneCall,
  PhoneMissed,
  ThumbsDown,
  ThumbsUp,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { OUTCOME_TO_STAGE, STAGE_COLOR } from "@/lib/pipeline";
import type { Interaction } from "@/lib/types";

/** The app-wide caution token. NEVER #F59E0B / #EAB308 / #CA8A04 / #D97706. */
const CAUTION = "#C2410C";
/** Real error red — the same --error the snapshot's risk track earns. */
const ERROR = "#EF4444";
/** Anything the app hasn't classified: teal, so it still carries a colour. */
const UNCLASSIFIED = "#0F766E";

const LABEL: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  in_progress: "In progress",
  no_response: "No response",
  meeting_booked: "Meeting booked",
  ai_call_completed: "AI call completed",
  ai_call_failed: "AI call failed",
  follow_up: "Follow-up",
  no_answer: "No answer",
  declined: "Declined",
};

const ICON: Record<string, LucideIcon> = {
  interested: ThumbsUp,
  not_interested: ThumbsDown,
  in_progress: Timer,
  no_response: CircleSlash,
  meeting_booked: CalendarCheck,
  ai_call_completed: PhoneCall,
  ai_call_failed: PhoneMissed,
  follow_up: CalendarClock,
  no_answer: PhoneMissed,
  declined: ThumbsDown,
};

/** Outcomes that never move a deal along the funnel, so they can't borrow a
 *  stage colour. Caution for "didn't connect", error for "said no". */
const OFF_FUNNEL: Record<string, string> = {
  follow_up: STAGE_COLOR.Engaged,
  no_answer: CAUTION,
  declined: ERROR,
};

export type OutcomeMark = {
  outcome: string;
  label: string;
  color: string;
  icon: LucideIcon;
};

/** Colour + icon + plain-English label for one logged outcome. Never gray, and
 *  never a yellow band. */
export function outcomeMark(outcome: string): OutcomeMark {
  const stage = OUTCOME_TO_STAGE[outcome];
  const color =
    OFF_FUNNEL[outcome] ?? (stage ? STAGE_COLOR[stage] : UNCLASSIFIED);
  return {
    outcome,
    label: LABEL[outcome] || outcome.replace(/_/g, " "),
    color,
    icon: ICON[outcome] || MessageSquareText,
  };
}

export type OutcomeSlice = OutcomeMark & { count: number; share: number };

/** The real mix of what has actually been logged on this deal — every slice is
 *  a count of real interaction rows, never a modelled or bucketed number. */
export function outcomeMix(interactions: Interaction[]): OutcomeSlice[] {
  const counts = new Map<string, number>();
  for (const it of interactions) {
    counts.set(it.outcome, (counts.get(it.outcome) || 0) + 1);
  }
  const total = interactions.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([outcome, count]) => ({
      ...outcomeMark(outcome),
      count,
      share: (count / total) * 100,
    }));
}
