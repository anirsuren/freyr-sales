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
 * RATES ARE ENTERED, NOT INVENTED. There is no live FX feed here on purpose: a
 * rate pulled at render time makes last quarter's report change every time you
 * open it, and a made-up rate on a board slide is worse than no number at all.
 * An admin sets the rate for the year; anything without a rate is shown in its
 * own currency and marked, never silently converted at 1:1.
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
  if (v >= 1e9) return `${sign}${symbol}${trim1(v / 1e9)}B`;
  if (v >= 1e6) return `${sign}${symbol}${trim1(v / 1e6)}M`;
  if (v >= 1e3) return `${sign}${symbol}${trim1(v / 1e3)}K`;
  return `${sign}${symbol}${Math.round(v).toLocaleString("en-US")}`;
}
