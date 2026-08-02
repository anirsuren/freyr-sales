import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authenticatedRequestActorName } from "@/lib/requestPrincipal";
import {
  memberAssignmentResponse,
  verifiedOwnerAssignment,
} from "@/lib/memberAssignments";
import { getDataMode } from "@/lib/dataMode";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import type {
  AccountNote,
  AccountAttachment,
  AccountDeal,
  Customer,
} from "@/lib/types";
import {
  CUSTOMER_OFFERING_ACTIVITY_ORDER,
  CUSTOMER_OFFERING_STATUS_ORDER,
  defaultStatusForActivity,
} from "@/lib/customerOfferingHeatMap";

export const dynamic = "force-dynamic";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(
    Math.random() * 1e4
  ).toString(36)}`;
}

// PATCH: assign owner (#55), set competitor (#59), append a note or
// attachment (#60). All persist via the mock/Supabase customer update.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actorName = await authenticatedRequestActorName(req);
  const db = getDb();
  const customer = await db.customers.get((await params).id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  if (getDataMode() === "live") {
    const actor = await verifiedWorkflowActor(req);
    if (!actor) {
      return NextResponse.json(
        { error: "Verified workspace access required." },
        { status: 403 }
      );
    }
    const hasRecordedOwner =
      !!customer.owner_user_id || !!customer.owner?.trim();
    if (
      hasRecordedOwner &&
      !isWorkflowOwnerOrManager(
        actor,
        customer.owner_user_id,
        customer.owner
      )
    ) {
      return NextResponse.json(
        { error: "You can update only accounts assigned to you." },
        { status: 403 }
      );
    }
  }

  const patch: Partial<Customer> = {};
  if (
    typeof body.owner === "string" ||
    typeof body.owner_user_id === "string"
  ) {
    try {
      const assignment = await verifiedOwnerAssignment(req, {
        owner: body.owner,
        ownerUserId: body.owner_user_id,
        currentOwner: customer.owner,
        currentOwnerUserId: customer.owner_user_id,
      });
      if (
        assignment.workspace_id &&
        customer.workspace_id &&
        customer.workspace_id !== assignment.workspace_id
      ) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }
      patch.owner = assignment.owner;
      patch.owner_user_id = assignment.owner_user_id;
      if (assignment.workspace_id) {
        patch.workspace_id = assignment.workspace_id;
      }
    } catch (error) {
      return (
        memberAssignmentResponse(error) ||
        NextResponse.json(
          { error: "Could not verify the selected owner." },
          { status: 503 }
        )
      );
    }
  }
  if (typeof body.competitor === "string")
    patch.competitor = body.competitor.trim() || null;
  // Customer analysis fields — set on approval.
  if (typeof body.customer_type === "string")
    patch.customer_type = body.customer_type.trim() || null;
  if (typeof body.ownership === "string")
    patch.ownership = body.ownership.trim() || null;
  if (typeof body.revenue === "string")
    patch.revenue = body.revenue.trim() || null;
  if (body.analyzed_at) patch.analyzed_at = new Date().toISOString();
  // Adoption link: which offerings this customer already uses (offering ids).
  if (Array.isArray(body.offerings_in_use))
    patch.offerings_in_use = body.offerings_in_use.filter(
      (x: unknown): x is string => typeof x === "string"
    );
  // Add a single offering to the in-use list from the offering page ("Add to a
  // customer") without wiping the rest — appends + dedupes.
  if (typeof body.addOfferingInUse === "string" && body.addOfferingInUse) {
    const current = customer.offerings_in_use || [];
    patch.offerings_in_use = current.includes(body.addOfferingInUse)
      ? current
      : [...current, body.addOfferingInUse];
  }
  // Commercial detail per in-use offering: revenue
  // lines keyed by offering. Sanitized so bad input can't corrupt the store.
  if (Array.isArray(body.offering_usage)) {
    const RT = ["annual", "project", "annual_service", "license"];
    const CURRENCIES = [
      "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "INR",
      "SGD", "AED", "SAR", "SEK", "NOK", "DKK", "NZD", "ZAR", "BRL",
      "MXN",
    ];
    patch.offering_usage = body.offering_usage
      .map((u: any) => {
        let linkedVersionSeen = false;
        const engagementVersions = Array.isArray(u?.engagement_versions)
          ? u.engagement_versions
              .map((version: any) => {
                const activity = CUSTOMER_OFFERING_ACTIVITY_ORDER.includes(
                  version?.activity
                )
                  ? version.activity
                  : "to_pitch";
                const requestedLinked = version?.linked === true;
                const linked = requestedLinked && !linkedVersionSeen;
                if (linked) linkedVersionSeen = true;
                const status = CUSTOMER_OFFERING_STATUS_ORDER.includes(
                  version?.status
                )
                  ? version.status
                  : defaultStatusForActivity(activity);
                const list = (value: unknown) =>
                  Array.isArray(value)
                    ? value
                        .filter(
                          (item: unknown): item is string =>
                            typeof item === "string" && !!item.trim()
                        )
                        .map((item: string) => item.trim().slice(0, 120))
                        .slice(0, 50)
                    : [];
                const createdAt = version?.created_at
                  ? String(version.created_at)
                  : new Date().toISOString();
                return {
                  id: String(version?.id || uid("eng")).slice(0, 120),
                  version: Math.max(
                    1,
                    Math.round(Number(version?.version) || 1)
                  ),
                  linked,
                  activity,
                  activity_description: version?.activity_description
                    ? String(version.activity_description).trim().slice(0, 2000) ||
                      null
                    : null,
                  status,
                  dollar_value: Math.max(
                    0,
                    Math.round(Number(version?.dollar_value) || 0)
                  ),
                  currency: CURRENCIES.includes(version?.currency)
                    ? version.currency
                    : "USD",
                  start_date: version?.start_date
                    ? String(version.start_date).slice(0, 40)
                    : null,
                  end_date: version?.end_date
                    ? String(version.end_date).slice(0, 40)
                    : null,
                  potential_close_date: version?.potential_close_date
                    ? String(version.potential_close_date).slice(0, 40)
                    : null,
                  opportunity_ids: list(version?.opportunity_ids),
                  proposal_ids: list(version?.proposal_ids),
                  contract_ids: list(version?.contract_ids),
                  created_at: createdAt,
                  updated_at: new Date().toISOString(),
                };
              })
              .sort((a: any, b: any) => b.version - a.version)
          : [];
        const revenueLines = Array.isArray(u?.revenue_lines)
          ? u.revenue_lines
              .map((l: any) => ({
                id: String(l?.id || uid("rev")),
                revenue_type: RT.includes(l?.revenue_type)
                  ? l.revenue_type
                  : "annual",
                amount: Math.max(0, Math.round(Number(l?.amount) || 0)),
                num_licenses:
                  l?.num_licenses != null
                    ? Math.max(0, Math.round(Number(l.num_licenses) || 0))
                    : null,
                start_date: l?.start_date ? String(l.start_date) : null,
                end_date: l?.end_date ? String(l.end_date) : null,
                description: l?.description
                  ? String(l.description).slice(0, 400)
                  : null,
              }))
              .filter((l: any) => l.amount > 0 || l.num_licenses)
          : [];
        return {
          offering_id: String(u?.offering_id || ""),
          revenue_lines: revenueLines,
          engagement_versions: engagementVersions,
        };
      })
      .filter(
        (u: any) =>
          u.offering_id &&
          (u.revenue_lines.length > 0 || u.engagement_versions.length > 0)
      );
  }

  if (body.addNote && String(body.addNote.body || "").trim()) {
    const n = body.addNote;
    const KINDS = ["call", "email", "meeting", "note"];
    const note: AccountNote = {
      id: uid("note"),
      author: actorName,
      body: String(n.body).trim().slice(0, 2000),
      created_at: new Date().toISOString(),
      kind: KINDS.includes(n.kind) ? n.kind : "note",
      next_step: n.next_step ? String(n.next_step).trim().slice(0, 300) || null : null,
      follow_up_date: n.follow_up_date ? String(n.follow_up_date).slice(0, 40) : null,
    };
    patch.notes_log = [note, ...(customer.notes_log || [])];

    // A logged call/email/meeting is a real interaction — record it so it shows
    // on the timeline and (with a follow-up) lands in Tasks.
    if (note.kind !== "note") {
      const contacts = await db.contacts.list((await params).id);
      const contactId = contacts[0]?.id;
      if (contactId) {
        const verb = note.kind === "call" ? "Call" : note.kind === "email" ? "Email" : "Meeting";
        await db.interactions.create({
          customer_id: (await params).id,
          contact_id: contactId,
          outcome: "in_progress",
          notes: `${verb} logged: ${note.body}${note.next_step ? ` · Next: ${note.next_step}` : ""}`,
          follow_up_date: note.follow_up_date,
          logged_by: note.author,
        });
      }
    }
  }

  if (body.addAttachment && String(body.addAttachment.name || "").trim()) {
    const att: AccountAttachment = {
      id: uid("att"),
      name: String(body.addAttachment.name).trim().slice(0, 200),
      url: body.addAttachment.url ? String(body.addAttachment.url).trim() : null,
      created_at: new Date().toISOString(),
    };
    patch.attachments = [att, ...(customer.attachments || [])];
  }

  if (body.addDeal && String(body.addDeal.name || "").trim()) {
    const d = body.addDeal;
    const str = (v: unknown, max = 200) =>
      v ? String(v).trim().slice(0, max) || null : null;
    let dealOwner: Pick<AccountDeal, "owner" | "owner_user_id"> = {
      owner: null,
      owner_user_id: null,
    };
    if (d.owner != null || d.owner_user_id != null) {
      try {
        const assignment = await verifiedOwnerAssignment(req, {
          owner: d.owner,
          ownerUserId: d.owner_user_id,
        });
        if (
          assignment.workspace_id &&
          customer.workspace_id &&
          customer.workspace_id !== assignment.workspace_id
        ) {
          return NextResponse.json(
            { error: "Customer not found" },
            { status: 404 }
          );
        }
        dealOwner = {
          owner: assignment.owner,
          owner_user_id: assignment.owner_user_id,
        };
        if (assignment.workspace_id) {
          patch.workspace_id = assignment.workspace_id;
        }
      } catch (error) {
        return (
          memberAssignmentResponse(error) ||
          NextResponse.json(
            { error: "Could not verify the selected deal owner." },
            { status: 503 }
          )
        );
      }
    }
    const deal: AccountDeal = {
      id: uid("deal"),
      name: String(d.name).trim().slice(0, 160),
      stage: String(d.stage || "Prospect"),
      value: Math.max(0, Math.round(Number(d.value))) || 200000,
      created_at: new Date().toISOString(),
      offering: str(d.offering),
      contact: str(d.contact),
      ...dealOwner,
      close_date: str(d.close_date, 40),
      next_step: str(d.next_step, 300),
      notes: str(d.notes, 1000),
    };
    patch.account_deals = [deal, ...(customer.account_deals || [])];
  }

  const updated = await db.customers.update((await params).id, patch);
  return NextResponse.json({ ok: true, customer: updated });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const customer = await db.customers.get((await params).id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const contacts = await db.contacts.list((await params).id);
  const sessions = await db.pitchSessions.list((await params).id);
  const interactions = await db.interactions.list((await params).id);

  return NextResponse.json({ customer, contacts, sessions, interactions });
}
