"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowUp,
  Loader2,
  HeartPulse,
  Flame,
  CalendarClock,
  Compass,
  Play,
  Check,
  Bot,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/pipeline";
import { planGoal } from "@/lib/agent";

type PlanItem = {
  id: string;
  title: string;
  company: string;
  customerId: string;
  href: string;
  kind: string;
};

// One-tap goal templates (V9) — each expands into a visible plan via planGoal.
const TEMPLATES = [
  {
    icon: HeartPulse,
    label: "Save my at-risk accounts",
    sub: "Score health, flag risk, propose a recovery play",
    goal: "Find at-risk accounts and propose a recovery play",
  },
  {
    icon: Flame,
    label: "Re-engage stalled deals",
    sub: "Find cooling accounts and draft outreach",
    goal: "Re-engage stalled accounts that have gone cold",
  },
  {
    icon: CalendarClock,
    label: "Draft meeting follow-ups",
    sub: "Recap booked meetings with a next step",
    goal: "Draft follow-ups for booked meetings this week",
  },
  {
    icon: Compass,
    label: "Work the whole pipeline",
    sub: "Find the highest-leverage moves across the book",
    goal: "Find the highest-leverage moves across my pipeline",
  },
];

export function AgentGoalBar() {
  const { toast } = useToast();
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{
    goal: string;
    steps: string[];
    source?: "claude" | "mock";
  } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ handled: number; escalated: number } | null>(
    null
  );
  const [preview, setPreview] = useState<{
    willHandle: PlanItem[];
    willEscalate: PlanItem[];
    heldForValue?: number;
    ceiling?: number | null;
  } | null>(null);
  // Which draftable actions the rep has kept selected for auto-handling (#63).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Optional steer the agent applies to every draft it writes this run (#64).
  const [instruction, setInstruction] = useState("");

  // Mock-first planner: with ANTHROPIC_API_KEY the route drafts via Claude; it
  // always falls back to the deterministic planGoal so the planner never stalls.
  async function run(g?: string) {
    const text = (g ?? goal).trim();
    if (!text || busy) return;
    setBusy(true);
    setPlan(null);
    setResult(null);
    setPreview(null);
    setSelected(new Set());
    setInstruction("");
    setGoal("");
    let steps = planGoal(text);
    let source: "claude" | "mock" = "mock";
    try {
      const res = await fetch("/api/agent/plan-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: text }),
      });
      const data = await res.json();
      if (Array.isArray(data.steps) && data.steps.length) {
        steps = data.steps;
        source = data.source;
      }
    } catch {
      /* keep deterministic fallback */
    }
    setBusy(false);
    setPlan({ goal: text, steps, source });
    toast(`Agent drafted a plan for “${text}”`);

    // Dry-run preview: which accounts will be handled vs. escalated (#62).
    try {
      const pres = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: text, preview: true }),
      });
      const pdata = await pres.json();
      if (pdata.ok && pdata.preview) {
        const willHandle: PlanItem[] = pdata.willHandle || [];
        setPreview({
          willHandle,
          willEscalate: pdata.willEscalate || [],
          heldForValue: pdata.heldForValue || 0,
          ceiling: pdata.ceiling ?? null,
        });
        // Default: every safe action selected; the rep can deselect any.
        setSelected(new Set(willHandle.map((it) => it.id)));
      }
    } catch {
      /* preview is best-effort; execution still works without it */
    }
  }

  // Deep link: ⌘K → "Ask the agent: …" lands here with ?goal=… and auto-runs it.
  useEffect(() => {
    try {
      const g = new URLSearchParams(window.location.search).get("goal");
      if (g && g.trim()) {
        run(g);
        const url = new URL(window.location.href);
        url.searchParams.delete("goal");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function execute() {
    if (!plan) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: plan.goal,
          // Only send selectedIds when a preview gave us a choice to make.
          ...(preview ? { selectedIds: Array.from(selected) } : {}),
          ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ handled: data.handled, escalated: data.escalated });
        toast(
          `Done — drafted ${data.handled} for you, ${data.escalated} waiting for your approval`
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't execute the plan", "error");
      }
    } catch {
      toast("Couldn't execute the plan", "error");
    } finally {
      setExecuting(false);
    }
  }

  // Partial-plan selection (#63).
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (!preview) return;
    const all = preview.willHandle.map((i) => i.id);
    setSelected((prev) => (prev.size === all.length ? new Set() : new Set(all)));
  }

  return (
    <div className="rounded-2xl border border-border-light bg-white shadow-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={16} strokeWidth={1.9} />
        </span>
        <span className="text-[14px] font-semibold text-text-primary">
          What should the agent work on?
        </span>
      </div>
      <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2 focus-within:border-blue-primary transition-colors">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Tell the agent a goal…"
          className="flex-1 bg-transparent outline-none text-[14px] text-text-primary placeholder:text-text-tertiary"
        />
        <button
          onClick={() => run()}
          disabled={busy || !goal.trim()}
          aria-label="Run agent"
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
            goal.trim()
              ? "bg-blue-primary text-white hover:bg-blue-hover"
              : "bg-border-light text-text-tertiary"
          )}
        >
          {busy ? (
            <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.2} />
          )}
        </button>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mt-4 mb-2">
        Goal templates
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={() => run(t.goal)}
              disabled={busy}
              className="flex items-start gap-2.5 text-left rounded-xl border border-border-light bg-surface p-3 hover:border-blue-subtle hover:bg-blue-light/40 transition-colors disabled:opacity-50"
            >
              <span className="w-7 h-7 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                <Icon size={15} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text-primary">
                  {t.label}
                </span>
                <span className="block text-[12px] text-text-secondary leading-snug">
                  {t.sub}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {busy && !plan && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-text-secondary">
          <Loader2 size={15} strokeWidth={2} className="animate-spin text-blue-primary" />
          Drafting your plan…
        </div>
      )}

      {plan && (
        <div className="mt-4 rounded-xl border border-border-light bg-surface p-3.5">
          <p className="text-[12px] text-text-secondary mb-2 flex items-center gap-2">
            <span>
              Plan for{" "}
              <span className="font-semibold text-text-primary">“{plan.goal}”</span>
            </span>
            {plan.source === "claude" && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-1.5 py-0.5">
                AI-written
              </span>
            )}
          </p>
          <ol className="space-y-1.5">
            {plan.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] text-text-primary">
                <span className="w-5 h-5 rounded-full bg-blue-light text-blue-primary text-[11px] font-bold flex items-center justify-center shrink-0 tnum">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>

          {preview &&
            (preview.willHandle.length > 0 ||
              preview.willEscalate.length > 0) && (
              <div className="mt-3.5 pt-3 border-t border-border-light space-y-3">
                {(preview.heldForValue ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-2.5 py-2">
                    <ShieldAlert
                      size={13}
                      strokeWidth={1.9}
                      className="text-warning shrink-0 mt-0.5"
                    />
                    <p className="text-[12px] text-text-primary">
                      <span className="font-semibold">
                        {preview.heldForValue} held for your sign-off
                      </span>{" "}
                      — over your{" "}
                      {preview.ceiling ? formatMoney(preview.ceiling) : "value"}{" "}
                      ceiling.
                    </p>
                  </div>
                )}
                {preview.willHandle.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary flex items-center gap-1.5">
                        <Bot size={13} strokeWidth={1.9} className="text-blue-primary" />
                        Will draft for you ({selected.size}/
                        {preview.willHandle.length})
                      </p>
                      {preview.willHandle.length > 1 && (
                        <button
                          onClick={toggleAll}
                          className="text-[11px] font-semibold text-blue-primary hover:underline"
                        >
                          {selected.size === preview.willHandle.length
                            ? "Deselect all"
                            : "Select all"}
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {preview.willHandle.map((it) => {
                        const on = selected.has(it.id);
                        return (
                          <li
                            key={it.id}
                            className="flex items-center gap-2 text-[12px]"
                          >
                            <button
                              onClick={() => toggle(it.id)}
                              aria-label={`${on ? "Deselect" : "Select"} ${it.title}`}
                              aria-pressed={on}
                              className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                on
                                  ? "bg-blue-primary border-blue-primary text-white"
                                  : "bg-white border-border hover:border-blue-primary"
                              )}
                            >
                              {on && <Check size={11} strokeWidth={3} />}
                            </button>
                            <span
                              className={cn(
                                "truncate",
                                on
                                  ? "text-text-primary"
                                  : "text-text-tertiary line-through"
                              )}
                            >
                              {it.title}
                            </span>
                            <Link
                              href={it.href}
                              aria-label={`Open ${it.company || it.title}`}
                              className="ml-auto text-text-tertiary hover:text-blue-primary shrink-0"
                            >
                              <ArrowUpRight size={12} strokeWidth={2} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {preview.willEscalate.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5 flex items-center gap-1.5">
                      <ShieldCheck size={13} strokeWidth={1.9} className="text-warning" />
                      Needs your approval ({preview.willEscalate.length})
                    </p>
                    <ul className="space-y-1">
                      {preview.willEscalate.map((it, i) => (
                        <li key={i}>
                          <Link
                            href={it.href}
                            className="flex items-center gap-2 text-[12px] text-text-secondary hover:text-blue-primary group"
                          >
                            <ShieldCheck
                              size={13}
                              strokeWidth={2}
                              className="text-warning shrink-0"
                            />
                            <span className="truncate">{it.title}</span>
                            <ArrowUpRight
                              size={11}
                              strokeWidth={2}
                              className="text-text-tertiary group-hover:text-blue-primary shrink-0 ml-auto"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          {result ? (
            <div className="flex items-center gap-3 mt-3.5 pt-3 border-t border-border-light">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
                <Check size={15} strokeWidth={2.2} />
                Done — drafted {result.handled} for you, {result.escalated}{" "}
                waiting for your approval
              </span>
            </div>
          ) : (
            <div className="mt-3.5 pt-3 border-t border-border-light">
              {/* Steer every draft the agent writes this run (#64) */}
              <label
                htmlFor="plan-instruction"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5"
              >
                Steer the drafts (optional)
              </label>
              <input
                id="plan-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. mention our new FDA fast-track service"
                className="w-full bg-surface border border-border rounded-md px-2.5 py-2 text-[13px] text-text-primary outline-none focus:border-blue-primary transition-colors"
              />
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={execute}
                  disabled={
                    executing ||
                    (preview != null &&
                      selected.size === 0 &&
                      preview.willEscalate.length === 0)
                  }
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-50"
                >
                  <Play size={14} strokeWidth={2} />
                  {executing ? "Executing…" : "Execute plan"}
                </button>
                <span className="text-[12px] text-text-tertiary">
                  {preview
                    ? `Will draft ${selected.size} for you · ${preview.willEscalate.length} need your approval`
                    : "Drafts the safe ones for you · keeps anything needing approval"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
