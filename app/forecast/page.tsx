import Link from "next/link";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ForecastExport } from "@/components/forecast/ForecastExport";
import { ByRepChart } from "@/components/forecast/ByRepChart";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleCheck,
  Clock3,
  Flag,
  ShieldAlert,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  buildDeals,
  ROTTING_DAYS,
  STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  SALES_TEAM,
  repForecast,
  formatMoney,
} from "@/lib/pipeline";
import { getDataMode } from "@/lib/dataMode";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const QUOTA = 3_000_000;

// Representative open deals for a rep who has no real ones in the seed (the
// synthetic roster) — so hovering ANY rep's bar shows the deals behind it, not
// a dead end. Deterministic from the rep name so it never shuffles on reload.
function synthDealsForRep(
  name: string,
  openValue: number,
  customers: { id: string; company_name: string }[],
  contacts: { customer_id: string; full_name: string }[]
) {
  if (openValue <= 0 || customers.length === 0) return [];
  const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const splits = [0.42, 0.31, 0.27];
  return splits.map((frac, k) => {
    const cust = customers[(seed + k * 5) % customers.length];
    const contact = contacts.find((c) => c.customer_id === cust.id);
    return {
      company: cust.company_name,
      contact: contact?.full_name || "Primary contact",
      value: Math.round((openValue * frac) / 1000) * 1000,
    };
  });
}

