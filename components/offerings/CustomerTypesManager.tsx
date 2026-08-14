"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// The five family icons that used to be listed here came with the local
// FAMILY_META copy; they now travel with CUSTOMER_FAMILY_META instead.
import { Plus, ArrowRight, X, Pencil, Store, Building, Building2, Globe2, type LucideIcon } from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type {
  CustomerType,
  Market,
  CustomerFamily,
  CustomerSize,
} from "@/lib/offerings";
import { listAccent } from "./filterPalette";
import { CUSTOMER_FAMILY_META } from "@/lib/customerFamilies";
import { flagForGeography } from "@/lib/countryFlags";

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1";
const FAMILIES: CustomerFamily[] = [
  "Pharmaceutical",
  "Biologics",
  "Bio Pharmaceutical",
  "Medical Devices",
  "Consumer Products",
];
const SIZES: CustomerSize[] = ["Small", "Mid size", "Large"];

// Colour + icon per family and size (chip rule: never a plain chip).
//
// The family half is NOT redeclared here any more. This file used to hold its
// own copy under a comment promising it "matches familyColor() on the
// offerings page", and that promise is exactly what broke: the shared table
// moved Consumer Products off rust and these three separate copies did not
// (Anir, Aug 14). One import cannot drift.
const FAMILY_META = CUSTOMER_FAMILY_META;
const SIZE_META: Record<CustomerSize, { color: string; icon: LucideIcon }> = {
  Small: { color: "#0891B2", icon: Store },
  "Mid size": { color: "#0891B2", icon: Building },
  Large: { color: "#0071E3", icon: Building2 },
};

