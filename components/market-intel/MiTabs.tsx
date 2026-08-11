"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, Loader2, Swords, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three buckets from the Aug 11 call. The click answers INSTANTLY (Anir:
 * "let me click on the tab instantly"): the pill flips optimistically and
 * wears a spinner while the server streams the new bucket in; the server's
 * answer reconciles the state when it lands. Sibling tabs are prefetched so
 * the wait is usually a blink.
 */
const TABS: { key: string; label: string; href: string; icon: LucideIcon }[] = [
  { key: "customers", label: "Customer Intelligence", href: "/market-intel", icon: Building2 },
  { key: "competitors", label: "Competitor Intelligence", href: "/market-intel?tab=competitors", icon: Swords },
  { key: "market", label: "Market Intelligence", href: "/market-intel?tab=market", icon: Globe2 },
];

export function MiTabs({ active }: { active: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState<string | null>(null);

  // The server's answer is the truth once it arrives.
  useEffect(() => {
    setClicked(null);
  }, [active]);

  useEffect(() => {
    for (const tab of TABS) {
      if (tab.key !== active) router.prefetch(tab.href);
    }
  }, [active, router]);

  const current = clicked ?? active;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {TABS.map((tab) => {
        const isActive = tab.key === current;
        const loading = isPending && clicked === tab.key;
        const TIcon = loading ? Loader2 : tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (tab.key === current) return;
              setClicked(tab.key);
              startTransition(() => router.push(tab.href, { scroll: false }));
            }}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              isActive
                ? "border-transparent bg-blue-primary text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)]"
                : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
            )}
          >
            <TIcon
              size={14}
              strokeWidth={2.2}
              className={loading ? "animate-spin" : undefined}
            />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
