"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { PersonHoverCard } from "@/components/ui/PersonHoverCard";
import { HoverCard } from "@/components/ui/HoverCard";
import { EntityLink } from "@/components/ui/EntityLink";
import { teammateHref } from "@/lib/entityHref";

export type FanPerson = {
  name: string;
  role: string;
  /** What they're the contact FOR, e.g. an offering name. */
  context?: string;
  email?: string;
  phone?: string;
};

/**
 * A STACK OF FACES THAT FANS OPEN ON HOVER.
 *
 * Exactly the campaigns "Going to" mechanic (CampaignAudienceFan): the avatars
 * sit overlapped so a card stays compact, and hovering the group slides them
 * apart so every face is separately reachable — then hovering one face opens
 * the person card (Anir, Jul 28: "look at the campaigns page... when I hover
 * over it, it should do the animation thing where it separates the people").
 *
 * The spread is driven by animated `margin-left`, not a CSS gap, because the
 * collapsed state is a negative margin; animating the margin means the faces
 * physically slide out from under each other instead of the row snapping to a
 * new layout. Raising z-index in reverse on expand keeps the leftmost face on
 * top as it moves, which is what makes the motion read as a fan.
 */
export function PersonFan({
  people,
  avatarClassName = "h-6 w-6 text-[8px]",
  overlap = -5,
  /* FIVE FACES, THEN A COUNT (Anir, Aug 16: "if there's like 20 people in a
     group, how's this gonna look? Cap it at five and then say + however many
     more right after the last profile picture"). Eight faces already pushed
     the group chips wide enough to crowd the row. */
  max = 5,
  nested = false,
  ringClassName = "ring-[color:var(--white)]",
}: {
  people: FanPerson[];
  /** Avatar sizing, passed straight through (Avatar styles via className). */
  avatarClassName?: string;
  /** How far the faces sit under each other when collapsed, in px. */
  overlap?: number;
  max?: number;
  /** The fan sits inside an <a> or <button> (a group row that opens or
   *  expands): each face navigates from a span, never an anchor in a button. */
  nested?: boolean;
  /** The separator ring between overlapping faces, in the row's own
   *  background colour (a tinted row wants its tint, not a white halo). */
  ringClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const hidden = Math.max(people.length - visible.length, 0);
  // The white ring only separates overlapping faces; a lone face has none.
  const stacked = visible.length > 1 || hidden > 0;
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
      {visible.map((p, i) => (
        <span
          key={p.name}
          // The hovered face rises above its neighbours: the wrapper's own
          // z-index set the order, so the circle's ring slid under the next
          // face (Anir, Oct 1: "why is the blue circle being hid behind the
          // circles"). !important beats the inline order while hovered.
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out hover:!z-30 focus-within:!z-30"
          style={{
            marginLeft: i === 0 ? 0 : expanded ? 4 : overlap,
            zIndex: expanded ? visible.length - i : i + 1,
          }}
        >
          <PersonHoverCard
            name={p.name}
            role={p.role}
            context={p.context}
            email={p.email}
            phone={p.phone}
          >
            <span
              className={cn(
                "relative isolate inline-flex overflow-hidden rounded-full bg-[var(--surface)] outline-none transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-0.5 hover:scale-110 hover:ring-2 hover:ring-blue-primary/55",
                stacked && cn("ring-2", ringClassName)
              )}
            >
              {/* flex, never block: an initials face is inline, and inside
                  a block link it sat on a 24px line that made this box taller
                  than the circle, so the hover ring drew an oval above it
                  (Anir, Oct 1: "again with this shit you have to fix all the
                  circles"). */}
              <EntityLink href={teammateHref(p.name)} nested={nested} className="flex rounded-full" title={p.name}>
                <Avatar
                  name={p.name}
                  className={avatarClassName}
                />
              </EntityLink>
              </span>
              </PersonHoverCard>
        </span>
      ))}
      {hidden > 0 && (
        /* THE OVERFLOW NAMES ITSELF (Anir, Aug 9: "when I hover over +1, it has
           to say what it is, like a pop-up"). A bare +4 was the one mark in the
           row you could not ask a question of. */
        <HoverCard
          width={220}
          anchor="trigger"
          content={
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {hidden} more
              </p>
              <ul className="space-y-1.5">
                {people.slice(max).map((p) => (
                  <li key={p.name} className="flex items-center gap-2">
                    <EntityLink href={teammateHref(p.name)} className="shrink-0 rounded-full" title={p.name}>
                      <Avatar name={p.name} className="h-5 w-5 shrink-0 text-[7px]" />
                    </EntityLink>
                    <span className="min-w-0">
                      <EntityLink href={teammateHref(p.name)} className="block text-[12.5px] font-medium text-text-primary">
                        {p.name}
                      </EntityLink>
                      {p.role && (
                        <span className="block text-[11px] text-text-secondary">
                          {p.role}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          }
        >
          <span className="ml-1.5 cursor-pointer whitespace-nowrap text-[11px] font-medium text-text-tertiary transition-colors hover:text-blue-primary">
            +{hidden}
          </span>
        </HoverCard>
      )}
    </span>
  );
}
