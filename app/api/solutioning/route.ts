import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import { getDb } from "@/lib/db";
import {
  addDocument,
  cancelRequest,
  setDeliverableStatus,
  setPriority,
  setWorkstream,
  type DeliverableStatus,
  type RequestPriority,
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
import { listOfferings } from "@/lib/offerings";
import { readOpportunities } from "@/lib/opportunities";
import { divisionsFor, recommendedLead } from "@/lib/solutioningDivisions";
import {
  canOpenModule,
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

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
  return (await canOpenModule("/solutioning"))
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
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/solutioning");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

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
  const managerial = me.role === "admin" || me.role === "bd_owner";
  const fulfiller = managerial || me.role === "sol_member";
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");

  try {
    if (op === "create") {
      /**
       * ASKING IS NOT THE SAME AS BUILDING.
       *
       * Two of Suren's rules meet here and look like they contradict:
       *
       *   Aug 29 — "owner can create, member can edit."
       *   Aug 24 — the reps raise the requests; this module was built for it.
       *
       * They only contradict if "create" means one thing. It does not. A
       * REQUEST is somebody asking the Solutioning team for a deck: it is the
       * module's inbound, and gating it on create left it with none, because
       * every role that would ever raise one — BD Member, Solutioning Member —
       * has *edit*. A SUBMISSION or a PRESENTATION is the work itself, the
       * record the team owns and answers for, and that is the thing Aug 29 is
       * about.
       *
       * So: raising a request asks the write question, producing the work asks
       * the create question. Nobody's row changes (found Aug 31: a Solutioning
       * Member was shown "Request solutioning" and refused on submit).
       */
      const rawTypeForGate = String(body.type ?? "request");
      const isDeliverable =
        rawTypeForGate === "submission" || rawTypeForGate === "presentation";
      const refusal = isDeliverable
        ? await moduleCreateRefusal("/solutioning")
        : await moduleWriteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
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
      /**
       * DIVISIONS, DERIVED (SOL-007) — "Do not ask the Sales user to re-enter
       * Division information already available from the system."
       *
       * The chain is opportunity -> its offerings -> their category, and only
       * this layer can see the catalogue, so it is resolved here and handed to
       * the store as a fact rather than recomputed on every read.
       */
      const linkedOppIds = Array.isArray(body.opportunityIds)
        ? body.opportunityIds.map((x: unknown) => String(x))
        : [];
      let divisions: string[] = [];
      let workstreams: { division: string; lead?: string; contributors: string[] }[] =
        [];
      if (linkedOppIds.length) {
        const { opportunities } = await readOpportunities().catch(() => ({
          opportunities: [],
        }));
        const offerings = await listOfferings();
        const byId = new Map(offerings.map((o) => [o.id, o]));
        const byName = new Map(
          offerings.map((o) => [o.offering_name.trim().toLowerCase(), o])
        );
        const categories: (string | undefined)[] = [];
        for (const id of linkedOppIds) {
          const deal = opportunities.find((o) => o.id === id);
          if (!deal) continue;
          for (const oid of deal.offeringIds) {
            categories.push(byId.get(oid)?.offering_category);
          }
          /* A deal imported from the sheet names its offering in words rather
             than by id, so the label is matched too — otherwise every imported
             deal would derive no division at all. */
          for (const label of deal.offeringLabels) {
            categories.push(byName.get(label.trim().toLowerCase())?.offering_category);
          }
        }
        divisions = divisionsFor(categories);
        /* SOL-008: a recommendation per division, advisory only. The map lives
           on the privileges row until Freyr configures a real one, so an
           unmapped division simply arrives with no suggestion. */
        const leadMap = {};
        workstreams = divisions.map((d) => ({
          division: d,
          ...(recommendedLead(d, leadMap) ? { lead: recommendedLead(d, leadMap) } : {}),
          contributors: [],
        }));
      }

      const request = await createRequest({
        type,
        priority: (["High", "Medium", "Low"] as const).find(
          (x) => x === body.priority
        ) as RequestPriority | undefined,
        divisions,
        workstreams,
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

      /* THE DOCUMENTS HE PICKED ON THE FORM, ATTACHED THE MOMENT THE RECORD
         EXISTS (Suren, Aug 31: "If they upload, where will that RFP be
         saved?"). The bytes went up as drafts while he was still filling the
         form, so all that is left here is to point the new request at them.

         They land as CUSTOMER documents: what a requester attaches at this
         moment is the thing the customer sent him — an RFP template, a
         questionnaire, a list of questions — never something Solutioning has
         produced, which is what the other three shelves are for.

         A bad entry must not cost him the request he just created, so a failed
         attach is skipped rather than thrown: the record survives with the
         files that did work, and anything missing can be added on it. */
      const staged = Array.isArray(body.documents) ? body.documents : [];
      for (const entry of staged.slice(0, 20)) {
        const d = (entry ?? {}) as {
          name?: unknown;
          docsPath?: unknown;
          fileName?: unknown;
        };
        const docsPath = typeof d.docsPath === "string" ? d.docsPath : "";
        const fileName = typeof d.fileName === "string" ? d.fileName : undefined;
        const name = String(d.name ?? fileName ?? "").trim();
        if (!docsPath || !name) continue;
        await addDocument({
          requestId: request.id,
          category: "customer",
          name,
          docsPath,
          fileName,
          by: me.name,
        }).catch(() => undefined);
      }

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
          { error: "Picking up requests is the Solutioning team's job." },
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
    } else if (op === "set-priority") {
      const refusal = await moduleWriteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      await setPriority({
        requestId,
        priority:
          (["High", "Medium", "Low"] as const).find((x) => x === body.priority) ??
          null,
        by: me.name,
      });
    } else if (op === "set-workstream") {
      /* Choosing the lead for a division is the requester's call (SOL-009:
         "Sales retains final selection authority"), and the lead who holds a
         workstream assigns inside it (SOL-011). Both are writes on this
         record, so both ask the module's write question. */
      const refusal = await moduleWriteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      await setWorkstream({
        requestId,
        division: String(body.division ?? ""),
        ...(body.lead !== undefined ? { lead: body.lead as string | null } : {}),
        ...(body.primaryAssignee !== undefined
          ? { primaryAssignee: body.primaryAssignee as string | null }
          : {}),
        ...(Array.isArray(body.contributors)
          ? { contributors: body.contributors as string[] }
          : {}),
        by: me.name,
      });
    } else if (op === "set-deliverable-status") {
      const refusal = await moduleWriteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      const next = body.status as DeliverableStatus;
      await setDeliverableStatus({ requestId, status: next, by: me.name });
    } else if (op === "cancel") {
      /* SOL-033. Cancelling is not deleting: it is a WRITE, so it is open to
         the people who can change the record — its requester, whoever owns it,
         and a manager — rather than to owners only. */
      const refusal = await moduleWriteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      await cancelRequest({
        requestId,
        by: me.name,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        allowed: iRequested || iOwn || managerial,
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
      /* "The person who can create only can delete." */
      const refusal = await moduleDeleteRefusal("/solutioning");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
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
