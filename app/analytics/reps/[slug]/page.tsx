import Link from "next/link";
import {
  ArrowLeft,
  SearchX,
  DollarSign,
  Layers,
  Target,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import { SizeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart, BarChart, VIZ } from "@/components/charts/Charts";
import {
  buildDeals,
  STAGES,
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  REPS,
  CURRENT_REP,
  formatMoney,
} from "@/lib/pipeline";

export const metadata = { title: "Rep" };
export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ago = (days: number) =>
  days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;

export default async function RepPage({
  params,
}: {
  params: { slug: string };
}) {
  const name = REPS.find((r) => slugify(r) === params.slug);
  if (!name) {
    return (
      <EmptyState
        icon={SearchX}
        title="Rep not found"
        description="That teammate isn't on the roster. Head back to Analytics."
        className="py-24"
        action={
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to analytics
          </Link>
        }
      />
    );
  }

  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const deals = buildDeals(sessions, customers, contacts, interactions).filter(
    (d) => d.owner === name
  );
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const weighted = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  const qualifiedPlus = deals.filter(
    (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
  ).length;
  const meetings = deals.filter((d) => d.stage === "Meeting Booked").length;
  const avg = open.length ? Math.round(openValue / open.length) : 0;

  // Donut — full deal mix (incl. lost), by count.
  const stageSegments = STAGES.map((st) => ({
    label: st,
    value: deals.filter((d) => d.stage === st).length,
    color: STAGE_COLOR[st],
  })).filter((s) => s.value > 0);

  // Value sitting in each open stage (the real pipeline weight).
  const valueByStage = OPEN_STAGES.map((st) => ({
    label: st,
    value: open.filter((d) => d.stage === st).reduce((s, d) => s + d.value, 0),
    color: STAGE_COLOR[st],
  })).filter((s) => s.value > 0);

  // Where the money is — top accounts by open value.
  const byAccount = new Map<string, number>();
  for (const d of open)
    byAccount.set(d.company, (byAccount.get(d.company) || 0) + d.value);
  const topAccounts = Array.from(byAccount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([company, value]) => ({ label: company, value, color: VIZ.blue }));

  const sorted = [...deals].sort((a, b) => b.value - a.value);
  const isYou = name === CURRENT_REP;

  const tiles = [
    { label: "Open pipeline", value: formatMoney(openValue), sub: `${open.length} live deal${open.length === 1 ? "" : "s"}`, icon: DollarSign },
    { label: "Weighted", value: formatMoney(Math.round(weighted)), sub: "probability-adjusted", icon: TrendingUp },
    { label: "Qualified+", value: String(qualifiedPlus), sub: `${meetings} meeting${meetings === 1 ? "" : "s"} booked`, icon: Target },
    { label: "Avg deal", value: formatMoney(avg), sub: `${deals.length} total owned`, icon: Layers },
  ];

  return (
    <div className="space-y-6 stagger">
      <Link
        href="/analytics"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={15} strokeWidth={1.8} />
        All reps
      </Link>

      <div className="flex items-center gap-4">
        <Avatar name={name} className="w-14 h-14 text-[18px]" />
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary flex items-center gap-2">
            {name}
            {isYou && (
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary">
                You
              </span>
            )}
          </h1>
          <p className="text-[13px] text-text-secondary mt-0.5">
            Account executive · {deals.length} deal{deals.length === 1 ? "" : "s"} owned
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </section>

      {deals.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Deals by stage — donut + one-column legend */}
          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">
              Deals by stage
            </h2>
            <p className="text-[12px] text-text-tertiary mb-4">
              Where {name.split(" ")[0]}&apos;s deals sit right now.
            </p>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                <DonutChart segments={stageSegments} size={130} thickness={14} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[24px] font-bold leading-none tnum text-text-primary">
                    {deals.length}
                  </span>
                  <span className="text-[10px] text-text-tertiary mt-0.5">deals</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                {stageSegments.map((s) => (
                  <span key={s.label} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-text-secondary truncate">{s.label}</span>
                    <span className="font-semibold text-text-primary tnum ml-auto">{s.value}</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* Pipeline value by stage */}
          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">
              Pipeline value by stage
            </h2>
            <p className="text-[12px] text-text-tertiary mb-4">
              How the open value is distributed.
            </p>
            {valueByStage.length ? (
              <BarChart data={valueByStage} height={150} format="money" />
            ) : (
              <p className="text-[13px] text-text-secondary">No open pipeline.</p>
            )}
          </Card>

          {/* Top accounts by value */}
          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">
              Biggest accounts
            </h2>
            <p className="text-[12px] text-text-tertiary mb-4">
              Where the open value is concentrated.
            </p>
            {topAccounts.length ? (
              <BarChart data={topAccounts} height={150} format="money" />
            ) : (
              <p className="text-[13px] text-text-secondary">No open pipeline.</p>
            )}
          </Card>
        </section>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {name.split(" ")[0]}&apos;s deals
          </h2>
          <p className="text-[12px] text-text-tertiary">
            Every account they own — stage, likelihood, value and how fresh it is.
          </p>
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-text-secondary">No deals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {["Account", "Contact", "Stage", "Win %", "Value", "Weighted", "Last activity"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {sorted.map((d) => {
                  const prob = STAGE_PROBABILITY[d.stage] ?? 0;
                  return (
                    <tr key={d.sessionId} className="hover:bg-surface transition-colors group">
                      <td className="px-5 py-3">
                        <Link href={`/deals/${d.sessionId}`} className="flex items-center gap-2.5">
                          <CompanyLogo name={d.company} className="w-7 h-7 text-[10px]" />
                          <span className="text-[13px] font-semibold text-text-primary group-hover:text-blue-primary">
                            {d.company}
                          </span>
                          <SizeBadge tier={d.sizeTier} />
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary whitespace-nowrap">
                        {d.contactName}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_COLOR[d.stage] }} />
                          {d.stage}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">
                        {Math.round(prob * 100)}%
                      </td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">
                        {formatMoney(d.value)}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">
                        {formatMoney(Math.round(d.value * prob))}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-tertiary tnum whitespace-nowrap">
                        {ago(d.staleDays)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/deals/${d.sessionId}`}
                          className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors"
                          aria-label="Open deal"
                        >
                          <ArrowRight size={16} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
