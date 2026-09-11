import {
  Award,
  BadgeDollarSign,
  BookOpenText,
  Building2,
  Calendar,
  Cpu,
  FileCheck2,
  Globe2,
  Handshake,
  Landmark,
  MapPinned,
  Package,
  Swords,
  Tag,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * THE SIGNALS, FROM SARAS'S WORD DOC (Sep 11, "Sales Intel App - Market Intel
 * Module"): ten for Customer Intel and nine for Competitor Intel, in her order.
 *
 * "The signal titles mentioned in the Word doc are to be displayed in the
 * app. The sub-points within each signal are just for your reference, not to
 * be displayed any where on the app." So `SIGNAL_META[id].label` is her title
 * and `SIGNAL_GUIDE` (her sub-points) is read by the classifier only.
 *
 * "All the live updates showing up within these modules should automatically
 * be tagged to at least one of the signals": an item carries one to three,
 * and "Others" when nothing else fits, never beside a real signal.
 *
 * This replaces the nine signals from the Sep 10 meeting. An item read under
 * that list keeps its answer, mapped onto these titles, until the relabel
 * hatch reads it again; nothing is re-bought on its own.
 */
export type SignalGroup = "customer" | "competitor";

export type SignalId =
  | "product_lcm"
  | "market_expansion"
  | "corporate_structure"
  | "ra_qa_team"
  | "technology"
  | "financial_operational"
  | "events"
  | "thought_leadership"
  | "competitor_mentions"
  | "product_service"
  | "pricing"
  | "clientele"
  | "geographic_segment"
  | "partnerships"
  | "industry_recognition"
  | "others";

export const CUSTOMER_SIGNALS: readonly SignalId[] = [
  "product_lcm",
  "market_expansion",
  "corporate_structure",
  "ra_qa_team",
  "technology",
  "financial_operational",
  "events",
  "thought_leadership",
  "competitor_mentions",
  "others",
];

export const COMPETITOR_SIGNALS: readonly SignalId[] = [
  "product_service",
  "pricing",
  "clientele",
  "corporate_structure",
  "geographic_segment",
  "partnerships",
  "industry_recognition",
  "thought_leadership",
  "others",
];

export function signalsFor(group: SignalGroup): readonly SignalId[] {
  return group === "competitor" ? COMPETITOR_SIGNALS : CUSTOMER_SIGNALS;
}

/** Her titles, word for word, with a colour and an icon for the chip. */
export const SIGNAL_META: Record<SignalId, { label: string; color: string; icon: LucideIcon }> = {
  product_lcm: { label: "New Product/ LCM", color: "var(--ink-bright-blue)", icon: FileCheck2 },
  market_expansion: { label: "Market Expansion", color: "var(--ink-teal-deep)", icon: Globe2 },
  corporate_structure: { label: "Corporate Structure Changes", color: "var(--ink-orange)", icon: Building2 },
  ra_qa_team: { label: "RA/QA Team Changes", color: "var(--ink-violet-soft)", icon: UserCog },
  technology: { label: "Technology Changes", color: "#0891B2", icon: Cpu },
  financial_operational: { label: "Financial/ Operational Updates", color: "#4F46E5", icon: Landmark },
  events: { label: "Events", color: "var(--ink-violet)", icon: Calendar },
  thought_leadership: { label: "Thought Leadership", color: "#0F6E56", icon: BookOpenText },
  competitor_mentions: { label: "Competitor Mentions", color: "var(--ink-magenta)", icon: Swords },
  product_service: { label: "Product/ Service Changes", color: "var(--ink-bright-blue)", icon: Package },
  pricing: { label: "Pricing Changes", color: "#4F46E5", icon: BadgeDollarSign },
  clientele: { label: "Clientele Changes", color: "var(--ink-violet-soft)", icon: Users },
  geographic_segment: { label: "Geographic/ Segment Expansion", color: "var(--ink-teal-deep)", icon: MapPinned },
  partnerships: { label: "Partnerships & Alliances", color: "var(--ink-magenta)", icon: Handshake },
  industry_recognition: { label: "Industry Recognition", color: "#B45309", icon: Award },
  others: { label: "Others", color: "#5B6B8C", icon: Tag },
};

export function isSignalId(value: unknown): value is SignalId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SIGNAL_META, value);
}

