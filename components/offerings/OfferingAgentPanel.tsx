"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE AGENT, ON THE OFFERING, ALREADY KNOWING WHICH OFFERING.
 *
 * Suren, Jul 30 (17:00–19:38): "I need context selling… go to offerings, click
 * on Freya.Register, now here I need an AI icon, 'chat with me' or something…
 * in fact I don't even want to go there. Ask him to do the stuff here itself.
 * If it is possible, on the right side when he clicks on it, a chat window
 * here itself."
 *
 * So the chat lives in the offering's own right rail rather than sending
 * anyone to /agent. Every question is asked WITH the offering attached, which
 * is the whole point: "from anywhere he goes from a particular offering, then
 * the context is already set that the question is related to Register."
 *
 * The general agent at /agent is untouched — he was explicit that people
 * should still be able to "ask a regular question on anything under the sun"
 * there.
 */

type Msg = { role: "you" | "agent"; text: string };

export function OfferingAgentPanel({
  offeringId,
  offeringName,
  starters,
}: {
  offeringId: string;
  offeringName: string;
  /** Questions worth asking about THIS offering, built from its own record. */
  starters: string[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest answer in view without yanking the whole page around.
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  // The offering header's "Ask AI" button focuses this panel — one listener
  // rather than lifting state up through a server component.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("freyr:ask-offering", focus);
    return () => window.removeEventListener("freyr:ask-offering", focus);
  }, []);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "you", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          // `subject` is what pins the answer to this offering — the assistant
          // route folds it into "where" and the retrieval prompt.
          subject: offeringName,
          pageLabel: "Offering",
          path: `/offerings/${offeringId}`,
          pageContext:
            (document.getElementById("main-content")?.innerText || "").slice(0, 6000),
        }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        {
          role: "agent",
          text:
            data.answer ||
            data.error ||
            "I couldn't answer that one — try asking it a different way.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "agent", text: "That didn't go through. Try again in a moment." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="offering-agent"
      className="overflow-hidden rounded-xl border border-blue-subtle bg-white shadow-card"
    >
      <header className="flex items-center gap-2 border-b border-border-light bg-blue-light/60 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-primary text-white">
          <Sparkles size={13} strokeWidth={2} />
        </span>
        <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-blue-primary">
          Ask about this offering
        </h2>
      </header>

      <div ref={boxRef} className="max-h-[340px] overflow-y-auto px-4 py-3">
        {msgs.length === 0 ? (
          <>
            <p className="text-[12.5px] leading-relaxed text-text-secondary">
              Answers come from <span className="font-semibold">{offeringName}</span>{" "}
              — its brief, its services, and every file on this page.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="cursor-pointer rounded-lg border border-border-light bg-[var(--surface)] px-2.5 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "text-[13px] leading-relaxed",
                  m.role === "you"
                    ? "ml-6 rounded-xl bg-blue-light px-3 py-2 font-medium text-blue-primary"
                    : "whitespace-pre-wrap text-text-primary"
                )}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
                <Loader2 size={13} className="animate-spin" /> Reading{" "}
                {offeringName}…
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border-light p-2.5">
        <div className="flex items-end gap-1.5 rounded-xl border border-border-light bg-white px-2.5 py-1.5 focus-within:border-blue-primary">
          <textarea
            ref={inputRef}
            rows={1}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
            placeholder={`Ask anything about ${offeringName}`}
            aria-label={`Ask about ${offeringName}`}
            className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button
            type="button"
            onClick={() => void ask(q)}
            disabled={!q.trim() || busy}
            aria-label="Send"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-opacity disabled:cursor-default disabled:opacity-30"
          >
            <ArrowUp size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </section>
  );
}
