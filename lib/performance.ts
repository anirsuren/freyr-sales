import { isCurrencyCode, normalizeRates, type CurrencyCode } from "./currency";
import { getDataMode } from "./dataMode";
import {
  DEFAULT_GOAL_TYPES,
  EMPTY_PERFORMANCE,
  type GoalMeasure,
  type GoalUnit,
  type PerfActual,
  type PerfGroup,
  type PerformanceState,
  type PrimaryGoal,
  type Subgoal,
  type SubgoalPerson,
  canVerifyEntry,
} from "./performanceShared";

/**
 * PERFORMANCE MANAGEMENT — storage and operations.
 *
 * Storage: one row in the offering_catalog_state document table (id text pk +
 * jsonb), keyed "performance-management". Real mode only — mock serves the
 * sample dataset below so the showroom always looks full, and samples can
 * never leak into the live row. Same pattern as the competition store.
 */

const ROW_ID = "performance-management";

/** Mock and Real live in SEPARATE rows, like every other store: a mock edit
 *  can never reach real numbers, and Mock always has its own full world
 *  (Anir, Aug 13: "everything should be fake data, and don't affect real
 *  mode at all"). Outside a request (scripts, boot) this resolves to Real,
 *  which is the safe default. */
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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizePerson(v: unknown): SubgoalPerson | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Partial<SubgoalPerson>;
  const name = str(raw.name, 80);
  if (!name) return null;
  return { name, target: num(raw.target), verified: raw.verified === true };
}

function normalizeSubgoal(v: unknown): Subgoal | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Partial<Subgoal>;
  const id = str(raw.id, 60);
  const name = str(raw.name, 140);
  if (!id || !name) return null;
  return {
    id,
    name,
    target: num(raw.target),
    owners: Array.isArray(raw.owners)
      ? raw.owners.map((o) => str(o, 80)).filter(Boolean)
      : [],
    verified: raw.verified === true,
    people: Array.isArray(raw.people)
      ? raw.people
          .map(normalizePerson)
          .filter((p): p is SubgoalPerson => p !== null)
      : [],
  };
}

