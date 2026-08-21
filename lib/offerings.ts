// Offerings repository (requirement #1 from Suren's video review — see
// SUREN-VIDEO-REVIEW.md). A self-contained mock store (globalThis-backed, like
// lib/mock-db) so it survives dev HMR and doesn't touch the shared Db type.
// Holds Freyr's offerings, the customer-type definitions, and the markets, plus
// the sales-material artifacts attached to each offering.
import { getDataMode } from "./dataMode";
import { createClient } from "@supabase/supabase-js";
import {
  nextRoadmapVersions,
  nextComponentVersions,
  type RoadmapVersion,
} from "./roadmapVersions";
import {
  canonicalMaterialFolder,
  isFixedMaterialFolder,
  sanitizeMaterialFolderPath,
  type OfferingMaterial,
} from "./offeringMaterials";
import {
  normalizeServiceCardStyles,
  type ServiceCardStyle,
} from "./serviceCardStyle";
export type { ServiceCardStyle } from "./serviceCardStyle";
export {
  MATERIAL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  asJourneyStage,
  asAccessLevel,
  type MaterialKind,
  type JourneyStage,
  type AccessLevel,
  type OfferingMaterial,
} from "./offeringMaterials";

export type CustomerFamily =
  | "Pharmaceutical"
  | "Biologics"
  | "Bio Pharmaceutical"
  | "Medical Devices"
  | "Consumer Products";
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

// An offering CATEGORY as a managed master list (Suren's Jun 27 video): a
// grouping above offering type — e.g. "Global Regulatory Intelligence" gathers
// the offerings related to it. Each category carries a name, a plain-English
// description, and an offering OWNER (Suren: "for every offering category
// there's going to be an offering owner — that's why I wanted to have that").
export interface OfferingCategory {
  id: string;
  name: string;
  description: string;
  owner: string; // the offering owner accountable for this category
  owner_user_id?: string | null;
}

import { pocNames } from "./pocNames";

export interface Offering {
  id: string;
  offering_type: string;
  offering_category: string; // the offering category name (Suren's Jun 27 video)
  offering_name: string;
  offering_description: string;
  /** Optional, index-aligned appearance choices for the service cards parsed
   *  from `offering_description`. Missing entries keep the deterministic
   *  icon and colour the card has always used. */
  service_card_styles?: ServiceCardStyle[];
  current_availability: string;
  future_availability: string; // "Availability comments" in the UI
  poc: string; // SME / service-delivery POC named on Suren's master sheet
  /** THE PEOPLE BEHIND THIS OFFERING, as records you can add to and remove
   *  from, not a spreadsheet cell (Anir, Jul 28: "obviously, there has to be
   *  the ability to remove and add contacts for this offering"). Back-filled
   *  from `poc` the first time an offering loads, so nothing Suren's sheet
   *  carried is lost, and `poc` is kept in sync from this list so the cards,
   *  the POC strip and the CSV export keep reading the same names. */
  contacts: OfferingContact[];
  customer_type_ids: string[]; // applicable customer types (one or more)
  market_ids: string[]; // applicable markets
  materials: OfferingMaterial[];
  /**
   * Folders an owner created that hold nothing yet. Folders that DO hold files
   * are implied by the files themselves, so this list exists purely so a
   * freshly made (or newly emptied) folder does not disappear on reload.
   */
  materialFolders?: string[];
  /**
   * WHAT SHIPPED, AND WHEN.
   *
   * Suren, Jul 30 (11:01): "I need to know for this offering, what is the
   * latest release, which is the latest customer version, what is the next
   * customer version, and then what are the version comparison features."
   * Saras wrote it up as a Release Notes / Version History tab, visible to
   * everyone.
   *
   * `status` is what makes a row a shipped release or the one coming next; the
   * RESTRICTED roadmap section Sudhir asked for ("anything beyond the current
   * release in the hands of sales is not good") is a separate, gated thing and
   * is deliberately not built yet.
   */
  releases?: OfferingRelease[];
  /** FDL components connected to this offering — the software the package contains. */
  component_ids?: string[];
  /**
   * WHICH VERSION OF EACH COMPONENT THIS OFFERING COVERS, keyed by component
   * id. Suren, Aug 9: "where is the version number? You need to say which
   * version is applicable for this offering." Kept beside component_ids rather
   * than folded into it so an existing catalogue row stays readable — an entry
   * missing here simply means nobody has pinned a version yet.
   */
  component_versions?: Record<string, string | null>;
  /** Structured roadmap copy supplied by the Offering Owner. This preserves
   *  module tables, the current-vs-previous comparison, release history, and
   *  the restricted next-version table without flattening them into generic
   *  release bullets. */
  roadmap_details?: OfferingRoadmapDetails;
  /**
   * EVERY CHANGE TO THIS ROADMAP, NEWEST FIRST (product owner, Aug 20: "Every
   * time there is a change in road map it has to be versioned. Just like how
   * you version a document").
   *
   * Written by the save path, never by a client body. See lib/roadmapVersions.
   */
  roadmap_versions?: RoadmapVersion[];
  /** WHO OWNS THIS OFFERING, as account records rather than a name string.
   *  Editing rights are decided by `memberId`, an exact match against the
   *  signed-in workspace account, never by matching a person's display name
   *  against `poc` (Anir, Jul 28: "shouldn't it be based on the account, so
   *  someone has to claim the offering... this is a full enterprise-level
   *  application"). `poc` stays what it always was: the contact printed on the
   *  card, sourced from the sheet, and carries no permission at all.
   *  Name and email are denormalised so the owners list renders without a join;
   *  they are display only and are never consulted for access. */
  owners: OfferingOwner[];
  created_at: string;
}

/** One person to talk to about an offering. Freyr-internal: the SME or service
 *  delivery lead a rep should reach when a customer asks something the deck
 *  does not answer. Only the name is required; a row with just a name is still
 *  useful, and demanding an email would push people back to the sheet. */
/**
 * ONE VERSION OF AN OFFERING, and what changed in it.
 *
 * `released` is a shipped version anybody may read. `next` is the one coming
 * up — Suren asked for "what is the next customer version" on the same tab, and
 * Sudhir drew the line at that: everything beyond the next release belongs in
 * the restricted roadmap, which is not built yet.
 */
export interface OfferingRelease {
  id: string;
  /** Customer-facing version, e.g. "V2" or "2026.1". */
  version: string;
  /** ISO date it shipped, or is expected to. Blank when a date isn't set. */
  date?: string;
  status: "released" | "next";
  /** What this version added or changed, one line per feature. */
  features: string[];
  /** Free-text note for anything a feature list can't carry. */
  note?: string;
}

/**
 * FDL COMPONENTS — FDL is Freya Digital, the software line. An offering is a
 * PACKAGE; the software inside it are FDL components, each a first-class
 * record with its own versions and its own features (Suren via Anir, Aug 8:
 * "an offering can be a package and have multiple components in offering and
 * every component can have its own roadmap and features"). Offerings connect
 * to them by id (`component_ids`), so one component — say the Register Module
 * — can sit inside several packages without its roadmap being copied around.
 * The offering's own `releases` stay what they were: the package-level
 * version history.
 */
export type FdlComponentType = "Module" | "Agent" | "Platform";
export interface FdlRelease {
  id: string;
  version: string;
  date?: string;
  status: "released" | "next";
  /** Exactly one release per component should carry this — the version sellers quote today. */
  current?: boolean;
}
/**
 * A file pinned to a feature: a spec, a screenshot, a mock-up. Suren, Aug 9:
 * "for all these features, if they can add some document or an image, can you
 * allow it to add?" The bytes go through the same managed storage as a sales
 * material, so there is one upload path in the product, not two.
 */
export interface FdlFeatureAttachment {
  id: string;
  /** The filename as uploaded, shown as the link text. */
  name: string;
  url: string;
  /** "image" renders inline; anything else opens in a new tab. */
  kind: "image" | "document";
}

export interface FdlFeature {
  id: string;
  /** The sheet's human feature ID (Fid column) — shown wherever the feature is. */
  fid?: string;
  name: string;
  description?: string;
  /** FdlRelease ids this feature is available in — the feature↔version mapping. */
  versionIds: string[];
  attachments?: FdlFeatureAttachment[];
}
export interface FdlComponent {
  id: string;
  name: string;
  type: FdlComponentType;
  releases: FdlRelease[];
  features: FdlFeature[];
  /** Every change ever made to this component's releases, newest first. */
  roadmap_versions?: RoadmapVersion[];
}

export interface OfferingRoadmapModuleRow {
  module: string;
  version?: string;
  details: string[];
}

export interface OfferingRoadmapComparisonRow {
  area: string;
  current: string;
  previous: string;
}

export interface OfferingRoadmapHistoryRow {
  period: string;
  summary: string[];
}

export interface OfferingRoadmapDetails {
  currentVersion: string;
  releaseWave: string;
  currentModules: OfferingRoadmapModuleRow[];
  platformCapabilities: string[];
  comparisonCurrentLabel: string;
  comparisonPreviousLabel: string;
  comparisonRows: OfferingRoadmapComparisonRow[];
  history: OfferingRoadmapHistoryRow[];
  nextExpectedLive: string;
  nextVersions: string;
  nextModules: OfferingRoadmapModuleRow[];
}

function roadmapText(value: unknown, max = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function roadmapLines(value: unknown, maxItems = 80): string[] {
  return Array.isArray(value)
    ? value
        .slice(0, maxItems)
        .map((item) => roadmapText(item))
        .filter(Boolean)
    : [];
}

function roadmapModules(value: unknown): OfferingRoadmapModuleRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const moduleName = roadmapText(row.module, 250);
    const details = roadmapLines(row.details);
    if (!moduleName && details.length === 0) return [];
    const version = roadmapText(row.version, 120);
    return [{ module: moduleName, ...(version ? { version } : {}), details }];
  });
}

/** Validate and bound the owner-editable structured roadmap before it enters
 * the shared catalog document. The generic offering PATCH is intentionally
 * flexible, but a nested arbitrary payload must not be allowed to grow the
 * singleton catalog without limits. */
export function normalizeRoadmapDetails(value: unknown): OfferingRoadmapDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Roadmap details must be a structured object");
  }
  const input = value as Record<string, unknown>;
  const comparisonRows = Array.isArray(input.comparisonRows)
    ? input.comparisonRows.slice(0, 80).flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const row = candidate as Record<string, unknown>;
        const area = roadmapText(row.area, 250);
        const current = roadmapText(row.current);
        const previous = roadmapText(row.previous);
        if (!area && !current && !previous) return [];
        return [{ area, current, previous }];
      })
    : [];
  const history = Array.isArray(input.history)
    ? input.history.slice(0, 100).flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const row = candidate as Record<string, unknown>;
        const period = roadmapText(row.period, 120);
        const summary = roadmapLines(row.summary);
        if (!period && summary.length === 0) return [];
        return [{ period, summary }];
      })
    : [];

  return {
    currentVersion: roadmapText(input.currentVersion, 120),
    releaseWave: roadmapText(input.releaseWave, 250),
    currentModules: roadmapModules(input.currentModules),
    platformCapabilities: roadmapLines(input.platformCapabilities),
    comparisonCurrentLabel: roadmapText(input.comparisonCurrentLabel, 250),
    comparisonPreviousLabel: roadmapText(input.comparisonPreviousLabel, 250),
    comparisonRows,
    history,
    nextExpectedLive: roadmapText(input.nextExpectedLive, 250),
    nextVersions: roadmapText(input.nextVersions, 500),
    nextModules: roadmapModules(input.nextModules),
  };
}

export interface OfferingContact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

/** One claim on an offering.
 *
 *  `status` is the whole point. Anyone may REQUEST an offering, which records
 *  the ask and grants nothing. Only an admin can turn that into `owner`, and
 *  only `owner` carries edit rights (Anir, Jul 28: "only a select amount of
 *  people should be able to edit the offering... everyone shouldn't be able to
 *  do that if they claim it first"). Self-service claiming would have let any
 *  signed-in member grant themselves write access to any offering. */
export interface OfferingOwner {
  /** Stable app_users id. THE permission key. */
  memberId: string;
  /** Display only, captured when the row was written. */
  name: string;
  email: string | null;
  /** "requested" grants nothing. "owner" grants edit rights on THIS offering. */
  status: "requested" | "owner";
  claimed_at: string;
  /** Who granted it. For a request this is the requester; for an approval or a
   *  direct assignment it is the admin. Every grant is attributable. */
  granted_by: string;
}

// ---------------------------------------------------------------------------
// Seed (read directly from Suren's two sheets)
// ---------------------------------------------------------------------------
const FOCUS_SMALL =
  "Focused on R&D / discovery; often single-asset or niche-pipeline companies.";
const FOCUS_MID =
  "Growing pipeline; typically have 1-2 commercial products; mid-market infrastructure.";
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
    ct("ct-pharma-m", "Pharmaceutical", "Mid size", PROD_PHARMA, "$500M. $5B", "500-5,000", FOCUS_MID),
    ct("ct-pharma-l", "Pharmaceutical", "Large", PROD_PHARMA, "$5B+", "5,000+", FOCUS_LARGE),
    ct("ct-bio-s", "Biologics", "Small", PROD_BIO, "Under $500M", "< 500", FOCUS_SMALL),
    ct("ct-bio-m", "Biologics", "Mid size", PROD_BIO, "$500M. $5B", "500-5,000", FOCUS_MID),
    ct("ct-bio-l", "Biologics", "Large", PROD_BIO, "$5B+", "5,000+", FOCUS_LARGE),
    ct("ct-biopharma-s", "Bio Pharmaceutical", "Small", PROD_BIOPHARMA, "Under $500M", "< 500", FOCUS_SMALL),
    ct("ct-biopharma-m", "Bio Pharmaceutical", "Mid size", PROD_BIOPHARMA, "$500M. $5B", "500-5,000", FOCUS_MID),
    ct("ct-biopharma-l", "Bio Pharmaceutical", "Large", PROD_BIOPHARMA, "$5B+", "5,000+", FOCUS_LARGE),
    ct("ct-meddev-s", "Medical Devices", "Small", "", "", "", ""),
    ct("ct-meddev-m", "Medical Devices", "Mid size", "", "", "", ""),
    ct("ct-meddev-l", "Medical Devices", "Large", "", "", "", ""),
    ct("ct-consumer-s", "Consumer Products", "Small", "", "", "", ""),
    ct("ct-consumer-m", "Consumer Products", "Mid size", "", "", "", ""),
    ct("ct-consumer-l", "Consumer Products", "Large", "", "", "", ""),
  ];
}

function seedMarkets(): Market[] {
  return [
    // GLOBAL IS A REAL ANSWER, not shorthand for "all five" (Wajeed + Eeswar,
    // change request 11: "some Freyr offerings are available globally").
    // Listing USA/Europe/Japan/China/Korea on Freya.Register implied those are
    // the only places it can be bought, which is wrong and reads as a limit.
    // It sorts first because it is the widest answer, and any owner can pick it.
    { id: "mkt-global", name: "Global" },
    { id: "mkt-usa", name: "USA" },
    { id: "mkt-europe", name: "Europe" },
    { id: "mkt-japan", name: "Japan" },
    { id: "mkt-china", name: "China" },
    { id: "mkt-korea", name: "Korea" },
  ];
}

