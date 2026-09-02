"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  Link2,
  Plus,
  Unlink,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { ColorSelect } from "@/components/ui/ColorSelect";
import type { FdlComponent, FdlComponentType } from "@/lib/offerings";
import {
  downloadFeatureSheet,
  FDL_TYPE_META,
  FdlTypeChip,
  fdlCurrentVersion,
  VersionPill,
  withV,
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
  /**
   * MODULES AT THE TOP, AGENTS AT THE BOTTOM (Suren, Aug 13, with Anir: "can
   * the components' default view be that they're sorted or grouped… so at the
   * top, only those components which are modules to be shown, and then at the
   * bottom, only those which are agents").
   *
   * The tab used to list them in whatever order they happened to be connected,
   * so a package read as a jumble. An offering is a platform and its modules
   * with agents layered on top, and that is the order it should be read in.
   * Within a kind the existing order is kept, so nothing else shuffles.
   */
  const KIND_ORDER: FdlComponentType[] = ["Platform", "Module", "Agent"];
  const KIND_TITLE: Record<string, string> = {
    Platform: "Platforms",
    Module: "Modules",
    Agent: "Agents",
  };
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    title: KIND_TITLE[kind],
    items: connected.filter((c) => c.type === kind),
  })).filter((g) => g.items.length > 0);

  const available = all.filter((c) => !connectedIds.has(c.id));
  /** SEARCH IN THE CONNECT DIALOG (Anir, Aug 25: "for an offering owner in the
   *  FDL Components tab, when they try to connect a component, can you also add
   *  a search bar at the top in case they want to search for a specific
   *  component?"). Thirty-odd components in a 300px scroller is a hunt; every
   *  other picker in this app searches. */
  const [pickQuery, setPickQuery] = useState("");
  const pickQ = pickQuery.trim().toLowerCase();
  const availableShown = pickQ
    ? available.filter(
        (c) =>
          c.name.toLowerCase().includes(pickQ) ||
          c.type.toLowerCase().includes(pickQ)
      )
    : available;

  async function saveIds(ids: string[], done: string) {
    return savePatch({ component_ids: ids }, done);
  }

  /** TAKING A COMPONENT OUT OF THE PACKAGE (Anir, Aug 10: "can you also add the
   *  option for an Offering Owner to disconnect a component?"). It only edits
   *  this offering's list — the component itself, with its versions, features
   *  and customers, is untouched and stays in FDL Components, because the same
   *  component may well sit inside other offerings. */
  async function disconnect(component: FdlComponent) {
    return saveIds(
      connected.filter((c) => c.id !== component.id).map((c) => c.id),
      `${component.name} disconnected from this offering.`
    );
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
            FDL Components in this offering
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
            /* Blue, not outlined (Anir, Sep 2: "same here, blue button
               white font"). Connecting a component is the action this block
               exists for, so it wears the primary treatment rather than
               sitting quietly beside the view toggle. */
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
                <th className="w-[26%] px-4 py-2.5">Component</th>
                <th className="w-[11%] px-3 py-2.5">Type</th>
                <th className="w-[14%] px-3 py-2.5">Current version</th>
                <th className="w-[9%] px-3 py-2.5">Versions</th>
                <th className="w-[9%] px-3 py-2.5">Features</th>
                <th className="w-[18%] px-3 py-2.5">Version covered</th>
                <th className="w-[13%] px-3 py-2.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light stagger">
              {groups.map((group) => (
                <Fragment key={group.kind}>
                  {/* The band that says which kind you are looking at. A row
                      inside the table, not a second table, so every column
                      stays in one grid and nothing has to line up twice.

                      IT IS A REAL TITLE BAR, not a caption. At 10.5px on a
                      neutral tint it was smaller than the component names
                      underneath it, so "Modules" and "Agents" read as noise
                      above the list rather than as the thing dividing it
                      (Saras, Aug 14, change log #36). Now it carries the
                      kind's own tint and border and sits at heading size.

                      AND IT ONLY APPEARS WHEN IT DIVIDES SOMETHING. A band
                      reading "Modules (5)" above five rows whose Type column
                      already says Module on every one is a header for a
                      grouping that isn't happening (Anir, Aug 14: "I don't
                      understand what that is"). Suren asked for modules at the
                      top and agents at the bottom, which only means anything
                      when an offering holds both — today that is
                      Freya.intelligence and Freya.GRR-PAC. One kind, no
                      divider. */}
                  {groups.length > 1 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="border-y px-4 py-2"
                      style={{
                        background: FDL_TYPE_META[group.kind].bg,
                        borderColor: FDL_TYPE_META[group.kind].border,
                      }}
                    >
                      <span
                        className="inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.01em]"
                        style={{ color: FDL_TYPE_META[group.kind].color }}
                      >
                        {(() => {
                          const KindIcon = FDL_TYPE_META[group.kind].Icon;
                          return <KindIcon size={15} strokeWidth={2.4} aria-hidden="true" />;
                        })()}
                        {group.title}
                        <span className="tnum font-semibold opacity-70">
                          ({group.items.length})
                        </span>
                      </span>
                    </td>
                  </tr>
                  )}
                  {group.items.map((component) => {
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
                        <VersionPill version={current} current />
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
                              label: withV(release.version),
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
                          {(() => {
                            const pinned = component.releases.find(
                              (r) => r.id === versions[component.id]
                            );
                            return pinned ? withV(pinned.version) : "Not pinned";
                          })()}
                        </span>
                      )}
                    </td>
                    {/* THREE ACTIONS, NOT ONE (Anir, Aug 10: "the last column
                        here should be actions, and it should have two or three
                        actions"). The same three the components directory
                        offers, so the row behaves the same wherever you meet
                        it: take the feature sheet, take it out of this
                        package, or open it. */}
                    <td className="px-3 py-2.5 text-right">
                      {/* -mr-1.5 is optical alignment, not a nudge: the last
                          glyph sits ~6px inside its own 28px hit area, so a
                          header aligned to the box edge reads as overhanging
                          (Anir, Aug 10: "why is the actions header aligned like
                          that"). This lines the glyph up with the heading. */}
                      <span className="-ml-1.5 inline-flex items-center justify-start gap-1">
                        <Tooltip label="Download the feature sheet">
                          <button
                            type="button"
                            aria-label={`Download the ${component.name} feature sheet`}
                            onClick={() => {
                              downloadFeatureSheet(component);
                              toast(`${component.name} feature sheet downloaded.`);
                            }}
                            disabled={component.features.length === 0}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Download size={14} strokeWidth={2} />
                          </button>
                        </Tooltip>
                        {canEdit && (
                            <Tooltip label="Take it out of this offering">
                              <button
                                type="button"
                                aria-label={`Disconnect ${component.name}`}
                                onClick={() => setConfirmDisconnect(component.id)}
                                // Red at rest: this one changes what the
                                // package contains, so it should read as
                                // consequential before you reach it.
                                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                              >
                                <Unlink size={14} strokeWidth={2} />
                              </button>
                            </Tooltip>
                          )}
                        <Tooltip label={`Open ${component.name}`}>
                          <Link
                            href={`/components/${component.id}?from=${encodeURIComponent(
                              `/offerings/${offeringId}?tab=components`
                            )}`}
                            aria-label={`Open ${component.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <ChevronRight size={15} strokeWidth={2.2} />
                          </Link>
                        </Tooltip>
                      </span>
                    </td>
                  </tr>
                );
              })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
          <div key={group.kind}>
            {/* Same title bar as the table view, and on the same condition:
                it only appears when there is more than one kind to divide
                (change log #36, then Anir, Aug 14). */}
            {groups.length > 1 && (
            <p
              className="mb-2.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-bold tracking-[0.01em]"
              style={{
                color: FDL_TYPE_META[group.kind].color,
                background: FDL_TYPE_META[group.kind].bg,
                borderColor: FDL_TYPE_META[group.kind].border,
              }}
            >
              {(() => {
                const KindIcon = FDL_TYPE_META[group.kind].Icon;
                return <KindIcon size={15} strokeWidth={2.4} aria-hidden="true" />;
              })()}
              {group.title}
              <span className="tnum font-semibold opacity-70">
                ({group.items.length})
              </span>
            </p>
            )}
            {/* Three to a row (Saras, Aug 27: "can you make 3 FDL Component
                tiles fit in 1 row... instead of the current 2"). Two tiles
                left a third of the width empty on every odd count. */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">
          {group.items.map((component) => {
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
                  {/* THE COUNTS LINE IS FOR PEOPLE WHO MAINTAIN COMPONENTS,
                      NOT PEOPLE WHO SELL THEM (Saras, Aug 24: "within FDL
                      Components, for a sales rep specifically, can you remove
                      this entire row for each component — number of versions,
                      number of features and so on? We can just have the name
                      of the component, this Module part, and which version
                      this offering powers").

                      A rep in a customer conversation needs the version this
                      offering is scoped to, which is the labelled field right
                      below; "3 versions · 7 features" is inventory detail that
                      lives on the component's own page. Owners and admins keep
                      it, because for them it IS the state of the thing they
                      maintain. */}
                  {canEdit && (
                    <p className="mt-1.5 text-[12.5px] text-text-secondary">
                      {current
                        ? `Current version ${withV(current)}`
                        : "No version recorded yet"}
                      {" · "}
                      {component.releases.length}{" "}
                      {component.releases.length === 1 ? "version" : "versions"}
                      {" · "}
                      {component.features.length}{" "}
                      {component.features.length === 1 ? "feature" : "features"}
                    </p>
                  )}
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
                          label: withV(release.version),
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
                      {(() => {
                        const pinned = component.releases.find(
                          (r) => r.id === versions[component.id]
                        );
                        return pinned ? withV(pinned.version) : "Not pinned";
                      })()}
                    </p>
                  )}
                </div>

                {canEdit && (
                    <button
                      type="button"
                      aria-label={`Disconnect ${component.name}`}
                      title="Disconnect from this offering"
                      onClick={() => setConfirmDisconnect(component.id)}
                      className="absolute right-3 top-3 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                    >
                      <Unlink size={13} strokeWidth={2} />
                    </button>
                  )}
              </div>
            );
          })}
            </div>
          </div>
          ))}
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
            <div className="relative">
              <Search
                size={14}
                strokeWidth={2}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                autoFocus
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Search components…"
                aria-label="Search components"
                className="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
            </div>
            {availableShown.length === 0 ? (
              <p className="px-1 py-6 text-center text-[12.5px] text-text-tertiary">
                No component matches “{pickQuery.trim()}”.
              </p>
            ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {availableShown.map((component) => {
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
            )}
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
      {/* A REAL CONFIRMATION (Anir, Aug 12: "it should be like a pop-up that
          says either Disconnect in red or Cancel… like normal"). The floating
          "Disconnect?" chip read as a mistake, not a decision. */}
      <Modal
        open={confirmDisconnect !== null}
        onClose={() => setConfirmDisconnect(null)}
        title="Disconnect this component?"
      >
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {(() => {
            const c = connected.find((x) => x.id === confirmDisconnect);
            return c
              ? `${c.name} stops being part of this offering. The component itself, its versions and its files are untouched. You can connect it again any time.`
              : "";
          })()}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDisconnect(null)}
            className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const c = connected.find((x) => x.id === confirmDisconnect);
              if (!c) return;
              void disconnect(c).then(() => setConfirmDisconnect(null));
            }}
            className="cursor-pointer rounded-full bg-error px-4 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </Modal>
    </section>

  );
}
