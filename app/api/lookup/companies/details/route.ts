import { NextRequest, NextResponse } from "next/server";
import { lookupGuard, lookupJson } from "../../guard";
import { companyDetails } from "@/lib/placeLookup";
import { COMPANY_REF_RE } from "@/lib/placeLookupShared";

export const dynamic = "force-dynamic";

/** The name, website and HQ address of the company someone picked. */
export async function GET(request: NextRequest) {
  const guard = await lookupGuard(request);
  if (guard instanceof NextResponse) return guard;
  const ref = request.nextUrl.searchParams.get("ref") ?? "";
  if (!COMPANY_REF_RE.test(ref)) return lookupJson({ error: "Which company?" }, 400);
  try {
    const company = await companyDetails(ref, guard.session);
    if (!company) return lookupJson({ error: "That company could not be found." }, 404);
    return lookupJson({ source: ref.startsWith("g:") ? "google" : "open", company });
  } catch {
    return lookupJson({ error: "The company lookup is not answering right now." }, 502);
  }
}
