import { type NextRequest, NextResponse } from "next/server";
import {
  buildOwnerRefreshEmails,
  buildRepUsageEmails,
  type PreparedEmail,
} from "@/lib/monthlyEmails";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { resetUsageCounters } from "@/lib/usageCounters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE MONTHLY SEND.
 *
 * Hit by a schedule (.github/workflows/monthly-emails.yml) on the 1st. Not
 * reachable by a signed-in person: it needs CRON_SECRET as a bearer token, so
 * nobody can trigger a mailout to the whole company by typing a URL.
 *
 * `?dry=1` builds every message and reports who would get what WITHOUT sending
 * — which is how this gets checked before it is ever pointed at real inboxes.
 */
function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const offered =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (offered !== secret) return unauthorized();

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const only = url.searchParams.get("only"); // "owners" | "reps"
  const nowMs = Date.now();

  const batches: { name: string; emails: PreparedEmail[] }[] = [];
  if (only !== "reps") {
    batches.push({
      name: "owner-refresh",
      emails: await buildOwnerRefreshEmails(nowMs),
    });
  }
  if (only !== "owners") {
    batches.push({ name: "rep-usage", emails: await buildRepUsageEmails(nowMs) });
  }

  if (dry) {
    return NextResponse.json({
      dry: true,
      mailerConfigured: mailerConfigured(),
      batches: batches.map((b) => ({
        name: b.name,
        count: b.emails.length,
        recipients: b.emails.map((e) => ({
          to: e.to,
          cc: e.cc,
          subject: e.subject,
          reason: e.reason,
        })),
      })),
    });
  }

  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not set; nothing was sent." },
      { status: 503 }
    );
  }

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
  return NextResponse.json({ ok: true, results });
}

export async function POST(request: NextRequest) {
  return run(request);
}

/** GET is allowed only for the dry run, so a stray fetch can never send mail. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("dry") !== "1") {
    return NextResponse.json(
      { error: "Use POST to send, or ?dry=1 to preview." },
      { status: 405 }
    );
  }
  return run(request);
}
