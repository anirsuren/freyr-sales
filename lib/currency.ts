/**
 * MONEY HAS A CURRENCY (Suren, via Anir, Aug 15: "wherever you have an amount,
 * you always have to have it so that I can choose the currency. That's super
 * important. Also there should be a way to standardize the currency, because
 * if everyone does it in different currencies and I want to see it in euros or
 * if I want to see it in USD, that has to be there").
 *
 * Freyr sells across the US, Europe, India and Japan, so a booking is logged in
 * whatever the contract was signed in. Two separate ideas, and keeping them
 * separate is the whole design:
 *
 *   THE RECORDED CURRENCY  — what was actually signed. Never changes, never
 *                            converted in storage. $250K stays $250K forever.
 *   THE DISPLAY CURRENCY   — what YOU want to read the board in. A view
 *                            setting, per person, converted on the way out.
 *
 * BOARD RATES ARE ENTERED, NOT INVENTED. The display currency does not run off
 * a live feed on purpose: a rate pulled at render time makes last quarter's
 * report change every time you open it, and a made-up rate on a board slide is
 * worse than no number at all. An admin sets the rate for the year; anything
 * without a rate is shown in its own currency and marked, never silently
 * converted at 1:1.
 *
 * ONE DEAL ON ITS SIGN DATE IS A DIFFERENT QUESTION, and it does read a live
 * source. See the "live FX lookup" half at the bottom of this file for why the
 * two do not fight: that one converts a single opportunity for display, dated
 * to the day it signs, and never touches a stored number or a report total.
 */

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "INR"
  | "JPY"
  | "CHF"
  | "CAD"
  | "AUD"
  | "SGD";

export const CURRENCIES: {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** Yen and rupee are usually quoted whole; the rest take cents. */
  whole?: boolean;
}[] = [
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "Pound sterling" },
  { code: "INR", symbol: "₹", name: "Indian rupee", whole: true },
  { code: "JPY", symbol: "¥", name: "Japanese yen", whole: true },
  { code: "CHF", symbol: "CHF ", name: "Swiss franc" },
  { code: "CAD", symbol: "C$", name: "Canadian dollar" },
  { code: "AUD", symbol: "A$", name: "Australian dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore dollar" },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/** The workspace's own currency: what a number means when nobody said. */
export const BASE_CURRENCY: CurrencyCode = "USD";

export function currencyMeta(code: string | null | undefined) {
  const found = CURRENCIES.find(
    (c) => c.code === String(code || "").toUpperCase()
  );
  return found ?? CURRENCIES[0];
}

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return (
    typeof v === "string" &&
    (CURRENCY_CODES as string[]).includes(v.toUpperCase())
  );
}

/**
 * How many units of `code` one unit of the base currency buys. Stored on the
 * performance row so it is auditable and versioned with everything else.
 * The base is always 1 and cannot be edited away.
 */
export type CurrencyRates = Partial<Record<CurrencyCode, number>>;

export function normalizeRates(raw: unknown): CurrencyRates {
  const out: CurrencyRates = { [BASE_CURRENCY]: 1 };
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = k.toUpperCase();
    if (!isCurrencyCode(code)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[code as CurrencyCode] = n;
  }
  out[BASE_CURRENCY] = 1;
  return out;
}

export type Converted = {
  /** The number to print, in `code`. */
  value: number;
  code: CurrencyCode;
  /** False when no rate exists, so the caller can say so instead of lying. */
  exact: boolean;
};

/**
 * Convert an amount recorded in `from` into `to`. With no rate for either side
 * the amount comes back UNCONVERTED in its own currency, flagged inexact —
 * the caller shows it as it was recorded rather than pretending 1:1.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: CurrencyRates
): Converted {
  if (from === to) return { value: amount, code: to, exact: true };
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return { value: amount, code: from, exact: false };
  // Everything routes through the base: amount / fromRate = base, × toRate.
  return { value: (amount / fromRate) * toRate, code: to, exact: true };
}

function trim1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** The same compact shape the app already uses for dollars, any currency. */
export function fmtMoney(value: number, code: CurrencyCode = BASE_CURRENCY): string {
  const { symbol } = currencyMeta(code);
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  /**
   * THE SAME SHAPE AS formatMoney, INCLUDING THE CARRY (Anir, Sep 4: the same
   * figure read "$2K" on one screen and "$1.5K" on another).
   *
   * Two differences had crept in. The first is rounding: lib/pipeline's
   * formatMoney takes thousands whole ("$2K" for 1,500) and this one kept a
   * decimal. The second is worse — there was no carry check, so 999,999 came
   * out as "$1000K" and 999,999,999 as "$1000M", which nobody writes.
   *
   * Both now follow pipeline's rule, because that is the one on 274 screens.
   */
  const unit = (n: number, digits: number) => Number(n.toFixed(digits));
  if (v >= 1e9) {
    const b = unit(v / 1e9, 1);
    return `${sign}${symbol}${b >= 1000 ? `${unit(v / 1e12, 1)}T` : `${b}B`}`;
  }
  if (v >= 1e6) {
    const m = unit(v / 1e6, 1);
    return `${sign}${symbol}${m >= 1000 ? `${unit(v / 1e9, 1)}B` : `${m}M`}`;
  }
  if (v >= 1e3) {
    const k = Math.round(v / 1e3);
    return `${sign}${symbol}${k >= 1000 ? `${unit(v / 1e6, 1)}M` : `${k}K`}`;
  }
  return `${sign}${symbol}${Math.round(v).toLocaleString("en-US")}`;
}

