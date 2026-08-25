import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
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
  removeDocument,
  reopenRequest,
  updateRequest,
  type DocCategory,
  type SolutioningKind,
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
  if (getDataMode() !== "live") {
    return NextResponse.json(
      { error: "Mock mode shows sample requests only. Switch to Real to work them." },
      { status: 400 }
    );
  }
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
      const request = await createRequest({
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
        assignedTo: body.assignedTo,
        note: body.note,
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
