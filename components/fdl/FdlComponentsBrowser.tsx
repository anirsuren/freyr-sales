"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Boxes, Layers, Plus, Server, X } from "lucide-react";
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
    <section className="mt-5">
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
          <div className="mb-3 flex items-center justify-end">{newButton}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {components.map((component) => {
              const current = fdlCurrentVersion(component);
              const homes = usedIn[component.id] ?? [];
              return (
                <Link
                  key={component.id}
                  href={`/components/${component.id}`}
                  className="group rounded-xl border border-border-light bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {component.name}
                    </p>
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
                  <p className="mt-2 text-[11.5px] text-text-tertiary">
                    {homes.length > 0
                      ? `In: ${homes.join(", ")}`
                      : "Not connected to an offering yet."}
                  </p>
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
