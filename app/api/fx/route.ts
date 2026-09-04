import { NextRequest, NextResponse } from "next/server";
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
 * Reading is open, full stop — see the note in GET. There is nothing private
 * in a published exchange rate, and the server-side cache means this is not a
 * usable proxy to the free source behind it.
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
  /* NO SIGN-IN CHECK, DELIBERATELY (Sep 4). The comment above used to argue
     sign-in kept the app from being an open proxy; what it actually did was
     make currency conversion die whenever the 15-minute access grant was
     renewing, because the form's fetch got a 401 it silently ate. The cache
     in lib/fxRates means even a hammering caller reaches the free source at
     most once per day-key per 6 hours, so there is no proxy to abuse — and a
     published ECB reference rate is public information. */
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
