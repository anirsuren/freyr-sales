"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  Gauge,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  knownPeople,
  parseAmountInput,
  type GoalMeasure,
  type GoalUnit,
  type PerformanceState,
  type PrimaryGoal,
  type Subgoal,
} from "@/lib/performanceShared";
import { TypeChip, UnitChip, VerifiedPill, typeMeta } from "./bits";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { PeopleTab } from "./PeopleTab";

/**
 * THE PERFORMANCE MANAGEMENT MODULE (Suren, Aug 11 — voice notes +
 * goals.xlsx). Three rooms:
 *
 * - Goal Master: the master list, "entered in one place, not hard-coded" —
 *   goal types, primary goals, subgoals with owners and per-person targets,
 *   and the pick that promotes a goal onto the org plan.
 * - Org performance: only the picked primary goals — target / actual / met /
 *   % met / verified — expanding to subgoals and the people inside them.
 * - People & groups: user groups, and every person's goals one by one.
 *
 * He warned this will take rounds: "I don't think you will get it for the
 * first time." Round one aims to be faithful to every word above.
 */

const TABS = ["org", "master", "people"] as const;
type Tab = (typeof TABS)[number];

export type RunOp = (
  body: Record<string, unknown>,
  ok?: string
) => Promise<boolean>;

export function PerformanceModule({
  initial,
  live,
  meName,
}: {
  initial: PerformanceState;
  live: boolean;
  meName: string;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<PerformanceState>(initial);
  const [tab, chooseTab] = useStoredView<Tab>(
    "freyr.performance.tab",
    "org",
    TABS
  );
  const [busy, setBusy] = useState(false);

  const run: RunOp = async (body, ok) => {
    if (busy) return false;
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------- modals
  const [goalModal, setGoalModal] = useState<{ editing: PrimaryGoal | null } | null>(null);
  const [subModal, setSubModal] = useState<{
    goal: PrimaryGoal;
    editing: Subgoal | null;
  } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const people = useMemo(() => knownPeople(state, meName), [state, meName]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border-light bg-white p-1">
          {(
            [
              { key: "org", label: "Org performance", icon: Gauge },
              { key: "master", label: "Goal Master", icon: ClipboardList },
              { key: "people", label: "People & groups", icon: UsersRound },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTab(t.key)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors sm:px-3.5 sm:text-[12.5px]",
                  active
                    ? "bg-blue-primary text-white"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary"
                )}
              >
                <Icon size={13.5} strokeWidth={2.2} />
                {t.label}
              </button>
            );
          })}
        </div>
        {!live && (
          <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
            Sample data — switch to Real mode to work with the live plan
          </span>
        )}
      </div>

      <div key={tab} className="tab-panel mt-5">
        {tab === "org" ? (
          <OrgPerformanceTab
            state={state}
            live={live}
            run={run}
            onLogActual={() => setLogOpen(true)}
            onGoToMaster={() => chooseTab("master")}
          />
        ) : tab === "master" ? (
          <MasterTab
            state={state}
            live={live}
            run={run}
            onNewGoal={() => setGoalModal({ editing: null })}
            onEditGoal={(g) => setGoalModal({ editing: g })}
            onNewSubgoal={(g) => setSubModal({ goal: g, editing: null })}
            onEditSubgoal={(g, s) => setSubModal({ goal: g, editing: s })}
          />
        ) : (
          <PeopleTab
            state={state}
            live={live}
            run={run}
            onNewGroup={() => setGroupOpen(true)}
          />
        )}
      </div>

      <GoalModal
        open={goalModal !== null}
        editing={goalModal?.editing ?? null}
        types={state.types}
        onClose={() => setGoalModal(null)}
        run={run}
        busy={busy}
      />
      {subModal && (
        <SubgoalModal
          goal={subModal.goal}
          editing={subModal.editing}
          suggestions={people}
          onClose={() => setSubModal(null)}
          run={run}
          busy={busy}
        />
      )}
      <LogActualModal
        open={logOpen}
        state={state}
        meName={meName}
        suggestions={people}
        onClose={() => setLogOpen(false)}
        run={run}
        busy={busy}
      />
      <GroupModal
        open={groupOpen}
        suggestions={people}
        onClose={() => setGroupOpen(false)}
        run={run}
        busy={busy}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Goal Master */

function MasterTab({
  state,
  live,
  run,
  onNewGoal,
  onEditGoal,
  onNewSubgoal,
  onEditSubgoal,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  onNewGoal: () => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onNewSubgoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: Subgoal) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = state.goals.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
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
          growMaxWidth={340}
          growExpandedMaxWidth={460}
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex items-center gap-2">
          <ColorSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Goal type"
            dense
            minWidth={190}
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
            description="This is the one place every goal lives: its type, its subgoals, who owns them, and whether it's on the org plan. Add the first goal to begin."
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
          Nothing matches that search.
        </p>
      ) : (
        [...byType, ...strayTypes].map(({ type, goals }) => (
          <div key={type} className="mt-5">
            <div className="flex items-center gap-2">
              <TypeChip type={type} />
              <span className="text-[11px] font-semibold text-text-tertiary tnum">
                {goals.length} {goals.length === 1 ? "goal" : "goals"}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {goals.map((g) => (
                <MasterGoalRow
                  key={g.id}
                  goal={g}
                  open={openId === g.id}
                  onToggle={() => setOpenId(openId === g.id ? null : g.id)}
                  live={live}
                  run={run}
                  onEditGoal={onEditGoal}
                  onNewSubgoal={onNewSubgoal}
                  onEditSubgoal={onEditSubgoal}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MasterGoalRow({
  goal,
  open,
  onToggle,
  live,
  run,
  onEditGoal,
  onNewSubgoal,
  onEditSubgoal,
}: {
  goal: PrimaryGoal;
  open: boolean;
  onToggle: () => void;
  live: boolean;
  run: RunOp;
  onEditGoal: (g: PrimaryGoal) => void;
  onNewSubgoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: Subgoal) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-semibold text-text-primary">
              {goal.name}
            </span>
            <UnitChip unit={goal.unit} />
            {goal.measure === "level" && (
              <span className="rounded-full bg-[rgba(109,40,217,0.10)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:#6D28D9]">
                latest value
              </span>
            )}
            <span className="text-[11px] text-text-tertiary tnum">
              {goal.year}
            </span>
          </span>
          <span className="mt-0.5 block text-[11.5px] text-text-tertiary tnum">
            Target{" "}
            {goal.target > 0 ? (
              <span className="font-semibold text-text-secondary">
                {fmtAmount(goal.unit, goal.target)}
              </span>
            ) : (
              "not set yet"
            )}
            {" · "}
            {goal.subgoals.length}{" "}
            {goal.subgoals.length === 1 ? "subgoal" : "subgoals"}
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (!live) return;
            run(
              {
                op: "update-goal",
                goalId: goal.id,
                pickedForOrg: !goal.pickedForOrg,
              },
              goal.pickedForOrg
                ? `${goal.name} is off the goal plan`
                : `${goal.name} is on the goal plan`
            );
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              (e.target as HTMLElement).click();
            }
          }}
          title={
            goal.pickedForOrg
              ? "Counted on Org performance. Click to keep it master-only."
              : "Master-only. Click to put it on the org goal plan."
          }
          className={cn(
            "shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-all",
            goal.pickedForOrg
              ? "bg-blue-primary text-white"
              : "border border-border-light text-text-tertiary hover:border-blue-subtle hover:text-text-secondary"
          )}
        >
          {goal.pickedForOrg ? "On the goal plan" : "Master only"}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          className={cn(
            "shrink-0 text-text-tertiary transition-transform",
            open && "rotate-180 text-blue-primary"
          )}
        />
      </button>
      {open && (
        <div className="tab-panel border-t border-border-light bg-[var(--surface)] px-4 py-3">
          {goal.subgoals.length === 0 ? (
            <p className="text-[12px] text-text-tertiary">
              No subgoals yet. Split this goal when different teams carry
              different pieces of it — e.g. Growth Accounts vs Focused Account
              AMR.
            </p>
          ) : (
            <div className="space-y-1.5">
              {goal.subgoals.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-white px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-[12.5px] font-semibold text-text-primary">
                      {s.name}
                    </span>
                    <span className="ml-2 text-[11px] text-text-tertiary tnum">
                      {s.target > 0
                        ? fmtAmount(goal.unit, s.target)
                        : "no target"}{" "}
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
                          tooltip={`Goal owner: ${o}`}
                          className="h-5 w-5 text-[8px]"
                        />
                      ))}
                      <span className="text-[10.5px] font-medium text-text-tertiary">
                        {s.owners.length === 1
                          ? s.owners[0]
                          : `${s.owners.length} owners`}
                      </span>
                    </span>
                  )}
                  {live && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditSubgoal(goal, s)}
                        title="Edit subgoal"
                        className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                      >
                        <Pencil size={12.5} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            {
                              op: "remove-subgoal",
                              goalId: goal.id,
                              subgoalId: s.id,
                            },
                            `${s.name} removed`
                          )
                        }
                        title="Remove subgoal"
                        className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                      >
                        <Trash2 size={12.5} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {live && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNewSubgoal(goal)}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-blue-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
              >
                <Plus size={12} strokeWidth={2.4} /> Add subgoal
              </button>
              <button
                type="button"
                onClick={() => onEditGoal(goal)}
                className="flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
              >
                <Pencil size={12} strokeWidth={2.2} /> Edit goal
              </button>
              <button
                type="button"
                onClick={() =>
                  run(
                    { op: "remove-goal", goalId: goal.id },
                    `${goal.name} removed from the master`
                  )
                }
                className="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-medium text-text-tertiary transition-colors hover:bg-white hover:text-[color:#DC2626]"
              >
                <Trash2 size={12} strokeWidth={2.2} /> Remove goal
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ goal modal */

function GoalModal({
  open,
  editing,
  types,
  onClose,
  run,
  busy,
}: {
  open: boolean;
  editing: PrimaryGoal | null;
  types: string[];
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [newType, setNewType] = useState("");
  const [unit, setUnit] = useState<GoalUnit>("count");
  const [measure, setMeasure] = useState<GoalMeasure>("total");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [target, setTarget] = useState("");
  const [picked, setPicked] = useState(true);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Re-seed the form whenever a different goal (or a fresh create) opens.
  const seedKey = open ? (editing?.id ?? "new") : null;
  if (seedKey !== seeded) {
    setSeeded(seedKey);
    if (seedKey !== null) {
      setName(editing?.name ?? "");
      setType(editing?.type ?? types[0] ?? "");
      setNewType("");
      setUnit(editing?.unit ?? "count");
      setMeasure(editing?.measure ?? "total");
      setYear(String(editing?.year ?? new Date().getFullYear()));
      setTarget(
        editing && editing.target > 0 ? String(editing.target) : ""
      );
      setPicked(editing?.pickedForOrg ?? true);
    }
  }

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
          `${name.trim()} updated`
        )
      : await run({ op: "add-goal", ...body }, `${name.trim()} added to the master`);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit goal — ${editing.name}` : "New goal"}
    >
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
          <div className="w-[110px]">
            <label className="text-[12px] font-semibold text-text-primary">
              Year
            </label>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
            />
          </div>
        </div>
        {measure === "level" && (
          <p className="rounded-lg bg-[rgba(109,40,217,0.06)] px-3 py-2 text-[11.5px] leading-relaxed text-[color:#6D28D9]">
            A latest-value goal (like Win/Loss % or Average Deal Size) shows
            the most recent number reported instead of adding entries up.
          </p>
        )}
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Annual target{" "}
            <span className="font-normal text-text-tertiary">
              (the big number from the top — leave empty to set later)
            </span>
          </label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={unit === "currency" ? "e.g. 100M" : unit === "percent" ? "e.g. 45" : "e.g. 1,200"}
            className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
          />
          {target.trim() !== "" && (
            <p className="mt-1 text-[11px] text-text-tertiary tnum">
              {parsedTarget !== null
                ? `= ${fmtAmount(unit, parsedTarget)}`
                : "That doesn't read as a number yet."}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPicked((p) => !p)}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
            picked
              ? "border-blue-subtle bg-[rgba(0,113,227,0.05)]"
              : "border-border-light bg-white hover:border-blue-subtle"
          )}
        >
          <span>
            <span className="block text-[12.5px] font-semibold text-text-primary">
              {picked ? "On the org goal plan" : "Master only"}
            </span>
            <span className="block text-[11px] text-text-tertiary">
              {picked
                ? "Counted and shown on Org performance."
                : "Kept on the master list, not tracked on the plan."}
            </span>
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
              picked
                ? "bg-blue-primary text-white"
                : "border border-border-light text-text-tertiary"
            )}
          >
            {picked ? "Picked" : "Not picked"}
          </span>
        </button>
        <button
          type="button"
          disabled={
            busy || !name.trim() || (type === "__new" && !newType.trim())
          }
          onClick={save}
          className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Add to the goal master"}
        </button>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- subgoal modal */

function SubgoalModal({
  goal,
  editing,
  suggestions,
  onClose,
  run,
  busy,
}: {
  goal: PrimaryGoal;
  editing: Subgoal | null;
  suggestions: string[];
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [target, setTarget] = useState(
    editing && editing.target > 0 ? String(editing.target) : ""
  );
  const [owners, setOwners] = useState<string[]>(editing?.owners ?? []);
  const [ownerInput, setOwnerInput] = useState("");
  const [rows, setRows] = useState<{ name: string; target: string }[]>(
    editing?.people.map((p) => ({
      name: p.name,
      target: p.target > 0 ? String(p.target) : "",
    })) ?? []
  );
  const [personInput, setPersonInput] = useState("");

  const parsedTarget = parseAmountInput(target);
  const peopleSum = rows.reduce(
    (acc, r) => acc + (parseAmountInput(r.target) ?? 0),
    0
  );

  function addOwner(o: string) {
    const clean = o.trim();
    if (!clean || owners.includes(clean)) return;
    setOwners([...owners, clean]);
    setOwnerInput("");
  }

  function addPerson(p: string) {
    const clean = p.trim();
    if (!clean || rows.some((r) => r.name === clean)) return;
    setRows([...rows, { name: clean, target: "" }]);
    setPersonInput("");
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
          `${name.trim()} updated`
        )
      : await run({ op: "add-subgoal", ...body }, `${name.trim()} added`);
    if (ok) onClose();
  }

  const ownerSuggestions = suggestions
    .filter((s) => !owners.includes(s))
    .filter((s) =>
      ownerInput.trim()
        ? s.toLowerCase().includes(ownerInput.trim().toLowerCase())
        : true
    )
    .slice(0, 5);
  const personSuggestions = suggestions
    .filter((s) => !rows.some((r) => r.name === s))
    .filter((s) =>
      personInput.trim()
        ? s.toLowerCase().includes(personInput.trim().toLowerCase())
        : true
    )
    .slice(0, 5);

  return (
    <Modal
      open
      onClose={onClose}
      title={
        editing
          ? `Edit subgoal — ${editing.name}`
          : `Add a subgoal to ${goal.name}`
      }
      size="wide"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[220px] flex-1">
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
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={goal.unit === "currency" ? "e.g. 40M" : "e.g. 700"}
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
            />
            {target.trim() !== "" && parsedTarget !== null && (
              <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
                = {fmtAmount(goal.unit, parsedTarget)}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Goal owners{" "}
            <span className="font-normal text-text-tertiary">
              (responsible overall — you can add several)
            </span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {owners.map((o) => (
              <span
                key={o}
                className="flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2 text-[12px] font-medium text-text-primary"
              >
                <Avatar name={o} className="h-5 w-5 text-[8px]" />
                {o}
                <button
                  type="button"
                  aria-label={`Remove ${o}`}
                  onClick={() => setOwners(owners.filter((x) => x !== o))}
                  className="cursor-pointer text-text-tertiary hover:text-[color:#DC2626]"
                >
                  <X size={11} strokeWidth={2.4} />
                </button>
              </span>
            ))}
            <input
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOwner(ownerInput);
                }
              }}
              placeholder="Type a name, Enter to add"
              className="h-[30px] min-w-[160px] flex-1 rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
            />
          </div>
          {ownerSuggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ownerSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addOwner(s)}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-[11.5px] text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
                >
                  <Avatar name={s} className="h-4 w-4 text-[7px]" /> {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            People on this subgoal{" "}
            <span className="font-normal text-text-tertiary">
              (each with their own target)
            </span>
          </label>
          <div className="mt-1 space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-1.5">
                  <Avatar name={r.name} className="h-5 w-5 text-[8px]" />
                  <span className="truncate text-[12.5px] font-medium text-text-primary">
                    {r.name}
                  </span>
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
                  aria-label={`Target for ${r.name}`}
                  className="h-[32px] w-[120px] rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none tnum focus:border-blue-subtle"
                />
                <button
                  type="button"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => setRows(rows.filter((_, xi) => xi !== i))}
                  className="cursor-pointer rounded-md p-1 text-text-tertiary hover:bg-surface hover:text-[color:#DC2626]"
                >
                  <Trash2 size={13} strokeWidth={2.2} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPerson(personInput);
                  }
                }}
                placeholder="Add a person — type a name, Enter to add"
                className="h-[32px] min-w-0 flex-1 rounded-lg border border-dashed border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
              />
            </div>
            {personSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {personSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addPerson(s)}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-[11.5px] text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
                  >
                    <Avatar name={s} className="h-4 w-4 text-[7px]" /> {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {parsedTarget !== null && parsedTarget > 0 && rows.length > 0 && (
            <p
              className={cn(
                "mt-1.5 text-[11px] tnum",
                Math.abs(peopleSum - parsedTarget) < 0.005 * parsedTarget
                  ? "text-[color:#16A34A]"
                  : "text-text-tertiary"
              )}
            >
              People&apos;s targets add to {fmtAmount(goal.unit, peopleSum)} of the{" "}
              {fmtAmount(goal.unit, parsedTarget)} subgoal target.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={save}
          className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Add subgoal"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- log actual modal */

function LogActualModal({
  open,
  state,
  meName,
  suggestions,
  onClose,
  run,
  busy,
}: {
  open: boolean;
  state: PerformanceState;
  meName: string;
  suggestions: string[];
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [goalId, setGoalId] = useState("");
  const [subgoalId, setSubgoalId] = useState("");
  const [person, setPerson] = useState("");
  const [freePerson, setFreePerson] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const goal = state.goals.find((g) => g.id === goalId) ?? null;
  const sub = goal?.subgoals.find((s) => s.id === subgoalId) ?? null;
  const parsed = parseAmountInput(amount);

  const personOptions = useMemo(() => {
    const set = new Set<string>();
    if (sub) {
      for (const p of sub.people) set.add(p.name);
      for (const o of sub.owners) set.add(o);
    } else if (goal) {
      for (const s of goal.subgoals) {
        for (const p of s.people) set.add(p.name);
      }
    }
    if (set.size === 0) for (const s of suggestions) set.add(s);
    set.add(meName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [goal, sub, suggestions, meName]);

  async function save() {
    const who = person === "__other" ? freePerson : person;
    const ok = await run(
      {
        op: "log-actual",
        goalId,
        subgoalId: subgoalId || null,
        person: who,
        amount: parsed ?? NaN,
        date: date || undefined,
        note: note || undefined,
      },
      "Logged — the numbers roll straight up"
    );
    if (ok) {
      setAmount("");
      setNote("");
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log an actual">
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        One number at a time: who achieved what, on which goal. Person rolls
        into group, group rolls into the organization — automatically.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Goal
          </label>
          <div className="mt-1">
            <ColorSelect
              value={goalId}
              onChange={(v) => {
                setGoalId(v);
                setSubgoalId("");
                setPerson("");
              }}
              ariaLabel="Goal"
              minWidth={280}
              options={[
                { value: "", label: "Pick a goal…", color: "#8E98A8" },
                ...state.goals.map((g) => ({
                  value: g.id,
                  label: g.name,
                  color: typeMeta(g.type).color,
                  icon: typeMeta(g.type).icon,
                })),
              ]}
            />
          </div>
        </div>
        {goal && goal.subgoals.length > 0 && (
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              Subgoal
            </label>
            <div className="mt-1">
              <ColorSelect
                value={subgoalId}
                onChange={(v) => {
                  setSubgoalId(v);
                  setPerson("");
                }}
                ariaLabel="Subgoal"
                minWidth={280}
                options={[
                  { value: "", label: "Pick a subgoal…", color: "#8E98A8" },
                  ...goal.subgoals.map((s) => ({
                    value: s.id,
                    label: s.name,
                    color: typeMeta(goal.type).color,
                  })),
                ]}
              />
            </div>
          </div>
        )}
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Person
          </label>
          <div className="mt-1">
            <ColorSelect
              value={person}
              onChange={setPerson}
              ariaLabel="Person"
              minWidth={240}
              options={[
                { value: "", label: "Whose number is it?", color: "#8E98A8" },
                ...personOptions.map((p) => ({
                  value: p,
                  label: p,
                  color: "#0071E3",
                })),
                { value: "__other", label: "Someone else…", color: "#6D28D9" },
              ]}
            />
          </div>
          {person === "__other" && (
            <input
              value={freePerson}
              onChange={(e) => setFreePerson(e.target.value)}
              placeholder="Their name"
              className="mt-2 h-[36px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[150px] flex-1">
            <label className="text-[12px] font-semibold text-text-primary">
              Amount
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={
                goal?.unit === "currency"
                  ? "e.g. 250K"
                  : goal?.unit === "percent"
                    ? "e.g. 44"
                    : "e.g. 12"
              }
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none tnum focus:border-blue-subtle"
            />
            {amount.trim() !== "" && goal && (
              <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
                {parsed !== null
                  ? `= ${fmtAmount(goal.unit, parsed)}`
                  : "That doesn't read as a number yet."}
              </p>
            )}
          </div>
          <div className="w-[160px]">
            <label className="text-[12px] font-semibold text-text-primary">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[13px] outline-none tnum focus:border-blue-subtle"
            />
          </div>
        </div>
        {goal?.measure === "level" && (
          <p className="rounded-lg bg-[rgba(109,40,217,0.06)] px-3 py-2 text-[11.5px] leading-relaxed text-[color:#6D28D9]">
            This goal tracks the latest value — this entry becomes the current
            number rather than adding to a total.
          </p>
        )}
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Note{" "}
            <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. BioNex contract signed"
            className="mt-1 h-[36px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
          />
        </div>
        <button
          type="button"
          disabled={
            busy ||
            !goalId ||
            (goal !== null && goal.subgoals.length > 0 && !subgoalId) ||
            !(person === "__other" ? freePerson.trim() : person) ||
            parsed === null
          }
          onClick={save}
          className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Log it"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ group modal */

function GroupModal({
  open,
  suggestions,
  onClose,
  run,
  busy,
}: {
  open: boolean;
  suggestions: string[];
  onClose: () => void;
  run: RunOp;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [memberInput, setMemberInput] = useState("");
  const [head, setHead] = useState("");

  function addMember(m: string) {
    const clean = m.trim();
    if (!clean || members.includes(clean)) return;
    setMembers([...members, clean]);
    if (!head) setHead(clean);
    setMemberInput("");
  }

  async function save() {
    const ok = await run(
      { op: "add-group", name, head, members },
      `${name.trim()} created`
    );
    if (ok) {
      setName("");
      setMembers([]);
      setHead("");
      onClose();
    }
  }

  const memberSuggestions = suggestions
    .filter((s) => !members.includes(s))
    .filter((s) =>
      memberInput.trim()
        ? s.toLowerCase().includes(memberInput.trim().toLowerCase())
        : true
    )
    .slice(0, 6);

  return (
    <Modal open={open} onClose={onClose} title="New user group">
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        A group is a team with a head — like Rukmini&apos;s growth accounts
        group. Every member&apos;s numbers roll into the group&apos;s count.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            Group name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Growth Accounts"
            className="mt-1 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] outline-none focus:border-blue-subtle"
          />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-primary">
            People in the group
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {members.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2 text-[12px] font-medium text-text-primary"
              >
                <Avatar name={m} className="h-5 w-5 text-[8px]" />
                {m}
                <button
                  type="button"
                  aria-label={`Remove ${m}`}
                  onClick={() => {
                    setMembers(members.filter((x) => x !== m));
                    if (head === m) setHead("");
                  }}
                  className="cursor-pointer text-text-tertiary hover:text-[color:#DC2626]"
                >
                  <X size={11} strokeWidth={2.4} />
                </button>
              </span>
            ))}
            <input
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMember(memberInput);
                }
              }}
              placeholder="Type a name, Enter to add"
              className="h-[30px] min-w-[160px] flex-1 rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
            />
          </div>
          {memberSuggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {memberSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addMember(s)}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-[11.5px] text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
                >
                  <Avatar name={s} className="h-4 w-4 text-[7px]" /> {s}
                </button>
              ))}
            </div>
          )}
        </div>
        {members.length > 0 && (
          <div>
            <label className="text-[12px] font-semibold text-text-primary">
              Group head
            </label>
            <div className="mt-1">
              <ColorSelect
                value={head}
                onChange={setHead}
                ariaLabel="Group head"
                minWidth={220}
                options={members.map((m) => ({
                  value: m,
                  label: m,
                  color: "#0071E3",
                }))}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={busy || !name.trim() || members.length === 0}
          onClick={save}
          className="w-full cursor-pointer rounded-full bg-blue-primary py-2.5 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create the group"}
        </button>
      </div>
    </Modal>
  );
}
