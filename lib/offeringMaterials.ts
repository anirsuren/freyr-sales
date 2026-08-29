import {
  Bot,
  BookOpen,
  DollarSign,
  File,
  FileText,
  LayoutTemplate,
  Handshake,
  Lightbulb,
  Lock,
  Paperclip,
  Pill,
  Quote,
  Scale,
  ShoppingBag,
  Stethoscope,
  Swords,
  Table2,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * The FOUR file formats an Offering Owner may upload (backlog item 9, Saras /
 * Anant). The nine-type picker is gone: the file title the owner types already
 * says whether it's a one-pager or a case study, so the upload only has to say
 * what KIND OF FILE it is.
 */
export type MaterialFormat = "video" | "presentation" | "document" | "other";
/**
 * WHAT A DOCUMENT *IS* — system-defined, not typed in.
 *
 * Suren, Jul 30 (8:33–9:29): "finalise the folder types… and similarly document
 * type. If client testimonials is a folder type, under that every document he
 * added, we are expecting people to only put a client testimonial. The document
 * is a client testimonial document, introductory email document. The folder type
 * and the document types, you decide that… there are only other category in the
 * folder type and also another category in the document type — in that they want
 * to put any miscellaneous stuff, let them have it."
 *
 * Separate from FORMAT on purpose: format is video/presentation/document (how it
 * opens), this is what the thing IS (a proposal, a testimonial). Suren wanted
 * both because the second is what lets the assistant reason — "for AI it is
 * better if it really knows in the document itself: this is actually a proposal
 * document, it is a client testimonial document."
 *
 * This list is drawn from the types named in that meeting plus the files Eswar
 * has actually filed. It is DELIBERATELY easy to replace: when Wajeed sends the
 * approved list, swap the entries and nothing else changes. "other" must always
 * remain last — it is the miscellaneous bucket Suren explicitly asked for.
 */
export const DOCUMENT_TYPES = [
  "proposal",
  "client_testimonial",
  "case_study",
  "intro_email",
  "product_demo",
  "product_brief",
  "sales_deck",
  "thought_leadership",
  "battle_card",
  "training",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_META: Record<DocumentType, { label: string; color: string }> = {
  proposal: { label: "Proposal / RFP response", color: "#0071E3" },
  client_testimonial: { label: "Client testimonial", color: "#0F766E" },
  case_study: { label: "Success story / case study", color: "#7C3AED" },
  intro_email: { label: "Introductory email", color: "#C2410C" },
  product_demo: { label: "Product demo", color: "#DB2777" },
  product_brief: { label: "Product sheet / brief", color: "#4338CA" },
  sales_deck: { label: "Sales deck", color: "#0891B2" },
  thought_leadership: { label: "Thought leadership", color: "#65A30D" },
  battle_card: { label: "Battle card", color: "#B45309" },
  training: { label: "Training material", color: "#475569" },
  other: { label: "Something else", color: "#64748B" },
};

export const MATERIAL_FORMATS: MaterialFormat[] = [
  "video",
  "presentation",
  "document",
  "other",
];

/**
 * The seven finer-grained types materials were uploaded under BEFORE item 9.
 * They are still real data — seeded assets and every file uploaded to date
 * carry one — so the type survives here and is mapped onto a format for
 * display and filtering. Nothing is dropped and nothing is re-labelled as
 * something it isn't; new uploads simply can't choose one of these any more.
 */
export type LegacyMaterialKind =
  | "whitepaper" | "pricing" | "competition"
  | "case_study" | "reference" | "one_pager" | "datasheet";

export type MaterialKind = MaterialFormat | LegacyMaterialKind;

/**
 * What KIND of thing a file is, from its name alone. Pure, and deliberately
 * here rather than in the storage layer: the solutioning document rows are a
 * client component and need the same answer, and lib/materialStorage is
 * server-only.
 */
export function formatFromFilename(name: string): MaterialFormat {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "presentation";
  if (["doc", "docx", "pdf", "txt", "rtf", "md", "odt"].includes(ext))
    return "document";
  return "other";
}

// Where in the buyer's journey a material is meant to be used (CR-3).
export type JourneyStage = "awareness" | "evaluation" | "decision";
/**
 * Who a material may be shown to (CR-3).
 *  - client_facing — a rep may send it to a customer.
 *  - internal_only — battle cards and playbooks: Freyr eyes only, never sent.
 *  - agent_only    — NOT SHOWN TO SALES AT ALL. Eeswar's old customer-demo
 *                    transcripts and similar background material exist purely
 *                    to make the assistant smarter about the offering
 *                    (Wajeed, Jul 29: "three transcripts of old demos which no
 *                    salesperson will see... but he thinks those files will be
 *                    useful to train this chatbot"). Owners can see and manage
 *                    them; the materials list hides them from everyone else.
 */
export type AccessLevel = "client_facing" | "internal_only" | "agent_only";

/**
 * WHICH FREYR DIVISION A MATERIAL BELONGS TO (Suren, Aug 13, with Anir: "while
 * uploading a file, can you also add another tag, which is division, and it'll
 * have essentially three multi-select options: MPR, MDV and CON… make this
 * multi-select only, like buyer's journey, because it can be all three
 * combined").
 *
 * Multi-select for the same reason the journey stage is: one deck routinely
 * serves more than one division, and forcing a single choice would make the
 * tag a lie.
 */
export type Division = "MPR" | "MDV" | "CON";

export interface OfferingMaterial {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string;
  /**
   * The object key in Freya.Docs storage, when the owner uploaded a FILE
   * rather than pasting a link. The Docs API has no "list" endpoint, so this
   * row IS our index: without the path, an uploaded file cannot be found
   * again. Absent on link-only materials.
   */
  docsPath?: string;
  /**
   * One free-text sentence about the file (backlog item 10). OPTIONAL in the
   * strict sense: nothing validates it, nothing blocks a save without it, and
   * a material without one shows no line at all — never an empty row or a
   * placeholder standing in for a note nobody wrote.
   */
  description?: string;
  /**
   * WHICH FOLDER THIS FILE SITS IN, as a "/"-separated path — "Proposals" or
   * "Proposals/Q3 2026". Absent means the top level.
   *
   * Eswar is putting roughly sixty files on Freya.Register, which is a wall of
   * rows nobody can navigate (Saras, Jul 30: "to make this easy to navigate for
   * an end user, can you enable a folder structure within the Sales Materials
   * section"). A path string rather than a folder id: folders here are a way of
   * arranging files, not records with a life of their own, so renaming or
   * dropping one is a string operation and no file can ever point at a folder
   * that no longer exists.
   */
  folder?: string;
  // Optional so legacy/imported materials without tags keep working — the UI
  // renders nothing for a missing tag instead of a broken pill.
  journeyStage?: JourneyStage;
  /**
   * Current materials may support more than one buyer-journey stage. Keep the
   * singular field while legacy catalogues are still in circulation; readers
   * normalize both shapes through `materialJourneyStages` below.
   */
  journeyStages?: JourneyStage[];
  /** Which Freyr divisions this material is for. Optional: every file
   *  uploaded before divisions existed has none, and guessing one would put a
   *  wrong label on a real document. */
  divisions?: Division[];
  accessLevel?: AccessLevel;
  /**
   * WHAT THE DOCUMENT IS, from the system-defined list — Suren's governance ask.
   * Optional because every file uploaded before this existed has none, and
   * back-filling a guess would put a wrong label on a real document.
   */
  documentType?: DocumentType;
  /**
   * Legacy compatibility only. The current ingestion policy reads every
   * uploaded offering file, so both `false` and an absent value mean readable.
   * New writes omit this field; keeping it optional lets persisted pre-change
   * rows load without a destructive data migration.
   */
  readByAgent?: boolean;
  /**
   * Who uploaded this, and when (Suren, Jul 27: "I should say who added it,
   * with pfp"). BOTH ARE OPTIONAL AND STAY ABSENT unless a real person added
   * the material through the app: the seeded catalog assets have no uploader,
   * and inventing one — or crediting whoever happens to be signed in — would
   * put a false name against a file. Absent = the row shows no attribution.
   * Written server-side only (see `stampMaterialAttribution`).
   */
  addedBy?: string;
  /** ISO timestamp of the upload. Same honesty rule as `addedBy`. */
  addedAt?: string;
}

/** Identity of a material by what it IS, for payloads that carry no id. The
 *  scheme is stripped because the save path normalizes bare domains to https. */
function materialFingerprint(m: Pick<OfferingMaterial, "kind" | "label" | "url">): string {
  const url = (m.url || "").trim().toLowerCase().replace(/^https?:\/\//, "");
  return `${m.kind}\u0000${(m.label || "").trim().toLowerCase()}\u0000${url}`;
}

/**
 * Stamp uploader attribution onto an incoming materials array.
 *
 * Attribution is decided by the SERVER, never by the request body: a client
 * can put any name in `addedBy`, so incoming values are dropped on the floor.
 * A material the store already knows keeps exactly the attribution the store
 * holds (so re-saving a list can't re-credit a colleague's upload to you), and
 * only a genuinely new row is stamped. `uploader` of `null` — an unidentified
 * session, or a seeded/imported row — leaves the name absent rather than
 * fabricating one.
 */
export function stampMaterialAttribution(
  incoming: OfferingMaterial[],
  existing: OfferingMaterial[],
  uploader: string | null,
  at: string = new Date().toISOString()
): OfferingMaterial[] {
  const priorById = new Map(existing.map((m) => [m.id, m]));
  // The full edit form round-trips an offering's materials WITHOUT their ids
  // (and the store mints fresh ones on save), so identity also falls back to
  // the asset itself: same kind, same name, same link = the same material, and
  // it keeps the attribution already on file. Without this, pressing Save on
  // the edit screen would re-credit every material to whoever pressed it.
  const priorByAsset = new Map<string, OfferingMaterial[]>();
  for (const material of existing) {
    const key = materialFingerprint(material);
    const bucket = priorByAsset.get(key);
    if (bucket) bucket.push(material);
    else priorByAsset.set(key, [material]);
  }
  return incoming.map((material) => {
    // Rebuild each row from known fields only — nothing else in the payload
    // reaches the store.
    const next: OfferingMaterial = {
      id: material.id,
      kind: material.kind,
      label: material.label,
      url: material.url,
    };
    const journeyStages = materialJourneyStages(material);
    if (journeyStages.length) {
      next.journeyStages = journeyStages;
      next.journeyStage = journeyStages[0];
    }
    const divisions = materialDivisions(material);
    if (divisions.length) next.divisions = divisions;
    if (material.accessLevel) next.accessLevel = material.accessLevel;
    const prior =
      (material.id ? priorById.get(material.id) : undefined) ??
      priorByAsset.get(materialFingerprint(material))?.shift();
    // WHERE THE FILE ACTUALLY LIVES. The Docs API has no "list" endpoint, so
    // this path is the only handle on an uploaded file — drop it and the row
    // becomes a dead link and the assistant loses the document it read. The
    // client sends it once, on the upload that created the row; every later
    // save (renaming it, re-tagging it, adding a sibling) inherits it from the
    // store rather than depending on the caller to echo it back.
    const path = material.docsPath || prior?.docsPath;
    if (path) next.docsPath = path;
    // A payload that CARRIES the key wins, including an empty string — that is
    // how "move back to the top level" is expressed. One that omits it inherits
    // the stored folder, so saving a sibling row never reshuffles the tree.
    const folder = canonicalMaterialFolder({
      ...material,
      folder:
        typeof material.folder === "string" ? material.folder : prior?.folder,
    });
    if (folder) next.folder = folder;
    const documentType = material.documentType ?? prior?.documentType;
    if (documentType) next.documentType = documentType;
    // The assistant reads every uploaded offering file. Intentionally do not
    // preserve the retired opt-out flag: re-saving any legacy row migrates it
    // naturally, while isReadByAgent below makes old `false` rows readable
    // immediately, before they are ever edited.
    // The optional note (item 10). A payload that CARRIES the key wins —
    // including an empty one, which is how the edit form clears a note. A
    // payload that omits it entirely (a caller that predates the field, or the
    // add-popup re-sending its sibling rows) inherits what's on file, so
    // saving one material can never silently wipe another's description.
    const described =
      typeof material.description === "string"
        ? material.description.trim()
        : prior?.description?.trim() ?? "";
    if (described) next.description = described;
    const addedBy = prior ? prior.addedBy : uploader ?? undefined;
    const addedAt = prior ? prior.addedAt : at;
    if (addedBy) next.addedBy = addedBy;
    if (addedAt) next.addedAt = addedAt;
    return next;
  });
}

// The four upload formats, each with its own colour + icon (standing rule: a
// category is never flat gray text). These are the labels sellers see on a
// material row and in the File format filter.
export const MATERIAL_FORMAT_META: Record<
  MaterialFormat,
  { label: string; color: string; icon: LucideIcon }
> = {
  // ALL FOUR ARE BLUE (Anir, Jul 29: "all of the icons for the video, the
  // presentation, the document, etc. should just be blue, it'll look better").
  // The ICON already says which format it is, so colour was carrying no
  // information here — and four hues down one column fought with the journey
  // and access pills beside them, which DO use colour to mean something. One
  // family, four glyphs, calmer row.
  video: { label: "Video", color: "#0071E3", icon: Video },
  presentation: { label: "Presentation", color: "#0071E3", icon: LayoutTemplate },
  document: { label: "Document", color: "#0071E3", icon: FileText },
  other: { label: "Others", color: "#0071E3", icon: Paperclip },
};

/**
 * Which of the four formats a material belongs to. Written as a full Record so
 * the compiler refuses any future kind that isn't given a home — a material
 * can never fall out of the list because nobody mapped it.
 *
 * Everything written rolls up to Document; only a deck is a Presentation and
 * only a film is a Video. "Others" is reserved for what an owner explicitly
 * files there, so it never becomes a dumping ground for old data.
 */
const FORMAT_OF_KIND: Record<MaterialKind, MaterialFormat> = {
  video: "video",
  presentation: "presentation",
  document: "document",
  other: "other",
  whitepaper: "document",
  case_study: "document",
  one_pager: "document",
  datasheet: "document",
  pricing: "document",
  competition: "document",
  reference: "document",
};

export function materialFormat(kind: string | undefined): MaterialFormat {
  const k = asMaterialKind(kind);
  return k ? FORMAT_OF_KIND[k] : "other";
}

/**
 * THE ACTUAL FILE TYPE — "PDF", "MP4", "PPTX", "CSV" — as distinct from the
 * four broad formats above (Anir, Aug 7: "I want to see the CSV or I want to
 * see an MP4 video... I think that should be a filter too"). A rep hunting for
 * something they can drop into a deck cares that it is a PPTX, and "Presentation"
 * does not tell them that.
 *
 * Read from the stored object path first — an uploaded file always has one —
 * and from the link's own path second. Returns null when neither names an
 * extension: a SharePoint folder or a YouTube link genuinely has no file type,
 * and stamping a guessed one on a real row would be inventing data.
 *
 * The extension must start with a letter and be at least two characters, so a
 * version fragment like ".../specs/v1.2" is not read as a file type.
 */
const FILE_TYPE_PATTERN = /\.([a-z][a-z0-9]{1,5})$/i;

export function materialFileType(
  material: Pick<OfferingMaterial, "docsPath" | "url">
): string | null {
  for (const source of [material.docsPath, material.url]) {
    if (!source) continue;
    const raw = source.trim();
    if (!raw) continue;
    const candidates: string[] = [];
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        candidates.push(parsed.pathname);
        // Some hosts hand the real filename over in the query rather than the
        // path — ?file=Deck.pptx, ?download=demo.mp4 — so it is worth a look
        // before giving up on this row.
        for (const value of parsed.searchParams.values()) candidates.push(value);
      } catch {
        candidates.push(raw);
      }
    } else {
      candidates.push(raw);
    }
    for (const candidate of candidates) {
      const match = candidate.trim().match(FILE_TYPE_PATTERN);
      if (match) return match[1].toUpperCase();
    }
  }
  return null;
}

/**
 * WHAT TO PRINT IN THE FILE-TYPE SLOT, ALWAYS. Every row has to say something
 * here (Anir, Aug 8: "every single thing needs a file format... everything
 * needs to have a file format").
 *
 * When the source names a real extension, that is what it says. When it does
 * not, the row is a hosted LINK — a SharePoint page, a Stream recording — and
 * that is the true answer, not a guess. Stamping "MP4" on a video that is
 * actually a web page would put a wrong fact on a real record and send a rep
 * off to attach a file that does not exist.
 */
export function materialFileTypeLabel(
  material: Pick<OfferingMaterial, "docsPath" | "url">
): string {
  return materialFileType(material) ?? "LINK";
}

/**
 * WHERE A LINK ACTUALLY GOES, for the row's tooltip. Four of Freya.Register's
 * materials are SharePoint Stream and Minerva course pages Eswar pasted rather
 * than files he uploaded, so clicking them leaves the app — correctly, since
 * neither will render inside it (Anir, Aug 8: "why is it opening the second
 * one in a new tab?"). Naming the destination on the row is the difference
 * between that being obvious and it looking broken.
 */
export function materialLinkHost(
  material: Pick<OfferingMaterial, "docsPath" | "url">
): string | null {
  if (material.docsPath) return null;
  try {
    const url = new URL(material.url);
    // Outlook rewrites shared links through safelinks; the wrapper is not the
    // destination anyone cares about.
    const inner = url.searchParams.get("url");
    const real = inner ? new URL(inner) : url;
    return real.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The material's original, finer-grained type — but ONLY when it says more
 * than its format already does. A file uploaded as a plain Document returns
 * null (no point printing "Document · Document"); a case study uploaded under
 * the old picker returns "Case study", so the detail its owner recorded stays
 * on the row instead of being flattened away.
 */
export function legacyKindLabel(kind: string | undefined): string | null {
  const k = asMaterialKind(kind);
  if (!k || (MATERIAL_FORMATS as string[]).includes(k)) return null;
  return MATERIAL_META[k].label;
}

export const MATERIAL_META: Record<MaterialKind, { label: string; plural: string }> = {
  video: { label: "Video", plural: "Videos" },
  presentation: { label: "Presentation", plural: "Presentations" },
  document: { label: "Document", plural: "Documents" },
  other: { label: "Others", plural: "Others" },
  whitepaper: { label: "Whitepaper / thought leadership", plural: "Whitepapers & thought leadership" },
  pricing: { label: "Pricing", plural: "Pricing" },
  competition: { label: "Competition", plural: "Competition" },
  case_study: { label: "Case study", plural: "Case studies" },
  reference: { label: "Customer reference", plural: "Customer references" },
  one_pager: { label: "One-pager", plural: "One-pagers" },
  datasheet: { label: "Datasheet", plural: "Datasheets" },
};

// One glyph + colour per material kind, shared by every surface that lists
// materials (the offering page and the customer's Offerings tab). Lives here so
// the two can't drift — the customer tab had lost its icons entirely and was
// printing the kind as bare text (Anir, Jul 26: "I don't know what happened to
// the icons. You had icons before that had, like, if it was a video").
export const MATERIAL_ICON: Record<MaterialKind, LucideIcon> = {
  video: Video,
  presentation: LayoutTemplate,
  document: FileText,
  other: Paperclip,
  whitepaper: FileText,
  pricing: DollarSign,
  competition: Swords,
  case_study: BookOpen,
  reference: Quote,
  one_pager: File,
  datasheet: Table2,
};

// EVERY FILE FORMAT IS THE SAME BLUE. The glyph already distinguishes a deck
// from a video from a written doc, so hue was decoration — and it competed
// with the journey-stage and access-level pills on the same row, which use
// colour to carry actual meaning (Anir, Jul 29). The legacy nine kinds fold
// into the same blue for the same reason.
export const MATERIAL_COLOR: Record<MaterialKind, string> = {
  presentation: "#0071E3",
  video: "#0071E3",
  document: "#0071E3",
  other: "#0071E3",
  whitepaper: "#0071E3",
  case_study: "#0071E3",
  one_pager: "#0071E3",
  datasheet: "#0071E3",
  pricing: "#0071E3",
  competition: "#0071E3",
  reference: "#0071E3",
};

// Narrow an untrusted string (legacy/imported rows) to a MaterialKind.
export function asMaterialKind(v: string | undefined): MaterialKind | null {
  return v && v in MATERIAL_META ? (v as MaterialKind) : null;
}

// Every tag pill is colour + icon (standing rule: no plain gray chips). `label`
// is the full name for rows and dropdowns; `short` fits compact inline chips.
export const JOURNEY_STAGES: JourneyStage[] = ["awareness", "evaluation", "decision"];
export const JOURNEY_STAGE_META: Record<
  JourneyStage,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  awareness: { label: "Awareness Stage", short: "Awareness", color: "#0284C7", icon: Lightbulb }, // sky
  evaluation: { label: "Evaluation Stage", short: "Evaluation", color: "#7C3AED", icon: Scale }, // violet
  decision: { label: "Decision Stage", short: "Decision", color: "#059669", icon: Handshake }, // green
};

export const DIVISIONS: Division[] = ["MPR", "MDV", "CON"];

/** Colour + icon per division, so the chip is never a plain grey pill. The
 *  hues are identity, deliberately clear of red/green/amber. */
export const DIVISION_META: Record<
  Division,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  MPR: { label: "Medicinal Products", short: "MPR", color: "#0071E3", icon: Pill },
  MDV: { label: "Medical Devices", short: "MDV", color: "#0F766E", icon: Stethoscope },
  CON: { label: "Consumer", short: "CON", color: "#C2410C", icon: ShoppingBag },
};

/** Tolerant reader: unknown or malformed values are dropped rather than
 *  rendered as a broken chip. */
export function materialDivisions(m: { divisions?: Division[] }): Division[] {
  return (m.divisions ?? []).filter((d): d is Division => DIVISIONS.includes(d));
}

export const ACCESS_LEVELS: AccessLevel[] = [
  "client_facing",
  "internal_only",
  "agent_only",
];
export const ACCESS_LEVEL_META: Record<
  AccessLevel,
  { label: string; short: string; color: string; icon: LucideIcon }
> = {
  client_facing: { label: "Client Facing", short: "Client facing", color: "#0F766E", icon: Users }, // teal
  internal_only: { label: "Internal Only", short: "Internal only", color: "#C2410C", icon: Lock }, // burnt orange, #B45309 read as brown in the pill
  agent_only: { label: "Freyr AI Only", short: "AI only", color: "#6D28D9", icon: Bot }, // violet, never a status hue
};

/**
 * Plain-language copy for the upload/edit dropdown.
 *
 * Every uploaded file is part of Freyr AI's knowledge; this choice controls
 * HUMAN VISIBILITY ONLY. Keeping that distinction in one shared map prevents
 * the Add and Edit dialogs from drifting back into the misleading idea that
 * only one access level is read by the assistant.
 */
export const ACCESS_LEVEL_VISIBILITY_COPY: Record<
  AccessLevel,
  { label: string; description: string }
> = {
  client_facing: {
    label: "Client Facing",
    description: "Visible to permitted end users and usable by Freyr AI.",
  },
  internal_only: {
    label: "Internal Only",
    description: "Visible only to authenticated internal users and usable by Freyr AI.",
  },
  agent_only: {
    label: "Freyr AI Only",
    description: "Hidden from ordinary end users and used only as Freyr AI knowledge. Offering Owners and authorized admins may manage it.",
  },
};

/** Every uploaded offering file is part of the assistant's knowledge. */
export function isReadByAgent(m: { readByAgent?: boolean }): boolean {
  void m;
  return true;
}

/** Material the sales team is meant to see. Agent-training uploads are
 *  background knowledge, not collateral, so they never appear in a rep's
 *  list — only an owner managing the offering sees them. */
export function isSalesVisible(m: { accessLevel?: AccessLevel }): boolean {
  return m.accessLevel !== "agent_only";
}

// Safe narrowing for values that arrive as plain strings (serialized props,
// legacy runtime data) — unknown values render as untagged, never a broken pill.
export function asJourneyStage(v: unknown): JourneyStage | null {
  return v === "awareness" || v === "evaluation" || v === "decision" ? v : null;
}

/** Normalize the legacy single stage and the current multi-stage shape. */
export function materialJourneyStages(
  material: Pick<OfferingMaterial, "journeyStage" | "journeyStages">
): JourneyStage[] {
  const values = Array.isArray(material.journeyStages)
    ? material.journeyStages
    : material.journeyStage
      ? [material.journeyStage]
      : [];
  return Array.from(
    new Set(values.map(asJourneyStage).filter((value): value is JourneyStage => !!value))
  );
}
export function asAccessLevel(v: unknown): AccessLevel | null {
  return v === "client_facing" || v === "internal_only" || v === "agent_only"
    ? v
    : null;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/**
 * THE STANDARD SALES-MATERIAL FOLDER TREE.
 *
 * Source: Freyr Change Request Log, item 20 (Jul 31). The sheet calls these
 * "12 folders" and nests five more choices under Product Demos and Sales
 * Decks. The final Aug 4 workflow makes one of these system folders mandatory;
 * All files remains a view, never a folder.
 */
export const MATERIAL_FOLDER_TREE = [
  { name: "Product Sheet" },
  { name: "Product Brief" },
  {
    name: "Product Demos",
    children: ["Marketing Demos", "Internal Demos", "Recorded Client Demos"],
  },
  {
    name: "Sales Decks",
    // Eswar's original names, restored Aug 12 — see LEGACY_FOLDER_NAMES for
    // the map that had been silently renaming them to Internal/Client.
    children: ["Short Sales Deck", "Long Sales Deck"],
  },
  { name: "Battle Cards" },
  // The stored path cannot contain "/" because slash separates nested folders.
  // The picker/card label below still shows Freyr's exact approved wording.
  { name: "Success Stories and Case Studies" },
  { name: "Thought Leadership" },
  { name: "Proposals" },
  { name: "Sales Qualifying Questions" },
  { name: "Introductory Emails" },
  { name: "Client Testimonials" },
  { name: "Others" },
] as const;

/**
 * SERVICES GET A DIFFERENT SHELF (Anir, Aug 25): "there needs to be a different
 * folder structure for offerings that fall under either Freyr Services or
 * Freyr AI Native Services... about 15 offerings currently."
 *
 * Three differences from the standard twelve, in his words:
 *   - "we will remove this Product Sheet folder, this won't be there"
 *   - "you have to replace the Product Demos folder with a Videos folder"
 *   - "replace the name Product Brief with Service Brief"
 * Everything else "will remain as is."
 *
 * A service has no product sheet and no product demo; it has a brief and a
 * reel. The other ten folders are the same shelf either way, so a rep moving
 * between a module and a service is not learning a second filing system.
 */
export const SERVICE_OFFERING_TYPES = [
  "Freyr Services",
  "Freyr AI Native Services",
] as const;

export function isServiceOfferingType(type: string | null | undefined): boolean {
  const t = (type ?? "").trim().toLowerCase();
  return SERVICE_OFFERING_TYPES.some((s) => s.toLowerCase() === t);
}

export const SERVICE_MATERIAL_FOLDER_TREE = [
  { name: "Service Brief" },
  {
    name: "Videos",
    children: ["Marketing Demos", "Internal Demos", "Recorded Client Demos"],
  },
  ...MATERIAL_FOLDER_TREE.filter(
    (f) => !["Product Sheet", "Product Brief", "Product Demos"].includes(f.name)
  ),
] as const;

/** The tree this offering's type actually uses. */
export function materialFolderTreeFor(
  offeringType: string | null | undefined
): readonly { readonly name: string; readonly children?: readonly string[] }[] {
  return isServiceOfferingType(offeringType)
    ? (SERVICE_MATERIAL_FOLDER_TREE as never)
    : (MATERIAL_FOLDER_TREE as never);
}

const flatten = (
  tree: readonly { readonly name: string; readonly children?: readonly string[] }[]
): string[] =>
  tree.flatMap((folder) => [
    folder.name,
    ...(folder.children ? folder.children.map((c) => `${folder.name}/${c}`) : []),
  ]);

export function fixedMaterialFoldersFor(
  offeringType: string | null | undefined
): string[] {
  return flatten(materialFolderTreeFor(offeringType));
}

/** Every selectable path, including the two parent folders that have children. */
export const FIXED_MATERIAL_FOLDERS: string[] = MATERIAL_FOLDER_TREE.flatMap(
  (folder) => [
    folder.name,
    ...("children" in folder
      ? folder.children.map((child) => `${folder.name}/${child}`)
      : []),
  ]
);

/* Both shelves. A folder is "fixed" if EITHER tree names it: an offering can
   change type, and a file already filed under Product Demos must not become
   an orphan the moment it does. */
const FIXED_MATERIAL_FOLDER_SET = new Set([
  ...FIXED_MATERIAL_FOLDERS,
  ...flatten(SERVICE_MATERIAL_FOLDER_TREE as never),
]);

export function isFixedMaterialFolder(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FIXED_MATERIAL_FOLDER_SET.has(normalizeFolderPath(value))
  );
}

/** Labels in pickers keep the hierarchy visible without relying on indentation. */
export function materialFolderLabel(path: string): string {
  const [parent, child] = path.split("/");
  const display = (name: string) =>
    name === "Success Stories and Case Studies"
      ? "Success Stories / Case Studies"
      : name;
  return child ? `${display(parent)} · ${display(child)}` : display(parent);
}

/** Trim, drop empty segments, cap depth. "  a / /b  " -> "a/b". */
export function normalizeFolderPath(raw: string, maxDepth = 5): string {
  return raw
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, maxDepth)
    .join("/");
}

