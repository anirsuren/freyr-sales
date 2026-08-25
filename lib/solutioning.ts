import { getDataMode } from "./dataMode";

/**
 * SOLUTIONING — presentations, submissions and meetings, requested by sales
 * and fulfilled by the Solutions team (Suren, Aug 24, from his walkthrough).
 *
 * The shape, in his words:
 *
 *   "A sales guy has a customer, an opportunity, a lead. He creates a request:
 *   I need a presentation, I need to do a submission, I need a meeting. The
 *   solution owner picks up the request. Under the request there are customer
 *   documents, work-in-progress documents, final deliverables, and analysis.
 *   Every document is document 1 version 1, then version 2. Request initiated,
 *   work in progress, completed — that's all, three statuses. A presentation
 *   can be against multiple opportunities; a submission against multiple
 *   leads. From the customer side I can look at it, from the people side I can
 *   look at it."
 *
 * His follow-ups, verbatim, that decide the rules encoded here:
 *   - "It is a new role" — the Solutions role (see lib/moduleAccess).
 *   - "The sales person says it is completed" — the REQUESTER closes a
 *     request, not the person who fulfilled it.
 *   - "Leads new list is not required" — targets are the contacts already on
 *     the customer, plus opportunities. No new leads object.
 *   - "As part of a meeting a person can refer to a document that was created
 *     as part of a presentation request" — documents can be REFERENCES to a
 *     document living on another request.
 *   - "Auto linking with performance goals, we will pick it later" — nothing
 *     here writes to the performance store.
 *
 * Storage: one row in offering_catalog_state (id text pk + jsonb), keyed
 * "solutioning" — the performance-management pattern exactly. Mock and Real
 * are separate rows; mock serves the sample set below and never accepts
 * writes, so a demo click can never reach the live plan.
 */

const ROW_ID = "solutioning";

export type SolutioningKind = "submission" | "presentation" | "meeting";

/**
 * THREE SUBMISSION TYPES, AND ONLY THREE (Suren, Aug 25, narrowing what he
 * said on Aug 24): "one is an RFI submission, one is an RFP submission, one is
 * a regular proposal — these are only three submission types I'm looking at.
 * If somebody wants a rate card it will be some proposal, because it is not a
 * document type. What I'm going to track is: how many RFIs, how many RFPs, how
 * many proposals. That's all — I don't want to go into rate cards, this and
 * that."
 *
 * "Other" was the escape hatch on the first cut. It is gone from the picker
 * because a fourth bucket is exactly how "how many RFPs" stops being
 * answerable. Anything already stored as Other still displays; nothing is
 * rewritten and nothing new can be created that way.
 */
export const SUBMISSION_TYPES = ["RFI", "RFP", "Proposal"] as const;

export type RequestStatus = "initiated" | "in_progress" | "completed";

/** The four tabs, exactly as he named them. */
export type DocCategory = "customer" | "working" | "final" | "analysis";

export const DOC_CATEGORIES: DocCategory[] = [
  "customer",
  "working",
  "final",
  "analysis",
];

export type SolutionDoc = {
  id: string;
  category: DocCategory;
  name: string;
  /** "Document 1 version 1... add the same document and version 2." Version is
   *  per (category, name) family, assigned at add time and never rewritten. */
  version: number;
  /** Where the file lives — a link for now. Uploads ride the same field when
   *  they land, as a docs-storage URL. */
  url?: string;
  /** The person working this document ("a person can say that I am working on
   *  it"). This is what puts somebody "on the submission side" of the people
   *  rollup. */
  assignedTo?: string;
  addedBy: string;
  addedAt: string;
  /**
   * A REFERENCE, NOT A COPY (Suren: a meeting "can refer to a document that
   * was created as part of a presentation request"). A doc carrying `ref`
   * points at a document on another request; it contributes to THIS request's
   * tabs but the file itself has one home. Reference docs never mint versions
   * in this request's families.
   */
  ref?: { requestId: string; docId: string };
  note?: string;
};

export type RequestActivity = {
  at: string;
  by: string;
  what: string;
};

