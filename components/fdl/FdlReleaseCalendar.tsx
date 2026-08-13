"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFillHeight } from "@/components/ui/useFillHeight";
import { FullScreenButton } from "@/components/ui/FullScreenPanel";
import Link from "next/link";
import { ArrowLeft, AlarmClock, CalendarCheck, CalendarRange, CircleCheck, Layers, Rocket, Search, X } from "lucide-react";
import type { FdlComponent, FdlComponentType } from "@/lib/offerings";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { cn } from "@/lib/utils";
import { FDL_TYPE_META } from "./FdlComponentsBrowser";

/**
 * EVERY COMPONENT'S RELEASES ON ONE CALENDAR (Suren, Aug 12: "these things
 * can be months... take those release dates and map it here — all the
 * components together, one report"). Rows are FDL components, columns are
 * months, cells are the versions that land in that month, colored the same
 * way the per-component timeline colors them. The filters he asked for sit
 * on top: by status, and latest-version-only vs the whole history.
 */

type ReleaseStatus = "released" | "current" | "expected";

const STATUS_META: Record<ReleaseStatus, { label: string; color: string }> = {
  released: { label: "Released", color: "#16A34A" },
  current: { label: "Current", color: "#0071E3" },
  expected: { label: "Expected", color: "#7C3AED" },
};

function releaseStatus(r: FdlComponent["releases"][number]): ReleaseStatus {
  if (r.current) return "current";
  return r.status === "released" ? "released" : "expected";
}

function withV(version: string): string {
  return /^v/i.test(version) ? version.toUpperCase() : `V${version}`;
}

