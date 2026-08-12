"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Handshake,
  Layers,
  Megaphone,
  Pill,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
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
  const [query, setQuery] = useState("");

  const items = board?.items ?? [];
  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (deal) =>
      (status === "all" || deal.status === status) &&
      (division === "all" || deal.division === division) &&
      (!q ||
        [deal.acquirer, deal.target, deal.summary, deal.sourceLabel]
          .join(" ")
          .toLowerCase()
          .includes(q))
  );
  const announced = items.filter((d) => d.status === "announced").length;
  const completed = items.length - announced;

  return (
    <div>
      {/* The tracker BAR: an obvious selector that scrolls sideways as more
          trackers land (Anir: "it has to be obvious that that's there…
          horizontally scroll left and right"). M&A is the first resident. */}
      <div className="mb-4 flex items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-0.5">
          <button
            type="button"
            aria-pressed="true"
            className="flex shrink-0 cursor-default items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
          >
            <Handshake size={13} strokeWidth={2.2} /> M&A Tracker
          </button>
          <span
            title="More trackers join this bucket as they're built."
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-light px-3.5 py-1.5 text-[12px] font-medium text-text-tertiary"
          >
            More trackers coming
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.07)] px-2.5 py-1 text-[11.5px] font-semibold text-text-primary tnum">
            <Handshake size={11} strokeWidth={2.4} className="text-blue-primary" />
            {items.length} deals
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tnum"
            style={{ color: "#0071E3", background: "rgba(0,113,227,0.10)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0071E3]" />
            {announced} announced
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tnum"
            style={{ color: "#1A7A35", background: "rgba(26,122,53,0.10)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
            {completed} completed
          </span>
        </span>
      </div>

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
          growMaxWidth={340}
          growExpandedMaxWidth={460}
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <ColorSelect
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            ariaLabel="Filter by deal status"
            minWidth={150}
            options={[
              { value: "all", label: "All statuses", icon: Handshake },
              { value: "announced", label: "Announced", color: "#0071E3", icon: Megaphone },
              { value: "completed", label: "Completed", color: "#1A7A35", icon: CheckCircle2 },
            ]}
          />
          <ColorSelect
            value={division}
            onChange={(v) => setDivision(v as typeof division)}
            ariaLabel="Filter by division"
            minWidth={190}
            options={[
              { value: "all", label: "All divisions", icon: Layers },
              { value: "Medicinal Products", label: "Medicinal Products", color: "#0071E3", icon: Pill },
              { value: "Medical Devices", label: "Medical Devices", color: "#0F766E", icon: Stethoscope },
              { value: "Consumer", label: "Consumer", color: "#C2410C", icon: ShoppingBag },
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
