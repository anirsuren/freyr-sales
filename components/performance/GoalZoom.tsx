"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
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
  Eye,
  Paperclip,
} from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { HoverCard } from "@/components/ui/HoverCard";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { cn } from "@/lib/utils";
import { useStickyValue } from "@/lib/useStickyValue";
import {
  currentFiscalYear,
  type EntryStatus,
  type GoalUnit,
  ENTRY_COLOR,
  entryStatus,
  isPending,
  familyValue,
  fiscalLabel,
  fiscalMonthLabels,
  fiscalRange,
  fiscalWeeks,
  fmtAmount,
  goalCadences,
  goalFamilyActuals,
  yearElapsed,
  milestoneByNow,
  attributedMembers,
  headedGroups,
  isComposite,
  type PerfActual,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { typeMeta, GroupPill, PaceTimeline } from "./bits";
import { ClaimReviewDialog } from "./EntryCards";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { useOpportunities } from "@/lib/useOpportunities";
import { weightedValue } from "@/lib/opportunitiesShared";
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
/** One identity colour per line item, matched between a bar's segments and
 *  the rows under it (Anir, Aug 16: "On the progress bar, show this, this,
 *  this, and then color-code it, and then the line items for each below").
 *  Identity hues only — red and green stay reserved for status. */
/** The drill-down rail's height: its default, and the range a drag may
 *  reach. Below the floor the boxes cannot show a row; above the ceiling the
 *  rest of the page is off screen on a laptop. */
const RAIL_DEFAULT = 380;
const RAIL_MIN = 200;
const RAIL_MAX = 900;


/**
 * WHAT EACH COMPONENT ACTUALLY IS, KEYED TO THE GOAL (Anir, Aug 19: "why is
 * there a renewals thing?... What is that renewals card at the top? What is
 * that supposed to be? I don't know what it is. That's a problem").
 *
 * The mark and the blurb used to come from the card's POSITION — slot 0 got
 * the rocket and "brand-new customers signing their first contract" whatever
 * goal happened to land there. On his group, scope left Renewals in slot 0,
 * so the card described renewals as first-time contracts. Position is not a
 * fact about a goal; the goal is.
 *
 * Matched on id first (these three are seeded with stable ids) and on name
 * second, so a renamed or hand-made component still finds its own words. A
 * component nobody has described gets the goal's own type mark and no blurb —
 * silence beats a confident wrong sentence.
 */
const COMPONENT_META: Record<string, { icon: string; color: string; blurb: string }> = {
  "pg-org-booked-new": {
    icon: "🚀",
    color: "#0071E3",
    blurb: "Brand-new customers signing their first contract.",
  },
  "pg-org-booked-existing": {
    icon: "📈",
    color: "#0F766E",
    blurb:
      "A current customer adding a new service. The expansion signal: they see more in us.",
  },
  "pg-org-renewals": {
    icon: "🔁",
    color: "#6D28D9",
    blurb:
      "Contracts ending their term and signing again. The customer-is-happy signal.",
  },
};

const COMPONENT_META_BY_NAME: Record<string, keyof typeof COMPONENT_META> = {
  "booked new business": "pg-org-booked-new",
  "booked existing business": "pg-org-booked-existing",
  renewals: "pg-org-renewals",
};

function componentMeta(goal: Pick<PrimaryGoal, "id" | "name">) {
  const key =
    (COMPONENT_META[goal.id] && goal.id) ||
    COMPONENT_META_BY_NAME[goal.name.trim().toLowerCase()];
  return key ? COMPONENT_META[key] : null;
}

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
  side = "bottom",
}: {
  on: boolean;
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "bottom" | "left";
}) {
  if (!on) return <>{children}</>;
  return (
    <HoverCard side={side} width={420} delayMs={0} content={content}>
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

/**
 * A SEGMENT'S COLOUR IS ITS STATUS, NOT ITS SERIAL NUMBER (Anir, Aug 20:
 * "Where did the purple come from? I should be able to see blue and the red
 * stripe, so I don't see that reflected. It's confusing").
 *
 * These bars used to run through a six-colour palette so you could tell one
 * deal from the next — but every other performance surface reads blue as
 * signed off and red as sent back, so a purple slice invented a meaning the
 * app does not have. The account's own logo beside the row already says which
 * deal it is.
 */
/**
 * THE ORDER EVERY BAR IS DRAWN IN (Anir, Aug 20: "the order and stuff matters
 * ... there shouldn't be any confusion").
 *
 * A person's open bar drew its segments biggest-first, so a refused claim could
 * land to the LEFT of signed-off money while every collapsed bar beside it drew
 * signed-off first. Same money, opposite direction, one screen apart. Signed
 * off, then what somebody has to act on, then what is simply unread.
 */
const SEGMENT_RANK: Record<EntryStatus, number> = {
  verified: 0,
  sent_back: 1,
  reported: 2,
};

function inBarOrder(entries: PerfActual[]): PerfActual[] {
  return [...entries].sort(
    (a, b) =>
      SEGMENT_RANK[entryStatus(a)] - SEGMENT_RANK[entryStatus(b)] ||
      b.amount - a.amount
  );
}

/**
 * THE NUMBER BESIDE A NAME (Anir, Aug 20: "if you're just gonna put two
 * numbers next to each other, I don't want to see that. Just remove that.
 * It's pointless").
 *
 * A closed row carried the verified figure AND a badge for the unverified one,
 * two amounts colliding in a space with room for one. The BAR on that row
 * already shows the split — solid green for what counts, striped for what does
 * not — and opening the row gives both numbers, bracketed and named. So the
 * row shows the one figure that matters: what actually counts.
 */
function RowTotals({
  unit,
  verified,
}: {
  unit: GoalUnit;
  verified: number;
}) {
  return (
    <b
      className="shrink-0 text-right text-[11.5px] tnum"
      style={verified > 0 ? { color: ENTRY_COLOR.verified } : undefined}
    >
      <span className={verified > 0 ? "" : "text-text-tertiary"}>
        {fmtAmount(unit, verified)}
      </span>
    </b>
  );
}

function entryColor(a: PerfActual): string {
  return ENTRY_COLOR[entryStatus(a)];
}

export function GoalZoom({
  state,
  goalId,
  meName,
  run,
  embedded = false,
  headerAction,
  lit = false,
  fill = false,
  onLinkHover,
  onSetSchedule,
  allGoals,
}: {
  state: PerformanceState;
  /**
   * The goal plan BEFORE this screen's scope filter, when there is one.
   *
   * A group screen drops every goal nobody in the group carries — including
   * the components of a rollup — so "the sum of three goals" rendered one
   * card and no explanation (Anir, Aug 19: "It also says one goal. It doesn't
   * show three. why"). With the full list the missing components can still be
   * drawn, greyed, saying who carries them ("you can show the other goals,
   * right? ... gray out the other goals, but at least I can still see them").
   */
  allGoals?: PrimaryGoal[];
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
  /**
   * THE LINK RUNS BOTH WAYS (Anir, Aug 16: "if I hover over the bar chart it
   * properly shines the right things, but if I hover over any one of those
   * linked items, all of those should do the same thing"). The bars in here
   * always RECEIVED the shine via `lit`; this lets them send it, so hovering
   * a month, group or person bar lights the goal's bar in the chart and its
   * row in the table exactly like hovering the chart lights them.
   */
  onLinkHover?: (on: boolean) => void;
  /** Open this goal's editor so its schedule can be set from here. */
  onSetSchedule?: () => void;
}) {
  const router = useRouter();

  const goal = state.goals.find((g) => g.id === goalId) as PrimaryGoal;
  const meta = typeMeta(goal.type);
  const composite = isComposite(goal);
  const componentPool = allGoals ?? state.goals;
  const componentsDeclared = (goal.componentGoalIds ?? [])
    .map((id) => componentPool.find((g) => g.id === id))
    .filter((g): g is PrimaryGoal => Boolean(g));
  /** In the plan, but not on this screen — nobody here carries it. */
  const outOfScope = (c: PrimaryGoal) => !state.goals.some((g) => g.id === c.id);
  /** WHAT THIS SCREEN CARRIES COMES FIRST (Anir, Aug 19: "why are you
   *  putting on the right side? put the ones on the left side that we
   *  need"). Declared order otherwise, so the three always read in the same
   *  sequence once they are all live. */
  /**
   * A CARD IS GREY WHEN NOBODY CARRIES IT — and grey cards go right (Anir,
   * Aug 19, three times: "if that's active, it's on the right", "the ones
   * that are grayed out should be on the right", "why the fuck is the
   * assigned offering last").
   *
   * The first two passes keyed both the greying and the order to SCOPE, so a
   * component with a real person and real money was greyed and sorted last
   * merely because that person sits outside the group being viewed, while two
   * cards nobody has ever touched led the row. Emptiness is the thing being
   * signalled, so emptiness is what drives both: a card with someone on it
   * reads as live wherever they sit, and only the ones with nobody go grey
   * and go last.
   */
  const carriesNobody = (c: PrimaryGoal) =>
    (c.assignments ?? []).length === 0 &&
    !c.subgoals.some((sg) => sg.people.length > 0);
  const components = [
    ...componentsDeclared.filter((c) => !carriesNobody(c)),
    ...componentsDeclared.filter((c) => carriesNobody(c)),
  ];

  /** Everyone who carries a goal, for the greyed cards to name. */
  const carriedBy = (c: PrimaryGoal) => [
    ...new Set([
      ...(c.assignments ?? []).map((a) => a.person),
      ...c.subgoals.flatMap((sg) => sg.people.map((p) => p.name)),
    ]),
  ];
  const cadences = goalCadences(goal);
  const nowFy = currentFiscalYear();
  const [fy, setFy] = useState(nowFy);
  const [gran, setGran] = useState<Granularity>("months");
  /**
   * HOW TALL THE THREE BOXES ARE, dragged from their bottom edge and
   * remembered (Anir, Aug 19: "if I want to shorten the organization, group,
   * and person columns, those three things, at the same time... I can just do
   * so by dragging down the edge or up the edge").
   *
   * One height for all three, because they are one row and resizing them
   * separately would only ever make the row ragged. Clamped silently between
   * a height that still shows a couple of rows and one that fills a large
   * screen — "there should be a set distance... we don't have to show that,
   * it will automatically do that".
   */
  const [railHeight, setRailHeight] = useStickyValue(
    "freyr.performance.zoom.railHeight",
    RAIL_DEFAULT
  );
  const dragFrom = useRef<{ y: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onRailDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragFrom.current = { y: e.clientY, h: railHeight };
      setDragging(true);
      const move = (ev: PointerEvent) => {
        const from = dragFrom.current;
        if (!from) return;
        setRailHeight(
          Math.max(RAIL_MIN, Math.min(RAIL_MAX, from.h + (ev.clientY - from.y)))
        );
      };
      const up = () => {
        dragFrom.current = null;
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [railHeight, setRailHeight]
  );
  const [selected, setSelected] = useState<number | null>(null);
  /**
   * ONE AT A TIME, OR SEVERAL WITH SHIFT (Anir, Aug 16: "when I hold Shift and
   * click something else, then it should do it, but if I just click on
   * something else, it can close it"). A plain click is still an accordion, so
   * the column never fills up by accident; Shift adds to what is open when you
   * want two months or two groups side by side.
   */
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  /**
   * COLUMN 2 LISTS THE PEOPLE ONLY WHEN ASKED (Anir, Aug 16: "you don't have to
   * show the people here because you show the people on the right side anyway…
   * maybe there should be an option to show the people, but it should be like a
   * drop down").
   *
   * Opening a group already fills column 3 with its people, so column 2 was
   * printing the same roster twice and pushing the next group off the screen.
   * Keyed by group id and empty by default: the list is one click away, and it
   * stays open on the group you opened it on while you look at another.
   */
  const [openGroupPeople, setOpenGroupPeople] = useState<Set<string>>(new Set());
  const toggleGroupPeople = (id: string) =>
    setOpenGroupPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** The group column 3 follows — the last one you opened. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const toggleGroup = (id: string, additive: boolean) =>
    setOpenGroups((prev) => {
      const open = prev.has(id);
      const next = additive ? new Set(prev) : new Set<string>();
      if (open) next.delete(id);
      else next.add(id);
      setOpenGroup(open ? null : id);
      return next;
    });
  /** Which period row has its own dropdown open (Anir, Aug 16: "when I click
   *  on Organization, it'll have another dropdown within the month"). Separate
   *  from `selected`, which stays put so boxes 2 and 3 always have a period. */
  /** The claim being reviewed on the standalone page's verification rail. */
  const [reviewId, setReviewId] = useState<string | null>(null);
  /**
   * The standalone goal page renders this component from a SERVER component
   * and cannot hand down a `run` callback, which is why the old rail posted
   * straight to the API. The Review dialog needs one, so this is that same
   * direct post wearing the RunOp shape — the page refreshes instead of
   * mutating client state it does not own.
   */
  const runOrPost: RunOp =
    run ??
    (async (body) => {
      try {
        const res = await fetch("/api/performance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return false;
        router.refresh();
        return true;
      } catch {
        return false;
      }
    });
  const [openPeriods, setOpenPeriods] = useState<Set<number>>(new Set());
  const togglePeriod = (i: number, additive: boolean) =>
    setOpenPeriods((prev) => {
      const open = prev.has(i);
      const next = additive ? new Set(prev) : new Set<number>();
      if (open) next.delete(i);
      else next.add(i);
      return next;
    });
  /**
   * WHOSE LINE ITEMS BOX 3 IS SHOWING.
   *
   * Suren wanted the deals behind a number — "Ananth has achieved 500K, but
   * that 500K came from what opportunities" — AND a way past the drill: "if
   * somebody wants for this August only opportunity levels, I don't want who
   * the person is, group, I don't want to click on any of these things and I
   * should see that... sometimes I don't want to see who is doing it, I want
   * to see all the accounts that are reaching to that number."
   *
   * Anir, Aug 16: the skip is an ABILITY, not the default — and it lives in
   * box 3, not a box of its own ("i dont need a 4th column thats too much...
   * merge the 4th and 3rd column"). People by default, each unfolding onto
   * their own deals; widen only when you want to skip the drill.
   */
  const [lineScope, setLineScope] = useState<"person" | "group" | "period">(
    "person"
  );
  /** Which person is unfolded onto their line items, inside box 3. */
  const [openPeople, setOpenPeople] = useState<Set<string>>(new Set());
  /**
   * EVERY OPEN IS ADDITIVE (Anir, Aug 20: "I wanna be able to open up
   * multiple. Why can't I open up multiple?"). This used to close every other
   * person unless you knew to hold a modifier — an invisible rule. A click
   * toggles that one person, full stop; the months column has worked this way
   * all along, and two columns of the same drill must not disagree about what
   * a click does.
   */
  const togglePerson = (name: string) =>
    setOpenPeople((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const { opportunities, loading: oppsLoading } = useOpportunities();
  const heads = headedGroups(state, meName);
  const amHead = heads.length > 0;

  const yearRange = fiscalRange(fy, "year");
  const familyIds = new Set([goal.id, ...(goal.componentGoalIds ?? [])]);
  const familyActuals = goalFamilyActuals(state, goal);

  const val = (range: [number, number] | null, extra: object = {}) =>
    familyValue(state, goal, { ...(range ? { range } : {}), ...extra });

  const yearVerified = val(yearRange, { verifiedOnly: true });
  const yearAwaiting = val(yearRange, { reportedOnly: true });
  const yearSentBack = val(yearRange, { sentBackOnly: true });
  const yearTarget =
    goal.target || components.reduce((s, c) => s + (c.target || 0), 0);

  /**
   * WHERE THIS GOAL SHOULD BE BY TODAY, from the pipeline when it can say so
   * (Anir, Aug 16: the straight line "doesn't make any sense" when the deals
   * are dated November). Falls back to the calendar share for goals with no
   * dated deals behind them.
   */
  /**
   * The goal's OWN schedule, or nothing (Anir, Aug 16: "shouldn't that be
   * something that whoever makes the goal has in the goal? ... It shouldn't
   * be you"). No milestone means the timeline shows no marker at all.
   */
  const dueMilestone = milestoneByNow(goal);
  const pacing = {
    expected: dueMilestone?.amount,
    /* An ISO day is a DAY, not an instant. `new Date("2026-07-31")` parses as
       UTC midnight, which west of Greenwich renders as the 30th — a milestone
       silently one day early. Split the parts and build it locally. */
    dueLabel: dueMilestone
      ? (() => {
          const [y, mo, d] = dueMilestone.date.split("-").map(Number);
          return new Date(y, (mo ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          });
        })()
      : undefined,
  };

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
      // Box 1 had no idea any of its money had been refused, so the months
      // column was the one panel with no red in it at all (Anir, Aug 20).
      const sentBack = val(range, { sentBackOnly: true });
      const entries = familyActuals.filter((a) => inRange(a, range));
      const waitingCount = entries.filter(
        (a) => isPending(a)
      ).length;
      const ended = range[1] <= now;
      return { label, sub, range, isNow, verified, awaiting, sentBack, waitingCount, entries: entries.length, ended };
    };
    if (gran === "years") {
      return Array.from({ length: 5 }, (_, i) => {
        const y = nowFy - 4 + i;
        return build(
          fiscalLabel(y),
          `Apr ${String(y).slice(2)}. Mar ${String(y + 1).slice(2)}`,
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
          `${monthLabels[h * 6].slice(0, 3)}. ${monthLabels[h * 6 + 5].slice(0, 3)}`,
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
    .filter((a) => isPending(a))
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
            <span
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold tnum"
              style={{
                background:
                  yearSentBack > 0
                    ? "rgba(220,38,38,0.12)"
                    : "rgba(0,113,227,0.12)",
                color:
                  yearSentBack > 0
                    ? "var(--entry-sent-back-ink)"
                    : "var(--entry-waiting)",
              }}
            >
              {fmtAmount(goal.unit, yearAwaiting)}{" "}
              {yearSentBack > 0 ? "sent back" : "waiting"}
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
        <div className={cn(embedded ? "mt-0" : "mt-4")}>
        {/* SAY WHAT THESE CARDS ARE (Anir, Aug 19: "If I'm a user and I see
            this goal, I don't know what this means... If I see booked
            revenue, I'm like, why does it look so different from the other
            ones?").
            
            The header that explains a rollup is hidden in the drill-down, so
            these cards used to appear with no introduction at all — a
            "Renewals" card under a "Booked Revenue" row, two unlabelled
            money figures, and nothing saying the two are different goals. */}
        {/* Short by design. The count that matters is the one the cards
            themselves show; a paragraph explaining a mismatch is a patch over
            a display bug, not a fix for it. */}
        <div className="mb-2.5 text-[12.5px] text-text-secondary">
          <b className="text-text-primary">{goal.name}</b> is the sum of the
          goals below. Results are logged on them, never on it.
        </div>
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
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
            const cm = componentMeta(c);
            const cColor = cm?.color ?? typeMeta(c.type).color;
            const away = carriesNobody(c);
            const elsewhere = !away && outOfScope(c);
            const owners = carriedBy(c);
            return (
              <Card
                key={c.id}
                className={cn("p-4", away && "border-dashed bg-surface/60")}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-[15px]",
                      away && "grayscale opacity-60"
                    )}
                    style={{ background: `${cColor}1F`, color: cColor }}
                  >
                    {cm ? (
                      cm.icon
                    ) : (
                      // No description for this one, so it wears its own goal
                      // type's mark rather than borrowing a neighbour's.
                      (() => {
                        const TypeIcon = typeMeta(c.type).icon;
                        return <TypeIcon size={15} strokeWidth={2.2} />;
                      })()
                    )}
                  </span>
                  {/* No "people enter here" chip on each card (Anir, Aug 15):
                      it looked like a button, did nothing, and said the same
                      thing three times. The parent above already says people
                      log results on the goals below, which is where the
                      distinction actually matters. */}
                  <b
                    className={cn(
                      "text-[13.5px]",
                      away ? "text-text-secondary" : "text-text-primary"
                    )}
                  >
                    {c.name}
                  </b>
                </div>
                {away ? (
                  /* Nobody is on it, so there is nothing to draw but the fact. */
                  <p className="mt-2.5 text-[12px] text-text-secondary">
                    Nobody carries this yet, so it adds nothing.
                  </p>
                ) : (
                <>
                <p className="mt-2.5 text-[21px] font-extrabold tnum">
                  {fmtAmount(c.unit, cVerified)}
                  {cAwaiting > 0 && (
                    <span className="ml-2 align-middle text-[11px] font-bold text-[color:#0058B0] tnum">
                      +{fmtAmount(c.unit, cAwaiting)} waiting
                    </span>
                  )}
                </p>
                {/* WHOSE TARGET THIS IS. Printing a bare "of $936K" under a
                    goal whose own target reads $900K made the two look like a
                    part and its whole, which they are not — they are two
                    different goals, each with its own number (Anir: "This says
                    936K, and then the target says 900K. Doesn't make any
                    sense"). */}
                <p className="mt-0.5 text-[11px] text-text-secondary">
                  signed off
                  {c.target > 0 ? (
                    <>
                      {" "}
                      of {c.name}&rsquo;s own{" "}
                      <b className="text-text-primary tnum">
                        {fmtAmount(c.unit, c.target)}
                      </b>{" "}
                      target
                    </>
                  ) : (
                    <>. {c.name} has no target set</>
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
                      background: cColor,
                    }}
                  />
                </div>
                </>
                )}
                {elsewhere && owners.length > 0 && (
                  // Live, but held by people outside the group being viewed —
                  // worth saying, not worth greying the card for.
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
                    {owners.slice(0, 3).map((n) => (
                      <span key={n} className="flex items-center gap-1">
                        <Avatar name={n} className="h-[18px] w-[18px] text-[7px]" />
                        {n}
                      </span>
                    ))}
                    {owners.length > 3 && <span className="tnum">+{owners.length - 3}</span>}
                    <span>· outside this group</span>
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-snug text-text-secondary">
                  {cm ? `${cm.blurb} ` : ""}
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
          /* mt-0 was for the case where nothing sits above this. When the
             component cards do, the heading and its buttons landed right on
             the card edge above (Anir, Aug 19: "the buttons are damn near
             touching that card"). */
          embedded
            ? cn(
                "border-transparent bg-transparent p-0 shadow-none",
                composite ? "mt-5" : "mt-0"
              )
            : "mt-4 p-4",
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
          /* ONE GROUP PER PERSON, PER GOAL (Anir, Aug 16: "He can be in two
             groups, but the goals have to be different, not the same goal.
             Two groups cannot have same person within same goal"). Each row
             counts only the members this goal attributes to it, so the rows
             always add up to the period and the same money can never appear
             twice. */
          const inPeriodGroups = state.groups
            .map((g) => {
              const people = new Set(attributedMembers(state, goal, g));
              return {
                group: g,
                members: [...people],
                verified: familyValue(state, goal, { range: row.range, people, verifiedOnly: true }),
                awaiting: familyValue(state, goal, { range: row.range, people, reportedOnly: true }),
                sentBack: familyValue(state, goal, { range: row.range, people, sentBackOnly: true }),
              };
            })
            /**
             * ONLY THE GROUPS THIS GOAL ACTUALLY TOUCHES (Anir, Aug 19: "is it
             * always gonna show these three groups? Are you sure I signed all
             * three groups to all three of these goals... it's only supposed
             * to show the ones for that goal").
             *
             * It listed every group in the workspace, so a goal with no group
             * assigned at all still showed three rows at $0 — which reads as
             * three departments carrying it and delivering nothing. A group
             * belongs here if the goal was assigned to it, or if its people
             * have put numbers against the goal.
             */
            .filter(
              (r2) =>
                (goal.groupAssignments ?? []).some(
                  (a) => a.groupId === r2.group.id
                ) ||
                r2.verified > 0 ||
                r2.awaiting > 0
            )
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
            ? selGroup.members
                .map((name) => ({
                  name,
                  verified: familyValue(state, goal, { range: row.range, person: name, verifiedOnly: true }),
                  awaiting: familyValue(state, goal, { range: row.range, person: name, reportedOnly: true }),
                  sentBack: familyValue(state, goal, { range: row.range, person: name, sentBackOnly: true }),
                }))
                .sort((a, b) => b.verified - a.verified)
            : [];
          /**
           * THE DEALS BEHIND A NUMBER, rendered wherever it is asked for:
           * under a person inside box 3, or as the whole of box 3 when the
           * scope is widened past the drill.
           */
          const entriesFor = (names: Set<string> | null) =>
            familyActuals
              .filter((a) => inRange(a, row.range))
              .filter((a) => !names || names.has(a.person.trim().toLowerCase()))
              .sort((x, y) => y.amount - x.amount);
          const lineItems = (names: Set<string> | null, indent: boolean) => {
            const entries = entriesFor(names);
            if (entries.length === 0) {
              return (
                /* ROOM TO BREATHE, CENTRED, QUIET (Anir, Aug 19: "can you
                   make this a little bit bigger? It's still too thin. The
                   statement should be kind of in the center, a grayed-out
                   effect") — the same shape the Subgoals and Assigned Groups
                   boxes use when they have nothing to show. */
                <p
                  className={cn(
                    "flex items-center justify-center rounded-lg bg-surface/60 px-3 text-center text-text-tertiary",
                    indent ? "min-h-[76px] py-5 text-[12px]" : "min-h-[92px] py-6 text-[12.5px]"
                  )}
                >
                  {indent
                    ? "No deals logged in this period."
                    : `Nothing logged against this goal in ${row?.label ?? "this period"}.`}
                </p>
              );
            }
            return (
              <div className="space-y-1">
                {entries.map((a) => {
                  const opp = a.opportunityId
                    ? opportunities.find((o) => o.id === a.opportunityId)
                    : undefined;
                  const account = opp?.customer ?? a.customer ?? "";
                  const verified = entryStatus(a) === "verified";
                  return (
                    <div
                      key={a.id}
                      className="flex flex-col gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface"
                    >
                      <span className="flex items-center gap-2">
                        {indent && (
                          /* The dot that ties this row to its segment on the
                             person's bar above. */
                          <span
                            className="h-2.5 w-1 shrink-0 rounded-full"
                            style={{ background: entryColor(a) }}
                          />
                        )}
                        {account ? (
                          <CompanyLogo
                            name={account}
                            className="h-5 w-5 shrink-0 text-[7px]"
                          />
                        ) : (
                          <span className="h-5 w-5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-text-primary">
                          {/* `account` is "" when nothing was recorded, and ""
                              is not nullish — ?? let the empty string through
                              and the row rendered nameless. */}
                          {opp?.name || account || "Logged result"}
                        </span>
                        <b
                          className={cn(
                            "shrink-0 text-[11.5px] tnum",
                            verified ? "" : "text-text-tertiary"
                          )}
                        >
                          {fmtAmount(goal.unit, a.amount, a.currency)}
                        </b>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 pl-7 text-[9.5px] text-text-tertiary">
                        {!indent && (
                          <>
                            <Avatar
                              name={a.person}
                              className="h-3.5 w-3.5 shrink-0 text-[6px]"
                            />
                            <span className="truncate">{a.person}</span>
                            <span>·</span>
                          </>
                        )}
                        <span className="tnum">{a.date}</span>
                        {opp ? (
                          <>
                            {opp.status && (
                              <span className="rounded-full bg-[rgba(0,113,227,0.10)] px-1.5 py-0.5 font-bold text-[color:#0058B0]">
                                {opp.status}
                              </span>
                            )}
                            {opp.confidence !== undefined && (
                              <span className="tnum">
                                {opp.confidence}% ·{" "}
                                {fmtAmount(goal.unit, weightedValue(opp))} weighted
                              </span>
                            )}
                          </>
                        ) : (
                          /* Suren: "not all goals can be connected to deals and
                             opportunities, some goals may not be." */
                          <span>not linked to an opportunity</span>
                        )}
                        {!verified && (
                          <span className="rounded-full bg-[rgba(0,113,227,0.12)] px-1.5 py-0.5 font-bold text-[color:#0058B0]">
                            waiting
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {oppsLoading && (
                  <p className="px-2 text-[10px] text-text-tertiary">
                    Loading deal names…
                  </p>
                )}
              </div>
            );
          };

          const maxP = yearTarget > 0
            ? yearTarget
            : Math.max(1, ...groupPeople.map((p) => p.verified));
          const boxCls =
            "rounded-xl border border-border-light bg-white overflow-hidden flex flex-col";
          const boxHead =
            "flex items-center gap-2 border-b border-border-light bg-surface/60 px-3 py-2";
          return (
            <div className={cn("relative mt-3", fill && "flex min-h-0 flex-1 flex-col")}>
            <div
              className={cn(
                "grid grid-cols-1 gap-3 xl:grid-cols-3",
                fill && "min-h-0 flex-1"
              )}
              // One height, three boxes. In a full-screen modal the viewport
              // decides instead, so the drag is not offered there.
              style={fill ? undefined : { height: railHeight }}
            >
              {/* -------- Box 1: the organization, period by period */}
              <div className={boxCls}>
                <div className={boxHead}>
                  <b className="text-[12px] text-text-primary">1 · Organization</b>
                  <span className="ml-auto text-[10.5px] text-text-tertiary">
                    pick a period
                  </span>
                </div>
                <div key={`${gran}-${fy}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "min-h-0")}>
                  {(() => {
                    const inPeriodAwaiting = rows.some((r) => r.awaiting > 0);
                    return rows.map((r, i) => {
                    const active = i === selIdx;
                    const shown = openPeriods.has(i);
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
                          /* A real border, NOT an inset ring (Anir, Aug 16, third time: "FIX THE
                                 FUCKING CONTAINER"). ring-inset is a box-shadow painted UNDER the
                                 children, and the panel's white background covered three sides of it —
                                 so the box only ever showed around the tinted header. A border cannot
                                 be painted over. The border is always present, transparent when
                                 closed, so opening a row never steals 2px from its bar. */
                          "overflow-hidden rounded-lg border",
                          shown ? "border-blue-primary/40" : "border-transparent"
                        )}
                      >
                      <button
                        type="button"
                        aria-expanded={shown}
                        onClick={(e) => {
                          setSelected(i);
                          togglePeriod(i, e.shiftKey);
                        }}
                        onMouseEnter={() => !empty && onLinkHover?.(true)}
                        onMouseLeave={() => !empty && onLinkHover?.(false)}
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
                          openPeriods.size > 0 && !shown && "opacity-45 hover:opacity-100"
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
                                className={cn("h-full", lit && "bar-lit")}
                                style={{
                                  width: `${Math.min(100, (r.verified / scaleBase) * 100)}%`,
                                  background: ENTRY_COLOR.verified,
                                  ["--bar-glow" as string]: "rgba(22,163,74,0.75)",
                                }}
                              />
                              <span
                                className={cn("unverified-fill h-full", lit && "bar-lit")}
                                style={{
                                  width: `${Math.min(100, (r.awaiting / scaleBase) * 100)}%`,
                                  ["--fill" as string]:
                                    r.sentBack > 0
                                      ? ENTRY_COLOR.sent_back
                                      : ENTRY_COLOR.reported,
                                  ["--bar-glow" as string]: r.sentBack > 0
                                      ? ENTRY_COLOR.sent_back
                                      : ENTRY_COLOR.reported,
                                }}
                              />
                            </>
                          )}
                        </span>
                        <b
                          className="w-[74px] shrink-0 text-right text-[11.5px] tnum"
                          style={r.verified > 0 ? { color: ENTRY_COLOR.verified } : undefined}
                        >
                          <span className={r.verified > 0 ? "" : "text-text-tertiary"}>
                            {fmtAmount(goal.unit, r.verified)}
                          </span>
                        </b>
                        {/* WAITING BELONGS ON THE ROW (Anir, Aug 16: "if it
                            says 250k waiting, why is that not shown?"). The
                            column showed $0 for a month holding a quarter of a
                            million in unchecked claims. */}
                        {/* EVERY ROW RESERVES THE BADGE'S SLOT (Anir, Aug 16:
                            "you can't shorten the progress bar if you have the
                            number"). A conditional badge stole width from the
                            bar, so August's bar was shorter than September's
                            and the columns stopped being comparable. The slot
                            is there on every row; the badge fills it or not. */}
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
                              sentBack={r.sentBack}
                              target={yearTarget}
                              expectedPct={yearElapsed(goal.year) * 100}
                              expected={pacing.expected}
                                expectedDueLabel={pacing.dueLabel}
                                onSetSchedule={onSetSchedule}
                              unit={goal.unit}
                            />
                          </div>
                        </div>
                      )}
                      </div>
                      </Fragment>
                    );
                  });
                  })()}
                </div>
              </div>

              {/* -------- Box 2: every group inside the picked period */}
              <div className={boxCls}>
                <div className={boxHead}>
                  <b className="text-[12px] text-text-primary">2 · Groups</b>
                  <span className="rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                    {row?.label}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[10.5px] tnum text-text-tertiary">
                    {/* THE COLUMN DOES NOT ALWAYS ADD UP TO THIS, AND IT SHOULD
                        SAY SO (Anir, Aug 16: "it looks like it's 500k"). When
                        one person sits in two groups their money appears in
                        both rows, so the rows sum to more than the period. The
                        header is the period's real number — counted once. */}
                    <span>
                      {row ? fmtAmount(goal.unit, row.verified) : ""}
                      {row && row.awaiting > 0
                        ? ` · ${fmtAmount(goal.unit, row.awaiting)} waiting`
                        : ""}
                    </span>

                  </span>
                </div>
                <div key={`g-${gran}-${selIdx}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "min-h-0")}>
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
                          onClick={(e) => toggleGroup(r2.group.id, e.shiftKey)}
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            active
                              ? "bg-[rgba(0,113,227,0.08)] ring-1 ring-inset ring-blue-primary/40"
                              : "hover:bg-surface",
                            /* Same fade as every other row in this column. */
                            openGroups.size > 0 && !active && "opacity-45 hover:opacity-100"
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
                            /* A real border, NOT an inset ring: ring-inset is
                               painted UNDER children, so the panel's white
                               background covered three of its sides. Always
                               present, transparent when closed, so opening a
                               row never steals 2px from its bar. */
                            "overflow-hidden rounded-lg border",
                            active ? "border-blue-primary/40" : "border-transparent"
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
                              sentBack={r2.sentBack}
                              target={yearTarget}
                              expectedPct={yearElapsed(goal.year) * 100}
                              expected={pacing.expected}
                                expectedDueLabel={pacing.dueLabel}
                                onSetSchedule={onSetSchedule}
                              unit={goal.unit}
                            />
                          }
                        >
                        <button
                          type="button"
                          aria-expanded={active}
                          onClick={(e) => toggleGroup(r2.group.id, e.shiftKey)}
                          onMouseEnter={() => onLinkHover?.(true)}
                          onMouseLeave={() => onLinkHover?.(false)}
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 px-2.5 py-2 text-left transition-all",
                            active
                              ? "bg-[rgba(0,113,227,0.08)]"
                              : "rounded-lg hover:bg-surface",
                            !active && lit && "rounded-lg bg-blue-light/50 ring-1 ring-inset ring-blue-primary/30",
                            /* Same fade as the period column above. */
                            openGroups.size > 0 && !active && "opacity-45 hover:opacity-100"
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
                            <RowTotals unit={goal.unit} verified={r2.verified} />
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
                                className={cn("block h-full", lit && "bar-lit")}
                                style={{
                                  width: `${Math.min(100, (r2.verified / maxG) * 100)}%`,
                                  background: ENTRY_COLOR.verified,
                                  ["--bar-glow" as string]: "rgba(22,163,74,0.75)",
                                }}
                              />
                              {/* WAITING IS THE SAME BLUE, WASHED OUT — not
                                  amber, and not stripes either: both were
                                  rejected (Anir, Aug 15). One colour, two
                                  strengths, so a bar still measures one thing
                                  while saying how much of it is signed off. */}
                              <span
                                className={cn("unverified-fill block h-full", lit && "bar-lit")}
                                style={{
                                  width: `${Math.min(100, (r2.awaiting / maxG) * 100)}%`,
                                  ["--fill" as string]:
                                    r2.sentBack > 0
                                      ? ENTRY_COLOR.sent_back
                                      : ENTRY_COLOR.reported,
                                  ["--bar-glow" as string]: r2.sentBack > 0
                                      ? ENTRY_COLOR.sent_back
                                      : ENTRY_COLOR.reported,
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
                                sentBack={r2.sentBack}
                                target={yearTarget}
                                expectedPct={yearElapsed(goal.year) * 100}
                                expected={pacing.expected}
                                expectedDueLabel={pacing.dueLabel}
                                onSetSchedule={onSetSchedule}
                                unit={goal.unit}
                              />
                            </div>
                            {/* THE ROSTER IS A DROPDOWN, NOT A DEFAULT (Anir,
                                Aug 16: "there should be an option to show the
                                people, but it should be like a drop down").
                                Column 3 is already showing these names for the
                                group you just opened. */}
                            {r2.members.length > 0 && (
                              <button
                                type="button"
                                aria-expanded={openGroupPeople.has(r2.group.id)}
                                onClick={() => toggleGroupPeople(r2.group.id)}
                                className={cn(
                                  "mt-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-0.5 py-1 text-[11px] font-semibold transition-colors",
                                  openGroupPeople.has(r2.group.id)
                                    ? "text-blue-primary"
                                    : "text-text-secondary hover:text-blue-primary"
                                )}
                              >
                                <ChevronDown
                                  size={12}
                                  strokeWidth={2.6}
                                  aria-hidden="true"
                                  className={cn(
                                    "shrink-0 transition-transform",
                                    openGroupPeople.has(r2.group.id) &&
                                      "rotate-180"
                                  )}
                                />
                                {openGroupPeople.has(r2.group.id)
                                  ? "Hide"
                                  : "Show"}{" "}
                                {r2.members.length}{" "}
                                {r2.members.length === 1 ? "person" : "people"}
                                {/* Whose names they are, without opening it.
                                    Plain faces, not the hover fan: this sits
                                    inside a button, and a hover card inside a
                                    button is a control inside a control. */}
                                <span className="ml-auto flex shrink-0 items-center pl-1.5">
                                  {r2.members.slice(0, 4).map((n, i) => (
                                    <Avatar
                                      key={n}
                                      name={n}
                                      className={cn(
                                        "h-4 w-4 text-[6.5px] ring-1 ring-white",
                                        i > 0 && "-ml-1"
                                      )}
                                    />
                                  ))}
                                  {r2.members.length > 4 && (
                                    <span className="ml-1 text-[9.5px] font-semibold text-text-tertiary tnum">
                                      +{r2.members.length - 4}
                                    </span>
                                  )}
                                </span>
                              </button>
                            )}
                            {openGroupPeople.has(r2.group.id) &&
                            r2.members.map((name, memberIdx) => {
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
                              const sb = familyValue(state, goal, {
                                range: row.range,
                                person: name,
                                sentBackOnly: true,
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
                                  className={cn(
                                    "flex flex-col gap-1 px-0.5 pb-1 pt-2",
                                    /* A rule between the people only (Anir,
                                       Aug 16: "you can probably keep it
                                       between the people"). */
                                    memberIdx > 0 &&
                                      "border-t border-border-light"
                                  )}
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
                                  <RowTotals unit={goal.unit} verified={v} />
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
                                            className={cn("block h-full", lit && "bar-lit")}
                                            style={{
                                              width: base
                                                ? `${Math.min(100, (v / base) * 100)}%`
                                                : "0%",
                                              background: ENTRY_COLOR.verified,
                                            }}
                                          />
                                          <span
                                            className={cn(
                                              "unverified-fill block h-full",
                                              lit && "bar-lit"
                                            )}
                                            style={{
                                              width: base
                                                ? `${Math.min(100, (w / base) * 100)}%`
                                                : "0%",
                                              ["--fill" as string]:
                                                sb > 0
                                                  ? ENTRY_COLOR.sent_back
                                                  : ENTRY_COLOR.reported,
                                              ["--bar-glow" as string]: sb > 0
                                                  ? ENTRY_COLOR.sent_back
                                                  : ENTRY_COLOR.reported,
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
                  <b className="text-[12px] text-text-primary">
                    3 · {lineScope === "person" ? "People" : "Line items"}
                  </b>
                  {/* Same blue tag as every other group name (Anir, Aug 15:
                      "You have it red somewhere else... just make it blue"). */}
                  {selGroup && lineScope !== "period" && (
                    <GroupPill name={selGroup.group.name} size="sm" />
                  )}
                  {/* THE LINE ITEMS LIVE IN THIS COLUMN (Anir, Aug 16: "i dont
                      need a 4th column thats too much... it should be line
                      items within the 3rd column. like merge the 4th and 3rd
                      column"). People by default, each one opening onto the
                      deals behind their number; the switch widens to the whole
                      group or the whole period, which is the skip he asked
                      for. */}
                  {/* Bigger hit target (Anir, Aug 19: "you got to make this
                      bigger, cuz I can barely click on those. It's too
                      small"). ~20% up on every axis, still pinned right. */}
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-surface p-[3px]">
                    {(
                      [
                        ["person", "People"],
                        ["group", "Group"],
                        ["period", row?.label ?? "Period"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLineScope(k)}
                        className={cn(
                          "cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                          lineScope === k
                            ? "bg-white text-blue-primary shadow-sm"
                            : "text-text-tertiary hover:text-text-primary"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                <div key={`p-${gran}-${selIdx}-${selGroup?.group.id ?? "none"}`} className={cn("tab-panel flex-1 space-y-1 overflow-y-auto p-2", !fill && "min-h-0")}>
                  {lineScope !== "person" ? (
                    /* Widened past the drill: the deals themselves, no names.
                       Group needs a group picked; the period does not. */
                    lineScope === "group" && !selGroup ? (
                      <p className="px-2 py-3 text-[12px] text-text-secondary">
                        Pick a group in box 2 to see the deals behind it.
                      </p>
                    ) : (
                      lineItems(
                        lineScope === "period"
                          ? null
                          : new Set(
                              selGroup
                                ? selGroup.members.map((n) => n.toLowerCase())
                                : []
                            ),
                        false
                      )
                    )
                  ) : !selGroup ? (
                    <p className="px-2 py-3 text-[12px] text-text-secondary">
                      Pick a group in box 2 and its people line up here for the
                      same period.
                    </p>
                  ) : (
                    groupPeople.map((p) => (
                      p.verified === 0 && p.awaiting === 0 ? (
                      <Fragment key={p.name}>
                      {/* Same one-border container as the group rows — a real
                          border, since ring-inset is painted under the white
                          panel (Anir, Aug 16: "fix the container"). */}
                      <div
                        className={cn(
                          "overflow-hidden rounded-lg border",
                          openPeople.has(p.name)
                            ? "border-blue-primary/40"
                            : "border-transparent"
                        )}
                      >
                      <button
                        type="button"
                        aria-expanded={openPeople.has(p.name)}
                        onClick={(e) => togglePerson(p.name)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-colors",
                          openPeople.has(p.name)
                            ? "bg-[rgba(0,113,227,0.08)]"
                            : "rounded-lg hover:bg-surface"
                        )}
                      >
                        <Avatar name={p.name} className="h-6 w-6 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1 text-[11.5px] font-medium leading-tight text-text-primary">
                          {p.name}
                        </span>
                        <b className="shrink-0 text-right text-[11.5px] tnum text-text-tertiary">
                          {fmtAmount(goal.unit, 0)}
                        </b>
                        <ChevronDown
                          size={13}
                          strokeWidth={2.4}
                          aria-hidden="true"
                          className={cn(
                            "shrink-0 text-text-tertiary transition-transform",
                            openPeople.has(p.name) && "rotate-180 text-blue-primary"
                          )}
                        />
                      </button>
                      {openPeople.has(p.name) && (
                        <div className="tab-panel border-t border-border-light bg-white px-1 py-1">
                          {lineItems(
                            new Set([p.name.trim().toLowerCase()]),
                            true
                          )}
                        </div>
                      )}
                      </div>
                      </Fragment>
                      ) : (
                      <Fragment key={p.name}>
                      <div
                        className={cn(
                          "overflow-hidden rounded-lg border",
                          openPeople.has(p.name)
                            ? "border-blue-primary/40"
                            : "border-transparent"
                        )}
                      >
                      {/* THE CARD IS FOR THE CLOSED ROW ONLY — the same rule
                          the period and group rows already follow (Anir,
                          Aug 16: "It shouldn't show me the popup... Because I
                          already have it exposed. look what u did on the other
                          2"). Open, every figure it holds is on screen
                          underneath, so the card was covering the thing you
                          had just asked to see. */}
                      <ConditionalHover
                        on={!openPeople.has(p.name)}
                        side="left"
                        content={
                          <PaceTimeline
                            title={`${p.name} · ${row?.label ?? ""}`}
                            verified={p.verified}
                            awaiting={p.awaiting}
                            sentBack={p.sentBack}
                            target={yearTarget}
                            expectedPct={yearElapsed(goal.year) * 100}
                            expected={pacing.expected}
                                expectedDueLabel={pacing.dueLabel}
                                onSetSchedule={onSetSchedule}
                            unit={goal.unit}
                          />
                        }
                      >
                      <button
                        type="button"
                        aria-expanded={openPeople.has(p.name)}
                        onClick={(e) => togglePerson(p.name)}
                        onMouseEnter={() => onLinkHover?.(true)}
                        onMouseLeave={() => onLinkHover?.(false)}
                        className={cn(
                          "flex w-full cursor-pointer flex-col gap-1.5 px-2.5 py-2 text-left transition-all",
                          openPeople.has(p.name)
                            ? "bg-[rgba(0,113,227,0.08)]"
                            : "rounded-lg hover:bg-surface",
                          !openPeople.has(p.name) &&
                            lit &&
                            "rounded-lg bg-blue-light/50 ring-1 ring-inset ring-blue-primary/30"
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
                        <RowTotals unit={goal.unit} verified={p.verified} />
                        </span>
                        {/* Same as the group rows: full width underneath, and
                            only when there is something to draw. Open, the bar
                            becomes the BREAKDOWN — one coloured segment per
                            deal, matching the dots on the rows below (Anir,
                            Aug 16: "on the progress bar, show this, this,
                            this, and then color-code it, and then the line
                            items for each below"). Waiting segments stay
                            faded, same as everywhere. */}
                        {(p.verified > 0 || p.awaiting > 0) &&
                          (openPeople.has(p.name) ? (
                            <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                              {inBarOrder(
                                entriesFor(new Set([p.name.trim().toLowerCase()]))
                              ).map((a) => (
                                <span
                                  key={a.id}
                                  className={cn(
                                    "block h-full",
                                    entryStatus(a) !== "verified" && "unverified-fill",
                                    lit && "bar-lit"
                                  )}
                                  style={{
                                    width: `${Math.min(100, (a.amount / maxP) * 100)}%`,
                                    background:
                                      entryStatus(a) === "verified"
                                        ? entryColor(a)
                                        : undefined,
                                    ["--fill" as string]: entryColor(a),
                                    ["--bar-glow" as string]: entryColor(a),
                                    ["--bar-glow" as string]: entryColor(a),
                                  }}
                                />
                              ))}
                            </span>
                          ) : (
                          <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                            <span
                              className={cn("block h-full", lit && "bar-lit")}
                              style={{
                                width: `${Math.min(100, (p.verified / maxP) * 100)}%`,
                                background: ENTRY_COLOR.verified,
                                ["--bar-glow" as string]: "rgba(22,163,74,0.75)",
                              }}
                            />
                            <span
                              className={cn("unverified-fill block h-full", lit && "bar-lit")}
                              style={{
                                width: `${Math.min(100, (p.awaiting / maxP) * 100)}%`,
                                ["--fill" as string]:
                                  p.sentBack > 0
                                    ? ENTRY_COLOR.sent_back
                                    : ENTRY_COLOR.reported,
                                ["--bar-glow" as string]: p.sentBack > 0
                                    ? ENTRY_COLOR.sent_back
                                    : ENTRY_COLOR.reported,
                              }}
                            />
                          </span>
                          ))}
                      </button>
                      </ConditionalHover>
                      {openPeople.has(p.name) && (
                        <div className="tab-panel border-t border-border-light bg-white px-1 py-1">
                          {lineItems(
                            new Set([p.name.trim().toLowerCase()]),
                            true
                          )}
                        </div>
                      )}
                      </div>
                      </Fragment>
                      )
                    ))
                  )}
                </div>
              </div>
            </div>

            {!fill && (
              /* THE EDGE IS THE HANDLE (Anir, Aug 19: "I didn't want there to
                 be a separate line. I just wanted the line to be the bottom
                 edge. There shouldn't be any unnecessary space there"). It is
                 absolutely placed over the row's bottom border, so it costs
                 no layout height at all and the grab area still spans the
                 full width. Double-click puts the height back. */
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Drag to resize these three boxes"
                title="Drag to resize · double-click to reset"
                onPointerDown={onRailDrag}
                onDoubleClick={() => setRailHeight(RAIL_DEFAULT)}
                className="group/rail absolute inset-x-0 -bottom-1.5 z-10 h-3 cursor-ns-resize"
              >
                <span
                  className={cn(
                    "absolute left-1/2 top-1/2 h-1 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity",
                    dragging
                      ? "bg-blue-primary opacity-100"
                      : "bg-blue-subtle opacity-0 group-hover/rail:opacity-100"
                  )}
                />
              </div>
            )}
            </div>
          );
        })()}
      </Card>

      {/* No "Open the full goal page" link here (Anir, Aug 14: "we don't need
          this"). The way out has not gone anywhere: the goal NAME at the top
          of the row is still a link to /performance/goal/[id] on every tab, so
          the expansion does not need to repeat it at the bottom. */}

      {/* Same dialog the verification queue uses — one copy, so the two can
          never drift apart again. */}
      {!embedded && reviewId && (() => {
        const entry = state.actuals.find((x) => x.id === reviewId);
        if (!entry) return null;
        return (
          <ClaimReviewDialog
            entry={entry}
            state={state}
            run={runOrPost}
            busy={false}
            onClose={() => setReviewId(null)}
          />
        );
      })()}

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
                    {ci >= 0 && (() => {
                      // Same rule as the cards above: the mark belongs to the
                      // goal, not to its place in the list.
                      const cm = componentMeta(components[ci]);
                      const color = cm?.color ?? typeMeta(components[ci].type).color;
                      return (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: `${color}1A`, color }}
                        >
                          {cm ? `${cm.icon} ` : ""}
                          {components[ci].name.replace("Booked ", "")}
                        </span>
                      );
                    })()}
                    <b className="text-[12.5px] tnum">
                      {fmtAmount(goal.unit, a.amount)}
                    </b>
                    <span className="text-[10.5px] text-text-tertiary tnum">
                      {a.date}
                    </span>
                    {/* REVIEW, THEN DECIDE — never a one-click lock (Anir,
                        Aug 16: "at the bottom where it auto-verified it. It
                        didn't even ask me. It didn't open up any pop-up").
                        This rail still had the original instant Verify button
                        and bypassed the Review dialog the queue has used since
                        this morning, so a stray click locked money. */}
                    {amHead && canVerify(a.person) && (
                      <button
                        type="button"
                        onClick={() => setReviewId(a.id)}
                        className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(0,113,227,0.28)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue-primary transition-all hover:bg-blue-light active:scale-[0.97]"
                      >
                        <Eye size={12.5} strokeWidth={2.4} /> Review
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
                <Avatar
                  name={a.person}
                  className="h-[18px] w-[18px] shrink-0 text-[8px]"
                />
                <b>{a.person}</b> · {fmtAmount(goal.unit, a.amount)}
                {a.customer ? ` · ${a.customer}` : ""}. Verified by
                {a.verifiedBy ? (
                  <span className="inline-flex items-center gap-1">
                    <Avatar
                      name={a.verifiedBy}
                      className="h-[18px] w-[18px] shrink-0 text-[8px]"
                    />
                    {a.verifiedBy}
                  </span>
                ) : (
                  " the group owner"
                )}
                , locked
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
