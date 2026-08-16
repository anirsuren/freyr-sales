"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonHoverCard } from "@/components/ui/PersonHoverCard";
import { HoverCard } from "@/components/ui/HoverCard";

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
}: {
  people: FanPerson[];
  /** Avatar sizing, passed straight through (Avatar styles via className). */
  avatarClassName?: string;
  /** How far the faces sit under each other when collapsed, in px. */
  overlap?: number;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const hidden = Math.max(people.length - visible.length, 0);
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
      {visible.map((p, i) => (
        <span
          key={p.name}
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out"
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
              className="relative isolate inline-flex overflow-hidden rounded-full bg-[var(--surface)] outline-none ring-2 ring-[color:var(--white)] transition-[transform,filter] duration-150 hover:z-20 hover:-translate-y-0.5 hover:scale-110 hover:drop-shadow-md"
            >
              <Avatar
                name={p.name}
                className={avatarClassName}
              />
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
                    <Avatar name={p.name} className="h-5 w-5 shrink-0 text-[7px]" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-text-primary">
                        {p.name}
                      </span>
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
