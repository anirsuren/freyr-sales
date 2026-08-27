"use client";

import { useEffect, useState } from "react";
import { useEscapeToClose } from "@/components/ui/useDismissable";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, ListChecks, Printer } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";
import { BASE_CURRENCY } from "@/lib/currency";
import {
  actualValue,
  entryStatusLabel,
  familyValue,
  verifiedValue,
  milestoneByNow,
  paceVerdict,
  pctMet,
  yearElapsed,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";

/**
 * PERFORMANCE, IN EXCEL (Anir, Aug 15: "so many features that are missing").
 *
 * Forecast and Customers both export because Suren works in a spreadsheet;
 * this page, the one that IS the numbers, had no way out at all. Two exports,
 * because they answer different questions:
 *
 *   Goals   — one row per goal: target, what is verified, what is still
 *             waiting, % met and whether it is behind the calendar.
 *   Entries — one row per claim: who, how much, which customer, its status
 *             and who locked it. This is the audit trail.
 *
 * RAW NUMBERS, never "$1.4M" strings, so the columns stay summable — the same
 * rule the forecast export follows.
 */
export function PerformanceExport({
  state,
  goals,
  label,
  live,
}: {
  state: PerformanceState;
  /** The goals actually on screen, so an export matches what you filtered. */
  goals: PrimaryGoal[];
  /** Goes in the filename: "org", "group-test", "person-anir-suren". */
  label: string;
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(open, () => setOpen(false));
  /** The header slot only exists after the module has mounted. */
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("perf-header-actions"));
  }, []);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function exportGoals() {
    const rows = goals.map((g) => {
      const actual = actualValue(state.actuals, g, { rates: state.rates });
      const verified = verifiedValue(state, g);
      const waiting = Math.max(0, actual - verified);
      return [
        g.name,
        g.type,
        g.year,
        g.unit,
        g.unit === "currency" ? g.currency ?? BASE_CURRENCY : "",
        g.measure,
        g.target || 0,
        actual,
        verified,
        waiting,
        // Verdict columns judge verified money, same as the page (tick 6).
        g.target > 0
          ? Math.min(100, Math.round(pctMet(verified, g.target) * 10) / 10)
          : "",
        Math.round(yearElapsed(g.year) * 1000) / 10,
        // Same schedule the page judges against — the CSV must never call a
        // goal "unscheduled" while the screen calls it lagging.
        paceVerdict(verified, g.target, g.year, g.measure, undefined, milestoneByNow(g)),
        g.verified ? "yes" : "no",
        (g.assignments ?? []).map((a) => a.person).join("; "),
        (g.groupAssignments ?? [])
          .map((a) => state.groups.find((x) => x.id === a.groupId)?.name ?? a.groupId)
          .join("; "),
        g.subgoals.length,
      ];
    });
    downloadCSV(
      `freyr-performance-goals-${slug}.csv`,
      toCSV(
        [
          "Goal",
          "Type",
          "Year",
          "Unit",
          "Currency",
          "Measure",
          "Target",
          "Actual",
          "Verified",
          "Waiting on verification",
          "% met",
          "% of year elapsed",
          "Standing",
          "Signed off by leadership",
          "Assigned people",
          "Assigned groups",
          "Subgoals",
        ],
        rows
      )
    );
    setOpen(false);
  }

  function exportEntries() {
    const ids = new Set(goals.flatMap((g) => [g.id, ...(g.componentGoalIds ?? [])]));
    const rows = state.actuals
      .filter((a) => ids.has(a.goalId))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => {
        const goal = state.goals.find((g) => g.id === a.goalId);
        const sub = goal?.subgoals.find((s) => s.id === a.subgoalId);
        return [
          a.date,
          a.person,
          goal?.name ?? a.goalId,
          sub?.name ?? "",
          a.amount,
          goal?.unit ?? "",
          // A code on the entry wins; money goals fall back to their own
          // currency — the same resolution fmtAmount uses on screen.
          a.currency ?? (goal?.unit === "currency" ? goal?.currency ?? BASE_CURRENCY : ""),
          a.customer ?? "",
          a.dealLabel ?? "",
          entryStatusLabel(a),
          a.verifiedBy ?? "",
          a.verifiedAt ? a.verifiedAt.slice(0, 10) : "",
          a.sentBackBy ?? "",
          a.sentBackAt ? a.sentBackAt.slice(0, 10) : "",
          a.managerNote ?? "",
          (a.evidence ?? []).map((e) => e.name).join("; "),
          a.addedBy,
          a.addedAt.slice(0, 10),
        ];
      });
    downloadCSV(
      `freyr-performance-entries-${slug}.csv`,
      toCSV(
        [
          "Result date",
          "Person",
          "Goal",
          "Subgoal",
          "Amount",
          "Unit",
          "Currency",
          "Customer",
          "Deal",
          "Status",
          "Verified by",
          "Verified on",
          "Sent back by",
          "Sent back on",
          "Sent-back note",
          "Evidence",
          "Entered by",
          "Entered on",
        ],
        rows
      )
    );
    setOpen(false);
  }

  if (!live) return null;

  const control = (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Export or print this view"
        aria-label="Export or print this view"
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
      >
        <Download size={13} strokeWidth={2.2} />
        Export
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="menu-in absolute right-0 top-full z-30 mt-1.5 w-[268px] overflow-hidden rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
            <ExportRow
              icon={<FileSpreadsheet size={14} strokeWidth={2.1} />}
              title="Goals as a spreadsheet"
              sub={`${goals.length} row${goals.length === 1 ? "" : "s"} · target, verified, waiting, pace`}
              onClick={exportGoals}
            />
            <ExportRow
              icon={<ListChecks size={14} strokeWidth={2.1} />}
              title="Every logged entry"
              sub="who claimed what, and who locked it"
              onClick={exportEntries}
            />
            <ExportRow
              icon={<Printer size={14} strokeWidth={2.1} />}
              title="Print / Save as PDF"
              sub="this page, as it stands"
              onClick={() => {
                setOpen(false);
                window.print();
              }}
            />
          </div>
        </>
      )}
    </span>
  );

  return slot ? createPortal(control, slot) : null;
}

function ExportRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface"
    >
      <span className="mt-0.5 text-blue-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-text-primary">
          {title}
        </span>
        <span className="block text-[11px] text-text-tertiary">{sub}</span>
      </span>
    </button>
  );
}
