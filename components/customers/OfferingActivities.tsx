"use client";

import { useState } from "react";
import {
  Activity as ActivityIcon,
  CalendarClock,
  Check,
  Circle,
  CircleAlert,
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { DateField } from "@/components/ui/DateField";
import { InfoHint } from "@/components/ui/InfoHint";
import { useOpportunities } from "@/lib/useOpportunities";
import { Tooltip } from "@/components/ui/Tooltip";
import { MultiPicker } from "@/components/ui/MultiPicker";
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
  { value: "JPY", label: "¥ JPY", color: "#C2410C", icon: Coins },
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

export function ActivityChip({ activity }: { activity: CustomerOfferingActivity }) {
  const meta = CUSTOMER_OFFERING_ACTIVITIES[activity];
  const Icon = ACTIVITY_ICONS[activity];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: meta.color, color: meta.text }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

export function StatusChip({ status }: { status: CustomerOfferingStatus }) {
  const meta = CUSTOMER_OFFERING_STATUSES[status];
  const Icon = STATUS_ICONS[status];
  return (
    <span
      // whitespace-nowrap because "Under progress" was folding onto a second
      // line inside a narrow column and dragging the whole row taller than its
      // neighbours (Anir, Aug 9: "the status should appear on one line no
      // matter what"). The table scrolls sideways instead, which he confirmed
      // is fine: "you can scroll within this thing, it's okay to scroll
      // horizontally".
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
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
  onSave: (
    versions: CustomerOfferingEngagementVersion[],
    /** The record just written by the editor — the activity-goal hook reads
     *  it. Absent on make-current and remove, which change no status. */
    touched?: CustomerOfferingEngagementVersion,
    /** Its status before this save (null = brand new), so the hook can tell
     *  whether the master's counting threshold was newly reached. */
    prevStatus?: string | null
  ) => void;
}) {
  /** null = closed; "" = adding; otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Which deals this activity belongs to (Suren, Aug 16: "offering,
   *  opportunity and then activity — you need to connect all three"). The
   *  record already carried these ids; nothing here could pick them. */
  const [opportunityIds, setOpportunityIds] = useState<string[]>([]);
  const { opportunities: pipeline } = useOpportunities();
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
    setOpportunityIds([...(version?.opportunity_ids ?? [])]);
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
      opportunity_ids: opportunityIds,
      proposal_ids: existing?.proposal_ids ?? [],
      contract_ids: existing?.contract_ids ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const next = existing
      ? versions.map((v) => (v.id === record.id ? record : v))
      : versions.map((v) => ({ ...v, linked: false })).concat(record);
    // The hook cares whether a status is NEW news — the master decides which
    // status starts counting (Suren: "a pilot in progress should count as
    // one"), so every transition goes up with its prior status and the hook
    // compares both against the threshold. Re-saving unchanged must not offer
    // to count the same thing twice.
    onSave(
      next,
      record.status !== (existing?.status ?? null) ? record : undefined,
      existing?.status ?? null
    );
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
    <div>
      {/* NOTHING BETWEEN THE OFFERING AND ITS COLUMNS (Anir, Aug 9: "you can
          just start with the column immediately… have the table start
          immediately underneath the offering", then "fix all that space").
          Two things used to sit in that gap: an ACTIVITIES (1) band that
          repeated the strip above it, and a full-width row holding nothing but
          a right-aligned + — a whole row's height spent on one button, which
          is what left the card looking half empty. The heading is gone and the
          + now lives in the table's own action column, directly above the
          per-row pencils, so adding and editing share one lane and the first
          activity sits right under the offering name. */}
      {versions.length === 0 ? (
        /* NOT A SUGGESTION (Anir, Aug 9: "make it more clear they have to add
           an activity here, it shouldn't be optional"). Grey body text read as
           a note you could scroll past. Without an activity this offering is
           invisible on the heat map and in every report, so the empty state
           now says that plainly and puts the button inside it. */
        <div className="rounded-xl border border-dashed border-[rgba(180,49,143,0.4)] bg-[rgba(180,49,143,0.04)] px-4 py-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(180,49,143,0.12)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-[color:#B4318F]">
            <CircleAlert size={12} strokeWidth={2.4} /> Needed
          </span>
          <p className="mt-2 text-[13px] font-semibold text-text-primary">
            This offering needs an activity.
          </p>
          <p className="mx-auto mt-0.5 max-w-[460px] text-[12px] leading-snug text-text-secondary">
            Until you add one, this account does not show up for this
            offering on the heat map or in any report. Add where it stands
            today, a lead, an opportunity, a pilot.
          </p>
          <span className="mt-3 inline-flex">
            <Button onClick={() => openEditor()}>
              <Plus size={13} strokeWidth={2.2} /> Add the first activity
            </Button>
          </span>
        </div>
      ) : (
        /* A TABLE, NOT A STACK OF CARDS. Suren, Aug 9: "this is not the way
           they will consume it… activity has to be a table, columns have to
           show up — activity name, details, status, start date, end date. I
           want them to use the table nature." */
        <div className="overflow-x-auto">
          {/* The min-width only has to be wide enough that no chip wraps; past that
             it invents a scrollbar for a table that already fits (Anir, Aug 9:
             "it looks like you don't even need the horizontal scroll on the
             table, you're fitting it properly"). */}
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border-light text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                <th className="w-[132px] py-2 pr-3 font-bold">Activity</th>
                <th className="w-[300px] py-2 pr-3 font-bold">Details</th>
                <th className="w-[136px] py-2 pr-3 font-bold">Status</th>
                <th className="w-[184px] py-2 pr-3 font-bold">Dates</th>
                <th className="w-[104px] py-2 pr-3 font-bold">Value</th>
                <th className="w-[140px] py-2 pr-2 font-bold">Current</th>
                {/* A NAMED COLUMN, NOT A FLOATING BUTTON (Anir, Aug 13: "this
                    seems like a weird place to have the plus sign… and then
                    there should be an actions column"). The pencil and the bin
                    sit under a header that says what they are; adding moved to
                    the footer row below, where a table normally puts it. */}
                <th className="w-[88px] py-2 pr-1 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((version) => {
                const dates = version.status_dates || {};
                const started = version.start_date || dates.initiated || null;
                return (
                  <tr
                    key={version.id}
                    className={`border-b border-border-light align-middle transition-colors last:border-0 ${
                      version.linked ? "bg-blue-light/40" : "hover:bg-surface/70"
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <ActivityChip activity={version.activity} />
                    </td>
                    <td className="min-w-[220px] py-2.5 pr-3">
                      <p className="text-[12.5px] leading-snug text-text-primary">
                        {version.activity_description || "No details"}
                      </p>
                      {version.comments && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-text-tertiary">
                          {version.comments}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {planned(version) ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9]">
                          <CalendarClock size={11} strokeWidth={2.2} /> Planned
                        </span>
                      ) : (
                        <StatusChip status={version.status} />
                      )}
                    </td>
                    {/* ONE DATES COLUMN, NOT TWO (Anir, Aug 9: "this is really
                        ugly"). Two narrow columns turned every unfinished row
                        into "Not set" stacked over "Not set", each wrapping
                        onto a second line and pushing the row taller than the
                        one beside it. A date range is one fact, so it reads as
                        one. */}
                    <td className="whitespace-nowrap py-2.5 pr-3 text-[12px] text-text-secondary tnum">
                      {started ? (
                        <>
                          {formatDate(started)}
                          <span className="px-1 text-text-tertiary">to</span>
                          {version.end_date ? (
                            formatDate(version.end_date)
                          ) : (
                            <span className="text-text-tertiary">open</span>
                          )}
                        </>
                      ) : (
                        <span className="text-text-tertiary">No dates yet</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-[12px] font-semibold text-text-primary tnum">
                      {version.dollar_value > 0 ? (
                        money(version.dollar_value, version.currency)
                      ) : (
                        <span className="font-normal text-text-tertiary">
                          No value
                        </span>
                      )}
                    </td>
                    {/* A BARE RADIO SAID NOTHING. It is the control that
                        decides what the heat map shows, so it now names itself
                        in both states instead of leaving a naked dot in a
                        column headed "Current". */}
                    <td className="py-2.5 pr-2">
                      {version.linked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-primary px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.03em] text-white">
                          <Check size={10} strokeWidth={3} /> Current
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makeCurrent(version.id)}
                          title="Show this activity in the heat map"
                          // whitespace-nowrap: "Make current" was breaking
                          // across two lines and making its row taller than the
                          // one above it (Anir, Aug 9: "the make current button
                          // is bad, it can't be on 2 lines").
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-[10.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
                        >
                          <Circle size={10} strokeWidth={2.4} /> Make current
                        </button>
                      )}
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
                        <button
                          type="button"
                          aria-label="Remove this activity"
                          onClick={() => setConfirmDelete(version.id)}
                          className="text-[color:#DC2626] flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                        <ConfirmDialog
                          open={confirmDelete === version.id}
                          onClose={() => setConfirmDelete(null)}
                          onConfirm={() => remove(version.id)}
                          title="Remove this activity?"
                          body={`Attempt ${version.version} comes off this offering's activity log.`}
                          confirmLabel="Remove activity"
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Where a table adds a row: the last line of the table itself,
                full width, reading as an action rather than as data. */}
            <tfoot>
              <tr>
                <td colSpan={7} className="pt-2">
                  <button
                    type="button"
                    onClick={() => openEditor()}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-light py-2 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light/40"
                  >
                    <Plus size={14} strokeWidth={2.4} /> Add activity
                  </button>
                </td>
              </tr>
            </tfoot>
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
        /* Same clothes as every other editor — the 440px default read as a
           strip (Anir, Aug 18: "Why is it so thin? Just make it like the
           other pop-ups"). */
        size="wide"
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
                <InfoHint text="We record the date this status was reached. You can still change it." />
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
              <InfoHint text="Anything worth remembering: who you met, what they asked for, what happens next." />
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
          {/* TWO PER ROW, NEVER FOUR. Four fields in a dialog this narrow left
              each one about 90px wide, and ColorSelect's 170px floor pushed the
              currency picker straight over its neighbour (Anir, Aug 9: "look at
              the fucking bottom line"). `min-w-0` on every cell is what lets a
              grid child actually shrink to its column. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                Start date
                <InfoHint text="The day this activity starts. Pick a future date for something planned but not started yet. It shows as Planned until that day." />
              </label>
              <DateField
                value={startDate}
                onChange={setStartDate}
                ariaLabel="Start date"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                End date
                <InfoHint text="When you expect it to finish, or when it did. Leave it empty while the activity is still running." />
              </label>
              <DateField
                value={endDate}
                min={startDate || undefined}
                onChange={setEndDate}
                placeholder="Optional"
                ariaLabel="End date"
              />
            </div>
            {/* OFFERING -> OPPORTUNITY -> ACTIVITY, wherever an activity is
                edited (Suren, Aug 16: "you need to connect all three"). The
                record has always carried these ids; until now nothing on this
                page could set them. */}
            {pipeline.length > 0 && (
              <div className="col-span-full min-w-0">
                <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                  Opportunities
                  <InfoHint text={"The deals this activity belongs to.\nAdd them on the Opportunities page and they become pickable here."} />
                  <span className="font-normal text-text-tertiary">optional</span>
                </label>
                {/* SEARCH, NOT A CHIP WALL — the same picker the opportunity
                    form got when its sixty chips pushed the fields off screen
                    (Anir, Aug 16: "whateven is this fix it"). This one had
                    the same wall with the whole pipeline in it. */}
                {/* ONE DROPDOWN, like every other picker (Anir, Aug 18:
                    "why are there two text boxes within a text box? Just
                    make it a simple drop-down"). */}
                <MultiPicker
                  variant="dropdown"
                  options={pipeline.map((o) => ({
                    id: o.id,
                    label: o.name,
                    sub: o.customer,
                    logoName: o.customer,
                  }))}
                  selected={opportunityIds}
                  onToggle={(id) =>
                    setOpportunityIds((prev) =>
                      prev.includes(id)
                        ? prev.filter((x) => x !== id)
                        : [...prev, id]
                    )
                  }
                  placeholder="Pick the deals…"
                  emptyLabel="Nothing in the pipeline yet."
                />
              </div>
            )}

            {/* CURRENCY FIRST, THEN THE AMOUNT (Anir, Aug 9: "currency on the
                left, amount on the right"), which is the order money is
                written and the order it is read back in the table. */}
            <div className="min-w-0">
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
                minWidth={0}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
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
          </div>
          {/* NO CANCEL BUTTON (Anir, Aug 9: "don't need a Cancel button, it's
              already in the top right"). The X closes it, Escape closes it,
              and one save button leaves no doubt which one commits. */}
          <div className="flex justify-end">
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
