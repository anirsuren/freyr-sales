import "server-only";

import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  verifyAccessGrant,
  type WorkspaceRole,
} from "./accessControl";
import { verifiedRequestMemberScope } from "./memberScope";
import { authenticatedRequestPrincipal } from "./requestPrincipal";
import { DEFAULT_LOCAL_USER_IDENTITY } from "./userIdentity";

export type VerifiedWorkflowActor = {
  subject: string;
  userId: string;
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
};

/**
 * Resolve the person mutating a workflow from the signed login plus its signed
 * workspace grant. Browser-supplied names and ids are deliberately ignored.
 */
export async function verifiedWorkflowActor(
  request: NextRequest
): Promise<VerifiedWorkflowActor | null> {
  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE) {
    const scope = await verifiedRequestMemberScope(request);
    return scope
      ? {
          subject: DEFAULT_LOCAL_USER_IDENTITY.id,
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          name: DEFAULT_LOCAL_USER_IDENTITY.name,
          role: "admin",
        }
      : null;
  }

  const [scope, principal, grant] = await Promise.all([
    verifiedRequestMemberScope(request),
    authenticatedRequestPrincipal(request),
    verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value),
  ]);
  if (
    !scope ||
    !principal ||
    !grant ||
    grant.sub !== principal.id ||
    grant.userId !== scope.userId ||
    grant.workspaceId !== scope.workspaceId
  ) {
    return null;
  }

  return {
    subject: principal.id,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    name:
      grant.displayName?.trim() ||
      principal.name.trim() ||
      "Workspace member",
    role: grant.role,
  };
}

export function isWorkflowManager(actor: VerifiedWorkflowActor): boolean {
  return actor.role === "admin" || actor.role === "bd_owner";
}

/**
 * Authorization is based only on the stable app_users id. A display name is
 * presentation data, not proof of ownership: two teammates may share a name,
 * and an identity-provider profile name can change. Legacy rows without an id
 * therefore require an administrator until they are explicitly reassigned.
 */
export function isWorkflowOwner(
  actor: VerifiedWorkflowActor,
  ownerUserId: string | null | undefined,
  legacyOwnerName: string | null | undefined
): boolean {
  void legacyOwnerName;
  return !!ownerUserId && ownerUserId === actor.userId;
}

export function isWorkflowOwnerOrAdmin(
  actor: VerifiedWorkflowActor,
  ownerUserId: string | null | undefined,
  legacyOwnerName: string | null | undefined
): boolean {
  return (
    actor.role === "admin" ||
    isWorkflowOwner(actor, ownerUserId, legacyOwnerName)
  );
}

export function isWorkflowOwnerOrManager(
  actor: VerifiedWorkflowActor,
  ownerUserId: string | null | undefined,
  legacyOwnerName: string | null | undefined
): boolean {
  return (
    isWorkflowManager(actor) ||
    isWorkflowOwner(actor, ownerUserId, legacyOwnerName)
  );
}
