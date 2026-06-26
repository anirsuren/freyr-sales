// Offerings repository (requirement #1 from Suren's video review — see
// SUREN-VIDEO-REVIEW.md). A self-contained mock store (globalThis-backed, like
// lib/mock-db) so it survives dev HMR and doesn't touch the shared Db type.
// Holds Freyr's offerings, the customer-type definitions, and the markets, plus
// the sales-material artifacts attached to each offering.

export type CustomerFamily =
  | "Pharmaceutical"
  | "Biologics"
  | "Bio Pharmaceutical";
export type CustomerSize = "Small" | "Mid size" | "Large";

// A customer type with its definition (Sheet 2 in the video).
export interface CustomerType {
  id: string;
  name: string; // e.g. "Pharmaceutical - Small"
  family: CustomerFamily;
  size: CustomerSize;
  product_type: string;
  revenue: string;
  employees: string;
  operational_focus: string;
}

export interface Market {
  id: string;
  name: string; // USA, Europe, Japan, China, Korea …
}

// An offering type as a managed master list (Suren's change #2, Jun 25 video):
// each type carries a name + a description, like the customer-type definitions.
export interface OfferingType {
  id: string;
  name: string; // e.g. "Freya - Module + Agent", "Freyr AI Native Service"
  description: string;
}

export type MaterialKind =
  | "video"
  | "presentation"
  | "whitepaper"
  | "pricing"
  | "competition"
  | "case_study"
  | "reference";

export interface OfferingMaterial {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string;
}

export interface Offering {
  id: string;
  offering_type: string;
  offering_name: string;
  offering_description: string;
  current_availability: string;
  future_availability: string; // "Availability comments" in the UI
  poc: string; // SME / service-delivery POC who owns this offering's data
  early_adopters: string[]; // customers piloting/using it first (Suren's live-meeting ask)
  customer_type_ids: string[]; // applicable customer types (one or more)
  market_ids: string[]; // applicable markets
  materials: OfferingMaterial[];
  created_at: string;
}

export const MATERIAL_META: Record<
  MaterialKind,
  { label: string; plural: string }
> = {
  video: { label: "Video", plural: "Videos" },
  presentation: { label: "Sales presentation", plural: "Sales presentations" },
  whitepaper: {
    label: "Whitepaper / thought leadership",
    plural: "Whitepapers & thought leadership",
  },
  pricing: { label: "Pricing", plural: "Pricing" },
  // Added from Suren's live meeting — material types a rep grabs per offering.
  competition: { label: "Competition", plural: "Competition" },
  case_study: { label: "Case study", plural: "Case studies" },
  reference: { label: "Customer reference", plural: "Customer references" },
};

// ---------------------------------------------------------------------------
// Seed (read directly from Suren's two sheets)
// ---------------------------------------------------------------------------
const FOCUS_SMALL =
  "Focused on R&D / discovery; often single-asset or niche-pipeline companies.";
const FOCUS_MID =
  "Growing pipeline; typically have 1–2 commercial products; mid-market infrastructure.";
const FOCUS_LARGE =
  "Global commercial footprint; massive R&D portfolios; often involve complex manufacturing networks.";
const PROD_PHARMA =
  "Focuses on small-molecule drugs derived from chemical synthesis (e.g. aspirin, ibuprofen).";
const PROD_BIO =
  "Focuses on large-molecule products derived from living organisms (e.g. vaccines, antibodies, cell and gene therapies).";
const PROD_BIOPHARMA =
  "A hybrid entity that utilizes both chemical synthesis and biotechnology platforms to develop therapies.";

function ct(
  id: string,
  family: CustomerFamily,
  size: CustomerSize,
  product_type: string,
  revenue: string,
  employees: string,
  operational_focus: string
): CustomerType {
  return {
    id,
    name: `${family} - ${size}`,
    family,
    size,
    product_type,
    revenue,
    employees,
    operational_focus,
  };
}

