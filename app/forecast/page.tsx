import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { Term } from "@/components/ui/Tooltip";
import {
  buildDeals,
  STAGES,
  STAGE_PROBABILITY,
  REPS,
  CURRENT_REP,
  formatMoney,
} from "@/lib/pipeline";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const QUOTA = 3_000_000;

export default async function ForecastPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const deals = buildDeals(sessions, customers, contacts, interactions);
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const bestCase = open.reduce((s, d) => s + d.value, 0);
  const commit = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  const commitPct = Math.min(100, Math.round((commit / QUOTA) * 100));
  const bestPct = Math.min(100, Math.round((bestCase / QUOTA) * 100));
  const gap = Math.max(0, QUOTA - commit);

  const byStage = STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stage === stage);
    const value = ds.reduce((s, d) => s + d.value, 0);
    return {
      stage,
      count: ds.length,
      value,
      weighted: value * (STAGE_PROBABILITY[stage] ?? 0),
      prob: Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100),
    };
  });

  const byRep = REPS.map((name) => {
    const rd = open.filter((d) => d.owner === name);
    const repOpen = rd.reduce((s, d) => s + d.value, 0);
    const repWeighted = deals
      .filter((d) => d.owner === name)
      .reduce((s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0), 0);
    return {
      name,
      open: repOpen,
      weighted: repWeighted,
      pct: Math.round((repWeighted / QUOTA) * 100),
    };
  }).sort((a, b) => b.weighted - a.weighted);
  const maxRep = Math.max(1, ...byRep.map((r) => r.weighted));

  const Stat = ({
    label,
    value,
    accent,
    hint,
  }: {
    label: string;
    value: string;
    accent?: boolean;
    hint?: string;
  }) => (
    <Card className="h-[108px] flex flex-col justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary inline-flex items-center gap-1">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      <span
        className={`text-[28px] font-bold leading-none tnum ${
          accent ? "text-blue-primary" : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </Card>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Forecast"
        subtitle="How much revenue you're likely to land this quarter, and how that tracks against your target."
      />

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat
          label="Commit (weighted)"
          value={formatMoney(commit)}
          accent
          hint="The realistic number — every open deal's value multiplied by its chance of closing, added up. What you can reasonably promise."
        />
        <Stat
          label="Best case (open)"
          value={formatMoney(bestCase)}
          hint="The optimistic number — the full value of every open deal if they ALL closed. The ceiling, not the expectation."
        />
        <Stat
          label="Quarter quota"
          value={formatMoney(QUOTA)}
          hint="Your revenue target for the quarter."
        />
        <Stat
          label="Gap to quota"
          value={formatMoney(gap)}
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
            className="absolute inset-y-0 left-0 rounded-full bg-blue-subtle"
            style={{ width: `${bestPct}%` }}
            title={`Best case ${formatMoney(bestCase)}`}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-primary"
            style={{ width: `${commitPct}%` }}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By stage */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-1.5 px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold text-text-primary">
              By stage
            </h2>
            <InfoHint text="Your pipeline split out by step of the process. 'Value' is the full amount; 'Weighted' trims it by each step's odds of closing — the realistic contribution to your number." />
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface border-y border-border-light">
                {["Stage", "Deals", "Value", "Weighted"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {byStage.map((s) => (
                <tr key={s.stage}>
                  <td className="px-5 py-3 text-[13px] text-text-primary">
                    {s.stage}
                    <span className="text-text-tertiary tnum"> · {s.prob}%</span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-text-secondary tnum">
                    {s.count}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-text-secondary tnum">
                    {formatMoney(s.value)}
                  </td>
                  <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum">
                    {formatMoney(s.weighted)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* By rep */}
        <Card>
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="text-[15px] font-semibold text-text-primary">
              By rep
            </h2>
            <InfoHint text="Each teammate's realistic (weighted) forecast and how much of the team target it covers." />
          </div>
          <div className="space-y-4">
            {byRep.map((r) => (
              <div key={r.name} className="flex items-center gap-3">
                <Avatar name={r.name} className="w-8 h-8 text-[12px]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[13px] font-medium text-text-primary truncate flex items-center gap-1.5">
                      {r.name}
                      {r.name === CURRENT_REP && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary">
                          You
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] text-text-secondary tnum shrink-0">
                      {formatMoney(r.weighted)}{" "}
                      <Term k="wtd" side="bottom" align="right" underline={false} className="underline decoration-dotted decoration-text-tertiary/50 underline-offset-2">
                        wtd
                      </Term>{" "}
                      · {r.pct}% of quota
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-primary"
                      style={{ width: `${(r.weighted / maxRep) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
