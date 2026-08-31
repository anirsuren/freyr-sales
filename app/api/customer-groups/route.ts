import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  createGroup,
  deleteGroup,
  readCustomerGroups,
  toggleMember,
  updateGroup,
} from "@/lib/customerGroups";
import {
  canOpenModule,
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * CUSTOMER GROUPS — create, rename, recolour, add and remove accounts.
 *
 * Anyone who can see Customers can cut them into groups: a group is a way of
 * reading the book you already have, not a permission over it, and nothing
 * here touches a customer record. Deleting a group deletes the circle, never
 * the accounts inside it — which is why the confirm copy says so.
 */
export async function POST(req: NextRequest) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/customers");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  if (!(await canOpenModule("/customers")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const op = String(body.op ?? "");
  const id = String(body.id ?? "");
  const me = await getCurrentUser();

  try {
    if (op === "create") {
      /* Only an owner starts a new one (Suren, Aug 29: "owner can create,
         member can edit"). The gate above only asks whether the pen is in the
         room, and a member's row says edit. */
      const refusal = await moduleCreateRefusal("/customers");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      await createGroup({
        name: String(body.name ?? ""),
        description: body.description ? String(body.description) : undefined,
        color: body.color ? String(body.color) : undefined,
        customerIds: body.customerIds as string[] | undefined,
        by: me.name,
      });
    } else if (op === "update") {
      if (!id) return NextResponse.json({ error: "Which group?" }, { status: 400 });
      await updateGroup({
        id,
        patch: (body.patch ?? {}) as Record<string, never>,
      });
    } else if (op === "toggle-member") {
      if (!id) return NextResponse.json({ error: "Which group?" }, { status: 400 });
      await toggleMember({ id, customerId: String(body.customerId ?? "") });
    } else if (op === "delete") {
      /* "The person who can create only can delete." */
      const refusal = await moduleDeleteRefusal("/customers");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      if (!id) return NextResponse.json({ error: "Which group?" }, { status: 400 });
      await deleteGroup(id);
    } else {
      return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, state: await readCustomerGroups() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That did not save." },
      { status: 400 }
    );
  }
}
