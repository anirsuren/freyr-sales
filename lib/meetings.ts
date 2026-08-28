import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";

/**
 * MEETINGS — customer meetings, as their own object.
 *
 * Suren, Aug 28, verbatim: "I need to have a meetings module. Somebody can
 * come in and then create a new meeting... what is this meeting about and
 * against what... when is the meeting date... you can also provide the
 * contacts who are going to be part of that particular meeting and you can
 * also provide the people who are going to attend from our side, from Freyr's
 * side... and against which context you have created those meetings."
 *
 * WHY IT IS NOT A FOURTH SOLUTIONING TAB. Solutioning is sales ASKING the
 * Solutions team for something and that team building it. A meeting is not
 * built and handed over; it is scheduled, attended and written up, usually by
 * the sales person themselves. "Meetings are basically customer meetings."
 * The solutioning "meeting" kind stays what it always was — a REQUEST for
 * help with a meeting — and is a different thing from the meeting itself.
 *
 * WHAT IT CARRIES, in his order:
 *   - what it is about, and what type of meeting
 *   - the date, and who owns it ("a meeting owner, who is the guy who created
 *     the meeting")
 *   - "the contacts who are going to be part of that particular meeting" —
 *     customer side, real contact records
 *   - "the people who are going to attend from our side, from Freyr side"
 *   - "who is the primary presenter of the meeting"
 *   - the customer, and the opportunities it is against
 *
 * TWO STATES, and someone says which: "these are all completed meetings and
 * these are planned meetings. Somebody has to go once the meeting is done and
 * say that meeting is complete."
 *
 * THE WRITE-UP IS NOT ONLY FILES (his point about analysis): "this analysis
 * doesn't have to be a document, it can be — they can provide some, like, what
 * is a meeting brief or meeting transcript, whatever it is. They can add a
 * document or they can add comments." So `notes` holds a transcript, a brief
 * or an outcome as text, and documents sit beside them rather than instead.
 *
 * IT IS A JOIN, NOT AN ISLAND: "meeting is a separate connection to every one
 * of those areas." A person's page answers which meetings they owned,
 * presented at and attended; a customer's and an opportunity's answer which
 * meetings happened against them. Everything needed for that is stored on the
 * meeting, so those pages read rather than compute.
 *
 * Storage mirrors solutioning exactly: one row in offering_catalog_state
 * keyed "meetings", separate rows for Mock and Real.
 */

const ROW_ID = "meetings";

/**
 * THE TYPES, which he asked me to name: "what type of meetings it is, I have
 * to make a list... when you do sales and meetings, what type of meetings are
 * there? Make a list and then add that as a dropdown list. I don't know what
 * that is."
 *
 * These are the stages a B2B pharma-services deal actually passes through,
 * one per reason you would put a customer in a room. Deliberately short: a
 * list nobody can choose from is a list everybody types "Other" into.
 */
export const MEETING_TYPES = [
  "Introductory",
  "Discovery",
  "Capability / demo",
  "Technical deep dive",
  "RFP defence",
  "Commercial / pricing",
  "QBR / review",
  "Executive briefing",
  "Conference / event",
] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

/** Planned until somebody says it happened. */
export type MeetingStatus = "planned" | "completed" | "cancelled";

export type MeetingNoteKind = "brief" | "transcript" | "outcome" | "comment";

/**
 * A written contribution to the meeting. His "analysis doesn't have to be a
 * document": a transcript pasted in, a brief typed before, an outcome after,
 * or a plain remark from anyone who can see it.
 */
export type MeetingNote = {
  id: string;
  kind: MeetingNoteKind;
  by: string;
  at: string;
  text: string;
};

/** A file on the meeting: what was presented, or anything handed over. */
export type MeetingDoc = {
  id: string;
  label: string;
  /** Where it lives in Freya.Docs, when it was uploaded rather than linked. */
  docsPath?: string;
  url?: string;
  addedBy: string;
  addedAt: string;
};

