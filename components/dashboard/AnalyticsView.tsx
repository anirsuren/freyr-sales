"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet, Briefcase, Target, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { HoverCard } from "@/components/ui/HoverCard";
import { BarChart, DonutChart, DonutLegend,
  donutSyncBroadcast,
  useDonutSync,
} from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import { formatMoney, STAGE_COLOR, STAGE_PROBABILITY } from "@/lib/pipeline";

interface StageStat {
  stage: string;
  count: number;
  value: number;
}
interface OutcomeStat {
  label: string;
  count: number;
  color: string;
}
type StageDeal = { company: string; contact: string; value: number; customerId: string };
type OutcomeContact = { name: string; company: string; contactId: string };

// A stage is a SEMANTIC value, not a slot in a categorical series: Prospect is
// burnt orange, Engaged is blue, Qualified is violet — everywhere, on every
// chart. These charts used to paint stages with VIZ_SERIES[i], so "Pipeline by
// Stage" showed Prospect blue and Engaged orange while the Conversion Funnel
// three inches below showed the same two stages their real colours. One screen,
// two stories. Every stage renderer on this page now reads the one map.
const stageColor = (stage: string) =>
  STAGE_COLOR[stage as keyof typeof STAGE_COLOR] || "#0071E3";

// The unfilled share of a rate ring. A light wash of the SAME hue as the
// achieved arc (Qualified violet at 15%), so it reads as "this measure, not yet
// earned" rather than a second, unrelated category. Alpha rather than a baked
// tint on purpose: it composites over whatever card it sits on, so it stays
// quiet in dark mode instead of turning into the brightest thing in the ring.
// Never red — a shortfall on a rate donut is not an alarm.
const RATE_SHORTFALL = `${STAGE_COLOR.Qualified}26`;

// The "who" reveal — the deals or contacts behind a bar/segment.
function WhoPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="tab-panel mt-3 pt-3 border-t border-border-light max-h-[220px] overflow-y-auto pr-1 -mr-1 space-y-1">
      {children}
    </div>
  );
}

