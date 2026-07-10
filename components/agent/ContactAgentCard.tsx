"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { AgentDraftModal, type AgentDraft } from "@/components/agent/AgentDraftModal";
import { suggestForContact } from "@/lib/agent";

// Agent surface on the contact detail (V9). Surfaces the next best action for
// this specific contact and drafts it in one click via /api/agent/act.
export function ContactAgentCard({
  customerId,
  fullName,
  company,
  hasFollowUp,
  everContacted,
  siblingCount,
}: {
  customerId: string;
  fullName: string;
  company: string;
  hasFollowUp: boolean;
  everContacted: boolean;
  siblingCount: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [viewing, setViewing] = useState(false);

  const suggestion = suggestForContact({
    fullName,
    company,
    hasFollowUp,
    everContacted,
    siblingCount,
  });

  async function handle() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: suggestion.kind, customerId }),
      });
      const data = await res.json();
      if (data.ok && data.draft) {
        setDone(true);
        setDraft({ title: data.draft.title, body: data.draft.body, runId: data.runId });
        setViewing(true);
        toast("Draft ready — saved to the timeline and added to Tasks");
        router.refresh();
      } else {
        toast(data.error || "Agent couldn't draft that", "error");
      }
    } catch {
      toast("Agent couldn't draft that", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-blue-light/40 border-blue-subtle">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1 flex items-center gap-2">
        <Sparkles size={18} strokeWidth={1.8} className="text-blue-primary" />
        Agent recommends
      </h2>
      <p className="text-[14px] font-semibold text-text-primary mt-2">
        {suggestion.title}
      </p>
      <p className="text-[13px] text-text-secondary leading-relaxed mt-1 mb-3">
        {suggestion.rationale}
      </p>
      {done && draft ? (
        <button
          onClick={() => setViewing(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg border border-success/40 text-success hover:bg-success/10 transition-colors"
        >
          <Check size={15} strokeWidth={2.2} /> Drafted · View draft
        </button>
      ) : (
        <button
          onClick={handle}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50 active:scale-[0.97]"
        >
          <Sparkles size={14} strokeWidth={1.9} />
          {busy ? "Drafting…" : "Draft it for me"}
        </button>
      )}

      <AgentDraftModal
        draft={viewing ? draft : null}
        onClose={() => setViewing(false)}
      />
    </Card>
  );
}
