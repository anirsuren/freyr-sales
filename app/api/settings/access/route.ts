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
    return NextResponse.json(await listWorkspaceAccess());
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
    if (body.action === "invite") {
      await inviteWorkspaceUser(grant.userId, body.email || "", role);
    } else if (body.action === "approve" || body.action === "reject") {
      await reviewAccessRequest(
        grant.userId,
        body.requestId || "",
        body.action,
        role
      );
    } else if (body.action === "change_role") {
      await updateWorkspaceMember(body.memberId || "", { role });
    } else if (body.action === "deactivate" || body.action === "reactivate") {
      if (body.action === "deactivate" && body.memberId === grant.userId) {
        return NextResponse.json({ error: "You cannot suspend your own owner account." }, { status: 400 });
      }
      await updateWorkspaceMember(body.memberId || "", { active: body.action === "reactivate" });
    } else {
      return NextResponse.json({ error: "Unsupported access action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, directory: await listWorkspaceAccess() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access update failed." },
      { status: 400 }
    );
  }
}
