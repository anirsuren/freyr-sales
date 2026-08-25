import "server-only";

import { sendTransactionalEmail } from "./email";

/**
 * TELLING THE ADMINS WHEN THE WORKSPACE CHANGES (Anir, Aug 25).
 *
 * Two he asked for by name:
 *
 *   "When I invite someone, it sends them an email, but then when they sign up
 *    and create the account, it sends me an email because it went from Pending
 *    to whatever, because they signed up, so I need to know."
 *
 *   "Every time someone joins or someone's role is changed, I need an email
 *    going from our inbox to the admins."
 *
 * An invitation is a promise nobody hears the end of: it leaves, and whether
 * the person ever arrives is invisible until somebody scrolls the member list
 * looking for them. These close that loop.
 *
 * NEVER THROWS, and never blocks the thing that triggered it. A notification
 * that fails must not undo a real signup or a real role change — the person
 * still joined, the role still changed, and the admins simply were not told.
 * Failures are logged with enough detail to diagnose, and that is all.
 */

type Admin = { name: string; email: string };

/** The people to tell. Admins only — a rep does not need the org's HR feed. */
export async function workspaceAdmins(): Promise<Admin[]> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return [];
  }
  try {
    // Required lazily so the SDK never rides into a client bundle.
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await client
      .from("app_users")
      .select("display_name, email, app_role, active")
      .eq("app_role", "admin")
      .eq("active", true);
    const seen = new Set<string>();
    return (data ?? [])
      .map((row: { display_name?: string; email?: string }) => ({
        name: (row.display_name || "").trim() || "Admin",
        email: (row.email || "").trim().toLowerCase(),
      }))
      .filter((a: Admin) => {
        if (!a.email || seen.has(a.email)) return false;
        seen.add(a.email);
        return true;
      });
  } catch {
    return [];
  }
}

async function tell(subject: string, lines: string[], html: string) {
  const admins = await workspaceAdmins();
  if (!admins.length) {
    console.warn("[admin-notify] no active admins to tell:", subject);
    return;
  }
  // One send carrying every admin: they are one audience, and a thread they
  // can all see beats N separate copies nobody can reply-all to.
  const [first, ...rest] = admins.map((a) => a.email);
  const result = await sendTransactionalEmail({
    to: first,
    ...(rest.length ? { cc: rest } : {}),
    subject,
    body: lines.join("\n"),
    html,
  });
  if (!result.ok) {
    console.error("[admin-notify] could not send:", subject, result.error);
  }
}

const SHELL = (title: string, body: string) => `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1D1D1F">
  <p style="font-size:16px;font-weight:600;margin:0 0 12px">${title}</p>
  ${body}
  <p style="margin:18px 0 0;font-size:12px;color:#6E6E73">
    Sent by Freyr Sales Intelligence because you are a workspace admin.
  </p>
</div>`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:3px 14px 3px 0;color:#6E6E73;white-space:nowrap">${label}</td><td style="padding:3px 0;font-weight:600">${value}</td></tr>`;

const esc = (s: string) =>
  String(s ?? "").replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );

/**
 * SOMEBODY WE INVITED ACTUALLY SIGNED UP. The half of the invitation loop that
 * was never reported: the invite went out, and whether it landed was
 * unknowable without going to look.
 */
export async function notifyMemberJoined(person: {
  name: string;
  email: string;
  role: string;
  invitedBy?: string | null;
  viaInvitation: boolean;
}): Promise<void> {
  try {
    const how = person.viaInvitation
      ? `Accepted an invitation${person.invitedBy ? ` from ${person.invitedBy}` : ""}`
      : "Joined on a company email address, no invitation needed";
    await tell(
      `${person.name} joined the workspace`,
      [
        `${person.name} (${person.email}) created their account.`,
        "",
        `Role: ${person.role}`,
        how,
      ],
      SHELL(
        `${esc(person.name)} joined the workspace`,
        `<table style="border-collapse:collapse">
          ${row("Name", esc(person.name))}
          ${row("Email", esc(person.email))}
          ${row("Role", esc(person.role))}
          ${row("How", esc(how))}
        </table>
        <p style="margin:14px 0 0">They are no longer pending; they show as a member on the Team page.</p>`
      )
    );
  } catch (error) {
    console.error("[admin-notify] joined:", error);
  }
}

/** A role changed. Who changed it matters as much as what it changed to. */
export async function notifyRoleChanged(change: {
  name: string;
  email: string;
  from: string;
  to: string;
  changedBy: string;
}): Promise<void> {
  try {
    await tell(
      `${change.name} is now ${change.to}`,
      [
        `${change.changedBy} changed ${change.name}'s role.`,
        "",
        `${change.from} -> ${change.to}`,
        `Account: ${change.email}`,
      ],
      SHELL(
        `${esc(change.name)} is now ${esc(change.to)}`,
        `<table style="border-collapse:collapse">
          ${row("Person", esc(change.name))}
          ${row("Email", esc(change.email))}
          ${row("Was", esc(change.from))}
          ${row("Now", esc(change.to))}
          ${row("Changed by", esc(change.changedBy))}
        </table>`
      )
    );
  } catch (error) {
    console.error("[admin-notify] role:", error);
  }
}

/** Someone was deactivated or reactivated — the same class of fact. */
export async function notifyAccessChanged(change: {
  name: string;
  email: string;
  active: boolean;
  changedBy: string;
}): Promise<void> {
  try {
    const what = change.active ? "was reactivated" : "was deactivated";
    await tell(
      `${change.name} ${what}`,
      [`${change.changedBy} ${what.replace("was ", "")} ${change.name} (${change.email}).`],
      SHELL(
        `${esc(change.name)} ${esc(what)}`,
        `<table style="border-collapse:collapse">
          ${row("Person", esc(change.name))}
          ${row("Email", esc(change.email))}
          ${row("Now", change.active ? "Active" : "No access")}
          ${row("Changed by", esc(change.changedBy))}
        </table>`
      )
    );
  } catch (error) {
    console.error("[admin-notify] access:", error);
  }
}
