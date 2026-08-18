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
 * MAJOR UPDATES ANNOUNCE THEMSELVES (Anir, Aug 18: "if there is ever a major
 * update in the app, emails should be going out to users... This should be
 * automated").
 *
 * The trigger is the release itself: a deploy that ships a lib/releaseNotes
 * entry with major: true gets emailed to every active member, once, the first
 * time a production container ticks after boot. The once-only ledger and the
 * lock live in the same store rows pattern as the monthly notes, so two
 * containers can never double-send.
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

/** ONE EMAIL PER HUMAN INBOX. The directory can hold several rows that all
 *  land in the same mailbox — a duplicate membership, or +tag aliases like
 *  anir.s+3@ used for test sign-ins. An announcement mailed per ROW would put
 *  four copies in one inbox, so recipients collapse on the canonical mailbox
 *  (local part without the +tag), keeping the untagged row's name. */
function canonicalMailbox(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  return `${(local ?? "").split("+")[0]}@${domain ?? ""}`;
}

export async function recipients(): Promise<{ name: string; email: string }[]> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  const byInbox = new Map<string, { name: string; email: string }>();
  for (const m of directory?.members ?? []) {
    if (!m.active || !m.email || m.accountType !== "real") continue;
    const key = canonicalMailbox(m.email);
    const existing = byInbox.get(key);
    const untagged = !m.email.includes("+");
    if (!existing || (untagged && existing.email.includes("+"))) {
      byInbox.set(key, { name: m.name, email: key });
    }
  }
  return [...byInbox.values()].sort((a, b) => a.email.localeCompare(b.email));
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
  // Production-only, same near-miss reasoning as the monthly run: a dev
  // server holds the real mailer key, and an armed timer must never turn a
  // laptop boot into a company-wide email. Deliberate sends go through the
  // CRON_SECRET endpoint with force.
  if (process.env.NODE_ENV !== "production" && !options?.force)
    return { sent: false, reason: "scheduled send is production-only" };
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
