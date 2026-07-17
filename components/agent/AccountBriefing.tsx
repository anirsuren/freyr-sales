"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, ArrowRight, RotateCw, Copy, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import {
  buildAccountBriefing,
  type AccountContext,
  type AccountBriefing as Briefing,
} from "@/lib/agent";

// Agent account briefing (V9 #71) — the agent's proactive research read on the
// account. Renders the deterministic synthesis instantly, then swaps in a
// Claude-narrated headline when a key is present (mock-first, never blocks).
// Re-brief + copy-to-clipboard added in #72.
export function AccountBriefing({ context }: { context: AccountContext }) {
  const briefing: Briefing = buildAccountBriefing(context);
  const { toast } = useToast();
  const [narrative, setNarrative] = useState(briefing.narrative);
  const [source, setSource] = useState<"claude" | "mock">("mock");
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/agent/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const d = await res.json();
      if (d.ok && d.narrative) {
        setNarrative(d.narrative);
        setSource(d.source);
      }
    } catch {
      /* keep the deterministic narrative */
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.company, context.healthScore, context.topAction]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function copy() {
    const text =
      `${narrative}\n\n` +
      briefing.reads.map((r) => `${r.label}: ${r.text}`).join("\n") +
      `\n\nRecommended: ${briefing.recommendation}`;
    if (await copyText(text)) {
      setCopied(true);
      toast("Briefing copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
      return;
    }
    toast("Couldn't copy the briefing", "error");
  }

  return (
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/40 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-6 h-6 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={14} strokeWidth={1.9} />
        </span>
        <span className="text-[13px] font-semibold text-text-primary">
          Agent briefing
        </span>
        {source === "claude" && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-white rounded-full px-1.5 py-0.5">
            AI-written
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={load}
            disabled={refreshing}
            aria-label="Brief me again"
            title="Brief me again"
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-blue-primary hover:bg-white transition-colors disabled:opacity-50"
          >
            <RotateCw
              size={14}
              strokeWidth={1.9}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
          <button
            onClick={copy}
            aria-label="Copy briefing"
            title="Copy briefing"
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-blue-primary hover:bg-white transition-colors"
          >
            {copied ? (
              <Check size={14} strokeWidth={2.2} className="text-success" />
            ) : (
              <Copy size={14} strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>

      <p className="text-[14px] text-text-primary leading-relaxed mb-3">
        {narrative}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 mb-3">
        {briefing.reads.map((r) => (
          <div key={r.label} className="flex gap-2 text-[12px]">
            <span className="font-semibold text-text-primary shrink-0 w-[78px]">
              {r.label}
            </span>
            <span className="text-text-secondary">{r.text}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2.5 border-t border-blue-subtle">
        <ArrowRight size={14} strokeWidth={2} className="text-blue-primary shrink-0" />
        <p className="text-[12px] text-text-primary">
          <span className="font-semibold">Recommended:</span>{" "}
          {briefing.recommendation}
        </p>
      </div>
    </div>
  );
}
