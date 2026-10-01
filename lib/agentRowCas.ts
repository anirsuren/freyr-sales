import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * READ, CHANGE, AND WRITE BACK ONLY IF NOBODY WROTE IN BETWEEN.
 *
 * Two proposals made at the same moment for one person each read the list,
 * added theirs and wrote it back, and the second write erased the first: its
 * "yes" then found nothing (found testing Sep 30). Each write here stamps a
 * fresh `version` inside the row; an update lands only if the version it read
 * is still there, otherwise it reads again and re-applies the change. No
 * database function is needed, so it works on any offering_catalog_state row.
 *
 * `change` returns the next catalog, or null to write nothing.
 */
export async function changeRow<T extends object>(
  db: SupabaseClient,
  id: string,
  change: (current: T | null) => T | null,
): Promise<T | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await db.from("offering_catalog_state").select("catalog").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const current = (data?.catalog ?? null) as (T & { version?: string }) | null;
    const changed = change(current);
    if (changed === null) return null;
    const next = { ...changed, version: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` } as T;
    if (!data) {
      const inserted = await db.from("offering_catalog_state").insert({ id, catalog: next });
      if (!inserted.error) return next;
      if (inserted.error.code !== "23505") throw new Error(inserted.error.message);
    } else {
      const base = db.from("offering_catalog_state").update({ catalog: next }).eq("id", id);
      const guarded = current?.version
        ? base.eq("catalog->>version", current.version)
        : base.is("catalog->>version", null);
      const updated = await guarded.select("id");
      if (updated.error) throw new Error(updated.error.message);
      if ((updated.data ?? []).length === 1) return next;
    }
    // Someone wrote first: wait a moment, read again, apply the change to what is there now.
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * (attempt + 1)));
  }
  throw new Error("The list kept changing while saving. Try again.");
}
