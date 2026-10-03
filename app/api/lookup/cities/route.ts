import { NextRequest, NextResponse } from "next/server";
import { lookupGuard, lookupJson } from "../guard";
import { lookupSource, searchCities } from "@/lib/placeLookup";

export const dynamic = "force-dynamic";

/** Addresses matching what is typed into an address's first line. */
export async function GET(request: NextRequest) {
  const guard = await lookupGuard(request);
  if (guard instanceof NextResponse) return guard;
  const query = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (query.length < 2) return lookupJson({ source: lookupSource(), results: [] });
  try {
    return lookupJson(await searchCities(query, guard.session, (request.nextUrl.searchParams.get("country") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)));
  } catch {
    return lookupJson({ error: "The city lookup is not answering right now." }, 502);
  }
}
