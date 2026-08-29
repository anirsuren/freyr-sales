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
import { resolveViewerAccess } from "./viewerAccess";
import type { Assignment, AssignmentMap } from "./recordAssignments";

/**
 * WHICH RECORDS ARE YOURS, AND WHAT MAY YOU DO TO THEM.
 *
 * The privilege table answers a question about a MODULE — may this person
 * write in Customers. Suren's Aug 29 correction is that the answer was never
 * meant to apply to every customer in the company:
 *
 *   "All these privileges that you see are only if those customers have been
 *   assigned to him or they have created them. They can do anything with this.
 *   If they want to see other things which are not connected with them, then
 *   they need to have the view all privilege."
 *
 * So a record has to pass two gates. Is it connected to you — you created it,
 * you own it, you were assigned to it, or it sits in a group you are in. And
 * what does the module row say. View all opens the first gate and only for
 * looking; it can never turn into Edit or Create, however generous the row is.
 *
 * WHY THIS IS ONE FILE. The rule is identical in seven modules and each one
 * reads its records differently. Written per module it would be seven chances
 * to forget the View all asymmetry, and the failure mode of forgetting is a
 * person quietly editing an account that was never theirs.
 */

/**
 * The fields a record may carry that say who it belongs to. Every one is
 * optional: this has to answer for records written years before any of it
 * existed, and a record with none of them is nobody's.
 */
export type ScopedRecord = {
  /** Who works it now. The denormalised display name. */
  owner?: string | null;
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
  /** Do they see records that are not theirs? Read only, always. */
  viewAll: boolean;
  /** Ids of every group they are in, head or member. */
  myGroupIds: Set<string>;
  /** What the module rows say, before the record is considered. */
  access: Record<ModuleKey, Access>;
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
       privilege resolution this genuinely does need the groups. */
    const groups = (await readPerformance().catch(() => null))?.groups ?? [];
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
      viewAll: hasViewAll(privileges, me.name, role),
      myGroupIds,
      access: viewer.access,
    };
  } catch {
    return null;
  }
});

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
  assigned?: Assignment | null
): boolean {
  const mine = scope.me.trim().toLowerCase();
  const same = (v: unknown) =>
    typeof v === "string" && v.trim().toLowerCase() === mine;

  if (same(record.owner)) return true;
  if (same(record.created_by) || same(record.createdBy)) return true;
  if (same(record.assignedTo)) return true;
  if (record.members?.some(same)) return true;
  if (record.groupId && scope.myGroupIds.has(record.groupId)) return true;

  if (assigned) {
    if (assigned.members.some(same)) return true;
    if (assigned.groupId && scope.myGroupIds.has(assigned.groupId)) return true;
  }
  return false;
}

/**
 * WHAT THIS PERSON MAY DO TO THIS RECORD. The whole rule, in one call.
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
  return recordAccess({
    moduleAccess: scope.access[module] ?? "none",
    viewAll: scope.viewAll,
    mine: isConnected(record, scope, assigned),
    inMyGroup: false /* already folded into isConnected */,
  });
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
