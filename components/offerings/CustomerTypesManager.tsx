"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type {
  CustomerType,
  Market,
  CustomerFamily,
  CustomerSize,
} from "@/lib/offerings";

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1";
const FAMILIES: CustomerFamily[] = [
  "Pharmaceutical",
  "Biologics",
  "Bio Pharmaceutical",
];
const SIZES: CustomerSize[] = ["Small", "Mid size", "Large"];

export function CustomerTypesManager({
  customerTypes,
  markets,
  typeCounts = {},
  marketCounts = {},
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  typeCounts?: Record<string, number>;
  marketCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [family, setFamily] = useState<CustomerFamily>("Pharmaceutical");
  const [size, setSize] = useState<CustomerSize>("Small");
  const [productType, setProductType] = useState("");
  const [revenue, setRevenue] = useState("");
  const [employees, setEmployees] = useState("");
  const [focus, setFocus] = useState("");
  const [newMarket, setNewMarket] = useState("");

  async function addType() {
    setBusy(true);
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
        toast(`Added ${data.customerType.name}.`);
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

  return (
    <div className="space-y-6">
      {/* Add-type panel */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Customer types ({customerTypes.length})
          </h2>
          <button
            onClick={() => setAdding((a) => !a)}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-primary hover:bg-blue-light rounded-md px-2.5 py-1.5"
          >
            <Plus size={14} strokeWidth={2} /> Add customer type
          </button>
        </div>

        {adding && (
          <div className="p-4 bg-surface/60 border-b border-border-light space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Family</label>
                <select
                  className={FIELD}
                  value={family}
                  onChange={(e) => setFamily(e.target.value as CustomerFamily)}
                >
                  {FAMILIES.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Size</label>
                <select
                  className={FIELD}
                  value={size}
                  onChange={(e) => setSize(e.target.value as CustomerSize)}
                >
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
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
            <Button onClick={addType} loading={busy}>
              Add customer type
            </Button>
          </div>
        )}

        {adding ? null : (
          <p className="px-4 py-2.5 text-[12px] text-text-tertiary">
            Grouped by family — each family shares a product type; revenue,
            employees and focus vary by size.
          </p>
        )}
      </Card>

      {/* Definitions, grouped by family */}
      {groups.map(({ fam, types }) => (
        <Card key={fam} className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border-light">
            <h3 className="text-[15px] font-semibold text-text-primary">{fam}</h3>
            <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed max-w-[680px]">
              {types[0].product_type}
            </p>
          </div>
          <div className="hidden sm:grid grid-cols-[110px_140px_120px_1fr_auto] gap-3 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary border-b border-border-light bg-surface/40">
            <span>Size</span>
            <span>Revenue</span>
            <span>Employees</span>
            <span>Operational focus</span>
            <span className="text-right">Offerings</span>
          </div>
          <div className="divide-y divide-border-light">
            {types.map((t) => {
              const count = typeCounts[t.id] || 0;
              return (
                <Link
                  key={t.id}
                  href={`/offerings?type=${t.id}`}
                  className="grid grid-cols-1 sm:grid-cols-[110px_140px_120px_1fr_auto] gap-x-3 gap-y-1 px-4 py-3 items-baseline hover:bg-surface transition-colors group"
                >
                  <span className="inline-flex w-fit text-[11px] font-semibold text-blue-primary bg-blue-light rounded px-2 py-0.5">
                    {t.size}
                  </span>
                  <span className="text-[13px] text-text-primary tnum">
                    {t.revenue}
                  </span>
                  <span className="text-[13px] text-text-secondary tnum">
                    {t.employees}
                  </span>
                  <span className="text-[13px] text-text-secondary leading-relaxed">
                    {t.operational_focus}
                  </span>
                  <span className="inline-flex items-center gap-1 self-center justify-self-start sm:justify-self-end whitespace-nowrap text-[11px] font-medium text-text-tertiary group-hover:text-blue-primary">
                    {count} offering{count === 1 ? "" : "s"}
                    <ArrowRight
                      size={12}
                      strokeWidth={2}
                      className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      ))}

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
      <Card>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          Markets ({markets.length})
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {markets.map((m) => (
            <span
              key={m.id}
              className="group inline-flex items-center text-[12.5px] font-medium bg-surface border border-border-light rounded-md transition-colors hover:border-blue-subtle"
            >
              <Link
                href={`/offerings?market=${m.id}`}
                className="inline-flex items-center gap-1.5 text-text-primary group-hover:text-blue-primary pl-2.5 pr-1 py-1"
              >
                {m.name}
                <span className="text-[11px] text-text-tertiary tnum">
                  {marketCounts[m.id] || 0}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => removeMarket(m)}
                disabled={busy}
                aria-label={`Remove ${m.name}`}
                className="text-text-tertiary hover:text-error px-1.5 py-1 disabled:opacity-50"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-[420px]">
          <input
            className={`${FIELD} flex-1`}
            value={newMarket}
            onChange={(e) => setNewMarket(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMarket()}
            placeholder="Add a market (e.g. Canada)"
          />
          <Button variant="secondary" onClick={addMarket} loading={busy}>
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