function normalizeGoal(v: unknown): PrimaryGoal | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Partial<PrimaryGoal>;
  const id = str(raw.id, 60);
  const name = str(raw.name, 160);
  if (!id || !name) return null;
  const unit: GoalUnit =
    raw.unit === "currency" || raw.unit === "percent" ? raw.unit : "count";
  const measure: GoalMeasure = raw.measure === "level" ? "level" : "total";
  const year =
    typeof raw.year === "number" && raw.year >= 2024 && raw.year <= 2040
      ? Math.round(raw.year)
      : new Date().getFullYear();
  return {
    id,
    name,
    type: str(raw.type, 80) || DEFAULT_GOAL_TYPES[0],
    unit,
    // NAMED, OR DELETED BY THE NEXT WRITE.
    currency: isCurrencyCode(raw.currency)
      ? (String(raw.currency).toUpperCase() as CurrencyCode)
      : undefined,
    measure,
    year,
    target: num(raw.target),
    pickedForOrg: raw.pickedForOrg === true,
    verified: raw.verified === true,
    subgoals: Array.isArray(raw.subgoals)
      ? raw.subgoals
          .map(normalizeSubgoal)
          .filter((s): s is Subgoal => s !== null)
      : [],
    assignments: Array.isArray(raw.assignments)
      ? raw.assignments
          .map((a) => {
            if (!a || typeof a !== "object") return null;
            const r = a as Partial<import("./performanceShared").GoalAssignment>;
            const person = str(r.person, 80);
            if (!person) return null;
            return {
              person,
              target: num(r.target),
              verified: r.verified === true,
              assignedBy: str(r.assignedBy, 80) || "unknown",
              assignedAt:
                typeof r.assignedAt === "string" ? r.assignedAt : new Date().toISOString(),
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
      : [],
    // NAMED HERE OR IT DIES. Same round-trip trap as the note below: a group
    // assignment that this function does not rebuild is gone on the next
    // write of the row.
    groupAssignments: Array.isArray(raw.groupAssignments)
      ? raw.groupAssignments
          .map((a) => {
            if (!a || typeof a !== "object") return null;
            const r = a as Partial<
              import("./performanceShared").GoalGroupAssignment
            >;
            const groupId = str(r.groupId, 60);
            if (!groupId) return null;
            return {
              groupId,
              target: num(r.target),
              verified: r.verified === true,
              // NAMED, OR SILENTLY DROPPED. A field this normalizer does not
              // list is deleted by the next write.
              excludedPeople: Array.isArray(r.excludedPeople)
                ? (r.excludedPeople as unknown[])
                    .map((n) => str(String(n ?? ""), 80))
                    .filter(Boolean)
                : undefined,
              assignedBy: str(r.assignedBy, 80) || "unknown",
              assignedAt:
                typeof r.assignedAt === "string"
                  ? r.assignedAt
                  : new Date().toISOString(),
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
      : [],
    // The round-trip trap: this normalizer rebuilds the object field by
    // field, so any field it does not carry is silently DELETED on the next
    // write. The first booking-family seed died exactly that way.
    componentGoalIds: Array.isArray(raw.componentGoalIds)
      ? raw.componentGoalIds.map((c) => str(c, 60)).filter(Boolean)
      : undefined,
    cadences: Array.isArray(raw.cadences)
      ? (raw.cadences.filter((c) =>
          ["weekly", "monthly", "quarterly", "yearly"].includes(c as string)
        ) as PrimaryGoal["cadences"])
      : undefined,
    createdBy: str(raw.createdBy, 80) || "Unknown",
    createdAt: str(raw.createdAt, 40) || new Date().toISOString(),
  };
}

function normalize(value: unknown): PerformanceState {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_PERFORMANCE);
  const raw = value as Partial<PerformanceState>;
  const types = Array.isArray(raw.types)
    ? [...new Set(raw.types.map((t) => str(t, 80)).filter(Boolean))]
    : [];
  const groups: PerfGroup[] = Array.isArray(raw.groups)
    ? raw.groups.flatMap((g) => {
        if (!g || typeof g !== "object") return [];
        const rg = g as Partial<PerfGroup>;
        const id = str(rg.id, 60);
        const name = str(rg.name, 100);
        if (!id || !name) return [];
        return [
          {
            id,
            name,
            head: str(rg.head, 80),
            members: Array.isArray(rg.members)
              ? [...new Set(rg.members.map((m) => str(m, 80)).filter(Boolean))]
              : [],
            createdBy: str(rg.createdBy, 80) || "Unknown",
            createdAt: str(rg.createdAt, 40) || new Date().toISOString(),
          },
        ];
      })
    : [];
  const rates = normalizeRates((raw as { rates?: unknown }).rates);
  const actuals: PerfActual[] = Array.isArray(raw.actuals)
    ? raw.actuals.flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const ra = a as Partial<PerfActual>;
        const id = str(ra.id, 60);
        const goalId = str(ra.goalId, 60);
        const person = str(ra.person, 80);
        if (!id || !goalId || !person) return [];
        const amount =
          typeof ra.amount === "number" && Number.isFinite(ra.amount)
            ? ra.amount
            : 0;
        return [
          {
            id,
            goalId,
            subgoalId: ra.subgoalId ? str(ra.subgoalId, 60) : null,
            person,
            amount,
            date: str(ra.date, 40) || new Date().toISOString().slice(0, 10),
            // Same trap as every other field here: written on the way in and
            // silently dropped on the way out until it is named.
            currency: isCurrencyCode(ra.currency)
              ? (String(ra.currency).toUpperCase() as CurrencyCode)
              : undefined,
            note: ra.note ? str(ra.note, 400) : undefined,
            customer: ra.customer ? str(ra.customer, 160) : undefined,
            // Carried explicitly: a field this normalizer does not name is
            // dropped the next time anything writes this row.
            customerId: ra.customerId ? str(ra.customerId, 60) : undefined,
            dealId: ra.dealId ? str(ra.dealId, 80) : undefined,
            dealLabel: ra.dealLabel ? str(ra.dealLabel, 160) : undefined,
            evidence: Array.isArray(ra.evidence)
              ? ra.evidence
                  .map((e) => ({
                    name: str((e as { name?: string })?.name ?? "", 120),
                    url: str((e as { url?: string })?.url ?? "", 500),
                  }))
                  .filter((e) => e.name && e.url)
                  .slice(0, 5)
              : undefined,
            status:
              ra.status === "reported" || ra.status === "verified"
                ? ra.status
                : undefined,
            verifiedBy: ra.verifiedBy ? str(ra.verifiedBy, 80) : undefined,
            verifiedAt: ra.verifiedAt ? str(ra.verifiedAt, 40) : undefined,
            managerNote: ra.managerNote ? str(ra.managerNote, 300) : undefined,
            addedBy: str(ra.addedBy, 80) || person,
            addedAt: str(ra.addedAt, 40) || new Date().toISOString(),
          },
        ];
      })
    : [];
  return {
    types: types.length ? types : [...DEFAULT_GOAL_TYPES],
    goals: Array.isArray(raw.goals)
      ? raw.goals.map(normalizeGoal).filter((g): g is PrimaryGoal => g !== null)
      : [],
    groups,
    actuals,
    rates,
  };
}

async function readRow(): Promise<PerformanceState> {
  if (!hasDatabase()) return structuredClone(EMPTY_PERFORMANCE);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(stateValue: PerformanceState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: stateValue,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export async function readPerformance(): Promise<PerformanceState> {
  if (getDataMode() !== "live") return samplePerformance();
  return readRow().catch(() => structuredClone(EMPTY_PERFORMANCE));
}

/* ------------------------------------------------------------------- ops */

export async function addGoalType(name: string): Promise<void> {
  const clean = str(name, 80);
  if (!clean) throw new Error("Give the goal type a name.");
  const state = await readRow();
  if (state.types.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
  state.types.push(clean);
  await writeRow(state);
}

export async function addGoal(input: {
  name: string;
  type: string;
  unit: GoalUnit;
  measure: GoalMeasure;
  year: number;
  target: number;
  pickedForOrg: boolean;
  addedBy: string;
}): Promise<PrimaryGoal> {
  const name = str(input.name, 160);
  if (!name) throw new Error("Give the goal a name.");
  const state = await readRow();
  if (state.goals.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`"${name}" is already on the goal master.`);
  }
  const type = str(input.type, 80) || state.types[0] || DEFAULT_GOAL_TYPES[0];
  if (!state.types.some((t) => t.toLowerCase() === type.toLowerCase())) {
    state.types.push(type);
  }
  const goal: PrimaryGoal = {
    id: uid("pg"),
    name,
    type,
    unit: input.unit,
    measure: input.measure,
    year: input.year,
    target: num(input.target),
    pickedForOrg: input.pickedForOrg === true,
    verified: false,
    subgoals: [],
    createdBy: input.addedBy,
    createdAt: new Date().toISOString(),
  };
  state.goals.push(goal);
  await writeRow(state);
  return goal;
}

export async function updateGoal(
  goalId: string,
  patch: Partial<
    Pick<
      PrimaryGoal,
      "name" | "type" | "unit" | "measure" | "year" | "target" | "pickedForOrg"
    >
  >
): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  if (patch.name !== undefined) {
    const name = str(patch.name, 160);
    if (!name) throw new Error("A goal needs a name.");
    goal.name = name;
  }
  if (patch.type !== undefined) {
    const type = str(patch.type, 80);
    if (type) {
      goal.type = type;
      if (!state.types.some((t) => t.toLowerCase() === type.toLowerCase())) {
        state.types.push(type);
      }
    }
  }
  if (patch.unit !== undefined) goal.unit = patch.unit;
  if (patch.measure !== undefined) goal.measure = patch.measure;
  if (patch.year !== undefined && patch.year >= 2024 && patch.year <= 2040) {
    goal.year = Math.round(patch.year);
  }
  if (patch.target !== undefined) goal.target = num(patch.target);
  if (patch.pickedForOrg !== undefined) {
    goal.pickedForOrg = patch.pickedForOrg === true;
  }
  await writeRow(state);
}

export async function removeGoal(goalId: string): Promise<void> {
  const state = await readRow();
  state.goals = state.goals.filter((g) => g.id !== goalId);
  state.actuals = state.actuals.filter((a) => a.goalId !== goalId);
  await writeRow(state);
}

export async function addSubgoal(input: {
  goalId: string;
  name: string;
  target: number;
  owners: string[];
  people: { name: string; target: number }[];
}): Promise<Subgoal> {
  const name = str(input.name, 140);
  if (!name) throw new Error("Give the subgoal a name.");
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  if (goal.subgoals.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`"${name}" is already a subgoal here.`);
  }
  const sub: Subgoal = {
    id: uid("sg"),
    name,
    target: num(input.target),
    owners: [...new Set(input.owners.map((o) => str(o, 80)).filter(Boolean))],
    verified: false,
    people: input.people
      .map((p) => ({ name: str(p.name, 80), target: num(p.target), verified: false }))
      .filter((p) => p.name),
  };
  goal.subgoals.push(sub);
  await writeRow(state);
  return sub;
}

export async function updateSubgoal(input: {
  goalId: string;
  subgoalId: string;
  name?: string;
  target?: number;
  owners?: string[];
  people?: { name: string; target: number; verified?: boolean }[];
}): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  const sub = goal?.subgoals.find((s) => s.id === input.subgoalId);
  if (!goal || !sub) throw new Error("That subgoal is gone. Refresh and retry.");
  if (input.name !== undefined) {
    const name = str(input.name, 140);
    if (!name) throw new Error("A subgoal needs a name.");
    sub.name = name;
  }
  if (input.target !== undefined) sub.target = num(input.target);
  if (input.owners !== undefined) {
    sub.owners = [...new Set(input.owners.map((o) => str(o, 80)).filter(Boolean))];
  }
  if (input.people !== undefined) {
    const prev = new Map(sub.people.map((p) => [p.name.toLowerCase(), p]));
    sub.people = input.people
      .map((p) => {
        const name = str(p.name, 80);
        return {
          name,
          target: num(p.target),
          verified:
            p.verified !== undefined
              ? p.verified === true
              : (prev.get(name.toLowerCase())?.verified ?? false),
        };
      })
      .filter((p) => p.name);
  }
  await writeRow(state);
}

export async function removeSubgoal(
  goalId: string,
  subgoalId: string
): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  goal.subgoals = goal.subgoals.filter((s) => s.id !== subgoalId);
  state.actuals = state.actuals.filter(
    (a) => !(a.goalId === goalId && a.subgoalId === subgoalId)
  );
  await writeRow(state);
}

