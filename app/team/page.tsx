import {
  Users,
  Wallet,
  TrendingUp,
  CalendarCheck,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { buildDeals, buildRepStats, formatMoney } from "@/lib/pipeline";
import {
  repSlug,
  repPhone,
  teamsChatUrl,
  repTitle,
  repRole,
  repRegion,
  repQuota,
  repWonFY,
  repTrend,
} from "@/lib/team";
import { TeamRoster, type RosterRep } from "@/components/team/TeamRoster";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

// Representative open deals for ONE stage of a rep who has no real deals in the
// seed (the synthetic roster) — so hovering any donut slice / rep still shows
// the deals behind the number, not a dead aggregate. Deterministic from the rep
// name + stage so it never shuffles on reload (mirrors forecast's synthDealsForRep).
function synthStageDeals(
  name: string,
  stage: string,
  stageValue: number,
  customers: { id: string; company_name: string }[],
  contacts: { customer_id: string; full_name: string }[]
) {
  if (stageValue <= 0 || customers.length === 0) return [];
  const seed = (name + stage).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const count = 1 + (seed % 3); // 1 … 3 representative deals
  const splits = [0.42, 0.31, 0.27].slice(0, count);
  const sum = splits.reduce((a, b) => a + b, 0);
  return splits.map((frac, k) => {
    const cust = customers[(seed + k * 7) % customers.length];
    const contact = contacts.find((c) => c.customer_id === cust.id);
    return {
      company: cust.company_name,
      contact: contact?.full_name || "Primary contact",
      value: Math.round((stageValue * (frac / sum)) / 1000) * 1000,
    };
  });
}

export default async function TeamPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const stats = buildRepStats(deals);

  const totalPipeline = stats.reduce((s, r) => s + r.openValue, 0);
  const totalWeighted = stats.reduce((s, r) => s + r.weighted, 0);
  const totalMeetings = stats.reduce((s, r) => s + r.meetings, 0);
  const totalOpen = stats.reduce((s, r) => s + r.openCount, 0);

  const reps: RosterRep[] = stats.map((r) => {
    // The actual open deals behind each stage — real ones for the four deal-
    // owning reps, deterministic representatives for the synthetic roster — so
    // hovering a donut slice / a rep row shows company + contact + value, not
    // just the aggregate (Suren: "every graph has to tell me who").
    const repRealDeals = deals.filter(
      (d) => d.owner === r.name && d.stage !== "Closed Lost"
    );
    const stageDeals: Record<
      string,
      { company: string; contact: string; value: number }[]
    > = {};
    for (const sv of r.stageValues) {
      if (sv.value <= 0) continue;
      const real = repRealDeals
        .filter((d) => d.stage === sv.stage)
        .sort((a, b) => b.value - a.value)
        .map((d) => ({ company: d.company, contact: d.contactName, value: d.value }));
      stageDeals[sv.stage] =
        real.length > 0
          ? real
          : synthStageDeals(r.name, sv.stage, sv.value, customers, contacts);
    }
    return {
      name: r.name,
      slug: repSlug(r.name),
      title: repTitle(r.name),
      role: repRole(r.name),
      region: repRegion(r.name),
      phone: repPhone(r.name),
      teamsUrl: teamsChatUrl(r.name),
      openValue: r.openValue,
      weighted: r.weighted,
      openCount: r.openCount,
      meetings: r.meetings,
      quota: repQuota(r.name),
      wonFY: repWonFY(r.name),
      trend: repTrend(r.name),
      stageValues: r.stageValues.map((s) => ({
        stage: s.stage,
        color: s.color,
        value: s.value,
      })),
      stageDeals,
    };
  });

  const rollup = [
    { icon: Users, label: "Team members", value: String(reps.length), sub: "on the sales floor" },
    { icon: Wallet, label: "Team pipeline", value: formatMoney(totalPipeline), sub: `across ${totalOpen} open deals` },
    { icon: TrendingUp, label: "Weighted forecast", value: formatMoney(totalWeighted), sub: "probability-adjusted" },
    { icon: CalendarCheck, label: "Meetings booked", value: String(totalMeetings), sub: "live across the team" },
  ];

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Your Freyr sales floor — message anyone on Teams or call them directly, and see what each rep is working."
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {rollup.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="h-[132px] flex flex-col justify-between">
              <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {k.label}
                </p>
                <p className="text-[26px] font-bold text-text-primary leading-none tnum mt-1.5">
                  {k.value}
                </p>
                <p className="text-[12px] text-text-tertiary mt-1.5 truncate">{k.sub}</p>
              </div>
            </Card>
          );
        })}
      </section>

      <TeamRoster reps={reps} />
    </div>
  );
}
