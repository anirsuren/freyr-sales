"use client";

import { useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Handshake,
  Pill,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { MnaBoard, MnaItem } from "@/lib/marketIntelFeed";

/**
 * THE M&A TRACKER (Aug 11 call): mergers and acquisitions across the
 * regulated industries, split by Announced vs Completed and by Freyr's three
 * divisions. Every deal is AI-classified from a real headline and links to
 * its source. First sub-tab of the Market Intelligence bucket; more trackers
 * join it later.
 */

const DIVISIONS: { key: MnaItem["division"]; icon: LucideIcon; color: string }[] = [
  { key: "Medicinal Products", icon: Pill, color: "#0071E3" },
  { key: "Medical Devices", icon: Stethoscope, color: "#0F766E" },
  { key: "Consumer", icon: ShoppingBag, color: "#C2410C" },
];

const STATUS_META = {
  announced: { label: "Announced", color: "#0071E3" },
  completed: { label: "Completed", color: "#1A7A35" },
} as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MnaTracker({ board }: { board: MnaBoard | null }) {
  const [status, setStatus] = useState<"all" | "announced" | "completed">("all");
  const [division, setDivision] = useState<"all" | MnaItem["division"]>("all");

  const items = board?.items ?? [];
  const shown = items.filter(
    (deal) =>
      (status === "all" || deal.status === status) &&
      (division === "all" || deal.division === division)
  );
  const announced = items.filter((d) => d.status === "announced").length;
  const completed = items.length - announced;

  return (
    <div>
      {/* Sub-tabs: M&A is the first; the call promised more trackers here. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.08)] px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary">
          <Handshake size={13} strokeWidth={2.2} /> M&A Tracker
        </span>
        <span className="text-[11.5px] text-text-tertiary">
          More trackers join this bucket as they&apos;re built.
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-3 rounded-xl border border-border-light bg-white px-4 py-2">
          <span className="text-[12px] font-medium text-text-secondary">
            <span className="tnum text-[16px] font-bold text-text-primary">
              {items.length}
            </span>{" "}
            deals
          </span>
          <span className="text-[12px] font-medium" style={{ color: "#0071E3" }}>
            <span className="tnum text-[16px] font-bold">{announced}</span> announced
          </span>
          <span className="text-[12px] font-medium" style={{ color: "#1A7A35" }}>
            <span className="tnum text-[16px] font-bold">{completed}</span> completed
          </span>
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {(["all", "announced", "completed"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              aria-pressed={status === key}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                status === key
                  ? "border-transparent text-white"
                  : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
              )}
              style={
                status === key
                  ? {
                      background:
                        key === "completed"
                          ? "#1A7A35"
                          : key === "announced"
                            ? "#0071E3"
                            : "#1D1D1F",
                    }
                  : undefined
              }
            >
              {key === "all" ? "All statuses" : STATUS_META[key].label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border-light" />
          <button
            type="button"
            onClick={() => setDivision("all")}
            aria-pressed={division === "all"}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
              division === "all"
                ? "border-transparent bg-[#1D1D1F] text-white"
                : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
            )}
          >
            All divisions
          </button>
          {DIVISIONS.map((d) => {
            const DIcon = d.icon;
            const active = division === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDivision(d.key)}
                aria-pressed={active}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  active
                    ? "border-transparent text-white"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                )}
                style={active ? { background: d.color } : undefined}
              >
                <DIcon size={12} strokeWidth={2.2} />
                {d.key}
              </button>
            );
          })}
        </span>
      </div>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-[13px] leading-relaxed text-text-secondary">
          {items.length === 0
            ? "The tracker fills with real deals on the next refresh."
            : "No deals match those filters."}
        </Card>
      ) : (
        <div className="space-y-3 stagger">
          {shown.map((deal, index) => {
            const meta = STATUS_META[deal.status];
            const divisionMeta = DIVISIONS.find((d) => d.key === deal.division)!;
            const DIcon = divisionMeta.icon;
            return (
              <Card
                key={index}
                className="border-l-[3px] p-5"
                style={{ borderLeftColor: meta.color }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-bold text-text-primary">
                    {deal.acquirer}
                    <ArrowRight size={15} strokeWidth={2.4} className="text-text-tertiary" />
                    {deal.target}
                  </p>
                  {deal.valueLabel && (
                    <span className="tnum shrink-0 text-[15px] font-bold text-text-primary">
                      {deal.valueLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                    style={{ color: divisionMeta.color, background: `${divisionMeta.color}14` }}
                  >
                    <DIcon size={10.5} strokeWidth={2.2} /> {deal.division}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                    style={{ color: meta.color, background: `${meta.color}14` }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    {fmtDate(deal.date)}
                  </span>
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">
                  {deal.summary}
                </p>
                <a
                  href={deal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                >
                  Source: {deal.sourceLabel}
                  <ExternalLink size={11} strokeWidth={2.2} />
                </a>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-text-tertiary">
        Deals are detected in real headlines and classified automatically:
        acquirer, target, status and division. Every card links to its source.
        Refreshes twice a day with the rest of Market Intel.
      </p>
    </div>
  );
}
