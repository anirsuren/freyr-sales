"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * THE BAR THAT SAYS AN UPLOAD IS ALIVE.
 *
 * Anir, Sep 6: "I need the same UI when I'm uploading something, like the
 * progress bar. You do it somewhere else. Whenever I'm uploading something,
 * do that."
 *
 * Sales materials has had one since Aug 15, for the reason he gave then: a
 * bare "Uploading…" on a big file is indistinguishable from a frozen form.
 * Every other upload in the app was still showing exactly that word. This is
 * the materials bar, lifted out so there is one of it, and `uploadWithProgress`
 * is the transport that feeds it.
 *
 * Deliberately tiny and label-first: the percentage is the point, the bar is
 * the reassurance.
 */
export function UploadProgress({
  percent,
  status = "uploading",
  name,
  className,
}: {
  percent: number;
  status?: "uploading" | "done" | "failed";
  /** The filename, when the caller has room to show which file this is. */
  name?: string;
  className?: string;
}) {
  /**
   * THE NUMBER COUNTS, IT DOES NOT JUMP (Anir, Sep 6: "make the UI a little
   * bit better so it goes from 0 to 80 smoothly, like 1, 2, 3, 4, 5, 6. At
   * 80, obviously, it'll do the buffering thing").
   *
   * XHR reports progress in bursts — a small file goes 0 → 99 in one event —
   * so the raw number teleported. What is drawn is a display value that
   * climbs one point per tick toward the real one: quickly below 80, and at
   * a crawl above it, which reads as the buffering he described while the
   * server does its half. It never runs AHEAD of the truth past 80, and a
   * finished upload snaps to done.
   */
  const [shown, setShown] = useState(0);
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  useEffect(() => {
    if (status !== "uploading") {
      setShown(target);
      return;
    }
    if (shown >= target && shown < 80) return;
    const cap = Math.max(target, Math.min(99, shown + 1));
    const next = Math.min(shown + 1, shown < target ? target : cap);
    if (next === shown) return;
    const wait = next <= 80 ? 18 : 260;
    const t = setTimeout(() => setShown(next), wait);
    return () => clearTimeout(t);
  }, [shown, target, status]);
  const drawn = status === "uploading" ? shown : target;

  const label =
    status === "failed"
      ? "Upload failed"
      : status === "done"
        ? "Uploaded"
        : "Uploading";

  return (
    <div className={cn("w-full", className)} aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold text-text-secondary">
        <span className={cn("min-w-0 truncate", status === "failed" && "text-[color:var(--status-red)]")}>
          {name ? `${label} ${name}` : label}
        </span>
        <span className="shrink-0 tnum">{drawn}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-light">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-150",
            status === "failed" ? "bg-[color:var(--status-red)]" : "bg-blue-primary"
          )}
          style={{ width: `${Math.max(2, Math.min(100, drawn))}%` }}
        />
      </div>
    </div>
  );
}
