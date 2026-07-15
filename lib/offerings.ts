// Offerings repository (requirement #1 from Suren's video review — see
// SUREN-VIDEO-REVIEW.md). A self-contained mock store (globalThis-backed, like
// lib/mock-db) so it survives dev HMR and doesn't touch the shared Db type.
// Holds Freyr's offerings, the customer-type definitions, and the markets, plus
// the sales-material artifacts attached to each offering.
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";
import { createClient } from "@supabase/supabase-js";
import type { OfferingMaterial } from "./offeringMaterials";
export { MATERIAL_META, type MaterialKind, type OfferingMaterial } from "./offeringMaterials";

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
}

export interface Offering {
  id: string;
  offering_type: string;
  offering_category: string; // the offering category name (Suren's Jun 27 video)
  offering_name: string;
  offering_description: string;
  current_availability: string;
  future_availability: string; // "Availability comments" in the UI
  poc: string; // SME / service-delivery POC who owns this offering's data
  customer_type_ids: string[]; // applicable customer types (one or more)
  market_ids: string[]; // applicable markets
  materials: OfferingMaterial[];
  created_at: string;
}

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
        "Freya Fusion is a platform comprising multiple modules, such as Freya.Register and Freya.Submit. These modules serve as the system of record and external data for Product Registration and Health Authority Submissions, providing the foundational data for each respective module.",
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
      id: "ot-fusion-platform",
      name: "Freya Fusion (Platform)",
      description:
        "The complete Freya Fusion platform delivered as one unified regulatory ecosystem — its full suite of modules together with platform-level AI agents (Freya.Agents) and cross-module objects (Freya.OmniObject) that operate across the entire environment.",
    },
    {
      id: "ot-freyr-ai-native",
      name: "Freyr AI Native Service",
      description:
        "Building on years of regulatory experience, Freyr has transitioned into a new era by integrating AI-driven digital capabilities with human expertise to deliver cost and efficiency.",
    },
    {
      id: "ot-freyr-services",
      name: "Freyr Service",
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
const CAT_LABELING = "Labeling and Artwork";
const CAT_PLATFORM = "Freya Fusion Platform and Agents";
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
  return {
    id,
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
    created_at: opts.created_at ?? "2026-06-20T12:00:00.000Z",
  };
}

// Seeded from Suren's "Digital Sales and Marketing.xlsx" → "Offerings" sheet:
// the offering names, the OFFERING CATEGORY (his Jun 27 sheet — confirmed from
// the recording: Register→Regulatory Information Management, Intelligence &
// GRR-PAC→Global Regulatory Intelligence, Label→Labeling and Artwork,
// Submit→Submissions and Document Operations; the rest assigned by domain), the
// customer-type applicability matrix (Label/Artwork Not Applicable to Small),
// and availability. Per Suren's Jun 27 video the medicinal-products listing is
// finalised and "everything is available", so the 12 Freya modules are all
// "Currently available". Offering descriptions stay blank — they come from the
// sales materials we write — and the offering TYPE / CATEGORY descriptions carry
// the framing meanwhile. Early adopters were removed at Suren's request ("I
// don't want that anymore — we'll come from the customer angle later"). Markets
// are sample values on the core modules. Service-delivery POCs carry over from
// Sara's MPR list.
const FREYR_URL = {
  resources: "https://www.freyrsolutions.com/resources",
  insights: "https://www.freyrsolutions.com/insights",
  contact: "https://www.freyrsolutions.com/contact-us",
};
const MODULE = "Freya Fusion (Module)";
const MODULE_AGENT = "Freya Fusion (Module + Module Agent/s)";
const MODULE_AGENT_ADDON = "Freya Fusion (Module + Module Agent/s + Add on Agent/s)";
const PLATFORM_TYPE = "Freya Fusion (Platform)";
const AI_NATIVE = "Freyr AI Native Service";
const SERVICE = "Freyr Service";

