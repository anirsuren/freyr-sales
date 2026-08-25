import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { emailFromAddress, sendTransactionalEmail } from "@/lib/email";
import {
  parseAddresses,
  readAdminEmails,
  recordAdminEmail,
} from "@/lib/adminEmail";

export const dynamic = "force-dynamic";

/**
 * THE ADMIN COMPOSER'S DOOR (Anir, Aug 25: "build the email stuff out for
 * admins").
 *
 * ADMINS ONLY, and checked here rather than trusted from the page: a route
 * that sends mail out of the company on somebody's say-so is the one place a
 * missing server check actually costs something.
 *
 * Recipients are NOT required to have accounts. That was the question he
 * asked, and the answer is yes — Resend takes any address, so the composer
 * reaches a customer's inbox as easily as a colleague's, and CC carries the
 * people who only need to see it.
 */

function refuse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdmin(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return { error: refuse("Not signed in.", 401) };
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    return { error: refuse("Only an admin can send email from here.", 403) };
  }
  return { me };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const state = await readAdminEmails();
  return NextResponse.json({
    ok: true,
    from: emailFromAddress(),
    live: getDataMode() === "live",
    emails: state.emails,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const me = gate.me!;

  const body = (await req.json().catch(() => ({}))) ?? {};
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  const to = parseAddresses(String(body.to ?? ""));
  const cc = parseAddresses(String(body.cc ?? ""));
  const bcc = parseAddresses(String(body.bcc ?? ""));
  const replyToParsed = parseAddresses(String(body.replyTo ?? ""));

  if (!to.valid.length) {
    return refuse(
      to.invalid.length
        ? `Not a valid address: ${to.invalid.join(", ")}`
        : "Say who this is going to.",
      400
    );
  }
  const badCopies = [...cc.invalid, ...bcc.invalid, ...replyToParsed.invalid];
  if (badCopies.length) {
    return refuse(`Not a valid address: ${badCopies.join(", ")}`, 400);
  }
  if (!subject) return refuse("Give the email a subject.", 400);
  if (!text) return refuse("The email has no message in it.", 400);

  /**
   * MOCK NEVER REACHES A REAL INBOX. Someone showing the app in Mock must be
   * able to press Send and see the whole flow without a customer receiving a
   * demo — the same rule sendEmail has always applied to outreach. It is
   * logged as "simulated" so the record does not claim a delivery.
   */
  const live = getDataMode() === "live";
  const recipients = to.valid.length + cc.valid.length + bcc.valid.length;

  if (!live) {
    const record = await recordAdminEmail({
      to: to.valid.join(", "),
      cc: cc.valid,
      bcc: bcc.valid,
      ...(replyToParsed.valid[0] ? { replyTo: replyToParsed.valid[0] } : {}),
      subject,
      body: text,
      sentBy: me.name,
      ...(me.email ? { sentByEmail: me.email } : {}),
      status: "simulated",
    });
    return NextResponse.json({
      ok: true,
      simulated: true,
      recipients,
      record,
      message:
        "Sample mode: nothing was sent. Switch to Real to deliver this for real.",
    });
  }

  // One send carrying every recipient, so the thread they see is one thread.
  const result = await sendTransactionalEmail({
    to: to.valid[0],
    cc: [...to.valid.slice(1), ...cc.valid],
    bcc: bcc.valid,
    ...(replyToParsed.valid[0] ? { replyTo: replyToParsed.valid[0] } : {}),
    subject,
    body: text,
  });

  const record = await recordAdminEmail({
    to: to.valid.join(", "),
    cc: cc.valid,
    bcc: bcc.valid,
    ...(replyToParsed.valid[0] ? { replyTo: replyToParsed.valid[0] } : {}),
    subject,
    body: text,
    sentBy: me.name,
    ...(me.email ? { sentByEmail: me.email } : {}),
    status: result.ok ? "sent" : "failed",
    ...(result.error ? { error: result.error } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          result.error ||
          "The mail provider refused it. Nothing was delivered.",
        record,
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, recipients, record });
}
