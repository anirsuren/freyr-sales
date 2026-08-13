"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Layers } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  currentFiscalYear,
  familyValue,
  fiscalLabel,
  fiscalMonthLabels,
  fiscalRange,
  fiscalWeeks,
  fmtAmount,
  goalCadences,
  isComposite,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { typeMeta } from "./bits";

/**
 * THE ZOOM (Suren, Aug 13): one big box that always holds exactly one level.
 * Click H1 and "this whole box is filled with the H1 view, and the yearly
 * view line becomes small." Every level you came through stays as a slim
 * strip above the box, one click to zoom back out. Groups and people fan out
 * INSIDE whatever period is in focus, so from the organization's January you
 * reach one person's January without ever leaving the page.
 *
 * Honest numbers only: verified entries are the number, reported entries are
 * shown as "awaiting", and the only targets shown are the ones actually set
 * (the goal's annual target). No invented period targets.
 */

type Focus =
  | { level: "year" }
  | { level: "half"; index: number }
  | { level: "quarter"; index: number }
  | { level: "month"; index: number }
  | { level: "week"; monthIndex: number; weekIndex: number };

const COMPONENT_COLORS = ["#0071E3", "#0F766E", "#6D28D9"];

function focusLabel(focus: Focus, fy: number): string {
  if (focus.level === "year") return fiscalLabel(fy);
  if (focus.level === "half") return focus.index === 0 ? "H1" : "H2";
  if (focus.level === "quarter") return `Q${focus.index + 1}`;
  if (focus.level === "month") return fiscalMonthLabels(fy)[focus.index];
  return fiscalWeeks(fy, focus.monthIndex)[focus.weekIndex]?.label ?? "Week";
}

function focusRange(focus: Focus, fy: number): [number, number] {
  if (focus.level === "week") {
    return (
      fiscalWeeks(fy, focus.monthIndex)[focus.weekIndex]?.range ??
      fiscalRange(fy, "month", focus.monthIndex)
    );
  }
  if (focus.level === "year") return fiscalRange(fy, "year");
  return fiscalRange(fy, focus.level, focus.index);
}

function rangeCaption([start, end]: [number, number]): string {
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const last = new Date(end - 1);
  return `${fmt(start)} – ${last.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}`;
}

