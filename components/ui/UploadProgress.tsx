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
  const drawn = useCountingPercent(percent, status);

  const label =
    status === "failed"
      ? "Upload failed"
      : status === "done"
        ? "Uploaded"
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
  status: "waiting" | "uploading" | "done" | "failed"
): number {
  const [shown, setShown] = useState(0);
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  const live = status === "uploading" || status === "waiting";
  /* THE TARGET LIVES IN A REF, NOT IN THE EFFECT'S DEPENDENCIES. XHR fires a
     progress event every few milliseconds; with `target` as a dependency each
     one re-ran the effect and cancelled the pending 18ms tick, so the count
     only ever advanced when the events paused — measured on the page: 0, 1,
     2, 3 across five seconds, then straight to Uploaded (Anir, Sep 7: "why
     is it stuck at 0?"). The tick is now scheduled off `shown` alone and
     reads the latest target when it fires. */
  const targetRef = useRef(target);
  targetRef.current = target;
  /* ON A CLOCK, NOT A TICK COUNT. A background or throttled tab fires timers
     about once a second, which turned the 18ms climb into one step per second
     (measured through the automation window). The displayed value is now a
     function of elapsed time — 0 to 80 over 1.5s, then one point per 260ms
     to 99 — so whenever a render happens it shows the right number for the
     moment, smooth in a foreground tab and still correct in a starved one.
     Above 80 it never sits below the real byte count, and done snaps to 100. */
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live) {
      startRef.current = null;
      setShown(status === "done" ? 100 : targetRef.current);
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      const climb = Math.min(80, Math.floor(elapsed / 18));
      const crawl = elapsed > 1440 ? Math.floor((elapsed - 1440) / 260) : 0;
      const paced = Math.min(99, climb + crawl);
      const truth = Math.min(99, targetRef.current);
      setShown((current) => Math.max(current, paced, paced >= 80 ? truth : 0));
    }, 40);
    return () => clearInterval(id);
  }, [live, status]);
  return live ? shown : status === "done" ? 100 : target;
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
  progress?: { percent: number; status: "waiting" | "uploading" | "done" | "failed" } | null;
  className?: string;
}) {
  const status = progress?.status ?? "waiting";
  const drawn = useCountingPercent(progress?.percent ?? 0, status);
  const live = !!progress && (status === "uploading" || status === "waiting");
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
            ) : (
              <>
                <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
                Uploading <span className="tnum">{drawn}%</span>
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
