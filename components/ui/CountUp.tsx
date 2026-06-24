"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pipeline";

type Unit = "money" | "pct" | "count";

function fmt(n: number, unit: Unit) {
  if (unit === "money") return formatMoney(Math.round(n));
  if (unit === "pct") return `${Math.round(n)}%`;
  return String(Math.round(n));
}

// Premium count-up: a metric ticks from 0 to its value on mount. Honors
// prefers-reduced-motion (renders the final value immediately, incl. in tests),
// and always settles exactly on the target so there's no end-of-animation jump.
export function CountUp({
  value,
  unit = "count",
  durationMs = 700,
}: {
  value: number;
  unit?: Unit;
  durationMs?: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setN(value * (1 - Math.pow(1 - p, 3))); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return <>{fmt(n, unit)}</>;
}
