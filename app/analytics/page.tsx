import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnalyticsView } from "@/components/dashboard/AnalyticsView";
import { RepAnalytics, type RepStat } from "@/components/analytics/RepAnalytics";
import { AreaChart, VIZ } from "@/components/charts/Charts";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import {
  buildDeals,
  pipelineGrowthSeries,
  STAGES,
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  REPS,
  formatMoney,
} from "@/lib/pipeline";
import { OUTCOME_META } from "@/lib/utils";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const db = getDb();
  const [allSessions, customers, contacts, allInteractions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const range =
    searchParams?.range &&
    (RANGE_DAYS[searchParams.range] || searchParams.range === "all")
      ? searchParams.range
      : "all";
  const days = RANGE_DAYS[range];
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inRange = (ts: string) => !cutoff || new Date(ts).getTime() >= cutoff;
  const sessions = cutoff
    ? allSessions.filter((s) => inRange(s.created_at))
    : allSessions;
  const interactions = cutoff
    ? allInteractions.filter((i) => inRange(i.created_at))
    : allInteractions;

  const deals = buildDeals(sessions, customers, contacts, interactions);

  // Real cumulative pipeline-growth curve from the full book (not the date
  // filter) — no hardcoded curve or invented "+12%".
  const fullDeals = buildDeals(allSessions, customers, contacts, allInteractions);
  const trendSeries = pipelineGrowthSeries(fullDeals, Date.now());

  // per-rep breakdown (V3 #6) — grouped by deal owner. Richer now so the
  // leaderboard shows real stats + a pipeline-composition graph per rep without
  // a click (Suren: "I should see the graphs without needing to click").
  const reps: RepStat[] = REPS.map((name) => {
    const rd = deals.filter((d) => d.owner === name);
    const open = rd.filter((d) => d.stage !== "Closed Lost");
    const openValue = open.reduce((s, d) => s + d.value, 0);
    const weighted = open.reduce(
      (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
      0
    );
    const qualifiedPlus = rd.filter(
      (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
    ).length;
    const meetings = rd.filter((d) => d.stage === "Meeting Booked").length;
    return {
      name,
      deals: rd.length,
      openCount: open.length,
      openValue,
      weighted: Math.round(weighted),
      avgDeal: open.length ? Math.round(openValue / open.length) : 0,
      qualifiedPlus,
      meetings,
      // Value composition across the OPEN funnel stages, for the stacked bar.
      stageValues: OPEN_STAGES.map((stage) => ({
        stage,
        color: STAGE_COLOR[stage],
        count: open.filter((d) => d.stage === stage).length,
        value: open
          .filter((d) => d.stage === stage)
          .reduce((s, d) => s + d.value, 0),
      })),
    };
  }).sort((a, b) => b.openValue - a.openValue);
  const stages = STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stage === stage);
    return { stage, count: ds.length, value: ds.reduce((s, d) => s + d.value, 0) };
  });
  const openValue = deals
    .filter((d) => d.stage !== "Closed Lost")
    .reduce((s, d) => s + d.value, 0);
  const worked = deals.filter((d) => d.stage !== "Prospect").length;
  const wonish = deals.filter(
    (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
  ).length;
  const winRate = worked ? Math.round((wonish / worked) * 100) : 0;

  const outcomeCounts: Record<string, number> = {};
  for (const i of interactions)
    outcomeCounts[i.outcome] = (outcomeCounts[i.outcome] || 0) + 1;
  const outcomes = Object.entries(outcomeCounts)
    .map(([k, count]) => ({
      label: OUTCOME_META[k]?.label || k,
      count,
      color: OUTCOME_META[k]?.color || "#8E8E93",
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        subtitle="Pipeline, conversion, and team performance."
      />

      {/* Hero trend */}
      <Card className="p-0 overflow-hidden">
        <div className="p-5 flex items-end justify-between">
          <div>
            <p className="flex items-center gap-1 text-[13px] text-text-secondary">
              Pipeline growth
              <InfoHint text="The big number is your open pipeline right now. The line shows how that pipeline built up over the period you've been tracking — each point adds in the deals created by then." />
            </p>
            <p className="text-[32px] font-bold text-text-primary tnum leading-none mt-1">
              <CountUp value={openValue} unit="money" />
            </p>
          </div>
        </div>
        <AreaChart
          data={trendSeries}
          height={180}
          id="trend"
          color={VIZ.blue}
          goal={3.0}
          goalLabel="Quota $3.0M"
          format="millions"
        />
      </Card>

      {/* Reuse analytics panels */}
      <AnalyticsView
        stages={stages}
        outcomes={outcomes}
        winRate={winRate}
        totalDeals={deals.length}
        openValue={openValue}
      />

      {/* Per-rep performance + drill-down (V3 #6) */}
      <RepAnalytics reps={reps} range={range} />
    </div>
  );
}
