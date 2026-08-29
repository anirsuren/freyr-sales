import { createClient } from "@supabase/supabase-js";
import { hasSupabase } from "./env";

/**
 * PRIVILEGE MANAGEMENT — who can read what, and who can write it.
 *
 * Suren, Aug 29: "In the admin module, there is team management. Within team
 * management, somebody can first create some team groups… He gives a group
 * name: MPR solutioning team, MTV solutioning team, focus to sales team. In
 * that group there are different people he can assign, but a group always has
 * a group type: is it a business development group, a business offering group,
 * a solutioning group, an admin group? The person belongs to a particular
 * group… when that group or that person is added, a privilege is given.
 * Sometimes you can give multiple privileges to a particular person, I have no
 * problem. What is privilege management? These are the modules and these are
 * the privileges… If anybody has this privilege in this module, they can write.
 * For example, in a customer module, the BO owner privileged guy cannot write,
 * can only read."
 *
 * So the model is three facts, not one:
 *
 *   1. A GROUP has a TYPE. Four of them, the ones he named.
 *   2. A PRIVILEGE is a named badge. A group confers its privileges on its
 *      people, and a person can hold extra ones directly — "multiple
 *      privileges to a particular person, I have no problem".
 *   3. A MATRIX says, for each privilege and each module: nothing, read, or
 *      write. Read and write are separate answers, because his own example is
 *      a privilege that opens a module for reading and refuses the pen.
 *
 * WHY THE MATRIX IS DATA AND NOT CODE. He has already changed his mind about
 * who sees what six times since Aug 12, and every one of those was a one-line
 * edit to lib/moduleAccess plus a deploy. This is a table he edits in Admin.
 *
 * THIS TABLE IS THE AUTHORITY. Not a plan, not a document, no switch to make
 * it stop counting — see the note above emptyPrivilegeState.
 */

const ROW_ID = "privileges";

/* ------------------------------------------------------------ group types */

export const GROUP_TYPES = [
  "business_development",
  "business_offering",
  "solutioning",
  "admin",
] as const;

export type GroupType = (typeof GROUP_TYPES)[number];

export const GROUP_TYPE_META: Record<
  GroupType,
  { label: string; short: string; color: string; blurb: string }
> = {
  business_development: {
    label: "Business development",
    short: "BD",
    color: "#0071E3",
    blurb: "Sales. Chases accounts, opens opportunities, carries the number.",
  },
  business_offering: {
    label: "Business offering",
    short: "BO",
    color: "#7C3AED",
    blurb: "Owns an offering and what it can do, not the accounts buying it.",
  },
  solutioning: {
    label: "Solutioning",
    short: "SOL",
    color: "#0D9488",
    blurb: "Builds what sales asks for: submissions, presentations, meetings.",
  },
  admin: {
    label: "Admin",
    short: "ADM",
    color: "#DB2777",
    blurb: "Runs the workspace itself.",
  },
};

/* --------------------------------------------------------------- modules */

/**
 * EVERY MODULE THE MATRIX HAS A ROW FOR.
 *
 * Suren: "we need to make sure that, for all the modules, I haven't written
 * everything. For some modules, we are missing digital offerings and all that,
 * but you need to add that." So this is the app's actual module list rather
 * than the subset on his sheet — Digital components included, and Leads,
 * Revenue accruals and Contracts, which his sheet does not mention either.
 *
 * `path` is what lib/moduleAccess checks, so a row here can become a real gate
 * without anybody mapping names to routes a second time.
 */
export type ModuleKey =
  | "agent"
  | "offerings"
  | "digital_components"
  | "opportunities"
  | "customers"
  | "contacts"
  | "solution_requests"
  | "submissions"
  | "presentations"
  | "meetings"
  | "leads"
  | "contracts"
  | "revenue_accruals"
  | "team"
  | "goals"
  | "reports"
  | "market_intel"
  | "admin";