export type SolutionRequest = {
  id: string;
  /** The human reference he asked for ("a submission id is created"):
   *  SUB-0001 / PRE-0001 / MTG-0001, per kind, never reused. */
  ref: string;
  kind: SolutioningKind;
  /** RFP / RFI / Proposal for submissions; free text ("RFP defense") for
   *  presentations. Meetings carry none. */
  subtype?: string;
  title: string;
  details?: string;
  customerId?: string;
  /** Denormalised so a renamed or deleted account can never blank the row. */
  customer: string;
  /** One or MORE of each — his exact multiplicity. */
  opportunityIds: string[];
  opportunityLabels: string[];
  contactIds: string[];
  contactNames: string[];
  status: RequestStatus;
  requestedBy: string;
  requestedAt: string;
  /** Optional deadline. Open question with Suren; the field is harmless and
   *  the list can order by it when present. */
  neededBy?: string;
  /** The solution person who picked it up. */
  owner?: string;
  pickedUpAt?: string;
  completedBy?: string;
  completedAt?: string;
  /** Meeting facts. Only meaningful when kind === "meeting". */
  meetingAt?: string;
  attendees?: string[];
  docs: SolutionDoc[];
  activity: RequestActivity[];
};

export type SolutioningState = {
  requests: SolutionRequest[];
};

export const EMPTY_SOLUTIONING: SolutioningState = { requests: [] };

/* ------------------------------------------------------------------ store */

function activeRowId(): string {
  try {
    return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
  } catch {
    return ROW_ID;
  }
}

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  // Lazy require so the SDK never rides into a client bundle via this module.
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, max: number, cap = 40): string[] {
  return Array.isArray(v)
    ? v
        .map((x) => str(String(x ?? ""), max))
        .filter(Boolean)
        .slice(0, cap)
    : [];
}

function kind(v: unknown): SolutioningKind | null {
  return v === "submission" || v === "presentation" || v === "meeting"
    ? v
    : null;
}

function status(v: unknown): RequestStatus {
  return v === "in_progress" || v === "completed" ? v : "initiated";
}

function category(v: unknown): DocCategory | null {
  return v === "customer" || v === "working" || v === "final" || v === "analysis"
    ? v
    : null;
}

/** Every field named here, or deleted by the next write — the same normalizer
 *  law every store in this app lives by. */
function normalizeDoc(v: unknown): SolutionDoc | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<SolutionDoc>;
  const id = str(r.id, 60);
  const cat = category(r.category);
  const name = str(r.name, 160);
  if (!id || !cat || !name) return null;
  const version =
    typeof r.version === "number" && Number.isFinite(r.version) && r.version >= 1
      ? Math.floor(r.version)
      : 1;
  const ref =
    r.ref && typeof r.ref === "object"
      ? {
          requestId: str((r.ref as { requestId?: string }).requestId, 60),
          docId: str((r.ref as { docId?: string }).docId, 60),
        }
      : undefined;
  return {
    id,
    category: cat,
    name,
    version,
    url: str(r.url, 2000) || undefined,
    assignedTo: str(r.assignedTo, 80) || undefined,
    addedBy: str(r.addedBy, 80) || "Unknown",
    addedAt: str(r.addedAt, 40) || new Date().toISOString(),
    ref: ref && ref.requestId && ref.docId ? ref : undefined,
    note: str(r.note, 500) || undefined,
  };
}

function normalizeActivity(v: unknown): RequestActivity | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<RequestActivity>;
  const what = str(r.what, 240);
  if (!what) return null;
  return {
    at: str(r.at, 40) || new Date().toISOString(),
    by: str(r.by, 80) || "Unknown",
    what,
  };
}

