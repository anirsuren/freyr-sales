"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  BellDot,
  BellOff,
  CalendarDays,
  Check,
  Clock3,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageTabs } from "@/components/ui/PageTabs";
import { StatTile } from "@/components/ui/StatTile";
import {
  NotificationGroupHeading,
  NotificationRow,
} from "@/components/notifications/NotificationRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";
import {
  groupByUrgency,
  NOTIF_READ_KEY as READ_KEY,
  type AppNotification,
  type NotificationUrgency,
} from "@/lib/notifications";

const EMPTY_READ_SET = new Set<string>();

/** The four whens, as tiles. Same order and same words as the group headings
 *  below, so the count you read at the top names the section you scroll to.
 *  Overdue borrows the caution burnt-orange, never amber. */
const URGENCY_TILES: {
  urgency: NotificationUrgency;
  label: string;
  icon: LucideIcon;
  color: string;
  sub: string;
  empty: string;
}[] = [
  {
    urgency: "overdue",
    label: "Overdue",
    icon: AlarmClock,
    color: "#C2410C",
    sub: "past their date",
    empty: "nothing late",
  },
  {
    urgency: "today",
    label: "Today",
    icon: Clock3,
    color: "#0071E3",
    sub: "due today",
    empty: "nothing due today",
  },
  {
    urgency: "week",
    label: "This week",
    icon: CalendarDays,
    color: "#7C3AED",
    sub: "in the next few days",
    empty: "clear this week",
  },
  {
    urgency: "later",
    label: "Later",
    icon: Inbox,
    color: "#0F766E",
    sub: "no date pressing",
    empty: "nothing queued",
  },
];

function readSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function NotificationsCenter({ items }: { items: AppNotification[] }) {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const readStorageKey = userScopedStorageKey(READ_KEY, currentUser.id);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    setLoadedStorageKey(null);
    setRead(readSet(readStorageKey));
    setFilter("all");
    setLoadedStorageKey(readStorageKey);
  }, [readStorageKey]);

  // The write is a plain background side effect, deliberately OUTSIDE the state
  // updater: an updater is called during render, so a localStorage write in
  // there is a render-phase side effect React is free to re-run or interleave
  // with a navigation it has already started.
  const persist = useCallback(
    (ids: string[]) => {
      if (loadedStorageKey !== readStorageKey) return;
      try {
        const current = readSet(readStorageKey);
        ids.forEach((id) => current.add(id));
        localStorage.setItem(
          readStorageKey,
          JSON.stringify(Array.from(current))
        );
      } catch {}
    },
    [loadedStorageKey, readStorageKey]
  );

  function markOne(id: string) {
    if (loadedStorageKey !== readStorageKey) return;
    // Optimistic: the dot clears on the spot and the write happens after. A
    // click must never wait on anything before it moves you.
    setRead((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    persist([id]);
  }

  function markAll() {
    if (loadedStorageKey !== readStorageKey) return;
    setRead(new Set(items.map((i) => i.id)));
    persist(items.map((i) => i.id));
  }

  const visibleRead =
    loadedStorageKey === readStorageKey ? read : EMPTY_READ_SET;
  const unreadCount = useMemo(
    () => items.filter((i) => !visibleRead.has(i.id)).length,
    [items, visibleRead]
  );
  const shown = useMemo(
    () =>
      filter === "unread"
        ? items.filter((i) => !visibleRead.has(i.id))
        : items,
    [filter, items, visibleRead]
  );
  const groups = useMemo(() => groupByUrgency(shown), [shown]);
  /** Tile counts read the WHOLE list, not the filtered one: they say what is
   *  waiting on you, which does not change because you flipped to Unread. */
  const counts = useMemo(() => {
    const out: Record<NotificationUrgency, number> = {
      overdue: 0,
      today: 0,
      week: 0,
      later: 0,
    };
    for (const n of items) out[n.urgency || "later"] += 1;
    return out;
  }, [items]);

  // Warm every destination up front. Nothing here is awaited on click — the
  // whole point is that the page is already on its way before you press it.
  useEffect(() => {
    for (const n of items.slice(0, 12)) {
      try {
        router.prefetch(n.href);
      } catch {}
    }
  }, [items, router]);

  return (
    <div>
      {/* WHAT IS WAITING, BEFORE YOU READ A SINGLE ROW (Anir, Aug 15: "this
          doesn't even look good... I don't know what this is"). The old page
          opened on two bordered boxes and a bare text link over an empty
          column, and said nothing until you had read every row. Four counts
          by when they are due answer it at a glance, in the app's own tiles. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {URGENCY_TILES.map((t) => {
          const n = counts[t.urgency];
          return (
            <StatTile
              key={t.urgency}
              icon={t.icon}
              label={t.label}
              value={String(n)}
              color={n > 0 ? t.color : undefined}
              sub={n > 0 ? t.sub : t.empty}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* The same segmented selector as Performance, Market Intel and Admin,
            instead of two bordered boxes from an older era of this app. */}
        <PageTabs
          tabs={[
            { key: "all", label: `All (${items.length})`, icon: Inbox, color: "#0071E3" },
            {
              key: "unread",
              label: `Unread (${unreadCount})`,
              icon: BellDot,
              color: "#C2410C",
            },
          ]}
          active={filter}
          onSelect={(k) => setFilter(k as "all" | "unread")}
        />
        <button
          onClick={markAll}
          disabled={unreadCount === 0}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:cursor-default disabled:opacity-45 disabled:hover:border-border-light disabled:hover:text-text-secondary"
        >
          <Check size={14} strokeWidth={2.2} />
          Mark all read
        </button>
      </div>

      {shown.length === 0 ? (
        // Inside a card, not floating in the middle of an empty page.
        <Card className="mt-4 px-6 py-12">
          <EmptyState
            icon={BellOff}
            title={
              filter === "unread"
                ? "Nothing unread"
                : "Nothing is waiting on you"
            }
            description={
              filter === "unread"
                ? "You have read everything here. Switch to All to look back over it."
                : "Pitches waiting on your approval, deals going quiet, follow-ups you promised and fresh buying signals all land here."
            }
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <section key={group.urgency}>
              <NotificationGroupHeading
                label={group.label}
                count={group.items.length}
                urgency={group.urgency}
                className="mb-2"
              />
              <Card className="overflow-hidden p-0">
                <ul>
                  {group.items.map((n) => {
                    const isRead = visibleRead.has(n.id);
                    return (
                      <li
                        key={n.id}
                        className="border-b border-border-light last:border-0"
                      >
                        <Link
                          href={n.href}
                          prefetch
                          onPointerEnter={() => {
                            try {
                              router.prefetch(n.href);
                            } catch {}
                          }}
                          onClick={() => markOne(n.id)}
                          className={cn(
                            "block px-4 py-3.5 transition-colors hover:bg-surface",
                            // Unread carries a coloured left rule, so a full
                            // list still shows you where to start.
                            !isRead && "border-l-[3px] border-l-blue-primary"
                          )}
                        >
                          <NotificationRow notification={n} unread={!isRead} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
