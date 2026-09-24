"use client";

import { useState } from "react";
import { safeHref } from "@/lib/safeUrl";
import { dedupeMnaDeals } from "@/lib/marketIntelMnaDedupe";
import { readableTitle } from "@/lib/marketIntelText";
import { fmtWhen } from "@/lib/whenLabel";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ExternalLink,
  Handshake,
  LayoutGrid,
  List,
  Megaphone,
  Pill,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
  CalendarClock,
  BadgeDollarSign,
  Newspaper,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { FilterMenu } from "@/components/ui/FilterMenu";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import type { MnaBoard, MnaItem, ThoughtBoard } from "@/lib/marketIntelFeed";
import { ThoughtLeadershipTracker } from "@/components/market-intel/ThoughtLeadershipTracker";
import { useStoredView } from "@/lib/useStoredView";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * THE M&A TRACKER (Aug 11 call): mergers and acquisitions across the
 * regulated industries, split by Announced vs Completed and by Freyr's three
 * divisions. Every deal is AI-classified from a real headline and links to
 * its source. First sub-tab of the Market Intelligence bucket; more trackers
 * join it later.
 */

const DIVISIONS: { key: MnaItem["division"]; icon: LucideIcon; color: string }[] = [
  { key: "Medicinal Products", icon: Pill, color: "var(--ink-bright-blue)" },
  { key: "Medical Devices", icon: Stethoscope, color: "var(--ink-teal-deep)" },
  { key: "Consumer", icon: ShoppingBag, color: "var(--ink-orange)" },
];

const STATUS_META = {
  announced: { label: "Announced", color: "var(--ink-bright-blue)" },
  completed: { label: "Completed", color: "var(--ink-green)" },
} as const;

/** Date, plus the time when the record actually carries one. */
const fmtDate = fmtWhen;

/** "$360 M" / "$3.8 B" → dollars; null when the deal value is undisclosed. */
function dealValueUsd(v: string | null): number | null {
  if (!v) return null;
  const m = v.replace(/[$,\s]/g, "").match(/^([\d.]+)([MB])/i);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2].toUpperCase() === "B" ? 1e9 : 1e6);
}

const TRACKERS = ["mna", "thought"] as const;
type Tracker = (typeof TRACKERS)[number];

