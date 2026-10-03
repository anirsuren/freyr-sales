import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { Metadata } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.min.json";

import { splitPhone } from "@/lib/countries";

/** Maintained numbering-plan lengths, shared by input limits and validation. */
function possibleLengths(dial: string | null | undefined): number[] {
  const code = phoneDigits(dial);
  if (code === "1") return [10]; // NANP: area code plus seven-digit subscriber number.
  const lengths = new Set<number>();
  for (const country of getCountries()) {
    if (getCountryCallingCode(country) !== code) continue;
    const plan = new Metadata(metadata);
    plan.selectNumberingPlan(country);
    for (const length of plan.numberingPlan?.possibleLengths() ?? []) lengths.add(length);
  }
  return [...lengths].sort((a, b) => a - b);
}

/** E.164: country code and national number together, at most fifteen digits. */
export const E164_MAX_DIGITS = 15;

/** Below this a national number is a typo, not a number somebody can ring. */
const MIN_NATIONAL_DIGITS = 4;

/** Just the digits, so "+7 (090) 808-0808" and "70908080808" compare equal. */
export function phoneDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Group the national number so the eye can hold it. Saved international
 * numbers retain their dialling code as a separate, visible prefix.
 *
 * Threes, with the last group taking a fourth digit when one is left over, so
 * ten digits read "090 808 0808" rather than "090 808 080 8" — a trailing
 * single digit looks like a mistake. No country-specific patterns: this runs
 * on every number in the app and a wrong pattern is more confusing than an
 * even one.
 */
export function formatPhoneNumber(value: string | null | undefined): string {
  // A saved phone includes its dialling code. Keep that code visible instead
  // of grouping it with the national digits ("+1 732..." became "173 261...").
  const raw = String(value ?? "").trim();
  if (raw.startsWith("+")) {
    const { dial, number } = splitPhone(raw);
    if (dial) return `${dial} ${formatPhoneNumber(number)}`.trim();
  }
  const d = phoneDigits(value);
  if (d.length <= 3) return d;
  const groups: string[] = [];
  let i = 0;
  while (i < d.length) {
    /* Four in the last group when the remainder would otherwise be a lone
       digit, so 10 digits land as 3-3-4 and not 3-3-3-1. */
    const left = d.length - i;
    const take = left === 4 || left === 1 ? Math.min(left, 4) : 3;
    if (left === 1 && groups.length) {
      groups[groups.length - 1] += d.slice(i);
      break;
    }
    groups.push(d.slice(i, i + take));
    i += take;
  }
  return groups.join(" ");
}

/**
 * What is wrong with this number, in words a person can act on — or null when
 * nothing is.
 *
 * Takes the dialling code as well, because the fifteen-digit ceiling covers
 * both halves: +7 leaves fourteen, +353 leaves twelve. Returning the reason
 * rather than a boolean means the field can say WHY, which is the difference
 * between a form that refuses and a form that helps.
 */
export function phoneProblem(
  dial: string | null | undefined,
  number: string | null | undefined
): string | null {
  const nat = phoneDigits(number);
  if (!nat) return null; // empty is a different question — see the required check
  const code = phoneDigits(dial);
  const lengths = possibleLengths(dial);
  if (lengths.length && !lengths.includes(nat.length)) {
    const expected = lengths.length === 1 ? `${lengths[0]}` : lengths.join(", ");
    return `With +${code}, enter ${expected} digits after the country code.`;
  }
  if (nat.length < MIN_NATIONAL_DIGITS) {
    return `That is only ${nat.length} digit${nat.length === 1 ? "" : "s"} — a phone number needs at least ${MIN_NATIONAL_DIGITS}.`;
  }
  const total = code.length + nat.length;
  if (total > E164_MAX_DIGITS) {
    const over = total - E164_MAX_DIGITS;
    return `That is ${over} digit${over === 1 ? "" : "s"} too long. With +${code || "?"} the number can be at most ${E164_MAX_DIGITS - code.length} digits.`;
  }
  return null;
}

/** True when the number is usable. Convenience over `phoneProblem`. */
export function isPhoneValid(
  dial: string | null | undefined,
  number: string | null | undefined
): boolean {
  return phoneProblem(dial, number) === null;
}

/**
 * How many digits the national part may still take, so a field can stop
 * accepting keystrokes at the ceiling instead of letting somebody type past it
 * and then telling them off.
 */
export function nationalDigitBudget(dial: string | null | undefined): number {
  const lengths = possibleLengths(dial);
  return Math.min(lengths.length ? Math.max(...lengths) : E164_MAX_DIGITS, Math.max(0, E164_MAX_DIGITS - phoneDigits(dial).length));
}
