"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, Layers, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { InfoHint } from "@/components/ui/InfoHint";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { ExpandedChartControl } from "@/components/charts/ExpandedChartModal";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { formatMoney } from "@/lib/pipeline";
import { VIZ, VIZ_SERIES } from "@/components/charts/Charts";

export type ByRep = {
  identityKey: string;
  memberId: string | null;
  name: string;
  slug: string;
  weighted: number;
  open: number;
  pct: number;
  deals?: { company: string; contact: string; value: number }[];
};

const SORTS: ColorOption[] = [
  {
    value: "weighted",
    label: "Weighted forecast",
    description: "Probability-adjusted pipeline",
    color: "#0071E3",
    icon: TrendingUp,
  },
  {
    value: "open",
    label: "Open pipeline",
    description: "All active deal value",
    color: "#14B8A6",
    icon: Layers,
  },
  {
    value: "pct",
    label: "Quota share",
    description: "Contribution to team target",
    color: "#7C3AED",
    icon: Target,
  },
  {
    value: "name",
    label: "Name A–Z",
    description: "Alphabetical teammate order",
    color: "#64748B",
    icon: ArrowDownAZ,
  },
];

export function ByRepChart({ reps }: { reps: ByRep[] }) {
  const currentUser = useCurrentUser();
  const [sort, setSort] = useState("weighted");
  const sorted = [...reps].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "open") return b.open - a.open;
    if (sort === "pct") return b.pct - a.pct;
    return b.weighted - a.weighted;
  });
  const max = Math.max(...reps.map((r) => r.weighted), 1);
  // Rank is a STANDING, not a position in whatever order you happen to be
  // looking at. It was read off `sorted`, so switching to "Name A–Z" told a rep
  // with $0 of pipeline that they were #2 of 21 purely because their name
  // starts with A (Anir, Jul 28: "that doesn't make sense — obviously I'm not
  // number two, I'm last"). Always rank by weighted pipeline, descending, no
  // matter how the chart is currently sorted. Ties share a place, so two reps
  // on the same number are both #4 rather than #4 and #5.
  const byWeighted = [...reps].sort((a, b) => b.weighted - a.weighted);
  const you = byWeighted.find(
    (r) => !!r.memberId && !!currentUser.memberId && r.memberId === currentUser.memberId
  );
  const yourRank = you
    ? byWeighted.filter((r) => r.weighted > you.weighted).length + 1
    : 0;
  const colorByRep = new Map(
    reps.map((r, i) => [
      r.identityKey,
      !!r.memberId &&
      !!currentUser.memberId &&
      r.memberId === currentUser.memberId
        ? VIZ.blue
        : VIZ_SERIES[i % VIZ_SERIES.length],
    ])
  );
  const expansionItems = sorted.map((r) => ({
    key: r.identityKey,
    label: r.name,
    color: colorByRep.get(r.identityKey) ?? VIZ.blue,
  }));

  return (
    <Card>
      {/* items-start, not items-center: the sort control is a two-line chip, so
          centring dropped "By rep" half a row and opened a canyon above the
          bars (Anir, Jul 27: "the By rep should be in the top-left corner, just
          like the weighted forecast is"). */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">By rep</h2>
          <InfoHint text="Every teammate's realistic (weighted) quarter forecast. Click a rep for their full breakdown." />
          {yourRank > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-light text-blue-primary">
              You&apos;re #{yourRank} of {reps.length}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          {reps.length > 0 && (
            <ExpandedChartControl
              title="Weighted forecast by rep"
              subtitle="Compare each teammate's probability-adjusted quarter forecast, open pipeline, and share of the team quota."
              items={expansionItems}
              itemNoun="series"
              renderExpanded={(visibleKeys) => {
                const visible = new Set(visibleKeys);
                const visibleReps = sorted.filter((r) =>
                  visible.has(r.identityKey)
                );
                const expandedMax = Math.max(
                  ...visibleReps.map((r) => r.weighted),
                  1
                );

                return (
                  <div className="space-y-3 py-2">
                    {visibleReps.map((r) => {
                      const isYou =
                        !!r.memberId &&
                        !!currentUser.memberId &&
                        r.memberId === currentUser.memberId;
                      const color = colorByRep.get(r.identityKey) ?? VIZ.blue;
                      return (
                        <Link
                          key={r.identityKey}
                          href={`/analytics/reps/${r.slug}`}
                          className="group grid grid-cols-[minmax(130px,210px)_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border-light hover:bg-surface"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Avatar
                              name={r.name}
                              className={`h-8 w-8 shrink-0 text-[10px] ${
                                isYou ? "ring-2 ring-blue-primary" : ""
                              }`}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                                {r.name}
                                {isYou && (
                                  <span className="text-blue-primary"> · you</span>
                                )}
                              </span>
                              <span className="block text-[10.5px] text-text-tertiary">
                                {r.pct}% of team quota
                              </span>
                            </span>
                          </span>
                          <span className="relative h-8 overflow-hidden rounded-lg bg-surface">
                            <span
                              className="chart-grow-x absolute inset-y-0 left-0 rounded-lg"
                              style={{
                                width: `${Math.max(
                                  (r.weighted / expandedMax) * 100,
                                  1
                                )}%`,
                                background: color,
                              }}
                            />
                          </span>
                          <span className="min-w-[116px] text-right">
                            <span className="block text-[13px] font-bold text-text-primary tnum">
                              {formatMoney(r.weighted)}
                            </span>
                            <span className="block text-[10.5px] text-text-tertiary tnum">
                              {formatMoney(r.open)} open
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              }}
            />
          )}
          <ColorSelect
            value={sort}
            onChange={setSort}
            minWidth={238}
            options={SORTS}
            ariaLabel="Sort reps by"
          />
        </div>
      </div>

      <div className="flex items-stretch justify-between gap-1.5 h-[240px]">
        {sorted.map((r, i) => {
          const you =
            !!r.memberId &&
            !!currentUser.memberId &&
            r.memberId === currentUser.memberId;
          const first = r.name.split(" ")[0];
          const color = colorByRep.get(r.identityKey) ?? VIZ.blue;
          // Fill the track. At 140 of a 240px plot the tallest rep only reached
          // 58% of the height, leaving a band of dead space under the heading
          // (Anir, Jul 27: "so much empty space above… it looks funky"). 178
          // keeps room for the value label + the hover lift and nothing more.
          const barH = Math.max((r.weighted / max) * 178, 6);
          const hover = (
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <Avatar name={r.name} className="w-9 h-9 text-[12px]" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-primary truncate">
                    {r.name}
                    {you && <span className="text-blue-primary font-semibold"> · you</span>}
                  </p>
                  <p className="text-[11.5px] text-text-tertiary">Account executive</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  ["Weighted forecast", formatMoney(r.weighted)],
                  ["Open pipeline", formatMoney(r.open)],
                  ["Share of team quota", `${r.pct}%`],
                ].map(([l, v]) => (
                  <div key={l} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="text-text-tertiary">{l}</span>
                    <span className="font-semibold text-text-primary tnum">{v}</span>
                  </div>
                ))}
              </div>
              {r.deals && r.deals.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-border-light">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                    Their open deals
                  </p>
                  <div className="space-y-1.5">
                    {r.deals.slice(0, 5).map((d) => (
                      <div
                        key={`${d.company}-${d.contact}`}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        <CompanyLogo name={d.company} className="w-[18px] h-[18px] text-[7px] shrink-0" />
                        <span className="min-w-0 flex-1 leading-tight">
                          {/* Names wrap, never truncate — "Aether Medical
                              Devic…" told a rep nothing. And the person gets
                              their face: a name on screen always carries its
                              avatar (Anir, Jul 28: "People? Profile
                              pictures?"). */}
                          <span className="block break-words font-medium text-text-primary">
                            {d.company}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-secondary">
                            <Avatar
                              name={d.contact}
                              className="h-[15px] w-[15px] shrink-0 text-[6px]"
                            />
                            <span className="min-w-0 whitespace-nowrap">{d.contact}</span>
                          </span>
                        </span>
                        <span className="tnum text-text-secondary shrink-0">
                          {formatMoney(d.value)}
                        </span>
                      </div>
                    ))}
                    {r.deals.length > 5 && (
                      <p className="text-[10.5px] text-text-tertiary">
                        +{r.deals.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
              <p className="mt-2.5 pt-2.5 border-t border-border-light text-[11.5px] text-blue-primary font-medium">
                View full breakdown →
              </p>
            </div>
          );
          return (
            <Link
              key={r.identityKey}
              href={`/analytics/reps/${r.slug}`}
              data-rep-column
              className={`group flex-1 min-w-0 h-full flex flex-col items-center gap-1.5 pt-1 rounded-lg transition-colors ${
                you ? "bg-blue-light/60 ring-1 ring-blue-primary/30" : ""
              }`}
            >
              {/* "You" flag so the rep can spot themselves instantly. */}
              <span
                className={`text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full shrink-0 ${
                  you ? "bg-blue-primary text-white" : "opacity-0"
                }`}
              >
                You
              </span>
              <div className="flex-1 min-h-0 w-full flex flex-col justify-end items-center gap-1">
                {/* The value rides UP with its own bar. Lifting only the bar
                    closed the gap under the label, so the number looked like it
                    was being clipped by the column (Anir, Jul 27: "the number
                    is supposed to move with it… it's almost getting cut off").
                    Same distance, same duration, they move as one object. */}
                <span
                  className={`text-[10.5px] font-semibold tnum shrink-0 transition-all duration-150 group-hover:-translate-y-1.5 ${
                    you ? "text-blue-primary" : "text-text-secondary group-hover:text-blue-primary"
                  }`}
                >
                  {formatMoney(r.weighted)}
                </span>
                {/* Only the bar itself pops the breakdown — hovering the empty
                    space above a short bar no longer triggers it (Suren).
                    tightAbove anchors the card to THIS bar's top edge, lifted
                    past its own $ label, so a tall bar's card sits high and a
                    short bar's card drops down to meet it instead of every
                    card parking above the whole graph (Suren). clearAncestor
                    still applies if it ever has to flip below, so it lands
                    under the column rather than on the rep's name. */}
                <HoverCard
                  side="top"
                  width={240}
                  delayMs={0}
                  content={hover}
                  clearAncestor="[data-rep-column]"
                  tightAbove={14}
                  className="w-full flex justify-center shrink-0"
                >
                  {/* Hovering pops THIS bar up — no fading of the others
                      (Anir: "it should just pop that one up"). */}
                  <div
                    className={`chart-bar rounded-t-md transition-all duration-150 group-hover:brightness-105 group-hover:-translate-y-1.5 group-hover:shadow-[0_10px_22px_-8px_rgba(0,0,0,0.3)] ${
                      you ? "w-[38px] shadow-[0_0_0_3px_rgba(0,113,227,0.18)]" : "w-[30px]"
                    }`}
                    style={{ height: `${barH}px`, background: color, animationDelay: `${i * 45}ms` }}
                  />
                </HoverCard>
              </div>
              <Avatar
                name={r.name}
                className={`w-6 h-6 text-[8px] shrink-0 transition-all ${
                  you ? "ring-2 ring-blue-primary" : "group-hover:ring-2 group-hover:ring-blue-subtle"
                }`}
              />
              <span
                className={`text-[10px] text-center truncate w-full shrink-0 ${
                  you ? "font-bold text-blue-primary" : "text-text-tertiary group-hover:text-blue-primary"
                }`}
              >
                {first}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-[12px] text-text-tertiary mt-4">
        Weighted pipeline per teammate, click a rep for their full breakdown. Sort it whichever way you like.
      </p>
    </Card>
  );
}
