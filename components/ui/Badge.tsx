import { cn } from "@/lib/utils";
import { OUTCOME_META, SIZE_TIER_LABEL } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY, sizeKey } from "@/lib/glossary";

interface BadgeProps {
  label: string;
  bg?: string;
  color?: string;
  className?: string;
}

export function Badge({ label, bg, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap text-[11px] font-semibold uppercase rounded-sm px-2 py-[2px] tracking-[0.02em]",
        className
      )}
      style={{ backgroundColor: bg, color }}
    >
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

export function SizeBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const def = GLOSSARY[sizeKey(tier)]?.def || GLOSSARY.size_tier.def;
  return (
    <Tooltip label={def}>
      <Badge
        label={SIZE_TIER_LABEL[tier] || tier}
        bg="rgba(0,113,227,0.10)"
        color="#0040A0"
        className="cursor-help"
      />
    </Tooltip>
  );
}
