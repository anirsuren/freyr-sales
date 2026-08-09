"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  Check,
  CircleCheck,
  Clock,
  GitCompareArrows,
  GripVertical,
  History,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { ReleaseTimeline } from "@/components/offerings/ReleaseTimeline";
import type {
  OfferingContact,
  OfferingRelease,
  OfferingRoadmapDetails,
  OfferingRoadmapComparisonRow,
  OfferingRoadmapHistoryRow,
  OfferingRoadmapModuleRow,
} from "@/lib/offerings";
import type { PickablePerson } from "@/components/ui/PeoplePicker";
import type { OwnerRow } from "@/components/offerings/OfferingOwners";
import { OfferingContacts } from "@/components/offerings/OfferingContacts";

/**
 * PRODUCT ROADMAP — shipped history for everyone, future for approved people.
 *
 * The Jul 31 response superseded the earlier draft: past and current versions
 * are open to everyone; "Next Customer Version" is restricted to the approved
 * group and Offering Owners. The latest brief restores Key Contacts as the
 * fifth roadmap section.
 */

const FIELD =
  "h-12 w-full rounded-xl border border-border-light bg-white px-3.5 text-[14px] text-text-primary shadow-[0_1px_2px_rgba(16,24,40,0.03)] placeholder:text-text-tertiary transition-[border-color,box-shadow] focus:border-blue-primary focus:outline-none focus:ring-4 focus:ring-blue-primary/10";
const LABEL =
  "mb-2 block text-[13px] font-semibold text-text-primary";

