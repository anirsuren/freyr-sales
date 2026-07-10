import Link from "next/link";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { BarChart, VIZ, VIZ_SERIES } from "@/components/charts/Charts";
import { ForecastExport } from "@/components/forecast/ForecastExport";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import { CircleCheck, TrendingUp, Target, Flag, type LucideIcon } from "lucide-react";
import {
  buildDeals,
  STAGES,
  STAGE_PROBABILITY,
  REPS,
  CURRENT_REP,
  formatMoney,
} from "@/lib/pipeline";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const QUOTA = 3_000_000;

export default async function ForecastPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const deals = buildDeals(sessions, customers, contacts, interactions);
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const bestCase = open.reduce((s, d) => s + d.value, 0);
  const commit = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  // True attainment for the labels — best case can exceed 100% of quota, which
  // is good news worth showing, not capping away. The bars below cap at 100% so
  // they never overflow the track.
  const commitPct = Math.round((commit / QUOTA) * 100);
  const bestPct = Math.round((bestCase / QUOTA) * 100);
  const commitBar = Math.min(100, commitPct);
  const bestBar = Math.min(100, bestPct);
  const gap = Math.max(0, QUOTA - commit);

  const byStage = STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stage === stage);
    const value = ds.reduce((s, d) => s + d.value, 0);
    return {
      stage,
      count: ds.length,
      value,
      weighted: value * (STAGE_PROBABILITY[stage] ?? 0),
      prob: Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100),
    };
  });

  const byRep = REPS.map((name) => {
    const rd = open.filter((d) => d.owner === name);
    const repOpen = rd.reduce((s, d) => s + d.value, 0);
    const repWeighted = deals
      .filter((d) => d.owner === name)
      .reduce((s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0), 0);
    return {
      name,
      open: repOpen,
      weighted: repWeighted,
      pct: Math.round((repWeighted / QUOTA) * 100),
    };
  }).sort((a, b) => b.weighted - a.weighted);

  const Stat = ({
    label,
    value,
    raw,
    accent,
    hint,
    icon: Icon,
  }: {
    label: string;
    value: string;
    raw?: number;
    accent?: boolean;
    hint?: string;
    icon: LucideIcon;
  }) => (
    <Card className="h-[136px] flex flex-col">
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mb-3 ${
          accent
            ? "bg-blue-primary text-white"
            : "bg-blue-light text-blue-primary"
        }`}
      >
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary inline-flex items-center gap-1">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      <span
        className={`mt-auto text-[28px] font-bold leading-none tnum ${
          accent ? "text-blue-primary" : "text-text-primary"
        }`}
      >
        {raw != null ? <CountUp value={raw} unit="money" /> : value}
      </span>
    </Card>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Forecast"
        subtitle="How much revenue you're likely to land this quarter, and how that tracks against your target."
        action={
          <ForecastExport
            commit={commit}
            bestCase={bestCase}
            quota={QUOTA}
            gap={gap}
            byStage={byStage}
            byRep={byRep}
          />
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat
          label="Commit (weighted)"
          value={formatMoney(commit)}
          raw={commit}
          accent
          icon={CircleCheck}
          hint="The realistic number — every open deal's value multiplied by its chance of closing, added up. What you can reasonably promise."
        />
        <Stat
          label="Best case (open)"
          value={formatMoney(bestCase)}
          raw={bestCase}
          icon={TrendingUp}
          hint="The optimistic number — the full value of every open deal if they ALL closed. The ceiling, not the expectation."
        />
        <Stat
          label="Quarter quota"
          value={formatMoney(QUOTA)}
          raw={QUOTA}
          icon={Target}
          hint="Your revenue target for the quarter."
        />
        <Stat
          label="Gap to quota"
          value={formatMoney(gap)}
          raw={gap}
          icon={Flag}
          hint="How much more committed revenue you need to hit the target."
        />
      </section>

      {/* Quota attainment bar */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Quota attainment
            </h2>
            <InfoHint text="The solid blue is your realistic (committed) forecast; the lighter blue behind it is the optimistic ceiling. The further they stretch to the right, the closer you are to target." />
          </span>
          <span className="text-[13px] text-text-secondary tnum">
            {commitPct}% committed · {bestPct}% best case
          </span>
        </div>
        <div className="relative h-4 rounded-full bg-surface overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-subtle"
            style={{ width: `${bestBar}%` }}
            title={`Best case ${formatMoney(bestCase)}`}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary"
            style={{ width: `${commitBar}%` }}
            title={`Commit ${formatMoney(commit)}`}
          />
        </div>
        <div className="flex gap-4 mt-2 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary" /> Commit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-subtle" /> Best case
          </span>
          <span className="ml-auto tnum">Quota {formatMoney(QUOTA)}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* By stage */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-1.5 px-5 pt-4 pb-2.5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              By stage
            </h2>
            <InfoHint text="Your pipeline split out by step of the process. 'Value' is the full amount; 'Weighted' trims it by each step's odds of closing — the realistic contribution to your number." />
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface border-b border-border-light">
                {["Stage", "Deals", "Value", "Weighted"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {byStage.map((s, i) => (
                <tr key={s.stage}>
                  <td className="px-5 py-3 text-[13px] text-text-primary">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: VIZ_SERIES[i % VIZ_SERIES.length] }}
                      />
                      {s.stage}
                      <span className="text-text-tertiary tnum">· {s.prob}%</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-text-secondary tnum">
                    {s.count}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-text-secondary tnum">
                    {formatMoney(s.value)}
                  </td>
                  <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum">
                    {formatMoney(s.weighted)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* By rep */}
        <Card>
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="text-[15px] font-semibold text-text-primary">
              By rep
            </h2>
            <InfoHint text="Each teammate's realistic (weighted) forecast and how much of the team target it covers." />
          </div>
          {/* Full-width bars with each rep's photo (so you know who's who) —
              click a bar to open that rep's breakdown. */}
          <div className="flex items-stretch justify-around gap-3 h-[200px]">
            {(() => {
              const max = Math.max(...byRep.map((r) => r.weighted), 1);
              return byRep.map((r, i) => {
                const first = r.name.split(" ")[0];
                const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                return (
                  <Link
                    key={r.name}
                    href={`/analytics/reps/${slug}`}
                    className="group flex flex-col items-center gap-2 h-full flex-1 max-w-[120px]"
                    title={`${r.name} · ${formatMoney(r.weighted)} weighted`}
                  >
                    {/* Bar grows within its own region so the tallest bar can't
                        push the photo + name past the card edge (clipping). */}
                    <div className="flex-1 min-h-0 w-full flex flex-col justify-end items-center gap-1">
                      <span className="text-[12px] font-semibold tnum text-text-secondary">
                        {formatMoney(r.weighted)}
                      </span>
                      <div
                        className="w-9 rounded-t-md transition-opacity group-hover:opacity-80"
                        style={{
                          height: `${Math.max((r.weighted / max) * 100, 4)}%`,
                          minHeight: 6,
                          background: VIZ_SERIES[i % VIZ_SERIES.length],
                        }}
                      />
                    </div>
                    <Avatar name={r.name} className="w-7 h-7 text-[9px] shrink-0" />
                    <span className="text-[11px] text-text-tertiary text-center truncate max-w-[100px] group-hover:text-blue-primary shrink-0">
                      {r.name === CURRENT_REP ? `${first} (you)` : first}
                    </span>
                  </Link>
                );
              });
            })()}
          </div>
          <p className="text-[12px] text-text-tertiary mt-4">
            Weighted pipeline per teammate — click a rep for their full breakdown.
          </p>
        </Card>
      </div>
    </div>
  );
}
