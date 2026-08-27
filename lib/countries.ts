/**
 * COUNTRIES, WITH A FLAG AND A DIALLING CODE.
 *
 * Anir, Aug 26, on the lead form: "For phone, it's obviously gonna be
 * different, like countries and stuff, right? Keep that in mind. Countries
 * should just be like a flag."
 *
 * A regulatory-affairs business takes leads from wherever a filing happens, so
 * this is a real list rather than the five markets the offerings page tracks.
 * The flag is derived from the ISO code instead of being typed out: two
 * letters map to the two regional-indicator symbols, which is exactly how the
 * emoji is built, so a new row can never carry the wrong flag.
 */

export type Country = {
  /** The name as it is stored on a record. */
  name: string;
  /** ISO 3166-1 alpha-2, and the source of the flag. */
  iso2: string;
  /** International dialling code, digits only, no plus. */
  dial: string;
};

/** Two letters to the flag emoji, e.g. "IN" to 🇮🇳. */
export function flagOf(iso2: string): string {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65))
  );
}

/* Ordered by how often Freyr actually files, then alphabetically. The head of
   the list is the markets the offerings page already names. */
export const COUNTRIES: Country[] = [
  { name: "United States", iso2: "US", dial: "1" },
  { name: "United Kingdom", iso2: "GB", dial: "44" },
  { name: "India", iso2: "IN", dial: "91" },
  { name: "Germany", iso2: "DE", dial: "49" },
  { name: "France", iso2: "FR", dial: "33" },
  { name: "Japan", iso2: "JP", dial: "81" },
  { name: "China", iso2: "CN", dial: "86" },
  { name: "South Korea", iso2: "KR", dial: "82" },
  { name: "Switzerland", iso2: "CH", dial: "41" },
  { name: "Ireland", iso2: "IE", dial: "353" },
  { name: "Netherlands", iso2: "NL", dial: "31" },
  { name: "Belgium", iso2: "BE", dial: "32" },
  { name: "Denmark", iso2: "DK", dial: "45" },
  { name: "Sweden", iso2: "SE", dial: "46" },
  { name: "Norway", iso2: "NO", dial: "47" },
  { name: "Finland", iso2: "FI", dial: "358" },
  { name: "Spain", iso2: "ES", dial: "34" },
  { name: "Italy", iso2: "IT", dial: "39" },
  { name: "Portugal", iso2: "PT", dial: "351" },
  { name: "Austria", iso2: "AT", dial: "43" },
  { name: "Poland", iso2: "PL", dial: "48" },
  { name: "Czechia", iso2: "CZ", dial: "420" },
  { name: "Hungary", iso2: "HU", dial: "36" },
  { name: "Greece", iso2: "GR", dial: "30" },
  { name: "Romania", iso2: "RO", dial: "40" },
  { name: "Türkiye", iso2: "TR", dial: "90" },
  { name: "Canada", iso2: "CA", dial: "1" },
  { name: "Mexico", iso2: "MX", dial: "52" },
  { name: "Brazil", iso2: "BR", dial: "55" },
  { name: "Argentina", iso2: "AR", dial: "54" },
  { name: "Chile", iso2: "CL", dial: "56" },
  { name: "Colombia", iso2: "CO", dial: "57" },
  { name: "Australia", iso2: "AU", dial: "61" },
  { name: "New Zealand", iso2: "NZ", dial: "64" },
  { name: "Singapore", iso2: "SG", dial: "65" },
  { name: "Malaysia", iso2: "MY", dial: "60" },
  { name: "Indonesia", iso2: "ID", dial: "62" },
  { name: "Thailand", iso2: "TH", dial: "66" },
  { name: "Vietnam", iso2: "VN", dial: "84" },
  { name: "Philippines", iso2: "PH", dial: "63" },
  { name: "Taiwan", iso2: "TW", dial: "886" },
  { name: "Hong Kong", iso2: "HK", dial: "852" },
  { name: "United Arab Emirates", iso2: "AE", dial: "971" },
  { name: "Saudi Arabia", iso2: "SA", dial: "966" },
  { name: "Israel", iso2: "IL", dial: "972" },
  { name: "Egypt", iso2: "EG", dial: "20" },
  { name: "South Africa", iso2: "ZA", dial: "27" },
  { name: "Nigeria", iso2: "NG", dial: "234" },
  { name: "Kenya", iso2: "KE", dial: "254" },
  { name: "Morocco", iso2: "MA", dial: "212" },
  { name: "Russia", iso2: "RU", dial: "7" },
  { name: "Ukraine", iso2: "UA", dial: "380" },
  { name: "Pakistan", iso2: "PK", dial: "92" },
  { name: "Bangladesh", iso2: "BD", dial: "880" },
  { name: "Sri Lanka", iso2: "LK", dial: "94" },
];

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Find a country by the name stored on a record. */
export function findCountry(name: string | undefined | null): Country | undefined {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return BY_NAME.get(key);
}

/** The flag for a stored country name, or the globe when it is not one we list. */
export function countryFlag(name: string | undefined | null): string {
  const hit = findCountry(name);
  return hit ? flagOf(hit.iso2) : "🌐";
}

/**
 * Options for a ColorSelect. The flag rides in the LABEL rather than needing a
 * new field on the shared option type — the trigger and the menu both draw the
 * label, so one string gets the flag into both places.
 */
export function countryOptions(): { value: string; label: string; noMark: true }[] {
  /* NO DOT BESIDE THE FLAG (Anir, Aug 26: "remove the circles for the country,
     I only need the flag obviously"). The flag already is the mark; a coloured
     dot next to it is a second mark saying nothing, and the same teal dot on
     all fifty-five said less than nothing. Omitting `color` is what stops the
     dot being drawn. */
  return COUNTRIES.map((c) => ({
    value: c.name,
    label: `${flagOf(c.iso2)}  ${c.name}`,
    noMark: true,
  }));
}

/** Options for the dialling-code picker beside a phone number. */
export function dialOptions(): { value: string; label: string; noMark: true }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string; noMark: true }[] = [];
  for (const c of COUNTRIES) {
    const key = `${c.iso2}-${c.dial}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      value: `+${c.dial}`,
      label: `${flagOf(c.iso2)}  +${c.dial}  ${c.name}`,
      noMark: true,
    });
  }
  return out;
}

/**
 * Split a stored phone string into its dialling code and the rest, so an
 * existing "+44 20 7946 0000" reopens with the United Kingdom already chosen
 * instead of dumping the whole thing into the number box.
 */
export function splitPhone(phone: string | undefined | null): {
  dial: string;
  number: string;
} {
  const raw = (phone ?? "").trim();
  if (!raw.startsWith("+")) return { dial: "", number: raw };
  /* Longest code first: +1 must not win over +1 for Canada, but +35 must not
     swallow +353. */
  const codes = [...new Set(COUNTRIES.map((c) => `+${c.dial}`))].sort(
    (a, b) => b.length - a.length
  );
  const hit = codes.find((code) => raw.startsWith(code));
  if (!hit) return { dial: "", number: raw };
  return { dial: hit, number: raw.slice(hit.length).trim() };
}

/** Put a dialling code and a number back together for storage. */
export function joinPhone(dial: string, number: string): string {
  const n = (number ?? "").trim();
  if (!n) return "";
  const d = (dial ?? "").trim();
  return d ? `${d} ${n}` : n;
}
