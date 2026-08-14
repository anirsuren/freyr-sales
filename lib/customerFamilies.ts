import {
  Dna,
  FlaskConical,
  Pill,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { CustomerFamily } from "./offerings";

/**
 * THE FIVE CUSTOMER FAMILIES, IN ONE PLACE.
 *
 * Suren, Aug 13, on a call with Anir: Eeswar had added mid-size and large
 * Medical Devices and Consumer Products segments to Freya.Register, "but those
 * don't show up here, even when I was seeing in the morning. After he edited
 * it, they still didn't show up."
 *
 * His edits saved correctly. The offering page simply never rendered them: it
 * carried its own hardcoded list of three families and looped over that, so
 * anything outside Pharmaceutical / Biologics / Bio Pharmaceutical was dropped
 * on the floor silently. Its colour helper had the same hole and painted every
 * unknown family gray — a colour this app does not allow for identity.
 *
 * The order and the colours already existed, correctly and identically, in the
 * editor, the customer-type master list and the offerings browser. The page
 * that showed the result was the one copy that had gone stale. So there is one
 * copy now, and adding a sixth family is a one-line change here rather than a
 * hunt through four files — which is exactly the bug this just caused.
 *
 * Colours are identity, never status: no red, green or amber.
 */

export const CUSTOMER_FAMILY_ORDER: readonly CustomerFamily[] = [
  "Pharmaceutical",
  "Biologics",
  "Bio Pharmaceutical",
  "Medical Devices",
  "Consumer Products",
];

export const CUSTOMER_FAMILY_META: Record<
  CustomerFamily,
  { color: string; icon: LucideIcon }
> = {
  Pharmaceutical: { color: "#0071E3", icon: Pill },
  Biologics: { color: "#DB2777", icon: Dna },
  "Bio Pharmaceutical": { color: "#7C3AED", icon: FlaskConical },
  "Medical Devices": { color: "#0F766E", icon: Stethoscope },
  // Was #C2410C, a rust orange. A customer type is an identity, and warm
  // orange/amber is reserved for status in this app (Anir, Aug 14). Cyan is
  // the one hue left that is neither a status colour nor a neighbour of the
  // four above it.
  "Consumer Products": { color: "#0891B2", icon: ShoppingBag },
};

/** The family's colour. Falls back to Pharmaceutical's blue rather than gray:
 *  an unlisted family is a data problem to fix, not a reason to render a
 *  colourless chip. */
export function customerFamilyColor(family: string): string {
  return (
    CUSTOMER_FAMILY_META[family as CustomerFamily]?.color ??
    CUSTOMER_FAMILY_META.Pharmaceutical.color
  );
}

/**
 * The families to render for a given set of customer types: every family
 * actually present, in the canonical order, with anything unrecognised kept at
 * the end instead of discarded. A segment somebody deliberately ticked must
 * never vanish because this file has not heard of it yet.
 */
export function customerFamiliesPresent(
  types: readonly { family: string }[]
): string[] {
  const present = new Set(types.map((t) => t.family));
  const known = CUSTOMER_FAMILY_ORDER.filter((f) => present.has(f));
  const unknown = [...present].filter(
    (f) => !CUSTOMER_FAMILY_ORDER.includes(f as CustomerFamily)
  );
  return [...known, ...unknown];
}
