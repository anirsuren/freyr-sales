import Link from "next/link";
import { Building2, Globe2, Swords, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three buckets from the Aug 11 call: customer intelligence, competitor
 * intelligence, market intelligence. One pill row, URL-driven so every tab is
 * linkable and the server renders exactly one bucket.
 */
const TABS: { key: string; label: string; href: string; icon: LucideIcon }[] = [
  { key: "customers", label: "Customer Intelligence", href: "/market-intel", icon: Building2 },
  { key: "competitors", label: "Competitor Intelligence", href: "/market-intel?tab=competitors", icon: Swords },
  { key: "market", label: "Market Intelligence", href: "/market-intel?tab=market", icon: Globe2 },
];

export function MiTabs({ active }: { active: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {TABS.map((tab) => {
        const TIcon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              isActive
                ? "border-transparent bg-blue-primary text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)]"
                : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
            )}
          >
            <TIcon size={14} strokeWidth={2.2} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