const LEGACY_FOLDER_NAMES: Record<string, string> = {
  "Success Stories Case Studies": "Success Stories and Case Studies",
  "Success Stories / Case Studies": "Success Stories and Case Studies",
  "Success Stories/Case Studies": "Success Stories and Case Studies",
  "Introductory Emails (Templates)": "Introductory Emails",
  // REVERSED on Aug 12. The old direction (Short→Client, Long→Internal) is
  // what "mysteriously" renamed Eswar's subfolders — Saras asked who changed
  // them on the call, and the answer was this map, not a person. Short and
  // Long are the approved names; any stored Client/Internal rows normalize
  // back on their next save.
  "Sales Decks/Client Sales Decks": "Sales Decks/Short Sales Deck",
  "Sales Decks/Internal Sales Decks": "Sales Decks/Long Sales Deck",
};

/**
 * Present old catalogue rows through the approved fixed folder tree.
 *
 * This is intentionally a view-time normalizer: it cleans the interface now
 * without rewriting the singleton production catalogue. The next legitimate
 * owner edit naturally persists the canonical value through the existing save
 * path.
 */
export function canonicalMaterialFolder(
  material: Pick<OfferingMaterial, "folder" | "label" | "documentType" | "kind">
): string {
  const rawFolder = (material.folder || "").trim();
  const legacy = LEGACY_FOLDER_NAMES[rawFolder];
  if (legacy) return legacy;
  const normalized = normalizeFolderPath(rawFolder);
  if (FIXED_MATERIAL_FOLDER_SET.has(normalized)) return normalized;

  // Owner-created folders are first-class folders too. Keep their path rather
  // than collapsing them into "Others"; the API has already cleaned the path
  // before it reaches the catalogue.
  if (sanitizeMaterialFolderPath(normalized)) return normalized;

  // Legacy catalogues contain blank, custom, and partially broken folder
  // metadata. Normalize those records only for presentation/save-on-next-edit;
  // never run a bulk destructive rewrite against the production singleton.
  const label = `${material.label || ""} ${normalized}`.toLowerCase();
  const documentType = material.documentType;
  if (/marketing\s+demo/.test(label)) return "Product Demos/Marketing Demos";
  if (/internal\s+demo/.test(label)) return "Product Demos/Internal Demos";
  if (/(recorded|client|customer).*demo|demo.*(recorded|client|customer)/.test(label))
    return "Product Demos/Recorded Client Demos";
  if (/\bdemo\b/.test(label) || documentType === "product_demo") return "Product Demos";
  if (/short.*(sales\s*)?deck|(sales\s*)?deck.*short|2\s*slider/.test(label))
    return "Sales Decks/Short Sales Deck";
  if (/long.*(sales\s*)?deck|(sales\s*)?deck.*long|master\s*deck/.test(label))
    return "Sales Decks/Long Sales Deck";
  if (/\b(deck|presentation|pitch)\b/.test(label) || documentType === "sales_deck")
    return "Sales Decks";
  if (/battle|competit/.test(label) || documentType === "battle_card" || material.kind === "competition")
    return "Battle Cards";
  if (/case\s*stud|success\s*stor|win\s*stor/.test(label) || documentType === "case_study" || material.kind === "case_study")
    return "Success Stories and Case Studies";
  if (/thought|white\s*paper|whitepaper|\bblog\b|insight/.test(label) || documentType === "thought_leadership" || material.kind === "whitepaper")
    return "Thought Leadership";
  if (/proposal|\brfp\b|galderma/.test(label) || documentType === "proposal") return "Proposals";
  if (/qualif|discovery\s+question/.test(label)) return "Sales Qualifying Questions";
  if (/introduct|email\s+template/.test(label) || documentType === "intro_email") return "Introductory Emails";
  if (/testimonial|customer\s+reference|client\s+reference/.test(label) || documentType === "client_testimonial" || material.kind === "reference")
    return "Client Testimonials";
  if (/product\s*(sheet|one.?pager)|data\s*sheet|datasheet/.test(label) || material.kind === "one_pager" || material.kind === "datasheet")
    return "Product Sheet";
  if (/product\s*brief|overview/.test(label) || documentType === "product_brief") return "Product Brief";
  return "Others";
}

