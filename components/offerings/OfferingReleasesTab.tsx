"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleCheck,
  Clock,
  GitCompareArrows,
  History,
  ListChecks,
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
import type { OfferingContact, OfferingRelease } from "@/lib/offerings";
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

export function OfferingReleasesTab({
  offeringId,
  offeringName,
  releases,
  canEdit,
  canSeeNext,
  contacts,
  people,
  owners,
}: {
  offeringId: string;
  offeringName: string;
  releases: OfferingRelease[];
  canEdit: boolean;
  canSeeNext: boolean;
  contacts: OfferingContact[];
  people: PickablePerson[];
  owners: OwnerRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
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
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-hover"
          >
            <Plus size={14} strokeWidth={2.4} /> Add a version
          </button>
        )}
      </div>

      <SectionCard title="Current Customer Version" icon={CircleCheck}>
        {current ? (
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
        {current && previous ? (
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
        {sorted.filter((release) => release.status === "released").length === 0 ? (
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
          {next ? (
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
