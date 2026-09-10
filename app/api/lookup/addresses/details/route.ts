import { NextRequest, NextResponse } from "next/server";
import { lookupGuard, lookupJson } from "../../guard";
import { addressDetails } from "@/lib/placeLookup";
import { ADDRESS_REF_RE } from "@/lib/placeLookupShared";

export const dynamic = "force-dynamic";

/** The full address behind a Google suggestion someone picked. */
export async function GET(request: NextRequest) {
  const guard = await lookupGuard(request);
  if (guard instanceof NextResponse) return guard;
  const ref = request.nextUrl.searchParams.get("ref") ?? "";
  if (!ADDRESS_REF_RE.test(ref)) return lookupJson({ error: "Which address?" }, 400);
  try {
    const address = await addressDetails(ref, guard.session);
    if (!address) return lookupJson({ error: "That address could not be found." }, 404);
    return lookupJson({ source: "google", address });
  } catch {
    return lookupJson({ error: "The address lookup is not answering right now." }, 502);
  }
}
