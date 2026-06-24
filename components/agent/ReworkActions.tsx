"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Rework round-trip (V9 #68) — once a sent-back pitch is revised, the rep can
// re-submit it for compliance review in one click, sending it back into the
// approval lane. Closes the decline → revise → re-review loop.
export function ReworkActions({
  sessionId,
  company,
}: {
  sessionId: string;
  company: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resubmit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Re-submitted ${company} for review`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't re-submit the pitch", "error");
      }
    } catch {
      toast("Couldn't re-submit the pitch", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={resubmit}
        disabled={busy}
        aria-label={`Re-submit ${company} for review`}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
      >
        <RotateCw
          size={13}
          strokeWidth={2}
          className={busy ? "animate-spin" : ""}
        />
        {busy ? "Re-submitting…" : "Re-submit for review"}
      </button>
      <Link
        href={`/sessions/${sessionId}`}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary px-3 py-1.5 rounded-md border border-border-light hover:bg-surface transition-colors"
      >
        Revise
        <ArrowRight size={13} strokeWidth={1.8} />
      </Link>
    </div>
  );
}
