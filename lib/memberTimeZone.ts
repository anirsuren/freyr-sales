import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isValidTimeZone } from "@/lib/timeZone";

/**
 * WHICH CALENDAR DAY THE PERSON IS ON.
 *
 * Settings > Profile lets a person save a time zone (user-timezone:<user>);
 * most leave it on Auto, which the browser resolves and the server never
 * sees. The agent answers "today", "Friday" and "next Tuesday" on the saved
 * zone, else the workspace default APP_DEFAULT_TIMEZONE, else UTC, and it
 * says which zone it used so a wrong guess is visible before a YES.
 */
export async function memberTimeZone(userId: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && userId) {
    try {
      const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data } = await db
        .from("offering_catalog_state")
        .select("catalog")
        .eq("id", `user-timezone:${userId}`)
        .maybeSingle();
      const saved = (data?.catalog as { timeZone?: string } | null)?.timeZone ?? "";
      if (saved && isValidTimeZone(saved)) return saved;
    } catch {
      /* a store hiccup must not stop an answer; fall through to the default */
    }
  }
  const fallback = (process.env.APP_DEFAULT_TIMEZONE ?? "").trim();
  return fallback && isValidTimeZone(fallback) ? fallback : "UTC";
}
