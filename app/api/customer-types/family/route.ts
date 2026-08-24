import { NextResponse } from "next/server";
import { renameCustomerFamily, commitOfferingsChange } from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * RENAME A CUSTOMER FAMILY — ADMIN ONLY.
 *
 * Anir, Aug 24: "the change is for everyone, but the access to edit this is
 * only with admins." Same gate as editing a single definition next to it
 * (isAdmin, deliberately narrower than the Add control's admin+manager), so
 * the two edit affordances on this screen agree about who may use them.
 */
export async function PATCH(req: Request) {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "View only: admin access required" },
      { status: 403 }
    );
  const body = (await req.json().catch(() => ({}))) ?? {};
  const from = String(body.family || "").trim();
  const to = String(body.name || "").trim();
  if (!from || !to)
    return NextResponse.json(
      { error: "family and name are required" },
      { status: 400 }
    );
  try {
    const result = await commitOfferingsChange(() =>
      renameCustomerFamily(from, to)
    );
    if (result.error)
      return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, renamed: result.renamed.length, name: to });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rename failed" },
      { status: 503 }
    );
  }
}
