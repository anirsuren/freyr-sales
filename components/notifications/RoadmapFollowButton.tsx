"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * THE SUBSCRIBE SWITCH, ON THE THING ITSELF.
 *
 * "There should be an option to subscribe for those notifications if there is
 * any change" (product owner via Anir, Aug 21). It lives on the roadmap it
 * subscribes to, because a settings page somewhere else is a place people
 * never go — you follow a component while you are looking at the component.
 *
 * It says what it will do in plain words rather than "subscribed": what a
 * person wants to know is whether an email is coming.
 */
export function RoadmapFollowButton({
  kind,
  id,
  compact,
}: {
  kind: "component" | "offering";
  id: string;
  compact?: boolean;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [everything, setEverything] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/roadmap-subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.subscription) return;
        const key = kind === "component" ? "componentIds" : "offeringIds";
        setFollowing((data.subscription[key] as string[]).includes(id));
        setEverything(data.subscription.everything === true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [kind, id]);

  // Until the answer is back the control has no state to show, and a switch
  // that renders "off" and then flips itself on is worse than a beat of
  // nothing.
  if (following === null) return null;

  const on = following || everything;

  async function toggle() {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    try {
      const res = await fetch("/api/roadmap-subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow: { kind, id, on: next } }),
      });
      if (!res.ok) setFollowing(!next);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip
      label={
        everything && !following
          ? "You already get every roadmap change by email"
          : on
            ? "You get an email when this roadmap changes. Click to stop."
            : "Get an email when this roadmap changes"
      }
    >
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors disabled:opacity-60",
          compact ? "h-8 px-2.5" : "h-9 px-3",
          on
            ? "border-blue-subtle bg-blue-light text-blue-primary"
            : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
        )}
      >
        {on ? (
          <BellRing size={14} strokeWidth={2.2} />
        ) : (
          <Bell size={14} strokeWidth={2.2} />
        )}
        {on ? "Notifying you" : "Notify me"}
      </button>
    </Tooltip>
  );
}