/** Her sub-points, for the classifier only. Never rendered. */
export const SIGNAL_GUIDE: Record<SignalGroup, Partial<Record<SignalId, string[]>>> = {
  customer: {
    product_lcm: [
      "new marketing authorisation or approval granted",
      "new submission or filing announced (NDA, BLA, MAA, 510(k), PMA, CE mark etc.)",
      "Phase III start or positive readout",
      "first-ever filing by a clinical-stage company",
      "new indication, line extension, or reformulation",
      "biosimilar or generic filing",
      "product discontinuation or withdrawal",
      "orphan drug, fast track, or breakthrough designation",
      "label or safety update announced",
      "large post-approval variation programmes",
    ],
    market_expansion: [
      "entry into a new country or region",
      "new subsidiary, office, or affiliate opening",
      "distribution or licensing partnership in a new market",
      "emerging-market push (LATAM, MENA, APAC, Africa)",
      "new manufacturing site or CMO change",
    ],
    corporate_structure: [
      "acquisition or merger",
      "product or portfolio in-licensing or asset purchase",
      "divestiture, spin-off, or carve-out",
      "joint venture formation",
      "IPO or large funding round for a clinical-stage biotech",
      "bankruptcy, restructuring, or major cost-cutting programme",
      "site closure or consolidation",
    ],
    ra_qa_team: [
      "new Head or VP of Regulatory Affairs, Quality, or Compliance",
      "departure of an existing regulatory affairs leader",
      "a regulatory, quality or compliance leader moving to a new company",
      "RA/QA hiring surge",
      "RA/QA layoffs or restructuring",
      "contractor or consultant hiring for regulatory roles",
    ],
    technology: [
      "public mention of digital transformation, ERP, or platform migration",
      "announced implementation of a Freyr competitor's system",
      "legacy system sunset or end-of-support announcement",
      "public commentary about manual processes, spreadsheets, or fragmented data",
      "RFP, RFI, or tender issued for RIMS, submissions, labelling, or regulatory intelligence",
    ],
    financial_operational: [
      "release of financial company reports and summaries",
      "R&D spend increase or pipeline expansion in earnings commentary",
      "guidance change or margin pressure",
      "manufacturing capacity expansion",
      "supply chain disruption affecting registered products",
    ],
    events: [
      "speaking or exhibiting at external DIA, RAPS, TOPRA, or similar events",
      "organizing events related to regulatory",
    ],
    thought_leadership: [
      "publishing articles, whitepapers or thought leadership content on regulatory",
      "executives publicly discussing regulatory burden or timelines online",
    ],
    competitor_mentions: [
      "announced partnership with a Freyr competitor",
      "featured in a Freyr competitor's case study or press release",
      "published online content related to regulatory mentioning Freyr competitors",
    ],
    others: ["any other online activity outside the signals above"],
  },
  competitor: {
    product_service: [
      "new product, service or module launch",
      "major release with new capabilities, especially AI features",
      "feature deprecation or product sunset",
      "platform re-architecture or next-generation announcements",
      "acquisition of a technology or point solution",
      "public roadmap commitments and whether they are met",
      "integration announcements (Veeva, SAP, Salesforce, authority portals)",
    ],
    pricing: [
      "licensing model change (perpetual to subscription, per-seat to per-module, usage-based)",
      "bundling or unbundling of modules",
      "free tier, trial, or freemium introduction",
      "public pricing page changes",
    ],
    clientele: [
      "only customers in medicinal products, medical devices or consumer products (MPR, MDV and CON)",
      "new customer logo announced",
      "published case study",
      "contract termination or public customer departure",
      "a customer publicly complaining or switching",
      "expansion within an existing account",
    ],
    corporate_structure: [
      "acquired by private equity",
      "acquiring other companies",
      "IPO or major funding round",
      "layoffs, especially in support, services, or implementation",
      "office closures or regional exits",
      "leadership turnover at CEO, CPO or CRO level",
      "financial distress, down round, or missed guidance",
    ],
    geographic_segment: [
      "entry into a market where Freyr is strong (India, MENA, LATAM, APAC)",
      "new office, subsidiary, or local partner",
      "localisation announcements (new languages, local regulatory coverage)",
      "new vertical entry (medical devices, cosmetics, food, veterinary)",
    ],
    partnerships: [
      "partnership with a consultancy, systems integrator, or Big Four firm",
      "technology alliances that close a known gap",
      "partnerships with regulatory authorities or industry bodies",
      "reseller or channel programme launches",
      "announcing the end of any partnerships or alliances",
    ],
    industry_recognition: [
      "Gartner Magic Quadrant, IDC MarketScape, Everest Group PEAK, ISG placement changes",
      "industry awards and recognitions",
      "analyst report mentions and how they are characterised",
      "movement up or down in any ranking",
    ],
    thought_leadership: ["publishing articles, whitepapers or thought leadership content on regulatory"],
    others: ["anything that fits none of the signals above"],
  },
};