export async function setVerified(input: {
  goalId: string;
  subgoalId?: string;
  person?: string;
  verified: boolean;
}): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  const flag = input.verified === true;
  if (!input.subgoalId) {
    if (input.person) {
      const assignment = (goal.assignments ?? []).find(
        (a) => a.person === input.person
      );
      if (!assignment) throw new Error("That person isn't assigned this goal.");
      assignment.verified = flag;
    } else {
      goal.verified = flag;
    }
  } else {
    const sub = goal.subgoals.find((s) => s.id === input.subgoalId);
    if (!sub) throw new Error("That subgoal is gone. Refresh and retry.");
    if (!input.person) {
      sub.verified = flag;
    } else {
      const person = sub.people.find((p) => p.name === input.person);
      if (!person) throw new Error("That person isn't on this subgoal.");
      person.verified = flag;
    }
  }
  await writeRow(state);
}

export async function logActual(input: {
  goalId: string;
  subgoalId?: string | null;
  person: string;
  amount: number;
  date?: string;
  note?: string;
  customer?: string;
  customerId?: string;
  dealId?: string;
  dealLabel?: string;
  evidence?: { name?: unknown; url?: unknown }[];
  /** What it was signed in. Stored as recorded; never converted on the way in. */
  currency?: string;
  addedBy: string;
}): Promise<PerfActual> {
  const person = str(input.person, 80);
  if (!person) throw new Error("Whose number is this? Pick a person.");
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? input.amount
      : NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("The amount needs to be a number, zero or more.");
  }
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  if ((goal.componentGoalIds?.length ?? 0) > 0) {
    // Composite goals are only ever a sum (Suren, Aug 13: "people enter only
    // the sub-level, and people do not enter the main level").
    throw new Error(
      "Nobody logs on this goal directly — it adds up from its components. Log the result on the right component."
    );
  }
  let subgoalId: string | null = null;
  if (input.subgoalId) {
    const sub = goal.subgoals.find((s) => s.id === input.subgoalId);
    if (!sub) throw new Error("That subgoal is gone. Refresh and retry.");
    subgoalId = sub.id;
  } else if (
    goal.subgoals.length > 0 &&
    !(goal.assignments ?? []).some((a) => a.person === person)
  ) {
    // Directly-assigned people log on the goal itself even when subgoals
    // exist for other teams (Suren, Aug 12: person-level attaches).
    throw new Error("Pick which subgoal this number belongs to.");
  }
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")
    ? (input.date as string)
    : new Date().toISOString().slice(0, 10);
  const evidence = (input.evidence ?? [])
    .map((e) => ({
      name: str(String(e?.name ?? ""), 120),
      url: str(String(e?.url ?? ""), 500),
    }))
    .filter((e) => e.name && /^(https?:\/\/|\/api\/)/.test(e.url))
    .slice(0, 5);
  const actual: PerfActual = {
    id: uid("pa"),
    goalId: goal.id,
    subgoalId,
    person,
    amount,
    date: dateIso,
    currency: isCurrencyCode(input.currency)
      ? (String(input.currency).toUpperCase() as CurrencyCode)
      : undefined,
    note: input.note ? str(input.note, 400) : undefined,
    customer: input.customer ? str(input.customer, 160) : undefined,
    customerId: input.customerId ? str(input.customerId, 60) : undefined,
    dealId: input.dealId ? str(input.dealId, 80) : undefined,
    dealLabel: input.dealLabel ? str(input.dealLabel, 160) : undefined,
    evidence: evidence.length ? evidence : undefined,
    // Everything logged now waits for its group owner. Legacy entries with no
    // status keep counting as verified so history does not move.
    status: "reported",
    addedBy: input.addedBy,
    addedAt: new Date().toISOString(),
  };
  state.actuals.push(actual);
  await writeRow(state);
  return actual;
}

