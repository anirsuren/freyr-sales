import "server-only";

import { COUNTRIES, findCountry } from "@/lib/countries";
import type { CustomerAddress } from "@/lib/customerProfilesShared";
import type {
  AddressSuggestion,
  CompanyDetails,
  CompanySuggestion,
  LookupResponse,
  LookupSource,
} from "@/lib/placeLookupShared";

/**
 * THE LOOKUPS BEHIND ADD CUSTOMER (Anir, Sep 10: "i want it where like when i
 * search it up it looks it up").
 *
 * Google Places answers when GOOGLE_PLACES_API_KEY is set, because that is the
 * box people know: it finds offices as well as streets, anywhere. Without the
 * key, or when Google fails, the open sources answer instead. Wikidata knows
 * companies and their websites, GLEIF (the global register of legal entities)
 * knows where they are registered, and Photon searches OpenStreetMap for
 * addresses. All three are free and need no account.
 *
 * Google's terms do not allow keeping its answers, so only the open sources
 * are remembered here, and only for a few hours.
 */

const USER_AGENT = "FreyrSales/1.0 (+https://freyrsolutions.com)";
const TIMEOUT_MS = 4500;

function googleKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}

export function lookupSource(): LookupSource {
  return googleKey() ? "google" : "open";
}

async function getJson<T>(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------ memory */

type Remembered = { at: number; value: unknown };
const shared = globalThis as typeof globalThis & {
  __FREYR_LOOKUP_MEMORY__?: Map<string, Remembered>;
  __FREYR_LOOKUP_HITS__?: Map<string, number[]>;
};
const memory = (shared.__FREYR_LOOKUP_MEMORY__ ??= new Map<string, Remembered>());
const hits = (shared.__FREYR_LOOKUP_HITS__ ??= new Map<string, number[]>());
const REMEMBER_MS = 6 * 60 * 60 * 1000;

/** Open sources only: Google's answers are never kept. */
async function recall<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < REMEMBER_MS) return hit.value as T;
  const value = await load();
  memory.set(key, { at: Date.now(), value });
  while (memory.size > 600) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  return value;
}

/** A person typing makes a few lookups a second at most; a stuck loop makes hundreds. */
export function lookupAllowed(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((at) => now - at < 60_000);
  const allowed = recent.length < 120;
  if (allowed) recent.push(now);
  hits.set(userId, recent);
  return allowed;
}

/* ------------------------------------------------------------ text */

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