export default async function ForecastPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const deals = buildDeals(sessions, customers, contacts, interactions);
  if (getDataMode() === "live" && deals.length === 0) {
    return <EmptyState icon={Target} title="No forecast yet" description="Add an account and create the first deal to start your real forecast." />;
  }
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
  const forecastConfidence = bestCase > 0 ? Math.round((commit / bestCase) * 100) : 0;
  const staleOpen = open.filter((deal) => deal.staleDays > ROTTING_DAYS);
  const riskWeighted = staleOpen.reduce(
    (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
    0
  );
  const activeWeighted = Math.max(0, commit - riskWeighted);
  const riskPct = commit > 0 ? Math.round((riskWeighted / commit) * 100) : 0;
  const lateStageWeighted = open
    .filter((deal) => deal.stage === "Qualified" || deal.stage === "Meeting Booked")
    .reduce(
      (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
      0
    );
  const lateStagePct = commit > 0 ? Math.round((lateStageWeighted / commit) * 100) : 0;
  const priorityDeals = [...open]
    .sort(
      (a, b) =>
        b.value * (STAGE_PROBABILITY[b.stage] ?? 0) -
        a.value * (STAGE_PROBABILITY[a.stage] ?? 0)
    )
    .slice(0, 5);
  const topThreeWeighted = priorityDeals
    .slice(0, 3)
    .reduce(
      (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
      0
    );
  const concentrationPct = commit > 0 ? Math.round((topThreeWeighted / commit) * 100) : 0;

  const byStage = STAGES.map((stage) => {
    const ds = deals
      .filter((d) => d.stage === stage)
      .sort((a, b) => b.value - a.value);
    const value = ds.reduce((s, d) => s + d.value, 0);
    return {
      stage,
      count: ds.length,
      value,
      weighted: value * (STAGE_PROBABILITY[stage] ?? 0),
      prob: Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100),
      // The actual deals sitting in this stage — so any graph built from this
      // can show WHICH deals on hover (Suren), not just the totals.
      deals: ds.map((d) => ({
        company: d.company,
        contact: d.contactName,
        value: d.value,
      })),
    };
  });

  // The whole sales floor (Suren: 20 reps, "it has to look full"). Reps who own
  // real deals use those numbers; the rest of the roster gets a deterministic
  // mock forecast so every teammate has a full, believable pipeline.
  const byRep = SALES_TEAM.map((name) => {
    const realOpen = open
      .filter((d) => d.owner === name)
      .reduce((s, d) => s + d.value, 0);
    const realWeighted = deals
      .filter((d) => d.owner === name)
      .reduce((s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0), 0);
    const synth = repForecast(name);
    const weighted = realWeighted > 0 ? realWeighted : synth.weighted;
    const repOpen = realOpen > 0 ? realOpen : synth.open;
    // This rep's actual open deals — so hovering their bar shows what they're
    // working, not just the total (Suren). Synthetic reps have none.
    const realRepDeals = deals
      .filter((d) => d.owner === name && d.stage !== "Closed Lost")
      .sort((a, b) => b.value - a.value)
      .map((d) => ({ company: d.company, contact: d.contactName, value: d.value }));
    const repDeals =
      realRepDeals.length > 0
        ? realRepDeals
        : synthDealsForRep(name, repOpen, customers, contacts);
    return {
      name,
      open: repOpen,
      weighted,
      pct: Math.round((weighted / QUOTA) * 100),
      deals: repDeals,
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
    <Card className="h-[116px] p-5 flex flex-col">
      <span
        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mb-2 ${
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
        className={`mt-auto text-[25px] font-bold leading-none tnum ${
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
            className="chart-grow-x absolute inset-y-0 left-0 rounded-full bg-blue-subtle"
            style={{ width: `${bestBar}%` }}
            title={`Best case ${formatMoney(bestCase)}`}
          />
          <div
            className="chart-grow-x absolute inset-y-0 left-0 rounded-full bg-blue-primary"
            style={{ width: `${commitBar}%`, animationDelay: "0.12s" }}
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

      {/* By stage — a real graph, not a table (Suren). Each stage is a full
          "value" column (light) with the "weighted" contribution filled solid,
          so you SEE how each step's odds trim the pipeline down to your number. */}
      {/* Two panels side by side: the value→weighted bars packed on the left,
          the commit-composition donut filling the right (Suren: bars next to
          each other, another graph on the right — no dead space). */}
      <Card className="p-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-0">
          {/* LEFT — value vs weighted per stage */}
          <div className="xl:pr-5">
            <div className="flex items-center gap-1.5 mb-1">
              <h2 className="text-[15px] font-semibold text-text-primary">By stage</h2>
              <InfoHint text="Your pipeline by step of the process. The light column is the full value; the solid fill is the weighted contribution — value trimmed by each step's odds of closing." />
            </div>
            <div className="flex items-center gap-4 mb-3 text-[11px] text-text-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary/20" /> Total value
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary" /> Weighted (likely)
              </span>
            </div>
            {(() => {
              const maxV = Math.max(...byStage.map((s) => s.value), 1);
              return (
                <div className="flex items-end justify-center gap-2.5">
                  {byStage.map((s, i) => {
                    const color = STAGE_COLOR[s.stage];
                    const barPx = Math.max((s.value / maxV) * 108, 4);
                    const wFrac = s.value > 0 ? s.weighted / s.value : 0;
                    const stageHover = (
                      <div>
                        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary mb-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          {s.stage}
                        </p>
                        <div className="space-y-1.5">
                          {[
                            ["Deals", String(s.count)],
                            ["Total value", formatMoney(s.value)],
                            ["Weighted (likely)", formatMoney(s.weighted)],
                            ["Odds of closing", `${s.prob}%`],
                          ].map(([l, v]) => (
                            <div key={l} className="flex items-center justify-between gap-3 text-[12.5px]">
                              <span className="text-text-tertiary">{l}</span>
                              <span className="font-semibold text-text-primary tnum">{v}</span>
                            </div>
                          ))}
                        </div>
                        {s.deals.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-border-light">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                              Deals in this stage
                            </p>
                            <div className="space-y-1.5">
                              {s.deals.slice(0, 5).map((d) => (
                                <div
                                  key={`${d.company}-${d.contact}`}
                                  className="flex items-center gap-2 text-[12px]"
                                >
                                  <CompanyLogo name={d.company} className="w-[18px] h-[18px] text-[7px] shrink-0" />
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
                              {s.deals.length > 5 && (
                                <p className="text-[10.5px] text-text-tertiary">
                                  +{s.deals.length - 5} more
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-text-secondary leading-relaxed">
                          {s.count === 0
                            ? "No deals in this stage."
                            : `The ${s.prob}% close-odds trims ${formatMoney(s.value)} down to ${formatMoney(s.weighted)} of realistic pipeline.`}
                        </p>
                      </div>
                    );
                    return (
                      <div
                        key={s.stage}
                        className="group flex w-[66px] shrink-0 flex-col items-center"
                      >
                        <span className="text-[12px] font-semibold text-text-primary tnum mb-1.5">
                          {formatMoney(s.weighted)}
                        </span>
                        {/* Fixed-height track so every stage renders as a real
                            column; only the bar itself pops the breakdown, not
                            the empty space above a short column (Suren). */}
                        <div className="w-full h-[108px] flex items-end justify-center">
                          <HoverCard
                            side="top"
                            width={240}
                            delayMs={0}
                            content={stageHover}
                            className="w-full flex items-end justify-center"
                          >
                            {/* Growth wrapper grows the whole column up from the
                                baseline on load; hover-lift lives on the inner
                                column so the two transforms don't fight. */}
                            <div
                              className="chart-bar w-full flex justify-center"
                              style={{ animationDelay: `${i * 70}ms` }}
                            >
                              <div
                                className="relative w-full rounded-t-lg flex items-end justify-center transition-all hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.18)]"
                                style={{ height: `${barPx}px`, background: `${color}33` }}
                              >
                                {/* Weighted (likely) fill sits at the base of the value column */}
                                <div
                                  className="w-full rounded-t-lg"
                                  style={{
                                    height: `${Math.max(wFrac * 100, 4)}%`,
                                    background: color,
                                  }}
                                />
                              </div>
                            </div>
                          </HoverCard>
                        </div>
                        {/* Just the stage name at rest — the numbers live in the
                            hover breakdown so this reads as a chart, not a table. */}
                        <p className="mt-2 flex min-h-[28px] items-start justify-center gap-1.5 text-center text-[10.5px] font-medium leading-tight text-text-primary">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                          {s.stage}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* RIGHT — where the weighted commit comes from (fills the space) */}
          <div className="xl:border-l xl:border-border-light xl:px-5 flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <h2 className="text-[15px] font-semibold text-text-primary">
                Where your commit comes from
              </h2>
              <InfoHint text="Your weighted commit split by the stage it sits in — which steps of the funnel are actually driving the number you can promise. Closed-lost deals (0% odds) drop out." />
            </div>
            <p className="text-[11px] text-text-tertiary mb-3">
              Weighted forecast by stage
            </p>
            {(() => {
              const segs = byStage
                .map((s) => ({
                  label: s.stage,
                  value: s.weighted,
                  color: STAGE_COLOR[s.stage],
                  // hovering a slice shows the actual deals driving it (Suren)
                  tip: s.deals.map((d) => ({
                    logo: d.company,
                    name: d.company,
                    sub: d.contact,
                    value: formatMoney(d.value),
                  })),
                }))
                .filter((s) => s.value > 0);
              return (
                <div className="flex-1 flex items-center gap-3">
                  <DonutChart
                    segments={segs}
                    size={126}
                    thickness={15}
                    format="money"
                    centerLabel={formatMoney(commit)}
                    centerSub="commit"
                  />
                  <div className="flex-1 min-w-0">
                    <DonutLegend items={segs} format="money" />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* THIRD — probability-adjusted value that is going stale. */}
          <div className="flex flex-col border-t border-border-light pt-5 xl:col-span-2 xl:mt-5 xl:grid xl:grid-cols-[190px_1fr] xl:gap-6 xl:pt-5">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <h2 className="text-[15px] font-semibold text-text-primary">Forecast risk</h2>
                <InfoHint text={`Weighted forecast split by recent activity. A deal becomes at risk after ${ROTTING_DAYS} days without a logged touch.`} />
              </div>
              <p className="text-[11px] text-text-tertiary mb-3">Activity risk inside the commit</p>
            </div>
            {(() => {
              const riskSegments = [
                {
                  label: "Active",
                  value: activeWeighted,
                  color: "#34C759",
                  tip: open
                    .filter((deal) => deal.staleDays <= ROTTING_DAYS)
                    .map((deal) => ({
                      logo: deal.company,
                      name: deal.company,
                      sub: `${deal.stage} · ${deal.staleDays}d since activity`,
                      value: formatMoney(
                        deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0)
                      ),
                    })),
                },
                {
                  label: "At risk",
                  value: riskWeighted,
                  color: "#FF9500",
                  tip: staleOpen.map((deal) => ({
                    logo: deal.company,
                    name: deal.company,
                    sub: `${deal.stage} · ${deal.staleDays}d since activity`,
                    value: formatMoney(
                      deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0)
                    ),
                  })),
                },
              ].filter((segment) => segment.value > 0);
              return (
                <div className="flex flex-1 items-center gap-5">
                  <DonutChart
                    segments={riskSegments}
                    size={112}
                    thickness={14}
                    format="money"
                    centerLabel={`${riskPct}%`}
                    centerSub="at risk"
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.04em] text-text-tertiary">
                        Exposed commit
                      </p>
                      <p className="mt-0.5 text-[16px] font-bold text-text-primary tnum">
                        {formatMoney(riskWeighted)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.04em] text-text-tertiary">
                        Stale deals
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-text-primary tnum">
                        {staleOpen.length} of {open.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.04em] text-text-tertiary">
                        Confidence
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-text-primary tnum">
                        {forecastConfidence}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_.75fr] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border-light px-5 py-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold text-text-primary">Deal drivers</h2>
                <InfoHint text="The open opportunities contributing the most probability-adjusted revenue to this quarter's forecast." />
              </div>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                Highest weighted contribution first
              </p>
            </div>
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue-primary"
            >
              Open pipeline <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-[minmax(220px,1.5fr)_110px_110px_minmax(135px,.85fr)_18px] gap-3 border-b border-border-light bg-surface/70 px-5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <span>Opportunity</span>
            <span>Stage</span>
            <span>Contribution</span>
            <span>Latest activity</span>
            <span />
          </div>

          <div className="divide-y divide-border-light">
            {priorityDeals.map((deal) => {
              const weighted = deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0);
              const contribution = commit > 0 ? Math.round((weighted / commit) * 100) : 0;
              const stale = deal.staleDays > ROTTING_DAYS;
              return (
                <HoverCard
                  key={deal.sessionId}
                  side="top"
                  width={300}
                  delayMs={0}
                  content={
                    <div>
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo name={deal.company} className="h-9 w-9 shrink-0 text-[8px]" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-text-primary">{deal.company}</p>
                          <p className="truncate text-[10.5px] text-text-tertiary">{deal.service} · {deal.contactName}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{formatMoney(deal.value)}</p><p className="text-[9px] text-text-tertiary">Full value</p></div>
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{formatMoney(weighted)}</p><p className="text-[9px] text-text-tertiary">Weighted</p></div>
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{contribution}%</p><p className="text-[9px] text-text-tertiary">Of commit</p></div>
                      </div>
                      <p className="mt-2.5 text-[11px] leading-relaxed text-text-secondary">{stale ? `No logged activity for ${deal.staleDays} days. This deal is increasing forecast risk.` : `Recently active in ${deal.stage}. It is contributing ${formatMoney(weighted)} to the quarter commit.`}</p>
                    </div>
                  }
                >
                <Link
                  href={`/deals/${deal.sessionId}`}
                  className="group grid min-h-[62px] grid-cols-[minmax(220px,1.5fr)_110px_110px_minmax(135px,.85fr)_18px] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface/60"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={deal.company} className="h-8 w-8 shrink-0 text-[8px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {deal.company}
                      </span>
                      <span className="block truncate text-[10.5px] text-text-tertiary">
                        {deal.service} · {deal.contactName}
                      </span>
                    </span>
                  </span>
                  <span
                    className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold"
                    style={{
                      color: STAGE_COLOR[deal.stage],
                      background: `${STAGE_COLOR[deal.stage]}14`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STAGE_COLOR[deal.stage] }}
                    />
                    {deal.stage === "Meeting Booked" ? "Meeting" : deal.stage}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-text-primary tnum">
                      {formatMoney(weighted)}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-blue-primary"
                        style={{ width: `${Math.max(contribution, 3)}%` }}
                      />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[10.5px] text-text-secondary">
                      <Clock3 size={11} className="shrink-0 text-text-tertiary" />
                      {formatDateTime(deal.lastActivity)}
                    </span>
                    <span
                      className={`mt-0.5 block text-[9.5px] font-medium ${
                        stale ? "text-orange-600" : "text-green-700"
                      }`}
                    >
                      {stale ? `${deal.staleDays} days stale` : "Recently active"}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                  />
                </Link>
                </HoverCard>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-light text-blue-primary">
              <BriefcaseBusiness size={15} strokeWidth={1.9} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold text-text-primary">Forecast signals</h2>
                <InfoHint text="A compact health check of coverage, confidence, late-stage strength, and concentration risk. Higher coverage and confidence are better; high concentration means too much depends on too few deals." />
              </div>
              <p className="text-[10.5px] text-text-tertiary">What needs managing now</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {[
              {
                label: "Open coverage",
                value: bestPct,
                detail: `${formatMoney(bestCase)} against ${formatMoney(QUOTA)}`,
                color: "#14B8A6",
              },
              {
                label: "Commit confidence",
                value: forecastConfidence,
                detail: "Weighted share of open pipeline",
                color: "#0071E3",
              },
              {
                label: "Late-stage share",
                value: lateStagePct,
                detail: `${formatMoney(lateStageWeighted)} qualified or meeting`,
                color: "#5E5CE6",
              },
              {
                label: "Top-three concentration",
                value: concentrationPct,
                detail: "Commit carried by three deals",
                color: "#FF9500",
              },
            ].map((signal) => (
              <div key={signal.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-semibold text-text-primary">{signal.label}</span>
                  <span className="text-[12px] font-bold text-text-primary tnum">{signal.value}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, signal.value)}%`, background: signal.color }}
                  />
                </div>
                <p className="mt-1 text-[9.5px] text-text-tertiary">{signal.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-2.5 border-t border-border-light pt-4">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-orange-500" />
            <p className="text-[10.5px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary">{formatMoney(gap)} remains to quota.</span>{" "}
              {staleOpen.length > 0
                ? `${formatMoney(riskWeighted)} of commit is exposed across ${staleOpen.length} stale ${staleOpen.length === 1 ? "deal" : "deals"}.`
                : "No committed value is currently stale."}
            </p>
          </div>
        </Card>
      </section>

      {/* By rep — the whole floor with sort + a highly-visible "you"
          (client so the rep can re-sort it however they want — Suren). */}
      <ByRepChart reps={byRep} />
    </div>
  );
}
