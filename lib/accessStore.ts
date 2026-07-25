import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "./auth";
import {
  isBootstrapOwner,
  normalizedEmail,
  providerForAuthMode,
  type WorkspaceRole,
} from "./accessControl";
import { isAutoApprovedEmail } from "./authEmailPolicy";
import { authUrl } from "./authOrigin";
import { sendTransactionalEmail, type EmailResult } from "./email";

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
  name: string | null;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
};

export type InvitationDelivery = {
  email: string;
  expiresAt: string;
  emailResult: EmailResult;
};

export type AccessDirectory = {
  workspaceId: string;
  members: AccessMember[];
  requests: AccessRequestRecord[];
  invitations: InvitationRecord[];
};

type ResolvedAccess =
  | {
      status: "approved";
      workspaceId: string;
      userId: string;
      role: WorkspaceRole;
      displayName: string;
    }
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

// A Supabase/Postgres error that means a relation or column has not been
// created yet — i.e. an ownership-attribution migration (010/011/012) has not
// been applied. The app runs correctly in mock data mode without those columns,
// so the health probe treats this as "not migrated yet" rather than a hard
// failure. Connectivity and permission errors still surface normally.
function isMissingSchemaError(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = error.code ?? "";
  // 42P01 undefined_table, 42703 undefined_column (Postgres); PostgREST surfaces
  // the same as PGRST205 (table not found) / PGRST204 (column not found).
  if (["42P01", "42703", "PGRST205", "PGRST204"].includes(code)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

export async function verifyAccessControlStorage(): Promise<void> {
  const client = adminClient();
  // Core access tables. These predate the ownership-attribution migrations, so
  // they must exist on every environment; an error here is a real failure.
  const core = await Promise.all([
    client
      .from("app_users")
      .select("id, auth_provider, entra_object_id, active")
      .limit(1),
    client
      .from("access_requests")
      .select("id, auth_provider, provider_subject, status")
      .limit(1),
    client
      .from("workspace_invitations")
      .select("id, email, status")
      .limit(1),
  ]);
  for (const result of core) {
    if (result.error) throw new Error(result.error.message);
  }

  // Ownership-attribution columns added by migrations 010/011/012. Tolerate a
  // not-yet-migrated environment (missing table/column) but still fail on any
  // other error, so a genuine storage problem is never masked.
  const ownership = await Promise.all([
    client
      .from("customers")
      .select("id, workspace_id, owner_user_id")
      .limit(1),
    client
      .from("offering_categories")
      .select("id, workspace_id, owner_user_id")
      .limit(1),
    client
      .from("agent_runs")
      .select("id, workspace_id, created_by_user_id")
      .limit(1),
  ]);
  for (const result of ownership) {
    if (result.error && !isMissingSchemaError(result.error)) {
      throw new Error(result.error.message);
    }
  }
}

async function workspaceId(client: SupabaseClient): Promise<string> {
  const configured = process.env.FREYR_WORKSPACE_ID;
  if (configured) {
    const existing = await client
      .from("workspaces")
      .select("id")
      .eq("id", configured)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.id) return existing.data.id;
    const created = await client
      .from("workspaces")
      .insert({
        id: configured,
        name: process.env.FREYR_WORKSPACE_NAME || "Freyr Sales",
      })
      .select("id")
      .single();
    if (created.error || !created.data?.id) {
      throw new Error(
        created.error?.message || "Could not create configured workspace."
      );
    }
    return created.data.id;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FREYR_WORKSPACE_ID is required in production.");
  }
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
  provider: "entra" | "aws-alb" | "supabase",
  subject: string
) {
  const result = await client
    .from("app_users")
    .select("id, display_name, app_role, active")
    .eq("workspace_id", workspace)
    .eq("auth_provider", provider)
    .eq("entra_object_id", subject)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as {
    id: string;
    display_name: string;
    app_role: WorkspaceRole;
    active: boolean;
  } | null;
}

export async function resolveWorkspaceAccess(user: AuthenticatedUser): Promise<ResolvedAccess> {
  const client = adminClient();
  const workspace = await workspaceId(client);
  const provider = providerForAuthMode();
  const email = normalizedEmail(user.email);
  if (provider === "supabase" && !email) {
    throw new Error("A valid email address is required.");
  }
  const existing = await activeUser(client, workspace, provider, user.id);

  if (existing?.active) {
    const synced = await client
      .from("app_users")
      .update({
        // The provider subject and verified email identify this account. Do not
        // overwrite the workspace's canonical display name from mutable
        // Supabase user metadata on every login; otherwise a member can rename
        // themselves to another teammate and poison authorship/audit labels.
        email,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("workspace_id", workspace)
      .eq("auth_provider", provider)
      .eq("entra_object_id", user.id);
    if (synced.error) throw new Error(synced.error.message);
    return {
      status: "approved",
      workspaceId: workspace,
      userId: existing.id,
      role: existing.app_role,
      displayName: existing.display_name,
    };
  }

  if (existing && !existing.active) {
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

  const now = new Date().toISOString();
  let invitedRole: WorkspaceRole | null = null;
  let invitationId: string | null = null;
  let invitedDisplayName: string | null = null;
  if (email) {
    const invitation = await client
      .from("workspace_invitations")
      .select("id, display_name, app_role")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      // Invitation addresses are normalized before storage. Exact matching is
      // required here: ILIKE would treat valid email characters such as "%"
      // and "_" as wildcards and could grant the wrong invitation.
      .eq("email", email)
      .gt("expires_at", now)
      .maybeSingle();
    if (invitation.error) throw new Error(invitation.error.message);
    invitedRole = (invitation.data?.app_role as WorkspaceRole | undefined) || null;
    invitationId = invitation.data?.id || null;
    invitedDisplayName =
      typeof invitation.data?.display_name === "string"
        ? invitation.data.display_name.trim()
        : null;
  }

  const bootstrapOwner = isBootstrapOwner(user);
  // Company-domain auto-join (Suren): a colleague signing in with a VERIFIED
  // company email already belongs here — the domain itself is the invitation.
  // They activate immediately as a sales member; provider sign-in only
  // completes after email confirmation, so the address is trusted.
  const domainMember =
    !bootstrapOwner && !invitedRole && isAutoApprovedEmail(email);
  const role: WorkspaceRole | null = bootstrapOwner
    ? "admin"
    : invitedRole ?? (domainMember ? "sales" : null);
  if (role) {
    // Bootstrap ownership and domain auto-join are tied to a verified email,
    // so the member's own registered name is canonical. Every ordinary invited
    // member must use the inviter-selected canonical name; an old invitation
    // without display_name is not allowed to fall back to mutable Supabase
    // profile metadata.
    const canonicalName =
      bootstrapOwner || domainMember
        ? user.name.trim().replace(/\s+/g, " ")
        : invitedDisplayName || "";
    if (canonicalName.length < 2 || canonicalName.length > 120) {
      throw new Error(
        bootstrapOwner || domainMember
          ? "A valid canonical member name is required."
          : "This invitation is missing the teammate’s canonical full name. Ask an admin to send it again."
      );
    }
    const inserted = await client
      .from("app_users")
      .insert({
        workspace_id: workspace,
        entra_object_id: user.id,
        email,
        display_name: canonicalName,
        app_role: role,
        auth_provider: provider,
        // Keep a newly invited member inactive until this request atomically
        // wins the pending-invitation update below. Concurrent requests cannot
        // both turn one invitation into active memberships.
        active: !invitationId,
        approved_at: invitationId ? null : now,
        last_seen_at: invitationId ? null : now,
      })
      .select("id, display_name")
      .single();
    if (inserted.error || !inserted.data?.id) {
      throw new Error(inserted.error?.message || "Could not activate user.");
    }
    let activated = inserted.data;
    if (invitationId) {
      const accepted = await client
        .from("workspace_invitations")
        .update({
          status: "accepted",
          accepted_by: inserted.data.id,
          accepted_at: now,
        })
        .eq("id", invitationId)
        .eq("workspace_id", workspace)
        .eq("status", "pending")
        .gt("expires_at", now)
        .select("id")
        .maybeSingle();
      if (accepted.error || !accepted.data?.id) {
        const rolledBack = await client
          .from("app_users")
          .delete()
          .eq("id", inserted.data.id)
          .eq("workspace_id", workspace)
          .eq("active", false);
        if (rolledBack.error) throw new Error(rolledBack.error.message);
        throw new Error(
          accepted.error?.message || "Invitation is no longer available."
        );
      }
      const active = await client
        .from("app_users")
        .update({
          active: true,
          approved_at: now,
          last_seen_at: now,
        })
        .eq("id", inserted.data.id)
        .eq("workspace_id", workspace)
        .eq("active", false)
        .select("id, display_name")
        .maybeSingle();
      if (active.error || !active.data?.id) {
        throw new Error(active.error?.message || "Could not activate user.");
      }
      activated = active.data;
    }
    return {
      status: "approved",
      workspaceId: workspace,
      userId: activated.id,
      role,
      displayName: activated.display_name,
    };
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

export async function listWorkspaceAccess(workspace: string): Promise<AccessDirectory> {
  const client = adminClient();
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
      .select("id, display_name, email, app_role, expires_at")
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
      name: item.display_name || null,
      email: item.email,
      role: item.app_role as WorkspaceRole,
      expiresAt: item.expires_at,
    })),
  };
}

export async function inviteWorkspaceUser(
  workspace: string,
  actorId: string,
  nameValue: string,
  emailValue: string,
  role: WorkspaceRole
): Promise<InvitationDelivery> {
  const name = nameValue.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    throw new Error("Enter the teammate’s full name.");
  }
  const email = normalizedEmail(emailValue);
  if (!email) throw new Error("Enter a valid email address.");
  const client = adminClient();
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const result = await client.from("workspace_invitations").upsert(
    {
      workspace_id: workspace,
      display_name: name,
      email,
      app_role: role,
      status: "pending",
      invited_by: actorId,
      accepted_by: null,
      accepted_at: null,
      expires_at: expiresAt,
    },
    { onConflict: "workspace_id,email" }
  );
  if (result.error) throw new Error(result.error.message);

  const invitationUrl = authUrl("/login");
  invitationUrl.searchParams.set("name", name);
  invitationUrl.searchParams.set("email", email);
  invitationUrl.searchParams.set("mode", "request");
  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "You’re invited to Freyr Sales Intelligence",
    body: [
      `Hi ${name},`,
      "",
      "You’ve been invited to the Freyr Sales Intelligence workspace.",
      "",
      "Create your account using the exact email address that received this invitation:",
      invitationUrl.toString(),
      "",
      "This invitation expires in 14 days.",
    ].join("\n"),
  });

  return { email, expiresAt, emailResult };
}

