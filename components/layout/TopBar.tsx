"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Bell, CircleHelp, ChevronDown, CalendarClock, Plus, Sparkles, Building2, UserPlus, Menu, ClipboardCheck, Flame, Settings, SlidersHorizontal, BookOpen, Package, Mic } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import {
  NOTIF_READ_KEY,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";

const NOTIF_ICON: Record<NotificationType, typeof Bell> = {
  review: ClipboardCheck,
  rotting: Flame,
  signal: Sparkles,
  followup: CalendarClock,
};

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
  { icon: Package, label: "Offering", sub: "Add to the offering repository", href: "/offerings/new" },
];

export function TopBar({ onMenuClick }: { onMenuClick?: () => void } = {}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [userOpen, setUserOpen] = useState(false);

  useEffect(() => {
    let on = true;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        if (on) setNotifs(d.notifications || []);
      })
      .catch(() => {});
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {}
    return () => {
      on = false;
    };
  }, []);

  const unread = notifs.filter((n) => !readIds.has(n.id)).length;

  function markRead(id: string) {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }

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

  return (
    <header className="sticky top-0 z-40 h-14 shrink-0 bg-white border-b border-border-light flex items-center justify-between gap-4 px-4 lg:px-8">
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors shrink-0"
      >
        <Menu size={20} strokeWidth={1.7} />
      </button>
      <div className="flex-1 max-w-xl min-w-0">
        <button
          onClick={() => setPaletteOpen(true)}
          className="w-full flex items-center gap-2 bg-surface border border-border-light rounded-full pl-10 pr-2.5 py-2 text-[14px] text-text-tertiary hover:bg-white hover:border-blue-subtle hover:shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all relative"
        >
          <Search size={18} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 shrink-0" />
          <span className="truncate">Search offerings, companies, contacts, or jump to a page…</span>
          <kbd className="ml-auto shrink-0 inline-flex items-center text-[11px] font-medium text-text-secondary bg-white border border-border-light rounded-md px-1.5 py-0.5 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            aria-label="Create new"
            aria-haspopup="menu"
            aria-expanded={newOpen}
            onClick={() => setNewOpen((o) => !o)}
            className="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <Plus size={16} strokeWidth={2.2} />
            <span className="hidden sm:block">New</span>
            <ChevronDown size={14} strokeWidth={2} className="opacity-80" />
          </button>
          {newOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNewOpen(false)} />
              <div
                role="menu"
                aria-label="Create new"
                className="absolute right-0 mt-2 w-[260px] bg-white border border-border-light rounded-xl shadow-card z-50 overflow-hidden p-1.5"
              >
                {NEW_ITEMS.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.label}
                      role="menuitem"
                      href={it.href}
                      onClick={() => setNewOpen(false)}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface transition-colors"
                    >
                      <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                        <Icon size={16} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-text-primary">{it.label}</span>
                        <span className="block text-[12px] text-text-secondary leading-snug">{it.sub}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button
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
              <div className="absolute right-0 mt-2 w-[340px] bg-white border border-border-light rounded-xl shadow-card z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border-light flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-text-primary">Notifications</span>
                  <span className="text-[11px] font-semibold text-blue-primary tnum">
                    {unread} new
                  </span>
                </div>
                <ul className="max-h-[340px] overflow-y-auto">
                  {notifs.slice(0, 5).map((n) => {
                    const Icon = NOTIF_ICON[n.type] || Bell;
                    const isRead = readIds.has(n.id);
                    return (
                      <li key={n.id} className="border-b border-border-light last:border-0">
                        <Link
                          href={n.href}
                          onClick={() => {
                            markRead(n.id);
                            setNotifOpen(false);
                          }}
                          className="px-4 py-3 flex gap-3 hover:bg-surface transition-colors"
                        >
                          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                            <Icon size={16} strokeWidth={1.6} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-[13px] text-text-primary", isRead ? "font-medium" : "font-semibold")}>
                              {n.title}
                            </p>
                            <p className="text-[12px] text-text-secondary leading-snug">{n.body}</p>
                          </div>
                          {!isRead && <span className="w-2 h-2 rounded-full bg-blue-primary shrink-0 mt-1.5" />}
                        </Link>
                      </li>
                    );
                  })}
                  {notifs.length === 0 && (
                    <li className="px-4 py-6 text-[13px] text-text-secondary text-center">
                      You&apos;re all caught up.
                    </li>
                  )}
                </ul>
                <Link
                  href="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block px-4 py-2.5 text-[13px] font-semibold text-blue-primary text-center border-t border-border-light hover:bg-surface transition-colors"
                >
                  View all notifications
                </Link>
              </div>
            </>
          )}
        </div>
        <button
          aria-label="Keyboard shortcuts"
          onClick={() => setHelpOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface transition-colors"
        >
          <CircleHelp size={19} strokeWidth={1.5} />
        </button>
        <div className="w-px h-7 bg-border-light mx-2" />
        <div className="relative">
          <button
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-2 group rounded-full hover:bg-surface transition-colors py-1 pl-1 pr-2"
          >
            <Avatar name="Suren Dheen" className="w-8 h-8 text-[12px]" />
            <span className="text-[14px] font-medium text-text-primary hidden md:block">
              Suren Dheen
            </span>
            <ChevronDown size={16} strokeWidth={1.5} className="text-text-tertiary" />
          </button>
          {userOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 mt-2 w-[248px] bg-white border border-border-light rounded-xl shadow-card z-50 overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
                  <Avatar name="Suren Dheen" className="w-9 h-9 text-[13px]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary leading-tight">
                      Suren Dheen
                    </p>
                    <p className="text-[12px] text-text-secondary leading-tight">
                      Senior Sales Rep · Freyr
                    </p>
                  </div>
                </div>
                <div className="p-1.5">
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
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

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
