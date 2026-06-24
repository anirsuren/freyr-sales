"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Flame,
  Sparkles,
  CalendarClock,
  BellOff,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import {
  NOTIF_READ_KEY as READ_KEY,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";

const ICON: Record<NotificationType, typeof Flame> = {
  review: ClipboardCheck,
  rotting: Flame,
  signal: Sparkles,
  followup: CalendarClock,
};
const TONE: Record<NotificationType, string> = {
  review: "bg-blue-light text-blue-primary",
  rotting: "bg-error/12 text-error",
  signal: "bg-success/15 text-success",
  followup: "bg-blue-light text-blue-primary",
};

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function NotificationsCenter({ items }: { items: AppNotification[] }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    setRead(readSet());
  }, []);

  function persist(next: Set<string>) {
    setRead(new Set(next));
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(Array.from(next)));
    } catch {}
  }
  function markOne(id: string) {
    const next = new Set(read);
    next.add(id);
    persist(next);
  }
  function markAll() {
    persist(new Set(items.map((i) => i.id)));
  }

  const unreadCount = useMemo(
    () => items.filter((i) => !read.has(i.id)).length,
    [items, read]
  );
  const shown = filter === "unread" ? items.filter((i) => !read.has(i.id)) : items;

  return (
    <div className="max-w-[760px]">
      <div className="flex items-center justify-between gap-3 mb-4">
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
        <div className="space-y-2.5">
          {shown.map((n) => {
            const Icon = ICON[n.type];
            const isRead = read.has(n.id);
            return (
              <Link key={n.id} href={n.href} onClick={() => markOne(n.id)}>
                <Card
                  className={cn(
                    "p-4 hover:border-blue-subtle transition-colors flex items-start gap-3",
                    !isRead && "border-l-[3px] border-l-blue-primary"
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      TONE[n.type]
                    )}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[14px] text-text-primary",
                        !isRead ? "font-semibold" : "font-medium"
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="text-[13px] text-text-secondary leading-snug">
                      {n.body}
                    </p>
                  </div>
                  {!isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-primary shrink-0 mt-1.5" />
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
