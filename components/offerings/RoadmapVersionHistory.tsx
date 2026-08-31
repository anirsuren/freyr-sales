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
     * A LOG, DRAWN LIKE A LOG.
     *
     * Anir, Aug 31: "you're gonna do a much better job at separating the
     * roadmap version history. I don't know what you're doing here."
     *
     * Every entry was a white bordered card — the SAME card the releases
     * underneath use — so an audit trail of edits and the actual list of
     * versions stacked into one continuous run of identical boxes, and there
     * was no way to see where one ended and the other began.
     *
     * These are not records you act on; they are things that happened. So they
     * hang off a timeline rail as light rows, and the release cards below keep
     * the card treatment to themselves.
     */
    <div className="relative space-y-0.5 pl-5">
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-[7px] top-2 w-px bg-border-light"
      />
      {versions.map((v, i) => {
        const open = openVersion === v.version;
        /* The newest version IS what the page above shows, so it is named as
           such rather than leaving the reader to work out that v7 is current. */
        const current = i === 0;
        return (
          <div key={v.version} className="relative">
            {/* The dot on the rail. Filled on the newest, hollow on the rest,
                so "where we are now" is visible without reading a label. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[17px] top-[15px] h-[7px] w-[7px] rounded-full border-2",
                current
                  ? "border-[#7E22CE] bg-[#7E22CE]"
                  : "border-border-light bg-white"
              )}
            />
            <button
              type="button"
              onClick={() => setOpenVersion(open ? null : v.version)}
              aria-expanded={open}
              className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface/70"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-bold",
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
                  "mt-1 shrink-0 text-text-tertiary transition-transform",
                  open && "rotate-180"
                )}
              />
            </button>
            {open && (
              <div className="border-t border-border-light bg-surface/40 px-4 py-3">
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
                  <p className="mt-2 border-l-2 border-blue-subtle pl-2.5 text-[12.5px] italic text-text-secondary">
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
                              shapes differ. Components carry `current` instead
                              — the version sellers quote — so say that. */}
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
