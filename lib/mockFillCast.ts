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
  "Laurel", "Quentin", "Indira", "Teodor", "Alessa", "Marcello", "Ayumi", "Rudo", "Hannah",
  "Diego", "Farida", "Karl", "Meera", "Jonas", "Chiara", "Samuel", "Aisha",
  "Viktor", "Noor", "Erik", "Camila", "Ibrahim", "Sofia", "Liam", "Nadia",
  "Pavel", "Zara", "Mateo", "Ingrid", "Rohan", "Amara", "Nikhil", "Elena",
  "Julian", "Maya", "Felix", "Layla", "Arjun", "Lucia", "Theo", "Salma",
  "Dev", "Marta", "Kenji", "Leila", "Oscar", "Anika", "Hugo", "Mina",
  "Rafael", "Sana", "Dario", "Nora", "Kiran", "Clara", "Jae", "Miriam",
  "Leon", "Fatima", "Adrian", "Tara", "Sven", "Reina", "Aarav", "Helena",
  "Emil", "Imani", "Bruno", "Neha", "Anton", "Marina", "Kofi", "Vivian",
  "Ren", "Alina", "Malik", "Eva", "Nico", "Samira", "Bastien", "Deepa",
  "Rowan", "Aya", "Gabriel", "Iris", "Hamza", "Luisa", "Marek", "Nia",
  "Andre", "Kavya", "Silas", "Rina", "Dmitri", "Celeste", "Idris", "Maia",
  "Henrik", "Amina", "Javier", "Tessa", "Akira", "Danica", "Elias", "Saira",
  "Matias", "Keiko", "Zain", "Bianca", "Naveen", "Freya", "Louis", "Amira",
  "Leandro", "Jasmine", "Ravi", "Elise", "Omar", "Greta", "Dante", "Anya",
  "Micah", "Soraya", "Anders", "Lakshmi", "Caleb", "Yara", "Tiago", "Mira",
  "Nolan", "Riya", "Casper", "Esme", "Bilal", "Valeria", "Haruto", "Celine",
  "Adeel", "Linnea", "Martin", "Zoya", "Joel", "Noura", "Santiago", "Elina",
  "Isaac", "Pari", "Milan", "Alba", "Tariq", "Leonie", "Ari", "Mila",
  "Nils", "Ines", "Reza", "Chloe", "Boris", "Shreya", "David", "Naomi",
  "Emre", "Adele", "Finn", "Rania", "Kabir", "Livia", "Adam", "Selin",
  "Johan", "Nandini", "Leo", "Dalia", "Sameer", "Frida", "Max", "Maelle",
  "Pedro", "Nina", "Ethan", "Rasha", "Mikhail", "Jia", "Victor", "Ava",
  "Yusuf", "Lara", "Tobias", "Siya", "Cedric", "Aiko", "Ruben", "Maria",
  "Ashwin", "Sabine", "Daniel", "Nahla", "Timo", "Isha", "Mauro", "Eleni",
  "Mustafa", "Viola", "Lucas", "Mei", "Soren", "Pia", "Navid", "Carla",
  "Gustav", "Aditi", "Simon", "Hiba", "Rico", "Natsumi", "Ben", "Yasmin",
  "Alejandro", "Klara", "Tarun", "Joana", "Hassan", "Emilia", "Conrad", "Suki",
  "Mohan", "Annika", "George", "Lina", "Rami", "Beatriz", "Quincy", "Poonam",
  "Ivan", "Romy", "Sahil", "Teresa", "Nabil", "Maren", "Tom", "Ayla",
  "Kristof", "Divya", "Paulo", "Nadine", "Evan", "Sahar", "Niklas", "Rosa",
  "Mahdi", "Olivia", "Sebastian", "Anjali", "Xavier", "Malika", "Remy", "Cora",
  "Veer", "Paulina", "Yosef", "Amelie", "Florian", "Khadija", "Gian", "Nerea",
  "Rahul", "Sonja", "Colin", "Amani", "Jan", "Irene", "Wael", "Tatiana",
];

