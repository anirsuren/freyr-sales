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

/**
 * Health as a filled bar rather than a pill.
 *
 * A pill reading "62/100" makes you do the arithmetic to know whether that is
 * good; a bar shows how far along the account is before you've read the number
 * (Anir, Jul 25: health should be "a color-coded progress bar, not a pill").
 * Same colour bands as the badge, so the two never disagree.
 */
export function HealthBar({
  health,
  className,
  showLabel = true,
}: {
  health: AccountHealth;
  className?: string;
  showLabel?: boolean;
}) {
  const c = HEALTH_COLOR[health.band];
  const base = GLOSSARY["health_" + health.band]?.def || GLOSSARY.health.def;
  const drivers = health.factors
    .map((f) => `${f.delta > 0 ? "+" : ""}${f.delta} ${f.label}`)
    .join(" · ");
  const pct = Math.max(0, Math.min(100, health.score));

  return (
    <Tooltip
      className="block w-full"
      label={
        <span>
          {base}
          {drivers ? (
            <span className="block mt-1 text-white/70">
              What&apos;s driving it: {drivers}
            </span>
          ) : null}
        </span>
      }
    >
      <span className={cn("block w-full cursor-help", className)}>
        {showLabel && (
          <span className="flex items-baseline justify-between mb-1">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.04em]"
              style={{ color: c.color }}
            >
              {health.label}
            </span>
            <span className="text-[11px] font-semibold tnum text-text-secondary">
              {health.score}/100
            </span>
          </span>
        )}
        <span
          className="block h-1.5 w-full rounded-full overflow-hidden"
          style={{ background: c.bg }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Relationship health: ${health.label}, ${health.score} out of 100`}
        >
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, background: c.color }}
          />
        </span>
      </span>
    </Tooltip>
  );
}
