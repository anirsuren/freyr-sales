import {
  FileSignature,
  CalendarRange,
  UserPlus,
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
  LucideIcon,
  Boxes,
  Gauge,
  ShieldCheck,
  ClipboardList,
  FilePlus2,
  Bell,
  Settings,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * THE MODULE LIST. ONE COPY, BECAUSE TWO COPIES DRIFT.
 *
 * The rail and the search box both offer "go to a page", and they used to keep
 * separate lists of what the pages were. That is a bug with a schedule: it goes
 * wrong every time a module ships, because whoever adds it to the rail has no
 * reason to think there is a second list somewhere else.
 *
 * It went wrong on Aug 16 (the rail offered eight modules and search could jump
 * to two), was fixed by giving both surfaces the same release gate, and went
 * wrong again the same way — the five newest modules (Opportunities,
 * Solutioning, Leads, Revenue Accruals, Contracts) reached the rail and never
 * reached search, so a person looking at Contracts in the sidebar could not
 * type "contracts" to get there.
 *
 * Sharing the gate was not enough because the LIST was still duplicated. This
 * is the list. Adding a module here puts it in both places at once, and there
 * is nowhere else to forget.
 *
 * Order is the rail's order: the work as it actually flows.
 */
export const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/agent", label: "Agent", icon: Sparkles },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/offerings", label: "Offerings", icon: Package },
  { href: "/components", label: "FDL Components", icon: Boxes },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/forecast", label: "Forecast", icon: Target },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  // Requests for presentations, submissions and meetings — sales asks, the
  // Solutioning Member fulfils (Suren, Aug 24). Sits by Opportunities because
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

/**
 * Typeable, but not a rail item.
 *
 * Your own settings and your own notifications are not modules — they hang off
 * the account menu and the bell, so they have no place in the rail, but "jump
 * to a page" should still find them. The two unreleased pages below stay behind
 * the same release gate as everything else; they appear the day they ship.
 */
export const PALETTE_ONLY_ITEMS: NavItem[] = [
  { href: "/intake", label: "New Session", icon: FilePlus2 },
  { href: "/services", label: "Service Catalog", icon: Package },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
