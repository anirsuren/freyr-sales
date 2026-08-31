import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "./auth";
import { isTestAccountEmail } from "./testAccounts";
import {
  isBootstrapOwner,
  normalizedEmail,
  normalizeWorkspaceRole,
  providerForAuthMode,
  type WorkspaceRole,
} from "./accessControl";
import { isAutoApprovedEmail } from "./authEmailPolicy";
import { authUrl } from "./authOrigin";
import { sendTransactionalEmail, type EmailResult } from "./email";
import {
  notifyAccessChanged,
  notifyMemberJoined,
  notifyRoleChanged,
} from "./adminNotify";
import { getDataMode } from "./dataMode";
import { legacyAccountTypeForMember } from "./legacyAccountClassification";

export type AccessMember = {
  id: string;
  name: string;
  email: string | null;
  role: WorkspaceRole;
  active: boolean;
  accountType: "real" | "test";
  lastSeenAt: string | null;
  /** When this person joined the workspace (Anir, Aug 12: "I would like to
   *  see when they join when I click on them"). */
  joinedAt: string | null;
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
  /** When it was sent, and by whom. An invitation nobody can attribute is
   *  not much of an invitation (Anir, Aug 15: "I need to know who sent it"). */
  createdAt: string;
  invitedBy: string | null;
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
      .select("id, auth_provider, entra_object_id, active, account_type")
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

  /**
   * ONE PERSON, MANY WAYS IN (Anir, Aug 17: signing in with Microsoft minted
   * a second, empty "Anir S" — "where the fuck is all my data? … make sure
   * the next time I sign in with Microsoft it recognizes that that email is
   * the same as my email-password login and it links").
   *
   * Every sign-in method carries its own provider subject, but a VERIFIED
   * email names one person — the same trust domain auto-join already stands
   * on ("provider sign-in only completes after email confirmation"). The
   * OLDEST active membership with this email is canonical, whichever subject
   * arrives. SSO stays optional: both subjects keep resolving to that one
   * membership, and an accidental duplicate a subject minted earlier folds
   * itself away the next time that subject signs in.
   */
  type MemberRow = {
    id: string;
    display_name: string;
    app_role: WorkspaceRole;
    active: boolean;
  };
  let canonical: MemberRow | null = null;
  if (email) {
    const byEmail = await client
      .from("app_users")
      .select("id, display_name, app_role, active")
      .eq("workspace_id", workspace)
      .eq("email", email)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (byEmail.error) throw new Error(byEmail.error.message);
    canonical = (byEmail.data as MemberRow | null) ?? null;
  }

  // A LOCAL DEBUG SESSION MUST NEVER WRITE MEMBERSHIP (see the longer note
  // below) — it may READ its way to the canonical member, nothing more.
  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE) {
    const devMember = existing?.active ? existing : canonical;
    return devMember
      ? {
          status: "approved",
          workspaceId: workspace,
          userId: devMember.id,
          role: normalizeWorkspaceRole(devMember.app_role) ?? "bd_member",
          displayName: devMember.display_name,
        }
      : { status: "pending", workspaceId: workspace };
  }

  if (canonical && (!existing || existing.id !== canonical.id)) {
    if (existing && existing.active) {
      // Self-heal: this subject owns a newer duplicate of the same person —
      // fold it away rather than leaving a ghost on the Team page.
      const folded = await client
        .from("app_users")
        .update({ active: false })
        .eq("id", existing.id)
        .eq("workspace_id", workspace);
      if (folded.error) throw new Error(folded.error.message);
    }
    const seen = await client
      .from("app_users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", canonical.id)
      .eq("workspace_id", workspace);
    if (seen.error) throw new Error(seen.error.message);
    return {
      status: "approved",
      workspaceId: workspace,
      userId: canonical.id,
      role: normalizeWorkspaceRole(canonical.app_role) ?? "bd_member",
      displayName: canonical.display_name,
    };
  }

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
      role: normalizeWorkspaceRole(existing.app_role) ?? "bd_member",
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
        requested_role: "bd_member",
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
    invitedRole = normalizeWorkspaceRole(invitation.data?.app_role);
    invitationId = invitation.data?.id || null;
    invitedDisplayName =
      typeof invitation.data?.display_name === "string"
        ? invitation.data.display_name.trim()
        : null;
  }

  // (The unauthenticated dev harness already returned above — the guard that
  // used to sit here, born of "why the fuck are there always two of me?"
  // (Anir, Aug 9), moved up so a debug session can read its way to the
  // canonical member but still never writes membership.)
  const bootstrapOwner = isBootstrapOwner(user);
  // Company-domain auto-join (Suren): a colleague signing in with a VERIFIED
  // company email already belongs here — the domain itself is the invitation.
  // They activate immediately as a sales member; provider sign-in only
  // completes after email confirmation, so the address is trusted.
  const domainMember =
    !bootstrapOwner && !invitedRole && isAutoApprovedEmail(email);
  const role: WorkspaceRole | null = bootstrapOwner
    ? "admin"
    : invitedRole ?? (domainMember ? "bd_member" : null);
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
        /* A reserved claude-check- address is a testing account, and every
           people-picker that filters on account_type keeps those out of the
           lists real colleagues belong in. */
        account_type: isTestAccountEmail(email) ? "test" : "real",
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
    /**
     * THE OTHER HALF OF THE INVITATION (Anir, Aug 25: "when they sign up and
     * create the account, it sends me an email because it went from Pending to
     * whatever, because they signed up, so I need to know").
     *
     * Deliberately not awaited: a mail that fails must never undo a signup
     * that succeeded. The person is in either way; the admins simply were not
     * told, which adminNotify logs.
     */
    /**
     * A TESTING ACCOUNT DOES NOT ANNOUNCE ITSELF.
     *
     * Anir, Aug 31: "stop spamming us." Every @freyrsolutions.com address
     * auto-joins, and joining mails every admin — so an account created to
     * check what a BD Member sees put a "joined the workspace" notice in
     * Saras's and Suren's inbox, three times before anybody said so. Right for
     * a new hire, wrong for something that lives for ten minutes.
     *
     * The reserved prefix is the whole difference, and it is checked HERE
     * rather than inside notifyMemberJoined so the intent is visible at the
     * one place that decides to tell people.
     */
    if (!isTestAccountEmail(email)) {
      void notifyMemberJoined({
        name: (activated.display_name || user.name || email || "Somebody").trim(),
        email: email || "",
        role,
        viaInvitation: !!invitationId,
      });
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
      requested_role: "bd_member",
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
  const classifiedMembers = await client
      .from("app_users")
      .select("id, display_name, email, app_role, active, account_type, last_seen_at, created_at")
      .eq("workspace_id", workspace)
      .order("display_name");
  let memberRows: Array<{
    id: string;
    display_name: string;
    email: string | null;
    app_role: string;
    active: boolean;
    account_type?: string | null;
    last_seen_at: string | null;
    created_at?: string | null;
  }> = classifiedMembers.data || [];
  let membersError = classifiedMembers.error;
  let legacyAccountTypes = false;
  if (membersError && isMissingSchemaError(membersError)) {
    legacyAccountTypes = true;
    const legacyMembers = await client
      .from("app_users")
      .select("id, display_name, email, app_role, active, last_seen_at, created_at")
      .eq("workspace_id", workspace)
      .order("display_name");
    memberRows = legacyMembers.data || [];
    membersError = legacyMembers.error;
  }
  const [requests, invitations] = await Promise.all([
    client
      .from("access_requests")
      .select("id, display_name, email, requested_role, created_at")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      .order("created_at"),
    /**
     * AN INVITATION IS SOMETHING A PERSON SENT (Anir, Aug 15: "The invitations
     * are people who have invited people... She's not supposed to be there").
     *
     * The signup path parks a placeholder row in this same table — no inviter,
     * 24-hour expiry — to stand in for a signup about to happen. Those were
     * being listed as "Pending invitations", so someone who joined through the
     * freyrsolutions.com domain rule appeared as though a teammate had invited
     * them. `invited_by` is what separates the two: the invite flow sets it,
     * the signup placeholder writes null.
     *
     * Expired rows are dropped too. A lapsed invitation is not pending.
     */
    client
      .from("workspace_invitations")
      .select("id, display_name, email, app_role, expires_at, created_at, invited_by")
      .eq("workspace_id", workspace)
      .eq("status", "pending")
      .not("invited_by", "is", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  if (membersError) throw new Error(membersError.message);
  for (const result of [requests, invitations]) {
    if (result.error) throw new Error(result.error.message);
  }
  const mappedMembers = memberRows
    .map((item) => {
      const accountType = legacyAccountTypes
        ? legacyAccountTypeForMember(item.id)
        : (item.account_type as
            | "real"
            | "test"
            | null);
      // Before migration 018, an unknown row has no explicit classification.
      // Fail closed in Real mode instead of accidentally exposing a test user.
      if (!accountType) return null;
      return {
        id: item.id,
        name: item.display_name,
        email: item.email,
        role: normalizeWorkspaceRole(item.app_role) ?? "bd_member",
        active: item.active,
        accountType,
        lastSeenAt: item.last_seen_at,
        joinedAt: (item as { created_at?: string | null }).created_at ?? null,
      };
    })
    .filter((member): member is AccessMember => member !== null);
  return {
    workspaceId: workspace,
    members:
      getDataMode() === "live"
        ? mappedMembers.filter((member) => member.accountType === "real")
        : mappedMembers,
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
      role: normalizeWorkspaceRole(item.app_role) ?? "bd_member",
      expiresAt: item.expires_at,
      createdAt: item.created_at,
      // The inviter's own name, resolved from the same directory this call
      // already loaded, so the card can say who sent it.
      invitedBy:
        memberRows.find((m) => m.id === item.invited_by)?.display_name ?? null,
    })),
  };
}

