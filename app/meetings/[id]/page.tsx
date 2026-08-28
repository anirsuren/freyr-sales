import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";
import { readMeetings } from "@/lib/meetings";
import { readOpportunities } from "@/lib/opportunities";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireModuleAccess("/meetings");
  await requireServerMemberScope();

  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const db = getDb();

  /* The detail page edits the meeting in place, so it needs the same lists the
     create dialog has: who the account is, who works there, what is open on
     it. */
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

  const meeting = state.meetings.find((m) => m.id === id);
  if (!meeting) notFound();

  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : ["Elena Rossi", "Omar Haddad", "Nina Kowalski", "Marcus Chen"];

  return (
    <MeetingDetail
      meeting={meeting}
      meName={me.name}
      meRole={me.role}
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
