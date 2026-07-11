import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  MoreVertical,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { OutcomeBadge } from "@/components/ui/Badge";
import { AgentRecommendCarousel } from "@/components/agent/AgentRecommendCarousel";
import { nextBestActions, focusActions } from "@/lib/agent";
import { DashboardToggle } from "@/components/dashboard/DashboardToggle";
import { AnalyticsView } from "@/components/dashboard/AnalyticsView";
import {
  AreaChart,
  DonutChart,
  Legend,
  VIZ,
  VIZ_SERIES,
} from "@/components/charts/Charts";
import { formatDate, OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";
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
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Real company logo (falls back to a branded mark) — used in the agent
// recommends row and the Recent Sessions table.
function CompanyChip({ name }: { name: string }) {
  return <CompanyLogo name={name} className="w-8 h-8 text-[11px] shrink-0" />;
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
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
    searchParams?.range && (RANGE_DAYS[searchParams.range] || searchParams.range === "all")
      ? searchParams.range
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
      when: formatDate(i.created_at),
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
      date: formatDate(s.created_at),
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

  const kpis = [
    { key: "pipeline", label: "Active Pipeline", value: formatMoney(cur.pipeline), cur: cur.pipeline, prev: prev?.pipeline ?? null, unit: "money" as const, href: "/pipeline", sub: `Across ${cur.openDeals} open deal${plural(cur.openDeals)}` },
    { key: "leads", label: "Active Leads", value: String(cur.leads), cur: cur.leads, prev: prev?.leads ?? null, unit: "count" as const, href: "/customers", sub: `of ${customers.length} account${plural(customers.length)} warming` },
    { key: "winRate", label: "Qualified rate", value: `${cur.winRate}%`, cur: cur.winRate, prev: prev?.winRate ?? null, unit: "pct" as const, href: "/analytics", sub: `of ${cur.worked} worked deal${plural(cur.worked)}` },
    { key: "sessions", label: "Pitch Sessions", value: String(cur.sessions), cur: cur.sessions, prev: prev?.sessions ?? null, unit: "count" as const, href: "/sessions", sub: `${cur.meetings} meeting${plural(cur.meetings)} booked` },
  ];

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
  const trendPointTips = pipelineGrowthPointDeals(healthDeals).map((bucket) =>
    bucket.map((d) => ({
      logo: d.company,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    }))
  );
  const atRisk = customers
    .map((cust) => ({
      id: cust.id,
      company: cust.company_name,
      health: accountHealth({
        interactions: allInteractionsRaw.filter((i) => i.customer_id === cust.id),
        deals: healthDeals.filter((d) => d.customerId === cust.id),
        contactCount: contacts.filter((c) => c.customer_id === cust.id).length,
      }),
    }))
    .filter((a) => a.health.band !== "healthy")
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, 5);

  const overview = (
    <>
      {/* Lead with the rep's real status + the agent's next actions; the
          onboarding checklist sits just below so it doesn't own prime space. */}
      <DashboardKpis kpis={kpis} comparable={!!days} />
      {/* Setup checklist only for a brand-new workspace; once real pitch
          sessions exist it steps aside so the agent's recommendations lead. */}
      <GettingStarted established={allSessions.length > 0} />

      {/* Agent next-best-actions (V9) — agent surfaces lead, everywhere */}
      {agentActions.length > 0 && (
        <Card className="bg-blue-light/40 border-blue-subtle">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
              <Sparkles size={17} strokeWidth={1.8} className="text-blue-primary" />
              Your agent recommends
            </h2>
            {/* Go to the full queue of these recommendations, not the chat
                (Anir, Jul 8: "Open Agent just takes me to the main chat"). */}
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
            >
              See all ({agentActions.length})
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </div>
          {/* One rich recommendation at a time, paged left/right, with an
              "Up next" queue — no cramped stack (Anir, Jul 7). */}
          <AgentRecommendCarousel actions={agentActions} />
        </Card>
      )}

      {/* Forecast: commit vs best-case */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Quarter Forecast
          </h2>
          <Link
            href="/analytics"
            className="text-[12px] font-semibold text-blue-primary hover:underline"
          >
            Details
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Commit (weighted)
            </p>
            <p className="text-[24px] font-bold text-text-primary tnum mt-1">
              {formatMoney(commit)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Best case (open)
            </p>
            <p className="text-[24px] font-bold text-text-primary tnum mt-1">
              {formatMoney(bestCase)}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2.5 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-primary"
            style={{ width: `${bestCase ? Math.min(100, (commit / bestCase) * 100) : 0}%` }}
          />
        </div>
        <p className="text-[12px] text-text-tertiary mt-2 tnum">
          {bestCase ? Math.round((commit / bestCase) * 100) : 0}% of best-case is weighted-committed
        </p>
      </Card>

      {/* Hero pipeline chart + stage donut */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8 p-0 overflow-hidden">
          <div className="p-5 flex items-end justify-between">
            <div>
              <p className="text-[13px] text-text-secondary">Pipeline growth</p>
              <p className="text-[28px] font-bold text-text-primary tnum leading-none mt-1">
                {formatMoney(openValue)}
              </p>
            </div>
            <Legend
              items={[
                { label: "Open pipeline value", color: VIZ.blue },
                { label: "Quota", color: VIZ.amber },
              ]}
            />
          </div>
          <AreaChart
            data={trendSeries}
            height={180}
            id="dash-trend"
            color={VIZ.blue}
            goal={3.0}
            goalLabel="Quota $3.0M"
            format="millions"
            pointTips={trendPointTips}
          />
        </Card>
        <Card className="lg:col-span-4 flex flex-col items-center justify-center">
          <p className="text-[13px] font-semibold text-text-primary self-start mb-2">
            Deals by stage
          </p>
          <DonutChart
            segments={stages
              .filter((s) => s.count > 0)
              .map((s, i) => ({
                label: s.stage,
                value: s.count,
                color: VIZ_SERIES[i % VIZ_SERIES.length],
                // Which deals sit in this stage (Suren: every graph shows who).
                tip: deals
                  .filter((d) => d.stage === s.stage)
                  .map((d) => ({
                    logo: d.company,
                    name: d.company,
                    sub: d.contactName,
                    value: formatMoney(d.value),
                  })),
              }))}
            centerLabel={String(deals.length)}
            centerSub="deals"
          />
          <div className="mt-3 self-start">
            <Legend
              items={stages
                .filter((s) => s.count > 0)
                .map((s, i) => ({
                  label: s.stage,
                  color: VIZ_SERIES[i % VIZ_SERIES.length],
                  value: String(s.count),
                }))}
            />
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
                <Link key={a.id} href={`/customers/${a.id}`} className="p-5 flex justify-between items-center gap-3 hover:bg-surface transition-colors group">
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
                        <Link
                          key={a.id}
                          href={`/customers/${a.customerId}`}
                          className="relative flex gap-3.5 items-start group"
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
                        {formatDate(s.created_at)}
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
      actions={
        <>
          <DateRangeControl value={range} />
          <KpiCustomize
            kpis={kpis.map((k) => ({ key: k.key, label: k.label }))}
            comparable={!!days}
            rangeLabel={range === "all" ? "all time" : `prev ${range}`}
          />
          <WeeklyDigest
            kpis={kpis.map((k) => ({ label: k.label, value: k.value }))}
            period={range === "all" ? "all time" : `last ${range}`}
            recipient="anirudhsuren@gmail.com"
          />
          <DashboardExport rows={exportRows} />
        </>
      }
    />
  );
}