// The 6 offering types, VERBATIM from Suren's "Digital Sales and Marketing.xlsx"
// → "Offering Type" sheet, descriptions and all. (He confirmed these in the live
// meeting: "these are all the offering types.")
function seedOfferingTypes(): OfferingType[] {
  return [
    {
      id: "ot-fusion-module",
      name: "Freya Fusion (Module)",
      description:
        "Freya Fusion is an industry-first AI platform exclusively built for regulatory functions. It is the first-of-its-kind platform which has all regulatory workflow applications and external intelligence in a single place.\n\nIt comprises multiple modules, such as Freya.Register, Freya.Submit, Freya. Artwork, Freya.Label, Freya.Doc, Freya.Intelligence, Freya.RTQ, Freya.GRR-PAC etc. These modules serve as the system of record for Product Registration and Health Authority Submissions data, providing the foundational data for each respective module. Freya Fusion modules help all the regulatory functions comprising of Regulatory Affairs, Regulatory Intelligence & Regulatory Strategy to collaboratively work in a single platform.",
    },
    {
      id: "ot-fusion-agent",
      name: "Freya Fusion (Module + Module Agent/s)",
      description:
        "The Freya Fusion platform includes a Regulatory Knowledge Manager that collects, verifies, and organizes global regulatory information like laws, guidances, standards, health authority updates into one continuously updated system that users can search or ask questions directly, and also incudes specialized agents tailored to specific modules or their underlying data.\n\nFor instance, the 'Via' agent operates on the GRR (Post-Approval Changes) module. 'Pia' and 'Mia' agents function within the Freya.Register module.\n\nThis combination of our application, data and AI agents enables additional speed and intelligence to regulatory services.",
    },
    {
      id: "ot-fusion-addon",
      name: "Freya Fusion (Module + Module Agent/s + Add on Agent/s)",
      description:
        "Offerings can be customized to include modules with module-specific agents and additional agents not natively connected to the primary module. For example, the 'Via' agent can be bundled with the Freya.Register module and its corresponding agents, 'Pia' and 'Mia.'",
    },
    {
      id: "ot-fusion-platform",
      name: "Freya Fusion (Platform)",
      // The approved source intentionally leaves this description blank.
      description: "",
    },
    {
      id: "ot-fusion-agents",
      name: "Freya Fusion (Agents)",
      description:
        "Freyr's AI agents are uniquely positioned to be independently offered to clients for working with external customer-specific applications in the regulatory space that the clients may be using. Freyr's architecture enables customers to leverage agents as a scalable regulatory execution layer. For instance, our agents can be added as another layer on top of a client's Veeva modules etc.",
    },
    {
      id: "ot-freyr-ai-native",
      name: "Freyr AI Native Services",
      description:
        "Building on years of regulatory experience, Freyr has transitioned into a new era by integrating AI capabilities with human expertise to deliver regulatory services with cost optimization and efficiency. An AI Native Service is one where Freyr's proprietary software handles the core, repeatable work with minimal manual effort to execute, while our regulatory experts continue to oversee strategy, planning, judgement and quality.",
    },
    {
      id: "ot-freyr-services",
      name: "Freyr Services",
      description:
        "While not all Freyr services have transitioned to an AI-native model yet, the company is actively working toward ensuring that all future service offerings become fully AI-native.",
    },
  ];
}

// The 6 offering categories, VERBATIM from Suren's "Digital Sales and
// Marketing.xlsx" → "Offering Category" sheet (Jun 27 video), names and
// descriptions exactly as he wrote them. The offering OWNER is left blank — he
// said each category will have one but hasn't assigned them yet; it's editable
// in the category manager and on import.
const CAT_RIM = "Regulatory Information Management";
const CAT_SUBMISSIONS = "Submissions and Document Operations";
const CAT_GRI = "Global Regulatory Intelligence";
// Specialist offerings that do not fit one of the six domain categories use
// Others. The two medical-writing lines are deliberate exceptions: their
// authored clinical/non-clinical documents feed regulatory submissions, so
// they live under Submissions and Document Operations.
const CAT_OTHERS = "Others";
const CAT_LABELING = "Labeling and Artwork";
const LEGACY_PLATFORM_CATEGORY = "Freya Fusion Platform and Agents";
const CAT_PLATFORM = "Freya Fusion Platform & Agents";
const CAT_RA = "Regulatory Affairs";

function seedOfferingCategories(): OfferingCategory[] {
  return [
    {
      id: "oc-rim",
      name: CAT_RIM,
      description:
        "Focuses on the strategic oversight and systematic management of regulatory data and documentation to ensure compliance, maintain traceability, and streamline product lifecycle management.",
      owner: "",
    },
    {
      id: "oc-submissions",
      name: CAT_SUBMISSIONS,
      description:
        "Provides comprehensive support for the creation, publishing, and delivery of regulatory submissions (e.g., eCTD, NeeS) to health authorities globally, ensuring quality and adherence to evolving guidelines.",
      owner: "",
    },
    {
      id: "oc-gri",
      name: CAT_GRI,
      description:
        "A service and platform that monitors thousands of global regulations and health authority updates to provide actionable insights, impact assessments, and proactive decision-making support.",
      owner: "",
    },
    {
      id: "oc-labeling",
      name: CAT_LABELING,
      description:
        "Delivers end-to-end management of label changes, artwork changes, and content management ensuring precision, regulatory compliance, and brand consistency from concept to commercialization.",
      owner: "",
    },
    {
      id: "oc-platform",
      name: CAT_PLATFORM,
      description:
        "Freyr's flagship AI-powered regulatory ecosystem that centralizes registrations, submissions, and intelligence into a unified cloud environment, utilizing AI agents to automate workflows and provide real-time guidance.",
      owner: "",
    },
    {
      id: "oc-ra",
      name: CAT_RA,
      description:
        "Offers broad consultative expertise to help companies navigate complex regulatory landscapes, develop market access strategies, manage product registrations, and ensure ongoing compliance across various industries like pharma, medical devices, and consumer products.",
      owner: "",
    },
    // LAST, deliberately: the six real categories keep the accent colours they
    // already wear (the palette is indexed by position, filterPalette.ts).
    {
      id: "oc-others",
      name: CAT_OTHERS,
      description:
        "Specialist services that stand on their own rather than under one of the six categories, pharmacovigilance, medical writing, compliance and audit, and medical communication.",
      owner: "",
    },
  ];
}

const ALL_CT = [
  "ct-pharma-s", "ct-pharma-m", "ct-pharma-l",
  "ct-bio-s", "ct-bio-m", "ct-bio-l",
  "ct-biopharma-s", "ct-biopharma-m", "ct-biopharma-l",
];
const ALL_MKT = ["mkt-usa", "mkt-europe", "mkt-japan", "mkt-china", "mkt-korea"];
// Sold everywhere: one market, not five (change request 11).
const GLOBAL_MKT = ["mkt-global"];
// Suren's sheet marks Freya.Label and Freya.Artwork "Not Applicable" for the
// Small segment of every family — those start at mid-size.
const NO_SMALL_CT = [
  "ct-pharma-m", "ct-pharma-l",
  "ct-bio-m", "ct-bio-l",
  "ct-biopharma-m", "ct-biopharma-l",
];
// Large-only (e.g. Submissions Planning & Management) and no-large (e.g.
// Pharmacovigilance — the team focuses on small/mid) applicability sets.
const LARGE_ONLY_CT = ["ct-pharma-l", "ct-bio-l", "ct-biopharma-l"];
const NO_LARGE_CT = [
  "ct-pharma-s", "ct-pharma-m",
  "ct-bio-s", "ct-bio-m",
  "ct-biopharma-s", "ct-biopharma-m",
];

function off(
  id: string,
  offering_type: string,
  offering_name: string,
  offering_description: string,
  opts: Partial<Offering> = {}
): Offering {
  const record: Offering = {
    id,
    contacts: [],
    offering_type,
    offering_category: opts.offering_category ?? "",
    offering_name,
    offering_description,
    // Defaults are blank to mirror Suren's sheet (most rows are unfilled — he
    // populates them via the entry screen). Populated rows pass values in.
    current_availability: opts.current_availability ?? "",
    future_availability: opts.future_availability ?? "",
    poc: opts.poc ?? "",
    customer_type_ids: opts.customer_type_ids ?? [],
    market_ids: opts.market_ids ?? [],
    materials: opts.materials ?? [],
    materialFolders: opts.materialFolders ?? [],
    releases: opts.releases ?? [],
    roadmap_details: opts.roadmap_details,
    // Nobody owns a seeded offering until a real account CLAIMS it. Ownership
    // is never inferred from the sheet's POC name.
    owners: opts.owners ?? [],
    created_at: opts.created_at ?? "2026-06-20T12:00:00.000Z",
  };
  // The sheet's POC cell becomes real contact rows, so a seeded offering opens
  // with its people listed and they can be added to or removed like any other.
  record.contacts = opts.contacts ?? contactsFromPoc(record);
  return record;
}

// Seeded from Suren's "Digital Sales and Marketing.xlsx" → "Offerings" sheet:
// the offering names, the OFFERING CATEGORY (his Jun 27 sheet — confirmed from
// the recording: Register→Regulatory Information Management, Intelligence &
// GRR-PAC→Global Regulatory Intelligence, Label→Labeling and Artwork,
// Submit→Submissions and Document Operations; the rest assigned by domain), the
// customer-type applicability matrix (Label/Artwork Not Applicable to Small),
// and availability. Per Suren's Jun 27 video the medicinal-products listing is
// finalised and "everything is available", so the 12 Freya modules are all
// "Currently available". Early adopters were removed at Suren's request ("I
// don't want that anymore — we'll come from the customer angle later"). Markets
// are sample values on the core modules. Service-delivery POCs carry over from
// Sara's MPR list.
//
// DESCRIPTIONS + OWNERS (Jul 28, from the CSV Anir dropped in Downloads —
// "Digital Sales and Marketing(Offerings).csv", the current export of that same
// sheet): three modules now carry Freyr's own written description verbatim
// (Freya.Register, +Pia+Mia, +Pia+Mia+Via); the other eleven are blank IN THE
// SHEET, so they stay blank here rather than being written for Freyr. The
// module owners come from the sheet's "Offering Owner" column, copied exactly —
// "TBD" is not a person, so those offerings keep no owner at all. Names are
// never reordered or completed from outside the sheet; where the sheet's own
// Owner column spells out a POC's surname (Mukundh → Mukundh Chouthoy) that
// spelling is used, and nowhere else.
const FREYR_URL = {
  resources: "https://www.freyrsolutions.com/resources",
  insights: "https://www.freyrsolutions.com/insights",
  contact: "https://www.freyrsolutions.com/contact-us",
};
const MODULE = "Freya Fusion (Module)";
const MODULE_AGENT = "Freya Fusion (Module + Module Agent/s)";
const MODULE_AGENT_ADDON = "Freya Fusion (Module + Module Agent/s + Add on Agent/s)";
const PLATFORM_TYPE = "Freya Fusion (Platform)";
const AGENTS_TYPE = "Freya Fusion (Agents)";
const AI_NATIVE = "Freyr AI Native Services";
const SERVICE = "Freyr Services";
// The catalogue links below entered the in-progress sample workspace in the
// Jul 30 materials import. They predate server-side upload attribution, so keep
// that known import date on the records themselves. This makes every sample
// material row show a date while live materials continue to use their own
// persisted `addedAt` value (or the timestamp embedded in their Docs path).
const DEMO_MATERIAL_ADDED_AT = "2026-07-30T12:00:00.000Z";

// Eswar Subramanian Ramakrishnan, "Freya.Register - Technical Details",
// supplied 5 Aug 2026. Keep this as structured source copy so the Roadmap tab
// can render the document's actual tables instead of a lossy generic list.
const FREYA_REGISTER_ROADMAP_DETAILS: OfferingRoadmapDetails = {
  currentVersion: "V2.5",
  releaseWave: "Live since July 2026.",
  currentModules: [
    {
      module: "Products",
      version: "V2.5",
      details: [
        "Manages product data across Pharmaceutical, Medical Devices, Consumer and Cosmetic domains: types, details, formulations, composition models, packaging, labelling and therapeutic details, and manufacturing details.",
        "Includes xEVMPD and IDMP data management.",
      ],
    },
    {
      module: "Applications",
      version: "V2.2",
      details: [
        "Manages Marketable and Investigational applications (CTAs and INDs) through a guided wizard.",
        "Supports MRP, DCP, CP, NP, GCC and Eurasian procedures.",
        "Linked to Products and Docs.",
      ],
    },
    {
      module: "Registrations",
      version: "V2.5",
      details: [
        "Manages registration records through a guided wizard, with full procedure coverage and xEVMPD, IDMP and UDI data.",
        "Linked to Products and Docs.",
      ],
    },
    {
      module: "RTQ (Regulatory Queries)",
      version: "V2.5",
      details: [
        "Manages Health Authority queries, responses, meetings and scientific advice, and interactions, with an RTQ chatbot and structured document handling.",
      ],
    },
    {
      module: "LCM (Lifecycle Management)",
      version: "V2.5",
      details: [
        "Manages obligations, commitments and local updates, including registration updates driven by local updates.",
      ],
    },
  ],
  platformCapabilities: [
    "Global search across all five modules",
    "Configurable lifecycle stages and statuses",
    "Electronic signature",
    "Plan and Track integration, notifications and milestones",
    "Record versioning and cloning",
    "Time zone support",
    "xEVMPD submission (XML generation, EVPRM export, attachments, acknowledgement handling) and SPOR integration",
    "IDMP (in UAT with EMA on the PMS API)",
  ],
  comparisonCurrentLabel: "Current version (V2.5, July 2026)",
  comparisonPreviousLabel: "Previous version (V2.4, June 2026)",
  comparisonRows: [
    { area: "Localisation", current: "Time zone support added", previous: "-" },
    {
      area: "Record management",
      current: "Record cloning extended across further modules",
      previous: "Record cloning (including sub-menu and grid) for LCM",
    },
    {
      area: "Data entry",
      current: "Automatic propagation of data from upstream modules",
      previous: "Auto-population of packaging details",
    },
    {
      area: "Workflow",
      current: "Automatic obligation re-occurrence (creation scenario) in LCM",
      previous: "Configurable workflow colour; workflow auto-start; cross-module workflow",
    },
    {
      area: "Regulatory status",
      current: "Regulatory Status Base introduced (Registrations)",
      previous: "-",
    },
    {
      area: "Performance",
      current: "Lazy-loading improvements across grids",
      previous: "Dynamic wizard introduced for LCM",
    },
  ],
  history: [
    {
      period: "Jul 2026",
      summary: [
        "V2.5 wave (current live version): time zone support, record cloning enhancements, lazy-loading improvements, upstream data propagation, Regulatory Status Base and automatic obligation re-occurrence (creation scenario).",
      ],
    },
    {
      period: "Jun 2026",
      summary: [
        "V2.4 wave: dynamic wizard for LCM, auto-population of packaging details, configurable workflow colour, workflow auto-start, cross-module workflow, record cloning and historical minor version support.",
      ],
    },
    {
      period: "May 2026",
      summary: [
        "V2.3 wave: workflow enhancements, configurable e-signature and permissions, historical version view, auto-populate, dynamic wizard for RTQ, and full record export (Excel and PDF) for compliance.",
      ],
    },
    {
      period: "Apr 2026",
      summary: [
        "V2.2 wave: configurable wizards, parent-child and tree search, configurable notifications, duplicate record checks, unique record IDs and shareable record hyperlinks.",
        "New Projects and Project Request modules.",
      ],
    },
    {
      period: "Feb 2026",
      summary: [
        "Major V2.0 and V2.1 wave: master file management (DMF, ASMF, PMF), milestones and event dates, linked records, auto-tag and comments, lazy load.",
        "xEVMPD gateway connection with acknowledgement management.",
      ],
    },
    {
      period: "Jan 2026",
      summary: [
        "RTQ enhancements: wizard upgrades, Docs linking, validations and versioning.",
      ],
    },
    {
      period: "Dec 2025",
      summary: [
        "Registrations wizard and platform upgrades, with performance improvements.",
      ],
    },
    {
      period: "Oct 2025",
      summary: [
        "xEVMPD submission mechanics (XML generation, EVPRM export, attachments, acknowledgements).",
        "Applications and Products platform upgrades: data privileges, Plan and Track, notifications and versioning.",
      ],
    },
    {
      period: "Sept 2025",
      summary: [
        "xEVMPD Submission Module (registration sync and acknowledgement handling) and SPOR integration.",
      ],
    },
    {
      period: "Aug 2025",
      summary: [
        "Baseline launch.",
        "Five modules go live: Products, Applications, Registrations, RTQ and LCM.",
        "Core regulatory data management, full procedure coverage (MRP, DCP, CP, NP, GCC, Eurasian), Docs and Knowledge Manager integration, global search, configurable lifecycles and electronic signature.",
      ],
    },
  ],
  nextExpectedLive: "August 2026",
  nextVersions:
    "Products / Registrations / RTQ / LCM V2.6, Applications V2.3",
  nextModules: [
    {
      module: "Registrations",
      details: [
        "Procedure conversions: Repeat Use Procedure (MRP and DCP), step-down conversions in MRP and DCP, and conversion from NP to MRP.",
      ],
    },
    {
      module: "LCM",
      details: [
        "Automatic obligation re-occurrence extended to update and delete scenarios.",
      ],
    },
    {
      module: "Products, LCM, RTQ, Applications",
      details: ["Regulatory Status Base rolled out across modules."],
    },
    {
      module: "Products, RTQ, LCM",
      details: [
        "Support for historical minor versions extended across modules.",
      ],
    },
  ],
};

