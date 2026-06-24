"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// Digest schedule (V9 #24, catch-up model). When the rep's daily/weekly briefing
// is due, the console surfaces it and sends with one click — stamping last-sent.
// Honest: catches up on the rep's visit; a deployment cron would send on time.
export function DigestScheduleBanner({ cadence }: { cadence: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sendNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/digest", { method: "POST" });
      const data = await res.json();
      await fetch("/api/agent/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_last_sent: new Date().toISOString() }),
      });
      toast(data.ok ? "Digest sent to you" : "Couldn't send the digest", data.ok ? undefined : "error");
      router.refresh();
    } catch {
      toast("Couldn't send the digest", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/50 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Newspaper size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">
            Your {cadence} digest is ready
          </p>
          <p className="text-[12px] text-text-secondary">
            Catches up on your visit — a deployment cron sends it on time.
          </p>
        </div>
      </div>
      <Button onClick={sendNow} loading={busy} className="px-4 py-2 text-[13px] shrink-0">
        {busy ? "Sending…" : "Send to me"}
      </Button>
    </div>
  );
}
