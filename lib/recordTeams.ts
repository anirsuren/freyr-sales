import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";
import { mockFillRecordTeams } from "./mockFillLife";

/**
 * WHO OWNS A RECORD, AND WHO ELSE IS ON IT.
 *
 * Suren, Aug 28, writing "Owner, Team" into the Team column of every row on
 * his grid, and saying it out loud for the customer page: "in the team I
 * should know who's the OWNER, and then if there are other people that would
 * be one — owner is one and then there should be other people is a team. Some
 * people will have an owner privilege on this customer, or team."
 *
 * So it is two facts per record, not one: exactly one owner, and any number of
 * team members beside them. Every row on his grid carries it — a customer, a
 * contract, an offering, an opportunity, a submission, a presentation — which
 * is why it lives here once rather than as a column added six times.
 *
 * WHY IT IS NOT A COLUMN ON EACH TABLE. Customers and contacts are Postgres
 * tables; opportunities, contracts, offerings and solutioning are JSON rows.
 * Adding a field to all of them means one migration and five schema edits to
 * store the same two facts. One keyed store answers "who is on this thing" for
 * anything with an id, and a record that has never been assigned simply has no
 * entry — which is different from having an empty team, and reads differently
 * on the page.
 *
 * THIS DOES NOT GRANT ANYTHING. It records who is on a record; it is not a
 * permission and nothing reads it to decide what somebody may open. Access is
 * lib/moduleAccess and stays there.
 */

const ROW_ID = "record-teams";

/** The record types his grid puts a Team column against. */
export type TeamedRecord =
  | "customer"
  | "contract"
  | "offering"
  | "opportunity"
  | "submission"
  | "presentation"
  | "solutionRequest"
  | "meeting";

export type RecordTeam = {
  /** Exactly one, or nobody yet. */
  owner?: string;
  /** Everyone else on it, owner not repeated here. */
  members: string[];
  updatedBy?: string;
  updatedAt?: string;
};

export type RecordTeamsState = { teams: Record<string, RecordTeam> };

export const EMPTY_RECORD_TEAMS: RecordTeamsState = { teams: {} };

/** "customer:cust-003" — one namespace, so ids never collide across types. */
export function teamKey(type: TeamedRecord, id: string): string {
  return `${type}:${id}`;
}

/* --------------------------------------------------------------- storage */

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_RECORD_TEAMS_QUEUE__: Promise<void> | undefined;
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

function strList(v: unknown, max: number, cap = 200): string[] {
  return Array.isArray(v)
    ? [...new Set(v.map((x) => str(String(x ?? ""), max)).filter(Boolean))].slice(0, cap)
    : [];
}

async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_RECORD_TEAMS_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_RECORD_TEAMS_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function normalize(v: unknown): RecordTeamsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_RECORD_TEAMS);
  const rows = (v as { teams?: Record<string, unknown> }).teams;
  const teams: Record<string, RecordTeam> = {};
  if (rows && typeof rows === "object") {
    for (const [key, raw] of Object.entries(rows)) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      const owner = str(t.owner, 80) || undefined;
      /* The owner is never also listed as a member: one person, one place. */
      const members = strList(t.members, 80).filter(
        (m) => m.toLowerCase() !== (owner ?? "").toLowerCase()
      );
      if (!owner && members.length === 0) continue;
      teams[key] = {
        owner,
        members,
        updatedBy: str(t.updatedBy, 80) || undefined,
        updatedAt: str(t.updatedAt, 40) || undefined,
      };
    }
  }
  return { teams };
}

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

async function writeRow(state: RecordTeamsState): Promise<void> {
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
 * THE MOCK ACCOUNTS GET A NAMED OWNER AND TEAM, ONCE.
 *
 * The Team tab on a generated account said "Nothing on team for Isolde Bio
 * yet" (Anir, Sep 2), because nothing had ever been assigned to one and this
 * store had no mock samples at all. It has some now.
 *
 * Appended rather than replacing, and laid down ONCE: an entry somebody
 * cleared in mock has to stay cleared, so the presence of the generated keys
 * is what stops it running again.
 *
 * Mock only, twice over: the caller checks the mode and the generator itself
 * answers with nothing outside it.
 */
async function topUpMockFill(): Promise<RecordTeamsState> {
  return withWrite(async () => {
    const base = normalize(await readRowRaw().catch(() => null));
    if (Object.keys(base.teams).some((k) => k.includes("fill-"))) return base;
    const generated = mockFillRecordTeams();
    if (Object.keys(generated).length === 0) return base;
    /* Anything already stored wins, so this can only ever fill in blanks. */
    const next: RecordTeamsState = { teams: { ...generated, ...base.teams } };
    await writeRow(next).catch(() => undefined);
    return next;
  });
}

export async function readRecordTeams(): Promise<RecordTeamsState> {
  const state = await readRowRaw()
    .then(normalize)
    .catch(() => structuredClone(EMPTY_RECORD_TEAMS));
  if (getDataMode() !== "mock") return state;
  if (Object.keys(state.teams).some((k) => k.includes("fill-"))) return state;
  return topUpMockFill().catch(() => state);
}

/** Set both facts at once — the dialog always sends the whole picture. */
export async function setRecordTeam(input: {
  type: TeamedRecord;
  id: string;
  owner?: string;
  members?: string[];
  by: string;
}): Promise<RecordTeamsState> {
  return withWrite(async () => {
    const state = normalize(await readRowRaw());
    const key = teamKey(input.type, str(input.id, 80));
    const owner = str(input.owner, 80) || undefined;
    const members = strList(input.members, 80).filter(
      (m) => m.toLowerCase() !== (owner ?? "").toLowerCase()
    );
    if (!owner && members.length === 0) {
      /* Clearing it removes the entry rather than storing an empty one, so
         "never assigned" and "assigned to nobody" stay the same thing. */
      delete state.teams[key];
    } else {
      state.teams[key] = {
        owner,
        members,
        updatedBy: str(input.by, 80) || undefined,
        updatedAt: new Date().toISOString(),
      };
    }
    await writeRow(state);
    return state;
  });
}

/** What was assigned to one record, or nothing. */
export function teamFor(
  state: RecordTeamsState,
  type: TeamedRecord,
  id: string
): RecordTeam | null {
  return state.teams[teamKey(type, id)] ?? null;
}

/** Every record of one type a person is on, as ids — for their own page. */
export function recordsForPerson(
  state: RecordTeamsState,
  type: TeamedRecord,
  name: string
): { owned: string[]; member: string[] } {
  const is = (x?: string) =>
    (x ?? "").trim().toLowerCase() === name.trim().toLowerCase();
  const owned: string[] = [];
  const member: string[] = [];
  for (const [key, team] of Object.entries(state.teams)) {
    if (!key.startsWith(`${type}:`)) continue;
    const id = key.slice(type.length + 1);
    if (is(team.owner)) owned.push(id);
    else if (team.members.some(is)) member.push(id);
  }
  return { owned, member };
}