function fold(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Latin script, so it can go straight into the form. */
function readable(value: string | null | undefined): boolean {
  return /^[ -ɏḀ-ỿ -⁯]*$/.test(clean(value));
}

const SHOUTED_SUFFIXES = /\b(Ag|Sa|Se|Bv|Nv|Llc|Llp|Plc|Spa|Sas|Sarl|Srl|Ab|Oy|Kk|Pte|Usa|Uk)\b/g;

/** "79 NEW OXFORD STREET" becomes "79 New Oxford Street"; mixed case stays as written. */
function tidyCase(value: string | null | undefined): string {
  const text = clean(value);
  if (!text || /[a-zß-ÿ]/.test(text) || !/[A-ZÀ-Þ]/.test(text)) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s\-\/(,.'&])([a-zß-þ])/g, (_match, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\bGmbh\b/g, "GmbH")
    .replace(SHOUTED_SUFFIXES, (word) => word.toUpperCase());
}

const NOT_A_COMPANY_SITE = /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube)\.com$|(^|\.)wikipedia\.org$/;

function hostOf(url: string | null | undefined): string | undefined {
  const text = clean(url);
  if (!text) return undefined;
  try {
    const host = new URL(text.includes("://") ? text : `https://${text}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
    if (NOT_A_COMPANY_SITE.test(host)) return undefined;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

function countryName(iso2: string | null | undefined, fallback?: string | null): string {
  const code = clean(iso2).toUpperCase();
  const listed = COUNTRIES.find((country) => country.iso2 === code);
  if (listed) return listed.name;
  return findCountry(fallback)?.name ?? clean(fallback);
}

/* Nobody writes England or Scotland as the state on a UK address. */
const NO_STATE = new Set(["GB"]);

/* Where the house number follows the street: "Zählerweg 10", not "10 Zählerweg". */
const NUMBER_AFTER_STREET = new Set([
  "AR", "AT", "BA", "BE", "BG", "BR", "CH", "CL", "CO", "CZ", "DE", "DK", "EE", "ES", "FI", "GR", "HR",
  "HU", "IS", "IT", "LT", "LU", "LV", "MX", "NL", "NO", "PE", "PL", "PT", "RO", "RS", "RU", "SE", "SI",
  "SK", "TR", "UA", "UY",
]);

type AddressParts = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

function makeAddress(parts: AddressParts): CustomerAddress | undefined {
  const address: CustomerAddress = {
    line1: clean(parts.line1),
    city: clean(parts.city),
    country: clean(parts.country),
  };
  const line2 = clean(parts.line2);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  if (line2 && fold(line2) !== fold(address.line1)) address.line2 = line2;
  if (state && fold(state) !== fold(address.city)) address.state = state;
  if (zip) address.zip = zip;
  return address.line1 || address.city || address.country ? address : undefined;
}

/* ------------------------------------------------------------ Google */

type GoogleText = { text?: string };
type GooglePrediction = {
  placeId?: string;
  text?: GoogleText;
  structuredFormat?: { mainText?: GoogleText; secondaryText?: GoogleText };
};
type GooglePlace = {
  displayName?: GoogleText;
  websiteUri?: string;
  formattedAddress?: string;
  postalAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
};

async function googlePredictions(input: string, session: string | null, key: string) {
  const data = await getJson<{ suggestions?: { placePrediction?: GooglePrediction }[] }>(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: { "X-Goog-Api-Key": key },
      body: { input, languageCode: "en", ...(session ? { sessionToken: session } : {}) },
    }
  );
  return (data.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is GooglePrediction & { placeId: string } => !!prediction?.placeId)
    .map((prediction) => ({
      placeId: prediction.placeId,
      main: clean(prediction.structuredFormat?.mainText?.text) || clean(prediction.text?.text),
      detail: clean(prediction.structuredFormat?.secondaryText?.text),
    }))
    .filter((prediction) => prediction.main);
}

async function googlePlace(placeId: string, fields: string, session: string | null, key: string) {
  const params = new URLSearchParams({ languageCode: "en" });
  if (session) params.set("sessionToken", session);
  return getJson<GooglePlace>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields } }
  );
}

function addressFromGoogle(place: GooglePlace): CustomerAddress | undefined {
  const components = place.addressComponents ?? [];
  const part = (type: string, short = false) => {
    const hit = components.find((component) => component.types?.includes(type));
    return clean(short ? hit?.shortText : hit?.longText);
  };
  const postal = place.postalAddress;
  const iso = (clean(postal?.regionCode) || part("country", true)).toUpperCase();
  const countryLong = part("country");
  const city =
    clean(postal?.locality) ||
    part("locality") ||
    part("postal_town") ||
    part("administrative_area_level_2") ||
    part("sublocality");
  const zip = clean(postal?.postalCode) || part("postal_code");
  let lines = (postal?.addressLines ?? []).map((line) => clean(line)).filter(Boolean);
  if (lines.length === 0) {
    const number = part("street_number");
    const route = part("route");
    const road = route
      ? number
        ? NUMBER_AFTER_STREET.has(iso)
          ? `${route} ${number}`
          : `${number} ${route}`
        : route
      : "";
    lines = [road || part("premise") || clean(place.formattedAddress?.split(",")[0])].filter(Boolean);
  }
  /* A line that only repeats the city, the ZIP or the country has its own box. */
  lines = lines.filter((line) => {
    const folded = fold(line);
    return folded !== fold(city) && folded !== fold(countryLong) && folded !== fold(zip);
  });
  /* A two- or three-letter scrap Google split off ("dist") belongs to the line before it. */
  lines = lines.reduce<string[]>((kept, line) => {
    if (kept.length > 0 && /^[a-z.]{1,4}$/i.test(line)) kept[kept.length - 1] = `${kept[kept.length - 1]} ${line}`;
    else kept.push(line);
    return kept;
  }, []);
  /* The street goes on line 1 and a building name after it: Google lists
     "CASTLEWOOD HOUSE" before "79 New Oxford Street", and someone who typed
     the street should not see it pushed down a line. */
  const route = fold(part("route"));
  const streetAt = route ? lines.findIndex((line) => fold(line).includes(route)) : -1;
  if (streetAt > 0) lines = [lines[streetAt], ...lines.filter((_, index) => index !== streetAt)];
  lines = lines.map((line) => tidyCase(line));
  const subpremise = part("subpremise");
  if (subpremise && !fold(lines.join(" ")).includes(fold(subpremise))) lines.push(subpremise);
  return makeAddress({
    line1: lines[0],
    line2: lines.slice(1).join(", "),
    city,
    state: NO_STATE.has(iso) ? "" : part("administrative_area_level_1"),
    zip,
    country: countryName(iso, countryLong),
  });
}

/* ------------------------------------------------------------ Wikidata */

const WIKIDATA = "https://www.wikidata.org/w/api.php";

type WikidataSnak = { datavalue?: { value?: unknown } };
type WikidataClaim = {
  rank?: string;
  mainsnak?: WikidataSnak;
  qualifiers?: Record<string, WikidataSnak[]>;
};
type WikidataEntity = {
  id?: string;
  labels?: { en?: { value?: string } };
  descriptions?: { en?: { value?: string } };
  claims?: Record<string, WikidataClaim[]>;
};
type WikidataCompany = {
  id: string;
  name: string;
  description: string;
  website?: string;
  city: string;
  country: string;
  countryIso: string;
  lei?: string;
  street?: string;
  zip?: string;
};

async function wikidataEntities(
  ids: (string | undefined)[],
  props: string
): Promise<Record<string, WikidataEntity>> {
  const list = Array.from(new Set(ids.filter((id): id is string => !!id && /^Q\d+$/.test(id)))).slice(0, 50);
  if (list.length === 0) return {};
  const data = await getJson<{ entities?: Record<string, WikidataEntity> }>(
    `${WIKIDATA}?action=wbgetentities&ids=${encodeURIComponent(list.join("|"))}&props=${encodeURIComponent(props)}&languages=en&format=json`
  );
  return data.entities ?? {};
}

function strongest(entity: WikidataEntity | undefined, property: string): WikidataClaim | undefined {
  const claims = entity?.claims?.[property] ?? [];
  return claims.find((claim) => claim.rank === "preferred") ?? claims.find((claim) => claim.rank !== "deprecated");
}

function itemId(value: unknown): string | undefined {
  const id = (value as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" ? id : undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const text = (value as { text?: unknown } | null | undefined)?.text;
  return typeof text === "string" ? text : undefined;
}

function labelOf(entity: WikidataEntity | undefined): string {
  return clean(entity?.labels?.en?.value);
}

/** A website plus something only an organisation has: a headquarters, an industry, staff, revenue, a listing or an LEI. */
function looksLikeCompany(entity: WikidataEntity): boolean {
  const claims = entity.claims ?? {};
  return (
    !!labelOf(entity) &&
    !!claims.P856 &&
    !!(claims.P159 || claims.P452 || claims.P1128 || claims.P2139 || claims.P414 || claims.P1278 || claims.P946)
  );
}

async function isoForCountry(countryId: string | undefined): Promise<string> {
  if (!countryId || !/^Q\d+$/.test(countryId)) return "";
  return recall(`wd:iso:${countryId}`, async () => {
    const data = await getJson<{ claims?: Record<string, WikidataClaim[]> }>(
      `${WIKIDATA}?action=wbgetclaims&entity=${countryId}&property=P297&format=json`
    );
    const claim = data.claims?.P297?.find((candidate) => candidate.rank !== "deprecated");
    return clean(textValue(claim?.mainsnak?.datavalue?.value));
  }).catch(() => "");
}

async function describeCompanies(entities: WikidataEntity[]): Promise<WikidataCompany[]> {
  const countryIds = entities.map((entity) => itemId(strongest(entity, "P17")?.mainsnak?.datavalue?.value));
  const cityIds = entities.map((entity) => itemId(strongest(entity, "P159")?.mainsnak?.datavalue?.value));
  const [places, isos] = await Promise.all([
    wikidataEntities([...countryIds, ...cityIds], "labels"),
    Promise.all(countryIds.map((id) => isoForCountry(id))),
  ]);
  return entities.map((entity, index) => {
    const headquarters = strongest(entity, "P159");
    const iso = isos[index] ?? "";
    return {
      id: entity.id ?? "",
      name: labelOf(entity),
      description: clean(entity.descriptions?.en?.value),
      website: hostOf(textValue(strongest(entity, "P856")?.mainsnak?.datavalue?.value)),
      city: labelOf(places[cityIds[index] ?? ""]),
      country: countryName(iso, labelOf(places[countryIds[index] ?? ""])),
      countryIso: iso,
      lei: clean(textValue(strongest(entity, "P1278")?.mainsnak?.datavalue?.value)) || undefined,
      street: clean(textValue(headquarters?.qualifiers?.P6375?.[0]?.datavalue?.value)) || undefined,
      zip: clean(textValue(headquarters?.qualifiers?.P281?.[0]?.datavalue?.value)) || undefined,
    };
  });
}

async function wikidataCompanies(query: string): Promise<WikidataCompany[]> {
  return recall(`wd:search:${fold(query)}`, async () => {
    const found = await getJson<{ search?: { id?: string }[] }>(
      `${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&uselang=en&type=item&limit=10&format=json`
    );
    const ids = (found.search ?? []).map((hit) => hit.id).filter((id): id is string => !!id && /^Q\d+$/.test(id));
    const entities = await wikidataEntities(ids, "labels|descriptions|claims");
    const companies = ids
      .map((id) => entities[id])
      .filter((entity): entity is WikidataEntity => !!entity && looksLikeCompany(entity))
      .slice(0, 5);
    return describeCompanies(companies);
  });
}

/* ------------------------------------------------------------ GLEIF */

const GLEIF = "https://api.gleif.org/api/v1";
const GLEIF_HEADERS = { Accept: "application/vnd.api+json" };

type GleifAddress = {
  type?: string;
  addressLines?: string[];
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
};
type GleifRecord = {
  id?: string;
  attributes?: {
    entity?: {
      legalName?: { name?: string };
      transliteratedOtherNames?: { name?: string; type?: string }[];
      legalAddress?: GleifAddress;
      headquartersAddress?: GleifAddress;
      otherAddresses?: GleifAddress[];
      transliteratedOtherAddresses?: GleifAddress[];
      status?: string;
      category?: string;
    };
  };
};

/* Pension schemes, staff foundations and funds carry their sponsor's name, in
   every language the register holds: "Fundo De Pensões GSK" is not GSK. It is
   tested against the folded name, so accents and case do not matter. */
const NOT_A_TRADING_COMPANY =
  /\bpens(ion|ions|oes|ioni|ioen|ionskasse)\b|stiftung|foundation|fondation|fundacion|fundacao|\bfunds?\b|\bfundo\b|\bfondo\b|\bfonds\b|scheme|kasse\b|\btrust\b|retirement|provident|superannuation|welfare|wohlfahrt|beteiligung|benefit|\badr\b|\betf\b|hedged|employee|mitarbeiter|\bplan\b/;

function registerName(record: GleifRecord): string {
  const entity = record.attributes?.entity;
  const legal = clean(entity?.legalName?.name);
  if (legal && readable(legal)) return tidyCase(legal);
  const ascii =
    entity?.transliteratedOtherNames?.find((name) => name.type === "PREFERRED_ASCII_TRANSLITERATED_LEGAL_NAME")?.name ??
    entity?.transliteratedOtherNames?.[0]?.name;
  return tidyCase(ascii) || legal;
}

function legible(address: GleifAddress | undefined): address is GleifAddress {
  return !!address && readable([...(address.addressLines ?? []), address.city ?? ""].join(" "));
}

/** The headquarters in a script the form can hold: Takeda's is written in Japanese first. */
function registerHeadquarters(record: GleifRecord): GleifAddress | undefined {
  const entity = record.attributes?.entity;
  const headquarters = entity?.headquartersAddress;
  if (legible(headquarters)) return headquarters;
  const others = [...(entity?.otherAddresses ?? []), ...(entity?.transliteratedOtherAddresses ?? [])];
  const legal = entity?.legalAddress;
  return (
    others.find((address) => /HEADQUARTERS/.test(address.type ?? "") && legible(address)) ??
    (legible(legal) ? legal : undefined) ??
    others.find(legible) ??
    headquarters
  );
}

async function regionName(code: string | undefined): Promise<string> {
  const region = clean(code).toUpperCase();
  if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(region)) return "";
  return recall(`wd:region:${region}`, async () => {
    const found = await getJson<{ query?: { search?: { title?: string }[] } }>(
      `${WIKIDATA}?action=query&list=search&srsearch=${encodeURIComponent(`haswbstatement:P300=${region}`)}&srlimit=1&format=json`
    );
    const id = found.query?.search?.[0]?.title;
    const entities = await wikidataEntities([id], "labels");
    return labelOf(entities[id ?? ""]).replace(/^(Canton|Province|Region|County|Department|Prefecture|State) of /i, "");
  }).catch(() => "");
}

async function registerAddress(address: GleifAddress | undefined): Promise<CustomerAddress | undefined> {
  if (!address) return undefined;
  const iso = clean(address.country).toUpperCase();
  const lines = (address.addressLines ?? [])
    .map((line) => tidyCase(line))
    .filter((line) => line && !/^c\/o\b/i.test(line));
  const first = lines[0] ?? "";
  const rest = lines.slice(1).filter((line) => !fold(first).includes(fold(line)));
  const state = NO_STATE.has(iso) ? "" : await regionName(address.region);
  return makeAddress({
    line1: first,
    line2: rest.join(", "),
    city: tidyCase(address.city),
    state,
    zip: address.postalCode,
    country: countryName(iso),
  });
}

async function registerRecord(lei: string): Promise<GleifRecord | null> {
  if (!/^[A-Z0-9]{20}$/.test(lei)) return null;
  return recall(`lei:record:${lei}`, async () => {
    const data = await getJson<{ data?: GleifRecord }>(`${GLEIF}/lei-records/${lei}`, { headers: GLEIF_HEADERS });
    return data.data ?? null;
  });
}

async function registerSearch(query: string): Promise<GleifRecord[]> {
  const words = fold(query);
  if (!words) return [];
  return recall(`lei:search:${words}`, async () => {
    const full = await getJson<{ data?: GleifRecord[] }>(
      `${GLEIF}/lei-records?filter[fulltext]=${encodeURIComponent(query)}&page[size]=20`,
      { headers: GLEIF_HEADERS }
    );
    if ((full.data ?? []).length > 0) return full.data ?? [];
    /* A half-typed name matches nothing in full text; the register's own completions catch it. */
    const completions = await getJson<{
      data?: { relationships?: { "lei-records"?: { data?: { id?: string } } } }[];
    }>(`${GLEIF}/autocompletions?field=fulltext&q=${encodeURIComponent(query)}`, { headers: GLEIF_HEADERS });
    const leis = (completions.data ?? [])
      .map((completion) => completion.relationships?.["lei-records"]?.data?.id)
      .filter((id): id is string => !!id && /^[A-Z0-9]{20}$/.test(id))
      .slice(0, 10);
    if (leis.length === 0) return [];
    const batch = await getJson<{ data?: GleifRecord[] }>(
      `${GLEIF}/lei-records?filter[lei]=${leis.join(",")}&page[size]=10`,
      { headers: GLEIF_HEADERS }
    );
    return batch.data ?? [];
  });
}

function tradingCompany(record: GleifRecord, query: string): boolean {
  const entity = record.attributes?.entity;
  if (!record.id || entity?.status !== "ACTIVE" || entity?.category === "FUND") return false;
  const name = registerName(record);
  if (!name || NOT_A_TRADING_COMPANY.test(fold(name))) return false;
  const folded = fold(name);
  return fold(query)
    .split(" ")
    .every((word) => folded.includes(word));
}

/** A shouted register name borrows the casing someone typed: CURATEQ reads as CuraTeQ when that is what they wrote. */
function typedCase(name: string, record: GleifRecord, query: string): string {
  const typed = query.split(" ").filter((word) => word && word !== word.toLowerCase());
  const legal = clean(record.attributes?.entity?.legalName?.name);
  if (typed.length === 0 || /[a-zß-ÿ]/.test(legal)) return name;
  return name
    .split(" ")
    .map((word) => typed.find((candidate) => candidate.toLowerCase() === word.toLowerCase()) ?? word)
    .join(" ");
}

async function registerCompanies(query: string) {
  const records = await registerSearch(query);
  return records
    .filter((record) => tradingCompany(record, query))
    .map((record) => {
      const headquarters = registerHeadquarters(record);
      return {
        lei: record.id ?? "",
        name: typedCase(registerName(record), record, query),
        city: tidyCase(headquarters?.city),
        country: countryName(headquarters?.country),
      };
    });
}

/** A registered company with the same name, in the same city or at least the same country. */
async function registerMatch(company: WikidataCompany): Promise<CustomerAddress | undefined> {
  const records = await registerSearch(company.name);
  const wanted = fold(company.name);
  const candidates = records.filter(
    (record) => tradingCompany(record, company.name) && fold(registerName(record)).startsWith(wanted)
  );
  let pick: GleifRecord | undefined;
  if (company.city) {
    const city = fold(company.city);
    pick = candidates.find((record) => fold(registerHeadquarters(record)?.city) === city);
  } else if (company.countryIso) {
    pick = candidates.find(
      (record) => clean(registerHeadquarters(record)?.country).toUpperCase() === company.countryIso
    );
  }
  return pick ? registerAddress(registerHeadquarters(pick)) : undefined;
}

/* ------------------------------------------------------------ open company lookup */

async function openCompanies(query: string): Promise<CompanySuggestion[]> {
  const [wikidata, register] = await Promise.allSettled([wikidataCompanies(query), registerCompanies(query)]);
  if (wikidata.status === "rejected" && register.status === "rejected") {
    throw new Error("Neither Wikidata nor GLEIF answered.");
  }
  const known = wikidata.status === "fulfilled" ? wikidata.value : [];
  const registered = register.status === "fulfilled" ? register.value : [];
  const results: CompanySuggestion[] = known.map((company) => ({
    ref: `wd:${company.id}`,
    name: company.name,
    source: "open",
    detail:
      [company.website, [company.city, company.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") ||
      company.description,
  }));
  const leis = new Set(known.map((company) => company.lei).filter(Boolean));
  const names = new Set(known.map((company) => fold(company.name)));
  /* The register's rows are the subsidiaries and small companies Wikidata misses; a few are enough beside it. */
  const limit = results.length + (known.length === 0 ? 6 : known.length >= 3 ? 3 : 4);
  const typed = fold(query);
  const beginsWithTyped = (name: string) => fold(name).startsWith(typed);
  const ordered = [...registered].sort((a, b) => Number(beginsWithTyped(b.name)) - Number(beginsWithTyped(a.name)));
  for (const company of ordered) {
    if (results.length >= limit) break;
    /* Beside Wikidata's answers, only register names that begin with what was
       typed earn a row: "Roche Kapitalmarkt AG", not "Scea Chateau De La Roche". */
    if (known.length > 0 && !beginsWithTyped(company.name)) continue;
    if (!company.lei || leis.has(company.lei) || names.has(fold(company.name))) continue;
    names.add(fold(company.name));
    results.push({
      ref: `lei:${company.lei}`,
      name: company.name,
      source: "open",
      detail: [[company.city, company.country].filter(Boolean).join(", "), "company register"]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return results;
}

async function openCompanyDetails(ref: string): Promise<CompanyDetails | null> {
  if (ref.startsWith("lei:")) {
    const record = await registerRecord(ref.slice(4));
    if (!record) return null;
    return { name: registerName(record), hq: await registerAddress(registerHeadquarters(record)) };
  }
  const id = ref.slice(3);
  const entities = await wikidataEntities([id], "labels|descriptions|claims");
  const entity = entities[id];
  if (!entity || !labelOf(entity)) return null;
  const [company] = await describeCompanies([entity]);
  if (!company) return null;
  const known = { name: company.name, website: company.website };

  /* 1. The register, through the LEI Wikidata holds: the full street address. */
  if (company.lei) {
    const record = await registerRecord(company.lei).catch(() => null);
    const hq = record ? await registerAddress(registerHeadquarters(record)) : undefined;
    if (hq?.line1) return { ...known, hq };
  }
  /* 2. The street Wikidata records on the headquarters itself. */
  if (company.street) {
    return {
      ...known,
      hq: makeAddress({ line1: company.street, city: company.city, zip: company.zip, country: company.country }),
    };
  }
  /* 3. A registered company of that name in that city, or at least that country. */
  const matched = await registerMatch(company).catch(() => undefined);
  if (matched?.line1) return { ...known, hq: matched };
  /* 4. What is known for certain: the city and the country. */
  return { ...known, hq: makeAddress({ city: company.city, country: company.country }) };
}

/* ------------------------------------------------------------ Photon */

type PhotonProperties = {
  osm_id?: number;
  type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  district?: string;
  locality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
};

const AREA_TYPES = new Set(["city", "town", "village", "district", "locality"]);

async function openAddresses(query: string): Promise<AddressSuggestion[]> {
  const data = await recall(`osm:${query.trim().toLowerCase()}`, () =>
    getJson<{ features?: { properties?: PhotonProperties }[] }>(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`
    )
  );
  /* "79 New Oxford Street" finds the street but not always number 79, so the typed number is kept. */
  const typedNumber = /^\s*(\d+[a-z]?(?:[-\/]\d+[a-z]?)?)\s+\S/i.exec(query)?.[1] ?? "";
  const features = data.features ?? [];
  const seen = new Set<string>();
  const results: AddressSuggestion[] = [];
  for (let index = 0; index < features.length && results.length < 6; index += 1) {
    const place = features[index]?.properties ?? {};
    const type = place.type ?? "";
    if (!type || type === "country" || type === "state" || type === "county") continue;
    const iso = clean(place.countrycode).toUpperCase();
    const area = AREA_TYPES.has(type);
    const street = clean(place.street) || (type === "street" ? clean(place.name) : "");
    const borrowed = !clean(place.housenumber) && type === "street" && !!typedNumber;
    const number = clean(place.housenumber) || (borrowed ? typedNumber : "");
    const road = street
      ? number
        ? NUMBER_AFTER_STREET.has(iso)
          ? `${street} ${number}`
          : `${number} ${street}`
        : street
      : "";
    const address = makeAddress({
      line1: area ? "" : road || clean(place.name),
      city: area
        ? clean(place.name) || clean(place.city)
        : clean(place.city) || clean(place.locality) || clean(place.district) || clean(place.county),
      state: NO_STATE.has(iso) ? "" : place.state,
      /* A long street has a different ZIP on each stretch, and which one the typed number sits on is unknown. */
      zip: borrowed ? "" : place.postcode,
      country: countryName(iso, place.country),
    });
    if (!address) continue;
    const main = address.line1 || address.city || address.country;
    const detail = address.line1
      ? [[address.city, address.zip].filter(Boolean).join(" "), address.state, address.country].filter(Boolean).join(", ")
      : [address.state, address.country].filter(Boolean).join(", ");
    const key = fold(borrowed ? `${main} ${address.city} ${address.country}` : `${main} ${detail}`);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ ref: `osm:${place.osm_id ?? index}`, main, detail, address });
  }
  return results;
}

