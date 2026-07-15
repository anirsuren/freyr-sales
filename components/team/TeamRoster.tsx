"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, ArrowRight, LayoutGrid, Table2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Badge } from "@/components/ui/Badge";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { HoverCard } from "@/components/ui/HoverCard";
import {
  DonutChart,
  DonutLegend,
  Sparkline,
  VIZ,
} from "@/components/charts/Charts";
import { formatMoney, STAGE_PROBABILITY, type Stage } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export type RosterRep = {
  name: string;
  slug: string;
  title: string;
  role: "Admin" | "Manager" | "Rep";
  region: string;
  phone: string;
  teamsUrl: string;
  openValue: number;
  weighted: number;
  openCount: number;
  meetings: number;
  quota: number;
  wonFY: number;
  trend: number[];
  stageValues: { stage: string; color: string; value: number; count: number }[];
  // The actual deals sitting in each stage — so a hovered slice / row shows the
  // real company + contact + value behind the number, not just the aggregate.
  stageDeals?: Record<string, { company: string; contact: string; value: number }[]>;
};

// The rep's biggest open deals across every stage — for the row-hover "Top open
// deals" list, so pointing at a rep surfaces what they're actually working.
function topOpenDeals(rep: RosterRep, n = 4) {
  return Object.values(rep.stageDeals ?? {})
    .flat()
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  Admin: { bg: "rgba(124,58,237,0.12)", color: "#6D28D9" },
  Manager: { bg: "rgba(0,113,227,0.12)", color: "#0040A0" },
  Rep: { bg: "rgba(5,150,105,0.12)", color: "#047857" },
};

