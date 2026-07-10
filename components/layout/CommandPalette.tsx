"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { OfferingIcon } from "@/components/ui/OfferingIcon";

const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  // Offerings near the top, consistent with the offerings-first sidebar order.
  { label: "Offerings", href: "/offerings", icon: Package },
  { label: "New Session", href: "/intake", icon: FilePlus2 },
  { label: "Sessions", href: "/sessions", icon: CalendarClock },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "Customers", href: "/customers", icon: Building2 },
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
  { key: "cadence", label: "Prep the re-engagement sequence", icon: Zap, kind: "run", endpoint: "/api/agent/cadence-run" },
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
  // For record hits we render the real logo/photo/offering-icon, not a glyph.
  recordType?: string;
  recordName?: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  anchored = false,
}: {
  open: boolean;
  onClose: () => void;
  // anchored = render as a dropdown under the top-bar search (no dark modal)
  anchored?: boolean;
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

  // Close on navigation — clicking a sidebar nav item (a "new tab") or a result
  // should dismiss the search, but the sidebar sits above the click-away layer
  // so it never fired (Suren: "when I click a new tab or outside, it should
  // close — it's not"). Closing on pathname change covers every navigation.
  const pathname = usePathname();
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
            toast(`Sequence: enrolled ${data.enrolled} · advanced ${data.advanced}`);
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
          recordType: r.type,
          recordName: r.label,
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

  const box = (
    <div
      className={cn(
        "bg-white overflow-hidden",
        anchored
          ? "absolute left-0 top-0 z-50 w-full min-w-[420px] rounded-2xl border border-border-light shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
          : "w-full max-w-[560px] mx-4 rounded-xl border border-border-light shadow-card"
      )}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center gap-2 px-4 border-b border-border-light">
          <Search size={18} strokeWidth={1.5} className="text-text-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, set a goal, or run a play…"
            className="flex-1 h-12 bg-transparent outline-none focus:shadow-none focus-visible:shadow-none text-[15px] text-text-primary placeholder:text-text-tertiary"
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
                  {it.recordType === "Customer" ? (
                    <CompanyLogo
                      name={it.recordName || it.label}
                      className="w-6 h-6 text-[9px] shrink-0"
                    />
                  ) : it.recordType === "Contact" ? (
                    <Avatar
                      name={it.recordName || it.label}
                      className="w-6 h-6 text-[9px] shrink-0"
                    />
                  ) : it.recordType === "Offering" ? (
                    <OfferingIcon
                      name={it.recordName || it.label}
                      className="w-6 h-6 shrink-0"
                    />
                  ) : (
                    <Icon
                      size={18}
                      strokeWidth={1.6}
                      className={cn(
                        "shrink-0",
                        it.section === "Agent" ? "text-blue-primary" : "text-text-secondary"
                      )}
                    />
                  )}
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
  );

  // Anchored: a dropdown under the top-bar search with a light click-away —
  // no dark full-screen modal (Suren: "fix the search bar"). Falls back to the
  // centered dialog for any non-anchored caller (e.g. ⌘K from a page).
  return anchored ? (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {box}
    </>
  ) : (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] bg-black/20"
      onClick={onClose}
    >
      {box}
    </div>
  );
}
