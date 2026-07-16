"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Flame,
  HeartPulse,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { AgentDraftModal, type AgentDraft } from "@/components/agent/AgentDraftModal";
import { useToast } from "@/components/ui/Toast";
import {
  DRAFTABLE,
  type AgentAction,
  type AgentActionKind,
} from "@/lib/agent";
import { cn } from "@/lib/utils";
import { HoverCard } from "@/components/ui/HoverCard";

export type AttentionRow = AgentAction & {
  value: string;
  due: string;
  overdue?: boolean;
};

const ACTION_META: Record<
  AgentActionKind,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  approve: {
    label: "Compliance review",
    icon: ShieldCheck,
    color: "#6D28D9",
    bg: "#F3EEFF",
  },
  send: {
    label: "Ready to send",
    icon: Send,
    color: "#047857",
    bg: "#E9F8F2",
  },
  reengage: {
    label: "Deal cooling",
    icon: Flame,
    color: "#B45309",
    bg: "#FFF4E5",
  },
  stabilize: {
    label: "Account health",
    icon: HeartPulse,
    color: "#B42318",
    bg: "#FEF3F2",
  },
  followup: {
    label: "Follow-up due",
    icon: CalendarClock,
    color: "#0057B8",
    bg: "#EAF4FF",
  },
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
          const preview = ACTION_META[action.kind];
          const PreviewIcon = preview.icon;
          const priorityColor = index === 0 ? "#B42318" : index === 1 ? "#B45309" : "#0057B8";
          const priorityBg = index === 0 ? "#FEF3F2" : index === 1 ? "#FFF4E5" : "#EAF4FF";
          return (
            <HoverCard
              key={action.id}
              width={380}
              anchor="cursor"
              content={
                <div>
                  <div className="flex items-start gap-3">
                    <span className="relative shrink-0">
                      <CompanyLogo name={action.company || action.title} className="h-11 w-11 text-[9px]" />
                      <span
                        className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white"
                        style={{ background: preview.bg, color: preview.color }}
                      >
                        <PreviewIcon size={11} strokeWidth={2.2} />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-text-primary">{action.company || action.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]"
                          style={{ color: preview.color, background: preview.bg }}
                        >
                          {preview.label}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]"
                          style={{ color: priorityColor, background: priorityBg }}
                        >
                          Priority {index + 1} · {action.due}
                        </span>
                      </div>
                    </div>
                    <span className="text-[18px] font-bold text-text-primary tnum">{action.value}</span>
                  </div>

                  <div
                    className="mt-3 rounded-lg border px-3 py-3"
                    style={{ borderColor: `${preview.color}26`, background: `${preview.bg}99` }}
                  >
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: preview.color }}>
                      Why it needs attention
                    </p>
                    <p className="mt-1.5 text-[12.5px] font-semibold text-text-primary">{action.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{action.rationale}</p>
                  </div>

                  {action.facts && action.facts.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Signals</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {action.facts.slice(0, 4).map((fact) => (
                        <span key={fact} className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface/65 px-2.5 py-1 text-[10px] font-medium text-text-secondary">
                          <CheckCircle2 size={11} strokeWidth={2} style={{ color: preview.color }} />
                          {fact}
                        </span>
                      ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2.5 border-t border-border-light pt-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Recommended next step</span>
                      <span className="block truncate text-[11px] font-semibold text-text-primary">{canAct ? action.cta : "Open the deal and set a concrete next move"}</span>
                    </span>
                    <span className={action.overdue ? "text-[10px] font-semibold text-error" : "text-[10px] font-semibold text-success"}>
                      {action.overdue ? "Overdue" : "Ready now"}
                    </span>
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
