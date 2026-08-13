import Link from "next/link";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { ServiceTag, offeringMark } from "@/components/ui/OfferingIcon";
import { HoverCard } from "@/components/ui/HoverCard";
import { DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { ForecastExport } from "@/components/forecast/ForecastExport";
import { ByRepChart } from "@/components/forecast/ByRepChart";
import { ForecastRisk } from "@/components/forecast/ForecastRisk";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleCheck,
  Flag,
  ShieldAlert,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  buildDeals,
  ROTTING_DAYS,
  STAGES,
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_PROBABILITY,
  isCurrentRep,
  repOwnsDeal,
  salesTeamFor,
  repForecast,
  formatMoney,
} from "@/lib/pipeline";
import { getDataMode } from "@/lib/dataMode";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/currentUser";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const QUOTA = 3_000_000;

// Stage → the chart layer's serializable icon key, so every stage legend/tip
// carries its own glyph rather than an anonymous coloured dot (Anir, Jul 27).
const TIP_ICON_KEY: Record<string, string> = {
  Prospect: "prospect",
  Engaged: "engaged",
  Qualified: "qualified",
  "Meeting Booked": "meeting",
  "Closed Lost": "lost",
};

// Representative open deals for a rep who has no real ones in the seed (the
// synthetic roster) — so hovering ANY rep's bar shows the deals behind it, not
// a dead end. Deterministic from the rep name so it never shuffles on reload.
function synthDealsForRep(
  name: string,
  openValue: number,
  customers: { id: string; company_name: string }[],
  contacts: { customer_id: string; full_name: string }[]
) {
  if (openValue <= 0 || customers.length === 0) return [];
  const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const splits = [0.42, 0.31, 0.27];
  return splits.map((frac, k) => {
    const cust = customers[(seed + k * 5) % customers.length];
    const contact = contacts.find((c) => c.customer_id === cust.id);
    return {
      company: cust.company_name,
      contact: contact?.full_name || "Primary contact",
      value: Math.round((openValue * frac) / 1000) * 1000,
    };
  });
}

