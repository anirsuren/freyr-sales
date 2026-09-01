import "server-only";

import { cache } from "react";
import { getCurrentUser } from "./currentUser";
import { getRole } from "./role";
import { readPerformance } from "./performance";
import {
  MODULE_GROUPING,
  canDelete as levelCanDelete,
  canEdit as levelCanEdit,
  hasViewAll,
  readPrivileges,
  recordAccess,
  type Access,
  type ModuleKey,
} from "./privileges";
import {
  EMPTY_RECORD_TEAMS,
  readRecordTeams,
  teamFor,
  type RecordTeamsState,
  type TeamedRecord,
} from "./recordTeams";
import { resolveViewerAccess } from "./viewerAccess";
import type { Assignment, AssignmentMap } from "./recordAssignments";

/**
 * WHICH RECORDS ARE YOURS, AND WHAT MAY YOU DO TO THEM.
 *
 * The privilege table answers a question about a MODULE — may this person
 * write in Customers. Suren's correction is that the answer was never meant to
 * apply to every customer in the company. Aug 29:
 *
 *   "All these privileges that you see are only if those customers have been
 *   assigned to him or they have created them. They can do anything with this."
 *
 * and Sep 1, which is what finally settled what happens on everybody else's:
 *
 *   "You've created a customer, then you can do whatever you want. A BD member
 *   cannot create a new customer. You can only edit that customer, but you can
 *   only do anything on a particular customer that you are part of or created
 *   or edited so far... For other records that they are not part of, they
 *   should have a view option to view other records."
 *
 * So a record has two gates. Is it connected to you: you created it, you own
 * it, you were put on it, or it sits in a group you are in. And what does the
 * module row say. On a record that is yours, your module row applies in full.
 * On anybody else's, the answer is View and only View, no matter how generous
 * the row is.
 *
 * WHY THIS IS ONE FILE. The rule is identical in seven modules and each one
 * reads its records differently. Written per module it would be seven chances
 * to forget that Edit does not survive contact with somebody else's record, and
 * the failure mode of forgetting is a person quietly editing an account that
 * was never theirs.
 *
 * IT WAS WRITTEN AND NEVER WIRED. Everything above this line was true on Aug 29
 * and nothing imported it, so the rule existed only as prose: every list showed
 * every record and every Edit button asked the module and nothing else. Sep 1 is
 * the day it was connected to the pages and the routes. See the report of that
 * date for what changed for whom.
 */

/**
 * The fields a record may carry that say who it belongs to. Every one is
 * optional: this has to answer for records written years before any of it
 * existed, and a record with none of them is nobody's.
 */
export type ScopedRecord = {
  /** Its own id, so the record-teams store can be asked about it. */
  id?: string | null;
  /** Who works it now. The denormalised display name. */
  owner?: string | null;
  /**
   * The stable app_users id of the owner, which is what actually proves it.
   * A display name is presentation data. Two people can share one and an
   * identity provider can change it under you, so where both are recorded the
   * id is the one that decides. Same reasoning as lib/workflowAuthorization.
   */
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  /** Who put it in. "The moment he creates a customer, he becomes the owner." */
  created_by?: string | null;
  createdBy?: string | null;
  /** Solutioning's word for the person carrying it. */
  assignedTo?: string | null;
  /** People the owner assigned, who "can actually start writing things". */
  members?: string[] | null;
  /** The group it was handed to. Its type must match MODULE_GROUPING. */
  groupId?: string | null;
};

export type Scope = {
  /** The signed-in person's name, as records store it. */
  me: string;
  /** Their stable app_users id, when the session carries one. */
  myUserId: string | null;
  /**
   * Do they run the workspace or a business development group?
   *
   * Admin and BD Owner keep the reach they have today. PATCH
   * /api/customers/[id] has always let `isWorkflowOwnerOrManager` through, the
   * manager there being admin or bd_owner, and Suren was describing what a BD
   * MEMBER may do when he drew the line at "records you are part of". Narrowing
   * the two roles that run things is a decision he has not made, so this keeps
   * them where they are and the report of Sep 1 asks him.
   */
  manager: boolean;
  /** Do they see records that are not theirs? Read only, always. */
  viewAll: boolean;
  /** Ids of every group they are in, head or member. */
  myGroupIds: Set<string>;
  /** Who is on which record, for the modules that record it. */
  teams: RecordTeamsState;
  /** What the module rows say, before the record is considered. */
  access: Record<ModuleKey, Access>;
};

/**
 * WHICH RECORD-TEAM NAMESPACE EACH MODULE KEEPS ITS PEOPLE IN.
 *
 * lib/recordTeams is keyed by its own vocabulary ("customer:cust-003") because
 * it predates the module keys. One map, so a module cannot be wired to the
 * wrong namespace and silently find nobody on every record, which reads
 * exactly like "nobody is assigned" and would hand the module back to everyone.
 *
 * A module absent from here has no team store; only what is written on the
 * record itself counts for it.
 */
