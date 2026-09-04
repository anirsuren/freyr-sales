"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * WHAT THE APP DOES WHEN IT BREAKS.
 *
 * There was no error boundary at all, so every client-side exception rendered
 * Next's own bare line — "Application error: a client-side exception has
 * occurred while loading freyrsales.dev.freyrapps.com (see the browser console
 * for more information)" — in Times New Roman, on white, with nothing to click.
 * Found while testing in the browser on Aug 28, on a page that was working
 * thirty seconds earlier.
 *
 * THE CAUSE IS ALMOST ALWAYS A DEPLOY. Next splits the app into hashed chunks
 * and the page holds the manifest it was served with. A deploy replaces every
 * hash, so anyone with a tab already open asks for a chunk that no longer
 * exists the next time they navigate, and the whole app dies with a
 * ChunkLoadError. This happens to every person with the app open EVERY time we
 * ship, which — with Eeswar, Saras and Wajeed on it during the day — is not a
 * rare event.
 *
 * That specific failure is fixed by loading the page again, so this does it
 * rather than asking. Once only: the reload is recorded against this tab, so a
 * genuinely broken build shows the message instead of refreshing forever.
 * Anything that is not a chunk error is a real bug and is shown as one, with a
 * retry that re-renders rather than reloads.
 */

const RELOAD_MARK = "freyr.chunk-reloaded";

function isStaleChunk(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!isStaleChunk(error)) return;
    /* sessionStorage, not localStorage: the guard should last as long as this
       tab and no longer, so the next deploy can heal the same tab again. */
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_MARK) === "1";
      sessionStorage.setItem(RELOAD_MARK, "1");
    } catch {
      /* Private mode with storage disabled: fall through to the message
         rather than risking a reload loop we cannot count. */
      return;
    }
    if (alreadyTried) return;
    setReloading(true);
    window.location.reload();
  }, [error]);

  useEffect(() => {
    /* A page that renders fine clears the mark, so the guard only ever covers
       one bad load rather than the rest of the session. */
    if (isStaleChunk(error)) return;
    try {
      sessionStorage.removeItem(RELOAD_MARK);
    } catch {
      /* nothing to clear */
    }
  }, [error]);

  const stale = isStaleChunk(error);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-[420px] text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(220,38,38,0.08)] text-[color:var(--status-red)]">
          <AlertTriangle size={22} strokeWidth={2} />
        </span>
        <h1 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
          {reloading
            ? "Getting the latest version…"
            : stale
              ? "This page needs a refresh"
              : "Something went wrong here"}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">
          {stale
            ? "A new version of Freyr shipped while you had this open. Loading it again picks it up."
            : "This screen failed to draw. Nothing you did caused it and nothing you saved has been lost."}
        </p>

        {!reloading && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => (stale ? window.location.reload() : reset())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <RotateCcw size={15} strokeWidth={2} />
              {stale ? "Reload the page" : "Try again"}
            </button>
            {!stale && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
              >
                Reload
              </button>
            )}
          </div>
        )}

        {/* The digest is what makes a report actionable — it is the only handle
            on the server log for this exact failure. Quiet, but present. */}
        {error.digest && !stale && (
          <p className="mt-4 text-[11px] text-text-tertiary">
            Reference <span className="tnum font-semibold">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
