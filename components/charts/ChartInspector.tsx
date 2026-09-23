"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Maximize2, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OutcomeBadge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { ChartExpansionSuppressionProvider } from "@/components/charts/ExpandedChartModal";
import { cn, OUTCOME_META } from "@/lib/utils";

export type ChartRecord = {
  id: string;
  label: string;
  meta?: string;
  value?: string;
  href?: string;
  avatar?: string;
  logo?: string;
  /** OUTCOME_META key ("interested", "follow_up", …) — a STRING, not a
   *  component, so server components can pass it. Renders the app's colour +
   *  icon outcome pill instead of the outcome as plain text (Suren: "the
   *  outcome should be color-coded properly"). */
  outcome?: string;
};

export function ChartInspector({
  title,
  description,
  children,
  expandedChildren,
  records = [],
  searchPlaceholder = "Search records...",
  showSearch = true,
  inlineSearch = true,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
  records?: ChartRecord[];
  searchPlaceholder?: string;
  showSearch?: boolean;
  /** Drop the search box from the CARD while keeping it in the expanded
   *  modal (Suren, Jul 27: "you can remove the search bar — it's already there
   *  when I open the extended version… I do not need a search bar on this pie
   *  chart"). The card then always charts the FULL record set. */
  inlineSearch?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const outcomeOptions = useMemo(() => [...new Set(records.map((record) => record.outcome).filter((outcome): outcome is string => !!outcome))], [records]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) =>
      (!selectedOutcome || record.outcome === selectedOutcome) &&
      (!needle ||
      `${record.label} ${record.meta || ""} ${record.value || ""} ${
        record.outcome ? OUTCOME_META[record.outcome]?.label || record.outcome : ""
      }`
        .toLowerCase()
        .includes(needle))
    );
  }, [query, records, selectedOutcome]);

  const recordRow = (record: ChartRecord, compact = false) => {
    const content = (
      <>
        {record.avatar ? (
          <Avatar name={record.avatar} className="h-7 w-7 shrink-0 text-[9px]" />
        ) : record.logo ? (
          <CompanyLogo name={record.logo} className="h-7 w-7 shrink-0 text-[9px]" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-primary" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-text-primary">
            {record.label}
          </span>
          {record.meta && (
            <span className="block truncate text-[10.5px] text-text-tertiary">{record.meta}</span>
          )}
        </span>
        {record.outcome && <OutcomeBadge outcome={record.outcome} />}
        {record.value && (
          <span className="shrink-0 text-[11.5px] font-semibold text-text-secondary tnum">
            {record.value}
          </span>
        )}
      </>
    );
    const rowClass = cn(
      "flex items-center gap-2.5 text-left",
      compact ? "rounded-md border border-border-light bg-white px-2.5 py-2" : "px-3 py-2.5",
      record.href && "hover:bg-surface"
    );
    return record.href ? (
      <Link key={record.id} href={record.href} className={rowClass}>
        {content}
      </Link>
    ) : (
      <div key={record.id} className={rowClass}>{content}</div>
    );
  };

  return (
    <>
      <Card className={cn("flex flex-col", className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-text-tertiary">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip label={`Enlarge ${title}`}>
              <button
                type="button"
                onClick={() => { setSelectedOutcome(null); setOpen(true); }}
                aria-label={`Enlarge ${title}`}
                title={`Enlarge ${title}`}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white p-0 text-text-secondary shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
              >
                <Maximize2 size={14} strokeWidth={1.9} />
              </button>
            </Tooltip>
          </div>
        </div>
        {showSearch && inlineSearch && records.length > 0 && (
          <div className="relative mt-3 mb-3 w-full">
            <Search size={13} strokeWidth={1.8} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-md border border-border bg-white pl-7 pr-2 text-[11.5px] outline-none focus:border-blue-primary"
            />
          </div>
        )}
        {(records.length === 0 || !inlineSearch) && <div className="mb-3" />}
        {showSearch && inlineSearch && query && records.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-md bg-surface/70 p-2">
            {matches.slice(0, 4).map((record) => recordRow(record, true))}
            {matches.length === 0 && (
              <p className="col-span-2 px-2 py-2 text-[12px] text-text-tertiary">No matching records.</p>
            )}
            {matches.length > 4 && (
              <button onClick={() => setOpen(true)} className="col-span-2 text-left text-[11.5px] font-semibold text-blue-primary">
                View all {matches.length} matches
              </button>
            )}
          </div>
        )}
        <div className={cn("min-h-0 flex-1", bodyClassName)}>
          <ChartExpansionSuppressionProvider>
            {children}
          </ChartExpansionSuppressionProvider>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="chart" bodyClassName="flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col p-2">
          {description && <p className="border-b border-border-light pb-3 text-[13px] text-text-secondary">{description}</p>}
          <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <div className="flex min-h-[320px] items-center justify-center overflow-auto rounded-2xl border border-border-light bg-surface p-5">
              <ChartExpansionSuppressionProvider>{expandedChildren || children}</ChartExpansionSuppressionProvider>
            </div>
            <div className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border-light bg-white">
              <div className="border-b border-border-light p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Explore the chart</p>
                <p className="mt-1 text-[12.5px] text-text-secondary">{matches.length} {matches.length === 1 ? "record" : "records"} in this view</p>
                {showSearch && records.length > 0 && <div className="relative mt-3"><Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[12.5px] outline-none focus:border-blue-primary" /></div>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {outcomeOptions.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border-light pb-3">
                  <button type="button" aria-pressed={selectedOutcome === null} onClick={() => setSelectedOutcome(null)} className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", selectedOutcome === null ? "bg-blue-light text-blue-primary" : "bg-surface text-text-secondary hover:text-text-primary")}>All outcomes</button>
                  {outcomeOptions.map((outcome) => <button key={outcome} type="button" aria-pressed={selectedOutcome === outcome} onClick={() => setSelectedOutcome(outcome)} className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", selectedOutcome === outcome ? "bg-blue-light text-blue-primary" : "bg-surface text-text-secondary hover:text-text-primary")}>{OUTCOME_META[outcome]?.label || outcome}</button>)}
                </div>}
                <div className="divide-y divide-border-light">{matches.map((record) => recordRow(record))}</div>
                {matches.length === 0 && <p className="p-4 text-[13px] text-text-secondary">{records.length === 0 ? "No individual records are attached to this chart." : "Nothing matches this selection."}</p>}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
