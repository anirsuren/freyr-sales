"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Layers, Paperclip } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
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
  headedGroups,
  isComposite,
  type PerfActual,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { typeMeta } from "./bits";
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

const COMPONENT_COLORS = ["#0071E3", "#0F766E", "#6D28D9"];
const COMPONENT_ICONS = ["🚀", "📈", "🔁"];

type Granularity = "weeks" | "months" | "quarters" | "years";

function inRange(a: PerfActual, [s, e]: [number, number]): boolean {
  const t = Date.parse(a.date);
  return !Number.isNaN(t) && t >= s && t < e;
}

export function GoalZoom({
  state,
  goalId,
  meName,
  run,
}: {
  state: PerformanceState;
  goalId: string;
  meName: string;
  run?: RunOp;
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
    { key: "years", label: "Years", allowed: true },
  ];

  const pill = (cls: string, text: string) => (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", cls)}>
      {text}
    </span>
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <SmartBack
        fallback="/performance"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Org performance
      </SmartBack>

      {/* ------------------------------------------------ header */}
      <div className="flex flex-wrap items-start gap-3">
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
            {composite && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(109,40,217,0.10)] px-2.5 py-1 text-[11px] font-bold text-[color:#6D28D9]">
                <Layers size={11} strokeWidth={2.4} /> Adds up from{" "}
                {components.length} bookings, nobody enters it directly
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            {composite
              ? "New business + existing-business expansion + renewals. People log results on the three bookings below; this number is only their sum."
              : "Verified results only; claims still waiting for a group owner never count."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
            Verified so far
          </p>
          <p className="text-[28px] font-extrabold tracking-[-0.02em] tnum">
            {fmtAmount(goal.unit, yearVerified)}
            {yearTarget > 0 && (
              <span className="text-[15px] font-semibold text-text-tertiary">
                {" "}
                of {fmtAmount(goal.unit, yearTarget)}
              </span>
            )}
          </p>
          {yearAwaiting > 0 ? (
            <span className="mt-1 inline-block rounded-full bg-[rgba(180,83,9,0.12)] px-2.5 py-0.5 text-[11px] font-bold text-[color:#B45309] tnum">
              {fmtAmount(goal.unit, yearAwaiting)} awaiting verification
            </span>
          ) : (
            yearTarget === 0 && (
              <span className="mt-1 inline-block rounded-full bg-[rgba(0,113,227,0.10)] px-2.5 py-0.5 text-[11px] font-bold text-blue-primary">
                No target set yet
              </span>
            )
          )}
        </div>
      </div>

      {/* ------------------------------------------------ component cards */}
      {composite && (
        <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
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
                  <b className="text-[13.5px] text-text-primary">{c.name}</b>
                  <span className="ml-auto rounded-full bg-[rgba(0,113,227,0.10)] px-2 py-0.5 text-[10.5px] font-bold text-blue-primary">
                    ✍️ people enter here
                  </span>
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
                    <span className="ml-2 align-middle text-[11px] font-bold text-[color:#B45309] tnum">
                      +{fmtAmount(c.unit, cAwaiting)} waiting
                    </span>
                  )}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
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

      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.62fr_1fr]">
        {/* ------------------------------- periods as blocks + focused drill */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <b className="shrink-0 whitespace-nowrap text-[14px] text-text-primary">
              Period by period
            </b>
            <span className="min-w-0 truncate text-[11px] text-text-tertiary">
              pick a block, then read it by group and by person
            </span>
            <span className="ml-auto inline-flex shrink-0 overflow-hidden rounded-lg border border-border-light bg-white">
              {grans
                .filter((g) => g.allowed)
                .map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => {
                      setGran(g.key);
                      setSelected(null);
                      setOpenGroup(null);
                    }}
                    className={cn(
                      "cursor-pointer border-r border-border-light px-3.5 py-1.5 text-[12px] font-semibold transition-colors last:border-r-0",
                      gran === g.key
                        ? "bg-[rgba(0,113,227,0.10)] text-blue-primary"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
            </span>
          </div>

          {/* the blocks: one compact square per period, never a full-width list
              (Suren: "don't use this entire space only once... one block, year
              one, year two, year three") */}
          <div
            key={`${gran}-${fy}`}
            className={cn(
              "tab-panel mt-3 grid gap-2",
              gran === "months"
                ? "grid-cols-3 sm:grid-cols-4 xl:grid-cols-6"
                : gran === "weeks"
                  ? "grid-cols-2 sm:grid-cols-5"
                  : "grid-cols-2 sm:grid-cols-5"
            )}
          >
            {rows.map((r, i) => {
              const active = (selected ?? rows.findIndex((x) => x.isNow)) === i;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setOpenGroup(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-xl border p-2.5 text-left transition-all",
                    active
                      ? "border-blue-primary bg-[rgba(0,113,227,0.05)] shadow-[0_6px_18px_-10px_rgba(0,60,120,0.35)]"
                      : "border-border-light bg-white hover:border-blue-subtle"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <b className="truncate text-[12px] text-text-primary">
                      {gran === "weeks" ? r.label.replace("Week ", "") : r.label}
                    </b>
                    {r.isNow && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-primary" title="current" />
                    )}
                  </span>
                  <span className="mt-1 block text-[13px] font-extrabold tnum">
                    {r.verified > 0 ? fmtAmount(goal.unit, r.verified) : "–"}
                  </span>
                  <span className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-surface">
                    <span className="h-full bg-[#16A34A]" style={{ width: `${(r.verified / maxRow) * 100}%` }} />
                    <span className="h-full bg-[#B45309]/60" style={{ width: `${(r.awaiting / maxRow) * 100}%` }} />
                  </span>
                  <span className="mt-1 block text-[9.5px] font-semibold tnum">
                    {r.waitingCount > 0 ? (
                      <span className="text-[color:#B45309]">
                        {fmtAmount(goal.unit, r.awaiting)} waiting
                      </span>
                    ) : r.verified > 0 ? (
                      <span className="text-[color:#16A34A]">all verified</span>
                    ) : (
                      <span className="text-text-tertiary">{r.ended ? "nothing logged" : "open"}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* the focused period, read by group then by person, without leaving
              (Suren: "I need to see the group, and I also need to see person,
              but not lose focus") */}
          {(() => {
            const idx = selected ?? rows.findIndex((x) => x.isNow);
            const row = rows[idx] ?? null;
            if (!row) return null;
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
            const maxG = Math.max(1, ...inPeriodGroups.map((r2) => r2.verified));
            return (
              <div key={`${gran}-${idx}`} className="tab-panel mt-4 rounded-xl border border-border-light bg-surface/40 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[12.5px] text-text-primary">
                    {row.label}
                    {row.sub ? <span className="ml-1.5 font-normal text-text-tertiary">{row.sub}</span> : null}
                  </b>
                  <span className="text-[11px] text-text-tertiary">by group, best first</span>
                  <span className="ml-auto text-[12px] font-bold tnum">
                    {fmtAmount(goal.unit, row.verified)}
                    {row.awaiting > 0 && (
                      <span className="ml-1.5 text-[11px] font-bold text-[color:#B45309]">
                        +{fmtAmount(goal.unit, row.awaiting)} waiting
                      </span>
                    )}
                  </span>
                </div>
                {state.groups.length === 0 ? (
                  <p className="mt-2 text-[12px] text-text-secondary">
                    No groups yet. Once groups exist, this period fans out by
                    group and every group opens into its people.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-1.5">
                    {inPeriodGroups.map((r2) => {
                      const open = openGroup === r2.group.id;
                      const groupPeople = [...new Set([r2.group.head, ...r2.group.members].map((n) => n.trim()))];
                      return (
                        <div key={r2.group.id} className={cn("rounded-lg", open && "bg-white shadow-[0_4px_14px_-8px_rgba(15,23,42,0.2)]")}>
                          <button
                            type="button"
                            onClick={() => setOpenGroup(open ? null : r2.group.id)}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white"
                          >
                            <span
                              className={cn(
                                "text-[10px] text-text-tertiary transition-transform duration-200",
                                open && "rotate-90"
                              )}
                            >
                              ▶
                            </span>
                            <Avatar name={r2.group.head} className="h-6 w-6 text-[9px]" />
                            <b className="w-[190px] text-[12.5px] leading-tight text-text-primary">{r2.group.name}</b>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                              <span className="block h-full rounded-full bg-blue-primary" style={{ width: `${(r2.verified / maxG) * 100}%` }} />
                            </span>
                            <b className="w-[86px] text-right text-[12px] tnum">{fmtAmount(goal.unit, r2.verified)}</b>
                            {r2.awaiting > 0 && (
                              <span className="rounded-full bg-[rgba(180,83,9,0.12)] px-2 py-0.5 text-[10px] font-bold text-[color:#B45309] tnum">
                                +{fmtAmount(goal.unit, r2.awaiting)}
                              </span>
                            )}
                          </button>
                          {open && (
                            <div className="tab-panel space-y-1 px-2 pb-2 pl-9">
                              {groupPeople
                                .map((name) => ({
                                  name,
                                  verified: familyValue(state, goal, { range: row.range, person: name, verifiedOnly: true }),
                                  awaiting: familyValue(state, goal, { range: row.range, person: name, reportedOnly: true }),
                                }))
                                .sort((a, b) => b.verified - a.verified)
                                .map((p) => (
                                  <div key={p.name} className="flex items-center gap-2.5 py-1">
                                    <Avatar name={p.name} className="h-5 w-5 text-[8px]" />
                                    <span className="w-[176px] text-[12px] font-medium text-text-primary">
                                      {p.name}
                                      {p.name === r2.group.head && (
                                        <span className="ml-1.5 rounded-full bg-[rgba(180,49,143,0.10)] px-1.5 py-0.5 text-[8.5px] font-bold text-[color:#B4318F]">
                                          owner
                                        </span>
                                      )}
                                    </span>
                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                                      <span
                                        className="block h-full rounded-full bg-blue-primary/70"
                                        style={{ width: `${(p.verified / Math.max(1, r2.verified)) * 100}%` }}
                                      />
                                    </span>
                                    <b className="w-[80px] text-right text-[11.5px] tnum">
                                      {p.verified > 0 ? fmtAmount(goal.unit, p.verified) : "–"}
                                    </b>
                                    {p.awaiting > 0 && (
                                      <span className="rounded-full bg-[rgba(180,83,9,0.12)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:#B45309] tnum">
                                        +{fmtAmount(goal.unit, p.awaiting)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <p className="mt-3 text-[11px] leading-relaxed text-text-tertiary">
            {gran === "years"
              ? "Five financial years of history in one row."
              : `Cadences this goal allows: ${cadences.join(", ")}.`}{" "}
            Every block is only the sum of its groups, and every group of its
            people.
          </p>
        </Card>

        {/* ------------------------------------------- verification rail */}
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border-light px-4 py-2.5">
              <b className="text-[14px] text-text-primary">
                Waiting for verification
              </b>
              {waiting.length > 0 &&
                pill(
                  "bg-[rgba(180,83,9,0.12)] text-[color:#B45309]",
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
                        <p className="mt-1 pl-8 text-[10.5px] text-[color:#B45309]">
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

          <Card className="p-4">
            <div className="flex items-center gap-2">
              <b className="text-[14px] text-text-primary">Groups on this goal</b>
              <span className="ml-auto text-[10.5px] text-text-tertiary">
                verified, {fiscalLabel(fy)}
              </span>
            </div>
            {groupRows.length === 0 ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary">
                No groups yet. Once groups exist, every group&apos;s total on this
                goal lines up here, best first, and their owners become the
                people who verify.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {groupRows.map((r, i) => (
                  <div key={r.group.id} className="flex items-center gap-2.5">
                    <span className="w-[180px] text-[12px] font-semibold leading-tight">
                      {r.group.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.verified / maxGroup) * 100}%`,
                          background: COMPONENT_COLORS[i % 3],
                        }}
                      />
                    </div>
                    <b className="w-[86px] text-right text-[11.5px] tnum">
                      {fmtAmount(goal.unit, r.verified)}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
