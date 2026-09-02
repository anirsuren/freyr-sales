"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { RoadmapVersion } from "@/lib/roadmapVersions";

/**
 * THE VERSION HISTORY AS A TIMELINE, SPACED BY ORDER RATHER THAN BY DATE.
 *
 * Anir, Sep 2, asked for a timeline view of the roadmap history "in a similar
 * way you have the version timeline". I first did exactly that and fed the
 * history straight into `VersionTimeline`, the date-scaled gantt the releases
 * use. It rendered, and it was useless: every roadmap version on the component
 * he was looking at had been saved between 4:17 and 4:20 on one morning, so all
 * eighteen markers landed on a single pixel and you could see v1 and v18 with
 * sixteen hidden underneath. He saw it, said "realistically they would be
 * different, right?", and asked me to figure out a way.
 *
 * SO THE AXIS IS ORDER, NOT TIME. Releases are weeks apart and a date axis is
 * the right shape for them. Edits to a document are not: five can happen in a
 * minute and then none for a month, and the question somebody brings to a
 * change log is "what happened, and in what order", never "how many days apart
 * were these two saves". Each version gets an equal slot, and its real date is
 * printed under it, so nothing about when it happened is lost. A gap in time is
 * still legible, it is just read off the labels instead of the spacing.
 *
 * This is deliberately NOT `VersionTimeline` with a flag. That component is
 * seven hundred lines of pan, zoom and day arithmetic, all of which exists to
 * answer a question this view does not ask.
 */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function fullStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} · ${d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()}`;
}

export function RoadmapTimeline({ versions }: { versions: RoadmapVersion[] }) {
  /* Oldest to newest, left to right, which is the direction people read a
     history in. The stored list is newest first. */
  const ordered = [...versions].sort((a, b) => a.version - b.version);
  const newest = ordered.length ? ordered[ordered.length - 1].version : null;
  const [picked, setPicked] = useState<number | null>(newest);
  const current = ordered.find((v) => v.version === picked) ?? null;

  if (!ordered.length) {
    return (
      <p className="text-[13px] text-text-secondary">
        Nothing has changed yet. The first edit to this roadmap becomes v1, and
        every change after it gets its own version.
      </p>
    );
  }

  return (
    <div>
      {/* A MINIMUM SLOT PER VERSION, and the row scrolls when there are more
          than fit. Squeezing forty versions into the card width would rebuild
          the exact pile-up this view exists to fix. */}
      <div className="overflow-x-auto pb-1">
        <div
          className="relative flex min-w-full items-start"
          style={{ minWidth: `${ordered.length * 92}px` }}
        >
          {/* The rail sits behind the markers and stops at the first and last
              one rather than running to the container edges, so the line
              describes the versions instead of the box. */}
          <span
            aria-hidden="true"
            className="absolute left-[46px] right-[46px] top-[30px] h-px bg-border-light"
          />
          {ordered.map((v) => {
            const on = v.version === picked;
            const isNewest = v.version === newest;
            return (
              <button
                key={v.version}
                type="button"
                onClick={() => setPicked(v.version)}
                aria-pressed={on}
                title={`v${v.version} · ${fullStamp(v.savedAt)}`}
                className="group relative flex flex-1 shrink-0 cursor-pointer flex-col items-center gap-1.5 px-1"
              >
                <span
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-bold transition-colors",
                    on
                      ? "bg-[rgba(168,85,247,0.16)] text-[#7E22CE]"
                      : "bg-surface text-text-secondary group-hover:text-blue-primary"
                  )}
                >
                  <GitBranch size={10} strokeWidth={2.6} aria-hidden="true" />
                  v{v.version}
                </span>
                {/* The dot rides in the same column as everything else in this
                    button, so it cannot drift off the rail the way the old
                    absolutely positioned dots did. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-[9px] w-[9px] rounded-full border-2 bg-white transition-colors",
                    on
                      ? "border-[#7E22CE] bg-[#7E22CE]"
                      : isNewest
                        ? "border-[#7E22CE]"
                        : "border-border group-hover:border-blue-primary"
                  )}
                />
                <span
                  className={cn(
                    "whitespace-nowrap text-[10.5px] tabular-nums transition-colors",
                    on ? "font-semibold text-text-primary" : "text-text-tertiary"
                  )}
                >
                  {shortDate(v.savedAt)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* WHAT THE PICKED ONE SAYS, under the rail. A timeline you cannot read
          the detail of is a picture of a list. */}
      {current && (
        <div
          key={current.version}
          className="tab-panel mt-3 rounded-xl border border-border-light bg-surface/40 p-4"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-text-primary">
              {current.changes[0] ?? "Roadmap updated"}
            </span>
            {current.version === newest && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                Current
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <Avatar name={current.savedBy} className="h-4 w-4 text-[7px]" />
            {current.savedBy}
            <span className="text-text-tertiary">
              · {fullStamp(current.savedAt)}
            </span>
          </p>
          {current.changes.length > 1 && (
            <ul className="mt-2.5 space-y-1">
              {current.changes.map((c, k) => (
                <li
                  key={k}
                  className="flex gap-2 text-[12.5px] text-text-primary"
                >
                  <span aria-hidden="true" className="text-text-tertiary">
                    ·
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {current.reason && (
            <p className="mt-2 text-[12.5px] italic text-text-secondary">
              &ldquo;{current.reason}&rdquo;
            </p>
          )}
          {current.releases.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                What the roadmap said then
              </p>
              <div className="mt-1.5 space-y-1">
                {current.releases.map((r) => (
                  <p key={r.id} className="text-[12.5px] text-text-secondary">
                    <b className="text-text-primary">{r.version}</b>
                    {r.date ? ` · ${r.date}` : ""}
                    {r.status === "next" ? " · next release" : ""}
                    {"current" in r && r.current ? " · current version" : ""}
                    {"features" in r && r.features.length
                      ? ` · ${r.features.length} feature${
                          r.features.length === 1 ? "" : "s"
                        }`
                      : ""}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
