import { HEALTH_COLOR, type AccountHealth } from "@/lib/health";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY } from "@/lib/glossary";

export function HealthBadge({
  health,
  showScore = true,
  className,
}: {
  health: AccountHealth;
  showScore?: boolean;
  className?: string;
}) {
  const c = HEALTH_COLOR[health.band];
  const base = GLOSSARY["health_" + health.band]?.def || GLOSSARY.health.def;
  const drivers = health.factors
    .map((f) => `${f.delta > 0 ? "+" : ""}${f.delta} ${f.label}`)
    .join(" · ");
  const label = (
    <span>
      {base}
      {drivers ? (
        <span className="block mt-1 text-white/70">What&apos;s driving it: {drivers}</span>
      ) : null}
    </span>
  );
  return (
    <Tooltip label={label}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full tnum cursor-help",
          className
        )}
        style={{ background: c.bg, color: c.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
        {health.label}
        {showScore && <span className="opacity-70">{health.score}/100</span>}
      </span>
    </Tooltip>
  );
}
