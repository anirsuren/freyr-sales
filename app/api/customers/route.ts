import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { canOpenModule, moduleCreateRefusal } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";
import { memberAssignmentResponse, verifiedOwnerAssignment } from "@/lib/memberAssignments";
import { addMemberToGroup, createGroup, readCustomerGroups } from "@/lib/customerGroups";
import { setCustomerProfile } from "@/lib/customerProfiles";
import { addressIsComplete, normalizeAddress } from "@/lib/customerProfilesShared";
import { listBdMembers } from "@/lib/bdMembers";

export const dynamic = "force-dynamic";

export async function GET() {
  /* THE LIST IS DATA TOO.
   *
   * This route asked NOTHING before: no session, no role, no privilege. Anyone
   * who could reach the app read every customer in the workspace over the API,
   * including somebody set to `none` on Customers, whose whole point is that
   * they see no customers. The page was guarded and the door beside it was
   * open, which made "none sees nothing" true only of the screen.
   *
   * Same helper the customer-groups route already uses, so there is one answer
   * to "may this person open Customers" and not a second one here.
   *
   * The only caller is the account suggester in PerformanceModule, which does
   * `if (!Array.isArray(data.customers)) return;` and, in its own words, lets
   * the field stay typeable and just stop suggesting. So a refusal degrades
   * the way that code already expects.
   */
  if (!(await canOpenModule("/customers")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const db = getDb();
  const customers = await db.customers.list();

  const enriched = await Promise.all(
    customers.map(async (c) => {
      const contacts = await db.contacts.list(c.id);
      const interactions = await db.interactions.list(c.id);
      const sessions = await db.pitchSessions.list(c.id);
      return {
        ...c,
        contact_count: contacts.length,
        last_outcome: interactions[0]?.outcome || null,
        last_session_date: sessions[0]?.created_at || null,
      };
    })
  );

  return NextResponse.json({ customers: enriched });
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** "gsk.com" or "https://www.gsk.com/en" becomes "https://gsk.com/en"; anything
 *  that is not a website becomes null. */
function websiteUrl(raw: unknown): string | null {
  const t = text(raw, 300);
  if (!t) return null;
  let url: URL;
  try {
    url = new URL(t.includes("://") ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (/(^|\.)linkedin\.com$/.test(host) || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) return null;
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `https://${host}${path}`;
}

/**
 * ADD A CUSTOMER, WITH MANOJ'S FIELDS (Sep 10): name, website, HQ address,
 * another address, parent company, owner and customer group, and a Customer
 * ID made on save.
 *
 * Every rule the form shows is asked again here, because the form is not the
 * control. A name that already exists is refused rather than quietly updated
 * (the old one-row CSV path overwrote that account and still said "added").
 * The owner must be a BD member, and goes through the same owner check every
 * other assignment uses, so a BD Member can still only make themselves owner.
 */
export async function POST(req: NextRequest) {
  const refusal = await moduleCreateRefusal("/customers");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  if (!(await canOpenModule("/customers")))
    return NextResponse.json({ error: "Not available on this account." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Bad request.");

  const name = text(body.name, 200);
  if (!name) return bad("Give the customer a name.");
  const website = websiteUrl(body.website);
  if (!website) return bad("Add their website, like gsk.com.");
  const hq = normalizeAddress(body.hq);
  if (!hq || !addressIsComplete(hq)) return bad("The HQ address needs line 1, a city and a country.");
  const other = normalizeAddress(body.other);
  if (other && !addressIsComplete(other))
    return bad("Finish the other address with line 1, a city and a country, or leave it empty.");

  const db = getDb();
  const existing = await db.customers.findByName(name).catch(() => null);
  if (existing) {
    return NextResponse.json(
      { error: `${existing.company_name} is already a customer.`, id: existing.id },
      { status: 409 }
    );
  }

  const parentRaw = text(body.parentId, 80);
  let parentId: string | null = null;
  if (parentRaw && parentRaw !== "NA") {
    const parent = await db.customers.get(parentRaw).catch(() => null);
    if (!parent) return bad("That parent company is not a customer any more. Pick another one, or NA.");
    parentId = parent.id;
  }

  const ownerName = text(body.owner, 120);
  const ownerUserId = text(body.ownerUserId, 80);
  if (!ownerName && !ownerUserId) return bad("Pick the owner.");
  const bd = await listBdMembers().catch(() => []);
  const bdPick = bd.find(
    (m) => (ownerUserId && m.id === ownerUserId) || m.name.toLowerCase() === ownerName.toLowerCase()
  );
  if (!bdPick) return bad("The owner has to be a BD member.");

  const groupId = text(body.groupId, 80);
  const newGroupName = text(body.newGroupName, 80);
  const { groups } = await readCustomerGroups();
  if (newGroupName) {
    if (groups.some((g) => g.name.toLowerCase() === newGroupName.toLowerCase()))
      return bad(`There is already a group called "${newGroupName}". Pick it from the list.`);
  } else if (!groupId || !groups.some((g) => g.id === groupId)) {
    return bad("Pick a customer group.");
  }

  let assignment: Awaited<ReturnType<typeof verifiedOwnerAssignment>>;
  try {
    assignment = await verifiedOwnerAssignment(req, {
      owner: bdPick.name,
      ownerUserId: bdPick.id ?? undefined,
    });
  } catch (error) {
    return (
      memberAssignmentResponse(error) ||
      NextResponse.json({ error: "Could not verify the owner." }, { status: 503 })
    );
  }

  const created = await db.customers.create({
    company_name: name,
    ...(assignment.workspace_id ? { workspace_id: assignment.workspace_id } : {}),
    website_url: website,
    industry: null,
    geography: [hq.city, hq.country].filter(Boolean).join(", "),
    size_tier: null,
    owner: assignment.owner,
    owner_user_id: assignment.owner_user_id,
  });

  const warnings: string[] = [];
  let customerNo = "";
  try {
    const profile = await setCustomerProfile(created.id, { hq, other: other ?? null, parentId });
    customerNo = profile.customerNo;
  } catch {
    warnings.push("its customer ID and addresses did not save");
  }
  try {
    if (newGroupName) {
      const me = await getCurrentUser();
      await createGroup({ name: newGroupName, customerIds: [created.id], by: me.name });
    } else {
      await addMemberToGroup({ id: groupId, customerId: created.id });
    }
  } catch {
    warnings.push("it did not go into the customer group");
  }

  return NextResponse.json({
    ok: true,
    customer: { id: created.id, name: created.company_name, customerNo },
    ...(warnings.length
      ? { warning: `${created.company_name} was added, but ${warnings.join(" and ")}. Open it to finish.` }
      : {}),
  });
}
