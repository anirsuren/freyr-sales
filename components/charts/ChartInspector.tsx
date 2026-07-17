"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Maximize2, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

export type ChartRecord = {
  id: string;
  label: string;
  meta?: string;
  value?: string;
  href?: string;
  avatar?: string;
  logo?: string;
};

export function ChartInspector({
  title,
  description,
  children,
  expandedChildren,
  records = [],
  searchPlaceholder = "Search records...",
  showSearch = true,
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
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      `${record.label} ${record.meta || ""} ${record.value || ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [query, records]);

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
                onClick={() => setOpen(true)}
                aria-label={`Enlarge ${title}`}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-tertiary hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
              >
                <Maximize2 size={14} strokeWidth={1.9} />
              </button>
            </Tooltip>
          </div>
        </div>
        {showSearch && records.length > 0 && (
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
        {records.length === 0 && <div className="mb-3" />}
        {showSearch && query && records.length > 0 && (
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
        <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="chart">
        {description && <p className="mb-4 text-[13px] text-text-secondary">{description}</p>}
        {showSearch && records.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative w-[320px]">
              <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-[12.5px] outline-none focus:border-blue-primary"
              />
            </div>
            <span className="text-[12px] text-text-tertiary tnum">{matches.length} records</span>
          </div>
        )}
        <div className="rounded-lg border border-border-light bg-surface/30 p-5">
          {expandedChildren || children}
        </div>
        {records.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-lg border border-border-light">
            <div className="max-h-[260px] divide-y divide-border-light overflow-y-auto">
              {matches.map((record) => recordRow(record))}
              {matches.length === 0 && <p className="p-5 text-[13px] text-text-tertiary">No matching records.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
