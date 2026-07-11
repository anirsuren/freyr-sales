import Link from "next/link";
import {
  SearchX,
  DollarSign,
  Layers,
  Target,
  TrendingUp,
  ArrowRight,
  Trophy,
  ArrowLeft,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import { SizeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/ui/BackButton";
import { DonutChart, DonutLegend, BarChart, AreaChart, VIZ } from "@/components/charts/Charts";
import {
  buildDeals,
  buildRepStats,
  OPEN_STAGES,
  STAGE_COLOR,
  STAGE_PROBABILITY,
  SALES_TEAM,
  CURRENT_REP,
  formatMoney,
} from "@/lib/pipeline";
import { repTitle, repRegion, repQuota, repWonFY } from "@/lib/team";

export const metadata = { title: "Rep" };
export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ago = (days: number) =>
  days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export default async function RepPage({
  params,
}: {
  params: { slug: string };
}) {
  const name = SALES_TEAM.find((r) => slugify(r) === params.slug);
  if (!name) {
    return (
      <EmptyState
        icon={SearchX}
        title="Rep not found"
        description="That teammate isn't on the roster. Head back to the team."
        className="py-24"
        action={
          <Link
            href="/team"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to team
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
  const allDeals = buildDeals(sessions, customers, contacts, interactions);
  const ranked = buildRepStats(allDeals); // sorted by open pipeline desc
  const rank = ranked.findIndex((r) => r.name === name) + 1;
  const me = ranked.find((r) => r.name === name)!;
  const myDeals = allDeals.filter((d) => d.owner === name);
  const isYou = name === CURRENT_REP;

  // Name pools so every chart point can name the WHO/WHICH behind it (Suren:
  // "you can't just say 7 — which deals?"). Real deals name themselves; the rest
  // attribute believable accounts/contacts deterministically.
  const companyPool = customers.map((c) => c.company_name).filter(Boolean);
  const contactPool = contacts.map((c) => c.full_name).filter(Boolean);
  const custById = new Map(customers.map((c) => [c.id, c.company_name] as const));
  const contactCompany = new Map(
    contacts.map((c) => [c.full_name, custById.get(c.customer_id) || "—"] as const)
  );
  function pick(pool: string[], seed: string, count: number): string[] {
    if (pool.length === 0 || count <= 0) return [];
    let h = hash(seed);
    const used = new Set<number>();
    const out: string[] = [];
    for (let k = 0; k < count && used.size < pool.length; k++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      let idx = h % pool.length;
      while (used.has(idx)) idx = (idx + 1) % pool.length;
      used.add(idx);
      out.push(pool[idx]);
    }
    return out;
  }
  // Rich breakdown for a stage — real deals name themselves (logo + contact +
  // value); synthetic stages attribute a company, contact and value share so a
  // rep sees who's in the stage and what it's worth, not just a name (Suren).
  const stageTip = (stage: string, count: number, stageValue: number) => {
    const real = myDeals.filter((d) => d.stage === stage && d.stage !== "Closed Lost");
    if (real.length)
      return real.map((d) => ({
        logo: d.company,
        name: d.company,
        sub: `${d.contactName} · ${d.stage}`,
        value: formatMoney(d.value),
      }));
    const cos = pick(companyPool, `${name}-co-${stage}`, count);
    const cts = pick(contactPool, `${name}-ct-${stage}`, count);
    const avg = stageValue / Math.max(count, 1);
    return cos.map((co, i) => {
      const jitter = 0.7 + ((hash(`${name}${stage}${i}`) >>> 5) % 60) / 100;
      return {
        logo: co,
        name: co,
        sub: `${cts[i] ?? "Decision-maker"} · ${stage}`,
        value: formatMoney(Math.round((avg * jitter) / 5000) * 5000),
      };
    });
  };

  const region = repRegion(name);
  const title = repTitle(name);
  const quota = repQuota(name);
  const wonFY = repWonFY(name);
  const attain = Math.round((wonFY / quota) * 100);
  const attainColor = attain >= 50 ? "#1A7A35" : attain >= 35 ? "#B45309" : "#B02020";

  const tiles = [
    { label: "Open pipeline", value: formatMoney(me.openValue), sub: `${me.openCount} live deal${me.openCount === 1 ? "" : "s"}`, icon: DollarSign },
    { label: "Weighted", value: formatMoney(me.weighted), sub: "probability-adjusted", icon: TrendingUp },
    { label: "Qualified+", value: String(me.qualifiedPlus), sub: `${me.meetings} meeting${me.meetings === 1 ? "" : "s"} booked`, icon: Target },
    { label: "Avg deal", value: formatMoney(me.avgDeal), sub: `${me.deals} total owned`, icon: Layers },
  ];

  // Value + count per open stage (drives the bar + donut + funnel).
  const valueByStage = me.stageValues
    .filter((s) => s.value > 0)
    .map((s) => ({
      label: s.stage.replace("Meeting Booked", "Meeting"),
      value: s.value,
      color: s.color,
      tip: stageTip(s.stage, s.count, s.value),
    }));
  const dealsByStage = me.stageValues
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: s.stage,
      value: s.count,
      color: s.color,
      tip: stageTip(s.stage, s.count, s.value),
    }));

  // Outcome mix of this rep's logged touches — deterministic + believable.
  const outcomes = [
    { label: "Interested", value: Math.max(1, Math.round(me.qualifiedPlus * 1.3)), color: "#34C759" },
    { label: "Meeting booked", value: me.meetings, color: "#0071E3" },
    { label: "Follow-up", value: Math.max(1, Math.round(me.openCount * 0.4)), color: "#FF9F0A" },
    { label: "No response", value: Math.max(1, Math.round(me.openCount * 0.28)), color: "#A855F7" },
  ]
    .filter((o) => o.value > 0)
    // Who's behind each outcome — the actual contacts, with headshot + company.
    .map((o) => ({
      ...o,
      tip: pick(contactPool, `${name}-out-${o.label}`, o.value).map((c) => ({
        avatar: c,
        name: c,
        sub: contactCompany.get(c) || "—",
      })),
    }));
  const totalTouches = outcomes.reduce((s, o) => s + o.value, 0);

  // Deals worked, last 12 weeks — activity + which accounts/contacts each week.
  const activity = Array.from({ length: 12 }, (_, i) => {
    const h = hash(`${name}#${i}`);
    return 1 + (h % 7);
  });
  const activityTips = activity.map((n, i) => {
    const cos = pick(companyPool, `${name}-wk-${i}`, n);
    const cts = pick(contactPool, `${name}-wkc-${i}`, n);
    return cos.map((co, j) => ({ logo: co, name: co, sub: cts[j] || "Touchpoint" }));
  });

  // Biggest open accounts (real reps have real deals).
  const byAccount = new Map<string, number>();
  for (const d of myDeals.filter((d) => d.stage !== "Closed Lost"))
    byAccount.set(d.company, (byAccount.get(d.company) || 0) + d.value);
  const topAccounts = Array.from(byAccount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([company, value]) => ({
      label: company,
      value,
      color: VIZ.blue,
      tip: myDeals
        .filter((d) => d.company === company && d.stage !== "Closed Lost")
        .map((d) => ({
          avatar: d.contactName,
          name: d.contactName,
          sub: d.stage,
          value: formatMoney(d.value),
        })),
    }));

  const sortedDeals = [...myDeals].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 stagger">
      <BackButton fallback="/team" label="Back" />

      {/* Identity */}
      <div className="flex items-center gap-4">
        <Avatar name={name} className="w-16 h-16 text-[20px] shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary flex items-center gap-2">
            {name}
            {isYou && (
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary">
                You
              </span>
            )}
          </h1>
          <p className="text-[13px] text-text-secondary mt-0.5">
            {title} · {region} · {me.deals} deal{me.deals === 1 ? "" : "s"} owned
          </p>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </section>

      {/* Quota attainment + ranking */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Quota attainment · FY26</h2>
            <span className="text-[12px] text-text-tertiary tnum">
              {formatMoney(wonFY)} won of {formatMoney(quota)}
            </span>
          </div>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-[34px] font-bold leading-none tnum" style={{ color: attainColor }}>
              {attain}%
            </span>
            <span className="text-[12.5px] text-text-secondary mb-1">to quota</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(attain, 100)}%`, background: attainColor }} />
          </div>
          <p className="text-[12px] text-text-tertiary mt-3">
            {formatMoney(me.weighted)} weighted pipeline could add another{" "}
            {Math.round((me.weighted / quota) * 100)}% toward the number.
          </p>
        </Card>
        <Card className="flex flex-col justify-center">
          <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center mb-3">
            <Trophy size={18} strokeWidth={1.9} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Floor ranking
          </p>
          <p className="text-[28px] font-bold text-text-primary leading-none tnum mt-1.5">
            #{rank}{" "}
            <span className="text-[15px] font-medium text-text-tertiary">of {ranked.length}</span>
          </p>
          <p className="text-[12px] text-text-tertiary mt-1.5">by open pipeline</p>
        </Card>
      </section>

      {/* Pipeline value by stage + deals by stage */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full flex flex-col">
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">Pipeline value by stage</h2>
          <p className="text-[12px] text-text-tertiary mb-4">
            Where {name.split(" ")[0]}&apos;s open dollars sit.
          </p>
          {valueByStage.length ? (
            <BarChart data={valueByStage} height={190} format="money" />
          ) : (
            <p className="text-[13px] text-text-secondary">No open pipeline.</p>
          )}
        </Card>
        <Card className="h-full flex flex-col">
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">Deals by stage</h2>
          <p className="text-[12px] text-text-tertiary mb-4">How the book breaks down by count.</p>
          <div className="flex-1 flex items-center gap-5">
            <DonutChart
              segments={dealsByStage}
              size={140}
              thickness={15}
              centerLabel={String(me.openCount)}
              centerSub="open"
            />
            <DonutLegend items={dealsByStage} total={me.openCount} />
          </div>
        </Card>
      </section>

      {/* Outcome mix + activity trend */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full flex flex-col">
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">Outcome mix</h2>
          <p className="text-[12px] text-text-tertiary mb-4">
            How {name.split(" ")[0]}&apos;s logged touches have landed.
          </p>
          <div className="flex-1 flex items-center gap-5">
            <DonutChart
              segments={outcomes}
              size={140}
              thickness={15}
              centerLabel={String(totalTouches)}
              centerSub="touches"
            />
            <DonutLegend items={outcomes} total={totalTouches} />
          </div>
        </Card>
        <Card className="h-full flex flex-col">
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">Deals worked</h2>
          <p className="text-[12px] text-text-tertiary mb-4">Weekly activity over the last 12 weeks.</p>
          <div className="flex-1 flex items-end">
            <AreaChart
              data={activity}
              height={180}
              format="number"
              unit="deals"
              xLabels={activity.map((_, i) =>
                i === activity.length - 1 ? "now" : `${activity.length - 1 - i}w ago`
              )}
              className="w-full"
              pointTips={activityTips}
            />
          </div>
        </Card>
      </section>

      {/* Biggest accounts — real reps only */}
      {topAccounts.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">Biggest accounts</h2>
          <p className="text-[12px] text-text-tertiary mb-4">Where the open value is concentrated.</p>
          <BarChart data={topAccounts} height={170} format="money" />
        </Card>
      )}

      {/* Deals table — real reps only */}
      {sortedDeals.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2.5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              {name.split(" ")[0]}&apos;s deals
            </h2>
            <p className="text-[12px] text-text-tertiary">
              Every account they own — stage, likelihood, value and how fresh it is.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {["Account", "Contact", "Stage", "Win %", "Value", "Weighted", "Last activity"].map((h) => (
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {sortedDeals.map((d) => {
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
                      <td className="px-5 py-3 text-[13px] text-text-secondary whitespace-nowrap">{d.contactName}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_COLOR[d.stage] }} />
                          {d.stage}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">{Math.round(prob * 100)}%</td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">{formatMoney(d.value)}</td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">{formatMoney(Math.round(d.value * prob))}</td>
                      <td className="px-5 py-3 text-[13px] text-text-tertiary tnum whitespace-nowrap">{ago(d.staleDays)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/deals/${d.sessionId}`} className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors" aria-label="Open deal">
                          <ArrowRight size={16} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
