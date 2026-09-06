"use client";

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
        <span className="shrink-0 tnum">{Math.round(percent)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-light">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-150",
            status === "failed" ? "bg-[color:var(--status-red)]" : "bg-blue-primary"
          )}
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
