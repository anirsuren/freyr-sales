import {
  BarChart3,
  Coins,
  Cpu,
  Handshake,
  MonitorPlay,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";

/**
 * A MEETING TYPE IS A CATEGORY, SO IT WEARS A COLOUR AND AN ICON.
 *
 * Anir, Aug 28, on nine identical blue dots: "why all the same". The standing
 * rule since Aug 17 is that any category or tag chip is colour-coded AND
 * carries an icon, never a plain dot and never gray — and a picker where
 * every row looks the same is a picker you have to read word by word.
 *
 * Colours come from FILTER_PALETTE rather than being invented here, so a
 * meeting type reads the same distance from its neighbours as every other
 * category list in the app, and inherits that file's two hard rules: no two
 * neighbours in the same hue family, and never the reserved status tones (red,
 * green, amber all mean something else here).
 *
 * The icons say what the meeting IS at a glance: a handshake for meeting
 * somebody, a magnifier for finding out what they need, a screen for showing
 * them, a chip for the engineers talking to each other, a shield for
 * defending a bid, coins for the money conversation, a chart for the review,
 * a spark for the executive room, a ticket for the conference floor.
 */
export const MEETING_TYPE_META: Record<
  string,
  { color: string; icon: LucideIcon }
> = {
  Introductory: { color: FILTER_PALETTE[0], icon: Handshake },
  Discovery: { color: FILTER_PALETTE[1], icon: Search },
  "Capability / demo": { color: FILTER_PALETTE[2], icon: MonitorPlay },
  "Technical deep dive": { color: FILTER_PALETTE[3], icon: Cpu },
  "RFP defence": { color: FILTER_PALETTE[4], icon: ShieldCheck },
  "Commercial / pricing": { color: FILTER_PALETTE[5], icon: Coins },
  "QBR / review": { color: FILTER_PALETTE[6], icon: BarChart3 },
  "Executive briefing": { color: FILTER_PALETTE[7], icon: Sparkles },
  "Conference / event": { color: FILTER_PALETTE[8], icon: Ticket },
};

/** A type that predates this list, or one somebody typed, still gets a mark
 *  rather than falling back to the gray the chip rule forbids. */
export function meetingTypeMeta(type: string): { color: string; icon: LucideIcon } {
  return MEETING_TYPE_META[type] ?? { color: FILTER_PALETTE[9], icon: Handshake };
}
