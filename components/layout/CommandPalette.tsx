"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Rocket,
  Zap,
  Boxes,
  UsersRound,
  Gauge,
  FileBarChart,
  ChartColumnBig,
  Radar,
  Megaphone,
  PhoneCall,
  ListChecks,
  Rss,
  Bell,
  Target,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessModule } from "@/lib/moduleAccess";
import { isOfferingsReleasePath } from "@/lib/release";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { useToast } from "@/components/ui/Toast";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { OfferingIcon } from "@/components/ui/OfferingIcon";

// KEEP THIS THE SAME LIST THE SIDEBAR SHOWS (found Aug 16: the rail offered
// eight modules in real mode and search could jump to two). Every module a
// person can click in the rail has to be typeable here, or "jump to a page"
// is a promise the box does not keep. Both surfaces are filtered by the same
// release gate below, so a page appears here exactly when it appears there.
const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agent", href: "/agent", icon: Bot },
  // Offerings near the top, consistent with the offerings-first sidebar order.
  { label: "Offerings", href: "/offerings", icon: Package },
  { label: "FDL Components", href: "/components", icon: Boxes },
  { label: "New Session", href: "/intake", icon: FilePlus2 },
  { label: "Sessions", href: "/sessions", icon: CalendarClock },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "Forecast", href: "/forecast", icon: Target },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Team", href: "/team", icon: UsersRound },
  { label: "Goals", href: "/performance", icon: Gauge },
  { label: "Reports", href: "/reports", icon: FileBarChart },
  { label: "Market Intel", href: "/market-intel", icon: Radar },
  { label: "Sequences", href: "/sequences", icon: Zap },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Voice agents", href: "/voice", icon: PhoneCall },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Analytics", href: "/analytics", icon: ChartColumnBig },
  { label: "Activity", href: "/activity", icon: Rss },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Admin", href: "/admin", icon: Database },
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
  // No "New offering" here. Creating an offering is a POP-UP on the offerings
  // list, and this row was the last thing still routing to a standalone page
  // for the same job — two different front doors to one form (Anir, Jul 30:
  // "new offering has to be a popup which u already have, but from the search
  // bar it takes me here which is weird"). The page is gone; this row went
  // with it.
  { key: "autopilot", label: "Run autopilot", icon: Rocket, kind: "run", endpoint: "/api/agent/autopilot" },
  { key: "cadence", label: "Prep the re-engagement sequence", icon: Zap, kind: "run", endpoint: "/api/agent/cadence-run" },
];

