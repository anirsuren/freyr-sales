/**
 * THE LONG-TAIL MOCK CAST, ON ITS OWN.
 *
 * These arrays and the two derivations below used to sit inside lib/mock-db,
 * which is fine while the customer store is the only thing that needs them.
 * The moment the deal, contract, lead, meeting and solutioning stores had to
 * generate work against the same 140 accounts (Anir, Sep 2: "im in mock mode
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

/** How many generated accounts lib/mock-db puts behind the hand-written cast. */
export const FILL_ACCOUNTS = 140;

/**
 * SEVENTY NAMES ACROSS ONE HUNDRED AND FORTY ACCOUNTS.
 *
 * The company name is `stem[i % 35]` + `suffix[(3i + 1) % 10]`, so it repeats
 * every lcm(35, 10) = 70 accounts: cust-fill-001 and cust-fill-071 are both
 * "Aventis Therapeutics". That is how lib/mock-db has always generated them.
 *
 * It matters here because buildCustomer360 matches a record to an account by
 * id OR by customer NAME, so anything generated for account 1 lands on
 * account 71 as well whatever id it carries. Generating a separate working
 * life for each of the 140 would therefore show every account the union of
 * its own rows and its twin's, with meetings naming contacts who are not on
 * the account you are looking at.
 *
 * So the work is generated once per NAME, keyed by this index, and both
 * accounts that share the name show that one set. Everything downstream keys
 * off `fillPairIndex`, never off the raw account number.
 */
export const FILL_NAMES = 70;

/** Which of the 70 distinct companies an account is. 1-based, like the id. */
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

/** `account` is 1-based (cust-fill-001 is account 1); `slot` is 0-4. */
export function mockFillContact(account: number, slot: number) {
  const i = account - 1;
  return {
    id: `cont-fill-${String(account).padStart(3, "0")}-${slot + 1}`,
    name: `${at(FILL_FIRST, i * 5 + slot)} ${at(FILL_LAST, i * 7 + slot * 3)}`,
    company: fillCompany(account),
  };
}
