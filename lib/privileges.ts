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

/**
 * WHAT SOMEBODY MAY DO IN A MODULE. Four answers, not three.
 *
 * Suren, Aug 29: "You know the difference between owner and member? Owner can
 * create, member can edit... there is create, edit and view. Remember, the
 * person who can create only can delete. The edit person can only edit, cannot
 * delete."
 *
 * So the old "write" was two different jobs wearing one word, and the thing it
 * hid is DELETE. An owner creates a customer and can remove it; the member the
 * owner then assigns can correct anything on it and cannot make it disappear.
 * That is the whole reason this is four values and not three, and it is why
 * `canDelete` asks for "create" rather than for "not view".
 *
 * They escalate: create does everything edit does, edit does everything view
 * does. RANK below is what makes that true, and mergeAccess is why holding two
 * privileges is never worse than holding one.
 */
export type Access = "none" | "view" | "edit" | "create";

export const ACCESS_META: Record<Access, { label: string; color: string }> = {
  none: { label: "No access", color: "#8E98A8" },
  view: { label: "View", color: "#0071E3" },
  edit: { label: "Edit", color: "#7C3AED" },
  create: { label: "Create", color: "#1A7A35" },
};

/** Weakest to strongest. The one list every picker builds itself from. */
export const ACCESS_LEVELS: Access[] = ["none", "view", "edit", "create"];

/** May they make new ones? Owners only. */
export function canCreate(a: Access): boolean {
  return a === "create";
}

/** May they change one that exists? Owners and members. */
export function canEdit(a: Access): boolean {
  return a === "create" || a === "edit";
}

/**
 * May they remove one? Only whoever could have created it.
 * "The person who can create only can delete."
 */
export function canDelete(a: Access): boolean {
  return a === "create";
}

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
  /**
   * THE ONE THAT WORKS DIFFERENTLY (Suren, Aug 29): "View all privilege is the
   * only one which helps you to see customers that are not related to you...
   * If he has view all access, that means in the customer module he can look
   * at other customers, but he cannot write."
   *
   * Every other privilege answers "what may you do", and the answer only ever
   * applies to records you created or were assigned. This one answers "what
   * may you SEE that is not yours", and it never carries the pen — see
   * VIEW_ALL and the note above recordAccess.
   */
  { id: "view_all", label: "View all", blurb: "Can look at records that are not theirs. Read only, never write.", builtIn: true },
];

/** The privilege that widens what you can SEE rather than what you can do. */
export const VIEW_ALL = "view_all";

/**
 * A COLOUR PER PRIVILEGE, so a person's row reads as a shape rather than as
 * ten identical ticks. Owner badges take the deeper tone of their pair.
 *
 * One map, because two screens draw these and a privilege has to be the same
 * colour on both — the ticks table and the split's cards each carried their
 * own copy, which is a drift waiting to happen.
 */
export const PRIVILEGE_COLORS: Record<string, string> = {
  bd_owner: "#0071E3",
  bd_member: "#2C7FD0",
  bo_owner: "#7C3AED",
  bo_member: "#6D4BC4",
  sol_owner: "#DB2777",
  sol_member: "#B02066",
  delivery_owner: "#C2410C",
  delivery_member: "#9A4A16",
  admin: "#0F766E",
  view_all: "#475569",
};

/**
 * The colour a HELD privilege is drawn in.
 *
 * Anir, Aug 30, on a ticked card: "I don't like the selected thing. It looks so
 * light, like such a light blue. It's bad." He was right twice over — the tint
 * was 12% alpha AND the member badges were pastels (#4DA3F0, #A78BFA), so a
 * selected card was a pale wash of a pale hue and read as disabled rather than
 * as chosen.
 *
 * The member tones are proper mid-weight colours now, still a step off their
 * owner so the pair still reads as a pair, and the selected state is drawn with
 * the colour at full strength: a solid tick, a real border, a tint you can see.
 */
/**
 * A SHORT MARK PER PRIVILEGE, FOR THE ROW BADGES.
 *
 * Not derived from the label. Taking the first letter of each word turns both
 * "BD Owner" and "BO Owner" into "BO", so somebody holding both wore the same
 * badge twice and it read as a duplicate rather than two privileges (Anir,
 * Aug 31, on Antara Pal showing "BO BO").
 *
 * Three characters: the group, then o for owner and m for member. Written out
 * so a rename cannot silently collide again.
 */
