"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, Swords } from "lucide-react";
import { PageTabs } from "@/components/ui/PageTabs";

/**
 * The three intelligence buckets, as a segmented selector rather than a
 * dropdown behind the title (Anir, Aug 15: "I need the selector instead of
 * the drop-down at the top for the three pages"). Same control as Performance,
 * so the two modules move the same way: all three destinations visible, one
 * click to any of them.
 *
 * Picking one flips the pill instantly, swaps the content for a loading
 * skeleton, and the server's bucket streams in. Siblings are prefetched so the
 * wait is usually a blink.
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

  // The server's answer is the truth once it arrives.
  useEffect(() => {
    setClicked(null);
  }, [active]);

  useEffect(() => {
    for (const tab of TABS) {
      if (tab.key !== active) router.prefetch(tab.href);
    }
  }, [active, router]);

  const current = TABS.find((t) => t.key === (clicked ?? active)) ?? TABS[0];
  const switching = isPending && clicked !== null && clicked !== active;

  return (
    <>
      {/* NO ENTRANCE ANIMATION HERE — EVER (the performance-pills lesson,
          Aug 17). The market bucket renders a DIFFERENT tree than the other
          two, so switching to or from it REMOUNTS this whole component; any
          entrance class here replays on the pill strip and "everything goes
          haywire". The strip renders already-settled; only the keyed
          tab-panel below animates. */}
      <div className="relative z-40 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative">
          {/* The pills carry the page name, so the visible h1 would say it
              twice. Kept for screen readers and the document outline, exactly
              as Performance does it. */}
          <h1 className="sr-only">{current.label}</h1>
          <PageTabs
            tabs={TABS}
            active={current.key}
            pending={switching ? current.key : null}
            onSelect={(key) => {
              if (key === current.key) return;
              const next = TABS.find((t) => t.key === key);
              if (!next) return;
              setClicked(key);
              startTransition(() => router.push(next.href, { scroll: false }));
            }}
          />
        </div>
        {action && <div className="shrink-0">{action}</div>}
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          {current.subtitle}
        </p>
      </div>
      {/* The bucket's content ENTERS instead of popping (Anir, Aug 17: the
          switch to Market Intelligence "is not good. Look at that animation").
          Keyed by bucket so each pick replays the entrance; the pill row above
          sits outside and never moves. */}
      {switching ? (
        <MiContentSkeleton />
      ) : (
        <div key={active} className="tab-panel">
          {children}
        </div>
      )}
    </>
  );
}
