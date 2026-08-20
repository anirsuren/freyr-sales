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
    <div className="space-y-2">
      {versions.map((v, i) => {
        const open = openVersion === v.version;
        /* The newest version IS what the page above shows, so it is named as
           such rather than leaving the reader to work out that v7 is current. */
        const current = i === 0;
        return (
          <div
            key={v.version}
            className="overflow-hidden rounded-xl border border-border-light bg-white"
          >
            <button
              type="button"
              onClick={() => setOpenVersion(open ? null : v.version)}
              aria-expanded={open}
              className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/60"
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
                          {r.features.length
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
