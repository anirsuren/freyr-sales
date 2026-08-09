"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Check, CircleCheck, Clock, LayoutGrid, Link2, Plus, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { ColorSelect } from "@/components/ui/ColorSelect";
import type { FdlComponent } from "@/lib/offerings";
import {
  FdlTypeChip,
  fdlCurrentVersion,
  versionTone,
} from "@/components/fdl/FdlComponentsBrowser";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { useStoredView } from "@/lib/useStoredView";

/**
 * THE OFFERING IS A PACKAGE — this tab lists the FDL components inside it
 * (Suren via Anir, Aug 8: "components will have features and roadmap, not the
 * offering… freya dot register will have 2 components, one is register module
 * and register agent"). The roadmap that used to live here moved into each
 * component.
 */
export function ConnectedComponents({
  offeringId,
  connected,
  all,
  versions = {},
  canEdit,
}: {
  offeringId: string;
  connected: FdlComponent[];
  all: FdlComponent[];
  /** componentId → the release id this offering covers. */
  versions?: Record<string, string | null>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // Cards or rows, remembered like every other list in the app.
  const [view, chooseView] = useStoredView<"cards" | "table">(
    "freyr.offeringComponents.view",
    "cards",
    ["cards", "table"]
  );
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

  const connectedIds = new Set(connected.map((c) => c.id));
  const available = all.filter((c) => !connectedIds.has(c.id));

  async function saveIds(ids: string[], done: string) {
    return savePatch({ component_ids: ids }, done);
  }

  /** WHICH VERSION THIS OFFERING COVERS. Suren, Aug 9: "you need to say which
   *  version is applicable for this offering." */
  async function saveVersion(componentId: string, releaseId: string) {
    return savePatch(
      { component_versions: { ...versions, [componentId]: releaseId || null } },
      "Version saved."
    );
  }

  async function savePatch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
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

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
            <Boxes size={16} strokeWidth={2} className="text-blue-primary" />
            Components in this offering
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            An offering is a package, these are the software pieces inside it.
            Each keeps its own versions and features.
          </p>
        </div>
        {/* One group on the right, so the button never floats mid-row. */}
        <div className="flex shrink-0 items-center gap-2">
        {canEdit && (
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              setPicked([]);
              setPicking(true);
            }}
          >
            <Link2 size={14} strokeWidth={2.2} /> Connect component
          </Button>
        )}
        {connected.length > 0 && (
          <ViewSelect
            value={view}
            onChange={chooseView}
            tileValue="cards"
            tableValue="table"
          />
        )}
        </div>
      </div>

      {connected.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-white px-6 py-8 text-center">
          <p className="text-[13.5px] font-semibold text-text-primary">
            No components connected yet.
          </p>
          <p className="mx-auto mt-1 max-w-[440px] text-[12.5px] text-text-secondary">
            Connect the modules and agents this offering contains
            {canEdit ? (
              <>
                {" "}
               , or create one first in{" "}
                <Link href="/components" className="font-medium text-blue-primary hover:underline">
                  FDL Components
                </Link>
                .
              </>
            ) : (
              "."
            )}
          </p>
        </div>
      ) : (
        view === "table" ? (
        /* ROWS, WHEN YOU ARE COMPARING RATHER THAN READING (Anir, Aug 9:
           "again, we need a table view here, brother"). The version this
           offering covers stays editable in the row, because scanning is only
           half of why anyone opens this tab. */
        <div className="mt-4 overflow-x-auto rounded-xl border border-border-light bg-white">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="w-[28%] px-4 py-2.5">Component</th>
                <th className="w-[12%] px-3 py-2.5">Type</th>
                <th className="w-[16%] px-3 py-2.5">Current version</th>
                <th className="w-[9%] px-3 py-2.5">Versions</th>
                <th className="w-[9%] px-3 py-2.5">Features</th>
                <th className="w-[22%] px-3 py-2.5">Version covered</th>
                <th className="w-[4%] px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light stagger">
              {connected.map((component) => {
                const current = fdlCurrentVersion(component);
                return (
                  <tr
                    key={component.id}
                    className="group transition-colors hover:bg-blue-light/25"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/components/${component.id}?from=${encodeURIComponent(
                          `/offerings/${offeringId}?tab=components`
                        )}`}
                        className="flex min-w-0 items-center gap-2.5 text-[13px] font-semibold text-text-primary group-hover:text-blue-primary"
                      >
                        <OfferingIcon name={component.name} className="h-7 w-7 shrink-0" />
                        {component.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <FdlTypeChip type={component.type} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {current ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold tnum"
                          style={{
                            color: versionTone({ current: true }).color,
                            borderColor: versionTone({ current: true }).border,
                            background: versionTone({ current: true }).bg,
                          }}
                        >
                          {current}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-text-tertiary">
                          Not recorded
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-text-secondary tnum">
                      {component.releases.length}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-text-secondary tnum">
                      {component.features.length}
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <ColorSelect
                          value={versions[component.id] || ""}
                          onChange={(value) => void saveVersion(component.id, value)}
                          options={[
                            { value: "", label: "Not pinned", color: "#0071E3", icon: Clock },
                            ...component.releases.map((release) => ({
                              value: release.id,
                              label:
                                release.status === "released"
                                  ? `${release.version} · released`
                                  : `${release.version} · expected`,
                              color: release.status === "released" ? "#1A7A35" : "#6D28D9",
                              icon: release.status === "released" ? CircleCheck : Clock,
                            })),
                          ]}
                          ariaLabel={`Version of ${component.name} this offering covers`}
                          collapsible={false}
                          dense
                          minWidth={0}
                          className="w-full"
                        />
                      ) : (
                        <span className="text-[12.5px] text-text-secondary">
                          {component.releases.find(
                            (r) => r.id === versions[component.id]
                          )?.version || "Not pinned"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Disconnect ${component.name}`}
                          title="Disconnect from this offering"
                          onClick={() =>
                            void saveIds(
                              connected
                                .filter((c) => c.id !== component.id)
                                .map((c) => c.id),
                              `${component.name} disconnected.`
                            )
                          }
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                        >
                          <X size={13} strokeWidth={2} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 stagger">
          {connected.map((component) => {
            const current = fdlCurrentVersion(component);
            return (
              <div
                key={component.id}
                className="group relative rounded-xl border border-border-light bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg"
              >
                <Link
                  href={`/components/${component.id}?from=${encodeURIComponent(
                    `/offerings/${offeringId}?tab=components`
                  )}`}
                  className="block"
                >
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <OfferingIcon name={component.name} className="h-8 w-8 shrink-0" />
                      <p className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary">
                        {component.name}
                      </p>
                    </span>
                    <FdlTypeChip type={component.type} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-text-secondary">
                    {current ? `Current version ${current}` : "No version recorded yet"}
                    {" · "}
                    {component.releases.length}{" "}
                    {component.releases.length === 1 ? "version" : "versions"}
                    {" · "}
                    {component.features.length}{" "}
                    {component.features.length === 1 ? "feature" : "features"}
                  </p>
                </Link>

                {/* WHICH VERSION THIS OFFERING SELLS. Naming the component was
                    only half the answer — an offering scoped to V1 is a
                    different promise from one scoped to V2 (Suren, Aug 9). */}
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Version this offering covers
                  </p>
                  {canEdit ? (
                    <ColorSelect
                      value={versions[component.id] || ""}
                      onChange={(value) => void saveVersion(component.id, value)}
                      options={[
                        { value: "", label: "Not pinned", color: "#0071E3", icon: Clock },
                        ...component.releases.map((release) => ({
                          value: release.id,
                          label:
                            release.status === "released"
                              ? `${release.version} · released`
                              : `${release.version} · expected`,
                          color: release.status === "released" ? "#1A7A35" : "#6D28D9",
                          icon: release.status === "released" ? CircleCheck : Clock,
                        })),
                      ]}
                      ariaLabel={`Version of ${component.name} this offering covers`}
                      collapsible={false}
                      dense
                    />
                  ) : (
                    <p className="text-[13px] font-semibold text-text-primary">
                      {component.releases.find((r) => r.id === versions[component.id])
                        ?.version || "Not pinned"}
                    </p>
                  )}
                </div>

                {canEdit &&
                  (confirmDisconnect === component.id ? (
                    <span className="absolute right-3 top-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void saveIds(
                            connected.filter((c) => c.id !== component.id).map((c) => c.id),
                            `${component.name} disconnected.`
                          ).then(() => setConfirmDisconnect(null))
                        }
                        className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                      >
                        Disconnect?
                      </button>
                      <button
                        type="button"
                        aria-label="Keep it connected"
                        onClick={() => setConfirmDisconnect(null)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-text-tertiary hover:bg-surface"
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Disconnect ${component.name}`}
                      title="Disconnect from this offering"
                      onClick={() => setConfirmDisconnect(component.id)}
                      className="absolute right-3 top-3 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-text-tertiary opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
        )
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Connect components">
        {available.length === 0 ? (
          <div>
            <p className="text-[13px] text-text-secondary">
              Every existing component is already connected. Create a new one in{" "}
              <Link href="/components" className="font-medium text-blue-primary hover:underline">
                FDL Components
              </Link>{" "}
              first.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setPicking(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (picked.length === 0) return;
              const ok = await saveIds(
                [...connected.map((c) => c.id), ...picked],
                picked.length === 1 ? "Component connected." : `${picked.length} components connected.`
              );
              if (ok) setPicking(false);
            }}
            className="space-y-4"
          >
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {available.map((component) => {
                const active = picked.includes(component.id);
                return (
                  <li key={component.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked((prev) =>
                          active ? prev.filter((x) => x !== component.id) : [...prev, component.id]
                        )
                      }
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? "border-blue-primary bg-blue-light/50" : "border-border-light hover:border-blue-subtle"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          active ? "border-blue-primary bg-blue-primary text-white" : "border-border"
                        }`}
                      >
                        {active && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-text-primary">
                        {component.name}
                      </span>
                      <FdlTypeChip type={component.type} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/components"
                className="text-[12px] font-medium text-blue-primary hover:underline"
              >
                New FDL component →
              </Link>
              <div className="flex gap-2">
                <Button type="submit" disabled={picked.length === 0} loading={busy}>
                  <Plus size={14} strokeWidth={2.2} /> Connect
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
