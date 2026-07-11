"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { InfoHint } from "@/components/ui/InfoHint";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { formatMoney, CURRENT_REP } from "@/lib/pipeline";
import { VIZ, VIZ_SERIES } from "@/components/charts/Charts";

export type ByRep = {
  name: string;
  weighted: number;
  open: number;
  pct: number;
  deals?: { company: string; contact: string; value: number }[];
};

const SORTS: ColorOption[] = [
  { value: "weighted", label: "Weighted forecast" },
  { value: "open", label: "Open pipeline" },
  { value: "pct", label: "Quota share" },
  { value: "name", label: "Name A–Z" },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function ByRepChart({ reps }: { reps: ByRep[] }) {
  const [sort, setSort] = useState("weighted");
  const sorted = [...reps].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "open") return b.open - a.open;
    if (sort === "pct") return b.pct - a.pct;
    return b.weighted - a.weighted;
  });
  const max = Math.max(...reps.map((r) => r.weighted), 1);
  const yourRank = sorted.findIndex((r) => r.name === CURRENT_REP) + 1;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">By rep</h2>
          <InfoHint text="Every teammate's realistic (weighted) quarter forecast. Click a rep for their full breakdown." />
          {yourRank > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-light text-blue-primary">
              You&apos;re #{yourRank} of {reps.length}
            </span>
          )}
        </div>
        <ColorSelect value={sort} onChange={setSort} minWidth={185} options={SORTS} />
      </div>

      <div className="flex items-stretch justify-between gap-1.5 h-[240px]">
        {sorted.map((r, i) => {
          const you = r.name === CURRENT_REP;
          const first = r.name.split(" ")[0];
          const slug = slugify(r.name);
          const color = you ? VIZ.blue : VIZ_SERIES[i % VIZ_SERIES.length];
          const barH = Math.max((r.weighted / max) * 140, 6);
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
              key={r.name}
              href={`/analytics/reps/${slug}`}
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
                <span
                  className={`text-[10.5px] font-semibold tnum shrink-0 transition-colors ${
                    you ? "text-blue-primary" : "text-text-secondary group-hover:text-blue-primary"
                  }`}
                >
                  {formatMoney(r.weighted)}
                </span>
                {/* Only the bar itself pops the breakdown — hovering the empty
                    space above a short bar no longer triggers it (Suren). */}
                <HoverCard
                  side="top"
                  width={240}
                  content={hover}
                  className="w-full flex justify-center shrink-0"
                >
                  <div
                    className={`chart-bar rounded-t-md transition-[filter] group-hover:brightness-105 ${
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
        Weighted pipeline per teammate — click a rep for their full breakdown. Sort it whichever way you like.
      </p>
    </Card>
  );
}