/** A folder name typed by a person. Slashes are the path separator, so a name
 *  containing one would silently create a nested folder nobody asked for. */
export function cleanFolderName(raw: string): string {
  return raw.replace(/[/\\]/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);
}

/** Accept a safe folder path at a write boundary. The predefined folders are
 * always valid; owners may also create paths whose segments are short plain
 * names. Slash remains the hierarchy separator. */
export function sanitizeMaterialFolderPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized =
    LEGACY_FOLDER_NAMES[value.trim()] || normalizeFolderPath(value, 20);
  if (!normalized) return "";
  const parts = normalized.split("/");
  if (
    parts.length > 20 ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        cleanFolderName(part) !== part
    )
  )
    return "";
  return normalized;
}

export interface MaterialFolderUploadEntry {
  /** Stable file key, including relative path so duplicate filenames survive. */
  key: string;
  /** Browser-supplied path such as "Roadmap/Technical/Details.pdf". */
  relativePath: string;
}

export interface MaterialFolderUploadPlan {
  folders: string[];
  commonRoot: string;
  folderByKey: Record<string, string>;
}

/**
 * Convert a native directory pick into the exact catalogue folder tree.
 *
 * Ordinary multi-file picks carry no relative path and therefore create no
 * folders. Directory picks include the selected root and every subfolder. All
 * ancestors are returned explicitly so an empty parent still survives after a
 * later move, and assignment is keyed by relative-path-aware file identity so
 * two different folders may safely contain the same filename.
 */
