"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, ArrowRight, LayoutGrid, Table2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Badge } from "@/components/ui/Badge";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { HoverCard } from "@/components/ui/HoverCard";
import {
  DonutChart,
  DonutLegend,
  Sparkline,
  VIZ,
} from "@/components/charts/Charts";
import { formatMoney } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export type RosterRep = {
  name: string;
  slug: string;
  title: string;
  role: "Admin" | "Manager" | "Rep";
  region: string;
  phone: string;
  teamsUrl: string;
  openValue: number;
  weighted: number;
  openCount: number;
  meetings: number;
  quota: number;
  wonFY: number;
  trend: number[];
  stageValues: { stage: string; color: string; value: number }[];
  // The actual deals sitting in each stage — so a hovered slice / row shows the
  // real company + contact + value behind the number, not just the aggregate.
  stageDeals?: Record<string, { company: string; contact: string; value: number }[]>;
};

// The rep's biggest open deals across every stage — for the row-hover "Top open
// deals" list, so pointing at a rep surfaces what they're actually working.
function topOpenDeals(rep: RosterRep, n = 4) {
  return Object.values(rep.stageDeals ?? {})
    .flat()
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  Admin: { bg: "rgba(124,58,237,0.12)", color: "#6D28D9" },
  Manager: { bg: "rgba(0,113,227,0.12)", color: "#0040A0" },
  Rep: { bg: "rgba(5,150,105,0.12)", color: "#047857" },
};