export async function reviewAccessRequest(
  workspace: string,
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
    .eq("workspace_id", workspace)
    .eq("status", "pending")
    .single();
  if (request.error || !request.data) throw new Error(request.error?.message || "Request not found.");
  const now = new Date().toISOString();
  if (decision === "approve") {
    const requestEmail = normalizedEmail(request.data.email);
    if (
      request.data.auth_provider === "supabase" &&
      !requestEmail
    ) {
      throw new Error("This request does not use a valid email address.");
    }
    const existing = await client
      .from("app_users")
      .select("id, auth_provider, display_name")
      .eq("workspace_id", request.data.workspace_id)
      .eq("entra_object_id", request.data.provider_subject)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data && existing.data.auth_provider !== request.data.auth_provider) {
      throw new Error("Identity already belongs to another authentication provider.");
    }
    let canonicalName =
      typeof existing.data?.display_name === "string"
        ? existing.data.display_name.trim()
        : request.data.display_name.trim();
    let approvedRole = role;
    let invitationId: string | null = null;

    // A Supabase profile name is user-editable. For a new workspace member,
    // take both the name and role from the owner's invitation rather than from
    // a pending access request. A previously suspended member keeps the
    // canonical name already stored in app_users.
    if (request.data.auth_provider === "supabase" && !existing.data) {
      if (!requestEmail) {
        throw new Error("This request does not use a valid email address.");
      }
      const invitation = await client
        .from("workspace_invitations")
        .select("id, display_name, app_role")
        .eq("workspace_id", workspace)
        .eq("status", "pending")
        .eq("email", requestEmail)
        .gt("expires_at", now)
        .maybeSingle();
      if (invitation.error) throw new Error(invitation.error.message);
      canonicalName =
        typeof invitation.data?.display_name === "string"
          ? invitation.data.display_name.trim()
          : "";
      if (!invitation.data?.id || !canonicalName) {
        throw new Error(
          "Invite this exact email address with the teammate’s full name before approving access."
        );
      }
      invitationId = invitation.data.id;
      approvedRole = invitation.data.app_role as WorkspaceRole;
    }
    if (canonicalName.length < 2 || canonicalName.length > 120) {
      throw new Error("A valid canonical member name is required.");
    }
    const values = {
      email:
        request.data.auth_provider === "supabase"
          ? requestEmail
          : request.data.email,
      display_name: canonicalName,
      app_role: approvedRole,
      auth_provider: request.data.auth_provider,
      active: !invitationId,
      approved_by: actorId,
      approved_at: invitationId ? null : now,
    };
    const user = existing.data
      ? await client
          .from("app_users")
          .update(values)
          .eq("id", existing.data.id)
          .eq("workspace_id", workspace)
          .eq("auth_provider", request.data.auth_provider)
          .eq("entra_object_id", request.data.provider_subject)
          .select("id")
          .single()
      : await client.from("app_users").insert({
          workspace_id: request.data.workspace_id,
          entra_object_id: request.data.provider_subject,
          ...values,
        }).select("id").single();
    if (user.error || !user.data?.id) {
      throw new Error(user.error?.message || "Could not approve user.");
    }
    if (invitationId) {
      const accepted = await client
        .from("workspace_invitations")
        .update({
          status: "accepted",
          accepted_by: user.data.id,
          accepted_at: now,
        })
        .eq("id", invitationId)
        .eq("workspace_id", workspace)
        .eq("status", "pending")
        .gt("expires_at", now)
        .select("id")
        .maybeSingle();
      if (accepted.error || !accepted.data?.id) {
        const rolledBack = await client
          .from("app_users")
          .delete()
          .eq("id", user.data.id)
          .eq("workspace_id", workspace)
          .eq("active", false);
        if (rolledBack.error) throw new Error(rolledBack.error.message);
        throw new Error(
          accepted.error?.message || "Invitation is no longer available."
        );
      }
      const activated = await client
        .from("app_users")
        .update({ active: true, approved_at: now })
        .eq("id", user.data.id)
        .eq("workspace_id", workspace)
        .eq("active", false)
        .select("id")
        .maybeSingle();
      if (activated.error || !activated.data?.id) {
        throw new Error(
          activated.error?.message || "Could not activate user."
        );
      }
    }
  }
  const reviewed = await client
    .from("access_requests")
    .update({ status: decision === "approve" ? "approved" : "rejected", reviewed_by: actorId, reviewed_at: now, updated_at: now })
    .eq("id", requestId)
    .eq("workspace_id", workspace);
  if (reviewed.error) throw new Error(reviewed.error.message);
}

export async function updateWorkspaceMember(
  workspace: string,
  memberId: string,
  patch: { role?: WorkspaceRole; active?: boolean; displayName?: string }
) {
  const client = adminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.role) update.app_role = patch.role;
  if (typeof patch.active === "boolean") update.active = patch.active;
  if (patch.displayName) update.display_name = patch.displayName;
  const result = await client
    .from("app_users")
    .update(update)
    .eq("id", memberId)
    .eq("workspace_id", workspace);
  if (result.error) throw new Error(result.error.message);
}
