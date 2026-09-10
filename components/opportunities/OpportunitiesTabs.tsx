"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarRange, GitCompareArrows } from "lucide-react";
import { PageTabs } from "@/components/ui/PageTabs";
import {
  OPPORTUNITY_ACTIONS_SLOT,
  OPPORTUNITY_TAB_HREF,
  OPPORTUNITY_TAB_LABEL,
  type OpportunityTab,
} from "@/lib/opportunityTabs";

/**
 * EST. BOOKED REVENUE | EST. ACCRUAL REVENUE | DEVIATIONS (Manoj, Sep 10:
 * "Move entire Revenue Accruals to Opportunities. Under Opportunities, we
 * need three tabs").
 *
 * The same selector Market Intel and Solutioning use: all the rooms visible,
 * the pill flips at once, the server's room streams in. The two accrual rooms
 * only show to people who may open Revenue accruals, the same privilege row
 * that decided who saw that module before it moved.
 *
 * NO ENTRANCE ANIMATION ON THE STRIP (the performance-pills lesson): switching
 * rooms remounts this component, so only the keyed tab-panel below animates.
 */
const META: Record<OpportunityTab, { icon: typeof Briefcase; color: string }> = {
  booked: { icon: Briefcase, color: "var(--ink-bright-blue)" },
  accrual: { icon: CalendarRange, color: "var(--ink-teal-deep)" },
  deviations: { icon: GitCompareArrows, color: "var(--ink-violet-soft)" },
};

function RoomSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[96px] rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-[46px] rounded-xl bg-surface" />
      <div className="mt-4 h-[420px] rounded-xl bg-surface" />
    </div>
  );
}

export function OpportunitiesTabs({
  active,
  showAccruals,
  children,
}: {
  active: OpportunityTab;
  /** May this person open Revenue accruals. */
  showAccruals: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState<OpportunityTab | null>(null);

  useEffect(() => {
    setClicked(null);
  }, [active]);

  const keys: OpportunityTab[] = showAccruals ? ["booked", "accrual", "deviations"] : ["booked"];
  const tabs = keys.map((key) => ({
    key,
    label: OPPORTUNITY_TAB_LABEL[key],
    icon: META[key].icon,
    color: META[key].color,
  }));

  useEffect(() => {
    for (const key of keys) {
      if (key !== active) router.prefetch(OPPORTUNITY_TAB_HREF[key]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, showAccruals, router]);

  const current = clicked ?? active;
  const switching = isPending && clicked !== null && clicked !== active;

  return (
    <>
      <div className="relative z-40 mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative">
          <h1 className="sr-only">{OPPORTUNITY_TAB_LABEL[current]}</h1>
          <PageTabs
            tabs={tabs}
            active={current}
            pending={switching ? current : null}
            onSelect={(key) => {
              if (key === current) return;
              const next = key as OpportunityTab;
              setClicked(next);
              startTransition(() => router.push(OPPORTUNITY_TAB_HREF[next], { scroll: false }));
            }}
          />
        </div>
        <div id={OPPORTUNITY_ACTIONS_SLOT} className="flex shrink-0 flex-wrap items-center justify-end gap-2" />
      </div>
      {switching ? (
        <RoomSkeleton />
      ) : (
        <div key={active} className="tab-panel">
          {children}
        </div>
      )}
    </>
  );
}
