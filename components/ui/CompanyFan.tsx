"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { EntityLink } from "@/components/ui/EntityLink";
import { customerHref } from "@/lib/entityHref";

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
  nested = false,
  ringClassName = "ring-[color:var(--white)]",
}: {
  companies: FanCompany[];
  logoClassName?: string;
  /** How far the marks sit under each other when collapsed, in px. */
  overlap?: number;
  max?: number;
  /** The fan sits inside an <a> or <button>: each mark navigates from a
   *  span, never an anchor inside a button. */
  nested?: boolean;
  /** The separator ring between overlapping marks, in the row's own
   *  background colour (a tinted row wants its tint, not a white halo). */
  ringClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (companies.length === 0) {
    return <span className="text-[13px] text-text-tertiary">·</span>;
  }
  const visible = companies.slice(0, max);
  const hidden = Math.max(companies.length - visible.length, 0);
  // The white ring only separates overlapping marks; a lone mark has none.
  const stacked = visible.length > 1 || hidden > 0;
  const circle = cn(
    "relative inline-flex rounded-full transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-0.5 hover:scale-110 hover:ring-2 hover:ring-blue-primary/55",
    stacked && cn("ring-2", ringClassName)
  );
  return (
    <span
      // NO BOX BEHIND THE CIRCLES (Anir, Oct 1: "I don't know why you're
      // doing this white thing... It should hover over the actual circle").
      // The wrapper only fans the marks apart; the hovered circle itself
      // lifts and takes a blue ring.
      className="inline-flex items-center px-1 py-0.5"
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
            width={340}
            // A quarter second, like the chart hints — a full second on a
            // 28px mark feels broken (Anir, Aug 15: "why the fuck is it taking
            // 10 seconds… it should be 0.25 seconds").
            delayMs={0}
            content={
              <div className="flex items-start gap-3">
                <CompanyLogo name={c.name} className="h-10 w-10 shrink-0 text-[11px]" />
                <span className="min-w-0">
                  <span className="block break-words text-[14px] font-semibold leading-snug text-text-primary">
                    {c.name}
                  </span>
                  <span className="mt-1 block break-words text-[12px] leading-snug text-text-secondary">
                    {c.context ?? "Customer"}
                  </span>
                </span>
              </div>
            }
          >
            {c.id && nested ? (
              /* The ring and the lift live on this span, not on the
                 EntityLink: its own rounded-sm would square the circle. */
              <span className={circle}>
                <EntityLink href={customerHref(c.id, c.name)} nested title={c.name} className="block rounded-full">
                  <CompanyLogo name={c.name} className={logoClassName} />
                </EntityLink>
              </span>
            ) : c.id ? (
              <Link
                href={`/customers/${c.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={c.name}
                className={circle}
              >
                <CompanyLogo name={c.name} className={logoClassName} />
              </Link>
            ) : (
              <span
                aria-label={c.name}
                className={circle}
              >
                <CompanyLogo name={c.name} className={logoClassName} />
              </span>
            )}
          </HoverCard>
        </span>
      ))}
      {hidden > 0 && (
        /* The overflow names itself, as PersonFan's does: hovering "+N"
           lists the accounts it stands for, each one a door. */
        <HoverCard
          width={240}
          anchor="trigger"
          content={
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {hidden} more
              </p>
              <ul className="space-y-1.5">
                {companies.slice(max).map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <EntityLink href={c.id ? customerHref(c.id, c.name) : null} className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-text-primary" title={c.name}>
                      <CompanyLogo name={c.name} className="h-5 w-5 shrink-0 text-[7px]" />
                      <span className="min-w-0 truncate">{c.name}</span>
                    </EntityLink>
                  </li>
                ))}
              </ul>
            </div>
          }
        >
          <span
            className={cn(
              "relative inline-flex h-7 cursor-default items-center justify-center rounded-full bg-surface px-1.5 text-[10px] font-bold text-text-secondary ring-2 transition-[margin] duration-200 ease-out",
              ringClassName
            )}
            style={{ marginLeft: expanded ? 4 : overlap }}
          >
            +{hidden}
          </span>
        </HoverCard>
      )}
    </span>
  );
}
