"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Check,
  Loader2,
  ShieldQuestion,
  Circle,
  Search,
  Layers,
  PenLine,
  Send,
  RotateCw,
  BookmarkPlus,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { DraftSnippet } from "@/lib/types";

const STEPS = [
  { key: "research", label: "Research the account", icon: Search },
  { key: "match", label: "Match Freyr services", icon: Layers },
  { key: "draft", label: "Draft the outreach", icon: PenLine },
  { key: "review", label: "Compliance review", icon: ShieldQuestion, gate: true },
  { key: "send", label: "Send to the contact", icon: Send },
];
const GATE = 3;

type Phase = "idle" | "running" | "awaiting" | "sending" | "done";

export function AgentRunPanel({
  customerId,
  company,
}: {
  customerId: string;
  company: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<{
    subject: string;
    body: string;
    source?: "claude" | "mock" | "edited";
  } | null>(null);
  const [variant, setVariant] = useState(0);
  const [tone, setTone] = useState("warm");
  const [rewriting, setRewriting] = useState(false);
  const [snippets, setSnippets] = useState<DraftSnippet[]>([]);
  const [savedSnippet, setSavedSnippet] = useState(false);

  // load the rep's saved snippets when the gate opens (for "Insert snippet")
  useEffect(() => {
    if (phase !== "awaiting" || snippets.length) return;
    fetch("/api/agent/snippets")
      .then((r) => r.json())
      .then((d) => setSnippets(d.snippets || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function saveSnippet() {
    if (!draft) return;
    try {
      const res = await fetch("/api/agent/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.subject,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSnippets((s) => [d.snippet, ...s]);
        setSavedSnippet(true);
        toast("Saved to your snippet library");
      } else {
        toast("Couldn't save the snippet", "error");
      }
    } catch {
      toast("Couldn't save the snippet", "error");
    }
  }

  function insertSnippet(id: string) {
    const s = snippets.find((x) => x.id === id);
    if (!s) return;
    setDraft({ subject: s.subject, body: s.body, source: "edited" });
    // track which snippets actually get used (V9 #44), fire-and-forget
    fetch("/api/agent/snippets/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  function start() {
    setStep(0);
    setPhase("running");
    setDraft(null);
    setVariant(0);
    setTone("warm");
    setSavedSnippet(false);
    setOpen(true);
  }

  // t omitted on the first load → the route uses the rep's default-tone pref,
  // and we sync the chip to whatever tone came back.
  async function loadDraft(v: number, t?: string) {
    setRewriting(true);
    try {
      const res = await fetch("/api/agent/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, variant: v, ...(t ? { tone: t } : {}) }),
      });
      const d = await res.json();
      if (d.subject) {
        setDraft({ subject: d.subject, body: d.body, source: d.source });
        if (d.tone) setTone(d.tone);
      }
    } catch {
      /* keep whatever's shown */
    } finally {
      setRewriting(false);
    }
  }

  function rewrite() {
    const v = variant + 1;
    setVariant(v);
    loadDraft(v, tone);
  }

  function pickTone(t: string) {
    setTone(t);
    setVariant(0);
    loadDraft(0, t);
  }

  // auto-advance the pre-approval steps, then pause at the compliance gate
  useEffect(() => {
    if (phase !== "running") return;
    if (step >= GATE) {
      setPhase("awaiting");
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 650);
    return () => clearTimeout(t);
  }, [phase, step]);

  // fetch the actual drafted email when we reach the compliance gate, so the rep
  // approves real content (Claude when keyed, grounded template otherwise)
  useEffect(() => {
    if (phase === "awaiting" && !draft) loadDraft(0); // tone from the rep's pref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draft]);

  async function approve() {
    setPhase("sending");
    setStep(GATE + 1);
    await new Promise((r) => setTimeout(r, 650));
    try {
      await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          subject: draft?.subject,
          edited: draft?.source === "edited",
        }),
      });
    } catch {}
    setPhase("done");
    toast(`Agent play complete for ${company} — sent after approval`);
  }

  function stepState(i: number): "done" | "running" | "awaiting" | "pending" {
    if (phase === "done") return "done";
    if (i < step) return "done";
    if (i === GATE) {
      if (phase === "awaiting") return "awaiting";
      if (phase === "sending") return "done";
    }
    if (i === step && (phase === "running" || phase === "sending")) return "running";
    return "pending";
  }

  return (
    <>
      <button
        onClick={start}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
      >
        <Sparkles size={13} strokeWidth={1.9} />
        Run a play
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Agent play · ${company}`}>
        <p className="text-[13px] text-text-secondary mb-4">
          The agent runs the full outreach motion and pauses for your compliance
          approval before anything is sent.
        </p>
        <ol className="space-y-1">
          {STEPS.map((s, i) => {
            const st = stepState(i);
            const Icon = s.icon;
            return (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  st === "awaiting"
                    ? "bg-warning/10"
                    : st === "running"
                    ? "bg-blue-light/60"
                    : "bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    st === "done"
                      ? "bg-success/15 text-success"
                      : st === "running"
                      ? "bg-blue-light text-blue-primary"
                      : st === "awaiting"
                      ? "bg-warning/15 text-warning"
                      : "bg-surface text-text-tertiary"
                  )}
                >
                  {st === "done" ? (
                    <Check size={15} strokeWidth={2.4} />
                  ) : st === "running" ? (
                    <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                  ) : st === "awaiting" ? (
                    <ShieldQuestion size={15} strokeWidth={1.9} />
                  ) : (
                    <Circle size={13} strokeWidth={1.8} />
                  )}
                </span>
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon size={14} strokeWidth={1.6} className="text-text-tertiary shrink-0" />
                  <span
                    className={cn(
                      "text-[14px] truncate",
                      st === "pending" ? "text-text-tertiary" : "text-text-primary",
                      st === "done" && "text-text-secondary"
                    )}
                  >
                    {s.label}
                  </span>
                </span>
                {st === "awaiting" && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-warning shrink-0">
                    Needs you
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {phase === "awaiting" && (
          <div className="mt-4 rounded-xl border border-border-light bg-surface overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border-light flex items-center gap-2">
              <PenLine size={14} strokeWidth={1.8} className="text-blue-primary" />
              <span className="text-[12px] font-semibold text-text-primary">
                Drafted email — edit before it sends
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {draft?.source === "claude" && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-1.5 py-0.5">
                    AI-written
                  </span>
                )}
                {draft?.source === "edited" && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-secondary bg-surface border border-border-light rounded-full px-1.5 py-0.5">
                    edited
                  </span>
                )}
                <button
                  onClick={rewrite}
                  disabled={rewriting || !draft}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary hover:text-blue-hover disabled:opacity-50"
                >
                  <RotateCw
                    size={12}
                    strokeWidth={2}
                    className={cn(rewriting && "animate-spin")}
                  />
                  {rewriting ? "Rewriting…" : "Rewrite"}
                </button>
              </span>
            </div>
            {draft ? (
              <div className="p-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={saveSnippet}
                    disabled={savedSnippet}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-primary hover:text-blue-hover disabled:text-text-tertiary disabled:no-underline"
                  >
                    {savedSnippet ? (
                      <Check size={12} strokeWidth={2.2} />
                    ) : (
                      <BookmarkPlus size={12} strokeWidth={2} />
                    )}
                    {savedSnippet ? "Saved" : "Save as snippet"}
                  </button>
                  {snippets.length > 0 && (
                    <select
                      aria-label="Insert snippet"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) insertSnippet(e.target.value);
                        e.target.value = "";
                      }}
                      className="text-[11px] text-text-secondary bg-surface border border-border-light rounded-md px-2 py-1 outline-none focus:border-blue-primary"
                    >
                      <option value="">Insert snippet…</option>
                      {[...snippets]
                        .sort((a, b) => (b.uses || 0) - (a.uses || 0))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-tertiary mr-0.5">Tone</span>
                  {["warm", "formal", "brief"].map((tn) => (
                    <button
                      key={tn}
                      onClick={() => pickTone(tn)}
                      disabled={rewriting}
                      className={cn(
                        "text-[11px] font-semibold rounded-full px-2.5 py-0.5 border capitalize transition-colors disabled:opacity-50",
                        tone === tn
                          ? "border-blue-primary bg-blue-primary text-white"
                          : "border-border-light text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
                      )}
                    >
                      {tn}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Draft subject"
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, subject: e.target.value, source: "edited" } : d
                    )
                  }
                  className="w-full bg-white border border-border rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary transition-colors"
                />
                <textarea
                  aria-label="Draft body"
                  value={draft.body}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, body: e.target.value, source: "edited" } : d
                    )
                  }
                  rows={6}
                  className="w-full bg-white border border-border rounded-md px-2.5 py-2 text-[13px] text-text-secondary leading-relaxed outline-none focus:border-blue-primary transition-colors resize-none max-h-[180px]"
                />
              </div>
            ) : (
              <div className="p-3.5 flex items-center gap-2 text-[13px] text-text-tertiary">
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                Drafting…
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          {phase === "awaiting" ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Request changes
              </Button>
              <Button onClick={approve}>Approve &amp; send</Button>
            </>
          ) : phase === "done" ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button variant="secondary" disabled>
              Agent working…
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
