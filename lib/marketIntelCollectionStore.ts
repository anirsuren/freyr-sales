import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export function collectionKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) }) },
  });
}
export async function readCollectionRow(id: string): Promise<{ catalog: any; updated_at: string } | null> {
  const result = await db().from("offering_catalog_state").select("catalog,updated_at").eq("id", id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function writeCollectionRow(id: string, catalog: any, prior?: { updated_at: string } | null): Promise<boolean> {
  const row = { catalog, updated_at: new Date(Math.max(Date.now(), Date.parse(prior?.updated_at || "") + 1 || 0)).toISOString() };
  const result = prior === undefined
    ? await db().from("offering_catalog_state").upsert({ id, ...row })
    : prior
      ? await db().from("offering_catalog_state").update(row).eq("id", id).eq("updated_at", prior.updated_at).select("id")
      : await db().from("offering_catalog_state").insert({ id, ...row }).select("id");
  if (result.error?.code === "23505") return false;
  if (result.error) throw new Error(result.error.message);
  return prior === undefined || !!result.data?.length;
}

/** Company-scoped phases survive app restarts; completed paid work is reused. */
export async function collectionPhase<T>(companyId: string | undefined, input: unknown, phase: string, work: () => Promise<T>, assertOwner: () => Promise<void>): Promise<T> {
  if (!companyId) return work();
  const id = `market-intel:collection:${companyId}:${collectionKey(input)}:${phase}`;
  const prior = await readCollectionRow(id);
  if (prior?.catalog?.complete && !(phase === "identity" && prior.catalog.value?.via === "search") && !(phase === "website" && !prior.catalog.value?.updates?.length)) {
    const value = prior.catalog.value;
    // This attempt did not incur another provider charge.
    return (value && typeof value === "object" && "cost" in value ? { ...value, cost: 0 } : value) as T;
  }
  await assertOwner();
  const value = await work();
  await assertOwner();
  // Failed/empty identity probes are retryable, not successful checkpoints.
  if (value && typeof value === "object" && ((value as any).failed === true || (phase === "identity" && !(value as any).name))) return value;
  await writeCollectionRow(id, { complete: true, value, at: new Date().toISOString() });
  return value;
}
