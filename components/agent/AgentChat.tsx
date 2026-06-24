"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowUp,
  Sparkles,
  Inbox,
  SlidersHorizontal,
  Trash2,
  MessageSquareText,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "agent"; text: string; ts: number };
type Convo = { id: string; title: string; messages: Msg[]; updated: number };

const KEY = "freyr.agent.conversations";

const STARTERS = [
  "What should I focus on today?",
  "Which deals are cooling?",
  "What's my open pipeline worth?",
  // An action starter (not just a question) — shows the agent DOES work, not
  // only answers. Resolves to the real quietest account and drafts it.
  "Draft a re-engagement for a cooling account",
];

function load(): Convo[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function save(c: Convo[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c.slice(0, 50)));
  } catch {}
}
function uid() {
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// --- lightweight markdown: [link](/path), **bold**, *italic*, `code` + bullets -
// Links are restricted to internal paths (href must start with "/") so the chat
// can only ever deep-link inside the app, never to an external URL.
function renderInline(s: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\[([^\]]+)\]\((\/[^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[2] != null && m[3] != null)
      nodes.push(
        <Link key={`${keyBase}-${k++}`} href={m[3]} className="text-blue-primary font-medium hover:underline">
          {m[2]}
        </Link>
      );
    else if (m[4] != null) nodes.push(<strong key={`${keyBase}-${k++}`}>{m[4]}</strong>);
    else if (m[5] != null) nodes.push(<strong key={`${keyBase}-${k++}`}>{m[5]}</strong>);
    else if (m[6] != null) nodes.push(<em key={`${keyBase}-${k++}`}>{m[6]}</em>);
    else if (m[7] != null) nodes.push(<em key={`${keyBase}-${k++}`}>{m[7]}</em>);
    else if (m[8] != null)
      nodes.push(
        <code key={`${keyBase}-${k++}`} className="px-1 py-0.5 rounded bg-border-light text-[13px]">
          {m[8]}
        </code>
      );
    last = m.index + m[0].length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-1.5">
        {items.map((it, idx) => (
          <li key={idx}>{renderInline(it, `${key}-${idx}`)}</li>
        ))}
      </ul>
    );
  };
  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush(`ul-${i}`);
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${i}`} className="h-2.5" />);
      return;
    }
    blocks.push(
      <p key={`p-${i}`} className="whitespace-pre-wrap">
        {renderInline(line, `p-${i}`)}
      </p>
    );
  });
  flush("ul-end");
  return <>{blocks}</>;
}

// Quick typewriter reveal for the freshest agent reply (ChatGPT-style).
function Typewriter({
  text,
  onDone,
  onTick,
}: {
  text: string;
  onDone: () => void;
  onTick?: () => void;
}) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    setN(0);
    doneRef.current = false;
  }, [text]);
  useEffect(() => {
    if (n >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const step = Math.max(2, Math.round(text.length / 140));
    const t = setTimeout(() => {
      setN((x) => Math.min(text.length, x + step));
      onTick?.();
    }, 14);
    return () => clearTimeout(t);
  }, [n, text, onDone, onTick]);
  return <MarkdownText text={text.slice(0, n)} />;
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

export function AgentChat() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [typingTs, setTypingTs] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConvos(load());
  }, []);

  const active = convos.find((c) => c.id === activeId) || null;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);
  const finishTyping = useCallback(() => setTypingTs(null), []);

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages.length, sending, scrollToBottom]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setInput("");

      // start or continue a conversation — decide the id synchronously so the
      // very next message continues the same thread (don't mutate inside the updater).
      const isNew = !activeId;
      const id = activeId || uid();
      setActiveId(id);
      setConvos((prev) => {
        let next = isNew
          ? [{ id, title: text.slice(0, 48), messages: [], updated: Date.now() }, ...prev]
          : [...prev];
        next = next.map((c) =>
          c.id === id
            ? {
                ...c,
                title: c.messages.length === 0 ? text.slice(0, 48) : c.title,
                messages: [...c.messages, { role: "user", text, ts: Date.now() }],
                updated: Date.now(),
              }
            : c
        );
        save(next);
        return next;
      });
      setSending(true);

      // Never let a slow or hung request freeze the composer — bail after 45s.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        // Send the conversation so far so follow-ups ("make it shorter") have context.
        const prior =
          convos.find((c) => c.id === id)?.messages.map((mm) => ({ role: mm.role, text: mm.text })) ||
          [];
        const res = await fetch("/api/agent/converse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: prior }),
          signal: controller.signal,
        });
        const data = await res.json();
        const reply: string = data.reply || "Sorry — I couldn't answer that one.";
        if (Array.isArray(data.suggestions) && data.suggestions.length)
          setSuggestions(data.suggestions);
        const replyTs = Date.now();
        setConvos((prev) => {
          const next = prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: [...c.messages, { role: "agent" as const, text: reply, ts: replyTs }],
                  updated: replyTs,
                }
              : c
          );
          save(next);
          return next;
        });
        setTypingTs(replyTs); // animate this reply in with a typewriter reveal
      } catch {
        setConvos((prev) => {
          const next = prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: [...c.messages, { role: "agent" as const, text: "Something went wrong reaching the agent. Try again in a moment.", ts: Date.now() }],
                  updated: Date.now(),
                }
              : c
          );
          save(next);
          return next;
        });
      } finally {
        clearTimeout(timer);
        setSending(false);
      }
    },
    [activeId, sending, convos]
  );

  function newChat() {
    setActiveId(null);
    setSuggestions(STARTERS);
    setInput("");
  }

  function remove(id: string) {
    setConvos((prev) => {
      const next = prev.filter((c) => c.id !== id);
      save(next);
      return next;
    });
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside className="w-[260px] shrink-0 border-r border-border-light flex flex-col bg-surface/40">
        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-primary text-white text-[14px] font-semibold hover:bg-blue-hover transition-colors"
          >
            <Plus size={17} strokeWidth={2.2} />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {convos.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-text-tertiary">
              No conversations yet. Ask the agent anything to start.
            </p>
          ) : (
            <>
              <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                Recent
              </p>
              <ul className="space-y-0.5">
                {convos.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 pl-2.5 pr-7 py-2 rounded-md text-[13px] truncate transition-colors",
                        c.id === activeId
                          ? "bg-blue-light text-blue-primary font-medium"
                          : "text-text-secondary hover:bg-surface"
                      )}
                    >
                      <MessageSquareText size={15} strokeWidth={1.7} className="shrink-0" />
                      <span className="truncate">{c.title || "New chat"}</span>
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      aria-label={`Delete ${c.title || "chat"}`}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="p-2 border-t border-border-light flex flex-col gap-0.5">
          <Link href="/agent/plan" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-text-secondary hover:bg-surface transition-colors">
            <Target size={16} strokeWidth={1.7} /> Goals
          </Link>
          <Link href="/agent/inbox" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-text-secondary hover:bg-surface transition-colors">
            <Inbox size={16} strokeWidth={1.7} /> To-do
          </Link>
          <Link href="/agent/settings" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-text-secondary hover:bg-surface transition-colors">
            <SlidersHorizontal size={16} strokeWidth={1.7} /> Agent settings
          </Link>
        </div>
      </aside>

      {/* Thread + composer */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!active || active.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <span className="w-12 h-12 rounded-2xl bg-blue-primary text-white flex items-center justify-center mb-4">
              <Sparkles size={24} strokeWidth={1.9} />
            </span>
            <h1 className="text-[26px] font-semibold text-text-primary tracking-[-0.01em]">
              Hey Suren — what do you want to work on?
            </h1>
            <p className="text-[14px] text-text-secondary mt-2 text-center max-w-[520px]">
              Ask about your pipeline, an account, or have me draft outreach. I&apos;ll
              do the work and leave everything for you to review.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-[640px]">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[13px] text-text-secondary border border-border-light rounded-full px-3.5 py-1.5 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-[760px] mx-auto px-6 py-8 space-y-5">
              {active.messages.map((msg, i) =>
                msg.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[78%] bg-blue-primary text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3 justify-start">
                    <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles size={16} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 max-w-[82%]">
                      <p className="text-[12px] font-semibold text-text-tertiary mb-1">Agent</p>
                      <div className="text-[14px] text-text-primary leading-relaxed bg-surface border border-border-light rounded-2xl rounded-tl-md px-4 py-2.5">
                        {msg.ts === typingTs ? (
                          <Typewriter text={msg.text} onDone={finishTyping} onTick={scrollToBottom} />
                        ) : (
                          <MarkdownText text={msg.text} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
              {sending && (
                <div className="flex gap-3 justify-start">
                  <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={16} strokeWidth={1.9} />
                  </span>
                  <div className="bg-surface border border-border-light rounded-2xl rounded-tl-md px-4 py-3">
                    <ThinkingDots />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-border-light px-4 py-3">
          <div className="max-w-[760px] mx-auto">
            {active && active.messages.length > 0 && suggestions.length > 0 && !sending && (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {suggestions.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-[12px] text-text-secondary border border-border-light rounded-full px-3 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 bg-surface border border-border rounded-2xl px-3 py-2 focus-within:border-blue-primary transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                aria-label="Message the agent"
                placeholder="Ask the agent anything about your pipeline…"
                className="flex-1 bg-transparent outline-none focus:shadow-none focus-visible:shadow-none resize-none text-[14px] text-text-primary placeholder:text-text-tertiary py-1.5 max-h-40"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                aria-label="Send"
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  input.trim() && !sending
                    ? "bg-blue-primary text-white hover:bg-blue-hover"
                    : "bg-border-light text-text-tertiary"
                )}
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            </div>
            <p className="text-[11px] text-text-tertiary text-center mt-2">
              The agent drafts and recommends — you approve everything before it goes out.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