/* ONE ROW PER THING IN THE PRODUCT, AND NOT ONE MORE (Anir, Aug 29: "you have
   way too many fucking pages here — just follow whatever the fuck he said").
   I had briefly given every routable URL a row, seventeen of them beyond this
   list: dashboard, pipeline, forecast, analytics, activity, sessions,
   recordings, sequences, campaigns, voice, tasks, services, notifications,
   search, settings, onboarding, import. Most are not in the sidebar and some
   are not surfaces anybody navigates to, so all they did was bury the modules
   that matter under thirty-five rows of scrolling.

   A module with no row here is NOT thereby forbidden. lib/moduleAccess falls
   back to the role rules for any path this table does not name, which is how
   those pages behaved before the table existed and how they behave now. */

export const PRIVILEGE_MODULES: {
  key: ModuleKey;
  label: string;
  path: string;
}[] = [
  { key: "agent", label: "Agent", path: "/agent" },
  { key: "offerings", label: "Offerings", path: "/offerings" },
  { key: "digital_components", label: "Digital components", path: "/components" },
  { key: "opportunities", label: "Opportunities", path: "/opportunities" },
  { key: "customers", label: "Customers", path: "/customers" },
  { key: "contacts", label: "Contacts", path: "/contacts" },
  { key: "solution_requests", label: "Solution requests", path: "/solutioning" },
  { key: "submissions", label: "Submissions", path: "/solutioning?tab=submissions" },
  { key: "presentations", label: "Presentations", path: "/solutioning?tab=presentations" },
  { key: "meetings", label: "Meetings", path: "/meetings" },
  { key: "leads", label: "Leads", path: "/leads" },
  { key: "contracts", label: "Contracts", path: "/contracts" },
  { key: "revenue_accruals", label: "Revenue accruals", path: "/revenue-accruals" },
  { key: "team", label: "Team", path: "/team" },
  { key: "goals", label: "Goals", path: "/performance" },
  { key: "reports", label: "Reports", path: "/reports" },
  { key: "market_intel", label: "Market Intel", path: "/market-intel" },
  { key: "admin", label: "Admin", path: "/admin" },
];

/* ------------------------------------------------------------- privileges */

/** Nothing, look but do not touch, or the pen. */
export type Access = "none" | "read" | "write";

export const ACCESS_META: Record<Access, { label: string; color: string }> = {
  none: { label: "No access", color: "#8E98A8" },
  read: { label: "Read", color: "#0071E3" },
  write: { label: "Write", color: "#1A7A35" },
};

export type PrivilegeDef = {
  id: string;
  label: string;
  /** The group type this privilege naturally belongs to, when it has one. */
  groupType?: GroupType;
  /** What holding it means, in a sentence. */
  blurb?: string;
  /** Shipped with the app — renameable, but not deletable. */
  builtIn?: boolean;
};

/**
 * THE NINE COLUMNS ON HIS SHEET, in his order and under his names.
 *
 * Delivery Owner and Delivery Member are on the sheet as privileges but are
 * NOT among the four group types he dictated, which is why they carry no
 * groupType below.
 */
export const BUILT_IN_PRIVILEGES: PrivilegeDef[] = [
  { id: "bd_owner", label: "BD Owner", groupType: "business_development", blurb: "Runs a business development group.", builtIn: true },
  { id: "bd_member", label: "BD Member", groupType: "business_development", blurb: "Works in a business development group.", builtIn: true },
  { id: "bo_owner", label: "BO Owner", groupType: "business_offering", blurb: "Owns an offering.", builtIn: true },
  { id: "bo_member", label: "BO Member", groupType: "business_offering", blurb: "Works on an offering.", builtIn: true },
  { id: "sol_owner", label: "Solutioning Owner", groupType: "solutioning", blurb: "Runs a solutioning group.", builtIn: true },
  { id: "sol_member", label: "Solutioning Member", groupType: "solutioning", blurb: "Builds what sales asks for.", builtIn: true },
  /* DELIVERY IS A PRIVILEGE WITHOUT A GROUP TYPE OF ITS OWN. His sheet lists
     Delivery Owner and Delivery Member as columns, but the group-type list he
     dictated has four entries and Delivery is not one of them — so delivery
     people sit in a group of one of those four types and carry this badge. */
  { id: "delivery_owner", label: "Delivery Owner", blurb: "Owns what has been sold being delivered.", builtIn: true },
  { id: "delivery_member", label: "Delivery Member", blurb: "Delivers the work.", builtIn: true },
  { id: "admin", label: "Admin", groupType: "admin", blurb: "Runs the workspace. Everything, everywhere.", builtIn: true },
];

