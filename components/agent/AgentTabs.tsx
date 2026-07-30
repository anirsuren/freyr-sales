"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// One home for the agent. Tabs across the agent area; the chat (/agent) is the
// front door and renders full-bleed without these tabs.
/**
 * THE AGENT IS A CHAT AND ITS KNOWLEDGE. Nothing else, for now.
 *
 * Goals (/agent/plan) and To-do (/agent/inbox) belong to the autonomous agent
 * that plans work and queues approvals — which is not what this is any more:
 * it answers questions and writes drafts, and nobody has decided which actions
 * it should be allowed to take (Anir, Jul 30: "remove from the chatbot goals
 * and to-do. We don't need them right now. We just need the chat and then the
 * knowledge base"). The routes still exist; they are simply not offered.
 *
 * The knowledge base is not a tab — it lives inside the chat, where deciding
 * what the assistant may read belongs next to asking it something.
 */
const TABS = [
  { href: "/agent", label: "Chat", icon: MessageSquareText },
  { href: "/agent/settings", label: "Settings", icon: SlidersHorizontal },
];

// Show the tab bar on the agent sub-pages (the chat owns its own full-bleed UI).
const TAB_PATHS = new Set(["/agent/settings"]);

export function AgentTabs() {
  const pathname = usePathname() || "";
  if (!TAB_PATHS.has(pathname)) return null;

  return (
    <div className="border-b border-border-light mb-6">
      <nav className="flex items-center gap-1" aria-label="Agent">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
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
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
