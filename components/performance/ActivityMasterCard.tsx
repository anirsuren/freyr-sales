"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  DollarSign,
  FileCheck2,
  Hash,
  Loader,
  MinusCircle,
  PenLine,
  Play,
  Plus,
  Send,
  Sparkles,
  Tag,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { typeMeta } from "./bits";
import {
  CONTRIBUTION_META,
  CONTRIBUTIONS,
  COUNTS_FROM,
  COUNTS_FROM_META,
  type ActivityMasterState,
  type MasterActivity,
} from "@/lib/activityMasterShared";

/**
 * THE ACTIVITY MASTER, on the Goal Master tab.
 *
 * Suren, Aug 17: "I think we should keep a master list of these activities…
 * for an activity, for example, if somebody says contract, then against that
 * activity, you can have those goals… whatever goal is connected to that
 * particular activity, that goal automatically gets connected. They don't
 * have to enter."
 *
 * Each row is one activity: what it is, how it counts (the dollar value, or
 * one each — "item value, dollar value, that's all"), and the goals it feeds.
 * Connect Contract to both booking goals and the person logging the contract
 * picks which one, exactly his New vs Existing example.
 *
 * It sits under the goal list because it is the same kind of thing: entered
 * in one place, read everywhere. Managers and admins edit; everyone else sees
 * where the numbers come from.
 */

/** The same icons the customer page gives these activities. */
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  lead: Send,
  opportunity: Target,
  pilot: CircleDot,
  contract: FileCheck2,
  delivery: Sparkles,
};

const CONTRIBUTION_STYLE: Record<
  string,
  { color: string; icon: LucideIcon }
> = {
  dollar: { color: "#0071E3", icon: DollarSign },
  count: { color: "#7C3AED", icon: Hash },
  typed: { color: "#0F766E", icon: PenLine },
  none: { color: "#8E98A8", icon: MinusCircle },
};

/** When the activity starts counting — Suren's "a pilot in progress should
 *  count as one" lives in this control. */
const COUNTS_FROM_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  initiated: { color: "#0071E3", icon: Play },
  under_progress: { color: "#7C3AED", icon: Loader },
  completed: { color: "#0F766E", icon: CheckCircle2 },
};

