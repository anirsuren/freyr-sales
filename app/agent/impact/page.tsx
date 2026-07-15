import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  ScrollText,
  Wallet,
  Zap,
  Trophy,
  BarChart3,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { BarChart } from "@/components/charts/Charts";
import {
  buildAgentImpact,
  buildRunSeries,
  IMPACT_WINDOW_DAYS,
  type ImpactWindow,
} from "@/lib/agent";
import { buildDeals, formatMoney } from "@/lib/pipeline";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Agent Impact" };
export const dynamic = "force-dynamic";

const WINDOWS: { key: ImpactWindow; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "quarter", label: "This quarter" },
  { key: "all", label: "All time" },
];
const RUNS_LABEL: Record<ImpactWindow, string> = {
  week: "Runs this week",
  quarter: "Runs this quarter",
  all: "Runs all time",
};

const RANK_STYLE = [
  "bg-[#F5C518]/20 text-[#9A7B00]", // gold
  "bg-text-tertiary/15 text-text-secondary", // silver
  "bg-[#CD7F32]/20 text-[#8A5A22]", // bronze
];

export default async function AgentImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const query = await searchParams;
  const win: ImpactWindow = WINDOWS.some((w) => w.key === query.window)
    ? (query.window as ImpactWindow)
    : "quarter";

  const db = getDb();
  const [sessions, cust, contacts, interactions, runs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentRuns.list(),
  ]);

  const deals = buildDeals(sessions, cust, contacts, interactions);
  const impact = buildAgentImpact({
    runs,
    deals,
    windowDays: IMPACT_WINDOW_DAYS[win],
  });
  const series = buildRunSeries(runs, win);
  const seriesData = series.labels.map((label, i) => ({
    label,
    value: series.counts[i],
  }));
  const pipelineAtWorked = impact.rows.reduce((s, r) => s + r.openValue, 0);

  const stats = [
    {
      label: RUNS_LABEL[win],
      value: String(impact.totalRuns),
      icon: Bot,
      tone: "text-blue-primary",
      hint: "How many times the agent did work for you in this window — a one-click action, a full play, or an autopilot pass.",
    },
    {
      label: "Accounts worked",
      value: String(impact.accountsTouched),
      icon: Building2,
      tone: "text-text-primary",
      hint: "How many different accounts the agent touched here — drafted for, logged on, or moved forward.",
    },
    {
      label: "Entries logged",
      value: String(impact.entriesLogged),
      icon: ScrollText,
      tone: "text-success",
      hint: "Notes and activity the agent recorded on your accounts (drafts saved, follow-ups set, calls logged) — all left for your review.",
    },
    {
      label: "Pipeline at those accounts",
      value: formatMoney(pipelineAtWorked),
      icon: Wallet,
      tone: "text-text-primary",
      hint: "Total open deal value at the accounts the agent worked. Shown for context — not a claim the agent caused it.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline mb-3"
        >
          <ArrowLeft size={14} strokeWidth={1.9} />
          Back to Agent
        </Link>
        <PageHeader
          title="Agent impact"
          subtitle="Where the agent has invested effort, and the open pipeline at those accounts. An effort view — not a causation claim."
        />
      </div>

      {/* Time-window toggle (#58) */}
      <div className="flex items-center gap-1.5">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={w.key === "quarter" ? "/agent/impact" : `/agent/impact?window=${w.key}`}
            className={cn(
              "text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors",
              win === w.key
                ? "bg-blue-primary text-white border-blue-primary"
                : "bg-surface text-text-secondary border-border hover:border-blue-primary"
            )}
          >
            {w.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="h-[96px] flex flex-col justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
                <Icon size={13} strokeWidth={1.8} className={s.tone} />
                {s.label}
                {s.hint && <InfoHint text={s.hint} />}
              </span>
              <span className={`text-[24px] font-bold tnum leading-none ${s.tone}`}>
                {s.value}
              </span>
            </Card>
          );
        })}
      </div>

      {/* Agent runs over time (#59) */}
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3 flex items-center gap-2">
          <BarChart3 size={16} strokeWidth={1.8} className="text-blue-primary" />
          Agent runs over time
        </h2>
        <Card>
          {impact.totalRuns === 0 ? (
            <p className="text-[13px] text-text-secondary">
              No agent runs in this window yet.
            </p>
          ) : (
            <BarChart data={seriesData} height={160} unit="runs" />
          )}
        </Card>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <Trophy size={16} strokeWidth={1.8} className="text-blue-primary" />
            Most-worked accounts
          </h2>
          {impact.pipelineWide > 0 && (
            <span className="text-[12px] text-text-tertiary flex items-center gap-1.5">
              <Zap size={12} strokeWidth={1.9} className="text-blue-primary" />
              {impact.pipelineWide} pipeline-wide pass
              {impact.pipelineWide === 1 ? "" : "es"}
            </span>
          )}
        </div>

        {impact.rows.length === 0 ? (
          <Card>
            <p className="text-[13px] text-text-secondary">
              The agent hasn&apos;t worked any specific account in the last 90
              days. Let the agent work the queue or let autopilot run to build impact.
            </p>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border-light">
              {impact.rows.map((r, i) => {
                const parts = [
                  r.handled > 0 && `${r.handled} handled`,
                  r.sent > 0 && `${r.sent} sent`,
                  r.escalated > 0 && `${r.escalated} escalated`,
                ].filter(Boolean) as string[];
                return (
                  <li key={r.customer_id}>
                    <Link
                      href={`/customers/${r.customer_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-bold tnum ${
                          RANK_STYLE[i] || "bg-blue-light text-blue-primary"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-text-primary truncate">
                          {r.company}
                        </span>
                        <span className="block text-[12px] text-text-secondary">
                          {parts.join(" · ") || "activity logged"} · last{" "}
                          {formatDateTime(r.lastAt)}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[13px] font-bold text-text-primary tnum">
                          {r.runs} run{r.runs === 1 ? "" : "s"}
                        </span>
                        <span className="block text-[12px] text-text-secondary tnum">
                          {r.openValue > 0 ? formatMoney(r.openValue) : "—"} open
                        </span>
                      </span>
                      <ArrowRight
                        size={15}
                        strokeWidth={1.6}
                        className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
