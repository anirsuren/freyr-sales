import { Pill, Dna, Stethoscope, Leaf, FlaskConical, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

// Industry is a category chip, so it carries a colour AND an icon everywhere it
// appears (standing rule; Anir, Jul 26: "there are no icons or colors here").
// Colours are curated rather than hashed — biotech in green "doesn't really go".
// Unknown industries fall back to a blue flask instead of a gray outline pill.
const INDUSTRY_META: Record<string, { color: string; icon: LucideIcon }> = {
  Pharmaceutical: { color: "var(--ink-bright-blue)", icon: Pill }, // blue
  Biotechnology: { color: "var(--ink-violet-soft)", icon: Dna }, // violet
  "Medical Device": { color: "#0891B2", icon: Stethoscope }, // cyan
  "Consumer Health": { color: "#DB2777", icon: Leaf }, // pink
};

export function industryMeta(industry: string) {
  return INDUSTRY_META[industry] || { color: "var(--ink-bright-blue)", icon: FlaskConical };
}

export function IndustryTag({
  industry,
  className,
  size = "default",
}: {
  industry: string;
  className?: string;
  /** "sm" is the quiet variant for dense tables: smaller, sentence case, so
   *  the chip never outweighs the name above it (Anir, Aug 13: "the tags are
   *  too big… I don't think they have to be capitalized"). */
  size?: "default" | "sm";
}) {
  if (!industry) return null;
  const { color, icon: Icon } = industryMeta(industry);
  return (
    <span
      className={cn(
        "semantic-color-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm"
          ? "px-1.5 py-[1px] text-[9px] normal-case tracking-normal"
          : "px-2.5 py-0.5 text-[11px] uppercase tracking-[0.03em]",
        className
      )}
      style={
        {
          "--semantic-color": color,
          "--semantic-bg": tint(color, 12),
        } as CSSProperties
      }
    >
      <Icon size={size === "sm" ? 9 : 11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
      {industry}
    </span>
  );
}
