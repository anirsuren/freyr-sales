"use client";

import { useState } from "react";
import Link from "next/link";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";

export type FanCompany = {
  name: string;
  /** The account record behind the name, when it is one of ours. */
  id?: string;
  /** A line under the name in the hover card, e.g. what it was logged for. */
  context?: string;
};

/**
 * A STACK OF COMPANY MARKS THAT FANS OPEN ON HOVER.
 *
 * The PersonFan mechanic, for accounts (Anir, Aug 15: "I don't know why you're
 * putting the customer name there. It should just be the profile picture...
 * when I hover over it, it separates and it does that animation"). Names cost
 * a table column and say nothing a logo does not; they move into the hover
 * card, where there is room for them.
 *
 * Same implementation notes as PersonFan: the spread is animated `margin-left`
 * so the marks slide out from under each other rather than the row snapping to
 * a new layout, and z-index reverses on expand so the leftmost stays on top.
 */
export function CompanyFan({
  companies,
  logoClassName = "h-7 w-7 text-[9px]",
  overlap = -6,
  max = 6,
}: {
  companies: FanCompany[];
  logoClassName?: string;
  /** How far the marks sit under each other when collapsed, in px. */
  overlap?: number;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (companies.length === 0) {
    return <span className="text-[13px] text-text-tertiary">·</span>;
  }
  const visible = companies.slice(0, max);
  const hidden = Math.max(companies.length - visible.length, 0);
  return (
    <span
      className="inline-flex items-center rounded-lg px-1 py-0.5 transition-colors duration-200 hover:bg-surface focus-within:bg-surface"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setExpanded(false);
      }}
    >
      {visible.map((c, i) => (
        <span
          key={c.name}
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : expanded ? 4 : overlap,
            zIndex: expanded ? visible.length - i : i + 1,
          }}
        >
          <HoverCard
            side="bottom"
            width={260}
            // A quarter second, like the chart hints — a full second on a
            // 28px mark feels broken (Anir, Aug 15: "why the fuck is it taking
            // 10 seconds… it should be 0.25 seconds").
            delayMs={0}
            content={
              <div className="flex items-center gap-2.5">
                <CompanyLogo name={c.name} className="h-9 w-9 text-[11px]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                    {c.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-text-tertiary">
                    {c.context ?? "Customer"}
                  </span>
                </span>
              </div>
            }
          >
            {c.id ? (
              <Link
                href={`/customers/${c.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={c.name}
                className="inline-flex rounded-full ring-2 ring-white transition-transform hover:scale-105"
              >
                <CompanyLogo name={c.name} className={logoClassName} />
              </Link>
            ) : (
              <span
                aria-label={c.name}
                className="inline-flex rounded-full ring-2 ring-white"
              >
                <CompanyLogo name={c.name} className={logoClassName} />
              </span>
            )}
          </HoverCard>
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="relative inline-flex h-7 items-center justify-center rounded-full bg-surface px-1.5 text-[10px] font-bold text-text-secondary ring-2 ring-white transition-[margin] duration-200 ease-out"
          style={{ marginLeft: expanded ? 4 : overlap }}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
