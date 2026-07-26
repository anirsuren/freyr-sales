import { Home, Building, Building2, type LucideIcon } from "lucide-react";
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
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase rounded-full px-2.5 py-0.5 tracking-[0.03em]",
        className
      )}
      style={{ backgroundColor: bg, color }}
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
  return <Badge label={m.label} bg={m.bg} color={m.color} icon={m.icon} />;
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
  small: { bg: "rgba(22,163,74,0.12)", color: "#16A34A", icon: Home },
  mid: { bg: "rgba(8,145,178,0.12)", color: "#0891B2", icon: Building },
  large: { bg: "rgba(234,88,12,0.12)", color: "#EA580C", icon: Building2 },
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