export type Meeting = {
  id: string;
  ref: string;
  title: string;
  type: MeetingType | string;
  status: MeetingStatus;
  /** The day it is held. ISO date, because a meeting belongs to a day on a
   *  calendar before it belongs to a minute. */
  meetingAt: string;
  customerId?: string;
  customer: string;
  opportunityIds: string[];
  opportunityLabels: string[];

  /** Customer side: real contacts on the account. */
  contactIds: string[];
  contactNames: string[];
  /** Our side. */
  attendees: string[];
  /** "who is the primary presenter of the meeting" — may be several. */
  presenters: string[];

  /** "a meeting owner, who is the guy who created the meeting". */
  owner: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;

  notes: MeetingNote[];
  docs: MeetingDoc[];
};

export type MeetingsState = { meetings: Meeting[] };

export const EMPTY_MEETINGS: MeetingsState = { meetings: [] };

/* ------------------------------------------------------------------ store */

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MEETINGS_WRITE_QUEUE__: Promise<void> | undefined;
}

function hasDatabase(): boolean {
  return hasSupabase();
}

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function activeRowId(): string {
  return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, max: number, cap = 60): string[] {
  return Array.isArray(v)
    ? v.map((x) => str(String(x ?? ""), max)).filter(Boolean).slice(0, cap)
    : [];
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** Serial writes, so two people saving the same meeting cannot interleave. */
async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_MEETINGS_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_MEETINGS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function normalizeStatus(v: unknown): MeetingStatus {
  return v === "completed" || v === "cancelled" ? v : "planned";
}

function normalizeNote(v: unknown): MeetingNote | null {
  if (!v || typeof v !== "object") return null;
  const n = v as Partial<MeetingNote>;
  const text = str(n.text, 20000);
  if (!text) return null;
  const kind: MeetingNoteKind =
    n.kind === "brief" || n.kind === "transcript" || n.kind === "outcome"
      ? n.kind
      : "comment";
  return {
    id: str(n.id, 60) || uid("mn"),
    kind,
    by: str(n.by, 80) || "Unknown",
    at: str(n.at, 40) || new Date().toISOString(),
    text,
  };
}

function normalizeDoc(v: unknown): MeetingDoc | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Partial<MeetingDoc>;
  const label = str(d.label, 200);
  if (!label) return null;
  return {
    id: str(d.id, 60) || uid("md"),
    label,
    docsPath: str(d.docsPath, 400) || undefined,
    url: str(d.url, 1000) || undefined,
    addedBy: str(d.addedBy, 80) || "Unknown",
    addedAt: str(d.addedAt, 40) || new Date().toISOString(),
  };
}

function normalizeMeeting(v: unknown): Meeting | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Partial<Meeting>;
  const id = str(m.id, 60);
  const title = str(m.title, 200);
  if (!id || !title) return null;
  return {
    id,
    ref: str(m.ref, 40) || id,
    title,
    type: str(m.type, 60) || "Introductory",
    status: normalizeStatus(m.status),
    meetingAt: str(m.meetingAt, 40),
    customerId: str(m.customerId, 60) || undefined,
    customer: str(m.customer, 120),
    opportunityIds: strList(m.opportunityIds, 60),
    opportunityLabels: strList(m.opportunityLabels, 200),
    contactIds: strList(m.contactIds, 60),
    contactNames: strList(m.contactNames, 120),
    attendees: strList(m.attendees, 80),
    presenters: strList(m.presenters, 80),
    owner: str(m.owner, 80) || "Unknown",
    createdAt: str(m.createdAt, 40) || new Date().toISOString(),
    completedAt: str(m.completedAt, 40) || undefined,
    completedBy: str(m.completedBy, 80) || undefined,
    notes: Array.isArray(m.notes)
      ? m.notes.map(normalizeNote).filter((n): n is MeetingNote => n !== null).slice(0, 400)
      : [],
    docs: Array.isArray(m.docs)
      ? m.docs.map(normalizeDoc).filter((d): d is MeetingDoc => d !== null).slice(0, 200)
      : [],
  };
}

function normalize(v: unknown): MeetingsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_MEETINGS);
  const raw = (v as { meetings?: unknown }).meetings;
  return {
    meetings: Array.isArray(raw)
      ? raw.map(normalizeMeeting).filter((m): m is Meeting => m !== null)
      : [],
  };
}

