"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Sends the agent's daily briefing to the rep (Telegram/email, mock when no key).
export function SendDigestButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/digest", { method: "POST" });
      const data = await res.json();
      toast(data.ok ? "Digest sent to you" : "Couldn't send the digest", data.ok ? undefined : "error");
    } catch {
      toast("Couldn't send the digest", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={send}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary px-2.5 py-1.5 rounded-md border border-border-light hover:bg-blue-light transition-colors disabled:opacity-50"
    >
      <Send size={13} strokeWidth={1.9} />
      {busy ? "Sending…" : "Send to me"}
    </button>
  );
}
