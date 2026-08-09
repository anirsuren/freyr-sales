"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Check, LayoutGrid, Link2, Plus, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { useToast } from "@/components/ui/Toast";
import {
  FdlTypeChip,
  fdlCurrentVersion,
} from "@/components/fdl/FdlComponentsBrowser";
import type { CustomerComponentLink } from "@/lib/types";
import type { FdlComponent } from "@/lib/offerings";
import { formatDate } from "@/lib/utils";
import { CircleCheck, Clock, Rocket } from "lucide-react";

/**
 * WHAT SOFTWARE THIS CUSTOMER ACTUALLY RUNS (Suren, Aug 8, via Anir): "from a
 * customer side you should be able to connect customer to all components —
 * which release of the version of the component they are connecting. So any
 * time when I look at what are all the software components the customer has,
 * I click on the customer, I'm looking at this page."
 *
 * A component is connected with the version they are LIVE on, and optionally
 * the version they are moving to next — the two columns Freyr keeps in the
 * workbook. Everything is pinned by id, so a component renamed or re-versioned
 * in FDL Components stays correct here.
 */
export function CustomerDigitalComponents({
  customerId,
  links,
  components,
  canEdit,
}: {
  customerId: string;
  links: CustomerComponentLink[];
  components: FdlComponent[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<CustomerComponentLink[]>(links);
  // TILES OR ROWS, the same choice the components list offers (Anir, Aug 9:
  // "again, here I would like a table row view thing"). Cards are for reading
  // one component; the table is for scanning which of ten are behind.
  const [view, setView] = useState<"cards" | "table">("cards");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("freyr.customerComponents.view");
      if (saved === "table" || saved === "cards") setView(saved);
    } catch {
      /* private mode keeps cards */
    }
  }, []);
  function chooseView(next: "cards" | "table") {
    setView(next);
    try {
      window.localStorage.setItem("freyr.customerComponents.view", next);
    } catch {
      /* nothing to remember */
    }
  }
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const byId = new Map(components.map((component) => [component.id, component]));
  const connectedIds = new Set(state.map((link) => link.component_id));
  const available = components.filter(
    (component) => !connectedIds.has(component.id)
  );

  async function save(next: CustomerComponentLink[], done: string) {
    setState(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digital_components: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(done);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save that.", "error");
      }
    } catch {
      toast("Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  function versionOptions(component: FdlComponent): ColorOption[] {
    return [
      { value: "", label: "Version not recorded", color: "#0071E3", icon: Clock },
      ...component.releases.map((release) => ({
        value: release.id,
        label:
          release.status === "released"
            ? `${release.version} · released`
            : `${release.version} · expected`,
        color: release.status === "released" ? "#1A7A35" : "#6D28D9",
        icon: release.status === "released" ? CircleCheck : Clock,
      })),
    ];
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
            <Boxes size={16} strokeWidth={2} className="text-blue-primary" />
            Digital components
            <InfoHint text="The Freya software this customer runs, and which version. Connect one here and you can open its versions and features in FDL Components." />
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            Everything this customer runs today, and which version of each.
          </p>
        </div>
        {/* ONE GROUP ON THE RIGHT (Anir, Aug 9: "why is the connect component
            button just in the middle? It should be to the left of the tile
            dropdown thing"). Three children under justify-between space
            themselves evenly, so the button was parked in the gap between the
            heading and the view toggle rather than sitting with the control it
            belongs beside. */}
        <div className="flex shrink-0 items-center gap-2">
        {canEdit && (
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={busy}
            onClick={() => {
              setPicked([]);
              setPicking(true);
            }}
          >
            <Link2 size={14} strokeWidth={2.2} /> Connect component
          </Button>
        )}
        {state.length > 0 && (
          <button
            type="button"
            onClick={() => chooseView(view === "cards" ? "table" : "cards")}
            aria-label={view === "cards" ? "Switch to table view" : "Switch to card view"}
            title={view === "cards" ? "Switch to table view" : "Switch to card view"}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
          >
            {view === "cards" ? (
              <Table2 size={15} strokeWidth={2} />
            ) : (
              <LayoutGrid size={15} strokeWidth={2} />
            )}
          </button>
        )}
        </div>
      </div>

      {state.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-white px-6 py-8 text-center">
          <p className="text-[13.5px] font-semibold text-text-primary">
            No components connected yet.
          </p>
          <p className="mx-auto mt-1 max-w-[460px] text-[12.5px] text-text-secondary">
            Connect the modules and agents this customer runs, and record the version each one is on. This is what the account team reads before a renewal conversation.
          </p>
        </div>
      ) : (
        view === "table" ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border-light bg-white">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="w-[30%] px-4 py-2.5">Component</th>
                <th className="w-[14%] px-3 py-2.5">Type</th>
                <th className="w-[18%] px-3 py-2.5">Current version</th>
                <th className="w-[20%] px-3 py-2.5">Version status</th>
                <th className="w-[18%] px-3 py-2.5">Next version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light stagger">
              {state.map((link) => {
                const component = byId.get(link.component_id);
                if (!component) return null;
                const live = component.releases.find(
                  (release) => release.id === link.release_id
                );
                const next = component.releases.find(
                  (release) => release.id === link.next_release_id
                );
                return (
                  <tr
                    key={link.component_id}
                    className="group transition-colors hover:bg-blue-light/25"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/components/${component.id}`}
                        className="flex min-w-0 items-center gap-2.5 text-[13px] font-semibold text-text-primary group-hover:text-blue-primary"
                      >
                        <OfferingIcon
                          name={component.name}
                          className="h-7 w-7 shrink-0"
                        />
                        {component.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <FdlTypeChip type={component.type} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] font-semibold text-text-primary tnum">
                      {live ? live.version : (
                        <span className="font-normal text-text-tertiary">
                          Not recorded
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-text-secondary">
                      {link.release_status === "released"
                        ? "Released to them"
                        : link.release_status === "expected"
                          ? "Expected by them"
                          : (
                            <span className="text-text-tertiary">Not set yet</span>
                          )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-text-secondary tnum">
                      {next ? next.version : (
                        <span className="text-text-tertiary">Not planned</span>
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
          {state.map((link) => {
            const component = byId.get(link.component_id);
            if (!component) return null;
            const live = component.releases.find(
              (release) => release.id === link.release_id
            );
            const next = component.releases.find(
              (release) => release.id === link.next_release_id
            );
            const latest = fdlCurrentVersion(component);
            const behind = !!live && !!latest && live.version !== latest;
            return (
              <div
                key={link.component_id}
                className="group relative rounded-xl border border-border-light bg-white p-4 shadow-card transition-all hover:border-blue-subtle hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3 pr-8">
                  <Link
                    href={`/components/${component.id}?from=${encodeURIComponent(
                      `/customers/${customerId}?tab=components`
                    )}`}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <OfferingIcon
                      name={component.name}
                      className="h-8 w-8 shrink-0"
                    />
                    <p className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {component.name}
                    </p>
                  </Link>
                  <FdlTypeChip type={component.type} />
                </div>

                {/* THREE FIELDS, ONE ROW (Anir, Aug 9: "I don't like those
                    drop-downs, there are two drop-downs and then one drop-down,
                    it's very confusing"). Two-up then one-wide made the third
                    field look like it belonged to something else, when all
                    three answer the same question: where is this account on
                    this component. */}
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Current version
                      <InfoHint text="The version of this software the customer is on right now." />
                    </p>
                    {canEdit ? (
                      <ColorSelect
                        value={link.release_id || ""}
                        onChange={(value) =>
                          void save(
                            state.map((item) =>
                              item.component_id === link.component_id
                                ? { ...item, release_id: value || null }
                                : item
                            ),
                            "Version saved."
                          )
                        }
                        options={versionOptions(component)}
                        ariaLabel={`Version of ${component.name}`}
                        collapsible={false}
                        dense
                        minWidth={0}
                        className="w-full"
                      />
                    ) : (
                      <p className="text-[13px] font-semibold text-text-primary">
                        {live ? live.version : "Not set yet"}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Version status
                      <InfoHint text="Released means we have given them this version. Expected means they are waiting for it." />
                    </p>
                    {canEdit ? (
                      <ColorSelect
                        value={link.release_status || ""}
                        onChange={(value) =>
                          void save(
                            state.map((item) =>
                              item.component_id === link.component_id
                                ? {
                                    ...item,
                                    release_status:
                                      value === "released" || value === "expected"
                                        ? value
                                        : null,
                                  }
                                : item
                            ),
                            "Status saved."
                          )
                        }
                        options={[
                          { value: "", label: "Not set yet", color: "#0071E3", icon: Clock },
                          {
                            value: "released",
                            label: "Released to them",
                            color: "#1A7A35",
                            icon: CircleCheck,
                          },
                          {
                            value: "expected",
                            label: "Expected by them",
                            color: "#6D28D9",
                            icon: Clock,
                          },
                        ]}
                        ariaLabel={`Is ${component.name} released to this customer`}
                        collapsible={false}
                        dense
                        minWidth={0}
                        className="w-full"
                      />
                    ) : (
                      <p className="text-[13px] font-semibold text-text-primary">
                        {link.release_status === "released"
                          ? "Released to them"
                          : link.release_status === "expected"
                            ? "Expected by them"
                            : "Not set yet"}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Next version
                      <InfoHint text="The version they move to after this one. Leave it empty if nothing is planned." />
                    </p>
                    {canEdit ? (
                      <ColorSelect
                        value={link.next_release_id || ""}
                        onChange={(value) =>
                          void save(
                            state.map((item) =>
                              item.component_id === link.component_id
                                ? { ...item, next_release_id: value || null }
                                : item
                            ),
                            "Next version saved."
                          )
                        }
                        options={versionOptions(component)}
                        ariaLabel={`Next version for ${component.name}`}
                        collapsible={false}
                        dense
                        minWidth={0}
                        className="w-full"
                      />
                    ) : (
                      <p className="text-[13px] font-semibold text-text-primary">
                        {next ? next.version : "Not set yet"}
                      </p>
                    )}
                  </div>
                </div>

                <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px] text-text-tertiary">
                  {/* "LIVE SINCE" ONLY IF IT IS (Anir, Aug 9: "something's
                      wrong here, it isn't even September yet, it says September
                      1"). The label assumed every recorded date was in the
                      past, so a release still ahead of us read as one this
                      account had been running for months. A future date is a
                      plan, and the wording now says so. */}
                  {live?.date &&
                    (new Date(`${live.date}T00:00:00`) > new Date() ||
                    live.status === "next" ? (
                      <span className="tnum">Due {formatDate(live.date)}</span>
                    ) : (
                      <span className="tnum">Live since {formatDate(live.date)}</span>
                    ))}
                  {behind && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(194,65,12,0.25)] bg-[rgba(194,65,12,0.08)] px-2 py-0.5 font-semibold text-[color:#C2410C]">
                      <Rocket size={10} strokeWidth={2.4} /> {latest} is out
                    </span>
                  )}
                </p>

                {canEdit &&
                  (confirmRemove === link.component_id ? (
                    <span className="absolute right-3 top-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRemove(null);
                          void save(
                            state.filter(
                              (item) => item.component_id !== link.component_id
                            ),
                            `${component.name} removed.`
                          );
                        }}
                        className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                      >
                        Remove?
                      </button>
                      <button
                        type="button"
                        aria-label="Keep it"
                        onClick={() => setConfirmRemove(null)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-text-tertiary hover:bg-surface"
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${component.name}`}
                      title="This customer no longer runs it"
                      onClick={() => setConfirmRemove(link.component_id)}
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

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Connect components"
      >
        {available.length === 0 ? (
          <div>
            <p className="text-[13px] text-text-secondary">
              Every component is already connected to this customer. New ones
              are created in{" "}
              <Link
                href="/components"
                className="font-medium text-blue-primary hover:underline"
              >
                FDL Components
              </Link>
              .
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
              if (!picked.length) return;
              // NO GUESSED VERSION. It used to default to whatever was current,
              // which is a claim about the customer nobody made (Suren, Aug 9:
              // "how did you pick version 1.04 automatically?"). The row lands
              // blank and asks.
              const additions: CustomerComponentLink[] = picked.map((id) => ({
                component_id: id,
                release_id: null,
                next_release_id: null,
                release_status: null,
              }));
              await save(
                [...state, ...additions],
                picked.length === 1
                  ? "Component connected."
                  : `${picked.length} components connected.`
              );
              setPicking(false);
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
                          active
                            ? prev.filter((x) => x !== component.id)
                            : [...prev, component.id]
                        )
                      }
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-blue-primary bg-blue-light/50"
                          : "border-border-light hover:border-blue-subtle"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          active
                            ? "border-blue-primary bg-blue-primary text-white"
                            : "border-border"
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPicking(false)}
                disabled={busy}
              >
                <X size={14} strokeWidth={2} /> Cancel
              </Button>
              <Button type="submit" disabled={!picked.length} loading={busy}>
                <Plus size={14} strokeWidth={2.2} /> Connect
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