async function readRow(): Promise<MeetingsState> {
  if (!hasDatabase()) return structuredClone(EMPTY_MEETINGS);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

/** The raw stored value, so a never-written mock row can be told from an
 *  empty one. */
async function readRowRaw(): Promise<unknown | null> {
  if (!hasDatabase()) return null;
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

async function writeRow(state: MeetingsState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

/**
 * MOCK SEEDS ITSELF ONCE, then behaves like any other store.
 *
 * Same shape as readSolutioning: live reads its own row and never touches the
 * samples; mock seeds the row the first time it is read and every write after
 * that is ordinary, so a meeting added in mock persists and a mock row
 * emptied on purpose stays empty.
 */
export async function readMeetings(): Promise<MeetingsState> {
  if (getDataMode() !== "mock")
    return readRow().catch(() => structuredClone(EMPTY_MEETINGS));
  const existing = await readRowRaw().catch(() => null);
  if (existing && !isPreLinkSeed(existing)) return normalize(existing);
  const seeded = sampleMeetings();
  await writeRow(seeded).catch(() => undefined);
  return seeded;
}

/** MTG-0001, MTG-0002 — the same shape every other record here wears. */
function nextRef(state: MeetingsState): string {
  let highest = 0;
  for (const m of state.meetings) {
    const n = Number(/^MTG-(\d+)$/.exec(m.ref)?.[1] ?? 0);
    if (n > highest) highest = n;
  }
  return `MTG-${String(highest + 1).padStart(4, "0")}`;
}

function mustFind(state: MeetingsState, id: string): Meeting {
  const m = state.meetings.find((x) => x.id === id);
  if (!m) throw new Error("That meeting is gone. Refresh and retry.");
  return m;
}

export type MeetingInput = {
  title: string;
  type: string;
  meetingAt: string;
  customerId?: string;
  customer: string;
  opportunityIds?: string[];
  opportunityLabels?: string[];
  contactIds?: string[];
  contactNames?: string[];
  attendees?: string[];
  presenters?: string[];
  /** "who was running the meeting" — the creator unless they say otherwise. */
  owner?: string;
};

export async function createMeeting(
  input: MeetingInput & { by: string }
): Promise<Meeting> {
  return withWrite(async () => {
    const title = str(input.title, 200);
    if (!title) throw new Error("Give the meeting a title.");
    const customer = str(input.customer, 120);
    if (!customer) throw new Error("Pick the customer this meeting is with.");
    const meetingAt = str(input.meetingAt, 40);
    if (!meetingAt) throw new Error("Say when the meeting is.");

    const state = await readRow();
    const meeting: Meeting = {
      id: uid("mtg"),
      ref: nextRef(state),
      title,
      type: str(input.type, 60) || "Introductory",
      status: "planned",
      meetingAt,
      customerId: str(input.customerId, 60) || undefined,
      customer,
      opportunityIds: strList(input.opportunityIds, 60),
      opportunityLabels: strList(input.opportunityLabels, 200),
      contactIds: strList(input.contactIds, 60),
      contactNames: strList(input.contactNames, 120),
      attendees: strList(input.attendees, 80),
      presenters: strList(input.presenters, 80),
      /* "a meeting owner, who is the guy who created the meeting" — unless
         they booked it for somebody else and said so. */
      owner: str(input.owner, 80) || str(input.by, 80) || "Unknown",
      createdAt: new Date().toISOString(),
      notes: [],
      docs: [],
    };
    state.meetings.unshift(meeting);
    await writeRow(state);
    return meeting;
  });
}

export async function updateMeeting(input: {
  id: string;
  patch: Partial<MeetingInput> & { owner?: string };
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const m = mustFind(state, input.id);
    const p = input.patch;
    if (p.title !== undefined) m.title = str(p.title, 200) || m.title;
    if (p.type !== undefined) m.type = str(p.type, 60) || m.type;
    if (p.meetingAt !== undefined) m.meetingAt = str(p.meetingAt, 40) || m.meetingAt;
    if (p.customer !== undefined) m.customer = str(p.customer, 120) || m.customer;
    if (p.customerId !== undefined)
      m.customerId = str(p.customerId, 60) || undefined;
    if (p.opportunityIds !== undefined)
      m.opportunityIds = strList(p.opportunityIds, 60);
    if (p.opportunityLabels !== undefined)
      m.opportunityLabels = strList(p.opportunityLabels, 200);
    if (p.contactIds !== undefined) m.contactIds = strList(p.contactIds, 60);
    if (p.contactNames !== undefined) m.contactNames = strList(p.contactNames, 120);
    if (p.attendees !== undefined) m.attendees = strList(p.attendees, 80);
    if (p.presenters !== undefined) m.presenters = strList(p.presenters, 80);
    if (p.owner !== undefined) m.owner = str(p.owner, 80) || m.owner;
    await writeRow(state);
  });
}

/** "Somebody has to go once the meeting is done and say that meeting is
 *  complete." Anyone may; a meeting is not owned work. */
export async function setMeetingStatus(input: {
  id: string;
  status: MeetingStatus;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const m = mustFind(state, input.id);
    m.status = input.status;
    if (input.status === "completed") {
      m.completedAt = new Date().toISOString();
      m.completedBy = str(input.by, 80) || "Unknown";
    } else {
      m.completedAt = undefined;
      m.completedBy = undefined;
    }
    await writeRow(state);
  });
}

/** A brief, a transcript, an outcome or a plain comment. */
export async function addMeetingNote(input: {
  id: string;
  kind: MeetingNoteKind;
  text: string;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const text = str(input.text, 20000);
    if (!text) throw new Error("Write something first.");
    const state = await readRow();
    const m = mustFind(state, input.id);
    m.notes.push({
      id: uid("mn"),
      kind: input.kind,
      by: str(input.by, 80) || "Unknown",
      at: new Date().toISOString(),
      text,
    });
    await writeRow(state);
  });
}

