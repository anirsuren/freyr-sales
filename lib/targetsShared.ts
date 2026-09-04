import type { LucideIcon } from "lucide-react";
import { FlaskConical, HeartPulse, ShoppingBag } from "lucide-react";

/**
 * TARGET ACCOUNTS — companies Freyr wants to win, before any deal exists.
 *
 * From the three visible target sheets in Suren's "GRI GRR Pipeline and
 * Target list" workbook (MPR / MDV / CON), imported Aug 17. They are NOT
 * customers (nothing sold yet) and NOT opportunities (no deal yet) — they sit
 * on the Customers page as their own tab, one step before both. Struck-off
 * rows in the sheet mean dropped targets and were excluded at import.
 */

export const TARGET_DOMAINS = ["MPR", "MDV", "CON"] as const;
export type TargetDomain = (typeof TARGET_DOMAINS)[number];

export const TARGET_DOMAIN_META: Record<
  TargetDomain,
  { label: string; color: string; icon: LucideIcon }
> = {
  MPR: { label: "Pharma (MPR)", color: "var(--ink-bright-blue)", icon: FlaskConical },
  MDV: { label: "Medical devices (MDV)", color: "var(--ink-violet-soft)", icon: HeartPulse },
  CON: { label: "Consumer (CON)", color: "var(--ink-magenta)", icon: ShoppingBag },
};

export type TargetAccount = {
  id: string;
  name: string;
  domain: TargetDomain;
  /** Verbatim from the sheet, e.g. "~$23.2B" — a size cue, not a number. */
  companyRevenue?: string;
  /** HQ country for MPR/CON; the MDV sheet has none. */
  hq?: string;
  tier?: string;
  /** The Freyr person chasing it. Plain text — many are not app users. */
  owner?: string;
  /** Estimated business, USD. */
  potential?: number;
  /** CON only: how warm the door is, 1 (best) to 3. */
  degreeOfConnection?: string;
  quarter?: string;
  notes?: string;
};

export type TargetsState = { targets: TargetAccount[] };

export function tierColor(tier: string | undefined): string {
  const t = (tier ?? "").toLowerCase();
  if (t.includes("1")) return "var(--ink-teal-deep)";
  if (t.includes("2")) return "var(--ink-bright-blue)";
  if (t.includes("3")) return "var(--ink-violet-soft)";
  return "#8E98A8";
}