/**
 * FIX A CLAIM WITHOUT LOSING IT (Anir, Aug 15).
 *
 * Until now a wrong amount, date or customer meant delete and re-enter, which
 * threw away the evidence upload with it. Same lock rule as removeActual: once
 * a group owner has verified it, the owner sends it back before anything can
 * change. Only the fields a person can get wrong are editable; who logged it,
 * which goal it belongs to and its status are not.
 */
export async function updateActual(input: {
  actualId: string;
  amount?: number;
  date?: string;
  note?: string;
  customer?: string;
  customerId?: string;
  dealId?: string;
  dealLabel?: string;
  by: string;
}): Promise<void> {
  const state = await readRow();
  const entry = state.actuals.find((a) => a.id === input.actualId);
  if (!entry) throw new Error("That entry is gone. Refresh and retry.");
  if ((entry.status ?? "verified") === "verified" && entry.verifiedBy) {
    throw new Error(
      "This entry is verified and locked. The group owner has to send it back before it can change."
    );
  }
  // Yours to fix, or your group's to fix on your behalf.
  const mine =
    entry.person.trim().toLowerCase() === input.by.trim().toLowerCase() ||
    entry.addedBy.trim().toLowerCase() === input.by.trim().toLowerCase();
  if (!mine && !canVerifyEntry(state, input.by, entry.person)) {
    throw new Error("Only the person who logged this, or their group owner, can change it.");
  }
  if (typeof input.amount === "number" && Number.isFinite(input.amount)) {
    entry.amount = input.amount;
  }
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) entry.date = input.date;
  if (input.note !== undefined) {
    entry.note = input.note ? str(input.note, 400) : undefined;
  }
  if (input.customer !== undefined) {
    entry.customer = input.customer ? str(input.customer, 160) : undefined;
    entry.customerId = input.customerId ? str(input.customerId, 60) : undefined;
  }
  if (input.dealLabel !== undefined) {
    entry.dealLabel = input.dealLabel ? str(input.dealLabel, 160) : undefined;
    entry.dealId = input.dealId ? str(input.dealId, 80) : undefined;
  }
  await writeRow(state);
}

/**
 * TAKE ONE PERSON OFF A GROUP'S GOAL, or put them back.
 *
 * They keep their place in the group; this only says whether this particular
 * goal is theirs. Without the exception list, removing them worked until the
 * next time anything touched the group assignment, which re-attached everyone.
 */
export async function setGroupGoalExclusion(input: {
  goalId: string;
  groupId: string;
  person: string;
  excluded: boolean;
}): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  const assignment = (goal.groupAssignments ?? []).find(
    (a) => a.groupId === input.groupId
  );
  if (!assignment) throw new Error("That group does not carry this goal.");
  const person = str(input.person, 80);
  if (!person) throw new Error("Name that person.");
  const key = person.trim().toLowerCase();
  const list = (assignment.excludedPeople ?? []).filter(
    (n) => n.trim().toLowerCase() !== key
  );
  if (input.excluded) {
    list.push(person);
    // Off the goal means off its people list too, so nothing rolls up for them
    // and their name stops appearing on the goal's screens.
    goal.assignments = (goal.assignments ?? []).filter(
      (a) => a.person.trim().toLowerCase() !== key
    );
  } else {
    goal.assignments = goal.assignments ?? [];
    if (!goal.assignments.some((a) => a.person.trim().toLowerCase() === key)) {
      goal.assignments.push({
        person,
        target: 0,
        verified: false,
        assignedBy: "group",
        assignedAt: new Date().toISOString(),
      });
    }
  }
  assignment.excludedPeople = list.length ? list : undefined;
  await writeRow(state);
}

export async function removeActual(actualId: string): Promise<void> {
  const state = await readRow();
  const entry = state.actuals.find((a) => a.id === actualId);
  if (entry && (entry.status ?? "verified") === "verified" && entry.verifiedBy) {
    // Verified means LOCKED (Suren, Aug 13: "once she verifies and then locks
    // it, that's all"). The group owner sends it back first if it is wrong.
    throw new Error(
      "This entry is verified and locked. The group owner has to send it back before it can change."
    );
  }
  state.actuals = state.actuals.filter((a) => a.id !== actualId);
  await writeRow(state);
}

/** Group-owner sign-off: checks the evidence, locks the entry, and from that
 *  moment the amount is what rolls up. Only a head of a group the person
 *  belongs to may do this — enforced again at the API layer with the signed-in
 *  identity. */