export type PrivilegeState = {
  /** The badges that exist. */
  privileges: PrivilegeDef[];
  /** privilegeId -> moduleKey -> access. Missing means "none". */
  matrix: Record<string, Partial<Record<ModuleKey, Access>>>;
  /** groupId -> its type. */
  groupTypes: Record<string, GroupType>;
  /** groupId -> privileges everybody in it holds. */
  groupPrivileges: Record<string, string[]>;
  /** person name -> privileges held directly, on top of their groups'. */
  peoplePrivileges: Record<string, string[]>;
  updatedBy?: string;
  updatedAt?: string;
};

/* THERE IS NO OFF SWITCH (Anir, Aug 29: "why the fuck would they stop
   enforcing it?"). This table used to carry an `enforced` flag with a button
   in Admin to turn it off, on the reasoning that a half-filled permissions
   table should not be allowed to lock a live workspace out. That reasoning
   describes the day it was built, not the product: a table of permissions with
   a switch that makes it stop meaning anything is not a table of permissions,
   and the button was one click away from quietly handing everybody everything.

   The table is the authority, always. The one remaining fallback is in
   lib/viewerAccess and it is narrow on purpose: if the table cannot be READ at
   all, access reverts to the role rules rather than to nothing, so a Supabase
   blip cannot lock the company out. */

/** Every badge present, the shipped grid, nothing assigned to anybody yet. */
export function emptyPrivilegeState(): PrivilegeState {
  return {
    privileges: BUILT_IN_PRIVILEGES.map((p) => ({ ...p })),
    matrix: defaultMatrix(),
    groupTypes: {},
    groupPrivileges: {},
    peoplePrivileges: {},
  };
}

/**
 * A FIRST PASS AT THE GRID — his to correct.
 *
 * Only one cell in here is his: BO owner reads Customers and cannot write it.
 * The rest follows the shape of the four group types, so the table opens with
 * something to react to rather than eighteen empty rows. Admin is the only
 * privilege that writes everywhere.
 */
