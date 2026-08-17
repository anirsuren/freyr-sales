"use client";

import { Building2, Crosshair } from "lucide-react";
import { CustomersBrowser } from "@/components/customers/CustomersBrowser";
import { TargetsTab } from "@/components/customers/TargetsTab";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";
import type { TargetAccount } from "@/lib/targetsShared";
import type { ComponentProps } from "react";

/**
 * CUSTOMERS | TARGETS — one page, two lists (Anir, Aug 17: "do the targets
 * tab, make it consistent"). Customers is who we work with; Targets is who we
 * want to win, from Suren's three target sheets. Same pill switcher idiom as
 * the performance rooms, remembered per person, and — the performance
 * lesson — NO entrance animation anywhere near the pills.
 */
export function CustomersWorkspace({
  customersProps,
  targets,
  live,
}: {
  customersProps: ComponentProps<typeof CustomersBrowser>;
  targets: TargetAccount[];
  live: boolean;
}) {
  const [view, setView] = useStoredView<"customers" | "targets">(
    "freyr.customers.workspace",
    "customers",
    ["customers", "targets"]
  );

  const pills = [
    { key: "customers" as const, label: "Customers", icon: Building2, color: "#0071E3" },
    { key: "targets" as const, label: "Targets", icon: Crosshair, color: "#B4318F" },
  ];

  return (
    <div>
      <div className="relative z-40 mb-4">
        <div className="inline-flex items-center gap-1 rounded-full bg-surface p-1">
          {pills.map((p) => {
            const active = view === p.key;
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => setView(p.key)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold tracking-[-0.01em] transition-all",
                  active
                    ? "bg-white text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={active ? { color: p.color } : undefined}
                />
                {p.label}
                {p.key === "targets" && (
                  <span className="rounded-full bg-[rgba(180,49,143,0.12)] px-1.5 py-0.5 text-[10.5px] font-bold text-[color:#B4318F] tnum">
                    {targets.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Same entrance the performance rooms play when the tab flips — keyed
          on the view so BOTH directions animate; the pills above hold still. */}
      <div key={view} className="tab-panel">
        {view === "customers" ? (
          <CustomersBrowser {...customersProps} />
        ) : (
          <TargetsTab targets={targets} live={live} />
        )}
      </div>
    </div>
  );
}
