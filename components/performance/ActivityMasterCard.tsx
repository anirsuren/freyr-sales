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
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MultiPicker } from "@/components/ui/MultiPicker";
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
  goals: {
    id: string;
    name: string;
    year: number;
    type: string;
    /** The goal's annual target and what is achieved so far, ALL sources. */
    target?: number;
    actual?: number;
  }[];
  live: boolean;
  /** Only admins change the master (Suren, Aug 17: "yes exactly"). */
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<ActivityMasterState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
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
        <span className="ml-auto">
          {writable ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={14} strokeWidth={2.2} /> New activity
            </Button>
          ) : (
            <span className="text-[11.5px] text-text-tertiary">
              {live ? "Admins edit this list" : "Sample data — switch to Real mode to change the master"}
            </span>
          )}
        </span>
      </div>

      {failed ? (
        <p className="px-4 py-5 text-[12.5px] text-text-secondary">
          The activity master could not load. Refresh to retry.
        </p>
      ) : !state ? (
        <p className="px-4 py-5 text-[12.5px] text-text-secondary">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          {/* A TABLE, NOT A PILE (Anir, Aug 17: "I'm lost. This is
              horrible."): four aligned columns, one slim row per activity,
              the explanations live in the headers instead of inside every
              control. */}
          {/* ACTIVITIES ARE THE COLUMNS (Anir, Aug 17: "make these columns
              instead of rows — don't we have a heatmap of this?"): the same
              orientation as the customer heat map, activities across the top,
              their rules down the side. */}
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border-light">
                <th className="w-[150px] px-4 py-2.5" />
                {state.activities.map((a) => {
                  const Icon = ACTIVITY_ICONS[a.id] ?? Tag;
                  return (
                    <th key={a.id} className="border-l border-border-light px-3 py-2.5 text-left">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold"
                          style={{ background: `${a.color}16`, color: a.color }}
                        >
                          <Icon size={12.5} strokeWidth={2.4} aria-hidden="true" />
                          <span className="truncate">{a.label}</span>
                        </span>
                        {writable && !a.builtIn && (
                          <button
                            type="button"
                            title={`Remove ${a.label}`}
                            aria-label={`Remove ${a.label}`}
                            disabled={busy}
                            onClick={() => setConfirmRemove(a)}
                            className="cursor-pointer rounded-md p-1 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
                          >
                            <Trash2 size={12} strokeWidth={2.2} />
                          </button>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              <tr>
                <td className="px-4 py-3 align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    How it counts
                    <InfoHint text={"Counts as 1 — each one adds one; a pilot done is 1, the next is 2.\nDollar value — the activity's money is the number.\nPerson types the number — whoever logs it types how much it adds.\nNot counted — logged for the record only."} />
                  </span>
                </td>
                {state.activities.map((a) => {
                  const cMeta = CONTRIBUTION_STYLE[a.contribution];
                  return (
                    <td key={a.id} className="border-l border-border-light px-3 py-3 align-middle">
                      {writable ? (
                        <ColorSelect
                          value={a.contribution}
                          ariaLabel={`How ${a.label} counts`}
                          collapsible={false}
                          dense
                          minWidth={150}
                          className="w-full"
                          onChange={(v) =>
                            void post(
                              { op: "update", id: a.id, contribution: v },
                              `${a.label} now counts as ${CONTRIBUTION_META[v as keyof typeof CONTRIBUTION_META]?.label.toLowerCase() ?? v}`
                            )
                          }
                          options={CONTRIBUTIONS.map((c) => ({
                            value: c,
                            label: CONTRIBUTION_META[c].label,
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
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="px-4 py-3 align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    Counts from
                    <InfoHint text={"The status at which it starts counting. A contract counts only when completed; a pilot already counts while under progress."} />
                  </span>
                </td>
                {state.activities.map((a) => {
                  const fMeta = COUNTS_FROM_STYLE[a.countsFrom];
                  return (
                    <td key={a.id} className="border-l border-border-light px-3 py-3 align-middle">
                      {a.contribution === "none" ? (
                        <span className="text-[12px] text-text-tertiary">—</span>
                      ) : writable ? (
                        <ColorSelect
                          value={a.countsFrom}
                          ariaLabel={`When ${a.label} starts counting`}
                          collapsible={false}
                          dense
                          minWidth={150}
                          className="w-full"
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
                          style={{ background: `${fMeta.color}16`, color: fMeta.color }}
                        >
                          {(() => {
                            const I = fMeta.icon;
                            return <I size={11} strokeWidth={2.6} aria-hidden="true" />;
                          })()}
                          {COUNTS_FROM_META[a.countsFrom].label}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="px-4 py-3 align-top text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    Goals it may feed
                    <InfoHint text={"The allowed list. Whoever logs the activity picks ONE goal from it — connect several and they choose at logging time."} />
                  </span>
                </td>
                {state.activities.map((a) => (
                  <td key={a.id} className="border-l border-border-light px-3 py-3 align-top">
                    <span className="flex min-w-0 flex-col items-start gap-1.5">
                      {a.goalIds.map((gid) => {
                        const g = goalById.get(gid);
                        if (!g) return null;
                        const t = typeMeta(g.type);
                        const pct =
                          g.target && g.target > 0
                            ? Math.min(100, Math.round(((g.actual ?? 0) / g.target) * 100))
                            : null;
                        return (
                          <span
                            key={gid}
                            title={
                              pct === null
                                ? `${g.name} — no target set yet`
                                : `${g.name} is ${pct}% filled overall — all sources, not just ${a.label}`
                            }
                            className="inline-flex max-w-full flex-col gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                            style={{ background: `${t.color}14`, color: t.color }}
                          >
                            <span className="flex items-center gap-1">
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
                            {pct !== null && (
                              <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-white/70">
                                <span
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{ width: `${pct}%`, background: t.color }}
                                />
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {a.goalIds.length === 0 && (!writable || a.contribution === "none") && (
                        <span className="text-[11.5px] text-text-tertiary">—</span>
                      )}
                      {writable && a.contribution !== "none" && (
                        <span className="w-full max-w-[190px]">
                          <MultiPicker
                            variant="dropdown"
                            single
                            side="right"
                            ariaLabel={`Connect a goal to ${a.label}`}
                            placeholder="＋ Connect a goal"
                            emptyLabel="No goals on the master yet."
                            selected={[]}
                            onToggle={(id) => {
                              if (!id || a.goalIds.includes(id)) return;
                              const g = goalById.get(id);
                              void post(
                                { op: "update", id: a.id, goalIds: [...a.goalIds, id] },
                                g ? `${a.label} now feeds ${g.name}` : undefined
                              );
                            }}
                            options={goals
                              .filter((g) => !a.goalIds.includes(g.id))
                              .map((g) => ({
                                id: g.id,
                                label: g.name,
                                sub: String(g.year),
                                color: typeMeta(g.type).color,
                                icon: typeMeta(g.type).icon,
                                group: g.type || "Other",
                              }))}
                          />
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>


        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setNewLabel("");
        }}
        title="New activity"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const label = newLabel.trim();
            if (!label) return;
            void post({ op: "add", label }, `${label} added to the master`).then(
              (ok) => {
                if (ok) {
                  setNewLabel("");
                  setAddOpen(false);
                }
              }
            );
          }}
        >
          <label className="block text-[12px] font-semibold text-text-primary">
            What is the activity called?
          </label>
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Renewal"
            className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary focus:shadow-input-focus"
          />
          <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
            It joins the table as its own column — set how it counts, from
            which status, and the goals it may feed right after.
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !newLabel.trim()} loading={busy}>
              Add it
            </Button>
          </div>
        </form>
      </Modal>

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
