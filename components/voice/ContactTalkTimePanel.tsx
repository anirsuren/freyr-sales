"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Maximize2, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OutcomeBadge } from "@/components/ui/Badge";
import { HoverCard } from "@/components/ui/HoverCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDateTime, OUTCOME_META } from "@/lib/utils";

export type TalkTimeCall = {
  id: string;
  name: string;
  company: string;
  value: number;
  /** OUTCOME_META key ("interested", "follow_up", …) — rendered as the app's
   *  colour + icon pill, never as plain bold text (Suren: "the outcome should
   *  be color-coded properly"). */
  outcome: string;
  createdAt: string;
  href: string;
};

const fmtLength = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const outcomeLabel = (key: string) => OUTCOME_META[key]?.label || key;

export function ContactTalkTimePanel({ calls, color }: { calls: TalkTimeCall[]; color: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Only the EXPANDED view searches now — the card charts the full set.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return calls;
    return calls.filter((call) =>
      `${call.name} ${call.company} ${outcomeLabel(call.outcome)}`
        .toLowerCase()
        .includes(needle)
    );
  }, [calls, query]);

  function searchField(className: string) {
    return (
      <div className={`relative ${className}`}>
        <Search size={13} strokeWidth={1.8} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts..."
          aria-label="Search contacts in talk time chart"
          className="h-8 w-full rounded-md border border-border bg-white pl-7 pr-2 text-[11.5px] outline-none focus:border-blue-primary"
        />
      </div>
    );
  }

  /**
   * One column per call: the length label sits directly ON TOP of its own bar,
   * the bar grows from a shared baseline, and the headshot + name sit in a
   * single bottom row under every column (Suren, Jul 27: "make sure the profile
   * pictures are at the bottom, they're literally half-weighted in the middle…
   * numbers should go right above the bar"). Same stretchy-track pattern as the
   * /forecast by-stage chart: the bar is absolutely positioned at the baseline
   * with a %-height, so the plot fills whatever height the row gives it.
   */
  function bars(expanded = false) {
    const source = expanded ? matches : calls;
    const visible = source.slice(0, expanded ? 40 : 8);
    const max = Math.max(...visible.map((call) => call.value), 1);
    return visible.length ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto pb-1">
        <div
          data-talk-plot
          className="flex min-h-0 flex-1 items-stretch gap-3"
          style={{
            minWidth: Math.max(visible.length * (expanded ? 84 : 64), 320),
            minHeight: expanded ? 320 : 168,
          }}
        >
          {visible.map((call, i) => {
            // Capped at 88% so the number pinned above the tallest bar always
            // has room inside the track.
            const barPct = Math.max((call.value / max) * 88, 5);
            return (
              <div key={call.id} className="flex min-w-[52px] flex-1 flex-col items-center">
                <div className="relative w-full flex-1">
                  <div className="absolute inset-x-0 bottom-0" style={{ height: `${barPct}%` }}>
                    <span className="absolute inset-x-0 -top-[17px] text-center text-[11px] font-semibold text-text-secondary tnum">
                      {fmtLength(call.value)}
                    </span>
                    <HoverCard
                      width={260}
                      side="top"
                      delayMs={0}
                      clearAncestor="[data-talk-plot]"
                      className="flex h-full w-full cursor-pointer items-end justify-center"
                      content={
                        <div>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={call.name} className="h-8 w-8 shrink-0 text-[10px]" />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-text-primary">{call.name}</p>
                              <p className="flex items-center gap-1 text-[11px] text-text-tertiary">
                                <CompanyLogo
                                  name={call.company}
                                  className="h-[15px] w-[15px] shrink-0 text-[6px]"
                                />
                                {call.company}
                              </p>
                            </div>
                            <span className="ml-auto text-[13px] font-bold text-text-primary tnum">{fmtLength(call.value)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 items-center gap-2 border-t border-border-light pt-3 text-[11.5px]">
                            <span className="text-text-tertiary">Outcome</span>
                            <span className="flex justify-end"><OutcomeBadge outcome={call.outcome} /></span>
                            <span className="text-text-tertiary">When</span>
                            <span className="text-right text-text-secondary">{formatDateTime(call.createdAt)}</span>
                          </div>
                          <Link href={call.href} className="mt-3 inline-flex text-[11.5px] font-semibold text-blue-primary">Open transcript →</Link>
                        </div>
                      }
                    >
                      <span
                        className="chart-bar block h-full w-8 rounded-t-md transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.22)]"
                        style={{ background: color, animationDelay: `${i * 60}ms` }}
                      />
                    </HoverCard>
                  </div>
                </div>
                {/* Every headshot on one bottom row, name wrapped under it —
                    names never truncate to "…". */}
                <Avatar name={call.name} className="mt-2 h-7 w-7 shrink-0 text-[9px]" />
                <span className="mt-1 min-h-[24px] w-full break-words text-center text-[10px] leading-tight text-text-tertiary">
                  {call.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <p className="flex h-[168px] items-center justify-center text-[13px] text-text-tertiary">
        No calls with talk time yet.
      </p>
    );
  }

  return (
    <>
      <Card className="flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">Talk time by contact</h3>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              How long each person stayed on the call — minutes:seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip label="Enlarge talk time chart">
              <button onClick={() => setOpen(true)} aria-label="Enlarge talk time chart" className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-tertiary hover:bg-blue-light hover:text-blue-primary">
                <Maximize2 size={14} strokeWidth={1.9} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">{bars(false)}</div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Talk time by contact" size="chart">
        <div className="mb-4 flex items-center justify-between gap-3">
          {searchField("w-[320px]")}
          <span className="text-[12px] text-text-tertiary tnum">{matches.length} matching calls</span>
        </div>
        <div className="rounded-lg border border-border-light bg-surface/30 p-5">{bars(true)}</div>
        <div className="mt-4 max-h-[260px] overflow-y-auto rounded-lg border border-border-light divide-y divide-border-light">
          {matches.map((call) => (
            <Link key={call.id} href={call.href} className="grid grid-cols-[minmax(180px,1fr)_minmax(150px,1fr)_130px_90px_170px_24px] items-center gap-3 px-4 py-3 hover:bg-surface">
              <span className="flex min-w-0 items-center gap-2.5"><Avatar name={call.name} className="h-7 w-7 text-[9px]" /><span className="text-[12.5px] font-semibold text-text-primary">{call.name}</span></span>
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-text-secondary"><CompanyLogo name={call.company} className="h-[18px] w-[18px] shrink-0 text-[7px]" />{call.company}</span>
              <span><OutcomeBadge outcome={call.outcome} /></span>
              <span className="text-[12px] font-semibold text-text-primary tnum">{fmtLength(call.value)}</span>
              <span className="text-[11.5px] text-text-tertiary">{formatDateTime(call.createdAt)}</span>
              <span className="text-blue-primary">→</span>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}
