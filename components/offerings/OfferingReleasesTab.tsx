"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  Clock,
  GitCompareArrows,
  Headset,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { OfferingContact, OfferingRelease } from "@/lib/offerings";

/**
 * RELEASE NOTES / VERSION HISTORY — Suren's release #2.
 *
 * Suren, Jul 30 (11:01): "I need to know for this offering, what is the latest
 * release, which is the latest customer version, what is the next customer
 * version, and then what are the version comparison features between this
 * version of the offering and next version… Who are the people that they can
 * reach out and what are the versions that are running."
 *
 * Saras wrote it up as a Release Notes / Version History tab "accessible to all
 * users", with a separate restricted Product Roadmap under it.
 *
 * THE ROADMAP IS DELIBERATELY NOT HERE. Sudhir: "anything beyond the current
 * release in the hands of sales is not good… it puts risk on us." Restricting
 * who can see what is a permissions decision, and permissions are not mine to
 * design. This tab carries what everyone may read: what shipped, when, and
 * what is coming next.
 */

const FIELD =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:border-blue-primary focus:outline-none";
const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

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
  contacts,
  canEdit,
}: {
  offeringId: string;
  offeringName: string;
  releases: OfferingRelease[];
  contacts: OfferingContact[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<OfferingRelease["status"]>("released");
  const [features, setFeatures] = useState("");

  // Newest first, and a version with no date sorts after ones that have one —
  // an undated row is usually the next release, not the oldest.
  const sorted = [...releases].sort((a, b) => {
    if (a.status !== b.status) return a.status === "next" ? -1 : 1;
    return (b.date || "").localeCompare(a.date || "");
  });
  const current = sorted.find((r) => r.status === "released") || null;
  const next = sorted.find((r) => r.status === "next") || null;

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
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const v = version.trim();
    if (!v) return;
    void save(
      [
        ...releases,
        {
          id: `rel-${Date.now()}`,
          version: v,
          date: date || undefined,
          status,
          features: features
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
        },
      ],
      `${v} added to the version history`
    );
    setVersion("");
    setDate("");
    setFeatures("");
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <Rocket size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            Release notes
          </h2>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">
            Every version of {offeringName} that has shipped, what changed in
            each, and what is coming next.
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

      {/* WHAT IS LIVE AND WHAT IS NEXT, side by side — the two facts Suren
          named first, before any history. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { label: "Current customer version", rel: current, empty: "No version recorded yet." },
          { label: "Next customer version", rel: next, empty: "Nothing recorded as coming next." },
        ].map((slot) => (
          <div
            key={slot.label}
            className="rounded-2xl border border-border-light bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              {slot.label}
            </p>
            {slot.rel ? (
              <>
                <p className="mt-1.5 flex items-center gap-2.5">
                  <span className="text-[22px] font-semibold tracking-[-0.01em] text-text-primary">
                    {slot.rel.version}
                  </span>
                  <StatusPill status={slot.rel.status} />
                </p>
                {slot.rel.date && (
                  <p className="mt-1 text-[12.5px] text-text-secondary">
                    {formatDate(slot.rel.date)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[13px] text-text-tertiary">{slot.empty}</p>
            )}
          </div>
        ))}
      </div>

      {/* WHAT CHANGED BETWEEN THEM. Suren asked for the comparison explicitly:
          "what are the version comparison features between this version of the
          offering and next version." Two columns, same shape, so the difference
          is the thing you read. */}
      {current && next && (
        <SectionCard title="What changes in the next version" icon={GitCompareArrows}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[current, next].map((rel) => (
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
        </SectionCard>
      )}

      {/* THE HISTORY ITSELF */}
      <SectionCard title="Version history" icon={Rocket}>
        {sorted.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No versions recorded yet.{" "}
            {canEdit
              ? "Add the current version and what shipped in it — sales reps read this to answer “what’s in it today?”."
              : "An owner of this offering adds these."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {sorted.map((rel) => (
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

      {/* WHO TO REACH OUT TO — the other half of what he asked this tab to
          carry: "who are the people that they can reach out". Same records as
          the Overview rail, surfaced where the technical questions get asked. */}
      <SectionCard title="Who to ask about this offering" icon={Headset}>
        {contacts.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Nobody is listed yet. An owner adds contacts on the Overview tab.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {contacts.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-3 rounded-2xl border border-border-light bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
              >
                <Avatar name={c.name} className="h-9 w-9 shrink-0 text-[11px]" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-text-primary">
                    {c.name}
                  </span>
                  {c.role && (
                    <span className="block text-[12px] text-text-secondary">
                      {c.role}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Adding is a popup — his standing rule. */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a version" size="wide">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Version</label>
              <input
                autoFocus
                className={FIELD}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. V2"
                aria-label="Version"
              />
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input
                type="date"
                className={FIELD}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Release date"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <div className="flex gap-2">
              {(["released", "next"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                    status === s
                      ? "border-blue-primary bg-blue-light text-blue-primary"
                      : "border-border-light text-text-secondary hover:border-blue-subtle"
                  }`}
                >
                  {s === "released" ? "Already released" : "Coming next"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL}>What changed — one per line</label>
            <textarea
              rows={5}
              className={`${FIELD} h-auto resize-y py-2 leading-relaxed`}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={"Bulk registration import\nAudit trail on every field change"}
              aria-label="Features"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button onClick={add} disabled={!version.trim()} loading={busy}>
              Add version
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
