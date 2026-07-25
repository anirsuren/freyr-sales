"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, ArrowUp, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { firstNameForUser, userScopedStorageKey } from "@/lib/userIdentity";

type Entity = { name: string; id: string; kind: "company" | "contact" };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Turn a plain-text string into nodes where any known company/person name
// becomes an inline entity pill (logo/headshot + link). Matched longest-first so
// "Cortexa Biopharma" wins over "Cortexa". Case-insensitive, word-bounded.
function injectEntities(text: string, entities: Entity[], keyBase: string): ReactNode[] {
  if (!entities.length || !text) return [text];
  const re = new RegExp(
    `\\b(${entities.map((e) => escapeRe(e.name)).join("|")})\\b`,
    "gi"
  );
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const hit = entities.find(
      (e) => e.name.toLowerCase() === m![1].toLowerCase()
    );
    if (hit) {
      out.push(
        <Link
          key={`${keyBase}-e${k++}`}
          href={hit.kind === "company" ? `/customers/${hit.id}` : `/contacts/${hit.id}`}
          className="inline-flex items-center gap-1 align-middle rounded-full bg-blue-light/70 border border-blue-subtle/60 pl-1 pr-2 py-0.5 mx-0.5 font-semibold text-blue-primary no-underline hover:bg-blue-light hover:border-blue-subtle transition-colors"
        >
          {hit.kind === "company" ? (
            <CompanyLogo name={hit.name} className="w-4 h-4 text-[7px] shrink-0" />
          ) : (
            <Avatar name={hit.name} className="w-4 h-4 text-[7px] shrink-0" />
          )}
          {m[1]}
        </Link>
      );
    } else {
      out.push(m[1]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The always-on assistant (Anir, Jul 8). A bubble bottom-right on every page;
// click to open a chat that knows what page/record you're looking at. Hide it
// from its header; bring it back from the top bar. The thread is saved to
// localStorage so it survives navigation and reloads.
const THREAD_KEY = "freyr.assistant.thread.v2";

type Msg = { role: "agent" | "me"; text: string };

function pageLabel(path: string): string {
  const p = path.replace(/[?#].*$/, "");
  const map: [RegExp, string][] = [
    [/^\/dashboard/, "the Dashboard"],
    [/^\/pipeline/, "the Pipeline board"],
    [/^\/forecast/, "the Forecast"],
    [/^\/customers\/[^/]+/, "a customer account"],
    [/^\/customers/, "Customers"],
    [/^\/contacts\/[^/]+/, "a contact"],
    [/^\/contacts/, "Contacts"],
    [/^\/sessions\/[^/]+/, "a pitch session"],
    [/^\/sessions/, "Sessions"],
    [/^\/offerings\/[^/]+/, "an offering"],
    [/^\/offerings/, "Offerings"],
    [/^\/campaigns\/[^/]+/, "a campaign"],
    [/^\/campaigns/, "Campaigns"],
    [/^\/voice/, "Voice agents"],
    [/^\/sequences/, "Sequences"],
    [/^\/reports/, "Reports"],
    [/^\/analytics/, "Analytics"],
    [/^\/tasks/, "Tasks"],
    [/^\/activity/, "Activity"],
    [/^\/agent/, "the Agent workspace"],
  ];
  for (const [re, label] of map) if (re.test(p)) return label;
  return "Freyr";
}

function suggestionsFor(label: string): string[] {
  if (label.includes("customer") || label.includes("contact"))
    return ["Summarize this account", "Draft an intro email", "What's the next best action?"];
  if (label.includes("Pipeline") || label.includes("Forecast"))
    return ["Which deals are cooling?", "What should I prioritize?", "How's my quarter tracking?"];
  if (label.includes("session"))
    return ["Tighten this pitch", "Draft a follow-up", "What objections should I expect?"];
  if (label.includes("Campaign"))
    return ["Who should I add?", "Draft a subject line", "How's this campaign doing?"];
  return ["What should I work on next?", "Summarize my pipeline", "Who's gone quiet?"];
}

// Minimal, safe markdown: **bold**, `code`, and line breaks. Content is our own
// agent's reply, but we still build React nodes (no dangerouslySetInnerHTML).
function renderRich(text: string, entities: Entity[] = []): ReactNode {
  return text.split("\n").map((line, li) => {
    const nodes: ReactNode[] = [];
    // **bold**, *italic*, `code` — match bold before italic so ** wins over *.
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    const plain = (s: string, kb: string) => nodes.push(...injectEntities(s, entities, kb));
    while ((m = re.exec(line))) {
      if (m.index > last) plain(line.slice(last, m.index), `${li}-${k}`);
      if (m[2] != null) nodes.push(<strong key={k++}>{m[2]}</strong>);
      else if (m[3] != null) nodes.push(<em key={k++}>{m[3]}</em>);
      else if (m[4] != null)
        nodes.push(
          <code key={k++} className="px-1 py-0.5 rounded bg-black/5 text-[12px]">
            {m[4]}
          </code>
        );
      last = m.index + m[0].length;
    }
    if (last < line.length) plain(line.slice(last), `${li}-end`);
    return (
      <span key={li} className="block min-h-[2px]">
        {nodes}
      </span>
    );
  });
}

// A little personality while it works (Anir: "like Claude Code's rotating
// words") — blue equalizer bars + an italic word that changes every ~1.6s.
const THINKING_WORDS = [
  "Thinking",
  "Percolating",
  "Noodling",
  "Cogitating",
  "Scheming",
  "Bamboozling",
  "Conjuring",
  "Crunching",
  "Pondering",
  "Vibing",
];
function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % THINKING_WORDS.length), 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="flex items-center gap-2.5" aria-label="Thinking">
      <span className="flex items-end gap-1 h-4">
        <span className="eq-bar" style={{ animationDelay: "0ms" }} />
        <span className="eq-bar" style={{ animationDelay: "150ms" }} />
        <span className="eq-bar" style={{ animationDelay: "300ms" }} />
      </span>
      <span className="text-[12.5px] italic text-text-tertiary">
        {THINKING_WORDS[i]}…
      </span>
    </span>
  );
}

export function AgentDock({
  open,
  onOpenChange,
  hidden,
  pathname,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hidden: boolean;
  onHide: () => void;
  pathname: string;
}) {
  const currentUser = useCurrentUser();
  const firstName = firstNameForUser(currentUser);
  const threadStorageKey = userScopedStorageKey(THREAD_KEY, currentUser.id);
  const label = pageLabel(pathname);
  const [subject, setSubject] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUserIdRef = useRef(currentUser.id);

  // Load the name→id index once so the assistant's answers can render company
  // logos and headshots inline (Suren, #92). Longest names first so multi-word
  // company names match before any single-word contained token.
  useEffect(() => {
    let alive = true;
    fetch("/api/agent/entities")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list: Entity[] = [
          ...(d.companies || []).map((c: { name: string; id: string }) => ({
            ...c,
            kind: "company" as const,
          })),
          ...(d.contacts || []).map((c: { name: string; id: string }) => ({
            ...c,
            kind: "contact" as const,
          })),
        ].filter((e) => e.name && e.name.length > 2);
        list.sort((a, b) => b.name.length - a.name.length);
        setEntities(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Anything in the app can open THIS chat (instead of a second panel) by firing
  // `freyr:ask-agent` — optionally with a prompt to send. Deliverables and the
  // old account "Ask the agent" drawer now route here (Suren: "shouldn't it just
  // open the chat?"). One chat, one place.
  useEffect(() => {
    function onAsk(e: Event) {
      const prompt = (e as CustomEvent).detail?.prompt as string | undefined;
      onOpenChange(true);
      if (prompt && prompt.trim()) setPending(prompt.trim());
    }
    window.addEventListener("freyr:ask-agent", onAsk as EventListener);
    return () => window.removeEventListener("freyr:ask-agent", onAsk as EventListener);
  }, [onOpenChange]);

  useEffect(() => {
    activeUserIdRef.current = currentUser.id;
    setHydratedStorageKey(null);
    setMsgs([]);
    setInput("");
    setBusy(false);
    setPending(null);
    try {
      const raw = localStorage.getItem(threadStorageKey);
      setMsgs(raw ? JSON.parse(raw) : []);
    } catch {}
    setHydratedStorageKey(threadStorageKey);
    return () => {
      activeUserIdRef.current = "";
    };
  }, [currentUser.id, threadStorageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== threadStorageKey) return;
    try {
      localStorage.setItem(threadStorageKey, JSON.stringify(msgs.slice(-40)));
    } catch {}
  }, [hydratedStorageKey, msgs, threadStorageKey]);

  const visibleMsgs = hydratedStorageKey === threadStorageKey ? msgs : [];

  // Read what's on screen (the page's H1) so the assistant knows the record.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const h1 = document.querySelector("main h1")?.textContent?.trim() || "";
    setSubject(h1.length > 0 && h1.length < 60 ? h1 : "");
  }, [pathname, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        inputRef.current?.focus();
      }, 60);
    }
  }, [open, msgs, busy]);

  // Send a queued prompt once the panel is open and idle.
  useEffect(() => {
    if (open && pending && !busy) {
      const p = pending;
      setPending(null);
      ask(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending, busy]);

  async function ask(q?: string) {
    const text = (q ?? input).trim();
    if (!text || busy || hydratedStorageKey !== threadStorageKey) return;
    const requestUserId = currentUser.id;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "me", text }]);
    // Grab what's actually on screen so the assistant answers from the record
    // the rep is looking at — fixes "I can't access that record" (Anir, Jul 8).
    let pageContext = "";
    try {
      const main = document.getElementById("main-content");
      pageContext = (main?.innerText || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 4500);
    } catch {}
    try {
      const res = await fetch("/api/agent/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, pageLabel: label, subject, path: pathname, pageContext }),
      });
      const data = await res.json();
      if (activeUserIdRef.current !== requestUserId) return;
      setMsgs((m) => [
        ...m,
        { role: "agent", text: data.answer || "I couldn't answer that just now." },
      ]);
    } catch {
      if (activeUserIdRef.current !== requestUserId) return;
      setMsgs((m) => [...m, { role: "agent", text: "I couldn't reach the agent just now." }]);
    } finally {
      if (activeUserIdRef.current === requestUserId) setBusy(false);
    }
  }

  if (hidden) return null;

  const suggestions = suggestionsFor(label);
  const greeting = subject
    ? `Hi ${firstName} — I'm looking at **${subject}** with you. Ask me anything about what's on screen, or pick a starting point below.`
    : `Hi ${firstName} — I'm on **${label}** with you. Ask me anything, or pick a starting point below.`;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-[60] w-[min(400px,calc(100vw-2.5rem))] flex flex-col rounded-2xl border border-border-light bg-white shadow-[0_24px_60px_-15px_rgba(0,0,0,0.28)] overflow-hidden slide-in-right">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-light bg-gradient-to-b from-white to-surface/40 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-blue-primary text-white flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,113,227,0.35)]">
              <Sparkles size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-text-primary leading-tight">Freyr AI</p>
              <p className="text-[11.5px] text-text-tertiary truncate leading-tight">
                {subject ? `Looking at ${subject}` : `On ${label}`}
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Messages — greeting is always the first bubble so it never vanishes */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 h-[400px] max-h-[58vh]"
          >
            <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface text-text-primary px-3.5 py-2.5 text-[13px] leading-relaxed">
              {renderRich(greeting, entities)}
            </div>
            {visibleMsgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "w-fit max-w-[85%] px-3.5 py-2 text-[13px] leading-relaxed",
                  m.role === "agent"
                    ? "rounded-2xl rounded-bl-md bg-surface text-text-primary"
                    : "rounded-2xl rounded-br-md bg-blue-primary text-white ml-auto"
                )}
              >
                {m.role === "agent" ? renderRich(m.text, entities) : m.text}
              </div>
            ))}
            {busy && (
              <div className="w-fit rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5">
                <Thinking />
              </div>
            )}
          </div>

          {/* Suggestions (only before the first exchange) + input */}
          <div className="px-3 pb-3 pt-2 border-t border-border-light shrink-0">
            {/* One row, scrolling sideways if tight — stacked rows of starters
                read as a form, not shortcuts (Anir: "why are the pre-recorded
                messages one in another row"). */}
            {visibleMsgs.length === 0 && (
              <div className="flex gap-1.5 mb-2.5 overflow-x-auto no-scrollbar">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="shrink-0 whitespace-nowrap text-[12px] text-text-secondary border border-border-light rounded-full px-2.5 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder={subject ? `Ask about ${subject}…` : "Ask your agent…"}
                className="flex-1 bg-surface rounded-xl px-3.5 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none border-none min-w-0"
              />
              <button
                onClick={() => ask()}
                disabled={!input.trim() || busy}
                aria-label="Send"
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0",
                  input.trim() && !busy
                    ? "bg-blue-primary text-white hover:bg-blue-hover"
                    : "bg-border-light text-text-tertiary"
                )}
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Close your agent" : "Open your agent"}
        className={cn(
          "fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full flex items-center justify-center text-white transition-all",
          "bg-blue-primary hover:bg-blue-hover shadow-[0_8px_24px_-6px_rgba(0,113,227,0.55)] hover:shadow-[0_12px_30px_-6px_rgba(0,113,227,0.65)] hover:-translate-y-0.5"
        )}
      >
        {open ? <X size={22} strokeWidth={2} /> : <MessageCircle size={24} strokeWidth={1.9} />}
      </button>
    </>
  );
}
