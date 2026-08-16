"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarFold,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Crown,
  Paperclip,
} from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { cn } from "@/lib/utils";
import {
  currentFiscalYear,
  entryStatus,
  familyValue,
  fiscalLabel,
  fiscalMonthLabels,
  fiscalRange,
  fiscalWeeks,
  fmtAmount,
  goalCadences,
  goalFamilyActuals,
  yearElapsed,
  headedGroups,
  isComposite,
  type PerfActual,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { typeMeta, GroupPill, PaceTimeline } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * ONE GOAL DONE PROPERLY — the screen Suren approved on Aug 13: the composite
 * header with the verified total, the three bookings people actually enter,
 * the year period by period with a Weeks/Months/Quarters/Years toggle, the
 * verification rail with the evidence one click away, and the groups compared
 * at the bottom right. Rebuilt to that design after the first attempt drifted
 * from it (Anir: "he said that was good... you have to change everything").
 *
 * Honest numbers, always: verified is the number, waiting is shown amber and
 * never counts, and monthly targets render as dashes until the target-spread
 * feature exists. Nothing is invented.
 */

/** Reported-but-unverified, drawn as hatched brand blue: the same colour as a
 *  signed-off number because it is the same measurement, striped because it is
 *  not confirmed yet. */
const COMPONENT_COLORS = ["#0071E3", "#0F766E", "#6D28D9"];
const COMPONENT_ICONS = ["🚀", "📈", "🔁"];

/**
 * "halves" is Suren's semiannual view (Aug 14, via Anir: "you also have H1 and
 * H2… semiannual one and semiannual two").
 *
 * It is deliberately NOT a new Cadence. Cadence is a property of a goal
 * (weekly / monthly / quarterly / yearly) that lives in the stored model, and
 * adding a fifth would mean touching the Goal Master and the performance
 * normalizer, which silently drops any field it does not carry. A half is not
 * a rhythm anyone reports on; it is a slice of the fiscal year, the same way
 * Years is. So it reads the existing `fiscalRange(fy, "half", i)`, which has
 * supported halves all along, and is always available.
 */
type Granularity = "weeks" | "months" | "quarters" | "halves" | "years";

/**
 * A hover card that can be switched off without unmounting what it wraps.
 * Rendering `<HoverCard>` conditionally would remount the button underneath it
 * on every open/close, which drops the click that caused the change.
 */
function ConditionalHover({
  on,
  content,
  children,
}: {
  on: boolean;
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!on) return <>{children}</>;
  return (
    <HoverCard side="bottom" width={420} delayMs={0} content={content}>
      {children}
    </HoverCard>
  );
}

function inRange(a: PerfActual, [s, e]: [number, number]): boolean {
  const t = Date.parse(a.date);
  return !Number.isNaN(t) && t >= s && t < e;
}

/** A mark per window size, widest to narrowest. */
const GRAN_META: Record<Granularity, { color: string; icon: typeof CalendarDays }> = {
  weeks: { color: "#0891B2", icon: CalendarRange },
  months: { color: "#0071E3", icon: CalendarDays },
  quarters: { color: "#7C3AED", icon: CalendarClock },
  halves: { color: "#B4318F", icon: CalendarCheck },
  years: { color: "#0F766E", icon: CalendarFold },
};

export function GoalZoom({
  state,
  goalId,
  meName,
  run,
  embedded = false,
  headerAction,
  lit = false,
  fill = false,
}: {
  state: PerformanceState;
  goalId: string;
  meName: string;
  run?: RunOp;
  /**
   * Render inside an expanded row on the Performance page instead of as a
   * page of its own: the component cards and the three boxes, without the
   * back link, the goal header the row already shows, or the verification
   * queue.
   *
   * Anir, Aug 14: "when i click a goal make it a dropdown but if i want to
   * actually go to that page that should be an option too". So this is the
   * same component either way rather than a second copy that drifts, and the
   * standalone page stays reachable from a link at the bottom.
   */
  embedded?: boolean;
  /** Rendered on the drill-down's own header line, so a caller's button never
   *  costs a line of its own (Anir, Aug 15: "that's not a good place, I can't
   *  take up its own line"). */
  headerAction?: React.ReactNode;
  /** The goal's row (or its bar in the chart) is under the cursor: light every
   *  row in here that contributes to the number being pointed at. */
  lit?: boolean;
  /**
   * Given the whole window instead of a slot in a page (Anir, Aug 16: "I meant
   * a full-scale pop-up, not this thin one. I shouldn't even have to scroll
   * unless there's just that much data"). The three columns stretch to the
   * height they are handed and only their own lists scroll, so a dozen months
   * fit without a scrollbar instead of being capped at 340px.
   */
  fill?: boolean;
}) {
  const router = useRouter();
  const goal = state.goals.find((g) => g.id === goalId) as PrimaryGoal;
  const meta = typeMeta(goal.type);
  const composite = isComposite(goal);
  const components = (goal.componentGoalIds ?? [])
    .map((id) => state.goals.find((g) => g.id === id))
    .filter((g): g is PrimaryGoal => Boolean(g));
  const cadences = goalCadences(goal);
  const nowFy = currentFiscalYear();
  const [fy, setFy] = useState(nowFy);
  const [gran, setGran] = useState<Granularity>("months");
  const [selected, setSelected] = useState<number | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /** Which period row has its own dropdown open (Anir, Aug 16: "when I click
   *  on Organization, it'll have another dropdown within the month"). Separate
   *  from `selected`, which stays put so boxes 2 and 3 always have a period. */
  const [openPeriod, setOpenPeriod] = useState<number | null>(null);
  const heads = headedGroups(state, meName);
  const amHead = heads.length > 0;

  const yearRange = fiscalRange(fy, "year");
  const familyIds = new Set([goal.id, ...(goal.componentGoalIds ?? [])]);
  const familyActuals = goalFamilyActuals(state, goal);

  const val = (range: [number, number] | null, extra: object = {}) =>
    familyValue(state, goal, { ...(range ? { range } : {}), ...extra });

  const yearVerified = val(yearRange, { verifiedOnly: true });
  const yearAwaiting = val(yearRange, { reportedOnly: true });
  const yearTarget =
    goal.target || components.reduce((s, c) => s + (c.target || 0), 0);

  const now = Date.now();
  const monthLabels = fiscalMonthLabels(fy);
  const currentMonthIdx = (() => {
    for (let i = 0; i < 12; i++) {
      const [s, e] = fiscalRange(fy, "month", i);
      if (now >= s && now < e) return i;
    }
    return -1;
  })();

  /** Rows for the period table at the chosen granularity. */
  const rows = useMemo(() => {
    const build = (
      label: string,
      sub: string,
      range: [number, number],
      isNow: boolean
    ) => {
      const verified = val(range, { verifiedOnly: true });
      const awaiting = val(range, { reportedOnly: true });
      const entries = familyActuals.filter((a) => inRange(a, range));
      const waitingCount = entries.filter(
        (a) => entryStatus(a) === "reported"
      ).length;
      const ended = range[1] <= now;
      return { label, sub, range, isNow, verified, awaiting, waitingCount, entries: entries.length, ended };
    };
    if (gran === "years") {
      return Array.from({ length: 5 }, (_, i) => {
        const y = nowFy - 4 + i;
        return build(
          fiscalLabel(y),
          `Apr ${String(y).slice(2)} – Mar ${String(y + 1).slice(2)}`,
          fiscalRange(y, "year"),
          y === nowFy
        );
      });
    }
    if (gran === "quarters") {
      return [0, 1, 2, 3].map((q) => {
        const range = fiscalRange(fy, "quarter", q);
        return build(
          `Q${q + 1}`,
          `${monthLabels[q * 3].slice(0, 3)} · ${monthLabels[q * 3 + 1].slice(0, 3)} · ${monthLabels[q * 3 + 2].slice(0, 3)}`,
          range,
          now >= range[0] && now < range[1]
        );
      });
    }
    if (gran === "halves") {
      return [0, 1].map((h) => {
        const range = fiscalRange(fy, "half", h);
        return build(
          `H${h + 1}`,
          `${monthLabels[h * 6].slice(0, 3)} – ${monthLabels[h * 6 + 5].slice(0, 3)}`,
          range,
          now >= range[0] && now < range[1]
        );
      });
    }
    if (gran === "weeks") {
      const monthIdx = currentMonthIdx >= 0 ? currentMonthIdx : 0;
      return fiscalWeeks(fy, monthIdx).map((w) =>
        build(w.label, monthLabels[monthIdx], w.range, now >= w.range[0] && now < w.range[1])
      );
    }
    return monthLabels.map((label, i) => {
      const range = fiscalRange(fy, "month", i);
      return build(label, "", range, i === currentMonthIdx && fy === nowFy);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gran, fy, state, currentMonthIdx]);

  const maxRow = Math.max(1, ...rows.map((r) => r.verified + r.awaiting));
  /**
   * EVERY BAR IS A SHARE OF THE TARGET (Anir, Aug 15: "it says 25% met, which
   * is fine... but then in August it says 250K, but why is it 100%? That
   * doesn't make sense to me").
   *
   * They used to be scaled to the biggest row, so the single month that had
   * anything in it filled its track completely while the row above said 25%.
   * The same $250K now reads 25% here, in the group box and on the person —
   * one meaning for a full bar, everywhere on the screen. With no target set
   * there is nothing to be a share OF, so those fall back to relative scale
   * and the box says so.
   */
  const scaleBase = yearTarget > 0 ? yearTarget : maxRow;

  /** Verification rail: waiting entries on THIS goal family. */
  const waiting = familyActuals
    .filter((a) => entryStatus(a) === "reported")
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    .slice(0, 8);
  const recentVerified = familyActuals
    .filter((a) => entryStatus(a) === "verified" && a.verifiedBy)
    .sort((a, b) => ((a.verifiedAt ?? "") < (b.verifiedAt ?? "") ? 1 : -1))
    .slice(0, 3);

  const canVerify = (person: string) =>
    heads.some(
      (g) =>
        g.head.trim().toLowerCase() === person.trim().toLowerCase() ||
        g.members.some(
          (m) => m.trim().toLowerCase() === person.trim().toLowerCase()
        )
    );

  /** Groups compared on this goal, this FY. */
  const groupRows = state.groups
    .map((g) => {
      const people = new Set([g.head, ...g.members].map((n) => n.trim()));
      return {
        group: g,
        verified: familyValue(state, goal, {
          range: yearRange,
          people,
          verifiedOnly: true,
        }),
      };
    })
    .sort((a, b) => b.verified - a.verified);
  const maxGroup = Math.max(1, ...groupRows.map((r) => r.verified));

  const componentOf = (a: PerfActual) =>
    components.findIndex((c) => c.id === a.goalId);

  const grans: { key: Granularity; label: string; allowed: boolean }[] = [
    { key: "weeks", label: "Weeks", allowed: cadences.includes("weekly") },
    { key: "months", label: "Months", allowed: cadences.includes("monthly") },
    { key: "quarters", label: "Quarters", allowed: cadences.includes("quarterly") },
    // Always available, like Years: a half is a slice of the fiscal year, not
    // a cadence a goal has to opt into. H1 is Apr–Sep, H2 is Oct–Mar.
    { key: "halves", label: "Halves", allowed: true },
    { key: "years", label: "Years", allowed: true },
  ];

  const pill = (cls: string, text: string) => (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", cls)}>
      {text}
    </span>
  );

  return (
    <div
      className={cn(
        embedded ? "" : "mx-auto max-w-[1500px]",
        fill && "flex h-full min-h-0 flex-col"
      )}
    >
      {!embedded && (
      <SmartBack
        fallback="/performance"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Org performance
      </SmartBack>
      )}

      {/* ------------------------------------------------ header */}
      {!embedded && (
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}1F`, color: meta.color }}
        >
          <meta.icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-text-primary">
              {goal.name}
            </h1>
            <span className="rounded-full bg-[rgba(0,113,227,0.10)] px-2.5 py-1 text-[11px] font-bold text-blue-primary tnum">
              {fiscalLabel(fy)}
            </span>
            {/* The purple "adds up from N" chip is gone (Anir, Aug 16: "just
                remove this"). The sentence underneath already says the goal is
                the sum of the three below it. */}
          </div>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            {composite
              ? "New business, expansion and renewals added together. Results get logged on those three goals below, and this number is their sum."
              : "Verified results only; claims still waiting for a group owner never count."}
          </p>
        </div>
        {/* Verified, as one compact right-hand cluster on the SAME line as the
            title — it kept dropping to its own row and breaking the spacing
            (Anir: "I don't like how it's taking up its own line"). */}
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded-xl border border-border-light bg-white px-3.5 py-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
            Verified
          </span>
          <span className="text-[20px] font-extrabold tracking-[-0.02em] tnum">
            {fmtAmount(goal.unit, yearVerified)}
          </span>
          {yearTarget > 0 && (
            <span className="text-[12px] font-semibold text-text-tertiary tnum">
              of {fmtAmount(goal.unit, yearTarget)}
            </span>
          )}
          {yearAwaiting > 0 ? (
            <span className="rounded-full bg-[rgba(0,113,227,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#0058B0] tnum">
              +{fmtAmount(goal.unit, yearAwaiting)} waiting
            </span>
          ) : (
            yearTarget === 0 && (
              <span className="rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-blue-primary">
                no target yet
              </span>
            )
          )}
        </div>
      </div>
      )}

      {/* ------------------------------------------------ component cards */}
      {composite && (
        <div className={cn("grid grid-cols-1 gap-3.5 lg:grid-cols-3", embedded ? "mt-0" : "mt-4")}>
          {components.map((c, i) => {
            const cVerified = val(yearRange, {
              componentGoalId: c.id,
              verifiedOnly: true,
            });
            const cAwaiting = val(yearRange, {
              componentGoalId: c.id,
              reportedOnly: true,
            });
            const cEntries = familyActuals.filter(
              (a) => a.goalId === c.id && inRange(a, yearRange)
            );
            const cPeople = new Set(cEntries.map((a) => a.person)).size;
            const blurbs = [
              "Brand-new customers signing their first contract.",
              "A current customer adding a new service. The expansion signal: they see more in us.",
              "Contracts ending their term and signing again. The customer-is-happy signal.",
            ];
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[15px]"
                    style={{ background: `${COMPONENT_COLORS[i % 3]}1F` }}
                  >
                    {COMPONENT_ICONS[i % 3]}
                  </span>
                  {/* No "people enter here" chip on each card (Anir, Aug 15):
                      it looked like a button, did nothing, and said the same
                      thing three times. The parent above already says people
                      log results on the goals below, which is where the
                      distinction actually matters. */}
                  <b className="text-[13.5px] text-text-primary">{c.name}</b>
                </div>
                <p className="mt-2.5 text-[21px] font-extrabold tnum">
                  {fmtAmount(c.unit, cVerified)}
                  {c.target > 0 && (
                    <span className="text-[12.5px] font-semibold text-text-tertiary">
                      {" "}
                      of {fmtAmount(c.unit, c.target)}
                    </span>
                  )}
                  {cAwaiting > 0 && (
                    <span className="ml-2 align-middle text-[11px] font-bold text-[color:#0058B0] tnum">
                      +{fmtAmount(c.unit, cAwaiting)} waiting
                    </span>
                  )}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--border-light)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width:
                        c.target > 0
                          ? `${Math.min(100, (cVerified / c.target) * 100)}%`
                          : cVerified > 0
                            ? "100%"
                            : "0%",
                      background: COMPONENT_COLORS[i % 3],
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-text-secondary">
                  {blurbs[i % 3]}{" "}
                  {cEntries.length > 0 && (
                    <span className="text-text-tertiary tnum">
                      {cEntries.length}{" "}
                      {cEntries.length === 1 ? "entry" : "entries"} from{" "}
                      {cPeople} {cPeople === 1 ? "person" : "people"}.
                    </span>
                  )}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* --------------------- Suren's three boxes: org → groups → people.
          The same period context flows left to right: pick a period in Box 1,
          Box 2 shows every group inside it, pick a group and Box 3 shows its
          people. Nothing navigates away; the three columns ARE the drill. */}
      {/* TIGHTER WHEN EMBEDDED (Anir, Aug 16: "why is there so much gap
          here?... the space is massive"). Inside an expanded row this card is
          transparent and borderless, so its 16px of padding was pure empty
          inset stacked on the row's own padding and the grid's margin. */}
      <Card
        className={cn(
          embedded ? "mt-0 border-transparent bg-transparent p-0 shadow-none" : "mt-4 p-4",
          fill && "flex min-h-0 flex-1 flex-col"
        )}
      >
        <div className="flex items-center gap-3">
          <b className="shrink-0 whitespace-nowrap text-[14px] text-text-primary">
            Organization → group → person
          </b>
          {/* The subtitle went (Anir, Aug 15: "also remove this text"). The
              three numbered column headings below already say what this is. */}
          {headerAction && <span className="ml-auto shrink-0">{headerAction}</span>}
          {/* FIVE BUTTONS BECAME ONE PICKER (Anir, Aug 15: "where you say weeks,
              months, quarters, etc., let's make that into a single drop-down
              with icons"). Same five choices, a fifth of the width, and each
              one carries a mark for how wide a window it is. */}
          <span className={cn("shrink-0", !headerAction && "ml-auto")}>
            <ColorSelect
              value={gran}
              onChange={(next) => {
                setGran(next as Granularity);
                setSelected(null);
                setOpenGroup(null);
              }}
              ariaLabel="Period size"
              dense
              minWidth={150}
              options={grans
                .filter((g) => g.allowed)
                .map((g) => ({
                  value: g.key,
                  label: g.label,
                  color: GRAN_META[g.key].color,
                  icon: GRAN_META[g.key].icon,
                }))}
            />
          </span>
        </div>

        {(() => {
          const selIdx = selected ?? Math.max(0, rows.findIndex((x) => x.isNow));
          const row = rows[selIdx] ?? rows[0];
          const inPeriodGroups = state.groups
            .map((g) => {
              const people = new Set([g.head, ...g.members].map((n) => n.trim()));
              return {
                group: g,
                verified: familyValue(state, goal, { range: row.range, people, verifiedOnly: true }),
                awaiting: familyValue(state, goal, { range: row.range, people, reportedOnly: true }),
              };
            })
            .sort((a, b) => b.verified - a.verified);
          const maxG = yearTarget > 0
            ? yearTarget
            : Math.max(1, ...inPeriodGroups.map((r2) => r2.verified));
          /* NOTHING IS OPEN UNTIL YOU OPEN IT (Anir, Aug 16: "I still can't
             even click it"). Falling back to the first group meant one row was
             always drawn open, and clicking that row did nothing at all —
             there was no state left for the click to change. */
          const selGroup =
            inPeriodGroups.find((r2) => r2.group.id === openGroup) ?? null;
          const groupPeople = selGroup
            ? [...new Set([selGroup.group.head, ...selGroup.group.members].map((n) => n.trim()))]
                .map((name) => ({
                  name,
                  verified: familyValue(state, goal, { range: row.range, person: name, verifiedOnly: true }),
                  awaiting: familyValue(state, goal, { range: row.range, person: name, reportedOnly: true }),
                }))
                .sort((a, b) => b.verified - a.verified)
            : [];
          const maxP = yearTarget > 0
            ? yearTarget
            : Math.max(1, ...groupPeople.map((p) => p.verified));
          const boxCls =
            "rounded-xl border border-border-light bg-white overflow-hidden flex flex-col";
          const boxHead =
            "flex items-center gap-2 border-b border-border-light bg-surface/60 px-3 py-2";
          return (
            <div
              className={cn(
                "mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3",
                fill && "min-h-0 flex-1"
              )}
            >
              {/* -------- Box 1: the organization, period by period */}
              <div className={boxCls}>
                <div className={boxHead}>
                  <b className="text-[12px] text-text-primary">1 · Organization</b>
                  <span className="ml-auto text-[10.5px] text-text-tertiary">
                    pick a period
                  </span>
                </div>
                <div key={`${gran}-${fy}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "max-h-[340px]")}>
                  {rows.map((r, i) => {
                    const active = i === selIdx;
                    const shown = openPeriod === i;
                    const empty = r.verified === 0 && r.awaiting === 0;
                    return (
                      /* NO POP-UP ON THE PERIOD ROWS EITHER (Anir, Aug 16:
                         "This pop-up is annoying me more than helping me...
                         Maybe we should just remove this thing and then put
                         this in its own dropdown"). Same accordion as the
                         groups: click a month, its numbers open underneath it
                         in the column, click again to close. */
                      <Fragment key={r.label}>
                      <div
                        className={cn(
                          shown &&
                            "overflow-hidden rounded-lg ring-1 ring-inset ring-blue-primary/40"
                        )}
                      >
                      <button
                        type="button"
                        aria-expanded={shown}
                        onClick={() => {
                          setSelected(i);
                          setOpenGroup(null);
                          setOpenPeriod(shown ? null : i);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-all",
                          shown ? "bg-[rgba(0,113,227,0.08)]" : "rounded-lg",
                          !shown && active
                            ? "bg-[rgba(0,113,227,0.08)] ring-1 ring-inset ring-blue-primary/40"
                            : !shown && "hover:bg-surface",
                          !empty && lit && "bg-blue-light/50 ring-1 ring-inset ring-blue-primary/30",
                          /* THE REST FADE BUT STAY (Anir, Aug 16: "when I click
                             on this, you can kind of fade out the other ones,
                             but I should still be able to see them"). Hovering
                             a faded row brings it back, so nothing is out of
                             reach while one is open. */
                          openPeriod !== null && !shown && "opacity-45 hover:opacity-100"
                        )}
                      >
                        <b className="w-[108px] shrink-0 truncate text-[12px] text-text-primary">
                          {gran === "weeks" ? r.label.replace("Week ", "") : r.label}
                          {r.isNow && (
                            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-primary align-middle" />
                          )}
                        </b>
                        <span
                          className={cn(
                            "flex flex-1 overflow-hidden rounded-full bg-[color:var(--border-light)] transition-all",
                            !empty && lit ? "h-2.5" : "h-1.5"
                          )}
                        >
                          {!empty && (
                            <>
                              <span
                                className={cn("h-full bg-[#16A34A]", lit && "bar-lit")}
                                style={{
                                  width: `${Math.min(100, (r.verified / scaleBase) * 100)}%`,
                                  ["--bar-glow" as string]: "rgba(22,163,74,0.75)",
                                }}
                              />
                              <span
                                className={cn(
                                  "h-full bg-blue-primary opacity-[0.28]",
                                  lit && "bar-lit"
                                )}
                                style={{ width: `${Math.min(100, (r.awaiting / scaleBase) * 100)}%` }}
                              />
                            </>
                          )}
                        </span>
                        <b className="w-[74px] shrink-0 text-right text-[11.5px] tnum">
                          <span className={r.verified > 0 ? "" : "text-text-tertiary"}>
                            {fmtAmount(goal.unit, r.verified)}
                          </span>
                        </b>
                        {/* WAITING BELONGS ON THE ROW (Anir, Aug 16: "if it
                            says 250k waiting, why is that not shown?"). The
                            column showed $0 for a month holding a quarter of a
                            million in unchecked claims. */}
                        {r.awaiting > 0 && (
                          <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.12)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:#0058B0] tnum">
                            +{fmtAmount(goal.unit, r.awaiting)}
                          </span>
                        )}
                        <ChevronDown
                          size={13}
                          strokeWidth={2.4}
                          aria-hidden="true"
                          className={cn(
                            "shrink-0 text-text-tertiary transition-transform",
                            shown && "rotate-180 text-blue-primary"
                          )}
                        />
                      </button>
                      {shown && (
                        <div className="tab-panel border-t border-border-light bg-white px-2.5 py-2">
                          <div>
                            <PaceTimeline
                              compact
                              title={r.label}
                              verified={r.verified}
                              awaiting={r.awaiting}
                              target={yearTarget}
                              expectedPct={yearElapsed(goal.year) * 100}
                              unit={goal.unit}
                            />
                          </div>
                        </div>
                      )}
                      </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>

              {/* -------- Box 2: every group inside the picked period */}
              <div className={boxCls}>
                <div className={boxHead}>
                  <b className="text-[12px] text-text-primary">2 · Groups</b>
                  <span className="rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                    {row?.label}
                  </span>
                  <span className="ml-auto text-[10.5px] tnum text-text-tertiary">
                    {row ? fmtAmount(goal.unit, row.verified) : ""}
                    {row && row.awaiting > 0 ? ` · ${fmtAmount(goal.unit, row.awaiting)} waiting` : ""}
                  </span>
                </div>
                <div key={`g-${gran}-${selIdx}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "max-h-[340px]")}>
                  {inPeriodGroups.length === 0 ? (
                    <p className="px-2 py-3 text-[12px] text-text-secondary">
                      No groups yet. Once groups exist, this box lists every
                      group&apos;s number for the picked period.
                    </p>
                  ) : (
                    inPeriodGroups.map((r2) => {
                      const active = selGroup?.group.id === r2.group.id;
                      return (
                        r2.verified === 0 && r2.awaiting === 0 ? (
                        <button
                          key={r2.group.id}
                          type="button"
                          onClick={() => setOpenGroup(r2.group.id)}
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            active
                              ? "bg-[rgba(0,113,227,0.08)] ring-1 ring-inset ring-blue-primary/40"
                              : "hover:bg-surface",
                            /* Same fade as every other row in this column. */
                            openGroup !== null && !active && "opacity-45 hover:opacity-100"
                          )}
                        >
                          <span className="flex w-full items-center gap-2.5">
                            <Avatar name={r2.group.head} className="h-6 w-6 shrink-0 text-[9px]" />
                            <span className="min-w-0 flex-1">
                              <GroupPill name={r2.group.name} size="sm" />
                            </span>
                            <b className="shrink-0 text-right text-[11.5px] tnum text-text-tertiary">
                              {fmtAmount(goal.unit, 0)}
                            </b>
                          </span>
                        </button>
                        ) : (
                        <Fragment key={r2.group.id}>
                        {/* ONE OUTLINE ROUND THE WHOLE THING (Anir, Aug 16:
                            "It should just be one box, not two boxes"). The
                            row and what it opens are the same object, so the
                            border goes round both and the header simply sits
                            on top of the content. */}
                        <div
                          className={cn(
                            active &&
                              "overflow-hidden rounded-lg ring-1 ring-inset ring-blue-primary/40"
                          )}
                        >
                        {/* THE HOVER CARD IS FOR THE CLOSED ROW ONLY (Anir,
                            Aug 16: "when I'm hovering over the dropdown, when
                            it's not dropped down, then it can do the hover
                            thing, not when I'm already there. It has nothing
                            else to show me"). Open the row and the same figures
                            are already on screen, so the card was covering the
                            thing you had just asked to see. */}
                        <ConditionalHover
                          on={!active}
                          content={
                            <PaceTimeline
                              title={`${r2.group.name} · ${row?.label ?? ""}`}
                              verified={r2.verified}
                              awaiting={r2.awaiting}
                              target={yearTarget}
                              expectedPct={yearElapsed(goal.year) * 100}
                              unit={goal.unit}
                            />
                          }
                        >
                        <button
                          type="button"
                          aria-expanded={active}
                          onClick={() =>
                            setOpenGroup(active ? null : r2.group.id)
                          }
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 px-2.5 py-2 text-left transition-all",
                            active
                              ? "bg-[rgba(0,113,227,0.08)]"
                              : "rounded-lg hover:bg-surface",
                            !active && lit && "rounded-lg bg-blue-light/50 ring-1 ring-inset ring-blue-primary/30",
                            /* Same fade as the period column above. */
                            openGroup !== null && !active && "opacity-45 hover:opacity-100"
                          )}
                        >
                          {/* THE BAR GETS ITS OWN LINE (Anir, Aug 15: "that bar
                              does not look like a progress bar at all"). Wedged
                              between the pill and two numbers it had about 40px
                              in a column this narrow, so it read as a stray
                              grey pill. Full width underneath, it reads as the
                              bar it is — and it only draws once there is
                              something to draw, since the dash beside the name
                              already says zero. */}
                          <span className="flex w-full items-center gap-2.5">
                            <Avatar name={r2.group.head} className="h-6 w-6 shrink-0 text-[9px]" />
                            <span className="min-w-0 flex-1">
                              <GroupPill name={r2.group.name} size="sm" />
                            </span>
                            <b className="shrink-0 text-right text-[11.5px] tnum">
                              <span className={r2.verified > 0 ? "" : "text-text-tertiary"}>
                                {fmtAmount(goal.unit, r2.verified)}
                              </span>
                            </b>
                            {r2.awaiting > 0 && (
                              <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.12)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:#0058B0] tnum">
                                +{fmtAmount(goal.unit, r2.awaiting)}
                              </span>
                            )}
                            {/* A DROPDOWN HAS TO LOOK LIKE ONE (Anir, Aug 16:
                                "this is still not a drop-down"). The people
                                appeared on select with nothing on the row to
                                say they would, and nothing to close them
                                again. */}
                            <ChevronDown
                              size={13}
                              strokeWidth={2.4}
                              aria-hidden="true"
                              className={cn(
                                "shrink-0 text-text-tertiary transition-transform",
                                active && "rotate-180 text-blue-primary"
                              )}
                            />
                          </span>
                          {(r2.verified > 0 || r2.awaiting > 0) && (
                            <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                              <span
                                className={cn(
                                  "block h-full bg-blue-primary",
                                  lit && "bar-lit"
                                )}
                                style={{ width: `${Math.min(100, (r2.verified / maxG) * 100)}%` }}
                              />
                              {/* WAITING IS THE SAME BLUE, WASHED OUT — not
                                  amber, and not stripes either: both were
                                  rejected (Anir, Aug 15). One colour, two
                                  strengths, so a bar still measures one thing
                                  while saying how much of it is signed off. */}
                              <span
                                className={cn(
                                  "block h-full bg-blue-primary opacity-[0.28]",
                                  lit && "bar-lit"
                                )}
                                style={{
                                  width: `${Math.min(100, (r2.awaiting / maxG) * 100)}%`,
                                }}
                              />
                            </span>
                          )}
                        </button>
                        </ConditionalHover>
                        {active && (
                          /* ONE BOX, NOT A STACK OF THEM (Anir, Aug 16: "I
                             don't like all these boxes. When I click a
                             dropdown, just have everything within that big
                             dropdown box, and then also you don't have to
                             indent it because that's space that you're just
                             wasting"). The timeline and the people are the
                             same disclosure, so they share one outline and
                             start at the same left edge as the row above. */
                          <div className="tab-panel border-t border-border-light bg-white px-2.5 py-2">
                            {/* WHAT THE HOVER CARD USED TO SAY, SAID IN PLACE
                                (Anir, Aug 16: "all of this data should show up
                                when I draw the dropdown"). */}
                            <div>
                              <PaceTimeline
                                compact
                                title={r2.group.name}
                                verified={r2.verified}
                                awaiting={r2.awaiting}
                                target={yearTarget}
                                expectedPct={yearElapsed(goal.year) * 100}
                                unit={goal.unit}
                              />
                            </div>
                            {[
                              ...new Set(
                                [r2.group.head, ...r2.group.members]
                                  .map((n) => n.trim())
                                  .filter(Boolean)
                              ),
                            ].map((name) => {
                              const v = familyValue(state, goal, {
                                range: row.range,
                                person: name,
                                verifiedOnly: true,
                              });
                              const w = familyValue(state, goal, {
                                range: row.range,
                                person: name,
                                reportedOnly: true,
                              });
                              return (
                                /**
                                 * EACH PERSON'S OWN GOAL, AND HOW FAR ALONG
                                 * THEY ARE (Anir, Aug 16: "it should show me
                                 * their individual goal if it exists. It
                                 * should definitely show a progress bar on how
                                 * big compared to the goal they have
                                 * contributed").
                                 *
                                 * A name and a number said nothing about
                                 * whether that number was good. The target
                                 * comes from the goal's own assignment for
                                 * this person; with none set the row says so
                                 * rather than drawing a bar against nothing.
                                 */
                                <span
                                  key={name}
                                  className="flex flex-col gap-1 border-t border-border-light px-0.5 pb-1 pt-2"
                                >
                                  <span className="flex items-center gap-2">
                                  <Avatar
                                    name={name}
                                    className="h-5 w-5 shrink-0 text-[7.5px]"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                                    {name}
                                    {name === r2.group.head && (
                                      <Crown
                                        size={8}
                                        strokeWidth={2.8}
                                        aria-label="Group owner"
                                        className="ml-1 inline text-[color:#7C3AED]"
                                      />
                                    )}
                                  </span>
                                  <b
                                    className={cn(
                                      "shrink-0 text-[11px] tnum",
                                      v > 0 ? "text-text-primary" : "text-text-tertiary"
                                    )}
                                  >
                                    {fmtAmount(goal.unit, v)}
                                  </b>
                                  {w > 0 && (
                                    <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.12)] px-1.5 py-0.5 text-[9px] font-bold text-[color:#0058B0] tnum">
                                      +{fmtAmount(goal.unit, w)}
                                    </span>
                                  )}
                                  </span>
                                  {(() => {
                                    const mine = (goal.assignments ?? []).find(
                                      (a) =>
                                        a.person.trim().toLowerCase() ===
                                        name.trim().toLowerCase()
                                    );
                                    const tgt = mine?.target ?? 0;
                                    /**
                                     * ALWAYS A BAR (Anir, Aug 16: "It should
                                     * definitely show a progress bar on how big
                                     * compared to the goal they have
                                     * contributed"). With an individual target
                                     * the bar measures against that. Without
                                     * one it measures against the same
                                     * denominator every other bar in this
                                     * column uses, so the row still answers
                                     * "how much of this is them" instead of
                                     * printing "no individual target set" and
                                     * leaving a hole where a bar should be.
                                     */
                                    const base = tgt || maxG;
                                    const done = base
                                      ? Math.min(100, ((v + w) / base) * 100)
                                      : 0;
                                    return (
                                      <span className="flex items-center gap-2 pl-7">
                                        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--border-light)]">
                                          <span
                                            className={cn(
                                              "block h-full bg-blue-primary",
                                              lit && "bar-lit"
                                            )}
                                            style={{
                                              width: base
                                                ? `${Math.min(100, (v / base) * 100)}%`
                                                : "0%",
                                            }}
                                          />
                                          <span
                                            className={cn(
                                              "block h-full bg-blue-primary opacity-[0.28]",
                                              lit && "bar-lit"
                                            )}
                                            style={{
                                              width: base
                                                ? `${Math.min(100, (w / base) * 100)}%`
                                                : "0%",
                                            }}
                                          />
                                        </span>
                                        <span className="shrink-0 text-[9.5px] tnum text-text-tertiary">
                                          {Math.round(done)}%{" "}
                                          {tgt
                                            ? `of ${fmtAmount(goal.unit, tgt)}`
                                            : "of the goal"}
                                        </span>
                                      </span>
                                    );
                                  })()}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        </div>
                        </Fragment>
                        )
                      );
                    })
                  )}
                </div>
              </div>

              {/* -------- Box 3: the picked group's people, same period */}
              <div className={boxCls}>
                <div className={boxHead}>
                  <b className="text-[12px] text-text-primary">3 · People</b>
                  {/* Same blue tag as every other group name (Anir, Aug 15:
                      "You have it red somewhere else... just make it blue"). */}
                  {selGroup && <GroupPill name={selGroup.group.name} size="sm" />}
                  <span className="ml-auto text-[10.5px] tnum text-text-tertiary">
                    {selGroup ? fmtAmount(goal.unit, selGroup.verified) : ""}
                  </span>
                </div>
                <div key={`p-${gran}-${selIdx}-${selGroup?.group.id ?? "none"}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "max-h-[340px]")}>
                  {!selGroup ? (
                    <p className="px-2 py-3 text-[12px] text-text-secondary">
                      Pick a group in box 2 and its people line up here for the
                      same period.
                    </p>
                  ) : (
                    groupPeople.map((p) => (
                      p.verified === 0 && p.awaiting === 0 ? (
                      <div key={p.name} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                        <Avatar name={p.name} className="h-6 w-6 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1 text-[11.5px] font-medium leading-tight text-text-primary">
                          {p.name}
                        </span>
                        <b className="shrink-0 text-right text-[11.5px] tnum text-text-tertiary">
                          {fmtAmount(goal.unit, 0)}
                        </b>
                      </div>
                      ) : (
                      <HoverCard
                        key={p.name}
                        side="left"
                        width={420}
                        delayMs={0}
                        content={
                          <PaceTimeline
                            title={`${p.name} · ${row?.label ?? ""}`}
                            verified={p.verified}
                            awaiting={p.awaiting}
                            target={yearTarget}
                            expectedPct={yearElapsed(goal.year) * 100}
                            unit={goal.unit}
                          />
                        }
                      >
                      <div
                        className={cn(
                          "flex flex-col gap-1.5 rounded-lg px-2.5 py-2 transition-all",
                          lit && "bg-blue-light/50 ring-1 ring-inset ring-blue-primary/30"
                        )}
                      >
                        <span className="flex w-full items-center gap-2.5">
                        <Avatar name={p.name} className="h-6 w-6 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1 text-[11.5px] font-medium leading-tight text-text-primary">
                          {p.name}
                          {p.name === selGroup.group.head && (
                            /* The SAME owner mark as the Admin page and the
                               group cards: purple with the crown (Anir,
                               Aug 15). It was magenta and crownless here. */
                            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[rgba(124,58,237,0.10)] px-1.5 py-0.5 text-[8.5px] font-bold text-[color:#7C3AED]">
                              <Crown size={8} strokeWidth={2.8} />
                              owner
                            </span>
                          )}
                        </span>
                        <b className="shrink-0 text-right text-[11.5px] tnum">
                          <span className={p.verified > 0 ? "" : "text-text-tertiary"}>
                            {fmtAmount(goal.unit, p.verified)}
                          </span>
                        </b>
                        {p.awaiting > 0 && (
                          <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.12)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:#0058B0] tnum">
                            +{fmtAmount(goal.unit, p.awaiting)}
                          </span>
                        )}
                        </span>
                        {/* Same as the group rows: full width underneath, and
                            only when there is something to draw. */}
                        {(p.verified > 0 || p.awaiting > 0) && (
                          <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                            <span
                              className={cn(
                                "block h-full bg-blue-primary",
                                lit && "bar-lit"
                              )}
                              style={{ width: `${Math.min(100, (p.verified / maxP) * 100)}%` }}
                            />
                            <span
                              className={cn(
                                "block h-full bg-blue-primary opacity-[0.28]",
                                lit && "bar-lit"
                              )}
                              style={{
                                width: `${Math.min(100, (p.awaiting / maxP) * 100)}%`,
                              }}
                            />
                          </span>
                        )}
                      </div>
                      </HoverCard>
                      )
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* No "Open the full goal page" link here (Anir, Aug 14: "we don't need
          this"). The way out has not gone anywhere: the goal NAME at the top
          of the row is still a link to /performance/goal/[id] on every tab, so
          the expansion does not need to repeat it at the bottom. */}

      {!embedded && (
      <div className="mt-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
          <b className="text-[14px] text-text-primary">
            Waiting for verification
          </b>
          {waiting.length > 0 &&
            pill(
              "bg-[rgba(0,113,227,0.12)] text-[color:#0058B0]",
              String(waiting.length)
            )}
          <span className="ml-auto text-[10.5px] text-text-tertiary">
            only the group owner can verify
          </span>
        </div>
        {waiting.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-text-secondary">
            Nothing waiting. New claims land here with their evidence for
            the group owner to check and lock.
          </p>
        ) : (
          <div className="divide-y divide-border-light/70 px-4">
            {waiting.map((a) => {
              const ci = componentOf(a);
              return (
                <div key={a.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar name={a.person} className="h-6 w-6 text-[9px]" />
                    <b className="text-[12.5px]">{a.person}</b>
                    {ci >= 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: `${COMPONENT_COLORS[ci % 3]}1A`,
                          color: COMPONENT_COLORS[ci % 3],
                        }}
                      >
                        {COMPONENT_ICONS[ci % 3]}{" "}
                        {components[ci].name.replace("Booked ", "")}
                      </span>
                    )}
                    <b className="text-[12.5px] tnum">
                      {fmtAmount(goal.unit, a.amount)}
                    </b>
                    <span className="text-[10.5px] text-text-tertiary tnum">
                      {a.date}
                    </span>
                    {amHead && canVerify(a.person) && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (run) {
                            await run(
                              { op: "verify-actual", actualId: a.id },
                              "Verified and locked. It counts now"
                            );
                            return;
                          }
                          const res = await fetch("/api/performance", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              op: "verify-actual",
                              actualId: a.id,
                            }),
                          });
                          if (res.ok) router.refresh();
                          else {
                            const data = await res.json().catch(() => ({}));
                            alert(data.error ?? "Could not verify");
                          }
                        }}
                        className="ml-auto cursor-pointer rounded-lg bg-blue-primary px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97]"
                      >
                        Verify ✓
                      </button>
                    )}
                  </div>
                  {a.customer && (
                    <p className="mt-1 pl-8 text-[11px] text-text-secondary">
                      {a.customer}
                    </p>
                  )}
                  {a.evidence?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1.5 pl-8">
                      {a.evidence.map((e) => (
                        <a
                          key={e.url}
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-blue-primary hover:bg-[rgba(0,113,227,0.14)]"
                        >
                          <Paperclip size={10} strokeWidth={2.4} /> {e.name}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 pl-8 text-[10.5px] text-[color:#0058B0]">
                      No evidence attached.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {recentVerified.length > 0 && (
          <div className="border-t border-border-light px-4 py-2.5">
            {recentVerified.map((a) => (
              <p
                key={a.id}
                className="flex items-center gap-1.5 py-0.5 text-[11px] text-text-secondary"
              >
                <CheckCircle2
                  size={12}
                  strokeWidth={2.4}
                  className="shrink-0 text-[#16A34A]"
                />
                <b>{a.person}</b> · {fmtAmount(goal.unit, a.amount)}
                {a.customer ? ` · ${a.customer}` : ""}. Verified by{" "}
                {a.verifiedBy}, locked
              </p>
            ))}
          </div>
        )}
      </Card>
      </div>
      )}
    </div>
  );
}
