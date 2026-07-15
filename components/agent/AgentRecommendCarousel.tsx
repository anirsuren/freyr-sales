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
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { AgentDraftModal, type AgentDraft } from "@/components/agent/AgentDraftModal";
import { cn } from "@/lib/utils";
import { DRAFTABLE, type AgentAction, type AgentActionKind } from "@/lib/agent";

const META: Record<
  AgentActionKind,
  { icon: typeof Send; bg: string; color: string }
> = {
  approve: { icon: ClipboardCheck, bg: "rgba(255,159,10,0.14)", color: "#7A4A00" },
  send: { icon: Send, bg: "rgba(52,199,89,0.15)", color: "#1A7A35" },
  reengage: { icon: Flame, bg: "rgba(255,59,48,0.12)", color: "#B02020" },
  stabilize: { icon: HeartPulse, bg: "rgba(255,59,48,0.12)", color: "#B02020" },
  followup: { icon: CalendarClock, bg: "#E8F1FB", color: "#0040A0" },
};

// One rich recommendation at a time, paged left/right, with an "Up next" queue
// alongside so nothing stacks and the width is used (Anir, Jul 7: "I don't want
// these one on top of another — a nice UI where I press left and right… each
// task should have a lot more information… look how much space on the right").
export function AgentRecommendCarousel({ actions }: { actions: AgentAction[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>({});
  const [viewing, setViewing] = useState<string | null>(null);

  if (actions.length === 0) return null;
  const idx = Math.min(i, actions.length - 1);
  const a = actions[idx];
  const m = META[a.kind];
  const Icon = m.icon;
  const isDone = done.has(a.id);
  const draftable = DRAFTABLE.includes(a.kind);

  const go = (n: number) => {
    setDeclining(null);
    setDir(n > 0 ? "next" : "prev");
    setI((prev) => (prev + n + actions.length) % actions.length);
  };
  const jump = (k: number) => {
    setDeclining(null);
    setDir(k >= idx ? "next" : "prev");
    setI(k);
  };

  async function handle(x: AgentAction) {
    setBusy(x.id);
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: x.kind, customerId: x.customerId }),
      });
      const data = await res.json();
      if (data.ok && data.draft) {
        setDone((s) => new Set(s).add(x.id));
        setDrafts((d) => ({
          ...d,
          [x.id]: { title: data.draft.title, body: data.draft.body, runId: data.runId },
        }));
        setViewing(x.id);
        toast("Draft ready — saved to the timeline and added to Tasks");
        router.refresh();
      } else toast(data.error || "Agent couldn't complete that", "error");
    } catch {
      toast("Agent couldn't complete that", "error");
    } finally {
      setBusy(null);
    }
  }

  async function review(
    x: AgentAction,
    decision: "approve" | "request_changes",
    note?: string
  ) {
    if (!x.sessionId) return;
    setBusy(x.id);
    try {
      const res = await fetch(`/api/sessions/${x.sessionId}/review`, {
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
        setDone((s) => new Set(s).add(x.id));
        toast(
          decision === "approve"
            ? "Pitch approved — ready to send"
            : "Pitch sent back for changes"
        );
        router.refresh();
      } else toast(data.error || "Couldn't update the pitch", "error");
    } catch {
      toast("Couldn't update the pitch", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* Toolbar — position + arrows */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-text-tertiary tnum">
          <span className="font-semibold text-text-secondary">{idx + 1}</span> of{" "}
          {actions.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go(-1)}
            aria-label="Previous recommendation"
            className="w-8 h-8 rounded-lg bg-white border border-border-light flex items-center justify-center text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors"
          >
            <ChevronLeft size={17} strokeWidth={2} />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next recommendation"
            className="w-8 h-8 rounded-lg bg-white border border-border-light flex items-center justify-center text-text-secondary hover:text-blue-primary hover:border-blue-subtle transition-colors"
          >
            <ChevronRight size={17} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_248px] gap-4 items-start overflow-hidden">
        {/* The current recommendation — rich; slides in from the paged side */}
        <div
          key={idx}
          className={cn(
            "bg-white border border-border rounded-xl shadow-card p-5 transition-shadow duration-200 hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.16)]",
            dir === "next" ? "slide-in-right" : "slide-in-left"
          )}
        >
          <div className="flex items-start gap-3.5">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: m.bg, color: m.color }}
            >
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[16px] font-semibold text-text-primary leading-snug">
                {a.title}
              </h3>
              {a.company && (
                <span className="inline-flex items-center gap-1.5 mt-1">
                  <CompanyLogo name={a.company} className="w-4 h-4 text-[7px]" />
                  <Link
                    href={a.href}
                    className="text-[12.5px] font-medium text-blue-primary hover:underline"
                  >
                    {a.company}
                  </Link>
                </span>
              )}
            </div>
          </div>

          <p className="text-[13.5px] text-text-secondary leading-relaxed mt-3">
            {a.rationale}
          </p>

          {a.facts && a.facts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {a.facts.map((f, k) => (
                <span
                  key={k}
                  className="inline-flex items-center text-[11.5px] font-medium text-text-secondary bg-surface border border-border-light rounded-full px-2.5 py-1"
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* One clean action row — primary on the left, open-link on the right */}
          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border-light">
            <div className="flex items-center gap-2">
              {draftable &&
                (isDone && drafts[a.id] ? (
                  <button
                    onClick={() => setViewing(a.id)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md border border-success/40 text-success hover:bg-success/10 transition-colors"
                  >
                    <Check size={15} strokeWidth={2.2} /> Drafted · View
                  </button>
                ) : (
                  <button
                    onClick={() => handle(a)}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50 shadow-[0_1px_2px_rgba(0,113,227,0.20)] active:scale-[0.97]"
                  >
                    <Sparkles size={14} strokeWidth={1.9} />
                    {busy === a.id ? "Drafting…" : "Draft it for me"}
                  </button>
                ))}

              {a.kind === "approve" &&
                a.sessionId &&
                (isDone ? (
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-success">
                    <Check size={15} strokeWidth={2.2} /> Done
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => review(a, "approve")}
                      disabled={busy === a.id}
                      aria-label={`Approve ${a.title}`}
                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50 shadow-[0_1px_2px_rgba(0,113,227,0.20)]"
                    >
                      <ShieldCheck size={14} strokeWidth={1.9} />
                      {busy === a.id ? "Working…" : "Approve"}
                    </button>
                    <button
                      onClick={() => {
                        setDeclining(declining === a.id ? null : a.id);
                        setReason("");
                      }}
                      disabled={busy === a.id}
                      aria-label={`Decline ${a.title}`}
                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface hover:text-error transition-colors disabled:opacity-50"
                    >
                      <X size={14} strokeWidth={2.2} />
                      Decline
                    </button>
                  </>
                ))}

              {a.kind === "send" && (
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)]"
                >
                  <Send size={14} strokeWidth={1.9} />
                  Open to send
                </Link>
              )}
            </div>

            {a.kind !== "send" && (
              <Link
                href={a.href}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-primary hover:underline shrink-0"
              >
                {a.cta}
                <ArrowRight size={14} strokeWidth={1.9} />
              </Link>
            )}
          </div>

          {declining === a.id && !isDone && (
            <div className="mt-3 pt-3 border-t border-border-light">
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
        </div>

        {/* Up next — fills the right side; click to jump */}
        <div className="bg-white border border-border-light rounded-xl p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary px-1.5 mb-1.5">
            Up next
          </p>
          <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
            {actions.map((x, k) => {
              const xm = META[x.kind];
              const XIcon = xm.icon;
              const active = k === idx;
              return (
                <button
                  key={x.id}
                  onClick={() => jump(k)}
                  className={cn(
                    "w-full flex items-center gap-2.5 text-left rounded-lg px-2 py-2 border-l-2 transition-colors",
                    active
                      ? "bg-blue-light border-blue-primary"
                      : "border-transparent hover:bg-surface"
                  )}
                >
                  {x.company ? (
                    <CompanyLogo
                      name={x.company}
                      className="w-6 h-6 text-[8px] shrink-0"
                    />
                  ) : (
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: xm.bg, color: xm.color }}
                    >
                      <XIcon size={13} strokeWidth={1.9} />
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[12.5px] leading-snug truncate",
                      active
                        ? "font-semibold text-blue-primary"
                        : "font-medium text-text-secondary"
                    )}
                  >
                    {x.company || x.title}
                  </span>
                  {done.has(x.id) && (
                    <Check
                      size={13}
                      strokeWidth={2.4}
                      className="ml-auto text-success shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AgentDraftModal
        draft={viewing ? drafts[viewing] || null : null}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
