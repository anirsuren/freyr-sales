"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Search } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { Modal } from "@/components/ui/Modal";

/**
 * THE OVERLAPPING-LOGOS FAN, exactly the campaigns "Going to" mechanic: marks
 * sit overlapped so a row stays compact, hovering the group slides them apart
 * instantly, and each logo's own card waits a quarter second (Anir, Aug 9).
 * Extracted from FdlComponentDetail so the version timeline can wear the same
 * fan (Anir, Aug 10: "I would like to have the same effect here where, when I
 * hover over the company, it'll do the thing").
 */
export function CustomerDots({
  people,
  max = 6,
  note,
  size = 28,
  reserveOpenWidth = true,
  modalTitle,
}: {
  people: { id: string; name: string }[];
  max?: number;
  note?: (person: { id: string; name: string }) => string | undefined;
  /** Mark diameter in px. The version row runs bigger than a table cell. */
  size?: number;
  /** Table cells hold their open width so columns never move (Anir, Aug 9).
   *  An absolutely-positioned caller that centres itself wants the opposite:
   *  no reservation, symmetric growth around its anchor. */
  reserveOpenWidth?: boolean;
  /** Gives the full-list dialog its specific context, e.g. a version or
   *  feature name. */
  modalTitle?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [query, setQuery] = useState("");
  // THE FAN IS INSTANT, THE CARD IS NOT (Anir, Aug 9: "you can make this
  // instant... but when I hover over the logo you can make that 0.25-second
  // delay"). Separating the marks is layout, and layout should answer the
  // cursor immediately; opening a card over the page is a commitment, so each
  // logo's own card waits a quarter second. Reserving the open width means the
  // instant spread still moves nothing around it.
  const openSoon = () => setExpanded(true);
  const closeNow = () => setExpanded(false);
  if (people.length === 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] text-text-secondary">
        <Building2 size={11} strokeWidth={2} className="text-text-tertiary" />
        Nobody yet
      </span>
    );
  const visible = people.slice(0, max);
  const hidden = people.length - visible.length;
  const matchingPeople = people
    .filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  // THE ROW RESERVES ITS OPEN WIDTH EVEN WHEN CLOSED (Anir, Aug 9: "I don't
  // like how the table column moves with it"). Fanning changes each mark's
  // margin from -8px to +4px, so an expanding group grew ~12px per logo and
  // shoved the whole column sideways while you were reading it. Holding the
  // open width at rest costs a little empty space and buys a table that never
  // moves under the cursor.
  const marks = visible.length + (hidden > 0 ? 1 : 0);
  const openWidth = marks > 0 ? size + (marks - 1) * (size + 4) : 0;
  return (
    <span
      className="inline-flex items-center rounded-lg px-1 py-0.5 transition-colors duration-200 hover:bg-surface focus-within:bg-surface"
      style={reserveOpenWidth ? { minWidth: openWidth + 8 } : undefined}
      onMouseEnter={openSoon}
      onMouseLeave={closeNow}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          closeNow();
      }}
    >
      {visible.map((person, i) => (
        <span
          key={person.id}
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : expanded ? 4 : -8,
            zIndex: expanded ? visible.length - i : i + 1,
          }}
        >
          <HoverCard
            width={230}
            anchor="trigger"
            delayMs={0}
            content={
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-light bg-white">
                  <CompanyLogo name={person.name} className="h-6 w-6 object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">
                    {person.name}
                  </span>
                  {note?.(person) && (
                    <span className="block text-[11.5px] text-text-secondary">
                      {note(person)}
                    </span>
                  )}
                </span>
              </div>
            }
          >
            <Link
              href={`/customers/${person.id}?tab=components`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Open ${person.name}`}
              className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-primary"
              style={{ width: size, height: size }}
            >
              <CompanyLogo name={person.name} className="h-[72%] w-[72%] object-contain" />
            </Link>
          </HoverCard>
        </span>
      ))}
      {hidden > 0 && (
        /* THE OVERFLOW CHIP ANSWERS A QUESTION TOO (Anir, Aug 9: "when I hover
           over +1, it has to say what it is, like a pop-up, and also the + is
           getting covered"). Last in DOM order meant lowest z-index, so the
           circle to its left painted over the plus sign. */
        <span
          className="relative inline-flex transition-[margin] duration-200 ease-out"
          style={{ marginLeft: expanded ? 4 : -8, zIndex: visible.length + 1 }}
        >
          <HoverCard
            width={230}
            anchor="trigger"
            delayMs={0}
            suspended={allOpen}
            content={
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {hidden} more
                </p>
                <ul className="space-y-1.5">
                  {people.slice(max).map((person) => (
                    <li key={person.id} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-light bg-white">
                        <CompanyLogo
                          name={person.name}
                          className="h-3.5 w-3.5 object-contain"
                        />
                      </span>
                      <span className="min-w-0 text-[12.5px] text-text-primary">
                        {person.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            }
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setQuery("");
                setAllOpen(true);
              }}
              aria-label={`Open all ${people.length} companies`}
              className="flex cursor-pointer items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-secondary ring-2 ring-white transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-primary tnum"
              style={{ width: size, height: size }}
            >
              +{hidden}
            </button>
          </HoverCard>
        </span>
      )}
      <Modal
        open={allOpen}
        onClose={() => setAllOpen(false)}
        title={modalTitle || "Companies"}
        titleAfter={
          <span className="rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-bold text-blue-primary tnum">
            {people.length}
          </span>
        }
        size="wide"
        tall
        bodyClassName="flex flex-col !p-0"
      >
        <div className="shrink-0 border-b border-border-light p-4">
          <label className="relative block">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies..."
              aria-label="Search companies"
              autoFocus
              className="h-10 w-full rounded-xl border border-border-light bg-surface pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:bg-white"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {matchingPeople.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {matchingPeople.map((person) => {
                const detail = note?.(person);
                return (
                  <li key={person.id}>
                    <Link
                      href={`/customers/${person.id}?tab=components`}
                      onClick={(event) => event.stopPropagation()}
                      className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-border-light bg-white px-3 py-2.5 transition-[border-color,background-color,box-shadow] hover:border-blue-subtle hover:bg-blue-light/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary"
                    >
                      <CompanyLogo
                        name={person.name}
                        className="h-10 w-10 shrink-0 object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary group-hover:text-blue-primary">
                          {person.name}
                        </span>
                        {detail && (
                          <span className="mt-0.5 block truncate text-[11.5px] text-text-secondary">
                            {detail}
                          </span>
                        )}
                      </span>
                      <ArrowUpRight
                        size={15}
                        strokeWidth={2}
                        className="shrink-0 text-text-tertiary transition-colors group-hover:text-blue-primary"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex min-h-52 items-center justify-center text-center">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">No companies found</p>
                <p className="mt-1 text-[12px] text-text-secondary">
                  Try another company name.
                </p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </span>
  );
}
