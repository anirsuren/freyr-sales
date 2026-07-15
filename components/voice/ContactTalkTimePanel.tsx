"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Maximize2, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDateTime } from "@/lib/utils";

export type TalkTimeCall = {
  id: string;
  name: string;
  company: string;
  value: number;
  outcome: string;
  createdAt: string;
  href: string;
};

const fmtLength = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function ContactTalkTimePanel({ calls, color }: { calls: TalkTimeCall[]; color: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return calls;
    return calls.filter((call) =>
      `${call.name} ${call.company} ${call.outcome}`.toLowerCase().includes(needle)
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

  function bars(expanded = false) {
    const visible = matches.slice(0, expanded ? 40 : 8);
    const max = Math.max(...visible.map((call) => call.value), 1);
    const height = expanded ? 320 : 160;
    return visible.length ? (
      <div className="overflow-x-auto pb-1">
        <div className="flex items-stretch gap-3" style={{ minWidth: Math.max(visible.length * (expanded ? 84 : 64), 320), height }}>
          {visible.map((call) => {
            const first = call.name.replace(/^Dr\.\s*/i, "").split(/\s+/)[0];
            return (
              <HoverCard
                key={call.id}
                width={260}
                side="top"
                delayMs={0}
                className="flex min-w-[52px] flex-1 flex-col items-center gap-1.5"
                content={
                  <div>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={call.name} className="h-8 w-8 shrink-0 text-[10px]" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-text-primary">{call.name}</p>
                        <p className="truncate text-[11px] text-text-tertiary">{call.company}</p>
                      </div>
                      <span className="ml-auto text-[13px] font-bold text-text-primary tnum">{fmtLength(call.value)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-light pt-3 text-[11.5px]">
                      <span className="text-text-tertiary">Outcome</span><span className="text-right font-semibold text-text-primary">{call.outcome}</span>
                      <span className="text-text-tertiary">When</span><span className="text-right text-text-secondary">{formatDateTime(call.createdAt)}</span>
                    </div>
                    <Link href={call.href} className="mt-3 inline-flex text-[11.5px] font-semibold text-blue-primary">Open transcript →</Link>
                  </div>
                }
              >
                <span className="mt-auto text-[11px] font-semibold text-text-secondary tnum">{fmtLength(call.value)}</span>
                <span className="flex w-full flex-1 items-end justify-center">
                  <span
                    className="block w-8 rounded-t-md"
                    style={{ height: `${Math.max(5, (call.value / max) * 100)}%`, background: color }}
                  />
                </span>
                <Avatar name={call.name} className="h-7 w-7 shrink-0 text-[9px]" />
                <span className="max-w-[72px] truncate text-center text-[10.5px] text-text-tertiary">{first}</span>
              </HoverCard>
            );
          })}
        </div>
      </div>
    ) : (
      <p className="flex h-[160px] items-center justify-center text-[13px] text-text-tertiary">No matching calls.</p>
    );
  }

  return (
    <>
      <Card className="flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">Talk time by contact</h3>
            <p className="mt-0.5 text-[12px] text-text-tertiary">How long each person stayed on the call.</p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip label="Enlarge talk time chart">
              <button onClick={() => setOpen(true)} aria-label="Enlarge talk time chart" className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-tertiary hover:bg-blue-light hover:text-blue-primary">
                <Maximize2 size={14} strokeWidth={1.9} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="mt-3 mb-3">{searchField("w-full")}</div>
        {bars(false)}
        <p className="mt-2 text-[10.5px] text-text-tertiary tnum">Showing {Math.min(matches.length, 8)} of {matches.length} matching calls</p>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Talk time by contact" size="chart">
        <div className="mb-4 flex items-center justify-between gap-3">
          {searchField("w-[320px]")}
          <span className="text-[12px] text-text-tertiary tnum">{matches.length} matching calls</span>
        </div>
        <div className="rounded-lg border border-border-light bg-surface/30 p-5">{bars(true)}</div>
        <div className="mt-4 max-h-[260px] overflow-y-auto rounded-lg border border-border-light divide-y divide-border-light">
          {matches.map((call) => (
            <Link key={call.id} href={call.href} className="grid grid-cols-[minmax(180px,1fr)_minmax(150px,1fr)_100px_170px_24px] items-center gap-3 px-4 py-3 hover:bg-surface">
              <span className="flex min-w-0 items-center gap-2.5"><Avatar name={call.name} className="h-7 w-7 text-[9px]" /><span className="truncate text-[12.5px] font-semibold text-text-primary">{call.name}</span></span>
              <span className="truncate text-[12px] text-text-secondary">{call.company}</span>
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
