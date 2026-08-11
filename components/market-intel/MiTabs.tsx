"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
  Globe2,
  Loader2,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The page title IS the bucket picker (Anir: "at the top where it says
 * Market Intelligence, that's where the dropdown should be"). The h1 opens a
 * menu of the three intelligence buckets; picking flips the title instantly,
 * swaps the content for a loading skeleton, and the server's bucket streams
 * in. Siblings are prefetched so the wait is usually a blink.
 */
const TABS = [
  {
    key: "customers",
    label: "Customer Intelligence",
    href: "/market-intel",
    icon: Building2,
    color: "#0071E3",
    subtitle:
      "What the market is saying about the customers you track. Real LinkedIn activity, news and signals from the past 3 months.",
  },
  {
    key: "competitors",
    label: "Competitor Intelligence",
    href: "/market-intel?tab=competitors",
    icon: Swords,
    color: "#B4318F",
    subtitle:
      "What your competitors are up to: their LinkedIn activity, news and signals from the past 3 months.",
  },
  {
    key: "market",
    label: "Market Intelligence",
    href: "/market-intel?tab=market",
    icon: Globe2,
    color: "#6D28D9",
    subtitle:
      "What's moving across the regulated industries: mergers and acquisitions, classified by status and division.",
  },
];

/** Content-shaped placeholder shown the instant a bucket is picked, until the
 *  new one streams in (Anir: "it should show the posts loading"). */
function MiContentSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-xl bg-surface" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[260px] rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

export function MiTabs({
  active,
  action,
  children,
}: {
  active: string;
  /** The header's right side (live chip, track button). */
  action?: React.ReactNode;
  /** The bucket's content; swapped for the skeleton while a pick loads. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  // The server's answer is the truth once it arrives.
  useEffect(() => {
    setClicked(null);
  }, [active]);

  useEffect(() => {
    for (const tab of TABS) {
      if (tab.key !== active) router.prefetch(tab.href);
    }
  }, [active, router]);

  useEffect(() => {
    if (!open) return;
    // Capture-phase so a click outside ONLY closes the menu: without the
    // preventDefault, that same click lands on whatever card sits under the
    // menu and drags you off to its page.
    const onClickCapture = (event: MouseEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = TABS.find((t) => t.key === (clicked ?? active)) ?? TABS[0];
  const switching = isPending && clicked !== null && clicked !== active;

  return (
    <>
      <div className="rise-in relative z-40 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div ref={anchorRef} className="relative">
          <h1 className="m-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="group flex cursor-pointer items-center gap-2 rounded-lg text-[24px] font-semibold tracking-[-0.02em] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/35"
          >
            {current.label}
            {switching ? (
              <Loader2
                size={20}
                strokeWidth={2.2}
                className="animate-spin text-blue-primary"
              />
            ) : (
              <ChevronDown
                size={20}
                strokeWidth={2.2}
                className={cn(
                  "text-text-tertiary transition-transform group-hover:text-blue-primary",
                  open && "rotate-180 text-blue-primary"
                )}
              />
            )}
          </button>
          </h1>
          {open && (
            <div
              role="menu"
              className="menu-in absolute left-0 top-full z-50 mt-2 w-[290px] rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
            >
              {TABS.map((tab) => {
                const TIcon = tab.icon;
                const isActive = tab.key === current.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      if (tab.key === current.key) return;
                      setClicked(tab.key);
                      startTransition(() =>
                        router.push(tab.href, { scroll: false })
                      );
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors",
                      isActive ? "bg-blue-light text-text-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"
                    )}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ color: tab.color, background: `${tab.color}14` }}
                    >
                      <TIcon size={15} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">{tab.label}</span>
                    {isActive && (
                      <Check
                        size={15}
                        strokeWidth={2.4}
                        className="shrink-0 text-blue-primary"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          {current.subtitle}
        </p>
      </div>
      {switching ? <MiContentSkeleton /> : children}
    </>
  );
}