export function MnaTracker({
  board,
  thought = null,
}: {
  board: MnaBoard | null;
  /** The thought-leadership board (Anant via Saras, Sep 10). */
  thought?: ThoughtBoard | null;
}) {
  const [tracker, pickTracker] = useStoredView<Tracker>("freyr.mi.tracker", "mna", TRACKERS);
  // Keep the existing M&A preference key so an already chosen view survives
  // this split; Thought Leadership gets its own independent choice.
  const [mnaLayout, setMnaLayout] = useStoredView<"table" | "tile">("freyr.mi.market.layout", "tile", ["table", "tile"]);
  const [thoughtLayout, setThoughtLayout] = useStoredView<"table" | "tile">("freyr.mi.market.thought.layout", "tile", ["table", "tile"]);
  // MULTISELECT (Anir, Aug 18: "multiselect. wherever this applies") — pick
  // several statuses, divisions, sizes or sources at once; empty = all. Time
  // stays single: two overlapping windows are one window.
  const [status, setStatus] = useState<string[]>([]);
  const [division, setDivision] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<"all" | "30" | "90" | "year">("all");
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  /* One deal, one row, including boards saved before the dedupe learned to
     match paraphrased headlines (Sep 13 loop). */
  const items = dedupeMnaDeals(board?.items ?? []);
  const capped = Math.max(0, (board?.total ?? 0) - (board?.items?.length ?? 0));
  const readableThought = (thought?.items ?? []).filter((item) => readableTitle(item.title));
  const thoughtCapped = Math.max(0, (thought?.total ?? 0) - (thought?.items?.length ?? 0));
  const q = query.trim().toLowerCase();
  const sources = [...new Set(items.map((d) => d.sourceLabel).filter(Boolean))].sort();
  const shown = items.filter((deal) => {
    if (status.length > 0 && !status.includes(deal.status)) return false;
    if (division.length > 0 && !division.includes(deal.division)) return false;
    if (timeFilter !== "all") {
      if (!deal.date) return false;
      const t = Date.parse(deal.date);
      const now = Date.now();
      if (timeFilter === "30" && t < now - 30 * 86400e3) return false;
      if (timeFilter === "90" && t < now - 90 * 86400e3) return false;
      if (timeFilter === "year" && new Date(t).getFullYear() !== new Date().getFullYear()) return false;
    }
    if (sizeFilter.length > 0) {
      const v = dealValueUsd(deal.valueLabel);
      const bucket = v === null ? "undisclosed" : v >= 1e9 ? "big" : "small";
      if (!sizeFilter.includes(bucket)) return false;
    }
    if (sourceFilter.length > 0 && !sourceFilter.includes(deal.sourceLabel ?? ""))
      return false;
    return (
      !q ||
      [deal.acquirer, deal.target, deal.summary, deal.sourceLabel]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  });
  const announced = items.filter((d) => d.status === "announced").length;
  const completed = items.length - announced;

  return (
    <div>
      {/* The tracker BAR: an obvious selector that scrolls sideways as more
          trackers land (Anir: "it has to be obvious that that's there…
          horizontally scroll left and right"). M&A is the first resident. */}
      <div className="mb-4 flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-0.5">
          {(
            [
              { key: "mna", label: "M&A Tracker", icon: Handshake },
              { key: "thought", label: "Thought Leadership", icon: BookOpenText },
            ] as const
          ).map((t) => {
            const on = tracker === t.key;
            const TIcon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => pickTracker(t.key)}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  on
                    ? "bg-blue-primary text-white"
                    : "border border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                )}
              >
                <TIcon size={13} strokeWidth={2.2} /> {t.label}
              </button>
            );
          })}
        </div>
        {tracker === "thought" ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.07)] px-2.5 py-1 text-[11.5px] font-semibold text-text-primary tnum">
              <BookOpenText size={11} strokeWidth={2.4} className="text-blue-primary" />
              {thoughtCapped > 0
                ? `${readableThought.length} of ${readableThought.length + thoughtCapped} publications`
                : `${readableThought.length} publications`}
            </span>
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tnum"
              style={{ color: "var(--ink-violet)", background: "rgba(109,40,217,0.10)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#6D28D9]" />
              {new Set(readableThought.map((i) => i.firm)).size} firms
            </span>
          </span>
        ) : (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.07)] px-2.5 py-1 text-[11.5px] font-semibold text-text-primary tnum">
            <Handshake size={11} strokeWidth={2.4} className="text-blue-primary" />
            {/* SAY WHAT IS HELD BACK (Anir, Sep 4). The list is capped, so
                "40 deals" read as the size of the market rather than the size
                of the page. Notifications sets the pattern: cap, then name the
                remainder. */}
            {capped > 0
              ? `${items.length} of ${items.length + capped} deals`
              : `${items.length} deals`}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tnum"
            style={{ color: "var(--ink-bright-blue)", background: "rgba(0,113,227,0.10)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0071E3]" />
            {announced} announced
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tnum"
            style={{ color: "var(--ink-green)", background: "rgba(26,122,53,0.10)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
            {completed} completed
          </span>
        </span>
        )}
      </div>

      {tracker === "thought" ? (
        <ThoughtLeadershipTracker board={thought} layout={thoughtLayout} onLayoutChange={setThoughtLayout} />
      ) : (
      <>
      <SearchPriority
        query={query}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search deals…"
          ariaLabel="Search deals"
          grow
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <FilterMenu
            ariaLabel="Filter M&A deals"
            groups={[
              { key: "status", label: "Status", values: status, onChange: setStatus, options: [
                { value: "announced", label: "Announced", color: "var(--ink-bright-blue)", icon: Megaphone },
                { value: "completed", label: "Completed", color: "var(--ink-green)", icon: CheckCircle2 },
              ] },
              { key: "division", label: "Division", values: division, onChange: setDivision, options: [
                { value: "Medicinal Products", label: "Medicinal Products", color: "var(--ink-bright-blue)", icon: Pill },
                { value: "Medical Devices", label: "Medical Devices", color: "var(--ink-teal-deep)", icon: Stethoscope },
                { value: "Consumer", label: "Consumer", color: "var(--ink-orange)", icon: ShoppingBag },
              ] },
              { key: "time", label: "Time period", values: timeFilter === "all" ? [] : [timeFilter],
                onChange: next => setTimeFilter((next.at(-1) as typeof timeFilter | undefined) ?? "all"), options: [
                  { value: "30", label: "Last 30 days", color: "var(--ink-violet)", icon: CalendarClock },
                  { value: "90", label: "Last 90 days", color: "var(--ink-teal-deep)", icon: CalendarClock },
                  { value: "year", label: "This year", color: "var(--ink-orange)", icon: CalendarClock },
                ] },
              { key: "size", label: "Deal size", values: sizeFilter, onChange: setSizeFilter, options: [
                { value: "big", label: "$1B and up", color: "var(--ink-teal-deep)", icon: BadgeDollarSign },
                { value: "small", label: "Under $1B", color: "var(--ink-bright-blue)", icon: BadgeDollarSign },
                { value: "undisclosed", label: "Undisclosed", color: "#8AB4E8", icon: BadgeDollarSign },
              ] },
              { key: "source", label: "Source", values: sourceFilter, onChange: setSourceFilter,
                options: sources.map(src => ({ value: src, label: src, color: "var(--ink-violet)", icon: Newspaper })) },
            ]}
            onClearAll={() => { setStatus([]); setDivision([]); setTimeFilter("all"); setSizeFilter([]); setSourceFilter([]); }}
          />
          <ColorSelect
            value={mnaLayout}
            onChange={(value) => setMnaLayout(value as "table" | "tile")}
            ariaLabel={`Market Intel view: ${mnaLayout === "table" ? "Table" : "Tile"}`}
            iconOnly
            options={[
              { value: "table", label: "Table view", color: "var(--ink-bright-blue)", icon: List },
              { value: "tile", label: "Tile view", color: "var(--ink-bright-blue)", icon: LayoutGrid },
            ]}
          />
        </span>
      </SearchPriority>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-[13px] leading-relaxed text-text-secondary">
          {items.length === 0
            ? "The tracker fills with real deals on the next refresh."
            : "No deals match that search and filter."}
        </Card>
      ) : mnaLayout === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-border-light bg-white">
          <div className="min-w-[1060px]">
            <div className="grid grid-cols-[minmax(300px,1.5fr)_minmax(150px,1fr)_145px_115px_135px] gap-4 border-b border-border-light bg-surface/80 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
              <span>Deal</span><span>Division</span><span>Status</span><span>Value</span><span>Announced</span>
            </div>
            <div className="divide-y divide-border-light">
              {shown.map((deal, index) => {
                const meta = STATUS_META[deal.status];
                const divisionMeta = DIVISIONS.find((entry) => entry.key === deal.division)!;
                const DIcon = divisionMeta.icon;
                const href = safeHref(deal.sourceUrl);
                return (
                  <div key={`${deal.sourceUrl}-${index}`} className="grid grid-cols-[minmax(300px,1.5fr)_minmax(150px,1fr)_145px_115px_135px] items-start gap-4 px-5 py-4 hover:bg-surface/60">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">{deal.acquirer}<ArrowRight size={13} className="text-text-tertiary" />{deal.target}</span>
                      {deal.summary && <span className="mt-1 block overflow-hidden text-[11.5px] leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{deal.summary}</span>}
                      {href && <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary hover:underline">{deal.sourceLabel}<ExternalLink size={11} /></a>}
                    </span>
                    <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: divisionMeta.color, background: tint(divisionMeta.color, 8) }}><DIcon size={11} />{deal.division}</span>
                    <span className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: meta.color, background: tint(meta.color, 8) }}>{meta.label}</span>
                    <span className="text-[11.5px] font-semibold text-text-primary tnum">{deal.valueLabel || "Not disclosed"}</span>
                    <span className="text-[11.5px] text-text-secondary" suppressHydrationWarning>{fmtDate(deal.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
                    style={{ color: divisionMeta.color, background: tint(divisionMeta.color, 8) }}
                  >
                    <DIcon size={10.5} strokeWidth={2.2} /> {deal.division}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                    style={{ color: meta.color, background: tint(meta.color, 8) }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11.5px] text-text-tertiary" suppressHydrationWarning>
                    {fmtDate(deal.date)}
                  </span>
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">
                  {deal.summary}
                </p>
                <a
                  href={safeHref(deal.sourceUrl) as string}
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
        Refreshes once a day.
      </p>
      </>
      )}
    </div>
  );
}
