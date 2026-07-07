import { NextResponse } from "next/server";
import { importOfferingsWorkbook } from "@/lib/offeringsImport";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

// Accepts a multipart upload of Suren's Excel and upserts offerings, categories,
// and types so Saras doesn't have to re-enter the data by hand.
export async function POST(req: Request) {
  if (!isAdmin())
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

  const buf = await file.arrayBuffer();
  const result = importOfferingsWorkbook(buf);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Import failed." },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