const FREYA_REGISTER_RELEASES: OfferingRelease[] = [
  {
    id: "freya-register-v2-0-v2-1",
    version: "V2.0 / V2.1",
    date: "2026-02-01",
    status: "released",
    features: FREYA_REGISTER_ROADMAP_DETAILS.history[4].summary,
  },
  {
    id: "freya-register-v2-2",
    version: "V2.2",
    date: "2026-04-01",
    status: "released",
    features: FREYA_REGISTER_ROADMAP_DETAILS.history[3].summary,
  },
  {
    id: "freya-register-v2-3",
    version: "V2.3",
    date: "2026-05-01",
    status: "released",
    features: FREYA_REGISTER_ROADMAP_DETAILS.history[2].summary,
  },
  {
    id: "freya-register-v2-4",
    version: "V2.4",
    date: "2026-06-01",
    status: "released",
    features: FREYA_REGISTER_ROADMAP_DETAILS.history[1].summary,
  },
  {
    id: "freya-register-v2-5",
    version: "V2.5",
    date: "2026-07-01",
    status: "released",
    features: FREYA_REGISTER_ROADMAP_DETAILS.history[0].summary,
  },
  {
    id: "freya-register-next-aug-2026",
    version: FREYA_REGISTER_ROADMAP_DETAILS.nextVersions,
    date: "2026-08-01",
    status: "next",
    features: FREYA_REGISTER_ROADMAP_DETAILS.nextModules.flatMap(
      (row) => row.details.map((detail) => `${row.module}: ${detail}`)
    ),
  },
];

const FREYA_REGISTER_KEY_CONTACTS: OfferingContact[] = [
  {
    id: "oc-of-001-eswar-owner",
    name: "Eswar Subramanian Ramakrishnan",
    role: "Offering Owner",
    email: "Eswar.Subramanian@FreyrSolutions.com",
    phone: "",
  },
  {
    id: "oc-of-001-sameer-product",
    name: "Sameer Siddiqui",
    role: "Product Owner",
    email: "Sameer.siddiqui@FreyrSolutions.com",
    phone: "",
  },
  {
    id: "oc-of-001-sameer-roadmap",
    name: "Sameer Siddiqui",
    role: "Technical / Roadmap Contact",
    email: "Sameer.siddiqui@FreyrSolutions.com",
    phone: "",
  },
];

