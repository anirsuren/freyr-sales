"use client";

import { useRouter } from "next/navigation";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Search, Bell, BellOff, CircleHelp, ChevronDown, Sparkles, Menu, Settings, SlidersHorizontal, BookOpen, Package, Mic, LogOut, CheckCircle2, Hammer, Sun, Moon, UserRoundCog } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { RoleTag } from "@/components/ui/RoleTag";
import {
  NotificationGroupHeading,
  NotificationRow,
} from "@/components/notifications/NotificationRow";
import { Modal } from "@/components/ui/Modal";
import { cn, POPOVER_SURFACE } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import {
  groupByUrgency,
  NOTIF_READ_KEY,
  type AppNotification,
} from "@/lib/notifications";
import {
  useCurrentUser,
  useMyPhoto,
} from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";
import {
  persistNotifRead,
  readNotifRead,
  subscribeNotifRead,
} from "@/lib/notificationsRead";
import { canSwitchWorkspaceMode } from "@/lib/release";

/** How many alerts the bell panel shows before "View all notifications". */
const PANEL_LIMIT = 6;
// Stable identities so the "not ready yet" render doesn't churn the memos and
// re-fire the prefetch effect on every keystroke elsewhere in the header.
const NO_NOTIFS: AppNotification[] = [];
const NO_READ_IDS: ReadonlySet<string> = new Set<string>();

const SHORTCUTS = [
  { keys: ["Enter"], label: "Open the top search and jump to any page" },
  { keys: ["?"], label: "Show this keyboard shortcuts help" },
  { keys: ["Esc"], label: "Close any dialog, menu, or palette" },
  { keys: ["Tab"], label: "Reveal the “Skip to content” link, then move through controls" },
];

