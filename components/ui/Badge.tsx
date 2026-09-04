import { Home, Building, Building2, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { OUTCOME_META, SIZE_TIER_LABEL } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY, sizeKey } from "@/lib/glossary";

interface BadgeProps {
  label: string;
  bg?: string;
  color?: string;
  className?: string;
  icon?: LucideIcon;
}

export function Badge({ label, bg, color, className, icon: Icon }: BadgeProps) {
  const accent = color || "#59616E";
  const wash = bg || "rgba(89,97,110,0.12)";
  return (
    <span
      className={cn(
        "semantic-color-pill inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase rounded-full px-2.5 py-0.5 tracking-[0.03em]",
        className
      )}
      style={
        {
          "--semantic-color": accent,
          "--semantic-bg": wash,
        } as CSSProperties
      }
    >
      {Icon && <Icon size={11} strokeWidth={2.2} className="-ml-0.5 shrink-0" />}
      {label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const m = OUTCOME_META[outcome] || {
    label: outcome,
    bg: "rgba(142,142,147,0.12)",
    color: "#4A4A4A",
    icon: undefined,
  };
  return (
    <Badge
      label={m.label}
      bg={m.bg}
      color={m.color}
      icon={m.icon}
      className={outcome === "in_progress" ? "outcome-in-progress-pill" : undefined}
    />
  );
}

// Company-size tiers are a category chip, so each gets a distinct colour + an
// icon that ramps with size (house → office → tower). Never plain gray, never
// one flat blue for all three (Suren's standing chip rule).
//
// SIZE and SEGMENT are two different questions, so their palettes must never
// overlap: segment families own blue (Pharmaceutical), rose (Biologics), violet
// (Bio Pharmaceutical), amber (Medical Device) and teal (Consumer Health). Large
// used to be violet, which meant a "Large" chip sat next to a violet "BIO
// PHARMACEUTICAL" heading in the same card reading as the same thing (Anir, Jul
// 26: "the company size and the company category should be different colors…
// you're two purple right now"). Large is orange now — hottest colour for the
// biggest account, and clear of every family hue.
export const SIZE_TIER_META: Record<
  string,
  { bg: string; color: string; icon: LucideIcon }
> = {
  // Three sizes, three hues you can actually tell apart. Mid was indigo
  // (#4F46E5) next to large's violet (#7C3AED), which read as the same chip
  // twice (Anir, Jul 28: "mid-size and large are basically the same color,
  // which is pissing me off"). Mid moves to teal: far from both neighbours and
  // still not one of the reserved status colours.
  small: { bg: "rgba(14,165,233,0.12)", color: "#0284C7", icon: Home },
  mid: { bg: "rgba(15,118,110,0.12)", color: "var(--ink-teal-deep)", icon: Building },
  large: { bg: "rgba(124,58,237,0.12)", color: "var(--ink-violet-soft)", icon: Building2 },
};

export function SizeBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const def = GLOSSARY[sizeKey(tier)]?.def || GLOSSARY.size_tier.def;
  const meta = SIZE_TIER_META[tier] || SIZE_TIER_META.mid;
  return (
    <Tooltip label={def}>
      <Badge
        label={SIZE_TIER_LABEL[tier] || tier}
        bg={meta.bg}
        color={meta.color}
        icon={meta.icon}
        className="cursor-pointer"
      />
    </Tooltip>
  );
}

/**
 * A NAME, INSIDE A SENTENCE, AS A PILL.
 *
 * Standing rule (Anir, Aug 15: "again, group name has to be in the pill, and
 * blue"): when a confirm dialog or a warning names the exact thing it is about,
 * that name is a blue pill so you can see WHAT you are about to change without
 * reading the whole sentence. The sentence stays a sentence around it, full
 * stop and all, which is the part the first attempt at this got wrong.
 */
export function NamePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-full bg-blue-light px-2 py-0.5 align-baseline text-[12.5px] font-semibold text-blue-primary">
      {children}
    </span>
  );
}
