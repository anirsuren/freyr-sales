import "server-only";

import { listWorkspaceAccess, type AccessMember } from "./accessStore";
import { emailShell, mailerConfigured, sendMail } from "./mailer";
import {
  claimStoreLock,
  readRow,
  releaseStoreLock,
  storeEnvReady,
  writeRow,
} from "./monthlyEmailRun";
import {
  initializeLiveOfferings,
  isOfferingOwner,
  listFdlComponents,
  listOfferings,
  type Offering,
} from "./offerings";
import type { RoadmapVersion } from "./roadmapVersions";
import {
  readWorkspaceRoadmapSubscriptions,
  type RoadmapSubscription,
} from "./roadmapSubscriptions";
import type { PreparedEmail } from "./monthlyEmails";

/**
 * ONE EMAIL, NOT A STREAM.
 *
 * The requirement, from the product owner through Anir on Aug 21: stakeholders
 * hear when a roadmap moves, but "a guy who wants everything should not be
 * spammed with updates — so one email should go". A roadmap edit session is a
 * dozen saves in five minutes; a mail per save would train every recipient to
 * filter the sender inside a week, which is the same as not building this.
 *
 * So this collects EVERY change since the last run and gives each subscriber a
 * single mail listing all of them, grouped by the thing that changed. Run it
 * daily and it reads as a daily digest; run it weekly and it reads as a weekly
 * one. The cadence lives in whoever calls the endpoint, not in here.
 *
 * NOTHING HERE IS ARMED ON BOOT — the same rule the release announcements
 * follow (Anir, Aug 18: "you won't have to figure out for yourself if an email
 * should be sent out"). A person fires the endpoint, or a scheduler Anir set
 * up does. Importing this module sends nothing.
 */

const STATE_ROW = "roadmap-digest:state";
const LOCK_ROW = "roadmap-digest:lock";

function appUrl(): string {
  return (
    process.env.APP_PUBLIC_URL || "https://freyrsales.dev.freyrapps.com"
  ).replace(/\/$/, "");
}

/** One thing that moved, and every change to it since the watermark. */
export type DigestSubject = {
  kind: "component" | "offering";
  id: string;
  name: string;
  href: string;
  /** Newest first, the same order the history reads on the page. */
  versions: RoadmapVersion[];
  /** The offering row, kept so redaction can ask who owns it. */
  offering?: Offering;
};

function since(versions: RoadmapVersion[] | undefined, watermark: number): RoadmapVersion[] {
  return (versions ?? [])
    .filter((v) => {
      const at = Date.parse(v.savedAt || "");
      return Number.isFinite(at) && at > watermark;
    })
    .sort((a, b) => (b.version || 0) - (a.version || 0));
}

/**
 * Everything that changed since `watermark`, across both roadmap surfaces.
 * Components first: that is where roadmaps actually move (the offering-level
 * roadmap has had no editor since the tab was replaced).
 */
export async function roadmapChangesSince(watermark: number): Promise<DigestSubject[]> {
  await initializeLiveOfferings().catch(() => undefined);
  const out: DigestSubject[] = [];
  for (const component of listFdlComponents()) {
    const versions = since(component.roadmap_versions, watermark);
    if (!versions.length) continue;
    out.push({
      kind: "component",
      id: component.id,
      name: component.name,
      href: `${appUrl()}/components/${component.id}`,
      versions,
    });
  }
  for (const offering of listOfferings()) {
    const versions = since(offering.roadmap_versions, watermark);
    if (!versions.length) continue;
    out.push({
      kind: "offering",
      id: offering.id,
      name: offering.offering_name,
      href: `${appUrl()}/offerings/${offering.id}`,
      versions,
      offering,
    });
  }
  return out;
}

/**
 * WHAT THIS PERSON MAY BE TOLD.
 *
 * An offering's unreleased roadmap is restricted, and a mail is exactly the
 * kind of side door that leaks it — the same lesson the notification centre
 * learned on Aug 20, twice. `canViewNextCustomerVersion` reads the session, so
 * it cannot answer for a recipient who is not the one browsing; the same rule
 * is applied here from the directory row instead: admins and managers see the
 * particulars, so does the offering's owner and any email Freyr has approved
 * by configuration. Everyone else is told the roadmap moved, and goes and
 * looks.
 *
 * Components carry no such gate — their page shows planned versions to anyone
 * who can open it — so their lines go through whole. If that page is ever
 * gated, this must follow it the same day.
 */
