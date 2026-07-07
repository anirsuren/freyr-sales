import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Flame,
  HeartPulse,
  Wallet,
  Check,
  ArrowRight,
  Building2,
  Zap,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ReviewActions } from "@/components/agent/ReviewActions";
import { buildWeeklyReview, buildActivityByAccount } from "@/lib/agent";
import { narrateReview } from "@/lib/claude";
import { buildDeals, formatMoney } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Weekly Review" };
export const dynamic = "force-dynamic";

export default async function WeeklyReviewPage() {
  const db = getDb();
  const [sessions, cust, contacts, interactions, runs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentRuns.list(),
  ]);

  const deals = buildDeals(sessions, cust, contacts, interactions);
  const atRisk = cust.filter(
    (c) =>
      accountHealth({
        interactions: interactions.filter((i) => i.customer_id === c.id),
        deals: deals.filter((d) => d.customerId === c.id),
        contactCount: contacts.filter((x) => x.customer_id === c.id).length,
      }).band === "at_risk"
  ).length;

  const review = buildWeeklyReview({ runs, deals, atRisk });
  const activity = buildActivityByAccount(runs);
  const openMoney = formatMoney(review.openAtStake);
  const narrated = await narrateReview(review, openMoney);
  const summary =
    narrated ||
    `This week I ran ${review.runsThisWeek} action${
      review.runsThisWeek === 1 ? "" : "s"
    }; ${review.cooling} deal${review.cooling === 1 ? "" : "s"} cooling and ${
      review.atRisk
    } account${review.atRisk === 1 ? "" : "s"} at risk, with ${openMoney} open at stake.`;

  const stats = [
    { label: "Agent actions", value: String(review.runsThisWeek), icon: Bot, tone: "text-blue-primary" },
    { label: "Deals cooling", value: String(review.cooling), icon: Flame, tone: "text-error" },
    { label: "At-risk accounts", value: String(review.atRisk), icon: HeartPulse, tone: "text-warning" },
    { label: "Open at stake", value: openMoney, icon: Wallet, tone: "text-text-primary" },
  ];

  return (
    <div className="max-w-[820px] space-y-6">
      <div>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline mb-3"
        >
          <ArrowLeft size={14} strokeWidth={1.9} />
          Back to Agent
        </Link>
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            title="Weekly review"
            subtitle="What the agent changed this week, and what's at stake heading into next."
          />
          <div className="shrink-0 mt-1">
            <ReviewActions />
          </div>
        </div>
      </div>

      <Card className="bg-blue-light/40 border-blue-subtle">
        <p className="text-[14px] text-text-primary leading-relaxed">{summary}</p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="h-[96px] flex flex-col justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
                <Icon size={13} strokeWidth={1.8} className={s.tone} />
                {s.label}
              </span>
              <span className={`text-[24px] font-bold tnum leading-none ${s.tone}`}>
                {s.value}
              </span>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          What&apos;s at stake
        </h2>
        {review.topDeals.length === 0 ? (
          <p className="text-[13px] text-text-secondary">No open deals right now.</p>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border-light">
              {review.topDeals.map((d) => (
                <li key={d.sessionId}>
                  <Link
                    href={`/deals/${d.sessionId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text-primary truncate">
                        {d.company}
                      </span>
                      <span className="block text-[12px] text-text-secondary">
                        {d.stage}
                      </span>
                    </span>
                    <span className="text-[13px] font-bold text-text-primary tnum shrink-0">
                      {formatMoney(d.value)}
                    </span>
                    <ArrowRight
                      size={15}
                      strokeWidth={1.6}
                      className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Agent activity by account
          </h2>
          {activity.pipelineWide > 0 && (
            <span className="text-[12px] text-text-tertiary flex items-center gap-1.5">
              <Zap size={12} strokeWidth={1.9} className="text-blue-primary" />
              {activity.pipelineWide} pipeline-wide pass
              {activity.pipelineWide === 1 ? "" : "es"}
            </span>
          )}
        </div>
        {activity.accounts.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No account-specific agent work in the last 7 days.
          </p>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border-light">
              {activity.accounts.map((a) => (
                <li key={a.customer_id}>
                  <Link
                    href={`/customers/${a.customer_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
                  >
                    <span className="w-7 h-7 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                      <Building2 size={14} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text-primary truncate">
                        {a.company}
                      </span>
                      <span className="block text-[12px] text-text-secondary">
                        {[
                          a.handled > 0 && `${a.handled} handled`,
                          a.sent > 0 && `${a.sent} sent`,
                          a.escalated > 0 && `${a.escalated} escalated`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "activity logged"}
                      </span>
                    </span>
                    <span className="text-[12px] font-semibold text-text-primary tnum shrink-0">
                      {a.runs} run{a.runs === 1 ? "" : "s"}
                    </span>
                    <ArrowRight
                      size={15}
                      strokeWidth={1.6}
                      className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          What the agent did this week
        </h2>
        {review.changed.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No agent runs in the last 7 days.
          </p>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border-light">
              {review.changed.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-7 h-7 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                    <Check size={14} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-text-primary truncate">
                    {c.title}
                  </span>
                  <span className="text-[12px] text-text-tertiary tnum shrink-0">
                    {formatDate(c.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
