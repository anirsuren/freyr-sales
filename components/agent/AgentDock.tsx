"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowUp,
  X,
  MessageCircle,
  Menu,
  ArrowLeft,
  MessageSquareText,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { cn, POPOVER_SURFACE } from "@/lib/utils";
import { mergeConversationChanges } from "@/lib/conversationChanges";
import { putConversations } from "@/lib/saveConversations";
import { bucketByDay, clockTime, dayLabel, listStamp, sameDay } from "@/lib/chatTime";
import { useEntityIndex, type Entity } from "@/components/agent/EntityPills";
import { AgentResponseMarkdown } from "@/components/agent/AgentResponseMarkdown";
import { useTypewriter, trimStreamingLink } from "@/components/agent/useTypewriter";
import { requestAgentResponse } from "@/lib/agentStreamClient";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { firstNameForUser, userScopedStorageKey } from "@/lib/userIdentity";
import {
  ASK_AGENT_EVENT,
  type AgentOfferingContext,
  type AskAgentDetail,
} from "@/lib/agentEvents";
import { AGENT_DOCK_ACTIVE_KEY } from "@/lib/agentNavigationHandoff";

// The dock and the full Agent page deliberately use the SAME account-backed
// conversation model. A rep can start beside an offering, then continue that
// thread in /agent without losing the context or the messages.
const CONVERSATIONS_KEY = "freyr.agent.conversations";
const LEGACY_THREAD_KEY = "freyr.assistant.thread.v2";

type Msg = { role: "user" | "agent"; text: string; ts: number; entityContext?: string[] };
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
    // Before /analytics: a teammate's page lives under /analytics/reps/<slug>,
    // and the broader rule would otherwise claim it.
    [/^\/analytics\/reps\/[^/]+/, "a teammate"],
    [/^\/analytics/, "Analytics"],
    [/^\/tasks/, "Tasks"],
    [/^\/activity/, "Activity"],
    [/^\/agent/, "the Agent workspace"],
    // THE MODULES THAT SHIPPED AFTER THIS MAP WAS WRITTEN. Without them every
    // one of these pages fell through to "Freyr" and got the generic offerings
    // prompts, so standing on a teammate's page the assistant offered "What do
    // we offer for labelling?" (Anir, Aug 15: "the pre-made questions that it
    // asks have to be catered to whatever page I'm on").
    [/^\/team/, "the Team roster"],
    [/^\/components\/[^/]+/, "an FDL component"],
    [/^\/components/, "FDL Components"],
    [/^\/market-intel\/[^/]+/, "a tracked company"],
    [/^\/market-intel/, "Market Intel"],
    [/^\/performance/, "Goals"],
    [/^\/admin/, "Admin"],
    [/^\/notifications/, "Notifications"],
    [/^\/settings/, "Settings"],
  ];
  for (const [re, label] of map) if (re.test(p)) return label;
  return "Freyr";
}

