import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * THREE NUMBERS ON THE PERSON'S OWN ROW.
 *
 * A sales head asked (via Suren, Aug 13) for a monthly note to each rep: files
 * opened, files downloaded, times signed in. The app recorded none of it — only
 * `last_seen_at`, a single timestamp overwritten on every visit, which cannot
 * answer "how many times".
 *
 * Counters on app_users rather than an events table (Anir: "it's not that
 * serious. If you have a user in the row in Supabase, everything should be
 * there"). The monthly job reads the three numbers, sends them, and resets them
 * for the next period.
 *
 * Counting NEVER blocks and never throws. A rep opening a deck must not see an
 * error because a counter was busy; a lost increment costs one number in one
 * email.
 */

export type UsageField = "login" | "open" | "download" | "agent";

export type UsageCounters = {
  logins: number;
  opened: number;
  downloaded: number;
  /** Questions asked to the AI agent (Anir, Aug 18). */
  agent: number;
  since: string | null;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Fire-and-forget. Nothing awaits this and nothing depends on it. */
export function bumpUsage(userId: string, field: UsageField): void {
  if (!userId) return;
  void (async () => {
    try {
      const client = adminClient();
      if (!client) return;
      // A database-side increment, not read-then-write: two clicks landing
      // together would otherwise lose one, and for "files opened" that is the
      // normal case rather than the rare one.
      await client.rpc("bump_usage", { p_user_id: userId, p_field: field });
    } catch {
      // A statistic is never worth failing a request over.
    }
  })();
}

/** Everyone's counters, keyed by app_users id. Empty on any failure. */
export async function readUsageCounters(
  workspaceId: string
): Promise<Map<string, UsageCounters>> {
  const out = new Map<string, UsageCounters>();
  try {
    const client = adminClient();
    if (!client) return out;
    const { data, error } = await client
      .from("app_users")
      .select(
        "id, login_count, files_opened, files_downloaded, agent_interactions, usage_period_start"
      )
      .eq("workspace_id", workspaceId);
    if (error || !data) return out;
    for (const row of data as {
      id: string;
      login_count: number | null;
      files_opened: number | null;
      files_downloaded: number | null;
      agent_interactions: number | null;
      usage_period_start: string | null;
    }[]) {
      out.set(row.id, {
        logins: row.login_count ?? 0,
        opened: row.files_opened ?? 0,
        downloaded: row.files_downloaded ?? 0,
        agent: row.agent_interactions ?? 0,
        since: row.usage_period_start,
      });
    }
  } catch {
    // No numbers is a worse email, not a failed one.
  }
  return out;
}

/**
 * Zero the counters and start a new period. Called only after the monthly mail
 * has gone out, so a failed send never silently discards a month of counting.
 */
export async function resetUsageCounters(workspaceId: string): Promise<void> {
  try {
    const client = adminClient();
    if (!client) return;
    await client
      .from("app_users")
      .update({
        login_count: 0,
        files_opened: 0,
        files_downloaded: 0,
        agent_interactions: 0,
        usage_period_start: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId);
  } catch {
    // Worst case the next month's numbers are cumulative, which is visible
    // and fixable — unlike a reset that ran before a send that failed.
  }
}

export function emptyUsageCounters(): UsageCounters {
  return { logins: 0, opened: 0, downloaded: 0, agent: 0, since: null };
}
