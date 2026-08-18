import { type NextRequest, NextResponse } from "next/server";
import {
  buildOwnerRefreshEmails,
  buildRepUsageEmails,
  type PreparedEmail,
} from "@/lib/monthlyEmails";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { sendMonthlyEmails } from "@/lib/monthlyEmailRun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE MONTHLY SEND, ON DEMAND.
 *
 * The routine path is now the in-app schedule (lib/monthlyEmailCron), which
 * sends once per calendar month and is the only scheduler available to us: the
 * `.github/workflows/monthly-emails.yml` this comment used to name was never
 * created, and the deploy PAT cannot add it. This endpoint stays for the two
 * things a timer cannot do — preview, and send on request — and it is not
 * reachable by a signed-in person: it needs CRON_SECRET as a bearer token, so
 * nobody can trigger a mailout to the whole company by typing a URL.
 *
 * `?dry=1` builds every message and reports who would get what WITHOUT
 * sending, which is how this gets checked before it is ever pointed at real
 * inboxes. A dry run never takes the schedule's lock and never resets a
 * counter.
 *
 * NOTE that POSTing here sends immediately and does NOT mark the month as
 * done, so it stays a manual override rather than a way to accidentally
 * suppress the scheduled send.
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

  /**
   * TEST SEND TO ONE PERSON (Anir, Aug 18: "send me and only me a test
   * automated email — I wanna see how it works"). `?to=` sends ONLY the
   * prepared emails addressed to that person, exactly as the monthly run
   * would build them — and touches neither the once-a-month lock nor the
   * usage counters, so a test never eats the real send.
   */
  const testTo = url.searchParams.get("to")?.trim().toLowerCase();
  if (testTo) {
    // `of=` picks WHOSE prepared email to use when the delivery inbox differs
    // from the address the run built it for (a sandboxed mail account can
    // only deliver to its owner). Content is exactly the monthly build.
    const testOf =
      url.searchParams.get("of")?.trim().toLowerCase() || testTo;
    const mine = batches.flatMap((b) =>
      b.emails.filter((e) =>
        e.to.some((addr) => addr.toLowerCase() === testOf)
      )
    );
    if (mine.length === 0) {
      return NextResponse.json(
        { error: `No prepared email is addressed to ${testOf}.` },
        { status: 404 }
      );
    }
    const failed: string[] = [];
    let sent = 0;
    for (const email of mine) {
      const result = await sendMail({
        ...email,
        to: [testTo],
        cc: undefined,
        subject: `[Test] ${email.subject}`,
      });
      if (result.ok) sent += 1;
      else failed.push(result.error);
    }
    return NextResponse.json({
      ok: failed.length === 0,
      test: true,
      to: testTo,
      sent,
      subjects: mine.map((e) => e.subject),
      failed,
    });
  }

  const result = await sendMonthlyEmails({
    only: only === "owners" || only === "reps" ? only : null,
    nowMs,
  });
  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  return NextResponse.json({ ok: true, results: result.results });
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
