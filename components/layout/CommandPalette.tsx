"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FilePlus2,
  Building2,
  Database,
  Columns3,
  CalendarClock,
  Contact,
  Package,
  Settings,
  Building,
  User,
  Sparkles,
  Bot,
  Inbox,
  Rocket,
  Zap,
  ArrowRight,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Session", href: "/intake", icon: FilePlus2 },
  { label: "Sessions", href: "/sessions", icon: CalendarClock },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Offerings", href: "/offerings", icon: Package },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Knowledge Base", href: "/admin", icon: Database },
  { label: "Service Catalog", href: "/services", icon: Package },
  { label: "Settings", href: "/settings", icon: Settings },
];

// Agent commands runnable from anywhere (V9 #21). "nav" items jump; "run" items
// fire an agent endpoint and report the result.
type AgentCmd = {
  key: string;
  label: string;
  icon: LucideIcon;
} & ({ kind: "nav"; href: string } | { kind: "run"; endpoint: string });

const AGENT_CMDS: AgentCmd[] = [
  { key: "console", label: "Open AI Agent console", icon: Bot, kind: "nav", href: "/agent" },
  { key: "inbox", label: "Open Agent Inbox", icon: Inbox, kind: "nav", href: "/agent/inbox" },
  { key: "new-offering", label: "New offering", icon: Package, kind: "nav", href: "/offerings/new" },
  { key: "autopilot", label: "Run autopilot", icon: Rocket, kind: "run", endpoint: "/api/agent/autopilot" },
  { key: "cadence", label: "Run re-engagement cadence", icon: Zap, kind: "run", endpoint: "/api/agent/cadence-run" },
];

interface Result {
  type: string;
  label: string;
  sublabel: string;
  href: string;
}

type Item = {
  key: string;
  section: "Agent" | "Records" | "Go to";
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  badge?: string;
  rightLabel?: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (!cancelled) setResults(data.results || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 140);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const setGoal = useCallback(
    (goal: string) => {
      onClose();
      router.push(`/agent/plan?goal=${encodeURIComponent(goal)}`);
    },
    [onClose, router]
  );

  const runCmd = useCallback(
    async (cmd: Extract<AgentCmd, { kind: "run" }>) => {
      setBusy(cmd.key);
      try {
        const res = await fetch(cmd.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json();
        if (data.ok) {
          if (cmd.key === "autopilot") {
            toast(`Autopilot handled ${data.handled} · ${data.escalated} need approval`);
          } else if (cmd.key === "cadence") {
            toast(`Cadence: enrolled ${data.enrolled} · advanced ${data.advanced}`);
          } else {
            toast("Done");
          }
          router.refresh();
        } else {
          toast(data.error || "Agent couldn't run that", "error");
        }
      } catch {
        toast("Agent couldn't run that", "error");
      } finally {
        setBusy(null);
        onClose();
      }
    },
    [onClose, router, toast]
  );

  const navMatches = useMemo(
    () =>
      q.trim()
        ? NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()))
        : NAV,
    [q]
  );

  const agentMatches = useMemo(
    () =>
      q.trim()
        ? AGENT_CMDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
        : AGENT_CMDS,
    [q]
  );

  // Flat, ordered list of everything selectable — powers both render + keyboard nav.
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    const query = q.trim();
    if (query) {
      list.push({
        key: "goal",
        section: "Agent",
        icon: Sparkles,
        label: `Ask the agent: “${query}”`,
        run: () => setGoal(query),
      });
    }
    for (const c of agentMatches) {
      list.push({
        key: `agent:${c.key}`,
        section: "Agent",
        icon: c.icon,
        label: c.label,
        badge: c.kind === "run" ? "Run" : undefined,
        run: () => (c.kind === "nav" ? go(c.href) : runCmd(c)),
      });
    }
    if (query) {
      results.forEach((r, i) =>
        list.push({
          key: `rec:${i}`,
          section: "Records",
          icon:
            r.type === "Customer"
              ? Building
              : r.type === "Offering"
              ? Package
              : User,
          label: r.label,
          sublabel: r.sublabel,
          rightLabel: r.type,
          run: () => go(r.href),
        })
      );
    }
    for (const n of navMatches) {
      list.push({
        key: `nav:${n.href}`,
        section: "Go to",
        icon: n.icon,
        label: n.label,
        run: () => go(n.href),
      });
    }
    return list;
  }, [q, agentMatches, navMatches, results, go, setGoal, runCmd]);

  // keep selection in range whenever the list changes
  useEffect(() => {
    setSel((s) => (s >= items.length ? 0 : s));
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        const it = items[sel];
        if (it) {
          e.preventDefault();
          it.run();
        } else if (q.trim()) {
          go(`/search?q=${encodeURIComponent(q.trim())}`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, sel, q, onClose, go]);

  if (!open) return null;

  let renderedSection = "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] bg-black/20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] mx-4 bg-white rounded-xl border border-border-light shadow-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border-light">
          <Search size={18} strokeWidth={1.5} className="text-text-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, set a goal, or run a play…"
            className="flex-1 h-12 bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-tertiary"
          />
          <span className="text-[11px] text-text-tertiary border border-border-light rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>

        <div className="max-h-[360px] overflow-auto py-2">
          {items.map((it, i) => {
            const header =
              it.section !== renderedSection ? ((renderedSection = it.section)) : null;
            const Icon = it.icon;
            const selected = i === sel;
            const isBusy = busy === it.key.replace(/^agent:/, "");
            return (
              <div key={it.key}>
                {header && (
                  <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    {it.section}
                  </p>
                )}
                <button
                  onClick={() => it.run()}
                  onMouseEnter={() => setSel(i)}
                  disabled={isBusy}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-50",
                    selected ? "bg-surface" : "hover:bg-surface"
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.6}
                    className={cn(
                      "shrink-0",
                      it.section === "Agent" ? "text-blue-primary" : "text-text-secondary"
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] text-text-primary truncate">
                      {isBusy ? "Working…" : it.label}
                    </span>
                    {it.sublabel && (
                      <span className="block text-[12px] text-text-tertiary truncate">
                        {it.sublabel}
                      </span>
                    )}
                  </span>
                  {it.badge && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary border border-border-light rounded px-1.5 py-0.5 shrink-0">
                      {it.badge}
                    </span>
                  )}
                  {it.rightLabel && (
                    <span className="text-[11px] text-text-tertiary shrink-0">
                      {it.rightLabel}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          {q.trim() && items.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-text-tertiary">
              No matches — press Enter to search everything.
            </p>
          )}
        </div>

        {q.trim() && (
          <button
            onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className="w-full border-t border-border-light px-4 py-2.5 text-[13px] font-semibold text-blue-primary text-left hover:bg-surface transition-colors"
          >
            View all results for “{q.trim()}” →
          </button>
        )}
      </div>
    </div>
  );
}