export default async function ForecastPage() {
  const currentUser = await getCurrentUser();
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const deals = buildDeals(sessions, customers, contacts, interactions);
  if (getDataMode() === "live" && deals.length === 0) {
    return <EmptyState icon={Target} title="No forecast yet" description="Add an account and create the first deal to start your real forecast." />;
  }
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const bestCase = open.reduce((s, d) => s + d.value, 0);
  const commit = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  // True attainment for the labels — best case can exceed 100% of quota, which
  // is good news worth showing, not capping away. The bars below cap at 100% so
  // they never overflow the track.
  const commitPct = Math.round((commit / QUOTA) * 100);
  const bestPct = Math.round((bestCase / QUOTA) * 100);
  const commitBar = Math.min(100, commitPct);
  const bestBar = Math.min(100, bestPct);
  const gap = Math.max(0, QUOTA - commit);
  const forecastConfidence = bestCase > 0 ? Math.round((commit / bestCase) * 100) : 0;
  const staleOpen = open.filter((deal) => deal.staleDays > ROTTING_DAYS);
  const riskWeighted = staleOpen.reduce(
    (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
    0
  );
  const activeWeighted = Math.max(0, commit - riskWeighted);
  const riskPct = commit > 0 ? Math.round((riskWeighted / commit) * 100) : 0;
  const lateStageWeighted = open
    .filter((deal) => deal.stage === "Qualified" || deal.stage === "Meeting Booked")
    .reduce(
      (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
      0
    );
  const lateStagePct = commit > 0 ? Math.round((lateStageWeighted / commit) * 100) : 0;
  const priorityDeals = [...open]
    .sort(
      (a, b) =>
        b.value * (STAGE_PROBABILITY[b.stage] ?? 0) -
        a.value * (STAGE_PROBABILITY[a.stage] ?? 0)
    )
    .slice(0, 5);
  const topThreeWeighted = priorityDeals
    .slice(0, 3)
    .reduce(
      (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0),
      0
    );
  const concentrationPct = commit > 0 ? Math.round((topThreeWeighted / commit) * 100) : 0;

  const byStage = STAGES.map((stage) => {
    const ds = deals
      .filter((d) => d.stage === stage)
      .sort((a, b) => b.value - a.value);
    const value = ds.reduce((s, d) => s + d.value, 0);
    return {
      stage,
      count: ds.length,
      value,
      weighted: value * (STAGE_PROBABILITY[stage] ?? 0),
      prob: Math.round((STAGE_PROBABILITY[stage] ?? 0) * 100),
      // The actual deals sitting in this stage — so any graph built from this
      // can show WHICH deals on hover (Suren), not just the totals.
      deals: ds.map((d) => ({
        company: d.company,
        contact: d.contactName,
        value: d.value,
      })),
    };
  });

  // The whole sales floor (Suren: 20 reps, "it has to look full"). Reps who own
  // real deals use those numbers; the rest of the roster gets a deterministic
  // mock forecast so every teammate has a full, believable pipeline.
  const byRep = salesTeamFor(currentUser).map((rep) => {
    const realOpen = open
      .filter((d) => repOwnsDeal(rep, d))
      .reduce((s, d) => s + d.value, 0);
    const realWeighted = deals
      .filter((d) => repOwnsDeal(rep, d))
      .reduce((s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0), 0);
    const synth = repForecast(rep.name);
    const isCurrentUser = isCurrentRep(rep, currentUser.memberId);
    const weighted =
      realWeighted > 0 ? realWeighted : isCurrentUser ? 0 : synth.weighted;
    const repOpen = realOpen > 0 ? realOpen : isCurrentUser ? 0 : synth.open;
    // This rep's actual open deals — so hovering their bar shows what they're
    // working, not just the total (Suren). Synthetic reps have none.
    const realRepDeals = deals
      .filter((d) => repOwnsDeal(rep, d) && d.stage !== "Closed Lost")
      .sort((a, b) => b.value - a.value)
      .map((d) => ({ company: d.company, contact: d.contactName, value: d.value }));
    const repDeals =
      realRepDeals.length > 0
        ? realRepDeals
        : isCurrentUser
          ? []
          : synthDealsForRep(rep.name, repOpen, customers, contacts);
    return {
      identityKey: rep.key,
      memberId: rep.memberId,
      name: rep.name,
      slug: rep.slug,
      open: repOpen,
      weighted,
      pct: Math.round((weighted / QUOTA) * 100),
      deals: repDeals,
    };
  }).sort((a, b) => b.weighted - a.weighted);

  const Stat = ({
    label,
    value,
    raw,
    accent,
    hint,
    icon: Icon,
  }: {
    label: string;
    value: string;
    raw?: number;
    accent?: boolean;
    hint?: string;
    icon: LucideIcon;
  }) => (
    <Card className="h-[116px] p-5 flex flex-col">
      <span
        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mb-2 ${
          accent
            ? "bg-blue-primary text-white"
            : "bg-blue-light text-blue-primary"
        }`}
      >
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary inline-flex items-center gap-1">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      <span
        className={`mt-auto text-[25px] font-bold leading-none tnum ${
          accent ? "text-blue-primary" : "text-text-primary"
        }`}
      >
        {raw != null ? <CountUp value={raw} unit="money" /> : value}
      </span>
    </Card>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Forecast"
        subtitle="How much revenue you're likely to land this quarter, and how that tracks against your target."
        action={
          <ForecastExport
            commit={commit}
            bestCase={bestCase}
            quota={QUOTA}
            gap={gap}
            byStage={byStage}
            byRep={byRep}
          />
        }
      />

      <section
        data-tour="forecast-summary"
        className="grid grid-cols-1 sm:grid-cols-4 gap-4"
      >
        <Stat
          label="Commit (weighted)"
          value={formatMoney(commit)}
          raw={commit}
          accent
          icon={CircleCheck}
          hint="The realistic number: every open deal's value multiplied by its chance of closing, added up. What you can reasonably promise."
        />
        <Stat
          label="Best case (open)"
          value={formatMoney(bestCase)}
          raw={bestCase}
          icon={TrendingUp}
          hint="The optimistic number: the full value of every open deal if they ALL closed. The ceiling, not the expectation."
        />
        <Stat
          label="Quarter quota"
          value={formatMoney(QUOTA)}
          raw={QUOTA}
          icon={Target}
          hint="Your revenue target for the quarter."
        />
        <Stat
          label="Gap to quota"
          value={formatMoney(gap)}
          raw={gap}
          icon={Flag}
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
            <InfoHint text={"Solid blue is what you realistically expect to close.\nLight blue behind it is the best case.\nThe further right they reach, the closer you are to target."} />
          </span>
          <span className="text-[13px] text-text-secondary tnum">
            {commitPct}% committed · {bestPct}% best case
          </span>
        </div>
        <div className="relative h-4 rounded-full bg-surface overflow-hidden">
          <div
            className="chart-grow-x absolute inset-y-0 left-0 rounded-full bg-blue-subtle"
            style={{ width: `${bestBar}%` }}
            title={`Best case ${formatMoney(bestCase)}`}
          />
          <div
            className="chart-grow-x absolute inset-y-0 left-0 rounded-full bg-blue-primary"
            style={{ width: `${commitBar}%`, animationDelay: "0.12s" }}
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

      {/* By stage — a real graph, not a table (Suren). Each stage is a full
          "value" column (light) with the "weighted" contribution filled solid,
          so you SEE how each step's odds trim the pipeline down to your number. */}
      {/* Two panels side by side: the value→weighted bars packed on the left,
          the commit-composition donut filling the right (Suren: bars next to
          each other, another graph on the right, no dead space). */}
      <Card className="p-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-0">
          {/* LEFT — value vs weighted per stage. A flex column so the plot can
              stretch to the full height the (taller) donut panel gives the row
             , the bars scale with it and never leave a dead band below
              (Anir: "make the bar chart on the left bigger so it's properly
              scaled"). */}
          <div className="xl:pr-5 flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <h2 className="text-[15px] font-semibold text-text-primary">By stage</h2>
              <InfoHint text={"Your pipeline broken down by step.\nThe light column is the full value.\nThe solid part is that value cut down by how likely each step is to close."} />
            </div>
            <div className="flex items-center gap-4 mb-3 text-[11px] text-text-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary/20" /> Total value
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary" /> Weighted (likely)
              </span>
            </div>
            {(() => {
              const maxV = Math.max(...byStage.map((s) => s.value), 1);
              // Share of the track the TALLEST bar is allowed to take. The
              // remainder is the room every bar's own value label lives in —
              // the label is now a child of its bar (see below), so it needs
              // headroom above the tallest column or it would ride out of the
              // top of the plot. Same idea as BarChart's `labelRoom`, expressed
              // as a % because this track is stretchy rather than fixed.
              const PLOT_CEILING = 88;
              return (
                <div data-stage-plot className="flex-1 flex justify-center gap-4">
                  {byStage.map((s, i) => {
                    const color = STAGE_COLOR[s.stage];
                    // Percent of the stretchy track, not fixed pixels — the
                    // tallest stage always reaches the top of whatever height
                    // the row gives us.
                    const barPct = Math.max((s.value / maxV) * PLOT_CEILING, 3);
                    const wFrac = s.value > 0 ? s.weighted / s.value : 0;
                    const stageHover = (
                      <div>
                        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary mb-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          {s.stage}
                        </p>
                        <div className="space-y-1.5">
                          {[
                            ["Deals", String(s.count)],
                            ["Total value", formatMoney(s.value)],
                            ["Weighted (likely)", formatMoney(s.weighted)],
                            ["Odds of closing", `${s.prob}%`],
                          ].map(([l, v]) => (
                            <div key={l} className="flex items-center justify-between gap-3 text-[12.5px]">
                              <span className="text-text-tertiary">{l}</span>
                              <span className="font-semibold text-text-primary tnum">{v}</span>
                            </div>
                          ))}
                        </div>
                        {s.deals.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-border-light">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                              Deals in this stage
                            </p>
                            <div className="space-y-1.5">
                              {s.deals.slice(0, 5).map((d) => (
                                <div
                                  key={`${d.company}-${d.contact}`}
                                  className="flex items-center gap-2 text-[12px]"
                                >
                                  <CompanyLogo name={d.company} className="w-[18px] h-[18px] text-[7px] shrink-0" />
                                  <span className="min-w-0 flex-1 leading-tight">
                                    <span className="block truncate font-medium text-text-primary">
                                      {d.company}
                                    </span>
                                    <span className="block truncate text-[10.5px] text-text-tertiary">
                                      {d.contact}
                                    </span>
                                  </span>
                                  <span className="tnum text-text-secondary shrink-0">
                                    {formatMoney(d.value)}
                                  </span>
                                </div>
                              ))}
                              {s.deals.length > 5 && (
                                <p className="text-[10.5px] text-text-tertiary">
                                  +{s.deals.length - 5} more
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-text-secondary leading-relaxed">
                          {s.count === 0
                            ? "No deals in this stage."
                            : `The ${s.prob}% close-odds trims ${formatMoney(s.value)} down to ${formatMoney(s.weighted)} of realistic pipeline.`}
                        </p>
                      </div>
                    );
                    return (
                      <div
                        key={s.stage}
                        className="group flex w-[104px] shrink-0 flex-col items-center"
                      >
                        {/* Stretchy track: fills the row height (so the chart
                            is always as tall as the donut panel beside it) with
                            a floor for small screens. The bar is absolutely
                            positioned at the baseline with a %-height, which
                            resolves reliably against the track. Only the bar
                            itself pops the breakdown, not the empty space
                            above a short column (Suren). */}
                        <div className="relative w-full flex-1 min-h-[216px]">
                          <div
                            className="absolute inset-x-0 bottom-0"
                            style={{ height: `${barPct}%` }}
                          >
                            <HoverCard
                              side="top"
                              width={240}
                              delayMs={0}
                              content={stageHover}
                              clearAncestor="[data-stage-plot]"
                              // Hug THIS bar's own top edge, lifted past its own
                              // value label, instead of clearing the whole plot.
                              // A tall column's card sits high and a short
                              // column's card drops down to meet it, rather than
                              // every card parking at one fixed height above the
                              // graph (Suren, Jul 27: "same thing as what I said
                              // before"). `clearAncestor` still governs the
                              // flip-below case, so it never lands on the names.
                              tightAbove={24}
                              className="h-full w-full flex items-end justify-center cursor-pointer"
                            >
                              {/* The value label and the column are ONE object.
                                  The label is pinned to the top edge of THIS
                                  bar, so a short column's number sits just
                                  above that column instead of floating in a
                                  flat row at the top of the plot, and when the
                                  bar lifts under the cursor the number rides up
                                  with it, exactly as far and at exactly the
                                  same speed (Suren, Jul 27: "the numbers are
                                  supposed to go above the bar"). It is a
                                  SIBLING of the growth wrapper, not a child, so
                                  the load animation's scaleY never squashes the
                                  type. Closed Lost's $0 keeps its own legible
                                  label above its 3%-floor stub. */}
                              <div className="relative h-full w-full rounded-t-lg flex justify-center transition-all duration-150 hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.18)]">
                                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-text-primary tnum">
                                  {formatMoney(s.weighted)}
                                </span>
                                {/* Growth wrapper grows the column up from the
                                    baseline on load; the lift lives on the
                                    parent so the two transforms don't fight. */}
                                <div
                                  className="chart-bar h-full w-full rounded-t-lg flex items-end justify-center"
                                  style={{
                                    background: `${color}33`,
                                    animationDelay: `${i * 70}ms`,
                                  }}
                                >
                                  {/* Weighted (likely) fill sits at the base of the value column */}
                                  <div
                                    className="w-full rounded-t-lg"
                                    style={{
                                      height: `${Math.max(wFrac * 100, 4)}%`,
                                      background: color,
                                    }}
                                  />
                                </div>
                              </div>
                            </HoverCard>
                          </div>
                        </div>
                        {/* Just the stage name at rest — the numbers live in the
                            hover breakdown so this reads as a chart, not a table. */}
                        <p className="mt-2 flex min-h-[28px] items-start justify-center gap-1.5 text-center text-[10.5px] font-medium leading-tight text-text-primary">
                          {/* mt centers the 6px dot on the first text line (dot sat above the text) */}
                          <span className="mt-[3.5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                          {s.stage}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* RIGHT — where the weighted commit comes from (fills the space) */}
          <div className="xl:border-l xl:border-border-light xl:px-5 flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <h2 className="text-[15px] font-semibold text-text-primary">
                Where your commit comes from
              </h2>
              <InfoHint text="Your realistic forecast, split two ways: by the stage it sits in, and by what is being sold. Lost deals are left out." />
            </div>
            <p className="text-[11px] text-text-tertiary mb-3">
              The same committed number, sliced two ways
            </p>
            {(() => {
              const segs = byStage
                .map((s) => ({
                  label: s.stage,
                  value: s.weighted,
                  color: STAGE_COLOR[s.stage],
                  // A glyph in the stage's own colour instead of a bare dot
                  // (Anir: "put an icon instead of just a purple dot"). The key
                  // is a plain string — a component can't cross the server
                  // boundary, same rule as `format`.
                  icon: TIP_ICON_KEY[s.stage],
                  // hovering a slice shows the actual deals driving it (Suren)
                  tip: s.deals.map((d) => ({
                    logo: d.company,
                    avatar: d.contact,
                    name: d.company,
                    sub: d.contact,
                    value: formatMoney(d.value),
                  })),
                }))
                .filter((s) => s.value > 0);
              // The second slice of the same money: which offerings the commit
              // is riding on. service is a real deal field — nothing invented.
              const svcMap = new Map<
                string,
                { weighted: number; deals: { company: string; contact: string; value: number }[] }
              >();
              for (const d of deals) {
                const w = d.value * (STAGE_PROBABILITY[d.stage] ?? 0);
                if (w <= 0) continue;
                const key = d.service || "Unassigned";
                const cur = svcMap.get(key) || { weighted: 0, deals: [] };
                cur.weighted += w;
                cur.deals.push({ company: d.company, contact: d.contactName, value: d.value });
                svcMap.set(key, cur);
              }
              const svcSegs = [...svcMap.entries()]
                .sort((a, b) => b[1].weighted - a[1].weighted)
                .map(([service, s]) => ({
                  label: service,
                  value: s.weighted,
                  // the offering's own app-wide colour, so it matches its
                  // chips and icons everywhere else
                  color: offeringMark(service).color,
                  tip: s.deals
                    .sort((a, b) => b.value - a.value)
                    .map((d) => ({
                      logo: d.company,
                      avatar: d.contact,
                      name: d.company,
                      sub: d.contact,
                      value: formatMoney(d.value),
                    })),
                }));
              return (
                <div className="flex-1 flex flex-col justify-evenly gap-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                        Sliced by stage
                      </p>
                      <ExpandedChartModal
                        title="Forecast commit by stage"
                        subtitle="Committed forecast value grouped by the current pipeline stage."
                        triggerLabel="Open"
                        className="h-7 px-2 text-[11px]"
                        chart={{
                          kind: "donut",
                          segments: segs,
                          centerLabel: formatMoney(commit),
                          centerSub: "commit",
                          format: "money",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <DonutChart
                        syncId="forecast-commit"
                        segments={segs}
                        size={126}
                        thickness={15}
                        format="money"
                        centerLabel={formatMoney(commit)}
                        centerSub="commit"
                      />
                      <div className="flex-1 min-w-0">
                        <DonutLegend items={segs} format="money" syncId="forecast-commit" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                        Sliced by offering
                      </p>
                      <ExpandedChartModal
                        title="Forecast commit by offering"
                        subtitle="Committed forecast value grouped by the offering behind each deal."
                        triggerLabel="Open"
                        className="h-7 px-2 text-[11px]"
                        chart={{
                          kind: "donut",
                          segments: svcSegs,
                          centerLabel: String(svcSegs.length),
                          centerSub:
                            svcSegs.length === 1 ? "offering" : "offerings",
                          format: "money",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <DonutChart
                        syncId="forecast-commit-svc"
                        segments={svcSegs}
                        size={126}
                        thickness={15}
                        format="money"
                        centerLabel={String(svcSegs.length)}
                        centerSub={svcSegs.length === 1 ? "offering" : "offerings"}
                      />
                      <div className="flex-1 min-w-0">
                        <DonutLegend items={svcSegs} format="money" syncId="forecast-commit-svc" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* THIRD — forecast risk. Rebuilt end to end (Suren, Jul 27) to the
              standard of the By-stage block above it: one measure in the app's
              own blue, red earned only past the quiet line, a real plot of the
              open book, and rows that carry logo, headshot, offering, stage and
              money together. See components/forecast/ForecastRisk.tsx. */}
          <ForecastRisk
            open={open}
            commit={commit}
            activeWeighted={activeWeighted}
            riskWeighted={riskWeighted}
            riskPct={riskPct}
            rottingDays={ROTTING_DAYS}
          />
        </div>
      </Card>

      <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_.75fr] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border-light px-5 py-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold text-text-primary">Deal drivers</h2>
                <InfoHint text="The open deals adding the most to this quarter's forecast, once the odds are applied." />
              </div>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                Highest weighted contribution first
              </p>
            </div>
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue-primary"
            >
              Open pipeline <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-[minmax(220px,1.5fr)_110px_minmax(150px,1fr)_minmax(96px,.6fr)_18px] gap-3 border-b border-border-light bg-[var(--surface)] px-5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <span>Opportunity</span>
            <span>Stage</span>
            <span>Contribution</span>
            <span>Latest activity</span>
            <span />
          </div>

          <div className="divide-y divide-border-light">
            {priorityDeals.map((deal) => {
              const weighted = deal.value * (STAGE_PROBABILITY[deal.stage] ?? 0);
              const contribution = commit > 0 ? Math.round((weighted / commit) * 100) : 0;
              // Bars scaled to the commit made every driver read as ~0 (Anir:
              // "all of them are under 10% — graphs with no purpose"). Scale
              // to the largest driver instead so the bars RANK the deals; the
              // %-of-commit stays as text.
              const maxDriverWeighted = Math.max(
                ...priorityDeals.map((d) => d.value * (STAGE_PROBABILITY[d.stage] ?? 0)),
                1
              );
              const barPct = Math.round((weighted / maxDriverWeighted) * 100);
              const stale = deal.staleDays > ROTTING_DAYS;
              return (
                <HoverCard
                  key={deal.sessionId}
                  side="right"
                  width={286}
                  content={
                    <div>
                      {/* Adds what the row can't fit: full names, the odds
                          math, and exactly how quiet the deal has gone, not a
                          restatement of the visible numbers (Anir: "the
                          pop-ups don't show me anything of value"). */}
                      <div className="flex items-start gap-2.5">
                        <CompanyLogo name={deal.company} className="h-9 w-9 shrink-0 text-[8px]" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold leading-snug text-text-primary">{deal.company}</p>
                          <div className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[10.5px] text-text-tertiary">
                            <Avatar name={deal.contactName} className="mt-[1px] h-4 w-4 shrink-0 text-[6px]" />
                            <span className="min-w-0 leading-snug break-normal">
                              {deal.contactName} · {deal.service}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-md bg-surface px-2 py-2 text-center">
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{formatMoney(deal.value)}</p><p className="text-[9px] text-text-tertiary">Full value</p></div>
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{Math.round((STAGE_PROBABILITY[deal.stage] ?? 0) * 100)}%</p><p className="text-[9px] text-text-tertiary">Odds of closing</p></div>
                        <div><p className="text-[12px] font-bold text-text-primary tnum">{deal.staleDays}d</p><p className="text-[9px] text-text-tertiary">Since last touch</p></div>
                      </div>
                      <p className="mt-2.5 text-[11px] leading-relaxed text-text-secondary">{stale ? `No logged activity for ${deal.staleDays} days: the ${Math.round((STAGE_PROBABILITY[deal.stage] ?? 0) * 100)}% odds on ${formatMoney(deal.value)} are getting shakier. Reconnect before it slips out of commit.` : `The ${Math.round((STAGE_PROBABILITY[deal.stage] ?? 0) * 100)}% close-odds trim ${formatMoney(deal.value)} to ${formatMoney(weighted)} of realistic commit. Keep the momentum: book the next step.`}</p>
                    </div>
                  }
                >
                <Link
                  href={`/deals/${deal.sessionId}`}
                  className="group grid min-h-[62px] grid-cols-[minmax(220px,1.5fr)_110px_minmax(150px,1fr)_minmax(96px,.6fr)_18px] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--surface)]"
                >
                  {/* Company, then the person, then what we're selling them —
                      one fact per line. Sharing a line squeezed both (Anir:
                      "you can just have the name of the person right below the
                      company name… it kind of ruins the vibe and it's a space
                      issue too"). Nothing here truncates. */}
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={deal.company} className="h-8 w-8 shrink-0 text-[8px]" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold leading-snug text-text-primary">
                        {deal.company}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[11px] text-text-secondary">
                        <Avatar name={deal.contactName} className="mt-[1px] h-4 w-4 shrink-0 text-[6px]" />
                        {/* Wraps instead of truncating — "Dr. Arun P…" tells a
                            rep nothing (Anir: "I can't even see the full name
                            of the guy or the category"). */}
                        <span className="min-w-0 leading-snug break-normal">
                          {deal.contactName}
                        </span>
                      </span>
                      {/* The offering carries its own colour + icon, same mark
                          it wears everywhere else, never a gray afterthought.
                          Sized to the CONTACT line (11px), not left at the
                          chip's 12.5px default: at full size it out-shouted the
                          company, the money and the stage and read as the
                          headline of the row (Suren, Jul 28: the offering chip
                          is oversized). The glyph bubble is em-based, so it
                          shrinks with the text and the chip stays one line. */}
                      <ServiceTag name={deal.service} className="mt-1 max-w-full text-[11px]" />
                    </span>
                  </span>
                  <span
                    className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold"
                    style={{
                      color: STAGE_COLOR[deal.stage],
                      background: `${STAGE_COLOR[deal.stage]}14`,
                    }}
                  >
                    {/* The stage's own glyph, not a bullet — a category chip
                        carries colour AND icon everywhere else in the app
                        (Anir, Jul 28: "didn't we have icons for this? Add the
                        actual icons instead of just the bullet points"). */}
                    {(() => {
                      const StageIcon = STAGE_ICON[deal.stage];
                      return <StageIcon size={11} strokeWidth={2.2} className="shrink-0" />;
                    })()}
                    {deal.stage === "Meeting Booked" ? "Meeting" : deal.stage}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-text-primary tnum">
                        {formatMoney(weighted)}
                      </span>
                      <span className="text-[9.5px] text-text-tertiary tnum">
                        {contribution}% of commit
                      </span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-blue-primary"
                        style={{ width: `${Math.max(barPct, 3)}%` }}
                      />
                    </span>
                  </span>
                  {/* Date over time over staleness — one narrow stack instead
                      of a wide one-liner (Anir: "would have saved a lot of
                      space"). */}
                  <span className="min-w-0 text-[10.5px] leading-snug">
                    <span className="block text-text-secondary tnum">
                      {new Date(deal.lastActivity).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="block text-text-tertiary tnum">
                      {new Date(deal.lastActivity).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className="mt-0.5 block text-[9.5px] font-medium"
                      style={{ color: stale ? "#C2410C" : "#1A7A35" }}
                    >
                      {stale ? `${deal.staleDays} days stale` : "Recently active"}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                  />
                </Link>
                </HoverCard>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-light text-blue-primary">
              <BriefcaseBusiness size={15} strokeWidth={1.9} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-semibold text-text-primary">Forecast signals</h2>
                <InfoHint text="A quick health check on your quarter. High coverage and high confidence are good. High concentration is bad: it means too much rides on too few deals." />
              </div>
              <p className="text-[10.5px] text-text-tertiary">What needs managing now</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {[
              {
                label: "Open coverage",
                value: bestPct,
                detail: `${formatMoney(bestCase)} against ${formatMoney(QUOTA)}`,
                color: "#14B8A6",
              },
              {
                label: "Commit confidence",
                value: forecastConfidence,
                detail: "Weighted share of open pipeline",
                color: "#0071E3",
              },
              {
                label: "Late-stage share",
                value: lateStagePct,
                detail: `${formatMoney(lateStageWeighted)} qualified or meeting`,
                color: "#5E5CE6",
              },
              {
                label: "Top-three concentration",
                value: concentrationPct,
                detail: "Commit carried by three deals",
                color: "#C2410C",
              },
            ].map((signal) => (
              <div key={signal.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-semibold text-text-primary">{signal.label}</span>
                  <span className="text-[12px] font-bold text-text-primary tnum">{signal.value}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, signal.value)}%`, background: signal.color }}
                  />
                </div>
                <p className="mt-1 text-[9.5px] text-text-tertiary">{signal.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-2.5 border-t border-border-light pt-4">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" style={{ color: "#C2410C" }} />
            <p className="text-[10.5px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary">{formatMoney(gap)} remains to quota.</span>{" "}
              {staleOpen.length > 0
                ? `${formatMoney(riskWeighted)} of commit is exposed across ${staleOpen.length} stale ${staleOpen.length === 1 ? "deal" : "deals"}.`
                : "No committed value is currently stale."}
            </p>
          </div>
        </Card>
      </section>

      {/* By rep — the whole floor with sort + a highly-visible "you"
          (client so the rep can re-sort it however they want. Suren). */}
      <ByRepChart reps={byRep} />
    </div>
  );
}