// Attainment colour band — red under target, amber near, green ahead.
function attainColor(pct: number): string {
  if (pct >= 50) return "#1A7A35";
  if (pct >= 35) return "#B45309";
  return "#B02020";
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function TeamsButton({ url, name }: { url: string; name: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Message ${name.split(" ")[0]} on Teams`}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
    >
      <TeamsIcon size={15} />
      Teams
    </a>
  );
}

// Shared "what this rep is working" analytics — a donut (pipeline mix) with the
// count right after each stage. Used in the grid card's resting body and the
// table row's hover popover, so a rep reads the same story everywhere.
function StageDonut({ rep, size = 82 }: { rep: RosterRep; size?: number }) {
  const mix = rep.stageValues.filter((s) => s.value > 0);
  if (mix.length === 0) {
    return (
      <p className="text-[12px] text-text-tertiary py-3">No open pipeline yet.</p>
    );
  }
  const items = mix.map((s) => ({
    label: s.stage,
    value: s.value,
    color: s.color,
    // Hovering a slice shows the actual deals in that stage (Suren) — company
    // logo, name, contact, and value, straight from the rep's stageDeals.
    tip: (rep.stageDeals?.[s.stage] ?? []).map((d) => ({
      logo: d.company,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    })),
  }));
  return (
    <div className="flex items-center gap-3">
      <DonutChart
        segments={items}
        size={size}
        thickness={size > 78 ? 11 : 9}
        centerLabel={String(rep.openCount)}
        centerSub="deals"
      />
      <DonutLegend items={items} format="money" />
    </div>
  );
}

function TripleStat({ rep }: { rep: RosterRep }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { l: "Weighted", v: formatMoney(rep.weighted) },
        { l: "Open deals", v: String(rep.openCount) },
        { l: "Meetings", v: String(rep.meetings) },
      ].map((s) => (
        <div key={s.l} className="rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.01em] whitespace-nowrap text-text-tertiary">
            {s.l}
          </p>
          <p className="text-[14px] font-bold text-text-primary tnum leading-none mt-0.5">
            {s.v}
          </p>
        </div>
      ))}
    </div>
  );
}

const STAGE_DETAIL: Record<string, string> = {
  Prospect: "Early-stage account with no meaningful two-way engagement yet.",
  Engaged: "The account is responding and an active sales conversation has started.",
  Qualified: "Need, relevance, and buying potential have been confirmed.",
  "Meeting Booked": "A concrete sales meeting is scheduled with the account.",
};

function PipelineInspector({
  rep,
  focusedStage,
}: {
  rep: RosterRep;
  focusedStage: string | null;
}) {
  const total = rep.stageValues.reduce((sum, stage) => sum + stage.value, 0) || 1;
  const coverage = rep.quota ? Math.round((rep.openValue / rep.quota) * 100) : 0;
  const weightedRate = rep.openValue ? Math.round((rep.weighted / rep.openValue) * 100) : 0;
  const selected = rep.stageValues.find((stage) => stage.stage === focusedStage) || null;
  const deals = selected
    ? rep.stageDeals?.[selected.stage] ?? []
    : topOpenDeals(rep, 5);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-border-light pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            {selected ? `${selected.stage} pipeline` : "Open pipeline composition"}
          </p>
          <h3 className="mt-1 text-[16px] font-semibold text-text-primary">{rep.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">
            {selected
              ? STAGE_DETAIL[selected.stage]
              : `${rep.openCount} open deals distributed across the active sales stages.`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-bold leading-none text-text-primary tnum">
            {formatMoney(selected?.value ?? rep.openValue)}
          </p>
          <p className="mt-1 text-[10.5px] text-text-tertiary">
            {selected
              ? `${Math.round((selected.value / total) * 100)}% of ${formatMoney(rep.openValue)}`
              : "total open value"}
          </p>
        </div>
      </div>

      <div className="my-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface/55 px-2 py-2">
        {[
          { label: "Weighted forecast", value: formatMoney(rep.weighted), detail: `${weightedRate}% of open value` },
          { label: "Quota coverage", value: `${coverage}%`, detail: `${formatMoney(rep.quota)} annual quota` },
          { label: "Average deal", value: formatMoney(rep.openValue / Math.max(rep.openCount, 1)), detail: `${rep.openCount} open deals` },
        ].map((stat) => (
          <div key={stat.label} className="px-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">{stat.label}</p>
            <p className="mt-1 text-[15px] font-bold text-text-primary tnum">{stat.value}</p>
            <p className="mt-0.5 text-[10px] text-text-tertiary">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-border-light">
        <div className="grid grid-cols-[minmax(0,1fr)_78px_66px_76px] gap-2 bg-surface/60 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
          <span>Stage and share</span><span className="text-right">Value</span><span className="text-right">Win odds</span><span className="text-right">Weighted</span>
        </div>
        {rep.stageValues.filter((stage) => stage.value > 0).map((stage) => {
          const probability = STAGE_PROBABILITY[stage.stage as Stage] || 0;
          const isFocused = selected?.stage === stage.stage;
          const share = Math.round((stage.value / total) * 100);
          return (
            <div
              key={stage.stage}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_78px_66px_76px] items-center gap-2 border-t border-border-light px-3 py-2.5 transition-colors",
                isFocused && "bg-blue-light/35"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-[11.5px] font-semibold text-text-primary">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} />
                    <span className="truncate">{stage.stage}</span>
                    <span className="shrink-0 font-normal text-text-tertiary">{stage.count} {stage.count === 1 ? "deal" : "deals"}</span>
                  </span>
                  <span className="text-[10.5px] text-text-tertiary tnum">{share}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: stage.color }} />
                </div>
              </div>
              <span className="text-right text-[11.5px] font-semibold text-text-primary tnum">{formatMoney(stage.value)}</span>
              <span className="text-right text-[11px] text-text-secondary tnum">{Math.round(probability * 100)}%</span>
              <span className="text-right text-[11px] text-text-secondary tnum">{formatMoney(stage.value * probability)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 border-t border-border-light pt-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {selected ? `Deals in ${selected.stage}` : "Largest open deals"}
          </p>
          {selected && <span className="text-[10px] text-text-tertiary">{selected.count} total</span>}
        </div>
        {deals.length ? (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {deals.slice(0, 4).map((deal, index) => (
              <div key={`${deal.company}-${deal.contact}-${index}`} className="flex items-center gap-2 rounded-md bg-surface/60 px-2 py-1.5">
                <CompanyLogo name={deal.company} className="h-6 w-6 shrink-0 text-[7px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-text-primary">{deal.company}</span>
                  <span className="block truncate text-[9.5px] text-text-tertiary">{deal.contact}</span>
                </span>
                <span className="shrink-0 text-[10.5px] font-semibold text-text-secondary tnum">{formatMoney(deal.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 rounded-md bg-surface/60 px-3 py-2 text-[11px] text-text-tertiary">No deal-level records in this stage.</p>
        )}
      </div>
    </div>
  );
}

function PipelineBarInspector({ rep }: { rep: RosterRep }) {
  const [focusedStage, setFocusedStage] = useState<string | null>(null);
  const total = rep.stageValues.reduce((sum, stage) => sum + stage.value, 0) || 1;
  return (
    <HoverCard
      side="top"
      width={430}
      delayMs={0}
      className="w-[200px]"
      content={<PipelineInspector rep={rep} focusedStage={focusedStage} />}
    >
      <div
        className="group flex h-5 items-center rounded-full cursor-help"
        aria-label={`${rep.name} open pipeline: ${formatMoney(rep.openValue)}`}
      >
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface transition-all duration-200 group-hover:h-4 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]">
          {rep.stageValues.filter((stage) => stage.value > 0).map((stage) => (
            <button
              key={stage.stage}
              type="button"
              aria-label={`${stage.stage}: ${formatMoney(stage.value)}, ${Math.round((stage.value / total) * 100)}% of pipeline`}
              onMouseEnter={() => setFocusedStage(stage.stage)}
              onFocus={() => setFocusedStage(stage.stage)}
              className="h-full border-0 transition-[filter,box-shadow] hover:z-10 hover:brightness-110 hover:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.8)] focus:z-10 focus:outline-none focus:shadow-[inset_0_0_0_2px_white]"
              style={{ width: `${(stage.value / total) * 100}%`, background: stage.color }}
            />
          ))}
        </div>
      </div>
    </HoverCard>
  );
}

function ActivityInspector({ rep }: { rep: RosterRep }) {
  const total = rep.trend.reduce((sum, value) => sum + value, 0);
  const latest = rep.trend[rep.trend.length - 1] || 0;
  const previous = rep.trend[rep.trend.length - 2] || 0;
  const change = latest - previous;
  const average = rep.trend.length ? total / rep.trend.length : 0;
  const peak = Math.max(...rep.trend, 0);
  const max = Math.max(peak, 1);
  const MomentumIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const momentumColor = change > 0 ? "#1A7A35" : change < 0 ? "#B02020" : "#6E6E73";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-border-light pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Sales activity · last 10 weeks</p>
          <h3 className="mt-1 text-[16px] font-semibold text-text-primary">{rep.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">Logged calls, emails, meetings, and account touches by week.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5" style={{ color: momentumColor, background: `${momentumColor}12` }}>
          <MomentumIcon size={14} />
          <span className="text-[11px] font-semibold tnum">{change > 0 ? "+" : ""}{change} vs last week</span>
        </div>
      </div>

      <div className="my-3 grid grid-cols-4 gap-2">
        {[
          { label: "This week", value: String(latest), detail: "touches logged" },
          { label: "10-week total", value: String(total), detail: "all activity" },
          { label: "Weekly average", value: average.toFixed(1), detail: "touches per week" },
          { label: "Peak week", value: String(peak), detail: "highest volume" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-md border border-border-light bg-surface/55 px-2.5 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">{stat.label}</p>
            <p className="mt-1 text-[16px] font-bold text-text-primary tnum">{stat.value}</p>
            <p className="mt-0.5 text-[9.5px] text-text-tertiary">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border-light bg-surface/25 px-3 pb-2.5 pt-3">
        <div className="flex h-[128px] items-end gap-2">
          {rep.trend.map((value, index) => {
            const current = index === rep.trend.length - 1;
            return (
              <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                <span className="mb-1 text-[10px] font-semibold text-text-secondary tnum">{value}</span>
                <div
                  className={cn("mx-auto w-full max-w-[30px] rounded-t transition-all", current ? "bg-blue-primary" : "bg-blue-primary/45")}
                  style={{ height: `${Math.max(8, (value / max) * 86)}px` }}
                />
                <span className={cn("mt-1.5 whitespace-nowrap text-[8.5px]", current ? "font-semibold text-blue-primary" : "text-text-tertiary")}>
                  {current ? "Now" : `${rep.trend.length - 1 - index}w`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-text-tertiary">
        {latest > average
          ? `Current activity is ${(latest - average).toFixed(1)} touches above ${rep.name.split(" ")[0]}'s ten-week average.`
          : latest < average
          ? `Current activity is ${(average - latest).toFixed(1)} touches below ${rep.name.split(" ")[0]}'s ten-week average.`
          : "Current activity is exactly in line with the ten-week average."}
      </p>
    </div>
  );
}

