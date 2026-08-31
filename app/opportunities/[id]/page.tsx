import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { buildOpportunity360 } from "@/lib/opportunity360";
import { meetingsForOpportunity, readMeetings } from "@/lib/meetings";
import { listOfferings } from "@/lib/offerings";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { readPrivileges } from "@/lib/privileges";
import { readRecordTeams } from "@/lib/recordTeams";
import { mayTouchOpportunity } from "@/lib/recordAccess";
import { OpportunityDetail } from "@/components/opportunities/OpportunityDetail";

export const dynamic = "force-dynamic";

/* The tab says which deal it is. Without this, every open opportunity read
   "Freyr Sales Intelligence" and two of them were indistinguishable in the tab
   strip (found Aug 30 in the browser). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { opportunities } = await readOpportunities();
  const deal = opportunities.find((o) => o.id === id);
  return { title: deal ? deal.name || deal.customer : "Opportunity" };
}

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

  const [{ opportunities }, offerings, role, meetingState, me, privileges, teams] =
    await Promise.all([
      readOpportunities(),
      listOfferings(),
      getRole(),
      readMeetings().catch(() => ({ meetings: [] })),
      getCurrentUser(),
      readPrivileges(),
      readRecordTeams(),
    ]);
  const deal = opportunities.find((o) => o.id === id);
  if (!deal) notFound();

  const db = getDb();
  const customers = await db.customers.list().catch(() => []);
  const bands = await buildOpportunity360(deal.id, role);

  const customerId =
    customers.find(
      (c) =>
        (c.company_name ?? "").trim().toLowerCase() ===
        deal.customer.trim().toLowerCase()
    )?.id ?? null;

  /* WHAT THIS PERSON MAY DO TO THIS DEAL — the privilege map joined to who is
     actually on the account and on the deal (Suren, Aug 30). Decided on the
     server so a hidden control is not the only thing standing between somebody
     and a write. */
  const verdict = mayTouchOpportunity({
    privileges,
    teams,
    person: me.name,
    role,
    opportunityId: deal.id,
    ...(customerId ? { customerId } : {}),
  });

  return (
    <OpportunityDetail
      verdict={verdict}
      deal={deal}
      bands={bands}
      offerings={offerings.map((o) => ({
        id: o.id,
        name: o.offering_name,
        type: o.offering_type,
      }))}
      customerId={customerId}
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
