"use client";

import { usePathname, useRouter } from "next/navigation";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Bell, CircleHelp, ChevronDown, Plus, Sparkles, Building2, UserPlus, Menu, Settings, SlidersHorizontal, BookOpen, Package, Mic, Upload, LogOut, CheckCircle2, Hammer } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  NotificationGroupHeading,
  NotificationRow,
} from "@/components/notifications/NotificationRow";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import {
  groupByUrgency,
  NOTIF_READ_KEY,
  type AppNotification,
} from "@/lib/notifications";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";

/** How many alerts the bell panel shows before "View all notifications". */
const PANEL_LIMIT = 6;
// Stable identities so the "not ready yet" render doesn't churn the memos and
// re-fire the prefetch effect on every keystroke elsewhere in the header.
const NO_NOTIFS: AppNotification[] = [];
const NO_READ_IDS: ReadonlySet<string> = new Set<string>();

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Open command palette — search records & jump to any page" },
  { keys: ["?"], label: "Show this keyboard shortcuts help" },
  { keys: ["Esc"], label: "Close any dialog, menu, or palette" },
  { keys: ["Tab"], label: "Reveal the “Skip to content” link, then move through controls" },
];

const NEW_ITEMS = [
  { icon: Sparkles, label: "Sales session", sub: "Research + generate a pitch", href: "/intake" },
  { icon: Building2, label: "Customer account", sub: "Add a company to track", href: "/intake" },
  { icon: UserPlus, label: "Contact", sub: "Add a buying-committee member", href: "/intake" },
  // No "Offering" here: the offerings page carries its own New offering button,
  // and two identical entry points read as two different features (Anir,
  // Jul 25: "there are two ways to press to go to new offering… just leave it
  // to one"). — kept as the page-level CTA.
  { icon: Upload, label: "Import data", sub: "Load accounts, contacts, and offerings", href: "/import" },
];

