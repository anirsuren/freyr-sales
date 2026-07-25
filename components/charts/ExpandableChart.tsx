"use client";

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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
  children: (expanded: boolean) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={cn("group relative", className)}>
        {/* Sits over the card's own header row. Visible on hover and on
            keyboard focus — a control that only appears on hover is invisible
            to anyone tabbing through. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title} full size`}
          title="Open full size"
          className="absolute -top-1 right-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-light bg-white/90 text-text-tertiary opacity-0 transition-all hover:border-blue-subtle hover:text-blue-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Maximize2 size={13} strokeWidth={2} />
        </button>
        {children(false)}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="chart">
        {subtitle && (
          <p className="mb-4 text-[13px] text-text-secondary">{subtitle}</p>
        )}
        <div className="mb-5 flex justify-center">{children(true)}</div>

        {rows && rows.length > 0 && (
          <div className="border-t border-border-light pt-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Full breakdown
            </p>
            <ul className="space-y-2.5">
              {rows.map((row, index) => (
                <li key={`${row.label}-${index}`} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      {row.color && (
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: row.color }}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary">
                          {row.label}
                        </span>
                        {row.sub && (
                          <span className="block text-[11.5px] text-text-secondary">
                            {row.sub}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tnum text-text-primary">
                      {row.value}
                    </span>
                  </div>
                  {typeof row.percent === "number" && (
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, row.percent))}%`,
                          background: row.color || "var(--blue-primary)",
                        }}
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {footnote && (
              <p className="mt-3 text-[11.5px] text-text-tertiary">{footnote}</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
