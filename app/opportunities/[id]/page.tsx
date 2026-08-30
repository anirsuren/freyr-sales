import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { buildOpportunity360 } from "@/lib/opportunity360";
import { meetingsForOpportunity, readMeetings } from "@/lib/meetings";
import { listOfferings } from "@/lib/offerings";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { OpportunityDetail } from "@/components/opportunities/OpportunityDetail";

export const dynamic = "force-dynamic";

/**
 * ONE OPPORTUNITY, ON ITS OWN PAGE.
 *
 * Anir, Aug 30: "why can't it be like when I click on it, the screen goes
 * away, and I open that screen" — and Suren before him: "when they click on
 * the opportunity, you show the full opportunity page and these related
 * things... all the tabs connected to that opportunity."
 *
 * Everything before this tried to show a deal inside the list it came from: an
 * unfolding row, then a right-hand split pane, then a dialog. The dialog was
 * the worst of them — a pinned-height sheet with a four-line panel in it and
 * half a screen of white underneath, because the panel was built to sit in a
 * table row, not to be a page.
 *
 * A deal has a customer, offerings, money, a story, meetings, submissions,
 * presentations, contracts and documents hanging off it. That is a page. So it
 * gets a route, the customer page's own band strip for everything connected to
 * it, and a back link that returns to whichever list sent you.
 */
export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/opportunities");
  await requireServerMemberScope();
  const { id } = await params;

  const [{ opportunities }, offerings, role, meetingState] = await Promise.all([
    readOpportunities(),
    listOfferings(),
    getRole(),
    readMeetings().catch(() => ({ meetings: [] })),
  ]);
  const deal = opportunities.find((o) => o.id === id);
  if (!deal) notFound();

  const db = getDb();
  const customers = await db.customers.list().catch(() => []);
  const bands = await buildOpportunity360(deal.id, role);

  return (
    <OpportunityDetail
      deal={deal}
      bands={bands}
      offerings={offerings.map((o) => ({
        id: o.id,
        name: o.offering_name,
        type: o.offering_type,
      }))}
      customerId={
        customers.find(
          (c) =>
            (c.company_name ?? "").trim().toLowerCase() ===
            deal.customer.trim().toLowerCase()
        )?.id ?? null
      }
      meetings={meetingsForOpportunity(meetingState.meetings, deal.id)
        .sort((a, b) => (b.meetingAt || "").localeCompare(a.meetingAt || ""))
        .map((m) => ({
          id: m.id,
          ref: m.ref,
          title: m.title,
          owner: m.owner,
          meetingAt: m.meetingAt,
          status: m.status,
        }))}
    />
  );
}
