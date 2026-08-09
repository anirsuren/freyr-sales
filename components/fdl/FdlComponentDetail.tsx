"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Clock,
  Download,
  GitCompareArrows,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { FdlComponent, FdlFeature, FdlRelease } from "@/lib/offerings";
import { FdlTypeChip, fdlCurrentVersion } from "@/components/fdl/FdlComponentsBrowser";
import { OfferingIcon } from "@/components/ui/OfferingIcon";

/**
 * ONE COMPONENT, THE WHOLE STORY — Suren's model (Aug 8, via Anir): "first
 * you make all the versions and the release dates, then give a list of
 * features… and then for every feature which version is available… they are
 * only mapping features to versions." The comparison and the downloadable
 * sheets fall straight out of that mapping.
 */

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function orderedReleases(component: FdlComponent): FdlRelease[] {
  return [...component.releases].sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999")
  );
}

/** A self-contained printable HTML document (save or print to PDF). */
function downloadDocument(title: string, subtitle: string, tableHtml: string, filename: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;margin:40px auto;max-width:900px;padding:0 24px}
  h1{font-size:22px;margin:0}p.sub{color:#6e6e73;font-size:13px;margin:6px 0 24px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #e5e5ea;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f5f7fa;font-weight:600}
  .yes{color:#1a7a35;font-weight:700}.no{color:#b8b8bd}
  .desc{color:#6e6e73;font-size:12px}
  footer{margin-top:24px;color:#6e6e73;font-size:11px}
  </style></head><body><h1>${title}</h1><p class="sub">${subtitle}</p>${tableHtml}
  <footer>Generated from Freyr Sales Intelligence.</footer></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FdlComponentDetail({
  component,
  homes,
  canEdit,
}: {
  component: FdlComponent;
  homes: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const releases = orderedReleases(component);
  const current = fdlCurrentVersion(component);

  async function patch(data: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/fdl-components/${component.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not save.");
      toast(done);
      router.refresh();
      return true;
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---- rename ------------------------------------------------------------
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(component.name);

  // ---- add version -------------------------------------------------------
  const [addingVersion, setAddingVersion] = useState(false);
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"released" | "next">("released");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const normalizedVersion = version.trim();
  const duplicateVersion = component.releases.some(
    (r) => r.version.toLowerCase() === normalizedVersion.toLowerCase()
  );
  const canAddVersion = !!normalizedVersion && !duplicateVersion;

  async function addVersion() {
    if (!canAddVersion) return;
    const release: FdlRelease = {
      id: `rel-${Math.random().toString(36).slice(2, 9)}`,
      version: normalizedVersion,
      date: date || undefined,
      status,
      current: status === "released" && makeCurrent,
    };
    const next = [...component.releases, release];
    if (release.current) for (const r of next) if (r !== release) r.current = false;
    if (await patch({ releases: next }, `${normalizedVersion} added.`)) {
      setAddingVersion(false);
      setVersion("");
      setDate("");
    }
  }

  async function markCurrent(id: string) {
    const next = component.releases.map((r) => ({ ...r, current: r.id === id }));
    await patch({ releases: next }, "Current version updated.");
  }

  const [confirmReleaseDelete, setConfirmReleaseDelete] = useState<string | null>(null);
  async function removeRelease(id: string) {
    setConfirmReleaseDelete(null);
    await patch(
      { releases: component.releases.filter((r) => r.id !== id) },
      "Version removed."
    );
  }

  // ---- features ----------------------------------------------------------
  /** null = closed; "" = adding; otherwise the feature id being edited. */
  const [featureModal, setFeatureModal] = useState<string | null>(null);
  const [featName, setFeatName] = useState("");
  const [featFid, setFeatFid] = useState("");
  const [featDesc, setFeatDesc] = useState("");
  const [featVersions, setFeatVersions] = useState<string[]>([]);
  const [confirmFeatureDelete, setConfirmFeatureDelete] = useState<string | null>(null);

  function openFeatureModal(feature?: FdlFeature) {
    setFeatureModal(feature ? feature.id : "");
    setFeatName(feature?.name ?? "");
    setFeatFid(feature?.fid ?? "");
    setFeatDesc(feature?.description ?? "");
    setFeatVersions(feature?.versionIds ?? releases.map((r) => r.id));
  }

  async function saveFeature() {
    if (!featName.trim()) return;
    const record: FdlFeature = {
      id: featureModal || `feat-${Math.random().toString(36).slice(2, 9)}`,
      fid: featFid.trim() || undefined,
      name: featName.trim(),
      description: featDesc.trim() || undefined,
      versionIds: featVersions,
    };
    const next =
      featureModal === ""
        ? [...component.features, record]
        : component.features.map((f) => (f.id === featureModal ? record : f));
    if (await patch({ features: next }, featureModal === "" ? "Feature added." : "Feature saved."))
      setFeatureModal(null);
  }

  async function toggleMapping(feature: FdlFeature, releaseId: string) {
    const has = feature.versionIds.includes(releaseId);
    const next = component.features.map((f) =>
      f.id === feature.id
        ? {
            ...f,
            versionIds: has
              ? f.versionIds.filter((v) => v !== releaseId)
              : [...f.versionIds, releaseId],
          }
        : f
    );
    await patch(
      { features: next },
      has ? "Removed from that version." : "Added to that version."
    );
  }

  async function removeFeature(id: string) {
    setConfirmFeatureDelete(null);
    await patch(
      { features: component.features.filter((f) => f.id !== id) },
      "Feature removed."
    );
  }

  // ---- compare -----------------------------------------------------------
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const compareReleases = releases.filter((r) => compareIds.includes(r.id));
  const compareRows = useMemo(
    () =>
      component.features.filter((f) =>
        compareReleases.some((r) => f.versionIds.includes(r.id))
      ),
    [component.features, compareReleases]
  );

  function downloadVersionSheet(release: FdlRelease) {
    const rows = component.features.filter((f) => f.versionIds.includes(release.id));
    const table = `<table><tr><th>Feature</th><th>Description</th></tr>${rows
      .map(
        (f) =>
          `<tr><td><strong>${f.name}</strong></td><td class="desc">${f.description ?? ""}</td></tr>`
      )
      .join("")}</table>`;
    downloadDocument(
      `${component.name} — ${release.version} feature sheet`,
      `${component.type} · ${release.date ? formatDate(release.date) : "date not set"} · ${rows.length} features`,
      table,
      `${slug(component.name)}-${slug(release.version)}-feature-sheet.html`
    );
  }

  function downloadComparison() {
    const table = `<table><tr><th>Feature</th>${compareReleases
      .map((r) => `<th>${r.version}</th>`)
      .join("")}</tr>${compareRows
      .map(
        (f) =>
          `<tr><td><strong>${f.name}</strong><div class="desc">${f.description ?? ""}</div></td>${compareReleases
            .map(
              (r) =>
                `<td class="${f.versionIds.includes(r.id) ? "yes" : "no"}">${
                  f.versionIds.includes(r.id) ? "✓" : "—"
                }</td>`
            )
            .join("")}</tr>`
      )
      .join("")}</table>`;
    downloadDocument(
      `${component.name} — version comparison`,
      `${component.type} · comparing ${compareReleases.map((r) => r.version).join(" vs ")}`,
      table,
      `${slug(component.name)}-comparison.html`
    );
  }

  const CARD = "rounded-xl border border-border-light bg-white p-5 shadow-card";

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------- header */}
      <div>
        <Link
          href="/components"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={13} strokeWidth={2.2} /> All components
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <OfferingIcon name={component.name} className="h-10 w-10 shrink-0" />
          <h1 className="text-[22px] font-bold text-text-primary">{component.name}</h1>
          <FdlTypeChip type={component.type} />
          {current && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[color:#0040A0]">
              <Rocket size={11} strokeWidth={2.2} /> Current {current}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              aria-label="Rename component"
              onClick={() => {
                setNameDraft(component.name);
                setRenaming(true);
              }}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
        <p className="mt-1 text-[12.5px] text-text-secondary">
          {homes.length > 0 ? (
            <>
              Part of{" "}
              {homes.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && ", "}
                  <Link href={`/offerings/${h.id}`} className="font-medium text-blue-primary hover:underline">
                    {h.name}
                  </Link>
                </span>
              ))}
              .
            </>
          ) : (
            "Not connected to an offering yet — connect it from the offering's Components tab."
          )}
        </p>
      </div>

      {/* ------------------------------------------------------- versions */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Rocket size={15} strokeWidth={2} className="text-blue-primary" /> Versions
            <InfoHint text="Every version this component has shipped or has planned. The checkmark marks the current one — the version sellers quote." />
          </h2>
          {canEdit && (
            <Button onClick={() => setAddingVersion(true)}>
              <Plus size={14} strokeWidth={2.2} /> Add version
            </Button>
          )}
        </div>
        {releases.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            No versions yet. Add the first one, then list its features below.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border-light">
            {releases.map((release) => (
              <li key={release.id} className="flex items-center gap-3 py-2.5">
                {release.status === "released" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(26,122,53,0.25)] bg-[rgba(26,122,53,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#1A7A35]">
                    <CircleCheck size={11} strokeWidth={2.2} /> Released
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9]">
                    <Clock size={11} strokeWidth={2.2} /> Expected
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-tight text-text-primary">
                    {/^[A-Za-z]{3}'\d{2}$/.test(release.version)
                      ? "No version number recorded"
                      : release.version}
                  </span>
                  <span className="block text-[11.5px] text-text-tertiary tnum">
                    {release.date ? formatDate(release.date) : "Date not set"}
                    {" · "}
                    {component.features.filter((f) => f.versionIds.includes(release.id)).length}{" "}
                    {component.features.filter((f) => f.versionIds.includes(release.id)).length === 1
                      ? "feature"
                      : "features"}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {release.current ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-primary px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.03em] text-white">
                      <Check size={10} strokeWidth={3} /> Current
                    </span>
                  ) : (
                    canEdit &&
                    release.status === "released" && (
                      <button
                        type="button"
                        onClick={() => void markCurrent(release.id)}
                        disabled={busy}
                        className="cursor-pointer rounded-lg border border-border-light px-2 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                      >
                        Mark current
                      </button>
                    )
                  )}
                  {release.status === "released" && (
                    <button
                      type="button"
                      title="Download this version's feature sheet"
                      aria-label={`Download ${release.version} feature sheet`}
                      onClick={() => downloadVersionSheet(release)}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                    >
                      <Download size={13} strokeWidth={2} />
                    </button>
                  )}
                  {canEdit &&
                    (confirmReleaseDelete === release.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void removeRelease(release.id)}
                          className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                        >
                          Remove?
                        </button>
                        <button
                          type="button"
                          aria-label="Keep this version"
                          onClick={() => setConfirmReleaseDelete(null)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary hover:bg-surface"
                        >
                          <X size={13} strokeWidth={2} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${release.version}`}
                        onClick={() => setConfirmReleaseDelete(release.id)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- features */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <ListChecks size={15} strokeWidth={2} className="text-blue-primary" /> Features
            <InfoHint text="Add a feature once, then tick which versions carry it. This mapping powers the comparison and the downloadable sheets." />
          </h2>
          {canEdit && (
            <Button variant="secondary" onClick={() => openFeatureModal()} disabled={releases.length === 0}>
              <Plus size={14} strokeWidth={2.2} /> Add feature
            </Button>
          )}
        </div>
        {component.features.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            {releases.length === 0
              ? "Add a version first — features are ticked against versions."
              : "No features listed yet. Add the first feature, then tick which versions carry it."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="py-2 pr-4">Feature</th>
                  {releases.map((r) => (
                    <th key={r.id} className="px-2 py-2 text-center whitespace-nowrap">
                      {r.version}
                      {r.current && <Check size={10} strokeWidth={3} className="ml-0.5 inline text-blue-primary" />}
                    </th>
                  ))}
                  {canEdit && <th className="py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {component.features.map((feature) => (
                  <tr key={feature.id}>
                    <td className="max-w-[340px] py-2.5 pr-4">
                      <p className="text-[13px] font-semibold text-text-primary">
                        {feature.fid && (
                          <span className="mr-1.5 inline-flex rounded border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-1 py-0.5 align-middle text-[10px] font-bold tracking-[0.03em] text-[color:#0040A0] tnum">
                            {feature.fid}
                          </span>
                        )}
                        {feature.name}
                      </p>
                      {feature.description && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
                          {feature.description}
                        </p>
                      )}
                    </td>
                    {releases.map((release) => {
                      const has = feature.versionIds.includes(release.id);
                      return (
                        <td key={release.id} className="px-2 py-2.5 text-center">
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`${feature.name} in ${release.version}: ${has ? "yes" : "no"}`}
                              onClick={() => void toggleMapping(feature, release.id)}
                              className={`inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition-colors ${
                                has
                                  ? "border-[rgba(26,122,53,0.35)] bg-[rgba(26,122,53,0.1)] text-[color:#1A7A35]"
                                  : "border-border-light text-text-tertiary hover:border-blue-subtle"
                              }`}
                            >
                              {has ? <Check size={13} strokeWidth={2.6} /> : <Minus size={12} strokeWidth={2} />}
                            </button>
                          ) : has ? (
                            <Check size={14} strokeWidth={2.6} className="inline text-[color:#1A7A35]" />
                          ) : (
                            <Minus size={12} strokeWidth={2} className="inline text-text-tertiary" />
                          )}
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td className="py-2.5 pl-2">
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${feature.name}`}
                            onClick={() => openFeatureModal(feature)}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          {confirmFeatureDelete === feature.id ? (
                            <button
                              type="button"
                              onClick={() => void removeFeature(feature.id)}
                              className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                            >
                              Remove?
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove ${feature.name}`}
                              onClick={() => setConfirmFeatureDelete(feature.id)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- compare */}
      {releases.length >= 2 && component.features.length > 0 && (
        <section className={CARD}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <GitCompareArrows size={15} strokeWidth={2} className="text-blue-primary" /> Compare versions
            <InfoHint text="Pick two or more versions — only the features present in at least one of them are shown, side by side." />
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {releases.map((release) => {
              const active = compareIds.includes(release.id);
              return (
                <button
                  key={release.id}
                  type="button"
                  onClick={() =>
                    setCompareIds((prev) =>
                      active ? prev.filter((x) => x !== release.id) : [...prev, release.id]
                    )
                  }
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-blue-primary bg-blue-light text-blue-primary"
                      : "border-border-light text-text-secondary hover:border-blue-subtle"
                  }`}
                >
                  {release.version}
                </button>
              );
            })}
          </div>
          {compareReleases.length >= 2 ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      <th className="py-2 pr-4">Feature</th>
                      {compareReleases.map((r) => (
                        <th key={r.id} className="px-2 py-2 text-center">{r.version}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {compareRows.map((feature) => (
                      <tr key={feature.id}>
                        <td className="py-2.5 pr-4 text-[13px] font-medium text-text-primary">
                          {feature.name}
                        </td>
                        {compareReleases.map((release) => (
                          <td key={release.id} className="px-2 py-2.5 text-center">
                            {feature.versionIds.includes(release.id) ? (
                              <Check size={14} strokeWidth={2.6} className="inline text-[color:#1A7A35]" />
                            ) : (
                              <Minus size={12} strokeWidth={2} className="inline text-text-tertiary" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="secondary" onClick={downloadComparison}>
                  <Download size={14} strokeWidth={2} /> Download comparison
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-[12.5px] text-text-secondary">
              Pick at least two versions to compare.
            </p>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- modals */}
      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename component">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!nameDraft.trim()) return;
            if (await patch({ name: nameDraft.trim() }, "Renamed.")) setRenaming(false);
          }}
          className="space-y-4"
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className={FIELD}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenaming(false)} disabled={busy}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!nameDraft.trim()} loading={busy}>
              <Pencil size={14} strokeWidth={2} /> Save name
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={addingVersion}
        onClose={() => setAddingVersion(false)}
        title={`Add a version to ${component.name}`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addVersion();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">Version</label>
              <input
                autoFocus
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="V2.1"
                className={FIELD}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">
                {status === "released" ? "Release date" : "Expected date"}
              </label>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatus("released")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                status === "released"
                  ? "border-[rgba(26,122,53,0.35)] bg-[rgba(26,122,53,0.1)] text-[color:#1A7A35]"
                  : "border-border-light text-text-secondary hover:border-blue-subtle"
              }`}
            >
              <CircleCheck size={13} strokeWidth={2.2} /> Released
            </button>
            <button
              type="button"
              onClick={() => setStatus("next")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                status === "next"
                  ? "border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.1)] text-[color:#6D28D9]"
                  : "border-border-light text-text-secondary hover:border-blue-subtle"
              }`}
            >
              <Clock size={13} strokeWidth={2.2} /> Coming next
            </button>
          </div>
          {status === "released" && (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-primary">
              <input
                type="checkbox"
                checked={makeCurrent}
                onChange={(event) => setMakeCurrent(event.target.checked)}
                className="h-4 w-4 accent-blue-primary"
              />
              This is the current version
            </label>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11.5px] text-text-tertiary">
              {!normalizedVersion
                ? "Enter a version to continue."
                : duplicateVersion
                  ? "That version already exists."
                  : "Ready to add — tick its features in the table after."}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="secondary" onClick={() => setAddingVersion(false)} disabled={busy}>
                <X size={14} strokeWidth={2} /> Cancel
              </Button>
              <Button type="submit" disabled={!canAddVersion} loading={busy}>
                <Plus size={14} strokeWidth={2.2} /> Add version
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={featureModal !== null}
        onClose={() => setFeatureModal(null)}
        title={featureModal === "" ? "Add a feature" : "Edit feature"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveFeature();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Feature name
              <InfoHint text="One capability, named the way a seller would say it." />
            </label>
            <input
              autoFocus
              value={featName}
              onChange={(event) => setFeatName(event.target.value)}
              placeholder="Bulk import from Excel"
              className={FIELD}
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Feature ID
              <InfoHint text="The short ID from the feature sheet (Fid). Optional." />
            </label>
            <input
              value={featFid}
              onChange={(event) => setFeatFid(event.target.value)}
              placeholder="F-001"
              className={FIELD}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">Description</label>
            <textarea
              value={featDesc}
              onChange={(event) => setFeatDesc(event.target.value)}
              rows={2}
              placeholder="What it does, in one or two sentences."
              className={`${FIELD} resize-y`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">
              Available in which versions?
            </label>
            <div className="flex flex-wrap gap-2">
              {releases.map((release) => {
                const active = featVersions.includes(release.id);
                return (
                  <button
                    key={release.id}
                    type="button"
                    onClick={() =>
                      setFeatVersions((prev) =>
                        active ? prev.filter((x) => x !== release.id) : [...prev, release.id]
                      )
                    }
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                      active
                        ? "border-[rgba(26,122,53,0.35)] bg-[rgba(26,122,53,0.1)] text-[color:#1A7A35]"
                        : "border-border-light text-text-secondary hover:border-blue-subtle"
                    }`}
                  >
                    {active && <Check size={11} strokeWidth={2.6} className="mr-1 inline" />}
                    {release.version}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFeatureModal(null)} disabled={busy}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!featName.trim()} loading={busy}>
              {featureModal === "" ? (
                <>
                  <Plus size={14} strokeWidth={2.2} /> Add feature
                </>
              ) : (
                <>
                  <Pencil size={14} strokeWidth={2} /> Save feature
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
