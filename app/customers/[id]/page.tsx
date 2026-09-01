import { orderBands } from "@/lib/connectionOrder";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { RecordTeamButton } from "@/components/team/RecordTeamButton";
import type { Customer360Band } from "@/lib/customer360Shared";
import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { ClipboardList,
  FileText, SearchX, ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { SizeBadge } from "@/components/ui/Badge";
import { IndustryTag } from "@/components/ui/IndustryTag";
import { CreatedStamp } from "@/components/ui/CreatedStamp";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { NewSessionButton } from "@/components/sessions/NewSessionButton";
import { RequestSolutioningButton } from "@/components/customers/RequestSolutioningButton";
import { readOpportunities } from "@/lib/opportunities";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getRole } from "@/lib/role";
import { buildCustomer360 } from "@/lib/customer360";
import { Customer360 } from "@/components/customers/Customer360";
import { BAND_ICONS } from "@/lib/customer360Shared";
import { CustomerTabs } from "@/components/customers/CustomerTabs";
import { initializeLiveOfferings, listFdlComponents } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { RecordView } from "@/components/RecordView";
import {
  listCustomerTypes,
  listOfferings,
  MATERIAL_META,
  type Offering,
} from "@/lib/offerings";
import { isSalesVisible } from "@/lib/offeringMaterials";
import { getDataMode } from "@/lib/dataMode";
import { requireModuleAccess, moduleWriteRefusal, moduleDeleteRefusal } from "@/lib/moduleAccessServer";
import {
  canDeleteRecord,
  canEditRecord,
  resolveScope,
} from "@/lib/recordScope";

