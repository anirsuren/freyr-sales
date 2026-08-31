import { notFound } from "next/navigation";
import { ADMIN_TABS, ADMIN_TAB_TITLE, type AdminRouteTab } from "@/lib/adminTabs";
import { AdminScreen } from "../adminScreen";

export const dynamic = "force-dynamic";


/* The tab names itself in the browser tab, the way every other page does. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  const known = (ADMIN_TABS as readonly string[]).includes(tab);
  return { title: known ? `${ADMIN_TAB_TITLE[tab as AdminRouteTab]} · Admin` : "Admin" };
}

/**
 * ONE ADDRESS PER ADMIN ROOM.
 *
 * /admin/groups is NOT served from here: a static segment already exists for
 * it (groups/[id], for opening one group), and a static segment always beats
 * a dynamic sibling in Next's router. It has its own page.tsx next door that
 * renders the same screen.
 */
export default async function AdminTabRoute({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!(ADMIN_TABS as readonly string[]).includes(tab)) notFound();
  return <AdminScreen tab={tab as AdminRouteTab} />;
}