function ActivityTrendInspector({ rep }: { rep: RosterRep }) {
  return (
    <HoverCard side="top" width={380} delayMs={0} content={<ActivityInspector rep={rep} />}>
      <div
        className="group w-[100px] cursor-help rounded-md p-1 transition-all hover:bg-blue-light/45 hover:shadow-[0_3px_10px_rgba(10,115,232,0.12)]"
        aria-label={`${rep.name} activity over the last 10 weeks`}
        tabIndex={0}
      >
        <div className="transition-transform duration-200 group-hover:scale-[1.04]">
          <Sparkline
            points={rep.trend}
            color={VIZ.blue}
            height={30}
            unit="touches"
            label={`${rep.name} activity`}
            xLabels={rep.trend.map((_, index) =>
              index === rep.trend.length - 1 ? "this week" : `${rep.trend.length - 1 - index}w ago`
            )}
          />
        </div>
      </div>
    </HoverCard>
  );
}

export function TeamRoster({ reps }: { reps: RosterRep[] }) {
  const [view, setView] = useState<"table" | "grid">("table");

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border-light flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            The sales floor{" "}
            <span className="text-text-tertiary tnum font-normal">({reps.length})</span>
          </h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Ranked by open pipeline. Message on Teams or call — click a rep for their full analytics.
          </p>
        </div>
        <div className="flex border border-border rounded-md overflow-hidden shrink-0">
          <button
            onClick={() => setView("grid")}
            aria-label="Grid view"
            title="Grid view"
            className={cn("p-2 transition-colors", view === "grid" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
          >
            <LayoutGrid size={16} strokeWidth={1.6} />
          </button>
          <button
            onClick={() => setView("table")}
            aria-label="Table view"
            title="Table view"
            className={cn("p-2 border-l border-border transition-colors", view === "table" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
          >
            <Table2 size={16} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* key=view re-mounts the panel so switching grid↔table fades/rises in
          (Suren: "switching between grid and table view should have animations"). */}
      <div key={view} className="page-in">
      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {reps.map((r) => {
            const rc = ROLE_COLOR[r.role];
            const pct = Math.round((r.wonFY / r.quota) * 100);
            const ac = attainColor(pct);
            const trendSum = r.trend.reduce((s, x) => s + x, 0);
            return (
              <HoverExpandCard
                key={r.name}
                summary={
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} className="w-11 h-11 text-[14px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {/* Stretched nav link — the whole card opens the rep. */}
                          <Link
                            href={`/analytics/reps/${r.slug}`}
                            className="min-w-0 text-[14.5px] font-semibold text-text-primary truncate group-hover:text-blue-primary outline-none rounded-sm after:absolute after:inset-0 after:content-['']"
                          >
                            {r.name}
                          </Link>
                          <Badge
                            label={r.role}
                            bg={rc.bg}
                            color={rc.color}
                            className="!normal-case tracking-normal !text-[10px] !px-1.5 !py-0 relative z-10"
                          />
                        </div>
                        <p className="text-[12px] text-text-secondary truncate">
                          {r.title} · {r.region}
                        </p>
                      </div>
                      <span className="relative z-10">
                        <TeamsButton url={r.teamsUrl} name={r.name} />
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Open pipeline
                        </p>
                        <p className="text-[17px] font-bold text-text-primary tnum leading-none mt-1">
                          {formatMoney(r.openValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Won FY26
                        </p>
                        <p className="text-[17px] font-bold tnum leading-none mt-1" style={{ color: "#1A7A35" }}>
                          {formatMoney(r.wonFY)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                          Quota {formatMoney(r.quota)}
                        </span>
                        <span className="text-[12px] font-bold tnum" style={{ color: ac }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                      </div>
                    </div>

                    {/* Clean at-a-glance card at rest — identity, headline
                        numbers, quota bar + the call action. The analytics
                        (pipeline mix, activity, stage bars, stats) reveal on
                        hover (Suren: "everything below the quota bar should
                        only show when I hover"). */}
                    <a
                      href={tel(r.phone)}
                      title={`Call ${r.phone}`}
                      className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-blue-primary transition-colors tnum w-fit"
                    >
                      <Phone size={12} strokeWidth={1.9} />
                      {r.phone}
                    </a>
                  </>
                }
                extra={
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                      Pipeline mix by stage
                    </p>
                    <div className="mb-3.5">
                      <StageDonut rep={r} />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        Activity · last 10 weeks
                      </p>
                      <p className="text-[11px] text-text-tertiary tnum">{trendSum} touches</p>
                    </div>
                    <Sparkline
                      points={r.trend}
                      color={VIZ.blue}
                      height={38}
                      unit="touches"
                      label={`${r.name} activity`}
                      xLabels={r.trend.map((_, i) =>
                        i === r.trend.length - 1 ? "this week" : `${r.trend.length - 1 - i}w ago`
                      )}
                    />
                    <div className="mt-3.5">
                      <TripleStat rep={r} />
                    </div>
                  </>
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary border-b border-border-light bg-surface/50">
                <th className="px-5 py-3">Rep</th>
                <th className="px-5 py-3">Reach</th>
                <th className="px-5 py-3 w-[230px]">Open pipeline</th>
                <th className="px-5 py-3 text-right">Weighted</th>
                <th className="px-5 py-3 text-right">Open deals</th>
                <th className="px-5 py-3 text-right">Meetings</th>
                <th className="px-5 py-3 w-[120px]">Activity · 10w</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {reps.map((r) => {
                const rc = ROLE_COLOR[r.role];
                const pct = Math.round((r.wonFY / r.quota) * 100);
                const ac = attainColor(pct);
                return (
                  <tr key={r.name} className="hover:bg-surface transition-colors">
                    <td className="px-5 py-3.5">
                      {/* Row hover popover (Suren: "on the rows page there's no
                          pop-up like the grid") — the rep's mix + headline stats. */}
                      <HoverCard
                        side="bottom"
                        // Wide two-column popup — 300px clipped the legend's
                        // share bars (Suren: "the bars are bleeding"). Left =
                        // the mix + headline stats, right = the deals + whether
                        // they're actually working them (activity trend).
                        width={460}
                        content={
                          <div>
                            <div className="flex items-center gap-2.5 mb-2.5">
                              <Avatar name={r.name} className="w-9 h-9 text-[12px]" />
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold text-text-primary truncate">
                                  {r.name}
                                </p>
                                <p className="text-[11.5px] text-text-tertiary truncate">
                                  {r.title} · {r.region}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                                Quota attainment
                              </span>
                              <span className="text-[12px] font-bold tnum" style={{ color: ac }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-3">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                                  Pipeline mix by stage
                                </p>
                                <div className="mb-3">
                                  <StageDonut rep={r} size={72} />
                                </div>
                                <TripleStat rep={r} />
                              </div>
                              <div className="border-l border-border-light pl-5">
                                {topOpenDeals(r).length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                                      Top open deals
                                    </p>
                                    <div className="space-y-1.5">
                                      {topOpenDeals(r).map((d, i) => (
                                        <div
                                          key={`${d.company}-${d.contact}-${i}`}
                                          className="flex items-center gap-2 text-[12px]"
                                        >
                                          <CompanyLogo
                                            name={d.company}
                                            className="w-[18px] h-[18px] text-[7px] shrink-0"
                                          />
                                          <span className="min-w-0 flex-1 leading-tight">
                                            <span className="block truncate font-medium text-text-primary">
                                              {d.company}
                                            </span>
                                            <span className="block truncate text-[10.5px] text-text-tertiary">
                                              {d.contact}
                                            </span>
                                          </span>
                                          <span className="tnum text-text-secondary shrink-0">
                                            {formatMoney(d.value)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                    Activity · last 10 weeks
                                  </p>
                                  <span className="text-[10.5px] text-text-tertiary tnum">
                                    {r.trend.reduce((s, x) => s + x, 0)} touches
                                  </span>
                                </div>
                                <Sparkline
                                  points={r.trend}
                                  height={34}
                                  unit="touches"
                                  label={`${r.name} activity`}
                                  xLabels={r.trend.map((_, index) =>
                                    index === r.trend.length - 1
                                      ? "this week"
                                      : `${r.trend.length - 1 - index}w ago`
                                  )}
                                />
                              </div>
                            </div>
                            <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                              View full breakdown →
                            </p>
                          </div>
                        }
                      >
                        <Link href={`/analytics/reps/${r.slug}`} className="flex items-center gap-3 group">
                          <Avatar name={r.name} className="w-10 h-10 text-[13px] shrink-0" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary truncate">
                                {r.name}
                              </span>
                              <Badge label={r.role} bg={rc.bg} color={rc.color} className="!normal-case tracking-normal !text-[10px] !px-1.5 !py-0" />
                            </span>
                            <span className="block text-[12px] text-text-secondary truncate">
                              {r.title} · {r.region}
                            </span>
                          </span>
                        </Link>
                      </HoverCard>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <TeamsButton url={r.teamsUrl} name={r.name} />
                        <a
                          href={tel(r.phone)}
                          title={`Call ${r.phone}`}
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors tnum whitespace-nowrap"
                        >
                          <Phone size={13} strokeWidth={2} />
                          {r.phone}
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-[14px] font-semibold text-text-primary tnum">
                        {formatMoney(r.openValue)}
                      </p>
                      <div className="mt-0.5">
                        <PipelineBarInspector rep={r} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                      {formatMoney(r.weighted)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] text-text-secondary tnum">
                      {r.openCount}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] text-text-secondary tnum">
                      {r.meetings}
                    </td>
                    <td className="px-5 py-3.5">
                      <ActivityTrendInspector rep={r} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/analytics/reps/${r.slug}`}
                        aria-label={`Open ${r.name}'s analytics`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-blue-primary hover:bg-blue-light/50 transition-colors"
                      >
                        <ArrowRight size={16} strokeWidth={1.9} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </Card>
  );
}
