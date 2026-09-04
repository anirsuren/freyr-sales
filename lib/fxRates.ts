import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./env";
import {
  CURRENCY_CODES,
  fxKey,
  type CurrencyCode,
  type FxDayRates,
} from "./currency";

/**
 * WHAT A CURRENCY WAS WORTH ON A GIVEN DAY — FETCHED, NOT ASSUMED.
 *
 * Suren, Sep 1: "based on that date, whatever the conversion rate is on that
 * particular day, like on 1st of September, it takes the value of that date."
 *
 * So the opportunity form needs a real rate for a real day, and it needs it
 * without anybody typing one in. This module is the only thing in the app that
 * talks to an FX source; lib/currency's rateFor() is the only thing that reads
 * the answer. Swap the source and nothing outside this file moves.
 *
 * THE SOURCE: the European Central Bank's daily reference rates, served by
 * Frankfurter at https://api.frankfurter.dev/v1. Chosen because it needs no
 * API key, no account and no npm package — nothing to rotate, nothing to bill,
 * nothing to add to the lockfile. (api.frankfurter.app, the older host, 301s
 * here; we call the canonical one so every request is not two.) It publishes
 * every currency on our list: EUR, GBP, INR, JPY, CHF, CAD, AUD and SGD are
 * all ECB reference currencies, and USD is the base we ask in.
 *
 * SERVER ONLY. The browser never calls Frankfurter — the deal form asks
 * /api/fx and gets numbers. That keeps one cache in front of the source
 * instead of one per open tab, and keeps the app's own outbound calls in the
 * one place they can be seen.
 *
 * RATE DIRECTION: with base=USD, Frankfurter answers in units of the target
 * currency per 1 US dollar (INR 94.95 means $1 = Rs 94.95). That is already
 * the arrow lib/currency documents, so nothing is inverted on the way in.
 */

const BASE_URL = "https://api.frankfurter.dev/v1";

/** Everything except the base itself; asking for USD in USD is meaningless. */
const SYMBOLS = CURRENCY_CODES.filter((c) => c !== "USD");

/**
 * THE CACHE LIVES WHERE THE REST OF THE WORKSPACE STATE LIVES: one row in
 * offering_catalog_state, same as the privileges table and the docs-storage
 * config. ONE row for the whole workspace and not split by data mode — what
 * the rupee was worth on 30 June is a fact about the world, not a fact about
 * whether you are looking at Mock or Real.
 */
const ROW_ID = "fx-rates";

/** How long a rate for TODAY (or "latest") may be reused before we ask again.
 *  The ECB publishes once each working afternoon, so this is about not
 *  hammering the source, not about accuracy. */
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;

/** Keep the row from growing without limit. Oldest fetches fall off first. */
const MAX_DAYS = 400;

type CachedDay = {
  /** The day the rates actually belong to, as reported by the source. */
  date: string;
  rates: Record<string, number>;
  fetchedAt: string;
};

type FxCache = {
  /** Keyed by the day ASKED FOR: an ISO day, or "latest". */
  days: Record<string, CachedDay>;
  updatedAt: string;
};

