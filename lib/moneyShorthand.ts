/**
 * 250K IS A NUMBER. SO IS 1.5M. EVERYWHERE, NOT IN ONE BOX.
 *
 * Anir, Aug 22, typing into the deal-value field: "why can't I enter 250k
 * here". That box learned the trick and nothing else did — so the shorthand
 * worked in exactly one place in the app and was silently eaten in every
 * other money field, which is worse than never having it. Anir again, Sep 3:
 * "I liked the thing you had where when I type k or m it auto does 1000 or
 * 1,000,000. Why are you not doing that in every single field?"
 *
 * This is that behaviour, extracted so there is one copy of it. The letter
 * expands THE MOMENT IT LANDS — typing 2 5 0 k paints 250,000 — because a
 * shorthand that only resolves on blur leaves you staring at "250k" wondering
 * whether the form understood you.
 */

/** k → thousand, m → million, b → billion. Nothing above billion: a figure
 *  that large in this app is a typo, and expanding it would hide the typo. */
const SCALE = { k: 1e3, m: 1e6, b: 1e9 } as const;

/**
 * The digits a typed money value means.
 *
 * Returns a plain numeric STRING rather than a number, because these feed
 * controlled inputs: a half-typed "2." has to survive long enough for the "5m"
 * to arrive, and `Number("2.")` would collapse it to 2 and move the caret.
 *
 * @param raw   whatever is in the box, commas and spaces included
 * @param opts.integer  drop any decimal point once expansion is done. Money
 *   fields that store whole units want this; a rate or a fraction does not.
 */
export function expandMoneyShorthand(
  raw: string,
  opts: { integer?: boolean } = {}
): string {
  const typed = String(raw ?? "").replace(/[\s,]/g, "");
  /* THE SUFFIX ONLY COUNTS AT THE END, and only on a number that is otherwise
     complete. "1.5m" expands; "1m5" is somebody still typing and is left
     alone rather than guessed at. */
  const short = /^([0-9]*\.?[0-9]+)([kKmMbB])$/.exec(typed);
  if (short) {
    const scaled = Number(short[1]) * SCALE[short[2].toLowerCase() as keyof typeof SCALE];
    /* PAST SAFE INTEGERS, EXPANDING HIDES THE TYPO INSTEAD OF SHOWING IT.
       "999999999b" is 9.99e17 — beyond Number.MAX_SAFE_INTEGER, so the digits
       past the sixteenth are invented by the float. Nobody means that, and a
       money field that silently rounds a number it cannot hold is worse than
       one that leaves the nonsense on screen for you to see and correct. The
       comment above this function promised this ceiling; the code did not have
       it until the loop typed the number in. */
    if (Number.isSafeInteger(Math.round(scaled))) return String(Math.round(scaled));
    return typed.replace(/[^0-9.]/g, "");
  }
  /* Not shorthand: keep the digits, and keep a SINGLE decimal point. A lone
     trailing dot is a number being typed, not a broken one. */
  const cleaned = typed.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");
  return opts.integer ? cleaned.replace(/\..*$/, "") : cleaned;
}

/**
 * True when the box currently holds a bare shorthand suffix the user is
 * mid-way through typing, e.g. "250" then "k". Callers that show a hint can
 * use it; the expansion above does not need it.
 */
export function looksLikeShorthand(raw: string): boolean {
  return /^[0-9]*\.?[0-9]+[kKmMbB]$/.test(String(raw ?? "").replace(/[\s,]/g, ""));
}
