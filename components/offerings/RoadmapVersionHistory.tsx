"use client";

import { useState } from "react";
import { GitBranch, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { RoadmapVersion } from "@/lib/roadmapVersions";

/**
 * THE ROADMAP'S OWN HISTORY (product owner, Aug 20: "Every time there is a
 * change in road map it has to be versioned. Just like how you version a
 * document").
 *
 * Not to be confused with Release History right above it. That one is what we
 * told customers shipped and when. This one is what THE DOCUMENT said and when
 * it changed: who moved a date, who dropped a feature, and what it looked like
 * before they did. A rep who quoted March to a client can come here and see
 * that March became June on the 14th, and who to ask about it.
 */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} · ${d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()}`;
}

export function RoadmapVersionHistory({
  versions,
}: {
  versions: RoadmapVersion[];
}) {
  const [openVersion, setOpenVersion] = useState<number | null>(null);

  if (!versions.length) {
    return (
      <p className="text-[13px] text-text-secondary">
        Nothing has changed yet. The first edit to this roadmap becomes v1, and
        every change after it gets its own version.
      </p>
    );
  }

  return (
    /**
     * EACH VERSION IS A FULL WIDTH DROPDOWN, FILLING THE CONTAINER.
     *
     * Anir, Sep 2: "revamp the entire roadmap thing... I need the entire thing
     * to be some sort of drop-down, similar to those pages where the entire
     * thing is a drop-down and then I can click it. It can't just be on the
     * left side. It looks awkward... The circles on the vertical line for the
     * timeline are bad because they're not even on the line."
     *
     * WHAT WAS WRONG. This was drawn as a timeline: a hairline rail down the
     * left with a dot per version hanging off it. Two problems, and he found
     * both. The dots were positioned independently of the rail (rail centre at
     * 7.5px, dot centre at 6.5px) so they sat a pixel off it, which at this
     * size reads as sloppy rather than as a line of dots. And the whole thing
     * hugged the left edge inside a container it never filled, so the rows
     * looked like a narrow list pinned to one side of a wide box.
     *
     * WHAT IT IS NOW. No rail and no dots, because a decoration that has to be
     * pixel-aligned to look right is a decoration that will drift again the
     * next time anything moves. Each version is a full width row that fills
     * the container and opens downward, the same fold idiom as the sections on
     * a deal and the charts on the accruals page. "Current" is said in words
     * on the newest row, which is what the dot was doing badly.
     */
    <div className="space-y-1.5">
      {versions.map((v, i) => {
        const open = openVersion === v.version;
        /* The newest version IS what the page above shows, so it is named as
           such rather than leaving the reader to work out that v7 is current. */
        const current = i === 0;
        return (
          /* OPEN ONE AND THE REST STEP BACK (Anir, Sep 2: "when I click on a
             version, it should dim everything else, like that effect that I
             like"). Nothing is hidden and no row moves, so the list keeps its
             shape; hovering a dimmed row brings it back so it still reads as
             clickable rather than disabled. */
          <div
            key={v.version}
            className={cn(
              "overflow-hidden rounded-xl border bg-white transition-[opacity,border-color,box-shadow] duration-200",
              open
                ? "border-blue-subtle shadow-card"
                : "border-border-light",
              openVersion !== null && !open && "opacity-40 hover:opacity-80"
            )}
          >
            <button
              type="button"
              onClick={() => setOpenVersion(open ? null : v.version)}
              aria-expanded={open}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                open ? "bg-blue-light/40" : "hover:bg-surface/70"
              )}
            >
              <span
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-bold",
                  current
                    ? "bg-[rgba(168,85,247,0.12)] text-[#7E22CE]"
                    : "bg-surface text-text-secondary"
                )}
              >
                <GitBranch size={12} strokeWidth={2.4} aria-hidden="true" />
                v{v.version}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold text-text-primary">
                    {v.changes[0] ?? "Roadmap updated"}
                  </span>
                  {v.changes.length > 1 && (
                    <span className="text-[12px] font-semibold text-text-tertiary">
                      +{v.changes.length - 1} more
                    </span>
                  )}
                  {current && (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                      Current
                    </span>
                  )}
                </span>
                {/* WHO AND WHEN, on one line under the change — the same shape
                    the performance timeline uses, so the app tells this kind of
                    fact one way everywhere. */}
                <span className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
                  <Avatar name={v.savedBy} className="h-4 w-4 text-[7px]" />
                  {v.savedBy}
                  <span className="text-text-tertiary">· {stamp(v.savedAt)}</span>
                </span>
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-text-tertiary transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </button>
            {open && (
              /* INDENTED, so the detail reads as belonging to the row above it
                 rather than as the next row. Anir asked for exactly this on the
                 features table on the same page. */
              <div className="border-t border-border-light bg-surface/40 py-3 pl-[62px] pr-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  What changed
                </p>
                <ul className="mt-1.5 space-y-1">
                  {v.changes.map((c, k) => (
                    <li key={k} className="flex gap-2 text-[12.5px] text-text-primary">
                      <span aria-hidden="true" className="text-text-tertiary">
                        ·
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
                {/* WHY, WHERE WHAT ALREADY IS. The lines above are recoverable
                    from a diff; this sentence is the only thing that is not,
                    and it is the first thing anybody asks. */}
                {v.reason && (
                  <p className="mt-2 text-[12.5px] italic text-text-secondary">
                    &ldquo;{v.reason}&rdquo;
                  </p>
                )}
                {v.releases.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                      What the roadmap said then
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {v.releases.map((r) => (
                        <p key={r.id} className="text-[12.5px] text-text-secondary">
                          <b className="text-text-primary">{r.version}</b>
                          {r.date ? ` · ${r.date}` : ""}
                          {r.status === "next" ? " · next release" : ""}
                          {/* A COMPONENT RELEASE HAS NO `features` (found Aug 20:
                              expanding a version on a component page threw
                              "Cannot read properties of undefined" and took the
                              whole section down with it). The snapshot is cast
                              through JSON, so TypeScript never saw the two
                              shapes differ. Components carry `current` instead,
                              the version sellers quote, so say that. */}
                          {"current" in r && r.current ? " · current version" : ""}
                          {"features" in r && r.features.length
                            ? ` · ${r.features.length} feature${r.features.length === 1 ? "" : "s"}`
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
      })}
    </div>
  );
}
