"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ArrowRight, DollarSign, TrendingUp, Target, CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { DonutChart, BarChart } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";
import { formatMoney, CURRENT_REP, type RepStat } from "@/lib/pipeline";

export type { RepStat };

const RANGES = [
  { k: "7d", l: "7D", name: "Last 7 days" },
  { k: "30d", l: "30D", name: "Last 30 days" },
  { k: "90d", l: "90D", name: "Last 90 days" },
  { k: "all", l: "All", name: "All time" },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState(range);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setSelectedRange(range), [range]);

  const rangeName = RANGES.find((item) => item.k === selectedRange)?.name ?? "All time";
  const rangeContext =
    selectedRange === "all"
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
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">
            Rep performance
          </h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Pipeline created {rangeContext}, ranked by owner. Click a rep to expand their breakdown.
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-light transition-opacity",
            isPending && "opacity-70"
          )}
          aria-label="Rep performance date range"
        >
          {RANGES.map((r) => (
            <button
              key={r.k}
              type="button"
              aria-label={r.name}
              aria-pressed={selectedRange === r.k}
              onClick={() => {
                setSelectedRange(r.k);
                startTransition(() => {
                  router.push(`/analytics?range=${r.k}`, { scroll: false });
                });
              }}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.05em] transition-[color,background-color,box-shadow]",
                selectedRange === r.k
                  ? "bg-blue-primary shadow-sm text-white"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {r.l}
            </button>
          ))}
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
            const total = rep.openValue || 1;
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
                    <div className="mt-2 h-2.5 rounded-full bg-surface overflow-hidden flex max-w-[440px]">
                      {rep.stageValues
                        .filter((s) => s.value > 0)
                        .map((s) => (
                          <div
                            key={s.stage}
                            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                            title={`${s.stage}: ${formatMoney(s.value)} (${s.count})`}
                          />
                        ))}
                    </div>
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
