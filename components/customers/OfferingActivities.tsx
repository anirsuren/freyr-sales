"use client";

import { useState } from "react";
import {
  Activity as ActivityIcon,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Coins,
  FileCheck2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import {
  CUSTOMER_OFFERING_ACTIVITIES,
  CUSTOMER_OFFERING_ACTIVITY_ORDER,
  CUSTOMER_OFFERING_STATUSES,
  CUSTOMER_OFFERING_STATUS_ORDER,
  defaultStatusForActivity,
} from "@/lib/customerOfferingHeatMap";
import type {
  CustomerOfferingActivity,
  CustomerOfferingCurrency,
  CustomerOfferingEngagementVersion,
  CustomerOfferingStatus,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

/**
 * ACTIVITIES ON THE OFFERING THE CUSTOMER HAS (Suren, Aug 8, via Anir): "once
 * they add an offering to the customer, for that offering you can add
 * activities… but remember, only one activity will be a current activity.
 * It's a radio button — whichever they have added, you make that the current
 * one, because that is the one that you're going to show in your heat map."
 *
 * So the list is the history and exactly one row wears the radio. Everything
 * else — the five activities, the three statuses, the date each status was
 * reached, the value and its currency — comes straight off Suren's sheet.
 */

const ACTIVITY_ICONS: Record<CustomerOfferingActivity, LucideIcon> = {
  lead: Send,
  opportunity: Target,
  pilot: CircleDot,
  contract: FileCheck2,
  delivery: Sparkles,
};

const STATUS_ICONS: Record<CustomerOfferingStatus, LucideIcon> = {
  initiated: Clock3,
  under_progress: ActivityIcon,
  completed: CheckCircle2,
};

const ACTIVITY_OPTIONS: ColorOption[] = CUSTOMER_OFFERING_ACTIVITY_ORDER.map(
  (value) => ({
    value,
    label: CUSTOMER_OFFERING_ACTIVITIES[value].label,
    color: CUSTOMER_OFFERING_ACTIVITIES[value].color,
    icon: ACTIVITY_ICONS[value],
  })
);

const STATUS_OPTIONS: ColorOption[] = CUSTOMER_OFFERING_STATUS_ORDER.map(
  (value) => ({
    value,
    label: CUSTOMER_OFFERING_STATUSES[value].label,
    color: CUSTOMER_OFFERING_STATUSES[value].color,
    icon: STATUS_ICONS[value],
  })
);

const CURRENCY_OPTIONS: ColorOption[] = [
  { value: "USD", label: "$ USD", color: "#2563EB", icon: Coins },
  { value: "EUR", label: "€ EUR", color: "#7C3AED", icon: Coins },
  { value: "GBP", label: "£ GBP", color: "#C2410C", icon: Coins },
  { value: "CHF", label: "CHF", color: "#0F766E", icon: Coins },
  { value: "INR", label: "₹ INR", color: "#EA580C", icon: Coins },
  { value: "JPY", label: "¥ JPY", color: "#B45309", icon: Coins },
  { value: "SGD", label: "S$ SGD", color: "#0369A1", icon: Coins },
  { value: "AUD", label: "A$ AUD", color: "#059669", icon: Coins },
  { value: "CAD", label: "C$ CAD", color: "#DC4C4C", icon: Coins },
];

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary";

function money(value: number, currency: CustomerOfferingCurrency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function uid() {
  return `eng-${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;
}

/** Not started yet: its start date is still in the future. */
function planned(version: CustomerOfferingEngagementVersion): boolean {
  const start = version.status_dates?.initiated || version.start_date;
  if (!start) return false;
  return start > new Date().toISOString().slice(0, 10);
}

function ActivityChip({ activity }: { activity: CustomerOfferingActivity }) {
  const meta = CUSTOMER_OFFERING_ACTIVITIES[activity];
  const Icon = ACTIVITY_ICONS[activity];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: meta.color, color: meta.text }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

function StatusChip({ status }: { status: CustomerOfferingStatus }) {
  const meta = CUSTOMER_OFFERING_STATUSES[status];
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        background: `${meta.color}14`,
      }}
    >
      <Icon size={11} strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}

export function OfferingActivities({
  versions,
  onSave,
}: {
  versions: CustomerOfferingEngagementVersion[];
  onSave: (versions: CustomerOfferingEngagementVersion[]) => void;
}) {
  /** null = closed; "" = adding; otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [activity, setActivity] = useState<CustomerOfferingActivity>("lead");
  const [status, setStatus] = useState<CustomerOfferingStatus>("initiated");
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState("");
  const [amount, setAmount] = useState("");
  /** When this activity starts. A date in the future means it has not
   *  happened yet — Suren, Aug 8: "can I also add activity that has not
   *  happened yet?" No fourth status: the date says it. */
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState<CustomerOfferingCurrency>("USD");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const current = versions.find((v) => v.linked) || null;

  function openEditor(version?: CustomerOfferingEngagementVersion) {
    setEditing(version ? version.id : "");
    setActivity(version?.activity ?? "lead");
    setStatus(version?.status ?? defaultStatusForActivity("lead"));
    setDescription(version?.activity_description ?? "");
    setComments(version?.comments ?? "");
    setAmount(version?.dollar_value ? String(version.dollar_value) : "");
    setStartDate(
      version?.status_dates?.initiated ||
        version?.start_date ||
        new Date().toISOString().slice(0, 10)
    );
    setEndDate(version?.end_date ?? "");
    setCurrency(version?.currency ?? "USD");
  }

  function save() {
    const today = new Date().toISOString().slice(0, 10);
    const chosen = startDate || today;
    const existing = versions.find((v) => v.id === editing);
    const prior = existing?.status_dates || {};
    // The date each status was reached fills itself in the moment the status
    // gets there, and keeps whatever was already recorded.
    const status_dates = {
      initiated: chosen,
      under_progress:
        prior.under_progress ??
        (status === "under_progress" || status === "completed" ? chosen : null),
      completed: prior.completed ?? (status === "completed" ? chosen : null),
    };
    const now = new Date().toISOString();
    const record: CustomerOfferingEngagementVersion = {
      id: existing?.id || uid(),
      version:
        existing?.version ??
        (versions.reduce((max, v) => Math.max(max, v.version), 0) + 1),
      // A brand-new activity becomes the current one — the newest state of
      // play is what the heat map should show.
      linked: existing ? existing.linked : true,
      activity,
      activity_description: description.trim() || null,
      comments: comments.trim() || null,
      status,
      status_dates,
      dollar_value: Math.max(0, Math.round(Number(amount) || 0)),
      currency,
      start_date: chosen,
      end_date: endDate || null,
      potential_close_date: existing?.potential_close_date ?? null,
      opportunity_ids: existing?.opportunity_ids ?? [],
      proposal_ids: existing?.proposal_ids ?? [],
      contract_ids: existing?.contract_ids ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const next = existing
      ? versions.map((v) => (v.id === record.id ? record : v))
      : versions.map((v) => ({ ...v, linked: false })).concat(record);
    onSave(next);
    setEditing(null);
  }

  function makeCurrent(id: string) {
    onSave(versions.map((v) => ({ ...v, linked: v.id === id })));
  }

  function remove(id: string) {
    setConfirmDelete(null);
    const next = versions.filter((v) => v.id !== id);
    // Never leave the customer without a current activity while any remain.
    if (next.length && !next.some((v) => v.linked)) next[0].linked = true;
    onSave(next);
  }

  return (
    <div className="mt-4 border-t border-border-light pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Activities ({versions.length})
          <InfoHint text="Every activity this customer has been through on this offering. The one marked Current is what the heat map shows." />
        </p>
        <Button variant="secondary" onClick={() => openEditor()}>
          <Plus size={13} strokeWidth={2.2} /> Add activity
        </Button>
      </div>

      {versions.length === 0 ? (
        <p className="mt-2 text-[12px] text-text-tertiary">
          No activity recorded yet. Add the first one — a lead, an opportunity,
          a pilot — and it becomes the current activity.
        </p>
      ) : (
        /* A TABLE, NOT A STACK OF CARDS. Suren, Aug 9: "this is not the way
           they will consume it… activity has to be a table, columns have to
           show up — activity name, details, status, start date, end date. I
           want them to use the table nature." */
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-light text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                <th className="py-2 pr-3 font-bold">Activity</th>
                <th className="py-2 pr-3 font-bold">Details</th>
                <th className="py-2 pr-3 font-bold">Status</th>
                <th className="py-2 pr-3 font-bold">Start</th>
                <th className="py-2 pr-3 font-bold">End</th>
                <th className="py-2 pr-3 text-right font-bold">Value</th>
                <th className="py-2 pr-2 text-center font-bold">Current</th>
                <th className="py-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((version) => {
                const dates = version.status_dates || {};
                const started = version.start_date || dates.initiated || null;
                return (
                  <tr
                    key={version.id}
                    className={`border-b border-border-light align-top last:border-0 ${
                      version.linked ? "bg-blue-light/40" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <ActivityChip activity={version.activity} />
                    </td>
                    <td className="min-w-[220px] py-2.5 pr-3">
                      <p className="text-[12.5px] leading-snug text-text-primary">
                        {version.activity_description || "—"}
                      </p>
                      {version.comments && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-text-tertiary">
                          {version.comments}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {planned(version) ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9]">
                          <CalendarClock size={11} strokeWidth={2.2} /> Planned
                        </span>
                      ) : (
                        <StatusChip status={version.status} />
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-secondary tnum">
                      {started ? formatDate(started) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-secondary tnum">
                      {version.end_date ? formatDate(version.end_date) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[12px] font-semibold text-text-primary tnum">
                      {version.dollar_value > 0
                        ? money(version.dollar_value, version.currency)
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-2 text-center">
                      <input
                        type="radio"
                        checked={!!version.linked}
                        onChange={() => makeCurrent(version.id)}
                        aria-label={`Make this the current activity`}
                        title="Show this activity in the heat map"
                        className="h-3.5 w-3.5 cursor-pointer accent-blue-primary"
                      />
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Edit this activity"
                          onClick={() => openEditor(version)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                        >
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                        {confirmDelete === version.id ? (
                          <button
                            type="button"
                            onClick={() => remove(version.id)}
                            className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                          >
                            Remove?
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Remove this activity"
                            onClick={() => setConfirmDelete(version.id)}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {current && (
        <p className="mt-2 text-[11px] text-text-tertiary">
          The heat map shows{" "}
          <span className="font-semibold text-text-secondary">
            {CUSTOMER_OFFERING_ACTIVITIES[current.activity].label}
          </span>{" "}
          for this offering.
        </p>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "" ? "Add an activity" : "Edit activity"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">
                Activity
              </label>
              <ColorSelect
                value={activity}
                onChange={(value) => {
                  const next = value as CustomerOfferingActivity;
                  setActivity(next);
                  setStatus(defaultStatusForActivity(next));
                }}
                options={ACTIVITY_OPTIONS}
                ariaLabel="Activity"
                collapsible={false}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                Status
                <InfoHint text="The date this status was reached is recorded for you, and stays editable." />
              </label>
              <ColorSelect
                value={status}
                onChange={(value) => setStatus(value as CustomerOfferingStatus)}
                options={STATUS_OPTIONS}
                ariaLabel="Status"
                collapsible={false}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">
              What is this activity?
            </label>
            <input
              autoFocus
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Pilot on two markets, run by the RA team"
              className={FIELD}
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Comments
              <InfoHint text="Anything worth remembering — who you met, what they asked for, what happens next." />
            </label>
            <textarea
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              rows={2}
              placeholder="Met their regulatory lead; they want a second market added before signing."
              className={`${FIELD} resize-y`}
            />
          </div>
          {/* AN ACTIVITY RUNS BETWEEN TWO DATES, not on one. Suren, Aug 9:
              "instead of saying when… can we have a start date and an ending?
              I want to start a lead initiation activity and I want to finish
              the end activity by this time." End is optional — something still
              running has no end yet. */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                Start date
                <InfoHint text="The day this activity starts. Put a date in the future for something planned but not started — it shows as Planned until that day." />
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                End date
                <InfoHint text="When you expect it to finish, or when it did. Leave it empty while the activity is still running." />
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">
                Value
              </label>
              <input
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                placeholder="250000"
                className={`${FIELD} tnum`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">
                Currency
              </label>
              <ColorSelect
                value={currency}
                onChange={(value) =>
                  setCurrency(value as CustomerOfferingCurrency)
                }
                options={CURRENCY_OPTIONS}
                ariaLabel="Currency"
                collapsible={false}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit">
              {editing === "" ? (
                <>
                  <Plus size={14} strokeWidth={2.2} /> Add activity
                </>
              ) : (
                <>
                  <Pencil size={14} strokeWidth={2} /> Save activity
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
