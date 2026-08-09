"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Check, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { FdlComponent } from "@/lib/offerings";
import {
  FdlTypeChip,
  fdlCurrentVersion,
} from "@/components/fdl/FdlComponentsBrowser";
import { OfferingIcon } from "@/components/ui/OfferingIcon";

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
  canEdit,
}: {
  offeringId: string;
  connected: FdlComponent[];
  all: FdlComponent[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

  const connectedIds = new Set(connected.map((c) => c.id));
  const available = all.filter((c) => !connectedIds.has(c.id));

  async function saveIds(ids: string[], done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_ids: ids }),
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
            An offering is a package — these are the software pieces inside it.
            Each keeps its own versions and features.
          </p>
        </div>
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
                — or create one first in{" "}
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
        <div className="mt-4 grid gap-3 md:grid-cols-2 stagger">
          {connected.map((component) => {
            const current = fdlCurrentVersion(component);
            return (
              <div
                key={component.id}
                className="group relative rounded-xl border border-border-light bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg"
              >
                <Link href={`/components/${component.id}`} className="block">
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
                <Button type="button" variant="secondary" onClick={() => setPicking(false)} disabled={busy}>
                  <X size={14} strokeWidth={2} /> Cancel
                </Button>
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
