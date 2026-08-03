import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";

export type MemberProfilePreferences = {
  title: string;
  signature: string;
};

const EMPTY_PROFILE: MemberProfilePreferences = {
  title: "",
  signature: "",
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowId(scope: WorkspaceMemberScope) {
  return `member-profile:${scope.workspaceId}:${scope.userId}`;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function readMemberProfile(
  scope: WorkspaceMemberScope
): Promise<MemberProfilePreferences> {
  const db = client();
  if (!db) return EMPTY_PROFILE;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const profile = (data?.catalog as { profile?: Record<string, unknown> } | null)
    ?.profile;
  return {
    title: clean(profile?.title, 160),
    signature: clean(profile?.signature, 4_000),
  };
}

export async function writeMemberProfile(
  scope: WorkspaceMemberScope,
  input: Partial<MemberProfilePreferences>
): Promise<MemberProfilePreferences> {
  const db = client();
  if (!db) throw new Error("Profile storage is not configured.");
  const current = await readMemberProfile(scope);
  const profile = {
    title:
      input.title === undefined ? current.title : clean(input.title, 160),
    signature:
      input.signature === undefined
        ? current.signature
        : clean(input.signature, 4_000),
  };
  const { error } = await db.from("offering_catalog_state").upsert(
    {
      id: rowId(scope),
      catalog: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        profile,
        updatedAt: new Date().toISOString(),
      },
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  return profile;
}
