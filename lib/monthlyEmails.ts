import "server-only";

import { listOfferings } from "./offerings";
import { listWorkspaceAccess } from "./accessStore";
import { emailShell } from "./mailer";
import {
  emptyUsageCounters,
  readUsageCounters,
  type UsageCounters,
} from "./usageCounters";
import { readOpportunities } from "./opportunities";
import { readTargets } from "./targets";
import { readPerformance } from "./performance";
import { opportunityValue, weightedValue } from "./opportunitiesShared";
import { readActivityMaster } from "./activityMaster";
import { masterFor } from "./activityMasterShared";

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
  /** The whole document, shell included — what actually gets sent. */
  html: string;
  /**
   * JUST THE BODY, with no <html> around it.
   *
   * The admin composer loads a draft into a rich-text box, and a rich-text box
   * cannot hold a document: the browser drops the doctype and the <body> and
   * leaves the shell's own header card and table rules sitting in the editor
   * as content (Anir, Aug 26: "make sure the emails actually work and are
   * formatted properly, I see tables and stuff"). The composer takes this and
   * puts the shell back on at send time.
   *
   * Only the builders whose output is offered as a DRAFT need it; the ones
   * that only ever send can leave it out.
   */
  bodyHtml?: string;
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
  // ALWAYS absolute. A bare "/offerings" in an email rendered as literal
  // "[/offerings]" text in Outlook (Anir, Aug 18: "Why does it say
  // /offerings?") — a mail client has no origin to resolve against.
  const base = (
    process.env.APP_PUBLIC_URL || "https://freyrsales.dev.freyrapps.com"
  ).replace(/\/$/, "");
  return `${base}${path}`;
}

function usd(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  initiated: "Initiated",
  under_progress: "Under progress",
  completed: "Completed",
};

/** One email section: a small caps heading and rows. */
function section(title: string, rowsHtml: string): string {
  return `<div style="margin:18px 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#55637a;">${title}</div>
<table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>`;
}

