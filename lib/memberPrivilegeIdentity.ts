import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  privilegesForMember,
  reconcileMemberPrivilegeBindings,
  type PrivilegeMember,
} from "./memberPrivilegeBindings";
import type { PrivilegeState } from "./privileges";

export const privilegeMemberDirectory = cache(
  async (): Promise<PrivilegeMember[]> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const workspace = process.env.FREYR_WORKSPACE_ID;
    if (!url || !secret || !workspace) return [];
    const db = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rows: PrivilegeMember[] = [];
    // Supabase's default 1,000-row cap must not turn a duplicate name beyond the
    // first page into an apparently unique identity.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("app_users")
        .select("id,display_name,active")
        .eq("workspace_id", workspace)
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error("Cannot verify privilege membership.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) return rows;
    }
  },
);

export async function verifiedMemberPrivileges(
  state: PrivilegeState,
  memberId: string | null | undefined,
): Promise<string[]> {
  if (!memberId) return [];
  try {
    return privilegesForMember(
      state,
      memberId,
      await privilegeMemberDirectory(),
    );
  } catch {
    return [];
  }
}

/** Applied only by the authenticated server save route, never a browser import. */
export async function prepareMemberPrivilegeSave(
  next: PrivilegeState,
  previousState: PrivilegeState,
): Promise<PrivilegeState> {
  return reconcileMemberPrivilegeBindings(
    next,
    previousState,
    await privilegeMemberDirectory(),
  );
}
