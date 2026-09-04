"use client";

import { useEffect, useState } from "react";
import { History, ShieldCheck, UserCog, KeyRound, LogIn } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

/**
 * WHAT HAS BEEN DONE TO ONE PERSON'S ACCESS, NEWEST FIRST.
 *
 * Anir, Sep 4, on a member's panel: "I want to see all their past history, like
 * who assigned what role to them, if they changed any role, etc."
 *
 * Until this the app kept nothing: a change fired an email and the before-state
 * was discarded, so "who gave Abhinaya BD Member, and when" could only be
 * answered by searching an inbox. Every role, privilege and access change is
 * recorded now — see lib/accessHistory.
 */

type Event = {
  id: string;
  at: string;
  actor: string;
  subject: string;
  kind: "role" | "privileges" | "active" | "joined";
  detail: string;
};

const MARK: Record<Event["kind"], { icon: typeof History; color: string; word: string }> = {
  role: { icon: UserCog, color: "var(--cat-blue)", word: "Role" },
  privileges: { icon: KeyRound, color: "var(--ink-violet-soft)", word: "Privileges" },
  active: { icon: ShieldCheck, color: "var(--ink-amber)", word: "Access" },
  joined: { icon: LogIn, color: "var(--cat-teal)", word: "Joined" },
};

export function AccessHistory({
  subject,
  className,
}: {
  subject: string;
  className?: string;
}) {
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    let alive = true;
    setEvents(null);
    fetch(`/api/access-history?subject=${encodeURIComponent(subject)}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => alive && setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [subject]);

  return (
    <div className={cn("mt-6", className)}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        <History size={12} strokeWidth={2.2} />
        History
      </p>

      {events === null ? (
        <p className="mt-2 text-[12.5px] text-text-tertiary">Loading…</p>
      ) : events.length === 0 ? (
        /* AN EMPTY TRAIL IS NOT AN ERROR, and it must not read as one. Nothing
           was recorded before Sep 4, so most people will sit here for a while
           and the reason has to be on screen rather than looking like a gap. */
        <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">
          Nothing recorded yet. Every role, privilege and access change from now
          on is logged here with who made it.
        </p>
      ) : (
        <ol className="mt-2.5 space-y-0">
          {events.map((e, i) => {
            const mark = MARK[e.kind] ?? MARK.privileges;
            const Icon = mark.icon;
            return (
              <li key={e.id} className="flex gap-2.5">
                {/* The rail runs BETWEEN the marks, not through the last one,
                    so the list ends rather than trailing off. */}
                <span className="flex flex-col items-center">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${mark.color} 12%, transparent)`,
                      color: mark.color,
                    }}
                  >
                    <Icon size={12} strokeWidth={2.2} />
                  </span>
                  {i < events.length - 1 && (
                    <span className="w-px flex-1 bg-border-light" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1 pb-4">
                  <span className="block text-[12.5px] text-text-primary">
                    <b className="font-semibold">{e.actor}</b>{" "}
                    {e.kind === "role"
                      ? "changed their role"
                      : e.kind === "privileges"
                        ? "changed their privileges"
                        : e.kind === "active"
                          ? "changed their access"
                          : "added them"}
                    {e.detail ? ` — ${e.detail}` : ""}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-text-tertiary">
                    {formatDate(e.at)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
