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

/**
 * The rail's own headings (Anir, Sep 4, with the grouping drawn out). The flat
 * list had grown to fourteen items and read as one undifferentiated column;
 * these say what a module is FOR before you read its name. Order matters: this
 * is the order the sections appear in.
 */
export const NAV_SECTIONS = [
  "Knowledge & materials",
  "Sales",
  "Performance",
  "Administration",
] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which heading it sits under. Agent has none — it stands above them all. */
  section?: NavSection;
};

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
  /* ORDERED BY SECTION (Anir, Sep 4). The sections are declared in
     NAV_SECTIONS above and the rail draws a heading wherever the section
     changes, so this order IS the rail's order — moving an item between
     groups means moving its line here. */
  { href: "/agent", label: "Agent", icon: Sparkles },
  { href: "/offerings", label: "Offerings", icon: Package, section: "Knowledge & materials"  },
  { href: "/components", label: "FDL Components", icon: Boxes, section: "Knowledge & materials"  },
  { href: "/market-intel", label: "Market Intel", icon: Radar, section: "Knowledge & materials"  },
  { href: "/leads", label: "Leads", icon: UserPlus, section: "Sales"  },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase, section: "Sales"  },
  { href: "/solutioning", label: "Solutioning", icon: ClipboardList, section: "Sales"  },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "Sales"  },
  { href: "/customers", label: "Customers", icon: Building2, section: "Sales"  },
  { href: "/performance", label: "Goals", icon: Gauge, section: "Performance"  },
  { href: "/revenue-accruals", label: "Revenue Accruals", icon: CalendarRange, section: "Performance"  },
  { href: "/reports", label: "Reports", icon: FileBarChart, section: "Performance"  },
  { href: "/team", label: "Team", icon: UsersRound, section: "Administration"  },
  { href: "/admin", label: "Admin", icon: ShieldCheck, section: "Administration"  },
  /* Not on the rail today: unreleased modules the gate filters out, kept
     so search can still jump to them where they are released. */
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/forecast", label: "Forecast", icon: Target },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/sequences", label: "Sequences", icon: Zap },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/voice", label: "Voice agents", icon: PhoneCall },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { href: "/activity", label: "Activity", icon: Rss },
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
