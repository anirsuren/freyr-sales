"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

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

function readStack(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : [];
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
    const here = search ? `${pathname}?${search}` : pathname;
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
      if (top && top.split("?")[0] === pathname) {
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
    try {
      const here = window.location.pathname + window.location.search;
      const stack = readStack();
      const prev =
        stack[stack.length - 1] === here
          ? stack[stack.length - 2]
          : stack[stack.length - 1];
      if (prev && prev !== here) {
        sessionStorage.setItem(BACK_FLAG, "1");
        router.push(prev);
        return;
      }
    } catch {
      /* fall through to the fallback */
    }
    router.push(fallback);
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