export function TopBar({
  onMenuClick,
  onAgentToggle,
  agentActive,
  offeringsOnly = false,
  customersReleased = false,
  feedbackAction,
}: {
  onMenuClick?: () => void;
  onAgentToggle?: () => void;
  agentActive?: boolean;
  offeringsOnly?: boolean;
  customersReleased?: boolean;
  feedbackAction?: ReactNode;
} = {}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loadedNotificationKey, setLoadedNotificationKey] = useState<
    string | null
  >(null);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const currentUser = useCurrentUser();
  // The signed-in user's uploaded picture, shared by every avatar of them.
  const { photo: myPhoto } = useMyPhoto();
  const router = useRouter();
  // Quick per-session mock/real switch lives here so nobody has to dig into
  // Settings. Real is always the default; Mock affects only this viewer.
  const [dataMode, setDataModeState] = useState<"mock" | "live" | null>(null);
  const [modeLocked, setModeLocked] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);

  useEffect(() => {
    setDarkTheme(document.documentElement.classList.contains("dark"));
  }, []);

  function switchTheme(dark: boolean) {
    setDarkTheme(dark);
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("freyr.theme", dark ? "dark" : "light");
    } catch {}
  }

  useEffect(() => {
    let on = true;
    fetch("/api/settings/data-mode", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!on) return;
        setDataModeState(d.mode === "live" ? "live" : "mock");
        setModeLocked(Boolean(d.locked));
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  async function switchMode(mode: "mock" | "live") {
    if (modeBusy || mode === dataMode) return;
    setModeBusy(true);
    try {
      const r = await fetch("/api/settings/data-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (r.ok) {
        // STAY ON THE SAME PAGE — and never land on a not-found screen
        // either (Anir, Aug 13: "it shouldn't really ever see that"). The
        // cookie is already flipped, so fetching the current path renders it
        // in the NEW mode: if that answers 200 the same page reloads in
        // place; if the record does not exist over there, land on the
        // module's list instead.
        try {
          const probe = await fetch(window.location.pathname + window.location.search, {
            cache: "no-store",
            headers: { accept: "text/html" },
          });
          if (probe.status === 404) {
            const segments = window.location.pathname.split("/").filter(Boolean);
            window.location.href = segments.length > 0 ? `/${segments[0]}` : "/";
            return;
          }
        } catch {}
        window.location.reload();
        return;
      }
    } catch {}
    setModeBusy(false);
  }
  const notificationReadKey = userScopedStorageKey(
    NOTIF_READ_KEY,
    currentUser.id
  );

  useEffect(() => {
    setLoadedNotificationKey(null);
    setNotifs([]);
    setReadIds(new Set());
    setNotifOpen(false);
    setUserOpen(false);
    let on = true;
    const load = () =>
      fetch("/api/notifications", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (on) setNotifs(d.notifications || []);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 15_000);
    window.addEventListener("focus", load);
    setReadIds(readNotifRead(notificationReadKey));
    setLoadedNotificationKey(notificationReadKey);
    return () => {
      on = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [notificationReadKey]);

  /* The Notifications page writes this same key — "Mark all read" there has
     to empty the badge here, and the header never unmounts to re-read it. */
  useEffect(
    () =>
      subscribeNotifRead((key) => {
        if (key === notificationReadKey)
          setReadIds(readNotifRead(notificationReadKey));
      }),
    [notificationReadKey]
  );

  const notificationStateReady =
    loadedNotificationKey === notificationReadKey;
  const visibleNotifs = notificationStateReady ? notifs : NO_NOTIFS;
  const visibleReadIds = notificationStateReady ? readIds : NO_READ_IDS;
  const unread = visibleNotifs.filter((n) => !visibleReadIds.has(n.id)).length;
  const panelItems = useMemo(
    () => visibleNotifs.slice(0, PANEL_LIMIT),
    [visibleNotifs]
  );
  const panelGroups = useMemo(() => groupByUrgency(panelItems), [panelItems]);

  // THE fix for "it takes a while for it to actually take me there": every
  // destination here is a `force-dynamic` page, and some (a deal, a session, a
  // call) have no loading.tsx — so a cold click is a blocking transition where
  // the old screen just sits there until the server render comes back. Warming
  // the router the moment the panel opens (and again on hover) means the payload
  // is usually already in hand when the click lands. Nothing is awaited ON the
  // click itself; see the row handler below.
  useEffect(() => {
    if (!notifOpen) return;
    for (const n of panelItems) {
      try {
        router.prefetch(n.href);
      } catch {}
    }
    try {
      router.prefetch("/notifications");
    } catch {}
  }, [notifOpen, panelItems, router]);
  /* WHAT WAS NEW WHEN THE PANEL OPENED. Opening the panel IS seeing the
     notifications, so the bell badge clears the moment it opens (Anir,
     Aug 18: "if i click on it it should stop the #1 popup") — but the rows
     keep their new-dot for this open via `freshIds`, or the panel would
     pretend nothing had ever been new. */
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const markedOnOpen = useRef(false);
  useEffect(() => {
    if (!notifOpen) {
      markedOnOpen.current = false;
      return;
    }
    if (markedOnOpen.current || !notificationStateReady) return;
    markedOnOpen.current = true;
    const fresh = visibleNotifs
      .filter((n) => !visibleReadIds.has(n.id))
      .map((n) => n.id);
    setFreshIds(new Set(fresh));
    if (fresh.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
    persistNotifRead(notificationReadKey, fresh);
  }, [
    notifOpen,
    notificationStateReady,
    visibleNotifs,
    visibleReadIds,
    notificationReadKey,
  ]);
  const panelNew = visibleNotifs.filter(
    (n) => freshIds.has(n.id) || !visibleReadIds.has(n.id)
  ).length;

  const markRead = useCallback(
    (id: string) => {
      if (!notificationStateReady) return;
      // Optimistic and non-blocking. The dot clears immediately; the write is a
      // plain side effect kept OUT of the state updater (an updater runs during
      // render, so a localStorage write in there is a render-phase side effect
      // React may re-run or interleave with the navigation it just started).
      setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      persistNotifRead(notificationReadKey, [id]);
    },
    [notificationReadKey, notificationStateReady]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      const usingControl = Boolean(
        el?.closest(
          'button, a, [role="button"], [role="checkbox"], [role="menuitem"]'
        )
      );
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
      if (
        e.key === "Enter" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !typing &&
        !usingControl &&
        !dialogOpen
      ) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      // "?" opens the shortcuts help — but never while typing in a field
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!userOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [userOpen]);

  return (
    <header
      data-tour="topbar"
      // z-50, not z-40: the page-title menus (Market Intel, Performance) sit
      // at z-40 and are LATER in the DOM, so at equal z they painted straight
      // through the topbar's search dropdown (Anir: "it's bleeding").
      className="sticky top-0 z-50 h-14 shrink-0 bg-white border-b border-border-light flex items-center justify-between gap-4 px-4 lg:px-8"
    >
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors shrink-0"
      >
        <Menu size={20} strokeWidth={1.7} />
      </button>
      <div className="relative flex-1 max-w-xl min-w-0">
        <button
          data-tour="global-search"
          onClick={() => setPaletteOpen(true)}
          className="group w-full flex items-center gap-2 bg-surface border border-border-light rounded-full pl-10 pr-2.5 py-2 text-[14px] text-text-tertiary hover:bg-white hover:border-blue-subtle hover:shadow-[0_4px_16px_rgba(0,113,227,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 focus-visible:border-blue-subtle active:scale-[0.99] transition-all duration-200 relative"
        >
          <Search
            size={18}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 shrink-0 transition-all duration-200 group-hover:text-blue-primary group-hover:scale-110 group-focus-visible:text-blue-primary"
          />
          <span className="truncate">
            {offeringsOnly
              ? customersReleased
                ? "Search offerings, companies, or jump to a page…"
                : "Search offerings…"
              : "Search offerings, companies, contacts, or jump to a page…"}
          </span>
          <kbd className="ml-auto shrink-0 inline-flex items-center text-[11px] font-medium text-text-secondary bg-white border border-border-light rounded-md px-1.5 py-0.5 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            Enter
          </kbd>
        </button>
        {/* Anchored dropdown — opens right under the search bar, no dark modal */}
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            anchored
            offeringsOnly={offeringsOnly}
            customersReleased={customersReleased}
        />
      </div>

      {/* No global "New" here. It duplicated the page's own primary action
          (Offerings already has "+ New offering"), and its menu was clipped
          behind the header (Anir, Jul 27: "why are there two new buttons…
          the button next to my name doesn't even work, remove that one").
          Each page owns its own create button, where the context is. */}
      <div className="flex items-center gap-1.5">
        {onAgentToggle && (
          <button
            data-tour="agent-assistant"
            aria-label="Ask your agent"
            title="Your agent"
            onClick={onAgentToggle}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-full transition-colors",
              agentActive
                ? "bg-blue-light text-blue-primary"
                : "text-text-secondary hover:bg-surface"
            )}
          >
            <Sparkles size={19} strokeWidth={1.7} />
          </button>
        )}
        {feedbackAction}
        {/* THE BELL IS BACK IN THE LIVE WORKSPACE (Anir, Aug 13: "can you
            add the notifications back?"). It was hidden here because the
            rows behind it were all derived from pipeline work that does not
            exist yet during the pilot. The API now answers with the two
            setup nudges instead — take the walkthrough, set up Touch ID —
            which are about your own account and true from day one. */}
        <div className="relative">
          <button
            data-tour="notifications"
            aria-label="Notifications"
            onClick={() => setNotifOpen((o) => !o)}
            className="relative z-50 w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors"
          >
            <Bell size={19} strokeWidth={1.5} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-primary text-white text-[9px] font-bold flex items-center justify-center tnum">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              {/* A real drop shadow and a ring, not the flat card border: against a white
                  page the old panel had no visible bottom edge (Anir, Aug 13:
                  "I can't properly see where it ends"). */}
              <div className={cn("popover-in absolute right-0 mt-2 w-[392px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl z-50 overflow-hidden", POPOVER_SURFACE)}>
                {/* The separators only exist to divide a list. With nothing in
                    the panel they drew two rules around an empty middle and
                    the whole thing read as a broken table (Anir, Aug 15: "you
                    don't need those two rectangle lines, it looks weird"). */}
                <div
                  className={cn(
                    "px-4 py-3 flex items-center justify-between gap-3",
                    visibleNotifs.length > 0 && "border-b border-border-light"
                  )}
                >
                  <span className="text-[14px] font-semibold text-text-primary">Notifications</span>
                  {panelNew > 0 && (
                    <span className="text-[11px] font-semibold text-blue-primary tnum whitespace-nowrap">
                      {panelNew} new
                    </span>
                  )}
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {/* Grouped by how pressing it is, most pressing first, with the
                      grouping printed so you can see it (Suren: the old list was
                      five identical-looking rows in no obvious order). */}
                  {panelGroups.map((group) => (
                    <div key={group.urgency}>
                      <NotificationGroupHeading
                        label={group.label}
                        count={group.items.length}
                        urgency={group.urgency}
                        className="px-4 pt-3 pb-1.5"
                      />
                      <ul>
                        {group.items.map((n) => {
                          const isRead = visibleReadIds.has(n.id);
                          return (
                            <li
                              key={n.id}
                              className="border-b border-border-light last:border-0"
                            >
                              <Link
                                href={n.href}
                                prefetch
                                onPointerEnter={() => {
                                  try {
                                    router.prefetch(n.href);
                                  } catch {}
                                }}
                                onClick={() => {
                                  // Both of these are local and instant — no
                                  // fetch stands between the click and the
                                  // route change.
                                  setNotifOpen(false);
                                  markRead(n.id);
                                }}
                                /* select-none: a click that wobbles a few
                                   pixels turns into a text-drag, and the
                                   browser cancels the navigation — which
                                   reads as "only the title is clickable"
                                   (Anir, Aug 27). Menu rows do not select. */
                                className="block cursor-pointer select-none px-4 py-3 hover:bg-surface transition-colors"
                              >
                                <NotificationRow
                                  notification={n}
                                  unread={!isRead || freshIds.has(n.id)}
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {visibleNotifs.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-4 pb-5 pt-3 text-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-tertiary">
                        <BellOff size={16} strokeWidth={1.9} />
                      </span>
                      <p className="text-[13px] font-semibold text-text-primary">
                        You&apos;re all caught up
                      </p>
                      <p className="text-[12px] leading-relaxed text-text-secondary">
                        Approvals, quiet deals and follow-ups land here.
                      </p>
                    </div>
                  )}
                </div>
                <Link
                  href="/notifications"
                  prefetch
                  onClick={() => setNotifOpen(false)}
                  className={cn(
                    "block px-4 py-2.5 text-[13px] font-semibold text-blue-primary text-center hover:bg-surface transition-colors",
                    visibleNotifs.length > 0 && "border-t border-border-light"
                  )}
                >
                  View all notifications
                </Link>
              </div>
            </>
          )}
        </div>
        <button
          data-tour="help"
          aria-label="Keyboard shortcuts"
          onClick={() => setHelpOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors"
        >
          <CircleHelp size={19} strokeWidth={1.5} />
        </button>
        <div className="w-px h-7 bg-border-light mx-2" />
        {/* Account menu shows in BOTH modes — it carries the mock/real switch,
            so real mode must keep it or you could never switch back. */}
        <div className="relative" ref={userMenuRef}>
          <button
            data-tour="account-menu"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-2 group rounded-full hover:bg-surface transition-colors py-1 pl-1 pr-2"
          >
            <Avatar src={myPhoto} name={currentUser.name} className="w-8 h-8 text-[12px]" />
            <span className="menu-in text-[14px] font-medium text-text-primary hidden md:block">
              {currentUser.name}
            </span>
            <ChevronDown size={16} strokeWidth={1.5} className="text-text-tertiary" />
          </button>
          {userOpen && (
            <div
              role="menu"
              aria-label="Account menu"
              className={cn("popover-in absolute right-0 mt-2.5 w-[264px] origin-top-right rounded-2xl bg-white z-50 overflow-hidden", POPOVER_SURFACE)}
              style={{ animation: "menu-pop 160ms cubic-bezier(0.16,1,0.3,1)" }}
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
                  <Avatar src={myPhoto} name={currentUser.name} className="w-9 h-9 text-[13px]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary leading-tight">
                      {currentUser.name}
                    </p>
                    {/* THE ROLE AS A TAG, not a sentence. What someone may do
                        is a fact with a fixed set of values, so it wears the
                        same colour + icon chip every other categorical fact in
                        this app wears (Anir, Jul 30: "it should show a tag"). */}
                    <span className="mt-1 flex">
                      <RoleTag role={currentUser.role} size="sm" />
                    </span>
                    {currentUser.email && (
                      <p className="text-[11.5px] text-text-tertiary leading-tight truncate mt-0.5">
                        {currentUser.email}
                      </p>
                    )}
                  </div>
                </div>
                {/* Quick per-session mock/real switch. It is hidden only when
                    deployment configuration deliberately locks the experience. */}
                {dataMode && !modeLocked && canSwitchWorkspaceMode(currentUser.role) && (
                  <div className="px-3 py-2.5 border-b border-border-light">
                    {/* Named for what it actually controls: which MODULES are
                        finished. It never changes your data, the offerings
                        catalog is one shared store (Anir, Jul 27: "we cannot
                        call it mock mode and real mode… it's just a matter of
                        what's done and what's still being worked on"). */}
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                      Show me
                    </p>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
                      {(
                        [
                          { mode: "live", icon: CheckCircle2, label: "Ready now", color: "#16A34A" },
                          { mode: "mock", icon: Hammer, label: "In progress", color: "#7C3AED" },
                        ] as const
                      ).map((m) => {
                        const MIcon = m.icon;
                        const active = dataMode === m.mode;
                        return (
                          <button
                            key={m.mode}
                            role="menuitemradio"
                            aria-checked={active}
                            disabled={modeBusy}
                            onClick={() => switchMode(m.mode)}
                            className={cn(
                              "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-all",
                              active
                                ? "workspace-mode-active shadow-sm"
                                : "text-text-secondary hover:text-text-primary",
                              modeBusy && "opacity-60"
                            )}
                            style={
                              active
                                ? ({ "--workspace-mode-color": m.color } as React.CSSProperties)
                                : undefined
                            }
                          >
                            <MIcon size={13} strokeWidth={2.1} />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-secondary">
                      {dataMode === "mock"
                        ? "Everything, including modules still being built"
                        : "Only the modules that are finished"}
                    </p>
                  </div>
                )}
                {/* NO "VIEW AS" HERE ANY MORE (Anir, Aug 30: "I clicked View as
                    BD member, but now it doesn't let me switch"... "I don't
                    even want that, I can create other accounts, bro, it's
                    gonna be too confusing").

                    It was a one-way door by construction: the control only
                    rendered for admins, so the moment it downgraded you the
                    control that would put you back was gone, and the only
                    remedy was deleting a cookie by hand. Real accounts test
                    roles honestly and cannot strand anybody. */}

                <div className="border-b border-border-light px-3 py-2.5">
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Appearance
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
                    {(
                      [
                        { dark: false, icon: Sun, label: "Light" },
                        { dark: true, icon: Moon, label: "Dark" },
                      ] as const
                    ).map((option) => {
                      const Icon = option.icon;
                      const active = darkTheme === option.dark;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => switchTheme(option.dark)}
                          className={cn(
                            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-all",
                            active
                              ? "bg-blue-light text-blue-primary shadow-sm"
                              : "text-text-secondary hover:text-text-primary"
                          )}
                        >
                          <Icon size={14} strokeWidth={2} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-text-secondary">
                    Saved on this device
                  </p>
                </div>
                <div className="p-1.5">
                  {/* Settings is ALWAYS here, in every mode. It was inside the
                      !offeringsOnly gate, so in real mode the only door was the
                      sidebar link, and removing that would have stranded the
                      user with no way to reach their own profile. */}
                  <Link
                    role="menuitem"
                    href="/settings?tab=profile"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <Settings size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Profile and settings
                  </Link>
                  {!offeringsOnly && (
                    <>
                  <Link
                    role="menuitem"
                    href="/agent/settings"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <SlidersHorizontal size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Agent settings
                  </Link>
                  <Link
                    role="menuitem"
                    href="/admin"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <BookOpen size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Admin
                  </Link>
                  <Link
                    role="menuitem"
                    href="/services"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <Package size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Service catalog
                  </Link>
                  <Link
                    role="menuitem"
                    href="/recordings"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <Mic size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Recordings
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setUserOpen(false);
                      setHelpOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors text-left"
                  >
                    <CircleHelp size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Keyboard shortcuts
                  </button>
                  <div className="my-1 border-t border-border-light" />
                    </>
                  )}
                  {/* Two different intentions, and only one of them was here.
                      Log out means "I am done"; switching means "I want to be
                      someone else for a minute" — which an admin testing what
                      a BD Member can see needs constantly (Anir, Aug 13). */}
                  <a
                    role="menuitem"
                    href="/api/auth/logout?next=/login"
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-primary hover:bg-surface transition-colors"
                  >
                    <UserRoundCog size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Switch account
                  </a>
                  <a
                    role="menuitem"
                    href="/api/auth/logout"
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-error hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={16} strokeWidth={1.7} />
                    Log out
                  </a>
                </div>
              </div>
          )}
        </div>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <ul className="divide-y divide-border-light">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center gap-4 py-3">
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[24px] text-center text-[12px] font-semibold text-text-primary bg-surface border border-border-light rounded px-1.5 py-0.5"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-[13px] text-text-secondary">{s.label}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </header>
  );
}