function StatusPill({ status }: { status: OfferingRelease["status"] }) {
  const shipped = status === "released";
  const color = shipped ? "#1A7A35" : "#C2410C";
  const Icon = shipped ? CircleCheck : Clock;
  return (
    <span
      style={{ color, background: `${color}1A` }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap"
    >
      <Icon size={12} strokeWidth={2.2} />
      {shipped ? "Released" : "Coming next"}
    </span>
  );
}

function DetailList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          className="flex gap-2 text-[13px] leading-relaxed text-text-secondary"
        >
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ModuleTable({ rows }: { rows: OfferingRoadmapModuleRow[] }) {
  const hasVersions = rows.some((row) => row.version);
  return (
    <div className="overflow-x-auto rounded-xl border border-border-light">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead className="bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          <tr>
            <th className="w-[22%] px-4 py-3">Module</th>
            {hasVersions && <th className="w-[12%] px-4 py-3">Version</th>}
            <th className="px-4 py-3">What it does</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light bg-white">
          {rows.map((row) => (
            <tr key={row.module} className="align-top">
              <td className="px-4 py-3 text-[13px] font-semibold text-text-primary">
                {row.module}
              </td>
              {hasVersions && (
                <td className="px-4 py-3 text-[13px] font-medium text-text-primary">
                  {row.version || "-"}
                </td>
              )}
              <td className="px-4 py-3">
                <DetailList items={row.details} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* RoadmapTimeline (the flat three-step strip) was replaced by the real
   ReleaseTimeline on Aug 7 — same three milestones, but placed against actual
   dates with today interpolated between them. Git history has the old one. */
function SubGroup({
  step,
  title,
  caption,
  action,
  tone = "default",
  children,
}: {
  step: number;
  title: string;
  caption: string;
  action?: ReactNode;
  tone?: "default" | "restricted";
  children: ReactNode;
}) {
  const restricted = tone === "restricted";
  // EVERY STEP FOLDS, AND ONLY STEP 1 STARTS OPEN. Six stacked editors —
  // timeline, modules, capabilities, comparison, history, next — put a page of
  // form in front of someone who came to change one date (Anir, Aug 7: "this
  // is too much in the edit offering section on your product roadmap... each
  // of those sub-sections should also be collapsible. It's too confusing").
  // Because this lives in SubGroup, both places that render the roadmap
  // editor — the Roadmap tab's modal and the Edit-offering page — get it.
  const [open, setOpen] = useState(step === 1);
  /**
   * OPEN AND CLOSED HAVE TO LOOK DIFFERENT AT A GLANCE. Every section was the
   * same pale card with the same faint border, so six of them read as one
   * undifferentiated wall (Anir, Aug 7: "the section separation is still not
   * clear to me... it's still very, very confusing"). Now:
   *
   *   open   — white, lifted, a solid blue rail down the left and a tinted
   *            header band. Unmistakably the one you are working in.
   *   closed — flat, quiet, no shadow, a hairline rail. A row, not a card.
   *
   * The step number carries the same signal: filled blue when open, outlined
   * when not, so you can count where you are without reading a word.
   */
  const railColor = open
    ? "bg-blue-primary"
    : restricted
      ? "bg-blue-primary/40"
      : "bg-border";
  return (
    <section
      className={`relative overflow-hidden rounded-xl border pl-[3px] transition-[box-shadow,border-color,background-color] ${
        open
          ? "border-blue-primary/35 bg-white shadow-[0_4px_16px_rgba(16,24,40,0.08)]"
          : restricted
            ? "border-blue-primary/20 bg-blue-light/20 hover:border-blue-primary/40"
            : "border-border-light bg-surface/70 hover:border-border"
      }`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${railColor}`} />
      <div
        className={`flex flex-wrap items-center gap-3 px-4 ${
          open ? "border-b border-border-light bg-blue-light/40 py-3" : "py-2.5"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold tnum ${
              open
                ? "bg-blue-primary text-white"
                : "bg-white text-text-secondary ring-1 ring-border-light"
            }`}
          >
            {step}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block leading-tight ${
                open
                  ? "text-[14px] font-semibold text-text-primary"
                  : "text-[13px] font-semibold text-text-secondary"
              }`}
            >
              {title}
            </span>
            {/* The caption explains a section you are IN. On a closed row it is
                a second line of gray nobody reads, and five of them were most
                of the wall. */}
            {open && (
              <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                {caption}
              </span>
            )}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${
              open ? "text-blue-primary" : "-rotate-90 text-text-tertiary"
            }`}
          />
        </button>
        {/* An "Add module" button on a closed section would add a row nobody
            can see, so the action travels with the content. */}
        {open && action}
      </div>
      {open && <div className="space-y-2 px-4 py-4">{children}</div>}
    </section>
  );
}

/** The dashed door shown when a list is empty — the invitation IS the state. */
function EmptyRowButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-white/70 py-5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:bg-white hover:text-blue-primary"
    >
      <Plus size={14} /> {label}
    </button>
  );
}

/**
 * A saved list entry, at a glance: what it is, a chip or two of meta, and the
 * two things you can do to it. The fields themselves live in a dialog, so ten
 * modules read as ten lines instead of thirty stacked textareas.
 */
function SummaryRow({
  title,
  meta,
  detail,
  onEdit,
  onRemove,
  removeLabel,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
  flipKey,
}: {
  title: string;
  meta?: string;
  detail?: string;
  onEdit: () => void;
  onRemove: () => void;
  removeLabel: string;
  /** Reorder wiring. Absent = the list is not reorderable. */
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  /** Stable identity so the row can be animated from its old slot to its new one. */
  flipKey?: string;
}) {
  return (
    <div
      data-flip-key={flipKey}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 transition-[border-color,box-shadow,opacity] ${
        dragging
          ? "border-blue-primary opacity-60 shadow-[0_6px_18px_rgba(16,24,40,0.10)]"
          : "border-border-light"
      }`}
    >
      {/* DRAG TO REORDER. An owner types the history in whatever order it
          comes to mind and then wants February above April (Anir, Aug 7: "if
          he realises he messed up the order… give the offering owners an
          option to shuffle it around, drag to reorder, like those three lines
          that show you can shuffle it"). Order is saved with the page's Save
          button, like every other roadmap edit. */}
      {onDragStart && (
        <span
          aria-hidden="true"
          title="Drag to reorder"
          className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-text-tertiary transition-colors hover:text-blue-primary active:cursor-grabbing"
        >
          <GripVertical size={15} strokeWidth={2} />
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-text-primary">
            {title}
          </span>
          {meta && (
            <span className="rounded-md bg-blue-light px-1.5 py-0.5 text-[11px] font-semibold text-blue-primary">
              {meta}
            </span>
          )}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">
            {detail}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
      >
        <Pencil size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
      >
        <Trash2 size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Reorder-by-drag for a roadmap list. The rows move UNDER the cursor as you
 * drag — the neighbour you are passing slides out of the way and the list is
 * already in its new order by the time you let go (Anir, Aug 8: "it doesn't
 * show me the shuffle when I move something. It should show the other things
 * shuffling next to it… when I let go it's very abrupt").
 *
 * Two pieces make that work:
 *   1. `dragover` on a different row applies the move immediately instead of
 *      waiting for `drop`, so there is no snap at the end.
 *   2. Every displaced row is animated from where it WAS to where it now is
 *      (measure, invert, play), so the shuffle is something you can watch
 *      rather than a jump between two frames.
 *
 * Row identity comes from object identity: reordering splices the same objects
 * around, so a row keeps its key across the move and can be animated.
 */
const ROW_IDS = new WeakMap<object, string>();
let rowIdSeq = 0;
function rowId(row: object): string {
  let id = ROW_IDS.get(row);
  if (!id) {
    id = `row-${(rowIdSeq += 1)}`;
    ROW_IDS.set(row, id);
  }
  return id;
}

function useRowReorder<T extends object>(rows: T[], onChange: (next: T[]) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  // The drag source lives in a REF, not in state. `dragover` fires on the very
  // next frame after `dragstart`, before React has re-rendered, so a state-held
  // source still reads null there — preventDefault never runs and the browser
  // treats the row as an invalid drop target.
  const fromRef = useRef<number | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const beforeRef = useRef<Map<string, number>>(new Map());

  function measure() {
    const map = new Map<string, number>();
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-flip-key]")
      .forEach((el) => {
        if (el.dataset.flipKey) map.set(el.dataset.flipKey, el.getBoundingClientRect().top);
      });
    beforeRef.current = map;
  }

  // Runs after every commit; only does anything when a move was just measured.
  useLayoutEffect(() => {
    const before = beforeRef.current;
    if (!before.size) return;
    beforeRef.current = new Map();
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-flip-key]")
      .forEach((el) => {
        const wasTop = el.dataset.flipKey ? before.get(el.dataset.flipKey) : undefined;
        if (wasTop === undefined) return;
        const delta = wasTop - el.getBoundingClientRect().top;
        if (!delta) return;
        el.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 190, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      });
  });

  const reset = () => {
    fromRef.current = null;
    setFrom(null);
  };

  const rowProps = (index: number) => ({
    flipKey: rowId(rows[index]),
    dragging: from === index,
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
      fromRef.current = index;
      setFrom(index);
      event.dataTransfer.effectAllowed = "move";
      // Firefox refuses to start a drag without data on the transfer.
      event.dataTransfer.setData("text/plain", String(index));
    },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      const source = fromRef.current;
      if (source === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (source === index) return;
      measure();
      const next = [...rows];
      const [moved] = next.splice(source, 1);
      next.splice(index, 0, moved);
      // The dragged row now lives here, so the next hop is measured from it.
      fromRef.current = index;
      setFrom(index);
      onChange(next);
    },
    // The list is already in its final order — letting go only ends the drag.
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      reset();
    },
    onDragEnd: reset,
  });

  return { listRef, rowProps };
}

/** One dialog shape for every roadmap list: title, fields, Cancel + Save. */
function RowDialog({
  open,
  title,
  saveLabel,
  canSave,
  onCancel,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  saveLabel: string;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="wide" stacked>
      <div className="space-y-4">
        {children}
        <div className="flex items-center justify-end gap-3 border-t border-border-light pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-[13.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const BLANK_MODULE: OfferingRoadmapModuleRow = {
  module: "",
  version: "",
  details: [],
};

function RoadmapModuleEditor({
  step,
  title,
  caption,
  restricted = false,
  rows,
  onChange,
  versions = true,
}: {
  step: number;
  title: string;
  caption: string;
  restricted?: boolean;
  rows: OfferingRoadmapModuleRow[];
  onChange: (rows: OfferingRoadmapModuleRow[]) => void;
  versions?: boolean;
}) {
  // -1 = adding a new one; null = dialog closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<OfferingRoadmapModuleRow>(BLANK_MODULE);

  const openNew = () => {
    setDraft({ ...BLANK_MODULE });
    setEditing(-1);
  };
  const openRow = (index: number) => {
    setDraft({ ...rows[index] });
    setEditing(index);
  };
  const save = () => {
    const clean: OfferingRoadmapModuleRow = {
      module: draft.module.trim(),
      version: versions ? (draft.version || "").trim() : "",
      details: draft.details.map((d) => d.trim()).filter(Boolean),
    };
    onChange(
      editing === -1
        ? [...rows, clean]
        : rows.map((row, i) => (i === editing ? clean : row))
    );
    setEditing(null);
  };

  return (
    <SubGroup
      step={step}
      title={title}
      caption={caption}
      tone={restricted ? "restricted" : "default"}
      action={
        rows.length > 0 ? (
          <Button type="button" variant="secondary" onClick={openNew}>
            <Plus size={14} /> Add module
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyRowButton label="Add the first module" onClick={openNew} />
      ) : (
        rows.map((row, index) => (
          <SummaryRow
            key={index}
            title={row.module || "Untitled module"}
            meta={versions && row.version ? row.version : undefined}
            detail={
              row.details.length
                ? row.details.join(" · ")
                : "No customer-facing points yet"
            }
            onEdit={() => openRow(index)}
            onRemove={() => onChange(rows.filter((_, i) => i !== index))}
            removeLabel={`Remove ${row.module || `module ${index + 1}`}`}
          />
        ))
      )}

      <RowDialog
        open={editing !== null}
        title={editing === -1 ? `Add to ${title}` : "Edit module"}
        saveLabel={editing === -1 ? "Add module" : "Save module"}
        canSave={draft.module.trim().length > 0}
        onCancel={() => setEditing(null)}
        onSave={save}
      >
        <div className={`grid gap-4 ${versions ? "sm:grid-cols-[1fr_160px]" : ""}`}>
          <div>
            <label className={LABEL}>Module or area</label>
            <input
              autoFocus
              className={FIELD}
              value={draft.module}
              onChange={(event) => setDraft({ ...draft, module: event.target.value })}
              placeholder="e.g. Registrations"
            />
          </div>
          {versions && (
            <div>
              <label className={LABEL}>Version</label>
              <input
                className={FIELD}
                value={draft.version || ""}
                onChange={(event) => setDraft({ ...draft, version: event.target.value })}
                placeholder="V2.5"
              />
            </div>
          )}
        </div>
        <div>
          <label className={LABEL}>What it gives the customer</label>
          <textarea
            className={`${FIELD} h-auto min-h-[132px] py-3 leading-relaxed`}
            value={draft.details.join("\n")}
            onChange={(event) =>
              setDraft({ ...draft, details: event.target.value.split("\n") })
            }
            placeholder="One point per line"
          />
          <p className="mt-1.5 text-[11.5px] text-text-tertiary">
            Sellers see these as bullet points under the module.
          </p>
        </div>
      </RowDialog>
    </SubGroup>
  );
}

const BLANK_COMPARISON: OfferingRoadmapComparisonRow = {
  area: "",
  current: "",
  previous: "",
};

function RoadmapComparisonEditor({
  step,
  rows,
  onChange,
  previousLabel,
  currentLabel,
  onPreviousLabel,
  onCurrentLabel,
}: {
  step: number;
  rows: OfferingRoadmapComparisonRow[];
  onChange: (rows: OfferingRoadmapComparisonRow[]) => void;
  previousLabel: string;
  currentLabel: string;
  onPreviousLabel: (value: string) => void;
  onCurrentLabel: (value: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<OfferingRoadmapComparisonRow>(BLANK_COMPARISON);

  const openNew = () => {
    setDraft({ ...BLANK_COMPARISON });
    setEditing(-1);
  };
  const openRow = (index: number) => {
    setDraft({ ...rows[index] });
    setEditing(index);
  };
  const save = () => {
    const clean: OfferingRoadmapComparisonRow = {
      area: draft.area.trim(),
      current: draft.current.trim(),
      previous: draft.previous.trim(),
    };
    onChange(
      editing === -1
        ? [...rows, clean]
        : rows.map((row, i) => (i === editing ? clean : row))
    );
    setEditing(null);
  };

  return (
    <SubGroup
      step={step}
      title="Previous vs current"
      caption="Side by side, what changed between the two versions."
      action={
        rows.length > 0 ? (
          <Button type="button" variant="secondary" onClick={openNew}>
            <Plus size={14} /> Add row
          </Button>
        ) : undefined
      }
    >
      {/* The two column names title the comparison table sellers see, so they
          are edited right here rather than in a detached "label" field. */}
      <div className="grid gap-3 rounded-xl border border-border-light bg-white p-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Name the current column
          </label>
          <input
            className={FIELD}
            value={currentLabel}
            onChange={(event) => onCurrentLabel(event.target.value)}
            placeholder="Current version"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Name the previous column
          </label>
          <input
            className={FIELD}
            value={previousLabel}
            onChange={(event) => onPreviousLabel(event.target.value)}
            placeholder="Previous version"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyRowButton label="Add the first comparison row" onClick={openNew} />
      ) : (
        rows.map((row, index) => (
          <SummaryRow
            key={index}
            title={row.area || "Untitled area"}
            detail={
              row.current || row.previous
                ? `${currentLabel || "Current"}: ${row.current || "Not filled in"}  ·  ${previousLabel || "Previous"}: ${row.previous || "Not filled in"}`
                : "Nothing filled in yet"
            }
            onEdit={() => openRow(index)}
            onRemove={() => onChange(rows.filter((_, i) => i !== index))}
            removeLabel={`Remove ${row.area || `comparison row ${index + 1}`}`}
          />
        ))
      )}

      <RowDialog
        open={editing !== null}
        title={editing === -1 ? "Add a comparison row" : "Edit comparison row"}
        saveLabel={editing === -1 ? "Add row" : "Save row"}
        canSave={draft.area.trim().length > 0}
        onCancel={() => setEditing(null)}
        onSave={save}
      >
        <div>
          <label className={LABEL}>Capability area</label>
          <input
            autoFocus
            className={FIELD}
            value={draft.area}
            onChange={(event) => setDraft({ ...draft, area: event.target.value })}
            placeholder="e.g. Localisation"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>{currentLabel || "Current version"}</label>
            <textarea
              className={`${FIELD} h-auto min-h-[110px] py-3 leading-relaxed`}
              value={draft.current}
              onChange={(event) => setDraft({ ...draft, current: event.target.value })}
              placeholder="What it does now"
            />
          </div>
          <div>
            <label className={LABEL}>{previousLabel || "Previous version"}</label>
            <textarea
              className={`${FIELD} h-auto min-h-[110px] py-3 leading-relaxed`}
              value={draft.previous}
              onChange={(event) => setDraft({ ...draft, previous: event.target.value })}
              placeholder="What it did before"
            />
          </div>
        </div>
      </RowDialog>
    </SubGroup>
  );
}

const BLANK_HISTORY: OfferingRoadmapHistoryRow = { period: "", summary: [] };

function RoadmapHistoryEditor({
  step,
  rows,
  onChange,
}: {
  step: number;
  rows: OfferingRoadmapHistoryRow[];
  onChange: (rows: OfferingRoadmapHistoryRow[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const { listRef, rowProps } = useRowReorder(rows, onChange);
  const [draft, setDraft] = useState<OfferingRoadmapHistoryRow>(BLANK_HISTORY);

  const openNew = () => {
    setDraft({ ...BLANK_HISTORY });
    setEditing(-1);
  };
  const openRow = (index: number) => {
    setDraft({ ...rows[index] });
    setEditing(index);
  };
  const save = () => {
    const clean: OfferingRoadmapHistoryRow = {
      period: draft.period.trim(),
      summary: draft.summary.map((s) => s.trim()).filter(Boolean),
    };
    onChange(
      editing === -1
        ? [...rows, clean]
        : rows.map((row, i) => (i === editing ? clean : row))
    );
    setEditing(null);
  };

  return (
    <SubGroup
      step={step}
      title="Release history"
      caption="Everything that shipped, newest first. The second entry becomes the previous release above."
      action={
        rows.length > 0 ? (
          <Button type="button" variant="secondary" onClick={openNew}>
            <Plus size={14} /> Add period
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyRowButton label="Add the first release period" onClick={openNew} />
      ) : (
        // Keyed by row identity, not position — an index key would make React
        // rewrite the text of the rows in place, so nothing would appear to
        // move and there would be nothing to animate.
        <div ref={listRef} className="space-y-2">
          {rows.map((row, index) => (
            <SummaryRow
              key={rowId(row)}
              title={row.period || "Untitled period"}
              meta={
                row.summary.length
                  ? `${row.summary.length} note${row.summary.length === 1 ? "" : "s"}`
                  : undefined
              }
              detail={row.summary.join(" · ") || "No release notes yet"}
              onEdit={() => openRow(index)}
              onRemove={() => onChange(rows.filter((_, i) => i !== index))}
              {...rowProps(index)}
              removeLabel={`Remove ${row.period || `period ${index + 1}`}`}
            />
          ))}
        </div>
      )}

      <RowDialog
        open={editing !== null}
        title={editing === -1 ? "Add a release period" : "Edit release period"}
        saveLabel={editing === -1 ? "Add period" : "Save period"}
        canSave={draft.period.trim().length > 0}
        onCancel={() => setEditing(null)}
        onSave={save}
      >
        <div>
          <label className={LABEL}>Period</label>
          <input
            autoFocus
            className={FIELD}
            value={draft.period}
            onChange={(event) => setDraft({ ...draft, period: event.target.value })}
            placeholder="e.g. Jul 2026"
          />
        </div>
        <div>
          <label className={LABEL}>What shipped</label>
          <textarea
            className={`${FIELD} h-auto min-h-[132px] py-3 leading-relaxed`}
            value={draft.summary.join("\n")}
            onChange={(event) =>
              setDraft({ ...draft, summary: event.target.value.split("\n") })
            }
            placeholder="One release note per line"
          />
        </div>
      </RowDialog>
    </SubGroup>
  );
}

export function blankRoadmapDetails(): OfferingRoadmapDetails {
  return {
    currentVersion: "",
    releaseWave: "",
    currentModules: [],
    platformCapabilities: [],
    comparisonCurrentLabel: "Current version",
    comparisonPreviousLabel: "Previous version",
    comparisonRows: [],
    history: [],
    nextExpectedLive: "",
    nextVersions: "",
    nextModules: [],
  };
}


/** One stop on the vertical version timeline: dot, rail, label, fields. */
function Milestone({
  tone,
  label,
  children,
  last = false,
}: {
  tone: "past" | "current" | "next";
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  const dot =
    tone === "past" ? "#8E98A8" : tone === "current" ? "#20B15A" : "#0071E3";
  return (
    <div className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-x-3.5">
      {!last && (
        <span
          aria-hidden="true"
          className={`absolute bottom-[-18px] left-[10px] top-6 w-0 ${
            tone === "current"
              ? "border-l-2 border-dashed border-blue-primary/40"
              : "border-l border-border"
          }`}
        />
      )}
      <span
        aria-hidden="true"
        className="relative z-10 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-4 border-white"
        style={{ backgroundColor: dot, boxShadow: "0 0 0 1px rgba(17,24,39,0.12)" }}
      >
        {tone === "current" && (
          <Check size={9} strokeWidth={3.4} className="text-white" />
        )}
      </span>
      <div className="min-w-0 pb-1">
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.07em]"
          style={{ color: tone === "next" ? "#0071E3" : "#6B7280" }}
        >
          {label}
        </p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/** Write the current release's date into the newest Release-history row —
 *  the one place the Roadmap timeline reads it from — creating that row when
 *  the offering has no recorded history yet. */
function withCurrentPeriod(
  draft: OfferingRoadmapDetails,
  period: string
): OfferingRoadmapDetails {
  if (draft.history.length === 0) {
    return { ...draft, history: [{ period, summary: [] }] };
  }
  const history = [...draft.history];
  history[0] = { ...history[0], period };
  return { ...draft, history };
}

export function RoadmapEditorFields({
  draft,
  onChange,
  canSeeNext,
}: {
  draft: OfferingRoadmapDetails;
  onChange: (details: OfferingRoadmapDetails) => void;
  canSeeNext: boolean;
}) {
  const previousPeriod =
    draft.history[1]?.period || draft.comparisonPreviousLabel || "";
  const currentPeriod = draft.history[0]?.period || "";
  return (
    <>
      {/* A TRUE timeline, read top to bottom. The old three-across layout ran
          its connector line straight through the labels, so every milestone
          looked struck out (Anir, Aug 6: "the second screenshot is the worst
          part"). */}
      <SubGroup
        step={1}
        title="Version timeline"
        caption="The three milestones at the top of the Roadmap tab."
      >
        <div className="space-y-4">
          <Milestone tone="past" label="Previous release">
            <p className="text-[13.5px] font-semibold text-text-primary">
              {previousPeriod || "Nothing recorded yet"}
            </p>
            <p className="mt-0.5 text-[11.5px] text-text-tertiary">
              Fills itself from Release history, nothing to type here.
            </p>
          </Milestone>

          <Milestone tone="current" label="Current version" last={!canSeeNext}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={FIELD}
                value={draft.currentVersion}
                onChange={(event) =>
                  onChange({ ...draft, currentVersion: event.target.value })
                }
                placeholder="Version 2.5"
                aria-label="Current version"
              />
              {/* THE DATE ON THE TIMELINE, EDITED WHERE IT IS READ. This input
                  used to write `releaseWave` while the timeline read the newest
                  Release-history period — so typing a date here changed nothing
                  the reader could see (Anir, Aug 7: "just make sure it's
                  editable"). It now edits that period directly; the same value
                  appears at the top of Release history below. Free text on
                  purpose: Freyr records some releases to the month only, and a
                  date picker would force us to invent a day. */}
              <input
                className={FIELD}
                value={currentPeriod}
                onChange={(event) => onChange(withCurrentPeriod(draft, event.target.value))}
                placeholder="Jul 2026, or 2026-07-14 for an exact day"
                aria-label="Current release date"
              />
            </div>
            <input
              className={`${FIELD} mt-3`}
              value={draft.releaseWave}
              onChange={(event) =>
                onChange({ ...draft, releaseWave: event.target.value })
              }
              placeholder="Release wave, optional. Example: Live since July 2026"
              aria-label="Release wave note"
            />
          </Milestone>

          {canSeeNext && (
            <Milestone tone="next" label="Next expected" last>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={FIELD}
                  value={draft.nextVersions}
                  onChange={(event) =>
                    onChange({ ...draft, nextVersions: event.target.value })
                  }
                  placeholder="Version 2.6"
                  aria-label="Next version"
                />
                <input
                  className={FIELD}
                  value={draft.nextExpectedLive}
                  onChange={(event) =>
                    onChange({ ...draft, nextExpectedLive: event.target.value })
                  }
                  placeholder="Expected August 2026"
                  aria-label="Next expected live date"
                />
              </div>
            </Milestone>
          )}
        </div>
      </SubGroup>

      <RoadmapModuleEditor
        step={2}
        title="What's in the current version"
        caption="Each module in today's release, its version, and what it does."
        rows={draft.currentModules}
        onChange={(currentModules) => onChange({ ...draft, currentModules })}
      />

      <SubGroup
        step={3}
        title="Platform capabilities"
        caption="Strengths of the whole platform, across modules."
      >
        <textarea
          className={`${FIELD} h-auto min-h-[132px] py-3 leading-relaxed`}
          value={draft.platformCapabilities.join("\n")}
          onChange={(event) =>
            onChange({
              ...draft,
              platformCapabilities: event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder="One capability per line"
          aria-label="Platform capabilities, one per line"
        />
      </SubGroup>

      <RoadmapComparisonEditor
        step={4}
        rows={draft.comparisonRows}
        onChange={(comparisonRows) => onChange({ ...draft, comparisonRows })}
        previousLabel={draft.comparisonPreviousLabel}
        currentLabel={draft.comparisonCurrentLabel}
        onPreviousLabel={(comparisonPreviousLabel) =>
          onChange({ ...draft, comparisonPreviousLabel })
        }
        onCurrentLabel={(comparisonCurrentLabel) =>
          onChange({ ...draft, comparisonCurrentLabel })
        }
      />

      <RoadmapHistoryEditor
        step={5}
        rows={draft.history}
        onChange={(history) => onChange({ ...draft, history })}
      />

      {canSeeNext && (
        <RoadmapModuleEditor
          step={6}
          restricted
          title="Planned for the next version"
          caption="Owners and admins only. Sellers never see this until it ships."
          rows={draft.nextModules}
          versions={false}
          onChange={(nextModules) => onChange({ ...draft, nextModules })}
        />
      )}
    </>
  );
}


export function OfferingReleasesTab({
  offeringId,
  offeringName,
  releases,
  roadmapDetails,
  canEdit,
  canSeeNext,
  contacts,
  people,
  owners,
}: {
  offeringId: string;
  offeringName: string;
  releases: OfferingRelease[];
  roadmapDetails?: OfferingRoadmapDetails;
  canEdit: boolean;
  canSeeNext: boolean;
  contacts: OfferingContact[];
  people: PickablePerson[];
  owners: OwnerRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  // SIX STACKED SECTIONS, EACH FOLDABLE. Once Eswar's roadmap content landed,
  // the tab became a very long scroll with no way to skip a part you were not
  // reading (Freyr, Aug 7: "can you make all the 6 sections in that tab
  // collapsible"). The whole header band is the toggle, which SectionCard
  // already supports.
  //
  // ONLY THE FIRST ONE OPENS (Anir, Aug 7: "why is everything just opened by
  // default... only the first should be opened right"). Opening all six put a
  // page of scroll in front of the one thing a seller actually came for. The
  // timeline strip above keeps its own default-open state — it is one line
  // tall and it IS the glance, so collapsing it would leave the tab empty on
  // arrival.
  const DEFAULT_OPEN_SECTION = "current";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => openSections[key] ?? key === DEFAULT_OPEN_SECTION;
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? key === DEFAULT_OPEN_SECTION),
    }));
  const foldProps = (key: string) => ({
    emphasis: true,
    chevron: true,
    expanded: isOpen(key),
    onHeaderClick: () => toggleSection(key),
  });
  const [editingRoadmap, setEditingRoadmap] = useState(false);
  const [draftRoadmap, setDraftRoadmap] = useState<OfferingRoadmapDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<OfferingRelease["status"]>("released");
  const [features, setFeatures] = useState("");
  const featureLines = features
    .split("\n")
    .map((feature) => feature.trim())
    .filter(Boolean);
  const normalizedVersion = version.trim();
  const duplicateVersion = releases.some(
    (release) =>
      release.version.trim().toLocaleLowerCase() ===
      normalizedVersion.toLocaleLowerCase()
  );
  const canAdd =
    normalizedVersion.length > 0 &&
    featureLines.length > 0 &&
    (status === "next" || Boolean(date)) &&
    !duplicateVersion;

  // Newest first, and a version with no date sorts after ones that have one —
  // an undated row is usually the next release, not the oldest.
  const visibleReleases = canSeeNext
    ? releases
    : releases.filter((release) => release.status === "released");
  const sorted = [...visibleReleases].sort((a, b) => {
    if (a.status !== b.status) return a.status === "next" ? -1 : 1;
    return (b.date || "").localeCompare(a.date || "");
  });
  const current = sorted.find((r) => r.status === "released") || null;
  const next = canSeeNext
    ? sorted.find((r) => r.status === "next") || null
    : null;
  const past = sorted.filter(
    (release) =>
      release.status === "released" && release.id !== current?.id
  );
  const previous = past[0] || null;

  function resetAddForm() {
    setVersion("");
    setDate("");
    setStatus("released");
    setFeatures("");
  }

  function closeAddModal() {
    if (busy) return;
    resetAddForm();
    setAdding(false);
  }

  async function save(list: OfferingRelease[], done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releases: list }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast(done, "success");
      setAdding(false);
      router.refresh();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!canAdd) return;
    const saved = await save(
      [
        ...releases,
        {
          id: `rel-${Date.now()}`,
          version: normalizedVersion,
          date: date || undefined,
          status,
          features: featureLines,
        },
      ],
      `${normalizedVersion} added to the version history`
    );
    if (saved) resetAddForm();
  }

  function openRoadmapEditor() {
    if (!roadmapDetails) return;
    setDraftRoadmap(structuredClone(roadmapDetails));
    setEditingRoadmap(true);
  }

  function closeRoadmapEditor() {
    if (busy) return;
    setEditingRoadmap(false);
    setDraftRoadmap(null);
  }

  async function saveRoadmap() {
    if (!draftRoadmap) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmap_details: draftRoadmap }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast("Roadmap updated", "success");
      setEditingRoadmap(false);
      setDraftRoadmap(null);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <Rocket size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            Product roadmap
          </h2>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">
            Past and current customer versions of {offeringName}
            {canSeeNext ? ", plus the approved next customer version." : "."}
          </p>
        </div>
        {/* ADD A VERSION IS ALWAYS AVAILABLE TO EDITORS. It used to render
            only while the offering had no structured roadmap yet — the moment
            real content existed, the only button left was "Edit roadmap" and
            there was no path to the add-version modal at all (Anir, Aug 8:
            "how the fuck do i add a version to an offering"). */}
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            {roadmapDetails && (
              <button
                type="button"
                onClick={openRoadmapEditor}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
              >
                <Pencil size={14} strokeWidth={2} /> Edit roadmap
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-hover"
            >
              <Plus size={14} strokeWidth={2.4} /> Add a version
            </button>
          </div>
        )}
      </div>

      {/* THE RELEASE TIMELINE LIVES HERE NOW (Anir, Aug 7: "put the timeline
          on the roadmap tab for now, and bring back the availability section
          on the main offering page"). Same component he tuned on Overview —
          today interpolated between the real dates, days shown whenever the
          record names one. */}
      {/* Gated on CONTENT, not on one shape of it. `roadmapDetails` is
          undefined on offerings whose history lives in `releases`, which is
          most of them — gating on it alone meant the rail never appeared. */}
      {(roadmapDetails || releases.length > 0) && (
        <ReleaseTimeline
          availability={roadmapDetails?.releaseWave || ""}
          currentVersion={
            roadmapDetails?.currentVersion ||
            releases.find((r) => r.status === "released")?.version ||
            null
          }
          currentReleaseDate={
            roadmapDetails?.history?.[0]?.period ||
            releases.find((r) => r.status === "released")?.date ||
            null
          }
          nextVersion={
            canSeeNext
              ? roadmapDetails?.nextVersions ||
                releases.find((r) => r.status === "next")?.version ||
                ""
              : ""
          }
          nextExpected={
            canSeeNext
              ? roadmapDetails?.nextExpectedLive ||
                releases.find((r) => r.status === "next")?.date ||
                ""
              : ""
          }
          releases={releases}
        />
      )}

      <SectionCard title="Current Customer Version" icon={CircleCheck} {...foldProps("current")}>
        {roadmapDetails ? (
          <div className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                {roadmapDetails.currentVersion}
                <StatusPill status="released" />
              </p>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Release wave: {roadmapDetails.releaseWave}
              </p>
            </div>
            <ModuleTable rows={roadmapDetails.currentModules} />
            <div>
              <p className="mb-2 text-[13px] font-semibold text-text-primary">
                Platform capabilities available in the current version (all modules)
              </p>
              <DetailList items={roadmapDetails.platformCapabilities} />
            </div>
          </div>
        ) : current ? (
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              {current.version} <StatusPill status={current.status} />
            </p>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              {current.date ? formatDate(current.date) : "No release date recorded"}
            </p>
            {current.features.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {current.features.map((feature, index) => (
                  <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-text-secondary">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">No current customer version is recorded yet.</p>
        )}
      </SectionCard>

      <SectionCard title="Feature comparison: current vs previous version" icon={GitCompareArrows} {...foldProps("comparison")}>
        {roadmapDetails ? (
          <div className="overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                <tr>
                  <th className="w-[22%] px-4 py-3">Capability area</th>
                  <th className="w-[39%] px-4 py-3">
                    {roadmapDetails.comparisonCurrentLabel}
                  </th>
                  <th className="w-[39%] px-4 py-3">
                    {roadmapDetails.comparisonPreviousLabel}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light bg-white">
                {roadmapDetails.comparisonRows.map((row) => (
                  <tr key={row.area} className="align-top">
                    <td className="px-4 py-3 text-[13px] font-semibold text-text-primary">
                      {row.area}
                    </td>
                    <td className="px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
                      {row.current}
                    </td>
                    <td className="px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
                      {row.previous}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : current && previous ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[current, previous].map((rel) => (
              <div key={rel.id}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                  {rel.version} <StatusPill status={rel.status} />
                </p>
                {rel.features.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {rel.features.map((f, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[13px] leading-relaxed text-text-secondary"
                      >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12.5px] text-text-tertiary">
                    No features listed for this version yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">A current and previous release are both required for comparison.</p>
        )}
      </SectionCard>

      <SectionCard title="Release History" icon={History} {...foldProps("history")}>
        {roadmapDetails ? (
          <div className="overflow-hidden rounded-xl border border-border-light bg-white">
            {roadmapDetails.history.map((row) => (
              <div
                key={row.period}
                className="grid grid-cols-1 gap-2 border-b border-border-light px-4 py-3 last:border-b-0 sm:grid-cols-[110px_minmax(0,1fr)]"
              >
                <p className="text-[13px] font-semibold text-text-primary">
                  {row.period}
                </p>
                <DetailList items={row.summary} />
              </div>
            ))}
          </div>
        ) : sorted.filter((release) => release.status === "released").length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No released customer versions recorded yet.{" "}
            {canEdit
              ? "Add a released version when there is history to document."
              : "An Offering Owner adds these."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {sorted.filter((release) => release.status === "released").map((rel) => (
              <div
                key={rel.id}
                className="rounded-2xl border border-border-light bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-text-primary">
                    {rel.version}
                  </span>
                  <StatusPill status={rel.status} />
                  {rel.date && (
                    <span className="text-[12.5px] text-text-secondary">
                      {formatDate(rel.date)}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        void save(
                          releases.filter((r) => r.id !== rel.id),
                          `${rel.version} removed`
                        )
                      }
                      aria-label={`Remove ${rel.version}`}
                      className="ml-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[color:#B02020]/10 hover:text-[color:#B02020]"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
                {rel.features.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {rel.features.map((f, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[13px] leading-relaxed text-text-secondary"
                      >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {canSeeNext && (
        <SectionCard title="Next Customer Version" icon={Clock} {...foldProps("next")}>
          {roadmapDetails ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-[#FFF7ED] px-4 py-3">
                <p className="text-[13px] text-text-secondary">
                  <span className="font-semibold text-text-primary">Expected live:</span>{" "}
                  {roadmapDetails.nextExpectedLive}
                </p>
                <p className="text-[13px] text-text-secondary">
                  <span className="font-semibold text-text-primary">Versions:</span>{" "}
                  {roadmapDetails.nextVersions}
                </p>
              </div>
              <ModuleTable rows={roadmapDetails.nextModules} />
            </div>
          ) : next ? (
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                {next.version} <StatusPill status={next.status} />
              </p>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                {next.date ? formatDate(next.date) : "Target date to be confirmed"}
              </p>
              {next.features.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {next.features.map((feature, index) => (
                    <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-text-secondary">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-text-secondary">No next customer version is scheduled.</p>
          )}
        </SectionCard>
      )}

      <OfferingContacts
        offeringId={offeringId}
        offeringName={offeringName}
        contacts={contacts}
        canEdit={canEdit}
        people={people}
        owners={owners}
        title="Key Contacts"
      />

      <Modal
        open={editingRoadmap && !!draftRoadmap}
        onClose={closeRoadmapEditor}
        title="Edit product roadmap"
        size="chart"
      >
        {draftRoadmap && (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveRoadmap();
            }}
          >
            <div className="rounded-2xl border border-blue-primary/15 bg-blue-light p-4 text-[12.5px] leading-relaxed text-text-secondary">
              Every field below is the exact content shown on the Roadmap tab.
              Changes save to the shared offering and are visible immediately.
            </div>

            <RoadmapEditorFields
              draft={draftRoadmap}
              onChange={setDraftRoadmap}
              canSeeNext={canSeeNext}
            />

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border-light bg-white py-4">
              <Button type="submit" loading={busy}>
                Save roadmap
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Adding is a popup — his standing rule. */}
      <Modal open={adding} onClose={closeAddModal} title="Add a roadmap version" size="wide">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-blue-primary/15 bg-blue-light p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-primary text-white shadow-[0_4px_12px_rgba(0,113,227,0.22)]">
              <Rocket size={18} strokeWidth={2} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-text-primary">
                Document a customer-facing version
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
                Released versions are visible to everyone. A planned next
                version stays restricted to approved viewers.
              </p>
            </div>
          </div>

          <section aria-labelledby="release-details-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                <CalendarDays size={14} strokeWidth={2} />
              </span>
              <h3
                id="release-details-heading"
                className="text-[13.5px] font-semibold text-text-primary"
              >
                Release details
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="release-version" className={LABEL}>
                  Version <span className="text-error">*</span>
                </label>
                <input
                  id="release-version"
                  autoFocus
                  className={FIELD}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="For example, v2.4"
                  aria-describedby={
                    duplicateVersion ? "release-version-error" : undefined
                  }
                />
                {duplicateVersion && (
                  <p
                    id="release-version-error"
                    className="mt-1.5 text-[11.5px] font-medium text-error"
                  >
                    This version already exists.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="release-date" className={LABEL}>
                  {status === "released" ? "Release date" : "Target date"}{" "}
                  {status === "released" ? (
                    <span className="text-error">*</span>
                  ) : (
                    <span className="font-normal text-text-tertiary">
                      (optional)
                    </span>
                  )}
                </label>
                <input
                  id="release-date"
                  type="date"
                  className={FIELD}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          <fieldset>
            <legend className={LABEL}>Release status</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(canSeeNext
                ? (["released", "next"] as const)
                : (["released"] as const)
              ).map((releaseStatus) => {
                const selected = status === releaseStatus;
                const released = releaseStatus === "released";
                const Icon = released ? CircleCheck : Clock;
                return (
                  <button
                    key={releaseStatus}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatus(releaseStatus)}
                    className={`group flex min-h-[76px] cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow,transform] active:scale-[0.99] ${
                      selected
                        ? released
                          ? "border-[color:rgba(34,197,94,0.55)] bg-[color:rgba(34,197,94,0.10)] shadow-[0_0_0_3px_rgba(34,197,94,0.08)]"
                          : "border-[color:rgba(249,115,22,0.55)] bg-[color:rgba(249,115,22,0.10)] shadow-[0_0_0_3px_rgba(249,115,22,0.08)]"
                        : "border-border-light bg-white hover:border-border hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        released
                          ? "bg-[color:rgba(34,197,94,0.15)] text-[color:#159947]"
                          : "bg-[color:rgba(249,115,22,0.14)] text-[color:#C45312]"
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-text-primary">
                        {released ? "Already released" : "Coming next"}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                        {released
                          ? "Available to customers now"
                          : "Planned customer release"}
                      </span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? released
                            ? "border-[color:#159947] bg-[color:#159947] text-white"
                            : "border-[color:#C45312] bg-[color:#C45312] text-white"
                          : "border-border"
                      }`}
                      aria-hidden="true"
                    >
                      {selected && <CircleCheck size={13} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <section aria-labelledby="release-changes-heading">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3
                  id="release-changes-heading"
                  className="text-[13px] font-semibold text-text-primary"
                >
                  What changed <span className="text-error">*</span>
                </h3>
                <p className="mt-0.5 text-[11.5px] text-text-secondary">
                  Add one clear, customer-friendly change per line.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                {featureLines.length}{" "}
                {featureLines.length === 1 ? "change" : "changes"}
              </span>
            </div>
            <textarea
              rows={4}
              className={`${FIELD} min-h-[132px] h-auto resize-y py-3 leading-relaxed`}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={
                "Bulk registration import\nAudit trail for every field change"
              }
              aria-label="Changes in this version"
            />
            <div className="mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed text-text-tertiary">
              <ListChecks
                size={14}
                strokeWidth={1.9}
                className="mt-0.5 shrink-0 text-blue-primary"
              />
              <span>
                Each line becomes a separate item in the release notes.
              </span>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-border-light pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] text-text-tertiary">
              {!normalizedVersion
                ? "Enter a version to continue."
                : duplicateVersion
                  ? "Use a version name that is not already in the history."
                  : status === "released" && !date
                    ? "Choose the date this version was released."
                    : featureLines.length === 0
                      ? "Add at least one change to continue."
                      : "Ready to add to the version history."}
            </p>
            <div className="flex shrink-0 justify-end gap-2">
              <Button type="submit" disabled={!canAdd} loading={busy}>
                <Plus size={14} strokeWidth={2.2} />
                Add version
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}
