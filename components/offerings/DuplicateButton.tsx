"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Duplicate an offering and jump straight into editing the copy. Suren's catalog
// is variant-heavy (Register → +Pia,Mia → +Via Agents), so cloning the nearest
// variant and tweaking it is far faster than entering each from scratch.
export function DuplicateButton({
  offering,
}: {
  offering: {
    offering_type: string;
    offering_name: string;
    offering_description: string;
    current_availability: string;
    future_availability: string;
    customer_type_ids: string[];
    market_ids: string[];
    materials: { kind: string; label: string; url: string }[];
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch("/api/offerings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offering_type: offering.offering_type,
          offering_name: `${offering.offering_name} (copy)`,
          offering_description: offering.offering_description,
          current_availability: offering.current_availability,
          future_availability: offering.future_availability,
          customer_type_ids: offering.customer_type_ids,
          market_ids: offering.market_ids,
          materials: offering.materials.map((m) => ({
            kind: m.kind,
            label: m.label,
            url: m.url,
          })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Duplicated — edit the copy.");
        router.push(`/offerings/${data.offering.id}/edit`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't duplicate.", "error");
      }
    } catch {
      toast("Couldn't duplicate.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={duplicate}
      disabled={busy}
      className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2 bg-white border border-border text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
    >
      <Copy size={14} strokeWidth={1.8} /> {busy ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