export async function verifyActual(input: {
  actualId: string;
  by: string;
}): Promise<void> {
  const state = await readRow();
  const entry = state.actuals.find((a) => a.id === input.actualId);
  if (!entry) throw new Error("That entry is gone. Refresh and retry.");
  if (!canVerifyEntry(state, input.by, entry.person)) {
    throw new Error("Only the group owner for this person can verify their numbers.");
  }
  entry.status = "verified";
  entry.verifiedBy = input.by;
  entry.verifiedAt = new Date().toISOString();
  entry.managerNote = undefined;
  await writeRow(state);
}

/** The other verdict: return the claim with a note, editable again. Also the
 *  only way to unlock a wrongly-verified entry. */
export async function sendBackActual(input: {
  actualId: string;
  by: string;
  note?: string;
}): Promise<void> {
  const state = await readRow();
  const entry = state.actuals.find((a) => a.id === input.actualId);
  if (!entry) throw new Error("That entry is gone. Refresh and retry.");
  if (!canVerifyEntry(state, input.by, entry.person)) {
    throw new Error("Only the group owner for this person can send their numbers back.");
  }
  entry.status = "reported";
  entry.verifiedBy = undefined;
  entry.verifiedAt = undefined;
  entry.managerNote = input.note ? str(input.note, 300) : undefined;
  await writeRow(state);
}

export async function addGroup(input: {
  name: string;
  head: string;
  members: string[];
  addedBy: string;
}): Promise<PerfGroup> {
  const name = str(input.name, 100);
  if (!name) throw new Error("Give the group a name.");
  const state = await readRow();
  if (state.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`A group called "${name}" already exists.`);
  }
  const members = [
    ...new Set(
      [input.head, ...input.members].map((m) => str(m, 80)).filter(Boolean)
    ),
  ];
  if (members.length === 0) throw new Error("Add at least one person.");
  const group: PerfGroup = {
    id: uid("gr"),
    name,
    head: str(input.head, 80) || members[0],
    members,
    createdBy: input.addedBy,
    createdAt: new Date().toISOString(),
  };
  state.groups.push(group);
  await writeRow(state);
  return group;
}

/** Attach a goal straight to a person (Suren, Aug 12: from the Goal Master,
 *  "add to the org or add to a particular person"). */
export async function assignGoal(input: {
  goalId: string;
  person: string;
  target?: number;
  addedBy: string;
}): Promise<void> {
  const person = str(input.person, 80);
  if (!person) throw new Error("Pick who this goal is for.");
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  goal.assignments = goal.assignments ?? [];
  const existing = goal.assignments.find((a) => a.person === person);
  if (existing) {
    if (typeof input.target === "number" && Number.isFinite(input.target)) {
      existing.target = Math.max(0, input.target);
    }
  } else {
    goal.assignments.push({
      person,
      target:
        typeof input.target === "number" && Number.isFinite(input.target)
          ? Math.max(0, input.target)
          : 0,
      verified: false,
      assignedBy: input.addedBy,
      assignedAt: new Date().toISOString(),
    });
  }
  await writeRow(state);
}

/**
 * GIVE A GOAL TO A GROUP (Suren, via Anir on Aug 15: assignment has to exist at
 * organization, group AND person level, and only the person level did).
 *
 * The group's target lives here; its people keep their own on `assignments`.
 * Neither is forced to match the other — the screens reconcile them the way
 * they already do for a subgoal and its people.
 */
export async function assignGoalToGroup(input: {
  goalId: string;
  groupId: string;
  target?: number;
  addedBy: string;
}): Promise<void> {
  const groupId = str(input.groupId, 60);
  if (!groupId) throw new Error("Pick which group this goal is for.");
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  if (!state.groups.some((g) => g.id === groupId))
    throw new Error("That group is gone. Refresh and retry.");
  goal.groupAssignments = goal.groupAssignments ?? [];
  const existing = goal.groupAssignments.find((a) => a.groupId === groupId);
  if (existing) {
    if (typeof input.target === "number" && Number.isFinite(input.target)) {
      existing.target = Math.max(0, input.target);
    }
  } else {
    goal.groupAssignments.push({
      groupId,
      target:
        typeof input.target === "number" && Number.isFinite(input.target)
          ? Math.max(0, input.target)
          : 0,
      verified: false,
      assignedBy: input.addedBy,
      assignedAt: new Date().toISOString(),
    });
  }

  /**
   * THE GROUP'S PEOPLE COME WITH IT (Anir, Aug 15: "shouldn't it automatically
   * assign those people?").
   *
   * Yes — otherwise handing a goal to a department changes nothing for the
   * people who have to deliver it: they would not see it on their own screen
   * and could not log against it. Suren's rule needs them attached, because a
   * group's number is only ever its people's added up.
   *
   * Each arrives on 0, never a share invented by dividing the group target:
   * splitting it is leadership's call, and a made-up number would read as a
   * real one. Anyone already assigned is left exactly as they are, so this can
   * never overwrite a target somebody set by hand.
   */
  const group = state.groups.find((g) => g.id === groupId);
  if (group) {
    goal.assignments = goal.assignments ?? [];
    const roster = [group.head, ...group.members]
      .map((m) => m.trim())
      .filter(Boolean);
    const off = new Set(
      (
        goal.groupAssignments.find((a) => a.groupId === groupId)?.excludedPeople ?? []
      ).map((n) => n.trim().toLowerCase())
    );
    for (const person of new Set(roster)) {
      // Somebody taken off this goal stays off it, however often the group is
      // re-saved.
      if (off.has(person.trim().toLowerCase())) continue;
      if (goal.assignments.some((a) => a.person === person)) continue;
      goal.assignments.push({
        person,
        target: 0,
        verified: false,
        assignedBy: input.addedBy,
        assignedAt: new Date().toISOString(),
      });
    }
  }
  await writeRow(state);
}

export async function unassignGoalFromGroup(input: {
  goalId: string;
  groupId: string;
}): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  goal.groupAssignments = (goal.groupAssignments ?? []).filter(
    (a) => a.groupId !== input.groupId
  );
  await writeRow(state);
}

