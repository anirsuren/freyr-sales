"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
}: {
  customerTypes: CustomerType[];
  markets: Market[];
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

  return (
    <div className="space-y-6">
      {/* Customer types table */}
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

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-tertiary border-b border-border-light">
                <th className="font-semibold px-4 py-2.5">Customer type</th>
                <th className="font-semibold px-4 py-2.5">Product type</th>
                <th className="font-semibold px-4 py-2.5">Revenue</th>
                <th className="font-semibold px-4 py-2.5">Employees</th>
                <th className="font-semibold px-4 py-2.5">Operational focus</th>
              </tr>
            </thead>
            <tbody>
              {customerTypes.map((c) => (
                <tr key={c.id} className="border-b border-border-light last:border-0 align-top">
                  <td className="px-4 py-3 font-semibold text-text-primary whitespace-nowrap">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary max-w-[260px]">
                    {c.product_type}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                    {c.revenue}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                    {c.employees}
                  </td>
                  <td className="px-4 py-3 text-text-secondary max-w-[260px]">
                    {c.operational_focus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Markets */}
      <Card>
        <h2 className="text-[15px] font-semibold text-text-primary mb-3">
          Markets ({markets.length})
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {markets.map((m) => (
            <span
              key={m.id}
              className="text-[12.5px] font-medium text-text-primary bg-surface border border-border-light rounded-md px-2.5 py-1"
            >
              {m.name}
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