function row(left: string, right: string): string {
  return `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #e3e9f2;">${left}</td>
    <td style="padding:7px 0;border-bottom:1px solid #e3e9f2;text-align:right;font-weight:700;white-space:nowrap;">${right}</td>
  </tr>`;
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

    const bodyHtml = `<p>Hi ${who.name.split(" ")[0]},</p>
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
       <p><a href="${appUrl("/offerings")}" style="color:#0071e3;font-weight:600;">Open your offerings</a></p>`;
    const html = emailShell("Time to refresh your offerings", bodyHtml);
    const text = [
      `Hi ${who.name.split(" ")[0]},`,
      "",
      "These offerings you own have not had a new file in a while:",
      ...lines.map((l) => `  • ${l.name}. ${l.when} (${l.files} files)`),
      "",
      appUrl("/offerings"),
    ].join("\n");

    out.push({
      to: [who.email],
      subject: `Your offerings need a refresh (${rows.length})`,
      html,
      bodyHtml,
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
type DigestContext = {
  counters: Awaited<ReturnType<typeof readUsageCounters>>;
  opps: Awaited<ReturnType<typeof readOpportunities>> | null;
  targets: Awaited<ReturnType<typeof readTargets>> | null;
  perf: Awaited<ReturnType<typeof readPerformance>> | null;
  master: Awaited<ReturnType<typeof readActivityMaster>> | null;
  cc: string[];
  period: string;
  nowMs: number;
};

async function digestContext(nowMs: number, workspace: string): Promise<DigestContext> {
  const counters = await readUsageCounters(workspace);
  const [opps, targets, perf, master] = await Promise.all([
    readOpportunities().catch(() => null),
    readTargets().catch(() => null),
    readPerformance().catch(() => null),
    readActivityMaster().catch(() => null),
  ]);
  const cc = (process.env.SALES_HEAD_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const since = [...counters.values()].map((c) => c.since).find(Boolean);
  const period = since
    ? `since ${monthLabel(new Date(since))}`
    : monthLabel(new Date(nowMs));
  return { counters, opps, targets, perf, master, cc, period, nowMs };
}

/** One member's digest — the whole monthly note for one person. Used by the
 *  reps run and by the test hook (which may point at any active member). */
export async function buildMemberDigestEmail(
  email: string,
  nowMs: number
): Promise<PreparedEmail | null> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return null;
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  const member = directory?.members.find(
    (m) =>
      m.active &&
      (m.email ?? "").trim().toLowerCase() === email.trim().toLowerCase()
  );
  if (!member?.email) return null;
  const ctx = await digestContext(nowMs, workspace);
  return digestFor(member as { id: string; name: string; email: string }, ctx);
}

export async function buildRepUsageEmails(
  nowMs: number
): Promise<PreparedEmail[]> {
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const directory = await listWorkspaceAccess(workspace).catch(() => null);
  if (!directory) return [];

  const ctx = await digestContext(nowMs, workspace);
  const reps = directory.members.filter(
    (m) => m.active && m.email && m.role === "bd_member"
  );
  return reps.map((rep) =>
    digestFor(rep as { id: string; name: string; email: string }, ctx)
  );
}

/** EVERYTHING A SALES AGENT WOULD NEED (Anir, Aug 18: "shouldn't it be more
 *  information… think everything a sales agent would need"): their pipeline,
 *  their activities, their goals, their target accounts — all read from the
 *  same stores the app itself shows, never computed specially for the email. */
function digestFor(
  rep: { id: string; name: string; email: string },
  ctx: DigestContext
): PreparedEmail {
  const { counters, opps, targets, perf, master, cc, period, nowMs } = ctx;
  {
    const me = rep.name.trim().toLowerCase();
    const t: UsageCounters = counters.get(rep.id) ?? emptyUsageCounters();

    // --- Their pipeline: the deals with their name on them. ---
    const all = opps?.opportunities ?? [];
    const mine = all.filter(
      (o) => (o.owner ?? "").trim().toLowerCase() === me && o.level !== "Future"
    );
    const pipeValue = mine.reduce((sum, o) => sum + opportunityValue(o), 0);
    const pipeWeighted = mine.reduce((sum, o) => sum + weightedValue(o), 0);
    const futureCount = all.filter(
      (o) => (o.owner ?? "").trim().toLowerCase() === me && o.level === "Future"
    ).length;
    const nextSign = mine
      .flatMap((o) =>
        (o.lines ?? [])
          .map((l) => l.estSignDate)
          .filter((d): d is string => Boolean(d))
          .map((d) => ({ deal: o.name, date: d }))
      )
      .filter((x) => new Date(x.date).getTime() >= nowMs - 7 * DAY)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    // --- Activities logged in their name, anywhere in the pipeline. ---
    const acts = all
      .flatMap((o) =>
        (o.activities ?? [])
          .filter((a) => (a.person ?? "").trim().toLowerCase() === me)
          .map((a) => ({ ...a, deal: o.name }))
      )
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    // --- Goals with their results on them. ---
    const goalRows = (() => {
      if (!perf) return [] as { name: string; mineAmt: string; goal: string }[];
      const byGoal = new Map<string, number>();
      for (const a of perf.actuals) {
        if (a.person.trim().toLowerCase() !== me) continue;
        byGoal.set(a.goalId, (byGoal.get(a.goalId) ?? 0) + a.amount);
      }
      return [...byGoal.entries()]
        .map(([goalId, sum]) => {
          const g = perf.goals.find((x) => x.id === goalId);
          if (!g) return null;
          const fmt = (n: number) =>
            g.unit === "currency"
              ? usd(n)
              : g.unit === "percent"
                ? `${Math.round(n)}%`
                : String(Math.round(n));
          return {
            name: `${g.name} (${g.year})`,
            mineAmt: fmt(sum),
            goal: g.target > 0 ? `of the ${fmt(g.target)} target` : "no target set yet",
          };
        })
        .filter((x): x is { name: string; mineAmt: string; goal: string } => x !== null)
        .slice(0, 6);
    })();

    // --- Target accounts carrying their name. ---
    const myTargets = (targets?.targets ?? []).filter(
      (x) => (x.owner ?? "").trim().toLowerCase() === me
    );
    const targetPotential = myTargets.reduce((s, x) => s + (x.potential ?? 0), 0);

    const pipelineRows =
      mine.length === 0
        ? `<tr><td style="padding:7px 0;color:#55637a;">No open deals on your name yet. Pick one up on the Opportunities page.</td></tr>`
        : [
            row("Open deals you own", String(mine.length)),
            row("Total contract value", usd(pipeValue)),
            row("Weighted (value × confidence)", usd(pipeWeighted)),
            ...(nextSign
              ? [row(`Next signing: ${nextSign.deal}`, nextSign.date)]
              : []),
            ...(futureCount > 0
              ? [row("Future deals waiting on a pitch", String(futureCount))]
              : []),
          ].join("");

    const activityRows =
      acts.length === 0
        ? ""
        : acts
            .slice(0, 6)
            .map((a) => {
              const label = master
                ? (masterFor(master, a.activity)?.label ?? a.activity)
                : a.activity;
              return row(
                `${label} · ${a.deal}`,
                `${ACTIVITY_STATUS_LABEL[a.status] ?? a.status} · ${a.date ?? ""}`
              );
            })
            .join("") +
          (acts.length > 6
            ? `<tr><td style="padding:7px 0;color:#55637a;">and ${acts.length - 6} more in the app</td></tr>`
            : "");

    const goalHtml =
      goalRows.length === 0
        ? ""
        : goalRows
            .map((g) => row(g.name, `${g.mineAmt} <span style="font-weight:400;color:#55637a;">${g.goal}</span>`))
            .join("");

    const targetRows =
      myTargets.length === 0
        ? ""
        : [
            row("Accounts on your name", String(myTargets.length)),
            ...(targetPotential > 0
              ? [row("Estimated potential", usd(targetPotential))]
              : []),
          ].join("");

    const usageRows = [
      row("Times you signed in", String(t.logins)),
      row("Files you opened", String(t.opened)),
      row("Files you downloaded", String(t.downloaded)),
      row("Questions to the AI agent", String(t.agent)),
    ].join("");

    const html = emailShell(
      `Your month at Freyr Sales`,
      `<p>Hi ${rep.name.split(" ")[0]},</p>
       <p>Here is where your book stands ${period}.</p>
       ${section("Your pipeline", pipelineRows)}
       ${activityRows ? section("Activities you logged", activityRows) : ""}
       ${goalHtml ? section("Your goals", goalHtml) : ""}
       ${targetRows ? section("Your target accounts", targetRows) : ""}
       ${section("Your app activity", usageRows)}
       <p style="margin-top:18px;"><a href="${appUrl("/opportunities")}" style="color:#0071e3;font-weight:600;">Open your pipeline</a></p>`
    );

    const text = [
      `Hi ${rep.name.split(" ")[0]},`,
      "",
      `Your book ${period}:`,
      "",
      `Pipeline: ${mine.length} open deal(s), ${usd(pipeValue)} total, ${usd(pipeWeighted)} weighted`,
      ...(nextSign ? [`Next signing: ${nextSign.deal} on ${nextSign.date}`] : []),
      ...(acts.length ? [`Activities logged: ${acts.length}`] : []),
      ...goalRows.map((g) => `Goal ${g.name}: ${g.mineAmt} ${g.goal}`),
      ...(myTargets.length ? [`Target accounts: ${myTargets.length}`] : []),
      `App: ${t.logins} sign-ins, ${t.opened} files opened, ${t.downloaded} downloaded, ${t.agent} agent questions`,
      "",
      appUrl("/opportunities"),
    ].join("\n");

    return {
      to: [rep.email as string],
      ...(cc.length ? { cc } : {}),
      subject: `Your month at Freyr Sales`,
      html,
      text,
      reason: `${rep.name}: ${mine.length} deals ${usd(pipeValue)}, ${acts.length} activities, ${t.logins} sign-ins`,
    };
  }
}
