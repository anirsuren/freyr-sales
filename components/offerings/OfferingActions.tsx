"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Plus, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// The two primary offering actions (from Suren's approved layout): start a
// pitch with this offering, or mark it as one a customer is using — right from
// the offering page. Both are real: "Add to a customer" appends the offering
// to that account's in-use list (no popup, an inline picker). `extra` holds
// the admin buttons so all actions sit on one line (Anir: save space).
export function OfferingActions({
  offeringId,
  offeringName,
  customers,
  extra,
  commercialActionsEnabled = true,
}: {
  offeringId: string;
  offeringName: string;
  customers: { id: string; name: string }[];
  extra?: ReactNode;
  commercialActionsEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${picked}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOfferingInUse: offeringId }),
      });
      const data = await res.json();
      if (data.ok) {
        const name = customers.find((c) => c.id === picked)?.name || "the customer";
        toast(`Added ${offeringName} to ${name} — see it on their Offerings tab.`);
        setAdding(false);
        setPicked("");
        router.refresh();
      } else {
        toast(data.error || "Couldn't add it.", "error");
      }
    } catch {
      toast("Couldn't add it.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch lg:items-end gap-2">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {commercialActionsEnabled && (
          <>
            <Link
              href="/intake"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-3.5 py-2 bg-blue-primary text-white hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
            >
              <Rocket size={14} strokeWidth={2} />
              Use in a pitch
            </Link>
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-3.5 py-2 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              {adding ? <X size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
              Add to a customer
            </button>
          </>
        )}
        {extra}
      </div>
      {commercialActionsEnabled && adding && (
        <div className="flex items-center gap-2 bg-surface/70 border border-border-light rounded-lg p-2">
          <select
            aria-label="Choose a customer"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus min-w-[200px]"
          >
            <option value="">Choose a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!picked || busy}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-3 py-1.5 bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
          >
            <Check size={14} strokeWidth={2.2} />
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