function seedCustomerTypes(): CustomerType[] {
  return [
    ct("ct-pharma-s", "Pharmaceutical", "Small", PROD_PHARMA, "Under $500M", "< 500", FOCUS_SMALL),
    ct("ct-pharma-m", "Pharmaceutical", "Mid size", PROD_PHARMA, "$500M – $5B", "500 – 5,000", FOCUS_MID),
    ct("ct-pharma-l", "Pharmaceutical", "Large", PROD_PHARMA, "$5B+", "5,000+", FOCUS_LARGE),
    ct("ct-bio-s", "Biologics", "Small", PROD_BIO, "Under $500M", "< 500", FOCUS_SMALL),
    ct("ct-bio-m", "Biologics", "Mid size", PROD_BIO, "$500M – $5B", "500 – 5,000", FOCUS_MID),
    ct("ct-bio-l", "Biologics", "Large", PROD_BIO, "$5B+", "5,000+", FOCUS_LARGE),
    ct("ct-biopharma-s", "Bio Pharmaceutical", "Small", PROD_BIOPHARMA, "Under $500M", "< 500", FOCUS_SMALL),
    ct("ct-biopharma-m", "Bio Pharmaceutical", "Mid size", PROD_BIOPHARMA, "$500M – $5B", "500 – 5,000", FOCUS_MID),
    ct("ct-biopharma-l", "Bio Pharmaceutical", "Large", PROD_BIOPHARMA, "$5B+", "5,000+", FOCUS_LARGE),
  ];
}

function seedMarkets(): Market[] {
  return [
    { id: "mkt-usa", name: "USA" },
    { id: "mkt-europe", name: "Europe" },
    { id: "mkt-japan", name: "Japan" },
    { id: "mkt-china", name: "China" },
    { id: "mkt-korea", name: "Korea" },
  ];
}

// The 5 offering types, VERBATIM from Suren's "Digital Sales and Marketing.xlsx"
// → "Offering Type" sheet, descriptions and all. (He confirmed these in the live
// meeting: "these are all the offering types.")
function seedOfferingTypes(): OfferingType[] {
  return [
    {
      id: "ot-fusion-module",
      name: "Freya Fusion (Module)",
      description:
        "Freya Fusion is a platform comprising multiple modules, such as Freya.Register and Freya.Submit. These modules serve as the system of record for Product Registration and Health Authority Submissions data, providing the foundational data for each respective module.",
    },
    {
      id: "ot-fusion-agent",
      name: "Freya Fusion (Module + Module Agent/s)",
      description:
        'The Freya Fusion platform includes specialized agents tailored to specific modules or their underlying data. For instance, the "Via" agent operates on the GRR (Post-Approval Changes) module, while the "Pia" and "Mia" agents function within the Freya.Register module.',
    },
    {
      id: "ot-fusion-addon",
      name: "Freya Fusion (Module + Module Agent/s + Add on Agent/s)",
      description:
        'Offerings can be customized to include modules, module-specific agents, and additional agents not natively connected to the primary module. For example, the "Via" agent can be bundled with the Freya.Register module and its corresponding agents, "Pia" and "Mia."',
    },
    {
      id: "ot-freyr-ai-native",
      name: "Freyr AI Native Services",
      description:
        "Building on years of regulatory experience, Freyr has transitioned into a new era by integrating AI-driven digital capabilities with human expertise to deliver cost and efficiency.",
    },
    {
      id: "ot-freyr-services",
      name: "Freyr Services",
      description:
        "While not all Freyr services have transitioned to an AI-native model yet, the company is actively working toward ensuring that all future service offerings become fully AI-native.",
    },
  ];
}

const ALL_CT = [
  "ct-pharma-s", "ct-pharma-m", "ct-pharma-l",
  "ct-bio-s", "ct-bio-m", "ct-bio-l",
  "ct-biopharma-s", "ct-biopharma-m", "ct-biopharma-l",
];
const ALL_MKT = ["mkt-usa", "mkt-europe", "mkt-japan", "mkt-china", "mkt-korea"];
// Suren's sheet marks Freya.Label and Freya.Artwork "Not Applicable" for the
// Small segment of every family — those start at mid-size.
const NO_SMALL_CT = [
  "ct-pharma-m", "ct-pharma-l",
  "ct-bio-m", "ct-bio-l",
  "ct-biopharma-m", "ct-biopharma-l",
];