/* ------------------------------------------------------- live FX lookup */

/**
 * THE RATE ON THE DAY THE DEAL SIGNS (Suren, Sep 1: "based on that date,
 * whatever the conversion rate is on that particular day, like on 1st of
 * September, it takes the value of that date").
 *
 * This is the second, newer half of the module and it does NOT replace the
 * admin-entered `CurrencyRates` above. That table converts the whole board
 * into whichever currency you want to READ it in, and it is deliberately a
 * fixed number so last quarter's report does not move under you. This half
 * answers one narrower question: an opportunity was written down in rupees,
 * what is that in dollars on its own sign date. Only the opportunity form
 * uses it, and only to show a figure it never stores.
 *
 * RATE DIRECTION, SAID ONCE AND OBEYED EVERYWHERE: a rate is HOW MANY UNITS
 * OF THAT CURRENCY ONE US DOLLAR BUYS. INR 94.95 means $1 = Rs 94.95, so a
 * rupee amount becomes dollars by DIVIDING. Same arrow as `CurrencyRates`
 * above, and the same arrow the source hands back for base=USD, so nothing
 * is inverted on the way in. A silently flipped rate is the classic bug
 * here, which is why there is ONE seam and ONE arrow.
 *
 * WHERE THE NUMBER COMES FROM: the European Central Bank's daily reference
 * rates, read through api.frankfurter.dev. No key, no account, no npm
 * package. The fetching and its cache are SERVER work and live in
 * lib/fxRates.ts; this module stays client-safe and only ever looks up a
 * number somebody already handed it.
 *
 * rateFor IS THE ONLY SEAM. Nothing else in the app may look a rate up, so
 * swapping the source later touches lib/fxRates.ts and nothing here.
 */

export type FxDayRates = {
  /**
   * The day the rates actually belong to, which is not always the day that
   * was asked for. Markets shut at weekends so a Sunday resolves back to the
   * Friday, and a sign date in the future has no rate in the world yet, so it
   * falls back to the latest published day. Callers show this date rather
   * than the one they asked for, because the alternative is a number labelled
   * with a day it did not come from.
   */
  date: string;
  /** Units of each currency per 1 US dollar. */
  rates: Partial<Record<CurrencyCode, number>>;
};

/**
 * Held per process, keyed by the day ASKED FOR. On the server this is warmed
 * by lib/fxRates; in the browser the deal form fetches /api/fx and calls
 * setFxRates before it reads anything back out. Empty is a normal state and
 * means "no rate known", never "assume one".
 */
const fxDays = new Map<string, FxDayRates>();

/** "latest" for an absent or unparseable day, so one key shape reaches the
 *  cache, the API route and the lookup. */
export function fxKey(onIso: string | null | undefined): string {
  const s = String(onIso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "latest";
}

/** Hand the lookup a day's rates. Passing null forgets them, which is what a
 *  failed fetch does: no entry means rateFor answers "I do not know". */
export function setFxRates(
  onIso: string | null | undefined,
  day: FxDayRates | null
): void {
  const key = fxKey(onIso);
  if (!day) {
    fxDays.delete(key);
    return;
  }
  fxDays.set(key, day);
}

/** What was loaded for that day, so a caller can print the date the rate is
 *  actually from. */
export function fxRatesFor(
  onIso: string | null | undefined
): FxDayRates | undefined {
  return fxDays.get(fxKey(onIso));
}

/**
 * THE SEAM. Units of `currency` per 1 US dollar on `onIso`, or undefined when
 * nobody has loaded a rate for that day.
 *
 * undefined is a real answer and callers must show it as one. A missing rate
 * is never 1, and it is never last week's rate wearing today's date: both of
 * those put a wrong number on a board slide, which is worse than a blank.
 */
export function rateFor(
  currency: string,
  onIso: string | undefined
): number | undefined {
  const code = String(currency || "").toUpperCase();
  if (!isCurrencyCode(code)) return undefined;
  // A dollar is a dollar on every day of the year, no lookup needed.
  if (code === BASE_CURRENCY) return 1;
  const rate = fxDays.get(fxKey(onIso))?.rates[code as CurrencyCode];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : undefined;
}

/**
 * What a local amount is worth in US dollars on that day, or undefined when
 * the rate is not known. DIVIDES, per the arrow above.
 *
 * Display only. Suren, Sep 1: "the entire reporting dashboards, everything
 * should be in USD. It's only within the opportunities where we will capture
 * the local currency" — and the number the person typed is the one that gets
 * stored, so this figure is computed fresh every time it is shown and never
 * written back into a deal.
 */
export function convertToUsd(
  amount: number,
  currency: string,
  onIso: string | undefined
): number | undefined {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return undefined;
  const rate = rateFor(currency, onIso);
  if (!rate) return undefined;
  return amount / rate;
}
