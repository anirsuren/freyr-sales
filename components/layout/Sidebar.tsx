"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Columns3,
  Building2,
  Contact,
  Settings,
  Plus,
  Activity,
  ChartColumnBig,
  FileBarChart,
  Rss,
  ListChecks,
  Zap,
  Target,
  Package,
  Sparkles,
  Megaphone,
  PhoneCall,
  PanelLeftClose,
  PanelLeftOpen,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { RELEASE_MODE, HOME_PATH, isReleased } from "@/lib/release";

// One flat, scannable list — no section headers, no scrolling. Reference/tool
// pages (Knowledge base, Service catalog, Recordings) live in the account menu;
// the agent's queue is a tab inside Agent; notifications are the topbar bell.
// Offerings sits high — right under Dashboard — because Suren's north star is
// offerings-first ("offerings is module #1; I want to start with offerings; a
// sales guy comes in and looks at the offer"). The repository of what we sell
// shouldn't be buried below pipeline/forecast/customers.
const ALL_NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/agent", label: "Agent", icon: Sparkles },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/offerings", label: "Offerings", icon: Package },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/forecast", label: "Forecast", icon: Target },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/sequences", label: "Sequences", icon: Zap },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/voice", label: "Voice agents", icon: PhoneCall },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/activity", label: "Activity", icon: Rss },
];

// Release gating (Suren): the first Freyr rollout shows ONLY production-ready
// modules — everything else stays hidden until it's released.
const NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => isReleased(i.href));

const COLLAPSE_KEY = "freyr.sidebar.collapsed";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  // exact match so /agent doesn't also light up on /agent/inbox
  if (href === "/agent") return pathname === "/agent";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
} = {}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  // restore persisted collapse state after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  // live count of everything needing the rep — approvals + sent-back reworks
  // (V9 agent inbox badge, #69)
  useEffect(() => {
    let alive = true;
    fetch("/api/agent/inbox")
      .then((r) => r.json())
      .then(
        (d) =>
          alive && setInboxCount((d.needsApproval || 0) + (d.reworks || 0))
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const navLink = (item: { href: string; label: string; icon: LucideIcon }) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const badge = item.href === "/agent" && inboxCount > 0 ? inboxCount : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onMobileClose}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex items-center gap-3 py-1.5 rounded-md text-[14px] border-l-[3px] transition-colors",
          collapsed ? "justify-center px-0" : "pl-3 pr-3",
          active
            ? "border-blue-primary bg-blue-light text-blue-primary font-semibold"
            : "border-transparent text-text-secondary hover:bg-surface"
        )}
      >
        <span className="relative shrink-0">
          <Icon size={20} strokeWidth={1.5} />
          {collapsed && badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-warning ring-2 ring-white" />
          )}
        </span>
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span className="text-[11px] font-bold tnum px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "border-r border-border-light bg-white flex flex-col py-6 transition-transform duration-200 overflow-y-auto",
        // mobile: fixed off-canvas drawer
        "fixed inset-y-0 left-0 z-[60] w-[260px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // desktop: in-flow, sticky, collapsible
        "lg:sticky lg:top-0 lg:self-start lg:z-50 lg:translate-x-0 lg:shrink-0 lg:min-h-screen lg:transition-[width]",
        collapsed ? "lg:w-[72px]" : "lg:w-[240px]"
      )}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "mb-6 flex items-center",
          collapsed ? "px-0 flex-col gap-3" : "px-6 justify-between"
        )}
      >
        <Link href={HOME_PATH} className="flex items-center gap-2.5" title="Freyr">
          <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
            <Activity size={18} strokeWidth={2.25} />
          </span>
          {!collapsed && (
            <span className="leading-none">
              <span className="block text-[18px] font-bold text-text-primary leading-none">
                Freyr
              </span>
              <span className="block text-[10px] font-semibold tracking-[0.12em] text-text-tertiary mt-1">
                SALES INTELLIGENCE
              </span>
            </span>
          )}
        </Link>
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen size={18} strokeWidth={1.7} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.7} />
          )}
        </button>
      </div>

      {/* New Session CTA — hidden in the offerings-only rollout (intake isn't released) */}
      {RELEASE_MODE === "all" && (
      <div className={cn("mb-5", collapsed ? "px-3" : "px-4")}>
        <button
          onClick={() => router.push("/intake")}
          title={collapsed ? "New Session" : undefined}
          className={cn(
            "w-full py-2 bg-blue-primary text-white rounded-lg flex items-center justify-center gap-2 text-[14px] font-semibold hover:bg-blue-hover transition-all active:scale-[0.98] shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:shadow-[0_4px_14px_rgba(0,113,227,0.32)]",
            collapsed ? "px-0" : "px-4"
          )}
        >
          <Plus size={18} strokeWidth={2.25} />
          {!collapsed && "New Session"}
        </button>
      </div>
      )}

      {/* Nav */}
      <nav aria-label="Primary" className="flex-1 px-3 overflow-y-auto">
        <div className="space-y-0.5">{NAV_ITEMS.map(navLink)}</div>
      </nav>

      {/* Footer: settings + profile */}
      <div className="mt-auto px-3 pt-4 border-t border-border-light space-y-0.5">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 py-2 rounded-md text-[14px] border-l-[3px] transition-colors",
            collapsed ? "justify-center px-0" : "pl-3 pr-3",
            isActive(pathname, "/settings")
              ? "border-blue-primary bg-blue-light text-blue-primary font-semibold"
              : "border-transparent text-text-secondary hover:bg-surface"
          )}
        >
          <Settings size={20} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && "Settings"}
        </Link>
        <div
          className={cn(
            "flex items-center gap-3 py-2",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <Avatar name="Suren Dheen" className="w-8 h-8 text-[12px] shrink-0" />
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-[13px] text-text-primary font-medium">Suren Dheen</p>
              <p className="text-[11px] text-text-tertiary">Senior Sales Rep</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