export async function removeMeetingNote(input: {
  id: string;
  noteId: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const m = mustFind(state, input.id);
    m.notes = m.notes.filter((n) => n.id !== input.noteId);
    await writeRow(state);
  });
}

export async function addMeetingDoc(input: {
  id: string;
  label: string;
  docsPath?: string;
  url?: string;
  by: string;
}): Promise<void> {
  return withWrite(async () => {
    const label = str(input.label, 200);
    if (!label) throw new Error("Name the document.");
    const state = await readRow();
    const m = mustFind(state, input.id);
    m.docs.push({
      id: uid("md"),
      label,
      docsPath: str(input.docsPath, 400) || undefined,
      url: str(input.url, 1000) || undefined,
      addedBy: str(input.by, 80) || "Unknown",
      addedAt: new Date().toISOString(),
    });
    await writeRow(state);
  });
}

export async function removeMeetingDoc(input: {
  id: string;
  docId: string;
}): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    const m = mustFind(state, input.id);
    m.docs = m.docs.filter((d) => d.id !== input.docId);
    await writeRow(state);
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  return withWrite(async () => {
    const state = await readRow();
    state.meetings = state.meetings.filter((m) => m.id !== id);
    await writeRow(state);
  });
}

/* ------------------------------------------------------- the join queries */

/**
 * "Meeting is a separate connection to every one of those areas."
 *
 * One helper per page that asks. They read the stored meeting rather than
 * recomputing anything, because every side of the join is written onto the
 * meeting when it is made.
 */
export function meetingsForPerson(
  all: Meeting[],
  name: string
): { owned: Meeting[]; presented: Meeting[]; attended: Meeting[] } {
  const is = (x: string) => x.trim().toLowerCase() === name.trim().toLowerCase();
  return {
    owned: all.filter((m) => is(m.owner)),
    presented: all.filter((m) => m.presenters.some(is)),
    /* Attending is the broad one: being in the room counts however you got
       there, so an owner or presenter is an attendee too. */
    attended: all.filter(
      (m) => m.attendees.some(is) || m.presenters.some(is) || is(m.owner)
    ),
  };
}

export function meetingsForCustomer(all: Meeting[], customerId: string, name: string): Meeting[] {
  return all.filter(
    (m) =>
      (customerId && m.customerId === customerId) ||
      (!!name && m.customer.trim().toLowerCase() === name.trim().toLowerCase())
  );
}

export function meetingsForOpportunity(all: Meeting[], opportunityId: string): Meeting[] {
  return all.filter((m) => m.opportunityIds.includes(opportunityId));
}

/**
 * "The planned meetings is what I want to see month on month, week on
 * [week] — which week, which month, some kind of approach."
 *
 * Buckets by the meeting's own day, newest bucket first for completed work
 * and soonest first for planned, because the question differs: what is coming
 * versus what happened.
 */
