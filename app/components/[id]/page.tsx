import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  getFdlComponent,
  initializeLiveOfferings,
  listOfferings,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { FdlComponentDetail } from "@/components/fdl/FdlComponentDetail";
import {
  moduleDeleteRefusal,
  requireModuleAccess,
} from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

// The tab has to say which component you have open — every other detail page
// in the app names itself, and a row of tabs all reading "Freyr Sales
// Intelligence" is unusable once you have three of them.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await initializeLiveOfferings().catch(() => undefined);
  return { title: getFdlComponent(id)?.name ?? "FDL Components" };
}

export default async function FdlComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requireModuleAccess("/components");
  await initializeLiveOfferings().catch(() => undefined);
  const { id } = await params;
  // WHERE "BACK" SHOULD GO. Suren, Aug 9: "you should have a back button —
  // the moment I click on it it should go back to the thing, now again I have
  // to start from the previous thing." Arriving from an offering or a customer
  // carries that origin in ?from=; only same-site paths are honoured.
  const { from } = await searchParams;
  // Same-site paths only. A leading "//" is a protocol-relative URL — "//evil"
  // passes a naive "starts with /" check and sends the reader off the site, so
  // it is rejected explicitly.
  const backTo =
    from && from.startsWith("/") && !from.startsWith("//") &&
    /^\/[A-Za-z0-9/_?=&%-]*$/.test(from)
      ? from
      : null;
  const component = getFdlComponent(id);
    /* A MISSING RECORD LANDS ON ITS LIST, NEVER ON A DEAD END (Anir, Sep 4,
     stuck on "Customer not found" after a mode switch: "i should never go
     here... just take me back to the page with all those things. dont show me
     that it doesnt exist"). The commonest way to arrive with a stale id is
     flipping Mock/Real while standing on a record; the honest answer is the
     module's own list, which exists in both worlds. */
  if (!component) redirect("/components");
  const homes = listOfferings()
    .filter((offering) => offering.component_ids?.includes(id))
    .map((offering) => ({ id: offering.id, name: offering.offering_name }));
  // The reverse connection. Suren, Aug 9: "from the FDL component, do you have
  // an option to add offering? No, you don't — you should be able to say which
  // offerings this component goes through."
  const offerings = listOfferings().map((offering) => ({
    id: offering.id,
    name: offering.offering_name,
    connected: !!offering.component_ids?.includes(id),
  }));
  const canEdit = await canManageOfferings();
  /* BOTH GATES THE DELETE ROUTE ASKS, so the button is on screen exactly when
     it works — the privilege table first, then the role rule beside it. */
  const canDelete =
    canEdit && !(await moduleDeleteRefusal("/components"));

  // WHO RUNS THIS COMPONENT, AND ON WHICH VERSION (Suren, Aug 8: "if I go to
  // the component and click on this version, I want to see all the customers
  // in version 1… it's the same record, but I want to see it here").
  const all = await getDb().customers.list();
  const customers = all.map((customer) => {
    const link = (customer.digital_components || []).find(
      (item) => item.component_id === id
    );
    return {
      id: customer.id,
      name: customer.company_name,
      releaseId: link?.release_id ?? null,
      nextReleaseId: link?.next_release_id ?? null,
      connected: !!link,
    };
  });

  return (
    <div>
      {/* No page-level padding: the app shell already wraps every page in p-8,
          so adding px-6 py-6 here stacked a second inset and pushed this
          page's header below every other page's (Anir, Aug 9: "there's so much
          space at the top... whatever you have on the offerings page is good,
          that's how every other page should be mimicked"). */}
      <FdlComponentDetail
        component={component}
        homes={homes}
        canEdit={canEdit}
        canDelete={canDelete}
        customers={customers}
        backTo={backTo}
        offerings={offerings}
      />
    </div>
  );
}
