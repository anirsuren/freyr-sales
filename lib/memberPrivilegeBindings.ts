import type { PrivilegeState } from "./privileges";

export type PrivilegeMember = {
  id: string;
  display_name: string;
  active: boolean;
};
const key = (name: string) => name.trim().toLowerCase();

/** Add stable bindings only where the old name identifies exactly one member.
 * Ambiguous/unmatched names stay in the legacy display map for admin review. */
export function bindLegacyMemberPrivileges(
  state: PrivilegeState,
  members: PrivilegeMember[],
): Record<string, string[]> {
  const bound = { ...state.memberPrivileges };
  for (const [name, privileges] of Object.entries(state.peoplePrivileges)) {
    const matches = members.filter(
      (member) => key(member.display_name) === key(name),
    );
    if (matches.length !== 1 || !matches[0].active) continue;
    if (!Object.hasOwn(state.memberPrivileges ?? {}, matches[0].id))
      bound[matches[0].id] = [...new Set([...(bound[matches[0].id] ?? []), ...privileges])];
  }
  return bound;
}

export function privilegesForMember(
  state: PrivilegeState,
  memberId: string | null | undefined,
  members: PrivilegeMember[],
): string[] {
  if (
    !memberId ||
    !members.some((member) => member.id === memberId && member.active)
  )
    return [];
  return bindLegacyMemberPrivileges(state, members)[memberId] ?? [];
}

/** Preserve stable bindings while the legacy admin controls edit by name. */
export function reconcileMemberPrivilegeBindings(
  next: PrivilegeState,
  previous: PrivilegeState,
  members: PrivilegeMember[],
): PrivilegeState {
  const memberPrivileges = bindLegacyMemberPrivileges(
    {
      ...next,
      memberPrivileges: {
        ...previous.memberPrivileges,
        ...next.memberPrivileges,
      },
    },
    members,
  );
  const legacy = (state: PrivilegeState, name: string) =>
    [
      ...new Set(
        Object.entries(state.peoplePrivileges)
          .filter(([label]) => key(label) === key(name))
          .flatMap(([, ids]) => ids),
      ),
    ].sort();
  for (const member of members) {
    if (
      !member.active ||
      members.filter(
        (row) => key(row.display_name) === key(member.display_name),
      ).length !== 1
    )
      continue;
    const before = legacy(previous, member.display_name),
      after = legacy(next, member.display_name);
    if (JSON.stringify(before) !== JSON.stringify(after))
      memberPrivileges[member.id] = after;
  }
  return { ...next, memberPrivileges };
}