export function GoalZoom({
  state,
  goalId,
  meName,
}: {
  state: PerformanceState;
  goalId: string;
  meName: string;
}) {
  const goal = state.goals.find((g) => g.id === goalId) as PrimaryGoal;
  const meta = typeMeta(goal.type);
  const composite = isComposite(goal);
  const components = (goal.componentGoalIds ?? [])
    .map((id) => state.goals.find((g) => g.id === id))
    .filter((g): g is PrimaryGoal => Boolean(g));
  const cadences = goalCadences(goal);

  const nowFy = currentFiscalYear();
  const [fy, setFy] = useState(nowFy);
  const [trail, setTrail] = useState<Focus[]>([]);
  const [by, setBy] = useState<"none" | "groups" | "people">("none");
  const [groupScope, setGroupScope] = useState<string | null>(null);
  const [personScope, setPersonScope] = useState<string | null>(null);

  const focus: Focus = trail[trail.length - 1] ?? { level: "year" };
  const range = focusRange(focus, fy);

  const scopeGroup = state.groups.find((g) => g.id === groupScope) ?? null;
  const scopePeople = useMemo(() => {
    if (personScope) return new Set([personScope]);
    if (scopeGroup)
      return new Set(
        [scopeGroup.head, ...scopeGroup.members].map((n) => n.trim())
      );
    return undefined;
  }, [personScope, scopeGroup]);

  const value = (extra: Parameters<typeof familyValue>[2] = {}) =>
    familyValue(state, goal, { range, people: scopePeople, ...extra });

  const verified = value({ verifiedOnly: true });
  const awaiting = value({ reportedOnly: true });
  const yearTarget =
    goal.target ||
    components.reduce((sum, c) => sum + (c.target || 0), 0);
  const showTarget = focus.level === "year" && !scopePeople && yearTarget > 0;
  const pct = showTarget ? Math.min(100, (verified / yearTarget) * 100) : null;

  const zoomTo = (next: Focus) => setTrail((t) => [...t, next]);
  const popTo = (depth: number) => setTrail((t) => t.slice(0, depth));

  /** GO DEEPER chips for the current level, honoring the goal's cadences. */
  const deeper: { label: string; next: Focus }[] = useMemo(() => {
    const months = fiscalMonthLabels(fy);
    if (focus.level === "year") {
      return [
        { label: "H1", next: { level: "half", index: 0 } as Focus },
        { label: "H2", next: { level: "half", index: 1 } as Focus },
        ...(cadences.includes("quarterly")
          ? [0, 1, 2, 3].map((i) => ({
              label: `Q${i + 1}`,
              next: { level: "quarter", index: i } as Focus,
            }))
          : []),
      ];
    }
    if (focus.level === "half") {
      const base = focus.index * 2;
      const monthBase = focus.index * 6;
      return [
        ...(cadences.includes("quarterly")
          ? [base, base + 1].map((i) => ({
              label: `Q${i + 1}`,
              next: { level: "quarter", index: i } as Focus,
            }))
          : []),
        ...(cadences.includes("monthly")
          ? Array.from({ length: 6 }, (_, j) => ({
              label: months[monthBase + j],
              next: { level: "month", index: monthBase + j } as Focus,
            }))
          : []),
      ];
    }
    if (focus.level === "quarter") {
      if (!cadences.includes("monthly")) return [];
      const monthBase = focus.index * 3;
      return Array.from({ length: 3 }, (_, j) => ({
        label: months[monthBase + j],
        next: { level: "month", index: monthBase + j } as Focus,
      }));
    }
    if (focus.level === "month") {
      if (!cadences.includes("weekly")) return [];
      return fiscalWeeks(fy, focus.index).map((w, i) => ({
        label: w.label.replace("Week ", ""),
        next: { level: "week", monthIndex: focus.index, weekIndex: i } as Focus,
      }));
    }
    return [];
  }, [focus, fy, cadences]);

  const groupRows = state.groups.map((g) => {
    const people = new Set([g.head, ...g.members].map((n) => n.trim()));
    return {
      group: g,
      verified: familyValue(state, goal, { range, people, verifiedOnly: true }),
      awaiting: familyValue(state, goal, { range, people, reportedOnly: true }),
    };
  });
  const maxGroup = Math.max(1, ...groupRows.map((r) => r.verified));

  const peopleRows = useMemo(() => {
    const names = new Set<string>();
    if (scopeGroup) {
      for (const n of [scopeGroup.head, ...scopeGroup.members]) names.add(n.trim());
    } else {
      for (const a of state.actuals) {
        if (new Set([goal.id, ...(goal.componentGoalIds ?? [])]).has(a.goalId))
          names.add(a.person.trim());
      }
      for (const g of state.groups)
        for (const n of [g.head, ...g.members]) names.add(n.trim());
    }
    return [...names]
      .filter(Boolean)
      .map((name) => ({
        name,
        verified: familyValue(state, goal, { range, person: name, verifiedOnly: true }),
        awaiting: familyValue(state, goal, { range, person: name, reportedOnly: true }),
      }))
      .sort((a, b) => b.verified - a.verified);
  }, [state, goal, range, scopeGroup]);
  const maxPerson = Math.max(1, ...peopleRows.map((r) => r.verified));

  const fys = Array.from({ length: 5 }, (_, i) => nowFy - 4 + i);

  const strip = (label: string, caption: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border-light bg-surface px-4 py-2 text-left transition-colors hover:border-blue-subtle"
    >
      <span className="text-[12px] font-bold text-blue-primary">{label}</span>
      <span className="text-[11px] text-text-tertiary">{caption}</span>
      <span className="ml-auto text-[10.5px] font-semibold text-text-tertiary">
        click to zoom back out
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <SmartBack
        fallback="/performance"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Org performance
      </SmartBack>

      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}1F`, color: meta.color }}
        >
          <meta.icon size={19} strokeWidth={2} />
        </span>
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-text-primary">
          {goal.name}
        </h1>
        {composite && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(109,40,217,0.10)] px-2.5 py-1 text-[11px] font-bold text-[color:#6D28D9]">
            <Layers size={11} strokeWidth={2.4} />
            {components.map((c) => c.name.replace("Booked ", "")).join(" + ")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {fys.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setFy(y);
                setTrail([]);
              }}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                y === fy
                  ? "bg-blue-primary text-white"
                  : "border border-border-light bg-white text-text-secondary hover:text-text-primary"
              )}
            >
              {fiscalLabel(y)}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-text-secondary">
        Financial years run April to March. Everything below shows{" "}
        <b>verified</b> results; claims still waiting for a group owner appear
        as awaiting and never count.
      </p>

      {/* the trail: every level above the box, shrunk to a strip */}
      {(trail.length > 0 || groupScope || personScope) && (
        <div className="mt-4 space-y-1.5">
          {trail.length > 0 &&
            strip(fiscalLabel(fy), "the whole financial year", () => popTo(0))}
          {trail.slice(0, -1).map((f, i) =>
            strip(focusLabel(f, fy), rangeCaption(focusRange(f, fy)), () =>
              popTo(i + 1)
            )
          )}
          {(groupScope || personScope) &&
            strip(
              personScope ?? scopeGroup?.name ?? "",
              personScope ? "one person" : "one group",
              () => {
                setPersonScope(null);
                setGroupScope(null);
              }
            )}
        </div>
      )}

      {/* THE BOX */}
      <Card className="mt-4 border-blue-subtle/60 p-7 shadow-[0_18px_50px_-24px_rgba(0,60,120,0.25)]">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
              {focus.level === "year" ? "Financial year" : focus.level}
              {personScope
                ? ` · ${personScope}`
                : scopeGroup
                  ? ` · ${scopeGroup.name}`
                  : ""}
            </p>
            <p className="mt-0.5 text-[26px] font-extrabold tracking-[-0.02em] text-text-primary">
              {focusLabel(focus, fy)}{" "}
              <span className="text-[14px] font-semibold text-text-tertiary">
                {rangeCaption(range)}
              </span>
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
              Verified
            </p>
            <p className="text-[30px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
              {fmtAmount(goal.unit, verified)}
              {showTarget && (
                <span className="text-[16px] font-semibold text-text-tertiary">
                  {" "}
                  of {fmtAmount(goal.unit, yearTarget)}
                </span>
              )}
            </p>
            {awaiting > 0 && (
              <span className="mt-1 inline-block rounded-full bg-[rgba(180,83,9,0.12)] px-2.5 py-1 text-[11px] font-bold text-[color:#B45309]">
                {fmtAmount(goal.unit, awaiting)} awaiting verification
              </span>
            )}
          </div>
        </div>
        {pct !== null && (
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-blue-primary transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {composite && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {components.map((c, i) => {
              const compVerified = value({
                componentGoalId: c.id,
                verifiedOnly: true,
              });
              const compTarget =
                focus.level === "year" && !scopePeople ? c.target : 0;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border-light/80 p-3.5"
                >
                  <p className="text-[12px] font-bold text-text-primary">
                    {c.name}
                  </p>
                  <p className="mt-1.5 text-[19px] font-extrabold tnum">
                    {fmtAmount(c.unit, compVerified)}
                    {compTarget > 0 && (
                      <span className="text-[12px] font-semibold text-text-tertiary">
                        {" "}
                        of {fmtAmount(c.unit, compTarget)}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${
                          compTarget > 0
                            ? Math.min(100, (compVerified / compTarget) * 100)
                            : compVerified > 0
                              ? 100
                              : 0
                        }%`,
                        background: COMPONENT_COLORS[i % 3],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* go deeper: periods */}
        {deeper.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
              Go deeper
            </span>
            {deeper.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => zoomTo(d.next)}
                className="cursor-pointer rounded-full border border-border-light bg-white px-3.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                {d.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border-light" aria-hidden />
            <button
              type="button"
              onClick={() => setBy(by === "groups" ? "none" : "groups")}
              className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                by === "groups"
                  ? "bg-blue-primary text-white"
                  : "border border-border-light bg-white text-text-secondary hover:text-blue-primary"
              )}
            >
              👥 Groups
            </button>
            <button
              type="button"
              onClick={() => setBy(by === "people" ? "none" : "people")}
              className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                by === "people"
                  ? "bg-blue-primary text-white"
                  : "border border-border-light bg-white text-text-secondary hover:text-blue-primary"
              )}
            >
              🧍 People
            </button>
          </div>
        )}

        {/* the fan: groups or people inside this period */}
        {by === "groups" && !personScope && (
          <div className="mt-4 border-t border-border-light pt-4">
            {state.groups.length === 0 ? (
              <p className="text-[12.5px] text-text-secondary">
                No groups yet. Create them on the Performance page and every
                period here fans out by group.
              </p>
            ) : (
              <div className="space-y-2.5">
                {groupRows.map((r) => (
                  <button
                    key={r.group.id}
                    type="button"
                    onClick={() => {
                      setGroupScope(r.group.id);
                      setBy("people");
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface"
                  >
                    <Avatar name={r.group.head} className="h-7 w-7 text-[10px]" />
                    <span className="w-[190px]">
                      <b className="block text-[13px] text-text-primary">
                        {r.group.name}
                      </b>
                      <span className="text-[10.5px] text-text-tertiary">
                        {r.group.head} · {r.group.members.length} people
                      </span>
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-blue-primary"
                        style={{ width: `${(r.verified / maxGroup) * 100}%` }}
                      />
                    </span>
                    <b className="w-[90px] text-right text-[12.5px] tnum">
                      {fmtAmount(goal.unit, r.verified)}
                    </b>
                    {r.awaiting > 0 && (
                      <span className="rounded-full bg-[rgba(180,83,9,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B45309] tnum">
                        +{fmtAmount(goal.unit, r.awaiting)} waiting
                      </span>
                    )}
                    <ChevronRight
                      size={14}
                      strokeWidth={2.2}
                      className="text-text-tertiary"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {by === "people" && (
          <div className="mt-4 border-t border-border-light pt-4">
            {peopleRows.length === 0 ? (
              <p className="text-[12.5px] text-text-secondary">
                Nobody has logged on this goal yet.
              </p>
            ) : (
              <div className="space-y-2">
                {peopleRows.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() =>
                      setPersonScope(personScope === r.name ? null : r.name)
                    }
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface",
                      personScope === r.name && "bg-blue-light/40"
                    )}
                  >
                    <Avatar name={r.name} className="h-6 w-6 text-[9px]" />
                    <b className="w-[190px] truncate text-[12.5px] text-text-primary">
                      {r.name}
                      {r.name === meName && (
                        <span className="ml-1.5 rounded-full bg-blue-light px-1.5 py-0.5 text-[9px] font-bold text-blue-primary">
                          you
                        </span>
                      )}
                    </b>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-blue-primary"
                        style={{ width: `${(r.verified / maxPerson) * 100}%` }}
                      />
                    </span>
                    <b className="w-[90px] text-right text-[12.5px] tnum">
                      {fmtAmount(goal.unit, r.verified)}
                    </b>
                    {r.awaiting > 0 && (
                      <span className="rounded-full bg-[rgba(180,83,9,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#B45309] tnum">
                        +{fmtAmount(goal.unit, r.awaiting)} waiting
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-text-tertiary">
        Weeks add into months, months into quarters, quarters into{" "}
        {fiscalLabel(fy)}
        {composite ? ", and the components add into this goal" : ""}. Cadences
        this goal allows: {cadences.join(", ")}.
      </p>
    </div>
  );
}