export function CustomerTypesManager({
  customerTypes,
  markets,
  typeCounts = {},
  marketCounts = {},
  canEdit = true,
  canManageLists = false,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  typeCounts?: Record<string, number>;
  marketCounts?: Record<string, number>;
  canEdit?: boolean;
  /** EDITING an existing definition, as opposed to adding a new one. Admin
   *  only (Saras, Aug 14, change log #37) — a narrower gate than `canEdit`,
   *  which is admin + manager and stays exactly as it was. */
  canManageLists?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [addingMarket, setAddingMarket] = useState(false);
  const [busy, setBusy] = useState(false);

  const [family, setFamily] = useState<CustomerFamily>("Pharmaceutical");
  const [size, setSize] = useState<CustomerSize>("Small");
  const [productType, setProductType] = useState("");
  const [revenue, setRevenue] = useState("");
  const [employees, setEmployees] = useState("");
  const [focus, setFocus] = useState("");
  const [newMarket, setNewMarket] = useState("");
  // Markets in use by offerings get a confirm step before removal — deleting one
  // cascades, unmapping it from every offering.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // EDITING AN EXISTING DEFINITION (change log #37). Separate state from the
  // add form on purpose: opening the editor must never inherit half-typed text
  // from an abandoned add, and cancelling an edit must leave the add form
  // alone.
  const [editingType, setEditingType] = useState<CustomerType | null>(null);
  const [editDraft, setEditDraft] = useState({
    product_type: "",
    revenue: "",
    employees: "",
    operational_focus: "",
  });
  const [editingMarket, setEditingMarket] = useState<Market | null>(null);
  const [marketDraft, setMarketDraft] = useState("");

  function openTypeEditor(t: CustomerType) {
    setEditingType(t);
    setEditDraft({
      product_type: t.product_type || "",
      revenue: t.revenue || "",
      employees: t.employees || "",
      operational_focus: t.operational_focus || "",
    });
  }

  async function saveType() {
    if (!editingType) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer-types/${editingType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Saved ${data.customerType.name}.`);
        setEditingType(null);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the customer type.", "error");
      }
    } catch {
      toast("Couldn't save the customer type.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveMarketName() {
    if (!editingMarket || !marketDraft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/markets/${editingMarket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: marketDraft }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Renamed to ${data.market.name}.`);
        setEditingMarket(null);
        router.refresh();
      } else {
        toast(data.error || "Couldn't rename the market.", "error");
      }
    } catch {
      toast("Couldn't rename the market.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addType() {
    setBusy(true);
    // family+size already on file → this refines its definition, not a new row.
    const exists = customerTypes.some(
      (c) => c.family === family && c.size === size
    );
    try {
      const res = await fetch("/api/customer-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family,
          size,
          product_type: productType,
          revenue,
          employees,
          operational_focus: focus,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`${exists ? "Updated" : "Added"} ${data.customerType.name}.`);
        setProductType("");
        setRevenue("");
        setEmployees("");
        setFocus("");
        setAdding(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't add the customer type.", "error");
      }
    } catch {
      toast("Couldn't add the customer type.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMarket() {
    if (!newMarket.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newMarket }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Added ${data.market.name}.`);
        setNewMarket("");
        setAddingMarket(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't add the market.", "error");
      }
    } catch {
      toast("Couldn't add the market.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeMarket(m: Market) {
    setBusy(true);
    setConfirmRemove(null);
    try {
      const res = await fetch(`/api/markets/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        toast(`Removed ${m.name}.`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't remove the market.", "error");
      }
    } catch {
      toast("Couldn't remove the market.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Group the definitions by family (each family shares a product type; only
  // revenue / employees / focus vary by size) — far more scannable than a flat,
  // repetitive table.
  const sizeOrder: Record<string, number> = { Small: 0, "Mid size": 1, Large: 2 };
  const groups = FAMILIES.map((fam) => ({
    fam,
    types: customerTypes
      .filter((c) => c.family === fam)
      .sort((a, b) => (sizeOrder[a.size] ?? 9) - (sizeOrder[b.size] ?? 9)),
  })).filter((g) => g.types.length > 0);
  const otherTypes = customerTypes.filter(
    (c) => !FAMILIES.includes(c.family as CustomerFamily)
  );

  // Every family+size pair is seeded, so the form usually refines an existing
  // definition rather than adding a new one — reflect that in the button/hint so
  // the action is never a surprise.
  const typeExists = customerTypes.some(
    (c) => c.family === family && c.size === size
  );

  return (
    <div className="space-y-6">
      {/* THE PAGE HEADER ALREADY SAID ALL OF THIS (Anir, Aug 13: "you're
          literally repeating the same thing again and again. You don't have to
          say 'offering categories' again. You can remove that pill right above
          the entire list").

          The card that used to sit here restated the page title, added a count
          the list itself makes obvious, and printed a second, near-identical
          copy of the subtitle — so the first thing on the page was a paragraph
          you had just finished reading. Only the action survives, directly
          above the list it adds to. */}
      <PageHeader
        title="Customer types & markets"
        subtitle="The customer-type definitions and markets you can attach to each offering. Add more as the catalog grows."
        action={
          canEdit ? (
            <button
              onClick={() => setAdding((a) => !a)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-blue-primary hover:bg-blue-light"
            >
              <Plus size={14} strokeWidth={2} /> Add customer type
            </button>
          ) : undefined
        }
      />

      {/* Create in a POPUP — every add flow opens a modal (Anir, Jul 25:
          "when I press Add customer type, it should be a pop-up"). */}
      <Modal
        open={canEdit && adding}
        onClose={() => setAdding(false)}
        title="Add a customer type"
      >
        <div className="space-y-4 p-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Family</label>
                <ColorSelect
                  ariaLabel="Family"
                  className="w-full"
                  collapsible={false}
                  value={family}
                  onChange={(v) => setFamily(v as CustomerFamily)}
                  options={FAMILIES.map((f) => ({
                    value: f,
                    label: f,
                    color: FAMILY_META[f].color,
                    icon: FAMILY_META[f].icon,
                  }))}
                />
              </div>
              <div>
                <label className={LABEL}>Size</label>
                <ColorSelect
                  ariaLabel="Size"
                  className="w-full"
                  collapsible={false}
                  value={size}
                  onChange={(v) => setSize(v as CustomerSize)}
                  options={SIZES.map((sz) => ({
                    value: sz,
                    label: sz,
                    color: SIZE_META[sz].color,
                    icon: SIZE_META[sz].icon,
                  }))}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Product type</label>
              <input className={FIELD} value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="What kind of products they make" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Revenue</label>
                <input className={FIELD} value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. Under $500M" />
              </div>
              <div>
                <label className={LABEL}>Employees</label>
                <input className={FIELD} value={employees} onChange={(e) => setEmployees(e.target.value)} placeholder="e.g. < 500" />
              </div>
            </div>
            <div>
              <label className={LABEL}>Operational focus</label>
              <input className={FIELD} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Their operational profile" />
            </div>
            {typeExists && (
              <p className="text-[12px] text-text-tertiary -mt-1">
                {family} · {size} already has a definition, saving will update
                it.
              </p>
            )}
            <Button onClick={addType} loading={busy}>
              {typeExists ? "Update definition" : "Add customer type"}
            </Button>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setAdding(false)}
              className="text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* EDIT AN EXISTING DEFINITION (change log #37). Family and size are
          shown but not editable here: together they ARE the identity of a
          customer type and the display name is derived from them, so changing
          one would silently turn this row into a different row. Renaming a
          family is a different job from correcting its description, and only
          the second one was asked for. */}
      <Modal
        open={!!editingType}
        onClose={() => setEditingType(null)}
        title={editingType ? `Edit ${editingType.name}` : "Edit customer type"}
      >
        <div className="space-y-4 p-1">
          <div>
            <label className={LABEL}>Product type</label>
            <input
              className={FIELD}
              value={editDraft.product_type}
              onChange={(e) =>
                setEditDraft((d) => ({ ...d, product_type: e.target.value }))
              }
              placeholder="What kind of products they make"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Revenue</label>
              <input
                className={FIELD}
                value={editDraft.revenue}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, revenue: e.target.value }))
                }
                placeholder="e.g. Under $500M"
              />
            </div>
            <div>
              <label className={LABEL}>Employees</label>
              <input
                className={FIELD}
                value={editDraft.employees}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, employees: e.target.value }))
                }
                placeholder="e.g. < 500"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Operational focus</label>
            <input
              className={FIELD}
              value={editDraft.operational_focus}
              onChange={(e) =>
                setEditDraft((d) => ({
                  ...d,
                  operational_focus: e.target.value,
                }))
              }
              placeholder="Their operational profile"
            />
          </div>
          <Button onClick={saveType} loading={busy}>
            Save changes
          </Button>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setEditingType(null)}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Renaming a market is only ever a label change: offerings point at
          markets by id, so nothing has to be remapped and no offering can be
          orphaned (change log #37). */}
      <Modal
        open={!!editingMarket}
        onClose={() => setEditingMarket(null)}
        title={editingMarket ? `Rename ${editingMarket.name}` : "Rename market"}
      >
        <div className="space-y-4 p-1">
          <div>
            <label className={LABEL}>Market</label>
            <div className="relative">
              <input
                className={`${FIELD} pl-9`}
                value={marketDraft}
                onChange={(e) => setMarketDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveMarketName()}
                placeholder="e.g. Canada"
                autoFocus
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px]">
                {flagForGeography(marketDraft) || <Globe2 size={14} strokeWidth={2} />}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-text-tertiary">
              Every offering already filed under this market keeps its mapping.
            </p>
          </div>
          <Button onClick={saveMarketName} loading={busy}>
            Save name
          </Button>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setEditingMarket(null)}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Definitions, grouped by family */}
      {groups.map(({ fam, types }) => {
        const fm = FAMILY_META[fam];
        const FIcon = fm.icon;
        return (
        <Card key={fam} className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border-light flex items-start gap-3">
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${fm.color}14`, color: fm.color }}
            >
              <FIcon size={17} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-text-primary">{fam}</h3>
              <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed max-w-[680px]">
                {types[0].product_type}
              </p>
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-[110px_140px_120px_1fr_auto] gap-3 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary border-b border-border-light bg-surface/40">
            <span>Size</span>
            <span>Revenue</span>
            <span>Employees</span>
            <span>Operational focus</span>
            <span className="text-right">Offerings</span>
          </div>
          <div className="divide-y divide-border-light">
            {types.map((t, ti) => {
              const count = typeCounts[t.id] || 0;
              // Same accent the filter dropdown gives this row, so the count
              // pill reads in the row's own colour, never gray.
              const accent = listAccent(ti);
              return (
                /* The row still opens the offerings for this type. The pencil
                   sits OUTSIDE the link rather than inside it, because a
                   button nested in an anchor is not a thing a browser can
                   dispatch cleanly (change log #37). */
                <div key={t.id} className="relative">
                <Link
                  href={`/offerings?type=${t.id}`}
                  className={`grid grid-cols-1 sm:grid-cols-[110px_140px_120px_1fr_auto] gap-x-3 gap-y-1 px-4 py-3 items-center hover:bg-surface transition-colors group ${canManageLists ? "pr-12" : ""}`}
                >
                  {(() => {
                    const sm = SIZE_META[t.size as CustomerSize] ?? SIZE_META.Large;
                    const SIcon = sm.icon;
                    return (
                      <span
                        className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold rounded px-2 py-0.5"
                        style={{ color: sm.color, background: `${sm.color}14` }}
                      >
                        <SIcon size={11} strokeWidth={2} />
                        {t.size}
                      </span>
                    );
                  })()}
                  <span className="text-[13px] text-text-primary tnum">
                    {t.revenue}
                  </span>
                  <span className="text-[13px] text-text-secondary tnum">
                    {t.employees}
                  </span>
                  <span className="text-[13px] text-text-secondary leading-relaxed">
                    {t.operational_focus}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 self-center justify-self-start sm:justify-self-end whitespace-nowrap rounded-full text-[11px] font-semibold px-2.5 py-1"
                    style={{ color: accent, background: `${accent}14` }}
                  >
                    {count} offering{count === 1 ? "" : "s"}
                  </span>
                </Link>
                {canManageLists && (
                  <button
                    type="button"
                    onClick={() => openTypeEditor(t)}
                    aria-label={`Edit ${t.name}`}
                    title="Edit this definition"
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <Pencil size={14} strokeWidth={2} />
                  </button>
                )}
                </div>
              );
            })}
          </div>
        </Card>
        );
      })}

      {otherTypes.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border-light">
            <h3 className="text-[15px] font-semibold text-text-primary">Other</h3>
          </div>
          <div className="divide-y divide-border-light">
            {otherTypes.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <p className="text-[13px] font-semibold text-text-primary">
                  {t.name}
                </p>
                <p className="text-[12.5px] text-text-secondary mt-0.5">
                  {t.product_type} · {t.revenue} · {t.employees} ·{" "}
                  {t.operational_focus}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Markets */}
      <Card id="markets" className="scroll-mt-20">
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          Markets ({markets.length})
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {markets.map((m) => {
            const count = marketCounts[m.id] || 0;
            if (confirmRemove === m.id) {
              return (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-2 text-[12.5px] font-medium bg-error/5 border border-error/30 rounded-md pl-2.5 pr-1.5 py-1"
                >
                  <span className="text-text-primary">
                    Remove {m.name}?{" "}
                    <span className="text-text-tertiary">
                      {count} offering{count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMarket(m)}
                    disabled={busy}
                    className="font-semibold text-error hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className="font-semibold text-text-secondary hover:text-text-primary"
                  >
                    Keep
                  </button>
                </span>
              );
            }
            const accent = listAccent(markets.indexOf(m));
            return (
              <span
                key={m.id}
                className="group inline-flex items-center text-[12.5px] font-medium border rounded-md transition-colors"
                style={{ background: `${accent}0D`, borderColor: `${accent}33` }}
              >
                <Link
                  href={`/offerings?market=${m.id}`}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1"
                  style={{ color: accent }}
                >
                  {flagForGeography(m.name) ? (
                    <span aria-hidden="true">{flagForGeography(m.name)}</span>
                  ) : (
                    <Globe2 size={12} strokeWidth={2} />
                  )}
                  {m.name}
                  <span className="text-[11px] tnum opacity-70">
                    {count}
                  </span>
                </Link>
                {canManageLists && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMarket(m);
                      setMarketDraft(m.name);
                    }}
                    disabled={busy}
                    aria-label={`Rename ${m.name}`}
                    title="Rename this market"
                    className="px-1 py-1 text-text-tertiary hover:text-blue-primary disabled:opacity-50"
                  >
                    <Pencil size={12} strokeWidth={2.2} />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => (count > 0 ? setConfirmRemove(m.id) : removeMarket(m))}
                    disabled={busy}
                    aria-label={`Remove ${m.name}`}
                    className="text-text-tertiary hover:text-error px-1.5 py-1 disabled:opacity-50"
                  >
                    <X size={12} strokeWidth={2.2} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {canEdit && (
          <button
            onClick={() => setAddingMarket(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-dashed border-blue-subtle text-blue-primary hover:bg-blue-light/50 transition-colors"
          >
            <Plus size={14} strokeWidth={2.2} /> Add market
          </button>
        )}
      </Card>

      {/* Markets too: press Add, get a POPUP — a bare text box sitting in the
          card read as clutter (Anir, Jul 25: "you press the plus button,
          there's a pop-up, and then you add it"). The flag previews live as
          you type, so a typo shows itself before saving. */}
      <Modal
        open={canEdit && addingMarket}
        onClose={() => setAddingMarket(false)}
        title="Add a market"
      >
        <div className="space-y-4 p-1">
          <div>
            <label className={LABEL}>Market</label>
            <div className="relative">
              <input
                className={`${FIELD} pl-9`}
                value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMarket()}
                placeholder="e.g. Canada"
                autoFocus
              />
              <span
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px]"
              >
                {flagForGeography(newMarket) || "🌐"}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-text-secondary">
              Type a country or region, the flag appears when it&apos;s
              recognised.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setAddingMarket(false)}
              className="text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <Button onClick={addMarket} loading={busy}>
              Add market
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