/** The line a seller reads when the classifier did not write its own. */
const SIGNAL_WHY: Record<SignalGroup, Partial<Record<SignalId, string>>> = {
  customer: {
    product_lcm: "Approvals, filings and lifecycle changes bring submission, labelling and post-approval work. Ask who is handling it.",
    market_expansion: "New markets and sites mean new registrations and site variations, starting now.",
    corporate_structure: "Deals and restructures move marketing authorisations between companies, often on a deadline.",
    ra_qa_team: "A change in the RA/QA team resets priorities and vendors. Be in the conversation early.",
    technology: "A systems change reopens how their regulatory work gets done, and who helps them do it.",
    financial_operational: "Budgets, pipeline and capacity decide how much regulatory work they buy this year.",
    events: "Their people will be in a room Freyr can also be in. Plan the meeting before the event.",
    thought_leadership: "They are talking publicly about regulatory work. A natural opener for the next call.",
    competitor_mentions: "A Freyr competitor is already in the account. Know what they do and where the gaps are.",
  },
  competitor: {
    product_service: "A change in what they sell changes the demo Freyr has to beat and the gaps it can point to.",
    pricing: "A pricing change shifts how Freyr is compared on cost. Have the answer before the customer asks.",
    clientele: "A win or a loss for them names an account now in play, or a claim Freyr will hear.",
    corporate_structure: "Ownership, funding or leadership changes usually change their service and prices within a year.",
    geographic_segment: "They are moving into ground Freyr already covers. Look after those accounts now.",
    partnerships: "A new partner is a new route into accounts; an ended one leaves customers looking.",
    industry_recognition: "A ranking or award is a claim customers will repeat. Know how Freyr compares.",
    thought_leadership: "What they publish shows the positions customers will hear from them.",
  },
};

export function signalWhy(group: SignalGroup, id: SignalId): string {
  return SIGNAL_WHY[group][id] ?? "";
}

/** "Others" stands alone, never beside a real signal; at most three. */
export function tidySignals(ids: SignalId[]): SignalId[] {
  const real = [...new Set(ids)].filter((id) => id !== "others").slice(0, 3);
  return real.length > 0 ? real : ["others"];
}

/** Freyr's three divisions, as the classifier reads them off an item. */
export type ItemIndustry = "MPR" | "MDV" | "CON";

export function isItemIndustry(value: unknown): value is ItemIndustry {
  return value === "MPR" || value === "MDV" || value === "CON";
}

