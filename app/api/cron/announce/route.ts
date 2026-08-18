import { type NextRequest, NextResponse } from "next/server";
import {
  announcementEmailFor,
  pendingAnnouncements,
  recipients,
  sendAnnouncementsIfDue,
} from "@/lib/announcementEmails";
import { RELEASE_NOTES } from "@/lib/releaseNotes";
import { mailerConfigured, sendMail } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RELEASE ANNOUNCEMENTS, ON DEMAND. The routine path is the in-app timer
 * (armed with the monthly notes off the health endpoint): ship a
 * lib/releaseNotes entry with major: true and the deployed app emails every
 * active member once. This endpoint exists for the parts a timer cannot do —
 * preview what is pending (?dry=1), send one person a test (?to=), and force
 * the run by hand (POST with no params). CRON_SECRET gates all of it.
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
  const pending = await pendingAnnouncements();

  if (dry) {
    return NextResponse.json({
      dry: true,
      mailerConfigured: mailerConfigured(),
      pending: pending.map((n) => ({ id: n.id, title: n.title })),
      recipients: await recipients(),
    });
  }

  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not set; nothing was sent." },
      { status: 503 }
    );
  }

  // One person, one note, [Test] prefix, ledger untouched.
  const testTo = url.searchParams.get("to")?.trim().toLowerCase();
  if (testTo) {
    const id = url.searchParams.get("id");
    const note =
      (id
        ? RELEASE_NOTES.find((n) => n.id === id)
        : (pending[0] ?? RELEASE_NOTES.filter((n) => n.major).at(-1))) ?? null;
    if (!note) {
      return NextResponse.json(
        { error: "No release note to send." },
        { status: 404 }
      );
    }
    const email = announcementEmailFor(note, {
      name: testTo.split("@")[0],
      email: testTo,
    });
    const result = await sendMail({
      ...email,
      subject: `[Test] ${email.subject}`,
    });
    return NextResponse.json(
      result.ok
        ? { ok: true, test: true, to: testTo, note: note.id }
        : { ok: false, test: true, to: testTo, error: result.error },
      { status: result.ok ? 200 : 502 }
    );
  }

  const result = await sendAnnouncementsIfDue({ force: true });
  return NextResponse.json(result, { status: result.sent ? 200 : 409 });
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
