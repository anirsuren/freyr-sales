"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowUp, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AccountContext } from "@/lib/agent";

const SUGGESTIONS = [
  "How healthy is this account?",
  "What should I do next?",
  "Who are the contacts?",
  "Summarize this account",
];

type Msg = { role: "agent" | "me"; text: string; source?: "claude" | "mock" };

export function AccountAgentChat({
  context,
  customerId,
}: {
  context: AccountContext;
  customerId: string;
}) {
  const greeting: Msg = {
    role: "agent",
    text: `Ask me anything about ${context.company} — health, next steps, deals, or contacts.`,
  };
  const [msgs, setMsgs] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the persisted thread so the conversation survives navigation (V9 #45).
  useEffect(() => {
    fetch(`/api/agent/chat?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.messages) && d.messages.length) {
          setMsgs(
            d.messages.map((m: Msg) => ({
              role: m.role,
              text: m.text,
              source: m.source,
            }))
          );
        }
      })
      .catch(() => {});
  }, [customerId]);

  async function ask(q?: string) {
    const text = (q ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [
      ...m,
      { role: "me", text },
      { role: "agent", text: "Thinking…" },
    ]);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, question: text, context }),
      });
      const data = await res.json();
      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "agent",
          text: data.answer || "I couldn't answer that just now.",
          source: data.source,
        };
        return next;
      });
    } catch {
      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "agent",
          text: "I couldn't reach the agent just now.",
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  async function clearThread() {
    try {
      await fetch("/api/agent/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
    } catch {
      /* reset locally regardless */
    }
    setMsgs([greeting]);
  }

  const hasThread = msgs.length > 1;

  return (
    <div className="max-w-[680px]">
      <div className="rounded-xl border border-border-light bg-white shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-blue-primary text-white flex items-center justify-center">
            <Sparkles size={15} strokeWidth={1.9} />
          </span>
          <span className="text-[14px] font-semibold text-text-primary">
            Ask the agent
          </span>
          {hasThread && (
            <button
              onClick={clearThread}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-text-tertiary hover:text-error transition-colors"
            >
              <Eraser size={12} strokeWidth={1.9} />
              Clear
            </button>
          )}
          <span
            className={cn(
              "text-[11px] text-text-tertiary",
              !hasThread && "ml-auto"
            )}
          >
            Powered by Claude when a key is set
          </span>
        </div>
        <div className="p-4 space-y-3 min-h-[220px]">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                m.role === "agent"
                  ? "bg-surface text-text-primary"
                  : "bg-blue-primary text-white ml-auto"
              )}
            >
              {m.text}
              {m.source === "claude" && (
                <span className="block mt-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary">
                  AI-written
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-2 mb-2.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="text-[12px] text-text-secondary border border-border-light rounded-full px-3 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-blue-primary transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about this account…"
              className="flex-1 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={() => ask()}
              disabled={!input.trim() || busy}
              aria-label="Ask the agent"
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0",
                input.trim() && !busy
                  ? "bg-blue-primary text-white hover:bg-blue-hover"
                  : "bg-border-light text-text-tertiary"
              )}
            >
              <ArrowUp size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
