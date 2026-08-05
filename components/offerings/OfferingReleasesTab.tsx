"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleCheck,
  Clock,
  GitCompareArrows,
  History,
  ListChecks,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
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

function RoadmapTimeline({
  details,
  showNext,
}: {
  details: OfferingRoadmapDetails;
  showNext: boolean;
}) {
  const previous = details.history[1];
  const steps = [
    {
      eyebrow: "Previous release",
      title: details.comparisonPreviousLabel || previous?.period || "Previous version",
      detail: previous?.period || "Release date not recorded",
      tone: "bg-[#8E98A8]",
    },
    {
      eyebrow: "Current version",
      title: details.currentVersion,
      detail: details.releaseWave,
      tone: "bg-[#20B15A]",
    },
    ...(showNext
      ? [
          {
            eyebrow: "Next expected",
            title: details.nextVersions || "Version to be confirmed",
            detail: details.nextExpectedLive || "Date to be confirmed",
            tone: "bg-blue-primary",
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-border-light bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
        Version timeline
      </p>
      <div
        className={`mt-4 grid gap-4 ${
          steps.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        {steps.map((step, index) => (
          <div key={`${step.eyebrow}-${step.title}`} className="relative min-w-0 pl-7">
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[9px] top-5 h-[calc(100%+1rem)] w-px bg-border md:left-5 md:right-[-16px] md:top-[9px] md:h-px md:w-auto"
              />
            )}
            <span
              aria-hidden="true"
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full border-[4px] border-white shadow-[0_0_0_1px_rgba(17,24,39,0.12)] ${step.tone}`}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
              {step.eyebrow}
            </p>
            <p className="mt-1 text-[13.5px] font-semibold leading-snug text-text-primary">
              {step.title}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapModuleEditor({
  title,
  rows,
  onChange,
  versions = true,
}: {
  title: string;
  rows: OfferingRoadmapModuleRow[];
  onChange: (rows: OfferingRoadmapModuleRow[]) => void;
  versions?: boolean;
}) {
  const replace = (index: number, patch: Partial<OfferingRoadmapModuleRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <section className="rounded-2xl border border-border-light p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-text-primary">{title}</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...rows, { module: "", version: "", details: [] }])}
        >
          <Plus size={14} /> Add row
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl bg-surface p-3">
            <div className={`grid gap-3 ${versions ? "sm:grid-cols-[1fr_150px_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
              <input
                className={FIELD}
                value={row.module}
                onChange={(event) => replace(index, { module: event.target.value })}
                placeholder="Module or area"
                aria-label={`${title} row ${index + 1} module`}
              />
              {versions && (
                <input
                  className={FIELD}
                  value={row.version || ""}
                  onChange={(event) => replace(index, { version: event.target.value })}
                  placeholder="Version"
                  aria-label={`${title} row ${index + 1} version`}
                />
              )}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label={`Remove ${row.module || `row ${index + 1}`}`}
                className="flex h-12 w-12 items-center justify-center rounded-xl text-text-tertiary hover:bg-error/10 hover:text-error"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              className={`${FIELD} mt-3 h-auto min-h-[92px] py-3 leading-relaxed`}
              value={row.details.join("\n")}
              onChange={(event) =>
                replace(index, {
                  details: event.target.value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="One customer-facing detail per line"
              aria-label={`${title} row ${index + 1} details`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function RoadmapComparisonEditor({
  rows,
  onChange,
}: {
  rows: OfferingRoadmapComparisonRow[];
  onChange: (rows: OfferingRoadmapComparisonRow[]) => void;
}) {
  const replace = (index: number, patch: Partial<OfferingRoadmapComparisonRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <section className="rounded-2xl border border-border-light p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-text-primary">Version comparison rows</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...rows, { area: "", current: "", previous: "" }])}
        >
          <Plus size={14} /> Add row
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl bg-surface p-3 lg:grid-cols-[190px_1fr_1fr_auto]">
            <input className={FIELD} value={row.area} onChange={(e) => replace(index, { area: e.target.value })} placeholder="Capability area" />
            <textarea className={`${FIELD} h-auto min-h-[80px] py-3`} value={row.current} onChange={(e) => replace(index, { current: e.target.value })} placeholder="Current version" />
            <textarea className={`${FIELD} h-auto min-h-[80px] py-3`} value={row.previous} onChange={(e) => replace(index, { previous: e.target.value })} placeholder="Previous version" />
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`Remove comparison row ${index + 1}`} className="flex h-12 w-12 items-center justify-center rounded-xl text-text-tertiary hover:bg-error/10 hover:text-error"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoadmapHistoryEditor({
  rows,
  onChange,
}: {
  rows: OfferingRoadmapHistoryRow[];
  onChange: (rows: OfferingRoadmapHistoryRow[]) => void;
}) {
  const replace = (index: number, patch: Partial<OfferingRoadmapHistoryRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <section className="rounded-2xl border border-border-light p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-text-primary">Release history</h3>
        <Button type="button" variant="secondary" onClick={() => onChange([...rows, { period: "", summary: [] }])}>
          <Plus size={14} /> Add period
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl bg-surface p-3 sm:grid-cols-[150px_1fr_auto]">
            <input className={FIELD} value={row.period} onChange={(e) => replace(index, { period: e.target.value })} placeholder="Jul 2026" />
            <textarea
              className={`${FIELD} h-auto min-h-[80px] py-3`}
              value={row.summary.join("\n")}
              onChange={(e) => replace(index, { summary: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
              placeholder="One release note per line"
            />
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`Remove history period ${index + 1}`} className="flex h-12 w-12 items-center justify-center rounded-xl text-text-tertiary hover:bg-error/10 hover:text-error"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function blankRoadmapDetails(): OfferingRoadmapDetails {
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

function RoadmapEditorFields({
  draft,
  onChange,
  canSeeNext,
}: {
  draft: OfferingRoadmapDetails;
  onChange: (details: OfferingRoadmapDetails) => void;
  canSeeNext: boolean;
}) {
  return (
    <>
      <section className="rounded-2xl border border-border-light p-4">
        <h3 className="mb-3 text-[13.5px] font-semibold text-text-primary">
          Current and next milestones
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Current version</label>
            <input
              className={FIELD}
              value={draft.currentVersion}
              onChange={(event) =>
                onChange({ ...draft, currentVersion: event.target.value })
              }
              placeholder="Version 2.5"
            />
          </div>
          <div>
            <label className={LABEL}>Current release date / wave</label>
            <input
              className={FIELD}
              value={draft.releaseWave}
              onChange={(event) =>
                onChange({ ...draft, releaseWave: event.target.value })
              }
              placeholder="Live since July 2026"
            />
          </div>
          <div>
            <label className={LABEL}>Previous-version comparison label</label>
            <input
              className={FIELD}
              value={draft.comparisonPreviousLabel}
              onChange={(event) =>
                onChange({
                  ...draft,
                  comparisonPreviousLabel: event.target.value,
                })
              }
            />
          </div>
          <div>
            <label className={LABEL}>Current-version comparison label</label>
            <input
              className={FIELD}
              value={draft.comparisonCurrentLabel}
              onChange={(event) =>
                onChange({
                  ...draft,
                  comparisonCurrentLabel: event.target.value,
                })
              }
            />
          </div>
          {canSeeNext && (
            <>
              <div>
                <label className={LABEL}>Next expected live date</label>
                <input
                  className={FIELD}
                  value={draft.nextExpectedLive}
                  onChange={(event) =>
                    onChange({ ...draft, nextExpectedLive: event.target.value })
                  }
                  placeholder="August 2026"
                />
              </div>
              <div>
                <label className={LABEL}>Next version(s)</label>
                <input
                  className={FIELD}
                  value={draft.nextVersions}
                  onChange={(event) =>
                    onChange({ ...draft, nextVersions: event.target.value })
                  }
                  placeholder="Version 2.6"
                />
              </div>
            </>
          )}
        </div>
      </section>

      <RoadmapModuleEditor
        title="Current module versions and capabilities"
        rows={draft.currentModules}
        onChange={(currentModules) => onChange({ ...draft, currentModules })}
      />

      <section className="rounded-2xl border border-border-light p-4">
        <label className={LABEL}>Platform capabilities</label>
        <textarea
          className={`${FIELD} h-auto min-h-[150px] py-3 leading-relaxed`}
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
        />
      </section>

      <RoadmapComparisonEditor
        rows={draft.comparisonRows}
        onChange={(comparisonRows) => onChange({ ...draft, comparisonRows })}
      />

      <RoadmapHistoryEditor
        rows={draft.history}
        onChange={(history) => onChange({ ...draft, history })}
      />

      {canSeeNext && (
        <RoadmapModuleEditor
          title="Next-version module changes"
          rows={draft.nextModules}
          versions={false}
          onChange={(nextModules) => onChange({ ...draft, nextModules })}
        />
      )}
    </>
  );
}

/**
 * The edit-offering page owns a true inline roadmap editor. It deliberately
 * saves the roadmap independently: an owner can update the roadmap without
 * navigating away from (or losing changes in) the rest of the offering form.
 */
export function OfferingRoadmapInlineEditor({
  offeringId,
  initialDetails,
  canSeeNext = true,
}: {
  offeringId: string;
  initialDetails?: OfferingRoadmapDetails;
  canSeeNext?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<OfferingRoadmapDetails>(() =>
    structuredClone(initialDetails ?? blankRoadmapDetails())
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(structuredClone(initialDetails ?? blankRoadmapDetails()));
  }, [initialDetails]);

  async function saveInlineRoadmap() {
    setBusy(true);
    try {
      const response = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmap_details: draft }),
      });
      if (!response.ok) {
        throw new Error((await response.json()).error || "Save failed");
      }
      toast("Roadmap updated", "success");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void saveInlineRoadmap();
      }}
    >
      <div className="flex flex-col gap-3 rounded-xl border border-blue-primary/15 bg-blue-light/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13.5px] font-semibold text-text-primary">
            Edit the roadmap here
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
            These fields are the content sellers see on the Roadmap tab.
          </p>
        </div>
        <Button type="submit" loading={busy} className="shrink-0">
          Save roadmap
        </Button>
      </div>
      <RoadmapEditorFields
        draft={draft}
        onChange={setDraft}
        canSeeNext={canSeeNext}
      />
      <div className="flex justify-end border-t border-border-light pt-4">
        <Button type="submit" loading={busy}>
          Save roadmap
        </Button>
      </div>
    </form>
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
        {canEdit && roadmapDetails && (
          <button
            type="button"
            onClick={openRoadmapEditor}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary"
          >
            <Pencil size={14} strokeWidth={2} /> Edit roadmap
          </button>
        )}
        {canEdit && !roadmapDetails && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-hover"
          >
            <Plus size={14} strokeWidth={2.4} /> Add a version
          </button>
        )}
      </div>

      {roadmapDetails && (
        <RoadmapTimeline details={roadmapDetails} showNext={canSeeNext} />
      )}

      <SectionCard title="Current Customer Version" icon={CircleCheck}>
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

      <SectionCard title="Feature Comparison — Current vs Previous Version" icon={GitCompareArrows}>
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

      <SectionCard title="Release History" icon={History}>
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
        <SectionCard title="Next Customer Version" icon={Clock}>
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
        defaultOpen
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
              <Button type="button" variant="secondary" onClick={closeRoadmapEditor} disabled={busy}>
                Cancel
              </Button>
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
              <Button
                type="button"
                variant="secondary"
                onClick={closeAddModal}
                disabled={busy}
              >
              <X size={14} strokeWidth={2} /> Cancel
              </Button>
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
