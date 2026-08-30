import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { getRole } from "@/lib/role";
import { getCurrentUser } from "@/lib/currentUser";
import { announcementEmailFor, pendingAnnouncements } from "@/lib/announcementEmails";
import { RELEASE_NOTES } from "@/lib/releaseNotes";
import {
  digestEmailFor,
  linesFor,
  planRoadmapDigest,
  roadmapChangesSince,
} from "@/lib/roadmapDigest";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { buildMemberDigestEmail } from "@/lib/monthlyEmails";

/**
 * SHOW ME THE EMAIL (Anir, Aug 30, on the three automated emails: "I need to be
 * able to see what these are, though — I should be able to SEE what they look
 * like").
 *
 * The box described them in a sentence each, which tells you an email exists
 * and nothing about what lands in somebody's inbox. This builds the real thing
 * with the SAME functions the cron routes send with, so a preview cannot drift
 * from what actually goes out.
 *
 * IT NEVER SENDS. No mailer is touched here; the builders return the document
 * and this hands it back as text.
 *
 * The data is real wherever there is real data — the newest release note, the
 * roadmap changes actually waiting, this admin's own monthly digest. When there
 * is genuinely nothing queued (no roadmap change since the last send) the
 * preview says so rather than inventing a change that does not exist.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireModuleAccess("/admin");
  const role = await getRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const kind = new URL(request.url).searchParams.get("kind") || "";
  const me = await getCurrentUser();
  const member = {
    id: "preview",
    name: me.name || "there",
    email: me.email || "you@freyrsolutions.com",
  };

  try {
    if (kind === "release") {
      /* The one that would go out next, or the most recent major if the queue
         is empty — either way a real note, never a fabricated one. */
      const pending = await pendingAnnouncements().catch(() => []);
      const note =
        pending[0] ??
        [...RELEASE_NOTES].reverse().find((n) => n.major) ??
        RELEASE_NOTES[RELEASE_NOTES.length - 1];
      if (!note) {
        return NextResponse.json({
          empty: "There are no release notes yet, so there is nothing to preview.",
        });
      }
      const mail = announcementEmailFor(note, member);
      return NextResponse.json({
        subject: mail.subject,
        html: mail.html,
        note: pending.length
          ? "This is the next one waiting to go out."
          : "Nothing is queued, so this is the most recent major release.",
      });
    }

    if (kind === "roadmap") {
      const plan = await planRoadmapDigest().catch(() => null);
      const subjects =
        plan?.subjects?.length
          ? plan.subjects
          : await roadmapChangesSince(0).catch(() => []);
      if (!subjects.length) {
        return NextResponse.json({
          empty:
            "Nothing has changed on the roadmap since the last digest, so there is nothing to preview.",
        });
      }
      /* The reader's OWN copy: linesFor redacts by who they are, and that
         redaction is part of what the email is. */
      const workspace = process.env.FREYR_WORKSPACE_ID;
      const directory = workspace
        ? await listWorkspaceAccess(workspace).catch(() => null)
        : null;
      const asMember = directory?.members.find(
        (m) =>
          (m.email ?? "").trim().toLowerCase() ===
          member.email.trim().toLowerCase()
      );
      if (!asMember) {
        return NextResponse.json({
          empty:
            "This digest is built per person from the workspace directory, and your row could not be found.",
        });
      }
      const built = subjects
        .slice(0, 6)
        .map((subject) => ({ subject, lines: linesFor(subject, asMember) }))
        .filter((entry) => entry.lines.length > 0);
      if (!built.length) {
        return NextResponse.json({
          empty:
            "There are roadmap changes, but none of them would be in your copy of the digest.",
        });
      }
      const mail = digestEmailFor(asMember, built);
      return NextResponse.json({
        subject: mail.subject,
        html: mail.html,
        note: plan?.subjects?.length
          ? "Built from the changes waiting to go out."
          : "Nothing is waiting, so this is built from the latest roadmap changes.",
      });
    }

    if (kind === "monthly") {
      const mail = await buildMemberDigestEmail(member.email, Date.now());
      if (!mail) {
        return NextResponse.json({
          empty:
            "The monthly digest is built per person from the workspace directory, and yours could not be built here.",
        });
      }
      return NextResponse.json({
        subject: mail.subject,
        html: mail.html,
        note: "This is your own copy, built from this month's numbers.",
      });
    }

    return NextResponse.json({ error: "Unknown email." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "That email could not be built right now." },
      { status: 500 }
    );
  }
}