function off(
  id: string,
  offering_type: string,
  offering_name: string,
  offering_description: string,
  opts: Partial<Offering> = {}
): Offering {
  return {
    id,
    offering_type,
    offering_name,
    offering_description,
    // Defaults are blank to mirror Suren's sheet (most rows are unfilled — he
    // populates them via the entry screen). Populated rows pass values in.
    current_availability: opts.current_availability ?? "",
    future_availability: opts.future_availability ?? "",
    poc: opts.poc ?? "",
    early_adopters: opts.early_adopters ?? [],
    customer_type_ids: opts.customer_type_ids ?? [],
    market_ids: opts.market_ids ?? [],
    materials: opts.materials ?? [],
    created_at: opts.created_at ?? "2026-06-20T12:00:00.000Z",
  };
}

// Seeded VERBATIM from Suren's "Digital Sales and Marketing.xlsx" → "Offerings"
// sheet: the offering names, current-availability + comments, the customer-type
// applicability matrix (Label/Artwork are Not Applicable to Small), and the
// Early Adopters column. Offering descriptions are blank in his sheet — they come
// from the sales materials we write (per the live meeting), and the offering
// TYPE description carries the system-of-record / data framing meanwhile.
// Markets are sample values on the currently-available core modules (his sheet
// has no markets column). Service-delivery POCs on the four service offerings
// carry over from Sara's MPR list.
const FREYR_URL = {
  resources: "https://www.freyrsolutions.com/resources",
  insights: "https://www.freyrsolutions.com/insights",
  contact: "https://www.freyrsolutions.com/contact-us",
};
const MODULE = "Freya Fusion (Module)";
const MODULE_AGENT = "Freya Fusion (Module + Module Agent/s)";
const MODULE_AGENT_ADDON = "Freya Fusion (Module + Module Agent/s + Add on Agent/s)";

// MPR service offerings — Sara's services-team list, with the updates from
// Mukundh & Pragyan (Label/Artwork "Management", Regulatory Intelligence
// Services under Aditi Kalia, and the new RIMS Data Services). One offering
// type ("Freyr Services"); each carries its service-delivery POC. Markets /
// customer types / materials are collected per POC, so they start blank.
const MPR_SERVICES: [string, string][] = [
  ["Publishing", "Ragav"],
  ["Submissions Planning", "Ragav"],
  ["Label Management", "Sathya K"],
  ["Label Content Management Services", "Sathya K"],
  ["Artwork Management", "Pranab Gogoi"],
  ["Regulatory Affairs Strategy", "Mukundh / Suresh Modugu"],
  ["Regulatory Affairs Submissions", "Mukundh / Suresh Modugu"],
  ["Local Regulatory Affairs", "Mukundh / Suresh Modugu"],
  ["Regulatory Intelligence Services", "Aditi Kalia"],
  ["Market Access", "Tamal"],
  ["Pharmacovigilance", "Gurpreet Kaur"],
  ["Medical Writing - Clinical", "Seema Gurbani"],
  ["Medical Writing - Non Clinical", "Seema Gurbani"],
  ["Compliance and Audit", "Anushta Chandrapalan"],
  ["Medical & Scientific Communication", "Padmaja Jagannathan"],
  ["RIMS Data Services (Data QC, Veeva support, PLM, Master Data Mgt.)", "Vikrant Mahajan"],
];