export async function inviteWorkspaceUser(
  workspace: string,
  actorId: string,
  nameValue: string,
  emailValue: string,
  role: WorkspaceRole,
  /** An optional line from the person doing the inviting. It is theirs, so it
   *  goes in the email as written (Anir, Aug 13: "a custom note too"). */
  noteValue?: string
): Promise<InvitationDelivery> {
  const name = nameValue.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    throw new Error("Enter the teammate’s full name.");
  }
  const email = normalizedEmail(emailValue);
  if (!email) throw new Error("Enter a valid email address.");
  // Trimmed and capped: this is free text that lands in an outbound email.
  const note = (noteValue || "").trim().slice(0, 600);
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
      // The inviter's own words, kept verbatim and clearly theirs.
      ...(note ? ["", note] : []),
      "",
      "Create your account using the exact email address that received this invitation:",
      invitationUrl.toString(),
      "",
      "This invitation expires in 14 days.",
    ].join("\n"),
  });

  return { email, expiresAt, emailResult };
}

/**
 * Supabase Auth runs a before-user-created hook (migration 009) that refuses to
 * create an identity unless a live invitation exists for the address. That hook
 * predates company-domain auto-join, so a colleague the application happily
 * admits was still rejected by the database with a bare 403.
 *
 * Rather than require a hand-applied schema change, record the invitation the
 * domain policy already implies: if this address is on an approved company
 * domain, it is entitled to join, so the server writes that entitlement down
 * before signup. Nothing is granted that `resolveWorkspaceAccess` would not
 * grant anyway, and the person still has to control the mailbox — Supabase
 * emails a confirmation link before the account can sign in.
 *
 * Returns false for any address the domain policy does not cover; those still
 * need a real invitation from a workspace owner.
 */
