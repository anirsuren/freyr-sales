import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canOpenModule } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function GET() {
  /* THE LIST IS DATA TOO.
   *
   * This route asked NOTHING before: no session, no role, no privilege. Anyone
   * who could reach the app read every customer in the workspace over the API,
   * including somebody set to `none` on Customers, whose whole point is that
   * they see no customers. The page was guarded and the door beside it was
   * open, which made "none sees nothing" true only of the screen.
   *
   * Same helper the customer-groups route already uses, so there is one answer
   * to "may this person open Customers" and not a second one here.
   *
   * The only caller is the account suggester in PerformanceModule, which does
   * `if (!Array.isArray(data.customers)) return;` and, in its own words, lets
   * the field stay typeable and just stop suggesting. So a refusal degrades
   * the way that code already expects.
   */
  if (!(await canOpenModule("/customers")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const db = getDb();
  const customers = await db.customers.list();

  const enriched = await Promise.all(
    customers.map(async (c) => {
      const contacts = await db.contacts.list(c.id);
      const interactions = await db.interactions.list(c.id);
      const sessions = await db.pitchSessions.list(c.id);
      return {
        ...c,
        contact_count: contacts.length,
        last_outcome: interactions[0]?.outcome || null,
        last_session_date: sessions[0]?.created_at || null,
      };
    })
  );

  return NextResponse.json({ customers: enriched });
}