function seedOfferings(): Offering[] {
  return [
    off("of-001", MODULE, "Freya.Register", "", {
      current_availability: "Currently available",
      future_availability: "Version 1",
      early_adopters: ["Galderma"],
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      materials: [
        { id: "m-001", kind: "video", label: "Freya.Register overview", url: FREYR_URL.resources },
        { id: "m-002", kind: "reference", label: "Galderma — early-adopter story", url: FREYR_URL.insights },
        { id: "m-003", kind: "case_study", label: "Cutting registration cycle time", url: FREYR_URL.insights },
      ],
    }),
    off("of-002", MODULE, "Freya.Intelligence", "", {
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-003", MODULE, "Freya.GRR - PAC  ( Global Regulatory Requirements for Post Approval Changes)", "", {
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-004", MODULE, "Freya.Label", "", {
      current_availability: "October 2026",
      customer_type_ids: NO_SMALL_CT,
    }),
    off("of-005", MODULE, "Freya.Submit", "", {
      current_availability: "December 2026",
      customer_type_ids: ALL_CT,
    }),
    off("of-006", MODULE, "Freya.Artwork", "", {
      current_availability: "October 2026",
      customer_type_ids: NO_SMALL_CT,
    }),
    off("of-007", MODULE, "Freya.Plan & Track", "", {
      customer_type_ids: ALL_CT,
    }),
    off("of-008", MODULE, "Freya.RA Changes", "", {
      current_availability: "To be decided",
      future_availability: "May be next year",
      customer_type_ids: ALL_CT,
    }),
    off("of-009", MODULE, "Freya.OmniObject", "", {
      current_availability: "To be decided",
      future_availability: "End of this year",
      customer_type_ids: ALL_CT,
    }),
    off("of-010", MODULE_AGENT, "Freya.Register + Pia +Mia", "", {
      current_availability: "Currently available",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-011", MODULE_AGENT, "Freya.GRR-PAC + Via", "", {
      customer_type_ids: ALL_CT,
    }),
    off("of-012", MODULE_AGENT_ADDON, "Freya.Register + Pia +Mia + Via", "", {
      current_availability: "To be decided",
      future_availability: "Pilot available now",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      materials: [
        { id: "m-012a", kind: "video", label: "Via Agents demo", url: FREYR_URL.resources },
        { id: "m-012b", kind: "whitepaper", label: "Post-approval change automation", url: FREYR_URL.insights },
        { id: "m-012c", kind: "pricing", label: "Register stack pricing", url: FREYR_URL.contact },
        { id: "m-012d", kind: "competition", label: "Freya vs. legacy RIM vendors", url: FREYR_URL.insights },
      ],
    }),
    // of-013 onward: the granular MPR services from Sara's list.
    ...MPR_SERVICES.map(([name, poc], i) =>
      off(`of-${String(13 + i).padStart(3, "0")}`, "Freyr Services", name, "", {
        poc,
      })
    ),
  ];
}

// ---------------------------------------------------------------------------
// In-memory store (globalThis so it survives dev HMR)
// ---------------------------------------------------------------------------
interface OfferingsStore {
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
  offerings: Offering[];
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_STORE__: OfferingsStore | undefined;
}

function seed(): OfferingsStore {
  return {
    customerTypes: seedCustomerTypes(),
    markets: seedMarkets(),
    offeringTypes: seedOfferingTypes(),
    offerings: seedOfferings(),
  };
}

const store: OfferingsStore = globalThis.__FREYR_OFFERINGS_STORE__ ?? seed();
if (!globalThis.__FREYR_OFFERINGS_STORE__) {
  globalThis.__FREYR_OFFERINGS_STORE__ = store;
}
// Back-fill collections added in a later build onto a store that an earlier build
// already created (matters only for dev HMR; prod always starts fresh).
if (!store.offeringTypes) store.offeringTypes = seedOfferingTypes();

function rid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export function listCustomerTypes(): CustomerType[] {
  return [...store.customerTypes];
}
export function getCustomerType(id: string): CustomerType | null {
  return store.customerTypes.find((c) => c.id === id) || null;
}
export function createCustomerType(data: Omit<CustomerType, "id">): CustomerType {
  // A family+size pair identifies a customer type, so don't create a second
  // "Pharmaceutical - Small" — refine the existing definition instead (blank
  // fields leave the current value intact). Mirrors createMarket's dedupe.
  const existing = store.customerTypes.find(
    (c) => c.family === data.family && c.size === data.size
  );
  if (existing) {
    existing.product_type = data.product_type || existing.product_type;
    existing.revenue = data.revenue || existing.revenue;
    existing.employees = data.employees || existing.employees;
    existing.operational_focus =
      data.operational_focus || existing.operational_focus;
    existing.name = data.name || existing.name;
    return existing;
  }
  const record: CustomerType = { ...data, id: rid("ct") };
  store.customerTypes.push(record);
  return record;
}
export function updateCustomerType(
  id: string,
  data: Partial<CustomerType>
): CustomerType | null {
  const i = store.customerTypes.findIndex((c) => c.id === id);
  if (i === -1) return null;
  store.customerTypes[i] = { ...store.customerTypes[i], ...data, id };
  return store.customerTypes[i];
}

export function listMarkets(): Market[] {
  return [...store.markets];
}
export function createMarket(name: string): Market {
  const existing = store.markets.find(
    (m) => m.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) return existing;
  const record: Market = { id: rid("mkt"), name: name.trim() };
  store.markets.push(record);
  return record;
}

