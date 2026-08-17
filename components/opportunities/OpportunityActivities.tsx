"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  FileCheck2,
  Loader,
  Play,
  Plus,
  Send,
  Sparkles,
  Tag,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import {
  ActivityGoalPrompt,
  type PromptGoal,
} from "@/components/customers/ActivityGoalPrompt";
import {
  masterFor,
  statusCounts,
  type ActivityMasterState,
} from "@/lib/activityMasterShared";
import type {
  Opportunity,
  OpportunityActivity,
} from "@/lib/opportunitiesShared";

/**
 * ACTIVITIES ON THE DEAL (Suren, Aug 17 answers: "the activity on the
 * opportunity is done by the sales guy — you should have an activity at the
 * opportunity level… the data entry should be in the opportunity page").
 *
 * Same vocabulary as everywhere: the master's activities, three statuses.
 * When a save crosses the master's counts-from threshold, the SAME goal
 * prompt the customer page uses appears — one screen wherever you log
 * (Suren: "the point of access can be many places but the screen is the
 * same") — with the deal's customer and money already carried in.
 */

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  lead: Send,
  opportunity: Target,
  pilot: CircleDot,
  contract: FileCheck2,
  delivery: Sparkles,
};

const STATUS_META: Record<
  OpportunityActivity["status"],
  { label: string; color: string; icon: LucideIcon }
> = {
  initiated: { label: "Initiated", color: "#0071E3", icon: Play },
  under_progress: { label: "Under progress", color: "#7C3AED", icon: Loader },
  completed: { label: "Completed", color: "#0F766E", icon: CheckCircle2 },
};

type Bridge = {
  master: ActivityMasterState;
  goals: PromptGoal[];
  meName: string;
  people: string[];
};