function emptyCache(): FxCache {
  return { days: {}, updatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------- in memory */

/**
 * Per process, in front of the database. A dozen people opening deal forms in
 * the same minute should cost one read, not a dozen.
 */
const memory = new Map<string, CachedDay>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A PAST DAY IS FROZEN; TODAY IS NOT.
 *
 * What the euro did on 30 June 2026 will never change again, so that entry is
 * good forever. "latest" is a moving target and gets the short life above.
 */
function isFresh(key: string, entry: CachedDay): boolean {
  if (key !== "latest") return true;
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < LATEST_TTL_MS;
}

/* ------------------------------------------------------------- the store */

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function readCache(): Promise<FxCache> {
  if (!isSupabaseConfigured()) return emptyCache();
  const { data, error } = await db()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = data?.catalog as Partial<FxCache> | null;
  const days: Record<string, CachedDay> = {};
  if (raw && typeof raw === "object" && raw.days && typeof raw.days === "object") {
    for (const [key, value] of Object.entries(raw.days)) {
      const v = value as Partial<CachedDay> | null;
      if (!v || typeof v !== "object") continue;
      if (typeof v.date !== "string" || typeof v.fetchedAt !== "string") continue;
      if (!v.rates || typeof v.rates !== "object") continue;
      const rates: Record<string, number> = {};
      for (const [code, n] of Object.entries(v.rates)) {
        const num = Number(n);
        if (Number.isFinite(num) && num > 0) rates[code.toUpperCase()] = num;
      }
      days[key] = { date: v.date, rates, fetchedAt: v.fetchedAt };
    }
  }
  return { days, updatedAt: raw?.updatedAt ?? new Date().toISOString() };
}

/**
 * MERGE, DO NOT OVERWRITE. Two requests for two different days can land at
 * once, and a blind upsert of one would drop the other's entry. Worst case
 * under a real race is that one day gets fetched twice, which costs nothing.
 *
 * A cache write that fails is not an error the caller should see: the rate was
 * still fetched and is still correct. It just costs another call next time.
 */
async function writeCache(key: string, entry: CachedDay): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const current = await readCache().catch(() => emptyCache());
    const days = { ...current.days, [key]: entry };
    const keys = Object.keys(days);
    if (keys.length > MAX_DAYS) {
      keys
        .sort(
          (a, b) => Date.parse(days[a].fetchedAt) - Date.parse(days[b].fetchedAt)
        )
        .slice(0, keys.length - MAX_DAYS)
        // "latest" is the hot key and must never be the one evicted.
        .filter((k) => k !== "latest")
        .forEach((k) => delete days[k]);
    }
    await db().from("offering_catalog_state").upsert({
      id: ROW_ID,
      catalog: { days, updatedAt: new Date().toISOString() } satisfies FxCache,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* See above: a cold cache is slower, never wrong. */
  }
}

/* --------------------------------------------------------------- the API */

async function fetchDay(key: string): Promise<CachedDay | null> {
  const path = key === "latest" ? "latest" : key;
  const url = `${BASE_URL}/${path}?base=USD&symbols=${SYMBOLS.join(",")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Next would otherwise cache this fetch itself, on top of our own store,
      // with a lifetime nobody here chose.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      date?: unknown;
      rates?: Record<string, unknown>;
    };
    if (typeof body?.date !== "string" || !body?.rates) return null;
    const rates: Record<string, number> = {};
    for (const [code, n] of Object.entries(body.rates)) {
      const num = Number(n);
      if (Number.isFinite(num) && num > 0) rates[code.toUpperCase()] = num;
    }
    if (Object.keys(rates).length === 0) return null;
    return { date: body.date, rates, fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toDayRates(entry: CachedDay): FxDayRates {
  const rates: Partial<Record<CurrencyCode, number>> = { USD: 1 };
  for (const code of CURRENCY_CODES) {
    const n = entry.rates[code];
    if (typeof n === "number" && n > 0) rates[code] = n;
  }
  return { date: entry.date, rates };
}

/**
 * THE RATES FOR A DAY, or null when they cannot be had.
 *
 * null is a real answer and the caller must show it as one — "cannot convert
 * right now", never a stale figure wearing today's date. Suren reads these
 * numbers off a screen and repeats them in a meeting; a wrong one is worse
 * than a blank one.
 *
 * A SIGN DATE IN THE FUTURE HAS NO RATE, because nobody knows yet what the
 * rupee will do in November. Frankfurter answers a future date with a 404, so
 * anything from today onwards asks for the latest published day instead. The
 * returned `date` says which day the number is really from, and the form
 * prints that rather than the day it asked about — the person can then see for
 * themselves that a deal signing in November is being shown at today's rate.
 *
 * Weekends and holidays work the same way and need no special case: the source
 * resolves a Sunday back to the Friday and reports the Friday.
 */
export async function usdRatesOn(onIso?: string): Promise<FxDayRates | null> {
  const asked = fxKey(onIso);
  const key = asked === "latest" || asked >= today() ? "latest" : asked;

  const held = memory.get(key);
  if (held && isFresh(key, held)) return toDayRates(held);

  if (isSupabaseConfigured()) {
    try {
      const stored = (await readCache()).days[key];
      if (stored && isFresh(key, stored)) {
        memory.set(key, stored);
        return toDayRates(stored);
      }
    } catch {
      /* A cache we cannot read is a cache miss, not a failure. Fetch instead. */
    }
  }

  const fetched = await fetchDay(key);
  if (!fetched) return null;
  memory.set(key, fetched);
  await writeCache(key, fetched);
  return toDayRates(fetched);
}

/**
 * A RATE TABLE THAT IS NEVER EMPTY WHEN THE WORLD HAS ONE.
 *
 * Live ECB rates UNDERNEATH whatever the admin table holds: a rate somebody
 * typed is a deliberate statement about a contract and still wins, but the
 * live close fills every code the table does not mention. The performance
 * route grew this privately on Sep 4 because a stored table holding only
 * {USD: 1} was silently zeroing every non-dollar goal; it lives here now so
 * every server page that hands a form its starting rates can use the same
 * merge — the deal form was still handing out the bare stored table, which is
 * why its conversion had nothing to fall back on the moment /api/fx failed.
 */
export async function ratesWithLiveFallback<
  T extends Partial<Record<string, number>> | undefined
>(stored: T): Promise<Partial<Record<string, number>>> {
  try {
    const live = await usdRatesOn();
    if (!live?.rates) return stored ?? {};
    return { ...live.rates, ...(stored ?? {}) };
  } catch {
    /* Never let the network cost anyone the table they already have. */
    return stored ?? {};
  }
}