export function deleteMarket(id: string): boolean {
  const before = store.markets.length;
  store.markets = store.markets.filter((m) => m.id !== id);
  if (store.markets.length === before) return false;
  // Strip the removed market from every offering so nothing references a ghost id.
  for (const o of store.offerings) {
    o.market_ids = o.market_ids.filter((mid) => mid !== id);
  }
  return true;
}

// ---- Offering types (managed master list) --------------------------------
export function listOfferingTypes(): OfferingType[] {
  return [...store.offeringTypes];
}
export function getOfferingType(id: string): OfferingType | null {
  return store.offeringTypes.find((t) => t.id === id) || null;
}
export function createOfferingType(data: {
  name: string;
  description?: string;
}): OfferingType {
  const name = String(data.name || "").trim();
  // Dedupe by name (like markets) — re-adding an existing type updates its
  // description instead of creating a duplicate.
  const existing = store.offeringTypes.find(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    if (data.description) existing.description = data.description.trim();
    return existing;
  }
  const record: OfferingType = {
    id: rid("ot"),
    name,
    description: (data.description || "").trim(),
  };
  store.offeringTypes.push(record);
  return record;
}
export function updateOfferingType(
  id: string,
  data: Partial<Omit<OfferingType, "id">>
): OfferingType | null {
  const i = store.offeringTypes.findIndex((t) => t.id === id);
  if (i === -1) return null;
  store.offeringTypes[i] = { ...store.offeringTypes[i], ...data, id };
  return store.offeringTypes[i];
}
export function deleteOfferingType(id: string): boolean {
  // Removes the definition from the master list. Offerings keep their
  // offering_type string — this just drops the managed entry/description.
  const before = store.offeringTypes.length;
  store.offeringTypes = store.offeringTypes.filter((t) => t.id !== id);
  return store.offeringTypes.length < before;
}
// Keep the master list complete when an offering introduces a brand-new type
// name via the entry form, so it shows up in the filter and the manager.
function ensureOfferingType(name: string) {
  const n = String(name || "").trim();
  if (!n) return;
  if (
    !store.offeringTypes.some((t) => t.name.toLowerCase() === n.toLowerCase())
  ) {
    store.offeringTypes.push({ id: rid("ot"), name: n, description: "" });
  }
}

export function listOfferings(): Offering[] {
  return [...store.offerings];
}
export function getOffering(id: string): Offering | null {
  return store.offerings.find((o) => o.id === id) || null;
}
export function createOffering(data: Partial<Offering>): Offering {
  const record: Offering = {
    id: rid("of"),
    offering_type: data.offering_type || "",
    offering_name: data.offering_name || "Untitled offering",
    offering_description: data.offering_description || "",
    current_availability: data.current_availability || "",
    future_availability: data.future_availability || "",
    poc: data.poc || "",
    early_adopters: data.early_adopters || [],
    customer_type_ids: data.customer_type_ids || [],
    market_ids: data.market_ids || [],
    materials: (data.materials || []).map((m) => ({ ...m, id: m.id || rid("m") })),
    created_at: new Date().toISOString(),
  };
  ensureOfferingType(record.offering_type);
  store.offerings.unshift(record);
  return record;
}
export function updateOffering(
  id: string,
  data: Partial<Offering>
): Offering | null {
  const i = store.offerings.findIndex((o) => o.id === id);
  if (i === -1) return null;
  const materials = data.materials
    ? data.materials.map((m) => ({ ...m, id: m.id || rid("m") }))
    : store.offerings[i].materials;
  store.offerings[i] = { ...store.offerings[i], ...data, materials, id };
  if (data.offering_type) ensureOfferingType(store.offerings[i].offering_type);
  return store.offerings[i];
}

export function deleteOffering(id: string): boolean {
  const before = store.offerings.length;
  store.offerings = store.offerings.filter((o) => o.id !== id);
  return store.offerings.length < before;
}

// Helper: hydrate an offering with its customer-type + market objects.
export function hydrateOffering(o: Offering) {
  return {
    ...o,
    customerTypes: o.customer_type_ids
      .map((id) => getCustomerType(id))
      .filter((c): c is CustomerType => !!c),
    markets: o.market_ids
      .map((id) => store.markets.find((m) => m.id === id))
      .filter((m): m is Market => !!m),
    // The matched master offering type (carries the description), looked up by
    // name since offerings store the type as a string.
    offeringType:
      store.offeringTypes.find((t) => t.name === o.offering_type) || null,
  };
}