/** "2026-08-09" -> a sortable month index; undated releases return null. */
function monthIndex(date?: string): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(index: number): string {
  return `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;
}

function fmtDay(date?: string): string {
  if (!date) return "no date yet";
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The glance row: what's landing, what's coming, what slipped — computed
 *  over every component, before any table filter narrows the view. */
function ReleaseStats({ components }: { components: FdlComponent[] }) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  let thisMonth = 0;
  let expectedSoon = 0;
  let overdue = 0;
  let withCurrent = 0;
  for (const c of components) {
    if (c.releases.some((r) => r.current)) withCurrent += 1;
    for (const r of c.releases) {
      if (r.date?.startsWith(monthKey)) thisMonth += 1;
      if (r.status === "next" && r.date) {
        if (r.date >= today && r.date <= in30) expectedSoon += 1;
        if (r.date < today) overdue += 1;
      }
    }
  }

  return (
    <div className="rise-in mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={CalendarCheck}
        label="Landing this month"
        value={String(thisMonth)}
        sub={thisMonth === 1 ? "version" : "versions"}
      />
      <StatTile
        icon={Rocket}
        label="Expected in 30 days"
        value={String(expectedSoon)}
        sub={expectedSoon === 1 ? "version" : "versions"}
        color="#7C3AED"
      />
      <StatTile
        icon={AlarmClock}
        label="Past their date"
        value={String(overdue)}
        sub="expected, not out yet"
        warn={overdue > 0}
      />
      <StatTile
        icon={CircleCheck}
        label="On a current version"
        value={`${withCurrent} of ${components.length}`}
        sub="components"
        color="#16A34A"
      />
    </div>
  );
}

export function FdlReleaseCalendar({ components }: { components: FdlComponent[] }) {
  const [statusFilter, setStatusFilter] = useState<"" | ReleaseStatus>("");
  const [scope, setScope] = useState<"all" | "latest">("all");
  const [query, setQuery] = useState("");
  /**
   * CROSSHAIR, THE SAME ONE THE HEAT MAP HAS (Anir, Aug 13: "you're not doing
   * the highlighting thing when I put my mouse over these, like you're doing on
   * the heat map"). Hovering a cell lights its whole row and its whole column,
   * and both headers answer the question the beams are asking: THIS component,
   * THIS month.
   */
  const [cross, setCross] = useState<{ row: string; col: number } | null>(null);
  /* And it ends where the window ends, like the heat map. */
  const { ref: gridRef, height: gridHeight } = useFillHeight(96, 320);
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullScreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  const nowIndex = new Date().getFullYear() * 12 + new Date().getMonth();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => {
        let releases = [...c.releases];
        if (scope === "latest" && releases.length > 1) {
          // The newest version per component: latest date wins, undated last.
          releases = [
            releases.reduce((best, r) =>
              (r.date ?? "") >= (best.date ?? "") ? r : best
            ),
          ];
        }
        if (statusFilter) {
          releases = releases.filter((r) => releaseStatus(r) === statusFilter);
        }
        return { component: c, releases };
      })
      .filter((row) => row.releases.length > 0);
  }, [components, query, scope, statusFilter]);

  const monthRange = useMemo(() => {
    const indexes = rows
      .flatMap((row) => row.releases.map((r) => monthIndex(r.date)))
      .filter((v): v is number => v !== null);
    if (indexes.length === 0) return [] as number[];
    const min = Math.min(...indexes);
    const max = Math.max(...indexes);
    const list: number[] = [];
    for (let i = min; i <= max; i++) list.push(i);
    return list;
  }, [rows]);

  const anyUndated = rows.some((row) => row.releases.some((r) => !r.date));

  // Land looking at NOW, not at the oldest month: the span can run a year or
  // more, and opening on empty history made the report look broken.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || monthRange.length === 0) return;
    const idx = monthRange.findIndex((m) => m >= nowIndex);
    if (idx <= 0) return;
    el.scrollLeft = Math.max(0, 240 + idx * 128 - el.clientWidth / 2);
  }, [monthRange, nowIndex]);

  return (
    <div>
      <Link
        href="/components"
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2.2} /> All components
      </Link>
      <PageHeader
        title="Release calendar"
        subtitle="Every component's versions mapped onto the months they land — released, current and expected together."
      />

      <ReleaseStats components={components} />

      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-[300px]">
          <Search
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components…"
            aria-label="Search components"
            className="w-full rounded-lg border border-border-light bg-white py-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
          />
        </label>
        <ColorSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          ariaLabel="Filter by release status"
          dense
          collapsible={false}
          className="w-[170px] shrink-0"
          options={[
            { value: "", label: "All statuses", color: "#0071E3", icon: Layers },
            ...(Object.keys(STATUS_META) as ReleaseStatus[]).map((s) => ({
              value: s,
              label: STATUS_META[s].label,
              color: STATUS_META[s].color,
              icon: Rocket,
            })),
          ]}
        />
        <ColorSelect
          value={scope}
          onChange={(v) => setScope(v as typeof scope)}
          ariaLabel="Choose which versions to show"
          dense
          collapsible={false}
          className="w-[190px] shrink-0"
          options={[
            { value: "all", label: "All versions", color: "#0071E3", icon: Layers },
            { value: "latest", label: "Latest per component", color: "#6D28D9", icon: Rocket },
          ]}
        />
        <span className="ml-auto flex items-center gap-3">
          {(Object.keys(STATUS_META) as ReleaseStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-secondary">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STATUS_META[s].color }}
              />
              {STATUS_META[s].label}
            </span>
          ))}
          <FullScreenButton
            onOpen={() => setFullScreen(true)}
            label="release calendar"
          />
        </span>
      </div>

      {fullScreen && (
        <div
          onClick={() => setFullScreen(false)}
          className="matrix-backdrop-in fixed inset-0 z-[200] bg-[rgba(15,23,42,0.45)] backdrop-blur-[1px]"
          aria-hidden="true"
        />
      )}
      {fullScreen && (
        <div className="matrix-pop-in fixed inset-x-6 top-6 z-[201] flex h-[53px] items-center justify-between gap-4 rounded-t-2xl border border-b-0 border-border-light bg-white px-5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Release calendar
          </h2>
          <button
            type="button"
            onClick={() => setFullScreen(false)}
            aria-label="Close full screen"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      )}

      {rows.length === 0 || (monthRange.length === 0 && !anyUndated) ? (
        <div className="rounded-xl border border-border-light bg-white px-6 py-14 text-center text-[13px] text-text-secondary">
          Nothing matches these filters — widen the status or version scope to
          see releases.
        </div>
      ) : (
        <div
          ref={(node) => {
            scrollRef.current = node;
            gridRef(node);
          }}
          style={!fullScreen && gridHeight ? { height: gridHeight } : undefined}
          onMouseLeave={() => setCross(null)}
          className={cn(
            "overflow-auto border border-border-light bg-white",
            fullScreen
              ? "matrix-pop-in fixed inset-x-6 bottom-6 top-[calc(1.5rem+53px)] z-[201] rounded-b-2xl border-t-0"
              : "-mb-28 rounded-xl"
          )}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ minWidth: 240 + (monthRange.length + (anyUndated ? 1 : 0)) * 128 }}
          >
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-[240px] border-b border-r border-border-light bg-surface px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                  Component ↓ <span className="text-blue-primary">Month →</span>
                </th>
                {monthRange.map((m) => (
                  <th
                    key={m}
                    className={cn(
                      "min-w-[128px] border-b border-r border-border-light px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.05em] transition-colors duration-150",
                      m === nowIndex
                        ? "bg-blue-light/60 text-blue-primary"
                        : cross?.col === m
                          ? "bg-blue-light/45 text-blue-primary"
                          : "text-text-tertiary"
                    )}
                  >
                    {monthLabel(m)}
                    {m === nowIndex && (
                      <span className="mt-0.5 block text-[9px] font-bold tracking-[0.08em]">
                        THIS MONTH
                      </span>
                    )}
                  </th>
                ))}
                {anyUndated && (
                  <th className="min-w-[128px] border-b border-border-light px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Date TBD
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ component, releases }) => {
                const TypeIcon = FDL_TYPE_META[component.type as FdlComponentType].Icon;
                const typeColor = FDL_TYPE_META[component.type as FdlComponentType].color;
                const chip = (r: FdlComponent["releases"][number]) => {
                  const status = releaseStatus(r);
                  return (
                    <Link
                      key={r.id}
                      href={`/components/${component.id}?from=/components/release-calendar`}
                      title={`${withV(r.version)} · ${STATUS_META[status].label} · ${fmtDay(r.date)}`}
                      className="step-in inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-[11px] font-bold text-white transition-all hover:-translate-y-px hover:opacity-90"
                      style={{ background: STATUS_META[status].color }}
                    >
                      {withV(r.version)}
                    </Link>
                  );
                };
                return (
                  <tr key={component.id} className="group">
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-b border-r border-border-light px-4 py-3 transition-colors duration-150",
                        cross?.row === component.id
                          ? "bg-blue-light/45"
                          : "bg-white group-hover:bg-surface"
                      )}
                    >
                      <Link
                        href={`/components/${component.id}?from=/components/release-calendar`}
                        className="flex items-center gap-2.5"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ color: typeColor, background: `${typeColor}14` }}
                        >
                          <TypeIcon size={15} strokeWidth={2} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
                            {component.name}
                          </span>
                          <span className="block text-[10.5px] text-text-tertiary">
                            {component.type}
                          </span>
                        </span>
                      </Link>
                    </td>
                    {monthRange.map((m) => {
                      const here = releases.filter((r) => monthIndex(r.date) === m);
                      return (
                        <td
                          key={m}
                          onMouseEnter={() => setCross({ row: component.id, col: m })}
                          className={cn(
                            "border-b border-r border-border-light px-3 py-3 text-center align-middle transition-colors duration-150",
                            m === nowIndex && "bg-blue-light/30",
                            // The two beams, and a stronger tint where they meet.
                            cross?.row === component.id && cross?.col === m
                              ? "bg-blue-light/70"
                              : cross?.row === component.id || cross?.col === m
                                ? "bg-blue-light/35"
                                : undefined
                          )}
                        >
                          {here.length > 0 && (
                            <span className="inline-flex flex-wrap items-center justify-center gap-1">
                              {here.map(chip)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {anyUndated && (
                      <td className="border-b border-border-light px-3 py-3 text-center align-middle">
                        <span className="inline-flex flex-wrap items-center justify-center gap-1">
                          {releases.filter((r) => !r.date).map(chip)}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
        <CalendarRange size={13} strokeWidth={2} />
        Click any version to open its component. The per-component timeline
        stays on each component&apos;s page.
      </p>
    </div>
  );
}
