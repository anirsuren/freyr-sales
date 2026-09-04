"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * WHAT YOU MAY DO HERE, SAID ON EVERY PAGE.
 *
 * Anir, Aug 31: "if I'm at the top of a page, I want to see on this page what
 * my edit access is, but I don't want you to just say it. I want it to be kind
 * of like a question mark, not actually a question mark, but the same idea.
 * When I hover over it... I can see what my permissions are on this page. I
 * want that on every single page, depending on my account."
 *
 * A SHIELD RATHER THAN A "?". The question mark means "here is an explanation
 * of this thing"; this is a fact about YOU, and it changes per person and per
 * page. A shield says access at a glance, and its colour carries the answer
 * before the hover does — so somebody who never hovers still learns something.
 *
 * IT LIVES IN THE TOP BAR, NOT IN EACH PAGE HEADER. "Every single page" means
 * every single page, and the way to guarantee that is one insertion point that
 * every route already renders, rather than a prop nineteen pages have to
 * remember to pass. A page that is not a module (settings, notifications, the
 * tour) has no rule to report, and the badge simply does not appear — a lock
 * icon on a page with no lock is noise.
 *
 * THE ANSWER COMES FROM THE GUARDS' OWN RESOLVER. /api/my-access asks
 * viewerAccessMap, which is what every server guard asks, so the badge cannot
 * drift from the buttons around it. It reports; it never decides.
 */

type Access = "none" | "view" | "edit" | "create";

type Answer = {
  known: boolean;
  module?: string;
  level?: Access;
  headline?: string;
  detail?: string;
  role?: string;
  fallback?: boolean;
};

const LOOK: Record<
  Access,
  { icon: typeof Shield; tint: string; word: string }
> = {
  /* Not red/amber/green as a scale — these are states, not health. Blue is the
     app's "this is yours to use", teal its quieter cousin, and the muted one
     reads as closed without shouting. */
  create: { icon: ShieldCheck, tint: "text-[color:var(--ink-green)]", word: "Full access" },
  edit: { icon: ShieldCheck, tint: "text-blue-primary", word: "Can edit" },
  view: { icon: ShieldAlert, tint: "text-text-tertiary", word: "View only" },
  none: { icon: ShieldX, tint: "text-text-tertiary", word: "No access" },
};

export function AccessHint() {
  const pathname = usePathname();
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnswer(null);
    fetch(`/api/my-access?path=${encodeURIComponent(pathname || "/")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setAnswer(d as Answer);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /* Nothing until the answer is known: a shield that appears saying one thing
     and changes its mind a moment later is worse than a shield that waits. */
  if (!answer?.known || !answer.level) return null;

  const look = LOOK[answer.level];
  const Icon = look.icon;

  return (
    <Tooltip
      side="bottom"
      align="right"
      label={
        <span className="block max-w-[280px] text-left">
          <span className="block text-[12.5px] font-semibold text-white">
            {answer.headline}
          </span>
          <span className="mt-1 block text-[11.5px] leading-snug text-white/75">
            {answer.detail}
          </span>
          {answer.fallback && (
            <span className="mt-1.5 block text-[11px] leading-snug text-white/60">
              The permissions table could not be read just now, so this is your
              role&apos;s default rather than your settings.
            </span>
          )}
        </span>
      }
    >
      <button
        type="button"
        aria-label={`${look.word} on ${answer.module}`}
        className={cn(
          "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface",
          look.tint
        )}
      >
        <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
