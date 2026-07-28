// Country flags for the geography strings on accounts.
//
// Those strings are free text, not a country code — "United States (Princeton,
// NJ) — offices in London, Singapore" is a real value. So we match the country
// by name rather than expecting an ISO code, and match the LONGEST name first
// so "United States" never loses to a substring.
//
// Flags are emoji (regional indicator pairs), not images: they need no network
// request, scale with the text, and stay crisp on any display.

const COUNTRY_CODES: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  "united kingdom": "GB",
  "great britain": "GB",
  switzerland: "CH",
  singapore: "SG",
  germany: "DE",
  canada: "CA",
  ireland: "IE",
  france: "FR",
  india: "IN",
  japan: "JP",
  china: "CN",
  australia: "AU",
  netherlands: "NL",
  belgium: "BE",
  denmark: "DK",
  sweden: "SE",
  norway: "NO",
  finland: "FI",
  spain: "ES",
  italy: "IT",
  austria: "AT",
  poland: "PL",
  israel: "IL",
  "south korea": "KR",
  korea: "KR",
  brazil: "BR",
  mexico: "MX",
  "south africa": "ZA",
  "new zealand": "NZ",
  portugal: "PT",
  "czech republic": "CZ",
  hungary: "HU",
  turkey: "TR",
  uae: "AE",
  "united arab emirates": "AE",
};

// Common shorthands that appear instead of the country name.
const ALIASES: Record<string, string> = {
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  us: "US",
  uk: "GB",
  "u.k.": "GB",
  eu: "EU",
  europe: "EU",
};

/** Longest names first, so "United States" wins over a shorter partial match. */
const SORTED_NAMES = Object.keys(COUNTRY_CODES).sort(
  (a, b) => b.length - a.length
);

/** ISO 3166 alpha-2 → the regional-indicator pair that renders as a flag. */
function codeToFlag(code: string): string {
  if (code === "EU") return "🇪🇺";
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((char) => 0x1f1e6 + char.charCodeAt(0) - 65)
  );
}

/**
 * The flag for a free-text geography string, or null when no country is named.
 * Returning null (rather than a globe or a blank) lets callers render exactly
 * what they had before, so nothing shifts for "Unknown" or an empty field.
 */
// Sales territories are not countries, so the country lookup below never
// matched them and every rep's region rendered flagless (Anir, Jul 26: "you're
// saying countries and regions etc, but you're not saying any flags"). Each
// territory shows the flag of the country that anchors it; multi-country
// territories (MEA, LATAM, APAC, Nordics) get a globe rather than pretending to
// be one nation.
const TERRITORY_FLAGS: Record<string, string> = {
  dach: "🇩🇪", // Germany, Austria, Switzerland
  "uk & ireland": "🇬🇧",
  "uk and ireland": "🇬🇧",
  "southern eu": "🇮🇹",
  nordics: "🌍",
  benelux: "🇳🇱",
  iberia: "🇪🇸",
  "na west": "🇺🇸",
  "na east": "🇺🇸",
  "north america": "🇺🇸",
  latam: "🌎",
  mea: "🌍",
  emea: "🌍",
  apac: "🌏",
};

export function flagForGeography(geography?: string | null): string | null {
  if (!geography) return null;
  const haystack = geography.toLowerCase();

  // Territory names are checked first — "NA West" would otherwise never match,
  // and a bare "Japan"/"China"/"India" territory still falls through to the
  // country table below and gets its real flag.
  for (const [territory, flag] of Object.entries(TERRITORY_FLAGS)) {
    const escaped = territory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack)) return flag;
  }

  for (const name of SORTED_NAMES) {
    // Word-boundary match so "india" doesn't fire inside "indiana".
    const pattern = new RegExp(`(^|[^a-z])${name}([^a-z]|$)`);
    if (pattern.test(haystack)) return codeToFlag(COUNTRY_CODES[name]);
  }

  for (const [alias, code] of Object.entries(ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`);
    if (pattern.test(haystack)) return codeToFlag(code);
  }

  return null;
}

/**
 * The country a geography string names, and NOTHING else.
 *
 * Account geography is free text and it arrives carrying cities and prose —
 * "United States (Princeton, NJ) — offices in London, Singapore" is a real seed
 * value. Suren, Jul 27: "I don't think you need to see Cambridge. I don't think
 * we care about cities. We only care about countries, so just remove cities."
 * So this is the one place that decides what a geography DISPLAYS as, and every
 * renderer goes through it:
 *
 *   "United States (Princeton, NJ) — offices in London, Singapore" → "United States"
 *   "United Kingdom (Cambridge)"                                   → "United Kingdom"
 *   "India (Mumbai) — expanding to EU"                             → "India"
 *   "APAC" / "NA West" / "MEA"                                     → unchanged
 *   "Unknown"                                                      → "Unknown"
 *   "" / null                                                      → the caller's fallback
 *
 * A sales territory is not a country, so a known territory survives whole —
 * otherwise "UK & Ireland" would be quietly reduced to "Ireland", which is a
 * different (and wrong) fact. Anything else with no country in it is returned
 * untouched rather than blanked: we never invent a country we can't read.
 */
export function countryOnlyGeography(
  geography?: string | null,
  fallback = ""
): string {
  const text = geography?.trim();
  if (!text) return fallback;
  if (TERRITORY_FLAGS[text.toLowerCase()]) return text;
  return countryNameForGeography(text) || text;
}

/**
 * The geography's flag + its COUNTRY, for the places that render plain strings
 * rather than components (the label/value fact lists on the report, session and
 * account-card views). Returns the fallback untouched for an empty field, so
 * "Unknown" never gains a stray space.
 */
export function geographyWithFlag(
  geography?: string | null,
  fallback = "—"
): string {
  const country = countryOnlyGeography(geography);
  if (!country) return fallback;
  const flag = flagForGeography(country);
  return flag ? `${flag} ${country}` : country;
}

/**
 * The country name a geography string leads with — "United States (Princeton,
 * NJ)" reads as "United States". Used for the flag's accessible label so a
 * screen reader announces a country, not an unnamed emoji.
 */
export function countryNameForGeography(
  geography?: string | null
): string | null {
  if (!geography) return null;
  const haystack = geography.toLowerCase();
  for (const name of SORTED_NAMES) {
    const pattern = new RegExp(`(^|[^a-z])${name}([^a-z]|$)`);
    if (pattern.test(haystack)) {
      return name
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        // "United States Of America" reads wrong — small words stay lowercase.
        .replace(/\bOf\b/g, "of");
    }
  }
  return null;
}
