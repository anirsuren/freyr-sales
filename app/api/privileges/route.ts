import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  ACCESS_META,
  PRIVILEGE_MODULES,
  normalizePrivilegeState,
  readPrivileges,
  writePrivileges,
  type Access,
  type PrivilegeState,
} from "@/lib/privileges";
import { notifyPrivilegesChanged } from "@/lib/adminNotify";
import { isTestAccountName } from "@/lib/testAccounts";

/**
 * THE PRIVILEGE TABLE.
 *
 * READ is open to anyone signed in: the app itself has to ask what a person
 * may do, and a rep discovering the shape of the table is not a leak — it is
 * the same information the sidebar already shows them by what it draws.
 *
 * WRITE IS ADMIN ONLY, and deliberately not manager. Suren, Aug 29: this "sets
 * the whole stage about who has access to what", so the people who can change
 * it are the people who run the workspace. A manager who could edit this could
 * grant themselves anything.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readPrivileges();
  return NextResponse.json({ state });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (me.role !== "admin")
    return NextResponse.json(
      { error: "Only an admin can change privileges." },
      { status: 403 }
    );

  const body = (await req.json().catch(() => null)) as {
    state?: unknown;
  } | null;
  if (!body?.state)
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  try {
    /* The whole table is sent and the whole table is stored — the screen edits
       one cell at a time but always holds the complete grid, so a stale tab
       cannot half-apply. normalize() is what refuses anything malformed. */
    const before = await readPrivileges();
    const state = await writePrivileges(
      normalizePrivilegeState(body.state),
      me.name
    );

    /* EVERY CHANGE IS ANNOUNCED (Suren, Aug 29). Diffed here rather than sent
       from the browser, so the email describes what actually landed in the
       store and cannot be shaped by whatever the page thought it was doing.
       Never awaited into the response path in a way that could fail the save —
       notifyPrivilegesChanged swallows its own errors. */
    /* Lines about a reserved testing account are dropped: assigning BO Owner
       to claude-check-1 to see what an offering owner sees is not a change any
       admin needs told about (Anir, Aug 31: "stop spamming us"). A save that
       only touched test accounts sends nothing at all. */
    const lines = diffLines(before, state).filter(
      (line) => !isTestAccountName(line.split(":")[0])
    );
    if (lines.length) {
      void notifyPrivilegesChanged({ changedBy: me.name, lines });
    }

    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That did not save." },
      { status: 400 }
    );
  }
}

/** One line per cell that moved: "Customers · BO Owner: Read to Write". */
function diffLines(before: PrivilegeState, after: PrivilegeState): string[] {
  const label = (a: Access) => ACCESS_META[a].label;
  const nameOf = (id: string) =>
    after.privileges.find((p) => p.id === id)?.label ?? id;
  const out: string[] = [];

  for (const p of after.privileges) {
    for (const m of PRIVILEGE_MODULES) {
      const was = before.matrix[p.id]?.[m.key] ?? "none";
      const now = after.matrix[p.id]?.[m.key] ?? "none";
      if (was === now) continue;
      out.push(`${m.label} · ${p.label}: ${label(was)} to ${label(now)}`);
    }
  }

  /* No group lines any more: a group grants nothing, so there is nothing about
     one that could change what a person may do. */
  const people = new Set([
    ...Object.keys(before.peoplePrivileges),
    ...Object.keys(after.peoplePrivileges),
  ]);
  for (const person of people) {
    const was = (before.peoplePrivileges[person] ?? []).slice().sort().join(", ");
    const now = (after.peoplePrivileges[person] ?? []).slice().sort().join(", ");
    if (was === now) continue;
    out.push(
      `${person}: ${now ? now.split(", ").map(nameOf).join(", ") : "no privileges"}`
    );
  }

  /* A hundred lines in an email is noise. Past twenty it says how many more. */
  if (out.length > 20)
    return [...out.slice(0, 20), `…and ${out.length - 20} more changes.`];
  return out;
}