export function OpportunityActivities({
  opportunity,
  canEdit,
  onSaved,
}: {
  opportunity: Opportunity;
  canEdit: boolean;
  onSaved: (o: Opportunity) => void;
}) {
  const { toast } = useToast();
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    activity: "",
    status: "initiated",
    person: "",
    note: "",
  });
  const [prompt, setPrompt] = useState<{ activity: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/activity-master", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.state) {
          setBridge({
            master: d.state,
            goals: d.goals ?? [],
            meName: d.me?.name ?? "",
            people: Array.isArray(d.people) ? d.people : [],
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const acts = opportunity.activities ?? [];
  const roster =
    bridge && bridge.people.length > 0
      ? bridge.people
      : bridge?.meName
        ? [bridge.meName]
        : [];

  async function persist(
    next: OpportunityActivity[],
    touched: OpportunityActivity,
    prevStatus: string | null
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "update",
          id: opportunity.id,
          activities: next,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      onSaved(data.opportunity);
      setLogOpen(false);
      setDraft({ activity: "", status: "initiated", person: "", note: "" });
      // Crossed the master's counting line just now → the same goal prompt
      // the customer page shows. Never automatic beyond the OFFER (Suren:
      // "users should say that I want to add it to this — I don't want to
      // automate this").
      if (bridge) {
        const entry = masterFor(bridge.master, touched.activity);
        if (
          entry &&
          entry.contribution !== "none" &&
          statusCounts(touched.status, entry.countsFrom) &&
          !(prevStatus && statusCounts(prevStatus, entry.countsFrom)) &&
          entry.goalIds.some((id) => bridge.goals.some((g) => g.id === id))
        ) {
          setPrompt({ activity: touched.activity });
        }
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col-span-2 min-w-0 sm:col-span-4">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        Activities
      </span>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {acts.map((a) => {
          const entry = bridge ? masterFor(bridge.master, a.activity) : null;
          const color = entry?.color ?? "#8E98A8";
          const label = entry?.label ?? a.activity;
          const Icon = ACTIVITY_ICONS[a.activity] ?? Tag;
          const sMeta = STATUS_META[a.status];
          return (
            <span
              key={a.id}
              title={a.note || undefined}
              className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white py-1 pl-1.5 pr-2.5"
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: `${color}16`, color }}
              >
                <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
                {label}
              </span>
              {canEdit && bridge ? (
                <ColorSelect
                  value={a.status}
                  ariaLabel={`Status of ${label}`}
                  collapsible={false}
                  dense
                  minWidth={140}
                  onChange={(v) => {
                    if (v === a.status) return;
                    const nextAct = {
                      ...a,
                      status: v as OpportunityActivity["status"],
                      date: new Date().toISOString().slice(0, 10),
                    };
                    void persist(
                      acts.map((x) => (x.id === a.id ? nextAct : x)),
                      nextAct,
                      a.status
                    );
                  }}
                  options={(
                    Object.keys(STATUS_META) as OpportunityActivity["status"][]
                  ).map((k) => ({
                    value: k,
                    label: STATUS_META[k].label,
                    color: STATUS_META[k].color,
                    icon: STATUS_META[k].icon,
                  }))}
                />
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold"
                  style={{ color: sMeta.color }}
                >
                  <sMeta.icon size={11} strokeWidth={2.5} aria-hidden="true" />
                  {sMeta.label}
                </span>
              )}
              {a.person && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                  <Avatar name={a.person} className="h-4 w-4 text-[6px]" />
                  {a.person}
                </span>
              )}
              <span className="text-[10.5px] text-text-tertiary tnum">{a.date}</span>
            </span>
          );
        })}
        {acts.length === 0 && (
          <span className="text-[12px] text-text-tertiary">
            Nothing logged on this deal yet.
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setDraft({
                activity: "",
                status: "initiated",
                person: bridge?.meName ?? "",
                note: "",
              });
              setLogOpen(true);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
          >
            <Plus size={11} strokeWidth={2.6} /> Log activity
          </button>
        )}
      </div>

      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title={`Log an activity on ${opportunity.name}`}
        size="wide"
      >
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              Activity
            </label>
            <div className="mt-1">
              <ColorSelect
                value={draft.activity}
                ariaLabel="Which activity"
                collapsible={false}
                className="w-full"
                onChange={(v) => setDraft((d) => ({ ...d, activity: v }))}
                options={[
                  { value: "", label: "Pick an activity…", color: "#8E98A8" },
                  ...(bridge?.master.activities ?? []).map((a) => ({
                    value: a.id,
                    label: a.label,
                    color: a.color,
                    icon: ACTIVITY_ICONS[a.id] ?? Tag,
                  })),
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                Status
              </label>
              <div className="mt-1">
                <ColorSelect
                  value={draft.status}
                  ariaLabel="Activity status"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
                  options={(
                    Object.keys(STATUS_META) as OpportunityActivity["status"][]
                  ).map((k) => ({
                    value: k,
                    label: STATUS_META[k].label,
                    color: STATUS_META[k].color,
                    icon: STATUS_META[k].icon,
                  }))}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                Done by
              </label>
              {/* Admins pick anyone, group owners their people, everyone else
                  is themself (Suren: "otherwise the individual only"). */}
              {roster.length > 1 ? (
                <div className="mt-1">
                  <ColorSelect
                    value={draft.person}
                    ariaLabel="Who did this"
                    collapsible={false}
                    className="w-full"
                    onChange={(v) => setDraft((d) => ({ ...d, person: v }))}
                    options={roster.map((n) => ({
                      value: n,
                      label: n === bridge?.meName ? `${n} (you)` : n,
                      avatarName: n,
                    }))}
                  />
                </div>
              ) : (
                <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-text-primary">
                  <Avatar
                    name={draft.person || "?"}
                    className="h-5 w-5 text-[7px]"
                  />
                  {draft.person || "you"}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              Note <span className="font-semibold normal-case">(optional)</span>
            </label>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="e.g. Demo done, security review next"
              className="mt-1 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary focus:shadow-input-focus"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!draft.activity}
              onClick={() => {
                const now = new Date().toISOString().slice(0, 10);
                const act: OpportunityActivity = {
                  id: `act-${Date.now().toString(36)}`,
                  activity: draft.activity,
                  status: draft.status as OpportunityActivity["status"],
                  person: draft.person,
                  note: draft.note.trim() || undefined,
                  date: now,
                };
                void persist([...acts, act], act, null);
              }}
            >
              Log it
            </Button>
          </div>
        </div>
      </Modal>

      {prompt &&
        bridge &&
        (() => {
          const entry = masterFor(bridge.master, prompt.activity);
          if (!entry) return null;
          return (
            <ActivityGoalPrompt
              open
              activity={prompt.activity}
              master={entry}
              goals={bridge.goals.filter((g) => entry.goalIds.includes(g.id))}
              meName={bridge.meName}
              people={bridge.people}
              customerName={opportunity.customer}
              dollarValue={opportunity.value || undefined}
              onClose={() => setPrompt(null)}
            />
          );
        })()}
    </div>
  );
}