export const PRIVILEGE_SHORT: Record<string, string> = {
  bd_owner: "BDo",
  bd_member: "BDm",
  bo_owner: "BOo",
  bo_member: "BOm",
  sol_owner: "SOo",
  sol_member: "SOm",
  delivery_owner: "DLo",
  delivery_member: "DLm",
  admin: "ADM",
  view_all: "ALL",
};

/** The mark, falling back to the first three letters of an unknown id. */
export function privilegeShort(id: string): string {
  return PRIVILEGE_SHORT[id] ?? id.slice(0, 3).toUpperCase();
}

export function privilegeColor(id: string): string {
  return PRIVILEGE_COLORS[id] ?? "#0071E3";
}

export type PrivilegeState = {
  /** The badges that exist. */
  privileges: PrivilegeDef[];
  /** privilegeId -> moduleKey -> access. Missing means "none". */
  matrix: Record<string, Partial<Record<ModuleKey, Access>>>;
  /** groupId -> its type. Decides which modules the group can hold work for,
   *  never what its people may do — see MODULE_GROUPING. */
  groupTypes: Record<string, GroupType>;
  /** person name -> the privileges they hold. The only place privileges are
   *  granted; a group confers none. */
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
    peoplePrivileges: {},
  };
}

/**
 * WHAT THE TABLE SAYS ON A FRESH WORKSPACE.
 *
 * Not a suggestion — this is the answer until somebody changes a cell in
 * Admin, and it is what a module inherits if the stored copy has never heard
 * of it. Admin is the only privilege that writes everywhere.
 */
