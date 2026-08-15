"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ChevronDown,
  Crown,
  ClipboardList,
  Gauge,
  HelpCircle,
  LayoutGrid,
  Pencil,
  Plus,
  Table2,
  Trash2,
  UsersRound,
  X,
  Maximize2,
  CircleUserRound,
  UserRoundPlus,
} from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import { useToast } from "@/components/ui/Toast";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { DonutChart, DonutLegend } from "@/components/charts/Charts";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  hasActuals,
  knownPeople,
  parseAmountInput,
  type GoalMeasure,
  type GoalUnit,
  type PerformanceState,
  type PrimaryGoal,
  type Subgoal,
} from "@/lib/performanceShared";
import {
  PersonSelect,
  TrackSwitch,
  TypeChip,
  TypeIconTile,
  UnitChip,
  typeMeta,
  VerifiedPill,
  RoleChip,
} from "./bits";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { PeopleTab } from "./PeopleTab";
import { GroupPerformanceTab } from "./GroupPerformanceTab";

/**
 * THE PERFORMANCE MANAGEMENT MODULE (Suren, Aug 11 — voice notes +
 * goals.xlsx). Three rooms:
 *
 * - Goal Master: the master list, "entered in one place, not hard-coded" —
 *   goal types, primary goals, subgoals with owners and per-person targets,
 *   and the tracking switch that puts a goal on the org plan.
 * - Org performance: only the tracked primary goals — target / actual / met /
 *   % met / verified — expanding to subgoals and the people inside them.
 * - People & groups: user groups, and each person's goals one by one.
 *
 * Round three of his "you won't get it the first time": every edit inside
 * the goal popup happens INLINE (accordion rows, no popup-on-popup), person
 * pickers show real headshots, and a "How this works" explainer lives in the
 * header. Saves QUEUE instead of silently dropping while one is in flight.
 */

const TABS = ["org", "groups", "people"] as const;
const MASTER_VIEWS = ["cards", "table"] as const;

/** A piece of Goal Master UI state that survives leaving the page: filters
 *  and collapsed sections come back exactly as you left them (Anir, Aug 13:
 *  "whatever I last had on the gold master page... that should save"). */
function useStickyValue<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* first visit or bad JSON — keep the default */
    }
  }, [key]);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* private mode */
        }
        return resolved;
      });
    },
    [key]
  );
  return [value, set];
}
type Tab = (typeof TABS)[number];

const SPLIT_COLORS = ["#0071E3", "#6D28D9", "#0F766E", "#B4318F", "#C2410C", "#0EA5E9"];
// A sane window: last year through three years out. Nobody plans 2126.
const YEAR_CHOICES = Array.from({ length: 5 }, (_, i) =>
  String(new Date().getFullYear() - 1 + i)
);

export type RunOp = (
  body: Record<string, unknown>,
  ok?: string,
  /** Applied to local state IMMEDIATELY, before the server confirms — for
   *  toggles that must feel instant. On failure the state re-syncs. */
  optimistic?: (prev: PerformanceState) => PerformanceState
) => Promise<boolean>;

const ROOMS: Record<
  Tab,
  { label: string; icon: typeof Gauge; color: string; subtitle: string }
> = {
  org: {
    label: "Org performance",
    icon: Gauge,
    color: "#0071E3",
    subtitle:
      "The goals being tracked this year: target, actual, met, % met and verified, from the company down to every person.",
  },
  groups: {
    label: "Group performance",
    icon: UsersRound,
    color: "#0F766E",
    subtitle:
      "Every group added up from its members' goals — open one to see the people inside and their numbers.",
  },
  people: {
    label: "People performance",
    icon: CircleUserRound,
    color: "#B4318F",
    subtitle:
      "You land on your own goals. Search a name to see anyone you're allowed to see.",
  },
};

