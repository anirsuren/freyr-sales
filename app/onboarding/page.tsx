import { redirect } from "next/navigation";
import { getDataMode } from "@/lib/dataMode";
import { addMockModePrefix } from "@/lib/modeUrl";
import { getRole } from "@/lib/role";
import { viewerAccessMap } from "@/lib/viewerAccess";
import { canAccessModuleWith } from "@/lib/moduleAccess";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

/**
 * /onboarding OPENS THE GUIDED TOUR. The bell's "Take the guided walkthrough"
 * row and older links land here; the tour's welcome card opens on the
 * person's home page (?onboarding=start), which is the first screen the tour
 * shows them anyway. The old tour-center page is retired: the welcome card
 * says what it said, for the stops this person actually gets.
 */
export default async function OnboardingPage() {
  const [role, access] = await Promise.all([getRole(), viewerAccessMap()]);
  const home = ["/offerings", "/solutioning", "/meetings", "/performance"].find(
    route => canAccessModuleWith(route, role, access)
  ) || "/settings";
  const target = `${home}?onboarding=start`;
  redirect(getDataMode() === "mock" ? addMockModePrefix(target) : target);
}
