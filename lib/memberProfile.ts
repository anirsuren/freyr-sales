import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";
import { DEFAULT_FONT_PRESET, isFontPreset } from "@/lib/fontPresets";

export type MemberProfilePreferences = {
  title: string;
  signature: string;
  /** Which font combination this person chose (lib/fontPresets). */
  fontPreset: string;
  /** Guide rails on the summary trees (Opportunities, Customers). Off unless
   *  asked for (Anir, Sep 28: "that should be an option... a setting somewhere"). */
  treeGuides: boolean;
};

const EMPTY_PROFILE: MemberProfilePreferences = {
  title: "",
  signature: "",
  fontPreset: DEFAULT_FONT_PRESET,
  treeGuides: false,
};

function presetOf(value: unknown): string {
  return isFontPreset(value) ? value : DEFAULT_FONT_PRESET;
}

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

function workspaceRowPrefix(workspaceId: string) {
  return `member-profile:${workspaceId}:%`;
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
    fontPreset: presetOf(profile?.fontPreset),
    treeGuides: profile?.treeGuides === true,
  };
}

/**
 * Read the editable identity fields for every member in a workspace. Access
 * roles (admin/editor/sales) intentionally do not appear here: a permission is
 * not a person's job title. Team and rep pages use this map so the title a
 * person saves in Settings > Profile is the title everyone sees.
 */
export async function readWorkspaceMemberProfiles(
  workspaceId: string
): Promise<Map<string, MemberProfilePreferences>> {
  const db = client();
  const profiles = new Map<string, MemberProfilePreferences>();
  if (!db) return profiles;
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", workspaceRowPrefix(workspaceId));
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const catalog = row.catalog as {
      workspaceId?: unknown;
      userId?: unknown;
      profile?: Record<string, unknown>;
    } | null;
    if (
      catalog?.workspaceId !== workspaceId ||
      typeof catalog.userId !== "string"
    ) {
      continue;
    }
    profiles.set(catalog.userId, {
      title: clean(catalog.profile?.title, 160),
      signature: clean(catalog.profile?.signature, 4_000),
      fontPreset: presetOf(catalog.profile?.fontPreset),
      treeGuides: catalog.profile?.treeGuides === true,
    });
  }
  return profiles;
}

/**
 * The stored profile object as it is, every key included. The typed reader
 * above returns only the fields the profile form owns; other features keep
 * their own keys on the same row (the WhatsApp link, for one) and must never
 * be dropped by a save that did not know about them.
 */
export async function readRawMemberProfile(
  scope: WorkspaceMemberScope
): Promise<Record<string, unknown>> {
  const db = client();
  if (!db) return {};
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", rowId(scope))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const profile = (data?.catalog as { profile?: unknown } | null)?.profile;
  return profile && typeof profile === "object" ? { ...(profile as Record<string, unknown>) } : {};
}

/**
 * Members whose stored profile has `value` at a JSON path, e.g.
 * `catalog->profile->whatsapp->>number`. Scope comes from the row body, never
 * from parsing the id.
 */
export async function findMemberProfilesBy(
  jsonPath: string,
  value: string
): Promise<Array<{ scope: WorkspaceMemberScope; profile: Record<string, unknown> }>> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", "member-profile:%")
    .eq(jsonPath, value);
  if (error) throw new Error(error.message);
  const rows: Array<{ scope: WorkspaceMemberScope; profile: Record<string, unknown> }> = [];
  for (const row of data || []) {
    const catalog = row.catalog as {
      workspaceId?: unknown;
      userId?: unknown;
      profile?: unknown;
    } | null;
    if (typeof catalog?.workspaceId !== "string" || typeof catalog.userId !== "string") continue;
    rows.push({
      scope: { workspaceId: catalog.workspaceId, userId: catalog.userId },
      profile:
        catalog.profile && typeof catalog.profile === "object"
          ? (catalog.profile as Record<string, unknown>)
          : {},
    });
  }
  return rows;
}

/**
 * Set or remove keys on the profile that are not part of the form: a value
 * of `undefined` deletes the key. The form's own fields are left as they are.
 */
export async function patchMemberProfileExtras(
  scope: WorkspaceMemberScope,
  patch: Record<string, unknown>
): Promise<void> {
  const db = client();
  if (!db) throw new Error("Profile storage is not configured.");
  const profile = await readRawMemberProfile(scope);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete profile[key];
    else profile[key] = value;
  }
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
}

export async function writeMemberProfile(
  scope: WorkspaceMemberScope,
  input: Partial<MemberProfilePreferences>
): Promise<MemberProfilePreferences> {
  const db = client();
  if (!db) throw new Error("Profile storage is not configured.");
  const [current, extras] = await Promise.all([
    readMemberProfile(scope),
    readRawMemberProfile(scope),
  ]);
  // Keys other features keep on this row survive a profile save.
  const profile = {
    ...extras,
    title:
      input.title === undefined ? current.title : clean(input.title, 160),
    signature:
      input.signature === undefined
        ? current.signature
        : clean(input.signature, 4_000),
    fontPreset:
      input.fontPreset === undefined ? current.fontPreset : presetOf(input.fontPreset),
    treeGuides:
      input.treeGuides === undefined ? current.treeGuides : input.treeGuides === true,
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