function defaultMatrix(): Record<string, Partial<Record<ModuleKey, Access>>> {
  /**
   * THE EIGHT ROWS HE SPECIFIED, cell for cell off his sheet. Read the columns
   * down: bd_owner, bd_member, bo_owner, bo_member, sol_owner, sol_member,
   * delivery_owner, delivery_member, admin.
   */
  const SHEET: Record<string, Access[]> = {
    //                    BDo      BDm      BOo     BOm     SOLo    SOLm    DELo     DELm     ADM
    customers:          ["write", "write", "read", "read", "read", "read", "read",  "read",  "write"],
    contracts:          ["write", "write", "read", "read", "read", "read", "read",  "read",  "write"],
    offerings:          ["read",  "read",  "write","write","read", "read", "read",  "read",  "write"],
    opportunities:      ["write", "write", "write","write","read", "read", "write", "write", "write"],
    submissions:        ["write", "write", "write","write","write","write","write", "write", "write"],
    presentations:      ["write", "write", "write","write","write","write","write", "write", "write"],
    meetings:           ["write", "write", "write","write","write","write","write", "write", "write"],
    solution_requests:  ["write", "write", "write","write","write","write","write", "write", "write"],
  };

  /**
   * THE ROWS HE ASKED ME TO ADD (Suren, Aug 29: "for some modules we are
   * missing digital offerings and all that, but you need to add that this
   * module, this privilege").
   *
   * These are MINE, not his, and the Admin screen marks them so — they are a
   * proposal to correct, not a decision. Each one follows the nearest module
   * he did specify: Contacts move with Customers, Digital components with
   * Offerings, Leads and Revenue accruals with Contracts. What nobody owns
   * operationally is readable by everyone and writable by Admin.
   */
  const PROPOSED: Record<string, Access[]> = {
    //                    BDo      BDm      BOo     BOm     SOLo    SOLm    DELo     DELm     ADM
    agent:              ["write", "write", "write","write","write","write","write", "write", "write"],
    contacts:           ["write", "write", "read", "read", "read", "read", "read",  "read",  "write"],
    digital_components: ["read",  "read",  "write","write","read", "read", "read",  "read",  "write"],
    leads:              ["write", "write", "read", "read", "read", "read", "read",  "read",  "write"],
    revenue_accruals:   ["write", "write", "read", "read", "read", "read", "read",  "read",  "write"],
    team:               ["read",  "read",  "read", "read", "read", "read", "read",  "read",  "write"],
    goals:              ["write", "read",  "write","read", "write","read", "write", "read",  "write"],
    reports:            ["read",  "read",  "read", "read", "read", "read", "read",  "read",  "write"],
    market_intel:       ["read",  "read",  "read", "read", "read", "read", "read",  "read",  "write"],
    admin:              ["none",  "none",  "none", "none", "none", "none", "none",  "none",  "write"],
  };

  const COLUMNS = [
    "bd_owner",
    "bd_member",
    "bo_owner",
    "bo_member",
    "sol_owner",
    "sol_member",
    "delivery_owner",
    "delivery_member",
    "admin",
  ];

  const out: Record<string, Partial<Record<ModuleKey, Access>>> = {};
  for (const id of COLUMNS) out[id] = {};
  for (const [moduleKey, row] of Object.entries({ ...SHEET, ...PROPOSED })) {
    COLUMNS.forEach((id, i) => {
      out[id][moduleKey as ModuleKey] = row[i];
    });
  }
  return out;
}

/**
 * Which rows came off his sheet and which I proposed — the Admin screen says
 * so on the row, so the ones he has not blessed are obvious at a glance.
 */
export const MODULES_FROM_SHEET: ModuleKey[] = [
  "customers",
  "contracts",
  "offerings",
  "opportunities",
  "submissions",
  "presentations",
  "meetings",
  "solution_requests",
];

/* --------------------------------------------------------------- resolving */

const RANK: Record<Access, number> = { none: 0, read: 1, write: 2 };

/** The most generous answer across everything somebody holds. */
export function mergeAccess(a: Access, b: Access): Access {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * EVERY PRIVILEGE THIS PERSON HOLDS — from their groups, plus their own.
 *
 * "The person actually belongs to a particular group. Predominantly, he
 * belongs to a particular group, so when that particular group or the
 * particular person is added, a privilege is given."
 */
export function privilegesForPerson(
  state: PrivilegeState,
  person: string,
  groups: { id: string; head: string; members: string[] }[]
): string[] {
  const is = (n: string) =>
    n.trim().toLowerCase() === person.trim().toLowerCase();
  const held = new Set<string>();

  for (const g of groups) {
    const inIt = g.members.some(is) || is(g.head);
    if (!inIt) continue;
    for (const p of state.groupPrivileges[g.id] ?? []) held.add(p);
  }
  for (const [name, list] of Object.entries(state.peoplePrivileges)) {
    if (!is(name)) continue;
    for (const p of list) held.add(p);
  }
  return [...held];
}

/** What those privileges add up to on one module. */
export function accessForPrivileges(
  state: PrivilegeState,
  privileges: string[],
  module: ModuleKey
): Access {
  let out: Access = "none";
  for (const id of privileges) {
    out = mergeAccess(out, state.matrix[id]?.[module] ?? "none");
  }
  return out;
}

/* ----------------------------------------------------------------- storage */

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_PRIVILEGES_QUEUE__: Promise<void> | undefined;
}

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isAccess(v: unknown): v is Access {
  return v === "none" || v === "read" || v === "write";
}

