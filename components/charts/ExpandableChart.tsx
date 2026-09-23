"use client";

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ChartExpansionSuppressionProvider } from "@/components/charts/ExpandedChartModal";
import { InteractiveChartTipProvider } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";

export type ChartDetailRow = {
  /** Primary label — the stage, rep, outcome or period this row describes. */
  label: string;
  /** Formatted value, already carrying its unit ("$476K", "3 deals", "28%"). */
  value: string;
  /** Optional secondary line: who or what sits behind the number. */
  sub?: string;
  /** Swatch matching the chart, so a row and its slice are unmistakably linked. */
  color?: string;
  /** 0-100. Draws a proportion bar so the table reads as a chart in itself. */
  percent?: number;
};

/**
 * Any chart, openable full-size.
 *
 * Card charts are necessarily small, and a hover popup only ever shows the one
 * slice under the cursor — so reading the whole breakdown meant hovering every
 * segment in turn and remembering what each said (Anir, Jul 25: "I need the
 * ability to open all these fucking graphs"). Clicking a chart now opens it
 * large, with every row listed at once beneath it.
 *
 * The chart is passed as a render function taking `expanded`, so the same
 * component can draw itself bigger in the modal rather than being scaled up as
 * a bitmap — an SVG chart re-rendered at size stays sharp and can afford labels
 * the card version has no room for.
 */
export function ExpandableChart({
  title,
  subtitle,
  rows,
  footnote,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** The full breakdown, listed under the enlarged chart. */
  rows?: ChartDetailRow[];
  /** Optional caveat shown under the table — e.g. what the total excludes. */
  footnote?: string;
  children: (expanded: boolean, selectedRow: number | null) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  return (
    <>
      <div className={cn("group relative", className)}>
        {/* Sits over the card's own header row and stays visible. Chart
            expansion is a primary reading control, not a hover easter egg. */}
        <button
          type="button"
          onClick={() => { setSelectedRow(null); setOpen(true); }}
          aria-label={`Open ${title} full size`}
          title="Open full size"
          className="absolute -top-1 right-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-light bg-[var(--white)] text-text-secondary shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-all hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/30"
        >
          <Maximize2 size={13} strokeWidth={2} />
        </button>
        <ChartExpansionSuppressionProvider>
          {children(false, null)}
        </ChartExpansionSuppressionProvider>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="chart" bodyClassName="flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col p-2">
          {subtitle && <p className="border-b border-border-light pb-3 text-[13px] text-text-secondary">{subtitle}</p>}
          <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <div className="flex min-h-[320px] items-center justify-center overflow-auto rounded-2xl border border-border-light bg-surface p-5">
              <InteractiveChartTipProvider>
                <ChartExpansionSuppressionProvider>{children(true, selectedRow)}</ChartExpansionSuppressionProvider>
              </InteractiveChartTipProvider>
            </div>
            <div className="min-h-[320px] overflow-y-auto rounded-2xl border border-border-light bg-white p-3">
              <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Explore the chart</p>
              {rows?.length ? (
                <>
                  <button type="button" aria-pressed={selectedRow === null} onClick={() => setSelectedRow(null)} className={cn("mb-1 w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold", selectedRow === null ? "bg-blue-light text-blue-primary" : "text-text-primary hover:bg-surface")}>All categories</button>
                  {rows.map((row, index) => (
                    <button key={`${row.label}-${index}`} type="button" aria-pressed={selectedRow === index} onClick={() => setSelectedRow(index)} className={cn("mb-1 w-full rounded-xl px-3 py-2.5 text-left transition-colors", selectedRow === index ? "bg-blue-light/70" : "hover:bg-surface")}>
                      <span className="flex items-start gap-2.5"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color || "var(--blue-primary)" }} /><span className="min-w-0 flex-1 text-[13px] font-medium text-text-primary">{row.label}</span><span className="shrink-0 text-[13px] font-semibold tabular-nums text-text-primary">{row.value}</span></span>
                      {selectedRow === index && <span className="mt-2 block pl-5 text-[12px] text-text-secondary">{row.sub || (/^0(?:\b|\s)/.test(row.value) ? "Nothing in this category right now." : "Showing this category in the chart breakdown.")}</span>}
                    </button>
                  ))}
                </>
              ) : <p className="px-2 text-[12.5px] text-text-secondary">Use the chart to inspect its values.</p>}
              {footnote && <p className="mt-3 border-t border-border-light px-2 pt-3 text-[11.5px] text-text-tertiary">{footnote}</p>}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