function defaultMatrix(): Record<string, Partial<Record<ModuleKey, Access>>> {
  /**
   * ONE GRID, IN THE ORDER THE SCREEN SHOWS IT. Read the columns down:
   * bd_owner, bd_member, bo_owner, bo_member, sol_owner, sol_member,
   * delivery_owner, delivery_member, admin.
   *
   * Eight of these rows are Suren's, cell for cell off his sheet: customers,
   * contracts, offerings, opportunities, submissions, presentations, meetings,
   * solution_requests. The other ten are the ones he asked to have filled in
   * ("for some modules we are missing digital offerings and all that, but you
   * need to add that"), and each follows the nearest module he did decide:
   *
   *   Contacts move with Customers — the same people, one level down.
   *   Digital components move with Offerings — BO owns what is being sold.
   *   Leads and Revenue accruals move with Contracts — BD's paperwork.
   *   Agent is the assistant. Taking it off anybody would be strange.
   *   Team, Reports and Market Intel are things you look at. Admin edits.
   *   Goals: owners set targets, members read the one they were given.
   *   Admin runs the workspace, so nobody else touches it.
   */
  /* WHERE HIS SHEET SAYS "WRITE", THE OWNER COLUMN GETS Create AND THE MEMBER
     COLUMN GETS Edit — that is the split he described, applied down every row
     rather than decided cell by cell. Admin creates everywhere. View all only
     ever views, on every row, which is what makes it the one privilege that
     widens what you see without ever handing you the pen. */
  const GRID: Record<string, Access[]> = {
    //                     BDo       BDm     BOo       BOm     SOLo      SOLm    DELo      DELm    ADM       VIEWALL
    agent:              ["create", "edit", "create", "edit", "create", "edit", "create", "edit", "create", "view"],
    offerings:          ["view",   "view", "create", "edit", "view",   "view", "view",   "view", "create", "view"],
    digital_components: ["view",   "view", "create", "edit", "view",   "view", "view",   "view", "create", "view"],
    opportunities:      ["create", "edit", "create", "edit", "view",   "view", "create", "edit", "create", "view"],
    customers:          ["create", "edit", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    contacts:           ["create", "edit", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    solution_requests:  ["create", "edit", "create", "edit", "create", "edit", "create", "edit", "create", "view"],
    submissions:        ["create", "edit", "create", "edit", "create", "edit", "create", "edit", "create", "view"],
    presentations:      ["create", "edit", "create", "edit", "create", "edit", "create", "edit", "create", "view"],
    meetings:           ["create", "edit", "create", "edit", "create", "edit", "create", "edit", "create", "view"],
    leads:              ["create", "edit", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    contracts:          ["create", "edit", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    revenue_accruals:   ["create", "edit", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    team:               ["view",   "view", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    goals:              ["create", "view", "create", "view", "create", "view", "create", "view", "create", "view"],
    reports:            ["view",   "view", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    market_intel:       ["view",   "view", "view",   "view", "view",   "view", "view",   "view", "create", "view"],
    admin:              ["none",   "none", "none",   "none", "none",   "none", "none",   "none", "create", "none"],
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
    "view_all",
  ];

  const out: Record<string, Partial<Record<ModuleKey, Access>>> = {};
  for (const id of COLUMNS) out[id] = {};
  for (const [moduleKey, row] of Object.entries(GRID)) {
    COLUMNS.forEach((id, i) => {
      out[id][moduleKey as ModuleKey] = row[i];
    });
  }
  return out;
}

/* --------------------------------------------------------------- resolving */

const RANK: Record<Access, number> = { none: 0, view: 1, edit: 2, create: 3 };

/** The most generous answer across everything somebody holds. */
export function mergeAccess(a: Access, b: Access): Access {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * EVERY PRIVILEGE THIS PERSON HOLDS. All of them come from the person.
 *
 * A GROUP CONFERS NOTHING (Suren, Aug 29): "a user creates a group. When he
 * creates a group, he just assigns people... The user only selects a group and
 * then puts all the people in this. Based on these people's privileges, which
 * are already defined here, the privileges will automatically come."
 *
 * It runs the other way round from what I first built. A group does not hand
 * out privileges; the people carry their own in, and the group is a bag to put
 * work in front of them. So "if somebody is a solutioning owner, then that
 * person becomes a solutioning owner because that person already has the
 * privilege" — being in the group did not make them one.
 *
 * `groups` is therefore not a parameter any more. What a group DOES decide is
 * which records you can reach: see recordAccess and MODULE_GROUPING.
 */
export function privilegesForPerson(
  state: PrivilegeState,
  person: string
): string[] {
  const held = new Set<string>();
  for (const [name, list] of Object.entries(state.peoplePrivileges)) {
    if (name.trim().toLowerCase() !== person.trim().toLowerCase()) continue;
    for (const p of list) held.add(p);
  }
  return [...held];
}

/**
 * WHICH KIND OF GROUP OWNS THE WORK IN EACH MODULE, off the bottom of his
 * sheet.
 *
 * Suren: "if the group is an MPR solution team you created and the group type
 * is business development, then what happens in the customer module? Only this
 * group is applicable. That means in the customer module, you can add a bunch
 * of customers to that particular group."
 *
 * So a customer is assigned to a BUSINESS DEVELOPMENT group and never to a
 * solutioning one; a submission is assigned to a SOLUTIONING group and never
 * to a BD one. A module with no entry here is not grouped at all — Offerings
 * is blank on his sheet, and the ten modules that are not on it inherit the
 * nearest one that is.
 */
export const MODULE_GROUPING: Partial<Record<ModuleKey, GroupType>> = {
  customers: "business_development",
  contacts: "business_development",
  contracts: "business_development",
  opportunities: "business_development",
  leads: "business_development",
  revenue_accruals: "business_development",
  submissions: "solutioning",
  presentations: "solutioning",
  meetings: "solutioning",
  solution_requests: "solutioning",
};

/**
 * CAN THIS PERSON REACH THIS RECORD, AND MAY THEY CHANGE IT?
 *
 * The matrix alone was never the whole answer (Suren, Aug 29): "all these
 * privileges that you see are only if those customers have been assigned to
 * him or they have created them... If they want to see other things which are
 * not connected with them, then they need to have the view all privilege."
 *
 * So there are two gates and a record has to pass both:
 *
 *   1. IS IT YOURS? You created it, you are its owner, you were assigned to
 *      it, or it sits in a group you are in. "The moment he creates a
 *      customer, he becomes the owner of the customer. When he assigns
 *      somebody as a member, that particular person can actually start
 *      writing things."
 *   2. WHAT DOES THE MATRIX SAY? Read or write on that module.
 *
 * VIEW ALL OPENS THE FIRST GATE ONLY, AND ONLY FOR READING. Somebody with it
 * sees every record in the module and can change none of the ones that are not
 * theirs. That asymmetry is the whole point of the privilege, so it is written
 * here once rather than re-derived at each call site.
 */
export type RecordAccess = Access;

export function recordAccess(input: {
  /** What the matrix says this person may do in this module. */
  moduleAccess: Access;
  /** Do they hold View all? */
  viewAll: boolean;
  /** Did they create it, own it, or were they assigned to it? */
  mine: boolean;
  /** Is it in a group they belong to? */
  inMyGroup: boolean;
}): RecordAccess {
  if (input.moduleAccess === "none") return "none";
  const connected = input.mine || input.inMyGroup;
  if (connected) return input.moduleAccess;
  /* Not theirs. View all is the only way through, and it never writes —
     never Edit and never Create, however generous the matrix row is. */
  return input.viewAll ? "view" : "none";
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

/**
 * READ ONE CELL, INCLUDING ONE SAVED BEFORE THE SPLIT.
 *
 * Every row stored before Aug 29 holds "read" or "write", the two values that
 * existed when Access had three. Left unhandled they simply fail validation and
 * vanish, and a cell that vanishes inherits the shipped default — which would
 * have quietly reset the whole table on the first read after deploying, with
 * nothing on any screen to say it happened.
 *
 *   read  -> view. Same thing under a new name, no judgement needed.
 *   write -> UNDEFINED, on purpose, so the shipped default decides.
 *
 * The second one is the careful case. "Write" is exactly the word Suren split
 * because it hid two jobs, so there is no honest way to tell whether a stored
 * "write" meant Create or Edit. Guessing Create would hand delete to every
 * member column in one deploy. Letting the default fill it in gives the owner
 * column Create and the member column Edit, which is his answer.
 */
function readAccess(v: unknown): Access | undefined {
  if (v === "none" || v === "view" || v === "edit" || v === "create") return v;
  if (v === "read") return "view";
  return undefined;
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
      const cell = readAccess(row[m.key]);
      if (cell) out[m.key] = cell;
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
 * Their role's badge plus anything given to them directly, merged to the most
 * generous answer, because holding two privileges must never be worse than
 * holding one. Suren's own example is one person holding two: "User 1 — BD
 * Owner and BO Owner."
 *
 * THIS IS THE MODULE-LEVEL ANSWER AND NOT THE WHOLE ANSWER. It says whether
 * the Customers page opens and whether its buttons work at all; whether THIS
 * customer can be opened or changed is recordAccess, which takes this as its
 * starting point and then asks whether the record is theirs.
 */
export function accessMapFor(input: {
  state: PrivilegeState;
  role: string;
  person: string;
}): Record<ModuleKey, Access> {
  const held = new Set<string>(
    privilegesForPerson(input.state, input.person)
  );
  const fromRole = ROLE_PRIVILEGE[input.role];
  if (fromRole) held.add(fromRole);

  const ids = [...held];
  const out = {} as Record<ModuleKey, Access>;
  for (const m of PRIVILEGE_MODULES) {
    out[m.key] = accessForPrivileges(input.state, ids, m.key);
  }
  return out;
}

/** Do they hold View all, by direct grant or through their role? */
export function hasViewAll(
  state: PrivilegeState,
  person: string,
  role: string
): boolean {
  if (ROLE_PRIVILEGE[role] === "admin") return true;
  return privilegesForPerson(state, person).includes(VIEW_ALL);
}

/** Which module row a path belongs to, longest match first. */
export function moduleForPath(path: string): ModuleKey | null {
  const raw = (path || "").trim();
  /**
   * THE QUERY IS PART OF THE ADDRESS FOR THREE OF THESE.
   *
   * Solution requests, Submissions and Presentations are three separate
   * privileges that share one route and are told apart by `?tab=`. This
   * function threw the query away before comparing, so all three resolved to
   * whichever sat first in the table — Solution requests — and the other two
   * were unreachable. They appeared in the matrix, they were editable in
   * Admin's privilege grid, and they decided nothing: granting somebody
   * Submissions create changed no button anywhere.
   *
   * Found Aug 31, giving Solutioning Members create on Submissions and
   * watching the button stay hidden. Exact match first, so a tabbed address
   * finds its own privilege; the base-path walk below is unchanged for every
   * other module, none of which carries a query.
   */
  const exact = PRIVILEGE_MODULES.find((m) => m.path === raw);
  if (exact) return exact.key;

  const clean = raw.split("?")[0];
  let best: { key: ModuleKey; len: number } | null = null;
  for (const m of PRIVILEGE_MODULES) {
    const base = m.path.split("?")[0];
    if (clean !== base && !clean.startsWith(`${base}/`)) continue;
    if (!best || base.length > best.len) best = { key: m.key, len: base.length };
  }
  return best?.key ?? null;
}
