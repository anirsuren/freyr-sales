"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { AgentDraftModal, type AgentDraft } from "@/components/agent/AgentDraftModal";
import { useToast } from "@/components/ui/Toast";
import { DRAFTABLE, type AgentAction } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { HoverCard } from "@/components/ui/HoverCard";

export type AttentionRow = AgentAction & {
  value: string;
  due: string;
  overdue?: boolean;
};

export function AgentAttentionQueue({ actions }: { actions: AttentionRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>({});
  const [viewing, setViewing] = useState<string | null>(null);

  async function act(action: AttentionRow) {
    setBusy(action.id);
    try {
      const endpoint = action.kind === "approve" && action.sessionId
        ? `/api/sessions/${action.sessionId}/review`
        : "/api/agent/act";
      const body = action.kind === "approve"
        ? { action: "approve" }
        : { kind: action.kind, customerId: action.customerId };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Action failed");
      setDone((current) => new Set(current).add(action.id));
      if (data.draft) {
        setDrafts((current) => ({
          ...current,
          [action.id]: { title: data.draft.title, body: data.draft.body, runId: data.runId },
        }));
        setViewing(action.id);
        toast("Draft ready and saved to Tasks");
      } else {
        toast("Pitch approved and ready to send");
      }
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-text-primary">What needs your attention</h2>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline">
          See all
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
      </div>
      <div className="divide-y divide-border-light">
        {actions.map((action, index) => {
          const isDone = done.has(action.id);
          const canAct = action.kind === "approve" || DRAFTABLE.includes(action.kind);
          return (
            <HoverCard
              key={action.id}
              delayMs={0}
              width={370}
              content={
                <div>
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={action.company || action.title} className="h-10 w-10 shrink-0 text-[9px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text-primary">{action.company || action.title}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary">Priority {index + 1} · {action.due}</p>
                    </div>
                    <span className="text-[15px] font-bold text-text-primary tnum">{action.value}</span>
                  </div>
                  <div className="mt-3 rounded-md bg-surface px-3 py-2.5">
                    <p className="text-[11.5px] font-semibold text-text-primary">{action.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{action.rationale}</p>
                  </div>
                  {action.facts && action.facts.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {action.facts.slice(0, 4).map((fact) => (
                        <span key={fact} className="rounded-md border border-border-light px-2.5 py-2 text-[10.5px] text-text-secondary">{fact}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border-light pt-3 text-[11px]">
                    <span className={action.overdue ? "font-semibold text-error" : "font-semibold text-text-secondary"}>{action.overdue ? "Overdue action" : "Ready to work"}</span>
                    <span className="font-semibold text-blue-primary">{canAct ? action.cta : "Open deal"}</span>
                  </div>
                </div>
              }
            >
              <div className="grid grid-cols-[32px_minmax(0,1fr)_100px_72px_132px] items-center gap-3 px-5 py-3 hover:bg-surface/60 transition-colors">
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                  index === 0 ? "bg-error/10 text-error" : index === 1 ? "bg-warning/15 text-[#875000]" : "bg-blue-light text-blue-primary"
                )}>{index + 1}</span>
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyLogo name={action.company || action.title} className="h-8 w-8 shrink-0 text-[9px]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">{action.title}</p>
                    <p className="truncate text-[11.5px] text-text-secondary">{action.rationale}</p>
                  </div>
                </div>
                <p className="text-right text-[13px] font-semibold text-text-primary tnum">{action.value}</p>
                <p className={cn("text-[11.5px] font-semibold", action.overdue ? "text-error" : "text-text-secondary")}>{action.due}</p>
                <div className="flex justify-end">
                  {isDone ? (
                    <button
                      onClick={() => drafts[action.id] && setViewing(action.id)}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-success"
                    >
                      <Check size={14} strokeWidth={2.2} /> {drafts[action.id] ? "View draft" : "Done"}
                    </button>
                  ) : canAct ? (
                    <button
                      onClick={() => act(action)}
                      disabled={busy === action.id}
                      className="inline-flex min-w-[124px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-primary px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-blue-hover disabled:opacity-50"
                    >
                      {action.kind !== "approve" && <Sparkles size={13} strokeWidth={1.9} />}
                      {busy === action.id ? "Working..." : action.kind === "approve" ? "Approve" : "Draft follow-up"}
                    </button>
                  ) : (
                    <Link href={action.href} className="text-[12px] font-semibold text-blue-primary hover:underline">Open deal</Link>
                  )}
                </div>
              </div>
            </HoverCard>
          );
        })}
      </div>
      <AgentDraftModal draft={viewing ? drafts[viewing] || null : null} onClose={() => setViewing(null)} />
    </div>
  );
}
