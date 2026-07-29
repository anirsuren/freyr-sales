"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ClipboardList,
  Copy,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

export type AgentDraft = {
  title: string;
  body: string;
  runId?: string;
  /** Present when the draft belongs to an account — enables Rewrite + tones. */
  customerId?: string;
};

const TONES = ["warm", "formal", "brief"] as const;
type Tone = (typeof TONES)[number];

// Shared by every "Draft it for me" surface so pressing the button always shows
// the same editor. This is the full drafting flow — editable body, tone chips,
// Rewrite, Save as snippet — which used to live behind "Let the agent work".
// That button was removed for naming no outcome (Anir, Jul 25: "no one's gonna
// ever press that"), but the capability belongs here, not in the bin: the named
// action opens it, the editor does the work.
export function AgentDraftModal({
  draft,
  onClose,
}: {
  draft: AgentDraft | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("warm");
  const [variant, setVariant] = useState(0);
  const [rewriting, setRewriting] = useState(false);
  const [savedSnippet, setSavedSnippet] = useState(false);
  const [snippets, setSnippets] = useState<{ id: string; title: string; body: string }[]>([]);

  // The saved snippet library, for Insert — loaded once per open.
  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    fetch("/api/agent/snippets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.snippets)) setSnippets(d.snippets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft]);

  // The editable text: user edits win until the next rewrite replaces them.
  const text = body ?? draft?.body ?? "";
  const canRegenerate = !!draft?.customerId;

  function reset() {
    setBody(null);
    setVariant(0);
    setSavedSnippet(false);
    setRewriting(false);
    onClose();
  }

  /** Fetch a fresh draft — same account, new tone and/or a new angle. */
  async function regenerate(nextTone: Tone, nextVariant: number) {
    if (!draft?.customerId) return;
    setRewriting(true);
    try {
      const res = await fetch("/api/agent/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: draft.customerId,
          tone: nextTone,
          variant: nextVariant,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.body) {
        setBody(data.body);
        setTone(nextTone);
        setVariant(nextVariant);
        setSavedSnippet(false);
      } else {
        toast(data?.error || "Couldn't rewrite that draft", "error");
      }
    } catch {
      toast("Couldn't rewrite that draft", "error");
    } finally {
      setRewriting(false);
    }
  }

  async function copy() {
    if (!text) return;
    if (await copyText(text)) {
      toast("Draft copied to your clipboard");
      return;
    }
    toast("Couldn't copy: select and copy manually", "error");
  }

  /** Keep a good draft for reuse across accounts. */
  async function saveSnippet() {
    if (!draft || !text) return;
    try {
      const res = await fetch("/api/agent/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, body: text }),
      });
      if (res.ok) {
        setSavedSnippet(true);
        toast("Saved: reuse it from any draft");
      } else {
        toast("Couldn't save the snippet", "error");
      }
    } catch {
      toast("Couldn't save the snippet", "error");
    }
  }

  /** Drop a library snippet into the draft — prepended, ready to edit. */
  async function insertSnippet(id: string) {
    const snip = snippets.find((s) => s.id === id);
    if (!snip) return;
    setBody(`${snip.body}\n\n${text}`);
    // Count the use so the library can rank favourites; non-blocking.
    void fetch("/api/agent/snippets/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <Modal
      open={!!draft}
      onClose={reset}
      title="Agent draft: ready for your review"
      size="wide"
    >
      {draft && (
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
              <FileText size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-text-primary leading-snug">
                {draft.title}
              </p>
              <p className="text-[12.5px] text-text-secondary mt-0.5">
                First draft from this account&apos;s live data, edit before you
                send. Nothing goes out automatically.
              </p>
            </div>
          </div>

          {/* Tone + rewrite — the voice controls. Picking a tone regenerates in
              that voice; Rewrite keeps the tone but takes a different angle. */}
          {canRegenerate && (
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center rounded-lg border border-border-light p-0.5"
                role="group"
                aria-label="Draft tone"
              >
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => regenerate(t, variant)}
                    disabled={rewriting}
                    aria-pressed={tone === t}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[12px] font-semibold capitalize transition-colors disabled:opacity-50",
                      tone === t
                        ? "bg-blue-primary text-white"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => regenerate(tone, variant + 1)}
                disabled={rewriting}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-md border border-border-light text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  size={13}
                  strokeWidth={2}
                  className={rewriting ? "animate-spin" : undefined}
                />
                {rewriting ? "Rewriting…" : "Rewrite"}
              </button>
              {snippets.length > 0 && (
                <select
                  aria-label="Insert snippet"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) insertSnippet(e.target.value);
                    e.target.value = "";
                  }}
                  className="h-[30px] rounded-md border border-border-light bg-white px-2 text-[12px] font-semibold text-text-secondary hover:text-text-primary focus:outline-none focus:border-blue-primary"
                >
                  <option value="" disabled>
                    Insert snippet…
                  </option>
                  {snippets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Draft body"
            className="w-full min-h-[220px] max-h-[46vh] whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary bg-surface border border-border-light rounded-xl p-4 font-sans resize-y focus:outline-none focus:border-blue-primary"
          />

          <div className="flex items-center gap-2 text-[12px] text-text-secondary bg-success/[0.06] border border-success/20 rounded-lg px-3 py-2">
            <ClipboardList
              size={14}
              strokeWidth={1.9}
              className="text-success shrink-0"
            />
            Saved to the account timeline and added to{" "}
            <strong className="font-semibold">Tasks</strong> for review.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {draft.runId && (
                <Link
                  href={`/agent/runs/${draft.runId}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary px-3 py-2 rounded-md border border-border-light hover:bg-surface transition-colors"
                >
                  Open full run
                  <ArrowRight size={13} strokeWidth={1.8} />
                </Link>
              )}
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary px-3 py-2 rounded-md border border-border-light hover:bg-surface transition-colors"
              >
                <ClipboardList size={13} strokeWidth={1.8} />
                View in Tasks
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveSnippet}
                disabled={savedSnippet}
                className={cn(
                  "inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-md border transition-colors",
                  savedSnippet
                    ? "border-success/40 text-success"
                    : "border-border-light text-text-secondary hover:bg-surface hover:text-text-primary"
                )}
              >
                {savedSnippet ? (
                  <Check size={13} strokeWidth={2.2} />
                ) : (
                  <BookmarkPlus size={13} strokeWidth={1.9} />
                )}
                {savedSnippet ? "Saved" : "Save as snippet"}
              </button>
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors active:scale-[0.97]"
              >
                <Copy size={13} strokeWidth={1.9} />
                Copy draft
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