function seedOfferings(): Offering[] {
  // Seeded VERBATIM from Freyr's "Digital Sales and Marketing (Offerings)" master
  // sheet — the fully-populated version reconciled with 12 senior service-delivery
  // POCs. Every offering carries its real MPR service description, granular
  // customer-type applicability (per family × size), availability + comments, and
  // its accountable service-delivery POC. Markets default to all five (the sheet's
  // availability notes describe global / various-market coverage); materials are
  // added per offering in-app. Rows the sheet left blank stay blank.
  return [
    off("of-001", MODULE, "Freya.Register", "", {
      offering_category: CAT_RIM,
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      materials: [
        { id: "m-001", kind: "video", label: "Freya.Register overview", url: FREYR_URL.resources },
        { id: "m-002", kind: "reference", label: "Customer reference call", url: FREYR_URL.insights },
        { id: "m-003", kind: "case_study", label: "Cutting registration cycle time", url: FREYR_URL.insights },
      ],
    }),
    off("of-002", MODULE, "Freya.Intelligence", "", {
      offering_category: CAT_GRI,
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-003", MODULE, "Freya.GRR-PAC (Global Regulatory Requirements for Post Approval Changes)", "", {
      offering_category: CAT_GRI,
      current_availability: "Currently available",
      future_availability: "Version 1",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-004", MODULE, "Freya.Label", "", {
      offering_category: CAT_LABELING,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-005", MODULE, "Freya.Submit", "", {
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Currently available",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-006", MODULE, "Freya.Artwork", "", {
      offering_category: CAT_LABELING,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-007", MODULE, "Freya.RTQ", "", {
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
    off("of-009", MODULE, "Freya.Doc", "", {
      offering_category: CAT_SUBMISSIONS,
      current_availability: "Oct-26",
      customer_type_ids: NO_SMALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-010", MODULE_AGENT, "Freya.Register + Pia + Mia", "", {
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
    off("of-012", MODULE_AGENT_ADDON, "Freya.Register + Pia + Mia + Via", "", {
      offering_category: CAT_RIM,
      current_availability: "To be Decided",
      future_availability: "Pilot Available Now",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
      materials: [
        { id: "m-012a", kind: "video", label: "Via Agents demo", url: FREYR_URL.resources },
        { id: "m-012b", kind: "whitepaper", label: "Post-approval change automation", url: FREYR_URL.insights },
        { id: "m-012c", kind: "pricing", label: "Register stack pricing", url: FREYR_URL.contact },
        { id: "m-012d", kind: "competition", label: "Freya vs. legacy RIM vendors", url: FREYR_URL.insights },
      ],
    }),
    off("of-013", PLATFORM_TYPE, "Freya.Agents", "", {
      offering_category: CAT_PLATFORM,
      current_availability: "Currently available",
      customer_type_ids: [],
    }),
    off("of-014", PLATFORM_TYPE, "Freya.OmniObject", "", {
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
      poc: "Sathya K / Harshvardhan Gummadi",
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
    off("of-019", SERVICE, "Regulatory Affairs Strategy", "Strategic consulting services that help customers define the optimal regulatory pathway for products and portfolios while transforming regulatory organizations for future readiness. The offering spans product-level regulatory strategy, portfolio planning, regulatory intelligence, and health authority engagement, alongside regulatory operating model and process consulting to optimize people, processes, governance, and technology across the regulatory function.\n\nProduct & Portfolio Strategy\n  – Regulatory pathway selection\n  – Global development strategy\n  – Market prioritization\n  – Regulatory due diligence\n  – Regulatory gap assessments\n  – Health authority engagement strategy\n  – Scientific advice planning and support\n  – Portfolio optimization\n  – Regulatory intelligence & policy monitoring\n\nRegulatory Transformation & Process Consulting\n  – Process design and optimization\n  – Governance framework design\n  – Regulatory organization design\n  – Digital transformation and technology enablement\n  – Labeling operating model design\n  – Due diligence process design\n  – Change management and implementation support", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in major markets via in-house delivery team. Can be supported by Freyr-X for other regions.",
      poc: "Mukundh / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-020", SERVICE, "Regulatory Affairs - Initial Applications & Market Access", "End-to-end regulatory support for obtaining initial marketing authorizations and enabling successful product launches across global markets. The offering covers regulatory planning, dossier preparation, submission execution, health authority interactions, and local market entry support, ensuring efficient approvals and timely commercialization.\n\nInitial Registration & Submission Services\n  – Regulatory submission strategy\n  – Global submission planning and coordination\n  – Marketing Authorization Applications (MAA/NDA/BLA/ANDA)\n  – Initial registration submissions\n  – Dossier authoring and compilation\n  – eCTD publishing and validation\n  – Submission management\n  – Health authority submission support\n  – Agency meeting coordination\n\nMarket Entry & Affiliate Support\n  – Local affiliate coordination\n  – MAH and Local Legal Representative services\n  – Country-specific application support\n  – GMP certificate support\n  – Market entry regulatory support", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in major markets via in-house delivery team. Can be supported by Freyr-X for other regions.",
      poc: "Mukundh / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-021", SERVICE, "Local Regulatory Affairs", "Comprehensive country- and region-specific regulatory services that ensure products remain compliant with local regulatory requirements throughout their commercial lifecycle. The offering provides dedicated affiliate support for regulatory execution, health authority engagement, license maintenance, and market-specific compliance activities.\n\nServices include:\n  – Local regulatory submissions\n  – Health authority interactions\n  – Affiliate regulatory support\n  – Regulatory correspondence management\n  – Local dossier maintenance\n  – Country-specific regulatory execution\n  – Regulatory commitment tracking\n  – License maintenance\n  – MAH maintenance services\n  – Local Labeling services\n  – Artwork coordination\n  – Translation and localization support\n  – Legalization and notarization\n  – Local regulatory intelligence", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX",
      poc: "Mukundh / Suresh Modugu",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-022", SERVICE, "Post-Approval Regulatory Affairs", "End-to-end lifecycle management services that support regulatory compliance following product approval. The offering enables efficient management of post-approval changes through strategic planning, submission execution, publishing, and coordination across global and local markets while ensuring continued regulatory compliance.\n\nLifecycle Submission Management\n  – Global lifecycle management\n  – Variation management (IA/IB/II, CBE, PAS, etc.)\n  – Renewals\n  – Annual reports\n  – Change management\n  – CMC lifecycle management\n  – Line extensions\n  – Product transfers\n  – Marketing authorization transfers\n  – Withdrawal submissions\n\nRegulatory Operations & Compliance\n  – Health authority query responses\n  – Submission management\n  – eCTD publishing\n  – Regulatory publishing QC\n  – Regulatory data management\n  – RIMS support\n  – Commitment tracking\n  – Global coordination\n  – Regulatory metrics and reporting", {
      offering_category: CAT_RA,
      current_availability: "Currently available",
      future_availability: "Can be provided globally through Freyr central team (India, Poland, Colombia)",
      poc: "Mukundh",
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
      offering_category: "",
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · PV team focus is on small & mid-sized companies; Current PV team size can't support multiple large clients without leveraging FreyrX - MSD is their only large client",
      poc: "Gurpreet Kaur",
      customer_type_ids: NO_LARGE_CT,
      market_ids: ALL_MKT,
    }),
    off("of-025", SERVICE, "Medical Writing - Clinical", "• Regulatory Writing\n• Clinical Trial Consulting\n• Clinical Trial Audit & Monitoring\n• Quality Check & Medical Review of Regulatory Documents\n• Risk-Benefit Analysis\n• Clinical Data Transparency Initiative\n• Clinical Summaries & Overviews\n• Clinical Study Reports, IB, ICF, PLLR Support\n• Clinical Protocols, Design & Review\n• Scientific Advice & Briefing Packages\n• Clinical Investigation Plan (including PIP)", {
      offering_category: "",
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both",
      poc: "Seema Gurbani",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-026", SERVICE, "Medical Writing - Non Clinical & Toxicology", "• Regulatory Toxicology (1. ADE/PDE/Determination/ Report Services 2. F-Value Reports for Child Resistant Packaging (CRP) 3. Toxicological Risk Assessment (TRA) of impurities, Extractables & Leachables 4. Environmental Risk Assessment (ERA) of medicinal products)\n• Scientific and Regulatory Review of Non-clinical Documents\n• Development and Review of Study Plans/Protocols for Non-clinical Studies\n• Non-clinical Development Strategy for Regulatory Submissions\n• Consultation on Non-clinical Issues in the Submissions\n• Consultation and Responses to Regulatory Queries\n• GLP Audits of Test Facilities\n• CRO Identification and Qualification for Non-clinical Regulatory Studies", {
      offering_category: "",
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · SEND compilation & submission: No in-house capability currently",
      poc: "Jaiprakash Bhelonde",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-027", SERVICE, "Compliance, Audit and Validation", "• End-to-end Regulatory Compliance Services\n• SOP Authoring & Gap Analysis of process with alignment to regulatory requirements\n• GxP Audit Services\n• CSV & CSA Validation Service Offerings\n• Building QMS", {
      offering_category: "",
      current_availability: "Currently available",
      future_availability: "Available in various markets via in-house delivery team / FreyrX / both · CSV & CSA Validation Services: Provided through FreyrX in all markets",
      poc: "Anushta Chandrapalan",
      customer_type_ids: ALL_CT,
      market_ids: ALL_MKT,
    }),
    off("of-028", SERVICE, "Medical & Scientific Communication", "• Medical Copywriting Services\n• Medical & Scientific Writing Services\n• Medical & Scientific Publication Services\n• Creative Scientific Design Studio\n• Promotional Regulatory Affairs (MLR Review etc.)\n• Ad Promo HA Submission & Consultation Services\n• Medical & Scientific Content Management", {
      offering_category: "",
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
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_STORE__: OfferingsStore | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_LIVE_OFFERINGS_STORE__: OfferingsStore | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_INIT__: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_OFFERINGS_WRITE_QUEUE__: Promise<void> | undefined;
}

function seed(): OfferingsStore {
  return {
    customerTypes: seedCustomerTypes(),
    markets: seedMarkets(),
    offeringTypes: seedOfferingTypes(),
    offeringCategories: seedOfferingCategories(),
    offerings: seedOfferings(),
  };
}

const store: OfferingsStore = globalThis.__FREYR_OFFERINGS_STORE__ ?? seed();
if (!globalThis.__FREYR_OFFERINGS_STORE__) {
  globalThis.__FREYR_OFFERINGS_STORE__ = store;
}
// The catalog is approved Freyr master data, not demo CRM data. Keep a separate
// live copy so edits never leak between modes, but seed both modes from the
// master sheet. Live customers, contacts, sessions, and activity remain empty.
const liveStore: OfferingsStore = globalThis.__FREYR_LIVE_OFFERINGS_STORE__ ?? seed();
globalThis.__FREYR_LIVE_OFFERINGS_STORE__ = liveStore;
// Back-fill collections added in a later build onto a store that an earlier build
// already created (matters only for dev HMR; prod always starts fresh).
if (!store.offeringTypes) store.offeringTypes = seedOfferingTypes();
if (!store.offeringCategories)
  store.offeringCategories = seedOfferingCategories();

function activeStore(): OfferingsStore {
  return getDataMode() === "mock" ? store : liveStore;
}

function replaceStore(target: OfferingsStore, source: OfferingsStore) {
  target.customerTypes = structuredClone(source.customerTypes);
  target.markets = structuredClone(source.markets);
  target.offeringTypes = structuredClone(source.offeringTypes);
  target.offeringCategories = structuredClone(source.offeringCategories);
  target.offerings = structuredClone(source.offerings);
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

export async function persistLiveOfferings(): Promise<void> {
  if (getDataMode() !== "live") return;
  if (!hasSupabase()) {
    throw new Error("Live offering changes require the configured Supabase database.");
  }
  const { error } = await catalogClient().from("offering_catalog_state").upsert({
    id: "default",
    catalog: structuredClone(liveStore),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not persist the offering catalog: ${error.message}`);
}

export async function initializeLiveOfferings(): Promise<void> {
  if (getDataMode() !== "live" || !hasSupabase()) return;
  if (!globalThis.__FREYR_OFFERINGS_INIT__) {
    globalThis.__FREYR_OFFERINGS_INIT__ = (async () => {
      const { data, error } = await catalogClient()
        .from("offering_catalog_state")
        .select("catalog")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw new Error(`Could not load the offering catalog: ${error.message}`);
      if (isOfferingsStore(data?.catalog)) {
        replaceStore(liveStore, data.catalog);
        return;
      }
      await persistLiveOfferings();
    })();
  }
  await globalThis.__FREYR_OFFERINGS_INIT__;
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
  try {
    const result = await change();
    await persistLiveOfferings();
    return result;
  } catch (error) {
    replaceStore(target, before);
    throw error;
  } finally {
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
    return existing;
  }
  const record: OfferingCategory = {
    id: rid("oc"),
    name,
    description: (data.description || "").trim(),
    owner: (data.owner || "").trim(),
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
  return [...activeStore().offerings];
}
export function getOffering(id: string): Offering | null {
  return activeStore().offerings.find((o) => o.id === id) || null;
}
export function createOffering(data: Partial<Offering>): Offering {
  const record: Offering = {
    id: rid("of"),
    offering_type: data.offering_type || "",
    offering_category: data.offering_category || "",
    offering_name: data.offering_name || "Untitled offering",
    offering_description: data.offering_description || "",
    current_availability: data.current_availability || "",
    future_availability: data.future_availability || "",
    poc: data.poc || "",
    customer_type_ids: data.customer_type_ids || [],
    market_ids: data.market_ids || [],
    materials: (data.materials || []).map((m) => ({ ...m, id: m.id || rid("m") })),
    created_at: new Date().toISOString(),
  };
  ensureOfferingType(record.offering_type);
  ensureOfferingCategory(record.offering_category);
  activeStore().offerings.unshift(record);
  return record;
}
export function updateOffering(
  id: string,
  data: Partial<Offering>
): Offering | null {
  const i = activeStore().offerings.findIndex((o) => o.id === id);
  if (i === -1) return null;
  const materials = data.materials
    ? data.materials.map((m) => ({ ...m, id: m.id || rid("m") }))
    : activeStore().offerings[i].materials;
  activeStore().offerings[i] = { ...activeStore().offerings[i], ...data, materials, id };
  if (data.offering_type) ensureOfferingType(activeStore().offerings[i].offering_type);
  if (data.offering_category)
    ensureOfferingCategory(activeStore().offerings[i].offering_category);
  return activeStore().offerings[i];
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