export function ActivityMasterCard({
  goals,
  live,
  isAdmin,
}: {
  goals: { id: string; name: string; year: number; type: string }[];
  live: boolean;
  /** Only admins change the master (Suren, Aug 17: "yes exactly"). */
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<ActivityMasterState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<MasterActivity | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/activity-master", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setState(d.state))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const goalById = useMemo(
    () => new Map(goals.map((g) => [g.id, g])),
    [goals]
  );

  const writable = live && isAdmin;

  async function post(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/activity-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      setState(data.state);
      if (done) toast(done);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-4 py-3">
        <b className="text-[13.5px] text-text-primary">Activity master</b>
        <InfoHint text={"Which goal each activity feeds, and how it counts.\nLog a Contract on a customer and its dollar value goes toward the connected goal, credited to whoever logged it. A Pilot adds 1 to a count goal.\nConnect several goals and the person picks one when logging."} />
        <span className="ml-auto text-[11.5px] text-text-tertiary">
          {writable
            ? "Changes apply the next time anyone logs an activity"
            : live
              ? "Admins edit this list"
              : "Sample data — switch to Real mode to change the master"}
        </span>
      </div>

      {failed ? (
        <p className="px-4 py-5 text-[12.5px] text-text-secondary">
          The activity master could not load. Refresh to retry.
        </p>
      ) : !state ? (
        <p className="px-4 py-5 text-[12.5px] text-text-secondary">Loading…</p>
      ) : (
        <div className="divide-y divide-border-light">
          {state.activities.map((a) => {
            const Icon = ACTIVITY_ICONS[a.id] ?? Tag;
            const cMeta = CONTRIBUTION_STYLE[a.contribution];
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                {/* The activity, wearing its heat-map colour and icon. */}
                <span
                  className="inline-flex w-[128px] shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold"
                  style={{ background: `${a.color}16`, color: a.color }}
                >
                  <Icon size={12.5} strokeWidth={2.4} aria-hidden="true" />
                  <span className="truncate">{a.label}</span>
                </span>

                {/* How it counts. */}
                {writable ? (
                  <ColorSelect
                    value={a.contribution}
                    ariaLabel={`How ${a.label} counts`}
                    collapsible={false}
                    minWidth={190}
                    onChange={(v) =>
                      void post(
                        { op: "update", id: a.id, contribution: v },
                        `${a.label} now counts as ${CONTRIBUTION_META[v as keyof typeof CONTRIBUTION_META]?.label.toLowerCase() ?? v}`
                      )
                    }
                    options={CONTRIBUTIONS.map((c) => ({
                      value: c,
                      label: CONTRIBUTION_META[c].label,
                      description: CONTRIBUTION_META[c].hint,
                      color: CONTRIBUTION_STYLE[c].color,
                      icon: CONTRIBUTION_STYLE[c].icon,
                    }))}
                  />
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: `${cMeta.color}16`, color: cMeta.color }}
                  >
                    <cMeta.icon size={11} strokeWidth={2.6} aria-hidden="true" />
                    {CONTRIBUTION_META[a.contribution].label}
                  </span>
                )}

                {/* WHEN it starts counting. A contract counts only once it's
                    completed; a pilot already counts while under progress. */}
                {a.contribution !== "none" &&
                  (writable ? (
                    <ColorSelect
                      value={a.countsFrom}
                      ariaLabel={`When ${a.label} starts counting`}
                      collapsible={false}
                      minWidth={196}
                      onChange={(v) =>
                        void post(
                          { op: "update", id: a.id, countsFrom: v },
                          `${a.label} counts ${COUNTS_FROM_META[v as keyof typeof COUNTS_FROM_META]?.label.toLowerCase() ?? v}`
                        )
                      }
                      options={COUNTS_FROM.map((c) => ({
                        value: c,
                        label: COUNTS_FROM_META[c].label,
                        color: COUNTS_FROM_STYLE[c].color,
                        icon: COUNTS_FROM_STYLE[c].icon,
                      }))}
                    />
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        background: `${COUNTS_FROM_STYLE[a.countsFrom].color}16`,
                        color: COUNTS_FROM_STYLE[a.countsFrom].color,
                      }}
                    >
                      {(() => {
                        const I = COUNTS_FROM_STYLE[a.countsFrom].icon;
                        return <I size={11} strokeWidth={2.6} aria-hidden="true" />;
                      })()}
                      {COUNTS_FROM_META[a.countsFrom].label}
                    </span>
                  ))}

                {/* The goals it feeds. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {a.goalIds.map((gid) => {
                    const g = goalById.get(gid);
                    if (!g) return null;
                    const t = typeMeta(g.type);
                    return (
                      <span
                        key={gid}
                        className="inline-flex max-w-[240px] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: `${t.color}14`, color: t.color }}
                      >
                        <t.icon size={10.5} strokeWidth={2.5} aria-hidden="true" />
                        <span className="truncate">{g.name}</span>
                        {writable && (
                          <button
                            type="button"
                            aria-label={`Disconnect ${g.name} from ${a.label}`}
                            disabled={busy}
                            onClick={() =>
                              void post(
                                {
                                  op: "update",
                                  id: a.id,
                                  goalIds: a.goalIds.filter((x) => x !== gid),
                                },
                                `${g.name} disconnected from ${a.label}`
                              )
                            }
                            className="cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                          >
                            <X size={10.5} strokeWidth={2.8} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {a.goalIds.length === 0 && (
                    <span className="text-[11.5px] text-text-tertiary">
                      {a.contribution === "none"
                        ? "Feeds no goal"
                        : "No goal connected yet — logging this counts toward nothing"}
                    </span>
                  )}
                  {writable && (
                    <ColorSelect
                      value=""
                      ariaLabel={`Connect a goal to ${a.label}`}
                      collapsible={false}
                      compactTrigger
                      triggerLabel="＋ Connect a goal"
                      minWidth={300}
                      onChange={(v) => {
                        if (!v || a.goalIds.includes(v)) return;
                        const g = goalById.get(v);
                        void post(
                          { op: "update", id: a.id, goalIds: [...a.goalIds, v] },
                          g ? `${a.label} now feeds ${g.name}` : undefined
                        );
                      }}
                      options={[
                        { value: "", label: "＋ Connect a goal", color: "#8E98A8" },
                        ...goals
                          .filter((g) => !a.goalIds.includes(g.id))
                          .map((g) => ({
                            value: g.id,
                            label: g.name,
                            description: String(g.year),
                            color: typeMeta(g.type).color,
                            icon: typeMeta(g.type).icon,
                          })),
                      ]}
                    />
                  )}
                </span>

                {writable && !a.builtIn && (
                  <button
                    type="button"
                    title={`Remove ${a.label}`}
                    aria-label={`Remove ${a.label}`}
                    disabled={busy}
                    onClick={() => setConfirmRemove(a)}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}

          {writable && (
            <form
              className="flex flex-wrap items-center gap-2 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                const label = newLabel.trim();
                if (!label) return;
                void post({ op: "add", label }, `${label} added to the master`).then(
                  (ok) => ok && setNewLabel("")
                );
              }}
            >
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Add an activity, e.g. Renewal"
                className="h-[36px] w-[240px] rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary"
              />
              <button
                type="submit"
                disabled={busy || !newLabel.trim()}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-3 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:opacity-50"
              >
                <Plus size={12} strokeWidth={2.4} /> Add
              </button>
              <span className="text-[11px] text-text-tertiary">
                The five built-ins stay — history is written in them.
              </span>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (!confirmRemove) return;
          void post(
            { op: "remove", id: confirmRemove.id },
            `${confirmRemove.label} removed`
          ).then((ok) => ok && setConfirmRemove(null));
        }}
        busy={busy}
        title={`Remove ${confirmRemove?.label ?? "this activity"}?`}
        body="Anything already logged with it keeps its history; it just stops being offered when people log new activities."
        confirmLabel="Remove"
      />
    </Card>
  );
}
