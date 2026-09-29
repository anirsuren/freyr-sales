/**
 * FIND THE CUSTOMER TYPE A RECORD MEANS, NOT THE ONE IT SPELLS.
 *
 * A customer stores its type as the NAME of a catalogue row, and two places
 * matched that name with ===. The catalogue has drifted apart from the data:
 * the seeded list calls the family "Pharmaceutical" while the live workspace
 * row calls it "Pharmaceuticals", so Opella, the one real account with a type
 * set, matched nothing. Every contact at such an account was told to go and
 * choose a customer type, and the button took them to a page that already
 * showed one (Anir, Sep 29: "why does it go here when I click Choose this
 * person's customer type").
 *
 * Exact match still wins. The fallback ignores case, spacing, punctuation and
 * a trailing "s" on any word, which is the whole of the observed drift, and
 * nothing looser: two genuinely different families never collapse together.
 */
const key = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");

export function findCustomerType<T extends { name: string }>(
  types: readonly T[],
  name: string | null | undefined
): T | null {
  const wanted = String(name ?? "").trim();
  if (!wanted) return null;
  const exact = types.find((type) => type.name === wanted);
  if (exact) return exact;
  const wantedKey = key(wanted);
  return types.find((type) => key(type.name) === wantedKey) ?? null;
}
