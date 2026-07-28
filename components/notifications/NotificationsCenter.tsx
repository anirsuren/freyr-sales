"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
} from "@/lib/notifications";

const EMPTY_READ_SET = new Set<string>();

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
    <div className="max-w-[760px]">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex gap-2">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors capitalize",
                filter === f
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              {f}
              {f === "unread" ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
        <button
          onClick={markAll}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-primary hover:underline disabled:text-text-tertiary disabled:no-underline"
        >
          <Check size={15} strokeWidth={2} />
          Mark all read
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === "unread" ? "You're all caught up" : "No notifications"}
          description="Alerts about pitches awaiting review, cooling deals, and new buying signals will appear here."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.urgency}>
              <NotificationGroupHeading
                label={group.label}
                count={group.items.length}
                urgency={group.urgency}
                className="mb-2"
              />
              <Card className="p-0 overflow-hidden">
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
                          className="block px-4 py-3.5 hover:bg-surface transition-colors"
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
