import { NextResponse } from "next/server";
import { importOfferingsWorkbook } from "@/lib/offeringsImport";
import { commitOfferingsChange } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

// Accepts a multipart upload of Suren's Excel and upserts offerings, categories,
// and types so Saras doesn't have to re-enter the data by hand.
export async function POST(req: Request) {
  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only — admin access required" },
      { status: 403 }
    );

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json(
      { error: "Expected a file upload (multipart/form-data)." },
      { status: 400 }
    );
  }
  if (!file) {
    return NextResponse.json(
      { error: "No file uploaded — choose an .xlsx to import." },
      { status: 400 }
    );
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return NextResponse.json(
      { error: "That's not an Excel file — upload a .xlsx." },
      { status: 400 }
    );
  }
  if (file.size > MAX_WORKBOOK_BYTES) {
    return NextResponse.json(
      { error: "Workbook is too large. The maximum upload size is 5 MB." },
      { status: 413 }
    );
  }

  const buf = await file.arrayBuffer();
  let result;
  try {
    result = await commitOfferingsChange(() => importOfferingsWorkbook(buf));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import save failed." },
      { status: 503 }
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Import failed." },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
