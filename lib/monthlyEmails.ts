import "server-only";

import { listOfferings } from "./offerings";
import { listWorkspaceAccess } from "./accessStore";
import { emailShell } from "./mailer";
import {
  emptyUsageCounters,
  readUsageCounters,
  type UsageCounters,
} from "./usageCounters";

/**
 * THE TWO MONTHLY NOTES (Suren, Aug 13, on a call with Anir).
 *
 * 1. To OFFERING OWNERS — "what Suren wanted originally was for offering owners
 *    to keep updating their pages every month… a monthly reminder email to all
 *    the offering owners, to remind them that hey, it's been a month since you
 *    uploaded your previous materials, reminder to refresh them."
 *
 * 2. To SALES REPS, with their head in CC — a request from one of the sales
 *    heads: "these are the number of files you opened, these are the number of
 *    files you downloaded… this is the number of times you logged into the app.
 *    Something like that, every month."
 *
 * Both are built from what the app actually knows. The owner reminder counts a
 * real last-upload date per offering; the rep note counts real recorded events.
 * Neither invents a number, and an owner with nothing overdue is not emailed at
 * all — a monthly message that says "nothing to do" teaches people to ignore
 * the next one.
 */

export type PreparedEmail = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  /** For the dry run: who this is for and why it exists. */
  reason: string;
};

const DAY = 86_400_000;

function daysSince(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.floor((nowMs - at) / DAY);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

function appUrl(path: string): string {
  const base = (process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * One note per owner whose offerings have gone a month or more without a new
 * file. Owners in good standing get nothing.
 */
export async function buildOwnerRefreshEmails(
  nowMs: number,
  staleDays = 30
): Promise<PreparedEmail[]> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  if (!directory) return [];
  const emailByMemberId = new Map(
    directory.members
      .filter((m) => m.active && m.email)
      .map((m) => [m.id, { email: m.email as string, name: m.name }])
  );

  // memberId → the offerings they own that have gone stale
  const stale = new Map<
    string,
    { offering: string; days: number | null; files: number }[]
  >();

  for (const offering of listOfferings()) {
    const materials = offering.materials ?? [];
    const newest = materials
      .map((m) => m.addedAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
    const days = daysSince(newest, nowMs);
    // Never uploaded at all counts as stale — that is exactly the page that
    // needs attention most.
    if (days !== null && days < staleDays) continue;
    for (const owner of offering.owners ?? []) {
      if (!emailByMemberId.has(owner.memberId)) continue;
      const rows = stale.get(owner.memberId) ?? [];
      rows.push({
        offering: offering.offering_name,
        days,
        files: materials.length,
      });
      stale.set(owner.memberId, rows);
    }
  }

  const out: PreparedEmail[] = [];
  for (const [memberId, rows] of stale) {
    const who = emailByMemberId.get(memberId);
    if (!who) continue;
    const lines = rows
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
      .map((r) => {
        const when =
          r.days === null
            ? "no material uploaded yet"
            : `last new file ${r.days} days ago`;
        return { name: r.offering, when, files: r.files };
      });

    const html = emailShell(
      "Time to refresh your offerings",
      `<p>Hi ${who.name.split(" ")[0]},</p>
       <p>These offerings you own have not had a new file in a while. A quick look
       is usually all it takes — replace anything out of date, and add whatever
       you have been sending customers by hand.</p>
       <table style="width:100%;border-collapse:collapse;margin:14px 0;">
         ${lines
           .map(
             (l) => `<tr>
               <td style="padding:7px 0;border-bottom:1px solid #e3e9f2;font-weight:600;">${l.name}</td>
               <td style="padding:7px 0;border-bottom:1px solid #e3e9f2;text-align:right;color:#55637a;">${l.when} · ${l.files} file${l.files === 1 ? "" : "s"}</td>
             </tr>`
           )
           .join("")}
       </table>
       <p><a href="${appUrl("/offerings")}" style="color:#0071e3;font-weight:600;">Open your offerings</a></p>`
    );
    const text = [
      `Hi ${who.name.split(" ")[0]},`,
      "",
      "These offerings you own have not had a new file in a while:",
      ...lines.map((l) => `  • ${l.name} — ${l.when} (${l.files} files)`),
      "",
      appUrl("/offerings"),
    ].join("\n");

    out.push({
      to: [who.email],
      subject: `Your offerings need a refresh (${rows.length})`,
      html,
      text,
      reason: `${who.name}: ${rows.length} offering(s) with no file in ${staleDays}+ days`,
    });
  }
  return out;
}

/**
 * One note per rep with last month's counts, their sales head in CC. Reps with
 * no recorded activity still get theirs — a month of zeros is the finding, and
 * hiding it would defeat the point of the head asking for the report.
 */
export async function buildRepUsageEmails(
  nowMs: number
): Promise<PreparedEmail[]> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  if (!directory) return [];

  const counters = await readUsageCounters(workspace);

  // The head who gets a copy. Configured rather than guessed: picking the
  // "most senior looking" person out of the directory would be a fabrication.
  const cc = (process.env.SALES_HEAD_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const reps = directory.members.filter(
    (m) => m.active && m.email && m.role === "rep"
  );
  // The window is whatever the counters have actually been running for, not an
  // assumed calendar month — the first send after this ships covers a few days,
  // and saying "August" over four days of counting would be a lie.
  const since = [...counters.values()].map((c) => c.since).find(Boolean);
  const period = since ? `since ${monthLabel(new Date(since))}` : monthLabel(new Date(nowMs));

  return reps.map((rep) => {
    const t: UsageCounters = counters.get(rep.id) ?? emptyUsageCounters();
    const rows: [string, number][] = [
      ["Times you signed in", t.logins],
      ["Files you opened", t.opened],
      ["Files you downloaded", t.downloaded],
    ];
    const html = emailShell(
      `Your activity ${period}`,
      `<p>Hi ${rep.name.split(" ")[0]},</p>
       <p>Here is what you did in the app last month.</p>
       <table style="width:100%;border-collapse:collapse;margin:14px 0;">
         ${rows
           .map(
             ([label, value]) => `<tr>
               <td style="padding:8px 0;border-bottom:1px solid #e3e9f2;">${label}</td>
               <td style="padding:8px 0;border-bottom:1px solid #e3e9f2;text-align:right;font-weight:700;font-size:16px;">${value}</td>
             </tr>`
           )
           .join("")}
       </table>
       <p><a href="${appUrl("/offerings")}" style="color:#0071e3;font-weight:600;">Open Freyr Sales</a></p>`
    );
    const text = [
      `Hi ${rep.name.split(" ")[0]},`,
      "",
      `Your Freyr Sales activity ${period}:`,
      ...rows.map(([label, value]) => `  ${label}: ${value}`),
      "",
      appUrl("/offerings"),
    ].join("\n");

    return {
      to: [rep.email as string],
      ...(cc.length ? { cc } : {}),
      subject: `Your activity ${period}`,
      html,
      text,
      reason: `${rep.name}: ${t.logins} sign-ins, ${t.opened} opened, ${t.downloaded} downloaded`,
    };
  });
}