/**
 * WHAT THE CLASSIFIER WRITES ONTO AN ITEM, stored beside it so it is computed
 * once. `relevant` answers the competitor question (Saras, Sep 10: "only if
 * their posts are related to these industries should they show up here").
 *
 * `signals` is the Sep 11 answer. `signal` and `tags` are what the Sep 10
 * classifier wrote; `labelSignals` maps them onto Saras's titles.
 */
export type ItemLabel = {
  signals?: SignalId[];
  signal?: string;
  tags?: string[];
  relevant: boolean;
  industries: ItemIndustry[];
  /** One line a seller can use, only when the first signal is not "Others". */
  why?: string;
  v: number;
};

/** 3 (Sep 11): Saras's ten customer and nine competitor signals, several per item. */
export const CLASSIFY_VERSION = 3;
/** Labels this old still count as read, so the new list never re-buys every
 *  item by itself; the relabel hatch reads them again when asked. */
export const LABEL_READ_VERSION = 2;

/** Has this item been read by a classifier recent enough to keep? */
export function isLabeled(item: { label?: ItemLabel }): boolean {
  return !!item.label && item.label.v >= LABEL_READ_VERSION;
}

/** Was it read against Saras's Sep 11 signals? */
export function hasCurrentLabel(item: { label?: ItemLabel }): boolean {
  return !!item.label && item.label.v >= CLASSIFY_VERSION && (item.label.signals?.length ?? 0) > 0;
}

const LEGACY_SIGNALS: Record<SignalGroup, Record<string, SignalId>> = {
  customer: {
    product: "product_lcm",
    expansion: "market_expansion",
    mna: "corporate_structure",
    leadership: "ra_qa_team",
    restructuring: "ra_qa_team",
    commentary: "thought_leadership",
    events: "events",
    competitor: "competitor_mentions",
    other: "others",
  },
  competitor: {
    product: "product_service",
    expansion: "geographic_segment",
    mna: "corporate_structure",
    leadership: "corporate_structure",
    restructuring: "corporate_structure",
    commentary: "thought_leadership",
    events: "others",
    competitor: "partnerships",
    other: "others",
  },
};

const LEGACY_TAGS: Record<SignalGroup, Record<string, SignalId>> = {
  customer: { "thought-leadership": "thought_leadership" },
  competitor: { "thought-leadership": "thought_leadership", award: "industry_recognition" },
};

/** The signals a stored label stands for, in this group's list, never empty. */
export function labelSignals(label: ItemLabel, group: SignalGroup): SignalId[] {
  const allowed = new Set<SignalId>(signalsFor(group));
  const picked: SignalId[] = [];
  const add = (id: SignalId | undefined) => {
    if (id && allowed.has(id)) picked.push(id);
  };
  if (Array.isArray(label.signals)) {
    for (const id of label.signals) add(isSignalId(id) ? id : undefined);
  } else {
    add(LEGACY_SIGNALS[group][label.signal ?? ""]);
    for (const tag of label.tags ?? []) add(LEGACY_TAGS[group][tag]);
  }
  return tidySignals(picked);
}

/* Regulatory service and software firms a customer may be seen working with. */
const FREYR_COMPETITORS =
  /\b(veeva|iqvia|parexel|certara|intertek|emergo|accenture|cognizant|ennov|lorenz|extedo|arisglobal|calyx|rimsys|generis|opentext|tata consultancy)\b/i;

/**
 * THE FALLBACK ONLY: what an item carries before the classifier has read it,
 * or when the app has no Anthropic key. Every matching rule, most specific
 * first; "Others" when none match. Keywords are how a GSK post about
 * attending a congress once became a deal, which is why they are not the
 * main path.
 */
