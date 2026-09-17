"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Shuffle, TrendingDown, TrendingUp } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { MovementBarChart } from "@/components/charts/Charts";
import { formatMoney } from "@/lib/pipeline";
import { monthLabel, type DealDeviation } from "@/lib/revenueAccrualsShared";
import { tint } from "@/lib/tint";

const GAIN = "var(--ink-green)";
const LOSS = "var(--ink-amber)";
const BLUE = "var(--ink-bright-blue)";
const exact = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format;
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-primary";

export function DeviationOpportunityCard({ deal, open, onToggle }: {
  deal: DealDeviation;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const color = deal.slipped ? "var(--ink-violet-soft)" : deal.delta > 0 ? GAIN : LOSS;
  const Icon = deal.slipped ? Shuffle : deal.delta > 0 ? TrendingUp : TrendingDown;
  const status = deal.slipped ? "Timing shifted" : deal.delta > 0 ? "Plan increased" : "Plan decreased";
  const change = deal.slipped
    ? `${formatMoney(deal.movement)} shifted`
    : `${deal.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(deal.delta))}`;
  const totalScale = Math.max(deal.was, deal.now, 1);


  return (
    <article className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-card" data-deviation-deal={deal.opportunityId}>
      <div className="relative flex w-full flex-wrap items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? "Close" : "Open"} details for ${deal.opportunityName}`}
        className={`absolute inset-0 z-10 cursor-pointer rounded-2xl ${focus}`}
      />
        <CompanyLogo name={deal.customer} className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1 basis-[180px]">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="break-words text-[14px] font-semibold text-text-primary">{deal.opportunityName}</span>
            <Link href={`/opportunities/${deal.opportunityId}`} className={`relative z-20 inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded text-[12px] font-semibold text-blue-primary hover:underline ${focus}`}>
              Open opportunity<ArrowRight size={13} aria-hidden="true" />
            </Link>
          </span>
          <span className="mt-0.5 block text-[12px] text-text-secondary">{deal.customer}</span>
          <span className="mt-1 block text-[12px] text-text-secondary">
            {deal.slipped
              ? `${formatMoney(deal.movement)} shifted between months; the total is unchanged.`
              : `The plan is ${formatMoney(Math.abs(deal.delta))} ${deal.delta > 0 ? "higher" : "lower"} than the frozen sheet.`}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color, background: tint(color, 10) }}>
            <Icon size={13} aria-hidden="true" />{status}
          </span>
          <span className="text-[15px] font-bold tnum" style={{ color }}>{change}</span>
          <ChevronDown size={17} aria-hidden="true" className={`text-text-secondary transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </span>
      </div>
      <div id={panelId} className="freyr-fold" data-open={open} inert={!open}>
        <div>
          <div className="grid min-w-0 gap-6 border-t border-border-light p-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Total planned revenue</h3>
              <div className="mt-5 space-y-5">
                {[
                  { label: "Frozen", value: deal.was, color: tint(BLUE, 45) },
                  { label: "Today", value: deal.now, color: BLUE },
                ].map(bar => {
                  const percent = Math.max(0, (bar.value / totalScale) * 100);
                  return (
                    <div key={bar.label} title={`${bar.label}: ${exact(bar.value)}`}>
                      <div className="mb-1 text-[11px] font-medium text-text-secondary">{bar.label}</div>
                      <div className="relative pt-6" role="img" aria-label={`${bar.label}: ${exact(bar.value)}`}>
                        <span
                          className="absolute top-0 whitespace-nowrap text-[14px] font-bold tnum text-text-primary"
                          style={{ left: `${percent}%`, transform: percent < 25 ? "none" : "translateX(-100%)" }}
                        >
                          {formatMoney(bar.value)}
                        </span>
                        <div className="h-3 rounded-r-full" style={{ width: `${percent}%`, background: bar.color }} />
                        <span aria-hidden="true" className="absolute bottom-0 h-4 border-l" style={{ left: `${percent}%`, borderColor: BLUE }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 border-t border-border-light pt-3">
                <span className="text-[12px] text-text-secondary">Net change</span>
                <strong className="text-[16px] tnum" style={{ color }} title={exact(deal.delta)}>
                  {deal.delta === 0 ? "No total change" : change}
                </strong>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">How the months changed</h3>
                <p className="flex gap-3 text-[11px] text-text-secondary">
                  <span className="inline-flex items-center gap-1"><TrendingUp size={12} style={{ color: GAIN }} aria-hidden="true" />Added</span>
                  <span className="inline-flex items-center gap-1"><TrendingDown size={12} style={{ color: LOSS }} aria-hidden="true" />Removed</span>
                </p>
              </div>
              <div className="mt-3 rounded-xl bg-surface/40 px-2 py-3">
                  <MovementBarChart
                    enabled={open}
                    data={deal.months.map(month => {
                      const scale = Math.max(month.was, month.now, 1);
                      const positive = month.delta > 0;
                      return {
                        label: monthLabel(month.month),
                        value: month.delta,
                        valueLabel: `${positive ? "+" : "−"}${formatMoney(Math.abs(month.delta))}`,
                        exactValue: `${positive ? "+" : "−"}${exact(Math.abs(month.delta))}`,
                        color: positive ? GAIN : LOSS,
                        description: `${monthLabel(month.month)}: frozen ${exact(month.was)}, today ${exact(month.now)}. ${positive ? "Added" : "Removed"} ${exact(Math.abs(month.delta))}.`,
                        tip: [
                          { name: "Frozen", value: exact(month.was), bar: { pct: month.was / scale * 100, color: tint(BLUE, 45) } },
                          { name: "Today", value: exact(month.now), bar: { pct: month.now / scale * 100, color: BLUE } },
                          { name: deal.opportunityName, sub: deal.customer, logo: deal.customer },
                        ],
                      };
                    })}
                  />
              </div>
            </div>
          </div>

        </div>
      </div>
    </article>
  );
}
