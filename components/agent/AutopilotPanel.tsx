"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Check, ShieldQuestion, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/pipeline";

type Report = {
  handled: number;
  escalated: number;
  heldForValue?: number;
  ceiling?: number | null;
  handledItems: string[];
  escalatedItems: string[];
};

export function AutopilotPanel() {
  const { toast } = useToast();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/agent/autopilot", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setReport(data);
        toast(
          `Autopilot drafted ${data.handled} for you · ${data.escalated} waiting for your approval`
        );
        router.refresh();
      } else {
        toast("Autopilot couldn't run", "error");
      }
    } catch {
      toast("Autopilot couldn't run", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
            <Rocket size={16} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-text-primary">Autopilot</p>
            <p className="text-[12px] text-text-secondary">
              Let the agent work the whole queue — it drafts the safe ones for
              you and leaves anything needing approval to you.
            </p>
          </div>
        </div>
        <Button onClick={run} loading={running} className="shrink-0 px-4 py-2 text-[13px]">
          {running ? "Working…" : "Run autopilot"}
        </Button>
      </div>

      {report && (report.heldForValue ?? 0) > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5">
          <ShieldAlert
            size={15}
            strokeWidth={1.9}
            className="text-warning shrink-0 mt-0.5"
          />
          <p className="text-[12px] text-text-primary">
            <span className="font-semibold">
              {report.heldForValue} held for your sign-off
            </span>{" "}
            — over your{" "}
            {report.ceiling ? formatMoney(report.ceiling) : "value"} ceiling, so
            the agent left these for you instead of drafting them.
          </p>
        </div>
      )}

      {report && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-white border border-border-light p-3">
            <p className="text-[12px] font-semibold text-success flex items-center gap-1.5 mb-1.5">
              <Check size={14} strokeWidth={2.2} /> Drafted {report.handled}
            </p>
            <ul className="space-y-1">
              {report.handledItems.slice(0, 5).map((t, i) => (
                <li key={i} className="text-[12px] text-text-secondary truncate">
                  {t}
                </li>
              ))}
              {report.handled === 0 && (
                <li className="text-[12px] text-text-tertiary">Nothing to draft right now.</li>
              )}
            </ul>
          </div>
          <div className="rounded-lg bg-white border border-border-light p-3">
            <p className="text-[12px] font-semibold text-warning flex items-center gap-1.5 mb-1.5">
              <ShieldQuestion size={14} strokeWidth={1.9} /> Waiting on you {report.escalated}
            </p>
            <ul className="space-y-1">
              {report.escalatedItems.slice(0, 5).map((t, i) => (
                <li key={i} className="text-[12px] text-text-secondary truncate">
                  {t}
                </li>
              ))}
              {report.escalated === 0 && (
                <li className="text-[12px] text-text-tertiary">Nothing waiting on you.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