export function groupMeetingsByPeriod(
  meetings: Meeting[],
  period: "week" | "month"
): { key: string; label: string; meetings: Meeting[] }[] {
  const buckets = new Map<string, { label: string; meetings: Meeting[] }>();
  for (const m of meetings) {
    const d = new Date(m.meetingAt);
    if (Number.isNaN(d.getTime())) continue;
    let key: string;
    let label: string;
    if (period === "month") {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      label = d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    } else {
      /* The Monday of that week, so a week is named by the day it starts. */
      const monday = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      const shift = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - shift);
      key = monday.toISOString().slice(0, 10);
      label = `Week of ${monday.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}`;
    }
    const bucket = buckets.get(key) ?? { label, meetings: [] };
    bucket.meetings.push(m);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({ key, label: b.label, meetings: b.meetings }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * A MOCK ROW SEEDED BEFORE THE DEMO DEALS EXISTED.
 *
 * The first meetings sample carried no opportunity ids, because in mock there
 * were no deals against the demo accounts to carry (the customers and the
 * pipeline seed were two different casts until Aug 28). A store seeded from
 * that set would show meetings joined to nothing forever, which is the exact
 * hole this was meant to fill.
 *
 * Sample data is disposable by definition, so a pre-link seed is replaced with
 * the current one. Only ever fires in mock, only when EVERY row is one of the
 * originals AND not one of them links to a deal — which no store written after
 * this change can look like, and which anything a person made cannot look like
 * either.
 */
function isPreLinkSeed(raw: unknown): boolean {
  const rows = (raw as { meetings?: unknown[] } | null)?.meetings;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.every((row) => {
    if (!row || typeof row !== "object") return false;
    const m = row as { id?: unknown; opportunityIds?: unknown };
    return (
      typeof m.id === "string" &&
      m.id.startsWith("mtg-sample-") &&
      (!Array.isArray(m.opportunityIds) || m.opportunityIds.length === 0)
    );
  });
}

/* ---------------------------------------------------------------- samples */

/**
 * THE MOCK WORKSPACE LOOKS BUSY (standing rule: every page in mock looks full
 * of fake data — Anir, Aug 28: "no mock data fix", and "need mock data for
 * every single part in real mode in the in progress mode").
 *
 * Meetings shipped without a sample set, so in-progress mode showed "Nothing
 * on meetings for Cortexa Biopharma yet" on an account whose every other band
 * had something — the one empty shelf in a shop that is meant to look stocked.
 *
 * The cast is the demo sales floor and nobody real (the same rule the
 * solutioning samples follow: every name below resolves to a generated
 * headshot, and every contact is one of the mapped demo contacts), and the
 * accounts are the ones lib/mock-db already carries, so the customer, person
 * and deal joins all land somewhere. Sample only: live mode never reads this.
 */
function sampleMeetings(): MeetingsState {
  const day = (offset: number) => {
    const t = new Date("2026-08-28T12:00:00.000Z");
    t.setDate(t.getDate() + offset);
    return t.toISOString();
  };
  const d = (offset: number) => day(offset).slice(0, 10);

  const meetings: Meeting[] = [
    {
      id: "mtg-sample-1",
      ref: "MTG-0001",
      title: "Cortexa CMC dossier — first working session",
      type: "Technical deep dive",
      status: "completed",
      meetingAt: d(-9),
      customerId: "cust-003",
      customer: "Cortexa Biopharma",
      opportunityIds: ["demo-opp-1"],
      opportunityLabels: ["NDA/MAA CMC Writing. Cortexa Biopharma"],
      contactIds: ["con-sample-1"],
      contactNames: ["Marcus Thorne"],
      attendees: ["Elena Rossi", "Omar Haddad"],
      presenters: ["Omar Haddad"],
      owner: "Elena Rossi",
      createdAt: day(-14),
      completedAt: day(-9),
      completedBy: "Elena Rossi",
      notes: [
        {
          id: "mn-sample-1",
          kind: "brief",
          text: "Walk their CMC lead through how we structure Module 3 and agree who writes what. They have two Phase 2 assets and one EMA filing planned.",
          by: "Elena Rossi",
          at: day(-11),
        },
        {
          id: "mn-sample-2",
          kind: "outcome",
          text: "They will send the current Module 3 draft this week. We take technical writing; they keep regulatory strategy in house. Next: a costed proposal by the 12th.",
          by: "Omar Haddad",
          at: day(-9),
        },
      ],
      docs: [
        {
          id: "md-sample-1",
          label: "CMC writing — approach.pdf",
          addedBy: "Omar Haddad",
          addedAt: day(-9),
        },
      ],
    },
    {
      id: "mtg-sample-2",
      ref: "MTG-0002",
      title: "Helix Biologics — capability demo",
      type: "Capability / demo",
      status: "completed",
      meetingAt: d(-4),
      customerId: "cust-004",
      customer: "Helix Biologics",
      opportunityIds: ["demo-opp-3"],
      opportunityLabels: ["Publishing & Submission. Helix Biologics"],
      contactIds: ["con-sample-2"],
      contactNames: ["Dr. Lena Vogt"],
      attendees: ["Nina Kowalski", "Marcus Chen", "Grace Liu"],
      presenters: ["Nina Kowalski"],
      owner: "Nina Kowalski",
      createdAt: day(-8),
      completedAt: day(-4),
      completedBy: "Nina Kowalski",
      notes: [
        {
          id: "mn-sample-3",
          kind: "transcript",
          text: "[0:02] Nina: thanks for the time — I will keep this to the two things you asked about.\n[4:18] Lena: our bottleneck is the publishing step, not the writing.\n[19:40] Nina: then that is where we would start, and I can show you that today.",
          by: "Nina Kowalski",
          at: day(-4),
        },
        {
          id: "mn-sample-4",
          kind: "comment",
          text: "Lena is the decision maker on tooling; her director signs anything over 100k.",
          by: "Grace Liu",
          at: day(-4),
        },
      ],
      docs: [],
    },
    {
      id: "mtg-sample-3",
      ref: "MTG-0003",
      title: "Aether Medical Devices — EU MDR scoping",
      type: "Discovery",
      status: "planned",
      meetingAt: d(3),
      customerId: "cust-007",
      customer: "Aether Medical Devices",
      opportunityIds: ["demo-opp-4"],
      opportunityLabels: ["EU MDR Technical Files. Aether Medical Devices"],
      contactIds: ["con-sample-3"],
      contactNames: ["Stefan Bauer"],
      attendees: ["Daniel Foster", "Elena Rossi"],
      presenters: ["Daniel Foster"],
      owner: "Daniel Foster",
      createdAt: day(-2),
      notes: [
        {
          id: "mn-sample-5",
          kind: "brief",
          text: "Find out how many devices fall under the new classification and when their notified body slot is. Do not pitch — this one is a listening meeting.",
          by: "Daniel Foster",
          at: day(-2),
        },
      ],
      docs: [],
    },
    {
      id: "mtg-sample-4",
      ref: "MTG-0004",
      title: "Quantum Oncology — quarterly review",
      type: "QBR / review",
      status: "planned",
      meetingAt: d(11),
      customerId: "cust-009",
      customer: "Quantum Oncology",
      opportunityIds: ["demo-opp-5"],
      opportunityLabels: ["Clinical Trial Applications. Quantum Oncology"],
      contactIds: ["con-sample-4"],
      contactNames: ["Dr. Arthur Pennington"],
      attendees: ["Grace Liu", "Marcus Chen"],
      presenters: ["Grace Liu"],
      owner: "Grace Liu",
      createdAt: day(-1),
      notes: [],
      docs: [],
    },
    {
      id: "mtg-sample-5",
      ref: "MTG-0005",
      title: "Orion Vaccines — introductory call",
      type: "Introductory",
      status: "planned",
      meetingAt: d(6),
      customerId: "cust-012",
      customer: "Orion Vaccines",
      opportunityIds: ["demo-opp-9"],
      opportunityLabels: ["Regulatory Strategy. Orion Vaccines"],
      contactIds: ["con-sample-5"],
      contactNames: ["Dr. Hana Kim"],
      attendees: ["Marcus Chen"],
      presenters: [],
      owner: "Marcus Chen",
      createdAt: day(-1),
      notes: [],
      docs: [],
    },
  ];

  return { meetings };
}