const FALLBACK_RULES: Record<SignalGroup, { id: SignalId; pattern: RegExp }[]> = {
  customer: [
    {
      id: "corporate_structure",
      pattern: /acquir|merger|divest|spin-?off|carve-?out|joint venture|takeover|\bipo\b|funding round|bankrupt|restructur|site closure|in-licens/i,
    },
    {
      id: "ra_qa_team",
      pattern: /\b(head|vp|vice president|director|chief)\b.{0,40}\b(regulatory|quality|compliance)\b|\b(regulatory|quality|compliance)\b.{0,30}\b(hiring|roles|team)\b|layoffs?|lay off|redundanc/i,
    },
    {
      id: "product_lcm",
      pattern: /\bfda\b|\bema\b|\bchmp\b|\bmhra\b|approv|clearance|submission|\bfiling\b|\bnda\b|\bbla\b|\bmaa\b|510\(k\)|\bpma\b|ce mark|marketing authori[sz]ation|label(ing|ling)? (change|update)|phase (iii|3)|orphan drug|fast track|breakthrough|biosimilar|new indication|discontinu|withdraw/i,
    },
    { id: "competitor_mentions", pattern: FREYR_COMPETITORS },
    {
      id: "technology",
      pattern: /digital transformation|\berp\b|platform migration|\brims\b|go-live|legacy system|\brfp\b|\brfi\b|\btender\b|spreadsheets?/i,
    },
    {
      id: "financial_operational",
      pattern: /earnings|quarterly results|financial results|annual report|\brevenue\b|guidance|r&d (spend|investment)|capacity expansion|supply chain/i,
    },
    {
      id: "market_expansion",
      pattern: /expan(d|ds|ding|sion) (into|to|in)\b|new (subsidiary|office|affiliate|market)|enters? .{0,20}market|launch(es|ed)? in [A-Z]|distribution (agreement|partnership)|new manufacturing (site|facility)|\bcmo\b/i,
    },
    {
      id: "events",
      pattern: /congress|conference|summit|webinar|symposium|\bexpo\b|booth|keynote|panel discussion|\bdia\b|\braps\b|topra/i,
    },
    {
      id: "thought_leadership",
      pattern: /white ?paper|our (view|perspective)|insights? (on|into)|thought leadership|podcast|regulatory (landscape|reform|policy|guidance|framework)/i,
    },
  ],
  competitor: [
    {
      id: "industry_recognition",
      pattern: /gartner|magic quadrant|marketscape|everest group|peak matrix|\bisg\b|award|recogni[sz]ed|ranked|named a leader/i,
    },
    {
      id: "corporate_structure",
      pattern: /acquir|merger|private equity|\bipo\b|funding round|layoffs?|restructur|office clos|appoint(s|ed)? .{0,30}\b(ceo|cpo|cro|chief)\b|steps down|down round/i,
    },
    {
      id: "pricing",
      pattern: /pricing|price (change|increase|cut)|subscription model|per-seat|per-module|bundl|free tier|freemium|free trial/i,
    },
    {
      id: "clientele",
      pattern: /case study|\bselects?\b|\bselected\b|\bchooses?\b|\bchose\b|customer win|new client|goes live with|switch(es|ed)? to|signs? .{0,20}(deal|contract)/i,
    },
    { id: "partnerships", pattern: /partner(s|ship)?\b|alliance|reseller|channel program/i },
    {
      id: "geographic_segment",
      pattern: /expan(d|ds|ding|sion) (into|to|in)\b|new (office|subsidiary)|locali[sz]ation|enters? .{0,20}market|medical devices?|cosmetics|veterinary/i,
    },
    {
      id: "product_service",
      pattern: /launch(es|ed)?|introduc(es|ing)|new (module|feature|release|version|product|capabilit)|release notes|roadmap|integration with|sunset|deprecat/i,
    },
    { id: "thought_leadership", pattern: /white ?paper|ebook|webinar|\breport\b|insights?|\bblog\b/i },
  ],
};

export function fallbackSignals(text: string, group: SignalGroup): SignalId[] {
  return tidySignals(FALLBACK_RULES[group].filter((rule) => rule.pattern.test(text)).map((rule) => rule.id));
}