function normalizeRequest(v: unknown): SolutionRequest | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<SolutionRequest>;
  const id = str(r.id, 60);
  const k = kind(r.kind);
  const title = str(r.title, 200);
  if (!id || !k || !title) return null;
  return {
    id,
    ref: str(r.ref, 20) || id,
    kind: k,
    subtype: str(r.subtype, 60) || undefined,
    title,
    details: str(r.details, 2000) || undefined,
    customerId: str(r.customerId, 60) || undefined,
    customer: str(r.customer, 120),
    opportunityIds: strList(r.opportunityIds, 60),
    opportunityLabels: strList(r.opportunityLabels, 200),
    contactIds: strList(r.contactIds, 60),
    contactNames: strList(r.contactNames, 120),
    status: status(r.status),
    requestedBy: str(r.requestedBy, 80) || "Unknown",
    requestedAt: str(r.requestedAt, 40) || new Date().toISOString(),
    neededBy: str(r.neededBy, 20) || undefined,
    owner: str(r.owner, 80) || undefined,
    pickedUpAt: str(r.pickedUpAt, 40) || undefined,
    completedBy: str(r.completedBy, 80) || undefined,
    completedAt: str(r.completedAt, 40) || undefined,
    meetingAt: str(r.meetingAt, 40) || undefined,
    attendees: strList(r.attendees, 80).length
      ? strList(r.attendees, 80)
      : undefined,
    docs: Array.isArray(r.docs)
      ? r.docs.map(normalizeDoc).filter((d): d is SolutionDoc => d !== null)
      : [],
    activity: Array.isArray(r.activity)
      ? r.activity
          .map(normalizeActivity)
          .filter((a): a is RequestActivity => a !== null)
          .slice(0, 200)
      : [],
  };
}

function normalize(v: unknown): SolutioningState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_SOLUTIONING);
  const raw = v as Partial<SolutioningState>;
  return {
    requests: Array.isArray(raw.requests)
      ? raw.requests
          .map(normalizeRequest)
          .filter((r): r is SolutionRequest => r !== null)
      : [],
  };
}

