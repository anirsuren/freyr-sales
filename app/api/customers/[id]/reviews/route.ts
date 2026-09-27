import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { canOpenModule, recordWriteRefusal } from "@/lib/moduleAccessServer";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isWorkflowOwnerOrManager, verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { addAccountReview, readAccountReviews } from "@/lib/accountReviews";

export const dynamic = "force-dynamic";

async function account(req: NextRequest, id: string) {
  if (!(await verifiedRequestMemberScope(req))) return { error: "Not signed in.", status: 401 } as const;
  if (!(await canOpenModule("/customers"))) return { error: "Customers are not available on this account.", status: 403 } as const;
  const customer = await getDb().customers.get(id);
  if (!customer) return { error: "Customer not found.", status: 404 } as const;
  return { customer } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await account(req, (await params).id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ reviews: await readAccountReviews(result.customer.id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await account(req, (await params).id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const customer = result.customer;
  const refusal = await recordWriteRefusal("/customers", {
    id: customer.id, owner: customer.owner, owner_user_id: customer.owner_user_id, created_by: customer.created_by,
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  if (getDataMode() === "live") {
    const actor = await verifiedWorkflowActor(req);
    if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
    if ((customer.owner_user_id || customer.owner?.trim()) && !isWorkflowOwnerOrManager(actor, customer.owner_user_id, customer.owner)) {
      return NextResponse.json({ error: "You can update only accounts assigned to you." }, { status: 403 });
    }
  }
  try {
    const body = await req.json();
    const me = await getCurrentUser();
    const review = await addAccountReview(customer.id, body, me.name);
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "That review didn't save." }, { status: 400 });
  }
}