export const MODULE_TEAM_TYPE: Partial<Record<ModuleKey, TeamedRecord>> = {
  customers: "customer",
  contracts: "contract",
  offerings: "offering",
  opportunities: "opportunity",
  submissions: "submission",
  presentations: "presentation",
  solution_requests: "solutionRequest",
  meetings: "meeting",
};

/**
 * RESOLVED ONCE PER REQUEST, like viewerAccess, because a list of sixty
 * customers must not ask sixty times who is signed in.
 *
 * NULL MEANS DO NOT SCOPE. Same contract as resolveViewerAccess: if the
 * privilege table could not be read there is no trustworthy answer to "is this
 * yours", and the honest fallback is the behaviour that shipped before any of
 * this existed rather than an empty page. A workspace that shows too much for
 * a minute is recoverable; one that shows nothing looks like data loss.
 */
export const resolveScope = cache(async (): Promise<Scope | null> => {
  try {
    const viewer = await resolveViewerAccess();
    if (!viewer) return null;

    const [me, role, privileges] = await Promise.all([
      getCurrentUser(),
      getRole(),
      readPrivileges(),
    ]);

    /* Group membership decides which records are reachable, so unlike the
       privilege resolution this genuinely does need the groups. Neither the
       groups nor the teams may take a page down: a store that will not answer
       means "nobody is recorded", which is the same shape as a fresh
       workspace and is handled everywhere. */
    const [groups, teams] = await Promise.all([
      readPerformance()
        .then((p) => p.groups ?? [])
        .catch(() => []),
      readRecordTeams().catch(() => EMPTY_RECORD_TEAMS),
    ]);
    const mine = me.name.trim().toLowerCase();
    const myGroupIds = new Set(
      groups
        .filter(
          (g) =>
            g.head?.trim().toLowerCase() === mine ||
            g.members.some((m) => m.trim().toLowerCase() === mine)
        )
        .map((g) => g.id)
    );

    return {
      me: me.name,
      myUserId: me.memberId ?? null,
      manager: role === "admin" || role === "bd_owner",
      viewAll: hasViewAll(privileges, me.name, role),
      myGroupIds,
      teams,
      access: viewer.access,
    };
  } catch {
    return null;
  }
});

/** Names are compared the way people type them, not the way they store them. */
function sameName(value: unknown, mine: string): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === mine;
}

/**
 * A NAME THAT MEANS NOBODY.
 *
 * Every real account imported so far reads "Unassigned" in its owner column,
 * which is a label and not a person. Counting it as an owner would make all of
 * them somebody else's on the day this ships.
 */
const NOBODY = new Set(["", "unassigned", "none", "nobody", "-"]);

function isSomebody(value: unknown): boolean {
  return (
    typeof value === "string" && !NOBODY.has(value.trim().toLowerCase())
  );
}

/** The team recorded against this record, if its module keeps one. */
function teamOf(record: ScopedRecord, module: ModuleKey, scope: Scope) {
  const type = MODULE_TEAM_TYPE[module];
  if (!type || !record.id) return null;
  return teamFor(scope.teams, type, record.id);
}

/**
 * Is this record connected to this person at all?
 *
 * `assigned` is the row from record_assignments, when the caller has the map in
 * hand. It is separate from the record because the group and the member list
 * are stored beside the record rather than on it — see lib/recordAssignments
 * for why one table serves every module.
 */
export function isConnected(
  record: ScopedRecord,
  scope: Scope,
  assigned?: Assignment | null,
  module?: ModuleKey
): boolean {
  const mine = scope.me.trim().toLowerCase();
  const same = (v: unknown) => sameName(v, mine);

  /* The stable id first, where both were recorded: it is the only one of these
     that a rename cannot break. */
  const myId = scope.myUserId;
  if (myId && (record.owner_user_id === myId || record.ownerUserId === myId))
    return true;

  if (same(record.owner)) return true;
  if (same(record.created_by) || same(record.createdBy)) return true;
  if (same(record.assignedTo)) return true;
  if (record.members?.some(same)) return true;
  if (record.groupId && scope.myGroupIds.has(record.groupId)) return true;

  if (module) {
    const team = teamOf(record, module, scope);
    if (team && (same(team.owner) || team.members.some(same))) return true;
  }

  if (assigned) {
    if (assigned.members.some(same)) return true;
    if (assigned.groupId && scope.myGroupIds.has(assigned.groupId)) return true;
  }
  return false;
}