function isGroupType(v: unknown): v is GroupType {
  return (GROUP_TYPES as readonly string[]).includes(v as string);
}

export function normalizePrivilegeState(raw: unknown): PrivilegeState {
  const base = emptyPrivilegeState();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Partial<PrivilegeState>;

  /* Built-ins always exist; a stored copy may rename one but cannot delete it,
     so a matrix row can never point at a badge nobody can see. */
  const stored = Array.isArray(v.privileges) ? v.privileges : [];
  const byId = new Map<string, PrivilegeDef>();
  for (const p of BUILT_IN_PRIVILEGES) byId.set(p.id, { ...p });
  for (const p of stored) {
    if (!p || typeof p !== "object") continue;
    const id = str((p as PrivilegeDef).id, 60);
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, {
      id,
      label: str((p as PrivilegeDef).label, 80) || existing?.label || id,
      groupType: isGroupType((p as PrivilegeDef).groupType)
        ? (p as PrivilegeDef).groupType
        : existing?.groupType,
      blurb: str((p as PrivilegeDef).blurb, 200) || existing?.blurb,
      builtIn: existing?.builtIn,
    });
  }

  const matrix: Record<string, Partial<Record<ModuleKey, Access>>> = {};
  const rawMatrix = (v.matrix ?? {}) as Record<string, Record<string, unknown>>;
  for (const [privId, row] of Object.entries(rawMatrix)) {
    if (!byId.has(privId) || !row || typeof row !== "object") continue;
    const out: Partial<Record<ModuleKey, Access>> = {};
    for (const m of PRIVILEGE_MODULES) {
      const cell = row[m.key];
      if (isAccess(cell)) out[m.key] = cell;
    }
    matrix[privId] = out;
  }
  /* A badge with no stored row keeps the shipped default rather than becoming
     silently powerless — and so does a single MISSING CELL.
     
     The second half matters more than the first and was missing: a table saved
     before a module existed has no cell for it, and `?? "none"` turned every
     such module into a locked door. Switching enforcement on immediately took
     Settings, Search, Notifications and fourteen other pages away from
     everyone, because the stored copy predated the row (caught turning it on,
     Aug 29). A module the table has never heard of inherits what shipped with
     it; only a cell somebody actually SET can take access away. */
  for (const [id, row] of Object.entries(base.matrix)) {
    if (!matrix[id]) {
      matrix[id] = row;
      continue;
    }
    for (const m of PRIVILEGE_MODULES) {
      if (matrix[id][m.key] === undefined) matrix[id][m.key] = row[m.key];
    }
  }

  const groupTypes: Record<string, GroupType> = {};
  for (const [gid, t] of Object.entries(v.groupTypes ?? {})) {
    if (isGroupType(t)) groupTypes[str(gid, 60)] = t;
  }

  const listOf = (src: unknown): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [k, val] of Object.entries(
      (src ?? {}) as Record<string, unknown>
    )) {
      const key = str(k, 80);
      if (!key || !Array.isArray(val)) continue;
      const ids = [
        ...new Set(val.map((x) => str(String(x ?? ""), 60)).filter(Boolean)),
      ].filter((id) => byId.has(id));
      if (ids.length) out[key] = ids;
    }
    return out;
  };

  return {
    privileges: [...byId.values()],
    matrix,
    groupTypes,
    groupPrivileges: listOf(v.groupPrivileges),
    peoplePrivileges: listOf(v.peoplePrivileges),
    updatedBy: str(v.updatedBy, 80) || undefined,
    updatedAt: str(v.updatedAt, 40) || undefined,
  };
}

async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_PRIVILEGES_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_PRIVILEGES_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * ONE ROW FOR THE WHOLE WORKSPACE — not per data-mode.
 *
 * Who may open what is a fact about the real company. Mock mode is a way of
 * LOOKING at the app, not a second organisation with its own permissions, and
 * a mock-only copy of this table is how somebody ends up testing a gate that
 * production does not have.
 */
