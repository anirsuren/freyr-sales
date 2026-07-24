import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";
import { verifiedRequestMemberScope } from "./memberScope";
import { authenticatedRequestPrincipal } from "./requestPrincipal";
import {
  ACCESS_COOKIE,
  verifyAccessGrant,
  type WorkspaceRole,
} from "./accessControl";
import {
  DEFAULT_LOCAL_USER_IDENTITY,
  GENERIC_USER_IDENTITY,
} from "./userIdentity";

export class MemberAssignmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 503
  ) {
    super(message);
    this.name = "MemberAssignmentError";
  }
}

export type VerifiedOwnerAssignment = {
  owner: string | null;
  owner_user_id: string | null;
  workspace_id?: string;
};

type DirectoryMember = {
  id: string;
  display_name: string;
  email: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve legacy name/email owner input to one active member. Display names are
 * accepted for backward compatibility only when they identify exactly one
 * active member; stored writes always carry that member's stable app_users id.
 */
async function directoryMember(
  workspaceId: string,
  reference: string
): Promise<DirectoryMember> {
  if (!hasSupabase()) {
    throw new MemberAssignmentError(
      "Workspace member assignment is unavailable until the member directory is configured.",
      503
    );
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const result = await client
    .from("app_users")
    .select("id, display_name, email")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .limit(1000);
  if (result.error) {
    throw new MemberAssignmentError(
      `Could not verify the account owner: ${result.error.message}`,
      503
    );
  }

  const needle = reference.toLocaleLowerCase();
  const members = (result.data || []) as DirectoryMember[];
  const exactId = members.find((member) => member.id === reference);
  if (exactId) return exactId;

  const exactEmail = members.find(
    (member) => member.email?.trim().toLocaleLowerCase() === needle
  );
  if (exactEmail) return exactEmail;

  const nameMatches = members.filter(
    (member) => member.display_name.trim().toLocaleLowerCase() === needle
  );
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) {
    throw new MemberAssignmentError(
      "That owner name matches more than one teammate. Choose the teammate by member ID or email.",
      400
    );
  }
  throw new MemberAssignmentError(
    "The selected owner is not an active member of this workspace.",
    400
  );
}

/**
 * Canonicalize an owner assignment from signed request context. In live mode,
 * a browser-supplied display name is never persisted as identity on its own:
 * it is either the verified current member or is resolved through app_users.
 * Mock mode keeps its explicit demo-roster behavior.
 */
export async function verifiedOwnerAssignment(
  request: NextRequest,
  input: {
    owner?: unknown;
    ownerUserId?: unknown;
    currentOwner?: unknown;
    currentOwnerUserId?: unknown;
  }
): Promise<VerifiedOwnerAssignment> {
  const requestedName = clean(input.owner);
  const requestedId = clean(input.ownerUserId);
  const currentOwnerName = clean(input.currentOwner);
  const currentOwnerId = clean(input.currentOwnerUserId);

  if (getDataMode() === "mock") {
    return {
      owner: requestedName || null,
      owner_user_id: null,
    };
  }

  const [scope, principal, grant] = await Promise.all([
    verifiedRequestMemberScope(request),
    authenticatedRequestPrincipal(request),
    verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value),
  ]);
  if (!scope) {
    throw new MemberAssignmentError(
      "Verified workspace access is required to assign an owner.",
      403
    );
  }

  const canonicalGrantName =
    grant &&
    grant.sub === principal?.id &&
    grant.userId === scope.userId
      ? grant.displayName?.trim()
      : "";
  const actorName =
    canonicalGrantName ||
    principal?.name.trim() ||
    (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE
      ? DEFAULT_LOCAL_USER_IDENTITY.name
      : GENERIC_USER_IDENTITY.name);
  const actorRole: WorkspaceRole =
    grant &&
    grant.sub === principal?.id &&
    grant.userId === scope.userId
      ? grant.role
      : process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE
        ? "admin"
        : "sales";
  const assigningSelf =
    requestedId === scope.userId ||
    (!requestedId &&
      requestedName.localeCompare(actorName, undefined, {
        sensitivity: "accent",
      }) === 0);

  // Reps may claim an unassigned account, retain their own assignment, or clear
  // their own assignment. Moving work to another person (or taking over a
  // legacy name-only assignment) requires an editor/admin so display-name
  // ambiguity cannot become an ownership bypass.
  if (actorRole === "sales") {
    if (
      (currentOwnerId && currentOwnerId !== scope.userId) ||
      (!currentOwnerId && currentOwnerName)
    ) {
      throw new MemberAssignmentError(
        "Only an editor or admin can change another teammate's ownership.",
        403
      );
    }
    if ((requestedName || requestedId) && !assigningSelf) {
      throw new MemberAssignmentError(
        "Sales users can assign ownership only to themselves.",
        403
      );
    }
  }

  if (!requestedName && !requestedId) {
    return {
      owner: null,
      owner_user_id: null,
      workspace_id: scope.workspaceId,
    };
  }

  if (assigningSelf) {
    return {
      owner: actorName,
      owner_user_id: scope.userId,
      workspace_id: scope.workspaceId,
    };
  }

  const member = await directoryMember(
    scope.workspaceId,
    requestedId || requestedName
  );
  return {
    owner: member.display_name.trim(),
    owner_user_id: member.id,
    workspace_id: scope.workspaceId,
  };
}

export function memberAssignmentResponse(error: unknown): Response | null {
  if (!(error instanceof MemberAssignmentError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