function seedOfferings(): Offering[] {
  // Seeded VERBATIM from Freyr's "Digital Sales and Marketing (Offerings)" master
  // sheet — the fully-populated version reconciled with 12 senior service-delivery
  // POCs. Every offering carries its real MPR service description, granular
  // customer-type applicability (per family × size), availability + comments, and
  // its accountable service-delivery POC. Markets default to all five (the sheet's
  // availability notes describe global / various-market coverage); materials are
  // added per offering in-app. Rows the sheet left blank stay blank.
  return [
    off("of-001", MODULE, "Freya.Register", "Freya.Register is the core Regulatory Information Management System (RIMS) module of Freya Fusion, managing the end-to-end processes across Products, Applications, Registrations, and Life Cycle Management (LCM). It gives regulatory teams a single, structured source of truth for product and registration data, with clear visibility into status and dependencies across markets. Lifecycle changes and registration updates remain user-governed, keeping regulatory control and data integrity with the team.\n\nProducts: Maintains a structured master record of each product's regulatory identity and attributes, serving as the anchor/parent other data links back to.\n\nApplications: Tracks regulatory applications through their dossier preparation and review journey until the submission to a health authority, with status visibility across markets.\n\nRegistrations: Holds the record of granted registrations and approvals per product and market, giving a clear view of what is authorised where.\n\nLCM (Life Cycle Management): Manages post-approval changes and variations over a registration's life, keeping the regulatory record current as products and requirements evolve.", {
      poc: "Eswar Subramanian",
      offering_category: CAT_RIM,
      current_availability: "Currently available",
      future_availability: "Version 2.5",
      customer_type_ids: ALL_CT,
      market_ids: GLOBAL_MKT,
      releases: structuredClone(FREYA_REGISTER_RELEASES),
      roadmap_details: structuredClone(FREYA_REGISTER_ROADMAP_DETAILS),
      contacts: structuredClone(FREYA_REGISTER_KEY_CONTACTS),
      // Every seeded material carries its buyer's-journey stage + access level
      // (CR-3): overviews open the conversation (awareness), references and
      // case studies prove it (evaluation) — all safe to share with a client.
      materials: [
        { id: "m-001", kind: "video", label: "Freya.Register overview", url: FREYR_URL.resources, journeyStage: "awareness", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
        { id: "m-002", kind: "reference", label: "Customer reference call", url: FREYR_URL.insights, journeyStage: "evaluation", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
        { id: "m-003", kind: "case_study", label: "Cutting registration cycle time", url: FREYR_URL.insights, journeyStage: "evaluation", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
      ],
    }),
    off("of-002", MODULE, "Freya.Intelligence", "", {
      poc: "Inayat, Tanudeep",
      offering_category: CAT_GRI,
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-003", MODULE, "Freya.GRR-PAC (Global Regulatory Requirements for Post Approval Changes)", "", {
      poc: "Inayat, Tanudeep",
      offering_category: CAT_GRI,
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-004", MODULE, "Freya.Label", "", {
      poc: "Raj Vinesh",
      offering_category: CAT_LABELING,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-005", MODULE, "Freya.Submit", "", {
      poc: "Sameer Siddiqui",
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-006", MODULE, "Freya.Artwork", "", {
      poc: "Raj Vinesh",
      offering_category: CAT_LABELING,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-007", MODULE, "Freya.RTQ", "", {
      poc: "Inayat, Tanudeep",
      offering_category: CAT_RA,
      current_availability: "Currently available",
      customer_type_ids: [],
    }),
    off("of-008", MODULE, "Freya.RA Changes", "", {
      offering_category: CAT_RA,
      current_availability: "To be Decided",
      future_availability: "May be next Year",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-009", MODULE, "Freya.Docs", "", {
      poc: "Sameer Siddiqui",
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-010", MODULE_AGENT, "Freya.Register + Pia + Mia", "This offering pairs the core Regulatory Information Management System (RIMS) registration modules of Freya.Register with AI agents that assist regulatory teams across product identification, market scoping, and change impact assessments.\n\nPIA (Product Identification Agent): Helps identify and structure a product's regulatory identity and classification.\n\nMIA (Market Identification Agent): Assists in determining applicable markets and their regulatory requirements for a given product.", {
      poc: "Eswar Subramanian",
      offering_category: CAT_RIM,
      current_availability: "Currently available",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-011", MODULE_AGENT, "Freya.GRR-PAC + Via", "", {
      offering_category: CAT_GRI,
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-012", MODULE_AGENT_ADDON, "Freya.Register + Pia + Mia + Via", "This offering pairs the core Regulatory Information Management System (RIMS) registration modules of Freya.Register with AI agents that assist regulatory teams across product identification, market scoping, and change impact assessments.\n\nPIA (Product Identification Agent): Helps identify and structure a product's regulatory identity and classification.\n\nMIA (Market Identification Agent): Assists in determining applicable markets and their regulatory requirements for a given product.\n\nVIA (Variation Impact Assessment): Assesses the regulatory impact of a variation and indicates what needs to be communicated and through which channel, leaving the drafting and decision with the regulatory team.", {
      offering_category: CAT_RIM,
      current_availability: "To be Decided",
      future_availability: "Pilot Available Now",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      // CR-3 tags: the demo + whitepaper introduce the story (awareness),
      // pricing closes it (decision), and the competitive battle card is
      // evaluation ammunition for reps only (internal only).
      materials: [
        { id: "m-012a", kind: "video", label: "Via Agents demo", url: FREYR_URL.resources, journeyStage: "awareness", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
        { id: "m-012b", kind: "whitepaper", label: "Post-approval change automation", url: FREYR_URL.insights, journeyStage: "awareness", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
        { id: "m-012c", kind: "pricing", label: "Register stack pricing", url: FREYR_URL.contact, journeyStage: "decision", accessLevel: "client_facing", addedAt: DEMO_MATERIAL_ADDED_AT },
        { id: "m-012d", kind: "competition", label: "Freya vs. legacy RIM vendors", url: FREYR_URL.insights, journeyStage: "evaluation", accessLevel: "internal_only", addedAt: DEMO_MATERIAL_ADDED_AT },
      ],
    }),
    off("of-013", AGENTS_TYPE, "Freya.Agents", "", {
      poc: "Harshith",
      offering_category: CAT_PLATFORM,
      current_availability: "Currently available",
      customer_type_ids: [],
    }),
    off("of-014", AGENTS_TYPE, "Freya.OmniObject", "", {
      offering_category: CAT_PLATFORM,
      current_availability: "To be Decided",
      future_availability: "End of this year",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-015", AI_NATIVE, "Publishing", "• Document Planning, Authoring, review and approval\n• Regulatory submission assembly and publishing\n• Regulatory submission delivery & tracking\n• Agency review and approval\n• Post approval follow-up\n• eCTD Submissions, eCTD 4.0 Consulting & Support\n• Nees Submissions\n• Paper Submissions\n• CSR- Report Level Publishing\n• Document Formatting Services\n• Archiving Submission Data\n• CDISC Legacy Data Conversions\n• Regulatory Data Migration\n• Publishing Consulting Services\n• Automation Services - Regulatory Submissions QC, Document Level Publishing", {
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both",
      poc: "Ragav",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-016", SERVICE, "Submissions Planning & Management", "All activities that establish the submission plan, identify submission components, roles and responsibilities and promote an understanding of associated processes e.g.: Submission Planning and Management Team (SPMT) activities which promote emphasis on global participation to optimize harmonization of documents.\n• Submissions Management\n• Regulatory Operations\n• Content Planning", {
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both",
      poc: "Ragav",
      customer_type_ids: LARGE_ONLY_CT,
      market_ids: ALL_MKT,
    }),
    off("of-017", SERVICE, "Label Management", "• Strategic Labeling Consulting / Go-to-Market Strategy\n• Labeling Translation\n• Labeling Compliance & Labeling Operations Tracking\n• HA Submissions\n• Label Comparisons\n• Submission Deferrals\n• Formatting & QC\n• Label Lifecycle Management\n• Structured Product Labeling (SPL) and Structured Product Monograph (SPM)\n• ePI\n• Clinical Labeling\n• Global Labeling Management (GLM)/ Core Labeling\n• Regional Labeling Management (RLM)\n• Content Deviation Management\n• Gap Analysis", {
      offering_category: CAT_LABELING,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · ePI services: Upcoming for EU in 2027",
      poc: "Harshvardhan Gummadi / Sathya K",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-018", SERVICE, "Artwork Management", "• Artwork Process Consulting\n• Artwork Lifecycle Coordination\n• Artwork Studio Services (Creative Services, Product/Company Branding, Production Artwork, Artwork Adaptation)\n• Artwork Proofreading\n• Artwork Change Management\n• Artwork Management System\n• Global Artwork Translation\n• Artwork Illustrations\n• Technical Drawings (Cutterguides/Dielines)\n• Artwork Regulatory Compliance", {
      offering_category: CAT_LABELING,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team",
      poc: "Pranab Gogoi",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-019", SERVICE, "Regulatory Affairs Strategy", "Strategic consulting services that help customers define the optimal regulatory pathway for products and portfolios while transforming regulatory organizations for future readiness. The offering spans product-level regulatory strategy, portfolio planning, regulatory intelligence, and health authority engagement, alongside regulatory operating model and process consulting to optimize people, processes, governance, and technology across the regulatory function.\n\nProduct & Portfolio Strategy\n. Regulatory pathway selection\n. Global development strategy\n. Market prioritization\n. Regulatory due diligence\n. Regulatory gap assessments\n. Health authority engagement strategy\n. Scientific advice planning and support\n. Portfolio optimization\n. Regulatory intelligence & policy monitoring\n\nRegulatory Transformation & Process Consulting\n. Process design and optimization\n. Governance framework design\n. Regulatory organization design\n. Digital transformation and technology enablement\n. Labeling operating model design\n. Due diligence process design\n. Change management and implementation support", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in major markets via in-house delivery team. Can be supported by Freyr-X for other regions.",
      poc: "Mukundh Chouthoy / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-020", SERVICE, "Regulatory Affairs - Initial Applications & Market Access", "End-to-end regulatory support for obtaining initial marketing authorizations and enabling successful product launches across global markets. The offering covers regulatory planning, dossier preparation, submission execution, health authority interactions, and local market entry support, ensuring efficient approvals and timely commercialization.\n\nInitial Registration & Submission Services\n. Regulatory submission strategy\n. Global submission planning and coordination\n. Marketing Authorization Applications (MAA/NDA/BLA/ANDA)\n. Initial registration submissions\n. Dossier authoring and compilation\n. ECTD publishing and validation\n. Submission management\n. Health authority submission support\n. Agency meeting coordination\n\nMarket Entry & Affiliate Support\n. Local affiliate coordination\n. MAH and Local Legal Representative services\n. Country-specific application support\n. GMP certificate support\n. Market entry regulatory support", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in major markets via in-house delivery team. Can be supported by Freyr-X for other regions.",
      poc: "Mukundh Chouthoy / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-021", SERVICE, "Local Regulatory Affairs", "Comprehensive country- and region-specific regulatory services that ensure products remain compliant with local regulatory requirements throughout their commercial lifecycle. The offering provides dedicated affiliate support for regulatory execution, health authority engagement, license maintenance, and market-specific compliance activities.\n\nServices include:\n. Local regulatory submissions\n. Health authority interactions\n. Affiliate regulatory support\n. Regulatory correspondence management\n. Local dossier maintenance\n. Country-specific regulatory execution\n. Regulatory commitment tracking\n. License maintenance\n. MAH maintenance services\n. Local Labeling services\n. Artwork coordination\n. Translation and localization support\n. Legalization and notarization\n. Local regulatory intelligence", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX",
      poc: "Mukundh Chouthoy / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-022", SERVICE, "Post-Approval Regulatory Affairs", "End-to-end lifecycle management services that support regulatory compliance following product approval. The offering enables efficient management of post-approval changes through strategic planning, submission execution, publishing, and coordination across global and local markets while ensuring continued regulatory compliance.\n\nLifecycle Submission Management\n. Global lifecycle management\n. Variation management (IA/IB/II, CBE, PAS, etc.)\n. Renewals\n. Annual reports\n. Change management\n. CMC lifecycle management\n. Line extensions\n. Product transfers\n. Marketing authorization transfers\n. Withdrawal submissions\n\nRegulatory Operations & Compliance\n. Health authority query responses\n. Submission management\n. ECTD publishing\n. Regulatory publishing QC\n. Regulatory data management\n. RIMS support\n. Commitment tracking\n. Global coordination\n. Regulatory metrics and reporting", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Can be provided globally through Freyr central team (India, Poland, Colombia)",
      poc: "Mukundh Chouthoy",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-023", SERVICE, "Regulatory Intelligence Services", "• Regulatory Intelligence Consulting\n• On-demand Regulatory Intelligence\n• Integrated Project Regulatory Intelligence Support\n• FTEs (Research Associates etc.)\n• Periodic RI updates (Newletters etc.)", {
      offering_category: CAT_GRI,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both",
      poc: "Aditi Kalia",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-024", SERVICE, "Pharmacovigilance", "• PV Consulting\n• End-to-end ICSR Management\n• Aggregate Reporting\n• Literature Monitoring\n• QPPV and Local PV Services\n• Signal Management & Risk Management Plan\n• Safety Database Services & Solutions\n• PV Audit & Quality Assurance & Analysis\n• Medical Information Call Center Services", {
      // The five service lines from of-024 to of-028 came off Sara's MPR list
      // with no category, so they rendered a BLANK subcaption everywhere a
      // category is shown (Suren, Jul 26, on Related offerings: "Why do some
      // of these have a sub caption but some of them don't?"). Each is mapped
      // to the closest of the six EXISTING categories rather than inventing
      // new ones: Pharmacovigilance and Compliance/Audit/Validation are
      // ongoing-compliance consulting → Regulatory Affairs; the medical
      // writing / communication lines author and publish regulatory content →
      // Submissions and Document Operations. Re-map here if Suren later wants
      // dedicated PV / Medical Writing categories.
      offering_category: CAT_OTHERS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · PV team focus is on small & mid-sized companies; Current PV team size can't support multiple large clients without leveraging FreyrX - MSD is their only large client",
      poc: "Gurpreet Kaur",
      customer_type_ids: NO_LARGE_CT,
      market_ids: ALL_MKT,
    }),
    off("of-025", SERVICE, "Medical Writing - Clinical", "• Regulatory Writing\n• Clinical Trial Consulting\n• Clinical Trial Audit & Monitoring\n• Quality Check & Medical Review of Regulatory Documents\n• Risk-Benefit Analysis\n• Clinical Data Transparency Initiative\n• Clinical Summaries & Overviews\n• Clinical Study Reports, IB, ICF, PLLR Support\n• Clinical Protocols, Design & Review\n• Scientific Advice & Briefing Packages\n• Clinical Investigation Plan (including PIP)", {
      // Clinical summaries, CSRs, protocols and briefing packages are the
      // authored documents a dossier is built from — same family as Publishing
      // and Submissions Planning & Management.
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both",
      poc: "Seema Gurbani",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-026", SERVICE, "Medical Writing - Non Clinical & Toxicology", "• Regulatory Toxicology (1. ADE/PDE/Determination/ Report Services 2. F-Value Reports for Child Resistant Packaging (CRP) 3. Toxicological Risk Assessment (TRA) of impurities, Extractables & Leachables 4. Environmental Risk Assessment (ERA) of medicinal products)\n• Scientific and Regulatory Review of Non-clinical Documents\n• Development and Review of Study Plans/Protocols for Non-clinical Studies\n• Non-clinical Development Strategy for Regulatory Submissions\n• Consultation on Non-clinical Issues in the Submissions\n• Consultation and Responses to Regulatory Queries\n• GLP Audits of Test Facilities\n• CRO Identification and Qualification for Non-clinical Regulatory Studies", {
      // Non-clinical study plans, tox reports and query responses are written
      // for the submission dossier — same family as its clinical counterpart.
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · SEND compilation & submission: No in-house capability currently",
      poc: "Jaiprakash Bhelonde",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-027", SERVICE, "Compliance, Audit and Validation", "• End-to-end Regulatory Compliance Services\n• SOP Authoring & Gap Analysis of process with alignment to regulatory requirements\n• GxP Audit Services\n• CSV & CSA Validation Service Offerings\n• Building QMS", {
      // GxP audits, SOP authoring, CSV/CSA validation and QMS build-out are
      // the compliance-and-governance side of RA — the same consulting family
      // as Regulatory Affairs Strategy's transformation/process work.
      offering_category: CAT_OTHERS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · CSV & CSA Validation Services: Provided through FreyrX in all markets",
      poc: "Anushta Chandrapalan",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-028", SERVICE, "Medical & Scientific Communication", "• Medical Copywriting Services\n• Medical & Scientific Writing Services\n• Medical & Scientific Publication Services\n• Creative Scientific Design Studio\n• Promotional Regulatory Affairs (MLR Review etc.)\n• Ad Promo HA Submission & Consultation Services\n• Medical & Scientific Content Management", {
      // Medical copywriting, publications and Ad Promo HA submissions are
      // content authored, reviewed and filed — document operations, not a
      // labeling or artwork deliverable.
      offering_category: CAT_OTHERS,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · Medical & Scientific Content Management: No in-house capability currently (no previous clients)",
      poc: "Padmaja Jagannathan",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-029", SERVICE, "RIMS Data Services", "• RIMS Data Entry, Cleaning, Monitoring, Reports\n• RIMS Data QC\n• RIMS System Implementation & Upgrade Support\n• Data Migration Support (Data migration mapping, Data Verification)\n• Document Management (Uploads, Metadata review)\n• User Account Management (Admin activities, user account creation & management)\n• RIMS Training & Training Material Preparation\n• Data Visualization & Analytics\n• Europe - IDMP Consulting & Readiness Support, IDMP Data Management & Review,CTIS Data Management, XEVMPD Submissions", {
      offering_category: CAT_RIM,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team",
      poc: "Vikrant Mahajan",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-030", AGENTS_TYPE, "Agent.Via", "", {
      offering_category: CAT_PLATFORM,
    }),
    off("of-031", AGENTS_TYPE, "Agent.Ria", "", {
      offering_category: CAT_PLATFORM,
    }),
  ];
}

// ---------------------------------------------------------------------------
// In-memory store (globalThis so it survives dev HMR)
// ---------------------------------------------------------------------------
interface OfferingsStore {
  customerTypes: CustomerType[];
  markets: Market[];
  offeringTypes: OfferingType[];
  offeringCategories: OfferingCategory[];
  offerings: Offering[];
  /** Freya Digital components — the software pieces offerings are made of.
   *  Optional on the wire: catalogs persisted before Aug 8 lack it. */
  fdlComponents?: FdlComponent[];
  /** One-time migration marker for the approved offering-type descriptions. */
  offeringTypeCopyVersion?: number;
  /** One-time marker for Eswar's approved Freya.Register roadmap document. */
  freyaRegisterRoadmapVersion?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_STORE__: OfferingsStore | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_LIVE_OFFERINGS_STORE__: OfferingsStore | undefined;
  /** The showroom's own catalogue — a SEPARATE document, so nothing done in
   *  Mock can ever reach Real (Anir, Aug 8: "mock mode is just purely for
   *  looks… do not ever fuck with real mode"). */
  // eslint-disable-next-line no-var
  var __FREYR_MOCK_OFFERINGS_STORE__: OfferingsStore | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_MOCK_REV__: string | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_INIT__: Promise<void> | undefined;
  /** `updated_at` of the catalog revision this process currently holds. */
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_REV__: string | undefined;
  /** When we last checked the database for a newer revision. */
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_CHECKED__: number | undefined;
  /** True while THIS process is mid-write, so a refresh can't clobber it. */
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_WRITING__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_WRITE_QUEUE__: Promise<void> | undefined;
}

function seed(): OfferingsStore {
  const offerings = seedOfferings();
  // Showroom packages are generated per offering by demoComponentsForOffering
  // at read time, so every offering has components — not just two.
  return {
    customerTypes: seedCustomerTypes(),
    markets: seedMarkets(),
    offeringTypes: seedOfferingTypes(),
    offeringCategories: seedOfferingCategories(),
    offerings,
    fdlComponents: seedFdlComponents(),
    offeringTypeCopyVersion: 1,
    freyaRegisterRoadmapVersion: 1,
  };
}


/**
 * ROADMAP HISTORY FOR THE SHOWROOM.
 *
 * Mock has to look like a workspace somebody has been using for a year (Anir's
 * standing rule: mock is always full), and a version history that is empty
 * everywhere teaches nobody what the feature looks like. Built FROM each
 * component's own versions, so the story it tells can never contradict the
 * releases sitting next to it: each later version was added at some point, one
 * of them slipped a quarter, and the current-version mark moved when the newest
 * release shipped.
 *
 * Demo names only — mock never puts words in a real colleague's mouth.
 */
const DEMO_ROADMAP_AUTHORS = [
  "Audrey Kingsley",
  "Daniel Foster",
  "Grace Lockwood",
  "Hannah Schmidt",
];

function seedRoadmapHistory(
  releases: FdlRelease[],
  seed: number
): RoadmapVersion[] {
  if (releases.length < 2) return [];
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const snapshot = (upTo: number) =>
    releases.slice(0, upTo + 1).map((r) => ({ ...r }));
  const out: RoadmapVersion[] = [];
  const author = (i: number) =>
    DEMO_ROADMAP_AUTHORS[(seed + i) % DEMO_ROADMAP_AUTHORS.length];

  releases.forEach((release, i) => {
    if (i === 0) return;
    out.push({
      version: out.length + 1,
      savedAt: daysAgo(120 - i * 30),
      savedBy: author(i),
      changes: [`Added ${release.version}${release.date ? ` (${release.date})` : ""}`],
      releases: snapshot(i),
    });
  });
  /* One slipped date, because roadmaps slip — this is the entry that makes the
     feature obviously useful when a rep asks "did this move since I quoted it?" */
  const slipped = releases[releases.length - 1];
  if (slipped?.date) {
    /* A slip has to land on an EARLIER date — the first cut computed the same
       month and printed "moved from 2026-10-01 to 2026-10-01", which is not a
       slip, it is a typo with a timestamp. One quarter back, same day. */
    const slipFrom = new Date(slipped.date);
    slipFrom.setMonth(slipFrom.getMonth() - 3);
    const was = slipFrom.toISOString().slice(0, 10);
    out.push({
      version: out.length + 1,
      savedAt: daysAgo(21),
      savedBy: author(out.length),
      changes: [`${slipped.version} moved from ${was} to ${slipped.date}`],
      releases: snapshot(releases.length - 1),
    });
  }
  const current = releases.find((r) => r.current);
  if (current) {
    out.push({
      version: out.length + 1,
      savedAt: daysAgo(3 + (seed % 4)),
      savedBy: author(out.length),
      changes: [`${current.version} is now the current version`],
      releases: snapshot(releases.length - 1),
    });
  }
  /* Newest first, the way the list reads. */
  return out.reverse();
}

/** Demo FDL components for the mock showroom — enough versions and mapped
 *  features that the comparison matrix and feature sheets demo themselves. */
/**
 * THE SHOWROOM'S FDL CATALOGUE — deliberately full (Anir, Aug 8: "in the fake
 * mode it has to be as if there's a ton of shit for every single thing… more
 * fake data so i can see what this thing will look like"). Fourteen
 * components across all three types, each with a real-looking version history
 * and a feature grid mapped across those versions, so every surface — cards,
 * the version list, the feature matrix, the comparison, the downloads —
 * demonstrates itself. Generated deterministically: same catalogue every
 * load, no random drift between renders.
 */
/**
 * A believable paragraph for a showroom feature. Deterministic from the feature
 * name, so the demo never shuffles between reloads, and written in the voice a
 * regulatory team would actually use — this text is what the generated feature
 * sheet hands a customer.
 */
function demoFeatureDescription(
  feature: string,
  component: string,
  firstVersion: string
): string {
  const lead = feature.replace(/\.$/, "");
  const openers = [
    `${lead} is handled inside ${component}, so the regulatory team works from one record instead of reconciling spreadsheets between markets.`,
    `${component} covers ${lead.toLowerCase()} end to end, keeping the source data and the submitted output in step.`,
    `Teams use ${component} for ${lead.toLowerCase()} without leaving the system of record, which is what keeps the audit trail intact.`,
  ];
  const middles = [
    "Every change is versioned and attributable, so an inspector can be shown who altered what and when.",
    "Validation runs as the data is entered rather than at submission, which is where most avoidable queries come from.",
    "The same record feeds downstream dossiers, so a correction made once does not have to be made again in five places.",
  ];
  const closers = [
    `Available from ${firstVersion} onward and covered by the standard Freyr implementation.`,
    `Configurable per market, with the defaults set during onboarding.`,
    `Included in the base module, no separate licence.`,
  ];
  let h = 0;
  for (const ch of feature) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [
    openers[h % openers.length],
    middles[(h >>> 3) % middles.length],
    closers[(h >>> 6) % closers.length],
  ].join(" ");
}

function seedFdlComponents(): FdlComponent[] {
  const BLUEPRINTS: {
    name: string;
    type: FdlComponentType;
    versions: [string, string, "released" | "next"][];
    features: string[];
  }[] = [
    {
      name: "Register Module",
      type: "Module",
      versions: [
        ["V1.0", "2025-09-15", "released"],
        ["V1.4", "2026-01-20", "released"],
        ["V2.0", "2026-06-20", "released"],
        ["V2.1", "2026-10-01", "next"],
      ],
      features: [
        "Product registration tracking across every market",
        "Health-authority submission calendar with owners and due dates",
        "Change-control workflow with review and approval",
        "Bulk import from an existing registration book",
        "Audit-ready activity log, exportable for inspections",
        "Automated post-approval variation packages",
        "Market-by-market renewal reminders",
      ],
    },
    {
      name: "PI Agent",
      type: "Agent",
      versions: [
        ["V1.0", "2026-06-01", "released"],
        ["V1.1", "2026-09-15", "next"],
      ],
      features: [
        "Answers product-information questions from approved sources only",
        "Drafts label updates for a human to approve",
        "Flags conflicting product data across markets",
        "Cites the source document for every answer",
      ],
    },
    {
      name: "Intelligence Feed",
      type: "Module",
      versions: [
        ["V1.0", "2026-04-02", "released"],
        ["V1.2", "2026-08-11", "released"],
        ["V2.0", "2026-11-30", "next"],
      ],
      features: [
        "Daily regulatory-change digest by market",
        "Impact tagging by market and product line",
        "Saved watchlists per therapeutic area",
        "Weekly summary email to the regulatory team",
        "Change-to-product impact scoring",
      ],
    },
    {
      name: "Submissions Module",
      type: "Module",
      versions: [
        ["V2.6", "2025-11-10", "released"],
        ["V2.9", "2026-05-18", "released"],
        ["V3.2", "2026-09-30", "next"],
      ],
      features: [
        "eCTD dossier assembly and validation",
        "Publishing checks before a sequence is sent",
        "Submission tracking through to acknowledgement",
        "Lifecycle sequence numbering per market",
        "Gateway status with retry handling",
        "Archive of every submitted sequence",
      ],
    },
    {
      name: "Labelling Module",
      type: "Module",
      versions: [
        ["V3.0", "2025-12-05", "released"],
        ["V4.0", "2026-07-14", "released"],
      ],
      features: [
        "Core data sheet with market deviations",
        "Side-by-side label comparison between versions",
        "Translation workflow with reviewer sign-off",
        "Label change impact on registered markets",
        "Artwork hand-off with a locked reference",
      ],
    },
    {
      name: "Artwork Module",
      type: "Module",
      versions: [
        ["V1.2", "2026-02-25", "released"],
        ["V1.4", "2026-11-05", "next"],
      ],
      features: [
        "Artwork proofing with annotated review rounds",
        "Print-ready pack generation",
        "Version history against the approved label",
        "Supplier hand-off with a change summary",
      ],
    },
    {
      name: "Docs Module",
      type: "Module",
      versions: [
        ["V4.0", "2025-10-01", "released"],
        ["V5.0", "2026-03-22", "released"],
        ["V8.0", "2026-10-20", "next"],
      ],
      features: [
        "Controlled document storage with versioning",
        "Review and approval routing with e-signature",
        "Retention rules by document class",
        "Full-text search across the archive",
        "Read-and-understood tracking",
      ],
    },
    {
      name: "RIA.Chat",
      type: "Agent",
      versions: [
        ["V1.0", "2026-03-08", "released"],
        ["V1.3", "2026-07-19", "released"],
        ["V2.0", "2026-12-01", "next"],
      ],
      features: [
        "Conversational answers grounded in the regulatory library",
        "Follow-up questions that keep the thread's context",
        "Source citations on every answer",
        "Escalation to a named regulatory owner",
        "Answer history saved to the account",
      ],
    },
    {
      name: "RIA.Product Impact",
      type: "Agent",
      versions: [
        ["V1.0", "2026-05-06", "released"],
        ["V1.2", "2026-10-14", "next"],
      ],
      features: [
        "Maps a regulatory change to affected products",
        "Ranks impact by market and revenue exposure",
        "Drafts the assessment note for review",
        "Feeds the change-control workflow directly",
      ],
    },
    {
      name: "RIA.Submission Impact",
      type: "Agent",
      versions: [
        ["V1.0", "2026-06-30", "released"],
        ["V1.1", "2026-11-18", "next"],
      ],
      features: [
        "Flags in-flight submissions touched by a change",
        "Suggests the sequence that needs re-work",
        "Estimates the delay a change introduces",
      ],
    },
    {
      name: "VIA",
      type: "Agent",
      versions: [
        ["V1.0", "2026-04-28", "released"],
        ["V1.5", "2026-09-09", "released"],
      ],
      features: [
        "Reads a variation package and checks completeness",
        "Suggests the right variation category",
        "Prepares the market-specific cover letter",
        "Tracks the variation to approval",
      ],
    },
    {
      name: "CAN (Classify and Analyse)",
      type: "Agent",
      versions: [["V1.0", "2026-08-01", "released"]],
      features: [
        "Classifies incoming regulatory documents",
        "Extracts the obligations inside each one",
        "Routes each obligation to an owner",
      ],
    },
    {
      name: "Freya Fusion Platform",
      type: "Platform",
      versions: [
        ["V6.0", "2025-08-20", "released"],
        ["V7.0", "2026-02-10", "released"],
        ["V8.0", "2026-08-05", "released"],
        ["V9.0", "2026-12-15", "next"],
      ],
      features: [
        "Single sign-on across every Freya module",
        "Shared product and registration data model",
        "Role-based access down to the market level",
        "Audit trail across all modules",
        "Open API for customer systems",
        "Configurable dashboards per role",
        "Multi-tenant hosting with regional data residency",
      ],
    },
    {
      name: "Data Hub",
      type: "Platform",
      versions: [
        ["V2.0", "2026-01-15", "released"],
        ["V3.0", "2026-07-01", "released"],
        ["V3.4", "2026-11-25", "next"],
      ],
      features: [
        "IDMP-ready master data for products and substances",
        "Reference data governance with approval flow",
        "Connectors to ERP and quality systems",
        "Data quality scoring with exception queues",
        "Historical snapshots for audits",
      ],
    },
  ];

  return BLUEPRINTS.map((blueprint, index) => {
    const id = `fdl-demo-${String(index + 1).padStart(3, "0")}`;
    const releases: FdlRelease[] = blueprint.versions.map(
      ([version, date, status], position) => ({
        id: `${id}-r${position + 1}`,
        version,
        date,
        status,
        // The newest RELEASED version is what a seller quotes.
        current:
          status === "released" &&
          !blueprint.versions
            .slice(position + 1)
            .some(([, , later]) => later === "released"),
      })
    );
    const releasedIds = releases
      .filter((release) => release.status === "released")
      .map((release) => release.id);
    const allIds = releases.map((release) => release.id);
    const version1 = releases[0]?.version ?? "V1.0";
    const features: FdlFeature[] = blueprint.features.map((name, position) => {
      // Older features exist everywhere; later ones arrive with later
      // versions, so the comparison matrix has something real to show.
      const introducedAt = Math.min(
        Math.floor(position / 2),
        Math.max(0, allIds.length - 1)
      );
      return {
        id: `${id}-f${position + 1}`,
        fid: `F-${String(index + 1).padStart(2, "0")}${String(position + 1).padStart(2, "0")}`,
        name,
        // EVERY SHOWROOM FEATURE READS LIKE A REAL ONE. Left undefined, the
        // feature sheet and the drill-in were blank, so the demo could not show
        // what the module is for (Anir, Aug 9: "everything in mock mode needs
        // to have data so they see what it looks like eventually — obviously in
        // real mode they fill it in themselves"). Composed from the feature and
        // its component so it stays plausible, never copied onto a real record.
        description: demoFeatureDescription(name, blueprint.name, version1),
        versionIds: allIds.slice(introducedAt),
      };
    });
    // A component with no released version yet would read as broken.
    if (!releasedIds.length && releases[0]) releases[0].status = "released";
    return {
      id,
      name: blueprint.name,
      type: blueprint.type,
      releases,
      features,
      /* The showroom needs a history to show; real mode starts empty and
         fills itself as owners edit. */
      roadmap_versions: seedRoadmapHistory(releases, index),
    };
  });
}

const store: OfferingsStore = globalThis.__FREYR_OFFERINGS_STORE__ ?? seed();
if (!globalThis.__FREYR_OFFERINGS_STORE__) {
  globalThis.__FREYR_OFFERINGS_STORE__ = store;
}
// The catalog is approved Freyr master data, not demo CRM data. Keep a separate
// live copy so edits never leak between modes, but seed both modes from the
// master sheet. Live customers, contacts, sessions, and activity remain empty.
// The demo sales materials seeded on the core modules (fixed ids below) are
// SAMPLE assets for mock mode only. Real mode must show exclusively what an
// offering owner actually uploaded (Anir, Jul 27: "in real mode, why are there
// sales materials? Everything has to be real") — Eeswar starts uploading the
// genuine Freya.Register assets and Suren reviews that page this week.
const DEMO_MATERIAL_IDS = new Set([
  "m-001", "m-002", "m-003", // Freya.Register samples
  "m-012a", "m-012b", "m-012c", "m-012d", // Register-stack samples
]);
// The samples STAY in the catalog; real mode simply doesn't serve them. They
// used to be deleted outright, which was correct while mock and live were two
// separate catalogs — but once they were merged into one, that delete ran on
// the only catalog there is and the samples vanished for everyone, in every
// mode. Freya.Register's Sales materials section has been empty ever since.
// Hiding at read time gives real mode what it asked for without destroying
// data an offering owner can still see in the demo.
const DEMO_MATERIALS_BY_OFFERING: Record<string, OfferingMaterial[]> = (() => {
  const map: Record<string, OfferingMaterial[]> = {};
  for (const off of seed().offerings) {
    const demo = (off.materials || []).filter((m) => DEMO_MATERIAL_IDS.has(m.id));
    if (demo.length) map[off.id] = demo;
  }
  return map;
})();

/**
 * A COMPLETE SAMPLE ROADMAP FOR IN-PROGRESS MODE.
 *
 * The offering catalogue itself is shared between modes, so demo roadmap
 * rows must never be written into that catalogue: doing so would make fake
 * versions appear in Ready now. Instead, mock mode overlays a deterministic
 * past/current/next story at read time. Every offering therefore demonstrates
 * the finished roadmap UI while live mode continues to expose only versions
 * an Offering Owner actually recorded.
 */
type DemoRoadmapTheme = {
  past: [string, string];
  current: [string, string, string];
  next: [string, string, string];
};

const DEMO_ROADMAP_THEMES: Record<string, DemoRoadmapTheme> = {
  [CAT_RIM]: {
    past: [
      "Centralized product, application, and registration records",
      "Introduced governed lifecycle-change tracking",
    ],
    current: [
      "Unified product and registration workspace with role-based workflows",
      "Market-level status, dependency, and renewal visibility",
      "Audit-ready history for every customer record change",
    ],
    next: [
      "Guided impact assessment for lifecycle changes",
      "Configurable portfolio alerts and exception dashboards",
      "Expanded data-quality checks before regulatory handoffs",
    ],
  },
  [CAT_SUBMISSIONS]: {
    past: [
      "Standardized submission planning and document handoffs",
      "Added reusable publishing and quality-control checklists",
    ],
    current: [
      "End-to-end submission planning, authoring, review, and delivery tracking",
      "Reusable content packages with clear owner and due-date visibility",
      "Operational dashboards for readiness, validation, and agency follow-up",
    ],
    next: [
      "AI-assisted content readiness and dossier completeness checks",
      "Earlier risk alerts for delayed components and approvals",
      "Broader eCTD 4.0 and multi-market publishing automation",
    ],
  },
  [CAT_GRI]: {
    past: [
      "Consolidated regulatory intelligence sources by market",
      "Added structured review and impact-assessment workflows",
    ],
    current: [
      "Global regulatory monitoring with traceable source and market context",
      "Prioritized impact assessments for products and active registrations",
      "Shareable intelligence briefings and follow-up ownership",
    ],
    next: [
      "Personalized alerts based on portfolio and market exposure",
      "AI-generated summaries with source-level citations",
      "Cross-market trend views for earlier regulatory planning",
    ],
  },
  [CAT_LABELING]: {
    past: [
      "Standardized label and artwork request intake",
      "Added review checkpoints and controlled file handoffs",
    ],
    current: [
      "End-to-end label and artwork lifecycle coordination",
      "Market, language, and component-level approval visibility",
      "Controlled comparison, proofreading, and audit history",
    ],
    next: [
      "Automated content and artwork consistency checks",
      "Expanded ePI workflows and regional variation support",
      "Predictive alerts for approval and production bottlenecks",
    ],
  },
  [CAT_PLATFORM]: {
    past: [
      "Connected core Freya modules through a shared workspace",
      "Introduced reusable regulatory objects and permissions",
    ],
    current: [
      "Unified navigation, identity, and data across Freya Fusion modules",
      "Cross-module agents grounded in governed regulatory information",
      "Portfolio dashboards with traceable actions and approvals",
    ],
    next: [
      "More configurable agents for multi-step regulatory work",
      "Shared context across modules, markets, and customer teams",
      "Expanded admin controls, observability, and workflow analytics",
    ],
  },
  [CAT_RA]: {
    past: [
      "Standardized regulatory planning and delivery playbooks",
      "Added market-level ownership and milestone tracking",
    ],
    current: [
      "Structured regulatory strategy, execution, and health-authority tracking",
      "Clear market, submission, commitment, and renewal visibility",
      "Reusable delivery plans with accountable owners and due dates",
    ],
    next: [
      "AI-assisted pathway, gap, and market-priority recommendations",
      "Earlier risk signals across submissions and commitments",
      "Expanded portfolio reporting for global and affiliate teams",
    ],
  },
  [CAT_OTHERS]: {
    past: [
      "Standardized specialist-service intake and delivery tracking",
      "Added controlled templates, reviews, and evidence capture",
    ],
    current: [
      "Role-based workflows for specialist regulatory delivery",
      "Customer, deliverable, milestone, and quality visibility",
      "Traceable approvals and reusable delivery templates",
    ],
    next: [
      "AI-assisted quality checks and delivery recommendations",
      "Expanded analytics for capacity, risk, and turnaround time",
      "More configurable workflows for regional delivery models",
    ],
  },
};

const DEFAULT_DEMO_ROADMAP_THEME: DemoRoadmapTheme = {
  past: [
    "Established the first standardized customer delivery workflow",
    "Added shared records, ownership, and milestone tracking",
  ],
  current: [
    "Unified workspace with role-based workflows and approvals",
    "Customer, market, milestone, and deliverable visibility",
    "Reusable reporting with a complete audit history",
  ],
  next: [
    "AI-assisted recommendations for common workflows",
    "Earlier risk alerts and more configurable dashboards",
    "Expanded integrations and cross-team handoffs",
  ],
};

/** Which demo components each showroom offering is a package of. */
/**
 * WHICH DEMO COMPONENTS EACH SHOWROOM OFFERING IS A PACKAGE OF. Spread across
 * the catalogue so the Components tab is populated wherever a reviewer lands,
 * and derived from the offering's own index so every offering gets a
 * plausible bundle rather than a handful of lucky ones.
 */
const DEMO_COMPONENT_IDS = [
  "fdl-demo-001", "fdl-demo-002", "fdl-demo-003", "fdl-demo-004",
  "fdl-demo-005", "fdl-demo-006", "fdl-demo-007", "fdl-demo-008",
  "fdl-demo-009", "fdl-demo-010", "fdl-demo-011", "fdl-demo-012",
  "fdl-demo-013", "fdl-demo-014",
];

function demoComponentsForOffering(offeringId: string): string[] {
  const number = Number(offeringId.match(/\d+/)?.[0] || 1);
  // Two or three components each: the platform, one module, sometimes an
  // agent — the shape Suren described for a real package.
  const first = DEMO_COMPONENT_IDS[number % DEMO_COMPONENT_IDS.length];
  const second =
    DEMO_COMPONENT_IDS[(number * 3 + 1) % DEMO_COMPONENT_IDS.length];
  const third = DEMO_COMPONENT_IDS[(number * 5 + 2) % DEMO_COMPONENT_IDS.length];
  return Array.from(
    new Set(number % 3 === 0 ? [first, second, third] : [first, second])
  );
}


function demoRoadmapForOffering(offering: Offering): OfferingRelease[] {
  const number = Number(offering.id.match(/\d+/)?.[0] || 1);
  const theme =
    DEMO_ROADMAP_THEMES[offering.offering_category] ||
    DEFAULT_DEMO_ROADMAP_THEME;
  const product = offering.offering_type.startsWith("Freya Fusion");
  const currentMinor = 2 + (number % 4);
  const serviceMinor = 1 + (number % 2);
  const versions = product
    ? {
        past: `v1.${currentMinor - 1}`,
        current: `v1.${currentMinor}`,
        next: `v1.${currentMinor + 1}`,
      }
    : {
        past: `2025.${serviceMinor}`,
        current: `2026.${serviceMinor}`,
        next: `2026.${serviceMinor + 1}`,
      };
  const pastMonth = String(3 + (number % 7)).padStart(2, "0");
  const currentMonth = String(1 + (number % 5)).padStart(2, "0");
  const nextMonth = String(9 + (number % 4)).padStart(2, "0");

  return [
    {
      id: `demo-roadmap-${offering.id}-past`,
      version: versions.past,
      date: `2025-${pastMonth}-15`,
      status: "released",
      features: [...theme.past],
      note: "Sample roadmap data for in-progress mode.",
    },
    {
      id: `demo-roadmap-${offering.id}-current`,
      version: versions.current,
      date: `2026-${currentMonth}-12`,
      status: "released",
      features: [
        `${offering.offering_name} customer experience refreshed for faster day-to-day use`,
        ...theme.current,
      ],
      note: "Sample roadmap data for in-progress mode.",
    },
    {
      id: `demo-roadmap-${offering.id}-next`,
      version: versions.next,
      date: `2026-${nextMonth}-20`,
      status: "next",
      features: [...theme.next],
      note: "Sample roadmap data for in-progress mode.",
    },
  ];
}

// A catalog persisted BEFORE this fix had the samples deleted out of it, so put
// them back on load rather than leaving prod permanently empty.
function restoreDemoMaterials(s: OfferingsStore): OfferingsStore {
  for (const off of s.offerings) {
    const demo = DEMO_MATERIALS_BY_OFFERING[off.id];
    if (!demo) continue;
    off.materials = off.materials || [];
    for (const m of demo) {
      const index = off.materials.findIndex((x) => x.id === m.id);
      if (index === -1) {
        off.materials.push({ ...m });
        continue;
      }
      // Dev HMR and persisted mock catalogues can hold the older version of a
      // sample row. Merge seed metadata forward so the newly recorded import
      // date appears immediately without replacing any user-edited fields.
      const existing = off.materials[index];
      off.materials[index] = {
        ...m,
        ...existing,
        addedAt: existing.addedAt || m.addedAt,
      };
    }
  }
  return s;
}

/** What a READER may see. Real mode gets only genuinely uploaded assets. */
function withVisibleMaterials(off: Offering): Offering {
  const normalizeMaterials = (materials: OfferingMaterial[]) =>
    materials.map((material) => ({
      ...material,
      folder: canonicalMaterialFolder(material),
    }));
  const canonicalFolders = (off.materialFolders || []).map((folder) =>
    canonicalMaterialFolder({ folder, label: "", kind: "other" })
  );
  if (getDataMode() !== "live") {
    return {
      ...off,
      materials: normalizeMaterials(off.materials || []),
      materialFolders: Array.from(new Set(canonicalFolders)),
      releases: demoRoadmapForOffering(off),
      // The showroom's demo component connections, unless real ones exist.
      component_ids: off.component_ids ?? demoComponentsForOffering(off.id),
    };
  }
  if (!off.materials?.length)
    return { ...off, materialFolders: Array.from(new Set(canonicalFolders)) };
  const real = off.materials.filter((m) => !DEMO_MATERIAL_IDS.has(m.id));
  return {
    ...off,
    materials: normalizeMaterials(real),
    materialFolders: Array.from(new Set(canonicalFolders)),
  };
}

const liveStore: OfferingsStore =
  globalThis.__FREYR_LIVE_OFFERINGS_STORE__ ?? seed();
globalThis.__FREYR_LIVE_OFFERINGS_STORE__ = liveStore;
const mockStore: OfferingsStore =
  globalThis.__FREYR_MOCK_OFFERINGS_STORE__ ?? seed();
globalThis.__FREYR_MOCK_OFFERINGS_STORE__ = mockStore;
// Back-fill collections added in a later build onto a store that an earlier build
// already created (matters only for dev HMR; prod always starts fresh).
if (!store.offeringTypes) store.offeringTypes = seedOfferingTypes();
if (!store.offeringCategories)
  store.offeringCategories = seedOfferingCategories();
if (!store.fdlComponents) store.fdlComponents = seedFdlComponents();
if (!liveStore.fdlComponents) liveStore.fdlComponents = [];
// FIELDS THAT ARRIVED AFTER CATALOGS WERE ALREADY PERSISTED. A stored offering
// that predates them loads with the field undefined, and the first `.map` or
// `.some` on it takes the whole page down. This healer runs at EVERY point a
// store's contents can be replaced, not just module init: the Jul 29 prod
// white-screen on Freya.Register happened because the Supabase catalog restore
// (initializeLiveOfferings → replaceStore) bypassed the init-time loop, so live
// records arrived without `contacts` while seeded ones had it.
function healOfferings(s: OfferingsStore): boolean {
  let catalogChanged = false;
  // Apply the approved type copy once to persisted catalogues created before
  // it was supplied. The marker lets administrators edit the records later
  // without every server restart replacing their work.
  if ((s.offeringTypeCopyVersion ?? 0) < 1) {
    for (const approved of seedOfferingTypes()) {
      const existing = s.offeringTypes.find(
        (type) => type.id === approved.id || type.name === approved.name
      );
      if (existing) {
        existing.name = approved.name;
        existing.description = approved.description;
      } else {
        s.offeringTypes.push(structuredClone(approved));
      }
    }
    s.offeringTypeCopyVersion = 1;
    catalogChanged = true;
  }
  if ((s.freyaRegisterRoadmapVersion ?? 0) < 1) {
    const register = s.offerings.find((offering) => offering.id === "of-001");
    if (register) {
      register.releases = structuredClone(FREYA_REGISTER_RELEASES);
      register.roadmap_details = structuredClone(
        FREYA_REGISTER_ROADMAP_DETAILS
      );
      register.contacts = structuredClone(FREYA_REGISTER_KEY_CONTACTS);
      register.future_availability = "Version 2.5";
    }
    s.freyaRegisterRoadmapVersion = 1;
    catalogChanged = true;
  }
  // The editable customer taxonomy gained two approved families. Add only
  // missing exact ids so an existing definition edited by an administrator is
  // never overwritten.
  for (const customerType of seedCustomerTypes()) {
    if (!s.customerTypes.some((existing) => existing.id === customerType.id)) {
      s.customerTypes.push(customerType);
      catalogChanged = true;
    }
  }
  // Change request 28 renamed the platform-wide type/category and added two
  // named Agent offerings. Existing workspaces hold the catalogue as one
  // persisted document, so changing the seed alone would never update them.
  // Migrate only the exact legacy names, preserving every owner-entered field.
  const agentsTypeDescription =
    "Freya Fusion Agents are platform-level AI agents and cross-module objects, including Freya.Agents and Freya.OmniObject, that work across the Freya Fusion environment rather than being limited to one module.";
  const platformType = s.offeringTypes.find(
    (type) => type.name === PLATFORM_TYPE
  );
  const currentAgentsType = s.offeringTypes.find(
    (type) => type.name === AGENTS_TYPE
  );
  if (!platformType) {
    s.offeringTypes.push({
      id: s.offeringTypes.some((type) => type.id === "ot-fusion-platform")
        ? "ot-fusion-platform-core"
        : "ot-fusion-platform",
      name: PLATFORM_TYPE,
      description: "",
    });
    catalogChanged = true;
  }
  if (!currentAgentsType) {
    s.offeringTypes.push({
      id: "ot-fusion-agents",
      name: AGENTS_TYPE,
      description: agentsTypeDescription,
    });
    catalogChanged = true;
  }

  const typeRenames: Record<string, string> = {
    "Freyr AI Native Service": AI_NATIVE,
    "Freyr Service": SERVICE,
  };
  for (const type of s.offeringTypes) {
    const nextName = typeRenames[type.name];
    if (nextName) {
      type.name = nextName;
      catalogChanged = true;
    }
  }

  const legacyCategory = s.offeringCategories.find(
    (category) => category.name === LEGACY_PLATFORM_CATEGORY
  );
  const currentPlatformCategory = s.offeringCategories.find(
    (category) => category.name === CAT_PLATFORM
  );
  if (legacyCategory && !currentPlatformCategory) {
    legacyCategory.name = CAT_PLATFORM;
    catalogChanged = true;
  } else if (legacyCategory && currentPlatformCategory) {
    if (!currentPlatformCategory.owner && legacyCategory.owner) {
      currentPlatformCategory.owner = legacyCategory.owner;
      currentPlatformCategory.owner_user_id = legacyCategory.owner_user_id;
    }
    s.offeringCategories = s.offeringCategories.filter(
      (category) => category !== legacyCategory
    );
    catalogChanged = true;
  }

  for (const offering of s.offerings) {
    if (typeRenames[offering.offering_type]) {
      offering.offering_type = typeRenames[offering.offering_type];
      catalogChanged = true;
    }
    if (offering.offering_category === LEGACY_PLATFORM_CATEGORY) {
      offering.offering_category = CAT_PLATFORM;
      catalogChanged = true;
    }
  }

  for (const [id, name] of [
    ["of-030", "Agent.Via"],
    ["of-031", "Agent.Ria"],
  ] as const) {
    const existing = s.offerings.find(
      (offering) => offering.offering_name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (existing.offering_type !== AGENTS_TYPE) {
        existing.offering_type = AGENTS_TYPE;
        catalogChanged = true;
      }
      if (existing.offering_category !== CAT_PLATFORM) {
        existing.offering_category = CAT_PLATFORM;
        catalogChanged = true;
      }
      continue;
    }
    const stableId = s.offerings.some((offering) => offering.id === id)
      ? `of-agent-${name.split(".")[1].toLowerCase()}`
      : id;
    s.offerings.push(
      off(stableId, AGENTS_TYPE, name, "", {
        offering_category: CAT_PLATFORM,
      })
    );
    catalogChanged = true;
  }
  // A catalogue persisted before "Global" existed has no such market, so an
  // owner opening the picker today would not find it (change request 11). Add
  // it back rather than reseeding — every other market and every edit stays.
  if (!s.markets.some((m) => m.id === "mkt-global")) {
    s.markets.unshift({ id: "mkt-global", name: "Global" });
  }
  // "Others" and its specialist offerings landed after the first live catalogue was
  // persisted, so heal both — but only where the row still carries the tag we
  // put there ourselves. An owner who has since chosen a category keeps it.
  if (!s.offeringCategories.some((c) => c.id === "oc-others")) {
    s.offeringCategories.push({
      id: "oc-others",
      name: CAT_OTHERS,
      description:
        "Specialist services that stand on their own rather than under one of the six categories, pharmacovigilance, compliance and audit, and medical communication.",
      owner: "",
    });
  }
  for (const [id, wrong] of [
    ["of-024", CAT_RA],
    ["of-027", CAT_RA],
    ["of-028", CAT_SUBMISSIONS],
  ] as const) {
    const row = s.offerings.find((o) => o.id === id);
    if (row && row.offering_category === wrong) row.offering_category = CAT_OTHERS;
  }
  // Change-log migration: the two medical-writing services are submission
  // document operations, not catch-all "Others" rows. Match both stable ids
  // and exact names so a catalogue imported before the ids were standardised
  // is repaired too. Only the legacy Others/blank assignment is changed; a
  // later explicit owner choice is respected.
  const medicalWritingNames = new Set([
    "Medical Writing - Clinical",
    "Medical Writing - Non Clinical & Toxicology",
  ]);
  for (const offering of s.offerings) {
    const isMedicalWriting =
      offering.id === "of-025" ||
      offering.id === "of-026" ||
      medicalWritingNames.has(offering.offering_name.trim());
    if (
      isMedicalWriting &&
      (!offering.offering_category || offering.offering_category === CAT_OTHERS)
    ) {
      offering.offering_category = CAT_SUBMISSIONS;
      catalogChanged = true;
    }
  }
  // Freya.Register is sold worldwide; the five regional chips were read as a
  // restriction (Wajeed + Eeswar). Collapse them ONCE, and only when the row
  // still carries exactly the old regional set — an owner who has since chosen
  // their own markets keeps them.
  const register = s.offerings.find((o) => o.id === "of-001");
  if (register?.market_ids && register.market_ids.length === 5) {
    const set = new Set(register.market_ids);
    if (ALL_MKT.every((m) => set.has(m))) register.market_ids = [...GLOBAL_MKT];
  }
  for (const o of s.offerings) {
    if (!o.owners) o.owners = [];
    if (!o.materials) o.materials = [];
    if (!o.customer_type_ids) o.customer_type_ids = [];
    if (!o.market_ids) o.market_ids = [];
    // `poc` cell → real contact rows, so the sheet's people are kept.
    if (!o.contacts) o.contacts = contactsFromPoc(o);
  }
  // SHOWROOM FEATURES GET THEIR DESCRIPTION BACK. The demo components were
  // persisted before descriptions existed, and a persisted row always beats a
  // fresh seed, so the Features table, the drill-in and the downloadable sheet
  // all rendered a blank description column for good (Anir, Aug 9: "everything
  // in mock mode needs to have data"). Only `fdl-demo-*` ids are touched, only
  // when the field is genuinely empty, and the text is deterministic, so this
  // can never overwrite something a person wrote or reach a real component.
  for (const component of s.fdlComponents ?? []) {
    if (!component.id.startsWith("fdl-demo-")) continue;
    const firstVersion = component.releases[0]?.version ?? "V1.0";
    for (const feature of component.features) {
      if (feature.description && feature.description.trim()) continue;
      feature.description = demoFeatureDescription(
        feature.name,
        component.name,
        firstVersion
      );
    }
  }
  return catalogChanged;
}
healOfferings(store);
healOfferings(liveStore);
// mockStore was missing from this list. It is the store `activeStore()` hands
// back in Mock mode, so every back-fill above reached the two stores nobody
// reads and skipped the one the demo actually renders from. It was only ever
// healed on a Supabase restore, which is why a field added after the mock row
// was written stayed empty until something happened to re-hydrate it.
healOfferings(mockStore);

// ONE offerings catalog, always — the mode switch is about which MODULES are
// finished, not about which data is real (Anir, Jul 27: "if I add or delete a
// sales material it should show up on both of them… it's just a matter of
// what's done and what's still being worked on"). Two catalogs meant an upload
// made in one view silently vanished in the other. The offerings catalog is
// approved Freyr master data plus real uploaded assets — never demo content —
// so both views read and write the same persisted store.
/**
 * WHICH CATALOGUE THIS REQUEST IS LOOKING AT. Real mode reads and writes the
 * production document; Mock reads and writes its own. They are two rows in
 * the same table, never the same object, so a demo edit cannot land in the
 * real catalogue (Anir, Aug 8).
 */
function activeStore(): OfferingsStore {
  return getDataMode() === "live" ? liveStore : mockStore;
}

function replaceStore(target: OfferingsStore, source: OfferingsStore) {
  target.customerTypes = structuredClone(source.customerTypes);
  target.markets = structuredClone(source.markets);
  target.offeringTypes = structuredClone(source.offeringTypes);
  target.offeringCategories = structuredClone(source.offeringCategories);
  target.offerings = structuredClone(source.offerings);
  // Catalogs persisted before FDL components existed load without the field.
  target.fdlComponents = structuredClone(source.fdlComponents ?? []);
}

function isOfferingsStore(value: unknown): value is OfferingsStore {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfferingsStore>;
  return (
    Array.isArray(candidate.customerTypes) &&
    Array.isArray(candidate.markets) &&
    Array.isArray(candidate.offeringTypes) &&
    Array.isArray(candidate.offeringCategories) &&
    Array.isArray(candidate.offerings)
  );
}

function catalogClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * THE OFFERINGS CATALOGUE IS REAL IN BOTH WORKSPACE MODES.
 *
 * `hasSupabase()` intentionally returns false in mock mode because CRM records
 * must stay fake there. Reusing it here made a newly deployed mock-mode server
 * skip the persisted offerings catalogue too, so Freya.Register fell back to
 * its empty seed: Eswar appeared not to own it and all 21 uploaded materials
 * appeared deleted even though both were still intact in Supabase.
 *
 * Offerings, ownership and uploaded collateral are approved shared master
 * data. They use the configured catalogue database regardless of whether the
 * surrounding CRM workspace is live or sample data.
 */
function hasCatalogueDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// `offering_catalog_state` is deliberately a single deployment-wide document
// (migration 003 has no workspace_id). This Freyr deployment is hard-bound to
// one FREYR_WORKSPACE_ID; converting the app to multi-workspace hosting must
// first add a workspace column/key rather than reusing this singleton adapter.
export async function persistLiveOfferings(): Promise<void> {
  // ONE FUNCTION, TWO ROWS. "default" is the real catalogue; "mock" is the
  // showroom. A mock server persisting is now correct rather than dangerous,
  // because it can only ever write the mock row.
  const live = getDataMode() === "live";
  if (!hasCatalogueDatabase()) {
    throw new Error("Live offering changes require the configured Supabase database.");
  }
  const stamp = new Date().toISOString();
  const { error } = await catalogClient().from("offering_catalog_state").upsert({
    id: live ? "default" : "mock",
    catalog: structuredClone(live ? liveStore : mockStore),
    updated_at: stamp,
  });
  if (error) throw new Error(`Could not persist the offering catalog: ${error.message}`);
  // We are now, by definition, holding the newest revision — remember it so
  // the staleness check below doesn't immediately re-read our own write.
  if (live) globalThis.__FREYR_OFFERINGS_REV__ = stamp;
  else globalThis.__FREYR_OFFERINGS_MOCK_REV__ = stamp;
  globalThis.__FREYR_OFFERINGS_CHECKED__ = Date.now();
}

export async function initializeLiveOfferings(): Promise<void> {
  if (!hasCatalogueDatabase()) return;
  if (!globalThis.__FREYR_OFFERINGS_INIT__) {
    globalThis.__FREYR_OFFERINGS_INIT__ = (async () => {
      const { data, error } = await catalogClient()
        .from("offering_catalog_state")
        .select("catalog, updated_at")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw new Error(`Could not load the offering catalog: ${error.message}`);
      // THE SHOWROOM IS DURABLE TOO. Its row is loaded here and created on
      // first boot if it has never existed, so demo edits survive a restart
      // and every reviewer sees the same showroom. persistLiveOfferings()
      // cannot be used for that: at boot there is no request, so the data
      // mode is unknowable — this writes the mock row explicitly.
      try {
        const mockRow = await catalogClient()
          .from("offering_catalog_state")
          .select("catalog, updated_at")
          .eq("id", "mock")
          .maybeSingle();
        if (isOfferingsStore(mockRow.data?.catalog)) {
          replaceStore(mockStore, mockRow.data.catalog);
          healOfferings(mockStore);
          globalThis.__FREYR_OFFERINGS_MOCK_REV__ =
            mockRow.data.updated_at ?? undefined;
        } else {
          const stamp = new Date().toISOString();
          await catalogClient().from("offering_catalog_state").upsert({
            id: "mock",
            catalog: structuredClone(mockStore),
            updated_at: stamp,
          });
          globalThis.__FREYR_OFFERINGS_MOCK_REV__ = stamp;
        }
      } catch {
        // A showroom that cannot load is not a reason to fail the app: mock
        // falls back to the in-memory seed, which is already a full catalogue.
      }
      globalThis.__FREYR_OFFERINGS_REV__ = data?.updated_at ?? undefined;
      globalThis.__FREYR_OFFERINGS_CHECKED__ = Date.now();
      if (isOfferingsStore(data?.catalog)) {
        replaceStore(liveStore, data.catalog);
        // The persisted catalog can predate newer offering fields: heal it
        // BEFORE anything renders from it.
        const migratedCategories = healOfferings(liveStore);
        // Heal a catalog persisted while the samples were being deleted: put
        // them back and write the repaired catalog once.
        const before = liveStore.offerings.reduce((n, o) => n + o.materials.length, 0);
        const datedDemoBefore = liveStore.offerings.reduce(
          (count, offering) =>
            count +
            offering.materials.filter(
              (material) =>
                DEMO_MATERIAL_IDS.has(material.id) && !!material.addedAt
            ).length,
          0
        );
        restoreDemoMaterials(liveStore);
        const after = liveStore.offerings.reduce((n, o) => n + o.materials.length, 0);
        const datedDemoAfter = liveStore.offerings.reduce(
          (count, offering) =>
            count +
            offering.materials.filter(
              (material) =>
                DEMO_MATERIAL_IDS.has(material.id) && !!material.addedAt
            ).length,
          0
        );
        if (
          after !== before ||
          datedDemoAfter !== datedDemoBefore ||
          migratedCategories
        )
          await persistLiveOfferings();
        return;
      }
      await persistLiveOfferings();
    })();
  }
  await globalThis.__FREYR_OFFERINGS_INIT__;
  await refreshStaleCatalog();
}

/** How long this process may serve its cached catalog before checking whether
 *  somebody else has written a newer one. Short, because the read is a single
 *  indexed column on one row; long enough that a page with a dozen server
 *  components does one check, not a dozen. */
const CATALOG_FRESH_MS = 5_000;

/**
 * RE-READ THE CATALOG WHEN ANOTHER PROCESS HAS CHANGED IT.
 *
 * The first load was memoised forever, which meant a server only ever saw the
 * catalog as it stood the moment it booted. Anir granted Eeswar ownership of
 * Freya.Register at 10:12; his dev server had started at 09:58 and kept
 * serving the 09:58 snapshot, so the grant looked like it had not saved
 * (Jul 29: "I gave him owner status and it's gone... this is a problem if it
 * doesn't save"). It had saved — nothing was re-reading it.
 *
 * This is not a dev-only nicety: production runs behind a load balancer, so
 * the moment there is more than one task, Eeswar's upload on one container
 * would be invisible on the other until the next deploy.
 *
 * The check is a single `updated_at` read, rate-limited, and skipped entirely
 * while this process is mid-write so an in-flight change can never be
 * clobbered by a stale copy.
 */
async function refreshStaleCatalog(): Promise<void> {
  if (globalThis.__FREYR_OFFERINGS_WRITING__) return;
  const checked = globalThis.__FREYR_OFFERINGS_CHECKED__ ?? 0;
  if (Date.now() - checked < CATALOG_FRESH_MS) return;
  globalThis.__FREYR_OFFERINGS_CHECKED__ = Date.now();
  try {
    // The showroom is checked on the same tick as the real catalogue, so a
    // demo change made on one container shows up on the others too.
    void (async () => {
      const mockRow = await catalogClient()
        .from("offering_catalog_state")
        .select("catalog, updated_at")
        .eq("id", "mock")
        .maybeSingle();
      const mockRev = mockRow.data?.updated_at as string | undefined;
      if (
        mockRev &&
        mockRev !== globalThis.__FREYR_OFFERINGS_MOCK_REV__ &&
        !globalThis.__FREYR_OFFERINGS_WRITING__ &&
        isOfferingsStore(mockRow.data?.catalog)
      ) {
        replaceStore(mockStore, mockRow.data.catalog);
        healOfferings(mockStore);
        globalThis.__FREYR_OFFERINGS_MOCK_REV__ = mockRev;
      }
    })().catch(() => undefined);

    const { data } = await catalogClient()
      .from("offering_catalog_state")
      .select("updated_at")
      .eq("id", "default")
      .maybeSingle();
    const rev = data?.updated_at as string | undefined;
    if (!rev || rev === globalThis.__FREYR_OFFERINGS_REV__) return;

    const fresh = await catalogClient()
      .from("offering_catalog_state")
      .select("catalog, updated_at")
      .eq("id", "default")
      .maybeSingle();
    // A write may have started while we were fetching; abandon rather than
    // overwrite it with what we just read.
    if (globalThis.__FREYR_OFFERINGS_WRITING__) return;
    if (isOfferingsStore(fresh.data?.catalog)) {
      replaceStore(liveStore, fresh.data.catalog);
      const migratedCategories = healOfferings(liveStore);
      globalThis.__FREYR_OFFERINGS_REV__ = fresh.data.updated_at ?? rev;
      if (migratedCategories) await persistLiveOfferings();
    }
  } catch {
    // A blip in the freshness check must never take a page down: the cached
    // catalog is still perfectly serviceable.
  }
}

export async function commitOfferingsChange<T>(
  change: () => T | Promise<T>
): Promise<T> {
  const previous = globalThis.__FREYR_OFFERINGS_WRITE_QUEUE__ ?? Promise.resolve();
  let resolveQueue: () => void = () => undefined;
  globalThis.__FREYR_OFFERINGS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });
  await previous.catch(() => undefined);

  const target = activeStore();
  const before = structuredClone(target);
  // Hold off the freshness re-read for the duration of the write: reloading
  // the database copy mid-change would drop the change on the floor.
  globalThis.__FREYR_OFFERINGS_WRITING__ = true;
  try {
    const result = await change();
    await persistLiveOfferings();
    return result;
  } catch (error) {
    replaceStore(target, before);
    throw error;
  } finally {
    globalThis.__FREYR_OFFERINGS_WRITING__ = false;
    resolveQueue();
  }
}

function rid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export function listCustomerTypes(): CustomerType[] {
  return [...activeStore().customerTypes];
}
export function getCustomerType(id: string): CustomerType | null {
  return activeStore().customerTypes.find((c) => c.id === id) || null;
}
export function createCustomerType(data: Omit<CustomerType, "id">): CustomerType {
  // A family+size pair identifies a customer type, so don't create a second
  // "Pharmaceutical - Small" — refine the existing definition instead (blank
  // fields leave the current value intact). Mirrors createMarket's dedupe.
  const existing = activeStore().customerTypes.find(
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
  activeStore().customerTypes.push(record);
  return record;
}
export function updateCustomerType(
  id: string,
  data: Partial<CustomerType>
): CustomerType | null {
  const i = activeStore().customerTypes.findIndex((c) => c.id === id);
  if (i === -1) return null;
  activeStore().customerTypes[i] = { ...activeStore().customerTypes[i], ...data, id };
  return activeStore().customerTypes[i];
}

export function listMarkets(): Market[] {
  return [...activeStore().markets];
}
export function createMarket(name: string): Market {
  const existing = activeStore().markets.find(
    (m) => m.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) return existing;
  const record: Market = { id: rid("mkt"), name: name.trim() };
  activeStore().markets.push(record);
  return record;
}

/**
 * RENAME A MARKET IN PLACE (Saras, Aug 14, change log #37: the master lists
 * "currently not editable at any user level").
 *
 * Safe by construction: offerings reference markets through `market_ids`, so
 * the name is only ever a label. Nothing else has to be rewritten, and no
 * offering can be orphaned by a rename.
 *
 * Returns null when the id is unknown, and refuses a name already taken by a
 * DIFFERENT market so the list cannot end up with two identical entries that
 * createMarket's dedupe would never have allowed in the first place.
 */
export function updateMarket(id: string, name: string): Market | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const i = activeStore().markets.findIndex((m) => m.id === id);
  if (i === -1) return null;
  const clash = activeStore().markets.some(
    (m) => m.id !== id && m.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (clash) return null;
  activeStore().markets[i] = { ...activeStore().markets[i], name: trimmed };
  return activeStore().markets[i];
}

export function deleteMarket(id: string): boolean {
  const before = activeStore().markets.length;
  activeStore().markets = activeStore().markets.filter((m) => m.id !== id);
  if (activeStore().markets.length === before) return false;
  // Strip the removed market from every offering so nothing references a ghost id.
  for (const o of activeStore().offerings) {
    o.market_ids = o.market_ids.filter((mid) => mid !== id);
  }
  return true;
}

// ---- Offering types (managed master list) --------------------------------
export function listOfferingTypes(): OfferingType[] {
  return [...activeStore().offeringTypes];
}
export function getOfferingType(id: string): OfferingType | null {
  return activeStore().offeringTypes.find((t) => t.id === id) || null;
}
export function createOfferingType(data: {
  name: string;
  description?: string;
}): OfferingType {
  const name = String(data.name || "").trim();
  // Dedupe by name (like markets) — re-adding an existing type updates its
  // description instead of creating a duplicate.
  const existing = activeStore().offeringTypes.find(
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
  activeStore().offeringTypes.push(record);
  return record;
}
export function updateOfferingType(
  id: string,
  data: Partial<Omit<OfferingType, "id">>
): OfferingType | null {
  const i = activeStore().offeringTypes.findIndex((t) => t.id === id);
  if (i === -1) return null;
  activeStore().offeringTypes[i] = { ...activeStore().offeringTypes[i], ...data, id };
  return activeStore().offeringTypes[i];
}
export function deleteOfferingType(id: string): boolean {
  // Removes the definition from the master list. Offerings keep their
  // offering_type string — this just drops the managed entry/description.
  const before = activeStore().offeringTypes.length;
  activeStore().offeringTypes = activeStore().offeringTypes.filter((t) => t.id !== id);
  return activeStore().offeringTypes.length < before;
}
// Keep the master list complete when an offering introduces a brand-new type
// name via the entry form, so it shows up in the filter and the manager.
function ensureOfferingType(name: string) {
  const n = String(name || "").trim();
  if (!n) return;
  if (
    !activeStore().offeringTypes.some((t) => t.name.toLowerCase() === n.toLowerCase())
  ) {
    activeStore().offeringTypes.push({ id: rid("ot"), name: n, description: "" });
  }
}

// ---- Offering categories (managed master list) --------------------------
export function listOfferingCategories(): OfferingCategory[] {
  return [...activeStore().offeringCategories];
}
export function getOfferingCategory(id: string): OfferingCategory | null {
  return activeStore().offeringCategories.find((c) => c.id === id) || null;
}
export function createOfferingCategory(data: {
  name: string;
  description?: string;
  owner?: string;
  owner_user_id?: string | null;
}): OfferingCategory {
  const name = String(data.name || "").trim();
  // Dedupe by name (like offering types) — re-adding an existing category
  // refines it instead of creating a duplicate.
  const existing = activeStore().offeringCategories.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    if (data.description != null) existing.description = data.description.trim();
    if (data.owner != null) existing.owner = data.owner.trim();
    if (data.owner_user_id !== undefined)
      existing.owner_user_id = data.owner_user_id;
    return existing;
  }
  const record: OfferingCategory = {
    id: rid("oc"),
    name,
    description: (data.description || "").trim(),
    owner: (data.owner || "").trim(),
    owner_user_id: data.owner_user_id || null,
  };
  activeStore().offeringCategories.push(record);
  return record;
}
export function updateOfferingCategory(
  id: string,
  data: Partial<Omit<OfferingCategory, "id">>
): OfferingCategory | null {
  const i = activeStore().offeringCategories.findIndex((c) => c.id === id);
  if (i === -1) return null;
  activeStore().offeringCategories[i] = { ...activeStore().offeringCategories[i], ...data, id };
  return activeStore().offeringCategories[i];
}
export function deleteOfferingCategory(id: string): boolean {
  // Removes the definition from the master list. Offerings keep their
  // offering_category string — this just drops the managed entry.
  const before = activeStore().offeringCategories.length;
  activeStore().offeringCategories = activeStore().offeringCategories.filter((c) => c.id !== id);
  return activeStore().offeringCategories.length < before;
}
// Keep the master list complete when an offering introduces a brand-new
// category name (via the entry form or Excel import).
function ensureOfferingCategory(name: string) {
  const n = String(name || "").trim();
  if (!n) return;
  if (
    !activeStore().offeringCategories.some(
      (c) => c.name.toLowerCase() === n.toLowerCase()
    )
  ) {
    activeStore().offeringCategories.push({
      id: rid("oc"),
      name: n,
      description: "",
      owner: "",
    });
  }
}

export function listOfferings(): Offering[] {
  return activeStore().offerings.map(withVisibleMaterials);
}
export function getOffering(id: string): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  return found ? withVisibleMaterials(found) : null;
}
/** Write or upgrade a claim. Idempotent, and it never DOWNGRADES: re-requesting
 *  an offering you already own leaves you the owner. */
// ---------------------------------------------------------------------------
// Offering contacts
// ---------------------------------------------------------------------------

/** Turn the sheet's `poc` cell into real rows. The cell packs several people
 *  into one string ("Inayat / Tanudeep", "Ravi, Sara"), which is why rendering
 *  it as a single avatar used to merge two people into an invented person. */
export function contactsFromPoc(o: {
  id: string;
  poc?: string;
  offering_category?: string;
}): OfferingContact[] {
  return pocNames(o.poc || "").map((name, i) => ({
    id: `oc-${o.id}-${i}`,
    name,
    role: "Service delivery POC",
    email: "",
    phone: "",
  }));
}

/** `poc` stays the derived display string so every surface that already reads
 *  it (offering cards, the POC strip, the CSV export, search) keeps working
 *  without knowing contacts exist. One writer, no drift. */
function syncPoc(o: Offering) {
  o.poc = o.contacts.map((c) => c.name).join(" / ");
}

export function addOfferingContact(
  id: string,
  contact: { name: string; role?: string; email?: string; phone?: string }
): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  if (!found) return null;
  const name = contact.name.trim();
  if (!name) throw new Error("A contact needs a name");
  if (!found.contacts) found.contacts = contactsFromPoc(found);
  // Same person twice is a mistake, not an intent.
  if (found.contacts.some((c) => c.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`${name} is already a contact for this offering`);
  found.contacts = [
    ...found.contacts,
    {
      id: `oc-${id}-${Date.now().toString(36)}`,
      name,
      role: (contact.role || "").trim() || "Service delivery POC",
      email: (contact.email || "").trim(),
      phone: (contact.phone || "").trim(),
    },
  ];
  syncPoc(found);
  return found;
}

export function removeOfferingContact(id: string, contactId: string): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  if (!found) return null;
  if (!found.contacts) found.contacts = contactsFromPoc(found);
  found.contacts = found.contacts.filter((c) => c.id !== contactId);
  syncPoc(found);
  return found;
}

export function updateOfferingContact(
  id: string,
  contactId: string,
  patch: { name?: string; role?: string; email?: string; phone?: string }
): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  if (!found) return null;
  if (!found.contacts) found.contacts = contactsFromPoc(found);
  found.contacts = found.contacts.map((c) =>
    c.id === contactId
      ? {
          ...c,
          name: patch.name !== undefined ? patch.name.trim() || c.name : c.name,
          role: patch.role !== undefined ? patch.role.trim() : c.role,
          email: patch.email !== undefined ? patch.email.trim() : c.email,
          phone: patch.phone !== undefined ? patch.phone.trim() : c.phone,
        }
      : c
  );
  syncPoc(found);
  return found;
}

/** EVERYONE THE WORKSPACE KNOWS ABOUT, for the POC picker.
 *
 *  Built from what the catalogue actually holds rather than a demo roster:
 *  every contact on every offering, every named category owner, and every
 *  granted offering owner. In real mode that IS the Freyr side of the app, so
 *  the picker offers real colleagues and never invents a sales floor. */
export function listOfferingPeople(): {
  name: string;
  role?: string;
  email?: string;
}[] {
  const byName = new Map<string, { name: string; role?: string; email?: string }>();
  const put = (name: string, role?: string, email?: string) => {
    const clean = (name || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const prev = byName.get(key);
    // First writer wins on role, but a real email always beats a blank one.
    if (!prev) byName.set(key, { name: clean, role, email });
    else if (!prev.email && email) byName.set(key, { ...prev, email });
  };
  for (const o of activeStore().offerings) {
    for (const c of o.contacts || contactsFromPoc(o))
      put(c.name, c.role || "Service delivery POC", c.email || undefined);
    for (const owner of o.owners || [])
      if (owner.status === "owner")
        put(owner.name, "Offering owner", owner.email || undefined);
  }
  for (const c of activeStore().offeringCategories)
    if (c.owner) put(c.owner, `${c.name} owner`);
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Add or upgrade an admin-issued owner assignment. */
export function assignOfferingOwner(
  id: string,
  owner: {
    memberId: string;
    name: string;
    email: string | null;
    status: "requested" | "owner";
    granted_by: string;
  }
): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  if (!found) return null;
  if (!found.owners) found.owners = [];
  const existing = found.owners.find((o) => o.memberId === owner.memberId);
  if (existing) {
    if (existing.status === "owner" || owner.status === "requested") return found;
    // A pending request being approved.
    found.owners = found.owners.map((o) =>
      o.memberId === owner.memberId
        ? { ...o, status: "owner", granted_by: owner.granted_by, claimed_at: new Date().toISOString() }
        : o
    );
    return found;
  }
  found.owners = [
    ...found.owners,
    {
      memberId: owner.memberId,
      name: owner.name,
      email: owner.email,
      status: owner.status,
      claimed_at: new Date().toISOString(),
      granted_by: owner.granted_by,
    },
  ];
  return found;
}

/** Drop an owner assignment. Idempotent when the assignment is absent. */
export function releaseOffering(id: string, memberId: string): Offering | null {
  const found = activeStore().offerings.find((o) => o.id === id);
  if (!found) return null;
  found.owners = (found.owners || []).filter((o) => o.memberId !== memberId);
  return found;
}

/** Does this account own this offering? An exact id match on a row an ADMIN
 *  granted. A pending request is not ownership and confers nothing. */
export function isOfferingOwner(
  offering: Pick<Offering, "owners">,
  memberId: string | null | undefined
): boolean {
  if (!memberId) return false;
  return (offering.owners || []).some(
    (o) => o.memberId === memberId && o.status === "owner"
  );
}

/**
 * Offering briefs persist as a small, safe Markdown subset rather than HTML.
 * Normalising line endings keeps list edits stable across browsers; stripping
 * non-printing control characters prevents invisible payloads without touching
 * legacy prose, Unicode bullets, indentation, or Markdown formatting.
 */
export function normalizeOfferingDescription(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 100_000);
}

export function createOffering(data: Partial<Offering>): Offering {
  const record: Offering = {
    // An explicit id is honored so a seeded offering can be restored under its
    // original id (deep links and the persisted catalog reference it). Normal
    // creates omit it and get a fresh one.
    id: data.id?.trim() || rid("of"),
    offering_type: data.offering_type || "",
    offering_category: data.offering_category || "",
    offering_name: data.offering_name || "Untitled offering",
    contacts: data.contacts ?? [],
    offering_description: normalizeOfferingDescription(data.offering_description),
    service_card_styles: normalizeServiceCardStyles(data.service_card_styles),
    current_availability: data.current_availability || "",
    future_availability: data.future_availability || "",
    poc: data.poc || "",
    customer_type_ids: data.customer_type_ids || [],
    market_ids: data.market_ids || [],
    owners: data.owners ?? [],
    materials: (data.materials || []).map((m) => ({ ...m, id: m.id || rid("m") })),
    materialFolders: data.materialFolders || [],
    releases: data.releases || [],
    roadmap_details: data.roadmap_details,
    created_at: new Date().toISOString(),
  };
  ensureOfferingType(record.offering_type);
  ensureOfferingCategory(record.offering_category);
  activeStore().offerings.unshift(record);
  return record;
}
/**
 * RENAME A SALES-MATERIAL FOLDER, AND EVERYTHING FILED UNDER IT.
 *
 * Folders here are a PATH STRING on each material, not a record with an id
 * (see lib/offeringMaterials), so a rename is a rewrite of every stored path
 * that starts with the old one. Renaming "Roadmap" has to carry
 * "Roadmap/Technical" with it, or the children are orphaned into folders whose
 * parent no longer exists.
 *
 * THE 12 APPROVED FOLDERS ARE NOT RENAMEABLE HERE, and that is deliberate.
 * They come from Freyr Change Request Log item 20 and the picker offers them
 * from a fixed list, so renaming one would leave the old name still on offer
 * beside the new one, and `canonicalMaterialFolder` would keep presenting
 * stored rows under the approved name. That mismatch is exactly the
 * "who renamed Eswar's subfolders" confusion of Aug 12. Owner-created folders
 * have no such contract and rename cleanly.
 *
 * Returns the number of materials moved, or null when the rename is refused.
 */
export function renameMaterialFolder(
  offeringId: string,
  from: string,
  to: string
): { moved: number } | null {
  const offering = activeStore().offerings.find((o) => o.id === offeringId);
  if (!offering) return null;
  // Aliased as plain strings before the guard below. `isFixedMaterialFolder`
  // is declared `(value: unknown): value is string`, so its FALSE branch
  // narrows an already-string variable to `never` and every later use of it
  // stops compiling.
  const source: string = sanitizeMaterialFolderPath(from);
  const target: string = sanitizeMaterialFolderPath(to);
  if (!source || !target || source === target) return null;
  // The approved tree is fixed at both ends: you may not rename one of the
  // system folders, and you may not rename a folder INTO a system name and
  // thereby merge owner files into the approved tree by the back door.
  if (isFixedMaterialFolder(sanitizeMaterialFolderPath(from))) return null;
  if (isFixedMaterialFolder(sanitizeMaterialFolderPath(to))) return null;

  const rewrite = (path: string) => `${target}${path.slice(source.length)}`;

  // A rename that would land on a folder that already exists would silently
  // merge two folders. Refuse: merging is a different operation and nobody
  // asked for it.
  const existingPaths = new Set<string>([
    ...(offering.materialFolders || []).map((f) => sanitizeMaterialFolderPath(f)),
    ...offering.materials.map((m) => sanitizeMaterialFolderPath(m.folder || "")),
  ]);
  existingPaths.delete("");
  if (
    [...existingPaths].some(
      (path) => !isFolderUnder(path, source) && isFolderUnder(path, target)
    )
  )
    return null;

  let moved = 0;
  offering.materials = offering.materials.map((material) => {
    const current = sanitizeMaterialFolderPath(material.folder || "");
    if (!current || !isFolderUnder(current, source)) return material;
    moved += 1;
    return { ...material, folder: rewrite(current) };
  });
  offering.materialFolders = Array.from(
    new Set(
      (offering.materialFolders || []).map((folder) => {
        const current = sanitizeMaterialFolderPath(folder);
        return current && isFolderUnder(current, source)
          ? rewrite(current)
          : folder;
      })
    )
  );
  return { moved };
}

/** Is `path` the folder `root` itself, or nested inside it? */
function isFolderUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function updateOffering(
  id: string,
  data: Partial<Offering>,
  /**
   * Who is saving, from the session. Present only on the routes that know a
   * person; absent for imports and internal rewrites, which then leave the
   * roadmap history alone rather than crediting a version to nobody.
   */
  savedBy?: string
): Offering | null {
  const i = activeStore().offerings.findIndex((o) => o.id === id);
  if (i === -1) return null;
  const materials = data.materials
    ? data.materials.map((m) => ({ ...m, id: m.id || rid("m") }))
    : activeStore().offerings[i].materials;
  const normalizedData =
    {
      ...data,
      ...(data.offering_description === undefined
        ? {}
        : {
            offering_description: normalizeOfferingDescription(
              data.offering_description
            ),
          }),
      ...(data.service_card_styles === undefined
        ? {}
        : {
            service_card_styles: normalizeServiceCardStyles(
              data.service_card_styles
            ),
          }),
    };
  /**
   * VERSION THE ROADMAP BEFORE THE ROW MOVES ON.
   *
   * Computed here rather than in the route because this is the one place every
   * roadmap edit funnels through, and it holds both the row as it stands and
   * the patch about to land. A save that changes nothing on the roadmap mints
   * nothing, so re-saving an offering never inflates its history. The history
   * itself is never taken from the request body — a client cannot forge or
   * erase a version.
   */
  const priorRow = activeStore().offerings[i];
  const roadmapAfter = {
    releases: normalizedData.releases ?? priorRow.releases,
    roadmap_details:
      normalizedData.roadmap_details === undefined
        ? priorRow.roadmap_details
        : normalizedData.roadmap_details,
  };
  const minted = savedBy
    ? nextRoadmapVersions(priorRow, roadmapAfter, savedBy)
    : null;

  activeStore().offerings[i] = {
    ...priorRow,
    ...normalizedData,
    materials,
    ...(minted ? { roadmap_versions: minted } : {}),
    id,
  };
  if (data.offering_type) ensureOfferingType(activeStore().offerings[i].offering_type);
  if (data.offering_category)
    ensureOfferingCategory(activeStore().offerings[i].offering_category);
  return activeStore().offerings[i];
}

// ---------------------------------------------------------------------------
// FDL components — mutations run inside commitOfferingsChange like offerings.
// ---------------------------------------------------------------------------

function fdlList(): FdlComponent[] {
  const s = activeStore();
  if (!s.fdlComponents) s.fdlComponents = [];
  return s.fdlComponents;
}

export function listFdlComponents(): FdlComponent[] {
  return fdlList();
}

export function getFdlComponent(id: string): FdlComponent | null {
  return listFdlComponents().find((c) => c.id === id) ?? null;
}

export function createFdlComponent(data: {
  name: string;
  type: FdlComponentType;
}): FdlComponent {
  const component: FdlComponent = {
    id: `fdl-${Math.random().toString(36).slice(2, 9)}`,
    name: data.name,
    type: data.type,
    releases: [],
    features: [],
  };
  fdlList().unshift(component);
  return component;
}

export function updateFdlComponent(
  id: string,
  data: Partial<Omit<FdlComponent, "id">>,
  /** Who is saving, from the session. Absent for internal rewrites, which then
   *  leave the history alone rather than crediting a version to nobody. */
  savedBy?: string
): FdlComponent | null {
  const list = fdlList();
  const i = list.findIndex((c) => c.id === id);
  if (i === -1) return null;
  /* Versioned before the row moves on, from the one place every component
     edit funnels through. A save that leaves the releases alone mints
     nothing, so renaming a component never inflates its roadmap history. */
  const minted =
    savedBy && (data.releases || data.features)
      ? nextComponentVersions(
          list[i],
          { releases: data.releases, features: data.features },
          savedBy
        )
      : null;
  list[i] = { ...list[i], ...data, ...(minted ? { roadmap_versions: minted } : {}), id };
  return list[i];
}

export function deleteFdlComponent(id: string): boolean {
  const list = fdlList();
  const i = list.findIndex((c) => c.id === id);
  if (i === -1) return false;
  list.splice(i, 1);
  // A deleted component must not linger as a ghost connection on any package.
  for (const offering of activeStore().offerings) {
    if (offering.component_ids?.includes(id)) {
      offering.component_ids = offering.component_ids.filter((x) => x !== id);
    }
  }
  return true;
}

export function deleteOffering(id: string): boolean {
  const before = activeStore().offerings.length;
  activeStore().offerings = activeStore().offerings.filter((o) => o.id !== id);
  return activeStore().offerings.length < before;
}

// Helper: hydrate an offering with its customer-type + market objects.
export function hydrateOffering(o: Offering) {
  return {
    ...o,
    customerTypes: o.customer_type_ids
      .map((id) => getCustomerType(id))
      .filter((c): c is CustomerType => !!c),
    markets: o.market_ids
      .map((id) => activeStore().markets.find((m) => m.id === id))
      .filter((m): m is Market => !!m),
    // The matched master offering type (carries the description), looked up by
    // name since offerings store the type as a string.
    offeringType:
      activeStore().offeringTypes.find((t) => t.name === o.offering_type) || null,
    // The matched master offering category (carries the description + owner).
    offeringCategory:
      activeStore().offeringCategories.find((c) => c.name === o.offering_category) ||
      null,
  };
}
