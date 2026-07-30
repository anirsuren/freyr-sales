import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, type WorkspaceRole, verifyAccessGrant } from "@/lib/accessControl";
import {
  inviteWorkspaceUser,
  listWorkspaceAccess,
  reviewAccessRequest,
  updateWorkspaceMember,
} from "@/lib/accessStore";

const ROLES = new Set<WorkspaceRole>(["sales", "editor", "admin"]);

async function adminGrant(request: NextRequest) {
  const grant = await verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value);
  return grant?.role === "admin" ? grant : null;
}

export async function GET(request: NextRequest) {
  const grant = await adminGrant(request);
  if (!grant) return NextResponse.json({ error: "Workspace owner access required." }, { status: 403 });
  try {
    return NextResponse.json(await listWorkspaceAccess(grant.workspaceId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load workspace access." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const grant = await adminGrant(request);
  if (!grant) return NextResponse.json({ error: "Workspace owner access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const role: WorkspaceRole = ROLES.has(body.role) ? body.role : "sales";
  try {
    let invitationDelivery = null;
    if (body.action === "invite") {
      invitationDelivery = await inviteWorkspaceUser(
        grant.workspaceId,
        grant.userId,
        body.name || "",
        body.email || "",
        role
      );
    } else if (body.action === "approve" || body.action === "reject") {
      await reviewAccessRequest(
        grant.workspaceId,
        grant.userId,
        body.requestId || "",
        body.action,
        role
      );
    } else if (body.action === "change_role") {
      /**
       * NEVER LEAVE THE WORKSPACE WITHOUT AN ADMIN.
       *
       * Suspending yourself was already blocked; demoting yourself was not, and
       * it is strictly worse. A sole admin who set their own role to Rep locked
       * every admin control in the workspace with no way back — the stored role
       * wins over OWNER_EMAILS for anyone who already has a row, so not even
       * re-signing-in restores it. Only direct database access would.
       *
       * Counted, not guessed: a second active admin makes either move safe.
       */
      if (role !== "admin" && body.memberId === grant.userId) {
        const directory = await listWorkspaceAccess(grant.workspaceId);
        const otherAdmins = (directory.members || []).filter(
          (m) => m.role === "admin" && m.active && m.id !== grant.userId
        ).length;
        if (otherAdmins === 0) {
          return NextResponse.json(
            {
              error:
                "You are the only admin. Make someone else an admin before changing your own role.",
            },
            { status: 400 }
          );
        }
      }
      await updateWorkspaceMember(grant.workspaceId, body.memberId || "", { role });
    } else if (body.action === "deactivate" || body.action === "reactivate") {
      if (body.action === "deactivate" && body.memberId === grant.userId) {
        return NextResponse.json({ error: "You cannot suspend your own owner account." }, { status: 400 });
      }
      await updateWorkspaceMember(grant.workspaceId, body.memberId || "", {
        active: body.action === "reactivate",
      });
    } else {
      return NextResponse.json({ error: "Unsupported access action." }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      invitationDelivery,
      directory: await listWorkspaceAccess(grant.workspaceId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access update failed." },
      { status: 400 }
    );
  }
}
