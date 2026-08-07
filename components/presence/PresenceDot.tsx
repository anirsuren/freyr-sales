"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PRESENCE_META, presenceOf, type PresenceKey } from "@/lib/presence";

/**
 * A person's live presence, everywhere it is shown — the Settings member
 * directory and the Team roster read the same component so the two can never
 * disagree about who is online.
 *
 * Re-evaluates on a timer. Presence is the one label that goes stale by
 * standing still: without the tick, somebody who closed their laptop would
 * read "Online" for as long as the page stayed open.
 */
const TICK_MS = 30_000;

function usePresence(lastSeenAt: string | null | undefined): PresenceKey {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return presenceOf(lastSeenAt, now);
}

/** Just the dot — for tucking onto an avatar or in front of a name. */
export function PresenceDot({
  lastSeenAt,
  className,
}: {
  lastSeenAt: string | null | undefined;
  className?: string;
}) {
  const key = usePresence(lastSeenAt);
  const meta = PRESENCE_META[key];
  return (
    <span
      suppressHydrationWarning
      title={`${meta.label} — ${meta.title}`}
      aria-label={meta.label}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={
        meta.hollow
          ? { border: `1.5px solid ${meta.color}`, background: "transparent" }
          : { background: meta.color }
      }
    />
  );
}

/**
 * The full pill for a directory row. A SUSPENDED account says so instead of
 * reporting presence: whether that person happens to have a tab open is beside
 * the point when their access has been withdrawn.
 */
export function MemberPresence({
  active,
  lastSeenAt,
  className,
}: {
  active: boolean;
  lastSeenAt: string | null | undefined;
  className?: string;
}) {
  const key = usePresence(lastSeenAt);
  const meta = PRESENCE_META[key];
  if (!active) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-md bg-error/10 px-2 py-1 text-[10.5px] font-semibold text-error",
          className
        )}
        title="This account cannot sign in"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-error" />
        Suspended
      </span>
    );
  }
  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-semibold",
        className
      )}
      style={{ background: `${meta.color}1A`, color: meta.color }}
      title={meta.title}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={
          meta.hollow
            ? { border: `1.5px solid ${meta.color}` }
            : { background: meta.color }
        }
      />
      {meta.label}
    </span>
  );
}
