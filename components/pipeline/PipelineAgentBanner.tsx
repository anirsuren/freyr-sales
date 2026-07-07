"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AgentActivityPopup, type AgentActivity } from "@/components/agent/AgentActivityPopup";

// Agent surface on the pipeline page (V9) — the agent offers to work the cooling
// deals in one pass. "Re-engage them" runs autopilot, which drafts the safe
// re-engagement steps and escalates anything that needs approval. When it finishes
// it opens a results panel so the user SEES exactly what happened.
export function PipelineAgentBanner({ coolingCount }: { coolingCount: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentActivity | null>(null);

  async function reengage() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/autopilot", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setResult({
          title: data.title || "Drafted outreach for your cooling deals",
          summary:
            data.summary ||
            `Drafted ${data.handled} · ${data.escalated} need your approval`,
          steps: data.steps || [],
          runId: data.runId,
          escalated: data.escalated,
        });
        router.refresh();
      } else {
        toast("Agent couldn't run", "error");
      }
    } catch {
      toast("Agent couldn't run", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/50 p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-primary">
            {coolingCount > 0
              ? `${coolingCount} deal${coolingCount === 1 ? "" : "s"} ${
                  coolingCount === 1 ? "is" : "are"
                } cooling`
              : "Pipeline looks healthy"}
          </p>
          <p className="text-[12px] text-text-secondary">
            {coolingCount > 0
              ? "Let the agent draft re-engagement and escalate what needs approval."
              : "No stalled deals right now — the agent is standing by."}
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
        {coolingCount > 0 && (
          <Button
            onClick={reengage}
            loading={busy}
            className="px-4 py-2 text-[13px]"
          >
            {busy ? "Working…" : "Re-engage cooling deals"}
          </Button>
        )}
      </div>

      <AgentActivityPopup activity={result} onClose={() => setResult(null)} />
    </div>
  );
}