/** A version's lines, with its stated reason appended to them. */
function withReason(v: { changes: string[]; reason?: string }): string[] {
  return v.reason ? [...v.changes, `Why: ${v.reason}`] : v.changes;
}

function linesFor(subject: DigestSubject, member: AccessMember): string[] {
  if (subject.kind === "component") {
    return subject.versions.flatMap(withReason);
  }
  const approved = new Set(
    (process.env.ROADMAP_NEXT_VIEWER_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  const maySeeNext =
    member.role === "admin" ||
    member.role === "bd_owner" ||
    (subject.offering ? isOfferingOwner(subject.offering, member.id) : false) ||
    Boolean(member.email && approved.has(member.email.toLowerCase()));
  return maySeeNext
    ? subject.versions.flatMap(withReason)
    : ["The roadmap was updated"];
}

function follows(sub: RoadmapSubscription, subject: DigestSubject): boolean {
  if (sub.everything) return true;
  return subject.kind === "component"
    ? sub.componentIds.includes(subject.id)
    : sub.offeringIds.includes(subject.id);
}

export function digestEmailFor(
  member: AccessMember,
  subjects: { subject: DigestSubject; lines: string[] }[]
): PreparedEmail {
  const count = subjects.reduce((n, s) => n + s.lines.length, 0);
  const first = member.name.split(" ")[0] || "there";
  const blocks = subjects
    .map(
      ({ subject, lines }) => `
      <p style="margin:18px 0 6px;font-weight:600;">
        <a href="${subject.href}" style="color:#0071e3;text-decoration:none;">${subject.name}</a>
      </p>
      <ul style="margin:0;padding-left:18px;">
        ${lines
          .map((line) => `<li style="margin:0 0 7px;line-height:1.5;">${line}</li>`)
          .join("")}
      </ul>`
    )
    .join("");
  const html = emailShell(
    "Roadmap changes",
    `<p>Hi ${first},</p>
     <p>${count === 1 ? "One change" : `${count} changes`} to ${
       subjects.length === 1 ? "a roadmap" : `${subjects.length} roadmaps`
     } you follow.</p>
     ${blocks}
     <p style="margin-top:22px;color:#6b7280;font-size:13px;">
       You get this because you asked to follow these roadmaps.
       <a href="${appUrl()}/notifications" style="color:#0071e3;">Change what you follow</a>.
     </p>`
  );
  const text = [
    `Hi ${first},`,
    "",
    `${count === 1 ? "One change" : `${count} changes`} to the roadmaps you follow.`,
    "",
    ...subjects.flatMap(({ subject, lines }) => [
      subject.name,
      ...lines.map((line) => `  • ${line}`),
      `  ${subject.href}`,
      "",
    ]),
    `Change what you follow: ${appUrl()}/notifications`,
  ].join("\n");
  return {
    to: [member.email as string],
    subject:
      subjects.length === 1
        ? `Roadmap changed: ${subjects[0].subject.name}`
        : `${count} roadmap changes`,
    html,
    text,
    reason: `roadmap digest for ${member.email}`,
  };
}

export type DigestPlan = {
  /** Millisecond watermark this plan was built from. */
  watermark: number;
  /** The newest savedAt seen, which becomes the next watermark. */
  through: number;
  subjects: DigestSubject[];
  emails: PreparedEmail[];
  /** Subscribers with nothing to hear about, for the dry run to show. */
  skipped: { email: string; reason: string }[];
};

/**
 * Build the run without sending any of it. Every caller goes through this,
 * including the sender, so `?dry=1` shows exactly what would leave.
 */
export async function planRoadmapDigest(): Promise<DigestPlan> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const state = await readRow(STATE_ROW).catch(() => null);
  const watermark = Number(state?.sentThrough) || 0;
  const empty: DigestPlan = {
    watermark,
    through: watermark,
    subjects: [],
    emails: [],
    skipped: [],
  };
  if (!workspace) return empty;

  const subjects = await roadmapChangesSince(watermark);
  if (!subjects.length) return empty;
  const through = subjects.reduce(
    (max, s) =>
      s.versions.reduce((m, v) => Math.max(m, Date.parse(v.savedAt || "") || 0), max),
    watermark
  );

  const [directory, subscriptions] = await Promise.all([
    listWorkspaceAccess(workspace).catch(() => null),
    readWorkspaceRoadmapSubscriptions(workspace).catch(() => new Map()),
  ]);
  /**
   * ONE MAIL PER PERSON, NOT PER MEMBERSHIP ROW.
   *
   * The directory legitimately carries more than one row for the same address
   * — a Microsoft membership and an email one, a subject minted twice — and
   * the first cut of this looped over rows. Found in the dry run on Aug 21:
   * anir.s@ appeared in "would email" AND in "skipped", from two rows for the
   * same human. Had both rows been subscribed he would have had two copies of
   * the digest, which is the exact spam this feature was written to avoid.
   * Addresses are the unit; the row that actually carries the subscription is
   * the one whose access decides what the mail may say.
   */
  const byEmail = new Map<string, PreparedEmail>();
  const skippedBy = new Map<string, string>();
  for (const member of directory?.members ?? []) {
    if (!member.active || !member.email || member.accountType !== "real") continue;
    const address = member.email.toLowerCase();
    if (byEmail.has(address)) continue;
    const sub = subscriptions.get(member.id);
    if (!sub || (!sub.everything && !sub.componentIds.length && !sub.offeringIds.length)) {
      if (!skippedBy.has(address)) skippedBy.set(address, "not subscribed");
      continue;
    }
    const mine = subjects
      .filter((subject) => follows(sub, subject))
      .map((subject) => ({ subject, lines: linesFor(subject, member) }))
      .filter((entry) => entry.lines.length > 0);
    if (!mine.length) {
      skippedBy.set(address, "follows nothing that changed");
      continue;
    }
    byEmail.set(address, digestEmailFor(member, mine));
    skippedBy.delete(address);
  }
  const emails = Array.from(byEmail.values());
  const skipped = Array.from(skippedBy.entries())
    .filter(([address]) => !byEmail.has(address))
    .map(([email, reason]) => ({ email, reason }));
  return { watermark, through, subjects, emails, skipped };
}

export type DigestRunResult = {
  sent: boolean;
  reason?: string;
  delivered?: number;
  failed?: string[];
  through?: string;
};

/**
 * Send it. `force` is required for the same reason the announcement sender
 * requires it: no code path may quietly start mailing people because a timer
 * fired somewhere. The lock and the watermark together mean a double fire
 * delivers nothing twice.
 */
export async function sendRoadmapDigest(options?: {
  force?: boolean;
}): Promise<DigestRunResult> {
  if (!options?.force)
    return { sent: false, reason: "the digest only sends when a person fires it" };
  if (!storeEnvReady()) return { sent: false, reason: "missing env (database)" };
  if (!mailerConfigured()) return { sent: false, reason: "RESEND_API_KEY is not set" };

  const token = await claimStoreLock(LOCK_ROW);
  if (!token) return { sent: false, reason: "another digest run is going" };
  try {
    // Re-planned inside the lock: another container may have just advanced the
    // watermark, and a plan built outside it could re-send everything.
    const plan = await planRoadmapDigest();
    if (!plan.emails.length) {
      // Still advance, so changes nobody follows never pile up into a first
      // subscriber's welcome mail six weeks of history long.
      if (plan.through > plan.watermark)
        await writeRow(STATE_ROW, { sentThrough: plan.through });
      return { sent: false, reason: "nothing to send", delivered: 0 };
    }
    const failed: string[] = [];
    let delivered = 0;
    for (const email of plan.emails) {
      const result = await sendMail(email);
      if (result.ok) delivered += 1;
      else failed.push(`${email.to[0]}: ${result.error}`);
    }
    /* The watermark moves on a partial failure too. A retry would re-send the
       people who already got it, and a duplicate digest is worse than one
       person having to open the bell, which still carries every line. */
    await writeRow(STATE_ROW, { sentThrough: plan.through });
    return {
      sent: delivered > 0,
      delivered,
      failed,
      through: new Date(plan.through).toISOString(),
    };
  } finally {
    await releaseStoreLock(token, LOCK_ROW);
  }
}
