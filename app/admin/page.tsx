import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * /admin IS A DOORWAY, NOT A SCREEN — the same shape /performance takes
 * (Anir, Aug 15: "the 4 page should have different / within the
 * /performance"). Each room has its own address now; this sends a bare
 * /admin, and every old link, to the first one.
 */
export default async function AdminIndex() {
  await requireModuleAccess("/admin");
  redirect("/admin/members");
}
