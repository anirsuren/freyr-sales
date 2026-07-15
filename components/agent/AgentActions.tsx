"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Send,
  Flame,
  HeartPulse,
  CalendarClock,
  ArrowRight,
  Check,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { AgentDraftModal, type AgentDraft } from "@/components/agent/AgentDraftModal";
import { useToast } from "@/components/ui/Toast";
import { DRAFTABLE, type AgentAction, type AgentActionKind } from "@/lib/agent";

type DraftView = AgentDraft;

const META: Record<AgentActionKind, { icon: typeof Send; bg: string; color: string }> = {
  approve: { icon: ClipboardCheck, bg: "rgba(255,159,10,0.14)", color: "#7A4A00" },
  send: { icon: Send, bg: "rgba(52,199,89,0.15)", color: "#1A7A35" },
  reengage: { icon: Flame, bg: "rgba(255,59,48,0.12)", color: "#B02020" },
  stabilize: { icon: HeartPulse, bg: "rgba(255,59,48,0.12)", color: "#B02020" },
  followup: { icon: CalendarClock, bg: "#E8F1FB", color: "#0040A0" },
};

export function AgentActions({
  actions,
  compact = false,
  grid = false,
}: {
  actions: AgentAction[];
  compact?: boolean;
  // Lay the cards out as one horizontal row (wrapping on small screens)
  // instead of a stack — the dashboard shows everything in one glance
  // (Anir, Jul 4: "it should be like a horizontal row… value of space").
  grid?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  // Which approval card is in "decline" mode + the reason being typed (#66).
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // The actual drafts the agent produced this session, keyed by action id, and
  // which one's modal is currently open — so pressing "Draft it for me" shows
  // real, readable output the rep can reopen (Suren: "it should show me the draft").
  const [drafts, setDrafts] = useState<Record<string, DraftView>>({});
  const [viewing, setViewing] = useState<string | null>(null);

  async function handle(a: AgentAction) {
    setBusy(a.id);
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: a.kind, customerId: a.customerId }),
      });
      const data = await res.json();
      if (data.ok && data.draft) {
        setDone((s) => new Set(s).add(a.id));
        setDrafts((d) => ({
          ...d,
          [a.id]: { title: data.draft.title, body: data.draft.body, runId: data.runId },
        }));
        setViewing(a.id);
        toast("Draft ready — saved to the timeline and added to Tasks");
        router.refresh();
      } else {
        toast(data.error || "Agent couldn't complete that", "error");
      }
    } catch {
      toast("Agent couldn't complete that", "error");
    } finally {
      setBusy(null);
    }
  }

  // Inline approve / decline for a pitch in compliance review (#65) — completes
  // the human gate so the rep can clear or send back without leaving the inbox.
  // Decline carries the rep's reason so the agent can re-surface it (#66).
  async function review(
    a: AgentAction,
    decision: "approve" | "request_changes",
    note?: string
  ) {
    if (!a.sessionId) return;
    setBusy(a.id);
    try {
      const res = await fetch(`/api/sessions/${a.sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision,
          note:
            decision === "request_changes"
              ? note?.trim() || "Sent back from the agent inbox"
              : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDeclining(null);
        setReason("");
        setDone((s) => new Set(s).add(a.id));
        toast(
          decision === "approve"
            ? "Pitch approved — ready to send"
            : "Pitch sent back for changes"
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't update the pitch", "error");
      }
    } catch {
      toast("Couldn't update the pitch", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={
        grid
          ? "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-3 stagger"
          : "space-y-2.5 stagger"
      }
    >
      {actions.map((a) => {
        const m = META[a.kind];
        const Icon = m.icon;
        const isDone = done.has(a.id);
        const draftable = DRAFTABLE.includes(a.kind);
        return (
          <Card key={a.id} className={compact ? "p-3" : grid ? "flex h-full flex-col p-4" : "p-4"}>
            {/* Compact (280px rail): stack text above the buttons and let them
                wrap — nothing overflows the card (Anir: "this button is
                literally going out of the screen"). Full width: one row. */}
            <div className={compact ? "space-y-2.5" : grid ? "flex h-full flex-col gap-3" : "flex items-center gap-3"}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {a.company ? (
                  // Lead with the account's identity so you know who this is
                  // about at a glance, with a small badge for the action type
                  // (Suren: "profile picture that applies… what is Cortexa").
                  <span className="relative shrink-0">
                    <CompanyLogo
                      name={a.company}
                      className={compact ? "w-9 h-9 text-[12px]" : "w-10 h-10 text-[13px]"}
                    />
                    <span
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white"
                      style={{ background: m.bg, color: m.color }}
                    >
                      <Icon size={10} strokeWidth={2.4} />
                    </span>
                  </span>
                ) : (
                  <span
                    className={
                      compact
                        ? "w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        : "w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    }
                    style={{ background: m.bg, color: m.color }}
                  >
                    <Icon size={compact ? 15 : 17} strokeWidth={1.8} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      compact || grid
                        ? "text-[13px] font-semibold text-text-primary leading-snug"
                        : "text-[14px] font-semibold text-text-primary truncate"
                    }
                  >
                    {a.title}
                  </p>
                  <p
                    className={
                      compact || grid
                        ? "text-[11.5px] text-text-secondary leading-snug line-clamp-2 mt-0.5"
                        : "text-[12px] text-text-secondary truncate"
                    }
                  >
                    {a.rationale}
                  </p>
                </div>
              </div>
              <div
                className={
                  compact
                    ? "flex items-center gap-1.5 flex-wrap"
                    : grid
                    ? "mt-auto flex items-center gap-1.5 whitespace-nowrap"
                    : "flex items-center justify-end gap-2 shrink-0"
                }
              >
              {draftable &&
                (isDone && drafts[a.id] ? (
                  <button
                    onClick={() => setViewing(a.id)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-md border border-success/40 text-success hover:bg-success/10 transition-colors"
                  >
                    <Check size={14} strokeWidth={2.2} /> Drafted · View
                  </button>
                ) : (
                  <button
                    onClick={() => handle(a)}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50 active:scale-[0.97]"
                  >
                    <Sparkles size={13} strokeWidth={1.9} />
                    {busy === a.id ? "Drafting…" : "Draft it for me"}
                  </button>
                ))}
              {/* Human gate: approve or decline a pitch in review inline (#65) */}
              {a.kind === "approve" &&
                a.sessionId &&
                (isDone ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
                    <Check size={14} strokeWidth={2.2} /> Done
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setDeclining(a.id);
                        setReason("");
                      }}
                      disabled={busy === a.id}
                      aria-label={`Decline ${a.title}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border-light text-text-secondary hover:bg-surface hover:text-error transition-colors disabled:opacity-50"
                    >
                      <X size={13} strokeWidth={2.2} />
                      Decline
                    </button>
                    <button
                      onClick={() => review(a, "approve")}
                      disabled={busy === a.id}
                      aria-label={`Approve ${a.title}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
                    >
                      <ShieldCheck size={13} strokeWidth={1.9} />
                      {busy === a.id ? "Working…" : "Approve"}
                    </button>
                  </>
                ))}
              <Link
                href={a.href}
                className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-blue-primary px-3 py-1.5 rounded-md border border-border-light hover:bg-surface transition-colors"
              >
                {a.cta}
                <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
              </div>
            </div>

            {/* Decline reason — sent back to the rep who'll rework it (#66) */}
            {declining === a.id && !isDone && (
              <div className="mt-2.5 pt-2.5 border-t border-border-light">
                <label
                  htmlFor={`reason-${a.id}`}
                  className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5"
                >
                  Why send it back?
                </label>
                <textarea
                  id={`reason-${a.id}`}
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Soften the pricing claim; cite the 2024 study."
                  rows={2}
                  className="w-full bg-surface border border-border rounded-md px-2.5 py-2 text-[13px] text-text-primary outline-none focus:border-blue-primary transition-colors resize-none"
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setDeclining(null);
                      setReason("");
                    }}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-text-secondary hover:bg-surface transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => review(a, "request_changes", reason)}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-error text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <X size={13} strokeWidth={2.2} />
                    {busy === a.id ? "Sending back…" : "Send back"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <AgentDraftModal
        draft={viewing ? drafts[viewing] || null : null}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
