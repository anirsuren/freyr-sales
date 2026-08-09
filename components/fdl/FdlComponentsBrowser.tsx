"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Boxes,
  ChevronRight,
  CircleCheck,
  Clock,
  Layers,
  Plus,
  Server,
  X,
} from "lucide-react";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import type { FdlComponent, FdlComponentType } from "@/lib/offerings";

/** One chip style per component type — color AND icon, never gray. */
export const FDL_TYPE_META: Record<
  FdlComponentType,
  { color: string; bg: string; border: string; Icon: typeof Layers }
> = {
  Module: {
    color: "#0040A0",
    bg: "rgba(0,113,227,0.10)",
    border: "rgba(0,113,227,0.25)",
    Icon: Layers,
  },
  Agent: {
    color: "#6D28D9",
    bg: "rgba(124,58,237,0.10)",
    border: "rgba(124,58,237,0.25)",
    Icon: Bot,
  },
  Platform: {
    color: "#0E7490",
    bg: "rgba(14,116,144,0.10)",
    border: "rgba(14,116,144,0.25)",
    Icon: Server,
  },
};

export function FdlTypeChip({ type }: { type: FdlComponentType }) {
  const meta = FDL_TYPE_META[type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
    >
      <meta.Icon size={11} strokeWidth={2.2} />
      {type}
    </span>
  );
}

/** The version sellers quote: the one marked current, else the latest released. */
export function fdlCurrentVersion(component: FdlComponent): string | null {
  const marked = component.releases.find((r) => r.current);
  if (marked) return marked.version;
  const released = component.releases
    .filter((r) => r.status === "released")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return released[0]?.version ?? null;
}

export function FdlComponentsBrowser({
  components,
  usedIn,
  canEdit,
}: {
  components: FdlComponent[];
  usedIn: Record<string, string[]>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FdlComponentType>("Module");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/fdl-components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create it.");
      toast(`${name.trim()} created.`);
      setAdding(false);
      setName("");
      router.refresh();
      if (data.component?.id) router.push(`/components/${data.component.id}`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not create it.", "error");
    } finally {
      setBusy(false);
    }
  }

  const newButton = canEdit && (
    <Button onClick={() => setAdding(true)}>
      <Plus size={14} strokeWidth={2.2} /> New FDL component
    </Button>
  );

  return (
    <section>
      {/* The create button lives IN the title row, exactly like the Offerings
          page header (Anir, Aug 8: "the new FDL component line should be
          aligned with the title… so much gap"). */}
      <PageHeader
        title="FDL Components"
        subtitle="Freya Digital components — the software pieces an offering is made of. Each keeps its own versions and features."
        action={components.length > 0 ? newButton : undefined}
      />
      {components.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center">
          <Boxes size={22} strokeWidth={1.8} className="mx-auto text-blue-primary" />
          <p className="mt-3 text-[14px] font-semibold text-text-primary">
            No components yet.
          </p>
          <p className="mx-auto mt-1 max-w-[440px] text-[12.5px] text-text-secondary">
            A component is one piece of software — a module, an agent, a
            platform — with its own versions and features. Create the first
            one, then connect it to the offerings that include it.
          </p>
          {canEdit && <div className="mt-4 flex justify-center">{newButton}</div>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {components.map((component) => {
              const current = fdlCurrentVersion(component);
              const homes = usedIn[component.id] ?? [];
              return (
                <Link
                  key={component.id}
                  href={`/components/${component.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-border-light bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg"
                >
                  {/* Same anatomy as an offering tile (Anir, Aug 8: "fdl
                      should really look pretty similar to the offerings
                      page"): branded icon tile, the type as a coloured
                      eyebrow, the name as the headline, chevron on the right. */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <OfferingIcon name={component.name} className="h-9 w-9 shrink-0" />
                      <div className="min-w-0">
                        <p
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.07em]"
                          style={{ color: FDL_TYPE_META[component.type].color }}
                        >
                          {(() => {
                            const TypeIcon = FDL_TYPE_META[component.type].Icon;
                            return <TypeIcon size={10} strokeWidth={2.6} aria-hidden="true" />;
                          })()}
                          {component.type}
                        </p>
                        <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-text-primary">
                          {component.name}
                        </h3>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      strokeWidth={1.6}
                      className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {current ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(26,122,53,0.25)] bg-[rgba(26,122,53,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#1A7A35]">
                        <CircleCheck size={11} strokeWidth={2.2} /> Current {current}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9]">
                        <Clock size={11} strokeWidth={2.2} /> No version yet
                      </span>
                    )}
                  </div>
                  <div className="mt-auto space-y-1 border-t border-border-light pt-3">
                    <p className="text-[12px] text-text-secondary">
                      {component.releases.length}{" "}
                      {component.releases.length === 1 ? "version" : "versions"}
                      {" · "}
                      {component.features.length}{" "}
                      {component.features.length === 1 ? "feature" : "features"}
                    </p>
                    <p className="text-[11.5px] text-text-tertiary">
                      {homes.length > 0
                        ? `In: ${homes.join(", ")}`
                        : "Not connected to an offering yet."}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New FDL component">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Component name
              <InfoHint text="What this piece of software is called — for example Register Module or PI Agent." />
            </label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Register Module"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">
              Component type
            </label>
            <div className="flex gap-2">
              {(Object.keys(FDL_TYPE_META) as FdlComponentType[]).map((option) => {
                const meta = FDL_TYPE_META[option];
                const active = type === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setType(option)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                    style={
                      active
                        ? { color: meta.color, background: meta.bg, borderColor: meta.border }
                        : undefined
                    }
                  >
                    <meta.Icon size={13} strokeWidth={2.2} />
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={busy}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()} loading={busy}>
              <Plus size={14} strokeWidth={2.2} /> Create component
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
