"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  FileSignature,
  CalendarRange,
  UserPlus,
  FolderOpen,
  Radar,
  LayoutDashboard,
  CalendarClock,
  Columns3,
  Briefcase,
  Building2,
  Contact,
  UsersRound,
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
  Boxes,
  Gauge,
  ShieldCheck,
  CircleUserRound,
  ClipboardList,
  Swords,
  Globe2,
  Inbox,
  FileUp,
  LayoutTemplate,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import type { DataMode } from "@/lib/dataMode";
import { getHomePath, isOfferingsOnly, isReleased } from "@/lib/release";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  useCurrentUser,
  useMyPhoto,
} from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";

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
  { href: "/components", label: "FDL Components", icon: Boxes },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/forecast", label: "Forecast", icon: Target },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  // Requests for presentations, submissions and meetings — sales asks, the
  // Solutions role fulfils (Suren, Aug 24). Sits by Opportunities because
  // that is what most requests are against.
  { href: "/solutioning", label: "Solutioning", icon: ClipboardList },
  /* THE AUG 25 MODULES, in the order the work actually flows: a lead becomes
     an opportunity, an opportunity plans its accrued revenue, and a contract
     is where sales closes it. All three are admin-only for now
     (lib/moduleAccess NEW_MODULES_ADMIN_ONLY). */
  { href: "/leads", label: "Leads", icon: UserPlus },
  { href: "/revenue-accruals", label: "Revenue Accruals", icon: CalendarRange },
  { href: "/contracts", label: "Contracts", icon: FileSignature },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/sequences", label: "Sequences", icon: Zap },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/voice", label: "Voice agents", icon: PhoneCall },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  /* Suren, Aug 25: "we are calling it Performance but I don't want to call
     it performance — it's a goal view, the view is based on goals, it's
     actually Goals." The URL stays /performance so every bookmark, deep
     link and shared goal URL keeps working; /goals redirects here. */
  { href: "/performance", label: "Goals", icon: Gauge },
  { href: "/market-intel", label: "Market Intel", icon: Radar },
  { href: "/activity", label: "Activity", icon: Rss },
  // Running the workspace — user groups and system status. Its own page in
  // the nav, not buried in the account menu (Anir, Aug 12: "there has to be
  // an admin tab, like a page").
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

// Release gating (Suren): the first Freyr rollout shows ONLY production-ready
// modules — everything else stays hidden until it's released.
const COLLAPSE_KEY = "freyr.sidebar.collapsed";

// Every page must light up a sidebar section so you always know where you are
// (Suren, Jul 9: "every page should show up in the sidebar"). Detail routes
// that have no nav item of their own map to their parent section here.
const ROUTE_PARENT: { prefix: string; nav: string }[] = [
  { prefix: "/deals", nav: "/pipeline" }, // deals live under Pipeline
  { prefix: "/intake", nav: "/sessions" }, // starting a session
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  if (pathname === href || pathname.startsWith(href + "/")) return true;
  // Orphan detail pages → highlight their parent nav item.
  const parent = ROUTE_PARENT.find((r) => pathname.startsWith(r.prefix));
  return parent ? parent.nav === href : false;
}

