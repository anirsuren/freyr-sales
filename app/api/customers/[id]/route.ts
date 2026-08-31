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
  CUSTOMER_OFFERING_STATUS_ORDER,
  defaultStatusForActivity,
  normalizeActivity,
  normalizeStatus,
} from "@/lib/customerOfferingHeatMap";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(
    Math.random() * 1e4
  ).toString(36)}`;
}

const CUSTOMER_OFFERING_CURRENCIES = [
  "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "INR",
  "SGD", "AED", "SAR", "SEK", "NOK", "DKK", "NZD", "ZAR", "BRL",
  "MXN",
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeEngagementVersion(version: any, linked = false) {
  // Legacy words ("to_pitch", "under_contract") are read as the activity +
  // status pair they always meant, so an older client can never write a value
  // the app no longer knows.
  const activity = normalizeActivity(version?.activity);
  const status = CUSTOMER_OFFERING_STATUS_ORDER.includes(version?.status)
    ? version.status
    : normalizeStatus(version?.status ?? defaultStatusForActivity(activity));
  const today = new Date().toISOString().slice(0, 10);
  const priorDates = (version?.status_dates || {}) as Record<string, unknown>;
  const day = (value: unknown) =>
    typeof value === "string" && ISO_DAY.test(value) ? value : undefined;
  // EVERY STATUS REMEMBERS THE DAY IT WAS REACHED (Suren: "if it says
  // initiated, when did the initiated date? Under progress what date it
  // is?"). Reaching a status stamps today unless a date is already recorded —
  // so it fills itself in, and stays editable afterwards.
  const status_dates = {
    initiated: day(priorDates.initiated) ?? today,
    under_progress:
      day(priorDates.under_progress) ??
      (status === "under_progress" || status === "completed" ? today : null),
    completed:
      day(priorDates.completed) ?? (status === "completed" ? today : null),
  };
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
  return {
    id: String(version?.id || uid("eng")).slice(0, 120),
    version: Math.max(1, Math.round(Number(version?.version) || 1)),
    linked,
    activity,
    activity_description: version?.activity_description
      ? String(version.activity_description).trim().slice(0, 2000) || null
      : null,
    comments: version?.comments
      ? String(version.comments).trim().slice(0, 2000) || null
      : null,
    status,
    status_dates,
    dollar_value: Math.max(
      0,
      Math.round(Number(version?.dollar_value) || 0)
    ),
    currency: CUSTOMER_OFFERING_CURRENCIES.includes(version?.currency)
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
    created_at: version?.created_at
      ? String(version.created_at)
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// PATCH: assign owner (#55), set competitor (#59), append a note or
// attachment (#60). All persist via the mock/Supabase customer update.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/customers");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

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
  /* THE ACCOUNT'S OWN IDENTITY (Anir, Aug 30, on the customer page: "why
     can't I edit"). Everything else about a customer was patchable and these
     five were not, so the Overview could show who an account IS and offer no
     way to correct it. Same owner-or-manager check above guards them; nothing
     about who may write has changed, only what they may write. */
  if (typeof body.company_name === "string" && body.company_name.trim())
    patch.company_name = body.company_name.trim();
  if (typeof body.industry === "string")
    patch.industry = body.industry.trim() || null;
  if (typeof body.size_tier === "string")
    patch.size_tier = (body.size_tier.trim() || null) as Customer["size_tier"];
  if (typeof body.geography === "string")
    patch.geography = body.geography.trim() || null;
  if (typeof body.website_url === "string")
    patch.website_url = body.website_url.trim() || null;

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
  // ADD ONE COMPONENT WITHOUT KNOWING THE REST. The FDL component page
  // connects a customer from its own side and has no copy of that customer's
  // other links, so it sends just the one and this appends it (Suren, Aug 8:
  // "if I want to add a customer, I want to add a customer from the component
  // also").
  if (body.addDigitalComponent && Array.isArray(body.digital_components)) {
    const incoming = (body.digital_components as { component_id?: unknown; release_id?: unknown }[])[0];
    const componentId = String(incoming?.component_id || "").trim().slice(0, 120);
    if (componentId) {
      const current = (customer?.digital_components || []).filter(
        (item) => item.component_id !== componentId
      );
      patch.digital_components = [
        ...current,
        {
          component_id: componentId,
          release_id:
            typeof incoming?.release_id === "string" && incoming.release_id
              ? incoming.release_id.slice(0, 120)
              : null,
          next_release_id: null,
          notes: null,
        },
      ];
    }
  } else 
  // The Freya software this customer runs, pinned by component + release id.
  if (Array.isArray(body.digital_components)) {
    patch.digital_components = (body.digital_components as unknown[])
      .slice(0, 200)
      .map((raw) => {
        const item = (raw || {}) as Record<string, unknown>;
        const id = String(item.component_id || "").trim().slice(0, 120);
        if (!id) return null;
        const idOrNull = (value: unknown) =>
          typeof value === "string" && value.trim()
            ? value.trim().slice(0, 120)
            : null;
        return {
          component_id: id,
          release_id: idOrNull(item.release_id),
          next_release_id: idOrNull(item.next_release_id),
          release_status:
            item.release_status === "released" || item.release_status === "expected"
              ? (item.release_status as "released" | "expected")
              : null,
          notes:
            typeof item.notes === "string" && item.notes.trim()
              ? item.notes.trim().slice(0, 1000)
              : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  if (Array.isArray(body.offering_usage)) {
    const RT = ["annual", "project", "annual_service", "license"];
    patch.offering_usage = body.offering_usage
      .map((u: any) => {
        let linkedVersionSeen = false;
        const engagementVersions = Array.isArray(u?.engagement_versions)
          ? u.engagement_versions
              .map((version: any) => {
                const requestedLinked = version?.linked === true;
                const linked = requestedLinked && !linkedVersionSeen;
                if (linked) linkedVersionSeen = true;
                return sanitizeEngagementVersion(version, linked);
              })
              .sort((a: any, b: any) => b.version - a.version)
          : [];
        const engagementDraft = u?.engagement_draft
          ? sanitizeEngagementVersion(
              u.engagement_draft,
              u.engagement_draft?.linked === true
            )
          : null;
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
          engagement_draft: engagementDraft,
        };
      })
      .filter(
        (u: any) =>
          u.offering_id &&
          (u.revenue_lines.length > 0 ||
            u.engagement_versions.length > 0 ||
            !!u.engagement_draft)
      );
  }

  // Keep unfinished activities in the shared customer record, separate from
  // the saved history so a draft never feeds the heat map prematurely.
  if (body.saveEngagementDraft?.offering_id && body.saveEngagementDraft?.draft) {
    const offeringId = String(body.saveEngagementDraft.offering_id).slice(0, 120);
    const usage = [...(patch.offering_usage || customer.offering_usage || [])];
    const index = usage.findIndex((item) => item.offering_id === offeringId);
    const current = index >= 0
      ? usage[index]
      : { offering_id: offeringId, revenue_lines: [], engagement_versions: [] };
    const next = {
      ...current,
      engagement_draft: sanitizeEngagementVersion(
        body.saveEngagementDraft.draft,
        body.saveEngagementDraft.draft?.linked === true
      ),
    };
    if (index >= 0) usage[index] = next;
    else usage.push(next);
    patch.offering_usage = usage;
  }

  if (typeof body.clearEngagementDraft === "string") {
    const offeringId = body.clearEngagementDraft.slice(0, 120);
    patch.offering_usage = [
      ...(patch.offering_usage || customer.offering_usage || []),
    ]
      .map((item) =>
        item.offering_id === offeringId
          ? { ...item, engagement_draft: null }
          : item
      )
      .filter(
        (item) =>
          item.revenue_lines.length > 0 ||
          (item.engagement_versions?.length || 0) > 0 ||
          !!item.engagement_draft
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
  /**
   * SAY WHAT ACTUALLY CHANGED (found Aug 16 while exercising this route).
   *
   * PATCH builds `patch` from a fixed list of fields and ignores everything
   * else — then answered `{ok:true}` either way. Sending `industry` (not on
   * the list) returned 200 and changed nothing, so a caller, an integration or
   * the agent could believe a write landed when it had not. That is how a
   * record quietly diverges from what somebody thinks they saved.
   *
   * The status stays 200 so nothing that sends extra fields breaks; the answer
   * now reports which keys were applied and which were ignored, so a caller
   * that cares can tell.
   */
  const applied = Object.keys(patch);
  const ignored = Object.keys(body ?? {}).filter(
    (k) => !applied.includes(k) && k !== "owner_user_id" && k !== "analyzed_at"
  );
  return NextResponse.json({
    ok: true,
    customer: updated,
    applied,
    ...(ignored.length ? { ignored } : {}),
  });
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
