import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeWorkspaceRole, type WorkspaceRole } from "./accessControl";
import {
  TOUR_FIRST_STEP,
  TOUR_LAST_STEP,
  TOUR_VERSION,
  type OnboardingAction,
  type OnboardingResponse,
  presentOnboardingState,
  type StoredOnboardingState,
} from "./onboarding";

export type OnboardingAccessContext = {
  subject: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

type OnboardingRow = StoredOnboardingState & {
  workspace_id: string;
  user_id: string;
  role_snapshot: WorkspaceRole;
};

type MetadataState = {
  version: number;
  status: StoredOnboardingState["status"];
  currentStep: number;
  roleSnapshot: WorkspaceRole;
  completedAt?: string;
  skippedAt?: string;
};

const METADATA_KEY = "freyr_onboarding_states";

export class OnboardingStoreError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 503
  ) {
    super(message);
  }
}

class OnboardingTableMissingError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMissingTableError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /user_onboarding_states.*(does not exist|schema cache)/i.test(
      error?.message || ""
    )
  );
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function isTerminalState(row: OnboardingRow | null): boolean {
  return row?.status === "completed" || row?.status === "skipped";
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new OnboardingStoreError(
      "Onboarding storage is not configured.",
      503
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyMembership(
  client: SupabaseClient,
  access: OnboardingAccessContext
): Promise<WorkspaceRole> {
  const member = await client
    .from("app_users")
    .select(
      "id, app_role, active, provider_subject, entra_object_id"
    )
    .eq("id", access.userId)
    .eq("workspace_id", access.workspaceId)
    .maybeSingle();

  if (member.error) {
    throw new OnboardingStoreError(
      "Onboarding storage is unavailable.",
      503
    );
  }
  const providerSubject =
    member.data?.provider_subject || member.data?.entra_object_id;
  // The row may still carry a pre-rename spelling ("sales"/"editor");
  // compare and return the canonical role, never the raw column.
  const memberRole = normalizeWorkspaceRole(member.data?.app_role);
  if (
    !member.data ||
    !member.data.active ||
    providerSubject !== access.subject ||
    memberRole !== access.role
  ) {
    throw new OnboardingStoreError(
      "Current workspace access is required.",
      403
    );
  }
  return memberRole;
}

async function readRow(
  client: SupabaseClient,
  access: OnboardingAccessContext
): Promise<OnboardingRow | null> {
  const result = await client
    .from("user_onboarding_states")
    .select(
      "workspace_id, user_id, version, role_snapshot, status, current_step, completed_at, skipped_at"
    )
    .eq("workspace_id", access.workspaceId)
    .eq("user_id", access.userId)
    .eq("version", TOUR_VERSION)
    .maybeSingle();
  if (result.error) {
    if (isMissingTableError(result.error)) {
      throw new OnboardingTableMissingError();
    }
    throw new OnboardingStoreError(
      "Onboarding storage is unavailable.",
      503
    );
  }
  return (result.data as OnboardingRow | null) || null;
}

function metadataStateToRow(
  value: unknown,
  access: OnboardingAccessContext
): OnboardingRow | null {
  if (!isRecord(value)) return null;
  if (
    value.version !== TOUR_VERSION ||
    !["in_progress", "completed", "skipped"].includes(String(value.status)) ||
    !Number.isSafeInteger(value.currentStep) ||
    Number(value.currentStep) < 0 ||
    Number(value.currentStep) > TOUR_LAST_STEP
  ) {
    return null;
  }
  const completedAt =
    typeof value.completedAt === "string" ? value.completedAt : null;
  const skippedAt =
    typeof value.skippedAt === "string" ? value.skippedAt : null;
  if (
    (value.status === "completed") !== !!completedAt ||
    (value.status === "skipped") !== !!skippedAt
  ) {
    return null;
  }
  // Snapshots written before the rename still say "sales"/"editor".
  const roleSnapshot =
    normalizeWorkspaceRole(value.roleSnapshot) ?? access.role;
  return {
    workspace_id: access.workspaceId,
    user_id: access.userId,
    version: TOUR_VERSION,
    role_snapshot: roleSnapshot,
    status: value.status as StoredOnboardingState["status"],
    current_step: Number(value.currentStep),
    completed_at: completedAt,
    skipped_at: skippedAt,
  };
}

async function authMetadata(
  client: SupabaseClient,
  access: OnboardingAccessContext
) {
  if (process.env.AUTH_MODE !== "supabase") {
    throw new OnboardingStoreError(
      "Apply the onboarding database migration before using this endpoint.",
      503
    );
  }
  const user = await client.auth.admin.getUserById(access.subject);
  if (user.error || !user.data.user) {
    throw new OnboardingStoreError(
      "Onboarding storage is unavailable.",
      503
    );
  }
  return {
    user: user.data.user,
    appMetadata: isRecord(user.data.user.app_metadata)
      ? user.data.user.app_metadata
      : {},
  };
}

function metadataVersionState(
  appMetadata: Record<string, unknown>,
  workspaceId: string
): unknown {
  const root = appMetadata[METADATA_KEY];
  if (!isRecord(root)) return null;
  const workspace = root[workspaceId];
  if (!isRecord(workspace)) return null;
  return workspace[String(TOUR_VERSION)] || null;
}

async function readMetadataRow(
  client: SupabaseClient,
  access: OnboardingAccessContext
): Promise<OnboardingRow | null> {
  const { appMetadata } = await authMetadata(client, access);
  return metadataStateToRow(
    metadataVersionState(appMetadata, access.workspaceId),
    access
  );
}

function nextMetadataState(
  role: WorkspaceRole,
  action: Exclude<OnboardingAction, { action: "reset" }>,
  existing: OnboardingRow | null
): MetadataState {
  const now = new Date().toISOString();
  const currentStep =
    action.currentStep ?? existing?.current_step ?? TOUR_FIRST_STEP;
  if (action.action === "complete") {
    return {
      version: TOUR_VERSION,
      status: "completed",
      currentStep,
      roleSnapshot: role,
      completedAt: now,
    };
  }
  if (action.action === "skip") {
    return {
      version: TOUR_VERSION,
      status: "skipped",
      currentStep,
      roleSnapshot: role,
      skippedAt: now,
    };
  }
  return {
    version: TOUR_VERSION,
    status: "in_progress",
    currentStep,
    roleSnapshot: role,
  };
}

async function writeMetadataState(
  client: SupabaseClient,
  access: OnboardingAccessContext,
  state: MetadataState | null
): Promise<OnboardingRow | null> {
  const { appMetadata } = await authMetadata(client, access);
  const currentState = metadataStateToRow(
    metadataVersionState(appMetadata, access.workspaceId),
    access
  );
  // A delayed request from another tab must not move a completed or skipped
  // tour back into progress. Reset is the only operation that passes null and
  // intentionally clears a terminal state.
  if (state && isTerminalState(currentState)) {
    return currentState;
  }
  const currentRootValue = appMetadata[METADATA_KEY];
  const currentRoot: Record<string, unknown> = isRecord(currentRootValue)
    ? currentRootValue
    : {};
  const root = { ...currentRoot };
  const currentWorkspaceValue = root[access.workspaceId];
  const currentWorkspace: Record<string, unknown> = isRecord(
    currentWorkspaceValue
  )
    ? currentWorkspaceValue
    : {};
  const workspace = { ...currentWorkspace };
  if (state) {
    workspace[String(TOUR_VERSION)] = state;
  } else {
    delete workspace[String(TOUR_VERSION)];
  }
  if (Object.keys(workspace).length > 0) {
    root[access.workspaceId] = workspace;
  } else {
    delete root[access.workspaceId];
  }
  // GoTrue merges app_metadata at the top level. Omitting a removed key would
  // leave the old value intact, so an empty onboarding root must be written as
  // explicit null. Limit the update to our own namespace to avoid touching
  // provider-managed or unrelated application metadata.
  const onboardingMetadata =
    Object.keys(root).length > 0 ? root : null;
  const updated = await client.auth.admin.updateUserById(access.subject, {
    app_metadata: { [METADATA_KEY]: onboardingMetadata },
  });
  if (updated.error || !updated.data.user) {
    throw new OnboardingStoreError(
      "Could not save onboarding progress.",
      503
    );
  }
  const updatedMetadata = isRecord(updated.data.user.app_metadata)
    ? updated.data.user.app_metadata
    : {};
  const persisted = metadataStateToRow(
    metadataVersionState(updatedMetadata, access.workspaceId),
    access
  );
  if ((state && !persisted) || (!state && persisted)) {
    throw new OnboardingStoreError(
      "Could not save onboarding progress.",
      503
    );
  }
  return persisted;
}

function response(
  role: WorkspaceRole,
  row: OnboardingRow | null
): OnboardingResponse {
  return {
    state: presentOnboardingState(row),
    role,
  };
}

export async function getOnboardingState(
  access: OnboardingAccessContext
): Promise<OnboardingResponse> {
  const client = adminClient();
  const role = await verifyMembership(client, access);
  try {
    const row = await readRow(client, access);
    if (row) return response(role, row);
    // Continue reading a pre-migration Supabase fallback until the user's next
    // mutation writes the authoritative table. A fallback lookup failure must
    // not make an available database fail.
    try {
      return response(role, await readMetadataRow(client, access));
    } catch {
      return response(role, null);
    }
  } catch (error) {
    if (!(error instanceof OnboardingTableMissingError)) throw error;
    return response(role, await readMetadataRow(client, access));
  }
}

export async function updateOnboardingState(
  access: OnboardingAccessContext,
  action: OnboardingAction
): Promise<OnboardingResponse> {
  const client = adminClient();
  const role = await verifyMembership(client, access);

  if (action.action === "reset") {
    const removed = await client
      .from("user_onboarding_states")
      .delete()
      .eq("workspace_id", access.workspaceId)
      .eq("user_id", access.userId)
      .eq("version", TOUR_VERSION);
    if (isMissingTableError(removed.error)) {
      return response(
        role,
        await writeMetadataState(client, access, null)
      );
    }
    if (removed.error) {
      throw new OnboardingStoreError(
        "Could not reset onboarding.",
        503
      );
    }
    // Clear a temporary pre-migration fallback too. Do not report success if
    // this fails: otherwise GET could resurrect the old terminal state after
    // the database row was removed.
    if (process.env.AUTH_MODE === "supabase") {
      await writeMetadataState(client, access, null);
    }
    return response(role, null);
  }

  let existing: OnboardingRow | null;
  let databaseExisting = false;
  try {
    existing = await readRow(client, access);
    databaseExisting = !!existing;
  } catch (error) {
    if (!(error instanceof OnboardingTableMissingError)) throw error;
    const fallbackExisting = await readMetadataRow(client, access);
    if (isTerminalState(fallbackExisting)) {
      return response(role, fallbackExisting);
    }
    const fallbackState = nextMetadataState(role, action, fallbackExisting);
    return response(
      role,
      await writeMetadataState(client, access, fallbackState)
    );
  }
  if (!existing && process.env.AUTH_MODE === "supabase") {
    // Mutation paths fail closed while checking the pre-migration fallback. A
    // temporary Auth Admin failure must not hide a legacy completed/skipped
    // state and replace it with a newly inserted in-progress database row.
    existing = await readMetadataRow(client, access);
  }
  if (isTerminalState(existing)) {
    return response(role, existing);
  }
  const currentStep =
    action.currentStep ?? existing?.current_step ?? TOUR_FIRST_STEP;
  const now = new Date().toISOString();
  const status =
    action.action === "complete"
      ? "completed"
      : action.action === "skip"
        ? "skipped"
        : "in_progress";

  const values = {
    workspace_id: access.workspaceId,
    user_id: access.userId,
    version: TOUR_VERSION,
    role_snapshot: role,
    status,
    current_step: currentStep,
    completed_at: status === "completed" ? now : null,
    skipped_at: status === "skipped" ? now : null,
    updated_at: now,
  };
  const saved = databaseExisting
    ? await client
        .from("user_onboarding_states")
        .update(values)
        .eq("workspace_id", access.workspaceId)
        .eq("user_id", access.userId)
        .eq("version", TOUR_VERSION)
        .eq("status", "in_progress")
        .select(
          "workspace_id, user_id, version, role_snapshot, status, current_step, completed_at, skipped_at"
        )
        .maybeSingle()
    : await client
        .from("user_onboarding_states")
        .insert(values)
    .select(
      "workspace_id, user_id, version, role_snapshot, status, current_step, completed_at, skipped_at"
    )
    .single();
  if (isMissingTableError(saved.error)) {
    const fallbackState = nextMetadataState(role, action, existing);
    return response(
      role,
      await writeMetadataState(client, access, fallbackState)
    );
  }
  if (isUniqueViolation(saved.error) || (!saved.error && !saved.data)) {
    const winner = await readRow(client, access);
    if (winner) return response(role, winner);
  }
  if (saved.error || !saved.data) {
    throw new OnboardingStoreError(
      "Could not save onboarding progress.",
      503
    );
  }
  // The database row is authoritative. Leaving a pre-migration metadata value
  // untouched avoids two auth-admin calls on every step; reset clears it.
  return response(role, saved.data as OnboardingRow);
}
