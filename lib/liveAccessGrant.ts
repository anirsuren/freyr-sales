import type { AccessGrant } from "./accessControl";

/** Disabled members and stale role grants must lose authorization immediately. */
export async function accessGrantMemberIsActive(grant: AccessGrant): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const url = new URL("/rest/v1/app_users", base);
  url.searchParams.set("select", "id");
  url.searchParams.set("id", `eq.${grant.userId}`);
  url.searchParams.set("workspace_id", `eq.${grant.workspaceId}`);
  url.searchParams.set("active", "eq.true");
  url.searchParams.set("app_role", `eq.${grant.role}`);
  try {
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const rows: unknown = await response.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.id === grant.userId;
  } catch {
    return false;
  }
}
