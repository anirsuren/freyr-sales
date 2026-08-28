import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import { getDb } from "@/lib/db";
import {
  addDocument,
  assignDocument,
  completeRequest,
  createRequest,
  deleteRequest,
  pickUpRequest,
  readSolutioning,
  releaseRequest,
  removeDocument,
  reopenRequest,
  updateRequest,
  type DocCategory,
  type SolutioningKind,
  commentOnRequest,
} from "@/lib/solutioning";

export const dynamic = "force-dynamic";

/**
 * SOLUTIONING API (Suren, Aug 24). One route, op-switched, the performance
 * pattern. Requests are collaboration, not money, so everyone signed in reads
 * the same list — "from a customer side also I can look at it, from a people
 * point of view also I can look at it." What each role may DO is per-op:
 *
 *   create           anyone signed in ("anybody can create that request")
 *   pick-up          the fulfiller side: solutions, manager, admin
 *   release          whoever holds it hands it back; a manager/admin can take
 *                    it off them. Picking up must not be a one-way door.
 *   complete         the REQUESTER — "the sales person says it is completed" —
 *                    or a manager/admin on their behalf
 *   reopen           same people who may complete
 *   add/assign doc   anyone signed in ("they are all collaborating")
 *   remove doc       whoever added it, the request's owner, or manager/admin
 *   edit request     requester, owner, manager, admin
 *   delete request   requester while still initiated, or an admin
 */


/**
 * THE MODULE'S OWN DOOR, ON THE API (Anir, Aug 25: "you have to hide this for
 * reps"). The page guard sends a rep to /offerings, but the endpoint answered
 * anybody signed in — so the requests were one fetch away from someone who is
 * not allowed to see them.
 */
