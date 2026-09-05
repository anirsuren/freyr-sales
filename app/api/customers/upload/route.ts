import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { uploadMaterialFile } from "@/lib/materialStorage";
import { getDb } from "@/lib/db";
import { canOpenModule } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A FILE ON AN ACCOUNT'S ACTIVITY (Anir, Sep 4, holding the activity table
 * next to a band table: "There should be documents. There should be a column
 * for documents").
 *
 * Same two-step shape the meeting and solutioning uploads use: this stores
 * the bytes and returns a docsPath, and the caller then saves the activity
 * with the document on it. A failed save never leaves a half-made row.
 */
export async function POST(req: NextRequest) {
  if (!(await canOpenModule("/customers")))
    return NextResponse.json({ error: "Not available on this account." }, { status: 403 });

  const customerId = new URL(req.url).searchParams.get("customerId") ?? "";
  if (!customerId)
    return NextResponse.json({ error: "Which account?" }, { status: 400 });

  /* The account must exist before anything is stored, so a typo cannot leave
     an orphan file in the bucket that nothing will ever point at. */
  const customer = await getDb().customers.get(customerId);
  if (!customer)
    return NextResponse.json({ error: "That account is gone." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const me = await getCurrentUser();
  try {
    const stored = await uploadMaterialFile(`customers/${customerId}`, file, me.name);
    return NextResponse.json({
      ok: true,
      docsPath: stored.docsPath,
      fileName: stored.filename,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That file did not upload." },
      { status: 500 }
    );
  }
}
