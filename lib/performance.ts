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
            note: ra.note ? str(ra.note, 400) : undefined,
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
  };
}

async function readRow(): Promise<PerformanceState> {
  if (!hasDatabase()) return structuredClone(EMPTY_PERFORMANCE);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(stateValue: PerformanceState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: ROW_ID,
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
  const actual: PerfActual = {
    id: uid("pa"),
    goalId: goal.id,
    subgoalId,
    person,
    amount,
    date: dateIso,
    note: input.note ? str(input.note, 400) : undefined,
    addedBy: input.addedBy,
    addedAt: new Date().toISOString(),
  };
  state.actuals.push(actual);
  await writeRow(state);
  return actual;
}

export async function removeActual(actualId: string): Promise<void> {
  const state = await readRow();
  state.actuals = state.actuals.filter((a) => a.id !== actualId);
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
