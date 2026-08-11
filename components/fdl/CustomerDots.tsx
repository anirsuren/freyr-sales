"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";

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
}) {
  const [expanded, setExpanded] = useState(false);
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
            <span
              className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white transition-transform duration-150 hover:scale-110"
              style={{ width: size, height: size }}
            >
              <CompanyLogo name={person.name} className="h-[72%] w-[72%] object-contain" />
            </span>
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
            <span
              className="flex cursor-pointer items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-secondary ring-2 ring-white transition-transform duration-150 hover:scale-110 tnum"
              style={{ width: size, height: size }}
            >
              +{hidden}
            </span>
          </HoverCard>
        </span>
      )}
    </span>
  );
}
