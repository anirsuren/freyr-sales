"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
  status?: "uploading" | "storing" | "done" | "failed";
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
  const drawn = useCountingPercent(percent, status);

  const label =
    status === "failed"
      ? "Upload failed"
      : status === "done"
        ? "Uploaded"
        : status === "storing"
          ? "Storing"
          : "Uploading";

  /* A FINISHED UPLOAD SAYS SO WITH A CHECK, NOT A FULL GREY BAR (Anir, Sep 7:
     "there should definitely be a check mark when it's done. It's kind of hard
     to see, and it's very unclear"). Done is green with a check and no bar to
     read; failed is red with a mark; only an upload in flight draws the bar. */
  return (
    <div className={cn("w-full", className)} aria-live="polite">
      <div
        className={cn(
          "flex items-center justify-between gap-2 text-[10.5px] font-semibold",
          status === "done"
            ? "text-[color:#15803D]"
            : status === "failed"
              ? "text-[color:var(--status-red)]"
              : "text-text-secondary"
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          {status === "done" ? (
            <CheckCircle2 size={12} strokeWidth={2.6} className="shrink-0" />
          ) : status === "failed" ? (
            <AlertCircle size={12} strokeWidth={2.4} className="shrink-0" />
          ) : (
            <Loader2 size={12} strokeWidth={2.4} className="shrink-0 animate-spin" />
          )}
          <span className="truncate">{name ? `${label} ${name}` : label}</span>
        </span>
        {status === "uploading" && <span className="shrink-0 tnum">{drawn}%</span>}
      </div>
      {status === "uploading" && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-light">
          <div
            className="h-full rounded-full bg-blue-primary transition-[width] duration-150"
            style={{ width: `${Math.max(2, Math.min(100, drawn))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * THE NUMBER THAT COUNTS. Shared by every place an upload is drawn, so the
 * sales-materials card and the shared bar can never disagree about how a
 * percentage moves (Anir, Sep 7: "it's supposed to go from 0 to 80 smoothly,
 * right? Why is it stuck at 0?" — the card was drawing the raw number the
 * transport reports, which sits at 0 until the first progress event).
 *
 * Climbs one point per tick toward the real figure: quickly below 80, at a
 * crawl above it while the server does its half, never ahead of the truth
 * below 80, and snaps to 100 the moment the upload is done. "waiting" is
 * drawn as an upload that has not moved yet, so the count starts the instant
 * a file is picked rather than when the first byte is acknowledged.
 */
export function useCountingPercent(
  percent: number,
  status: "waiting" | "uploading" | "storing" | "done" | "failed"
): number {
  /* THE NUMBER IS THE BYTES. NOTHING ELSE.

     Anir, Sep 9, watching a 496MB video go up: "it goes to 80% so quickly,
     and it's actually really misleading... have the percentages be real."
     And then: "It was stuck at 99% for like 5 minutes."

     It was not real. The previous version climbed 0 to 80 on a 1.5 second
     CLOCK and then crept one point every 260ms to 99, whatever the network
     was doing — a fix for a tab whose timers were being throttled (Sep 7)
     that turned the pill into an animation. So a big file read 99% for the
     whole five minutes its bytes were actually still leaving the machine,
     and the person watching had no way to tell "nearly there" from "barely
     started". Now the pill shows the browser's own count of bytes sent, on
     every progress event, and the only smoothing is that it never steps
     backwards inside one upload. When every byte has gone the status flips
     to "storing", which is the honest name for the wait that follows. */
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  const highRef = useRef(0);
  const live = status === "uploading" || status === "waiting";
  useEffect(() => {
    if (!live) highRef.current = 0;
  }, [live]);
  if (status === "done" || status === "storing") return 100;
  if (!live) return target;
  if (target > highRef.current) highRef.current = target;
  return highRef.current;
}


/**
 * THE FIGURE MOVES EVERY QUARTER SECOND, AND IT IS STILL THE BYTES.
 *
 * Anir, Sep 9: "If there's any mechanism you can have where, every second,
 * you update it." Chrome reports upload progress only when it flushes a
 * buffer to the socket, which on a big file is every few megabytes — measured
 * on a 60MB upload: 0%, 17%, 60%, then done. Real, but it looks stuck between
 * events, which is what "stuck at 99%" looked like from his chair.
 *
 * Between two real events this advances the display at the speed the browser
 * ACTUALLY measured between the previous two events (at 80% of it, so it
 * rarely overshoots), never past 99%, and never backwards; each real event
 * snaps it to the truth. Nothing here is on a fixed clock: no events, no
 * measured speed, no movement. Storing and done pin it at the full size.
 */
function useSmoothedBytes(
  progress:
    | { percent: number; status: "waiting" | "uploading" | "storing" | "done" | "failed"; loaded?: number; total?: number }
    | null
    | undefined
): { loaded: number | null; percent: number } {
  const status = progress?.status ?? "waiting";
  const total = progress?.total ?? 0;
  const real = progress?.loaded;
  const last = useRef<{ loaded: number; at: number } | null>(null);
  const prev = useRef<{ loaded: number; at: number } | null>(null);
  const display = useRef(0);
  const [, tick] = useState(0);

  // A new real reading: remember the previous one (for the speed) and snap up.
  if (real !== undefined && real !== last.current?.loaded) {
    prev.current = last.current;
    last.current = { loaded: real, at: Date.now() };
    if (real > display.current) display.current = real;
  }
  useEffect(() => {
    if (status !== "uploading") return;
    const id = setInterval(() => {
      const l = last.current;
      const q = prev.current;
      if (l && q && l.at > q.at && l.loaded > q.loaded && total > 0) {
        const bytesPerMs = (l.loaded - q.loaded) / (l.at - q.at);
        const projected = l.loaded + bytesPerMs * 0.8 * (Date.now() - l.at);
        const capped = Math.min(projected, total * 0.99);
        if (capped > display.current) display.current = capped;
      }
      tick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [status, total]);
  useEffect(() => {
    if (status === "waiting" || status === "failed") {
      last.current = null;
      prev.current = null;
      display.current = 0;
    }
  }, [status]);

  if (status === "storing" || status === "done")
    return { loaded: total || null, percent: 100 };
  if (!total) return { loaded: null, percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))) };
  const loaded = Math.min(total, display.current);
  return { loaded, percent: Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) };
}

/**
 * THE STATE OF ONE FILE, ON ITS OWN LINE. The filename and size, then a pill
 * that says where the upload stands, then a thin bar underneath only while
 * there is something to measure. This is what the sales-materials review card
 * draws; the pill counts with the hook above.
 */
export function UploadState({
  label,
  progress,
  className,
}: {
  label: React.ReactNode;
  progress?: {
    percent: number;
    status: "waiting" | "uploading" | "storing" | "done" | "failed";
    /** Bytes sent so far and the file's size, so the pill can say
     *  "312.4 of 496.3 MB" — a figure nobody can mistake for an animation. */
    loaded?: number;
    total?: number;
  } | null;
  className?: string;
}) {
  const status = progress?.status ?? "waiting";
  const live =
    !!progress && (status === "uploading" || status === "waiting" || status === "storing");
  const shown = useSmoothedBytes(progress);
  const drawn = shown.percent;
  const mb = (n: number) =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
  const bytesLine =
    progress?.total && shown.loaded !== null
      ? `${mb(shown.loaded)} of ${mb(progress.total)}`
      : null;
  return (
    <div className={className}>
      <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-text-tertiary">
        <span className="min-w-0 truncate">{label}</span>
        {progress && (
          <span
            aria-live="polite"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[1px] text-[10px] font-semibold",
              status === "done"
                ? "bg-[rgba(22,163,74,0.10)] text-[color:#15803D]"
                : status === "failed"
                  ? "bg-[rgba(220,38,38,0.10)] text-[color:var(--status-red)]"
                  : "bg-blue-light text-blue-primary"
            )}
          >
            {status === "done" ? (
              <>
                <CheckCircle2 size={11} strokeWidth={2.6} />
                Uploaded
              </>
            ) : status === "failed" ? (
              <>
                <AlertCircle size={11} strokeWidth={2.4} />
                Upload failed
              </>
            ) : status === "storing" ? (
              <>
                <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
                Storing…
              </>
            ) : (
              <>
                <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
                Uploading{bytesLine ? <span className="tnum"> {bytesLine} ·</span> : null}{" "}
                <span className="tnum">{drawn}%</span>
              </>
            )}
          </span>
        )}
      </p>
      {live && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border-light">
          <div
            className="h-full rounded-full bg-blue-primary transition-[width] duration-150"
            style={{ width: `${Math.max(2, drawn)}%` }}
          />
        </div>
      )}
    </div>
  );
}
