"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  History,
  Loader2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The live-data chip (Anir, Aug 11): at rest it only says when the feed last
 * refreshed; clicking it opens a card with the next run, how far along the
 * cycle is, and the shared-by-everyone note. Times render in the viewer's own
 * timezone — the server runs on UTC in production.
 */
const REFRESH_EVERY_MS = 11 * 60 * 60 * 1000;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayClock(ms: number, now: number): string {
  const d = new Date(ms);
  if (d.toDateString() === new Date(now).toDateString()) return clock(ms);
  if (d.toDateString() === new Date(now - 86_400_000).toDateString())
    return `yesterday, ${clock(ms)}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clock(ms)}`;
}

export function RefreshChip({ updatedAt }: { updatedAt: string | null }) {
  // Stamped after mount so the server and browser never disagree on the time.
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const last = updatedAt ? Date.parse(updatedAt) : NaN;
  const ready = now !== null && !Number.isNaN(last);

  if (!ready) {
    return (
      <span className="flex h-[34px] items-center gap-2 rounded-full border border-border-light bg-white px-3 text-[12px] font-medium text-text-secondary">
        <span className="inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
        Live data
      </span>
    );
  }

  const next = last + REFRESH_EVERY_MS;
  const due = next <= now;
  const pct = Math.min(100, Math.round(((now - last) / REFRESH_EVERY_MS) * 100));

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-border-light bg-white px-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1A7A35] opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
        </span>
        Updated {dayClock(last, now)}
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          className={cn(
            "text-text-tertiary transition-transform",
            open && "rotate-180 text-blue-primary"
          )}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Refresh schedule"
          className="menu-in absolute right-0 top-full z-50 mt-2 w-[324px] rounded-xl border border-border-light bg-white p-3.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
        >
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            Live data · twice a day
          </p>

          {/* One horizontal timeline: refreshed on the left, next run on the
              right, and a marker for where in the cycle we are now. */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-[11px] font-medium text-[color:#0071E3]">
                <History size={12} strokeWidth={2.2} /> Refreshed
              </span>
              <span className="mt-0.5 block text-[14px] font-bold text-text-primary tnum">
                {dayClock(last, now)}
              </span>
            </span>
            <span className="min-w-0 text-right">
              <span className="flex items-center justify-end gap-1 text-[11px] font-medium text-[color:#6D28D9]">
                {due ? (
                  <Loader2 size={12} strokeWidth={2.2} className="animate-spin" />
                ) : (
                  <CalendarClock size={12} strokeWidth={2.2} />
                )}{" "}
                Next refresh
              </span>
              <span className="mt-0.5 block text-[14px] font-bold text-text-primary tnum">
                {due ? "running now" : `~${clock(next)}`}
              </span>
            </span>
          </div>

          <div className="relative mt-2.5 h-3.5">
            <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-[rgba(0,113,227,0.12)]">
              <div
                className="h-full rounded-full bg-[#0071E3]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#0071E3]" />
            <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-[#6D28D9] bg-white" />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#0071E3] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="relative mt-1 h-4">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] font-bold text-blue-primary tnum"
              style={{ left: `${Math.min(85, Math.max(15, pct))}%` }}
            >
              {due ? "refresh due" : `you're here · ${clock(now)}`}
            </span>
          </div>

          <p className="mt-2.5 flex items-start gap-1.5 border-t border-border-light pt-2.5 text-[11px] leading-snug text-text-secondary">
            <Users
              size={12}
              strokeWidth={2.2}
              className="mt-0.5 shrink-0 text-blue-primary"
            />
            Everyone sees the same live feed.
          </p>
        </div>
      )}
    </div>
  );
}
