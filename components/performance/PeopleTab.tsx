"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Crown, Plus, Trash2, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { cn } from "@/lib/utils";
import {
  actualValue,
  fmtAmount,
  paceVerdict,
  pctMet,
  type PerformanceState,
} from "@/lib/performanceShared";
import { GoalBar, PacePill, TypeChip, VerifiedPill } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * PEOPLE & GROUPS — the person view from his notes: "you take a particular
 * person and see that particular person's goals, one by one", plus "people
 * are associated with a group, and when you click on that group, all the
 * people's things can be seen."
 */

type Assignment = {
  goalId: string;
  goalName: string;
  goalType: string;
  unit: PerformanceState["goals"][number]["unit"];
  measure: PerformanceState["goals"][number]["measure"];
  year: number;
  subgoalId: string;
  subgoalName: string;
  target: number;
  verified: boolean;
};

type PersonRow = {
  name: string;
  groups: string[];
  assignments: Assignment[];
  owns: { goalName: string; subgoalName: string }[];
  attainment: number | null;
};

function buildPeople(state: PerformanceState): PersonRow[] {
  const byName = new Map<string, PersonRow>();
  const get = (name: string): PersonRow => {
    let row = byName.get(name);
    if (!row) {
      row = { name, groups: [], assignments: [], owns: [], attainment: null };
      byName.set(name, row);
    }
    return row;
  };
  for (const g of state.groups) {
    for (const m of g.members) get(m).groups.push(g.name);
  }
  for (const goal of state.goals) {
    for (const s of goal.subgoals) {
      for (const o of s.owners) {
        get(o).owns.push({ goalName: goal.name, subgoalName: s.name });
      }
      for (const p of s.people) {
        get(p.name).assignments.push({
          goalId: goal.id,
          goalName: goal.name,
          goalType: goal.type,
          unit: goal.unit,
          measure: goal.measure,
          year: goal.year,
          subgoalId: s.id,
          subgoalName: s.name,
          target: p.target,
          verified: p.verified,
        });
      }
    }
  }
  const rows = [...byName.values()];
  for (const row of rows) {
    const scored = row.assignments
      .filter((a) => a.target > 0 && a.measure === "total")
      .map((a) =>
        Math.min(
          100,
          pctMet(
            actualValue(state.actuals, { id: a.goalId, measure: a.measure }, {
              subgoalId: a.subgoalId,
              person: row.name,
            }),
            a.target
          )
        )
      );
    row.attainment = scored.length
      ? scored.reduce((x, y) => x + y, 0) / scored.length
      : null;
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function PeopleTab({
  state,
  live,
  run,
  onNewGroup,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  onNewGroup: () => void;
}) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const people = useMemo(() => buildPeople(state), [state]);
  const q = query.trim().toLowerCase();
  const shown = people.filter((p) => {
    if (groupFilter !== "all" && !p.groups.includes(groupFilter)) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.groups.some((g) => g.toLowerCase().includes(q))
    );
  });

  const group = state.groups.find((g) => g.id === openGroup) ?? null;
  const person = people.find((p) => p.name === openPerson) ?? null;

  return (
    <div>
      <SearchPriority query={query} className="flex flex-wrap items-center gap-2">
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search people and groups…"
          ariaLabel="Search people"
          grow
          growMaxWidth={340}
          growExpandedMaxWidth={460}
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex items-center gap-2">
          <ColorSelect
            value={groupFilter}
            onChange={setGroupFilter}
            ariaLabel="Group"
            dense
            minWidth={170}
            options={[
              { value: "all", label: "All groups", color: "#0071E3" },
              ...state.groups.map((g) => ({
                value: g.name,
                label: g.name,
                color: "#6D28D9",
              })),
            ]}
          />
          {live && (
            <button
              type="button"
              onClick={onNewGroup}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
            >
              <Plus size={14} strokeWidth={2.4} /> New group
            </button>
          )}
        </span>
      </SearchPriority>

      {state.groups.length === 0 && people.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={UsersRound}
            title="No groups yet"
            description="Create the first user group — a team and its head, like Rukmini's growth accounts group. Every member's numbers roll into the group's count."
            action={
              live ? (
                <button
                  type="button"
                  onClick={onNewGroup}
                  className="cursor-pointer rounded-full bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90"
                >
                  Create the first group
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {state.groups.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">
              {state.groups
                .filter(
                  (g) => groupFilter === "all" || g.name === groupFilter
                )
                .map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setOpenGroup(g.id)}
                    className="group cursor-pointer rounded-xl border border-border-light bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-bold text-text-primary transition-colors group-hover:text-blue-primary">
                        {g.name}
                      </span>
                      <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-blue-primary tnum">
                        {g.members.length}{" "}
                        {g.members.length === 1 ? "person" : "people"}
                      </span>
                    </span>
                    <span className="mt-2.5 flex items-center gap-2">
                      <Avatar name={g.head} className="h-7 w-7 text-[10px]" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
                          {g.head}
                          <Crown
                            size={11}
                            strokeWidth={2.2}
                            className="text-[color:#B45309]"
                          />
                        </span>
                        <span className="block text-[10.5px] text-text-tertiary">
                          Group head
                        </span>
                      </span>
                      <span className="ml-auto flex -space-x-1.5">
                        {g.members
                          .filter((m) => m !== g.head)
                          .slice(0, 5)
                          .map((m) => (
                            <Avatar
                              key={m}
                              name={m}
                              tooltip={m}
                              className="h-6 w-6 border-2 border-white text-[8px]"
                            />
                          ))}
                        {g.members.length - 1 > 5 && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[rgba(0,113,227,0.10)] text-[9px] font-bold text-blue-primary">
                            +{g.members.length - 1 - 5}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}

          {shown.length > 0 && (
            <Card className="mt-4 overflow-hidden p-0">
              <div className="divide-y divide-border-light">
                {shown.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setOpenPerson(p.name)}
                    className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                  >
                    <Avatar name={p.name} className="h-9 w-9 text-[12px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text-primary transition-colors group-hover:text-blue-primary">
                        {p.name}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">
                        {p.groups.length > 0 ? p.groups.join(" · ") : "No group"}
                        {p.owns.length > 0 &&
                          ` · owns ${p.owns.length} ${p.owns.length === 1 ? "subgoal" : "subgoals"}`}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-[11.5px] text-text-tertiary tnum sm:block">
                      {p.assignments.length}{" "}
                      {p.assignments.length === 1 ? "goal" : "goals"}
                    </span>
                    {p.attainment !== null && (
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, p.attainment)}%`,
                              background:
                                p.attainment >= 85
                                  ? "#16A34A"
                                  : p.attainment >= 55
                                    ? "#0071E3"
                                    : "#DC2626",
                            }}
                          />
                        </span>
                        <span className="w-9 text-right text-[12px] font-semibold text-text-primary tnum">
                          {Math.round(p.attainment)}%
                        </span>
                      </span>
                    )}
                    <ChevronDown
                      size={15}
                      strokeWidth={2.2}
                      className="shrink-0 -rotate-90 text-text-tertiary transition-colors group-hover:text-blue-primary"
                    />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ------------------------------------------------------ group popup */}
      <Modal
        open={group !== null}
        onClose={() => setOpenGroup(null)}
        title={group ? group.name : ""}
        size="wide"
      >
        {group && (
          <div>
            <p className="text-[12.5px] text-text-secondary">
              {group.members.length}{" "}
              {group.members.length === 1 ? "person" : "people"}, headed by{" "}
              <span className="font-semibold text-text-primary">
                {group.head}
              </span>
              . Click anyone for their goals.
            </p>
            <div className="mt-3 space-y-1.5">
              {group.members.map((m) => {
                const row = people.find((p) => p.name === m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setOpenGroup(null);
                      setOpenPerson(m);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border-light bg-white px-3 py-2 text-left transition-colors hover:border-blue-subtle hover:bg-surface"
                  >
                    <Avatar name={m} className="h-7 w-7 text-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-text-primary">
                        {m}
                        {m === group.head && (
                          <Crown
                            size={11}
                            strokeWidth={2.2}
                            className="text-[color:#B45309]"
                          />
                        )}
                      </span>
                      <span className="block text-[10.5px] text-text-tertiary tnum">
                        {row?.assignments.length ?? 0} goals ·{" "}
                        {row?.owns.length ?? 0} owned
                      </span>
                    </span>
                    {row?.attainment !== null &&
                      row?.attainment !== undefined && (
                        <span className="text-[12px] font-semibold text-text-primary tnum">
                          {Math.round(row.attainment)}%
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
            {live && (
              <div className="mt-3 border-t border-border-light pt-3">
                <button
                  type="button"
                  onClick={() =>
                    run(
                      { op: "remove-group", groupId: group.id },
                      `${group.name} removed`
                    ).then((ok) => ok && setOpenGroup(null))
                  }
                  className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626]"
                >
                  <Trash2 size={12.5} strokeWidth={2.2} /> Remove this group
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ----------------------------------------------------- person popup */}
      <Modal
        open={person !== null}
        onClose={() => setOpenPerson(null)}
        title={person ? person.name : ""}
        size="wide"
      >
        {person && (
          <div>
            <div className="flex items-center gap-3 rounded-xl border border-border-light bg-[var(--surface)] p-3.5">
              <Avatar name={person.name} className="h-12 w-12 text-[16px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-text-primary">
                  {person.name}
                </span>
                <span className="block text-[12px] text-text-secondary">
                  {person.groups.length > 0
                    ? person.groups.join(" · ")
                    : "Not in a group yet"}
                </span>
              </span>
              {person.attainment !== null && (
                <span className="text-right">
                  <span className="block text-[18px] font-bold text-text-primary tnum">
                    {Math.round(person.attainment)}%
                  </span>
                  <span className="block text-[10.5px] text-text-tertiary">
                    average attainment
                  </span>
                </span>
              )}
            </div>

            {person.assignments.length === 0 ? (
              <p className="mt-3 rounded-lg bg-surface px-4 py-5 text-center text-[12.5px] text-text-secondary">
                No goals assigned yet — assign them on a subgoal in the Goal
                Master.
              </p>
            ) : (
              <div className="-mr-2 mt-3 max-h-[46vh] space-y-2.5 overflow-y-auto pr-2">
                {person.assignments.map((a) => {
                  const goalRef = { id: a.goalId, measure: a.measure };
                  const actual = actualValue(state.actuals, goalRef, {
                    subgoalId: a.subgoalId,
                    person: person.name,
                  });
                  const pace = paceVerdict(actual, a.target, a.year, a.measure);
                  return (
                    <div
                      key={`${a.goalId}:${a.subgoalId}`}
                      className="rounded-xl border border-border-light bg-white p-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeChip type={a.goalType} size="sm" />
                        <span className="text-[13px] font-semibold text-text-primary">
                          {a.goalName}
                        </span>
                        <span className="text-[11.5px] text-text-tertiary">
                          — {a.subgoalName}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <PacePill pace={pace} size="sm" />
                          <VerifiedPill
                            verified={a.verified}
                            size="sm"
                            onToggle={
                              live
                                ? () =>
                                    run(
                                      {
                                        op: "set-verified",
                                        goalId: a.goalId,
                                        subgoalId: a.subgoalId,
                                        person: person.name,
                                        verified: !a.verified,
                                      },
                                      a.verified
                                        ? "Marked not verified"
                                        : "Verified"
                                    )
                                : undefined
                            }
                          />
                        </span>
                      </div>
                      <GoalBar
                        className="mt-2"
                        actual={actual}
                        target={a.target}
                        year={a.year}
                        unit={a.unit}
                        pace={pace}
                        showExpected={a.measure === "total"}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {person.owns.length > 0 && (
              <div className="mt-3 border-t border-border-light pt-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  Goal owner of
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {person.owns.map((o, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-[rgba(109,40,217,0.08)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:#6D28D9]"
                    >
                      {o.goalName} — {o.subgoalName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
