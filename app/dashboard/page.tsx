import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  MoreVertical,
  ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { OutcomeBadge } from "@/components/ui/Badge";
import { nextBestActions, focusActions } from "@/lib/agent";
import { DashboardToggle } from "@/components/dashboard/DashboardToggle";
import { AnalyticsView } from "@/components/dashboard/AnalyticsView";
import {
  AreaChart,
  Legend,
  VIZ,
} from "@/components/charts/Charts";
import { formatDateTime, OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";
import {
  buildDeals,
  pipelineGrowthSeries,
  pipelineGrowthPointDeals,
  STAGES,
  STAGE_PROBABILITY,
  formatMoney,
} from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { DashboardExport } from "@/components/dashboard/DashboardExport";
import { DateRangeControl } from "@/components/dashboard/DateRangeControl";
import { DashboardKpis } from "@/components/dashboard/DashboardKpis";
import { KpiCustomize } from "@/components/dashboard/KpiCustomize";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { WeeklyDigest } from "@/components/dashboard/WeeklyDigest";
import { AgentAttentionQueue } from "@/components/dashboard/AgentAttentionQueue";
import { DashboardMoreActions } from "@/components/dashboard/DashboardMoreActions";
import { HoverCard } from "@/components/ui/HoverCard";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Real company logo (falls back to a branded mark) — used in the agent
// recommends row and the Recent Sessions table.
function CompanyChip({ name }: { name: string }) {
  return <CompanyLogo name={name} className="w-8 h-8 text-[11px] shrink-0" />;
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const QUARTER_QUOTA = 3_000_000;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const query = await searchParams;
  const db = getDb();
  const [customers, allSessions, allInteractionsRaw, contacts, agentPrefs] =
    await Promise.all([
      db.customers.list(),
      db.pitchSessions.list(),
      db.interactions.list(),
      db.contacts.list(),
      db.agentPrefs.get(),
    ]);

  // Default to a bounded window (30d) so the vs-previous-period change shows on
  // every card out of the box (Suren: "always show me the % change").
  const range =
    query?.range && (RANGE_DAYS[query.range] || query.range === "all")
      ? query.range
      : "30d";
  const days = RANGE_DAYS[range];
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inRange = (ts: string) =>
    !cutoff || new Date(ts).getTime() >= cutoff;
  const sessions = cutoff
    ? allSessions.filter((s) => inRange(s.created_at))
    : allSessions;
  const allInteractions = cutoff
    ? allInteractionsRaw.filter((i) => inRange(i.created_at))
    : allInteractionsRaw;

  // previous equal-length window (for period-over-period deltas)
  const priorStart = days ? cutoff - days * 86400000 : 0;
  const inPrior = (ts: string) => {
    const t = new Date(ts).getTime();
    return t >= priorStart && t < cutoff;
  };
  const priorSessions = days ? allSessions.filter((s) => inPrior(s.created_at)) : [];
  const priorInteractions = days
    ? allInteractionsRaw.filter((i) => inPrior(i.created_at))
    : [];

  // Agent surface on the dashboard (V9) — lead with the agent's top moves so
  // the rep sees recommended next-best-actions the moment they land, not buried
  // behind a separate page. Uses the full book (not the date filter).
  const agentActions = focusActions(
    nextBestActions({
      sessions: allSessions,
      customers,
      contacts,
      interactions: allInteractionsRaw,
    }),
    customers,
    agentPrefs
  ).actions.slice(0, 4);

  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const latestOutcomeByContact: Record<string, string> = {};
  for (const i of [...allInteractions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    latestOutcomeByContact[i.contact_id] = i.outcome;
  }
  const recentSessions = sessions.slice(0, 6);

  // Recent activity — real logged interactions, newest first (no mock data).
  const recentActivity = [...allInteractionsRaw]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      company: customerById[i.customer_id]?.company_name || "—",
      contact: contactById[i.contact_id]?.full_name || "—",
      outcome: i.outcome,
      note: i.notes,
      followUp: i.follow_up_date,
      loggedBy: i.logged_by,
      when: formatDateTime(i.created_at),
      customerId: i.customer_id,
    }));

  // ---- analytics aggregates ----
  const deals = buildDeals(sessions, customers, contacts, allInteractions);
  const stages = STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stage === stage);
    return {
      stage,
      count: ds.length,
      value: ds.reduce((s, d) => s + d.value, 0),
    };
  });
  const openValue = deals
    .filter((d) => d.stage !== "Closed Lost")
    .reduce((s, d) => s + d.value, 0);
  const worked = deals.filter((d) => d.stage !== "Prospect").length;
  const wonish = deals.filter(
    (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
  ).length;
  const winRate = worked ? Math.round((wonish / worked) * 100) : 0;

  // forecast: commit = probability-weighted; best-case = all open value
  const commit = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  const bestCase = openValue;

  // CSV export rows (recent sessions)
  const exportRows = recentSessions.map((s) => {
    const c = customerById[s.customer_id];
    const ct = contactById[s.contact_id];
    const svc = (s.recommended_services || []) as RecommendedService[];
    const oc = latestOutcomeByContact[s.contact_id];
    return {
      company: c?.company_name || "—",
      contact: ct?.full_name || "—",
      service: svc[0]?.service_name || "—",
      outcome: oc ? OUTCOME_META[oc]?.label || oc : "",
      date: formatDateTime(s.created_at),
    };
  });

  const outcomeCounts: Record<string, number> = {};
  for (const i of allInteractions)
    outcomeCounts[i.outcome] = (outcomeCounts[i.outcome] || 0) + 1;
  const outcomes = Object.entries(outcomeCounts)
    .map(([k, count]) => ({
      label: OUTCOME_META[k]?.label || k,
      count,
      color: OUTCOME_CHART_COLOR[k] || "#AF9BF5",
    }))
    .sort((a, b) => b.count - a.count);

  // WHO is behind each stage/outcome — so the Analytics-tab charts (Pipeline by
  // Stage, Outcome Mix, Funnel, Weighted Forecast, Avg Deal Size) reveal the
  // actual deals/contacts on hover, not empty tips (Suren: "every graph shows
  // who"). Mirrors app/analytics/page.tsx's shape exactly.
  const stageDeals: Record<
    string,
    { company: string; contact: string; value: number; customerId: string }[]
  > = {};
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
  const outcomeContacts: Record<
    string,
    { name: string; company: string; contactId: string }[]
  > = {};
  for (const i of allInteractions) {
    const label = OUTCOME_META[i.outcome]?.label || i.outcome;
    const ct = contactById[i.contact_id];
    const co = customerById[i.customer_id];
    (outcomeContacts[label] ||= []).push({
      name: ct?.full_name || "Unknown",
      company: co?.company_name || "—",
      contactId: i.contact_id,
    });
  }

  // period-over-period metrics
  const metricsFor = (sw: typeof sessions, iw: typeof allInteractions) => {
    const dd = buildDeals(sw, customers, contacts, iw);
    const pipeline = dd
      .filter((d) => d.stage !== "Closed Lost")
      .reduce((s, d) => s + d.value, 0);
    const leads = new Set(
      iw
        .filter((i) => i.outcome === "in_progress" || i.outcome === "interested")
        .map((i) => i.customer_id)
    ).size;
    const wk = dd.filter((d) => d.stage !== "Prospect").length;
    const wn = dd.filter(
      (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
    ).length;
    return {
      pipeline,
      leads,
      winRate: wk ? Math.round((wn / wk) * 100) : 0,
      sessions: sw.length,
      openDeals: dd.filter((d) => d.stage !== "Closed Lost").length,
      worked: wk,
      meetings: dd.filter((d) => d.stage === "Meeting Booked").length,
    };
  };
  const cur = metricsFor(sessions, allInteractions);
  const prev = days ? metricsFor(priorSessions, priorInteractions) : null;
  const plural = (n: number) => (n === 1 ? "" : "s");

  // Health-driven "Needs Attention" (V5 #4) — real at-risk accounts
  const healthDeals = buildDeals(
    allSessions,
    customers,
    contacts,
    allInteractionsRaw
  );

  // Real cumulative pipeline-growth curve (in $M) from actual deal-creation dates.
  const trendSeries = pipelineGrowthSeries(healthDeals, Date.now());
  // The deals behind each point of that curve, so a hover shows which deals
  // built the pipeline up to there (Suren: every graph shows who).
  const trendPointTips = (() => {
    const cumulative: ReturnType<typeof pipelineGrowthPointDeals>[number] = [];
    return pipelineGrowthPointDeals(healthDeals).map((bucket) => {
      cumulative.push(...bucket);
      return [...cumulative]
        .sort((a, b) => b.value - a.value)
        .map((deal) => ({
          logo: deal.company,
          name: deal.company,
          sub: `${deal.contact} · Open deal added`,
          value: formatMoney(deal.value),
        }));
    });
  })();
  const openTrendDeals = healthDeals
    .filter((deal) => deal.stage !== "Closed Lost")
    .filter((deal) => !Number.isNaN(new Date(deal.createdAt).getTime()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const trendLabels = trendSeries.map((_, index) => {
    if (index === 0 || openTrendDeals.length === 0) return "Pipeline start";
    const dealIndex = Math.max(
      0,
      Math.min(
        openTrendDeals.length - 1,
        Math.round(openTrendDeals.length * (index / Math.max(trendSeries.length - 1, 1))) - 1
      )
    );
    return `Through ${new Date(openTrendDeals[dealIndex].createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  });
  const atRisk = customers
    .map((cust) => {
      const accountInteractions = allInteractionsRaw
        .filter((interaction) => interaction.customer_id === cust.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const accountDeals = healthDeals.filter(
        (deal) => deal.customerId === cust.id && deal.stage !== "Closed Lost"
      );
      const accountContacts = contacts.filter((contact) => contact.customer_id === cust.id);
      return {
        id: cust.id,
        company: cust.company_name,
        health: accountHealth({
          interactions: accountInteractions,
          deals: accountDeals,
          contactCount: accountContacts.length,
        }),
        openValue: accountDeals.reduce((sum, deal) => sum + deal.value, 0),
        dealCount: accountDeals.length,
        contactCount: accountContacts.length,
        primaryContact: accountContacts[0]?.full_name || "No contact mapped",
        lastTouch: accountInteractions[0]?.created_at
          ? formatDateTime(accountInteractions[0].created_at)
          : "No activity logged",
      };
    })
    .filter((a) => a.health.band !== "healthy")
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, 5);

  const priorDeals = buildDeals(priorSessions, customers, contacts, priorInteractions);
  const priorCommit = priorDeals.reduce(
    (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
    0
  );
  const riskIds = new Set(atRisk.map((account) => account.id));
  const riskDeals = healthDeals.filter(
    (deal) => deal.stage !== "Closed Lost" && riskIds.has(deal.customerId)
  );
  const riskValue = riskDeals.reduce((sum, deal) => sum + deal.value, 0);
  const coverage = bestCase ? Math.round((commit / bestCase) * 100) : 0;
  const pipelineAttainment = Math.round((openValue / QUARTER_QUOTA) * 100);
  const commitAttainment = Math.round((commit / QUARTER_QUOTA) * 100);
  const riskExposure = openValue ? Math.round((riskValue / openValue) * 100) : 0;
  const meetingConversion = cur.sessions ? Math.round((cur.meetings / cur.sessions) * 100) : 0;

  const kpis = [
    {
      key: "pipeline",
      label: "Pipeline vs quota",
      value: `${formatMoney(openValue)} / ${formatMoney(QUARTER_QUOTA)}`,
      cur: openValue,
      prev: prev?.pipeline ?? null,
      unit: "money" as const,
      href: "/pipeline",
      sub: openValue >= QUARTER_QUOTA ? "quota covered" : "of quarterly quota",
      progress: pipelineAttainment,
      progressLabel: "Quota attainment",
      description: "The full value of every open deal compared with this quarter's quota.",
      details: [
        { label: "Quarter quota", value: formatMoney(QUARTER_QUOTA) },
        { label: openValue >= QUARTER_QUOTA ? "Above quota" : "Still needed", value: formatMoney(Math.abs(openValue - QUARTER_QUOTA)), tone: openValue >= QUARTER_QUOTA ? "good" as const : "warning" as const },
        { label: "Open deals", value: String(deals.filter((deal) => deal.stage !== "Closed Lost").length) },
      ],
    },
    {
      key: "coverage",
      label: "Commit coverage",
      value: `${formatMoney(commit)} · ${coverage}%`,
      cur: commit,
      prev: days ? priorCommit : null,
      unit: "money" as const,
      href: "/analytics",
      sub: "stage-weighted",
      progress: commitAttainment,
      progressLabel: "Commit vs quota",
      description: "Stage-weighted pipeline: the amount the current book is realistically expected to produce.",
      details: [
        { label: "Best case", value: formatMoney(bestCase) },
        { label: "Uncommitted value", value: formatMoney(Math.max(0, bestCase - commit)), tone: "warning" as const },
        { label: "Gap to quota", value: formatMoney(Math.max(0, QUARTER_QUOTA - commit)), tone: "danger" as const },
      ],
    },
    {
      key: "risk",
      label: "Deals at risk",
      value: `${riskDeals.length} · ${formatMoney(riskValue)}`,
      cur: riskValue,
      prev: null,
      unit: "money" as const,
      href: "/customers",
      sub: riskDeals.length ? "needs attention" : "all healthy",
      progress: riskExposure,
      progressLabel: "Open pipeline exposed",
      description: "Open pipeline attached to accounts whose relationship health is not currently healthy.",
      details: [
        { label: "Accounts affected", value: String(atRisk.length), tone: atRisk.length ? "danger" as const : "good" as const },
        { label: "Pipeline exposed", value: `${riskExposure}%`, tone: riskExposure ? "danger" as const : "good" as const },
        { label: "Longest silence", value: `${Math.max(0, ...riskDeals.map((deal) => deal.staleDays))} days`, tone: "warning" as const },
      ],
      tone: "danger" as const,
    },
    {
      key: "meetings",
      label: "Meetings booked",
      value: String(cur.meetings),
      cur: cur.meetings,
      prev: prev?.meetings ?? null,
      unit: "count" as const,
      href: "/pipeline",
      sub: `from ${cur.sessions} session${plural(cur.sessions)}`,
      progress: meetingConversion,
      progressLabel: "Session-to-meeting rate",
      description: "Pitch sessions in the selected period that have progressed to a booked meeting.",
      details: [
        { label: "Pitch sessions", value: String(cur.sessions) },
        { label: "Conversion rate", value: `${meetingConversion}%`, tone: meetingConversion >= 20 ? "good" as const : "warning" as const },
        { label: "Previous period", value: String(prev?.meetings ?? 0) },
      ],
    },
    {
      key: "created",
      label: "Pipeline created",
      value: formatMoney(cur.pipeline),
      cur: cur.pipeline,
      prev: prev?.pipeline ?? null,
      unit: "money" as const,
      href: "/pipeline",
      sub: `last ${range === "all" ? "period" : range}`,
      progress: Math.round((cur.pipeline / QUARTER_QUOTA) * 100),
      progressLabel: "Quota contribution",
      description: "Open pipeline created by pitch sessions inside the selected reporting window.",
      details: [
        { label: "Open deals added", value: String(cur.openDeals) },
        { label: "Previous period", value: formatMoney(prev?.pipeline ?? 0) },
        { label: "Share of quota", value: `${Math.round((cur.pipeline / QUARTER_QUOTA) * 100)}%` },
      ],
    },
  ];

  const attentionRows = agentActions.slice(0, 3).map((action) => {
    const accountDeals = healthDeals.filter(
      (deal) => deal.customerId === action.customerId && deal.stage !== "Closed Lost"
    );
    const value = accountDeals.reduce((sum, deal) => sum + deal.value, 0);
    const staleDays = Math.max(0, ...accountDeals.map((deal) => deal.staleDays));
    const overdue = action.kind === "reengage" || action.kind === "stabilize" || staleDays > 14;
    return {
      ...action,
      value: formatMoney(value),
      due: overdue ? "Overdue" : action.kind === "send" ? "Ready" : "Today",
      overdue,
    };
  });

  const forecastGap = Math.max(0, QUARTER_QUOTA - commit);
  const mustCloseDeals = healthDeals
    .filter((deal) => deal.stage !== "Closed Lost")
    .sort((a, b) => {
      const probability = (STAGE_PROBABILITY[b.stage] ?? 0) - (STAGE_PROBABILITY[a.stage] ?? 0);
      return probability || b.value - a.value;
    })
    .slice(0, 3);

  const overview = (
    <>
      <DashboardKpis kpis={kpis} comparable={!!days} />
      <GettingStarted established={allSessions.length > 0} />

      {attentionRows.length > 0 && <AgentAttentionQueue actions={attentionRows} />}

      <section className="space-y-4">
        <Card className="overflow-visible p-0">
          <div className="px-5 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[16px] font-semibold text-text-primary">Quarter forecast</p>
                <p className="mt-1 text-[11.5px] text-text-tertiary">How the open book accumulated, what is likely to close, and the remaining quota gap.</p>
              </div>
              <Legend
                items={[
                  { label: "Open pipeline", color: VIZ.blue },
                  { label: "Quarter quota", color: VIZ.amber },
                ]}
              />
            </div>
            <div className="mt-4 grid grid-cols-4 divide-x divide-border-light rounded-md border border-border-light bg-surface/45">
              {[
                ["Weighted commit", formatMoney(commit), `${commitAttainment}% of quota`],
                ["Best case", formatMoney(bestCase), `${pipelineAttainment}% of quota`],
                ["Gap to quota", formatMoney(forecastGap), forecastGap ? "Needs closing coverage" : "Quota covered"],
                ["Open deals", String(healthDeals.filter((deal) => deal.stage !== "Closed Lost").length), `${riskDeals.length} currently at risk`],
              ].map(([label, value, context]) => (
                <div key={label} className="px-3.5 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">{label}</p>
                  <p className="mt-0.5 text-[15px] font-bold text-text-primary tnum">{value}</p>
                  <p className="mt-0.5 truncate text-[9.5px] text-text-tertiary">{context}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="px-3 pb-5 pt-3">
            <AreaChart
              data={trendSeries}
              height={238}
              id="dash-trend"
              color={VIZ.blue}
              goal={3.0}
              goalLabel="Quarter quota · $3.0M"
              format="millions"
              unit="open pipeline"
              xLabels={trendLabels}
              pointTips={trendPointTips}
            />
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Must close to hit quota</h2>
              <p className="mt-0.5 text-[11px] text-text-tertiary">Ranked by stage confidence and value</p>
            </div>
            <span className="text-[12px] font-semibold text-error tnum">{formatMoney(forecastGap)} gap</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border-light">
            {mustCloseDeals.map((deal) => {
              const probability = STAGE_PROBABILITY[deal.stage] ?? 0;
              const confidence = probability >= 0.65 ? "High" : probability >= 0.35 ? "Medium" : "Low";
              return (
                <Link key={deal.sessionId} href={`/sessions/${deal.sessionId}`} className="group min-w-0 px-5 py-3.5 hover:bg-surface transition-colors">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={deal.company} className="h-8 w-8 shrink-0 text-[8px]" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary group-hover:text-blue-primary" title={deal.company}>{deal.company}</span>
                      <span className="mt-0.5 block text-[10.5px] text-text-tertiary">{deal.stage}</span>
                    </div>
                    <span className="text-right text-[13px] font-bold text-text-primary tnum">{formatMoney(deal.value)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border-light pt-2">
                    <span className="text-[10px] text-text-tertiary">Close confidence</span>
                    <span className={confidence === "High" ? "text-[10.5px] font-semibold text-success" : confidence === "Medium" ? "text-[10.5px] font-semibold text-warning" : "text-[10.5px] font-semibold text-text-tertiary"}>{confidence}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Needs attention + activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b border-border-light flex justify-between items-center">
              <h2 className="text-[17px] font-semibold text-text-primary flex items-center gap-2">
                <AlertTriangle size={18} strokeWidth={1.75} className="text-warning" />
                Needs Attention
              </h2>
              <Link href="/customers" className="text-blue-primary text-[12px] font-semibold hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-border-light stagger">
              {atRisk.map((a) => (
                <HoverCard
                  key={a.id}
                  delayMs={0}
                  width={360}
                  content={
                    <div>
                      <div className="flex items-center gap-3">
                        <CompanyLogo name={a.company} className="h-10 w-10 shrink-0 text-[9px]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-text-primary">{a.company}</p>
                          <p className="mt-0.5 text-[10.5px] text-text-tertiary">Last touch {a.lastTouch}</p>
                        </div>
                        <HealthBadge health={a.health} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2.5 text-center">
                        <div><p className="text-[13px] font-bold text-text-primary tnum">{formatMoney(a.openValue)}</p><p className="text-[9px] text-text-tertiary">Open pipeline</p></div>
                        <div><p className="text-[13px] font-bold text-text-primary tnum">{a.dealCount}</p><p className="text-[9px] text-text-tertiary">Open deals</p></div>
                        <div><p className="text-[13px] font-bold text-text-primary tnum">{a.contactCount}</p><p className="text-[9px] text-text-tertiary">Contacts</p></div>
                      </div>
                      <div className="mt-3">
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Why it needs attention</p>
                        <div className="mt-1.5 space-y-1.5">
                          {a.health.factors.slice(0, 3).map((factor) => (
                            <div key={factor.label} className="flex items-center justify-between gap-3 text-[11px]">
                              <span className="text-text-secondary">{factor.label}</span>
                              <span className={factor.delta < 0 ? "font-semibold text-error tnum" : "font-semibold text-success tnum"}>{factor.delta > 0 ? "+" : ""}{factor.delta}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 border-t border-border-light pt-3">
                        <Avatar name={a.primaryContact} className="h-7 w-7 text-[8px]" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">Primary contact: <strong className="font-semibold text-text-primary">{a.primaryContact}</strong></span>
                        <span className="text-[11px] font-semibold text-blue-primary">Open account</span>
                      </div>
                    </div>
                  }
                >
                  <Link href={`/customers/${a.id}`} className="p-5 flex justify-between items-center gap-3 hover:bg-surface transition-colors group">
                    <div className="flex gap-4 items-center min-w-0">
                      <CompanyChip name={a.company} />
                      <div className="space-y-1 min-w-0">
                        <div className="text-[14px] font-semibold text-text-primary truncate">
                          {a.company}
                        </div>
                        <div className="text-[12px] text-text-secondary truncate">
                          {a.health.factors[0]?.label || "Review this account"}
                        </div>
                      </div>
                    </div>
                    <HealthBadge health={a.health} className="shrink-0" />
                  </Link>
                </HoverCard>
              ))}
              {atRisk.length === 0 && (
                <p className="p-5 text-[13px] text-text-secondary">
                  Every account is healthy — nothing needs attention. 🎉
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card className="p-0 overflow-hidden flex flex-col max-h-[380px]">
            <div className="p-5 border-b border-border-light flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-text-primary">
                Recent Activity
              </h2>
              <Link href="/activity" className="text-blue-primary text-[12px] font-semibold hover:underline">
                View all
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto p-5 relative">
              {recentActivity.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  No activity logged yet. Log an interaction on any account and it&apos;ll show up here.
                </p>
              ) : (
                <>
                  <div className="absolute left-[31px] top-5 bottom-5 w-px bg-border-light" />
                  <div className="space-y-5 stagger">
                    {recentActivity.map((a) => {
                      const positive =
                        a.outcome === "meeting_booked" || a.outcome === "interested";
                      const Icon = positive ? CheckCircle2 : MessageSquareText;
                      return (
                        <HoverCard
                          key={a.id}
                          delayMs={0}
                          width={350}
                          content={
                            <div>
                              <div className="flex items-center gap-3">
                                <Avatar name={a.contact} className="h-10 w-10 shrink-0 text-[10px]" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-semibold text-text-primary">{a.contact}</p>
                                  <div className="mt-0.5 flex items-center gap-1.5">
                                    <CompanyLogo name={a.company} className="h-4 w-4 text-[6px]" />
                                    <span className="truncate text-[10.5px] text-text-tertiary">{a.company}</span>
                                  </div>
                                </div>
                                <OutcomeBadge outcome={a.outcome} />
                              </div>
                              <div className="mt-3 rounded-md bg-surface px-3 py-2.5">
                                <p className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Interaction note</p>
                                <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">{a.note || "No note was recorded for this interaction."}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                                <div><p className="text-text-tertiary">Logged</p><p className="mt-0.5 font-semibold text-text-primary">{a.when}</p></div>
                                <div><p className="text-text-tertiary">Follow-up</p><p className="mt-0.5 font-semibold text-text-primary">{a.followUp ? formatDateTime(a.followUp) : "Not scheduled"}</p></div>
                              </div>
                              <div className="mt-3 flex items-center gap-2 border-t border-border-light pt-3">
                                <Avatar name={a.loggedBy} className="h-6 w-6 text-[7px]" />
                                <span className="text-[10.5px] text-text-secondary">Logged by {a.loggedBy}</span>
                                <span className="ml-auto text-[11px] font-semibold text-blue-primary">Open account</span>
                              </div>
                            </div>
                          }
                        >
                          <Link
                            href={`/customers/${a.customerId}`}
                            className="relative flex gap-3.5 items-start rounded-md group"
                          >
                            {/* The person's headshot leads (Suren: "why are there no
                                profile pictures here?"), with a small outcome dot. */}
                            <span className="relative shrink-0 z-10">
                              <Avatar
                                name={a.contact || a.company}
                                className="w-9 h-9 text-[12px] border-2 border-white"
                              />
                              <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white ${positive ? "bg-blue-primary text-white" : "bg-surface text-text-tertiary"}`}>
                                <Icon size={9} strokeWidth={2.2} />
                              </span>
                            </span>
                            <div className="space-y-1 pt-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-semibold text-text-primary truncate group-hover:text-blue-primary transition-colors">
                                  {a.company}
                                </span>
                                <OutcomeBadge outcome={a.outcome} />
                              </div>
                              <div className="text-[12px] text-text-secondary truncate">
                                {a.contact}
                              </div>
                              <div className="text-[11px] text-text-tertiary uppercase tracking-[0.04em]">
                                {a.when}
                              </div>
                            </div>
                          </Link>
                        </HoverCard>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Recent sessions table */}
      <section>
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-light flex justify-between items-center gap-3">
            <h2 className="text-[17px] font-semibold text-text-primary">
              Recent Sessions
            </h2>
            <Link
              href="/sessions"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-primary hover:underline"
            >
              View all sessions
              <ArrowRight size={14} strokeWidth={1.8} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {["Customer", "Primary Contact", "Recommended Service", "Status", "Last Session"].map((h) => (
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light stagger">
                {recentSessions.map((s) => {
                  const customer = customerById[s.customer_id];
                  const contact = contactById[s.contact_id];
                  const services = (s.recommended_services || []) as RecommendedService[];
                  const outcome = latestOutcomeByContact[s.contact_id];
                  return (
                    <tr key={s.id} className="hover:bg-surface transition-colors group">
                      <td className="px-5 py-4">
                        <Link href={`/sessions/${s.id}`} className="flex items-center gap-3">
                          <CompanyChip name={customer?.company_name || "—"} />
                          <span className="text-[13px] font-semibold text-text-primary">
                            {customer?.company_name || "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-[13px] text-text-primary">{contact?.full_name || "—"}</div>
                        <div className="text-[11px] text-text-tertiary">{contact?.job_title || ""}</div>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-text-secondary whitespace-nowrap">
                        {services[0]?.service_name || "—"}
                      </td>
                      <td className="px-5 py-4">
                        {outcome ? <OutcomeBadge outcome={outcome} /> : "—"}
                      </td>
                      <td className="px-5 py-4 text-[13px] text-text-secondary tnum whitespace-nowrap">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/sessions/${s.id}`} className="inline-flex p-1 rounded text-text-tertiary group-hover:text-blue-primary hover:bg-surface transition-colors" aria-label="Open session">
                          <MoreVertical size={18} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </>
  );

  const analytics = (
    <AnalyticsView
      stages={stages}
      outcomes={outcomes}
      winRate={winRate}
      totalDeals={deals.length}
      openValue={openValue}
      stageDeals={stageDeals}
      outcomeContacts={outcomeContacts}
    />
  );

  return (
    <DashboardToggle
      title="Good morning, Suren"
      overview={overview}
      analytics={analytics}
      showViewToggle={false}
      actions={
        <>
          <DateRangeControl value={range} />
          <KpiCustomize
            kpis={kpis.map((k) => ({ key: k.key, label: k.label }))}
            comparable={!!days}
            rangeLabel={range === "all" ? "all time" : `prev ${range}`}
          />
          <DashboardMoreActions>
            <WeeklyDigest
              kpis={kpis.map((k) => ({ label: k.label, value: k.value }))}
              period={range === "all" ? "all time" : `last ${range}`}
              recipient="anirudhsuren@gmail.com"
            />
            <DashboardExport rows={exportRows} />
          </DashboardMoreActions>
        </>
      }
    />
  );
}
