import "server-only";

import { listWorkspaceAccess } from "./accessStore";
import { emailShell, mailerConfigured, sendMail } from "./mailer";
import {
  claimStoreLock,
  readRow,
  releaseStoreLock,
  storeEnvReady,
  writeRow,
} from "./monthlyEmailRun";
import { RELEASE_NOTES, type ReleaseNote } from "./releaseNotes";
import type { PreparedEmail } from "./monthlyEmails";

/**
 * RELEASE ANNOUNCEMENT EMAILS — SENT ON ANIR'S WORD, NEVER ON A TIMER.
 *
 * The flow he set (Aug 18): "when deploying I will specifically say that u
 * should send out an email and then when it deploys u make sure its good and
 * THEN after its good send the email. u wont have to figure out for urself
 * if an email should be sent out." So: the release ships a lib/releaseNotes
 * entry with major: true, the deploy is verified working, and only then does
 * a person fire /api/cron/announce (CRON_SECRET) to send it. Nothing here is
 * armed on boot. The once-only ledger and lock still guard against a double
 * fire.
 */

const STATE_ROW = "app-announcements:state";
const LOCK_ROW = "app-announcements:lock";

function appUrl(): string {
  return (
    process.env.APP_PUBLIC_URL || "https://freyrsales.dev.freyrapps.com"
  ).replace(/\/$/, "");
}

export function announcementEmailFor(
  note: ReleaseNote,
  member: { name: string; email: string }
): PreparedEmail {
  const html = emailShell(
    note.title,
    `<p>Hi ${member.name.split(" ")[0]},</p>
     <p>${note.summary}</p>
     <ul style="margin:14px 0;padding-left:18px;">
       ${note.points
         .map(
           (pt) =>
             `<li style="margin:0 0 9px;line-height:1.5;">${pt}</li>`
         )
         .join("")}
     </ul>
     <p style="margin-top:18px;"><a href="${appUrl()}" style="color:#0071e3;font-weight:600;">Open Freyr Sales</a></p>`
  );
  const text = [
    `Hi ${member.name.split(" ")[0]},`,
    "",
    note.summary,
    "",
    ...note.points.map((pt) => `  • ${pt}`),
    "",
    appUrl(),
  ].join("\n");
  return {
    to: [member.email],
    subject: `New in Freyr Sales: ${note.title}`,
    html,
    text,
    reason: `announcement ${note.id}`,
  };
}

/** Every active real member with an email, exactly as the directory holds
 *  them (Anir, Aug 18: "it should send to all emails it's fine"). */
export async function recipients(): Promise<{ name: string; email: string }[]> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  return (directory?.members ?? [])
    .filter((m) => m.active && m.email && m.accountType === "real")
    .map((m) => ({ name: m.name, email: m.email as string }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function pendingAnnouncements(): Promise<ReleaseNote[]> {
  const state = await readRow(STATE_ROW).catch(() => null);
  const sentIds: string[] = Array.isArray(state?.sentIds) ? state.sentIds : [];
  return RELEASE_NOTES.filter((n) => n.major && !sentIds.includes(n.id));
}

export type AnnouncementRunResult = {
  sent: boolean;
  reason?: string;
  notes?: { id: string; sent: number; failed: string[] }[];
};

export async function sendAnnouncementsIfDue(options?: {
  force?: boolean;
}): Promise<AnnouncementRunResult> {
  // Only the CRON_SECRET endpoint calls this, always with force — a
  // deliberate act by a person, after Anir said to send and the deploy was
  // verified. The guard stays so no future caller can quietly automate it.
  if (!options?.force)
    return { sent: false, reason: "announcements only send when a person fires them" };
  if (!storeEnvReady()) return { sent: false, reason: "missing env (database)" };
  if (!mailerConfigured())
    return { sent: false, reason: "RESEND_API_KEY is not set" };

  const pending = await pendingAnnouncements();
  if (pending.length === 0) return { sent: false, reason: "nothing pending" };

  const token = await claimStoreLock(LOCK_ROW);
  if (!token) return { sent: false, reason: "another send is running" };
  try {
    // Re-read inside the lock — another container may have just sent.
    const stillPending = await pendingAnnouncements();
    if (stillPending.length === 0)
      return { sent: false, reason: "nothing pending" };

    const people = await recipients();
    if (people.length === 0)
      return { sent: false, reason: "no active members with email" };

    const results: { id: string; sent: number; failed: string[] }[] = [];
    for (const note of stillPending) {
      const failed: string[] = [];
      let sent = 0;
      for (const person of people) {
        const result = await sendMail(announcementEmailFor(note, person));
        if (result.ok) sent += 1;
        else failed.push(`${person.email}: ${result.error}`);
      }
      results.push({ id: note.id, sent, failed });
      // Marked sent as soon as ANYONE got it — retrying a partial failure
      // would re-mail everyone who already received the note, which is worse
      // than a few misses (they are named in the state row and the logs).
      if (sent > 0) {
        const state = (await readRow(STATE_ROW).catch(() => null)) ?? {};
        const sentIds: string[] = Array.isArray(state.sentIds)
          ? state.sentIds
          : [];
        await writeRow(STATE_ROW, {
          ...state,
          sentIds: [...sentIds, note.id],
          lastSentAt: new Date().toISOString(),
          lastResults: results,
        });
      }
    }
    return { sent: results.some((r) => r.sent > 0), notes: results };
  } finally {
    await releaseStoreLock(token, LOCK_ROW);
  }
}
