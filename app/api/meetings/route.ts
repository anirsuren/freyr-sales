import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  addMeetingDoc,
  addMeetingNote,
  createMeeting,
  deleteMeeting,
  readMeetings,
  removeMeetingDoc,
  removeMeetingNote,
  setMeetingStatus,
  updateMeeting,
  type MeetingNoteKind,
  type MeetingStatus,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

/**
 * MEETINGS.
 *
 * A meeting is not owned work the way a solutioning submission is, so the
 * rules here are deliberately flat: anyone who can open the module can create
 * a meeting, write it up and mark it done. Suren's own description has the
 * sales person doing all three — "somebody has to go once the meeting is done
 * and say that meeting is complete" — and gating that behind ownership would
 * mean a meeting somebody left the company still holding can never be closed.
 *
 * Deleting is the one exception: only the owner or an admin, because a
 * meeting is a record that other pages count.
 */

async function guard() {
  const role = await getRole();
  if (!canAccessModule("/meetings", role)) return null;
  return { me: await getCurrentUser(), role };
}

export async function GET() {
  const ctx = await guard();
  if (!ctx)
    return NextResponse.json({ error: "Not available on this account." }, { status: 403 });
  return NextResponse.json({ ok: true, state: await readMeetings() });
}

export async function POST(req: Request) {
  const ctx = await guard();
  if (!ctx)
    return NextResponse.json({ error: "Not available on this account." }, { status: 403 });
  const { me, role } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Nothing sent." }, { status: 400 });
  const op = String(body.op ?? "");

  try {
    if (op === "create") {
      const meeting = await createMeeting({
        title: String(body.title ?? ""),
        type: String(body.type ?? ""),
        meetingAt: String(body.meetingAt ?? ""),
        customerId: body.customerId ? String(body.customerId) : undefined,
        customer: String(body.customer ?? ""),
        opportunityIds: body.opportunityIds as string[] | undefined,
        opportunityLabels: body.opportunityLabels as string[] | undefined,
        contactIds: body.contactIds as string[] | undefined,
        contactNames: body.contactNames as string[] | undefined,
        /* Whoever the creator named as running it, falling back to the
           creator. */
        owner: body.owner ? String(body.owner) : undefined,
        attendees: body.attendees as string[] | undefined,
        presenters: body.presenters as string[] | undefined,
        by: me.name,
      });
      return NextResponse.json({ ok: true, meeting, state: await readMeetings() });
    }

    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Which meeting?" }, { status: 400 });

    if (op === "update") {
      await updateMeeting({
        id,
        patch: (body.patch ?? {}) as Record<string, never>,
      });
    } else if (op === "status") {
      await setMeetingStatus({
        id,
        status: String(body.status ?? "planned") as MeetingStatus,
        by: me.name,
      });
    } else if (op === "add-note") {
      await addMeetingNote({
        id,
        kind: String(body.kind ?? "comment") as MeetingNoteKind,
        text: String(body.text ?? ""),
        by: me.name,
      });
    } else if (op === "remove-note") {
      await removeMeetingNote({ id, noteId: String(body.noteId ?? "") });
    } else if (op === "add-doc") {
      await addMeetingDoc({
        id,
        label: String(body.label ?? ""),
        docsPath: body.docsPath ? String(body.docsPath) : undefined,
        url: body.url ? String(body.url) : undefined,
        by: me.name,
      });
    } else if (op === "remove-doc") {
      await removeMeetingDoc({ id, docId: String(body.docId ?? "") });
    } else if (op === "delete") {
      const state = await readMeetings();
      const target = state.meetings.find((m) => m.id === id);
      const mine =
        (target?.owner ?? "").trim().toLowerCase() === me.name.trim().toLowerCase();
      if (!mine && role !== "admin") {
        return NextResponse.json(
          { error: `${target?.owner || "Somebody else"} owns this meeting.` },
          { status: 403 }
        );
      }
      await deleteMeeting(id);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, state: await readMeetings() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
