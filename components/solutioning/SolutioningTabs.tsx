"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Inbox, CalendarClock,
  LayoutTemplate } from "lucide-react";
import { PageTabs } from "@/components/ui/PageTabs";

/**
 * THE THREE SOLUTIONING ROOMS, AS ONE SELECTOR.
 *
 * Anir, Aug 27: "we need the ability to switch between requests, submissions
 * and presentations, and they need to be animated. Look at what you did for
 * the goals page — org performance, group performance, people performance. It
 * should be the exact same thing."
 *
 * So it is the same control, not a lookalike: PageTabs, the component
 * Performance, Market Intel and Admin already use. Getting between the rooms
 * meant the sidebar's sub-links, which only appear once you are already in
 * the module — from Requests you could not see that Submissions existed.
 */
const TABS = [
  {
    key: "requests",
    label: "Solution requests",
    href: "/solutioning",
    icon: Inbox,
    color: "#0071E3",
    subtitle:
      "What sales has asked the Solutioning team for: a submission, a presentation or a meeting.",
  },
  {
    key: "submissions",
    label: "Submissions",
    href: "/solutioning?tab=submissions",
    icon: FileCheck2,
    color: "#0891B2",
    subtitle: "RFI, RFP and proposal submissions being put together.",
  },
  {
    key: "presentations",
    label: "Presentations",
    href: "/solutioning?tab=presentations",
    icon: LayoutTemplate,
    color: "#7C3AED",
    subtitle: "Decks and demos being prepared for a customer meeting.",
  },
  /* THE FOURTH ROOM (Anir, Aug 28: "you added the meetings thing, but there's
     no fourth thing at the top right, so you got to fix that"). It is a route
     of its own rather than a ?tab= of this one, because a meeting is its own
     object with its own store — but it belongs in this strip, because this is
     where somebody standing in Solutioning goes looking for it. */
  {
    key: "meetings",
    label: "Meetings",
    href: "/meetings",
    icon: CalendarClock,
    color: "#B4318F",
    subtitle: "Customer meetings: who was in the room, and what came out of it.",
  },
];

export function SolutioningTabs({
  active,
  action,
  children,
}: {
  active: string;
  /** The header's right side — the room's own New button. */
  action?: React.ReactNode;
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
      {/* NO ENTRANCE ANIMATION ON THE STRIP — EVER (the performance-pills
          lesson, Aug 17). All three rooms render the same component, so a
          switch remounts it; an entrance class here would replay on the pills
          every time and "everything goes haywire". The strip renders
          already-settled and only the keyed panel below animates. */}
      <div className="relative z-40 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="relative">
            {/* The pills carry the page name, so a visible h1 would say it
                twice. Kept for screen readers, exactly as Performance does. */}
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
        <p className="mt-1 text-[13px] text-text-secondary">{current.subtitle}</p>
      </div>

      {switching ? (
        <SolutioningSkeleton />
      ) : (
        /* Keyed by room, so each pick replays the entrance while the pills
           above sit outside it and never move. */
        <div key={active} className="tab-panel">
          {children}
        </div>
      )}
    </>
  );
}

/** Content-shaped placeholder, so a pick reads as loading rather than blank. */
function SolutioningSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-[56px] rounded-xl bg-surface" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[70px] rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
