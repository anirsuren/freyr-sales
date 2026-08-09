"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Boxes,
  ChevronRight,
  CircleCheck,
  Clock,
  Layers,
  LayoutGrid,
  Package,
  Table2,
  Unplug,
  Plus,
  Search,
  Server,
  X,
} from "lucide-react";
import { OfferingIcon, ServiceTag, offeringMark } from "@/components/ui/OfferingIcon";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
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

/** The sentinel for "belongs to no offering", which is a real answer here and
 *  not the absence of one. */
const UNCONNECTED = "\u0000none";

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
  // FOURTEEN COMPONENTS ALREADY, AND MORE COMING. Offerings and Customers both
  // open with a search; this page made you read the grid (Anir, Aug 9: "we
  // probably need a search bar on the [FDL] fold, just saying").
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // TWO MORE WAYS TO NARROW 55 COMPONENTS (Anir, Aug 9: "add maybe 2 more
  // dropdown filters"). Type answers "what kind of thing is it"; these answer
  // the two questions a seller actually opens this page with: which offering
  // does it belong to, and is it shippable yet.
  const [offeringFilter, setOfferingFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  // TILES OR A TABLE, THE SAME CHOICE OFFERINGS OFFERS (Anir, Aug 9: "need an
  // option for table here just like offerings page, don't cut corners"). Tiles
  // are for browsing 55 things by eye; the table is for comparing them column
  // by column. The choice is remembered per browser, exactly as the offerings
  // page remembers it, so the page opens the way you left it.
  const [view, setView] = useState<"tile" | "table">("tile");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("freyr.components.view");
      if (saved === "table" || saved === "tile") setView(saved);
    } catch {
      /* private mode: fall back to tiles */
    }
  }, []);
  function chooseView(next: "tile" | "table") {
    setView(next);
    try {
      window.localStorage.setItem("freyr.components.view", next);
    } catch {
      /* nothing to remember, the page still works */
    }
  }

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

  // Every offering that owns at least one component, so the picker never
  // offers a choice that returns nothing.
  const offeringNames = Array.from(
    new Set(Object.values(usedIn).flat())
  ).sort((a, b) => a.localeCompare(b));

  const q = query.trim().toLowerCase();
  const shown = components.filter(
    (component) => {
      const homes = usedIn[component.id] ?? [];
      const matchesOffering =
        offeringFilter.length === 0 ||
        offeringFilter.some((pick) =>
          pick === UNCONNECTED ? homes.length === 0 : homes.includes(pick)
        );
      const hasCurrent = Boolean(fdlCurrentVersion(component));
      const hasNext = component.releases.some((r) => r.status === "next");
      const matchesState =
        !stateFilter ||
        (stateFilter === "shipping" && hasCurrent) ||
        (stateFilter === "unreleased" && !hasCurrent) ||
        (stateFilter === "next" && hasNext);
      return matchesOffering && matchesState;
    }
  ).filter(
    (component) =>
      (!typeFilter || component.type === typeFilter) &&
      (!q ||
        component.name.toLowerCase().includes(q) ||
        component.type.toLowerCase().includes(q) ||
        component.releases.some((r) => r.version.toLowerCase().includes(q)) ||
        component.features.some((f) => f.name.toLowerCase().includes(q)))
  );

  return (
    <section>
      {/* The create button lives IN the title row, exactly like the Offerings
          page header (Anir, Aug 8: "the new FDL component line should be
          aligned with the title… so much gap"). */}
      <PageHeader
        title="FDL Components"
        subtitle="Freya Digital components, the software pieces an offering is made of. Each keeps its own versions and features."
        action={components.length > 0 ? newButton : undefined}
      />
      {components.length > 0 && (
        <div className="rise-in mb-5 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-[340px]">
            <Search
              size={15}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search components…"
              aria-label="Search components"
              className="w-full rounded-lg border border-border-light bg-white py-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
            />
          </label>
          <ColorSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Filter by component type"
            dense
            collapsible={false}
            className="w-[160px] shrink-0"
            options={[
              { value: "", label: "All types", color: "#0071E3", icon: Boxes },
              ...(["Module", "Agent", "Platform"] as FdlComponentType[]).map((t) => ({
                value: t,
                label: t,
                color: FDL_TYPE_META[t].color,
                icon: FDL_TYPE_META[t].Icon,
              })),
            ]}
          />
          <MultiColorSelect
            values={offeringFilter}
            onChange={setOfferingFilter}
            allLabel="All offerings"
            allIcon={Package}
            ariaLabel="Filter by offering"
            dense
            collapsible={false}
            width={186}
            options={[
              // The SAME hue and glyph the offering wears everywhere else
              // (Anir, Aug 9: "make sure to have the right colors for each
              // offering"). offeringMark is the one place that decides an
              // offering's identity, so the filter, the chips in the table and
              // the tiles on /offerings can never drift apart.
              ...offeringNames.map((name) => {
                const mark = offeringMark(name);
                return {
                  value: name,
                  label: name,
                  color: mark.color,
                  icon: mark.icon,
                };
              }),
              {
                value: UNCONNECTED,
                label: "Not in an offering yet",
                color: "#6D28D9",
                icon: Unplug,
              },
            ]}
          />
          <ColorSelect
            value={stateFilter}
            onChange={setStateFilter}
            ariaLabel="Filter by release state"
            dense
            collapsible={false}
            className="w-[178px] shrink-0"
            options={[
              { value: "", label: "Any release state", color: "#0071E3", icon: Boxes },
              {
                value: "shipping",
                label: "Has a current version",
                color: "#1A7A35",
                icon: CircleCheck,
              },
              {
                value: "unreleased",
                label: "No version yet",
                color: "#6D28D9",
                icon: Clock,
              },
              {
                value: "next",
                label: "Next version planned",
                color: "#0E7490",
                icon: Layers,
              },
            ]}
          />
          <span className="ml-auto text-[12.5px] text-text-secondary tnum">
            {shown.length === components.length
              ? `${components.length} components`
              : `${shown.length} of ${components.length}`}
          </span>
          {/* One button, same as Offerings: the icon shows where the click
              takes you rather than spending double the width on a segmented
              control. */}
          <button
            type="button"
            onClick={() => chooseView(view === "tile" ? "table" : "tile")}
            aria-label={view === "tile" ? "Switch to table view" : "Switch to tile view"}
            title={view === "tile" ? "Switch to table view" : "Switch to tile view"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
          >
            {view === "tile" ? (
              <Table2 size={15} strokeWidth={2} />
            ) : (
              <LayoutGrid size={15} strokeWidth={2} />
            )}
          </button>
        </div>
      )}

      {components.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center">
          <Boxes size={22} strokeWidth={1.8} className="mx-auto text-blue-primary" />
          <p className="mt-3 text-[14px] font-semibold text-text-primary">
            No components yet.
          </p>
          <p className="mx-auto mt-1 max-w-[440px] text-[12.5px] text-text-secondary">
            A component is one piece of software, a module, an agent, a
            platform, with its own versions and features. Create the first
            one, then connect it to the offerings that include it.
          </p>
          {canEdit && <div className="mt-4 flex justify-center">{newButton}</div>}
        </div>
      ) : (
        // key=view re-mounts the panel so the switch animates, the same trick
        // the team roster and the customer tabs use.
        <div key={view} className="tab-panel">
          {view === "tile" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {shown.map((component) => {
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
                    {/* The offerings this component ships in, each wearing its
                        own mark rather than a grey "In: Freya.Register" run-on
                        (Anir, Aug 9: "same thing here on each FDL component in
                        the tiles view"). Same ServiceTag as the table, so a
                        component reads the same whichever view you are in. */}
                    {homes.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {homes.map((home) => (
                          <ServiceTag
                            key={home}
                            name={home}
                            className="text-[11px]"
                          />
                        ))}
                      </span>
                    ) : (
                      <p className="text-[11.5px] text-text-tertiary">
                        Not connected to an offering yet.
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          ) : (
            /* THE TABLE. Every column is a fact already on the tile, but laid
               out so 55 rows can be read down a column instead of hunted
               across 55 cards: what kind of thing it is, the version being
               quoted, how much is in it, and which offerings ship it. */
            <div className="overflow-x-auto rounded-xl border border-border-light bg-white shadow-card">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
                    <th className="w-[26%] px-5 py-2.5">Component</th>
                    <th className="w-[12%] px-4 py-2.5">Type</th>
                    <th className="w-[16%] px-4 py-2.5">Current version</th>
                    <th className="w-[10%] px-4 py-2.5 text-right">Versions</th>
                    <th className="w-[10%] px-4 py-2.5 text-right">Features</th>
                    <th className="w-[26%] px-4 py-2.5">In offerings</th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {shown.map((component) => {
                    const current = fdlCurrentVersion(component);
                    const homes = usedIn[component.id] ?? [];
                    const meta = FDL_TYPE_META[component.type];
                    return (
                      <tr
                        key={component.id}
                        onClick={() => router.push(`/components/${component.id}`)}
                        className="group cursor-pointer border-b border-border-light transition-colors last:border-0 hover:bg-blue-light/30"
                      >
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/components/${component.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex min-w-0 items-center gap-2.5"
                          >
                            <OfferingIcon
                              name={component.name}
                              className="h-8 w-8 shrink-0"
                            />
                            <span className="min-w-0 text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                              {component.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              color: meta.color,
                              background: meta.bg,
                              borderColor: meta.border,
                            }}
                          >
                            <meta.Icon size={11} strokeWidth={2.2} />
                            {component.type}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {current ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(26,122,53,0.25)] bg-[rgba(26,122,53,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#1A7A35]">
                              <CircleCheck size={11} strokeWidth={2.2} /> {current}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9]">
                              <Clock size={11} strokeWidth={2.2} /> None yet
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12.5px] text-text-secondary tnum">
                          {component.releases.length}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12.5px] text-text-secondary tnum">
                          {component.features.length}
                        </td>
                        <td className="px-4 py-2.5">
                          {homes.length === 0 ? (
                            <span className="text-[12px] text-text-tertiary">
                              Not connected yet
                            </span>
                          ) : (
                            /* ServiceTag is how an offering names itself
                               everywhere in the app: its own hue, its own
                               glyph. A row of identical grey pills with the
                               same blue box told you nothing about WHICH
                               offering you were looking at. */
                            <span className="flex flex-wrap gap-1">
                              {homes.map((home) => (
                                <ServiceTag
                                  key={home}
                                  name={home}
                                  className="text-[11px]"
                                />
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
              <InfoHint text="What this piece of software is called, for example Register Module or PI Agent." />
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
