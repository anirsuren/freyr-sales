"use client";

import type { FxDayRates } from "./currency";

/**
 * THE ONE WAY A BROWSER ASKS FOR EXCHANGE RATES.
 *
 * Sep 4, after the fourth "why is this conversion shit so complicated"
 * screenshot: every form fetched /api/fx exactly once, ate any failure with
 * `.then(r => r.ok ? r.json() : null)`, and quietly fell back to a stored
 * table that holds only {USD: 1}. One blip — an expired access grant, a slow
 * dyno, a dropped packet — and the deal form said "Cannot convert right now"
 * for the rest of its life on that screen, while the rate source was up and
 * fine the whole time.
 *
 * So this is the reliability that was missing, in one place:
 *
 *   - RETRIES. Three attempts with a short backoff, because the failures that
 *     actually happen here are momentary. A 4xx is not retried — asking the
 *     same wrong question louder does not change the answer — except 401/403,
 *     which on this app can mean nothing more than an access grant mid-renew.
 *   - ONE FLIGHT PER DAY-KEY. Five rows converting at once ask once.
 *   - A SMALL SUCCESS CACHE, so switching currency back and forth on a form
 *     does not refetch a day that cannot have changed.
 *
 * It throws nothing and never invents a rate: the caller gets the day or
 * null, and null still means "say you cannot convert" — never a guess.
 */

const won = new Map<string, FxDayRates>();
const inFlight = new Map<string, Promise<FxDayRates | null>>();

const TRIES = 3;
const BACKOFF_MS = [0, 800, 2400];

function keyOf(on?: string): string {
  return on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : "latest";
}

async function attempt(on?: string): Promise<FxDayRates | null> {
  const query = on ? `?on=${encodeURIComponent(on)}` : "";
  for (let i = 0; i < TRIES; i++) {
    if (BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    try {
      const res = await fetch(`/api/fx${query}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { day?: FxDayRates };
        if (data?.day?.date && data.day.rates) return data.day;
        return null;
      }
      /* Retry what can heal: server hiccups, and the auth codes an expiring
         access grant produces. A 404/422 will not improve with patience. */
      const retryable = res.status >= 500 || res.status === 401 || res.status === 403;
      if (!retryable) return null;
    } catch {
      /* Network error: retry. */
    }
  }
  return null;
}

/** The rates for a day, retried and de-duplicated. null = say so, honestly. */
export function fetchFxDay(on?: string): Promise<FxDayRates | null> {
  const key = keyOf(on);
  const held = won.get(key);
  if (held) return Promise.resolve(held);
  const flying = inFlight.get(key);
  if (flying) return flying;
  const p = attempt(on)
    .then((day) => {
      if (day) won.set(key, day);
      return day;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
