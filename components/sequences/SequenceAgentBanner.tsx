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
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/50 p-4 mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">
            {pending
              ? `${candidateCount} to enroll · ${dueCount} due to advance`
              : `${sequenceName} is up to date`}
          </p>
          <p className="text-[12px] text-text-secondary">
            {pending
              ? `One click and the agent sets up the "${sequenceName}" plan — adds the stalled accounts and preps each due step (drafts emails, sets call reminders) for your review. Nothing is sent or dialed.`
              : `Nothing pending — the "${sequenceName}" plan is up to date.`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/agent"
          className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
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
