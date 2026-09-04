/**
 * A TRANSLUCENT VERSION OF A COLOUR THAT WORKS WHEN THE COLOUR IS A TOKEN.
 *
 * The app builds soft chip backgrounds by appending two hex digits to a colour
 * string — tint(color, 10) for a 10% wash. That works for `#2563EB` and produces
 * `#2563EB1A`. It produces `var(--cat-blue)1A` for a token, which is not a
 * colour at all: the browser drops the declaration and the chip loses its
 * background silently, with nothing in the console to say so.
 *
 * It was already happening before dark mode made it matter — two slots of
 * FILTER_PALETTE have been `var(--ink-orange)` and `var(--ink-violet-soft)`
 * since Aug 27, so offerings in those two categories have been rendering with
 * no edge tint and no rule under the name this whole time, while every other
 * category had both.
 *
 * `color-mix` takes either form, so the helper is the same one call everywhere
 * and a colour can become a token later without hunting down its tints.
 */

/** Percentages, keyed by the hex-alpha pairs the codebase already used, so a
 *  swept call site keeps exactly the weight it was drawn with. */
const FROM_HEX_ALPHA: Record<string, number> = {
  "0D": 5, "12": 7, "14": 8, "16": 9, "1A": 10, "1F": 12,
  "38": 22, "57": 34, "59": 35, "66": 40,
};

/**
 * @param color  any CSS colour — a hex, a token reference, anything
 * @param pct    how much of it survives, 0-100; the rest is transparent
 */
export function tint(color: string | null | undefined, pct: number): string {
  const c = String(color ?? "").trim();
  /* A MISSING COLOUR IS STILL A VALID BACKGROUND. Returning undefined would
     make every call site's type `string | undefined` and force a null check
     at a hundred of them, for a case that just means "paint nothing". */
  if (!c) return "transparent";
  return `color-mix(in srgb, ${c} ${pct}%, transparent)`;
}

/** The same thing addressed by the old hex-alpha suffix, for a mechanical
 *  swap at a call site that used one. */
export function tintHex(color: string | null | undefined, hexAlpha: string): string {
  return tint(color, FROM_HEX_ALPHA[hexAlpha.toUpperCase()] ?? 10);
}
