"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowUp,
  X,
  MessageCircle,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { cn, POPOVER_SURFACE } from "@/lib/utils";
import { useTypewriter, trimStreamingLink } from "@/components/agent/useTypewriter";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { firstNameForUser, userScopedStorageKey } from "@/lib/userIdentity";
import {
  ASK_AGENT_EVENT,
  type AgentOfferingContext,
  type AskAgentDetail,
} from "@/lib/agentEvents";

type Entity = { name: string; id: string; kind: "company" | "contact" };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Turn a plain-text string into nodes where any known company/person name
// becomes an inline entity pill (logo/headshot + link). Matched longest-first so
// "Cortexa Biopharma" wins over "Cortexa". Case-insensitive, word-bounded.
function injectEntities(
  text: string,
  entities: Entity[],
  keyBase: string,
  /** In the offerings-only release there are no customer or contact pages, so
   *  a pill would be a link to a 404. The name still reads normally. */
  linkable = true
): ReactNode[] {
  if (!entities.length || !text || !linkable) return [text];
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

// The dock and the full Agent page deliberately use the SAME account-backed
// conversation model. A rep can start beside an offering, then continue that
// thread in /agent without losing the context or the messages.
const CONVERSATIONS_KEY = "freyr.agent.conversations";
const LEGACY_THREAD_KEY = "freyr.assistant.thread.v2";
const ACTIVE_DOCK_KEY = "freyr.agent.dock.active.v1";

type Msg = { role: "user" | "agent"; text: string; ts: number };
type Convo = {
  id: string;
  title: string;
  messages: Msg[];
  updated: number;
  excludedSources?: string[];
  offeringContext?: AgentOfferingContext;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function smartTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 52 ? `${compact.slice(0, 49)}…` : compact;
}

function loadConversations(key: string): Convo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as Convo[]) : [];
  } catch {
    return [];
  }
}

/** A conversation is only worth RESUMING the day it was last touched (Anir,
 *  Aug 10: "you can't have a chat from months ago. If it's the next day, when
 *  I click that button, it should automatically just create a new chat").
 *  Yesterday's thread stays in the history list — it just never ambushes the
 *  rep as the already-open chat, which is how a heat-map answer from another
 *  day was greeting him on Customers. */