// Which agent commands survive the offerings-only release. The two "run" plays
// drive sequences and campaigns — unreleased modules — so they stay behind the
// gate. Opening the agent console and creating an offering do not.
const RELEASED_AGENT_CMDS: ReadonlySet<string> = new Set(["console"]);

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
  offeringsOnly = false,
  customersReleased = false,
}: {
  open: boolean;
  onClose: () => void;
  // anchored = render as a dropdown under the top-bar search (no dark modal)
  anchored?: boolean;
  offeringsOnly?: boolean;
  customersReleased?: boolean;
}) {
  const router = useRouter();
  const me = useCurrentUser();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  /** The query the palette is currently showing an answer for. A response for
   *  any other query is stale and gets dropped. */
  const latestQuery = useRef("");
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
    /**
     * THE ANSWER IS KEYED TO THE QUESTION, not to a closure flag.
     *
     * This used to cancel via a `cancelled` boolean captured per effect run.
     * Typing quickly could leave the palette showing nothing for a query that
     * genuinely had matches: "Freya.GRR" listed no records, and pressing one
     * more key made both GRR-PAC offerings appear (found Aug 14 walking the
     * flows). An empty search box that is silently wrong is worse than a slow
     * one, so correctness no longer depends on cleanup ordering: the response
     * is applied only when it still answers the query on screen.
     */
    const asked = q;
    latestQuery.current = asked;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(asked)}`);
        const data = await r.json();
        if (latestQuery.current !== asked) return;
        const next = data.results || [];
        setResults(
          offeringsOnly
            ? next.filter(
                (result: Result) =>
                  result.type === "Offering" ||
                  (customersReleased && result.type === "Customer")
              )
            : next
        );
      } catch {
        if (latestQuery.current === asked) setResults([]);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [customersReleased, offeringsOnly, q]);

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
      // A typed question opens a fresh agent CHAT with the question submitted
      // (Anir: "press Enter, it should go to ask the agent — like Gemini").
      // The goals workspace was landing people on a wall of drafts for
      // "tell me about northwind" — wrong tool for a question.
      router.push(`/agent?ask=${encodeURIComponent(goal)}`);
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
      (q.trim()
        ? NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()))
        : NAV
      ).filter(
        (n) =>
          // A BD Member must not be able to jump to an Owner-only module
          // from search either (Freyr, Aug 12).
          // ONE ANSWER FOR "IS THIS RELEASED", the same one the sidebar asks.
          // This used to be a hand-rolled prefix test that knew only about
          // offerings and customers, which is precisely the drift lib/release
          // exists to stop — the rail had graduated six more modules into real
          // mode and search never heard about it.
          canAccessModule(n.href, me.role) &&
          (!offeringsOnly || isOfferingsReleasePath(n.href))
      ),
    [offeringsOnly, q, me.role]
  );

  const agentMatches = useMemo(
    () =>
      (q.trim()
        ? AGENT_CMDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
        : AGENT_CMDS
      ).filter((c) => !offeringsOnly || RELEASED_AGENT_CMDS.has(c.key)),
    [offeringsOnly, q]
  );

  // Flat, ordered list of everything selectable — powers both render + keyboard nav.
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    const query = q.trim();
    // TYPE A QUESTION, HIT ENTER, LAND IN A FRESH AGENT CHAT WITH IT ASKED.
    // This row used to be stripped in the offerings-only release along with the
    // rest of the Agent section — but /agent shipped with the second rollout
    // (lib/release.ts), so the gate was outliving its reason and the top-bar
    // search silently lost its best trick (Anir, Jul 30: "what happened to the
    // thing where I could type 'tell me about the offerings' and it would auto
    // go to the agent with a new chat with that message").
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
        } else if (q.trim() && !offeringsOnly) {
          // /search is the everything-page: customers, contacts, sessions.
          // In the offerings-only release pressing Enter on a miss must not
          // walk someone into an unreleased module (the middleware would bounce
          // them straight back out, which reads as a broken app).
          go(`/search?q=${encodeURIComponent(q.trim())}`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, sel, q, onClose, go, offeringsOnly]);

  if (!open) return null;

  let renderedSection = "";

  const box = (
    <div
      className={cn(
        "cmdk-in overflow-hidden bg-white",
        anchored
          ? "absolute left-0 top-0 z-50 w-full min-w-[420px] rounded-2xl border border-border-light shadow-[0_24px_64px_-12px_rgba(15,23,42,0.28)]"
          : "mx-4 w-full max-w-[560px] rounded-2xl border border-border-light shadow-[0_28px_72px_-16px_rgba(15,23,42,0.34)]"
      )}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center gap-2.5 border-b border-border-light bg-surface/40 px-4">
          <Search
            size={18}
            strokeWidth={1.8}
            className={cn(
              "shrink-0 transition-colors duration-200",
              q ? "text-blue-primary" : "text-text-tertiary"
            )}
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={offeringsOnly ? "Search offerings…" : "Search, set a goal, or run a play…"}
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
                  <p className="mt-1 border-t border-border-light px-4 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary first:mt-0 first:border-t-0 first:pt-1.5">
                    {it.section}
                  </p>
                )}
                <button
                  onClick={() => it.run()}
                  onMouseEnter={() => setSel(i)}
                  disabled={isBusy}
                  className={cn(
                    // items-start, not items-center: a long name now wraps to
                    // a second line, and the icon must stay level with the
                    // FIRST line rather than float to the middle of the row.
                    "cmdk-row flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-50",
                    selected ? "bg-surface" : "hover:bg-surface"
                  )}
                  data-selected={selected}
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
                  {/* NAMES WRAP, THEY DO NOT GET CUT. Searching "Freya"
                      returned "Freya.GRR-PAC (Global Regulatory Requirements
                      for Post Approval …" — the one result whose name you
                      actually needed to read to tell it apart from the other
                      thirty (found Aug 14 walking the flows). Truncating with
                      an ellipsis is banned app-wide; if it does not fit, the
                      layout gives it another line. */}
                  <span className="flex-1 min-w-0">
                    <span className="block break-words text-[14px] leading-snug text-text-primary">
                      {isBusy ? "Working…" : it.label}
                    </span>
                    {it.sublabel && (
                      <span className="mt-0.5 block break-words text-[12px] leading-snug text-text-tertiary">
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
              {offeringsOnly
                ? "No offerings match that."
                : "No matches: press Enter to search everything."}
            </p>
          )}
        </div>

        {q.trim() && !offeringsOnly && (
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
      className="cmdk-veil fixed inset-0 z-[90] flex items-start justify-center bg-black/25 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      {box}
    </div>
  );
}