/* ------------------------------------------------------------ the four lookups */

function noteFallback(what: string, error: unknown) {
  console.warn(
    `[lookup] Google ${what} failed, the open sources answered: ${error instanceof Error ? error.message : String(error)}`
  );
}

/**
 * COMPANIES: THE REGISTERS FIRST, GOOGLE FOR WHAT THEY MISS.
 *
 * Tried on Sep 10 with the key in: Google's answers to "GSK" were the sites
 * nearest the server (a heliport and three offices in Pennsylvania), and
 * picking the first named the customer "Smithkline Beecham Heliport".
 * Wikidata and GLEIF answer with the company itself, its website and its
 * registered headquarters, which is what a customer record wants. Google is
 * asked only when they find fewer than two, where a small company's office on
 * the map earns its row.
 */
export async function searchCompanies(
  query: string,
  session: string | null
): Promise<LookupResponse<CompanySuggestion>> {
  const open = await openCompanies(query).catch((error: unknown) => {
    console.warn(`[lookup] open company search failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  const results: CompanySuggestion[] = open ?? [];
  const credits: LookupSource[] = open && open.length > 0 ? ["open"] : [];
  const key = googleKey();
  if (!open && !key) throw new Error("The open sources did not answer.");
  if (key && results.length < 2) {
    try {
      const listed = new Set(results.map((result) => fold(result.name)));
      const predictions = await googlePredictions(query, session, key);
      const offices = predictions
        .filter((prediction) => !listed.has(fold(prediction.main)))
        .map((prediction) => ({
          ref: `g:${prediction.placeId}`,
          name: prediction.main,
          detail: prediction.detail,
          source: "google" as const,
        }));
      if (offices.length > 0) {
        results.push(...offices);
        credits.push("google");
      }
    } catch (error) {
      if (!open) throw error;
      noteFallback("company search", error);
    }
  }
  return { source: credits.includes("google") && !credits.includes("open") ? "google" : "open", credits, results };
}

export async function companyDetails(ref: string, session: string | null): Promise<CompanyDetails | null> {
  if (ref.startsWith("g:")) {
    const key = googleKey();
    if (!key) return null;
    const place = await googlePlace(
      ref.slice(2),
      "displayName,websiteUri,formattedAddress,postalAddress,addressComponents",
      session,
      key
    );
    const name = clean(place.displayName?.text);
    if (!name) return null;
    return { name, website: hostOf(place.websiteUri), hq: addressFromGoogle(place) };
  }
  return openCompanyDetails(ref);
}

export async function searchAddresses(
  query: string,
  session: string | null
): Promise<LookupResponse<AddressSuggestion>> {
  const key = googleKey();
  if (key) {
    try {
      const predictions = await googlePredictions(query, session, key);
      return {
        source: "google",
        credits: ["google"],
        results: predictions.map((prediction) => ({
          ref: `g:${prediction.placeId}`,
          main: prediction.main,
          detail: prediction.detail,
        })),
      };
    } catch (error) {
      noteFallback("address search", error);
    }
  }
  return { source: "open", credits: ["open"], results: await openAddresses(query) };
}

export async function addressDetails(ref: string, session: string | null): Promise<CustomerAddress | null> {
  const key = googleKey();
  if (!key || !ref.startsWith("g:")) return null;
  const place = await googlePlace(ref.slice(2), "formattedAddress,postalAddress,addressComponents", session, key);
  return addressFromGoogle(place) ?? null;
}
