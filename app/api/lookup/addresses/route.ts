import { NextRequest, NextResponse } from "next/server";
import { lookupGuard, lookupJson } from "../guard";
import { lookupSource, searchAddresses } from "@/lib/placeLookup";

export const dynamic = "force-dynamic";

/** Addresses matching what is typed into an address's first line. */
export async function GET(request: NextRequest) {
  const guard = await lookupGuard(request);
  if (guard instanceof NextResponse) return guard;
  const query = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (query.length < 3) return lookupJson({ source: lookupSource(), results: [] });
  try {
    return lookupJson(await searchAddresses(query, guard.session));
  } catch {
    return lookupJson({ error: "The address lookup is not answering right now." }, 502);
  }
}
