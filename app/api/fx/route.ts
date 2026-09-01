import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { usdRatesOn } from "@/lib/fxRates";

export const dynamic = "force-dynamic";

/**
 * WHAT A CURRENCY WAS WORTH ON A DAY.
 *
 * The deal form shows a local amount in US dollars (Suren, Sep 1: "it should
 * also show what the value of this is if it is converted to USD"), and the
 * rate has to be the one from the deal's own sign date: "based on that date,
 * whatever the conversion rate is on that particular day."
 *
 * The browser cannot fetch that itself — one open tab would be one call to the
 * source, and the cache would live nowhere. So the fetch and its store sit in
 * lib/fxRates on the server and this route hands the client plain numbers.
 *
 * Reading is open to anyone signed in, the same rule the opportunities route
 * reads by. There is nothing private in a published exchange rate; sign-in is
 * here so the app is not an open proxy to somebody else's free service.
 *
 * ?on=YYYY-MM-DD — the day to price. Absent, unparseable or in the future all
 * mean "the latest published day", and the reply's `date` says which day the
 * numbers are really from, so the form can label them honestly.
 *
 * 503 with an error when the rate cannot be had. The form then says it cannot
 * convert right now; it never shows a guess, and it never stops you saving the
 * deal, because the numbers being saved are the ones the person typed.
 */
export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const on = req.nextUrl.searchParams.get("on") ?? undefined;
  const day = await usdRatesOn(on);
  if (!day) {
    return NextResponse.json(
      { error: "Exchange rates are not available right now." },
      { status: 503 }
    );
  }
  return NextResponse.json({ day });
}
