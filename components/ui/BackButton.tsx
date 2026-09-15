"use client";

import { useEffect, useState } from "react";
import { askBeforeLeaving } from "@/lib/unsavedGuard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  addMockModePrefix,
  isMockModePath,
  stripMockModePrefix,
} from "@/lib/modeUrl";

/**
 * EVERY BACK ARROW RETURNS TO WHERE YOU ACTUALLY CAME FROM (Anir, Aug 13:
 * "audit all of your back arrows... you have to fix this once and for all
 * everywhere"). The repeating failure: detail pages hardcoded their parent —
 * open an offering from the heat map, press back, land on "All offerings".
 *
 * The browser cannot answer "where in THIS app did I come from": Next's
 * client navigation keeps `document.referrer` stale, and `history.length`
 * counts whatever tabs the visit started on, so `router.back()` can walk
 * straight out of the app. So the app keeps its own trail:
 *
 * - `NavHistoryTracker` (mounted once in AppShell) appends each in-app
 *   URL to a sessionStorage stack. A query-only change on the same page
 *   REPLACES the top entry rather than pushing, so cycling filters never
 *   becomes ten steps of "back".
 * - `SmartBack` PUSHES the previous stack entry — never `router.back()` —
 *   so back can never leave the app or replay a filter change, and flags
 *   the navigation so the tracker pops instead of re-pushing. Chains work:
 *   heat map → offering → contact walks back exactly the way it came.
 * - No trail (deep link, fresh tab): the caller's `fallback` is the parent
 *   it hardcoded before, so nothing gets worse.
 */

const STACK_KEY = "freyr.navStack";
const BACK_FLAG = "freyr.navBack";
const STACK_MAX = 30;

/** The route stack stores one canonical path. `/mock-mode` describes the data
 * view; it is not a second page and must never make one screen look like two
 * history entries. */
function canonicalLocation(value: string): string {
  return stripMockModePrefix(value);
}

function sameLocation(a: string, b: string): boolean {
  return canonicalLocation(a) === canonicalLocation(b);
}

/** Back targets recorded before or after the rewrite are canonical bare
 * routes. Dress them for the mode visible in this tab before navigating. */
function targetForCurrentMode(value: string): string {
  const target = canonicalLocation(value);
  const here = window.location.pathname;
  return isMockModePath(here) ? addMockModePrefix(target) : target;
}

function readStack(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is string => typeof s === "string")
      .map(canonicalLocation)
      .filter((s, index, all) => index === 0 || s !== all[index - 1]);
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-STACK_MAX)));
  } catch {
    // Blocked storage only costs the trail; fallbacks still work.
  }
}

/** Mounted once in AppShell. Renders nothing. */
export function NavHistoryTracker() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    const canonicalPathname = canonicalLocation(pathname);
    const here = search ? `${canonicalPathname}?${search}` : canonicalPathname;
    try {
      const stack = readStack();
      const wentBack = sessionStorage.getItem(BACK_FLAG) === "1";
      sessionStorage.removeItem(BACK_FLAG);
      if (wentBack && stack.length > 1 && stack[stack.length - 2] === here) {
        stack.pop();
        writeStack(stack);
        return;
      }
      const top = stack[stack.length - 1];
      if (top === here) return;
      if (top && top.split("?")[0] === canonicalPathname) {
        // Same page, different query: a filter or tab changed, not a place.
        stack[stack.length - 1] = here;
      } else {
        stack.push(here);
      }
      writeStack(stack);
    } catch {
      /* private-mode storage failures are harmless here */
    }
  }, [pathname, search]);

  return null;
}

/**
 * The one back control. Unstyled beyond what the caller passes, so every
 * existing arrow keeps its exact chrome; only where it goes changes.
 */
/**
 * WHERE THE BACK ARROW WILL GO, so a screen can say so. "All opportunities"
 * on a deal opened from Revenue Accruals was a lie: the arrow went back to
 * Revenue Accruals, the words said Opportunities (Anir, Sep 7: "the back
 * arrow is showing me opportunities. That's definitely a problem"). Reads
 * the same trail the click uses; null when there is none (deep link).
 */
export function useBackTrail(): string | null {
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => {
    try {
      const here = canonicalLocation(
        window.location.pathname + window.location.search
      );
      const stack = readStack();
      const candidate =
        sameLocation(stack[stack.length - 1] || "", here)
          ? stack[stack.length - 2]
          : stack[stack.length - 1];
      setPrev(candidate && !sameLocation(candidate, here) ? candidate : null);
    } catch {
      setPrev(null);
    }
  }, []);
  return prev;
}

/** The plain name of the section a path belongs to, for "Back to …". */
export function sectionLabelFor(path: string): string | null {
  const p = canonicalLocation(path).split("?")[0];
  const table: [string, string][] = [
    ["/revenue-accruals", "Revenue Accruals"],
    ["/opportunities", "Opportunities"],
    ["/customers", "Customers"],
    ["/contracts", "Contracts"],
    ["/solutioning", "Solutioning"],
    ["/meetings", "Meetings"],
    ["/offerings", "Offerings"],
    ["/components", "FDL Components"],
    ["/performance", "Goals"],
    ["/goals", "Goals"],
    ["/leads", "Leads"],
    ["/reports", "Reports"],
    ["/market-intel", "Market Intel"],
  ];
  for (const [root, label] of table) if (p === root || p.startsWith(root + "/")) return label;
  return null;
}

export function SmartBack({
  fallback,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  /** Where to go when there is no in-app trail (deep link, new tab). */
  fallback: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    /* A SCREEN WITH UNSAVED WORK GETS TO ASK FIRST. This is a BUTTON, so the
       editor's own link listener never sees it — "Back to deal" used to walk
       off with staged edits in silence. `askBeforeLeaving` returns true when
       nothing is staged anywhere, which is the ordinary case and costs a
       function call. */
    if (!askBeforeLeaving(() => go())) return;
    go();
  };
  const go = () => {
    try {
      const here = canonicalLocation(
        window.location.pathname + window.location.search
      );
      const stack = readStack();
      const prev =
        sameLocation(stack[stack.length - 1] || "", here)
          ? stack[stack.length - 2]
          : stack[stack.length - 1];
      if (prev && !sameLocation(prev, here)) {
        sessionStorage.setItem(BACK_FLAG, "1");
        router.push(targetForCurrentMode(prev));
        return;
      }
    } catch {
      /* fall through to the fallback */
    }
    router.push(targetForCurrentMode(fallback));
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}

/** The pre-existing plain-text variant; same trail logic, same old look. */
export function BackButton({
  fallback = "/pipeline",
  label = "Back",
}: {
  fallback?: string;
  label?: string;
}) {
  return (
    <SmartBack
      fallback={fallback}
      className="inline-flex cursor-pointer items-center gap-1.5 -ml-1 mb-3 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
    >
      <ArrowLeft size={16} strokeWidth={1.8} />
      {label}
    </SmartBack>
  );
}
