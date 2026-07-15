"use client";

import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { Avatar } from "@/components/ui/Avatar";
import {
  STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  formatMoney,
  type Stage,
} from "@/lib/pipeline";
import { formatDate, formatDateTime } from "@/lib/utils";

export type CustomerDealRowData = {
  id: string;
  href?: string;
  name: string;
  stage: string;
  value: number;
  offering?: string | null;
  contact?: string | null;
  owner?: string | null;
  createdAt: string;
  lastActivity?: string | null;
  closeDate?: string | null;
  nextStep?: string | null;
  notes?: string | null;
};

function stageDetails(stageName: string) {
  const stage = STAGES.includes(stageName as Stage)
    ? (stageName as Stage)
    : "Prospect";
  return {
    stage,
    color: STAGE_COLOR[stage],
    probability: STAGE_PROBABILITY[stage],
  };
}

export function CustomerDealRow({ deal }: { deal: CustomerDealRowData }) {
  const { stage, color, probability } = stageDetails(deal.stage);
  const weighted = Math.round(deal.value * probability);
  const upside = Math.max(0, deal.value - weighted);
  const currentStageIndex = STAGES.indexOf(stage);

  const summary = (
    <div
      data-deal-row={deal.id}
      className="grid min-h-[76px] grid-cols-[minmax(230px,1.8fr)_105px_100px_minmax(138px,.8fr)_18px] items-center gap-3"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ color, background: `${color}16` }}
        >
          <BriefcaseBusiness size={16} strokeWidth={1.9} />
        </span>
        <span className="min-w-0">
          <span className="block line-clamp-2 text-[14px] font-semibold leading-[1.25] text-text-primary">
            {deal.name}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">
            {deal.offering || "Commercial opportunity"}
          </span>
        </span>
      </span>

      <span className="min-w-0">
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-semibold"
          style={{ color, background: `${color}14` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{stage}</span>
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface">
          <span
            className="block h-full rounded-full"
            style={{ width: `${probability * 100}%`, background: color }}
          />
        </span>
      </span>

      <span>
        <span className="block text-[16px] font-bold leading-none text-text-primary tnum">
          {formatMoney(deal.value)}
        </span>
        <span className="mt-1 block text-[10.5px] text-text-tertiary tnum">
          {formatMoney(weighted)} weighted
        </span>
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-text-secondary">
          <Avatar
            name={deal.contact || deal.owner || "Unassigned"}
            className="h-7 w-7 shrink-0 text-[9px]"
          />
          <span className="truncate">{deal.contact || deal.owner || "No contact"}</span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
          <Clock3 size={11} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">
            {deal.lastActivity
              ? formatDateTime(deal.lastActivity)
              : `Added ${formatDate(deal.createdAt)}`}
          </span>
        </span>
      </span>

      <ChevronRight size={16} strokeWidth={1.8} className="text-text-tertiary" />
    </div>
  );

  const extra = (
    <div className="grid grid-cols-[1.1fr_1fr_1.15fr] gap-5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Pipeline position
        </p>
        <div className="relative mt-4 flex items-center justify-between">
          <span className="absolute left-2 right-2 top-2 h-px bg-border-light" />
          {STAGES.map((item, index) => {
            const reached = index <= currentStageIndex;
            const itemColor = STAGE_COLOR[item];
            return (
              <span key={item} className="relative z-10 flex flex-col items-center gap-1.5">
                <span
                  className="h-4 w-4 rounded-full border-[3px] border-white shadow-sm"
                  style={{ background: reached ? itemColor : "#DCE1E8" }}
                />
                <span
                  className="max-w-[58px] text-center text-[9px] font-medium leading-tight"
                  style={{ color: item === stage ? itemColor : "#8E98A8" }}
                >
                  {item === "Meeting Booked" ? "Meeting" : item.replace("Closed ", "")}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 border-l border-border-light pl-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Value profile
        </p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-[18px] font-bold text-text-primary tnum">{formatMoney(weighted)}</span>
          <span className="text-[11px] text-text-tertiary">{Math.round(probability * 100)}% likely</span>
        </div>
        <div className="mt-2 flex h-3 overflow-hidden rounded bg-surface">
          <span style={{ width: `${probability * 100}%`, background: color }} />
          <span className="bg-border-light/70" style={{ width: `${(1 - probability) * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10.5px] text-text-tertiary">
          <span>Weighted {formatMoney(weighted)}</span>
          <span>Upside {formatMoney(upside)}</span>
        </div>
      </div>

      <div className="min-w-0 border-l border-border-light pl-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Timing and next move
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.04em] text-text-tertiary">
              <CalendarClock size={11} /> Expected close
            </span>
            <span className="mt-1 block text-[11.5px] font-semibold text-text-primary">
              {deal.closeDate ? formatDate(deal.closeDate) : "Not scheduled"}
            </span>
          </span>
          <span className="min-w-0">
            <span className="text-[9.5px] uppercase tracking-[0.04em] text-text-tertiary">Owner</span>
            <span className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] font-semibold text-text-primary">
              <Avatar
                name={deal.owner || "Unassigned"}
                className="h-6 w-6 shrink-0 text-[8px]"
              />
              <span className="truncate">{deal.owner || "Unassigned"}</span>
            </span>
          </span>
        </div>
        <p className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-text-secondary">
          {deal.nextStep || deal.notes || "Open the deal to review the latest context and choose the next action."}
        </p>
      </div>
    </div>
  );

  return (
    <HoverExpandCard
      className="h-full"
      href={deal.href}
      summary={summary}
      extra={extra}
    />
  );
}