async function readRow(): Promise<SolutioningState> {
  if (!hasDatabase()) return structuredClone(EMPTY_SOLUTIONING);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(state: SolutioningState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * ONE DOOR FOR EVERY SOLUTIONING WRITE — the store is read-modify-write on one
 * row, so two unqueued writers in the same moment both read the same "before"
 * and the second erases the first with a 200 on both screens. Same lesson the
 * performance store learned the hard way (Aug 23 audit); hung on globalThis so
 * a dev hot reload cannot hand two requests two separate "empty" queues.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_SOLUTIONING_WRITE_QUEUE__: Promise<void> | undefined;
}

async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous =
    globalThis.__FREYR_SOLUTIONING_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_SOLUTIONING_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/* ---------------------------------------------------------------- samples */

/**
 * THE MOCK WORKSPACE LOOKS BUSY (standing rule: every page in mock looks full
 * of fake data). Requests across all three kinds and all three statuses, run
 * by the same invented people who staff the sample performance plan, against
 * accounts the mock customer list already carries. Sample only: live mode
 * never reads this.
 */
function sampleSolutioning(): SolutioningState {
  /* THE CAST IS THE DEMO SALES FLOOR, NOBODY ELSE (Anir, Aug 24: "you never
     do this on Mock mode — I don't know why you're mixing up existing profile
     pictures with real people"). The first seed starred Walter Hensley, whose
     mapped portrait is the suren-dheen render — a face that reads as the real
     CEO — plus two invented names that fell back to bare initials. Every
     person below resolves to a distinct generated headshot in the Avatar map
     (Elena Rossi, Omar Haddad, ...), and every "contact" is one of the mapped
     demo contacts (Lena Vogt, Owen Bradley, ...), so the room is fully
     photographed and none of the faces belongs to anyone real. */
  const day = (offset: number) => {
    const t = new Date("2026-08-24T12:00:00.000Z");
    t.setDate(t.getDate() + offset);
    return t.toISOString();
  };
  const d = (offset: number) => day(offset).slice(0, 10);
  const requests: SolutionRequest[] = [
    {
      id: "sr-sample-1",
      ref: "SUB-0001",
      kind: "submission",
      subtype: "RFP",
      title: "RFP response for global labeling operations",
      details:
        "Full RFP response covering Freya.Label scope, delivery model and pricing bands.",
      customer: "Meridian Pharmaceuticals",
      opportunityIds: [],
      opportunityLabels: ["Freya.Label · Meridian Pharmaceuticals (ARR)"],
      contactIds: [],
      contactNames: ["Lena Vogt"],
      status: "in_progress",
      requestedBy: "Elena Rossi",
      requestedAt: day(-9),
      neededBy: d(4),
      owner: "Omar Haddad",
      pickedUpAt: day(-8),
      docs: [
        { id: "sd-s1-1", category: "customer", name: "Meridian RFP package", version: 1, addedBy: "Elena Rossi", addedAt: day(-9) },
        { id: "sd-s1-2", category: "analysis", name: "Requirements analysis", version: 1, addedBy: "Nina Kowalski", addedAt: day(-7), assignedTo: "Nina Kowalski" },
        { id: "sd-s1-3", category: "working", name: "Response draft", version: 1, addedBy: "Omar Haddad", addedAt: day(-5), assignedTo: "Omar Haddad" },
        { id: "sd-s1-4", category: "working", name: "Response draft", version: 2, addedBy: "Omar Haddad", addedAt: day(-2), assignedTo: "Omar Haddad" },
      ],
      activity: [
        { at: day(-9), by: "Elena Rossi", what: "Requested this submission" },
        { at: day(-8), by: "Omar Haddad", what: "Picked it up" },
        { at: day(-7), by: "Nina Kowalski", what: "Added Requirements analysis v1" },
        { at: day(-2), by: "Omar Haddad", what: "Added Response draft v2" },
      ],
    },
    {
      id: "sr-sample-2",
      ref: "SUB-0002",
      kind: "submission",
      subtype: "Proposal",
      title: "Commercial proposal for artwork management",
      customer: "Solara Consumer Health",
      opportunityIds: [],
      opportunityLabels: ["Freya.Artwork · Solara Consumer Health (OTS)"],
      contactIds: [],
      contactNames: [],
      status: "initiated",
      requestedBy: "Daniel Foster",
      requestedAt: day(-2),
      neededBy: d(10),
      docs: [],
      activity: [{ at: day(-2), by: "Daniel Foster", what: "Requested this submission" }],
    },
    {
      id: "sr-sample-3",
      ref: "SUB-0003",
      kind: "submission",
      subtype: "RFI",
      title: "RFI answers on regulatory intelligence coverage",
      customer: "Northwind Biosciences",
      opportunityIds: [],
      opportunityLabels: [],
      contactIds: [],
      contactNames: ["Stefan Bauer"],
      status: "completed",
      requestedBy: "Marcus Chen",
      requestedAt: day(-16),
      owner: "Nina Kowalski",
      pickedUpAt: day(-15),
      completedBy: "Marcus Chen",
      completedAt: day(-3),
      docs: [
        { id: "sd-s3-1", category: "customer", name: "Northwind RFI questionnaire", version: 1, addedBy: "Marcus Chen", addedAt: day(-16) },
        { id: "sd-s3-2", category: "final", name: "RFI answers", version: 1, addedBy: "Nina Kowalski", addedAt: day(-4) },
      ],
      activity: [
        { at: day(-16), by: "Marcus Chen", what: "Requested this submission" },
        { at: day(-15), by: "Nina Kowalski", what: "Picked it up" },
        { at: day(-4), by: "Nina Kowalski", what: "Added RFI answers v1" },
        { at: day(-3), by: "Marcus Chen", what: "Marked it completed" },
      ],
    },
    {
      id: "sr-sample-4",
      ref: "PRE-0001",
      kind: "presentation",
      subtype: "RFP defense",
      title: "RFP defense deck for regulatory intelligence",
      customer: "Helix Biologics",
      opportunityIds: [],
      opportunityLabels: ["Freya.intelligence · Helix Biologics (ARR)"],
      contactIds: [],
      contactNames: [],
      status: "completed",
      requestedBy: "Elena Rossi",
      requestedAt: day(-20),
      owner: "Omar Haddad",
      pickedUpAt: day(-19),
      completedBy: "Elena Rossi",
      completedAt: day(-6),
      docs: [
        { id: "sd-s4-1", category: "final", name: "Defense deck", version: 3, addedBy: "Omar Haddad", addedAt: day(-7) },
      ],
      activity: [
        { at: day(-20), by: "Elena Rossi", what: "Requested this presentation" },
        { at: day(-19), by: "Omar Haddad", what: "Picked it up" },
        { at: day(-7), by: "Omar Haddad", what: "Added Defense deck v3" },
        { at: day(-6), by: "Elena Rossi", what: "Marked it completed" },
      ],
    },
    {
      id: "sr-sample-5",
      ref: "PRE-0002",
      kind: "presentation",
      subtype: "Capabilities overview",
      title: "Capabilities overview for the oncology portfolio",
      customer: "Quantum Oncology",
      opportunityIds: [],
      opportunityLabels: ["Freya.Register · Quantum Oncology (ARR)"],
      contactIds: [],
      contactNames: ["Hana Kim"],
      status: "in_progress",
      requestedBy: "Grace Liu",
      requestedAt: day(-6),
      neededBy: d(2),
      owner: "Nina Kowalski",
      pickedUpAt: day(-5),
      docs: [
        { id: "sd-s5-1", category: "working", name: "Overview deck", version: 1, addedBy: "Nina Kowalski", addedAt: day(-3), assignedTo: "Nina Kowalski" },
      ],
      activity: [
        { at: day(-6), by: "Grace Liu", what: "Requested this presentation" },
        { at: day(-5), by: "Nina Kowalski", what: "Picked it up" },
        { at: day(-3), by: "Nina Kowalski", what: "Added Overview deck v1" },
      ],
    },
    {
      id: "sr-sample-6",
      ref: "PRE-0003",
      kind: "presentation",
      subtype: "Executive readout",
      title: "Executive readout on the vaccines programme",
      customer: "Orion Vaccines",
      opportunityIds: [],
      opportunityLabels: [],
      contactIds: [],
      contactNames: ["Megan Ruiz"],
      status: "initiated",
      requestedBy: "Daniel Foster",
      requestedAt: day(-5),
      /* Deliberately past due and unowned: the list has to show what overdue
         looks like, red date and all. */
      neededBy: d(-2),
      docs: [],
      activity: [{ at: day(-5), by: "Daniel Foster", what: "Requested this presentation" }],
    },
    {
      id: "sr-sample-7",
      ref: "MTG-0001",
      kind: "meeting",
      title: "Technical deep-dive with the Aether RA team",
      customer: "Aether Medical Devices",
      opportunityIds: [],
      opportunityLabels: [],
      contactIds: [],
      contactNames: ["Owen Bradley", "Claudia Hofmann"],
      status: "initiated",
      requestedBy: "Elena Rossi",
      requestedAt: day(-1),
      neededBy: d(7),
      meetingAt: day(7),
      attendees: ["Elena Rossi", "Owen Bradley", "Claudia Hofmann"],
      docs: [
        {
          id: "sd-s7-1",
          category: "working",
          name: "Defense deck",
          version: 1,
          addedBy: "Elena Rossi",
          addedAt: day(-1),
          ref: { requestId: "sr-sample-4", docId: "sd-s4-1" },
          note: "Reusing the Helix defense deck as the base",
        },
      ],
      activity: [{ at: day(-1), by: "Elena Rossi", what: "Requested this meeting" }],
    },
    {
      id: "sr-sample-8",
      ref: "MTG-0002",
      kind: "meeting",
      title: "RFP defense session with Meridian",
      customer: "Meridian Pharmaceuticals",
      opportunityIds: [],
      opportunityLabels: ["Freya.Label · Meridian Pharmaceuticals (ARR)"],
      contactIds: [],
      contactNames: ["Lena Vogt"],
      status: "in_progress",
      requestedBy: "Marcus Chen",
      requestedAt: day(-4),
      neededBy: d(3),
      meetingAt: day(3),
      attendees: ["Marcus Chen", "Omar Haddad", "Lena Vogt"],
      owner: "Omar Haddad",
      pickedUpAt: day(-3),
      docs: [],
      activity: [
        { at: day(-4), by: "Marcus Chen", what: "Requested this meeting" },
        { at: day(-3), by: "Omar Haddad", what: "Picked it up" },
      ],
    },
    {
      id: "sr-sample-9",
      ref: "MTG-0003",
      kind: "meeting",
      title: "Kickoff debrief with Solvance regulatory leads",
      customer: "Solvance Pharma",
      opportunityIds: [],
      opportunityLabels: [],
      contactIds: [],
      contactNames: ["Arun Pillai"],
      status: "completed",
      requestedBy: "Grace Liu",
      requestedAt: day(-12),
      owner: "Nina Kowalski",
      pickedUpAt: day(-11),
      completedBy: "Grace Liu",
      completedAt: day(-5),
      meetingAt: day(-6),
      attendees: ["Grace Liu", "Nina Kowalski", "Arun Pillai"],
      docs: [
        { id: "sd-s9-1", category: "final", name: "Debrief notes", version: 1, addedBy: "Nina Kowalski", addedAt: day(-5) },
      ],
      activity: [
        { at: day(-12), by: "Grace Liu", what: "Requested this meeting" },
        { at: day(-11), by: "Nina Kowalski", what: "Picked it up" },
        { at: day(-5), by: "Nina Kowalski", what: "Added Debrief notes v1" },
        { at: day(-5), by: "Grace Liu", what: "Marked it completed" },
      ],
    },
  ];
  return { requests };
}

/* ------------------------------------------------------------------ reads */

export async function readSolutioning(): Promise<SolutioningState> {
  if (getDataMode() !== "live") return sampleSolutioning();
  return readRow().catch(() => structuredClone(EMPTY_SOLUTIONING));
}

/* -------------------------------------------------------------------- ops */

/** SUB-0007 style refs: per kind, one past the highest ever minted — never a
 *  count, so deleting a request can never reissue its reference. */
function nextRef(state: SolutioningState, k: SolutioningKind): string {
  const prefix = k === "submission" ? "SUB" : k === "presentation" ? "PRE" : "MTG";
  let highest = 0;
  for (const r of state.requests) {
    if (!r.ref.startsWith(prefix + "-")) continue;
    const n = parseInt(r.ref.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${prefix}-${String(highest + 1).padStart(4, "0")}`;
}

const KIND_WORD: Record<SolutioningKind, string> = {
  submission: "submission",
  presentation: "presentation",
  meeting: "meeting",
};

export async function createRequest(input: {
  kind: SolutioningKind;
  subtype?: string;
  title: string;
  details?: string;
  customerId?: string;
  customer: string;
  opportunityIds?: string[];
  opportunityLabels?: string[];
  contactIds?: string[];
  contactNames?: string[];
  neededBy?: string;
  meetingAt?: string;
  attendees?: string[];
  requestedBy: string;
}): Promise<SolutionRequest> {
  return withWrite(async () => {
    const title = str(input.title, 200);
    if (!title) throw new Error("Give the request a title.");
    const customer = str(input.customer, 120);
    if (!customer) throw new Error("Pick the customer this is for.");
    const state = await readRow();
    const record: SolutionRequest = {
      id: uid("sr"),
      ref: nextRef(state, input.kind),
      kind: input.kind,
      subtype: str(input.subtype, 60) || undefined,
      title,
      details: str(input.details, 2000) || undefined,
      customerId: str(input.customerId, 60) || undefined,
      customer,
      opportunityIds: strList(input.opportunityIds, 60),
      opportunityLabels: strList(input.opportunityLabels, 200),
      contactIds: strList(input.contactIds, 60),
      contactNames: strList(input.contactNames, 120),
      status: "initiated",
      requestedBy: input.requestedBy,
      requestedAt: new Date().toISOString(),
      neededBy: str(input.neededBy, 20) || undefined,
      meetingAt:
        input.kind === "meeting" ? str(input.meetingAt, 40) || undefined : undefined,
      attendees:
        input.kind === "meeting" && strList(input.attendees, 80).length
          ? strList(input.attendees, 80)
          : undefined,
      docs: [],
      activity: [
        {
          at: new Date().toISOString(),
          by: input.requestedBy,
          what: `Requested this ${KIND_WORD[input.kind]}`,
        },
      ],
    };
    state.requests.unshift(record);
    await writeRow(state);
    return record;
  });
}

function mustFind(state: SolutioningState, requestId: string): SolutionRequest {
  const r = state.requests.find((x) => x.id === requestId);
  if (!r) throw new Error("That request is gone. Refresh and retry.");
  return r;
}

export async function pickUpRequest(input: {
  requestId: string;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    if (r.status === "completed")
      throw new Error("This request is already completed.");
    if (r.owner && r.owner !== input.by)
      throw new Error(`${r.owner} already picked this up.`);
    r.owner = input.by;
    r.pickedUpAt = r.pickedUpAt ?? new Date().toISOString();
    // Picking up IS starting: "somebody picks up the request... work in
    // progress". A separate "start" click would be a step nobody asked for.
    if (r.status === "initiated") r.status = "in_progress";
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: "Picked it up",
    });
    await writeRow(state);
  });
}

/**
 * "THE SALES PERSON SAYS IT IS COMPLETED" (Suren, Aug 24, answering exactly
 * this question). The requester closes it; a manager or admin can close it on
 * their behalf. The fulfiller cannot mark their own work done — the caller
 * enforces who is asking, this enforces what is allowed.
 */
export async function completeRequest(input: {
  requestId: string;
  by: string;
  allowed: boolean;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    if (!input.allowed)
      throw new Error(
        `Only ${r.requestedBy}, who asked for it, can mark this completed.`
      );
    if (r.status === "completed") return;
    r.status = "completed";
    r.completedBy = input.by;
    r.completedAt = new Date().toISOString();
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: "Marked it completed",
    });
    await writeRow(state);
  });
}

export async function reopenRequest(input: {
  requestId: string;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    if (r.status !== "completed") return;
    r.status = r.owner ? "in_progress" : "initiated";
    r.completedBy = undefined;
    r.completedAt = undefined;
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: "Reopened it",
    });
    await writeRow(state);
  });
}

export async function addDocument(input: {
  requestId: string;
  category: DocCategory;
  name: string;
  url?: string;
  assignedTo?: string;
  note?: string;
  by: string;
  /** Reference to a document on ANOTHER request (Suren: a meeting "can refer
   *  to a document that was created as part of a presentation request"). */
  ref?: { requestId: string; docId: string };
}): Promise<SolutionDoc> {
  return withWrite(async () => {
    const name = str(input.name, 160);
    if (!name) throw new Error("Give the document a name.");
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    if (r.status === "completed")
      throw new Error("This request is completed. Reopen it to add documents.");
    let ref: SolutionDoc["ref"];
    if (input.ref) {
      const home = state.requests.find((x) => x.id === input.ref!.requestId);
      const doc = home?.docs.find((d) => d.id === input.ref!.docId);
      if (!home || !doc)
        throw new Error("That document is gone from its home request.");
      ref = { requestId: home.id, docId: doc.id };
    }
    // Same name in the same tab → the next version. References never mint
    // versions here; the file's home request owns its numbering.
    const version = ref
      ? 1
      : r.docs.filter(
          (d) =>
            !d.ref &&
            d.category === input.category &&
            d.name.toLowerCase() === name.toLowerCase()
        ).length + 1;
    const doc: SolutionDoc = {
      id: uid("sd"),
      category: input.category,
      name,
      version,
      url: str(input.url, 2000) || undefined,
      assignedTo: str(input.assignedTo, 80) || undefined,
      addedBy: input.by,
      addedAt: new Date().toISOString(),
      ref,
      note: str(input.note, 500) || undefined,
    };
    r.docs.push(doc);
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: ref
        ? `Linked ${name} from ${state.requests.find((x) => x.id === ref!.requestId)?.ref ?? "another request"}`
        : `Added ${name} v${version}`,
    });
    await writeRow(state);
    return doc;
  });
}

export async function assignDocument(input: {
  requestId: string;
  docId: string;
  assignedTo: string | null;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    const doc = r.docs.find((d) => d.id === input.docId);
    if (!doc) throw new Error("That document is gone. Refresh and retry.");
    const next = input.assignedTo ? str(input.assignedTo, 80) : undefined;
    doc.assignedTo = next || undefined;
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: next
        ? `Put ${next} on ${doc.name}`
        : `Cleared the assignee on ${doc.name}`,
    });
    await writeRow(state);
  });
}

export async function removeDocument(input: {
  requestId: string;
  docId: string;
  by: string;
  allowed: (doc: SolutionDoc) => boolean;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    const doc = r.docs.find((d) => d.id === input.docId);
    if (!doc) return;
    if (!input.allowed(doc))
      throw new Error("Only the person who added it, the owner or a manager can remove this.");
    r.docs = r.docs.filter((d) => d.id !== input.docId);
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: `Removed ${doc.name}${doc.ref ? "" : ` v${doc.version}`}`,
    });
    await writeRow(state);
  });
}

export async function updateRequest(input: {
  requestId: string;
  by: string;
  patch: Partial<
    Pick<
      SolutionRequest,
      | "title"
      | "details"
      | "subtype"
      | "neededBy"
      | "meetingAt"
      | "attendees"
      | "opportunityIds"
      | "opportunityLabels"
      | "contactIds"
      | "contactNames"
    >
  >;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    const p = input.patch;
    if (p.title !== undefined) {
      const t = str(p.title, 200);
      if (!t) throw new Error("A request needs a title.");
      r.title = t;
    }
    if (p.details !== undefined) r.details = str(p.details, 2000) || undefined;
    if (p.subtype !== undefined) r.subtype = str(p.subtype, 60) || undefined;
    if (p.neededBy !== undefined) r.neededBy = str(p.neededBy, 20) || undefined;
    if (p.meetingAt !== undefined)
      r.meetingAt = str(p.meetingAt, 40) || undefined;
    if (p.attendees !== undefined)
      r.attendees = strList(p.attendees, 80).length
        ? strList(p.attendees, 80)
        : undefined;
    if (p.opportunityIds !== undefined)
      r.opportunityIds = strList(p.opportunityIds, 60);
    if (p.opportunityLabels !== undefined)
      r.opportunityLabels = strList(p.opportunityLabels, 200);
    if (p.contactIds !== undefined) r.contactIds = strList(p.contactIds, 60);
    if (p.contactNames !== undefined)
      r.contactNames = strList(p.contactNames, 120);
    r.activity.push({
      at: new Date().toISOString(),
      by: input.by,
      what: "Edited the request",
    });
    await writeRow(state);
  });
}

export async function deleteRequest(input: {
  requestId: string;
  allowed: boolean;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const r = mustFind(state, input.requestId);
    if (!input.allowed)
      throw new Error(
        "Only the requester (while nothing has started) or an admin can delete a request."
      );
    // Other requests may reference this one's documents. A deleted home would
    // leave dangling links, so the references die with it — visibly, in the
    // referencing request's activity.
    for (const other of state.requests) {
      if (other.id === r.id) continue;
      const dropped = other.docs.filter((d) => d.ref?.requestId === r.id);
      if (dropped.length === 0) continue;
      other.docs = other.docs.filter((d) => d.ref?.requestId !== r.id);
      other.activity.push({
        at: new Date().toISOString(),
        by: "System",
        what: `${r.ref} was deleted; ${dropped.length} linked document${dropped.length === 1 ? "" : "s"} removed`,
      });
    }
    state.requests = state.requests.filter((x) => x.id !== input.requestId);
    await writeRow(state);
  });
}

/* ---------------------------------------------------------------- rollups */

/**
 * WHO DID WHAT, the way Suren counts it (Aug 24): "the requester has done
 * these presentations. How many has the fulfilled guy done? Anybody who works
 * on a document gets on the submission side. Anybody who created a meeting
 * request, that meeting comes along."
 *
 * So one fulfilled presentation can honestly appear under several people —
 * the requester, the owner, and every document worker. That is the point:
 * this answers "what has Ravi touched?", not "how do these sum?".
 */
export type PersonRollup = {
  person: string;
  requested: number;
  owned: number;
  workedDocs: number;
  completed: { submission: number; presentation: number; meeting: number };
};

export function solutioningPeople(state: SolutioningState): PersonRollup[] {
  const by = new Map<string, PersonRollup>();
  const row = (person: string): PersonRollup => {
    const key = person.trim();
    let r = by.get(key);
    if (!r) {
      r = {
        person: key,
        requested: 0,
        owned: 0,
        workedDocs: 0,
        completed: { submission: 0, presentation: 0, meeting: 0 },
      };
      by.set(key, r);
    }
    return r;
  };
  for (const req of state.requests) {
    if (req.requestedBy) row(req.requestedBy).requested += 1;
    if (req.owner) row(req.owner).owned += 1;
    const touched = new Set<string>();
    for (const d of req.docs) {
      if (d.addedBy) touched.add(d.addedBy.trim());
      if (d.assignedTo) touched.add(d.assignedTo.trim());
    }
    for (const person of touched) row(person).workedDocs += 1;
    if (req.status === "completed") {
      const credited = new Set<string>([
        req.requestedBy.trim(),
        ...(req.owner ? [req.owner.trim()] : []),
        ...touched,
      ]);
      for (const person of credited) {
        if (person) row(person).completed[req.kind] += 1;
      }
    }
  }
  return [...by.values()].sort(
    (a, b) =>
      b.requested + b.owned + b.workedDocs - (a.requested + a.owned + a.workedDocs)
  );
}
