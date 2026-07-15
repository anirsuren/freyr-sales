"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AgentActivityPopup, type AgentActivity } from "@/components/agent/AgentActivityPopup";

// Sequences agent surface (V9 #20). One play runs the whole cadence: the agent
// enrolls cooling accounts not yet in it AND advances everyone already due, end
// to end. The banner shows what's pending and fires it in a single click.
export function SequenceAgentBanner({
  candidateCount,
  dueCount,
  sequenceId,
  sequenceName,
}: {
  candidateCount: number;
  dueCount: number;
  sequenceId: string;
  sequenceName: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentActivity | null>(null);
  const pending = candidateCount > 0 || dueCount > 0;

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/cadence-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({
          title: data.title || `Prepped the “${sequenceName}” sequence`,
          summary:
            data.summary ||
            `Enrolled ${data.enrolled} · advanced ${data.advanced}`,
          steps: data.steps || [],
          runId: data.runId,
        });
        router.refresh();
      } else {
        toast(data.error || "Agent couldn't prep the steps", "error");
      }
    } catch {
      toast("Agent couldn't prep the steps", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-light bg-white px-4 py-3 flex items-center justify-between gap-4 shadow-[inset_3px_0_0_#0071E3]">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-md bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
          <Sparkles size={15} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">
            {pending
              ? `${candidateCount} stalled account${candidateCount === 1 ? "" : "s"} · ${dueCount} touch${dueCount === 1 ? "" : "es"} due`
              : `${sequenceName} is up to date`}
          </p>
          <p className="text-[12px] text-text-secondary">
            {pending
              ? `Prep the next ${sequenceName} touches for review. Nothing sends or dials automatically.`
              : `Nothing pending — the "${sequenceName}" plan is up to date.`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/agent"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-secondary hover:text-blue-primary"
        >
          Open Agent
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
        {pending && (
          <Button onClick={run} loading={busy} className="px-4 py-2 text-[13px]">
            <Play size={14} strokeWidth={2} className="mr-1.5" />
            {busy ? "Prepping…" : "Prep these steps"}
          </Button>
        )}
      </div>

      <AgentActivityPopup activity={result} onClose={() => setResult(null)} />
    </div>
  );
}