export async function ensureCompanyDomainInvitation(
  emailValue: string,
  nameValue: string
): Promise<boolean> {
  const email = normalizedEmail(emailValue);
  if (!email || !isAutoApprovedEmail(email)) return false;

  const client = adminClient();
  const workspace = await workspaceId(client);

  // Never overwrite a real invitation: a workspace owner may have invited this
  // person as an editor or admin, and an upsert would silently demote them.
  const existing = await client
    .from("workspace_invitations")
    .select("id, status, expires_at")
    .eq("workspace_id", workspace)
    .eq("email", email)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const live =
    existing.data?.status === "pending" &&
    !!existing.data.expires_at &&
    new Date(existing.data.expires_at).getTime() > Date.now();
  if (live) return true;

  const name = nameValue.trim().replace(/\s+/g, " ").slice(0, 120);
  const result = await client.from("workspace_invitations").upsert(
    {
      workspace_id: workspace,
      display_name: name || email.slice(0, email.indexOf("@")),
      email,
      app_role: "bd_member" satisfies WorkspaceRole,
      status: "pending",
      invited_by: null,
      accepted_by: null,
      accepted_at: null,
      // Short-lived on purpose: this stands in for the signup about to happen,
      // not a standing invitation someone can sit on.
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    { onConflict: "workspace_id,email" }
  );
  if (result.error) throw new Error(result.error.message);
  return true;
}

export async function reviewAccessRequest(
  workspace: string,
  actorId: string,
  requestId: string,
  decision: "approve" | "reject",
  role: WorkspaceRole = "bd_member"
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
      approvedRole = normalizeWorkspaceRole(invitation.data.app_role) ?? "bd_member";
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
          account_type: "real",
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

/**
 * THE HEARTBEAT BEHIND ONLINE STATUS. Called from /api/presence roughly once a
 * minute while a signed-in tab is open, so `last_seen_at` means "was using the
 * app", not "signed in at some point" — which is all it meant when only the
 * login path ever wrote it, and is why the directory could not tell anyone
 * apart. Fails quietly: a missed heartbeat degrades a presence dot, and is
 * never worth failing a page for.
 */
export async function touchMemberPresence(workspace: string, memberId: string) {
  const client = adminClient();
  await client
    .from("app_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("workspace_id", workspace);
}

export async function updateWorkspaceMember(
  workspace: string,
  memberId: string,
  patch: { role?: WorkspaceRole; active?: boolean; displayName?: string },
  /** Who made the change, for the notification. */
  changedBy?: string
) {
  const client = adminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.role) update.app_role = patch.role;
  if (typeof patch.active === "boolean") update.active = patch.active;
  if (patch.displayName) update.display_name = patch.displayName;
  /* Read the person BEFORE the write, so the notification can say what the
     role changed FROM. After the update that fact is gone. */
  const before = await client
    .from("app_users")
    .select("display_name, email, app_role, active")
    .eq("id", memberId)
    .eq("workspace_id", workspace)
    .maybeSingle();

  const result = await client
    .from("app_users")
    .update(update)
    .eq("id", memberId)
    .eq("workspace_id", workspace);
  if (result.error) throw new Error(result.error.message);

  /**
   * TELL THE ADMINS (Anir, Aug 25: "every time someone joins or someone's role
   * is changed, I need an email going from our inbox to the admins"). Not
   * awaited, for the same reason as the signup notice: the change already
   * happened and must stand whatever the mail does.
   */
  const who = before.data;
  /* SAME RULE AS JOINING: a reserved claude-check- account is a testing
     account, and cycling its role through ten privileges to see what each one
     sees must not put ten emails in an admin's inbox. */
  if (who && !isTestAccountEmail(who.email)) {
    const name = (who.display_name || who.email || "Somebody").trim();
    if (patch.role && patch.role !== who.app_role) {
      void notifyRoleChanged({
        name,
        email: who.email || "",
        from: String(who.app_role || "unknown"),
        to: patch.role,
        changedBy: changedBy || "An admin",
      });
    }
    if (typeof patch.active === "boolean" && patch.active !== who.active) {
      void notifyAccessChanged({
        name,
        email: who.email || "",
        active: patch.active,
        changedBy: changedBy || "An admin",
      });
    }
  }
}