async function moduleClosed(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  return canAccessModule("/solutioning", me.role)
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const shut = await moduleClosed();
  if (shut) return shut;
  // The create dialog's contact picker: contacts belong to a customer, so
  // they load per customer, on demand, from the same door as everything else.
  const contactsFor = req.nextUrl.searchParams.get("contactsFor");
  if (contactsFor) {
    const db = getDb();
    const contacts = await db.contacts.list(contactsFor).catch(() => []);
    return NextResponse.json({
      contacts: contacts.map((c: { id: string; full_name: string; job_title?: string | null }) => ({
        id: c.id,
        name: c.full_name,
        title: c.job_title ?? null,
      })),
    });
  }
  const state = await readSolutioning();
  return NextResponse.json({ state });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const shut = await moduleClosed();
  if (shut) return shut;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality (add, edit
     etc.) should be on mock mode, but it shouldn't affect real data"). */
  const me = await getCurrentUser();
  const managerial = me.role === "admin" || me.role === "manager";
  const fulfiller = managerial || me.role === "solutions";
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");

  try {
    if (op === "create") {
      const kind = body.kind as SolutioningKind;
      if (!["submission", "presentation", "meeting"].includes(kind)) {
        return NextResponse.json(
          { error: "Pick a presentation, a submission or a meeting." },
          { status: 400 }
        );
      }
      /* A request, or the work itself. Anything else is a request, which is
         what this endpoint only ever made. */
      const rawType = String(body.type ?? "request");
      const type =
        rawType === "submission" || rawType === "presentation"
          ? rawType
          : ("request" as const);
      const request = await createRequest({
        type,
        requestId: body.requestId,
        kind,
        subtype: body.subtype,
        title: String(body.title ?? ""),
        details: body.details,
        customerId: body.customerId,
        customer: String(body.customer ?? ""),
        opportunityIds: body.opportunityIds,
        opportunityLabels: body.opportunityLabels,
        contactIds: body.contactIds,
        contactNames: body.contactNames,
        neededBy: body.neededBy,
        meetingAt: body.meetingAt,
        attendees: body.attendees,
        requestedBy: me.name,
        /* Work starts owned by whoever made it — nobody "takes up" their
           own submission (Suren, Aug 27: "they can click on a request and
           then say 'Create a submission', or they can go to the submission
           and create a submission" — either way the clicker is the one
           doing the work). */
        ...(type !== "request" ? { owner: me.name } : {}),
      });
      return NextResponse.json({ ok: true, request, state: await readSolutioning() });
    }

    const requestId = String(body.requestId ?? "");
    if (!requestId) {
      return NextResponse.json({ error: "Which request?" }, { status: 400 });
    }
    const state = await readSolutioning();
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) {
      return NextResponse.json({ error: "That request is gone." }, { status: 404 });
    }
    const iRequested =
      target.requestedBy.trim().toLowerCase() === me.name.trim().toLowerCase();
    const iOwn =
      (target.owner ?? "").trim().toLowerCase() === me.name.trim().toLowerCase();

    if (op === "pick-up") {
      if (!fulfiller) {
        return NextResponse.json(
          { error: "Picking up requests is the Solutions team's job." },
          { status: 403 }
        );
      }
      await pickUpRequest({ requestId, by: me.name });
    } else if (op === "comment") {
      /* NO GATE BEYOND SEEING IT (Suren: "anyone can comment, whoever has
         access to this"). Reaching this handler already means the reader
         passed the module's own access check. */
      await commentOnRequest({
        requestId,
        by: me.name,
        text: String((body as { text?: unknown }).text ?? ""),
      });
    } else if (op === "release") {
      /* The way back out of a pick-up. The owner may always put it down; a
         manager or admin may take it off somebody who has gone quiet. */
      if (!(iOwn || managerial)) {
        return NextResponse.json(
          { error: `${target.owner || "Somebody else"} picked this up, so only they can hand it back.` },
          { status: 403 }
        );
      }
      await releaseRequest({ requestId, by: me.name, managerial });
    } else if (op === "complete") {
      await completeRequest({
        requestId,
        by: me.name,
        allowed: iRequested || managerial,
      });
    } else if (op === "reopen") {
      if (!(iRequested || managerial)) {
        return NextResponse.json(
          { error: "Only the requester or a manager can reopen this." },
          { status: 403 }
        );
      }
      await reopenRequest({ requestId, by: me.name });
    } else if (op === "add-doc") {
      const category = body.category as DocCategory;
      if (!["customer", "working", "final", "analysis"].includes(category)) {
        return NextResponse.json({ error: "Which tab?" }, { status: 400 });
      }
      await addDocument({
        requestId,
        category,
        name: String(body.name ?? ""),
        url: body.url,
        docsPath: body.docsPath,
        fileName: body.fileName,
        assignedTo: body.assignedTo,
        note: body.note,
        version:
          typeof body.version === "number" && Number.isFinite(body.version)
            ? body.version
            : undefined,
        by: me.name,
        ref:
          body.refRequestId && body.refDocId
            ? { requestId: String(body.refRequestId), docId: String(body.refDocId) }
            : undefined,
      });
    } else if (op === "assign-doc") {
      await assignDocument({
        requestId,
        docId: String(body.docId ?? ""),
        assignedTo: body.assignedTo ? String(body.assignedTo) : null,
        by: me.name,
      });
    } else if (op === "remove-doc") {
      await removeDocument({
        requestId,
        docId: String(body.docId ?? ""),
        by: me.name,
        allowed: (doc) =>
          managerial ||
          iOwn ||
          doc.addedBy.trim().toLowerCase() === me.name.trim().toLowerCase(),
      });
    } else if (op === "update") {
      if (!(iRequested || iOwn || managerial)) {
        return NextResponse.json(
          { error: "Only the requester, the owner or a manager can edit this." },
          { status: 403 }
        );
      }
      await updateRequest({ requestId, by: me.name, patch: body.patch ?? {} });
    } else if (op === "delete") {
      await deleteRequest({
        requestId,
        allowed:
          me.role === "admin" || (iRequested && target.status === "initiated"),
      });
    } else {
      return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, state: await readSolutioning() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
