"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, Loader2, Swords } from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";

/**
 * The three intelligence buckets as ONE dropdown (Anir: "I don't like the
 * three pills... have a dropdown") — the house ColorSelect, color and icon
 * per bucket. Picking answers instantly: the trigger flips optimistically,
 * the content swaps to a loading skeleton, and the server's bucket streams
 * in. Siblings are prefetched so the wait is usually a blink.
 */
const TABS = [
  { key: "customers", label: "Customer Intelligence", href: "/market-intel", icon: Building2, color: "#0071E3" },
  { key: "competitors", label: "Competitor Intelligence", href: "/market-intel?tab=competitors", icon: Swords, color: "#B4318F" },
  { key: "market", label: "Market Intelligence", href: "/market-intel?tab=market", icon: Globe2, color: "#6D28D9" },
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
  children,
}: {
  active: string;
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

  const current = clicked ?? active;
  const switching = isPending && clicked !== null && clicked !== active;

  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <ColorSelect
          value={current}
          onChange={(key) => {
            if (key === current) return;
            const tab = TABS.find((t) => t.key === key);
            if (!tab) return;
            setClicked(key);
            startTransition(() => router.push(tab.href, { scroll: false }));
          }}
          ariaLabel="Choose an intelligence bucket"
          minWidth={235}
          options={TABS.map((tab) => ({
            value: tab.key,
            label: tab.label,
            color: tab.color,
            icon: tab.icon,
          }))}
        />
        {switching && (
          <Loader2
            size={15}
            strokeWidth={2.2}
            className="animate-spin text-blue-primary"
          />
        )}
      </div>
      {switching ? <MiContentSkeleton /> : children}
    </>
  );
}
