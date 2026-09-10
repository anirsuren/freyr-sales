import { NextRequest, NextResponse } from "next/server";
import { lookupGuard, lookupJson } from "../guard";
import { lookupSource, searchCompanies } from "@/lib/placeLookup";

export const dynamic = "force-dynamic";

/** Companies matching what is typed into Add customer's name box. */
export async function GET(request: NextRequest) {
  const guard = await lookupGuard(request);
  if (guard instanceof NextResponse) return guard;
  const query = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (query.length < 2) return lookupJson({ source: lookupSource(), results: [] });
  try {
    return lookupJson(await searchCompanies(query, guard.session));
  } catch {
    return lookupJson({ error: "The company lookup is not answering right now." }, 502);
  }
}
