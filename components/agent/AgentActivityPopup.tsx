"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  X,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { AgentRunStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentActivity = {
  title: string;
  summary: string;
  steps: AgentRunStep[];
  runId?: string | null;
  escalated?: number;
};

// A small bottom-right popup that shows, step by step, what the agent just did
// for you. Reveals each step in sequence so it reads like live progress. Close to
// dismiss, or View to jump to the agent. Human-led: it only ever prepares drafts.
export function AgentActivityPopup({
  activity,
  onClose,
}: {
  activity: AgentActivity | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Slide-in on appear.
  useEffect(() => {
    if (activity) {
      setMounted(false);
      const t = setTimeout(() => setMounted(true), 20);
      return () => clearTimeout(t);
    }
    setMounted(false);
  }, [activity]);

  // Reveal steps one at a time so it feels like the agent is working through them.
  useEffect(() => {
    if (!activity) {
      setShown(0);
      return;
    }
    const total = activity.steps?.length || 0;
    setShown(total === 0 ? 0 : 1);
    if (total <= 1) return;
    let i = 1;
    const id = setInterval(() => {
      i += 1;
      setShown((n) => Math.min(total, n + 1));
      if (i >= total) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [activity]);

  if (!activity) return null;
  const steps = activity.steps || [];
  const revealing = shown < steps.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-4 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)]",
        "rounded-2xl border border-border-light bg-white shadow-xl overflow-hidden",
        "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        mounted
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-4 opacity-0 scale-[0.96]"
      )}
    >
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light bg-blue-light/40">
        <span className="w-7 h-7 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={15} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary truncate">
            {activity.title}
          </p>
          <p className="text-[11px] text-text-secondary truncate">
            {activity.summary}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-text-tertiary hover:text-text-primary shrink-0"
        >
          <X size={16} strokeWidth={1.9} />
        </button>
      </div>

      {/* steps */}
      <div className="max-h-[240px] overflow-y-auto px-3 py-2.5 space-y-2">
        {steps.length === 0 ? (
          <p className="text-[12px] text-text-secondary px-1 py-1.5">
            You&apos;re all caught up — nothing needed doing right now.
          </p>
        ) : (
          steps.slice(0, shown).map((s, i) => {
            const needs = s.status === "escalated" || s.status === "gated";
            return (
              <div key={i} className="flex items-start gap-2 step-in">
                <span className="shrink-0 mt-0.5">
                  {needs ? (
                    <Clock size={14} strokeWidth={1.9} className="text-amber-500" />
                  ) : (
                    <CheckCircle2 size={14} strokeWidth={1.9} className="text-success" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-text-primary leading-snug">
                    {s.label}
                  </span>
                  {s.detail && (
                    <span className="block text-[11px] text-text-tertiary leading-snug">
                      {s.detail}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
        {revealing && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary pl-0.5 pt-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-text-tertiary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
              />
            ))}
            <span className="ml-0.5">taking the next step…</span>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border-light">
        <span className="text-[11px] text-text-tertiary">
          Nothing sent — drafts saved for you.
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onClose}
            className="text-[12px] font-medium px-2.5 py-1.5 rounded-md text-text-secondary hover:bg-surface transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              router.push("/agent");
            }}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors inline-flex items-center gap-1"
          >
            View
            <ArrowRight size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
