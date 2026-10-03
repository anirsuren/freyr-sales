"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { donutSyncBroadcast, useDonutSync, SeriesMark } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";

export type GoalProgressRow = {
  id: string; label: string; actual: string; target: string | null;
  progress: number | null; verifiedProgress: number; verified: string; sentBackProgress: number;
  color: string; icon: string; people: string[];
};

/** A percentage compares attainment only; missing targets never become bars. */
export function GoalProgressModal({ title, rows, renderRows, syncId }: { syncId: string; title: string; rows: GoalProgressRow[]; renderRows: (openId: string | null, toggle: (id: string) => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const linkedIndex = useDonutSync(syncId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const selected = rows.find(row => row.id === selectedId);
  const toggleGoal = (id: string) => {
    const opening = selectedId !== id;
    setSelectedId(opening ? id : null);
    if (opening) requestAnimationFrame(() => {
      const row = Array.from(rowsRef.current?.querySelectorAll<HTMLElement>("[data-goal-row]") ?? []).find(element => element.dataset.goalRow === id);
      row?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  };
  const max = Math.max(120, ...rows.map(row => row.progress === null ? 0 : Math.min(120, row.progress)));
  const progressText = (row: GoalProgressRow) => row.progress === null ? "No target" : `${Math.round(row.progress)}%`;
  return <>
    <button type="button" aria-label={`Expand goal progress, open ${title} chart`} title="Expand goal progress" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSelectedId(null); setOpen(true); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-text-primary hover:bg-blue-light hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40"><Maximize2 size={14} /></button>
    <Modal open={open} onClose={() => setOpen(false)} title={title} size="chart" dialogClassName="!h-auto !max-w-[1280px]" bodyClassName="!p-0">
      <p className="px-6 pt-3 text-[13px] text-text-secondary">Actual performance against annual targets. Select a bar or goal to open its details below. Select it again to close.</p>
      {rows.length === 0 ? <p className="p-10 text-center text-text-secondary">No goals match these filters.</p> : <>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 overflow-x-auto px-6 pb-4 pt-6">
            <div className="relative pl-10" style={{ minWidth: Math.max(460, rows.length * 94) }}>
              <div className="relative h-[230px] border-b border-border">
                {[0, 50, 100].map(tick => <div key={tick} className={cn("pointer-events-none absolute left-0 right-0 border-t", tick === 100 ? "border-dashed border-text-tertiary/60" : "border-border-light")} style={{ bottom: `${tick / max * 100}%` }}><span className="absolute -left-10 -top-2 w-8 text-right text-[10px] tabular-nums text-text-tertiary">{tick}%</span></div>)}
                <div className="absolute inset-0 flex items-end gap-4 px-3">
                  {rows.map((row, index) => <button key={row.id} onMouseEnter={() => donutSyncBroadcast(syncId, index)} onMouseLeave={() => donutSyncBroadcast(syncId, null)} type="button" aria-label={`Inspect ${row.label}: ${progressText(row)}`} aria-pressed={selected?.id === row.id} onClick={() => toggleGoal(row.id)} className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40">
                    {row.progress === null ? <span className="mb-2 text-[10px] text-text-tertiary">No target</span> : <div className={cn("relative w-full max-w-[64px] rounded-t-md bg-surface-secondary", selected?.id === row.id && "outline outline-2 outline-offset-2 outline-blue-primary")} style={{ height: `${Math.max(1, Math.min(max, row.progress) / max * 100)}%` }}>
                      <span className={cn("bar-fill absolute inset-x-0 bottom-0 rounded-t-md", linkedIndex === rows.indexOf(row) && "bar-lit")} style={{ ["--bar-glow" as string]: "var(--entry-verified)", background: "var(--entry-verified)", height: `${row.progress > 0 ? Math.min(100, row.verifiedProgress / row.progress * 100) : 0}%` }} />
                      {row.progress > row.verifiedProgress && <span className={cn("bar-fill absolute inset-x-0 rounded-t-md", linkedIndex === rows.indexOf(row) && "bar-lit")} style={{ ["--bar-glow" as string]: "var(--entry-waiting)", bottom: `${row.verifiedProgress / row.progress * 100}%`, height: `${(row.progress - row.verifiedProgress) / row.progress * 100}%`, background: "repeating-linear-gradient(45deg,var(--entry-waiting),var(--entry-waiting) 5px,var(--white) 5px,var(--white) 10px)" }} />}
                      {row.sentBackProgress > 0 && row.progress > 0 && <span className={cn("bar-fill absolute inset-x-0", linkedIndex === rows.indexOf(row) && "bar-lit")} style={{ ["--bar-glow" as string]: "var(--entry-sent-back)", bottom: `${row.verifiedProgress / row.progress * 100}%`, height: `${Math.min(row.sentBackProgress, row.progress - row.verifiedProgress) / row.progress * 100}%`, background: "repeating-linear-gradient(45deg,var(--entry-sent-back),var(--entry-sent-back) 5px,var(--white) 5px,var(--white) 10px)" }} />}
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-text-primary">{progressText(row)}</span>
                      {row.progress > max && <span aria-hidden="true" className="absolute inset-x-0 top-5 h-1 -rotate-12 bg-white ring-1 ring-white" />}
                    </div>}
                  </button>)}
                </div>
              </div>
              <div className="flex gap-4 px-3 pt-3">{rows.map(row => <button key={row.id} onClick={() => toggleGoal(row.id)} className={cn("min-w-0 flex-1 text-center text-[11px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40", selected?.id === row.id ? "font-semibold text-blue-primary" : "text-text-secondary")}>{row.label}</button>)}</div>
            </div>
            <p className="mt-4 text-[11px] text-text-tertiary">Green: verified · Striped yellow: awaiting review · Striped red: sent back · Bars above 120% are capped; labels show full attainment.</p>
          </div>
          {selected && <aside aria-label="Selected goal" className="border-t border-border-light px-6 py-6 lg:border-l lg:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Selected goal</p>
            <div className="mb-5 mt-3 flex items-start gap-3"><SeriesMark icon={selected.icon} color={selected.color} /><h3 className="text-[17px] font-semibold leading-snug text-text-primary">{selected.label}</h3></div>
            <dl className="space-y-3 text-[13px]">{[["Actual", selected.actual], ["Target", selected.target ?? "Not set"], ["Progress", progressText(selected)], ["Verified", selected.verified]].map(([label,value]) => <div key={label} className="flex items-center justify-between gap-3"><dt className="text-text-secondary">{label}</dt><dd className="text-right font-semibold tabular-nums text-text-primary">{value}</dd></div>)}</dl>
            <div className="mt-5 border-t border-border-light pt-4"><p className="mb-2 text-[11px] text-text-tertiary">Assigned people</p>{selected.people.length ? <div className="flex flex-wrap gap-2">{selected.people.map(person => <span key={person} className="inline-flex items-center gap-1.5 text-[12px] text-text-primary"><Avatar name={person} className="h-6 w-6 text-[8px]" />{person}</span>)}</div> : <p className="text-[12px] text-text-secondary">No direct person assignments</p>}</div>
            <button type="button" onClick={() => toggleGoal(selected.id)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-subtle px-3 py-2 text-[13px] font-semibold text-blue-primary hover:bg-blue-light">Close goal details<ChevronDown size={15} className="rotate-180" /></button>
          </aside>}
          {!selected && <aside className="border-t border-border-light px-6 py-6 lg:border-l lg:border-t-0"><p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Explore a goal</p><p className="mt-3 text-[13px] text-text-secondary">Select a bar or a goal row to open its results, people and breakdowns in this popup.</p></aside>}
        </div>
        <div ref={rowsRef} className="border-t border-border-light px-6 py-4"><h3 className="mb-2 text-[13px] font-semibold text-text-primary">Goals ({rows.length})</h3><div className="overflow-x-auto rounded-lg border border-border-light">{renderRows(selectedId, toggleGoal)}</div></div>
      </>}
    </Modal>
  </>;
}
