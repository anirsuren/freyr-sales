"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/** Two-step untrack on a company the team added — same confirm idiom as
 *  disconnecting a component from an offering. */
export function StopTrackingButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "company", id: companyId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not save.");
      }
      toast(`Stopped tracking ${companyName}.`);
      router.push("/market-intel");
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-[12.5px] font-medium">
        <span className="text-text-secondary">Stop tracking {companyName}?</span>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="cursor-pointer rounded-full bg-[rgba(220,38,38,0.10)] px-3 py-1 font-semibold text-[#DC2626] transition-colors hover:bg-[#DC2626] hover:text-white disabled:opacity-50"
        >
          {busy ? "Stopping…" : "Yes, stop"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="cursor-pointer rounded-full border border-border-light bg-white px-3 py-1 font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary"
        >
          Keep it
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-[#DC2626] hover:text-[#DC2626]"
    >
      <EyeOff size={13} strokeWidth={2} /> Stop tracking
    </button>
  );
}