// Attainment colour band — red under target, amber near, green ahead.
function attainColor(pct: number): string {
  if (pct >= 50) return "#1A7A35";
  if (pct >= 35) return "#B45309";
  return "#B02020";
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function TeamsButton({ url, name }: { url: string; name: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Message ${name.split(" ")[0]} on Teams`}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
    >
      <TeamsIcon size={15} />
      Teams
    </a>
  );
}

// Shared "what this rep is working" analytics — a donut (pipeline mix) with the
// count right after each stage. Used in the grid card's resting body and the
// table row's hover popover, so a rep reads the same story everywhere.
function StageDonut({ rep, size = 82 }: { rep: RosterRep; size?: number }) {
  const mix = rep.stageValues.filter((s) => s.value > 0);
  if (mix.length === 0) {
    return (
      <p className="text-[12px] text-text-tertiary py-3">No open pipeline yet.</p>
    );
  }
  const items = mix.map((s) => ({
    label: s.stage,
    value: s.value,
    color: s.color,
    // Hovering a slice shows the actual deals in that stage (Suren) — company
    // logo, name, contact, and value, straight from the rep's stageDeals.
    tip: (rep.stageDeals?.[s.stage] ?? []).map((d) => ({
      logo: d.company,
      name: d.company,
      sub: d.contact,
      value: formatMoney(d.value),
    })),
  }));
  return (
    <div className="flex items-center gap-3">
      <DonutChart
        segments={items}
        size={size}
        thickness={size > 78 ? 11 : 9}
        centerLabel={String(rep.openCount)}
        centerSub="deals"
      />
      <DonutLegend items={items} format="money" />
    </div>
  );
}

function TripleStat({ rep }: { rep: RosterRep }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { l: "Weighted", v: formatMoney(rep.weighted) },
        { l: "Open deals", v: String(rep.openCount) },
        { l: "Meetings", v: String(rep.meetings) },
      ].map((s) => (
        <div key={s.l} className="rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.01em] whitespace-nowrap text-text-tertiary">
            {s.l}
          </p>
          <p className="text-[14px] font-bold text-text-primary tnum leading-none mt-0.5">
            {s.v}
          </p>
        </div>
      ))}
    </div>
  );
}

export function TeamRoster({ reps }: { reps: RosterRep[] }) {
  const [view, setView] = useState<"table" | "grid">("table");

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border-light flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            The sales floor{" "}
            <span className="text-text-tertiary tnum font-normal">({reps.length})</span>
          </h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Ranked by open pipeline. Message on Teams or call — click a rep for their full analytics.
          </p>
        </div>
        <div className="flex border border-border rounded-md overflow-hidden shrink-0">
          <button
            onClick={() => setView("grid")}
            aria-label="Grid view"
            title="Grid view"
            className={cn("p-2 transition-colors", view === "grid" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
          >
            <LayoutGrid size={16} strokeWidth={1.6} />
          </button>
          <button
            onClick={() => setView("table")}
            aria-label="Table view"
            title="Table view"
            className={cn("p-2 border-l border-border transition-colors", view === "table" ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface")}
          >
            <Table2 size={16} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* key=view re-mounts the panel so switching grid↔table fades/rises in
          (Suren: "switching between grid and table view should have animations"). */}
      <div key={view} className="page-in">
      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {reps.map((r) => {
            const rc = ROLE_COLOR[r.role];
            const pct = Math.round((r.wonFY / r.quota) * 100);
            const ac = attainColor(pct);
            const trendSum = r.trend.reduce((s, x) => s + x, 0);
            return (
              <HoverExpandCard
                key={r.name}
                summary={
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} className="w-11 h-11 text-[14px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {/* Stretched nav link — the whole card opens the rep. */}
                          <Link
                            href={`/analytics/reps/${r.slug}`}
                            className="min-w-0 text-[14.5px] font-semibold text-text-primary truncate group-hover:text-blue-primary outline-none rounded-sm after:absolute after:inset-0 after:content-['']"
                          >
                            {r.name}
                          </Link>
                          <Badge
                            label={r.role}
                            bg={rc.bg}
                            color={rc.color}
                            className="!normal-case tracking-normal !text-[10px] !px-1.5 !py-0 relative z-10"
                          />
                        </div>
                        <p className="text-[12px] text-text-secondary truncate">
                          {r.title} · {r.region}
                        </p>
                      </div>
                      <span className="relative z-10">
                        <TeamsButton url={r.teamsUrl} name={r.name} />
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Open pipeline
                        </p>
                        <p className="text-[17px] font-bold text-text-primary tnum leading-none mt-1">
                          {formatMoney(r.openValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Won FY26
                        </p>
                        <p className="text-[17px] font-bold tnum leading-none mt-1" style={{ color: "#1A7A35" }}>
                          {formatMoney(r.wonFY)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                          Quota {formatMoney(r.quota)}
                        </span>
                        <span className="text-[12px] font-bold tnum" style={{ color: ac }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                      </div>
                    </div>

                    {/* Clean at-a-glance card at rest — identity, headline
                        numbers, quota bar + the call action. The analytics
                        (pipeline mix, activity, stage bars, stats) reveal on
                        hover (Suren: "everything below the quota bar should
                        only show when I hover"). */}
                    <a
                      href={tel(r.phone)}
                      title={`Call ${r.phone}`}
                      className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-blue-primary transition-colors tnum w-fit"
                    >
                      <Phone size={12} strokeWidth={1.9} />
                      {r.phone}
                    </a>
                  </>
                }
                extra={
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                      Pipeline mix by stage
                    </p>
                    <div className="mb-3.5">
                      <StageDonut rep={r} />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        Activity · last 10 weeks
                      </p>
                      <p className="text-[11px] text-text-tertiary tnum">{trendSum} touches</p>
                    </div>
                    <Sparkline
                      points={r.trend}
                      color={VIZ.blue}
                      height={38}
                      unit="touches"
                      xLabels={r.trend.map((_, i) =>
                        i === r.trend.length - 1 ? "this week" : `${r.trend.length - 1 - i}w ago`
                      )}
                    />
                    <div className="mt-3.5">
                      <TripleStat rep={r} />
                    </div>
                  </>
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary border-b border-border-light bg-surface/50">
                <th className="px-5 py-3">Rep</th>
                <th className="px-5 py-3">Reach</th>
                <th className="px-5 py-3 w-[230px]">Open pipeline</th>
                <th className="px-5 py-3 text-right">Weighted</th>
                <th className="px-5 py-3 text-right">Open deals</th>
                <th className="px-5 py-3 text-right">Meetings</th>
                <th className="px-5 py-3 w-[120px]">Activity</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {reps.map((r) => {
                const rc = ROLE_COLOR[r.role];
                const pct = Math.round((r.wonFY / r.quota) * 100);
                const ac = attainColor(pct);
                return (
                  <tr key={r.name} className="hover:bg-surface transition-colors">
                    <td className="px-5 py-3.5">
                      {/* Row hover popover (Suren: "on the rows page there's no
                          pop-up like the grid") — the rep's mix + headline stats. */}
                      <HoverCard
                        side="bottom"
                        // Wide two-column popup — 300px clipped the legend's
                        // share bars (Suren: "the bars are bleeding"). Left =
                        // the mix + headline stats, right = the deals + whether
                        // they're actually working them (activity trend).
                        width={620}
                        content={
                          <div>
                            <div className="flex items-center gap-2.5 mb-2.5">
                              <Avatar name={r.name} className="w-9 h-9 text-[12px]" />
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold text-text-primary truncate">
                                  {r.name}
                                </p>
                                <p className="text-[11.5px] text-text-tertiary truncate">
                                  {r.title} · {r.region}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary tnum">
                                Quota attainment
                              </span>
                              <span className="text-[12px] font-bold tnum" style={{ color: ac }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-3">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: ac }} />
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                                  Pipeline mix by stage
                                </p>
                                <div className="mb-3">
                                  <StageDonut rep={r} size={72} />
                                </div>
                                <TripleStat rep={r} />
                              </div>
                              <div className="border-l border-border-light pl-5">
                                {topOpenDeals(r).length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                                      Top open deals
                                    </p>
                                    <div className="space-y-1.5">
                                      {topOpenDeals(r).map((d, i) => (
                                        <div
                                          key={`${d.company}-${d.contact}-${i}`}
                                          className="flex items-center gap-2 text-[12px]"
                                        >
                                          <CompanyLogo
                                            name={d.company}
                                            className="w-[18px] h-[18px] text-[7px] shrink-0"
                                          />
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
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                    Activity · last 10 weeks
                                  </p>
                                  <span className="text-[10.5px] text-text-tertiary tnum">
                                    {r.trend.reduce((s, x) => s + x, 0)} touches
                                  </span>
                                </div>
                                <Sparkline points={r.trend} height={34} unit="touches" />
                              </div>
                            </div>
                            <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                              View full breakdown →
                            </p>
                          </div>
                        }
                      >
                        <Link href={`/analytics/reps/${r.slug}`} className="flex items-center gap-3 group">
                          <Avatar name={r.name} className="w-10 h-10 text-[13px] shrink-0" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary truncate">
                                {r.name}
                              </span>
                              <Badge label={r.role} bg={rc.bg} color={rc.color} className="!normal-case tracking-normal !text-[10px] !px-1.5 !py-0" />
                            </span>
                            <span className="block text-[12px] text-text-secondary truncate">
                              {r.title} · {r.region}
                            </span>
                          </span>
                        </Link>
                      </HoverCard>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <TeamsButton url={r.teamsUrl} name={r.name} />
                        <a
                          href={tel(r.phone)}
                          title={`Call ${r.phone}`}
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border border-border-light text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors tnum whitespace-nowrap"
                        >
                          <Phone size={13} strokeWidth={2} />
                          {r.phone}
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-[14px] font-semibold text-text-primary tnum">
                        {formatMoney(r.openValue)}
                      </p>
                      <div className="mt-1.5 flex h-2.5 rounded-full overflow-hidden bg-surface w-[200px]">
                        {r.stageValues
                          .filter((s) => s.value > 0)
                          .map((s) => {
                            const total = r.stageValues.reduce((a, v) => a + v.value, 0) || 1;
                            return (
                              <span
                                key={s.stage}
                                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                                title={`${s.stage} · ${formatMoney(s.value)}`}
                              />
                            );
                          })}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-semibold text-text-primary tnum">
                      {formatMoney(r.weighted)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] text-text-secondary tnum">
                      {r.openCount}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] text-text-secondary tnum">
                      {r.meetings}
                    </td>
                    <td className="px-5 py-3.5">
                      {/* A per-row activity trend so the table reads as richly as
                          the grid cards (Suren: "the row view is lacking"). */}
                      <div className="w-[100px]">
                        <Sparkline
                          points={r.trend}
                          color={VIZ.blue}
                          height={30}
                          unit="touches"
                          xLabels={r.trend.map((_, i) =>
                            i === r.trend.length - 1 ? "this week" : `${r.trend.length - 1 - i}w ago`
                          )}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/analytics/reps/${r.slug}`}
                        aria-label={`Open ${r.name}'s analytics`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-blue-primary hover:bg-blue-light/50 transition-colors"
                      >
                        <ArrowRight size={16} strokeWidth={1.9} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </Card>
  );
}
