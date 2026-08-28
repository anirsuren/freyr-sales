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
  /** "as part of a meeting you can ask for materials needed by" */
  materialsBy?: string;

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
    materialsBy: str(m.materialsBy, 20) || undefined,
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

export async function readMeetings(): Promise<MeetingsState> {
  return readRow();
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
  materialsBy?: string;
  customerId?: string;
  customer: string;
  opportunityIds?: string[];
  opportunityLabels?: string[];
  contactIds?: string[];
  contactNames?: string[];
  attendees?: string[];
  presenters?: string[];
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
      materialsBy: str(input.materialsBy, 20) || undefined,
      customerId: str(input.customerId, 60) || undefined,
      customer,
      opportunityIds: strList(input.opportunityIds, 60),
      opportunityLabels: strList(input.opportunityLabels, 200),
      contactIds: strList(input.contactIds, 60),
      contactNames: strList(input.contactNames, 120),
      attendees: strList(input.attendees, 80),
      presenters: strList(input.presenters, 80),
      /* "a meeting owner, who is the guy who created the meeting" */
      owner: str(input.by, 80) || "Unknown",
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
    if (p.materialsBy !== undefined)
      m.materialsBy = str(p.materialsBy, 20) || undefined;
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