function suggestionsFor(label: string, offeringsOnly = false): string[] {
  // Real mode is the offerings repository plus the assistant, so the prompts
  // have to be about what a rep can actually do there: understand an offering,
  // find the right collateral, work out who it suits.
  // PER PAGE, NOT PER RELEASE. The offerings-only build used to answer this
  // question once for the whole app, so every page that was not an offering
  // got the same three offerings prompts (Anir, Aug 15).
  const perPage: [string, string[]][] = [
    ["an offering", [
      "Explain this offering in plain English",
      "What materials do we have for it?",
      "Which customers is it a fit for?",
    ]],
    ["a teammate", [
      "What is this person working on?",
      "Which offerings do they own?",
      "How do I reach them?",
    ]],
    ["the Team roster", [
      "Who owns which offerings?",
      "Who joined most recently?",
      "Who should I ask about labelling?",
    ]],
    ["an FDL component", [
      "What is in the current version?",
      "What changed since the last release?",
      "Which offerings use this component?",
    ]],
    ["FDL Components", [
      "What is releasing this quarter?",
      "Which components have no current version?",
      "What shipped most recently?",
    ]],
    ["a tracked company", [
      "What has this company been doing lately?",
      "What should I bring to a first call?",
      "Who are their competitors?",
    ]],
    ["Market Intel", [
      "What moved this week?",
      "Which competitors are most active?",
      "Any acquisitions worth knowing about?",
    ]],
    ["Goals", [
      "How is the org tracking against target?",
      "Who is lagging the calendar?",
      "What still needs verifying?",
    ]],
    ["Admin", [
      "Who has admin access?",
      "Which groups exist and who owns them?",
      "Who has no group yet?",
    ]],
  ];
  const match = perPage.find(([l]) => l === label);
  if (match) return match[1];
  if (offeringsOnly)
    return [
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
  entityContext,
}: {
  text: string;
  active: boolean;
  entities: Entity[];
  linksOn: boolean;
  entityContext?: string[];
}) {
  const shown = useTypewriter(text, active);
  return <AgentResponseMarkdown text={trimStreamingLink(shown)} entities={entities} linkable={linksOn} entityContext={entityContext} />;
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
    AGENT_DOCK_ACTIVE_KEY,
    currentUser.id
  );
  const label = pageLabel(pathname);
  const [subject, setSubject] = useState("");
  const [typingTs, setTypingTs] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingOffering, setPendingOffering] =
    useState<AgentOfferingContext | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingPreview, setStreamingPreview] = useState("");
  const [connectionErrorId, setConnectionErrorId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Customers, contacts, offerings, FDL components, teammates and reports.
  const entities = useEntityIndex();
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [historySyncFailed, setHistorySyncFailed] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const followBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUserIdRef = useRef(currentUser.id);
  const historyBaseRef = useRef<Convo[] | null>(null);
  const historySaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const requestControllerRef = useRef<AbortController | null>(null);
  const explicitContextRef = useRef(false);


  // Anything in the app can open THIS chat instead of navigating away. An
  // offering CTA supplies explicit context but does not auto-send a prompt, so
  // opening the assistant never spends credits before the rep asks something.
  useEffect(() => {
    function onAsk(e: Event) {
      const detail =
        (e as CustomEvent<AskAgentDetail>).detail ?? ({} as AskAgentDetail);
      if (detail.open !== false) onOpenChange(true);
      setHistoryOpen(false);
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
    historyBaseRef.current = null;
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
    setHistoryOpen(false);

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
        historyBaseRef.current = accountHistory;
        setConvos((current) => {
          let cachedBase: Convo[] | null = null;
          try {
            const value = JSON.parse(localStorage.getItem(`${conversationStorageKey}:base`) || "null");
            if (Array.isArray(value)) cachedBase = value;
          } catch {}
          // Unversioned caches cannot distinguish a deleted chat from a draft.
          // Retain a recovery copy, but never upload stale history over an
          // initialized account. New messages submitted during loading survive.
          if (!cachedBase && data.initialized && browserHistory.length) {
            localStorage.setItem(`${conversationStorageKey}:recovery`, JSON.stringify(browserHistory));
          }
          const merged = mergeConversationChanges(
            cachedBase ?? (data.initialized ? browserHistory : []),
            current,
            accountHistory
          );
          if (!merged) {
            historyBaseRef.current = null;
            return current;
          }
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
    const savingUserId = currentUser.id;
    try {
      localStorage.setItem(conversationStorageKey, JSON.stringify(snapshot));
    } catch {}
    historySaveChainRef.current = historySaveChainRef.current
      .catch(() => {})
      .then(async () => {
        // Had the same 64KB keepalive bug as the chat page, with the error
        // swallowed below so it failed silently. Shared helper now.
        if (activeUserIdRef.current !== savingUserId) return;
        if (!historyBaseRef.current) throw new Error("History must load before saving.");
        await putConversations(snapshot, historyBaseRef.current);
        if (activeUserIdRef.current !== savingUserId) return;
        historyBaseRef.current = snapshot;
        localStorage.setItem(`${conversationStorageKey}:base`, JSON.stringify(snapshot));
      })
      .then(() => setHistorySyncFailed(false))
      .catch(() => setHistorySyncFailed(true));
  }, [
    currentUser.id,
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
  /** Which page the previous question was asked from. */
  const lastAskedPath = useRef<string | null>(null);
  const focusedSubject =
    offeringContext?.material?.label || offeringContext?.name || subject;

  /**
   * WHAT THE ASSISTANT THINKS YOU ARE LOOKING AT.
   *
   * This read the page's H1 and re-ran only when the PATH changed. A dialog
   * changes neither: open a tracked person on Takeda's briefing and the dock
   * still said "Looking at Takeda" and answered about Takeda, while a named
   * human filled the screen (Anir, Aug 14: "it thinks I'm looking at Takeda.
   * It doesn't know I'm looking at this specific person"). That was true of
   * every modal in the app, not just this one — material viewers, goal
   * editors, offering dialogs.
   *
   * So the subject is now whatever is actually on top: the last open
   * [role="dialog"], falling back to the page. And it is recomputed on DOM
   * changes rather than on navigation alone, because opening a dialog is not
   * a navigation. `subject` feeds the request body, not just this label, so
   * this is what the model is told, not only what the header shows.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;

    const readSubject = () => {
      // Dialogs stack; the last one in the DOM is the one in front. The dock
      // itself is a plain div, never role="dialog", so it cannot match here.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const top = dialogs[dialogs.length - 1];
      if (top) {
        const label =
          top.querySelector("h2")?.textContent?.trim() ||
          top.getAttribute("aria-label")?.trim() ||
          "";
        // A dialog with no name of its own tells us nothing; fall through to
        // the page rather than blanking the subject.
        if (label) return label.length < 60 ? label : "";
      }
      // First text node only: briefing H1s carry chips (momentum, follower
      // counts) whose text would otherwise glue onto the name.
      const h1El = document.querySelector("main h1");
      const h1 =
        h1El?.childNodes?.[0]?.textContent?.trim() ||
        h1El?.textContent?.trim() ||
        "";
      // Trim trailing punctuation: the Admin H1 reads "Admin —", which made
      // the header say "Looking at Admin —" as though it were cut off.
      const cleaned = h1.replace(/[\s—–-]+$/, "").trim();
      return cleaned.length > 0 && cleaned.length < 60 ? cleaned : "";
    };

    setSubject(readSubject());

    // Throttled: this watches the whole body, and every keystroke in a busy
    // table would otherwise re-query the DOM. A quarter second is far below
    // the time it takes to open something and start typing a question.
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.setTimeout(() => {
        queued = false;
        setSubject(readSubject());
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, open]);

  // A long reply grows again when the entity index arrives and plain names
  // become pills. Keep the last exchange visible through that reflow and while
  // streaming, but let the rep scroll up to read earlier messages.
  useLayoutEffect(() => {
    if (!open || historyOpen) return;
    followBottomRef.current = true;
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [open, historyOpen, activeId, visibleMsgs.length, busy]);

  useEffect(() => {
    if (!open || historyOpen) return;
    inputRef.current?.focus();
  }, [open, historyOpen]);

  useEffect(() => {
    if (!open || historyOpen || !messageContentRef.current) return;
    const observer = new ResizeObserver(() => {
      const scroller = scrollRef.current;
      if (scroller && followBottomRef.current)
        scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(messageContentRef.current);
    return () => observer.disconnect();
  }, [open, historyOpen]);

  function startNewChat() {
    setActiveId(null);
    setPendingOffering(null);
    setPending(null);
    setTypingTs(null);
    setInput("");
    setHistoryOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openConversation(id: string) {
    setActiveId(id);
    setPendingOffering(null);
    setPending(null);
    setTypingTs(null);
    setInput("");
    setHistoryOpen(false);
  }

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
    setConnectionErrorId(null);
    setBusy(true);
    setStreamingPreview("");
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        if (document.hidden) { arm(); return; }
        controller.abort();
      }, 90000);
    };
    arm();
    const pathChanged = lastAskedPath.current !== null && lastAskedPath.current !== pathname;
    lastAskedPath.current = pathname;
    try {
      const requestBody = {
          message: text,
          stream: true,
          history: prior,
          excludeSources: active?.excludedSources ?? [],
          offeringId: requestOffering?.id,
          materialId: requestOffering?.material?.id,
          // What page they're on and what it says, so the answer can be
          // about the screen in front of them.
          path: pathname,
          subject: focusedSubject,
          /**
           * NAVIGATION INVALIDATES THE LAST ANSWER'S GROUNDING (bug, Aug 16).
           * The dock keeps one thread across pages and sends fresh PAGE
           * CONTENT every time — but the history from the previous page was
           * winning. Asked "what is this page for" on FDL Components right
           * after a question about the sales floor, it answered about reps
           * and pipeline, then corrected itself unprompted a paragraph later.
           * Saying the page moved is enough for the model to drop the stale
           * context instead of blending it.
           */
          pathChanged,
          pageContext: (document.querySelector("main")?.textContent || "")
            .replace(/\s+/g, " ")
            .slice(0, 5000),
          // TEXT ALONE THROWS THE LINKS AWAY (Anir, Aug 15: "you're clearly
          // not feeding in all the data points"). textContent flattens every
          // anchor to its label, so asked for the article link the agent
          // answered, correctly, that it could only see "Read the article"
          // buttons. The destinations travel alongside the text now.
          pageLinks: (() => {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const a of Array.from(
              document.querySelectorAll<HTMLAnchorElement>("main a[href^='http']")
            )) {
              const href = a.href;
              if (seen.has(href)) continue;
              seen.add(href);
              const label = (a.textContent || "").replace(/\s+/g, " ").trim();
              out.push(label ? `${label.slice(0, 80)}. ${href}` : href);
              if (out.length >= 30) break;
            }
            return out;
          })(),
      };
      let receivedProgress = false;
      const data = await requestAgentResponse(requestBody, controller.signal, (answerSoFar) => {
        receivedProgress = true;
        if (activeUserIdRef.current === requestUserId) setStreamingPreview(answerSoFar);
      });
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
                  { role: "agent" as const, text: reply, ts: replyTs,
                    entityContext: Array.isArray(data.entityContext)
                      ? data.entityContext.filter((value): value is string => typeof value === "string")
                      : [] },
                ],
                updated: replyTs,
              }
            : conversation
        )
      );
      setTypingTs(receivedProgress ? null : replyTs);
    } catch {
      if (activeUserIdRef.current !== requestUserId) return;
      setConnectionErrorId(conversationId);
    } finally {
      if (timer) clearTimeout(timer);
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (activeUserIdRef.current === requestUserId) setBusy(false);
      setStreamingPreview("");
    }
  }

  const floatPanelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Sticky form actions share the launcher's corner. Measure the real rendered
   * rectangles instead of reserving a permanent empty gutter: the action bar
   * only moves its controls left at the exact point the launcher reaches it.
   * One coordinator here keeps every form in sync with the single floating
   * control, including bars mounted later by dialogs or route changes.
   */
  useEffect(() => {
    const selector = "[data-agent-dock-clearance]";
    const clearCollisions = () => {
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        element.removeAttribute("data-agent-dock-collision");
      });
    };

    if (hidden || embedded) {
      clearCollisions();
      return;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const launcher = launcherRef.current;
      const actionBars = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
      );
      if (!launcher) {
        actionBars.forEach((element) =>
          element.removeAttribute("data-agent-dock-collision")
        );
        return;
      }

      const launcherRect = launcher.getBoundingClientRect();
      actionBars.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const overlaps =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > launcherRect.left &&
          rect.left < launcherRect.right &&
          rect.bottom > launcherRect.top &&
          rect.top < launcherRect.bottom;
        element.toggleAttribute("data-agent-dock-collision", overlaps);
      });
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    if (launcherRef.current) resizeObserver.observe(launcherRef.current);
    document.querySelectorAll<HTMLElement>(selector).forEach((element) =>
      resizeObserver.observe(element)
    );
    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      clearCollisions();
    };
  }, [embedded, hidden, pathname]);

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
              : `fixed bottom-5 right-5 z-[120] w-[min(480px,calc(100vw-2.5rem))] rounded-2xl slide-in-right print:hidden ${POPOVER_SURFACE}`
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
                {historyOpen ? "Past chats" : offeringContext?.material
                  ? `Focused on ${offeringContext.material.label}`
                  : offeringContext
                    ? `Focused on ${offeringContext.name}`
                  : subject
                    ? `Looking at ${subject}`
                    : `On ${label}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen((previous) => !previous)}
              aria-label={historyOpen ? "Back to chat" : "Show past chats"}
              aria-expanded={historyOpen}
              title={historyOpen ? "Back to chat" : "Past chats"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                historyOpen ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface hover:text-blue-primary"
              )}
            >
              {historyOpen ? <ArrowLeft size={18} strokeWidth={1.9} /> : <Menu size={18} strokeWidth={1.9} />}
            </button>
            {!embedded && (
              <Link
                href={activeId ? `/agent?conversation=${encodeURIComponent(activeId)}` : "/agent"}
                onClick={busy ? (event) => event.preventDefault() : undefined}
                aria-label={busy ? "Wait for the answer before opening full chat" : "Open this conversation in the full Agent chat"}
                aria-disabled={busy}
                title={busy ? "Finishing this answer" : "Open full chat"}
                className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 text-[11.5px] font-semibold transition-colors", busy ? "cursor-wait text-text-tertiary" : "text-blue-primary hover:border-blue-subtle hover:bg-blue-light")}
              >
                <MessageCircle size={14} strokeWidth={2} />
                <span>{busy ? "Finishing reply…" : "Open full chat"}</span>
              </Link>
            )}
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
          {historySyncFailed && <p role="status" className="mx-4 mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-text-primary">Your changes are saved on this device. Account history could not sync; another tab may have changed this chat.</p>}

          {historyOpen ? (
            <div className={cn("agent-dock-history-enter min-h-0 flex-1 overflow-y-auto px-3 py-3", embedded ? "" : "h-[520px] max-h-[72vh]")}>
              <button
                type="button"
                onClick={startNewChat}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-primary px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
              >
                New chat
              </button>
              {visibleConvos.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-text-tertiary">No past chats yet. Start a new chat here.</p>
              ) : (
                bucketByDay(visibleConvos, (conversation) => conversation.updated || 0).map((group) => (
                  <div key={group.label} className="mb-4">
                    <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{group.label}</p>
                    <ul className="space-y-1">
                      {group.items.map((conversation) => (
                        <li key={conversation.id}>
                          <button
                            type="button"
                            onClick={() => openConversation(conversation.id)}
                            aria-current={conversation.id === activeId ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                              conversation.id === activeId
                                ? "bg-blue-light text-blue-primary"
                                : "text-text-secondary hover:bg-surface hover:text-text-primary"
                            )}
                          >
                            <MessageSquareText size={16} strokeWidth={1.8} className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{conversation.title || "New chat"}</span>
                            <span className="shrink-0 text-[11px] font-normal text-text-tertiary">{conversation.updated ? listStamp(conversation.updated) : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : (
          <div className="agent-dock-chat-enter flex min-h-0 flex-1 flex-col">

          {/* Messages: greeting is always the first bubble so it never vanishes */}
          <div
            ref={scrollRef}
            onScroll={(event) => {
              const scroller = event.currentTarget;
              followBottomRef.current =
                scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
            }}
            className={cn(
              "flex-1 overflow-y-auto px-4 py-4",
              embedded ? "min-h-0" : "h-[460px] max-h-[66vh]"
            )}
          >
            <div ref={messageContentRef} className="space-y-2.5">
            <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[13px] leading-[1.55] text-text-primary">
              <AgentResponseMarkdown text={greeting} entities={entities} linkable={!offeringsOnly} />
            </div>
            {visibleMsgs.map((m, i) => {
              // Same dating as the full chat page: a divider when the thread
              // crosses a day, and the time under every bubble. A dock thread
              // survives across days, so "when was this said" matters here too.
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const newDay = !prev || !sameDay(prev.ts, m.ts);
              return (
                /* Matches the container's own space-y-2.5 so a wrapped pair
                   sits exactly like the unwrapped bubbles used to. Not
                   `display: contents`: that generates no box, so the parent's
                   space-y margins would land on nothing and the bubbles would
                   collide. */
                <div key={`${m.ts}-${i}`} className="space-y-2.5">
                  {newDay && (
                    <div className="flex items-center gap-2 pt-0.5" aria-hidden>
                      <span className="h-px flex-1 bg-border-light" />
                      <span className="text-[10px] font-medium text-text-tertiary whitespace-nowrap">
                        {dayLabel(m.ts)}
                      </span>
                      <span className="h-px flex-1 bg-border-light" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex flex-col",
                      m.role === "agent" ? "items-start" : "items-end"
                    )}
                  >
                    <div
                      className={cn(
                        "w-fit max-w-[92%] px-3.5 py-2.5 text-[13px] leading-[1.55]",
                        m.role === "agent"
                          ? "agent-dock-reply rounded-2xl rounded-bl-md bg-surface text-text-primary"
                          : "rounded-2xl rounded-br-md bg-blue-primary text-white"
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
                          entityContext={m.entityContext}
                        />
                      ) : (
                        m.text
                      )}
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] tabular-nums text-text-tertiary">
                      {clockTime(m.ts)}
                    </span>
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="agent-dock-reply w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[13px] leading-[1.55]">
                {streamingPreview
                  ? <AgentResponseMarkdown text={trimStreamingLink(streamingPreview)} entities={entities} linkable={!offeringsOnly} />
                  : <Thinking />}
              </div>
            )}
            {connectionErrorId === activeId && !busy && (
              <p role="alert" className="rounded-xl border border-border-light bg-surface px-3.5 py-2 text-xs text-text-secondary">
                The connection stopped before the answer finished. Your question is saved; ask again to retry.
              </p>
            )}
            </div>
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
                /* The box you type in has to look like a box (Anir, Aug 15:
                   "the text box in the AI chatbot is a little bit hard to
                   see"). It was a barely-there grey fill with border-none on
                   a white card, so there was no edge at all. Same border and
                   focus ring every other input in the app uses. */
                className="min-w-0 flex-1 rounded-xl border border-border-light bg-white px-3.5 py-2.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
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
        </div>
      )}

      {/* Bubble */}
      {!open && (
        <button
          ref={launcherRef}
          data-agent-dock-launcher
          onClick={() => onOpenChange(!open)}
          aria-label={open ? "Close your agent" : "Open your agent"}
          className={cn(
            "w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white transition-all",
            // NOT ON THE PAPER (found Aug 16, printing the Performance page).
            // Performance offers "Print / Save as PDF — this page, as it
            // stands", and the print stylesheet only hides <header> and
            // <aside>. The dock is neither, so a blue chat bubble was landing
            // in the corner of every board PDF. The toolbars on the report
            // page and the agent review page already use print:hidden; the
            // floating dock simply never got it.
            embedded
              ? "mx-auto mb-5 mt-auto"
              : "fixed bottom-5 right-5 z-[120] print:hidden",
            "bg-blue-primary hover:bg-blue-hover shadow-[0_8px_24px_-6px_rgba(0,113,227,0.55)] hover:shadow-[0_12px_30px_-6px_rgba(0,113,227,0.65)] hover:-translate-y-0.5"
          )}
        >
          {open ? <X size={22} strokeWidth={2} /> : <MessageCircle size={24} strokeWidth={1.9} />}
        </button>
      )}
    </div>
  );
}
