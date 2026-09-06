"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-[#DC2626] hover:text-[#DC2626]"
      >
        <EyeOff size={13} strokeWidth={2} /> Stop tracking
      </button>

      {/* The app's own confirmation, like every other stop-doing-this control
          (Anir, Sep 6: "make sure the delete flows for everything are good").
          It used to swap itself for a row of small words inside the header,
          which moved the layout under the cursor. */}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
        busy={busy}
        title={`Stop tracking ${companyName}?`}
        body={
          <>
            No new signals about <b>{companyName}</b> will come in.
          </>
        }
        detail="Briefings already collected stay where they are. You can start tracking again at any time."
        confirmLabel="Stop tracking"
      />
    </>
  );
}
