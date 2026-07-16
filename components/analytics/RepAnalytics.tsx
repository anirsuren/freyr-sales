"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight, DollarSign, TrendingUp, Target, CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { DonutChart, BarChart } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  CURRENT_REP,
  STAGE_PROBABILITY,
  type RepStat,
  type Stage,
} from "@/lib/pipeline";

export type { RepStat };

const RANGES = [
  { k: "7d", l: "7D", name: "Last 7 days" },
  { k: "30d", l: "30D", name: "Last 30 days" },
  { k: "90d", l: "90D", name: "Last 90 days" },
  { k: "all", l: "All", name: "All time" },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type StageDeal = { company: string; contact: string; value: number };

const STAGE_CONTEXT: Record<string, string> = {
  Prospect: "Early-stage accounts that still need meaningful two-way engagement.",
  Engaged: "Active conversations where the account is responding to outreach.",
  Qualified: "Opportunities with confirmed need, relevance, and buying potential.",
  "Meeting Booked": "Opportunities with a concrete sales meeting already scheduled.",
};

function RepPipelineBar({
  rep,
  stageDeals,
}: {
  rep: RepStat;
  stageDeals?: Record<string, StageDeal[]>;
}) {
  const visibleStages = rep.stageValues.filter((stage) => stage.value > 0);
  const total = rep.openValue || 1;

  if (visibleStages.length === 0) {
    return (
      <div className="mt-2 h-2.5 max-w-[440px] rounded-full bg-surface" />
    );
  }

  return (
    <div
      data-testid="rep-pipeline-stage-bar"
      className="group mt-2 flex h-5 max-w-[440px] cursor-help items-center rounded-full"
      aria-label={`${rep.name} open pipeline composition`}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface transition-all duration-150 group-hover:h-4 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]">
        {visibleStages.map((stage) => {
          const share = Math.round((stage.value / total) * 100);
          const probability = STAGE_PROBABILITY[stage.stage as Stage] ?? 0;
          const deals = stageDeals?.[stage.stage] ?? [];
          const content = (
            <div data-testid="rep-stage-hover-card">
              <div className="flex items-center gap-2.5">
                <Avatar
                  name={rep.name}
                  className="h-10 w-10 shrink-0 text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text-primary">
                    {rep.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: stage.color }}
                    />
                    {stage.stage}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[17px] font-bold leading-none text-text-primary tnum">
                    {formatMoney(stage.value)}
                  </p>
                  <p className="mt-1 text-[9.5px] text-text-tertiary tnum">
                    {share}% of pipeline
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-lg bg-surface/60 py-2">
                {[
                  {
                    label: "Deals",
                    value: String(stage.count),
                  },
                  {
                    label: "Win odds",
                    value: `${Math.round(probability * 100)}%`,
                  },
                  {
                    label: "Weighted",
                    value: formatMoney(stage.value * probability),
                  },
                ].map((stat) => (
                  <div key={stat.label} className="px-2 text-center">
                    <p className="text-[8.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                      {stat.label}
                    </p>
                    <p className="mt-0.5 text-[13px] font-bold text-text-primary tnum">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {deals.length > 0 ? (
                <div className="mt-2.5 border-t border-border-light pt-2.5">
                  <p className="text-[8.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    Top opportunities
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {deals.slice(0, 2).map((deal, index) => (
                      <div
                        key={`${deal.company}-${deal.contact}-${index}`}
                        className="flex min-w-0 items-center gap-1.5 rounded-md bg-surface/60 px-1.5 py-1.5"
                      >
                        <CompanyLogo
                          name={deal.company}
                          className="h-6 w-6 shrink-0 text-[6px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[9.5px] font-semibold text-text-primary">
                            {deal.company}
                          </span>
                          <span className="block truncate text-[8.5px] text-text-tertiary">
                            {formatMoney(deal.value)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2.5 truncate border-t border-border-light pt-2.5 text-[9.5px] text-text-tertiary">
                  {STAGE_CONTEXT[stage.stage]}
                </p>
              )}
            </div>
          );

          return (
            <div
              key={stage.stage}
              className="h-full min-w-0"
              style={{ width: `${(stage.value / total) * 100}%` }}
            >
              <HoverCard
                side="top"
                width={310}
                delayMs={0}
                className="h-full w-full"
                content={content}
              >
                <span
                  data-testid="rep-pipeline-stage-segment"
                  aria-label={`${rep.name} ${stage.stage}: ${formatMoney(stage.value)}, ${stage.count} ${stage.count === 1 ? "deal" : "deals"}`}
                  className="block h-full w-full transition-[filter,box-shadow] hover:z-10 hover:brightness-110 hover:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.85)]"
                  style={{ background: stage.color }}
                />
              </HoverCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RepAnalytics({
  reps,
  range,
  repStageDeals,
}: {
  reps: RepStat[];
  range: string;
  // The deals behind each rep's stage, keyed rep name → stage → deals, so the
  // per-rep charts can show WHO's in each bar/segment on hover (Suren).
  repStageDeals?: Record<
    string,
    Record<string, { company: string; contact: string; value: number }[]>
  >;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rangeName = RANGES.find((item) => item.k === range)?.name ?? "All time";
  const rangeContext =
    range === "all"
      ? "across all recorded history"
      : `in the ${rangeName.toLowerCase()}`;

  // Team roll-up for the supervisor lens — the whole floor at a glance.
  const team = useMemo(() => {
    const openPipe = reps.reduce((s, r) => s + r.openValue, 0);
    const weighted = reps.reduce((s, r) => s + r.weighted, 0);
    const meetings = reps.reduce((s, r) => s + r.meetings, 0);
    const qualified = reps.reduce((s, r) => s + r.qualifiedPlus, 0);
    return { openPipe, weighted, meetings, qualified, count: reps.length };
  }, [reps]);

  const teamStats = [
    { label: "Team pipeline", value: formatMoney(team.openPipe), icon: DollarSign },
    { label: "Weighted", value: formatMoney(team.weighted), icon: TrendingUp },
    { label: "Qualified+", value: String(team.qualified), icon: Target },
    { label: "Meetings", value: String(team.meetings), icon: CalendarCheck },
    { label: "Reps", value: String(team.count), icon: null },
  ];

  // Team maxima so each rep's KPI card can show a mini bar — where this rep
  // ranks vs the best on the floor ("a chart, not just the number" — Suren).
  const maxOf = (sel: (r: RepStat) => number) => Math.max(1, ...reps.map(sel));
  const teamMax = {
    weighted: maxOf((r) => r.weighted),
    avgDeal: maxOf((r) => r.avgDeal),
    qualifiedPlus: maxOf((r) => r.qualifiedPlus),
    meetings: maxOf((r) => r.meetings),
  };

  return (
    <Card>
      <div className="mb-4">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">
            Rep performance
          </h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Pipeline created {rangeContext}, ranked by owner. Click a rep to expand their breakdown.
          </p>
        </div>
      </div>

      {/* Team roll-up strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
        {teamStats.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="rounded-xl border border-border-light bg-surface/40 px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {Icon && <Icon size={12} strokeWidth={2} className="text-text-tertiary" />}
                {t.label}
              </p>
              <p className="text-[17px] font-bold text-text-primary tnum leading-none mt-1">
                {t.value}
              </p>
            </div>
          );
        })}
      </div>

      {reps.length === 0 ? (
        <p className="text-[13px] text-text-secondary py-4">
          No rep activity in this period.
        </p>
      ) : (
        // ~6–7 rows tall, the rest scroll inside (Suren: "show 6–7, scroll the
        // other reps, expand any of them inline").
        <div className="max-h-[620px] overflow-y-auto -mx-2 px-2 divide-y divide-border-light">
          {reps.map((rep, i) => {
            const isOpen = open === rep.name;
            const you = rep.name === CURRENT_REP;
            const slug = slugify(rep.name);
            const kpis = [
              { label: "Weighted", value: formatMoney(rep.weighted) },
              { label: "Avg deal", value: formatMoney(rep.avgDeal) },
              { label: "Qualified+", value: String(rep.qualifiedPlus) },
              { label: "Meetings", value: String(rep.meetings) },
            ];
            // Same four KPIs, each with a mini bar = this rep vs the team best.
            const kpiViz = [
              { label: "Weighted", value: formatMoney(rep.weighted), pct: Math.round((rep.weighted / teamMax.weighted) * 100), color: "#0071E3" },
              { label: "Avg deal", value: formatMoney(rep.avgDeal), pct: Math.round((rep.avgDeal / teamMax.avgDeal) * 100), color: "#7C3AED" },
              { label: "Qualified+", value: String(rep.qualifiedPlus), pct: Math.round((rep.qualifiedPlus / teamMax.qualifiedPlus) * 100), color: "#1A7A35" },
              { label: "Meetings", value: String(rep.meetings), pct: Math.round((rep.meetings / teamMax.meetings) * 100), color: "#B45309" },
            ];
            return (
              <div key={rep.name}>
                {/* Collapsed row — click to expand */}
                <button
                  onClick={() => setOpen(isOpen ? null : rep.name)}
                  aria-expanded={isOpen}
                  className={cn(
                    "w-full text-left flex items-center gap-4 py-3.5 rounded-xl px-2 -mx-2 transition-colors",
                    isOpen ? "bg-surface/60" : "hover:bg-surface/50"
                  )}
                >
                  <span className="w-5 text-[15px] font-bold text-text-tertiary tnum text-center shrink-0">
                    {i + 1}
                  </span>
                  <Avatar name={rep.name} className="w-11 h-11 text-[14px] shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14.5px] font-semibold text-text-primary truncate">
                        {rep.name}
                      </span>
                      {you && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-text-tertiary tnum mt-0.5">
                      {rep.openCount} open deal{rep.openCount === 1 ? "" : "s"} ·{" "}
                      {rep.deals} total owned
                    </p>
                    <RepPipelineBar
                      rep={rep}
                      stageDeals={repStageDeals?.[rep.name]}
                    />
                  </div>

                  {/* KPI cluster */}
                  <div className="hidden lg:flex items-center gap-6 shrink-0 self-stretch pl-5 border-l border-border-light">
                    {kpis.map((kpi) => (
                      <div key={kpi.label} className="flex flex-col justify-center text-right min-w-[58px]">
                        <p className="text-[15px] font-bold text-text-primary tnum leading-none">
                          {kpi.value}
                        </p>
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mt-1">
                          {kpi.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Headline + chevron */}
                  <div className="text-right shrink-0 hidden sm:flex flex-col justify-center pl-5 lg:border-l lg:border-border-light self-stretch">
                    <p className="text-[19px] font-bold text-text-primary tnum leading-none">
                      {formatMoney(rep.openValue)}
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mt-1">
                      open pipeline
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    strokeWidth={2}
                    className={cn(
                      "text-text-tertiary shrink-0 transition-transform",
                      isOpen && "rotate-180 text-blue-primary"
                    )}
                  />
                </button>

                {/* Expanded drawer — KPI mini-charts + two full-width graphs,
                    no dead white space (Suren's audit). */}
                {isOpen && (
                  <div className="tab-panel pb-4 pt-1 px-2">
                    <div className="rounded-xl border border-border-light bg-surface/30 p-4 space-y-4">
                      {/* KPIs — each carries a mini bar vs the team best, not
                          just a bare number. */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {kpiViz.map((k) => (
                          <div
                            key={k.label}
                            className="rounded-xl bg-white border border-border-light px-3.5 py-3"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                              {k.label}
                            </p>
                            <p className="text-[20px] font-bold text-text-primary tnum leading-none mt-1">
                              {k.value}
                            </p>
                            <div className="mt-2.5 h-1.5 rounded-full bg-surface overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${Math.max(k.pct, 3)}%`, background: k.color }}
                              />
                            </div>
                            <p className="text-[10px] text-text-tertiary mt-1.5 tnum">
                              {k.pct}% of team best
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Two charts, half width each, filling the row */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl bg-white border border-border-light p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
                            Pipeline value by stage
                          </p>
                          <BarChart
                            data={rep.stageValues.map((s) => ({
                              label: s.stage.replace("Meeting Booked", "Meeting"),
                              value: s.value,
                              color: s.color,
                              // WHO's in this stage for this rep — logo + company
                              // + contact + value (Suren: every graph shows who).
                              tip: (repStageDeals?.[rep.name]?.[s.stage] ?? []).map((d) => ({
                                logo: d.company,
                                name: d.company,
                                sub: d.contact,
                                value: formatMoney(d.value),
                              })),
                            }))}
                            height={180}
                            format="money"
                          />
                        </div>
                        <div className="rounded-xl bg-white border border-border-light p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
                            Deals by stage
                          </p>
                          <div className="flex items-center gap-5 h-[180px]">
                            <DonutChart
                              segments={rep.stageValues
                                .filter((s) => s.count > 0)
                                .map((s) => ({
                                  label: s.stage,
                                  value: s.count,
                                  color: s.color,
                                  // WHO's in this stage for this rep.
                                  tip: (repStageDeals?.[rep.name]?.[s.stage] ?? []).map((d) => ({
                                    logo: d.company,
                                    name: d.company,
                                    sub: d.contact,
                                    value: formatMoney(d.value),
                                  })),
                                }))}
                              size={130}
                              thickness={15}
                              centerLabel={String(rep.openCount)}
                              centerSub="open"
                            />
                            <div className="space-y-2 min-w-0 flex-1">
                              {rep.stageValues
                                .filter((s) => s.count > 0)
                                .map((s) => (
                                  <p
                                    key={s.stage}
                                    className="flex items-center gap-1.5 text-[12.5px] text-text-secondary"
                                  >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                                    {s.stage}
                                    <span className="font-semibold text-text-primary tnum ml-auto pl-2">
                                      {s.count}
                                    </span>
                                  </p>
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Link
                          href={`/analytics/reps/${slug}`}
                          className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors"
                        >
                          Open {rep.name.split(" ")[0]}&apos;s full page
                          <ArrowRight size={14} strokeWidth={2} />
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
