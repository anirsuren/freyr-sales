import { Pill, Dna, Stethoscope, Leaf, FlaskConical, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Industry is a category chip, so it carries a colour AND an icon everywhere it
// appears (standing rule; Anir, Jul 26: "there are no icons or colors here").
// Colours are curated rather than hashed — biotech in green "doesn't really go".
// Unknown industries fall back to a blue flask instead of a gray outline pill.
const INDUSTRY_META: Record<string, { color: string; icon: LucideIcon }> = {
  Pharmaceutical: { color: "#0071E3", icon: Pill }, // blue
  Biotechnology: { color: "#7C3AED", icon: Dna }, // violet
  "Medical Device": { color: "#0891B2", icon: Stethoscope }, // cyan
  "Consumer Health": { color: "#DB2777", icon: Leaf }, // pink
};

export function industryMeta(industry: string) {
  return INDUSTRY_META[industry] || { color: "#0071E3", icon: FlaskConical };
}

export function IndustryTag({
  industry,
  className,
}: {
  industry: string;
  className?: string;
}) {
  if (!industry) return null;
  const { color, icon: Icon } = industryMeta(industry);
  return (
    <span
      className={cn(
        "semantic-color-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.03em]",
        className
      )}
      style={
        {
          "--semantic-color": color,
          "--semantic-bg": `${color}1F`,
        } as CSSProperties
      }
    >
      <Icon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />
      {industry}
    </span>
  );
}
