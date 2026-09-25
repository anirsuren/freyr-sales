"use client";
import { requestAgentResponse } from "@/lib/agentStreamClient";
import { useTypewriter, trimStreamingLink } from "./useTypewriter";
import { replaceAppBrowserUrl } from "@/lib/modeUrl";

import { useEffect, useRef, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import {
  KnowledgePanel,
  KnowledgeRailButton,
} from "@/components/agent/KnowledgePanel";
import {
  Plus,
  ArrowUp,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  MessageSquareText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bucketByDay,
  clockTime,
  dayAndTime,
  dayLabel,
  listStamp,
  sameDay,
} from "@/lib/chatTime";
import { mergeConversationChanges } from "@/lib/conversationChanges";
import { putConversations } from "@/lib/saveConversations";
import { useEntityIndex, type Entity } from "@/components/agent/EntityPills";
import { AgentResponseMarkdown } from "@/components/agent/AgentResponseMarkdown";
import { AGENT_NAME } from "@/lib/agentIdentity";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { firstNameForUser, userScopedStorageKey } from "@/lib/userIdentity";
import { queueAgentNavigationHandoff } from "@/lib/agentNavigationHandoff";

type Msg = { role: "user" | "agent"; text: string; ts: number; suggestions?: string[]; entityContext?: string[] };
type OfferingContext = { id: string; name: string };
type Convo = {
  id: string;
  title: string;
  messages: Msg[];
  updated: number;
  /**
   * Sources this CHAT has switched OFF, stored as exclusions so the default —
   * an empty list — means everything is on. Kept on the conversation, not in
   * component state, because "it depends per chat" is the whole point: one
   * thread narrowed to a single offering must stay narrowed when you come back
   * to it, and must not narrow the thread beside it (Anir, Jul 29).
   */
  excludedSources?: string[];
  /** Explicitly selected by clicking Ask Freyr AI on an offering page. */
  offeringContext?: OfferingContext;
};

const KEY = "freyr.agent.conversations";
const EMPTY_CONVOS: Convo[] = [];

// Real mode has no pipeline, so its prompts ask about the only things that
// exist here: the catalogue and the uploaded documents.
const OFFERINGS_STARTERS = [
  "What offerings do we have?",
  "Which offerings suit a small biotech?",
  "What does Freya.Register do?",
  "Which offerings are available in Japan?",
  "Write a short pitch for Freya.Submit",
];

const STARTERS = [
  "What should I focus on today?",
  // Offerings-first (Suren's north star): surface the offering repository high
  // in the agent's starters, not buried below the pipeline questions.
  "What offerings do we have?",
  "Which deals are cooling?",
  "What's my open pipeline worth?",
  // An action starter (not just a question) — shows the agent DOES work, not
  // only answers. Resolves to the real quietest account and drafts it.
  "Draft a re-engagement for a cooling account",
];

function offeringStarters(name: string): string[] {
  return [
    `Explain ${name} in plain English`,
    `Who is ${name} best suited for?`,
    `What sales materials do we have for ${name}?`,
    `Write a short pitch for ${name}`,
  ];
}

function load(storageKey: string): Convo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function save(storageKey: string, c: Convo[]) {
  try {
    // This used to silently discard everything after chat 50. Keep the full
    // local cache; the account-backed copy below is the durable source.
    localStorage.setItem(storageKey, JSON.stringify(c));
  } catch {}
}

function mergeConversations(...groups: Convo[][]): Convo[] {
  const byId = new Map<string, Convo>();
  for (const conversation of groups.flat()) {
    if (!conversation?.id || !Array.isArray(conversation.messages)) continue;
    const existing = byId.get(conversation.id);
    if (!existing || (conversation.updated || 0) >= (existing.updated || 0)) {
      byId.set(conversation.id, conversation);
    }
  }
  return [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
function uid() {
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// A thread's title is its first real message — but a bare greeting ("hi",
// "hey", "what's up") makes a useless label that then sticks forever, so the
// recent list reads "hi / hey / hi". Greetings return "" here (the list falls
// back to "New chat"); the title is then taken from the first message that
// actually says what the chat is about.
const GREETING_ONLY =
  /^(hi+|hey+|hello+|yo|sup|wass?up|what'?s? up|hiya|howdy|hey there|good (morning|afternoon|evening)|how('?s| is) (it going|things)|how are you|heybuddy)[\s!.,?]*$/i;

function smartTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || GREETING_ONLY.test(t)) return "";
  const cleaned = t.charAt(0).toUpperCase() + t.slice(1);
  return cleaned.length > 48 ? cleaned.slice(0, 47).trimEnd() + "…" : cleaned;
}

function TypedAgentReply({ text, active, entities, entityContext, onReveal }: {
  text: string;
  active: boolean;
  entities: Entity[];
  entityContext?: string[];
  onReveal: () => void;
}) {
  const shown = useTypewriter(text, active);
  useEffect(() => {
    if (active) onReveal();
  }, [shown, active, onReveal]);
  return <AgentResponseMarkdown text={trimStreamingLink(shown)} entities={entities} entityContext={entityContext} />;
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

export function AgentChat({
  initialAsk,
  initialConversation,
  initialOffering,
  offeringsOnly = false,
}: {
  initialAsk?: string;
  initialConversation?: string;
  initialOffering?: OfferingContext;
  offeringsOnly?: boolean;
} = {}) {
  const currentUser = useCurrentUser();
  // Names of customers, contacts, offerings, components, teammates and
  // reports, so the assistant's answers render them as pills, not grey text.
  const entities = useEntityIndex();
  const firstName = firstNameForUser(currentUser);
  const storageKey = userScopedStorageKey(KEY, currentUser.id);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typingReply, setTypingReply] = useState<{ conversationId: string; ts: number } | null>(null);
  const [streamingPreview, setStreamingPreview] = useState<{ conversationId: string; text: string } | null>(null);
  const [connectionErrorId, setConnectionErrorId] = useState<string | null>(null);
  // History opens immediately; only a reply received in this open chat types.
  const activeConversationRef = useRef(activeId);
  activeConversationRef.current = activeId;
  useEffect(() => setTypingReply(null), [activeId, currentUser.id]);
  /**
   * WHICH conversation is waiting, not merely THAT one is.
   *
   * This was a bare boolean, so the three dots were painted on whatever chat
   * happened to be open. Click into an old thread while a reply is in flight
   * and that finished conversation appears to be typing at you forever (Anir,
   * Jul 29: "when i click on an old chat says its typing"). The id makes the
   * indicator belong to the thread that actually asked.
   */
  const [sendingId, setSendingId] = useState<string | null>(null);
  // One request at a time: the composer and the send guard still care only
  // whether anything is in flight.
  const sending = sendingId !== null;
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [pendingOffering, setPendingOffering] = useState<OfferingContext | null>(
    initialOffering ?? null
  );

  const [summary, setSummary] = useState<{
    needsApproval: number;
    cooling: number;
    atRisk: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activeUserIdRef = useRef(currentUser.id);
  const historyBaseRef = useRef<Convo[] | null>(null);
  const historySaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [historyReadyForSync, setHistoryReadyForSync] = useState(false);
  const [historySyncFailed, setHistorySyncFailed] = useState(false);
  // Keep the mount-time hand-off stable when we remove its query parameters
  // from the URL. Next can refresh the page props after replaceState; that
  // must not wipe the conversation we just created.
  const initialOfferingRef = useRef(initialOffering);

  useEffect(() => {
    let cancelled = false;
    activeUserIdRef.current = currentUser.id;
    historyBaseRef.current = null;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setHistoryReadyForSync(false);
    setHistorySyncFailed(false);
    setLoadedStorageKey(null);
    // Recover the original unscoped key and any earlier stable member-id key.
    // Identity hardening introduced the current key without migrating KEY,
    // which is why established users suddenly saw only their newest chats.
    const legacyKeys = [
      KEY,
      currentUser.memberId
        ? userScopedStorageKey(KEY, currentUser.memberId)
        : null,
    ].filter((key): key is string => Boolean(key && key !== storageKey));
    const browserHistory = mergeConversations(
      load(storageKey),
      ...legacyKeys.map(load)
    );
    setConvos(browserHistory);
    setLoadedStorageKey(storageKey);
    setActiveId(null);
    setInput("");
    setSendingId(null);
    setPendingOffering(initialOfferingRef.current ?? null);
    setSummary(null);

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
        // A contextual hand-off can submit while this GET is in flight. Merge
        // with the CURRENT list, not only the startup snapshot, or the GET can
        // erase the brand-new message a split second after it appears.
        setConvos((current) => {
          let cachedBase: Convo[] | null = null;
          try {
            const value = JSON.parse(localStorage.getItem(`${storageKey}:base`) || "null");
            if (Array.isArray(value)) cachedBase = value;
          } catch {}
          // Unversioned caches cannot distinguish a deleted chat from a draft.
          // Retain a recovery copy, but never upload stale history over an
          // initialized account. New messages submitted during loading survive.
          if (!cachedBase && data.initialized && browserHistory.length) {
            localStorage.setItem(`${storageKey}:recovery`, JSON.stringify(browserHistory));
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
          save(storageKey, merged);
          return merged;
        });
        // The data has been copied into the user-scoped cache and will now be
        // uploaded to the account. Removing the bare key prevents it from
        // resurrecting a chat the user later deletes.
        for (const key of legacyKeys) localStorage.removeItem(key);
        setHistoryReadyForSync(true);
      })
      .catch(() => {
        // Offline/local fallback still keeps the recovered browser history.
        if (!cancelled) {
          setHistorySyncFailed(true);
          setHistoryReadyForSync(true);
        }
      });
    return () => {
      cancelled = true;
      activeUserIdRef.current = "";
      requestControllerRef.current?.abort();
    };
  }, [currentUser.id, currentUser.memberId, storageKey, offeringsOnly]);

  // Mirror every main-Agent history change to the verified member's account.
  // localStorage remains an instant/offline cache, never the only copy.
  useEffect(() => {
    if (!historyReadyForSync || loadedStorageKey !== storageKey) return;
    const snapshot = convos;
    const savingUserId = currentUser.id;
    // Serialize writes so a slower older request can never finish after a
    // newer one and resurrect a deleted chat or drop the latest reply.
    historySaveChainRef.current = historySaveChainRef.current
      .catch(() => {})
      .then(async () => {
        // Size-aware keepalive lives in one place; see lib/saveConversations.
        if (activeUserIdRef.current !== savingUserId) return;
        if (!historyBaseRef.current) throw new Error("History must load before saving.");
        await putConversations(snapshot, historyBaseRef.current);
        if (activeUserIdRef.current !== savingUserId) return;
        historyBaseRef.current = snapshot;
        localStorage.setItem(`${storageKey}:base`, JSON.stringify(snapshot));
      })
      .then(() => setHistorySyncFailed(false))
      .catch(() => setHistorySyncFailed(true));
  }, [convos, historyReadyForSync, loadedStorageKey, storageKey, currentUser.id]);

  // Proactive greeting: what's on the rep's plate (deterministic, no LLM call).
  // Not fetched at all in real mode: nothing would be rendered from it, and a
  // request whose only possible effect is a late layout shift is worse than no
  // request.
  useEffect(() => {
    if (offeringsOnly) return;
    let cancelled = false;
    fetch("/api/agent/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok) setSummary(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser.id, offeringsOnly]);

  const visibleConvos =
    loadedStorageKey === storageKey ? convos : EMPTY_CONVOS;
  const active = visibleConvos.find((c) => c.id === activeId) || null;

  // The dock's “Open full chat” link names the exact conversation. Local
  // history may arrive first and account history later, so wait for either
  // source to contain it before selecting and clearing the hand-off URL.
  const openedConversationRef = useRef("");
  useEffect(() => {
    if (!initialConversation || initialAsk || loadedStorageKey !== storageKey) return;
    const handoff = `${currentUser.id}:${initialConversation}`;
    if (openedConversationRef.current === handoff) return;
    if (!visibleConvos.some((conversation) => conversation.id === initialConversation)) return;
    openedConversationRef.current = handoff;
    setActiveId(initialConversation);
    replaceAppBrowserUrl("/agent");
  }, [currentUser.id, initialAsk, initialConversation, loadedStorageKey, storageKey, visibleConvos]);

  function handoffInternalNavigation(event: ReactMouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[href]"
    );
    if (!anchor || !activeId || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    try {
      queueAgentNavigationHandoff(currentUser.id, activeId);
    } catch {}
  }
  const offeringContext = active?.offeringContext ?? pendingOffering;
  const offeringContextId = offeringContext?.id;
  /**
   * What THIS chat has switched off. Empty = the whole knowledge base.
   *
   * A chat only gets an id once a message is sent, and this used to refuse
   * every change until then — so opening the knowledge base before asking
   * anything showed a list of greyed-out checkboxes that did nothing (Anir,
   * Jul 30: "when I'm unchecking stuff, why does it not let me change the
   * documents?"). Choosing what to read BEFORE asking is the natural order, so
   * the choice is held here and travels into the chat when it starts.
   */
  const [pendingExcluded, setPendingExcluded] = useState<string[]>([]);
  const excludedSources = useMemo(
    () => (active ? active.excludedSources ?? [] : pendingExcluded),
    [active, pendingExcluded]
  );
  const setExcludedSources = (ids: string[]) => {
    if (!activeId) {
      setPendingExcluded(ids);
      return;
    }
    setConvos((prev) => {
      const next = prev.map((c) =>
        c.id === activeId ? { ...c, excludedSources: ids } : c
      );
      save(storageKey, next);
      return next;
    });
  };

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages.length, sending, scrollToBottom]);

  const followReply = useCallback(() => {
    const area = scrollRef.current;
    if (area && area.scrollHeight - area.scrollTop - area.clientHeight < 140) {
      area.scrollTo({ top: area.scrollHeight });
    }
  }, []);

  const send = useCallback(
    async (
      raw: string,
      options?: {
        newConversation?: boolean;
        offering?: OfferingContext | null;
      }
    ) => {
      const text = raw.trim();
      if (!text || sending || loadedStorageKey !== storageKey) return;
      const requestUserId = currentUser.id;
      setConnectionErrorId(null);
      setInput("");

      // start or continue a conversation — decide the id synchronously so the
      // very next message continues the same thread (don't mutate inside the updater).
      const isNew = Boolean(options?.newConversation) || !activeId;
      const id = isNew ? uid() : activeId!;
      const nextOffering =
        options && "offering" in options ? options.offering : pendingOffering;
      const requestOfferingId =
        options && "offering" in options
          ? options.offering?.id
          : offeringContextId;
      const derivedTitle = smartTitle(text);
      setActiveId(id);
      setConvos((prev) => {
        let next = isNew
          ? [
              {
                id,
                title: derivedTitle,
                messages: [],
                updated: Date.now(),
                // Whatever was unticked before the first message still applies.
                ...(pendingExcluded.length
                  ? { excludedSources: pendingExcluded }
                  : {}),
                ...(nextOffering
                  ? { offeringContext: nextOffering }
                  : {}),
              },
              ...prev,
            ]
          : [...prev];
        next = next.map((c) =>
          c.id === id
            ? {
                ...c,
                // Keep a meaningful title once we have one; until then, take it
                // from the first message that isn't just a greeting.
                title: c.title || derivedTitle,
                messages: [...c.messages, { role: "user", text, ts: Date.now() }],
                updated: Date.now(),
              }
            : c
        );
        save(storageKey, next);
        return next;
      });
      setSendingId(id);
      setStreamingPreview(null);

      /**
       * NEVER KILL AN ANSWER BECAUSE SOMEBODY LOOKED AWAY (Anir, Aug 20: "I
       * asked a question, I went to another tab, and then I came back, and it
       * didn't answer me").
       *
       * The guard here is for a request that has genuinely hung, so the
       * composer is not frozen forever. But it was a flat 45s wall clock, and
       * a real answer with tool use can run longer than that — so switching
       * tabs for a minute was enough to have the reply shot in the back while
       * nobody was watching. The countdown now only runs while the tab is
       * visible: hidden, it keeps re-arming, and the fetch is left alone.
       */
      const controller = new AbortController();
      requestControllerRef.current = controller;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        timer = setTimeout(() => {
          if (typeof document !== "undefined" && document.hidden) {
            arm();
            return;
          }
          controller.abort();
        }, 90000);
      };
      arm();
      try {
        // Send the conversation so far so follow-ups ("make it shorter") have context.
        const prior = isNew
          ? []
          : visibleConvos
              .find((c) => c.id === id)
              ?.messages.map((mm) => ({ role: mm.role, text: mm.text })) || [];
        const requestBody = {
            message: text,
            stream: true,
            history: prior,
            // Empty means the whole knowledge base; a selection scopes THIS
            // chat to it without hiding anything from any other chat.
            excludeSources: excludedSources,
            // Context is explicit: it exists only when this conversation was
            // opened from an offering's Ask Freyr AI button.
            offeringId: requestOfferingId,
        };
        // An unreachable assistant is an error, not a message. Throwing sends
        // it to the catch below, which says so plainly instead of printing
        // something that looks like the agent talking.
        let receivedProgress = false;
        const data = await requestAgentResponse(requestBody, controller.signal, (answerSoFar) => {
          receivedProgress = true;
          if (activeUserIdRef.current === requestUserId) {
            setStreamingPreview({ conversationId: id, text: answerSoFar });
          }
        });
        if (activeUserIdRef.current !== requestUserId) return;
        const reply: string = data.reply;
        if (!reply) throw new Error("empty reply");
        const nextSuggestions: string[] = Array.isArray(data.suggestions) ? data.suggestions.filter((s: unknown) => typeof s === "string").slice(0, 3) : [];
        const replyTs = Date.now();
        if (!receivedProgress && activeConversationRef.current === id) {
          setTypingReply({ conversationId: id, ts: replyTs });
        }
        setStreamingPreview(null);
        setConvos((prev) => {
          const next = prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: [...c.messages, { role: "agent" as const, text: reply, ts: replyTs, suggestions: nextSuggestions, entityContext: Array.isArray(data.entityContext) ? data.entityContext.filter((v: unknown) => typeof v === "string") : [] }],
                  updated: replyTs,
                }
              : c
          );
          save(storageKey, next);
          return next;
        });
      } catch {
        if (activeUserIdRef.current !== requestUserId) return;
        setStreamingPreview(null);
        setConnectionErrorId(id);
      } finally {
        clearTimeout(timer);
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        if (activeUserIdRef.current === requestUserId) setSendingId(null);
      }
    },
    [
      activeId,
      sending,
      visibleConvos,
      currentUser.id,
      loadedStorageKey,
      storageKey,
      pendingExcluded,
      excludedSources,
      offeringContextId,
      pendingOffering,
    ]
  );

  function newChat(nextOffering: OfferingContext | null = null) {
    setActiveId(null);
    setPendingExcluded([]);
    setPendingOffering(nextOffering);
    setInput("");
  }

  function clearOfferingContext() {
    if (!activeId) {
      setPendingOffering(null);
    } else {
      setConvos((prev) => {
        const next = prev.map((c) =>
          c.id === activeId ? { ...c, offeringContext: undefined } : c
        );
        save(storageKey, next);
        return next;
      });
    }
  }

  // The query parameter is only a hand-off envelope. Once the Agent page has
  // visibly adopted it, remove it so refreshing later cannot silently restore
  // context that the person deliberately cleared.
  const offeringRouteConsumed = useRef("");
  useEffect(() => {
    if (!initialOffering || loadedStorageKey !== storageKey) return;
    const key = `${currentUser.id}:${initialOffering.id}`;
    if (offeringRouteConsumed.current === key) return;
    offeringRouteConsumed.current = key;
    setActiveId(null);
    setPendingOffering(initialOffering);
    replaceAppBrowserUrl("/agent");
  }, [currentUser.id, initialOffering, loadedStorageKey, storageKey]);

  // Global-search Enter and the offering-page AI hand-off land here with
  // ?ask= — start a FRESH conversation and submit the visible question.
  // Consume once; newChat() commits before send() reads activeId.
  const askConsumed = useRef("");
  useEffect(() => {
    if (!initialAsk) return;
    if (loadedStorageKey !== storageKey) return;
    const key = `${currentUser.id}:${initialOffering?.id ?? ""}:${initialAsk}`;
    if (askConsumed.current === key) return;
    askConsumed.current = key;
    void send(initialAsk, {
      newConversation: true,
      offering: initialOffering ?? null,
    });
    replaceAppBrowserUrl("/agent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, initialAsk, initialOffering, loadedStorageKey, storageKey]);

  /* Every delete asks (Anir, Aug 27: "every delete button... a pop-up in
     the entire app"). A chat is real work; one hover-click erased it. */
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [confirmChat, setConfirmChat] = useState<{ id: string; title: string } | null>(null);
  function remove(id: string) {
    setConvos((prev) => {
      const next = prev.filter((c) => c.id !== id);
      save(storageKey, next);
      return next;
    });
    if (activeId === id) setActiveId(null);
  }

  const historyPanel = (<>

        <div className="p-3">
          <button
            onClick={() => { newChat(); setMobileHistoryOpen(false); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-primary text-white text-[14px] font-semibold hover:bg-blue-hover transition-colors"
          >
            <Plus size={17} strokeWidth={2.2} />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {visibleConvos.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-text-tertiary">
              No conversations yet. Ask the agent anything to start.
            </p>
          ) : (
            /* Grouped by day rather than one flat "Recent" pile, so a thread
               tells you when it is from before you open it (Anir, Aug 14). The
               stamp on each row and the delete button share the same corner:
               the stamp is what you see, the delete appears over it on hover. */
            bucketByDay(visibleConvos, (c) => c.updated || 0).map((group) => (
              <div key={group.label}>
                <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  {group.label}
                </p>
                <ul className="space-y-0.5 mb-1.5">
                  {group.items.map((c) => (
                    <li key={c.id} className="group relative">
                      <button
                        onClick={() => { setActiveId(c.id); setMobileHistoryOpen(false); }}
                        /* The stamp costs a little title width, so hover gives
                           back the untruncated title alongside the full date. */
                        title={[c.title || "New chat", c.updated ? dayAndTime(c.updated) : ""]
                          .filter(Boolean)
                          .join("\n")}
                        className={cn(
                          "w-full text-left flex items-center gap-2 pl-2.5 pr-[62px] py-2 rounded-md text-[13px] truncate transition-colors",
                          c.id === activeId
                            ? "bg-blue-light text-blue-primary font-medium"
                            : "text-text-secondary hover:bg-surface"
                        )}
                      >
                        <MessageSquareText size={15} strokeWidth={1.7} className="shrink-0" />
                        <span className="truncate">{c.title || "New chat"}</span>
                      </button>
                      {c.updated ? (
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-text-tertiary group-hover:opacity-0 transition-opacity">
                          {listStamp(c.updated)}
                        </span>
                      ) : null}
                      <button
                        onClick={() => setConfirmChat({ id: c.id, title: c.title || "this chat" })}
                        aria-label={`Delete ${c.title || "chat"}`}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded bg-inherit text-[color:var(--status-red)] opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border-light flex flex-col gap-0.5">
          {historySyncFailed && (
            <p className="mb-1 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11px] leading-snug text-text-primary">
              Saved on this device. Account sync will retry with your next change.
            </p>
          )}
          {/* What the assistant knows, and what THIS chat is allowed to use. */}
          <KnowledgeRailButton onClick={() => setKnowledgeOpen(true)} />
          <Link href="/agent/settings" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-text-secondary hover:bg-surface transition-colors">
            <SlidersHorizontal size={16} strokeWidth={1.7} /> Agent settings
          </Link>
        </div>

  </>);

  return (
    <div data-tour="agent-workspace" className="flex h-full min-h-0">
      <ConfirmDialog
        open={confirmChat !== null}
        onClose={() => setConfirmChat(null)}
        onConfirm={() => {
          if (confirmChat) remove(confirmChat.id);
          setConfirmChat(null);
        }}
        title="Delete this chat?"
        body={<><b>{confirmChat?.title}</b> and everything in it goes away.</>}
        detail="There is no undo for a deleted conversation."
        confirmLabel="Delete it"
      />
      {/* Conversation list */}
      <aside className="hidden md:flex w-[260px] shrink-0 border-r border-border-light flex-col bg-surface/40">{historyPanel}</aside>
      <Modal open={mobileHistoryOpen} onClose={() => setMobileHistoryOpen(false)} title="Your chats" bodyClassName="flex flex-col h-[65dvh] !p-0">
        {historyPanel}
      </Modal>

      {/* Thread + composer */}
      <div
        className="flex-1 min-w-0 flex flex-col"
        onClickCapture={handoffInternalNavigation}
      >
        <div className="md:hidden flex items-center justify-between border-b border-border-light px-4 py-2">
          <button onClick={() => setMobileHistoryOpen(true)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-text-secondary"><MessageSquareText size={17} />Your chats</button>
          <button onClick={() => newChat()} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-blue-primary"><Plus size={17} />New chat</button>
        </div>
        {offeringContext && (
          <div className="border-b border-border-light bg-blue-light px-4 py-2.5">
            <div className="relative mx-auto flex h-7 max-w-[1200px] items-center justify-center">
              <div className="flex min-w-0 items-center justify-center gap-2.5 px-10 text-center">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-primary text-white">
                  <Sparkles size={14} strokeWidth={2} />
                </span>
                <div className="min-w-0 truncate text-[13px] font-medium text-text-primary">
                <span>Freyr AI is focused on </span>
                <Link
                  href={`/offerings/${offeringContext.id}`}
                  className="font-semibold text-blue-primary hover:underline"
                >
                  {offeringContext.name}
                </Link>
                </div>
              </div>
              <button
                type="button"
                onClick={clearOfferingContext}
                aria-label={`Remove ${offeringContext.name} context`}
                title="Remove offering context"
                className="absolute right-0 top-0 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
        {!active || active.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <span
              className="w-12 h-12 rounded-2xl bg-blue-primary text-white flex items-center justify-center mb-4 rise-in"
              style={{ animationDelay: "0ms" }}
            >
              <Sparkles size={24} strokeWidth={1.9} />
            </span>
            <h1
              className="text-[26px] font-semibold text-text-primary tracking-[-0.01em] rise-in"
              style={{ animationDelay: "60ms" }}
            >
              {offeringContext
                ? `What do you want to know about ${offeringContext.name}?`
                : `Hey ${firstName}, what do you want to work on?`}
            </h1>
            <p
              className="text-[14px] text-text-secondary mt-2 text-center max-w-[520px] rise-in"
              style={{ animationDelay: "120ms" }}
            >
              {offeringContext
                ? `This new chat is grounded in ${offeringContext.name}. Ask about its capabilities, fit, roadmap, or sales materials.`
                : offeringsOnly
                ? "Ask about an offering, who it suits, or what an uploaded document says. I'll do the work and leave everything for you to review."
                : "Ask about your work, company updates, offerings, or how to use the app."}
            </p>

            {/* Proactive: what's on the rep's plate right now — clickable.
                Hidden in real mode for two reasons at once: there is no
                pipeline there, so "9 at-risk" points at records nobody can
                open; and it is fetched after mount, so it popped in half a
                second late and broke the entrance animation (Anir, Jul 29:
                "it kind of ruins the premium animation"). */}
            {!offeringsOnly &&
              summary &&
              (summary.needsApproval > 0 || summary.cooling > 0 || summary.atRisk > 0) && (
                <div
                  className="flex flex-nowrap gap-2 mt-6 max-w-full overflow-x-auto no-scrollbar py-1 rise-in"
                  style={{ animationDelay: "180ms" }}
                >
                  {summary.needsApproval > 0 && (
                    <button
                      onClick={() => send("What's waiting for my approval?")}
                      className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 text-[13px] font-medium text-text-secondary bg-surface border border-border-light rounded-full px-3 py-1.5 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                    >
                      {/* orange, not amber-500 — banned yellow as a status dot */}
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                      {summary.needsApproval} waiting for your approval
                    </button>
                  )}
                  {summary.cooling > 0 && (
                    <button
                      onClick={() => send("Which deals are cooling?")}
                      className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 text-[13px] font-medium text-text-secondary bg-surface border border-border-light rounded-full px-3 py-1.5 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-error" />
                      {summary.cooling} deal{summary.cooling === 1 ? "" : "s"} cooling
                    </button>
                  )}
                  {summary.atRisk > 0 && (
                    <button
                      onClick={() => send("Which accounts are at-risk?")}
                      className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 text-[13px] font-medium text-text-secondary bg-surface border border-border-light rounded-full px-3 py-1.5 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-error" />
                      {summary.atRisk} at-risk
                    </button>
                  )}
                </div>
              )}

            <div
              className="flex flex-nowrap gap-2 mt-3 w-full max-w-[640px] overflow-x-auto no-scrollbar py-1 rise-in"
              style={{ animationDelay: "240ms" }}
            >
              {(offeringContext
                ? offeringStarters(offeringContext.name)
                : offeringsOnly
                  ? OFFERINGS_STARTERS
                  : STARTERS
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="shrink-0 whitespace-nowrap text-[13px] text-text-secondary border border-border-light rounded-full px-3.5 py-1.5 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-8 sm:py-8 space-y-5">
              {active.messages.map((msg, i) => {
                /* A divider whenever the conversation crosses midnight, and on
                   the first message so even a one-day chat is dated. Without
                   this a thread reads as one continuous session no matter how
                   many weeks it actually spans (Anir, Aug 14). */
                const prev = i > 0 ? active.messages[i - 1] : null;
                const newDay = !prev || !sameDay(prev.ts, msg.ts);
                return (
                  <div key={i} className="space-y-5">
                    {newDay && (
                      <div className="flex items-center gap-3 pt-1" aria-hidden>
                        <span className="h-px flex-1 bg-border-light" />
                        <span className="text-[11px] font-medium text-text-tertiary whitespace-nowrap">
                          {dayLabel(msg.ts)}
                        </span>
                        <span className="h-px flex-1 bg-border-light" />
                      </div>
                    )}
                    {msg.role === "user" ? (
                      <div className="flex flex-col items-end">
                        <div className="max-w-[78%] bg-blue-primary text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm">
                          {msg.text}
                        </div>
                        <span className="mt-1 mr-1 text-[11px] tabular-nums text-text-tertiary">
                          {clockTime(msg.ts)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-start">
                        <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles size={16} strokeWidth={1.9} />
                        </span>
                        <div className="agent-reply-wrap min-w-0 max-w-[calc(100%-44px)] sm:max-w-[82%]">
                          <p className="text-[12px] font-semibold text-text-tertiary mb-1">
                            {AGENT_NAME}
                            <span className="ml-2 font-normal tabular-nums">
                              {clockTime(msg.ts)}
                            </span>
                          </p>
                          <div className="text-[14px] text-text-primary leading-relaxed bg-surface border border-border-light rounded-2xl rounded-tl-md px-4 py-2.5">
                            <TypedAgentReply
                              text={msg.text}
                              active={typingReply?.conversationId === active.id && typingReply.ts === msg.ts}
                              entities={entities}
                              entityContext={msg.entityContext}
                              onReveal={followReply}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {sendingId === active?.id && (
                <div className="flex gap-3 justify-start">
                  <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={16} strokeWidth={1.9} />
                  </span>
                  <div className="bg-surface border border-border-light rounded-2xl rounded-tl-md px-4 py-3 text-[14px] leading-relaxed">
                    {streamingPreview?.conversationId === active.id && streamingPreview.text
                      ? <AgentResponseMarkdown text={trimStreamingLink(streamingPreview.text)} entities={entities} />
                      : <ThinkingDots />}
                  </div>
                </div>
              )}
              {connectionErrorId === active?.id && !sending && (
                <p role="alert" className="rounded-xl border border-border-light bg-surface px-4 py-2 text-sm text-text-secondary">
                  The connection stopped before the answer finished. Your question is saved; ask again to retry.
                </p>
              )}
            </div>
          </div>
        )}

        {/* The footer reserves its own space; the floating controls never cover a reply. */}
        <div className="relative z-10 shrink-0 px-3 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-white via-white to-white/0">
          <div className="mx-auto w-full max-w-[1200px]">
            {active && active.messages.length > 0 && (active.messages.at(-1)?.suggestions?.length ?? 0) > 0 && !sending && (
              <div key={active.messages.at(-1)?.ts} className="flex flex-nowrap gap-2 mb-3 overflow-x-auto no-scrollbar py-1">
                {active.messages.at(-1)?.suggestions?.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="shrink-0 whitespace-nowrap text-left text-[12px] text-text-secondary border border-border-light bg-white rounded-full px-3.5 py-2 shadow-sm hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3 bg-white border border-border rounded-2xl px-4 py-3 shadow-[0_4px_24px_-8px_rgba(20,45,80,0.2)] focus-within:border-blue-primary focus-within:shadow-[0_4px_24px_-8px_rgba(0,112,243,0.25)] transition-all">
              <textarea
                value={input}
                autoFocus
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                aria-label="Message the agent"
                placeholder={
                  offeringContext
                    ? `Ask about ${offeringContext.name}…`
                    : offeringsOnly
                    ? "Ask about an offering, a market, or an uploaded document…"
                    : "Ask about your work or anything in the app…"
                }
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
          </div>
        </div>
      </div>

      <KnowledgePanel
        open={knowledgeOpen}
        onClose={() => setKnowledgeOpen(false)}
        excluded={excludedSources}
        onExcludedChange={setExcludedSources}
        chatTitle={active?.title}
        // Always choosable: before a chat exists the choice is held and
        // applied to the one that starts.
        disabled={false}
      />
    </div>
  );
}