export function PerformanceModule({
  initial,
  live,
  meName,
  isManager,
  memberNames,
  memberRoles,
}: {
  initial: PerformanceState;
  live: boolean;
  meName: string;
  /** Admins and editors run the whole plan; everyone else is scoped
   *  (Suren, Aug 12: org head / group owner / individual). */
  isManager: boolean;
  /** Real workspace accounts — the only names suggested in live mode. */
  memberNames: string[];
  /** Name → workspace role, so a person reads as a person rather than a bare
   *  string (Anir, Aug 15: "it should show a role"). */
  memberRoles?: Record<string, string>;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<PerformanceState>(initial);
  const [tab, chooseTab] = useStoredView<Tab>(
    "freyr.performance.tab",
    "org",
    TABS
  );
  const [busy, setBusy] = useState(false);
  // Which rooms this person gets: org for managers, groups when you head
  // one, and everyone gets their own performance plus the Goal Master.
  const iHeadAGroup = state.groups.some(
    (g) => g.head.trim().toLowerCase() === meName.trim().toLowerCase()
  );
  const visibleTabs: Tab[] = isManager
    ? [...TABS]
    : iHeadAGroup
      ? ["groups", "people"]
      : ["people"];
  useEffect(() => {
    if (!visibleTabs.includes(tab)) chooseTab(visibleTabs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isManager, iHeadAGroup]);
  const [howOpen, setHowOpen] = useState(false);

  /**
   * Saves QUEUE rather than drop. The old `if (busy) return` guard meant a
   * second toggle clicked during a save silently did nothing — which read as
   * the UI "untoggling" (Anir). Each call chains onto the previous one, so
   * every click applies, in order.
   */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(0);

  const doRun = async (
    body: Record<string, unknown>,
    ok?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      if (data.state) setState(data.state);
      if (ok) toast(ok, "success");
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't save.", "error");
      return false;
    }
  };

  const run: RunOp = (body, ok, optimistic) => {
    if (optimistic) setState(optimistic);
    pendingRef.current += 1;
    setBusy(true);
    const next = queueRef.current.then(async () => {
      const okRes = await doRun(body, ok);
      if (!okRes && optimistic) {
        // The hopeful flip was wrong — pull the server's truth back.
        try {
          const res = await fetch("/api/performance");
          const data = await res.json();
          if (data.state) setState(data.state);
        } catch {
          /* next successful op will resync */
        }
      }
      return okRes;
    });
    queueRef.current = next.catch(() => {});
    next.finally(() => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) setBusy(false);
    });
    return next;
  };

  // ------------------------------------------------------------- modals
  const [goalModal, setGoalModal] = useState<{ editing: PrimaryGoal | null } | null>(null);
  const [subModal, setSubModal] = useState<{
    goal: PrimaryGoal;
    editing: Subgoal | null;
  } | null>(null);
  // GOAL MASTER SITS INSIDE EVERY ROOM (Suren, Aug 12: "when all three of
  // them, Goal Master should be there — what goal has been assigned to him,
  // and anybody can pick more goals for them"). The strip flips the room
  // between its numbers and the master list, scoped to who you may assign.
  const [masterFor, setMasterFor] = useState<Tab | null>(null);
  const showMaster = masterFor === tab;
  const [logOpen, setLogOpen] = useState(false);
  /** Prefill for the Log-an-actual popup when opened from a person's own
   *  goal row (Anir, Aug 12: "I can't edit this because it's me — if I'm
   *  signed in I should be able to"). */
  const [logPrefill, setLogPrefill] = useState<{
    goalId: string;
    subgoalId: string | null;
    person: string;
  } | null>(null);

  const people = useMemo(() => {
    if (live && memberNames.length > 0) {
      return [...new Set([...memberNames, ...knownPeople(state, meName)])].sort(
        (a, b) => a.localeCompare(b)
      );
    }
    return knownPeople(state, meName);
  }, [state, meName, live, memberNames]);

  // Who a goal can be assigned to from the Goal Master: managers pick anyone;
  // a group head picks their people; an individual picks themself.
  const assignablePeople = useMemo(() => {
    if (isManager) return people;
    const set = new Set<string>([meName]);
    for (const g of state.groups) {
      if (g.head.trim().toLowerCase() === meName.trim().toLowerCase()) {
        if (g.head.trim()) set.add(g.head.trim());
        for (const m of g.members) if (m.trim()) set.add(m.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, meName, state.groups, live, memberNames]);

  const room = ROOMS[tab];

  return (
    <div>
      {/* The title just says where you are; the tab bar below does the moving,
          so the heading no longer hides the other destinations behind it. */}
      <div className="rise-in relative z-40 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* THE SELECTOR IS THE TITLE. It used to be a heading that named the
              room and a tab bar UNDER it naming the same room again, so the
              page said "Org performance" twice and put the control below the
              label it duplicated (Anir, Aug 14: "you don't even need to say
              org performance twice because it's already on the selector").
              The tabs sit where the title was and carry the name themselves;
              the h1 stays for screen readers and the document outline. */}
          <div className="relative">
            <h1 className="sr-only">
              {showMaster ? "Goal Master" : room.label}
            </h1>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-surface p-1">
              {visibleTabs.map((key) => {
                const r = ROOMS[key];
                const Icon = r.icon;
                const active = !showMaster && key === tab;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      chooseTab(key);
                      setMasterFor(null);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold tracking-[-0.01em] transition-all",
                      active
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <Icon
                      size={16}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={active ? { color: r.color } : undefined}
                    />
                    {r.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={showMaster}
                onClick={() => setMasterFor(tab)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold tracking-[-0.01em] transition-all",
                  showMaster
                    ? "bg-white text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <ClipboardList
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={showMaster ? { color: "#6D28D9" } : undefined}
                />
                Goal Master
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
            >
              <HelpCircle size={13} strokeWidth={2.2} />
              How this works
            </button>
            {!live && (
              <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
                Sample data — switch to Real mode to work with the live plan
              </span>
            )}
          </div>
        </div>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-relaxed text-text-secondary">
          {room.subtitle}
        </p>
      </div>

      <div key={`${tab}-${showMaster ? "master" : "numbers"}`} className="tab-panel">
        {showMaster ? (
          <MasterTab
            state={state}
            live={live}
            run={run}
            busy={busy}
            suggestions={people}
            assignablePeople={assignablePeople}
            memberRoles={memberRoles}
            isManager={isManager}
            onNewGoal={() => setGoalModal({ editing: null })}
            onEditGoal={(g) => setGoalModal({ editing: g })}
          />
        ) : tab === "org" ? (
          <OrgPerformanceTab
            state={state}
            meName={meName}
            live={live}
            run={run}
            onLogActual={() => setLogOpen(true)}
            onGoToMaster={() => setMasterFor(tab)}
            onEditGoal={(g) => setGoalModal({ editing: g })}
            onEditSubgoal={(g, s) => setSubModal({ goal: g, editing: s })}
          />
        ) : tab === "groups" ? (
          <GroupPerformanceTab
            state={state}
            meName={meName}
            live={live}
            run={run}
            onLogActual={() => setLogOpen(true)}
            onEditGoal={(g) => setGoalModal({ editing: g })}
            onEditSubgoal={(g, s) => setSubModal({ goal: g, editing: s })}
          />
        ) : (
          <PeopleTab
            state={state}
            live={live}
            run={run}
            meName={meName}
            memberRoles={memberRoles}
            onLogActual={() => setLogOpen(true)}
            onEditGoal={(g) => setGoalModal({ editing: g })}
            onEditSubgoal={(g, s) => setSubModal({ goal: g, editing: s })}
          />
        )}
      </div>

      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
      <Modal
        tall
        open={goalModal !== null}
        onClose={() => setGoalModal(null)}
        title={
          goalModal?.editing ? `Edit goal — ${goalModal.editing.name}` : "New goal"
        }
        size="wide"
      >
        {goalModal && (
          <GoalEditorFields
            key={goalModal.editing?.id ?? "new"}
            editing={goalModal.editing}
            types={state.types}
            run={run}
            busy={busy}
            onDone={() => setGoalModal(null)}
          />
        )}
      </Modal>
      {subModal && (
        <Modal
          open
          onClose={() => setSubModal(null)}
          title={
            subModal.editing
              ? `Edit subgoal — ${subModal.editing.name}`
              : `Add a subgoal to ${subModal.goal.name}`
          }
          size="workflow"
          tall
        >
          <SubgoalEditorFields
            key={subModal.editing?.id ?? "new"}
            goal={subModal.goal}
            editing={subModal.editing}
            suggestions={people}
            run={run}
            busy={busy}
            onDone={() => setSubModal(null)}
          />
        </Modal>
      )}
      <LogActualModal
        open={logOpen}
        state={state}
        meName={meName}
        suggestions={people}
        initial={logPrefill}
        onClose={() => {
          setLogOpen(false);
          setLogPrefill(null);
        }}
        run={run}
        busy={busy}
      />
    </div>
  );
}

/* ------------------------------------------------------- how this works */

function HowItWorksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const steps = [
    {
      title: "Every goal lives on the Goal Master",
      body: "The one master list — goal types, goals, and their subgoals (like Booked Revenue split into Growth Accounts / Focused Account AMR / Focused Account EUA).",
    },
    {
      title: "Flip Tracking ON to put a goal on the plan",
      body: "Tracking means the goal is counted and shown on Org performance. Goals with Tracking off just wait on the master list.",
    },
    {
      title: "Set the targets",
      body: "The big annual number on the goal, split across its subgoals, split again across the people responsible. Goal owners are responsible for a subgoal overall.",
    },
    {
      title: "Log actuals — the numbers roll up on their own",
      body: "Anyone logs what was achieved with “Log an actual”. Each person's count becomes their group's count, and the groups add up to the organization. That's the only math.",
    },
    {
      title: "Verified is leadership's stamp",
      body: "Every goal, subgoal and person carries a manual Verified yes/no. Numbers count either way — verified just says leadership has confirmed them.",
    },
  ];
  return (
    <Modal open={open} onClose={onClose} title="How Performance works">
      <div className="space-y-2.5">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border border-border-light bg-white p-3.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(0,113,227,0.10)] text-[13px] font-bold text-blue-primary tnum">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-text-primary">
                {s.title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-text-secondary">
                {s.body}
              </span>
            </span>
          </div>
        ))}
        <p className="rounded-lg bg-surface px-3.5 py-2.5 text-[11.5px] leading-relaxed text-text-secondary">
          Lagging / On track / Ahead compare what&apos;s achieved against where
          the calendar says you should be by today — the small dark tick on
          every bar.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Goal Master */

function MasterTab({
  state,
  live,
  run,
  busy,
  suggestions,
  memberRoles,
  assignablePeople,
  isManager,
  onNewGoal,
  onEditGoal,
}: {
  memberRoles?: Record<string, string>;
  assignablePeople: string[];
  isManager: boolean;
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  busy: boolean;
  suggestions: string[];
  onNewGoal: () => void;
  /** Opens the goal-edit dialog (owned by the module root). */
  onEditGoal: (goal: PrimaryGoal) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useStickyValue("freyr.performance.master.f.type", "all");
  const [trackFilter, setTrackFilter] = useStickyValue("freyr.performance.master.f.track", "all");
  const [unitFilter, setUnitFilter] = useStickyValue("freyr.performance.master.f.unit", "all");
  const [yearFilter, setYearFilter] = useStickyValue("freyr.performance.master.f.year", "all");
  const [view, chooseView] = useStoredView<(typeof MASTER_VIEWS)[number]>(
    "freyr.performance.master.view",
    "cards",
    MASTER_VIEWS
  );
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!viewOpen) return;
    const close = (e: MouseEvent) => {
      if (!viewRef.current?.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [viewOpen]);
  const [openId, setOpenId] = useState<string | null>(null);
  const openGoal = state.goals.find((g) => g.id === openId) ?? null;
  /** Table rows expand IN PLACE like a dropdown — no popup over the list
   *  (Anir, Aug 12: "these should be drop-downs instead of pop-ups"). The
   *  cards view keeps the popup, where an inline expansion has no room. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** Categories the reader has folded shut in the Goal Master table. Local to
   *  the session and to this browser: hiding Financial to get to Lead
   *  Generation is a way of looking, not a change to anybody's plan. */
  const [shutList, setShutList] = useStickyValue<string[]>(
    "freyr.performance.master.shut",
    []
  );
  const shutTypes = useMemo(() => new Set(shutList), [shutList]);

  const filtered = state.goals.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (trackFilter === "tracking" && !g.pickedForOrg) return false;
    if (trackFilter === "master" && g.pickedForOrg) return false;
    if (unitFilter !== "all" && g.unit !== unitFilter) return false;
    if (yearFilter !== "all" && String(g.year) !== yearFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      g.subgoals.some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.owners.some((o) => o.toLowerCase().includes(q))
      )
    );
  });

  const byType = state.types
    .map((t) => ({ type: t, goals: filtered.filter((g) => g.type === t) }))
    .filter((s) => s.goals.length > 0);
  const strayTypes = [
    ...new Set(
      filtered.map((g) => g.type).filter((t) => !state.types.includes(t))
    ),
  ].map((t) => ({ type: t, goals: filtered.filter((g) => g.type === t) }));

  return (
    <div>

      <SearchPriority query={query} className="flex flex-wrap items-center gap-2">
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search goals, subgoals, owners…"
          ariaLabel="Search the goal master"
          grow
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <ColorSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Goal type"
            dense
            minWidth={180}
            options={[
              { value: "all", label: "All goal types", color: "#0071E3" },
              ...state.types.map((t) => ({
                value: t,
                label: t,
                color: typeMeta(t).color,
                icon: typeMeta(t).icon,
              })),
            ]}
          />
          <ColorSelect
            value={trackFilter}
            onChange={setTrackFilter}
            ariaLabel="Tracking"
            dense
            minWidth={150}
            options={[
              { value: "all", label: "Tracked + master", color: "#0071E3" },
              { value: "tracking", label: "Tracking", color: "#16A34A" },
              { value: "master", label: "Not tracked", color: "#8AB4E8" },
            ]}
          />
          <ColorSelect
            value={unitFilter}
            onChange={setUnitFilter}
            ariaLabel="Counted in"
            dense
            minWidth={140}
            options={[
              { value: "all", label: "All units", color: "#0071E3" },
              { value: "currency", label: "Money ($)", color: "#0F766E" },
              { value: "count", label: "Count (#)", color: "#0071E3" },
              { value: "percent", label: "Percentage (%)", color: "#6D28D9" },
            ]}
          />
          <ColorSelect
            value={yearFilter}
            onChange={setYearFilter}
            ariaLabel="Year"
            dense
            minWidth={120}
            options={[
              { value: "all", label: "All years", color: "#0071E3" },
              ...[...new Set(state.goals.map((g) => g.year))]
                .sort((x, y) => y - x)
                .map((y) => ({
                  value: String(y),
                  label: String(y),
                  color: "#6D28D9",
                })),
            ]}
          />
          <span className="relative" ref={viewRef}>
            <button
              type="button"
              onClick={() => setViewOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={viewOpen}
              aria-label="Layout"
              title="Layout"
              className="flex h-[36px] cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 transition-colors hover:border-blue-subtle"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(0,113,227,0.10)] text-blue-primary">
                {view === "cards" ? (
                  <LayoutGrid size={14} strokeWidth={2.2} />
                ) : (
                  <Table2 size={14} strokeWidth={2.2} />
                )}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={2.2}
                className={cn(
                  "text-text-tertiary transition-transform",
                  viewOpen && "rotate-180 text-blue-primary"
                )}
              />
            </button>
            {viewOpen && (
              <span
                role="menu"
                className="menu-in absolute right-0 top-full z-50 mt-2 flex gap-1 rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
              >
                {MASTER_VIEWS.map((v) => {
                  const VIcon = v === "cards" ? LayoutGrid : Table2;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="menuitemradio"
                      aria-checked={view === v}
                      aria-label={v}
                      title={v}
                      onClick={() => {
                        chooseView(v);
                        setViewOpen(false);
                      }}
                      className={cn(
                        "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors",
                        view === v
                          ? "bg-[rgba(0,113,227,0.12)] text-blue-primary"
                          : "text-text-tertiary hover:bg-surface hover:text-text-primary"
                      )}
                    >
                      <VIcon size={16} strokeWidth={2.2} />
                    </button>
                  );
                })}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onNewGoal}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <Plus size={14} strokeWidth={2.4} /> New goal
          </button>
        </span>
      </SearchPriority>

      {state.goals.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={ClipboardList}
            title="Start the goal master"
            description="This is the one place every goal lives: its type, its subgoals, who owns them, and whether it's being tracked on the plan. Add the first goal to begin."
            action={
              <button
                type="button"
                onClick={onNewGoal}
                className="cursor-pointer rounded-full bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90"
              >
                Add the first goal
              </button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-xl bg-surface px-4 py-6 text-center text-[13px] text-text-secondary">
          Nothing matches those filters.
        </p>
      ) : null}

      {/* keyed on the layout so switching cards ⇄ table animates in */}
      <div key={view} className="tab-panel">
        {state.goals.length > 0 && filtered.length > 0 && view === "table" ? (
          /* SEPARATE TABLES, NOT ONE LONG ONE (Anir, Aug 13: "I told you it
             has to be kind of separate tables… This space in the middle should
             just be white. There shouldn't be another line there"). A gap row
             inside one table still sits between that table's own borders, so
             lines ran through the space however tall it got. Each category is
             its own card now; what lies between them is the page.

             The heading is also the control: click it and the category folds
             away ("If I just want to remove all the financial goals, I can
             just press the dropdown… if I wanted to skip to lead generation,
             it should let me do that"). A shared colgroup keeps every card's
             columns lined up, so they still read as one table. */
          <div className="mt-4 space-y-4">
            {[...byType, ...strayTypes]
              .filter(({ goals: groupGoals }) => groupGoals.length > 0)
              .map(({ type, goals: groupGoals }) => {
                const shut = shutTypes.has(type);
                return (
                  <Card key={type} className="overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() =>
                        setShutList((current) =>
                          current.includes(type)
                            ? current.filter((t) => t !== type)
                            : [...current, type]
                        )
                      }
                      aria-expanded={!shut}
                      className="flex w-full cursor-pointer items-center gap-2 bg-surface px-4 py-2.5 text-left transition-colors hover:bg-blue-light/30"
                    >
                      <ChevronDown
                        size={15}
                        strokeWidth={2.2}
                        className={cn(
                          "shrink-0 text-text-tertiary transition-transform duration-200",
                          shut && "-rotate-90"
                        )}
                      />
                      <TypeChip type={type} />
                      <span className="text-[11px] font-semibold text-text-tertiary tnum">
                        {groupGoals.length}{" "}
                        {groupGoals.length === 1 ? "goal" : "goals"}
                      </span>
                    </button>
                    {!shut && (
                      /* The reveal, not a teleport (Anir, Aug 13: "I want a
                         premium animation… Right now, it's just instant"). */
                      <div className="tab-panel overflow-x-auto border-t border-border-light">
                        <table className="w-full min-w-[780px] table-fixed">
                          <colgroup>
                            <col style={{ width: "34%" }} />
                            <col style={{ width: "13%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "6%" }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b border-border-light">
                              {["Goal", "Counted in", "Target", "Subgoals", "Owners", "Tracking"].map(
                                (h) => (
                                  <th
                                    key={h}
                                    className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                                  >
                                    {h}
                                  </th>
                                )
                              )}
                              <th aria-hidden />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-light">
                            {groupGoals.map((g) => {
                  const owners = [...new Set(g.subgoals.flatMap((s) => s.owners))];
                  return (
                    <Fragment key={g.id}>
                    <tr
                      onClick={() =>
                        setExpandedId(expandedId === g.id ? null : g.id)
                      }
                      className={cn(
                        "cursor-pointer transition-colors",
                        expandedId === g.id ? "bg-blue-light/40" : "hover:bg-surface"
                      )}
                    >
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-2.5">
                          <TypeIconTile type={g.type} className="h-8 w-8" />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-text-primary">
                              {g.name}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-text-tertiary tnum">
                              {g.year}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {/* Both chips stay INSIDE this fixed-width column —
                            nowrap made "latest value" bleed into the Target
                            cell and jam against "Set the target". */}
                        <span className="flex flex-wrap items-center gap-1.5">
                          <UnitChip unit={g.unit} />
                          {g.measure === "level" && (
                            <span className="whitespace-nowrap rounded-full bg-[rgba(109,40,217,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:#6D28D9]">
                              latest value
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-[13px] font-semibold text-text-primary tnum">
                        {g.target > 0 ? (
                          fmtAmount(g.unit, g.target)
                        ) : (
                          <span className="text-[11.5px] font-semibold text-blue-primary">
                            Set the target →
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-[12.5px] text-text-secondary tnum">
                        {g.subgoals.length}
                      </td>
                      <td className="px-4 py-4">
                        {owners.length > 0 ? (
                          <span className="flex -space-x-1.5">
                            {owners.slice(0, 4).map((o) => (
                              <Avatar
                                key={o}
                                name={o}
                                tooltip={"Goal owner: " + o}
                                className="h-6 w-6 border-2 border-white text-[9px]"
                              />
                            ))}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <PickedPill goal={g} live={live} run={run} />
                      </td>
                      <td className="w-16 py-4 pr-4">
                        <span className="flex items-center justify-end gap-1">
                          {/* the same goal, in the popup form instead of the
                              inline unfold (Anir, Aug 12: "add the option to
                              have it in a pop-up form if they want to") */}
                          <button
                            type="button"
                            title="Open in a popup"
                            aria-label={`Open ${g.name} in a popup`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(g.id);
                            }}
                            className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <Maximize2 size={13} strokeWidth={2.2} />
                          </button>
                          <ChevronDown
                            size={15}
                            strokeWidth={2.2}
                            className={cn(
                              "text-text-tertiary transition-transform",
                              expandedId === g.id && "rotate-180 text-blue-primary"
                            )}
                          />
                        </span>
                      </td>
                    </tr>
                    {expandedId === g.id && (
                      <tr className="!border-t-0 bg-white">
                        <td colSpan={7} className="px-4 pb-6 pt-2">
                          <div className="tab-panel pt-1">
                            <GoalPopupBody
                              hostedInPopup={false}
                              assignablePeople={assignablePeople}
                              memberRoles={memberRoles}
                              isManager={isManager}
                              key={g.id}
                              goal={g}
                              state={state}
                              live={live}
                              run={run}
                              busy={busy}
                              suggestions={suggestions}
                              onRemoved={() => setExpandedId(null)}
                              onEditGoal={() => onEditGoal(g)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        ) : (
          [...byType, ...strayTypes].map(({ type, goals }) => (
            <div key={type} className="mt-7">
              <div className="flex items-center gap-2">
                <TypeChip type={type} />
                <span className="text-[11px] font-semibold text-text-tertiary tnum">
                  {goals.length} {goals.length === 1 ? "goal" : "goals"}
                </span>
                <span className="ml-1 h-px min-w-4 flex-1 bg-border-light" aria-hidden />
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">
                {goals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    live={live}
                    run={run}
                    onOpen={() => setOpenId(g.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ------------------------------------------- goal detail popup */}
      {/* No `tall`: this one only reads out a goal, so the 640px floor left a
          band of empty white under the last row (Anir, Aug 14). */}
      <Modal
        open={openGoal !== null}
        onClose={() => setOpenId(null)}
        title={openGoal ? openGoal.name : ""}
        // 640px was cramped for a goal that carries subgoals, people and a
        // confirm (Anir, Aug 15: "make the entire pop-up bigger... why is it
        // so small"). 980 gives every row room and stops the unassign confirm
        // being pushed off the bottom edge.
        size="workflow"
      >
        {openGoal && (
          <GoalPopupBody
            hostedInPopup
            assignablePeople={assignablePeople}
            memberRoles={memberRoles}
            isManager={isManager}
            key={openGoal.id}
            goal={openGoal}
            state={state}
            live={live}
            run={run}
            busy={busy}
            suggestions={suggestions}
            onRemoved={() => setOpenId(null)}
            onEditGoal={() => openGoal && onEditGoal(openGoal)}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * Everything about one goal, edited IN PLACE — subgoals are accordion rows
 * that expand into their editor, and the goal's own details expand under the
 * header. No popup ever opens on top of this popup (Anir: "I don't want
 * another popup because then it ruins this popup").
 */
/** A small "are you sure" card that drops right under the delete button —
 *  the popup context confirms in place without taking over the header
 *  (Anir, Aug 12: "it should just show me underneath the delete button"). */
/** Attach the goal to one person, with an optional personal target. Group
 *  heads only see their own people in this list; individuals see themselves
 *  (Suren, Aug 12: "show only those people who are in his list"). */
function AssignPersonModal({
  open,
  inline,
  goal,
  options,
  roles,
  onClose,
  run,
  busy,
}: {
  open: boolean;
  /** Already inside a popup → unfold here instead of stacking a second one
   *  (Anir, Aug 12, twice: no popup on a popup, ever). */
  inline: boolean;
  goal: PrimaryGoal;
  options: string[];
  roles?: Record<string, string>;
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [person, setPerson] = useState("");
  const [target, setTarget] = useState("");
  const parsed = parseAmountInput(target);

  async function save() {
    const ok = await run(
      {
        op: "assign-goal",
        goalId: goal.id,
        person,
        ...(parsed !== null ? { target: parsed } : {}),
      },
      `${goal.name} assigned to ${person}`
    );
    if (ok) {
      setPerson("");
      setTarget("");
      onClose();
    }
  }

  const form = (
    <>
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        The goal lands on this person directly. Their logged numbers roll into
        their group and the organization automatically.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Person
            <InfoHint text={"Only people you're allowed to assign.\nManagers see everyone, a group owner sees their group."} />
          </label>
          <div className="mt-1">
            <PersonSelect
              value={person}
              onChange={setPerson}
              people={options}
              roles={roles}
              placeholder="Pick a person…"
            />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Personal target
            <InfoHint text="Optional. Their own slice of the goal. Type 250K, 1.5M or a plain number." />
          </label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={goal.unit === "currency" ? "e.g. 250K" : "e.g. 40"}
            className="mt-1 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end">
        <Button onClick={save} disabled={!person} loading={busy}>
          Assign goal
        </Button>
      </div>
    </>
  );

  if (inline) {
    if (!open) return null;
    return (
      <div className="tab-panel mt-2 overflow-hidden rounded-xl border border-blue-subtle bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-border-light bg-[rgba(0,113,227,0.04)] px-3.5 py-2.5">
          <span className="text-[12.5px] font-semibold text-text-primary">
            Assign {goal.name}
          </span>
          <button
            type="button"
            aria-label="Close the assign form"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
        <div className="p-3.5">{form}</div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign: ${goal.name}`}
      size="wide"
      tall
      stacked
    >
      {form}
    </Modal>
  );
}

function ConfirmUnder({
  question,
  actionLabel,
  onConfirm,
  onCancel,
}: {
  question: string;
  actionLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span
      className="step-in absolute right-0 top-full z-30 mt-1.5 block w-max max-w-[260px] rounded-xl border border-border-light bg-white p-2.5 text-left shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="block text-[12px] font-medium leading-snug text-text-secondary">
        {question}
      </span>
      <span className="mt-2 flex items-center justify-end gap-1.5">
        <span
          role="button"
          tabIndex={0}
          onClick={onCancel}
          className="cursor-pointer rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border-light"
        >
          Keep
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={onConfirm}
          className="cursor-pointer rounded-full bg-[color:#DC2626] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-all hover:opacity-90"
        >
          {actionLabel}
        </span>
      </span>
    </span>
  );
}

function GoalPopupBody({
  goal,
  state,
  live,
  run,
  busy,
  suggestions,
  onRemoved,
  onEditGoal,
  hostedInPopup,
  memberRoles,
  assignablePeople,
  isManager,
}: {
  goal: PrimaryGoal;
  memberRoles?: Record<string, string>;
  assignablePeople: string[];
  isManager: boolean;
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  busy: boolean;
  suggestions: string[];
  onRemoved: () => void;
  /** Edit opens the dedicated goal dialog — a form this size deserves its
   *  own popup, not an inline unfold (Anir, Aug 12: "when I press edit, I
   *  can definitely have a pop-up then"). */
  onEditGoal: () => void;
  /** Where this body lives decides how deletes confirm (Anir, Aug 12: cards
   *  view opens a popup, so confirm in place; the table expands on the page,
   *  so a proper popup is right there). */
  hostedInPopup: boolean;
}) {
  /** Two-step guard: no goal or subgoal disappears on a single click
   *  (Anir, Aug 12: "it didn't even ask me for a confirmation"). */
  const [confirmGoalRemove, setConfirmGoalRemove] = useState(false);
  const [confirmSubRemove, setConfirmSubRemove] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState<string | null>(null);
  /** Which subgoal row is expanded; "new" = the add-subgoal editor. */
  const [openSub, setOpenSub] = useState<string | null>(null);

  const splitSubs = goal.subgoals.filter((s) => s.target > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface)] p-3.5">
        <TypeIconTile type={goal.type} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-text-primary">
              {goal.name}
            </span>
            <UnitChip unit={goal.unit} />
            {goal.measure === "level" && (
              <span className="rounded-full bg-[rgba(109,40,217,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:#6D28D9]">
                latest value
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[12px] text-text-secondary tnum">
            {goal.year} · Target{" "}
            {goal.target > 0 ? fmtAmount(goal.unit, goal.target) : "not set yet"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <PickedPill goal={goal} live={live} run={run} />
          <InfoHint text={"Tracking means this goal is counted and shown on Org performance.\nNot tracked means it stays on the master list only."} />
          {live && (
            <button
              type="button"
              title="Edit the goal's details: name, type, year, target"
              onClick={onEditGoal}
              className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white hover:text-blue-primary"
            >
              <Pencil size={14} strokeWidth={2.2} />
            </button>
          )}
          {live && (
            <span className="relative">
              <button
                type="button"
                title="Remove this goal from the master"
                onClick={() => setConfirmGoalRemove(!confirmGoalRemove)}
                className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white hover:text-[color:#DC2626]"
              >
                <Trash2 size={14} strokeWidth={2.2} />
              </button>
              {confirmGoalRemove && hostedInPopup && (
                <ConfirmUnder
                  question="Remove this goal and its subgoals?"
                  actionLabel="Remove goal"
                  onConfirm={() => {
                    setConfirmGoalRemove(false);
                    void run(
                      { op: "remove-goal", goalId: goal.id },
                      goal.name + " removed from the master"
                    ).then((ok) => ok && onRemoved());
                  }}
                  onCancel={() => setConfirmGoalRemove(false)}
                />
              )}
            </span>
          )}
        </span>
      </div>

      {splitSubs.length >= 2 && (
        <div className="mt-3 rounded-xl border border-border-light bg-white p-3.5">
          <p className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            How the target splits
            <InfoHint text="Each subgoal's share of this goal's target." />
          </p>
          <div className="mx-auto mt-2 flex w-full max-w-[440px] items-center justify-center gap-6">
            <DonutChart
              size={104}
              thickness={12}
              syncId={"split-" + goal.id}
              centerLabel={fmtAmount(
                goal.unit,
                goal.subgoals.reduce((acc, s) => acc + s.target, 0)
              )}
              centerSub="across subgoals"
              segments={splitSubs.map((s, i) => ({
                label: s.name,
                color: SPLIT_COLORS[i % SPLIT_COLORS.length],
                value: s.target,
              }))}
            />
            <DonutLegend
              className="min-w-0 max-w-[240px] flex-1"
              syncId={"split-" + goal.id}
              format={goal.unit === "currency" ? "money" : "number"}
              items={splitSubs.map((s, i) => ({
                label: s.name,
                color: SPLIT_COLORS[i % SPLIT_COLORS.length],
                value: s.target,
              }))}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmGoalRemove && !hostedInPopup}
        onClose={() => setConfirmGoalRemove(false)}
        onConfirm={() => {
          setConfirmGoalRemove(false);
          void run(
            { op: "remove-goal", goalId: goal.id },
            goal.name + " removed from the master"
          ).then((ok) => ok && onRemoved());
        }}
        title="Remove this goal?"
        body={`${goal.name} and its subgoals come off the master, and Org performance stops counting it.`}
        confirmLabel="Remove goal"
      />
      <ConfirmDialog
        open={confirmSubRemove !== null && !hostedInPopup}
        onClose={() => setConfirmSubRemove(null)}
        onConfirm={() => {
          const id = confirmSubRemove;
          setConfirmSubRemove(null);
          if (!id) return;
          const name =
            goal.subgoals.find((x) => x.id === id)?.name ?? "Subgoal";
          void run(
            { op: "remove-subgoal", goalId: goal.id, subgoalId: id },
            name + " removed"
          ).then((ok) => ok && setOpenSub(null));
        }}
        title="Remove this subgoal?"
        body="Its owners, people and targets come off this goal."
        confirmLabel="Remove subgoal"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          Subgoals
          <InfoHint text={"A subgoal splits the goal across teams, like Growth Accounts vs Focused Account AMR.\nClick a row to open it and edit its target, owners and people right here."} />
        </p>
        {/* The add action lives WITH the section it adds to, not stranded at
            the bottom-left (Anir, Aug 12: "that's a bad place to put this
            button"). */}
        {live && (
          <button
            type="button"
            onClick={() => setOpenSub("new")}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-blue-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <Plus size={12} strokeWidth={2.4} /> Add subgoal
          </button>
        )}
      </div>
      {goal.subgoals.length === 0 && (
        <p className="mt-1.5 rounded-lg bg-surface px-4 py-4 text-center text-[12.5px] leading-relaxed text-text-secondary">
          No subgoals yet. Split this goal when different teams carry different
          pieces of it.
        </p>
      )}
      <div className="mt-1.5 space-y-2">
        {/* NO POPUP ON A POPUP (Anir, Aug 12: "when I click on subgoal it
            should not be a pop-up because it's already a pop-up"). Hosted in
            the goal popup, the new-subgoal form unfolds right here; expanded
            inline on the page, it gets its own dialog. */}
        {hostedInPopup ? (
          openSub === "new" && (
            <div className="tab-panel overflow-hidden rounded-xl border border-blue-subtle bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-border-light bg-[rgba(0,113,227,0.04)] px-3.5 py-2.5">
                <span className="text-[12.5px] font-semibold text-text-primary">
                  New subgoal
                </span>
                <button
                  type="button"
                  aria-label="Close the new subgoal form"
                  onClick={() => setOpenSub(null)}
                  className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              </div>
              <div className="p-3.5">
                <SubgoalEditorFields
                  key="new-inline"
                  goal={goal}
                  editing={null}
                  suggestions={suggestions}
                  run={run}
                  busy={busy}
                  onDone={() => setOpenSub(null)}
                />
              </div>
            </div>
          )
        ) : (
          <Modal
            open={openSub === "new"}
            onClose={() => setOpenSub(null)}
            title="New subgoal"
            size="wide"
            tall
            stacked
          >
            <SubgoalEditorFields
              key="new"
              goal={goal}
              editing={null}
              suggestions={suggestions}
              run={run}
              busy={busy}
              onDone={() => setOpenSub(null)}
            />
          </Modal>
        )}
        {goal.subgoals.map((s) => {
          const expanded = openSub === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                "overflow-hidden rounded-xl border transition-colors",
                expanded
                  ? "border-blue-subtle bg-white"
                  : "border-transparent bg-surface"
              )}
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpenSub(expanded ? null : s.id)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-blue-light/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-text-primary">
                    {s.name}
                  </span>
                  <span className="ml-2 text-[11px] text-text-tertiary tnum">
                    {s.target > 0 ? fmtAmount(goal.unit, s.target) : "no target"}{" "}
                    · {s.people.length}{" "}
                    {s.people.length === 1 ? "person" : "people"}
                  </span>
                </span>
                {s.owners.length > 0 && (
                  <span className="flex items-center gap-1">
                    {s.owners.slice(0, 3).map((o) => (
                      <Avatar
                        key={o}
                        name={o}
                        tooltip={"Goal owner: " + o}
                        className="h-5 w-5 text-[8px]"
                      />
                    ))}
                  </span>
                )}
                {live && expanded && (
                  <span
                    className="relative shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      title="Remove this subgoal"
                      aria-label={`Remove ${s.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmSubRemove(
                          confirmSubRemove === s.id ? null : s.id
                        );
                      }}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-[color:#DC2626]"
                    >
                      <Trash2 size={13} strokeWidth={2.2} />
                    </span>
                    {confirmSubRemove === s.id && hostedInPopup && (
                      <ConfirmUnder
                        question="Remove this subgoal?"
                        actionLabel="Remove"
                        onConfirm={() => {
                          setConfirmSubRemove(null);
                          void run(
                            {
                              op: "remove-subgoal",
                              goalId: goal.id,
                              subgoalId: s.id,
                            },
                            s.name + " removed"
                          ).then((ok) => ok && setOpenSub(null));
                        }}
                        onCancel={() => setConfirmSubRemove(null)}
                      />
                    )}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  strokeWidth={2.2}
                  className={cn(
                    "shrink-0 text-text-tertiary transition-transform",
                    expanded && "rotate-180 text-blue-primary"
                  )}
                />
              </button>
              {expanded && (
                <div className="tab-panel bg-[rgba(0,113,227,0.02)] p-3.5">
                  {live ? (
                    <>
                      <SubgoalEditorFields
                        key={s.id}
                        goal={goal}
                        editing={s}
                        suggestions={suggestions}
                        run={run}
                        busy={busy}
                        onDone={() => setOpenSub(null)}
                      />
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      {s.people.length === 0 ? (
                        <p className="text-[12px] text-text-tertiary">
                          Nobody assigned yet.
                        </p>
                      ) : (
                        s.people.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <Avatar name={p.name} className="h-6 w-6 text-[9px]" />
                            <span className="flex-1 text-[12.5px] font-medium text-text-primary">
                              {p.name}
                            </span>
                            <span className="text-[12px] text-text-secondary tnum">
                              {p.target > 0
                                ? fmtAmount(goal.unit, p.target)
                                : "no target"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* ---------------- person-level attaches (Suren, Aug 12: "add to the
          org or add to a particular person" — departments never hold goals,
          their people do) ---------------- */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          Assigned people
          <InfoHint text={"This goal attached straight to a person from the Goal Master.\nTheir numbers roll into their group and the organization: a department is just its people added up."} />
        </p>
        {/* A PLUS, NOT A SENTENCE (Anir, Aug 15: "it can just be a blue and
            white plus sign on the right side of the assigned people text").
            The words only earn their space in the empty state, where they
            tell you what the section is for. */}
        {live && (goal.assignments ?? []).length > 0 && (
          <Tooltip label="Assign this goal to a person">
            <button
              type="button"
              aria-label="Assign this goal to a person"
              onClick={() => setAssignOpen(true)}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-primary text-white transition-all hover:opacity-90 active:scale-[0.94]"
            >
              <Plus size={14} strokeWidth={2.6} />
            </button>
          </Tooltip>
        )}
      </div>
      {(goal.assignments ?? []).length === 0 ? (
        <div className="mt-1.5 flex flex-col items-center gap-2.5 rounded-lg bg-surface px-4 py-5 text-center">
          <p className="text-[12.5px] text-text-secondary">
            Nobody carries this goal individually yet.
          </p>
          {live && (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="flex cursor-pointer items-center gap-1 rounded-full bg-blue-light px-3.5 py-1.5 text-[12px] font-semibold text-blue-primary transition-all hover:bg-blue-primary hover:text-white active:scale-[0.97]"
            >
              <UserRoundPlus size={12} strokeWidth={2.4} /> Assign to a person
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {(goal.assignments ?? []).map((a) => (
            <div
              key={a.person}
              className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2"
            >
              <Avatar name={a.person} className="h-7 w-7 text-[10px]" />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-text-primary">
                  {a.person}
                </span>
                {/* Who they are, not just what they are called (Anir, Aug 15). */}
                {memberRoles?.[a.person.trim()] && (
                  <RoleChip role={memberRoles[a.person.trim()]} />
                )}
              </span>
              <span className="shrink-0 text-[11.5px] text-text-tertiary tnum">
                {a.target > 0
                  ? `Target ${fmtAmount(goal.unit, a.target)}`
                  : "No personal target"}
              </span>
              <VerifiedPill
                verified={a.verified}
                size="sm"
                // Same rule as the performance tables: with nothing logged
                // against this person there is nothing to sign off, so the
                // pill reads as status and does not click.
                onToggle={
                  live &&
                  (hasActuals(state.actuals, {
                    goalId: goal.id,
                    subgoalId: null,
                    person: a.person,
                  }) ||
                    a.verified)
                    ? () =>
                        run(
                          {
                            op: "set-verified",
                            goalId: goal.id,
                            person: a.person,
                            verified: !a.verified,
                          },
                          a.verified
                            ? `${a.person} marked not verified`
                            : `${a.person} verified`
                        )
                    : undefined
                }
              />
              {live && (
                <span className="relative shrink-0">
                  <button
                    type="button"
                    title={`Unassign ${a.person}`}
                    aria-label={`Unassign ${a.person}`}
                    onClick={() =>
                      setConfirmUnassign(
                        confirmUnassign === a.person ? null : a.person
                      )
                    }
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-[color:#DC2626]"
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                  {confirmUnassign === a.person && (
                    <ConfirmUnder
                      question={`Take this goal off ${a.person}?`}
                      actionLabel="Unassign"
                      onConfirm={() => {
                        setConfirmUnassign(null);
                        void run(
                          { op: "unassign-goal", goalId: goal.id, person: a.person },
                          `${a.person} unassigned`
                        );
                      }}
                      onCancel={() => setConfirmUnassign(null)}
                    />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <AssignPersonModal
        open={assignOpen}
        inline={hostedInPopup}
        goal={goal}
        options={assignablePeople.filter(
          (name) => !(goal.assignments ?? []).some((a) => a.person === name)
        )}
        roles={memberRoles}
        onClose={() => setAssignOpen(false)}
        run={run}
        busy={busy}
      />

      {!live && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
          <span className="text-[11.5px] text-text-tertiary">
            Sample data — switch to Real mode to change the plan.
          </span>
        </div>
      )}
    </div>
  );
}

/** The tracking switch, shared by cards, table and popup. */
function PickedPill({
  goal,
  live,
  run,
}: {
  goal: PrimaryGoal;
  live: boolean;
  run: RunOp;
  stop?: boolean;
}) {
  return (
    <TrackSwitch
      on={goal.pickedForOrg}
      withLabel
      disabled={!live}
      onToggle={
        live
          ? () =>
              run(
                {
                  op: "update-goal",
                  goalId: goal.id,
                  pickedForOrg: !goal.pickedForOrg,
                },
                goal.pickedForOrg
                  ? goal.name + " is no longer tracked"
                  : goal.name + " is now being tracked",
                (prev) => ({
                  ...prev,
                  goals: prev.goals.map((g) =>
                    g.id === goal.id
                      ? { ...g, pickedForOrg: !goal.pickedForOrg }
                      : g
                  ),
                })
              )
          : undefined
      }
    />
  );
}

/** One goal on the master — an Offerings-style card. Cards WITH subgoals do
 *  the scale-up hover that reveals them (Anir's ask); cards without stay
 *  plain — expanding into an empty panel read as broken. */
function GoalCard({
  goal,
  live,
  run,
  onOpen,
}: {
  goal: PrimaryGoal;
  live: boolean;
  run: RunOp;
  onOpen: () => void;
}) {
  const owners = [...new Set(goal.subgoals.flatMap((s) => s.owners))];
  const face = (
    <div>
      <span className="flex w-full items-start justify-between gap-2">
        <TypeIconTile type={goal.type} />
        <PickedPill goal={goal} live={live} run={run} />
      </span>
      <span className="mt-2.5 block text-[13.5px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-blue-primary">
        {goal.name}
      </span>
      {(goal.componentGoalIds?.length ?? 0) > 0 && (
        <span className="mt-1.5 inline-flex rounded-full bg-[rgba(109,40,217,0.10)] px-2 py-0.5 text-[10px] font-bold text-[color:#6D28D9]">
          ⧉ adds up from {goal.componentGoalIds?.length} goals — nobody enters here
        </span>
      )}
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <UnitChip unit={goal.unit} />
        {goal.measure === "level" && (
          <span className="rounded-full bg-[rgba(109,40,217,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:#6D28D9]">
            latest value
          </span>
        )}
        <span className="text-[10.5px] text-text-tertiary tnum">
          {goal.year}
        </span>
      </span>
      <span className="mt-3 flex w-full items-center justify-between gap-2 border-t border-border-light pt-2.5">
        {goal.target > 0 ? (
          <span className="text-[11.5px] text-text-tertiary tnum">
            Target{" "}
            <span className="font-bold text-text-primary">
              {fmtAmount(goal.unit, goal.target)}
            </span>
          </span>
        ) : (
          <span className="text-[11.5px] font-semibold text-blue-primary">
            Set the target →
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {owners.length > 0 && (
            <span className="flex -space-x-1.5">
              {owners.slice(0, 3).map((o) => (
                <Avatar
                  key={o}
                  name={o}
                  tooltip={"Goal owner: " + o}
                  className="h-5 w-5 border-2 border-white text-[8px]"
                />
              ))}
            </span>
          )}
          <span className="text-[10.5px] text-text-tertiary tnum">
            {goal.subgoals.length}{" "}
            {goal.subgoals.length === 1 ? "subgoal" : "subgoals"}
          </span>
        </span>
      </span>
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/35"
    >
      {goal.subgoals.length === 0 ? (
        <div className="min-h-full rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]">
          {face}
        </div>
      ) : (
        <HoverExpandCard
          summary={face}
          extra={
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                Subgoals
              </p>
              <div className="mt-1.5 space-y-1.5">
                {goal.subgoals.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 whitespace-normal text-[12px] font-medium leading-snug text-text-primary">
                      {sub.name}
                    </span>
                    {sub.owners.length > 0 && (
                      <span className="flex -space-x-1">
                        {sub.owners.slice(0, 2).map((o) => (
                          <Avatar
                            key={o}
                            name={o}
                            tooltip={"Goal owner: " + o}
                            className="h-4 w-4 border border-white text-[7px]"
                          />
                        ))}
                      </span>
                    )}
                    <span className="shrink-0 text-[10.5px] text-text-tertiary tnum">
                      {sub.target > 0
                        ? fmtAmount(goal.unit, sub.target)
                        : "no target"}
                      {" · "}
                      {sub.people.length}{" "}
                      {sub.people.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ goal editor form */

/**
 * The goal's own facts — used by the New goal popup AND inline inside the
 * goal popup (pencil). One form, no nested popups.
 */
function GoalEditorFields({
  editing,
  types,
  run,
  busy,
  onDone,
}: {
  editing: PrimaryGoal | null;
  types: string[];
  run: RunOp;
  busy: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? types[0] ?? "");
  const [newType, setNewType] = useState("");
  const [unit, setUnit] = useState<GoalUnit>(editing?.unit ?? "count");
  const [measure, setMeasure] = useState<GoalMeasure>(editing?.measure ?? "total");
  const [year, setYear] = useState(
    String(editing?.year ?? new Date().getFullYear())
  );
  const [target, setTarget] = useState(
    editing && editing.target > 0 ? String(editing.target) : ""
  );
  const [picked, setPicked] = useState(editing?.pickedForOrg ?? true);

  const parsedTarget = parseAmountInput(target);
  const effType = type === "__new" ? newType.trim() : type;

  async function save() {
    const body = {
      name,
      type: effType,
      unit,
      measure,
      year: Number(year) || new Date().getFullYear(),
      target: parsedTarget ?? 0,
      pickedForOrg: picked,
    };
    const ok = editing
      ? await run(
          { op: "update-goal", goalId: editing.id, ...body },
          name.trim() + " updated"
        )
      : await run({ op: "add-goal", ...body }, name.trim() + " added to the master");
    if (ok) onDone();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] font-semibold text-text-primary">
          Goal name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Booked Revenue (Contract Value Signed)"
          className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="text-[12px] font-semibold text-text-primary">
            Goal type
          </label>
          <div className="mt-1">
            <ColorSelect
              value={type}
              onChange={setType}
              ariaLabel="Goal type"
              minWidth={220}
              options={[
                ...types.map((t) => ({
                  value: t,
                  label: t,
                  color: typeMeta(t).color,
                  icon: typeMeta(t).icon,
                })),
                { value: "__new", label: "New type…", color: "#6D28D9", icon: Plus },
              ]}
            />
          </div>
        </div>
        {type === "__new" && (
          <div className="min-w-[180px] flex-1">
            <label className="text-[12px] font-semibold text-text-primary">
              New type name
            </label>
            <input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="e.g. Customer Success"
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Counted in
          </label>
          <div className="mt-1">
            <ColorSelect
              value={unit}
              onChange={(v) => setUnit(v as GoalUnit)}
              ariaLabel="Counted in"
              minWidth={150}
              options={[
                { value: "currency", label: "Money ($)", color: "#0F766E" },
                { value: "count", label: "Count (#)", color: "#0071E3" },
                { value: "percent", label: "Percentage (%)", color: "#6D28D9" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            How it adds up
          </label>
          <div className="mt-1">
            <ColorSelect
              value={measure}
              onChange={(v) => setMeasure(v as GoalMeasure)}
              ariaLabel="How it adds up"
              minWidth={180}
              options={[
                { value: "total", label: "Running total", color: "#0071E3" },
                { value: "level", label: "Latest value (ratio)", color: "#6D28D9" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Year
          </label>
          <div className="mt-1">
            <ColorSelect
              value={year}
              onChange={setYear}
              ariaLabel="Year"
              minWidth={110}
              options={YEAR_CHOICES.map((y) => ({
                value: y,
                label: y,
                color: "#6D28D9",
              }))}
            />
          </div>
        </div>
      </div>
      {measure === "level" && (
        <p className="rounded-lg bg-[rgba(109,40,217,0.06)] px-3 py-2 text-[11.5px] leading-relaxed text-[color:#6D28D9]">
          A latest-value goal (like Win/Loss % or Average Deal Size) shows the
          most recent number reported instead of adding entries up.
        </p>
      )}
      <div>
        <label className="text-[12px] font-semibold text-text-primary">
          Annual target{" "}
          <span className="font-normal text-text-tertiary">
            (the big number from the top — leave empty to set later)
          </span>
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13.5px] font-semibold text-text-tertiary">
            {unit === "currency" ? "$" : unit === "percent" ? "%" : "#"}
          </span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={unit === "currency" ? "e.g. 100M" : unit === "percent" ? "e.g. 45" : "e.g. 1,200"}
            className="h-[38px] w-full rounded-lg border border-border-light bg-white pl-8 pr-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
          />
        </div>
        {target.trim() !== "" && (
          <p className="mt-1 text-[11px] text-text-tertiary tnum">
            {parsedTarget !== null
              ? `= ${fmtAmount(unit, parsedTarget)}`
              : "That doesn't read as a number yet."}
          </p>
        )}
      </div>
      <div
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
          picked
            ? "border-blue-subtle bg-[rgba(0,113,227,0.05)]"
            : "border-border-light bg-white"
        )}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-text-primary">
            Track on Org performance
            <InfoHint text={"Tracking means this goal is counted and shown on Org performance with its target and actuals.\nOff means it stays on the master list only."} />
          </span>
          <span className="block text-[11px] text-text-tertiary">
            {picked
              ? "Counted and shown with its target and actuals."
              : "Stays on the master list without being tracked yet."}
          </span>
        </span>
        <TrackSwitch on={picked} withLabel onToggle={() => setPicked((p) => !p)} />
      </div>
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={busy || !name.trim() || (type === "__new" && !newType.trim())}
          onClick={save}
          className="cursor-pointer rounded-full bg-blue-primary px-6 py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Add to the goal master"}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------- subgoal editor form */

/**
 * A subgoal's whole world — name, target, goal owners, people with their own
 * targets. Used inline inside the goal popup's accordions AND as the body of
 * the standalone subgoal popup opened from Org performance.
 */
function SubgoalEditorFields({
  goal,
  editing,
  suggestions,
  run,
  busy,
  onDone,
}: {
  goal: PrimaryGoal;
  editing: Subgoal | null;
  suggestions: string[];
  run: RunOp;
  busy: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [target, setTarget] = useState(
    editing && editing.target > 0 ? String(editing.target) : ""
  );
  const [owners, setOwners] = useState<string[]>(editing?.owners ?? []);
  /** Which row is asking "are you sure" — "owner:Name" or "person:Name". */
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [rows, setRows] = useState<{ name: string; target: string }[]>(
    editing?.people.map((p) => ({
      name: p.name,
      target: p.target > 0 ? String(p.target) : "",
    })) ?? []
  );

  const parsedTarget = parseAmountInput(target);
  const peopleSum = rows.reduce(
    (acc, r) => acc + (parseAmountInput(r.target) ?? 0),
    0
  );

  function addOwner(o: string) {
    const clean = o.trim();
    if (!clean || owners.includes(clean)) return;
    setOwners([...owners, clean]);
  }

  function addPerson(p: string) {
    const clean = p.trim();
    if (!clean || rows.some((r) => r.name === clean)) return;
    setRows([...rows, { name: clean, target: "" }]);
  }

  async function save() {
    const people = rows.map((r) => ({
      name: r.name,
      target: parseAmountInput(r.target) ?? 0,
    }));
    const body = {
      goalId: goal.id,
      name,
      target: parsedTarget ?? 0,
      owners,
      people,
    };
    const ok = editing
      ? await run(
          { op: "update-subgoal", subgoalId: editing.id, ...body },
          name.trim() + " updated"
        )
      : await run({ op: "add-subgoal", ...body }, name.trim() + " added");
    if (ok) onDone();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-[12px] font-semibold text-text-primary">
            Subgoal name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Growth Accounts"
            className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
          />
        </div>
        <div className="w-[170px]">
          <label className="text-[12px] font-semibold text-text-primary">
            Subgoal target
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13.5px] font-semibold text-text-tertiary">
              {goal.unit === "currency" ? "$" : goal.unit === "percent" ? "%" : "#"}
            </span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={goal.unit === "currency" ? "e.g. 40M" : "e.g. 700"}
              className="h-[38px] w-full rounded-lg border border-border-light bg-white pl-8 pr-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
            />
          </div>
          {/* Say what was read back, and say so when nothing was. A field that
              quietly ignores what you typed saves a target you never set
              (Anir, Aug 15: "just make sure it works either way"). */}
          {target.trim() !== "" &&
            (parsedTarget !== null ? (
              <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
                = {fmtAmount(goal.unit, parsedTarget)}
              </p>
            ) : (
              // One line, and it stays one line (Anir, Aug 15). The field is
              // 170px, so the message has to fit that, not explain itself.
              <p className="mt-1 whitespace-nowrap text-[10.5px] text-error">
                {goal.unit === "currency"
                  ? "Numbers only, e.g. 40m"
                  : "Numbers only, e.g. 900"}
              </p>
            ))}
        </div>
      </div>

      {/* ONE PER LINE, FULL WIDTH (Anir, Aug 12: "let's have the goal owners
          and the people on the sub-goal on two different lines so this
          doesn't happen, so that the name of the person always shows up in
          full"). Side by side, each card was half a dialog wide and ate names
          like "Anant Purohit" into "Anant Pur…". A person's own name is the
          last thing that should be abbreviated. */}
      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-xl border border-border-light bg-[var(--surface)] p-3">
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Goal owners
            <Crown
              size={13}
              strokeWidth={2.2}
              className="text-[color:#7C3AED]"
              aria-label="Owners wear the crown"
            />
            <InfoHint text={"Responsible for this subgoal overall. The crown marks them wherever they appear.\nAn owner can also appear in the people list with a personal target of their own."} />
          </label>
          <div className="mt-2 space-y-1.5">
            <PersonSelect
              value=""
              onChange={addOwner}
              people={suggestions.filter((s) => !owners.includes(s))}
              placeholder="Add an owner…"
            />
            {owners.map((o) => (
              <div key={o} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-1.5">
                  <Avatar name={o} className="h-5 w-5 text-[8px]" />
                  <span className="text-[12.5px] font-medium text-text-primary">
                    {o}
                  </span>
                  <Crown
                    size={10}
                    strokeWidth={2.6}
                    aria-label="Goal owner"
                    className="shrink-0 text-[color:#7C3AED]"
                  />
                </span>
                {/* AN X, AND IT ASKS (Anir, Aug 15: "can you make it just an
                    X instead of a delete icon... obviously it should ask me
                    for confirmation... it didn't ask me for any confirmation,
                    so that's a problem"). The confirm replaces the row's own
                    controls rather than opening a dialog: this is already
                    inside a popup, and no popup ever opens on a popup. */}
                {confirmDrop === `owner:${o}` ? (
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => {
                        setOwners(owners.filter((x) => x !== o));
                        setConfirmDrop(null);
                      }}
                      className="cursor-pointer rounded-md bg-[color:#B02020] px-2 py-1 font-semibold text-white transition-colors hover:bg-[color:#8F1A1A]"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDrop(null)}
                      className="cursor-pointer rounded-md border border-border-light bg-white px-2 py-1 font-semibold text-text-secondary transition-colors hover:text-text-primary"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={"Remove " + o}
                    title={`Remove ${o} as a goal owner`}
                    onClick={() => setConfirmDrop(`owner:${o}`)}
                    className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border-light bg-[var(--surface)] p-3">
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            People on this subgoal
            <InfoHint text="Each person carries their own target. Their logged numbers roll up into this subgoal." />
          </label>
          <div className="mt-2 space-y-1.5">
            <PersonSelect
              value=""
              onChange={addPerson}
              people={suggestions.filter((s) => !rows.some((r) => r.name === s))}
              placeholder="Add a person…"
            />
            {rows.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-1.5">
                  <Avatar name={r.name} className="h-5 w-5 text-[8px]" />
                  <span className="text-[12.5px] font-medium text-text-primary">
                    {r.name}
                  </span>
                  {owners.includes(r.name) && (
                    <Crown
                      size={10}
                      strokeWidth={2.6}
                      aria-label="Also a goal owner"
                      className="shrink-0 text-[color:#7C3AED]"
                    />
                  )}
                </span>
                <input
                  value={r.target}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, xi) =>
                        xi === i ? { ...x, target: e.target.value } : x
                      )
                    )
                  }
                  placeholder="Target"
                  aria-label={"Target for " + r.name}
                  className="h-[32px] w-[110px] rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none tnum focus:border-blue-subtle"
                />
                {confirmDrop === `person:${r.name}` ? (
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => {
                        setRows(rows.filter((_, xi) => xi !== i));
                        setConfirmDrop(null);
                      }}
                      className="cursor-pointer rounded-md bg-[color:#B02020] px-2 py-1 font-semibold text-white transition-colors hover:bg-[color:#8F1A1A]"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDrop(null)}
                      className="cursor-pointer rounded-md border border-border-light bg-white px-2 py-1 font-semibold text-text-secondary transition-colors hover:text-text-primary"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={"Remove " + r.name}
                    title={`Take ${r.name} off this subgoal`}
                    onClick={() => setConfirmDrop(`person:${r.name}`)}
                    className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {parsedTarget !== null && parsedTarget > 0 && rows.length > 0 && (
            <p
              className={cn(
                "mt-2 text-[11px] tnum",
                Math.abs(peopleSum - parsedTarget) < 0.005 * parsedTarget
                  ? "text-[color:#16A34A]"
                  : "text-text-tertiary"
              )}
            >
              People&apos;s targets add to {fmtAmount(goal.unit, peopleSum)} of
              the {fmtAmount(goal.unit, parsedTarget)} subgoal target.
            </p>
          )}
        </section>
      </div>

      {/* Primary action alone, bottom right, on its own footer line. No
          Cancel: the X (and the accordion header) close without saving. */}
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={save}
          className="cursor-pointer rounded-full bg-blue-primary px-5 py-2 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Add subgoal"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- log actual modal */

/** A real account, with the engagements recorded against it. The deal list
 *  comes from the same offering_usage the heat map and the account page read,
 *  so a claim points at the engagement everyone else can already see. */
type AccountOption = {
  id: string;
  name: string;
  deals: { id: string; label: string }[];
};

/** A file on its way to storage: percentage while it travels, then done, or
 *  the reason it stopped. */
type EvidenceUpload = {
  name: string;
  percent: number;
  status: "uploading" | "done" | "failed";
  error?: string;
};

function LogActualModal({
  open,
  state,
  meName,
  suggestions,
  initial,
  onClose,
  run,
  busy,
}: {
  open: boolean;
  state: PerformanceState;
  meName: string;
  suggestions: string[];
  initial?: { goalId: string; subgoalId: string | null; person: string } | null;
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [goalId, setGoalId] = useState("");
  const [subgoalId, setSubgoalId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState("");
  /** Real accounts, so the customer on a claim is the same string every time
   *  and a number can be traced back to the company that paid it. */
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [dealId, setDealId] = useState("");
  const [evidence, setEvidence] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  /** One row per file being sent, so a big contract shows a moving bar rather
   *  than a frozen "Uploading…" with nothing behind it. */
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  // Real accounts, loaded when the form opens. A failure here costs nothing:
  // the field stays typeable, it just stops suggesting.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const [res, offRes] = await Promise.all([
          fetch("/api/customers", { cache: "no-store" }),
          fetch("/api/offerings", { cache: "no-store" }),
        ]);
        const data = await res.json();
        const offJson = await offRes.json().catch(() => ({}));
        const offeringName = new Map<string, string>(
          (offJson.offerings ?? []).map((o: { id: string; offering_name?: string }) => [
            o.id,
            o.offering_name || o.id,
          ])
        );
        if (!alive || !Array.isArray(data.customers)) return;
        setAccounts(
          data.customers.map(
            (c: {
              id: string;
              company_name?: string;
              offering_usage?: {
                offering_id?: string;
                engagement_versions?: {
                  id?: string;
                  activity?: string;
                  status?: string;
                  dollar_value?: number;
                  linked?: boolean;
                }[];
              }[];
            }) => ({
              id: c.id,
              name: c.company_name || "",
              deals: (c.offering_usage ?? []).flatMap((u) =>
                (u.engagement_versions ?? [])
                  .filter((e) => e.linked !== false && e.id)
                  .map((e) => ({
                    id: String(e.id),
                    label: [
                      u.offering_id ? offeringName.get(u.offering_id) : null,
                      e.activity
                        ? e.activity.charAt(0).toUpperCase() + e.activity.slice(1)
                        : null,
                      e.dollar_value
                        ? fmtAmount("currency", e.dollar_value)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))
              ),
            })
          ).filter((a: AccountOption) => a.name)
        );
      } catch {
        /* suggestions are a convenience, never a gate */
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Opened from a person's goal row: land with goal, subgoal and person
  // already chosen so the only thing left to type is the number.
  useEffect(() => {
    if (!open || !initial) return;
    setGoalId(initial.goalId);
    setSubgoalId(initial.subgoalId ?? "");
    setPerson(initial.person);
  }, [open, initial]);

  const goal = state.goals.find((g) => g.id === goalId) ?? null;
  // Composite goals (Booked Revenue) are never logged directly — the person
  // picks WHICH booking it was and the entry lands on that component.
  const components = (goal?.componentGoalIds ?? [])
    .map((id) => state.goals.find((g) => g.id === id))
    .filter((g): g is PrimaryGoal => Boolean(g));
  const composite = components.length > 0;
  const effectiveGoal = composite
    ? (components.find((c) => c.id === componentId) ?? null)
    : goal;
  const sub = effectiveGoal?.subgoals.find((s) => s.id === subgoalId) ?? null;
  // Which unit the Amount field wears. On a composite, effectiveGoal is null
  // until a component is picked, and falling through to the count default put
  // a "#" and "e.g. 12" on a goal whose target is $900K (Anir, Aug 14). A
  // composite always shares its components' unit, so read it off the parent.
  const unit = effectiveGoal?.unit ?? goal?.unit ?? null;
  const parsed = parseAmountInput(amount);

  /**
   * THE FALLBACK, and today it is the one that actually runs.
   *
   * FreyaFusion's bucket has no CORS policy, so a browser's preflight is
   * refused and the direct PUT never sends a byte — while the identical
   * signed PUT succeeds from a server. Sales materials hit this on Aug 13 and
   * solved it the same way: reroute through our own server, which writes into
   * the SAME bucket server-side. The rep just sees the upload finish.
   *
   * XHR rather than fetch so this path shows a real percentage too, instead of
   * a bar that only appears on the route we cannot use yet.
   */
  function uploadThroughServer(file: File): Promise<{ name: string; url: string }> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/performance/evidence");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) =>
            prev.map((u) =>
              u.name === file.name && u.status === "uploading"
                ? { ...u, percent }
                : u
            )
          );
        }
      };
      xhr.onload = () => {
        let data: { name?: string; url?: string; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* a proxy or the framework answered with HTML */
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          resolve({ name: data.name || file.name, url: data.url });
        } else {
          reject(
            new Error(
              data.error ||
                (xhr.status === 413 || xhr.status === 0
                  ? "That file is too large to attach here yet."
                  : "Upload failed")
            )
          );
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    });
  }

  /** Straight to storage with a real percentage, exactly like a sales
   *  material. Resolves false when the browser is refused, which is what
   *  happens today. */
  function putWithProgress(
    url: string,
    headers: Record<string, string>,
    file: File
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers || {}))
        xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) =>
            prev.map((u) =>
              u.name === file.name && u.status === "uploading"
                ? { ...u, percent }
                : u
            )
          );
        }
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(file);
    });
  }

  /**
   * ATTACHING EVIDENCE NEVER LEAVES THE POPUP (Anir, Aug 15: "don't take me
   * off the pop-up"). Progress shows per file and the finished ones stay
   * listed; a failure writes its reason under the row instead of throwing a
   * browser alert over the whole form.
   *
   * The file goes browser → storage, so there is NO SIZE LIMIT. The old code
   * posted it through our own server, which is why anything from 10 MB up came
   * back as "Attach a file" on a file that was very much attached.
   */
  async function attachEvidence(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, 5 - evidence.length);
    setUploading(true);
    setUploads((prev) => [
      ...prev,
      ...picked.map((f) => ({
        name: f.name,
        percent: 0,
        status: "uploading" as const,
      })),
    ]);
    const mark = (name: string, patch: Partial<EvidenceUpload>) =>
      setUploads((prev) =>
        prev.map((u) => (u.name === name ? { ...u, ...patch } : u))
      );

    for (const file of picked) {
      try {
        const signed = await fetch("/api/performance/evidence/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
          }),
        });
        const grant = await signed.json().catch(() => ({}));

        // No Docs credentials on this deployment: straight to the proxy.
        if (signed.status === 503) {
          const stored = await uploadThroughServer(file);
          setEvidence((prev) => [...prev, stored]);
          mark(file.name, { percent: 100, status: "done" });
          continue;
        }
        if (!signed.ok || !grant.uploadUrl) {
          throw new Error(grant.error ?? "Could not start that upload");
        }

        const sent = await putWithProgress(
          grant.uploadUrl,
          grant.uploadHeaders,
          file
        );
        if (!sent) {
          // The browser was refused (no CORS on the bucket). Reroute rather
          // than telling the rep to try again at something that cannot work.
          mark(file.name, { percent: 0, status: "uploading" });
          const stored = await uploadThroughServer(file);
          setEvidence((prev) => [...prev, stored]);
          mark(file.name, { percent: 100, status: "done" });
          continue;
        }

        const done = await fetch("/api/performance/evidence/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: grant.path, name: file.name }),
        });
        const data = await done.json().catch(() => ({}));
        if (!done.ok) throw new Error(data.error ?? "Upload failed");
        setEvidence((prev) => [...prev, { name: data.name, url: data.url }]);
        mark(file.name, { percent: 100, status: "done" });
      } catch (error) {
        mark(file.name, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    setUploading(false);
    if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    // Clear the finished rows once they have been seen; failures stay until
    // the person retries or closes the form.
    window.setTimeout(
      () => setUploads((prev) => prev.filter((u) => u.status !== "done")),
      2500
    );
  }

  /** Accounts matching what has been typed. Empty query shows the list, so
   *  clicking the field offers the accounts rather than demanding a guess. */
  const customerMatches = useMemo(() => {
    const q = customer.trim().toLowerCase();
    const hit = q
      ? accounts.filter((a) => a.name.toLowerCase().includes(q))
      : accounts;
    return hit.slice(0, 8);
  }, [accounts, customer]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === customerId) ?? null,
    [accounts, customerId]
  );

  const personOptions = useMemo(() => {
    const set = new Set<string>();
    if (sub) {
      for (const p of sub.people) set.add(p.name);
      for (const o of sub.owners) set.add(o);
    } else if (effectiveGoal) {
      for (const s of effectiveGoal.subgoals) {
        for (const p of s.people) set.add(p.name);
      }
      for (const a of effectiveGoal.assignments ?? []) set.add(a.person);
    }
    if (set.size === 0) for (const s of suggestions) set.add(s);
    set.add(meName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [effectiveGoal, sub, suggestions, meName]);

  async function save() {
    const ok = await run(
      {
        op: "log-actual",
        goalId: composite ? componentId : goalId,
        subgoalId: subgoalId || null,
        person,
        amount: parsed ?? NaN,
        date: date || undefined,
        note: note || undefined,
        customer: customer || undefined,
        // The account and the engagement behind the words, so this number can
        // be traced back rather than matched on spelling.
        customerId: customerId || undefined,
        dealId: dealId || undefined,
        dealLabel:
          (dealId &&
            selectedAccount?.deals.find((d) => d.id === dealId)?.label) ||
          undefined,
        evidence: evidence.length ? evidence : undefined,
      },
      "Sent for verification. It counts once the group owner locks it"
    );
    if (ok) {
      setAmount("");
      setNote("");
      setCustomer("");
      setEvidence([]);
      setComponentId("");
      onClose();
    }
  }

  return (
    <Modal tall open={open} onClose={onClose} title="Log an actual" size="wide">
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        One number at a time: who achieved what, on which goal. Person rolls
        into group, group rolls into the organization, automatically.
      </p>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
              Goal
              <InfoHint text="Which goal this number counts toward. Pick the subgoal too when it belongs to one." />
            </label>
            <div className="mt-1">
              <ColorSelect
                value={goalId}
                onChange={(v) => {
                  // Re-picking the SAME goal must not wipe the rest of the
                  // form (Anir: "it shouldn't untoggle the first dropdown").
                  if (v !== goalId) {
                    setSubgoalId("");
                    setPerson("");
                  }
                  setGoalId(v);
                }}
                ariaLabel="Goal"
                // Wide on purpose: this one sits alone in a roomy modal cell,
                // and the longest goal name is "Booked Revenue (Contract Value
                // Signed) · adds up". Set here, at the one call site that needs
                // it, rather than teaching every select in the app to grow.
                minWidth={430}
                options={[
                  { value: "", label: "Pick a goal…", color: "#8E98A8" },
                  ...state.goals.map((g) => ({
                    value: g.id,
                    label:
                      (g.componentGoalIds?.length ?? 0) > 0
                        ? `${g.name} · adds up`
                        : g.name,
                    color: typeMeta(g.type).color,
                    icon: typeMeta(g.type).icon,
                  })),
                ]}
              />
            </div>
          </div>
          {effectiveGoal && effectiveGoal.subgoals.length > 0 ? (
            <div>
              <label className="text-[12px] font-semibold text-text-primary">
                Subgoal
              </label>
              <div className="mt-1">
                <ColorSelect
                  value={subgoalId}
                  onChange={(v) => {
                    if (v !== subgoalId) setPerson("");
                    setSubgoalId(v);
                  }}
                  ariaLabel="Subgoal"
                  minWidth={280}
                  options={[
                    { value: "", label: "Pick a subgoal…", color: "#8E98A8" },
                    ...effectiveGoal.subgoals.map((s) => ({
                      value: s.id,
                      label: s.name,
                      color: typeMeta(effectiveGoal.type).color,
                    })),
                  ]}
                />
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>
        {composite && (
          /* A DROPDOWN, like every other field in this form (Anir, Aug 15:
             "there should be another dropdown that asks me this instead of
             whatever you have right now"). This was a purple banner that
             explained the parent goal is only ever a sum, with chips under
             it. The label now just says what to do, and the explanation
             moved into the hint where the rest of this form keeps its
             explanations. */
          <div>
            <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
              Which booking?
              <InfoHint
                text={`${goal?.name ?? "This goal"} is only ever the sum of the bookings underneath it, so the number belongs to one of them.`}
              />
            </label>
            <div className="mt-1">
              <ColorSelect
                value={componentId}
                onChange={(v) => {
                  if (v !== componentId) setSubgoalId("");
                  setComponentId(v);
                }}
                ariaLabel="Which booking"
                minWidth={430}
                options={[
                  { value: "", label: "Pick which booking…", color: "#8E98A8" },
                  ...components.map((c) => ({
                    value: c.id,
                    label: c.name,
                    color: typeMeta(c.type).color,
                    icon: typeMeta(c.type).icon,
                  })),
                ]}
              />
            </div>
          </div>
        )}
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Person
            <InfoHint text={"Whose achievement this is, one person per entry, so nothing is ever counted twice.\nA shared win is logged once per person, each with their real share."} />
          </label>
          <div className="mt-1">
            <PersonSelect
              value={person}
              onChange={setPerson}
              people={personOptions}
              placeholder="Whose number is it?"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
              Amount
              <InfoHint text="How much this single achievement is worth, in this goal&apos;s unit. It adds onto everything logged before it." />
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13.5px] font-semibold text-text-tertiary">
                {unit === "currency" ? "$" : unit === "percent" ? "%" : "#"}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  unit === "currency"
                    ? "e.g. 250K"
                    : unit === "percent"
                      ? "e.g. 44"
                      : "e.g. 12"
                }
                className="h-[40px] w-full rounded-lg border border-border-light bg-white pl-8 pr-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
              />
            </div>
            {amount.trim() !== "" && effectiveGoal && (
              <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
                {parsed !== null
                  ? `= ${fmtAmount(effectiveGoal.unit, parsed)}`
                  : "That doesn't read as a number yet."}
              </p>
            )}
          </div>
          <div>
            <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
              Date
              <InfoHint text="When it actually happened. It lands in that month on the progress charts." />
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-[40px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[13px] outline-none tnum focus:border-blue-subtle"
            />
          </div>
        </div>
        {effectiveGoal?.measure === "level" && (
          <p className="rounded-lg bg-[rgba(109,40,217,0.06)] px-3 py-2 text-[11.5px] leading-relaxed text-[color:#6D28D9]">
            This goal tracks the latest value, so this entry becomes the current
            number rather than adding to a total.
          </p>
        )}
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Customer
            <InfoHint
              text={
                "Which account this number came from. Pick the real account so the money can be traced back to it.\nTyping something not on the list is allowed for a win that has no account record yet."
              }
            />
          </label>
          {/* PICK THE ACCOUNT, DO NOT DESCRIBE IT (Anir, Aug 15: "it should be
              like a dropdown where they choose and they search up the
              customer"). Free text meant one account arrived as "Takeda",
              "Takeda Pharma" and "takeda - renewal", so no report could ever
              group by customer. Still an input, so a brand-new logo that has
              no account record yet can be typed. */}
          <div className="relative mt-1">
            <input
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                // Typed by hand: this is no longer one of our accounts.
                setCustomerId("");
                setDealId("");
                setCustomerOpen(true);
              }}
              onFocus={() => setCustomerOpen(true)}
              onBlur={() => window.setTimeout(() => setCustomerOpen(false), 150)}
              placeholder="Search your accounts…"
              className="h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
            />
            {customerOpen && customerMatches.length > 0 && (
              <div className="menu-in absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
                {customerMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCustomer(c.name);
                      setCustomerId(c.id);
                      setDealId("");
                      setCustomerOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface"
                  >
                    <CompanyLogo name={c.name} className="h-5 w-5 shrink-0" />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {selectedAccount && selectedAccount.deals.length > 0 && (
          /* The deal follows the customer (Anir, Aug 15: "I choose a customer
             and then maybe I choose a deal"). These are the engagements
             already recorded on that account, so a claim points at something
             the heat map and the account page can both see. Optional: a win
             can land before anyone has logged the engagement. */
          <div>
            <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
              Deal{" "}
              <span className="font-normal text-text-tertiary">(optional)</span>
              <InfoHint text="The engagement on this account that produced the number. Leave it empty if the deal is not recorded yet." />
            </label>
            <div className="mt-1">
              <ColorSelect
                value={dealId}
                onChange={setDealId}
                ariaLabel="Deal"
                minWidth={430}
                options={[
                  { value: "", label: "No specific deal", color: "#8E98A8" },
                  ...selectedAccount.deals.map((d) => ({
                    value: d.id,
                    label: d.label,
                    color: "#0F766E",
                  })),
                ]}
              />
            </div>
          </div>
        )}
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Evidence
            <InfoHint text={"The proof behind the claim: the signed contract, SOW or opportunity summary.\nThe group owner opens it before verifying, and money claims cannot be submitted without it."} />
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {evidence.map((e, i) => (
              <span
                key={e.url}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary"
              >
                📎 {e.name}
                <button
                  type="button"
                  aria-label={`Remove ${e.name}`}
                  onClick={() => setEvidence((prev) => prev.filter((_, j) => j !== i))}
                  className="cursor-pointer text-blue-primary/70 hover:text-blue-primary"
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            <button
              type="button"
              disabled={uploading || evidence.length >= 5}
              onClick={() => evidenceInputRef.current?.click()}
              className="cursor-pointer rounded-full border border-border-light bg-white px-3 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "＋ Attach a file"}
            </button>
            <input
              ref={evidenceInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => attachEvidence(e.target.files)}
            />
          </div>
          {/* The bar the sales-material uploader shows, for the same reason:
              a large contract takes a while, and a frozen label reads as
              broken (Anir, Aug 15). */}
          {uploads.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {uploads.map((u) => (
                <div key={u.name + u.status}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-secondary">
                      {u.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-semibold tnum",
                        u.status === "failed"
                          ? "text-error"
                          : u.status === "done"
                            ? "text-success"
                            : "text-text-tertiary"
                      )}
                    >
                      {u.status === "failed"
                        ? "Failed"
                        : u.status === "done"
                          ? "Attached ✓"
                          : `${u.percent}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-200",
                        u.status === "failed"
                          ? "bg-error"
                          : u.status === "done"
                            ? "bg-success"
                            : "bg-blue-primary"
                      )}
                      style={{
                        width: `${u.status === "failed" ? 100 : u.percent}%`,
                      }}
                    />
                  </div>
                  {u.error && (
                    <p className="mt-1 text-[10.5px] text-error">{u.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {effectiveGoal?.unit === "currency" && evidence.length === 0 && (
            <p className="mt-1 text-[10.5px] text-[color:#B45309]">
              Money claims need the contract attached before they can be submitted.
            </p>
          )}
        </div>
        <div>
          <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
            Note{" "}
            <span className="font-normal text-text-tertiary">(optional)</span>
            <InfoHint text="One line on what this was, the deal or the milestone, so the number still means something months later." />
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. BioNex contract signed"
            className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
          />
        </div>
        <button
          type="button"
          disabled={
            busy ||
            !goalId ||
            (composite && !componentId) ||
            (effectiveGoal !== null &&
              effectiveGoal.subgoals.length > 0 &&
              !subgoalId) ||
            !person.trim() ||
            parsed === null ||
            uploading ||
            (effectiveGoal?.unit === "currency" && evidence.length === 0)
          }
          onClick={save}
          className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Submit for verification"}
        </button>
      </div>
    </Modal>
  );
}