export const FILL_LAST = [
  "Vogt", "Bradley", "Nair", "Lindqvist", "Sousa", "Bianchi", "Tanaka",
  "Okafor", "Weiss", "Moreno", "Jensen", "Iyer", "Berg", "Ricci", "Adeyemi",
  "Khan", "Petrov", "Rahman", "Larsen", "Duarte", "Cisse", "Marchetti",
  "Doyle", "Nowak", "Fischer", "Almeida", "Kaur", "Nakamura", "Olsen", "Ruiz",
  "Moreau", "Sato", "Desai", "Mbeki", "Costa", "Hoffmann", "Park", "Mensah",
  "Dubois", "Patel", "Andersson", "Fernandez", "Kobayashi", "Diallo", "Novak", "Silva",
  "Bennett", "Chaudhry", "Adebayo", "Rossi", "Kim", "Muller", "Santos", "Hassan",
  "Yamamoto", "Schneider", "Mwangi", "Gonzalez", "Shah", "Kowalski", "Chen", "Ndlovu",
  "Pereira", "Larsson", "Ito", "Kapoor", "Williams", "Abebe", "Garcia", "Leclerc",
  "Singh", "Haddad", "Mori", "Okoye", "Ribeiro", "Hansen", "Choi", "Ali",
  "Martin", "Bose", "Osei", "Conti", "Johansson", "Rivera", "Gupta", "Takahashi",
  "Diop", "Clarke", "Lefebvre", "Mehta", "O'Connor", "Watanabe", "Bello", "Gomez",
  "Liu", "Pillay", "Barbosa", "Eriksson", "Kumar", "Thompson", "Ibrahim", "Marin",
  "Nakajima", "Otieno", "Sullivan", "Verma", "Carvalho", "Bauer", "Reyes", "Afolayan",
  "Klein", "Mendoza", "Joshi", "Kondo", "Moyo", "Ferreira", "Holm", "Ahmed",
  "Bernard", "Rao", "Svensson", "Castillo", "Omondi", "Lombardi", "Cho", "Cooper",
  "Naidoo", "Blanc", "Reddy", "Ogawa", "Ramirez", "Nielsen", "Toure", "Wallace",
  "Hernandez", "Bhatt", "Njeri", "Fontaine", "Li", "Romano", "Murphy", "Das",
  "Sakamoto", "Maseko", "Andersen", "Vega", "Basu", "Laurent", "Wilson", "Adekunle",
  "Becker", "Campos", "Malhotra", "Kato", "Kamau", "Gallo", "Evans", "Chowdhury",
  "Bouchard", "Sharma", "Fujimoto", "Boateng", "Meyer", "Navarro", "Krishnan", "Yilmaz",
  "Davis", "Araujo", "Hirano", "Sarpong", "Weber", "Vargas", "Pande", "Khoury",
  "Harris", "Oliveira", "Sugimoto", "Acheampong", "Schmidt", "Salazar", "Batra", "Farah",
  "Turner", "Rocha", "Hashimoto", "Asante", "Wagner", "Ponce", "Sethi", "Farouk",
  "Brown", "Teixeira", "Matsuda", "Kone", "Hartmann", "Ortega", "Chatterjee", "Saad",
  "Roberts", "Lima", "Hayashi", "Traore", "Neumann", "Cabrera", "Banerjee", "Nasser",
  "Taylor", "Cardoso", "Ishikawa", "Banda", "Schulte", "Rojas", "Kulkarni", "Saleh",
  "Walker", "Correia", "Maeda", "Dlamini", "Kruger", "Serrano", "Bhandari", "Hamdan",
  "Edwards", "Coelho", "Miyazaki", "Chirwa", "Friedrich", "Molina", "Agarwal", "Darwish",
  "Collins", "Tavares", "Ueda", "Munyua", "Zimmermann", "Valdez", "Sinha", "Mansour",
  "Reed", "Nunes", "Shimizu", "Kariuki", "Braun", "Espinoza", "Menon", "Hariri",
  "Parker", "Mendes", "Aoki", "Mutiso", "Richter", "Paredes", "Dubey", "Nahas",
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
 * The generated account and showroom directories currently need 240 names.
 * Both pools cover that entire cast without repeating a given name or surname,
 * so unrelated leads no longer appear to be siblings. Keep the index stable:
 * other mock stores derive the same person's name from the same ordinal.
 * Beyond the curated pool, initials preserve unique full names.
 */
export function mockPersonName(ordinal: number): string {
  const safe = Math.max(0, Math.floor(ordinal));
  const first = FILL_FIRST[safe % FILL_FIRST.length]!;
  const cycle = Math.floor(safe / FILL_FIRST.length);
  // Keep the first thirty showroom identities (including Belmara's contacts)
  // stable while giving every later person a surname of their own.
  const lastIndex = safe < 30 ? (safe * 7) % 30 : safe % FILL_LAST.length;
  const last = FILL_LAST[lastIndex]!;
  return cycle === 0 ? `${first} ${last}` : `${first} ${String.fromCharCode(65 + (cycle % 26))}. ${last}`;
}

/**
 * Refresh names embedded in existing generated store rows without reseeding the
 * record. A generated lead, meeting, request or contract may have been edited
 * in Mock mode, so only the old synthetic person's name (and email slug) is
 * replaced. Hand-created rows and manually changed names are left alone.
 */
const oldToNew = Array.from({ length: FILL_ACCOUNTS * 5 }, (_, ordinal) => {
  const first = FILL_FIRST[ordinal]!;
  const oldLast = FILL_LAST[(ordinal * 7) % 30]!;
  return [`${first} ${oldLast}`, mockPersonName(ordinal)] as const;
}).filter(([before, after]) => before !== after);

const nameReplacements = new Map<string, string>(
  oldToNew.flatMap(([before, after]) => [
    [before, after],
    [before.toLowerCase().replace(/[^a-z]+/g, "."), after.toLowerCase().replace(/[^a-z]+/g, ".")],
  ])
);
const namePattern = new RegExp(
  Array.from(nameReplacements.keys())
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g"
);

export function refreshMockFillNames<T extends { id: string }>(rows: T[]): boolean {
  let changed = false;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      const next = value.replace(namePattern, (match) => nameReplacements.get(match) ?? match);
      if (next !== value) changed = true;
      return next;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      for (const [key, field] of Object.entries(value)) {
        (value as Record<string, unknown>)[key] = visit(field);
      }
    }
    return value;
  };
  for (const row of rows) {
    if (/^fill10-/.test(row.id)) visit(row);
  }
  return changed;
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