function touchedToday(convo: Convo | undefined | null): boolean {
  if (!convo) return false;
  const last =
    convo.updated || convo.messages[convo.messages.length - 1]?.ts || 0;
  if (!last) return false;
  const then = new Date(last);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

function mergeConversations(...lists: Convo[][]): Convo[] {
  const byId = new Map<string, Convo>();
  for (const list of lists) {
    for (const convo of list) {
      if (!convo?.id || !Array.isArray(convo.messages)) continue;
      const existing = byId.get(convo.id);
      if (!existing || (convo.updated || 0) >= (existing.updated || 0)) {
        byId.set(convo.id, convo);
      }
    }
  }
  return [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

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

function suggestionsFor(label: string, offeringsOnly = false): string[] {
  // Real mode is the offerings repository plus the assistant, so the prompts
  // have to be about what a rep can actually do there: understand an offering,
  // find the right collateral, work out who it suits.
  if (offeringsOnly)
    return label === "an offering"
      ? [
          "Explain this offering in plain English",
          "What materials do we have for it?",
          "Which customers is it a fit for?",
        ]
      : [
          "What do we offer for labelling?",
          "Which offerings are available today?",
          "Who owns Freya.Register?",
        ];
  if (label.includes("customer") || label.includes("contact"))
    return ["Summarize this account", "Draft an intro email", "What's the next best action?"];
  if (label.includes("Pipeline") || label.includes("Forecast"))
    return ["Which deals are cooling?", "What should I prioritize?", "How's my quarter tracking?"];
  if (label.includes("session"))
    return ["Tighten this pitch", "Draft a follow-up", "What objections should I expect?"];
  if (label.includes("Campaign"))
    return ["Who should I add?", "Draft a subject line", "How's this campaign doing?"];
  return ["What should I work on next?", "Summarize my pipeline", "Which deals have no recent activity?"];
}

// Minimal, safe markdown: **bold**, `code`, and line breaks. Content is our own
// agent's reply, but we still build React nodes (no dangerouslySetInnerHTML).
function renderRich(
  text: string,
  entities: Entity[] = [],
  linkable = true
): ReactNode {
  return text.split("\n").map((line, li) => {
    const nodes: ReactNode[] = [];
    // **bold**, *italic*, `code` — match bold before italic so ** wins over *.
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    const plain = (s: string, kb: string) =>
      nodes.push(...injectEntities(s, entities, kb, linkable));
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
// words"): blue equalizer bars + an italic word that changes every ~1.6s.
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

/**
 * One agent reply, revealed like the full agent page reveals its own.
 * A component rather than an inline hook call because hooks cannot run inside
 * .map(), and each reply needs its own reveal state.
 */
function TypedReply({
  text,
  active,
  entities,
  linksOn,
}: {
  text: string;
  active: boolean;
  entities: Parameters<typeof renderRich>[1];
  linksOn: boolean;
}) {
  const shown = useTypewriter(text, active);
  return <>{renderRich(trimStreamingLink(shown), entities, linksOn)}</>;
}

export function AgentDock({
  open,
  onOpenChange,
  hidden,
  pathname,
  offeringsOnly = false,
  embedded = false,
  dockable = false,
  docked = false,
  onDockChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hidden: boolean;
  onHide: () => void;
  pathname: string;
  /** The offerings-only release: keep answers inside pages that exist. */
  offeringsOnly?: boolean;
  /** Reserve a real side rail instead of floating over the page. */
  embedded?: boolean;
  /** Material pages may switch between the normal popup and a right dock. */
  dockable?: boolean;
  docked?: boolean;
  onDockChange?: (docked: boolean) => void;
}) {
  const currentUser = useCurrentUser();
  const firstName = firstNameForUser(currentUser);
  const conversationStorageKey = userScopedStorageKey(
    CONVERSATIONS_KEY,
    currentUser.id
  );
  const legacyThreadStorageKey = userScopedStorageKey(
    LEGACY_THREAD_KEY,
    currentUser.id
  );
  const activeDockStorageKey = userScopedStorageKey(
    ACTIVE_DOCK_KEY,
    currentUser.id
  );
  const label = pageLabel(pathname);
  const [subject, setSubject] = useState("");
  const [typingTs, setTypingTs] = useState<number | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingOffering, setPendingOffering] =
    useState<AgentOfferingContext | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUserIdRef = useRef(currentUser.id);
  const historySaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const requestControllerRef = useRef<AbortController | null>(null);
  const explicitContextRef = useRef(false);

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

  // Anything in the app can open THIS chat instead of navigating away. An
  // offering CTA supplies explicit context but does not auto-send a prompt, so
  // opening the assistant never spends credits before the rep asks something.
  useEffect(() => {
    function onAsk(e: Event) {
      const detail =
        (e as CustomEvent<AskAgentDetail>).detail ?? ({} as AskAgentDetail);
      if (detail.open !== false) onOpenChange(true);
      if (detail.offering) {
        explicitContextRef.current = true;
        setPendingOffering(detail.offering);
        if (detail.newConversation !== false) setActiveId(null);
        setTypingTs(null);
      }
      if (detail.prompt?.trim()) setPending(detail.prompt.trim());
    }
    window.addEventListener(ASK_AGENT_EVENT, onAsk as EventListener);
    return () =>
      window.removeEventListener(ASK_AGENT_EVENT, onAsk as EventListener);
  }, [onOpenChange]);

  // Hydrate the same account-backed conversation list used by /agent. The old
  // dock-only local thread is migrated once, so previous assistant messages do
  // not disappear after this upgrade.
  useEffect(() => {
    let cancelled = false;
    activeUserIdRef.current = currentUser.id;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    explicitContextRef.current = false;
    setHistoryReady(false);
    setHydratedStorageKey(null);
    setConvos([]);
    setActiveId(null);
    setPendingOffering(null);
    setInput("");
    setBusy(false);
    setPending(null);
    setTypingTs(null);

    const legacyConversationKeys = [
      CONVERSATIONS_KEY,
      currentUser.memberId
        ? userScopedStorageKey(CONVERSATIONS_KEY, currentUser.memberId)
        : null,
    ].filter(
      (key): key is string => Boolean(key && key !== conversationStorageKey)
    );

    let migratedDock: Convo[] = [];
    try {
      const legacy = JSON.parse(
        localStorage.getItem(legacyThreadStorageKey) || "[]"
      ) as Array<{ role?: string; text?: string }>;
      const messages: Msg[] = Array.isArray(legacy)
        ? legacy
            .filter(
              (message) =>
                (message.role === "me" || message.role === "agent") &&
                typeof message.text === "string" &&
                message.text.trim()
            )
            .map((message, index) => ({
              role: message.role === "me" ? "user" : "agent",
              text: message.text!.trim(),
              ts: Date.now() - legacy.length + index,
            }))
        : [];
      if (messages.length) {
        migratedDock = [
          {
            id: `legacy-dock-${currentUser.id}`,
            title:
              smartTitle(
                messages.find((message) => message.role === "user")?.text || ""
              ) || "Assistant chat",
            messages,
            updated: messages[messages.length - 1].ts,
          },
        ];
      }
    } catch {}

    const browserHistory = mergeConversations(
      loadConversations(conversationStorageKey),
      ...legacyConversationKeys.map(loadConversations),
      migratedDock
    );
    const savedActiveId = localStorage.getItem(activeDockStorageKey);
    const savedActive = browserHistory.find(
      (conversation) => conversation.id === savedActiveId
    );
    // Fresh-today or a fresh chat. Falling back to "most recent whatever its
    // age" is what used to resurrect stale threads.
    const initialActiveId = touchedToday(savedActive)
      ? savedActiveId
      : null;
    setConvos(browserHistory);
    setActiveId(initialActiveId);
    setHydratedStorageKey(conversationStorageKey);

    fetch("/api/agent/conversations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("history unavailable");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const accountHistory = Array.isArray(data?.conversations)
          ? (data.conversations as Convo[])
          : [];
        setConvos((current) => {
          const merged = mergeConversations(
            accountHistory,
            browserHistory,
            current
          );
          try {
            localStorage.setItem(
              conversationStorageKey,
              JSON.stringify(merged)
            );
          } catch {}
          if (!explicitContextRef.current) {
            setActiveId((currentId) =>
              merged.some((conversation) => conversation.id === currentId)
                ? currentId
                : null
            );
          }
          return merged;
        });
        for (const key of legacyConversationKeys) localStorage.removeItem(key);
        localStorage.removeItem(legacyThreadStorageKey);
        setHistoryReady(true);
      })
      .catch(() => {
        if (!cancelled) setHistoryReady(true);
      });

    return () => {
      cancelled = true;
      activeUserIdRef.current = "";
      requestControllerRef.current?.abort();
    };
  }, [
    activeDockStorageKey,
    conversationStorageKey,
    currentUser.id,
    currentUser.memberId,
    legacyThreadStorageKey,
  ]);

  // Every dock change is cached immediately and serialized to the verified
  // account, matching the full Agent page's persistence behavior.
  useEffect(() => {
    if (
      !historyReady ||
      hydratedStorageKey !== conversationStorageKey
    )
      return;
    const snapshot = convos;
    try {
      localStorage.setItem(conversationStorageKey, JSON.stringify(snapshot));
    } catch {}
    historySaveChainRef.current = historySaveChainRef.current
      .catch(() => {})
      .then(async () => {
        const response = await fetch("/api/agent/conversations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversations: snapshot }),
          keepalive: true,
        });
        if (!response.ok) throw new Error("history save failed");
      })
      .catch(() => {});
  }, [
    conversationStorageKey,
    convos,
    historyReady,
    hydratedStorageKey,
  ]);

  useEffect(() => {
    if (hydratedStorageKey !== conversationStorageKey) return;
    try {
      if (activeId) localStorage.setItem(activeDockStorageKey, activeId);
      else localStorage.removeItem(activeDockStorageKey);
    } catch {}
  }, [
    activeDockStorageKey,
    activeId,
    conversationStorageKey,
    hydratedStorageKey,
  ]);

  const visibleConvos =
    hydratedStorageKey === conversationStorageKey ? convos : [];
  const active =
    visibleConvos.find((conversation) => conversation.id === activeId) || null;
  const offeringContext = active?.offeringContext ?? pendingOffering;
  const visibleMsgs = active?.messages ?? [];
  const focusedSubject =
    offeringContext?.material?.label || offeringContext?.name || subject;

  // Read what's on screen (the page's H1) so the assistant knows the record.
  useEffect(() => {
    if (typeof document === "undefined") return;
    // First text node only: briefing H1s carry chips (momentum, follower
    // counts) whose text would otherwise glue onto the name.
    const h1El = document.querySelector("main h1");
    const h1 =
      h1El?.childNodes?.[0]?.textContent?.trim() ||
      h1El?.textContent?.trim() ||
      "";
    setSubject(h1.length > 0 && h1.length < 60 ? h1 : "");
  }, [pathname, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        inputRef.current?.focus();
      }, 60);
    }
  }, [open, visibleMsgs.length, busy]);

  // Send a queued prompt once the panel is open and idle.
  useEffect(() => {
    if (open && pending && !busy && historyReady) {
      const p = pending;
      setPending(null);
      ask(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending, busy, historyReady]);

  async function ask(q?: string) {
    const text = (q ?? input).trim();
    if (
      !text ||
      busy ||
      !historyReady ||
      hydratedStorageKey !== conversationStorageKey
    )
      return;
    const requestUserId = currentUser.id;
    const isNew = !active;
    const conversationId = active?.id ?? `c-${uid()}`;
    const requestOffering = active?.offeringContext ?? pendingOffering;
    const prior =
      active?.messages.map((message) => ({
        role: message.role,
        text: message.text,
      })) ?? [];
    const userTs = Date.now();
    setInput("");
    setBusy(true);
    setActiveId(conversationId);
    setConvos((previous) => {
      let next = isNew
        ? [
            {
              id: conversationId,
              title: smartTitle(text) || "New chat",
              messages: [],
              updated: userTs,
              ...(requestOffering
                ? { offeringContext: requestOffering }
                : {}),
            },
            ...previous,
          ]
        : previous;
      next = next.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: conversation.title || smartTitle(text) || "New chat",
              messages: [
                ...conversation.messages,
                { role: "user" as const, text, ts: userTs },
              ],
              updated: userTs,
            }
          : conversation
      );
      return next;
    });

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("/api/agent/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: prior,
          excludeSources: active?.excludedSources ?? [],
          offeringId: requestOffering?.id,
          materialId: requestOffering?.material?.id,
          // What page they're on and what it says, so the answer can be
          // about the screen in front of them.
          path: pathname,
          subject: focusedSubject,
          pageContext: (document.querySelector("main")?.textContent || "")
            .replace(/\s+/g, " ")
            .slice(0, 5000),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("assistant unreachable");
      const data = await res.json();
      if (activeUserIdRef.current !== requestUserId) return;
      const reply =
        typeof data.reply === "string" && data.reply.trim()
          ? data.reply
          : "I couldn't answer that just now.";
      const replyTs = Date.now();
      setConvos((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  { role: "agent" as const, text: reply, ts: replyTs },
                ],
                updated: replyTs,
              }
            : conversation
        )
      );
      setTypingTs(replyTs);
    } catch {
      if (activeUserIdRef.current !== requestUserId) return;
      const replyTs = Date.now();
      setConvos((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    role: "agent" as const,
                    text: "I couldn't reach the agent just now.",
                    ts: replyTs,
                  },
                ],
                updated: replyTs,
              }
            : conversation
        )
      );
      setTypingTs(replyTs);
    } finally {
      clearTimeout(timer);
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (activeUserIdRef.current === requestUserId) setBusy(false);
    }
  }

  /**
   * CLICK ANYWHERE ELSE AND THE ASSISTANT CLOSES (Anir, Aug 13: "when I click
   * out of the AI assistant, it should automatically close"). Floating bubble
   * only; the embedded side panel is a deliberate workspace and stays.
   */
  const floatPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || embedded) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (floatPanelRef.current?.contains(target)) return;
      if (target.closest?.("[data-agent-dock-launcher]")) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, embedded, onOpenChange]);

  if (hidden) return null;

  const suggestions = offeringContext?.material
    ? [
        `Summarize ${offeringContext.material.label}`,
        "How should I use this material with a customer?",
        "What are the most important points in this material?",
      ]
    : offeringContext
    ? [
        `Explain ${offeringContext.name} in plain English`,
        `What materials do we have for ${offeringContext.name}?`,
        `Who is ${offeringContext.name} best suited for?`,
      ]
    : suggestionsFor(label, offeringsOnly);
  const greeting = offeringContext?.material
    ? `Hi ${firstName}. Freyr AI is focused on **${offeringContext.material.label}** from **${offeringContext.name}**. Ask me anything about this material, or pick a starting point below.`
    : offeringContext
    ? `Hi ${firstName}. Freyr AI is focused on **${offeringContext.name}**. Ask me anything about this offering, or pick a starting point below.`
    : subject
      ? `Hi ${firstName}. I'm looking at **${subject}** with you. Ask me anything about what's on screen, or pick a starting point below.`
    : `Hi ${firstName}. I'm on **${label}** with you. Ask me anything, or pick a starting point below.`;

  return (
    <div className={embedded ? "flex h-full min-h-0 w-full flex-col bg-white" : "contents"}>
      {open && (
        <div
          ref={floatPanelRef}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-white",
            embedded
              ? "h-full w-full border-l border-border-light shadow-[-8px_0_30px_rgba(16,24,40,0.06)]"
              : `fixed bottom-24 right-5 z-[120] w-[min(400px,calc(100vw-2.5rem))] rounded-2xl slide-in-right ${POPOVER_SURFACE}`
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-light bg-gradient-to-b from-white to-surface/40 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-blue-primary text-white flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,113,227,0.35)]">
              <Sparkles size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-text-primary leading-tight">Freyr AI</p>
              <p className="text-[11.5px] text-text-tertiary truncate leading-tight">
                {offeringContext?.material
                  ? `Focused on ${offeringContext.material.label}`
                  : offeringContext
                    ? `Focused on ${offeringContext.name}`
                  : subject
                    ? `Looking at ${subject}`
                    : `On ${label}`}
              </p>
            </div>
            {dockable && onDockChange && (
              <button
                type="button"
                onClick={() => onDockChange(!docked)}
                aria-label={docked ? "Use AI as a popup" : "Dock AI on the right"}
                title={docked ? "Use as popup" : "Dock on right"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
              >
                {docked ? (
                  <PanelRightClose size={17} strokeWidth={1.9} />
                ) : (
                  <PanelRightOpen size={17} strokeWidth={1.9} />
                )}
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Messages: greeting is always the first bubble so it never vanishes */}
          <div
            ref={scrollRef}
            className={cn(
              "flex-1 overflow-y-auto px-4 py-4 space-y-2.5",
              embedded ? "min-h-0" : "h-[400px] max-h-[58vh]"
            )}
          >
            <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface text-text-primary px-3.5 py-2.5 text-[13px] leading-relaxed">
              {renderRich(greeting, entities, !offeringsOnly)}
            </div>
            {visibleMsgs.map((m, i) => (
              <div
                key={`${m.ts}-${i}`}
                className={cn(
                  "w-fit max-w-[85%] px-3.5 py-2 text-[13px] leading-relaxed",
                  m.role === "agent"
                    ? "rounded-2xl rounded-bl-md bg-surface text-text-primary"
                    : "rounded-2xl rounded-br-md bg-blue-primary text-white ml-auto"
                )}
              >
                {m.role === "agent" ? (
                  <TypedReply
                    text={m.text}
                    // Only the reply that just arrived types out. Restoring a
                    // saved thread must not replay the whole conversation.
                    active={m.ts === typingTs}
                    entities={entities}
                    linksOn={!offeringsOnly}
                  />
                ) : (
                  m.text
                )}
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
            {/* One row, scrolling sideways if tight, stacked rows of starters
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
                placeholder={
                  focusedSubject
                    ? `Ask about ${focusedSubject}…`
                    : "Ask your agent…"
                }
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
      {(!embedded || !open) && (
        <button
          data-agent-dock-launcher
          onClick={() => onOpenChange(!open)}
          aria-label={open ? "Close your agent" : "Open your agent"}
          className={cn(
            "w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white transition-all",
            embedded ? "mx-auto mb-5 mt-auto" : "fixed bottom-5 right-5 z-[120]",
            "bg-blue-primary hover:bg-blue-hover shadow-[0_8px_24px_-6px_rgba(0,113,227,0.55)] hover:shadow-[0_12px_30px_-6px_rgba(0,113,227,0.65)] hover:-translate-y-0.5"
          )}
        >
          {open ? <X size={22} strokeWidth={2} /> : <MessageCircle size={24} strokeWidth={1.9} />}
        </button>
      )}
    </div>
  );
}