export function Sidebar({
  dataMode,
  mobileOpen = false,
  onMobileClose,
}: {
  dataMode: DataMode;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname() || "";
  const currentUser = useCurrentUser();
  /** Market Intel picks its room with ?tab=, so the sidebar has to read it. */
  const search = useSearchParams().toString();
  // The signed-in user's uploaded picture, shared by every avatar of them.
  const { photo: myPhoto } = useMyPhoto();
  const offeringsOnly = isOfferingsOnly(dataMode);
  // Released for this rollout AND open to this person's role — a Sales Rep
  // never sees a module they cannot open (Freyr, Aug 12).
  const navItems = ALL_NAV_ITEMS.filter(
    (item) =>
      isReleased(item.href, dataMode) &&
      canAccessModule(item.href, currentUser.role)
  );
  const [collapsed, setCollapsed] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const collapseStorageKey = userScopedStorageKey(COLLAPSE_KEY, currentUser.id);

  // restore persisted collapse state after mount (avoids hydration mismatch)
  useEffect(() => {
    setCollapsed(false);
    try {
      setCollapsed(localStorage.getItem(collapseStorageKey) === "1");
    } catch {}
  }, [collapseStorageKey]);

  // live count of everything needing the rep — approvals + sent-back reworks
  // (V9 agent inbox badge, #69)
  useEffect(() => {
    if (offeringsOnly) return;
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
  }, [offeringsOnly, pathname]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(collapseStorageKey, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const navLink = (item: { href: string; label: string; icon: LucideIcon }) => {
    /* Meetings is a room of Solutioning in the nav but a route of its own, so
       the parent has to answer for it — otherwise opening a meeting leaves
       nothing in the sidebar lit and the four sub-items vanish. */
    const active =
      isActive(pathname, item.href) ||
      (item.href === "/solutioning" && isActive(pathname, "/meetings"));
    const Icon = item.icon;
    const badge = item.href === "/agent" && inboxCount > 0 ? inboxCount : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        data-tour={`nav-${item.href.slice(1).replaceAll("/", "-")}`}
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
            <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-warning ring-2 ring-[color:var(--white)]" />
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

  /** An indented child of the item above it, quieter than a top-level row. */
  const subNavLink = (item: { href: string; label: string; icon: LucideIcon }) => {
    /* Market Intel's rooms are query strings on one route, so comparing paths
       alone would light all three at once. Compare what is in the address bar:
       the path for a real sub-route, the path AND its ?tab= for a room. */
    const [itemPath, itemQuery = ""] = item.href.split("?");

    /* A RECORD BELONGS TO THE ROOM YOU OPENED IT FROM (Anir, Aug 28: "when I
       click on a presentation from the table it takes me to the presentation
       but it takes me to the REQUESTS sidebar page").

       A solutioning record lives at /solutioning/<id> with no ?tab=, so the
       Requests entry — whose href is the bare /solutioning — matched it on the
       startsWith branch and lit up, whichever room you had actually come from.
       Every presentation and every submission read as a request the moment you
       opened it.

       So the room travels with the link: the tables append ?tab= to the record
       href, and the comparison reads that tab rather than the whole query
       string. A record opened from outside solutioning carries no tab and
       lights nothing, which is honest — better a quiet sidebar than a wrong
       one. */
    const tabOf = (q: string) => new URLSearchParams(q).get("tab") ?? "";
    const itemTab = tabOf(itemQuery);
    const hereTab = tabOf(search ?? "");
    const isChild = pathname.startsWith(itemPath + "/");

    const active =
      itemPath === "/solutioning"
        ? (pathname === itemPath || isChild) && hereTab === itemTab
        : itemQuery || search
          ? pathname === itemPath && (search ?? "") === itemQuery
          : pathname === itemPath || isChild;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onMobileClose}
        aria-current={active ? "page" : undefined}
        className={cn(
          /* Indent tightened so "Competitor Intelligence" fits WHOLE on its
             one line — an ellipsis in a four-item nav is a word nobody can
             read, not a saving. */
          "ml-4 flex items-center gap-2 rounded-md border-l-[3px] py-1.5 pl-2.5 pr-2 text-[12.5px] transition-colors",
          active
            ? "border-blue-primary bg-blue-light font-semibold text-blue-primary"
            : "border-transparent text-text-secondary hover:bg-surface"
        )}
      >
        <Icon size={16} strokeWidth={1.6} className="shrink-0" />
        {/* ONE LINE PER SUB-LINK (Anir, Aug 27: "I want these on one line,
            like each"). "Competitor Intelligence" was wrapping into a
            two-storey pill; nowrap plus truncate keeps every room a single
            row however narrow the rail gets. */}
        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        "border-r border-border-light bg-white flex flex-col py-6 transition-transform duration-200 overflow-y-auto",
        // mobile: fixed off-canvas drawer
        "fixed inset-y-0 left-0 z-[60] w-[260px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // desktop: in-flow, sticky, collapsible
        "lg:sticky lg:top-0 lg:z-50 lg:h-full lg:min-h-0 lg:translate-x-0 lg:shrink-0 lg:transition-[width]",
        collapsed ? "lg:w-[72px]" : "lg:w-[240px]"
      )}
    >
      {/* Logo + collapse toggle. The gap below is the brand-to-nav rhythm now
          that nothing sits between them, one clean step, not the leftover
          hole where the CTA used to be. */}
      <div
        className={cn(
          "mb-5 flex items-center",
          collapsed ? "px-0 flex-col gap-3" : "px-6 justify-between"
        )}
      >
        <Link href={getHomePath(dataMode)} className="flex items-center gap-2.5" title="Freyr">
          {/* The Freyr "f" mark, not a generic pulse glyph — the brand's own
              letterform on the wordmark's blue (Anir, Jul 26: "it should just be
              the F… you can put that instead of the logo"). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/freyr-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
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

      {/* No New Session CTA here. Starting a session is an action that belongs
          to the Sessions page, not a button pinned above the nav on every
          screen, pressing it from Teams threw you out of Teams (Suren, Jul 27:
          "if I'm on the Teams page and I press New Session, that's kind of a
          problem… that should just stay on the sessions page. That way, you can
          move all the shit in the sidebar up too"). See
          components/sessions/NewSessionLauncher.tsx. */}

      {/* Nav */}
      <nav aria-label="Primary" className="flex-1 px-3 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <Fragment key={item.href}>
              {navLink(item)}
              {/* SALES MATERIALS IS A SUBPAGE OF OFFERINGS (Anir, Aug 21, on
                  the call, answering the reps' most repeated ask — "is there a
                  shorter way to reach the sales materials?": "I'll just have
                  it within Offerings as a subpage. You click Offerings, and
                  then it'll show a subpage on the sidebar — Sales Materials").
                  It appears once you are inside Offerings, indented under it,
                  so the sidebar does not grow a permanent extra row for
                  everyone who is somewhere else. */}
              {item.href === "/offerings" &&
                !collapsed &&
                isActive(pathname, "/offerings") &&
                subNavLink({
                  href: "/offerings/materials",
                  label: "Sales Materials",
                  icon: FolderOpen,
                })}

              {/* THE SAME IDIOM FOR THE OTHER TWO MODULES THAT HAVE ROOMS
                  (Anir, Aug 23: "when I click on Performance, the same way
                  you have Sales Material within Offerings, I want the tabs to
                  show up in the sidebar" — then "same thing for market
                  intelligence too").

                  Both modules keep their in-page tab strip; this is a second
                  door, so you can jump straight to the room you want from
                  wherever you are rather than landing on one and switching.
                  Only while you are inside the module, and only what your
                  role may open — a rep gets People performance and Goal
                  Master, which is exactly the two rooms they have. */}
              {item.href === "/performance" &&
                !collapsed &&
                isActive(pathname, "/performance") &&
                (currentUser.role !== "rep"
                  ? [
                      { href: "/performance/org", label: "Org performance", icon: Gauge },
                      { href: "/performance/groups", label: "Group performance", icon: UsersRound },
                      { href: "/performance/people", label: "People performance", icon: CircleUserRound },
                      { href: "/performance/goal-master", label: "Goal Master", icon: ClipboardList },
                    ]
                  : [
                      { href: "/performance/people", label: "People performance", icon: CircleUserRound },
                      { href: "/performance/goal-master", label: "Goal Master", icon: ClipboardList },
                    ]
                ).map(subNavLink)}

              {/* THE FOUR ROOMS UNDER SOLUTIONING (Anir, Aug 26: "you're
                  supposed to have the thing where it says under solutioning
                  the three things, like goals"; and Aug 28: "Meetings have to
                  be a fourth submodule, by the way"). Suren's shape: what
                  people ASKED for, what is being submitted, what is being
                  presented, and the meetings themselves.

                  Meetings keeps its own route and its own store — it is a
                  different object, not a filter on requests — and simply
                  lives here in the nav, because this is where somebody goes
                  looking for it. `isActive` covers /meetings too, so the
                  parent stays open while you are on one. */}
              {item.href === "/solutioning" &&
                !collapsed &&
                (isActive(pathname, "/solutioning") || isActive(pathname, "/meetings")) &&
                [
                  { href: "/solutioning", label: "Solution requests", icon: Inbox },
                  { href: "/solutioning?tab=submissions", label: "Submissions", icon: FileUp },
                  { href: "/solutioning?tab=presentations", label: "Presentations", icon: LayoutTemplate },
                  { href: "/meetings", label: "Meetings", icon: CalendarClock },
                ].map(subNavLink)}

              {item.href === "/market-intel" &&
                !collapsed &&
                isActive(pathname, "/market-intel") &&
                [
                  { href: "/market-intel", label: "Customer Intelligence", icon: Building2 },
                  { href: "/market-intel?tab=competitors", label: "Competitor Intelligence", icon: Swords },
                  { href: "/market-intel?tab=market", label: "Market Intelligence", icon: Globe2 },
                ].map(subNavLink)}
            </Fragment>
          ))}
        </div>
      </nav>

      {/* Footer: settings + profile */}
      <div className="mt-auto px-3 pt-4 border-t border-border-light space-y-0.5">
        {/* Settings moved to the account menu, top right, where a person
            looks for their own profile (Anir, Jul 29: "I don't see a point in
            having settings at the bottom left"). */}
        {!offeringsOnly && (
        <Link
          href="/settings?tab=profile"
          title={collapsed ? `${currentUser.name}: profile` : undefined}
          className={cn(
            "flex items-center gap-3 py-2 rounded-md transition-colors hover:bg-surface",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <Avatar src={myPhoto} name={currentUser.name} className="w-8 h-8 text-[12px] shrink-0" />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <p className="text-[13px] text-text-primary font-medium truncate">{currentUser.name}</p>
              <p className="text-[11px] text-text-tertiary truncate">
                {currentUser.email || currentUser.title}
              </p>
            </div>
          )}
        </Link>
        )}
      </div>
    </aside>
  );
}
