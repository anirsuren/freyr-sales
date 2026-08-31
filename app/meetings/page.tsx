import { MeetingsModule } from "@/components/meetings/MeetingsModule";
import { readMeetings } from "@/lib/meetings";
import { readOpportunities } from "@/lib/opportunities";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import {
  moduleCreateRefusal,
  requireModuleAccess,
} from "@/lib/moduleAccessServer";

export const metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

/**
 * MEETINGS (Suren, Aug 28): "I need to have a meetings module. Somebody can
 * come in and then create a new meeting."
 *
 * Customer meetings as their own object, with the people on both sides of the
 * table recorded, so a person's page, a customer's page and an opportunity can
 * each answer what meetings touched them.
 */
export default async function MeetingsPage() {
  await requireModuleAccess("/meetings");
  await requireServerMemberScope();

  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const db = getDb();

  const [state, me, customers, contacts, opportunities, directory] =
    await Promise.all([
      readMeetings(),
      getCurrentUser(),
      db.customers.list().catch(() => []),
      db.contacts.list().catch(() => []),
      readOpportunities()
        .then((s) => s.opportunities)
        .catch(() => []),
      live && workspace
        ? listWorkspaceAccess(workspace).catch(() => null)
        : Promise.resolve(null),
    ]);

  /* Real workspace accounts in live mode. Never invented names on real data. */
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

  return (
    <MeetingsModule
      state={state}
      meName={me.name}
      canCreate={!(await moduleCreateRefusal("/meetings"))}
      members={members}
      customers={customers
        .map((c) => ({ id: c.id, name: c.company_name }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      contacts={contacts.map((c) => ({
        id: c.id,
        name: c.full_name,
        customerId: c.customer_id ?? null,
        title: c.job_title ?? "",
      }))}
      opportunities={opportunities.map((o) => ({
        id: o.id,
        label: o.name || `${o.customer} deal`,
        customer: o.customer,
        customerId: o.customerId ?? null,
      }))}
    />
  );
}
