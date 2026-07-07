"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, Target, Inbox, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// One home for the agent. Tabs across the agent area; the chat (/agent) is the
// front door and renders full-bleed without these tabs.
const TABS = [
  { href: "/agent", label: "Chat", icon: MessageSquareText },
  { href: "/agent/plan", label: "Goals", icon: Target },
  { href: "/agent/inbox", label: "To-do", icon: Inbox },
  { href: "/agent/settings", label: "Settings", icon: SlidersHorizontal },
];

// Show the tab bar on the agent sub-pages (the chat owns its own full-bleed UI).
const TAB_PATHS = new Set(["/agent/plan", "/agent/inbox", "/agent/settings"]);

export function AgentTabs() {
  const pathname = usePathname() || "";
  const [todo, setTodo] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/agent/inbox")
      .then((r) => r.json())
      .then((d) => alive && setTodo((d.needsApproval || 0) + (d.reworks || 0)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!TAB_PATHS.has(pathname)) return null;

  return (
    <div className="border-b border-border-light mb-6">
      <nav className="flex items-center gap-1" aria-label="Agent">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          const badge = t.href === "/agent/inbox" && todo > 0 ? todo : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2.5 text-[14px] font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-blue-primary text-blue-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              {t.label}
              {badge > 0 && (
                <span className="text-[11px] font-bold tnum px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