export function buildMaterialFolderUploadPlan(
  entries: MaterialFolderUploadEntry[]
): MaterialFolderUploadPlan {
  const folders = new Set<string>();
  const folderByKey: Record<string, string> = {};
  const roots = new Set<string>();

  for (const entry of entries) {
    if (!entry.relativePath.trim()) continue;
    const parts = entry.relativePath
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) continue;
    const folder = sanitizeMaterialFolderPath(parts.slice(0, -1).join("/"));
    if (!folder) continue;
    folderByKey[entry.key] = folder;
    const folderParts = folder.split("/");
    roots.add(folderParts[0]);
    for (let depth = 1; depth <= folderParts.length; depth += 1) {
      folders.add(folderParts.slice(0, depth).join("/"));
    }
  }

  return {
    folders: Array.from(folders),
    commonRoot: roots.size === 1 ? Array.from(roots)[0] : "",
    folderByKey,
  };
}

/**
 * Every folder that exists on an offering: the defaults, the ones an owner
 * created, and any implied by a file's own path (so a folder can never vanish
 * while it still holds something). Ancestors are included, because a file in
 * "Proposals/2026/EU" means "Proposals/2026" exists too.
 */
export function allFolders(
  materials: { folder?: string }[],
  stored: string[] = [],
  /** The offering's type, so a service gets the service shelf. Omitted =
   *  the standard twelve, which is what every non-service offering uses. */
  offeringType?: string | null
): string[] {
  const paths = new Set<string>(fixedMaterialFoldersFor(offeringType));
  const addWithAncestors = (value: unknown) => {
    const path = sanitizeMaterialFolderPath(value);
    if (!path) return;
    const parts = path.split("/");
    for (let depth = 1; depth <= parts.length; depth += 1)
      paths.add(parts.slice(0, depth).join("/"));
  };
  stored.forEach(addWithAncestors);
  materials.forEach((material) => addWithAncestors(material.folder));
  return Array.from(paths);
}

/** The immediate children of `parent` ("" = top level). */
export function childFolders(folders: string[], parent: string): string[] {
  const prefix = parent ? `${parent}/` : "";
  const depth = parent ? parent.split("/").length : 0;
  return folders.filter(
    (f) => f.startsWith(prefix) && f.split("/").length === depth + 1
  );
}

/** Files sitting directly in `folder` ("" = top level). */
export function materialsInFolder<T extends { folder?: string }>(
  materials: T[],
  folder: string
): T[] {
  return materials.filter((m) => (m.folder || "") === folder);
}

/** How many files live in this folder and everything beneath it — the count a
 *  folder row shows, because a folder whose files are all in sub-folders would
 *  otherwise read as empty. */
export function countUnder(
  materials: { folder?: string }[],
  folder: string
): number {
  const prefix = `${folder}/`;
  return materials.filter(
    (m) => (m.folder || "") === folder || (m.folder || "").startsWith(prefix)
  ).length;
}