export function AnalyticsView({
  stages,
  outcomes,
  winRate,
  totalDeals,
  openValue,
  stageDeals,
  outcomeContacts,
}: {
  stages: StageStat[];
  outcomes: OutcomeStat[];
  winRate: number;
  totalDeals: number;
  openValue: number;
  // Optional — when present, the charts become interactive: click a bar/segment
  // to reveal WHO's behind it (Suren: "every graph has to tell me who").
  stageDeals?: Record<string, StageDeal[]>;
  outcomeContacts?: Record<string, OutcomeContact[]>;
}) {
  // Which segment is expanded, e.g. "stage:Prospect" / "outcome:Interested".
  const [open, setOpen] = useState<string | null>(null);
  const linkedOutcome = useDonutSync("dash-outcomes");
  const toggle = (k: string) => setOpen((v) => (v === k ? null : k));
  const interactive = !!stageDeals && !!outcomeContacts;

  const openCount = stages
    .filter((s) => s.stage !== "Closed Lost")
    .reduce((n, s) => n + s.count, 0);
  const closedCount = Math.max(0, totalDeals - openCount);

  // Extra context charts (Suren: "I need more graphs here"). Derived from the
  // same stage data — no new plumbing.
  const openStages = stages.filter((s) => s.stage !== "Closed Lost");
  // The deals behind a stage — the who/which for a tooltip breakdown (Suren:
  // "every graph needs the detailed breakdown, not just the metric").
  const stageTip = (stage: string) =>
    (stageDeals?.[stage] ?? []).map((d) => ({
      logo: d.company,
      avatar: d.contact,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    }));
  const pipelineStageData = stages.map((s) => ({
    label: s.stage,
    value: s.value,
    color: stageColor(s.stage),
    tip: stageTip(s.stage),
  }));
  const outcomeSegments = outcomes.map((o) => ({
    label: o.label,
    value: o.count,
    color: o.color,
    tip: (outcomeContacts?.[o.label] ?? []).map((c) => ({
      avatar: c.name,
      name: c.name,
      sub: c.company,
    })),
  }));
  // The same deals, but priced at the SAME measure as the chart they sit
  // under, so the rows add up to the segment. Listing full open values under a
  // probability-adjusted total is what Suren caught on the bar chart: "it says
  // 318K for engaged, but when I add up the records behind this bar it says
  // like a million". The open value stays on the second line so each row is
  // still a recognisable deal, not a bare fraction of one.
  const expectedStageTip = (stage: string) => {
    const odds = STAGE_PROBABILITY[stage as keyof typeof STAGE_PROBABILITY] ?? 0;
    return (stageDeals?.[stage] ?? []).map((d) => ({
      logo: d.company,
      avatar: d.contact,
      name: d.company,
      sub: `${d.contact} · ${formatMoney(d.value)} open`,
      value: formatMoney(Math.round(d.value * odds)),
    }));
  };
  const expectedByStage = openStages
    .map((s) => ({
      label: s.stage,
      value: Math.round(
        s.value * (STAGE_PROBABILITY[s.stage as keyof typeof STAGE_PROBABILITY] ?? 0)
      ),
      color: stageColor(s.stage),
      tip: expectedStageTip(s.stage),
    }))
    .filter((s) => s.value > 0);
  const totalExpected = expectedByStage.reduce((t, x) => t + x.value, 0);
  const avgByStage = openStages.map((s) => ({
    label: s.stage,
    value: s.count > 0 ? Math.round(s.value / s.count) : 0,
    color: stageColor(s.stage),
    // An AVERAGE can never be the sum of the deals listed under it, so the bar
    // says what it is at rest and the tooltip spells out the arithmetic in
    // full — the count it averages over AND the stage total those deals do add
    // up to. Nothing in the tip contradicts anything else in it.
    caption: s.count > 0 ? `avg of ${s.count} deal${s.count === 1 ? "" : "s"}` : "no deals yet",
    tipNote:
      s.count > 0
        ? `Average of ${s.count} deal${s.count === 1 ? "" : "s"} · ${formatMoney(s.value)} in this stage`
        : "No deals in this stage yet",
    tip: stageTip(s.stage),
  }));

  const funnelStages = stages.filter((s) => s.stage !== "Closed Lost");
  const funnel = funnelStages.map((s, i) => ({
    stage: s.stage,
    count: funnelStages.slice(i).reduce((sum, x) => sum + x.count, 0),
  }));
  const maxFunnel = Math.max(1, funnel[0]?.count ?? 1);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="h-full">
          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
            <Wallet size={16} strokeWidth={1.9} />
          </span>
          <p className="flex items-center gap-1 text-[13px] text-text-secondary">
            Open Pipeline Value
            <InfoHint text="The total value of every deal still in play. Deals you have already lost are left out." />
          </p>
          <p className="text-[28px] font-bold text-text-primary mt-1.5 tnum">
            <CountUp value={openValue} unit="money" />
          </p>
          <p className="text-[13px] text-text-tertiary mt-1">
            Across {openCount} open {openCount === 1 ? "deal" : "deals"}
          </p>
        </Card>
        <Card className="h-full">
          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
            <Briefcase size={16} strokeWidth={1.9} />
          </span>
          <p className="flex items-center gap-1 text-[13px] text-text-secondary">
            Total Deals
            <InfoHint text="How many deals are in this view, open and closed together. It follows the time range you picked." />
          </p>
          <p className="text-[28px] font-bold text-text-primary mt-1.5 tnum">
            <CountUp value={totalDeals} unit="count" />
          </p>
          <p className="text-[13px] text-text-tertiary mt-1">
            {openCount} open · {closedCount} closed
          </p>
        </Card>
        <Card className="h-full flex items-center justify-between">
          <div>
            <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
              <Target size={16} strokeWidth={1.9} />
            </span>
            <p className="flex items-center gap-1 text-[13px] text-text-secondary">
              Qualified rate
              <InfoHint text={"Out of the deals you actually worked on, this is how many reached Qualified or further.\nIt shows how often your effort moves a deal forward.\nIt is not a win rate."} />
            </p>
            <p className="text-[13px] text-text-tertiary mt-1 max-w-[140px]">
              Qualified or further, of all worked deals
            </p>
          </div>
          <DonutChart
            segments={[
              // The achieved arc IS the Qualified stage — so it wears Qualified's
              // colour. Pairing a generic blue against a generic violet said
              // nothing about what either arc measured.
              { label: "Qualified or further", value: winRate, color: STAGE_COLOR.Qualified },
              {
                label: "Did not reach Qualified",
                value: Math.max(0, 100 - winRate),
                color: RATE_SHORTFALL,
              },
            ]}
            size={130}
            thickness={12}
            centerLabel={`${winRate}%`}
            centerSub="qualified"
            format="percent"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Pipeline by stage — click a stage to see the deals in it */}
        <Card
          className="h-full flex flex-col"
          data-tour="analytics-pipeline-stages"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
              Pipeline by Stage
              <InfoHint text="The value of every deal, grouped by the step it is on. Closed Lost is one of the bars, so this is not only open money. Click a bar to see the deals in it." />
            </h2>
            <ExpandedChartModal
              title="Pipeline by Stage"
              subtitle="Where open pipeline value sits across the sales process."
              chart={{
                kind: "bar",
                data: pipelineStageData,
                format: "money",
              }}
              className="h-8 whitespace-nowrap px-2.5 text-[11px]"
            />
          </div>
          <BarChart
            data={pipelineStageData}
            height={170}
            format="money"
            activeIndex={
              interactive && open?.startsWith("stage:")
                ? stages.findIndex((s) => `stage:${s.stage}` === open)
                : null
            }
          />
          {interactive && (
            <>
              {/* Balanced one-row legend (5 equal cells) — never a 4-then-1
                  orphan wrap (Suren: "the closed tag on the next line looks
                  weird"). Each is a drill trigger into who's in that stage. */}
              <div className="grid grid-cols-5 gap-1.5 mt-4">
                {stages.map((s) => {
                  const k = `stage:${s.stage}`;
                  const active = open === k;
                  const color = stageColor(s.stage);
                  const short =
                    s.stage === "Closed Lost"
                      ? "Closed"
                      : s.stage === "Meeting Booked"
                      ? "Meeting"
                      : s.stage;
                  return (
                    <button
                      key={s.stage}
                      onClick={() => toggle(k)}
                      title={`${s.stage} - ${s.count} deal${s.count === 1 ? "" : "s"}`}
                      className={`flex items-center justify-center gap-1.5 text-[12px] font-medium rounded-full px-2 py-1 border transition-colors ${
                        active
                          ? "border-transparent text-white"
                          : "border-border-light text-text-secondary hover:border-blue-subtle"
                      }`}
                      style={active ? { background: color } : undefined}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: active ? "#fff" : color }}
                      />
                      <span className="truncate">{short}</span>
                      <span className="tnum opacity-80 shrink-0">{s.count}</span>
                    </button>
                  );
                })}
              </div>
              {open?.startsWith("stage:") && (
                <WhoPanel>
                  {(stageDeals![open.slice(6)] ?? []).length === 0 ? (
                    <p className="text-[12.5px] text-text-tertiary py-1">
                      No deals in this stage.
                    </p>
                  ) : (
                    stageDeals![open.slice(6)].map((d, i) => (
                      <Link
                        key={d.customerId + i}
                        href={`/customers/${d.customerId}`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface group"
                      >
                        <CompanyLogo name={d.company} className="w-6 h-6 text-[8px] shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                            {d.company}
                          </span>
                          <span className="block text-[11.5px] text-text-tertiary truncate">
                            {d.contact}
                          </span>
                        </span>
                        <span className="text-[12.5px] font-semibold text-text-primary tnum shrink-0">
                          {formatMoney(d.value)}
                        </span>
                      </Link>
                    ))
                  )}
                </WhoPanel>
              )}
            </>
          )}
        </Card>

        {/* Outcome mix — click an outcome to see who */}
        <Card className="h-full flex flex-col">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
              Outcome Mix
              <InfoHint text="What happened after your calls and emails. Click any outcome to see exactly which people are behind it." />
            </h2>
            <ExpandedChartModal
              title="Outcome Mix"
              subtitle="What logged customer touches led to."
              chart={{
                kind: "donut",
                segments: outcomeSegments,
                centerLabel: String(outcomes.reduce((t, o) => t + o.count, 0)),
                centerSub: "touches",
              }}
              className="h-8 whitespace-nowrap px-2.5 text-[11px]"
            />
          </div>
          {/* Bigger donut + roomier legend fill the card so it doesn't read as
              empty top-and-bottom next to the taller Pipeline card (Suren). */}
          <div className="flex-1 flex items-center gap-6">
            <DonutChart
              syncId="dash-outcomes"
              segments={outcomeSegments}
              size={172}
              thickness={18}
              centerLabel={String(outcomes.reduce((t, o) => t + o.count, 0))}
              centerSub="touches"
            />
            {interactive ? (
              <div className="flex-1 min-w-0 space-y-1.5">
                {outcomes.map((o, oi) => {
                  const k = `outcome:${o.label}`;
                  const active = open === k;
                  const total = outcomes.reduce((t, x) => t + x.count, 0) || 1;
                  const pct = Math.round((o.count / total) * 100);
                  // Hovering the donut slice lights THIS row and vice versa,
                  // and a lit row takes the slice's own colour rather than a
                  // gray wash (Anir: "the pop isn't enough").
                  const lit = linkedOutcome === oi;
                  return (
                    <button
                      key={o.label}
                      onClick={() => toggle(k)}
                      onMouseEnter={() => donutSyncBroadcast("dash-outcomes", oi)}
                      onMouseLeave={() => donutSyncBroadcast("dash-outcomes", null)}
                      // Count sits RIGHT AFTER the tag, then the % and a share bar
                      // fill the space, chevron trails at the end (Suren).
                      className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 transition-all duration-150 ${
                        active
                          ? "bg-blue-light"
                          : lit
                            ? "scale-[1.015] shadow-[0_2px_10px_rgba(0,0,0,0.07)]"
                            : "hover:bg-surface"
                      }`}
                      style={
                        !active && lit
                          ? { background: `${o.color}1F`, boxShadow: `inset 0 0 0 1px ${o.color}59` }
                          : undefined
                      }
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />
                      <span className="text-[13px] text-text-secondary truncate">{o.label}</span>
                      <span className="text-[13px] font-semibold text-text-primary tnum">{o.count}</span>
                      <span className="text-[11px] text-text-tertiary tnum shrink-0">{pct}%</span>
                      <span className="flex-1 h-1.5 rounded-full bg-border-light overflow-hidden min-w-[16px]">
                        <span
                          className="block h-full rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 3)}%`, background: o.color }}
                        />
                      </span>
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className={`shrink-0 transition-transform ${active ? "rotate-90 text-blue-primary" : "text-text-tertiary"}`}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <DonutLegend
                syncId="dash-outcomes"
                items={outcomes.map((o) => ({
                  label: o.label,
                  color: o.color,
                  value: o.count,
                }))}
              />
            )}
          </div>
          {interactive && open?.startsWith("outcome:") && (
            <WhoPanel>
              {(outcomeContacts![open.slice(8)] ?? []).length === 0 ? (
                <p className="text-[12.5px] text-text-tertiary py-1">No touches with this outcome.</p>
              ) : (
                outcomeContacts![open.slice(8)].map((c, i) => (
                  <Link
                    key={c.contactId + i}
                    href={`/contacts/${c.contactId}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface group"
                  >
                    <Avatar name={c.name} className="w-6 h-6 text-[9px] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                        {c.name}
                      </span>
                      <span className="block text-[11.5px] text-text-tertiary truncate">{c.company}</span>
                    </span>
                    <ChevronRight size={14} strokeWidth={1.8} className="text-text-tertiary shrink-0" />
                  </Link>
                ))
              )}
            </WhoPanel>
          )}
        </Card>
      </div>

      {/* Funnel — click a stage to see the deals that reached it */}
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
            Conversion Funnel
            <InfoHint text="How many open deals have reached each step. Click a step to see which deals are there." />
          </h2>
          <ExpandedChartModal
            title="Conversion Funnel"
            subtitle="How many open deals have reached each step of the sales process."
            chart={{
              kind: "bar",
              data: funnel.map((stage) => ({
                label: stage.stage,
                value: stage.count,
                color: stageColor(stage.stage),
              })),
              unit: "deals",
              format: "number",
            }}
            className="h-8 whitespace-nowrap px-2.5 text-[11px]"
          />
        </div>
        <div className="space-y-2">
          {funnel.map((s, i) => {
            const prev = i > 0 ? funnel[i - 1] : null;
            const conv =
              prev && prev.count > 0 ? Math.round((s.count / prev.count) * 100) : null;
            const color = stageColor(s.stage);
            const k = `funnel:${s.stage}`;
            const active = open === k;
            const Row = (
              <>
                <span className="w-28 shrink-0 text-[13px] text-text-secondary text-right">
                  {s.stage}
                </span>
                <div className="flex-1 flex items-center gap-2.5 min-w-0">
                  <div
                    className="h-9 rounded-md flex items-center justify-end pr-3 text-white text-[13px] font-semibold tnum shrink-0"
                    style={{
                      width: `${Math.max(8, (s.count / maxFunnel) * 100)}%`,
                      background: color,
                    }}
                  >
                    {s.count}
                  </div>
                  {conv !== null && (
                    <span className="text-[12px] text-text-tertiary tnum truncate">
                      {conv}% of {prev!.stage}
                    </span>
                  )}
                  {interactive && (
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      className={`text-text-tertiary shrink-0 ml-auto transition-transform ${active ? "rotate-90" : ""}`}
                    />
                  )}
                </div>
              </>
            );
            const funnelDeals = stageDeals?.[s.stage] ?? [];
            return (
              <div key={s.stage}>
                {interactive ? (
                  // Hover shows the deals at this step (Suren: "the funnel still
                  // has no breakdown"); click still expands the full list inline.
                  <HoverCard
                    side="top"
                    width={280}
                    delayMs={0}
                    className="block"
                    content={
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-text-primary mb-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          {s.stage} · {s.count} deal{s.count === 1 ? "" : "s"}
                        </p>
                        {funnelDeals.length === 0 ? (
                          <p className="text-[12.5px] text-text-tertiary">No deals here.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {funnelDeals.slice(0, 6).map((d, di) => (
                              <div key={d.customerId + di} className="flex items-center gap-2 text-[12.5px]">
                                <CompanyLogo name={d.company} className="w-5 h-5 text-[7px] shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-text-primary">{d.company}</span>
                                <span className="tnum text-text-secondary shrink-0">{formatMoney(d.value)}</span>
                              </div>
                            ))}
                            {funnelDeals.length > 6 && (
                              <p className="text-[11px] text-text-tertiary">+{funnelDeals.length - 6} more</p>
                            )}
                          </div>
                        )}
                        <p className="mt-2 pt-2 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                          Click to pin the list →
                        </p>
                      </div>
                    }
                  >
                    <button
                      onClick={() => toggle(k)}
                      className="w-full flex items-center gap-3 rounded-lg px-1 py-0.5 hover:bg-surface/50 transition-colors"
                    >
                      {Row}
                    </button>
                  </HoverCard>
                ) : (
                  <div className="flex items-center gap-3">{Row}</div>
                )}
                {interactive && active && (
                  <div className="tab-panel pl-[124px] pr-2 pb-2">
                    <div className="mt-1 rounded-lg border border-border-light bg-surface/40 p-2 max-h-[200px] overflow-y-auto space-y-1">
                      {(stageDeals![s.stage] ?? []).length === 0 ? (
                        <p className="text-[12.5px] text-text-tertiary py-1 px-1">No deals here.</p>
                      ) : (
                        stageDeals![s.stage].map((d, di) => (
                          <div key={d.customerId + di} className="flex items-center gap-2.5 px-1.5 py-1">
                            <CompanyLogo name={d.company} className="w-5 h-5 text-[7px] shrink-0" />
                            <span className="text-[12.5px] font-medium text-text-primary truncate">
                              {d.company}
                            </span>
                            <span className="text-[11.5px] text-text-tertiary truncate">· {d.contact}</span>
                            <span className="text-[12px] font-semibold text-text-primary tnum ml-auto shrink-0">
                              {formatMoney(d.value)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* More context (Suren: "I need graphs here") — the revenue each stage
          is expected to produce, and how big the average deal is at each step.

          THE LEFT CARD IS NOT CALLED "WEIGHTED" ANY MORE (Anir, Sep 2: "they
          dont use weighted"). It was "Weighted Forecast by Stage" with a
          centre reading "weighted". The chart itself stays and keeps drawing
          the same probability-adjusted money, under the name the dashboard
          already uses for exactly this donut: expected revenue by stage. The
          word goes, the graph Suren asked for does not. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full flex flex-col">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
              Expected revenue by stage
              <InfoHint text="Each stage's open value, adjusted for how likely a deal on that stage is to close. This is the realistic number, not the headline one." />
            </h2>
            <ExpandedChartModal
              title="Expected revenue by stage"
              subtitle="Probability-adjusted revenue expected from each pipeline stage."
              chart={{
                kind: "donut",
                segments: expectedByStage,
                centerLabel: formatMoney(totalExpected),
                centerSub: "expected revenue",
                format: "money",
              }}
              className="h-8 whitespace-nowrap px-2.5 text-[11px]"
            />
          </div>
          {expectedByStage.length > 0 ? (
            <div className="flex-1 flex items-center gap-6">
              <DonutChart
                syncId="dash-expected-revenue"
                segments={expectedByStage.map((s) => ({ label: s.label, value: s.value, color: s.color, tip: s.tip }))}
                size={172}
                thickness={18}
                format="money"
                centerLabel={formatMoney(totalExpected)}
                centerSub="expected revenue"
              />
              <DonutLegend
                syncId="dash-expected-revenue"
                items={expectedByStage.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
                format="money"
              />
            </div>
          ) : (
            <p className="flex-1 flex items-center text-[13px] text-text-tertiary">No open pipeline.</p>
          )}
        </Card>
        <Card className="h-full flex flex-col">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary">
              Average Deal Size by Stage
              <InfoHint text="The average size of an open deal at each step, so you can see where the bigger deals sit. These are averages, so the deals listed on hover will not add up to the bar." />
            </h2>
            <ExpandedChartModal
              title="Average Deal Size by Stage"
              subtitle="Average open-deal value at each stage of the sales process."
              chart={{
                kind: "bar",
                data: avgByStage,
                format: "money",
                tipRecordsLabel: "Deals in this stage",
              }}
              className="h-8 whitespace-nowrap px-2.5 text-[11px]"
            />
          </div>
          <div className="flex flex-1 items-end w-full">
            <BarChart
              data={avgByStage}
              height={190}
              format="money"
              // Not "records behind this bar" — these deals produce the bar's
              // average, they don't add up to it.
              tipRecordsLabel="Deals in this stage"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
