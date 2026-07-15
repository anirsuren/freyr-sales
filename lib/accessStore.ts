import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "./auth";
import {
  isBootstrapOwner,
  normalizedEmail,
  providerForAuthMode,
  type WorkspaceRole,
} from "./accessControl";

export type AccessMember = {
  id: string;
  name: string;
  email: string | null;
  role: WorkspaceRole;
  active: boolean;
  lastSeenAt: string | null;
};

export type AccessRequestRecord = {
  id: string;
  name: string;
  email: string | null;
  requestedRole: WorkspaceRole;
  requestedAt: string;
};

export type InvitationRecord = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
};

export type AccessDirectory = {
  workspaceId: string;
  members: AccessMember[];
  requests: AccessRequestRecord[];
  invitations: InvitationRecord[];
};

type ResolvedAccess =
  | { status: "approved"; workspaceId: string; userId: string; role: WorkspaceRole }
  | { status: "pending"; workspaceId: string };

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Approval access requires Supabase service credentials.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function workspaceId(client: SupabaseClient): Promise<string> {
  if (process.env.FREYR_WORKSPACE_ID) return process.env.FREYR_WORKSPACE_ID;
  const existing = await client.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return existing.data.id;
  const created = await client
    .from("workspaces")
    .insert({ name: process.env.FREYR_WORKSPACE_NAME || "Freyr Sales" })
    .select("id")
    .single();
  if (created.error || !created.data?.id) {
    throw new Error(created.error?.message || "Could not create workspace.");
  }
  return created.data.id;
}

async function activeUser(
  client: SupabaseClient,
  workspace: string,
  subject: string
) {
  const result = await client
    .from("app_users")
    .select("id, app_role, active")
    .eq("workspace_id", workspace)
    .eq("entra_object_id", subject)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as { id: string; app_role: WorkspaceRole; active: boolean } | null;
}

