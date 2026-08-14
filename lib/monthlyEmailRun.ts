import "server-only";

import {
  buildOwnerRefreshEmails,
  buildRepUsageEmails,
  type PreparedEmail,
} from "./monthlyEmails";
import { mailerConfigured, sendMail } from "./mailer";
import { resetUsageCounters } from "./usageCounters";

/**
 * THE ONE PLACE THE MONTHLY NOTES ACTUALLY GO OUT.
 *
 * Both callers use this: the cron endpoint (a human or a schedule with
 * CRON_SECRET) and the in-app timer in monthlyEmailCron. They used to be one
 * inline loop in the route, which was fine while the route was the only way
 * in; the moment a second caller existed, two copies of "who gets what, and
 * when do the counters reset" would have drifted.
 *
 * WHY THERE IS A TIMER AT ALL. The route's own comment named a schedule,
 * `.github/workflows/monthly-emails.yml`, that was never created — so from the
 * day it shipped this endpoint sat waiting for a caller that did not exist and
 * not one monthly email was ever sent (found Aug 14). A GitHub Actions cron is
 * still not available to us: the deploy PAT lacks `workflow` scope, so no
 * agent can add a workflow file. Market Intel hit the same wall on Aug 11 and
 * solved it by arming a timer off the health endpoint the load balancer
 * already pings; this follows that precedent rather than inventing a second
 * one.
 */

const LOCK_ROW = "monthly-emails:lock";
const STATE_ROW = "monthly-emails:state";
/** Long enough to cover a slow batch, short enough that a crashed run does not
 *  block next month. */
const LOCK_MS = 15 * 60 * 1000;

function hasEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function readRow(id: string): Promise<any | null> {
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

async function writeRow(id: string, catalog: unknown): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({ id, catalog, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Same shape as the Market Intel lock: claim, then read back, because two
 *  instances that upsert in the same instant both believe they won. */
async function claimLock(): Promise<string | null> {
  const token = Math.random().toString(36).slice(2);
  const now = Date.now();
  const existing = await readRow(LOCK_ROW).catch(() => null);
  if (existing?.until && existing.until > now) return null;
  await writeRow(LOCK_ROW, { token, until: now + LOCK_MS });
  const confirmed = await readRow(LOCK_ROW).catch(() => null);
  return confirmed?.token === token ? token : null;
}

async function releaseLock(token: string): Promise<void> {
  const current = await readRow(LOCK_ROW).catch(() => null);
  if (current?.token === token) await writeRow(LOCK_ROW, { token, until: 0 });
}

/** "2026-08" — the unit the send is once-per. */
export function monthKey(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type MonthlySendResult = {
  sent: boolean;
  reason?: string;
  results?: Record<string, { sent: number; failed: string[] }>;
};

/**
 * Build and send both batches. Callers that want a preview use
 * buildOwnerRefreshEmails / buildRepUsageEmails directly, so a dry run can
 * never take the lock or reset a counter.
 */
export async function sendMonthlyEmails(options?: {
  only?: "owners" | "reps" | null;
  nowMs?: number;
}): Promise<MonthlySendResult> {
  if (!mailerConfigured())
    return { sent: false, reason: "RESEND_API_KEY is not set" };
  const nowMs = options?.nowMs ?? Date.now();
  const only = options?.only ?? null;

  const batches: { name: string; emails: PreparedEmail[] }[] = [];
  if (only !== "reps")
    batches.push({
      name: "owner-refresh",
      emails: await buildOwnerRefreshEmails(nowMs),
    });
  if (only !== "owners")
    batches.push({ name: "rep-usage", emails: await buildRepUsageEmails(nowMs) });

  const results: Record<string, { sent: number; failed: string[] }> = {};
  for (const batch of batches) {
    const failed: string[] = [];
    let sent = 0;
    for (const email of batch.emails) {
      const result = await sendMail(email);
      if (result.ok) sent += 1;
      else failed.push(`${email.to.join(", ")}: ${result.error}`);
    }
    results[batch.name] = { sent, failed };
  }

  /**
   * Zero the counters only AFTER the rep note has actually gone out, and only
   * if it did. Resetting first would throw away a month of counting whenever a
   * send failed, and nobody would know until the next email read zero.
   */
  const repRun = results["rep-usage"];
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (workspace && repRun && repRun.sent > 0 && repRun.failed.length === 0) {
    await resetUsageCounters(workspace);
  }
  return { sent: true, results };
}

/**
 * The scheduled path: send at most once per calendar month, for the whole
 * deployment rather than per container.
 *
 * Deliberately "have we sent for THIS month yet?" rather than "is today the
 * 1st?". A container that happens to be rolling on the 1st, or a deploy that
 * restarts every task that morning, must not mean the month is silently
 * skipped — the first tick after the month turns over sends, whenever that is.
 */
export async function runMonthlyEmailsIfDue(options?: {
  force?: boolean;
  nowMs?: number;
}): Promise<MonthlySendResult & { month?: string }> {
  // The guard travels with the function, not just with the timer that calls
  // it, so a future caller cannot reintroduce the Aug 14 near-miss where a dev
  // server was seconds from mailing the whole company off .env.local's real
  // Resend key. Sending on purpose still works: that path is sendMonthlyEmails
  // via the CRON_SECRET endpoint, and a person had to go and do it.
  if (process.env.NODE_ENV !== "production" && !options?.force)
    return { sent: false, reason: "scheduled send is production-only" };
  if (!hasEnv()) return { sent: false, reason: "missing env (database)" };
  if (!mailerConfigured())
    return { sent: false, reason: "RESEND_API_KEY is not set" };

  const now = new Date(options?.nowMs ?? Date.now());
  const month = monthKey(now);
  const state = await readRow(STATE_ROW).catch(() => null);
  if (!options?.force && state?.lastSentMonth === month)
    return { sent: false, reason: "already sent this month", month };

  const token = await claimLock();
  if (!token)
    return { sent: false, reason: "another send is running", month };
  try {
    // Re-read inside the lock: another instance may have sent between our
    // check above and our claim.
    const fresh = await readRow(STATE_ROW).catch(() => null);
    if (!options?.force && fresh?.lastSentMonth === month)
      return { sent: false, reason: "already sent this month", month };

    const result = await sendMonthlyEmails({ nowMs: now.getTime() });
    if (result.sent) {
      await writeRow(STATE_ROW, {
        lastSentMonth: month,
        lastSentAt: now.toISOString(),
        results: result.results,
      });
    }
    return { ...result, month };
  } finally {
    await releaseLock(token);
  }
}
