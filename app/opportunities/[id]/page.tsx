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
import { RequestSolutioningButton } from "@/components/customers/RequestSolutioningButton";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getDataMode } from "@/lib/dataMode";
import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";

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

  /**
   * ASK FOR SOLUTIONING FROM THE DEAL IT IS FOR.
   *
   * Anir, Aug 31, looking at a deal's empty Presentations tab: "am I supposed
   * to be able to add anything here? How do I add a presentation to this
   * opportunity?"
   *
   * The customer page has raised requests in place since Aug 28, and the deal
   * page — the one that lists submissions, presentations and meeting requests
   * against this exact deal — had no way to start one. You could see that
   * there were none and do nothing about it.
   *
   * Same dialog, same endpoint, and the deal is pre-filled, which the customer
   * page cannot do: there, the request is for the account and the deal is a
   * question. Here it is the answer.
   */
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory =
    live && workspace ? await listWorkspaceAccess(workspace).catch(() => null) : null;
  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : [
        "Elena Rossi",
        "Omar Haddad",
        "Nina Kowalski",
        "Marcus Chen",
        "Grace Liu",
        "Daniel Foster",
      ];
  /* Raising one is a WRITE on Solutioning, not a create — the same question
     the route asks. Somebody who cannot open the module gets no button at
     all rather than one that fails on submit. */
  const mayRequestSolutioning =
    (await canOpenModule("/solutioning")) &&
    !(await moduleWriteRefusal("/solutioning"));

  return (
    <OpportunityDetail
      verdict={verdict}
      /* What the create dialogs need, resolved once on the server. Null when
         this person may not create solutioning work, which hides the doors
         rather than showing ones that fail. */
      createOptions={
        mayRequestSolutioning
          ? {
              customers: customers.map((c) => ({
                id: c.id,
                name: c.company_name ?? "",
              })),
              opportunities: opportunities.map((o) => ({
                id: o.id,
                label: o.name || `${o.customer} deal`,
                customer: o.customer,
                customerId: o.customerId ?? null,
              })),
              members,
            }
          : null
      }
      requestSolutioning={
        mayRequestSolutioning ? (
          <RequestSolutioningButton
            /* Keyed because it is created here and rendered among siblings in
               the detail's header: React counts that as a list and warns
               without one. Harmless to render, noisy in the console, and a
               console nobody can read is a console nobody checks. */
            key="request-solutioning"
            customerId={customerId ?? ""}
            companyName={deal.customer}
            customers={customers.map((c) => ({
              id: c.id,
              name: c.company_name ?? "",
            }))}
            opportunities={opportunities.map((o) => ({
              id: o.id,
              label: o.name || `${o.customer} deal`,
              customer: o.customer,
              customerId: o.customerId ?? null,
            }))}
            members={members}
            prefillOpportunityId={deal.id}
          />
        ) : null
      }
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
