"use client";

import { useState } from "react";
import { Printer, Send } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Export the weekly review (V9 #43): Print/PDF (browser) or share it up the chain
// (Telegram/email, mock when no key).
export function ReviewActions() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/review/share", { method: "POST" });
      const data = await res.json();
      toast(data.ok ? "Weekly review shared" : "Couldn't share the review", data.ok ? undefined : "error");
    } catch {
      toast("Couldn't share the review", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print:hidden flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
      >
        <Printer size={15} strokeWidth={1.7} />
        Print / PDF
      </button>
      <button
        onClick={share}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
      >
        <Send size={15} strokeWidth={1.7} />
        {busy ? "Sharing…" : "Share"}
      </button>
    </div>
  );
}
