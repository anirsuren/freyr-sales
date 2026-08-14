/**
 * THE MONTHLY NOTES RUN THEMSELVES.
 *
 * Same shape, and the same reasoning, as armMarketIntelSelfRefresh: this lives
 * OUTSIDE instrumentation.ts because instrumentation compiles for the edge
 * runtime too, and a dynamic import that reaches Supabase or the mailer drags
 * node built-ins into the edge bundle. Only Node-runtime code imports this —
 * the health endpoint, which the load balancer pings continuously — so the
 * timer arms seconds after every boot with no edge exposure.
 *
 * The runner is cheap to call and no-ops in every case except "a new calendar
 * month has begun and nobody has sent yet", and it takes a database lock, so
 * running this on every instance is safe.
 */
const ARMED_KEY = "__MONTHLY_EMAILS_ARMED__";
const LOGGED_KEY = "__MONTHLY_EMAILS_FIRST_LOGGED__";
// Hourly. The window this is watching for is a month wide, so there is nothing
// to gain from checking harder, and each check is one small row read.
const CHECK_MS = 60 * 60 * 1000;

export function armMonthlyEmailSchedule(): void {
  /**
   * NEVER ARM OUTSIDE THE DEPLOYED APP.
   *
   * .env.local carries the real RESEND_API_KEY and the real workspace, so
   * without this line every dev server was ONE health check away from mailing
   * fifteen Freyr staff from someone's laptop. That is not theoretical: on
   * Aug 14 the review server armed this and was ~100 seconds from sending
   * before the timer was killed. A local run may still send deliberately, via
   * the cron endpoint with CRON_SECRET, which is an explicit act by a person.
   *
   * `next dev` is always development, so this covers :3001, :3006 and :3007.
   */
  if (process.env.NODE_ENV !== "production") return;

  const g = globalThis as Record<string, unknown>;
  if (g[ARMED_KEY]) return;
  g[ARMED_KEY] = true;

  const tick = async () => {
    try {
      const { runMonthlyEmailsIfDue } = await import("./monthlyEmailRun");
      const result = await runMonthlyEmailsIfDue();
      // Quiet by default: this no-ops ~730 times between sends, and a log line
      // an hour would bury anything worth reading. The first check after a
      // boot is logged so "is this armed?" has an answer in the logs.
      if (result.sent || !g[LOGGED_KEY]) {
        g[LOGGED_KEY] = true;
        console.log(`[monthly-emails] check: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error("[monthly-emails] scheduled send failed:", error);
    }
  };

  setInterval(tick, CHECK_MS);
  // Not at zero: a booting container is already loading the catalogue, and the
  // first tick reads the database. Two minutes in, the boot has settled.
  setTimeout(tick, 120 * 1000);
  console.log(
    "[monthly-emails] armed: due-check every 60 minutes, sends once per calendar month"
  );
}
