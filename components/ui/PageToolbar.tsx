"use client";

import type { ReactNode } from "react";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { FilterMenu, type FilterGroup } from "@/components/ui/FilterMenu";
import { cn } from "@/lib/utils";

/**
 * ONE TOOLBAR, EVERY LIST PAGE.
 *
 * Anir, Aug 21, pointing at the offerings page: "whatever you have here — I
 * like that search bar. The size of it, the filter, the sort, and the rows or
 * the tiles. That's good. Keep that on the sales materials page, exactly that.
 * Same thing on the FDL components, same thing on Opportunities, same thing on
 * Customers — your customers page is weird, there's literally a dropdown on
 * its own line there. Same thing on Team. Do it for all the pages."
 *
 * Five pages had five hand-built rows: FDL Components had no container at all
 * and a hand-rolled search box, Opportunities used the right input but never
 * wrapped it so its focus-compression never fired, Customers pushed a page-size
 * select onto a line of its own, Team stacked three permanently-open selects.
 * Control heights disagreed by four pixels in the same row.
 *
 * So the row itself is a component now, and the pages pass content rather than
 * layout. Anything that used to be "make it look like Offerings" is now "use
 * this", which is the only version of consistency that survives the next edit.
 *
 * THE SHAPE, left to right:
 *   search (grows)  ·  Filter button  ·  extras  │  SORT + sort  ·  view toggle
 * The divider before the display cluster is what stops sort and view reading
 * as two more filters.
 */
export function PageToolbar({
  query,
  onQuery,
  placeholder,
  placeholders,
  searchAriaLabel,
  groups,
  onClearAll,
  filtersBefore,
  filtersAfter,
  sortLabel = "Sort",
  sort,
  view,
  display,
  className,
}: {
  query: string;
  onQuery: (next: string) => void;
  placeholder: string;
  /** Rotating hints for the animated placeholder, when the page has them. */
  placeholders?: string[];
  searchAriaLabel: string;
  /** Layered filter groups. Omit for a page with nothing to filter. */
  groups?: FilterGroup[];
  onClearAll?: () => void;
  /** Controls that belong beside the Filter button rather than in it. */
  filtersBefore?: ReactNode;
  filtersAfter?: ReactNode;
  /** The sort control itself; the uppercase label is drawn for you. */
  sort?: ReactNode;
  sortLabel?: string;
  /** The tile/table toggle. */
  view?: ReactNode;
  /** Anything else that belongs in the right-hand display cluster. */
  display?: ReactNode;
  className?: string;
}) {
  const hasDisplay = Boolean(sort || view || display);
  return (
    <SearchPriority
      query={query}
      className={cn(
        "rise-in mb-4 flex flex-nowrap items-center gap-2.5 rounded-xl border border-border-light bg-[var(--surface)] p-2.5",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <PrioritySearchInput
          grow
          value={query}
          onChange={onQuery}
          placeholder={placeholder}
          placeholders={placeholders}
          ariaLabel={searchAriaLabel}
          iconSize={16}
          className="min-w-[200px] flex-1"
          iconClassName="left-3"
          /* h-10 explicitly: the pages that hand-rolled this input let it size
             itself from padding and ended up 36px in a row of 40px controls. */
          inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary transition-shadow focus:border-blue-subtle focus:shadow-input-focus focus:outline-none"
        />
        {filtersBefore}
        {groups && groups.length > 0 && onClearAll && (
          <FilterMenu groups={groups} onClearAll={onClearAll} />
        )}
        {filtersAfter}
      </div>
      {hasDisplay && (
        <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-border-light pl-2.5">
          {sort && (
            <>
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                {sortLabel}
              </span>
              {sort}
            </>
          )}
          {display}
          {view}
        </div>
      )}
    </SearchPriority>
  );
}
