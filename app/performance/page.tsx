import { redirect } from "next/navigation";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { performanceRoomsForViewer } from "@/lib/performanceShared";

export const metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

/**
 * /performance is a doorway, not a screen (Anir, Aug 15: "the 4 page should
 * have different / within the /performance"). Each of the four now lives at
 * its own address; this sends you to the first one you are allowed to open, so
 * old links, the sidebar and a bare typed URL all still land somewhere real.
 */
export default async function PerformanceIndex() {
  await requireModuleAccess("/performance");
  await requireServerMemberScope();
  const [state, me, role] = await Promise.all([
    readPerformance(),
    getCurrentUser(),
    getRole(),
  ]);
  const [firstRoom] = performanceRoomsForViewer(
    state,
    me.name,
    isManagerOrAdmin(role)
  );
  redirect(`/performance/${firstRoom}`);
}