/**
 * HAS ANYBODY BEEN PUT ON THIS RECORD?
 *
 * Distinct from "is it mine". A record nobody owns belongs to nobody, and the
 * module row keeps deciding it. See the note on `claimed` in lib/privileges
 * for why that is not the same as being generous.
 */
export function isClaimed(
  record: ScopedRecord,
  scope: Scope,
  assigned?: Assignment | null,
  module?: ModuleKey
): boolean {
  if (isSomebody(record.owner)) return true;
  if (record.owner_user_id || record.ownerUserId) return true;
  if (isSomebody(record.assignedTo)) return true;
  if (record.members?.some(isSomebody)) return true;
  if (record.groupId) return true;

  if (module) {
    const team = teamOf(record, module, scope);
    if (team && (isSomebody(team.owner) || team.members.length > 0)) return true;
  }

  if (assigned && (assigned.groupId || assigned.members.length > 0)) return true;
  return false;
}

/**
 * WHAT THIS PERSON MAY DO TO THIS RECORD. The whole rule, in one call.
 *
 * This is the only function in the app that should ever answer that question.
 * Everything else (the pages, the API routes, the refusal helpers in
 * lib/moduleAccessServer) asks this and reports what it says.
 */
export function accessToRecord(
  record: ScopedRecord,
  module: ModuleKey,
  scope: Scope | null,
  assigned?: Assignment | null
): Access {
  /* Not scoping: the module answer applies to everything, which is how the
     app behaved before Aug 29. */
  if (!scope) return "create";

  const moduleAccess = scope.access[module] ?? "none";

  /* NONE IS NONE FOR EVERYBODY, the manager included. Checked before the
     manager shortcut so that shortcut can never become a way in. */
  if (moduleAccess === "none") return "none";

  /* Admin and BD Owner keep the reach they already had. See Scope.manager. */
  if (scope.manager) return moduleAccess;

  return recordAccess({
    moduleAccess,
    viewAll: scope.viewAll,
    mine: isConnected(record, scope, assigned, module),
    inMyGroup: false /* already folded into isConnected */,
    claimed: isClaimed(record, scope, assigned, module),
  });
}

/**
 * WHY THIS RECORD READS THE WAY IT DOES, in a sentence a non-technical person
 * can act on. Shown on the record itself, never as an error.
 */
export function whyRecordAccess(
  record: ScopedRecord,
  module: ModuleKey,
  scope: Scope | null,
  assigned?: Assignment | null
): string | null {
  if (!scope) return null;
  if (accessToRecord(record, module, scope, assigned) !== "view") return null;
  if ((scope.access[module] ?? "none") === "view")
    return "You can view this, but changing it is not part of your access.";
  if (!isConnected(record, scope, assigned, module))
    return "You can view this because it is not one of yours. Ask to be added to it to make changes.";
  return "You can view this, but changing it is not part of your access.";
}

/**
 * Everything in this list they are allowed to lay eyes on.
 *
 * `idOf` is how a record finds its assignment row. Pass it whenever the module
 * has assignments; without it only what is written on the record itself counts.
 */
export function visibleRecords<T extends ScopedRecord>(
  records: T[],
  module: ModuleKey,
  scope: Scope | null,
  assignments?: AssignmentMap,
  idOf?: (r: T) => string
): T[] {
  if (!scope) return records;
  return records.filter(
    (r) =>
      accessToRecord(
        r,
        module,
        scope,
        assignments && idOf ? assignments[idOf(r)] : null
      ) !== "none"
  );
}

export function canEditRecord(
  record: ScopedRecord,
  module: ModuleKey,
  scope: Scope | null,
  assigned?: Assignment | null
): boolean {
  return levelCanEdit(accessToRecord(record, module, scope, assigned));
}

export function canDeleteRecord(
  record: ScopedRecord,
  module: ModuleKey,
  scope: Scope | null,
  assigned?: Assignment | null
): boolean {
  return levelCanDelete(accessToRecord(record, module, scope, assigned));
}

/**
 * WHICH GROUPS THIS MODULE MAY BE HANDED TO.
 *
 * Off the bottom of his sheet: a customer goes to a business development group
 * and never to a solutioning one. Returns every group of the right type, so a
 * picker cannot offer a group the module has no business with.
 */
export async function groupsForModule(
  module: ModuleKey
): Promise<{ id: string; name: string }[]> {
  const wanted = MODULE_GROUPING[module];
  if (!wanted) return [];
  try {
    const [perf, privileges] = await Promise.all([
      readPerformance(),
      readPrivileges(),
    ]);
    return perf.groups
      .filter((g) => privileges.groupTypes[g.id] === wanted)
      .map((g) => ({ id: g.id, name: g.name }));
  } catch {
    return [];
  }
}