export async function unassignGoal(input: {
  goalId: string;
  person: string;
}): Promise<void> {
  const state = await readRow();
  const goal = state.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("That goal is gone. Refresh and retry.");
  goal.assignments = (goal.assignments ?? []).filter(
    (a) => a.person !== input.person
  );
  await writeRow(state);
}

/** Edit a group that already exists: rename it, hand it to a new owner, add or
 *  drop people. Without this a group was frozen the moment it was created, and
 *  since verification runs off group membership, a person who joined later had
 *  claims nobody on earth could sign off. */
export async function updateGroup(input: {
  groupId: string;
  name?: string;
  head?: string;
  members?: string[];
}): Promise<PerfGroup> {
  const state = await readRow();
  const group = state.groups.find((g) => g.id === input.groupId);
  if (!group) throw new Error("That group is gone. Refresh and retry.");

  if (input.name !== undefined) {
    const name = str(input.name, 100);
    if (!name) throw new Error("Give the group a name.");
    if (
      state.groups.some(
        (g) => g.id !== group.id && g.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      throw new Error(`A group called "${name}" already exists.`);
    }
    group.name = name;
  }

  const head = input.head !== undefined ? str(input.head, 80) : group.head;
  const listed =
    input.members !== undefined ? input.members : group.members;
  // The owner always belongs to their own group, exactly as when it was created.
  const members = [
    ...new Set([head, ...listed].map((m) => str(m, 80)).filter(Boolean)),
  ];
  if (members.length === 0) throw new Error("Add at least one person.");
  group.head = head || members[0];
  group.members = members;

  await writeRow(state);
  return group;
}

export async function removeGroup(groupId: string): Promise<void> {
  const state = await readRow();
  state.groups = state.groups.filter((g) => g.id !== groupId);
  await writeRow(state);
}

/* ------------------------------------------------- mock showroom dataset */

/**
 * The demo workspace uses Suren's real goal NAMES (from goals.xlsx) with the
 * synthetic sales roster and invented numbers, so the module reads true to
 * life without a single real person's data. Deterministic — same every boot.
 * Never written anywhere.
 */

function lcg(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

const MOCK_YEAR = 2026;

type MockSub = {
  id: string;
  name: string;
  target: number;
  owners: string[];
  people: [string, number][];
  /** Fraction of the subgoal target achieved so far (drives the actuals). */
  pct: number;
  verified?: boolean;
};

type MockGoal = {
  id: string;
  name: string;
  type: string;
  unit: GoalUnit;
  measure: GoalMeasure;
  target: number;
  picked: boolean;
  verified?: boolean;
  subs: MockSub[];
  /** Level goals: monthly reported values instead of accumulating entries. */
  levelSeries?: { person: string; values: number[] };
};

const T = DEFAULT_GOAL_TYPES;

const MOCK_GOALS: MockGoal[] = [
  {
    id: "mock-booked-revenue",
    name: "Booked Revenue (Contract Value Signed)",
    type: T[0],
    unit: "currency",
    measure: "total",
    target: 100_000_000,
    picked: true,
    verified: true,
    subs: [
      {
        id: "mock-br-growth",
        name: "Growth Accounts",
        target: 40_000_000,
        owners: ["Margaret Whitfield"],
        pct: 0.44,
        verified: true,
        people: [
          ["Margaret Whitfield", 8_000_000],
          ["Walter Hensley", 6_400_000],
          ["Eleanor Rutherford", 6_400_000],
          ["Audrey Kingsley", 6_400_000],
          ["Thomas Beckett", 6_400_000],
          ["Grace Lockwood", 6_400_000],
        ],
      },
      {
        id: "mock-br-amr",
        name: "Focused Account AMR",
        target: 35_000_000,
        owners: ["Gordon Ashby"],
        pct: 0.53,
        verified: true,
        people: [
          ["Gordon Ashby", 7_500_000],
          ["Marcus Bramwell", 5_500_000],
          ["Sylvia Ashcroft", 5_500_000],
          ["Nancy Caldwell", 5_500_000],
          ["Oliver Hastings", 5_500_000],
          ["Hannah Schmidt", 5_500_000],
        ],
      },
      {
        id: "mock-br-eua",
        name: "Focused Account EUA",
        target: 25_000_000,
        owners: ["Clara Middleton"],
        pct: 0.48,
        people: [
          ["Clara Middleton", 6_000_000],
          ["Victor Prescott", 4_750_000],
          ["Yvonne Thatcher", 4_750_000],
          ["Leonard Stanton", 4_750_000],
          ["Daniel Foster", 4_750_000],
        ],
      },
    ],
  },
  {
    id: "mock-billed-revenue",
    name: "Billed / Collected Revenue",
    type: T[0],
    unit: "currency",
    measure: "total",
    target: 70_000_000,
    picked: true,
    verified: true,
    subs: [
      {
        id: "mock-bc-amr",
        name: "AMR collections",
        target: 40_000_000,
        owners: ["Sylvia Ashcroft"],
        pct: 0.61,
        people: [
          ["Sylvia Ashcroft", 11_000_000],
          ["Gordon Ashby", 10_000_000],
          ["Marcus Bramwell", 9_500_000],
          ["Nancy Caldwell", 9_500_000],
        ],
      },
      {
        id: "mock-bc-eua",
        name: "EUA collections",
        target: 30_000_000,
        owners: ["Oliver Hastings"],
        pct: 0.55,
        people: [
          ["Oliver Hastings", 8_000_000],
          ["Clara Middleton", 7_500_000],
          ["Victor Prescott", 7_250_000],
          ["Hannah Schmidt", 7_250_000],
        ],
      },
    ],
  },
  {
    id: "mock-winloss",
    name: "Win / Loss Ratio (%)",
    type: T[0],
    unit: "percent",
    measure: "level",
    target: 45,
    picked: true,
    subs: [],
    levelSeries: {
      person: "Mark Miller",
      values: [36, 38, 37, 40, 41, 43, 42, 44],
    },
  },
  {
    id: "mock-mqls",
    name: "Marketing Qualified Leads (MQLs) Generated",
    type: T[1],
    unit: "count",
    measure: "total",
    target: 1200,
    picked: true,
    subs: [
      {
        id: "mock-mql-inbound",
        name: "Inbound campaigns",
        target: 700,
        owners: ["Mark Miller"],
        pct: 0.71,
        verified: true,
        people: [
          ["Mark Miller", 200],
          ["James O'Brien", 180],
          ["Russell Pemberton", 170],
          ["Daniel Foster", 150],
        ],
      },
      {
        id: "mock-mql-outbound",
        name: "Outbound and events",
        target: 500,
        owners: ["Audrey Kingsley"],
        pct: 0.64,
        people: [
          ["Audrey Kingsley", 140],
          ["Thomas Beckett", 130],
          ["Grace Lockwood", 120],
          ["Hannah Schmidt", 110],
        ],
      },
    ],
  },
  {
    id: "mock-linkedin",
    name: "Linkedin Reachouts",
    type: T[1],
    unit: "count",
    measure: "total",
    target: 18_000,
    picked: false,
    subs: [],
  },
  {
    id: "mock-discovery",
    name: "Discovery / Qualification Calls",
    type: T[2],
    unit: "count",
    measure: "total",
    target: 960,
    picked: true,
    subs: [
      {
        id: "mock-disc-amr",
        name: "AMR team",
        target: 560,
        owners: ["Walter Hensley"],
        pct: 0.6,
        people: [
          ["Walter Hensley", 140],
          ["Eleanor Rutherford", 140],
          ["Marcus Bramwell", 140],
          ["Thomas Beckett", 140],
        ],
      },
      {
        id: "mock-disc-eu",
        name: "EU team",
        target: 400,
        owners: ["Nancy Caldwell"],
        pct: 0.55,
        people: [
          ["Nancy Caldwell", 100],
          ["Clara Middleton", 100],
          ["Yvonne Thatcher", 100],
          ["Leonard Stanton", 100],
        ],
      },
    ],
  },
  {
    id: "mock-proposals",
    name: "Proposals / Quotes Sent",
    type: T[3],
    unit: "count",
    measure: "total",
    target: 240,
    picked: true,
    subs: [
      {
        id: "mock-prop-new",
        name: "New business",
        target: 150,
        owners: ["Gordon Ashby"],
        pct: 0.5,
        people: [
          ["Gordon Ashby", 30],
          ["Walter Hensley", 30],
          ["Margaret Whitfield", 30],
          ["Audrey Kingsley", 30],
          ["Victor Prescott", 30],
        ],
      },
      {
        id: "mock-prop-renewal",
        name: "Renewals",
        target: 90,
        owners: ["Yvonne Thatcher"],
        pct: 0.56,
        people: [
          ["Yvonne Thatcher", 30],
          ["Grace Lockwood", 30],
          ["Oliver Hastings", 30],
        ],
      },
    ],
  },
  {
    id: "mock-dealsize",
    name: "Average Deal Size / Contract Value",
    type: T[3],
    unit: "currency",
    measure: "level",
    target: 850_000,
    picked: false,
    subs: [],
    levelSeries: {
      person: "Gordon Ashby",
      values: [
        710_000, 725_000, 700_000, 745_000, 760_000, 790_000, 780_000, 805_000,
      ],
    },
  },
];

const MOCK_GROUPS: [string, string, string, string[]][] = [
  [
    "mock-group-growth",
    "Growth Accounts",
    "Margaret Whitfield",
    [
      "Margaret Whitfield",
      "Walter Hensley",
      "Eleanor Rutherford",
      "Audrey Kingsley",
      "Thomas Beckett",
      "Grace Lockwood",
    ],
  ],
  [
    "mock-group-amr",
    "Focused Accounts AMR",
    "Gordon Ashby",
    [
      "Gordon Ashby",
      "Marcus Bramwell",
      "Sylvia Ashcroft",
      "Nancy Caldwell",
      "Mark Miller",
      "James O'Brien",
      "Russell Pemberton",
    ],
  ],
  [
    "mock-group-eua",
    "Focused Accounts EUA",
    "Clara Middleton",
    [
      "Clara Middleton",
      "Victor Prescott",
      "Yvonne Thatcher",
      "Leonard Stanton",
      "Daniel Foster",
      "Oliver Hastings",
      "Hannah Schmidt",
    ],
  ],
];

let sampleCache: PerformanceState | null = null;

function samplePerformance(): PerformanceState {
  if (sampleCache) return structuredClone(sampleCache);
  const createdAt = `${MOCK_YEAR}-01-05T09:00:00.000Z`;
  const by = "Sample data";
  const goals: PrimaryGoal[] = [];
  const actuals: PerfActual[] = [];

  for (const mock of MOCK_GOALS) {
    goals.push({
      id: mock.id,
      name: mock.name,
      type: mock.type,
      unit: mock.unit,
      measure: mock.measure,
      year: MOCK_YEAR,
      target: mock.target,
      pickedForOrg: mock.picked,
      verified: mock.verified === true,
      createdBy: by,
      createdAt,
      subgoals: mock.subs.map((s) => ({
        id: s.id,
        name: s.name,
        target: s.target,
        owners: s.owners,
        verified: s.verified === true,
        people: s.people.map(([name, target], i) => ({
          name,
          target,
          // Most rows verified, a few pending — mirrors his Y/n column.
          verified: lcg(`${s.id}:${name}:${i}`)() > 0.3,
        })),
      })),
    });

    if (mock.levelSeries) {
      // Monthly reported values, January through August.
      mock.levelSeries.values.forEach((value, i) => {
        const date = `${MOCK_YEAR}-${String(i + 1).padStart(2, "0")}-28`;
        actuals.push({
          id: `${mock.id}-lvl-${i}`,
          goalId: mock.id,
          subgoalId: null,
          person: mock.levelSeries!.person,
          amount: value,
          date: i === mock.levelSeries!.values.length - 1 ? `${MOCK_YEAR}-08-05` : date,
          addedBy: mock.levelSeries!.person,
          addedAt: createdAt,
        });
      });
      continue;
    }

    for (const sub of mock.subs) {
      for (const [person, personTarget] of sub.people) {
        const rand = lcg(`${mock.id}:${sub.id}:${person}`);
        // Each person lands near the subgoal's achieved fraction, ±20%.
        const personPct = Math.max(
          0.12,
          Math.min(1.05, sub.pct * (0.8 + rand() * 0.4))
        );
        const total = personTarget * personPct;
        const ENTRIES = 16; // biweekly, Jan 5 → Aug 8
        let logged = 0;
        for (let e = 0; e < ENTRIES; e++) {
          const start = new Date(MOCK_YEAR, 0, 5);
          start.setDate(start.getDate() + e * 14);
          const date = `${MOCK_YEAR}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
          let amount =
            e === ENTRIES - 1
              ? total - logged
              : (total / ENTRIES) * (0.65 + rand() * 0.7);
          amount =
            mock.unit === "currency"
              ? Math.max(0, Math.round(amount / 1000) * 1000)
              : Math.max(0, Math.round(amount));
          logged += amount;
          if (amount <= 0) continue;
          actuals.push({
            id: `${sub.id}-${person.split(" ")[0]}-${e}`,
            goalId: mock.id,
            subgoalId: sub.id,
            person,
            amount,
            date,
            addedBy: person,
            addedAt: createdAt,
          });
        }
      }
    }
  }

  /* ---- The booking family and the claim/verify world, so Mock shows every
     new surface full (Anir, Aug 13: "In Mock-mode, I need to see how
     everything looks"). Deterministic like everything else here. */
  const parent = goals.find((g) => g.id === "mock-booked-revenue");
  const componentDefs = [
    { id: "mock-booked-new", name: "Booked New Business", target: 40_000_000 },
    { id: "mock-booked-existing", name: "Booked Existing Business", target: 35_000_000 },
    { id: "mock-renewals", name: "Renewals", target: 25_000_000 },
  ];
  if (parent) {
    parent.componentGoalIds = componentDefs.map((c) => c.id);
    for (const def of componentDefs) {
      goals.push({
        id: def.id,
        name: def.name,
        type: parent.type,
        unit: "currency",
        measure: "total",
        year: MOCK_YEAR,
        target: def.target,
        pickedForOrg: false,
        verified: true,
        subgoals: [],
        createdBy: by,
        createdAt,
      });
    }
    // Cadence rules on the master: RFP-style goals cannot be weekly.
    for (const g of goals) {
      if (/RFP|Proposals/i.test(g.name)) {
        g.cadences = ["monthly", "quarterly", "yearly"];
      }
    }
    const groupTuples = MOCK_GROUPS.map(([, name, head, members]) => ({ name, head, members }));
    const headOf = new Map<string, string>();
    for (const g of groupTuples) for (const p of [g.head, ...g.members]) headOf.set(p, g.head);
    const people = [...headOf.keys()];
    const customers = [
      "Zenlabs Pharma", "Helix Biotech", "Northwind Biosciences", "Meridian Labs",
      "BlueSky Therapeutics", "Caldera Health", "Novara Medical", "Atlas Genomics",
    ];
    const evidencePacks = [
      [{ name: "signed-MSA.pdf", url: "#" }],
      [{ name: "SOW-countersigned.pdf", url: "#" }],
      [{ name: "renewal-contract.pdf", url: "#" }, { name: "opportunity-summary.docx", url: "#" }],
    ];
    const kinds = ["first contract", "adds a service", "renewal"];
    // Apr 2025 through Aug 2026: fills FY 2025-26 completely and the current
    // FY through today, including five claims still waiting in August.
    let k = 0;
    for (let m = 0; m < 17; m++) {
      const year = 2025 + Math.floor((3 + m) / 12);
      const month = (3 + m) % 12;
      componentDefs.forEach((def, ci) => {
        const perMonth = m >= 12 ? 2 : 1;
        for (let e = 0; e < perMonth; e++) {
          const r = lcg(`bk:${def.id}:${m}:${e}`);
          const person = people[Math.floor(r() * people.length)];
          const day = 3 + Math.floor(r() * 22);
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isAugust = year === 2026 && month === 7;
          const waiting = isAugust && k % 3 === 0 && day > 6;
          actuals.push({
            id: `bk-${def.id}-${m}-${e}`,
            goalId: def.id,
            subgoalId: null,
            person,
            amount: Math.round((def.target / 14) * (0.5 + r())),
            date,
            customer: `${customers[Math.floor(r() * customers.length)]} · ${kinds[ci]}`,
            evidence: evidencePacks[Math.floor(r() * evidencePacks.length)],
            status: waiting ? "reported" : "verified",
            ...(waiting
              ? {}
              : {
                  verifiedBy: headOf.get(person) ?? groupTuples[0].head,
                  verifiedAt: `${date}T16:00:00.000Z`,
                }),
            addedBy: person,
            addedAt: `${date}T10:00:00.000Z`,
          });
          k++;
        }
      });
    }
  }

  sampleCache = {
    types: [...DEFAULT_GOAL_TYPES],
    goals,
    groups: MOCK_GROUPS.map(([id, name, head, members]) => ({
      id,
      name,
      head,
      members,
      createdBy: by,
      createdAt,
    })),
    actuals,
  };
  return structuredClone(sampleCache);
}
