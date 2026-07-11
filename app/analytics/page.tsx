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
  buildRepStats,
  pipelineGrowthSeries,
  pipelineGrowthPointDeals,
  STAGES,
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  SALES_TEAM,
  formatMoney,
} from "@/lib/pipeline";
import { OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";

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
  // The deals behind each point of the growth curve, aligned to trendSeries.
  const trendPointTips = pipelineGrowthPointDeals(fullDeals).map((bucket) =>
    bucket.map((d) => ({
      logo: d.company,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    }))
  );

  // per-rep breakdown (V3 #6) — grouped by deal owner. Richer now so the
  // leaderboard shows real stats + a pipeline-composition graph per rep without
  // a click (Suren: "I should see the graphs without needing to click").
  // The whole sales floor (Suren: 20 reps, scroll + expand each inline). The
  // four real deal-owners use their actual numbers; the rest of the roster gets
  // a deterministic mock forecast so the leaderboard is full and every row can
  // expand into real graphs without a click-through.
  const reps: RepStat[] = buildRepStats(deals);
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
      color: OUTCOME_CHART_COLOR[k] || "#AF9BF5",
    }))
    .sort((a, b) => b.count - a.count);

  // WHO is behind each bar/segment (Suren: "every graph has to tell me who is
  // prospect, who I lost, who's interested…"). Grouped so the charts can reveal
  // the actual deals/contacts on click.
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const stageDeals: Record<string, { company: string; contact: string; value: number; customerId: string }[]> = {};
  for (const st of STAGES) stageDeals[st] = [];
  for (const d of deals) {
    (stageDeals[d.stage] ||= []).push({
      company: d.company,
      contact: d.contactName,
      value: d.value,
      customerId: d.customerId,
    });
  }
  for (const st of STAGES) stageDeals[st].sort((a, b) => b.value - a.value);
  const outcomeContacts: Record<string, { name: string; company: string; contactId: string }[]> = {};
  for (const i of interactions) {
    const label = OUTCOME_META[i.outcome]?.label || i.outcome;
    const ct = contactById[i.contact_id];
    const co = custById[i.customer_id];
    (outcomeContacts[label] ||= []).push({
      name: ct?.full_name || "Unknown",
      company: co?.company_name || "—",
      contactId: i.contact_id,
    });
  }

  // WHO is behind each rep's stage bar/segment — grouped by deal owner + stage
  // so the leaderboard's Pipeline-value bar and Deals-by-stage donut show the
  // actual deals on hover (Suren: every graph shows who). Only the real
  // deal-owning reps have entries; synthetic reps have none.
  const repStageDeals: Record<
    string,
    Record<string, { company: string; contact: string; value: number }[]>
  > = {};
  for (const d of deals) {
    (repStageDeals[d.owner] ||= {});
    (repStageDeals[d.owner][d.stage] ||= []).push({
      company: d.company,
      contact: d.contactName,
      value: d.value,
    });
  }
  for (const owner of Object.keys(repStageDeals))
    for (const st of Object.keys(repStageDeals[owner]))
      repStageDeals[owner][st].sort((a, b) => b.value - a.value);

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
          pointTips={trendPointTips}
        />
      </Card>

      {/* Reuse analytics panels — with the who-is-behind-each-segment breakdowns */}
      <AnalyticsView
        stages={stages}
        outcomes={outcomes}
        winRate={winRate}
        totalDeals={deals.length}
        openValue={openValue}
        stageDeals={stageDeals}
        outcomeContacts={outcomeContacts}
      />

      {/* Per-rep performance + drill-down (V3 #6) */}
      <RepAnalytics reps={reps} range={range} repStageDeals={repStageDeals} />
    </div>
  );
}