export function TopBar({
  onMenuClick,
  onAgentToggle,
  agentActive,
  offeringsOnly = false,
}: {
  onMenuClick?: () => void;
  onAgentToggle?: () => void;
  agentActive?: boolean;
  offeringsOnly?: boolean;
} = {}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loadedNotificationKey, setLoadedNotificationKey] = useState<
    string | null
  >(null);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const currentUser = useCurrentUser();
  const router = useRouter();
  // Quick mock/real switch lives here so nobody has to dig into Settings
  // (Suren). Mode drives what the whole app shows — see lib/release.ts.
  const [dataMode, setDataModeState] = useState<"mock" | "live" | null>(null);
  const [modeLocked, setModeLocked] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);

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
        // Full reload onto the new mode's home so every page re-renders
        // with the right visibility (live = released only, mock = everything).
        window.location.assign(mode === "live" ? "/offerings" : "/dashboard");
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
    if (offeringsOnly) {
      setLoadedNotificationKey(notificationReadKey);
      return;
    }
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
    try {
      const raw = localStorage.getItem(notificationReadKey);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {}
    setLoadedNotificationKey(notificationReadKey);
    return () => {
      on = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [notificationReadKey, offeringsOnly]);

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
  // offerings-only release: every remaining entry duplicates a control the
  // offerings page already shows (Import), so the button is pure noise there
  // (Anir, Jul 25: "this button is completely useless") — render nothing.
  const pathname = usePathname();
  // The offerings surface carries its own create/import controls — the global
  // button there is a duplicate at best and a confusing second door at worst
  // (Anir, twice today: "remove this new button").
  const newItems =
    offeringsOnly || pathname?.startsWith("/offerings") ? [] : NEW_ITEMS;

  const markRead = useCallback(
    (id: string) => {
      if (!notificationStateReady) return;
      // Optimistic and non-blocking. The dot clears immediately; the write is a
      // plain side effect kept OUT of the state updater (an updater runs during
      // render, so a localStorage write in there is a render-phase side effect
      // React may re-run or interleave with the navigation it just started).
      setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      try {
        const raw = localStorage.getItem(notificationReadKey);
        const stored = new Set<string>(raw ? JSON.parse(raw) : []);
        stored.add(id);
        localStorage.setItem(
          notificationReadKey,
          JSON.stringify(Array.from(stored))
        );
      } catch {}
    },
    [notificationReadKey, notificationStateReady]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // "?" opens the shortcuts help — but never while typing in a field
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
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
      className="sticky top-0 z-40 h-14 shrink-0 bg-white border-b border-border-light flex items-center justify-between gap-4 px-4 lg:px-8"
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
            {offeringsOnly ? "Search offerings…" : "Search offerings, companies, contacts, or jump to a page…"}
          </span>
          <kbd className="ml-auto shrink-0 inline-flex items-center text-[11px] font-medium text-text-secondary bg-white border border-border-light rounded-md px-1.5 py-0.5 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            ⌘K
          </kbd>
        </button>
        {/* Anchored dropdown — opens right under the search bar, no dark modal */}
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            anchored
            offeringsOnly={offeringsOnly}
        />
      </div>

      {/* No global "New" here. It duplicated the page's own primary action
          (Offerings already has "+ New offering"), and its menu was clipped
          behind the header (Anir, Jul 27: "why are there two new buttons…
          the button next to my name doesn't even work — remove that one").
          Each page owns its own create button, where the context is. */}
      <div className="flex items-center gap-1.5">
        {!offeringsOnly && onAgentToggle && (
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
        {!offeringsOnly && <div className="relative">
          <button
            data-tour="notifications"
            aria-label="Notifications"
            onClick={() => setNotifOpen((o) => !o)}
            className="relative w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors"
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
              <div className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-white border border-border-light rounded-xl shadow-card z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border-light flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-text-primary">Notifications</span>
                  {unread > 0 && (
                    <span className="text-[11px] font-semibold text-blue-primary tnum whitespace-nowrap">
                      {unread} new
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
                                className="block px-4 py-3 hover:bg-surface transition-colors"
                              >
                                <NotificationRow
                                  notification={n}
                                  unread={!isRead}
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {visibleNotifs.length === 0 && (
                    <p className="px-4 py-6 text-[13px] text-text-secondary text-center">
                      You&apos;re all caught up.
                    </p>
                  )}
                </div>
                <Link
                  href="/notifications"
                  prefetch
                  onClick={() => setNotifOpen(false)}
                  className="block px-4 py-2.5 text-[13px] font-semibold text-blue-primary text-center border-t border-border-light hover:bg-surface transition-colors"
                >
                  View all notifications
                </Link>
              </div>
            </>
          )}
        </div>}
        {!offeringsOnly && <button
          data-tour="help"
          aria-label="Keyboard shortcuts"
          onClick={() => setHelpOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors"
        >
          <CircleHelp size={19} strokeWidth={1.5} />
        </button>}
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
            <Avatar name={currentUser.name} className="w-8 h-8 text-[12px]" />
            <span className="text-[14px] font-medium text-text-primary hidden md:block">
              {currentUser.name}
            </span>
            <ChevronDown size={16} strokeWidth={1.5} className="text-text-tertiary" />
          </button>
          {userOpen && (
            <div
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 mt-2 w-[248px] bg-white border border-border-light rounded-xl shadow-card z-50 overflow-hidden"
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
                  <Avatar name={currentUser.name} className="w-9 h-9 text-[13px]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary leading-tight">
                      {currentUser.name}
                    </p>
                    <p className="text-[12px] text-text-secondary leading-tight truncate">
                      {currentUser.title}
                    </p>
                    {currentUser.email && (
                      <p className="text-[11.5px] text-text-tertiary leading-tight truncate mt-0.5">
                        {currentUser.email}
                      </p>
                    )}
                  </div>
                </div>
                {/* Quick mock/real switch (Suren: "instead of going to settings
                    every time" — and it "has to be a toggle"). One segmented
                    toggle, active half lit in its color, caption explains the
                    current mode. Hidden only when the deployment locks it. */}
                {dataMode && !modeLocked && (
                  <div className="px-3 py-2.5 border-b border-border-light">
                    {/* Named for what it actually controls: which MODULES are
                        finished. It never changes your data — the offerings
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
                                ? "bg-white shadow-sm"
                                : "text-text-secondary hover:text-text-primary",
                              modeBusy && "opacity-60"
                            )}
                            style={active ? { color: m.color } : undefined}
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
                <div className="p-1.5">
                  {!offeringsOnly && (
                    <>
                  <Link
                    role="menuitem"
                    href="/settings"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    <Settings size={16} strokeWidth={1.7} className="text-text-secondary" />
                    Settings
                  </Link>
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
                    Knowledge base
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
