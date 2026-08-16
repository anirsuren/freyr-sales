"use client";

import { useEffect, useState } from "react";
import type { Opportunity } from "./opportunitiesShared";

/**
 * The pipeline, fetched ONCE for the whole page.
 *
 * Every expanded goal row renders its own GoalZoom, and a goal table with
 * Expand all open renders seven of them. A fetch per component would be seven
 * identical requests; this shares one promise and one result across all of
 * them, and re-fetches only when something asks it to.
 */

let cache: Opportunity[] | null = null;
let inflight: Promise<Opportunity[]> | null = null;
const listeners = new Set<(list: Opportunity[]) => void>();

async function load(): Promise<Opportunity[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/opportunities", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Opportunity[] = Array.isArray(d?.state?.opportunities)
          ? d.state.opportunities
          : [];
        cache = list;
        for (const fn of listeners) fn(list);
        return list;
      })
      .catch(() => {
        // A pipeline that failed to load is NOT an empty pipeline. Null keeps
        // the column saying "could not load" instead of "no deals here".
        cache = null;
        for (const fn of listeners) fn([]);
        return [];
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop the cache so the next reader refetches — call after a write. */
export function refreshOpportunities(): void {
  cache = null;
  void load();
}

export function useOpportunities(): {
  opportunities: Opportunity[];
  loading: boolean;
} {
  const [list, setList] = useState<Opportunity[] | null>(cache);
  useEffect(() => {
    let alive = true;
    const fn = (next: Opportunity[]) => alive && setList(next);
    listeners.add(fn);
    if (!cache) void load();
    else setList(cache);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, []);
  return { opportunities: list ?? [], loading: list === null };
}
