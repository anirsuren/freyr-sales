import {
  Bot,
  BookOpen,
  DollarSign,
  File,
  FileText,
  Handshake,
  Lightbulb,
  Lock,
  Presentation,
  Quote,
  Scale,
  Shapes,
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
  accessLevel?: AccessLevel;
  /**
   * WHAT THE DOCUMENT IS, from the system-defined list — Suren's governance ask.
   * Optional because every file uploaded before this existed has none, and
   * back-filling a guess would put a wrong label on a real document.
   */
  documentType?: DocumentType;
  /**
   * MAY THE ASSISTANT READ THIS FILE?
   *
   * Deliberately SEPARATE from accessLevel, because who may see a file and
   * whether the AI learns from it are two different decisions and an owner
   * needs both (Anir, Jul 29: "he can choose if the documents impact the AI or
   * not — some of the stuff he just wants for training for sales, he doesn't
   * want the AI to know that"). Collapsing them into one list could express
   * "AI only, hidden from sales" but not its mirror image: a deck the whole
   * sales team should read that must never inform an answer — pricing
   * scaffolding, a half-true draft, anything not yet cleared to be repeated.
   *
   * Absent means YES. Every file uploaded before this existed was already
   * being read, and silently un-teaching the assistant would change answers
   * nobody asked to change.
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
  return `${m.kind} ${(m.label || "").trim().toLowerCase()} ${url}`;
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
    if (material.journeyStage) next.journeyStage = material.journeyStage;
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
    const folder =
      typeof material.folder === "string" ? material.folder : prior?.folder;
    if (folder) next.folder = folder;
    const documentType = material.documentType ?? prior?.documentType;
    if (documentType) next.documentType = documentType;
    // A payload that CARRIES the switch wins (that is how the dialog turns it
    // off); one that omits it inherits what is on file, so saving a sibling
    // row can never quietly re-teach the assistant a file somebody excluded.
    const reads =
      typeof material.readByAgent === "boolean"
        ? material.readByAgent
        : prior?.readByAgent;
    if (typeof reads === "boolean") next.readByAgent = reads;
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
  presentation: { label: "Presentation", color: "#0071E3", icon: Presentation },
  document: { label: "Document", color: "#0071E3", icon: FileText },
  other: { label: "Others", color: "#0071E3", icon: Shapes },
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
  presentation: Presentation,
  document: FileText,
  other: Shapes,
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
  agent_only: { label: "Agent Training Only", short: "Agent only", color: "#6D28D9", icon: Bot }, // violet — never a status hue
};

/** Does the assistant learn from this file? Absent = yes (see readByAgent). */
export function isReadByAgent(m: { readByAgent?: boolean }): boolean {
  return m.readByAgent !== false;
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
export function asAccessLevel(v: unknown): AccessLevel | null {
  return v === "client_facing" || v === "internal_only" ? v : null;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/**
 * THE APPROVED, FIXED SALES-MATERIAL FOLDER TREE.
 *
 * Source: Freyr Change Request Log, item 20 (Jul 31). The sheet calls these
 * "12 folders" and nests five more choices under Product Demos and Sales
 * Decks. They are system-owned: an Offering Owner chooses from this list when
 * uploading, but cannot invent another folder name.
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

/** Every selectable path, including the two parent folders that have children. */
export const FIXED_MATERIAL_FOLDERS: string[] = MATERIAL_FOLDER_TREE.flatMap(
  (folder) => [
    folder.name,
    ...("children" in folder
      ? folder.children.map((child) => `${folder.name}/${child}`)
      : []),
  ]
);

const FIXED_MATERIAL_FOLDER_SET = new Set(FIXED_MATERIAL_FOLDERS);

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

/** A folder name typed by a person. Slashes are the path separator, so a name
 *  containing one would silently create a nested folder nobody asked for. */
export function cleanFolderName(raw: string): string {
  return raw.replace(/[/\\]/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Every folder that exists on an offering: the defaults, the ones an owner
 * created, and any implied by a file's own path (so a folder can never vanish
 * while it still holds something). Ancestors are included, because a file in
 * "Proposals/2026/EU" means "Proposals/2026" exists too.
 */
export function allFolders(
  materials: { folder?: string }[],
  stored: string[] = []
): string[] {
  const found = new Set<string>();
  const add = (path: string) => {
    const clean = normalizeFolderPath(path);
    if (!clean) return;
    const parts = clean.split("/");
    for (let i = 1; i <= parts.length; i++) found.add(parts.slice(0, i).join("/"));
  };
  for (const f of stored) add(f);
  for (const m of materials) if (m.folder) add(m.folder);
  const legacy = Array.from(found)
    .filter((folder) => !FIXED_MATERIAL_FOLDER_SET.has(folder))
    .sort((a, b) => a.localeCompare(b));
  return [...FIXED_MATERIAL_FOLDERS, ...legacy];
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
