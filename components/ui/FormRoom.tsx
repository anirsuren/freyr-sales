"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/InfoHint";

/**
 * Shared: the opportunity form's rooms, now the contract form's too
 * (Anir, Aug 28: "make it like the other one where you have 4 sections").
 *
 * ONE ROOM PER IDEA IN THE DEAL FORM (Anir, Aug 20, stuck in it: "There's no
 * separation. There's only a separation on what's being sold. That's it.
 * Everything under what's being sold, I'm really confused. I don't know what
 * to do, especially the goals section, the revenue section, and the activity
 * section").
 *
 * "What's being sold" already had a bounded room and read fine; everything
 * after it was a flat run of controls with nothing saying where one idea
 * ended and the next began. This is that same room, so the form is four
 * bounded things instead of one bounded thing and a pile.
 */
export function FormRoom({
  icon: Icon,
  title,
  hint,
  defaultOpen = false,
  summary,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Only the first room opens (Anir, Aug 20: "the first one that should only
   *  be open, and the other ones are closed"). Same rule the offering tab's
   *  six sections follow, for the same reason: a long scroll of open panels
   *  hides where to start. */
  defaultOpen?: boolean;
  /**
   * What the room holds, shown ONLY while it is shut. A closed panel that
   * says nothing makes you open all three to find out whether anything is in
   * them, which is the scroll the dropdowns were meant to end.
   */
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[rgba(0,113,227,0.16)] bg-[rgba(0,113,227,0.03)] px-3.5 py-3">
      {/* THE HINT SITS BESIDE THE TOGGLE, NOT INSIDE IT. A question mark is a
          <button>, the room header is a <button>, and a button inside a button
          is invalid HTML — React refuses to hydrate it and the whole form
          falls back to client rendering. Found the moment it shipped. */}
      <div className="flex w-full items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
          <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="shrink-0 text-[12.5px] font-bold text-text-primary">
          {title}
        </span>
        <span className="h-px min-w-4 flex-1 bg-[rgba(0,113,227,0.14)]" aria-hidden />
        {!open && summary && (
          <span className="shrink-0 truncate text-[11.5px] font-semibold text-text-secondary">
            {summary}
          </span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-blue-primary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
        {/* THE ROOM'S EXPLANATION, one hover away instead of a paragraph
            printed inside it (Anir, Sep 4: "so much fucking text, bro. If it
            can be put in a question mark, put it in a question mark"). */}
        {hint && <InfoHint text={hint} className="shrink-0" />}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