/** The account's own name in the tab, the way every offering already does it.
 *  A static "Customer" made three open accounts indistinguishable in the tab
 *  strip (found Aug 14 walking the flows). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getDb().customers.get(id);
  return { title: customer ? `${customer.company_name} · Customers` : "Customer" };
}

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/customers");
  const id = (await params).id;
  const db = getDb();
  const customer = await db.customers.get(id);

  if (!customer) {
    return (
      <EmptyState
        icon={SearchX}
        title="Customer not found"
        description="The link may be out of date, or this account was removed. Head back to your customers to find it."
        className="py-24"
        action={
          <SmartBack
            fallback="/customers"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to customers
          </SmartBack>
        }
      />
    );
  }

  const contacts = await db.contacts.list(id);
  const interactions = await db.interactions.list(id);
  const sessions = await db.pitchSessions.list(id);
  // No agent-run fetch here any more: the account rail's agent block and its
  // Deliverables tiles are both gone, so this page listed every agent run in
  // the workspace on each load and used none of it. The only agent surfaces are
  // the dock and /agent (standing rule).
  //
  // No header health calc either — the score already leads the Account snapshot
  // rail and the Relationship health card, and the header bar that used this
  // was removed.

  // Customer analysis (Suren's Jun 27 ask): the customer-type definitions feed
  // the "Analyze the customer" dropdown, and once an account is qualified to a
  // type, the offerings applicable to that type show automatically.
  const customerTypes = listCustomerTypes();
  const matchedType = customer.customer_type
    ? customerTypes.find((t) => t.name === customer.customer_type)
    : null;

  // Customer⇄offering link (Suren, Jul 3): serialize the offerings applicable
  // to this customer's type — and the ones already in use — WITH descriptions
  // and sales materials, so the Offerings tab lets a rep work the account
  // without ever leaving the customer page.
  const toTabOffering = (o: Offering) => ({
    id: o.id,
    name: o.offering_name,
    category: o.offering_category,
    type: o.offering_type,
    availability: o.current_availability,
    poc: o.poc,
    description: o.offering_description,
    // Agent-training uploads never leave the offering page: they exist to make
    // the assistant smarter, not to be handed to a customer (Wajeed, Jul 29).
    materials: o.materials.filter(isSalesVisible).map((m) => ({
      id: m.id,
      kind: MATERIAL_META[m.kind]?.label || m.kind,
      // The raw kind travels alongside its label so the tab can resolve the
      // format glyph — the label alone can't be mapped back to an icon.
      kindKey: m.kind,
      label: m.label,
      url: m.url,
      // CR-3 tags travel as raw values; the tab narrows them safely so
      // untagged legacy materials render without pills instead of crashing.
      journeyStage: m.journeyStage,
      accessLevel: m.accessLevel,
    })),
  });
  const allOfferings = listOfferings();
  const applicableRich = matchedType
    ? allOfferings
        .filter((o) => o.customer_type_ids.includes(matchedType.id))
        .map(toTabOffering)
    : [];
  const inUseIds = new Set(customer.offerings_in_use || []);
  const inUseRich = allOfferings
    .filter((o) => inUseIds.has(o.id))
    .map(toTabOffering);

  // The Freya software this customer runs, for the Digital components tab.
  await initializeLiveOfferings().catch(() => undefined);
  const fdlComponents = listFdlComponents();
  const canEditComponents = await canManageOfferings();

  /**
   * EVERYTHING CONNECTED TO THIS ACCOUNT (Suren, Aug 25: "when I go to a
   * particular customer, I want to get all the view of the customer one shot —
   * how many opportunities are running, how many meetings are happening, how
   * many presentations are happening, how many submissions have I done").
   *
   * Each band is gated on what this person may actually open, and the contacts
   * band is filled in here because this page already holds them.
   */
  const c360: Customer360Band[] = await buildCustomer360(
    customer.id,
    customer.company_name,
    await getRole()
  ).catch(() => []);

  /* What the in-place "Request solutioning" dialog needs. Same shapes the
     Solutioning page builds, so one form behaves identically wherever it is
     opened from. Every one is non-fatal: a missing picker costs a dropdown,
     never the page. */
  const [solutioningDealsRaw, solutioningCustomersRaw, solutioningDirectory] =
    await Promise.all([
      readOpportunities()
        .then((s) => s.opportunities)
        .catch(() => []),
      db.customers.list().catch(() => []),
      process.env.FREYR_WORKSPACE_ID
        ? listWorkspaceAccess(process.env.FREYR_WORKSPACE_ID).catch(() => null)
        : Promise.resolve(null),
    ]);
  const solutioningCustomers = solutioningCustomersRaw
    .map((c) => ({ id: c.id, name: c.company_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const solutioningDeals = solutioningDealsRaw.map((o) => ({
    id: o.id,
    label: o.name || `${o.customer} deal`,
    customer: o.customer,
    customerId: o.customerId ?? null,
  }));
  /* Real workspace accounts only. Never invented names on real data. */
  const solutioningMembers = [
    ...new Set(
      (solutioningDirectory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  /* NO CONTACTS BAND. THE PAGE ALREADY HAS A CONTACTS TAB.
     Anir, Sep 1: "why would we have contacts tabs two of em."

     There were literally two tabs reading "Contacts 0" side by side on one
     strip. This band was one of them, and the giveaway is its own href: it
     pointed at `?tab=contacts`, which is the OTHER one. A tab whose action is
     to open its twin.

     The tab wins and the band goes, because the tab is the one that can
     actually do the work: it owns Add contact and the contact delete. This
     band was a read-only list of the same people. Removing the tab instead
     would have taken those two controls off the only screen that has them.

     Contacts are not a connection band in the first place. The bands are
     other RECORDS that point at this account, opportunities, contracts,
     leads. A contact is part of the account itself, which is why it has its
     own tab and its own editor. */
  const bands360 = orderBands(c360);
  const recordTeams = await readRecordTeams();

  /**
   * WHAT MAY THIS PERSON DO TO **THIS** ACCOUNT (Suren, Sep 1): "you can only
   * do anything on a particular customer that you are part of or created or
   * edited so far. For other records that they are not part of, they should
   * have a view option to view other records."
   *
   * Resolved on the server and used to decide which controls are drawn at all.
   * The controls are a courtesy, not the control: PATCH /api/customers/[id],
   * the contacts routes and /api/record-team each ask the same question again
   * through recordWriteRefusal, so a hidden button is never the only thing
   * standing between somebody and a write.
   *
   * NO "VIEW ONLY" BANNER HERE (Anir, Sep 1: "I don't want you to say 'view
   * only'... that's just wasting space"). The absence of the controls says it,
   * and the shield in the top bar gives the reason on hover, which is where he
   * asked for that answer to live. See /api/my-access.
   */
  const scope = await resolveScope();
  const asRecord = {
    id: customer.id,
    owner: customer.owner,
    owner_user_id: customer.owner_user_id,
    created_by: customer.created_by,
  };
  const mayEditThisAccount =
    !(await moduleWriteRefusal("/customers")) &&
    canEditRecord(asRecord, "customers", scope);
  const mayDeleteOnThisAccount =
    !(await moduleDeleteRefusal("/customers")) &&
    canDeleteRecord(asRecord, "customers", scope);


  return (
    <div>
      <RecordView
        type="Customer"
        label={customer.company_name}
        sublabel={customer.industry || ""}
        href={`/customers/${customer.id}`}
      />
      {/* THE WAY BACK. This page had none: every other detail page in the app
          opens with one, but a customer opened from the list, the heat map or
          a search result left you with the sidebar as the only exit (found
          Aug 14 walking the flows). SmartBack, not a hardcoded link, so it
          returns to wherever you actually came from. */}
      <SmartBack
        fallback="/customers"
        className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All customers
      </SmartBack>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <CompanyLogo
            name={customer.company_name}
            className="w-12 h-12 text-[16px]"
          />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {customer.company_name}
            </h1>
            {/* Identity only, directly under the name: what this account IS —
                its industry and its size, each a colour + icon chip. The health
                bar used to sit here and read as clutter against the company name
                (Anir, Jul 26: "the health bar looks really ugly next to the name
                at the top"); health is a MEASURE, not an identity, so it moved
                to its own labelled block on the right of the header. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {customer.industry && <IndustryTag industry={customer.industry} />}
              <SizeBadge tier={customer.size_tier} />
            </div>
            {/* When this account arrived, and who filed it (Anir, Aug 23). */}
            <CreatedStamp
              by={customer.created_by}
              at={customer.created_at}
              className="mt-1.5 text-[11.5px] text-text-tertiary"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* No health bar in the header: the same score already leads the
              Account snapshot rail AND the Relationship health card below, so a
              third copy beside the buttons was pure duplication (Anir, Jul 27:
              "remove the health bar from next to the New session, it's already
              below"). */}
          {/* Start a pitch session for THIS account — the button first explains
              what a session is (Suren #89), then prefills the intake with the
              company + primary contact. */}
          <NewSessionButton
            company={customer.company_name}
            intakeHref={`/intake?company=${encodeURIComponent(customer.company_name)}${
              contacts[0]
                ? `&contact=${encodeURIComponent(contacts[0].full_name)}`
                : ""
            }${
              customer.website_url
                ? `&website=${encodeURIComponent(customer.website_url)}`
                : ""
            }`}
          />
          {/* THE SALES-SIDE DOOR INTO SOLUTIONING (Suren, Aug 24: "from the
              customer module itself they can request against an opportunity").
              Opens the request form HERE rather than sending you to another
              page (Anir, Aug 28: "when I press 'Request Solutioning', why does
              it take me to another page?"). Same dialog the leads page uses. */}
          <RequestSolutioningButton
            canRequest={!(await moduleWriteRefusal("/solutioning"))}
            customerId={customer.id}
            companyName={customer.company_name}
            customers={solutioningCustomers}
            opportunities={solutioningDeals}
            members={solutioningMembers}
          />
          <Link
            href={`/customers/${customer.id}/report`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <FileText size={15} strokeWidth={1.7} />
            Report
          </Link>
        </div>
      </div>

      {/* The connections are TABS ON THE PAGE'S OWN ROW now, not a card
          above it (Suren, Aug 28: "there's no point having two tabs — the
          entire thing should be just one big page"). See CustomerTabs. */}
      <CustomerTabs
        /* The same question PATCH /api/customers/[id] asks, so the identity
           fields are editable exactly when a save would land. Since Sep 1 that
           question includes whether this account is one of yours. */
        canEditFacts={mayEditThisAccount}
        /* Removing a person from an account is a DELETE, not a write — asked
           separately so an editor cannot delete and a control that would be
           refused is never drawn. */
        canDeleteContacts={mayDeleteOnThisAccount}
        bands={bands360}
        bandActions={{
          /* CHANGING WHO IS ON AN ACCOUNT IS THE STRONGEST WRITE THERE IS, so
             it is drawn only for somebody who may already change this account.
             Otherwise it is the way round every other check: put yourself on
             the record and it becomes yours. /api/record-team refuses it as
             well; this stops it being offered. The team itself still READS on
             the band for everybody, which is the point of view access. */
          team: mayEditThisAccount ? (
            <RecordTeamButton
              type="customer"
              id={customer.id}
              label={customer.company_name}
              team={teamFor(recordTeams, "customer", customer.id)}
              members={solutioningMembers}
            />
          ) : null,
        }}
        customer={customer}
        contacts={contacts}
        sessions={sessions}
        interactions={interactions}
        includeDemoTeam={getDataMode() === "mock"}
        offeringsCatalog={{
          typeOptions: customerTypes.map((t) => t.name),
          applicable: applicableRich,
          inUse: inUseRich,
          // THE WHOLE CATALOGUE, for the places that must not be filtered.
          // "Applicable" is derived from the account's classification, so a
          // customer added a minute ago matches nothing and both lists above
          // are empty. That is fine for a recommendation panel and fatal for
          // the activity picker, which had no offering to pick and no way to
          // add one (Suren, Aug 9: "where is the offering? how do I add the
          // offering? it does not allow me to add the offering at all").
          all: allOfferings.map(toTabOffering),
        }}
        fdlComponents={fdlComponents}
        canEditComponents={canEditComponents}
      />
    </div>
  );
}
