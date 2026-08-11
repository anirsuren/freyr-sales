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
          className="menu-in absolute right-0 top-full z-50 mt-2 w-[272px] rounded-xl border border-border-light bg-white p-3.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
        >
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            Live data · twice a day
          </p>

          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,113,227,0.08)] text-[color:#0071E3]">
              <History size={15} strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-text-tertiary">
                Last refresh
              </span>
              <span className="block text-[13px] font-semibold text-text-primary tnum">
                {dayClock(last, now)}
              </span>
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(109,40,217,0.08)] text-[color:#6D28D9]">
              {due ? (
                <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <CalendarClock size={15} strokeWidth={2.2} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-text-tertiary">
                Next refresh
              </span>
              <span className="block text-[13px] font-semibold text-text-primary tnum">
                {due ? "Running now — new items land shortly" : `~${clock(next)}`}
              </span>
            </span>
          </div>

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(0,113,227,0.12)]">
              <div
                className="h-full rounded-full bg-[#0071E3] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] font-medium text-text-tertiary tnum">
              <span>{clock(last)}</span>
              <span>{due ? "due" : clock(next)}</span>
            </div>
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
