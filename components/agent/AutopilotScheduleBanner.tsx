"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// Autopilot schedule (V9, catch-up model). When a scheduled run is due, the agent
// surfaces it on the rep's next visit and runs it with one click — stamping the
// last-run time. Honest: a production deployment cron would fire it on time; here
// the human is present, which keeps the approval gate intact.
export function AutopilotScheduleBanner({ cadence }: { cadence: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function runNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/autopilot", { method: "POST" });
      const data = await res.json();
      await fetch("/api/agent/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autopilot_last_run: new Date().toISOString() }),
      });
      if (data.ok) {
        toast(
          `Scheduled autopilot ran — drafted ${data.handled} for you · ${data.escalated} waiting for your approval`
        );
      } else {
        toast("Autopilot couldn't run", "error");
      }
      router.refresh();
    } catch {
      toast("Autopilot couldn't run", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-warning/20 text-warning flex items-center justify-center shrink-0">
          <CalendarClock size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">
            Your {cadence} autopilot run is due
          </p>
          <p className="text-[12px] text-text-secondary">
            Catches up on your visit — a deployment cron fires it on time.
          </p>
        </div>
      </div>
      <Button onClick={runNow} loading={busy} className="px-4 py-2 text-[13px] shrink-0">
        {busy ? "Running…" : "Run now"}
      </Button>
    </div>
  );
}