async function readRowRaw(): Promise<unknown | null> {
  if (!hasSupabase()) return null;
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

export async function readPrivileges(): Promise<PrivilegeState> {
  return readRowRaw()
    .then(normalizePrivilegeState)
    .catch(() => emptyPrivilegeState());
}

export async function writePrivileges(
  next: PrivilegeState,
  by: string
): Promise<PrivilegeState> {
  return withWrite(async () => {
    const state = normalizePrivilegeState({
      ...next,
      updatedBy: by,
      updatedAt: new Date().toISOString(),
    });
    const { error } = await client()
      .from("offering_catalog_state")
      .upsert({
        id: ROW_ID,
        catalog: state,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return state;
  });
}

/* ------------------------------------------------- roles become privileges */

/**
 * THE OLD ROLES ARE THE NEW PRIVILEGES (Suren, Aug 29: "these are the roles
 * from now on. I need this executed… we are removing sales rep. Sales rep is
 * now BD member. Owner is the new manager.").
 *
 * Four role values are stored against every account in `app_users.app_role`,
 * and thousands of rows and every auth path read them. Renaming the stored
 * value would be a migration with a lockout at the end of it if any single
 * caller were missed; renaming what the value MEANS costs nothing and is what
 * he actually asked for — "sales rep" gone from the product, Owner in place of
 * Manager, and the privilege table deciding access.
 *
 * So: the stored value is an id, and this is the badge it carries.
 *
 *   rep       -> BD Member    ("sales rep is now bd member")
 *   manager   -> BD Owner     ("owner is the new manager")
 *   admin     -> Admin
 *   solutions -> Solutioning Member
 *
 * The last one is mine: he did not mention that role, and Solutioning
 * Member is the badge whose modules match what that role already opens. An
 * admin can hand any of them a different privilege directly.
 */
export const ROLE_PRIVILEGE: Record<string, string> = {
  /* The stored values, which ARE the privilege ids now. Identity, but written
     out rather than assumed: the day a role exists that is not also a badge,
     this is the file that has to say so. */
  bd_member: "bd_member",
  bd_owner: "bd_owner",
  sol_member: "sol_member",
  admin: "admin",
  /* And every word that used to mean them, for a row written before migration
     024 ran. Without these a person whose row still says "rep" resolves NO
     privilege at all and is refused everything — which is exactly what
     happened the first time enforcement was switched on (caught Aug 29,
     testing a BD Member against Meetings). */
  rep: "bd_member",
  sales: "bd_member",
  manager: "bd_owner",
  editor: "bd_owner",
  solutions: "sol_member",
  solution: "sol_member",
};

/**
 * EVERYTHING THIS PERSON MAY DO, MODULE BY MODULE.
 *
 * Their role's badge, plus every badge their groups carry, plus anything given
 * to them directly — merged to the most generous answer, because holding two
 * privileges must never be worse than holding one.
 */
export function accessMapFor(input: {
  state: PrivilegeState;
  role: string;
  person: string;
  groups: { id: string; head: string; members: string[] }[];
}): Record<ModuleKey, Access> {
  const held = new Set<string>(privilegesForPerson(input.state, input.person, input.groups));
  const fromRole = ROLE_PRIVILEGE[input.role];
  if (fromRole) held.add(fromRole);

  const ids = [...held];
  const out = {} as Record<ModuleKey, Access>;
  for (const m of PRIVILEGE_MODULES) {
    out[m.key] = accessForPrivileges(input.state, ids, m.key);
  }
  return out;
}

/** Which module row a path belongs to, longest match first. */
export function moduleForPath(path: string): ModuleKey | null {
  const clean = (path || "").split("?")[0];
  let best: { key: ModuleKey; len: number } | null = null;
  for (const m of PRIVILEGE_MODULES) {
    const base = m.path.split("?")[0];
    if (clean !== base && !clean.startsWith(`${base}/`)) continue;
    if (!best || base.length > best.len) best = { key: m.key, len: base.length };
  }
  return best?.key ?? null;
}
