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

export type MaterialKind = "video" | "presentation" | "whitepaper" | "pricing";

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
  future_availability: string;
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

const ALL_CT = [
  "ct-pharma-s", "ct-pharma-m", "ct-pharma-l",
  "ct-bio-s", "ct-bio-m", "ct-bio-l",
  "ct-biopharma-s", "ct-biopharma-m", "ct-biopharma-l",
];
const ALL_MKT = ["mkt-usa", "mkt-europe", "mkt-japan", "mkt-china", "mkt-korea"];

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
    customer_type_ids: opts.customer_type_ids ?? [],
    market_ids: opts.market_ids ?? [],
    materials: opts.materials ?? [],
    created_at: opts.created_at ?? "2026-06-20T12:00:00.000Z",
  };
}

// Seeded VERBATIM from Suren's "Digital Sales and Marketing.xlsx" → Sheet1
// (names, descriptions, and the customer-type Y-matrix exactly as he has them).
// In his sheet only 3 rows carry customer-type marks (all 9 each); the rest are
// blank. Availability/markets/materials come from the video where he showed them
// (the downloaded file is an earlier trim without those columns).
function seedOfferings(): Offering[] {
  return [
    off("of-001", "Freya Module", "Freya Register", ""),
    off("of-002", "Freya - Module + Module Agent", "Freya Register + Pia, Mia", ""),
    off("of-003", "Freya - Module + Module Agent + Add on Agent", "Freya Register + Pia, Mia and Via Agents", "", {
      current_availability: "V1 is available now",
      future_availability: "V3 is available in July 2026",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      materials: [
        { id: "m-003", kind: "video", label: "Via Agents demo", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        { id: "m-004", kind: "whitepaper", label: "Post-approval change automation", url: "https://example.com/via-agents-whitepaper.pdf" },
        { id: "m-005", kind: "pricing", label: "Register stack pricing", url: "https://example.com/register-pricing.pdf" },
      ],
    }),
    off("of-004", "Freya - Module + Agent", "Freya GRR - MPR-PAC + Via Agent",
      "Via agent enables customers to manage post approval changes"),
    off("of-005", "Freya - Module", "Freya GRI + Freya chat", "", {
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-006", "Freya - Module + Agent", "Freya GRI + Freya chat + RIA agent + Workflow", "", {
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-007", "Freya Module", "Freya Label", ""),
    off("of-008", "Freya Module", "Freya Submit", ""),
    off("of-009", "Freya Module", "Freya Docs", ""),
    off("of-010", "Freya Platform", "Agentic Workbench", "", {
      materials: [
        { id: "m-008", kind: "video", label: "Agentic Workbench launch", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        { id: "m-009", kind: "whitepaper", label: "Agentic regulatory operations", url: "https://example.com/agentic-workbench.pdf" },
      ],
    }),
    off("of-011", "Freya Platform", "Omni Object",
      "Customer assets can be classified and assessed for impact based on a AI based model"),
    off("of-012", "Freyr AI Native Service", "Publishing Operations",
      "Publishing services are performed by Human resources using AI based skills for Document level publishing and Quality check"),
    off("of-013", "Freya - Module + Agent", "Freya GRR - MPR-CTA + Agent", ""),
    off("of-014", "Freya - Module + Agent", "Freya GRR - MDV-PAC + Via Agent", ""),
  ];
}

// ---------------------------------------------------------------------------
// In-memory store (globalThis so it survives dev HMR)
// ---------------------------------------------------------------------------
interface OfferingsStore {
  customerTypes: CustomerType[];
  markets: Market[];
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
    offerings: seedOfferings(),
  };
}

const store: OfferingsStore = globalThis.__FREYR_OFFERINGS_STORE__ ?? seed();
if (!globalThis.__FREYR_OFFERINGS_STORE__) {
  globalThis.__FREYR_OFFERINGS_STORE__ = store;
}

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
    customer_type_ids: data.customer_type_ids || [],
    market_ids: data.market_ids || [],
    materials: (data.materials || []).map((m) => ({ ...m, id: m.id || rid("m") })),
    created_at: new Date().toISOString(),
  };
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
  return store.offerings[i];
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
  };
}
