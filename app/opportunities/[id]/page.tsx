import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { readRevenueAccruals } from "@/lib/revenueAccruals";
import { buildOpportunity360 } from "@/lib/opportunity360";
import { meetingsForOpportunity, readMeetings } from "@/lib/meetings";
import { listOfferings } from "@/lib/offerings";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { readPrivileges } from "@/lib/privileges";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { mayTouchOpportunity } from "@/lib/recordAccess";
import { OpportunityDetail } from "@/components/opportunities/OpportunityDetail";
import { RequestSolutioningButton } from "@/components/customers/RequestSolutioningButton";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getDataMode } from "@/lib/dataMode";
import {
  canOpenModule,
  moduleWriteRefusal,
  recordWriteRefusal,
} from "@/lib/moduleAccessServer";

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
  /* Needed by the meeting form, which asks who from the customer side is
     coming. Loaded here rather than inside the dialog because the dialog is
     a client component and this is the only page that opens it from a deal. */
  const contacts = await db.contacts.list().catch(() => []);
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
   * MAY THIS PERSON CHANGE WHO IS ON THE DEAL.
   *
   * Anir, Sep 1: "if I want to add people, how do I do that? ... There should
   * be a plus button on people." So the Overview's People section can now put
   * somebody on a deal, and since Sep 1 being on a deal is what makes it
   * editable. That makes this the strongest write on the page and it is asked
   * the strongest way available: the exact call /api/record-team makes before
   * it saves, with the exact record shape it passes, so the control and the
   * route can never disagree about the answer.
   *
   * AND the deal-level verdict on top, because the record check does not know
   * about the account's own team and mayTouchOpportunity does. Both, never
   * either: this must not become a way to reach a deal the page would not
   * otherwise let you touch.
   */
  const mayChangeTeam =
    verdict.mayEdit &&
    !(await recordWriteRefusal("/opportunities", { id: deal.id }));

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

  /**
   * PLANNING THE ACCRUAL WITHOUT LEAVING THE DEAL.
   *
   * Suren, Sep 1: "that opportunity is going to have only one revenue
   * approval... Create revenue accrual, we should do it at this level only.
   * It's NOT a revenue accrual tab... I think the same screen from there, both
   * the screens have to be the same. It's just that same screen shows up
   * here."
   *
   * So the Revenue accruals tab opens the module's own planner in place rather
   * than handing over to another page. The dialog needs three things the tab
   * cannot work out for itself: whether this person may write a plan, the deal
   * in the shape the planner wants, and the plan already on it.
   *
   * WRITE, ASKED ON THE SERVER, exactly the question /api/revenue-accruals
   * asks before it saves. Somebody who may only read gets no button rather
   * than a form that fails on Save — and the band, its months and the way out
   * to the module are all still there, because reading was never the thing
   * being gated.
   */
  const mayPlanAccrual =
    (await canOpenModule("/revenue-accruals")) &&
    !(await moduleWriteRefusal("/revenue-accruals"));
  const accrualPlan = (await canOpenModule("/revenue-accruals"))
    ? ((await readRevenueAccruals().catch(() => null))?.plans.find(
        (p) => p.opportunityId === deal.id
      ) ?? null)
    : null;
  /* The planner's own view of a deal: the same fields the Revenue accruals
     module hands it, read off the opportunity here. One offering per
     opportunity (Suren, Aug 17), so the first line is the line. */
  const accrualLine = (deal.lines ?? [])[0];
  const accrualOfferingId = accrualLine?.offeringId ?? deal.offeringIds[0];
  const accrualOfferingLabel = accrualOfferingId
    ? (offerings.find((o) => o.id === accrualOfferingId)?.offering_name ??
      accrualOfferingId)
    : (accrualLine?.offeringLabel ?? deal.offeringLabels[0]);
  const accrualSignDate = accrualLine?.estSignDate ?? deal.estSignDate;

  return (
    <OpportunityDetail
      verdict={verdict}
      accrual={{
        mayPlan: mayPlanAccrual,
        plan: accrualPlan,
        deal: {
          id: deal.id,
          name: deal.name || `${deal.customer} deal`,
          customer: deal.customer,
          ...(deal.customerId ? { customerId: deal.customerId } : {}),
          ...(accrualOfferingId ? { offeringId: accrualOfferingId } : {}),
          ...(accrualOfferingLabel ? { offeringLabel: accrualOfferingLabel } : {}),
          value: deal.value ?? 0,
          ...(deal.status ? { status: deal.status } : {}),
          ...(accrualSignDate ? { estSignDate: accrualSignDate } : {}),
        },
      }}
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
              contacts: contacts.map((c) => ({
                id: c.id,
                name: c.full_name,
                customerId: c.customer_id ?? null,
                title: c.job_title ?? "",
              })),
              meName: me.name,
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
      /* WHAT THE OVERVIEW FORM'S TWO PICKERS NEED. Passed on their own rather
         than read off createOptions, which is null for anybody who may not
         raise solutioning work — the owner of a deal should not lose the owner
         picker because of a privilege on a different module. */
      customers={customers.map((c) => ({
        id: c.id,
        name: c.company_name ?? "",
      }))}
      people={members}
      meName={me.name}
      /* Who is on this deal, read off the teams row this page already loaded. */
      team={teamFor(teams, "opportunity", deal.id)}
      mayChangeTeam={mayChangeTeam}
      /* ITEM 6 — "Under People, Owner is the person who add the Opportunity.
         Let it be System generated with Admin having the rights to change
         it." So the owner picker is an admin control; everyone else reads the
         name. Adding SUPPORT is unchanged and stays with the owner, which is
         the second half of his sentence. */
      mayChangeOwner={role === "admin"}
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