export async function resolveWorkspaceAccess(user: AuthenticatedUser): Promise<ResolvedAccess> {
  const client = adminClient();
  const workspace = await workspaceId(client);
  const provider = providerForAuthMode();
  const email = normalizedEmail(user.email);
  const existing = await activeUser(client, workspace, user.id);

  if (existing?.active) {
    await client.from("app_users").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
    return { status: "approved", workspaceId: workspace, userId: existing.id, role: existing.app_role };
  }

  if (existing && !existing.active) {
    await client.from("access_requests").upsert(
      {
        workspace_id: workspace,
        auth_provider: provider,
        provider_subject: user.id,
        email,
        display_name: user.name,
        requested_role: "sales",
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,auth_provider,provider_subject" }
    );
    return { status: "pending", workspaceId: workspace };
  }

  let invitedRole: WorkspaceRole | null = null;
  let invitationId: string | null = null;
  if (email) {
    const invitation = await client
      .from("workspace_invitations")
      .select("id, app_role")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      .ilike("email", email)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (invitation.error) throw new Error(invitation.error.message);
    invitedRole = (invitation.data?.app_role as WorkspaceRole | undefined) || null;
    invitationId = invitation.data?.id || null;
  }

  const role: WorkspaceRole | null = isBootstrapOwner(user) ? "admin" : invitedRole;
  if (role) {
    const inserted = await client
      .from("app_users")
      .insert({
        workspace_id: workspace,
        entra_object_id: user.id,
        email,
        display_name: user.name,
        app_role: role,
        auth_provider: provider,
        active: true,
        approved_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data?.id) {
      throw new Error(inserted.error?.message || "Could not activate user.");
    }
    if (invitationId) {
      await client
        .from("workspace_invitations")
        .update({
          status: "accepted",
          accepted_by: inserted.data.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitationId);
    }
    return { status: "approved", workspaceId: workspace, userId: inserted.data.id, role };
  }

  const priorRequest = await client
    .from("access_requests")
    .select("status")
    .eq("workspace_id", workspace)
    .eq("auth_provider", provider)
    .eq("provider_subject", user.id)
    .maybeSingle();
  if (priorRequest.error) throw new Error(priorRequest.error.message);
  if (priorRequest.data?.status === "rejected") {
    return { status: "pending", workspaceId: workspace };
  }

  const requested = await client.from("access_requests").upsert(
    {
      workspace_id: workspace,
      auth_provider: provider,
      provider_subject: user.id,
      email,
      display_name: user.name,
      requested_role: "sales",
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,auth_provider,provider_subject" }
  );
  if (requested.error) throw new Error(requested.error.message);
  return { status: "pending", workspaceId: workspace };
}

export async function listWorkspaceAccess(): Promise<AccessDirectory> {
  const client = adminClient();
  const workspace = await workspaceId(client);
  const [members, requests, invitations] = await Promise.all([
    client
      .from("app_users")
      .select("id, display_name, email, app_role, active, last_seen_at")
      .eq("workspace_id", workspace)
      .order("display_name"),
    client
      .from("access_requests")
      .select("id, display_name, email, requested_role, created_at")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      .order("created_at"),
    client
      .from("workspace_invitations")
      .select("id, email, app_role, expires_at")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [members, requests, invitations]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    workspaceId: workspace,
    members: (members.data || []).map((item) => ({
      id: item.id,
      name: item.display_name,
      email: item.email,
      role: item.app_role as WorkspaceRole,
      active: item.active,
      lastSeenAt: item.last_seen_at,
    })),
    requests: (requests.data || []).map((item) => ({
      id: item.id,
      name: item.display_name,
      email: item.email,
      requestedRole: item.requested_role as WorkspaceRole,
      requestedAt: item.created_at,
    })),
    invitations: (invitations.data || []).map((item) => ({
      id: item.id,
      email: item.email,
      role: item.app_role as WorkspaceRole,
      expiresAt: item.expires_at,
    })),
  };
}

export async function inviteWorkspaceUser(
  actorId: string,
  emailValue: string,
  role: WorkspaceRole
) {
  const email = normalizedEmail(emailValue);
  if (!email) throw new Error("Enter a valid email address.");
  const client = adminClient();
  const workspace = await workspaceId(client);
  const result = await client.from("workspace_invitations").upsert(
    {
      workspace_id: workspace,
      email,
      app_role: role,
      status: "pending",
      invited_by: actorId,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
    { onConflict: "workspace_id,email" }
  );
  if (result.error) throw new Error(result.error.message);
}

export async function reviewAccessRequest(
  actorId: string,
  requestId: string,
  decision: "approve" | "reject",
  role: WorkspaceRole = "sales"
) {
  const client = adminClient();
  const request = await client
    .from("access_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();
  if (request.error || !request.data) throw new Error(request.error?.message || "Request not found.");
  const now = new Date().toISOString();
  if (decision === "approve") {
    const user = await client.from("app_users").upsert(
      {
        workspace_id: request.data.workspace_id,
        entra_object_id: request.data.provider_subject,
        email: request.data.email,
        display_name: request.data.display_name,
        app_role: role,
        auth_provider: request.data.auth_provider,
        active: true,
        approved_by: actorId,
        approved_at: now,
      },
      { onConflict: "workspace_id,entra_object_id" }
    );
    if (user.error) throw new Error(user.error.message);
  }
  const reviewed = await client
    .from("access_requests")
    .update({ status: decision === "approve" ? "approved" : "rejected", reviewed_by: actorId, reviewed_at: now, updated_at: now })
    .eq("id", requestId);
  if (reviewed.error) throw new Error(reviewed.error.message);
}

export async function updateWorkspaceMember(
  memberId: string,
  patch: { role?: WorkspaceRole; active?: boolean }
) {
  const client = adminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.role) update.app_role = patch.role;
  if (typeof patch.active === "boolean") update.active = patch.active;
  const result = await client.from("app_users").update(update).eq("id", memberId);
  if (result.error) throw new Error(result.error.message);
}
