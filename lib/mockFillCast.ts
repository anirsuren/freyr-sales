/**
 * THE LONG-TAIL MOCK CAST, ON ITS OWN.
 *
 * These arrays and the two derivations below used to sit inside lib/mock-db,
 * which is fine while the customer store is the only thing that needs them.
 * The moment the deal, contract, lead, meeting and solutioning stores had to
 * generate work against the same account book (Anir, Sep 2: "im in mock mode
 * trying to see how everything would look... we need to have mock data"), six
 * more modules needed the same names, and importing lib/mock-db into each of
 * them would have dragged the Anthropic SDK and the fs-backed store in behind
 * it for the sake of two string lookups.
 *
 * So the cast moved here and lib/mock-db imports it back. Still ONE
 * derivation, which is the rule that mattered when mockFillContact was
 * hoisted in the first place: a call row reading "Lena Vogt" that links to a
 * contact page showing somebody else is worse than no call at all.
 *
 * INVENTED COMPANIES AND INVENTED PEOPLE, all of them. The pipeline sheet
 * carries real Freyr accounts; nothing here may ever be attached to one.
 */

export const FILL_STEMS = [
  "Aventis", "Belmara", "Calyx", "Dornier", "Eryx", "Fennec", "Girona",
  "Halcyon", "Ionis", "Juniper", "Kestrel", "Lumen", "Marisol", "Nyxis",
  "Orbis", "Pallas", "Quarry", "Rivenna", "Sable", "Tessera", "Umbra",
  "Verdant", "Wexford", "Xantha", "Ymir", "Zephyra", "Altamira", "Borealis",
  "Cinder", "Delphi", "Ember", "Fjord", "Granite", "Harrow", "Isolde",
];

export const FILL_SUFFIX = [
  "Biopharma", "Therapeutics", "Biosciences", "Labs", "Pharma",
  "Medical", "Health", "Diagnostics", "Bio", "Sciences",
];

export const FILL_FIRST = [
  "Lena", "Owen", "Priya", "Tomas", "Ana", "Marco", "Yuki", "Ruth", "Hannah",
  "Diego", "Farida", "Karl", "Meera", "Jonas", "Chiara", "Samuel", "Aisha",
  "Viktor", "Noor", "Erik", "Camila", "Ibrahim", "Sofia", "Liam", "Nadia",
  "Pavel", "Zara", "Mateo", "Ingrid", "Rohan",
];

export const FILL_LAST = [
  "Vogt", "Bradley", "Nair", "Lindqvist", "Sousa", "Bianchi", "Tanaka",
  "Okafor", "Weiss", "Moreno", "Jensen", "Iyer", "Berg", "Ricci", "Adeyemi",
  "Khan", "Petrov", "Rahman", "Larsen", "Duarte", "Cisse", "Marchetti",
  "Doyle", "Nowak", "Fischer", "Almeida", "Kaur", "Nakamura", "Olsen", "Ruiz",
];

/**
 * A realistic regional account book behind the twelve hand-written showrooms.
 * Thirty-six makes customer search, grouping and pagination meaningful without
 * turning every downstream module into hundreds or thousands of synthetic rows.
 */
export const FILL_ACCOUNTS = 36;

/**
 * ONE NAME PER ACCOUNT. The old 140-row generator repeated its 70 company
 * names, so separate account records appeared to be duplicates and name-based
 * joins combined their work. The current book is deliberately small enough
 * for this derivation to remain unique.
 */
export const FILL_NAMES = FILL_ACCOUNTS;

/** Which distinct company an account is. 1-based, like the id. */
export function fillPairIndex(account: number): number {
  return ((account - 1) % FILL_NAMES) + 1;
}

const at = <T,>(list: T[], n: number): T => list[n % list.length]!;

/** "cust-fill-007". */
export function fillCustomerId(account: number): string {
  return `cust-fill-${String(account).padStart(3, "0")}`;
}

/** The company name lib/mock-db prints on this account. */
export function fillCompany(account: number): string {
  const i = account - 1;
  return `${at(FILL_STEMS, i)} ${at(FILL_SUFFIX, i * 3 + 1)}`;
}

/**
 * A globally unique invented person for each ordinal in the mock directory.
 *
 * The previous stride arithmetic produced only 150-ish combinations for 700+
 * contacts, which is how six unrelated companies all acquired "Aisha Berg".
 * A first/last Cartesian index gives 900 distinct base names. A deterministic
 * middle initial also keeps these generated people distinct from the small
 * hand-written showroom cast while still reading like ordinary names.
 */
export function mockPersonName(ordinal: number): string {
  const safe = Math.max(0, Math.floor(ordinal));
  const first = FILL_FIRST[safe % FILL_FIRST.length]!;
  const last = FILL_LAST[Math.floor(safe / FILL_FIRST.length) % FILL_LAST.length]!;
  const middle = String.fromCharCode(65 + ((safe * 7 + 11) % 26));
  return `${first} ${middle}. ${last}`;
}

/** `account` is 1-based (cust-fill-001 is account 1); `slot` is 0-4. */
export function mockFillContact(account: number, slot: number) {
  const ordinal = (account - 1) * 5 + slot;
  return {
    id: `cont-fill-${String(account).padStart(3, "0")}-${slot + 1}`,
    name: mockPersonName(ordinal),
    company: fillCompany(account),
  };
}
