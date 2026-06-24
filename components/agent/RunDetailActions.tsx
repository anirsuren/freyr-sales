"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Undo2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/lib/types";

// Run again / Undo on the run detail page itself (V9 #54) — mirrors the actions
// in the console's run-history panel so a deep-linked run is fully actionable.
export function RunDetailActions({ run }: { run: AgentRun }) {
  const [replaying, setReplaying] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const canReplay = run.kind === "play" && !!run.customer_id;
  const canUndo =
    run.kind !== "play" &&
    !run.reverted &&
    (run.interaction_ids?.length ?? 0) > 0;

  if (!canReplay && !canUndo) return null;

  async function replay() {
    if (!run.customer_id) return;
    setReplaying(true);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: run.customer_id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Re-ran the play for ${run.company ?? "the account"}`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't re-run that play", "error");
      }
    } catch {
      toast("Couldn't re-run that play", "error");
    } finally {
      setReplaying(false);
    }
  }

  async function undo() {
    setUndoing(true);
    try {
      const res = await fetch("/api/agent/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Reverted — ${data.removed ?? 0} step(s) rolled back`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't undo that run", "error");
      }
    } catch {
      toast("Couldn't undo that run", "error");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canReplay && (
        <button
          onClick={replay}
          disabled={replaying}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-light text-blue-primary hover:bg-blue-light transition-colors disabled:opacity-50"
        >
          <RotateCw
            size={13}
            strokeWidth={2}
            className={cn(replaying && "animate-spin")}
          />
          {replaying ? "Re-running…" : "Run again"}
        </button>
      )}
      {canUndo && (
        <button
          onClick={undo}
          disabled={undoing}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-light text-text-secondary hover:bg-surface transition-colors disabled:opacity-50"
        >
          <Undo2 size={13} strokeWidth={2} />
          {undoing ? "Undoing…" : "Undo"}
        </button>
      )}
    </div>
  );
}
