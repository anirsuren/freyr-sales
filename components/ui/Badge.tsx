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
  };
  return <Badge label={m.label} bg={m.bg} color={m.color} />;
}

// Company-size tiers are a category chip, so each gets a distinct colour + an
// icon that ramps with size (house → office → tower). Never plain gray, never
// one flat blue for all three (Suren's standing chip rule).
export const SIZE_TIER_META: Record<
  string,
  { bg: string; color: string; icon: LucideIcon }
> = {
  small: { bg: "rgba(5,150,105,0.12)", color: "#047857", icon: Home },
  mid: { bg: "rgba(245,158,11,0.14)", color: "#B45309", icon: Building },
  large: { bg: "rgba(124,58,237,0.12)", color: "#7C3AED", icon: Building2 },
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
        className="cursor-help"
      />
    </Tooltip>
  );
}
